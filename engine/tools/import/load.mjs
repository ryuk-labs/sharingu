// engine/tools/import/load.mjs — the importer reads a brain's declared DATA and refuse every data fault BEFORE anything is written
// (D2 closed schema · D5 the measure · D6 the tree, the questions (as D18 measured), the flows and the citations).
// loadBrain(dir) -> the model every generator reads; a fault throws DataFault (the CLI exits 1).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { brainReader, fault, pointerGet, KIT_DIR } from "./lib.mjs";
import { kitShapeErrors, LANE_KEYS, QID_RE, MEASURE_FIELDS, DECISION_STATUSES, FLOW_STATUSES, GTM_FIELDS, KIT_OUTPUTS } from "./schema.mjs";

const SLUG = /^[a-z][a-z0-9-]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string" && v.trim() !== "";
function regex(src, what, flags = "") {
  try { return new RegExp(src, flags); } catch (e) { return fault(`${what}: ${JSON.stringify(src)} is not a regular expression (${e.message})`); }
}

export function readMap(dir) {
  const p = join(dir, "02_AGENT_R", "publish-map.json");
  if (!existsSync(p)) fault(`${dir}: no 02_AGENT_R/publish-map.json — not a brain`);
  let map;
  try { map = JSON.parse(readFileSync(p, "utf8")); } catch (e) { fault(`02_AGENT_R/publish-map.json is not JSON (${e.message})`); }
  return map;
}

// the project key: the last segment of servePrefix (serve/ws/<key>) — the ONE place a key lives (D4)
export function projectOf(map) {
  const parts = String(map.servePrefix || "").replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 3 || parts[0] !== "serve" || parts[1] !== "ws" || !parts[2]) fault(`servePrefix ${JSON.stringify(map.servePrefix)} is not serve/ws/<key> — the kit reads the project key from it and nowhere else`);
  return parts[2];
}

// the measure (D5, home.js measureOf's shape): null, or the six fields; anything else refused
export function checkMeasure(m, what) {
  if (m === null || m === undefined) return null;
  if (!isObj(m)) fault(`${what}: measure must be null or {${MEASURE_FIELDS.join(", ")}} (got ${JSON.stringify(m)})`);
  const extra = Object.keys(m).filter((k) => !MEASURE_FIELDS.includes(k));
  if (extra.length) fault(`${what}: measure carries ${extra.join(", ")} — only {${MEASURE_FIELDS.join(", ")}}`);
  if (!str(m.name)) fault(`${what}: measure.name must name the number`);
  for (const k of ["value", "prior"]) if (m[k] != null && !(typeof m[k] === "number" && Number.isFinite(m[k]))) fault(`${what}: measure.${k} must be a number or null`);
  for (const k of ["period", "priorPeriod"]) if (m[k] != null && typeof m[k] !== "string") fault(`${what}: measure.${k} must be a string`);
  if (!str(m.source)) fault(`${what}: measure.source must name where the number comes from`);
  return { name: m.name, value: m.value ?? null, period: m.period || "", prior: m.prior ?? null, priorPeriod: m.priorPeriod || "", source: m.source };
}

// D6 rules 1-4b (the tree)
export function checkTree(tree, what) {
  if (!Array.isArray(tree) || !tree.length) fault(`${what}: goals.tree is missing or empty`);
  const ids = new Set();
  for (const n of tree) {
    const at = `${what} goals.tree[${n && n.id}]`;
    if (!isObj(n) || typeof n.id !== "string" || !SLUG.test(n.id)) fault(`${at}: id must match ${SLUG}`);
    if (ids.has(n.id)) fault(`${at}: duplicate id`);
    ids.add(n.id);
    if (!str(n.title)) fault(`${at}: no title`);
    if (!Array.isArray(n.dimensions)) fault(`${at}: dimensions must be a list`);
    for (const d of n.dimensions) if (!LANE_KEYS.includes(d)) fault(`${at}: dimension ${JSON.stringify(d)} is not one of the engine's lane keys (${LANE_KEYS.join(", ")})`);
    if (n.target != null && !(typeof n.target === "number" && n.target > 0)) fault(`${at}: target must be a number > 0`);
    if (n.weight != null && !(typeof n.weight === "number" && n.weight > 0)) fault(`${at}: weight must be a number > 0`);
    if (n.outcomeMetric != null && typeof n.outcomeMetric !== "boolean") fault(`${at}: outcomeMetric must be a boolean`);
    if (n.owner != null && !str(n.owner)) fault(`${at}: owner must be a non-empty string`);
    const due = n.due ?? n.dueBy;
    if (due != null && !(typeof due === "string" && DAY.test(due) && !Number.isNaN(Date.parse(due)))) fault(`${at}: due must be YYYY-MM-DD`);
  }
  const roots = tree.filter((n) => n.parent == null);
  if (roots.length !== 1) fault(`${what}: goals.tree has ${roots.length} roots (parent null) — exactly one`);
  const byId = new Map(tree.map((n) => [n.id, n]));
  for (const n of tree) {
    if (n.parent == null) continue;
    if (!ids.has(n.parent)) fault(`${what} goals.tree[${n.id}]: parent ${JSON.stringify(n.parent)} is not a node`);
    const seen = new Set([n.id]);
    for (let p = n.parent; p != null; p = (byId.get(p) || {}).parent ?? null) {
      if (seen.has(p)) fault(`${what} goals.tree[${n.id}]: a parent cycle`);
      seen.add(p);
    }
  }
  return tree;
}

// D18: the question rule, as measured on both brains
export function checkRow(r, what) {
  const at = `${what}[${r && r.qid}]`;
  if (!isObj(r)) fault(`${what}: a row is not an object`);
  if (!QID_RE.test(String(r.qid || ""))) fault(`${at}: qid must match the engine's QID_RE ${QID_RE}`);
  if (!str(r.question)) fault(`${at}: no question`);
  if (!DECISION_STATUSES.includes(r.status)) fault(`${at}: status ${JSON.stringify(r.status)} is not one of ${DECISION_STATUSES.join("/")}`);
  if (r.options != null && !Array.isArray(r.options)) fault(`${at}: options must be a list`);
  const opts = r.options || [];
  opts.forEach((o, i) => { if (!isObj(o) || !str(o.what)) fault(`${at}: option ${i + 1} has no \`what\``); });
  if (r.affects != null && !(Array.isArray(r.affects) && r.affects.every((a) => typeof a === "string"))) fault(`${at}: affects must be a list of refs`);
  const choice = r.choice == null ? "" : r.choice;
  if (r.status === "open") {
    if (opts.length < 2) fault(`${at}: an open question needs >= 2 options (it has ${opts.length})`);
    if (choice !== "") fault(`${at}: open, yet it carries a choice`);
    return;
  }
  if (!opts.length) return;   // a ruling recorded with no menu is exempt
  if (opts.length === 1) fault(`${at}: a decided question with options needs >= 2 (it has 1)`);
  const idx = Number.isInteger(choice) ? choice : typeof choice === "string" && /^[a-z]$/i.test(choice) ? choice.toLowerCase().charCodeAt(0) - 97 : null;
  const named = idx != null && idx >= 0 && idx < opts.length;
  if (!named && !str(r.label)) fault(`${at}: decided with options, yet it names no choice (an index or a letter) and carries no label`);
}

export function loadBrain(dirIn) {
  const dir = realpathSync(resolve(dirIn));
  const map = readMap(dir);
  if (!isObj(map.kit)) fault(`${dir}: its publish map declares no \`kit\` section — nothing for the kit to build`);
  const errs = kitShapeErrors(map.kit);
  if (errs.length) fault(errs.slice(0, 8).join("; "));
  if (map.checks != null && !(Array.isArray(map.checks) && map.checks.every(str))) fault("publish map `checks` must be a list of commands");
  const kit = map.kit;
  const project = projectOf(map);
  const R = brainReader(dir);
  const m = { dir, map, kit, project, about: str(map.about) ? map.about : null, R };

  // ---- aim (D5)
  if (kit.aim.file) {
    const a = R.json(kit.aim.file, "kit.aim");
    if (!isObj(a) || !str(a.aim)) fault(`kit.aim: ${kit.aim.file} has no \`aim\``);
    m.aim = { text: a.aim.trim(), measure: checkMeasure(a.measure, `kit.aim ${kit.aim.file}`), source: `${kit.aim.file} aim`, measureSource: `${kit.aim.file} measure` };
  } else {
    const doc = R.json(kit.aim.from, "kit.aim");
    const t = pointerGet(doc, kit.aim.pointer, "kit.aim");
    if (!str(t)) fault(`kit.aim: ${kit.aim.from} ${kit.aim.pointer} is not a non-empty string`);
    const ms = kit.aim.measurePointer ? pointerGet(doc, kit.aim.measurePointer, "kit.aim.measurePointer") : null;
    m.aim = { text: t.trim(), measure: checkMeasure(ms, `kit.aim ${kit.aim.from}`), source: `${kit.aim.from} ${kit.aim.pointer}`,
      measureSource: kit.aim.measurePointer ? `${kit.aim.from} ${kit.aim.measurePointer}` : "none declared (null: Home's EMPTY sentence)" };
  }

  // ---- the tree (D6 rules 1-4)
  m.tree = null;
  if (kit.goals) {
    const man = R.json(kit.goals, "kit.goals");
    m.tree = checkTree(man && man.goals && man.goals.tree, `kit.goals ${kit.goals}`);
    m.treeSource = kit.goals;
  }
  const nodeIds = new Set((m.tree || []).map((n) => n.id));

  // ---- citations
  let cited = null, sourceKey = null;
  if (kit.citations) {
    const notes = R.text(kit.citations.file, "kit.citations");
    sourceKey = regex(kit.citations.sourceKey, "kit.citations.sourceKey");
    cited = (id) => notes.includes("### `" + id + "`");
    for (const id of nodeIds) if (!cited(id)) fault(`goals.tree[${id}]: uncited — no \`### \\\`${id}\\\`\` section in ${kit.citations.file}`);
  }

  // ---- flows (D6 rule 4b)
  m.flows = null;
  if (kit.flows) {
    const doc = kit.flows.file ? R.json(kit.flows.file, "kit.flows") : R.json(kit.flows.from, "kit.flows");
    const list = kit.flows.file ? (isObj(doc) ? doc.flows : doc) : pointerGet(doc, kit.flows.pointer, "kit.flows");
    if (!Array.isArray(list)) fault("kit.flows: no flows list");
    const fids = new Set();
    for (const f of list) {
      const at = `flows[${f && f.id}]`;
      if (!isObj(f) || typeof f.id !== "string" || !SLUG.test(f.id)) fault(`${at}: id must match ${SLUG}`);
      if (fids.has(f.id)) fault(`${at}: duplicate id`);
      fids.add(f.id);
      if (!FLOW_STATUSES.includes(f.status)) fault(`${at}: status ${JSON.stringify(f.status)} is not ${FLOW_STATUSES.join("/")}`);
      if (f.goalRef != null && !nodeIds.has(f.goalRef)) fault(`${at}: goalRef ${JSON.stringify(f.goalRef)} is not a goal-tree node`);
      if (!Array.isArray(f.steps)) fault(`${at}: steps must be a list`);
      if (cited) {
        if (!cited("flow:" + f.id)) fault(`${at}: uncited — no \`### \\\`flow:${f.id}\\\`\` section in ${kit.citations.file}`);
        if (!f.steps.length) fault(`${at}: no step`);
      }
      f.steps.forEach((st, i) => {
        if (!isObj(st) || !str(st.actor)) fault(`${at}.steps[${i}]: no actor`);
        if (!str(st.does)) fault(`${at}.steps[${i}]: no does`);
        if (sourceKey && !(typeof st.source === "string" && sourceKey.test(st.source))) fault(`${at}.steps[${i}]: source must cite a keyed source (${kit.citations.sourceKey})`);
      });
    }
    m.flows = list;
  }

  // ---- decisions (D20) + the mdSplit card kinds
  m.decisions = []; m.mdKinds = [];
  const qids = new Set();
  const addRow = (r, what) => {
    if (qids.has(r.qid)) fault(`${what}[${r.qid}]: duplicate qid`);
    qids.add(r.qid);
    m.decisions.push(r);
  };
  for (const [i, src] of (kit.decisions || []).entries()) {
    const what = `kit.decisions[${i}]`;
    if (src.rows) {
      const doc = R.json(src.rows, what);
      const rows = src.pointer ? pointerGet(doc, src.pointer, what) : doc;
      if (!Array.isArray(rows)) fault(`${what}: ${src.rows}${src.pointer || ""} is not a list of rows`);
      for (const r of rows) {
        checkRow(r, `${what} ${src.rows}`);
        if (cited && !cited(r.qid)) fault(`${src.rows}[${r.qid}]: uncited — no \`### \\\`${r.qid}\\\`\` section in ${kit.citations.file}`);
        addRow(r, `${what} ${src.rows}`);
      }
    } else {
      const md = R.text(src.mdSplit, what);
      const re = regex(src.heading, `${what}.heading`, "gm");
      const sup = regex(src.supersededIf, `${what}.supersededIf`, "i");
      const lead = src.stripLead ? regex(src.stripLead, `${what}.stripLead`, "s") : null;
      const idRe = src.card.idPattern ? regex(src.card.idPattern, `${what}.card.idPattern`) : null;
      const marks = [...md.matchAll(re)];
      if (!marks.length) fault(`${what}: ${src.mdSplit} has no heading matching ${src.heading}`);
      const cards = [];
      marks.forEach((mk, j) => {
        const id = mk[1], title = String(mk[2] || "").trim();
        if (!id || !title) fault(`${what}: the heading regex must capture (1) an id and (2) a title`);
        if (idRe && !idRe.test(id)) fault(`${what}: ${id} does not match its card idPattern ${src.card.idPattern}`);
        if (!QID_RE.test(id)) fault(`${what}: ${id} is not a qid the engine accepts (${QID_RE})`);
        const end = j + 1 < marks.length ? marks[j + 1].index : md.length;
        const body = md.slice(mk.index, end).trimEnd() + "\n";
        const status = sup.test(title) ? "superseded" : "decided";
        const rest = body.split("\n").slice(1).join("\n");
        const updated = (/^(\d{4}-\d{2}-\d{2})/m.exec(rest) || [])[1] || "";
        let para = body.split("\n").slice(1).join(" ");
        if (lead) para = para.replace(lead, "");
        const rationale = para.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\s+/g, " ").trim().slice(0, 500);
        addRow({ qid: id, question: title, status, choice: "", label: "", rationale, updated }, what);
        cards.push({ id, name: title, status, body });
      });
      m.mdKinds.push({ key: src.card.kind, label: src.card.label, idPattern: src.card.idPattern, roleVisibility: src.card.roleVisibility, cards });
    }
  }

  // ---- gaps (D26): each one also an open decision
  m.gaps = [];
  if (kit.gaps) {
    const g = R.json(kit.gaps, "kit.gaps");
    const list = Array.isArray(g) ? g : isObj(g) && Array.isArray(g.gaps) ? g.gaps : fault(`kit.gaps: ${kit.gaps} is not a list of gaps`);
    for (const x of list) {
      const at = `${kit.gaps}[${x && x.qid}]`;
      if (!isObj(x) || !QID_RE.test(String(x.qid || ""))) fault(`${at}: qid must match the engine's QID_RE`);
      const extra = Object.keys(x).filter((k) => !["qid", "question", "ref", "affects", "waitingOn", "updated", "rationale"].includes(k));
      if (extra.length) fault(`${at}: unknown field(s) ${extra.join(", ")}`);
      if (!str(x.question)) fault(`${at}: no question`);
      if (!str(x.ref)) fault(`${at}: no ref (the section the gap leaves empty)`);
      if (!(Array.isArray(x.affects) && x.affects.every((a) => typeof a === "string"))) fault(`${at}: affects must be a list of refs`);
      if (!str(x.waitingOn)) fault(`${at}: no waitingOn`);
      if (x.updated != null && typeof x.updated !== "string") fault(`${at}: updated must be a string`);
      if (x.rationale != null && typeof x.rationale !== "string") fault(`${at}: rationale must be a string`);
      m.gaps.push(x);
      addRow({ qid: x.qid, question: x.question, status: "open", choice: "", label: "", rationale: x.rationale ?? "", updated: x.updated ?? "", waitingOn: x.waitingOn, affects: x.affects }, "kit.gaps");
    }
  }

  // ---- the GTM template (D7)
  m.gtm = null;
  const gtm = kit.gtm === undefined ? null : kit.gtm;
  if (gtm) {
    let bytes, from;
    if (gtm.template) {
      if (gtm.template !== "default") fault(`kit.gtm.template ${JSON.stringify(gtm.template)} — the product ships ONE template: "default"`);
      bytes = readFileSync(join(KIT_DIR, "templates", "gtm.json")); from = "engine/tools/import/templates/gtm.json";
    } else { bytes = R.bytes(gtm.file, "kit.gtm"); from = gtm.file; }
    let t;
    try { t = JSON.parse(bytes.toString("utf8")); } catch { fault(`kit.gtm: ${from} is not JSON`); }
    const miss = GTM_FIELDS.filter((k) => !(isObj(t) && k in t));
    if (miss.length) fault(`kit.gtm: ${from} lacks ${miss.join(", ")}`);
    if (!Array.isArray(t.activityKinds) || !t.activityKinds.length || !t.activityKinds.every(str)) fault(`kit.gtm: ${from} activityKinds must be non-empty strings`);
    m.gtm = { bytes, from };
  }

  // ---- copies · files · the served-shape change register
  const fixed = KIT_OUTPUTS.filter((o) => !o.endsWith("/**"));
  for (const c of kit.copies || []) {
    if (!c.to.startsWith("serve/") || c.to.includes("..")) fault(`kit.copies: ${c.to} — a copy lands under serve/`);
    if (fixed.includes(c.to) || c.to.startsWith("serve/pack/") || c.to === "serve/stamp.json" || c.to === "serve/tenant.json") fault(`kit.copies: ${c.to} is a path the kit or the close owns`);
    R.bytes(c.from, "kit.copies");
  }
  for (const f of kit.files || []) if (!f.to.startsWith("files/") || f.to.includes("..")) fault(`kit.files[${f.id}]: ${f.to} — a download lands under files/`);
  m.changes = null;
  if (kit.changes) {
    const c = R.json(kit.changes.file, "kit.changes");
    const ok = Array.isArray(c) && c.every((x) => isObj(x) && str(x.version) && str(x.at) && Array.isArray(x.changedIds) && x.changedIds.every((i) => typeof i === "string"));
    if (!ok) fault(`kit.changes: ${kit.changes.file} is not the served register [{version, at, changedIds[]}] (D17: a register in another shape is refused)`);
    m.changes = c;
  }
  return m;
}
