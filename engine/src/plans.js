// src/plans.js — the org's plan, its usage and the limits' enforcement (sprint 8, 8.1 and 8.2; docs/plan/PLATFORM.md §4 sprint 8:
// "a plan per org, its limits in a table; usage counted by SQL aggregates, never by reading a table to count it" and "every write
// checks the plan: a warning at 80%, a clear refusal at 100% with its error code; reads are never refused; the per-minute burst
// limit per org"). 8.4 shows them on Control and in whoami. Every statement is the SIGNED-IN reader's org's (src/data.js {org}),
// never an org a caller names, and no answer here names or counts another org.
//
//   planShownOf(env, {now}) -> what Control (the admin's) and whoami show (8.4; PLATFORM §4: "Control shows the plan and the
//                           usage; whoami answers the plan"): the plan the checks apply, each limit with its usage counted by the
//                           CHECK's own definition (the same constants below), so the number shown is the number a warning or a
//                           refusal names. ONE statement. null when the org has no row; limits null when no plan row applies.

import { db } from "./data.js";
import { isD1Quota } from "./util.js";

// ==== 8.4 · STORAGE: ONE definition, read by the display (planShownOf, storageShownOf) and the check (CHECK_SQL.storage_bytes) ====
// PLATFORM §4: "the storage limit counts files and screen pictures per org". What the org holds in R2, each body ONCE:
//   files     every banked file's bytes (artifacts.bytes: one object each, o<org>/inbox/…), on migrate-075's covering index
//   pictures  every screen-picture body of the org's projects, archived ones included (their bodies stay stored): a body lies
//             at o<org>/renders/<project>/<sha256>, put once per (project, hash) (src/knowledge/write.js putBodies), and none is
//             ever purged (every take is history: PLATFORM §3). k_screen_takes holds every hash a frame ever held (migrate-065's
//             triggers append each new one, the live render's among them), so its DISTINCT (project, hash) are the renders'
//             bodies; k_styles' stylesheets lie under the same key form, counted when no take holds that body. These are the
//             tables the backup and the per-org restore name the bodies by (src/backup.js, tools/org-undo.mjs). Each row's
//             `bytes` is the body's size as stored. An image render's bytes are COPIED from its artifact: two objects, both count.
// The org's range for the pictures: its projects' keys (projects.org, migrate-067's generated column, on idx_projects_org_slug),
// then each project's takes on idx_k_screen_takes_hash, grouped by (project, hash) in the index's own order. Rows read: the
// org's projects (twice: the takes and the styles) and its takes and styles — its own ranges only, never another org's.
export const ORG_PROJECT_KEYS_SQL = "SELECT key FROM projects WHERE org = {org}";
export const STORAGE_FILES_SQL = "(SELECT COALESCE(SUM(bytes), 0) FROM artifacts INDEXED BY idx_artifacts_org_bytes WHERE org = {org} AND bytes >= 0)";
export const STORAGE_PICTURES_SQL =
  "((SELECT COALESCE(SUM(b), 0) FROM (SELECT MAX(bytes) AS b FROM k_screen_takes INDEXED BY idx_k_screen_takes_hash " +
  "WHERE project IN (" + ORG_PROJECT_KEYS_SQL + ") GROUP BY project, hash)) + " +
  "(SELECT COALESCE(SUM(b), 0) FROM (SELECT MAX(s.bytes) AS b FROM k_styles s WHERE s.project IN (" + ORG_PROJECT_KEYS_SQL + ") " +
  "AND NOT EXISTS (SELECT 1 FROM k_screen_takes t INDEXED BY idx_k_screen_takes_hash WHERE t.project = s.project AND t.hash = s.hash) " +
  "GROUP BY s.project, s.hash)))";
// STORAGE_USED_SQL: the one number the limit counts (files first: a check's text keeps its files term where 8.2 wrote it)
export const STORAGE_USED_SQL = "(" + STORAGE_FILES_SQL + " + " + STORAGE_PICTURES_SQL + ")";
// the other limits' usage, written ONCE and spliced into the check and the shown read alike (the checks' texts are unchanged):
// the HELD seats (active, or pending: a seat waiting for its holder's yes; migrate-076's partial index), the active projects,
// the month's running tally (u: the org's org_usage row; ?1 the month), the day's calls and the minute's burst (?N the window)
export const PEOPLE_HELD_SQL = "(SELECT COUNT(*) FROM people INDEXED BY idx_people_org_held WHERE org = {org} AND active + pending >= 1)";
export const PROJECTS_ACTIVE_SQL = "(SELECT COUNT(*) FROM projects INDEXED BY idx_projects_org_slug WHERE org = {org} AND active = 1)";
export const ITEMS_USED_EXPR = "iif(u.month >= ?1, u.items_month, 0)";
const callsUsedExpr = (n) => `COALESCE(iif(u.day >= ?${n}, u.calls_day, 0), 0)`;
const burstUsedExpr = (n) => `COALESCE(iif(u.minute >= ?${n}, u.calls_minute, 0), 0)`;

const n = (v) => (v == null ? 0 : Number(v));
const clock = (now) => new Date(now == null ? Date.now() : now instanceof Date ? now.getTime() : Number(now));
// monthOf(now) -> 'YYYY-MM' (UTC); dayOf(now) -> 'YYYY-MM-DD' (UTC): the windows the limits are counted in
export const monthOf = (now) => clock(now).toISOString().slice(0, 7);
export const dayOf = (now) => clock(now).toISOString().slice(0, 10);

// ==== 8.2 · ENFORCEMENT: every write checks the plan; reads are never refused ====
// THE COUNTERS (migrate-076 org_usage): ONE row per org holding three windows, each a UTC string cut as above — the day's calls
// (day, calls_day), the minute's burst (minute, calls_minute), the month's ledger rows (month, items_month). Each counted event
// is ONE upsert of that one row; a newer window starts its count over in the same statement, an older one (a clock a little
// behind) counts into the window the row holds. The month's items are this running tally, so a write never re-reads the month's
// filings (and the display reads the same tally, planShownOf below).
// THE VERDICT on the count after the write (after = used + what it adds): after > allowed -> REFUSED, the ONE code plan_limit
// { limit, used, allowed, plan, note } and nothing is written; after reaches 80% of allowed (after * 5 >= allowed * 4) -> WARN,
// the write lands and its answer carries planWarning { limit, used, allowed, plan, note }; else ok. An org whose plan names no
// plan_limits row reads the FREE plan's limits (never unlimited, never locked out); a database with no free row checks nothing.
// The words name this org's own numbers only, and say the operator raises a limit by hand during the beta (PLATFORM §4).
export const PLAN_LIMIT = "plan_limit";
export const minuteOf = (now) => clock(now).toISOString().slice(0, 16);   // 'YYYY-MM-DDTHH:MM' (UTC): the burst's window
// the org's plan row, or the free row when its plan names none (the limits joined as l, the org as o)
const PLAN_JOIN = "FROM org o LEFT JOIN plan_limits l ON l.plan = COALESCE((SELECT x.plan FROM plan_limits x WHERE x.plan = o.plan), 'free') ";
// CHECK_SQL[limit]: ONE read — the limit's allowed number and the org's usage of it. people: the HELD seats (active, or pending:
// a seat waiting for its holder's yes still counts, so consent is no way to park seats) on migrate-076's partial index; projects:
// the active ones (?1 the key a write would make active: held = 1 when it already is, so it adds nothing); items_month: the
// tally (?1 the month: a row of an older month reads 0); storage_bytes: THE storage definition above (files and screen pictures)
export const CHECK_SQL = {
  people: "SELECT l.plan AS plan, l.people AS allowed, " + PEOPLE_HELD_SQL + " AS used " + PLAN_JOIN + "WHERE o.id = {org}",
  projects: "SELECT l.plan AS plan, l.projects AS allowed, " + PROJECTS_ACTIVE_SQL + " AS used, " +
    "(SELECT COUNT(*) FROM projects WHERE key = ?1 AND active = 1 AND org = {org}) AS held " + PLAN_JOIN + "WHERE o.id = {org}",
  items_month: "SELECT l.plan AS plan, l.items_month AS allowed, (SELECT " + ITEMS_USED_EXPR + " FROM org_usage u WHERE u.org = {org}) AS used " + PLAN_JOIN + "WHERE o.id = {org}",
  storage_bytes: "SELECT l.plan AS plan, l.storage_bytes AS allowed, " + STORAGE_USED_SQL + " AS used " + PLAN_JOIN + "WHERE o.id = {org}",
};
// ITEMS_TALLY_SQL (?1 the month, ?2 how many ledger rows land): the count, ONE upsert, run in the SAME D1 batch as the rows it
// counts (src/core.js fileTransmission / fileTransmissionsBatch), so both land or neither does
export const ITEMS_TALLY_SQL = "INSERT INTO org_usage (org, month, items_month) VALUES ({org}, ?1, ?2) ON CONFLICT (org) DO UPDATE SET " +
  "items_month = CASE WHEN excluded.month > month THEN excluded.items_month ELSE items_month + excluded.items_month END, month = MAX(month, excluded.month)";
// CALL_COUNT_SQL (?1 the day, ?2 the minute, ?3 1 for a write): ONE upsert counts a door call in both windows. A WRITE over the
// day's calls or the minute's burst is not counted (it never runs: the refusal is all that happens); a read always is (reads are
// never refused). RETURNING says whether it counted.
export const CALL_COUNT_SQL = "INSERT INTO org_usage (org, day, calls_day, minute, calls_minute) SELECT {org}, ?1, 1, ?2, 1 " +
  "WHERE ?3 = 0 OR NOT EXISTS (SELECT 1 " + PLAN_JOIN + "JOIN org_usage u ON u.org = o.id WHERE o.id = {org} AND " +
  "((u.day >= ?1 AND u.calls_day >= l.calls_day) OR (u.minute >= ?2 AND u.calls_minute >= l.burst_minute))) " +
  "ON CONFLICT (org) DO UPDATE SET calls_day = CASE WHEN excluded.day > day THEN 1 ELSE calls_day + 1 END, day = MAX(day, excluded.day), " +
  "calls_minute = CASE WHEN excluded.minute > minute THEN 1 ELSE calls_minute + 1 END, minute = MAX(minute, excluded.minute) RETURNING calls_day";
// CALL_READ_SQL (?1 the day, ?2 the minute): the limits and the two counts after the upsert (the same batch)
export const CALL_READ_SQL = "SELECT l.plan AS plan, l.calls_day AS calls_allowed, l.burst_minute AS burst_allowed, " +
  callsUsedExpr(1) + " AS calls_used, " + burstUsedExpr(2) + " AS burst_used " +
  PLAN_JOIN + "LEFT JOIN org_usage u ON u.org = o.id WHERE o.id = {org}";

// WORDS: each limit in words (a refusal's and a warning's note; the shown plan's titles, src/controlpage.js)
// copy: error
export const LIMIT_WORDS = {
  people: "people (seats, active or waiting for their holder's yes)",
  projects: "active projects",
  items_month: "items filed this month (UTC: contributions, knowledge writes and grades)",
  calls_day: "MCP and API calls today (UTC)",
  burst_minute: "calls a minute",
  storage_bytes: "bytes of stored files and screen pictures",
};
// RAISE: the one sentence a refusal, a warning and the shown plan (Control, whoami) say about raising a limit
// copy: error
export const RAISE = "During the beta the operator raises an org's limits by hand: ask them.";
// copy: error
const AGAIN = { items_month: " The count starts again on the 1st of the month (UTC).", calls_day: " The count starts again at 00:00 UTC.", burst_minute: " The count starts again each minute." };
// retryAfterOf(limit, now) -> the seconds until the window starts again (burst: the minute's end; calls: 00:00 UTC), else null
export function retryAfterOf(limit, now) {
  const t = clock(now).getTime();
  if (limit === "burst_minute") return Math.max(1, 60 - Math.floor((t % 60000) / 1000));
  if (limit === "calls_day") { const d = new Date(t); return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - t) / 1000)); }
  return null;
}
// warningOf / refusalOf -> the two answers' shapes (pure; the selftest pins them)
export function warningOf(limit, used, allowed, plan) {
  const pct = allowed > 0 ? Math.floor((used * 100) / allowed) : 100;
  // copy: error
  return { limit, used, allowed, plan, note: `This org has used ${used} of its ${allowed} ${LIMIT_WORDS[limit]} (${pct}%, plan ${plan}). At the limit a write is refused (plan_limit); reads always answer.${AGAIN[limit] || ""} ${RAISE}` };
}
export function refusalOf(limit, used, allowed, plan, { adding = 1, now } = {}) {
  const retryAfter = retryAfterOf(limit, now);
  // copy: error (the two sentences below and the note: a refusal a person reads)
  const what = limit === "burst_minute" ? `This org has sent ${used} calls this minute: its ${plan} plan allows ${allowed} ${LIMIT_WORDS[limit]}.`
    // copy: error
    : `This org is at its ${plan} plan's limit of ${allowed} ${LIMIT_WORDS[limit]}: ${used} used${adding > 1 ? `, and this write adds ${adding}` : ""}.`;
  // copy: error
  const wait = retryAfter != null ? ` Send it again in ${retryAfter} seconds.` : "";
  return { error: PLAN_LIMIT, limit, used, allowed, plan, ...(adding > 1 ? { adding } : {}), ...(retryAfter != null ? { retryAfter } : {}),
    // copy: error
    note: `${what} Nothing was written; reads still answer.${wait}${AGAIN[limit] && retryAfter == null ? AGAIN[limit] : ""} ${RAISE}` };
}
// verdictOf({ limit, used, add, allowed, plan }, now) -> { verdict: "ok" } | { verdict: "warn", warning } | { verdict: "refused",
// refusal }: the rule above on after = used + add. allowed null (no limits read) or add <= 0 (the write adds nothing) is ok. Pure.
export function verdictOf({ limit, used, add = 1, allowed, plan }, now) {
  if (allowed == null || !Number.isFinite(Number(allowed)) || !(add > 0)) return { verdict: "ok" };
  const a = Number(allowed), u = Math.max(0, Number(used) || 0), after = u + add;
  if (after > a) return { verdict: "refused", refusal: refusalOf(limit, u, a, plan, { adding: add, now }) };
  if (after * 5 >= a * 4) return { verdict: "warn", warning: warningOf(limit, after, a, plan) };
  return { verdict: "ok" };
}
// callVerdict(row, { write, counted }, now) -> the door call's verdict from CALL_READ_SQL's row (the counts after the upsert): a
// write that was not counted is refused by the limit it is at (the day's first: it lasts longer); else warn when either count
// reached 80% of its limit (the fuller one named), else ok. A read is never refused. Pure.
export function callVerdict(row, { write, counted }, now) {
  if (!row || row.plan == null || row.calls_allowed == null) return { verdict: "ok" };
  const cu = n(row.calls_used), ca = n(row.calls_allowed), bu = n(row.burst_used), ba = n(row.burst_allowed), plan = String(row.plan);
  if (write && !counted) return cu >= ca ? { verdict: "refused", refusal: refusalOf("calls_day", cu, ca, plan, { now }) }
    : { verdict: "refused", refusal: refusalOf("burst_minute", bu, ba, plan, { now }) };
  const fc = ca > 0 ? cu / ca : 1, fb = ba > 0 ? bu / ba : 1;
  const warnC = cu * 5 >= ca * 4, warnB = bu * 5 >= ba * 4;
  if (warnC && (!warnB || fc >= fb)) return { verdict: "warn", warning: warningOf("calls_day", cu, ca, plan) };
  if (warnB) return { verdict: "warn", warning: warningOf("burst_minute", bu, ba, plan) };
  return { verdict: "ok" };
}
// THE REQUEST'S WARNING (PLAN_NOTE): every check that answers warn records it on the request's slot (installed at the worker's entry,
// src/index.js; every copy of the env shares it), and the door puts it on whatever the call answers — a tool's result (src/mcp.js),
// a REST answer (src/index.js: a JSON object's planWarning and a header) — so no writer has to carry it through its own answer
// shape. The fullest warning of the call is kept. resetPlanNote clears it at each tools/call (a JSON-RPC batch is many calls).
export const PLAN_NOTE = Symbol.for("sharingu.planNote");
export const installPlanNote = (env) => { if (env && typeof env === "object") env[PLAN_NOTE] = { warning: null, full: null, partner: false }; return env; };
export const planNoteOf = (env) => (env && env[PLAN_NOTE] && env[PLAN_NOTE].warning) || null;
export const resetPlanNote = (env) => { if (env && env[PLAN_NOTE]) { env[PLAN_NOTE].warning = null; env[PLAN_NOTE].full = null; } };
// THE PARTNER RULE (sprint 8's review A1; docs/plan/MCP.md: "a Partner reads the plan's limits only, never the org's usage", as
// whoami answers it, src/core.js whoamiPlan): the door marks the request's reader on its slot where the sign-in resolves
// (src/index.js routeRequest; src/mcp.js callerOf, as the seat the call acts as), and every warning and refusal a Partner's
// request meets is the plain one (partnerWordsOf): the limit, the plan and its allowed number, never the org's count (no `used`,
// no `adding`, no number of the org's in the note). Every warning and refusal is made here and leaves through notePlan.
export const setPlanReader = (env, partner) => { if (env && env[PLAN_NOTE]) env[PLAN_NOTE].partner = !!partner; };
// copy: error
const PARTNER_ASK = "It is a limit of this org's plan: ask its admin.";
// partnerWordsOf(answer) -> a warning's or a refusal's plain twin for a Partner (pure)
export function partnerWordsOf(x) {
  if (!x || typeof x !== "object") return x;
  const { used, adding, note, ...rest } = x;
  const words = LIMIT_WORDS[x.limit] || x.limit;
  // copy: error
  const wait = x.retryAfter != null ? ` Send it again in ${x.retryAfter} seconds.` : AGAIN[x.limit] || "";
  // copy: error
  return { ...rest, note: x.error ? `This write meets this org's ${x.plan} plan's limit of ${words}. Nothing was written; reads still answer.${wait} ${PARTNER_ASK}`
    // copy: error
    : `This org is near its ${x.plan} plan's limit of ${words}. At the limit a write is refused (plan_limit); reads always answer.${AGAIN[x.limit] || ""} ${PARTNER_ASK}` };
}
const forPartner = (v) => (v && v.warning ? { ...v, warning: partnerWordsOf(v.warning) } : v && v.refusal ? { ...v, refusal: partnerWordsOf(v.refusal) } : v);
const fullness = (w) => (w && w.allowed > 0 ? w.used / w.allowed : 1);
function notePlan(env, v) {
  const slot = env && env[PLAN_NOTE];
  const out = slot && slot.partner ? forPartner(v) : v;
  // the fullest warning of the call, compared on the full numbers; the slot keeps the reader's own words
  if (slot && v && v.warning && (!slot.full || fullness(v.warning) >= fullness(slot.full))) { slot.full = v.warning; slot.warning = out.warning; }
  return out;
}
// a check that cannot read (a database before migrate-076) checks nothing, as a lost read never blocks a write; the D1 quota
// error is the platform's and is thrown on
const quiet = (e) => { if (isD1Quota(e)) throw e; return { verdict: "ok" }; };

// checkPlan(env, limit, { add, key, now }) — the ONE check a write path calls before it writes: ONE read (CHECK_SQL[limit]),
// the verdict above. add: what the write adds (1; a batch its row count; a file its bytes); key (projects): the project a write
// makes active, which adds nothing when it already is.
export async function checkPlan(env, limit, { add = 1, key = "", now } = {}) {
  const sql = CHECK_SQL[limit];
  if (!sql) throw new Error(`checkPlan: no such limit ${limit}`);
  let row;
  try {
    const st = db(env).prepare(sql);
    row = await (limit === "items_month" ? st.bind(monthOf(now)) : limit === "projects" ? st.bind(String(key || "")) : st).first();
  } catch (e) { return quiet(e); }
  if (!row) return { verdict: "ok" };
  const adds = limit === "projects" && Number(row.held) > 0 ? 0 : add;
  return notePlan(env, verdictOf({ limit, used: n(row.used), add: adds, allowed: row.allowed == null ? null : n(row.allowed), plan: row.plan == null ? null : String(row.plan) }, now));
}
// itemsTally(env, rows, now) -> the ONE upsert that counts `rows` ledger rows this month, for the caller's own batch
export const itemsTally = (env, rows, now) => db(env).prepare(ITEMS_TALLY_SQL).bind(monthOf(now), Math.max(0, Math.floor(Number(rows) || 0)));
// countCall(env, { write, now }) — the door's ONE count of a call (src/mcp.js per tools/call, src/index.js per signed-in REST
// write): ONE D1 batch, the conditional upsert then the read. -> the call's verdict (callVerdict). A request with no signed-in
// org is not counted (the layer would refuse the statement: nobody to count).
export async function countCall(env, { write = false, now } = {}) {
  const at = now == null ? Date.now() : now;
  const day = dayOf(at), minute = minuteOf(at);
  let res;
  try {
    res = await db(env).batch([db(env).prepare(CALL_COUNT_SQL).bind(day, minute, write ? 1 : 0), db(env).prepare(CALL_READ_SQL).bind(day, minute)]);
  } catch (e) { return quiet(e); }
  const c = res && res[0], r = res && res[1];
  const counted = !!(c && ((Array.isArray(c.results) && c.results.length > 0) || (c.meta && Number(c.meta.changes) > 0)));
  const row = r && Array.isArray(r.results) ? r.results[0] : null;
  return notePlan(env, callVerdict(row, { write, counted }, at));
}
// withPlanWarning(out, env) -> a call's answer with the request's warning beside it (planNoteOf; an answer that is not a plain
// object, or that names its own, is handed back as it is)
export function withPlanWarning(out, env) {
  const w = planNoteOf(env);
  return w && out && typeof out === "object" && !Array.isArray(out) && out.planWarning == null ? { ...out, planWarning: w } : out;
}

// ==== 8.4 · SHOWN: the plan and its usage, on Control (the admin's) and in whoami ====
// THE LIMITS, in the order they are shown, each by the code a plan_limit refusal or a planWarning names in `limit`
export const LIMIT_ORDER = ["people", "projects", "items_month", "calls_day", "burst_minute", "storage_bytes"];
// SHOWN_SQL (?1 the month, ?2 the day, ?3 the minute): ONE row — the plan the checks apply (PLAN_JOIN: the org's plan row, else
// free's), its six limits, and each one's usage by the CHECK's own constant: the held seats, the active projects, the month's
// tally, the day's calls and the minute's burst (the org's one org_usage row, joined once), and the storage definition split in
// its two parts (files, pictures). Rows read: the org's row, two plan_limits keys, its org_usage row, and its own ranges.
// copy: off-screen
export const SHOWN_SQL = "SELECT l.plan AS plan, l.people AS people_allowed, l.projects AS projects_allowed, l.items_month AS items_month_allowed, " +
  "l.calls_day AS calls_day_allowed, l.burst_minute AS burst_minute_allowed, l.storage_bytes AS storage_bytes_allowed, " +   // copy: off-screen
  PEOPLE_HELD_SQL + " AS people_used, " + PROJECTS_ACTIVE_SQL + " AS projects_used, COALESCE(" + ITEMS_USED_EXPR + ", 0) AS items_month_used, " +
  callsUsedExpr(2) + " AS calls_day_used, " + burstUsedExpr(3) + " AS burst_minute_used, " +
  STORAGE_FILES_SQL + " AS files_bytes, " + STORAGE_PICTURES_SQL + " AS pictures_bytes " +
  PLAN_JOIN + "LEFT JOIN org_usage u ON u.org = o.id WHERE o.id = {org}";
// stateOf(used, allowed) -> "ok" | "warn" (at 80% of the limit or past: the warning's own rule, used * 5 >= allowed * 4) |
// "limit" (at the limit: the next write that adds is refused). Pure.
export function stateOf(used, allowed) {
  const u = n(used), a = n(allowed);
  if (u >= a) return "limit";
  return u * 5 >= a * 4 ? "warn" : "ok";
}
// shownFrom(row, now) -> { plan, limits: { <limit>: { used, allowed, state } … }, storage: { files, pictures }, windows: { month,
// day, minute }, note } of a SHOWN_SQL row; limits null when no plan row applies (a database with no free row). Pure.
export function shownFrom(row, now) {
  if (!row) return null;
  const windows = { month: monthOf(now), day: dayOf(now), minute: minuteOf(now) };
  const files = n(row.files_bytes), pictures = n(row.pictures_bytes);
  const used = { people: n(row.people_used), projects: n(row.projects_used), items_month: n(row.items_month_used), calls_day: n(row.calls_day_used),
    burst_minute: n(row.burst_minute_used), storage_bytes: files + pictures };
  const limits = row.plan == null ? null : Object.fromEntries(LIMIT_ORDER.map((k) => {
    const allowed = n(row[`${k}_allowed`]);
    return [k, { used: used[k], allowed, state: stateOf(used[k], allowed) }];
  }));
  return { plan: row.plan == null ? null : String(row.plan), limits, storage: { files, pictures }, windows, note: RAISE };
}
// planShownOf(env, { now }) — the signed-in reader's org's plan and usage (see above): ONE statement
export async function planShownOf(env, { now } = {}) {
  const at = now == null ? Date.now() : now;
  const row = await db(env).prepare(SHOWN_SQL).bind(monthOf(at), dayOf(at), minuteOf(at)).first();
  return shownFrom(row, at);
}

// ==== 8.4's leftover · GET /storage (src/reports.js): the storage limit in today's words ====
// STORAGE_SHOWN_SQL: ONE row — the plan the check applies (PLAN_JOIN: the org's row, else free's), its storage limit, and the org's
// use of it by THE storage definition above, in its two parts (files, pictures): the numbers a storage plan_limit names
export const STORAGE_SHOWN_SQL = "SELECT l.plan AS plan, l.storage_bytes AS allowed, " + STORAGE_FILES_SQL + " AS files_bytes, " +
  STORAGE_PICTURES_SQL + " AS pictures_bytes " + PLAN_JOIN + "WHERE o.id = {org}";
// storageShownOf(env) -> { plan, allowedBytes, usedBytes, files, pictures, state, percentOfLimit } | null (no org row; allowedBytes
// null when no plan row applies)
export async function storageShownOf(env) {
  const r = await db(env).prepare(STORAGE_SHOWN_SQL).first();
  if (!r) return null;
  const files = n(r.files_bytes), pictures = n(r.pictures_bytes), used = files + pictures;
  const allowed = r.allowed == null ? null : n(r.allowed);
  return { plan: r.plan == null ? null : String(r.plan), allowedBytes: allowed, usedBytes: used, files, pictures,
    state: allowed == null ? null : stateOf(used, allowed), percentOfLimit: allowed ? +((used / allowed) * 100).toFixed(4) : null };
}

// ==== 8.5 · SUSPENDED: the operator's one switch (tools/operator.mjs suspend / unsuspend) ====
// An org is suspended while its org row's settings carry `suspended` (JSON the door already reads with the row: src/tenant.js,
// src/index.js routeRequest). Nothing of the org is deleted or changed but that one key; unsuspend removes it. The ONE check is in
// src/index.js routeRequest, where the request's org resolves (after its sign-in): the org's own people meet ONE answer there —
// sign-in landings, pages, MCP and REST alike — and nobody else learns anything (another org's credential still meets the one
// not-here answer). The org row is cached a minute per isolate (src/tenant.js), so a suspension takes hold everywhere within a
// minute; a row that says suspended is confirmed by one fresh read before the 403, so lifting it is answered at once.
export const ORG_SUSPENDED = "org_suspended";
// copy: error
export const SUSPENDED_NOTE = "This org is suspended by the operator: nothing of it answers until the operator lifts the suspension, and nothing of it was deleted. Ask the operator.";
// suspensionOf(row) -> the org row's suspension ({ at } as the operator wrote it), or null. Pure: a row with no settings, or
// settings that are not JSON, is not suspended (the door never locks an org out by a parse failure).
export function suspensionOf(row) {
  if (!row || row.settings == null || row.settings === "") return null;
  let st = null;
  try { st = typeof row.settings === "string" ? JSON.parse(row.settings) : row.settings; } catch { return null; }
  const s = st && typeof st === "object" && !Array.isArray(st) ? st.suspended : null;
  if (!s) return null;
  return typeof s === "object" ? { at: s.at == null ? null : String(s.at) } : { at: null };
}
// suspendedAnswer(browser) -> the one 403: a JSON body for a client; for a browser's page navigation the same words as a plain page
export function suspendedAnswer(browser = false) {
  const headers = { "cache-control": "private, no-store" };
  if (browser) {
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Suspended</title>` +
      `<body style="font:15px/1.5 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 16px" data-screen="org-suspended"><h1 style="font-size:20px">This org is suspended</h1><p>${SUSPENDED_NOTE}</p></body>`,
    { status: 403, headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  }
  return new Response(JSON.stringify({ error: ORG_SUSPENDED, note: SUSPENDED_NOTE }), { status: 403, headers: { ...headers, "content-type": "application/json" } });
}
