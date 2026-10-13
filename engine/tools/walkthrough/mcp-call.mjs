#!/usr/bin/env node
// tools/walkthrough/mcp-call.mjs — the smallest MCP client: one tool call to a LOCAL org's door, printed the way a terminal
// client shows it. The walkthrough's terminal pane runs it for real (record.mjs: the command typed, its stdout shown), and
// the recorder imports its `call` for the steps it does not show.
//
//   SHARINGU_URL=http://127.0.0.1:8850 SHARINGU_KEY=<a seat's key, env only> node tools/walkthrough/mcp-call.mjs <tool> [<json> | @<file.json>]
//   ... mcp-call.mjs <write tool> <previewId> @<file.json>     file one part of what that preview showed: {previewId, items:
//       the file's items of that tool's form, in their order} (sprint 19: file_contribution the contributions, save_knowledge
//       the knowledge upserts, remove_knowledge the removes; tools/import/door.mjs writeToolOf)
//
// preview and the write tools print the door's own terminal text (src/previewtext.js: the preview, the part's receipt). Any other tool prints
// its answer as indented JSON, cut to --lines N (default 24). --json prints the whole answer as one JSON line instead (for
// a script). The key is read from SHARINGU_KEY and never printed; the url must be a loopback address. Exit 0 on an answer,
// 1 when the door answers an error (isError or a JSON-RPC error), 2 on a usage error.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { WRITE_TOOLS, writeToolOf } from "../import/door.mjs";

export const isLocal = (u) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(u || "").replace(/\/+$/, ""));

// call(base, key, name, args) -> {status, out, isError} (out: the tool's text parsed as JSON when it is JSON) or {status, error}
export async function call(base, key, name, a = {}) {
  const r = await fetch(base + "/mcp", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { status: r.status, error: t.slice(0, 300) }; }
  if (j.error) return { status: r.status, error: j.error };
  const c = j.result && j.result.content && j.result.content[0] && j.result.content[0].text;
  let out; try { out = JSON.parse(c); } catch { out = c; }
  return { status: r.status, out, isError: !!j.result.isError };
}

// show(name, res, lines) -> the text a terminal client prints for the answer
export function show(name, res, n = 24) {
  if (res.error) return `error ${res.status}: ${typeof res.error === "string" ? res.error : JSON.stringify(res.error)}`;
  const o = res.out;
  if (o && typeof o === "object" && typeof o.text === "string" && (name === "preview" || WRITE_TOOLS.includes(name))) return o.text;
  const lines = (typeof o === "string" ? o : JSON.stringify(o, null, 2)).split("\n");
  return lines.slice(0, n).join("\n") + (lines.length > n ? `\n... (${lines.length - n} more lines)` : "");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const li = argv.indexOf("--lines");
  const n = li >= 0 ? Number(argv[li + 1]) || 24 : 24;
  const pos = argv.filter((a, i) => !a.startsWith("--") && !(li >= 0 && i === li + 1));
  const BASE = String(process.env.SHARINGU_URL || "").replace(/\/+$/, "");
  const KEY = process.env.SHARINGU_KEY || "";
  const [tool, raw0, raw1] = pos;
  // <write tool> <previewId> @<file>: that tool's part of the items the preview was given (as previewed, in their order), under its id
  const raw = WRITE_TOOLS.includes(tool) && /^P-[0-9a-f]+$/.test(raw0 || "") && raw1
    ? JSON.stringify({ previewId: raw0, items: JSON.parse(readFileSync(raw1.replace(/^@/, ""), "utf8")).items.filter((it) => writeToolOf(it) === tool) }) : raw0;
  if (!tool || !BASE || !KEY) { console.error("usage: SHARINGU_URL=<local org> SHARINGU_KEY=<key> node tools/walkthrough/mcp-call.mjs <tool> [<json> | @<file>] [--json] [--lines N]"); process.exit(2); }
  if (!isLocal(BASE)) { console.error("mcp-call: the url must be a local org (http://127.0.0.1:<port>)"); process.exit(2); }
  let args = {};
  try { args = raw ? JSON.parse(raw.startsWith("@") ? readFileSync(raw.slice(1), "utf8") : raw) : {}; } catch (e) { console.error(`mcp-call: the arguments are not JSON (${e.message})`); process.exit(2); }
  const res = await call(BASE, KEY, tool, args);
  console.log(argv.includes("--json") ? JSON.stringify(res) : show(tool, res, n));
  process.exit(res.error || res.isError ? 1 : 0);
}
