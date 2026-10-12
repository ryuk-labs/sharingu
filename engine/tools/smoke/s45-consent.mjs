// tools/smoke/s45-consent.mjs — sprint 7's review (A1, A2, B1 + A4; migrate-074): a seat waits for its holder's yes, the sign-in never
// picks an org, one revocation rule — on the real local worker, after s44. It seeds an org of its own as the operator's tools do
// and holds every key in memory, never printed.
//   · an account that stands in org 1 (its own passphrase, as the sign-up gives it) is seated by another org's admin: the seat WAITS
//     (the flash says so); its key signs nothing in; the account's root sign-in lands on the picker, which shows the seat with
//     Accept and Decline; a cross-site post changes nothing; the holder's Accept (a real form post) makes it active — the
//     account's session then reads that org; a second invitee Declines, and its seat stays out
//   · the JSON sign-in of an account in two orgs asks (409 choose_org, its orgs) and signs in once `org` names one
//   · the new org's admin Reissues its seat: that seat's own session ends, the account's session reads on in org 1 and there
//   · the holder's account passphrase change on /profile ends every OTHER session of the account; the one it was proven on stays
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { smoke, expect, http as http0, ownerKey, sha, d1rows as rows, orgSlug, BASE } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const T = () => new Date().toISOString();
// the door, retried once when the socket failed, and once after the address's window when the flood filter refused (s41's rule)
const http1 = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
const http = async (method, path, o) => {
  let r = await http1(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many sign-in attempts from this address/.test(r.raw || "")) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http1(method, path, o); }
  return r;
};
const NAV = { accept: "text/html", nav: true };
const webLogin = async (email, password) => {
  const r = await http("POST", "/login", { form: { email, password, web: "1" } });
  return { status: r.status, at: r.locationRaw, cookie: (r.setCookie.match(/__Host-ar_session=([^;]+)/) || [])[1] || "" };
};
const secretOf = (t) => (String(t).match(/(?:API key\)|shown again): ([0-9a-f]{40})\b/) || [])[1] || null;
// add(adminKey, name, email) -> { key, text }: add-person as that org's admin; the seat is NOT accepted here (this case drives the yes)
const add = async (adminKey, name, email) => { const r = await http("POST", "/control", { key: adminKey, form: { action: "add-person", name, email } }); return { key: secretOf(r.text), text: r.raw || r.text }; };
const accountPass = (email, pass) => {
  const salt = randomBytes(16).toString("hex");
  rows(`UPDATE accounts SET pass_hash = ${q(pbkdf2Sync(pass, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"))}, pass_salt = ${q(salt)} WHERE email = ${q(email)}`);
};
const seatOf = (email, org) => rows(`SELECT id, active, pending FROM people WHERE email = ${q(email)} AND org = ${Number(org)}`)[0] || {};
// the picker's waiting seats: [{ slug, id }]
const waiting = (html) => [...String(html).matchAll(/data-pending="([^"]+)"[\s\S]*?name="seat" value="([^"]+)"/g)].map((m) => ({ slug: m[1], id: m[2] }));
const at = async (slug, cookie) => { const r = await http("GET", `/${slug}/whoami`, { cookie, root: true }); return r.status === 200 && r.json ? r.json.id : r.status; };
const S = {};

smoke("consent · a seat another org adds for an account that stands elsewhere WAITS: invisible, then the holder's own Accept on the picker makes it active; a Decline keeps it out", async () => {
  S.slug1 = orgSlug(1);
  const tAt = T(), n = rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  S.org = n; S.name = `Consent ${TAG}`; S.ownerKeyN = randomBytes(20).toString("hex");
  rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${n}, ${q(S.name)}, ${q(tAt)}, ${q(tAt)}, 'local')`);
  rows(`INSERT INTO projects (key, name, active, created_at) VALUES ('o${n}--yes', 'Yes', 1, ${q(tAt)})`);
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('consent-owner-${n}', 'Consent Owner', ${q(`owner@consent${n}.local`)}, 'owner', ${q(sha(S.ownerKeyN))}, 1, ${q(tAt)}, ${n})`);
  S.slugN = orgSlug(n);
  // an account of org 1 (seated by org 1's admin: a new email, active at once) that holds its own passphrase
  S.email = `consent-${TAG}@smoke.local`; S.pass = `consent-account-pass-${TAG}`;
  const k1 = await add(ownerKey, "Consent Holder", S.email);
  expect(k1.key && seatOf(S.email, 1).active === 1, () => `org 1's seat of a new email: ${JSON.stringify(seatOf(S.email, 1))}`);
  accountPass(S.email, S.pass);
  // the new org's admin seats the same email: the seat WAITS
  const kN = await add(S.ownerKeyN, "Consent Holder (there)", S.email);
  const row = seatOf(S.email, n);
  expect(kN.key && row.active === 0 && row.pending === 1 && /WAITS for its holder/.test(kN.text), () => `the other org's seat: ${JSON.stringify(row)}; the flash ${/WAITS/.test(kN.text) ? "says it waits" : "does not say it waits"}`);
  S.seatN = row.id; S.keyN = kN.key;
  const keyWho = await http("GET", "/whoami", { key: kN.key });
  // the account's root sign-in (a real form) lands on the picker; the seat waits there with Accept and Decline
  const web = await webLogin(S.email, S.pass);
  expect(web.status === 302 && web.at === "/orgs" && web.cookie, () => `the root sign-in: ${web.status} ${web.at}`);
  S.cookie = web.cookie;
  const pick = await http("GET", "/orgs", { cookie: S.cookie, ...NAV, root: true });
  const w = waiting(pick.raw);
  const before = await at(S.slugN, S.cookie);
  expect(keyWho.status === 401 && pick.status === 200 && w.length === 1 && w[0].slug === S.slugN && w[0].id === S.seatN && /data-answer="accept"/.test(pick.raw) && /data-answer="decline"/.test(pick.raw) && before === 404,
    () => `its key ${keyWho.status}; GET /orgs ${pick.status} waiting ${JSON.stringify(w)}; under /${S.slugN} ${before}`);
  // a cross-site post changes nothing; the holder's own Accept (the picker's form) does
  const xs = await fetch(BASE + "/orgs/seat", { method: "POST", redirect: "manual", body: new URLSearchParams({ seat: S.seatN, answer: "accept" }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: "__Host-ar_session=" + S.cookie, "sec-fetch-site": "cross-site" } });
  expect(xs.status === 403 && seatOf(S.email, n).pending === 1, () => `a cross-site Accept: ${xs.status}; the seat ${JSON.stringify(seatOf(S.email, n))}`);
  const yes = await http("POST", "/orgs/seat", { cookie: S.cookie, form: { seat: S.seatN, answer: "accept" }, root: true });
  const now = seatOf(S.email, n), inN = await at(S.slugN, S.cookie), in1 = await at(S.slug1, S.cookie);
  expect(yes.status === 303 && yes.locationRaw === "/orgs?seat=accepted" && now.active === 1 && now.pending === 0 && inN === S.seatN && in1 === seatOf(S.email, 1).id,
    () => `Accept: ${yes.status} ${yes.locationRaw}; the seat ${JSON.stringify(now)}; the session under /${S.slugN} ${inN}, under /${S.slug1} ${in1}`);
  // a second invitee declines
  const e2 = `consent-no-${TAG}@smoke.local`;
  await add(ownerKey, "Consent Decliner", e2); accountPass(e2, S.pass);
  const n2 = await add(S.ownerKeyN, "Consent Decliner (there)", e2);
  const w2 = await webLogin(e2, S.pass);
  const no = await http("POST", "/orgs/seat", { cookie: w2.cookie, form: { seat: seatOf(e2, n).id, answer: "decline" }, root: true });
  const r2 = seatOf(e2, n), in2 = await at(S.slugN, w2.cookie);
  expect(n2.key && no.status === 303 && no.locationRaw === "/orgs?seat=declined" && r2.active === 0 && r2.pending === 0 && in2 === 404,
    () => `Decline: ${no.status} ${no.locationRaw}; the seat ${JSON.stringify(r2)}; under /${S.slugN} ${in2}`);
  return `the other org's seat waited (its key ${keyWho.status}; the root sign-in -> /orgs with it waiting); a cross-site post ${xs.status}; Accept -> ${yes.locationRaw}, the session then reads /${S.slugN}; Decline -> ${no.locationRaw}, the seat stays out`;
});

smoke("consent · the JSON sign-in of an account in two orgs never picks one: 409 choose_org with its orgs, then 200 once org names one", async () => {
  expect(S.cookie, "the first consent case did not run");
  const ask = await http("POST", "/login", { body: { email: S.email, password: S.pass, device: "smoke-s45" } });
  const named = await http("POST", "/login", { body: { email: S.email, password: S.pass, org: S.slugN, device: "smoke-s45" } });
  const slugs = ((ask.json && ask.json.orgs) || []).map((o) => o.slug).sort();
  expect(ask.status === 409 && ask.json.error === "choose_org" && slugs.join() === [S.slug1, S.slugN].sort().join() && !ask.json.token && named.status === 200 && named.json.token,
    () => `no org: ${ask.status} ${ask.json && ask.json.error} [${slugs.join(", ")}]; org ${S.slugN}: ${named.status}`);
  const who = await http("GET", "/whoami", { key: named.json.token });
  expect(who.status === 200 && who.json.id === S.seatN, () => `the token names ${who.json && who.json.id}, not the seat in ${S.slugN}`);
  return `409 choose_org [${slugs.join(", ")}], nothing minted; with org ${S.slugN}: 200, a token of that org's seat`;
});

smoke("consent · one revocation rule: the other org's Reissue ends its seat's own session only (the account's reads on in both orgs); the holder's own passphrase change ends every other session of the account", async () => {
  expect(S.cookie && S.keyN, "the first consent case did not run");
  const seatS = await webLogin(S.email, S.keyN);   // a SEAT session of the other org's seat (its own key)
  const rk = await http("POST", "/control", { key: S.ownerKeyN, form: { action: "rotate-key", personId: S.seatN } });
  const seatAfter = await at(S.slugN, seatS.cookie), acctN = await at(S.slugN, S.cookie), acct1 = await at(S.slug1, S.cookie);
  expect(seatS.cookie && seatAfter !== S.seatN && acctN === S.seatN && acct1 === seatOf(S.email, 1).id && /own account passphrase is theirs/.test(rk.raw || rk.text),
    () => `after Reissue: the seat session ${seatAfter}; the account session /${S.slugN} ${acctN}, /${S.slug1} ${acct1}`);
  // the holder's own change, proven by the account passphrase on a second session: the first ends, the second stays
  const second = await webLogin(S.email, S.pass);
  const ch = await http("POST", `/${S.slug1}/profile`, { cookie: second.cookie, body: { action: "set-my-passphrase", current: S.pass, password: S.pass + "-2" }, root: true });
  const first = await at(S.slug1, S.cookie), kept = await at(S.slug1, second.cookie);
  expect(ch.status === 200 && ch.json && ch.json.code === "account" && first !== seatOf(S.email, 1).id && kept === seatOf(S.email, 1).id,
    () => `the passphrase change ${ch.status} ${ch.json && ch.json.code}: the other session ${first}, the one proven on ${kept}`);
  return `Reissue in /${S.slugN}: its seat session ${seatAfter}, the account session reads on (/${S.slugN}, /${S.slug1}); the holder's passphrase change: the other session ${first}, this one reads on`;
});
