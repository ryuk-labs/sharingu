// engine/tools/import/read.mjs — reads ONE brain directory into the plain source object the mappers consume. READ-ONLY:
// nothing here writes anywhere. The brain loader (./load.mjs loadBrain) reads and validates the aim, tree,
// flows, decisions, gaps and gtm; this file adds the kit's card sources (the same reads gen/pack.mjs makes), the served
// docs (capsules, kit.copies, understanding), and the build board's richer files (model.json, board-pack/checks.json,
// sources/queue.json) when the brain has one.
// readSource(dir, { layout, board }) picks the reader: `kit` (this file's readBrain — a brain whose publish map carries a kit
// section: sharingu, ryuklabs) · `bank` (read-bank.mjs — a markdown knowledge bank: siru) · `pack` (read-board.mjs — a
// served brain pack over a board model: saruspay) · `board` (read-board.mjs — a board directory: bunny). Without --layout
// it is detected from the directory (detectLayout). The source NO_SOURCE ("-") is a project filed from its overlays alone
// (sprint 4, IMP: the demo project, the website's pitch filed through preview → file): nothing is read, no op is built, and
// the importer's --overlay files are the whole import.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadBrain, readMap } from "./load.mjs";
import { readBank, isBankDir } from "./read-bank.mjs";
import { readPack, readBoard, packDirOf, isBoardDir, servedApps } from "./read-board.mjs";
import { attachRenders } from "./read-renders.mjs";
import { readCode, isCodeDir } from "./read-code.mjs";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const isFile = (p) => existsSync(p) && statSync(p).isFile();

export const LAYOUTS = ["kit", "bank", "pack", "board", "code"];
// serve/lib/understanding.json is the old engine's page data, never a doc (sprint 3, the projects' data before the video)
export const OLD_UNDERSTANDING = "the old engine's /understanding page data (its dimensions and standards, written by the old intaker and naming the old engine): that page is deleted in D6 (ruled 2026-10-02, R-old-path-guides: /docs is the one public guide), and as a doc it showed raw JSON";
// detectLayout(dir) -> a layout, or null: a publish map with a kit section → kit; a served pack → pack; a board directory
// → board; a knowledge bank → bank. A publish map without a kit section (saruspay's is only its publish facts) is not a kit.
export function detectLayout(dirIn) {
  const dir = resolve(dirIn);
  if (isCodeDir(dir)) return "code";   // this repo's own checkout (read-code.mjs: sharingu's model from its code)
  if (isFile(join(dir, "02_AGENT_R", "publish-map.json"))) {
    let map = null;
    try { map = readMap(dir); } catch { map = null; }
    if (map && map.kit) return "kit";
  }
  if (packDirOf(dir)) return "pack";
  if (isBoardDir(dir)) return "board";
  if (isBankDir(dir)) return "bank";
  return null;
}
export const NO_SOURCE = "-";
export function readSource(dir, opts = {}) {
  if (dir === NO_SOURCE) {
    if (opts.layout || opts.board || opts.renders) throw new Error("a project with no source (-) takes no --layout, --board or --renders: its overlays are the import");
    return { dir: null, layout: "none", board: null, brainKey: null,
      built: { ops: [], skips: [], notes: [], notImported: [], sourceOf: {}, renders: null } };
  }
  const layout = opts.layout || detectLayout(dir);
  if (!layout) throw new Error(`${resolve(dir)}: no known layout (${LAYOUTS.join(" · ")}) — name one with --layout`);
  if (layout !== "kit" && opts.board) throw new Error(`--board is for the kit layout (the ${layout} reader finds its own model)`);
  if (layout === "code") return readCode(dir, { renders: opts.renders });   // its ops come built (src.built)
  const src = layout === "kit" ? { ...readBrain(dir, opts), layout: "kit" } : layout === "bank" ? readBank(dir) : layout === "pack" ? readPack(dir) : layout === "board" ? readBoard(dir) : null;
  if (!src) throw new Error(`--layout ${layout}: not a layout (${LAYOUTS.join(" · ")})`);
  // the screens' renders, by the layout's own source (import/read-renders.mjs; --renders names a file or directory)
  attachRenders(src, { renders: opts.renders });
  // a board's apps, named as the brain's own served canvas names them (after the renders: a newer build's screens count)
  if (layout === "pack" || layout === "board") {
    const line = servedApps(src);
    if (line) (src.notes ||= []).push({ kind: "node", note: line, n: 1 });
  }
  return src;
}

export function readBrain(dirIn, opts = {}) {
  const m = loadBrain(dirIn);           // throws DataFault on a data fault — the CLI reports it and exits 1
  const { dir, kit, R } = m;
  const notImported = [];               // [{ what, why }] — sources seen and deliberately left out (the report lists them)

  // the decisions stream, split back into its three sources: kit `rows` files (verbatim objects), mdSplit (M-ADRs), gaps
  const mdIds = new Set(m.mdKinds.flatMap((k) => k.cards.map((c) => c.id)));
  const gapIds = new Set(m.gaps.map((g) => g.qid));
  const questionRows = m.decisions.filter((r) => !mdIds.has(r.qid) && !gapIds.has(r.qid));
  const rowsFrom = (kit.decisions || []).filter((d) => d.rows).map((d) => d.rows + (d.pointer || ""));

  // the GTM template (the kit read its bytes: the product's default or the brain's own file)
  const gtm = m.gtm ? { template: JSON.parse(m.gtm.bytes.toString("utf8")), from: m.gtm.from } : null;

  // the card sources, read exactly as gen/pack.mjs packContent reads them
  const cardDefs = [];
  const placed = new Set();
  for (const [i, c] of (kit.cards || []).entries()) {
    const at = `kit.cards[${i}]`;
    if (c.kindFile) {
      const d = R.json(c.kindFile, at);
      const rows = R.json(c.index, at);
      const names = new Set(R.list(c.dir, at));
      const cards = rows.filter((r) => r && names.has(`${r.id}.md`))
        .map((r) => ({ id: String(r.id), name: r.name ?? "", status: r.status ?? "", body: R.text(`${c.dir}/${r.id}.md`, at) }));
      cardDefs.push({ from: `${c.kindFile} + ${c.index} + ${c.dir}/`, kind: d.key, label: d.label, idPattern: d.idPattern || null,
        roleVisibility: d.roleVisibility || null, cards, generated: true });
    } else if (c.dir) {
      const skip = new Set(c.skip || []);
      const ex = c.exclude ? new RegExp(c.exclude) : null;
      const cards = R.list(c.dir, at).filter((f) => f.endsWith(".md") && !skip.has(f) && !(ex && ex.test(f)))
        .map((f) => ({ id: f.slice(0, -3), name: null, status: "", body: R.text(`${c.dir}/${f}`, at), path: `${c.dir}/${f}` }));
      cardDefs.push({ from: `${c.dir}/`, kind: c.kind, label: c.label, idPattern: c.idPattern || null, roleVisibility: c.roleVisibility || null, cards });
    } else if (c.files) {
      const cards = Object.entries(c.files).map(([id, f]) => ({ id, name: f.name, status: "", body: R.text(f.path, at), path: f.path }));
      cardDefs.push({ from: Object.values(c.files).map((f) => f.path).join(", "), kind: c.kind, label: c.label, idPattern: c.idPattern || null,
        roleVisibility: c.roleVisibility || null, cards });
    } else {
      const g = m.mdKinds.find((k) => k.key === c.kind);
      if (g) { placed.add(g.key); cardDefs.push(mdDef(g, kit)); }
    }
  }
  for (const g of m.mdKinds) if (!placed.has(g.key)) cardDefs.push(mdDef(g, kit));
  const roleDefault = (kit.roles || []).map((r) => r.key);
  if (m.tree) notImported.push({ what: "the kit's generated `goal` cards (one per tree node)", why: "derived from the tree — the goals are filed as `goal` ops" });
  if (m.gaps.length) notImported.push({ what: "the kit's generated `gap` card (gaps.md)", why: "derived from the gap rows — each gap is filed as a node (see node skips/notes)" });

  // the served docs: every serve/capsules/*.md, every kit.copies target, serve/lib/understanding.json
  const docs = [];
  const capDir = join(dir, "serve", "capsules");
  if (existsSync(capDir)) {
    for (const f of readdirSync(capDir).sort()) if (f.endsWith(".md")) docs.push({ path: `capsules/${f}`, from: `serve/capsules/${f}`, body: R.text(`serve/capsules/${f}`) });
  }
  for (const c of kit.copies || []) {
    const path = c.to.replace(/^serve\//, "");
    if (!docs.some((d) => d.path === path)) docs.push({ path, from: c.from, body: R.text(c.from, "kit.copies") });
  }
  if (isFile(join(dir, "serve", "lib", "understanding.json"))) notImported.push({ what: "serve/lib/understanding.json", why: OLD_UNDERSTANDING });
  for (const f of kit.files || []) notImported.push({ what: `kit.files download \`${f.id}\` (${f.from})`, why: "a download (a blob), not knowledge — R2 keeps blobs" });
  const kitCapsule = cardDefs.find((d) => d.kind === "capsule");

  // the build board (sharingu): --board, else <brain>/source/board when it exists
  let board = null;
  const bdir = opts.board ? resolve(opts.board) : join(dir, "source", "board");
  if (existsSync(bdir)) {
    const want = { model: "model.json", checks: "board-pack/checks.json", queue: "sources/queue.json" };
    board = { dir: bdir, missing: [] };
    for (const [k, rel] of Object.entries(want)) {
      const p = join(bdir, rel);
      if (isFile(p)) board[k] = readJson(p); else { board[k] = null; board.missing.push(rel); }
    }
    // the briefs the queue names, verbatim (a path relative to the brain)
    board.briefs = new Map();
    const q = board.queue;
    for (const it of q ? [...(q.streams || []).flatMap((s) => s.items || []), ...(q.waiting || [])] : []) {
      if (it.brief && !board.briefs.has(it.brief)) {
        const p = resolve(dir, it.brief);
        board.briefs.set(it.brief, p.startsWith(dir + "/") && isFile(p) ? readFileSync(p, "utf8") : null);
      }
    }
    if (isFile(join(bdir, "sources", "wireframe.json"))) notImported.push({ what: "source/board/sources/wireframe.json", why: "its screens are model.json screens (the wf-* ids, fromWireframe: regions · buttons · because), filed as screen nodes (their regions and buttons drawn as data.wireframe) and as one wireframe render each (import/renders.mjs); the spec's own artboard · notes · wires · tab · superseded fields are not carried" });
  } else if (opts.board) {
    throw new Error(`--board ${opts.board}: not a directory`);
  }
  if (existsSync(join(dir, "serve", "lib", "canvas", "canvas.json")) && m.kit.canvas === "derive") {
    notImported.push({ what: "serve/lib/canvas/canvas.json (kit-derived)", why: "derived by the kit: lanes from the tree's dimensions, deps from the open gaps — not source data; the flows are filed from their source" });
  }

  return { dir, brainKey: m.project, about: m.about, aim: m.aim, tree: m.tree, treeSource: m.treeSource || null, flows: m.flows,
    flowsFrom: kit.flows ? (kit.flows.file || `${kit.flows.from}#${kit.flows.pointer}`) : null,
    questionRows, rowsFrom, mdKinds: m.mdKinds, gaps: m.gaps, gapsFrom: kit.gaps || null, gtm, cardDefs, roleDefault, docs,
    capsuleRoles: kitCapsule ? kitCapsule.roleVisibility : null, board, notImported };
}

function mdDef(g, kit) {
  return { from: (kit.decisions || []).find((d) => d.mdSplit && d.card.kind === g.key)?.mdSplit || "mdSplit", kind: g.key, label: g.label,
    idPattern: g.idPattern || null, roleVisibility: g.roleVisibility || null,
    cards: g.cards.map((c) => ({ id: c.id, name: c.name, status: c.status, body: c.body })) };
}
