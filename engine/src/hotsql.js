// hotsql.js — the exact SQL text of the D1 hot readers src/index.js, src/holes.js and src/reports.js run
// (build0925:d1-hot-queries, from the 2026-09-25 d1QueriesAdaptiveGroups top list). They live in one importable
// module so tools/d1-hot-selftest.mjs runs EXPLAIN QUERY PLAN on the SAME strings the worker runs, against boot.sql
// with migrate-037.sql's indexes. It is never a hand-typed mirror. If you edit a string here, the selftest tells you
// whether the index still serves it.

// notMind(alias) — the ONE exclusion of R's own namespace (mind/*, M-ADR-012) from tenant glass. src/core.js exports it
// as NOT_MIND_TX (alias t) and NOT_MIND_TX_BARE (no alias), byte for byte; it lives here so a hot reader below can use it
// without importing core.js (which imports this module).
export const notMind = (alias) => { const a = alias ? alias + "." : ""; return `(${a}gaprefs IS NULL OR ${a}gaprefs NOT LIKE '%mind/%') AND (${a}components IS NULL OR ${a}components NOT LIKE '%mind/%')`; };
// notKinds(expr, list) — expr is none of the listed kinds, as a chain of <> (sprint 2, the live budget): a NOT IN list is read
// as a table, and D1 bills one row read for every row it tests, so a filter on the filings a page walks doubled what the page
// read. The list is a hotsql kind list ("('a','b')" or "'a','b'"); expr is never NULL where it is used (COALESCE(kind,'')).
export const notKinds = (expr, list) => String(list).replace(/[()]/g, "").split(",").map((k) => `${expr} <> ${k.trim()}`).join(" AND ");

// /audit's fixed exclusions (hot #4), moved here verbatim from src/index.js. The first three are ALSO the WHERE of
// migrate-037's partial index idx_events_audit(created_at). SQLite uses a partial index only when the query's WHERE
// contains each of the index's terms, so the planner walks the created_at order over rows that already pass them
// and stops at the LIMIT. Before, it walked idx_events_created_at through every session_open / fragment / file /
// mind / eval row until it had enough. Any edit to those three strings must be matched in migrate-037 (a new
// migration). The selftest fails if the audit plan stops using idx_events_audit.
export const AUDIT_INDEXED_CLAUSES = [
  // the ORG contribution trail (owner ruling S-040): contributions · rulings ·
  // decisions · drifts · corrections — never R/worker plumbing (fragments, raw
  // file banks, session opens) and never the mind namespace (ADR-075 disjoint).
  "e.kind NOT IN ('session_open','exit','fragment','file')",
  "COALESCE(json_extract(e.payload_json,'$.mind'),0) != 1",
  // the human trail never shows suite noise (the same cut Files applies):
  "COALESCE(json_extract(e.payload_json,'$.eval'),0) = 0",
];
export const AUDIT_BASE_CLAUSES = [
  ...AUDIT_INDEXED_CLAUSES,
  "COALESCE(json_extract(e.payload_json,'$.eval'),0) != 1",
  "COALESCE(json_extract(e.payload_json,'$.what'),'') NOT LIKE 'eval%'",
  "COALESCE(json_extract(e.payload_json,'$.title'),'') NOT LIKE 'eval-%'",
  // #5 (readiness review, Wave 2): the root-cause row (a live probe filed with
  // eval:0 but text reading "[EVAL PROBE]") slipped every guard above — none of
  // them are a PREFIX match on the bracketed/upper form. Defensive, in addition to
  // (never instead of) the eval-flag checks above; SQLite LIKE is ASCII
  // case-insensitive by default, so this also catches "eval probe"/"Eval Probe".
  "COALESCE(json_extract(e.payload_json,'$.what'),'') NOT LIKE '%eval probe%'",
  "COALESCE(json_extract(e.payload_json,'$.what'),'') NOT LIKE '%[eval%'",
  "COALESCE(json_extract(e.payload_json,'$.title'),'') NOT LIKE '%eval probe%'",
  "COALESCE(json_extract(e.payload_json,'$.title'),'') NOT LIKE '%[eval%'",
];
export const auditEventsSql = (clauses) =>
  "SELECT e.kind, e.lane AS ev_lane, e.payload_json, e.basis, e.touches, e.created_at, e.project, p.name AS by_name, COALESCE(p.title, p.role) AS by_role, p.lane AS by_lane " +
  "FROM events e JOIN people p ON p.id = e.person_id " +
  "WHERE " + clauses.join(" AND ") + " " +
  "ORDER BY e.created_at DESC LIMIT ?";

// The Decisions overlay (UI-B2, J1): every UNDECIDED filing (plus, UI-B3, every answer decided approve: see LIVE_COLS) that names a question by gapRefs q/<qid> (QB953462F),
// of the four kinds the Decisions and QuestionCard screens draw: answer (POST /respond), round (POST /round),
// counter and critique (a counter is a filing, QC8B94276). gapRefs are indexed into transmission_refs at filing
// time (core.js fileTransmission / fileTransmissionsBatch), so the overlay reads that index and never a
// `gaprefs LIKE` scan. CROSS JOIN pins transmission_refs as the outer loop, so the planner cannot start from
// transmission (its kind index would read every answer ever filed); tools/d1-hot-selftest.mjs checks the plan.
// GET /decisions reads the whole q/ namespace as ONE index range: D1 caps a statement at 100 bound parameters
// and a project holds hundreds of questions, so a per-qid IN-list cannot be one statement. A qid is one project's, so
// every overlay keeps the filings of the request's project only (`t.project = ?`, the row's own stamp): the same qid in
// another project never shows here. Suite rows are left out unless the caller asks (?eval=1).
// The overlay ALSO returns the answers decided approve: approving an answer rules its question in the same request, so
// liveOf (src/decisions.js) reads an approved answer as `ruled` (never as an open answer) only while its question is still
// open. decision and decided_at ride along for that.
const LIVE_COLS = "SELECT r.ref, t.id, t.kind, t.what, t.why, t.route, t.submitter, p.name AS by_name, t.created_at, t.eval, t.decision, t.decided_at " +
  "FROM transmission_refs r CROSS JOIN transmission t ON t.id = r.tid LEFT JOIN people p ON p.id = t.submitter ";
// UI-B4a C7: ONE standing-counter definition. A counter is a filing (QC8B94276) of kind counter or critique, and it STANDS
// until the owner rules it (decision set). Decisions, the QuestionCard, Home's S2 and the filing page's counters region
// all read this one string, so they show the same number by construction. standingCounter(alias) qualifies the two
// columns for a statement that joins transmission under an alias ("" for the unqualified form).
export const standingCounter = (alias) => { const a = alias ? alias + "." : ""; return `${a}kind IN ('counter','critique') AND ${a}decision IS NULL`; };
const LIVE_WHERE = "((t.kind IN ('answer','round') AND t.decision IS NULL) OR (" + standingCounter("t") + ") OR (t.kind = 'answer' AND t.decision = 'approve'))";
// Binds: project.
export const DECISIONS_LIVE_SQL = (includeEval) =>
  LIVE_COLS + "WHERE r.ref >= 'q/' AND r.ref < 'q0' AND t.project = ? AND " + LIVE_WHERE + (includeEval ? "" : " AND t.eval = 0") + " ORDER BY t.created_at";
// A face that shows only the OPEN questions (Home's decide rows: readDecisions opts.open) reads the same overlay for those
// qids alone (sprint 2, the live budget): one idx_transmission_refs_ref seek per open qid, never the whole q/ namespace (every
// ruled question's answers, rounds and counters). Binds: JSON array of the open qids, project.
export const OPEN_LIVE_SQL = (includeEval) =>
  LIVE_COLS + "WHERE r.ref IN (SELECT 'q/' || value FROM json_each(?)) AND t.project = ? AND " + LIVE_WHERE + (includeEval ? "" : " AND t.eval = 0") + " ORDER BY t.created_at";
// GET /question/:qid: the same overlay for one question. Binds: 'q/<qid>', project.
export const QUESTION_LIVE_SQL = (includeEval) =>
  LIVE_COLS + "WHERE r.ref = ? AND t.project = ? AND " + LIVE_WHERE + (includeEval ? "" : " AND t.eval = 0") + " ORDER BY t.created_at";
// The owner's blockers (src/decisions.js ownerOwed: the badge on every signed-in page, the heartbeat, `updates`) need only the
// ANSWERS on the project's OPEN questions (owedBy reads a pending answer or an approved one, never a counter or a round), so
// they read those alone: one idx_transmission_refs_ref seek per open qid (json_each: one bound parameter however many are
// open), never the whole q/ namespace. The same LIVE_COLS, so liveOf reads the rows unchanged. Binds: JSON array of the open
// qids, project. (A request that already read the whole overlay, Home or Decisions, reuses it instead: reqmemo.js.)
export const OWNER_OWED_LIVE_SQL = (includeEval) =>
  LIVE_COLS + "WHERE r.ref IN (SELECT 'q/' || value FROM json_each(?)) AND t.project = ? AND t.kind = 'answer' AND (t.decision IS NULL OR t.decision = 'approve')" +
  (includeEval ? "" : " AND t.eval = 0") + " ORDER BY t.created_at";
// POST /round {export}: the person's own undecided answer and round rows over the q/ namespace, in the request's project
// (not a hot path; one statement, the submitter's index then the refs index per row). Binds: person, project.
export const ROUND_EXPORT_SQL = (includeEval) =>
  "SELECT r.ref, t.id, t.kind, t.what, t.why, t.created_at FROM transmission t CROSS JOIN transmission_refs r ON r.tid = t.id " +
  "WHERE t.submitter = ? AND t.project = ? AND t.kind IN ('answer','round') AND t.decision IS NULL AND r.ref >= 'q/' AND r.ref < 'q0'" +
  (includeEval ? "" : " AND t.eval = 0") + " ORDER BY t.created_at";

// ---- Home (UI-B3): ONE composed read, src/home.js readHomeSummary ----
// At most five D1 statements beyond the memoized auth, in ONE parallel wave: S1 HOME_TX_AGG_SQL (every metric over the
// project's filings), S2 HOME_OWNER_ROWS_SQL for the admin (the approve and grant rows) or HOME_FIRST5_SQL for anyone
// else (the first-five signals, the EMPTY's next action), S3 DECISIONS_LIVE_SQL (the same string /decisions runs, via
// readDecisions), S4 HOME_GOALS_MOVED_SQL and S5 HOME_SEATS_SQL. Each takes `scoped`: true binds `project = ?` (the
// request's workspace, or the org's one declared project), false reads the rows no project stamps (`project IS NULL`,
// an org with no project axis), so both forms walk idx_transmission_project. tools/d1-hot-selftest.mjs (section G)
// EXPLAINs these exact strings on boot.sql + migrate-038.sql and runs them through the real handler.
// sprint 6 (6.2): the rows no project stamps are the READER'S org's (src/data.js {org}); `org` carries no index, so the walk on
// idx_transmission_project is the walk it always was
const projWhere = (col, scoped) => (scoped ? `${col} = ?` : `${col} IS NULL AND ${orgColOf(col)} = {org}`);
const txEval = (col, includeEval) => (includeEval ? "" : ` AND ${col} = 0`);
// orgColOf("+t.project") -> "t.org": the org column beside a project column (its alias, never its unary +)
const orgColOf = (col) => { const c = String(col).replace(/^\+/, ""); const i = c.lastIndexOf("."); return i < 0 ? "org" : c.slice(0, i + 1) + "org"; };
// ORG_BUCKETS(col) — a running count's rows of the READER'S org: its org-level bucket and its projects' (src/data.js tokens).
// Every hot read of `projects` filters its org with a bare `org = {org}` (the sprint-6 review, finding 6): migrate-067's
// idx_projects_org_slug serves it, so the read grows with the READER'S org's projects, never with every org's on the platform
// (a `+org` walk scanned the whole table on every request). A read in key order says ORDER BY slug: within one org the slug
// orders as the key does (one prefix, or none for org 1), and the index hands the rows over in that order with no sort (an
// ORDER BY key on it paid a sort of every row it read). src/backup.js keeps `+org`: it walks a table in its own order.
const ORG_BUCKETS = (col) => `(${col} = {orgbucket} OR ${col} IN (SELECT key FROM projects WHERE org = {org}))`;
// The kinds that are not an approve row: the Decisions overlay's four (they are questions' filings, drawn on
// /decisions) and grant (its own row kind, consent per occasion).
export const HOME_NOT_APPROVE = "('answer','round','counter','critique','grant')";
// the kinds that are never shipped work: a filing about another filing, a press, a knowledge write, an answer or a grade
export const SHIPPED_NOT_KIND = "('counter','critique','rank','restore','item','publish','equip','knowledge','answer','round','grant','grade')";
// the same list as one string, matched with instr(): a NOT IN list is read as a table, one row per filing it tests
const SHIPPED_NOT_KIND_CSV = "," + SHIPPED_NOT_KIND.replace(/[()' ]/g, "") + ",";
// the project's newest knowledge write (preview then save_knowledge files one kind knowledge row per call): "as of" on Home, `updates` and
// the heartbeat (core.js knowledgeAtOf). EXACT and ONE row read on migrate-041's partial index idx_transmission_knowledge
// (project, created_at) WHERE kind = 'knowledge' — the literal 'knowledge' is load-bearing (a bound kind cannot use a partial
// index), so a busy ledger never hides the last write. Newest first with LIMIT 1 rather than MAX: before the index exists
// the same statement walks idx_transmission_project newest first and stops at the first knowledge row. Binds: project.
const knowledgeAtOver = () => "(SELECT created_at FROM transmission WHERE project = ? AND kind = 'knowledge' ORDER BY created_at DESC LIMIT 1)";
export const KNOWLEDGE_AT_SQL = "SELECT " + knowledgeAtOver() + " AS at";
// the project's newest knowledge filing, its touches (src/knowledge/versions.js restoreVersion: is it the head version's own,
// or was knowledge filed since?) — its time off the same index, then the row at that time: two rows read. Binds: project.
export const KNOWLEDGE_LAST_SQL = "SELECT id, touches, created_at FROM transmission WHERE project = ?1 AND kind = 'knowledge' " +
  "AND created_at = (SELECT created_at FROM transmission WHERE project = ?1 AND kind = 'knowledge' ORDER BY created_at DESC LIMIT 1) LIMIT 1";
// ---- the ledger tallies (migrate-042): the sums a screen used to take over the project's WHOLE ledger ----
// transmission_open / transmission_kinds / transmission_goals are kept exact by triggers on transmission (migrate-042.sql
// says what each holds); a group emptied by a decision or a delete stays as a row of zeros, so every read skips it. project
// is '' for the rows no project stamps: tallyProj is the tally twin of projWhere. tools/tally-selftest.mjs proves each read
// below equals the ledger aggregate it replaced, over random filings, decisions and deletes.
// sprint 6 (6.2): the org-level bucket is the READER'S org's ({orgbucket}: '' for org 1, the statement it always was)
const tallyProj = (col, scoped) => (scoped ? `${col} = ?` : `${col} = {orgbucket}`);
// The badge's pending rulings (core.js briefCountFor): the not-closed filings routed to the owner, R's own out, suites' out
// unless asked, in the request's scope (projectScopeOf's filter: "eq" one project, "null" the rows no project stamps, "none"
// every row). A few rows of transmission_open on its primary key. Binds: [project] for "eq".
// sprint 6 (6.2): "null" is the READER'S org's org-level bucket ({orgbucket}, src/data.js: '' for org 1, as before), "none" (an
// org with no active project) the org's own buckets only: its org-level one and its projects' (never every org's).
export const OWNER_OPEN_COUNT_SQL = (filter, includeEval) =>
  "SELECT COALESCE(SUM(n),0) AS n FROM transmission_open WHERE route = 'owner' AND mind = 0" + (includeEval ? "" : " AND eval = 0") +
  (filter === "eq" ? " AND project = ?" : filter === "null" ? " AND project = {orgbucket}" : ` AND ${ORG_BUCKETS("project")}`);
// A person's open loops (migrate-042's loops_open tally, one or two rows on its primary key): the badge counts the ones that
// are not R's own (mind 0: a ref that is not mind/*), whoami counts them all. Binds: person.
export const LOOPS_OPEN_SQL = (allRefs) => "SELECT COALESCE(SUM(n),0) AS n FROM loops_open WHERE person_id = ?" + (allRefs ? "" : " AND mind = 0");
// The heartbeat's "what landed while you were away" (core.js heartbeatFor, every agent session's first call): the four kinds that
// move a lane, filed by someone else since the reader's last event, newest 40. It walks migrate-042's partial idx_events_landed
// (created_at) WHERE +kind IN (…): the term below is that WHERE byte for byte, and its unary + keeps idx_events_stamped
// (kind, stamped) off it, so the walk is the four kinds' rows since `since`, newest first, stopping at the LIMIT (sprint 2: it
// walked every ruling, drift, unknown and fragment ever filed on idx_events_stamped, then sorted). Before migrate-042 the same
// statement walks idx_events_created_at: slower, never an error. The suites' rows (an eval payload, a fixed eval seat, a row
// about an eval filing, a fragment banked for one) are out unless asked; a fragment's probe is ONE lookup on the partial
// idx_transmission_eval_report. nSeats: the org's declared eval seats (ids or emails, bound twice). Binds: since, reader id,
// [seats…, seats…].
// Review fix 2c (sprint 2): nProjects > 0 is a PARTNER's read: only the events stamped with one of their seated projects (bound
// last, after the seats), never the org's; the unary + keeps the walk on idx_events_landed. A Partner seated nowhere runs no
// statement at all (core.js heartbeatFor). Binds: since, reader id, [seats…, seats…], [projects…].
export const HEARTBEAT_LANDED_SQL = (includeEval, nSeats = 0, nProjects = 0) =>
  "SELECT e.kind, e.payload_json, e.basis, e.touches, e.created_at, p.name AS by_name, p.lane AS by_lane " +
  "FROM events e JOIN people p ON p.id = e.person_id " +
  "WHERE e.created_at > ? AND e.person_id != ? AND +e.kind IN ('ruling','drift','unknown','fragment') AND e.org = {org} " +
  (includeEval ? "" : "AND COALESCE(json_extract(e.payload_json,'$.eval'),0) = 0 AND e.person_id NOT LIKE 'eval-fixed-%'" +
    " AND NOT EXISTS (SELECT 1 FROM transmission tx WHERE tx.id = json_extract(e.payload_json,'$.transmissionId') AND tx.eval = 1)" +
    " AND (e.kind <> 'fragment' OR NOT EXISTS (SELECT 1 FROM transmission tr WHERE tr.report = json_extract(e.payload_json,'$.artifactId')" +
    " AND tr.eval = 1 AND tr.report IS NOT NULL))" +
    (nSeats ? ` AND lower(e.person_id) NOT IN (${Array(nSeats).fill("?").join(",")}) AND lower(COALESCE(p.email,'')) NOT IN (${Array(nSeats).fill("?").join(",")})` : "") + " ") +
  (nProjects > 0 ? `AND +e.project IN (${Array(nProjects).fill("?").join(",")}) ` : "") +
  "ORDER BY e.created_at DESC LIMIT 40";
// ---- `updates`' own items (src/thread.js threadFor, D5L): every region a window, newest first, the answer's `limit` in the SQL ----
// The person's newest filings, each with the rulings on it (one approval_audit probe a filing, idx_approval_audit_tx), on
// idx_transmission_submitter (submitter, created_at): `limit` filings and their rulings, never the person's whole ledger (the
// owner files most of it: the old read took every one of their filings to sort the rulings). The window is the filings this
// read lists: a ruling on an older filing is out. The unary + keeps idx_transmission_eval_created off. Binds: person, limit.
export const THREAD_YOURS_SQL = (includeEval) =>
  "SELECT t.id, t.kind, t.lane, t.what, t.route, t.status, t.decision, t.decided_at, t.decision_note, t.components, t.screens, t.gaprefs, t.project, t.created_at, " +
  "(SELECT json_group_array(json_object('id', a.id, 'verdict', a.verdict, 'note', a.note, 'created_at', a.created_at, 'by', COALESCE(p.name, a.decided_by))) " +
  "FROM approval_audit a LEFT JOIN people p ON p.id = a.decided_by WHERE a.transmission_id = t.id) AS rulings_json " +
  "FROM transmission t WHERE t.submitter=? AND " + (includeEval ? "" : "+t.eval=0 AND ") + notMind("t") + " ORDER BY t.created_at DESC LIMIT ?";
// What waits on the owner's ruling: the not-closed filings routed to the owner, newest first, on migrate-042's partial
// idx_transmission_owner_open (project, created_at) — INDEXED BY, as the planner otherwise walks idx_transmission_project over
// every filing of the project. `since` (the oldest of the person's own filings when that list is full): an older row cannot
// reach the answer's newest `limit`, so it is never read. `limit` is a clamped integer written into the text, so the
// project, when the scope filters one (src/project.js projectClause: "eq", "null", "none"), is the last bind.
// Binds: [since], [project].
export const THREAD_WAITING_SQL = (includeEval, filter, since, limit) =>
  "SELECT t.id, t.lane, t.kind, t.what, t.created_at, COALESCE(p.name, t.submitter) AS by_name " +
  "FROM transmission t INDEXED BY idx_transmission_owner_open LEFT JOIN people p ON p.id = t.submitter WHERE " + (since ? "t.created_at >= ? AND " : "") +
  (includeEval ? "" : "+t.eval=0 AND ") + "t.route='owner' AND t.status != 'closed' AND " + notMind("t") +
  (filter === "eq" ? " AND t.project = ?" : filter === "null" ? " AND t.project IS NULL AND t.org = {org}" : " AND t.org = {org}") +
  " ORDER BY t.created_at DESC LIMIT " + Math.max(1, Math.trunc(Number(limit)) || 1);
// The person's reports (the exit events wrap_up writes) and the questions they asked (kind unknown: `ask`), newest first on
// idx_events_person_kind (person_id, kind, created_at), the suites' rows out unless asked. Binds: person, limit.
export const THREAD_REPORTS_SQL = (includeEval) =>
  "SELECT id, payload_json, created_at FROM events WHERE person_id=? AND kind='exit'" + (includeEval ? "" : " AND (payload_json IS NULL OR payload_json NOT LIKE '%\"eval\":1%')") +
  " ORDER BY created_at DESC LIMIT ?";
export const THREAD_QUESTIONS_SQL = (includeEval) =>
  "SELECT id, payload_json, created_at FROM events WHERE person_id=? AND kind='unknown'" +
  (includeEval ? "" : " AND (payload_json IS NULL OR (payload_json NOT LIKE '%\"eval\":1%' AND payload_json NOT LIKE '%\"eval\":true%'))") +
  " ORDER BY created_at DESC LIMIT ?";

// S1 — one row, three parts. k and o are the tallies (the all-time counts: approve, grant and with a person are the
// owner-route undecided rows by kind; open filings and by agents the not-closed rows); w is the WEEK, read off the ledger on
// two disjoint ranges (what was filed in it on idx_transmission_project, what was filed before it and decided in it on
// idx_transmission_decided), so it reads the week's filings and decisions once each, never the ledger. Sprint 3 (B3): a
// record (RECORD_KINDS routed auto: a knowledge write, a grade with proof) is never counted. In motion (D2b) = what has not
// landed: with a person = route owner (any age: it waits on a person until decided) + needs more = route incomplete filed in
// the last seven days; a contribution filed straight through has LANDED and is in neither. Contributions = the tally's
// work kinds, all time (CONTRIB_KIND). approve and grant = the
// owner-route undecided rows S2 draws (grant is its own kind; the question kinds live on /decisions). shipped = the work
// that landed in the last seven days (approved, or filed straight through; a filing decided this week counts by its
// decision). knowledge_at = KNOWLEDGE_AT_SQL, inline. Binds: scoped [project, since7], else [since7] (numbered: ?1 ?2).
// D2b (counts agree with rows): a LANDED contribution (filed straight through, or approved) is neither "in motion" nor
// "open". In motion = what has not landed: with a person (route owner, undecided, any age) + needs more (route incomplete,
// undecided, filed this week) — Build's count, the same definition. Contributions = every work contribution of the project
// (records — a knowledge write, a grade — and the list's own presses are not contributions): Build's header count.
export const CONTRIB_KIND = (expr) => `${expr} NOT IN ('knowledge','grade',${BUILD_NOT_KIND})`;
export const HOME_TX_AGG_SQL = (scoped, includeEval) => {
  const P = scoped ? "?1" : null;
  const tp = scoped ? `project = ${P}` : "project = {orgbucket}";
  // sprint 3 L2: the week (needs more, landed in seven days) is read ONCE, by WEEK_SQL below (the page's charts read the same
  // rows), so this statement keeps the all-time tallies and "as of" alone: the week's filings are never walked twice
  return "SELECT k.approve_n, k.grant_n, k.with_n, k.contrib_n, " +
    // each contribution kind with its count (summed over eval for an eval read), most first is the renderer's
    "(SELECT json_group_array(json_array(kind, s)) FROM (SELECT kind, SUM(n) AS s FROM transmission_kinds WHERE " + tp + " AND mind = 0 AND " + CONTRIB_KIND("kind") +
    txEval("eval", includeEval) + " GROUP BY kind HAVING SUM(n) > 0)) AS contrib_kinds, " +
    (scoped ? knowledgeAtOver().replace("project = ?", `project = ${P}`) : "NULL") + " AS knowledge_at FROM " +
    "(SELECT COALESCE(SUM(CASE WHEN " + notKinds("kind", HOME_NOT_APPROVE) + " THEN n_owner_undecided ELSE 0 END),0) AS approve_n, " +
    "COALESCE(SUM(CASE WHEN kind = 'grant' THEN n_owner_undecided ELSE 0 END),0) AS grant_n, COALESCE(SUM(n_owner_undecided),0) AS with_n, " +
    // D2b: the contributions, all time, as Build counts them (the same tally, the same kinds: never a record, never the list's
    // own presses), with each kind's count for the tile's line
    "COALESCE(SUM(CASE WHEN mind = 0 AND " + CONTRIB_KIND("kind") + " THEN n ELSE 0 END),0) AS contrib_n " +
    "FROM transmission_kinds WHERE " + tp + txEval("eval", includeEval) + ") k";
};
// S2 (the admin) — the newest four owner-route undecided rows that are not a question's filing: approve rows and grant
// rows, each with its STANDING counter count (the counters filed on it by parent, QB953462F, not yet ruled: the one
// standingCounter definition, UI-B4a C7), read on migrate-038's idx_transmission_parent. Binds: [project]?.
export const HOME_OWNER_ROWS_SQL = (scoped, includeEval) =>
  "SELECT t.id, t.kind, t.lane, t.what, t.via, t.created_at, t.happened_at, p.name AS by_name, " +
  "(SELECT COUNT(*) FROM transmission c WHERE c.parent = t.id AND " + standingCounter("c") + txEval("c.eval", includeEval) + ") AS counters " +
  "FROM transmission t LEFT JOIN people p ON p.id = t.submitter " +
  "WHERE t.route = 'owner'" + txEval("t.eval", includeEval) + " AND t.decision IS NULL AND " + notKinds("COALESCE(t.kind,'')", "'answer','round','counter','critique'") + " AND " + projWhere("t.project", scoped) + " " +
  "ORDER BY t.created_at DESC LIMIT 4";
// S2 (anyone else) — the three first-five signals (src/first5.js deriveFirstFive), one statement: a non-web credential
// in use, any event, any filing. Binds: person, person, person. EXISTS-shaped (LIMIT 1 each), never a count.
export const HOME_FIRST5_SQL =
  "SELECT (SELECT 1 FROM tokens WHERE person_id = ? AND revoked = 0 AND device NOT IN ('web','sso','frame') LIMIT 1) AS tokens, " +
  "(SELECT 1 FROM events WHERE person_id = ? LIMIT 1) AS events, " +
  "(SELECT 1 FROM transmission WHERE submitter = ? LIMIT 1) AS transmissions";
// S4 — the goals moved this month (sprint 3, B3; docs/plan/MCP.md §9 demand 11: Home leads with goals moved and who
// contributed, never a ranking of people): the project's goal-moving filings (landed: route auto, or decided approve; aimed:
// goal_ref set) since the first of the month, per goal, person and lane, on migrate-042's idx_transmission_goal_month (the
// month's goal-naming filings only). src/home.js groups the rows by goal (how far: its contributions this month) with its
// contributors (names only: no per-person count is kept); the goal's title is one probe of k_goals' primary key per row (a goal
// ref no goal of the tree holds reads as itself). Sprint 3 (happenedAt, migrate-051): "this month" is when the work HAPPENED,
// COALESCE(happened_at, created_at) >= the month's first day (YYYY-MM-01, so a date-only happenedAt of the 1st counts). It is a
// filter on the SAME created_at range: happened_at is never later than created_at (src/shapes.js), so work that happened this
// month was filed this month, and the range reads exactly the rows it read before. Binds: [project]?, monthStart, monthDay.
// Sprint 3 L2 (the row budget): the filings are grouped FIRST and the person and the goal's title probed once per group (one
// per goal, person and lane), never once per filing.
export const HOME_GOALS_MOVED_SQL = (scoped, includeEval) =>
  "SELECT x.goal_ref, g.title, x.submitter, p.name, p.email, x.lane, x.n FROM (" +
  "SELECT t.project, t.goal_ref, t.submitter, t.lane, COUNT(*) AS n FROM transmission t " +
  "WHERE " + projWhere("t.project", scoped) + " AND t.created_at >= ? AND COALESCE(t.happened_at, t.created_at) >= ? AND (t.route = 'auto' OR t.decision = 'approve') AND t.goal_ref IS NOT NULL" + txEval("t.eval", includeEval) + " " +
  "GROUP BY t.goal_ref, t.submitter, t.lane) x JOIN people p ON p.id = x.submitter LEFT JOIN k_goals g ON g.project = x.project AND g.id = x.goal_ref";
// the ledger rows that RECORD a write rather than carry work (sprint 3, B3): a preview then save_knowledge call's row (kind knowledge) and a
// grade filed with proof (kind grade), both routed auto. They leave Home's open and in-motion counts (migrate-050 keeps them
// out of transmission_open) and Build's default list and counts (Build keeps a filter for each kind).
export const RECORD_KINDS = ["knowledge", "grade"];
// S5 — who is here: the project's name, the org's active project count, and the project's seats with their people;
// the admin comes from the same statement (the org's owner row), so it costs no sixth read. Binds: [project, project]
// when scoped; none otherwise (an org with no project axis: its active roster, and the admin).
// U-MCP Fork 3 (1) (Q0D506BBC): "N projects" is ONE population, the org's ACTIVE projects — the count subquery here is the
// SAME predicate as src/core.js countActiveProjects (Map · Arch's org worker), so Home's who-is-here and Map · Arch agree.
// Sprint 2 (the live budget): the seated people are read from the ACTIVE people (migrate-042's idx_people_active) with one
// seat probe each on project_seats' primary key, never every seat the project ever had (a seat outlives its person's
// deactivation, so most of a busy project's seats are dormant); the project's own row comes first, alone; the admin's
// "not seated here" is one primary-key probe (NOT EXISTS), never the project's whole seat list. Binds: [project] (?1).
export const HOME_SEATS_SQL = (scoped) => scoped
  ? "SELECT pr.name AS project_name, (SELECT COUNT(*) FROM projects WHERE active = 1 AND org = {org}) AS projects, NULL AS id, NULL AS name, NULL AS email, NULL AS role, NULL AS seat_role " +
    "FROM projects pr WHERE pr.key = ?1 " +
    "UNION ALL SELECT NULL, NULL, p.id, p.name, p.email, p.role, s.role FROM people p CROSS JOIN project_seats s ON s.person_id = p.id AND s.project_key = ?1 WHERE p.active = 1 " +
    "UNION ALL SELECT NULL, NULL, p.id, p.name, p.email, p.role, 'admin' FROM people p WHERE p.role = 'owner' AND p.active = 1 AND p.org = {org} " +
    "AND NOT EXISTS (SELECT 1 FROM project_seats x WHERE x.person_id = p.id AND x.project_key = ?1)"
  : "SELECT NULL AS project_name, (SELECT COUNT(*) FROM projects WHERE active = 1 AND org = {org}) AS projects, p.id, p.name, p.email, p.role, NULL AS seat_role FROM people p WHERE p.active = 1 AND p.org = {org}";

// ---- the filing page and the ledger reads (UI-B4a) ----
// READER_SCOPE(alias) — the ONE visibility rule for a non-owner on the ledger (Q0B546903: everyone sees everything,
// scoped to the workspace). A row is visible to its submitter, to anyone holding a seat on the row's project (an active
// project), and to every reader when the org has no project axis (no active project at all). The owner is never scoped
// by it (the org-wide view). Binds: reader id, reader id. Both the single-row read (TX_ONE_SQL) and the queue
// (core.js transmissionQueueFor, its counts and its rows) put this clause in their WHERE, so a row outside the scope
// answers EXACTLY like a missing id (never a 403 that would say the row exists).
export const READER_SCOPE = (alias) => {
  const a = alias ? alias + "." : "";
  return `(${a}submitter = ? OR ${a}project IN (SELECT s.project_key FROM project_seats s JOIN projects sp ON sp.key = s.project_key AND sp.active = 1 AND sp.org = {org} WHERE s.person_id = ?) ` +
    "OR NOT EXISTS (SELECT 1 FROM projects WHERE active = 1 AND org = {org}))";
};
// IMPACT_HISTORY_SQL(scoped, includeEval) — impact {refs}'s history (D5; D1b item 13): the
// project's contributions that named any of the refs, newest first — through transmission_refs (idx_transmission_refs_ref:
// screens bare and prefixed, gapRefs, touches) and the goal_ref column (idx_transmission_goalref). Knowledge filings are left
// out (their refs are the items written). Binds: ?1 the refs' index forms (JSON), ?2 the goal ids (JSON), ?3 the project,
// ?4 the reader id (READER_SCOPE, every non-owner), ?5 the limit (one more than shown, to say there is more).
export const IMPACT_HISTORY_SQL = (scoped, includeEval) =>
  "SELECT t.id, t.created_at, t.kind, t.lane, t.route, t.status, t.decision, t.decided_at, t.what, " +
  "COALESCE(ps.name, t.submitter) AS by_name, COALESCE(pd.name, t.decided_by) AS decided_by_name " +
  "FROM transmission t LEFT JOIN people ps ON ps.id = t.submitter LEFT JOIN people pd ON pd.id = t.decided_by " +
  "WHERE t.id IN (SELECT r.tid FROM transmission_refs r WHERE r.ref IN (SELECT value FROM json_each(?1)) " +
  "UNION SELECT g.id FROM transmission g WHERE g.goal_ref IN (SELECT value FROM json_each(?2))) " +
  "AND t.project = ?3 AND COALESCE(t.kind, '') <> 'knowledge' " + (includeEval ? "" : "AND t.eval = 0 ") +
  (scoped ? "AND " + READER_SCOPE("t").replace(/\?/g, "?4") + " " : "") +
  "ORDER BY t.created_at DESC, t.id DESC LIMIT ?5";
// TX_ONE_SQL(scoped) — GET /contribution/:id, the read tool and the filing page: one row with its
// submitter's and decider's names. scoped (every non-owner) adds READER_SCOPE; binds: id, then [reader id, reader id].
export const TX_ONE_SQL = (scoped) =>
  "SELECT t.*, p.name AS by_name, COALESCE(p.title, p.role) AS by_role, dp.name AS decided_name, COALESCE(dp.title, dp.role) AS decided_role " +
  "FROM transmission t LEFT JOIN people p ON p.id = t.submitter LEFT JOIN people dp ON dp.id = t.decided_by WHERE t.id = ? AND t.org = {org}" +
  (scoped ? " AND " + READER_SCOPE("t") : "");
// FILING_COUNTERS_SQL(includeEval, scoped) — the filing page's counters region: every counter filed on ONE filing by
// parent (kind counter or critique, ruled or not; `standing` is the standingCounter flag per row, so the heading's
// "N standing · M ruled" is counted from the rows themselves), read on migrate-038's idx_transmission_parent. scoped
// (every non-owner) adds READER_SCOPE, so a counter the reader could not open is never listed either.
// The unary + on kind and eval keeps those two terms off their own indexes (idx_transmission_eval_created would
// otherwise win on an unanalyzed table and walk every non-suite row), so the one index the planner can use is
// idx_transmission_parent. Binds: the parent id, then [reader id, reader id]. tools/d1-hot-selftest.mjs section H
// EXPLAINs this exact string, and shows the form without the + scans.
export const FILING_COUNTERS_SQL = (includeEval, scoped) =>
  "SELECT c.id, c.kind, c.submitter, p.name AS by_name, c.what, c.route, c.status, c.decision, c.decided_at, c.created_at, " +
  "CASE WHEN " + standingCounter("c") + " THEN 1 ELSE 0 END AS standing " +
  "FROM transmission c LEFT JOIN people p ON p.id = c.submitter " +
  "WHERE c.parent = ? AND +c.kind IN ('counter','critique') AND c.org = {org}" + txEval("+c.eval", includeEval) + (scoped ? " AND " + READER_SCOPE("c") : "") + " ORDER BY c.created_at";


// ---- Build (UI-B4b): ONE read, src/build.js readBuild ----
// At most THREE D1 statements beyond the memoized auth, in ONE parallel wave: B1 BUILD_ROWS_SQL (the rows), B2
// BUILD_AGG_SQL (the counts by kind) and, only when the org declares its own goal tree, B3 GOALS_AGG_SQL below, unchanged,
// bound from the epoch (UI-B6b: the finish line's stages are the tree's leaves, over all time). B1 and B2 read the
// project Home reads (the request's workspace, else the org's one declared project; `scoped` false reads the rows no project stamps, an org with no project axis) on
// idx_transmission_project(project, created_at), and both fold the seat scope into the WHERE (BUILD_SCOPE), so a
// non-owner with no seat on the project reads nothing at all, never another project's rows (Q0B546903). R's own mind/*
// rows and the rank filings themselves (QEFC716D5: a rank is a filing, kind rank, parent <id>) are never rows.
// BUILD_SCOPE(alias) — B4a's READER_SCOPE without its submitter clause (narrower, never wider): the owner reads the whole
// project; anyone else reads it only while holding a seat on it (an active project), or when the org has no project axis
// at all. Binds: isOwner (1|0), reader id.
export const BUILD_SCOPE = (alias) => {
  const a = alias ? alias + "." : "";
  return `(? = 1 OR ${a}project IN (SELECT s.project_key FROM project_seats s JOIN projects sp ON sp.key = s.project_key AND sp.active = 1 AND sp.org = {org} WHERE s.person_id = ?) ` +
    "OR NOT EXISTS (SELECT 1 FROM projects WHERE active = 1 AND org = {org}))";
};
// the kinds that are never a Build row: a rank press is a filing about another filing, not work of its own; a publish or
// an equip press (UI-B11a) is a person's verb on an item, read on Broadcast, not work of its own
export const BUILD_NOT_KIND = "'rank','publish','equip'";
// B1 — the newest 51 filings (50 shown; the 51st says there is more), each with its STANDING counter count (the one
// standingCounter definition, UI-B4a C7) and its latest rank press (MAX(created_at) of the kind rank filings naming it
// by parent, no table and no column: QEFC716D5), both correlated subqueries on migrate-038's idx_transmission_parent.
// The unary + on the row's kind and eval keeps those terms off idx_transmission_kind_eval and idx_transmission_eval_created,
// so the one index the planner walks for the rows is idx_transmission_project, newest first, stopping at the LIMIT.
// Sprint 3 (B3): with no kind asked, the records (RECORD_KINDS: a knowledge write's row, a grade's) are not rows either; Build's
// filter for each kind shows them (?kind=knowledge, ?kind=grade).
// Sprint 3 (happenedAt, migrate-051): the WINDOW stays the newest filed (created_at, the index's order, so the read does not
// grow); t.happened_at rides along and src/build.js orders those rows by when the work happened.
// Sprint 3 L2 (the filter row, every choice in the address): o.by narrows to one submitter (+t.submitter: the walk stays on
// idx_transmission_project), o.since to what was filed since a time (the index's own range: Build's 24 hours and 7 days),
// o.motion to what is in motion (with a person, any age; needs more, filed since the bound time: Home's and Build's ONE
// definition), o.before to what was filed before a time (the older rows past the week, when the week holds fewer than a page).
// Binds: [project]?, isOwner, reader id, [kind]?, [submitter]?, [since]?, [before]?, [motion since]?, limit.
export const BUILD_ROWS_SQL = (scoped, includeEval, byKind, o = {}) =>
  "SELECT t.id, t.kind, t.lane, t.what, t.touches, t.via, t.route, t.status, t.decision, t.decided_at, t.components, t.screens, t.goal_ref, t.project, t.eval, t.created_at, t.happened_at, t.submitter, p.name AS by_name, " +
  // sprint 3 B4: who picked up its next action (migrate-053; one people probe, only for a row someone picked up) and whether it is done
  "t.next_picked_by, pk.name AS picked_name, t.next_done_at, " +
  "(SELECT COUNT(*) FROM transmission c WHERE c.parent = t.id AND " + standingCounter("c") + txEval("+c.eval", includeEval) + ") AS counters, " +
  "(SELECT MAX(r.created_at) FROM transmission r WHERE r.parent = t.id AND +r.kind = 'rank'" + txEval("+r.eval", includeEval) + ") AS ranked_at " +
  "FROM transmission t LEFT JOIN people p ON p.id = t.submitter LEFT JOIN people pk ON pk.id = t.next_picked_by " +
  "WHERE " + projWhere("t.project", scoped) + " AND " + BUILD_SCOPE("t") + " AND " + notKinds("COALESCE(+t.kind,'')", byKind ? BUILD_NOT_KIND : BUILD_NOT_KIND + ",'knowledge','grade'") + " AND " + notMind("t") +
  txEval("+t.eval", includeEval) + (byKind ? " AND +t.kind = ?" : "") + (o.by ? " AND +t.submitter = ?" : "") + (o.since ? " AND t.created_at >= ?" : "") + (o.before ? " AND t.created_at < ?" : "") +
  (o.motion ? " AND t.decision IS NULL AND (+t.route = 'owner' OR (+t.route = 'incomplete' AND +t.created_at >= ?))" : "") + " ORDER BY t.created_at DESC LIMIT ?";
// B2 — the counts per kind over the same project and scope: how many (the contributions), in motion (Home S1's definition,
// D2b: what has not landed — route owner undecided, any age; route incomplete filed in the last seven days; a contribution
// filed straight through has landed and is not in motion) and on the canvas this week (src/tempo.js "on the canvas": approved, or filed straight through,
// naming what it touches, landed in the last seven days AND before the served publish). Sprint 2 (the live budget): ONE
// statement, three arms, no sort, and never the project's whole ledger:
//   · the all-time counts per kind off migrate-042's transmission_kinds tally (n, open_n, and motion_n's "with the owner"
//     part), one row per kind;
//   · the WEEK, one row per filing (kind, and 0/1 for motion_n's week part and canvas_n): what was filed in it
//     (idx_transmission_project) and what was filed before it and decided in it (idx_transmission_decided) — two disjoint
//     ranges, so each filing is read once.
// src/build.js sums the rows per kind (a kind's n comes from the tally alone; every week row's kind is a tally kind, since
// the arms share the filters). The seat scope (BUILD_SCOPE) rides every arm, so a reader with no seat on the project reads
// nothing. Numbered binds: scoped [project, isOwner, reader id, since7, publishedAt ('' when nothing is published: then
// nothing is on the canvas)], else [isOwner, reader id, since7, publishedAt].
const buildScopeN = (alias, own, rid) => BUILD_SCOPE(alias).replace("? = 1", own + " = 1").replace("s.person_id = ?", "s.person_id = " + rid);
// sprint 3 L2: the week's FILINGS are walked once per page (Build's default list reads the week itself, src/build.js; a
// filtered list reads WEEK_SQL), so this statement keeps the all-time counts per kind off the tally, and one arm on the
// week's DECISIONS: what was filed before the week and landed in it, naming components or screens, before the served publish
// (on the Map this week: Build's canvas_n). Numbered binds: scoped [project, isOwner, reader id, since7, publishedAt ('' when
// nothing is published: then nothing is on the canvas)], else [isOwner, reader id, since7, publishedAt].
export const BUILD_AGG_SQL = (scoped, includeEval) => {
  const n = scoped ? 1 : 0, P = "?1", O = "?" + (1 + n), R = "?" + (2 + n), S = "?" + (3 + n), PUB = "?" + (4 + n);
  const lp = scoped ? "project = " + P : "project IS NULL AND org = {org}";
  return "SELECT kind, n, n_open AS open_n, n_owner_undecided AS motion_n, 0 AS canvas_n FROM transmission_kinds " +
    "WHERE " + (scoped ? "project = " + P : "project = {orgbucket}") + " AND " + buildScopeN("", O, R) + " AND " + notKinds("kind", BUILD_NOT_KIND) + " AND mind = 0" +
    txEval("eval", includeEval) + " AND n > 0 " +
    "UNION ALL SELECT COALESCE(kind,''), 0, 0, 0, " +
    "CASE WHEN (decision = 'approve' OR (decision IS NULL AND route = 'auto')) AND (COALESCE(components,'') != '' OR COALESCE(screens,'') != '') " +
    `AND COALESCE(decided_at, created_at) < ${PUB} THEN 1 ELSE 0 END ` +
    "FROM transmission WHERE " + lp + ` AND decided_at >= ${S} AND +created_at < ${S} AND ` + buildScopeN("", O, R) + " AND " + notKinds("COALESCE(+kind,'')", BUILD_NOT_KIND) + " AND " +
    notMind("") + txEval("+eval", includeEval);
};

// ---- the week (sprint 3, L2; owner, MCQ 2026-10-02: the ONE new read of the revision) ----
// WEEK_SQL — contributions per day and person over the last WEEK_DAYS days, landed or not: Home's Landed bars and its People
// card, Build's Filed bars and its person and time filters, and the week's part of the counts both pages already showed (Home's
// needs more and landed in seven days, Build's in motion and on the Map this week), which it replaces, so the week is walked
// once per page. Two arms on two disjoint ranges, the ones HOME_TX_AGG_SQL and BUILD_AGG_SQL walked before:
//   A  what was FILED in the window (created_at >= since) on idx_transmission_contrib (project, created_at), contributions only;
//   B  what was filed before it and DECIDED in it (decided_at >= since) on idx_transmission_decided, landed rows only.
// A contribution is what Home and Build count (CONTRIB_KIND: never a record, a knowledge write or a grade, never the list's own
// presses), R's own mind/* rows out, the suites' rows out unless asked, and the seat scope (BUILD_SCOPE) on every arm, so a
// reader with no seat on the project reads nothing. Per group: f the day it was filed and l the day it landed (0 = the last
// 24 hours before `now`, … 6), ok = landed (filed straight through, or approved: Build's LANDED), and the counts: n, more_n
// (needs more: sent back, undecided), canvas_n (landed naming components or screens, before the served publish: on the Map)
// and shipped_n (Home's shipped: the work that landed, never a counter, an answer, a press, a grade or a knowledge write).
// The person's name is one people probe per group (the grouped rows, never the filings). Numbered binds: scoped [project, now,
// since, isOwner, reader id, publishedAt ('' when nothing is published)], else [now, since, isOwner, reader id, publishedAt].
export const WEEK_DAYS = 7;
// sprint 3 L3 (migrate-061): arm A walks idx_transmission_contrib, the contributions alone (a grade or a knowledge write is never
// in it), so a grading run or an import of knowledge writes in the week costs the read nothing. The index is partial: the
// statement carries ITS predicate verbatim (CONTRIB_INDEX_TERM, the planner's proof the index holds every row the read wants)
// and names it with INDEXED BY (a database without migrate-061 refuses the statement: the index is live before the code).
export const CONTRIB_INDEX_TERM = "COALESCE(t.kind,'') NOT IN ('grade','knowledge')";
export const WEEK_SQL = (scoped, includeEval) => {
  const k = scoped ? 1 : 0, P = "?1", NOW = "?" + (1 + k), S = "?" + (2 + k), O = "?" + (3 + k), R = "?" + (4 + k), PUB = "?" + (5 + k);
  const lp = scoped ? "t.project = " + P : "t.project IS NULL AND t.org = {org}";
  const landed = "(t.decision = 'approve' OR (t.decision IS NULL AND t.route = 'auto'))";
  const shipped = landed + ` AND COALESCE(t.decided_at, t.created_at) >= ${S} AND instr('` + SHIPPED_NOT_KIND_CSV + "', ',' || COALESCE(t.kind,'') || ',') = 0";
  const slot = (col) => `CAST(julianday(${NOW}) - julianday(${col}) AS INTEGER)`;
  const canvas = `CASE WHEN ${landed} AND (COALESCE(t.components,'') != '' OR COALESCE(t.screens,'') != '') AND COALESCE(t.decided_at, t.created_at) >= ${S} AND COALESCE(t.decided_at, t.created_at) < ${PUB} THEN 1 ELSE 0 END`;
  const common = " AND " + buildScopeN("t", O, R) + " AND " + notKinds("COALESCE(+t.kind,'')", BUILD_NOT_KIND + ",'knowledge','grade'") + " AND " + notMind("t") + txEval("+t.eval", includeEval);
  // f: the day the WORK happened (happenedAt, migrate-051), else the day it was filed (sprint 3 L3: one definition for the bars,
  // the day groups and the people's days); the range stays the filing window (happened_at is never later than created_at)
  const armA = `SELECT ${slot("COALESCE(t.happened_at, t.created_at)")} AS f, CASE WHEN ${shipped} THEN ${slot("COALESCE(t.decided_at, t.created_at)")} END AS l, ` +
    `CASE WHEN ${landed} THEN 1 ELSE 0 END AS ok, t.submitter, COUNT(*) AS n, ` +
    "SUM(CASE WHEN t.route = 'incomplete' AND t.decision IS NULL THEN 1 ELSE 0 END) AS more_n, " +
    `SUM(${canvas}) AS canvas_n, SUM(CASE WHEN ${shipped} THEN 1 ELSE 0 END) AS shipped_n ` +
    `FROM transmission t INDEXED BY idx_transmission_contrib WHERE ${lp} AND t.created_at >= ${S} AND ${CONTRIB_INDEX_TERM}${common} GROUP BY 1, 2, 3, 4`;
  const armB = `SELECT NULL, CASE WHEN ${shipped} THEN ${slot("t.decided_at")} END, 1, t.submitter, COUNT(*), 0, SUM(${canvas}), SUM(CASE WHEN ${shipped} THEN 1 ELSE 0 END) ` +
    `FROM transmission t WHERE ${lp} AND t.decided_at >= ${S} AND +t.created_at < ${S} AND ${landed}${common} GROUP BY 2, 4`;
  return `SELECT w.f, w.l, w.ok, w.submitter, p.name, w.n, w.more_n, w.canvas_n, w.shipped_n FROM (${armA} UNION ALL ${armB}) w LEFT JOIN people p ON p.id = w.submitter`;
};

// ---- Goals (UI-B6a): ONE period-bounded aggregate, src/goalsread.js readGoals / readGoalNode ----
// The goal tree itself is D1 knowledge (src/knowledge/goals.js GOAL_TREE_SQL, one statement, memoized per request). Beside
// it GET /goals runs, in ONE parallel wave: G1 GOALS_AGG_SQL (every landed filing of the project in the period, grouped by
// the goal it names and its lane: the counts the pure goals.js rollupCells turns into cells, needles, "fed by" and What
// fed), G2 GOALS_COUNTERS_SQL (the goal/ counters, standing and ruled, per goal: ONE transmission_refs range, the q/ idiom
// of DECISIONS_LIVE_SQL); with no goal filed, no ledger statement. GET /goals/:ref runs G1, G3
// GOAL_COUNTERS_SQL (this goal's counters, one ref) and G4 GOAL_ROWS_SQL (the filings naming it, newest 25 plus one to
// know there is more). tools/d1-hot-selftest.mjs section K EXPLAINs these exact strings.
// NOT_EVAL_PROBE — the text backstop core.js exports as NOT_EVAL_PROBE_TX_BARE (byte for byte; it lives here so G1 can use
// it without importing core.js, which imports this module).
export const NOT_EVAL_PROBE = "(what IS NULL OR (what NOT LIKE '%eval probe%' AND what NOT LIKE '%[eval%'))";
// the kinds that never move a goal: a counter or a critique disputes, a rank orders, a restore restores (Q48115AD1); an
// item is a draft for the Broadcast shelf and a publish or an equip a person's press on it (UI-B11a); a knowledge row
// records a preview then save_knowledge call (it changes the tree, it does not feed it)
export const GOALS_NOT_KIND = "('counter','critique','rank','restore','item','publish','equip','knowledge')";
// G1 — the landed predicate computeGoals always used (route auto, or decided approve; R's own mind/* out; suite rows and
// the "[eval probe]" text out unless ?eval=1), plus the kinds above, over the project's rows since the period's start.
// outcome is REAL (NULL when absent): s = the sum of the finite outcomes, no_outcome = the rows with none, awaiting = the
// rows with neither an outcome nor a reported actual (the M-ADR-021 "in flight" signal). Sprint 2 (the live budget): read off
// migrate-042's transmission_goals tally, which holds exactly those landed, non-mind rows summed per goal ref, lowered lane and
// month of filing (clean = no suite row and no eval-probe text), keyed in the GROUP BY's order (no sort): G1 reads the
// project's tally rows (a few per goal and lane per month of its history), never the period's filings. A period starts on the
// first of a month (goalsread.js periodFrom: all, this quarter, this month), so `month >= the period's month` is exactly
// `created_at >= from`; `from` must start a month. The tally keeps the kinds that never move a goal apart under their own
// name and every other kind under '*', so the kind filter is applied here, on the read: a '*' row passes at once, and only
// a row of a named kind is tested against GOALS_NOT_KIND (a NOT IN list is billed one row read per row it tests). goal_ref
// '' is none, else '=' + the ref. `scoped` false reads the rows no project stamps (tally project ''). Binds: [project]?, from.
// The outer SELECT keeps the statement's columns (and its leading text) those of the ledger aggregate it replaced; the inner
// one is the tally read (a co-routine: no row is read twice).
export const GOALS_AGG_SQL = (scoped, includeEval) =>
  "SELECT goal_ref, LOWER(lane) AS lane, n, s, no_outcome, awaiting FROM (" +
  "SELECT CASE WHEN goal_ref = '' THEN NULL ELSE substr(goal_ref, 2) END AS goal_ref, lane, SUM(n) AS n, SUM(s) AS s, " +
  "SUM(no_outcome) AS no_outcome, SUM(awaiting) AS awaiting " +
  "FROM transmission_goals WHERE " + tallyProj("project", scoped) + (includeEval ? "" : " AND clean = 1") + " AND month >= substr(?, 1, 7)" +
  " AND (kind = '*' OR kind <> '*' AND COALESCE(+kind,'') NOT IN " + GOALS_NOT_KIND + " ) GROUP BY goal_ref, lane HAVING SUM(n) > 0)";
// G5 — the contributions WAITING for the owner that name a goal (the one-pass fix 4b: a goal shows what waits as awaiting): the
// project's open owner queue, one range of the partial index idx_transmission_owner_open (route 'owner', not closed), its
// rows that name a goal and are not yet decided, per goal and lowered lane. Rows read: the project's open owner queue (the
// badge's own population), never the ledger. The kinds that never move a goal are left out, as in G1. Binds: project.
export const GOALS_WAITING_SQL = (includeEval) =>
  "SELECT goal_ref, LOWER(lane) AS lane, COUNT(*) AS n FROM transmission INDEXED BY idx_transmission_owner_open " +
  "WHERE project = ?1 AND route = 'owner' AND status != 'closed' AND decision IS NULL AND goal_ref IS NOT NULL" + txEval("eval", includeEval) +
  " AND COALESCE(kind,'') NOT IN " + GOALS_NOT_KIND + " GROUP BY goal_ref, LOWER(lane)";
// G2 — the goal/ counters per goal ref: a counter names a goal by gapRefs goal/<id> (Q48115AD1), indexed verbatim into
// transmission_refs at filing time, so the whole goal/ namespace is ONE index range ('goal0' is the first string after
// every 'goal/…'). CROSS JOIN pins transmission_refs as the outer loop (the q/ idiom). standing = the one
// standingCounter definition; ruled = a counter or critique with a decision. Not period-bounded: a counter stands until
// it is ruled. Binds: [project]?.
export const GOALS_COUNTERS_SQL = (scoped, includeEval) =>
  "SELECT r.ref, COALESCE(SUM(CASE WHEN " + standingCounter("t") + " THEN 1 ELSE 0 END),0) AS standing, " +
  "COALESCE(SUM(CASE WHEN t.decision IS NOT NULL THEN 1 ELSE 0 END),0) AS ruled " +
  "FROM transmission_refs r CROSS JOIN transmission t ON t.id = r.tid " +
  "WHERE r.ref >= 'goal/' AND r.ref < 'goal0' AND t.kind IN ('counter','critique') AND " + projWhere("t.project", scoped) + txEval("t.eval", includeEval) +
  " GROUP BY r.ref";
// G3 — one goal's counters, each row (the node page lists every standing one, who and when, linking to its filing).
// Binds: 'goal/<id>', [project]?.
export const GOAL_COUNTERS_SQL = (scoped, includeEval) =>
  "SELECT t.id, t.kind, t.what, t.decision, t.decided_at, t.created_at, p.name AS by_name, CASE WHEN " + standingCounter("t") + " THEN 1 ELSE 0 END AS standing " +
  "FROM transmission_refs r CROSS JOIN transmission t ON t.id = r.tid LEFT JOIN people p ON p.id = t.submitter " +
  "WHERE r.ref = ? AND t.kind IN ('counter','critique') AND " + projWhere("t.project", scoped) + txEval("t.eval", includeEval) +
  " ORDER BY t.created_at DESC LIMIT 200";
// G4 — the filings that name one goal (goal_ref), in the period, newest first: every kind that can move a goal, landed or
// not (each wears its one state chip). The unary + on project, created_at, kind and eval leaves idx_transmission_goalref
// the one index the planner can use. The seat scope (BUILD_SCOPE's rule, on +project) is folded into the WHERE, so a
// reader with no seat on the project lists nothing. Binds: goal ref, [project]?, from, isOwner, reader id, limit.
export const GOAL_ROWS_SQL = (scoped, includeEval) =>
  "SELECT t.id, t.kind, t.lane, t.what, t.route, t.status, t.decision, t.decided_at, t.components, t.screens, t.outcome, t.expected, t.actual, t.eval, t.created_at, t.happened_at, p.name AS by_name " +
  "FROM transmission t LEFT JOIN people p ON p.id = t.submitter " +
  "WHERE t.goal_ref = ? AND " + projWhere("+t.project", scoped) + " AND +t.created_at >= ? AND " + notKinds("COALESCE(+t.kind,'')", GOALS_NOT_KIND) + " AND " + notMind("t") +
  " AND (? = 1 OR +t.project IN (SELECT s.project_key FROM project_seats s JOIN projects sp ON sp.key = s.project_key AND sp.active = 1 AND sp.org = {org} WHERE s.person_id = ?) " +
  "OR NOT EXISTS (SELECT 1 FROM projects WHERE active = 1 AND org = {org}))" + txEval("+t.eval", includeEval) + " ORDER BY t.created_at DESC LIMIT ?";
// A project's name by its key, for a reader who holds no seat on it (src/goalsread.js projectNamed). Binds: key.
export const PROJECT_NAME_SQL = "SELECT name FROM projects WHERE key = ? AND org = {org}";

// ---- GTM (UI-B10a): ONE read, src/gtmread.js readGtmPipeline ----
// GET /gtm runs at most THREE D1 statements beyond the memoized auth, in ONE parallel wave: G1 GOALS_AGG_SQL above,
// UNCHANGED (the metrics are Goals' own gtm cells, never a second rollup: Q8E554970), X1 GTM_ROWS_SQL and X2 GTM_KINDS_SQL;
// with no declared tree, or a tree with no gtm node, exactly two (X1, X2), no G1. Both read the project Home reads, its gtm
// lane only, on migrate-042's idx_transmission_lane (project, lower(lane), created_at) over the period's range (sprint 2: they
// walked every filing of the period on idx_transmission_project), fold the seat scope into the WHERE (BUILD_SCOPE:
// a non-owner with no seat on the project reads nothing), keep the gtm lane, leave out the kinds that never move a goal
// (GOALS_NOT_KIND: a counter, critique, rank or restore is a filing about another filing) and R's own mind/* rows, and the
// suites' rows unless ?eval=1. Landed or not: every gtm filing of the period is a row (each wears its one state chip).
// tools/d1-hot-selftest.mjs section N EXPLAINs these exact strings.
// X1 — the newest GTM_ROWS_LIMIT + 1 gtm filings (the last one says there is more), each with its STANDING counter count
// (the one standingCounter definition, a correlated subquery on migrate-038's idx_transmission_parent). lower(t.lane) is the
// index's own expression (never LOWER(+t.lane)), and the unary + on kind and eval keeps them off idx_transmission_kind_eval /
// idx_transmission_eval_created, so the one index walked for the rows is idx_transmission_lane, newest first, stopping at the
// LIMIT. Binds: [project]?, from, isOwner, reader id, limit.
export const GTM_ROWS_SQL = (scoped, includeEval) =>
  "SELECT t.id, t.kind, t.lane, t.what, t.route, t.status, t.decision, t.decided_at, t.components, t.screens, t.goal_ref, t.expected, t.actual, t.outcome, t.proof, t.eval, t.created_at, t.happened_at, p.name AS by_name, " +
  "(SELECT COUNT(*) FROM transmission c WHERE c.parent = t.id AND " + standingCounter("c") + txEval("+c.eval", includeEval) + ") AS standing " +
  "FROM transmission t LEFT JOIN people p ON p.id = t.submitter " +
  "WHERE " + projWhere("t.project", scoped) + " AND t.created_at >= ? AND lower(t.lane) = 'gtm' AND " + notKinds("COALESCE(+t.kind,'')", GOALS_NOT_KIND) + " AND " + notMind("t") +
  " AND " + BUILD_SCOPE("t") + txEval("+t.eval", includeEval) + " ORDER BY t.created_at DESC LIMIT ?";
// X2 — one row per kind over the same rows (no LIMIT): how many were filed and how many landed (route auto, or decided
// approve: G1's own landed predicate). The lanes and the stamp's filings / landed counts read off it. Binds: [project]?,
// from, isOwner, reader id.
export const GTM_KINDS_SQL = (scoped, includeEval) =>
  "SELECT COALESCE(kind,'') AS kind, COUNT(*) AS n, COALESCE(SUM(CASE WHEN route = 'auto' OR decision = 'approve' THEN 1 ELSE 0 END),0) AS landed " +
  "FROM transmission WHERE " + projWhere("project", scoped) + " AND created_at >= ? AND lower(lane) = 'gtm' AND " + notKinds("COALESCE(+kind,'')", GOALS_NOT_KIND) + " AND " + notMind("") +
  " AND " + BUILD_SCOPE("") + txEval("+eval", includeEval) + " GROUP BY COALESCE(kind,'')";

// ---- Broadcast (UI-B11a): ONE ledger read, src/broadcastread.js readBroadcast and equippedHere ----
// GET /broadcast (and its twins, the `broadcast` tool and brain://broadcast) and GET /map/mcp's workspace-shelf each run
// exactly ONE D1 statement beyond the memoized auth: BROADCAST_SQL. The brief drew two (X1 the shelf's items and publishes,
// X2 the equips); they fold into one because a version is an ordinal (the n-th publish of a slug) and "equipped here" names
// one, so the equips cannot be read without the publishes and their items (the brief's own learned trap: Map · MCP's one
// statement has to yield v and latest). The kinds are filings on the existing ledger (Fork 1 (a), no table).
//   arm 1 — the newest BROADCAST_ROWS_LIMIT + 1 rows of kind item, publish or equip (the last one says there is more), on
//           idx_transmission_kind_eval (kind, eval): the shelf is org-wide (this worker's D1 alone, QF4501CEC), drafts and
//           publishes of every project; an equip row only in a project the reader holds a seat on (the owner: any active
//           project), so "equipped in N projects" counts only the reader's own (D7) and nobody reads another project's.
//   arm 2 — the reader's own seats on active projects (kind 'seat', project = the key, what = its name): whether the reader
//           may equip here, folded in so the read never runs projectSeatsFor (which no request memo serves).
// The unary + on the ORDER BY's created_at keeps the planner off idx_transmission_eval_created (which would walk the whole
// non-suite ledger newest first to spare a sort): the rows are the three kinds' range on idx_transmission_kind_eval, sorted
// in a temp b-tree (a few presses and drafts, never the ledger). The owner's active projects are a list subquery on the
// small projects table. Suite rows are out unless ?eval=1. Binds: isOwner (1|0), reader id, limit, reader id. tools/d1-hot-selftest.mjs section O
// EXPLAINs this exact string.
export const BROADCAST_KINDS = "('item','publish','equip')";
export const BROADCAST_ROWS_LIMIT = 2000;
export const BROADCAST_SQL = (includeEval) =>
  "SELECT * FROM (SELECT t.id, t.kind, t.submitter, p.name AS by_name, t.what, t.why, t.touches, t.gaprefs, t.proof, t.parent, t.route, t.project, t.eval, t.created_at " +
  "FROM transmission t LEFT JOIN people p ON p.id = t.submitter " +
  "WHERE t.kind IN " + BROADCAST_KINDS + (includeEval ? "" : " AND t.eval = 0") + " AND t.org = {org}" +
  " AND (t.kind != 'equip' OR (? = 1 AND t.project IN (SELECT key FROM projects WHERE active = 1 AND org = {org})) " +
  "OR t.project IN (SELECT s.project_key FROM project_seats s JOIN projects sp ON sp.key = s.project_key AND sp.active = 1 AND sp.org = {org} WHERE s.person_id = ?)) " +
  "ORDER BY +t.created_at DESC, t.id DESC LIMIT ?) " +
  "UNION ALL SELECT NULL, 'seat', NULL, NULL, sp.name, NULL, NULL, NULL, NULL, NULL, NULL, s.project_key, 0, NULL " +
  "FROM project_seats s JOIN projects sp ON sp.key = s.project_key AND sp.active = 1 AND sp.org = {org} WHERE s.person_id = ?";

// ---- Broadcast's live picture (sprint 2, the owner's MCQ of 2026-10-01): src/broadcastlive.js readLive ----
// The last LIVE_DAYS days of the project's LANDED contributions (route auto, or decided approve: G1's own landed predicate),
// newest LIVE_LIMIT, each with its person (people by primary key) and its goal's title (k_goals by primary key, when the
// filing names one): ONE statement on idx_transmission_project (project, created_at), walked newest first from now back to
// the cutoff and stopped at the LIMIT. A filing with no goal_ref is the "unaligned" bucket on glass (the door's own word).
// Left out: the kinds that are a press or a dispute, never work toward a goal (LIVE_NOT_KIND: counter, critique, rank,
// restore, item, publish, equip; knowledge stays: a save_knowledge or remove_knowledge call IS a person's contribution), R's own namespace
// (notMind) and the suites' rows unless ?eval=1. The eval term is written +t.eval so the planner never trades the project
// range for idx_transmission_eval_created (every non-suite filing of the org, newest first). `profile` is the people
// column list (", p.avatar"; "" on a database before migrate-044: core.js withProfile). Sprint 3 (happenedAt, migrate-051): the
// window is when the work HAPPENED, COALESCE(happened_at, created_at) >= the cutoff, a filter on the same created_at range
// (happened_at is never later than created_at), and each dot is drawn at that time; the poll's cursor stays created_at (what
// was FILED since). Binds: project, since ISO (the cutoff, or the poll's cursor), cutoff ISO, limit.
// BROADCAST_POLL_SQL is the poll (GET /broadcast/live?since=, the Map's rhythm: on focus and every 30 s while visible,
// never on page load): the same rows from `since` on, oldest first, LIVE_POLL_LIMIT at most, so it reads only what is new.
// tools/d1-hot-selftest.mjs section O2 EXPLAINs both strings.
export const LIVE_DAYS = 7, LIVE_LIMIT = 200, LIVE_POLL_LIMIT = 50;
// D2b: the dots are CONTRIBUTIONS, as Home and Build count them: a record (a knowledge write, a grade) is never one (Broadcast
// read "97 contributions" beside Home's 63)
export const LIVE_NOT_KIND = "('counter','critique','rank','restore','item','publish','equip','knowledge','grade')";
const BC_LIVE_FROM = (profile) => "SELECT t.id, t.submitter, p.name AS by_name" + (profile || "") + ", t.goal_ref, g.title AS goal_title, t.kind, t.lane, t.what, t.created_at, t.happened_at " +
  "FROM transmission t LEFT JOIN people p ON p.id = t.submitter LEFT JOIN k_goals g ON g.project = t.project AND g.id = t.goal_ref ";
const BC_LIVE_WHERE = (includeEval) => "WHERE t.project = ? AND t.created_at >= ? AND COALESCE(t.happened_at, t.created_at) >= ? AND (t.route = 'auto' OR t.decision = 'approve') AND " +
  notKinds("COALESCE(t.kind,'')", LIVE_NOT_KIND) + " AND " + notMind("t") + (includeEval ? "" : " AND +t.eval = 0");
export const BROADCAST_LIVE_SQL = (includeEval, profile = ", p.avatar") => BC_LIVE_FROM(profile) + BC_LIVE_WHERE(includeEval) + " ORDER BY t.created_at DESC LIMIT ?";
export const BROADCAST_POLL_SQL = (includeEval, profile = ", p.avatar") => BC_LIVE_FROM(profile) + BC_LIVE_WHERE(includeEval) + " ORDER BY t.created_at ASC LIMIT ?";

// ---- UI-B12a, Control's ONE read (src/controlread.js readControl; GET /control/people): three statements, X1 X2 X3 ----
// The population is the ACTIVE one (D5): active people, ACTIVE projects (the countActiveProjects predicate), live devices.
// The suites' fixed people (`eval-fixed-*`, src/util.js EVAL_SEAT_PREFIX) are out unless the admin asks (?eval=1); the
// reader's own row is never dropped. `scoped` is the non-admin's read (D4): only the people who share an ACTIVE project
// with the reader (and the reader), only the seat chips of the reader's own ACTIVE projects, only the reader's devices.
// The reader's seats ride the statement itself (the subquery on project_seats' primary key), never a fourth read: the
// budget holds at three in a one-project org too, where the workspace seam never read seatsOnce. tools/d1-hot-selftest.mjs
// section V EXPLAINs these exact strings.
const CONTROL_EVAL_OUT = (col) => ` AND (${col} = ? OR ${col} NOT LIKE 'eval-fixed-%')`;
// the reader's ACTIVE projects (the scoped read's one subquery): project_seats by its primary key (person_id, project_key)
const CONTROL_MINE = "SELECT m.project_key FROM project_seats m JOIN projects mp ON mp.key = m.project_key AND mp.active = 1 AND mp.org = {org} WHERE m.person_id = ?";
// X1 · people LEFT JOIN their seats, one row per (person, seat), plus the org's first REAL admin (never the suites' fixed
// owner) as admin_name: the tenant.js OWNER_SQL order on idx_people_owner, the eval prefix out. The admin's read (sprint 2, the
// live budget) walks the ACTIVE people in name order on migrate-042's idx_people_active and their seats on project_seats'
// primary key, and nothing else: which seat is on an ACTIVE project (a seat on an archived one reads as no chip) and the
// project's name come from X2 (src/controlread.js), never a projects probe per seat. Scoped: the seat join keeps only the
// reader's own ACTIVE projects, the seat's project joined when ACTIVE, and the people are the reader plus everyone seated on
// one of them (people by key: the unary + keeps idx_people_active, every active person, off the scoped read). Binds: scoped
// -> [reader, reader, reader(, reader)]; unscoped -> [(reader)] (the trailing reader only without ?eval=1).
// Sprint 2, Control simple (migrate-044): both reads also carry each person's hats, avatar and typed label (profile: false is
// the same statement without them, for a database migrate-044 has not reached: src/core.js withProfile). The ADMIN's read is
// ONE row per person (it was one per seat), on idx_people_active: their seats as one list (group_concat on project_seats'
// primary key: a person's seats plus the one entry that ends their range) and their newest filing (MAX on
// idx_transmission_submitter: one index probe per person, the min/max shortcut). On the 305-person volume org: 81 people +
// 200 seat entries + ~60 filings = 342 rows, where it was 282 and the devices of everyone (242 more) beside it: the admin's
// devices are their own now (X3 scoped; ?all=1 reads everyone's). archived: true (?all=1, the admin) walks every person,
// the ACTIVE first. Binds unchanged: scoped -> [reader ×4]; unscoped -> [(reader)].
// migrate-045: the admin-set access hats ride the same list (profile: "044" is the list without them, for a database
// migrate-045 has not reached; src/controlread.js tries the three in order)
const PROFILE_P = (profile) => (profile === false ? "" : profile === "044" ? "p.hats, p.avatar, p.role_label, " : "p.hats, p.avatar, p.role_label, p.access_hats, ");
export const CONTROL_PEOPLE_SQL = (scoped, includeEval, { archived = false, profile = true } = {}) => scoped
  ? "SELECT p.id, p.name, p.email, p.role, p.title, p.trace_consent, " + PROFILE_P(profile) + "pr.key AS project, pr.name AS project_name, " +
    "(SELECT o.name FROM people o WHERE o.role = 'owner' AND o.active = 1 AND o.org = {org} AND o.id NOT LIKE 'eval-fixed-%' ORDER BY o.created_at ASC LIMIT 1) AS admin_name " +
    "FROM people p LEFT JOIN project_seats s ON s.person_id = p.id AND s.project_key IN (" + CONTROL_MINE + ")" +
    " LEFT JOIN projects pr ON pr.key = s.project_key AND pr.active = 1 " +
    "WHERE +p.active = 1 AND p.id IN (SELECT ? UNION SELECT x.person_id FROM project_seats x WHERE x.project_key IN (" + CONTROL_MINE + "))" +
    (includeEval ? "" : CONTROL_EVAL_OUT("p.id")) + " ORDER BY p.name, p.id, pr.key"
  : "SELECT p.id, p.name, p.email, p.role, p.title, p.trace_consent, " + PROFILE_P(profile) + "p.active, " +
    "(SELECT group_concat(s.project_key, ',') FROM project_seats s WHERE s.person_id = p.id) AS seats, " +
    "(SELECT MAX(t.created_at) FROM transmission t WHERE t.submitter = p.id) AS last_filed, " +
    "(SELECT o.name FROM people o WHERE o.role = 'owner' AND o.active = 1 AND o.org = {org} AND o.id NOT LIKE 'eval-fixed-%' ORDER BY o.created_at ASC LIMIT 1) AS admin_name " +
    "FROM people p WHERE " + (archived ? "p.active IN (1, 0)" : "p.active = 1") + " AND p.org = {org}" +
    (includeEval ? "" : CONTROL_EVAL_OUT("p.id")) + (archived ? " ORDER BY p.active DESC, p.name, p.id" : " ORDER BY p.name, p.id");
// X2 · the projects (every reader reads the org's active keys: this-org's chips). Each project's seat count (the
// ACTIVE non-eval people seated there) is counted from X1's rows by src/controlread.js (sprint 2: it was a correlated count
// over every seat the project ever had, each probing people): the admin's X1 lists every active person with every seat, and
// a non-admin's lists everyone seated on the reader's own projects, the only ones whose count a non-admin is shown.
// Sprint 2, Control simple: every project, the archived ones too (active 0), so the admin can activate one: a project row per
// project, a handful in any org. src/controlread.js keeps the ACTIVE ones wherever it read only those before.
// sprint 3 S3b (migrate-062): with each project's eval mark (a test run's own project is listed only on the admin's ?eval=1)
export const CONTROL_PROJECTS_SQL = "SELECT pr.key, pr.name, pr.active, pr.eval FROM projects pr WHERE pr.org = {org} ORDER BY pr.slug";
// X3 · live devices (not revoked, not expired) of ACTIVE people, newest first. Unscoped (the admin): the ACTIVE people on
// idx_people_active, each person's LIVE keys on migrate-042's idx_tokens_person_live (person_id, revoked, expires_at): no
// expired key and no key of a deactivated person is read (sprint 2: it walked every unrevoked key of the org on
// idx_tokens_live, most of them expired); scoped: the reader's own, on idx_tokens_person (person_id, revoked) — the ORDER
// BY's unary + keeps the planner off idx_tokens_live (every live token of the org, walked for one person's).
// The admin's rows come unsorted and src/controlread.js keeps the newest CONTROL_DEVICES_LIMIT (a sort in the statement would
// be billed one more row read per live key, and it read every live key of the active people either way).
// Binds: scoped -> [reader, now]; unscoped -> [now(, reader)].
export const CONTROL_DEVICES_LIMIT = 200;
export const CONTROL_DEVICES_SQL = (scoped, includeEval) => scoped
  ? "SELECT t.person_id, t.device, t.created_at, t.expires_at FROM tokens t WHERE t.person_id = ? AND t.revoked = 0 AND t.expires_at > ? " +
    "ORDER BY +t.created_at DESC LIMIT " + CONTROL_DEVICES_LIMIT
  : "SELECT t.person_id, t.device, t.created_at, t.expires_at FROM people p CROSS JOIN tokens t ON t.person_id = p.id AND t.revoked = 0 AND t.expires_at > ? " +
    "WHERE p.active = 1 AND p.org = {org}" + (includeEval ? "" : CONTROL_EVAL_OUT("t.person_id"));

// ---- the checklist and its meter (sprint 3, B3): src/checklist.js ----
// CHECKLIST_SQL — every count the meter reads that is not a goal or a question, in ONE row and a bounded number of rows read
// (?1 the project): migrate-050's k_fill (the screens, doors, gaps, checks and goals counted and kept exact by triggers: five
// rows on its primary key, never a count over k_nodes, k_checks or k_goals), the aim (one row), the GTM template, start-here and an equip (one
// probe each), the docs under gtm/ (their range of k_docs' primary key), the project's surfaces (idx_k_nodes_type) each with
// ONE probe for a screen naming it (idx_k_nodes_screen_surface: the expression and the type term repeat the index byte for
// byte), a table (one probe), the card kinds on the GTM tab (k_card_kinds' range) each with one probe for a card, and the
// equips (migrate-042's transmission_kinds tally, never the ledger). A surface's key is its id after "surface:"
// (src/knowledge/screens.js). tools/d1-hot-selftest.mjs EXPLAINs this exact string; tools/checklist-selftest.mjs runs it.
const SURFACE_KEY = (a) => `CASE WHEN ${a}.id LIKE 'surface:%' THEN substr(${a}.id, 9) ELSE ${a}.id END`;
// D1b item 20: or a screen naming it in a LIST of apps (migrate-057's partial index of the list screens only)
const SURFACE_HAS_SCREEN = (a) => `(EXISTS (SELECT 1 FROM k_nodes x WHERE x.project = ?1 AND x.type = 'screen' AND json_extract(x.data, '$.surface') = ${SURFACE_KEY(a)}) ` +
  `OR EXISTS (SELECT 1 FROM k_nodes x WHERE x.project = ?1 AND +x.type = 'screen' AND json_type(x.data, '$.surface') = 'array' AND ${SURFACE_KEY(a)} IN (SELECT value FROM json_each(x.data, '$.surface'))))`;
// the role rule in SQL (src/knowledge/cards.js admits, repeated here so hotsql imports no reader): a list column admits the
// keys bound at p when it is NULL, an empty list, or names one of them; a malformed value admits no one
export const ADMITS = (col, p) => `(CASE WHEN ${col} IS NULL THEN 1 WHEN NOT json_valid(${col}) THEN 0 WHEN json_array_length(${col}) = 0 THEN 1 ` +
  `ELSE EXISTS (SELECT 1 FROM json_each(${col}) j WHERE j.value IN (SELECT r.value FROM json_each(${p}) r)) END)`;
// a GTM card kind HAS a card when a card of it is one the reader may read (p: the reader's keys, NULL for the owner; sprint 1's
// review, closed in 6.6: a count never includes an item the reader cannot read)
// seen(p, owner, reader) -> one count or probe as the reader may read it: the owner's (p NULL) is the statement it always was, every
// other reader's also passes the role rule (CASE runs the one branch it picks: the owner's reads are unchanged)
const seen = (p, owner, reader) => `(CASE WHEN ${p} IS NULL THEN ${owner} ELSE ${reader} END)`;
const GTM_KIND_HAS_CARD = (a, p) => seen(p, `EXISTS (SELECT 1 FROM k_cards c WHERE c.project = ?1 AND c.kind = ${a}.key)`,
  `EXISTS (SELECT 1 FROM k_cards c WHERE c.project = ?1 AND c.kind = ${a}.key AND ${ADMITS("c.role_visibility", p)})`);
// The statement is built from its parts so a tab's chip reads only the parts its items need (src/checklist.js colsOf): the
// Goals chip k_fill alone, the Map's k_fill, the surfaces and a table, GTM's the template, its docs and its card kinds,
// Broadcast's the equips; What is missing and Home read every part (CHECKLIST_SQL).
const CHECKLIST_PARTS = {
  // k_fill's rows: the five kinds of migrate-050, and (sprint 3 B4, migrate-054) 'stale', whose n is how many checks are stale
  fill: "(SELECT json_group_array(json_array(kind, n, flow, pictured, checked, linked, ungraded, open, roots, leaves, laned)) FROM k_fill WHERE project = ?1) AS fill",
  aim: "(SELECT CASE WHEN measure IS NULL THEN 1 ELSE 2 END FROM k_aim WHERE project = ?1) AS aim",
  gtm: "EXISTS (SELECT 1 FROM k_gtm WHERE project = ?1) AS gtm",
  // sprint 1's review, closed in 6.6: the docs as the reader may read them (?2 their keys, NULL for the owner)
  start_here: `${seen("?2", "EXISTS (SELECT 1 FROM k_docs WHERE project = ?1 AND path = 'start-here.md')",
    `EXISTS (SELECT 1 FROM k_docs WHERE project = ?1 AND path = 'start-here.md' AND ${ADMITS("role_visibility", "?2")})`)} AS start_here`,
  gtm_docs: `${seen("?2", "(SELECT COUNT(*) FROM k_docs WHERE project = ?1 AND path >= 'gtm/' AND path < 'gtm0')",
    `(SELECT COUNT(*) FROM k_docs WHERE project = ?1 AND path >= 'gtm/' AND path < 'gtm0' AND ${ADMITS("role_visibility", "?2")})`)} AS gtm_docs`,
  surfaces: `(SELECT json_array(COUNT(*), COALESCE(SUM(${SURFACE_HAS_SCREEN("s")}), 0)) FROM k_nodes s WHERE s.project = ?1 AND s.type = 'surface') AS surfaces`,
  tables: "EXISTS (SELECT 1 FROM k_nodes WHERE project = ?1 AND type = 'table') AS tables",
  // D2b item 10: only the kinds the reader may read (?2 their keys, NULL for the owner): the Library's role rule (cards.js admits);
  // a kind has a card only when the reader may read one of its cards (6.6)
  gtm_kinds: `(SELECT json_array(COUNT(*), COALESCE(SUM(${GTM_KIND_HAS_CARD("k", "?2")}), 0)) FROM k_card_kinds k WHERE k.project = ?1 AND k.tab = 'gtm' AND (?2 IS NULL OR ${ADMITS("k.role_visibility", "?2")})) AS gtm_kinds`,
  equips: "(SELECT COALESCE(SUM(n), 0) FROM transmission_kinds WHERE project = ?1 AND eval = 0 AND mind = 0 AND kind = 'equip') AS equips",
  // sprint 3 B4, stale by AGE (src/knowledge/fresh.js): the cards and docs carrying an as-of date, by area (a card of a kind on
  // the GTM tab and a doc under gtm/ are the gtm area's, the rest the core's), and how many are due for review (as_of older
  // than the kind's review_after_days, else 90). Rows read: the dated cards and docs only (the partial indexes
  // idx_k_cards_as_of and idx_k_docs_as_of, migrate-054) and one probe per dated card for its kind. Only the cards and docs the
  // reader may read (6.6: a card passes its own list and its kind's, a doc its own; the owner, ?2 NULL, reads all): the rows read
  // are the same rows, the role rule a test on them.
  fresh: "(SELECT json_array(COALESCE(SUM(a = 'core'), 0), COALESCE(SUM(a = 'core' AND due), 0), COALESCE(SUM(a = 'gtm'), 0), COALESCE(SUM(a = 'gtm' AND due), 0)) FROM (" +
    "SELECT CASE WHEN k.tab = 'gtm' THEN 'gtm' ELSE 'core' END AS a, (c.as_of < date('now', '-' || COALESCE(k.review_after_days, 90) || ' days')) AS due " +
    "FROM k_cards c INDEXED BY idx_k_cards_as_of LEFT JOIN k_card_kinds k ON k.project = c.project AND k.key = c.kind WHERE c.project = ?1 AND c.as_of IS NOT NULL " +
    `AND (?2 IS NULL OR (${ADMITS("c.role_visibility", "?2")} AND ${ADMITS("k.role_visibility", "?2")})) ` +
    "UNION ALL SELECT CASE WHEN d.path >= 'gtm/' AND d.path < 'gtm0' THEN 'gtm' ELSE 'core' END, (d.as_of < date('now', '-90 days')) " +
    `FROM k_docs d INDEXED BY idx_k_docs_as_of WHERE d.project = ?1 AND d.as_of IS NOT NULL AND (?2 IS NULL OR ${ADMITS("d.role_visibility", "?2")}))) AS fresh`,
};
export const CHECKLIST_COLS = Object.keys(CHECKLIST_PARTS);
// checklistSql(cols) -> the statement over those parts, in this order (one string per set, so a memo and a test can name it)
export const checklistSql = (cols = CHECKLIST_COLS) => "SELECT " + CHECKLIST_COLS.filter((c) => cols.includes(c)).map((c) => CHECKLIST_PARTS[c]).join(", ");
export const CHECKLIST_SQL = checklistSql();
// CHECKLIST_FIRSTS_SQL — the first missing thing of each open item, by id and name (`id || char(31) || name`), read only by
// What is missing (the `missing` tool, GET /missing) and only for the items that are open: ?2..?12 are 0/1 flags, and a CASE
// whose flag is 0 runs no subquery at all, and a flag is 1 only when the item has a missing thing to find, so each walk on
// idx_k_nodes_type stops at the first screen or door it finds missing (at most the project's screens or doors, with a probe
// or two each); the gaps, surfaces, GTM card kinds and goals are a few; the first ungraded check is one row of
// k_check_ungraded's primary key. (A walk capped in a subquery LIMIT reads the whole cap: measured, 1,049 rows on siru.)
const firstOf = (type, notCond) => `(SELECT n.id || char(31) || COALESCE(n.name, '') FROM k_nodes n WHERE n.project = ?1 AND n.type = '${type}' AND ${notCond} LIMIT 1)`;
// a nav edge to the screen: INDEXED BY is load-bearing (left to itself the planner walks the k_edges primary key's whole
// project range for every screen, as a covering scan: 7,282 rows on bunny, measured)
const NAV_OF = "(EXISTS (SELECT 1 FROM k_edges e WHERE e.project = ?1 AND e.from_id = n.id AND e.kind = 'nav') OR EXISTS (SELECT 1 FROM k_edges e INDEXED BY idx_k_edges_to WHERE e.project = ?1 AND e.to_id = n.id AND e.kind = 'nav'))";
const CHECKED_OF = "EXISTS (SELECT 1 FROM k_check_refs c WHERE c.project = ?1 AND c.ref = n.id)";
export const CHECKLIST_FIRSTS_SQL = "SELECT " +
  "CASE WHEN ?2 THEN (SELECT id || char(31) || COALESCE(name, '') FROM k_nodes WHERE project = ?1 AND type = 'gap' AND status = 'open' LIMIT 1) END AS gap, " +
  `CASE WHEN ?3 THEN (SELECT s.id || char(31) || COALESCE(s.name, '') FROM k_nodes s WHERE s.project = ?1 AND s.type = 'surface' AND NOT ${SURFACE_HAS_SCREEN("s")} LIMIT 1) END AS surface, ` +
  `CASE WHEN ?4 THEN ${firstOf("screen", `NOT ((json_extract(n.data, '$.lane') IS NOT NULL AND json_extract(n.data, '$.step') IS NOT NULL) OR ${NAV_OF})`)} END AS flow, ` +
  `CASE WHEN ?5 THEN ${firstOf("screen", "NOT (json_extract(n.data, '$.wireframe') IS NOT NULL OR EXISTS (SELECT 1 FROM k_renders r WHERE r.project = ?1 AND r.screen = n.id))")} END AS pictured, ` +
  `CASE WHEN ?6 THEN ${firstOf("screen", `NOT ${CHECKED_OF}`)} END AS screen_check, ` +
  `CASE WHEN ?7 THEN ${firstOf("door", `NOT ${CHECKED_OF}`)} END AS door_check, ` +
  `CASE WHEN ?8 THEN ${firstOf("door", "NOT EXISTS (SELECT 1 FROM k_edges e WHERE e.project = ?1 AND e.from_id = n.id AND e.kind IN ('reads','writes'))")} END AS link, ` +
  "CASE WHEN ?9 THEN (SELECT u.check_id || char(31) || COALESCE(c.title, '') FROM k_check_ungraded u JOIN k_checks c ON c.project = u.project AND c.id = u.check_id " +
  "WHERE u.project = ?1 ORDER BY u.check_id LIMIT 1) END AS ungraded, " +
  `CASE WHEN ?10 THEN (SELECT k.key || char(31) || COALESCE(k.label, '') FROM k_card_kinds k WHERE k.project = ?1 AND k.tab = 'gtm' AND (?16 IS NULL OR ${ADMITS("k.role_visibility", "?16")}) AND NOT ${GTM_KIND_HAS_CARD("k", "?16")} LIMIT 1) END AS gtm_kind, ` +
  "CASE WHEN ?11 THEN (SELECT id || char(31) || COALESCE(title, '') FROM k_goals WHERE project = ?1 AND parent IS NULL LIMIT 1) END AS goal_root, " +
  "CASE WHEN ?12 THEN (SELECT g.id || char(31) || COALESCE(g.title, '') FROM k_goals g WHERE g.project = ?1 AND json_array_length(g.dimensions) = 0 " +
  "AND NOT EXISTS (SELECT 1 FROM k_goals c WHERE c.project = ?1 AND c.parent = g.id) LIMIT 1) END AS goal_leaf, " +
  // sprint 3 B4: the first STALE check (k_check_stale's key), and the newest change that made a grade stale (its contribution
  // or, for a knowledge write, the node: idx_k_node_stale_at walked newest first to the first row still stale)
  "CASE WHEN ?13 THEN (SELECT z.check_id || char(31) || COALESCE(c.title, '') FROM k_check_stale z JOIN k_checks c ON c.project = z.project AND c.id = z.check_id " +
  "WHERE z.project = ?1 ORDER BY z.check_id LIMIT 1) END AS stale, " +
  "CASE WHEN ?13 THEN (SELECT COALESCE(s.changed_by, '') || char(31) || s.node_id || char(31) || s.changed_at FROM k_node_stale s INDEXED BY idx_k_node_stale_at " +
  "WHERE s.project = ?1 AND s.stale > 0 ORDER BY s.updated_at DESC LIMIT 1) END AS stale_since, " +
  // the first card and doc due for review that every reader may see (no role visibility), core then gtm
  "CASE WHEN ?14 THEN (SELECT 'doc:' || d.path || char(31) || COALESCE(d.title, d.path) FROM k_docs d INDEXED BY idx_k_docs_as_of WHERE d.project = ?1 AND d.as_of IS NOT NULL " +
  "AND d.as_of < date('now', '-90 days') AND NOT (d.path >= 'gtm/' AND d.path < 'gtm0') AND (d.role_visibility IS NULL OR d.role_visibility = '[]') LIMIT 1) END AS due_doc, " +
  "CASE WHEN ?14 THEN (SELECT 'card:' || c.kind || '/' || c.id || char(31) || COALESCE(c.name, c.id) FROM k_cards c INDEXED BY idx_k_cards_as_of " +
  "LEFT JOIN k_card_kinds k ON k.project = c.project AND k.key = c.kind WHERE c.project = ?1 AND c.as_of IS NOT NULL AND k.tab IS NOT 'gtm' " +
  "AND c.as_of < date('now', '-' || COALESCE(k.review_after_days, 90) || ' days') AND (c.role_visibility IS NULL OR c.role_visibility = '[]') AND (k.role_visibility IS NULL OR k.role_visibility = '[]') LIMIT 1) END AS due_card, " +
  "CASE WHEN ?15 THEN (SELECT 'card:' || c.kind || '/' || c.id || char(31) || COALESCE(c.name, c.id) FROM k_cards c INDEXED BY idx_k_cards_as_of " +
  "LEFT JOIN k_card_kinds k ON k.project = c.project AND k.key = c.kind WHERE c.project = ?1 AND c.as_of IS NOT NULL AND k.tab = 'gtm' " +
  "AND c.as_of < date('now', '-' || COALESCE(k.review_after_days, 90) || ' days') AND (c.role_visibility IS NULL OR c.role_visibility = '[]') AND (k.role_visibility IS NULL OR k.role_visibility = '[]') LIMIT 1) END AS due_gtm_card, " +
  "CASE WHEN ?15 THEN (SELECT 'doc:' || d.path || char(31) || COALESCE(d.title, d.path) FROM k_docs d INDEXED BY idx_k_docs_as_of WHERE d.project = ?1 AND d.as_of IS NOT NULL " +
  "AND d.as_of < date('now', '-90 days') AND d.path >= 'gtm/' AND d.path < 'gtm0' AND (d.role_visibility IS NULL OR d.role_visibility = '[]') LIMIT 1) END AS due_gtm_doc";

// ---- M4 (sprint 4): the Arch view's marks, ONE statement per diagram ----
// For the diagram's ids (its parts and the service nodes they run on: ?2, a JSON list, at most ARCH_MARK_IDS), each id's light
// (k_node_lights, migrate-043) and stale row (k_node_stale, migrate-054), both probes on their primary keys; only an id with
// either row comes back. Two columns more are read only where they say something: the first check whose latest grade is refused
// (a red light: its id and title) and the stale checks (a stale count: at most ARCH_STALE_CHECKS, ids and titles), each a walk
// of that one id's k_check_refs range. Rows: two probes per id, plus the failing and stale ids' own checks.
export const ARCH_MARK_IDS = 320, ARCH_STALE_CHECKS = 12;
export const ARCH_MARKS_SQL = "SELECT j.value AS id, l.light, l.green, l.red, l.amber, l.grey, z.stale, z.changed_at, z.changed_by, " +
  "CASE WHEN l.red > 0 THEN (SELECT c.id || char(31) || c.title FROM k_check_refs r JOIN k_checks c ON c.project = r.project AND c.id = r.check_id " +
  "WHERE r.project = ?1 AND r.ref = j.value AND (SELECT x.status FROM check_results x WHERE x.project = r.project AND x.check_id = r.check_id " +
  "ORDER BY x.graded_at DESC, x.id DESC LIMIT 1) = 'refused' ORDER BY r.check_id LIMIT 1) END AS failing, " +
  "CASE WHEN z.stale > 0 THEN (SELECT group_concat(q.v, char(30)) FROM (SELECT c.id || char(31) || c.title AS v FROM k_check_refs r " +
  "JOIN k_check_stale s ON s.project = r.project AND s.check_id = r.check_id JOIN k_checks c ON c.project = r.project AND c.id = r.check_id " +
  `WHERE r.project = ?1 AND r.ref = j.value ORDER BY r.check_id LIMIT ${ARCH_STALE_CHECKS}) q) END AS stale_checks ` +
  "FROM json_each(?2) j LEFT JOIN k_node_lights l ON l.project = ?1 AND l.node_id = j.value " +
  "LEFT JOIN k_node_stale z ON z.project = ?1 AND z.node_id = j.value WHERE l.node_id IS NOT NULL OR z.node_id IS NOT NULL";
