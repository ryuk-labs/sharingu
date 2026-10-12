// tools/smoke/s34-scoped.mjs — sprint 6, 6.2 (the scoped data layer, src/data.js): org B reads none of org A's rows.
// Runs after s33-orgtwo, on the second org it seeded (s.org2: org 2's owner, its project o2--shop).
//   · org 1 (org A) gets canaries it alone holds: a project whose slug org 2 also uses (shop), a goal, a contribution and a
//     file there and in the smoke project, each carrying one random word; org 2 (org B) gets a member of its own
//   · every MCP read tool (tools/list, readOnlyHint: the registry's own flags), every brain:// resource (resources/list and
//     resources/templates/list) and every GET route (GET /capabilities) is
//     walked as org 2's owner and as its member: with no argument, with its own project by slug and by key, with org 1's
//     project keys, and with org 1's ids wherever the tool's schema or the route's path takes one (a ref, an id, a qid, a
//     contribution). No answer may carry an org-1 row: the canary word, an org-1 contribution id, an org-1 person's id or
//     email, an org-1 project key in a project field or a ?project= link; and none may be a 5xx
//   · org 2's owner names its slug, "shop": the read answers o2--shop, its own, never org 1's shop; org 1's owner naming o2--shop
//     is refused
// Not walked: /health (the platform's check, s35-ownorg reads it signed out), /logout (it ends the session) and the static routes.
// The admin's reports (/log, /storage, /control/measures) are walked like every route since slice 6.3 scoped them to the org.
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, s, http, mcp, control, ownerKey, contribute, kwrite, d1rows, BASE } from "./lib.mjs";

const CANARY = "orgonecanary" + randomBytes(5).toString("hex").replace(/[0-9]/g, (d) => "abcdefghij"[d]);   // letters only: one search word
const TAG = randomBytes(4).toString("hex");   // org 2's own member's address (never the canary: that word is org 1's alone)
const SKIP = new Set(["/logout", "/health", "/install", "/favicon.svg", "/fonts/:file"]);   // ends the session · the platform's · static bytes
const PROJECT_FIELDS = new Set(["project", "key", "activeProject", "projects", "writeProjects", "seats", "yourProjects", "projectKey"]);

// warm() — a local D1 call (d1rows) is a wrangler process of a second or more; a kept-alive socket the worker closed meanwhile
// fails the next request ("other side closed"). One GET drops it, so the case's own first request opens a fresh one.
async function warm() { try { await (await fetch(BASE + "/health")).arrayBuffer(); } catch { /* the dead socket is gone */ } }
async function rpc(key, method, params) {
  const r = await http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: Date.now(), method, ...(params ? { params } : {}) } });
  return { status: r.status, json: r.json, text: r.text };
}

smoke("scoped · org 1's canaries (a project whose slug org 2 also uses, a goal, a contribution, a file) and org 2's own member", async () => {
  expect(s.org2 && s.org2.key, "s33-orgtwo did not leave the second org (s.org2)");
  await warm();
  const add = await control({ action: "add-project", key: "shop", name: `Org one shop ${CANARY}` });
  expect(add.status < 500, `org 1's shop: ${add.status}`);
  const g = await kwrite(ownerKey, { project: "shop", ops: [{ kind: "goal", op: "upsert", data: { id: "sell-more", title: `Sell more ${CANARY}` } }] });
  expect(!g.isError, () => `org 1's goal: ${brief(g.out)}`);
  const c1 = await contribute(ownerKey, { project: "shop", lane: "leader", kind: "note", what: `Shop note ${CANARY}`, why: "an org-1 row org 2 must never read" });
  const c2 = await contribute(ownerKey, { project: "smoke", lane: "leader", kind: "note", what: `Smoke note ${CANARY}`, why: "an org-1 row org 2 must never read" });
  expect(!c1.isError && c1.out.id && !c2.isError && c2.out.id, () => `org 1's contributions: ${brief(c1.out)} ${brief(c2.out)}`);
  const f = await mcp(ownerKey, "save_file", { content: `<p>${CANARY}</p>`, title: `File ${CANARY}`, group: "smoke" });
  const fp = await mcp(ownerKey, "save_file", { content: `<p>public ${CANARY}</p>`, title: `Public ${CANARY}`, group: "smoke", public: true });
  expect(f.out && f.out.id && fp.out && fp.out.id, () => `org 1's files: ${brief(f.out)} ${brief(fp.out)}`);
  s.org1 = { tx: c1.out.id, tx2: c2.out.id, file: f.out.id, publicFile: fp.out.id };
  // org 2: a goal of its own (its pages read something), and a member seated on its project
  const g2 = await kwrite(s.org2.key, { project: "shop", ops: [{ kind: "goal", op: "upsert", data: { id: "open-the-shop", title: "Open the shop" } }] });
  expect(!g2.isError && g2.out.project === "o2--shop", () => `org 2's goal by its slug: ${brief(g2.out)}`);
  const m = await http("POST", "/control", { key: s.org2.key, form: { action: "add-person", name: "Org2 Reader", email: `reader-${TAG}@org2.local`, projectKey: "o2--shop", seatsChosen: "1" } });
  const mk = (m.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(m.status < 500 && mk, () => `org 2's member (${m.status}): no secret in the answer`);
  s.org2.member = mk;
  const orgOf = d1rows(`SELECT org FROM people WHERE email = 'reader-${TAG}@org2.local'`);
  expect(orgOf.length === 1 && orgOf[0].org === 2, () => `org 2's member's org: ${brief(orgOf)}`);
  return `org 1: shop (${CANARY}), goal sell-more, ${c1.out.id} and ${c2.out.id}, files ${f.out.id} and ${fp.out.id} (public); org 2: goal open-the-shop, a member seated on o2--shop`;
});

smoke("scoped · org 2's owner names its slug: the read is o2--shop, never org 1's shop; org 1's owner naming o2--shop is refused", async () => {
  await warm();
  const r = await mcp(s.org2.key, "read", { project: "shop", kind: "goal" });
  const ids = ((r.out && r.out.items) || []).map((x) => x.id);
  expect(!r.isError && r.out.project === "o2--shop" && ids.includes("open-the-shop") && !ids.includes("sell-more"), () => `read {project: "shop"} as org 2: ${brief(r.out)}`);
  const g = await http("GET", "/read?project=shop&kind=goal", { key: s.org2.key });
  expect(g.status === 200 && g.json.project === "o2--shop" && !g.text.includes(CANARY), () => `GET /read?project=shop as org 2: ${g.status} ${brief(g.json)}`);
  const full = await mcp(s.org2.key, "read", { project: "o2--shop", kind: "goal" });
  expect(!full.isError && full.out.project === "o2--shop", () => `read {project: "o2--shop"} as org 2: ${brief(full.out)}`);
  const one = await mcp(ownerKey, "read", { project: "shop", kind: "goal" });
  expect(!one.isError && one.out.project === "shop" && ((one.out.items) || []).some((x) => x.id === "sell-more"), () => `read {project: "shop"} as org 1: ${brief(one.out)}`);
  const cross = await mcp(ownerKey, "read", { project: "o2--shop", kind: "goal" });
  expect(cross.out && cross.out.error === "project_forbidden", () => `read {project: "o2--shop"} as org 1: ${brief(cross.out)}`);
  const who = await mcp(s.org2.key, "whoami");
  expect(!who.isError && JSON.stringify(who.out.writeProjects) === JSON.stringify(["o2--shop"]), () => `org 2's whoami writeProjects: ${brief(who.out)}`);
  return "org 2: shop -> o2--shop (tool and GET twin), o2--shop by its key; org 1: shop is its own, o2--shop project_forbidden; org 2's whoami writes only to o2--shop";
});

// the org-1 facts a leak would show, read from the database itself (one statement: each local D1 call is a wrangler process)
function orgOne() {
  const r = d1rows("SELECT (SELECT json_group_array(id) FROM transmission WHERE org = 1) AS tx, " +
    "(SELECT json_group_array(json_array(id, email)) FROM people WHERE org = 1) AS people, (SELECT json_group_array(key) FROM projects WHERE org = 1) AS keys, " +
    "(SELECT id FROM k_goals WHERE project = 'smoke' LIMIT 1) AS goal, (SELECT qid FROM k_questions WHERE project = 'smoke' LIMIT 1) AS qid, " +
    "(SELECT hash FROM k_renders WHERE project = 'smoke' LIMIT 1) AS hash, (SELECT id FROM previews WHERE project = 'smoke' LIMIT 1) AS preview")[0] || {};
  const people = JSON.parse(r.people || "[]");
  return { tx: new Set(JSON.parse(r.tx || "[]")), ids: people.map((p) => p[0]).filter((x) => x && x.length >= 8), emails: people.map((p) => p[1]).filter(Boolean),
    keys: new Set(JSON.parse(r.keys || "[]")), goal: r.goal || "sell-more", qid: r.qid || "Q-none", hash: r.hash || "0".repeat(64), preview: r.preview || "none" };
}

// leaks(text, a, sent) -> what of org 1 an answer carries: the canary, an org-1 contribution id, an org-1 person, an org-1 project
// key. `sent` is what the caller itself named (a refusal may echo it: an echo is not a row read; the canary is never sent).
function leaks(text, a, sent = new Set()) {
  const out = [];
  if (text.toLowerCase().includes(CANARY)) out.push("the canary");
  for (const t of new Set(text.match(/T-\d{8}-\d+/g) || [])) if (a.tx.has(t) && !sent.has(t)) out.push(`contribution ${t}`);
  for (const id of a.ids) if (text.includes(id)) out.push(`person ${id}`);
  for (const e of a.emails) if (text.toLowerCase().includes(e.toLowerCase())) out.push(`email ${e}`);
  for (const m of text.matchAll(/[?&](?:amp;)?project=([a-z0-9-]+)/g)) if (a.keys.has(m[1]) && !sent.has(m[1])) out.push(`?project=${m[1]}`);
  for (const m of text.matchAll(/data-project="([a-z0-9-]+)"/g)) if (a.keys.has(m[1]) && !sent.has(m[1])) out.push(`data-project ${m[1]}`);
  let j = null; try { j = JSON.parse(text); } catch { j = null; }
  const walk = (v, k) => {
    if (Array.isArray(v)) { for (const x of v) walk(x, k); return; }
    if (v && typeof v === "object") { for (const [kk, x] of Object.entries(v)) walk(x, kk); return; }
    if (typeof v === "string" && PROJECT_FIELDS.has(k) && a.keys.has(v) && !sent.has(v)) out.push(`${k}: ${v}`);
  };
  if (j) walk(j, "");
  return [...new Set(out)];
}

// sentOf(args | path) -> every value the caller named (a tool's arguments, flattened; a path's segments and query values)
function sentOf(x) {
  const out = new Set();
  const add = (v) => { if (Array.isArray(v)) v.forEach(add); else if (v && typeof v === "object") Object.values(v).forEach(add); else if (v != null) out.add(String(v)); };
  if (typeof x === "string") { const [p, q = ""] = x.split("?"); p.split("/").forEach((seg) => out.add(decodeURIComponent(seg))); for (const [, v] of new URLSearchParams(q)) out.add(v); }
  else add(x);
  for (const v of [...out]) { const m = /^(?:goal|q|question|check)\/(.+)$/.exec(v); if (m) out.add(m[1]); }
  return out;
}

// the argument sets a read tool is called with: none, its own project (slug and key), org 1's projects, and org 1's ids for every
// id-taking property its schema declares
function argSets(tool, a) {
  const p = (tool.inputSchema && tool.inputSchema.properties) || {};
  const sets = [{}];
  if (p.project) sets.push({ project: "shop" }, { project: "o2--shop" }, { project: "smoke" }, { project: "sharingu" });
  // a PUBLIC file is anyone's with its link, signed out included (ADR-055): never an attack id; listing it is (read_file {})
  const ids = { ref: [a.tx1, `goal/${a.goal}`, `q/${a.qid}`, "goal/sell-more"], id: [a.file, a.tx1], contribution: [a.tx1], for: [a.tx1, `goal/${a.goal}`],
    qid: [a.qid], q: ["sell", "note"], v: ["1"], refs: [["goal/sell-more"]] };
  for (const [k, vs] of Object.entries(ids)) if (p[k]) for (const v of vs) sets.push({ [k]: v }, ...(p.project ? [{ [k]: v, project: "shop" }] : []));
  if (p.kind && Array.isArray(p.kind.enum)) for (const k of p.kind.enum) sets.push({ kind: k }, ...(p.project ? [{ kind: k, project: "shop" }] : []));
  if (p.plane && Array.isArray(p.plane.enum)) for (const k of p.plane.enum) sets.push({ plane: k });
  if (p.org) sets.push({ org: true });
  return sets;
}
// the paths a GET route is fetched at: its own, with org 1's ids in its path, and with ?project= its slug and org 1's keys
function pathsOf(route, a) {
  const fill = { ":id": route.startsWith("/artifact/") ? [a.file] : route.startsWith("/preview/") ? [a.preview] : [a.tx1], ":qid": [a.qid], ":ref": [a.goal, "sell-more"],
    ":v": ["1"], ":hash": [a.hash], ":slug": ["frontend"], ":plane": ["arch", "data", "api", "mcp", "flows", "deps"], ":path": ["start-here.md"], ":file": [] };
  let base = [route];
  for (const [ph, vs] of Object.entries(fill)) if (route.includes(ph)) base = base.flatMap((r) => vs.map((v) => r.replace(ph, encodeURIComponent(v))));
  const q = (x) => (x.includes("?") ? "&" : "?");
  return base.flatMap((r) => [r, r + q(r) + "project=shop", r + q(r) + "project=smoke", r + q(r) + "q=sell&ref=" + encodeURIComponent(a.tx1)]);
}

smoke("scoped · org 2's owner and member read NO org-1 row through any MCP read tool or GET route (the registry and the route table, walked)", async () => {
  const a0 = orgOne();
  await warm();
  const a = { ...a0, tx1: s.org1.tx, file: s.org1.file, publicFile: s.org1.publicFile };
  expect(a.tx.has(s.org1.tx) && a.keys.has("shop") && a.keys.has("smoke"), "org 1's canaries are not org 1's rows");
  const found = [], served = [];
  let calls = 0, gets = 0, okCalls = 0, ok2 = 0, reads = 0, okReads = 0;
  for (const [who, key] of [["org 2's owner", s.org2.key], ["org 2's member", s.org2.member]]) {
    const list = await rpc(key, "tools/list");
    const tools = ((list.json && list.json.result && list.json.result.tools) || []).filter((t) => t.annotations && t.annotations.readOnlyHint);
    expect(tools.length >= 15, () => `${who}: tools/list read tools ${tools.length}`);
    for (const t of tools) {
      for (const args of argSets(t, a)) {
        let r;
        try { r = await rpc(key, "tools/call", { name: t.name, arguments: args }); }
        catch (e) { served.push(`${who} ${t.name} ${JSON.stringify(args)} -> ${String((e && e.cause && e.cause.code) || e)}`); continue; }
        calls++; if (r.json && r.json.result && !r.json.result.isError) okCalls++;
        if (r.status >= 500) served.push(`${who} ${t.name} ${JSON.stringify(args)} -> ${r.status}`);
        const l = leaks(r.text.replace(/\\"/g, '"'), a, sentOf(args));
        if (l.length) found.push(`${who} · ${t.name} ${JSON.stringify(args)}: ${l.join(", ")}`);
      }
    }
    // the brain:// resources (resources/list, and each template filled with org 1's refs), each also with ?project=
    const rl = await rpc(key, "resources/list"), tl = await rpc(key, "resources/templates/list");
    const fixed = ((rl.json && rl.json.result && rl.json.result.resources) || []).map((r) => r.uri);
    const filled = ((tl.json && tl.json.result && tl.json.result.resourceTemplates) || []).flatMap((t) =>
      [a.tx1, `goal/${a.goal}`, "sell-more", a.goal, "arch", "screens"].map((v) => t.uriTemplate.replace(/\{[a-z]+\}/, encodeURIComponent(v))));
    expect(fixed.length >= 3, () => `${who}: resources/list ${fixed.length}`);
    for (const uri of [...fixed, ...filled].flatMap((u) => [u, u + (u.includes("?") ? "&" : "?") + "project=shop", u + (u.includes("?") ? "&" : "?") + "project=smoke"])) {
      let r;
      try { r = await rpc(key, "resources/read", { uri }); } catch (e) { served.push(`${who} resources/read ${uri} -> ${String((e && e.cause && e.cause.code) || e)}`); continue; }
      reads++; if (r.json && r.json.result) okReads++;
      if (r.status >= 500) served.push(`${who} resources/read ${uri} -> ${r.status}`);
      const l = leaks(r.text.replace(/\\"/g, '"'), a, sentOf(uri.replace(/^brain:\/\//, "/")));
      if (l.length) found.push(`${who} · resources/read ${uri}: ${l.join(", ")}`);
    }
    const caps = await http("GET", "/capabilities", { key });
    const routes = (((caps.json && caps.json.routes) || []).filter((r) => r.method === "GET").map((r) => r.path))
      .filter((p) => !SKIP.has(p));
    expect(routes.length >= 40, () => `${who}: GET routes ${routes.length}`);
    for (const route of routes) {
      for (const path of pathsOf(route, a)) {
        for (const accept of ["text/html", "application/json"]) {
          let res, text;
          try { res = await fetch(BASE + path, { headers: { accept, authorization: "Bearer " + key }, redirect: "manual" }); text = await res.text(); }
          catch (e) { served.push(`${who} GET ${path} (${accept}) -> ${String((e && e.cause && e.cause.code) || e)}`); continue; }
          gets++; if (res.status < 300) ok2++;
          if (res.status >= 500) served.push(`${who} GET ${path} (${accept}) -> ${res.status}`);
          const l = leaks(text, a, sentOf(path));
          if (l.length) found.push(`${who} · GET ${path} (${accept}): ${l.join(", ")}`);
        }
      }
    }
  }
  expect(!found.length, () => `org 1's rows read by org 2 (${found.length}): ${found.slice(0, 12).join(" | ")}`);
  expect(!served.length, () => `5xx (${served.length}): ${served.slice(0, 12).join(" | ")}`);
  return `${calls} read-tool calls (${okCalls} answered), ${reads} brain:// reads (${okReads} answered) and ${gets} GETs (${ok2} 2xx) as org 2's owner and member: 0 org-1 rows (canary, ${a.tx.size} contribution ids, ${a.ids.length} people, ${a.keys.size} project keys), 0 5xx`;
});
