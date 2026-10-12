// tools/smoke/s35-ownorg.mjs — sprint 6, 6.3 (an owner owns one org; PLATFORM.md §2 item 6): org B's admin walks the admin
// surface that used to read the whole database and gets its own org's rows alone, never a 500. Runs after s34-scoped, on the
// second org s33 seeded (s.org2: its owner, its member, its project o2--shop).
//   · GET /log, GET /storage and GET /control/measures (and its download) answer org 2's events, files and measures; org 1's
//     answer none of org 2's
//   · POST /backup-dump?page= walked to its end holds every org-2 row of the kinds counted and nothing of org 1 (each row's org
//     read off the row: its org column, its project's key, its contribution); org 1's dump holds nothing of org 2 (into R2, each
//     org under its own prefix: s36-orgr2, sprint 6, 6.4)
//   · clean-eval by org 2's admin removes org 2's eval-marked rows and leaves org 1's
//   · the MCP greeting (both revisions), Control and the Map's org worker name org 2 from its own row, never the worker's name
//     or org 1's; GET /health answers signed out and names no org (one row of the schema)
//   · the Partner and single-project seams hold per org: org 2 (one project) scopes its member and its owner to o2--shop
//     while org 1 holds many; a Partner of org 2 seated nowhere reads no project, one seated on o2--shop reads it alone
import { readFileSync } from "node:fs";
import { smoke, expect, brief, s, http, mcp, ownerKey, BASE, d1rows } from "./lib.mjs";
import { orgOfKey } from "../../src/project.js";

const ORG2 = "Second org";   // org 2's row (s33-orgtwo)
async function warm() { try { await (await fetch(BASE + "/health")).arrayBuffer(); } catch { /* a dead kept-alive socket is gone */ } }
const T = () => new Date().toISOString();

// the facts a leak would show: org 1's contribution ids, people, project keys, file ids and name, and org 2's own (one statement:
// each local D1 call is a wrangler process)
function facts() {
  const r = d1rows("SELECT (SELECT json_group_array(id) FROM transmission WHERE org = 1) AS tx1, (SELECT json_group_array(id) FROM transmission WHERE org = 2) AS tx2, " +
    "(SELECT json_group_array(json_array(id, email, name)) FROM people WHERE org = 1) AS people1, (SELECT json_group_array(name) FROM people WHERE org = 2) AS names2, " +
    "(SELECT json_group_array(key) FROM projects WHERE org = 1) AS keys1, (SELECT json_group_array(id) FROM artifacts WHERE org = 1) AS files1, " +
    "(SELECT json_group_array(id) FROM artifacts WHERE org = 2) AS files2, (SELECT COALESCE(SUM(bytes), 0) FROM artifacts WHERE org = 2) AS bytes2, " +
    "(SELECT COALESCE(SUM(bytes), 0) FROM artifacts WHERE org = 1) AS bytes1, (SELECT name FROM org WHERE id = 1) AS name1, " +
    "(SELECT COUNT(*) FROM events WHERE org = 2) AS events2")[0] || {};
  const J = (x) => JSON.parse(x || "[]");
  const people1 = J(r.people1);
  return { tx1: new Set(J(r.tx1)), tx2: new Set(J(r.tx2)), ids1: people1.map((p) => p[0]).filter((x) => x && x.length >= 8), emails1: people1.map((p) => p[1]).filter(Boolean),
    names1: new Set(people1.map((p) => p[2]).filter(Boolean)), names2: new Set(J(r.names2)), keys1: new Set(J(r.keys1)), files1: J(r.files1), files2: new Set(J(r.files2)),
    bytes1: Number(r.bytes1), bytes2: Number(r.bytes2), name1: r.name1, events2: Number(r.events2) };
}
// org1In(text, f) -> what of org 1 a text carries: a contribution id, a person, a file id, a project key in a project field
function org1In(text, f) {
  const out = [];
  for (const t of new Set(text.match(/T-\d{8}-\d+/g) || [])) if (f.tx1.has(t)) out.push(`contribution ${t}`);
  for (const id of f.ids1) if (text.includes(id)) out.push(`person ${id}`);
  for (const e of f.emails1) if (text.toLowerCase().includes(e.toLowerCase())) out.push(`email ${e}`);
  for (const id of f.files1) if (text.includes(id)) out.push(`file ${id}`);
  for (const m of text.matchAll(/"(?:project|key)":"([a-z0-9-]+)"/g)) if (f.keys1.has(m[1])) out.push(`project ${m[1]}`);
  return [...new Set(out)];
}

smoke("ownorg · org 2's admin reads its own org on /log, /storage and /control/measures; org 1's admin reads none of org 2's", async () => {
  expect(s.org2 && s.org2.key && s.org2.member, "s33/s34 did not leave the second org (s.org2 with its member)");
  await warm();
  // org 2 banks a file of its own, so /storage has something of org 2's to count
  const f2 = await mcp(s.org2.key, "save_file", { content: "<p>org two's own file</p>", title: "Org two file", group: "smoke" });
  expect(f2.out && f2.out.id, () => `org 2's file: ${brief(f2.out)}`);
  const f = facts();
  expect(f.files2.has(f2.out.id) && f.bytes2 > 0 && f.files1.length > 0, () => `the files of each org: ${brief({ files2: [...f.files2], bytes2: f.bytes2, files1: f.files1.length })}`);
  const bad = [];
  // /log
  const log = await http("GET", "/log?limit=200", { key: s.org2.key });
  const rows = (log.json && log.json.log) || [];
  expect(log.status === 200 && rows.length === Math.min(200, f.events2) && rows.every((r) => f.names2.has(r.by)) && rows.filter((r) => r.contribution).every((r) => f.tx2.has(r.contribution)),
    () => `GET /log as org 2: ${log.status}, ${rows.length} rows of org 2's ${f.events2} events: ${brief(rows.slice(0, 3))}`);
  bad.push(...org1In(log.text, f).map((x) => `/log: ${x}`));
  // /storage
  const st = await http("GET", "/storage", { key: s.org2.key });
  const files = ((st.json && st.json.byMonth) || []).reduce((n, m) => n + m.files, 0);
  expect(st.status === 200 && st.json.filesBytes === f.bytes2 && st.json.usedBytes === st.json.filesBytes + st.json.picturesBytes && files === f.files2.size && st.json.orphanCandidates.ids.every((id) => f.files2.has(id)),
    () => `GET /storage as org 2: ${st.status} files ${st.json && st.json.filesBytes} of used ${st.json && st.json.usedBytes} (org 2 holds ${f.bytes2} in files), ${files} files (${f.files2.size}): ${brief(st.json)}`);
  bad.push(...org1In(st.text, f).map((x) => `/storage: ${x}`));
  // /control/measures and its download
  for (const path of ["/control/measures", "/control/measures?download=1"]) {
    const m = await http("GET", path, { key: s.org2.key });
    const projects = JSON.stringify(m.json || {}).match(/"project":"[^"]*"/g) || [];
    expect(m.status === 200 && m.json.org === ORG2 && projects.every((p) => /"project":"o2--/.test(p)), () => `GET ${path} as org 2: ${m.status} ${brief(m.json)}`);
    bad.push(...org1In(m.text, f).map((x) => `${path}: ${x}`));
  }
  expect(!bad.length, () => `org 1's rows on org 2's admin reports: ${bad.slice(0, 10).join(" | ")}`);
  // org 1's admin: none of org 2's
  const log1 = await http("GET", "/log?limit=200", { key: ownerKey });
  const st1 = await http("GET", "/storage", { key: ownerKey });
  const m1 = await http("GET", "/control/measures", { key: ownerKey });
  const two = [...f.tx2].filter((t) => log1.text.includes(t)).concat([...f.files2].filter((id) => st1.text.includes(id)), ((log1.json && log1.json.log) || []).filter((r) => f.names2.has(r.by)).map((r) => r.by));
  expect(log1.status === 200 && st1.status === 200 && st1.json.filesBytes === f.bytes1 && st1.json.usedBytes === st1.json.filesBytes + st1.json.picturesBytes && m1.status === 200 && !/"project":"o2--/.test(m1.text) && !two.length,
    () => `org 1's reports: /log ${log1.status}, /storage ${st1.status} files ${st1.json && st1.json.filesBytes} of used ${st1.json && st1.json.usedBytes} (org 1 holds ${f.bytes1} in files), measures ${m1.status}; org 2's seen: ${two.slice(0, 5).join(", ")}`);
  return `org 2: /log ${rows.length} of its ${f.events2} events, /storage ${st.json.filesBytes} bytes in ${files} files (${st.json.usedBytes} stored by the plan's definition), measures as "${ORG2}" — 0 org-1 rows; org 1: /storage ${st1.json.filesBytes} bytes of files (${st1.json.usedBytes} stored), nothing of org 2's`;
});

// walk(key) -> { table: rows } over POST /backup-dump?page=, from "" to the end
async function walk(key) {
  const got = {};
  let cursor = "", pages = 0;
  while (cursor != null && pages < 2000) {
    const r = await http("POST", `/backup-dump?page=${encodeURIComponent(cursor)}&rows=1000`, { key });
    expect(r.status === 200 && r.json && "next" in r.json, () => `POST /backup-dump?page=${cursor}: ${r.status} ${r.text.slice(0, 200)}`);
    if (r.json.table) (got[r.json.table] = got[r.json.table] || []).push(...r.json.rows);
    cursor = r.json.next; pages++;
  }
  return got;
}
// the org of a dumped row, read off the row itself (txOrg: the org of each contribution the same dump holds)
const orgOfRow = (table, r, txOrg) => table === "org" ? r.id : table === "transmission_refs" ? txOrg.get(r.tid)
  : table === "projects" ? orgOfKey(r.key).org : table === "project_seats" ? orgOfKey(r.project_key).org : "org" in r ? r.org : orgOfKey(r.project).org;

smoke("ownorg · the backup is one org's: org 2's pages hold its rows alone; org 1's dump holds nothing of org 2", async () => {
  await warm();
  const mine = await walk(s.org2.key);
  const txOrg = new Map((mine.transmission || []).map((t) => [t.id, t.org]));
  const foreign = [];
  for (const [t, rows] of Object.entries(mine)) for (const r of rows) if (orgOfRow(t, r, txOrg) !== 2) foreign.push(`${t} ${brief(r).slice(0, 80)}`);
  const n = d1rows("SELECT (SELECT COUNT(*) FROM people WHERE org = 2) AS people, (SELECT COUNT(*) FROM projects WHERE org = 2) AS projects, (SELECT COUNT(*) FROM transmission WHERE org = 2) AS transmission, " +
    "(SELECT COUNT(*) FROM events WHERE org = 2) AS events, (SELECT COUNT(*) FROM artifacts WHERE org = 2) AS artifacts, (SELECT COUNT(*) FROM k_goals WHERE project IN (SELECT key FROM projects WHERE org = 2)) AS k_goals, " +
    "(SELECT COUNT(*) FROM project_seats WHERE project_key IN (SELECT key FROM projects WHERE org = 2)) AS project_seats")[0];
  const off = Object.keys(n).filter((t) => (mine[t] || []).length !== n[t]);
  expect(!foreign.length && !off.length && (mine.org || []).length === 1 && mine.org[0].id === 2,
    () => `org 2's dump: foreign rows ${foreign.length} (${foreign.slice(0, 4).join(" | ")}); counts off ${off.map((t) => `${t} ${(mine[t] || []).length}/${n[t]}`).join(", ")}; org rows ${brief(mine.org)}`);
  const one = await walk(ownerKey);
  const tx1 = new Map((one.transmission || []).map((t) => [t.id, t.org]));
  const twos = [];
  for (const [t, rows] of Object.entries(one)) for (const r of rows) if (orgOfRow(t, r, tx1) !== 1) twos.push(`${t} ${brief(r).slice(0, 80)}`);
  expect(!twos.length && (one.org || []).length === 1 && one.org[0].id === 1, () => `org 1's dump holds another org's rows (${twos.length}): ${twos.slice(0, 4).join(" | ")}`);
  const rows2 = Object.values(mine).reduce((a, x) => a + x.length, 0), rows1 = Object.values(one).reduce((a, x) => a + x.length, 0);
  return `org 2's dump: ${rows2} rows in ${Object.keys(mine).length} tables, every one org 2's (${Object.entries(n).map(([t, c]) => `${t} ${c}`).join(", ")}); org 1's dump: ${rows1} rows, none of org 2's`;
});

smoke("ownorg · clean-eval by org 2's admin sweeps org 2's eval-marked rows and leaves org 1's", async () => {
  const at = T(), tag = String(Date.now());
  d1rows(`INSERT INTO events (id, person_id, kind, payload_json, created_at, org) VALUES ('own-ev1-${tag}', (SELECT id FROM people WHERE org = 1 AND role = 'owner' ORDER BY created_at LIMIT 1), 'note', '{"eval":1}', '${at}', 1), ` +
    `('own-ev2-${tag}', '${s.org2.id}', 'note', '{"eval":1}', '${at}', 2)`);
  d1rows(`INSERT INTO transmission (id, submitter, lane, kind, route, status, eval, project, created_at, org) VALUES ('T-evalorphan-own1-${tag}', (SELECT id FROM people WHERE org = 1 AND role = 'owner' ORDER BY created_at LIMIT 1), 'leader', 'note', 'auto', 'closed', 1, 'smoke', '${at}', 1), ` +
    `('T-evalorphan-own2-${tag}', '${s.org2.id}', 'leader', 'note', 'auto', 'closed', 1, 'o2--shop', '${at}', 2)`);
  await warm();
  const r = await http("POST", "/control", { key: s.org2.key, form: { action: "clean-eval" } });
  const left = d1rows(`SELECT (SELECT json_group_array(id) FROM events WHERE id LIKE 'own-ev%-${tag}') AS ev, (SELECT json_group_array(id) FROM transmission WHERE id LIKE 'T-evalorphan-own%-${tag}') AS tx`)[0];
  const ev = JSON.parse(left.ev || "[]"), tx = JSON.parse(left.tx || "[]");
  // org 1's residue goes as it came (the smoke's own rows, never left for a later read)
  d1rows(`DELETE FROM events WHERE id = 'own-ev1-${tag}'`); d1rows(`DELETE FROM transmission WHERE id = 'T-evalorphan-own1-${tag}'`);
  expect(r.status === 200 && /Eval residue cleaned/.test(r.text) && /handoffs 0/.test(r.text), () => `clean-eval as org 2: ${r.status} ${(r.text.match(/Eval residue[^<]*/) || [r.text.slice(0, 200)])[0]}`);
  expect(JSON.stringify(ev) === JSON.stringify([`own-ev1-${tag}`]) && JSON.stringify(tx) === JSON.stringify([`T-evalorphan-own1-${tag}`]),
    () => `after org 2's clean-eval: events ${brief(ev)}, contributions ${brief(tx)} (only org 1's must remain)`);
  return `org 2's sweep: its eval event and contribution gone, org 1's kept (${ev[0]}, ${tx[0]}); the R2 handoffs untouched (handoffs 0)`;
});

smoke("ownorg · the MCP greeting, Control and the Map name org 2 from its row, never the worker's name; /health names no org", async () => {
  await warm();
  const f = facts();
  const worker = (readFileSync(String(process.env.SMOKE_D1_CFG || ""), "utf8").match(/"name"\s*:\s*"([^"]+)"/) || [])[1];   // the worker's own name (wrangler's config): the platform's
  expect(worker && f.name1 && f.name1 !== ORG2, () => `the worker's name (${worker}) and org 1's (${f.name1})`);
  const init = async (key) => (await http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } } })).json;
  const i2 = await init(s.org2.key), i1 = await init(ownerKey);
  const n2 = i2 && i2.result && i2.result.serverInfo.name, n1 = i1 && i1.result && i1.result.serverInfo.name;
  expect(n2 === `sharingu — ${ORG2}` && n1 === `sharingu — ${f.name1}` && !JSON.stringify(i2).includes(f.name1) && !JSON.stringify(i2).includes(worker),
    () => `initialize: org 2 "${n2}", org 1 "${n1}" (${brief(i2)})`);
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} };
  const d = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer " + s.org2.key,
    "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "server/discover", params: { _meta: meta } }) }).then((r) => r.json());
  const dn = d && d.result && d.result._meta && d.result._meta["io.modelcontextprotocol/serverInfo"].name;
  expect(dn === `sharingu — ${ORG2}`, () => `server/discover as org 2: ${brief(d)}`);
  const cj = await http("GET", "/control/people", { key: s.org2.key });
  const page = await fetch(BASE + "/control", { headers: { accept: "text/html", authorization: "Bearer " + s.org2.key } }).then((r) => r.text());
  expect(cj.status === 200 && cj.json.org.name === ORG2 && !("worker" in cj.json.org) && !cj.text.includes(worker) && !cj.text.includes(f.name1) && page.includes(ORG2) && !page.includes(worker) && !page.includes(f.name1),
    () => `Control as org 2: ${cj.status} ${brief(cj.json && cj.json.org)}; the page names org 2 ${page.includes(ORG2)}, the worker ${page.includes(worker)}, org 1 ${page.includes(f.name1)}`);
  const arch = await http("GET", "/map/arch", { key: s.org2.key });
  const ow = arch.json && arch.json.regions && arch.json.regions["org-worker"];
  const arch1 = await http("GET", "/map/arch?project=smoke", { key: ownerKey });
  const ow1 = arch1.json && arch1.json.regions && arch1.json.regions["org-worker"];
  expect(arch.status === 200 && ow && ow.name === ORG2 && ow1 && ow1.name === f.name1 && !arch.text.includes(worker),
    () => `Map · Arch's org worker: org 2 ${arch.status} ${brief(ow)}, org 1 ${brief(ow1)}`);
  const h = await fetch(BASE + "/health", { headers: { "x-count-rows": "1" } });
  const ht = await h.text();
  const hj = JSON.parse(ht);
  const read = Number((/d1-rows;dur=0;desc="read=(\d+)/.exec(h.headers.get("server-timing") || "") || [])[1]);
  expect(h.status === 200 && hj.ok === true && hj.d1 === "ok" && Object.keys(hj).every((k) => ["ok", "version", "d1", "versionId", "versionTag"].includes(k)) && read >= 1
    && ![ORG2, f.name1, worker, ...f.ids1].some((x) => ht.includes(x)), () => `GET /health signed out: ${h.status} ${ht} (rows read ${read})`);
  return `initialize "${n2}" (org 1 "${n1}"), server/discover the same; Control and Map · Arch name "${ORG2}", never "${worker}"; /health ${Object.keys(hj).join(", ")} (one row read, no org)`;
});

smoke("ownorg · the Partner and single-project seams hold per org: org 2's one project scopes its member and owner; its Partner seated nowhere reads no project", async () => {
  await warm();
  const f = facts();
  const add = async (name, email, extra) => {
    const r = await http("POST", "/control", { key: s.org2.key, form: { action: "add-person", name, email, role: "partner", seatsChosen: "1", ...extra } });
    const k = (r.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
    expect(r.status < 500 && k, () => `add-person ${email} (${r.status}): no secret in the answer`);
    return k;
  };
  const tag = String(Date.now()).slice(-6);
  const loose = await add("Org2 Partner Loose", `partner-loose-${tag}@org2.local`, {});
  const seated = await add("Org2 Partner Seated", `partner-seated-${tag}@org2.local`, { projectKey: "o2--shop" });
  const orgs = d1rows(`SELECT role, org FROM people WHERE email IN ('partner-loose-${tag}@org2.local', 'partner-seated-${tag}@org2.local')`);
  expect(orgs.length === 2 && orgs.every((p) => p.org === 2 && p.role === "partner"), () => `org 2's Partners: ${brief(orgs)}`);
  const multi = d1rows("SELECT (SELECT COUNT(*) FROM projects WHERE org = 1 AND active = 1) AS one, (SELECT COUNT(*) FROM projects WHERE org = 2 AND active = 1) AS two")[0];
  expect(multi.one > 1 && multi.two === 1, () => `the populations: org 1 ${multi.one} active projects, org 2 ${multi.two}`);
  const bad = [];
  const look = async (who, key, want) => {
    const tool = await mcp(key, "read", { kind: "goal" });
    const rest = await http("GET", "/read?kind=goal", { key });
    const home = await http("GET", "/home", { key });
    const who2 = await mcp(key, "whoami");
    for (const [what, t] of [["read", JSON.stringify(tool.out)], ["GET /read", rest.text], ["GET /home", home.text], ["whoami", JSON.stringify(who2.out)]]) {
      for (const x of org1In(t, f)) bad.push(`${who} ${what}: ${x}`);
      if (/"(?:project|key)":"(?!o2--)[a-z0-9-]+"/.test(t) && want !== null) for (const m of t.matchAll(/"(?:project|key)":"([a-z0-9-]+)"/g)) if (!m[1].startsWith("o2--")) bad.push(`${who} ${what}: project ${m[1]}`);
      if (home.status >= 500 || rest.status >= 500) bad.push(`${who} ${what}: 5xx`);
    }
    return { tool: tool.out, rest: rest.json };
  };
  const member = await look("org 2's member", s.org2.member, "o2--shop");
  const owner = await look("org 2's owner", s.org2.key, "o2--shop");
  const inP = await look("org 2's seated Partner", seated, "o2--shop");
  const outP = await look("org 2's seatless Partner", loose, null);
  const ids = (x) => ((x && x.items) || []).map((g) => g.id);
  expect(member.tool.project === "o2--shop" && member.rest.project === "o2--shop" && ids(member.tool).includes("open-the-shop"), () => `org 2's member unscoped: ${brief(member.tool)} · ${brief(member.rest)}`);
  expect(owner.tool.project === "o2--shop" && owner.rest.project === "o2--shop", () => `org 2's owner unscoped: ${brief(owner.tool)} · ${brief(owner.rest)}`);
  expect(inP.tool.project === "o2--shop" && ids(inP.tool).includes("open-the-shop"), () => `org 2's seated Partner: ${brief(inP.tool)}`);
  expect(!outP.tool.project && !ids(outP.tool).length && !(outP.rest && outP.rest.project) && !((outP.rest && outP.rest.items) || []).length, () => `org 2's seatless Partner: ${brief(outP.tool)} · ${brief(outP.rest)}`);
  expect(!bad.length, () => `the seams read across orgs (${bad.length}): ${bad.slice(0, 8).join(" | ")}`);
  return `org 1 holds ${multi.one} active projects, org 2 one: org 2's member, owner and seated Partner read o2--shop unscoped; its seatless Partner reads no project; 0 org-1 rows`;
});
