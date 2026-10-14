// tools/accounts-selftest.mjs — sprint 7, slices 7.1 and 7.4 (docs/plan/PLATFORM.md §2 items 8 and 9; migrate-070, migrate-073;
// src/accounts.js, src/core.js authenticateSession): one account per email, a seat per org, one session per ACCOUNT, the lockout
// per account. Through the REAL worker (src/index.js over node:sqlite built from boot.sql, tools/fixtures/sqlite-worker.mjs)
// holding two orgs, each at its own address (/one, /two-2). The sign-in lives at the platform's root and chooses the org; a
// browser's cookie reads, under an org's address, as the session's seat THERE. Each case builds a fresh world.
//   C1 · one email seated in org 1 and org 2 is ONE account; its org-1 seat's secret signs in ONCE (one session row), a SEAT
//        session: under org 1's address it is that seat, under org 2's it is nothing (404, as an org no one holds). The key
//        org 2's admin minted for its own seat signs in THAT seat only: under org 1's address nothing. The ACCOUNT's own
//        passphrase signs in an account session: one cookie, the account's seat under each org's address
//   C2 · an account seated only in org 2 (7.1's fork, closed): its right secret signs in to its org-2 seat; a wrong one is 401
//   C3 · the squatting attack: org 2's admin seats an email FIRST, org 1's admin seats it later — the key org 2 minted signs in
//        its org-2 seat only (a new account carries no passphrase): under org 1's address nothing; org 1's own key is org 1's
//   C4 · org 2's admin adds org 1's owner's email (a migrated account: no passphrase, the owner signs in by their seat's
//        secret): org 2's set-password on that seat is refused (account_elsewhere, nothing written); its rotate-key changes
//        only its own seat; the owner's passphrase signs in to org 1 unchanged; nothing org 2 holds reads org 1
//   C5 · the lockout counts per account: 8 failures under any spelling of the email lock the account's sign-in (the right
//        passphrase answers 429), each attempt names the account; another account signs in; and failures counted by the
//        account's ORG-2 seat (a passphrase change's re-check) lock its sign-in at org 1's address (one account, one lockout)
//   C6 · an account passphrase (as only slice 7.2's code sign-up or a proven change gives one): the holder's change, proven
//        by it, moves the account alone (the seat keeps its own secret); the old account passphrase opens nothing, the new one
//        signs in; and a no-passphrase account gains NONE from a seat's proof (only that seat's secret moves)
//   C7 · a seat's credential never sets the account's passphrase: org 2's admin, holding the key it minted for the person's
//        org-2 seat, changes "their" passphrase through /profile — only that seat's secret moves; the new value signs in that
//        org-2 seat alone (under org 1's address nothing) and the person's own passphrase still signs in to org 1
//   C8 · today's behaviour on a single-org account: org 1's admin set-password replaces the seat's passphrase: the old one
//        opens nothing, the new one signs in; the account still holds none
//   C9 · a bearer key and an OAuth grant keep working as before: the key answers whoami as its seat; a grant made by the
//        OAuth sign-in form names the chosen seat (org 1's) with the cred stamp of today's formula (credEpoch), and
//        resolveReader answers it — refused after the holder's passphrase change (G2 M1, unchanged); the key org 2 minted
//        grants org 2's seat, never org 1's
//   C10 · migrate-070 itself, on a database as it stands before it (boot.sql without 070's table, columns, indexes and
//        triggers; org-1 people with their passphrases, an inactive duplicate, an org-2 person): every account it makes has
//        NO passphrase (the coordinator's ruling: a carried one could be an admin's minted key), one per email, every seat
//        linked; every org-1 person still signs in with their old passphrase (their seat's secret, a seat session); the
//        org-2 person's right secret signs in to the org-2 seat. A mutant backfill that carries the passphrase turns it red.
//   C11 · the org picker (7.4b; PLATFORM §2 item 8): an ACCOUNT session whose account holds seats in both orgs lands, after a
//        root sign-in, on GET /orgs, which lists exactly its two orgs (each /<org>/home); its root page navigation goes there
//        carrying the page (/orgs?to=…, each link that page under its org); next naming one of its orgs wins. A SEAT session
//        (the seat's own secret, same account) never sees it: it lands, and GET /orgs sends it, on its seat's org. A one-org
//        account lands straight in its org; next naming an org it is not seated in is dropped. No session: the sign-in rule
//   C12 · the switcher, the brand, the 404 (7.4b): an account session's rail under either org lists exactly its two orgs; a seat
//        session's and a one-org account's rail list none. The root's sign-in and sign-up wear the platform's brand (never org
//        1's); the sign-in from org 2's address (next=/<org 2>/…) wears org 2's. Every not-here case answers ONE body: a page in
//        the platform's brand, naming no org, with the root's sign-in
//   SPRINT 7's REVIEW (each case red on the tree before its fix; each fix's mutant turns it red again):
//   C13 · A1: org 2's admin seats an email whose account holds its passphrase: the seat WAITS (active 0, pending 1), invisible to
//        every reader (its key, the account's session, the rail); a web sign-in lands on the picker, the seat with Accept and
//        Decline; a SEAT session and a cross-site post answer nothing; the holder's own account session accepts (then org 2 reads
//        it) or declines (it stays inactive); another account's session answers nothing; a brand-new email is active at once; a
//        second invite is refused; the admin withdraws a waiting seat
//   C14 · A1: an account whose only seat waits signs in to the picker alone (JSON 403, its session reads nothing), then accepts
//        and goes straight in; the OAuth form asks an account in two orgs (no grant, its orgs, the email filled back in) and the
//        grant records the org chosen (C1: the JSON sign-in asks too: 409 choose_org)
//   C15 · A2 + B1 + A4: an admin's Reissue and removal of a seat end its SEAT sessions only — an ACCOUNT session anchored there
//        reads on in the other org; the holder's proven account passphrase change ends every other session of the account (the
//        one it was proven on stays), rotate-my-key proven by it every one; proven by a seat's own key, only that seat's
//   C16 · A6: a sign-in for an email no account holds costs one passphrase hash, as an account's does
//   C17 · B5: a session's project stamp set in org 2 is no stamp in org 1 (its project picker shows again)
//   C18 · A5: add-person refuses a non-ASCII email (email_not_ascii), nothing created
//   C19 · migrate-074 over a database as live holds it at 073: every row NOT pending, active flags, accounts, keys and secrets
//        untouched; after it (and 077, which lands before this code) org 1's people sign in by their seats' secrets (a removed one
//        stays out), their live sessions under /ryuklabs, their keys and a seat grant keep working (no regression for ryuklabs)
//   SPRINT 8, 8.3a (the sprint-7 review's A3, the lockout's key; each RED on the tree before the fix):
//   C20 · a stranger's 8 wrong guesses on an email lock the stranger and every vantage the account's passphrase never signed in
//        from (a fresh client, the client a SEAT secret signed in from, no client: the law before) — never the holder's own
//        client: the sign-in and create-org's proof answer it; that client is judged by its own failures
//   C21 · on /profile: the stranger's failures lock the sign-in and the seat key's re-check as before; the holder's own ACCOUNT
//        session changes the passphrase; that session is judged by its own failures
//   THE OWNER'S RULING (2026-10-09, sprint 8's ship MCQ; PLATFORM §3's squat row; RED on the tree before it):
//   C22 · an account with ONE active seat and a seat waiting for its yes: its JSON sign-in by passphrase answers 409
//        choose_org (its one active org listed, the note saying a seat waits), nothing minted; naming the org (`org`, or `next`
//        naming a page of it) signs in; its seat's own secret and a browser sign-in (the picker) are untouched; once the seat
//        is accepted (two active seats) the ask is the several-orgs one, no waiting sentence
// And the MUTATION PROOF: each named mutant (a scratch copy of src/, or a database trigger swapped) must turn its case(s) red.
// Exit 1 on any failure. A gate step.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { pbkdf2 } = await import(pathToFileURL(join(ENGINE, "src", "util.js")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const SALT = "00112233445566778899aabbccddeeff";

// ---- the world: org 1 (alpha) with its owner and Mia; org 2 (shop) with its owner ----
// MUT: the mutant every world of the run is built on (none: the tree as it stands): src, a scratch copy of src/; dbMutant, SQL
// run on the fresh database (a trigger swapped)
let MUT = {};
async function world() {
  const { src, dbMutant } = MUT;
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src, people: [
    ["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"],
    ["one-mia", "Mia One", "member", "one-mia-key", ["alpha"], "mia@one.test"]],
    orgs: [{ id: 2, name: "Two", projects: ["shop"], people: [["two-owner", "Owner Two", "owner", "two-owner-key", [], "owner@two.test"]] }] });
  if (dbMutant) w.db.exec(dbMutant);
  const q = (sql, ...a) => w.db.prepare(sql).all(...a);
  const one = (sql, ...a) => w.db.prepare(sql).get(...a);
  const call = async (method, path, { key, body, form, cookie, nav, headers: extra } = {}) => {
    const headers = { accept: nav ? "text/html" : "application/json" };
    if (nav) { headers["sec-fetch-dest"] = "document"; headers["sec-fetch-mode"] = "navigate"; }
    if (key) headers.authorization = "Bearer " + key;
    if (cookie) { headers.cookie = "__Host-ar_session=" + cookie; headers["sec-fetch-site"] = "same-origin"; }
    if (extra) Object.assign(headers, extra);
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" }));
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, text, json, location: r.headers.get("location") || "", cookie: ((r.headers.get("set-cookie") || "").match(/__Host-ar_session=([^;]+)/) || [])[1] || "" };
  };
  const login = async (email, password, org) => { const r = await call("POST", "/login", { body: { email, password, device: "accounts-selftest", ...(org ? { org } : {}) } }); return { status: r.status, error: r.json && r.json.error, token: r.json && r.json.token, orgs: r.json && r.json.orgs }; };
  const whoami = async (key) => { const r = await call("GET", "/whoami", { key }); return r.status === 200 ? { id: r.json.id, org: one("SELECT org FROM people WHERE id = ?", r.json.id).org } : { status: r.status }; };
  const control = (key, form) => call("POST", "/control", { key, form }).then((r) => r.text);
  // add(key, name, email, { accept }) -> { id, key, waited }: add-person by that admin; the one-time secret from its flash. A seat
  // that WAITS for its holder's yes (the review's A1, migrate-074: the email's account already stands elsewhere) is accepted as
  // POST /orgs/seat accepts it (the holder's yes: active 1, pending 0) unless { accept: false } — the cases before A1 seat one
  // account in two orgs, which now takes the holder's yes; A1's own cases (C13-C16) drive the real door
  const add = async (adminKey, name, email, { accept = true } = {}) => {
    const t = await control(adminKey, { action: "add-person", name, email });
    const k = (t.match(/API key\): ([0-9a-f]{40})/) || [])[1];
    const row = k ? one("SELECT id, pending FROM people WHERE key_hash = ?", sha(k)) : null;
    const waited = !!(row && Number(row.pending) === 1);
    if (waited && accept) w.db.prepare("UPDATE people SET active = 1, pending = 0 WHERE id = ? AND pending = 1").run(row.id);
    return { id: row && row.id, key: k, flash: t, waited };
  };
  // seatPass(id, pw): a seat's own secret, as an admin's set-password writes it; ownPass(email, pw): an ACCOUNT passphrase, as
  // only slice 7.2's code sign-up (or proving one) gives it — never migrate-070, never an admin
  const seatPass = async (id, pw) => w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = ?").run(await pbkdf2(pw, SALT), SALT, id);
  const ownPass = async (email, pw) => w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = ?").run(await pbkdf2(pw, SALT), SALT, email);
  const account = (email) => one("SELECT id, pass_hash, pass_salt FROM accounts WHERE email = ?", email);
  const live = () => one("SELECT COUNT(*) AS n FROM tokens WHERE revoked = 0").n;
  // sprint 7, 7.4: each org's address; at(org, token) -> who the session cookie reads as under that org's address
  // ({ status, id, org }: a 404 is the one answer for "nothing here")
  const addr = (org) => "/" + one("SELECT slug FROM org WHERE id = ?", org).slug;
  const at = async (org, token) => { const r = await call("GET", addr(org) + "/whoami", { cookie: token }); return r.status === 200 ? { status: 200, id: r.json.id, org: one("SELECT org FROM people WHERE id = ?", r.json.id).org } : { status: r.status }; };
  const kind = (token) => (one("SELECT account_id FROM tokens WHERE token_hash = ?", sha(token)) || {}).account_id ? "account" : "seat";
  // sprint 7, 7.4b: a browser's form sign-in at the root (its landing and its cookie); picked(html) -> the org links a page lists
  const webLogin = (email, password, next) => call("POST", "/login", { form: { email, password, web: "1", ...(next ? { next } : {}) } });
  const picked = (html) => [...String(html).matchAll(/<a class="org-pick" href="([^"]+)" data-org="([^"]+)"/g)].map((m) => `${m[2]}=${m[1]}`);
  const switcher = (html) => [...String((String(html).match(/data-region="org-switcher"[\s\S]*?<\/details>/) || [""])[0]).matchAll(/<a href="([^"]+)" data-org="([^"]+)"/g)].map((m) => `${m[2]}=${m[1]}`);
  return { w, q, one, call, login, whoami, control, add, seatPass, ownPass, account, live, addr, at, kind, webLogin, picked, switcher };
}

// ---- the cases: each answers [[cond, label], …] ----
const CASES = {
  async C1() {
    const W = await world(), out = [];
    const two = await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test");
    await W.seatPass("one-owner", "one-owner-pass");
    const seats = W.q("SELECT id, org, account_id FROM people WHERE email = 'owner@one.test' ORDER BY org");
    out.push([!!two.key && seats.length === 2 && seats[0].account_id && seats[0].account_id === seats[1].account_id && W.q("SELECT id FROM accounts WHERE email = 'owner@one.test'").length === 1,
      `C1 · one email seated in org 1 and org 2 is ONE account (${seats.length} seats, ${new Set(seats.map((s) => s.account_id)).size} account)`]);
    const t0 = W.live();
    const a = await W.login(" OWNER@one.test ", "one-owner-pass");
    const who = a.token ? await W.whoami(a.token) : {}, a1 = a.token ? await W.at(1, a.token) : {}, a2 = a.token ? await W.at(2, a.token) : {};
    out.push([a.status === 200 && who.id === "one-owner" && who.org === 1 && W.live() === t0 + 1 && W.kind(a.token) === "seat" && a1.id === "one-owner" && a2.status === 404,
      `C1 · its org-1 seat's secret signs in ONCE (${a.status}, ${W.live() - t0} session row, a ${a.token ? W.kind(a.token) : "-"} session): under org 1's address ${a1.id}, under org 2's ${a2.status}`]);
    const b = await W.login("owner@one.test", two.key);
    const bw = b.token ? await W.whoami(b.token) : {}, b1 = b.token ? await W.at(1, b.token) : {}, b2 = b.token ? await W.at(2, b.token) : {};
    out.push([b.status === 200 && bw.id === two.id && bw.org === 2 && W.kind(b.token) === "seat" && b1.status === 404 && b2.id === two.id,
      `C1 · the key org 2's admin minted signs in its own seat only (${b.status} as ${bw.id}, org ${bw.org}): under org 1's address ${b1.status}, under org 2's ${b2.id}`]);
    await W.ownPass("owner@one.test", "owner-account-pass");
    // the review's A1: an account in two orgs is never signed in to one it did not name — the JSON sign-in asks (409 choose_org,
    // its two orgs), and signs in once `org` names one
    const asked = await W.login("owner@one.test", "owner-account-pass"), t1 = W.live();
    out.push([asked.status === 409 && asked.error === "choose_org" && (asked.orgs || []).map((o) => o.slug).sort().join(",") === [W.addr(1), W.addr(2)].map((a) => a.slice(1)).sort().join(",") && !asked.token,
      `C1 · the ACCOUNT's passphrase with no org named: ${asked.status} ${asked.error} listing ${(asked.orgs || []).map((o) => o.slug).join(", ")}, nothing minted`]);
    const c = await W.login("owner@one.test", "owner-account-pass", W.addr(1).slice(1));
    const c1 = c.token ? await W.at(1, c.token) : {}, c2 = c.token ? await W.at(2, c.token) : {};
    out.push([c.status === 200 && W.kind(c.token) === "account" && c1.id === "one-owner" && c2.id === two.id && W.live() === t1 + 1,
      `C1 · the ACCOUNT's passphrase naming org 1: ONE ${c.token ? W.kind(c.token) : "-"} session, under org 1's address ${c1.id}, under org 2's ${c2.id}`]);
    return out;
  },
  async C2() {
    const W = await world(), out = [];
    const nina = await W.add("two-owner-key", "Nina Two", "nina@two.test");
    const t0 = W.live();
    const a = await W.login("nina@two.test", nina.key), b = await W.login("nina@two.test", "not-her-secret");
    const aw = a.token ? await W.whoami(a.token) : {}, a1 = a.token ? await W.at(1, a.token) : {};
    out.push([a.status === 200 && aw.id === nina.id && aw.org === 2 && W.live() === t0 + 1 && a1.status === 404,
      `C2 · an account seated only in org 2 signs in to its org-2 seat (${a.status} as ${aw.id}, org ${aw.org}); under org 1's address ${a1.status}`]);
    out.push([b.status === 401 && b.error === "invalid_login", `C2 · a wrong secret is the plain ${b.status} ${b.error}`]);
    return out;
  },
  async C3() {
    const W = await world(), out = [];
    const s2 = await W.add("two-owner-key", "Sam (squatted)", "sam@new.test");
    const s1 = await W.add("one-owner-key", "Sam", "sam@new.test");
    const acc = W.account("sam@new.test");
    out.push([!!s2.key && !!s1.key && acc && acc.pass_hash === null, `C3 · org 2 seated the email first, org 1 later: one account, made with NO passphrase (${acc && acc.pass_hash === null ? "none" : "ONE"})`]);
    const a = await W.login("sam@new.test", s2.key), b = await W.login("sam@new.test", s1.key);
    const aw = a.token ? await W.whoami(a.token) : {}, a1 = a.token ? await W.at(1, a.token) : {};
    const who = b.token ? await W.whoami(b.token) : {};
    out.push([a.status === 200 && aw.id === s2.id && aw.org === 2 && W.kind(a.token) === "seat" && a1.status === 404,
      `C3 · the key org 2 minted signs in org 2's seat only (${aw.id}, org ${aw.org}): under org 1's address ${a1.status}`]);
    out.push([b.status === 200 && who.id === s1.id && who.org === 1, `C3 · org 1's own key signs in to org 1's seat: ${b.status}, ${who.id} (org ${who.org})`]);
    return out;
  },
  async C4() {
    const W = await world(), out = [];
    await W.seatPass("one-owner", "owner-own-pass");   // a migrated owner: their passphrase is their seat's, the account has none
    const before = W.account("owner@one.test");
    const two = await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test");
    const h1 = W.one("SELECT key_hash, pass_hash FROM people WHERE id = 'one-owner'");
    const sp = await W.control("two-owner-key", { action: "set-password", personId: two.id, password: "org-two-chose-this" });
    const seat2 = W.one("SELECT pass_hash FROM people WHERE id = ?", two.id);
    out.push([/account_elsewhere/.test(sp) && JSON.stringify(W.account("owner@one.test")) === JSON.stringify(before) && seat2.pass_hash !== null && (await pbkdf2("org-two-chose-this", SALT)) !== seat2.pass_hash,
      `C4 · org 2's set-password on its seat of org 1's owner is refused (account_elsewhere), the account and the seat unchanged`]);
    const rk = await W.control("two-owner-key", { action: "rotate-key", personId: two.id });
    const k2 = (rk.match(/([0-9a-f]{40})/) || [])[1];
    out.push([!!k2 && JSON.stringify(W.account("owner@one.test")) === JSON.stringify(before) && JSON.stringify(W.one("SELECT key_hash, pass_hash FROM people WHERE id = 'one-owner'")) === JSON.stringify(h1),
      `C4 · org 2's rotate-key changes only its own seat: the account's passphrase and org 1's seat untouched`]);
    const a = await W.login("owner@one.test", "owner-own-pass"), who = a.token ? await W.whoami(a.token) : {};
    out.push([a.status === 200 && who.id === "one-owner" && who.org === 1, `C4 · org 1's owner signs in with their passphrase, unchanged: ${a.status}, ${who.id} (org ${who.org})`]);
    const x = await W.login("owner@one.test", "org-two-chose-this"), y = await W.login("owner@one.test", k2 || "x"), z = await W.login("owner@one.test", two.key);
    const yw = y.token ? await W.whoami(y.token) : {}, y1 = y.token ? await W.at(1, y.token) : {};
    out.push([x.status === 401 && z.status === 401 && y.status === 200 && yw.id === two.id && y1.status === 404,
      `C4 · nothing org 2 holds reads org 1: the refused value ${x.status}, the rotated-out key ${z.status}; its new key signs in its own seat (${yw.id}) and under org 1's address ${y1.status}`]);
    return out;
  },
  async C5() {
    const W = await world(), out = [];
    await W.seatPass("one-mia", "mia-pass"); await W.seatPass("one-owner", "owner-pass");
    for (let i = 0; i < 8; i++) await W.login(i % 2 ? " MIA@one.test" : "mia@ONE.test ", "wrong-" + i);
    const acc = W.account("mia@one.test");
    const named = W.one("SELECT COUNT(*) AS n FROM login_attempts WHERE account_id = ? AND ok = 0", acc.id).n;
    const locked = await W.login("mia@one.test", "mia-pass"), other = await W.login("owner@one.test", "owner-pass");
    out.push([named === 8 && locked.status === 429 && locked.error === "too_many_attempts", `C5 · 8 failures under any spelling lock the account (${named} attempts name it): the right passphrase answers ${locked.status}`]);
    out.push([other.status === 200, `C5 · another account still signs in: ${other.status}`]);
    // one account, one lockout across orgs: its org-2 seat's failed re-checks (a passphrase change) count at org 1's address
    const lee1 = await W.add("one-owner-key", "Lee", "lee@both.test"), lee2 = await W.add("two-owner-key", "Lee (in Two)", "lee@both.test");
    for (let i = 0; i < 8; i++) await W.call("POST", "/profile", { key: lee2.key, body: { action: "set-my-passphrase", current: "wrong-" + i, password: "whatever-new" } });
    const l = await W.login("lee@both.test", lee1.key);
    out.push([l.status === 429, `C5 · 8 failed re-checks by the account's ORG-2 seat lock its sign-in at org 1's address: ${l.status}`]);
    return out;
  },
  async C6() {
    const W = await world(), out = [];
    await W.seatPass("one-mia", "mia-seat-pass"); await W.ownPass("mia@one.test", "mia-own-pass");
    const seat0 = W.one("SELECT pass_hash FROM people WHERE id = 'one-mia'").pass_hash;
    const r = await W.call("POST", "/profile", { key: "one-mia-key", body: { action: "set-my-passphrase", current: "mia-own-pass", password: "mia-new-pass" } });
    const acc = W.account("mia@one.test");
    out.push([r.status === 200 && acc.pass_hash === await pbkdf2("mia-new-pass", acc.pass_salt) && W.one("SELECT pass_hash FROM people WHERE id = 'one-mia'").pass_hash === seat0,
      `C6 · the holder's change, proven by the account's passphrase, moves the account alone (${r.status}); the seat keeps its own secret`]);
    const a = await W.login("mia@one.test", "mia-own-pass"), b = await W.login("mia@one.test", "mia-new-pass");
    out.push([a.status === 401 && b.status === 200, `C6 · the old account passphrase opens nothing (${a.status}); the new one signs in (${b.status})`]);
    // a no-passphrase account (every migrated one): a seat's proof never gives it one
    await W.seatPass("one-owner", "owner-seat-pass");
    const p = await W.call("POST", "/profile", { key: "one-owner-key", body: { action: "set-my-passphrase", current: "owner-seat-pass", password: "owner-new-pass" } });
    const oa = W.account("owner@one.test"), ol = await W.login("owner@one.test", "owner-new-pass");
    out.push([p.status === 200 && oa.pass_hash === null && ol.status === 200, `C6 · a no-passphrase account gains NONE from a seat's proof (${p.status}; the account ${oa.pass_hash === null ? "still has none" : "GOT ONE"}); the seat's new secret signs in (${ol.status})`]);
    return out;
  },
  async C7() {
    const W = await world(), out = [];
    const e1 = await W.add("one-owner-key", "Eve", "eve@both.test");
    await W.seatPass(e1.id, "eve-own-pass");   // Eve's passphrase is her org-1 seat's (the account has none)
    const e2 = await W.add("two-owner-key", "Eve (in Two)", "eve@both.test");
    const before = W.account("eve@both.test");
    // org 2's admin holds the key it minted for Eve's org-2 seat (its web secret too, S-019): it "changes her passphrase"
    const r = await W.call("POST", "/profile", { key: e2.key, body: { action: "set-my-passphrase", current: e2.key, password: "org-two-took-it" } });
    out.push([r.status === 200 && JSON.stringify(W.account("eve@both.test")) === JSON.stringify(before) && before.pass_hash === null, `C7 · a seat's credential changes only that seat's secret (${r.status}); the account still holds no passphrase`]);
    const a = await W.login("eve@both.test", "org-two-took-it"), b = await W.login("eve@both.test", "eve-own-pass");
    const aw = a.token ? await W.whoami(a.token) : {}, a1 = a.token ? await W.at(1, a.token) : {}, bw = b.token ? await W.whoami(b.token) : {};
    out.push([a.status === 200 && aw.id === e2.id && a1.status === 404 && b.status === 200 && bw.id === e1.id,
      `C7 · the value org 2 chose signs in its own seat alone (${aw.id}; under org 1's address ${a1.status}); Eve's own passphrase signs in to org 1 (${bw.id})`]);
    return out;
  },
  async C8() {
    const W = await world(), out = [];
    await W.seatPass("one-mia", "mia-pass");
    const f = await W.control("one-owner-key", { action: "set-password", personId: "one-mia", password: "admin-set-pass" });
    const a = await W.login("mia@one.test", "mia-pass"), b = await W.login("mia@one.test", "admin-set-pass");
    out.push([/Passphrase updated/.test(f) && W.account("mia@one.test").pass_hash === null && a.status === 401 && b.status === 200,
      `C8 · org 1's admin replaces a single-org member's passphrase as today: the old one ${a.status}, the new one ${b.status}; the account holds none`]);
    return out;
  },
  async C9() {
    const W = await world(), out = [];
    const k = await W.whoami("one-owner-key");
    out.push([k.id === "one-owner" && k.org === 1, `C9 · a bearer key answers whoami as its seat (${k.id}, org ${k.org})`]);
    await W.seatPass("one-mia", "mia-pass");
    const before = W.one("SELECT key_hash, pass_hash FROM people WHERE id = 'one-mia'");
    // the OAuth sign-in form (src/oauth.js), with the provider's two helpers stood in: the grant it completes
    const { oauthDefaultHandler } = await import(pathToFileURL(join(ENGINE, "src", "oauth.js")).href);
    let grant = null;
    const env = { ...W.w.env, OAUTH_PROVIDER: { lookupClient: async () => ({ clientName: "A client" }), completeAuthorization: async (o) => { grant = o; return { redirectTo: "https://client.test/cb?code=x" }; } } };
    const form = (email, password) => new Request(W.w.origin + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password, oauth_req: btoa(JSON.stringify({ clientId: "c", redirectUri: "https://client.test/cb", scope: ["mcp:read", "mcp:write"] })) }).toString() });
    const r = await oauthDefaultHandler.fetch(form("mia@one.test", "mia-pass"), env, {});
    const { credEpoch } = await import(pathToFileURL(join(ENGINE, "src", "oauthgrants.js")).href);
    const { resolveReader } = await import(pathToFileURL(join(ENGINE, "src", "core.js")).href);
    const { installOrgSlot } = await import(pathToFileURL(join(ENGINE, "src", "data.js")).href);
    const asOAuth = () => resolveReader(new Request(W.w.origin + "/mcp"), installOrgSlot({ ...W.w.env }), new URL(W.w.origin + "/mcp"), { props: grant && grant.props }).catch(() => null);
    const reader = await asOAuth();
    out.push([r.status === 302 && grant && grant.userId === "one-mia" && grant.props.cred === await credEpoch(before) && reader && reader.id === "one-mia" && reader.viaOAuth,
      `C9 · the OAuth form's grant names the chosen seat (org 1's) with today's cred stamp, and it answers (${reader && reader.id})`]);
    await W.call("POST", "/profile", { key: "one-mia-key", body: { action: "set-my-passphrase", current: "mia-pass", password: "mia-changed" } });
    out.push([!(await asOAuth()), "C9 · after the holder's passphrase change the grant is refused (G2 M1, unchanged)"]);
    const sq = await W.add("two-owner-key", "Squat", "squat@new.test"); await W.add("one-owner-key", "Squat", "squat@new.test");
    grant = null;
    const s = await oauthDefaultHandler.fetch(form("squat@new.test", sq.key), env, {});
    out.push([s.status === 302 && grant && grant.userId === sq.id, `C9 · the key org 2 minted grants org 2's seat alone (${s.status}, ${grant && grant.userId}), never org 1's`]);
    return out;
  },
  async C10() {
    const out = [];
    const { DatabaseSync } = await import("node:sqlite");
    const { d1, r2, kv } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
    const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(PRE070);
    const T0 = "2026-09-01T00:00:00.000Z";
    db.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (1, 'One', ?, ?), (2, 'Two', ?, ?)").run(T0, T0, T0, T0);
    db.prepare("INSERT INTO projects (key, name, active, created_at) VALUES ('alpha', 'Alpha', 1, ?)").run(T0);
    // org 1's people as live holds them: each passphrase where today's code put it (S-019: an admin's minted key, or one of
    // their own); an inactive older row of one email; an org-2 person
    const P = db.prepare("INSERT INTO people (id, name, email, role, key_hash, pass_hash, pass_salt, active, created_at, org) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const people = [["m-owner", "Owner@One.test ", "owner", "owner-pass", 1, 1], ["m-mia", "mia@one.test", "member", "mia-pass", 1, 1],
      ["m-mia-old", "mia@one.test", "member", "mia-old-pass", 0, 1], ["m-tara", "tara@two.test", "member", "tara-pass", 1, 2]];
    for (const [id, email, role, pw, active, org] of people) P.run(id, id, email, role, sha(id + "-key"), await pbkdf2(pw, SALT), SALT, active, T0, org);
    db.exec(MUT.migration || M070);
    // live's order, all before the code: 072 (the org's path name the sign-in reads), 073 (the session's account column the sign-in
    // writes: 7.4), 074 (the seat's wait for its holder's yes: the review's A1), 077 (the lockout's client and the seat's grants
    // epoch the sign-in reads: 8.3a), 079 (the account's invite mark the account reads name: 12.3) — every row 070 linked stays
    // active, NOT pending
    db.exec(M072); db.exec(M073); db.exec(M074); db.exec(M077); db.exec(M079);
    const accts = db.prepare("SELECT email, pass_hash, pass_salt FROM accounts ORDER BY email").all();
    out.push([accts.length === 3 && accts.every((a) => a.pass_hash === null && a.pass_salt === null),
      `C10 · migrate-070 makes one account per email (${accts.length}) and every one with NO passphrase (${accts.filter((a) => a.pass_hash !== null).length} carried)`]);
    out.push([db.prepare("SELECT COUNT(*) AS n FROM people WHERE account_id IS NULL").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM people WHERE pass_hash IS NULL").get().n === 0,
      "C10 · every seat linked to its account, every seat's passphrase where it was"]);
    const env = { DB: d1(db), BRAIN: r2(), OAUTH_KV: kv() }, cx = { waitUntil() {}, passThroughOnException() {} };
    const login = async (email, password) => { const r = await handler.fetch(new Request("https://org.test/login", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, password, device: "accounts-selftest" }) }), env, cx); const j = await r.json().catch(() => ({})); return { status: r.status, error: j.error, token: j.token }; };
    const whoId = async (tok) => { const r = await handler.fetch(new Request("https://org.test/whoami", { headers: { accept: "application/json", authorization: "Bearer " + tok } }), env, cx); return ((await r.json().catch(() => ({}))) || {}).id; };
    const o = await login("owner@one.test", "owner-pass"), m = await login("mia@one.test", "mia-pass"), old = await login("mia@one.test", "mia-old-pass"), t = await login("tara@two.test", "tara-pass");
    const oi = o.token ? await whoId(o.token) : null, mi = m.token ? await whoId(m.token) : null;
    out.push([o.status === 200 && oi === "m-owner" && m.status === 200 && mi === "m-mia" && old.status === 401,
      `C10 · every org-1 person signs in with their old passphrase (owner ${o.status} as ${oi}, Mia ${m.status} as ${mi}); the inactive row's opens nothing (${old.status})`]);
    const ti = t.token ? await whoId(t.token) : null;
    out.push([t.status === 200 && ti === "m-tara", `C10 · the org-2 person's right secret signs in to the org-2 seat: ${t.status} as ${ti}`]);
    return out;
  },
  async C11() {
    const W = await world(), out = [];
    const two = await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test");
    await W.seatPass("one-owner", "one-owner-pass");
    await W.ownPass("owner@one.test", "owner-account-pass");
    await W.ownPass("mia@one.test", "mia-account-pass");
    const a1 = W.addr(1), a2 = W.addr(2);
    // the account session: the picker after the root sign-in, exactly its two orgs
    const acct = await W.webLogin("owner@one.test", "owner-account-pass");
    const pick = acct.cookie ? await W.call("GET", "/orgs", { cookie: acct.cookie, nav: true }) : {};
    const listed = W.picked(pick.text).sort();
    out.push([acct.status === 302 && acct.location === "/orgs" && pick.status === 200 && /data-region="org-picker"/.test(pick.text) && listed.join(" ") === [`${a1.slice(1)}=${a1}/home`, `${a2.slice(1)}=${a2}/home`].sort().join(" "),
      `C11 · an account in two orgs lands on the picker (${acct.status} ${acct.location}); GET /orgs ${pick.status} lists exactly its orgs: ${listed.join(" ")}`]);
    const root = acct.cookie ? await W.call("GET", "/map?layer=screens", { cookie: acct.cookie, nav: true }) : {};
    const withTo = acct.cookie ? await W.call("GET", "/orgs?to=" + encodeURIComponent("/map?layer=screens"), { cookie: acct.cookie, nav: true }) : {};
    out.push([root.status === 302 && root.location === "/orgs?to=" + encodeURIComponent("/map?layer=screens") && W.picked(withTo.text).includes(`${a2.slice(1)}=${a2}/map?layer=screens`),
      `C11 · its root page navigation goes to the picker carrying the page (${root.status} ${root.location}); each link opens that page under its org`]);
    const nx = await W.webLogin("owner@one.test", "owner-account-pass", `${a2}/goals`);
    out.push([nx.status === 302 && nx.location === `${a2}/goals`, `C11 · next naming one of its orgs wins: ${nx.status} ${nx.location}`]);
    // the SEAT session (the org-1 seat's own secret, the same account): no picker anywhere
    const seat = await W.webLogin("owner@one.test", "one-owner-pass");
    const sp = seat.cookie ? await W.call("GET", "/orgs", { cookie: seat.cookie, nav: true }) : {};
    const sr = seat.cookie ? await W.call("GET", "/home", { cookie: seat.cookie, nav: true }) : {};
    out.push([seat.status === 302 && seat.location === a1 && sp.status === 302 && sp.location === `${a1}/home` && sr.status === 302 && sr.location === `${a1}/home` && !W.picked(sp.text).length,
      `C11 · a SEAT session never sees the picker: lands ${seat.location}, GET /orgs ${sp.status} ${sp.location}, its root /home ${sr.status} ${sr.location}`]);
    // a one-org account: straight in; next naming an org it holds no seat in is dropped
    const mia = await W.webLogin("mia@one.test", "mia-account-pass"), miaX = await W.webLogin("mia@one.test", "mia-account-pass", `${a2}/home`);
    const mp = mia.cookie ? await W.call("GET", "/orgs", { cookie: mia.cookie, nav: true }) : {};
    out.push([mia.status === 302 && mia.location === a1 && miaX.location === a1 && mp.status === 302 && mp.location === `${a1}/home`,
      `C11 · a one-org account lands straight in (${mia.location}); next naming another org is dropped (${miaX.location}); GET /orgs ${mp.status} ${mp.location}`]);
    const anon = await W.call("GET", "/orgs", { nav: true }), bearer = await W.call("GET", "/orgs", { key: "one-owner-key" });
    out.push([anon.status === 302 && anon.location === "/login?next=%2Forgs" && bearer.status === 302 && bearer.location === `${a1}/home` && !!two.key,
      `C11 · no session: the sign-in rule (${anon.status} ${anon.location}); a bearer names one seat: straight to ITS org (${bearer.status} ${bearer.location})`]);
    return out;
  },
  async C12() {
    const W = await world(), out = [];
    await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test");
    await W.seatPass("one-owner", "one-owner-pass");
    await W.ownPass("owner@one.test", "owner-account-pass");
    await W.ownPass("mia@one.test", "mia-account-pass");
    const a1 = W.addr(1), a2 = W.addr(2);
    const acct = await W.webLogin("owner@one.test", "owner-account-pass"), seat = await W.webLogin("owner@one.test", "one-owner-pass"), mia = await W.webLogin("mia@one.test", "mia-account-pass");
    const h1 = await W.call("GET", `${a1}/home`, { cookie: acct.cookie, nav: true }), h2 = await W.call("GET", `${a2}/home`, { cookie: acct.cookie, nav: true });
    const want = [`${a1.slice(1)}=${a1}/home`, `${a2.slice(1)}=${a2}/home`].sort().join(" ");
    out.push([h1.status === 200 && h2.status === 200 && W.switcher(h1.text).sort().join(" ") === want && W.switcher(h2.text).sort().join(" ") === want,
      `C12 · an account session's rail lists exactly its orgs, under either address: ${W.switcher(h1.text).join(" ")}`]);
    const hs = await W.call("GET", `${a1}/home`, { cookie: seat.cookie, nav: true }), hm = await W.call("GET", `${a1}/home`, { cookie: mia.cookie, nav: true });
    out.push([hs.status === 200 && hm.status === 200 && !/data-region="org-switcher"/.test(hs.text) && !/data-region="org-switcher"/.test(hm.text) && /data-region="org-name"/.test(hs.text),
      `C12 · a seat session's rail (${hs.status}) and a one-org account's (${hm.status}) list no org`]);
    const lr = await W.call("GET", "/login", { nav: true }), su = await W.call("GET", "/signup", { nav: true }), l2 = await W.call("GET", "/login?next=" + encodeURIComponent(`${a2}/home`), { nav: true });
    out.push([lr.text.includes("<title>Sign in · sharingu</title>") && !lr.text.includes("One") && su.text.includes("<title>Sign up · sharingu</title>") && !su.text.includes("One")
      && l2.text.includes("<title>Sign in · Two · sharingu</title>") && l2.text.includes('<span class="wm-org">Two</span>'),
      `C12 · the root's sign-in and sign-up wear the platform's brand; the sign-in from org 2's address wears Two's`]);
    const probes = [
      await W.call("GET", `${a2}/home`, { cookie: seat.cookie, nav: true }),
      await W.call("GET", `${a2}/whoami`, { key: "one-owner-key" }),
      await W.call("GET", "/no-such-org/home", { cookie: acct.cookie, nav: true }),
      await W.call("GET", "/no-such-org/whoami", { key: "two-owner-key" }),
      await W.call("GET", `${a1}/login`, { nav: true }),
    ];
    const bodies = new Set(probes.map((r) => `${r.status}|${r.text}`));
    out.push([bodies.size === 1 && probes[0].status === 404 && /data-region="not-found"/.test(probes[0].text) && probes[0].text.includes('href="/login"') && !/\bOne\b|\bTwo\b/.test(probes[0].text),
      `C12 · every not-here case answers ONE body (${bodies.size} distinct, ${probes.map((r) => r.status).join("/")}): the platform's page, no org named, the root's sign-in`]);
    return out;
  },  // ---- sprint 7's review (A1, A2, B1 + A4, A5, A6, B5): each case is RED on the tree before the review's fixes ----
  async C13() {
    // A1: a seat an org's admin adds for an account that already stands elsewhere WAITS for its holder's yes
    const W = await world(), out = [];
    const a1 = W.addr(1), a2 = W.addr(2);
    await W.ownPass("owner@one.test", "owner-account-pass");   // org 1's owner holds their account passphrase (signed up)
    const inv = await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test", { accept: false });
    const row = W.one("SELECT active, pending FROM people WHERE id = ?", inv.id);
    out.push([inv.waited && row && Number(row.active) === 0 && Number(row.pending) === 1 && /WAITS for its holder/.test(inv.flash),
      `C13 · org 2's admin seats an email whose account holds its passphrase: the seat WAITS (active ${row && row.active}, pending ${row && row.pending}), the flash says so`]);
    // invisible to every reader: its key signs in nothing (a bearer, a sign-in), the account's session never reads it, the rail lists one org
    const keyWho = await W.whoami(inv.key), keyIn = await W.login("owner@one.test", inv.key);
    const one = await W.login("owner@one.test", "owner-account-pass", a1.slice(1));   // a seat waits: the JSON sign-in names its org (C22)
    const s2 = one.token ? await W.at(2, one.token) : {}, s1 = one.token ? await W.at(1, one.token) : {};
    const rail = one.token ? await W.call("GET", a1 + "/home", { cookie: one.token, nav: true }) : {};
    out.push([keyWho.status === 401 && keyIn.status === 401 && one.status === 200 && s1.id === "one-owner" && s2.status === 404 && W.switcher(rail.text).length === 0,
      `C13 · the waiting seat is invisible: its key ${keyWho.status} as a bearer and ${keyIn.status} at the sign-in; the account, naming its org, signs in to its ONE org (${one.status}), under org 2's address ${s2.status}; the rail lists ${W.switcher(rail.text).length} orgs`]);
    // the picker: a web sign-in lands there; the seat with Accept and Decline
    const web = await W.webLogin("owner@one.test", "owner-account-pass");
    const pick = web.cookie ? await W.call("GET", "/orgs", { cookie: web.cookie, nav: true }) : {};
    const waits = [...String(pick.text).matchAll(/data-pending="([^"]+)"/g)].map((m) => m[1]);
    out.push([web.status === 302 && web.location === "/orgs" && pick.status === 200 && waits.join() === a2.slice(1) && /name="seat" value="[^"]+"/.test(pick.text) && /data-answer="accept"/.test(pick.text) && /data-answer="decline"/.test(pick.text) && W.picked(pick.text).join() === `${a1.slice(1)}=${a1}/home`,
      `C13 · a web sign-in lands on the picker (${web.status} ${web.location}): its one org, and the seat of ${waits.join()} waiting with Accept and Decline`]);
    // only the holder's own ACCOUNT session answers it, same-origin only
    const seatS = await W.webLogin("owner@one.test", "owner-own-seat-pass").catch(() => ({}));
    await W.seatPass("one-owner", "owner-own-seat-pass");
    const seat = await W.webLogin("owner@one.test", "owner-own-seat-pass");
    const bySeat = seat.cookie ? await W.call("POST", "/orgs/seat", { cookie: seat.cookie, body: { seat: inv.id, answer: "accept" } }) : {};
    const xsite = web.cookie ? await W.call("POST", "/orgs/seat", { cookie: web.cookie, body: { seat: inv.id, answer: "accept" }, headers: { "sec-fetch-site": "cross-site" } }) : {};
    const still = W.one("SELECT active, pending FROM people WHERE id = ?", inv.id);
    out.push([!!seatS && bySeat.status === 404 && bySeat.json && bySeat.json.error === "not_yours" && xsite.status === 403 && Number(still.active) === 0 && Number(still.pending) === 1,
      `C13 · a SEAT session answers nothing (${bySeat.status} ${bySeat.json && bySeat.json.error}); a cross-site post ${xsite.status}; the seat still waits`]);
    const yes = web.cookie ? await W.call("POST", "/orgs/seat", { cookie: web.cookie, form: { seat: inv.id, answer: "accept" } }) : {};
    const after = web.cookie ? await W.at(2, web.cookie) : {};
    const again = web.cookie ? await W.call("POST", "/orgs/seat", { cookie: web.cookie, body: { seat: inv.id, answer: "decline" } }) : {};
    out.push([yes.status === 303 && yes.location === "/orgs?seat=accepted" && after.id === inv.id && again.status === 404,
      `C13 · the holder's own account session accepts it (${yes.status} ${yes.location}): under org 2's address now ${after.id}; a second answer ${again.status}`]);
    // decline: another holder (an account seated in org 2 only, with its passphrase), invited by org 1
    const bo = await W.add("two-owner-key", "Bo Two", "bo@two.test");
    await W.ownPass("bo@two.test", "bo-account-pass");
    const boInv = await W.add("one-owner-key", "Bo", "bo@two.test", { accept: false });
    const bw = await W.webLogin("bo@two.test", "bo-account-pass");
    const no = bw.cookie ? await W.call("POST", "/orgs/seat", { cookie: bw.cookie, form: { seat: boInv.id, answer: "decline" } }) : {};
    const boRow = W.one("SELECT active, pending FROM people WHERE id = ?", boInv.id), boAt1 = bw.cookie ? await W.at(1, bw.cookie) : {};
    // another account's session never answers a seat that is not its own
    const other = web.cookie ? await W.call("POST", "/orgs/seat", { cookie: web.cookie, body: { seat: boInv.id, answer: "accept" } }) : {};
    out.push([!!bo.key && boInv.waited && no.status === 303 && no.location === "/orgs?seat=declined" && Number(boRow.active) === 0 && Number(boRow.pending) === 0 && boAt1.status === 404 && other.status === 404,
      `C13 · a declined seat stays inactive (active ${boRow.active}, pending ${boRow.pending}): under org 1's address ${boAt1.status}; another account's session answers it ${other.status}`]);
    // no regression: a brand-new email is seated at once; a waiting seat cannot be added twice; the admin withdraws one
    const fresh = await W.add("two-owner-key", "New Person", "new@person.test", { accept: false });
    const dupe = await W.control("one-owner-key", { action: "add-person", name: "Bo again", email: "bo@two.test" });
    const cy = await W.add("two-owner-key", "Cy Two", "cy@two.test"); await W.ownPass("cy@two.test", "cy-account-pass");
    const cyInv = await W.add("one-owner-key", "Cy", "cy@two.test", { accept: false });
    const wd = await W.control("one-owner-key", { action: "remove-person", personId: cyInv.id });
    const cyRow = W.one("SELECT active, pending FROM people WHERE id = ?", cyInv.id);
    out.push([!fresh.waited && Number(W.one("SELECT active FROM people WHERE id = ?", fresh.id).active) === 1 && /Nothing done/.test(dupe) === false && !!cy.key && cyInv.waited && /invitation is withdrawn/.test(wd) && Number(cyRow.pending) === 0 && Number(cyRow.active) === 0,
      `C13 · a brand-new email is active at once (${fresh.waited ? "WAITS" : "active"}); the admin withdraws a waiting seat (${/withdrawn/.test(wd) ? "withdrawn" : wd.slice(0, 60)})`]);
    const twice = await W.control("one-owner-key", { action: "add-person", name: "Cy twice", email: "cy@two.test" });
    const twice2 = await W.control("one-owner-key", { action: "add-person", name: "Cy thrice", email: "cy@two.test" });
    out.push([/already waits for its holder/.test(twice2) && !/already waits/.test(twice),
      `C13 · a second invite of a waiting seat is refused: "${twice2.replace(/<[^>]+>/g, "").match(/Nothing done[^<.]*/)?.[0] || "?"}"`]);
    return out;
  },
  async C14() {
    // A1: an account with only waiting seats signs in to the picker alone; the JSON sign-in and the OAuth form never default
    const W = await world(), out = [];
    const a2 = W.addr(2);
    // Cara signed up (her account and passphrase, no seat), then org 2's admin seats her: the seat waits
    const salt = "aabbccddeeff00112233445566778899";
    W.w.db.prepare("INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at) VALUES ('acct-cara', 'cara@new.test', ?, ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')").run(await pbkdf2("cara-account-pass", salt), salt);
    const inv = await W.add("two-owner-key", "Cara", "cara@new.test", { accept: false });
    const js = await W.login("cara@new.test", "cara-account-pass"), web = await W.webLogin("cara@new.test", "cara-account-pass");
    const at2 = web.cookie ? await W.at(2, web.cookie) : {}, asBearer = web.cookie ? await W.whoami(web.cookie) : {};
    const pick = web.cookie ? await W.call("GET", "/orgs", { cookie: web.cookie, nav: true }) : {};
    out.push([inv.waited && js.status === 403 && js.error === "no_seat_here" && !js.token && web.status === 302 && web.location === "/orgs" && at2.status === 401 && asBearer.status === 401 && pick.status === 200 && /data-pending="/.test(pick.text) && !W.picked(pick.text).length,
      `C14 · an account whose only seat waits: JSON sign-in ${js.status} ${js.error}; a web sign-in lands on the picker (${web.location}) and its session reads nothing (under org 2's address ${at2.status}, as a bearer ${asBearer.status})`]);
    const yes = web.cookie ? await W.call("POST", "/orgs/seat", { cookie: web.cookie, form: { seat: inv.id, answer: "accept" } }) : {};
    const go = web.cookie ? await W.call("GET", "/orgs", { cookie: web.cookie, nav: true }) : {};
    out.push([yes.status === 303 && go.status === 302 && go.location === `${a2}/home`, `C14 · accepted, the picker sends it straight into its one org (${go.status} ${go.location})`]);
    // the OAuth form: an account in two orgs is asked; the grant records the org chosen
    await W.ownPass("owner@one.test", "owner-account-pass");
    await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test");
    const { oauthDefaultHandler } = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "oauth.js")).href);
    let grant = null;
    const env = { ...W.w.env, OAUTH_PROVIDER: { lookupClient: async () => ({ clientName: "A client" }), completeAuthorization: async (o) => { grant = o; return { redirectTo: "https://client.test/cb?code=x" }; } } };
    const form = (fields) => new Request(W.w.origin + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, oauth_req: btoa(JSON.stringify({ clientId: "c", redirectUri: "https://client.test/cb", scope: ["mcp:read", "mcp:write"] })) }).toString() });
    const ask = await oauthDefaultHandler.fetch(form({ email: "owner@one.test", password: "owner-account-pass" }), env, {});
    const askText = await ask.text();
    const offered = [...askText.matchAll(/name="org" value="([^"]+)"/g)].map((m) => m[1]).sort();
    out.push([ask.status === 200 && !grant && /data-region="org-choice"/.test(askText) && offered.join() === [W.addr(1), a2].map((a) => a.slice(1)).sort().join() && /value="owner@one\.test"/.test(askText) && !/owner-account-pass/.test(askText),
      `C14 · the OAuth form asks an account in two orgs (${ask.status}, no grant): it offers ${offered.join(", ")}, the email filled back in, never the passphrase`]);
    const chose = await oauthDefaultHandler.fetch(form({ email: "owner@one.test", password: "owner-account-pass", org: a2.slice(1) }), env, {});
    out.push([chose.status === 302 && grant && grant.props && grant.props.org === 2 && grant.props.accountId,
      `C14 · naming org 2 on the form: ${chose.status}, the ACCOUNT grant records org ${grant && grant.props && grant.props.org}`]);
    return out;
  },
  async C15() {
    // A2 + B1 + A4: one revocation rule — the holder's own act ends every session of the account; an admin's seat act ends only
    // that seat's SEAT sessions (an account session simply stops reading a removed seat)
    const W = await world(), out = [];
    const a1 = W.addr(1).slice(1), a2 = W.addr(2).slice(1);
    // Lee, an account in both orgs (seated before org 1's owner rotates their own key below)
    const lee1 = await W.add("one-owner-key", "Lee", "lee@both.test"), lee2 = await W.add("two-owner-key", "Lee (in Two)", "lee@both.test");
    await W.ownPass("lee@both.test", "lee-account-pass");
    await W.ownPass("owner@one.test", "owner-account-pass");
    const two = await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test");
    // an ACCOUNT session (reads both orgs), its anchor the org-2 seat (the sign-in named org 2): before the review, org 2's admin
    // acting on that seat revoked it by its anchor, signing the person out of org 1 too (A4)
    const acc = await W.login("owner@one.test", "owner-account-pass", a2);
    const seat2 = await W.login("owner@one.test", two.key);                  // a SEAT session of the org-2 seat
    const rk = await W.control("two-owner-key", { action: "rotate-key", personId: two.id });
    const accAt1 = await W.at(1, acc.token), accAt2 = await W.at(2, acc.token), seatAt2 = await W.at(2, seat2.token);
    out.push([acc.status === 200 && seat2.status === 200 && accAt1.id === "one-owner" && accAt2.id === two.id && seatAt2.status !== 200 && /own account passphrase is theirs and keeps reading this seat/.test(rk) && /an app they connected with it stops acting in this seat until they connect it again/.test(rk),
      `C15 · org 2's admin reissues its seat: that seat's SEAT session ends (${seatAt2.status}), the person's ACCOUNT session reads on in org 1 (${accAt1.id}) and org 2 (${accAt2.id}); the flash says so (and that an app they connected stops acting in this seat: 8.3a)`]);
    const rm = await W.control("two-owner-key", { action: "remove-person", personId: two.id });
    const r1 = await W.at(1, acc.token), r2 = await W.at(2, acc.token);
    out.push([/removed/.test(rm) && r1.id === "one-owner" && r2.status === 404,
      `C15 · removed from org 2: the account session no longer reads it (${r2.status}) and still reads org 1 (${r1.id}): an admin never signs a person out of another org`]);
    // the holder's own act: a proven ACCOUNT passphrase change ends every OTHER session of the account (A2), the one it was proven on stays
    const s1 = await W.login("owner@one.test", "owner-account-pass"), s2 = await W.login("owner@one.test", "owner-account-pass");
    await W.seatPass("one-owner", "one-owner-seat-pass");
    const seat1 = await W.login("owner@one.test", "one-owner-seat-pass");
    const ch = await W.call("POST", W.addr(1) + "/profile", { cookie: s2.token, body: { action: "set-my-passphrase", current: "owner-account-pass", password: "owner-account-pass-2" } });
    const s1n = await W.at(1, s1.token), s2n = await W.at(1, s2.token), seat1n = await W.at(1, seat1.token);
    out.push([ch.status === 200 && ch.json && ch.json.code === "account" && s1n.status !== 200 && seat1n.status !== 200 && s2n.id === "one-owner",
      `C15 · the holder's proven account passphrase change (${ch.json && ch.json.code}): another account session ${s1n.status}, a seat session ${seat1n.status}, the session it was proven on reads on (${s2n.id})`]);
    // rotate-my-key proven by the account passphrase: every session of the account, this one included
    const s3 = await W.login("owner@one.test", "owner-account-pass-2");
    const rot = await W.call("POST", W.addr(1) + "/profile", { cookie: s3.token, body: { action: "rotate-my-key", current: "owner-account-pass-2" } });
    const s3n = await W.at(1, s3.token), s2m = await W.at(1, s2.token);
    out.push([rot.status === 200 && rot.json && rot.json.code === "key" && s3n.status !== 200 && s2m.status !== 200,
      `C15 · rotate-my-key proven by the account passphrase ends every session of the account: this one ${s3n.status}, the other ${s2m.status}`]);
    // rotate-my-key proven by a SEAT's own secret (what its admin holds): only that seat's seat sessions, never the account's
    const la = await W.login("lee@both.test", "lee-account-pass", a1), ls2 = await W.login("lee@both.test", lee2.key);
    const lr = await W.call("POST", W.addr(2) + "/profile", { key: ls2.token, body: { action: "rotate-my-key", current: lee2.key } });
    const la2 = await W.at(2, la.token), la1 = await W.at(1, la.token), ls2n = await W.whoami(ls2.token);
    out.push([!!lee1.key && lr.status === 200 && ls2n.status === 401 && la1.id === lee1.id && la2.id === lee2.id,
      `C15 · rotate-my-key proven by the org-2 seat's own key ends that seat's session (${ls2n.status}); the account session reads on in org 1 (${la1.id}) and org 2 (${la2.id})`]);
    return out;
  },
  async C16() {
    // A6: a sign-in hashes once whether or not an account answers the email (the time tells no platform membership)
    const W = await world(), out = [];
    const sub = globalThis.crypto.subtle, real = sub.deriveBits.bind(sub);
    let n = 0;
    sub.deriveBits = (...a) => { n++; return real(...a); };
    try {
      n = 0; const none = await W.login("nobody@nowhere.test", "a-guess-of-twelve");
      const noneN = n;
      await W.seatPass("one-mia", "mia-pass");
      n = 0; const some = await W.login("mia@one.test", "a-guess-of-twelve");
      out.push([none.status === 401 && some.status === 401 && noneN >= 1, `C16 · a sign-in for an email no account holds costs ${noneN} passphrase hash(es) (one for an account's: ${n}): the time says nothing of membership`]);
    } finally { sub.deriveBits = real; }
    return out;
  },
  async C17() {
    // B5: a token's project stamp of another org is no stamp at this address (the `/` project picker shows again)
    const W = await world(), out = [];
    await W.control("one-owner-key", { action: "add-project", key: "beta", name: "Beta" });   // org 1 holds two projects: its owner picks
    await W.ownPass("owner@one.test", "owner-account-pass");
    await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test");
    const s = await W.login("owner@one.test", "owner-account-pass", W.addr(1).slice(1));
    const fresh = await W.call("GET", W.addr(1) + "/", { cookie: s.token, nav: true });
    const stamp = await W.call("POST", W.addr(2) + "/project", { cookie: s.token, body: { key: "shop" } });
    const stamped = W.one("SELECT project FROM tokens WHERE token_hash = ?", sha(s.token)).project;
    const back = await W.call("GET", W.addr(1) + "/", { cookie: s.token, nav: true });
    out.push([fresh.status === 200 && /data-screen="projects"/.test(fresh.text) && stamp.status === 200 && stamped === "o2--shop" && back.status === 200 && /data-screen="projects"/.test(back.text),
      `C17 · the session's stamp set in org 2 (${stamped}) is no stamp in org 1: its project picker shows again (${back.status}${/data-screen="projects"/.test(back.text) ? ", the picker" : `, ${back.location}`})`]);
    return out;
  },
  async C18() {
    // A5: one spelling of an account's email — add-person refuses a non-ASCII email (SQLite's lower() folds ASCII only)
    const W = await world(), out = [];
    const before = W.one("SELECT COUNT(*) AS n FROM people").n;
    const t = await W.control("one-owner-key", { action: "add-person", name: "Jörg", email: "JÖRG@x.de" });
    out.push([/email_not_ascii/.test(t) && W.one("SELECT COUNT(*) AS n FROM people").n === before && !W.one("SELECT 1 AS x FROM accounts WHERE email LIKE 'j%rg@x.de'"),
      `C18 · add-person refuses a non-ASCII email (email_not_ascii), nothing created`]);
    return out;
  },
  async C19() {
    // migrate-074 over a database as live holds it at 073 (live-shaped rows: org 1's people signing in by their seats' secrets,
    // a removed one, their live sessions, a key, a seat grant): every row stays what it was (NOT pending, active untouched), and
    // after it the new code keeps every person signing in, every session, key and grant working
    const out = [];
    const { DatabaseSync } = await import("node:sqlite");
    const { d1, r2, kv } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
    const { default: handler } = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "index.js")).href);
    const { resolveReader } = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "core.js")).href);
    const { credEpoch } = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "oauthgrants.js")).href);
    const { installOrgSlot } = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "data.js")).href);
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(PRE074);
    const T0 = "2026-09-01T00:00:00.000Z", LATER = "2027-01-01T00:00:00.000Z";
    db.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (1, 'Ryuklabs', ?, ?), (2, 'Suites', ?, ?)").run(T0, T0, T0, T0);
    db.prepare("UPDATE org SET settings = '{\"suites\":true}' WHERE id = 2").run();
    db.prepare("INSERT INTO projects (key, name, active, created_at) VALUES ('alpha', 'Alpha', 1, ?)").run(T0);
    const P = db.prepare("INSERT INTO people (id, name, email, role, key_hash, pass_hash, pass_salt, active, created_at, org) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const people = [["l-owner", "owner@ryuklabs.test", "owner", "owner-pass", 1, 1], ["l-mia", "mia@ryuklabs.test", "member", "mia-pass", 1, 1],
      ["l-gone", "gone@ryuklabs.test", "member", "gone-pass", 0, 1], ["l-suite", "suite@suites.test", "owner", "suite-pass", 1, 2]];
    for (const [id, email, role, pw, active, org] of people) P.run(id, id, email, role, sha(id + "-key"), await pbkdf2(pw, SALT), SALT, active, T0, org);
    const S = db.prepare("INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, org) VALUES (?,?,?,?,?,0,?)");
    S.run(sha("live-owner-session"), "l-owner", "web", T0, LATER, 1); S.run(sha("live-mia-session"), "l-mia", "web", T0, LATER, 1);
    const before = JSON.stringify(db.prepare("SELECT id, active, account_id, key_hash, pass_hash FROM people ORDER BY id").all());
    db.exec(M074);
    db.exec(M077);   // 8.3a's file, BEFORE this code as every ship applies it (the lockout's client, the seat's grants epoch)
    const rows = db.prepare("SELECT id, active, pending, account_id, key_hash, pass_hash FROM people ORDER BY id").all();
    out.push([rows.every((r) => Number(r.pending) === 0) && JSON.stringify(rows.map(({ pending, ...r }) => r)) === before,
      `C19 · migrate-074 over a 073 database: all ${rows.length} people NOT pending, every active flag, account, key and secret as it was (${rows.filter((r) => Number(r.active) === 1).length} active, ${rows.filter((r) => Number(r.active) === 0).length} removed, still removed)`]);
    const env = { DB: d1(db), BRAIN: r2(), OAUTH_KV: kv() }, cx = { waitUntil() {}, passThroughOnException() {} };
    const req = (path, init = {}) => handler.fetch(new Request("https://org.test" + path, init), env, cx);
    const login = async (email, password) => { const r = await req("/login", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ email, password, device: "c19" }) }); return r.status; };
    const at = async (slug, token) => { const r = await req(`/${slug}/whoami`, { headers: { accept: "application/json", cookie: "__Host-ar_session=" + token, "sec-fetch-site": "same-origin" } }); return r.status === 200 ? (await r.json()).id : r.status; };
    const key = async (k) => { const r = await req("/whoami", { headers: { accept: "application/json", authorization: "Bearer " + k } }); return r.status === 200 ? (await r.json()).id : r.status; };
    const signs = [await login("owner@ryuklabs.test", "owner-pass"), await login("mia@ryuklabs.test", "mia-pass"), await login("suite@suites.test", "suite-pass"), await login("gone@ryuklabs.test", "gone-pass")];
    const sess = [await at("ryuklabs", "live-owner-session"), await at("ryuklabs", "live-mia-session")];
    const keys = [await key("l-owner-key"), await key("l-mia-key")];
    const mia = db.prepare("SELECT key_hash, pass_hash FROM people WHERE id = 'l-mia'").get();
    const grant = await resolveReader(new Request("https://org.test/mcp"), installOrgSlot({ ...env }), new URL("https://org.test/mcp"), { props: { personId: "l-mia", scope: ["mcp:read", "mcp:write"], cred: await credEpoch(mia) } }).catch(() => null);
    out.push([signs.join() === "200,200,200,401" && sess.join() === "l-owner,l-mia" && keys.join() === "l-owner,l-mia" && grant && grant.id === "l-mia",
      `C19 · after it, live people keep signing in (${signs.join("/")}: the removed one stays out), their live sessions (${sess.join(", ")}), keys (${keys.join(", ")}) and a seat grant (${grant && grant.id}) keep working`]);
    return out;
  },
  // ---- sprint 8, 8.3a: the sprint-7 review's A3 (the lockout's key) — each RED on the tree before the fix ----
  async C20() {
    // A3: the lockout keyed by the account AND a client its own passphrase vouched for. A stranger who knows only the email locks
    // every vantage the account's passphrase never signed in from (8 in 15 minutes, account-wide, as before) — never the holder
    // on their own client. Driven at the doors' own functions with the client the router reads (src/accounts.js clientOf), each
    // attempt counted as POST /login counts it (a locked answer counts nothing)
    const W = await world(), out = [];
    const A = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "accounts.js")).href);
    await W.ownPass("mia@one.test", "mia-own-passphrase"); await W.seatPass("one-mia", "mia-seat-pass");
    // (sprint 21, 21.4a) Mia's email was approved as the operator's code approves one (a used code): create-org's proof answers her
    W.w.db.prepare("INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at, used_at, used_how) VALUES ('c20-used', 'mia@one.test', 'x', ?1, ?1, ?1, 'set')").run("2026-10-01T00:00:00.000Z");
    const env = W.w.env, url = new URL(W.w.origin + "/login");
    const tryAt = async (password, client) => {
      const r = await A.passphraseSignIn(env, url, { email: "mia@one.test", password, client });
      if (r.verdict !== "locked") await A.countSignIn(env, r, r.verdict === "ok");
      return r.verdict;
    };
    const first = [await tryAt("mia-own-passphrase", "c-holder"), await tryAt("mia-seat-pass", "c-seat")];
    const wrong = []; for (let i = 0; i < 8; i++) wrong.push(await tryAt("stranger-guess-" + i, "c-stranger"));
    const after = { stranger: await tryAt("mia-own-passphrase", "c-stranger"), fresh: await tryAt("mia-own-passphrase", "c-fresh"),
      seat: await tryAt("mia-seat-pass", "c-seat"), none: await tryAt("mia-own-passphrase", ""), holder: await tryAt("mia-own-passphrase", "c-holder") };
    const proof = { holder: (await A.accountProof(env, url, { email: "mia@one.test", password: "mia-own-passphrase", client: "c-holder" })).verdict,
      stranger: (await A.accountProof(env, url, { email: "mia@one.test", password: "mia-own-passphrase", client: "c-stranger" })).verdict };
    out.push([first.join() === "ok,ok" && wrong.every((v) => v === "wrong") && after.stranger === "locked" && after.fresh === "locked" && after.seat === "locked" && after.none === "locked",
      `C20 · a stranger's 8 wrong guesses lock the stranger and every vantage the account's passphrase never vouched for: the stranger ${after.stranger}, a fresh client ${after.fresh}, the client a SEAT secret signed in from ${after.seat}, no client ${after.none}`]);
    out.push([after.holder === "ok" && proof.holder === "ok" && proof.stranger === "locked",
      `C20 · the holder's own passphrase from their own client keeps working: the sign-in ${after.holder}, create-org's proof ${proof.holder} (the stranger's ${proof.stranger})`]);
    for (let i = 0; i < 8; i++) await tryAt("holder-typo-" + i, "c-holder");
    const own = await tryAt("mia-own-passphrase", "c-holder");
    out.push([own === "locked", `C20 · the holder's client is judged by its own failures: after its own 8, ${own}`]);
    return out;
  },
  async C21() {
    // A3 on /profile: the holder's ACCOUNT session (made by the account's passphrase) re-checks their passphrase whatever a
    // stranger's failures elsewhere; a credential the account's passphrase never made (the seat's key, an admin's mint) is held by
    // the account's lockout as before; and the account session is held by its own failures
    const W = await world(), out = [];
    await W.ownPass("mia@one.test", "mia-own-passphrase");
    const s = await W.login("mia@one.test", "mia-own-passphrase");
    for (let i = 0; i < 8; i++) await W.login("mia@one.test", "stranger-guess-" + i);
    const locked = await W.login("mia@one.test", "mia-own-passphrase");
    const prof = (body, o) => W.call("POST", W.addr(1) + "/profile", { ...o, body });
    const viaKey = await prof({ action: "set-my-passphrase", current: "mia-own-passphrase", password: "mia-next-passphrase" }, { key: "one-mia-key" });
    const viaSession = await prof({ action: "set-my-passphrase", current: "mia-own-passphrase", password: "mia-next-passphrase" }, { cookie: s.token });
    out.push([s.status === 200 && W.kind(s.token) === "account" && locked.status === 429 && viaKey.status === 429,
      `C21 · a stranger's 8 failures lock the sign-in (${locked.status}) and the seat key's /profile re-check (${viaKey.status}), as before`]);
    out.push([viaSession.status === 200 && viaSession.json && viaSession.json.code === "account",
      `C21 · the holder's own ACCOUNT session changes their passphrase on /profile: ${viaSession.status} ${viaSession.json && viaSession.json.code}`]);
    for (let i = 0; i < 8; i++) await prof({ action: "set-my-passphrase", current: "typo-" + i, password: "mia-third-passphrase" }, { cookie: s.token });
    const own = await prof({ action: "set-my-passphrase", current: "mia-next-passphrase", password: "mia-third-passphrase" }, { cookie: s.token });
    out.push([own.status === 429, `C21 · the account session is judged by its own failures: after its own 8, ${own.status}`]);
    return out;
  },
  async C22() {
    // the owner's ruling (2026-10-09): a seat that waits for its yes makes the JSON sign-in by passphrase ask, as several seats do
    const W = await world(), out = [];
    const a1 = W.addr(1), a2 = W.addr(2);
    await W.ownPass("owner@one.test", "owner-account-pass");   // org 1's owner holds their account passphrase (signed up)
    const inv = await W.add("two-owner-key", "Owner One (in Two)", "owner@one.test", { accept: false });   // org 2's seat waits
    const t0 = W.live();
    const asked = await W.call("POST", "/login", { body: { email: "owner@one.test", password: "owner-account-pass", device: "accounts-selftest" } });
    const listed = ((asked.json && asked.json.orgs) || []).map((o) => o.slug).join();
    const note = String((asked.json && asked.json.note) || "");
    out.push([inv.waited && asked.status === 409 && asked.json.error === "choose_org" && listed === a1.slice(1) && !asked.json.token && W.live() === t0 &&
      /waits for your yes/.test(note) && /\/orgs/.test(note) && !/several orgs/.test(note),
      `C22 · one active seat and one that waits: the JSON sign-in asks (${asked.status} ${asked.json && asked.json.error}, orgs [${listed}]), nothing minted (${W.live() - t0}); the note: "${note.slice(0, 60)}…"`]);
    // the same account at the OAuth form (the ruling's intent covers the third door): the form re-asks, no grant completes
    {
      const { oauthDefaultHandler } = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "oauth.js")).href);
      let grant = null;
      const env = { ...W.w.env, OAUTH_PROVIDER: { lookupClient: async () => ({ clientName: "A client" }), completeAuthorization: async (o) => { grant = o; return { redirectTo: "https://client.test/cb?code=x" }; } } };
      const req = new Request(W.w.origin + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "owner@one.test", password: "owner-account-pass", oauth_req: btoa(JSON.stringify({ clientId: "c", redirectUri: "https://client.test/cb", scope: ["mcp:read"] })) }).toString() });
      const r = await oauthDefaultHandler.fetch(req, env, {});
      const body = await r.text();
      out.push([r.status === 200 && grant == null && /name="org"/.test(body) && W.live() === t0,
        `C22 · the OAuth form with a seat waiting re-asks the org (${r.status}, grant ${grant ? "completed" : "none"}), nothing minted`]);
    }
    // naming the org signs in: `org`, or `next` naming a page of it
    const named = await W.login("owner@one.test", "owner-account-pass", a1.slice(1));
    const byNext = await W.call("POST", "/login", { body: { email: "owner@one.test", password: "owner-account-pass", next: `${a1}/home`, device: "accounts-selftest" } });
    const n1 = named.token ? await W.at(1, named.token) : {}, nx = byNext.json && byNext.json.token ? await W.at(1, byNext.json.token) : {};
    out.push([named.status === 200 && W.kind(named.token) === "account" && n1.id === "one-owner" && byNext.status === 200 && nx.id === "one-owner",
      `C22 · naming the org signs in: org ${named.status} (${n1.id}), next ${byNext.status} (${nx.id})`]);
    // the waiting org's slug names no active seat: asked again, as an account in several orgs naming one it is not in is
    // (its one active org listed, never the waiting one), nothing minted
    const t1 = W.live();
    const waiting = await W.login("owner@one.test", "owner-account-pass", a2.slice(1));
    out.push([waiting.status === 409 && waiting.error === "choose_org" && (waiting.orgs || []).map((o) => o.slug).join() === a1.slice(1) && !waiting.token && W.live() === t1,
      `C22 · naming the org whose seat waits: ${waiting.status} ${waiting.error} (orgs [${(waiting.orgs || []).map((o) => o.slug).join()}]), nothing minted`]);
    // untouched: the seat's own secret signs in that seat; a browser lands on the picker
    await W.seatPass("one-owner", "owner-own-seat-pass");
    const seat = await W.login("owner@one.test", "owner-own-seat-pass"), web = await W.webLogin("owner@one.test", "owner-account-pass");
    const sw = seat.token ? await W.whoami(seat.token) : {};
    out.push([seat.status === 200 && W.kind(seat.token) === "seat" && sw.id === "one-owner" && web.status === 302 && web.location === "/orgs" && !!web.cookie,
      `C22 · untouched: the seat's own secret signs in its seat (${seat.status}, ${sw.id}); a browser lands on the picker (${web.status} ${web.location})`]);
    // accepted: two active seats, the several-orgs ask, no waiting sentence
    const yes = web.cookie ? await W.call("POST", "/orgs/seat", { cookie: web.cookie, form: { seat: inv.id, answer: "accept" } }) : {};
    const after = await W.call("POST", "/login", { body: { email: "owner@one.test", password: "owner-account-pass", device: "accounts-selftest" } });
    const an = String((after.json && after.json.note) || "");
    out.push([yes.status === 303 && after.status === 409 && after.json.error === "choose_org" && (after.json.orgs || []).length === 2 && /several orgs/.test(an) && !/waits/.test(an),
      `C22 · accepted (${yes.status}): two active seats, the several-orgs ask (${after.status}, ${(after.json && after.json.orgs || []).length} orgs), no waiting sentence`]);
    return out;
  },
};
// migrate-070 as written, and the database as it stands before it: boot.sql with 070's table, columns, indexes and triggers
// taken out (each strip checked, so a boot.sql that moves on turns this red instead of testing something else)
const M070 = readFileSync(join(ENGINE, "migrate-070.sql"), "utf8");
const M072 = readFileSync(join(ENGINE, "migrate-072.sql"), "utf8");
const M073 = readFileSync(join(ENGINE, "migrate-073.sql"), "utf8");
const M074 = readFileSync(join(ENGINE, "migrate-074.sql"), "utf8");
const M077 = readFileSync(join(ENGINE, "migrate-077.sql"), "utf8");
const M079 = readFileSync(join(ENGINE, "migrate-079.sql"), "utf8");
// strip077(boot) -> boot.sql before migrate-077 (sprint 8, 8.3a): its two columns and its one index out (the strip checked)
const strip077 = (b0) => {
  let b = b0;
  for (const [from, what] of [[", account_id TEXT, client TEXT);", "login_attempts.client"], [" OR active = 0)), reissued_at TEXT);", "people.reissued_at"]]) {
    const n = b.replace(from, from.replace(/, (client|reissued_at) TEXT\)/, ")")); if (n === b) throw new Error(`strip077: migrate-077's ${what} not found in boot.sql`); b = n;
  }
  const n = b.replace(/\nCREATE INDEX IF NOT EXISTS idx_login_known [^;]*;\n/, "\n"); if (n === b) throw new Error("strip077: migrate-077's idx_login_known not found in boot.sql");
  return n;
};
// strip076(boot) -> boot.sql before migrate-076 (sprint 8, 8.2): its counters table and its one index out (the strip checked;
// the index names people.pending, which PRE070 strips)
const strip076 = (b0) => {
  let b = strip077(b0);
  for (const [re, what] of [[/-- migrate-076: the plan's running counters[^\n]*\nCREATE TABLE IF NOT EXISTS org_usage \([\s\S]*?\n\);\n/, "org_usage"],
    [/CREATE INDEX IF NOT EXISTS idx_people_org_held [^;]*;\n/, "idx_people_org_held"]]) {
    const n = b.replace(re, ""); if (n === b) throw new Error(`strip076: migrate-076's ${what} not found in boot.sql`); b = n;
  }
  return b;
};
// strip075(boot) -> boot.sql before migrate-075 (sprint 8, 8.1, after every file this case replays): migrate-076 first (it came
// after), then its org column, its table with its seed rows and its three indexes out (the strip checked)
const strip075 = (b0) => {
  let b = strip076(b0);
  for (const [re, what] of [[/,\n  plan {7}TEXT NOT NULL DEFAULT 'free' [^\n]*(?=\n\);)/, "org.plan"],
    [/-- migrate-075: the plans[^\n]*\nCREATE TABLE IF NOT EXISTS plan_limits \([\s\S]*?ON CONFLICT \(plan\) DO NOTHING;\n/, "plan_limits"],
    ...["idx_people_org_seated", "idx_transmission_org_month", "idx_artifacts_org_bytes"].map((ix) => [new RegExp(`CREATE INDEX IF NOT EXISTS ${ix} [^;]*;\\n`), ix])]) {
    const n = b.replace(re, ""); if (n === b) throw new Error(`strip075: migrate-075's ${what} not found in boot.sql`); b = n;
  }
  return b;
};
const PRE070 = (() => {
  let b = strip075(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const cut = (re, what) => { const n = b.replace(re, ""); if (n === b) throw new Error(`PRE070: ${what} not found in boot.sql`); b = n; };
  cut(/-- migrate-070: one account per email[^\n]*\nCREATE TABLE IF NOT EXISTS accounts \([\s\S]*?\n\);\n/, "the accounts table");
  cut(/, account_id TEXT REFERENCES accounts\(id\), pending INTEGER NOT NULL DEFAULT 0 CHECK \(pending IN \(0, 1\) AND \(pending = 0 OR active = 0\)\)/, "people.account_id and migrate-074's people.pending");
  { const n = b.replace(", org INTEGER, account_id TEXT);\n\nCREATE TABLE IF NOT EXISTS transmission", ", org INTEGER);\n\nCREATE TABLE IF NOT EXISTS transmission"); if (n === b) throw new Error("PRE070: migrate-073's tokens.account_id not found in boot.sql"); b = n; }
  { const n = b.replace(", org INTEGER, account_id TEXT);", ", org INTEGER);"); if (n === b) throw new Error("PRE070: login_attempts.account_id not found in boot.sql"); b = n; }
  for (const ix of ["idx_login_account", "idx_people_account", "idx_people_account_seat"]) cut(new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${ix} [^;]*;\\n`), ix);
  // migrate-072 (sprint 7, 7.3) came after: its org columns and indexes out too (its triggers go with 070's, at the file's end)
  cut(/,\n  slug {7}TEXT CHECK [^\n]*\n  created_by_account TEXT\n\);/, "migrate-072's org columns");
  b = b.replace(/settings IS NULL OR json_valid\(settings\)\)$/m, "settings IS NULL OR json_valid(settings))\n);");
  for (const ix of ["idx_org_founder", "idx_org_slug"]) cut(new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${ix} [^;]*;\\n`), ix);
  // migrate-081 (sprint 21, 21.4a) came after: its account tables and their indexes out too
  cut(/-- migrate-081: a forgotten passphrase's single-use link[^\n]*\nCREATE TABLE IF NOT EXISTS account_resets \([\s\S]*?\n\);\n/, "migrate-081's account_resets");
  cut(/-- migrate-081: an account's browser session[^\n]*\nCREATE TABLE IF NOT EXISTS account_sessions \([\s\S]*?\n\);\n/, "migrate-081's account_sessions");
  for (const ix of ["idx_account_resets_account", "idx_account_sessions_account"]) cut(new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${ix} [^;]*;\\n`), ix);
  // and (21.4b) access_requests' account link (the person's path: the account the verification made)
  cut(/\n  account_id      TEXT,\n  account_at      TEXT,/, "migrate-081's access_requests.account_id and account_at");
  cut(/-- migrate-070\.sql \(sprint 7, 7\.1\)[\s\S]*$/, "migrate-070's triggers");
  if (b.split("\n").some((l) => !/^\s*--/.test(l) && /account/.test(l))) throw new Error("PRE070: boot.sql still names an account after the strip");
  return b;
})();

// the database as live holds it at 073 (before migrate-074): boot.sql with 074's one column taken out (the strip checked)
const PRE074 = (() => {
  const b = strip075(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const n = b.replace(", pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1) AND (pending = 0 OR active = 0))", "");
  if (n === b) throw new Error("PRE074: migrate-074's people.pending not found in boot.sql");
  return n;
})();

// ---- the mutants: each must turn its case(s) red ----
const MUTANTS = [
  { name: "every session an ACCOUNT session (a seat's secret reaches the account's other seats)", file: "src/accounts.js",
    from: 'const accountId = r.session === "account" && r.account ? r.account.id : null;', to: "const accountId = r.account ? r.account.id : null;", red: ["C1", "C3"] },
  { name: "a session reads under an address as its own seat, whatever the org", file: "src/accounts.js",   // SESSION_AT_SQL (moved from core.js: sprint 12's review)
    from: "WHERE t.token_hash = ?1 AND t.revoked = 0 AND t.expires_at > ?2 AND p.active = 1 AND p.org = ?3 \" +", to: "WHERE t.token_hash = ?1 AND t.revoked = 0 AND t.expires_at > ?2 AND p.active = 1 \" +",
    also: { file: "src/data.js", from: "  if (s.address && s.address.org !== org) throw orgError(\"org_mismatch\", \"the address serves another org\");\n", to: "" }, red: ["C1", "C3"] },
  { name: "set-password without the account's span", file: "src/admin.js",
    from: "if (password.length >= 4 && (await seatSpan(env, personId)).elsewhere) {", to: "if (false) {", red: ["C4"] },
  { name: "a seat's proof sets the account's passphrase", file: "src/secrets.js",
    from: "    if (provedAccount) {\n", to: "    if (ok) {\n", red: ["C7"] },
  { name: "the lockout counted per org, not per account", file: "src/accounts.js",
    from: "WHERE ok = 0 AND at > ?1 AND", to: "WHERE ok = 0 AND org = 1 AND at > ?1 AND", red: ["C5"] },
  { name: "a new account carries its first seat's minted key (the squatting door)", db:
    "DROP TRIGGER people_account_attach; CREATE TRIGGER people_account_attach AFTER INSERT ON people WHEN NEW.email IS NOT NULL BEGIN " +
    "INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at) VALUES (lower(hex(randomblob(16))), lower(trim(NEW.email)), NEW.pass_hash, NEW.pass_salt, NEW.created_at, NEW.created_at) ON CONFLICT (email) DO NOTHING; " +
    "UPDATE people SET account_id = (SELECT a.id FROM accounts a WHERE a.email = lower(trim(NEW.email))) WHERE id = NEW.id; END;", red: ["C3"] },
  { name: "a SEAT session reaches its account's other orgs (the picker)", file: "src/core.js",
    from: 'export const SESSION_PLACE_SQL = "SELECT t.account_id, o.slug,', to: 'export const SESSION_PLACE_SQL = "SELECT p.account_id AS account_id, o.slug,', red: ["C11"] },
  { name: "the picker lists every account's seats, not the reader's", file: "src/accounts.js",
    from: "FROM people p INDEXED BY idx_people_account_seat JOIN org o ON o.id = p.org \" +\n  \"WHERE p.account_id = ?1 AND p.active = 1",
    to: "FROM people p JOIN org o ON o.id = p.org \" +\n  \"WHERE (p.account_id = ?1 OR ?1 IS NOT NULL) AND p.active = 1", red: ["C11", "C12"] },
  { name: "a SEAT session's rail lists its account's orgs (the switcher)", file: "src/accounts.js",
    from: "t.project AS token_project, t.account_id AS session_account", to: "t.project AS token_project, p.account_id AS session_account", red: ["C12"] },
  { name: "the root before a sign-in wears org 1's brand", file: "src/data.js",
    from: "export const addressOrg = (env) => readerOrg(env) ?? addressServes(env);", to: "export const addressOrg = (env) => readerOrg(env) ?? addressServes(env) ?? HOME_ORG;", red: ["C12"] },
  // sprint 7's review: each fix's mutant turns its case red
  { name: "add-person never waits for the holder's yes (A1)", file: "src/accounts.js",
    from: "return !!(r && Number(r.ask) === 1);", to: "return false;", red: ["C13"] },
  { name: "a seat's answer not bound to the holder's own account session (A1)", file: "src/accounts.js",
    from: 'export const ACCEPT_SEAT_SQL = "UPDATE people SET active = 1, pending = 0 WHERE id = ?1 AND pending = 1 AND account_id = " +\n  "(SELECT t.account_id FROM tokens t WHERE t.token_hash = ?2 AND t.revoked = 0 AND t.expires_at > ?3 AND t.account_id IS NOT NULL)" + INVITED_ELSEWHERE;',
    to: 'export const ACCEPT_SEAT_SQL = "UPDATE people SET active = 1, pending = 0 WHERE id = ?1 AND pending = 1 AND (?2 IS NOT NULL OR ?3 IS NOT NULL)" + INVITED_ELSEWHERE;', red: ["C13"] },
  { name: "the OAuth form takes the account's oldest seat (A1)", file: "src/oauth.js",
    from: 'if (signin.verdict === "ok" && (signin.ask || signin.pickMissed || signin.waits)) {', to: "if (false) {", red: ["C14", "C22"] },
  { name: "a JSON sign-in picks an org for an account in several (A1)", file: "src/index.js",
    from: '(signin.ask || signin.waits || signin.pickMissed || signin.pendingOnly)) {', to: '(signin.waits || signin.pickMissed || signin.pendingOnly)) {', red: ["C1"] },
  // the owner's ruling (2026-10-09): a seat that waits makes the JSON sign-in ask
  { name: "a seat that waits never makes the sign-in ask (the account's one active seat by default)", file: "src/accounts.js",
    from: "waits: pending.length > 0 && !named, pickMissed:", to: "waits: false, pickMissed:", red: ["C22"] },
  { name: "the JSON sign-in ignores a seat that waits", file: "src/index.js",
    from: '(signin.ask || signin.waits || signin.pickMissed || signin.pendingOnly)) {', to: '(signin.ask || signin.pickMissed || signin.pendingOnly)) {', red: ["C22"] },
  { name: "an admin's seat action ends the person's ACCOUNT sessions too (B1 + A4)", file: "src/admin.js",
    from: 'export const REVOKE_SESSIONS_SQL = "UPDATE tokens SET revoked = 1 WHERE person_id = ? AND account_id IS NULL AND revoked = 0";',
    to: 'export const REVOKE_SESSIONS_SQL = "UPDATE tokens SET revoked = 1 WHERE person_id = ? AND revoked = 0";', red: ["C15"] },
  { name: "a proven account passphrase change ends no session (A2)", file: "src/secrets.js",
    from: "      await endAccountSessions(env, person.account_id, keepHash);\n", to: "", red: ["C15"] },
  // sprint 8, 8.3a: the sprint-7 review's A3 (the lockout's key)
  { name: "the lockout ignores the client (every vantage judged account-wide: a stranger locks the holder out)", file: "src/accounts.js",
    from: "return (known ? Number((r && r.mine) || 0) : Number((r && r.n) || 0)) >= LOCKOUT_FAILS;", to: "return Number((r && r.n) || 0) >= LOCKOUT_FAILS;", red: ["C20", "C21"] },
  { name: "every client judged by its own failures (no vouch asked: a stranger's addresses each get 8)", file: "src/accounts.js",
    from: "const known = !!(c && accountId && (vouched || (r && Number(r.known) === 1)));", to: "const known = !!c;", red: ["C20"] },
  { name: "a seat's secret vouches for its client", file: "src/accounts.js",
    from: 'const client = clientNamed(r.client, ok, r.session === "account" || r.vouched === true);', to: "const client = clientNamed(r.client, ok, true);", red: ["C20"] },
  { name: "/profile vouches for any credential (the seat's key too)", file: "src/secrets.js",
    from: "const vouched = !!(reader && reader.viaCookie && person.account_id && String(reader.session_account || \"\") === String(person.account_id));", to: "const vouched = true;", red: ["C21"] },
  { name: "a sign-in for an unknown email hashes nothing (A6)", file: "src/accounts.js",
    from: ': (await pbkdf2(pw, NO_SALT), false);', to: ': false;', red: ["C16"] },
  { name: "a stamp of another org is this org's (B5)", file: "src/core.js",
    from: "return o && Number(o.org) === Number(row.org) ? row : { ...row, token_project: null };", to: "return row;", red: ["C17"] },
  { name: "add-person takes a non-ASCII email (A5)", file: "src/admin.js",
    from: "} else if (email && !asciiEmail(email)) {", to: "} else if (false) {", red: ["C18"] },
  { name: "migrate-070's backfill carries each person's passphrase onto their account", migration: M070.replace(
    "INSERT INTO accounts (id, email, created_at, updated_at)\n  SELECT lower(hex(randomblob(16))), lower(trim(email)), MIN(created_at), MIN(created_at)",
    "INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at)\n  SELECT lower(hex(randomblob(16))), lower(trim(email)), MAX(pass_hash), MAX(pass_salt), MIN(created_at), MIN(created_at)"), red: ["C10"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

// the clean tree: every case green
for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);

// each mutant: its case(s) red
for (const m of MUTANTS) {
  let dir = null;
  try {
    MUT = { dbMutant: m.db, migration: m.migration };
    if (m.migration !== undefined && m.migration === M070) { ok(false, `mutant "${m.name}": its needle is not found in migrate-070.sql (update this selftest with the migration)`); continue; }
    if (m.file) {
      dir = mkdtempSync(join(ENGINE, ".accounts-mutation-"));
      cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
      const p = join(dir, m.file), s = readFileSync(p, "utf8");
      if (s.split(m.from).length !== 2) { ok(false, `mutant "${m.name}": its needle is not found exactly once in ${m.file} (update this selftest with the code)`); continue; }
      writeFileSync(p, s.replace(m.from, m.to));
      if (m.also) {   // a mutant that needs two edits (the wall is held in two places: both taken out)
        const p2 = join(dir, m.also.file), s2 = readFileSync(p2, "utf8");
        if (s2.split(m.also.from).length !== 2) { ok(false, `mutant "${m.name}": its second needle is not found exactly once in ${m.also.file}`); continue; }
        writeFileSync(p2, s2.replace(m.also.from, m.also.to));
      }
      MUT.src = join(dir, "src");
    }
    const reds = [];
    // red by an assertion of the case, never by a crash (a mutant that only breaks the world proves nothing)
    for (const name of m.red) { const res = await runCase(name); reds.push(res.some(([c, l]) => !c && !/ threw: /.test(l)) && !res.some(([, l]) => / threw: /.test(l))); }
    ok(reds.every(Boolean), `mutant "${m.name}" turns ${m.red.join(" and ")} red (${reds.map((r, i) => `${m.red[i]} ${r ? "red" : "GREEN"}`).join(", ")})`);
  } finally { MUT = {}; if (dir) rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${failed ? "✗" : "✓"} accounts selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
