// tools/smoke/s44-door.mjs — sprint 7, 7.5b (docs/plan/PLATFORM.md §3: "publish and equip show the card but ask no confirm; OAuth
// grants made before sprint 3's fix carry no stamp"), on the real local worker and its real OAuth provider. Runs after s43.
//   · publish and equip ask the SAME confirm as file: a client that declared elicitation calls publish {id, publishOnConfirm}
//     and gets a stream whose first message asks the person (titled Publish); its yes publishes exactly that draft; a stateless
//     (2026-07-28) client's equip {…, equipOnConfirm} answers input_required (titled Equip), a decline equips nothing, a yes on a
//     fresh ask equips; read back through the verbs' own previews (the next version; the project's current one)
//   · a grant with NO stamp (props {personId, scope}: what the code before sprint 3's G2 minted) is refused by the real worker,
//     401 invalid_token with the re-connect words, nothing read or written; the same seat's grant minted by today's form acts.
//     The stamp-less grant is minted by the REAL provider in-process (tools/fixtures/sqlite-worker.mjs over a copy of src/ whose
//     form leaves the stamp out, as the code before G2 did) and its records written into the local worker's grant store
//     (wrangler kv bulk put --local), as a grant that outlived the fix would sit in the live one
import { randomBytes, createHash, pbkdf2Sync } from "node:crypto";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { smoke, expect, http, ownerKey, d1rows as rows, BASE, patientFetch } from "./lib.mjs";
const fetch = patientFetch;   // raw door calls retry a transient socket failure (lib.mjs patientFetch)

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const P = "smoke";
const secretOf = (t) => (String(t).match(/API key\): ([0-9a-f]{40})\b/) || [])[1] || null;
let n = 0;
// post(body, headers) -> the raw /mcp answer: JSON, or the events of a stream (a server request on it goes to onRequest)
async function post(key, body, { headers = {}, onRequest } = {}) {
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer " + key, ...headers }, body: JSON.stringify(body) });
  const type = r.headers.get("content-type") || "";
  if (!/text\/event-stream/.test(type)) { const j = await r.json().catch(() => null); return { status: r.status, sid: r.headers.get("mcp-session-id"), json: j, text: JSON.stringify(j) }; }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "", final = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let k;
    while ((k = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, k); buf = buf.slice(k + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
      if (!data) continue;
      const m = JSON.parse(data);
      if (m.method && m.id != null && onRequest) await onRequest(m);
      if (!m.method && m.id != null && ("result" in m || "error" in m)) final = m;
    }
  }
  return { status: r.status, stream: true, json: final };
}
const outOf = (j) => { try { return JSON.parse(j.result.content[0].text); } catch { return null; } };
const tool = async (key, name, args) => outOf((await post(key, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } })).json);
// the oracles, through the verbs' own previews: a draft's next version (or already_published); the project's current equip
const nextV = async (id) => { const o = await tool(ownerKey, "publish", { id }); return o && (o.v || o.error); };
const fromOf = async (slug, v) => { const o = await tool(ownerKey, "equip", { slug, v, project: P }); return o && (o.error || o.from || "none"); };

smoke("door · publish and equip ask their confirm (7.5b): a declared client is asked on the call's own stream and its yes publishes exactly that draft; a stateless client's equip is input_required, a decline equips nothing, a yes equips", async () => {
  const slug = `s44k-${TAG}`;
  const draft = async (i) => {
    const items = [{ contribution: { lane: "leader", kind: "item", what: `S44 kit ${i}`, why: "a kit the door smoke publishes", touches: ["skill"], gapRefs: [`item/${slug}`], proof: `https://example.invalid/${slug}/${i}` } }];
    const pv = await tool(ownerKey, "preview", { project: P, items });
    const f = pv && pv.previewId ? await tool(ownerKey, "file_contribution", { previewId: pv.previewId, items }) : pv;
    const id = f && f.results && f.results[0] && f.results[0].id;
    expect(id, () => `the draft: ${JSON.stringify(f).slice(0, 200)}`);
    return id;
  };
  const d1 = await draft(1);
  // the handshake revision: a client that declared elicitation
  const init = await post(ownerKey, { jsonrpc: "2.0", id: ++n, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { elicitation: {} }, clientInfo: { name: "smoke-door", version: "1" } } });
  const sid = init.sid;
  expect(/^sg1e\./.test(sid || ""), () => `no session id: ${sid}`);
  let asked = null;
  const pub = await post(ownerKey, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "publish", arguments: { id: d1, publishOnConfirm: true } } }, { headers: { "mcp-session-id": sid },
    onRequest: async (m) => { asked = m; await post(ownerKey, { jsonrpc: "2.0", id: m.id, result: { action: "accept", content: { file: true } } }, { headers: { "mcp-session-id": sid } }); } });
  const po = pub.json && outOf(pub.json);
  const title = asked && asked.params && asked.params.requestedSchema.properties.file.title;
  expect(pub.stream && asked && asked.method === "elicitation/create" && title === "Publish" && po && po.confirm && po.confirm.filed === true && po.slug === slug && po.v === 1 && (await nextV(d1)) === "already_published",
    () => `publish {publishOnConfirm}: stream ${!!pub.stream}, asked ${asked && asked.method} (${title}); ${JSON.stringify(po).slice(0, 200)}`);
  // the stateless revision: equip, declined, then asked again and accepted
  const V = "2026-07-28";
  const modern = (args, extra = {}) => post(ownerKey, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "equip", arguments: args, ...extra,
    _meta: { "io.modelcontextprotocol/protocolVersion": V, "io.modelcontextprotocol/clientInfo": { name: "smoke-door", version: "1" }, "io.modelcontextprotocol/clientCapabilities": { elicitation: {} } } } },
    { headers: { "mcp-protocol-version": V, "mcp-method": "tools/call", "mcp-name": "equip" } });
  const args = { slug, v: 1, project: P, equipOnConfirm: true };
  const a1 = await modern(args);
  const ttl = a1.json && a1.json.result && a1.json.result.inputRequests && a1.json.result.inputRequests.file.params.requestedSchema.properties.file.title;
  const no = await modern(args, { requestState: a1.json.result.requestState, inputResponses: { file: { action: "decline" } } });
  const noo = no.json && outOf(no.json);
  const before = await fromOf(slug, 1);
  const a2 = await modern(args);
  const yes = await modern(args, { requestState: a2.json.result.requestState, inputResponses: { file: { action: "accept", content: { file: true } } } });
  const yo = yes.json && outOf(yes.json);
  expect(a1.json.result.resultType === "input_required" && ttl === "Equip" && noo && noo.confirm && noo.confirm.answer === "decline" && noo.confirm.filed === false && before === "none"
    && yo && yo.confirm && yo.confirm.filed === true && yo.v === 1 && yo.project === P && (await fromOf(slug, 1)) === "already_current",
    () => `equip {equipOnConfirm}: ${a1.json.result.resultType} (${ttl}); decline ${JSON.stringify(noo && noo.confirm)} (then ${before}); accept ${JSON.stringify(yo).slice(0, 200)}`);
  return `publish ${d1} asked on its stream (Publish), its yes published ${slug} v1; equip ${slug} v1 into ${P}: input_required (Equip), the decline equipped nothing, the next yes equipped it`;
});

smoke("door · a grant with NO stamp (props {personId, scope}: minted by the code before sprint 3's fix) is refused by the real worker: 401 invalid_token, re-connect words, nothing read; the same seat's grant made today acts", async () => {
  const { SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  expect(cfg && persist, "SMOKE_D1_* not set (tools/smoke.sh sets them)");
  // the seat, on the real worker: its own secret is its key (add-person's S-019)
  const email = `s44-stamp-${TAG}@smoke.local`;
  const key = secretOf((await http("POST", "/control", { key: ownerKey, form: { action: "add-person", name: `S44 Stamp ${TAG}`, email, projectKey: P, seatsChosen: "1" } })).text);
  const seat = (rows(`SELECT id FROM people WHERE email = ${q(email)} AND org = 1`)[0] || {}).id;
  expect(key && seat, () => `the seat: ${seat} (${!!key})`);
  // the stamp-less grant, minted by the REAL provider in-process: a copy of src/ whose form leaves the stamp out, over a database
  // holding that seat (its id and email; its secret here the in-process one), its grant store a Map
  const dir = mkdtempSync(join(ENGINE, ".s44-stampless-"));
  let token = null, entries = [];
  try {
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const f = join(dir, "src", "oauth.js"), t = readFileSync(f, "utf8"), line = "  return { personId: seat.id, scope, cred: await credEpoch(seat), ...client };";   // sprint 13, 13.1: the client word rides the props
    expect(t.split(line).length === 2, "the seat grant's props line is not found once in src/oauth.js (update this smoke with the code)");
    writeFileSync(f, t.replace(line, "  return { personId: seat.id, scope };"));
    const { sqliteWorker } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
    const w = await sqliteWorker({ projects: [P], src: join(dir, "src"), people: [[seat, `S44 Stamp ${TAG}`, "member", key, [P], email]] });
    const pass = `s44-inproc-${TAG}`, salt = randomBytes(16).toString("hex");
    w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = ?").run(pbkdf2Sync(pass, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"), salt, seat);
    const call = async (method, path, { body, form } = {}) => {
      const headers = { accept: "application/json" };
      let payload;
      if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
      else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
      const r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" }));
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
      return { status: r.status, text, json, location: r.headers.get("location") || "" };
    };
    const redirect = "http://127.0.0.1:9/cb";
    const reg = (await call("POST", "/oauth/register", { body: { client_name: "smoke-stampless", redirect_uris: [redirect], token_endpoint_auth_method: "none" } })).json;
    const verifier = randomBytes(32).toString("base64url");
    const qs = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, scope: "mcp:read mcp:write", state: "s", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    const req = ((await call("GET", `/oauth/authorize?${qs}`)).text.match(/name="oauth_req" value="([^"]+)"/) || [])[1];
    const r = await call("POST", "/oauth/authorize", { form: { oauth_req: req, email, password: pass } });
    const code = new URL(r.location || "http://x/").searchParams.get("code");
    expect(code, () => `the in-process sign-in gave no code (${r.status})`);
    token = (await call("POST", "/oauth/token", { form: { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier } })).json.access_token;
    const keys = (await w.env.OAUTH_KV.list({ prefix: "" })).keys.map((k) => k.name);
    entries = await Promise.all(keys.map(async (k) => ({ key: k, value: await w.env.OAUTH_KV.get(k) })));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  expect(token && entries.some((e) => /^grant:/.test(e.key)) && entries.some((e) => /^token:/.test(e.key)), () => `the in-process grant: token ${!!token}, records ${entries.map((e) => e.key.split(":")[0]).join(",")}`);
  // its records, written into the local worker's grant store as a grant that outlived the fix sits in the live one
  const file = join(persist, `..`, `s44-kv-${TAG}.json`);
  writeFileSync(file, JSON.stringify(entries));
  try { execFileSync("npx", ["--no-install", "wrangler", "kv", "bulk", "put", file, "--binding", "OAUTH_KV", "--local", "--persist-to", persist, "--config", cfg], { cwd: ENGINE, stdio: "pipe" }); }
  finally { rmSync(file, { force: true }); }
  const g0 = rows("SELECT COUNT(*) AS n FROM transmission")[0].n;
  const who = await post(token, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "whoami", arguments: {} } });
  const pv = await post(token, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "preview", arguments: { project: P, items: [{ contribution: { lane: "leader", kind: "note", what: "x", why: "y" } }] } } });
  const words = (who.json && who.json.error_description) || "";
  expect(who.status === 401 && who.json && who.json.error === "invalid_token" && /made before sharingu bound connections/.test(words) && pv.status === 401 && rows("SELECT COUNT(*) AS n FROM transmission")[0].n === g0,
    () => `the stamp-less grant on the real worker: whoami ${who.status} ${JSON.stringify(who.json).slice(0, 200)}; preview ${pv.status}`);
  // the instrument: the same seat connects through today's form (a stamped seat grant) and acts
  const today = await (async () => {
    const redirect = "http://127.0.0.1:9/cb";
    const reg = await (await fetch(BASE + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "smoke-stamped", redirect_uris: [redirect], token_endpoint_auth_method: "none" }) })).json();
    const verifier = randomBytes(32).toString("base64url");
    const qs = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, scope: "mcp:read mcp:write", state: "s", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    const req = ((await (await fetch(`${BASE}/oauth/authorize?${qs}`)).text()).match(/name="oauth_req" value="([^"]+)"/) || [])[1];
    const r = await fetch(BASE + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ oauth_req: req, email, password: key }).toString(), redirect: "manual" });
    const code = new URL(r.headers.get("location") || "http://x/").searchParams.get("code");
    const tok = await (await fetch(BASE + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier }).toString() })).json();
    return tok.access_token;
  })();
  const me = await tool(today, "whoami", {});
  expect(me && me.id === seat, () => `the same seat's grant made today: whoami ${JSON.stringify(me).slice(0, 200)}`);
  return `a grant with no stamp (${entries.length} records of the real provider, written into the local grant store): whoami 401 invalid_token ("${words.slice(0, 60)}…"), preview 401, 0 rows written; the same seat's grant made today acts as ${seat}`;
});
