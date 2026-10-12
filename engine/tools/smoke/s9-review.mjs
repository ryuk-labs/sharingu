// tools/smoke/s9-review.mjs — sprint 2's independent review: its authority findings, each proven both ways through the real
// door. Builds on s0 (project smoke, the member, the outsider seated nowhere) and s6 (project smoke-b, the partner seated on
// smoke, "hat" the member seated on smoke and smoke-b, onlyB the member seated on smoke-b, the loner: a partner seated
// nowhere). Runs LAST: R5 archives projects local and smoke-b.
//   R1 · fixes 5 and 6: an image render is a raster picture (an SVG is refused, naming a wireframe or a png/jpeg/webp), and
//        names the writer's own or a public artifact only, the owner too; the member's own private PNG and a public one work
//   R2 · fix 2b: Control's JSON names a Partner only the projects they are seated on (org.projects); a member reads them all
//   R3 · fix 2a: Broadcast's shelf shows a Partner only what was published from, or equipped into, their projects; a member
//        reads the whole shelf; the starter pack is everyone's
//   R4 · fix 2c: the heartbeat's landed read for a Partner is their seated projects' events only; a member reads the org's
//   R5 · fix 1: an org with ONE active project: a Partner with no seat on it reads no project at every door (Home, the Map,
//        Screens, the live picture, state, holes, library, heartbeat, broadcast); a Partner seated on it and a member with no
//        seat read it, as before
//   R6 · fix 7: a demotion to Partner clears the access hats in the same press (and says so); what they unlocked closes
import { smoke, expect, brief, s, http, mcp, html, control, ownerKey, BASE, kwrite, kread, contribute, readOnlyOf, contributions, sessionPath, unbased } from "./lib.mjs";
import { PRESETS } from "../../src/presetdata.js";

const P = "smoke", Q = "smoke-b";
const write = async (key, ops, project = P) => (await kwrite(key, { project, ops })).out;
const bearer = (key) => ({ authorization: "Bearer " + key });
async function raw(method, path, headers = {}, body) {
  const r = await fetch(BASE + await sessionPath(headers.cookie, path), { method, headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await unbased(await r.text());   // the org base off its paths (sprint 7, 7.4: lib.mjs unbased)
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text };
}
const signIn = async (email, key) => {
  const r = await http("POST", "/login", { body: { email, password: key, device: "smoke-s9" } });
  if (!r.json || !r.json.token) throw new Error(`POST /login ${email}: ${r.status} ${brief(r.json)}`);
  return r.json.token;
};
const session = (tok) => ({ cookie: `__Host-ar_session=${encodeURIComponent(tok)}`, origin: BASE, "sec-fetch-site": "same-origin" });
const bank = async (key, type, body, q = "group=s9") => {
  const r = await fetch(`${BASE}/artifact?title=s9-pic&${q}`, { method: "POST", headers: { ...bearer(key), "content-type": type }, body });
  const j = await r.json();
  if (r.status !== 200 || !j.id) throw new Error(`POST /artifact ${type}: ${r.status} ${brief(j)}`);
  return j;
};
// a 2x2 PNG (valid, 75 bytes) and a small SVG that carries a working link
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAGX8C/V8+/0LAAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><a href="https://evil.example/"><rect width="2" height="2"/></a></svg>';
const SCREEN = "screen:s9-pic";
const imageOp = (variant, artifact) => ({ kind: "render", op: "upsert", data: { screen: SCREEN, state: "default", variant, format: "image", artifact } });
const firstErr = (out) => ((out && out.errors) || [])[0] || {};

smoke("R1: an image render is png/jpeg/webp only (an SVG is refused) and names your own or a public artifact, the owner too", async () => {
  const w0 = await write(ownerKey, [{ kind: "node", op: "upsert", data: { id: SCREEN, type: "screen", name: "S9 picture", data: { surface: "s9-app" } } }]);
  expect(!w0.error && w0.written === 1, () => `screen: ${brief(w0)}`);
  const svg = await bank(ownerKey, "image/svg+xml", SVG);
  const svgW = await write(ownerKey, [imageOp("svg", svg.id)]);
  expect(svgW.error === "invalid_ops" && firstErr(svgW).error === "bad_field" && /SVG/.test(firstErr(svgW).note) && /wireframe/.test(firstErr(svgW).note) && /png, jpeg or webp/.test(firstErr(svgW).note),
    () => `an SVG image render: ${brief(svgW)}`);
  // the member's PRIVATE picture: the owner may read it, but never publish it as a render; the member files it themselves
  const mine = await bank(s.member.key, "image/png", PNG);
  const byOwner = await write(ownerKey, [imageOp("theirs", mine.id)]);
  const byMember = await write(s.member.key, [imageOp("own", mine.id)]);
  expect(byOwner.error === "invalid_ops" && firstErr(byOwner).error === "missing_artifact" && !byMember.error && byMember.written === 1,
    () => `the member's private PNG: owner ${brief(byOwner)} · member ${brief(byMember)}`);
  // a PUBLIC picture, and the owner's own: the owner files both
  const pub = await bank(s.member.key, "image/png", PNG, "group=public");
  const own = await bank(ownerKey, "image/png", PNG);
  const okW = await write(ownerKey, [imageOp("public", pub.id), imageOp("owners", own.id)]);
  expect(!okW.error && okW.written === 2, () => `public + own: ${brief(okW)}`);
  const one = (await kread(ownerKey, { project: P, kind: "render", id: `${SCREEN}|default|owners` })).out;
  const served = await fetch(BASE + one.url, { headers: bearer(ownerKey) });
  expect(served.status === 200 && served.headers.get("content-type") === "image/png", () => `GET ${one.url}: ${served.status} ${served.headers.get("content-type")}`);
  return "an SVG: bad_field naming a wireframe or png/jpeg/webp; the member's private PNG: the owner missing_artifact, the member files it; a public PNG and the owner's own: filed, served image/png";
});

smoke("R2: Control names a Partner only their own projects (org.projects); a member reads every active one", async () => {
  const pj = (await http("GET", "/control/people", { key: s.partner.key })).json || {};
  const mj = (await http("GET", "/control/people", { key: s.hat.key })).json || {};
  const page = await html("/control", s.partner.key);
  expect(JSON.stringify(pj.org && pj.org.projects) === '["smoke"]' && JSON.stringify((pj.workspaces || []).map((x) => x.key)) === '["smoke"]'
    && !JSON.stringify(pj).includes('"smoke-b"') && !JSON.stringify(pj).includes('"local"')
    && ["local", "smoke", "smoke-b"].every((k) => (mj.org.projects || []).includes(k))
    && page.status === 200 && !page.text.includes("smoke-b") && />1 project seated</.test(page.text) && /data-metric="projects" data-value="1"/.test(page.text) && !/projects? active</.test(page.text),   // sprint 3 L3: the seat count is a chip, the Projects tile the partner's own
    () => `partner org.projects ${brief(pj.org && pj.org.projects)} · member ${brief(mj.org && mj.org.projects)} · page ${page.status}`);
  return `the partner: org.projects ["smoke"], the page names no other project; the member: ${mj.org.projects.length} active projects`;
});

smoke("R3: Broadcast shows a Partner only what was published from or equipped into their projects; a member sees the whole shelf", async () => {
  const draft = (key, project, slug) => contribute(key, { project, lane: "leader", kind: "item", what: `S9 ${slug} skill`, why: "the review's shelf smoke",
    touches: ["skill"], gapRefs: [`item/${slug}`], proof: "https://example.com/s9" });
  const hatTok = await signIn("hat@smoke.local", s.hat.key);
  const pubs = {};
  for (const [project, slug] of [[P, "s9-from-smoke"], [Q, "s9-from-b"], [Q, "s9-equipped"]]) {
    const d = await draft(s.hat.key, project, slug);
    expect(!d.isError && /^T-/.test(d.out.id), () => `draft ${slug}: ${brief(d.out)}`);
    const p = await raw("POST", "/broadcast/publish", session(hatTok), { id: d.out.id });
    expect(p.status === 200 && /^T-/.test(p.json.id), () => `publish ${slug}: ${p.status} ${brief(p.json)}`);
    pubs[slug] = p.json;
  }
  // s9-equipped is published from smoke-b, then equipped INTO smoke by a member seated there
  const eq = await raw("POST", "/broadcast/equip", session(hatTok), { slug: "s9-equipped", v: 1, project: P });
  expect(eq.status === 200 && /^T-/.test(eq.json.id), () => `equip: ${eq.status} ${brief(eq.json)}`);
  const slugs = (j) => ((j.regions || {}).shelf || []).map((c) => c.slug);
  const pj = (await http("GET", `/broadcast?project=${P}`, { key: s.partner.key })).json || {};
  const pt = (await mcp(s.partner.key, "broadcast", { project: P })).out || {};
  const mj = (await http("GET", `/broadcast?project=${P}`, { key: s.hat.key })).json || {};
  const page = await html(`/broadcast?project=${P}`, s.partner.key);
  const ps = slugs(pj);
  expect(ps.includes("s9-from-smoke") && ps.includes("s9-equipped") && !ps.includes("s9-from-b") && JSON.stringify(slugs(pt)) === JSON.stringify(ps)
    && !JSON.stringify(pj).includes("S9 s9-from-b") && !page.text.includes("s9-from-b") && ((pj.regions || {})["starter-shelf"] || []).length === PRESETS.length
    && ["s9-from-smoke", "s9-from-b", "s9-equipped"].every((x) => slugs(mj).includes(x)),
    () => `partner shelf ${brief(ps)} · tool ${brief(slugs(pt))} · member ${brief(slugs(mj))}`);
  return `the partner: ${ps.length} card(s) (from smoke, equipped into smoke; never the one only smoke-b holds), the starter pack's ${PRESETS.length}; the member: all three`;
});

smoke("R4: the heartbeat shows a Partner only what landed in their projects; a member reads the org's", async () => {
  const lane = async (key) => ((await mcp(key, "updates", { project: P })).out.you || {}).lane || "all";
  // a person with no lane reads by the lane "none" (core.js heartbeatFor), so the questions name it too: each lands in both views
  // (D5: a question for the owner, POST /ask, is the event updates reads)
  const lanes = [...new Set([await lane(s.partner.key), await lane(s.hat.key), "none"])];
  const drift = async (key, what) => {
    const r = await http("POST", "/ask", { key, body: { question: what, about: lanes.join(",") } });
    expect(r.status === 200 && r.json.asked === true, () => `POST /ask ${what}: ${r.status} ${brief(r.json)}`);
  };
  // a member seated on smoke alone (one seat: their events are stamped smoke), and onlyB, seated on smoke-b alone
  const add = await control([["action", "add-person"], ["name", "Smoke S9"], ["email", "s9@smoke.local"], ["role", "member"], ["projectKey", P]]);
  const s9Key = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(add.status === 200 && s9Key, `add a member seated on smoke: ${add.status}`);
  await drift(s9Key, "S9 drift in smoke");
  await drift(s.onlyB.key, "S9 drift in smoke-b");
  const seen = async (key) => { const h = (await mcp(key, "updates", { project: P })).out; return { whats: (h.inYourLane || []).map((x) => x.what), elsewhere: h.elsewhere }; };
  const p = await seen(s.partner.key), m = await seen(s.hat.key);
  expect(p.whats.includes("S9 drift in smoke") && !p.whats.includes("S9 drift in smoke-b") && m.whats.includes("S9 drift in smoke") && m.whats.includes("S9 drift in smoke-b"),
    () => `partner ${brief(p)} · member ${brief(m)}`);
  return "the partner: the smoke drift, never the smoke-b one; the member: both";
});

smoke("R6: a demotion to Partner clears the access hats in the same press, and says so; what they unlocked closes", async () => {
  const access = (personId, hats) => control([["action", "set-access-hats"], ["personId", personId], ...hats.map((h) => ["accessHat", h])]);
  const g = await access(s.onlyB.id, ["finance"]);
  const w = await write(ownerKey, [{ kind: "doc", op: "upsert", data: { path: "capsules/finance.md", title: "Finance brief", body: "# finance brief s9", roleVisibility: ["finance"] } }], Q);
  expect(g.status === 200 && !w.error, () => `setup: ${g.status} ${brief(w)}`);
  const read = async () => (await kread(s.onlyB.key, { project: Q, kind: "doc", id: "capsules/finance.md" })).out;
  const before = await read();
  const r = await control({ action: "set-role", personId: s.onlyB.id, role: "partner" });
  const row = (((await http("GET", "/control/people", { key: ownerKey })).json || {}).people || []).find((x) => x.id === s.onlyB.id) || {};
  const after = await read();
  expect(before.item && before.item.path === "capsules/finance.md" && /is now a partner/.test(r.text) && /Their access hats were cleared; set them again if needed\./.test(r.text)
    && row.role === "partner" && JSON.stringify(row.access) === "[]" && after.error === "not_found",
    () => `before ${brief(before)} · flash ${(r.text.match(/is now a partner[^<]*/) || [""])[0]} · row ${brief({ role: row.role, access: row.access })} · after ${brief(after)}`);
  return "a member with the finance access hat reads its brief; set-role partner clears the hats (the flash says so) and the brief is not_found";
});

smoke("R5: one active project: a Partner with no seat on it reads no project at every door; its Partner and a seatless member read it", async () => {
  // every active project but smoke is archived (earlier slices add their own)
  const was = (((await http("GET", "/control/people", { key: ownerKey })).json || {}).org || {}).projects || [];
  for (const k of was.filter((x) => x !== P)) { const a = await control({ action: "archive-project", projectKey: k }); expect(a.status === 200, `archive ${k}: ${a.status}`); }
  const active = ((await http("GET", "/control/people", { key: ownerKey })).json || {}).org || {};
  expect(JSON.stringify(active.projects) === '["smoke"]', () => `active projects: ${brief(active.projects)}`);
  // the Partners seated on no ACTIVE project: the loner (seated nowhere) and onlyB (a Partner since R6, seated on archived smoke-b)
  const fenced = async (key) => {
    const home = (await http("GET", "/home/summary", { key })).json || {};
    const map = await http("GET", "/map", { key });
    const scr = await http("GET", "/map/screens", { key });
    const live = (await http("GET", "/broadcast/live", { key })).json || {};
    const bc = (await http("GET", "/broadcast", { key })).json || {};
    // D5: state and heartbeat fold into updates, library into read {kind: "doc"}
    const hb = (await mcp(key, "updates")).out || {};
    const st = hb;
    const holes = (await mcp(key, "missing")).out || {};
    const lib = (await mcp(key, "read", { kind: "doc", limit: 100 })).out || {};
    return { home: home.project && home.project.key, mapNodes: map.json && (map.json.nodes || []).length, screens: scr.status,
      live: live.project, bc: bc.project && bc.project.key, state: st.project, holes: holes.project,
      lib: lib.project != null || JSON.stringify(lib).includes("starter/frontend.md"), knowledgeAt: hb.asOf };
  };
  const nothing = (x) => x.home == null && x.screens === 422 && x.live == null && x.bc == null && x.state == null && !x.lib && x.knowledgeAt == null && !x.mapNodes
    && (x.items == null || x.items === "");
  const loner = await fenced(s.loner.key), onlyB = await fenced(s.onlyB.key);
  expect(nothing(loner) && nothing(onlyB), () => `seatless partners read: loner ${brief(loner)} · onlyB ${brief(onlyB)}`);
  // its Partner (seated on smoke) and a member with no seat (the outsider) read smoke, as before the fix
  const reads = async (key) => ({ home: ((await http("GET", "/home/summary", { key })).json || {}).project, state: ((await mcp(key, "updates")).out || {}).project,
    screens: (await http("GET", "/map/screens", { key })).status, lib: JSON.stringify((await mcp(key, "read", { kind: "doc", limit: 100 })).out || {}).includes("starter/frontend.md") });
  const partner = await reads(s.partner.key), member = await reads(s.outsider.key);
  const smokeRead = (x) => x.home && x.home.key === P && x.screens === 200 && x.lib;
  expect(smokeRead(partner) && partner.state && partner.state.key === P && smokeRead(member), () => `partner ${brief(partner)} · seatless member ${brief(member)}`);
  return "the loner and onlyB (partners, no active seat): no project on Home, the Map, Screens (422), the live picture, Broadcast, updates, missing, read; the seated partner and the seatless member read smoke";
});

// D5 Part 4 (a): the attack — a Partner seated on no active project, in an org with ONE active project (R5 left it so), files
// with no project: the one project rule (core.js doorProject) used to stamp the org's only project; the fence now refuses it
// project_forbidden on the tool, POST /preview and POST /file, and nothing is filed. A question for the owner (ask) still lands
// at the org level, never in the project.
smoke("R5b: one active project: a Partner with no seat on it files nothing into it (preview, POST /preview, file); ask stays org-level", async () => {
  const before = (await contributions(ownerKey, P, { eval: true })).length;
  const item = { contribution: { lane: "leader", kind: "note", what: "S9 a seatless partner's filing", why: "the attack" } };
  const bad = [];
  for (const [who, key] of [["loner", s.loner.key], ["onlyB", s.onlyB.key]]) {
    const pv = await mcp(key, "preview", { items: [item] });
    const rp = await http("POST", "/preview", { key, body: { items: [item] } });
    const named = await mcp(key, "preview", { project: P, items: [item] });
    const fl = await mcp(key, "file", { previewId: "P-0000000000000000", items: [item] });
    if (!(pv.isError && pv.out.error === "project_forbidden" && /hold a seat on/.test(pv.out.note || ""))) bad.push(`${who} tool ${brief(pv.out).slice(0, 160)}`);
    if (!(rp.status === 403 && rp.json.error === "project_forbidden")) bad.push(`${who} POST /preview ${rp.status} ${brief(rp.json).slice(0, 120)}`);
    if (!(named.isError && named.out.error === "project_forbidden")) bad.push(`${who} named ${brief(named.out).slice(0, 120)}`);
    if (!fl.isError) bad.push(`${who} file ${brief(fl.out).slice(0, 120)}`);
    const ask = await mcp(key, "ask", { question: `S9 ${who} asks the owner` });
    if (ask.isError || ask.out.asked !== true) bad.push(`${who} ask ${brief(ask.out).slice(0, 120)}`);
  }
  const after = await contributions(ownerKey, P, { eval: true });
  expect(!bad.length && after.length === before && !after.some((x) => /seatless partner/.test(x.what)), () => `${bad.join(" | ")} · filed ${after.length - before}`);
  return "the loner and onlyB: preview (tool, named or not) and POST /preview refuse project_forbidden naming the seat; file with no preview of theirs refused; nothing filed; ask answers asked";
});

// D5 Part 4 (b): GET /updates is the updates tool's twin through the tool's own door (src/mcp.js callTool), so the project
// scope and the fence are one code: the two answer the same for every identity, with and without a project named.
smoke("R5c: GET /updates and the updates tool answer the same for every identity, with and without a project", async () => {
  const pick = (o) => JSON.stringify(o && !o.error ? { project: o.project, you: o.you && o.you.id, activeProject: o.activeProject, yourProjects: o.yourProjects, lane: (o.inYourLane || []).length,
    yours: o.yours && o.yours.count, waiting: o.waitingOnYou && (o.waitingOnYou.openItems || []).length } : { error: o && o.error });
  const people = [["owner", ownerKey], ["member", s.member.key], ["outsider", s.outsider.key], ["partner", s.partner.key], ["hat", s.hat.key], ["onlyB", s.onlyB.key], ["loner", s.loner.key]];
  const bad = []; let n = 0;
  for (const [who, key] of people) {
    for (const q of ["", P]) {
      const t = await mcp(key, "updates", q ? { project: q } : {});
      const r = await http("GET", `/updates${q ? `?project=${q}` : ""}`, { key });
      n++;
      if (pick(t.out) !== pick(r.json)) bad.push(`${who}${q ? " " + q : ""}: tool ${pick(t.out)} · GET ${r.status} ${pick(r.json)}`);
    }
  }
  // a read-only credential (no MCP door: it reads by GET) reads what its person reads
  const ro = readOnlyOf(s.member.key);
  const rt = await http("GET", "/updates", { key: ro }), rm = await mcp(s.member.key, "updates", {});
  expect(!bad.length && rt.status === 200 && pick(rt.json) === pick(rm.out), () => `${bad.slice(0, 4).join(" | ")} · read-only GET ${rt.status} ${pick(rt.json)} tool ${pick(rm.out)}`);
  return `${n} identity × project cells: the tool and GET /updates agree (project, you, your projects, lane, yours, waiting); the read-only key reads its person's`;
});
