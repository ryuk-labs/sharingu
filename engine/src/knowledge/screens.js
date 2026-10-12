// src/knowledge/screens.js — a project's screens, the standard way (docs/plan/ARCHITECTURE.md §11): the Screens view's ONE
// read (GET /map/screens, the map {plane: "screens"} tool) and a render's body (GET /render/:hash). Everything here is generic: a
// project differs only by its data, filed through preview then file (screen nodes, nav edges, renders, styles).
//
// readScreens(env, project, surface) — ONE surface (app) of the project at a time, in three round trips:
//   A. SCREENS_SURFACES_SQL · SCREENS_COUNTS_SQL · SCREENS_LANES_SQL · SCREENS_STYLES_SQL (one batch): the surface nodes,
//      the screens per surface (a covering scan of idx_k_nodes_screen_surface: one index row per screen of the project),
//      the lane nodes and the project's styles (their hashes);
//   B. SCREENS_OF_SQL: the surface's screen nodes (idx_k_nodes_screen_surface, migrate-046) with their lights (k_node_lights,
//      migrate-043, one primary-key probe each; a screen no check names reads nothing there), the standard fields projected in
//      SQL (lane, step, states, wireframe), never the node's whole data;
//   C. SCREENS_EDGES_SQL and SCREENS_RENDERS_SQL over those screens' ids, bound (90 a statement: D1 binds at most 100): the
//      edges OUT of each screen (the k_edges primary key's prefix; nav edges to a screen of the same surface are kept) and
//      each screen's render index as ONE row (k_screen_renders, migrate-046: the screen's renders as a JSON array, kept by
//      triggers on k_renders; one row per screen, never one per render). No body is read: a body is fetched by the view,
//      lazily, from GET /render/:hash.
// screenTakes(env, project, screen) — M6: a screen's last takes (migrate-065), the strip on its inspector (src/mapnode.js).
// serveRender(request, env, url, path) — GET /render/:hash: one render's body (or a previous take's) from R2, seat-checked like every knowledge
// read (src/project.js resolveProject: the caller's seats, the owner any active project), served ONLY as a sandbox.
import { db } from "../data.js";
import { resolveAny, seatsOnce } from "../core.js";
import { resolveProject, projectOf, projectSlug } from "../project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { json, isD1Quota, signInOr401 } from "../util.js";
import { countsOfRow, lightOf } from "./checks.js";
import { store, renderKey } from "../storage.js";   // sprint 6, 6.4: a body lies under the reader's org (the project is resolved in it)
import { renderDocument, RENDER_CSP, RENDER_CACHE, SHA_RE, IMAGE_TYPES, SVG_IMAGE_NOTE } from "../render.js";
import { planKnowledgeCall, writeKnowledge } from "./write.js";
import { previewLine } from "./schema.js";
import { roleClassOf } from "../hats.js";

export const SCREENS_SURFACES_SQL = "SELECT id, name, json_extract(data, '$.name') AS full FROM k_nodes WHERE project = ?1 AND type = 'surface' ORDER BY rowid";
// D1b item 20: a screen may belong to more than one app — data.surface a LIST ("assistant" and "app" share two of siru's
// screens). A one-app screen is read as before (the covering scan of idx_k_nodes_screen_surface); a screen naming a list is
// read in a second arm off migrate-057's partial index idx_k_nodes_screen_multi (only those screens), each app counted. The
// first arm's group for a list (its JSON text, "[...") is dropped by the reader.
export const SCREENS_COUNTS_SQL = "SELECT json_extract(data, '$.surface') AS surface, COUNT(*) AS n, MIN(rowid) AS first FROM k_nodes " +
  "WHERE project = ?1 AND type = 'screen' GROUP BY json_extract(data, '$.surface') " +
  "UNION ALL SELECT j.value AS surface, COUNT(*) AS n, MIN(n.rowid) AS first FROM k_nodes n, json_each(n.data, '$.surface') j " +
  "WHERE n.project = ?1 AND +n.type = 'screen' AND json_type(n.data, '$.surface') = 'array' GROUP BY j.value";
export const SCREENS_LANES_SQL = "SELECT id, name, json_extract(data, '$.name') AS full FROM k_nodes WHERE project = ?1 AND type = 'lane' ORDER BY rowid";
export const SCREENS_STYLES_SQL = "SELECT id, hash FROM k_styles WHERE project = ?1";
// ?2 is the surface's key, or null for the screens that name none (IS: one index probe either way)
const SCREENS_OF_COLS = "SELECT n.rowid AS rid, n.id, n.name, n.status, json_extract(n.data, '$.name') AS full, json_extract(n.data, '$.status') AS dstatus, " +
  "json_extract(n.data, '$.lane') AS lane, json_extract(n.data, '$.step') AS step, json_extract(n.data, '$.states') AS states, " +
  "json_extract(n.data, '$.wireframe') AS wireframe, l.green, l.red, l.amber, l.grey, z.stale " +
  "FROM k_nodes n LEFT JOIN k_node_lights l ON l.project = n.project AND l.node_id = n.id LEFT JOIN k_node_stale z ON z.project = n.project AND z.node_id = n.id ";
// the surface's screens: the ones naming it alone (the index probe, as before), then the ones naming it in a list (D1b item 20,
// the partial index of list screens only), in filing order
export const SCREENS_OF_SQL = SCREENS_OF_COLS + "WHERE n.project = ?1 AND n.type = 'screen' AND json_extract(n.data, '$.surface') IS ?2 " +
  "UNION ALL " + SCREENS_OF_COLS + "WHERE n.project = ?1 AND +n.type = 'screen' AND json_type(n.data, '$.surface') = 'array' " +
  "AND ?2 IN (SELECT value FROM json_each(n.data, '$.surface')) ORDER BY rid";
export const IDS_CHUNK = 90;
const qs = (n) => Array.from({ length: n }, (_, i) => "?" + (i + 2)).join(", ");
// +e.kind: the k_edges primary key (project, from_id …) answers, never idx_k_edges_kind (every nav edge of the project)
export const SCREENS_EDGES_SQL = (n) => `SELECT e.from_id, e.to_id, e.label FROM k_edges e WHERE e.project = ?1 AND e.from_id IN (${qs(n)}) AND +e.kind = 'nav'`;
// a screen's renders: [[state, variant, format, hash, bytes, width, height, style], …] (k_screen_renders, migrate-046)
export const SCREENS_RENDERS_SQL = (n) => `SELECT screen, renders FROM k_screen_renders WHERE project = ?1 AND screen IN (${qs(n)})`;
// GET /render/:hash: the render a hash names in the project (idx_k_renders_hash), or a previous take of a frame (M6,
// migrate-065: idx_k_screen_takes_hash; a replaced body is still the project's), the one whose style's hash is ?3 first
export const RENDER_BODY_SQL = "SELECT x.format, x.style, s.hash AS style_hash FROM (SELECT r.format, r.style FROM k_renders r WHERE r.project = ?1 AND r.hash = ?2 " +
  "UNION ALL SELECT t.format, t.style FROM k_screen_takes t WHERE t.project = ?1 AND t.hash = ?2) x LEFT JOIN k_styles s ON s.project = ?1 AND s.id = x.style " +
  "ORDER BY (s.hash IS ?3) DESC LIMIT 1";
// M6 · a screen's takes (migrate-065): the last TAKES_MAX bodies its frames have held, newest first, ONE statement on
// idx_k_screen_takes_screen (ties in the order filed), each with who filed it (people, by its key), its style's current hash (the
// body's URL) and its frame's index entry (k_renders, by its key: which take is current)
export const TAKES_MAX = 6;
export const SCREEN_TAKES_SQL = "SELECT t.state, t.variant, t.format, t.take, t.hash, t.bytes, t.width, t.height, t.style, t.filed_at, t.filed_by, p.name AS by_name, " +
  "s.hash AS style_hash, r.hash AS cur_hash, r.format AS cur_format FROM k_screen_takes t LEFT JOIN people p ON p.id = t.filed_by " +
  "LEFT JOIN k_styles s ON s.project = t.project AND s.id = t.style " +
  "LEFT JOIN k_renders r ON r.project = t.project AND r.screen = t.screen AND r.state = t.state AND r.variant = t.variant " +
  `WHERE t.project = ?1 AND t.screen = ?2 ORDER BY t.filed_at DESC, t.rowid DESC LIMIT ${TAKES_MAX}`;

const parse = (s) => { if (s == null || s === "") return null; try { return JSON.parse(s); } catch { return null; } };
const after = (prefix, id) => (String(id).startsWith(prefix) ? String(id).slice(prefix.length) : String(id));
const text = (v) => (v == null ? null : String(v));

// readScreens(env, project, surface) -> { status, body }: 200 { project, surfaces: [{ key, name, screens }], surface,
// lanes: [{ key, name }], screens: [{ id, name, lane, step, status, states, light, checks: { total, graded, passed, failed }, stale?
// (sprint 3 B4: how many of its checks were graded before its last change, k_node_stale),
// renders: [{ state, variant, format, hash, bytes, width, height, style }], wireframe }], edges: [{ from, to, label }],
// styles: { <id>: <hash> } } · 404 unknown_surface (a surface the project's screens do not name) · 422 project_required.
// A surface's key is its node id after "surface:" (or a key the screens name with no surface node); the screens that name
// no surface are the surface "" (named "Other screens"). With no surface asked, the first surface that has screens.
// A render's body: GET /render/<hash>?project=<project>&style=<styles[render.style]> (src/render.js renderUrl).
export async function readScreens(env, project, want = null) {
  if (!project) return { status: 422, body: { error: "project_required", note: "Add `project`: one of your projects (`whoami` lists them)." } };
  const [sf, ct, ln, st] = await db(env).batch([SCREENS_SURFACES_SQL, SCREENS_COUNTS_SQL, SCREENS_LANES_SQL, SCREENS_STYLES_SQL].map((q) => db(env).prepare(q).bind(project)));
  // a list screen's first-arm group is its JSON text ("[..."): its apps are counted in the second arm (D1b item 20)
  const counts = new Map();
  for (const r of (ct && ct.results) || []) {
    const k = r.surface == null ? "" : String(r.surface);
    if (k.startsWith("[")) continue;
    const c = counts.get(k) || { n: 0, first: Infinity };
    counts.set(k, { n: c.n + (Number(r.n) || 0), first: Math.min(c.first, Number(r.first) || 0) });
  }
  const surfaces = [];
  for (const r of (sf && sf.results) || []) {
    const key = after("surface:", r.id);
    if (surfaces.some((x) => x.key === key)) continue;
    surfaces.push({ key, name: text(r.full) || text(r.name) || key, screens: (counts.get(key) || { n: 0 }).n });
  }
  // a surface the screens name with no surface node of its own, in the order its first screen was filed; then the screens
  // that name none
  for (const [key, c] of [...counts].filter(([k]) => k !== "" && !surfaces.some((x) => x.key === k)).sort((a, b) => a[1].first - b[1].first)) surfaces.push({ key, name: key, screens: c.n });
  if (counts.has("")) surfaces.push({ key: "", name: "Other screens", screens: counts.get("").n });
  const styles = Object.fromEntries(((st && st.results) || []).map((r) => [String(r.id), String(r.hash)]));
  const asked = want == null ? null : String(want).slice(0, 120);
  const pick = asked != null ? surfaces.find((x) => x.key === asked) : surfaces.find((x) => x.screens > 0) || surfaces[0] || null;
  if (asked != null && !pick) {
    return { status: 404, body: { error: "unknown_surface", project, surface: asked, surfaces: surfaces.map((x) => x.key),
      note: `No surface "${asked}" in ${projectSlug(project)}: send one of the surfaces listed (a screen node names its surface in data.surface).` } };
  }
  const empty = { project, surfaces, surface: pick ? pick.key : null, lanes: [], screens: [], edges: [], styles };
  if (!pick || !pick.screens) {
    return { status: 200, body: { ...empty, ...(surfaces.length ? {} : { note: 'No screen is filed for this project yet: file one through preview then file, an item {kind: "node", op: "upsert", data: {id: "screen:home", type: "screen", name: "Home", data: {surface: "mobile", lane: "start", step: 1, states: ["default"]}}}, then its renders (kind "render").' }) } };
  }
  // B · the surface's screens
  const rows = (await db(env).prepare(SCREENS_OF_SQL).bind(project, pick.key === "" ? null : pick.key).all()).results || [];
  const screens = rows.map((r) => {
    const checks = r.green != null || r.grey != null ? countsOfRow(r) : { total: 0, graded: 0, passed: 0, failed: 0 };
    const states = parse(r.states);
    const wf = parse(r.wireframe);
    const step = r.step == null ? null : Number(r.step);
    return { id: String(r.id), name: text(r.full) || text(r.name) || after("screen:", r.id), lane: text(r.lane), step: Number.isFinite(step) ? step : null,
      status: text(r.status) || text(r.dstatus), states: Array.isArray(states) ? states.filter((x) => typeof x === "string") : [],
      light: lightOf(checks), checks, ...(Number(r.stale) > 0 ? { stale: Number(r.stale) } : {}), renders: [], wireframe: Array.isArray(wf) ? wf : null };
  });
  // C · their edges and renders, by their ids
  const byId = new Map(screens.map((x) => [x.id, x]));
  const ids = [...byId.keys()];
  const stmts = [];
  for (let k = 0; k < ids.length; k += IDS_CHUNK) {
    const part = ids.slice(k, k + IDS_CHUNK);
    stmts.push(["edges", db(env).prepare(SCREENS_EDGES_SQL(part.length)).bind(project, ...part)], ["renders", db(env).prepare(SCREENS_RENDERS_SQL(part.length)).bind(project, ...part)]);
  }
  const res = stmts.length ? await db(env).batch(stmts.map((x) => x[1])) : [];
  const edges = [];
  stmts.forEach(([what], i) => {
    for (const r of (res[i] && res[i].results) || []) {
      if (what === "edges") { if (byId.has(String(r.to_id))) edges.push({ from: String(r.from_id), to: String(r.to_id), label: text(r.label) }); continue; }
      const s = byId.get(String(r.screen));
      const list = parse(r.renders);
      if (s && Array.isArray(list)) {
        for (const x of list) if (Array.isArray(x)) s.renders.push({ state: String(x[0] ?? ""), variant: String(x[1] ?? ""), format: String(x[2]), hash: String(x[3]),
          bytes: Number(x[4]) || 0, width: x[5] == null ? null : Number(x[5]), height: x[6] == null ? null : Number(x[6]), style: text(x[7]) });
        s.renders.sort((a, b) => (a.state < b.state ? -1 : a.state > b.state ? 1 : a.variant < b.variant ? -1 : a.variant > b.variant ? 1 : 0));
      }
    }
  });
  // the surface's lanes: the lane nodes its screens name, in their filing order, then any lane named with no node of its own
  const laneNodes = ((ln && ln.results) || []).map((r) => ({ key: after("lane:", r.id), name: text(r.full) || text(r.name) }));
  const used = new Set(screens.map((x) => x.lane).filter((x) => x != null));
  const lanes = laneNodes.filter((l) => used.has(l.key)).map((l) => ({ key: l.key, name: l.name || l.key }));
  for (const k of used) if (!lanes.some((l) => l.key === k)) lanes.push({ key: k, name: k });
  return { status: 200, body: { ...empty, lanes, screens, edges } };
}

// screenTakes(env, project, screen) -> [{ state, variant, format, take, hash, bytes, width, height, style, styleHash, at, by:
// { id, name }, current, held }], newest first, at most TAKES_MAX (SCREEN_TAKES_SQL, one statement). current: the frame's newest
// take while its index entry holds it (a removed render has none); held: its body is the frame's current one (the newest take
// or an older take of the same body), so restoring it changes nothing
export async function screenTakes(env, project, screen) {
  const rows = (await db(env).prepare(SCREEN_TAKES_SQL).bind(project, screen).all()).results || [];
  const seen = new Set();
  return rows.map((r) => {
    const frame = `${r.state}|${r.variant}`;
    const held = r.cur_hash != null && r.cur_hash === r.hash && r.cur_format === r.format;
    const current = held && !seen.has(frame);
    seen.add(frame);
    return { state: String(r.state ?? ""), variant: String(r.variant ?? ""), format: String(r.format), take: Number(r.take) || 1, hash: String(r.hash),
      bytes: Number(r.bytes) || 0, width: r.width == null ? null : Number(r.width), height: r.height == null ? null : Number(r.height), style: text(r.style),
      styleHash: text(r.style_hash), at: text(r.filed_at), by: { id: text(r.filed_by), name: text(r.by_name) }, current, held };
  });
}

// restoreAnswer(env, person, a, { press, via }) — M6 · the Restore press (POST /render/restore, src/index.js): ONE render upsert
// naming a take's hash and no body, {kind: "render", op: "upsert", data: {screen, state, variant, hash}}, through the knowledge
// write door as the person (src/knowledge/write.js writeKnowledge: the project rule, prepareTakes, the plan, ONE ledger row).
// It is exactly the item an agent files through preview then file; this is its twin for a press. a: {project?, screen, state?,
// variant?, hash, confirm?, eval?}.
//   · authority: a Partner (the role CLASS, src/hats.js roleClassOf) is refused 403 partner_refused before anything is read, as
//     Publish, Equip and Regrade refuse one; the project is the write's own rule (a seat, the owner any active project);
//   · a press in a signed-in browser is the person's confirm (they pressed Restore under the picture) and files at once; any
//     other caller is answered the preview first ({preview: true, project, item, line}) and files with confirm: true;
//   · the one op's refusal is the answer: 404 unknown_render (a hash this project's takes do not hold), 422 for the rest.
// -> { http, project, written, ledger, item } | { http, preview: true, … } | { http, error, note }
const confirmed = (v) => v === true || v === "true" || v === "1" || v === 1;
export async function restoreAnswer(env, person, a = {}, { press = false, via = "http" } = {}) {
  if (!person) return { http: 401, error: "unauthorized" };
  if (roleClassOf(person.role) === "partner") return { http: 403, error: "partner_refused", note: "A Partner works on the projects they are seated on; restoring a previous take of a screen is a member's press." };   // authority
  const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
  if (!str(a.screen) || !SHA_RE.test(str(a.hash))) return { http: 422, error: "bad_field", note: "Send screen (a screen node's id) and hash (the sha256 of one of its takes: map {ref: \"screen:<id>\"} lists them), with state and variant as the frame's." };
  const item = { kind: "render", op: "upsert", data: { screen: str(a.screen), state: str(a.state), variant: str(a.variant), hash: str(a.hash) } };
  const args = { ...(a.project !== undefined ? { project: a.project } : {}), ops: [item], ...(confirmed(a.eval) ? { eval: true } : {}) };
  const one = (e, project) => ({ http: e.error === "unknown_render" ? 404 : e.error === "partner_refused" ? 403 : 422, error: e.error, note: e.note, project });
  if (!press && !confirmed(a.confirm)) {
    const pl = await planKnowledgeCall(person, args, env);
    if (pl.error) return { http: pl.error === "project_forbidden" ? 403 : 422, ...pl };
    if (pl.plan.errors.length) return one(pl.plan.errors[0], pl.project);
    const step = pl.plan.steps[0];
    return { http: 200, preview: true, project: pl.project, item, line: previewLine("render", item.data, { bytes: step && step.row ? step.row.bytes : null }),
      ...(step && step.unchanged ? { unchanged: true } : {}), next: "Send the same body with confirm: true to file it (or file the item through preview then file)." };
  }
  const w = await writeKnowledge(person, args, env, { via });
  if (w.error === "invalid_ops" && Array.isArray(w.errors) && w.errors[0]) return one(w.errors[0], w.project);
  if (w.error) return { http: w.error === "project_forbidden" ? 403 : 422, ...w };
  return { http: 200, ...w, item };
}

// screensAnswer(env, surface) -> readScreens on the project the door scoped (the seam's ?project=, callTool's `project`)
export async function screensAnswer(env, surface) {
  try { return await readScreens(env, await projectOf(env), surface); }
  catch (e) { if (isD1Quota(e)) throw e; return { status: 503, body: { error: "unreadable", note: "The project's screens could not be read." } }; }
}

// serveRender(request, env, url, path) — GET (and HEAD) /render/<sha256>?project=<key>[&style=<the style's sha256>]
//   · who: a session cookie or a bearer token (a read-only one too: it is a read), never a key in the URL; none -> 401;
//   · the project: resolveProject's rule, the one every knowledge read uses (a seat; the owner any active project; none named:
//     the caller's own default); a project the caller may not read answers 404, exactly as a hash it does not hold does,
//     so the route never says whether a project or a render exists;
//   · the answer, by the render's format: html -> a complete document (src/render.js renderDocument: the fragment and its
//     style's css inline); wireframe -> the grammar as JSON; image -> the picture's bytes and type. Every answer carries
//     Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: (no script runs, nothing
//     is fetched, the document's origin is opaque), X-Content-Type-Options: nosniff and Referrer-Policy: no-referrer, and is
//     meant only for <iframe sandbox> (or an <img> for an image);
//   · caching: when the URL names everything the answer holds (a render with no style, or ?style= its style's current
//     hash) it is Cache-Control: private, max-age=31536000, immutable; otherwise private, no-cache with an ETag, so a
//     changed style is never served stale (a 304 on If-None-Match).
export async function serveRender(request, env, url, path) {
  const head = request.method === "HEAD";
  const notFound = () => json({ error: "not_found", note: "No such render here: read {kind: \"render\"} lists the project's renders, each with its body's URL when read by id." }, 404, { "cache-control": "private, no-store" });
  const hash = path.slice("/render/".length);
  // D1b item 1: who is asking comes first — a signed-out caller is answered the same for every hash, well-formed or not
  const person = await resolveAny(request, env);
  if (!person) return signInOr401(request, url, undefined, { error: "auth_required", note: "Sign in, or send Authorization: Bearer <your key>." });
  if (!SHA_RE.test(hash)) return notFound();
  const scope = await resolveProject(person, url.searchParams.get("project") ?? null, await seatsOnce(env, person.id), env);
  if (scope.error || !scope.project) return notFound();
  const project = scope.project;
  const wantStyle = url.searchParams.get("style");
  const row = await db(env).prepare(RENDER_BODY_SQL).bind(project, hash, wantStyle && SHA_RE.test(wantStyle) ? wantStyle : null).first();
  if (!row) return notFound();
  const styleHash = row.format === "html" && row.style_hash ? String(row.style_hash) : null;
  const exact = styleHash ? wantStyle === styleHash : true;
  const etag = `"${hash.slice(0, 32)}.${styleHash ? styleHash.slice(0, 32) : "none"}"`;
  const headers = {
    "content-security-policy": RENDER_CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin", etag,
    "cache-control": exact ? RENDER_CACHE : "private, no-cache",
  };
  if (!exact && (request.headers.get("if-none-match") || "") === etag) return new Response(null, { status: 304, headers });
  const obj = await store(env).get(renderKey(project, hash));
  if (!obj) return json({ error: "blob_missing", note: "The render is indexed but its body is not stored: file it again (an item of kind render with its body, through preview then file)." }, 410, { "cache-control": "private, no-store" });
  if (row.format === "image") {
    // review fix 5 (sprint 2): only a raster picture is served (src/render.js IMAGE_TYPES); a body stored before as an SVG
    // (or under any other type) is refused, never served from this origin
    const type = String((obj.httpMetadata && obj.httpMetadata.contentType) || "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.includes(type)) return json({ error: "unsupported_image", note: SVG_IMAGE_NOTE + " File it again." }, 410, { "cache-control": "private, no-store" });
    return new Response(head ? null : await obj.arrayBuffer(), { headers: { ...headers, "content-type": type } });
  }
  if (row.format === "wireframe") return new Response(head ? null : await obj.text(), { headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
  let css = null;
  if (styleHash) { const so = await store(env).get(renderKey(project, styleHash)); css = so ? await so.text() : null; }
  return new Response(head ? null : renderDocument(await obj.text(), css), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
}

