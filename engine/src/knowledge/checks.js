// src/knowledge/checks.js — the check register (k_checks) and its grades (check_results): a check's latest grade, the checks
// that name one ref, and a node's light. Which checks name a ref is read from k_check_refs (migrate-040: one row per check
// and ref, kept by triggers from k_checks.refs), so a light reads the node's own rows, never the whole register; a node's
// light itself is ONE row of k_node_lights (migrate-043, kept exact by triggers on k_check_refs and check_results). Every
// read is one statement, memoized per request under "knowledge:" (the write door forgets it).
import { db } from "../data.js";
import { reqMemo, REQ_MEMO } from "../reqmemo.js";

// check_results.pack_version is NOT NULL: a grade of a check in the D1 register (no pack) is recorded against "live"
export const LIVE_VERSION = "live";
export const GRADE_VERDICTS = ["proven", "refused", "incomplete"];

// the (project, ref, check_id) rows: k_check_refs, or — on a database migrate-040 has not reached — the same rows derived
// from k_checks.refs (a scan of the register; the answer is the same)
const REFS_TABLE = "k_check_refs";
const REFS_DERIVED = "(SELECT c.project AS project, j.value AS ref, c.id AS check_id FROM k_checks c, json_each(COALESCE(c.refs, '[]')) j WHERE c.project = ?1)";
const noRefsTable = (e) => /no such table: k_check_refs/.test(String((e && e.message) || e));
async function withRefs(run) {
  try { return await run(REFS_TABLE); } catch (e) { if (noRefsTable(e)) return run(REFS_DERIVED); throw e; }
}
// the latest grade of the check a row names: check_results by (project, check_id, graded_at) newest first, one probe
const LATEST = (col) => `(SELECT x.id FROM check_results x WHERE x.project = ?1 AND x.check_id = ${col} ORDER BY x.graded_at DESC, x.id DESC LIMIT 1)`;

// LIGHTS_SQL(from) -> per ref of ?2 (a JSON list): how many checks name it, how many of those are graded, and of their
// latest grades how many passed (proven) and failed (refused)
export const LIGHTS_SQL = (from = REFS_TABLE) => "SELECT r.ref AS ref, COUNT(*) AS total, COUNT(g.id) AS graded, " +
  "COALESCE(SUM(g.status = 'proven'), 0) AS passed, COALESCE(SUM(g.status = 'refused'), 0) AS failed " +
  `FROM ${from} r LEFT JOIN check_results g ON g.id = ${LATEST("r.check_id")} ` +
  "WHERE r.project = ?1 AND r.ref IN (SELECT value FROM json_each(?2)) GROUP BY r.ref";
// CHECKS_FOR_SQL(from) -> the checks naming any ref of ?2, each with its latest grade, in id order (at most ?3)
export const CHECKS_FOR_SQL = (from = REFS_TABLE) => "SELECT c.*, g.status AS g_status, g.graded_at AS g_at, g.graded_by AS g_by " +
  `FROM k_checks c LEFT JOIN check_results g ON g.id = ${LATEST("c.id")} ` +
  `WHERE c.project = ?1 AND c.id IN (SELECT r.check_id FROM ${from} r WHERE r.project = ?1 AND r.ref IN (SELECT value FROM json_each(?2))) ` +
  "ORDER BY c.id LIMIT ?3";
export const CHECK_SQL = "SELECT * FROM k_checks t WHERE t.project = ? AND t.id = ?";
export const CHECK_GRADES_SQL = "SELECT status, graded_at, graded_by, transmission_id, pack_version FROM check_results " +
  "WHERE project = ? AND check_id = ? ORDER BY graded_at DESC, id DESC LIMIT ?";

// lightOf(counts) -> "green" (every check that names it passes) · "red" (one fails) · "amber" (some are graded, not all
// pass) · "grey" (none is graded, or no check names it)
export function lightOf(c) {
  if (!c || !c.graded) return "grey";
  if (c.failed > 0) return "red";
  return c.passed === c.total ? "green" : "amber";
}
const ZERO = Object.freeze({ total: 0, graded: 0, passed: 0, failed: 0 });
// sum(counts…) -> the counts of a node named under more than one id (an entity and the table it is stored in)
export const sumCounts = (list) => list.reduce((a, c) => (c ? { total: a.total + c.total, graded: a.graded + c.graded, passed: a.passed + c.passed, failed: a.failed + c.failed } : a), { ...ZERO });

// NODE_LIGHTS_SQL -> per ref of ?2 (a JSON list): its row of k_node_lights (migrate-043: the four counts of the checks
// naming it by their latest verdict, kept exact by triggers on k_check_refs and check_results), one primary-key probe per
// ref that has a row; the same answer LIGHTS_SQL computes from the checks and their grades (tools/maplights-selftest.mjs)
export const NODE_LIGHTS_SQL = "SELECT node_id AS ref, green, red, amber, grey FROM k_node_lights WHERE project = ?1 AND node_id IN (SELECT value FROM json_each(?2))";
const noLightsTable = (e) => /no such table: k_node_lights/.test(String((e && e.message) || e));
// countsOfRow(row) -> {total, graded, passed, failed} off a k_node_lights row
export const countsOfRow = (r) => {
  const g = Number(r.green) || 0, rd = Number(r.red) || 0, a = Number(r.amber) || 0, n = Number(r.grey) || 0;
  return { total: g + rd + a + n, graded: g + rd + a, passed: g, failed: rd };
};

// countsFor(env, project, ids) -> Map(id -> {total, graded, passed, failed}) for every id asked (ZERO when no check names
// it). One statement for the ids this request has not read yet, over k_node_lights (one row per id, never the checks that
// name it); on a database migrate-043 has not reached, LIGHTS_SQL over the checks (the same answer). Each id's answer is
// memoized on its own, so a page's lights and its inspector's share one read.
export function countsFor(env, project, ids) {
  const want = [...new Set((ids || []).filter((x) => typeof x === "string" && x))];
  if (!project || !want.length) return Promise.resolve(new Map(want.map((id) => [id, ZERO])));
  const key = (id) => `knowledge:${project}:light:${id}`;
  const memo = env && env[REQ_MEMO];
  const missing = memo instanceof Map ? want.filter((id) => !memo.has(key(id))) : want;
  let batch = null;
  const derived = () => withRefs(async (from) => {
    const rows = (await db(env).prepare(LIGHTS_SQL(from)).bind(project, JSON.stringify(missing)).all()).results || [];
    return new Map(rows.map((r) => [String(r.ref), { total: Number(r.total) || 0, graded: Number(r.graded) || 0, passed: Number(r.passed) || 0, failed: Number(r.failed) || 0 }]));
  });
  const load = () => (batch ||= (async () => {
    try {
      const rows = (await db(env).prepare(NODE_LIGHTS_SQL).bind(project, JSON.stringify(missing)).all()).results || [];
      return new Map(rows.map((r) => [String(r.ref), countsOfRow(r)]));
    } catch (e) { if (noLightsTable(e)) return derived(); throw e; }
  })());
  return Promise.all(want.map((id) => reqMemo(env, key(id), () => load().then((m) => m.get(id) || ZERO)))).then((vals) => new Map(want.map((id, i) => [id, vals[i]])));
}

// decodeCheck(row) -> a check as read answers it (schema.js KINDS.check's fields). Decoded here, not through the
// registry: schema.js imports decisions.js, which reaches this module through the store, and a static import back would
// be a cycle that evaluates schema.js too early.
const json = (v) => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };
export const decodeCheck = (r) => ({ id: r.id, kind: r.kind ?? null, method: r.method ?? null, severity: r.severity ?? null, title: r.title ?? null,
  given: r.given ?? null, when: r.when_ ?? null, then: r.then_ ?? null, sourceType: r.source_type ?? null, sourceId: r.source_id ?? null,
  refs: json(r.refs), rulings: json(r.rulings), status: r.status ?? null,
  createdBy: r.created_by ?? null, createdAt: r.created_at ?? null, updatedBy: r.updated_by ?? null, updatedAt: r.updated_at ?? null });
// a check row as the register answers it: the check's own fields and its latest grade ({verdict, at, by} or null)
const checkOf = (r) => ({ ...decodeCheck(r), grade: r.g_status ? { verdict: r.g_status, at: r.g_at, by: r.g_by } : null });

// checksFor(env, project, refs, { limit }) -> { checks, more }: the checks naming any of refs, each with its latest grade
export async function checksFor(env, project, refs, { limit = 200 } = {}) {
  const want = [...new Set((refs || []).filter(Boolean))];
  if (!project || !want.length) return { checks: [], more: false };
  const rows = await withRefs(async (from) => (await db(env).prepare(CHECKS_FOR_SQL(from)).bind(project, JSON.stringify(want), limit + 1).all()).results || []);
  return { checks: rows.slice(0, limit).map(checkOf), more: rows.length > limit };
}

// checkById(env, project, id, { grades }) -> the check with its latest grades (newest first, at most `grades`), or null
export async function checkById(env, project, id, { grades = 20 } = {}) {
  if (!project || !id) return null;
  const [row, g] = await Promise.all([db(env).prepare(CHECK_SQL).bind(project, id).first(), db(env).prepare(CHECK_GRADES_SQL).bind(project, id, grades).all()]);
  if (!row) return null;
  const hist = ((g && g.results) || []).map((x) => ({ verdict: x.status, at: x.graded_at, by: x.graded_by, transmission: x.transmission_id, version: x.pack_version }));
  return { ...decodeCheck(row), grade: hist[0] ? { verdict: hist[0].verdict, at: hist[0].at, by: hist[0].by } : null, grades: hist };
}

// checkExists(env, project, id) -> true when the project's register holds the check (its primary key)
export async function checkExists(env, project, id) {
  if (!project || !id) return false;
  return !!(await db(env).prepare("SELECT 1 AS x FROM k_checks WHERE project = ? AND id = ?").bind(project, id).first());
}
