// src/backup.js — the backup (sprint 3, S3b; docs/plan/BETA.md gate line 5: "the backup includes the knowledge tables"):
// what leaves the org's D1, page by page, and the ONE rule that says, for EVERY table boot.sql creates, whether it is
// dumped, rebuilt on restore, or never dumped and why. tools/backup-selftest.mjs loads boot.sql and fails on a table that is
// in none of the three lists (a new migration's table must be placed), on a people column that is neither dumped nor named
// as withheld, and on a dumped list that is not in a load order the foreign keys accept.
//
// ONE ORG (sprint 6, 6.3; PLATFORM §2 item 6: an owner owns one org): every page holds the READER'S org's rows alone (src/data.js
// {org}, the org from the sign-in; the cron's, src/data.js platformEnv). Each dumped table names how a row is the org's (ORG_OF):
// its own org column, its project's key (the projects of the org: migrate-067's generated projects.org), its contribution's org
// (transmission_refs), the org's own row (org). The database whole leaves only with the deployment's credentials (wrangler, Time
// Travel), never through a seat. The walk is the table's own key as before, the org a test on each row (no table carries an
// index led by the org): on a database holding one org a page reads exactly what it read.
//
// THE DOORS (both owner-only: src/index.js POST /backup-dump, requireOwnerKey; the cron calls backupToR2 directly):
//   · backupPage(env, { cursor, rows }) — ONE page of ONE table: at most `rows` rows (default 1,000, max 2,000) read in ONE
//     statement on the table's own key (rowid, or the primary key of a WITHOUT ROWID table), and the cursor of the next page.
//     A caller walks the cursor from "" to null and holds the whole dump; nothing is written. This is how a dump leaves a big
//     org inside a request's limits (one bounded statement a request; tools/restore-local.mjs walks it).
//   · backupToR2(env) — the nightly backup (and POST /backup-dump with no page): the same pages, each written to R2 as its own
//     object o<org>/backups/d1/<day>/<nnnn>.json, then o<org>/backups/d1/<day>/manifest.json (the counts and the rule): under
//     the org's own prefix (sprint 6, 6.4: src/storage.js), so one org's backup never lands on another's. One request reads
//     every row of the org (an operation, never a page a person loads).
//   · backupEval(env) — the suites' mechanic (?eval=1): at most 50 rows of each table into ONE object
//     o<org>/backups/d1/<day>.eval.json (never the real backup's key), the counts of each.
//
// WHAT THE DUMP HOLDS ABOUT CREDENTIALS: nothing. people is dumped WITHOUT key_hash, pass_hash, pass_salt, email and
// account_id (the columns PEOPLE_WITHHELD names; every other people column is in PEOPLE_COLS, so a new column is dumped only
// once it is named here); tokens (session and device hashes), invites (code hashes), login_attempts (sign-in log, with
// addresses), accounts (sprint 7: the platform's, an email and its passphrase's hash), signup_codes (7.2: the operator's code hashes) and seat_invites (12.3: an org's invite link hashes) are never dumped. A restore therefore brings every person back with NO key: tools/restore-local.mjs binds the
// fresh org's own owner key to the restored owner, and every other person is handed a new key on Control (Reset passphrase).
//
// RENDER BODIES stay in R2, content-addressed (o<org>/renders/<project>/<hash>): k_renders is dumped (its rows ARE the index: the hash, format,
// size of every body), and k_screen_takes (M6: every body a frame has held, the previous ones too); the bodies are not copied. A
// restore into a fresh D1 beside the same bucket finds them all.
import { db } from "./data.js";
import { store, backupDayPrefix, backupEvalKey } from "./storage.js";   // sprint 6, 6.4: the backup lies under its org's prefix
import { now, uid } from "./util.js";

// ---- the nightly backup's own record (G2 item 9, the review's agentC: on a free account the backup could fail with no message,
// the cron's catch {} ate it) ----
// recordBackup(env, result) — ONE events row (kind "backup", the engine's own: mind, so no trail shows it) per cron run, success
// or failure, held by the org's first active owner (the column needs a person); lastBackup(env) — the newest one, ONE
// statement on idx_events_person_kind, for Control · Admin. A failed record write is itself swallowed: the cron goes on.
export const BACKUP_EVENT_KIND = "backup";
// sprint 6 (6.2): the owner of the request's org (src/data.js {org}: the admin's sign-in; the cron's org, platformEnv)
const OWNER_ID_SQL = "SELECT id FROM people WHERE role = 'owner' AND active = 1 AND org = {org} ORDER BY created_at ASC LIMIT 1";
export async function recordBackup(env, r) {
  const owner = await db(env).prepare(OWNER_ID_SQL).first();
  if (!owner || !owner.id) return false;
  const rec = r && r.error ? { ok: false, error: String(r.error).slice(0, 200) }
    : { ok: !!(r && r.complete), complete: !!(r && r.complete), pages: (r && r.pages) || 0, rows: Object.values((r && r.counts) || {}).reduce((x, y) => x + y, 0) };
  await db(env).prepare("INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})")
    .bind(uid(), null, owner.id, BACKUP_EVENT_KIND, JSON.stringify({ mind: 1, backup: rec }), now()).run();
  return true;
}
export const LAST_BACKUP_SQL = "SELECT e.payload_json, e.created_at FROM events e INDEXED BY idx_events_person_kind WHERE e.person_id = (" + OWNER_ID_SQL + ") AND e.kind = '" + BACKUP_EVENT_KIND + "' ORDER BY e.created_at DESC LIMIT 1";
export async function lastBackup(env) {
  const r = await db(env).prepare(LAST_BACKUP_SQL).first();
  if (!r) return null;
  let p = {}; try { p = JSON.parse(r.payload_json || "{}").backup || {}; } catch { p = {}; }
  return { at: r.created_at, ok: !!p.ok, ...(p.error ? { error: p.error } : {}), ...(p.pages != null ? { pages: p.pages, rows: p.rows } : {}) };
}

export const BACKUP_FORMAT = "sharingu-backup/1";
export const PAGE_ROWS = 1000, PAGE_ROWS_MAX = 2000, EVAL_ROWS = 50;

// people: every column but the credentials and the address (the dump's discipline since PRD A3: never bank a secret)
// pending (sprint 7's review, A1; migrate-074): a seat waiting for its holder's yes is org truth and no secret — dumped, so a
// restored org still shows it waiting (its people come back with no account, so the admin withdraws or re-invites)
// reissued_at (sprint 8, 8.3a; migrate-077): the seat's grants epoch, the moment its admin last reissued it — org truth and no
// secret (a time, no credential), dumped so a restore keeps it exact
export const PEOPLE_COLS = ["id", "name", "role", "active", "pending", "created_at", "title", "capture_mode", "lane", "trace_consent", "hats", "avatar", "role_label", "access_hats", "org", "reissued_at"];
// projects: every stored column (migrate-067's org and slug are GENERATED from the key, so they are neither dumped nor written)
export const PROJECT_COLS = ["key", "name", "registry_ptr", "atlas_map", "active", "created_at", "eval"];
export const PEOPLE_WITHHELD = { key_hash: "the key's hash", pass_hash: "the passphrase's hash", pass_salt: "the passphrase's salt", email: "the sign-in address (ADR-016)",
  account_id: "the seat's account (sprint 7, migrate-070: the platform's, holding the email and the passphrase; never an org's to carry)" };

// ORG_OF: how a row of a dumped table is the reader's org's (a SQL term, {org} written in by src/data.js; `+` keeps every walk on
// the table's own key, never an index on the term)
const ORG_COL = "+org = {org}";
const ORG_PROJECT = (col) => `+${col} IN (SELECT key FROM projects WHERE +org = {org})`;
const ORG = {
  projects: ORG_COL, people: ORG_COL, artifacts: ORG_COL, transmission: ORG_COL, approval_audit: ORG_COL, events: ORG_COL, loops: ORG_COL,
  org: "id = {org}", org_profile: ORG_COL,
  project_seats: ORG_PROJECT("project_key"),
  transmission_refs: "EXISTS (SELECT 1 FROM transmission x WHERE x.id = transmission_refs.tid AND +x.org = {org})",
};
export const orgOf = (table) => ORG[table] || ORG_PROJECT("project");
// THE DUMPED TABLES, in the order a restore loads them (a row's foreign keys name rows loaded before it). key: how a page
// walks the table (rowid, or the primary key of a WITHOUT ROWID table). Every one holds truth nothing else can rebuild; every
// table not in ORG is keyed by its `project` column.
export const BACKUP_DUMPED = [
  { table: "projects", why: "the projects, active and archived", cols: PROJECT_COLS },
  { table: "people", why: "the people, with their roles, hats and profile (no credential)", cols: PEOPLE_COLS },
  { table: "org", why: "the org row (its name, brand and home project)" },
  { table: "org_profile", why: "what the org will build, as its founder answered the org form (sprint 21, 21.4b, migrate-081: the product step)" },
  { table: "project_seats", why: "who is seated on which project" },
  { table: "k_aim", why: "knowledge: each project's aim and measure" },
  { table: "k_goals", why: "knowledge: the goal trees" },
  { table: "k_questions", why: "knowledge: the questions and their rulings" },
  { table: "k_options", why: "knowledge: the questions' options" },
  { table: "k_nodes", why: "knowledge: the Map's nodes" },
  { table: "k_edges", why: "knowledge: the Map's edges" },
  { table: "k_checks", why: "knowledge: the checks" },
  { table: "k_card_kinds", why: "knowledge: the card kinds" },
  { table: "k_cards", why: "knowledge: the cards" },
  { table: "k_docs", why: "knowledge: the docs" },
  { table: "k_gtm", why: "knowledge: the GTM template" },
  { table: "k_styles", why: "knowledge: the renders' styles" },
  // M6 (migrate-065): BEFORE k_renders, so the triggers that append a take as a render loads find its newest take already there
  // and append nothing (the takes come back exactly as dumped)
  { table: "k_screen_takes", why: "every body each screen's frames have held (history: its triggers append, nothing rebuilds it)" },
  { table: "k_renders", why: "knowledge: the renders' index (each body stays in R2 by its hash)" },
  { table: "k_versions", why: "the versions of each project's knowledge" },
  { table: "k_snapshots", why: "the versions' snapshots (what a restore-by-difference reads)" },
  { table: "artifacts", why: "the artifacts' index (each body stays in R2 by its key)" },
  { table: "transmission", why: "the ledger: every contribution, grade filing, ruling and pick-up" },
  { table: "transmission_refs", why: "the ledger's refs, written when a contribution is filed" },
  { table: "approval_audit", why: "every decision on a contribution (append-only)" },
  { table: "events", why: "the audit trail" },
  { table: "loops", why: "the open and closed loops" },
  { table: "check_results", why: "every grade, kept as history" },
  { table: "k_node_stale", why: "when a graded node last changed and by what (history: migrate-054's backfill recomputes only its count)", key: ["project", "node_id"] },
];
// THE DERIVED TABLES: never dumped; a restore rebuilds each from the dumped rows. The triggers boot.sql carries fire as the
// rows load (they are the same statements the migrations' backfills run), and RESTORE_REBUILD_SQL below recomputes the
// stale marks once the grades and the nodes' change times are in.
export const BACKUP_DERIVED = {
  k_check_refs: "the refs each check names (migrate-040's triggers on k_checks)",
  k_question_refs: "the refs each question's affects names (migrate-078's triggers on k_questions)",
  k_check_ungraded: "the checks with no grade yet (migrate-041's triggers)",
  k_check_stale: "the checks graded before a change (RESTORE_REBUILD_SQL, migrate-054's backfill)",
  k_fill: "the checklist's counts (migrate-050's triggers; its stale row by RESTORE_REBUILD_SQL)",
  k_node_lights: "each node's lights (migrate-043's triggers)",
  k_node_links: "each node's link count (migrate-043's triggers)",
  k_screen_renders: "each screen's renders (migrate-046's triggers)",
  transmission_open: "the ledger's open tally (migrate-042/050's triggers)",
  transmission_kinds: "the ledger's kinds tally (migrate-042's triggers)",
  transmission_goals: "the ledger's goals tally (migrate-054's triggers)",
  loops_open: "the open loops tally (migrate-042's triggers)",
  k_find: "search's index (migrate-056's triggers)",
  k_find_data: "search's index, FTS5's own table",
  k_find_idx: "search's index, FTS5's own table",
  k_find_config: "search's index, FTS5's own table",
};
// THE TABLES NEVER DUMPED, each with its reason
export const BACKUP_NEVER = {
  tokens: "credentials: the hashes of session and device tokens (a restore signs everyone out; keys are re-issued)",
  invites: "credentials: invite code hashes (the old invite flow; no door writes it)",
  login_attempts: "a sign-in rate-limit log holding addresses, read only for minutes",
  accounts: "credentials: the platform's accounts (an email and its passphrase's hash; sprint 7, migrate-070), one per person across every org — no org's row (a restored org's people come back with no email, so no account)",
  signup_codes: "credentials: the operator's one-time sign-up codes (their hashes; sprint 7, migrate-071), the platform's, before any org — no org's row",
  seat_invites: "credentials: an org's one-time invite links (their hashes; sprint 12, migrate-079), each bound to a seat's secrets as they stood — a restore's seats come back with new secrets, so no link of the old ones could open them; the admin makes new links",
  previews: "a plan not yet filed, valid for an hour; a client previews again",
  access_requests: "a person's request for a beta place (sprint 21, migrate-081: a profile, while unverified its passphrase's and its verification link's hashes), the platform's, before any account or org — no org's row",
  account_sessions: "credentials: an account's browser sessions before its first seat (their hashes; sprint 21, migrate-081), the platform's — no org's row",
  account_resets: "credentials: a forgotten passphrase's one-time links (their hashes; sprint 21, migrate-081), the platform's — no org's row",
  mail_days: "the platform's email cap (sprint 21, migrate-081: its counted sends per day), no org's row",
  mail_addresses: "the platform's per-address email limit (sprint 21, migrate-081: a digest of each address, its sends today), no org's row",
  plan_limits: "the platform's plans and their limits (sprint 8, migrate-075: the owner's ruled numbers), no org's row — the org's own plan rides its org row",
  org_usage: "the plan's running counters (sprint 8, migrate-076): the day's calls, the minute's burst, the month's items — rebuilt by use (a restored org's counters start at zero), the month's tally reseeded from the ledger by migrate-076",
};
// SQLite's and D1's own tables are not the org's
export const ENGINE_OWN = /^(sqlite_|_cf_)/;

// the stale marks, recomputed once the grades and k_node_stale are loaded: migrate-054's backfill, verbatim.
// restoreRebuildSql(scope) — the same statements over the projects `scope` names (a SQL set, e.g. one org's projects: sprint 6,
// 6.5, a restore INTO a database that holds other orgs touches none of their rows); no scope: the whole database, as a restore
// into a fresh one runs it (RESTORE_REBUILD_SQL)
export const restoreRebuildSql = (scope = null) => {
  const and = (col) => (scope ? ` AND ${col} IN ${scope}` : "");
  const where = (col) => (scope ? ` WHERE ${col} IN ${scope}` : "");
  return [
    "UPDATE k_node_stale SET stale = (SELECT COUNT(*) FROM k_check_refs x WHERE x.project = k_node_stale.project AND x.ref = k_node_stale.node_id " +
      "AND (SELECT g.graded_at FROM check_results g WHERE g.project = x.project AND g.check_id = x.check_id ORDER BY g.graded_at DESC, g.id DESC LIMIT 1) < k_node_stale.changed_at) " +
      "WHERE stale <> (SELECT COUNT(*) FROM k_check_refs x WHERE x.project = k_node_stale.project AND x.ref = k_node_stale.node_id " +
      `AND (SELECT g.graded_at FROM check_results g WHERE g.project = x.project AND g.check_id = x.check_id ORDER BY g.graded_at DESC, g.id DESC LIMIT 1) < k_node_stale.changed_at)${and("project")};`,
    `DELETE FROM k_check_stale${where("project")};`,
    "INSERT OR IGNORE INTO k_check_stale (project, check_id) SELECT DISTINCT r.project, r.check_id FROM k_check_refs r JOIN k_node_stale s ON s.project = r.project AND s.node_id = r.ref " +
      `WHERE (SELECT g.graded_at FROM check_results g WHERE g.project = r.project AND g.check_id = r.check_id ORDER BY g.graded_at DESC, g.id DESC LIMIT 1) < s.changed_at${and("r.project")};`,
    `DELETE FROM k_fill WHERE kind = 'stale'${and("project")};`,
    `INSERT OR REPLACE INTO k_fill (project, kind, n) SELECT project, 'stale', COUNT(*) FROM k_check_stale${where("project")} GROUP BY project;`,
  ];
};
export const RESTORE_REBUILD_SQL = restoreRebuildSql();

export const backupRule = () => ({
  scope: "one org: the reader's (its projects and everything they hold, its people, its ledger, its own row); the whole database only with the deployment's credentials",
  dumped: Object.fromEntries(BACKUP_DUMPED.map((t) => [t.table, t.why])),
  derived: BACKUP_DERIVED,
  never: BACKUP_NEVER,
  people: { dumped: PEOPLE_COLS, withheld: PEOPLE_WITHHELD },
  credentials: "none: people without key_hash, pass_hash, pass_salt, email or account_id; tokens, invites, login_attempts, accounts, signup_codes and seat_invites never",
  bodies: "render and artifact bodies stay in R2 under the org's prefix (o<org>/), listed by k_renders.hash, k_screen_takes.hash and artifacts.r2_key",
});

// ---- the cursor: "<table index>:<last key>" ("" starts at the first table) ----
const quoteId = (s) => `"${String(s).replace(/"/g, '""')}"`;
export function parseCursor(c) {
  const s = String(c ?? "");
  if (!s) return { i: 0, after: null };
  const m = /^(\d{1,3}):(.*)$/s.exec(s);
  if (!m) return null;
  const i = Number(m[1]);
  if (i > BACKUP_DUMPED.length) return null;
  let after = null;
  if (m[2] !== "") { try { after = JSON.parse(m[2]); } catch { return null; } }
  return { i, after };
}
const cursorOf = (i, after) => `${i}:${after == null ? "" : JSON.stringify(after)}`;
// pageSql(t, hasAfter) -> one statement on the table's own key: rowid (a rowid table) or its primary key (WITHOUT ROWID), the
// reader's org's rows only (orgOf)
export function pageSql(t, hasAfter) {
  const cols = t.cols ? t.cols.map(quoteId).join(", ") : "*";
  const mine = orgOf(t.table);
  if (Array.isArray(t.key)) {
    const k = t.key.map(quoteId).join(", ");
    return `SELECT ${cols} FROM ${quoteId(t.table)} WHERE ${mine}${hasAfter ? ` AND (${k}) > (${t.key.map((_, n) => `?${n + 2}`).join(", ")})` : ""} ORDER BY ${k} LIMIT ?1`;
  }
  return `SELECT rowid AS _rowid, ${cols} FROM ${quoteId(t.table)} WHERE ${mine}${hasAfter ? " AND rowid > ?2" : ""} ORDER BY rowid LIMIT ?1`;
}

// backupPage(env, { cursor, rows }) -> { format, table, rows: [...], next: cursor|null, [rule on the first page] } | { error }
export async function backupPage(env, o = {}) {
  const c = parseCursor(o.cursor);
  if (!c) return { error: "bad_cursor", note: "Send the cursor the last page answered as next, or nothing to start." };
  const n = Math.max(1, Math.min(PAGE_ROWS_MAX, Math.floor(Number(o.rows)) || PAGE_ROWS));
  const first = !String(o.cursor ?? "");
  if (c.i >= BACKUP_DUMPED.length) return { format: BACKUP_FORMAT, table: null, rows: [], next: null };
  const t = BACKUP_DUMPED[c.i];
  const binds = c.after == null ? [n + 1] : [n + 1, ...(Array.isArray(t.key) ? c.after : [c.after])];
  let res;
  try { res = await db(env).prepare(pageSql(t, c.after != null)).bind(...binds).all(); }
  catch (e) {
    // a table this database does not have yet (an org behind on its migrations) is an empty page, said
    if (/no such table/i.test(String((e && e.message) || e))) return { format: BACKUP_FORMAT, table: t.table, rows: [], missing: true, next: cursorOf(c.i + 1, null), ...(first ? { rule: backupRule(), at: now() } : {}) };
    throw e;
  }
  const got = (res && res.results) || [];
  const more = got.length > n;
  const rows = got.slice(0, n);
  const keyOf = (r) => (Array.isArray(t.key) ? t.key.map((k) => r[k]) : r._rowid);
  const next = more ? cursorOf(c.i, keyOf(rows[rows.length - 1])) : cursorOf(c.i + 1, null);
  for (const r of rows) delete r._rowid;
  return { format: BACKUP_FORMAT, table: t.table, rows, next: c.i + 1 >= BACKUP_DUMPED.length && !more ? null : next, ...(first ? { rule: backupRule(), at: now() } : {}) };
}

// backupToR2(env) — the whole dump into R2, one object per page, then the manifest. Returns the manifest's key and counts.
export async function backupToR2(env, o = {}) {
  const day = now().slice(0, 10);
  const prefix = backupDayPrefix(day);
  const bucket = store(env);
  const counts = {}, missing = [];
  let cursor = "", pages = 0, bytes = 0;
  const maxPages = o.maxPages || 5000;
  while (cursor != null && pages < maxPages) {
    const p = await backupPage(env, { cursor, rows: PAGE_ROWS });
    if (p.error) throw new Error(p.error);
    if (p.table) { counts[p.table] = (counts[p.table] || 0) + p.rows.length; if (p.missing) missing.push(p.table); }
    if (p.rows.length) {
      const body = JSON.stringify({ format: BACKUP_FORMAT, table: p.table, rows: p.rows });
      bytes += body.length;
      await bucket.put(`${prefix}${String(++pages).padStart(4, "0")}.json`, body, { httpMetadata: { contentType: "application/json" } });
    }
    cursor = p.next;
  }
  const key = `${prefix}manifest.json`;
  const manifest = { format: BACKUP_FORMAT, date: day, generatedAt: now(), complete: cursor == null, pages, bytes, counts, missing, rule: backupRule() };
  await bucket.put(key, JSON.stringify(manifest), { httpMetadata: { contentType: "application/json" } });
  return { key: bucket.keyOf(key), counts, pages, bytes, complete: cursor == null, eval: false };
}

// backupEval(env) — the suites' mechanic: at most EVAL_ROWS rows of each dumped table, one object under its own key
export async function backupEval(env) {
  const day = now().slice(0, 10);
  const out = {}, counts = {};
  for (let i = 0; i < BACKUP_DUMPED.length; i++) {
    const p = await backupPage(env, { cursor: `${i}:`, rows: EVAL_ROWS });
    out[BACKUP_DUMPED[i].table] = p.rows || [];
    counts[BACKUP_DUMPED[i].table] = (p.rows || []).length;
  }
  const bucket = store(env);
  const key = backupEvalKey(day);
  await bucket.put(key, JSON.stringify({ format: BACKUP_FORMAT, date: day, generatedAt: now(), eval: true, tables: out }), { httpMetadata: { contentType: "application/json" } });
  return { key: bucket.keyOf(key), counts, eval: true };
}
