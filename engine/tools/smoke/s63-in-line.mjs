// tools/smoke/s63-in-line.mjs — sprint 21, slices 21.2 and 21.4a (src/requestaccess.js placeInLine, src/accountpage.js, GET /account;
// tools/operator.mjs requests, allow --request, decline --request), on the real local worker, at the platform's root, its emails in the
// local capture. Self-contained: its own emails (s63<tag>…@smoke.local); the line holds s62's requests too, so a place is checked
// against the operator's own list, never as a fixed number. The operator's CLI runs --local on the smoke's own state (as s39 and s40
// run it).
//   · two joins, each verified through its own captured email (the second verified after the first): each lands on /account signed
//     in to its status, its place the operator's (the second the first's + 1), the beta's count the operator's, what comes next
//   · `operator allow --request <the first>`: no code; ONE "You're in" in the capture (sign in, then create your org); the first's
//     status page says its place is open (Create your org), the second moves up one; /orgs/new comes filled in from the request and
//     POST /orgs with the passphrase makes the org, named the company
//   · `allow --request` of the approved one, and of an id that is no request: refused (exit 1), nothing changed, nothing sent
//   · `operator decline --request` of the second: its status page says the request is closed; a second decision refused
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, d1rows as rows, operator as op, betaLine as line, mails, mailFor, linkIn, BASE } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const WALK = 'href="/#walkthrough"';   // the showcase's own section (sprint 21, 21.3: src/walkthrough.js, the one list)
// a request refused by the address's flood filter (LOGIN_LIMIT: shared with /login and /signup) is sent again ONCE after its
// window: that refusal proves nothing about the door behind it
const http = async (method, path, o) => {
  let r = await http0(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many attempts/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http0(method, path, o); }
  return r;
};
const PASS = `smoke-s63-pass-${TAG}`;
const FORM = { web: "1", name: "S63 Grace", role: "Founder", team_size: "11-50", password: PASS, confirm: PASS, consent_terms: "1", consent_keep: "1" };
const cookieOf = (r) => (/__Host-ar_session=([^;]+)/.exec(r.setCookie || "") || [])[1] || "";
// joined(email, company) -> the account session's cookie: the join, its captured email's link, the verification
async function joined(email, company) {
  const a = await http("POST", "/request-access", { form: { ...FORM, email, company }, accept: "text/html" });
  expect(a.status === 303 && a.locationRaw === "/account/sent", () => `the join of ${email}: ${a.status} -> ${a.locationRaw}`);
  const t = linkIn(await mailFor(email, (m) => m.subject === "Verify your email"));
  expect(t, () => `no verification email for ${email}`);
  const v = await http("POST", "/account/verify", { form: { web: "1", token: t, password: PASS }, accept: "text/html" });
  expect(v.status === 303 && v.locationRaw === "/account" && cookieOf(v), () => `the verification of ${email}: ${v.status} -> ${v.locationRaw}`);
  return cookieOf(v);
}
const page = (cookie) => http("GET", "/account", { cookie, accept: "text/html", nav: true });
const placeOf = (p) => Number((/data-request-place>(\d+)</.exec(p.raw) || [])[1] || 0);
const countOf = (p) => (/data-beta-count>([^<]+)</.exec(p.raw) || [])[1] || "";
const words = (l) => (l.taken >= l.cap ? `All ${l.cap} places taken` : `${l.taken} of ${l.cap} places taken`);
const S = {};

smoke("in line · two joins verified in order: each signed in to its status page, its place the operator's (the second the first's + 1), the beta's count the operator's, what comes next, the walkthrough", async () => {
  S.e1 = `s63a${TAG}@smoke.local`; S.e2 = `s63b${TAG}@smoke.local`;
  S.c1 = await joined(S.e1, `S63 First ${TAG}`);
  S.c2 = await joined(S.e2, `S63 Second ${TAG}`);
  S.id1 = (rows(`SELECT id FROM access_requests WHERE email = ${q(S.e1)} AND status = 'open'`)[0] || {}).id;
  S.id2 = (rows(`SELECT id FROM access_requests WHERE email = ${q(S.e2)} AND status = 'open'`)[0] || {}).id;
  const p1 = await page(S.c1), p2 = await page(S.c2), l = await line();
  expect(S.id1 && S.id2 && placeOf(p1) >= 1 && placeOf(p2) === placeOf(p1) + 1 && l.places[S.id1] === placeOf(p1) && l.places[S.id2] === placeOf(p2),
    () => `the places: pages ${placeOf(p1)}, ${placeOf(p2)}; the operator's ${l.places[S.id1]}, ${l.places[S.id2]}`);
  for (const p of [p1, p2]) expect(p.status === 200 && /data-screen="account-in-line"/.test(p.raw) && countOf(p) === words(l) && p.raw.includes(WALK) && /data-region="request-next"/.test(p.raw)
    && /<li data-step="in-line" aria-current="step">/.test(p.raw) && /href="\/logout"[^>]*>Sign out</.test(p.raw), () => `a page: ${p.status}, count "${countOf(p)}" vs the operator's "${words(l)}"`);
  S.place2 = placeOf(p2);
  return `places ${placeOf(p1)} and ${placeOf(p2)}, as the operator lists them; "${words(l)}" on both pages; the track, what comes next, Sign out`;
});

smoke("in line · `operator allow --request` approves the first: no code, ONE \"You're in\" captured; its page says the place is open, the second moves up one; /orgs/new filled in from the request makes the org", async () => {
  expect(S.c1 && S.c2, "the two joins case did not run");
  const a = await op("allow", "--request", S.id1, "--origin", BASE);
  expect(a.rc === 0 && !a.code && /request \S+ approved/.test(a.out) && /"You're in" sent to/.test(a.out), () => `allow --request: rc ${a.rc} ${a.out.slice(0, 300)}`);
  const m = await mailFor(S.e1, (x) => x.subject === "You're in");
  expect(m && m.text.includes(`${BASE}/login`) && m.text.includes(`S63 First ${TAG}`) && !/[0-9A-Z]{5}-[0-9A-Z]{5}/.test(m.text), () => `the email: ${brief(m && { subject: m.subject })}`);
  const row = rows(`SELECT status, approved_at FROM access_requests WHERE id = ${q(S.id1)}`)[0] || {};
  const p1 = await page(S.c1), p2 = await page(S.c2);
  expect(row.status === "approved" && row.approved_at && rows(`SELECT 1 FROM signup_codes WHERE email = ${q(S.e1)}`).length === 0 && /data-screen="account-approved"/.test(p1.raw)
    && /<a class="primary" href="\/orgs\/new"[^>]*>Create your org</.test(p1.raw) && !/data-request-place|data-beta-count/.test(p1.raw), () => `the first: row ${brief(row)}; page ${p1.status}`);
  expect(placeOf(p2) === S.place2 - 1, () => `the second's place: ${placeOf(p2)} (was ${S.place2})`);
  const f = await http("GET", "/orgs/new", { cookie: S.c1, accept: "text/html", nav: true });
  const val = (k) => (new RegExp(`id="${k}"[^>]*value="([^"]*)"`).exec(f.raw) || [])[1];
  expect(f.status === 200 && val("email") === S.e1 && val("name") === `S63 First ${TAG}` && val("you") === FORM.name && val("slug") === `s63-first-${TAG}`,
    () => `/orgs/new: ${f.status}; email ${val("email")}, name ${val("name")}, slug ${val("slug")}, you ${val("you")}`);
  const made = await http("POST", "/orgs", { body: { email: val("email"), password: PASS, name: val("name"), slug: `s63-${TAG}`, you: val("you") } });
  const org = rows(`SELECT name FROM org WHERE slug = ${q(`s63-${TAG}`)}`)[0] || {};
  expect(made.status === 200 && made.json && made.json.key && org.name === `S63 First ${TAG}`, () => `POST /orgs: ${made.status} ${brief(made.json && { ...made.json, key: made.json.key ? "<key>" : undefined })}; org ${brief(org)}`);
  return `approved, no code; "You're in" captured; the first's page says its place is open; the second ${S.place2} -> ${placeOf(p2)}; /orgs/new filled in from the request made the org named the company`;
});

smoke("in line · `allow --request` of the approved request, and of an id that is no request: refused, nothing changed, nothing sent", async () => {
  expect(S.id1, "the two joins case did not run");
  const before = rows(`SELECT status, approved_at, updated_at FROM access_requests WHERE id = ${q(S.id1)}`);
  const n0 = (await mails({ to: S.e1 })).length;
  const again = await op("allow", "--request", S.id1, "--origin", BASE), none = await op("allow", "--request", `00000000-0000-4000-8000-${TAG}000000`, "--origin", BASE);
  expect(again.rc === 1 && /not open/.test(again.out) && none.rc === 1 && /no request/.test(none.out)
    && JSON.stringify(rows(`SELECT status, approved_at, updated_at FROM access_requests WHERE id = ${q(S.id1)}`)) === JSON.stringify(before) && (await mails({ to: S.e1 })).length === n0,
    () => `the refusals: ${again.rc} ${again.out.slice(0, 160)} | ${none.rc} ${none.out.slice(0, 160)}`);
  return "the approved one and a stranger id: exit 1, the request as it was, nothing sent";
});

smoke("in line · `operator decline --request` closes the second: its status page says so with a way on (the walkthrough, the website); a second decision refused", async () => {
  expect(S.id2 && S.c2, "the two joins case did not run");
  const d = await op("decline", "--request", S.id2);
  const row = rows(`SELECT status, approved_at FROM access_requests WHERE id = ${q(S.id2)}`)[0] || {};
  const p = await page(S.c2);
  expect(d.rc === 0 && /request \S+ declined/.test(d.out) && row.status === "declined" && !row.approved_at, () => `decline: rc ${d.rc} ${d.out.slice(0, 200)}; row ${brief(row)}`);
  expect(p.status === 200 && /data-screen="account-closed"/.test(p.raw) && /<a class="primary" href="\/#walkthrough"/.test(p.raw) && /href="https:\/\/www\.sharingu\.xyz\/"/.test(p.raw)
    && !/data-request-place|data-beta-count/.test(p.raw), () => `the declined page: ${p.status}`);
  const again = await op("decline", "--request", S.id2);
  expect(again.rc === 1 && /not open/.test(again.out), () => `the refusal: ${again.rc} ${again.out.slice(0, 160)}`);
  return "declined; its status page says the request is closed, the walkthrough and the website its way on; a second decision refused (exit 1)";
});
