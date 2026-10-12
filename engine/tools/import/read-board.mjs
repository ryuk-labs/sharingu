// engine/tools/import/read-board.mjs — reads a SarusPay-family BOARD into the plain source object the mappers consume (the
// shape read.mjs readBrain returns). The board's build (board/normalize.mjs) joins its sources into ONE model.json —
// screens · edges · flows · tables · relations · entities · lanes · api · architecture · questions (with options) · rulings
// · golive · evals — and renders a card per row (board/cards.mjs). Two layouts carry one; both are READ-ONLY here:
//   pack  — a served brain pack (saruspay: <brain>/serve/ws/<key>/pack/: pack.json + index/ + cards/ + decisions.json +
//           checks.json + goals.json + files/model.json) and the brain's serve/ tree (goal.json, capsules/, lib/ docs);
//   board — a board directory (bunny: model.json + decisions/decisions/*.json + cards/manifest.json + the *.md pages it
//           generates). model.json there is the board's own build output (gitignored, rebuilt by its update.mjs): read as
//           it is on disk, never rebuilt from here.
// The mapping (the report prints what is skipped and why):
//   aim       pack: serve/goal.json northStar (measure null) · board: none declared
//   goal      a root, one child per go-live party (pack: serve/goal.json milestones; board: model.golive parties), each
//             party's items under it (id, text → title, party → owner, status, why → note)
//   question  the ruling rows (pack: decisions.json, the rulings + the questions still open; board: decisions/decisions/
//             *.json) with the options, why and severity of the same question in model.questions; affects = the question's
//             screens · entities · tables · api as map refs
//   node/edge model.json through model.mjs / flows.mjs (surfaces: the screens' own surface values)
//   check     pack: checks.json · board: model.evals.evals
//   card      every card kind the board renders, bodies verbatim, EXCEPT the renderings of rows this import files as nodes
//             (screen · endpoint · table · journey) and of questions it files as questions
//   doc       the prose pages that carry what no kind holds (start-here, handoff, go-live, outreach, changes, design …)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { firstH1 } from "./common.mjs";
import { BODY_BYTES, jsonBytes } from "../../src/knowledge/schema.js";

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const arr = (v) => (Array.isArray(v) ? v : []);
function readJson(p, what) {
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { throw new Error(`${what || p}: not readable JSON (${e.message})${/model\.json$/.test(p) ? " — the board may be mid-rebuild; run again" : ""}`); }
}
const GOAL_SLUG = /^[a-z][a-z0-9-]{0,79}$/;
// the same rule as the kit reader's (read.mjs OLD_UNDERSTANDING; not imported from there: read.mjs imports this file)
const OLD_UNDERSTANDING_WHY = "the old engine's /understanding page data (its dimensions and standards, written by the old intaker and naming the old engine): that page is deleted in D6 (ruled 2026-10-02, R-old-path-guides: /docs is the one public guide), and as a doc it showed raw JSON";
const DOC_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const GOAL_TITLE_MAX = 400;
// the pack's slug rule (pack.json slugRule): { } removed, every run of non [A-Za-z0-9] replaced by "-", "-" trimmed
export const packSlug = (id) => String(id).replace(/[{}]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// the card kinds whose every card renders a model row this import files as a node (kind → node type)
export const RENDERS_NODE = { screen: "screen", endpoint: "door", table: "table", journey: "flow" };
// a board kind declares no idPattern: the door's own id charset (common.mjs ID_RE, unbounded)
export const DOOR_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:/+#@{}-]*$";

// ---- detection ---------------------------------------------------------------------------------------------------------
// packDirOf(dir) -> <dir>/serve/ws/<key>/pack when the brain serves a pack, else null
export function packDirOf(dir) {
  const ws = join(dir, "serve", "ws");
  if (!isDir(ws)) return null;
  for (const k of readdirSync(ws).sort()) if (isFile(join(ws, k, "pack", "pack.json"))) return join(ws, k, "pack");
  return null;
}
export const isBoardDir = (dir) => isFile(join(dir, "model.json")) && isDir(join(dir, "decisions", "decisions")) && isDir(join(dir, "spec"));

// ---- what model.json holds beyond the model view, and where each part went ---------------------------------------------
const MODEL_ELSEWHERE = {
  flows: "filed as flow nodes (flows.mjs)",
  questions: "joined onto the ruling rows (options, why, severity, affects); a question neither ruled nor open is filed through its decision card",
  rulings: "the ruling rows are read from their own files (pack decisions.json · decisions/decisions/*.json); these carry no more",
  golive: "filed as the goal tree (the parties and their items; the section titles, costs and services ride in the go-live doc)",
  evals: "filed as checks",
  features: "filed through their cards (kind feature)", notifications: "filed through their cards (kind notification)",
  webhooks: "filed through their cards (kind webhook)", tech: "filed through the machine, job and platform cards the board renders from it",
  shells: "rendered in the platform card `navigation`", outreach: "rendered as OUTREACH.md (a doc)",
  sdlc: "rendered as AGENTIC-SDLC.md (a doc)", world: "rendered as TEST-WORLD.md (a doc)",
};
const MODEL_NOT = {
  meta: "the board's headline counts and lead sentences — derived from the rows filed",
  legacyEdges: "the links the board kept from before the wireframes (superseded by edges[], which are filed)",
  fills: "gap-fill proposals, each resolved into a question (its qid)",
  stateMatrix: "a screen × state view derived from the screens' own states (on the screen nodes)",
  standards: "the platform standards the screens cite — no kind holds a standard",
  specIssues: "the board's audit of its own spec — derived",
  docs: "the board's page texts — the pages are filed as docs where they carry what no kind holds",
  discussion: "the owner's discussion rounds — the rulings they produced are filed as questions (the log itself as a doc where served)",
  direction: "the owner's standing directions (at, topic, text) — no kind holds a direction",
  version: "the build stamp",
};
const VIEW_KEYS = ["lanes", "screens", "edges", "entities", "relations", "tables", "api", "architecture"];

export function modelView(model) {
  const lanes = arr(model.lanes);
  const laneLabel = new Map(lanes.map((l) => [l && l.id, l && l.label]));
  // the model carries no surface list: a surface is a distinct value the screens' own `surface` field names, first seen first
  const surfaces = [...new Set(arr(model.screens).map((s) => s && s.surface).filter((s) => typeof s === "string" && s))];
  const surfaceLabels = Object.fromEntries(surfaces.filter((s) => laneLabel.get(s)).map((s) => [s, laneLabel.get(s)]));
  const view = { surfaces, surfaceLabels, rulings: model.rulings };
  for (const k of VIEW_KEYS) if (k in model) view[k] = model[k];
  return view;
}
// servedApps(src) — the apps as the brain's own served canvas names them (serve/lib/canvas/canvas.json, the board's
// export-canvas build: {surfaces, surfaceLabels, screens[{id, surface, lane}]}). The board's model keys a screen's app by
// a raw key ("mobile", "web", "ops") and names none; the canvas names each app and may split one model key into several
// apps (saruspay: "ops" is two apps, the tenant admin and the Veil console, split by lane — its ruling QF822CD84). Applied
// to the model this import files, from the canvas's DATA alone (no project's rule is written here):
//   · a screen's app is the canvas's app for the same screen id; a screen the canvas does not hold takes the canvas's app
//     for the same (model app, lane) pair, when the canvas's screens agree on one; else its model app stays;
//   · each app's name is the canvas's surfaceLabels entry; an app the canvas does not name keeps its key as its name.
// No canvas, or a canvas that names no app the model's screens use: the model is left as it is. -> a note line, or null
export function servedApps(src) {
  const m = src && src.board && src.board.model;
  const f = src && src.dir ? join(src.dir, "serve", "lib", "canvas", "canvas.json") : null;
  if (!m || !f || !isFile(f)) return null;
  let c;
  try { c = JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
  const labels = c && typeof c.surfaceLabels === "object" && c.surfaceLabels ? c.surfaceLabels : {};
  const canvasApps = new Set(arr(c && c.surfaces).filter((x) => typeof x === "string" && x));
  if (!canvasApps.size) return null;
  const byId = new Map(), byPair = new Map();
  const modelOf = new Map(arr(m.screens).map((s) => [s && String(s.id), s]));
  for (const cs of arr(c.screens)) {
    if (!cs || !canvasApps.has(cs.surface)) continue;
    byId.set(String(cs.id), cs.surface);
    const ms = modelOf.get(String(cs.id));
    if (!ms || typeof ms.surface !== "string") continue;
    const k = `${ms.surface}\u0000${ms.lane ?? ""}`;
    const prev = byPair.get(k);
    byPair.set(k, prev === undefined || prev === cs.surface ? cs.surface : null);   // null: the canvas's screens disagree
  }
  let moved = 0;
  for (const s of arr(m.screens)) {
    if (!s || typeof s.surface !== "string") continue;
    const to = byId.get(String(s.id)) ?? byPair.get(`${s.surface}\u0000${s.lane ?? ""}`) ?? null;
    if (to && to !== s.surface) { s.appKey = s.surface; s.surface = to; moved++; }
  }
  const surfaces = [...new Set(arr(m.screens).map((s) => s && s.surface).filter((x) => typeof x === "string" && x))];
  const named = Object.fromEntries(surfaces.filter((k) => typeof labels[k] === "string" && labels[k].trim()).map((k) => [k, labels[k].trim()]));
  if (!moved && !Object.keys(named).length) return null;
  m.surfaces = surfaces;
  m.surfaceLabels = { ...(m.surfaceLabels || {}), ...named };
  return `the apps as the served canvas (serve/lib/canvas/canvas.json) names them: ${surfaces.map((k) => `${k} = ${m.surfaceLabels[k] || k}`).join(" · ")}` +
    (moved ? `; ${moved} screens take the canvas's app for their screen or their (model app, lane) pair (the model's key kept in data.appKey)` : "");
}

function modelNotImported(model, notImported, from) {
  const size = (v) => (Array.isArray(v) ? `${v.length} rows` : v && typeof v === "object" ? `${Object.keys(v).length} keys` : typeof v === "string" ? `${v.length} chars` : String(v));
  for (const [k, v] of Object.entries(model)) {
    if (VIEW_KEYS.includes(k) || k in MODEL_ELSEWHERE) continue;
    notImported.push({ what: `${from} /${k} (${size(v)})`, why: MODEL_NOT[k] || "no knowledge kind holds it (not a node, edge, question, check or card)" });
  }
}

// ---- questions: a ruling row + its model question ----------------------------------------------------------------------
const TEXT_CAPS = [["question", 4000], ["why", 8000], ["rationale", 8000], ["label", 4000]];
const Q_CARRIED = new Set(["id", "question", "options", "why", "severity", "area", "section", "screens", "entities", "tables", "api"]);
const REF_OF = [["screens", "screen"], ["entities", "entity"], ["tables", "table"], ["api", "api"]];
function questionRows(rulingRows, model, note) {
  const qById = new Map(arr(model.questions).map((q) => [q && q.id, q]));
  const out = [];
  for (const r of rulingRows) {
    const q = qById.get(r.qid);
    const row = { ...r };
    if (!q) note("question", "a ruling row with no question in model.json: no options, why or severity to join");
    if (!(typeof row.question === "string" && row.question.trim()) && q && q.question) {
      row.question = q.question;
      note("question", "the ruling row's question is empty: the question text is model.questions[].question");
    } else if (q && typeof q.question === "string" && /…$/.test(row.question) && q.question.startsWith(row.question.slice(0, -1).trimEnd()) && q.question.length >= row.question.length) {
      row.question = q.question;
      note("question", "the row's question is the board's cut card name (ends \"…\"): the full text is model.questions[].question");
    }
    const opts = arr(q && q.options);
    row.options = opts.map((o) => ({ what: o.label, tradeoff: o.consequence || null }));
    if (opts.length) note("question", "options from model.questions[].options: label → what, consequence → tradeoff (the key A, B … is the order)", 1);
    if (opts.some((o, i) => o.key !== String.fromCharCode(65 + i))) note("question", "an option list whose keys are not A, B, C … in order (a letter choice then names the position)");
    if (row.why == null && q && q.why != null) row.why = q.why;
    if (row.severity == null && q && q.severity != null) row.severity = q.severity;
    if (row.area == null && q) row.area = q.area ?? q.section ?? null;
    // affects: the rows the question names, as the Map's refs (mapnode.js lists the questions whose affects name a node)
    const affects = [];
    for (const [k, t] of REF_OF) for (const v of [...arr(q && q[k]), ...arr(r[k])]) if (typeof v === "string" && v) affects.push(`${t}:${v}`);
    row.affects = [...new Set(affects)];
    for (const [k] of REF_OF) delete row[k];
    if (row.affects.length) note("question", "affects ← the question's screens · entities · tables · api, as map refs (screen:<id> · entity:<id> · table:<name> · api:<METHOD /path>)");
    // bunny: a ruling leaves the worklist only when it carries an `implemented` block (its evidence an artifact)
    if (r.implemented && typeof r.implemented === "object") {
      row.implStatus = "implemented";
      delete row.implemented;
      note("question", "implStatus \"implemented\": the ruling carries an `implemented` block (its {at, evidence} text has no field and is not carried)");
    }
    if (q) for (const k of Object.keys(q)) if (!Q_CARRIED.has(k)) note("question", `model.questions field \`${k}\` not carried (no field for it)`);
    // the door's text caps: a longer value is cut (its tail lost here, kept at the source) rather than the question dropped
    for (const [f, max] of TEXT_CAPS) if (typeof row[f] === "string" && row[f].length > max) {
      row[f] = row[f].slice(0, max - 1) + "…";
      note("question", `a ${f} over the door's ${max}-character cap is cut to ${max} (the tail stays at the source only)`);
    }
    out.push(row);
  }
  return out;
}

// ---- goals: root → party → item --------------------------------------------------------------------------------------
// headline(text) -> a go-live item's title as a person scans it on Goals: the text up to its first clause boundary (". ", ": ",
// "; ", " — ", " - ", " (", " http") between HEAD_MIN and HEAD_MAX characters, else cut at a word under HEAD_MAX with "…"; a
// text that fits is itself. The whole text then leads the goal's note, verbatim (P2, 2026-10-01: bunny's go-live items are
// paragraphs of up to 400 characters, 28 of 56 over 200, and Goals and the Map showed every one whole as a title).
export const HEAD_MAX = 120, HEAD_MIN = 24;
export function headline(text) {
  const t = String(text);
  if (t.length <= HEAD_MAX) return t;
  let at = -1;
  for (const b of [". ", ": ", "; ", " \u2014 ", " - ", " (", " http"]) {
    const i = t.indexOf(b, HEAD_MIN);
    if (i >= HEAD_MIN && i <= HEAD_MAX && (at < 0 || i < at)) at = i;
  }
  if (at > 0) return t.slice(0, at).replace(/[\s,;:.\u2014-]+$/, "");
  const cut = t.slice(0, HEAD_MAX - 1), sp = cut.lastIndexOf(" ");
  return (sp > HEAD_MIN ? cut.slice(0, sp) : cut).replace(/[\s,;:.\u2014-]+$/, "") + "\u2026";
}
// items: [{ party, item }] · parties: [{ id, title }] · root: { id, title }
function goalTree(root, parties, items, note, skipped) {
  const tree = [], seen = new Set();
  const add = (n, what) => {
    if (!GOAL_SLUG.test(String(n.id))) { skipped.push({ what: `${what} ${n.id}`, why: "its id is not a goal slug (^[a-z][a-z0-9-]*$)" }); return false; }
    if (seen.has(n.id)) { skipped.push({ what: `${what} ${n.id}`, why: "a duplicate goal id (the first wins)" }); return false; }
    seen.add(n.id); tree.push(n); return true;
  };
  add({ id: root.id, parent: null, title: root.title, dimensions: [] }, "the root");
  const live = new Set();
  for (const p of parties) if (add({ id: p.id, parent: root.id, title: p.title, dimensions: [] }, "party")) live.add(p.id);
  for (const { party, item } of items) {
    if (!live.has(party)) { skipped.push({ what: `go-live item ${item.id}`, why: `its party ${party} is not a goal` }); continue; }
    const { id, text, label, why, status, party: _p, ...rest } = item;
    let title = text ?? label ?? id, noteText = why ?? null;
    if (typeof title === "string" && title.length > HEAD_MAX) {
      noteText = noteText == null ? title : `${title}\n\n${noteText}`;
      title = headline(title).slice(0, GOAL_TITLE_MAX);
      note("goal", `an item text over ${HEAD_MAX} characters is titled by its headline (its first clause, else cut at a word); the full text leads the note, verbatim`);
    }
    add({ id, parent: party, title, dimensions: [], owner: party, status: status ?? null, note: noteText, ...rest }, "go-live item");
  }
  return tree;
}

// ---- docs --------------------------------------------------------------------------------------------------------------
function docAt(dir, rel, path, docs, notImported) {
  const p = join(dir, rel);
  if (!isFile(p)) return;
  const body = readFileSync(p, "utf8");
  if (!DOC_PATH.test(path) || path.includes("..") || path.includes("//")) { notImported.push({ what: rel, why: `its doc path ${path} is not one the door takes` }); return; }
  if (jsonBytes(body) > BODY_BYTES) { notImported.push({ what: rel, why: `${jsonBytes(body).toLocaleString("en-US")} bytes as JSON — over the door's ${BODY_BYTES.toLocaleString("en-US")}-byte body cap` }); return; }
  docs.push({ path, from: rel, body });
}
const mdIn = (dir) => (isDir(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []);

// ---- cards -------------------------------------------------------------------------------------------------------------
// def(kind, label, idPattern, roleVisibility, cards, from) with the skip rule for the renderings of filed rows
function cardDef(kind, label, idPattern, roleVisibility, cards, from, open) {
  const def = { from, kind, label, idPattern, roleVisibility, cards, generated: true, open: !!open };
  if (RENDERS_NODE[kind]) def.skip = `kind ${kind}: the board renders each card from a model row filed as a \`${RENDERS_NODE[kind]}\` node (same row, one copy)`;
  return def;
}

// ======================================================================================================================
// readPack(dir) — a served brain pack (saruspay)
export function readPack(dirIn) {
  const dir = resolve(dirIn);
  const pdir = packDirOf(dir);
  if (!pdir) throw new Error(`${dir}: no serve/ws/<key>/pack/pack.json — not a served brain pack`);
  const key = basename(resolve(pdir, ".."));
  const rel = (p) => p.slice(dir.length + 1);
  const pack = readJson(join(pdir, "pack.json"));
  const modelPath = join(pdir, "files", "model.json");
  if (!isFile(modelPath)) throw new Error(`${rel(modelPath)}: missing — the pack carries no board model`);
  const model = readJson(modelPath);
  const notes = [], notImported = [], why = {};
  const note = mkNote(notes);

  // aim ← serve/goal.json northStar
  const goalPath = join(dir, "serve", "goal.json");
  const goalJson = isFile(goalPath) ? readJson(goalPath) : null;
  const aim = goalJson && typeof goalJson.northStar === "string" && goalJson.northStar.trim()
    ? { text: goalJson.northStar, measure: null, source: "serve/goal.json#/northStar", measureSource: "serve/goal.json declares no measure" } : null;
  if (!aim) why.aim = "serve/goal.json declares no northStar";

  // goals ← serve/goal.json (root = northStar, one child per milestone) + the pack's goals.json items (under their party)
  const items = isFile(join(pdir, "goals.json")) ? readJson(join(pdir, "goals.json")) : [];
  let tree = null;
  const goalSkips = [];
  if (goalJson && arr(goalJson.milestones).length) {
    const partyOf = new Map();
    for (const m of goalJson.milestones) for (const id of arr(m.refs)) if (!partyOf.has(id)) partyOf.set(id, m.id);
    const rootId = packSlug(goalJson.northStar).toLowerCase();
    tree = goalTree({ id: rootId, title: goalJson.northStar }, goalJson.milestones.map((m) => ({ id: m.id, title: m.title })),
      items.map((it) => ({ party: partyOf.get(it.id) ?? it.party, item: it })), note, goalSkips);
    note("goal", `the root is serve/goal.json's northStar (id ${rootId}, its slug); a milestone is a child goal; an item sits under the milestone that refs it`);
  } else why.goal = "serve/goal.json declares no milestones";
  for (const s of goalSkips) notImported.push(s);

  // questions ← decisions.json (the pack's flattening of the ruling files + the open questions)
  const decisions = readJson(join(pdir, "decisions.json"));
  const qrows = questionRows(decisions, model, note);

  // cards ← pack.json kinds · index/<kind>.json · cards/<dir>/<slug>.md
  const cardDefs = [];
  for (const k of arr(pack.kinds)) {
    const idx = readJson(join(pdir, k.indexPath));
    const tmpl = String(k.path || "");
    const cards = [];
    for (const r of arr(idx)) {
      const f = join(pdir, tmpl.replace("{slug}", packSlug(r.id)));
      if (!isFile(f)) { notImported.push({ what: `card ${k.key}/${r.id}`, why: `listed in ${k.indexPath}, no file at ${tmpl.replace("{slug}", packSlug(r.id))}` }); continue; }
      cards.push({ id: String(r.id), name: r.name ?? "", status: r.status ?? "", body: readFileSync(f, "utf8") });
    }
    cardDefs.push(cardDef(k.key, k.label, k.idPattern || null, k.roleVisibility || null, cards, `${rel(pdir)}/${k.indexPath} + ${tmpl}`));
  }
  const packRoles = arr(pack.roles).map((r) => r.key);
  if (packRoles.length) note("card", `roleVisibility verbatim from pack.json (${packRoles.join(", ")}) — the pack's own role keys; a role this org does not seat reads none of them until the owner changes it`);

  // checks ← checks.json (the pack's served copy of the board's evals, status "unproven" unless recorded)
  const checks = readJson(join(pdir, "checks.json"));

  // docs: the capsules, the served lib pages that carry what no kind holds, the design and research notes
  const docs = [];
  for (const f of mdIn(join(dir, "serve", "capsules"))) docAt(dir, `serve/capsules/${f}`, `capsules/${f}`, docs, notImported);
  for (const f of ["START-HERE.md", "HANDOFF.md", "STANDARDS.md", "GOLIVE.md", "OUTREACH.md", "CHANGES.md"]) docAt(dir, `serve/lib/${f}`, `lib/${f}`, docs, notImported);
  for (const sub of ["docs", "design", "research"]) for (const f of mdIn(join(dir, "serve", "lib", sub))) docAt(dir, `serve/lib/${sub}/${f}`, `lib/${sub}/${f}`, docs, notImported);
  docAt(dir, "serve/lib/design/tokens.json", "lib/design/tokens.json", docs, notImported);
  for (const f of mdIn(join(dir, "serve", "lib", "reference", "interlace"))) docAt(dir, `serve/lib/reference/interlace/${f}`, `lib/reference/interlace/${f}`, docs, notImported);
  docAt(dir, "serve/lib/decisions/discussion.md", "lib/decisions/discussion.md", docs, notImported);
  if (isFile(join(dir, "serve", "lib", "understanding.json"))) notImported.push({ what: "serve/lib/understanding.json", why: OLD_UNDERSTANDING_WHY });
  for (const [what, whyNot] of [
    ["serve/lib/ARCHITECTURE.md", "rendered from model.json /architecture (filed as the architecture and service nodes)"],
    ["serve/lib/DECISIONS.md", "the rulings register (filed as questions)"],
    ["serve/lib/DESIGN-WORKLIST.md", "generated from the screens' design fields (on the screen nodes)"],
    ["serve/lib/INDEX.md", "an index of the served pages"],
    ["serve/lib/registers/", "generated registers of rows filed as questions, nodes, checks and cards (EVALS.md, SCREENS.md and API.md are also over the door's 500 KB body cap)"],
    ["serve/lib/reference/interlace/interlace-docs-mirror/ + *.html", "a copy of Interlace's public documentation, not the project's own knowledge"],
    ["serve/lib/decisions/rounds/", "the owner's ruling rounds — the rulings they produced are filed as questions"],
    ["serve/lib/sources/", "the brain's source index and Agent R engine log — the brain's machinery"],
    ["serve/lib/agentic.json", "the old engine's agentic rules for this brain"],
    ["serve/lib/{atlas,eagle,arch,canvas,board}/ · serve/atlas/", "derived views and wireframe images (the canvas is derived from model.json, which is filed; images are blobs)"],
    ["serve/state.json · serve/tenant.json · serve/brain-parity.json", "the brain's generated status, the org manifest and the publish parity proof"],
    [`${rel(pdir)}/files/`, `downloads (${arr(pack.files).map((f) => f.id).join(", ")}) — blobs, not knowledge; model.json is read as the model and evals.json is checks.json`],
    [`${rel(pdir)}/changes.json · manifest.json · stamp.json`, "the pack's change feed, parity manifest and stamp (the change log rides in lib/CHANGES.md)"],
    ["60_DECISIONS/decision-log.md", "the Veil org umbrella's own ADRs (the single-brain repo ruling) — the brain's machinery"],
    ["source/", "the board's build inputs; the pack is their served build"],
  ]) notImported.push({ what, why: whyNot });
  modelNotImported(model, notImported, `${rel(modelPath)}`);
  why.gtm = "the pack declares no GTM template";
  why.queue = "the pack has no build queue";

  return {
    layout: "pack", dir, brainKey: key, about: null, aim, tree, treeSource: tree ? "serve/goal.json + pack goals.json" : null,
    flows: arr(model.flows), flowsFrom: `${rel(modelPath)}#/flows`,
    questionRows: qrows, rowsFrom: [`${rel(pdir)}/decisions.json`], mdKinds: [], gaps: [], gapsFrom: null, gtm: null,
    cardDefs, roleDefault: [], docs, capsuleRoles: null,
    board: { dir: pdir, missing: [], model: modelView(model), built: builtOf(model), checks, queue: null, briefs: new Map() },
    notImported, notes, why,
  };
}

// ======================================================================================================================
// readBoard(dir) — a board directory (bunny)
export function readBoard(dirIn) {
  const dir = resolve(dirIn);
  if (!isBoardDir(dir)) throw new Error(`${dir}: not a board (needs model.json, decisions/decisions/ and spec/)`);
  const model = readJson(join(dir, "model.json"));
  const notes = [], notImported = [], why = {};
  const note = mkNote(notes);
  why.aim = "the board declares no aim (no north star or mission)";

  // goals ← model.golive: root "go-live" (titled by the board's own GOLIVE.md heading) → party → item
  let tree = null;
  const golive = model.golive;
  if (golive && arr(golive.parties).length) {
    const title = isFile(join(dir, "GOLIVE.md")) ? firstH1(readFileSync(join(dir, "GOLIVE.md"), "utf8")) : null;
    const skipped = [];
    tree = goalTree({ id: "go-live", title: title || "Go-live" }, golive.parties.map((p) => ({ id: p.id, title: p.name ?? p.id })),
      golive.parties.flatMap((p) => arr(p.sections).flatMap((s) => arr(s.items).map((it) => ({ party: p.id, item: it })))), note, skipped);
    for (const s of skipped) notImported.push(s);
    note("goal", "the root is the go-live checklist (id go-live, titled by GOLIVE.md's heading); a party is a child goal (its name the title); a section title is not a goal (GOLIVE.md keeps it)");
  } else why.goal = "model.json /golive has no parties";

  // questions ← decisions/decisions/*.json, one ruling per file
  const ddir = join(dir, "decisions", "decisions");
  const rulings = readdirSync(ddir).filter((f) => f.endsWith(".json")).sort().map((f) => readJson(join(ddir, f), `decisions/decisions/${f}`));
  const qrows = questionRows(rulings, model, note);

  // cards ← cards/manifest.json (one row per card: id, kind, name, status, path); a kind's label is its INDEX.md heading
  const cardDefs = [];
  const man = isFile(join(dir, "cards", "manifest.json")) ? readJson(join(dir, "cards", "manifest.json")) : null;
  if (man) {
    const byKind = new Map();
    for (const c of arr(man.cards)) { if (!byKind.has(c.kind)) byKind.set(c.kind, []); byKind.get(c.kind).push(c); }
    for (const [kind, rows] of byKind) {
      const kdir = String(rows[0].path || "").split("/")[1] || kind;
      const head = isFile(join(dir, "cards", kdir, "INDEX.md")) ? firstH1(readFileSync(join(dir, "cards", kdir, "INDEX.md"), "utf8")) : null;
      const label = head ? head.replace(/\s+—\s+\d+$/, "") : kind;
      const cards = [];
      for (const r of rows) {
        if (!isFile(join(dir, r.path))) { notImported.push({ what: `card ${kind}/${r.id}`, why: `listed in cards/manifest.json, no file at ${r.path}` }); continue; }
        cards.push({ id: String(r.id), name: r.name ?? "", status: r.status ?? "", body: readFileSync(join(dir, r.path), "utf8") });
      }
      cardDefs.push(cardDef(kind, label, DOOR_ID_PATTERN, null, cards, `cards/manifest.json + cards/${kdir}/`, true));
    }
    note("card", "a board card kind declares no idPattern (the door's own id charset is filed) and no roleVisibility (open to every seated reader)");
    note("card", "the board's cards/ is its own build output (gitignored, rebuilt by its update.mjs) — read as on disk");
  } else notImported.push({ what: "cards/", why: "no cards/manifest.json on disk (the board's build writes it)" });

  // docs: the pages carrying what no kind holds
  const docs = [];
  for (const f of ["START-HERE.md", "GOLIVE.md", "WORKLIST.md", "AGENTIC-SDLC.md", "TEST-WORLD.md", "CHANGES.md"]) docAt(dir, f, `board/${f}`, docs, notImported);
  for (const [what, whyNot] of [
    ["API.md · DATABASE.md · DECISIONS.md · EVALS.md · QUESTIONS.md · SCREENS.md · STATE-MACHINES.md · WIREFRAMES.md · PLATFORM.md · ARCHITECTURE.md · NEVER-DRAWN.md",
      "generated registers of rows filed as questions, nodes, checks and cards (EVALS.md, QUESTIONS.md, SCREENS.md and API.md are also over the door's 500 KB body cap)"],
    ["INDEX.md", "an index of the board's pages"],
    ["README.md · HANDOFF.md · EVAL-TRUTH.md · spec/SCHEMA.md", "how the board itself is kept and graded — the board's machinery, not BunnyEvents knowledge"],
    ["spec/*.json · decisions/*.json (besides decisions/decisions/) · rounds/", "the board's sources, joined into model.json (read as the model) — the rounds are the owner's input batches, their rulings filed"],
    ["tech/ · payload.json · board.html · .shot-cache/ · designer/ · archive/", "the board's generated outputs, caches, the designer tool and retired history"],
  ]) notImported.push({ what, why: whyNot });
  modelNotImported(model, notImported, "model.json");
  why.gtm = "the board declares no GTM template";
  why.queue = "the board has no build queue (its WORKLIST.md is filed as a doc)";

  return {
    layout: "board", dir, brainKey: null, about: null, aim: null, tree, treeSource: tree ? "model.json#/golive" : null,
    flows: arr(model.flows), flowsFrom: "model.json#/flows",
    questionRows: qrows, rowsFrom: ["decisions/decisions/*.json"], mdKinds: [], gaps: [], gapsFrom: null, gtm: null,
    cardDefs, roleDefault: [], docs, capsuleRoles: null,
    board: { dir, missing: [], model: modelView(model), built: builtOf(model), checks: arr(model.evals && model.evals.evals), queue: null, briefs: new Map() },
    notImported, notes, why,
  };
}

// the model's build time (model.json /version/builtAt), or null: import/read-renders.mjs compares it with a board html's
const builtOf = (model) => (model && model.version && typeof model.version.builtAt === "string" ? model.version.builtAt : null);

// a note sink: { kind, note, n } counted per distinct (kind, note)
export function mkNote(notes) {
  return (kind, text, n = 1) => {
    const hit = notes.find((x) => x.kind === kind && x.note === text);
    if (hit) hit.n += n; else notes.push({ kind, note: text, n });
  };
}
