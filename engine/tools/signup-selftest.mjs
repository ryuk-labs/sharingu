// tools/signup-selftest.mjs — sprint 7, slice 7.2 (docs/plan/PLATFORM.md §2 items 8 and 10; migrate-071; src/accounts.js signUp,
// POST /signup): sign-up by allowlist, through the REAL worker (src/index.js over node:sqlite built from boot.sql,
// tools/fixtures/sqlite-worker.mjs) holding two orgs — org 1 and org 2 (sprint 7, 7.4: the sign-up lives at the platform's root; its session lands on the
// account's chosen seat, its org-1 seat first). The
// operator's codes are minted by the operator's own function (tools/operator.mjs allowEmail), as its CLI does. Each case builds
// a fresh world.
//   S1 · (a) an allowed email with no account and its code: an account is made with that passphrase (the code spent: used,
//        created); no seat at the address, so nothing is signed in (JSON signedIn false; a form answers 200 the create-an-org
//        page, its email as typed, nothing else filled in, no cookie, never the passphrase: sprint 21, 21.2); the new passphrase
//        at /login is no_seat_here (right, no seat here)
//   S2 · (b) a migrated org-1 person (an account with NO passphrase, their seat's own secret): the account takes the new one,
//        they are signed in to their org-1 seat; the new passphrase signs in at /login to that seat; the seat's own secret too
//   S3 · (c) the operator-approved reset: an account WITH a passphrase, seated in org 1 and org 2, a live session on each seat:
//        the account takes the new passphrase and BOTH sessions end (every seat of the account, every org); the old passphrase
//        opens nothing; an account in two orgs is signed in to NONE by a JSON sign-up, and the new passphrase at /login asks for
//        the org (409 choose_org: sprint 7's review, A1)
//   S4 · the ONE refusal: an email never allowed, a wrong code, a used code, an expired code, a revoked code, and ANOTHER
//        email's code — each 401 invalid_signup with the same body, each writing only its attempt (accounts, codes, people,
//        tokens unchanged; one failed attempt each)
//   S5 · the lockout: 8 wrong codes on an allowed email, then a 9th wrong code answers 429 too_many_attempts (the code still
//        open); the RIGHT code still signs up (sprint 8, 8.3a, the sprint-7 review's A3: a valid code, the operator's possession
//        proof, bypasses the email's bucket); 8 failed sign-ins lock the email's sign-in, and its code still signs it up
//   S6 · single-use under a race: two sign-ups with the same right code at once — exactly one wins; the other is the refusal
//   S7 · the same-origin guard (a cross-site form: 403 cross_site_signup, nothing written, not even an attempt); the field
//        checks before any read (422 bad_signup: email, code, passphrase, confirm — no attempt written); the address's flood
//        filter (LOGIN_LIMIT, the key POST /login spends: "login:<ip>") answers 429 before any read; a non-ASCII email is 422
//        email_not_ascii before any read (sprint 7's review, A5)
//   S8 · the code is in no row, no answer and no page: the database's every text and every response body of the run
//   S9 · THE OWNER'S RULING (2026-10-09; PLATFORM §3's squat row; RED on the tree before it): an account with ONE active seat
//        and a seat waiting for its yes signs up by JSON to NOTHING (signedIn false, no session minted, the note saying a seat
//        waits and where it is answered); its new passphrase at /login asks (409 choose_org, its one active org) and signs in
//        once `org` names it; a browser's sign-up is untouched (it lands on the picker with its session)
//   S10 · (sprint 21, 21.2: "prefills the org at sign-up") a form sign-up with no seat, for an email with APPROVED requests,
//        answers the org form with the newest one's company as the org's name (and, 21.P D19, its suggested address) and its name
//        as yours; an email whose request is
//        only OPEN, and an email beside another's approved request, get the email alone; the JSON answer unchanged (no page)
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) must turn its case(s) red.
// Exit 1 on any failure. A gate step.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker, d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { allowEmail, revokeEmail } = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
const { pbkdf2 } = await import(pathToFileURL(join(ENGINE, "src", "util.js")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const SALT = "00112233445566778899aabbccddeeff";
const DAY = 24 * 60 * 60 * 1000;

let MUT = {};
const SEEN = [];   // every response body of the clean run (S8 reads it)
async function world() {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src: MUT.src, people: [
    ["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"],
    ["one-mia", "Mia One", "member", "one-mia-key", ["alpha"], "mia@one.test"]],
    orgs: [{ id: 2, name: "Two", projects: ["shop"], people: [["two-owner", "Owner Two", "owner", "two-owner-key", [], "owner@two.test"]] }] });
  const q = (sql, ...a) => w.db.prepare(sql).all(...a);
  const one = (sql, ...a) => w.db.prepare(sql).get(...a);
  const DB = d1(w.db);
  const call = async (method, path, { key, body, form, headers: extra = {} } = {}) => {
    const headers = { accept: form ? "text/html" : "application/json", ...extra };
    if (key) headers.authorization = "Bearer " + key;
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" }));
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
    SEEN.push(text);
    return { status: r.status, text, json, location: r.headers.get("location"), cookie: r.headers.get("set-cookie") };
  };
  const signup = (email, code, password, extra = {}) => call("POST", "/signup", { body: { email, code, password, ...extra } });
  const login = async (email, password) => { const r = await call("POST", "/login", { body: { email, password, device: "signup-selftest" } }); return { status: r.status, error: r.json && r.json.error, token: r.json && r.json.token }; };
  const whoami = async (key) => { const r = await call("GET", "/whoami", { key }); return r.status === 200 ? { id: r.json.id, org: one("SELECT org FROM people WHERE id = ?", r.json.id).org } : { status: r.status }; };
  const allow = (email, o) => allowEmail(DB, email, o);
  const account = (email) => one("SELECT id, pass_hash, pass_salt FROM accounts WHERE email = ?", email);
  const code = (email) => one("SELECT used_at, used_how, revoked_at FROM signup_codes WHERE email = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", email);
  const attempts = (ok = 0) => one("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = ?", ok).n;
  // the rows a refusal must not move: every account, code, person and token
  const snap = () => JSON.stringify([q("SELECT * FROM accounts ORDER BY id"), q("SELECT * FROM signup_codes ORDER BY id"), q("SELECT * FROM people ORDER BY id"), q("SELECT * FROM tokens ORDER BY token_hash")]);
  return { w, q, one, DB, call, signup, login, whoami, allow, account, code, attempts, snap };
}

const CASES = {
  async S1() {
    const W = await world(), out = [];
    const a = await W.allow("New.Person@Fresh.test ");
    const r = await W.signup(" new.person@fresh.test", a.code.toLowerCase(), "fresh-pass-1");
    const acc = W.account("new.person@fresh.test"), c = W.code("new.person@fresh.test");
    out.push([r.status === 200 && r.json.account === "created" && r.json.signedIn === false && !r.json.token && acc && acc.pass_hash === await pbkdf2("fresh-pass-1", acc.pass_salt) && c.used_how === "created" && !!c.used_at,
      `S1 · (a) an allowed email with no account: ${r.status} account ${r.json && r.json.account}, signedIn ${r.json && r.json.signedIn}; the account holds the passphrase; the code ${c && c.used_how}`]);
    const l = await W.login("new.person@fresh.test", "fresh-pass-1");
    out.push([l.status === 403 && l.error === "no_seat_here", `S1 · the new passphrase at /login: ${l.status} ${l.error} (right, and no seat at this address)`]);
    const b = await W.allow("form.person@fresh.test");
    const f = await W.call("POST", "/signup", { form: { email: "form.person@fresh.test", code: b.code, password: "form-passphrase-1", confirm: "form-passphrase-1", web: "1" } });
    out.push([f.status === 200 && !f.location && !f.cookie && /data-screen="org-new"/.test(f.text) && /id="email"[^>]*value="form\.person@fresh\.test"/.test(f.text)
      && /id="name"[^>]*value=""/.test(f.text) && /id="you"[^>]*value=""/.test(f.text) && !f.text.includes("form-passphrase-1"),
      `S1 · a form sign-up with no seat answers the org form (${f.status}), its email as typed, nothing else filled in, no cookie, never the passphrase`]);
    return out;
  },
  async S2() {
    const W = await world(), out = [];
    await W.w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = 'one-mia'").run(await pbkdf2("mia-seat-pass", SALT), SALT);
    const before = W.account("mia@one.test");
    const a = await W.allow("mia@one.test");
    const r = await W.signup("mia@one.test", a.code, "mia-own-pass");
    const who = r.json && r.json.token ? await W.whoami(r.json.token) : {};
    const acc = W.account("mia@one.test");
    out.push([before && before.pass_hash === null && r.status === 200 && r.json.account === "set" && r.json.signedIn === true && who.id === "one-mia" && who.org === 1 && acc.id === before.id && acc.pass_hash !== null,
      `S2 · (b) a migrated person with no account passphrase: ${r.status} account ${r.json && r.json.account}, signed in as ${who.id} (org ${who.org}); the same account takes the passphrase`]);
    const l1 = await W.login("mia@one.test", "mia-own-pass"), l2 = await W.login("mia@one.test", "mia-seat-pass");
    const w1 = l1.token ? await W.whoami(l1.token) : {};
    out.push([l1.status === 200 && w1.id === "one-mia" && w1.org === 1 && l2.status === 200, `S2 · the new passphrase signs in to the org-1 seat (${l1.status}, ${w1.id}); the seat's own secret still does (${l2.status})`]);
    const f = await W.allow("owner@one.test");
    const fw = await W.call("POST", "/signup", { form: { email: "owner@one.test", code: f.code, password: "owner-own-pass", confirm: "owner-own-pass", web: "1" } });
    // sprint 7, 7.4: a web sign-up lands on its chosen seat's org's address (org 1's, /<its path name>)
    const home = "/" + W.w.db.prepare("SELECT slug FROM org WHERE id = 1").get().slug;
    out.push([fw.status === 302 && fw.location === home && /__Host-ar_session=/.test(fw.cookie || ""), `S2 · a form sign-up with a seat is signed in: ${fw.status} -> ${fw.location} (its org's address ${home}), the session cookie set`]);
    return out;
  },
  async S3() {
    const W = await world(), out = [];
    // the owner of org 1 is seated in org 2 too, and holds an account passphrase (as a sign-up or a proven change gives it)
    const t2 = await W.call("POST", "/control", { key: "two-owner-key", form: { action: "add-person", name: "Owner One (in Two)", email: "owner@one.test" } });
    const seat2 = (W.one("SELECT id FROM people WHERE email = 'owner@one.test' AND org = 2") || {}).id;
    // sprint 7's review (A1, migrate-074): the account stands in org 1, so org 2's seat waits for its holder's yes — accepted, as
    // POST /orgs/seat accepts it
    W.w.db.prepare("UPDATE people SET active = 1, pending = 0 WHERE id = ? AND pending = 1").run(seat2 || "");
    await W.w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = 'owner@one.test'").run(await pbkdf2("old-account-pass", SALT), SALT);
    const s0 = await W.login("owner@one.test", "old-account-pass");   // an account in two orgs: the JSON sign-in asks (A1)
    const s1 = s0.status === 409 ? await W.call("POST", "/login", { body: { email: "owner@one.test", password: "old-account-pass", org: W.one("SELECT slug FROM org WHERE id = 1").slug } }).then((r) => ({ status: r.status, token: r.json && r.json.token })) : s0;
    W.w.db.prepare("INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, org) VALUES (?, ?, 'org-2 web', ?, ?, 0, 2)").run(sha("org-2-session"), seat2, new Date().toISOString(), new Date(Date.now() + DAY).toISOString());
    const live = () => W.q("SELECT person_id, revoked FROM tokens WHERE person_id IN ('one-owner', ?) ORDER BY person_id", seat2);
    out.push([t2.status === 200 && !!seat2 && s1.status === 200 && live().filter((t) => t.revoked === 0).length === 2, `S3 · the instrument: one account, seats in org 1 and org 2, a live session on each (${live().filter((t) => t.revoked === 0).length})`]);
    const refused = await W.allow("owner@one.test");
    const a = await W.allow("owner@one.test", { reset: true });
    const r = await W.signup("owner@one.test", a.code, "new-account-pass");
    const after = live();
    // sprint 7's review (A1): a JSON sign-up of an account in two orgs names no org for it: signed up, not signed in, told to name one
    out.push([!!refused.refused && r.status === 200 && r.json.account === "reset" && after.filter((t) => t.revoked === 0).length === 0 && r.json.signedIn === false && !r.json.token && /several orgs/.test(r.json.note),
      `S3 · (c) the reset (allowed only with --reset: ${refused.refused ? "refused without" : "NOT refused without"}): ${r.status} ${r.json && r.json.account}; the old sessions of BOTH seats ended (${after.filter((t) => t.revoked === 1).length} revoked); an account in two orgs is signed in to none (signedIn ${r.json && r.json.signedIn}: "${(r.json && r.json.note || "").slice(0, 50)}…")`]);
    const oldp = await W.login("owner@one.test", "old-account-pass"), newp = await W.login("owner@one.test", "new-account-pass");
    out.push([oldp.status === 401 && newp.status === 409 && newp.error === "choose_org", `S3 · the old account passphrase opens nothing (${oldp.status}); the new one is right, and asks for the org (${newp.status} ${newp.error})`]);
    return out;
  },
  async S4() {
    const W = await world(), out = [];
    const used = await W.allow("used@fresh.test");
    const u = await W.signup("used@fresh.test", used.code, "used-passphrase-1");
    const exp = await W.allow("expired@fresh.test", { at: new Date(Date.now() - 3 * DAY).toISOString(), days: 1 });
    const rev = await W.allow("revoked@fresh.test"); await revokeEmail(W.DB, "revoked@fresh.test");
    const right = await W.allow("right@fresh.test");
    const vic = await W.allow("victim@fresh.test");   // an open code of another email: the cross-email try uses right@'s code on it
    const tries = [["an email never allowed", "never@fresh.test", right.code], ["a wrong code", "right@fresh.test", "AAAAA-BBBBB-CCCCC-DDDDD"],
      ["a used code", "used@fresh.test", used.code], ["an expired code", "expired@fresh.test", exp.code], ["a revoked code", "revoked@fresh.test", rev.code],
      ["another email's code", "victim@fresh.test", right.code], ["another email's code on an org-1 member", "mia@one.test", right.code]];
    const bodies = new Set();
    for (const [what, email, code] of tries) {
      const before = W.snap(), n0 = W.attempts(0);
      const r = await W.signup(email, code, "attacker-pass-1");
      bodies.add(`${r.status} ${r.text}`);
      out.push([r.status === 401 && r.json && r.json.error === "invalid_signup" && W.snap() === before && W.attempts(0) === n0 + 1,
        `S4 · ${what}: ${r.status} ${r.json && r.json.error}; ${W.snap() === before ? "nothing written" : "ROWS MOVED"} but one failed attempt (${W.attempts(0) - n0})`]);
    }
    out.push([u.status === 200 && bodies.size === 1, `S4 · every refusal is ONE answer (${bodies.size} distinct bodies)`]);
    const ok = await W.signup("right@fresh.test", right.code, "right-pass-1");
    out.push([ok.status === 200 && W.code("victim@fresh.test").used_at === null, `S4 · the instrument: the right email with its own code still signs up (${ok.status}); the victim's code untouched`]);
    return out;
  },
  async S5() {
    const W = await world(), out = [];
    const a = await W.allow("guess@fresh.test");
    for (let i = 0; i < 8; i++) await W.signup("guess@fresh.test", `WRONG-${String(i).padStart(5, "0")}-CODE0-00000`, "guess-pass-1");
    const w9 = await W.signup("guess@fresh.test", "WRONG-00009-CODE0-00000", "guess-pass-1");
    out.push([w9.status === 429 && w9.json.error === "too_many_attempts" && W.code("guess@fresh.test").used_at === null && !W.account("guess@fresh.test"),
      `S5 · 8 wrong codes lock the email: a 9th wrong code ${w9.status} ${w9.json && w9.json.error}, the code still open, no account`]);
    // sprint 8, 8.3a (the sprint-7 review's A3): a VALID code is the operator's possession proof — it bypasses the email's bucket
    const r = await W.signup("guess@fresh.test", a.code, "guess-pass-1");
    out.push([r.status === 200 && W.code("guess@fresh.test").used_at !== null && !!(W.account("guess@fresh.test") || {}).pass_hash,
      `S5 · the RIGHT code still signs up past the lock (a valid code bypasses the email's bucket): ${r.status}, the code ${W.code("guess@fresh.test").used_at ? "spent" : "OPEN"}`]);
    const b = await W.allow("mia@one.test");
    for (let i = 0; i < 8; i++) await W.login("mia@one.test", `wrong-${i}`);
    const lg = await W.login("mia@one.test", "wrong-again");
    const m = await W.signup("mia@one.test", b.code, "mia-new-pass");
    out.push([lg.status === 429 && m.status === 200 && W.account("mia@one.test").pass_hash !== null,
      `S5 · 8 failed sign-ins lock the account's sign-in (${lg.status}, one lockout for both doors); its operator's code still signs it up (${m.status})`]);
    return out;
  },
  async S6() {
    const W = await world(), out = [];
    const a = await W.allow("race@fresh.test");
    const [r1, r2] = await Promise.all([W.signup("race@fresh.test", a.code, "race-pass-one"), W.signup("race@fresh.test", a.code, "race-pass-two")]);
    const st = [r1.status, r2.status].sort().join(",");
    const acc = W.account("race@fresh.test");
    const winner = r1.status === 200 ? "race-pass-one" : "race-pass-two";
    out.push([st === "200,401" && acc && acc.pass_hash === await pbkdf2(winner, acc.pass_salt), `S6 · one code, two sign-ups at once: ${st}; the account holds the winner's passphrase`]);
    return out;
  },
  async S7() {
    const W = await world(), out = [];
    const a = await W.allow("guard@fresh.test");
    let before = W.snap(), n = W.attempts(0) + W.attempts(1);
    const x = await W.call("POST", "/signup", { form: { email: "guard@fresh.test", code: a.code, password: "guard-pass-1", confirm: "guard-pass-1", web: "1" }, headers: { "sec-fetch-site": "cross-site" } });
    const xj = await W.call("POST", "/signup", { body: { email: "guard@fresh.test", code: a.code, password: "guard-pass-1" }, headers: { origin: "https://evil.test" } });
    out.push([x.status === 403 && xj.status === 403 && xj.json.error === "cross_site_signup" && W.snap() === before && W.attempts(0) + W.attempts(1) === n,
      `S7 · a cross-site form (${x.status}) and a foreign Origin (${xj.status} ${xj.json && xj.json.error}): nothing written, not even an attempt`]);
    const fields = [["email", { email: "not-an-email", code: a.code, password: "guard-pass-1" }], ["code", { email: "guard@fresh.test", code: " - ", password: "guard-pass-1" }],
      ["passphrase", { email: "guard@fresh.test", code: a.code, password: "abc" }], ["passphrase", { email: "guard@fresh.test", code: a.code, password: "elevenchars", confirm: "elevenchars" }], ["confirm", { email: "guard@fresh.test", code: a.code, password: "guard-pass-1", confirm: "guard-pass-2" }]];
    for (const [field, body] of fields) {
      const r = await W.call("POST", "/signup", { body });
      out.push([r.status === 422 && r.json.error === "bad_signup" && r.json.field === field && W.snap() === before && W.attempts(0) + W.attempts(1) === n, `S7 · a bad ${field}: ${r.status} ${r.json && r.json.error} {field: ${r.json && r.json.field}}, nothing read, nothing written`]);
    }
    const keys = [];
    W.w.env.LOGIN_LIMIT = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
    const fl = await W.call("POST", "/signup", { body: { email: "guard@fresh.test", code: a.code, password: "guard-pass-1" }, headers: { "cf-connecting-ip": "203.0.113.9" } });
    const lg = await W.call("POST", "/login", { body: { email: "guard@fresh.test", password: "guard-pass-1" }, headers: { "cf-connecting-ip": "203.0.113.9" } });
    delete W.w.env.LOGIN_LIMIT;
    out.push([fl.status === 429 && fl.json.error === "too_many_attempts_ip" && lg.status === 429 && keys.length === 2 && keys[0] === "login:203.0.113.9" && keys[1] === keys[0] && W.snap() === before,
      `S7 · the address's flood filter: sign-up ${fl.status} ${fl.json && fl.json.error}, sign-in ${lg.status}, one budget (${[...new Set(keys)].join(", ")})`]);
    // sprint 7's review (A5): an email holding a letter outside ASCII is refused before anything is read (SQLite's lower() and JS's
    // toLowerCase disagree on it: one spelling of an account's email)
    const na = await W.call("POST", "/signup", { body: { email: "JÖRG@x.de", code: a.code, password: "guard-pass-1" } });
    out.push([na.status === 422 && na.json.error === "email_not_ascii" && na.json.field === "email" && W.snap() === before && W.attempts(0) + W.attempts(1) === n,
      `S7 · a non-ASCII email: ${na.status} ${na.json && na.json.error} {field: ${na.json && na.json.field}}, nothing read, nothing written`]);
    const page = await W.call("GET", "/signup", { headers: { accept: "text/html" } });
    out.push([page.status === 200 && /name="email"/.test(page.text) && /name="code"/.test(page.text) && /name="password"/.test(page.text) && /name="confirm"/.test(page.text) && /action="\/signup"/.test(page.text),
      "S7 · GET /signup is the form: email, code, passphrase twice, posting to /signup"]);
    return out;
  },
  async S9() {
    // the owner's ruling (2026-10-09): a seat that waits for its yes makes the JSON sign-up sign in nothing
    const W = await world(), out = [];
    const slug1 = W.one("SELECT slug FROM org WHERE id = 1").slug;
    // org 2's admin seats org 1's owner (an account seated in org 1): the seat waits for its holder's yes
    await W.call("POST", "/control", { key: "two-owner-key", form: { action: "add-person", name: "Owner One (in Two)", email: "owner@one.test" } });
    const w2 = W.one("SELECT active, pending FROM people WHERE email = 'owner@one.test' AND org = 2") || {};
    const live = () => W.one("SELECT COUNT(*) AS n FROM tokens WHERE revoked = 0").n;
    const a = await W.allow("owner@one.test"), t0 = live();
    const r = await W.signup("owner@one.test", a.code, "owner-own-pass");
    const note = String((r.json && r.json.note) || "");
    out.push([w2.active === 0 && w2.pending === 1 && r.status === 200 && r.json.account === "set" && r.json.signedIn === false && !r.json.token && live() === t0 &&
      /waits for your yes/.test(note) && /\/orgs/.test(note) && !/several orgs/.test(note),
      `S9 · one active seat and one that waits: the JSON sign-up ${r.status} ${r.json && r.json.account}, signedIn ${r.json && r.json.signedIn}, nothing minted (${live() - t0}); the note: "${note.slice(0, 60)}…"`]);
    const asked = await W.call("POST", "/login", { body: { email: "owner@one.test", password: "owner-own-pass" } });
    const named = await W.call("POST", "/login", { body: { email: "owner@one.test", password: "owner-own-pass", org: slug1 } });
    const who = named.json && named.json.token ? await W.whoami(named.json.token) : {};
    out.push([asked.status === 409 && asked.json.error === "choose_org" && ((asked.json.orgs || []).map((o) => o.slug).join() === slug1) && named.status === 200 && who.id === "one-owner",
      `S9 · its new passphrase at /login asks (${asked.status} ${asked.json && asked.json.error}) and signs in once org names it (${named.status}, ${who.id})`]);
    // untouched: a browser's sign-up lands on the picker with its session (Mia: org 2 seats her, the seat waits)
    await W.call("POST", "/control", { key: "two-owner-key", form: { action: "add-person", name: "Mia (in Two)", email: "mia@one.test" } });
    const m = await W.allow("mia@one.test");
    const f = await W.call("POST", "/signup", { form: { email: "mia@one.test", code: m.code, password: "mia-own-passphrase", confirm: "mia-own-passphrase", web: "1" } });
    out.push([f.status === 302 && f.location === "/orgs" && /__Host-ar_session=/.test(f.cookie || ""),
      `S9 · untouched: a browser's sign-up lands on the picker (${f.status} -> ${f.location}), its session cookie set`]);
    return out;
  },
  async S10() {
    const W = await world(), out = [];
    // req(id, email, company, status, approvedAt): a request as the worker files it and the operator's allow --request approves it
    const req = (id, email, company, status, at = null) => W.w.db.prepare("INSERT INTO access_requests (id, email, name, company, role, team_size, status, token_hash, created_at, updated_at, approved_at) " +
      "VALUES (?, ?, ?, ?, 'Founder', '2-10', ?, ?, '2026-10-13T09:00:00.000Z', '2026-10-13T09:00:00.000Z', ?)").run(id, email, `Grace ${id}`, company, status, `th-${id}`, at);
    req("q-old", "grace@fresh.test", "Old Co", "approved", "2026-10-13T10:00:00.000Z"); req("q-new", "grace@fresh.test", "Hopper Labs", "approved", "2026-10-13T11:00:00.000Z");
    req("q-open", "waits@fresh.test", "Open Co", "open"); req("q-other", "other@fresh.test", "Not Yours", "approved", "2026-10-13T11:00:00.000Z");
    const form = async (email, pass) => { const c = await W.allow(email); return W.call("POST", "/signup", { form: { email, code: c.code, password: pass, confirm: pass, web: "1" } }); };
    const g = await form("Grace@Fresh.test", "grace-passphrase-1"), o = await form("waits@fresh.test", "waits-passphrase-1"), n = await form("nobody@fresh.test", "nobody-passphrase-1");
    const val = (t, f) => (new RegExp(`id="${f}"[^>]*value="([^"]*)"`).exec(t) || [])[1];
    out.push([g.status === 200 && /data-screen="org-new"/.test(g.text) && val(g.text, "email") === "Grace@Fresh.test" && val(g.text, "name") === "Hopper Labs" && val(g.text, "you") === "Grace q-new" && val(g.text, "slug") === "hopper-labs"
      && /id="password"[^>]*autofocus/.test(g.text) && !g.text.includes("grace-passphrase-1"),
      `S10 · an approved request: the org form holds the newest one's company (${val(g.text, "name")}) and name (${val(g.text, "you")}), the email as typed, the address suggested from the company (${val(g.text, "slug")}, 21.P D19), the passphrase focused, never echoed`]);
    out.push([o.status === 200 && val(o.text, "name") === "" && val(o.text, "you") === "" && n.status === 200 && val(n.text, "name") === "" && !/Not Yours|Open Co/.test(o.text + n.text),
      `S10 · a request only open, and another email's approved one, fill in nothing but the email (${val(o.text, "name") === "" && val(n.text, "name") === ""})`]);
    const j = await W.allow("json@fresh.test");
    req("q-json", "json@fresh.test", "Json Co", "approved", "2026-10-13T11:00:00.000Z");
    const js = await W.signup("json@fresh.test", j.code, "json-passphrase-1");
    out.push([js.status === 200 && js.json && js.json.account === "created" && js.json.signedIn === false && !/Json Co/.test(js.text), `S10 · the JSON sign-up's answer is unchanged (${js.status} ${js.json && js.json.account})`]);
    return out;
  },
};

// ---- the mutants: each must turn its case(s) red ----
const MUTANTS = [
  // sprint 7's review
  { name: "the sign-up takes a non-ASCII email (A5)", file: "src/signup.js",
    from: '  if (!asciiEmail(e)) return "email_ascii";', to: "", red: ["S7"] },
  { name: "a JSON sign-up picks an org for an account in several (A1)", file: "src/index.js",
    from: "const opened = r.seat && (isWeb || !(r.ask || r.waits || r.pendingOnly)) ?", to: "const opened = r.seat ?", red: ["S3", "S9"] },
  // the owner's ruling (2026-10-09): a seat that waits makes the JSON sign-up sign in nothing
  { name: "a JSON sign-up ignores a seat that waits (the account's one active seat by default)", file: "src/index.js",
    from: "const opened = r.seat && (isWeb || !(r.ask || r.waits || r.pendingOnly)) ?", to: "const opened = r.seat && (isWeb || !(r.ask || r.pendingOnly)) ?", red: ["S9"] },
  { name: "the sign-up never reads a seat that waits", file: "src/accounts.js",
    from: "waits: !!seats.length && !!pending.length && !named, verdict:", to: "waits: false, verdict:", red: ["S9"] },
  { name: "a code found by its hash, not its email (a code opens any email)", file: "src/accounts.js",
    from: "db(env).prepare(SIGNUP_OPEN_SQL).bind(e).first()", to: "db(env).prepare(SIGNUP_OPEN_SQL.replace(\"email = ?1\", \"code_hash = ?1\")).bind(hash).first()", red: ["S4"] },
  { name: "the spend without its open check (a code spent twice)", file: "src/accounts.js",
    from: "WHERE id = ?4 AND code_hash = ?5 AND used_at IS NULL AND", to: "WHERE id = ?4 AND code_hash = ?5 AND", red: ["S6"] },
  { name: "the reset keeps the account's sessions", file: "src/accounts.js",
    from: "    db(env).prepare(SIGNUP_END_SESSIONS_SQL).bind(e, open.id, nonce),\n", to: "", red: ["S3"] },
  { name: "the sign-up skips the lockout", file: "src/accounts.js",
    from: "const locked = await lockOf(env, before ? before.id : null, e, out.client);", to: "const locked = false;", red: ["S5"] },
  { name: "a refused code counts no attempt", file: "src/accounts.js",
    from: "{ await countSignIn(env, out, false); return { ...out, verdict: locked ? \"locked\" : \"refused\" }; }\n  const salt", to: "return { ...out, verdict: locked ? \"locked\" : \"refused\" };\n  const salt", red: ["S4", "S5"] },
  // sprint 8, 8.3a (the sprint-7 review's A3): a valid code passes the lock
  { name: "a valid code meets the lock (no bypass: a stranger keeps the holder from signing up)", file: "src/accounts.js",
    from: "const locked = await lockOf(env, before ? before.id : null, e, out.client);", to: "const locked = await lockOf(env, before ? before.id : null, e, out.client);\n  if (locked) return { ...out, verdict: \"locked\" };", red: ["S5"] },
  // sprint 21, 21.2: the org form a web sign-up answers is filled in from the email's newest APPROVED request only
  { name: "the prefill reading an open request too", file: "src/requestaccess.js",
    from: "WHERE email = ?1 AND status = 'approved' ORDER BY", to: "WHERE email = ?1 AND status IN ('approved', 'open') ORDER BY", red: ["S10"] },
  { name: "the prefill from the oldest approval", file: "src/requestaccess.js",
    from: "ORDER BY approved_at DESC LIMIT 1", to: "ORDER BY approved_at ASC LIMIT 1", red: ["S10"] },
  { name: "the sign-up without the same-origin guard", file: "src/index.js",
    from: "if (crossSiteLogin(request, url)) return isForm ? page(403, \"Cross-site sign-up refused.\") : json({ error: \"cross_site_signup\" }, 403);", to: "", red: ["S7"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

// the clean tree: every case green
for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
{
  // S8: mint, sign up, list, and read every text of the world and every response of the run: the code is in none
  const W = await world();
  const a = await allowEmail(W.DB, "s8@fresh.test");
  const r = await W.signup("s8@fresh.test", a.code, "s8-passphrase-123");
  const tables = W.q("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'k_find%'").map((t) => t.name);
  const norm = a.code.replace(/-/g, "");
  let hits = 0;
  for (const t of tables) for (const row of W.q(`SELECT * FROM "${t}"`)) { const s = JSON.stringify(row); if (s.includes(a.code) || s.includes(norm)) hits++; }
  const inAnswers = SEEN.filter((t) => t.includes(a.code) || t.includes(norm)).length;
  ok(r.status === 200 && hits === 0 && inAnswers === 0, `S8 · the code is in no row (${tables.length} tables read: ${hits} hits) and in none of the run's ${SEEN.length} answers (${inAnswers})`);
}

for (const m of MUTANTS) {
  let dir = null;
  try {
    dir = mkdtempSync(join(ENGINE, ".signup-mutation-"));
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const p = join(dir, m.file), s = readFileSync(p, "utf8");
    if (s.split(m.from).length !== 2) { ok(false, `mutant "${m.name}": its needle is not found exactly once in ${m.file} (update this selftest with the code)`); continue; }
    writeFileSync(p, s.replace(m.from, m.to));
    MUT = { src: join(dir, "src") };
    const reds = [];
    // red by an assertion of the case, never by a crash (a mutant that only breaks the world proves nothing)
    for (const name of m.red) { const res = await runCase(name); reds.push(res.some(([c, l]) => !c && !/ threw: /.test(l)) && !res.some(([, l]) => / threw: /.test(l))); }
    ok(reds.every(Boolean), `mutant "${m.name}" turns ${m.red.join(" and ")} red (${reds.map((r, i) => `${m.red[i]} ${r ? "red" : "GREEN"}`).join(", ")})`);
  } finally { MUT = {}; if (dir) rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${failed ? "✗" : "✓"} signup selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
