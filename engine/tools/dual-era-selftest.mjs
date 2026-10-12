// tools/dual-era-selftest.mjs — D3b: the door speaks two MCP revisions on one endpoint, offline. A REAL SQLite built from
// boot.sql (node:sqlite) behind the REAL src/index.js handler, driven with Request/Response; the OAuth read-only grant through
// src/mcp.js handleMcp with the provider's props. Exit 1 on any failure. The live door: tools/mcp-client-selftest.mjs (d)
// and tools/smoke/s23-card-confirm.mjs.
//   1. era and validation (2026-07-28): server/discover before auth (no session id, ever); in order an unsupported version
//      (400 -32022 with supported/requested), no clientCapabilities (400 -32602), the mirror headers (400 -32020: a value
//      that differs, a malformed one, MCP-Protocol-Version or Mcp-Method absent; an absent Mcp-Name tolerated, a Base64
//      one decoded); a method the revision does not define (404 -32601, ping included); a notification 202; a batch holding
//      a modern request 400 -32600; a request with no id, an id or a method that is not a string or number, 400 -32600; a
//      caller's value is never converted to text (a non-string method or tool name: a clean answer, not a 500)
//   2. every modern result carries resultType and the server's name; the lists and resources/read their caching hint; the
//      bodies are the legacy bodies; a resource not found or a project refused is -32602, never -32002/-32003
//   3. the legacy revision is unchanged by the modern one (initialize, tools/call without resultType, an unknown method
//      still 200 + -32601, ping)
//   4. the confirm as MRTR (src/confirm.js): input_required with ONE elicitation (form) and the state; the row keyed
//      sha256(nonce:person:mrtr) for 10 minutes; accept files exactly that preview (one UPDATE read of the row before file);
//      decline, cancel and accept with file:false file nothing; the attacks: a tampered state, another person's state, a
//      replay, an expired state, other items (refused by the digest), a retry without elicitation declared, a retry with no
//      answer; a client without elicitation and a read-only grant are never asked; the card's _meta for the Apps extension
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const { default: handler } = await imp("src/index.js");
const M = await imp("src/mcp.js");
const { credEpoch } = await imp("src/oauthgrants.js");   // 7.5b: an OAuth grant carries its stamp (a grant with none is refused)
const C = await imp("src/confirm.js");

let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ` — ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}` : ""}`); } };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const T0 = "2026-09-01T00:00:00.000Z";
const V = "2026-07-28";

// ---- the org: one project, the owner and a seated member ----
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
for (const [id, role, key] of [["p-o", "owner", "owner-key"], ["p-m", "member", "mem-key"]]) db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,1,?,1)").run(id, id, `${id}@x.test`, role, sha(key), T0);
db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,?)").run(T0);
db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-m','alpha','member',?)").run(T0);
const log = [];
const exec = (sql, args) => { log.push(sql); return /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; };
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
const env = asOrg({ DB: { prepare: (s) => stmt(s), batch: async (l) => { db.exec("BEGIN"); try { const o = l.map((s) => s._exec()); db.exec("COMMIT"); return o; } catch (e) { db.exec("ROLLBACK"); throw e; } } },
  BRAIN: { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) } });   // signed in to org 1
const ctx = { waitUntil() {}, passThroughOnException() {} };

// ---- a modern client ----
const FORM = { elicitation: {} };
const UI = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };
let n = 0;
const metaOf = (caps) => ({ [M.META_PROTOCOL]: V, "io.modelcontextprotocol/clientInfo": { name: "dual-era-selftest", version: "1" }, ...(caps === null ? {} : { [M.META_CAPS]: caps }) });
// mirrors(body) -> the three headers a conforming client sends for this body
const mirrors = (b) => { const nm = b.method === "resources/read" ? b.params && b.params.uri : b.params && b.params.name; return { "mcp-protocol-version": b.params._meta[M.META_PROTOCOL], "mcp-method": b.method, ...(typeof nm === "string" ? { "mcp-name": nm } : {}) }; };
async function send(body, { key = "owner-key", headers } = {}) {
  const h = { "content-type": "application/json", accept: "application/json, text/event-stream", ...(key ? { authorization: `Bearer ${key}` } : {}), ...(headers === undefined ? (Array.isArray(body) || !body.params || !body.params._meta ? {} : mirrors(body)) : headers) };
  const r = await handler.fetch(new Request("https://org.test/mcp", { method: "POST", headers: h, body: typeof body === "string" ? body : JSON.stringify(body) }), env, ctx);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
  return { status: r.status, j, t, sid: r.headers.get("mcp-session-id") };
}
const modern = (method, params = {}, caps = {}) => ({ jsonrpc: "2.0", id: ++n, method, params: { ...params, _meta: metaOf(caps) } });
const textOf = (j) => { try { return JSON.parse(j.result.content[0].text); } catch { return null; } };
const call = async (name, args, { caps = FORM, key, extra = {} } = {}) => { const r = await send(modern("tools/call", { name, arguments: args, ...extra }, caps), { key }); return { ...r, out: r.j && r.j.result && r.j.result.content ? textOf(r.j) : null }; };
const goal = (id) => ({ kind: "goal", op: "upsert", data: { id, title: id, parent: "g-root", dimensions: [] } });
const goalIds = () => db.prepare("SELECT id FROM k_goals WHERE project = 'alpha'").all().map((r) => r.id);
const SERVER = (j) => j && j.result && j.result._meta && j.result._meta[M.META_SERVER];

// the project's root goal, through the two calls on the handshake revision
{
  const items = [{ kind: "goal", op: "upsert", data: { id: "g-root", title: "Root", parent: null, dimensions: [] } }];
  const pv = textOf((await send({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "preview", arguments: { project: "alpha", items } } })).j);
  const fl = textOf((await send({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "file", arguments: { previewId: pv.previewId, items } } })).j);
  if (!fl || !fl.complete) { console.log("setup: the root goal did not file", JSON.stringify(fl).slice(0, 300)); process.exit(1); }
}

// ===================== 1 · era and validation =====================
console.log("1 · era and validation");
{
  const init = await send({ jsonrpc: "2.0", id: ++n, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } });
  const d = await send(modern("server/discover", {}, FORM), { headers: { ...mirrors(modern("server/discover", {}, FORM)), "mcp-session-id": "sg1e." + "a".repeat(32) } });
  const r = d.j && d.j.result;
  ok(d.status === 200 && r && r.resultType === "complete" && JSON.stringify(r.supportedVersions) === JSON.stringify(M.MODERN_PROTOCOLS), "server/discover: 200, resultType complete, supportedVersions [2026-07-28]", d.j);
  ok(r && JSON.stringify(r.capabilities) === JSON.stringify(init.j.result.capabilities) && r.instructions === init.j.result.instructions && JSON.stringify(SERVER(d.j)) === JSON.stringify(init.j.result.serverInfo), "its capabilities, instructions and serverInfo are initialize's own");
  ok(r && r.ttlMs === 0 && r.cacheScope === "public", "its caching hint: ttlMs 0, public (it holds nothing of the caller's)");
  ok(!d.sid, "no session id on a modern answer, even with elicitation declared and an Mcp-Session-Id sent");
  // before auth: handleMcp with no credential at all (the OAuth provider in front answers 401 to a request with none, as for initialize)
  const bare = await M.handleMcp({ json: async () => modern("server/discover", {}, {}), headers: new Headers(mirrors(modern("server/discover", {}, {}))) }, env, {}, new URL("https://org.test/mcp"), { MCP_TOOLS: [], VERSION: "t", workerName: "w" });
  ok(bare.status === 200 && (await bare.json()).result.supportedVersions[0] === V, "server/discover answers before auth, as initialize does");

  const bad = await send({ jsonrpc: "2.0", id: 7, method: "tools/list", params: { _meta: { ...metaOf({}), [M.META_PROTOCOL]: "1900-01-01" } } }, { headers: { "mcp-protocol-version": "1900-01-01", "mcp-method": "tools/list" } });
  ok(bad.status === 400 && bad.j.error.code === -32022 && bad.j.error.message === "Unsupported protocol version" && JSON.stringify(bad.j.error.data) === JSON.stringify({ supported: [V], requested: "1900-01-01" }) && bad.j.id === 7, "an unsupported version: 400 -32022 {supported, requested}", bad.j);
  const noCaps = await send(modern("tools/list", {}, null));
  ok(noCaps.status === 400 && noCaps.j.error.code === -32602 && /clientCapabilities/.test(noCaps.j.error.message), "no clientCapabilities: 400 -32602", noCaps.j);
  const tl = modern("tools/list", {}, {});
  const hv = await send(tl, { headers: { ...mirrors(tl), "mcp-protocol-version": "2025-06-18" } });
  ok(hv.status === 400 && hv.j.error.code === -32020 && /MCP-Protocol-Version/.test(hv.j.error.message), "MCP-Protocol-Version unlike the body's: 400 -32020", hv.j);
  const hm = await send(tl, { headers: { ...mirrors(tl), "mcp-method": "tools/call" } });
  ok(hm.status === 400 && hm.j.error.code === -32020 && /Mcp-Method/.test(hm.j.error.message), "Mcp-Method unlike the method: 400 -32020", hm.j);
  const nov = await send(tl, { headers: { "mcp-method": "tools/list" } });
  const nom = await send(tl, { headers: { "mcp-protocol-version": V } });
  ok(nov.status === 400 && nov.j.error.code === -32020 && nom.status === 400 && nom.j.error.code === -32020, "MCP-Protocol-Version or Mcp-Method absent: 400 -32020 (the measured client sends both)", [nov.j, nom.j]);
  const wc = modern("tools/call", { name: "whoami", arguments: {} }, {});
  const hn = await send(wc, { headers: { ...mirrors(wc), "mcp-name": "missing" } });
  ok(hn.status === 400 && hn.j.error.code === -32020 && /Mcp-Name/.test(hn.j.error.message), "Mcp-Name unlike params.name: 400 -32020", hn.j);
  const b64 = await send(wc, { headers: { ...mirrors(wc), "mcp-name": "=?base64?" + Buffer.from("whoami").toString("base64") + "?=" } });
  ok(b64.status === 200 && b64.j.result && !b64.j.result.isError, "Mcp-Name in its =?base64?…?= form is decoded before the comparison");
  const b64bad = await send(wc, { headers: { ...mirrors(wc), "mcp-name": "=?base64?!!!?=" } });
  ok(b64bad.status === 400 && b64bad.j.error.code === -32020 && /malformed/.test(b64bad.j.error.message), "a malformed Base64 Mcp-Name: 400 -32020", b64bad.j);
  const { "mcp-name": _, ...noName } = mirrors(wc);
  const nn = await send(wc, { headers: noName });
  ok(nn.status === 200 && nn.j.result && nn.j.result.resultType === "complete", "an absent Mcp-Name is tolerated (a stated deviation: SPEC-NOTES.md)");
  ok(M.headerText("=?base64?" + Buffer.from("Hello, 世界").toString("base64") + "?=") === "Hello, 世界" && M.headerText("plain") === "plain" && M.headerText("x\u0001") === null && M.headerText("=?base64?abc?=") === null, "headerText: Base64 to UTF-8, plain kept, a control character or a bad length refused");
  const rr = modern("resources/read", { uri: "brain://goals" }, {});
  const hr = await send(rr, { headers: { ...mirrors(rr), "mcp-name": "brain://gtm" } });
  ok(hr.status === 400 && hr.j.error.code === -32020, "resources/read: Mcp-Name is params.uri", hr.j);
  for (const m of ["ping", "initialized", "prompts/list", "logging/setLevel", "no/such"]) {
    const u = await send(modern(m, {}, {}));
    ok(u.status === 404 && u.j.error.code === -32601, `a method the revision does not define (${m}): 404 -32601`, u.j);
  }
  const note = await send({ jsonrpc: "2.0", method: "notifications/initialized", params: { _meta: metaOf({}) } }, { headers: {} });
  ok(note.status === 202 && note.t === "", "a modern notification: 202, no body");
  const batch = await send([modern("tools/list", {}, {}), { jsonrpc: "2.0", id: 99, method: "ping" }]);
  ok(batch.status === 400 && batch.j.error.code === -32600, "a batch holding a modern request: 400 -32600, refused whole", batch.j);
  const noId = await send({ jsonrpc: "2.0", method: "tools/list", params: { _meta: metaOf({}) } }, { headers: { "mcp-protocol-version": V, "mcp-method": "tools/list" } });
  ok(noId.status === 400 && noId.j.error.code === -32600, "a modern request with no id: 400 -32600", noId.j);
  ok(M.isModern({ method: "tools/list", params: { _meta: { [M.META_PROTOCOL]: V } } }) && !M.isModern({ method: "initialize", params: { _meta: { [M.META_PROTOCOL]: V } } }) && !M.isModern({ method: "tools/list", params: {} }) && !M.isModern({ id: 1, result: {} }), "the era: _meta's version makes a request modern; initialize, a bare request and a response stay legacy");
}

// ===================== 2 · the modern bodies =====================
// the review's attacks on the shape of a request (D3b review, 2026-10-03): nothing a caller sends is converted to text by
// the door; a malformed shape is a clean 400 (modern) or the legacy answer, never a thrown TypeError (a 500)
{
  const weird = { toString: 1 };
  const m1 = await send({ jsonrpc: "2.0", id: ++n, method: weird, params: { _meta: metaOf({}) } }, { headers: { "mcp-protocol-version": V, "mcp-method": "x" } });
  ok(m1.status === 400 && m1.j && m1.j.error && m1.j.error.code === -32600, "modern: a method that is not a string is 400 -32600, not a thrown conversion", m1.t.slice(0, 120));
  const m2 = await send(modern("tools/call", { name: weird, arguments: {} }, {}), { headers: { "mcp-protocol-version": V, "mcp-method": "tools/call", "mcp-name": "x" } });
  ok(m2.status === 400 && m2.j && m2.j.error && m2.j.error.code === -32020, "modern: a tool name that is not a string, with an Mcp-Name header, is 400 -32020 (compared as empty)", m2.t.slice(0, 120));
  const m3 = await send(modern("tools/call", { name: weird, arguments: {} }, {}), { headers: { "mcp-protocol-version": V, "mcp-method": "tools/call" } });
  ok(m3.status === 400 && m3.j && m3.j.error && m3.j.error.code === -32602, "modern: a tool name that is not a string, no Mcp-Name, is 400 -32602", m3.t.slice(0, 120));
  const m4 = await send({ jsonrpc: "2.0", id: { a: 1 }, method: "tools/list", params: { _meta: metaOf({}) } }, { headers: { "mcp-protocol-version": V, "mcp-method": "tools/list" } });
  ok(m4.status === 400 && m4.j && m4.j.error && m4.j.error.code === -32600, "modern: an id that is neither a string nor a number is 400 -32600", m4.t.slice(0, 120));
  const long = "1900-" + "x".repeat(200000);
  const m5 = await send({ jsonrpc: "2.0", id: ++n, method: "tools/list", params: { _meta: { ...metaOf({}), [M.META_PROTOCOL]: long } } }, { headers: { "mcp-protocol-version": long, "mcp-method": "tools/list" } });
  ok(m5.status === 400 && m5.j && m5.j.error && m5.j.error.code === -32022 && m5.j.error.data.requested.length === 80, "modern: an unsupported version is echoed at most 80 characters long", m5.t.slice(0, 120));
  const l1 = await send({ jsonrpc: "2.0", id: ++n, method: weird });
  ok(l1.status === 200 && l1.j && l1.j.error && l1.j.error.code === -32601 && /object/.test(l1.j.error.message), "legacy: a method that is not a string is 200 -32601 naming the type, not a thrown conversion", l1.t.slice(0, 120));
  const l2 = await send({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: weird, arguments: {} } });
  ok(l2.status === 200 && l2.j && l2.j.result && l2.j.result.isError && /unknown tool: object/.test(l2.j.result.content[0].text), "legacy: a tool name that is not a string is the unknown-tool answer naming the type", l2.t.slice(0, 160));
}

console.log("2 · the modern bodies");
{
  const legacy = async (method, params) => (await send({ jsonrpc: "2.0", id: ++n, method, ...(params ? { params } : {}) })).j;
  const strip = (r) => { const { resultType, ttlMs, cacheScope, _meta, ...rest } = r; const m = { ...(_meta || {}) }; delete m[M.META_SERVER]; return Object.keys(m).length ? { ...rest, _meta: m } : rest; };
  for (const [method, params, cached] of [["tools/list", null, true], ["resources/list", null, true], ["resources/templates/list", null, true], ["resources/read", { uri: "brain://goals" }, true], ["resources/read", { uri: "ui://sharingu/card" }, true], ["tools/call", { name: "whoami", arguments: {} }, false]]) {
    const m = await send(modern(method, params || {}, {}));
    const l = await legacy(method, params);
    const r = m.j && m.j.result;
    ok(m.status === 200 && r && r.resultType === "complete" && SERVER(m.j) && SERVER(m.j).name === "sharingu" && typeof SERVER(m.j).version === "string", `${method}${params && params.uri ? ` ${params.uri}` : ""}: resultType complete and _meta serverInfo`, m.j && (m.j.error || Object.keys(r || {})));
    ok(cached ? r && r.ttlMs === 0 && r.cacheScope === "private" : r && !("ttlMs" in r), `${method}: ${cached ? "ttlMs 0, private" : "no caching hint (a call is not cacheable)"}`);
    ok(r && JSON.stringify(strip(r)) === JSON.stringify(l.result), `${method}: the same body as the handshake revision's`);
    ok(!("resultType" in l.result), `${method}: the handshake revision's answer carries no resultType (unchanged)`);
  }
  const nf = await send(modern("resources/read", { uri: "brain://goal/none" }, {}));
  ok(nf.status === 200 && nf.j.error && nf.j.error.code === -32602, "a resource not found: -32602 (the revision retired -32002)", nf.j);
  const lnf = await legacy("resources/read", { uri: "brain://goal/none" });
  ok(lnf.error.code === -32002, "…the handshake revision still answers -32002");
  const pf = await send(modern("resources/read", { uri: "brain://goals?project=zzz" }, {}), { key: "mem-key" });
  ok(pf.j.error && pf.j.error.code === -32602 && /project_forbidden/.test(pf.j.error.message), "a project refused: -32602, never the legacy -32003", pf.j);
  const unauth = await send(modern("tools/list", {}, {}), { key: null });
  ok(unauth.status === 401, "no credential on a modern request: the OAuth provider in front answers 401, as for any request");
}

// ===================== 3 · the legacy revision, unchanged =====================
console.log("3 · the handshake revision");
{
  const i = await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { elicitation: {} } } });
  ok(i.status === 200 && i.j.result.protocolVersion === "2025-06-18" && /^sg1e\./.test(i.sid || ""), "initialize: 2025-06-18 and a session id for a client that declared elicitation");
  const u = await send({ jsonrpc: "2.0", id: 2, method: "no/such" });
  ok(u.status === 200 && u.j.error.code === -32601, "an unknown legacy method: still 200 + -32601 (a dual-era client reads that as legacy)");
  const p = await send({ jsonrpc: "2.0", id: 3, method: "ping" });
  ok(p.status === 200 && JSON.stringify(p.j.result) === "{}", "ping on the handshake revision: {}");
  const d = await send({ jsonrpc: "2.0", id: 4, method: "server/discover", params: {} });
  ok(d.status === 200 && d.j.error.code === -32601, "server/discover without _meta is a legacy request: -32601 in a 200, as before");
}

// ===================== 4 · the confirm as MRTR =====================
console.log("4 · the confirm (MRTR)");
const ask = async (gid, o = {}) => call("preview", { project: "alpha", items: [goal(gid)], fileOnConfirm: true }, o);
const retry = async (gid, state, answer, o = {}) => call("preview", { project: "alpha", items: o.items || [goal(gid)], fileOnConfirm: true }, { caps: o.caps || FORM, key: o.key, extra: { requestState: state, ...(answer === undefined ? {} : { inputResponses: { file: answer } }) } });
const YES = { action: "accept", content: { file: true } };
const summaryOf = (pid) => JSON.parse(db.prepare("SELECT summary FROM previews WHERE id = ?").get(pid).summary);
{
  const a = await ask("g-yes");
  const r = a.j && a.j.result;
  ok(a.status === 200 && r && r.resultType === "input_required" && SERVER(a.j), "a declared client's preview {fileOnConfirm}: resultType input_required (and the server's name)", a.j);
  const req = r && r.inputRequests && r.inputRequests.file;
  ok(req && Object.keys(r.inputRequests).length === 1 && req.method === "elicitation/create" && req.params.mode === "form" && req.params.requestedSchema.properties.file.type === "boolean" && req.params.requestedSchema.required[0] === "file" && /sharingu/.test(req.params.message), "ONE input request: elicitation/create, form mode, the one-boolean form, the preview's text", req);
  ok(r && /^sg2\.P-[0-9a-f]{16}\.[0-9a-f]{32}$/.test(r.requestState) && !("ttlMs" in r) && !("content" in r), "the requestState sg2.<previewId>.<nonce>; no caching hint, no content on an interim answer");
  const st = C.parseRequestState(r.requestState);
  const sm = summaryOf(st.previewId);
  ok(sm.confirm && sm.confirm.key === sha(`${st.nonce}:p-o:mrtr`) && !JSON.stringify(sm).includes(st.nonce), "the row holds the key sha256(nonce:person:mrtr), never the nonce");
  const win = Date.parse(sm.confirm.until) - Date.now();
  ok(win > 9 * 60 * 1000 && win <= C.MRTR_WINDOW_MS && C.MRTR_WINDOW_MS === 10 * 60 * 1000, `the window: 10 minutes (${Math.round(win / 1000)} s left)`);
  ok(!goalIds().includes("g-yes"), "nothing filed before the answer");
  // attacks while it is open
  const tampered = r.requestState.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  const t1 = await retry("g-yes", tampered, YES);
  ok(t1.status === 400 && t1.j.error.code === -32602 && /^confirm_not_open: /.test(t1.j.error.message), "attack: a tampered state: 400 -32602 confirm_not_open", t1.j);
  const t2 = await retry("g-yes", "anything at all", YES);
  ok(t2.status === 400 && t2.j.error.code === -32602 && /^confirm_not_open: /.test(t2.j.error.message), "attack: a state of no known form: the same refusal");
  const t3 = await retry("g-yes", r.requestState, YES, { key: "mem-key" });
  ok(t3.status === 400 && t3.j.error.code === -32602 && t3.j.error.message === t1.j.error.message, "attack: another person (a seated member) with the owner's state: the same refusal, never which binding failed", t3.j);
  const t4 = await retry("g-yes", r.requestState, YES, { caps: {} });
  ok(t4.status === 400 && t4.j.error.code === -32021 && t4.j.error.data.requiredCapabilities.elicitation, "a retry that does not declare elicitation: 400 -32021, nothing recorded", t4.j);
  const t5 = await retry("g-yes", r.requestState, undefined);
  ok(t5.status === 400 && t5.j.error.code === -32602 && /^bad_answer/.test(t5.j.error.message), "a retry with no answer: 400 -32602 bad_answer, nothing recorded", t5.j);
  ok(!summaryOf(st.previewId).confirm.answer && !goalIds().includes("g-yes"), "…after every refusal: no answer recorded, nothing filed");
  // the answer: one UPDATE of the row, then the same file path
  const at = log.length;
  const y = await retry("g-yes", r.requestState, YES);
  const previewsSql = log.slice(at).filter((s) => /\bpreviews\b/.test(s));
  ok(y.status === 200 && y.j.result.resultType === "complete" && y.out && y.out.complete === true && y.out.confirm && y.out.confirm.asked === true && y.out.confirm.answer === "accept" && y.out.confirm.filed === true, "accept: the receipt, filed", y.j && (y.j.error || y.out && y.out.confirm));
  ok(y.out && y.out.previewId === st.previewId && goalIds().includes("g-yes"), "exactly the preview the state named; the goal is in the project");
  ok(previewsSql.length >= 1 && /^UPDATE previews SET summary/.test(previewsSql[0]) && previewsSql.filter((s) => /^UPDATE previews SET summary/.test(s)).length === 1, `the answer is ONE conditional UPDATE of the row (then file's own reads): ${previewsSql.length} previews statements in all, ${previewsSql.length - 1} of them file's`);
  const replay = await retry("g-yes", r.requestState, YES);
  ok(replay.status === 400 && replay.j.error.code === -32602 && /^confirm_not_open/.test(replay.j.error.message), "attack: a replay of the state: refused, nothing filed twice", replay.j);
  ok(db.prepare("SELECT COUNT(*) AS c FROM k_goals WHERE id = 'g-yes'").get().c === 1, "…the goal is filed once");
}
for (const [label, answer, word] of [["decline", { action: "decline" }, "decline"], ["cancel", { action: "cancel" }, "cancel"], ["accept with file:false", { action: "accept", content: { file: false } }, "decline"]]) {
  const gid = `g-${label.replace(/[^a-z]/g, "").slice(0, 12)}`;
  const a = await ask(gid);
  const at = log.length;
  const d = await retry(gid, a.j.result.requestState, answer);
  const sqls = log.slice(at);
  ok(d.status === 200 && d.j.result.resultType === "complete" && d.out && d.out.confirm && d.out.confirm.asked === true && d.out.confirm.answer === word && d.out.confirm.filed === false && d.out.confirm.note === C.ANSWER_NOTE[word] && /^P-/.test(d.out.previewId), `${label}: answer ${word}, nothing filed, said, the previewId kept`, d.out);
  ok(!goalIds().includes(gid), `${label}: the goal is not in the project`);
  ok(sqls.filter((s) => /\bpreviews\b/.test(s)).length === 1, `${label}: the retry touches the preview row once (the UPDATE)`);
}
{
  // an expired state: the window closed (the row's until moved into the past)
  const a = await ask("g-late");
  const st = C.parseRequestState(a.j.result.requestState);
  db.prepare("UPDATE previews SET summary = json_set(summary, '$.confirm.until', ?) WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), st.previewId);
  const late = await retry("g-late", a.j.result.requestState, YES);
  ok(late.status === 400 && late.j.error.code === -32602 && /^confirm_not_open/.test(late.j.error.message) && !goalIds().includes("g-late"), "attack: an expired state: refused, nothing filed", late.j);
  // other items than the preview's: the answer is recorded, file refuses them by the digest, nothing is filed
  const b = await ask("g-orig");
  const other = await retry("g-orig", b.j.result.requestState, YES, { items: [goal("g-swapped")] });
  ok(other.status === 200 && other.j.result.isError === true && other.out && other.out.error === "preview_changed" && other.out.confirm && other.out.confirm.filed === false, "attack: a retry carrying other items: file refuses them (preview_changed), nothing filed", other.out);
  ok(!goalIds().includes("g-orig") && !goalIds().includes("g-swapped"), "…neither the previewed nor the swapped goal is in the project");
  // never asked: a client without elicitation, a preview not ready, a read-only grant
  const plain = await ask("g-plain", { caps: {} });
  ok(plain.status === 200 && plain.j.result.resultType === "complete" && plain.out.confirm && plain.out.confirm.asked === false && plain.out.confirm.note === C.NOT_ASKED.capability && plain.out.previewId && !("confirmUntil" in plain.out), "a client that did not declare elicitation: the plain preview, not asked, said (never an inputRequests)", plain.out && plain.out.confirm);
  ok(!summaryOf(plain.out.previewId).confirm, "…its row holds no confirm");
  const nr = await call("preview", { project: "alpha", items: [goal("g-nr"), { contribution: { lane: "code", what: "x" } }], fileOnConfirm: true });
  ok(nr.j.result.resultType === "complete" && nr.out.confirm && nr.out.confirm.asked === false && nr.out.notReady > 0, "a preview with an item not ready: not asked, said", nr.out.confirm);
  const ro = await M.handleMcp({ json: async () => modern("tools/call", { name: "preview", arguments: { project: "alpha", items: [goal("g-ro")], fileOnConfirm: true } }, FORM), headers: new Headers({ "mcp-protocol-version": V, "mcp-method": "tools/call", "mcp-name": "preview" }) },
    env, { props: { personId: "p-o", scope: ["mcp:read"], cred: await credEpoch(db.prepare("SELECT key_hash, pass_hash FROM people WHERE id = 'p-o'").get()) } }, new URL("https://org.test/mcp"), { MCP_TOOLS: [{ name: "preview", project: true, stores: true }, { name: "file", write: true }], VERSION: "t", workerName: "w" });
  const roj = await ro.json();
  const roOut = JSON.parse(roj.result.content[0].text);
  ok(roj.result.resultType === "complete" && roOut.previewId === null && roOut.confirm && roOut.confirm.asked === false, "a read-only grant (OAuth mcp:read): nothing stored, nothing asked", roOut.confirm);
  const c = await ask("g-ro2");
  const roRetry = await M.handleMcp({ json: async () => modern("tools/call", { name: "preview", arguments: { project: "alpha", items: [goal("g-ro2")], fileOnConfirm: true }, requestState: c.j.result.requestState, inputResponses: { file: YES } }, FORM), headers: new Headers({ "mcp-protocol-version": V, "mcp-method": "tools/call", "mcp-name": "preview" }) },
    env, { props: { personId: "p-o", scope: ["mcp:read"], cred: await credEpoch(db.prepare("SELECT key_hash, pass_hash FROM people WHERE id = 'p-o'").get()) } }, new URL("https://org.test/mcp"), { MCP_TOOLS: [{ name: "preview", project: true, stores: true }, { name: "file", write: true }], VERSION: "t", workerName: "w" });
  const rrj = await roRetry.json();
  ok(roRetry.status === 400 && rrj.error.code === -32602 && /^read_only_credential/.test(rrj.error.message) && !summaryOf(C.parseRequestState(c.j.result.requestState).previewId).confirm.answer, "attack: the same person's read-only grant answering their own state: refused, nothing recorded", rrj);
  // the card rides a modern result for a request that declared the Apps extension
  const card = await call("preview", { project: "alpha", items: [goal("g-card")] }, { caps: UI });
  const html = card.j.result._meta && card.j.result._meta["sharingu/card"] && card.j.result._meta["sharingu/card"].html;
  ok(typeof html === "string" && html.includes(`data-preview="${card.out.previewId}"`) && SERVER(card.j), "the Apps extension declared in _meta: the card's fragment in the result's _meta, beside serverInfo");
  const nocard = await call("preview", { project: "alpha", items: [goal("g-card")] }, { caps: {} });
  ok(!nocard.j.result._meta["sharingu/card"], "…not declared: no card");
}
// the state's parse and key (src/confirm.js)
ok(C.parseRequestState("sg2.P-0123456789abcdef." + "a".repeat(32)).previewId === "P-0123456789abcdef" && C.parseRequestState("sg2.P-0123456789abcdef." + "a".repeat(31)) === null && C.parseRequestState(null) === null && C.parseRequestState({}) === null, "parseRequestState: the door's own form only");
ok(C.inputWord({ file: YES }) === "accept" && C.inputWord({ file: { action: "accept", content: { file: "true" } } }) === "decline" && C.inputWord({ file: { action: "cancel" } }) === "cancel" && C.inputWord({ other: YES }) === null && C.inputWord(null) === null, "inputWord: accept only with file === true; no answer is null");

console.log(`${fail ? "✗" : "✓"} dual-era-selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
