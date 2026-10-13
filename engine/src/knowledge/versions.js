// src/knowledge/versions.js — a project's versions: snapshots of its knowledge, in D1 (k_versions, k_snapshots).
// publish_version copies every knowledge table of the project into k_snapshots and appends a k_versions row; restore_version
// writes a snapshot back over the project's knowledge and appends a "restored" version. Both run INSIDE the database: one
// INSERT … SELECT (or DELETE) per table, their column lists built from the registry (src/knowledge/schema.js), all in ONE
// D1 batch together with the call's one ledger row (core.js fileTransmission, kind knowledge) — the worker never loops over
// the rows (a free-plan request gets about 10 ms of CPU), and either all of it lands or none of it does. What changed from
// the version before is worked out in the same batch and kept on the version's row, so the readers (the head, the list)
// are one statement each, memoized per request under "knowledge:".
// A restore never loses work: in the same batch, what the project holds now is first kept as a version of its own ("Before
// restoring vX", cause published) unless it is the newest version's content already, and the restored state follows it.
import { db } from "../data.js";
import { KINDS, KNOWLEDGE_KINDS, nounOf, rolesAdmit } from "./schema.js";
import { reqMemo, forgetReqMemo } from "../reqmemo.js";
import { seatsOnce, doorProject, fileTransmission } from "../core.js";
import { KNOWLEDGE_KIND } from "../transmission.js";
import { KNOWLEDGE_LAST_SQL } from "../hotsql.js";
import { now, isEvalMark, isD1Quota } from "../util.js";
import { projectSlug } from "../project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key

export const VERSION_CAUSES = ["published", "restored"];
export const VERSIONS_MAX = 100;     // versions listed, newest first
export const DIFF_MAX = 30;          // diff lines shown; the rest are counted
export const TITLE_MAX = 200;
// D1 caps a row at 2,000,000 bytes. A snapshot chunk takes rows while the running size before a row is under CHUNK_BYTES,
// so it holds at most CHUNK_BYTES plus its last row; schema.js caps every field (a doc's or a card's body by its bytes), so
// CHUNK_BYTES + the largest row the registry allows stays under D1's cap by construction. The bound is a design-time
// proof, never a runtime check: tools/versions-selftest.mjs (F6) works it out from the registry and goes red if a field's
// cap or CHUNK_BYTES would let a chunk pass the cap.
export const CHUNK_BYTES = 500000;

const AUDIT = ["created_by", "created_at", "updated_by", "updated_at"];
// what a snapshot holds per kind: the table, every column the registry names plus who wrote it when, and the key.
// A question's options ride inside its row ("options": [{idx, what, tradeoff}]) and take the question's who and when back.
export const OPTION_COLS = ["idx", "what", "tradeoff"];
export const SNAPSHOT = KNOWLEDGE_KINDS.map((kind) => ({
  kind, table: KINDS[kind].table, cols: [...KINDS[kind].cols.map((c) => c.c), ...AUDIT], key: KINDS[kind].key.map((c) => c.c),
}));
// every table a restore replaces (k_check_refs and k_check_ungraded follow k_checks through their own triggers)
export const RESTORED_TABLES = [...SNAPSHOT.map((s) => s.table), "k_options"];
const KIND_OF_TABLE = Object.fromEntries(SNAPSHOT.map((s) => [s.table, s.kind]));
// the field a diff line names an item by. A render and a style are snapshotted like every kind, as their INDEX rows (k_renders,
// k_styles: the hash names the body): their bodies are immutable R2 objects that are never deleted (src/knowledge/write.js),
// so a version's index rows ARE the version's renders, and a restore brings back exactly the bodies they name.
const LABEL_COL = { aim: "aim", goal: "title", question: "question", check: "title", card: "name", card_kind: "label", node: "name", edge: "label", gtm: null, doc: "title",
  render: "screen", style: "id" };


// ---- the statements ----
const OPTIONS_JSON = "json((SELECT json_group_array(json(x)) FROM (SELECT json_object(" + OPTION_COLS.map((c) => `'${c}', o.${c}`).join(", ") +
  ") AS x FROM k_options o WHERE o.project = t.project AND o.qid = t.qid ORDER BY o.idx)))";
const rowJson = (s) => `json_object(${s.cols.map((c) => `'${c}', t.${c}`).join(", ")}${s.kind === "question" ? `, 'options', ${OPTIONS_JSON}` : ""})`;
// snapshot: the table's rows of the project as JSON objects, cut into chunks by their running size (in key order, so the
// primary key feeds the running sum with no sort), one k_snapshots row a chunk. Binds ?1 project, ?2 n, ?3 who, ?4 at.
const keyOrder = (s) => (s.key.length ? s.key.map((k) => `k_${k}`).join(", ") : "k_project");
const keyCols = (s) => (s.key.length ? s.key : ["project"]).map((k) => `t.${k} AS k_${k}`).join(", ");
export const snapshotSql = (s) =>
  "INSERT INTO k_snapshots (project, n, table_name, chunk, payload, created_by, created_at, updated_by, updated_at) " +
  `SELECT ?1, ?2, '${s.table}', chunk, json_group_array(json(r)), ?3, ?4, ?3, ?4 FROM (` +
  `SELECT r, (SUM(b) OVER (ORDER BY ${keyOrder(s)} ROWS UNBOUNDED PRECEDING) - b) / ${CHUNK_BYTES} AS chunk FROM (` +
  `SELECT ${rowJson(s)} AS r, length(CAST(${rowJson(s)} AS BLOB)) AS b, ${keyCols(s)} FROM ${s.table} t WHERE t.project = ?1)) GROUP BY chunk`;
// restore, by difference (a D1 row written costs more than one read, and an index entry is a row written too): first every
// row of the project that is not, byte for byte, a row of the snapshot is deleted (its JSON is built exactly as the
// snapshot built it); then every snapshot row whose key is no longer there is inserted. A row the restore does not change
// is never written. A question's options go with their question: the options of a question that was deleted, then those of
// a question that was inserted. Binds ?1 project, ?2 the version restored.
const snapValues = (table) => `SELECT j.value FROM k_snapshots s, json_each(s.payload) j WHERE s.project = ?1 AND s.n = ?2 AND s.table_name = '${table}'`;
export const restoreDeleteSql = (s) => `DELETE FROM ${s.table} AS t WHERE t.project = ?1 AND ${rowJson(s)} NOT IN (${snapValues(s.table)})`;
export const RESTORE_DELETE_OPTIONS_SQL = "DELETE FROM k_options WHERE project = ?1 AND qid NOT IN (SELECT qid FROM k_questions WHERE project = ?1)";
const keyMissing = (s, alias) => `NOT EXISTS (SELECT 1 FROM ${s.table} x WHERE x.project = ?1${s.key.map((k) => ` AND x.${k} = json_extract(${alias}.value, '$.${k}')`).join("")})`;
export const restoreInsertSql = (s) =>
  `INSERT INTO ${s.table} (project, ${s.cols.join(", ")}) SELECT ?1, ${s.cols.map((c) => `json_extract(j.value, '$.${c}')`).join(", ")} ` +
  `FROM k_snapshots s, json_each(s.payload) j WHERE s.project = ?1 AND s.n = ?2 AND s.table_name = '${s.table}' AND ${keyMissing(s, "j")}`;
const qx = (c) => `json_extract(q.value, '$.${c}')`;
export const RESTORE_OPTIONS_SQL =
  `INSERT INTO k_options (project, qid, ${OPTION_COLS.join(", ")}, ${AUDIT.join(", ")}) ` +
  `SELECT ?1, ${qx("qid")}, ${OPTION_COLS.map((c) => `json_extract(o.value, '$.${c}')`).join(", ")}, ${qx("updated_by")}, ${qx("updated_at")}, ${qx("updated_by")}, ${qx("updated_at")} ` +
  "FROM k_snapshots s, json_each(s.payload) q, json_each(q.value, '$.options') o WHERE s.project = ?1 AND s.n = ?2 AND s.table_name = 'k_questions' " +
  `AND NOT EXISTS (SELECT 1 FROM k_options x WHERE x.project = ?1 AND x.qid = ${qx("qid")} AND x.idx = json_extract(o.value, '$.idx'))`;
// restoreStatements(env, project, v) -> the statements that make the project's knowledge snapshot v's, in order
export const restoreStatements = (env, project, v) => [
  ...SNAPSHOT.map((s) => db(env).prepare(restoreDeleteSql(s)).bind(project, v)),
  db(env).prepare(RESTORE_DELETE_OPTIONS_SQL).bind(project),
  ...SNAPSHOT.map((s) => db(env).prepare(restoreInsertSql(s)).bind(project, v)),
  db(env).prepare(RESTORE_OPTIONS_SQL).bind(project, v),
];
// A version's number is ?2 (bound), or, in a restore's batch, NEXT_N: the one after the newest version at the moment the
// statement runs (the restore's "Before restoring" version is written only when the project held something new, so the
// restored version's number is settled inside the batch; ?2 is the floor).
const NEXT_N = "max(?2, (SELECT COALESCE(MAX(x.n), 0) + 1 FROM k_versions x WHERE x.project = ?1))";
// the restored version keeps the restored one's content as its own snapshot. Binds ?1 project, ?2 n (the floor), ?3 who,
// ?4 at, ?5 the version restored.
const copySnapshotSql = (N) => "INSERT INTO k_snapshots (project, n, table_name, chunk, payload, created_by, created_at, updated_by, updated_at) " +
  `SELECT project, ${N}, table_name, chunk, payload, ?3, ?4, ?3, ?4 FROM k_snapshots WHERE project = ?1 AND n = ?5`;
export const COPY_SNAPSHOT_NEXT_SQL = copySnapshotSql(NEXT_N);

// the version row, written after its snapshot (publish and restore alike): `counts` holds the rows per kind, read off the
// snapshot, and `changes`, what changed from the version before it — computed HERE, once, from the two snapshots, so no read
// ever diffs. The rows of both sides are keyed per kind and compared without who and when; a chunk whose payload is the
// same on both sides is skipped whole (its rows are the same), so an unchanged table costs no row reads. changes: { from,
// total, byKind: [[table, op, count]], lines: the first DIFF_MAX [op, table, key, label, roles, kindRoles] (added, changed,
// removed; in the registry's kind order; roles: a card's, a doc's or a card kind's roleVisibility then, kindRoles: a card's
// kind's, so a reader the list does not admit is never shown the name: redactChanges) }, null for v1. Binds ?1 project,
// ?2 n, ?3 who, ?4 at, ?5 title, ?6 cause, ?7 cause_ref.
const keyOf = `CASE s.table_name ${SNAPSHOT.map((s) => `WHEN '${s.table}' THEN ${s.key.length ? s.key.map((k) => `json_extract(j.value, '$.${k}')`).join(" || '|' || ") : "''"}`).join(" ")} END`;
const side = (N, mine, other, tag) => `SELECT s.table_name AS t, ${keyOf} AS k, json_remove(j.value, ${AUDIT.map((c) => `'$.${c}'`).join(", ")}) AS v, ${tag} AS side ` +
  `FROM k_snapshots s, json_each(s.payload) j WHERE s.project = ?1 AND s.n = ${mine} AND ${N} > 1 ` +
  `AND s.payload NOT IN (SELECT o.payload FROM k_snapshots o WHERE o.project = ?1 AND o.n = ${other} AND o.table_name = s.table_name)`;
// the rows that differ between version N - 1 and version N: one per (table, key) added (+), changed (~) or removed (-)
const changedRows = (N) => "SELECT t, k, CASE WHEN COUNT(*) = 2 THEN '~' WHEN MIN(side) = 2 THEN '+' ELSE '-' END AS op, COALESCE(MAX(CASE WHEN side = 2 THEN v END), MAX(v)) AS v " +
  `FROM (${side(N, `${N} - 1`, N, 1)} UNION ALL ${side(N, N, `${N} - 1`, 2)}) GROUP BY t, k HAVING COUNT(*) = 1 OR MIN(v) <> MAX(v)`;
const labelOf = `CASE t ${SNAPSHOT.filter((s) => LABEL_COL[s.kind]).map((s) => `WHEN '${s.table}' THEN json_extract(v, '$.${LABEL_COL[s.kind]}')`).join(" ")} END`;
const ROLE_TABLES = SNAPSHOT.filter((s) => ["card", "doc", "card_kind"].includes(s.kind)).map((s) => `'${s.table}'`).join(", ");
const rolesOf = `CASE WHEN t IN (${ROLE_TABLES}) THEN json_extract(v, '$.role_visibility') END`;
const kindRolesOf = "CASE WHEN t = 'k_cards' THEN (SELECT kk.role_visibility FROM k_card_kinds kk WHERE kk.project = ?1 AND kk.key = json_extract(v, '$.kind')) END";
const tableOrder = `CASE t ${SNAPSHOT.map((s, i) => `WHEN '${s.table}' THEN ${i}`).join(" ")} END`;
const versionRowSql = (N) =>
  "INSERT INTO k_versions (project, n, title, cause, cause_ref, counts, created_by, created_at, updated_by, updated_at) " +
  `WITH d AS MATERIALIZED (${changedRows(N)}) ` +
  `SELECT ?1, ${N}, ?5, ?6, ?7, json_object(` +
  SNAPSHOT.map((s) => `'${s.kind}', COALESCE(SUM(CASE WHEN table_name = '${s.table}' THEN json_array_length(payload) END), 0)`).join(", ") +
  `, 'changes', CASE WHEN ${N} > 1 THEN json_object('from', ${N} - 1, 'total', (SELECT COUNT(*) FROM d), ` +
  "'byKind', json((SELECT json_group_array(json_array(t, op, c)) FROM (SELECT t, op, COUNT(*) AS c FROM d GROUP BY t, op))), " +
  "'lines', json((SELECT json_group_array(json_array(op, t, k, substr(COALESCE(label, k), 1, 120), json(roles), json(kroles))) " +
  `FROM (SELECT op, t, k, ${labelOf} AS label, ${rolesOf} AS roles, ${kindRolesOf} AS kroles FROM d ` +
  `ORDER BY ${tableOrder}, CASE op WHEN '+' THEN 0 WHEN '~' THEN 1 ELSE 2 END, k LIMIT ${DIFF_MAX})))) END), ?3, ?4, ?3, ?4 ` +
  `FROM k_snapshots WHERE project = ?1 AND n = ${N}`;
export const VERSION_ROW_SQL = versionRowSql("?2");
export const RESTORED_VERSION_SQL = versionRowSql(NEXT_N);
// a restore's "Before restoring" snapshot (version ?2, the one after the head) is dropped when it holds nothing the head does
// not (no row differs, who and when aside: the diff's own comparison, so matching chunks cost no row reads); its version row
// is then not written either (KEPT_VERSION_SQL: a version row only over a snapshot that is there). A project holding no
// knowledge at all keeps nothing either: there is nothing to lose. Binds ?1 project, ?2 n.
export const DROP_UNCHANGED_SQL = `DELETE FROM k_snapshots WHERE project = ?1 AND n = ?2 AND NOT EXISTS (${changedRows("?2")})`;
export const KEPT_VERSION_SQL = VERSION_ROW_SQL + " HAVING COUNT(*) > 0";

// the reads: the head (one row on the primary key, every signed-in page pays it); the list, newest first, with the project's
// name on every row (the project row leads, so a project with no version still answers its name: one statement for the whole
// Versions read); one version
export const VERSION_HEAD_SQL = "SELECT n, title, cause, cause_ref, created_at FROM k_versions WHERE project = ? ORDER BY n DESC LIMIT 1";
const VERSION_COLS = "v.n, v.title, v.cause, v.cause_ref, v.counts, v.created_at, p.name AS by_name";
export const VERSION_LIST_SQL = `SELECT pr.name AS project_name, ${VERSION_COLS} FROM projects pr LEFT JOIN k_versions v ON v.project = pr.key ` +
  `LEFT JOIN people p ON p.id = v.created_by WHERE pr.key = ? ORDER BY v.n DESC LIMIT ${VERSIONS_MAX}`;
export const VERSION_ONE_SQL = `SELECT ${VERSION_COLS} FROM k_versions v LEFT JOIN people p ON p.id = v.created_by WHERE v.project = ? AND v.n = ?`;

// ---- the reads ----
const clip = (s, n = TITLE_MAX) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const OPS = { "+": "added", "~": "changed", "-": "removed" };
// changesOf(stored, n) -> { from, to, lines: [{ op, what, ref, label }], more, byKind: { kind: { added, changed, removed } } }
// in the registry's kind order; v1 (nothing before it): { from: null, to: 1, lines: [], more: 0, byKind: {} }
function changesOf(c, n) {
  if (!c || typeof c !== "object") return { from: null, to: n, lines: [], more: 0, byKind: {} };
  const byKind = {};
  for (const [t, op, k] of Array.isArray(c.byKind) ? c.byKind : []) {
    const kind = KIND_OF_TABLE[t];
    if (!kind || !OPS[op]) continue;
    (byKind[kind] || (byKind[kind] = { added: 0, changed: 0, removed: 0 }))[OPS[op]] += Number(k) || 0;
  }
  const lines = (Array.isArray(c.lines) ? c.lines : []).filter((l) => Array.isArray(l) && KIND_OF_TABLE[l[1]] && OPS[l[0]])
    .map((l) => {
      const [op, t, k, label] = l, kind = KIND_OF_TABLE[t];
      // the roles the line was made under (see VERSION_ROW_SQL); a line made before they were kept carries none: unknown
      const roles = l.length > 4 ? { item: Array.isArray(l[4]) ? l[4] : null, kind: Array.isArray(l[5]) ? l[5] : null } : undefined;
      return { op, what: kind, ref: k === "" ? kind : String(k), label: k === "" && !label ? `the ${nounOf(kind, 1)}` : clip(label, 120), [ROLES]: roles };
    });
  const ordered = Object.fromEntries(SNAPSHOT.filter((s) => byKind[s.kind]).map((s) => [s.kind, byKind[s.kind]]));
  return { from: Number(c.from) || null, to: n, lines, more: Math.max(0, (Number(c.total) || 0) - lines.length), byKind: ordered };
}
// a diff line's roles ride under a symbol: never on the wire (JSON.stringify skips it), read by redactChanges alone
const ROLES = Symbol("roles");
const REDACTED = new Set(["card", "doc", "card_kind"]);
// redactChanges(changes, reader) -> the diff as this reader may see it: a card, a doc or a card kind whose list (the card's
// kind's too) does not admit the reader's role (schema.js rolesAdmit, the read rule) is named by its kind alone, never by
// its name, title or id; so is one from a version made before lines kept their roles. The owner sees every name.
export function redactChanges(changes, reader) {
  if (!changes || !Array.isArray(changes.lines)) return changes;
  const role = reader && reader.role;
  const lines = changes.lines.map((l) => {
    const r = l[ROLES];
    const who = reader && typeof reader === "object" ? reader : role;   // the reader's keys (src/hats.js readerKeys: role, label, access hats)
    const open = role === "owner" || !REDACTED.has(l.what) || (r !== undefined && rolesAdmit(who, r.item) && (l.what !== "card" || rolesAdmit(who, r.kind)));
    return open ? { op: l.op, what: l.what, ref: l.ref, label: l.label } : { op: l.op, what: l.what, ref: l.what, label: `a ${nounOf(l.what, 1)} you cannot read` };
  });
  return { ...changes, lines };
}
// rowOf(dbRow) -> { n, title, at, by, cause: { kind, ref }, counts: { kind: rows }, changes }
export function rowOf(r) {
  if (!r) return null;
  let c = null; try { c = JSON.parse(r.counts || "null"); } catch { c = null; }
  const counts = {};
  for (const s of SNAPSHOT) if (c && Number.isFinite(Number(c[s.kind]))) counts[s.kind] = Number(c[s.kind]);
  const n = Number(r.n);
  return { n, title: r.title || "", at: r.created_at || null, by: r.by_name ?? null,
    cause: { kind: VERSION_CAUSES.includes(r.cause) ? r.cause : "published", ref: r.cause_ref ?? null }, counts, changes: changesOf(c && c.changes, n) };
}

// versionHead(env, project) -> { n, title, at, cause: { kind, ref } } | null: the project's newest version
export function versionHead(env, project) {
  if (!project) return Promise.resolve(null);
  return reqMemo(env, `knowledge:${project}:version-head`, async () => {
    const r = await db(env).prepare(VERSION_HEAD_SQL).bind(project).first();
    return r ? { n: Number(r.n), title: r.title || "", at: r.created_at || null, cause: { kind: r.cause, ref: r.cause_ref ?? null } } : null;
  });
}
// versionList(env, project) -> { name, rows }: the project's name (null for no such project) and its versions newest first
// (at most VERSIONS_MAX)
export function versionList(env, project) {
  if (!project) return Promise.resolve({ name: null, rows: [] });
  return reqMemo(env, `knowledge:${project}:version-list`, async () => {
    const res = (await db(env).prepare(VERSION_LIST_SQL).bind(project).all()).results || [];
    return { name: (res[0] && res[0].project_name) || null, rows: res.filter((r) => r.n != null).map(rowOf) };
  });
}
// versionOne(env, project, n) -> the row, or null
export function versionOne(env, project, n) {
  if (!project || !Number.isInteger(n)) return Promise.resolve(null);
  return reqMemo(env, `knowledge:${project}:version:${n}`, async () => rowOf(await db(env).prepare(VERSION_ONE_SQL).bind(project, n).first()));
}

// ---- the writes ----
// versionProjectOf(person, a, env) -> { project } | a refusal: the owner's project for a version call — named (any active
// project), else the one the door's own rule stamps (core.js doorProject, as preview then save_knowledge resolves it)
async function versionProjectOf(person, a, env) {
  const seats = await seatsOnce(env, person.id);
  const d = await doorProject(person, { project: a.project }, seats, env);
  if (d.error) return d;
  if (!d.project) return { error: "project_required", note: "Add `project`: the key of the project to version (`whoami` lists the projects)." };
  return { project: d.project };
}
const ownerOnly = { error: "owner_only", note: "Only the owner publishes or restores a version. `versions` lists them; viewing is free." };
export const nOf = (v) => { const m = /^v?(\d{1,9})$/i.exec(String(v ?? "").trim()); return m ? Number(m[1]) : null; };

// run(person, env, project, statements, ledger) -> the filing's receipt | a refusal. The statements and the ledger row are
// ONE D1 batch.
async function run(person, env, project, stmts, { what, touches, via, ev }) {
  let res;
  try {
    res = await fileTransmission(person, {
      lane: "leader", kind: KNOWLEDGE_KIND, what, touches, via, eval: ev,
      why: `The project's versions, through the knowledge door (${via}).`,
    }, env, { reserved: true, project, batch: stmts });
  } catch (e) {
    if (isD1Quota(e)) throw e;
    return { error: "write_failed", project, note: `Nothing was written (${String((e && e.message) || e).slice(0, 200)}). Read \`versions\` and retry.` };
  }
  forgetReqMemo(env, "knowledge:");   // a later read in this request sees the new version (and a restore's knowledge)
  return res;
}

// publishVersion(person, { project?, title, eval? }, env, { via }) -> { project, version: row, ledger } | a refusal
export async function publishVersion(person, a = {}, env, { via = "mcp" } = {}) {
  if (!person || person.role !== "owner") return ownerOnly;
  const title = clip(a && a.title);
  if (!title) return { error: "title_required", note: "Send title: why this version exists, in a line (it heads the version on Versions)." };
  const pr = await versionProjectOf(person, a || {}, env);
  if (pr.error) return pr;
  const project = pr.project;
  const head = await versionHead(env, project);
  const n = (head ? head.n : 0) + 1, who = person.id, at = now();
  const stmts = [
    ...SNAPSHOT.map((s) => db(env).prepare(snapshotSql(s)).bind(project, n, who, at)),
    db(env).prepare(VERSION_ROW_SQL).bind(project, n, who, at, title, "published", null),
  ];
  const res = await run(person, env, project, stmts, { what: `Published v${n}: ${title}`, touches: [`version:${n}`], via, ev: isEvalMark(a.eval) });
  if (res.error) return res;
  const version = await versionOne(env, project, n);
  return { project, version: version && { ...version, changes: redactChanges(version.changes, person) }, ledger: res.id,
    note: `v${n} holds the project's knowledge as it is now; restore_version {v: ${n}} brings it back.` };
}

// filedSinceHead(last, head) -> was knowledge filed after the head version? The newest knowledge filing of the project
// (hotsql.js KNOWLEDGE_LAST_SQL, one row) is the head version's own (its touches name version:<head>) unless something was
// filed after it. It only predicts: the restore's batch decides for itself (DROP_UNCHANGED_SQL), byte for byte.
const filedSinceHead = (last, head) => !(last && String(last.touches || "").split(",").includes(`version:${head.n}`));
const restoredWhat = (v, n, kept) => `Restored v${v} as v${n}${kept ? `; what the project held before is kept as v${kept}` : ""}`;

// restoreVersion(person, { project?, v, eval? }, env, { via }) -> { project, restored, kept, version: row, ledger } | a refusal.
// The project's knowledge becomes version v's (every table replaced), live at once, and NOTHING is lost: in the same batch,
// what the project holds now is first kept as version n+1 ("Before restoring vX", cause published) — unless it is exactly
// the newest version's content already, when no identical version is made — and the restored state is appended after it
// (cause restored, ref v), so the restore itself can always be undone. kept: the number of that kept version, or null.
// Restoring the current version with nothing filed since is refused already_current (nothing would change).
export async function restoreVersion(person, a = {}, env, { via = "mcp" } = {}) {
  if (!person || person.role !== "owner") return ownerOnly;
  const v = nOf(a && a.v);
  const pr = await versionProjectOf(person, a || {}, env);
  if (pr.error) return pr;
  const project = pr.project;
  const [target, head, last] = await Promise.all([v != null ? versionOne(env, project, v) : Promise.resolve(null), versionHead(env, project),
    db(env).prepare(KNOWLEDGE_LAST_SQL).bind(project).first()]);
  if (!target || !head) {
    return { error: "unknown_version", project, v: a && a.v != null ? String(a.v).slice(0, 40) : null,
      note: head ? `No version ${a && a.v != null ? String(a.v).slice(0, 40) : ""} in ${projectSlug(project)}: send v as a number from v1 to v${head.n} (\`versions\` lists them).`
        : `${projectSlug(project)} has no version yet: the owner makes v1 with publish_version.` };
  }
  const since = filedSinceHead(last, head);
  if (v === head.n && !since) {
    return { error: "already_current", project, v, note: `v${v} is the current version and nothing was filed since it, so restoring it would change nothing. \`versions\` lists the others.` };
  }
  const kept = head.n + 1, who = person.id, at = now();
  const n = since ? head.n + 2 : head.n + 1;   // predicted; the batch settles it
  const title = clip(`Restored v${v}${target.title ? `: ${target.title}` : ""}`);
  const stmts = [
    // 1 · what the project holds now, as version `kept` — dropped again when it is the head's content
    ...SNAPSHOT.map((s) => db(env).prepare(snapshotSql(s)).bind(project, kept, who, at)),
    db(env).prepare(DROP_UNCHANGED_SQL).bind(project, kept),
    db(env).prepare(KEPT_VERSION_SQL).bind(project, kept, who, at, clip(`Before restoring v${v}`), "published", null),
    // 2 · the restore, and the restored version after whichever is newest now
    ...restoreStatements(env, project, v),
    db(env).prepare(COPY_SNAPSHOT_NEXT_SQL).bind(project, kept, who, at, v),
    db(env).prepare(RESTORED_VERSION_SQL).bind(project, kept, who, at, title, "restored", String(v)),
  ];
  const touches = (m, k) => [`version:${v}`, ...(k ? [`version:${k}`] : []), `version:${m}`];
  const res = await run(person, env, project, stmts, { what: restoredWhat(v, n, since ? kept : null), touches: touches(n, since ? kept : null), via, ev: isEvalMark(a.eval) });
  if (res.error) return res;
  const now2 = await versionHead(env, project);
  const got = now2 ? now2.n : n, keptN = got === head.n + 2 ? kept : null;
  if (got !== n && res.id) {
    // the prediction missed (knowledge landed between the read and the batch): the ledger row says what the batch did
    try { await db(env).prepare("UPDATE transmission SET what = ?, touches = ? WHERE id = ? AND org = {org}").bind(restoredWhat(v, got, keptN), touches(got, keptN).join(","), res.id).run(); }
    catch (e) { if (isD1Quota(e)) throw e; }
  }
  const version = await versionOne(env, project, got);
  return { project, restored: v, kept: keptN, version: version && { ...version, changes: redactChanges(version.changes, person) }, ledger: res.id,
    note: keptN
      ? `The project's knowledge is v${v}'s again, on every screen now, as v${got}. What it held just before (the work since v${head.n}) is kept as v${keptN}: restore_version {v: ${keptN}} brings it back.`
      : `The project's knowledge is v${v}'s again, on every screen now, as v${got}. Nothing had changed since v${head.n}, so nothing was lost: restore_version {v: ${head.n}} undoes this restore.` };
}
