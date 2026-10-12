// tools/invite-selftest.mjs — sprint 12, slice 12.3 (migrate-079; src/accounts.js THE INVITE LINK, src/admin.js mintInvite,
// src/invite.js, src/signup.js renderInvite): an org's one-time invite link, through the REAL worker (src/index.js over node:sqlite
// built from boot.sql, tools/fixtures/sqlite-worker.mjs) holding two orgs. Each case builds a fresh world.
//   I1 · the mint: Control's Invite with deliver=link makes the seat and ONE link (shown once, on the request's origin, with its
//        copy button), never the key; the row is the admin's org's, the seat's own email, only the token's hash; a script's
//        add-person (no deliver) still answers the key; invite-link re-mints for a seat and the older link ends
//   I2 · the redemption: GET /signup?via=invite sets no session and holds no token; the form (the token from the fragment) sets
//        the ACCOUNT's passphrase, marks it with the org, spends the link, signs the invitee in (an ACCOUNT session) and lands at
//        /<the org's slug>, as the invited seat (its role, projects and hats as Invite chose them); a JSON redemption the same
//   I3 · single-use: the same link again is refused (401 invalid_invite), nothing written; two at once: exactly one wins
//   I4 · refused, nothing written: an expired link, a removed seat, a Reissued seat (rotate-key), a set-password, an older link
//        after a newer one
//   I5 · an email whose account already stands: a seat that waits (its account elsewhere) gets NO link; a link minted while the
//        account was fresh, then another org seats the email (or the account gains a passphrase), answers 409 account_stands,
//        nothing written, the account's passphrase untouched
//   I6 · authority: a member (and a Partner) cannot mint (403); one org's admin aimed at another org's seat mints nothing; an org at
//        its plan's people limit refuses (plan_limit), no seat and no link
//   I7 · the squat by link is contained: org 2's admin redeems its own link for a fresh email; org 1 then seats that email (it
//        waits). The invite-made passphrase sees no waiting seat on the picker, cannot accept or decline it, creates no org
//        (403 org_by_invite); the operator's code (a reset) clears the mark, and then the holder's yes works
//   I8 · the token is in no row, no Location, no log line and no answer but the admin's one flash and the invitee's own form
//   I10 · (sprint 12's review) the mark holds wherever the account's seats are listed or signed into: the add-person race's
//        outcome (org 2 read the account's consent before the link set its passphrase, and inserted an ACTIVE seat after) gives
//        the invite-made passphrase nothing of org 2 — its sign-in signs in org 1's seat alone (no choose_org, a browser lands in
//        org 1, not on the picker), its session reads nothing at org 2's address, the picker lists org 1 alone, an account grant
//        naming org 2 acts as the org-1 seat; a deleted org's mark (0: tools/org-undo.mjs) reaches no seat at all; the operator's
//        code clears the mark and then both seats answer (the instrument: the guard is the mark)
//   I11 · (sprint 12's review) New invite link only for a seat never used: a seat signed in with its key, one that filed, and one
//        whose account holds its own passphrase each get NO link ("Nothing done", Reset passphrase / set-password named, no row);
//        a fresh seat does
//   I9 · the door's guards: the field checks before any read (422 bad_invite: invite, passphrase, confirm), a cross-site form
//        (403), the address's flood filter (LOGIN_LIMIT, the key POST /login spends) answers 429 before any read; the invite page
//        and its redemption's answers carry referrer-policy: same-origin (sprint 12's review, I2)
// And the MUTATION PROOF: each named mutant (a scratch copy of src/, one or more edits) must turn its case(s) red by an assertion.
// Exit 1 on any failure. A gate step. `--src <dir>` runs the cases alone against another copy of src/ (the red-before proof).
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker, d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { allowEmail } = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
const { pbkdf2, sha256 } = await import(pathToFileURL(join(ENGINE, "src", "util.js")).href);
const PASS = "invitee-own-passphrase";

// every line the worker logs while the cases run (I8 reads it); the selftest's own lines never carry a token
const LOGGED = [];
for (const k of ["log", "warn", "error", "info", "debug"]) { const f = console[k].bind(console); console[k] = (...a) => { LOGGED.push(a.map(String).join(" ")); f(...a); }; }
const SEEN = [];   // every answer of the clean run: [status, location, body]
let MUT = {};

async function world({ plan } = {}) {
  const w = await sqliteWorker({ org: "One", projects: ["alpha", "beta"], src: MUT.src, people: [
    ["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"],
    ["one-mia", "Mia One", "member", "one-mia-key", ["alpha"], "mia@one.test"],
    ["one-pat", "Pat One", "partner", "one-pat-key", ["alpha"], "pat@one.test"]],
    orgs: [{ id: 2, name: "Two", projects: ["shop"], people: [["two-owner", "Owner Two", "owner", "two-owner-key", [], "owner@two.test"]] }], ...(plan ? { plan } : {}) });
  const q = (sql, ...a) => w.db.prepare(sql).all(...a);
  const one = (sql, ...a) => w.db.prepare(sql).get(...a);
  const call = async (method, path, { key, body, form, cookie, headers: extra = {} } = {}) => {
    const headers = { accept: form ? "text/html" : "application/json", ...extra };
    if (key) headers.authorization = "Bearer " + key;
    if (cookie) { headers.cookie = "__Host-ar_session=" + cookie; headers["sec-fetch-site"] = headers["sec-fetch-site"] || "same-origin"; }
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" }));
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
    const location = r.headers.get("location"), setCookie = r.headers.get("set-cookie") || "";
    SEEN.push([r.status, location || "", text]);
    return { status: r.status, text, json, location, setCookie, referrer: r.headers.get("referrer-policy"), cookie: (setCookie.match(/__Host-ar_session=([^;]+)/) || [])[1] || "" };
  };
  const control = (key, fields) => call("POST", "/control", { key, form: fields });
  // invite(key, name, email, extra) -> { text, token, link }: Invite with a link (Control's form sends deliver=link)
  const invite = async (key, name, email, extra = {}) => {
    const r = await control(key, { action: "add-person", name, email, deliver: "link", seatsChosen: "1", ...extra });
    const link = (r.text.match(/https:\/\/org\.test\/signup\?via=invite#([0-9a-f]{48})\b/) || [])[0] || null;
    return { text: r.text, status: r.status, link, token: link ? link.split("#")[1] : null };
  };
  const relink = async (key, personId) => {
    const r = await control(key, { action: "invite-link", personId });
    const link = (r.text.match(/https:\/\/org\.test\/signup\?via=invite#([0-9a-f]{48})\b/) || [])[0] || null;
    return { text: r.text, status: r.status, link, token: link ? link.split("#")[1] : null };
  };
  // redeem(token, o) -> the form's answer (a browser), or the JSON one (o.json)
  const redeem = (token, o = {}) => o.json
    ? call("POST", "/signup", { body: { via: "invite", invite: token, password: o.password || PASS, ...(o.confirm != null ? { confirm: o.confirm } : {}) }, headers: o.headers })
    : call("POST", "/signup", { form: { web: "1", via: "invite", invite: token == null ? "" : token, password: o.password || PASS, confirm: o.confirm ?? (o.password || PASS) }, headers: o.headers });
  const seat = (email, org) => one("SELECT id, active, pending, role, access_hats, key_hash, pass_hash FROM people WHERE email = ? AND org = ?", email, org);
  const account = (email) => one("SELECT id, pass_hash, pass_salt, invited_org FROM accounts WHERE email = ?", email);
  const links = (email) => q("SELECT * FROM seat_invites WHERE email = ? ORDER BY created_at, rowid", email);
  const slug = (org) => one("SELECT slug FROM org WHERE id = ?", org).slug;
  const whoAt = async (org, cookie) => { const r = await call("GET", `/${slug(org)}/whoami`, { cookie }); return r.status === 200 && r.json ? r.json.id : r.status; };
  // the rows a refusal must not move: every account, person, token, link, seat and attempt
  const snap = () => JSON.stringify([q("SELECT * FROM accounts ORDER BY id"), q("SELECT * FROM people ORDER BY id"), q("SELECT * FROM tokens ORDER BY token_hash"),
    q("SELECT * FROM seat_invites ORDER BY id"), q("SELECT * FROM project_seats ORDER BY person_id, project_key"), q("SELECT COUNT(*) AS n FROM login_attempts")]);
  return { w, q, one, call, control, invite, relink, redeem, seat, account, links, slug, whoAt, snap, DB: d1(w.db) };
}

const CASES = {
  async I1() {
    const W = await world(), out = [];
    const a = await W.invite("one-owner-key", "Nia New", "Nia.New@Fresh.test", { role: "member", projectKey: "alpha", accessHat: "finance" });
    const s = W.seat("nia.new@fresh.test", 1), l = W.links("nia.new@fresh.test");
    out.push([a.status === 200 && !!a.token && /Invite link, shown once/.test(a.text) && a.text.includes(`data-copy`) && !/API key\)|shown again:/.test(a.text) && !/\b[0-9a-f]{40}\b/.test(a.text.slice(a.text.indexOf('data-flash="invite-link"'), a.text.indexOf('data-flash="invite-link"') + 3000).split(a.token).join("")),
      `I1 · Invite with deliver=link answers ONE link on the request's origin with its copy button, and no key (${a.status}, link ${a.token ? "shown" : "MISSING"})`]);
    out.push([s && s.active === 1 && s.pending === 0 && l.length === 1 && l[0].org === 1 && l[0].person_id === s.id && l[0].email === "nia.new@fresh.test" && l[0].token_hash === await sha256(`sharingu-invite:v1:${a.token}`)
      && !l[0].used_at && Date.parse(l[0].expires_at) - Date.now() > 6.9 * 864e5 && Date.parse(l[0].expires_at) - Date.now() < 7.1 * 864e5,
      `I1 · its row: org ${l[0] && l[0].org}, the seat ${l[0] && l[0].person_id === (s && s.id) ? "made" : "OTHER"}, the seat's own email, only the token's hash, 7 days`]);
    const k = await W.control("one-owner-key", { action: "add-person", name: "Kai Key", email: "kai@fresh.test" });
    out.push([/API key\): [0-9a-f]{40}/.test(k.text) && W.links("kai@fresh.test").length === 0, "I1 · a script's add-person (no deliver) still answers the key, and makes no link"]);
    const b = await W.relink("one-owner-key", s.id), l2 = W.links("nia.new@fresh.test");
    out.push([!!b.token && b.token !== a.token && l2.length === 2 && !!l2[0].revoked_at && !l2[1].revoked_at && /Any older link of theirs no longer works/.test(b.text),
      `I1 · invite-link re-mints for the seat: a new link, the older one revoked (${l2.length} rows)`]);
    const r = await W.redeem(a.token);
    out.push([r.status === 401, `I1 · the revoked older link is refused (${r.status})`]);
    return out;
  },
  async I2() {
    const W = await world(), out = [];
    const a = await W.invite("one-owner-key", "Nia New", "nia@fresh.test", { role: "partner", projectKey: "beta", accessHat: "gtm" });
    const pg = await W.call("GET", "/signup?via=invite", { headers: { accept: "text/html" } });
    out.push([pg.status === 200 && !pg.setCookie && /data-screen="signup-invite"/.test(pg.text) && /name="invite"/.test(pg.text) && /location\.hash/.test(pg.text) && /replaceState/.test(pg.text) && !pg.text.includes(a.token),
      `I2 · GET /signup?via=invite: ${pg.status}, no session set, the fragment's token moved into the form by the page's script, no token in the page`]);
    const before = W.seat("nia@fresh.test", 1);
    const r = await W.redeem(a.token);
    const acc = W.account("nia@fresh.test"), l = W.links("nia@fresh.test")[0], after = W.seat("nia@fresh.test", 1);
    out.push([r.status === 302 && r.location === `/${W.slug(1)}` && !!r.cookie && acc && acc.pass_hash === await pbkdf2(PASS, acc.pass_salt) && acc.invited_org === 1 && !!l.used_at
      && after.key_hash === before.key_hash && after.role === "partner" && after.access_hats === '["gtm"]',
      `I2 · the form: ${r.status} -> ${r.location}, its cookie set; the ACCOUNT holds the chosen passphrase, marked org ${acc && acc.invited_org}; the link spent; the seat as invited (${after.role}, ${after.access_hats})`]);
    const tok = W.one("SELECT account_id, person_id FROM tokens WHERE token_hash = ?", await sha256(r.cookie));
    const who = await W.whoAt(1, r.cookie);
    out.push([tok && tok.account_id === acc.id && tok.person_id === after.id && who === after.id, `I2 · the session is the ACCOUNT's on the invited seat, and it reads /${W.slug(1)} as that seat (${who})`]);
    const seats = W.q("SELECT project_key FROM project_seats WHERE person_id = ?", after.id).map((x) => x.project_key);
    out.push([seats.join() === "beta", `I2 · seated as invited: ${seats.join()}`]);
    const lg = await W.call("POST", "/login", { body: { email: "nia@fresh.test", password: PASS } });
    out.push([lg.status === 200 && !!lg.json.token, `I2 · the chosen passphrase signs in at /login (${lg.status})`]);
    const j = await W.invite("one-owner-key", "Jo Json", "jo@fresh.test");
    const rj = await W.redeem(j.token, { json: true });
    const wj = rj.json && rj.json.token ? await W.call("GET", "/whoami", { key: rj.json.token }) : {};
    out.push([rj.status === 200 && rj.json.account === "invited" && rj.json.signedIn === true && rj.json.org === W.slug(1) && wj.json && wj.json.id === W.seat("jo@fresh.test", 1).id,
      `I2 · a JSON redemption: ${rj.status} ${rj.json && rj.json.account}, signed in as the invited seat`]);
    const bad = await W.redeem("f".repeat(48));
    out.push([pg.referrer === "same-origin" && r.referrer === "same-origin" && rj.referrer === "same-origin" && bad.referrer === "same-origin",
      `I2 · referrer-policy same-origin on the invite page (${pg.referrer}) and its redemption's answers: the redirect (${r.referrer}), the JSON (${rj.referrer}), a refusal (${bad.referrer})`]);
    return out;
  },
  async I3() {
    const W = await world(), out = [];
    const a = await W.invite("one-owner-key", "Nia New", "nia@fresh.test");
    const r1 = await W.redeem(a.token);
    const s0 = W.snap();
    const r2 = await W.redeem(a.token, { password: "another-long-passphrase" });
    const r3 = await W.redeem(a.token, { json: true, password: "another-long-passphrase" });
    out.push([r1.status === 302 && r2.status === 401 && r3.status === 401 && r3.json.error === "invalid_invite" && !r2.cookie && W.snap() === s0,
      `I3 · the same link twice: ${r1.status}, then ${r2.status} and ${r3.status} ${r3.json && r3.json.error}; nothing written`]);
    const b = await W.invite("one-owner-key", "Ray Race", "ray@fresh.test");
    const both = await Promise.all([W.redeem(b.token, { json: true, password: "race-passphrase-one" }), W.redeem(b.token, { json: true, password: "race-passphrase-two" })]);
    const won = both.filter((x) => x.status === 200).length, acc = W.account("ray@fresh.test");
    const which = acc ? [await pbkdf2("race-passphrase-one", acc.pass_salt), await pbkdf2("race-passphrase-two", acc.pass_salt)].indexOf(acc.pass_hash) : -1;
    out.push([won === 1 && both.some((x) => x.status === 401) && which === both.findIndex((x) => x.status === 200),
      `I3 · two redemptions at once: ${won} won, the other refused; the account holds the winner's passphrase`]);
    return out;
  },
  async I4() {
    const W = await world(), out = [];
    const tried = async (label, token) => { const s0 = W.snap(); const r = await W.redeem(token); return [r.status === 401 && !r.cookie && W.snap() === s0, `I4 · ${label}: ${r.status}, nothing written`]; };
    const e = await W.invite("one-owner-key", "Eve Expired", "eve@fresh.test");
    W.w.db.prepare("UPDATE seat_invites SET expires_at = ? WHERE email = 'eve@fresh.test'").run(new Date(Date.now() - 1000).toISOString());
    out.push(await tried("an expired link", e.token));
    const g = await W.invite("one-owner-key", "Gus Gone", "gus@fresh.test");
    await W.control("one-owner-key", { action: "remove-person", personId: W.seat("gus@fresh.test", 1).id });
    out.push(await tried("its seat removed", g.token));
    const k = await W.invite("one-owner-key", "Kim Key", "kim@fresh.test");
    await W.control("one-owner-key", { action: "rotate-key", personId: W.seat("kim@fresh.test", 1).id });
    out.push(await tried("its seat Reissued (rotate-key)", k.token));
    const p = await W.invite("one-owner-key", "Pia Pass", "pia@fresh.test");
    await W.control("one-owner-key", { action: "set-password", personId: W.seat("pia@fresh.test", 1).id, password: "an-admin-chosen-pass" });
    out.push(await tried("its seat's set-password", p.token));
    out.push(await tried("no such link", "0".repeat(48)));
    const n = await W.invite("one-owner-key", "Ned New", "ned@fresh.test");
    const n2 = await W.relink("one-owner-key", W.seat("ned@fresh.test", 1).id);
    out.push(await tried("an older link after a newer one", n.token));
    const ok2 = await W.redeem(n2.token);
    out.push([ok2.status === 302, `I4 · the newer link opens (${ok2.status})`]);
    return out;
  },
  async I5() {
    const W = await world(), out = [];
    // a seat that waits: org 2 seats org 1's member (her account holds a seat in org 1): no link at all
    const w2 = await W.invite("two-owner-key", "Mia (in Two)", "mia@one.test");
    const s2 = W.seat("mia@one.test", 2);
    out.push([s2 && s2.pending === 1 && !w2.token && /WAITS for its holder/.test(w2.text) && /No invite link: their account already stands/.test(w2.text) && W.links("mia@one.test").length === 0,
      `I5 · a seat that waits (its account elsewhere) gets no link; the flash says they accept it on /orgs (${w2.token ? "a LINK" : "no link"})`]);
    // a link minted while the account was fresh; then org 2 seats the same email (it waits): the link sets nothing
    const f = await W.invite("one-owner-key", "Fay Fresh", "fay@fresh.test");
    await W.control("two-owner-key", { action: "add-person", name: "Fay (in Two)", email: "fay@fresh.test" });
    let s0 = W.snap();
    const r = await W.redeem(f.token), rj = await W.redeem(f.token, { json: true });
    out.push([W.seat("fay@fresh.test", 2).pending === 1 && r.status === 409 && /already holds a sharingu account/.test(r.text) && /\/orgs/.test(r.text) && !r.cookie
      && rj.status === 409 && rj.json.error === "account_stands" && W.snap() === s0 && W.account("fay@fresh.test").pass_hash === null,
      `I5 · the email seated in another org meanwhile: ${r.status} / ${rj.status} ${rj.json && rj.json.error}, nothing written, the account still has no passphrase`]);
    // a link minted while fresh; then the account gains its own passphrase (the operator's code): the link changes nothing
    const h = await W.invite("one-owner-key", "Hal Holder", "hal@fresh.test");
    const code = await allowEmail(W.DB, "hal@fresh.test");
    const su = await W.call("POST", "/signup", { body: { email: "hal@fresh.test", code: code.code, password: "hals-own-passphrase" } });
    const held = W.account("hal@fresh.test").pass_hash;
    s0 = W.snap();
    const rh = await W.redeem(h.token, { json: true });
    out.push([su.status === 200 && rh.status === 409 && W.snap() === s0 && W.account("hal@fresh.test").pass_hash === held,
      `I5 · the account holds its own passphrase meanwhile: ${rh.status}, the passphrase untouched, nothing written`]);
    const lg = await W.call("POST", "/login", { body: { email: "hal@fresh.test", password: "hals-own-passphrase" } });
    out.push([lg.status === 200 && !!lg.json.token, `I5 · the holder signs in with their own passphrase (${lg.status})`]);
    return out;
  },
  async I6() {
    const W = await world(), out = [];
    const nia = await W.invite("one-owner-key", "Nia New", "nia@fresh.test");
    const sid = W.seat("nia@fresh.test", 1).id;
    let s0 = W.snap();
    const m = await W.control("one-mia-key", { action: "invite-link", personId: sid });
    const p = await W.control("one-pat-key", { action: "invite-link", personId: sid });
    const ma = await W.control("one-mia-key", { action: "add-person", name: "Sneak", email: "sneak@fresh.test", deliver: "link" });
    out.push([m.status === 403 && p.status === 403 && ma.status === 403 && W.snap() === s0, `I6 · a member (${m.status}, ${ma.status}) and a Partner (${p.status}) mint nothing`]);
    s0 = W.snap();
    const x = await W.control("two-owner-key", { action: "invite-link", personId: sid });
    const y = await W.control("two-owner-key", { action: "invite-link", personId: "one-mia" });
    out.push([/Nothing done/.test(x.text) && /Nothing done/.test(y.text) && !/via=invite#/.test(x.text + y.text) && W.snap() === s0,
      "I6 · org 2's admin aimed at org 1's seats mints nothing (\"Nothing done\", no row)"]);
    const own = await W.relink("one-owner-key", sid);
    out.push([!!own.token, "I6 · instrument: org 1's own admin mints for that seat"]);
    // the plan's people limit: an org at it refuses (plan_limit), no seat and no link
    const T = await world();
    const n = T.one("SELECT COUNT(*) AS n FROM people WHERE org = 1 AND (active = 1 OR pending = 1)").n;
    T.w.db.prepare("INSERT INTO plan_limits (plan, people, projects, items_month, calls_day, burst_minute, storage_bytes, updated_at) VALUES ('full', ?, 100, 100000, 100000, 100000, 1073741824, ?)").run(n, new Date().toISOString());
    T.w.db.prepare("UPDATE org SET plan = 'full' WHERE id = 1").run();
    s0 = T.snap();
    const lim = await T.invite("one-owner-key", "Over Limit", "over@fresh.test");
    out.push([/plan_limit/.test(lim.text) && !lim.token && !T.seat("over@fresh.test", 1) && T.snap() === s0, `I6 · an org at its people limit: plan_limit, no seat, no link`]);
    return out;
  },
  async I7() {
    const W = await world(), out = [];
    // org 2's admin invites a fresh email and redeems the link ITSELF (the squatter holds the passphrase)
    const sq = await W.invite("two-owner-key", "Gil (squatted)", "gil@fresh.test");
    const r = await W.redeem(sq.token, { json: true, password: "squatter-chose-this" });
    out.push([r.status === 200 && W.account("gil@fresh.test").invited_org === 2, `I7 · org 2's admin redeemed its own link (${r.status}): the account marked org ${W.account("gil@fresh.test").invited_org}`]);
    // org 1 seats the same email: it waits (the account holds a passphrase)
    await W.control("one-owner-key", { action: "add-person", name: "Gil One", email: "gil@fresh.test" });
    const waiting = W.seat("gil@fresh.test", 1);
    const web = await W.call("POST", "/login", { form: { email: "gil@fresh.test", password: "squatter-chose-this", web: "1" } });
    const pick = await W.call("GET", "/orgs", { cookie: web.cookie, headers: { accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" } });
    out.push([waiting.pending === 1 && web.status === 302 && web.location !== "/orgs" && !(pick.status === 200 && pick.text.includes(waiting.id)),
      `I7 · org 1's later seat waits; the invite-made passphrase lands straight in org 2 (${web.location}), and no picker shows org 1's seat`]);
    const s0 = W.snap();
    const yes = await W.call("POST", "/orgs/seat", { cookie: web.cookie, body: { seat: waiting.id, answer: "accept" } });
    const no = await W.call("POST", "/orgs/seat", { cookie: web.cookie, body: { seat: waiting.id, answer: "decline" } });
    out.push([yes.status === 404 && no.status === 404 && W.seat("gil@fresh.test", 1).pending === 1 && W.snap() === s0,
      `I7 · its Accept (${yes.status}) and Decline (${no.status}) of org 1's seat change nothing`]);
    const in1 = await W.whoAt(1, web.cookie);
    out.push([in1 !== waiting.id, `I7 · its session under org 1's address: ${in1} (not the waiting seat)`]);
    const mk = await W.call("POST", "/orgs", { body: { email: "gil@fresh.test", password: "squatter-chose-this", name: "Squat Co", slug: "squat-co" } });
    out.push([mk.status === 403 && mk.json && mk.json.error === "org_by_invite" && !W.one("SELECT 1 AS x FROM org WHERE slug = 'squat-co'"),
      `I7 · it creates no org: ${mk.status} ${mk.json && mk.json.error} (the waitlist)`]);
    // the holder brings the operator's code: the reset clears the mark (every session ends); then their yes works
    const code = await allowEmail(W.DB, "gil@fresh.test", { reset: true });   // the operator's reset (the account holds a passphrase)
    const su = await W.call("POST", "/signup", { body: { email: "gil@fresh.test", code: code.code, password: "gils-real-passphrase" } });
    const dead = await W.whoAt(2, web.cookie);
    const web2 = await W.call("POST", "/login", { form: { email: "gil@fresh.test", password: "gils-real-passphrase", web: "1" } });
    const ok = await W.call("POST", "/orgs/seat", { cookie: web2.cookie, body: { seat: waiting.id, answer: "accept" } });
    out.push([su.status === 200 && su.json.account === "reset" && W.account("gil@fresh.test").invited_org === null && dead !== W.seat("gil@fresh.test", 2).id && web2.location === "/orgs" && ok.status === 200 && W.seat("gil@fresh.test", 1).active === 1,
      `I7 · the operator's code: ${su.status} ${su.json && (su.json.account || su.json.error)}, the mark cleared, the squatter's session ended (${dead}); the holder lands on the picker and accepts (${ok.status})`]);
    return out;
  },
  async I10() {
    const W = await world(), out = [];
    const a = await W.invite("one-owner-key", "Ray Race", "ray@fresh.test");
    const r = await W.redeem(a.token, { json: true });
    const one = W.seat("ray@fresh.test", 1);
    // the race's outcome: org 2's add-person read the account's consent (no passphrase yet: no wait) before the link set it, and
    // inserted its ACTIVE seat after (migrate-070's trigger attaches it to the account), with its own secret
    const salt = "00112233445566778899aabbccddeeff";
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, pass_hash, pass_salt, active, pending, created_at, org) VALUES ('two-ray', 'Ray Two', 'ray@fresh.test', 'member', ?, ?, ?, 1, 0, ?, 2)")
      .run(await sha256("two-ray-key"), await pbkdf2("two-ray-key", salt), salt, new Date().toISOString());
    const acc = W.account("ray@fresh.test"), two = W.seat("ray@fresh.test", 2);
    out.push([r.status === 200 && acc.invited_org === 1 && two && two.active === 1 && W.one("SELECT account_id FROM people WHERE id = 'two-ray'").account_id === acc.id,
      `I10 · instrument: the invite-made account (marked org ${acc.invited_org}) holds an ACTIVE org-2 seat too (the race's outcome)`]);
    const lg = await W.call("POST", "/login", { body: { email: "ray@fresh.test", password: PASS } });
    const lgWho = lg.json && lg.json.token ? await W.call("GET", "/whoami", { key: lg.json.token }) : {};
    out.push([lg.status === 200 && !!lg.json.token && lgWho.json && lgWho.json.id === one.id, `I10 · its JSON sign-in signs in org 1's seat alone, no choose_org (${lg.status} ${lg.json && (lg.json.error || "token")}, as ${lgWho.json && lgWho.json.id})`]);
    const web = await W.call("POST", "/login", { form: { email: "ray@fresh.test", password: PASS, web: "1" } });
    out.push([web.status === 302 && web.location === `/${W.slug(1)}` && !!web.cookie, `I10 · a browser lands in org 1, not on the picker (${web.status} -> ${web.location})`]);
    const at2 = await W.call("GET", `/${W.slug(2)}/whoami`, { cookie: web.cookie });
    out.push([at2.status !== 200 && !(at2.json && at2.json.id === "two-ray") && (await W.whoAt(1, web.cookie)) === one.id, `I10 · its session at org 2's address reads nothing (${at2.status}); at org 1's it is the invited seat`]);
    const pick = await W.call("GET", "/orgs", { cookie: web.cookie, headers: { accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" } });
    out.push([!(pick.status === 200 && pick.text.includes(`/${W.slug(2)}`)) && !String(pick.location || "").startsWith(`/${W.slug(2)}`), `I10 · the picker lists org 1 alone (${pick.status}${pick.location ? ` -> ${pick.location}` : ""})`]);
    const A = await import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), "accounts.js")).href);
    const g = await A.accountGrantSeat({ DB: W.DB }, acc.id, { want: W.slug(2), org: 2 });
    out.push([g && g.id === one.id && Number(g.org) === 1, `I10 · an account grant naming org 2 acts as the org-1 seat (${g && g.id}), never org 2's`]);
    // a deleted org's mark (tools/org-undo.mjs sets it to 0): no seat at all
    W.w.db.prepare("UPDATE accounts SET invited_org = 0 WHERE id = ?").run(acc.id);
    const z = await W.call("POST", "/login", { body: { email: "ray@fresh.test", password: PASS } });
    const zs = await A.seatsOf({ DB: W.DB }, acc.id);
    out.push([!(z.json && z.json.token) && zs.length === 0, `I10 · a deleted org's mark (0) reaches no seat: the sign-in ${z.status} ${z.json && z.json.error}, ${zs.length} seats listed`]);
    // the operator's code clears the mark: both seats answer (the guard is the mark, never a broken seat)
    const code = await allowEmail(W.DB, "ray@fresh.test", { reset: true });
    const su = await W.call("POST", "/signup", { body: { email: "ray@fresh.test", code: code.code, password: "rays-real-passphrase" } });
    const both = await W.call("POST", "/login", { body: { email: "ray@fresh.test", password: "rays-real-passphrase" } });
    out.push([su.status === 200 && W.account("ray@fresh.test").invited_org === null && both.status === 409 && both.json.error === "choose_org",
      `I10 · instrument: after the operator's code (mark ${W.account("ray@fresh.test").invited_org}) the sign-in asks which org (${both.status} ${both.json && both.json.error})`]);
    return out;
  },
  async I11() {
    const W = await world(), out = [];
    const keyOf = (r) => (/API key\): ([0-9a-f]{40})/.exec(r.text || "") || [])[1];
    const refused = async (label, personId, why = /is already in use/) => {
      const n0 = W.q("SELECT COUNT(*) AS n FROM seat_invites")[0].n;
      const r = await W.relink("one-owner-key", personId);
      const n1 = W.q("SELECT COUNT(*) AS n FROM seat_invites")[0].n;
      return [!r.token && /Nothing done/.test(r.text) && why.test(r.text) && /Reset passphrase \(rotate-key\) or set-password/.test(r.text) && n1 === n0, `I11 · ${label}: no link ("Nothing done", why, the reset named), ${n1 - n0} rows`];
    };
    // signed in with its key (a session minted on the seat)
    const k = await W.control("one-owner-key", { action: "add-person", name: "Kai Key", email: "kai@fresh.test" });
    const lg = await W.call("POST", "/login", { body: { email: "kai@fresh.test", password: keyOf(k) } });
    out.push([lg.status === 200, `I11 · instrument: Kai signs in with the key Invite showed (${lg.status})`]);
    out.push(await refused("a seat that signed in", W.seat("kai@fresh.test", 1).id));
    // a seat that filed (its key used as a bearer)
    await W.control("one-owner-key", { action: "add-person", name: "Fil Filer", email: "fil@fresh.test" });
    const fil = W.seat("fil@fresh.test", 1).id;
    W.w.db.prepare("INSERT INTO transmission (id, submitter, lane, kind, what, route, status, eval, via, project, created_at, org) VALUES ('T-20261010-901', ?, 'code', 'pr', 'a filing', 'auto', 'routed', 0, 'mcp', 'alpha', ?, 1)").run(fil, new Date().toISOString());
    out.push(await refused("a seat that filed", fil));
    // a seat whose account holds its own passphrase (its invite redeemed)
    const n = await W.invite("one-owner-key", "Nia New", "nia@fresh.test");
    await W.redeem(n.token);
    out.push(await refused("a seat whose account holds its own passphrase", W.seat("nia@fresh.test", 1).id, /account holds its own passphrase/));
    // the instrument: a fresh seat (Invite gave a key, never used) gets its link
    await W.control("one-owner-key", { action: "add-person", name: "Fay Fresh", email: "fay@fresh.test" });
    const f = await W.relink("one-owner-key", W.seat("fay@fresh.test", 1).id);
    out.push([!!f.token, `I11 · instrument: a seat never used gets its link (${f.token ? "made" : "NONE"})`]);
    return out;
  },
};

// ---- the mutants: each must turn its case(s) red (edits: [file, from, to] each found exactly once) ----
const MUTANTS = [
  { name: "the spend without its open check (a link used twice)", edits: [["src/accounts.js", "WHERE i.token_hash = ?1 AND i.used_at IS NULL AND", "WHERE i.token_hash = ?1 AND"],
    ["src/accounts.js", "WHERE id = ?3 AND token_hash = ?4 AND used_at IS NULL AND", "WHERE id = ?3 AND token_hash = ?4 AND"]], red: ["I3"] },
  { name: "the link's clock never moves (no expiry)", edits: [["src/accounts.js", "const hash = await inviteTokenHash(token), at = now();", "const hash = await inviteTokenHash(token), at = \"0000\";"]], red: ["I4"] },
  { name: "the link not bound to the seat's secrets (a Reissue keeps it)", edits: [["src/accounts.js", "\n    || !sameDigest(await seatStamp(row), row.seat_stamp))", ")"]], red: ["I4"] },
  { name: "the link outlives its seat (removed or pending)", edits: [["src/accounts.js", "if (!row || Number(row.active) !== 1 || Number(row.pending) !== 0 ||", "if (!row ||"],
    ["src/accounts.js", "AND p.org = seat_invites.org AND p.active = 1 AND p.pending = 0 ", "AND p.org = seat_invites.org "]], red: ["I4"] },
  { name: "the link sets the passphrase of an account that has one", edits: [["src/accounts.js", "if (row.account_hash != null || Number(row.elsewhere) === 1)", "if (Number(row.elsewhere) === 1)"],
    ["src/accounts.js", "AND a.pass_hash IS NULL \" +\n  \"AND NOT \" + INVITE_OTHER_SEAT", "\" +\n  \"AND NOT \" + INVITE_OTHER_SEAT"], ["src/accounts.js", "WHERE id = ?5 AND pass_hash IS NULL \" +", "WHERE id = ?5 \" +"]], red: ["I5"] },
  { name: "the link sets the passphrase of an account seated in another org", edits: [["src/accounts.js", "if (row.account_hash != null || Number(row.elsewhere) === 1)", "if (row.account_hash != null)"],
    ["src/accounts.js", "  \"AND NOT \" + INVITE_OTHER_SEAT + \")\";", "  \")\";"]], red: ["I5"] },
  { name: "the invite-made account carries no mark", edits: [["src/accounts.js", "INVITE_ACCOUNT_SQL).bind(ph, salt, Number(row.org),", "INVITE_ACCOUNT_SQL.replace(\"invited_org = ?3\", \"invited_org = NULL\")).bind(ph, salt, Number(row.org),"]], red: ["I2", "I7"] },
  { name: "an invite-made account creates an org (the waitlist bypassed)", edits: [["src/orgs.js", "  if (proof.verdict === \"invited\") return { error: \"org_by_invite\", status: 403 };\n", ""],
    ["src/orgs.js", "if (proof.verdict !== \"ok\" || !proof.account) return", "if ((proof.verdict !== \"ok\" && proof.verdict !== \"invited\") || !proof.account) return"]], red: ["I7"] },
  { name: "an invite-made account answers another org's waiting seat", edits: [["src/accounts.js", "const INVITED_ELSEWHERE = \" AND NOT EXISTS", "const INVITED_ELSEWHERE = \"\" && \" AND NOT EXISTS"]], red: ["I7"] },
  { name: "an invite-made account sees another org's waiting seat", edits: [["src/accounts.js", "WHERE p.account_id = ?1 AND p.pending = 1 AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = p.account_id AND a.invited_org IS NOT NULL AND a.invited_org <> p.org) \" +", "WHERE p.account_id = ?1 AND p.pending = 1 \" +"]], red: ["I7"] },
  { name: "the operator's code leaves the invite mark", edits: [["src/accounts.js", "updated_at = excluded.updated_at, invited_org = NULL\";", "updated_at = excluded.updated_at\";"]], red: ["I7"] },
  { name: "the mint aimed at any org's seat", edits: [["src/admin.js", "FROM people WHERE id = ? AND org = {org} AND active = 1", "FROM people WHERE id = ? AND active = 1"],
    ["src/accounts.js", "LEFT JOIN accounts a ON a.id = p.account_id WHERE p.id = ?1 AND p.org = {org}\";", "LEFT JOIN accounts a ON a.id = p.account_id WHERE p.id = ?1\";"],
    ["src/admin.js", "FROM people p WHERE p.id = ?7 AND p.org = {org} AND", "FROM people p WHERE p.id = ?7 AND"]], red: ["I6"] },
  { name: "a newer link leaves the older one open", edits: [["src/admin.js", "    db(env).prepare(INVITE_REVOKE_SQL).bind(at, seat.id),\n", ""]], red: ["I1", "I4"] },
  { name: "a waiting seat gets a link", edits: [["src/admin.js", "const minted = byLink && !wait ? await mintInvite(env, newId, reader && reader.id) : null;", "const minted = byLink ? await mintInvite(env, newId, reader && reader.id) : null;"],
    ["src/admin.js", "FROM people WHERE id = ? AND org = {org} AND active = 1 AND pending = 0 AND", "FROM people WHERE id = ? AND org = {org} AND"],
    ["src/admin.js", "AND p.org = {org} AND p.active = 1 AND p.pending = 0 AND p.key_hash", "AND p.org = {org} AND p.key_hash"]], red: ["I5"] },
  { name: "the sign-in's seats ignore the invite mark", edits: [["src/accounts.js", "WHERE p.account_id = ?1 AND p.active = 1 AND \" + INVITE_MARK_HOLDS(\"p\") + \" ORDER BY (p.org = ?2)", "WHERE p.account_id = ?1 AND p.active = 1 ORDER BY (p.org = ?2)"]], red: ["I10"] },
  { name: "the session reads a marked account's seat in another org", edits: [["src/accounts.js", "  \"AND (t.account_id IS NULL OR \" + INVITE_MARK_HOLDS(\"p\") + \")\";", "  \"\";"]], red: ["I10"] },
  { name: "the account's orgs ignore the invite mark", edits: [["src/accounts.js", "WHERE p.account_id = ?1 AND p.active = 1 AND \" + INVITE_MARK_HOLDS(\"p\") + \" ORDER BY p.org ASC LIMIT 50", "WHERE p.account_id = ?1 AND p.active = 1 ORDER BY p.org ASC LIMIT 50"]], red: ["I10"] },
  { name: "an account grant reaches a marked account's seat in another org", edits: [["src/accounts.js", "WHERE a.id = ?1 AND (a.invited_org IS NULL OR a.invited_org = p.org) \"", "WHERE a.id = ?1 \""]], red: ["I10"] },
  { name: "a link for a working seat", edits: [["src/admin.js", "  if (Number(use.used) === 1) return { refused: \"in_use\", name: seat.name };\n", ""],
    ["src/admin.js", "AND p.pass_hash IS ?9 AND \" + SEAT_NEVER_USED(\"p\");", "AND p.pass_hash IS ?9\";"]], red: ["I11"] },
  { name: "a link for a seat whose account holds its passphrase", edits: [["src/admin.js", "  if (use && Number(use.holds) === 1) return { refused: \"account_stands\", name: seat.name };\n", ""]], red: ["I11"] },
  { name: "the invite page sends a Referer", edits: [["src/invite.js", "export const INVITE_HEADERS = { \"cache-control\": \"no-store\", \"referrer-policy\": \"same-origin\" };   // the token rides the fragment (never in a Referer); same-origin keeps Origin for the form's same-origin check on browsers without Sec-Fetch-Site", "export const INVITE_HEADERS = { \"cache-control\": \"no-store\" };"]], red: ["I2"] },
  { name: "the invite door before the flood filter", edits: [["src/index.js", "      // sprint 12, 12.3: an org's invite link (after the same-origin guard and the flood filter; src/invite.js)\n      if (isInviteBody(body)) return inviteSignup({ request, env, url, body, isWeb });\n", ""],
    ["src/index.js", "      // the address's flood filter, the budget POST /login spends too (addressFlooded)\n      if (await addressFlooded(request, env)) return isWeb\n        ? page(429",
      "      if (isInviteBody(body)) return inviteSignup({ request, env, url, body, isWeb });\n      // the address's flood filter, the budget POST /login spends too (addressFlooded)\n      if (await addressFlooded(request, env)) return isWeb\n        ? page(429"]], red: ["I9"] },
  { name: "a short passphrase taken", edits: [["src/signup.js", "  if (passphraseProblem(password, { account: true }) || String(password).length > 1024) return \"passphrase\";\n  if (confirm != null && String(confirm) !== String(password)) return \"confirm\";\n  return \"\";\n}\n// the page's one script",
    "  if (confirm != null && String(confirm) !== String(password)) return \"confirm\";\n  return \"\";\n}\n// the page's one script"]], red: ["I9"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

// I9 · the door's guards (a case: the mutants read it)
CASES.I9 = async () => {
  const W = await world(), out = [];
  const a = await W.invite("one-owner-key", "Gia Guard", "gia@fresh.test");
  const s0 = W.snap();
  const f1 = await W.redeem("not-a-token"), f2 = await W.redeem(a.token, { password: "short" }), f3 = await W.redeem(a.token, { confirm: "not-the-same-passphrase" });
  const j1 = await W.redeem("", { json: true }), j2 = await W.redeem(a.token, { json: true, password: "short" });
  out.push([f1.status === 422 && f2.status === 422 && f3.status === 422 && j1.status === 422 && j1.json.field === "invite" && j2.json && j2.json.field === "passphrase" && W.snap() === s0,
    `I9 · the fields before any read: ${[f1, f2, f3, j1, j2].map((x) => x.status).join(", ")} (bad_invite ${j1.json && j1.json.field}, ${j2.json && j2.json.field}), nothing written`]);
  out.push([f2.text.includes(`value="${a.token}"`) && !f1.text.includes("not-a-token"), "I9 · a wrong passphrase keeps the token in the invitee's own form; a malformed one is not echoed"]);
  const x = await W.redeem(a.token, { headers: { "sec-fetch-site": "cross-site" } });
  out.push([x.status === 403 && W.snap() === s0, `I9 · a cross-site form: ${x.status}, nothing written`]);
  const keys = [];
  W.w.env.LOGIN_LIMIT = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
  const fl = await W.redeem(a.token, { json: true, headers: { "cf-connecting-ip": "203.0.113.9" } });
  delete W.w.env.LOGIN_LIMIT;
  out.push([fl.status === 429 && fl.json.error === "too_many_attempts_ip" && keys.join() === "login:203.0.113.9" && W.snap() === s0, `I9 · the address's flood filter (LOGIN_LIMIT, login:<ip>): ${fl.status}, nothing read or written`]);
  const okr = await W.redeem(a.token);
  out.push([okr.status === 302, `I9 · instrument: the same link then opens (${okr.status})`]);
  return out;
};

// --src <dir>: the cases alone against another copy of src/ (the red-before proof: HEAD's tree, which has no invite link)
const SRC_AT = process.argv.indexOf("--src");
if (SRC_AT > 0) {
  MUT = { src: process.argv[SRC_AT + 1] };
  for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
  console.log(`${failed ? "✗" : "✓"} invite selftest (--src ${MUT.src}, the cases alone): ${checks - failed} of ${checks} checks passed`);
  process.exit(failed ? 1 : 0);
}
// the clean tree: every case green
for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
{
  // I8: every token minted in the clean run is in no row, no Location and no log line; in an answer only where it belongs (the
  // admin's flash, and the invitee's own form after a wrong field)
  const tokens = new Set();
  for (const [, , body] of SEEN) for (const m of body.matchAll(/signup\?via=invite#([0-9a-f]{48})\b/g)) tokens.add(m[1]);
  const W = await world();
  const a = await W.invite("one-owner-key", "Ida Eight", "ida@fresh.test");
  const r = await W.redeem(a.token);
  tokens.add(a.token);
  const tables = W.q("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'k_find%'").map((t) => t.name);
  let rows = 0;
  for (const t of tables) for (const row of W.q(`SELECT * FROM "${t}"`)) { const s = JSON.stringify(row); for (const k of tokens) if (s.includes(k)) rows++; }
  const inLoc = SEEN.filter(([, loc]) => [...tokens].some((k) => loc.includes(k))).length;
  const inLog = LOGGED.filter((l) => [...tokens].some((k) => l.includes(k))).length;
  const stray = SEEN.filter(([, , body]) => [...tokens].some((k) => body.includes(k)) && !/Invite link, shown once/.test(body) && !/data-screen="signup-invite"/.test(body)).length;
  ok(r.status === 302 && tokens.size >= 5 && rows === 0 && inLoc === 0 && inLog === 0 && stray === 0,
    `I8 · ${tokens.size} tokens: in no row (${tables.length} tables, ${rows} hits), no Location (${inLoc}), no log line (${inLog}), no other answer (${stray})`);
}

for (const m of MUTANTS) {
  let dir = null;
  try {
    dir = mkdtempSync(join(ENGINE, ".invite-mutation-"));
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    let found = true;
    for (const [file, from, to] of m.edits) {
      const p = join(dir, file), s = readFileSync(p, "utf8");
      if (s.split(from).length !== 2) { found = false; ok(false, `mutant "${m.name}": a needle is not found exactly once in ${file} (update this selftest with the code): ${from.slice(0, 80)}`); break; }
      writeFileSync(p, s.replace(from, to));
    }
    if (!found) continue;
    MUT = { src: join(dir, "src") };
    const reds = [];
    // red by an assertion of the case, never by a crash (a mutant that only breaks the world proves nothing)
    for (const name of m.red) { const res = await runCase(name); reds.push(res.some(([c, l]) => !c && !/ threw: /.test(l)) && !res.some(([, l]) => / threw: /.test(l))); }
    ok(reds.every(Boolean), `mutant "${m.name}" turns ${m.red.join(" and ")} red (${reds.map((r, i) => `${m.red[i]} ${r ? "red" : "GREEN"}`).join(", ")})`);
  } finally { MUT = {}; if (dir) rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${failed ? "✗" : "✓"} invite selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
