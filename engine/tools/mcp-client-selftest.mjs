// tools/mcp-client-selftest.mjs — sprint 3, D3: a minimal MCP client over Streamable HTTP (protocol 2025-06-18 and, D3b,
// 2026-07-28: the door speaks both) against a LOCAL worker, proving the confirm prompt (elicitation) and the card (MCP Apps)
// without the real clients. It writes only into its own throwaway project (eval-marked, archived at the end) and its own people.
//
//   node tools/mcp-client-selftest.mjs --url http://127.0.0.1:<port> --creds <org dir>/credentials.env [--json <file>]
//
//   (a) a client that DECLARES elicitation: preview {fileOnConfirm: true} answers a text/event-stream whose first message is
//       the server's elicitation/create (the preview's text, a one-boolean form); accept -> the receipt, the items filed;
//       decline, cancel, accept with file:false -> nothing filed; never answering -> after the window, nothing filed;
//       over the OAuth path (an mcp:write grant) the same accept files
//   (b) a client that does NOT declare it: no session id, the same call answers JSON (no stream), nothing filed, the reason
//       said; tools/list differs from a session client's in nothing; the only addition is _meta on the four card tools
//   (c) the card: resources/read ui://sharingu/card is one self-contained HTML document (no external URL, no inline event
//       handler, one script: the bridge, the declared CSP, within CARD_MAX bytes); a session that declared the Apps
//       extension gets the card's fragment in the result's _meta, whose rows and ids equal the preview's JSON and whose
//       File action names `file` and the preview's id; brain://card/<id> draws the same rows from the preview's row
//   (d) D3b, a MODERN client (2026-07-28: per-request _meta and the mirror headers, no initialize, no session): discover;
//       tools/list; the confirm as an input_required answer whose retry with accept files and answers the receipt; a
//       decline files nothing; the attacks over HTTP (a tampered state, another person's state, a replay: each 400 -32602);
//       a header mismatch 400 -32020, an unsupported version 400 -32022, an unknown method 404 -32601
//   (e) sprint 7, 7.5a, the two grant kinds: a SEAT grant (the owner's seat secret) lists its one org and is refused any other
//       (orgSlug); an ACCOUNT grant (a fresh member's account, its passphrase from the operator's code and /signup — the local
//       state beside --creds, or --local <persist> --config <wrangler config>) lists its account's orgs, says so in its greeting,
//       files with orgSlug naming its org, is refused one it holds no seat in, and the modern confirm's retry checks it too
//   (f) sprint 7, 7.5b, publish and equip ask the SAME confirm: publish {id, publishOnConfirm} and equip {slug, v, project,
//       equipOnConfirm}, on the handshake revision (a stream: decline publishes nothing and answers the preview again with the two
//       calls named; accept publishes / equips exactly what was shown; a member answering is 400; the confirm's row is no preview:
//       file and brain://card/<it> answer it as unknown) and on the stateless one (input_required titled by the verb; a retry with
//       a changed call, a retry of `preview` with the verb's state, a member's retry, a replay: each 400 -32602, nothing
//       equipped; accept equips; decline nothing); a client without elicitation: the plain preview, nothing asked or done
//   attacks (each answered 400, nothing recorded, nothing filed): an answer to someone else's elicitation (a member, a
//       Partner), from another session of the same person, with a wrong nonce, by a read-only grant (OAuth mcp:read), a
//       replayed accept, an answer after the window; a read-only grant's own confirm asks nothing (nothing is stored)
// Exit 1 on any failure. It never prints a key.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = String(arg("url", process.env.SMOKE_URL || "")).replace(/\/+$/, "");
const CREDS = arg("creds", process.env.SMOKE_CREDS || "");
const OUT = arg("json", "");
if (!BASE || !CREDS || !/^http:\/\/(127\.|localhost|\[::1\])/.test(BASE)) { console.error("usage: node tools/mcp-client-selftest.mjs --url http://127.0.0.1:<port> --creds <credentials.env> (local only)"); process.exit(2); }
const OWNER_KEY = (readFileSync(CREDS, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1];
const emailFile = join(dirname(CREDS), "owner.email");
const OWNER_EMAIL = existsSync(emailFile) ? readFileSync(emailFile, "utf8").trim() : "";
if (!OWNER_KEY) { console.error(`no *_AGENT_R_OWNER_KEY in ${CREDS}`); process.exit(2); }
export const CARD_MAX = 256 * 1024;   // the spec states no limit (SPEC-NOTES); this check holds the template to 256 KB

let pass = 0, fail = 0;
const transcript = [];
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail ? ` — ${String(detail).slice(0, 400)}` : ""}`); } transcript.push({ ok: !!c, msg }); };
const log = (who, dir, m) => transcript.push({ who, dir, m: JSON.stringify(m).slice(0, 600) });
const TAG = randomBytes(3).toString("hex");
const P = `d3c${TAG}`;

// ---- the client ----
class Client {
  constructor(name, auth, caps = {}) { this.name = name; this.auth = auth; this.caps = caps; this.sid = null; this.n = 0; }
  headers(extra = {}) { return { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${this.auth}`, "mcp-protocol-version": "2025-06-18", ...(this.sid ? { "mcp-session-id": this.sid } : {}), ...extra }; }
  async post(body, extra) { log(this.name, ">>", body); return fetch(BASE + "/mcp", { method: "POST", headers: this.headers(extra), body: JSON.stringify(body) }); }
  async initialize() {
    const r = await this.post({ jsonrpc: "2.0", id: ++this.n, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: this.caps, clientInfo: { name: `d3-${this.name}`, version: "1" } } });
    this.sid = r.headers.get("mcp-session-id");
    const j = await r.json(); log(this.name, "<<", j);
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return { status: r.status, sid: this.sid, result: j.result };
  }
  // call(method, params, { onRequest, accept }) -> { status, type, result, error, events }: JSON or SSE; a server request on
  // the stream goes to onRequest(msg), which answers (by POSTing a response) or not
  async call(method, params, o = {}) {
    const r = await this.post({ jsonrpc: "2.0", id: ++this.n, method, params }, o.accept ? { accept: o.accept } : undefined);
    const type = r.headers.get("content-type") || "";
    if (!/text\/event-stream/.test(type)) { const j = await r.json().catch(() => null); log(this.name, "<<", j); return { status: r.status, type: "json", result: j && j.result, error: j && j.error, headers: r.headers }; }
    const events = []; let final = null, buf = "";
    const reader = r.body.getReader(); const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, k); buf = buf.slice(k + 2);
        const data = block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
        if (!data) { events.push({ comment: block.trim() }); continue; }
        const m = JSON.parse(data); events.push(m); log(this.name, "<<sse", m);
        if (m.method && m.id != null && o.onRequest) await o.onRequest(m);
        if (!m.method && m.id != null && ("result" in m || "error" in m)) final = m;
      }
    }
    return { status: r.status, type: "sse", result: final && final.result, error: final && final.error, events };
  }
  // respond(msg) -> the HTTP status of POSTing a JSON-RPC response (202 recorded, 400 refused)
  async respond(id, result, error) { const r = await this.post({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) }); await r.text(); return r.status; }
}
// D3b: a client of the stateless revision: every request carries _meta (the version, its capabilities) and the mirror
// headers; nothing is negotiated and no session is kept
const MODERN = "2026-07-28";
class ModernClient extends Client {
  async post(body, extra) {
    const named = body.method === "resources/read" ? body.params && body.params.uri : body.params && body.params.name;
    const mirror = body.params && body.params._meta ? { "mcp-protocol-version": body.params._meta["io.modelcontextprotocol/protocolVersion"], "mcp-method": body.method, ...(typeof named === "string" ? { "mcp-name": named } : {}) } : {};
    log(this.name, ">>", body);
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${this.auth}`, ...mirror, ...(extra || {}) };
    return fetch(BASE + "/mcp", { method: "POST", headers: h, body: JSON.stringify(body) });
  }
  async call(method, params, o = {}) {
    const meta = { "io.modelcontextprotocol/protocolVersion": o.version || MODERN, "io.modelcontextprotocol/clientInfo": { name: `d3b-${this.name}`, version: "1" }, "io.modelcontextprotocol/clientCapabilities": this.caps };
    const r = await this.post({ jsonrpc: "2.0", id: ++this.n, method, params: { ...(params || {}), _meta: meta } }, o.headers);
    const j = await r.json().catch(() => null); log(this.name, "<<", j);
    return { status: r.status, sid: r.headers.get("mcp-session-id"), result: j && j.result, error: j && j.error };
  }
}
const tool = async (c, name, args, o) => { const r = await c.call("tools/call", { name, arguments: args }, o); const t = r.result && r.result.content && r.result.content[0] && r.result.content[0].text; let out = null; try { out = JSON.parse(t); } catch { out = t; } return { ...r, out }; };
const FORM = { elicitation: {} };
const UI = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };

// ---- people and OAuth ----
async function control(form) { const r = await fetch(BASE + "/control", { method: "POST", headers: { authorization: `Bearer ${OWNER_KEY}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString(), redirect: "manual" }); return r.text(); }
async function invite(name, email, role, projects) {
  const t = await control([["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])]);
  const key = (t.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  if (!key) throw new Error(`invite ${email}: no key`);
  return key;
}
async function oauth(email, password, scope) {
  const redirect = "https://example.invalid/cb";
  const reg = await fetch(BASE + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "d3-selftest", redirect_uris: [redirect], token_endpoint_auth_method: "none" }) }).then((r) => r.json());
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, scope, state: "s", code_challenge: challenge, code_challenge_method: "S256" });
  const page = await fetch(`${BASE}/oauth/authorize?${q}`).then((r) => r.text());
  const req = (page.match(/name="oauth_req" value="([^"]+)"/) || [])[1];
  if (!req) throw new Error("no oauth_req on the sign-in page");
  const r = await fetch(BASE + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ oauth_req: req, email, password }).toString(), redirect: "manual" });
  const code = new URL(r.headers.get("location") || "http://x/").searchParams.get("code");
  if (!code) throw new Error(`OAuth sign-in: HTTP ${r.status}, no code`);
  const tok = await fetch(BASE + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier }).toString() }).then((x) => x.json());
  if (!tok.access_token) throw new Error("no access_token");
  return tok.access_token;
}

// ---- the items: a goal per case (new ids, so each files) ----
const goal = (id) => ({ kind: "goal", op: "upsert", data: { id, title: `D3 ${id}`, parent: `${P}-root`, dimensions: [] } });
const goalIds = async (c) => ((await tool(c, "read", { project: P, kind: "goal", limit: 100 })).out.items || []).map((g) => g.id);
const nonceOf = (id) => String(id).split(":")[2];

console.log(`mcp-client-selftest · ${BASE} · project ${P}`);
const owner = new Client("owner", OWNER_KEY, FORM);
const plain = new Client("plain", OWNER_KEY, {});
const apps = new Client("apps", OWNER_KEY, UI);

// setup: the project, its root goal, a member and a Partner seated on it
const init = await owner.initialize();
ok(init.status === 200 && /^sg1e\.[0-9a-f]{32}$/.test(init.sid || ""), "initialize with elicitation declared answers a session id sg1e.<32 hex>", init.sid);
const pinit = await plain.initialize();
ok(pinit.status === 200 && !pinit.sid, "initialize with nothing declared answers NO session id (unchanged)", pinit.sid);
const ainit = await apps.initialize();
ok(/^sg1u\./.test(ainit.sid || ""), "initialize with the Apps extension declared answers sg1u.", ainit.sid);
ok(JSON.stringify(init.result) === JSON.stringify(pinit.result), "the initialize result is the same for every client (only the header differs)");
const cp = await tool(owner, "create_project", { key: P, name: `D3 ${TAG}`, eval: true });
ok(cp.out && cp.out.project && cp.out.project.key === P, "a throwaway eval project", JSON.stringify(cp.out).slice(0, 200));
const rootItems = [{ kind: "goal", op: "upsert", data: { id: `${P}-root`, title: "D3 root", parent: null, dimensions: [] } }];
const rootPv = await tool(owner, "preview", { project: P, items: rootItems, eval: true });
const root = rootPv.out && rootPv.out.previewId ? await tool(owner, "file", { previewId: rootPv.out.previewId, items: rootItems }) : rootPv;
ok(!root.out.error && root.out.complete, "its root goal (preview then file)", JSON.stringify(root.out).slice(0, 200));
const memberKey = await invite(`D3 Member ${TAG}`, `d3m-${TAG}@d3.local`, "member", [P]);
const partnerKey = await invite(`D3 Partner ${TAG}`, `d3p-${TAG}@d3.local`, "partner", [P]);
const member = new Client("member", memberKey, FORM); await member.initialize();
const partner = new Client("partner", partnerKey, FORM); await partner.initialize();
const owner2 = new Client("owner-2nd-session", OWNER_KEY, FORM); await owner2.initialize();

// (b) tools/list: the same for a plain client and a session client; _meta on exactly the four card tools
const tl = (await plain.call("tools/list", {})).result.tools;
const tl2 = (await owner.call("tools/list", {})).result.tools;
ok(JSON.stringify(tl) === JSON.stringify(tl2), "tools/list is identical with and without a session");
const withMeta = tl.filter((t) => t._meta).map((t) => t.name).sort();
ok(JSON.stringify(withMeta) === JSON.stringify(["equip", "file", "preview", "publish"]), "only preview, file, publish and equip carry _meta", withMeta.join(","));
ok(tl.filter((t) => t._meta).every((t) => t._meta.ui && t._meta.ui.resourceUri === "ui://sharingu/card" && t._meta["ui/resourceUri"] === "ui://sharingu/card"), "their _meta is ui.resourceUri (and the deprecated flat key) naming ui://sharingu/card");
ok(tl.find((t) => t.name === "preview").inputSchema.properties.fileOnConfirm.type === "boolean", "preview's schema has fileOnConfirm (boolean)");

// (a0) the timeout case runs in the background (the window is 50 s): never answered -> nothing filed
let timeoutElicit = null;
const tStart = Date.now();
const timeoutRun = tool(owner, "preview", { project: P, items: [goal(`${P}-t`)], fileOnConfirm: true, eval: true }, { onRequest: async (m) => { timeoutElicit = m; } });

// (a1) accept
{
  let el = null;
  const r = await tool(owner, "preview", { project: P, items: [goal(`${P}-a`)], fileOnConfirm: true, eval: true }, { onRequest: async (m) => {
    el = m;
    // attacks while it is open: someone else (member, Partner), another session of the owner, a wrong nonce
    ok((await member.respond(m.id, { action: "accept", content: { file: true } })) === 400, "attack: a member answering the owner's elicitation id is refused 400");
    ok((await partner.respond(m.id, { action: "accept", content: { file: true } })) === 400, "attack: a Partner answering it is refused 400");
    ok((await owner2.respond(m.id, { action: "accept", content: { file: true } })) === 400, "attack: the owner's OTHER session answering it is refused 400");
    ok((await owner.respond(m.id.replace(/:[0-9a-f]{32}$/, ":" + "0".repeat(32)), { action: "accept", content: { file: true } })) === 400, "attack: a wrong nonce is refused 400");
    ok((await owner.respond(m.id, { action: "accept", content: { file: true } })) === 202, "the owner's own session answers accept: 202");
    ok((await owner.respond(m.id, { action: "accept", content: { file: true } })) === 400, "attack: a replayed accept is refused 400");
  } });
  ok(r.type === "sse", "a declared client's preview with fileOnConfirm answers a text/event-stream", r.type);
  ok(el && el.method === "elicitation/create" && /^sg-confirm:P-[0-9a-f]{16}:[0-9a-f]{32}$/.test(String(el.id)), "its first message is the server's elicitation/create request", el && el.id);
  const sch = el && el.params && el.params.requestedSchema;
  ok(sch && sch.type === "object" && Object.keys(sch.properties).length === 1 && sch.properties.file.type === "boolean" && sch.properties.file.default === false && sch.required[0] === "file", "its form is ONE boolean (file), required, false by default");
  ok(el && typeof el.params.message === "string" && /sharingu/.test(el.params.message) && el.params.message.length <= 4000, "its message is the preview's text render (bounded)", el && el.params.message.slice(0, 80));
  ok(r.out && r.out.confirm && r.out.confirm.answer === "accept" && r.out.confirm.filed === true && r.out.complete === true, "accept -> the tools/call result is the receipt, filed", JSON.stringify(r.out && r.out.confirm));
  ok(r.out && r.out.previewId === String(el.id).split(":")[1], "the receipt is of exactly the preview the elicitation named");
  ok((await goalIds(owner)).includes(`${P}-a`), "the item is in the project (read back)");
  const again = await tool(owner, "file", { previewId: r.out.previewId, items: [goal(`${P}-a`)] });
  ok(again.out && again.out.error === "preview_filed", "file with the same id after the confirm: preview_filed, nothing doubled", again.out && again.out.error);
}
// (a2) decline / cancel / accept with file:false / a JSON-RPC error
for (const [label, answer, err] of [["decline", { action: "decline" }], ["cancel", { action: "cancel" }], ["accept with file:false", { action: "accept", content: { file: false } }], ["a JSON-RPC error", null, { code: -32601, message: "no elicitation here" }]]) {
  const gid = `${P}-${label.replace(/[^a-z]/g, "").slice(0, 10)}`;
  const r = await tool(owner, "preview", { project: P, items: [goal(gid)], fileOnConfirm: true, eval: true }, { onRequest: async (m) => { ok((await owner.respond(m.id, answer, err)) === 202, `${label}: recorded 202`); } });
  ok(r.out && r.out.confirm && r.out.confirm.asked === true && r.out.confirm.filed === false, `${label} -> nothing filed, and said`, JSON.stringify(r.out && r.out.confirm));
  ok(!(await goalIds(owner)).includes(gid), `${label}: the item is not in the project`);
}
// (b) no elicitation declared: JSON, nothing asked, nothing filed
{
  const r = await tool(plain, "preview", { project: P, items: [goal(`${P}-plain`)], fileOnConfirm: true, eval: true });
  ok(r.type === "json" && r.out.previewId && r.out.confirm && r.out.confirm.asked === false, "a client that did not declare elicitation: a plain JSON preview, confirm.asked false", JSON.stringify(r.out.confirm));
  ok(!(await goalIds(owner)).includes(`${P}-plain`), "…and nothing filed");
  const bare = await tool(plain, "preview", { project: P, items: [goal(`${P}-plain2`)], eval: true });
  ok(bare.type === "json" && !("confirm" in bare.out) && !bare.result._meta, "a preview without fileOnConfirm is today's answer (no confirm key, no _meta for a client without the extension)");
  const ns = await tool(owner, "preview", { project: P, items: [goal(`${P}-nostream`)], fileOnConfirm: true, eval: true }, { accept: "application/json" });
  ok(ns.type === "json" && ns.out.confirm && ns.out.confirm.asked === false && /stream/.test(ns.out.confirm.note), "a declared client whose request does not accept a stream: not asked, said", ns.out.confirm && ns.out.confirm.note);
  const nr = await tool(owner, "preview", { project: P, items: [goal(`${P}-ready`), { contribution: { lane: "code", what: "x" } }], fileOnConfirm: true, eval: true });
  ok(nr.type === "json" && nr.out.confirm && nr.out.confirm.asked === false && nr.out.notReady > 0, "a preview with an item not ready: not asked (file would refuse it), said", nr.out.confirm && nr.out.confirm.note);
  const pf = await tool(partner, "preview", { project: `${P}x`, items: [goal(`${P}-pf`)], fileOnConfirm: true, eval: true });
  ok(pf.type === "json" && pf.out.error, "a Partner's confirm on a project they hold no seat on: refused before anything is asked", pf.out.error);
}
// OAuth: an mcp:write grant files through the confirm; an mcp:read grant asks nothing and cannot answer
if (OWNER_EMAIL) {
  try {
    const wTok = await oauth(OWNER_EMAIL, OWNER_KEY, "mcp:read mcp:write");
    const rTok = await oauth(OWNER_EMAIL, OWNER_KEY, "mcp:read");
    const ow = new Client("oauth-write", wTok, FORM); const oi = await ow.initialize();
    const orr = new Client("oauth-read", rTok, FORM); await orr.initialize();
    ok(/^sg1e\./.test(oi.sid || ""), "the OAuth path: initialize answers the session id too");
    const r = await tool(ow, "preview", { project: P, items: [goal(`${P}-oauth`)], fileOnConfirm: true, eval: true }, { onRequest: async (m) => {
      ok((await orr.respond(m.id, { action: "accept", content: { file: true } })) === 400, "attack: a read-only grant (mcp:read) answering is refused 400");
      ok((await ow.respond(m.id, { action: "accept", content: { file: true } })) === 202, "the OAuth mcp:write grant's accept: 202");
    } });
    ok(r.type === "sse" && r.out.confirm && r.out.confirm.filed === true, "OAuth (mcp:write): accept files", JSON.stringify(r.out && r.out.confirm));
    const ro = await tool(orr, "preview", { project: P, items: [goal(`${P}-ro`)], fileOnConfirm: true, eval: true });
    ok(ro.type === "json" && ro.out.previewId === null && ro.out.confirm && ro.out.confirm.asked === false, "a read-only grant's confirm: nothing stored, nothing asked", JSON.stringify(ro.out.confirm));
  } catch (e) { ok(false, "the OAuth path", e.message); }
} else ok(false, "the OAuth path", "no owner.email beside the credentials");

// (c) the card
{
  const rr = await apps.call("resources/read", { uri: "ui://sharingu/card" });
  const c = rr.result && rr.result.contents && rr.result.contents[0];
  const html = (c && c.text) || "";
  ok(c && c.mimeType === "text/html;profile=mcp-app" && c.uri === "ui://sharingu/card", "resources/read ui://sharingu/card: the MCP Apps MIME type");
  ok(/^<!doctype html>/i.test(html) && /<\/html>\s*$/.test(html), "one whole HTML5 document");
  ok(html.length <= CARD_MAX, `within ${CARD_MAX} bytes (${html.length})`);
  const urls = html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"')]*|url\(\s*['"]?(?!data:)[^)'"]+/gi) || [];
  ok(!urls.length, "no external URL (no http(s)://, no protocol-relative //host, no url() but data:)", urls.slice(0, 3).join(" "));
  const handlers = html.match(/<[^>]+\son[a-z]+\s*=/gi) || [];
  ok(!handlers.length, "no inline event handler attribute", handlers.slice(0, 2).join(" "));
  ok((html.match(/<script\b/gi) || []).length === 1 && /ui\/initialize/.test(html), "exactly one script, the Apps bridge");
  ok(/http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'/.test(html), "its own CSP: no network, inline style and script only");
  ok(!/Bearer|AGENT_R|authorization|__Host-|sg1[eu]*\.[0-9a-f]{32}/i.test(html), "it carries no key, no session, no cookie name");
  const prev = await tool(apps, "preview", { project: P, items: [goal(`${P}-card1`), goal(`${P}-card2`)], leftOut: [{ what: "a side thread", why: "no fact in it" }], eval: true });
  const card = prev.result && prev.result._meta && prev.result._meta["sharingu/card"] && prev.result._meta["sharingu/card"].html;
  ok(typeof card === "string" && card.length > 200, "a client that declared the extension: the result's _meta carries the card's fragment");
  ok(card && card.includes(`data-preview="${prev.out.previewId}"`), "the fragment names the preview's id");
  const rows = card ? [...card.matchAll(/data-i="(\d+)" data-verdict="([a-z_]+)"/g)].map((m) => `${m[1]}:${m[2]}`) : [];
  ok(JSON.stringify(rows) === JSON.stringify(prev.out.items.map((it) => `${it.i}:${it.verdict}`)), "its rows equal the preview's items and verdicts", rows.join(","));
  ok(card && /data-region="left-out"/.test(card) && card.includes("a side thread"), "it shows what was left out");
  ok(card && new RegExp(`data-file data-tool="file" data-preview-id="${prev.out.previewId}"`).test(card), "its File action names the tool `file` and this preview's id");
  ok(card && !/href="\/(?!\/)/.test(card) && /href="http:\/\/127\.0\.0\.1:\d+\/[a-z0-9-]+\/preview\//.test(card), "its links are absolute (opened through the host), with the preview page among them (under the org's address: sprint 7, 7.4)");
  const fr = await apps.call("resources/read", { uri: `brain://card/${prev.out.previewId}` });
  const fh = fr.result && fr.result.contents && fr.result.contents[0] && fr.result.contents[0].text;
  const rows2 = fh ? [...fh.matchAll(/data-i="(\d+)" data-verdict="([a-z_]+)"/g)].map((m) => `${m[1]}:${m[2]}`) : [];
  ok(JSON.stringify(rows2) === JSON.stringify(rows), "brain://card/<id> draws the same rows from the preview's row (the page's read)");
  const other = await member.call("resources/read", { uri: `brain://card/${prev.out.previewId}` });
  const oh = other.result && other.result.contents && other.result.contents[0] && other.result.contents[0].text;
  ok(oh && !/\sdata-file\s/.test(oh), "a seated member reads the card (as the page) with no File action (file is the author's)");
  const fl = await tool(apps, "file", { previewId: prev.out.previewId, items: prev.out.items.map((_, i) => goal(`${P}-card${i + 1}`)) });
  const rc = fl.result && fl.result._meta && fl.result._meta["sharingu/card"] && fl.result._meta["sharingu/card"].html;
  ok(fl.out && fl.out.complete && rc && /data-state="filed"/.test(rc) && !/\sdata-file\s/.test(rc), "file's own result carries the receipt as a card (filed, no File action)");
  const plainFile = await tool(plain, "preview", { project: P, items: [goal(`${P}-card3`)], eval: true });
  ok(!plainFile.result._meta, "a client without the extension gets no card in the result");
  if (OUT) writeFileSync(OUT.replace(/\.json$/, "") + "-card.json", JSON.stringify({ answer: prev.out, fragment: card, receipt: fl.out, receiptFragment: rc }, null, 2));
}

// (d) a modern client (D3b)
{
  const mo = new ModernClient("modern-owner", OWNER_KEY, FORM);
  const mm = new ModernClient("modern-member", memberKey, FORM);
  const d = await mo.call("server/discover", {});
  ok(d.status === 200 && d.result && d.result.resultType === "complete" && d.result.supportedVersions.includes(MODERN) && d.result._meta["io.modelcontextprotocol/serverInfo"].name === init.result.serverInfo.name && d.result.instructions === init.result.instructions && !d.sid, "modern: server/discover answers the versions, initialize's name and instructions, no session id", JSON.stringify(d.result || d.error).slice(0, 200));
  const tlm = await mo.call("tools/list", {});
  ok(tlm.status === 200 && tlm.result.resultType === "complete" && JSON.stringify(tlm.result.tools) === JSON.stringify(tl2), "modern: tools/list, the same tools as the handshake revision's, resultType complete");
  const ask = async (gid) => mo.call("tools/call", { name: "preview", arguments: { project: P, items: [goal(gid)], fileOnConfirm: true, eval: true } });
  const retry = async (c, gid, state, answer) => c.call("tools/call", { name: "preview", arguments: { project: P, items: [goal(gid)], fileOnConfirm: true, eval: true }, requestState: state, inputResponses: { file: answer } });
  const outOf = (r) => { try { return JSON.parse(r.result.content[0].text); } catch { return null; } };
  const a = await ask(`${P}-m1`);
  const el = a.result && a.result.inputRequests && a.result.inputRequests.file;
  ok(a.status === 200 && a.result.resultType === "input_required" && el && el.method === "elicitation/create" && el.params.mode === "form" && el.params.requestedSchema.properties.file.type === "boolean" && /^sg2\./.test(a.result.requestState), "modern: preview {fileOnConfirm} answers input_required: one elicitation (form) and a requestState", JSON.stringify(a.result || a.error).slice(0, 300));
  const st = a.result.requestState;
  const tam = await retry(mo, `${P}-m1`, st.replace(/.$/, (c) => (c === "0" ? "1" : "0")), { action: "accept", content: { file: true } });
  ok(tam.status === 400 && tam.error.code === -32602 && /confirm_not_open/.test(tam.error.message), "modern attack: a tampered state: 400 -32602", JSON.stringify(tam.error));
  const oth = await retry(mm, `${P}-m1`, st, { action: "accept", content: { file: true } });
  ok(oth.status === 400 && oth.error.code === -32602 && oth.error.message === tam.error.message, "modern attack: a member with the owner's state: the same 400 -32602", JSON.stringify(oth.error));
  ok(!(await goalIds(owner)).includes(`${P}-m1`), "…nothing filed by either");
  const y = await retry(mo, `${P}-m1`, st, { action: "accept", content: { file: true } });
  const yo = outOf(y);
  ok(y.status === 200 && y.result.resultType === "complete" && yo && yo.complete === true && yo.confirm && yo.confirm.answer === "accept" && yo.confirm.filed === true, "modern: the retry with accept files and answers the receipt", JSON.stringify(yo && yo.confirm || y.error));
  ok((await goalIds(owner)).includes(`${P}-m1`), "modern: the item is in the project (read back)");
  const rep = await retry(mo, `${P}-m1`, st, { action: "accept", content: { file: true } });
  ok(rep.status === 400 && rep.error.code === -32602, "modern attack: a replayed state: 400 -32602", JSON.stringify(rep.error));
  const b = await ask(`${P}-m2`);
  const no = await retry(mo, `${P}-m2`, b.result.requestState, { action: "decline" });
  const noo = outOf(no);
  ok(no.status === 200 && noo && noo.confirm && noo.confirm.answer === "decline" && noo.confirm.filed === false, "modern: decline answers that nothing was filed", JSON.stringify(noo && noo.confirm));
  ok(!(await goalIds(owner)).includes(`${P}-m2`), "modern: the declined item is not in the project");
  const hm = await mo.call("tools/list", {}, { headers: { "mcp-method": "tools/call" } });
  ok(hm.status === 400 && hm.error.code === -32020, "modern: a mirror header unlike the body: 400 -32020", JSON.stringify(hm.error));
  const uv = await mo.call("tools/list", {}, { version: "1900-01-01" });
  ok(uv.status === 400 && uv.error.code === -32022 && uv.error.data.supported.includes(MODERN) && uv.error.data.requested === "1900-01-01", "modern: an unsupported version: 400 -32022 with the supported list", JSON.stringify(uv.error));
  const um = await mo.call("ping", {});
  ok(um.status === 404 && um.error.code === -32601, "modern: a method the revision does not define (ping): 404 -32601", JSON.stringify(um.error));
}

// (a0) the timeout, and an answer after the window
{
  const r = await timeoutRun;
  const secs = Math.round((Date.now() - tStart) / 1000);
  ok(r.type === "sse" && r.out && r.out.confirm && r.out.confirm.answer === "timeout" && r.out.confirm.filed === false, `never answered -> after the window (${secs} s) the call ends: timeout, nothing filed`, JSON.stringify(r.out && r.out.confirm));
  ok(r.events.some((e) => e.comment && /keep-alive/.test(e.comment)), "the stream carried keep-alive comments while it waited");
  ok(!(await goalIds(owner)).includes(`${P}-t`), "the timed-out item is not in the project");
  ok(timeoutElicit && (await owner.respond(timeoutElicit.id, { action: "accept", content: { file: true } })) === 400, "attack: an accept after the window is refused 400");
  ok(!(await goalIds(owner)).includes(`${P}-t`), "…and still nothing filed");
}

// (e) sprint 7, 7.5a: the TWO GRANT KINDS through the one /mcp (src/oauthgrants.js). A SEAT grant (the owner's seat secret: the
// OAuth path above) acts in its seat's org alone; an ACCOUNT grant (a fresh member's account, given its passphrase by the operator's
// code and /signup, as a person signs up) acts as the account's seat, lists its orgs, and names its org per call (orgSlug) on both
// revisions, the modern confirm's retry included. A name no org holds is refused org_unreachable, nothing filed.
{
  const orgDir = dirname(CREDS);
  const persist = arg("local", join(orgDir, "persist")), cfg = arg("config", join(orgDir, "wrangler.local.jsonc"));
  try {
    if (!OWNER_EMAIL) throw new Error("no owner.email beside the credentials");
    // the seat grant (the owner's seat secret)
    const sTok = await oauth(OWNER_EMAIL, OWNER_KEY, "mcp:read mcp:write");
    const sc = new Client("seat-grant", sTok, {}); const si = await sc.initialize();
    const sw = await tool(sc, "whoami", {});
    const here = sw.out && Array.isArray(sw.out.orgs) && sw.out.orgs.length === 1 && sw.out.orgs[0].current ? sw.out.orgs[0].slug : null;
    ok(here && !/orgSlug/.test(si.result.instructions), "seat grant: whoami lists its one org (current), its greeting carries no org line", JSON.stringify(sw.out && sw.out.orgs));
    const ghost = `no-org-${TAG}`;
    const sx = await tool(sc, "preview", { project: P, items: [goal(`${P}-sg-x`)], orgSlug: ghost, eval: true });
    const so = await tool(sc, "preview", { project: P, items: [goal(`${P}-sg-own`)], orgSlug: here, eval: true });
    ok(sx.out && sx.out.error === "org_unreachable" && so.out && so.out.previewId, "seat grant: orgSlug naming no org it holds is org_unreachable; naming its own previews", `${sx.out && sx.out.error} / ${so.out && (so.out.previewId || so.out.error)}`);
    // the account grant: a fresh member, its account given a passphrase as a person signs up (the operator's code, /signup)
    if (!existsSync(persist) || !existsSync(cfg)) throw new Error(`no local state beside the credentials (${persist}, ${cfg}): pass --local <persist> --config <wrangler config>`);
    const aEmail = `d3a-${TAG}@d3.local`, aPass = `d3a-account-pass-${TAG}`;
    await invite(`D3 Account ${TAG}`, aEmail, "member", [P]);
    const { execFileSync } = await import("node:child_process");
    const opOut = execFileSync("node", [join(dirname(new URL(import.meta.url).pathname), "operator.mjs"), "allow", "--email", aEmail, "--local", persist, "--config", cfg], { encoding: "utf8" });
    const code = (opOut.match(/^ {2}code: (\S+)$/m) || [])[1];
    const su = await fetch(BASE + "/signup", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ email: aEmail, code, password: aPass, device: "mcp-client-selftest" }) });
    ok(code && su.status === 200, "account grant: the operator's code and /signup give the member's account its passphrase", su.status);
    const aTok = await oauth(aEmail, aPass, "mcp:read mcp:write");
    const ac = new Client("account-grant", aTok, {}); const ai = await ac.initialize();
    const aw = await tool(ac, "whoami", {});
    ok(aw.out && aw.out.role === "member" && JSON.stringify((aw.out.orgs || []).map((o) => `${o.slug}${o.current ? "*" : ""}`)) === JSON.stringify([`${here}*`]) && /orgSlug/.test(ai.result.instructions) && /orgSlug/.test(aw.out.orgNote || ""),
      "account grant: whoami as the member's seat, its account's orgs (here, current); the greeting and the note say a call takes orgSlug", JSON.stringify(aw.out && aw.out.orgs));
    const ax = await tool(ac, "preview", { project: P, items: [goal(`${P}-ag-x`)], orgSlug: ghost, eval: true });
    const pv = await tool(ac, "preview", { project: P, items: [goal(`${P}-ag`)], orgSlug: here, eval: true });
    const fl = pv.out && pv.out.previewId ? await tool(ac, "file", { previewId: pv.out.previewId, items: [goal(`${P}-ag`)], orgSlug: here }) : pv;
    ok(ax.out && ax.out.error === "org_unreachable" && fl.out && fl.out.complete && (await goalIds(owner)).includes(`${P}-ag`) && !(await goalIds(owner)).includes(`${P}-ag-x`),
      "account grant: orgSlug of an org it holds no seat in is refused; naming its own, preview then file lands the item", `${ax.out && ax.out.error} / ${JSON.stringify(fl.out).slice(0, 160)}`);
    // the modern revision: the confirm's retry carries the call's org too (checked before it files)
    const am = new ModernClient("modern-account-grant", aTok, FORM);
    const ask = await am.call("tools/call", { name: "preview", arguments: { project: P, items: [goal(`${P}-agm`)], fileOnConfirm: true, orgSlug: here, eval: true } });
    const st = ask.result && ask.result.requestState;
    const bad = st ? await am.call("tools/call", { name: "preview", arguments: { project: P, items: [goal(`${P}-agm`)], fileOnConfirm: true, orgSlug: ghost, eval: true }, requestState: st, inputResponses: { file: { action: "accept", content: { file: true } } } }) : {};
    const good = st ? await am.call("tools/call", { name: "preview", arguments: { project: P, items: [goal(`${P}-agm`)], fileOnConfirm: true, orgSlug: here, eval: true }, requestState: st, inputResponses: { file: { action: "accept", content: { file: true } } } }) : {};
    const badOut = (() => { try { return JSON.parse(bad.result.content[0].text); } catch { return null; } })();
    const goodOut = (() => { try { return JSON.parse(good.result.content[0].text); } catch { return null; } })();
    ok(st && badOut && badOut.error === "org_unreachable" && goodOut && goodOut.confirm && goodOut.confirm.filed === true && (await goalIds(owner)).includes(`${P}-agm`),
      "account grant, modern: the confirm's retry naming another org is refused (nothing filed); naming its own files", `${badOut && badOut.error} / ${JSON.stringify(goodOut && goodOut.confirm)}`);
  } catch (e) { ok(false, "the two grant kinds (7.5a)", e.message); }
}

// (f) sprint 7, 7.5b: PUBLISH and EQUIP ask the same confirm (src/confirm.js VERB_CONFIRM), both revisions
{
  try {
    const slug = `d3k-${TAG}`;
    const draft = async (n) => {
      const items = [{ contribution: { lane: "leader", kind: "item", what: `D3 kit ${n}`, why: "a kit the confirm selftest publishes", touches: ["skill"], gapRefs: [`item/${slug}`], proof: `https://example.invalid/${slug}/${n}` } }];
      const pv = await tool(owner, "preview", { project: P, items, eval: true });
      const f = pv.out && pv.out.previewId ? await tool(owner, "file", { previewId: pv.out.previewId, items }) : pv;
      const id = f.out && f.out.results && f.out.results[0] && f.out.results[0].id;
      if (!id) throw new Error(`no draft filed: ${JSON.stringify(f.out).slice(0, 200)}`);
      return id;
    };
    // the oracles, reads through the verbs' own previews: a draft's preview names the next version (the publishes so far + 1) or
    // refuses already_published; an equip's preview names `from` (the project's current version) or refuses already_current
    const nextV = async (id) => { const r = await tool(owner, "publish", { id, eval: true }); return r.out && (r.out.v || r.out.error); };
    const fromOf = async (v) => { const r = await tool(owner, "equip", { slug, v, project: P, eval: true }); return r.out && (r.out.error || r.out.from || "none"); };
    const d1 = await draft(1);
    // the handshake revision: decline, then accept
    let el = null;
    const dec = await tool(owner, "publish", { id: d1, publishOnConfirm: true, eval: true }, { onRequest: async (m) => {
      el = m;
      ok((await member.respond(m.id, { action: "accept", content: { file: true } })) === 400, "verbs · attack: a member answering the owner's publish confirm is refused 400");
      ok((await owner.respond(m.id, { action: "decline" })) === 202, "verbs · the owner declines the publish: 202");
    } });
    const sch = el && el.params && el.params.requestedSchema;
    ok(dec.type === "sse" && el && el.method === "elicitation/create" && sch && sch.properties.file.title === "Publish" && /Publish d3k-/.test(sch.properties.file.description) && /Publish/.test(el.params.message),
      "verbs · publish {publishOnConfirm} on a declared client: a stream whose elicitation is titled Publish and says the preview's line", JSON.stringify(sch).slice(0, 200));
    ok(dec.out && dec.out.confirm && dec.out.confirm.answer === "decline" && dec.out.confirm.filed === false && dec.out.preview === true && dec.out.verb === "publish" && /confirm: true/.test(dec.out.confirm.note) && (await nextV(d1)) === 1,
      "verbs · decline: nothing published; the answer is the preview again, its note naming the two calls", JSON.stringify(dec.out && dec.out.confirm));
    const rowId = el ? String(el.id).split(":")[1] : "";
    const asFile = await tool(owner, "file", { previewId: rowId, items: [goal(`${P}-verbrow`)] });
    const asCard = await owner.call("resources/read", { uri: `brain://card/${rowId}` });
    ok(asFile.out && asFile.out.error === "preview_not_found" && asCard.error, "verbs · the confirm's row is no preview: file answers preview_not_found, brain://card/<it> not found", `${asFile.out && asFile.out.error} / ${JSON.stringify(asCard.error)}`);
    const acc = await tool(owner, "publish", { id: d1, publishOnConfirm: true, eval: true }, { onRequest: async (m) => { await owner.respond(m.id, { action: "accept", content: { file: true } }); } });
    ok(acc.out && acc.out.confirm && acc.out.confirm.answer === "accept" && acc.out.confirm.filed === true && acc.out.slug === slug && acc.out.v === 1 && (await nextV(d1)) === "already_published",
      "verbs · accept: the draft is published (v1), exactly the one shown", JSON.stringify(acc.out).slice(0, 200));
    const d2 = await draft(2);
    const pl = await tool(plain, "publish", { id: d2, publishOnConfirm: true, eval: true });
    ok(pl.type === "json" && pl.out && pl.out.preview === true && pl.out.confirm && pl.out.confirm.asked === false && /confirm: true/.test(pl.out.confirm.note) && (await nextV(d2)) === 2,
      "verbs · a client without elicitation: the plain preview, nothing asked, nothing published, the two calls named", JSON.stringify(pl.out && pl.out.confirm));
    // the handshake revision: equip, declined then accepted
    const eqArgs = { slug, v: 1, project: P, eval: true };
    let eel = null;
    const edec = await tool(owner, "equip", { ...eqArgs, equipOnConfirm: true }, { onRequest: async (m) => { eel = m; await owner.respond(m.id, { action: "decline" }); } });
    ok(eel && eel.params.requestedSchema.properties.file.title === "Equip" && edec.out && edec.out.confirm && edec.out.confirm.filed === false && edec.out.verb === "equip" && (await fromOf(1)) === "none",
      "verbs · equip {equipOnConfirm}: the elicitation is titled Equip; decline equips nothing", JSON.stringify(edec.out && edec.out.confirm));
    const eacc = await tool(owner, "equip", { ...eqArgs, equipOnConfirm: true }, { onRequest: async (m) => { await owner.respond(m.id, { action: "accept", content: { file: true } }); } });
    ok(eacc.out && eacc.out.confirm && eacc.out.confirm.filed === true && eacc.out.slug === slug && eacc.out.v === 1 && eacc.out.project === P && (await fromOf(1)) === "already_current",
      "verbs · accept: equipped v1 into the project shown", JSON.stringify(eacc.out).slice(0, 200));
    // the stateless revision: publish v2, then equip v2 (the update) with the attacks on its retry
    const mo = new ModernClient("modern-verbs", OWNER_KEY, FORM), mm = new ModernClient("modern-verbs-member", memberKey, FORM);
    const outOf = (r) => { try { return JSON.parse(r.result.content[0].text); } catch { return null; } };
    const d3 = await draft(3);
    const pa = await mo.call("tools/call", { name: "publish", arguments: { id: d3, publishOnConfirm: true, eval: true } });
    const pel = pa.result && pa.result.inputRequests && pa.result.inputRequests.file;
    ok(pa.result && pa.result.resultType === "input_required" && pel && pel.params.requestedSchema.properties.file.title === "Publish" && /^sg2\./.test(pa.result.requestState),
      "verbs · modern: publish {publishOnConfirm} answers input_required titled Publish", JSON.stringify(pa.result || pa.error).slice(0, 200));
    const py = await mo.call("tools/call", { name: "publish", arguments: { id: d3, publishOnConfirm: true, eval: true }, requestState: pa.result.requestState, inputResponses: { file: { action: "accept", content: { file: true } } } });
    const pyo = outOf(py);
    ok(pyo && pyo.confirm && pyo.confirm.filed === true && pyo.v === 2 && (await nextV(d3)) === "already_published", "verbs · modern: the retry with accept publishes v2", JSON.stringify(pyo).slice(0, 200));
    const ea = await mo.call("tools/call", { name: "equip", arguments: { slug, v: 2, project: P, equipOnConfirm: true, eval: true } });
    const st = ea.result && ea.result.requestState;
    const accept = { file: { action: "accept", content: { file: true } } };
    const changed = await mo.call("tools/call", { name: "equip", arguments: { slug, v: 1, project: P, equipOnConfirm: true, eval: true }, requestState: st, inputResponses: accept });
    const cross = await mo.call("tools/call", { name: "preview", arguments: { project: P, items: [goal(`${P}-x`)], fileOnConfirm: true, eval: true }, requestState: st, inputResponses: accept });
    const other = await mm.call("tools/call", { name: "equip", arguments: { slug, v: 2, project: P, equipOnConfirm: true, eval: true }, requestState: st, inputResponses: accept });
    ok([changed, cross, other].every((r) => r.status === 400 && r.error && r.error.code === -32602) && !(await goalIds(owner)).includes(`${P}-x`) && (await fromOf(2)) === 1,
      "verbs · modern attacks on equip's retry: a changed call, a `preview` retry with equip's state, a member's retry — each 400 -32602, nothing done", [changed, cross, other].map((r) => r.status).join(","));
    const ey = await mo.call("tools/call", { name: "equip", arguments: { slug, v: 2, project: P, equipOnConfirm: true, eval: true }, requestState: st, inputResponses: accept });
    const eyo = outOf(ey);
    const rep = await mo.call("tools/call", { name: "equip", arguments: { slug, v: 2, project: P, equipOnConfirm: true, eval: true }, requestState: st, inputResponses: accept });
    ok(eyo && eyo.confirm && eyo.confirm.filed === true && eyo.v === 2 && eyo.from === 1 && rep.status === 400 && rep.error.code === -32602,
      "verbs · modern: accept updates the equip to v2 (from v1); a replayed state is 400 -32602", `${JSON.stringify(eyo).slice(0, 160)} / ${rep.status}`);
    const d4 = await draft(4);
    const pb = await mo.call("tools/call", { name: "publish", arguments: { id: d4, publishOnConfirm: true, eval: true } });
    const pn = await mo.call("tools/call", { name: "publish", arguments: { id: d4, publishOnConfirm: true, eval: true }, requestState: pb.result.requestState, inputResponses: { file: { action: "decline" } } });
    const pno = outOf(pn);
    ok(pno && pno.confirm && pno.confirm.answer === "decline" && pno.confirm.filed === false && pno.preview === true && pno.v === 3 && (await nextV(d4)) === 3,
      "verbs · modern: decline publishes nothing (the answer is the preview of v3, unpublished)", JSON.stringify(pno && pno.confirm));
  } catch (e) { ok(false, "publish and equip ask their confirm (7.5b)", e.message); }
}

// cleanup: archive the throwaway project (it is eval-marked; the clean-eval sweep removes its rows)
await control([["action", "archive-project"], ["projectKey", P]]).catch(() => "");
console.log(`${fail ? "✗" : "✓"} mcp-client-selftest: ${pass} passed, ${fail} failed`);
if (OUT) writeFileSync(OUT, JSON.stringify({ base: BASE, project: P, passed: pass, failed: fail, transcript }, null, 2));
process.exit(fail ? 1 : 0);
