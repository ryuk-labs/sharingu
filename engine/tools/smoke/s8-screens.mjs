// tools/smoke/s8-screens.mjs — screens and renders, the standard (docs/plan/ARCHITECTURE.md §11), through the real door.
// Builds on s0: project smoke, the member seated on it, the outsider seated nowhere.
//   · two screen nodes (surface s8-app), a nav edge, a style and an html render filed through preview then file show on GET
//     /map/screens (and map {plane: screens}, its twin) with the render's index row, the wireframe, the edge and the style's hash;
//   · GET /render/:hash serves it as a sandbox document: its style inline, no script, the CSP and nosniff headers, cached
//     for good when the URL names the style's hash, revalidated (ETag, 304) when it does not;
//   · the same body again writes nothing (no blob, no row, no ledger row); a changed body writes one blob and one row;
//   · a script, an onclick, a javascript: URL and an external @import are stripped (the reply says so, the body has none);
//   · an html body over 200,000 bytes, and a call over 256 KB of bodies (sprint 3 B1), are refused naming the op;
//   · the outsider (no seat) gets 404 on the render, a key in the URL is not a credential (401), the member reads it;
//   · an image render names a banked artifact and serves its bytes; another person's private artifact is missing_artifact;
//   · a wireframe render serves the grammar and src/wireframe.js draws it; read lists the index and gives a URL;
//   · removing the screen node removes its renders from the index.
//   · M6, a screen's takes (migrate-065): two pictures filed are two takes, the strip shows both on the screen's inspector and on
//     the Screens view's pinned screen (the current one marked, the other with Restore); the first restored through the door is
//     the frame's newest again, then the second through the page's press (a signed-in browser, sent back where it came from); a
//     previous take's body is served; a hash another project holds is unknown_render, a Partner partner_refused.
import { readFileSync } from "node:fs";
import { smoke, expect, brief, s, http, html, mcp, ownerKey, BASE, kwrite, kread, sessionPath, unbased } from "./lib.mjs";
import { drawWireframe } from "../../src/wireframe.js";
import { TINY_PNG_BASE64 } from "../../src/render.js";

const P = "smoke", SF = "s8-app";
const HOME = "screen:s8-home", NEXT = "screen:s8-next";
const WF = [{ kind: "header", label: "S8 Home" }, { kind: "title", label: "Your balance" }, { kind: "list", items: 3 }, { kind: "button", label: "Next", emphasis: true }];
const node = (id, name, data) => ({ kind: "node", op: "upsert", data: { id, type: "screen", name, status: "planned", data } });
const write = async (key, ops, extra = {}) => (await kwrite(key, { project: P, ops, ...extra })).out;
const raw = async (path, headers = {}) => {
  const r = await fetch(BASE + path, { headers, redirect: "manual" });
  const buf = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, h: (k) => r.headers.get(k) || "", text: new TextDecoder().decode(buf), bytes: buf };
};
const bearer = (key) => ({ authorization: "Bearer " + key });
const screens = async (q = "") => http("GET", `/map/screens?project=${P}${q}`, { key: ownerKey });
const CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";

smoke("screens: two screen nodes, a nav edge, a style and an html render filed through the MCP show on /map/screens", async () => {
  const w = await write(ownerKey, [
    node(HOME, "S8 Home", { surface: SF, lane: "start", step: 1, states: ["default", "loading"], wireframe: WF }),
    node(NEXT, "S8 Next", { surface: SF, lane: "start", step: 2, states: ["default"] }),
    { kind: "edge", op: "upsert", data: { from: HOME, to: NEXT, kind: "nav", label: "Next" } },
    { kind: "style", op: "upsert", data: { id: "s8-style", css: ".s8{color:#123;padding:4px}" } },
    { kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "live", format: "html", body: '<div class="s8">S8 Home</div>', style: "s8-style", width: 390, height: 844 } },
  ]);
  expect(!w.error && w.written === 5 && w.byKind.render === 1 && w.byKind.style === 1 && w.ledger, () => brief(w));
  const r = await screens(`&surface=${SF}`);
  const j = r.json || {};
  const home = (j.screens || []).find((x) => x.id === HOME) || {};
  const rd = (home.renders || [])[0] || {};
  expect(r.status === 200 && j.surface === SF && (j.surfaces || []).some((x) => x.key === SF && x.screens === 2) && j.screens.length === 2
    && home.lane === "start" && home.step === 1 && home.states.join() === "default,loading" && JSON.stringify(home.wireframe) === JSON.stringify(WF)
    && home.light === "grey" && home.checks.total === 0 && rd.state === "default" && rd.variant === "live" && rd.format === "html" && /^[0-9a-f]{64}$/.test(rd.hash)
    && rd.width === 390 && rd.style === "s8-style" && /^[0-9a-f]{64}$/.test(j.styles["s8-style"]) && j.lanes.map((l) => l.key).join() === "start"
    && j.edges.length === 1 && j.edges[0].from === HOME && j.edges[0].to === NEXT && j.edges[0].label === "Next", () => `${r.status} ${brief(j)}`);
  const t = await mcp(ownerKey, "map", { project: P, plane: "screens", surface: SF });
  expect(!t.isError && JSON.stringify(t.out) === JSON.stringify(j), () => `map {plane: "screens"} differs: ${brief(t.out)}`);
  const bad = await screens("&surface=nope");
  expect(bad.status === 404 && bad.json.error === "unknown_surface" && bad.json.surfaces.includes(SF), () => `?surface=nope: ${bad.status} ${brief(bad.json)}`);
  s.s8 = { hash: rd.hash, style: j.styles["s8-style"] };
  return `written 5 (2 nodes, 1 edge, 1 style, 1 render), 2 blobs; /map/screens ${SF}: 2 screens, the render ${rd.hash.slice(0, 12)}…, its wireframe, 1 nav edge; map {plane: screens} == GET; an unknown surface 404s`;
});

smoke("screens: GET /render/:hash serves the body sandboxed, its style inline and no script", async () => {
  const url = `/render/${s.s8.hash}?project=${P}&style=${s.s8.style}`;
  const r = await raw(url, bearer(ownerKey));
  expect(r.status === 200 && /^text\/html/.test(r.h("content-type")) && r.h("content-security-policy") === CSP && r.h("x-content-type-options") === "nosniff"
    && r.h("cache-control") === "private, max-age=31536000, immutable" && /^<!doctype html>/.test(r.text) && r.text.includes("<style>.s8{color:#123;padding:4px}</style>")
    && r.text.includes('<div class="s8">S8 Home</div>') && !/<script/i.test(r.text) && r.text.includes("Content-Security-Policy"), () => `${r.status} ${r.h("content-security-policy")} ${r.h("cache-control")} ${r.text.slice(0, 300)}`);
  // without the style's hash the answer is not pinned: it revalidates, and an unchanged one is a 304
  const loose = await raw(`/render/${s.s8.hash}?project=${P}`, bearer(ownerKey));
  const again = await raw(`/render/${s.s8.hash}?project=${P}`, { ...bearer(ownerKey), "if-none-match": loose.h("etag") });
  const head = await fetch(BASE + url, { method: "HEAD", headers: bearer(ownerKey) });
  expect(loose.status === 200 && loose.h("cache-control") === "private, no-cache" && loose.h("etag") && again.status === 304 && head.status === 200 && head.headers.get("content-security-policy") === CSP,
    () => `loose ${loose.status} ${loose.h("cache-control")} / 304? ${again.status} / HEAD ${head.status}`);
  return `200 text/html, CSP "${CSP}", nosniff, immutable with ?style=, no-cache + ETag (304) without; the style inline, no script`;
});

smoke("screens: the same body again writes nothing; a changed body writes one blob and one row", async () => {
  const same = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "live", format: "html", body: '<div class="s8">S8 Home</div>', style: "s8-style", width: 390, height: 844 } },
    { kind: "style", op: "upsert", data: { id: "s8-style", css: ".s8{color:#123;padding:4px}" } }]);
  expect(!same.error && same.written === 0 && same.unchanged === 2 && same.ledger === null, () => `same: ${brief(same)}`);
  const changed = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "live", format: "html", body: '<div class="s8">S8 Home, changed</div>' } }]);
  const rd = ((await screens(`&surface=${SF}`)).json.screens.find((x) => x.id === HOME).renders || [])[0] || {};
  expect(!changed.error && changed.written === 1 && changed.ledger && rd.hash !== s.s8.hash && rd.style === "s8-style" && rd.width === 390, () => `changed: ${brief(changed)} → ${brief(rd)}`);
  // the old body stays in R2 (bodies are never deleted) and is the frame's previous take (M6): still served, as the strip shows it
  const old = await raw(`/render/${s.s8.hash}?project=${P}`, bearer(ownerKey));
  const now = await raw(`/render/${rd.hash}?project=${P}&style=${s.s8.style}`, bearer(ownerKey));
  expect(old.status === 200 && old.text.includes(">S8 Home</div>") && now.status === 200 && now.text.includes("S8 Home, changed"), () => `old ${old.status}, new ${now.status}`);
  s.s8.hash = rd.hash;
  return "the same render and style again: written 0, unchanged 2, no ledger row, no blob; a new body: written 1, 1 blob, the merge keeps style and width; the old body is the previous take, still served";
});

smoke("screens: a script, an onclick, a javascript: URL and an external @import are stripped", async () => {
  const w = await write(ownerKey, [
    { kind: "style", op: "upsert", data: { id: "s8-evil", css: "@import url(https://evil.example/x.css); .e{background:url(https://evil.example/p.png);color:red}" } },
    { kind: "render", op: "upsert", data: { screen: NEXT, state: "default", variant: "live", format: "html", style: "s8-evil",
      body: '<p onclick="steal()">Next<script>alert(1)</script><a href="javascript:alert(2)">go</a><iframe src="https://evil.example"></iframe><img src="https://evil.example/t.png"></p>' } },
  ]);
  const st = Object.fromEntries((w.stripped || []).map((x) => [x.kind, x.removed]));
  expect(!w.error && w.written === 2 && st.style && st.style.imports === 1 && st.style.externalUrls === 1 && st.render && st.render.scripts === 1 && st.render.handlers === 1
    && st.render.jsUrls === 1 && st.render.frames === 1 && st.render.externalUrls === 1, () => brief(w));
  const rd = ((await screens(`&surface=${SF}`)).json.screens.find((x) => x.id === NEXT).renders || []).find((x) => x.variant === "live") || {};
  const styles = (await screens(`&surface=${SF}`)).json.styles;
  const r = await raw(`/render/${rd.hash}?project=${P}&style=${styles["s8-evil"]}`, bearer(ownerKey));
  expect(r.status === 200 && r.text.includes("<p>Next<a>go</a><img></p>") && !/<script|onclick|javascript:|@import|evil\.example|<iframe/i.test(r.text) && r.text.includes(".e{background:none;color:red}"),
    () => r.text.slice(0, 600));
  return `stripped: render ${brief(st.render)}, style ${brief(st.style)}; the served body holds none of them`;
});

smoke("screens: an over-limit body, and a call over 256 KB of bodies, are refused naming the op", async () => {
  const big = "<p>" + "x".repeat(200001) + "</p>";
  const w = await write(ownerKey, [{ kind: "style", op: "upsert", data: { id: "s8-ok", css: ".k{}" } },
    { kind: "render", op: "upsert", data: { screen: HOME, state: "loading", format: "html", body: big } }]);
  const e = (w.errors || [])[0] || {};
  expect(w.error === "invalid_ops" && e.index === 1 && e.error === "too_large" && /200,000/.test(e.note), () => brief(w));
  const part = "<p>" + "y".repeat(190000) + "</p>";
  const many = Array.from({ length: 2 }, (_, i) => ({ kind: "render", op: "upsert", data: { screen: HOME, state: "loading", variant: `v${i}`, format: "html", body: part } }));
  const c = await write(ownerKey, many);
  const ce = (c.errors || [])[0] || {};
  expect(c.error === "invalid_ops" && ce.index === 1 && ce.error === "too_large" && /256 KB/.test(ce.note), () => brief(c));
  const after = (await screens(`&surface=${SF}`)).json.screens.find((x) => x.id === HOME).renders.length;
  expect(after === 1, `renders after the refusals: ${after}`);
  return `an html body of ${big.length.toLocaleString("en-US")} bytes: too_large at op 1; two of ${part.length.toLocaleString("en-US")}: too_large at op 1 (256 KB a call); nothing written`;
});

smoke("screens: a person with no seat gets 404 on the render; a key in the URL is no credential; the member reads it", async () => {
  const url = `/render/${s.s8.hash}?project=${P}&style=${s.s8.style}`;
  const out = await raw(url, bearer(s.outsider.key));
  const outDefault = await raw(`/render/${s.s8.hash}`, bearer(s.outsider.key));
  const none = await raw(url);
  const inUrl = await raw(`${url}&k=${ownerKey}`);
  const mem = await raw(url, bearer(s.member.key));
  const memScreens = await http("GET", `/map/screens?project=${P}&surface=${SF}`, { key: s.member.key });
  const outScreens = await http("GET", `/map/screens?project=${P}`, { key: s.outsider.key });
  expect(out.status === 404 && outDefault.status === 404 && none.status === 401 && inUrl.status === 401 && mem.status === 200 && mem.text.includes("S8 Home, changed")
    && memScreens.status === 200 && memScreens.json.screens.length === 2 && outScreens.status === 403,
    () => `outsider ${out.status}/${outDefault.status}, none ${none.status}, ?k= ${inUrl.status}, member ${mem.status}, member screens ${memScreens.status}, outsider screens ${outScreens.status}`);
  return "the outsider: 404 (named project and default alike); no credential 401; ?k= 401; the member: 200; /map/screens: member 200, outsider 403 project_forbidden (the seam's own rule)";
});

// a 2x2 PNG (valid, 75 bytes)
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAGX8C/V8+/0LAAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));
smoke("screens: an image render names a banked artifact and serves its bytes; another's private artifact is refused", async () => {
  const bank = await fetch(`${BASE}/artifact?title=s8-shot&group=s8`, { method: "POST", headers: { ...bearer(ownerKey), "content-type": "image/png" }, body: PNG });
  const b = await bank.json();
  expect(bank.status === 200 && b.id && b.kind === "image", () => `POST /artifact: ${bank.status} ${brief(b)}`);
  const w = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: NEXT, state: "default", variant: "shot", format: "image", artifact: b.id, width: 2, height: 2 } }]);
  expect(!w.error && w.written === 1, () => brief(w));
  const rd = ((await screens(`&surface=${SF}`)).json.screens.find((x) => x.id === NEXT).renders || []).find((x) => x.variant === "shot") || {};
  const r = await raw(`/render/${rd.hash}?project=${P}`, bearer(ownerKey));
  expect(rd.format === "image" && rd.hash === b.hash && rd.bytes === PNG.length && r.status === 200 && r.h("content-type") === "image/png" && r.h("content-security-policy") === CSP
    && r.bytes.length === PNG.length && r.bytes.every((x, i) => x === PNG[i]) && r.h("cache-control") === "private, max-age=31536000, immutable", () => `${brief(rd)} → ${r.status} ${r.h("content-type")} ${r.bytes.length}`);
  const m = await write(s.member.key, [{ kind: "render", op: "upsert", data: { screen: NEXT, state: "default", variant: "theirs", format: "image", artifact: b.id } }]);
  const me = (m.errors || [])[0] || {};
  const ghost = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: NEXT, state: "default", variant: "ghost", format: "image", artifact: "no-such-artifact" } }]);
  expect(m.error === "invalid_ops" && me.error === "missing_artifact" && ghost.error === "invalid_ops" && ghost.errors[0].error === "missing_artifact", () => `member: ${brief(m)} · ghost: ${brief(ghost)}`);
  return `the PNG (${PNG.length} bytes) banked, filed as an image render (hash = the artifact's), served image/png byte for byte; the member naming the owner's artifact and an unknown id: missing_artifact`;
});

smoke("screens: a wireframe render serves the grammar and draws; read lists the index and gives the body's URL", async () => {
  const body = [{ kind: "header", label: "S8 Next" }, { kind: "input", label: "Amount" }, { kind: "button", label: "Send", emphasis: true }, { kind: "tabbar", items: 4 }];
  const w = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: NEXT, state: "default", variant: "wireframe", format: "wireframe", body } }]);
  expect(!w.error && w.written === 1, () => brief(w));
  const one = (await kread(ownerKey, { project: P, kind: "render", id: `${NEXT}|default|wireframe` })).out;
  const r = await raw(one.url, bearer(ownerKey));
  const svg = drawWireframe(JSON.parse(r.text), { width: 390, height: 844 });
  expect(one.item && one.item.format === "wireframe" && one.url === `/render/${one.item.hash}?project=${P}` && r.status === 200 && /^application\/json/.test(r.h("content-type"))
    && r.text === JSON.stringify(body) && /^<svg [^>]*viewBox="0 0 390 844"/.test(svg) && svg.includes(">Send</text>") && !svg.includes("data-invalid"), () => `${brief(one)} → ${r.status} ${r.text.slice(0, 200)}`);
  const list = (await kread(ownerKey, { project: P, kind: "render", screen: NEXT })).out;
  const rest = await http("GET", `/read?project=${P}&kind=render&screen=${encodeURIComponent(NEXT)}`, { key: ownerKey });
  const byDefault = (await kread(ownerKey, { project: P, kind: "render", id: HOME })).out;
  expect(list.items.length === 3 && list.items.every((x) => x.screen === NEXT && /^[0-9a-f]{64}$/.test(x.hash) && !("body" in x)) && JSON.stringify(rest.json.items) === JSON.stringify(list.items)
    && byDefault.error === "not_found", () => `${brief(list)} · ${rest.status} · ${brief(byDefault)}`);
  const bad = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: NEXT, variant: "bad", format: "wireframe", body: [{ kind: "carousel" }] } }]);
  expect(bad.error === "invalid_ops" && bad.errors[0].error === "bad_field" && /kind is one of/.test(bad.errors[0].note), () => brief(bad));
  return `the grammar served as JSON and drawn as an SVG (390 × 844); read {kind: "render", screen} lists ${list.items.length} index rows (no body) == GET /read?kind=render&screen=; an unknown block kind is bad_field`;
});

smoke("screens: removing the screen node removes its renders from the index", async () => {
  const w = await write(ownerKey, [{ kind: "node", op: "remove", data: { id: NEXT } }]);
  const list = (await kread(ownerKey, { project: P, kind: "render", screen: NEXT })).out;
  const j = (await screens(`&surface=${SF}`)).json;
  expect(!w.error && w.removed === 1 && list.items.length === 0 && j.screens.length === 1 && j.edges.length === 0, () => `${brief(w)} · ${brief(list)} · ${brief(j)}`);
  return "the node removed: its 3 renders and its nav edge are gone from the index; the surface shows 1 screen";
});

// ---- M6 · a screen's takes ----
const b64 = (u8) => Buffer.from(u8).toString("base64");
const PICS = [b64(PNG), TINY_PNG_BASE64, readFileSync(new URL("../walk/fixtures/screenshot-pricing.png", import.meta.url)).toString("base64")];
const signIn = async (email, key) => {
  const r = await http("POST", "/login", { body: { email, password: key, device: "smoke-s8" } });
  if (!r.json || !r.json.token) throw new Error(`POST /login ${email}: ${r.status} ${brief(r.json)}`);
  return `__Host-ar_session=${encodeURIComponent(r.json.token)}`;
};
const m6 = (t) => t.state === "default" && t.variant === "m6";
const nodeOf = async () => (await http("GET", `/map/node?ref=${encodeURIComponent(HOME)}&project=${P}`, { key: ownerKey })).json || {};
const frameHash = async () => (((await screens(`&surface=${SF}`)).json.screens.find((x) => x.id === HOME) || {}).renders || []).find((r) => r.variant === "m6");
smoke("screens · M6 takes: two pictures are two takes; the strip shows both on the inspector and the Screens view, the current marked", async () => {
  const a = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "m6", format: "image", body: PICS[0] } }]);
  const first = (await frameHash()) || {};
  const b = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "m6", format: "image", body: PICS[1] } }]);
  const second = (await frameHash()) || {};
  const takes = (await nodeOf()).takes || [];
  const mine = takes.filter(m6);
  expect(!a.error && !b.error && first.hash && second.hash && first.hash !== second.hash && mine.length === 2 && mine[0].hash === second.hash && mine[0].current && !mine[0].restorable
    && mine[1].hash === first.hash && !mine[1].current && mine[1].restorable && mine[0].take === 2 && mine[1].take === 1 && mine[0].by && mine[0].by.id && /^\/render\/[0-9a-f]{64}\?project=smoke$/.test(mine[1].url),
    () => `${brief(a)} · ${brief(b)} · ${brief(mine)}`);
  const insp = await html(`/map/node?ref=${encodeURIComponent(HOME)}&project=${P}`);
  const page = await html(`/map/screens?surface=${SF}&screen=${encodeURIComponent(HOME)}&project=${P}`);
  for (const [where, text] of [["the inspector", insp.text], ["the Screens view", page.text]]) {
    const strip = (text.match(/data-region="screen-takes"[\s\S]*?<\/ol>/) || [""])[0];
    expect(strip && (strip.match(/data-take="/g) || []).length === takes.length && /data-current/.test(strip) && strip.includes(`name="hash" value="${first.hash}"`) && /data-button="restore-take" data-door="POST \/render\/restore"/.test(strip)
      && !strip.includes(`name="hash" value="${second.hash}"`), () => `${where}: ${strip.slice(0, 400) || text.slice(0, 300)}`);
  }
  s.m6 = { first: first.hash, second: second.hash };
  return `takes 1 and 2 of the frame (default · m6); map {ref} lists ${takes.length} take(s), the newest current, the first restorable; the strip on the inspector and the Screens view, Restore on the first only`;
});

smoke("screens · A2 a wireframe take is drawn in the strip — from its own grammar, never a plain plate", async () => {
  const wfOf = (label) => [{ kind: "header", label }, { kind: "text", label: "body", lines: 2 }, { kind: "button", label: "Go" }];
  const a = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "a2wf", format: "wireframe", body: wfOf("Take one") } }]);
  const b = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "a2wf", format: "wireframe", body: wfOf("Take two") } }]);
  const insp = await html(`/map/node?ref=${encodeURIComponent(HOME)}&project=${P}`);
  const strip = (insp.text.match(/data-region="screen-takes"[\s\S]*?<\/ol>/) || [""])[0];
  const wfTakes = (strip.match(/data-format="wireframe"[\s\S]*?<\/li>/g) || []);
  expect(!a.error && !b.error && wfTakes.length >= 2 && wfTakes.every((li) => /class="mx-tk-wfd"[^>]*><svg/.test(li) && !/class="mx-tk-wf">Wireframe</.test(li))
    && /Take one/.test(strip) && /Take two/.test(strip),
    () => `${brief(a)} · ${brief(b)} · ${wfTakes.length} wireframe take(s): ${strip.slice(0, 300)}`);
  // the review's M3: the drawings are for the PAGE — the JSON and MCP reads of the same screen carry none (an agent's
  // answer stays small), while still listing every take
  const j = ((await nodeOf()).takes || []).filter((t) => t.variant === "a2wf");
  const mc = (((await mcp(ownerKey, "map", { project: P, ref: HOME })).out || {}).takes || []).filter((t) => t.variant === "a2wf");
  expect(j.length >= 2 && mc.length >= 2 && j.every((t) => t.svg === undefined) && mc.every((t) => t.svg === undefined),
    () => `the JSON (${j.length}) and MCP (${mc.length}) reads list the wireframe takes without a drawing: ${brief(j[0])}`);
  return `two wireframe takes (default · a2wf), each drawn in the strip from its own grammar ("Take one", "Take two"), no plate; the JSON and MCP reads carry no drawing`;
});

smoke("screens · M6 restore: the first through the door, then the second through the page's press; a previous take's body is served", async () => {
  const back = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "m6", hash: s.m6.first } }]);
  const now = (await frameHash()) || {};
  const mine = ((await nodeOf()).takes || []).filter(m6);
  expect(!back.error && back.written === 1 && back.ledger && now.hash === s.m6.first && now.format === "image" && mine.length === 3 && mine[0].take === 3 && mine[0].current && mine[0].hash === s.m6.first,
    () => `${brief(back)} → ${brief(now)} · ${brief(mine)}`);
  const prev = await raw(`/render/${s.m6.second}?project=${P}`, bearer(ownerKey));
  expect(prev.status === 200 && prev.h("content-type") === "image/png", () => `the previous take's body: ${prev.status} ${prev.h("content-type")}`);
  // the page: a signed-in browser's press, from the Screens view (its own confirm), sent back where it came from
  const people = ((await http("GET", "/control/people", { key: ownerKey })).json || {}).people || [];
  const cookie = await signIn(people.find((p) => p.you).email, ownerKey);
  const from = `/map/screens?surface=${SF}&screen=${encodeURIComponent(HOME)}&project=${P}`;
  // sprint 7, 7.4: the browser is on the page under its org's address, and its press goes there (lib.mjs sessionPath)
  const press = await fetch(BASE + await sessionPath(cookie, "/render/restore"), { method: "POST", redirect: "manual", headers: { cookie, accept: "text/html", origin: BASE, referer: BASE + await sessionPath(cookie, from), "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ project: P, screen: HOME, state: "default", variant: "m6", hash: s.m6.second }).toString() });
  const after = (await frameHash()) || {};
  expect(press.status === 303 && (await unbased(press.headers.get("location") || "")) === from && after.hash === s.m6.second && ((await nodeOf()).takes || []).filter(m6)[0].take === 4,
    () => `the press: ${press.status} ${press.headers.get("location")} → ${brief(after)}`);
  return `the door: written 1, the frame's newest is the first again (take 3); its previous body served (200 image/png); the page's press: 303 back to the Screens view, the second is take 4 and current`;
});

smoke("screens · M6 refusals: a hash another project holds is unknown_render (door and press); a Partner is partner_refused", async () => {
  const Q = "smoke-b";
  const other = await kwrite(ownerKey, { project: Q, ops: [{ kind: "node", op: "upsert", data: { id: "screen:s8-b", type: "screen", name: "S8 B", data: { surface: "s8-b" } } },
    { kind: "render", op: "upsert", data: { screen: "screen:s8-b", format: "image", body: PICS[2] } }] });
  const theirs = ((((await http("GET", `/map/screens?project=${Q}&surface=s8-b`, { key: ownerKey })).json || {}).screens || [])[0] || { renders: [] }).renders[0] || {};
  const door = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "m6", hash: theirs.hash } }]);
  const rest = await http("POST", "/render/restore", { key: ownerKey, body: { project: P, screen: HOME, state: "default", variant: "m6", hash: theirs.hash, confirm: true } });
  expect(!other.isError && theirs.hash && door.error === "invalid_ops" && door.errors[0].error === "unknown_render" && rest.status === 404 && rest.json.error === "unknown_render",
    () => `${brief(other.out)} · door ${brief(door)} · POST ${rest.status} ${brief(rest.json)}`);
  const pa = await write(s.partner.key, [{ kind: "render", op: "upsert", data: { screen: HOME, state: "default", variant: "m6", hash: s.m6.first } }]);
  const pr = await http("POST", "/render/restore", { key: s.partner.key, body: { project: P, screen: HOME, state: "default", variant: "m6", hash: s.m6.first, confirm: true } });
  const still = (await frameHash()) || {};
  expect(pa.error === "invalid_ops" && pa.errors[0].error === "partner_refused" && pr.status === 403 && pr.json.error === "partner_refused" && still.hash === s.m6.second,
    () => `partner door ${brief(pa)} · POST ${pr.status} ${brief(pr.json)} · frame ${brief(still)}`);
  const pv = await http("POST", "/render/restore", { key: ownerKey, body: { project: P, screen: HOME, state: "default", variant: "m6", hash: s.m6.first } });
  expect(pv.status === 200 && pv.json.preview === true && ((await frameHash()) || {}).hash === s.m6.second, () => `a script with no confirm: ${pv.status} ${brief(pv.json)}`);
  return "smoke-b's picture named in smoke: unknown_render at the door (invalid_ops) and 404 on POST /render/restore; the Partner: partner_refused (door) and 403 (press); a script with no confirm is answered the preview; the frame unchanged";
});
