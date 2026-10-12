// src/measures.js — the beta measures (sprint 3, S3b; docs/plan/MCP.md §9 demand 4, BETA.md: an outside team runs its own
// org, so our measures reach us only if its admin exports them). Counted from the ledger, for the ORG, in three bounded
// statements; shown on Control · Admin to the admin (src/controlpage.js) and exported as JSON by the admin (GET
// /control/measures?download=1). Each measure carries its definition in one plain sentence (the tile's title, and the
// export's `definition`).
//
// WHAT COUNTS. A contribution is a row of the ledger (transmission) that is NOT eval-marked (eval = 0: the suites' rows and a
// marked walk's never count); it LANDED when it was filed straight through (route auto) or approved. A person is an ACTIVE
// person who is not one of the suites' fixed seats (eval-fixed-*). A HANDOFF is a pick-up of a contribution's next action
// by someone other than its contributor (src/pickup.js: the activation event), on an unmarked contribution. A goal is REAL
// when its project still holds it (k_goals).
//
// THE STATEMENTS (rows read on the real-data org: the selftest pins the shape, page-budget measures Control with them):
//   H · MEASURES_HANDOFFS_SQL: every handoff, grouped by the week it was picked up, on idx_transmission_handoffs (a partial
//       index holding only handoffs: migrate-053), a k_goals probe for each one marked done on a goal. Rows: the handoffs, plus
//       one per done handoff on a goal.
//   P · MEASURES_PEOPLE_SQL: one row per active person, and for each, on idx_transmission_submitter (submitter, created_at):
//       their first unmarked filing, their first landed one (a walk in time order, stopped at the first), and whether they
//       filed in days 7-13 and 28-34 after their first (two probes stopped at the first row). Rows: about 5 a person.
//   R · MEASURES_ROLES_SQL: ONE row, the lanes counted per goal in SQL off the goals tally (transmission_goals: migrate-042/054,
//       landed and unmarked rows only, by goal, lane, month and kind): each project's goal range of the tally's primary key
//       (project, clean, goal_ref), a group emptied by a decision or a delete skipped, then one probe of k_goals per goal (a real
//       goal). Rows: the projects, the tally's rows that name a goal, one probe a goal; never the tally's rows that name none.
//       The projects are walked on the table itself (NOT INDEXED): their org is GENERATED from the key (migrate-067), so a walk of
//       the key's index would read each project's row a second time to test it.
// Nothing here reads a whole table to count it; nothing is per project (one org, one set of numbers).
// sprint 6, 6.3 (PLATFORM §2 item 6: an owner owns one org): every statement counts the READER'S org alone (src/data.js {org}, the
// org from the sign-in): H the org's handoffs (+t.org on the same walk of the partial index), P the org's people (the probes
// per person run for them alone), R the org's projects' goal ranges. On a database holding one org each reads the rows it read.
import { db } from "./data.js";

export const SPARK_WEEKS = 8;

// copy: off-screen (the tiles' titles and the export's definitions: what each measure counts, in one sentence)
export const MEASURES = [
  { key: "first_handoff", label: "First pick-up", definition: "The day someone first took the next action of a contribution another person filed: the activation event." },
  { key: "repeat_handoffs", label: "Repeat pick-ups", definition: "Every such pick-up after the first: each time someone took the next action of a contribution another person filed." },
  { key: "week1_return", label: "Week-1 return", definition: "Of the people whose second week is over, those who filed again 7 to 13 days after their first filing." },
  { key: "week4_return", label: "Week-4 return", definition: "Of the people whose fifth week is over, those who filed again 28 to 34 days after their first filing." },
  { key: "cross_role", label: "Cross-role goals", definition: "Of the goals that drew landed contributions, those that drew them from two or more lanes." },
  { key: "first_useful", label: "First useful", definition: "The median days from a person's invite to their first landed contribution, over the people who have one." },
  { key: "activated", label: "Activated", definition: "Yes once two different people carried one piece of work on a real goal: one filed a contribution naming it, the other took its next action and marked it done." },
];

// H: binds ?1 now (ISO). A minimum carries its row's project (and goal) in the same string, "<time>|<project>[|<goal>]".
export const MEASURES_HANDOFFS_SQL =
  "SELECT CAST((julianday(?1) - julianday(t.next_picked_at)) / 7 AS INTEGER) AS wk, COUNT(*) AS n, MIN(t.next_picked_at || '|' || t.project) AS first, " +
  "MIN(CASE WHEN t.next_done_at IS NOT NULL AND t.goal_ref IS NOT NULL AND EXISTS (SELECT 1 FROM k_goals g WHERE g.project = t.project AND g.id = t.goal_ref) " +
  "THEN t.next_done_at || '|' || t.project || '|' || t.goal_ref END) AS activated " +
  "FROM transmission t INDEXED BY idx_transmission_handoffs WHERE t.next_picked_by IS NOT NULL AND t.next_picked_by <> t.submitter AND +t.eval = 0 AND +t.org = {org} GROUP BY wk";
// P: binds nothing; at most 500 people
const FIRST = (who, extra = "") => `(SELECT t.created_at FROM transmission t INDEXED BY idx_transmission_submitter WHERE t.submitter = ${who} AND +t.eval = 0${extra} ORDER BY t.created_at LIMIT 1)`;
const BACK = (from, to) => `EXISTS (SELECT 1 FROM transmission t INDEXED BY idx_transmission_submitter WHERE t.submitter = x.id AND t.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', x.first_at, '+${from} days') AND t.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', x.first_at, '+${to} days') AND +t.eval = 0)`;
export const MEASURES_PEOPLE_SQL =
  `WITH x AS MATERIALIZED (SELECT p.id, p.role, p.created_at, ${FIRST("p.id")} AS first_at, ${FIRST("p.id", " AND (t.route = 'auto' OR t.decision = 'approve')")} AS first_landed ` +
  "FROM people p INDEXED BY idx_people_active WHERE p.active = 1 AND p.id NOT LIKE 'eval-fixed-%' AND +p.org = {org} LIMIT 500) " +
  `SELECT x.id, x.role, x.created_at, x.first_at, x.first_landed, ${BACK(7, 14)} AS back_w1, ${BACK(28, 35)} AS back_w4 FROM x`;
// R: binds nothing; answers { goals, cross_goals, most }: the real goals that drew landed work, those that drew it from two lanes or
// more, and the most lanes one goal drew
export const MEASURES_ROLES_SQL =
  "SELECT COUNT(*) AS goals, COALESCE(SUM(x.lanes >= 2), 0) AS cross_goals, COALESCE(MAX(x.lanes), 0) AS most FROM (" +
  "SELECT pr.key AS project, tg.goal_ref, COUNT(DISTINCT tg.lane) AS lanes FROM projects pr NOT INDEXED CROSS JOIN transmission_goals tg ON tg.project = pr.key AND tg.clean = 1 AND tg.goal_ref > '' " +
  "WHERE +pr.org = {org} AND tg.kind IN ('*', 'knowledge') AND tg.n > 0 GROUP BY pr.key, tg.goal_ref) x " +
  "WHERE EXISTS (SELECT 1 FROM k_goals g WHERE g.project = x.project AND g.id = substr(x.goal_ref, 2))";

const DAY = 864e5;
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// measuresFrom({ handoffs, people, roles }, nowMs) -> the measures, pure (the selftest recounts the same rows by hand); roles is
// MEASURES_ROLES_SQL's one row
export function measuresFrom(rows, nowMs = Date.now()) {
  const H = rows.handoffs || [], P = rows.people || [], Rr = rows.roles || {};
  const total = H.reduce((a, r) => a + Number(r.n || 0), 0);
  const first = H.map((r) => r.first).filter(Boolean).sort()[0] || null;
  const [firstAt, ...firstProject] = first ? String(first).split("|") : [];
  const spark = Array.from({ length: SPARK_WEEKS }, (_, i) => { const wk = SPARK_WEEKS - 1 - i; const r = H.find((x) => Number(x.wk) === wk); return r ? Number(r.n) : 0; });
  const act = H.map((r) => r.activated).filter(Boolean).sort()[0] || null;
  const [actAt, actProject, ...actGoal] = act ? String(act).split("|") : [];
  const ms = (iso) => Date.parse(String(iso || ""));
  const filed = P.filter((p) => p.first_at);
  const w1Due = filed.filter((p) => nowMs - ms(p.first_at) >= 14 * DAY), w4Due = filed.filter((p) => nowMs - ms(p.first_at) >= 35 * DAY);
  const invited = P.filter((p) => p.role !== "owner");
  const days = invited.filter((p) => p.first_landed).map((p) => Math.max(0, (ms(p.first_landed) - ms(p.created_at)) / DAY)).filter(Number.isFinite);

  const value = {
    first_handoff: { at: firstAt || null, project: firstProject.length ? firstProject.join("|") : null },
    repeat_handoffs: { count: Math.max(0, total - 1), handoffs: total, perWeek: spark },
    week1_return: { returned: w1Due.filter((p) => Number(p.back_w1) === 1).length, of: w1Due.length },
    week4_return: { returned: w4Due.filter((p) => Number(p.back_w4) === 1).length, of: w4Due.length },
    cross_role: { goals: Number(Rr.cross_goals) || 0, of: Number(Rr.goals) || 0, mostLanes: Number(Rr.most) || 0 },
    first_useful: { medianDays: r1(median(days)), people: days.length, of: invited.length },
    activated: { yes: !!act, at: actAt || null, project: actProject || null, goal: actGoal.length ? actGoal.join("|") : null },
  };
  return MEASURES.map((m) => ({ ...m, value: value[m.key] }));
}

// readMeasures(env, { nowMs }) -> { at, measures } — three statements, side by side
export async function readMeasures(env, o = {}) {
  const nowMs = o.nowMs || Date.now();
  const at = new Date(nowMs).toISOString();
  const [h, p, r] = await Promise.all([
    db(env).prepare(MEASURES_HANDOFFS_SQL).bind(at).all(),
    db(env).prepare(MEASURES_PEOPLE_SQL).all(),
    db(env).prepare(MEASURES_ROLES_SQL).all(),
  ]);
  const rows = { handoffs: (h && h.results) || [], people: (p && p.results) || [], roles: ((r && r.results) || [])[0] || {} };
  return { at, measures: measuresFrom(rows, nowMs) };
}

// exportOf(read, { org }) -> the export: the numbers with their definitions, counts and dates only (no person, no name, no id
// but a project's key and a goal's id)
export function exportOf(read, o = {}) {
  return { format: "sharingu-measures/1", org: o.org || null, at: read.at,
    note: "Counted from the ledger; eval-marked rows never count. Each measure carries its definition.",
    measures: read.measures.map((m) => ({ key: m.key, label: m.label, definition: m.definition, value: m.value })) };
}
