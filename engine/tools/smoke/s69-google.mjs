// tools/smoke/s69-google.mjs — sprint 21, slice 21.4c (GOOGLE SIGN-IN: src/google.js, src/googlepage.js, src/accounts.js GOOGLE SIGN-IN,
// src/oauth.js connectByGoogle, tools/operator.mjs set-google-client) on the real local worker, with tools/fake-google.mjs as Google on
// the loopback port the worker's config names (GOOGLE_LOCAL_IDP, tools/lib-r-local.sh; tools/smoke.sh sets its port): nothing leaves
// this machine. The fake starts inside the first case and stops in the last. The operator's client is a FAKE one, written to a mode-600
// file in a scratch directory. Self-contained (its own emails, s69<tag>…@smoke.local); LAST, because it links the smoke owner's account
// to a Google subject.
//   · no client stored: no Continue with Google on /login, /request-access, the paused page or the connect page; the start a 404
//   · `operator set-google-client --file` (local): the button on all four
//   · join by Google: the callback 303 to the form Google filled in (the email locked), its POST filed already verified (in line,
//     the account linked), no verification email captured, the team's alert captured; 303 /account signed in
//   · sign-in by Google: that pending account to its status page; the seated owner to its org
//   · the same callback replayed (its state cookie kept) refused; a token for another aud refused; another Google account for the
//     owner's linked email refused
//   · THE STEP-UP (the owner's ruling, 2026-10-14): an approved Google-only account, its Google sign-in fresh, creates its org with no
//     passphrase; its session proven over 10 minutes ago (moved by SQL): refused, Continue with Google offered; a passphrase account
//     unchanged (an empty passphrase 422, its passphrase creates the org)
//   · the connect page by Google: the authorization completes, the client's code redeemed, whoami as the owner
//   · `clear-google-client`: no button again
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { smoke, expect, d1rows as rows, operator as op, mails, mailFor, linkIn, orgSlug, patientFetch, BASE } from "./lib.mjs";
import { readConfig } from "../org-undo.mjs";
import { startFakeGoogle } from "../fake-google.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const CLIENT = { client_id: `424242424242-s69${TAG}.apps.googleusercontent.com`, client_secret: `GOCSPX-s69-fake-${TAG}` };
const S = {};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// browser() -> a cookie jar and its call: Set-Cookie applied (Max-Age=0 removes), a form posted same-origin, a page navigation
const browser = () => {
  const jar = new Map();
  const call = async (method, path, { form, nav = false, headers: extra = {} } = {}) => {
    const once = async () => {
      const headers = { accept: "text/html", ...extra };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      if (nav) { headers["sec-fetch-dest"] = "document"; headers["sec-fetch-mode"] = "navigate"; }
      let body;
      if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; headers["sec-fetch-site"] = headers["sec-fetch-site"] || "same-origin"; body = new URLSearchParams(form).toString(); }
      const r = await patientFetch(BASE + path, { method, headers, body, redirect: "manual" });
      return { r, text: await r.text() };
    };
    let { r, text } = await once();
    // the address's flood filter (LOGIN_LIMIT, shared with /login): a refusal proves nothing about the door, so the call waits it out once
    if (r.status === 429) { await sleep(61000); ({ r, text } = await once()); }
    const cookies = r.headers.getSetCookie();
    for (const c of cookies) { const m = /^([^=]+)=([^;]*)/.exec(c); if (m) { if (/Max-Age=0\b/.test(c) || !m[2]) jar.delete(m[1]); else jar.set(m[1], m[2]); } }
    return { status: r.status, text, location: r.headers.get("location") || "", cookies };
  };
  return { jar, call };
};
// google(b, intent, identity, { query, form }) -> { start, back, cb }: the start, the fake's redirect back, the callback in the same browser
async function google(b, intent, identity, { query = {}, form = null } = {}) {
  S.fake.next(identity);
  const start = form ? await b.call("POST", "/auth/google/start", { form: { intent, ...form } }) : await b.call("GET", `/auth/google/start?${new URLSearchParams({ intent, ...query })}`, { nav: true });
  if (!start.location.startsWith(S.fake.origin + "/authorize?")) return { start, back: "", cb: null };
  const back = (await fetch(start.location, { redirect: "manual" })).headers.get("location") || "";
  const cb = back.startsWith(BASE + "/auth/google/callback") ? await b.call("GET", back.slice(BASE.length), { nav: true }) : null;
  return { start, back, cb };
}
// an OAuth client of the connect page (registered once, in the first case) and its authorize page's address
const VERIFIER = "v".repeat(50);
const authorizeOf = (clientId, state) => `/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "https://s69-client.example.org/cb",
  code_challenge: createHash("sha256").update(VERIFIER).digest("base64url"), code_challenge_method: "S256", state, scope: "mcp:read mcp:write" })}`;
// the four pages that may carry the button (the paused page with the email window full for a moment, as s67 does)
async function fourPages() {
  const b = browser();
  const day = new Date().toISOString().slice(0, 10), start = new Date(Date.parse(`${day}T00:00:00.000Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const before = rows("SELECT day, alerted FROM mail_days");
  rows(`INSERT INTO mail_days (day, n) VALUES (${q(start)}, 2900) ON CONFLICT (day) DO UPDATE SET n = n + 2900`);
  let sent;
  try { sent = await b.call("GET", "/account/sent", { nav: true }); }
  finally {
    rows(`UPDATE mail_days SET n = n - 2900 WHERE day = ${q(start)}`);
    rows(`DELETE FROM mail_days WHERE n = 0 AND alerted = 0`);
    if (!before.some((r) => r.day === day && Number(r.alerted) === 1)) rows(`UPDATE mail_days SET alerted = 0 WHERE day = ${q(day)}`);
  }
  const pages = { login: await b.call("GET", "/login", { nav: true }), join: await b.call("GET", "/request-access", { nav: true }), paused: sent, connect: await b.call("GET", authorizeOf(S.client.client_id, "s69"), { nav: true }) };
  return { pages, has: Object.fromEntries(Object.entries(pages).map(([k, r]) => [k, /data-region="google"/.test(r.text)])) };
}
// until(fn, ok) -> fn's last answer, asked again every half second until ok(it) or 15 s pass (the worker's KV read of the operator's write)
async function until(fn, ok, ms = 15000) {
  const t0 = Date.now();
  let a = await fn();
  while (!ok(a) && Date.now() - t0 < ms) { await sleep(500); a = await fn(); }
  return a;
}

smoke("google · no client stored: no Continue with Google on /login, /request-access, the paused page or the connect page, and the start one plain 404; the operator's set-google-client (a mode-600 file) puts it on all four", async () => {
  const { SMOKE_D1_CFG: cfg } = process.env;
  const addr = String(((readConfig(cfg).vars) || {}).GOOGLE_LOCAL_IDP || "");
  expect(/^127\.0\.0\.1:\d+$/.test(addr), () => `the worker's config names no local IdP (GOOGLE_LOCAL_IDP ${JSON.stringify(addr)}: tools/lib-r-local.sh writes it)`);
  S.fake = await startFakeGoogle({ port: Number(addr.split(":")[1]), clientId: CLIENT.client_id, clientSecret: CLIENT.client_secret });
  S.client = await (await patientFetch(BASE + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://s69-client.example.org/cb"], client_name: `S69 App ${TAG}`, token_endpoint_auth_method: "none" }) })).json();
  expect(S.client && S.client.client_id, () => `the connect page's client did not register: ${JSON.stringify(S.client).slice(0, 160)}`);
  const off = await fourPages();
  const start = await browser().call("GET", "/auth/google/start?intent=signin", { nav: true });
  expect(Object.values(off.has).every((x) => !x) && start.status === 404 && /data-why="off"/.test(start.text) && S.fake.authorized.length === 0,
    () => `none stored: buttons ${JSON.stringify(off.has)}; the start ${start.status}`);
  S.dir = mkdtempSync(join(tmpdir(), "s69-"));
  const file = join(S.dir, "google-oauth.env");
  writeFileSync(file, `GOOGLE_CLIENT_ID=${CLIENT.client_id}\nGOOGLE_CLIENT_SECRET=${CLIENT.client_secret}\n`); chmodSync(file, 0o600);
  const set = await op("set-google-client", "--file", file);
  expect(set.rc === 0 && /stored/.test(set.out) && !set.out.includes(CLIENT.client_secret), () => `set-google-client: rc ${set.rc} ${set.out.slice(0, 200)}`);
  const on = await until(fourPages, (a) => Object.values(a.has).every(Boolean));
  expect(Object.values(on.has).every(Boolean), () => `stored: buttons ${JSON.stringify(on.has)}`);
  return `none stored: no button on the four pages, the start 404; set-google-client: "stored", the secret never printed; then the button on /login, /request-access, the paused page and the connect page`;
});

smoke("google · join by Google: the form Google filled in (the email locked), filed already verified (in line, the account linked), no verification email, the team's alert; then sign-in by Google: that pending account to /account, the seated owner to its org", async () => {
  expect(S.fake, "the first google case did not run");
  S.email = `s69j${TAG}@smoke.local`;
  const b = browser();
  const g = await google(b, "join", { sub: `s69-sub-${TAG}`, email: S.email, email_verified: true, name: "S69 Joiner" }, { query: { from: "site" } });
  const form = await b.call("GET", "/request-access", { nav: true });
  expect(g.cb && g.cb.status === 303 && g.cb.location === "/request-access" && /data-google-join/.test(form.text) && form.text.includes(`value="${S.email}" readonly`) && !/name="email"/.test(form.text),
    () => `the callback ${g.cb && g.cb.status} ${g.cb && g.cb.location}; the form Google filled in ${/data-google-join/.test(form.text)}`);
  const post = await b.call("POST", "/request-access", { form: { web: "1", google: "1", name: "S69 Joiner", company: `S69 Works ${TAG}`, role: "CTO", team_size: "2-10", consent_terms: "1", consent_keep: "1", from: "site" } });
  const req = rows(`SELECT status, verified_at, account_id, source FROM access_requests WHERE email = ${q(S.email)}`);
  const acct = rows(`SELECT id, google_sub, pass_hash FROM accounts WHERE email = ${q(S.email)}`)[0];
  await sleep(1500);
  const toThem = (await mails({ to: S.email })).filter((m) => /Verify your email/.test(m.subject));
  const team = (await mails({ to: "ryuk@ryuklabs.io" })).filter((m) => m.subject === `New beta request: S69 Works ${TAG}`);
  expect(post.status === 303 && post.location === "/account" && /^t_a_/.test(b.jar.get("__Host-ar_session") || "") && req.length === 1 && req[0].status === "open" && req[0].verified_at
    && acct && req[0].account_id === acct.id && acct.google_sub === `s69-sub-${TAG}` && acct.pass_hash == null && req[0].source === "site" && toThem.length === 0 && team.length === 1 && !/S69 Joiner|s69j/i.test(team[0].text),
    () => `the POST ${post.status} ${post.location}; the request ${JSON.stringify(req)}; the account ${JSON.stringify(acct && { g: acct.google_sub, pass: !!acct.pass_hash })}; ${toThem.length} verification emails; ${team.length} team alerts`);
  const b2 = browser(), again = await google(b2, "signin", { sub: `s69-sub-${TAG}`, email: S.email, email_verified: true });
  const status = await b2.call("GET", "/account", { nav: true });
  expect(again.cb && again.cb.status === 302 && again.cb.location === "/account" && status.status === 200 && /data-screen="account-in-line"/.test(status.text),
    () => `the pending account's sign-in ${again.cb && again.cb.status} ${again.cb && again.cb.location}; /account ${status.status}`);
  S.owner = String(rows("SELECT email FROM people WHERE org = 1 AND role = 'owner' AND active = 1 ORDER BY created_at LIMIT 1")[0].email).toLowerCase();
  const slug = orgSlug(1), b3 = browser(), seated = await google(b3, "signin", { sub: `s69-owner-${TAG}`, email: S.owner, email_verified: true, name: "Owner" });
  const home = await b3.call("GET", `/${slug}/home`, { nav: true });
  // its landing is the org, or the picker when the owner's account holds seats in several orgs (an earlier case may seat it): either way
  // the account's session reads as its seat at the org's address
  expect(seated.cb && seated.cb.status === 302 && [`/${slug}`, "/orgs"].includes(seated.cb.location) && home.status === 200 && !/data-screen="login"/.test(home.text),
    () => `the owner's sign-in ${seated.cb && seated.cb.status} ${seated.cb && seated.cb.location}; /${slug}/home ${home.status}`);
  S.back = seated.back; S.state = (seated.start.cookies.find((c) => c.startsWith("__Host-g_state=")) || "").split(";")[0].split("=")[1];
  return `the form Google filled in -> filed open, in line, the account linked (no passphrase), no verification email, one team alert; the pending account -> /account; the owner -> /${slug}`;
});

smoke("google · refused: the same callback replayed (its state cookie kept), a token for another aud, another Google account for the owner's linked email — one plain page each, nothing signed in", async () => {
  expect(S.back && S.state, "the sign-in case did not run");
  const replay = browser(); replay.jar.set("__Host-g_state", S.state);
  const r1 = await replay.call("GET", S.back.slice(BASE.length), { nav: true });
  const b2 = browser(), aud = await google(b2, "signin", { sub: `s69-owner-${TAG}`, email: S.owner, email_verified: true, aud: "999-someone-else.apps.googleusercontent.com" });
  const b3 = browser(), other = await google(b3, "signin", { sub: `s69-intruder-${TAG}`, email: S.owner, email_verified: true });
  const none = (b, r) => r && !b.jar.has("__Host-ar_session") && /data-screen="google-refused"/.test(r.text);
  expect(r1.status === 400 && none(replay, r1) && aud.cb && aud.cb.status === 401 && none(b2, aud.cb) && other.cb && other.cb.status === 403 && none(b3, other.cb) && /data-why="other_sub"/.test(other.cb.text)
    && rows(`SELECT google_sub FROM accounts WHERE email = ${q(S.owner)}`)[0].google_sub === `s69-owner-${TAG}`,
    () => `the replay ${r1.status}; another aud ${aud.cb && aud.cb.status}; another Google account ${other.cb && other.cb.status}`);
  return `the replay 400, another aud 401, another Google account 403 (other_sub): one plain page each, no session, the owner's link unchanged`;
});

smoke("google · THE STEP-UP: an approved Google-only account with a fresh Google sign-in creates its org with no passphrase; over 10 minutes old (moved by SQL) the POST is refused with Continue with Google; a passphrase account still types its passphrase", async () => {
  expect(S.email, "the join case did not run");
  const approve = (email) => rows(`UPDATE access_requests SET status = 'approved', approved_at = ${q(new Date().toISOString())} WHERE email = ${q(email)} AND status = 'open'`);
  const form = (slug, extra = {}) => ({ web: "1", name: `S69 ${slug}`, slug, product: "S69 Product", line: "A line about it", stage: "building", ...extra });
  const founded = (email) => rows(`SELECT o.slug FROM org o JOIN accounts a ON a.id = o.created_by_account WHERE a.email = ${q(email)}`)[0] || null;
  // fresh: the joiner (Google only, no passphrase), approved, signs in by Google and creates its org with no passphrase
  approve(S.email);
  const b = browser();
  await google(b, "signin", { sub: `s69-sub-${TAG}`, email: S.email, email_verified: true });
  const fresh = await b.call("GET", "/orgs/new", { nav: true });
  const made = await b.call("POST", "/orgs", { form: form(`s69f${TAG}`, { email: S.email }) });
  expect(/data-region="google-step-up"/.test(fresh.text) && !/name="password"/.test(fresh.text) && made.status === 200 && /data-screen="org-made"/.test(made.text) && (founded(S.email) || {}).slug === `s69f${TAG}`,
    () => `fresh: the form ${fresh.status} (step-up ${/google-step-up/.test(fresh.text)}); the POST ${made.status}; founded ${JSON.stringify(founded(S.email))}`);
  // stale: a second Google-only joiner, approved, its session proven 11 minutes ago
  const e2 = `s69s${TAG}@smoke.local`, b2 = browser();
  await google(b2, "join", { sub: `s69-sub2-${TAG}`, email: e2, email_verified: true, name: "S69 Stale" });
  await b2.call("POST", "/request-access", { form: { web: "1", google: "1", name: "S69 Stale", company: `S69 Stale ${TAG}`, role: "CTO", team_size: "2-10", consent_terms: "1", consent_keep: "1" } });
  approve(e2);
  rows(`UPDATE account_sessions SET proven_at = ${q(new Date(Date.now() - 11 * 60000).toISOString())} WHERE account_id = (SELECT id FROM accounts WHERE email = ${q(e2)})`);
  const staleForm = await b2.call("GET", "/orgs/new", { nav: true });
  const stale = await b2.call("POST", "/orgs", { form: form(`s69s${TAG}`, { email: e2 }) });
  expect(/name="password"/.test(staleForm.text) && /data-region="google-step-up"/.test(staleForm.text) && stale.status === 401 && /more than 10 minutes old/.test(stale.text)
    && /data-region="google-step-up"/.test(stale.text) && !founded(e2), () => `stale: the form's offer ${/google-step-up/.test(staleForm.text)}; the POST ${stale.status}; founded ${JSON.stringify(founded(e2))}`);
  // a passphrase account: joined and verified by email, approved — its passphrase is still asked
  const e3 = `s69p${TAG}@smoke.local`, pass = `s69-pass-${TAG}-long`, b3 = browser();
  await b3.call("POST", "/request-access", { form: { web: "1", name: "S69 Pass", email: e3, company: `S69 Pass ${TAG}`, role: "CTO", team_size: "2-10", password: pass, confirm: pass, consent_terms: "1", consent_keep: "1" } });
  const link = linkIn(await mailFor(e3, (m) => m.subject === "Verify your email"));
  expect(link, "no verification email for the passphrase account");
  await b3.call("POST", "/account/verify", { form: { web: "1", token: link, password: pass } });
  approve(e3);
  const passForm = await b3.call("GET", "/orgs/new", { nav: true });
  const empty = await b3.call("POST", "/orgs", { form: form(`s69p${TAG}`, { email: e3 }) }), emptyMade = !!founded(e3);
  const typed = await b3.call("POST", "/orgs", { form: form(`s69p${TAG}`, { email: e3, password: pass }) });
  expect(/<input type="password" id="password" name="password" autocomplete="current-password" required/.test(passForm.text) && !/google-step-up/.test(passForm.text)
    && empty.status === 422 && !emptyMade && typed.status === 200 && (founded(e3) || {}).slug === `s69p${TAG}`,
    () => `the passphrase account: its field required ${/name="password"[^>]*required/.test(passForm.text)}; empty ${empty.status}; with it ${typed.status}`);
  return `fresh Google sign-in -> the org with no passphrase (/${`s69f${TAG}`}); 11 minutes old -> 401 with Continue with Google, nothing made; the passphrase account: empty 422, its passphrase -> /s69p${TAG}`;
});

smoke("google · the connect page by Google: the authorization completes as the owner (the client's code redeemed, whoami as that seat); then clear-google-client: no button again", async () => {
  expect(S.client && S.fake, "the first google case did not run");
  const b = browser(), me0 = { sub: `s69-owner-${TAG}`, email: S.owner, email_verified: true };
  const page = await b.call("GET", authorizeOf(S.client.client_id, "s69c"), { nav: true });
  const reqOf = (t) => (/<form method="POST" action="\/auth\/google\/start"[\s\S]*?name="oauth_req" value="([^"]+)"/.exec(t) || [])[1] || "";
  const oauthReq = reqOf(page.text);
  let g = await google(b, "connect", me0, { form: { oauth_req: oauthReq } });
  // an owner whose account holds seats in several orgs is asked which (never its oldest by default): org 1, then Google once more
  if (g.cb && g.cb.status === 200 && /data-region="org-choice"/.test(g.cb.text)) g = await google(b, "connect", me0, { form: { oauth_req: reqOf(g.cb.text), org: orgSlug(1) } });
  const to = g.cb && g.cb.location ? new URL(g.cb.location) : null;
  expect(oauthReq && g.start.status === 303 && g.cb && g.cb.status === 302 && to && to.host === "s69-client.example.org" && to.searchParams.get("state") === "s69c" && to.searchParams.get("code"),
    () => `the connect page's Google form ${!!oauthReq}; the start ${g.start.status}; the callback ${g.cb && g.cb.status} ${g.cb && g.cb.location}`);
  const tok = await (await patientFetch(BASE + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: to.searchParams.get("code"), redirect_uri: "https://s69-client.example.org/cb", client_id: S.client.client_id, code_verifier: VERIFIER }).toString() })).json();
  const r = await patientFetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok.access_token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }) });
  let me = null; try { me = JSON.parse(JSON.parse(await r.text()).result.content[0].text); } catch { me = null; }
  expect(me && String(me.email || "").toLowerCase() === S.owner, () => `whoami through the Google-made grant: ${JSON.stringify(me || {}).slice(0, 160)}`);
  try {
    const clear = await op("clear-google-client");
    expect(clear.rc === 0, () => `clear-google-client: rc ${clear.rc} ${clear.out.slice(0, 200)}`);
    const off = await until(fourPages, (a) => Object.values(a.has).every((x) => !x));
    expect(Object.values(off.has).every((x) => !x), () => `cleared: buttons ${JSON.stringify(off.has)}`);
  } finally { await S.fake.close(); rmSync(S.dir, { recursive: true, force: true }); }
  return `the connect page's Google form -> the client's code (its state kept) -> its token -> whoami ${me.email}; clear-google-client -> no button on the four pages`;
});
