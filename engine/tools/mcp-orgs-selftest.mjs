// tools/mcp-orgs-selftest.mjs — sprint 7, slice 7.5a (docs/plan/PLATFORM.md §2 items 8 and 9: one /mcp; the OAuth grant carries
// the person and the org; whoami lists the orgs and a call switches between them; the clients already connected land in
// ryuklabs). Through the REAL worker (src/index.js over node:sqlite, tools/fixtures/sqlite-worker.mjs) and the REAL OAuth provider
// (register, the sign-in form, the code exchange, then /mcp with the access token), three orgs: One (org 1), Two, Three. Ann's ONE
// account holds a member's seat in One and an admin's seat in Two, and none in Three. Each case builds a fresh world.
//   C1 · the two grant kinds (src/oauthgrants.js): the ACCOUNT's passphrase makes an ACCOUNT grant {personId: the chosen seat
//        (One's), accountId, org: 1, scope, cred: accountCred}; a seat's OWN secret (the key Two's admin minted) makes a SEAT
//        grant whose props are exactly the pre-7.5a shape {personId, scope, cred: credEpoch} on that seat
//   C2 · the account grant: the greeting names its current org (One) and says whoami lists the others; whoami lists exactly its
//        two orgs (One current, member; Two, admin) and with orgSlug Two answers as the Two seat; tools/list shows the admin
//        tools (it is an admin in Two) yet create_project in One (a member there) is owner_only, in Two it creates there
//   C3 · the account grant's writes land in the org the call names: a goal filed with orgSlug Two is in Two's project, one with
//        orgSlug One in One's; a preview made in Two is not filed by a call acting in One
//   C4 · the account grant naming Three (it exists; no seat) and a name no org holds: org_unreachable, the SAME body for both,
//        listing only its own two orgs; a value that is not a string too; no row written by any of them
//   C5 · the SEAT grant (Two's seat): whoami lists only Two; orgSlug One is refused on a read, a preview and whoami, no row
//        written; its greeting carries no org line; naming its own org answers
//   C6 · a bearer key (One's seat key): orgSlug Two refused; its own org in any spelling ("One"? no: its slug, upper-cased, with
//        a leading slash) answers
//   C7 · a JSON-RPC batch acts in ONE org: [whoami {orgSlug Two}, whoami {orgSlug One}] -> the first as the Two seat, the
//        second refused
//   C8 · resources: brain://updates?orgSlug=<Two> reads for the account grant; the seat grant naming One is -32003
//        org_unreachable
//   C9 · a client connected BEFORE this slice: a grant minted by the sprint-7 code before 7.5a (a copy of src/ at
//        PRE_SLICE, its own OAuth form, the same database and grant store) acts through today's door as its seat in org 1,
//        exactly as it did: whoami is its seat, its orgs only One, orgSlug Two refused, a goal it files lands in One
//   C10 · what ends what: Two's admin rotates Ann's Two key -> the SEAT grant ends (401 invalid_token), the account grant still
//        acts in One and, since sprint 8's 8.3a (the per-seat grants epoch), is refused in Two until Ann connects again; the
//        ACCOUNT's passphrase changes -> the account grant ends; a new account grant, then Two's admin removes Ann's Two seat ->
//        orgSlug Two is refused, whoami lists One alone
//   C11 · a read-only account grant (mcp:read) cannot file in either org (insufficient_scope)
//   C12 · (7.5b) a grant with NO stamp — props {personId, scope}, the shape the code before G2 minted (and {personId}, before
//        2026-08-28's scope) — minted through the REAL provider by a copy of today's src/ whose form leaves the stamp out: today's
//        door answers 401 invalid_token with the re-connect words, nothing read or written; a stamped SEAT grant and an ACCOUNT
//        grant of the same person, minted the same way by today's form, still act
//   SPRINT 8, 8.3a (the sprint-7 review's C2: the per-seat grants epoch; RED on the tree before the fix):
//   C17 · an org admin's reissue of a seat (rotate-key; set-password on a one-seat account) ends an ACCOUNT grant's reach into
//        THAT seat: naming it is 401 invalid_token (the re-connect answer), the grant acts on in the account's other org, the
//        account's own session reads on there; a stamp minted before the epoch (the passphrase digest alone) keeps acting in a
//        seat never reissued and is refused in the reissued one; connecting again (a fresh sign-in) acts in the seat again
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) must turn its case(s) red by an assertion, never a crash.
// Exit 1 on any failure. A gate step.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { pbkdf2 } = await import(pathToFileURL(join(ENGINE, "src", "util.js")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const SALT = "00112233445566778899aabbccddeeff";
const ANN = "ann@orgs.test", ANN_PASS = "ann-account-passphrase-1";
// the sprint-7 commit before slice 7.5a (the grant before the two kinds): C9 mints its grant with that code
export const PRE_SLICE = "57b6ecb7e";

let MUT = {};
const srcOf = () => MUT.src || join(ENGINE, "src");
async function world() {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src: MUT.src, people: [["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"]],
    orgs: [{ id: 2, name: "Two", projects: ["shop"], people: [["two-owner", "Owner Two", "owner", "two-owner-key", [], "owner@two.test"]] },
      { id: 3, name: "Three", projects: ["tri"], people: [["three-owner", "Owner Three", "owner", "three-owner-key", [], "owner@three.test"]] }] });
  const one = (sql, ...a) => w.db.prepare(sql).get(...a);
  // the rows the call changed OUTSIDE org_usage (8.2f, main's ruling: every call counts in its org's counter row; the pin never widens)
  const changes = w.changes;
  const slug = (org) => one("SELECT slug FROM org WHERE id = ?", org).slug;
  const call = async (method, path, { key, body, form, fetcher = w.fetch } = {}) => {
    const headers = { accept: "application/json" };
    if (key) headers.authorization = "Bearer " + key;
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await fetcher(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" }));
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, text, json, location: r.headers.get("location") || "" };
  };
  let n = 0;
  const rpc = async (key, method, params) => call("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: ++n, method, ...(params ? { params } : {}) } });
  const outOf = (res) => { const t = res && res.content && res.content[0] && res.content[0].text; try { return JSON.parse(t); } catch { return t; } };
  const tool = async (key, name, args = {}) => { const r = await rpc(key, "tools/call", { name, arguments: args }); const res = r.json && r.json.result; return { status: r.status, out: res ? outOf(res) : (r.json && r.json.error) || r.text, isError: !res || !!res.isError, text: r.text }; };
  // oauth(email, password, scope, fetcher, org) -> an access token through the REAL provider (register, the sign-in form, the code).
  // org: the org the person chooses on the form (sprint 7's review, A1: an account in several orgs is asked; default One, the
  // grant's current org as every case below expects)
  // clientName (sprint 13, 13.1): the name the client registers (its family word rides the grant's props)
  const oauth = async (email, password, scope = "mcp:read mcp:write", fetcher = w.fetch, org = slug(1), clientName = "orgs-selftest") => {
    const redirect = "https://client.test/cb";
    const reg = (await call("POST", "/oauth/register", { body: { client_name: clientName, redirect_uris: [redirect], token_endpoint_auth_method: "none" }, fetcher })).json;
    const verifier = randomBytes(32).toString("base64url");
    const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, scope, state: "s", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    const page = (await call("GET", `/oauth/authorize?${q}`, { fetcher })).text;
    const req = (page.match(/name="oauth_req" value="([^"]+)"/) || [])[1];
    const r = await call("POST", "/oauth/authorize", { form: { oauth_req: req, email, password, org }, fetcher });
    const code = new URL(r.location || "http://x/").searchParams.get("code");
    if (!code) throw new Error(`the OAuth sign-in for ${email}: ${r.status}, no code`);
    const tok = (await call("POST", "/oauth/token", { form: { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier }, fetcher })).json;
    if (!tok || !tok.access_token) throw new Error("no access token");
    return tok.access_token;
  };
  const control = (key, form) => call("POST", "/control", { key, form }).then((r) => r.text);
  const secretOf = (t) => (String(t).match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
  // Ann: a member's seat in One (on alpha), an admin's seat in Two (on shop), ONE account, its own passphrase (as 7.2's sign-up
  // gives it: the operator's code proves its holder)
  const k1 = secretOf(await control("one-owner-key", { action: "add-person", name: "Ann", email: ANN, projectKey: "alpha", seatsChosen: "1" }));
  const k2 = secretOf(await control("two-owner-key", { action: "add-person", name: "Ann", email: ANN }));
  const seat1 = one("SELECT id FROM people WHERE email = ? AND org = 1", ANN).id, seat2 = one("SELECT id FROM people WHERE email = ? AND org = 2", ANN).id;
  // the review's A1 (migrate-074): Ann's account stands in One, so Two's seat WAITS for her yes — accepted as POST /orgs/seat does
  w.db.prepare("UPDATE people SET active = 1, pending = 0 WHERE id = ? AND pending = 1").run(seat2);
  await control("two-owner-key", { action: "grant-seat", personId: seat2, projectKey: "o2--shop", role: "member" });
  await control("two-owner-key", { action: "set-role", personId: seat2, role: "admin" });
  w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = ?").run(await pbkdf2(ANN_PASS, SALT), SALT, ANN);
  if (!k1 || !k2 || one("SELECT role FROM people WHERE id = ?", seat2).role !== "owner") throw new Error("the world: Ann's seats were not made");
  const S = { one: slug(1), two: slug(2), three: slug(3) };
  return { w, one, changes, slug, S, call, rpc, tool, oauth, control, k1, k2, seat1, seat2 };
}
const goal = (id) => ({ kind: "goal", op: "upsert", data: { id, title: `Goal ${id}`, parent: null, dimensions: [] } });
const fileGoal = async (W, key, project, id, orgSlug) => {
  const items = [goal(id)];
  const pv = await W.tool(key, "preview", { project, items, ...(orgSlug ? { orgSlug } : {}) });
  if (pv.isError || !pv.out.previewId) return { step: "preview", ...pv };
  return { step: "file", previewId: pv.out.previewId, ...(await W.tool(key, "save_knowledge", { previewId: pv.out.previewId, items, ...(orgSlug ? { orgSlug } : {}) })) };
};
const orgsOf = (o) => ((o && o.orgs) || []).map((x) => `${x.slug}:${x.role || ""}${x.current ? "*" : ""}`).join(" ");
const brief = (v) => JSON.stringify(v).slice(0, 240);
// fetchRaw(W, key, message, headers) -> the raw Response of one /mcp POST (C14 reads its content type before its body)
const fetchRaw = (W, key, message, headers = {}) => W.w.fetch(new Request(W.w.origin + "/mcp", { method: "POST",
  headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + key, ...headers }, body: JSON.stringify(message) }));

const CASES = {
  async C1() {
    const W = await world(), out = [];
    const { oauthDefaultHandler } = await import(pathToFileURL(join(srcOf(), "oauth.js")).href);
    const { credEpoch, accountCred } = await import(pathToFileURL(join(srcOf(), "oauthgrants.js")).href);
    let grant = null;
    const env = { ...W.w.env, OAUTH_PROVIDER: { lookupClient: async () => ({ clientName: "A client" }), completeAuthorization: async (o) => { grant = o; return { redirectTo: "https://client.test/cb?code=x" }; } } };
    const form = (password) => new Request(W.w.origin + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: ANN, password, org: W.S.one, oauth_req: btoa(JSON.stringify({ clientId: "c", redirectUri: "https://client.test/cb", scope: ["mcp:read", "mcp:write"] })) }).toString() });
    const acct = W.one("SELECT id, pass_hash, pass_salt FROM accounts WHERE email = ?", ANN);
    // the stamp is "<the account's digest>.<the moment the grant was made, ms>" (8.3a): its digest is the account's, its moment
    // inside the sign-in's own bracket — never compared with a stamp recomputed a millisecond later (sprint 10, 10.6: that equality
    // was the gate's load flake, red whenever the clock ticked between the mint and the check). The stamp must EQUAL the one the
    // product mints at the moment it names (the sprint-10 review, L2: a split and a parseInt alone took "<digest>.<ms>.junk")
    const t0 = Date.now(), a = await oauthDefaultHandler.fetch(form(ANN_PASS), env, {}), t1 = Date.now();
    const ap = grant && grant.props;
    const at = parseInt(String((ap && ap.cred) || "").split(".")[1], 36);
    const stamped = at >= t0 && at <= t1 && ap.cred === await accountCred(acct, at);
    out.push([a.status === 302 && ap && Object.keys(ap).sort().join(",") === "accountId,cred,org,personId,scope" && ap.accountId === acct.id && ap.personId === W.seat1 && ap.org === 1 && grant.userId === W.seat1 && stamped,
      `C1 · the ACCOUNT's passphrase makes an ACCOUNT grant: ${brief(ap && { ...ap, cred: ap.cred && "…" })}, its stamp the account's digest and a moment inside the sign-in (${stamped ? "yes" : `no: ${at - t0} ms after its start, ${t1 - t0} ms long`})`]);
    grant = null;
    const s = await oauthDefaultHandler.fetch(form(W.k2), env, {});
    const sp = grant && grant.props, row2 = W.one("SELECT key_hash, pass_hash FROM people WHERE id = ?", W.seat2);
    out.push([s.status === 302 && sp && Object.keys(sp).sort().join(",") === "cred,personId,scope" && sp.personId === W.seat2 && sp.cred === await credEpoch(row2),
      `C1 · a seat's OWN secret (Two's key) makes a SEAT grant, the pre-7.5a shape on that seat: ${brief(sp && { ...sp, cred: sp.cred && "…" })}`]);
    return out;
  },
  async C2() {
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS);
    const init = (await W.rpc(A, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })).json.result;
    out.push([init.serverInfo.name === "sharingu — One" && /`whoami` lists them/.test(init.instructions) && /orgSlug/.test(init.instructions),
      `C2 · the account grant's greeting: ${init.serverInfo.name}, its instructions say whoami lists the other orgs and a call takes orgSlug`]);
    const me = await W.tool(A, "whoami"), me2 = await W.tool(A, "whoami", { orgSlug: W.S.two });
    out.push([!me.isError && me.out.id === W.seat1 && orgsOf(me.out) === `${W.S.one}:member* ${W.S.two}:owner` && /orgSlug/.test(me.out.orgNote),
      `C2 · whoami lists exactly its two orgs (${orgsOf(me.out)}), as the One seat (${me.out && me.out.id})`]);
    out.push([!me2.isError && me2.out.id === W.seat2 && me2.out.role === "owner" && orgsOf(me2.out) === `${W.S.one}:member ${W.S.two}:owner*`,
      `C2 · whoami {orgSlug: Two} answers as the Two seat, its role there (${me2.out && me2.out.id}, ${me2.out && me2.out.role}; ${orgsOf(me2.out)})`]);
    const tl = ((await W.rpc(A, "tools/list")).json.result.tools || []).map((t) => t.name);
    const c1 = await W.tool(A, "create_project", { key: "ann-one", name: "Ann One" }), c2 = await W.tool(A, "create_project", { key: "ann-two", name: "Ann Two", orgSlug: W.S.two });
    out.push([tl.includes("create_project") && c1.out.error === "owner_only" && !c2.isError && W.one("SELECT org FROM projects WHERE key = 'o2--ann-two'") && !W.one("SELECT 1 AS x FROM projects WHERE key LIKE '%ann-one'"),
      `C2 · tools/list shows the admin tools (an admin in Two); create_project acting in One ${c1.out.error || "ANSWERED"}, in Two ${c2.isError ? brief(c2.out) : "created o2--ann-two"}`]);
    return out;
  },
  async C3() {
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS);
    const g2 = await fileGoal(W, A, "shop", "ann-g2", W.S.two), g1 = await fileGoal(W, A, "alpha", "ann-g1", W.S.one);
    const at = (id) => (W.one("SELECT project FROM k_goals WHERE id = ?", id) || {}).project;
    out.push([!g2.isError && !g1.isError && at("ann-g2") === "o2--shop" && at("ann-g1") === "alpha",
      `C3 · the rows land in the org the call names: ann-g2 in ${at("ann-g2")}, ann-g1 in ${at("ann-g1")} (${g2.isError ? brief(g2.out) : "filed"}, ${g1.isError ? brief(g1.out) : "filed"})`]);
    const pv = await W.tool(A, "preview", { project: "shop", items: [goal("ann-x")], orgSlug: W.S.two });
    const f = await W.tool(A, "save_knowledge", { previewId: pv.out.previewId, items: [goal("ann-x")] });
    out.push([pv.out.previewId && f.isError && !at("ann-x"), `C3 · a preview made in Two is not filed by a call acting in One (${f.out && f.out.error})`]);
    return out;
  },
  async C4() {
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS);
    const c0 = W.changes();
    const three = await W.tool(A, "read", { project: "tri", kind: "goal", orgSlug: W.S.three });
    const none = await W.tool(A, "read", { project: "tri", kind: "goal", orgSlug: "no-org-holds-this" });
    const num = await W.tool(A, "whoami", { orgSlug: 3 });
    const pv = await fileGoal(W, A, "tri", "ann-g3", W.S.three);
    out.push([three.isError && three.out.error === "org_unreachable" && JSON.stringify(three.out) === JSON.stringify(none.out) && JSON.stringify(three.out.orgs.map((o) => o.slug)) === JSON.stringify([W.S.one, W.S.two]),
      `C4 · an org the account holds no seat in (Three) and a name no org holds: org_unreachable, ${JSON.stringify(three.out) === JSON.stringify(none.out) ? "ONE answer" : "TWO answers"}, listing ${JSON.stringify((three.out.orgs || []).map((o) => o.slug))}`]);
    out.push([num.isError && num.out.error === "org_unreachable" && pv.isError && pv.out.error === "org_unreachable" && W.changes() === c0 && !W.one("SELECT 1 AS x FROM k_goals WHERE id = 'ann-g3'"),
      `C4 · a number as orgSlug and a preview naming Three: refused; ${W.changes() - c0} row(s) written`]);
    return out;
  },
  async C5() {
    const W = await world(), out = [];
    const S2 = await W.oauth(ANN, W.k2);
    const init = (await W.rpc(S2, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })).json.result;
    const me = await W.tool(S2, "whoami");
    out.push([init.serverInfo.name === "sharingu — Two" && !/orgSlug/.test(init.instructions) && !me.isError && me.out.id === W.seat2 && orgsOf(me.out) === `${W.S.two}:owner*`,
      `C5 · the SEAT grant: greeting ${init.serverInfo.name} with no org line; whoami as the Two seat (${me.out && me.out.id}), its orgs ${orgsOf(me.out)}`]);
    const c0 = W.changes();
    const r = await W.tool(S2, "read", { project: "alpha", kind: "goal", orgSlug: W.S.one });
    const w1 = await W.tool(S2, "whoami", { orgSlug: W.S.one });
    const p = await fileGoal(W, S2, "alpha", "seat-g1", W.S.one);
    out.push([r.out.error === "org_unreachable" && w1.out.error === "org_unreachable" && p.out.error === "org_unreachable" && JSON.stringify(r.out.orgs.map((o) => o.slug)) === JSON.stringify([W.S.two]) && W.changes() === c0,
      `C5 · the seat grant naming One: read ${r.out.error}, whoami ${w1.out.error}, preview ${p.out.error}; it lists ${JSON.stringify((r.out.orgs || []).map((o) => o.slug))}; ${W.changes() - c0} row(s) written`]);
    const own = await W.tool(S2, "whoami", { orgSlug: W.S.two });
    out.push([!own.isError && own.out.id === W.seat2, `C5 · the seat grant naming its own org answers (${own.out && own.out.id})`]);
    return out;
  },
  async C6() {
    const W = await world(), out = [];
    const c0 = W.changes();
    const x = await W.tool(W.k1, "whoami", { orgSlug: W.S.two }), y = await W.tool(W.k1, "read", { project: "shop", kind: "goal", orgSlug: W.S.two });
    const u = await W.tool(W.k1, "whoami", { orgSlug: "/" + W.S.one.toUpperCase() });
    out.push([x.out.error === "org_unreachable" && y.out.error === "org_unreachable" && W.changes() === c0 && !u.isError && u.out.id === W.seat1,
      `C6 · a bearer key (One's seat) naming Two: ${x.out.error}, ${y.out.error}; its own org as "/${W.S.one.toUpperCase()}": ${u.isError ? brief(u.out) : u.out.id}`]);
    return out;
  },
  async C7() {
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS);
    const r = await W.call("POST", "/mcp", { key: A, body: [
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: { orgSlug: W.S.two } } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: { orgSlug: W.S.one } } }] });
    const a = Array.isArray(r.json) ? r.json.map((m) => { try { return JSON.parse(m.result.content[0].text); } catch { return m; } }) : [];
    out.push([a.length === 2 && a[0].id === W.seat2 && a[1].error === "org_unreachable" && /batch/.test(a[1].note),
      `C7 · a batch acts in ONE org: the first as ${a[0] && (a[0].id || a[0].error)}, the second (One) ${a[1] && (a[1].error || a[1].id)}`]);
    return out;
  },
  async C8() {
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS), S2 = await W.oauth(ANN, W.k2);
    const ok = await W.rpc(A, "resources/read", { uri: `brain://updates?orgSlug=${W.S.two}` });
    const no = await W.rpc(S2, "resources/read", { uri: `brain://updates?orgSlug=${W.S.one}` });
    out.push([ok.json && ok.json.result && ok.json.result.contents && no.json && no.json.error && no.json.error.code === -32003 && /^org_unreachable/.test(no.json.error.message),
      `C8 · resources: the account grant reads brain://updates in Two (${ok.json && ok.json.result ? "answered" : brief(ok.json)}); the seat grant naming One ${no.json && no.json.error ? `${no.json.error.code} ${no.json.error.message.slice(0, 16)}` : "ANSWERED"}`]);
    return out;
  },
  async C9() {
    const W = await world(), out = [];
    // the code before this slice: a copy of src/ at PRE_SLICE (inside engine/, so its imports resolve to engine/node_modules)
    const dir = mkdtempSync(join(ENGINE, ".mcporgs-pre-"));
    try {
      const tar = execFileSync("git", ["archive", "--format=tar", PRE_SLICE, "src"], { cwd: ENGINE, maxBuffer: 1 << 28 });
      execFileSync("tar", ["-x", "-C", dir], { input: tar });
      const old = (await import(pathToFileURL(join(dir, "src", "index.js")).href)).default;
      const ctx = { waitUntil() {}, passThroughOnException() {} };
      W.w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = 'one-owner'").run(await pbkdf2("owner-one-pass", SALT), SALT);
      // the OLD code's OAuth form mints the grant into the same grant store (the env's KV) and database
      const T = await W.oauth("owner@one.test", "owner-one-pass", "mcp:read mcp:write", (req) => old.fetch(req, W.w.env, ctx));
      const me = await W.tool(T, "whoami"), x = await W.tool(T, "whoami", { orgSlug: W.S.two });
      const g = await fileGoal(W, T, "alpha", "old-g1");
      const at = (W.one("SELECT project FROM k_goals WHERE id = 'old-g1'") || {}).project;
      out.push([!me.isError && me.out.id === "one-owner" && orgsOf(me.out) === `${W.S.one}:owner*` && x.out.error === "org_unreachable" && !g.isError && at === "alpha",
        `C9 · a grant minted by the code before 7.5a (${PRE_SLICE}) acts as its seat in org 1: whoami ${me.out && me.out.id}, orgs ${orgsOf(me.out)}; orgSlug Two ${x.out && x.out.error}; its goal in ${at}`]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    return out;
  },
  async C10() {
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS), S2 = await W.oauth(ANN, W.k2);
    await W.control("two-owner-key", { action: "rotate-key", personId: W.seat2 });
    const s = await W.rpc(S2, "tools/call", { name: "whoami", arguments: {} });
    const a1 = await W.tool(A, "whoami"), a2 = await W.tool(A, "whoami", { orgSlug: W.S.two });
    out.push([s.status === 401 && a1.out.id === W.seat1 && a2.status === 401,
      `C10 · Two's admin rotates Ann's Two key: the SEAT grant ${s.status}; the account grant still acts in One (${a1.out && a1.out.id}), in Two it is refused until she connects again (${a2.status})`]);
    W.w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = ?").run(await pbkdf2("ann-new-passphrase-22", SALT), SALT, ANN);
    const e = await W.rpc(A, "tools/call", { name: "whoami", arguments: {} });
    out.push([e.status === 401 && /invalid_token/.test(e.text), `C10 · the ACCOUNT's passphrase changes: the account grant ${e.status}`]);
    const A2 = await W.oauth(ANN, "ann-new-passphrase-22");
    await W.control("two-owner-key", { action: "remove-person", personId: W.seat2 });
    const r2 = await W.tool(A2, "whoami", { orgSlug: W.S.two }), r1 = await W.tool(A2, "whoami");
    out.push([r2.out.error === "org_unreachable" && r1.out.id === W.seat1 && orgsOf(r1.out) === `${W.S.one}:member*`,
      `C10 · Two's admin removes Ann's Two seat: orgSlug Two ${r2.out.error || r2.out.id}; whoami ${r1.out && r1.out.id}, orgs ${orgsOf(r1.out)}`]);
    return out;
  },
  async C11() {
    const W = await world(), out = [];
    const R = await W.oauth(ANN, ANN_PASS, "mcp:read");
    // a read-only grant's preview stores nothing (no previewId: mcp-client-selftest), so save_knowledge is called as a client would retry it
    const f2 = await W.tool(R, "save_knowledge", { previewId: "P-0000000000000000", items: [goal("ro-g2")], orgSlug: W.S.two });
    const f1 = await W.tool(R, "save_knowledge", { previewId: "P-0000000000000000", items: [goal("ro-g1")], orgSlug: W.S.one });
    out.push([f2.out.error === "insufficient_scope" && f1.out.error === "insufficient_scope" && !W.one("SELECT 1 AS x FROM k_goals WHERE id IN ('ro-g1','ro-g2')"),
      `C11 · a read-only account grant files in neither org (${f2.out.error}, ${f1.out.error})`]);
    return out;
  },
  async C12() {
    const W = await world(), out = [];
    // a copy of src/ (the code under test, or its mutant) whose OAuth form mints a seat grant WITHOUT its stamp, as the code before
    // G2 did ({personId, scope}; the first form, {personId}); one copy each (a module is cached by its path)
    const dirs = [];
    try {
      const seatProps = "  return { personId: seat.id, scope, cred: await credEpoch(seat), ...client };";   // sprint 13, 13.1: the client word rides the props
      const ctx = { waitUntil() {}, passThroughOnException() {} };
      const mint = async (props) => {
        const dir = mkdtempSync(join(ENGINE, ".mcporgs-stampless-"));
        dirs.push(dir);
        cpSync(srcOf(), join(dir, "src"), { recursive: true });
        const f = join(dir, "src", "oauth.js"), t = readFileSync(f, "utf8");
        if (t.split(seatProps).length !== 2) throw new Error("C12: the seat grant's props line is not found once in src/oauth.js (update this selftest with the code)");
        writeFileSync(f, t.replace(seatProps, `  return ${props};`));
        const old = (await import(pathToFileURL(join(dir, "src", "index.js")).href)).default;
        return W.oauth(ANN, W.k2, "mcp:read mcp:write", (req) => old.fetch(req, W.w.env, ctx));
      };
      const T1 = await mint("{ personId: seat.id, scope }"), T0 = await mint("{ personId: seat.id }");
      const c0 = W.changes();
      for (const [label, T] of [["{personId, scope}", T1], ["{personId}", T0]]) {
        const r = await W.rpc(T, "tools/call", { name: "whoami", arguments: {} });
        const p = await W.rpc(T, "tools/call", { name: "preview", arguments: { project: "shop", items: [goal("stampless-g")] } });
        let d = ""; try { d = JSON.parse(r.text).error_description || ""; } catch { d = ""; }
        out.push([r.status === 401 && /invalid_token/.test(r.text) && /made before sharingu bound connections/.test(d) && p.status === 401 && W.changes() === c0,
          `C12 · a grant with no stamp ${label}: whoami ${r.status} (${d.slice(0, 60) || r.text.slice(0, 60)}), preview ${p.status}; ${W.changes() - c0} row(s) written`]);
      }
      const S2 = await W.oauth(ANN, W.k2), A = await W.oauth(ANN, ANN_PASS);
      const s = await W.tool(S2, "whoami"), a = await W.tool(A, "whoami", { orgSlug: W.S.two });
      out.push([!s.isError && s.out.id === W.seat2 && !a.isError && a.out.id === W.seat2,
        `C12 · the stamped grants of the same person still act: the seat grant as ${s.out && (s.out.id || s.out.error)}, the account grant in Two as ${a.out && (a.out.id || a.out.error)}`]);
    } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
    return out;
  },  // ---- sprint 7's review (C1, C4, C5, A1 for grants): each RED on the tree before its fix, each fix's mutant red again ----
  async C13() {
    // C1: a JSON-RPC batch acts in the org its FIRST call names (none: the current org); a later call naming another org is refused
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS);
    const b = await W.call("POST", "/mcp", { key: A, body: [
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: { orgSlug: W.S.two } } }] });
    const res = Array.isArray(b.json) ? b.json : [];
    const first = (() => { try { return JSON.parse(res[0].result.content[0].text); } catch { return {}; } })();
    const second = (() => { try { return JSON.parse(res[1].result.content[0].text); } catch { return {}; } })();
    out.push([first.id === W.seat1 && second.error === "org_unreachable",
      `C13 · a batch whose first call names no org acts in the current org (${first.id === W.seat1 ? "One" : first.id || first.error}); its later call naming Two is ${second.error || "ANSWERED"}`]);
    return out;
  },
  async C14() {
    // C4: on the handshake revision, an account grant acting in another org than its own is never asked a confirm that cannot land
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS);
    const init = await fetchRaw(W, A, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { elicitation: {} }, clientInfo: { name: "t", version: "1" } } });
    const sid = init.headers.get("mcp-session-id");
    const items = [goal("ann-c4")];
    // sprint 19: the confirm is the write tool's (save_knowledge {fileOnConfirm}), on a preview made in Two
    const pv = await W.tool(A, "preview", { project: "shop", items, orgSlug: W.S.two });
    const r = await fetchRaw(W, A, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "save_knowledge", arguments: { previewId: pv.out && pv.out.previewId, items, fileOnConfirm: true, orgSlug: W.S.two } } },
      { "mcp-session-id": sid, accept: "application/json, text/event-stream" });
    const streamed = /event-stream/.test(r.headers.get("content-type") || "");
    let body = {};
    if (streamed) await r.body.cancel(); else { const j = await r.json().catch(() => ({})); try { body = JSON.parse(j.result.content[0].text); } catch { body = {}; } }
    out.push([!!sid && !streamed && body.previewId && body.filed === false && body.confirm && body.confirm.asked === false && /own org/.test(body.confirm.note || "") && !W.one("SELECT 1 AS x FROM k_goals WHERE id = 'ann-c4'"),
      `C14 · the account grant's confirm in Two (not its own org): ${streamed ? "a STREAM (a confirm that never lands)" : `asked ${body.confirm && body.confirm.asked}: "${(body.confirm && body.confirm.note || "").slice(0, 60)}…"`}`]);
    return out;
  },
  async C15() {
    // C5: /mcp takes no cookie — a dead bearer beside a live session cookie is a 401, never the cookie's seat
    const W = await world(), out = [];
    const dead = (await W.call("POST", "/login", { body: { email: ANN, password: W.k2 } })).json.token;
    const live = (await W.call("POST", "/login", { body: { email: ANN, password: ANN_PASS, org: W.S.one } })).json.token;
    W.w.db.prepare("UPDATE tokens SET revoked = 1 WHERE token_hash = ?").run(sha(dead));
    const r = await W.w.fetch(new Request(W.w.origin + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + dead,
      cookie: "__Host-ar_session=" + live, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }) }));
    const j = await r.json().catch(() => ({}));
    out.push([!!live && !(j && j.result) && j && j.error && j.error.code === -32001,
      `C15 · a dead bearer with a live cookie at /mcp: ${j && j.result ? "ANSWERED as the cookie's seat" : `unauthorized (${j && j.error && j.error.code})`}`]);
    return out;
  },
  async C16() {
    // A1 (grants): an account grant whose own org removed its seat never acts in another org by default — a call naming no org is
    // refused (org_unreachable, listing its orgs); a call naming one answers there
    const W = await world(), out = [];
    const A = await W.oauth(ANN, ANN_PASS);
    await W.control("one-owner-key", { action: "remove-person", personId: W.seat1 });
    const c0 = W.changes();
    const bare = await W.tool(A, "whoami"), pv = await W.tool(A, "preview", { project: "shop", items: [goal("ann-c16")] });
    const named = await W.tool(A, "whoami", { orgSlug: W.S.two });
    out.push([bare.out.error === "org_unreachable" && pv.out.error === "org_unreachable" && W.changes() === c0 && !named.isError && named.out.id === W.seat2,
      `C16 · its own org (One) removed its seat: a call naming no org ${bare.out.error || `ANSWERED as ${bare.out.id}`}, a preview ${pv.out.error || "ANSWERED"} (${W.changes() - c0} rows); naming Two answers (${named.out && named.out.id})`]);
    return out;
  },
  async C18() {
    // sprint 13, 13.1: which AI filed it — a client registered as "Claude Code (sharingu)" makes a grant whose filings are stored
    // claude-code (its family word on the grant's props, read with no grant-store lookup); a client registered under a name we do
    // not know files `other`, and so does a bare key on the MCP with no clientInfo
    const W = await world(), out = [];
    const last = () => W.one("SELECT id, client FROM transmission ORDER BY rowid DESC LIMIT 1");
    const note = async (key, what) => {
      const items = [{ contribution: { lane: "leader", kind: "note", what, why: "C18 files it to see which AI is stamped" } }];
      const pv = await W.tool(key, "preview", { project: "alpha", items });
      if (pv.isError || !pv.out.previewId) return { step: "preview", ...pv };
      return { step: "file", ...(await W.tool(key, "file_contribution", { previewId: pv.out.previewId, items })) };
    };
    const CC = await W.oauth(ANN, ANN_PASS, "mcp:read mcp:write", W.w.fetch, W.S.one, "Claude Code (sharingu)");
    const f1 = await note(CC, "c18 from Claude Code"), r1 = last();
    const XX = await W.oauth(ANN, ANN_PASS);
    const f2 = await note(XX, "c18 from a client we do not know"), r2 = last();
    const f3 = await note(W.k1, "c18 from a bare key"), r3 = last();
    out.push([f1.step === "file" && !f1.isError && r1.client === "claude-code" && f2.step === "file" && !f2.isError && r2.client === "other" && r2.id !== r1.id && f3.step === "file" && !f3.isError && r3.client === "other" && r3.id !== r2.id,
      `C18 · a grant from a client registered "Claude Code (sharingu)" files ${r1.client} (${r1.id}); one registered "orgs-selftest" ${r2.client}; a bare key with no clientInfo ${r3.client} (${r3.id})${f1.isError || f2.isError || f3.isError ? ` — ${brief([f1.out, f2.out, f3.out])}` : ""}`]);
    return out;
  },
  async C17() {
    // C2 (sprint 7's review): an admin's reissue ends an ACCOUNT grant's reach into THAT seat, never further, until a fresh sign-in
    const W = await world(), out = [];
    const { resolveReader } = await import(pathToFileURL(join(srcOf(), "core.js")).href);
    const { installOrgSlot } = await import(pathToFileURL(join(srcOf(), "data.js")).href);
    const A = await W.oauth(ANN, ANN_PASS);
    const sess = (await W.call("POST", "/login", { body: { email: ANN, password: ANN_PASS, org: W.S.two, device: "c17" } })).json.token;
    const asSession = async (org) => { const r = await W.w.fetch(new Request(`${W.w.origin}/${org}/whoami`, { headers: { accept: "application/json", cookie: "__Host-ar_session=" + sess, "sec-fetch-site": "same-origin" } }));
      return r.status === 200 ? (await r.json()).id : r.status; };
    // a stamp minted before the epoch existed (the passphrase digest alone, 16 hex), as a grant connected before 8.3a carries it
    const acct = W.one("SELECT id, pass_hash, pass_salt FROM accounts WHERE email = ?", ANN);
    const oldCred = sha(`account:${acct.pass_hash}:${acct.pass_salt}`).slice(0, 16);
    const asOld = async (org) => ((await resolveReader(new Request(W.w.origin + "/mcp"), installOrgSlot({ ...W.w.env }), new URL(W.w.origin + "/mcp"),
      { props: { personId: W.seat1, accountId: acct.id, org: 1, scope: ["mcp:read"], cred: oldCred }, wantOrg: org }).catch(() => null)) || {}).id || "refused";
    const pre = [(await W.tool(A, "whoami", { orgSlug: W.S.two })).out.id, await asOld(W.S.two)];
    await W.control("two-owner-key", { action: "rotate-key", personId: W.seat2 });
    const t2 = await W.tool(A, "whoami", { orgSlug: W.S.two }), t1 = await W.tool(A, "whoami");
    out.push([pre.join() === `${W.seat2},${W.seat2}` && t2.status === 401 && /invalid_token/.test(t2.text) && /Connect again/.test(t2.text) && t1.out.id === W.seat1,
      `C17 · Two's admin reissues Ann's Two seat: her account grant naming Two ${t2.status} (it acted there before: ${pre[0] === W.seat2}), in One it acts on (${t1.out && t1.out.id})`]);
    const o2 = await asOld(W.S.two), o1 = await asOld(W.S.one), s2 = await asSession(W.S.two);
    out.push([o2 === "refused" && o1 === W.seat1, `C17 · a stamp from before the epoch: refused in the reissued seat (${o2}), acts in One (${o1})`]);
    out.push([s2 === W.seat2, `C17 · her ACCOUNT session reads on in Two (${s2}): an admin's reissue ends no session of the account`]);
    await new Promise((r) => setTimeout(r, 5));   // a fresh sign-in comes after the reissue
    const A2 = await W.oauth(ANN, ANN_PASS), n2 = await W.tool(A2, "whoami", { orgSlug: W.S.two });
    out.push([n2.out.id === W.seat2, `C17 · she connects again: the new grant acts in Two (${n2.out && (n2.out.id || n2.out.error)})`]);
    // set-password: the admin's other reissue (allowed on a seat whose account holds no other: Bob, in Two alone)
    await W.control("two-owner-key", { action: "add-person", name: "Bob", email: "bob@orgs.test" });
    const bob = W.one("SELECT id FROM people WHERE email = 'bob@orgs.test' AND org = 2").id;
    W.w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = ?").run(await pbkdf2("bob-account-passphrase-1", SALT), SALT, "bob@orgs.test");
    const B = await W.oauth("bob@orgs.test", "bob-account-passphrase-1", undefined, undefined, W.S.two);
    const b0 = await W.tool(B, "whoami");
    const flash = await W.control("two-owner-key", { action: "set-password", personId: bob, password: "bob-seat-new-pass" });
    const b1 = await W.tool(B, "whoami");
    out.push([b0.out.id === bob && /Passphrase updated/.test(flash) && b1.status === 401,
      `C17 · Two's admin sets Bob's seat passphrase: his account grant acted (${b0.out && b0.out.id === bob}), then ${b1.status}`]);
    return out;
  },
};

const MUTANTS = [
  // sprint 7's review
  { name: "a batch acts in the first org ANY call names (C1)", file: "src/mcp.js",
    from: 'if (m.method === "tools/call") return isObj(m.params.arguments) && typeof m.params.arguments.orgSlug === "string" ? normOrgArg(m.params.arguments.orgSlug) : "";',
    to: 'if (m.method === "tools/call" && isObj(m.params.arguments) && typeof m.params.arguments.orgSlug === "string" && normOrgArg(m.params.arguments.orgSlug)) return normOrgArg(m.params.arguments.orgSlug);', red: ["C13"] },
  { name: "a confirm asked in an org it cannot land in (C4)", file: "src/mcp.js",
    from: "const offOrg = !!(who && who.grantAccount && ctx && isObj(ctx.props) && Number(who.org) !== Number(ctx.props.org));", to: "const offOrg = false;", red: ["C14"] },
  { name: "an account grant acts in another org by default when its own lost the seat (A1)", file: "src/mcp.js",
    from: 'if ((asked == null || asked === "") && !(person && person.grantOrgGone)) return null;', to: 'if (asked == null || asked === "") return null;', red: ["C16"] },
  { name: "a seat's secret makes an ACCOUNT grant (a seat grant switches orgs)", file: "src/oauth.js",
    from: 'if (signin.session === "account" && signin.account && signin.account.id) {', to: "if (signin.account && signin.account.id) {", red: ["C1", "C5"] },
  { name: "the call's org unchecked", file: "src/mcp.js",
    from: "    const refused = await orgArgRefused(isObj(a) ? a.orgSlug : undefined, person, env);\n    if (refused) return refused;\n", to: "", red: ["C4", "C5", "C6"] },
  { name: "an account grant outlives its passphrase", file: "src/core.js",
    from: "    if (!props.cred || !(await accountGrantStands(props.cred, { pass_hash: account_hash, pass_salt: account_salt }, reissued_at))) return null;\n", to: "", red: ["C10"] },
  // sprint 8, 8.3a (the sprint-7 review's C2): the per-seat grants epoch
  { name: "an account grant ignores the seat's grants epoch (an admin's reissue never ends its reach)", file: "src/oauthgrants.js",
    from: '  if (reissuedAt == null || reissuedAt === "") return true;', to: "  return true;", red: ["C10", "C17"] },
  { name: "the grant path never reads the seat's epoch", file: "src/accounts.js",
    from: "p.org{cols}, p.reissued_at, a.pass_hash AS account_hash", to: "p.org{cols}, a.pass_hash AS account_hash", red: ["C17"] },
  { name: "rotate-key bumps no epoch", file: "src/admin.js",
    from: ".bind(kh, ph, saltHex, now(), personId)", to: ".bind(kh, ph, saltHex, null, personId)", red: ["C10", "C17"] },
  { name: "set-password bumps no epoch", file: "src/admin.js",
    from: ".bind(ph, saltHex, now(), personId).run();   // 8.3a: the bump", to: ".bind(ph, saltHex, null, personId).run();", red: ["C17"] },
  { name: "an account grant acts as a removed seat", file: "src/accounts.js",
    from: "FROM accounts a JOIN people p ON p.account_id = a.id AND p.active = 1 WHERE", to: "FROM accounts a JOIN people p ON p.account_id = a.id WHERE", red: ["C10"] },
  { name: "a grant with no stamp acts (7.5b: the check as it stood before)", file: "src/core.js",
    from: "      if (props.cred !== await credEpoch({ key_hash, pass_hash })) return null;", to: "      if (props.cred && props.cred !== await credEpoch({ key_hash, pass_hash })) return null;", red: ["C12"] },
  { name: "the grant's client word ignored at the door (13.1)", file: "src/mcp.js",
    from: 'oauth: props && typeof props.client === "string" ? props.client : null,', to: "oauth: null,", red: ["C18"] },
  { name: "the grant made without its client's name (13.1)", file: "src/oauth.js",
    from: "const props = await grantPropsOf(signin, authRequest.scope, clientName);", to: "const props = await grantPropsOf(signin, authRequest.scope);", red: ["C18"] },
  { name: "an account grant ignores the org the call names (always its current org)", file: "src/accounts.js",
    from: "ORDER BY (p.org = (SELECT o.id FROM org o WHERE o.slug = ?2)) DESC, (p.org = ?3) DESC", to: "ORDER BY (p.org = ?3) DESC, (p.org = (SELECT o.id FROM org o WHERE o.slug = ?2)) DESC", red: ["C2", "C3"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);

for (const m of MUTANTS) {
  let dir = null;
  try {
    dir = mkdtempSync(join(ENGINE, ".mcporgs-mutation-"));
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const p = join(dir, m.file), s = readFileSync(p, "utf8");
    if (s.split(m.from).length !== 2) { ok(false, `mutant "${m.name}": its needle is not found exactly once in ${m.file} (update this selftest with the code)`); continue; }
    writeFileSync(p, s.replace(m.from, m.to));
    MUT = { src: join(dir, "src") };
    const reds = [];
    // red by an assertion of the case, never by a crash (a mutant that only breaks the world proves nothing)
    for (const name of m.red) { const res = await runCase(name); reds.push(res.some(([c, l]) => !c && !/ threw: /.test(l)) && !res.some(([, l]) => / threw: /.test(l))); }
    ok(reds.every(Boolean), `mutant "${m.name}" turns ${m.red.join(" and ")} red (${reds.map((r, i) => `${m.red[i]} ${r ? "red" : "GREEN"}`).join(", ")})`);
  } finally { MUT = {}; if (dir) rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${failed ? "✗" : "✓"} mcp-orgs selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
