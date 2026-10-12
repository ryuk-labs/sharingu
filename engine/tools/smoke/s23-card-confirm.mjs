// tools/smoke/s23-card-confirm.mjs — sprint 3, D3: the confirm prompt (elicitation) and the card (MCP Apps) through the
// real door. Self-contained: its own project (s23) and one member. The window's timeout (50 s) and the OAuth path are in
// tools/mcp-client-selftest.mjs, which this smoke does not repeat.
//   · initialize: a session id only for a client that declared elicitation or the Apps extension; GET and DELETE /mcp 405
//   · preview {fileOnConfirm: true} from a declared client: a stream whose first message is elicitation/create; accept files
//     exactly that preview; decline files nothing; a member answering the owner's elicitation is refused 400
//   · a client that declared nothing: JSON, nothing asked, nothing filed; tools/list the same as a session client's
//   · the card: ui://sharingu/card is self-contained; a client that declared the extension gets the card's fragment
//   · D3b, the stateless revision (2026-07-28): server/discover; preview {fileOnConfirm} answers input_required and its
//     retry with accept files exactly it, with decline files nothing
import { smoke, expect, brief, http, mcp, ownerKey, BASE, kwrite, kread } from "./lib.mjs";

const P = "s23";
const q = {};
const ELICIT = { elicitation: {} };
const UI = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };
let n = 0;
async function post(key, body, sid, accept = "application/json, text/event-stream") {
  return fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept, authorization: "Bearer " + key, ...(sid ? { "mcp-session-id": sid } : {}) }, body: JSON.stringify(body) });
}
async function init(key, caps) {
  const r = await post(key, { jsonrpc: "2.0", id: ++n, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: caps, clientInfo: { name: "s23", version: "1" } } });
  await r.text();
  return r.headers.get("mcp-session-id");
}
// callStream -> { type, final, first }: reads an SSE answer, calling onRequest for a server request
async function call(key, sid, name, args, onRequest) {
  const r = await post(key, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }, sid);
  const type = r.headers.get("content-type") || "";
  if (!/event-stream/.test(type)) { const j = await r.json(); return { type: "json", final: j, out: JSON.parse(j.result.content[0].text) }; }
  const text = r.body.getReader(); const dec = new TextDecoder(); let buf = "", first = null, final = null;
  for (;;) {
    const { done, value } = await text.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let k;
    while ((k = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, k); buf = buf.slice(k + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
      if (!data) continue;
      const m = JSON.parse(data);
      if (m.method) { first = first || m; if (onRequest) await onRequest(m); } else final = m;
    }
  }
  return { type: "sse", first, final, out: final && final.result ? JSON.parse(final.result.content[0].text) : null };
}
const respond = async (key, sid, id, result) => (await post(key, { jsonrpc: "2.0", id, result }, sid)).status;
const goal = (id) => ({ kind: "goal", op: "upsert", data: { id, title: id, parent: "s23-root", dimensions: [] } });
const goalIds = async () => ((await kread(ownerKey, { project: P, kind: "goal" })).out.items || []).map((g) => g.id);

smoke("D3 · sessions: an id only for a client that declared elicitation or the Apps extension; GET and DELETE /mcp answer 405", async () => {
  const r = await mcp(ownerKey, "create_project", { key: P, name: "S23" });
  expect(r.out.project && r.out.project.key === P, `create_project s23: ${brief(r.out)}`);
  const w = await kwrite(ownerKey, { project: P, ops: [{ kind: "goal", op: "upsert", data: { id: "s23-root", title: "S23 root", parent: null, dimensions: [] } }] });
  expect(!w.out.error, `root goal: ${brief(w.out)}`);
  q.sid = await init(ownerKey, ELICIT); q.uid = await init(ownerKey, UI);
  const none = await init(ownerKey, {});
  expect(/^sg1e\.[0-9a-f]{32}$/.test(q.sid || "") && /^sg1u\.[0-9a-f]{32}$/.test(q.uid || "") && none === null, `session ids: e=${q.sid} u=${q.uid} none=${none}`);
  const add = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", "S23 Member"], ["email", "s23m@smoke.local"], ["role", "member"], ["projectKey", P]] });
  q.member = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(q.member, "member key");
  q.msid = await init(q.member, ELICIT);
  for (const m of ["GET", "DELETE"]) { const x = await fetch(BASE + "/mcp", { method: m, headers: { authorization: "Bearer " + ownerKey } }); expect(x.status === 405, `${m} /mcp -> ${x.status}`); }
  return "e, u and none; GET 405, DELETE 405";
});

smoke("D3 · the confirm: a declared client's preview streams elicitation/create; accept files exactly it; decline files nothing; a member's answer is refused", async () => {
  let el = null, attack = null;
  const a = await call(ownerKey, q.sid, "preview", { project: P, items: [goal("s23-yes")], fileOnConfirm: true }, async (m) => {
    el = m;
    attack = await respond(q.member, q.msid, m.id, { action: "accept", content: { file: true } });
    expect((await respond(ownerKey, q.sid, m.id, { action: "accept", content: { file: true } })) === 202, "the owner's accept is not 202");
  });
  expect(a.type === "sse" && el && el.method === "elicitation/create" && el.params.requestedSchema.properties.file.type === "boolean", `stream + elicitation: ${a.type} ${brief(el)}`);
  expect(attack === 400, `a member answering the owner's elicitation: ${attack}`);
  expect(a.out && a.out.confirm && a.out.confirm.filed === true && a.out.complete === true && a.out.previewId === String(el.id).split(":")[1], `accept -> receipt: ${brief(a.out && a.out.confirm)}`);
  const d = await call(ownerKey, q.sid, "preview", { project: P, items: [goal("s23-no")], fileOnConfirm: true }, async (m) => { await respond(ownerKey, q.sid, m.id, { action: "decline" }); });
  expect(d.out && d.out.confirm && d.out.confirm.answer === "decline" && d.out.confirm.filed === false, `decline: ${brief(d.out && d.out.confirm)}`);
  const ids = await goalIds();
  expect(ids.includes("s23-yes") && !ids.includes("s23-no"), `goals after: ${ids.join(",")}`);
  return `filed ${a.out.previewId}; declined ${d.out.previewId}`;
});

smoke("D3 · a client that declared nothing: JSON, nothing asked, nothing filed; tools/list unchanged but for _meta on the card's four tools", async () => {
  const r = await call(ownerKey, null, "preview", { project: P, items: [goal("s23-plain")], fileOnConfirm: true });
  expect(r.type === "json" && r.out.previewId && r.out.confirm && r.out.confirm.asked === false, `plain: ${brief(r.out.confirm)}`);
  expect(!(await goalIds()).includes("s23-plain"), "nothing filed");
  const tl = async (sid) => (await (await post(ownerKey, { jsonrpc: "2.0", id: ++n, method: "tools/list" }, sid)).json()).result.tools;
  const a = await tl(null), b = await tl(q.sid);
  expect(JSON.stringify(a) === JSON.stringify(b), "tools/list differs with a session");
  const meta = a.filter((t) => t._meta).map((t) => t.name).sort().join(",");
  expect(meta === "equip,file,preview,publish", `_meta on: ${meta}`);
  return "asked false; _meta on equip, file, preview, publish";
});

smoke("D3 · the card: ui://sharingu/card is self-contained; a client that declared the extension gets the card's fragment", async () => {
  const rr = await (await post(ownerKey, { jsonrpc: "2.0", id: ++n, method: "resources/read", params: { uri: "ui://sharingu/card" } }, q.uid)).json();
  const c = rr.result.contents[0];
  expect(c.mimeType === "text/html;profile=mcp-app" && /^<!doctype html>/i.test(c.text), "mime or doctype");
  expect(!/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(c.text) && !/<[^>]+\son[a-z]+\s*=/i.test(c.text) && (c.text.match(/<script\b/gi) || []).length === 1, "an external URL, an inline handler or more than one script");
  const p = await call(ownerKey, q.uid, "preview", { project: P, items: [goal("s23-card")] });
  const html = p.final.result._meta && p.final.result._meta["sharingu/card"] && p.final.result._meta["sharingu/card"].html;
  expect(html && html.includes(`data-preview="${p.out.previewId}"`) && new RegExp(`data-file data-tool="file" data-preview-id="${p.out.previewId}"`).test(html), "the card's fragment or its File action");
  const plain = await call(ownerKey, null, "preview", { project: P, items: [goal("s23-card")] });
  expect(!plain.final.result._meta, "a plain client got _meta");
  return `${c.text.length} bytes; fragment ${html.length} bytes`;
});

// D3b: a request of the stateless revision carries its version and capabilities in _meta and mirrors them in headers
async function modern(method, params, caps = ELICIT) {
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": caps };
  const named = method === "resources/read" ? params.uri : params.name;
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer " + ownerKey,
    "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(typeof named === "string" ? { "mcp-name": named } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params: { ...params, _meta: meta } }) });
  const j = await r.json();
  return { status: r.status, sid: r.headers.get("mcp-session-id"), j, out: j.result && j.result.content ? JSON.parse(j.result.content[0].text) : null };
}

smoke("D3b · the stateless revision: discover; the confirm answers input_required, its retry with accept files exactly it, decline files nothing", async () => {
  const d = await modern("server/discover", {});
  expect(d.status === 200 && d.j.result.resultType === "complete" && d.j.result.supportedVersions.includes("2026-07-28") && /^sharingu/.test(d.j.result._meta["io.modelcontextprotocol/serverInfo"].name) && /whoami/.test(d.j.result.instructions) && !d.sid, `discover: ${brief(d.j)}`);
  const args = (id) => ({ project: P, items: [goal(id)], fileOnConfirm: true });
  const a = await modern("tools/call", { name: "preview", arguments: args("s23-m-yes") });
  expect(a.j.result && a.j.result.resultType === "input_required" && a.j.result.inputRequests.file.method === "elicitation/create" && /^sg2\./.test(a.j.result.requestState), `input_required: ${brief(a.j)}`);
  const y = await modern("tools/call", { name: "preview", arguments: args("s23-m-yes"), requestState: a.j.result.requestState, inputResponses: { file: { action: "accept", content: { file: true } } } });
  expect(y.out && y.out.confirm && y.out.confirm.filed === true && y.out.complete === true, `accept: ${brief(y.out && y.out.confirm || y.j)}`);
  const b = await modern("tools/call", { name: "preview", arguments: args("s23-m-no") });
  const no = await modern("tools/call", { name: "preview", arguments: args("s23-m-no"), requestState: b.j.result.requestState, inputResponses: { file: { action: "decline" } } });
  expect(no.out && no.out.confirm && no.out.confirm.answer === "decline" && no.out.confirm.filed === false, `decline: ${brief(no.out && no.out.confirm || no.j)}`);
  const ids = await goalIds();
  expect(ids.includes("s23-m-yes") && !ids.includes("s23-m-no"), `goals after: ${ids.join(",")}`);
  return `discover ok; filed ${y.out.previewId}; declined ${no.out.previewId}`;
});
