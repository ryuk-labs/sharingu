// tools/smoke/s62-request-access.mjs — sprint 21, slices 21.1 and 21.4a (migrate-081; src/requestaccess.js, POST and GET /request-access),
// on the real local worker, signed out (no key, no cookie), at the platform's root, its emails in the local capture (src/email.js THE
// MAILER: tools/lib-r-local.sh's MAIL_CAPTURE). Self-contained: its own emails (s62<tag>…@smoke.local) and, for the account case, an
// account an earlier case made.
//   · GET /request-access: 200, the form (the required five and the passphrase twice, the optional six, the honeypot); GET /login
//     carries its one link
//   · a full join by form: 303 to /account/sent; ONE unverified row (its email lower-cased), no account; ONE "Verify your email" in
//     the capture with its link
//   · THE SAME ANSWER: an existing account's email ("you already have an account" captured, no link, its passphrase untouched) and
//     the honeypot (nothing filed, nothing sent) answer exactly as the new email did
//   · a bad email and a short passphrase: 422, the form again with the field marked on itself, nothing written; the old private
//     link's paths are gone (a 404)
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, d1rows as rows, mails, mailFor, linkIn } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
// a request refused by the address's flood filter (LOGIN_LIMIT: 20 a minute, shared with /login and /signup, enforced by the local
// worker too) is sent again ONCE after its window: that refusal proves nothing about the door behind it
const http = async (method, path, o) => {
  let r = await http0(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many attempts/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http0(method, path, o); }
  return r;
};
const PASS = `smoke-s62-pass-${TAG}`;
const FULL = { web: "1", name: "S62 Ada", company: `S62 Engines ${TAG}`, role: "Founder", team_size: "2-10", website: "s62.example.org",
  linkedin: "s62-ada", x: "@s62ada", github: "s62-ada", ai_tools: "Claude, Codex", use_case: "S62 one line", password: PASS, confirm: PASS,
  consent_terms: "1", consent_keep: "1" };   // 21.4b: the two required boxes
const ask = (fields) => http("POST", "/request-access", { form: { ...FULL, ...fields }, accept: "text/html" });
// the answer's shape: the status, the Location, the body (none)
const shape = (r) => JSON.stringify([r.status, r.locationRaw, r.raw]);
const reqRows = (email) => rows(`SELECT id, email, company, status FROM access_requests WHERE email = ${q(email)}`);
const S = {};

smoke("request access · GET /request-access is the form (the required five and the passphrase twice, the optional six and two optional consents, the honeypot out of sight); /login links to it", async () => {
  const r = await http("GET", "/request-access", { accept: "text/html" });
  const fields = ["name", "email", "company", "role", "team_size", "password", "confirm", "website", "linkedin", "x", "github", "ai_tools", "use_case", "trap"];
  const missing = fields.filter((f) => !new RegExp(`name="${f}"`).test(r.raw));
  expect(r.status === 200 && /action="\/request-access"/.test(r.raw) && !missing.length && (r.raw.match(/class="opt">optional</g) || []).length === 8   /* the six optional fields and the two optional consent boxes (21.4b) */ && /<div class="trap" aria-hidden="true">/.test(r.raw)
    && /type="password" id="password" name="password" required/.test(r.raw), () => `GET /request-access: ${r.status}, missing ${missing.join(",")}`);
  const l = await http("GET", "/login", { accept: "text/html" });
  expect(l.status === 200 && /<a href="\/request-access"[^>]*>Join the beta<\/a>/.test(l.raw), () => `GET /login: ${l.status}, no Join the beta link`);
  return `the form with ${fields.length} fields; /login links to it`;
});

smoke("request access · a full join: 303 to /account/sent; one unverified row, the email lower-cased, no account; one verification email in the capture", async () => {
  S.email = `s62${TAG}@smoke.local`;
  const r = await ask({ email: `S62${TAG}@Smoke.Local` });
  expect(r.status === 303 && r.locationRaw === "/account/sent", () => `POST /request-access: ${r.status} -> ${r.locationRaw}`);
  const m = await mailFor(S.email, (x) => x.subject === "Verify your email");
  const got = reqRows(S.email);
  expect(got.length === 1 && got[0].status === "unverified" && rows(`SELECT 1 FROM accounts WHERE email = ${q(S.email)}`).length === 0, () => `rows ${brief(got)}`);
  expect(m && m.from && m.from.email === "hello@sharingu.xyz" && linkIn(m) && /\/account\/verify\//.test(m.html), () => `the email: ${brief(m && { to: m.to, subject: m.subject })}`);
  const sent = await http("GET", "/account/sent", { accept: "text/html" });
  expect(sent.status === 200 && /data-screen="account-sent"/.test(sent.raw), () => `GET /account/sent: ${sent.status}`);
  S.first = r;
  return `303 -> /account/sent; one unverified row, no account; "${m.subject}" from hello@sharingu.xyz with its link`;
});

smoke("request access · THE SAME ANSWER: an existing account's email (\"you already have an account\" sent, no link, its passphrase untouched) and the honeypot (nothing filed or sent) answer as the new email did", async () => {
  expect(S.first, "the full join case did not run");
  const acct = rows("SELECT email FROM accounts ORDER BY created_at LIMIT 1")[0];
  expect(acct && acct.email, "no account on this worker (an earlier case makes several)");
  const before = rows(`SELECT pass_hash FROM accounts WHERE email = ${q(acct.email)}`)[0];
  const r = await ask({ email: acct.email });
  const m = await mailFor(acct.email, (x) => x.subject === "You already have a sharingu account");
  expect(shape(r) === shape(S.first) && reqRows(acct.email).every((x) => x.status === "unverified") && m && !linkIn(m) && JSON.stringify(rows(`SELECT pass_hash FROM accounts WHERE email = ${q(acct.email)}`)[0]) === JSON.stringify(before),
    () => `the account's email: ${shape(r)} vs ${shape(S.first)}; rows ${brief(reqRows(acct.email))}; email ${brief(m && m.subject)}`);
  const bot = `s62bot${TAG}@smoke.local`;
  const t = await ask({ email: bot, trap: "https://spam.example.org" });
  await new Promise((ok) => setTimeout(ok, 1500));
  expect(shape(t) === shape(S.first) && reqRows(bot).length === 0 && (await mails({ to: bot })).length === 0, () => `the honeypot: ${shape(t)}; rows ${brief(reqRows(bot))}`);
  return "the same 303 for an account's email (its passphrase untouched, one \"already\" email, no link) and for the honeypot (nothing filed or sent)";
});

smoke("request access · a bad email and a short passphrase are 422, the field marked on itself, nothing written; the old private-link paths are gone", async () => {
  const e = `s62bad${TAG}`;
  const r = await ask({ email: e });
  expect(r.status === 422 && /work email/.test(r.raw) && /<input[^>]*id="email"[^>]*aria-invalid="true"[^>]*autofocus/.test(r.raw) && /data-field-error="email"/.test(r.raw) && rows(`SELECT 1 FROM access_requests WHERE email = ${q(e)}`).length === 0,
    () => `a bad email: ${r.status} ${r.raw.slice(0, 160)}`);
  const sp = await ask({ email: `s62short${TAG}@smoke.local`, password: "short", confirm: "short" });
  expect(sp.status === 422 && /data-field-error="password"/.test(sp.raw) && !sp.raw.includes(PASS), () => `a short passphrase: ${sp.status}`);
  const j = await http("POST", "/request-access", { body: { ...FULL, web: undefined, email: e } });   // a script: no form marker
  expect(j.status === 422 && j.json && j.json.error === "bad_request_access" && j.json.field === "email", () => `JSON: ${j.status} ${brief(j.json)}`);
  const old = [await http("GET", `/request-access/${"0".repeat(48)}`, { accept: "text/html" }), await http("GET", "/request-access/check", { accept: "text/html" })];
  expect(old.every((x) => x.status === 404), () => `the old private-link paths: ${old.map((x) => x.status).join("/")}`);
  return "422 (form and JSON, field email; a short passphrase, never echoed); the old private-link paths 404";
});
