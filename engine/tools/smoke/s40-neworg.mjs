// tools/smoke/s40-neworg.mjs — sprint 7, 7.3 (docs/plan/PLATFORM.md §2 items 1, 2, 6, 8 and 9; migrate-072; src/orgs.js
// createOrg, POST /orgs, GET /orgs/new): create an org on the real local worker. The account is made as a person makes one: the
// operator's tool allows the email (its CLI, --local on the smoke's own state; the code read from its output, held in memory),
// then POST /signup. Every key is held in memory, never printed. Runs after s39.
//   · an account signed up by the operator's code creates an org: the org row with its path name and its founder, the owner seat
//     joined to the account, the first project o<id>--<slug>; a form creation answers the made page with the key once, and its
//     session (sprint 21, 21.P D17: s66 walks it into the org)
//   · the new owner's key files a contribution through /mcp into the new org's project
//   · refused, nothing written: a reserved name, a taken name, a bad path name, a second org for the same account, a wrong
//     account passphrase, a seat's secret instead of the account passphrase
//   · Control's add-person in the NEW org joins an existing account by its email (an org-1 person) and makes a new email's
//     account with no passphrase (7.2's code then gives it one); set-password on the joined seat refused (account_elsewhere)
//   · org 1 and the new org blind to each other: the cross-org attack (tools/attack-xorg.mjs attack()) both ways, as each org's
//     owner and member — 0 rows read or written, 0 5xx
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, ownerKey, sha, d1rows as rows, BASE } from "./lib.mjs";
import { attack, canary } from "../attack-xorg.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
// the door, retried once when the socket failed (this case reads the local D1 between calls: the s37 scar), and once after the
// address's window when the flood filter (LOGIN_LIMIT: /login, /signup and /orgs share one budget) refused: that proves nothing
const http1 = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
const http = async (method, path, o) => {
  let r = await http1(method, path, o);
  if (r.status === 429 && r.json && r.json.error === "too_many_attempts_ip") { await new Promise((ok) => setTimeout(ok, 61000)); r = await http1(method, path, o); }
  return r;
};
// the answer without its key (a failure message never prints one)
const bare = (j) => brief(j && typeof j === "object" ? { ...j, key: j.key ? "<key>" : undefined } : j);
async function op(...args) {
  const { SMOKE_D1_PERSIST: persist, SMOKE_D1_CFG: cfg } = process.env;
  expect(persist && cfg, "SMOKE_D1_PERSIST and SMOKE_D1_CFG (tools/smoke.sh sets both)");
  const { rc, out } = await new Promise((done) => execFile("node", [join(ENGINE, "tools", "operator.mjs"), ...args, "--local", persist, "--config", cfg], { encoding: "utf8", maxBuffer: 1 << 24 },
    (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: `${stdout || ""}${stderr || ""}` })));
  const code = (out.match(/^ {2}code: (\S+)$/m) || [])[1] || null;
  return { rc, code, out: code ? out.split(code).join("<code>") : out };
}
// account(email, pass) — the operator allows the email, the person signs up with its code and a passphrase
async function account(email, pass) {
  const a = await op("allow", "--email", email);
  expect(a.rc === 0 && a.code, () => `operator allow ${email}: rc ${a.rc} ${a.out.slice(0, 200)}`);
  const r = await http("POST", "/signup", { body: { email, code: a.code, password: pass, device: "smoke-s40" } });
  expect(r.status === 200 && r.json.account === "created", () => `the sign-up of ${email}: ${r.status} ${bare(r.json)}`);
}
const create = (body) => http("POST", "/orgs", { body });
const settle = () => new Promise((r) => setTimeout(r, 20));
const N = {};   // what the first case leaves for the next ones

smoke("neworg · an account signed up by the operator's code creates an org: its row with its path name and founder, the owner seat joined to the account, the first project o<id>--<slug>; a form creation shows the key once and signs in", async () => {
  N.email = `neworg-${TAG}@smoke.local`; N.pass = `smoke-neworg-pass-${TAG}`; N.slug = `neworg-${TAG}`;
  await account(N.email, N.pass);
  const r = await create({ email: N.email, password: N.pass, name: `Neworg ${TAG}`, slug: N.slug, project: "web", you: "Neworg Owner" });
  await settle();
  N.org = r.json && r.json.org && r.json.org.id; N.key = r.json && r.json.key; N.project = r.json && r.json.project && r.json.project.key;
  const acc = rows(`SELECT id FROM accounts WHERE email = ${q(N.email)}`)[0] || {};
  const org = rows(`SELECT id, name, slug, created_by_account, created_by, home FROM org WHERE id = ${Number(N.org) || 0}`)[0] || {};
  const seats = rows(`SELECT id, role, email, account_id, key_hash, org FROM people WHERE org = ${Number(N.org) || 0}`);
  const proj = rows(`SELECT key, org, slug, active FROM projects WHERE org = ${Number(N.org) || 0}`);
  expect(r.status === 200 && N.org >= 2 && N.project === `o${N.org}--web` && org.slug === N.slug && org.created_by_account === acc.id && org.home === N.project
    && seats.length === 1 && seats[0].role === "owner" && seats[0].account_id === acc.id && seats[0].email === N.email && seats[0].key_hash === sha(N.key || "") && org.created_by === seats[0].id
    && proj.length === 1 && proj[0].key === N.project && proj[0].org === N.org && proj[0].slug === "web",
    () => `the creation: ${r.status} ${bare(r.json)}; org ${brief(org)}; seats ${brief(seats.map((x) => ({ ...x, key_hash: x.key_hash === sha(N.key || "") })))}; projects ${brief(proj)}`);
  // sprint 8 (8.2f, main's ruling): the org is made free, as on live; the harness then raises it to the local-only plan, as the
  // operator raises an org by hand, so the cases built on it (its walk, its attack) never trip free's limits (s46 tests free)
  rows(`UPDATE org SET plan = 'local' WHERE id = ${Number(N.org) || 0}`);
  // a form: the made page (the key once, no Location; since 21.P D17 its session cookie: s66 walks it), from a second account
  const e2 = `neworg-form-${TAG}@smoke.local`;
  await account(e2, N.pass);
  // paced as the case's http is: one retry after the address's window when the flood filter refused (that proves nothing)
  const formPost = () => fetch(`${BASE}/orgs`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: new URLSearchParams({ email: e2, password: N.pass, name: `Neworg Form ${TAG}`, slug: `neworg-form-${TAG}`, web: "1" }).toString() });
  let f = await formPost();
  if (f.status === 429) { await new Promise((ok) => setTimeout(ok, 61000)); f = await formPost(); }
  const t = await f.text();
  const fk = (/data-secret="owner-key">([0-9a-f]{40})</.exec(t) || [])[1];
  await settle();
  const fseat = fk ? rows(`SELECT org FROM people WHERE key_hash = ${q(sha(fk))}`)[0] || {} : {};
  expect(f.status === 200 && fk && fseat.org > N.org && /^__Host-ar_session=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7776000$/.test(f.headers.get("set-cookie") || "") && !f.headers.get("location") && f.headers.get("cache-control") === "no-store",
    () => `the form creation: ${f.status}, a key ${!!fk}, its seat's org ${fseat.org}, cookie ${!!f.headers.get("set-cookie")}, location ${f.headers.get("location")}`);
  const page = await fetch(`${BASE}/orgs/new`, { headers: { accept: "text/html" } });
  const pt = await page.text();
  expect(page.status === 200 && /action="\/orgs"/.test(pt) && /name="slug"/.test(pt), () => `GET /orgs/new ${page.status}`);
  return `org ${N.org} (${N.slug}) made by POST /orgs: founded by the account, its owner seat the account's (the key's hash), its project ${N.project}; a form creation answered the made page with the key once and its session cookie (org ${fseat.org}); GET /orgs/new 200`;
});

smoke("neworg · the new owner's key files a contribution through /mcp into the new org's project", async () => {
  expect(N.key, "the creation case did not run");
  const mcp = async (name, args) => {
    const r = await http("POST", "/mcp", { key: N.key, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    let out = null; try { out = JSON.parse(r.json.result.content[0].text); } catch { out = r.json; }
    return { out, isError: !!(r.json && r.json.result && r.json.result.isError) };
  };
  const items = [{ contribution: { lane: "leader", kind: "note", what: `The first note of neworg ${TAG}`, why: "a new org files through the one door" } }];
  const pv = await mcp("preview", { items });
  const f = pv.out && pv.out.previewId ? await mcp("file_contribution", { previewId: pv.out.previewId, items }) : { out: pv.out, isError: true };
  await settle();
  const tx = rows(`SELECT id, project, org FROM transmission WHERE org = ${Number(N.org)}`);
  const me = (await http("GET", "/whoami", { key: N.key })).json || {};
  expect(!f.isError && tx.length === 1 && tx[0].project === N.project && tx[0].org === N.org && me.role === "owner",
    () => `the filing: ${brief(f.out)}; rows ${brief(tx)}; whoami ${brief(me.role)}`);
  return `preview then file_contribution through /mcp: ${tx[0].id} in ${N.project} (org ${N.org}); whoami: owner`;
});

smoke("neworg · refused, nothing written: a reserved name, a taken name, a bad path name, a second org for one account, a wrong account passphrase, a seat's secret", async () => {
  expect(N.key, "the creation case did not run");
  const e3 = `neworg-other-${TAG}@smoke.local`;
  await account(e3, N.pass);
  // a seat's secret: org 1's owner key (its seat secret, S-019) for org 1's owner's account
  const owner1 = ((await http("GET", "/whoami", { key: ownerKey })).json || {}).email;
  const snap = () => JSON.stringify(rows("SELECT (SELECT COUNT(*) || ':' || group_concat(id || slug, ',') FROM org) AS o, (SELECT COUNT(*) FROM people) AS p, (SELECT COUNT(*) FROM projects) AS j, " +
    "(SELECT group_concat(id || COALESCE(pass_hash, ''), ',') FROM accounts) AS a, (SELECT COUNT(*) FROM tokens) AS t"));
  const s0 = snap();
  const tries = [
    ["a reserved name", { email: e3, password: N.pass, name: "Reserved", slug: "login" }, 409, "org_name_reserved"],
    ["another reserved name", { email: e3, password: N.pass, name: "Reserved", slug: "mcp" }, 409, "org_name_reserved"],
    ["a taken name", { email: e3, password: N.pass, name: "Taken", slug: N.slug }, 409, "org_name_taken"],
    ["a bad path name", { email: e3, password: N.pass, name: "Bad", slug: "Bad--Name" }, 422, "bad_org"],
    ["a second org for one account", { email: N.email, password: N.pass, name: "Second", slug: `neworg-second-${TAG}` }, 409, "org_limit"],
    ["a wrong account passphrase", { email: e3, password: "not-the-passphrase", name: "Wrong", slug: `neworg-wrong-${TAG}` }, 401, "invalid_account"],
    ["a seat's secret instead of the account passphrase", { email: owner1, password: ownerKey, name: "Seat", slug: `neworg-seat-${TAG}` }, 401, "invalid_account"],
  ];
  const seen = [];
  for (const [what, body, status, error] of tries) { const r = await create(body); seen.push(r.status === status && r.json && r.json.error === error ? null : `${what}: ${r.status} ${r.json && r.json.error}`); }
  await settle();
  expect(seen.every((x) => x === null) && snap() === s0, () => `${seen.filter(Boolean).join("; ") || "every answer right"}; rows ${snap() === s0 ? "unchanged" : "CHANGED"}`);
  return `${tries.length} refusals, each its own answer (409 org_name_reserved twice, 409 org_name_taken, 422 bad_org, 409 org_limit, 401 invalid_account twice: a wrong passphrase and org 1's owner's seat secret); orgs, people, projects, accounts and tokens unchanged`;
});

smoke("neworg · Control's add-person in the NEW org joins an existing account by its email and makes a new email's account with no passphrase; 7.2's code gives it one; set-password on the joined seat is refused", async () => {
  expect(N.key, "the creation case did not run");
  const owner1 = ((await http("GET", "/whoami", { key: ownerKey })).json || {}).email;
  const add = async (name, email) => { const r = await http("POST", "/control", { key: N.key, form: { action: "add-person", name, email } }); return { status: r.status, key: (r.text.match(/API key\): ([0-9a-f]{40})/) || [])[1] }; };
  const a1 = await add("Org One Owner (here too)", owner1);
  const fresh = `neworg-hire-${TAG}@smoke.local`;
  const a2 = await add("A New Hire", fresh);
  await settle();
  const acc1 = rows(`SELECT id FROM accounts WHERE email = ${q(String(owner1).toLowerCase())}`);
  const s1 = rows(`SELECT id, org, account_id FROM people WHERE lower(email) = ${q(String(owner1).toLowerCase())} ORDER BY org`);
  const hire = rows(`SELECT p.org, a.pass_hash FROM people p JOIN accounts a ON a.id = p.account_id WHERE p.email = ${q(fresh)}`);
  expect(a1.key && a2.key && acc1.length === 1 && s1.length >= 2 && s1.every((x) => x.account_id === acc1[0].id) && s1.some((x) => x.org === N.org) && hire.length === 1 && hire[0].org === N.org && hire[0].pass_hash === null,
    () => `add-person: ${a1.status}/${a2.status}; org 1's owner's seats ${brief(s1)} (accounts ${acc1.length}); the hire ${brief(hire)}`);
  const joined = s1.find((x) => x.org === N.org);
  const sp = await http("POST", "/control", { key: N.key, form: { action: "set-password", personId: joined.id, password: "the-new-org-sets-it" } });
  const c = await op("allow", "--email", fresh);
  const su = c.code ? await http("POST", "/signup", { body: { email: fresh, code: c.code, password: `smoke-hire-pass-${TAG}`, device: "smoke-s40" } }) : { status: 0, json: null };
  expect(/account_elsewhere/.test(sp.text) && su.status === 200 && su.json.account === "set", () => `set-password ${sp.status} ${/account_elsewhere/.test(sp.text)}; the hire's sign-up ${su.status} ${su.json && su.json.account}`);
  return `org 1's owner's email added in org ${N.org}: the same account (seats in ${s1.map((x) => x.org).join(" and ")}); a new email: an account with no passphrase, then 7.2's code set it (account set); set-password on the joined seat refused (account_elsewhere)`;
});

smoke("neworg · org 1 and the new org are blind to each other: the cross-org attack both ways, as each org's owner and member — 0 rows read or written, 0 5xx", async () => {
  expect(N.key, "the creation case did not run");
  const { SMOKE_D1_DB: db, SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  const query = (sql) => new Promise((done, fail) => execFile("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfg, "--local", "--persist-to", persist, "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 1 << 28 }, (e, out, err) => {
      if (e) return fail(new Error(`D1: ${sql.slice(0, 100)} — ${String(err || out || e).slice(0, 300)}`));
      try { done((JSON.parse(out)[0] || {}).results || []); } catch { fail(new Error(`D1 answer: ${String(out).slice(0, 200)}`)); }
    }));
  const call = async (method, path, { headers = {}, body } = {}) => {
    const go = async () => { const r = await fetch(BASE + path, { method, headers, body, redirect: "manual" }); return { status: r.status, text: method === "HEAD" ? "" : await r.text(), location: r.headers.get("location") || "" }; };
    try { return await go(); } catch { await new Promise((r) => setTimeout(r, 50)); return go(); }
  };
  const facts = async (org) => {
    const r = (await query(`SELECT (SELECT json_group_array(id) FROM transmission WHERE org = ${org}) AS tx, (SELECT json_group_array(id) FROM artifacts WHERE org = ${org}) AS files, ` +
      `(SELECT json_group_array(id) FROM people WHERE org = ${org}) AS people, (SELECT json_group_array(key) FROM projects WHERE org = ${org}) AS keys, ` +
      `(SELECT json_group_array(hash) FROM k_renders WHERE project IN (SELECT key FROM projects WHERE org = ${org})) AS hashes, ` +
      `(SELECT json_group_array(id) FROM previews WHERE project IN (SELECT key FROM projects WHERE org = ${org})) AS previews`))[0] || {};
    const J = (x) => JSON.parse(x || "[]");
    return { tx: J(r.tx), files: J(r.files), people: J(r.people), keys: J(r.keys), hashes: J(r.hashes), previews: J(r.previews) };
  };
  // org 1 walks on a fresh project of its own, with a member seated there; the new org on its first project, its member seated there
  const p1 = `neworg-${TAG}`;
  const c1 = await http("POST", "/control", { key: ownerKey, form: { action: "add-project", key: p1, name: `Neworg ${TAG}` } });
  const m1 = await http("POST", "/control", { key: ownerKey, form: { action: "add-person", name: `Neworg Walker ${TAG}`, email: `neworg-walker-${TAG}@smoke.local`, projectKey: p1, seatsChosen: "1" } });
  const m2 = await http("POST", "/control", { key: N.key, form: { action: "add-person", name: `Neworg Member ${TAG}`, email: `neworg-member-${TAG}@smoke.local`, projectKey: N.project, seatsChosen: "1" } });
  const k1 = (m1.text.match(/API key\): ([0-9a-f]{40})/) || [])[1], k2 = (m2.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(c1.status < 500 && k1 && k2, () => `the walkers: project ${c1.status}, org 1's member ${m1.status}, the new org's member ${m2.status}`);
  const r = await attack({ call, query, facts }, { a: { org: 1, word: canary("nwa"), owner: ownerKey, member: k1, project: p1 }, b: { org: N.org, word: canary("nwb"), owner: N.key, member: k2, project: N.project }, surfaces: false });   // 7.5b: the sign-in surfaces run in s36b-xorg
  const bad = [...r.findings, ...r.fivexx];
  expect(!bad.length, () => `${bad.length} finding(s) in ${r.calls} calls: ${bad.slice(0, 8).join(" | ")}`);
  return `${r.calls} calls (${r.answered} answered 2xx), both directions, owner and member: each victim unchanged (${r.directions.map((d) => `org ${d.victim}: ${d.rows} rows in ${d.tables} tables`).join(", ")}); 0 rows read, 0 written, 0 5xx [${r.ms} ms]`;
});
