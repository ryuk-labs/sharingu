// tools/smoke/s63-in-line.mjs — sprint 21, slice 21.2 (src/requestaccess.js placeInLine, src/requestpage.js, GET
// /request-access/<token> and /request-access/asked; tools/operator.mjs requests and allow --request), on the real local worker,
// signed out, at the platform's root. Self-contained: its own emails (s63<tag>…@smoke.local); the line holds s62's open requests
// too, so a place is checked against the operator's own list, never as a fixed number. The operator's CLI runs --local on the
// smoke's own state (as s39 and s40 run it); the code it prints is held in memory, never printed.
//   · two requests in order: the second's place is the first's + 1, each the place `operator requests` lists for its id; each
//     page says "N of 50 places taken" equal to the count at the head of `operator requests`, what comes next and the walkthrough
//   · `operator allow --request <the first>`: the code printed once, the request approved — its page says the place is open (the
//     way to /signup, no place, no count) and the second's place moves up by one; a web sign-up with that code answers the org
//     form holding the request's company and name, and POST /orgs with them makes the org, named the company
//   · the asked page (a repeat of the second's email): the count and the walkthrough, nothing the request typed
//   · `allow --request` of the approved one, and of an id that is no request: refused (exit 1), no code, the request as it was
//   · (21.P) the open page's track lit at in line and its own address kept with Copy link; `operator decline --request` of the
//     second: its page says the request is closed (the walkthrough, the website), no place, no count; a second decision of it, or
//     a decline of the approved one, refused
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, d1rows as rows, operator as op, betaLine as line, BASE } from "./lib.mjs";

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
const FORM = { web: "1", name: "S63 Grace", role: "Founder", team_size: "11-50" };
const ask = (email, company) => http("POST", "/request-access", { form: { ...FORM, email, company }, accept: "text/html" });
const tokenOf = (r) => (/^\/request-access\/([0-9a-f]{48})$/.exec(r.locationRaw) || [])[1] || null;
const page = (token) => http("GET", `/request-access/${token}`, { accept: "text/html" });
const placeOf = (p) => Number((/data-request-place>(\d+)</.exec(p.raw) || [])[1] || 0);
const countOf = (p) => (/data-beta-count>([^<]+)</.exec(p.raw) || [])[1] || "";
const words = (l) => (l.taken >= l.cap ? `All ${l.cap} places taken` : `${l.taken} of ${l.cap} places taken`);
const S = {};

smoke("in line · two requests in order: the second's place is the first's + 1, each as `operator requests` lists it; each page the beta's count the operator says, what comes next, the walkthrough", async () => {
  S.e1 = `s63a${TAG}@smoke.local`; S.e2 = `s63b${TAG}@smoke.local`; S.pass = `smoke-s63-pass-${TAG}`;
  // apart in time (two at one millisecond would be ordered by id, which the selftest proves): the second comes after the first
  const a = await ask(S.e1, `S63 First ${TAG}`);
  await new Promise((ok) => setTimeout(ok, 5));
  const b = await ask(S.e2, `S63 Second ${TAG}`);
  S.t1 = tokenOf(a); S.t2 = tokenOf(b);
  expect(a.status === 303 && S.t1 && b.status === 303 && S.t2, () => `the requests: ${a.status} -> ${a.locationRaw}; ${b.status} -> ${b.locationRaw}`);
  S.id1 = (rows(`SELECT id FROM access_requests WHERE email = ${q(S.e1)} AND status = 'open'`)[0] || {}).id;
  S.id2 = (rows(`SELECT id FROM access_requests WHERE email = ${q(S.e2)} AND status = 'open'`)[0] || {}).id;
  const p1 = await page(S.t1), p2 = await page(S.t2), l = await line();
  expect(S.id1 && S.id2 && placeOf(p1) >= 1 && placeOf(p2) === placeOf(p1) + 1 && l.places[S.id1] === placeOf(p1) && l.places[S.id2] === placeOf(p2),
    () => `the places: pages ${placeOf(p1)}, ${placeOf(p2)}; the operator's ${l.places[S.id1]}, ${l.places[S.id2]}`);
  for (const p of [p1, p2]) expect(p.status === 200 && /data-screen="request-in-line"/.test(p.raw) && countOf(p) === words(l) && p.raw.includes(WALK) && /data-region="request-next"/.test(p.raw),
    () => `a page: ${p.status}, count "${countOf(p)}" vs the operator's "${words(l)}"`);
  // 21.P: the track lit at in line, and the page's own address kept with Copy link (the request's origin and path)
  expect(/<li data-step="in-line" aria-current="step">/.test(p1.raw) && p1.raw.includes(`id="keep-url" readonly value="${BASE}/request-access/${S.t1}"`) && /data-copy-link hidden>Copy link</.test(p1.raw),
    () => `the track or the kept address: ${(/<ol class="track"[\s\S]*?<\/ol>/.exec(p1.raw) || [""])[0].slice(0, 200)} ${(/id="keep-url"[^>]*>/.exec(p1.raw) || ["no keep-url"])[0]}`);
  S.place2 = placeOf(p2);
  return `places ${placeOf(p1)} and ${placeOf(p2)}, as the operator lists them; "${words(l)}" on both pages; what comes next and the walkthrough`;
});

smoke("in line · `operator allow --request` approves the first: the code once, its page says the place is open, the second moves up one; the web sign-up answers the org form filled in from the request, which makes the org", async () => {
  expect(S.t1 && S.t2, "the two requests case did not run");
  const a = await op("allow", "--request", S.id1);
  expect(a.rc === 0 && a.code && (a.out.match(/ {2}code: /g) || []).length === 1 && /request \S+ approved/.test(a.out), () => `allow --request: rc ${a.rc} ${a.out.slice(0, 300)}`);
  const row = rows(`SELECT status, approved_at FROM access_requests WHERE id = ${q(S.id1)}`)[0] || {};
  const p1 = await page(S.t1), p2 = await page(S.t2);
  expect(row.status === "approved" && row.approved_at && p1.status === 200 && /data-screen="request-approved"/.test(p1.raw) && /Your place is open/.test(p1.raw) && /href="\/signup"/.test(p1.raw)
    && !/data-request-place|data-beta-count/.test(p1.raw), () => `the first: row ${brief(row)}; page ${p1.status}`);
  expect(placeOf(p2) === S.place2 - 1, () => `the second's place: ${placeOf(p2)} (was ${S.place2})`);
  // the web sign-up (sprint 21, 21.2: "prefills the org at sign-up"): 200 with the org form, the company and the name in it
  const su = await http("POST", "/signup", { form: { email: S.e1, code: a.code, password: S.pass, confirm: S.pass, web: "1" }, accept: "text/html" });
  const val = (f) => (new RegExp(`id="${f}"[^>]*value="([^"]*)"`).exec(su.raw) || [])[1];
  expect(su.status === 200 && /data-screen="org-new"/.test(su.raw) && val("email") === S.e1 && val("name") === `S63 First ${TAG}` && val("you") === FORM.name && val("slug") === `s63-first-${TAG}` && !su.raw.includes(S.pass),
    () => `the sign-up: ${su.status} -> ${su.locationRaw}; email ${val("email")}, name ${val("name")}, slug ${val("slug")} (21.P: suggested from the company), you ${val("you")}`);
  // the form as the person sends it, the slug and the passphrase theirs to type
  const made = await http("POST", "/orgs", { body: { email: val("email"), password: S.pass, name: val("name"), slug: `s63-${TAG}`, you: val("you") } });
  const org = rows(`SELECT name FROM org WHERE slug = ${q(`s63-${TAG}`)}`)[0] || {};
  expect(made.status === 200 && made.json && made.json.key && org.name === `S63 First ${TAG}`, () => `POST /orgs: ${made.status} ${brief(made.json && { ...made.json, key: made.json.key ? "<key>" : undefined })}; org ${brief(org)}`);
  return `approved; the first's page says its place is open; the second ${S.place2} -> ${placeOf(p2)}; the web sign-up answered the org form with the company, its suggested address and the name, and the org was made named the company`;
});

smoke("in line · the asked page (a repeat of the second's email): the beta's count and the walkthrough, nothing typed", async () => {
  expect(S.t2, "the two requests case did not run");
  const r = await ask(S.e2, `S63 Repeat ${TAG}`);
  const asked = await http("GET", r.locationRaw || "/request-access/asked", { accept: "text/html" });
  const l = await line();
  expect(r.status === 303 && r.locationRaw === "/request-access/asked" && asked.status === 200 && countOf(asked) === words(l) && asked.raw.includes(WALK)
    && !asked.raw.includes(`S63 Repeat ${TAG}`) && !asked.raw.includes("S63 Grace"), () => `the asked page: ${r.status} -> ${r.locationRaw}; ${asked.status}, count "${countOf(asked)}" vs "${words(l)}"`);
  return `303 -> /request-access/asked: "${countOf(asked)}" and the walkthrough`;
});

smoke("in line · `allow --request` of the approved request, and of an id that is no request: refused, no code, nothing changed", async () => {
  expect(S.id1, "the two requests case did not run");
  const before = rows(`SELECT status, approved_at, updated_at FROM access_requests WHERE id = ${q(S.id1)}`);
  const codes = rows(`SELECT COUNT(*) AS n FROM signup_codes WHERE email = ${q(S.e1)}`)[0].n;
  const again = await op("allow", "--request", S.id1), none = await op("allow", "--request", `00000000-0000-4000-8000-${TAG}000000`);
  expect(again.rc === 1 && !again.code && /not open/.test(again.out) && none.rc === 1 && !none.code && /no request/.test(none.out)
    && JSON.stringify(rows(`SELECT status, approved_at, updated_at FROM access_requests WHERE id = ${q(S.id1)}`)) === JSON.stringify(before)
    && rows(`SELECT COUNT(*) AS n FROM signup_codes WHERE email = ${q(S.e1)}`)[0].n === codes, () => `the refusals: ${again.rc} ${again.out.slice(0, 160)} | ${none.rc} ${none.out.slice(0, 160)}`);
  return `the approved one and a stranger id: exit 1, no code, the request as it was`;
});

smoke("in line · `operator decline --request` closes the second: its page says so with a way on (the walkthrough, the website); the declined one and the approved one refused a second decision", async () => {
  expect(S.id1 && S.id2 && S.t2, "the two requests case did not run");
  const d = await op("decline", "--request", S.id2);
  const row = rows(`SELECT status, approved_at FROM access_requests WHERE id = ${q(S.id2)}`)[0] || {};
  const p = await page(S.t2);
  expect(d.rc === 0 && /request \S+ declined/.test(d.out) && !/code: /.test(d.out) && row.status === "declined" && !row.approved_at, () => `decline: rc ${d.rc} ${d.out.slice(0, 200)}; row ${brief(row)}`);
  expect(p.status === 200 && /data-screen="request-declined"/.test(p.raw) && /<a class="primary" href="\/#walkthrough"/.test(p.raw) && /href="https:\/\/www\.sharingu\.xyz\/"/.test(p.raw)
    && !/data-request-place|data-beta-count/.test(p.raw) && !p.raw.includes(`S63 Second ${TAG}`), () => `the declined page: ${p.status}`);
  const again = await op("decline", "--request", S.id2), approved = await op("decline", "--request", S.id1);
  expect(again.rc === 1 && /not open/.test(again.out) && approved.rc === 1 && /not open/.test(approved.out) && rows(`SELECT status FROM access_requests WHERE id = ${q(S.id1)}`)[0].status === "approved",
    () => `the refusals: ${again.rc} ${again.out.slice(0, 160)} | ${approved.rc} ${approved.out.slice(0, 160)}`);
  return "declined; its page says the request is closed, the walkthrough and the website its way on; a second decision refused (exit 1)";
});
