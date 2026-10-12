// tools/backup-selftest.mjs — the backup and the restore (sprint 3, S3b; src/backup.js, tools/restore-local.mjs), over REAL
// SQLite databases built from boot.sql (node:sqlite, wrapped as a D1 binding: tools/fixtures/home-d1.mjs d1Of). Cases:
//   THE RULE  · every table boot.sql creates is dumped, derived or never-dumped (or SQLite's own), exactly once; no list names
//               a table boot.sql lacks — a migration's new table fails here until it is placed
//             · people: every column is dumped (PEOPLE_COLS) or withheld (PEOPLE_WITHHELD); the withheld are the credentials
//             · the dumped list is a load order the foreign keys accept (a row's targets are dumped earlier, or itself; a
//               withheld column's key is never loaded: people.account_id, sprint 7)
//   THE PAGES · walking backupPage from "" to null with 3 rows a page returns every row of every dumped table exactly once
//               (rowid tables and the WITHOUT ROWID k_node_stale), each page ONE statement reading at most rows+1 rows; the
//               people rows carry no key_hash, pass_hash, pass_salt or email; no never-dumped or derived table appears;
//               the first page carries the rule; a bad cursor is refused
//   EVAL      · backupEval reads at most 50 rows a table and writes its own key, never the real backup's
//   R2        · backupToR2 writes one object per page and the manifest, the counts equal the tables', every key under the
//               org's own prefix (o1/backups/d1/…, sprint 6, 6.4: src/storage.js)
//   ONE ORG   · (sprint 6, 6.3: an owner owns one org) the same world with a SECOND org's rows in every kind of table: org 1's
//               dump is exactly the dump of the world alone (so the RESTORE below round-trips org 1 on a two-org database), and
//               org 2's holds every org-2 row and nothing else (the org of each row read off the row itself: its org column, its
//               project's key by src/project.js orgOfKey, its contribution's org); (6.4) backupToR2 and backupEval as org 2 write
//               under o2/ alone, into the same bucket as org 1's backup of the same day, which stays byte for byte as it was
//   RECORD    · (G2 item 9) every nightly run leaves ONE events row (kind backup, the engine's own): a complete one and a failed
//               one with its reason; lastBackup answers the newest in ONE indexed read (idx_events_person_kind); the real cron
//               (src/index.js scheduled → src/cron.js runCron) records a backup whose R2 write throws as failed, with its reason
//   THE CRON  · (sprint 6, 6.4: the cron loops over orgs) one run backs up EVERY org of the org table under its own prefix and
//               records each in its own org; the window is every org when they fit the budget, else the budget in id order,
//               moving with each run so every org comes round
//   RESTORE   · a world with every kind of row (two projects, one archived; people incl. a removed one and a suite seat;
//               knowledge of every kind; renders; versions and snapshots; a ledger with a parent chain, a pick-up, a ruling;
//               grades, a change after a grade (a stale mark), a regrade; tokens, previews and sign-in attempts) is dumped
//               page by page, restoreSql is applied to a FRESH boot.sql database holding only a seeded owner, and then:
//               every dumped table's count and content hash equal the source's; every derived table equals the source's
//               (updated_at aside; the search index by what it finds); the restored owner holds the seed's key and every
//               other person holds no key; tokens, previews and sign-in attempts are not there.
//   OLDER DUMP · (sprint 6 review, finding 15) the same dump as the sprint-5 code took it — no `org` on the org-wide tables' rows
//               (before migrate-067), and as it took it after migrate-067 — projects rows carrying the generated org and slug,
//               and a transmission_refs_meta row: each restores on the new boot.sql (org 1 written in, the generated keys
//               dropped, the dropped table named and not loaded), and the re-dump with the shim UNDONE equals the dump's own rows;
//               a re-dump with a row of another org (not the shim's) is caught; a projects row whose slug disagrees with its key
//               refuses the load
// Exit 1 on any fail. Run in the gate.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { asOrg, org1 } from "./fixtures/org.mjs";
import { orgOfKey } from "../src/project.js";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const { d1Of } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "home-d1.mjs")).href);
const B = await import(pathToFileURL(join(ENGINE, "src", "backup.js")).href);
const R = await import(pathToFileURL(join(ENGINE, "tools", "restore-local.mjs")).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const fresh = () => { const d = new DatabaseSync(":memory:"); d.exec("PRAGMA foreign_keys = ON"); d.exec(BOOT); return d; };

// ---- THE RULE ----
{
  const d = fresh();
  const tables = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
  const dumped = B.BACKUP_DUMPED.map((t) => t.table), derived = Object.keys(B.BACKUP_DERIVED), never = Object.keys(B.BACKUP_NEVER);
  const placed = (t) => [dumped.includes(t), derived.includes(t), never.includes(t), B.ENGINE_OWN.test(t)].filter(Boolean).length;
  const unplaced = tables.filter((t) => placed(t) !== 1);
  ok(!unplaced.length, `every one of boot.sql's ${tables.length} tables is in exactly one list (dumped ${dumped.length}, derived ${derived.length}, never ${never.length}, SQLite's own ${tables.filter((t) => B.ENGINE_OWN.test(t)).length})${unplaced.length ? ` — not placed once: ${unplaced.join(", ")}` : ""}`);
  const ghosts = [...dumped, ...derived, ...never].filter((t) => !tables.includes(t));
  ok(!ghosts.length, `no list names a table boot.sql lacks${ghosts.length ? `: ${ghosts.join(", ")}` : ""}`);
  const cols = d.prepare("PRAGMA table_info(people)").all().map((c) => c.name);
  const loose = cols.filter((c) => !B.PEOPLE_COLS.includes(c) && !(c in B.PEOPLE_WITHHELD));
  ok(!loose.length && B.PEOPLE_COLS.every((c) => cols.includes(c)), `people: each of its ${cols.length} columns is dumped or withheld${loose.length ? ` — unplaced: ${loose.join(", ")}` : ""}`);
  ok(["key_hash", "pass_hash", "pass_salt", "email", "account_id"].every((c) => c in B.PEOPLE_WITHHELD && !B.PEOPLE_COLS.includes(c)), "people's key_hash, pass_hash, pass_salt, email and account_id are withheld, never dumped");
  ok(["tokens", "invites", "login_attempts", "accounts"].every((t) => never.includes(t)), "tokens, invites, login_attempts and accounts are never dumped");
  const late = [];
  dumped.forEach((t, i) => { for (const fk of d.prepare(`PRAGMA foreign_key_list("${t}")`).all()) if (t === "people" && fk.from in B.PEOPLE_WITHHELD) continue; else if (fk.table !== t && dumped.indexOf(fk.table) > i) late.push(`${t} -> ${fk.table}`); else if (fk.table !== t && !dumped.includes(fk.table)) late.push(`${t} -> ${fk.table} (not dumped)`); });
  ok(!late.length, `the dumped list is a load order the foreign keys accept${late.length ? ` — ${late.join(", ")}` : ""}`);
}

// ---- a world with every kind of row ----
const T0 = Date.parse("2026-09-01T10:00:00.000Z");
const at = (h) => new Date(T0 + h * 3600e3).toISOString();
function world() {
  const d = fresh();
  const P = d.prepare("INSERT INTO people (id,name,email,role,key_hash,pass_hash,pass_salt,active,created_at,title,hats,access_hats,role_label,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  P.run("p-own", "Owen", "owen@x.test", "owner", "hash-own", "ph", "salt", 1, at(0), "Founder", '["management"]', '["management"]', null);
  P.run("p-mem", "Mia", "mia@x.test", "member", "hash-mem", null, null, 1, at(1), null, '["engineering"]', '["engineering"]', "internal-eng");
  P.run("p-par", "Pat", "pat@x.test", "partner", "hash-par", null, null, 1, at(2), null, null, "[]", null);
  P.run("p-old", "Ola", "ola@x.test", "member", "hash-old", null, null, 0, at(3), null, null, null, null);
  P.run("eval-fixed-seat", "Eval Seat", "eval@x.test", "member", "hash-eval", null, null, 1, at(3), null, null, null, null);
  d.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'${at(0)}'),('beta','Beta',0,'${at(0)}')`);
  d.exec(`INSERT INTO org (id,name,brand,home,created_by,created_at,updated_by,updated_at) VALUES (1,'Northwind','{"org":"Northwind"}','alpha','p-own','${at(0)}','p-own','${at(0)}')`);
  d.exec(`INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-mem','alpha','member','${at(1)}'),('p-par','alpha','member','${at(2)}'),('p-par','beta','member','${at(2)}')`);
  const by = `'p-own','${at(4)}','p-own','${at(4)}'`;
  d.exec(`INSERT INTO k_aim (project,aim,measure,created_by,created_at,updated_by,updated_at) VALUES ('alpha','Sell tea','{"name":"orders","value":3}',${by})`);
  d.exec(`INSERT INTO k_goals (project,id,parent,title,dimensions,weight,created_by,created_at,updated_by,updated_at) VALUES ('alpha','root',NULL,'Sell more tea','["gtm"]',1.5,${by}),('alpha','annual','root','Annual plan first','["code"]',0.25,${by}),('beta','b-root',NULL,'Beta root','[]',NULL,${by})`);
  d.exec(`INSERT INTO k_questions (project,qid,question,status,choice,label,decided_by,decided_at,created_by,created_at,updated_by,updated_at) VALUES ('alpha','Q-1','Annual or monthly?','decided','0','Annual','p-own','${at(5)}',${by}),('alpha','Q-2','Which colour?','open',NULL,NULL,NULL,NULL,${by})`);
  d.exec(`INSERT INTO k_options (project,qid,idx,what,created_by,created_at,updated_by,updated_at) VALUES ('alpha','Q-1',0,'Annual',${by}),('alpha','Q-1',1,'Monthly',${by}),('alpha','Q-2',0,'Green',${by})`);
  d.exec(`INSERT INTO k_nodes (project,id,type,name,status,data,created_by,created_at,updated_by,updated_at) VALUES ('alpha','surface:web','surface','Web',NULL,NULL,${by}),('alpha','screen:pricing','screen','Pricing','live','{"surface":"web","lane":"buy","step":1,"states":["default"]}',${by}),('alpha','screen:checkout','screen','Checkout','live','{"surface":"web","lane":"buy","step":2}',${by}),('alpha','door:get-prices','door','GET /prices',NULL,NULL,${by}),('alpha','table:prices','table','prices',NULL,NULL,${by})`);
  d.exec(`INSERT INTO k_edges (project,from_id,to_id,kind,label,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:pricing','screen:checkout','nav',NULL,${by}),('alpha','screen:pricing','door:get-prices','depends','calls',${by}),('alpha','door:get-prices','table:prices','reads',NULL,${by})`);
  d.exec(`INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha','AC.1','pricing shows both plans','["screen:pricing","annual"]',${by}),('alpha','AC.2','prices door answers','["door:get-prices","annual"]',${by}),('alpha','AC.3','checkout opens','["screen:checkout"]',${by})`);
  d.exec(`INSERT INTO k_card_kinds (project,key,label,tab,created_by,created_at,updated_by,updated_at) VALUES ('alpha','claim','Claims','gtm',${by})`);
  d.exec(`INSERT INTO k_cards (project,kind,id,name,status,body_md,role_visibility,as_of,created_by,created_at,updated_by,updated_at) VALUES ('alpha','claim','c1','We ship weekly','confirmed','It''s **true**.','["management"]','2026-09-01',${by})`);
  d.exec(`INSERT INTO k_docs (project,path,title,body_md,created_by,created_at,updated_by,updated_at) VALUES ('alpha','start-here.md','Start here','# Hi',${by}),('beta','notes.md','Notes','beta notes',${by})`);
  // a doc too big for one statement (D1 refuses one over 100 KB): the restore sets it from pieces
  d.prepare("INSERT INTO k_docs (project,path,title,body_md,created_by,created_at,updated_by,updated_at) VALUES ('alpha','big.md','Big',?,'p-own',?,'p-own',?)").run("# Big\n" + "It's a long line, naïve café — ".repeat(7000), at(4), at(4));
  d.exec(`INSERT INTO k_gtm (project,template,created_by,created_at,updated_by,updated_at) VALUES ('alpha','{"stages":["lead"]}',${by})`);
  d.exec(`INSERT INTO k_styles (project,id,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES ('alpha','base','${"a".repeat(64)}',120,${by})`);
  d.exec(`INSERT INTO k_renders (project,screen,state,variant,format,style,width,height,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES ('alpha','screen:pricing','','','html','base',NULL,NULL,'${"b".repeat(64)}',900,${by}),('alpha','screen:pricing','default','live','image',NULL,640,480,'${"c".repeat(64)}',5000,${by})`);
  d.exec(`INSERT INTO k_versions (project,n,title,cause,counts,created_by,created_at,updated_by,updated_at) VALUES ('alpha',1,'First','published','{"goal":2}',${by})`);
  d.exec(`INSERT INTO k_snapshots (project,n,table_name,chunk,payload,created_by,created_at,updated_by,updated_at) VALUES ('alpha',1,'k_goals',0,'[{"id":"root"}]',${by})`);
  d.exec(`INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,project,org) VALUES ('art-1','p-mem','image','shot','inbox/artifacts/x','${"d".repeat(64)}',10,'screens','${at(5)}','alpha',1)`);
  const X = d.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,project,parent,goal_ref,decision,decided_by,decided_at,shape,next_who,next_due,next_by,created_at,happened_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  // the ledger, in time order: a knowledge write, a note, a grade (AC.1), a change after it (stale), a pick-up, a follow-up child
  X.run("T-20260901-001", "p-own", "leader", "knowledge", "goals filed", "the brief", null, "auto", "closed", 0, "alpha", null, null, null, null, null, null, null, null, null, at(4), null);
  X.run("T-20260901-002", "p-mem", "leader", "note", "a note", "context", "annual", "owner", "routed", 0, "alpha", null, "annual", "approve", "p-own", at(6), null, null, null, null, at(5), at(5));
  X.run("T-20260901-003", "p-mem", "code", "grade", "AC.1 proven", "the test", null, "auto", "closed", 0, "alpha", null, null, null, null, null, null, null, null, null, at(6), null);
  d.exec(`INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by,graded_at) VALUES ('alpha','d1','AC.1','proven','T-20260901-003','p-mem','${at(6)}')`);
  X.run("T-20260901-004", "p-mem", "code", "pr", "Pricing: annual first", "the call", "screen:pricing", "auto", "closed", 0, "alpha", null, "annual", null, null, null, '{"next":{"what":"announce it","who":"p-own","by":"2026-09-05"}}', "p-own", "2026-09-05", "2026-09-05", at(7), at(7));
  d.exec(`UPDATE transmission SET next_picked_by = 'p-own', next_picked_at = '${at(8)}', next_due = NULL WHERE id = 'T-20260901-004'`);
  X.run("T-20260901-005", "p-own", "gtm", "post", "announced", "follow-up", null, "auto", "closed", 0, "alpha", "T-20260901-004", "annual", null, null, null, null, null, null, null, at(9), at(9));
  X.run("T-20260901-006", "eval-fixed-seat", "code", "pr", "[eval probe] suite row", "suite", "screen:checkout", "auto", "closed", 1, "alpha", null, null, null, null, null, null, null, null, null, at(9), null);
  d.exec(`INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by,graded_at) VALUES ('alpha','d1','AC.3','proven','T-20260901-003','p-mem','${at(10)}'),('alpha','d1','AC.2','refused',NULL,'p-own','${at(10)}')`);
  d.exec(`INSERT INTO transmission_refs (tid,ref) VALUES ('T-20260901-004','screen:pricing'),('T-20260901-004','annual')`);
  d.exec(`INSERT INTO approval_audit (id,transmission_id,verdict,note,decided_by,created_at,org) VALUES ('aa-1','T-20260901-002','approve','ok','p-own','${at(6)}',1)`);
  d.exec(`INSERT INTO events (id,person_id,kind,payload_json,created_at,project,org) VALUES ('ev-1','p-own','ruling','{"qid":"Q-1"}','${at(5)}','alpha',1),('ev-2','p-mem','access','{"eval":true}','${at(6)}',NULL,1)`);
  d.exec(`INSERT INTO loops (id,person_id,title,status,opened_at,ref,org) VALUES ('lp-1','p-mem','follow the plan','open','${at(5)}','annual',1)`);
  // never dumped
  d.exec(`INSERT INTO tokens (token_hash,person_id,device,created_at,expires_at,revoked,org) VALUES ('tok-hash','p-mem','laptop','${at(5)}','2027-01-01T00:00:00.000Z',0,1)`);
  d.exec(`INSERT INTO login_attempts (id,email,ok,at,org) VALUES ('la-1','mia@x.test',1,'${at(5)}',1)`);
  d.exec(`INSERT INTO previews (id,project,person,created_at,expires_at,digest,summary) VALUES ('P-1','alpha','p-mem','${at(5)}','${at(6)}','dg','{}')`);
  return d;
}

// ---- THE PAGES ----
const src = world();
{
  const statements = [];
  const DB = d1Of(src);
  const env = asOrg({ DB: { prepare: (sql) => { statements.push(sql); return DB.prepare(sql); } } });
  const got = {};
  let cursor = "", pages = 0, first = null, maxRows = 0, oneEach = true;
  while (cursor != null && pages < 500) {
    const before = statements.length;
    const p = await B.backupPage(env, { cursor, rows: 3 });
    if (statements.length - before !== 1) oneEach = false;
    if (!first) first = p;
    pages++;
    maxRows = Math.max(maxRows, p.rows.length);
    if (p.table) (got[p.table] = got[p.table] || []).push(...p.rows);
    cursor = p.next;
  }
  const off = [];
  for (const t of B.BACKUP_DUMPED) {
    const all = src.prepare(`SELECT ${t.cols ? t.cols.join(", ") : "*"} FROM "${t.table}"`).all();
    if (R.tableHash(all) !== R.tableHash(got[t.table] || []) || all.length !== (got[t.table] || []).length) off.push(`${t.table} ${all.length}/${(got[t.table] || []).length}`);
  }
  ok(cursor == null && !off.length, `walking the pages (3 rows a page, ${pages} pages) returns every row of every dumped table exactly once${off.length ? ` — off: ${off.join(", ")}` : ""}`);
  ok(oneEach && maxRows <= 3, `each page is ONE statement and at most its rows (${maxRows})`);
  ok((got.k_node_stale || []).length >= 1, `the WITHOUT ROWID k_node_stale pages by its primary key (${(got.k_node_stale || []).length} rows: the change after the grade)`);
  const leaked = (got.people || []).filter((p) => ["key_hash", "pass_hash", "pass_salt", "email"].some((c) => c in p));
  ok((got.people || []).length === 5 && !leaked.length, `people: ${(got.people || []).length} rows, none with key_hash, pass_hash, pass_salt or email`);
  ok(Object.keys(got).every((t) => B.BACKUP_DUMPED.some((x) => x.table === t)) && !statements.some((s) => /FROM "(tokens|invites|login_attempts|previews|k_fill|k_node_lights|k_find)"/.test(s)), "no never-dumped or derived table is read");
  ok(!!(first && first.rule && first.rule.never && first.rule.never.tokens && first.rule.people && first.rule.credentials), "the first page carries the rule (dumped, derived, never, people's columns, credentials)");
  const bad = await B.backupPage(env, { cursor: "x:1" });
  ok(bad.error === "bad_cursor", `a bad cursor is refused (${bad.error})`);
  globalThis.__dump = { format: B.BACKUP_FORMAT, at: at(20), rule: first.rule, source: { url: "selftest", slug: "selftest" }, tables: got };
}

// ---- EVAL and R2 ----
{
  const puts = new Map();
  const env = asOrg({ DB: d1Of(src), BRAIN: { put: async (k, v) => { puts.set(k, String(v)); } } });
  const e = await B.backupEval(env);
  ok(/^o1\/backups\/d1\/\d{4}-\d{2}-\d{2}\.eval\.json$/.test(e.key) && puts.has(e.key) && Object.values(e.counts).every((n) => n <= 50) && ["transmission", "approval_audit", "people", "events", "loops"].every((k) => k in e.counts),
    `backupEval: its own key (${e.key}), at most 50 rows a table, the counts the suites read`);
  const f = await B.backupToR2(env);
  const objs = [...puts.keys()].filter((k) => k.startsWith("o1/backups/d1/") && !k.endsWith(".eval.json"));
  const want = Object.fromEntries(B.BACKUP_DUMPED.map((t) => [t.table, src.prepare(`SELECT COUNT(*) AS n FROM "${t.table}"`).get().n]));
  ok(f.complete && /^o1\/backups\/d1\/.*manifest\.json$/.test(f.key) && puts.has(f.key) && [...puts.keys()].every((k) => k.startsWith("o1/")) && objs.length === f.pages + 1 && B.BACKUP_DUMPED.every((t) => f.counts[t.table] === want[t.table]),
    `backupToR2: ${f.pages} page objects and the manifest under o1/ (${f.key}), every table's count equal (${Object.values(f.counts).reduce((a, b) => a + b, 0)} rows), complete`);
  ok(!puts.get(f.key).includes("hash-mem") && ![...puts.values()].some((v) => v.includes("hash-own") || v.includes("tok-hash") || v.includes("mia@x.test")), "nothing written to R2 holds a key hash, a token hash or an address");
}

// ---- ONE ORG (sprint 6, 6.3) ----
{
  // walk(env) -> { table: rows } over every page (500 rows a page)
  const walk = async (env) => { const got = {}; let c = ""; for (let n = 0; c != null && n < 500; n++) { const p = await B.backupPage(env, { cursor: c, rows: 500 }); if (p.table) (got[p.table] = got[p.table] || []).push(...p.rows); c = p.next; } return got; };
  const two = world();
  const at2 = at(12), by2 = `'q-own','${at2}','q-own','${at2}'`;
  two.exec(`INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('q-own','Quinn','quinn@y.test','owner','hash-q',1,'${at2}',2)`);
  two.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('o2--shop','Shop',1,'${at2}')`);
  two.exec(`INSERT INTO org (id,name,brand,home,created_by,created_at,updated_by,updated_at) VALUES (2,'Southwind',NULL,'o2--shop','q-own','${at2}','q-own','${at2}')`);
  two.exec(`INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('q-own','o2--shop','member','${at2}')`);
  two.exec(`INSERT INTO k_goals (project,id,parent,title,created_by,created_at,updated_by,updated_at) VALUES ('o2--shop','root',NULL,'Open the shop',${by2})`);
  two.exec(`INSERT INTO k_docs (project,path,title,body_md,created_by,created_at,updated_by,updated_at) VALUES ('o2--shop','start-here.md','Start','# Shop',${by2})`);
  two.exec(`INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,project,org) VALUES ('art-2','q-own','image','shot','inbox/artifacts/y','${"e".repeat(64)}',10,'screens','${at2}','o2--shop',2)`);
  two.exec(`INSERT INTO transmission (id,submitter,lane,kind,what,why,route,status,eval,project,created_at,org) VALUES ('T-20260901-101','q-own','leader','note','shop note','why','auto','closed',0,'o2--shop','${at2}',2)`);
  two.exec(`INSERT INTO transmission_refs (tid,ref) VALUES ('T-20260901-101','root')`);
  two.exec(`INSERT INTO approval_audit (id,transmission_id,verdict,note,decided_by,created_at,org) VALUES ('aa-2','T-20260901-101','approve','ok','q-own','${at2}',2)`);
  two.exec(`INSERT INTO events (id,person_id,kind,payload_json,created_at,project,org) VALUES ('ev-3','q-own','note','{}','${at2}','o2--shop',2)`);
  two.exec(`INSERT INTO loops (id,person_id,title,status,opened_at,ref,org) VALUES ('lp-2','q-own','open the shop','open','${at2}','root',2)`);
  two.exec(`INSERT INTO check_results (project,pack_version,check_id,status,transmission_id,graded_by,graded_at) VALUES ('o2--shop','d1','AC.1','proven','T-20260901-101','q-own','${at2}')`);
  // the org of a row, read off the row itself (never the dump's own SQL)
  const txOrg = new Map(two.prepare("SELECT id, org FROM transmission").all().map((r) => [r.id, r.org]));
  const orgOfRow = (t, r) => t === "org" ? r.id : t === "transmission_refs" ? txOrg.get(r.tid)
    : t === "projects" ? orgOfKey(r.key).org : t === "project_seats" ? orgOfKey(r.project_key).org : "org" in r ? r.org : orgOfKey(r.project).org;
  const rowsOf = (t, org) => two.prepare(`SELECT ${t.cols ? t.cols.join(", ") : "*"} FROM "${t.table}"`).all().filter((r) => orgOfRow(t.table, r) === org);
  const one = await walk(asOrg({ DB: d1Of(two) }));
  const moved = B.BACKUP_DUMPED.filter((t) => R.tableHash(one[t.table] || []) !== R.tableHash(rowsOf(t, 1))).map((t) => t.table);
  const same = B.BACKUP_DUMPED.filter((t) => R.tableHash(one[t.table] || []) !== R.tableHash(globalThis.__dump.tables[t.table] || []) && t.table !== "k_node_stale").map((t) => t.table);
  ok(!moved.length && !same.length, `org 1's dump on a two-org database is every org-1 row and no other, every table (${Object.values(one).reduce((n, x) => n + x.length, 0)} rows), the same dump as the world's alone (k_node_stale's change times are each world's own)${moved.length || same.length ? ` — off: ${[...moved, ...same].join(", ")}` : ""}`);
  const mine = await walk(asOrg({ DB: d1Of(two) }, 2));
  const off = [];
  for (const t of B.BACKUP_DUMPED) {
    const all = two.prepare(`SELECT * FROM "${t.table}"`).all().filter((r) => orgOfRow(t.table, r) === 2).length;
    const got = mine[t.table] || [];
    if (got.length !== all || got.some((r) => orgOfRow(t.table, r) !== 2)) off.push(`${t.table} ${got.length}/${all}`);
  }
  const n2 = Object.values(mine).reduce((n, x) => n + x.length, 0);
  ok(!off.length && n2 === 13, `org 2's dump holds its own ${n2} rows (every kind of table) and none of org 1's${off.length ? ` — off: ${off.join(", ")}` : ""}`);
  // sprint 6, 6.4: both orgs' backups of the same day into ONE bucket, each under its own prefix; org 1's untouched by org 2's
  const puts = new Map();
  const BRAIN = { put: async (k, v) => { puts.set(k, String(v)); } };
  const [r1, e1] = [await B.backupToR2(asOrg({ DB: d1Of(two), BRAIN })), await B.backupEval(asOrg({ DB: d1Of(two), BRAIN }))];
  const one1 = new Map(puts);
  const [r2, e2] = [await B.backupToR2(asOrg({ DB: d1Of(two), BRAIN }, 2)), await B.backupEval(asOrg({ DB: d1Of(two), BRAIN }, 2))];
  const keys2 = [...puts.keys()].filter((k) => !one1.has(k));
  const same1 = [...one1].every(([k, v]) => puts.get(k) === v);
  const m2 = JSON.parse(puts.get(r2.key) || "{}");
  const rows2 = Object.values(m2.counts || {}).reduce((a, b) => a + b, 0);
  ok(r1.complete && r2.complete && /^o1\/backups\/d1\//.test(r1.key) && /^o2\/backups\/d1\//.test(r2.key) && /^o2\//.test(e2.key) && /^o1\//.test(e1.key)
    && keys2.length === r2.pages + 2 && keys2.every((k) => k.startsWith("o2/backups/d1/")) && same1 && rows2 === 13 && [...puts.keys()].every((k) => /^o[12]\/backups\/d1\//.test(k)),
    `org 2's backup lands under o2/ alone (${keys2.length} objects, its manifest counts its own ${rows2} rows); org 1's ${one1.size} objects of the same day stay byte for byte (${same1})`);
}

// ---- RESTORE ----
{
  const dump = globalThis.__dump;
  const dst = fresh();
  // the fresh org's seed: one owner with the org's own minted key (tools/lib-r-local.sh rl_seed)
  dst.exec(`INSERT INTO people (id,name,email,role,key_hash,pass_hash,pass_salt,active,created_at,org) VALUES ('org-owner-0001','Local Owner','owner@fresh.local','owner','fresh-key-hash','fresh-ph','fresh-salt',1,'${at(30)}',1)`);
  const built = R.restoreSql(dump);
  let threw = null;
  try { dst.exec(built.sql); } catch (e) { threw = e.message; }
  ok(!threw, `restoreSql applies to a fresh boot.sql database (${built.statements} insert statements, owner ${built.owner})${threw ? ` — ${threw}` : ""}`);
  const off = [];
  for (const t of B.BACKUP_DUMPED) {
    const sql = `SELECT ${t.cols ? t.cols.join(", ") : "*"} FROM "${t.table}"`;
    if (R.tableHash(src.prepare(sql).all()) !== R.tableHash(dst.prepare(sql).all())) off.push(t.table);
  }
  ok(!off.length, `every dumped table's content hash equals the source's after the restore${off.length ? ` — differs: ${off.join(", ")}` : ""}`);
  const doff = [];
  for (const t of Object.keys(B.BACKUP_DERIVED).filter((x) => !x.startsWith("k_find"))) {
    const rows = (D) => D.prepare(`SELECT * FROM "${t}"`).all().map((r) => { const x = { ...r }; delete x.updated_at; return x; });
    if (R.tableHash(rows(src)) !== R.tableHash(rows(dst))) doff.push(`${t} ${rows(src).length}/${rows(dst).length}`);
  }
  ok(!doff.length, `every derived table rebuilt equals the source's (updated_at aside)${doff.length ? ` — differs: ${doff.join(", ")}` : ""}`);
  const stale = dst.prepare("SELECT COUNT(*) AS n FROM k_check_stale").get().n, fill = dst.prepare("SELECT n FROM k_fill WHERE project = 'alpha' AND kind = 'stale'").get();
  ok(stale === src.prepare("SELECT COUNT(*) AS n FROM k_check_stale").get().n && stale >= 1 && fill && fill.n === stale, `the stale marks are rebuilt (${stale} stale check, the checklist's count ${fill && fill.n})`);
  const find = (D, w) => D.prepare("SELECT COUNT(*) AS n FROM k_find WHERE k_find MATCH ?").get(`{title body} : "${w}"*`).n;
  ok(["annual", "pricing", "tea", "announced"].every((w) => find(src, w) === find(dst, w) && find(dst, w) > 0), "search's index finds the same as the source's (annual, pricing, tea, announced)");
  const own = dst.prepare("SELECT key_hash, email FROM people WHERE id = 'p-own'").get(), rest = dst.prepare("SELECT id, key_hash, email, pass_hash FROM people WHERE id <> 'p-own'").all();
  ok(own.key_hash === "fresh-key-hash" && own.email === "owner@fresh.local" && !dst.prepare("SELECT 1 FROM people WHERE id = 'org-owner-0001'").get(),
    "the restored owner holds the fresh org's own key and address; the seeded row is gone");
  ok(rest.length === 4 && rest.every((p) => p.key_hash === `restored:${p.id}` && p.email == null && p.pass_hash == null), "every other person comes back with no key, no passphrase and no address");
  ok(["tokens", "login_attempts", "previews"].every((t) => dst.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n === 0), "no token, preview or sign-in attempt is restored");
  ok(!dst.prepare("SELECT 1 FROM sqlite_master WHERE name IN ('_restore_seed', '_restore_big')").get(), "the restore leaves no table of its own behind");
  ok(built.oversize === 1 && dst.prepare("SELECT length(body_md) AS n FROM k_docs WHERE path = 'big.md'").get().n === src.prepare("SELECT length(body_md) AS n FROM k_docs WHERE path = 'big.md'").get().n,
    `a row too big for one statement (${Math.round(Buffer.byteLength(src.prepare("SELECT body_md FROM k_docs WHERE path = 'big.md'").get().body_md) / 1024)} KB) is set from pieces and comes back whole (oversize ${built.oversize})`);
  ok(built.sql.split(/;\n/).every((x) => Buffer.byteLength(x) < 100_000), "no statement of the restore is over 100 KB");
  const parent = dst.prepare("SELECT next_done_by, next_picked_by FROM transmission WHERE id = 'T-20260901-004'").get();
  ok(parent.next_done_by === "T-20260901-005" && parent.next_picked_by === "p-own", "the ledger's pick-up and its done-by-a-child come back as they were");
}

// ---- AN OLDER DUMP (finding 15): the sprint-5 code's, before and after migrate-067 ----
{
  const dump = globalThis.__dump;
  const strip = (r) => { const x = { ...r }; delete x.org; return x; };
  const before067 = { ...dump, tables: Object.fromEntries(Object.entries(dump.tables).map(([t, rows]) => [t, R.ORG_STAMPED.includes(t) ? rows.map(strip) : rows])) };
  const after067 = { ...dump, tables: { ...dump.tables, projects: dump.tables.projects.map((r) => ({ ...r, ...orgOfKey(r.key) })), transmission_refs_meta: [{ key: "backfill_horizon", value: "T-20260901-001" }] } };
  const restoreOf = async (d) => {
    const dst = fresh();
    dst.exec(`INSERT INTO people (id,name,email,role,key_hash,pass_hash,pass_salt,active,created_at,org) VALUES ('org-owner-0001','Local Owner','owner@fresh.local','owner','fresh-key-hash','fresh-ph','fresh-salt',1,'${at(30)}',1)`);
    let built = null, threw = null;
    try { built = R.restoreSql(d); dst.exec(built.sql); } catch (e) { threw = String(e.message || e); }
    if (threw) return { threw };
    const again = {}; let c = "";
    for (let n = 0; c != null && n < 500; n++) { const p = await B.backupPage(asOrg({ DB: d1Of(dst) }), { cursor: c, rows: 500 }); if (p.table) (again[p.table] = again[p.table] || []).push(...p.rows); c = p.next; }
    return { dst, built, again: { tables: again } };
  };
  const stamped = R.ORG_STAMPED.reduce((n, t) => n + (dump.tables[t] || []).length, 0);
  const a = await restoreOf(before067);
  ok(!a.threw && Object.values(a.built.shim.org).reduce((x, y) => x + y, 0) === stamped && R.ORG_STAMPED.every((t) => a.dst.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE org IS NOT 1`).get().n === 0),
    `a sprint-5 dump (no org on ${R.ORG_STAMPED.join(", ")}) restores on the new boot.sql: ${stamped} rows took org 1, every row of those tables is org 1's${a.threw ? ` — ${a.threw}` : ""}`);
  const ca = a.threw ? ["threw"] : R.compareDump(before067, a.again, a.built.shim);
  ok(!ca.length, `… and the re-dump, the shim undone (each org it wrote read back as 1, then dropped), equals the sprint-5 dump's own rows table by table${ca.length ? ` — ${ca.join(", ")}` : ""}`);
  const b = await restoreOf(after067);
  const cb = b.threw ? ["threw"] : R.compareDump(after067, b.again, b.built.shim);
  ok(!b.threw && b.built.shim.generated === dump.tables.projects.length && b.built.shim.left.transmission_refs_meta === 1 && !cb.length,
    `a dump of the sprint-5 code after migrate-067 (projects carry the generated org and slug; transmission_refs_meta): restores, ${b.threw ? b.threw : `${b.built.shim.generated} projects rows' generated keys dropped (each its key's), transmission_refs_meta named and not loaded`}; the re-dump equals the dump's own rows${cb.length ? ` — ${cb.join(", ")}` : ""}`);
  // honesty: a row of another org in the re-dump is never the shim's; a dump whose projects row disagrees with its key is refused
  const forged = { tables: { ...a.again.tables, events: a.again.tables.events.map((r, i) => (i ? r : { ...r, org: 2 })) } };
  const cf = R.compareDump(before067, forged, a.built.shim);
  const bad = { ...dump, tables: { ...dump.tables, projects: dump.tables.projects.map((r, i) => (i ? { ...r, ...orgOfKey(r.key) } : { ...r, org: 1, slug: "other" })) } };
  let refused = null; try { R.restoreSql(bad); } catch (e) { refused = String(e.message || e); }
  ok(cf.some((x) => /^events: 1 row\(s\) with an org the shim did not write$/.test(x)) && /not what its key generates/.test(refused || ""),
    `the comparison stays honest: a re-dumped row of another org is caught (${cf.join(", ")}); a projects row whose slug is not its key's refuses the load (${refused})`);
}

// ---- THE RECORD (G2 item 9: a failed nightly backup is never silent) ----
{
  const d = fresh();
  d.prepare("INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p-own','Owner','owner','k',1,'2026-01-01T00:00:00Z',1)").run();
  const env = asOrg({ DB: d1Of(d) });   // a request signed in to org 1 (src/data.js): its owner holds the record
  ok((await B.lastBackup(env)) === null, "no backup recorded: lastBackup answers none");
  await B.recordBackup(env, { complete: true, pages: 3, counts: { people: 1, projects: 2 } });
  const one = await B.lastBackup(env);
  ok(one && one.ok === true && one.pages === 3 && one.rows === 3 && /^\d{4}-/.test(one.at), `a complete run is recorded: ${JSON.stringify(one)}`);
  await new Promise((r) => setTimeout(r, 5));
  await B.recordBackup(env, { error: "D1 query limit exceeded (50 per invocation)" });
  const two = await B.lastBackup(env);
  const ev = d.prepare("SELECT kind, json_extract(payload_json, '$.mind') AS mind FROM events WHERE kind = 'backup'").all();
  ok(two && two.ok === false && /query limit/.test(two.error || "") && ev.length === 2 && ev.every((x) => x.mind === 1), `a failed run is recorded with its reason, and the newest is what Control shows: ${JSON.stringify(two)}`);
  const plan = d.prepare("EXPLAIN QUERY PLAN " + org1(B.LAST_BACKUP_SQL)).all().map((r) => r.detail).join(" | ");
  ok(/idx_events_person_kind/.test(plan) && !/SCAN e\b/.test(plan), `the newest backup is ONE indexed read: ${plan}`);
}

// ---- THE CRON (G2 item 9): the real scheduled handler (src/index.js, the cf-workers stub loader): a backup whose R2 write throws
// leaves a failed record with its reason; one that completes leaves a complete one
{
  const { register } = await import("node:module");
  register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
  const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
  const d = fresh();
  // two orgs, each with its row and its owner (sprint 6, 6.4: the cron serves every org of the org table)
  d.prepare("INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('p-own','Owner','owner','k',1,'2026-01-01T00:00:00Z',1)").run();
  d.prepare("INSERT INTO people (id,name,role,key_hash,active,created_at,org) VALUES ('q-own','Owner Two','owner','k2',1,'2026-01-01T00:00:00Z',2)").run();
  d.exec("INSERT INTO org (id,name,created_at,updated_at) VALUES (1,'One','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),(2,'Two','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')");
  const bad = { DB: d1Of(d), BRAIN: { put: async () => { throw new Error("R2 put refused"); }, get: async () => null, list: async () => ({ objects: [] }), delete: async () => {} } };
  await handler.scheduled({ cron: "0 3 * * *" }, bad, { waitUntil() {} });
  const [f, f2] = [await B.lastBackup(asOrg({ DB: d1Of(d) })), await B.lastBackup(asOrg({ DB: d1Of(d) }, 2))];
  ok(f && f.ok === false && /R2 put refused/.test(f.error || "") && f2 && f2.ok === false && /R2 put refused/.test(f2.error || ""),
    `the cron, its backup failing: recorded failed with its reason, in each org (${JSON.stringify(f)} · ${JSON.stringify(f2)})`);
  await new Promise((r) => setTimeout(r, 5));
  const puts = new Map();
  const good = { DB: d1Of(d), BRAIN: { put: async (k, v) => { puts.set(k, String(v)); }, get: async () => null, list: async () => ({ objects: [] }), delete: async () => {} } };
  const run = await handler.scheduled({ cron: "0 3 * * *", scheduledTime: Date.now() }, good, { waitUntil() {} });
  const [g, g2] = [await B.lastBackup(asOrg({ DB: d1Of(d) })), await B.lastBackup(asOrg({ DB: d1Of(d) }, 2))];
  const man = (o) => [...puts.keys()].find((k) => k.startsWith(`o${o}/backups/d1/`) && k.endsWith("/manifest.json"));
  const people = (o) => { try { return JSON.parse(puts.get([...puts.keys()].find((k) => k.startsWith(`o${o}/`) && JSON.parse(puts.get(k)).table === "people")) || "{}").rows.map((r) => r.id); } catch { return null; } };
  ok(g && g.ok === true && g.pages >= 1 && g2 && g2.ok === true && g2.pages >= 1 && JSON.stringify(run.orgs) === "[1,2]" && man(1) && man(2)
    && JSON.stringify(people(1)) === '["p-own"]' && JSON.stringify(people(2)) === '["q-own"]' && [...puts.keys()].every((k) => /^o[12]\//.test(k)),
    `the cron backs up every org under its own prefix and records each in its own org (${JSON.stringify(run.ran)})`);
  const { cronWindow, CRON_ORGS_PER_RUN } = await import(pathToFileURL(join(ENGINE, "src", "cron.js")).href);
  const ids = Array.from({ length: 45 }, (_, i) => i + 1), H = 12 * 3600e3, seen = new Set();
  for (let run = 0; run < 3; run++) for (const o of cronWindow(ids, run * H, 20)) seen.add(o);
  ok(JSON.stringify(cronWindow([1, 2, 3], 5 * H)) === "[1,2,3]" && cronWindow(ids, 0, 20).length === 20 && JSON.stringify(cronWindow(ids, 0, 20).slice(0, 2)) === "[1,2]"
    && JSON.stringify(cronWindow(ids, H, 20).slice(0, 2)) === "[21,22]" && seen.size === 45 && CRON_ORGS_PER_RUN === 20,
    `the cron's bound: every org when they fit (${CRON_ORGS_PER_RUN} a run), else ${CRON_ORGS_PER_RUN} in id order from where the run before ended — 45 orgs all served in 3 runs`);
}

console.log(`${failed ? "✗" : "✓"} backup selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
