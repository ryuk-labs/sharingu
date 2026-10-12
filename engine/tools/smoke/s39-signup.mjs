// tools/smoke/s39-signup.mjs — sprint 7, 7.2 (docs/plan/PLATFORM.md §2 items 8 and 10; migrate-071; src/accounts.js signUp,
// POST /signup; tools/operator.mjs): sign-up by allowlist on the real local worker. The operator's tool runs as the operator runs
// it (its CLI, --local on the smoke's own state); the code it prints is read from its output, held in memory, and never printed
// here. Runs after s38 (it seeds an org of its own, the next free id, for the reset's second seat).
//   · (a) an allowed email and its code: an account with that passphrase; no seat here, so nothing signed in; the operator's
//     list says used (created) and shows no code
//   · (b) a migrated org-1 person (an account with no passphrase, as Control's add-person makes it): the sign-up sets it and
//     signs them in to their org-1 seat; then /login with it lands on that seat
//   · (c) the reset (allowed only with --reset): every session of the account ends, its org-1 seat's and its other org's seat's;
//     the other org's seat waits for its holder's yes, so (the owner's ruling, 2026-10-09) the JSON sign-up signs in nothing
//     and says a seat waits, and the JSON sign-ins name org 1
//   · a wrong code, a reused code, an expired code, a revoked code, an email never allowed: one answer (401 invalid_signup),
//     nothing written but the attempt; and 8 wrong codes lock the email (a 9th wrong code then 429, still open), while its right
//     code still signs up (sprint 8, 8.3a: a valid code bypasses the email's bucket)
//   · the pages: GET /signup (the form) and its done page
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, ownerKey, sha, d1rows as rows, orgSlug } from "./lib.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TAG = randomBytes(3).toString("hex");
const T = () => new Date().toISOString();
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
// http(...) — the door, retried once when the socket itself failed (this case reads the local D1 synchronously between calls:
// the s37 scar)
const http1 = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
// ...and a sign-up or sign-in refused by the address's flood filter (LOGIN_LIMIT: 20 a minute for /login and /signup together,
// enforced by the local worker too; s38 spends it just before) is sent again ONCE after its window: that refusal proves nothing
// about the door behind it
const http = async (method, path, o) => {
  let r = await http1(method, path, o);
  if (r.status === 429 && r.json && r.json.error === "too_many_attempts_ip") { await new Promise((ok) => setTimeout(ok, 61000)); r = await http1(method, path, o); }
  return r;
};
// op(...args) -> { rc, out, code }: the operator's CLI on the smoke's own local state; `code` is the one it printed (allow), kept
// in memory only
async function op(...args) {
  const { SMOKE_D1_PERSIST: persist, SMOKE_D1_CFG: cfg } = process.env;
  expect(persist && cfg, "SMOKE_D1_PERSIST and SMOKE_D1_CFG (tools/smoke.sh sets both)");
  const { rc, out } = await new Promise((done) => execFile("node", [join(ENGINE, "tools", "operator.mjs"), ...args, "--local", persist, "--config", cfg], { encoding: "utf8", maxBuffer: 1 << 24 },
    (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: `${stdout || ""}${stderr || ""}` })));
  const code = (out.match(/^ {2}code: (\S+)$/m) || [])[1] || null;
  // the answer kept for a failure message never carries the code
  return { rc, code, out: code ? out.split(code).join("<code>") : out };
}
const allow = async (email, ...more) => { const r = await op("allow", "--email", email, ...more); expect(r.rc === 0 && r.code, () => `operator allow ${email}: rc ${r.rc} ${r.out.slice(0, 300)}`); return r.code; };
const signup = (email, code, password, extra = {}) => http("POST", "/signup", { body: { email, code, password, device: "smoke-s39", ...extra } });
const login = async (email, password, org) => { const r = await http("POST", "/login", { body: { email, password, device: "smoke-s39", ...(org ? { org } : {}) } }); return { status: r.status, error: r.json && r.json.error, token: r.json && r.json.token }; };
const settle = () => new Promise((r) => setTimeout(r, 20));
const A = {};

smoke("signup · (a) an allowed email and its operator's code: an account with that passphrase, nothing signed in (no seat here); the operator's list says used (created), never a code", async () => {
  const e = `signup-a-${TAG}@smoke.local`;
  const code = await allow(e);
  const r = await signup(e, code, "smoke-new-pass-a");
  await settle();
  const acc = rows(`SELECT pass_hash FROM accounts WHERE email = ${q(e)}`), c = rows(`SELECT used_how, used_at, code_hash FROM signup_codes WHERE email = ${q(e)}`);
  expect(r.status === 200 && r.json.account === "created" && r.json.signedIn === false && !r.json.token && acc.length === 1 && acc[0].pass_hash && c.length === 1 && c[0].used_how === "created",
    () => `the sign-up: ${r.status} ${brief(r.json)}; account ${brief(acc)}; code ${brief(c.map((x) => x.used_how))}`);
  A.a = { email: e, code };   // the spent code, in memory: the refusals' reused code
  const l = await login(e, "smoke-new-pass-a");
  const list = await op("list", "--email", e, "--json");
  let j = null; try { j = JSON.parse(list.out); } catch { j = null; }
  expect(l.status === 403 && l.error === "no_seat_here" && list.rc === 0 && j && j.allowed[0].state === "used" && j.allowed[0].how === "created" && !list.out.includes(c[0].code_hash),
    () => `after: /login ${l.status} ${l.error}; list ${list.rc} ${list.out.slice(0, 200)}`);
  return `operator allow -> a code (held in memory); POST /signup -> 200 created, signedIn false; the new passphrase at /login -> 403 no_seat_here; list: used (created), no code or hash`;
});

smoke("signup · (b) a migrated org-1 person with no account passphrase sets it with the code, is signed in to their org-1 seat, and /login with it lands there", async () => {
  const e = `signup-b-${TAG}@smoke.local`;
  const add = await http("POST", "/control", { key: ownerKey, form: { action: "add-person", name: `Signup B ${TAG}`, email: e } });
  const seatKey = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  const seat = seatKey ? (rows(`SELECT id, org FROM people WHERE key_hash = ${q(sha(seatKey))}`)[0] || {}) : {};
  const before = rows(`SELECT id, pass_hash FROM accounts WHERE email = ${q(e)}`)[0] || {};
  expect(seat.id && seat.org === 1 && before.id && before.pass_hash === null, () => `the org-1 person: seat ${brief(seat)}, account ${brief(before)}`);
  const code = await allow(e);
  const r = await signup(e, code, "smoke-own-pass-b");
  const who = r.json && r.json.token ? (await http("GET", "/whoami", { key: r.json.token })).json || {} : {};
  expect(r.status === 200 && r.json.account === "set" && r.json.signedIn === true && who.id === seat.id, () => `the sign-up: ${r.status} ${brief({ ...r.json, token: r.json && r.json.token ? "<token>" : null })}; whoami ${who.id || "none"}`);
  const l = await login(e, "smoke-own-pass-b");
  const lw = l.token ? (await http("GET", "/whoami", { key: l.token })).json || {} : {};
  await settle();
  const org = lw.id ? (rows(`SELECT org FROM people WHERE id = ${q(lw.id)}`)[0] || {}).org : null;
  expect(l.status === 200 && lw.id === seat.id && org === 1, () => `/login with the new passphrase: ${l.status} as ${lw.id || "none"} (org ${org})`);
  A.b = { email: e, seat: seat.id, pass: "smoke-own-pass-b" };
  return `add-person made the account with no passphrase; the code set it (account set) and signed them in to their org-1 seat; /login with it -> 200 as that seat (org 1)`;
});

smoke("signup · (c) the operator-approved reset (allow --reset; refused without): the account takes the new passphrase and its sessions end in BOTH orgs", async () => {
  expect(A.b, "the (b) case did not run");
  // a second org of this case's own (the next free id), its owner by key, and the person's seat there with a live session
  const at = T(), n = rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n, key = randomBytes(20).toString("hex");
  rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${n}, 'Signup org', ${q(at)}, ${q(at)}, 'local')`);
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('signup-owner-${n}', 'Signup Owner', ${q(`owner@org${n}.local`)}, 'owner', ${q(sha(key))}, 1, ${q(at)}, ${n})`);
  const add = await http("POST", "/control", { key, form: { action: "add-person", name: `Signup B elsewhere ${TAG}`, email: A.b.email } });
  const k2 = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  const seat2 = k2 ? (rows(`SELECT id, org FROM people WHERE key_hash = ${q(sha(k2))}`)[0] || {}) : {};
  rows(`INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, org) VALUES (${q(sha(`s39-${TAG}`))}, ${q(seat2.id)}, 'smoke-s39 org ${n}', ${q(at)}, ${q(new Date(Date.now() + 86400000).toISOString())}, 0, ${n})`);
  // the account holds its passphrase ((b)), so this seat WAITS for its holder's yes: a JSON sign-in names its org (the owner's ruling)
  const one = await login(A.b.email, A.b.pass, orgSlug(1));
  await settle();
  const ids = [A.b.seat, seat2.id].map(q).join(", ");
  const liveOf = () => rows(`SELECT org, COUNT(*) AS n FROM tokens WHERE revoked = 0 AND person_id IN (${ids}) GROUP BY org ORDER BY org`);
  const before = liveOf();
  expect(seat2.org === n && one.status === 200 && before.length === 2 && before.every((x) => x.n >= 1), () => `the instrument: seat in org ${n} ${brief(seat2)}, an org-1 sign-in ${one.status}, live sessions ${brief(before)}`);
  const plain = await op("allow", "--email", A.b.email);
  expect(plain.rc === 1 && !plain.code && /--reset/.test(plain.out), () => `allow without --reset for an account with a passphrase: rc ${plain.rc} ${plain.out.slice(0, 200)}`);
  const code = await allow(A.b.email, "--reset");
  const r = await signup(A.b.email, code, "smoke-reset-pass-c");
  await settle();
  const after = rows(`SELECT org, SUM(revoked = 0) AS live, SUM(revoked = 1) AS ended FROM tokens WHERE person_id IN (${ids}) GROUP BY org ORDER BY org`);
  const o1 = after.find((x) => x.org === 1) || {}, oN = after.find((x) => x.org === n) || {};
  // a seat waits: the JSON sign-up signs in nothing (the owner's ruling, 2026-10-09), so every session of BOTH orgs ends and none is new
  expect(r.status === 200 && r.json.account === "reset" && r.json.signedIn === false && !r.json.token && /waits for your yes/.test(r.json.note || "") && o1.live === 0 && o1.ended >= 2 && oN.live === 0 && oN.ended === 1,
    () => `the reset: ${r.status} ${r.json && r.json.account}; sessions ${brief(after)}`);
  const old = await login(A.b.email, A.b.pass, orgSlug(1)), neu = await login(A.b.email, "smoke-reset-pass-c", orgSlug(1));
  expect(old.status === 401 && neu.status === 200, () => `the old passphrase ${old.status}, the new one ${neu.status}`);
  return `allow without --reset refused (rc 1); with it, the sign-up resets the account: org 1's sessions ended and org ${n}'s ended, none minted (a seat waits: signed in to nothing); naming org 1, old passphrase 401, new 200`;
});

smoke("signup · a wrong, a reused, an expired and a revoked code, and an email never allowed: ONE answer (401 invalid_signup), nothing written but the attempt; 8 wrong codes lock the email", async () => {
  expect(A.a, "the (a) case did not run");
  const e = `signup-d-${TAG}@smoke.local`, x = `signup-x-${TAG}@smoke.local`, v = `signup-v-${TAG}@smoke.local`;
  const right = await allow(e);
  const exp = await allow(x);
  rows(`UPDATE signup_codes SET expires_at = ${q(new Date(Date.now() - 1000).toISOString())} WHERE email = ${q(x)} AND used_at IS NULL`);
  const rv = await allow(v);
  const gone = await op("revoke", "--email", v);
  expect(gone.rc === 0, () => `operator revoke: ${gone.rc} ${gone.out.slice(0, 200)}`);
  const snap = () => JSON.stringify(rows("SELECT (SELECT json_group_array(json_array(id, pass_hash)) FROM accounts) AS a, (SELECT json_group_array(json_array(id, used_at, revoked_at, spent_by)) FROM signup_codes) AS c, " +
    "(SELECT COUNT(*) || ':' || SUM(revoked) FROM tokens) AS t, (SELECT COUNT(*) FROM people) AS p"));
  const fails = () => rows("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0")[0].n;
  const tries = [["a wrong code", e, "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ"], ["a reused code", A.a.email, A.a.code], ["an expired code", x, exp], ["a revoked code", v, rv],
    ["an email never allowed", `signup-never-${TAG}@smoke.local`, right], ["another email's code", x, right]];
  const s0 = snap(), f0 = fails(), bodies = new Set(), seen = [];
  for (const [what, email, code] of tries) { const r = await signup(email, code, "smoke-guess-pass"); bodies.add(`${r.status} ${r.text}`); seen.push(`${what} ${r.status} ${r.json && r.json.error}`); }
  await settle();
  const f1 = fails();
  expect(bodies.size === 1 && [...bodies][0].startsWith("401 ") && snap() === s0 && f1 === f0 + tries.length, () => `${seen.join("; ")}; ${bodies.size} distinct answers; rows ${snap() === s0 ? "unchanged" : "CHANGED"}; attempts +${f1 - f0}`);
  // the lockout: 8 wrong codes on the allowed email lock it (a 9th wrong code: 429); its RIGHT code still signs up (sprint 8, 8.3a,
  // the sprint-7 review's A3: a valid code, the operator's possession proof of the email, bypasses the email's bucket)
  for (let i = 0; i < 8; i++) await signup(e, `WRONG-${String(i).padStart(5, "0")}-ZZZZZ-ZZZZZ`, "smoke-guess-pass");
  const locked = await signup(e, "WRONG-00009-ZZZZZ-ZZZZZ", "smoke-guess-pass");
  await settle();
  const open = rows(`SELECT used_at FROM signup_codes WHERE email = ${q(e)}`);
  const passed = await signup(e, right, "smoke-guess-pass");
  await settle();
  const still = rows(`SELECT used_at FROM signup_codes WHERE email = ${q(e)}`);
  expect(locked.status === 429 && locked.json.error === "too_many_attempts" && open.length === 1 && open[0].used_at === null && passed.status === 200 && still.length === 1 && still[0].used_at !== null,
    () => `after 8 wrong codes a 9th: ${locked.status} ${locked.json && locked.json.error} (the code ${brief(open)}); the right one: ${passed.status}, the code ${brief(still)}`);
  return `${tries.length} refusals (wrong, reused, expired, revoked, never allowed, another email's code): one answer 401 invalid_signup, rows unchanged, ${tries.length} attempts counted; 8 wrong codes -> a 9th 429 (the code still open), the right one still signs up (${passed.status}, spent)`;
});

smoke("signup · the pages: GET /signup is the form (email, code, passphrase twice) and ?done=1 the signed-up page; no sign-up route mints a code", async () => {
  const p = await fetch(`${process.env.SMOKE_URL.replace(/\/+$/, "")}/signup`, { headers: { accept: "text/html" } });
  const t = await p.text();
  const d = await fetch(`${process.env.SMOKE_URL.replace(/\/+$/, "")}/signup?done=1`, { headers: { accept: "text/html" } });
  const dt = await d.text();
  expect(p.status === 200 && /name="email"/.test(t) && /name="code"/.test(t) && /name="password"/.test(t) && /name="confirm"/.test(t) && d.status === 200 && /You are signed up/.test(dt),
    () => `GET /signup ${p.status}, ?done=1 ${d.status}`);
  const c0 = rows("SELECT COUNT(*) AS n FROM signup_codes")[0].n;
  const tries = [await http("POST", "/signup", { key: ownerKey, body: { action: "allow", email: `signup-mint-${TAG}@smoke.local` } }),
    await http("POST", "/control", { key: ownerKey, form: { action: "allow", email: `signup-mint-${TAG}@smoke.local` } })];
  await settle();
  expect(rows("SELECT COUNT(*) AS n FROM signup_codes")[0].n === c0, () => `the owner's would-be mints: ${tries.map((r) => r.status).join("/")}, codes ${c0} -> more`);
  return `GET /signup 200 (the four fields), ?done=1 200 (signed up); the org owner asking POST /signup and POST /control to allow an email minted nothing (${tries.map((r) => r.status).join("/")})`;
});
