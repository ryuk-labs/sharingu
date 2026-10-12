// tools/org-undo-selftest.mjs — one org's undo (sprint 6, 6.5; tools/org-undo.mjs) over REAL SQLite databases built from boot.sql
// (node:sqlite behind a D1-shaped binding whose batch is one transaction, as D1's) and an in-memory bucket. Cases:
//   THE RULE   · every table boot.sql creates is placed (an org's by a rule, the search index, or not an org's with its reason);
//                the delete's order lets every foreign key go child first, the derived tables after every source, projects,
//                people and org last; a table the tool cannot place is listed and makes delete REFUSE
//   THE REMAP  · a contribution keeps its day and takes the day's next free numbers above the database's and the export's, in
//                its old order (past 999 too); a token is rewritten only whole (T-…-1 never inside T-…-12, o2--shop never inside
//                o2--shopping); a JSON "project" field takes the new key, a JSON string naming an id of no distinctive shape
//                its new id; the inverted maps take every rewritten string back
//   REHEARSAL  · org 2 (every kind of row: knowledge, renders and takes, versions and snapshots, a ledger with a parent chain, a
//                decision, a grade and a change after it, refs, events, loops, files, a session report, tokens, previews) is
//                exported (no credential; render and inbox bodies; its backups left) and restored as org 3 BESIDE it: every
//                contribution id collides and is renumbered on its day, every taken uuid is fresh, every reference follows;
//                verify passes every check; org 1 and org 2 are byte for byte as they were
//   MUTATIONS  · the restore with one rewrite undone — a ref's contribution, a grade's contribution, an author, an event's own id,
//                a knowledge row's project, a snapshot's author, a render's object key, every contribution id — fails to load
//                or fails verify: a collision un-remapped is never green
//   FAILED     · a restore that fails part way leaves the new org reachable by nobody (no person holds a key) and refuses a
//                restore into its id; exported as it stands, it is deleted; rows with no org row at all go on the id alone
//   DELETE     · refused (nothing deleted): org 1; no --yes-delete; a wrong name; no export; another org's export; an export older
//                than a write; an UPDATE since the export that keeps every count (the content hash, finding 10); an object
//                rewritten with the same size since the export (its sha256); a foreign key crossing the wall. Then org 2 leaves:
//                its rows 0 in every table, its search rows 0, its prefix empty; org 1 and org 3 byte for byte as they were; a
//                second run answers nothing to delete
//   OTHERS     · the delete LOSES no other org's row: "kept" (--live) — another org gaining a row mid-delete is ok with a note,
//                another org losing one is not ok, and a loss offset by a gain is still a loss (by id, finding 11); another org's
//                derived rows shrinking (k_check_ungraded, the search index) and its expiring rows going (tokens, previews,
//                sign-in attempts) are ok — the old count rule false-failed there; an object outside the org's prefix gone is a
//                loss; "exact" (--local, the default) — a gain or a loss fails
//   ATOMIC     · (finding 13) the live delete first proves the batch is one transaction: on a backend whose batch runs statement
//                by statement (the first kept when the second fails) the delete REFUSES before its batch — nothing deleted, no
//                contribution eval-marked, no probe row left; on a transactional backend it proves it and deletes; "kept"
//                proves by default
//   UNDO       · org 2's export restored --as 2 after the delete: no id remapped, the same keys, verify green
//   HOME ORG   · org 1 (bare project keys, the database's horizon row; a stray object at a bare R2 key, no org prefix, which is
//                no org's) restored as org 4: keys o4--<slug>, its objects from o1/ alone (the stray never exported), verify
//                green; org 4 deleted; org 1 and the stray untouched
//   INVITE MARK · (sprint 12's review) an account an org's invite link marked (accounts.invited_org) keeps its row when that
//                org is deleted, its mark set to 0 — an id no org takes, so the next org's MAX + 1 id never inherits it; another
//                org's mark and an unmarked account untouched; the delete ok, the other orgs exactly as before
//   OWNER SECRET · (the sprint-7 review, D1) loadRestore's ownerPass sets the restored owner's seat secret beside its key, and
//                only the owner's; without it the key alone
//   THE CLI    · usage 2; --live without --confirm-live naming the config's database refused (1); with it but no credentials
//                refused before any network (1)
// Exit 1 on any fail. Run in the gate.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
// ORG_UNDO_TOOL (optional) points this selftest at a MUTANT copy of tools/org-undo.mjs (kept beside it: its imports are relative)
// — how a fix proves its case can fail
const U = await import(process.env.ORG_UNDO_TOOL ? pathToFileURL(process.env.ORG_UNDO_TOOL).href : "./org-undo.mjs");
import { tableHash, canon } from "./restore-local.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const md5 = (b) => createHash("md5").update(b).digest("hex");
const te = (s) => new TextEncoder().encode(s);

// ---- a D1-shaped binding over node:sqlite (batch: one transaction, as D1's) and an in-memory bucket ----
function d1(sqlite) {
  const mk = (sql, args = []) => ({
    sql, args,
    bind: (...a) => mk(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: (sql) => mk(sql),
    batch: async (list) => {
      sqlite.exec("BEGIN");
      try { const out = []; for (const s of list) out.push(await s.run()); sqlite.exec("COMMIT"); return out; }
      catch (e) { sqlite.exec("ROLLBACK"); throw e; }
    },
  };
}
function bucket() {
  const m = new Map();
  let t = 0;
  return {
    name: "mem", m,
    async list(prefix = "") { return [...m].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, v]) => ({ key, size: v.bytes.length, etag: md5(v.bytes), contentType: v.contentType, uploaded: v.at })); },
    async get(k) { const v = m.get(k); return v ? { bytes: v.bytes, contentType: v.contentType, customMetadata: v.customMetadata } : null; },
    async put(k, bytes, o = {}) { m.set(k, { bytes: new Uint8Array(bytes), contentType: o.contentType || null, customMetadata: o.customMetadata || {}, at: ++t }); },
    async delete(k) { m.delete(k); },
  };
}

// ---- the world: org 1 (bare keys) and org 2, every kind of row ----
const at = (h) => new Date(Date.parse("2026-10-06T08:00:00.000Z") + h * 3600e3).toISOString();
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const ins = (d, table, row) => d.exec(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(q).join(", ")})`);
// seedOrg(d, B, o) -> the ids it used. o: { org, key, old (an archived project's key), prefix (where its objects lie), owner,
// member, gone, day, tids (4 of the day), prev (one of the day before), stray (org 1: one object at a bare R2 key, renders/<key>/stray) }
function seedOrg(d, B, o) {
  const by = (p) => ({ created_by: p, created_at: at(1), updated_by: p, updated_at: at(1) });
  const K = o.key, org = o.org;
  ins(d, "projects", { key: K, name: `Shop ${org}`, active: 1, created_at: at(0) });
  ins(d, "projects", { key: o.old, name: `Old ${org}`, active: 0, created_at: at(0) });
  ins(d, "people", { id: o.owner, name: `Owner ${org}`, email: `owner@${org}.test`, role: "owner", key_hash: `kh-${o.owner}`, pass_hash: "ph", pass_salt: "salt", active: 1, created_at: at(0), hats: '["management"]', org });
  ins(d, "people", { id: o.member, name: `Member ${org}`, email: `m@${org}.test`, role: "member", key_hash: `kh-${o.member}`, active: 1, created_at: at(0), org });
  ins(d, "people", { id: o.gone, name: `Gone ${org}`, role: "member", key_hash: `kh-${o.gone}`, active: 0, created_at: at(0), org });
  if (org !== 1) ins(d, "org", { id: org, name: `Org ${org}`, brand: `{"org":"Org ${org}"}`, home: K, created_by: o.owner, created_at: at(0), updated_by: o.owner, updated_at: at(0) });
  ins(d, "project_seats", { person_id: o.member, project_key: K, role: "member", created_at: at(0) });
  ins(d, "k_aim", { project: K, aim: "Sell", measure: '{"name":"orders","value":3}', ...by(o.owner) });
  ins(d, "k_goals", { project: K, id: "root", parent: null, title: "Sell more", dimensions: '["gtm"]', owner: o.member, ...by(o.owner) });
  ins(d, "k_goals", { project: K, id: "annual", parent: "root", title: "Annual first", dimensions: '["code"]', ...by(o.member) });
  ins(d, "k_goals", { project: o.old, id: "r", parent: null, title: "Old root", dimensions: "[]", ...by(o.owner) });
  ins(d, "k_questions", { project: K, qid: "Q-1", question: "Annual?", status: "decided", choice: "0", decided_by: o.owner, decided_at: at(2), source: `[{"kind":"contribution","ref":"${o.tids[0]}"}]`, ...by(o.owner) });
  ins(d, "k_options", { project: K, qid: "Q-1", idx: 0, what: "Annual", ...by(o.owner) });
  ins(d, "k_nodes", { project: K, id: "screen:home", type: "screen", name: "Home", status: "live", data: '{"surface":"web","lane":"buy","step":1}', ...by(o.owner) });
  ins(d, "k_nodes", { project: K, id: "door:api", type: "door", name: "GET /api", ...by(o.owner) });
  ins(d, "k_edges", { project: K, from_id: "screen:home", to_id: "door:api", kind: "depends", ...by(o.owner) });
  ins(d, "k_checks", { project: K, id: "AC.1", title: "home shows", refs: '["screen:home"]', ...by(o.owner) });
  ins(d, "k_checks", { project: K, id: "AC.2", title: "api answers", refs: '["door:api"]', ...by(o.owner) });
  ins(d, "k_card_kinds", { project: K, key: "claim", label: "Claims", tab: "gtm", ...by(o.owner) });
  ins(d, "k_cards", { project: K, kind: "claim", id: "c1", name: "We ship", body_md: `See ${o.tids[1]} in ${K}; not ${o.tids[1]}0 nor ${K}ping.`, source: `[{"kind":"contribution","ref":"${o.tids[1]}"}]`, ...by(o.owner) });
  ins(d, "k_docs", { project: K, path: "start-here.md", title: "Start", body_md: `# Hi\nAsk ${o.member}.`, ...by(o.owner) });
  ins(d, "k_gtm", { project: K, template: '{"stages":["lead"]}', ...by(o.owner) });
  // the bodies: a style, an html render, an image render (its artifact), in the bucket under the org's prefix
  const css = te(`.s${org}{color:red}`), html = te(`<p>HOME ${org}</p>`), png = te(`PNG-${org}`), report = te(`{"report":${org}}`), handoff = te(`{"from":"${o.member}","project":"${K}"}`);
  const [S, R1, R2, A1, A2] = [sha(css), sha(html), sha(png), sha(png), sha(report)];
  const a1 = randomUUID(), a2 = randomUUID();
  ins(d, "artifacts", { id: a1, person_id: o.member, kind: "image", title: "shot", r2_key: `inbox/artifacts/2026-10/${o.member}/${A1}.png`, sha256: A1, bytes: png.length, group_tag: "screens", created_at: at(1), project: K, org });
  ins(d, "artifacts", { id: a2, person_id: o.member, kind: "json", title: "report", r2_key: `inbox/artifacts/2026-10/${o.member}/${A2}.json`, sha256: A2, bytes: report.length, group_tag: "reports", created_at: at(1), project: K, org });
  ins(d, "k_styles", { project: K, id: "base", hash: S, bytes: css.length, ...by(o.owner) });
  ins(d, "k_renders", { project: K, screen: "screen:home", state: "", variant: "", format: "html", style: "base", hash: R1, bytes: html.length, ...by(o.owner) });
  ins(d, "k_renders", { project: K, screen: "screen:home", state: "", variant: "live", format: "image", artifact: a1, width: 2, height: 2, hash: R2, bytes: png.length, ...by(o.member) });
  ins(d, "k_versions", { project: K, n: 1, title: "First", cause: "published", counts: '{"goal":2}', ...by(o.owner) });
  ins(d, "k_snapshots", { project: K, n: 1, table_name: "k_goals", chunk: 0, payload: `[{"id":"root","title":"Sell more","owner":"${o.member}","created_by":"${o.owner}"}]`, ...by(o.owner) });
  const put = (k, b, ct) => B.put(k, b, { contentType: ct });
  const rk = (h) => `renders/${K}/${h}`;
  put(o.prefix + rk(S), css, "text/css");
  if (o.stray) put(`renders/${K}/stray`, "/* a stray at a bare key: no org's */", "text/css");
  put(o.prefix + rk(R1), html, "text/html");
  put(o.prefix + rk(R2), png, "image/png");
  put(`${o.prefix}inbox/artifacts/2026-10/${o.member}/${A1}.png`, png, "image/png");
  put(`${o.prefix}inbox/artifacts/2026-10/${o.member}/${A2}.json`, report, "application/json");
  put(`${o.prefix}inbox/handoffs/2026-10/${randomUUID()}.json`, handoff, "application/json");
  put(`${o.prefix}backups/d1/2026-10-06/manifest.json`, te("{}"), "application/json");
  // the ledger: a filing with a follow-up (T0), a ruling on it (T1, decided, approval_audit), a grade (T2), a change after the grade
  // (T3: stales AC.1), an org-level note of the day before (no project: the org's bucket)
  const X = (r) => ins(d, "transmission", { what: "w", why: "y", eval: 0, via: "mcp", org, ...r });
  X({ id: o.tids[0], submitter: o.member, lane: "code", kind: "pr", touches: "door:api", route: "auto", status: "closed", project: K, report: a2, shape: `{"next":{"what":"announce","who":"${o.owner}"}}`, next_who: o.owner, created_at: at(2) });
  X({ id: o.tids[1], submitter: o.owner, lane: "leader", kind: "note", route: "owner", status: "closed", project: K, parent: o.tids[0], decision: "approve", decided_by: o.owner, decided_at: at(3), goal_ref: "annual", created_at: at(3) });
  X({ id: o.tids[2], submitter: o.member, lane: "code", kind: "grade", route: "auto", status: "closed", project: K, created_at: at(4) });
  ins(d, "check_results", { project: K, pack_version: "d1", check_id: "AC.1", status: "proven", transmission_id: o.tids[2], graded_by: o.member, graded_at: at(4) });
  ins(d, "check_results", { project: K, pack_version: "d1", check_id: "AC.2", status: "refused", transmission_id: o.tids[2], graded_by: o.member, graded_at: at(4) });
  X({ id: o.tids[3], submitter: o.member, lane: "code", kind: "pr", touches: "screen:home", route: "auto", status: "routed", project: K, created_at: at(5) });
  X({ id: o.prev, submitter: o.owner, lane: "leader", kind: "note", route: "owner", status: "routed", project: null, created_at: at(-20) });
  ins(d, "transmission_refs", { tid: o.tids[0], ref: "door:api" });
  ins(d, "transmission_refs", { tid: o.tids[3], ref: "screen:home" });
  ins(d, "approval_audit", { id: randomUUID(), transmission_id: o.tids[1], verdict: "approve", note: "ok", decided_by: o.owner, created_at: at(3), org });
  ins(d, "events", { id: randomUUID(), person_id: o.owner, kind: "ruling", payload_json: `{"project":"${K}","tid":"${o.tids[1]}","by":"${o.owner}"}`, created_at: at(3), project: K, org });
  ins(d, "events", { id: randomUUID(), person_id: o.member, kind: "fragment", payload_json: `{"handoffId":"${randomUUID()}"}`, created_at: at(4), project: null, org });
  ins(d, "loops", { id: randomUUID(), person_id: o.member, title: "follow", status: "open", opened_at: at(2), ref: o.tids[0], org });
  // never dumped: a session, a preview, an invite
  ins(d, "tokens", { token_hash: `tok-${org}-${randomUUID()}`, person_id: o.member, device: "laptop", created_at: at(1), expires_at: "2027-01-01T00:00:00.000Z", revoked: 0, project: K, org });
  ins(d, "previews", { id: `P-${org}-${randomUUID().slice(0, 8)}`, project: K, person: o.member, created_at: at(5), expires_at: at(6), digest: "dg", summary: "{}" });
  ins(d, "invites", { id: randomUUID(), code_hash: `ch-${org}-${randomUUID()}`, project_key: K, role: "member", created_by: o.owner, created_at: at(1), expires_at: at(100), org });
}
const ORG1 = { org: 1, key: "alpha", old: "beta", prefix: "o1/", owner: randomUUID(), member: randomUUID(), gone: randomUUID(), tids: ["T-20261006-001", "T-20261006-002", "T-20261006-003", "T-20261006-005"], prev: "T-20261005-001", stray: true };
const ORG2 = { org: 2, key: "o2--shop", old: "o2--old", prefix: "o2/", owner: "org2-owner-0001", member: randomUUID(), gone: randomUUID(), tids: ["T-20261006-004", "T-20261006-006", "T-20261006-007", "T-20261006-012"], prev: "T-20261005-002" };
function world() {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = ON");
  d.exec(BOOT);
  const B = bucket();
  d.exec(`INSERT INTO org (id, name, created_at, updated_at) VALUES (1, 'Home', '${at(0)}', '${at(0)}')`);
  seedOrg(d, B, ORG1);
  d.exec(`UPDATE org SET home = 'alpha', created_by = '${ORG1.owner}' WHERE id = 1`);
  seedOrg(d, B, ORG2);
  return { d, DB: d1(d), B };
}
// snapshotOrg(w, org) -> every row of the org in every placed table (by its rule, updated_at and all), its search rows per project,
// its objects (key and bytes): what "untouched" means
async function snapshotOrg(w, org) {
  const schema = await U.schemaOf(w.DB), rules = U.rulesOf(schema);
  const out = {};
  for (const t of schema) if (rules[t.name].sql) out[t.name] = tableHash((await U.orgDb(w.DB, org).prepare(`SELECT * FROM "${t.name}" WHERE ${rules[t.name].sql}`).all()).results);
  const keys = w.d.prepare("SELECT key FROM projects WHERE org = ?").all(org).map((r) => r.key);
  out["(search)"] = keys.map((k) => w.d.prepare("SELECT COUNT(*) AS n FROM k_find WHERE k_find MATCH ?").get(`p : p${Buffer.from(k).toString("hex").toUpperCase()}`).n).join(",");
  out["(objects)"] = sha((await w.B.list(`o${org}/`)).map((o) => `${o.key} ${o.etag}`).join("\n") + (org === 1 ? (await w.B.list("renders/")).map((o) => `${o.key} ${o.etag}`).join("\n") : ""));
  return canon(out);
}
const bodiesOf = (r) => async (s) => r.bodies.get(s);
async function restore(w, exp, bodies, o = {}) {
  const plan = await U.planRestore(w.DB, exp, o);
  if (plan.refused) return { refused: plan.refused };
  if (o.mutate) o.mutate(plan);
  const loaded = await U.loadRestore(w.DB, w.B, plan, bodies, { ownerKeyHash: sha(`fresh-key-${plan.to}-${randomUUID()}`), chunk: 7 });
  return { plan, rec: U.recordOf(plan, exp, loaded) };
}

// ---- THE RULE ----
{
  const w = world();
  const schema = await U.schemaOf(w.DB), rules = U.rulesOf(schema);
  const unplaced = schema.filter((t) => rules[t.name].unplaced).map((t) => t.name);
  const placed = schema.filter((t) => rules[t.name].sql).length, fts = schema.filter((t) => rules[t.name].fts).length, skip = schema.filter((t) => rules[t.name].skip).map((t) => t.name);
  ok(!unplaced.length && placed >= 40 && fts >= 2, `every one of boot.sql's ${schema.length} tables is placed: ${placed} an org's by a rule, ${fts} the search index, ${skip.length} not an org's (${skip.join(", ")})${unplaced.length ? ` — UNPLACED: ${unplaced.join(", ")}` : ""}`);
  const { passes, last } = U.deleteOrder(schema, rules);
  const pos = new Map([...passes, ...last].map((t, i) => [t, i]));
  const late = [];
  // (the org row names its home project and its owner: the delete unsets both first, so it can go last)
  for (const t of schema) if (pos.has(t.name) && t.name !== "org") for (const f of t.fks) if (pos.has(f.table) && f.table !== t.name && pos.get(f.table) < pos.get(t.name)) late.push(`${t.name} -> ${f.table}`);
  const derivedAfter = passes.every((t, i) => !rules[t].derived || passes.slice(i).every((u) => rules[u].derived));
  ok(!late.length && derivedAfter && canon(last) === canon(["projects", "people", "org"]) && passes.length + last.length === placed,
    `the delete's order: every foreign key's child before its parent, the derived tables after every source, projects, people and org last (the org row's two pointers unset first) (${passes.length} + 3 tables)${late.length ? ` — late: ${late.join(", ")}` : ""}`);
  w.d.exec("CREATE TABLE stray_notes (id TEXT PRIMARY KEY, body TEXT)");
  const s2 = await U.schemaOf(w.DB), r2 = U.rulesOf(s2);
  const del = await U.deleteOrg(w.DB, w.B, 2, { confirm: "2" });
  ok(r2.stray_notes.unplaced && /stray_notes/.test(del.refused || ""), `a table the tool cannot place is listed, and delete refuses naming it: ${del.refused}`);
  // the mid-ship window (067 applied, 069 not yet): live still holds migrate-018's refs horizon, org 1's pre-org
  // history no other org can write — it is SKIPPED, never a refusal (found by the sprint-6 ship's preview attack)
  w.d.exec("DROP TABLE stray_notes");
  w.d.exec("CREATE TABLE transmission_refs_meta (k TEXT PRIMARY KEY, v TEXT)");
  const s3 = await U.schemaOf(w.DB), r3 = U.rulesOf(s3);
  ok(r3.transmission_refs_meta.skip && !r3.transmission_refs_meta.unplaced,
    `the 067-to-069 window's transmission_refs_meta is skipped as org 1's pre-org history, not a refusal`);
  w.d.exec("DROP TABLE transmission_refs_meta");
}

// ---- THE REMAP ----
{
  const m = U.allocateTids([{ id: "T-20261006-004" }, { id: "T-20261006-002" }, { id: "T-20261005-999" }, { id: "legacy-7", created_at: "2026-09-01T00:00:00Z" }],
    ["T-20261006-002", "T-20261006-004", "T-20261006-009", "T-20261005-999"], new Map([["20261006", 7], ["20261005", 1003], ["20260901", 0]]));
  ok(m.get("T-20261006-002") === "T-20261006-010" && m.get("T-20261006-004") === "T-20261006-011" && m.get("T-20261005-999") === "T-20261005-1004" && m.get("legacy-7") === "T-20260901-001",
    `a contribution keeps its day and takes the next free numbers above the database's (7) and the export's (9), in its old order; past 999; a legacy id takes its filing day: ${[...m].map(([a, b]) => `${a}→${b}`).join(" ")}`);
  const ids = new Map([["T-20261006-001", "T-20261006-021"], ["11111111-2222-4333-8444-555555555555", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"], ["org2-owner-0001", "99999999-8888-4777-8666-555555555555"]]);
  const keys = new Map([["o2--shop", "o3--shop"], ["alpha", "o3--alpha"]]);
  const rw = U.rewriter({ ids, keys, from: 2, to: 3 });
  const s1 = "see T-20261006-001, not T-20261006-0012 or XT-20261006-001x; o2--shop/x?project=o2--shop but o2--shopping; inbox/artifacts/2026-10/11111111-2222-4333-8444-555555555555/h.png";
  const g1 = rw.string(s1);
  ok(g1 === "see T-20261006-021, not T-20261006-0012 or XT-20261006-001x; o3--shop/x?project=o3--shop but o2--shopping; inbox/artifacts/2026-10/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/h.png", `a token is rewritten only whole: ${g1}`);
  const j = '{"project":"alpha","by":"org2-owner-0001","note":"org2-owner-0001 wrote it","list":["org2-owner-0001"]}';
  const g2 = rw.string(j);
  ok(g2 === '{"project":"o3--alpha","by":"99999999-8888-4777-8666-555555555555","note":"org2-owner-0001 wrote it","list":["99999999-8888-4777-8666-555555555555"]}' && rw.string("org2-owner-0001") === "99999999-8888-4777-8666-555555555555" && rw.string("alpha") === "alpha",
    `JSON: a "project" field takes the new key, a string naming an id of no distinctive shape its new id; prose and a bare word stay: ${g2}`);
  const r = rw.row("k_goals", { project: "alpha", id: "root", owner: "org2-owner-0001", created_by: "11111111-2222-4333-8444-555555555555" });
  const o = rw.row("org", { id: 2, home: "o2--shop", created_by: "org2-owner-0001" });
  ok(r.project === "o3--alpha" && r.id === "root" && r.owner === "99999999-8888-4777-8666-555555555555" && o.id === 3 && o.home === "o3--shop" && rw.objectKey("renders/alpha/abc") === "renders/o3--alpha/abc",
    "a row: the key columns by the key map, the org's id, every id; a render's object key by its project segment");
  const inv = U.rewriter({ ids: new Map([...ids].map(([a, b]) => [b, a])), keys: new Map([...keys].map(([a, b]) => [b, a])), from: 3, to: 2 });
  ok(inv.string(g1) === s1 && inv.string(g2) === j && canon(inv.row("org", o)) === canon({ id: 2, home: "o2--shop", created_by: "org2-owner-0001" }), "the inverted maps take every rewritten string and row back");
}

// ---- REHEARSAL: org 2 exported, restored as org 3 beside it ----
const w = world();
const before1 = await snapshotOrg(w, 1), before2 = await snapshotOrg(w, 2);
const ex = await U.exportOrg(w.DB, w.B, 2, { database: "mem" });
let rec3;
{
  const E = ex.exp;
  const creds = Object.values(E.dump.tables.people[0] || {}).length && ["key_hash", "pass_hash", "pass_salt", "email"].some((c) => E.dump.tables.people.some((p) => c in p));
  ok(!creds && !E.dump.tables.tokens && !E.dump.tables.previews && E.counts.transmission === 5 && E.counts.people === 3 && E.counts.projects === 2 && !("transmission_refs_meta" in E.dump.tables),
    `the export: ${Object.values(E.counts).reduce((a, b) => a + b, 0)} rows of org 2 (5 contributions, 3 people, 2 projects), no credential column, no token or preview, no horizon table (migrate-069 dropped it)`);
  ok(E.objects.length === 6 && E.objects.every((x) => /^(renders|inbox)\//.test(x.key)) && E.left["backups/"] === 1 && ex.bodies.size === 5,
    `its objects: ${E.objects.length} (renders and inbox, ${ex.bodies.size} distinct bodies), its backups left (${E.left["backups/"]})`);
  const r = await restore(w, E, bodiesOf(ex));
  rec3 = r.rec;
  const ids = new Map(rec3.maps.ids);
  ok(rec3.to === 3 && [...ORG2.tids, ORG2.prev].every((t) => ids.has(t)) && ids.get("T-20261006-004") === "T-20261006-013" && ids.get("T-20261006-012") === "T-20261006-016" && ids.get("T-20261005-002") === "T-20261005-003",
    `org 3: every contribution id collided and is renumbered on its day above org 1's and the export's (${[...ORG2.tids, ORG2.prev].map((t) => `${t}→${ids.get(t)}`).join(" ")})`);
  ok(ids.has(ORG2.owner) && ids.has(ORG2.member) && rec3.owner === ids.get(ORG2.owner) && w.d.prepare("SELECT key FROM projects WHERE org = 3 ORDER BY key").all().map((x) => x.key).join(",") === "o3--old,o3--shop",
    `every taken uuid and the owner's fixed id are fresh (${ids.size} ids remapped); the projects are o3--shop and o3--old`);
  const v = await U.verifyRestore(w.DB, w.B, E, rec3);
  ok(v.ok, `verify: ${v.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.what}${c.detail ? ` [${c.detail}]` : ""}`).join(" · ")}`);
  const n = (t) => ids.get(t);
  const tx = w.d.prepare("SELECT parent, report, next_who FROM transmission WHERE id = ?").get(n("T-20261006-006"));
  const p0 = w.d.prepare("SELECT report FROM transmission WHERE id = ?").get(n("T-20261006-004"));
  const refs = w.d.prepare("SELECT tid FROM transmission_refs WHERE tid IN (SELECT id FROM transmission WHERE org = 3) ORDER BY tid").all().map((x) => x.tid);
  const cr = w.d.prepare("SELECT DISTINCT transmission_id AS t, graded_by AS g FROM check_results WHERE project = 'o3--shop'").all();
  const stale = w.d.prepare("SELECT changed_by FROM k_node_stale WHERE project = 'o3--shop'").all();
  const ev = w.d.prepare("SELECT payload_json FROM events WHERE org = 3 AND kind = 'ruling'").get();
  const art = w.d.prepare("SELECT id, r2_key FROM artifacts WHERE org = 3 AND kind = 'image'").get();
  const rr = w.d.prepare("SELECT artifact FROM k_renders WHERE project = 'o3--shop' AND format = 'image'").get();
  const snap = w.d.prepare("SELECT payload FROM k_snapshots WHERE project = 'o3--shop'").get();
  const audit = w.d.prepare("SELECT transmission_id FROM approval_audit WHERE org = 3").get();
  ok(tx.parent === n("T-20261006-004") && p0.report === n(w.d.prepare("SELECT id FROM artifacts WHERE org = 2 AND kind = 'json'").get().id) && refs.join() === [n("T-20261006-004"), n("T-20261006-012")].sort().join()
    && cr.length === 1 && cr[0].t === n("T-20261006-007") && cr[0].g === n(ORG2.member) && stale.length === 1 && stale[0].changed_by === n("T-20261006-012") && audit.transmission_id === n("T-20261006-006"),
    "every reference follows its contribution: parent, report, refs, a grade's filing and grader, the stale mark's change, the decision's audit");
  ok(ev.payload_json === `{"project":"o3--shop","tid":"${n("T-20261006-006")}","by":"${n(ORG2.owner)}"}` && art.r2_key.includes(`/${n(ORG2.member)}/`) && rr.artifact === art.id && snap.payload.includes(`"owner":"${n(ORG2.member)}"`) && snap.payload.includes(`"created_by":"${n(ORG2.owner)}"`),
    `and inside text and JSON: an event's payload, a file's key and its image render, a snapshot's authors (${ev.payload_json})`);
  ok(!!w.B.m.get(`o3/${art.r2_key}`) && !!w.B.m.get(`o3/renders/o3--shop/${w.d.prepare("SELECT hash FROM k_renders WHERE project = 'o3--shop' AND format = 'html'").get().hash}`) && (await w.B.list("o3/")).length === 6 && !(await w.B.list("o3/backups/")).length,
    `the bodies under o3/: the file at its new key, the render under o3--shop, ${(await w.B.list("o3/")).length} objects, no backup`);
  ok(await snapshotOrg(w, 1) === before1 && await snapshotOrg(w, 2) === before2, "org 1 and org 2: every row, search row and object exactly as before");
  const again = await U.planRestore(w.DB, E, { as: 3 }), one = await U.planRestore(w.DB, E, { as: 1 });
  ok(/exists/.test(again.refused || "") && /≥ 2/.test(one.refused || ""), `a restore into an org that exists, or into org 1, is refused: ${again.refused} | ${one.refused}`);
}

// ---- MUTATIONS: one rewrite undone, a collision left in ----
{
  const E = ex.exp;
  const oldOf = (plan) => new Map(plan.maps.ids.map(([a, b]) => [b, a]));
  const M = {
    "a ref's contribution (transmission_refs.tid)": (p) => { const o = oldOf(p); for (const r of p.rows.transmission_refs) r.tid = o.get(r.tid); },
    "a grade's contribution (check_results.transmission_id)": (p) => { const o = oldOf(p); for (const r of p.rows.check_results) r.transmission_id = o.get(r.transmission_id); },
    "an author (k_goals.created_by)": (p) => { const o = oldOf(p); for (const r of p.rows.k_goals) r.created_by = o.get(r.created_by) || r.created_by; },
    "an event's own id": (p) => { const o = oldOf(p); for (const r of p.rows.events) r.id = o.get(r.id); },
    "a knowledge row's project (k_nodes.project)": (p) => { for (const r of p.rows.k_nodes) r.project = "o2--shop"; },
    "a snapshot's author (JSON)": (p) => { const o = oldOf(p); for (const r of p.rows.k_snapshots) r.payload = r.payload.replace(/"created_by":"([^"]+)"/, (_, x) => `"created_by":"${o.get(x)}"`); },
    "a render's object key": (p) => { for (const x of p.objects) x.to = x.key; },
    "every contribution id": (p) => { const o = oldOf(p); for (const t of Object.keys(p.rows)) p.rows[t] = p.rows[t].map((r) => Object.fromEntries(Object.entries(r).map(([c, v]) => [c, typeof v === "string" && /^T-/.test(o.get(v) || "") ? o.get(v) : v]))); },
  };
  const red = [];
  for (const [name, mutate] of Object.entries(M)) {
    const m = world();
    const e = await U.exportOrg(m.DB, m.B, 2, { database: "mem" });
    let r, v = null, threw = null;
    try { r = await restore(m, e.exp, bodiesOf(e), { mutate }); v = await U.verifyRestore(m.DB, m.B, e.exp, r.rec); } catch (err) { threw = String(err.message || err).slice(0, 60); }
    if (!(threw || (v && !v.ok))) red.push(name);
    else console.log(`    · ${name}: ${threw ? `the load fails (${threw})` : `verify red: ${v.checks.filter((c) => !c.ok).map((c) => c.what.slice(0, 40)).join(" | ")}`}`);
  }
  void E;
  ok(!red.length, `${Object.keys(M).length} mutations of the remap, each fails to load or fails verify${red.length ? ` — GREEN (a collision left in): ${red.join(", ")}` : ""}`);
}

// ---- A FAILED RESTORE is cleaned by delete ----
{
  const m = world();
  const e = await U.exportOrg(m.DB, m.B, 2, { database: "mem" });
  const b1 = await snapshotOrg(m, 1), b2 = await snapshotOrg(m, 2);
  let threw = null;
  try { await restore(m, e.exp, bodiesOf(e), { mutate: (p) => { const o = new Map(p.maps.ids.map(([a, b]) => [b, a])); for (const r of p.rows.transmission) r.id = o.get(r.id) || r.id; } }); } catch (err) { threw = String(err.message || err); }
  const partial = m.d.prepare("SELECT COUNT(*) AS n FROM people WHERE org = 3").get().n;
  const keyless = m.d.prepare("SELECT COUNT(*) AS n FROM people WHERE org = 3 AND key_hash NOT LIKE 'restored:%'").get().n;
  const again = await U.planRestore(m.DB, e.exp, { as: 3 });
  const ep = await U.exportOrg(m.DB, m.B, 3, { database: "mem" });
  const d = await U.deleteOrg(m.DB, m.B, 3, { confirm: "3", exp: ep.exp, database: "mem" });
  ok(threw && partial === 3 && keyless === 0 && /exists/.test(again.refused || "") && d.ok && await snapshotOrg(m, 1) === b1 && await snapshotOrg(m, 2) === b2,
    `a restore that fails part way (${threw && threw.slice(0, 40)}) leaves org 3 reachable by nobody (${partial} people, none with a key); exported as it stands and deleted (${d.deleted.rows} rows, ${d.deleted.objects} objects); org 1 and org 2 as before`);
  m.d.exec(`INSERT INTO projects (key, name, active, created_at) VALUES ('o9--x', 'Stray', 1, '${at(0)}')`);
  m.d.exec(`INSERT INTO people (id, name, role, key_hash, active, created_at, org) VALUES ('stray-9', 'Stray', 'member', 'restored:stray-9', 1, '${at(0)}', 9)`);
  const p9 = await U.planRestore(m.DB, e.exp, { as: 9 });
  const n9 = await U.deleteOrg(m.DB, m.B, 9, { confirm: "Stray" }), y9 = await U.deleteOrg(m.DB, m.B, 9, { confirm: "9" });
  ok(/delete them first/.test(p9.refused || "") && /must name/.test(n9.refused || "") && y9.ok && y9.deleted.rows === 2 && await snapshotOrg(m, 1) === b1,
    `rows of an org with no org row (a restore that failed before it landed): a restore into that id is refused; delete takes them on the id alone, no export (${y9.deleted.rows} rows)`);
}

// ---- DELETE ----
{
  const E = ex.exp;
  const del = (org, o) => U.deleteOrg(w.DB, w.B, org, { database: "mem", ...o });
  const c2 = () => w.d.prepare("SELECT (SELECT COUNT(*) FROM transmission WHERE org = 2) + (SELECT COUNT(*) FROM people WHERE org = 2) + (SELECT COUNT(*) FROM k_goals WHERE project LIKE 'o2--%') AS n").get().n;
  const n0 = c2(), o0 = (await w.B.list("o2/")).length;
  const r1 = await del(1, { confirm: "1", exp: E }), r2 = await del(2, { exp: E }), r3 = await del(2, { confirm: "Org 3", exp: E }), r4 = await del(2, { confirm: "Org 2" });
  const e1 = await U.exportOrg(w.DB, w.B, 3, { database: "mem" });
  const r5 = await del(2, { confirm: "2", exp: e1.exp });
  w.d.exec(`INSERT INTO events (id, person_id, kind, created_at, org) VALUES ('late-1', '${ORG2.member}', 'fragment', '${at(9)}', 2)`);
  const r6 = await del(2, { confirm: "2", exp: E });
  w.d.exec("DELETE FROM events WHERE id = 'late-1'");
  w.d.exec(`INSERT INTO events (id, person_id, kind, created_at, project, org) VALUES ('cross-1', '${ORG1.owner}', 'fragment', '${at(9)}', 'o2--shop', 1)`);
  const r7 = await del(2, { confirm: "2", exp: E });
  w.d.exec("DELETE FROM events WHERE id = 'cross-1'");
  // finding 10: an UPDATE that keeps every count, and an object rewritten with the same size — each a change since the export
  const okey = (await w.B.list("o2/inbox/artifacts/")).find((x) => x.key.endsWith(".json")).key, obody = (await w.B.get(okey)).bytes, oct = (await w.B.get(okey)).contentType;
  const title = w.d.prepare("SELECT title FROM k_goals WHERE project = 'o2--shop' AND id = 'root'").get().title;
  w.d.exec("UPDATE k_goals SET title = 'Sell less' WHERE project = 'o2--shop' AND id = 'root'");
  const r8 = await del(2, { confirm: "2", exp: E });
  w.d.prepare("UPDATE k_goals SET title = ? WHERE project = 'o2--shop' AND id = 'root'").run(title);
  await w.B.put(okey, te(new TextDecoder().decode(obody).replace(/2/, "9")), { contentType: oct });
  const r9 = await del(2, { confirm: "2", exp: E });
  await w.B.put(okey, obody, { contentType: oct });
  ok(/changed since the export.*k_goals (\d+)→\1 \(content\)/.test(r8.refused || "") && /changed since the export.*objects 6→6 \(content\)/.test(r9.refused || "") && c2() === n0 && (await w.B.list("o2/")).length === o0,
    `refused, nothing deleted: an UPDATE since the export that keeps every count (${r8.refused}) · an object rewritten with the same size (${r9.refused})`);
  ok(/never deleted/.test(r1.refused || "") && /must name/.test(r2.refused || "") && /must name/.test(r3.refused || "") && /export/.test(r4.refused || "") && /export of org 2/.test(r5.refused || "")
    && /changed since the export.*events 2→3/.test(r6.refused || "") && r7.refused && r7.cross && r7.cross.some((x) => x.table === "events" && x.in === 1) && c2() === n0 && (await w.B.list("o2/")).length === o0,
    `refused, nothing deleted: org 1 · no --yes-delete · a wrong name · no export · org 3's export · an export older than a write (${r6.refused}) · a foreign key into the org (${(r7.cross || []).map((x) => `${x.table}.${x.column}`).join(", ")})`);
  const b1 = await snapshotOrg(w, 1), b3 = await snapshotOrg(w, 3);
  const d = await del(2, { confirm: "Org 2", exp: E });
  const schema = await U.schemaOf(w.DB), rules = U.rulesOf(schema);
  const left = [];
  for (const t of schema) if (rules[t.name].sql) { const x = (await U.orgDb(w.DB, 2).prepare(`SELECT COUNT(*) AS n FROM "${t.name}" WHERE ${rules[t.name].sql}`).first()).n; if (x) left.push(`${t.name} ${x}`); }
  const fts = ["o2--shop", "o2--old"].map((k) => w.d.prepare("SELECT COUNT(*) AS n FROM k_find WHERE k_find MATCH ?").get(`p : p${Buffer.from(k).toString("hex").toUpperCase()}`).n);
  ok(d.ok && !left.length && fts.every((x) => x === 0) && !(await w.B.list("o2/")).length && !w.d.prepare("SELECT 1 FROM org WHERE id = 2").get() && d.deleted.objects === 7,
    `org 2 deleted: ${d.deleted.rows} rows over ${Object.keys(d.byTable).length} tables (its tokens, previews and invites too), ${d.deleted.searchIndex} search rows, ${d.deleted.objects} objects (its backups too); 0 left anywhere${left.length ? ` — LEFT: ${left.join(", ")}` : ""}`);
  ok(await snapshotOrg(w, 1) === b1 && await snapshotOrg(w, 3) === b3 && !d.othersMoved.length, "org 1 and org 3: every row, search row and object exactly as before the delete");
  const again = await del(2, { confirm: "2", exp: E });
  ok(again.ok && again.note && again.deleted.rows === 0, `a second delete: ${again.note}`);
  const v3 = await U.verifyRestore(w.DB, w.B, E, rec3);
  ok(v3.ok, "org 3 still verifies against org 2's export with org 2 gone (the derived comparison says why it is skipped)");
}

// ---- UNDO: org 2 back under its own id ----
{
  const r = await restore(w, ex.exp, bodiesOf(ex), { as: 2 });
  const v = await U.verifyRestore(w.DB, w.B, ex.exp, r.rec);
  ok(r.rec.maps.ids.length === 0 && r.rec.maps.keys.every(([a, b]) => a === b) && v.ok && w.d.prepare("SELECT COUNT(*) AS n FROM transmission WHERE org = 2").get().n === 5,
    `org 2's export restored --as 2 after its delete: no id remapped, the same keys, verify green (${v.checks.length} checks)`);
}

// ---- HOME ORG: org 1 restored as org 4, then deleted ----
{
  const b1 = await snapshotOrg(w, 1);
  const e = await U.exportOrg(w.DB, w.B, 1, { database: "mem" });
  const renders = e.exp.objects.filter((x) => x.key.startsWith("renders/alpha/"));
  const fromO1 = [...(await U.orgObjects(w.B, 1)).values()].every((x) => x.at.startsWith("o1/"));
  const strayOut = e.exp.objects.some((x) => x.key === "renders/alpha/stray");
  const r = await restore(w, e.exp, bodiesOf(e));
  const v = await U.verifyRestore(w.DB, w.B, e.exp, r.rec);
  const keys = w.d.prepare("SELECT key FROM projects WHERE org = 4 ORDER BY key").all().map((x) => x.key).join(",");
  ok(r.rec.to === 4 && keys === "o4--alpha,o4--beta" && renders.length === 3 && fromO1 && !strayOut && v.ok,
    `org 1 (bare project keys) restored as org 4: ${keys}; its ${renders.length} renders from o1/ alone, the stray at a bare R2 key never exported; verify ${v.ok ? "green" : v.checks.filter((c) => !c.ok).map((c) => c.what + " " + (c.detail || "")).join(" | ")}`);
  const e4 = await U.exportOrg(w.DB, w.B, 4, { database: "mem" });
  const d = await U.deleteOrg(w.DB, w.B, 4, { confirm: "4", exp: e4.exp, database: "mem" });
  const strayKept = (await w.B.list("renders/alpha/")).some((x) => x.key === "renders/alpha/stray");
  ok(d.ok && await snapshotOrg(w, 1) === b1 && strayKept, `org 4 deleted (${d.deleted.rows} rows, ${d.deleted.objects} objects); org 1 exactly as before; the stray at the bare key untouched (${strayKept})`);
}

// ---- INVITE MARK: a deleted org's invite marks go to 0, never left for the next org's id ----
{
  const m = world();
  for (const [id, email, org] of [["acc-mark-2", "marked2@fresh.test", 2], ["acc-mark-1", "marked1@fresh.test", 1], ["acc-plain", "plain@fresh.test", null]])
    m.d.prepare("INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at, invited_org) VALUES (?, ?, 'h', 's', ?, ?, ?)").run(id, email, at(0), at(0), org);
  const b1 = await snapshotOrg(m, 1);
  const e = await U.exportOrg(m.DB, m.B, 2, { database: "mem" });
  const d = await U.deleteOrg(m.DB, m.B, 2, { confirm: "2", exp: e.exp, database: "mem" });
  const mark = (id) => { const r = m.d.prepare("SELECT invited_org FROM accounts WHERE id = ?").get(id); return r ? r.invited_org : "GONE"; };
  ok(d.ok && mark("acc-mark-2") === 0 && mark("acc-mark-1") === 1 && mark("acc-plain") === null && await snapshotOrg(m, 1) === b1,
    `org 2 deleted (${d.deleted.rows} rows): the account its invite link marked stays, its mark 0 (${mark("acc-mark-2")}: no org's id, never the next org's MAX + 1); org 1's mark (${mark("acc-mark-1")}) and an unmarked account (${mark("acc-plain")}) untouched; org 1 exactly as before`);
}

// ---- RESTORE --name: the org's new name is a remapping the record holds; verify undoes it (found by the sprint-6 live rehearsal:
// a renamed copy's verify failed on the org row alone) ----
{
  const m = world();
  const e = await U.exportOrg(m.DB, m.B, 2, { database: "mem" });
  const r = await restore(m, e.exp, bodiesOf(e), { name: "a renamed copy" });
  const v = await U.verifyRestore(m.DB, m.B, e.exp, r.rec);
  const named = m.d.prepare("SELECT name FROM org WHERE id = ?").get(r.rec.to).name;
  ok(named === "a renamed copy" && r.rec.name === "a renamed copy" && v.ok,
    `a copy restored --name "a renamed copy" carries that name, and its verify is green (${v.ok ? "green" : v.checks.filter((c) => !c.ok).map((c) => c.detail).join(" | ")})`);
  const real = r.rec.to;
  m.d.exec(`UPDATE org SET name = 'tampered' WHERE id = ${real}`);
  const vt = await U.verifyRestore(m.DB, m.B, e.exp, r.rec);
  ok(!vt.ok, `a name that is neither the source's nor the recorded one still fails the verify`);
}

// ---- THE OWNER'S SEAT SECRET (the sprint-7 review, D1): loadRestore's ownerPass gives the restored owner its seat secret beside
// its fresh key (tools/attack-xorg.mjs's throwaway owners sign in by it); without it the owner holds the key alone ----
{
  const m = world();
  const e = await U.exportOrg(m.DB, m.B, 2, { database: "mem" });
  const plan = await U.planRestore(m.DB, e.exp, {});
  await U.loadRestore(m.DB, m.B, plan, bodiesOf(e), { ownerKeyHash: sha("k-with-pass"), ownerPass: { hash: "ph-1", salt: "ps-1" }, chunk: 50 });
  const own = m.d.prepare("SELECT key_hash, pass_hash, pass_salt FROM people WHERE id = ? AND org = ?").get(plan.owner, plan.to);
  const others = m.d.prepare("SELECT COUNT(*) AS n FROM people WHERE org = ? AND id <> ? AND pass_hash IS NOT NULL").get(plan.to, plan.owner).n;
  const plan2 = await U.planRestore(m.DB, e.exp, {});
  await U.loadRestore(m.DB, m.B, plan2, bodiesOf(e), { ownerKeyHash: sha("k-no-pass"), chunk: 50 });
  const own2 = m.d.prepare("SELECT key_hash, pass_hash FROM people WHERE id = ? AND org = ?").get(plan2.owner, plan2.to);
  ok(own.key_hash === sha("k-with-pass") && own.pass_hash === "ph-1" && own.pass_salt === "ps-1" && others === 0 && own2.key_hash === sha("k-no-pass") && own2.pass_hash === null,
    `ownerPass: the restored owner of org ${plan.to} takes its seat secret with its key (no other person does); without it (org ${plan2.to}) the key alone, as before`);
}

// ---- OTHER ORGS DURING A DELETE: the invariant is that the delete LOSES none of their rows ----
// A fresh world per case; the binding's batch (the delete's one atomic batch) is followed by another org's write, as live traffic
// lands between the delete and its after-count. "kept" (--live): a gain is a note, a loss fails; "exact" (--local) fails on either.
{
  const during = async (others, after) => {
    const m = world();
    m.d.exec(`INSERT INTO events (id, person_id, kind, created_at, org) VALUES ('org1-before', '${ORG1.owner}', 'fragment', '${at(8)}', 1)`);
    // org 1's check AC.3, not graded yet: its k_check_ungraded row (migrate-041's trigger) goes when it is graded
    m.d.exec(`INSERT INTO k_checks (project, id, title, refs, created_by, created_at, updated_by, updated_at) VALUES ('alpha', 'AC.3', 'later', '[]', '${ORG1.owner}', '${at(1)}', '${ORG1.owner}', '${at(1)}')`);
    const e = await U.exportOrg(m.DB, m.B, 2, { database: "mem" });
    const DB = { prepare: m.DB.prepare, batch: async (list) => { const r = await m.DB.batch(list); after(m.d); return r; } };
    return U.deleteOrg(DB, m.B, 2, { confirm: "2", exp: e.exp, database: "mem", ...(others ? { others } : {}) });
  };
  const gain = (d) => d.exec(`INSERT INTO events (id, person_id, kind, created_at, org) VALUES ('org1-during', '${ORG1.owner}', 'fragment', '${at(9)}', 1)`);
  const loss = (d) => d.exec("DELETE FROM events WHERE id = 'org1-before'");
  const swap = (d) => { loss(d); gain(d); };
  // legitimate shrink: org 1's derived rows (a check graded: k_check_ungraded loses its row; the search index with a goal's title)
  // and its expiring rows (its token, its preview, a sign-in attempt) — the old count rule called each a loss
  const shrink = (d) => {
    if (!d.prepare("SELECT 1 FROM k_check_ungraded WHERE project = 'alpha' AND check_id = 'AC.3'").get()) throw new Error("the fixture: AC.3 is not ungraded");
    d.exec(`INSERT INTO check_results (project, pack_version, check_id, status, transmission_id, graded_by, graded_at) VALUES ('alpha', 'd1', 'AC.3', 'proven', 'T-20261006-003', '${ORG1.member}', '${at(9)}')`);
    if (d.prepare("SELECT 1 FROM k_check_ungraded WHERE project = 'alpha' AND check_id = 'AC.3'").get()) throw new Error("the fixture: AC.3 still ungraded after its grade");
    d.exec("DELETE FROM tokens WHERE org = 1"); d.exec("DELETE FROM previews WHERE project = 'alpha'"); d.exec("DELETE FROM login_attempts WHERE org = 1");
  };
  const g = await during("kept", gain), l = await during("kept", loss), sw = await during("kept", swap), sh = await during("kept", shrink), x = await during(undefined, gain), xl = await during("exact", loss);
  ok(g.ok && g.othersRule === "kept" && !g.othersLost.length && g.othersGained.join() === "events +1" && /none lost a row/.test(g.othersNote || "") && !g.left.length && g.deleted.rows > 0 && /proven/.test(g.atomic || ""),
    `"kept" (--live): org 1 gains an event while org 2 is deleted — ok, with a note (${g.othersNote}); the batch proven atomic first`);
  ok(!l.ok && l.othersLost.length === 1 && /^events: 1 gone \(\["org1-before"\]\)$/.test(l.othersLost[0]) && !l.left.length,
    `"kept" (--live): org 1 LOSES an event while org 2 is deleted — not ok (${(l.othersLost || []).join(", ")}), org 2 itself at 0`);
  ok(!sw.ok && /^events: 1 gone \(\["org1-before"\]\)$/.test((sw.othersLost || [])[0] || "") && sw.othersGained.join() === "events +1",
    `"kept" (--live): a loss offset by a gain (one event gone, another written: the count unchanged) — still a loss, not ok (${(sw.othersLost || []).join(", ")})`);
  ok(sh.ok && !sh.othersLost.length && !sh.left.length && sh.othersGained.includes("check_results +1"),
    `"kept" (--live): org 1's derived rows shrink (k_check_ungraded) and its expiring rows go (tokens, previews, sign-in attempts) while org 2 is deleted — ok (never compared: ${U.KEPT_SKIP.join(", ")} and the derived tables)`);
  ok(!x.ok && x.othersRule === "exact" && x.othersMoved.some((s) => /^events /.test(s)) && !xl.ok && xl.othersMoved.some((s) => /^events /.test(s)),
    `"exact" (the default, --local): a gain (${x.othersMoved.join(", ")}) and a loss (${xl.othersMoved.join(", ")}) both fail — the smoke's stronger rule stays`);
}

// ---- ATOMIC: the live delete proves the batch is one transaction first (finding 13) ----
{
  const run = async (atomic, o = {}) => {
    const m = world();
    const e = await U.exportOrg(m.DB, m.B, 2, { database: "mem" });
    // a backend whose batch runs statement by statement, autocommit (each kept when a later one fails), or D1's own transaction
    const DB = atomic ? m.DB : { prepare: m.DB.prepare, batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
    const before = m.d.prepare("SELECT (SELECT COUNT(*) FROM transmission WHERE org = 2) AS tx, (SELECT COUNT(*) FROM transmission WHERE org = 2 AND eval = 1) AS ev, (SELECT COUNT(*) FROM people WHERE org = 2) AS pe").get();
    const r = await U.deleteOrg(DB, m.B, 2, { confirm: "2", exp: e.exp, database: "mem", ...o });
    const after = m.d.prepare("SELECT (SELECT COUNT(*) FROM transmission WHERE org = 2) AS tx, (SELECT COUNT(*) FROM transmission WHERE org = 2 AND eval = 1) AS ev, (SELECT COUNT(*) FROM people WHERE org = 2) AS pe").get();
    const probes = m.d.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE id LIKE 'org-undo-probe-%'").get().n;
    return { r, before, after, probes, objects: (await m.B.list("o2/")).length };
  };
  const n = await run(false, { proveAtomic: true }), y = await run(true, { proveAtomic: true }), k = await run(false, { others: "kept" });
  ok(n.r.refused && /not proven atomic.*first statement's row stayed/.test(n.r.refused) && canon(n.before) === canon(n.after) && n.after.ev === 0 && n.probes === 0 && n.objects === 7,
    `a batch run statement by statement: the delete REFUSES before its batch — nothing deleted, no contribution eval-marked (${n.after.ev}), no probe row left (${n.r.refused})`);
  ok(y.r.ok && /proven/.test(y.r.atomic || "") && y.after.tx === 0 && y.probes === 0, `a transactional batch: proven (a failing probe left no row), then the delete (${y.r.deleted.rows} rows)`);
  ok(k.r.refused && /not proven atomic/.test(k.r.refused) && canon(k.before) === canon(k.after), `"kept" (the live rule) proves it by default: refused on the non-transactional backend, nothing deleted`);
}

// ---- THE CLI ----
{
  const tmp = mkdtempSync(join(tmpdir(), "org-undo-selftest-"));
  try {
    const cfg = join(tmp, "wrangler.jsonc");
    writeFileSync(cfg, `{ // a live config's shape\n "name": "x", "d1_databases": [{ "binding": "DB", "database_name": "live-db", "database_id": "00000000-0000-0000-0000-000000000000" }],\n "r2_buckets": [{ "binding": "BRAIN", "bucket_name": "live-brain" }], "vars": { "URL": "https://a.example//b" } }`);
    const cli = (...a) => { try { execFileSync("node", [join(ENGINE, "tools", "org-undo.mjs"), ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" } }); return { rc: 0 }; } catch (e) { return { rc: e.status, out: `${e.stdout || ""}${e.stderr || ""}` }; } };
    const u = cli("delete"), l1 = cli("plan", "--org", "2", "--live", "--config", cfg), l2 = cli("plan", "--org", "2", "--live", "--config", cfg, "--confirm-live", "other-db"), l3 = cli("plan", "--org", "2", "--live", "--config", cfg, "--confirm-live", "live-db");
    ok(u.rc === 2 && l1.rc === 1 && /confirm-live/.test(l1.out) && l2.rc === 1 && l3.rc === 1 && /CLOUDFLARE_API_TOKEN/.test(l3.out),
      `the CLI: usage 2; --live without --confirm-live 1, with another database's name 1, with no credentials 1 before any network (${String(l3.out).trim().slice(0, 90)})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

console.log(`${failed ? "✗" : "✓"} org-undo selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
