// tools/smoke/s49-operator.mjs — sprint 8, 8.5 (docs/plan/PLATFORM.md §4 sprint 8: "list orgs, raise an org's limits, suspend";
// tools/operator.mjs; src/index.js routeRequest's one suspension check) on the real local worker, after s48. The operator's tool
// runs as the operator runs it (its CLI, --local on the smoke's own state). An org of its own (made by SQL, as s47's is), its owner
// a key and an account passphrase (the sign-in), its one project; every key and passphrase in memory, never printed.
//   · list-orgs answers every org of the database with its plan (and its usage by the check's own definitions)
//   · raise writes a plan row of the org's own (2 projects) and points the org at it; free and team are refused, their rows as
//     ruled; set-plan moves the org to `local` (its next project lands) and back (its next project is refused plan_limit, by the
//     raised row's numbers)
//   · suspend: every door of THAT org — MCP, REST read and write, its page under its address with a bearer and with the session a
//     sign-in gave — answers ONE 403 org_suspended, nothing counted; org 1 answers; org 1's key at its address is the one 404;
//     org 1 itself is refused without --really
//   · unsuspend: every door answers at once, and nothing of the org was deleted (its rows as before the suspension)
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { smoke, expect, brief, http, mcp, d1rows, sha, ownerKey } from "./lib.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
// op(...args) -> { rc, out }: the operator's CLI on the smoke's own local state (tools/smoke.sh's SMOKE_D1_PERSIST and SMOKE_D1_CFG)
async function op(...args) {
  const { SMOKE_D1_PERSIST: persist, SMOKE_D1_CFG: cfg } = process.env;
  expect(persist && cfg, "SMOKE_D1_PERSIST and SMOKE_D1_CFG (tools/smoke.sh sets both)");
  return new Promise((done) => execFile("node", [join(ENGINE, "tools", "operator.mjs"), ...args, "--local", persist, "--config", cfg], { encoding: "utf8", maxBuffer: 1 << 24 },
    (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: `${stdout || ""}${stderr || ""}` })));
}
// until(fn, ok, ms) -> fn's last answer, asked again every second until ok(it) or ms pass (a suspension takes hold within the org
// row's one-minute cache: src/tenant.js)
async function until(fn, ok, ms = 70000) {
  const t0 = Date.now();
  let a = await fn();
  while (!ok(a) && Date.now() - t0 < ms) { await new Promise((r) => setTimeout(r, 1000)); a = await fn(); }
  return { ...a, waited: Math.round((Date.now() - t0) / 1000) };
}
const NAV = { accept: "text/html", nav: true, root: true };

smoke("operator · list-orgs answers every org with its plan; raise and set-plan move a test org and its next write obeys the new limits (free and team refused); suspend turns every door of THAT org to the one 403 while org 1 answers; unsuspend restores it, nothing deleted", async () => {
  // ---- the org (SQL, as s47's), on the harness's plan to begin with ----
  const at = new Date().toISOString(), n = d1rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  const key = randomBytes(20).toString("hex"), pass = `s49-${randomBytes(9).toString("hex")}`, email = `owner@ops${n}.local`, salt = randomBytes(16).toString("hex");
  d1rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${n}, ${q(`Ops ${TAG}`)}, ${q(at)}, ${q(at)}, 'local')`);
  d1rows(`INSERT INTO projects (key, name, active, created_at) VALUES ('o${n}--web', 'Web', 1, ${q(at)})`);
  d1rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('ops-owner-${n}', 'Ops Owner', ${q(email)}, 'owner', ${q(sha(key))}, 1, ${q(at)}, ${n})`);
  d1rows(`INSERT INTO project_seats (person_id, project_key, role, created_at) VALUES ('ops-owner-${n}', 'o${n}--web', 'owner', ${q(at)})`);
  d1rows(`UPDATE accounts SET pass_hash = ${q(pbkdf2Sync(pass, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"))}, pass_salt = ${q(salt)} WHERE email = ${q(email)}`);
  const slug = d1rows(`SELECT slug FROM org WHERE id = ${n}`)[0].slug;
  const plan = `ops-${TAG}`;
  const ruled = () => JSON.stringify(d1rows("SELECT plan, people, projects, items_month, calls_day, burst_minute, storage_bytes FROM plan_limits WHERE plan IN ('free', 'team') ORDER BY plan"));
  const ruled0 = ruled();

  // ---- list-orgs: every org, its plan ----
  const lo = await op("list-orgs", "--json");
  let listed = null; try { listed = JSON.parse(lo.out.slice(lo.out.indexOf("{"))); } catch { listed = null; }
  const truth = d1rows("SELECT id, plan FROM org ORDER BY id");
  const mine = listed && listed.orgs.find((o) => o.id === n);
  expect(lo.rc === 0 && listed && listed.orgs.length === truth.length && truth.every((t) => listed.orgs.some((o) => o.id === Number(t.id) && o.plan === t.plan))
    && mine && mine.slug === slug && mine.shown && mine.shown.limits && mine.shown.limits.projects.used === 1 && listed.orgs.some((o) => o.id === 1 && /^org 1/.test(o.operating || "")),
    () => `list-orgs: rc ${lo.rc}, ${listed ? listed.orgs.length : "no JSON"} orgs (the database holds ${truth.length}); org ${n}: ${brief(mine)}; ${lo.out.slice(0, 300)}`);

  // ---- raise (the org's own row: 2 projects), free and team refused ----
  const rf = await op("raise", "--org", String(n), "--plan", "free", "--projects", "99"), rt = await op("raise", "--org", String(n), "--plan", "team", "--people", "999");
  const ra = await op("raise", "--org", String(n), "--plan", plan, "--projects", "2");
  const onRaised = d1rows(`SELECT o.plan, l.projects, l.people FROM org o JOIN plan_limits l ON l.plan = o.plan WHERE o.id = ${n}`)[0] || {};
  expect(rf.rc === 1 && /ruled plan/.test(rf.out) && rt.rc === 1 && ruled() === ruled0 && ra.rc === 0 && onRaised.plan === plan && onRaised.projects === 2 && onRaised.people === 50,
    () => `raise: free ${rf.rc}, team ${rt.rc}, ${plan} ${ra.rc} (${ra.out.slice(0, 200)}); the org now ${brief(onRaised)}; free/team ${ruled() === ruled0 ? "as ruled" : "CHANGED"}`);
  const two = await mcp(key, "create_project", { key: "two", name: "Two" });
  // ---- set-plan: to local (the next project lands), back to the raised row (the next one is refused by its numbers) ----
  const sl = await op("set-plan", "--org", String(n), "--plan", "local");
  const three = await mcp(key, "create_project", { key: "three", name: "Three" });
  const sb = await op("set-plan", "--org", String(n), "--plan", plan);
  const four = await mcp(key, "create_project", { key: "four", name: "Four" });
  expect(!two.isError && two.out.planWarning && two.out.planWarning.limit === "projects" && sl.rc === 0 && !three.isError && sb.rc === 0
    && four.isError && four.out.error === "plan_limit" && four.out.limit === "projects" && four.out.plan === plan && four.out.used === 3 && four.out.allowed === 2,
    () => `the 2nd project ${brief(two.out)}; set-plan local ${sl.rc}; the 3rd ${brief(three.out)}; set-plan back ${sb.rc}; the 4th ${brief(four.out)}`);

  // ---- a sign-in's session (the account's passphrase, at the root, as a browser), before the suspension ----
  const li = await http("POST", "/login", { form: { email, password: pass, web: "1" }, root: true });
  const cookie = (li.setCookie.match(/__Host-ar_session=([^;]+)/) || [])[1] || "";
  const page0 = await http("GET", `/${slug}/home`, { cookie, ...NAV });
  expect(cookie && page0.status === 200, () => `the sign-in before the suspension: ${li.status} -> ${li.locationRaw}, its page ${page0.status}`);
  const rows = () => JSON.stringify(d1rows(`SELECT (SELECT COUNT(*) FROM transmission WHERE org = ${n}) AS tx, (SELECT COUNT(*) FROM projects WHERE org = ${n}) AS projects, ` +
    `(SELECT COUNT(*) FROM people WHERE org = ${n}) AS people, (SELECT COUNT(*) FROM previews WHERE project LIKE 'o${n}--%') AS previews, (SELECT plan FROM org WHERE id = ${n}) AS plan`)[0]);
  const kept = rows();

  // ---- suspend: org 1 refused without --really; THIS org's doors, one 403 ----
  const s1 = await op("suspend", "--org", "1");
  const su = await op("suspend", "--org", String(n));
  const m = await until(() => http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: 4901, method: "tools/call", params: { name: "whoami", arguments: {} } } }), (r) => r.status === 403);
  const calls0 = JSON.stringify(d1rows(`SELECT calls_day FROM org_usage WHERE org = ${n}`));
  const rest = await http("GET", "/whoami", { key }), write = await http("POST", "/preview", { key, body: { project: `o${n}--web`, items: [{ contribution: { lane: "leader", kind: "note", what: `during ${TAG}`, why: "x" } }] } });
  const pageB = await http("GET", `/${slug}/home`, { key, ...NAV }), pageC = await http("GET", `/${slug}/home`, { cookie, ...NAV });
  const calls1 = JSON.stringify(d1rows(`SELECT calls_day FROM org_usage WHERE org = ${n}`));
  const org1 = await mcp(ownerKey, "whoami", {}), cross = await http("GET", `/${slug}/home`, { key: ownerKey, ...NAV });
  const one = (r) => r.status === 403 && r.json && r.json.error === "org_suspended" && /Ask the operator/.test(r.json.note || "");
  expect(s1.rc === 1 && /--really/.test(s1.out) && su.rc === 0 && one(m) && one(rest) && one(write) && pageB.status === 403 && /This org is suspended/.test(pageB.raw)
    && pageC.status === 403 && /This org is suspended/.test(pageC.raw) && calls0 === calls1 && !org1.isError && cross.status === 404,
    () => `org 1 bare ${s1.rc}; suspend ${su.rc} (${su.out.slice(0, 160)}); after ${m.waited}s: MCP ${m.status} ${brief(m.json)}, REST ${rest.status}, write ${write.status}, page (bearer) ${pageB.status}, page (session) ${pageC.status}; counted ${calls0} -> ${calls1}; org 1 ${org1.isError ? "refused" : "answers"}; org 1's key at its address ${cross.status}`);
  const waited = m.waited;

  // ---- unsuspend: at once, nothing deleted ----
  const un = await op("unsuspend", "--org", String(n));
  const back = await mcp(key, "whoami", {}), backRest = await http("GET", "/whoami", { key }), backPage = await http("GET", `/${slug}/home`, { cookie, ...NAV });
  const after = rows();
  expect(un.rc === 0 && !back.isError && back.out.id === `ops-owner-${n}` && backRest.status === 200 && backPage.status === 200 && after === kept,
    () => `unsuspend ${un.rc}: whoami ${brief(back.out)}, REST ${backRest.status}, page ${backPage.status}; rows ${kept} -> ${after}`);
  return `list-orgs: ${listed.orgs.length} orgs with their plans; raise ${plan} (projects 2; free/team refused, as ruled); set-plan local -> the 3rd project lands, back -> the 4th plan_limit 3/2; ` +
    `suspend: MCP, REST, a write (not counted), its page by bearer and by session — one 403 org_suspended (took hold after ${waited}s), org 1 answers, its key there 404, org 1 refused without --really; unsuspend: at once, rows as before`;
});
