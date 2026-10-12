// tools/smoke/s17-true-door.mjs — sprint 3, D1b: the door findings pass (four real runs by agents holding only the MCP), through
// the real door on a project of its own (s17) and its own people. Group A is safety: each case is the ATTACK, written down.
//   · A1 (item 1): every door that takes an id answers who is asking BEFORE it looks the id up — signed out, a real id and a
//     made-up one get the same answer (a script 401, a browser navigation 302 to sign-in, a bad bearer 401); signed in, an
//     artifact the reader may not read is not_found exactly as a missing one, at the REST door and the MCP's;
//   · A2 (item 2): `doc`, `capsule` and GET /doc answer a doc the reader may not read exactly as a doc that is not there;
//   · A3 (item 3): a knowledge write's stored "N docs written" is recounted for a member from what they may read on Build,
//     changes and the one-contribution read, and a write of only hidden docs is not listed (not_found by id);
//   · A4 (item 4): a seatless owner in a two-project org filing with no project is refused project_required with the projects,
//     nothing filed; a seatless member is shown no project;
//   · A5 (item 5): THE sign-in rule on the 25 doors the grading run named: a script (JSON, or a bearer, or no Accept) 401, a
//     browser navigation 302 /login?next=; /scope is declared what it is (a retired alias).
import { smoke, expect, brief, http, mcp, html, ownerKey, control, BASE, kwrite, kread, contribute, readTx, contributions } from "./lib.mjs";

const P = "s17";
const st = {};
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return key;
};
const fileVia = async (key, items, extra = {}) => {
  const pv = await mcp(key, "preview", { project: P, items, ...extra });
  expect(!pv.isError && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await mcp(key, "file", { previewId: pv.out.previewId, items, only: "ready" });
  expect(!f.isError, () => `file: ${brief(f.out)}`);
  return { pv: pv.out, rc: f.out };
};
// raw(path, {accept, bearer, nav}) -> "status location?" exactly as a script, a bad key or a browser navigation is answered
async function raw(path, { accept = "application/json", bearer = null, nav = false, method = "GET", body } = {}) {
  const headers = { accept };
  if (bearer) headers.authorization = "Bearer " + bearer;
  if (nav) { headers["sec-fetch-dest"] = "document"; headers["sec-fetch-mode"] = "navigate"; }
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, redirect: "manual", body: body === undefined ? undefined : JSON.stringify(body) });
  const loc = r.headers.get("location") || "";
  return `${r.status}${loc ? " " + loc.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "") : ""}`;
}

smoke("true door · A1 auth before lookup: on every id door a real id and a made-up one answer the same to a signed-out script, a browser and a bad key; a member reads another's artifact as not_found", async () => {
  await control({ action: "add-project", key: P, name: "S17" });
  st.member = await invite("S17 Mo", "mo@s17.local", "member", [P]);
  const { rc } = await fileVia(ownerKey, [
    { kind: "node", op: "upsert", data: { id: "screen:s17-home", type: "screen", name: "S17 Home", data: { surface: "s17-web" } } },
    { kind: "render", op: "upsert", data: { screen: "screen:s17-home", format: "html", body: "<main><h1>S17</h1></main>" } },
    { kind: "goal", op: "upsert", data: { id: "s17-root", title: "S17 root", dimensions: ["code"] } },
    { kind: "question", op: "upsert", data: { qid: "Q-s17-open", question: "S17: which first?", status: "open", whoOwes: "owner", options: [{ what: "A" }, { what: "B" }] } },
    { kind: "doc", op: "upsert", data: { path: "s17/open.md", title: "S17 open", body: "# open" } },
    { contribution: { lane: "code", kind: "pr", what: "S17 a change", why: "s17", touches: ["engine/s17.js"], proof: "smoke 1/1" } },
  ]);
  st.tx = ((rc.items || []).find((x) => x.filed && /^T-/.test(String(x.filed.id || ""))) || {}).filed.id;
  st.preview = rc.previewId || (await mcp(ownerKey, "preview", { project: P, items: [{ kind: "goal", op: "upsert", data: { id: "s17-root", title: "S17 root", dimensions: ["code"] } }] })).out.previewId;
  const ver = await mcp(ownerKey, "publish_version", { project: P, title: "S17 v1" });
  expect(!ver.isError, () => brief(ver.out));
  const art = await mcp(ownerKey, "save_file", { title: "s17 private", content: "<html>s17</html>", group: "s17" });
  st.art = art.out && art.out.id;
  const rend = await kread(ownerKey, { project: P, kind: "render", id: "screen:s17-home" });
  const hash = (/\/render\/([0-9a-f]{64})/.exec(JSON.stringify(rend.out)) || [])[1];
  expect(st.tx && st.preview && st.art && hash, () => brief({ tx: st.tx, preview: st.preview, art: st.art, rend: rend.out }));
  const fake64 = "0".repeat(64);
  const pairs = [
    [`/artifact/${st.art}`, "/artifact/00000000-0000-4000-8000-000000000000"],
    [`/contribution/${st.tx}`, "/contribution/T-20200101-001"],
    [`/contribution/${st.tx}/impact`, "/contribution/T-20200101-001/impact"],
    [`/question/Q-s17-open?project=${P}`, `/question/Q-s17-nope?project=${P}`],
    [`/goals/s17-root?project=${P}`, `/goals/s17-nope?project=${P}`],
    [`/doc/s17/open.md?project=${P}`, `/doc/s17/nope.md?project=${P}`],
    [`/versions/1?project=${P}`, `/versions/99?project=${P}`],
    [`/preview/${st.preview}`, "/preview/P-0000000000000000"],
    [`/render/${hash}?project=${P}`, `/render/${fake64}?project=${P}`],
    [`/read?ref=goal/s17-root&project=${P}`, `/read?ref=goal/s17-nope&project=${P}`],
    [`/brief?for=screen:s17-home&project=${P}`, `/brief?for=screen:s17-nope&project=${P}`],
    [`/map/node?ref=screen:s17-home&project=${P}`, `/map/node?ref=screen:s17-nope&project=${P}`],
    ["/broadcast/starter/build-a-web-app", "/broadcast/starter/s17-nope"],
    ["/brief?role=owner", "/brief?role=s17-nope"],
  ];
  const bad = [];
  for (const [real, fake] of pairs) {
    for (const how of [{}, { nav: true, accept: "text/html" }, { bearer: "0".repeat(40) }, { accept: "text/html", bearer: "0".repeat(40) }]) {
      const a = await raw(real, how), b = await raw(fake, how);
      const want = how.nav ? /^302 \/login$/ : /^401$/;
      if (a !== b || !want.test(a)) bad.push(`${real} ${JSON.stringify(how)}: ${a} vs ${b}`);
    }
  }
  expect(!bad.length, () => bad.slice(0, 6).join(" | "));
  // signed in: a member who is not its author reads the owner's private artifact exactly as a missing one
  const mr = await http("GET", `/artifact/${st.art}`, { key: st.member }), mf = await http("GET", "/artifact/00000000-0000-4000-8000-000000000000", { key: st.member });
  const tr = await mcp(st.member, "read_file", { id: st.art }), tf = await mcp(st.member, "read_file", { id: "00000000-0000-4000-8000-000000000000" });
  expect(mr.status === 404 && mf.status === 404 && mr.json.error === "not_found" && tr.out.error === "not_found" && tf.out.error === "not_found", () => brief({ mr: [mr.status, mr.json], tr: tr.out }));
  const own = await http("GET", `/artifact/${st.art}`, { key: ownerKey });
  expect(own.status === 200, () => `the owner reads it: ${own.status}`);
  return `${pairs.length} id doors × 4 callers: real == made-up (401 · 302 /login · 401 · 401); a member reads another's artifact as not_found (REST and MCP)`;
});

smoke("true door · A2 a doc or role brief the reader may not read answers exactly as one that is not there (read, brief, GET /doc)", async () => {
  await fileVia(ownerKey, [
    { kind: "doc", op: "upsert", data: { path: "s17/finance.md", title: "S17 finance", body: "# finance only", roleVisibility: ["finance"] } },
    { kind: "doc", op: "upsert", data: { path: "capsules/finance.md", title: "S17 finance capsule", body: "# finance capsule", roleVisibility: ["finance"] } },
  ]);
  // D5: doc folds into read {ref: "doc/<path>"}, capsule into brief {role}
  const hid = await mcp(st.member, "read", { project: P, ref: "doc/s17/finance.md" }), miss = await mcp(st.member, "read", { project: P, ref: "doc/s17/never.md" });
  const strip = (o) => JSON.stringify({ ...o, ref: undefined, note: String(o.note || "").replace(/s17\/(finance|never)\.md/g, "X") });
  expect(hid.out.error === "not_found" && miss.out.error === "not_found" && strip(hid.out) === strip(miss.out) && !/finance|role/i.test(JSON.stringify(hid.out).replace(/s17\/finance\.md/g, "")), () => brief({ hid: hid.out, miss: miss.out }));
  const ch = await mcp(st.member, "brief", { project: P, role: "finance" }), cm = await mcp(st.member, "brief", { project: P, role: "nobody" });
  expect(ch.out.error === "unknown_brief" && cm.out.error === "unknown_brief" && !(ch.out.briefs || []).includes("finance"), () => brief({ ch: ch.out, cm: cm.out }));
  const rh = await http("GET", `/doc/s17/finance.md?project=${P}`, { key: st.member }), rm = await http("GET", `/doc/s17/never.md?project=${P}`, { key: st.member });
  const ph = await html(`/doc/s17/finance.md?project=${P}`, st.member);
  expect(rh.status === 404 && rm.status === 404 && ph.status === 404 && !/not open to your role/.test(ph.text), () => `GET /doc ${rh.status}/${rm.status}, page ${ph.status}`);
  const own = await mcp(ownerKey, "read", { project: P, ref: "doc/s17/finance.md" });
  expect(own.out && own.out.item && /finance only/.test(own.out.item.body || ""), () => brief(own.out));
  return "read: not_found for both; brief {role}: unknown_brief for both (finance not listed); GET /doc and its page 404 for both; the owner reads it";
});

smoke("true door · A3 a knowledge write's count is recounted for a member on Build, changes and the one read; a write of only hidden docs is not listed", async () => {
  const mixed = await kwrite(ownerKey, { project: P, ops: [
    { kind: "doc", op: "upsert", data: { path: "s17/a.md", title: "S17 a", body: "# a" } },
    { kind: "doc", op: "upsert", data: { path: "s17/fin-1.md", title: "S17 fin 1", body: "# f1", roleVisibility: ["finance"] } },
    { kind: "doc", op: "upsert", data: { path: "s17/fin-2.md", title: "S17 fin 2", body: "# f2", roleVisibility: ["finance"] } }] });
  const hidden = await kwrite(ownerKey, { project: P, ops: [{ kind: "doc", op: "upsert", data: { path: "s17/fin-3.md", title: "S17 fin 3", body: "# f3", roleVisibility: ["finance"] } }] });
  expect(!mixed.isError && !hidden.isError && mixed.out.ledger && hidden.out.ledger, () => brief({ mixed: mixed.out, hidden: hidden.out }));
  const L1 = mixed.out.ledger, L2 = hidden.out.ledger;
  const b = await http("GET", `/build?project=${P}&kind=knowledge`, { key: st.member });
  const row = (b.json.rows || b.json.filings || []).find((r) => r.id === L1), gone = (b.json.rows || b.json.filings || []).find((r) => r.id === L2);
  const bo = await http("GET", `/build?project=${P}&kind=knowledge`, { key: ownerKey });
  const orow = (bo.json.rows || bo.json.filings || []).find((r) => r.id === L1);
  expect(b.status === 200 && row && row.title === "1 doc written" && !gone && orow && /3 docs written/.test(orow.title), () => brief({ member: row, gone: !!gone, owner: orow && orow.title, keys: Object.keys(b.json) }));
  const live = (await mcp(st.member, "changes", { project: P, since: "2020-01-01", limit: 100 })).out;
  const liveText = JSON.stringify(live);
  expect(!/fin-[123]\.md|3 docs written/.test(liveText) && /1 doc written/.test(liveText) && !liveText.includes(L2), () => liveText.slice(0, 400));
  const one = await readTx(st.member, L1, P), none = await readTx(st.member, L2, P);
  expect(one.out.what === "1 doc written" && !/fin-/.test(String(one.out.touches)) && none.out.error === "not_found", () => brief({ one: [one.out.what, one.out.touches], none: none.out }));
  return `the member reads "1 doc written" (the owner "3 docs written") on Build, changes and read; the hidden-only write is not listed, not_found by id`;
});

smoke("true door · A4 a seatless owner in a two-project org filing with no project is refused with the projects, nothing filed; a seatless member is shown no project", async () => {
  // D5: the one door is preview then file; the preview refuses before anything is stored (tool and POST /preview)
  const r = await contribute(ownerKey, { lane: "leader", kind: "note", what: "S17 with no project", why: "the attack", eval: true });
  const rest = await http("POST", "/preview", { key: ownerKey, body: { items: [{ contribution: { lane: "leader", kind: "note", what: "S17 with no project (REST)", why: "the attack" } }], eval: true } });
  expect(r.isError && r.out.error === "project_required" && (r.out.projects || []).includes(P) && rest.status === 422 && rest.json.error === "project_required", () => brief({ mcp: r.out, rest: [rest.status, rest.json] }));
  const after = [];
  for (const k of (((await http("GET", "/control/people", { key: ownerKey })).json || {}).org || {}).projects || []) after.push(...(await contributions(ownerKey, k, { eval: true })));
  expect(after.length && !after.some((x) => /S17 with no project/.test(x.what)), () => "something was filed");
  // a seatless member is never shown a project: their write stays org-level, as before (nothing widens)
  const loner = await invite("S17 Lone", "lone@s17.local", "member", []);
  const m = await contribute(loner, { lane: "leader", kind: "note", what: "S17 loner", why: "the attack", eval: true });
  expect(!JSON.stringify(m.out).includes(`"${P}"`) && !(m.out && m.out.projects), () => brief(m.out));
  const who = (await mcp(ownerKey, "whoami", {})).out;
  expect(!/recorded at the org level/.test(who.projectGloss) && /refused project_required/.test(who.projectGloss), () => who.projectGloss);
  return `the owner: 422 project_required naming ${r.out.projects.length} projects (MCP and REST), nothing filed; whoami says so; a seatless member is shown no project`;
});

smoke("true door · A5 THE sign-in rule: a script is refused 401 and a browser navigation is sent to sign-in, on the doors the grading run named", async () => {
  const gets = ["/audit", "/brief", "/broadcast", "/build", "/control", "/decisions", "/goals", "/goals/x",
    "/gtm", "/home", "/home/summary", "/profile", "/projects", "/question/x", "/contribution/T-20200101-001",
    "/versions", "/versions/1", "/view", "/map", "/library", "/whoami", "/updates"];
  const bad = [];
  for (const p of gets) {
    // (a fetch from node sends Sec-Fetch-Mode: cors, so it is a script even with Accept: text/html — as a browser's fetch() is)
    const s = await raw(p), n = await raw(p, { nav: true, accept: "text/html" }), k = await raw(p, { bearer: "0".repeat(40), accept: "text/html" }), f = await raw(p, { accept: "text/html" });
    if (s !== "401") bad.push(`${p} script ${s}`);
    if (n !== "302 /login") bad.push(`${p} nav ${n}`);
    if (k !== "401") bad.push(`${p} bad-key ${k}`);
    if (f !== "401") bad.push(`${p} fetch ${f}`);
  }
  for (const p of ["/control", "/respond", "/round", "/rank", "/backfill"]) {
    const s = await raw(p, { method: "POST", body: {} });
    if (s !== "401") bad.push(`POST ${p} script ${s}`);
  }
  // D6: the old path's doors are gone, not gated: each answers 404 to a signed-in caller, and none is declared (sprint 7, 7.4: a
  // name the platform does not use reads as an org's address; with no credential that is the sign-in rule for every name, so
  // the walk asks as the owner: no org holds these names, the one 404)
  const caps = await http("GET", "/capabilities", { key: ownerKey });
  const declared = new Set((caps.json.capabilities || []).map((x) => x.p));
  for (const [p, row] of [["/agentic", "/agentic"], ["/understanding", "/understanding"], ["/eagle", "/eagle"], ["/page/home", "/page/:id"], ["/scope", "/scope"], ["/boot", "/boot"], ["/setup", "/setup"]]) {
    const s = await raw(p, { bearer: ownerKey });
    if (!/^404/.test(s) || declared.has(row)) bad.push(`${p} ${s}${declared.has(row) ? " (still declared)" : ""}`);
  }
  expect(!bad.length, () => bad.slice(0, 8).join(" | "));
  return `${gets.length} GET doors: script 401, bad key 401, browser 302 /login; 5 POST doors 401 to a script; the old path's 7 doors 404 and undeclared`;
});

// ================= B · the door tells the truth to a client that holds only the MCP =================
const C17 = (o) => ({ contribution: { lane: "code", kind: "pr", why: "s17", ...o } });

smoke("true door · B6 a picture through the MCP: formats' imageExample files when copied, the body is the picture's bytes; an SVG and markup posing as a png are refused", async () => {
  const f = (await mcp(ownerKey, "formats", { kind: "render" })).out;
  expect(f.imageExample && f.imageExample.data.format === "image" && /base64/.test(JSON.stringify(f.fields)) && !/register/i.test(JSON.stringify(f)), () => brief(f.imageExample));
  const ex = JSON.parse(JSON.stringify(f.imageExample).replace(/screen:pricing/g, "screen:s17-home"));
  const { rc } = await fileVia(ownerKey, [ex]);
  expect(rc.complete !== false && (rc.items || [])[0].filed && rc.items[0].filed.status === "filed", () => brief(rc.items));
  const rd = await kread(ownerKey, { project: P, kind: "render", id: "screen:s17-home||screenshot" });
  const url = (/\/render\/[0-9a-f]{64}[^"]*/.exec(JSON.stringify(rd.out)) || [])[0];
  const r = await fetch(BASE + url, { headers: { authorization: "Bearer " + ownerKey } });
  const bytes = Buffer.from(await r.arrayBuffer());
  expect(r.status === 200 && r.headers.get("content-type") === "image/png" && bytes.equals(Buffer.from(ex.data.body, "base64")), () => `GET ${url}: ${r.status} ${r.headers.get("content-type")} ${bytes.length} bytes`);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil.example"><text>x</text></a></svg>').toString("base64");
  const pv = (await mcp(ownerKey, "preview", { project: P, items: [
    { kind: "render", op: "upsert", data: { screen: "screen:s17-home", variant: "svg", format: "image", body: svg } },
    { kind: "render", op: "upsert", data: { screen: "screen:s17-home", variant: "lie", format: "image", body: Buffer.from("<html><b>not a png</b></html>").toString("base64") } },
    { kind: "render", op: "upsert", data: { screen: "screen:s17-home", variant: "url", format: "image", body: "data:image/svg+xml;base64," + svg } }] })).out;
  expect(pv.items.every((x) => x.verdict === "needs") && /SVG/.test(pv.items[0].reasons[0]) && /SVG|not a png|first bytes/.test(pv.items[1].reasons[0]) && /SVG/.test(pv.items[2].reasons[0]), () => brief(pv.items.map((x) => [x.verdict, x.reasons])));
  const tools = await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  const bank = ((tools.json.result || {}).tools || []).find((t) => t.name === "save_file");
  expect(bank && !/register|NNN/i.test(JSON.stringify(bank)) && /render, filed through preview/.test(bank.description), () => brief(bank));
  return `the copied example filed; GET /render serves image/png, ${bytes.length} bytes equal to the base64 sent; an SVG, markup as a png and an SVG data URL each need a fix; save_file names no register and sends a picture of a screen to preview`;
});

smoke("true door · B7 a re-filed batch never reports filed while writing nothing: the same batch files nothing twice, a changed item is refused saying so, changed knowledge too (G2: a clientRef names content on every door); under a new clientRef it files as the update", async () => {
  const R = "s17-b7";
  const run = async (items) => { const pv = (await mcp(ownerKey, "preview", { project: P, items, clientRef: R })).out; const f = (await mcp(ownerKey, "file", { previewId: pv.previewId, items, only: "ready" })).out; return { pv, f }; };
  const one = await run([C17({ what: "S17 b7 first", touches: ["engine/b7.js"], proof: "smoke 1/1" }), { kind: "goal", op: "upsert", data: { id: "s17-b7", parent: "s17-root", title: "S17 b7 one", dimensions: ["code"] } }]);
  const two = await run([C17({ what: "S17 b7 first", touches: ["engine/b7.js"], proof: "smoke 1/1" }), { kind: "goal", op: "upsert", data: { id: "s17-b7", parent: "s17-root", title: "S17 b7 one", dimensions: ["code"] } }]);
  const three = await run([C17({ what: "S17 b7 CHANGED", touches: ["engine/b7.js"], proof: "smoke 1/1" }), { kind: "goal", op: "upsert", data: { id: "s17-b7", parent: "s17-root", title: "S17 b7 two", dimensions: ["code"] } }]);
  const id1 = one.f.items[0].filed.id;
  expect(id1 && two.f.items[0].filed.id === id1 && two.f.items[1].filed.status === "unchanged", () => brief({ one: one.f.items, two: two.f.items }));
  expect(three.pv.items[0].verdict === "refused" && /already filed different content/.test(three.pv.items[0].reasons[0]) && three.f.items[0].filed.status !== "filed"
    && three.pv.items[1].verdict === "refused" && /already filed different content/.test(three.pv.items[1].reasons[0]) && three.f.items[1].filed.status !== "filed", () => brief({ pv: three.pv.items, f: three.f.items }));
  const g0 = (await kread(ownerKey, { project: P, kind: "goal", id: "s17-b7" })).out;
  // the same change under a NEW clientRef files as the update it is
  const pv4 = (await mcp(ownerKey, "preview", { project: P, items: [{ kind: "goal", op: "upsert", data: { id: "s17-b7", parent: "s17-root", title: "S17 b7 two", dimensions: ["code"] } }], clientRef: R + "-2" })).out;
  const f4 = (await mcp(ownerKey, "file", { previewId: pv4.previewId, items: [{ kind: "goal", op: "upsert", data: { id: "s17-b7", parent: "s17-root", title: "S17 b7 two", dimensions: ["code"] } }] })).out;
  const g = (await kread(ownerKey, { project: P, kind: "goal", id: "s17-b7" })).out;
  expect(g0.item && g0.item.title === "S17 b7 one" && f4.items[0].filed.status === "filed" && g.item && g.item.title === "S17 b7 two", () => brief({ g0, f4: f4 && f4.items, g }));
  return `refiled the same: ${id1} again, nothing twice; a changed contribution and a changed goal under the same clientRef: refused ("already filed different content"), never "filed"; under a new clientRef the goal files as its update`;
});

smoke("true door · B8 proof as people state it: a command followed by what it printed is proof whatever the command; an arrow alone is not", async () => {
  const pv = (await mcp(ownerKey, "preview", { project: P, items: [
    C17({ what: "S17 b8 the cut", touches: ["orchestrator/"], proof: "git show --stat ead3b3a16 -> 229 files changed, 306 insertions(+), 37963 deletions(-)" }),
    C17({ what: "S17 b8 a count", touches: ["engine/x"], proof: "git ls-tree -d f6efbaa17 orchestrator | wc -l -> 0" }),
    C17({ what: "S17 b8 a narration", touches: ["engine/y"], proof: "tested it -> works" })] })).out;
  expect(pv.items[0].verdict === "files" && pv.items[1].verdict === "files" && pv.items[2].verdict === "needs", () => brief(pv.items.map((x) => [x.verdict, x.reasons])));
  return "git show --stat -> 229 files changed files at once; wc -l -> 0 files; \"tested it -> works\" needs proof";
});

smoke("true door · B9 B10 holes: a stale grade's fill line carries no verdict; the Complete list draws as many rows as it counts", async () => {
  const fx = [{ kind: "check", op: "upsert", data: { id: "AC.s17.home", title: "S17 home loads", refs: ["screen:s17-home"] } }];
  await fileVia(ownerKey, fx);
  const g = await fileVia(ownerKey, [{ grade: { checkId: "AC.s17.home", verdict: "refused", proof: "curl -s /s17 -> 500 (smoke s17)" } }]);
  expect(g.rc.items[0].filed.status === "filed", () => brief(g.rc.items));
  await new Promise((r) => setTimeout(r, 10));
  await fileVia(ownerKey, [{ kind: "node", op: "upsert", data: { id: "screen:s17-home", type: "screen", name: "S17 Home, renamed", data: { surface: "s17-web" } } }]);
  const h = (await mcp(ownerKey, "missing", { project: P })).out;
  const gr = (h.items || []).find((x) => x.id === "grades");
  expect(gr && gr.fillPath && /^<proven \| refused \| incomplete/.test(gr.fillPath.args.items[0].grade.verdict) && !/"verdict":"proven"/.test(gr.fill), () => brief(gr));
  const page = await html(`/missing?project=${P}`);
  // sprint 3 L3: Complete is a card (region complete) with its count in the head (p-count)
  const sec = ((/<section[^>]*data-region="complete"[\s\S]*?<\/section>/.exec(page.text)) || [""])[0];
  const rowsN = (sec.match(/data-status="filed"/g) || []).length, countN = Number(((/p-count">(\d+)</.exec(sec)) || [])[1] || NaN);
  expect(rowsN === (h.filled || []).length && countN === rowsN && rowsN > 0, () => `Complete: ${rowsN} rows, filled ${(h.filled || []).length}, count ${countN}`);
  return `the stale refused grade's fill line: verdict "${gr.fillPath.args.items[0].grade.verdict.slice(0, 40)}…"; Complete draws ${rowsN} rows for ${(h.filled || []).length} filled`;
});

smoke("true door · B11 the first reply names missing and create_project; whoami and missing point a seatless owner of a many-project org at a project", async () => {
  const r = await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "s17", version: "1" } } } });
  const ins = (r.json.result || {}).instructions || "";
  // D5: the first-run guide is five numbered calls: whoami, missing, formats, preview, file
  const steps = (ins.match(/^\d\. Call `[a-z_]+`/gm) || []).map((x) => x.replace(/^\d\. Call `|`$/g, ""));
  expect(/`missing`/.test(ins) && /create_project/.test(ins) && steps.join(",") === "whoami,missing,formats,preview,file", () => ins);
  const who = (await mcp(ownerKey, "whoami", {})).out;
  expect(/refused project_required/.test(who.projectGloss), () => who.projectGloss);
  return "initialize names missing and create_project (five numbered calls: whoami, missing, formats, preview, file); whoami: an unnamed write is refused, never the org level";
});

smoke("true door · B12 a new picture of a screen does not make its grades stale; a change to the node does", async () => {
  await fileVia(ownerKey, [{ kind: "node", op: "upsert", data: { id: "screen:s17-pic", type: "screen", name: "S17 Pic", data: { surface: "s17-web" } } },
    { kind: "check", op: "upsert", data: { id: "AC.s17.pic", title: "S17 pic shows", refs: ["screen:s17-pic"] } }]);
  await fileVia(ownerKey, [{ grade: { checkId: "AC.s17.pic", verdict: "proven", proof: "curl -s /s17/pic -> 200, 1 heading" } }]);
  await new Promise((r) => setTimeout(r, 10));
  const png = (await mcp(ownerKey, "formats", { kind: "render" })).out.imageExample.data.body;
  await fileVia(ownerKey, [{ kind: "render", op: "upsert", data: { screen: "screen:s17-pic", format: "image", body: png } },
    { kind: "render", op: "upsert", data: { screen: "screen:s17-pic", variant: "html", format: "html", body: "<main><h1>S17 pic</h1></main>" } }]);
  const stale = async () => { const n = (await http("GET", `/map/node?project=${P}&ref=screen:s17-pic`, { key: ownerKey })).json; return (n && n.stale && Number(n.stale.count)) || 0; };
  const s0 = await stale();
  const h0 = (await mcp(ownerKey, "missing", { project: P })).out;
  await fileVia(ownerKey, [{ kind: "node", op: "upsert", data: { id: "screen:s17-pic", type: "screen", name: "S17 Pic, renamed", data: { surface: "s17-web" } } }]);
  const s1 = await stale();
  expect(s0 === 0 && s1 >= 1, () => `stale after renders ${s0}, after the node changed ${s1}; missing ${brief((h0.items || []).find((x) => x.id === "grades"))}`);
  return `two renders on a graded screen: 0 stale; the screen renamed: ${s1} stale`;
});

smoke("true door · B13 one ref's history: screen:<id> and the bare id read the same, touches and goal refs are indexed, a member reads only what they may open", async () => {
  const { rc } = await fileVia(ownerKey, [C17({ what: "S17 b13 by touches", touches: ["screen:s17-home"], proof: "smoke 1/1", goalRef: "s17-root" }),
    C17({ what: "S17 b13 by screens", touches: ["ui"], screens: "s17-home", proof: "smoke 1/1" })]);
  const ids = rc.items.map((x) => x.filed && x.filed.id);
  // D5: impact {refs}'s history (one project's, newest first), the same on GET /impact?refs=
  const hist = async (key, ref) => { const r = await mcp(key, "impact", { project: P, refs: [ref] }); return (r.out && r.out.history) || {}; };
  const a = await hist(ownerKey, "screen:s17-home"), b = await hist(ownerKey, "s17-home");
  const g = await hist(ownerKey, "goal/s17-root"), g2 = ((await http("GET", `/impact?project=${P}&refs=goal:s17-root`, { key: ownerKey })).json || {}).history || {};
  const has = (h, id) => (h.items || []).some((t) => t.id === id);
  expect(a.refs && a.refs[0] === "screen:s17-home" && b.refs && b.refs[0] === "screen:s17-home" && has(a, ids[0]) && has(a, ids[1]) && a.count === b.count && has(g, ids[0]) && g2.refs && g2.refs[0] === "goal/s17-root" && has(g2, ids[0]),
    () => brief({ a: [a.refs, a.count], b: [b.refs, b.count], g: [g.refs, g.count], ids }));
  // a member of another project: the project is refused them (project_forbidden), so no history is read
  const other = await invite("S17 Out", "out@s17.local", "member", ["smoke"]);
  const m = await mcp(other, "impact", { project: P, refs: ["screen:s17-home"] });
  expect(m.isError && /project_forbidden/.test(JSON.stringify(m.out)) && !has((m.out && m.out.history) || {}, ids[0]), () => brief(m.out));
  return `impact {refs} history: screen:s17-home and s17-home ${a.count} each (touches and screens); goal/s17-root and GET /impact?refs=goal:s17-root find the goalRef; a member of another project is refused the project`;
});

smoke("true door · B14 the small ones: formats grade, map {ref}, read {kind, ref}, a grouped receipt names every item, an auto-routed contribution reads LANDED, an update says what it changes, the text keeps §", async () => {
  const fg = (await mcp(ownerKey, "formats", { kind: "grade" })).out;
  expect(!fg.error && fg.example && /<proven \| refused \| incomplete/.test(fg.example.grade.verdict), () => brief(fg));
  const mn = (await mcp(ownerKey, "map", { project: P, ref: "screen:s17-home" })).out, rk = (await kread(ownerKey, { project: P, kind: "goal", ref: "s17-root" })).out;
  expect(!mn.error && /s17-home/.test(JSON.stringify(mn)) && rk.item && rk.item.id === "s17-root", () => brief({ mn, rk }));
  // a big batch of grades is stored grouped: the receipt still names each item and what it became
  const checks = Array.from({ length: 130 }, (_, i) => ({ kind: "check", op: "upsert", data: { id: `AC.s17.many.${i}`, title: `S17 many ${i} — a check with a long enough title to make the summary big ${"x".repeat(60)}`, refs: ["screen:s17-home"] } }));
  await fileVia(ownerKey, checks);
  const grades = checks.map((c) => ({ grade: { checkId: c.data.id, verdict: "proven", proof: `node tools/s17.mjs ${c.data.id} -> exit 0, 1 passing, ${"y".repeat(40)}` } }));
  const big = await fileVia(ownerKey, grades);
  expect(big.rc.items.length === 130 && big.rc.items.every((x) => x.filed && x.filed.status === "filed" && /^T-/.test(x.filed.id || "") && x.key), () => `receipt items ${big.rc.items.length}: ${brief(big.rc.items.slice(0, 2))}`);
  const b = (await http("GET", `/build?project=${P}`, { key: ownerKey })).json;
  const auto = (b.rows || []).find((r) => r.tempo === "in");
  expect(auto && auto.chip === "LANDED", () => brief((b.rows || []).slice(0, 3)));
  const up = (await mcp(ownerKey, "preview", { project: P, items: [{ kind: "goal", op: "upsert", data: { id: "s17-root", title: "S17 root", status: "in progress", note: "§0 of the plan" } }] })).out;
  expect(up.items[0].effect === "updates 1" && JSON.stringify(up.items[0].changes) === JSON.stringify(["note", "status"]) && / updates note, st\.\.\.$/m.test(up.text) && !/^ +changes /m.test(up.text), () => `${brief(up.items[0])}\n${up.text}`);
  const tx = await fileVia(ownerKey, [C17({ what: "S17 §0 café", touches: ["engine/s.js"], proof: "smoke 1/1" })]);
  expect(/§0 café/.test(tx.pv.text) && !/\?0 caf/.test(tx.pv.text), () => tx.pv.text);
  return `formats grade; map {ref}; read {kind, ref}; a 130-grade receipt names all 130; filed-at-once reads LANDED; "updates note, st..." (its fields in the effect column, cut); "§0 café" kept`;
});

smoke("true door · B14 a ruling recorded by its words shows that ruling; a measure ruled absent completes the aim and says so", async () => {
  await fileVia(ownerKey, [{ kind: "question", op: "upsert", data: { qid: "Q-s17-label", question: "S17: how do we price?", status: "decided", label: "Per project, never per seat", decidedBy: "Ryuk", decidedAt: "2026-10-02" } },
    { kind: "aim", op: "upsert", data: { aim: "S17 proves the door tells the truth", measure: { none: true, why: "Owner ruling 2026-10-02: no number for now; the beta measures come first" }, confidence: "proposal", asOf: "2026-10-02" } }]);
  const q = await html(`/question/Q-s17-label?project=${P}`);
  expect(/data-ruling="label"/.test(q.text) && /Per project, never per seat/.test(q.text) && !/No options are filed/.test(q.text), () => `question ${q.status}`);
  const h = (await mcp(ownerKey, "missing", { project: P })).out;
  expect((h.filled || []).includes("aim"), () => brief({ filled: h.filled, holes: (h.items || []).map((x) => x.id) }));
  const home = await html(`/home?project=${P}`);
  const aim = (/data-region="aim"[\s\S]*?<\/section>/.exec(home.text) || [""])[0];
  expect(/data-measure="none"/.test(aim) && /No measure, by decision/.test(aim) && /data-confidence="proposal"/.test(aim) && /S17 proves the door tells the truth/.test(aim) && !/preview \{|file \{/.test(aim), () => aim.slice(0, 600));
  return "Q-s17-label shows its ruling; the aim complete with its measure ruled absent; Home: the aim leads, 'No measure for now, by decision', the proposal mark";
});

// ================= C · the screens say what the data says =================
smoke("true door · C15 C16 C17 open decisions count only open chains; Blocked is only what a question blocks; the chip says it is the fill", async () => {
  await fileVia(ownerKey, [
    { kind: "question", op: "upsert", data: { qid: "Q-s17-dep-open", question: "S17 dep open?", status: "open", whoOwes: "owner", options: [{ what: "A" }, { what: "B" }] } },
    { kind: "question", op: "upsert", data: { qid: "Q-s17-dep-done", question: "S17 dep done?", status: "decided", options: [{ what: "A" }], choice: 0 } },
    { kind: "node", op: "upsert", data: { id: "dep:s17-1", type: "dep", name: "S17 chain 1", data: { head: { qid: "Q-s17-dep-open", kind: "question", state: "open", title: "S17 dep open?" } } } },
    { kind: "node", op: "upsert", data: { id: "dep:s17-2", type: "dep", name: "S17 chain 2", data: { head: { qid: "Q-s17-dep-done", kind: "question", state: "open", title: "S17 dep done?" } } } },
    { kind: "goal", op: "upsert", data: { id: "s17-quiet", parent: "s17-root", title: "S17 nothing fed it", dimensions: ["code"] } }]);
  const map = await html(`/map?project=${P}`);
  expect(/<b>1<\/b> open decision</.test(map.text) && /<b>1<\/b> ruling not built/.test(map.text), () => (/mx-ov[\s\S]{0,600}/.exec(map.text) || [""])[0]);
  const g = (await http("GET", `/goals?project=${P}`, { key: ownerKey })).json;
  expect(g.noFeed.includes("s17-quiet") && !(g.blocked || []).some((b) => b.id === "s17-quiet") && (g.blocked || []).every((b) => b.kind === "decision"), () => brief({ noFeed: g.noFeed, blocked: g.blocked }));
  const gp = await html(`/goals?project=${P}`);
  // L4: the fill is What is missing's alone: Goals draws no "Goals filled" chip
  expect(!/data-meter="goals"/.test(gp.text) && !/Goals filled:/.test(gp.text) && !/% by depth · complete/.test(gp.text), () => (/u-meter[\s\S]{0,300}/.exec(gp.text) || [""])[0]);
  return "the Map: 1 open decision, 1 ruling not built (the head ruled since); Blocked lists no unfed goal; no fill chip on Goals";
});

smoke("true door · C18 C19 C20 Home's aim leads; a project with no product model says so on the Map; a screen of two apps shows in both", async () => {
  await control({ action: "add-project", key: "s17ops", name: "S17 Ops" });
  await kwrite(ownerKey, { project: "s17ops", ops: [{ kind: "aim", op: "upsert", data: { aim: "S17 Ops runs the outreach", productModel: { none: true, why: "Owner ruling: operations and go-to-market only" } } },
    { kind: "goal", op: "upsert", data: { id: "ops-root", title: "S17 ops root", dimensions: ["gtm"], confidence: "direction", asOf: "2026-10-01" } }] });
  const m = await html("/map?project=s17ops");
  expect(/data-model="none"/.test(m.text) && /This project holds no product model, by design\./.test(m.text) && /operations and go-to-market only/.test(m.text) && /1 goal<\/a> on Goals/.test(m.text), () => (/data-region="canvas"[\s\S]{0,900}/.exec(m.text) || [""])[0]);
  const gp = await html("/goals?project=s17ops");
  expect(/data-id="ops-root"[\s\S]*?data-confidence="direction"/.test(gp.text), () => "Goals: no direction mark");
  await fileVia(ownerKey, [{ kind: "node", op: "upsert", data: { id: "surface:s17-app", type: "surface", name: "S17 App" } }, { kind: "node", op: "upsert", data: { id: "surface:s17-assist", type: "surface", name: "S17 Assistant" } },
    { kind: "node", op: "upsert", data: { id: "screen:s17-shared", type: "screen", name: "S17 Shared", data: { surface: ["s17-app", "s17-assist"], lane: "x", step: 1 } } }]);
  const a = (await mcp(ownerKey, "map", { project: P, plane: "screens", surface: "s17-app" })).out, b = (await mcp(ownerKey, "map", { project: P, plane: "screens", surface: "s17-assist" })).out;
  const has = (x) => (x.screens || []).some((s) => s.id === "screen:s17-shared");
  expect(has(a) && has(b) && (a.surfaces || []).find((s) => s.key === "s17-assist").screens >= 1, () => brief({ a: (a.screens || []).map((s) => s.id), b: (b.screens || []).map((s) => s.id), surfaces: a.surfaces }));
  return "S17 Ops' Map: no product model, by design, with its goal; its goal's direction mark; screen:s17-shared on both S17 App and S17 Assistant";
});

// ================= D · the install =================
smoke("true door · D23 the contract declares no webhooks region; the api plane serves none", async () => {
  const c = await http("GET", "/contract", { key: ownerKey });
  const api = await mcp(ownerKey, "map", { project: P, plane: "api" });
  expect(c.status === 200 && !/webhooks/.test(c.text) && !api.isError && !("webhooks" in (api.out.regions || {})), () => `contract ${c.status} ${/webhooks/.test(c.text)}; api ${Object.keys(api.out.regions || {})}`);
  return "GET /contract names no webhooks; the api plane has none";
});
