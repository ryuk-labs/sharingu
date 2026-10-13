// tools/operator-selftest.mjs — sprint 7, slice 7.2: the operator's tool (tools/operator.mjs: allow · list · revoke), against a
// fresh database built from boot.sql (node:sqlite, the D1 shape of tools/fixtures/sqlite-worker.mjs), and its CLI with that
// database handed in (never Cloudflare: --local runs in the smoke, on the local worker's own state; --live is written, not run).
//   O1 · allow: a code of 20 Crockford base32 characters in four groups of five; ONE row, its email normalised, only the code's
//        hash (src/accounts.js signupCodeHash), an expiry N days on (default 7); the code itself in no row
//   O2 · allow again: the earlier open code is revoked in the same write (one open code per email); list says open, 2 codes
//   O3 · revoke: the open code ends (list: revoked); a second revoke is refused (nothing open)
//   O4 · the refusals write nothing: not an email, --days 0 / 31 / 1.5, an account with a passphrase without --reset; with
//        --reset it is allowed and says so
//   O5 · list: each email's newest code and its state (open · used with how · expired · revoked), never a code or a hash
//   O6 · the CLI: a usage error is 2 and opens no database; --live with a --confirm-live that does not name the config's D1 is 1
//        and opens nothing; --local with --live is 2; --days out of range is 2 and a bad email 1, both before any open; allow
//        prints the code ONCE, on its own line of the terminal, and never to the error stream; --live with the right name runs
//        (on the handed-in database); list --json is JSON with no code
//   O7 · the source: the code reaches only the terminal (the CLI's `say`), never a file, a log or a record
//   O8 · (the sprint-7 review, A5) a non-ASCII email is refused by allow, revoke and remove-account, nothing written, and by the
//        CLI before any database is opened
//   O9 · (A7) allow says, BEFORE the code line, how many active seats the email's account holds and in how many orgs (no org
//        name), and that its sign-up takes them; an email with none gets no such line; an inactive seat is not counted
//   O10 · (D6) remove-account: refused (nothing written) for no account, an account holding an active seat, one that founded
//        an org still standing; an account with only inactive seats is removed with its sessions, sign-in attempts and codes,
//        its inactive seats kept and detached; the CLI's --live discipline; a seat that appears between the check and the
//        write leaves everything as it was
//   O18 · (sprint 11, 11.3) set-openai-challenge / clear-openai-challenge over a KV: the token stored under its one key, exactly;
//        a second set replaces it (and says what it replaced); every token not of the form (empty, a space, a line break, a slash,
//        513 characters, none) refused, nothing stored (RED: the validator disabled stores one); clear removes it, a second clear
//        is refused
//   O19 · the CLI: no --token is 2 and a bad token 1, both before anything is opened; --live naming another database 1, nothing
//        opened; a config with no OAUTH_KV 2; --local and --live with its own name each store (the backend opened with kv)
//   O20 · THE DOOR (the real src/index.js in-process): GET /.well-known/openai-apps-challenge is 404 not_found with none stored;
//        after a set 200 text/plain with exactly the token (no newline), HEAD 200 with no body, with no D1 statement, a bearer
//        or none alike; under an org's address the one not-here 404 (never the token); a stored value of no token's form 404;
//        after clear 404. RED then GREEN: the route removed answers no token.
//   O21 · (sprint 12, 12.7) the beta's 50 places: at 49 taken the 50th allow is minted and says 0 of 50 left; at 50 the 51st is
//        refused (exit 1, --beyond-cap named), nothing written; --beyond-cap allows it and says so; list and list-orgs say the count
//        at their head (O11 too), list --json carries it; allowing again the email whose open code holds a place takes no 51st.
//        RED then GREEN: the refusal removed mints the 51st
//   O22 · the platform's own orgs hold no place: org 1, an org whose settings say suites, a reviewer world (plan reviewer), a ship's
//        suite org (plan suite). RED then GREEN: counted, the 50th is refused
//   O23 · an expired, used or revoked code holds no place; a code whose holder already made an org is counted once (by the org),
//        and that holder's allow takes no new place. RED then GREEN for each count
//   O24 · BETA_ORG_CAP is one constant, 50, in src/beta.js under the owner's ruling (2026-10-10; sprint 21 moved it there, the one
//        source the worker's request page reads too); the tool imports it; no other file of src/ names it (the worker does not
//        enforce it)
// Exit 1 on any failure. A gate step.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const OP = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
const { signupCodeHash } = await import(pathToFileURL(join(ENGINE, "src", "accounts.js")).href);
const DAY = 24 * 60 * 60 * 1000;
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3}$/;

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const fresh = () => { const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8")); return db; };
const rowsOf = (db) => db.prepare("SELECT * FROM signup_codes ORDER BY created_at, rowid").all();
const allText = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'k_find%'").all()
  .map((t) => JSON.stringify(db.prepare(`SELECT * FROM "${t.name}"`).all())).join("\n");

// O1
{
  const db = fresh(), DB = d1(db);
  const at = "2026-10-07T10:00:00.000Z";
  const r = await OP.allowEmail(DB, "  Ada@Example.ORG ", { at });
  const rows = rowsOf(db);
  ok(CODE_RE.test(r.code || "") && r.email === "ada@example.org", `O1 · allow answers a code of four groups of five Crockford characters, for the normalised email (${r.email})`);
  ok(rows.length === 1 && rows[0].email === "ada@example.org" && rows[0].code_hash === await signupCodeHash(r.code) && rows[0].expires_at === new Date(Date.parse(at) + 7 * DAY).toISOString() && rows[0].used_at === null && rows[0].revoked_at === null,
    `O1 · one row: the email, the code's hash, an expiry 7 days on (${rows[0] && rows[0].expires_at}), open`);
  ok(!allText(db).includes(r.code) && !allText(db).includes(r.code.replace(/-/g, "")), "O1 · the code itself is in no row of the database");
}
// O2 · O3
{
  const db = fresh(), DB = d1(db);
  const a = await OP.allowEmail(DB, "ben@example.org", { at: "2026-10-07T10:00:00.000Z" });
  const b = await OP.allowEmail(DB, "ben@example.org", { at: "2026-10-07T11:00:00.000Z", days: 2 });
  const rows = rowsOf(db);
  const open = rows.filter((x) => !x.used_at && !x.revoked_at);
  ok(a.code !== b.code && b.replaced === 1 && rows.length === 2 && open.length === 1 && open[0].code_hash === await signupCodeHash(b.code) && !!rows[0].revoked_at,
    `O2 · allow again: the earlier open code revoked in the same write (${b.replaced}), one open code (the new one)`);
  const l = await OP.listAllowed(DB, { at: "2026-10-07T12:00:00.000Z" });
  ok(l.length === 1 && l[0].state === "open" && l[0].codes === 2, `O2 · list: ben is open, 2 codes (${JSON.stringify(l[0])})`);
  const rv = await OP.revokeEmail(DB, "BEN@example.org");
  const l2 = await OP.listAllowed(DB, { at: "2026-10-07T12:00:00.000Z" });
  const again = await OP.revokeEmail(DB, "ben@example.org");
  ok(rv.revoked === 1 && l2[0].state === "revoked" && !!again.refused, `O3 · revoke ends the open code (list: ${l2[0].state}); a second revoke is refused (${again.refused})`);
}
// O4
{
  const db = fresh(), DB = d1(db);
  db.prepare("INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at) VALUES ('acc-1', 'kept@example.org', 'h', 's', '2026-10-01', '2026-10-01')").run();
  db.prepare("INSERT INTO accounts (id, email, created_at, updated_at) VALUES ('acc-2', 'nopass@example.org', '2026-10-01', '2026-10-01')").run();
  const refusals = [await OP.allowEmail(DB, "not-an-email"), await OP.allowEmail(DB, "x@example.org", { days: 0 }), await OP.allowEmail(DB, "x@example.org", { days: 31 }),
    await OP.allowEmail(DB, "x@example.org", { days: 1.5 }), await OP.allowEmail(DB, "kept@example.org")];
  ok(refusals.every((r) => r.refused && !r.code) && rowsOf(db).length === 0, `O4 · not an email, --days 0 / 31 / 1.5, an account with a passphrase without --reset: each refused, nothing written (${rowsOf(db).length} rows)`);
  const reset = await OP.allowEmail(DB, "kept@example.org", { reset: true }), plain = await OP.allowEmail(DB, "nopass@example.org");
  ok(reset.code && reset.reset === true && plain.code && plain.reset === false, "O4 · with --reset the account with a passphrase is allowed (a reset, said); an account with none needs no flag");
}
// O5
{
  const db = fresh(), DB = d1(db);
  const now = "2026-10-07T12:00:00.000Z";
  await OP.allowEmail(DB, "open@example.org", { at: "2026-10-07T10:00:00.000Z" });
  await OP.allowEmail(DB, "old@example.org", { at: "2026-09-01T10:00:00.000Z", days: 1 });
  const u = await OP.allowEmail(DB, "used@example.org", { at: "2026-10-07T09:00:00.000Z" });
  db.prepare("UPDATE signup_codes SET used_at = ?, used_how = 'set', spent_by = 'n' WHERE email = 'used@example.org'").run("2026-10-07T09:30:00.000Z");
  await OP.allowEmail(DB, "gone@example.org", { at: "2026-10-07T08:00:00.000Z" }); await OP.revokeEmail(DB, "gone@example.org", { at: "2026-10-07T08:30:00.000Z" });
  const l = await OP.listAllowed(DB, { at: now });
  const by = Object.fromEntries(l.map((x) => [x.email, x]));
  ok(by["open@example.org"].state === "open" && by["old@example.org"].state === "expired" && by["used@example.org"].state === "used" && by["used@example.org"].how === "set" && by["gone@example.org"].state === "revoked",
    `O5 · list: open, expired, used (set), revoked — ${l.map((x) => `${x.email.split("@")[0]} ${x.state}`).join(", ")}`);
  ok(!/[0-9a-f]{64}/.test(JSON.stringify(l)) && !JSON.stringify(l).includes(u.code) && l.every((x) => !("code" in x) && !("code_hash" in x)), "O5 · list holds no code and no hash");
  ok((await OP.listAllowed(DB, { email: "USED@example.org", at: now })).length === 1, "O5 · list --email narrows to one email");
}
// O6 · the CLI
{
  const dir = mkdtempSync(join(tmpdir(), "operator-selftest-"));
  try {
    const cfg = join(dir, "wrangler.jsonc");
    writeFileSync(cfg, `// a test config\n{ "name": "t", "d1_databases": [{ "binding": "DB", "database_name": "test-db", "database_id": "00000000-0000-0000-0000-000000000000" }] }\n`);
    const db = fresh();
    let opened = 0;
    const cli = async (...argv) => {
      const said = [], errs = [];
      const rc = await OP.run(argv, { open: async () => { opened++; return { DB: d1(db), database: "test:db", close: async () => {} }; }, say: (s) => said.push(String(s)), err: (s) => errs.push(String(s)) });
      return { rc, said, errs };
    };
    const o0 = opened;
    const usage = [await cli(), await cli("allow", "--local", dir, "--config", cfg), await cli("allow", "--email", "a@example.org", "--config", cfg),
      await cli("allow", "--email", "a@example.org", "--local", dir, "--live", "--config", cfg, "--confirm-live", "test-db"), await cli("nuke", "--local", dir, "--config", cfg)];
    ok(usage.every((u) => u.rc === 2) && opened === o0, `O6 · usage errors (no command, no --email, neither or both backends, an unknown command) are 2 and open nothing (${usage.map((u) => u.rc).join("/")})`);
    const wrong = await cli("allow", "--email", "a@example.org", "--live", "--config", cfg, "--confirm-live", "prod-db");
    const days = await cli("allow", "--email", "a@example.org", "--local", dir, "--config", cfg, "--days", "45");
    const bad = await cli("allow", "--email", "nope", "--local", dir, "--config", cfg);
    ok(wrong.rc === 1 && /--live refused/.test(wrong.errs.join(" ")) && days.rc === 2 && bad.rc === 1 && opened === o0 && rowsOf(db).length === 0,
      `O6 · --live naming another database (${wrong.rc}), --days 45 (${days.rc}), a bad email (${bad.rc}): refused before any database is opened`);
    const a = await cli("allow", "--email", "cli@example.org", "--local", dir, "--config", cfg, "--days", "3");
    const code = ((a.said.join("\n").match(/^ {2}code: (\S+)$/m)) || [])[1] || "";
    const times = a.said.join("\n").split(code).length - 1;
    ok(a.rc === 0 && CODE_RE.test(code) && times === 1 && !a.errs.join("\n").includes(code) && rowsOf(db).length === 1 && rowsOf(db)[0].code_hash === await signupCodeHash(code),
      `O6 · allow prints the code ONCE on its own line (${times}x), never on the error stream; the row holds its hash`);
    const lv = await cli("list", "--live", "--config", cfg, "--confirm-live", "test-db", "--json");
    let j = null; try { j = JSON.parse(lv.said.join("\n")); } catch { j = null; }
    ok(lv.rc === 0 && j && j.allowed.length === 1 && j.allowed[0].state === "open" && !lv.said.join("\n").includes(code), "O6 · --live with the config's own D1 name runs (on the handed-in database); list --json answers JSON with no code");
    const rv = await cli("revoke", "--email", "cli@example.org", "--local", dir, "--config", cfg), rv2 = await cli("revoke", "--email", "cli@example.org", "--local", dir, "--config", cfg);
    ok(rv.rc === 0 && rv2.rc === 1, `O6 · revoke (${rv.rc}), then nothing left to revoke (${rv2.rc})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// O7 · the code's only sink is the terminal
{
  const src = readFileSync(join(ENGINE, "tools", "operator.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const uses = [...src.matchAll(/\br\.code\b/g)].map((m) => src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index)).trim());
  // 8.5: the one other file write is an ORG write's run record (openRecord's save), opened only in the org commands' branch — allow
  // never writes one, and nothing a record holds is the code
  const writes = (src.match(/writeFileSync\(/g) || []).length, opens = [...src.matchAll(/openRecord\(recordDir/g)].length;
  const orgBranch = src.slice(src.indexOf("if (ORG_COMMANDS.includes(cmd)) {"), src.indexOf("if (cmd === \"remove-account\") {"));
  ok(uses.length === 1 && /^say\(`  code: \$\{r\.code\}`\);$/.test(uses[0]) && !/appendFileSync|createWriteStream/.test(src) && writes === 2 && /writeFileSync\(path, JSON\.stringify\(\{ name: "operator"/.test(src)
    && /const save = \(\) => writeFileSync\(path, JSON\.stringify\(rec, null, 1\)/.test(src) && opens === 1 && orgBranch.includes("openRecord(recordDir") && !/\bcode\b/.test(orgBranch.replace(/the code|\bcode's\b/g, "")),
    `O7 · the code's one sink is the terminal line (say); the only file writes are the backend's temporary config and an org write's run record, opened in the org commands' branch alone (${uses.length} use, ${writes} writes, ${opens} record opener)`);
}
// a seat in an org (the migrate-070 trigger makes or joins the email's account)
const seat = (db, id, email, org, active = 1, pending = 0) => db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, pending, created_at, org) VALUES (?, ?, ?, 'member', ?, ?, ?, '2026-10-01', ?)")
  .run(id, id, email, `kh-${id}`, active, pending, org);
const cliOn = (db) => async (...argv) => {
  const said = [], errs = [];
  let opened = 0;
  const dir = mkdtempSync(join(tmpdir(), "operator-selftest-")), cfg = join(dir, "wrangler.jsonc");
  writeFileSync(cfg, `{ "name": "t", "d1_databases": [{ "binding": "DB", "database_name": "test-db", "database_id": "00000000-0000-0000-0000-000000000000" }] }\n`);
  try {
    const rc = await OP.run(argv.map((a) => (a === "CFG" ? cfg : a === "DIR" ? dir : a)), { open: async () => { opened++; return { DB: d1(db), database: "test:db", close: async () => {} }; }, say: (s) => said.push(String(s)), err: (s) => errs.push(String(s)) });
    return { rc, said, errs, opened };
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
// O8 · non-ASCII
{
  const db = fresh(), DB = d1(db), cli = cliOn(db);
  const rs = [await OP.allowEmail(DB, "jÖrg@example.de"), await OP.revokeEmail(DB, "jörg@example.de"), await OP.removeAccount(DB, "zoë@example.org")];
  const c = await cli("allow", "--email", "jÖrg@example.de", "--local", "DIR", "--config", "CFG");
  ok(rs.every((r) => r.refused && /plain-ASCII/.test(r.refused)) && rowsOf(db).length === 0 && c.rc === 1 && c.opened === 0 && /plain-ASCII/.test(c.errs.join(" ")),
    `O8 · a non-ASCII email: allow, revoke, remove-account refused (${rs.map((r) => !!r.refused).join("/")}), nothing written; the CLI refuses before any database is opened (${c.rc}, ${c.opened} opened)`);
  ok(!OP.emailProblem("Ada.Lovelace+x@Example.ORG"), "O8 · a plain-ASCII email (any case, a plus) is still an email");
}
// O9 · the seats said before the code
{
  const db = fresh(), cli = cliOn(db);
  seat(db, "s1", "held@example.org", 1); seat(db, "s2", "held@example.org", 2); seat(db, "s3", "held@example.org", 3, 0);
  const a = await cli("allow", "--email", "HELD@example.org", "--local", "DIR", "--config", "CFG");
  const out = a.said.join("\n"), li = a.said.findIndex((l) => /already holds/.test(l)), ci = a.said.findIndex((l) => /^ {2}code: /.test(l)), ai = a.said.findIndex((l) => /^✓ allowed/.test(l));
  ok(a.rc === 0 && li >= 0 && li < ai && ai < ci && /2 active seats in 2 orgs: its sign-up TAKES them/.test(out) && !/\bs1\b|\bs2\b/.test(a.said[li]),
    `O9 · allow of an email holding 2 active seats in 2 orgs (and 1 inactive) says so BEFORE the allowed line and the code (line ${li} < ${ai} < ${ci}), no seat or org named: ${a.said[li] || "(none)"}`);
  const b = await cli("allow", "--email", "new@example.org", "--local", "DIR", "--config", "CFG");
  ok(b.rc === 0 && !b.said.some((l) => /already holds/.test(l)), "O9 · an email with no seat: no such line");
  ok((await OP.seatsOfEmail(d1(db), "held@example.org")).seats === 2, "O9 · the inactive seat is not counted");
  seat(db, "w1", "waits@example.org", 4, 0, 1);
  const c = await cli("allow", "--email", "waits@example.org", "--local", "DIR", "--config", "CFG");
  ok(c.rc === 0 && c.said.some((l) => /0 active seats in 0 orgs and 1 seat waiting for its holder's yes .*: its sign-up TAKES it/.test(l)), `O9 · a seat waiting for its holder's yes (migrate-074) is said too: ${c.said[0]}`);
}
// O10 · remove-account
{
  const db = fresh(), DB = d1(db), cli = cliOn(db);
  const count = (sql, ...a) => Number(Object.values(db.prepare(sql).get(...a))[0]);
  // gone@: one inactive seat in org 2, a session, sign-in attempts and a code; busy@: an active seat; founder@: no seat, an org it founded
  seat(db, "g1", "gone@example.org", 2, 0); seat(db, "g2", "gone@example.org", 5, 0, 1);
  const gid = db.prepare("SELECT account_id FROM people WHERE id = 'g1'").get().account_id;
  db.prepare("INSERT INTO tokens (token_hash, person_id, created_at, expires_at, org, account_id) VALUES ('t1', 'g1', '2026-10-01', '2027-01-01', 2, ?)").run(gid);
  db.prepare("INSERT INTO login_attempts (id, email, ok, at, org, account_id) VALUES ('la1', 'gone@example.org', 0, '2026-10-01', 2, ?), ('la2', 'gone@example.org', 0, '2026-10-01', 2, NULL)").run(gid);
  await OP.allowEmail(DB, "gone@example.org");
  seat(db, "b1", "busy@example.org", 2); seat(db, "b0", "busy@example.org", 3, 0);
  db.prepare("INSERT INTO accounts (id, email, created_at, updated_at) VALUES ('acc-f', 'founder@example.org', '2026-10-01', '2026-10-01')").run();
  db.prepare("INSERT INTO org (id, name, created_at, updated_at, created_by_account) VALUES (7, 'Founded', '2026-10-01', '2026-10-01', 'acc-f')").run();
  const before = allText(db);
  const refused = [await OP.removeAccount(DB, "nobody@example.org"), await OP.removeAccount(DB, "busy@example.org"), await OP.removeAccount(DB, "founder@example.org")];
  ok(refused.every((r) => r.refused) && /no account/.test(refused[0].refused) && /1 active seat in 1 org/.test(refused[1].refused) && /founded an org/.test(refused[2].refused) && allText(db) === before,
    `O10 · refused, nothing written: no account · an active seat · a founded org standing (${refused.map((r) => (r.refused || "").slice(0, 40)).join(" | ")})`);
  const r = await OP.removeAccount(DB, "Gone@Example.org");
  ok(r.email === "gone@example.org" && r.detached === 2 && r.sessions === 1 && r.attempts === 2 && r.codes === 1 && count("SELECT COUNT(*) FROM accounts WHERE email = 'gone@example.org'") === 0
    && count("SELECT COUNT(*) FROM people WHERE id = 'g1' AND account_id IS NULL AND email = 'gone@example.org' AND active = 0") === 1
    && count("SELECT COUNT(*) FROM people WHERE id = 'g2' AND account_id IS NULL AND active = 0 AND pending = 0") === 1
    && count("SELECT COUNT(*) FROM tokens WHERE account_id = ?", gid) === 0 && count("SELECT COUNT(*) FROM login_attempts WHERE email = 'gone@example.org'") === 0
    && count("SELECT COUNT(*) FROM signup_codes WHERE email = 'gone@example.org'") === 0 && count("SELECT COUNT(*) FROM accounts WHERE email = 'busy@example.org'") === 1,
    `O10 · an account with only an inactive seat and a waiting one is removed with its session, its 2 sign-in attempts and its code; its inactive seat kept, detached, the waiting one declined and detached (${JSON.stringify(r)}); the others untouched`);
  // a seat appears between the check and the write: the guarded batch writes nothing
  seat(db, "r1", "race@example.org", 2, 0);
  const raceDB = { prepare: (q) => DB.prepare(q), batch: async (stmts) => { seat(db, "r2", "race@example.org", 3, 1); return DB.batch(stmts); } };
  const rb = allText(db);
  const race = await OP.removeAccount(raceDB, "race@example.org");
  ok(race.refused && /appeared since the check/.test(race.refused) && count("SELECT COUNT(*) FROM accounts WHERE email = 'race@example.org'") === 1
    && count("SELECT COUNT(*) FROM people WHERE id = 'r1' AND account_id IS NOT NULL") === 1, `O10 · a seat added between the check and the write: refused, the account and its inactive seat as they were (${race.refused})`);
  const wrong = await cli("remove-account", "--email", "busy@example.org", "--live", "--config", "CFG", "--confirm-live", "prod-db");
  const noemail = await cli("remove-account", "--local", "DIR", "--config", "CFG");
  const busy = await cli("remove-account", "--email", "busy@example.org", "--local", "DIR", "--config", "CFG");
  seat(db, "z1", "cli@example.org", 2, 0);
  const done = await cli("remove-account", "--email", "cli@example.org", "--live", "--config", "CFG", "--confirm-live", "test-db");
  ok(wrong.rc === 1 && wrong.opened === 0 && noemail.rc === 2 && noemail.opened === 0 && busy.rc === 1 && /refused \(nothing written\)/.test(busy.errs.join(" "))
    && done.rc === 0 && /^✓ removed the account of cli@example.org from test:db: 0 session\(s\), 0 sign-in attempt\(s\) and 0 sign-up code\(s\) with it; 1 inactive seat\(s\) kept/.test(done.said.join("\n")),
    `O10 · the CLI: --live naming another database (${wrong.rc}, nothing opened), no --email (${noemail.rc}), an active seat (${busy.rc}), --live with the config's own name runs (${done.rc})`);
}
// ======== sprint 8, 8.5 · the orgs, their plans, the suspension (each claim RED on a mutant copy, then GREEN) ========
// a mutant copy of tools/operator.mjs (beside it, so its relative imports resolve), loaded once and removed
const mutantsLeft = [];
// mutantOp(pairs) -> a scratch copy of the tool with each [from, to] applied: in tools/operator.mjs, or in src/beta.js (the beta's
// places, sprint 21: a copy of it beside the tool, which the scratch tool imports in its place — src/beta.js is pure, it imports
// nothing)
async function mutantOp(pairs) {
  let t = readFileSync(join(ENGINE, "tools", "operator.mjs"), "utf8"), b = readFileSync(join(ENGINE, "src", "beta.js"), "utf8"), beta = false;
  for (const [from, to] of pairs) {
    if (t.includes(from)) t = t.split(from).join(to);
    else if (b.includes(from)) { b = b.split(from).join(to); beta = true; }
    else throw new Error(`mutantOp: neither operator.mjs nor src/beta.js holds ${from.slice(0, 70)}`);
  }
  const tag = Math.random().toString(36).slice(2);
  if (beta) {
    const bp = join(ENGINE, "tools", `.beta-mutant-${tag}.mjs`);
    writeFileSync(bp, b); mutantsLeft.push(bp);
    if (!t.includes('"../src/beta.js"')) throw new Error("mutantOp: operator.mjs no longer imports ../src/beta.js");
    t = t.split('"../src/beta.js"').join(`"./.beta-mutant-${tag}.mjs"`);
  }
  const path = join(ENGINE, "tools", `.operator-mutant-${tag}.mjs`);
  writeFileSync(path, t); mutantsLeft.push(path);
  return import(pathToFileURL(path).href);
}
// the world: org 1 (team), the suites' org 2 (settings.suites), org 3 (free: two people, one project, a file of 1,234 bytes)
const world = () => {
  const db = fresh();
  db.exec("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (1, 'Ryuklabs', '2026-10-01', '2026-10-01', 'team')");
  db.exec("INSERT INTO org (id, name, settings, created_at, updated_at) VALUES (2, 'Suites', '{\"suites\":true}', '2026-10-01', '2026-10-01')");
  db.exec("INSERT INTO org (id, name, settings, created_at, updated_at) VALUES (3, 'Acme', '{\"domain\":\"https://acme.test\"}', '2026-10-01', '2026-10-01')");
  db.exec("INSERT INTO projects (key, name, active, created_at) VALUES ('o3--web', 'Web', 1, '2026-10-01')");
  seat(db, "a1", "ada@acme.test", 3); seat(db, "a2", "bo@acme.test", 3);
  db.exec("INSERT INTO artifacts (id, person_id, kind, r2_key, sha256, bytes, group_tag, created_at, org) VALUES ('f1', 'a1', 'other', 'inbox/x', 'h', 1234, 'report', '2026-10-01', 3)");
  return db;
};
const planRow = (db, p) => db.prepare("SELECT people, projects, items_month, calls_day, burst_minute, storage_bytes FROM plan_limits WHERE plan = ?").get(p);
const orgOf = (db, id) => db.prepare("SELECT * FROM org WHERE id = ?").get(id);
const cliRec = (db, recordDir, DB = null) => async (...argv) => {
  const said = [], errs = [];
  let opened = 0;
  const dir = mkdtempSync(join(tmpdir(), "operator-selftest-")), cfg = join(dir, "wrangler.jsonc");
  writeFileSync(cfg, `{ "name": "t", "d1_databases": [{ "binding": "DB", "database_name": "test-db", "database_id": "00000000-0000-0000-0000-000000000000" }] }\n`);
  try {
    const rc = await OP.run(argv.map((a) => (a === "CFG" ? cfg : a === "DIR" ? dir : a)), { recordDir, open: async () => { opened++; return { DB: DB || d1(db), database: "test:db", close: async () => {} }; }, say: (x) => said.push(String(x)), err: (x) => errs.push(String(x)) });
    return { rc, said, errs, opened };
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
const recDir = mkdtempSync(join(tmpdir(), "operator-records-"));
try {
  // O11 · list-orgs
  {
    const db = world();
    const rows = await OP.listOrgs(d1(db), { now: Date.parse("2026-10-09T12:00:00Z") });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    const l3 = by[3] && by[3].shown && by[3].shown.limits;
    ok(rows.length === 3 && by[1].plan === "team" && /^org 1/.test(by[1].operating || "") && /suites/.test(by[2].operating || "") && !by[3].operating && by[3].slug && by[3].plan === "free"
      && l3 && l3.people.used === 2 && l3.people.allowed === 10 && l3.projects.used === 1 && l3.projects.allowed === 3 && l3.storage_bytes.used === 1234 && l3.storage_bytes.allowed === 1073741824 && l3.calls_day.used === 0
      && by[1].shown.limits.people.allowed === 50 && !by[3].suspended,
      `O11 · list-orgs: each org's id, name, path name, plan, operating mark, and its usage by the check's own definitions (org 3: people ${l3 && l3.people.used}/${l3 && l3.people.allowed}, projects ${l3 && l3.projects.used}/${l3 && l3.projects.allowed}, stored ${l3 && l3.storage_bytes.used})`);
    const c = await cliRec(db, recDir)("list-orgs", "--local", "DIR", "--config", "CFG"), cj = await cliRec(db, recDir)("list-orgs", "--live", "--config", "CFG", "--confirm-live", "test-db", "--json");
    let j = null; try { j = JSON.parse(cj.said.join("\n")); } catch { j = null; }
    ok(c.rc === 0 && /^the beta's places: 1 of 50 taken \(1 org, 0 open codes with no org yet\), 49 left/.test(c.said[0]) && /^3 orgs on test:db:/.test(c.said[1]) && c.said.some((x) => /^ {2}3 {2}Acme {2}\/\S+ {2}plan free/.test(x) && /people 2\/10 · projects 1\/3/.test(x)) && cj.rc === 0 && j && j.orgs.length === 3,
      `O11 · the CLI prints the beta's places at its head (12.7), then one entry per org with its usage, --json answers the same (${c.rc}/${cj.rc})`);
  }
  // O12 · set-plan
  {
    const db = world(), DB = d1(db), before = allText(db);
    const refusals = [await OP.setPlan(DB, 3, "nope"), await OP.setPlan(DB, 99, "team"), await OP.setPlan(DB, 3, "free"), await OP.setPlan(DB, 3, "Bad!")];
    ok(refusals.every((r) => r.refused) && allText(db) === before, `O12 · set-plan refused, nothing written: no such plan row · no such org · already on it · not a plan name (${refusals.map((r) => r.refused.slice(0, 28)).join(" | ")})`);
    const m = await OP.setPlan(DB, 3, "team");
    ok(m.from === "free" && m.to === "team" && orgOf(db, 3).plan === "team" && JSON.stringify(planRow(db, "team")) === JSON.stringify({ people: 50, projects: 25, items_month: 50000, calls_day: 25000, burst_minute: 300, storage_bytes: 26843545600 }),
      "O12 · set-plan points the org at team; team's ruled numbers untouched");
  }
  // O13 · raise: the ruled rows immutable (RED then GREEN), a new row from team's numbers, an existing row's numbers kept, suite's own
  {
    const RULED = { free: { people: 10, projects: 3, items_month: 1500, calls_day: 1000, burst_minute: 60, storage_bytes: 1073741824 }, team: { people: 50, projects: 25, items_month: 50000, calls_day: 25000, burst_minute: 300, storage_bytes: 26843545600 } };
    const ruledHeld = (db) => JSON.stringify(planRow(db, "free")) === JSON.stringify(RULED.free) && JSON.stringify(planRow(db, "team")) === JSON.stringify(RULED.team);
    const attempt = async (M) => { const db = world(), DB = d1(db); const a = await M.raisePlan(DB, 3, "free", { people: 999 }), b = await M.raisePlan(DB, 3, "team", { burst_minute: 9999 }); return { db, a, b, held: ruledHeld(db) }; };
    const mut = await mutantOp([["  if (RULED_PLANS.includes(name)) return { refused:", "  if (false) return { refused:"], [" WHERE ?1 NOT IN ('free', 'team') ON CONFLICT", " ON CONFLICT"], [" WHERE plan_limits.plan NOT IN ('free', 'team')\";", "\";"]]);
    const red = await attempt(mut), green = await attempt(OP);
    ok(!red.held && green.held && green.a.refused && green.b.refused && /ruled plan/.test(green.a.refused), `O13 · RED then GREEN: with the refusal and the SQL guard removed, raise --plan free/team rewrites the ruled numbers (${red.held ? "held" : "changed"}); the real tool refuses both, the rows as ruled`);
    const db = world(), DB = d1(db);
    const sqlOnly = await DB.prepare(OP.PLAN_UPSERT_SQL).bind("free", 1, 1, 1, 1, 1, 1, "x").run();
    ok(Number(sqlOnly.meta.changes) === 0 && ruledHeld(db), "O13 · the upsert's own SQL guard: bound to free directly, it changes nothing (defence in depth)");
    const n1 = await OP.raisePlan(DB, 3, "acme-raised", { people: 75 });
    ok(n1.created && n1.from === "free" && orgOf(db, 3).plan === "acme-raised" && JSON.stringify(planRow(db, "acme-raised")) === JSON.stringify({ ...RULED.team, people: 75 }) && ruledHeld(db),
      `O13 · a new row starts from team's numbers and takes each one given (people 75), the org pointed at it: ${JSON.stringify(planRow(db, "acme-raised"))}`);
    const n2 = await OP.raisePlan(DB, 3, "acme-raised", { projects: 40 });
    ok(!n2.created && JSON.stringify(n2.before) === JSON.stringify({ ...RULED.team, people: 75 }) && JSON.stringify(planRow(db, "acme-raised")) === JSON.stringify({ ...RULED.team, people: 75, projects: 40 }),
      "O13 · an existing row keeps every number not given (people 75 kept, projects 40)");
    const sp = await OP.raisePlan(DB, 2, "suite", { people: 5 });
    const want = Object.fromEntries(OP.LIMIT_COLS.map((c) => [c, OP.SUITE_PLAN[c]]));
    ok(sp.created && orgOf(db, 2).plan === "suite" && JSON.stringify(planRow(db, "suite")) === JSON.stringify({ ...want, people: 5 }) && (await OP.raisePlan(DB, 2, "suite")).after.people === want.people,
      "O13 · --plan suite takes SUITE_PLAN's numbers (the ship's own row, one source), a number given still overrides; raised again bare, it is trued back");
    const bad = [await OP.raisePlan(DB, 3, "x", { people: -1 }), await OP.raisePlan(DB, 3, "x", { people: 1.5 }), await OP.raisePlan(DB, 99, "x"), await OP.raisePlan(DB, 3, "No Way")];
    ok(bad.every((r) => r.refused) && !planRow(db, "x"), `O13 · refused, nothing written: a negative or fractional number, no such org, not a plan name`);
    const c = cliRec(db, recDir);
    const cf = await c("raise", "--org", "3", "--plan", "free", "--people", "99", "--local", "DIR", "--config", "CFG"), ct = await c("raise", "--org", "3", "--plan", "team", "--live", "--config", "CFG", "--confirm-live", "test-db");
    const cn = await c("raise", "--org", "3", "--plan", "x", "--people", "-1", "--local", "DIR", "--config", "CFG"), cno = await c("raise", "--org", "3", "--local", "DIR", "--config", "CFG");
    const cs = await c("raise", "--org", "suites", "--plan", "suite", "--local", "DIR", "--config", "CFG");
    ok(cf.rc === 1 && cf.opened === 0 && /ruled plan/.test(cf.errs.join(" ")) && ct.rc === 1 && ct.opened === 0 && cn.rc === 2 && cno.rc === 2 && cs.rc === 0 && cs.said.some((x) => /--org suites: org 2/.test(x)) && ruledHeld(db),
      `O13 · the CLI: raise free / team refused before any database is opened (${cf.rc}, ${ct.rc}); a bad number or no --plan is a usage error (${cn.rc}, ${cno.rc}); --org suites finds org 2 (${cs.rc})`);
  }
  // O14 · suspend / unsuspend: --really for the operating orgs (RED then GREEN), one key written and removed, nothing else moved
  {
    const attempt = async (M) => { const db = world(), DB = d1(db); const a = await M.suspendOrg(DB, 1), b = await M.suspendOrg(DB, 2); return { a, b, held: !JSON.parse(orgOf(db, 1).settings || "{}").suspended && !JSON.parse(orgOf(db, 2).settings || "{}").suspended }; };
    const mut = await mutantOp([["  if (op && !really) return { refused:", "  if (false) return { refused:"]]);
    const red = await attempt(mut), green = await attempt(OP);
    ok(!red.held && green.held && /--really/.test(green.a.refused || "") && /--really/.test(green.b.refused || ""), `O14 · RED then GREEN: without the --really rule org 1 and the suites' org are suspended by a bare suspend (${red.held ? "held" : "suspended"}); the real tool refuses both (${(green.a.refused || "").slice(0, 60)}…)`);
    const db = world(), DB = d1(db);
    // every row of the database, the org rows with their settings read as JSON less the one key `suspended`
    const others = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'k_find%' AND name <> 'org'").all()
      .map((t) => JSON.stringify(db.prepare(`SELECT * FROM "${t.name}"`).all())).join("\n") +
      JSON.stringify(db.prepare("SELECT * FROM org ORDER BY id").all().map((o) => { const st = JSON.parse(o.settings || "{}"); delete st.suspended; return { ...o, settings: st }; }));
    const before = { all: others(), o3: { ...orgOf(db, 3), settings: undefined } };
    const s3 = await OP.suspendOrg(DB, 3, { at: "2026-10-09T01:00:00.000Z" });
    const st = JSON.parse(orgOf(db, 3).settings);
    ok(s3.suspended && st.suspended && st.suspended.at === "2026-10-09T01:00:00.000Z" && st.domain === "https://acme.test" && others() === before.all,
      `O14 · suspend writes ONE key, settings.suspended {at}; the org's other settings and every other row unchanged (${orgOf(db, 3).settings})`);
    const again = await OP.suspendOrg(DB, 3), un = await OP.unsuspendOrg(DB, 3), un2 = await OP.unsuspendOrg(DB, 3);
    const st2 = JSON.parse(orgOf(db, 3).settings);
    ok(again.refused && un.suspended === false && un2.refused && !("suspended" in st2) && st2.domain === "https://acme.test" && others() === before.all && JSON.stringify({ ...orgOf(db, 3), settings: undefined }) === JSON.stringify(before.o3),
      "O14 · a second suspend is refused; unsuspend removes that key alone (the org's row and every other row as before); a second unsuspend is refused");
    const r1 = await OP.suspendOrg(DB, 1, { really: true }); await OP.unsuspendOrg(DB, 1);
    const c = cliRec(db, recDir);
    const c1 = await c("suspend", "--org", "1", "--local", "DIR", "--config", "CFG"), c2 = await c("suspend", "--org", "suites", "--local", "DIR", "--config", "CFG");
    const c3 = await c("suspend", "--org", "suites", "--really", "--local", "DIR", "--config", "CFG"), c4 = await c("unsuspend", "--org", "2", "--local", "DIR", "--config", "CFG");
    const c5 = await c("suspend", "--org", "99", "--local", "DIR", "--config", "CFG"), c6 = await c("suspend", "--local", "DIR", "--config", "CFG");
    ok(r1.suspended && c1.rc === 1 && /--really/.test(c1.errs.join(" ")) && c2.rc === 1 && c3.rc === 0 && /SUSPENDED/.test(c3.said.join(" ")) && c4.rc === 0 && c5.rc === 1 && c6.rc === 2,
      `O14 · the CLI: org 1 and the suites' org refused without --really (${c1.rc}, ${c2.rc}), with it suspended (${c3.rc}) and lifted (${c4.rc}); no such org (${c5.rc}); no --org (${c6.rc})`);
  }
  // O15 · --live without its database named (RED then GREEN), for every new command
  {
    const db = world();
    const cmds = [["list-orgs"], ["set-plan", "--org", "3", "--plan", "team"], ["raise", "--org", "3", "--plan", "acme-raised"], ["suspend", "--org", "3"], ["unsuspend", "--org", "3"]];
    const tryAll = async (runFn) => {
      const out = [];
      for (const c of cmds) for (const tail of [["--confirm-live", "prod-db"], []]) {
        let opened = 0;
        const dir = mkdtempSync(join(tmpdir(), "operator-selftest-")), cfg = join(dir, "wrangler.jsonc");
        writeFileSync(cfg, `{ "name": "t", "d1_databases": [{ "binding": "DB", "database_name": "test-db", "database_id": "00000000-0000-0000-0000-000000000000" }] }\n`);
        try { out.push({ rc: await runFn([...c, "--live", "--config", cfg, ...tail], { recordDir: recDir, open: async () => { opened++; return { DB: d1(db), database: "test:db", close: async () => {} }; }, say: () => {}, err: () => {} }), opened }); }
        finally { rmSync(dir, { recursive: true, force: true }); }
      }
      return out;
    };
    const before = allText(db);
    const mut = await mutantOp([["  if (live && flag(\"--confirm-live\") !== cfg.d1_databases[0].database_name) {", "  if (false) {"]]);
    const red = await tryAll(mut.run);
    const db2before = allText(db);
    void db2before;
    const green = await tryAll(OP.run);
    ok(red.some((x) => x.opened > 0) && green.every((x) => x.rc === 1 && x.opened === 0), `O15 · RED then GREEN: without the rule a --live naming another database (or none) opens it (${red.filter((x) => x.opened).length} of ${red.length}); the real tool refuses all ${green.length} with 1, nothing opened`);
    void before;
  }
  // O16 · the run records: written BEFORE the write (RED then GREEN), completed after; a refusal recorded; never a secret
  {
    const recordAtWrite = async (runFn, argv) => {
      const db = world(), dir = mkdtempSync(join(tmpdir(), "operator-rec-"));
      const base = d1(db);
      let seenAtWrite = null;
      const isWrite = (sql) => /^\s*(UPDATE org|INSERT INTO plan_limits)/.test(sql);
      const peek = () => readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
      const DB = { prepare: (q) => { const st = base.prepare(q); const wrap = (s2) => ({ ...s2, bind: (...a) => wrap(s2.bind(...a)), run: async () => { if (isWrite(q) && seenAtWrite === null) seenAtWrite = peek(); return s2.run(); } }); return wrap(st); },
        batch: async (list) => { if (seenAtWrite === null) seenAtWrite = peek(); return base.batch(list); } };
      const cfgDir = mkdtempSync(join(tmpdir(), "operator-selftest-")), cfg = join(cfgDir, "wrangler.jsonc");
      writeFileSync(cfg, `{ "name": "t", "d1_databases": [{ "binding": "DB", "database_name": "test-db", "database_id": "00000000-0000-0000-0000-000000000000" }] }\n`);
      try {
        const rc = await runFn([...argv, "--local", cfgDir, "--config", cfg], { recordDir: dir, open: async () => ({ DB, database: "test:db", close: async () => {} }), say: () => {}, err: () => {} });
        return { rc, atWrite: seenAtWrite || [], after: peek() };
      } finally { rmSync(dir, { recursive: true, force: true }); rmSync(cfgDir, { recursive: true, force: true }); }
    };
    const W = ["set-plan", "--org", "3", "--plan", "team"];
    const mut = await mutantOp([["  let rec = { format: \"operator-run/1\", cmd, at, state: \"writing\", ...fields };\n  const save = () => writeFileSync(path, JSON.stringify(rec, null, 1) + \"\\n\");\n  save();\n",
      "  let rec = { format: \"operator-run/1\", cmd, at, state: \"writing\", ...fields };\n  const save = () => writeFileSync(path, JSON.stringify(rec, null, 1) + \"\\n\");\n"]]);
    const red = await recordAtWrite(mut.run, W), green = await recordAtWrite(OP.run, W);
    ok(red.rc === 0 && red.atWrite.length === 0 && green.rc === 0 && green.atWrite.length === 1 && green.atWrite[0].state === "writing" && green.atWrite[0].before.plan === "free" && green.atWrite[0].plan === "team",
      `O16 · RED then GREEN: a record saved only at the end is absent when the write runs (${red.atWrite.length}); the real tool's record is on disk BEFORE the write, state writing, the org's plan before (free) and what is asked (team)`);
    const g = green.after[0] || {};
    ok(green.after.length === 1 && g.state === "done" && g.after.plan === "team" && g.result.from === "free" && g.database === "test:db" && g.org === 3 && g.finishedAt,
      `O16 · completed after: state done, the org's plan after and the undo's facts (${JSON.stringify({ state: g.state, from: g.result && g.result.from, to: g.after && g.after.plan })})`);
    const each = [];
    for (const argv of [["raise", "--org", "3", "--plan", "acme-raised", "--people", "70"], ["suspend", "--org", "3"], ["suspend", "--org", "1"], ["raise", "--org", "3", "--plan", "nope", "--people", "x"]]) each.push(await recordAtWrite(OP.run, argv));
    const [ra, su, re, us] = each;
    ok(ra.after.length === 1 && ra.after[0].state === "done" && ra.after[0].planRowBefore === null && ra.after[0].limits.people === 70 && su.after[0].state === "done" && /suspended/.test(su.after[0].after.settings)
      && re.rc === 1 && re.after.length === 1 && re.after[0].state === "refused" && /--really/.test(re.after[0].why) && us.rc === 2 && us.after.length === 0
      && !each.some((e) => /key_hash|pass_hash|code_hash|token/.test(JSON.stringify(e.after))),
      `O16 · raise and suspend each recorded done; a refused write (suspend org 1 bare) is recorded refused with why; a usage error writes no record; no record holds a secret (${each.map((e) => e.rc).join("/")})`);
  }
  // O17 · THE DOOR (the real src/index.js in-process): a suspended org's people meet ONE 403 org_suspended at every door — MCP, REST,
  // a page under its address, a write (never counted) — while another org answers; another org's credential at its address is
  // still the one not-here 404; nothing of the org is deleted, and unsuspend answers at once. RED then GREEN: the one check removed.
  {
    const { sqliteWorker, d1: wd1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
    const { cpSync } = await import("node:fs");
    const doorRun = async (src) => {
      const w = await sqliteWorker({ projects: ["alpha"], people: [["p-o", "Owen", "owner", "o1-key", ["alpha"]]], src,
        orgs: [{ id: 2, name: "Busy", projects: ["web"], people: [["b-o", "Bea", "owner", "b-key", ["web"]]] }, { id: 3, name: "Calm", projects: ["app"], people: [["c-o", "Cal", "owner", "c-key", ["app"]]] }] });
      const slug2 = w.db.prepare("SELECT slug FROM org WHERE id = 2").get().slug;
      const req = (method, path, key, { body, html } = {}) => w.fetch(new Request(w.origin + path, { method, headers: { authorization: `Bearer ${key}`, accept: html ? "text/html" : "application/json",
        ...(html ? { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }));
      const pre = await w.mcp("preview", { project: "o2--web", items: [{ contribution: { lane: "leader", kind: "note", what: "before the suspension", why: "kept" } }] }, "b-key");
      const dump = () => ["transmission", "previews", "projects", "people", "artifacts"].map((t) => JSON.stringify(w.db.prepare(`SELECT * FROM ${t} WHERE ${t === "previews" ? "project LIKE 'o2--%'" : t === "projects" ? "key LIKE 'o2--%'" : "org = 2"} ORDER BY 1`).all())).join("\n");
      const kept = dump();
      await OP.suspendOrg(w.env.DB, 2, { at: "2026-10-09T02:00:00.000Z" });
      w.env.DB = wd1(w.db);   // a minute later: the org row's per-isolate cache is keyed by the binding (a fresh one, a fresh isolate)
      const usage = () => JSON.stringify(w.db.prepare("SELECT calls_day, calls_minute FROM org_usage WHERE org = 2").get() || {});
      const u0 = usage();
      const m = await w.mcp("whoami", {}, "b-key");
      const rw = await req("GET", "/whoami", "b-key"), rp = await req("POST", "/preview", "b-key", { body: { project: "o2--web", items: [{ contribution: { lane: "leader", kind: "note", what: "during", why: "x" } }] } });
      const pg = await req("GET", `/${slug2}/home`, "b-key", { html: true });
      const other = await w.mcp("whoami", {}, "c-key"), cross = await req("GET", `/${slug2}/home`, "c-key", { html: true });
      const jr = await rw.json().catch(() => null), jp = await rp.json().catch(() => null), page = await pg.text();
      const u1 = usage();
      await OP.unsuspendOrg(w.env.DB, 2);
      const back = await w.mcp("whoami", {}, "b-key"), backPage = await req("GET", `/${slug2}/home`, "b-key", { html: true });
      return {
        suspended: m.status === 403 && rw.status === 403 && jr && jr.error === "org_suspended" && /ask the operator/i.test(jr.note) && rp.status === 403 && jp && jp.error === "org_suspended"
          && pg.status === 403 && /This org is suspended/.test(page) && u0 === u1,
        others: other.status === 200 && !other.isError && cross.status === 404,
        restored: pre.status === 200 && back.status === 200 && !back.isError && backPage.status === 200 && dump() === kept,
        detail: `mcp ${m.status} rest ${rw.status} write ${rp.status} page ${pg.status} counted ${u0}->${u1}; other org ${other.status}, its key at the address ${cross.status}; after unsuspend ${back.status}/${backPage.status}`,
      };
    };
    const dir = mkdtempSync(join(ENGINE, ".operator-door-mutant-"));
    try {
      cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
      const ip = join(dir, "src", "index.js"), it = readFileSync(ip, "utf8");
      const CHECK = `&& suspensionOf(await db(env).prepare("SELECT settings FROM org WHERE id = {org}").first())) return suspendedAnswer(`;
      ok(it.includes(CHECK), "O17 · the mutant: src/index.js holds the one suspension check");
      writeFileSync(ip, it.split(CHECK).join("&& false) return suspendedAnswer("));
      const red = await doorRun(join(dir, "src"));
      ok(!red.suspended, `O17 · RED: with the one check removed the suspended org's doors answer as before (${red.detail})`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const green = await doorRun(undefined);
    ok(green.suspended, `O17 · GREEN: every door of the suspended org — MCP, REST, a write (not counted), its page under its address — answers ONE 403 org_suspended (${green.detail})`);
    ok(green.others, `O17 · another org answers, and its credential at the suspended org's address is still the one not-here 404 (membership never told)`);
    ok(green.restored, "O17 · unsuspend: the doors answer at once (the suspended row is read fresh), and nothing of the org was deleted (its rows as before)");
  }
  // ======== sprint 11, 11.3 · the platform's OpenAI domain verification (the deployment's KV, one key) ========
  {
    const { kv } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
    const { OPENAI_CHALLENGE_KEY } = await import(pathToFileURL(join(ENGINE, "src", "wellknown.js")).href);
    // O18
    const KV = kv();
    const s1 = await OP.setChallenge(KV, "abc_DEF-123.x~y"), v1 = await KV.get(OPENAI_CHALLENGE_KEY);
    const s2 = await OP.setChallenge(KV, "second-token"), v2 = await KV.get(OPENAI_CHALLENGE_KEY);
    ok(s1.token === "abc_DEF-123.x~y" && s1.before === null && v1 === "abc_DEF-123.x~y" && s2.before === "abc_DEF-123.x~y" && v2 === "second-token" && (await KV.list()).keys.length === 1,
      `O18 · set stores the token exactly under its one key (${OPENAI_CHALLENGE_KEY}); a second set replaces it and says what it replaced`);
    const BAD = ["", "a b", "line\nbreak", "tok/en", "x".repeat(513), undefined, "tok\u00e9n"];
    const bad = [];
    for (const b of BAD) bad.push(await OP.setChallenge(KV, b));
    ok(bad.every((r) => r.refused) && (await KV.get(OPENAI_CHALLENGE_KEY)) === "second-token", `O18 · empty, a space, a line break, a slash, 513 characters, none, a non-ASCII letter: each refused, the stored token unchanged`);
    const mut = await mutantOp([["  if (bad) return { refused: `--token ", "  if (false) return { refused: `--token "]]);
    const KVr = kv(); await mut.setChallenge(KVr, "a b\nc");
    ok((await KVr.get(OPENAI_CHALLENGE_KEY)) === "a b\nc" && (await OP.setChallenge(kv(), "a b\nc")).refused, "O18 · RED then GREEN: with the validator disabled a token with a space and a line break is stored; the real tool refuses it");
    const c1 = await OP.clearChallenge(KV), c2 = await OP.clearChallenge(KV);
    ok(c1.before === "second-token" && (await KV.get(OPENAI_CHALLENGE_KEY)) === null && c2.refused, `O18 · clear removes it (it held ${c1.before}); a second clear is refused (${c2.refused})`);
    // O19 · the CLI
    const dir = mkdtempSync(join(tmpdir(), "operator-selftest-"));
    try {
      const cfg = join(dir, "wrangler.jsonc"), nokv = join(dir, "nokv.jsonc");
      writeFileSync(cfg, `{ "name": "t", "d1_databases": [{ "binding": "DB", "database_name": "test-db", "database_id": "00000000-0000-0000-0000-000000000000" }], "kv_namespaces": [{ "binding": "OAUTH_KV", "id": "kv-test" }] }\n`);
      writeFileSync(nokv, `{ "name": "t", "d1_databases": [{ "binding": "DB", "database_name": "test-db", "database_id": "00000000-0000-0000-0000-000000000000" }] }\n`);
      const K = kv();
      const cli = async (...argv) => {
        const said = [], errs = [], how = [];
        const rc = await OP.run(argv, { recordDir: recDir, open: async (_c, o) => { how.push(o); return o && o.kv ? { KV: K, database: "test:kv", close: async () => {} } : { DB: d1(fresh()), database: "test:db", close: async () => {} }; }, say: (x) => said.push(String(x)), err: (x) => errs.push(String(x)) });
        return { rc, said, errs, opened: how.length, how };
      };
      const none = await cli("set-openai-challenge", "--local", dir, "--config", cfg), badc = await cli("set-openai-challenge", "--token", "has space", "--local", dir, "--config", cfg);
      const empty = await cli("set-openai-challenge", "--token", "--local", dir, "--config", cfg);
      const wrong = await cli("set-openai-challenge", "--token", "tok-1", "--live", "--config", cfg, "--confirm-live", "prod-db"), nk = await cli("clear-openai-challenge", "--local", dir, "--config", nokv);
      ok(none.rc === 2 && badc.rc === 1 && empty.rc === 1 && wrong.rc === 1 && nk.rc === 2 && [none, badc, empty, wrong, nk].every((x) => x.opened === 0) && (await K.get(OPENAI_CHALLENGE_KEY)) === null,
        `O19 · no --token (${none.rc}), a bad token (${badc.rc}), --token with no value (${empty.rc}), --live naming another database (${wrong.rc}), no OAUTH_KV (${nk.rc}): refused before anything is opened`);
      const sl = await cli("set-openai-challenge", "--token", "tok-1", "--local", dir, "--config", cfg);
      const sv = await cli("set-openai-challenge", "--token", "tok-2", "--live", "--config", cfg, "--confirm-live", "test-db");
      ok(sl.rc === 0 && sl.how[0].kv === true && sl.said.some((x) => /answers tok-1/.test(x)) && sv.rc === 0 && sv.said.some((x) => /replacing tok-1 \(undo: set-openai-challenge --token tok-1\)/.test(x)) && (await K.get(OPENAI_CHALLENGE_KEY)) === "tok-2",
        `O19 · --local stores (${sl.rc}, the backend opened with kv), --live with the config's own name stores and names the undo (${sv.rc})`);
      const cl = await cli("clear-openai-challenge", "--local", dir, "--config", cfg), cl2 = await cli("clear-openai-challenge", "--local", dir, "--config", cfg);
      ok(cl.rc === 0 && /cleared/.test(cl.said.join(" ")) && cl2.rc === 1 && (await K.get(OPENAI_CHALLENGE_KEY)) === null, `O19 · clear (${cl.rc}), then nothing to clear (${cl2.rc})`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    // O20 · THE DOOR
    const { sqliteWorker } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
    const { cpSync } = await import("node:fs");
    const P = "/.well-known/openai-apps-challenge", TOK = "oai-" + Math.random().toString(36).slice(2) + "_Z.9~";
    const doorRun = async (src) => {
      const w = await sqliteWorker({ projects: ["alpha"], people: [["p-o", "Owen", "owner", "o1-key", ["alpha"]]], src, orgs: [{ id: 2, name: "Busy", projects: ["web"], people: [["b-o", "Bea", "owner", "b-key", ["web"]]] }] });
      const slug2 = w.db.prepare("SELECT slug FROM org WHERE id = 2").get().slug;
      const base = w.env.DB;
      let stmts = 0;
      w.env.DB = { ...base, prepare: (q) => { stmts++; return base.prepare(q); }, batch: (l) => { stmts++; return base.batch(l); } };
      const get = async (path, { method = "GET", key } = {}) => {
        const r = await w.fetch(new Request(w.origin + path, { method, headers: { accept: "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) } }));
        return { status: r.status, type: r.headers.get("content-type") || "", body: await r.text() };
      };
      const unset = await get(P);
      await OP.setChallenge(w.env.OAUTH_KV, TOK);
      const s0 = stmts;
      const set = await get(P), head = await get(P, { method: "HEAD" }), bearer = await get(P, { key: "b-key" });
      const reads = stmts - s0;
      const s1 = stmts; await get("/health"); const counted = stmts - s1;   // the instrument: a route that reads D1 is counted
      const atOrg = await get(`/${slug2}${P}`, { key: "b-key" });
      await w.env.OAUTH_KV.put(OPENAI_CHALLENGE_KEY, "not a token");
      const junk = await get(P);
      await w.env.OAUTH_KV.put(OPENAI_CHALLENGE_KEY, TOK); await OP.clearChallenge(w.env.OAUTH_KV);
      const cleared = await get(P);
      let j = null; try { j = JSON.parse(unset.body); } catch { j = null; }
      return { unset, set, head, bearer, reads, counted, atOrg, junk, cleared, unsetJson: j };
    };
    const mdir = mkdtempSync(join(ENGINE, ".operator-door-mutant-"));
    try {
      cpSync(join(ENGINE, "src"), join(mdir, "src"), { recursive: true });
      const ip = join(mdir, "src", "index.js"), it = readFileSync(ip, "utf8");
      const ROUTE = `if (path === "${P}" && (request.method === "GET" || request.method === "HEAD")) {`;
      ok(it.split(ROUTE).length === 2, "O20 · the mutant: src/index.js holds the one challenge route");
      writeFileSync(ip, it.split(ROUTE).join(`if (false) {`));
      const red = await doorRun(join(mdir, "src"));
      ok(!(red.set.status === 200 && red.set.body === TOK), `O20 · RED: with the route removed the stored token is not answered (${red.set.status})`);
    } finally { rmSync(mdir, { recursive: true, force: true }); }
    const g = await doorRun(undefined);
    ok(g.unset.status === 404 && g.unsetJson && g.unsetJson.error === "not_found", `O20 · none stored: 404 not_found (${g.unset.status} ${g.unset.body.slice(0, 60).replace(/\s+/g, " ")})`);
    ok(g.set.status === 200 && /^text\/plain\b/.test(g.set.type) && g.set.body === TOK && g.bearer.status === 200 && g.bearer.body === TOK && g.head.status === 200 && g.head.body === "" && g.reads === 0 && g.counted > 0,
      `O20 · GREEN: after a set 200 ${g.set.type}, exactly the token (${g.set.body.length} characters, no newline), a bearer or none alike; HEAD 200 with no body; ${g.reads} D1 statements (GET /health, the instrument: ${g.counted})`);
    ok(g.atOrg.status === 404 && !g.atOrg.body.includes(TOK) && /text\/html/.test(g.atOrg.type), `O20 · under an org's address: the one not-here 404 (${g.atOrg.status} ${g.atOrg.type}), never the token`);
    ok(g.junk.status === 404 && g.cleared.status === 404, `O20 · a stored value of no token's form is 404 (${g.junk.status}); after clear 404 (${g.cleared.status})`);
  }
  // ======== sprint 12, 12.7 · the beta's 50 places (the owner's ruling, 2026-10-10; each rule RED on a mutant copy, then GREEN) ========
  {
    // fill(db, { orgs, codes, ... }): outside orgs up to `orgs` (world's org 3, Acme, is the first) and `codes` open codes of emails
    // with no account; expired / used / revoked codes; the platform's own orgs (a reviewer world, a ship's suite org)
    const FAR = "2099-01-01T00:00:00.000Z", PAST = "2000-01-01T00:00:00.000Z";
    const code = (db, email, { exp = FAR, used = null, revoked = null } = {}) => db.prepare("INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at, used_at, used_how, revoked_at) VALUES (?, ?, ?, '2026-10-01', ?, ?, ?, ?)")
      .run(`c-${email}`, email, `h-${email}`, exp, used, used ? "created" : null, revoked);
    const fill = (db, { orgs = 1, codes = 0 } = {}) => {
      for (let i = 0; i < orgs - 1; i++) db.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (?, ?, '2026-10-01', '2026-10-01')").run(100 + i, `Outside ${i}`);
      for (let i = 0; i < codes; i++) code(db, `wait${i}@example.org`);
      return db;
    };
    const codeRows = (db) => db.prepare("SELECT COUNT(*) AS n FROM signup_codes").get().n;
    const tryAllow = async (M, db, email, beta = {}) => { const before = allText(db); const r = await M.allowEmail(d1(db), email, { beta }); return { r, written: allText(db) !== before }; };
    // O21 · at 49 the 50th is allowed and says 0 left; at 50 refused with nothing written; --beyond-cap allows and says so
    {
      const db = fill(world(), { orgs: 48, codes: 1 });
      const p = await OP.betaPlaces(d1(db));
      const a = await cliRec(db, recDir)("allow", "--email", "fiftieth@example.org", "--local", "DIR", "--config", "CFG");
      ok(p.orgs === 48 && p.codes === 1 && p.left === 1 && a.rc === 0 && a.said.some((x) => /^ {2}the beta's places: 0 of 50 left after this one \(48 orgs, 1 open code before it\)$/.test(x)) && /^ {2}code: /.test(a.said[a.said.length - 2]),
        `O21 · at 49 places taken (48 orgs, 1 open code) the 50th allow is minted and says 0 of 50 left (${a.rc}: ${(a.said.find((x) => /places/.test(x)) || "").trim()})`);
      const before = allText(db), rows = codeRows(db);
      const b = await cliRec(db, recDir)("allow", "--email", "fifty-first@example.org", "--local", "DIR", "--config", "CFG");
      ok(b.rc === 1 && /^refused \(nothing written\): the beta's 50 places are taken: 48 orgs, 2 open codes .*--beyond-cap/.test(b.errs.join("\n")) && !b.said.some((x) => /code: /.test(x)) && allText(db) === before && codeRows(db) === rows,
        `O21 · at 50 the 51st is refused (exit ${b.rc}), --beyond-cap named, nothing written (${b.errs.join(" ").slice(0, 110)}…)`);
      const c = await cliRec(db, recDir)("allow", "--email", "fifty-first@example.org", "--local", "DIR", "--config", "CFG", "--beyond-cap");
      ok(c.rc === 0 && c.said.some((x) => /^ {2}--beyond-cap: allowed PAST the beta's 50 places — 51 of 50 taken with this one/.test(x)) && codeRows(db) === rows + 1,
        `O21 · --beyond-cap allows the 51st and says so (${c.rc}: ${(c.said.find((x) => /beyond/.test(x)) || "").trim().slice(0, 90)}…)`);
      const l = await cliRec(db, recDir)("list", "--local", "DIR", "--config", "CFG"), lo = await cliRec(db, recDir)("list-orgs", "--local", "DIR", "--config", "CFG");
      const lj = await cliRec(db, recDir)("list", "--local", "DIR", "--config", "CFG", "--json");
      let j = null; try { j = JSON.parse(lj.said.join("\n")); } catch { j = null; }
      const HEAD = /^the beta's places: 51 of 50 taken \(48 orgs, 3 open codes with no org yet\), 0 left \(1 beyond the cap\)/;
      ok(HEAD.test(l.said[0]) && HEAD.test(lo.said[0]) && j && j.places.taken === 51 && j.places.cap === 50 && j.allowed.length === 3,
        `O21 · list and list-orgs say the same count at their head, list --json carries it (${l.said[0].slice(0, 80)}…)`);
      const RED = await mutantOp([["    if (places.beyond && !beta.beyond) return { refused:", "    if (false) return { refused:"]]);
      const red = await tryAllow(RED, fill(world(), { orgs: 49, codes: 1 }), "over@example.org"), green = await tryAllow(OP, fill(world(), { orgs: 49, codes: 1 }), "over@example.org");
      ok(red.written && red.r.code && !green.written && green.r.refused, `O21 · RED then GREEN: without the refusal the 51st is minted (${red.written ? "written" : "held"}); the real tool refuses it, nothing written`);
      const again = fill(world(), { orgs: 49 }); code(again, "back@example.org");
      const ag = await tryAllow(OP, again, "back@example.org");
      ok(ag.r.code && ag.r.places.leftAfter === 0 && ag.r.places.codes === 0, "O21 · at 50, allowing again the email whose open code holds the 50th place replaces that code (0 left), it does not take a 51st");
    }
    // O22 · the platform's own orgs never count: org 1, the suites' org (by its settings, not its id), a reviewer world, a suite org
    {
      const own = (db) => {
        db.exec("INSERT INTO org (id, name, plan, created_at, updated_at) VALUES (90, 'Reviewer', 'reviewer', '2026-10-01', '2026-10-01')");
        db.exec("INSERT INTO org (id, name, plan, created_at, updated_at) VALUES (91, 'Xorg throwaway', 'suite', '2026-10-01', '2026-10-01')");
        db.exec("INSERT INTO org (id, name, settings, created_at, updated_at) VALUES (92, 'Suites too', '{\"suites\":true}', '2026-10-01', '2026-10-01')");
        return db;
      };
      const g = await tryAllow(OP, own(fill(world(), { orgs: 49 })), "own@example.org");
      ok(g.r.code && g.r.places.orgs === 49 && g.r.places.leftAfter === 0, `O22 · with 49 outside orgs beside org 1, two suites' orgs, a reviewer world and a suite org: ${g.r.places && g.r.places.orgs} counted, the 50th allowed (0 left)`);
      const RED = await mutantOp([[" AND plan NOT IN ('reviewer', 'suite')\";", "\";"], [" AND COALESCE(json_extract(settings, '$.suites'), 0) <> 1", ""]]);
      const red = await tryAllow(RED, own(fill(world(), { orgs: 49 })), "own@example.org");
      ok(red.r.refused && !red.written && g.written, `O22 · RED then GREEN: counting the platform's own orgs refuses the 50th (${red.r.places && red.r.places.orgs} orgs); the real tool allows it`);
    }
    // O23 · an expired, used or revoked code holds no place; a holder who already made an org is counted once (by its org)
    {
      const stale = (db) => { code(db, "late@example.org", { exp: PAST }); code(db, "done@example.org", { used: "2026-10-02" }); code(db, "gone@example.org", { revoked: "2026-10-02" }); return db; };
      const g = await tryAllow(OP, stale(fill(world(), { orgs: 49 })), "fresh@example.org");
      ok(g.r.code && g.r.places.codes === 0 && g.r.places.leftAfter === 0, `O23 · an expired, a used and a revoked code beside 49 orgs: ${g.r.places && g.r.places.codes} open codes counted, the 50th allowed`);
      const RED = await mutantOp([["WHERE s.used_at IS NULL AND s.revoked_at IS NULL AND s.expires_at > ?1 ", "WHERE ?1 IS NOT NULL "]]);
      const red = await tryAllow(RED, stale(fill(world(), { orgs: 49 })), "fresh@example.org");
      ok(red.r.refused && !red.written, `O23 · RED then GREEN: counting every code refuses the 50th (${red.r.places && red.r.places.codes} codes); the real tool allows it`);
      // the founder: an account (made by its seat) that founded org 900, and an open code for it (a reset, say) — the org counts, the code not
      const founder = (db) => {
        seat(db, "f1", "founder@example.org", 3);
        const acct = db.prepare("SELECT id FROM accounts WHERE email = 'founder@example.org'").get().id;
        db.prepare("INSERT INTO org (id, name, created_by_account, created_at, updated_at) VALUES (900, 'Founded', ?, '2026-10-01', '2026-10-01')").run(acct);
        code(db, "founder@example.org");
        return db;
      };
      const f = await tryAllow(OP, founder(fill(world(), { orgs: 48 })), "next@example.org");
      ok(f.r.code && f.r.places.orgs === 49 && f.r.places.codes === 0 && f.r.places.leftAfter === 0, `O23 · a code whose holder already made an org is counted once: ${f.r.places && f.r.places.orgs} orgs, ${f.r.places && f.r.places.codes} open codes, the 50th allowed`);
      const self = fill(world(), { orgs: 48 }); founder(self); code(self, "other@example.org");
      const s = await tryAllow(OP, self, "founder@example.org");
      ok(s.r.code && s.r.places.need === 0 && s.r.places.leftAfter === 0, `O23 · at 50, allowing the founder again (its account made an org) takes no new place: allowed, ${s.r.places && s.r.places.leftAfter} left`);
      const RED2 = await mutantOp([[" AND NOT EXISTS (SELECT 1 FROM accounts a JOIN org o ON o.created_by_account = a.id WHERE a.email = s.email)\";", "\";"]]);
      const red2 = await tryAllow(RED2, founder(fill(world(), { orgs: 48 })), "next@example.org");
      ok(red2.r.refused && !red2.written, `O23 · RED then GREEN: counting the founder's code beside its org refuses the 50th (${red2.r.places && red2.r.places.orgs} orgs, ${red2.r.places && red2.r.places.codes} codes); the real tool allows it`);
    }
    // O24 · the cap is ONE constant, 50, the owner's ruling named beside it, in src/beta.js (sprint 21, 21.1: the worker's request page
    // reads the same count); the operator's tool holds no copy of it, and the worker does not enforce it (no other file of src/
    // names the cap, none names beyond-cap)
    {
      const tool = readFileSync(join(ENGINE, "tools", "operator.mjs"), "utf8"), beta = readFileSync(join(ENGINE, "src", "beta.js"), "utf8");
      const named = readdirSync(join(ENGINE, "src")).filter((f) => f.endsWith(".js") && f !== "beta.js").filter((f) => /BETA_ORG_CAP|beyond-cap/.test(readFileSync(join(ENGINE, "src", f), "utf8")));
      ok(OP.BETA_ORG_CAP === 50 && (beta.match(/export const BETA_ORG_CAP = /g) || []).length === 1 && /the owner's ruling, 2026-10-10[^\n]*\n(?:\/\/[^\n]*\n){0,3}export const BETA_ORG_CAP = 50;/.test(beta)
        && !/BETA_ORG_CAP = /.test(tool) && /from "\.\.\/src\/beta\.js"/.test(tool) && named.length === 0,
        `O24 · BETA_ORG_CAP is one constant (${OP.BETA_ORG_CAP}) in src/beta.js under the owner's ruling (2026-10-10); the tool imports it; no other file of src/ names it (${named.join(", ") || "none"})`);
    }
  }
} finally {
  rmSync(recDir, { recursive: true, force: true });
  for (const p of mutantsLeft) rmSync(p, { force: true });
}
console.log(`${failed ? "✗" : "✓"} operator selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
