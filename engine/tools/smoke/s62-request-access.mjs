// tools/smoke/s62-request-access.mjs — sprint 21, slice 21.1 (migrate-081; src/requestaccess.js, POST and GET /request-access,
// GET /request-access/<token>), on the real local worker, signed out (no key, no cookie), at the platform's root. Self-contained:
// its own emails (s62<tag>…@smoke.local) and, for the account case, an account an earlier case made.
//   · GET /request-access: 200, the form (the required five, the optional six, the honeypot); GET /login carries its one link
//   · a full profile by form: 303 to /request-access/<48 hex>, which is 200 naming the company; one open row, its email lower-cased
//   · a repeat for the same email (another case, another company): the first request stands — a 303 to /request-access/asked,
//     200 as the asked page, without the second company; still one row with the first profile; the first link still 200
//     naming the first company
//   · an existing account's email: the same answer's shape
//   · the honeypot filled: the same answer's shape, no row
//   · a bad email: 422, the form again with the field marked on itself, nothing written; a wrong token: the 404
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, d1rows as rows } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
// a request refused by the address's flood filter (LOGIN_LIMIT: 20 a minute, shared with /login and /signup, enforced by the local
// worker too) is sent again ONCE after its window: that refusal proves nothing about the door behind it
const http = async (method, path, o) => {
  let r = await http0(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many attempts/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http0(method, path, o); }
  return r;
};
const FULL = { web: "1", name: "S62 Ada", company: `S62 Engines ${TAG}`, role: "Founder", team_size: "2-10", website: "s62.example.org",
  linkedin: "s62-ada", x: "@s62ada", github: "s62-ada", ai_tools: "Claude, Codex", use_case: "S62 one line" };
const ask = (fields) => http("POST", "/request-access", { form: { ...FULL, ...fields }, accept: "text/html" });
const tokenOf = (r) => (/^\/request-access\/([0-9a-f]{48})$/.exec(r.locationRaw) || [])[1] || null;
// the answer's shape: the status, the Location with its token taken out, the body (none)
const shape = (r) => JSON.stringify([r.status, r.locationRaw.replace(/[0-9a-f]{48}$/, "<token>"), r.raw]);
const reqRows = (email) => rows(`SELECT id, email, company, created_at, status FROM access_requests WHERE email = ${q(email)}`);
const S = {};

smoke("request access · GET /request-access is the form (the required five, the optional six, the honeypot out of sight); /login links to it", async () => {
  const r = await http("GET", "/request-access", { accept: "text/html" });
  const fields = ["name", "email", "company", "role", "team_size", "website", "linkedin", "x", "github", "ai_tools", "use_case", "trap"];
  const missing = fields.filter((f) => !new RegExp(`name="${f}"`).test(r.raw));
  expect(r.status === 200 && /action="\/request-access"/.test(r.raw) && !missing.length && (r.raw.match(/class="opt">optional</g) || []).length === 6 && /<div class="trap" aria-hidden="true">/.test(r.raw),
    () => `GET /request-access: ${r.status}, missing ${missing.join(",")}`);
  const l = await http("GET", "/login", { accept: "text/html" });
  expect(l.status === 200 && /<a href="\/request-access"[^>]*>Join the beta<\/a>/.test(l.raw), () => `GET /login: ${l.status}, no Join the beta link`);
  return `the form with ${fields.length} fields; /login links to it`;
});

smoke("request access · a full profile: 303 to its private link, which names the company; one open row, the email lower-cased", async () => {
  S.email = `s62${TAG}@smoke.local`;
  const r = await ask({ email: `S62${TAG}@Smoke.Local` });
  const t = tokenOf(r);
  expect(r.status === 303 && t, () => `POST /request-access: ${r.status} -> ${r.locationRaw}`);
  const page = await http("GET", `/request-access/${t}`, { accept: "text/html" });
  const got = reqRows(S.email);
  expect(page.status === 200 && page.raw.includes(`S62 Engines ${TAG}`) && got.length === 1 && got[0].status === "open",
    () => `the link: ${page.status}; rows ${brief(got)}`);
  Object.assign(S, { first: r, token: t, row: got[0] });
  return `303 -> /request-access/<token>; the page names the company; one open row`;
});

smoke("request access · a repeat for the same email: the first request stands — a 303 to the asked page (the asked page, not the second company), one row with the first profile, the first link still naming the first company", async () => {
  expect(S.first, "the full request case did not run");
  const r = await ask({ email: S.email.toUpperCase(), company: `S62 Difference ${TAG}` });
  const asked = await http("GET", r.locationRaw || "/request-access/asked", { accept: "text/html" });
  const got = reqRows(S.email);
  const first = await http("GET", `/request-access/${S.token}`, { accept: "text/html" });
  expect(r.status === 303 && r.locationRaw === "/request-access/asked" && asked.status === 200
    && /data-screen="request-asked"/.test(asked.raw) && !asked.raw.includes(`S62 Difference ${TAG}`),
    () => `the repeat: ${r.status} -> ${r.locationRaw}; the asked page ${asked.status}`);
  expect(got.length === 1 && got[0].id === S.row.id && got[0].created_at === S.row.created_at && got[0].company === `S62 Engines ${TAG}`, () => `rows ${brief(got)}`);
  expect(first.status === 200 && first.raw.includes(`S62 Engines ${TAG}`) && !first.raw.includes(`S62 Difference ${TAG}`), () => `the first link: ${first.status}`);
  return `303 -> /request-access/asked (200, the asked page, no second company); one row, the first profile; the first link 200`;
});

smoke("request access · an existing account's email: the same answer as a new email", async () => {
  expect(S.first, "the full request case did not run");
  const acct = rows("SELECT email FROM accounts ORDER BY created_at LIMIT 1")[0];
  expect(acct && acct.email, "no account on this worker (an earlier case makes several)");
  const r = await ask({ email: acct.email });
  expect(shape(r) === shape(S.first) && tokenOf(r), () => `the account's email: ${shape(r)} vs ${shape(S.first)}`);
  return `the same 303 for an account's email`;
});

smoke("request access · the honeypot filled: the same answer, no row", async () => {
  expect(S.first, "the full request case did not run");
  const e = `s62bot${TAG}@smoke.local`;
  const r = await ask({ email: e, trap: "https://spam.example.org" });
  expect(shape(r) === shape(S.first) && reqRows(e).length === 0, () => `the honeypot: ${shape(r)}; rows ${brief(reqRows(e))}`);
  return `the same 303, nothing written`;
});

smoke("request access · a bad email is 422, the field marked on itself, nothing written; a wrong token is the 404", async () => {
  const e = `s62bad${TAG}`;
  const r = await ask({ email: e });
  expect(r.status === 422 && /work email/.test(r.raw) && /data-screen="request-access"/.test(r.raw) && /<input[^>]*id="email"[^>]*aria-invalid="true"[^>]*autofocus/.test(r.raw) && /data-field-error="email"/.test(r.raw) && rows(`SELECT 1 FROM access_requests WHERE email = ${q(e)}`).length === 0,
    () => `a bad email: ${r.status} ${r.raw.slice(0, 160)}`);
  const j = await http("POST", "/request-access", { body: { ...FULL, web: undefined, email: e } });   // a script: no form marker
  expect(j.status === 422 && j.json && j.json.error === "bad_request_access" && j.json.field === "email", () => `JSON: ${j.status} ${brief(j.json)}`);
  const w = await http("GET", `/request-access/${"0".repeat(48)}`, { accept: "text/html" });
  expect(w.status === 404 && /data-screen="request-missing"/.test(w.raw), () => `a wrong token: ${w.status}`);
  return `422 (form and JSON, field email); a wrong token 404`;
});
