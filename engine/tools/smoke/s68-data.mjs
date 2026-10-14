// tools/smoke/s68-data.mjs — sprint 21, slice 21.4b (THE DATA: the consent, the source, the request -> account -> org path, the
// product step, the operator page, the 90-day clearing; src/requestaccess.js, src/orgprofile.js, src/orgs.js, src/operatorread.js,
// src/operatorpage.js, src/cron.js), walked on the real local worker, every email read from the local capture (never printed).
// Self-contained: its own emails (s68<tag>…@smoke.local); it runs last (registered after s67), because its clearing case runs the
// worker's cron once (GET /__scheduled: tools/smoke.sh starts the worker with R_LOCAL_TEST_SCHEDULED).
//   · Join the beta without a required box: 422, the error on the box, nothing filed, nothing sent; ?from=site rides the form
//   · with both boxes and ?from=site: filed with the four answers, the words' version and its time, source site
//   · the captured verification: the request names its account; the team's alert names the source, never the person
//   · the operator page as org 1's admin: the funnel and the person; Approve and Decline from the page (the captured "You're in"),
//     a cross-site POST refused, nothing changed
//   · sign in -> the org form's product step: nothing answered -> the error on the field, no org; complete -> the org, its profile
//     (one batch) and the request naming the org
//   · the operator page refused to another org's admin and to an org-1 member: the ONE not-here 404, nothing changed
//   · THE CLEARING: dates moved back by SQL, the worker's cron (GET /__scheduled) empties exactly CLEAR_FIELDS of the declined and the
//     abandoned requests, the one that founded its org untouched
import { randomBytes, createHash } from "node:crypto";
import { smoke, expect, brief, http as http0, d1rows as rows, mailFor, linkIn, orgSlug, addPerson, patientFetch, ownerKey, BASE } from "./lib.mjs";
import { CONSENT_VERSION, CLEAR_FIELDS } from "../../src/requestaccess.js";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sha = (s) => createHash("sha256").update(s).digest("hex");
// a request refused by the address's flood filter (LOGIN_LIMIT: shared with /login, /signup and /orgs) is sent again ONCE after its
// window: that refusal proves nothing about the door behind it
const http = async (method, path, o) => {
  let r = await http0(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many attempts/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http0(method, path, o); }
  return r;
};
const PASS = `smoke-s68-pass-${TAG}`;
const FORM = { web: "1", name: "S68 Lin", role: "Head of product", team_size: "11-50", password: PASS, confirm: PASS };
const S = { a: `s68a${TAG}@smoke.local`, b: `s68b${TAG}@smoke.local`, company: `S68 Labs ${TAG}`, slug: `s68-${TAG}` };
const join = (email, extra = {}) => http("POST", "/request-access", { form: { ...FORM, email, company: S.company, ...extra }, accept: "text/html" });
const cookieOf = (r) => (/__Host-ar_session=([^;]+)/.exec(r.setCookie || "") || [])[1] || "";
const reqOf = (email) => rows(`SELECT * FROM access_requests WHERE email = ${q(email)} ORDER BY created_at DESC`)[0] || {};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const at1 = () => `/${orgSlug(1)}/operator`;

smoke("data · Join the beta without a required box: 422, the error on the box itself, nothing filed, nothing sent; ?from=site rides the form", async () => {
  const g = await http("GET", "/request-access?from=site", { accept: "text/html", nav: true });
  expect(g.status === 200 && /<input type="hidden" name="from" value="site">/.test(g.raw) && /name="consent_terms" value="1" required/.test(g.raw) && /name="consent_keep" value="1" required/.test(g.raw)
    && /name="consent_updates" value="1"(?! required)/.test(g.raw) && /href="https:\/\/www\.sharingu\.xyz\/terms\.html"/.test(g.raw) && /href="https:\/\/www\.sharingu\.xyz\/privacy\.html"/.test(g.raw),
    () => `the form: ${g.status}; its source and its four boxes`);
  const r = await join(S.a, { consent_terms: "1", from: "site" });
  expect(r.status === 422 && /<input type="checkbox" id="consent_keep"[^>]*aria-invalid="true" autofocus/.test(r.raw) && /data-field-error="consent_keep"/.test(r.raw) && /name="consent_terms" value="1" required checked/.test(r.raw) && !r.raw.includes(PASS),
    () => `without the second box: ${r.status} ${r.raw.slice(0, 200)}`);
  await sleep(1500);
  expect(rows(`SELECT 1 FROM access_requests WHERE email = ${q(S.a)}`).length === 0 && !(await mailFor(S.a, () => true, { tries: 2 })), "something was filed or sent for a refused join");
  return "422 marked on the box (the first box kept ticked, no passphrase echoed); nothing filed, nothing sent; ?from=site a hidden field";
});

smoke("data · with both boxes and ?from=site: filed with the four answers, the words' version and its time, source site", async () => {
  const r = await join(S.a, { consent_terms: "1", consent_keep: "1", consent_call: "1", from: "site" });
  const row = reqOf(S.a);
  expect(r.status === 303 && row.status === "unverified" && row.consent_version === CONSENT_VERSION && row.consent_at === row.created_at
    && row.consent_terms === 1 && row.consent_keep === 1 && row.consent_updates === 0 && row.consent_call === 1 && row.source === "site",
    () => `the join: ${r.status}; ${brief({ status: row.status, v: row.consent_version, at: row.consent_at === row.created_at, b: [row.consent_terms, row.consent_keep, row.consent_updates, row.consent_call], source: row.source })}`);
  return `303; the row: version ${row.consent_version}, its time the request's, boxes 1/1/0/1, source site`;
});

smoke("data · the captured verification: the request names its account; the team's alert names the source, never the person", async () => {
  const t = linkIn(await mailFor(S.a, (m) => m.subject === "Verify your email"));
  expect(t, "no verification email in the capture");
  const v = await http("POST", "/account/verify", { form: { web: "1", token: t, password: PASS }, accept: "text/html" });
  const row = reqOf(S.a), acc = rows(`SELECT id FROM accounts WHERE email = ${q(S.a)}`)[0] || {};
  expect(v.status === 303 && row.status === "open" && row.account_id === acc.id && row.account_at === row.verified_at, () => `verified ${v.status}; ${brief({ acc: row.account_id === acc.id, at: row.account_at === row.verified_at })}`);
  const team = await mailFor("acie@ryuklabs.io", (m) => m.subject === `New beta request: ${S.company}` && /Source: site/.test(m.text));
  expect(team && !/S68 Lin|s68a/i.test(team.text + team.html + team.subject), () => `the team's alert: ${brief(team && team.subject)}`);
  S.id1 = row.id;
  // the second person, sent by the showcase: joined and verified the same way (the page will decline them)
  await join(S.b, { consent_terms: "1", consent_keep: "1", from: "showcase" });
  const t2 = linkIn(await mailFor(S.b, (m) => m.subject === "Verify your email"));
  await http("POST", "/account/verify", { form: { web: "1", token: t2, password: PASS }, accept: "text/html" });
  S.id2 = reqOf(S.b).id;
  expect(S.id2 && reqOf(S.b).status === "open" && reqOf(S.b).source === "showcase", "the second request was not verified");
  return "the request names its account at its verification's time; the team's alert says Source: site and no name or email; a second, from the showcase, in line";
});

smoke("data · the operator page as org 1's admin: the funnel and the person; Approve and Decline from the page, a cross-site POST refused", async () => {
  const email = (rows(`SELECT email FROM people WHERE org = 1 AND key_hash = ${q(sha(ownerKey))}`)[0] || {}).email;
  const lg = await http("POST", "/login", { body: { email, password: ownerKey, device: "smoke-s68" } });
  S.admin = lg.json && lg.json.token;
  expect(S.admin, () => `org 1's admin's sign-in: ${lg.status}`);
  const p = await http("GET", at1(), { cookie: S.admin, accept: "text/html", nav: true, root: true });
  const tile = (k) => Number((new RegExp(`data-metric="${k}" data-value="(\\d+)"`).exec(p.raw) || [])[1]);
  expect(p.status === 200 && /data-screen="operator"/.test(p.raw) && ["requested", "verified", "approved", "signed-up", "orgs"].every((k) => Number.isInteger(tile(k))) && tile("verified") >= 2
    && p.raw.includes(`data-request="${S.id1}"`) && p.raw.includes(`data-request="${S.id2}"`) && p.raw.includes(S.a) && p.raw.includes(S.company),
    () => `the page: ${p.status}; tiles ${["requested", "verified", "approved", "signed-up", "orgs"].map(tile).join("/")}`);
  // a cross-site POST, as a stranger's page would send it: refused before the body is read
  const before = JSON.stringify(reqOf(S.a));
  const x = await patientFetch(BASE + at1(), { method: "POST", redirect: "manual", headers: { cookie: `__Host-ar_session=${S.admin}`, "content-type": "application/x-www-form-urlencoded", accept: "text/html", "sec-fetch-site": "cross-site", origin: "https://evil.test" },
    body: new URLSearchParams({ action: "approve", request: S.id1 }).toString() });
  await x.text();
  expect(x.status === 403 && JSON.stringify(reqOf(S.a)) === before, () => `the cross-site POST: ${x.status}`);
  const ap = await http("POST", at1(), { cookie: S.admin, form: { action: "approve", request: S.id1 }, accept: "text/html", root: true });
  const inm = await mailFor(S.a, (m) => m.subject === "You're in");
  expect(ap.status === 200 && /data-flash="approved"/.test(ap.raw) && reqOf(S.a).status === "approved" && inm && inm.from.email === "hello@sharingu.xyz", () => `Approve: ${ap.status} ${reqOf(S.a).status}; "You're in" ${!!inm}`);
  const de = await http("POST", at1(), { cookie: S.admin, form: { action: "decline", request: S.id2 }, accept: "text/html", root: true });
  const d = reqOf(S.b);
  expect(de.status === 200 && /data-flash="declined"/.test(de.raw) && d.status === "declined" && d.declined_at, () => `Decline: ${de.status} ${d.status} ${d.declined_at}`);
  return `the funnel (${["requested", "verified", "approved", "signed-up", "orgs"].map(tile).join(" / ")}) and both people; cross-site 403, nothing changed; Approve -> "You're in" captured; Decline -> declined_at`;
});

smoke("data · sign in -> the org form's product step: nothing answered -> the error on the field, no org; complete -> the org, its profile and the request naming it", async () => {
  const s = await http("POST", "/login", { form: { web: "1", email: S.a, password: PASS }, accept: "text/html" });
  S.acct = cookieOf(s);
  const f = await http("GET", "/orgs/new", { cookie: S.acct, accept: "text/html", nav: true });
  expect(f.status === 200 && /data-region="product-step"/.test(f.raw) && /<label class="chip"><input type="checkbox" name="kinds" value="web"/.test(f.raw) && /<label class="chip"><input type="radio" name="stage" value="idea" required/.test(f.raw),
    () => `the org form: ${f.status}`);
  const base = { web: "1", email: S.a, password: PASS, name: S.company, slug: S.slug, you: FORM.name };
  const miss = await http("POST", "/orgs", { cookie: S.acct, form: [...Object.entries(base), ["kinds", "web"]], accept: "text/html" });
  expect(miss.status === 422 && /data-field-error="product"/.test(miss.raw) && /name="kinds" value="web" checked/.test(miss.raw) && !rows(`SELECT 1 FROM org WHERE slug = ${q(S.slug)}`).length,
    () => `nothing answered: ${miss.status}`);
  const made = await http("POST", "/orgs", { cookie: S.acct, accept: "text/html",
    form: [...Object.entries({ ...base, product: "S68 Atlas", line: "One picture of a fleet's work", stage: "launched", first_want: "picture", people: "2-5" }), ["kinds", "web"], ["kinds", "agent"], ["ais", "claude-code"], ["ais", "codex"], ["places", "github"]] });
  S.orgCookie = cookieOf(made);
  const org = rows(`SELECT id, created_at FROM org WHERE slug = ${q(S.slug)}`)[0] || {};
  const prof = rows(`SELECT * FROM org_profile WHERE org = ${Number(org.id) || 0}`)[0] || {};
  const row = reqOf(S.a);
  expect(made.status === 200 && /data-screen="org-made"/.test(made.raw) && org.id && prof.product === "S68 Atlas" && prof.stage === "launched" && prof.kinds === '["web","agent"]' && prof.ais === '["claude-code","codex"]'
    && prof.places === '["github"]' && prof.first_want === "picture" && prof.people === "2-5" && prof.created_at === org.created_at && row.org_id === org.id && row.org_at === org.created_at && S.orgCookie,
    () => `the org: ${made.status} ${org.id}; ${brief(prof)}; the request ${row.org_id}`);
  S.orgId = org.id;
  return `nothing answered 422 on the field, no org; complete -> org ${org.id}, its profile (${prof.stage}, ${prof.kinds}) at the org's own time, the request naming it`;
});

smoke("data · the operator page refused to another org's admin and to an org-1 member: the ONE not-here 404, nothing changed", async () => {
  expect(S.orgCookie && S.id1, "the earlier cases did not run");
  const theirs = await http("GET", `/${S.slug}/operator`, { cookie: S.orgCookie, accept: "text/html", nav: true, root: true });
  const theirsPost = await http("POST", `/${S.slug}/operator`, { cookie: S.orgCookie, form: { action: "decline", request: S.id1 }, accept: "text/html", root: true });
  const atOne = await http("GET", at1(), { cookie: S.orgCookie, accept: "text/html", nav: true, root: true });
  const m = await addPerson("S68 Member", `s68m${TAG}@smoke.local`);
  const mem = await http("GET", at1(), { key: m.key, accept: "text/html", nav: true, root: true });
  const memPost = await http("POST", at1(), { key: m.key, form: { action: "decline", request: S.id1 }, accept: "text/html", root: true });
  // the reference: the answer an address gives a session it does not serve (another org's session at org 1's address: the one not-here)
  const all = [theirs, theirsPost, mem, memPost];
  expect(atOne.status === 404 && all.every((r) => r.status === 404 && r.raw === atOne.raw && !/data-screen="operator"/.test(r.raw)) && reqOf(S.a).status === "approved",
    () => `the refusals: ${all.map((r) => r.status).join("/")}, at org 1's address ${atOne.status}; the request ${reqOf(S.a).status}`);
  return "another org's admin (its own address, its POST) and an org-1 member (GET, POST): 404, the same bytes as the not-here answer an address gives a session it does not serve; nothing changed";
});

smoke("data · THE CLEARING: dates moved back by SQL, the worker's cron empties exactly the planned fields of the declined and the abandoned requests", async () => {
  expect(S.id1 && S.id2, "the earlier cases did not run");
  const old = new Date(Date.now() - 91 * 86400000).toISOString();
  const S3 = `s68c${TAG}@smoke.local`, id3 = `s68c-${TAG}`;
  // the declined one 91 days after its decline; an approved one with no org 91 days after its approval; the founded one's approval as old
  rows(`UPDATE access_requests SET declined_at = ${q(old)} WHERE id = ${q(S.id2)}`);
  rows(`UPDATE access_requests SET approved_at = ${q(old)} WHERE id = ${q(S.id1)}`);
  rows(`INSERT INTO access_requests (id, email, name, company, role, team_size, website, ai_tools, use_case, status, verified_at, approved_at, created_at, updated_at, source, consent_version, consent_at, consent_terms, consent_keep, account_id, account_at) ` +
    `VALUES (${q(id3)}, ${q(S3)}, 'S68 Abandoned', 'S68 Gone Co', 'CTO', '2-10', 'https://gone.example.org/', 'Claude', 'S68 a line', 'approved', ${q(old)}, ${q(old)}, ${q(old)}, ${q(old)}, 'site', ${q(CONSENT_VERSION)}, ${q(old)}, 1, 1, 'acc-gone', ${q(old)})`);
  const before = Object.fromEntries([S.id1, S.id2, id3].map((id) => [id, rows(`SELECT * FROM access_requests WHERE id = ${q(id)}`)[0]]));
  const run = await patientFetch(`${BASE}/__scheduled?cron=${encodeURIComponent("0 3 * * *")}`);
  await run.text();
  let after = {};
  for (let i = 0; i < 20; i++) {
    after = Object.fromEntries([S.id1, S.id2, id3].map((id) => [id, rows(`SELECT * FROM access_requests WHERE id = ${q(id)}`)[0]]));
    if (after[S.id2].cleared_at && after[id3].cleared_at) break;
    await sleep(1000);
  }
  const EMPTY = { name: "", company: "", role: "", website: null, linkedin: null, x: null, github: null, ai_tools: null, use_case: null, account_id: null };
  const exact = (id) => Object.entries(EMPTY).every(([k, v]) => after[id][k] === v) && after[id].email === `cleared:${id}`
    && Object.keys(before[id]).filter((k) => !CLEAR_FIELDS.includes(k) && !["cleared_at", "updated_at"].includes(k)).every((k) => after[id][k] === before[id][k]);
  expect(run.status === 200 && after[S.id2].cleared_at && after[id3].cleared_at && exact(S.id2) && exact(id3) && JSON.stringify(after[S.id1]) === JSON.stringify(before[S.id1]),
    () => `the cron ${run.status}; cleared ${[S.id2, id3].map((id) => !!after[id].cleared_at).join("/")}; exact ${exact(S.id2)}/${exact(id3)}; the founded one untouched ${JSON.stringify(after[S.id1]) === JSON.stringify(before[S.id1])}`);
  return `the cron (${run.status}) cleared the declined and the abandoned request: ${CLEAR_FIELDS.length} fields emptied, status, dates, team size, source and consent kept; the one that founded its org untouched`;
});
