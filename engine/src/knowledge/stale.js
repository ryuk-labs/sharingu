// src/knowledge/stale.js — stale proof by change (sprint 3, B4; migrate-054.sql has the rule and the write cost): a check's
// grade is stale at a node it names when the node changed after the grade. Three rows hold it, every one kept exact by
// migrate-054's triggers, so a reader never compares a grade with a change itself:
//   · k_node_stale (project, node_id): changed_at, changed_by (the contribution, or NULL for a knowledge write) and stale (the
//     checks naming the node whose latest grade is older than changed_at), one row per node that changed while graded;
//   · k_check_stale (project, check_id): the stale checks;
//   · k_fill (project, 'stale').n: how many there are (read with the meter's own k_fill row, src/checklist.js).
// The reads here are each one indexed statement, memoized per request under "knowledge:" (the write door forgets it). On a
// database migrate-054 has not reached every read answers "nothing is stale", never an error.
import { db } from "../data.js";
import { reqMemo } from "../reqmemo.js";

export const STALE_POLL_MAX = 200;
// the project's stale marks: the rows with stale > 0 only (the partial index idx_k_node_stale_on), the Map's and the Screens
// view's one extra statement
export const STALE_MARKS_SQL = "SELECT node_id, stale, changed_at, changed_by FROM k_node_stale INDEXED BY idx_k_node_stale_on WHERE project = ?1 AND stale > 0";
// the rows of some nodes (the inspector, a goal's checks, the Impact view): one primary-key probe per id
export const STALE_OF_SQL = "SELECT node_id, stale, changed_at, changed_by FROM k_node_stale WHERE project = ?1 AND node_id IN (SELECT value FROM json_each(?2))";
// the lights poll: the stale marks that moved after a moment (idx_k_node_stale_at)
export const STALE_SINCE_SQL = `SELECT node_id, stale, changed_at, updated_at FROM k_node_stale WHERE project = ?1 AND updated_at > ?2 ORDER BY updated_at LIMIT ${STALE_POLL_MAX + 1}`;
// some checks' stale flags (the Impact view's proof to redo; the checks of a pinned node): one probe per id
export const CHECKS_STALE_SQL = "SELECT check_id FROM k_check_stale WHERE project = ?1 AND check_id IN (SELECT value FROM json_each(?2))";

// per ref: how many STALE checks name it, read from the stale checks outward: k_check_stale's range, then each one's refs on
// idx_k_check_refs_check (CROSS JOIN keeps that order). Rows read: the stale checks and their refs (saruspay with 13 stale
// checks: 48), whatever the refs asked; the caller keeps the refs it wants (an IN list against each stale check's refs read the
// list once per check: 938 rows for Goals' 66 goals, measured with tools/page-budget.mjs)
export const STALE_BY_REF_SQL = "SELECT r.ref, COUNT(*) AS n FROM k_check_stale z CROSS JOIN k_check_refs r INDEXED BY idx_k_check_refs_check ON r.project = z.project AND r.check_id = z.check_id " +
  "WHERE z.project = ?1 GROUP BY r.ref";

// R1 (bounded by the sprint-4 review, L2): for each set of refs, how many stale checks name any ref in it, counted in SQL —
// each set's refs probe k_check_refs on its primary key (project, ref, …) and each named check probes k_check_stale once, so
// the rows read are the refs asked and the checks naming them, never every stale check with all its refs (a staled register
// of 600 checks × 3 refs read about 2,400 rows on every Map load); the Map counts a flow's stale checks from it
export const STALE_COUNT_SQL = "SELECT s.key AS i, COUNT(DISTINCT r.check_id) AS n FROM json_each(?2) s, json_each(s.value) ref " +
  "JOIN k_check_refs r ON r.project = ?1 AND r.ref = ref.value JOIN k_check_stale z ON z.project = r.project AND z.check_id = r.check_id GROUP BY s.key";

const noTable = (e) => /no such (table|index): (k_node_stale|k_check_stale|idx_k_node_stale_on)/.test(String((e && e.message) || e));
const rowOf = (r) => ({ stale: Number(r.stale) || 0, at: r.changed_at ? String(r.changed_at) : null, by: r.changed_by ? String(r.changed_by) : null });

// staleMarks(env, project) -> Map(node id -> { stale, at, by }): every node of the project with a stale count above zero
export function staleMarks(env, project) {
  if (!project) return Promise.resolve(new Map());
  return reqMemo(env, `knowledge:${project}:stale-marks`, async () => {
    try { return new Map(((await db(env).prepare(STALE_MARKS_SQL).bind(project).all()).results || []).map((r) => [String(r.node_id), rowOf(r)])); }
    catch (e) { if (noTable(e)) return new Map(); throw e; }
  });
}
// staleFor(env, project, ids) -> Map(id -> { stale, at, by }) for the ids that ever changed while graded (absent: never)
export async function staleFor(env, project, ids) {
  const want = [...new Set((ids || []).filter((x) => typeof x === "string" && x))];
  if (!project || !want.length) return new Map();
  return reqMemo(env, `knowledge:${project}:stale-of:${want.join("\u0001")}`, async () => {
    try { return new Map(((await db(env).prepare(STALE_OF_SQL).bind(project, JSON.stringify(want)).all()).results || []).map((r) => [String(r.node_id), rowOf(r)])); }
    catch (e) { if (noTable(e)) return new Map(); throw e; }
  });
}
// staleChecks(env, project, ids) -> Set of the check ids among ids that are stale
export async function staleChecks(env, project, ids) {
  const want = [...new Set((ids || []).filter((x) => typeof x === "string" && x))];
  if (!project || !want.length) return new Set();
  try { return new Set(((await db(env).prepare(CHECKS_STALE_SQL).bind(project, JSON.stringify(want)).all()).results || []).map((r) => String(r.check_id))); }
  catch (e) { if (noTable(e)) return new Set(); throw e; }
}
// staleByRef(env, project, refs) -> Map(ref -> how many stale checks name it) (Goals: the checks a goal rolls up)
export async function staleByRef(env, project, refs) {
  const want = [...new Set((refs || []).filter((x) => typeof x === "string" && x))];
  if (!project || !want.length) return new Map();
  const keep = new Set(want);
  try { return new Map(((await db(env).prepare(STALE_BY_REF_SQL).bind(project).all()).results || []).filter((r) => keep.has(String(r.ref))).map((r) => [String(r.ref), Number(r.n) || 0])); }
  catch (e) { if (noTable(e)) return new Map(); throw e; }
}
// staleCountOf(env, project, sets) -> [n]: for each set of refs, how many stale checks name any ref in it (each check counted
// once per set); one statement for every set together, counted in the SQL (STALE_COUNT_SQL; s.key is the set's index)
export async function staleCountOf(env, project, sets) {
  const list = (sets || []).map((x) => [...new Set(x || [])]);
  if (!project || !list.length) return list.map(() => 0);
  const out = list.map(() => 0);
  let rows;
  try { rows = (await db(env).prepare(STALE_COUNT_SQL).bind(project, JSON.stringify(list)).all()).results || []; }
  catch (e) { if (noTable(e)) return out; throw e; }
  for (const r of rows) { const i = Number(r.i); if (Number.isInteger(i) && i >= 0 && i < out.length) out[i] = Number(r.n) || 0; }
  return out;
}
// staleSince(env, project, since) -> [{ id, stale, at, moved }] in the order they moved (the lights poll), and `more`
export async function staleSince(env, project, since) {
  if (!project) return { stale: [], more: false };
  try {
    const rows = (await db(env).prepare(STALE_SINCE_SQL).bind(project, since || "").all()).results || [];
    return { stale: rows.slice(0, STALE_POLL_MAX).map((r) => ({ id: String(r.node_id), stale: Number(r.stale) || 0, at: r.changed_at ? String(r.changed_at) : null, moved: String(r.updated_at) })), more: rows.length > STALE_POLL_MAX };
  } catch (e) { if (noTable(e)) return { stale: [], more: false }; throw e; }
}
// staleWords(stale, graded) -> "3 of 5 checks graded before the last change" (nothing stale: "")
export function staleWords(stale, graded) {
  const s = Number(stale) || 0, g = Number(graded) || 0;
  if (!s) return "";
  return `${s} of ${Math.max(s, g)} ${Math.max(s, g) === 1 ? "check" : "checks"} graded before the last change`;
}
