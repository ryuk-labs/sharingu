// tools/smoke/s54-client.mjs — sprint 13, 13.1: which AI filed it (src/client.js; migrate-080's transmission.client), on the real
// local worker:
//   · a handshake client whose initialize clientInfo is "Claude Code" (no flag declared) holds a session id carrying its family
//     word (sg1.claude-code.<hex>); its preview then file stores the row as claude-code — the word, never the raw name;
//   · a stateless (2026-07-28) client whose _meta clientInfo is "codex-mcp-client" files a row stored codex;
//   · a key on the REST API (POST /preview/file-contribution, no client signal) files a row stored api;
//   · Activity shows it: changes {org: true, list: true} answers each item's client, and GET /audit?all=1 says "from Claude Code"
import { randomBytes } from "node:crypto";
import { smoke, expect, ownerKey, d1rows as rows, BASE, patientFetch, http, brief } from "./lib.mjs";
const fetch = patientFetch;

const TAG = randomBytes(3).toString("hex");
const P = "smoke";
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
let n = 0;
async function post(body, headers = {}) {
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + ownerKey, ...headers }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  return { status: r.status, sid: r.headers.get("mcp-session-id"), json: j };
}
const outOf = (j) => { try { return JSON.parse(j.result.content[0].text); } catch { return null; } };
const clientOf = (id) => (rows(`SELECT client FROM transmission WHERE id = ${q(id)}`)[0] || {}).client;
const item = (what) => [{ contribution: { lane: "leader", kind: "note", what, why: "the smoke files it to see which AI is stamped" } }];
// fileWith(call) -> the filed row's id: preview then file_contribution through `call(name, args)`
async function fileWith(call, what) {
  const items = item(what);
  const pv = await call("preview", { project: P, items });
  const f = pv && pv.previewId ? await call("file_contribution", { previewId: pv.previewId, items }) : pv;
  const id = f && f.results && f.results[0] && f.results[0].id;
  expect(id, () => `${what}: ${brief(f)}`);
  return id;
}

smoke("client · 13.1 which AI filed it: a Claude Code session files claude-code, a stateless Codex call codex, a REST key api; changes {org, list} and Activity show it", async () => {
  // the handshake revision: clientInfo "Claude Code", no capability declared
  const init = await post({ jsonrpc: "2.0", id: ++n, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Claude Code", version: "2.1" } } });
  expect(init.status === 200 && /^sg1\.claude-code\.[0-9a-f]{32}$/.test(init.sid || ""), () => `initialize: ${init.status}, session ${init.sid}`);
  const sid = init.sid;
  const cc = await fileWith(async (name, args) => outOf((await post({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }, { "mcp-session-id": sid })).json), `S54 from Claude Code ${TAG}`);
  // the stateless revision: _meta clientInfo "codex-mcp-client"
  const V = "2026-07-28";
  const modern = async (name, args) => outOf((await post({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args,
    _meta: { "io.modelcontextprotocol/protocolVersion": V, "io.modelcontextprotocol/clientInfo": { name: "codex-mcp-client", version: "0.9" }, "io.modelcontextprotocol/clientCapabilities": {} } } },
    { "mcp-protocol-version": V, "mcp-method": "tools/call", "mcp-name": name })).json);
  const cx = await fileWith(modern, `S54 from Codex ${TAG}`);
  // a key on REST, no client signal
  const rest = async (name, args) => (await http("POST", name === "preview" ? "/preview" : "/preview/file-contribution", { key: ownerKey, body: args })).json;
  const api = await fileWith(rest, `S54 from a script ${TAG}`);
  const stored = { [cc]: clientOf(cc), [cx]: clientOf(cx), [api]: clientOf(api) };
  expect(stored[cc] === "claude-code" && stored[cx] === "codex" && stored[api] === "api", () => `stored: ${brief(stored)}`);
  // the door's read: changes {org: true, list: true}
  const list = outOf((await post({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "changes", arguments: { org: true, list: true, projects: [P], limit: 100 } } })).json) || {};
  const byId = new Map((list.items || []).map((i) => [i.id, i]));
  const said = [cc, cx, api].map((id) => byId.get(id) && byId.get(id).client);
  expect(said.join() === "claude-code,codex,api", () => `changes {org, list}: ${brief(said)} (${(list.items || []).length} items)`);
  // the page
  const page = await fetch(BASE + `/audit?all=1&in=${P}`, { headers: { accept: "text/html", authorization: "Bearer " + ownerKey } });
  const text = await page.text();
  expect(page.status === 200 && new RegExp(`S54 from Claude Code ${TAG}[\\s\\S]{0,600}from Claude Code`).test(text) && /from Codex/.test(text) && !/>\s*Claude Code\s*2\.1/.test(text),
    () => `GET /audit?all=1: ${page.status}, from Claude Code ${/from Claude Code/.test(text)}, from Codex ${/from Codex/.test(text)}`);
  return `${cc} claude-code (session ${sid.slice(0, 20)}…), ${cx} codex (stateless), ${api} api (REST); changes {org, list} and Activity say so`;
});
