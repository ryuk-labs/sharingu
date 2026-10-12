// tools/smoke/s43-mcporgs.mjs — sprint 7, 7.5a (docs/plan/PLATFORM.md §2 items 8 and 9: one /mcp; the OAuth grant carries the
// person and the org; whoami lists the orgs and a call switches between them; the clients already connected land in ryuklabs),
// on the real local worker and its real OAuth provider, as a local client connects (register, the sign-in form, the code
// exchange; its redirect on this computer). Runs after s42. It seeds an org of its own as the operator's tools do and holds every
// key and token in memory, never printed.
//   · an ACCOUNT seated in two orgs (a member's seat in org 1, an admin's in its own org) connects ONCE with the account's
//     passphrase: the greeting names org 1 (its current org) and says whoami lists the others; whoami lists exactly the two
//     (org 1 current); a call with orgSlug acts in each, as that seat, with its role there; a goal filed in each lands in THAT
//     org's project (read on the database)
//   · a SEAT grant (the same account's org-1 seat secret: the shape of every grant made before 7.5a, so a client connected before
//     it) acts as that seat in org 1 alone: whoami lists org 1 only, a goal it files lands in org 1, and naming the other org is
//     refused org_unreachable with nothing written; a bearer key of the other org naming org 1 is refused the same way
import { pbkdf2Sync, randomBytes, createHash } from "node:crypto";
import { smoke, expect, http, ownerKey, sha, d1rows as rows, orgSlug, BASE, acceptWaiting, patientFetch } from "./lib.mjs";
const fetch = patientFetch;   // the local client's raw door calls retry a transient socket failure (lib.mjs patientFetch)

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const T = () => new Date().toISOString();
const S = {};
const secretOf = (t) => (String(t).match(/API key\): ([0-9a-f]{40})\b/) || [])[1] || null;
const form = (key, f) => http("POST", "/control", { key, form: f });
// oauth(email, password) -> an access token, as a local MCP client connects (RFC 8252: its redirect on this computer)
async function oauth(email, password, scope = "mcp:read mcp:write") {
  const redirect = "http://127.0.0.1:9/cb";
  const reg = await (await fetch(BASE + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "smoke-mcporgs", redirect_uris: [redirect], token_endpoint_auth_method: "none" }) })).json();
  const verifier = randomBytes(32).toString("base64url");
  const qs = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, scope, state: "s", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const page = await (await fetch(`${BASE}/oauth/authorize?${qs}`)).text();
  const req = (page.match(/name="oauth_req" value="([^"]+)"/) || [])[1];
  expect(req, "the OAuth sign-in page carries no request");
  const post = (extra = {}) => fetch(BASE + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ oauth_req: req, email, password, ...extra }).toString(), redirect: "manual" });
  let r = await post();
  // sprint 7's review (A1): an account in several orgs is asked which org the connection acts in (the form comes back with its
  // orgs, no grant made); the person chooses org 1 (S.slug1), and the grant records it
  if (r.status === 200) {
    const html = await r.text();
    expect(/data-region="org-choice"/.test(html) && html.includes(`value="${S.slug1}"`), () => `the OAuth form answered 200 without the org choice: ${html.slice(0, 160)}`);
    S.asked = (S.asked || 0) + 1;
    r = await post({ org: S.slug1 });
  }
  const code = new URL(r.headers.get("location") || "http://x/").searchParams.get("code");
  expect(code, () => `the OAuth sign-in: ${r.status}, no code`);
  const tok = await (await fetch(BASE + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier }).toString() })).json();
  expect(tok.access_token, "no access token");
  return tok.access_token;
}
let n = 0;
async function rpc(tok, method, params) {
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + tok }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, ...(params ? { params } : {}) }) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function tool(tok, name, args = {}) {
  const r = await rpc(tok, "tools/call", { name, arguments: args });
  const res = r.json && r.json.result;
  let out = null; try { out = JSON.parse(res.content[0].text); } catch { out = (r.json && r.json.error) || null; }
  return { status: r.status, out, isError: !res || !!res.isError };
}
// a project holds ONE root goal: a later goal hangs under the first (parent)
const goal = (id, parent = null) => ({ kind: "goal", op: "upsert", data: { id, title: `Goal ${id}`, parent, dimensions: [] } });
async function fileGoal(tok, project, id, orgSlugArg, parent = null) {
  const items = [goal(id, parent)], o = orgSlugArg ? { orgSlug: orgSlugArg } : {};
  const pv = await tool(tok, "preview", { project, items, ...o });
  if (pv.isError || !pv.out || !pv.out.previewId) return pv;
  return tool(tok, "file", { previewId: pv.out.previewId, items, ...o });
}
const orgsOf = (o) => ((o && o.orgs) || []).map((x) => `${x.slug}:${x.role}${x.current ? "*" : ""}`).join(" ");
const goalAt = (id) => (rows(`SELECT project FROM k_goals WHERE id = ${q(id)}`)[0] || {}).project || null;

smoke("mcporgs · an account seated in two orgs connects ONCE through OAuth (a local client): whoami lists both; a call with orgSlug acts in each, as that seat; its goals land in that org", async () => {
  // an org of its own (as the operator's tools seed one), its owner and its first project
  const at = T(), id = rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  S.org = id; S.name = `Mcporgs ${TAG}`; S.ownerKeyN = randomBytes(20).toString("hex");
  rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${id}, ${q(S.name)}, ${q(at)}, ${q(at)}, 'local')`);
  rows(`INSERT INTO projects (key, name, active, created_at) VALUES ('o${id}--mo', 'Mo', 1, ${q(at)})`);
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('mcporgs-owner-${id}', 'Mcporgs Owner', ${q(`owner@mcporgs${id}.local`)}, 'owner', ${q(sha(S.ownerKeyN))}, 1, ${q(at)}, ${id})`);
  S.slug1 = orgSlug(1); S.slugN = orgSlug(id);
  // org 1: a fresh project and the account's member seat on it; its own org: the account's admin seat
  S.p1 = `mo-${TAG}`;
  const ap = await form(ownerKey, { action: "add-project", key: S.p1, name: `Mo ${TAG}` });
  S.email = `mcporgs-${TAG}@smoke.local`;
  S.k1 = secretOf((await form(ownerKey, { action: "add-person", name: "Mo Two-Org", email: S.email, projectKey: S.p1, seatsChosen: "1" })).text);
  S.kN = secretOf((await form(S.ownerKeyN, { action: "add-person", name: "Mo Two-Org", email: S.email })).text);
  acceptWaiting(S.email);   // the account stands in org 1: its seat here waited for the holder's yes (A1), given as POST /orgs/seat gives it
  S.seat1 = (rows(`SELECT id FROM people WHERE email = ${q(S.email)} AND org = 1`)[0] || {}).id;
  S.seatN = (rows(`SELECT id FROM people WHERE email = ${q(S.email)} AND org = ${id}`)[0] || {}).id;
  await form(S.ownerKeyN, { action: "set-role", personId: S.seatN, role: "admin" });
  expect(ap.status < 500 && S.k1 && S.kN && S.seat1 && S.seatN && (rows(`SELECT role FROM people WHERE id = ${q(S.seatN)}`)[0] || {}).role === "owner",
    () => `the account's two seats: ${S.seat1} (${!!S.k1}), ${S.seatN} (${!!S.kN})`);
  // the account's own passphrase (as the sign-up gives it: the operator's code proves its holder)
  S.pass = `mcporgs-account-pass-${TAG}`;
  const salt = randomBytes(16).toString("hex");
  rows(`UPDATE accounts SET pass_hash = ${q(pbkdf2Sync(S.pass, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"))}, pass_salt = ${q(salt)} WHERE email = ${q(S.email)}`);
  const A = await oauth(S.email, S.pass);
  const init = (await rpc(A, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke-mcporgs", version: "1" } })).json.result;
  const org1Name = (rows("SELECT name FROM org WHERE id = 1")[0] || {}).name;
  const me = await tool(A, "whoami"), meN = await tool(A, "whoami", { orgSlug: S.slugN });
  expect(init.serverInfo.name === `sharingu — ${org1Name}` && /orgSlug/.test(init.instructions) && me.out.id === S.seat1 && orgsOf(me.out) === `${S.slug1}:member* ${S.slugN}:owner`
    && meN.out.id === S.seatN && meN.out.role === "owner" && orgsOf(meN.out) === `${S.slug1}:member ${S.slugN}:owner*`,
    () => `the account grant: greeting ${init.serverInfo.name}; whoami ${me.out && me.out.id} [${orgsOf(me.out)}]; with orgSlug ${S.slugN}: ${meN.out && meN.out.id} ${meN.out && meN.out.role} [${orgsOf(meN.out)}]`);
  const g1 = S.g1 = `mo-g1-${TAG}`, gN = `mo-gn-${TAG}`;
  const f1 = await fileGoal(A, S.p1, g1, S.slug1), fN = await fileGoal(A, "mo", gN, S.slugN);
  expect(!f1.isError && !fN.isError && goalAt(g1) === S.p1 && goalAt(gN) === `o${id}--mo`,
    () => `the goals: ${g1} in ${goalAt(g1)} (${f1.isError ? JSON.stringify(f1.out).slice(0, 160) : "filed"}), ${gN} in ${goalAt(gN)} (${fN.isError ? JSON.stringify(fN.out).slice(0, 160) : "filed"})`);
  return `ONE connection (the account's passphrase): greeting "${init.serverInfo.name}"; whoami [${orgsOf(me.out)}], with orgSlug ${S.slugN} its admin seat there; ${g1} filed in ${goalAt(g1)}, ${gN} in ${goalAt(gN)}`;
});

smoke("mcporgs · a SEAT grant (the org-1 seat's own secret: the shape of every grant before 7.5a) acts in org 1 alone; naming the other org is refused, nothing written; the other org's key naming org 1 likewise", async () => {
  expect(S.k1 && S.slugN, "the first mcporgs case did not run");
  const G = await oauth(S.email, S.k1);
  const me = await tool(G, "whoami");
  const g = `mo-seat-${TAG}`;
  const f = await fileGoal(G, S.p1, g, undefined, S.g1);
  const n0 = rows("SELECT COUNT(*) AS n FROM k_goals")[0].n;
  const x = await tool(G, "whoami", { orgSlug: S.slugN }), y = await fileGoal(G, "mo", `mo-seat-x-${TAG}`, S.slugN), z = await tool(G, "read", { project: "mo", kind: "goal", orgSlug: S.slugN });
  const k = await tool(S.ownerKeyN, "read", { project: S.p1, kind: "goal", orgSlug: S.slug1 });
  expect(me.out.id === S.seat1 && orgsOf(me.out) === `${S.slug1}:member*` && !f.isError && goalAt(g) === S.p1,
    () => `the seat grant: whoami ${me.out && me.out.id} [${orgsOf(me.out)}]; its goal in ${goalAt(g)} (${f.isError ? JSON.stringify(f.out).slice(0, 200) : "filed"})`);
  expect([x, y, z, k].every((r) => r.out && r.out.error === "org_unreachable") && rows("SELECT COUNT(*) AS n FROM k_goals")[0].n === n0,
    () => `naming the other org: ${[x, y, z, k].map((r) => (r.out && r.out.error) || JSON.stringify(r.out).slice(0, 80)).join(", ")}`);
  return `the seat grant acts as the org-1 seat [${orgsOf(me.out)}], its goal in ${goalAt(g)}; naming ${S.slugN} (whoami, preview, read): org_unreachable ×3, 0 goals written; ${S.slugN}'s key naming ${S.slug1}: ${k.out.error}`;
});
