#!/usr/bin/env node
// tools/restore-local.mjs — the RESTORE (sprint 3, S3b; docs/plan/BETA.md gate line 5): a dump taken through POST
// /backup-dump's pages (src/backup.js) loaded into a FRESH org booted from boot.sql, its derived tables rebuilt, and the
// result verified against the source, table by table and through the restored org's own door. A TOOL, never a route: the
// worker has no door that writes a dump back.
//
//   node tools/restore-local.mjs dump --url <org> --creds <credentials.env> --out <dump.json>
//       walks POST /backup-dump?page=<cursor> (the owner's key; one bounded statement a request, nothing written) and writes
//       the dump: {format, rule, at, source, tables: {<table>: [rows]}}; prints each table's rows, the bytes, the rows read
//       (the worker's Server-Timing d1-rows) and the time, and each project's share.
//   node tools/restore-local.mjs restore <dump.json> --into <state root> [--slug <org>] [--port <N>] [--r2-from <org dir>]
//       [--source-url <org> --source-creds <file>] [--source-db <sqlite>] [--keep] [--report <file.json>]
//       1. a fresh org: `R_LOCAL_STATE_ROOT=<state root> sh tools/r-local.sh seed <slug>` (boot.sql and one owner; the state
//          root must not hold <slug> yet). --slug defaults to the source's slug (the dump's source.slug), so the restored
//          org's bucket and database NAMES are the source's: a fresh D1 beside the same bucket.
//       2. the load: ONE SQL file (restoreSql below) through `wrangler d1 execute --local --file`, the org down: the seeded
//          owner is set aside, every dumped table is inserted in BACKUP_DUMPED's order (the foreign keys' order), and the
//          derived tables are REBUILT, not loaded: the triggers boot.sql carries fire as each row lands (the same statements
//          migrate-040/041/042/043/046/050/054/056 run in their backfills), then RESTORE_REBUILD_SQL (migrate-054's backfill,
//          verbatim) recomputes the stale marks once the grades and k_node_stale are in.
//       3. the people: the dump holds no credential, so every person comes back with no key ('restored:<id>', which no key
//          hashes to); the restored OWNER (the first active owner of the dump, or --owner <id>) takes the fresh org's own
//          minted key and sign-in address, so <state root>/<slug>/credentials.env opens it. Everyone else is handed a new key
//          on Control (Reset passphrase).
//       4. the bodies: --r2-from <the source org's dir> copies its local R2 (persist/v3/r2) beside the fresh D1, as the live
//          bucket would be (render and artifact bodies are never in the dump: they stay in R2 by their hash).
//       5. up on --port, then the verification: every dumped table's row count and content hash (sha256 over its rows,
//          canonical JSON, order-free) re-dumped from the RESTORED org's own door equal the dump's; and with --source-url,
//          through both doors: read counts each kind of each active project equal, each project's meter (missing)
//          equal, the Map's lights equal (GET /map: every node's light and stale mark), search finds the same refs for
//          three words a project, and a sample of render bodies is byte for byte the source's; with --source-db (a local
//          source), the derived tables themselves equal the source's (k_find aside: its rowids are the tables' own).
//       The restored worker is stopped at the end unless --keep. Exit 0 only when every check passed.
//
// LOCAL ONLY: this tool restores into a local worker it boots, never over live. A whole-database restore over live is gone (the
// sprint-7 review, 7.6: its recipe seeded a fresh D1 with tools/day0-seed.sh, deleted with tools/validate-seed.py): the WHOLE
// database to a moment is D1 Time Travel's, a platform incident tool (`wrangler d1 time-travel restore`, the bookmark
// tools/migrate.sh prints), and ONE org's undo is tools/org-undo.mjs (export, restore beside it, verify, delete). No statement
// of restore.sql passes D1's 100 KB limit: a row bigger than that is inserted with its big values set from pieces (the report
// counts them as oversize).
//
// AN OLDER DUMP (sprint 6 review, finding 15): a dump taken by the sprint-5 code carries no `org` on the org-wide tables' rows
// (they predate migrate-067), and one the sprint-5 code took AFTER migrate-067 carries projects.org and projects.slug, which
// are GENERATED from the key now (an INSERT naming them fails). The load shims both (shimDump): a row of a table the dump
// places by its own org column (src/backup.js orgOf: people, artifacts, transmission, approval_audit, events, loops) with no
// `org` key takes org 1 — the only org that ever wrote before sprint 6 — and a projects row loses its generated org and slug
// (each first checked against what its key generates: a row whose org or slug disagrees with its key refuses the load). A
// table the dump holds that this code no longer dumps (transmission_refs_meta, migrate-069) is not loaded, and is named. The
// verification stays BYTE-HONEST: the re-dump, with the shim UNDONE (every org the shim wrote must read back as exactly 1, then
// it is dropped), is compared with the dump's own rows, table by table (count and content hash) — never with the shimmed copy;
// the projects rows compare without the two generated keys, which were checked against the key at the load.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, statSync, readdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BACKUP_FORMAT, BACKUP_DUMPED, BACKUP_DERIVED, PEOPLE_COLS, RESTORE_REBUILD_SQL, orgOf } from "../src/backup.js";
import { HOME_ORG } from "../src/data.js";
import { orgOfKey } from "../src/project.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, "..");
export const STATEMENT_MAX = 90_000;   // bytes (UTF-8), under D1's 100 KB statement limit
export const ROWS_PER_INSERT = 100;

// ---- pure parts (tools/backup-selftest.mjs drives them) ----
// canon(v) -> canonical JSON (keys sorted), so a row hashes the same whatever order its columns came in
export const canon = (v) => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v ?? null);
// tableHash(rows) -> sha256 over the rows' canonical lines, sorted (order-free: a restore's rowids are its own)
export function tableHash(rows) {
  const h = createHash("sha256");
  for (const line of (rows || []).map(canon).sort()) h.update(line + "\n");
  return h.digest("hex");
}
export const sqlValue = (v) => v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : typeof v === "boolean" ? (v ? "1" : "0") : "'" + String(v).replace(/'/g, "''") + "'";
const qid = (s) => `"${String(s).replace(/"/g, '""')}"`;
// ownerOf(dump, id?) -> the person the restored org's own key opens: the named id, else the first active owner (never a suite seat)
export function ownerOf(dump, id = null) {
  const people = (dump.tables && dump.tables.people) || [];
  if (id) return people.find((p) => p.id === id) || null;
  return people.filter((p) => p.role === "owner" && Number(p.active) === 1 && !String(p.id).startsWith("eval-fixed-"))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0] || null;
}
// ---- an older dump (finding 15): the shim and its undoing ----
// the dumped tables a row of which is the org's by its own org column (src/backup.js orgOf: one source), projects aside (its org is
// generated from the key)
export const ORG_STAMPED = BACKUP_DUMPED.map((t) => t.table).filter((t) => t !== "projects" && /^\+?org = \{org\}$/.test(orgOf(t)));
export const PROJECT_GENERATED = ["org", "slug"];
// shimDump(dump) -> { dump: the rows as loaded, shim: { org: { <table>: rows that took org 1 }, generated: projects rows whose
// generated keys were dropped, left: { <table>: rows of a table this code does not dump } } } — the dump itself is never changed;
// throws when a projects row's org or slug disagrees with its key
export function shimDump(dump) {
  const tables = {}, shim = { org: {}, generated: 0, left: {} };
  const dumped = new Set(BACKUP_DUMPED.map((t) => t.table));
  for (const [t, rows] of Object.entries((dump && dump.tables) || {})) {
    if (!dumped.has(t)) { if ((rows || []).length) shim.left[t] = rows.length; continue; }
    tables[t] = (rows || []).map((r) => {
      if (ORG_STAMPED.includes(t) && !("org" in r)) { shim.org[t] = (shim.org[t] || 0) + 1; return { ...r, org: HOME_ORG }; }
      if (t === "projects" && PROJECT_GENERATED.some((c) => c in r)) {
        const k = orgOfKey(r.key);
        if (!k || ("org" in r && r.org !== k.org) || ("slug" in r && r.slug !== k.slug)) throw new Error(`projects row ${r.key}: its org/slug (${r.org}/${r.slug}) are not what its key generates`);
        shim.generated++;
        const x = { ...r }; for (const c of PROJECT_GENERATED) delete x[c];
        return x;
      }
      return r;
    });
  }
  return { dump: { ...dump, tables }, shim };
}
// compareDump(dump, again, shim) -> [<table> <n>→<m> (content differs)]: the re-dump `again`, the shim undone (every org it wrote
// must read back as HOME_ORG, then is dropped), against the dump's OWN rows; projects without their generated keys on both sides
export function compareDump(dump, again, shim = { org: {}, generated: 0 }) {
  const bad = [];
  for (const t of BACKUP_DUMPED.map((x) => x.table)) {
    let want = (dump.tables && dump.tables[t]) || [], got = (again.tables && again.tables[t]) || [];
    if (shim.org[t]) {
      const stray = got.filter((r) => r.org !== HOME_ORG).length;
      if (stray) { bad.push(`${t}: ${stray} row(s) with an org the shim did not write`); continue; }
      const had = new Set(want.filter((r) => "org" in r).map(canon));
      // a row the dump held WITH its org stays as it is; one it held without takes its org back off
      got = got.map((r) => { if (had.has(canon(r))) return r; const x = { ...r }; delete x.org; return x; });
    }
    if (t === "projects" && shim.generated) {
      const strip = (r) => { const x = { ...r }; for (const c of PROJECT_GENERATED) delete x[c]; return x; };
      want = want.map(strip); got = got.map(strip);
    }
    if (want.length !== got.length || tableHash(want) !== tableHash(got)) bad.push(`${t} ${want.length}→${got.length}${want.length === got.length ? " (content differs)" : ""}`);
  }
  return bad;
}

// restoreSql(dump, { owner }) -> { sql, statements, oversize, shim } — the load: the seed's owner set aside, every dumped table in
// order (an older dump shimmed: shimDump), the owner bound to the fresh key, the stale marks recomputed
export const CHUNK_MAX = 60_000;   // bytes of one piece of a value too big for one statement
// pieces(str) -> the string cut into pieces whose escaped SQL literal stays under CHUNK_MAX bytes (never inside a character)
export function pieces(str) {
  const out = []; let cur = "", n = 0;
  for (const ch of String(str)) {
    const b = Buffer.byteLength(ch) * (ch === "'" ? 2 : 1);
    if (n + b > CHUNK_MAX) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out;
}
// restoreSql(dump, { owner }) -> { sql, statements, oversize } — the load: the seed's owner set aside, every dumped table in
// order, the owner bound to the fresh key, the stale marks recomputed. A row too big for one statement (D1 refuses one over
// 100 KB) is inserted with its big values as 'null' and then set from pieces kept in a table of the restore's own
// (_restore_big), in ONE small UPDATE on the row just inserted, so every CHECK sees the whole value.
export function restoreSql(given, o = {}) {
  if (!given || given.format !== BACKUP_FORMAT) throw new Error(`not a ${BACKUP_FORMAT} dump`);
  const { dump, shim } = shimDump(given);
  const owner = o.owner || ownerOf(dump);
  if (!owner) throw new Error("the dump holds no active owner to bind the fresh key to (name one with --owner)");
  const out = [
    `-- tools/restore-local.mjs: ${BACKUP_FORMAT}, taken ${dump.at || "?"} from ${(dump.source && dump.source.url) || "?"}; owner ${owner.id}`,
    "CREATE TABLE IF NOT EXISTS _restore_seed (key_hash TEXT, pass_hash TEXT, pass_salt TEXT, email TEXT);",
    "DELETE FROM _restore_seed;",
    "INSERT INTO _restore_seed SELECT key_hash, pass_hash, pass_salt, email FROM people WHERE role = 'owner' ORDER BY created_at LIMIT 1;",
    "CREATE TABLE IF NOT EXISTS _restore_big (c TEXT NOT NULL, v TEXT NOT NULL);",
    "DELETE FROM project_seats;",
    // the seed's org row names its owner (created_by, updated_by): it goes before the people it names (D1 enforces the
    // foreign keys), and the dump's own org row is loaded below
    "DELETE FROM org;",
    "DELETE FROM people;",
  ];
  let statements = 0, oversize = 0;
  for (const t of BACKUP_DUMPED) {
    const rows = (dump.tables && dump.tables[t.table]) || [];
    if (!rows.length) continue;
    const cols = t.table === "people" ? [...PEOPLE_COLS.filter((c) => c in rows[0]), "key_hash"] : Object.keys(rows[0]);
    const head = `INSERT INTO ${qid(t.table)} (${cols.map(qid).join(", ")}) VALUES `;
    const valueOf = (r, c) => (t.table === "people" && c === "key_hash" ? "restored:" + r.id : r[c]);
    let batch = [], len = head.length;
    const flush = () => { if (batch.length) { out.push(head + batch.join(", ") + ";"); statements++; batch = []; len = head.length; } };
    for (const r of rows) {
      const v = "(" + cols.map((c) => sqlValue(valueOf(r, c))).join(", ") + ")";
      const vb = Buffer.byteLength(v);
      if (head.length + vb > STATEMENT_MAX) {
        // too big for one statement: the big values from pieces, on the row just inserted (its rowid)
        oversize++;
        flush();
        const big = cols.filter((c) => typeof valueOf(r, c) === "string" && Buffer.byteLength(sqlValue(valueOf(r, c))) > CHUNK_MAX / 4);
        out.push("DELETE FROM _restore_big;");
        for (const c of big) for (const p of pieces(valueOf(r, c))) out.push(`INSERT INTO _restore_big (c, v) VALUES (${sqlValue(c)}, ${sqlValue(p)});`);
        out.push(head + "(" + cols.map((c) => (big.includes(c) ? "'null'" : sqlValue(valueOf(r, c)))).join(", ") + ");");
        out.push(`UPDATE ${qid(t.table)} SET ${big.map((c) => `${qid(c)} = (SELECT group_concat(v, '') FROM (SELECT v FROM _restore_big WHERE c = ${sqlValue(c)} ORDER BY rowid))`).join(", ")} WHERE rowid = last_insert_rowid();`);
        statements += 2;
        continue;
      }
      if (batch.length && (batch.length >= ROWS_PER_INSERT || len + vb + 2 > STATEMENT_MAX)) flush();
      batch.push(v); len += vb + 2;
    }
    flush();
  }
  out.push(`UPDATE people SET key_hash = (SELECT key_hash FROM _restore_seed), pass_hash = (SELECT pass_hash FROM _restore_seed), pass_salt = (SELECT pass_salt FROM _restore_seed), email = (SELECT email FROM _restore_seed) WHERE id = ${sqlValue(owner.id)};`);
  // sprint 8 (8.2f, main's ruling): the dump's org row carries its plan (live's free or team); a LOCAL restore rides the local-only
  // plan its seed wrote (tools/fixtures/local-plan.sql), as every org the harness makes does — where no such row exists, nothing moves
  out.push("UPDATE org SET plan = 'local' WHERE EXISTS (SELECT 1 FROM plan_limits WHERE plan = 'local');");
  out.push("DROP TABLE _restore_seed;");
  out.push("DROP TABLE _restore_big;");
  out.push(...RESTORE_REBUILD_SQL);
  return { sql: out.join("\n") + "\n", statements, oversize, owner: owner.id, shim };
}
// summary(dump) -> per table {rows, hash, bytes}, and per project {rows, bytes} (a row's project: its project or project_key column)
export function summary(dump) {
  const tables = {}, projects = {};
  for (const t of BACKUP_DUMPED) {
    const rows = (dump.tables && dump.tables[t.table]) || [];
    const bytes = rows.reduce((n, r) => n + JSON.stringify(r).length, 0);
    tables[t.table] = { rows: rows.length, hash: tableHash(rows), bytes };
    for (const r of rows) {
      const p = r.project ?? r.project_key ?? (t.table === "projects" ? r.key : null);
      if (p == null) continue;
      const x = projects[p] || (projects[p] = { rows: 0, bytes: 0 });
      x.rows++; x.bytes += JSON.stringify(r).length;
    }
  }
  return { tables, projects };
}

// ---- the door ----
export function keyFromCreds(file) {
  const t = readFileSync(file, "utf8");
  return (t.match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1] || (/^[0-9a-f]{40}$/.test(t.trim()) ? t.trim() : null);
}
const rowsOf = (h) => { const m = /d1-rows;dur=[\d.]+;desc="read=(\d+) written=(\d+) stmts=(\d+)/.exec(h || ""); return m ? { read: +m[1], written: +m[2], stmts: +m[3] } : null; };
function door(base, key) {
  const H = { authorization: "Bearer " + key, "x-count-rows": "1", accept: "application/json" };
  const meter = { requests: 0, read: 0, written: 0 };
  const note = (r) => { meter.requests++; const x = rowsOf(r.headers.get("server-timing")); if (x) { meter.read += x.read; meter.written += x.written; } return x; };
  let id = 0;
  return {
    meter,
    async post(path) { const r = await fetch(base + path, { method: "POST", headers: H }); const rows = note(r); return { status: r.status, json: await r.json().catch(() => null), rows }; },
    async get(path, accept = "application/json") { const r = await fetch(base + path, { headers: { ...H, accept } }); note(r); const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString("utf8")); } catch { json = null; } return { status: r.status, json, buf }; },
    async tool(name, args) {
      const r = await fetch(base + "/mcp", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
      note(r);
      const j = await r.json().catch(() => null);
      const t = j && j.result && j.result.content && j.result.content[0] && j.result.content[0].text;
      let out; try { out = JSON.parse(t); } catch { out = t; }
      return { ok: !!(j && j.result && !j.result.isError), out };
    },
  };
}
// dumpVia(base, key) -> the dump, walked page by page through POST /backup-dump?page=
export async function dumpVia(base, key, o = {}) {
  const d = door(base, key);
  const tables = {};
  let cursor = "", rule = null, at = null, pages = 0, worst = 0;
  const t0 = Date.now();
  while (cursor != null) {
    const r = await d.post(`/backup-dump?page=${encodeURIComponent(cursor)}&rows=${o.rows || 1000}`);
    if (r.status !== 200 || !r.json || r.json.format !== BACKUP_FORMAT) throw new Error(`POST /backup-dump?page=${cursor}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    pages++;
    if (r.rows) worst = Math.max(worst, r.rows.read);
    if (r.json.rule) { rule = r.json.rule; at = r.json.at; }
    if (r.json.table) (tables[r.json.table] = tables[r.json.table] || []).push(...r.json.rows);
    cursor = r.json.next;
  }
  return { format: BACKUP_FORMAT, at, rule, source: { url: base, slug: o.slug || null }, tables, cost: { pages, requests: d.meter.requests, read: d.meter.read, written: d.meter.written, worstPage: worst, ms: Date.now() - t0 } };
}

// ---- the CLI ----
const sh = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: ENGINE, env: { ...process.env, WRANGLER_SEND_METRICS: "false", ...env }, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }).toString();
const jsonc = (p) => JSON.parse(readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, ""));   // lib-r-local.sh rl_config_field's own reading
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const KINDS = { aim: "k_aim", gtm: "k_gtm", goal: "k_goals", card_kind: "k_card_kinds", question: "k_questions", node: "k_nodes", edge: "k_edges", check: "k_checks", card: "k_cards", doc: "k_docs", style: "k_styles", render: "k_renders" };

async function readAll(d, project, kind) {
  const items = []; let cursor = null;
  for (let p = 0; p < 1000; p++) {
    const r = await d.tool("read", { project, kind, limit: 100, ...(cursor ? { after: cursor } : {}) });
    if (!r.ok) throw new Error(`read ${project}/${kind}: ${JSON.stringify(r.out).slice(0, 160)}`);
    if (Array.isArray(r.out.items)) items.push(...r.out.items); else if (r.out.item) items.push(r.out.item);
    if (!r.out.next || r.out.next === cursor) break;
    cursor = r.out.next;
  }
  return items;
}
// the Map's lights of a project, through GET /map (JSON): every node as the Map draws it (its ref, type, name, light, goal
// count, check count, status), in ref order
async function lightsOf(d, project) {
  const r = await d.get(`/map?project=${encodeURIComponent(project)}`);
  return ((r.json && r.json.nodes) || []).map((n) => ({ ...n })).sort((a, b) => String(a.r).localeCompare(String(b.r)));
}
const wordsFor = (dump, project) => [...new Set(((dump.tables.k_goals || []).filter((g) => g.project === project).map((g) => String(g.title || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5).sort((a, b) => b.length - a.length)[0]).filter(Boolean)))].slice(0, 3);

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
  const has = (n) => argv.includes(n);
  const cmd = argv[0];
  if (cmd === "dump") {
    const url = String(flag("--url") || "").replace(/\/+$/, ""), creds = flag("--creds"), out = flag("--out");
    if (!url || !creds || !out) { console.error("usage: node tools/restore-local.mjs dump --url <org> --creds <credentials.env> --out <dump.json> [--slug <org>]"); process.exit(2); }
    const key = keyFromCreds(creds);
    if (!key) { console.error(`no owner key in ${creds}`); process.exit(2); }
    const dump = await dumpVia(url, key, { slug: flag("--slug") });
    const s = summary(dump);
    const body = JSON.stringify(dump);
    writeFileSync(out, body);
    console.log(`dump · ${url} · ${dump.cost.pages} pages in ${(dump.cost.ms / 1000).toFixed(1)} s · ${kb(body.length)} · rows read ${dump.cost.read} (worst page ${dump.cost.worstPage}), written ${dump.cost.written}`);
    for (const [t, x] of Object.entries(s.tables)) if (x.rows) console.log(`  ${t.padEnd(24)} ${String(x.rows).padStart(7)} rows  ${kb(x.bytes).padStart(9)}`);
    for (const [p, x] of Object.entries(s.projects)) console.log(`  project ${p.padEnd(16)} ${String(x.rows).padStart(7)} rows  ${kb(x.bytes).padStart(9)}`);
    console.log(`→ ${out}`);
    return;
  }
  if (cmd !== "restore" || !argv[1]) { console.error("usage: node tools/restore-local.mjs {dump|restore} … (see the header)"); process.exit(2); }
  const dumpFile = argv[1];
  const dump = JSON.parse(readFileSync(dumpFile, "utf8"));
  const root = resolve(flag("--into") || "");
  if (!flag("--into")) { console.error("restore needs --into <a state root> (the fresh org goes under it)"); process.exit(2); }
  const slug = flag("--slug") || (dump.source && dump.source.slug);
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.error("restore needs --slug <org> (the dump names none)"); process.exit(2); }
  const port = flag("--port", "8861");
  const orgDir = join(root, slug);
  if (existsSync(orgDir)) { console.error(`✗ ${orgDir} exists: a restore goes into an EMPTY org (remove it, or name another --into)`); process.exit(2); }
  const report = { dump: dumpFile, into: orgDir, slug, port: Number(port), steps: [], checks: [], ok: true };
  const T = (name, t0) => { const ms = Date.now() - t0; report.steps.push({ name, ms }); console.log(`· ${name} (${(ms / 1000).toFixed(1)} s)`); };
  const check = (ok, what, detail = "") => { report.checks.push({ ok, what, detail }); if (!ok) report.ok = false; console.log(`  ${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`); };
  const env = { R_LOCAL_STATE_ROOT: root };
  const tAll = Date.now();
  mkdirSync(root, { recursive: true });
  let up = false;
  try {
    let t0 = Date.now();
    sh("sh", ["tools/r-local.sh", "seed", slug], env);
    T(`a fresh org: ${slug} seeded from boot.sql under ${root}`, t0);
    t0 = Date.now();
    const built = restoreSql(dump, { owner: flag("--owner") ? ownerOf(dump, flag("--owner")) : null });
    const sqlFile = join(root, `${slug}.restore.sql`);
    writeFileSync(sqlFile, built.sql);
    report.sql = { file: sqlFile, bytes: built.sql.length, statements: built.statements, oversize: built.oversize, owner: built.owner };
    report.shim = built.shim;
    const shimmed = Object.values(built.shim.org).reduce((a, b) => a + b, 0);
    if (shimmed || built.shim.generated || Object.keys(built.shim.left).length) console.log(`· an older dump: ${shimmed} row(s) took org 1 (${Object.entries(built.shim.org).map(([t, n]) => `${t} ${n}`).join(", ") || "none"}); ${built.shim.generated} projects row(s) lost their generated org/slug (each checked against its key); not loaded: ${Object.entries(built.shim.left).map(([t, n]) => `${t} ${n}`).join(", ") || "none"}`);
    const cfgPath = join(orgDir, "wrangler.local.jsonc");
    const cfg = jsonc(cfgPath);
    const db = cfg.d1_databases[0].database_name;
    sh("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfgPath, "--local", "--persist-to", join(orgDir, "persist"), "--file", sqlFile]);
    T(`loaded: ${built.statements} insert statements, ${kb(built.sql.length)} of SQL (rows over the statement limit: ${built.oversize}); the derived tables rebuilt by the triggers and migrate-054's backfill`, t0);
    const r2From = flag("--r2-from");
    if (r2From) {
      const src = join(resolve(r2From), "persist", "v3", "r2"), dst = join(orgDir, "persist", "v3", "r2");
      rmSync(dst, { recursive: true, force: true });
      cpSync(src, dst, { recursive: true });
      report.r2 = { from: src };
      console.log(`· the bucket: ${src} copied beside the fresh D1 (the same bucket, as live keeps it)`);
    }
    t0 = Date.now();
    sh("sh", ["tools/r-local.sh", "up", slug, "--port", String(port)], env);
    up = true;
    T(`up on http://127.0.0.1:${port}`, t0);
    const base = `http://127.0.0.1:${port}`;
    const key = keyFromCreds(join(orgDir, "credentials.env"));

    // 1 · every dumped table, re-dumped through the restored org's own door: counts and content hashes
    t0 = Date.now();
    const again = await dumpVia(base, key, { slug });
    const a = summary(dump).tables, b = summary(again).tables;
    const badRows = compareDump(dump, again, built.shim);
    const bad = Object.keys(a).filter((t) => badRows.some((x) => x.startsWith(`${t} `) || x.startsWith(`${t}:`)));
    report.tables = Object.fromEntries(Object.keys(a).map((t) => [t, { dumped: a[t].rows, restored: b[t].rows, same: !bad.includes(t) }]));
    check(!badRows.length, `every dumped table back: ${Object.keys(a).length} tables, ${Object.values(a).reduce((n, x) => n + x.rows, 0)} rows, the count and the content hash of each equal the dump's${built.shim.generated || Object.keys(built.shim.org).length ? " (the re-dump with the shim undone, against the dump's own rows)" : ""}`,
      badRows.join(", "));
    if (bad.length) {
      for (const t of bad) {
        const left = new Set((dump.tables[t] || []).map(canon)), right = new Set((again.tables[t] || []).map(canon));
        const onlyL = [...left].filter((x) => !right.has(x)).slice(0, 2), onlyR = [...right].filter((x) => !left.has(x)).slice(0, 2);
        report.diff = report.diff || {}; report.diff[t] = { dumpedOnly: onlyL, restoredOnly: onlyR };
      }
    }
    T("re-dumped and compared", t0);

    // 2 · through both doors (--source-url): knowledge per kind, the meter, the lights, search, render bodies
    const srcUrl = String(flag("--source-url") || "").replace(/\/+$/, "");
    if (srcUrl) {
      t0 = Date.now();
      const S = door(srcUrl, keyFromCreds(flag("--source-creds"))), R = door(base, key);
      const active = (dump.tables.projects || []).filter((p) => Number(p.active) === 1).map((p) => p.key);
      const kindBad = [], meterBad = [], lightBad = [], searchBad = [];
      let kindsChecked = 0, searches = 0, nodes = 0;
      for (const p of active) {
        for (const [kind, table] of Object.entries(KINDS)) {
          const want = (dump.tables[table] || []).filter((r) => r.project === p).length;
          const got = (await readAll(R, p, kind)).length;
          kindsChecked++;
          if (got !== want) kindBad.push(`${p}/${kind} dumped ${want}, read ${got}`);
        }
        const [ms, mr] = [await S.tool("missing", { project: p }), await R.tool("missing", { project: p })];
        const m = (x) => x.ok && x.out && x.out.meter ? canon({ done: x.out.meter.done, total: x.out.meter.total, pct: x.out.meter.pct }) : "none";
        if (m(ms) !== m(mr)) meterBad.push(`${p}: ${m(ms)} vs ${m(mr)}`);
        report.meters = report.meters || {}; report.meters[p] = m(mr);
        const [ls, lr] = [await lightsOf(S, p), await lightsOf(R, p)];
        nodes += lr.length;
        if (canon(ls) !== canon(lr)) lightBad.push(`${p}: ${ls.length} vs ${lr.length} nodes, ${ls.filter((x, i) => canon(x) !== canon(lr[i] || {})).length} differ`);
        for (const w of wordsFor(dump, p)) {
          searches++;
          const refs = async (D) => { const r = await D.tool("search", { project: p, q: w }); return ((r.out && r.out.groups) || []).flatMap((g) => (g.hits || []).map((h) => h.ref)).sort(); };
          const [x, y] = [await refs(S), await refs(R)];
          if (canon(x) !== canon(y)) searchBad.push(`${p} "${w}": ${x.length} vs ${y.length}`);
        }
      }
      check(!kindBad.length, `read through the restored door: ${kindsChecked} (project, kind) pairs over ${active.length} active projects, stored == dumped`, kindBad.join("; "));
      check(!meterBad.length, `each project's meter (holes) equals the source's: ${Object.entries(report.meters || {}).map(([p, m]) => `${p} ${m}`).join(" · ")}`, meterBad.join("; "));
      check(!lightBad.length, `the Map's lights equal the source's: ${nodes} nodes`, lightBad.join("; "));
      check(!searchBad.length, `search finds what it found: ${searches} searches`, searchBad.join("; "));
      if (r2From) {
        const hashes = [...new Set((dump.tables.k_renders || []).filter((r) => active.includes(r.project)).map((r) => `${r.project}|${r.hash}`))];
        const pick = hashes.filter((_, i) => i % Math.max(1, Math.floor(hashes.length / 20)) === 0).slice(0, 20);
        const off = [];
        for (const ph of pick) {
          const [p, h] = ph.split("|");
          const [x, y] = [await S.get(`/render/${h}?project=${encodeURIComponent(p)}`, "*/*"), await R.get(`/render/${h}?project=${encodeURIComponent(p)}`, "*/*")];
          if (x.status !== y.status || !x.buf.equals(y.buf)) off.push(`${p} ${h.slice(0, 12)}: ${x.status}/${y.status}`);
        }
        check(!off.length, `render bodies: ${pick.length} of ${hashes.length} sampled, byte for byte the source's`, off.join("; "));
      } else check(true, "render bodies: not checked (no --r2-from): they stay in R2 by their hash, beside the same bucket on live");
      report.doorCost = { source: S.meter, restored: R.meter };
      T("verified through both doors", t0);
    }

    // 3 · the derived tables themselves (--source-db: a local source's D1 file)
    const srcDb = flag("--source-db");
    if (srcDb) {
      const { DatabaseSync } = await import("node:sqlite");
      const dstDb = (() => { const d = join(orgDir, "persist", "v3", "d1", "miniflare-D1DatabaseObject"); return join(d, readdirSync(d).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite").sort((x, y) => statSync(join(d, y)).size - statSync(join(d, x)).size)[0]); })();
      const S = new DatabaseSync(srcDb, { readOnly: true }), R = new DatabaseSync(dstDb, { readOnly: true });
      const off = [];
      const derived = Object.keys(BACKUP_DERIVED).filter((t) => !t.startsWith("k_find"));
      for (const t of derived) {
        const rows = (D) => D.prepare(`SELECT * FROM ${qid(t)}`).all().map((r) => { const x = { ...r }; delete x.updated_at; return x; });
        const [x, y] = [rows(S), rows(R)];
        if (tableHash(x) !== tableHash(y)) off.push(`${t} ${x.length}→${y.length}`);
      }
      const fts = (D) => D.prepare("SELECT COUNT(*) AS n FROM k_find_idx").get().n;
      check(!off.length, `the derived tables rebuilt equal the source's (${derived.length} tables, updated_at aside)`, off.join(", "));
      report.ftsIdxRows = { source: fts(S), restored: fts(R) };
      S.close(); R.close();
    }
  } catch (e) {
    check(false, "the restore ran to the end", String((e && e.stderr && e.stderr.toString().slice(-800)) || (e && e.message) || e));
  } finally {
    if (up && !has("--keep")) { try { sh("sh", ["tools/r-local.sh", "down", slug], env); console.log(`· ${slug} stopped (its state stays at ${orgDir})`); } catch { /* already down */ } }
    report.ms = Date.now() - tAll;
    const rp = flag("--report") || join(root, `${slug}.restore-report.json`);
    writeFileSync(rp, JSON.stringify(report, null, 1));
    console.log(`${report.ok ? "✓" : "✗"} restore of ${dumpFile} into ${orgDir}: ${report.checks.filter((c) => c.ok).length} of ${report.checks.length} checks, ${(report.ms / 1000).toFixed(1)} s · report ${rp}`);
    process.exitCode = report.ok ? 0 : 1;
  }
}

// run directly (REAL paths: a symlinked checkout or temp dir must still run the CLI)
const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) await main();
