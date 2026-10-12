#!/usr/bin/env node
// tools/org-undo.mjs — one org's undo (sprint 6, 6.5; docs/plan/PLATFORM.md §1: Time Travel restores the WHOLE database, so it
// cannot undo one org's mistake; §2.6: work across orgs runs only with the deployment's credentials, from the operator's machine;
// §5: the undo for one org is the per-org restore). An OPERATOR tool, never a route: it reads and writes the shared D1 and the
// shared bucket directly (the local worker's persisted state through wrangler's getPlatformProxy, or the Cloudflare API), and the
// door only as a seat where a seat suffices (verify --url: the restored owner signs in). Sprint 8.5's operator CLI absorbs it.
//
//   node tools/org-undo.mjs <step> (--local <persist dir> --config <wrangler config> | --live --config <wrangler config>
//        --confirm-live <its D1 database name>) …
//
//   plan     --org <id>                       read-only: the org's rows per table (and the database's), its search-index rows, its
//                                             objects, every row crossing the org's wall (a foreign key into or out of it), and any
//                                             table this tool cannot place (a new migration's table must be placed: it refuses)
//   export   --org <id> --out <dir>           read-only: <dir>/export.json (the org's dump, src/backup.js's pages run as the deployment
//                                             for that org, and its objects' listing) and <dir>/objects/<sha256> (the bodies)
//   restore  --from <dir> --owner-creds-out <file> [--as <id>] [--name <org name>] [--record <file>]
//                                             the export into the SHARED database as a NEW org (default: the next free id; --as names
//                                             a free one ≥ 2 — the source's own id once it is deleted, the true undo). Writes the
//                                             record of every remapping (default <dir>/restore-o<id>.json) and the restored owner's
//                                             fresh key to <file> (mode 600, never printed). The objects first, then the rows, then
//                                             the stale marks (the new org's projects only), the owner's key LAST: until it lands the
//                                             new org is reachable by nobody, and a failed restore is cleaned by `delete` of it.
//   verify   --from <dir> [--record <file>] [--url <worker> --creds <file>]
//                                             read-only: the restored org re-exported, every remapping undone, equals the export table
//                                             by table (count and content hash) and object by object (sha256); no old id is left in its
//                                             rows; no foreign key crosses its wall; its derived tables equal the source's (while the
//                                             source is still in the database); with --url, its owner signs in and reads its projects
//   delete   --org <id> --yes-delete <id|name> --export <dir>
//                                             every D1 row of the org and its whole prefix o<id>/ in the bucket. REFUSES (exit 1,
//                                             nothing deleted): org 1 (HOME_ORG), always; a --yes-delete that does not name the org;
//                                             an --export that is not a complete export of THIS org; an org that CHANGED since that
//                                             export (nothing written since: the undo is in hand) — the org is re-exported now and
//                                             every dumped table compared by its rows' CONTENT HASH (sha256 over each row's canonical
//                                             JSON, as verify; an UPDATE that keeps the count is a change), every object by its key,
//                                             size, content type and sha256 (sprint 6 review, finding 10: a count alone let an UPDATE
//                                             since the export be lost) — rows with no org row (a restore that failed before its org
//                                             row landed) go on the id alone; any foreign key crossing the org's wall. --live FIRST
//                                             PROVES that the database runs a batch as ONE transaction (finding 13: the delete is one
//                                             batch whose first statement eval-marks the org's decided contributions; half-applied, real
//                                             rows would stay eval-marked): a probe batch on the org itself — a sign-in attempt row,
//                                             then the same row again, which fails — must leave NO row; any other outcome (the first
//                                             statement kept, or no failure) REFUSES the delete before its batch runs (the probe's row
//                                             removed). deleteOrg's `proveAtomic` option (default: on with the "kept" rule, the live
//                                             one — so tools/attack-xorg.mjs's live cleanup proves it too). Counts every table before and after: the
//                                             org's rows go to 0 (every table, its search rows, its prefix) and a second run answers
//                                             nothing to delete.
//                                             THE OTHER ORGS (the invariant: the delete LOSES none of their rows; it never asks them to
//                                             stand still): --local, where nothing else writes, keeps the exact rule — every other
//                                             org's rows, search rows and objects exactly as before (`othersMoved` empty). --live,
//                                             where org 1 and every other org take writes while the delete runs, the "kept" rule
//                                             (finding 11): every row of every OTHER org's SOURCE tables present before — by its
//                                             primary key (its rowid where it has none) — is present after, and every object outside
//                                             the org's prefix; a row or object may be added (`othersGained`, a note, never a
//                                             failure), none may go (`othersLost`, with the ids: ok false; a loss offset by a gain is
//                                             still a loss). Left out, as rows that legitimately shrink while traffic runs: the derived
//                                             tables (BACKUP_DERIVED: a tally or a mark moves both ways; the search index with them)
//                                             and the pruned ones (previews, login_attempts, tokens: expired rows go). deleteOrg's `others` option: "exact" (the default,
//                                             as --local) or "kept" (as --live).
//                                             THE INVITE MARK (sprint 12's review): an account an org's invite link marked
//                                             (accounts.invited_org = the org) stays — accounts are no org's rows — but its mark
//                                             is set to 0 in the same batch, an id no org holds: the next org takes the deleted
//                                             one's id (MAX + 1), and a mark left bare would re-point the account at THAT org
//                                             (src/accounts.js INVITE_MARK_HOLDS: still contained, reaching no org at all).
//
// WHAT AN EXPORT HOLDS: every row src/backup.js dumps for the org (BACKUP_DUMPED by its ORG_OF rule: no credential — people
// without key_hash, pass_hash, pass_salt or email; tokens, invites, sign-in attempts and previews never), and the bodies of its
// objects under renders/ (render and style bodies, content-addressed) and inbox/ (banked files, session reports). It leaves:
// the derived tables (rebuilt by boot.sql's triggers as the rows land, the stale marks by restoreRebuildSql, as tools/
// restore-local.mjs does); the org's past backups (backups/: copies of what the export itself holds, naming the old ids — a
// restored org starts its own).
//
// THE REMAPPING (restore; every rule recorded, verify undoes it): the org id → the new id (org.id, every org column); a project
// key → the new org's form o<new>--<slug> (projects.key, every project / project_key column, org.home, a JSON "project" field,
// a render's key renders/<project>/<hash>; an old o<old>--<slug> anywhere, as a token); an id that is already taken in the
// database (people, transmission, events, artifacts, loops, approval_audit — the rehearsal's case: the source is still there) →
// a fresh one: a contribution keeps its day and takes the day's next free numbers (T-<day>-NNN, above every id of that day in
// the database and in the export, in the old order), every other id a fresh uuid; an id not taken keeps (the undo after a
// delete keeps them all). Each remapped id is rewritten wherever it is a whole value, a token of a distinctive shape (a uuid, a
// contribution id, a prefixed project key) inside any text, or a JSON string; check_results' integer ids are the database's
// own (AUTOINCREMENT): the rows load in their old order and take new ones. Every person comes back with no key
// ('restored:<id>'); the first active owner takes the fresh key. Object BODIES are copied byte for byte, never rewritten (a
// session report's text names the ids it named when it was written).
//
// Exit: 0 done · 1 refused, incomplete or failed · 2 usage.
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BACKUP_DUMPED, BACKUP_DERIVED, BACKUP_FORMAT, ENGINE_OWN, backupPage, orgOf, restoreRebuildSql } from "../src/backup.js";
import { db, platformEnv, HOME_ORG, orgBucketOf } from "../src/data.js";
import { orgOfKey, projectKeyOf } from "../src/project.js";
import { orgPrefix } from "../src/storage.js";
import { NEXT_SEQ_SQL } from "../src/core.js";
import { tableHash, ownerOf } from "./restore-local.mjs";
import * as R2 from "./ship/r2-org-keys.mjs";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EXPORT_FORMAT = "sharingu-org-export/1";
export const RECORD_FORMAT = "sharingu-org-restore/1";
export const EXPORT_ROOTS = ["renders/", "inbox/"];
export const LEFT_ROOTS = { "backups/": "the org's past backups: copies of what the export holds, naming the old ids (a restored org starts its own)" };
// the org-wide tables whose single text id is global (a copy beside its source collides): the ids a restore remaps when taken
export const ID_TABLES = ["people", "transmission", "artifacts", "events", "loops", "approval_audit"];
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const qid = (s) => `"${String(s).replace(/"/g, '""')}"`;
const refused = (why, extra = {}) => ({ refused: why, ...extra });
// orgDb(DB, org) -> the layer's handle as the deployment for one org (src/data.js platformEnv: {org} written in, validated)
export const orgDb = (DB, org) => db(platformEnv({ DB }, org));

// ---- the schema and the rule placing every table ----
// schemaOf(DB) -> [{ name, cols, fks: [{ from, table, to }], virtual, own }] read off the database itself (sqlite_master, PRAGMA)
export async function schemaOf(DB) {
  const list = (await DB.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).results || [];
  const out = [];
  for (const { name, sql } of list) {
    if (ENGINE_OWN.test(name)) { out.push({ name, own: true, cols: [], fks: [] }); continue; }
    const virtual = /^\s*CREATE\s+VIRTUAL/i.test(sql || "");
    const info = virtual ? [] : ((await DB.prepare(`PRAGMA table_info(${qid(name)})`).all()).results || []);
    const fks = virtual ? [] : ((await DB.prepare(`PRAGMA foreign_key_list(${qid(name)})`).all()).results || []).map((f) => ({ from: f.from, table: f.table, to: f.to || null }));
    out.push({ name, cols: info.map((c) => c.name), pk: info.filter((c) => c.pk).map((c) => c.name), fks, virtual });
  }
  // an FTS5 table's own shadow tables (<name>_data, _idx, _config, _docsize, _content) are the search index, not rows of an org
  const fts = out.filter((t) => t.virtual).map((t) => t.name);
  for (const t of out) if (fts.some((v) => new RegExp(`^${v}_(data|idx|config|docsize|content)$`).test(t.name))) t.shadow = true;
  return out;
}
// ruleOf(t) -> how a row of table t is an org's: { sql } (a term naming {org}: src/data.js writes the id in), { fts } (the search
// index: counted by its project token, kept by the triggers), { skip } (not an org's, with the reason) or { unplaced }
export function ruleOf(t) {
  if (t.own) return { skip: "SQLite's or D1's own" };
  if (t.virtual || t.shadow) return { fts: true };
  if (BACKUP_DUMPED.some((d) => d.table === t.name)) return { sql: orgOf(t.name), dumped: true };   // the dump's own rule, one source
  if (t.cols.includes("org")) return { sql: "org = {org}" };
  const inProjects = (c) => `${c} IN (SELECT key FROM projects WHERE org = {org})`;
  // a derived row with no project is the org's own bucket (migrate-067: '' for HOME_ORG, o<org>-- for another)
  if (t.cols.includes("project")) return { sql: `(${inProjects("project")} OR project = {orgbucket})`, derived: t.name in BACKUP_DERIVED };
  if (t.cols.includes("project_key")) return { sql: inProjects("project_key") };
  if (t.cols.includes("person_id")) return { sql: "person_id IN (SELECT id FROM people WHERE org = {org})", derived: t.name in BACKUP_DERIVED };
  // migrate-018's refs horizon: org 1's pre-org history (no org, project or person column — no other org can write it);
  // dropped by migrate-069, so it exists only on a live database mid-ship between 067 and 069 (found by the sprint-6 ship:
  // the preview attack's throwaway delete refused on it)
  if (t.name === "transmission_refs_meta") return { skip: "org 1's pre-org history (migrate-018); dropped by migrate-069" };
  // sprint 7 (7.1, migrate-070): one account per email across every org — no org's row. An org's seats name theirs
  // (people.account_id, withheld from the export with the email); deleting an org leaves its people's accounts, their own
  if (t.name === "accounts") return { skip: "the platform's accounts (one per email, across orgs; migrate-070): no org's row" };
  // sprint 7 (7.2, migrate-071): the operator's one-time sign-up codes, one per allowed email, before any org exists
  if (t.name === "signup_codes") return { skip: "the platform's sign-up codes (the operator's allowlist; migrate-071): no org's row" };
  // sprint 8 (8.1, migrate-075): the plans and their limits, the platform's; an org's own plan rides its org row
  if (t.name === "plan_limits") return { skip: "the platform's plans and their limits (migrate-075): no org's row" };
  return { unplaced: true };
}
export const rulesOf = (schema) => Object.fromEntries(schema.map((t) => [t.name, ruleOf(t)]));
// deleteOrder(schema, rules) -> the org's tables in an order the foreign keys accept: a table goes once no table left names it,
// the derived tables after every source (their triggers re-create rows as the sources go), projects, people and org last
export function deleteOrder(schema, rules) {
  const last = ["projects", "people", "org"];
  const set = schema.filter((t) => rules[t.name].sql && !last.includes(t.name));
  const sources = set.filter((t) => !rules[t.name].derived), derived = set.filter((t) => rules[t.name].derived);
  const order = [];
  let left = [...sources];
  while (left.length) {
    const free = left.filter((t) => !left.some((u) => u !== t && u.fks.some((f) => f.table === t.name))).sort((a, b) => a.name.localeCompare(b.name));
    const take = free.length ? free : [...left].sort((a, b) => a.name.localeCompare(b.name));
    order.push(...take.map((t) => t.name));
    left = left.filter((t) => !take.includes(t));
  }
  // k_check_refs first among the derived: removing a ref moves the lights, the fill and the stale marks
  derived.sort((a, b) => (a.name === "k_check_refs" ? -1 : b.name === "k_check_refs" ? 1 : a.name.localeCompare(b.name)));
  return { passes: [...order, ...derived.map((t) => t.name)], last };
}
const PK_OF = { people: "id", projects: "key", transmission: "id", org: "id" };
// crossRefs(DB, org, schema, rules) -> every declared foreign key crossing the org's wall: rows of the org naming a row outside it
// (out), rows outside it naming a row of the org (in)
export async function crossRefs(DB, org, schema, rules) {
  const h = orgDb(DB, org);
  const out = [];
  for (const t of schema) {
    const r = rules[t.name];
    if (!r.sql) continue;
    for (const fk of t.fks) {
      const p = rules[fk.table];
      if (!p || !p.sql || fk.table === "org") continue;
      const pk = fk.to || PK_OF[fk.table];
      const theirs = `SELECT ${qid(pk)} FROM ${qid(fk.table)} WHERE ${p.sql}`;
      const x = await h.prepare(`SELECT (SELECT COUNT(*) FROM ${qid(t.name)} WHERE (${r.sql}) AND ${qid(fk.from)} IS NOT NULL AND ${qid(fk.from)} NOT IN (${theirs})) AS outward, ` +
        `(SELECT COUNT(*) FROM ${qid(t.name)} WHERE (${r.sql}) IS NOT 1 AND ${qid(fk.from)} IN (${theirs})) AS inward`).first();
      if (x.outward || x.inward) out.push({ table: t.name, column: fk.from, references: fk.table, out: x.outward, in: x.inward });
    }
  }
  return out;
}

// ---- the search index (k_find, migrate-056): a row is a project's by its token, 'p' || hex(project) (src/extract.js projectToken)
const projectToken = (project) => "p" + [...new TextEncoder().encode(String(project))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
// ftsOf(DB, org, schema, keys?) -> { org, total, keys }: `keys` the org's project keys (default: its projects now; the delete
// passes the keys it read before, so an index row its projects left behind still counts)
async function ftsOf(DB, org, schema, keys = null) {
  if (!schema.some((t) => t.name === "k_find" && t.virtual)) return { org: 0, total: 0, keys: [] };
  // a contentless index is never scanned whole: every row is a project's (a row with no project is not indexed), so the total is
  // the sum over every project's token
  const all = ((await DB.prepare("SELECT key, org FROM projects").all()).results || []);
  const mine = keys || all.filter((p) => p.org === org).map((p) => p.key);
  const count = async (k) => (await DB.prepare("SELECT COUNT(*) AS n FROM k_find WHERE k_find MATCH ?1").bind(`p : ${projectToken(k)}`).first()).n;
  let n = 0, total = 0;
  for (const k of mine) n += await count(k);
  for (const p of all) if (!mine.includes(p.key)) total += await count(p.key);
  return { org: n, total: total + n, keys: mine };
}
// countsOf(DB, O, org, schema, rules) -> per table { org, total }, the org's rows, its search-index rows, its objects (and the
// database's and the bucket's totals: what every other org holds is total − org)
export async function countsOf(DB, O, org, schema, rules, ftsKeys = null) {
  const h = orgDb(DB, org);
  const tables = {};
  let rows = 0;
  for (const t of schema) {
    const r = rules[t.name];
    if (!r.sql) continue;
    const x = await h.prepare(`SELECT (SELECT COUNT(*) FROM ${qid(t.name)} WHERE ${r.sql}) AS org, (SELECT COUNT(*) FROM ${qid(t.name)}) AS total`).first();
    tables[t.name] = { org: x.org, total: x.total };
    rows += x.org;
  }
  const all = await O.list("");
  const mine = all.filter((o) => o.key.startsWith(orgPrefix(org))).length;
  return { tables, rows, fts: await ftsOf(DB, org, schema, ftsKeys), objects: { org: mine, total: all.length } };
}
// othersOf(c) -> what every other org holds, table by table (total − the org's)
const othersOf = (c) => ({ ...Object.fromEntries(Object.entries(c.tables).map(([t, x]) => [t, x.total - x.org])), "(search index)": c.fts.total - c.fts.org, "(objects)": c.objects.total - c.objects.org });
// the "kept" rule's tables: an org's SOURCE tables — never a derived one (a tally or a mark moves both ways under traffic; the
// search index is one) nor one whose rows expire (KEPT_SKIP)
export const KEPT_SKIP = ["previews", "login_attempts", "tokens"];
export const keptTables = (schema, rules) => schema.filter((t) => rules[t.name].sql && !rules[t.name].derived && !(t.name in BACKUP_DERIVED) && !KEPT_SKIP.includes(t.name));
// keptOf(DB, O, org, schema, rules) -> { rows: { <table>: Set(row id) }, objects: Set(key) }: every row of every OTHER org (every row
// the org's rule does not take: any org but `org`, and a row of none) in each kept table, by its primary key (its rowid where it
// has none), and every object outside the org's prefix. The "kept" rule's before and after.
export async function keptOf(DB, O, org, schema, rules) {
  const h = orgDb(DB, org);
  const rows = {};
  for (const t of keptTables(schema, rules)) {
    const pk = t.pk && t.pk.length ? t.pk : ["rowid"];
    const got = (await h.prepare(`SELECT ${pk.map((c, i) => `${c === "rowid" ? "rowid" : qid(c)} AS k${i}`).join(", ")} FROM ${qid(t.name)} WHERE (${rules[t.name].sql}) IS NOT 1`).all()).results || [];
    rows[t.name] = new Set(got.map((r) => JSON.stringify(pk.map((_, i) => r[`k${i}`]))));
  }
  const pre = orgPrefix(org);
  return { rows, objects: new Set((await O.list("")).map((o) => o.key).filter((k) => !k.startsWith(pre))) };
}
// keptDiff(before, after) -> { lost: ["<table>: n gone (ids …)"], gained: ["<table> +n"] }: a row present before and absent after
// is lost whatever else was added (a loss offset by a gain is still a loss)
export function keptDiff(b, a) {
  const lost = [], gained = [];
  const one = (name, x, y) => {
    const gone = [...x].filter((k) => !y.has(k));
    const added = [...y].filter((k) => !x.has(k)).length;
    if (gone.length) lost.push(`${name}: ${gone.length} gone (${gone.slice(0, 3).join(", ")}${gone.length > 3 ? ", …" : ""})`);
    if (added) gained.push(`${name} +${added}`);
  };
  for (const t of new Set([...Object.keys(b.rows), ...Object.keys(a.rows)])) one(t, b.rows[t] || new Set(), a.rows[t] || new Set());
  one("(objects outside the org's prefix)", b.objects, a.objects);
  return { lost, gained };
}

// ---- the batch's atomicity (finding 13) ----
// proveAtomic(DB, org) -> null when the database runs a batch as ONE transaction (proven: a probe batch on the org itself — a sign-in
// attempt row, then the same row again, which fails — leaves no row), else the reason. Whatever the outcome, no probe row is left.
export async function proveAtomic(DB, org) {
  const h = orgDb(DB, org);
  const id = `org-undo-probe-${randomUUID()}`, at = new Date().toISOString();
  const put = () => h.prepare("INSERT INTO login_attempts (id, email, ok, at, org) VALUES (?1, 'org-undo-probe', 0, ?2, {org})").bind(id, at);
  let threw = null;
  try { await h.batch([put(), put()]); } catch (e) { threw = String((e && e.message) || e); }
  const kept = (await h.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE id = ?1").bind(id).first()).n;
  if (kept) await h.prepare("DELETE FROM login_attempts WHERE id = ?1 AND org = {org}").bind(id).run();
  if (!threw) return "the probe batch's second statement (a duplicate key) did not fail";
  if (kept) return `the probe batch failed on its second statement, yet its first statement's row stayed (${kept}): the batch is not one transaction`;
  return null;
}

// ---- the org's objects ----
// orgObjects(O, org) -> Map(logical key -> its listing, `at` where it lies): o<org>/… alone, for every org (src/storage.js: a key
// with no org prefix is no org's, org 1's included)
export async function orgObjects(O, org) {
  const pre = orgPrefix(org);
  return new Map((await O.list(pre)).map((o) => [o.key.slice(pre.length), { ...o, at: o.key }]));
}
const exported = (k) => EXPORT_ROOTS.some((r) => k.startsWith(r));
// listingOf(keys) -> { n, hash } over the exported objects' (key, size): the export's summary of its listing (the delete compares
// every object's sha256 instead: changedSince)
export function listingOf(objs) {
  const h = createHash("sha256");
  const list = [...objs].filter(([k]) => exported(k)).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [k, o] of list) h.update(`${k}\t${o.size}\n`);
  return { n: list.length, hash: h.digest("hex") };
}

// ---- export ----
// exportOrg(DB, O, org, { database }) -> { exp, bodies: Map(sha256 -> bytes) }
export async function exportOrg(DB, O, org, o = {}) {
  const row = await orgDb(DB, org).prepare("SELECT id, name FROM org WHERE id = {org}").first();
  if (!row) return refused(`no org ${org} in this database`);
  const env = platformEnv({ DB }, org);
  const tables = {}, missing = [];
  let cursor = "", rule = null, pages = 0;
  while (cursor != null) {
    const p = await backupPage(env, { cursor, rows: 1000 });
    if (p.error) throw new Error(`backupPage: ${p.error}`);
    if (p.rule) rule = p.rule;
    if (p.table) { (tables[p.table] = tables[p.table] || []).push(...p.rows); if (p.missing) missing.push(p.table); }
    cursor = p.next; pages++;
  }
  const objs = await orgObjects(O, org);
  const bodies = new Map(), objects = [], left = {};
  for (const [k, x] of [...objs].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!exported(k)) { const r = Object.keys(LEFT_ROOTS).find((p) => k.startsWith(p)) || "(no root)"; left[r] = (left[r] || 0) + 1; continue; }
    const b = await O.get(x.at);
    if (!b) continue;   // deleted since the listing
    const s = sha256(b.bytes);
    bodies.set(s, b.bytes);
    objects.push({ key: k, size: b.bytes.length, sha256: s, contentType: b.contentType || null, customMetadata: b.customMetadata || {} });
  }
  const counts = Object.fromEntries(BACKUP_DUMPED.map((t) => [t.table, (tables[t.table] || []).length]));
  const exp = { format: EXPORT_FORMAT, at: new Date().toISOString(), source: { database: o.database || null, org, name: row.name },
    dump: { format: BACKUP_FORMAT, rule, tables, missing, pages }, counts, objects, listing: listingOf(objs), left, leftWhy: LEFT_ROOTS };
  return { exp, bodies };
}

// ---- the remapping ----
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SHAPES = `${UUID}|T-\\d{8}-\\d+|o[1-9]\\d*--[a-z0-9-]+`;
// a token of a distinctive shape (a uuid, a contribution id, a prefixed project key), never inside a longer word
export const TOKEN_RE = new RegExp(`(?<![A-Za-z0-9_-])(?:${SHAPES})(?![A-Za-z0-9_-])`, "g");
export const isDistinct = (s) => new RegExp(`^(?:${SHAPES})$`).test(s);
const LITERAL_RE = /"((?:[^"\\]|\\.)*)"/g;
const PROJECT_FIELD_RE = /"(project|projectKey|project_key)"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g;
export const isKeyColumn = (table, col) => col === "project" || col === "project_key" || (table === "projects" && col === "key") || (table === "org" && col === "home");
const decode = (raw) => { try { return JSON.parse(`"${raw}"`); } catch { return null; } };
// rewriter({ ids, keys, from, to }) -> { string(s), row(table, r), objectKey(k) }: ids Map(old -> new), keys Map(old key -> new key),
// the org from -> to. The SAME function undoes a restore when handed the inverted maps (inverseOf).
export function rewriter({ ids, keys, from, to }) {
  const others = new Set([...ids.keys()].filter((k) => !isDistinct(k)));   // ids of no distinctive shape: whole values only
  const token = (m) => ids.get(m) ?? keys.get(m) ?? m;
  function string(s) {
    if (ids.has(s)) return ids.get(s);
    let out = s.replace(TOKEN_RE, token);
    if (out.includes('"')) {
      out = out.replace(PROJECT_FIELD_RE, (all, f, sep, raw) => { const v = decode(raw); return v != null && keys.has(v) ? `"${f}"${sep}${JSON.stringify(keys.get(v))}` : all; });
      if (others.size) out = out.replace(LITERAL_RE, (all, raw) => { const v = decode(raw); return v != null && others.has(v) ? JSON.stringify(ids.get(v)) : all; });
    }
    return out;
  }
  function row(table, r) {
    const o = {};
    for (const [c, v] of Object.entries(r)) {
      if (typeof v === "string") o[c] = isKeyColumn(table, c) ? (keys.get(v) ?? v) : string(v);
      else if (v === from && ((c === "org" && table !== "projects") || (table === "org" && c === "id"))) o[c] = to;
      else o[c] = v;
    }
    return o;
  }
  // a render's body lies at renders/<project>/<hash>: its project segment is a key; any other key is text
  const objectKey = (k) => { const m = /^renders\/([^/]+)\/(.+)$/.exec(k); return m ? `renders/${keys.get(m[1]) ?? m[1]}/${m[2]}` : string(k); };
  return { string, row, objectKey };
}
const invert = (m) => new Map([...m].map(([a, b]) => [b, a]));
// inverseOf(rec) -> the maps that take the restored org back to the export's ids (and its derived rows' bucket back)
export const inverseOf = (rec) => ({ ids: invert(new Map(rec.maps.ids)), keys: new Map([...invert(new Map(rec.maps.keys)), [orgBucketOf(rec.to), orgBucketOf(rec.from)]]), from: rec.to, to: rec.from });

// allocateTids(collided, sourceIds, topOfDay) -> Map(old id -> new id): a contribution keeps its day and takes the day's next free
// numbers, above every id of that day in the database (topOfDay) and in the export (sourceIds), in its old order (3 digits at
// least, as src/core.js writes them)
const TID = /^T-(\d{8})-(\d+)$/;
export function allocateTids(collided, sourceIds, topOfDay) {
  const seq = (id) => { const m = TID.exec(id); return m ? Number(m[2]) : 0; };
  const dayOf = (x) => { const m = TID.exec(x.id); return m ? m[1] : String(x.created_at || "").slice(0, 10).replace(/-/g, "") || "00000000"; };
  const top = new Map();
  for (const id of sourceIds) { const m = TID.exec(id); if (m) top.set(m[1], Math.max(top.get(m[1]) || 0, Number(m[2]))); }
  const byDay = new Map();
  for (const x of collided) { const d = dayOf(x); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(x); }
  const out = new Map();
  for (const [d, list] of byDay) {
    let n = Math.max(top.get(d) || 0, topOfDay.get(d) || 0);
    list.sort((a, b) => seq(a.id) - seq(b.id) || (a.id < b.id ? -1 : 1));
    for (const x of list) out.set(x.id, `T-${d}-${String(++n).padStart(3, "0")}`);
  }
  return out;
}
async function taken(DB, table, ids) {
  const got = new Set();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    for (const r of (await DB.prepare(`SELECT id FROM ${qid(table)} WHERE id IN (${part.map((_, n) => `?${n + 1}`).join(", ")})`).bind(...part).all()).results || []) got.add(r.id);
  }
  return got;
}
// the database's newest id of a day (src/core.js NEXT_SEQ_SQL: by its number, migrate-049)
async function topOfDays(DB, days) {
  const m = new Map();
  for (const d of days) {
    const r = await DB.prepare(NEXT_SEQ_SQL).bind(`T-${d}-`, `T-${d}.`, `T-${d}-`).first();
    const x = r && /-(\d+)$/.exec(r.id);
    m.set(d, x ? Number(x[1]) : 0);
  }
  return m;
}

// ---- restore ----
// planRestore(DB, exp, { as, name }) -> the restore, nothing written: { from, to, name, maps, rows, objects, owner } | { refused }
export async function planRestore(DB, exp, o = {}) {
  if (!exp || exp.format !== EXPORT_FORMAT || !exp.dump || exp.dump.format !== BACKUP_FORMAT) return refused(`not a ${EXPORT_FORMAT} export`);
  const T = exp.dump.tables;
  const from = exp.source.org;
  const ids = ((await DB.prepare("SELECT id FROM org ORDER BY id").all()).results || []).map((r) => r.id);
  const to = o.as != null ? Number(o.as) : Math.max(0, ...ids) + 1;
  if (!Number.isSafeInteger(to) || to < 2) return refused(`the new org's id must be a whole number ≥ 2 (org 1 is HOME_ORG, never restored over): ${o.as}`);
  if (ids.includes(to)) return refused(`org ${to} exists: a restore goes into a NEW org (name a free id with --as, or none for the next)`);
  const schema = await schemaOf(DB), rules = rulesOf(schema);
  const stray = [];
  for (const t of schema) if (rules[t.name].sql && (t.cols.includes("org") || t.name === "projects")) {
    const n = (await orgDb(DB, to).prepare(`SELECT COUNT(*) AS n FROM ${qid(t.name)} WHERE org = {org}`).first()).n;
    if (n) stray.push(`${t.name} ${n}`);
  }
  if (stray.length) return refused(`rows of org ${to} are in the database though its org row is not (${stray.join(", ")}): delete them first (delete --org ${to})`);
  const owner = ownerOf(exp.dump);
  if (!owner) return refused("the export holds no active owner to hand the fresh key to");
  // the project keys: o<to>--<slug>
  const keys = new Map();
  for (const p of T.projects || []) {
    const k = orgOfKey(p.key), nk = k && projectKeyOf(to, k.slug);
    if (!nk) return refused(`project ${p.key}: its slug makes no key in org ${to} (the key form: 2 to 40 characters)`);
    keys.set(p.key, nk);
  }
  // the ids already taken in this database (the rehearsal: the source is still there)
  const map = new Map();
  const srcIds = new Set();
  for (const t of ID_TABLES) for (const r of T[t] || []) srcIds.add(r.id);
  let collidedTx = [];
  for (const t of ID_TABLES) {
    const list = (T[t] || []).map((r) => r.id);
    const hit = await taken(DB, t, list);
    if (t === "transmission") collidedTx = (T[t] || []).filter((r) => hit.has(r.id));
    else for (const id of hit) map.set(id, randomUUID());
  }
  const days = [...new Set(collidedTx.map((x) => (TID.exec(x.id) || [])[1] || String(x.created_at || "").slice(0, 10).replace(/-/g, "")))];
  for (const [a, b] of allocateTids(collidedTx, [...srcIds].filter((id) => TID.test(id)), await topOfDays(DB, days))) map.set(a, b);
  for (const [a, b] of map) if (srcIds.has(b) || b === a) return refused(`the new id for ${a} (${b}) is an id of the export: refusing a chained remap`);
  const rw = rewriter({ ids: map, keys, from, to });
  const rows = {};
  for (const t of BACKUP_DUMPED) {
    let list = (T[t.table] || []).map((r) => rw.row(t.table, r));
    if (t.table === "check_results") list = list.map((r, i) => [r, (T.check_results[i] || {}).id]).sort((a, b) => a[1] - b[1]).map(([r]) => { const x = { ...r }; delete x.id; return x; });
    if (t.table === "people") list = list.map((r) => ({ ...r, key_hash: `restored:${r.id}` }));
    if (t.table === "org" && o.name) list = list.map((r) => ({ ...r, name: String(o.name) }));
    rows[t.table] = list;
  }
  // migrate-072 (sprint 7, 7.3): an org's path name and its founder account are each unique across the database. The restore keeps
  // each while no org holds it (an org restored after its delete takes its address back); else it is left to the database: the
  // path name derived again by migrate-072's trigger (<name>-<id>), the founder none (a copy is the operator's, never the account's
  // second org). What was left is recorded (released), so verify compares the rest exactly.
  const released = [];
  for (const r of rows.org || []) for (const c of ["slug", "created_by_account"]) {
    if (r[c] == null) continue;
    if (await DB.prepare(`SELECT 1 AS x FROM org WHERE ${c} = ?1`).bind(r[c]).first()) { released.push(c); r[c] = null; }
  }
  const objects = (exp.objects || []).map((x) => ({ ...x, to: rw.objectKey(x.key) }));
  return { from, to, name: o.name || exp.source.name, owner: rw.string(owner.id), maps: { ids: [...map], keys: [...keys] }, rows, objects, checkResults: (T.check_results || []).length, released };
}
// loadRestore(DB, O, plan, bodyOf, { ownerKeyHash, ownerPass, chunk }) -> what landed: the objects, the rows (one bound INSERT a
// row, in BACKUP_DUMPED's order, batches of `chunk`), the stale marks over the new org's projects only, then the owner's key
export async function loadRestore(DB, O, plan, bodyOf, o = {}) {
  if (!o.ownerKeyHash) throw new Error("loadRestore needs the owner's fresh key hash");
  if ((await DB.prepare("SELECT 1 AS x FROM org WHERE id = ?1").bind(plan.to).first())) return refused(`org ${plan.to} appeared since the plan`);
  const pre = orgPrefix(plan.to);
  const have = new Map((await O.list(pre)).map((x) => [x.key, x]));
  let put = 0, kept = 0;
  for (const x of plan.objects) {
    const h = have.get(pre + x.to);
    if (h && h.size === x.size) { kept++; continue; }
    const bytes = await bodyOf(x.sha256);
    if (!bytes || sha256(bytes) !== x.sha256) throw new Error(`the export's body ${x.sha256} is missing or damaged`);
    await O.put(pre + x.to, bytes, { contentType: x.contentType || undefined, customMetadata: x.customMetadata });
    put++;
  }
  const stmts = [];
  for (const t of BACKUP_DUMPED) for (const r of plan.rows[t.table] || []) {
    const cols = Object.keys(r);
    stmts.push(DB.prepare(`INSERT INTO ${qid(t.table)} (${cols.map(qid).join(", ")}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...cols.map((c) => r[c] ?? null)));
  }
  const chunk = o.chunk || 200;
  for (let i = 0; i < stmts.length; i += chunk) await DB.batch(stmts.slice(i, i + chunk));
  const h = orgDb(DB, plan.to);
  await h.batch(restoreRebuildSql("(SELECT key FROM projects WHERE org = {org})").map((s) => h.prepare(s)));
  // o.ownerPass { hash, salt } (optional; the sprint-7 review, D1): the owner's SEAT secret too, the fresh key's pbkdf2 (add-person's
  // S-019 rule: the key is the seat's own passphrase) — tools/attack-xorg.mjs's throwaway owners sign in by it for a browser session
  const own = o.ownerPass
    ? await h.prepare("UPDATE people SET key_hash = ?1, pass_hash = ?3, pass_salt = ?4 WHERE id = ?2 AND org = {org}").bind(o.ownerKeyHash, plan.owner, o.ownerPass.hash, o.ownerPass.salt).run()
    : await h.prepare("UPDATE people SET key_hash = ?1 WHERE id = ?2 AND org = {org}").bind(o.ownerKeyHash, plan.owner).run();
  if (!own || !own.meta || own.meta.changes !== 1) throw new Error(`the restored owner ${plan.owner} did not take the fresh key`);
  return { org: plan.to, objects: { put, kept }, rows: stmts.length, statements: Math.ceil(stmts.length / chunk) + 2 };
}
export const recordOf = (plan, exp, loaded) => ({ format: RECORD_FORMAT, at: new Date().toISOString(), source: exp.source, exportAt: exp.at, from: plan.from, to: plan.to,
  name: plan.name, owner: plan.owner, maps: plan.maps, checkResults: plan.checkResults, objects: plan.objects.map((x) => [x.key, x.to]), loaded, released: plan.released || [] });

// ---- verify ----
// norm(table, rows) -> the rows as compared: check_results' ids are the database's own, so each becomes its rank (the order kept)
const norm = (table, rows) => (table !== "check_results" ? rows : [...rows].sort((a, b) => a.id - b.id).map((r, i) => ({ ...r, id: i })));
// leftovers(rows, old) -> the values of the restored org's rows still naming an old id that was remapped (a whole value, a token,
// a JSON string)
export function leftovers(tables, old) {
  const hits = [];
  if (!old.size) return hits;
  for (const [t, rows] of Object.entries(tables)) for (const r of rows) for (const [c, v] of Object.entries(r)) {
    if (typeof v !== "string") continue;
    const found = old.has(v) ? v : (v.match(TOKEN_RE) || []).find((m) => old.has(m)) || [...v.matchAll(LITERAL_RE)].map((m) => decode(m[1])).find((x) => x != null && old.has(x));
    if (found) hits.push(`${t}.${c} ${found}`);
  }
  return hits;
}
// verifyRestore(DB, O, exp, rec) -> { ok, checks: [{ ok, what, detail }] }
export async function verifyRestore(DB, O, exp, rec) {
  const checks = [];
  const check = (ok, what, detail = "") => checks.push({ ok: !!ok, what, ...(detail ? { detail } : {}) });
  const again = await exportOrg(DB, O, rec.to);
  if (again.refused) { check(false, `org ${rec.to} re-exported`, again.refused); return { ok: false, checks }; }
  const A = again.exp;
  const inv = rewriter(inverseOf(rec));
  // the org's name is the one remapping the record holds outside its maps (restore --name): undone like the rest
  const srcName = exp.source && exp.source.name;
  // ...and the org row's columns the restore released (migrate-072: a path name or a founder another org held), back to the export's
  const srcOrg = ((exp.dump.tables.org || [])[0]) || {};
  const unRelease = (r) => { const x = { ...r }; for (const c of rec.released || []) x[c] = srcOrg[c] ?? null; return x; };
  const undoName = (table, r) => (table !== "org" ? r : unRelease(srcName != null && rec.name != null && r.name === rec.name ? { ...r, name: srcName } : r));
  const bad = [];
  let rows = 0;
  for (const t of BACKUP_DUMPED) {
    const want = norm(t.table, exp.dump.tables[t.table] || []), got = norm(t.table, (A.dump.tables[t.table] || []).map((r) => undoName(t.table, inv.row(t.table, r))));
    rows += want.length;
    if (want.length !== got.length || tableHash(want) !== tableHash(got)) bad.push(`${t.table} ${want.length}→${got.length}${want.length === got.length ? " (content differs)" : ""}`);
  }
  check(!bad.length, `every table back, every remapping undone: ${BACKUP_DUMPED.length} tables, ${rows} rows, the count and content hash of each equal the export's`, bad.join(", "));
  // the objects: each exported body at the key the remapping gives it (forward, from the record's maps), byte for byte
  const fwd = rewriter({ ids: new Map(rec.maps.ids), keys: new Map(rec.maps.keys), from: rec.from, to: rec.to });
  const objKey = (x) => `${x.key}\t${x.sha256}\t${x.size}\t${x.contentType || ""}`;
  const wantO = new Set((exp.objects || []).map((x) => objKey({ ...x, key: fwd.objectKey(x.key) }))), gotO = new Set(A.objects.map(objKey));
  const lost = [...wantO].filter((x) => !gotO.has(x)), extra = [...gotO].filter((x) => !wantO.has(x));
  check(!lost.length && !extra.length, `every object back byte for byte: ${wantO.size} (sha256 and size; renders under the new project keys)`, [...lost.map((x) => `missing ${x.split("\t")[0]}`), ...extra.map((x) => `extra ${x.split("\t")[0]}`)].slice(0, 6).join("; "));
  // and every body a restored row names is where the worker reads it (src/storage.js: o<org>/renders/<project>/<hash>, o<org>/<r2_key>)
  const have = new Set(A.objects.map((x) => x.key));
  const named = [];
  for (const t of ["k_renders", "k_styles", "k_screen_takes"]) for (const r of A.dump.tables[t] || []) named.push(`renders/${r.project}/${r.hash}`);
  for (const r of A.dump.tables.artifacts || []) named.push(r.r2_key);
  const unbodied = [...new Set(named)].filter((k) => !have.has(k) && (exp.objects || []).some((x) => x.key === inv.objectKey(k)));
  check(!unbodied.length, `every body a restored row names lies where the worker reads it (${new Set(named).size} named)`, unbodied.slice(0, 6).join(", "));
  const old = new Set(rec.maps.ids.filter(([a, b]) => a !== b).map(([a]) => a));
  for (const [a, b] of rec.maps.keys) if (a !== b && isDistinct(a)) old.add(a);
  const left = leftovers(A.dump.tables, old);
  const oldKeys = new Set(rec.maps.keys.filter(([a, b]) => a !== b).map(([a]) => a));
  for (const [t, rows2] of Object.entries(A.dump.tables)) for (const r of rows2) for (const [c, v] of Object.entries(r)) if (isKeyColumn(t, c) && oldKeys.has(v)) left.push(`${t}.${c} ${v}`);
  check(!left.length, `no old id or project key left in the restored org's rows (${old.size} remapped ids and keys looked for)`, left.slice(0, 8).join(", "));
  const schema = await schemaOf(DB), rules = rulesOf(schema);
  const cross = await crossRefs(DB, rec.to, schema, rules);
  check(!cross.length, `no foreign key crosses org ${rec.to}'s wall (in or out)`, cross.map((x) => `${x.table}.${x.column}→${x.references} out ${x.out} in ${x.in}`).join("; "));
  const src = await DB.prepare("SELECT 1 AS x FROM org WHERE id = ?1").bind(rec.from).first();
  if (src && rec.from !== rec.to) {
    const off = [];
    const derived = Object.keys(BACKUP_DERIVED).filter((t) => rules[t] && rules[t].sql);
    // a tally row whose every count is 0 is the same as no row (a source that counted up and back down keeps one; a rebuild never
    // makes it): dropped on both sides, as is updated_at (when the row last moved)
    const empty = (t, r) => { const pk = (schema.find((x) => x.name === t) || {}).pk || []; const n = Object.entries(r).filter(([c, v]) => !pk.includes(c) && typeof v === "number"); return n.length > 0 && n.every(([, v]) => v === 0); };
    for (const t of derived) {
      const read = async (org) => ((await orgDb(DB, org).prepare(`SELECT * FROM ${qid(t)} WHERE ${rules[t].sql}`).all()).results || []).filter((r) => !empty(t, r)).map((r) => { const x = { ...r }; delete x.updated_at; return x; });
      const [a, b] = [await read(rec.from), (await read(rec.to)).map((r) => inv.row(t, r))];
      if (tableHash(a) !== tableHash(b)) off.push(`${t} ${a.length}→${b.length}`);
    }
    // the search index: what each project's token finds, source key against restored key
    if (schema.some((t) => t.name === "k_find" && t.virtual)) for (const [a, b] of rec.maps.keys) {
      const n = async (k) => (await DB.prepare("SELECT COUNT(*) AS n FROM k_find WHERE k_find MATCH ?1").bind(`p : ${projectToken(k)}`).first()).n;
      const [x, y] = [await n(a), await n(b)];
      if (x !== y) off.push(`k_find ${a} ${x}→${y}`);
    }
    check(!off.length, `the derived tables the triggers rebuilt equal the source org's (${derived.length} tables, updated_at and all-zero tallies aside) and the search index finds as many rows for each project`, off.join(", "));
  } else check(true, `the derived tables: not compared (the source org ${rec.from} is no longer in this database)`);
  const ownRow = await orgDb(DB, rec.to).prepare("SELECT key_hash FROM people WHERE id = ?1 AND org = {org}").bind(rec.owner).first();
  const noKey = (await orgDb(DB, rec.to).prepare("SELECT COUNT(*) AS n FROM people WHERE org = {org} AND id <> ?1 AND key_hash NOT LIKE 'restored:%'").bind(rec.owner).first()).n;
  check(ownRow && !String(ownRow.key_hash).startsWith("restored:") && noKey === 0, "the restored owner holds the fresh key; every other person holds none (a new key on Control)");
  return { ok: checks.every((c) => c.ok), checks };
}

// ---- delete ----
// changedSince(DB, O, org, exp) -> what differs between the org now (re-exported) and the export: per dumped table its count and
// its rows' content hash (tableHash: an UPDATE that keeps the count differs), per object its key, size, content type and sha256.
// Empty: nothing was written since the export.
export async function changedSince(DB, O, org, exp) {
  const now = await exportOrg(DB, O, org, { database: exp.source && exp.source.database });
  if (now.refused) return [now.refused];
  const off = [];
  for (const t of BACKUP_DUMPED) {
    const [a, b] = [exp.dump.tables[t.table] || [], now.exp.dump.tables[t.table] || []];
    if (a.length !== b.length) off.push(`${t.table} ${a.length}→${b.length}`);
    else if (tableHash(a) !== tableHash(b)) off.push(`${t.table} ${a.length}→${b.length} (content)`);
  }
  const obj = (x) => `${x.key}\t${x.size}\t${x.contentType || ""}\t${x.sha256}`;
  const [oa, ob] = [new Set((exp.objects || []).map(obj)), new Set(now.exp.objects.map(obj))];
  const gone = [...oa].filter((x) => !ob.has(x)).length, added = [...ob].filter((x) => !oa.has(x)).length;
  if (gone || added) off.push(`objects ${oa.size}→${ob.size}${gone && added && oa.size === ob.size ? " (content)" : ""}`);
  return off;
}
// deleteOrg(DB, O, org, { confirm, exp, database, others, proveAtomic }) -> { deleted, before, after, ok } | { refused } — see the header
export async function deleteOrg(DB, O, org, o = {}) {
  if (!Number.isSafeInteger(org) || org < 1) return refused(`not an org id: ${org}`);
  if (org === HOME_ORG) return refused(`org ${HOME_ORG} (HOME_ORG) is never deleted by this tool`);
  const row = await orgDb(DB, org).prepare("SELECT id, name FROM org WHERE id = {org}").first();
  const c = o.confirm == null ? null : String(o.confirm);
  if (!(c === String(org) || (row && c === row.name))) return refused(`--yes-delete must name the org: its id (${org})${row ? ` or its name ("${row.name}")` : ""}`);
  const schema = await schemaOf(DB), rules = rulesOf(schema);
  const unplaced = schema.filter((t) => rules[t.name].unplaced).map((t) => t.name);
  if (unplaced.length) return refused(`tables this tool cannot place (a new migration's table must be placed in tools/org-undo.mjs ruleOf): ${unplaced.join(", ")}`);
  const before = await countsOf(DB, O, org, schema, rules);
  const kept = o.others === "kept";
  // the live semantics ("kept") prove the batch first unless the caller says otherwise (tools/attack-xorg.mjs's live cleanup too)
  const prove = o.proveAtomic ?? kept;
  const keptBefore = kept ? await keptOf(DB, O, org, schema, rules) : null;
  let statements = 0;
  if (row || before.rows) {
    // the undo in hand: a complete export of THIS org, and nothing written since. Rows with no org row are not an org (a restore
    // that failed before its org row landed: nothing in them is restorable, and export refuses them): they go on the name alone
    const exp = o.exp;
    if (row) {
      if (!exp || exp.format !== EXPORT_FORMAT || !exp.source || exp.source.org !== org || (o.database && exp.source.database !== o.database)) {
        return refused(`--export must be an export of org ${org} of this database (${o.database || "?"}): export it first`);
      }
      const drift = await changedSince(DB, O, org, exp);
      if (drift.length) return refused(`the org changed since the export (${drift.join(", ")}): export it again`);
    }
    const cross = await crossRefs(DB, org, schema, rules);
    if (cross.length) return refused("rows cross the org's wall (a foreign key into or out of it): look before deleting", { cross });
    if (prove) {
      const why = await proveAtomic(DB, org);
      if (why) return refused(`the database's batch is not proven atomic — ${why}; the delete (one batch whose first statement eval-marks the org's decided contributions) does not run`);
    }
    const h = orgDb(DB, org);
    const { passes, last } = deleteOrder(schema, rules);
    const marks = schema.some((t) => t.name === "accounts" && t.cols.includes("invited_org"));   // migrate-079's mark
    const sql = [
      // approval_audit is append-only (Q23D7E346): its trigger lets a decision go only with an eval contribution, so the org's
      // decided contributions are marked eval first, in the same batch, and leave with it
      "UPDATE transmission SET eval = 1 WHERE org = {org} AND eval IS NOT 1 AND id IN (SELECT transmission_id FROM approval_audit WHERE org = {org})",
      // the org row names its home project and its owner: unpointed first, deleted last
      "UPDATE org SET home = NULL, created_by = NULL, updated_by = NULL WHERE id = {org}",
      // THE INVITE MARK (the header): an account marked by this org's invite link keeps a mark no org's id will ever take
      ...(marks ? ["UPDATE accounts SET invited_org = 0 WHERE invited_org = {org}"] : []),
      ...[...passes, ...passes].map((t) => `DELETE FROM ${qid(t)} WHERE ${rules[t].sql}`),
      ...last.map((t) => `DELETE FROM ${qid(t)} WHERE ${rules[t].sql}`),
    ];
    statements = sql.length;
    await h.batch(sql.map((s) => h.prepare(s)));
  }
  const pre = orgPrefix(org);
  let objects = 0;
  for (const x of await O.list(pre)) { await O.delete(x.key); objects++; }
  const after = await countsOf(DB, O, org, schema, rules, before.fts.keys);
  // the other orgs: "exact" — exactly as before; "kept" — per org and table, never fewer than before (more is live traffic)
  let moved = [], lost = [], gained = [];
  if (kept) ({ lost, gained } = keptDiff(keptBefore, await keptOf(DB, O, org, schema, rules)));
  else {
    const [ob, oa] = [othersOf(before), othersOf(after)];
    moved = Object.keys(ob).filter((k) => ob[k] !== oa[k]).map((k) => `${k} ${ob[k]}→${oa[k]}`);
  }
  const left = Object.entries(after.tables).filter(([, x]) => x.org).map(([t, x]) => `${t} ${x.org}`);
  const gone = !(await DB.prepare("SELECT 1 AS x FROM org WHERE id = ?1").bind(org).first());
  const ok = !left.length && after.fts.org === 0 && after.objects.org === 0 && !moved.length && !lost.length && gone;
  return { step: "delete", org, name: row ? row.name : null, statements, deleted: { rows: before.rows - after.rows, searchIndex: before.fts.org - after.fts.org, objects },
    byTable: Object.fromEntries(Object.entries(before.tables).filter(([, x]) => x.org).map(([t, x]) => [t, x.org])), left, othersRule: kept ? "kept" : "exact", othersMoved: moved,
    ...(kept ? { othersLost: lost, othersGained: gained, ...(gained.length && !lost.length ? { othersNote: `other orgs took writes while the delete ran (none lost a row): ${gained.slice(0, 6).join(", ")}${gained.length > 6 ? ", …" : ""}` } : {}) } : {}),
    ...(prove && statements ? { atomic: "proven (a failing probe batch left no row)" } : {}), ok,
    ...(before.rows || row || objects ? {} : { note: "nothing to delete: no row and no object of the org is left" }) };
}

// ---- the backends ----
// readConfig(path) -> a wrangler config (JSONC: comments dropped outside strings)
export function readConfig(path) {
  const t = readFileSync(path, "utf8");
  let out = "", i = 0, str = false;
  while (i < t.length) {
    const ch = t[i];
    if (str) { out += ch; if (ch === "\\") { out += t[i + 1] || ""; i += 2; continue; } if (ch === '"') str = false; i++; continue; }
    if (ch === '"') { str = true; out += ch; i++; continue; }
    if (ch === "/" && t[i + 1] === "/") { while (i < t.length && t[i] !== "\n") i++; continue; }
    if (ch === "/" && t[i + 1] === "*") { i = t.indexOf("*/", i + 2); i = i < 0 ? t.length : i + 2; continue; }
    out += ch; i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
// local: the worker's own persisted state (wrangler dev --persist-to <dir>: <dir>/v3), D1 and R2 in one proxy; nothing reaches
// Cloudflare
export async function localBackends(persistDir, cfg) {
  const { getPlatformProxy } = await import(pathToFileURL(join(ENGINE, "node_modules", "wrangler", "wrangler-dist", "cli.js")).href);
  const d1 = cfg.d1_databases[0], r2 = (cfg.r2_buckets || []).find((b) => b.binding === "BRAIN") || cfg.r2_buckets[0];
  const tmp = mkdtempSync(join(tmpdir(), "org-undo-"));
  const path = join(tmp, "wrangler.jsonc");
  writeFileSync(path, JSON.stringify({ name: "org-undo", compatibility_date: "2026-08-01",
    d1_databases: [{ binding: "DB", database_name: d1.database_name, database_id: d1.database_id }], r2_buckets: [{ binding: "BRAIN", bucket_name: r2.bucket_name }] }));
  const proxy = await getPlatformProxy({ configPath: path, persist: { path: join(resolve(persistDir), "v3") }, remoteBindings: false });
  return { DB: proxy.env.DB, O: R2.bucketOf(proxy.env.BRAIN, r2.bucket_name), database: `local:${d1.database_name}`,
    close: async () => { await proxy.dispose(); rmSync(tmp, { recursive: true, force: true }); } };
}
// liveD1(databaseId) -> a D1-shaped binding over the Cloudflare API (POST …/d1/database/<id>/query: one statement with its
// params, or a batch, which D1 runs as one transaction), with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment
// (source the deployment's credentials file first; nothing here prints either). WRITTEN, NOT YET RUN: the ship's rehearsal runs
// `plan` first, which proves the read path before anything writes.
export function liveD1(databaseId, env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN, account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error("--live needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (source the deployment's credentials file)");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const call = async (body) => {
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "sharingu-org-undo/1.0" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.success) throw new Error(`D1 query: HTTP ${r.status} ${JSON.stringify((j && j.errors) || "").slice(0, 300)}`);
    return j.result || [];
  };
  const stmt = (sql, params = []) => ({
    sql, params,
    bind: (...p) => stmt(sql, p),
    all: async () => ({ results: ((await call({ sql, params }))[0] || {}).results || [] }),
    first: async () => (((await call({ sql, params }))[0] || {}).results || [])[0] ?? null,
    run: async () => ({ meta: ((await call({ sql, params }))[0] || {}).meta || {} }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => (await call({ batch: list.map((s) => ({ sql: s.sql, params: s.params })) })).map((r) => ({ results: r.results, meta: r.meta })) };
}
export async function liveBackends(cfg) {
  const d1 = cfg.d1_databases[0], r2 = (cfg.r2_buckets || []).find((b) => b.binding === "BRAIN") || cfg.r2_buckets[0];
  return { DB: liveD1(d1.database_id), O: R2.liveBackend(r2.bucket_name), database: `live:${d1.database_name}`, close: async () => {} };
}

// ---- the CLI ----
const readExport = (dir) => {
  const p = join(resolve(dir), "export.json");
  if (!existsSync(p)) throw Object.assign(new Error(`no export at ${p}`), { usage: true });
  return JSON.parse(readFileSync(p, "utf8"));
};
async function doorProbe(url, key, rec, exp) {
  const H = { authorization: "Bearer " + key, "content-type": "application/json", accept: "application/json" };
  let n = 0;
  const tool = async (name, args) => {
    const r = await fetch(url + "/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) });
    const j = await r.json().catch(() => null);
    const t = j && j.result && j.result.content && j.result.content[0] && j.result.content[0].text;
    try { return { ok: !!(j && j.result && !j.result.isError), out: JSON.parse(t) }; } catch { return { ok: false, out: t }; }
  };
  const who = await tool("whoami", {});
  const keys = new Map(rec.maps.keys);
  const off = [];
  for (const p of (exp.dump.tables.projects || []).filter((x) => Number(x.active) === 1)) {
    const want = (exp.dump.tables.k_goals || []).filter((g) => g.project === p.key).length;
    const r = await tool("read", { project: keys.get(p.key), kind: "goal", limit: 100 });
    const got = r.ok && r.out && Array.isArray(r.out.items) ? r.out.items.length : -1;
    if (got !== Math.min(want, 100)) off.push(`${keys.get(p.key)}: ${got} goals read, ${want} exported`);
  }
  return { ok: who.ok && who.out && who.out.id === rec.owner && !off.length, who: who.ok && who.out ? who.out.id : null, off };
}

async function main(argv) {
  const step = argv[0];
  const flag = (n) => { const i = argv.indexOf(n); return i > 0 && i + 1 < argv.length ? argv[i + 1] : undefined; };
  const local = flag("--local"), live = argv.includes("--live"), cfgPath = flag("--config");
  const usage = "usage: node tools/org-undo.mjs <plan|export|restore|verify|delete> (--local <persist dir> --config <wrangler config> | --live --config <wrangler config> --confirm-live <D1 database name>) … (see the header)";
  if (!["plan", "export", "restore", "verify", "delete"].includes(step) || !cfgPath || !local === !live) { console.error(usage); return 2; }
  const cfg = readConfig(cfgPath);
  if (!cfg.d1_databases || !cfg.d1_databases[0] || !cfg.r2_buckets || !cfg.r2_buckets[0]) { console.error(`${cfgPath}: no D1 database or R2 bucket`); return 2; }
  if (live && flag("--confirm-live") !== cfg.d1_databases[0].database_name) {
    console.error(`--live refused: --confirm-live must name the D1 database of ${cfgPath} (${cfg.d1_databases[0].database_name}) — the live shared database, every org's`);
    return 1;
  }
  const org = flag("--org") != null ? Number(flag("--org")) : null;
  if (["plan", "export", "delete"].includes(step) && !Number.isSafeInteger(org)) { console.error(usage); return 2; }
  const be = live ? await liveBackends(cfg) : await localBackends(local, cfg);
  const print = (o) => console.log(JSON.stringify(o, null, 2));
  try {
    if (step === "plan") {
      const schema = await schemaOf(be.DB), rules = rulesOf(schema);
      const row = await orgDb(be.DB, org).prepare("SELECT id, name FROM org WHERE id = {org}").first();
      const c = await countsOf(be.DB, be.O, org, schema, rules);
      const objs = await orgObjects(be.O, org);
      const byRoot = {};
      for (const k of objs.keys()) { const r = (/^[^/]+\//.exec(k) || ["(no root)"])[0]; byRoot[r] = (byRoot[r] || 0) + 1; }
      const cross = await crossRefs(be.DB, org, schema, rules);
      const unplaced = schema.filter((t) => rules[t.name].unplaced).map((t) => t.name);
      print({ step, database: be.database, org, name: row ? row.name : null, rows: c.rows, byTable: Object.fromEntries(Object.entries(c.tables).filter(([, x]) => x.org).map(([t, x]) => [t, x.org])),
        searchIndex: c.fts.org, objects: { n: objs.size, byRoot }, cross, unplaced, skipped: Object.fromEntries(schema.filter((t) => rules[t.name].skip).map((t) => [t.name, rules[t.name].skip])) });
      return unplaced.length || cross.length ? 1 : 0;
    }
    if (step === "export") {
      const out = flag("--out");
      if (!out) { console.error(usage); return 2; }
      const dir = resolve(out);
      if (existsSync(dir) && readdirSync(dir).length) { console.error(`✗ ${dir} is not empty: an export goes into an empty directory`); return 1; }
      const r = await exportOrg(be.DB, be.O, org, { database: be.database });
      if (r.refused) { print(r); return 1; }
      mkdirSync(join(dir, "objects"), { recursive: true });
      for (const [s, b] of r.bodies) writeFileSync(join(dir, "objects", s), b);
      writeFileSync(join(dir, "export.json"), JSON.stringify(r.exp));
      const rows = Object.values(r.exp.counts).reduce((a, b) => a + b, 0);
      print({ step, database: be.database, org, name: r.exp.source.name, dir, rows, counts: Object.fromEntries(Object.entries(r.exp.counts).filter(([, n]) => n)),
        objects: r.exp.objects.length, bodies: r.bodies.size, bytes: r.exp.objects.reduce((a, x) => a + x.size, 0), left: r.exp.left });
      return 0;
    }
    if (step === "restore") {
      const from = flag("--from"), credsOut = flag("--owner-creds-out");
      if (!from || !credsOut) { console.error(usage); return 2; }
      if (existsSync(credsOut)) { console.error(`✗ ${credsOut} exists: the restored owner's key goes into a NEW file`); return 1; }
      const exp = readExport(from);
      const plan = await planRestore(be.DB, exp, { as: flag("--as"), name: flag("--name") });
      if (plan.refused) { print(plan); return 1; }
      const key = randomBytes(20).toString("hex");
      mkdirSync(dirname(resolve(credsOut)), { recursive: true });
      writeFileSync(credsOut, `ORG${plan.to}_AGENT_R_OWNER_KEY=${key}\n`, { mode: 0o600 });
      const loaded = await loadRestore(be.DB, be.O, plan, async (s) => readFileSync(join(resolve(from), "objects", s)), { ownerKeyHash: sha256(key), chunk: live ? 100 : 500 });
      if (loaded.refused) { print(loaded); return 1; }
      const rec = recordOf(plan, exp, loaded);
      const recPath = resolve(flag("--record") || join(resolve(from), `restore-o${plan.to}.json`));
      writeFileSync(recPath, JSON.stringify(rec, null, 1));
      const changed = plan.maps.ids.length;
      print({ step, database: be.database, from: plan.from, to: plan.to, name: plan.name, owner: plan.owner, rows: loaded.rows, objects: loaded.objects,
        remapped: { projects: plan.maps.keys.length, ids: changed, contributions: plan.maps.ids.filter(([a]) => TID.test(a)).length, checkResults: plan.checkResults }, record: recPath, ownerCreds: resolve(credsOut) });
      return 0;
    }
    if (step === "verify") {
      const from = flag("--from");
      if (!from) { console.error(usage); return 2; }
      const exp = readExport(from);
      const recs = readdirSync(resolve(from)).filter((f) => /^restore-o\d+\.json$/.test(f));
      const recPath = flag("--record") || (recs.length === 1 ? join(resolve(from), recs[0]) : null);
      if (!recPath) { console.error(`✗ name the restore's record with --record (${recs.length} in ${from})`); return 2; }
      const rec = JSON.parse(readFileSync(recPath, "utf8"));
      const v = await verifyRestore(be.DB, be.O, exp, rec);
      if (flag("--url") && flag("--creds")) {
        const key = (readFileSync(flag("--creds"), "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1];
        const d = await doorProbe(String(flag("--url")).replace(/\/+$/, ""), key, rec, exp);
        v.checks.push({ ok: d.ok, what: `the restored owner signs in through the door (whoami ${d.who}) and reads every active project's goals`, ...(d.off.length ? { detail: d.off.join("; ") } : {}) });
        v.ok = v.ok && d.ok;
      }
      print({ step, database: be.database, from: rec.from, to: rec.to, ...v });
      return v.ok ? 0 : 1;
    }
    // delete
    const ex = flag("--export");
    const r = await deleteOrg(be.DB, be.O, org, { confirm: flag("--yes-delete"), exp: ex ? readExport(ex) : null, database: be.database, others: live ? "kept" : "exact", proveAtomic: live });
    print(r);
    return r.refused || r.ok === false ? 1 : 0;
  } finally { await be.close(); }
}

// run directly (REAL paths: macOS keeps var under a private symlink, and ~/Batcave is a symlink — a string compare would silently
// never run the CLI)
const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) {
  main(process.argv.slice(2)).then((rc) => process.exit(rc), (e) => { console.error(`✗ ${String((e && e.message) || e)}`); process.exit(e && e.usage ? 2 : 1); });
}
