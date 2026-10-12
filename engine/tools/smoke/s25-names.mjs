// tools/smoke/s25-names.mjs — sprint 3 D5 (the names): the MCP speaks ONE vocabulary, renamed at once with no alias and no
// redirect. Every old name in tools/names.json (the one source the release note and the docs are made from) is checked on
// the running worker: an old tool is absent from tools/list and refused by tools/call; an old REST address answers 404 to
// the owner (a script and a browser alike, never a 3xx) and is not declared by GET /capabilities; an old resource is not
// found. Each new name answers. Nothing here is a list typed by hand: names.json drives it.
import { readFileSync } from "node:fs";
import { smoke, expect, brief, http, html, mcp, toolsList, ownerKey } from "./lib.mjs";

const NAMES = JSON.parse(readFileSync(new URL("../names.json", import.meta.url), "utf8"));
// an old address with its parameters filled with ids nobody holds
const fill = (p) => p.replace(":kind/:id", "goal/s25-none").replace(":kind", "goal").replace(":role", "owner").replace(":id", "T-20200101-001");

smoke("names · every old tool name is gone: absent from tools/list, refused by tools/call; every new name is listed", async () => {
  const listed = new Set(await toolsList(ownerKey));
  const olds = [...new Set(NAMES.tools.filter((t) => t.old !== t.new).map((t) => t.old))];
  const news = [...new Set(NAMES.tools.map((t) => t.new).filter(Boolean))];
  const bad = [];
  for (const n of olds) {
    if (listed.has(n)) bad.push(`${n} listed`);
    const r = await mcp(ownerKey, n, {});
    if (!r.isError || !/unknown tool/.test(JSON.stringify(r.out))) bad.push(`${n} called: ${brief(r.out).slice(0, 80)}`);
  }
  const missing = news.filter((n) => !listed.has(n));
  expect(!bad.length && !missing.length, () => `${bad.slice(0, 6).join(" | ")} · new names not listed: ${missing.join(", ")}`);
  return `${olds.length} old names: none listed, each "unknown tool"; ${news.length} new names all listed (the owner's tools/list: ${listed.size})`;
});

smoke("names · every old REST address is gone: 404 to the owner as JSON and as a page (no redirect), undeclared by GET /capabilities", async () => {
  const caps = (await http("GET", "/capabilities", { key: ownerKey })).json || {};
  const declared = new Set((caps.routes || []).map((r) => `${r.method} ${r.path}`));
  const bad = [];
  for (const row of NAMES.rest) {
    const [method, path] = row.old.split(" ");
    if (declared.has(row.old)) bad.push(`${row.old} still declared`);
    const p = fill(path) + (path.includes("?") ? "&" : "?") + "project=smoke";
    const j = await http(method, p, { key: ownerKey, ...(method === "POST" ? { body: {} } : {}) });
    if (j.status !== 404) bad.push(`${row.old} -> ${j.status}`);
    if (method === "GET") { const h = await html(p); if (h.status !== 404) bad.push(`${row.old} page -> ${h.status}${h.location ? " " + h.location : ""}`); }
  }
  // each new address the rows name is declared
  const news = [...new Set(NAMES.rest.map((r) => r.new).filter(Boolean))].filter((n) => !declared.has(n));
  expect(!bad.length && !news.length, () => `${bad.slice(0, 8).join(" | ")} · new addresses undeclared: ${news.join(", ")}`);
  return `${NAMES.rest.length} old addresses: 404 as JSON and as a page, none declared; every new address declared (${declared.size} routes)`;
});

smoke("names · every old resource is gone and its new address reads", async () => {
  const rd = async (uri) => (await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri, project: "smoke" } } })).json || {};
  const list = (await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 2, method: "resources/list" } })).json || {};
  const tpl = (await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 3, method: "resources/templates/list" } })).json || {};
  const uris = new Set([...((list.result || {}).resources || []).map((r) => r.uri), ...((tpl.result || {}).resourceTemplates || []).map((r) => r.uriTemplate)]);
  const bad = [];
  for (const r of NAMES.resources) {
    if (uris.has(r.old)) bad.push(`${r.old} listed`);
    const o = await rd(r.old.replace("{ref}", "goal/s25-none").replace("{role}", "owner"));
    if (!o.error) bad.push(`${r.old} reads`);
    if (r.new && !uris.has(r.new)) bad.push(`${r.new} not listed`);
  }
  expect(!bad.length, () => bad.join(" | "));
  return `${NAMES.resources.length} old resources: none listed, each refused; the new ones listed`;
});
