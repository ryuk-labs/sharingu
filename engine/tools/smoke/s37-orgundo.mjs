// tools/smoke/s37-orgundo.mjs — sprint 6, 6.5 (one org's undo; PLATFORM.md §1: Time Travel restores the whole database, §5: the
// undo for one org is the per-org restore). The operator's tool, tools/org-undo.mjs, run as the operator runs it (its CLI, on the
// smoke's own local D1 and bucket beside the running worker: nothing reaches Cloudflare), on the second org s33 seeded (s.org2).
// Runs LAST: its final case deletes org 2.
//   · org 2 gains every kind of row through the door (a goal tree, a question, a check, its grade and a change after it — a stale
//     mark —, a follow-up naming its parent, a decision with its audit row, a version) on top of what s33–s36 filed (people, a
//     render, files, a session report, backups); the export holds its rows without a credential, its render and inbox bodies,
//     and leaves its backups
//   · restored as org 3 BESIDE org 2: every contribution renumbered on its day, every taken id fresh, its projects o3--<slug>;
//     the tool's verify is green (every table and object back modulo the recorded remaps, no old id left, no foreign key across
//     the wall, the derived tables equal org 2's); org 3's owner signs in with the fresh key, reads its pages, its contributions
//     (as many as org 2's), its render body and its file byte for byte — and none of org 2's; org 1 and org 2 exactly as before
//   · delete: refused for org 1, without --yes-delete, with a wrong name, without the export, and after a write since the export;
//     then org 2 leaves: 0 rows in every table, its search rows 0, its prefix empty, its owner's key refused; org 1 and org 3
//     exactly as before (the tool's own count, table by table), org 3 still reads its rows
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { smoke, expect, brief, s, http, mcp, html, kwrite, contribute, contributions, ownerKey, d1rows } from "./lib.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TAG = String(Date.now()).slice(-7);
const P2 = "o2--shop", P3 = "o3--shop";
// the tool's CLI on the smoke's own local state (tools/smoke.sh's SMOKE_D1_PERSIST and SMOKE_D1_CFG): { rc, json, out }. ASYNC on
// purpose: a run takes seconds, and a synchronous wait would hold the event loop while the worker closes this process's idle
// keep-alive socket, so the next door call would take the dead socket (ECONNRESET)
async function tool(...args) {
  const { SMOKE_D1_PERSIST: persist, SMOKE_D1_CFG: cfg } = process.env;
  expect(persist && cfg, "SMOKE_D1_PERSIST and SMOKE_D1_CFG (tools/smoke.sh sets both)");
  const { rc, out } = await new Promise((done) => execFile("node", [join(ENGINE, "tools", "org-undo.mjs"), ...args, "--local", persist, "--config", cfg], { encoding: "utf8", maxBuffer: 1 << 26 },
    (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: e ? `${stdout || ""}${stderr || ""}` : stdout })));
  let json = null; try { json = JSON.parse(out.slice(out.indexOf("{"))); } catch { json = null; }
  return { rc, json, out };
}
// settle() — one turn of the event loop after a synchronous wait (lib.mjs d1rows runs wrangler synchronously): the worker may have
// closed this process's idle keep-alive socket meanwhile, and the turn lets the close land before the next door call
const settle = () => new Promise((r) => setTimeout(r, 20));
const workDir = () => join(dirname(String(process.env.SMOKE_D1_PERSIST)), "orgundo");
const plan = async (org) => { const r = await tool("plan", "--org", String(org)); expect(r.rc === 0 && r.json, () => `plan --org ${org}: ${r.rc} ${r.out.slice(0, 300)}`); return r.json; };
// what an org holds, as the tool counts it: its rows table by table, its search rows, its objects
const holds = (p) => JSON.stringify({ rows: p.rows, byTable: p.byTable, search: p.searchIndex, objects: p.objects });
const keyOf = (file) => (readFileSync(file, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1];

smoke("orgundo · org 2 gains every kind of row through the door; its export holds them without a credential, its bodies, not its backups", async () => {
  expect(s.org2 && s.org2.key && s.orgr2, "s33–s36 (the second org, its render, files and backups) must run first");
  const k = s.org2.key;
  const w = await kwrite(k, { project: P2, ops: [
    { kind: "goal", op: "upsert", data: { id: "undo-root", parent: "open-the-shop", title: `Undo root ${TAG}`, dimensions: ["code"] } },
    { kind: "goal", op: "upsert", data: { id: "undo-child", parent: "undo-root", title: "Undo child", dimensions: ["code"] } },
    { kind: "question", op: "upsert", data: { qid: "Q-undo-1", question: "Keep the undo?", status: "open", options: [{ what: "yes" }, { what: "no" }] } },
    { kind: "check", op: "upsert", data: { id: "AC.undo.1", title: "the orgr2 screen shows", refs: ["screen:orgr2"] } }] });
  expect(!w.isError && w.out.written === 4, () => `org 2's knowledge: ${brief(w.out)}`);
  const g = await mcp(k, "submit_grade", { project: P2, checkId: "AC.undo.1", verdict: "proven", proof: "GET /orgr2 -> 200 (smoke s37)" });
  expect(!g.isError, () => `org 2's grade: ${brief(g.out)}`);
  const c1 = await contribute(k, { project: P2, lane: "code", kind: "pr", what: `orgundo: the orgr2 screen changed ${TAG}`, why: "after its grade: a stale mark", touches: "screen:orgr2", proof: "npm test -> exit 0" });
  const c2 = await contribute(k, { project: P2, lane: "leader", kind: "note", what: "orgundo: a follow-up", why: "names its parent", parent: c1.out && c1.out.id });
  const c3 = await contribute(k, { project: P2, lane: "leader", kind: "grant", what: "orgundo: grant the export", why: "the owner decides", touches: "screen:orgr2" });
  expect(!c1.isError && !c2.isError && !c3.isError && c1.out.id && c2.out.id && c3.out.id, () => `org 2's contributions: ${[c1, c2, c3].map((c) => JSON.stringify({ err: c.isError, verdict: c.verdict, id: c.out && c.out.id, error: c.out && (c.out.error || c.out.note), refusal: c.preview && c.preview.items && c.preview.items[0] && (c.preview.items[0].refusal || c.preview.items[0].needs || c.preview.items[0].reasons) }).slice(0, 400)).join(" | ")}`);
  const d = await mcp(k, "decide_contribution", { id: c3.out.id, verdict: "approve", note: "ok" });
  expect(!d.isError && d.out.decision === "approve", () => `org 2's decision: ${brief(d.out)}`);
  const v = await mcp(k, "publish_version", { project: P2, title: "orgundo v1" });
  expect(!v.isError, () => `org 2's version: ${brief(v.out)}`);
  const stale = d1rows(`SELECT changed_by FROM k_node_stale WHERE project = '${P2}'`), audit = d1rows("SELECT COUNT(*) AS n FROM approval_audit WHERE org = 2")[0].n;
  expect(stale.some((r) => r.changed_by === c1.out.id) && audit >= 1, () => `org 2's stale mark ${brief(stale)}, audit rows ${audit}`);
  s.orgundo = { dir: workDir(), c: [c1.out.id, c2.out.id, c3.out.id], before1: await plan(1), before2: await plan(2) };
  rmSync(s.orgundo.dir, { recursive: true, force: true });
  mkdirSync(s.orgundo.dir, { recursive: true });
  const ex = join(s.orgundo.dir, "export");
  const r = await tool("export", "--org", "2", "--out", ex);
  expect(r.rc === 0 && r.json, () => `export: ${r.rc} ${r.out.slice(0, 400)}`);
  const E = JSON.parse(readFileSync(join(ex, "export.json"), "utf8"));
  const want = { people: d1rows("SELECT COUNT(*) AS n FROM people WHERE org = 2")[0].n, transmission: d1rows("SELECT COUNT(*) AS n FROM transmission WHERE org = 2")[0].n, k_goals: d1rows("SELECT COUNT(*) AS n FROM k_goals WHERE project IN (SELECT key FROM projects WHERE org = 2)")[0].n };   // every project of org 2 (s36b-xorg seeds a second)
  const creds = E.dump.tables.people.some((p) => ["key_hash", "pass_hash", "pass_salt", "email"].some((c) => c in p));
  const roots = (re) => E.objects.filter((x) => re.test(x.key)).length;
  expect(E.counts.people === want.people && E.counts.transmission === want.transmission && E.counts.k_goals === want.k_goals && !creds && !E.dump.tables.tokens
    && roots(/^renders\/o2--shop\//) >= 1 && roots(/^inbox\/artifacts\//) >= 2 && roots(/^inbox\/handoffs\//) >= 1 && E.left["backups/"] >= 1,
    () => `export: counts ${brief(E.counts)} vs ${brief(want)}; credentials ${creds}; objects ${brief(E.objects.map((x) => x.key))}; left ${brief(E.left)}`);
  s.orgundo.ex = ex;
  s.orgundo.E = E;
  return `org 2 filed a goal tree, a question, a check, its grade, a change after it (stale, by ${c1.out.id}), a follow-up, a decided grant and a version; exported: ${r.json.rows} rows (${want.transmission} contributions, ${want.people} people), no credential, ${E.objects.length} bodies (renders, files, a report), ${E.left["backups/"]} backups left`;
});

smoke("orgundo · restored as org 3 beside org 2: renumbered, rekeyed, verified; org 3's owner reads its own pages and rows, none of org 2's; org 1 and org 2 as before", async () => {
  let stage = "start";
  try { return await restoreCase((x) => { stage = x; }); } catch (e) { throw new Error(`${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ""} at ${stage}`); }
});
async function restoreCase(at) {
  const u = s.orgundo;
  expect(u && u.ex, "the export case must run first");
  const credsFile = join(u.dir, "o3.creds");
  const r = await tool("restore", "--from", u.ex, "--owner-creds-out", credsFile);
  expect(r.rc === 0 && r.json && r.json.to === 3, () => `restore: ${r.rc} ${r.out.slice(0, 400)}`);
  const rec = JSON.parse(readFileSync(r.json.record, "utf8"));
  const ids = new Map(rec.maps.ids);
  const tx2 = u.E.dump.tables.transmission.map((t) => t.id);
  expect(tx2.every((t) => ids.has(t) && ids.get(t).slice(0, 11) === t.slice(0, 11) && ids.get(t) !== t) && ids.has(s.org2.id) && new Map(rec.maps.keys).get(P2) === P3,
    () => `the remaps: ${brief(rec.maps)}`);
  const v = await tool("verify", "--from", u.ex, "--url", process.env.SMOKE_URL, "--creds", credsFile);
  expect(v.rc === 0 && v.json && v.json.ok, () => `verify: ${v.rc} ${brief(v.json && v.json.checks.filter((c) => !c.ok))} ${v.out.slice(0, 300)}`);
  const k3 = keyOf(credsFile);
  at("whoami");
  const who = await mcp(k3, "whoami");
  expect(!who.isError && who.out.id === rec.owner, () => `org 3's owner signs in: ${brief(who.out)}`);
  const pages = [];
  for (const p of ["/home", `/map?project=${P3}`, `/goals?project=${P3}`, `/decisions?project=${P3}`, `/audit?project=${P3}`, "/control"]) {
    at(p);
    const h = await html(p, k3);
    pages.push(`${p.split("?")[0]} ${h.status}`);
    expect(h.status === 200, () => `GET ${p} as org 3's owner: ${h.status} ${h.location || ""}`);
  }
  at("contributions");
  const goals = await html(`/goals?project=${P3}`, k3);
  const mine = await contributions(k3, P3), theirs = await contributions(s.org2.key, P2);
  const newIds = new Set(mine.map((x) => x.id));
  expect(goals.text.includes("Undo root") && mine.length === theirs.length && mine.length > 0 && theirs.every((x) => newIds.has(ids.get(x.id))),
    () => `org 3 reads ${mine.length} contributions (org 2: ${theirs.length}); goals page has the root: ${goals.text.includes("Undo root")}`);
  const { hash, art3, art2 } = d1rows(`SELECT (SELECT hash FROM k_renders WHERE project = '${P3}' AND screen = 'screen:orgr2' AND format = 'html') AS hash, ` +
    "(SELECT id FROM artifacts WHERE org = 3 AND title = 'orgr2 page') AS art3, (SELECT id FROM artifacts WHERE org = 2 AND title = 'orgr2 page') AS art2")[0] || {};
  await settle();
  const body = async (path, key) => { const x = await fetch(process.env.SMOKE_URL + path, { headers: { authorization: "Bearer " + key } }); return { status: x.status, text: await x.text() }; };
  at("bodies");
  const [rb3, rb2, f3, f2] = [await body(`/render/${hash}?project=${P3}`, k3), await body(`/render/${hash}?project=${P2}`, s.org2.key), await body(`/artifact/${art3}`, k3), await body(`/artifact/${art2}`, s.org2.key)];
  expect(rb3.status === 200 && rb3.text === rb2.text && rb3.text.includes("ORG2-RENDER") && f3.status === 200 && f3.text === f2.text && f3.text.includes("ORG2-FILE"),
    () => `bodies: render ${rb3.status}/${rb2.status}, file ${f3.status}/${f2.status}`);
  at("cross");
  const cross = [await mcp(k3, "read", { project: P2, kind: "goal" }), await body(`/render/${hash}?project=${P2}`, k3), await body(`/artifact/${art2}`, k3), await mcp(k3, "read", { ref: u.c[0], project: P2 })];
  expect(cross[0].isError || (cross[0].out && cross[0].out.error), () => `org 3 read org 2's goals: ${brief(cross[0].out)}`);
  expect(cross[1].status >= 400 && cross[2].status >= 400 && !cross[1].text.includes("ORG2-RENDER") && !cross[2].text.includes("ORG2-FILE") && (cross[3].isError || (cross[3].out && cross[3].out.error)),
    () => `org 3 reached org 2's: render ${cross[1].status}, file ${cross[2].status}, contribution ${brief(cross[3].out)}`);
  at("plans");
  const a1 = await plan(1), a2 = await plan(2);
  expect(holds(a1) === holds(u.before1) && holds(a2) === holds(u.before2), () => `org 1 ${holds(u.before1)} → ${holds(a1)} · org 2 ${holds(u.before2)} → ${holds(a2)}`);
  u.rec = rec; u.k3 = k3; u.hash = hash; u.before3 = await plan(3);
  at("done");
  return `org 3: ${r.json.rows} rows, ${r.json.objects.put} bodies; ${tx2.length} contributions renumbered (${tx2[0]}→${ids.get(tx2[0])}), ${rec.maps.ids.length} ids remapped, ${P2}→${P3}; verify ${v.json.checks.length}/${v.json.checks.length}; its owner read ${pages.join(", ")}, ${mine.length} contributions, its render and file byte for byte, and none of org 2's (4 probes); org 1 and org 2 as before`;
}

smoke("orgundo · delete: refused for org 1, unnamed, misnamed, without the export, after a write; then org 2 leaves — 0 rows, o2/ empty — org 1 and org 3 exactly as before", async () => {
  const u = s.orgundo;
  expect(u && u.rec, "the restore case must run first");
  const refusals = [
    ["org 1", await tool("delete", "--org", "1", "--yes-delete", "1", "--export", u.ex)],
    ["no --yes-delete", await tool("delete", "--org", "2", "--export", u.ex)],
    ["a wrong name", await tool("delete", "--org", "2", "--yes-delete", "Smoke Local", "--export", u.ex)],
    ["no export", await tool("delete", "--org", "2", "--yes-delete", "2")],
  ];
  const late = await contribute(s.org2.key, { project: P2, lane: "leader", kind: "note", what: "orgundo: written after the export", why: "the delete must refuse" });
  expect(!late.isError, () => `org 2's late filing: ${brief(late.out)}`);
  refusals.push(["a write since the export", await tool("delete", "--org", "2", "--yes-delete", "2", "--export", u.ex)]);
  const bad = refusals.filter(([, r]) => r.rc !== 1 || !r.json || !r.json.refused);
  const still = await plan(2);
  expect(!bad.length && still.rows > 0 && /changed since the export/.test(refusals[4][1].json.refused), () => `refusals: ${bad.map(([n, r]) => `${n}: ${r.rc} ${r.out.slice(0, 160)}`).join(" | ")}; org 2 rows ${still.rows}`);
  const ex2 = join(u.dir, "export-2");
  const e2 = await tool("export", "--org", "2", "--out", ex2);
  expect(e2.rc === 0, () => `the fresh export: ${e2.out.slice(0, 300)}`);
  const b1 = await plan(1), b3 = await plan(3);
  const d = await tool("delete", "--org", "2", "--yes-delete", "Second org", "--export", ex2);
  expect(d.rc === 0 && d.json && d.json.ok && !d.json.left.length && !d.json.othersMoved.length, () => `delete: ${d.rc} ${d.out.slice(0, 500)}`);
  const after = await plan(2);
  const left = d1rows("SELECT (SELECT COUNT(*) FROM people WHERE org = 2) + (SELECT COUNT(*) FROM transmission WHERE org = 2) + (SELECT COUNT(*) FROM events WHERE org = 2) + (SELECT COUNT(*) FROM projects WHERE org = 2) + (SELECT COUNT(*) FROM org WHERE id = 2) + (SELECT COUNT(*) FROM k_goals WHERE project LIKE 'o2-%') AS n")[0].n;
  await settle();
  expect(after.rows === 0 && after.searchIndex === 0 && after.objects.n === 0 && left === 0, () => `org 2 after: ${holds(after)}, rows by SQL ${left}`);
  expect(holds(await plan(1)) === holds(b1) && holds(await plan(3)) === holds(b3), "org 1 or org 3 moved under org 2's delete");
  const gone = await http("POST", "/mcp", { key: s.org2.key, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } } });
  const k3 = await contributions(u.k3, P3);
  const rb = await fetch(`${process.env.SMOKE_URL}/render/${u.hash}?project=${P3}`, { headers: { authorization: "Bearer " + u.k3 } });
  expect(gone.status === 401 && k3.length > 0 && rb.status === 200, () => `org 2's key after: ${gone.status}; org 3 reads ${k3.length} contributions, its render ${rb.status}`);
  const again = await tool("delete", "--org", "2", "--yes-delete", "2", "--export", ex2);
  expect(again.rc === 0 && again.json && again.json.note, () => `a second delete: ${again.out.slice(0, 200)}`);
  return `5 refusals (org 1, unnamed, misnamed, no export, a write since — ${refusals[4][1].json.refused.slice(0, 50)}…), nothing deleted; then org 2: ${d.json.deleted.rows} rows over ${Object.keys(d.json.byTable).length} tables, ${d.json.deleted.searchIndex} search rows, ${d.json.deleted.objects} objects, 0 left; its key 401; org 1 (${b1.rows} rows) and org 3 (${b3.rows}) table by table as before; a second delete: nothing to delete`;
});
