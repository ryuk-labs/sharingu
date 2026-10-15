// tools/smoke/s67-account-flow.mjs — sprint 21, slice 21.4a (THE ACCOUNT FLOW: src/accounts.js, src/requestaccess.js, src/accountpage.js,
// src/email.js, src/mails.js; tools/operator.mjs allow --request), walked end to end on the real local worker, its every email read
// from the local capture (tools/mail-capture.mjs: never printed). Self-contained: its own emails (s67<tag>…@smoke.local); it runs
// late (registered after s66; only s68 after it), because its cap case fills the email window for a moment (and empties it again).
//   · join with a passphrase: a new email, an existing account's email and the honeypot answer the SAME 303 to /account/sent
//   · before verifying: the sign-in with the joined passphrase is 403 check your inbox (with its resend); a second address's
//     resends stop at three emails a day (the fourth answers the same, sends nothing)
//   · the captured "Verify your email": its GET the confirm page, its POST with the passphrase 303 to /account signed in, the
//     status page with its place in line; the team's alert to acie@ cc ryuk@ carries the company, never a name or an email
//   · the account session reaches nothing else: an org's address sends it to the sign-in, /mcp 401 as a cookie and as a bearer,
//     /orgs/new back to /account, POST /orgs 403 org_waiting
//   · `operator allow --request` (local): the captured "You're in" -> sign in (an account session) -> the org form filled in from
//     the request -> the org, its owner seat signed in
//   · forgot -> the captured reset link -> a new passphrase -> every old session gone (the org session, the account session), the
//     old passphrase refused, the new one signs in
//   · THE SEAT HOLDER (src/accounts.js ACCOUNT_HELD, the owner's MCQ of 2026-10-15): a person an admin seated (no passphrase, no
//     Google subject: the seat's own secret signs them in) joins -> "you already have an account" captured, no verification email,
//     nothing in line; forgot -> the captured reset -> its FIRST passphrase, so the seat WAITS (src/accounts.js THE FIRST PASSPHRASE
//     WAITS) -> 303 to the picker, which says so and names the org -> Accept -> the passphrase signs in to that seat
//   · THE CAP: with the window set at 2,900 by SQL a join answers the same 303, files nothing and sends nothing to the person,
//     /account/sent says email checks are paused, the team's cap alert captured once; the window emptied again after
import { randomBytes, createHash } from "node:crypto";
import { smoke, expect, brief, http as http0, d1rows as rows, operator as op, mails, mailFor, linkIn, orgSlug, addPerson, BASE } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sha = (s) => createHash("sha256").update(s).digest("hex");
// a request refused by the address's flood filter (LOGIN_LIMIT: shared with /login and /signup) is sent again ONCE after its
// window: that refusal proves nothing about the door behind it
const http = async (method, path, o) => {
  let r = await http0(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many attempts/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http0(method, path, o); }
  return r;
};
const PASS = `smoke-s67-pass-${TAG}`, NEW = `smoke-s67-new-${TAG}`;
const FORM = { web: "1", name: "S67 Mary", role: "CTO", team_size: "2-10", password: PASS, confirm: PASS, consent_terms: "1", consent_keep: "1" };
const join = (email, company = `S67 Works ${TAG}`, extra = {}) => http("POST", "/request-access", { form: { ...FORM, email, company, ...extra }, accept: "text/html" });
const shape = (r) => JSON.stringify([r.status, r.locationRaw, r.raw]);
const cookieOf = (r) => (/__Host-ar_session=([^;]+)/.exec(r.setCookie || "") || [])[1] || "";
const login = (email, password) => http("POST", "/login", { form: { web: "1", email, password }, accept: "text/html" });
const S = { a: `s67a${TAG}@smoke.local`, b: `s67b${TAG}@smoke.local` };

smoke("account flow · join with a passphrase: a new email, an existing account's email and the honeypot answer the SAME 303 to /account/sent", async () => {
  const fresh = await join(S.a);
  const acct = (rows("SELECT email FROM accounts WHERE pass_hash IS NOT NULL ORDER BY created_at LIMIT 1")[0] || {}).email;   // a HELD account (a passphrase; a seat holds one too: the seat-holder case below)
  expect(acct, "no account on this worker (an earlier case makes several)");
  const held = await join(acct), trap = await join(`s67bot${TAG}@smoke.local`, "Bot", { trap: "https://spam.example.org" });
  expect(fresh.status === 303 && fresh.locationRaw === "/account/sent" && shape(held) === shape(fresh) && shape(trap) === shape(fresh),
    () => `the answers: ${shape(fresh)} | ${shape(held)} | ${shape(trap)}`);
  const heldMail = await mailFor(acct, (m) => m.subject === "You already have a sharingu account");
  expect(rows(`SELECT status FROM access_requests WHERE email = ${q(S.a)}`).map((r) => r.status).join() === "unverified" && heldMail && !linkIn(heldMail),
    () => "the new email's unverified request, or the account's \"already\" email (no link)");
  return "one 303 -> /account/sent for the three; the new email's unverified request; the account's \"already\" email, no link";
});

smoke("account flow · before verifying: the sign-in is check your inbox (with its resend); a second address's resends stop at three emails a day", async () => {
  const early = await login(S.a, PASS);
  expect(early.status === 403 && /data-screen="account-sent"/.test(early.raw) && /action="\/account\/resend"/.test(early.raw) && !cookieOf(early), () => `the early sign-in: ${early.status}`);
  await join(S.b);
  expect(await mailFor(S.b, (m) => m.subject === "Verify your email"), "no verification email for the second address");
  const resends = [];
  for (let i = 0; i < 3; i++) resends.push(await http("POST", "/account/resend", { form: { web: "1", email: S.b }, accept: "text/html" }));
  await new Promise((ok) => setTimeout(ok, 2000));
  const got = (await mails({ to: S.b })).filter((m) => m.subject === "Verify your email");
  expect(resends.every((r) => shape(r) === shape(resends[0]) && r.status === 303) && got.length === 3, () => `the resends: ${resends.map((r) => r.status).join("/")}; ${got.length} emails (three a day)`);
  return `403 check your inbox; ${got.length} emails to one address for one join and three resends (the fourth answered the same, sent nothing)`;
});

smoke("account flow · the captured verification: its GET the confirm page, its POST with the passphrase 303 to /account signed in, its place in line; the team's alert names the company, never the person", async () => {
  const m = await mailFor(S.a, (x) => x.subject === "Verify your email");
  const t = linkIn(m);
  expect(t && m.from.email === "hello@sharingu.xyz" && m.html.includes(`${BASE}/account/verify/${t}`), "no verification link in the captured email");
  const g = await http("GET", `/account/verify/${t}`, { accept: "text/html", nav: true });
  expect(g.status === 200 && /data-screen="account-verify"/.test(g.raw) && rows(`SELECT status FROM access_requests WHERE email = ${q(S.a)}`)[0].status === "unverified", () => `the link's GET: ${g.status}`);
  const v = await http("POST", "/account/verify", { form: { web: "1", token: t, password: PASS }, accept: "text/html" });
  S.acct = cookieOf(v);
  expect(v.status === 303 && v.locationRaw === "/account" && /^t_a_/.test(S.acct), () => `the verification: ${v.status} -> ${v.locationRaw}`);
  const p = await http("GET", "/account", { cookie: S.acct, accept: "text/html", nav: true });
  expect(p.status === 200 && /data-screen="account-in-line"/.test(p.raw) && /data-request-place>\d+</.test(p.raw), () => `the status page: ${p.status}`);
  const team = await mailFor("acie@ryuklabs.io", (x) => x.subject === `New beta request: S67 Works ${TAG}`);
  expect(team && team.cc === "ryuk@ryuklabs.io" && /CTO/.test(team.text) && !/S67 Mary|s67a/i.test(team.text + team.html + team.subject), () => `the team's alert: ${brief(team && team.subject)}`);
  S.id = (rows(`SELECT id FROM access_requests WHERE email = ${q(S.a)} AND status = 'open'`)[0] || {}).id;
  return `verified, signed in to /account (place ${(/data-request-place>(\d+)</.exec(p.raw) || [])[1]}); the team's alert to acie@ cc ryuk@, no name or email`;
});

smoke("account flow · the account session reaches nothing else: an org's address, /mcp as a cookie and a bearer, /orgs/new and POST /orgs before the approval", async () => {
  expect(S.acct, "the verification case did not run");
  const org = await http("GET", `/${orgSlug(1)}/home`, { cookie: S.acct, accept: "text/html", nav: true, root: true });
  const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } };
  const mcpC = await http("POST", "/mcp", { cookie: S.acct, body: call }), mcpB = await http("POST", "/mcp", { key: S.acct, body: call });
  const nw = await http("GET", "/orgs/new", { cookie: S.acct, accept: "text/html", nav: true });
  const make = await http("POST", "/orgs", { body: { email: S.a, password: PASS, name: `S67 Works ${TAG}`, slug: `s67-${TAG}` } });
  expect(org.status === 302 && /^\/login/.test(org.locationRaw) && mcpC.status === 401 && mcpB.status === 401 && nw.status === 302 && nw.locationRaw === "/account"
    && make.status === 403 && make.json && make.json.error === "org_waiting", () => `the reach: org ${org.status} ${org.locationRaw}; /mcp ${mcpC.status}/${mcpB.status}; /orgs/new ${nw.status} ${nw.locationRaw}; POST /orgs ${make.status} ${brief(make.json)}`);
  return "an org's address -> the sign-in; /mcp 401 both ways; /orgs/new -> /account; POST /orgs 403 org_waiting";
});

smoke("account flow · `operator allow --request`: the captured \"You're in\" -> sign in -> the org form filled in from the request -> the org", async () => {
  expect(S.id, "the verification case did not run");
  const a = await op("allow", "--request", S.id, "--origin", BASE);
  expect(a.rc === 0 && !a.code && /"You're in" sent to/.test(a.out), () => `allow --request: rc ${a.rc} ${a.out.slice(0, 240)}`);
  const m = await mailFor(S.a, (x) => x.subject === "You're in");
  expect(m && m.text.includes(`${BASE}/login`), "no \"You're in\" in the capture");
  const s = await login(S.a, PASS);
  S.acct2 = cookieOf(s);
  expect(s.status === 302 && s.locationRaw === "/account" && S.acct2, () => `the sign-in: ${s.status} -> ${s.locationRaw}`);
  const f = await http("GET", "/orgs/new", { cookie: S.acct2, accept: "text/html", nav: true });
  const val = (k) => (new RegExp(`id="${k}"[^>]*value="([^"]*)"`).exec(f.raw) || [])[1];
  expect(f.status === 200 && val("email") === S.a && val("name") === `S67 Works ${TAG}` && val("you") === FORM.name, () => `the org form: ${f.status} ${val("email")} ${val("name")} ${val("you")}`);
  const made = await http("POST", "/orgs", { cookie: S.acct2, form: { web: "1", email: S.a, password: PASS, name: val("name"), slug: `s67-${TAG}`, you: val("you"), product: "S67 App", line: "S67 one line", stage: "idea" }, accept: "text/html" });
  S.orgCookie = cookieOf(made);
  const tok = S.orgCookie ? rows(`SELECT org, revoked FROM tokens WHERE token_hash = ${q(sha(S.orgCookie))}`)[0] || {} : {};
  const org = rows(`SELECT id FROM org WHERE slug = ${q(`s67-${TAG}`)}`)[0] || {};
  expect(made.status === 200 && /data-screen="org-made"/.test(made.raw) && tok.org === org.id && tok.revoked === 0, () => `POST /orgs: ${made.status}; its session ${brief(tok)} in org ${org.id}`);
  return `"You're in" captured; signed in to /account; the form filled in; the org made (${org.id}) and its owner seat signed in`;
});

smoke("account flow · forgot -> the captured reset -> a new passphrase -> every old session gone; the old passphrase refused, the new one signs in", async () => {
  expect(S.orgCookie && S.acct, "the approval case did not run");
  const f = await http("POST", "/account/forgot", { form: { web: "1", email: S.a }, accept: "text/html" });
  const n = await http("POST", "/account/forgot", { form: { web: "1", email: `s67nobody${TAG}@smoke.local` }, accept: "text/html" });
  expect(f.status === 200 && f.raw === n.raw, () => `the forgot answers: ${f.status} / ${n.status}, the same ${f.raw === n.raw}`);
  const t = linkIn(await mailFor(S.a, (m) => m.subject === "Reset your passphrase"), "reset");
  expect(t, "no reset link in the capture");
  const g = await http("GET", `/account/reset/${t}`, { accept: "text/html", nav: true });
  const r = await http("POST", "/account/reset", { form: { web: "1", token: t, password: NEW, confirm: NEW }, accept: "text/html" });
  const ended = [rows(`SELECT revoked FROM tokens WHERE token_hash = ${q(sha(S.orgCookie))}`)[0], ...[S.acct, S.acct2].map((c) => rows(`SELECT revoked FROM account_sessions WHERE token_hash = ${q(sha(c))}`)[0])];
  expect(g.status === 200 && r.status === 303 && cookieOf(r) && ended.every((x) => x && x.revoked === 1), () => `the reset: ${g.status}, ${r.status} -> ${r.locationRaw}; ended ${brief(ended)}`);
  const old = await http("POST", "/login", { body: { email: S.a, password: PASS } }), fresh = await http("POST", "/login", { body: { email: S.a, password: NEW } });
  expect(old.status === 401 && fresh.status === 200 && fresh.json && fresh.json.token, () => `the old passphrase ${old.status}, the new ${fresh.status}`);
  return `the same answer for a stranger's email; the reset signed in fresh (${r.locationRaw}); the org session and both account sessions ended; old 401, new 200`;
});

smoke("account flow · a seat holder with no passphrase joins: \"you already have an account\", nothing verifiable; forgot -> reset -> the picker (its seat waits) -> Accept -> signed in to its seat", async () => {
  const e = `s67seat${TAG}@smoke.local`;
  const seat = await addPerson("S67 Seated", e);   // the admin's add-person: an active seat, its account with no passphrase
  const a0 = rows(`SELECT pass_hash, google_sub, invited_org FROM accounts WHERE email = ${q(e)}`)[0] || {};
  expect(a0 && a0.pass_hash === null && a0.google_sub === null && a0.invited_org === null, () => `the seated account: ${brief(a0)}`);
  const j = await join(e);
  const already = await mailFor(e, (m) => m.subject === "You already have a sharingu account");
  const verify = (await mails({ to: e })).filter((m) => m.subject === "Verify your email");
  const reqs = rows(`SELECT status FROM access_requests WHERE email = ${q(e)}`).map((r) => r.status).join();
  expect(j.status === 303 && j.locationRaw === "/account/sent" && already && !linkIn(already) && verify.length === 0 && reqs === "unverified",
    () => `the join: ${j.status} -> ${j.locationRaw}; already ${!!already}; ${verify.length} verification emails; requests ${reqs}`);
  await http("POST", "/account/forgot", { form: { web: "1", email: e }, accept: "text/html" });
  const t = linkIn(await mailFor(e, (m) => m.subject === "Reset your passphrase"), "reset");
  expect(t, "no reset link in the capture for the seat holder");
  const r = await http("POST", "/account/reset", { form: { web: "1", token: t, password: NEW, confirm: NEW }, accept: "text/html" });
  const c = cookieOf(r), waits = rows(`SELECT active, pending FROM people WHERE id = ${q(seat.id)}`)[0] || {};
  expect(r.status === 303 && r.locationRaw === "/orgs?seat=reset" && c && waits.active === 0 && waits.pending === 1, () => `the reset: ${r.status} -> ${r.locationRaw}; the seat ${brief(waits)}`);
  const picker = await http("GET", "/orgs?seat=reset", { cookie: c, accept: "text/html", nav: true });
  expect(picker.status === 200 && /Your seats wait for your yes/.test(picker.raw) && picker.raw.includes(`data-pending="${orgSlug(1)}"`), () => `the picker: ${picker.status}`);
  const yes = await http("POST", "/orgs/seat", { cookie: c, form: { seat: seat.id, answer: "accept" }, accept: "text/html" });
  const now = rows(`SELECT active, pending FROM people WHERE id = ${q(seat.id)}`)[0] || {};
  expect(yes.status === 303 && yes.locationRaw === "/orgs?seat=accepted" && now.active === 1 && now.pending === 0, () => `Accept: ${yes.status} -> ${yes.locationRaw}; the seat ${brief(now)}`);
  const s = await http("POST", "/login", { body: { email: e, password: NEW } });
  const st = s.json && s.json.token ? rows(`SELECT person_id FROM tokens WHERE token_hash = ${q(sha(s.json.token))}`)[0] || {} : {};
  expect(s.status === 200 && st.person_id === seat.id, () => `the sign-in with the new passphrase: ${s.status}; its seat ${brief(st)}`);
  return `"already" captured, no verification email, its request never in line; the reset -> the picker (the seat waiting, the org named) -> Accept; the passphrase signs in to that seat`;
});

smoke("account flow · THE CAP: at 2,900 in the window a join answers the same, files and sends nothing; /account/sent says paused; the team's alert once", async () => {
  const day = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${day}T00:00:00.000Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const before = rows("SELECT day, n, alerted FROM mail_days ORDER BY day");
  const ref = await join(`s67ref${TAG}@smoke.local`);   // the answer while there is room
  rows(`INSERT INTO mail_days (day, n) VALUES (${q(start)}, 2900) ON CONFLICT (day) DO UPDATE SET n = n + 2900`);
  try {
    const c1 = `s67cap1${TAG}@smoke.local`, c2 = `s67cap2${TAG}@smoke.local`;
    const a = await join(c1), b = await join(c2);
    const sent = await http("GET", "/account/sent", { accept: "text/html" });
    await new Promise((ok) => setTimeout(ok, 2000));
    const toThem = [...(await mails({ to: c1 })), ...(await mails({ to: c2 }))];
    const alerts = (await mails({ to: "acie@ryuklabs.io" })).filter((m) => /paused/i.test(m.subject));
    expect(shape(a) === shape(ref) && shape(b) === shape(ref) && rows(`SELECT 1 FROM access_requests WHERE email IN (${q(c1)}, ${q(c2)})`).length === 0 && toThem.length === 0,
      () => `at the cap: ${shape(a)} vs ${shape(ref)}; ${toThem.length} emails to them`);
    // (21.4c) no Google client is stored on the smoke's worker yet (s69 stores one): no button, "try again in a few days"
    expect(sent.status === 200 && /data-screen="account-paused"/.test(sent.raw) && /Try again in a few days/.test(sent.raw) && !/data-region="google"/.test(sent.raw) && alerts.length === 1 && alerts[0].cc === "ryuk@ryuklabs.io",
      () => `the paused page ${sent.status}; ${alerts.length} alerts`);
    return `two joins at the cap: the same 303, nothing filed or sent; paused said; ${alerts.length} alert to the team`;
  } finally {
    // the window as it was (the next cases and runs start from room)
    rows(`UPDATE mail_days SET n = n - 2900 WHERE day = ${q(start)}`);
    rows(`DELETE FROM mail_days WHERE n = 0 AND alerted = 0`);
    if (!before.some((r) => r.day === day && Number(r.alerted) === 1)) rows(`UPDATE mail_days SET alerted = 0 WHERE day = ${q(day)}`);
  }
});
