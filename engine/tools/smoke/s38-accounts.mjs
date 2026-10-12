// tools/smoke/s38-accounts.mjs — sprint 7, 7.1 (docs/plan/PLATFORM.md §2 item 8; migrate-070; src/accounts.js): one account per
// email, a seat per org, one session per sign-in, the lockout per account — on the real local worker. Runs LAST (after
// s37-orgundo deleted org 2): it seeds an org of its own (the next free id) the way s33 seeds org 2, its owner's key in memory.
//   · one email seated in org 1 and that org is ONE account; it signs in once, to its org-1 seat (one session row); the key
//     the other org's admin minted for its own seat signs in THAT seat alone (sprint 7, 7.4: under org 1's address, 404); the
//     person's bearer key and an OAuth grant (the real provider flow: register, the consent page, the code, the token) answer
//     as before
//   · the other org's admin adding org 1's owner's email takes nothing from them: their account holds no passphrase (as
//     migrate-070 leaves every account: the owner signs in by their seat's secret), that admin's set-password is refused
//     (account_elsewhere) and its rotate-key moves only its own seat; the owner's passphrase signs in unchanged; nothing that
//     admin holds reads org 1 as them; and the squat (that admin seats a fresh email first, org 1 seats it after): the key it
//     minted signs in its own seat alone (under org 1's address, 404), org 1's own key signs in to org 1
//   · the lockout counts per account: 8 failures under any spelling lock the account (each attempt names it); 8 failed
//     re-checks by the account's seat in the OTHER org lock its sign-in here; another account still signs in
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, ownerKey, sha, d1rows as rows, asAt, acceptWaiting } from "./lib.mjs";
import { oauthGrant, whoamiWith } from "./s26-review.mjs";

const T = () => new Date().toISOString();
// http(...) — the door, retried once when the socket itself failed: this case reads the local D1 synchronously between calls
// (lib.mjs d1rows), and the worker may close this process's idle keep-alive socket meanwhile (the s37 scar). A failed socket
// carried no request, so the retry sends it once.
const http = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const A = {};   // what the first case leaves for the next ones
const secretOf = (t) => (String(t).match(/(?:API key\)|shown again): ([0-9a-f]{40})\b/) || [])[1] || null;
const login = async (email, password) => { const r = await http("POST", "/login", { body: { email, password, device: "smoke-s38" } }); return { status: r.status, error: r.json && r.json.error, token: r.json && r.json.token }; };
const orgOf = (id) => ((rows(`SELECT org FROM people WHERE id = ${q(id)}`)[0]) || {}).org;
const idOfKey = (k) => ((rows(`SELECT id FROM people WHERE key_hash = ${q(sha(k))}`)[0]) || {}).id;
const add = async (adminKey, name, email) => { const r = await http("POST", "/control", { key: adminKey, form: { action: "add-person", name, email } }); acceptWaiting(email); return secretOf(r.text); };   // a seat that waits for its holder's yes (A1): accepted

smoke("accounts · one email seated in org 1 and another org is ONE account: it signs in once, to its org-1 seat (one session); the other org's key opens nothing here; its key and an OAuth grant answer as before", async () => {
  const at = T(), n = rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  A.org = n; A.key = randomBytes(20).toString("hex");
  rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${n}, 'Accounts org', ${q(at)}, ${q(at)}, 'local')`);
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('acct-owner-${n}', 'Accounts Owner', ${q(`owner@org${n}.local`)}, 'owner', ${q(sha(A.key))}, 1, ${q(at)}, ${n})`);
  const me = (await http("GET", "/whoami", { key: ownerKey })).json || {};
  A.ownerId = me.id; A.ownerEmail = me.email; A.ownerName = me.person;
  expect(A.ownerId && A.ownerEmail, () => `org 1's owner: ${brief(me)}`);
  A.kn = await add(A.key, "Smoke Owner (elsewhere)", A.ownerEmail);
  const seats = rows(`SELECT id, org, account_id FROM people WHERE lower(email) = ${q(A.ownerEmail.toLowerCase())} ORDER BY org`);
  const accts = rows(`SELECT id FROM accounts WHERE email = ${q(A.ownerEmail.toLowerCase())}`);
  expect(A.kn && seats.length === 2 && seats[0].org === 1 && seats[1].org === n && seats[0].account_id === seats[1].account_id && accts.length === 1 && accts[0].id === seats[0].account_id,
    () => `one account, two seats: ${brief(seats)} accounts ${brief(accts)}`);
  const t0 = rows(`SELECT COUNT(*) AS n FROM tokens WHERE person_id IN (${seats.map((x) => q(x.id)).join(", ")})`)[0].n;
  const one = await login(` ${A.ownerEmail.toUpperCase()} `, ownerKey);
  const minted = rows(`SELECT person_id, org FROM tokens WHERE person_id IN (${seats.map((x) => q(x.id)).join(", ")}) ORDER BY created_at DESC`);
  const who = one.token ? await whoamiWith(one.token) : {};
  expect(one.status === 200 && minted.length === t0 + 1 && minted[0].person_id === A.ownerId && minted[0].org === 1 && who.person === A.ownerName,
    () => `the sign-in: ${one.status} ${one.error || ""}; session rows ${t0} -> ${minted.length} (${brief(minted[0])}); whoami ${brief(who)}`);
  // sprint 7, 7.4: the other org's key is ITS seat's own secret: it signs in that seat alone (a seat session), never org 1's
  const other = await login(A.ownerEmail, A.kn);
  const otherWho = other.token ? (await http("GET", "/whoami", { key: other.token })).json || {} : {};
  const otherHere = other.token ? await asAt(1, other.token, "/whoami") : {};
  expect(other.status === 200 && orgOf(otherWho.id) === n && otherHere.status === 404, () => `the other org's key: ${other.status} ${other.error || ""} as ${brief(otherWho.id)}; under org 1's address ${otherHere.status}`);
  const key = (await http("GET", "/whoami", { key: ownerKey })).json || {};
  const g = await oauthGrant(A.ownerEmail, ownerKey, { name: "Smoke accounts" });
  const viaOAuth = await whoamiWith(g.access);
  expect(key.id === A.ownerId && viaOAuth.status === 200 && viaOAuth.person === A.ownerName, () => `the bearer key ${brief(key.id)}; the OAuth grant ${viaOAuth.status} ${brief(viaOAuth.person)}`);
  return `org ${n} seeded; ${A.ownerEmail} is one account with seats in orgs 1 and ${n}; one sign-in -> one session on its org-1 seat; org ${n}'s key -> its own seat only (org 1's address 404); key and OAuth grant answer as ${A.ownerName}`;
});

smoke("accounts · another org's admin adding org 1's owner's email takes nothing: set-password refused (account_elsewhere), rotate-key its own seat only, the owner's passphrase unchanged; the squat opens nothing", async () => {
  expect(A.org && A.kn, "the first accounts case did not run");
  // the owner's account holds no passphrase (as migrate-070 leaves every account): they sign in by their org-1 seat's secret
  const snap = () => JSON.stringify([rows(`SELECT pass_hash, pass_salt FROM accounts WHERE email = ${q(A.ownerEmail.toLowerCase())}`), rows(`SELECT key_hash, pass_hash, pass_salt FROM people WHERE id = ${q(A.ownerId)}`)]);
  const before = snap();
  expect(JSON.parse(before)[0][0].pass_hash === null, "the owner's account holds a passphrase (no door gives one in 7.1)");
  const seatN = idOfKey(A.kn);
  const sp = await http("POST", "/control", { key: A.key, form: { action: "set-password", personId: seatN, password: "org-n-chose-this" } });
  expect(/account_elsewhere/.test(sp.text) && snap() === before, () => `set-password by org ${A.org}'s admin: ${sp.status} ${(sp.text.match(/Nothing done[^<]*|Passphrase[^<]*/) || [""])[0].slice(0, 160)}`);
  const kr = secretOf((await http("POST", "/control", { key: A.key, form: { action: "rotate-key", personId: seatN } })).text);
  expect(kr && snap() === before, () => `rotate-key by org ${A.org}'s admin: ${kr ? "rotated" : "no secret"}, the owner's account and seat ${snap() === before ? "unchanged" : "CHANGED"}`);
  const mine = await login(A.ownerEmail, ownerKey);
  const mineWho = mine.token ? (await http("GET", "/whoami", { key: mine.token })).json || {} : {};
  const tries = [];
  for (const v of [A.kn, kr, "org-n-chose-this"]) tries.push(await login(A.ownerEmail, v));
  // sprint 7, 7.4: the rotated-out key and the refused value open nothing; org N's new key signs in org N's seat alone
  const krHere = tries[1].token ? await asAt(1, tries[1].token, "/whoami") : {};
  expect(mine.status === 200 && mineWho.id === A.ownerId && orgOf(mineWho.id) === 1 && tries[0].status === 401 && tries[2].status === 401 && tries[1].status === 200 && krHere.status === 404,
    () => `the owner's own passphrase ${mine.status} (${brief(mineWho.id)}); org ${A.org}'s values ${tries.map((t) => t.status).join("/")}; its new key under org 1's address ${krHere.status}`);
  // the squat: org N seats a fresh email first, org 1 seats it after
  const fresh = `squat-${TAG}@smoke.local`;
  const ks = await add(A.key, "Aaa Squat", fresh), kv = await add(ownerKey, "Zzz Hire", fresh);
  const sq = await login(fresh, ks), hire = await login(fresh, kv);
  const hireWho = hire.token ? (await http("GET", "/whoami", { key: hire.token })).json || {} : {};
  const sqWho = sq.token ? (await http("GET", "/whoami", { key: sq.token })).json || {} : {}, sqHere = sq.token ? await asAt(1, sq.token, "/whoami") : {};
  expect(ks && kv && sq.status === 200 && orgOf(sqWho.id) === A.org && sqHere.status === 404 && hire.status === 200 && orgOf(hireWho.id) === 1 && rows(`SELECT pass_hash FROM accounts WHERE email = ${q(fresh)}`)[0].pass_hash === null,
    () => `the squat: org ${A.org}'s key ${sq.status} as org ${orgOf(sqWho.id)} (org 1's address ${sqHere.status}), org 1's key ${hire.status} (${brief(hireWho.id)}), the account made with no passphrase`);
  return `set-password refused (account_elsewhere), rotate-key moved only org ${A.org}'s seat; the owner's passphrase 200; org ${A.org}'s old and refused values 401, its new key its own seat only; the squat: org ${A.org}'s key its own seat only (org 1's address 404), org 1's 200 in org 1`;
});

smoke("accounts · the lockout counts per account: 8 failures under any spelling lock it; 8 failed re-checks by its seat in the other org lock it here; another account signs in", async () => {
  expect(A.org, "the first accounts case did not run");
  const e1 = `lock-${TAG}@smoke.local`, k1 = await add(ownerKey, "Lock One", e1);
  for (let i = 0; i < 8; i++) await login(i % 2 ? ` ${e1.toUpperCase()}` : `${e1} `, `wrong-${i}`);
  const acct = rows(`SELECT id FROM accounts WHERE email = ${q(e1)}`)[0].id;
  const named = rows(`SELECT COUNT(*) AS n FROM login_attempts WHERE account_id = ${q(acct)} AND ok = 0`)[0].n;
  const locked = await login(e1, k1);
  expect(k1 && named === 8 && locked.status === 429 && locked.error === "too_many_attempts", () => `8 failures: ${named} attempts name the account; the right key ${locked.status} ${locked.error}`);
  const e2 = `lock2-${TAG}@smoke.local`, k21 = await add(ownerKey, "Lock Two", e2), k2n = await add(A.key, "Lock Two (elsewhere)", e2);
  for (let i = 0; i < 8; i++) await http("POST", "/profile", { key: k2n, body: { action: "set-my-passphrase", current: `wrong-${i}`, password: "whatever-new" } });
  const cross = await login(e2, k21), fine = await login(A.ownerEmail, ownerKey);
  expect(k21 && k2n && cross.status === 429 && fine.status === 200, () => `8 re-checks by its org-${A.org} seat: its sign-in here ${cross.status}; another account ${fine.status}`);
  return `one account, one lockout: 8 failures under any spelling -> 429 (8 attempts name it); 8 failed re-checks in org ${A.org} -> 429 at org 1's address; another account 200`;
});
