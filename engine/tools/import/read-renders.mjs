// engine/tools/import/read-renders.mjs — the readers of a project's SCREEN RENDERS, one per source, all READ-ONLY. They
// attach `src.renders` to the source object read.mjs built (attachRenders), for import/renders.mjs to map onto the ONE
// standard (docs/plan/ARCHITECTURE.md §11: screen nodes, kind render, kind style). Nothing source-specific lives in the
// engine: every source's own shape is read and mapped here.
//   board html (saruspay's ~/Desktop/"SarusPay Board.html", bunny's board/board.html): a self-contained board file carrying
//     two gzip+base64 blobs — MODEL (the board's model.json: screens with their pid, wireframes per state, layout fields)
//     and PAYLOAD ({css: {<family>: css}, html: {<pid>: fragment}, meta: {<pid>: {css, w, h, live, proposed, wireframe,
//     ref, shot}}}) — and the board app's own CSS constants (WFVARS, STATIC). The board's MODEL supersedes the served
//     model's screens, nav edges and lanes when it is a NEWER build (the renders and their states must be the same build's).
//   wireframes (sharingu: <brain>/source/board/sources/wireframe.json): the spec's screens (regions, buttons); the board
//     model's screens carry the same regions (model.json, fromWireframe).
//   board layouts (bunny: board/spec/wireframes.json): a structured wireframe per screen (viewport, shell, regions with
//     their items) — the source of the screens' wireframe grammar.
//   atlas shots (siru: the bank's serve/lib/atlas/atlas.json + tools/atlas/seed-manifest.json, the shots' bytes in the
//     seed build files siru-app-screens-build42.html and siru-assistant-screens-build41.html beside the bank or on the
//     Desktop): one screenshot per mapped canon screen, as a data:image/webp.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { homedir } from "node:os";
import { modelView } from "./read-board.mjs";

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const arr = (v) => (Array.isArray(v) ? v : []);

// readBoardHtml(file) -> { from, built, model, payload, consts: { wfvars, static } }
export function readBoardHtml(file) {
  const path = resolve(file);
  const s = readFileSync(path, "utf8");
  const blob = (ids) => {
    for (const id of ids) {
      const m = new RegExp(`<script[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(s);
      if (m) return JSON.parse(gunzipSync(Buffer.from(m[1].replace(/\s+/g, ""), "base64")).toString("utf8"));
    }
    return null;
  };
  const model = blob(["model", "d-model"]), payload = blob(["payload", "d-payload"]);
  if (!model || !payload || !payload.html || !payload.meta) throw new Error(`${path}: no MODEL and PAYLOAD blobs (a board html carries <script id="model"> and <script id="payload">, or d-model and d-payload)`);
  // the board app's own constants: the wireframe ink variables (written for a shadow root's :host) and the rule that
  // freezes the screens' entrance animations on their last frame
  const wf = /var\s+WFVARS\s*=\s*"([^"]*)"/.exec(s);
  const st = /var\s+STATIC\s*=\s*((?:"[^"]*"\s*\+?\s*)+);/.exec(s);
  const consts = { wfvars: wf ? wf[1].replace(/:host\b/g, ":root") : "", static: st ? [...st[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join("") : "" };
  const v = model.version || {};
  return { from: path, built: typeof v.builtAt === "string" ? v.builtAt : null, model, payload, consts };
}

// readSiruShots(bankDir, dirs) -> { from, shots: [{ screen, app, shot, alt, mime, b64, bytes, width, height }], missing } | null
// The atlas maps a canon screen to ONE shot (atlas.json); the seed manifest says where the shot sits in its build file
// (app, section, index: the n-th <img> of that <section>, or of the whole file for a flat build); the build files hold
// the shots as data:image URIs. A build file is looked for in `dirs` (the --renders directory, then the bank's parent,
// then ~/Desktop): the seed script's own file names.
const SEED_FILES = { "siru-app": "siru-app-screens-build42.html", "siru-assistant": "siru-assistant-screens-build41.html" };
export function readSiruShots(bankDir, extraDirs = []) {
  const dir = resolve(bankDir);
  const atlasPath = join(dir, "serve", "lib", "atlas", "atlas.json"), manPath = join(dir, "tools", "atlas", "seed-manifest.json");
  if (!isFile(atlasPath) || !isFile(manPath)) return null;
  const atlas = JSON.parse(readFileSync(atlasPath, "utf8")), man = JSON.parse(readFileSync(manPath, "utf8"));
  const dirs = [...extraDirs.filter(Boolean).map((d) => resolve(d)), dirname(dir), join(homedir(), "Desktop")].filter(isDir);
  const builds = {}, missing = [];
  for (const [app, name] of Object.entries(SEED_FILES)) {
    const found = dirs.map((d) => join(d, name)).find(isFile);
    if (!found) { missing.push(name); continue; }
    builds[app] = parseShotBuild(readFileSync(found, "utf8"), found);
  }
  const shots = [];
  for (const [app, a] of Object.entries(atlas.apps || {})) for (const b of arr(a.bands)) for (const sc of arr(b.screens)) {
    const m = sc.shot && man[sc.shot];
    const build = m && builds[m.app || app];
    if (!build) continue;
    const list = build.sections ? build.bySection.get(m.section) : build.all;
    const img = list && list[Number(m.index) - 1];
    if (!img) continue;
    shots.push({ screen: String(sc.id), app, shot: sc.shot, alt: m.alt || sc.name || "", ...img });
  }
  return { from: `${atlasPath} + ${manPath} + ${Object.values(builds).map((x) => x.from).join(" + ")}`, shots, missing, builds: Object.keys(builds) };
}
// parseShotBuild(html) -> { from, sections, bySection: Map(section -> [img]), all: [img] }; img { mime, b64, bytes, width, height }
function parseShotBuild(html, from) {
  const secs = [...html.matchAll(/<section[^>]*\bid="([^"]+)"[^>]*>/g)].map((m) => ({ id: m[1], at: m.index }));
  const imgs = [...html.matchAll(/<img\b[^>]*\bsrc="data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)"[^>]*>/g)].map((m) => {
    const bytes = Buffer.from(m[2], "base64");
    return { at: m.index, mime: m[1], b64: m[2], bytes: bytes.length, ...imageSize(bytes, m[1]) };
  });
  const bySection = new Map();
  for (const img of imgs) {
    const sec = secs.filter((x) => x.at < img.at).pop();
    if (!sec) continue;
    if (!bySection.has(sec.id)) bySection.set(sec.id, []);
    bySection.get(sec.id).push(img);
  }
  return { from, sections: secs.length > 0, bySection, all: imgs };
}
// imageSize(bytes, mime) -> { width, height } from a webp's or png's header, or nulls
export function imageSize(b, mime) {
  try {
    if (mime === "image/png" && b.length > 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === "image/webp" && b.length > 30 && b.toString("ascii", 0, 4) === "RIFF") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
      if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
  } catch { /* an unreadable header: no size */ }
  return { width: null, height: null };
}

// attachRenders(src, { renders }) — the renders source of a read project, by its layout (none found: nothing attached).
// renders: --renders <file or dir> (a board html for the pack and board layouts; a directory holding the seed builds for
// the bank layout).
export function attachRenders(src, opts = {}) {
  const want = opts.renders ? resolve(opts.renders) : null;
  if (src.layout === "kit") {
    const f = src.board && src.board.dir ? join(src.board.dir, "sources", "wireframe.json") : null;
    if (f && isFile(f)) src.renders = { kind: "wireframes", from: f, spec: JSON.parse(readFileSync(f, "utf8")) };
    return src;
  }
  if (src.layout === "pack" || src.layout === "board") {
    const file = want && isFile(want) ? want : src.layout === "board" && isFile(join(src.dir, "board.html")) ? join(src.dir, "board.html") : null;
    if (src.layout === "board" && isFile(join(src.dir, "spec", "wireframes.json"))) {
      src.layouts = { from: join(src.dir, "spec", "wireframes.json"), byScreen: JSON.parse(readFileSync(join(src.dir, "spec", "wireframes.json"), "utf8")) };
    }
    if (!file) return src;
    const h = readBoardHtml(file);
    src.renders = { kind: "board-html", ...h };
    // a NEWER build of the same board: its screens, their nav edges and the lanes are filed instead of the served model's,
    // so every render's screen and state is one the filed model holds (the rest of the model stays the served one's)
    const served = src.board && src.board.built;
    if (src.board && src.board.model && h.built && (!served || h.built > served)) {
      const v = modelView({ lanes: h.model.lanes, screens: h.model.screens, edges: h.model.edges });
      for (const k of ["surfaces", "surfaceLabels", "lanes", "screens", "edges"]) src.board.model[k] = v[k];
      src.renders.supersedes = { served: served || "an unstamped build", built: h.built };
      (src.notImported ||= []).push({ what: `the served model's screens, nav edges and lanes (built ${served || "unstamped"})`,
        why: `superseded by ${file}'s (built ${h.built}): the renders are that build's, so its screens are what is filed` });
    }
    return src;
  }
  if (src.layout === "bank") {
    const shots = readSiruShots(src.dir, [want && isDir(want) ? want : null]);
    if (shots) src.renders = { kind: "atlas-shots", ...shots };
    return src;
  }
  return src;
}
