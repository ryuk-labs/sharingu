// tools/smoke/s53-invite.mjs — sprint 12, 12.3 (migrate-079; src/accounts.js THE INVITE LINK, src/admin.js mintInvite, src/invite.js)
// on the real local worker: an org's one-time invite link. Every link is held in memory, never printed. It seeds a second org of its
// own as the operator's tools do (s45's way), after every other case.
//   · the admin mints: Control's Invite with deliver=link answers ONE link (on the request's origin) and no key; the invitee opens
//     GET /signup?via=invite (no session), sets a passphrase through the page's form and lands signed in at the org's address, as the
//     invited seat, on the project Invite ticked; its account holds the passphrase, marked with the org
//   · the same link again: refused (401), nothing written; an expired link: refused, nothing written
//   · an email whose account stands: the other org's seat of it WAITS and gets no link; a link whose email another org seats
//     meanwhile answers 409 (sign in and accept on /orgs), nothing written; and the invite-made account sees no other org's waiting
//     seat, cannot answer it, and creates no org (403 org_by_invite)
//   · a member cannot mint (403); another org's admin aimed at this org's seat mints nothing
import { randomBytes } from "node:crypto";
import { smoke, expect, http as http0, ownerKey, sha, d1rows as rows, orgSlug } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const T = () => new Date().toISOString();
const PASS = `invitee-own-pass-${TAG}`;
// the door, retried once when the socket failed, and once after the address's window when the flood filter refused (s41's rule)
const http1 = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
const http = async (method, path, o) => {
  let r = await http1(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many (?:sign-in )?attempts from this address/.test(r.raw || "")) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http1(method, path, o); }
  return r;
};
const LINK_RE = /https?:\/\/[^\s"'<>]+\/signup\?via=invite#([0-9a-f]{48})\b/;
// invite(adminKey, name, email, extra) -> { token, raw }: Control's Invite as its form sends it (deliver=link, the projects ticked)
const invite = async (adminKey, name, email, extra = {}) => {
  const r = await http("POST", "/control", { key: adminKey, form: { action: "add-person", name, email, deliver: "link", seatsChosen: "1", ...extra } });
  return { token: (LINK_RE.exec(r.raw || "") || [])[1] || null, raw: r.raw || "", status: r.status };
};
// redeem(token, o) -> the invite page's form post (a browser), or the JSON one
const redeem = (token, o = {}) => o.json
  ? http("POST", "/signup", { body: { via: "invite", invite: token, password: o.password || PASS }, root: true })
  : http("POST", "/signup", { form: { web: "1", via: "invite", invite: token, password: o.password || PASS, confirm: o.password || PASS }, accept: "text/html", root: true });
const seatOf = (email, org) => rows(`SELECT id, active, pending FROM people WHERE email = ${q(email)} AND org = ${Number(org)}`)[0] || {};
const accountOf = (email) => rows(`SELECT id, pass_hash, invited_org FROM accounts WHERE email = ${q(email)}`)[0] || {};
const linksOf = (email) => rows(`SELECT id, org, used_at, revoked_at FROM seat_invites WHERE email = ${q(email)} ORDER BY created_at`);
const at = async (slug, cookie) => { const r = await http("GET", `/${slug}/whoami`, { cookie, root: true }); return r.status === 200 && r.json ? r.json.id : r.status; };
// what a refusal must not move: the email's account, its seats, the links and the live sessions
const still = (email) => JSON.stringify([accountOf(email), rows(`SELECT id, active, pending FROM people WHERE email = ${q(email)} ORDER BY id`), linksOf(email),
  rows("SELECT COUNT(*) AS n FROM tokens WHERE revoked = 0")[0]]);
const S = {};

smoke("invite · the admin's Invite makes ONE link and no key; the invitee opens it, chooses a passphrase and lands signed in, seated as invited", async () => {
  S.slug1 = orgSlug(1);
  S.email = `invitee-${TAG}@smoke.local`;
  const proj = (rows("SELECT key FROM projects WHERE org = 1 AND active = 1 ORDER BY key LIMIT 1")[0] || {}).key;
  const a = await invite(ownerKey, "Ivy Invitee", S.email, proj ? { projectKey: proj } : {});
  const seat = seatOf(S.email, 1), l = linksOf(S.email);
  expect(a.status === 200 && a.token && /Invite link, shown once/.test(a.raw) && !/API key\)|shown again:/.test(a.raw) && seat.active === 1 && l.length === 1 && l[0].org === 1 && !l[0].used_at,
    () => `Invite: ${a.status}, link ${a.token ? "shown" : "MISSING"}, a key ${/API key\)/.test(a.raw) ? "SHOWN" : "not shown"}; the seat ${JSON.stringify(seat)}; ${l.length} link row(s)`);
  S.token = a.token; S.seat = seat.id;
  const pg = await http("GET", "/signup?via=invite", { accept: "text/html", nav: true, root: true });
  expect(pg.status === 200 && !pg.setCookie && /data-screen="signup-invite"/.test(pg.raw) && !pg.raw.includes(a.token), () => `the invite page: ${pg.status}, a cookie ${pg.setCookie ? "SET" : "none"}`);
  const r = await redeem(a.token);
  S.cookie = (r.setCookie.match(/__Host-ar_session=([^;]+)/) || [])[1] || "";
  const who = S.cookie ? await at(S.slug1, S.cookie) : null;
  const acct = accountOf(S.email), seats = rows(`SELECT project_key FROM project_seats WHERE person_id = ${q(seat.id)}`).map((x) => x.project_key);
  expect(r.status === 302 && r.locationRaw === `/${S.slug1}` && S.cookie && who === seat.id && acct.pass_hash && Number(acct.invited_org) === 1 && !!linksOf(S.email)[0].used_at && (!proj || seats.includes(proj)),
    () => `the form: ${r.status} -> ${r.locationRaw}; the session reads ${who}; the account ${acct.pass_hash ? "holds a passphrase" : "has NONE"}, marked ${acct.invited_org}; seated ${seats.join(",")}`);
  const lg = await http("POST", "/login", { body: { email: S.email, password: PASS, device: "smoke-s53" } });
  expect(lg.status === 200 && lg.json && lg.json.token, () => `the chosen passphrase at /login: ${lg.status}`);
  return `one link, no key; GET /signup?via=invite sets no session; the form -> /${S.slug1} signed in as the invited seat${proj ? `, seated on ${proj}` : ""}; the account marked org 1; /login takes the passphrase`;
});

smoke("invite · the same link twice and an expired link are refused, nothing written", async () => {
  expect(S.token, "the first invite case did not run");
  const before = still(S.email);
  const again = await redeem(S.token), againJ = await redeem(S.token, { json: true, password: "another-passphrase-xyz" });
  expect(again.status === 401 && againJ.status === 401 && againJ.json && againJ.json.error === "invalid_invite" && !again.setCookie && still(S.email) === before,
    () => `the same link again: ${again.status}, ${againJ.status} ${againJ.json && againJ.json.error}; ${still(S.email) === before ? "nothing written" : "rows MOVED"}`);
  const e2 = `invitee-late-${TAG}@smoke.local`;
  const b = await invite(ownerKey, "Lee Late", e2);
  rows(`UPDATE seat_invites SET expires_at = ${q(new Date(Date.now() - 60000).toISOString())} WHERE email = ${q(e2)}`);
  const b0 = still(e2);
  const late = await redeem(b.token, { json: true });
  expect(b.token && late.status === 401 && still(e2) === b0 && !accountOf(e2).pass_hash, () => `an expired link: ${late.status}; ${still(e2) === b0 ? "nothing written" : "rows MOVED"}`);
  return `twice: ${again.status} / ${againJ.status} invalid_invite; expired: ${late.status}; nothing written either way`;
});

smoke("invite · an email whose account stands: no link for a waiting seat; a link whose email another org seats meanwhile changes nothing (409); the invite-made account answers no other org's seat and creates no org", async () => {
  expect(S.cookie, "the first invite case did not run");
  const tAt = T(), n = rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  S.org = n; S.ownerKeyN = randomBytes(20).toString("hex");
  rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${n}, ${q(`Invite ${TAG}`)}, ${q(tAt)}, ${q(tAt)}, 'local')`);
  rows(`INSERT INTO projects (key, name, active, created_at) VALUES ('o${n}--inv', 'Inv', 1, ${q(tAt)})`);
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('invite-owner-${n}', 'Invite Owner', ${q(`owner@invite${n}.local`)}, 'owner', ${q(sha(S.ownerKeyN))}, 1, ${q(tAt)}, ${n})`);
  S.slugN = orgSlug(n);
  // the other org seats the invitee (an account with a passphrase): the seat waits, and no link is made
  const w = await invite(S.ownerKeyN, "Ivy (there)", S.email);
  const wseat = seatOf(S.email, n);
  expect(!w.token && wseat.pending === 1 && /No invite link: their account already stands/.test(w.raw) && !linksOf(S.email).some((x) => x.org === n),
    () => `the other org's Invite of a standing account: link ${w.token ? "MADE" : "none"}, the seat ${JSON.stringify(wseat)}`);
  // a link minted while the email was fresh; then the other org seats it (it waits): the link sets nothing
  const e3 = `invitee-both-${TAG}@smoke.local`;
  const f = await invite(ownerKey, "Bo Both", e3);
  await http("POST", "/control", { key: S.ownerKeyN, form: { action: "add-person", name: "Bo (there)", email: e3 } });
  const f0 = still(e3);
  const st = await redeem(f.token), stJ = await redeem(f.token, { json: true });
  expect(f.token && seatOf(e3, n).pending === 1 && st.status === 409 && /already holds a sharingu account/.test(st.raw) && /\/orgs/.test(st.raw) && stJ.status === 409 && stJ.json.error === "account_stands" && still(e3) === f0,
    () => `the link after another org seated the email: ${st.status} / ${stJ.status} ${stJ.json && stJ.json.error}; ${still(e3) === f0 ? "nothing written" : "rows MOVED"}`);
  // the invite-made account (marked org 1): the other org's waiting seat is not on its picker, not answerable, and it founds no org
  const web = await http("POST", "/login", { form: { email: S.email, password: PASS, web: "1" }, accept: "text/html", root: true });
  const wc = (web.setCookie.match(/__Host-ar_session=([^;]+)/) || [])[1] || "";
  const pick = await http("GET", "/orgs", { cookie: wc, accept: "text/html", nav: true, root: true });
  const yes = await http("POST", "/orgs/seat", { cookie: wc, body: { seat: wseat.id, answer: "accept" }, root: true });
  const mk = await http("POST", "/orgs", { body: { email: S.email, password: PASS, name: `Squat ${TAG}`, slug: `squat-${TAG}` } });
  expect(web.status === 302 && web.locationRaw === `/${S.slug1}` && !(pick.status === 200 && (pick.raw || "").includes(wseat.id)) && yes.status === 404 && seatOf(S.email, n).pending === 1
    && mk.status === 403 && mk.json && mk.json.error === "org_by_invite", () => `the invite-made account: sign-in -> ${web.locationRaw}; the picker ${pick.status}; Accept ${yes.status}; the seat ${JSON.stringify(seatOf(S.email, n))}; POST /orgs ${mk.status} ${mk.json && mk.json.error}`);
  return `the other org's seat of a standing account waited, no link; a link whose email was seated elsewhere meanwhile: ${st.status} account_stands, nothing written; the invite-made account: no picker row, Accept ${yes.status}, POST /orgs ${mk.status} org_by_invite`;
});

smoke("invite · a member cannot mint a link; another org's admin aimed at this org's seat mints nothing", async () => {
  expect(S.seat && S.ownerKeyN, "the earlier invite cases did not run");
  const m = await http("POST", "/control", { key: ownerKey, form: { action: "add-person", name: "Moe Member", email: `member-${TAG}@smoke.local` } });
  const mk = (/API key\): ([0-9a-f]{40})/.exec(m.raw || "") || [])[1];
  const n0 = rows("SELECT COUNT(*) AS n FROM seat_invites")[0].n;
  const byMember = await http("POST", "/control", { key: mk, form: { action: "invite-link", personId: S.seat } });
  const byOther = await http("POST", "/control", { key: S.ownerKeyN, form: { action: "invite-link", personId: S.seat } });
  const n1 = rows("SELECT COUNT(*) AS n FROM seat_invites")[0].n;
  expect(mk && byMember.status === 403 && /Nothing done/.test(byOther.raw || "") && !LINK_RE.test(byOther.raw || "") && n1 === n0,
    () => `a member: ${byMember.status}; the other org's admin: ${/Nothing done/.test(byOther.raw || "") ? "Nothing done" : "NOT refused"}; links ${n0} -> ${n1}`);
  // sprint 12's review: the invitee's seat is a WORKING seat now (signed in, its account holding its own passphrase): no new link,
  // even from this org's own admin — its secret is reset instead; a seat never used gets one (the instrument)
  const own = await http("POST", "/control", { key: ownerKey, form: { action: "invite-link", personId: S.seat } });
  const n2 = rows("SELECT COUNT(*) AS n FROM seat_invites")[0].n;
  expect(!LINK_RE.test(own.raw || "") && /Nothing done/.test(own.raw || "") && /Reset passphrase \(rotate-key\) or set-password/.test(own.raw || "") && n2 === n0,
    () => `this org's admin on the invitee's working seat: ${LINK_RE.test(own.raw || "") ? "a LINK" : "no link"}; links ${n0} -> ${n2}`);
  await http("POST", "/control", { key: ownerKey, form: { action: "add-person", name: "Fen Fresh", email: `fresh-${TAG}@smoke.local` } });
  const fresh = seatOf(`fresh-${TAG}@smoke.local`, 1);
  const fl = fresh ? await http("POST", "/control", { key: ownerKey, form: { action: "invite-link", personId: fresh.id } }) : { raw: "" };
  expect(LINK_RE.test(fl.raw || ""), "instrument: this org's own admin mints a link for a seat never used");
  return `a member ${byMember.status}; the other org's admin: Nothing done, no row; this org's admin: none for the working seat, a link for a fresh one`;
});
