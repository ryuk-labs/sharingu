// tools/card-shots.mjs — sprint 3, D3: the card (MCP Apps) in a real browser, as a host draws it. Local only.
//
//   node tools/card-shots.mjs --url http://127.0.0.1:<port> --creds <org dir>/credentials.env [--project <key>] [--out .runs/shots-d3]
//
// It previews a few items on the local org (eval-marked) through the door as a client that declared the Apps extension, then
// opens a HOST page in the pinned headless Chrome for Testing (~/.sharingu/chrome-for-testing.app; never the owner's Chrome):
// the host frames resources/read ui://sharingu/card in an <iframe sandbox="allow-scripts"> (an opaque origin, as a host's
// sandbox), speaks the Apps bridge to it (answers ui/initialize with the theme and serverTools, sends tool-input with the
// preview's arguments and tool-result with the preview's result) and records what the card asks of it. Checks, each a line:
// the bridge's handshake; the card drawn from the result; the File button shown only with a host that proxies tools; a
// press asks tools/call `file` with exactly the preview's id and items (the script then makes that call on the door and
// hands the result back, as a host does); the receipt drawn; a link press asks ui/open-link. Shots: the card in Paper and
// Ink at 480 and 720 wide (<out>/card-<paper|ink>-<w>.png) and the receipt (<out>/card-receipt-<theme>-720.png).
//
//   node tools/card-shots.mjs --url http://127.0.0.1:<port> --creds <credentials.env> --carousel <dir> [--project sharingu] [--themes paper]
//
// --carousel (sprint 11, 11.1): the Claude directory's MCP App carousel. A few scenes on the project's REAL data (its goal tree,
// its map's nodes, the starter shelf), each a tool call a person's Claude would make — a decision with its reasons, a mixed
// preview (what files at once and what needs one more thing), a goal and where it lands in the tree, an equip — and each
// drawn by the same host page as above, at 560 px wide and a device scale factor of 2 (1120 px), cropped to the card's own
// frame: <dir>/<n>-<scene>.png (Paper; --themes paper,ink adds <n>-<scene>-ink.png) and <dir>/prompts.md (each image and
// the prompt a person would have typed). PREVIEWS ONLY: no file, no confirm. A preview writes nothing to the project, only its
// own row in previews (expires in an hour, then pruned); it is NOT eval-marked, because the door refuses the eval mark on a
// real project (src/core.js evalMarkRefused: knowledge always, a contribution unless from a test seat), and the owner's
// seat is no test seat. Each card's visible text is checked before its shot: drawn, no loopback address, no key, no eval word.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = String(arg("url", "")).replace(/\/+$/, "");
const CREDS = arg("creds", "");
const PROJECT = arg("project", "sharingu");
const OUT = join(ENGINE, arg("out", ".runs/shots-d3"));
if (!/^http:\/\/(127\.|localhost)/.test(BASE) || !CREDS) { console.error("usage: node tools/card-shots.mjs --url http://127.0.0.1:<port> --creds <credentials.env> [--project <key>]"); process.exit(2); }
const KEY = (readFileSync(CREDS, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1];
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg, d) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${d ? ` — ${String(d).slice(0, 300)}` : ""}`); } };

// ---- the door, as a client that declared the Apps extension ----
let id = 0, sid = null;
const rpc = async (method, params) => {
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${KEY}`, ...(sid ? { "mcp-session-id": sid } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  if (method === "initialize") sid = r.headers.get("mcp-session-id");
  return (await r.json()).result;
};
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } }, clientInfo: { name: "card-shots", version: "1" } });
const template = (await rpc("resources/read", { uri: "ui://sharingu/card" })).contents[0].text;
const nodes = JSON.parse((await rpc("tools/call", { name: "read", arguments: { project: PROJECT, kind: "node", limit: 100 } })).content[0].text).items || [];
const ids = nodes.filter((n) => /^(door|table|screen):/.test(n.id)).map((n) => n.id);
const CAROUSEL = arg("carousel", "");
const T = Date.now().toString(36);
const args = CAROUSEL ? null : { project: PROJECT, eval: true, note: "From the call notes", items: [
  { contribution: { lane: "code", kind: "pr", what: `Pricing page reads the plans from one door (${T})`, why: "the plans were typed twice", touches: ids.slice(0, 2), proof: "npm test: 48 passed, 0 failed" } },
  { contribution: { lane: "leader", kind: "note", what: `Annual pricing: a 15% discount for the waitlist (${T})`, why: "the waitlist asked for yearly billing", touches: ids.slice(2, 3) } },
  { contribution: { lane: "code", kind: "pr", what: `Settings: the theme switch moves to the rail (${T})`, why: "people looked for it there", touches: ids.slice(3, 4), proof: "npm test: 12 passed; shot settings-v3.png shows the switch" } },
], leftOut: [{ what: "12 messages of scheduling", why: "no fact or decision in them" }, { what: "a link to a private doc", why: "not readable from here" }] };
const res = CAROUSEL ? null : await rpc("tools/call", { name: "preview", arguments: args });
const answer = CAROUSEL ? {} : JSON.parse(res.content[0].text);
if (!CAROUSEL) ok(answer.previewId && res._meta && res._meta["sharingu/card"], "a preview with the card in its result", answer.error || answer.notReady);

// ---- the host page (hostOf(tool): the page that frames the card and hands it this tool call's input and result) ----
const hostOf = ({ args, result: res }) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:THEMEBG}iframe{display:block;width:100%;border:0;height:200px}</style></head><body>
<iframe id="f" sandbox="allow-scripts"></iframe>
<script>
window.__log=[];window.__calls=[];var f=document.getElementById('f');var TOOL=${JSON.stringify({ args, result: res }).replace(/<\//g, "<\\/")};var THEME='THEMEVAL';
function to(m){f.contentWindow.postMessage(m,'*')}
window.__reply=function(id,result){to({jsonrpc:'2.0',id:id,result:result})};
window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var m=e.data;window.__log.push(m.method||('reply:'+m.id));
 if(m.method==='ui/initialize'){to({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'card-shots',version:'1'},hostCapabilities:{serverTools:{},openLinks:{}},hostContext:{theme:THEME,displayMode:'inline'}}});return}
 if(m.method==='ui/notifications/initialized'){to({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:TOOL.args}});to({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:TOOL.result});return}
 if(m.method==='ui/notifications/size-changed'){if(m.params&&m.params.height)f.style.height=m.params.height+'px';return}
 if(m.method==='tools/call'||m.method==='ui/open-link'){window.__calls.push(m);return}});
f.srcdoc=${JSON.stringify(template).replace(/<\//g, "<\\/")};
</script></body></html>`;

// ---- Chrome over the DevTools protocol ----
const CHROME = join(homedir(), ".sharingu/chrome-for-testing.app/Contents/MacOS/Google Chrome for Testing");
const profile = mkdtempSync(join(tmpdir(), "sharingu-card-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res2, rej) => { let buf = ""; const t = setTimeout(() => rej(new Error("no DevTools port")), 15000); chrome.stderr.on("data", (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); res2(m[1]); } }); });
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const waiting = new Map();
// the card's frame is sandboxed (an opaque origin): Chrome runs it as its own target, auto-attached below; frames[parent] is its session
const frames = {};
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const { res: r, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : r(m.result); }
  else if (m.method === "Target.attachedToTarget" && m.params.targetInfo.type === "iframe") frames[m.sessionId] = m.params.sessionId; });
const send = (method, params = {}, sessionId) => new Promise((r, rej) => { const i = ++seq; waiting.set(i, { res: r, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalTop = async (s, expr) => ((await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, s)).result || {}).value;
// evalCard: run an expression inside the card's frame (its own target when it runs out of process, else the frame's world)
async function evalCard(s, expr) {
  if (frames[s]) return ((await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, frames[s])).result || {}).value;
  const { frameTree } = await send("Page.getFrameTree", {}, s);
  const child = frameTree.childFrames && frameTree.childFrames[0];
  if (!child) return undefined;
  const { executionContextId } = await send("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "card-shots" }, s);
  return ((await send("Runtime.evaluate", { expression: expr, contextId: executionContextId, returnByValue: true, awaitPromise: true }, s)).result || {}).value;
}
const shoot = async (s, file, width) => {
  const h = await evalTop(s, "Math.ceil(document.getElementById('f').getBoundingClientRect().height)");
  await send("Emulation.setDeviceMetricsOverride", { width, height: Math.max(200, h || 600), deviceScaleFactor: 2, mobile: false }, s);
  await sleep(400);
  const h2 = await evalTop(s, "Math.ceil(document.getElementById('f').getBoundingClientRect().height)");
  await send("Emulation.setDeviceMetricsOverride", { width, height: Math.max(200, h2 || 600), deviceScaleFactor: 2, mobile: false }, s);
  await sleep(200);
  const { data } = await send("Page.captureScreenshot", { format: "png" }, s);
  writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
  return h2;
};

// ---- the carousel (--carousel <dir>): the scenes, each a real tool call on the project, drawn and cropped to the card ----
// sceneArgs(goals) -> the scenes. Each names the prompt a person types; the args are what their Claude would send. Every id the
// items name is the project's own (its goal tree, its map's nodes; the door checks every ref it touches); `expect` is each
// item's verdict, so a ref the map lacks (a needs the scene did not mean) is a red line, never a quiet shot.
function sceneArgs(goals) {
  const has = (gid) => goals.some((g) => g.id === gid);
  const m4 = has("m4-submit") ? "m4-submit" : has("marketplace") ? "marketplace" : (goals.find((g) => g.parent) || {}).id;
  return [
    { name: "decision", tool: "preview", expect: "files,files",
      prompt: "We just agreed to send the connector and the plugin to Claude's directory together. Record that, and open a question on whether the carousel shows Paper only or Ink too.",
      args: { project: PROJECT, items: [{ kind: "question", op: "upsert", data: {
        qid: "R-m4-submit-together", question: "Do the connector and the plugin go to Claude's directory together?", status: "decided",
        why: "The plugin's only server is the connector: a reviewer needs both to try it.",
        options: [{ what: "Together, in one submission round", tradeoff: "one review; the plugin points at a connector still under review" },
          { what: "The connector first, the plugin once it is listed", tradeoff: "two reviews; the plugin waits for the first" }],
        choice: 0, rationale: "The plugin is skills plus one MCP entry pointing at the connector; reviewed apart, neither is tested the way a person installs it.",
        affects: m4 ? [`goal/${m4}`] : [] } },
        { kind: "question", op: "upsert", data: {
          qid: "Q-carousel-theme", question: "Does the carousel show the card in Paper only, or in Paper and Ink?", status: "open",
          why: "The directory shows a handful of images; two worlds halve the scenes.",
          options: [{ what: "Paper only", tradeoff: "more scenes, the light default most people see" }, { what: "Paper and Ink", tradeoff: "shows both worlds, fewer scenes" }],
          affects: m4 ? [`goal/${m4}`] : [] } }] } },
    { name: "mixed", tool: "preview", expect: "files,files,needs",
      prompt: "Here are my notes from today's session on the card. File what's worth keeping.",
      args: { project: PROJECT, note: "From today's session notes", items: [
        { contribution: { lane: "code", kind: "pr", what: "The card hides File until the host can carry it", why: "a press with no host to carry it did nothing",
          touches: ["screen:card", "door:MCP:preview", "door:MCP:file"], proof: "card-shots: 9 passed, 0 failed", ...(m4 ? { goalRef: m4 } : {}) } },
        { contribution: { lane: "code", kind: "pr", what: "The preview page and the card draw one summary block", why: "the two had drifted on the Reach card",
          touches: ["screen:preview", "screen:card", "door:GET:/preview/:id"], proof: "smoke: 320 passed, 0 failed" } },
        // the honest gap: the notes never said what this one touches, so the door asks for it (and files the rest at once)
        { contribution: { lane: "code", kind: "pr", what: "Long previews keep their first 60 items on the card", why: "a 64 KB card is cut by the chat" } },
      ], leftOut: [{ what: "Twenty minutes on lunch plans", why: "no fact or decision in them" }, { what: "A pasted stack trace", why: "already fixed in the second item" }] } },
    { name: "goal", tool: "preview", expect: "files",
      prompt: "Add the carousel shots as a goal under M4, due Friday.",
      args: { project: PROJECT, items: [{ kind: "goal", op: "upsert", data: {
        id: "m4-carousel", parent: m4, title: "The MCP App carousel: the card in 3 to 5 shots", dimensions: ["gtm"], due: "2026-10-16", status: "in progress" } }] } },
    { name: "equip", tool: "equip", expect: "",
      prompt: "Equip the QA verify agent from the starter shelf on sharingu.",
      args: { slug: "preset:qa-verify", project: PROJECT } },
  ];
}
const CARD_TEXT_BAD = [[/127\.0\.0\.1|localhost|:\d{4,5}\//i, "a local address"], [/\beval\b/i, "the eval word"], [/bearer|_key\b|ar_[a-z0-9]{16,}|sk-[a-z0-9]/i, "a key"], [/refused|eval_mark/i, "a refusal"]];
async function carousel(dir) {
  mkdirSync(dir, { recursive: true });
  const THEMES = String(arg("themes", "paper")).split(",").filter((t) => t === "paper" || t === "ink");
  const WIDTH = Number(arg("width", "560"));
  const goals = JSON.parse((await rpc("tools/call", { name: "read", arguments: { project: PROJECT, kind: "goal", limit: 200 } })).content[0].text).items || [];
  const nodeIds = JSON.parse((await rpc("tools/call", { name: "read", arguments: { project: PROJECT, kind: "node", limit: 500 } })).content[0].text).items.map((n) => n.id);
  ok(goals.length > 1 && nodeIds.length > 10, `the project's real data: ${goals.length} goals, ${nodeIds.length} nodes`);
  const scenes = sceneArgs(goals);
  const rows = [];
  let n = 0;
  for (const sc of scenes) {
    n++;
    let result = await rpc("tools/call", { name: sc.tool, arguments: sc.args });
    let a = JSON.parse((result && result.content && result.content[0] && result.content[0].text) || "{}");
    // an equip names the shelf's version: asked without one, the door answers the version it carries (as a Claude learns it)
    if (a.error === "unknown_version" && a.latest) { sc.args = { ...sc.args, v: a.latest }; result = await rpc("tools/call", { name: sc.tool, arguments: sc.args }); a = JSON.parse((result && result.content && result.content[0] && result.content[0].text) || "{}"); }
    const drawn0 = !!(result && result._meta && result._meta["sharingu/card"]);
    const verdicts = (a.items || []).map((x) => x.verdict).join(",");
    ok(drawn0 && !a.error && !(result && result.isError) && verdicts === sc.expect, `${sc.name}: ${sc.tool} answers the card (${verdicts || a.verb || ""}${verdicts === sc.expect ? "" : `, expected ${sc.expect}`})`, a.error ? `${a.error}: ${a.note || a.hint || ""}` : JSON.stringify(a).slice(0, 400));
    if (arg("dump")) writeFileSync(join(OUT, `carousel-${sc.name}.json`), JSON.stringify(a, null, 1));
    if (!drawn0) continue;
    for (const theme of THEMES) {
      const page = join(OUT, `carousel-host-${sc.name}-${theme}.html`);
      writeFileSync(page, hostOf({ args: sc.args, result }).replace("THEMEVAL", theme === "paper" ? "light" : "dark").replace("THEMEBG", theme === "paper" ? "#F7F5EF" : "#0F0E0D"));
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Page.enable", {}, s);
      await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, s);
      await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 1400, deviceScaleFactor: 2, mobile: false }, s);
      await send("Page.navigate", { url: "file://" + page }, s);
      await sleep(1500);
      // a row that needs one more thing is shown opened (what it needs, in the door's words), as a person opens it to see why;
      // an equip's one row too (who it reaches)
      await evalCard(s, "[].forEach.call(document.querySelectorAll('li[data-verdict=needs] details.p-x,[data-verb] details.p-x'),function(d){d.open=true})");
      await sleep(400);
      const seen = JSON.parse(await evalCard(s, "JSON.stringify({state:(document.querySelector('[data-screen=card]')||{getAttribute(){return ''}}).getAttribute('data-state'),text:(document.getElementById('sg-card')||document.body).innerText,file:!!document.querySelector('[data-file]:not([hidden])')})") || "{}");
      const bad = CARD_TEXT_BAD.filter(([re]) => re.test(seen.text || "")).map(([, w]) => w);
      ok(seen.state === "open" && !bad.length, `${sc.name} ${theme}: drawn (state ${seen.state}${seen.file ? ", its button shown" : ""}), its text clean${bad.length ? ` — shows ${bad.join(", ")}` : ""}`, bad.length ? seen.text.slice(0, 600) : "");
      // the frame's own height (size-changed), then the shot cropped to the frame: the card alone
      let h = 0;
      for (let k = 0; k < 2; k++) {
        h = await evalTop(s, "Math.ceil(document.getElementById('f').getBoundingClientRect().height)");
        await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: Math.max(200, h || 600), deviceScaleFactor: 2, mobile: false }, s);
        await sleep(300);
      }
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: WIDTH, height: h, scale: 1 } }, s);
      const file = `${n}-${sc.name}${theme === "paper" ? "" : "-ink"}.png`;
      writeFileSync(join(dir, file), Buffer.from(data, "base64"));
      console.log(`  · ${file}  ${WIDTH * 2} × ${h * 2}`);
      if (theme === THEMES[0]) rows.push([file, sc.prompt]);
      await send("Target.closeTarget", { targetId });
    }
  }
  writeFileSync(join(dir, "prompts.md"), `# The MCP App carousel\n\nsharingu's card (\`ui://sharingu/card\`), as a host draws it under the tool's result: each image is the card alone,
${WIDTH * 2} px wide, on the sharingu project's own data. Each is the prompt a person would type; the tool wrote the call's arguments.\n
| Image | Prompt |\n|---|---|\n${rows.map(([f, p]) => `| \`${f}\` | ${p} |`).join("\n")}\n
Made by \`engine/tools/card-shots.mjs --carousel\` on the local app (previews only: nothing filed).\n`);
  console.log(`  · ${join(dir, "prompts.md")}`);
}

if (CAROUSEL) { try { await carousel(resolve(process.cwd(), CAROUSEL)); } finally { try { ws.close(); } catch {} chrome.kill("SIGTERM"); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
  console.log(`${fail ? "✗" : "✓"} card-shots --carousel: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

let receiptShot = false;
for (const theme of ["paper", "ink"]) {
  const t = theme === "paper" ? "light" : "dark";
  const page = join(OUT, `host-${theme}.html`);
  writeFileSync(page, hostOf({ args, result: res }).replace("THEMEVAL", t).replace("THEMEBG", theme === "paper" ? "#F7F5EF" : "#0F0E0D"));
  for (const width of [480, 720]) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, s);
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, s);
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: false }, s);
    await send("Page.navigate", { url: "file://" + page }, s);
    await sleep(1500);
    const log = await evalTop(s, "window.__log");
    if (theme === "paper" && width === 480) {
      ok(Array.isArray(log) && log[0] === "ui/initialize" && log.includes("ui/notifications/initialized") && log.includes("ui/notifications/size-changed"), "the bridge: ui/initialize, then initialized, then size-changed", JSON.stringify(log));
      const drawn = await evalCard(s, "JSON.stringify({state:(document.querySelector('[data-screen=card]')||{}).getAttribute&&document.querySelector('[data-screen=card]').getAttribute('data-state'),rows:document.querySelectorAll('[data-i]').length,file:!!document.querySelector('[data-file]:not([hidden])'),theme:document.documentElement.getAttribute('data-theme')})");
      const d = JSON.parse(drawn || "{}");
      ok(d.state === "open" && d.rows === answer.items.length, `the card drawn from the tool's result: ${d.rows} rows, state ${d.state}`, drawn);
      ok(d.file === (answer.notReady === 0), `the File button ${d.file ? "shown (every item ready, a host that proxies tools)" : "hidden"}`, drawn);
      ok(d.theme === "light", "the host's theme (light) sets Paper");
    }
    const h = await shoot(s, `card-${theme}-${width}.png`, width);
    if (theme === "paper" && width === 480) ok(h > 150, `the host sized the frame from size-changed (${h}px)`);
    if (width === 720 && !receiptShot && answer.notReady === 0) {
      // a link press asks the host to open it; the File press asks tools/call file with the preview's id and items
      await evalCard(s, "(document.querySelector('a[data-open]')||{click(){}}).click()");
      await evalCard(s, "document.querySelector('[data-file]').click()");
      await sleep(300);
      const calls = await evalTop(s, "window.__calls");
      const link = (calls || []).find((c) => c.method === "ui/open-link");
      ok(link && /^http:\/\/127\.0\.0\.1:\d+\//.test(link.params.url), "a link press asks ui/open-link with the app's address", link && link.params.url);
      const call = (calls || []).find((c) => c.method === "tools/call");
      ok(call && call.params.name === "file" && call.params.arguments.previewId === answer.previewId && JSON.stringify(call.params.arguments.items) === JSON.stringify(args.items), "the File press asks tools/call `file` with exactly this preview's id and items", call && JSON.stringify(call.params).slice(0, 200));
      if (call) {
        const filed = await rpc("tools/call", call.params);   // the host makes the call on the door (its own consent first)
        await evalTop(s, `window.__reply(${JSON.stringify(call.id)}, ${JSON.stringify(filed)})`);
        await sleep(800);
        const after = await evalCard(s, "(document.querySelector('[data-screen=card]')||{getAttribute(){return ''}}).getAttribute('data-state')");
        ok(after === "filed", "the receipt drawn in place (state filed)", after);
        await shoot(s, `card-receipt-${theme}-720.png`, 720);
        receiptShot = true;
      }
    }
    await send("Target.closeTarget", { targetId });
  }
}
// the same document opened on its own (no host): it draws nothing of a tool's and shows its quiet waiting line, no error
{
  writeFileSync(join(OUT, "card-template.html"), template);
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, s); await send("Runtime.enable", {}, s);
  await send("Page.navigate", { url: "file://" + join(OUT, "card-template.html") }, s);
  await sleep(800);
  const st = await evalTop(s, "document.querySelector('[data-state=loading]')?'waiting':'?'");
  ok(st === "waiting", "the template on its own (no host): its waiting line, nothing else");
  await send("Target.closeTarget", { targetId });
}
try { ws.close(); } catch {}
chrome.kill("SIGTERM");
try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(`${fail ? "✗" : "✓"} card-shots: ${pass} passed, ${fail} failed · shots in ${OUT}`);
process.exit(fail ? 1 : 0);
