// engine/tools/import/read-bank.mjs — reads a markdown KNOWLEDGE BANK (siru: ~/batcave_vm/siru/siru-knowledge-bank — no
// publish map, no kit section) into the plain source object the mappers consume (the shape read.mjs readBrain returns).
// READ-ONLY. Its structured parts follow the bank's own pack exporter (tools/export-pack.mjs, which reads the same files):
//   question  60_DECISIONS/open-questions.md: one row per top-level bullet naming a **Q-…** id. A ruled one (✅) is a
//             decided question with no options (label = the ADR the line names); an open one carries no options, and the
//             door refuses an open question with fewer than 2, so it files as a `gap` node (the holes it is)
//   card      decision ← 60_DECISIONS/decision-log.md "### ADR-NNN · title (date · accepted|superseded)" sections (the
//             owner's ruling: an ADR is a card of kind decision) · blueprint ← 05_BLUEPRINTS/*.md · journey ←
//             55_FLOWS/*.md · source ← 70_SOURCES/source-registry.md "### S-NN · title" sections · app ←
//             20_PRODUCT/app-registry.json (rendered exactly as the exporter renders it — the only markdown there is)
//   node/edge the model: screen ← 00_CANON/screens.json (the canonical register; the reserved slots are not screens),
//             with the atlas app a screen is rendered in (serve/lib/atlas/atlas.json) as its surface · lane ← the Eagle
//             bands (serve/lib/eagle/eagle.json bandOrder) · surface ← the atlas apps · nav edge ← eagle.json edges
//             (screen → screen) · service ← eagle.json comps (every architecture component, its kind kept in data)
//   doc       the knowledge notes (canon, strategy, product, AI, economics, operations, calls, alignments, the backlog) and
//             the role capsules (85_ALIGNMENTS/capsules/*.md → capsules/<role>.md)
// No aim, goal tree, checks or GTM template: the report says why for each.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { BODY_BYTES, jsonBytes } from "../../src/knowledge/schema.js";
import { mkNote } from "./read-board.mjs";
import { plainText } from "./tidy.mjs";

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const arr = (v) => (Array.isArray(v) ? v : []);
const DOC_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

export const isBankDir = (dir) => isFile(join(dir, "00_CANON", "screens.json")) && isFile(join(dir, "60_DECISIONS", "decision-log.md")) && isDir(join(dir, "05_BLUEPRINTS"));

// the pack exporter's card kinds (tools/export-pack.mjs kinds[]): label, idPattern and roleVisibility as the bank declared them
const ROLES = ["internal-eng", "leader", "external-ai", "external-logistics"];
export const BANK_KINDS = {
  blueprint: { label: "Blueprints", idPattern: "^[a-z][a-z0-9-]*$" },
  journey: { label: "Flows & journeys", idPattern: "^[a-z][a-z0-9-]*$" },
  source: { label: "Sources", idPattern: "^S-\\d+$" },
  decision: { label: "Decisions (ADRs)", idPattern: "^ADR-\\d+$" },
  app: { label: "Apps & repos", idPattern: "^[a-z][a-z0-9-]*$" },
};
// the open-questions register's legend: 🔴 blocker · 🟠 important · 🟡 track
const SEVERITY = [["\u{1F534}", "blocker"], ["\u{1F7E0}", "important"], ["\u{1F7E1}", "track"]];
const severityOf = (line) => { let at = Infinity, s = null; for (const [e, w] of SEVERITY) { const i = line.indexOf(e); if (i >= 0 && i < at) { at = i; s = w; } } return s; };
const frontStatus = (md) => (/^status:\s*(.+)$/m.exec(md) || [])[1] || "";

// sections(md, re) -> [{ m, body }]: each heading match and the text up to the next match (verbatim, trailing space trimmed)
function sections(md, re) {
  const marks = [...md.matchAll(re)];
  return marks.map((m, i) => ({ m, body: md.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : md.length).trimEnd() + "\n" }));
}

// the open-questions register: every top-level "- " bullet naming a **Q-…** id, its indented continuation lines, its section
export function registerRows(md) {
  const rows = [];
  let section = "", cur = null;
  for (const line of md.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) { section = h[1].trim(); cur = null; continue; }
    if (/^- /.test(line)) {
      const q = /\*\*(Q-[A-Za-z0-9-]+)\*\*/.exec(line);
      // ruled: the ✅ leads the bullet, or follows its bold id at once ("- **Q-x** ✅ RULED same day → ADR-099"; the bank's own
      // exporter reads only the first form, so two ruled rows read as open there — P2, 2026-10-01)
      cur = q ? { qid: q[1], section, head: line.slice(2), more: [], ruled: /^- ✅/.test(line) || line.includes(`**${q[1]}** ✅`) } : null;
      if (cur) rows.push(cur);
      continue;
    }
    if (cur && /^\s+\S/.test(line)) { cur.more.push(line); continue; }
    cur = null;
  }
  return rows;
}

// ruledOn(head) -> the date a ruled bullet states for its ruling ("RESOLVED 2026-08-28", "RULED 2026-09-02 (owner)"), else null
export function ruledOn(head) {
  const m = /\b(?:RESOLVED|RULED|ANSWERED|DECIDED|CLOSED)\b\**[^0-9\n]{0,12}(\d{4}-\d{2}-\d{2})\b/.exec(String(head));
  return m ? m[1] : null;
}

// plainLine(head, qid) -> the register bullet as words a person reads on Decisions and the Map: the ruled mark (✅), the
// severity marks (kept as `severity`), the bold **Q-…** id (kept as the qid) and the separator after it are dropped, and the
// markdown is unwrapped by the readers' one rule (import/tidy.mjs plainText: **…**, *…*, `…`, [[x]] → x, [t](u) → t). Formatting only: no word is changed. The bullet
// as written stays verbatim in a gap node's data.line.
export function plainLine(head, qid) {
  let t = String(head);
  t = t.replace(/^\s*\u2705\s*/u, "");
  for (const [e] of SEVERITY) t = t.split(e).join("");
  if (qid) t = t.replace(new RegExp(`\\*\\*${qid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*\\*`), "");
  t = plainText(t);   // the readers' one markdown rule (import/tidy.mjs)
  t = t.replace(/\s{2,}/g, " ").trim().replace(/^\u2705\s*/u, "").replace(/^(\u2014|-|:|\u2013)\s*/, "").trim();
  return t || String(head).trim();
}

// the pack exporter's rendering of one app-registry row (tools/export-pack.mjs, verbatim logic)
function appCard(a) {
  const lines = [
    `# ${a.name}`, "",
    `- **id:** ${a.id}`,
    `- **context:** ${a.context || ""}`,
    a.screens ? `- **screens:** ${a.screens}` : "",
    a.bp ? `- **blueprint:** ${a.bp}` : "",
    "", "## Repos", "",
    "| repo | type | role | dev_state | activity/30d | viz-lyze |",
    "|---|---|---|---|---|---|",
    ...(a.repos || []).map((r) => `| ${r.repo} | ${r.type || ""} | ${r.role || ""} | ${r.dev_state || ""} | ${r.activity_30d ?? ""} | ${r.vizlyze ?? ""} |`),
    a.shared_backends ? `\n**Shared backends:** ${a.shared_backends.join(", ")}` : "",
    a.note ? `\n> ${a.note}` : "",
  ].filter((l) => l !== "");
  return lines.join("\n") + "\n";
}

// evalCases(dir) -> the eval table rows under evals/ (a row whose first cell is a case id: E1, **E7b**, M12, B13 …)
function evalCases(dir) {
  let n = 0;
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (isDir(p)) walk(p); else if (f.endsWith(".md")) n += readFileSync(p, "utf8").split("\n").filter((l) => /^\|\s*(\*\*)?[A-Z]{1,3}\d+[a-z]?(\*\*)?\s*\|/.test(l)).length; } };
  if (isDir(join(dir, "evals"))) walk(join(dir, "evals"));
  return n;
}

// the knowledge notes filed as docs (folder → every *.md in it), and what is left out
const DOC_DIRS = ["00_CANON", "10_STRATEGY", "20_PRODUCT", "30_AI", "40_ECONOMICS", "50_OPERATIONS", "80_CALLS", "85_ALIGNMENTS"];
const DOC_FILES = ["60_DECISIONS/leader-questionnaire.md", "70_SOURCES/timeline.md", "TODO.md"];
const DOC_SKIP = {
  "00_CANON/agent-constitution.md": "the agents' constitution for working the bank — the bank's machinery",
  "00_CANON/screen-register-full.md": "a generated view of 00_CANON/screens.json (filed as screen nodes)",
};

export function readBank(dirIn) {
  const dir = resolve(dirIn);
  if (!isBankDir(dir)) throw new Error(`${dir}: not a knowledge bank (needs 00_CANON/screens.json, 60_DECISIONS/decision-log.md and 05_BLUEPRINTS/)`);
  const read = (p) => readFileSync(join(dir, p), "utf8");
  const readJson = (p) => { try { return JSON.parse(read(p)); } catch (e) { throw new Error(`${p}: not readable JSON (${e.message})`); } };
  const notes = [], notImported = [], why = {};
  const note = mkNote(notes);
  const manifest = isFile(join(dir, "02_AGENT_R", "tenant-manifest.json")) ? readJson("02_AGENT_R/tenant-manifest.json") : {};
  const brainKey = (arr(manifest.projects)[0] || {}).key || null;

  why.aim = "the bank declares no aim: 10_STRATEGY/what-is-siru.md marks its vision/mission wording synthesised, not owner-stated (open question Q-vision, filed as a gap)";
  why.goal = "the bank has no goal tree (TODO.md and PLAN.md are prose worklogs; its own pack exporter left goals.json empty)";
  why.gtm = "the bank declares no GTM template";
  why.queue = "the bank has no build queue (TODO.md, its living backlog, is filed as a doc)";

  // ---- questions + gaps ← 60_DECISIONS/open-questions.md (a ruled row's date: the date of the ADR it names)
  const ADR_HEAD = /^### (ADR-\d+) · (.+) \((\d{4}-\d{2}-\d{2}) · (accepted|superseded)\)\s*$/gm;
  const decisionLog = read("60_DECISIONS/decision-log.md");
  const adrDate = new Map([...decisionLog.matchAll(ADR_HEAD)].map((m) => [m[1], m[3]]));
  const reg = registerRows(read("60_DECISIONS/open-questions.md"));
  const questionRows = [], gaps = [], seenQ = new Set();
  for (const r of reg) {
    if (seenQ.has(r.qid)) { notImported.push({ what: `open-questions.md ${r.qid} (a second bullet)`, why: "a duplicate qid (the first bullet wins)" }); continue; }
    seenQ.add(r.qid);
    const more = r.more.length ? r.more.join("\n") : null;
    const severity = severityOf(r.head);
    if (r.ruled) {
      const adr = (/ADR-\d+/.exec(r.head) || [])[0] || null;
      const row = { qid: r.qid, question: plainLine(r.head, r.qid), why: more, area: r.section, severity, status: "decided", label: adr, options: [] };
      if (adr && adrDate.has(adr)) { row.updated = adrDate.get(adr); note("question", "decidedAt ← the date of the ADR the ruled line names (its decision-log heading)"); }
      else { const d = ruledOn(r.head); if (d) { row.updated = d; note("question", "decidedAt ← the date the ruled line states (\"RESOLVED 2026-08-28\"), when it names no dated ADR"); } }
      questionRows.push(row);
    } else {
      gaps.push({ qid: r.qid, question: plainLine(r.head, r.qid), area: r.section, severity, detail: more, line: r.head });
    }
  }
  note("question", "a ruled bullet (✅) files as a decided question with no options: question = the bullet's line as words (plainLine: the ✅, severity marks, bold id and emphasis dropped; a gap keeps the line verbatim in data.line), why = its indented lines, label = the ADR it names (the pack exporter's rule), area = its section");
  note("question", "severity ← the register's legend (🔴 blocker · 🟠 important · 🟡 track), the first marker on the line");
  if (questionRows.some((q) => !q.label)) note("question", "a ruled bullet names no ADR: its label is null (the ruling is in the question text)");

  // ---- the model
  const canon = readJson("00_CANON/screens.json");
  const atlas = isFile(join(dir, "serve/lib/atlas/atlas.json")) ? readJson("serve/lib/atlas/atlas.json") : { apps: {} };
  const eagle = isFile(join(dir, "serve/lib/eagle/eagle.json")) ? readJson("serve/lib/eagle/eagle.json") : {};
  const onAtlas = new Map();   // screen id -> [{ app, band, shot, provenance, stale }]
  for (const [app, a] of Object.entries(atlas.apps || {})) for (const b of arr(a.bands)) for (const s of arr(b.screens)) {
    if (!onAtlas.has(s.id)) onAtlas.set(s.id, []);
    onAtlas.get(s.id).push({ app, band: b.band, name: s.name, shot: s.shot, provenance: s.provenance ?? null, stale: !!s.stale });
  }
  const screens = [];
  let reserved = 0;
  for (const s of arr(canon.screens)) {
    if (String(s.band || "").startsWith("reserved")) { reserved++; continue; }
    const { screen, name, ...rest } = s;
    const row = { id: screen, name, ...rest, lane: s.band };
    const at = onAtlas.get(screen);
    // a screen the atlas renders in two apps (siru's Ask SIRU and Intent Results: the SIRU App and the SIRU Assistant) names
    // them all, data.surface a list (the door takes one since D1b item 20), so each app's Screens view shows it
    if (at) { const apps = [...new Set(at.map((x) => x.app))]; row.surface = apps.length > 1 ? apps : apps[0]; row.atlas = at; }
    else row.surface = s.band;   // a screen no app renders: its band is its app (the canon's own grouping of the apps)
    screens.push(row);
  }
  if (reserved) notImported.push({ what: `00_CANON/screens.json: ${reserved} reserved slots`, why: "a reserved number in the register (name RESERVED, no intent by design) — no screen" });
  note("node", "screen: the canon row verbatim in data (n, sub, band, bandName, intent) + data.lane = its band (the Map groups screens by lane)");
  note("node", "screen: a screen the atlas renders carries data.surface = its atlas app and data.atlas = [{app, band, name, shot, provenance, stale}] (a screen in two or more apps names them all: data.surface a list)");
  note("node", "screen: a screen the atlas does not render carries data.surface = its band (each band of the canon is one app: SIRU Core, Node ERP, Merchant OS …), so the Screens view groups every screen by its app");
  const lanes = arr(eagle.bandOrder).map((id) => ({ id, label: ((eagle.bands || {})[id] || {}).name || id, rows: ((eagle.bands || {})[id] || {}).rows ?? null }));
  const surfaces = Object.keys(atlas.apps || {});
  const surfaceLabels = Object.fromEntries(surfaces.map((k) => [k, (atlas.apps[k] && atlas.apps[k].name) || k]));
  // the bands that are a surface (a screen of theirs is not on the atlas), in the canon's order, named by the canon's bandName
  for (const r of screens) for (const sf of [].concat(r.surface)) if (!surfaces.includes(sf)) { surfaces.push(sf); surfaceLabels[sf] = r.bandName || ((eagle.bands || {})[sf] || {}).name || sf; }
  const edges = arr(eagle.edges).filter((e) => Array.isArray(e) && e.length >= 2).map((e) => ({ from: String(e[0]), to: String(e[1]) }));
  const services = arr(eagle.comps).map(({ id, name, ...rest }) => ({ id, name, ...rest }));
  if (services.length) note("node", "service: every Eagle component (eagle.json comps) — kind service · api-group · integration · table-group kept in data.kind, its grade (present · partial · absent) in data.grade; none is an endpoint or a table row, so the Doors and Data layers stay empty");
  const model = { surfaces, surfaceLabels, lanes, screens, edges, architecture: { services } };

  // ---- cards
  const cardDefs = [];
  const def = (kind, cards, from) => cardDefs.push({ from, kind, label: BANK_KINDS[kind].label, idPattern: BANK_KINDS[kind].idPattern, roleVisibility: ROLES, cards });
  const mdIn = (d, skip = []) => (isDir(join(dir, d)) ? readdirSync(join(dir, d)).filter((f) => f.endsWith(".md") && !skip.includes(f)).sort() : []);
  def("decision", sections(decisionLog, ADR_HEAD)
    .map(({ m, body }) => ({ id: m[1], name: m[2], status: m[4], body })), "60_DECISIONS/decision-log.md (### ADR-NNN sections)");
  def("blueprint", mdIn("05_BLUEPRINTS", ["_METHOD.md", "_TEMPLATE.md", "_index.md"]).map((f) => { const body = read(`05_BLUEPRINTS/${f}`); return { id: f.slice(0, -3), name: null, status: frontStatus(body), body }; }), "05_BLUEPRINTS/");
  def("journey", mdIn("55_FLOWS", ["_index.md"]).map((f) => { const body = read(`55_FLOWS/${f}`); return { id: f.slice(0, -3), name: null, status: frontStatus(body), body }; }), "55_FLOWS/");
  if (isFile(join(dir, "70_SOURCES/source-registry.md"))) {
    def("source", sections(read("70_SOURCES/source-registry.md"), /^### (S-\d+) · (.+)$/gm).map(({ m, body }) => ({ id: m[1], name: m[2], status: "", body })), "70_SOURCES/source-registry.md (### S-NN sections)");
  }
  if (isFile(join(dir, "20_PRODUCT/app-registry.json"))) {
    def("app", arr(readJson("20_PRODUCT/app-registry.json").apps).map((a) => ({ id: a.id, name: a.name, status: arr(a.repos).some((r) => r.dev_state === "shipped") ? "shipped" : "planned", body: appCard(a) })), "20_PRODUCT/app-registry.json (rendered as the pack exporter renders it)");
    note("card", "app: the body is the pack exporter's markdown rendering of the app-registry.json row (the only markdown an app has); status shipped when a repo's dev_state is shipped, else planned (the exporter's rule)");
  }
  note("card", "kinds, labels, idPatterns and roleVisibility as the bank's pack exporter declares them (tools/export-pack.mjs); a blueprint's or journey's name is its first heading");

  // ---- docs
  const docs = [];
  const doc = (rel, path) => {
    const body = read(rel);
    if (!DOC_PATH.test(path)) { notImported.push({ what: rel, why: `its doc path ${path} is not one the door takes` }); return; }
    if (jsonBytes(body) > BODY_BYTES) { notImported.push({ what: rel, why: `over the door's ${BODY_BYTES.toLocaleString("en-US")}-byte body cap` }); return; }
    docs.push({ path, from: rel, body });
  };
  for (const f of mdIn("85_ALIGNMENTS/capsules")) doc(`85_ALIGNMENTS/capsules/${f}`, `capsules/${f}`);
  for (const d of DOC_DIRS) for (const f of mdIn(d)) { const rel = `${d}/${f}`; if (DOC_SKIP[rel]) notImported.push({ what: rel, why: DOC_SKIP[rel] }); else doc(rel, rel); }
  for (const rel of DOC_FILES) if (isFile(join(dir, rel))) doc(rel, rel);

  const cases = evalCases(dir);
  why.check = `${cases} eval cases in evals/ (worker acceptance, Agent R golden and behaviour, workflow smoke, MCP) — every one grades the retired siru-agent-r worker (its /health, keys, capsules, MCP doors, R's replies), not SIRU the product`;
  for (const [what, whyNot] of [
    ["60_DECISIONS/open-questions.md (the page) · decision-log.md preamble · question-titles.json", "the register's rows are filed (questions, gaps, decision cards); the page, the log's preamble and nine short titles are not"],
    ["55_FLOWS/ as flow nodes", "the journeys are prose with no {actor, does} steps — filed as journey cards, not flow nodes"],
    ["01_META/ · 02_AGENT_R/ · packs/ · evals/ · tools/", "the bank's method and Agent R's own docs, packs, evals and tools — the machinery, not SIRU knowledge"],
    ["90_SESSIONS/ · ACTIVE.md · PLAN.md", "session logs, the active-session state and the bank's build plan — working logs"],
    ["README.md · CLAUDE.md · BOOT.md · HINTS.md · INSTALL.md · OPERATING.md · GAPS.md", "how to work the bank, and its pack exporter's own gaps — the machinery"],
    ["70_SOURCES/archive/ · 70_SOURCES/inbox/ · 30_AI/ai-scope/*.html · 02_AGENT_R/reports/", "raw source documents (pdf, docx, html) — each summarised as a source card"],
    ["serve/lib/eagle/eagle.json (svcTables, svcApis, machine, questions, proposals, brokenLinks)", "the as-built service map and the Eagle canvas's own overlays — the components and edges are filed; no endpoint or table rows exist to file"],
    ["serve/lib/contracts/ · graph/ · arch/ · architecture/ · intakes.json · intake-blobs.json · serve/drift.json", "extraction contracts, derived graphs and grades, a copy of the proposed architecture note, and the intake log"],
    ["dist/ · state.json · siru-brain.html", "the pack and canvas exports and the rendered bank (derived; dist/ is gitignored)"],
  ]) notImported.push({ what, why: whyNot });

  return {
    layout: "bank", dir, brainKey, about: null, aim: null, tree: null, treeSource: null, flows: [], flowsFrom: null,
    questionRows, rowsFrom: ["60_DECISIONS/open-questions.md"], mdKinds: [], gaps, gapsFrom: "60_DECISIONS/open-questions.md",
    gapReason: "an open question with no options (an open question needs >= 2) — filed as a `node` of type gap instead",
    gtm: null, cardDefs, roleDefault: ROLES, docs, capsuleRoles: null,
    board: { dir, missing: [], model, checks: null, queue: null, briefs: new Map() },
    notImported, notes, why,
  };
}
