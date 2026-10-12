// src/knowledge/schema.js — the knowledge registry and its rules. One entry per kind: its table, its key, its columns
// (the field a caller sends, the column it lands in, its type) and the checks a write must pass. Pure, no I/O:
// src/knowledge/write.js loads the stored rows and applies the plan planKnowledge returns; tools/knowledge-selftest.mjs
// runs the same function on fixtures. The field rules follow the brain reader's (tools/import/load.mjs): the goal tree,
// the aim's measure, a question and its options, gaps, flows and the GTM template.
import { LANE_KEYS } from "../lanes.js";
import { readerKeys, roleClassOf } from "../hats.js";
import { bodyOf, PREPARED, IMAGE_BASE64_HINT, TINY_PNG_BASE64, RENDER_FORMATS, CALL_BODIES_MAX, CALL_IMAGES_MAX, HTML_MAX, STYLE_MAX, IMAGE_MAX, WIREFRAME_MAX, SHA_RE, sizeWords } from "../render.js";
import { validateWireframe, WIREFRAME_HINT } from "../wireframe.js";
import { REVIEW_DAYS_DEFAULT, REVIEW_DAYS_MAX } from "./fresh.js";
import { nearOf } from "../maprefs.js";
import { orgPath } from "../orgpath.js";

// ---- THE ONE REGISTRY (sprint 3, B1; docs/plan/MCP.md §4) ----
// Every kind below declares, beside its table and its columns: `shows` (where it appears: the tab, the page's path pattern
// and the data-region, as DATA; a place may hold only for some rows, `when`), `example` (ONE valid knowledge item,
// and what it needs filed first), `preview(data, ctx)` (one short human line for a filing preview, pure), `checklist`
// (the items that say this part of a project is complete, as declarations: B3 computes them) and `rules` (the cross-row
// rules, in words). The door's validation, src/formats.js (the `formats` read), the contract (tools/make-door-contract.py)
// and holes' "shows on" all read them here: a kind cannot be fileable and not shown, or shown and not fileable.
// TAB_KEYS: the eight tabs (src/shell.js TABS; tools/knowledge-selftest.mjs holds the two in lockstep)
export const TAB_KEYS = ["home", "build", "gtm", "goals", "decisions", "map", "broadcast", "control"];
// the areas a checklist item belongs to (B3 counts only the areas a project has: an app, GTM)
export const CHECK_AREAS = ["core", "app", "gtm", "proof", "agents"];
// how sure a knowledge item is (docs/plan/MCP.md §9 demand 7)
export const CONFIDENCES = ["confirmed", "direction", "proposal", "unknown"];
// a goal's status (the one-pass fix 4a): where the work stands, as the owner states it. "done" reads 100% on Goals even with no
// measured cell; the other two read the cells. The usual synonyms are taken and stored as one of the three.
export const GOAL_STATUSES = ["done", "in progress", "not started"];
const GOAL_STATUS_OF = { done: "done", complete: "done", completed: "done", shipped: "done", finished: "done",
  "in progress": "in progress", "in-progress": "in progress", in_progress: "in progress", doing: "in progress", active: "in progress", started: "in progress", wip: "in progress",
  "not started": "not started", "not-started": "not started", not_started: "not started", todo: "not started", "to do": "not started", planned: "not started", backlog: "not started", open: "not started" };
export const goalStatusOf = (v) => GOAL_STATUS_OF[String(v).trim().toLowerCase()];

// a question's id (src/decisions.js re-exports it for the screens)
export const QID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const MAX_OPS = 200;
// the two ops a knowledge item takes, for every kind: upsert adds or changes (merging the fields sent), remove removes (planKnowledge;
// the preview and file tools' item schema, src/formats.js ITEM_SCHEMA)
export const KNOWLEDGE_OPS = ["upsert", "remove"];
// M6: how many of a screen's takes its inspector lists (src/knowledge/screens.js TAKES_MAX says the same number)
export const TAKES_SHOWN = 6;
export const MAX_OPTIONS = 26;   // A..Z: a choice may name an option by its letter
export const DECISION_STATUSES = ["open", "provisional", "decided", "superseded", "moot"];
// architecture: one node per project carrying the architecture's summary, diagram {groups, nodes, edges} and crossing rules
export const NODE_TYPES = ["surface", "lane", "screen", "door", "table", "entity", "flow", "gap", "dep", "evidence", "service", "architecture"];
export const NODE_STATUSES = ["live", "planned", "retired"];
export const GAP_STATUSES = ["open", "closed"];
export const EDGE_KINDS = ["nav", "reads", "writes", "relation", "depends", "blocks", "flow-step"];
export const MEASURE_FIELDS = ["name", "value", "period", "prior", "priorPeriod", "source"];
export const GTM_FIELDS = ["identity", "activityKinds", "fields", "activityTemplate", "proofRule", "outcomeModel"];
// the question fields that record a ruling: only the owner writes them (a member files open questions and their text)
export const RULING_FIELDS = ["choice", "label", "rationale", "decidedBy", "decidedAt", "supersededBy"];
// the kinds a roleVisibility list guards. rolesAdmit is THE role rule (core.js mayRead's capsule rule over a list): the
// owner reads every item; anyone else one whose list is absent or empty, or names one of their keys. The read side
// (src/knowledge/store.js visibleTo, src/knowledge/cards.js's SQL twin) and the write side (planKnowledge) both use it. A
// card must pass its own list AND its kind's (k_card_kinds.role_visibility).
// `who` is the reader (a person: src/hats.js readerKeys, their role, the typed role they held before migrate-044 and the
// access hats their admin set, migrate-045; never the hats they picked themselves) or a bare role string (that one key).
export const ROLE_LIMITED = new Set(["doc", "card", "card_kind"]);
export const rolesAdmit = (who, roles) => {
  const role = who && typeof who === "object" ? who.role : who;
  if (role === "owner" || !Array.isArray(roles) || !roles.length) return true;
  const keys = who && typeof who === "object" ? readerKeys(who) : new Set([who]);
  return roles.some((r) => keys.has(r));
};
// a capsule is the doc capsules/<role>.md (src/knowledge/docs.js CAPSULE_PREFIX); `brief` serves one to an agent first
const CAPSULE_DOC = /^capsules\//;

const SLUG = /^[a-z][a-z0-9-]{0,79}$/;
// M3: a project's key, the form src/admin.js addProject files (a-z, 0-9 and dashes, 2 to 40 characters): what a node's
// ownedBy names
export const PROJECT_KEY_RE = /^[a-z0-9-]{2,40}$/;
// an id of a check, a card or a node: no spaces, no comma and no "|" (a composite key's ids are joined with "|")
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/+#@{}-]{0,119}$/;
const DOC_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// a render's state or variant, and a screen's state names: at most 120 characters, no "|" (a composite key's parts are
// joined with "|"), no control character, no space at either end; "" is a render key's default (the screen as a whole)
const NAME_OK = (v) => typeof v === "string" && v.length <= 120 && v === v.trim() && !/[|\x00-\x1f\x7f]/.test(v);
const STATE_NAME = (v) => NAME_OK(v) && v !== "";
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/;
const DIM = (v) => Number.isInteger(v) && v >= 1 && v <= 10000;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => typeof v === "string" && v.trim() !== "";
const strList = (v) => Array.isArray(v) && v.every(str);
const laneList = (v) => Array.isArray(v) && v.every((d) => LANE_KEYS.includes(d));
const positive = (v) => v > 0;
const isDay = (v) => DAY.test(v) && !Number.isNaN(Date.parse(v));
// a real calendar day (Date.parse rolls 2026-02-30 over to March): the new date fields use it (sprint 3, B1)
export const isRealDay = (v) => typeof v === "string" && DAY.test(v) && (() => { const d = new Date(v + "T00:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; })();
const compiles = (v) => { try { new RegExp(v); return true; } catch { return false; } };
// a card kind's idPattern runs on every card id the door checks (the one-pass fix 6: enforced by preview as by the write), so a
// pattern that could backtrack without end on a 120-character id (a quantified group holding a quantifier, "(a+)+") is refused
const safePattern = (v) => compiles(v) && !/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d*,)/.test(v);
const docPath = (v) => !v.includes("..") && !v.includes("//");

// the aim's measure (the kit's checkMeasure): null, or the six fields with a name and a source -> normalized; else undefined
// absenceOf(v) -> a RULED absence, {none: true, why} (D1b items 18 and 19: "no measure for now", "no product model, by
// design" are facts a project declares, not holes), null, or undefined (refused). why: the ruling, at most 400 characters.
export const ABSENCE_WHY_MAX = 400;
export function absenceOf(v) {
  if (v === null) return null;
  if (!isObj(v) || v.none !== true || Object.keys(v).some((k) => !["none", "why"].includes(k)) || !str(v.why) || v.why.length > ABSENCE_WHY_MAX) return undefined;
  return { none: true, why: v.why.trim() };
}
function measureOf(m) {
  if (m === null) return null;
  if (isObj(m) && "none" in m) return absenceOf(m);   // a measure ruled absent: complete, and said so on Home
  if (!isObj(m) || Object.keys(m).some((k) => !MEASURE_FIELDS.includes(k)) || !str(m.name) || !str(m.source)) return undefined;
  for (const k of ["value", "prior"]) if (m[k] != null && !(typeof m[k] === "number" && Number.isFinite(m[k]))) return undefined;
  for (const k of ["period", "priorPeriod"]) if (m[k] != null && typeof m[k] !== "string") return undefined;
  return { name: m.name, value: m.value ?? null, period: m.period || "", prior: m.prior ?? null, priorPeriod: m.priorPeriod || "", source: m.source };
}
// the GTM template (the kit's rule): every GTM_FIELDS key present, activityKinds a non-empty list of strings
const gtmTemplate = (t) => isObj(t) && GTM_FIELDS.every((k) => k in t) && strList(t.activityKinds) && t.activityKinds.length > 0;
// the size limits a snapshot row is bounded by (tools/versions-selftest.mjs F6, rowBytesMax): an option's text in characters, and a
// doc's or a card's body in BYTES — the UTF-8 bytes of the body as a JSON string (jsonBytes: what it costs inside a version's
// snapshot row, where D1 caps a row at 2,000,000 bytes; a CJK character is 3, a newline, tab, quote or backslash 2, any other
// control character 6)
export const OPTION_WHAT_MAX = 2000;
export const OPTION_TRADEOFF_MAX = 4000;
export const BODY_BYTES = 500000;
const UTF8 = new TextEncoder();
export const jsonBytes = (v) => UTF8.encode(JSON.stringify(v)).length;
// a question's options, inline on its op: [{what, tradeoff?}] -> normalized; else undefined
function optionsOf(v) {
  if (!Array.isArray(v) || v.length > MAX_OPTIONS) return undefined;
  const out = [];
  for (const o of v) {
    if (!isObj(o) || !str(o.what) || o.what.length > OPTION_WHAT_MAX || Object.keys(o).some((k) => k !== "what" && k !== "tradeoff")) return undefined;
    if (o.tradeoff != null && (typeof o.tradeoff !== "string" || o.tradeoff.length > OPTION_TRADEOFF_MAX)) return undefined;
    out.push({ what: o.what, tradeoff: str(o.tradeoff) ? o.tradeoff : null });
  }
  return out;
}

const snake = (f) => f.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
// col(field, type, opts): type text · int · real · bool · json · choice (an option index or letter, stored as text).
// opts: c (the column, default snake_case of the field) · key · keyDef (a key field's value when the op leaves it out) ·
// req · def (a new row's default) · max (characters; JSON counts its serialized length) · bytes (a text's jsonBytes, on top
// of max) · re · enum · ok(v) · fix(v) (normalizes, undefined = refused) · hint (what to send) · derived (the door fills it
// from the op's body, never the caller: a render's or a style's hash and bytes)
const col = (f, t, o = {}) => ({ f, c: snake(f), t, max: t === "json" ? 20000 : 4000, ...o });

// source (the one-pass fix 6, owner 2026-10-01): where a knowledge item was recorded — a question's ruling, a goal, a doc, the
// aim — the SAME small shape as a contribution's source (src/shapes.js re-exports these): a list of at most SOURCE_MAX
// {kind, ref, label?}. sourceListOf(v) -> the list normalized | null (none) | undefined (refused). Optional, shown quietly.
export const SOURCE_KINDS = ["url", "file", "artifact", "thread", "commit"];
export const SOURCE_MAX = 10;
export const SOURCE_REF_MAX = 400, SOURCE_LABEL_MAX = 200;
export function sourceListOf(v) {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length > SOURCE_MAX) return undefined;
  const out = [];
  for (const s of v) {
    if (!isObj(s) || Object.keys(s).some((k) => !["kind", "ref", "label"].includes(k)) || !SOURCE_KINDS.includes(s.kind)) return undefined;
    if (!str(s.ref) || s.ref.length > SOURCE_REF_MAX) return undefined;
    if (s.kind === "url" && !/^https?:\/\/\S+$/i.test(s.ref.trim())) return undefined;
    if (s.kind === "artifact" && !/^(?:\/artifact\/)?[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(s.ref.trim())) return undefined;
    if (s.label != null && (typeof s.label !== "string" || s.label.length > SOURCE_LABEL_MAX)) return undefined;
    out.push({ kind: s.kind, ref: s.ref.trim(), ...(str(s.label) ? { label: s.label.trim() } : {}) });
  }
  return out.length ? out : null;
}
const SOURCE = () => col("source", "json", { max: 8000, fix: sourceListOf,
  hint: `where it was recorded: [{kind, ref, label?}], at most ${SOURCE_MAX}, kind one of ${SOURCE_KINDS.join(", ")} (a url is an http(s) link, a commit its hash, a file its path), ref at most ${SOURCE_REF_MAX} characters, label ${SOURCE_LABEL_MAX}` });

// a goal's budget (sprint 4, F1; migrate-064; P3's fault 1: finance read no money): what the goal holds of money, {allocated,
// spent, currency, source}. allocated and spent are numbers 0 or more (at least one is sent), currency an ISO-4217 code (three
// letters, stored in capitals), source where the figures come from (a short text). A goal's budget is its own money, not its
// children's: the Goals read adds the tree up (src/goals.js rollBudgets). budgetOf(v) -> the budget normalized | null (none) |
// undefined (refused).
export const BUDGET_FIELDS = ["allocated", "spent", "currency", "source"];
export const BUDGET_SOURCE_MAX = 200;
const CURRENCY = /^[A-Za-z]{3}$/;
const money = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
export function budgetOf(v) {
  if (v === null) return null;
  if (!isObj(v) || Object.keys(v).some((k) => !BUDGET_FIELDS.includes(k))) return undefined;
  if (typeof v.currency !== "string" || !CURRENCY.test(v.currency.trim())) return undefined;
  if (v.allocated == null && v.spent == null) return undefined;
  for (const k of ["allocated", "spent"]) if (v[k] != null && !money(v[k])) return undefined;
  if (v.source != null && (typeof v.source !== "string" || v.source.length > BUDGET_SOURCE_MAX)) return undefined;
  return { ...(v.allocated != null ? { allocated: v.allocated } : {}), ...(v.spent != null ? { spent: v.spent } : {}),
    currency: v.currency.trim().toUpperCase(), ...(str(v.source) ? { source: v.source.trim() } : {}) };
}
// a card's refs (sprint 4, F1; migrate-064; P3's fault 6: a copy card could not name the claim it relies on): the cards it relies
// on, card/<kind>/<id> (the ref grammar `read` speaks), at most CARD_REFS_MAX, each a card of the same project the writer may read
// (crossRules, against the project's own cards; never another project's). cardRefOf(ref) -> { kind, id, key } | null;
// cardRefsOf(v) -> the list, repeats dropped, in the order sent | null (none) | undefined (refused).
export const CARD_REFS_MAX = 12;
const CARD_REF = /^card\/([a-z][a-z0-9-]{0,79})\/([A-Za-z0-9][A-Za-z0-9._:/+#@{}-]{0,119})$/;
export function cardRefOf(ref) {
  const m = typeof ref === "string" ? CARD_REF.exec(ref.trim()) : null;
  return m ? { kind: m[1], id: m[2], key: `${m[1]}|${m[2]}` } : null;
}
export function cardRefsOf(v) {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length > CARD_REFS_MAX || !v.every((r) => cardRefOf(r))) return undefined;
  const out = [...new Set(v.map((r) => r.trim()))];
  return out.length ? out : null;
}

// asOf and confidence (B1, docs/plan/MCP.md §9 demand 7): when a knowledge item was true or last checked, and how sure it
// is. On cards and docs: the kinds that carry free claims (a check has its grades, a question its ruling, a goal its status
// and due date, a node its live / planned / retired). Optional; nothing ages yet (stale by age is B4).
const FRESH = () => [
  col("asOf", "text", { max: 10, ok: isRealDay, hint: "a date, YYYY-MM-DD: when it was true or last checked" }),
  col("confidence", "text", { max: 40, enum: CONFIDENCES, hint: `how sure it is: one of ${CONFIDENCES.join(", ")}` }),
];
// a place a kind shows: the tab, the page's path pattern ({field} is the item's own field, {data.x} a field of its data),
// the page's data-region, and what shows there; `when` narrows it to some rows ({field, is: [values]} or {field, prefix});
// `tabFrom` names where the tab really comes from (a card: its card kind's tab; a card kind: its own tab field)
const at = (tab, path, region, what, o = {}) => ({ tab, path, region, what, ...o });
// a checklist item (B3 computes it; B1 declares it): id, the question it answers in plain words, its area, what filling it
// takes, the path of the kind's `shows` place it fills, and over what (`over`: the rows the item counts, in words)
const item = (id, area, question, fills, shows, over = null) => ({ id, area, question, fills, shows, ...(over ? { over } : {}) });
// the preview's words (pure)
const UTF8_ = new TextEncoder();
const clipW = (v, n = 80) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const nameOf = (ctx, ref) => clipW((ctx && ctx.names && ctx.names[ref]) || ref, 60);
const words = (...xs) => xs.filter(Boolean).join(", ");
const freshWords = (d) => words(d.confidence, d.asOf && `as of ${d.asOf}`);
const amount = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const budgetWords = (b) => `budget ${words(b.allocated != null && `${amount(b.allocated)} allocated`, b.spent != null && `${amount(b.spent)} spent`)} ${b.currency}`;
const NODE_WORD = { surface: "App", lane: "Lane", screen: "Screen", door: "Door", table: "Table", entity: "Entity", flow: "Flow", gap: "Gap", dep: "Dependency", evidence: "Evidence", service: "Service", architecture: "Architecture" };
const EDGE_WORD = { nav: "leads to", reads: "reads", writes: "writes", relation: "relates to", depends: "depends on", blocks: "blocks", "flow-step": "is a step of" };
const TAB_WORD = { home: "Home", build: "Build", gtm: "GTM", goals: "Goals", decisions: "Decisions", map: "Map", broadcast: "Broadcast", control: "Control" };
const sizeOfBody = (b) => (typeof b === "string" ? UTF8_.encode(b).length : b != null ? UTF8_.encode(JSON.stringify(b)).length : null);

// M3 · links between systems: a part of this project's model that another project of the org owns (a hosted backend, a shared
// service) names that project's key, ownedBy, on its node (data.ownedBy) or on a part of the architecture's diagram
// (data.diagram.nodes[].ownedBy). The form is checked here; that it is an active project the writer may read, and not the
// writer's own, is checked by crossRules against the keys the write door hands in (write.js prepareOwners): a name check on
// the org's projects table, never a read of the other project's data.
const OWNED_BY_FORM = "a-z, 0-9 and dashes, 2 to 40 characters";
const ownerKeyOk = (v) => typeof v === "string" && PROJECT_KEY_RE.test(v);
// ownedByIn(node) -> the project keys a node row names in ownedBy (its own, then its diagram parts'), each once
export function ownedByIn(r) {
  const d = r && isObj(r.data) ? r.data : null;
  if (!d) return [];
  const out = new Set();
  if (typeof d.ownedBy === "string") out.add(d.ownedBy);
  const parts = isObj(d.diagram) && Array.isArray(d.diagram.nodes) ? d.diagram.nodes : [];
  for (const x of parts) if (isObj(x) && typeof x.ownedBy === "string") out.add(x.ownedBy);
  return [...out];
}

// the architecture's diagram (sprint 3, the Map's Arch view, src/archview.js): the fields the view added are checked only
// when sent, so every diagram filed before files as it did. archIssue(data) -> what is wrong, in words, or null.
// copy: off-screen (the write door's refusal hint)
const ARCH_RULE = "an architecture's data.diagram takes groups [{id, label, order}], nodes [{id, title, sub, kind, group, ownedBy}], edges [{from, to, label, main}], paths [{name, steps: [{from, to, says}]}] (the journeys Play walks) and seam {group, label}; data.crossing takes [{rule, because, nodes}]";
const ARCH_PATHS_MAX = 12, ARCH_STEPS_MAX = 40;
function archIssue(d) {
  const dg = d.diagram, arr = (v) => (Array.isArray(v) ? v : []);
  if (dg !== undefined && !isObj(dg)) return "data.diagram is not an object";
  const g = isObj(dg) ? dg : {};
  const groups = new Set(arr(g.groups).filter((x) => isObj(x) && str(x.id)).map((x) => String(x.id)));
  const nodes = new Set(arr(g.nodes).filter((x) => isObj(x) && str(x.id)).map((x) => String(x.id)));
  const isNode = (v) => typeof v === "string" && nodes.has(v);
  for (const x of arr(g.groups)) if (isObj(x) && x.order !== undefined && !(typeof x.order === "number" && Number.isFinite(x.order))) return `group "${clipW(x.id, 40)}" has an order that is not a number`;
  for (const x of arr(g.nodes)) if (isObj(x) && x.group !== undefined && !(typeof x.group === "string" && groups.has(x.group))) return `node "${clipW(x.id, 40)}" names a group that is not one of data.diagram.groups`;
  for (const x of arr(g.nodes)) if (isObj(x) && x.ownedBy !== undefined && !ownerKeyOk(x.ownedBy)) return `node "${clipW(x.id, 40)}" has an ownedBy that is not a project's key (${OWNED_BY_FORM})`;
  for (const x of [...arr(g.edges), ...arr(g.links)]) {
    if (!isObj(x)) continue;
    if (x.main !== undefined && typeof x.main !== "boolean") return "an edge's main is not true or false";
    if ((x.from !== undefined || x.to !== undefined) && !(isNode(x.from) && isNode(x.to))) return `an edge's from and to (${clipW(x.from, 30)} to ${clipW(x.to, 30)}) are not both ids of data.diagram.nodes`;
  }
  if (g.paths !== undefined) {
    if (!Array.isArray(g.paths) || g.paths.length > ARCH_PATHS_MAX) return `data.diagram.paths is not a list of at most ${ARCH_PATHS_MAX} journeys`;
    for (const p of g.paths) {
      if (!isObj(p) || !str(p.name) || p.name.length > 120) return "a journey in data.diagram.paths has no name (a string of at most 120 characters)";
      if (!Array.isArray(p.steps) || !p.steps.length || p.steps.length > ARCH_STEPS_MAX) return `the journey "${clipW(p.name, 40)}" has not 1 to ${ARCH_STEPS_MAX} steps`;
      for (const st of p.steps) {
        if (!isObj(st) || !isNode(st.from) || !isNode(st.to) || st.from === st.to) return `a step of the journey "${clipW(p.name, 40)}" does not go from one node of data.diagram.nodes to another`;
        if (st.says !== undefined && !(typeof st.says === "string" && st.says.length <= 200)) return `a step of the journey "${clipW(p.name, 40)}" says something that is not a string of at most 200 characters`;
      }
    }
  }
  if (g.seam !== undefined && !(isObj(g.seam) && typeof g.seam.group === "string" && groups.has(g.seam.group) && (g.seam.label === undefined || (typeof g.seam.label === "string" && g.seam.label.length <= 120)))) return "data.diagram.seam is not {group: the id of one of data.diagram.groups, label}";
  for (const x of arr(d.crossing)) if (isObj(x) && x.nodes !== undefined && !(Array.isArray(x.nodes) && x.nodes.every(isNode))) return "a crossing rule's nodes are not all ids of data.diagram.nodes";
  return null;
}

export const KINDS = {
  aim: {
    table: "k_aim", noun: ["aim", "aims"], search: [],
    cols: [
      col("aim", "text", { req: true, max: 2000, hint: "the project's aim, in a sentence or two" }),
      col("measure", "json", { fix: measureOf, hint: `null, or {${MEASURE_FIELDS.join(", ")}} with name and source set and value and prior numbers or null, or {none: true, why} when the owner ruled there is no measure for now (a ruled absence: the aim is complete and Home says so)` }),
      // D1b item 19 (migrate-058): a project that is operations or go-to-market only declares it holds no product model
      col("productModel", "json", { max: 1000, fix: absenceOf, hint: "null, or {none: true, why} when the project holds no product model by design (no apps, screens or doors: operations or go-to-market only): the Map says so instead of an empty canvas" }),
      SOURCE(),
      ...FRESH(),
    ],
    line: "what the project is for, and the number that says it is working (one per project)",
    shows: [at("home", "/home", "aim", "the aim and its measure, at the top of Home")],
    example: { op: { kind: "aim", op: "upsert", data: { aim: "Every team files its work through one door and sees it land.", measure: { name: "weekly active teams", value: 12, period: "this week", prior: 9, priorPeriod: "last week", source: "the ledger" } } } },
    preview: (d) => `Aim: ${clipW(d.aim)}${d.measure && d.measure.name ? `, measured by ${clipW(d.measure.name, 40)}` : ""}`,
    checklist: [item("aim", "core", "Does the project say what it is for, and how it knows it is working?", "one aim, with its measure once there is one", "/home")],
  },
  goal: {
    table: "k_goals", noun: ["goal", "goals"], search: ["id", "title"],
    line: "one goal of the project's goal tree: one root, every other goal under a parent",
    shows: [at("goals", "/goals", "goal-tree", "its place in the goal tree"), at("goals", "/goals/{id}", "node", "its own page: its cells, what fed it, its checks")],
    example: { op: { kind: "goal", op: "upsert", data: { id: "paid-orders", parent: "grow-revenue", title: "Paid orders", dimensions: ["gtm"], target: 40, due: "2026-12-31",
      budget: { allocated: 12000, spent: 3400, currency: "EUR", source: "the Q4 marketing plan" } } },
      needs: [{ kind: "goal", op: "upsert", data: { id: "grow-revenue", parent: null, title: "Grow revenue", dimensions: [] } }] },
    preview: (d, ctx) => `Goal: ${clipW(d.title || d.id, 60)}${d.parent ? `, under ${nameOf(ctx, d.parent)}` : d.parent === null ? ", the root goal" : ""}${isObj(d.budget) ? `, ${budgetWords(d.budget)}` : ""}`,
    rules: ["exactly one goal has no parent (the root)", "every parent is a goal of the project", "no goal is its own ancestor", "a goal with children is removed only with them, or after they move",
      "a budget is the goal's own money, not its children's: Goals adds the tree up, per currency (a tree in more than one currency reads mixed)"],
    checklist: [item("goal-tree", "core", "Is there one goal tree: a root goal and the goals under it, each with the lanes that measure it?", "a root goal and at least one goal under it", "/goals")],
    cols: [
      col("id", "text", { key: true, re: SLUG, hint: 'a lowercase slug, e.g. "grow-revenue"' }),
      col("parent", "text", { re: SLUG, hint: "the parent goal's id, or null for the one root goal" }),
      col("title", "text", { req: true, max: 400, hint: "the goal in a few words" }),
      col("dimensions", "json", { req: true, def: [], ok: laneList, hint: `a list of lane keys (${LANE_KEYS.join(", ")}), e.g. ["gtm"], or []` }),
      col("weight", "real", { ok: positive, hint: "its share of its parent's %: a number greater than 0 (left out: 1, an equal share with its siblings)" }),
      col("target", "real", { ok: positive, hint: "how many landed contributions of each of its lanes make that lane 100%: a number greater than 0 (left out: 1)" }),
      col("outcomeMetric", "bool", { hint: "true when its target counts outcomes (a contribution's outcome number), not contributions: true or false" }),
      col("owner", "text", { max: 200 }),
      col("due", "text", { ok: isDay, hint: "a date, YYYY-MM-DD" }),
      col("note", "text", { max: 8000 }),
      col("status", "text", { max: 40, enum: GOAL_STATUSES, fix: goalStatusOf, hint: `where it stands: one of ${GOAL_STATUSES.join(", ")} (done reads 100% on Goals even with nothing measured)` }),
      col("sort", "int", { hint: "a whole number" }),
      SOURCE(),
      ...FRESH(),   // D1b item 18 (migrate-058): a goal filed as a proposal or a direction shows that mark on Goals
      // F1 (migrate-064): its own money; Goals rolls it up the tree, the goal's page shows it beside its measure, brief {for: "finance"} lists it
      col("budget", "json", { max: 1000, fix: budgetOf, hint: `null, or {allocated, spent, currency, source}: allocated and spent numbers 0 or more (at least one of them), currency an ISO-4217 code of three letters (e.g. "EUR"), source where the figures come from (at most ${BUDGET_SOURCE_MAX} characters). The goal's own money, not its children's: Goals adds the tree up` }),
    ],
    rule: (r) => (r.parent != null && r.parent === r.id ? [{ field: "parent", hint: "another goal's id (a goal is never its own parent), or null for the root" }] : []),
  },
  question: {
    table: "k_questions", noun: ["question", "questions"], search: ["qid", "question"],
    extra: ["options"],   // rides inline on the op and lands in k_options
    extraDocs: { options: { type: "list", limits: `at most ${MAX_OPTIONS}; what at most ${OPTION_WHAT_MAX} characters, tradeoff ${OPTION_TRADEOFF_MAX}`, hint: "the question's options, A first: [{what, tradeoff?}]; an open question needs 2 or more; a ruling already made carries its options and its choice, or the ruled option alone (choice 0) when the rejected options are not on record" } },
    line: "a question the project must decide, with its options; the owner rules it. A ruling already made is a decided question: its options and its choice, or the ruled option alone",
    shows: [at("decisions", "/decisions", "question-list", "the list of questions, open first"), at("decisions", "/question/{qid}", "options", "its own page: its options and its ruling")],
    example: { op: { kind: "question", op: "upsert", data: { qid: "Q-pricing-1", question: "Do we charge per seat or per project?", why: "Pricing decides who signs up first.", status: "open", options: [{ what: "Per seat", tradeoff: "grows with the team" }, { what: "Per project", tradeoff: "simple, caps revenue" }] } } },
    preview: (d) => `Question: ${clipW(d.question || d.qid)}${Array.isArray(d.options) ? `, ${d.options.length} option${d.options.length === 1 ? "" : "s"}` : ""}${d.status && d.status !== "open" ? `, ${d.status}` : ""}`,
    rules: ["an open question needs 2 or more options and no choice: it is the owner's to rule",
      "a ruling already made is filed as a decided question (status \"decided\", the owner's): with its options and its choice (the option's index, 0 = A, or its letter); or, when the rejected options are not on record, with the ruled option alone (options [{what: <the ruling>}], choice 0); a ruled question with no option at all says the ruling in label",
      "only the owner rules a question (status other than open, choice, label, rationale, decidedBy, decidedAt, supersededBy)",
      "source says where the ruling was recorded: [{kind, ref, label?}]"],
    // sprint 3 S3b: who files what (formats answers it, so a member is never led into a refusal); the write door's own rule
    ownerOnly: [{ what: "a decided question: status other than open, or choice, label, rationale, decidedBy, decidedAt or supersededBy", instead: "file the question with status \"open\" and its options; the owner rules it with rule_question" }],
    checklist: [
      item("questions-options", "core", "Does every open question carry the options to choose from?", "2 or more options on each open question", "/decisions", "every open question"),
      item("rulings-owed", "core", "Has the owner ruled every question that waits on them?", "a ruling (rule_question) on each open question the owner owes", "/question/{qid}", "every open question"),
    ],
    cols: [
      col("qid", "text", { key: true, re: QID_RE, hint: 'an id of letters, digits, ".", "_" or "-", e.g. "Q-pricing-1"' }),
      col("question", "text", { req: true, max: 4000, hint: "the question, in a sentence" }),
      col("why", "text", { max: 8000 }),
      col("area", "text", { max: 200 }),
      col("severity", "text", { max: 40 }),
      col("status", "text", { req: true, def: "open", enum: DECISION_STATUSES, hint: `one of ${DECISION_STATUSES.join(", ")}` }),
      col("choice", "choice", { max: 200, hint: "the chosen option's index (0 = A) or letter, or null" }),
      col("label", "text"),
      col("rationale", "text", { max: 8000 }),
      col("decidedBy", "text", { max: 200 }),
      col("decidedAt", "text", { max: 40 }),
      col("affects", "json", { ok: strList, hint: "a list of refs (strings)" }),
      col("blocks", "json", { ok: strList, hint: "a list of qids (strings)" }),
      col("whoOwes", "text", { max: 200 }),
      col("waitingOn", "text", { max: 400 }),
      col("implStatus", "text", { max: 200 }),
      col("supersededBy", "text", { max: 200 }),
      SOURCE(),
    ],
  },
  check: {
    table: "k_checks", noun: ["check", "checks"], search: ["id", "title"],
    line: "what done looks like (given, when, then), naming the nodes, goals or questions it grades; a grade item ({grade: {checkId, verdict, proof}}, through preview then file) grades it",
    shows: [at("map", "/map?node={refs}", "inspector", "under every node it names, with its latest grade; the node lights from it"),
      at("goals", "/goals", "goal-tree", "the passed, failed and ungraded counts of every goal it names")],
    example: { op: { kind: "check", op: "upsert", data: { id: "AC.pricing.01", title: "The pricing page shows the annual plan", given: "a visitor on the pricing page", when: "they pick annual", then: "the annual price shows", refs: ["screen:pricing"] } } },
    preview: (d, ctx) => `Check: ${clipW(d.title || d.id, 60)}${Array.isArray(d.refs) && d.refs.length ? `, grades ${d.refs.slice(0, 3).map((r) => nameOf(ctx, r)).join(", ")}${d.refs.length > 3 ? ` and ${d.refs.length - 3} more` : ""}` : ""}`,
    checklist: [
      item("checks-screens", "proof", "Does every screen have a check that says what done looks like?", "a check naming the screen in its refs", "/map?node={refs}", "every screen node"),
      item("checks-doors", "proof", "Does every door have a check?", "a check naming the door in its refs", "/map?node={refs}", "every door node"),
      item("grades", "proof", "Is every check graded, with proof?", "a grade with proof (a command and what it printed, a link, or an artifact) on each check, filed through preview then file", "/goals", "every check"),
    ],
    cols: [
      col("id", "text", { key: true, re: ID, hint: 'an id without spaces, e.g. "AC.landing.01"' }),
      col("kind", "text", { max: 80 }),
      col("method", "text", { max: 80 }),
      col("severity", "text", { max: 40 }),
      col("title", "text", { req: true, max: 1000, hint: "what the check proves, in a line" }),
      col("given", "text", { max: 8000 }),
      col("when", "text", { c: "when_", max: 8000 }),
      col("then", "text", { c: "then_", max: 8000 }),
      col("sourceType", "text", { max: 80 }),
      col("sourceId", "text", { max: 200 }),
      col("refs", "json", { ok: strList, hint: "a list of the node, goal or question ids it grades" }),
      col("rulings", "json", { ok: strList, hint: "a list of qids" }),
      col("status", "text", { max: 40 }),
    ],
  },
  card: {
    table: "k_cards", noun: ["card", "cards"], search: ["id", "name"],
    cols: [
      col("kind", "text", { key: true, re: SLUG, hint: 'the card kind, a lowercase slug, e.g. "decision"' }),
      col("id", "text", { key: true, re: ID, hint: 'an id without spaces, e.g. "decision-12"' }),
      col("name", "text", { req: true, max: 400, hint: "the card's name" }),
      col("status", "text", { max: 40 }),
      col("body", "text", { c: "body_md", max: 500000, bytes: BODY_BYTES, hint: `the card's markdown, at most ${BODY_BYTES.toLocaleString("en-US")} bytes as UTF-8 JSON (a CJK character counts 3; a newline, tab, quote or backslash 2)` }),
      col("roleVisibility", "json", { ok: strList, hint: "a list of role keys" }),
      ...FRESH(),
      SOURCE(),   // D2 (migrate-059): where the card was recorded, shown on its page
      // F1 (migrate-064): the cards it relies on, drawn on its page under "Relies on"; no tab's list reads them
      col("refs", "json", { max: 4000, fix: cardRefsOf, hint: `the cards it relies on: a list of at most ${CARD_REFS_MAX} refs card/<kind>/<id>, each a card of this project (read {kind: "card"} lists them), e.g. ["card/claim/claim-measured"]` }),
    ],
    line: "any other piece of knowledge (a claim, a target, a decision record, a plan item), sorted by its card kind",
    // sprint 3 S3b: who files what (formats answers it); the write door's own rule (roleRefusal)
    ownerOnly: [{ what: "roleVisibility (who may read it)", instead: "leave it out: a new one is open to every seated reader, and a stored one keeps its value" }],
    // D2 (B7): a card has its own page (the read page of its ref) and a row in its kind's list on the tab its kind names
    // (src/tablists.js, the Lists region); a kind that names no tab lists in the Library only
    shows: [at("map", "/read?ref=card/{kind}/{id}", "card", "its own page: its fields, source, confidence, as-of date and who may read it; a row in its card kind's list on the tab the kind names", { tabFrom: "card_kind.tab" })],
    example: { op: { kind: "card", op: "upsert", data: { kind: "claim", id: "claim-onboarding-1", name: "Teams file their first contribution in under ten minutes", body: "Measured on the last five new teams.", asOf: "2026-09-30", confidence: "direction", refs: ["card/claim/claim-measured"] } },
      needs: [{ kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims", tab: "gtm" } },
        { kind: "card", op: "upsert", data: { kind: "claim", id: "claim-measured", name: "We measure every new team's first week" } }] },
    rules: ["each of refs is a card of this project you may read, filed before or in the same batch; never the card itself"],
    preview: (d, ctx) => `Card (${clipW((ctx && ctx.kindLabel) || d.kind, 30)}): ${clipW(d.name || d.id, 60)}${freshWords(d) ? `, ${freshWords(d)}` : ""}${Array.isArray(d.refs) && d.refs.length ? `, relies on ${d.refs.length} card${d.refs.length === 1 ? "" : "s"}` : ""}`,
    checklist: [item("gtm-lists", "gtm", "Do the GTM lists (the card kinds whose tab is gtm: claims, targets, copy) hold their cards?", "cards of each card kind that names the gtm tab", "/read?ref=card/{kind}/{id}", "every card kind with tab gtm"),
      // sprint 3 B4, stale by age: a dated card or doc older than its shelf life is due for review
      item("gtm-fresh", "gtm", "Is every dated GTM card and doc still fresh, checked within its shelf life?", "a newer asOf on each one due for review, once its claim is checked again", "/read?ref=card/{kind}/{id}", "every card of a gtm-tab kind and every doc under gtm/ with an asOf")],
  },
  card_kind: {
    table: "k_card_kinds", noun: ["card kind", "card kinds"], search: ["key", "label"],
    cols: [
      col("key", "text", { key: true, re: SLUG, hint: 'a lowercase slug, e.g. "decision"' }),
      col("label", "text", { req: true, max: 200, hint: "the kind's name on screen" }),
      col("idPattern", "text", { max: 400, ok: safePattern, hint: "a regular expression every card id of the kind must match, checked by preview and by the write (no quantified group that holds a quantifier, e.g. (a+)+)" }),
      col("roleVisibility", "json", { ok: strList, hint: "a list of role keys" }),
      // the tab its cards list on (B1, docs/plan/MCP.md §9 demand 5): data, so a project's own kinds say where they belong
      col("tab", "text", { max: 40, enum: TAB_KEYS, hint: `the tab its cards list on: one of ${TAB_KEYS.join(", ")}` }),
      // its cards' shelf life (B4, stale by age; migrate-052): a card falls due for review this many days after its asOf
      col("reviewAfterDays", "int", { ok: (v) => v >= 1 && v <= REVIEW_DAYS_MAX, hint: `how many days a card of this kind stays fresh after its asOf before it is due for review: a whole number from 1 to ${REVIEW_DAYS_MAX} (left out: ${REVIEW_DAYS_DEFAULT})` }),
    ],
    line: "a kind of card the project uses (claims, targets, copy, decisions), with its label and the tab its cards list on",
    // sprint 3 S3b: who files what (formats answers it); the write door's own rule (roleRefusal)
    ownerOnly: [{ what: "roleVisibility (who may read it)", instead: "leave it out: a new one is open to every seated reader, and a stored one keeps its value" }],
    shows: [at("map", "/read?ref=card/{key}/<a card id>", "card", "its label heads each of its cards' pages; its cards list on its tab (the Lists region), else in the Library", { tabFrom: "tab" })],
    example: { op: { kind: "card_kind", op: "upsert", data: { key: "claim", label: "Claims", tab: "gtm" } } },
    preview: (d) => `Card kind: ${clipW(d.label || d.key, 60)}${d.tab ? `, lists on ${TAB_WORD[d.tab] || d.tab}` : ""}`,
    checklist: [],
  },
  node: {
    table: "k_nodes", noun: ["node", "nodes"], search: ["id", "name"],
    line: `one piece of the project's model: ${NODE_TYPES.join(", ")} (data holds what its type carries)`,
    shows: [
      at("map", "/map?node={id}", "inspector", "the node on the Map: its light, its checks, its edges"),
      at("map", "/map/screens?surface={data.surface}", "canvas", "the screen's frame on its app's Screens view", { when: { field: "type", is: ["screen"] } }),
      at("map", "/map/screens", "screens-bar", "the app in the Screens view's bar", { when: { field: "type", is: ["surface"] } }),
      at("map", "/map/api", "canvas", "the door on the API layer", { when: { field: "type", is: ["door"] } }),
      at("map", "/map/data", "canvas", "the table on the Data layer", { when: { field: "type", is: ["table", "entity"] } }),
      at("map", "/map/flows", "flows", "the flow, stage by stage", { when: { field: "type", is: ["flow"] } }),
      at("map", "/map/deps", "canvas", "the dependency chain", { when: { field: "type", is: ["dep"] } }),
      at("map", "/map/arch", "lanes", "the architecture: its lanes and what crosses a wall", { when: { field: "type", is: ["architecture"] } }),
    ],
    example: { op: { kind: "node", op: "upsert", data: { id: "screen:pricing", type: "screen", name: "Pricing", status: "live", data: { surface: "web", lane: "buy", step: 2, states: ["monthly", "annual"], route: "/pricing" } } } },
    preview: (d) => `${NODE_WORD[d.type] || "Node"}: ${clipW(d.name || d.id, 60)}${d.data && typeof d.data.surface === "string" ? `, on ${clipW(d.data.surface, 30)}` : d.data && Array.isArray(d.data.surface) ? `, on ${clipW(d.data.surface.join(" and "), 40)}` : ""}${d.status ? `, ${d.status}` : ""}`,
    rules: ["a status is one of live, planned, retired (a gap: open or closed)", "a flow's data.steps are [{actor, does}]", "a screen's data takes surface, lane, step, states and wireframe", "a screen shared by more than one app names them all: data.surface a list of app keys", ARCH_RULE, "a part another project of the org owns names it: data.ownedBy (a diagram part: its own ownedBy) is that project's key, an active project you may read, never this one; the Map names it on the part and links to it for a reader who may read it", "removing a node removes its edges and its renders"],
    checklist: [
      item("apps", "app", "Are the project's apps (its surfaces) filed?", "a node of type surface for each app", "/map/screens"),
      item("screens", "app", "Does every app have its screens?", "nodes of type screen naming the app in data.surface", "/map/screens?surface={data.surface}", "every surface node"),
      item("screens-in-flow", "app", "Does every screen sit in its app's flow?", "data.lane and data.step on each screen, or a nav edge to or from it", "/map/screens?surface={data.surface}", "every screen node"),
      item("doors", "app", "Are the project's doors (its API routes) filed?", "a node of type door for each route", "/map/api"),
      item("tables", "app", "Are the project's tables filed?", "a node of type table for each table", "/map/data"),
      item("gaps", "core", "Is every gap the map names closed?", "status closed on each open gap node, once what it names is filed", "/map?node={id}", "every gap node"),
    ],
    cols: [
      col("id", "text", { key: true, re: ID, hint: 'an id without spaces, e.g. "screen:home"' }),
      col("type", "text", { req: true, enum: NODE_TYPES, hint: `one of ${NODE_TYPES.join(", ")}` }),
      col("name", "text", { req: true, max: 400, hint: "the node's name" }),
      col("status", "text", { max: 40, hint: `one of ${NODE_STATUSES.join(", ")} (a gap: ${GAP_STATUSES.join(" or ")})` }),
      col("data", "json", { ok: isObj, max: 200000, hint: "an object (a screen's route, a table's columns, a flow's steps, a gap's what, the architecture's diagram and crossing rules; ownedBy: the key of the project of this org that owns this part)" }),
    ],
    rule: (r) => {
      const out = [];
      const allowed = r.type === "gap" ? GAP_STATUSES : NODE_STATUSES;
      if (r.status != null && !allowed.includes(r.status)) out.push({ field: "status", hint: `one of ${allowed.join(", ")} for a ${r.type} node` });
      const d = r.data;
      // the kit's flow rule: every step names who acts and what they do
      if (r.type === "flow" && d && d.steps !== undefined && !(Array.isArray(d.steps) && d.steps.every((s) => isObj(s) && str(s.actor) && str(s.does)))) {
        out.push({ field: "data", hint: "a flow's data.steps as a list of {actor, does}, each a non-empty string" });
      }
      // the kit's gap rule: what it affects is a list of refs
      if (r.type === "gap" && d && d.affects !== undefined && !strList(d.affects)) out.push({ field: "data", hint: "a gap's data.affects as a list of refs (strings)" });
      // a screen's standard fields (docs/plan/ARCHITECTURE.md §11), each optional: the app it belongs to, where it sits in
      // that app's flow, the names of its states (a render's state is one of them) and its wireframe (the grammar)
      if (r.type === "screen" && d) {
        const key120 = (v) => typeof v === "string" && v.length <= 120;
        if (d.lane != null && !key120(d.lane)) out.push({ field: "data", hint: "a screen's data.lane as a string (the key of its lane), at most 120 characters" });
        // D1b item 20: a screen shared by more than one app names them all, a list of app keys (2 to 12, each at most 120 characters)
        if (d.surface != null && !key120(d.surface) && !(Array.isArray(d.surface) && d.surface.length >= 1 && d.surface.length <= 12 && d.surface.every((x) => key120(x) && x.trim())))
          out.push({ field: "data", hint: "a screen's data.surface as the key of its app (mobile, web, admin: a string of at most 120 characters), or a list of app keys when it belongs to more than one" });
        if (d.step != null && !(typeof d.step === "number" && Number.isFinite(d.step))) out.push({ field: "data", hint: "a screen's data.step as a number (its place in its lane)" });
        if (d.states != null && !(Array.isArray(d.states) && d.states.length <= 200 && d.states.every(STATE_NAME))) out.push({ field: "data", hint: 'a screen\'s data.states as a list of at most 200 state names (strings of 1 to 120 characters, no "|")' });
        if (d.wireframe != null) { const v = validateWireframe(d.wireframe); if (!v.ok) out.push({ field: "data", hint: `a screen's data.wireframe as ${WIREFRAME_HINT} (${v.note})` }); }
      }
      if (r.type === "architecture" && d) { const why = archIssue(d); if (why) out.push({ field: "data", hint: `an architecture's data where ${why} (${ARCH_RULE})` }); }
      // M3: the project that owns this part, by its key; an architecture is its own project's (its parts carry ownedBy)
      if (d && d.ownedBy !== undefined) {
        if (r.type === "architecture") out.push({ field: "data", hint: "an architecture's data without ownedBy: the architecture is its own project's, and a part of it another project owns names that project in data.diagram.nodes[].ownedBy" });
        else if (!ownerKeyOk(d.ownedBy)) out.push({ field: "data", hint: `a node's data.ownedBy as the key of a project of this org (${OWNED_BY_FORM})` });
      }
      return out;
    },
  },
  edge: {
    table: "k_edges", noun: ["edge", "edges"], search: ["from_id", "to_id", "label"],
    line: `a link between two nodes of the model: ${EDGE_KINDS.join(", ")}`,
    shows: [at("map", "/map?node={from}", "inspector", "under both of its nodes, and as a line on the Map"),
      at("map", "/map/flows", "flows", "a step of its flow", { when: { field: "kind", is: ["flow-step"] } }),
      at("map", "/map/screens", "canvas", "the way from one screen to the next", { when: { field: "kind", is: ["nav"] } })],
    example: { op: { kind: "edge", op: "upsert", data: { from: "door:get-prices", to: "table:prices", kind: "reads", label: "the plan prices" } },
      needs: [{ kind: "node", op: "upsert", data: { id: "door:get-prices", type: "door", name: "GET /prices" } }, { kind: "node", op: "upsert", data: { id: "table:prices", type: "table", name: "prices" } }] },
    preview: (d, ctx) => `Link: ${nameOf(ctx, d.from)} ${EDGE_WORD[d.kind] || d.kind} ${nameOf(ctx, d.to)}`,
    rules: ["both of its nodes are filed, in this call or before"],
    checklist: [item("door-table-links", "app", "Is every door linked to the tables it reads and writes?", "an edge of kind reads or writes from each door to its tables", "/map?node={from}", "every door node")],
    cols: [
      col("from", "text", { c: "from_id", key: true, re: ID, hint: "the id of the node it starts at" }),
      col("to", "text", { c: "to_id", key: true, re: ID, hint: "the id of the node it ends at" }),
      col("kind", "text", { key: true, enum: EDGE_KINDS, hint: `one of ${EDGE_KINDS.join(", ")}` }),
      col("label", "text", { max: 400 }),
      col("data", "json", { ok: isObj, hint: "an object" }),
    ],
  },
  gtm: {
    table: "k_gtm", noun: ["GTM template", "GTM templates"], search: [],
    line: "the go-to-market template: the kinds of GTM activity, what each holds, and what proves it (one per project)",
    shows: [at("gtm", "/gtm", "lanes", "its activity kinds, as the GTM lanes")],
    example: { op: { kind: "gtm", op: "upsert", data: { template: { identity: { key: "gtm", label: "GTM" }, activityKinds: ["outreach", "content"], fields: ["expected", "actual", "proof"],
      activityTemplate: { kinds: [{ kind: "outreach", holds: [{ field: "expected" }, { field: "proof" }], proofConcrete: "the reply or the booked call" }] },
      proofRule: { rule: "a link to the shipped post, page or reply" }, outcomeModel: { expected: "the outcome declared when filed", actual: "the result, reported later" } } } } },
    preview: (d) => { const k = d.template && Array.isArray(d.template.activityKinds) ? d.template.activityKinds : []; return `GTM template: ${k.length} activity kind${k.length === 1 ? "" : "s"}${k.length ? ` (${clipW(k.join(", "), 60)})` : ""}`; },
    checklist: [item("gtm-template", "gtm", "Is the go-to-market template filed: the kinds of GTM activity and what proves each?", "one GTM template", "/gtm")],
    cols: [
      col("template", "json", { req: true, ok: gtmTemplate, max: 100000, hint: `an object carrying ${GTM_FIELDS.join(", ")}, activityKinds a non-empty list of strings` }),
      ...FRESH(),
    ],
  },
  doc: {
    table: "k_docs", noun: ["doc", "docs"], search: ["path", "title"],
    cols: [
      col("path", "text", { key: true, re: DOC_PATH, ok: docPath, hint: 'a relative path, e.g. "start-here.md" or "roles/owner.md"' }),
      col("title", "text", { max: 400 }),
      col("body", "text", { c: "body_md", req: true, max: 500000, bytes: BODY_BYTES, hint: `the doc's markdown, at most ${BODY_BYTES.toLocaleString("en-US")} bytes as UTF-8 JSON (a CJK character counts 3; a newline, tab, quote or backslash 2)` }),
      col("roleVisibility", "json", { ok: strList, hint: "a list of role keys" }),
      ...FRESH(),
      SOURCE(),
    ],
    line: "a markdown doc of the project, by its path: start-here.md is what a newcomer reads first, the GTM strategy goes under gtm/",
    rules: ["start-here.md and capsules/<role>.md are the owner's: every connecting agent reads them first", "who may read a doc (roleVisibility) is the owner's to set"],
    // sprint 3 S3b: who files what (formats answers it); the write door's own rule (roleRefusal)
    ownerOnly: [{ what: "the doc start-here.md, and any capsules/<role>.md", instead: "file your doc under another path, or ask the owner" },
      { what: "roleVisibility (who may read the doc)", instead: "leave it out: a new doc is open to every seated reader" }],
    shows: [at("home", "/doc/{path}", "doc", "its own page"),
      // the one-pass fix 9: a doc under gtm/ is the GTM strategy, listed on the GTM tab (it stays in the Library too)
      at("gtm", "/gtm", "strategy", "the GTM tab's Strategy, with its confidence and as-of date", { when: { field: "path", prefix: "gtm/" } })],
    example: { op: { kind: "doc", op: "upsert", data: { path: "gtm/positioning.md", title: "Positioning", body: "# Positioning\n\nWho we serve first, and why they switch.", asOf: "2026-09-30", confidence: "proposal" } } },
    preview: (d) => `Doc: ${clipW(d.title || d.path, 60)}${d.title ? ` (${clipW(d.path, 40)})` : ""}${freshWords(d) ? `, ${freshWords(d)}` : ""}`,
    checklist: [
      item("start-here", "core", "Does a newcomer have the project's own start-here doc?", "the doc start-here.md (the owner writes it)", "/doc/{path}"),
      item("gtm-strategy", "gtm", "Is the GTM strategy written down (positioning, audience, pricing, channels)?", "docs under gtm/", "/doc/{path}", "the docs under gtm/"),
      item("agents-equipped", "agents", "Does the project hold the agents it works with?", "an agent equipped from Broadcast: its copy is the doc starter/<slug>.md", "/doc/{path}", "the docs under starter/"),
      // sprint 3 B4, stale by age: a dated card or doc older than its shelf life is due for review
      item("knowledge-fresh", "core", "Is every dated card and doc still fresh, checked within its shelf life?", "a newer asOf on each one due for review, once its claim is checked again", "/doc/{path}", "every card (not on the GTM tab) and doc (not under gtm/) with an asOf"),
    ],
  },
  // a screen's render (docs/plan/ARCHITECTURE.md §11): ONE frame of a screen node, keyed (screen, state, variant). Its body
  // rides on the op (`body`: an html fragment or the wireframe grammar, with `format` in the same op; an image render names
  // `artifact` instead), is checked and sanitised by src/render.js bodyOf, and is stored in R2 content-addressed
  // (renders/<project>/<sha256>); D1 keeps the index only — the hash and size the door derives. An upsert whose hash and
  // fields are all unchanged writes nothing (write.js). M6 (migrate-065): every body a frame has held is one of its TAKES
  // (k_screen_takes, kept by the database); an upsert naming a take's `hash` and no body restores that take (bodyStep).
  render: {
    table: "k_renders", noun: ["render", "renders"], search: ["screen", "state", "variant"], body: "body", extra: ["hash"],
    extraDocs: { body: { type: "text", limits: `html at most ${sizeWords(HTML_MAX)}, a wireframe ${sizeWords(WIREFRAME_MAX)} as JSON, a picture ${sizeWords(IMAGE_MAX)}; one call carries at most ${sizeWords(CALL_BODIES_MAX)} of bodies (a picture's base64 counts)`, hint: `the frame: an html fragment (format html; anything that runs is stripped, it is shown sandboxed), the wireframe grammar (format wireframe, ${WIREFRAME_HINT}), or a picture (format image: ${IMAGE_BASE64_HINT}; imageExample is one that works)` },
      hash: { type: "text", hint: `a take to restore instead of a body: the sha256 of a body this project's takes hold (map {ref: "screen:<id>"} lists a screen's last ${TAKES_SHOWN}, each with its hash); it becomes the frame's newest take, its format, size and style the take's` } },
    line: "one frame of a screen node, keyed (screen, state, variant): html, a picture (png, jpeg or webp, as base64), or a wireframe",
    shows: [at("map", "/map/screens", "screen-renders", "the frame of its screen, on its app's Screens view")],
    example: { op: { kind: "render", op: "upsert", data: { screen: "screen:pricing", state: "annual", format: "html", body: "<main><h1>Pricing</h1><p>Annual: 2 months free</p></main>", width: 390, height: 844 } },
      // D1b item 6: a picture through the MCP — a real 1 × 1 png, so the example files when copied
      imageOp: { kind: "render", op: "upsert", data: { screen: "screen:pricing", variant: "screenshot", format: "image", body: TINY_PNG_BASE64, width: 1, height: 1 } },
      needs: [{ kind: "node", op: "upsert", data: { id: "screen:pricing", type: "screen", name: "Pricing", data: { surface: "web", states: ["monthly", "annual"] } } }] },
    preview: (d, ctx) => { const b = (ctx && ctx.bytes) ?? sizeOfBody(d.body); return `Render: ${nameOf(ctx, d.screen)}, ${d.state ? `state ${clipW(d.state, 30)}` : "the whole screen"}${d.variant ? `, ${clipW(d.variant, 30)}` : ""}, ${d.format || "html"}${b != null ? `, ${sizeWords(b)}` : ""}`; },
    rules: ["its screen is a node of type screen, in this call or before", "format travels with its body in the same op (html: the markup; wireframe: the grammar; image: the picture's base64, or artifact: a picture you banked)", "an image is a png, jpeg or webp, checked by its first bytes; an SVG is refused", "an image's width and height are its own (read from its header): a declared size that differs is replaced", "a style applies to an html render only", "a body already stored (the same hash) writes nothing", "every body a frame has held is one of its takes; hash with no body restores a take the project holds (a Partner restores none)"],
    checklist: [item("screens-pictured", "app", "Does every screen have a wireframe or a render?", "a render of the screen (or data.wireframe on its node)", "/map/screens", "every screen node")],
    cols: [
      col("screen", "text", { key: true, re: ID, hint: 'the id of a node of type screen, e.g. "screen:home"' }),
      col("state", "text", { key: true, keyDef: "", ok: NAME_OK, hint: 'one of the screen\'s data.states (at most 120 characters, no "|"), or "" (the default: the screen as a whole)' }),
      col("variant", "text", { key: true, keyDef: "", ok: NAME_OK, hint: 'a name for this take of the frame, e.g. "live", "proposed", "wireframe" (at most 120 characters, no "|"), or "" (the default)' }),
      col("format", "text", { req: true, enum: RENDER_FORMATS, hint: `one of ${RENDER_FORMATS.join(", ")}, sent with its body in the same op (an image: the picture's base64 in body, or artifact)` }),
      col("artifact", "text", { re: ARTIFACT_ID, max: 80, hint: "an image render's picture already banked: the id of a png, jpeg or webp artifact (POST /artifact with its image content type); through the MCP, send the picture's base64 in body instead" }),
      col("style", "text", { re: ID, hint: 'an html render\'s stylesheet: the id of a filed style (kind "style")' }),
      col("width", "int", { ok: DIM, hint: "the frame's width in pixels, a whole number from 1 to 10000" }),
      col("height", "int", { ok: DIM, hint: "the frame's height in pixels, a whole number from 1 to 10000" }),
      col("hash", "text", { derived: true, re: SHA_RE }),
      col("bytes", "int", { derived: true }),
    ],
  },
  // a stylesheet many html renders share (a design system's CSS filed once): `css` rides on the op, sanitised and stored
  // in R2 like a render's body; D1 keeps its hash and size
  style: {
    table: "k_styles", noun: ["style", "styles"], search: ["id"], body: "css",
    extraDocs: { css: { type: "text", required: true, limits: `at most ${sizeWords(STYLE_MAX)}; one call carries at most ${sizeWords(CALL_BODIES_MAX)} of bodies`, hint: "the stylesheet's text (anything that fetches or runs is stripped)" } },
    line: "a stylesheet many html renders share (a design system's CSS, filed once)",
    shows: [at("map", "/map/screens", "screen-renders", "the look of every html render that names it")],
    example: { op: { kind: "style", op: "upsert", data: { id: "app", css: "main{font:16px/1.5 system-ui}h1{font-size:28px}" } } },
    preview: (d, ctx) => { const b = (ctx && ctx.bytes) ?? sizeOfBody(d.css); return `Style: ${clipW(d.id, 60)}${b != null ? `, ${sizeWords(b)}` : ""}`; },
    checklist: [],
    cols: [
      col("id", "text", { key: true, re: ID, hint: 'an id without spaces, e.g. "app" or "design-system"' }),
      col("hash", "text", { derived: true, re: SHA_RE }),
      col("bytes", "int", { derived: true }),
    ],
  },
};
export const KNOWLEDGE_KINDS = Object.keys(KINDS);
for (const k of KNOWLEDGE_KINDS) KINDS[k].key = KINDS[k].cols.filter((c) => c.key);

// the field list per kind, for the tool's schema text (a derived column is the door's, never sent)
export const KNOWLEDGE_FIELDS_DOC = KNOWLEDGE_KINDS.map((k) => {
  const f = KINDS[k].cols.filter((c) => !c.derived).map((c) => c.f + (c.key ? (c.keyDef !== undefined ? " (key, default \"\")" : " (key)") : c.req && c.def === undefined ? " (required)" : ""));
  if (k === "question") f.push("options: [{what, tradeoff}]");
  if (k === "render") f.push("body (an html fragment, or the wireframe grammar)", "hash (a take to restore, instead of a body)");
  if (k === "style") f.push("css (required)");
  return `${k} {${f.join(", ")}}`;
}).join(" · ");

export const nounOf = (kind, n) => KINDS[kind].noun[n === 1 ? 0 : 1];

// ---- the registry, read (src/formats.js, holes, the contract; B2's preview) ----
// fieldDocs(kind) -> [{ name, type, required, key?, default?, values?, limits?, hint }]: what a caller sends, from the columns
// (a derived column is the door's, never listed) and the fields that ride on the op (a question's options, a body)
const limitWords = (c) => (c.re || c.enum ? null : c.bytes ? `at most ${sizeWords(c.bytes)} as UTF-8 JSON` : c.t === "text" ? `at most ${c.max} characters`
  : c.t === "json" ? `at most ${c.max.toLocaleString("en-US")} characters as JSON` : c.t === "choice" ? `at most ${c.max} characters` : null);
export function fieldDocs(kind) {
  const spec = KINDS[kind];
  if (!spec) return [];
  const out = spec.cols.filter((c) => !c.derived).map((c) => {
    const d = { name: c.f, type: c.t };
    if (c.key) d.key = true;
    d.required = (!!c.key && c.keyDef === undefined) || (!!c.req && c.def === undefined);
    if (c.keyDef !== undefined) d.default = c.keyDef;
    if (c.enum) d.values = c.enum;
    const lim = limitWords(c);
    if (lim) d.limits = lim;
    d.hint = hintOf(c);
    return d;
  });
  for (const [name, x] of Object.entries(spec.extraDocs || {})) out.push({ name, type: x.type, required: !!x.required, ...(x.limits ? { limits: x.limits } : {}), hint: x.hint });
  return out;
}
// showsOf(kind, data, { cardKindTab }) -> [{ tab, path, region, what }]: where ONE item shows, its places resolved for its
// own fields (a place's `when` decides whether it holds for this row; a list field gives one place per element, the first
// ten; a query parameter the item leaves unknown is dropped, a path part left unknown keeps its {pattern}). A card's tab is
// its card kind's (ctx.cardKindTab, the caller's read), a card kind's its own `tab`; else the place's default. Pure.
const valueAt = (data, path) => path.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), data);
const present = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length);
const whenHolds = (w, data) => !w || (w.is ? w.is.includes(valueAt(data, w.field)) : w.prefix ? String(valueAt(data, w.field) ?? "").startsWith(w.prefix) : w.present ? present(valueAt(data, w.field)) : true);
const encodePart = (f, v) => (f === "path" ? String(v).split("/").map(encodeURIComponent).join("/") : encodeURIComponent(String(v)));
function fillPath(pattern, data) {
  const lists = [...pattern.matchAll(/\{([\w.]+)\}/g)].map((m) => valueAt(data, m[1])).filter(Array.isArray);
  const rows = lists.length ? lists[0].slice(0, 10).map((x) => ({ x })) : [{}];
  return rows.map(({ x }) => pattern
    .replace(/([?&])([\w-]+)=\{([\w.]+)\}/g, (all, sep, k, f) => { const v = Array.isArray(valueAt(data, f)) ? x : valueAt(data, f); return v == null || v === "" || typeof v === "object" ? (sep === "?" ? "?" : "") : `${sep}${k}=${encodePart(f, v)}`; })
    .replace(/\{([\w.]+)\}/g, (all, f) => { const v = Array.isArray(valueAt(data, f)) ? x : valueAt(data, f); return v == null || v === "" || typeof v === "object" ? all : encodePart(f, v); })
    .replace(/\?$/, "").replace(/\?&/, "?"));
}
// resolvePlaces(places, data, ctx) -> the places that hold for one row, resolved (src/shapes.js reads its own places with it)
export function resolvePlaces(places, data, ctx = {}) {
  const d = isObj(data) ? data : {};
  const out = [];
  for (const p of places || []) {
    if (!whenHolds(p.when, d)) continue;
    const tab = p.tabFrom === "card_kind.tab" ? (ctx.cardKindTab || p.tab) : p.tabFrom === "tab" ? (d.tab || p.tab) : p.tab;
    for (const path of fillPath(p.path, d)) out.push({ tab, path: orgPath(path), region: p.region, what: p.what });   // under the reader's org (sprint 7, 7.4)
  }
  return out;
}
export function showsOf(kind, data = {}, ctx = {}) {
  const spec = KINDS[kind];
  return spec ? resolvePlaces(spec.shows, isObj(data) ? withKeyDefaults(kind, data) : {}, ctx) : [];
}
export { at as place };
// previewLine(kind, data, ctx) -> one short human line for a filing preview (B2): ctx.names maps a ref to its name (a goal's
// parent, a render's screen), ctx.kindLabel a card's kind label, ctx.bytes a body's size as stored. Pure: reads nothing.
// lineJoins(line) -> the line with no comma straight after a sentence's end: a question's "together?" then ", 2 options" reads
// "together? 2 options" (sprint 12, 12.6). "?" and "!" always; "." after a word of two letters or more ("etc.", "done."),
// never inside an abbreviation's letters ("e.g.,")
export const lineJoins = (line) => String(line ?? "").replace(/([?!]|[^\s.]{2}\.),(?= )/g, "$1");
export function previewLine(kind, data, ctx = {}) {
  const spec = KINDS[kind];
  if (!spec) return "";
  const d = isObj(data) ? withKeyDefaults(kind, data) : {};
  try { return lineJoins(spec.preview(d, ctx || {})); } catch { return `${nounOf(kind, 1).replace(/^./, (m) => m.toUpperCase())}: ${spec.key.map((c) => d[c.f]).filter(Boolean).join(" ")}`; }
}
// keyString(kind, row) -> the item's key: its key field, or its key fields joined by "|" ("" for the aim and the template)
export const keyString = (kind, row) => KINDS[kind].key.map((c) => String(row[c.f])).join("|");
// withKeyDefaults(kind, data) -> data with every key field the op left out set to its default (a render's state and
// variant: ""), a copy; data itself when nothing is left out
export function withKeyDefaults(kind, data) {
  const spec = KINDS[kind];
  if (!spec || !isObj(data) || !spec.key.some((c) => c.keyDef !== undefined && data[c.f] === undefined)) return data;
  const out = { ...data };
  for (const c of spec.key) if (c.keyDef !== undefined && out[c.f] === undefined) out[c.f] = c.keyDef;
  return out;
}
// keyOf(kind, data) -> the key string when every key field is a valid value, else null
export function keyOf(kind, data) {
  const spec = KINDS[kind];
  if (!spec || !isObj(data)) return null;
  const d = withKeyDefaults(kind, data);
  return spec.key.every((c) => keyOk(c, d[c.f])) ? keyString(kind, d) : null;
}
const keyOk = (c, v) => typeof v === "string" && (c.re ? c.re.test(v) : true) && (c.enum ? c.enum.includes(v) : true) && (c.ok ? c.ok(v) : true);

// normField(col, v) -> { value } | null (refused). An empty or blank string is null.
function normField(c, v) {
  if (v === null) return { value: null };
  switch (c.t) {
    case "text":
      if (typeof v !== "string" || v.length > c.max || (c.bytes && jsonBytes(v) > c.bytes)) return null;
      if (v.trim() === "") return { value: null };
      // a text column with a fix (a goal's status) normalizes first: its synonyms are stored as the one value
      if (c.fix) { const x = c.fix(v); if (x === undefined) return null; v = x; }
      if ((c.re && !c.re.test(v)) || (c.enum && !c.enum.includes(v)) || (c.ok && !c.ok(v))) return null;
      return { value: v };
    case "choice":
      if (Number.isInteger(v) && v >= 0) return { value: v };
      if (typeof v !== "string" || v.length > c.max) return null;
      if (v.trim() === "") return { value: null };
      return { value: /^\d+$/.test(v) ? Number(v) : v };
    case "int":
      return Number.isInteger(v) && (!c.ok || c.ok(v)) ? { value: v } : null;
    case "real":
      return typeof v === "number" && Number.isFinite(v) && (!c.ok || c.ok(v)) ? { value: v } : null;
    case "bool":
      return typeof v === "boolean" ? { value: v } : null;
    case "json": {
      let x = v;
      if (c.fix) { x = c.fix(v); if (x === undefined) return null; }
      else if (c.ok && !c.ok(v)) return null;
      return JSON.stringify(x).length <= c.max ? { value: x } : null;
    }
  }
  return null;
}
export const hintOf = (c) => c.hint || (c.t === "text" ? `a string of at most ${c.max} characters` : c.t === "int" ? "a whole number" : c.t === "real" ? "a number" : c.t === "bool" ? "true or false" : "valid JSON");
// every refusal of the knowledge door points at the formats read, where the kind's fields, an example and its places are
const seeFormats = (kind) => ` formats {kind: "${kind}"} has every field, an example and where it shows.`;

// the D1 value of a field, and back
export function encodeValue(c, v) {
  if (v === null || v === undefined) return null;
  if (c.t === "json") return JSON.stringify(v);
  if (c.t === "bool") return v ? 1 : 0;
  if (c.t === "choice") return String(v);
  return v;
}
// decodeRow(kind, dbRow) -> the item as a caller sends it: its fields, a question's options, and who wrote it when
export function decodeRow(kind, r) {
  const out = {};
  for (const c of KINDS[kind].cols) {
    const v = r[c.c];
    if (v === null || v === undefined) { out[c.f] = null; continue; }
    if (c.t === "json") { try { out[c.f] = JSON.parse(v); } catch { out[c.f] = null; } }
    else if (c.t === "bool") out[c.f] = !!v;
    else if (c.t === "choice") out[c.f] = /^\d+$/.test(String(v)) ? Number(v) : v;
    else out[c.f] = v;
  }
  if (kind === "question") {
    let opts = [];
    try { opts = JSON.parse(r.options_json || "[]"); } catch { opts = []; }
    out.options = (Array.isArray(opts) ? opts : []).filter((o) => o && o.what != null).sort((a, b) => a.idx - b.idx)
      .map((o) => ({ what: o.what, tradeoff: o.tradeoff ?? null }));
  }
  Object.assign(out, { createdBy: r.created_by ?? null, createdAt: r.created_at ?? null, updatedBy: r.updated_by ?? null, updatedAt: r.updated_at ?? null });
  return out;
}

const fieldsOf = (kind) => [...KINDS[kind].cols.filter((c) => !c.derived).map((c) => c.f), ...(KINDS[kind].extra || []), ...(KINDS[kind].body ? [KINDS[kind].body] : [])];
const optionIndex = (choice) => (Number.isInteger(choice) ? choice : typeof choice === "string" && /^[a-z]$/i.test(choice) ? choice.toLowerCase().charCodeAt(0) - 97 : null);
// two roleVisibility values name the same readers: null and [] are both "open"; order and repeats do not count
const sameRoles = (a, b) => { const n = (v) => (Array.isArray(v) && v.length ? [...new Set(v.map(String))].sort().join("\n") : ""); return n(a) === n(b); };

// roleRefusal — what a NON-owner may not do to a doc, a card or a card kind (null: allowed), checked on every op before it
// applies: (1) write or remove a capsule doc (capsules/*: a role's brief, served to an agent first; the owner's alone);
// (2) touch an item whose stored list does not admit their role (rolesAdmit) — for a card, its kind's list too, even for a
// new card; (3) send a roleVisibility other than the one stored (a new item: none, i.e. open): who reads an item is the
// owner's to set. prev is the item as the batch has it so far (the stored row, or this batch's own earlier op).
function roleRefusal(kind, id, data, prev, state, role, opName, who = role) {
  const noun = nounOf(kind, 1), you = role ? `your role (${role})` : "you";
  if (kind === "doc" && CAPSULE_DOC.test(String(data.path))) {
    return { error: "owner_only", note: "A role's brief (the doc capsules/<role>.md) is the owner's to write: file your doc under another path, or ask the owner." };
  }
  // start-here.md is what every connecting agent is told to read first (the owner's agents too), so only the owner writes it
  if (kind === "doc" && String(data.path) === "start-here.md") {
    return { error: "owner_only", note: "start-here.md is the first thing every agent reads here, and only the owner writes it: file your doc under another path, or ask the owner." };
  }
  if (prev && !rolesAdmit(who, prev.roleVisibility)) {
    return { error: "forbidden", note: `This ${noun} is not open to ${you}, so you cannot ${opName === "remove" ? "remove" : "change"} it: ask the owner.` };
  }
  if (kind === "card") {
    const k = state.card_kind.get(String(data.kind));
    if (k && !rolesAdmit(who, k.roleVisibility)) {
      return { error: "forbidden", note: `Card kind "${data.kind}" is not open to ${you}, so you cannot file, change or remove its cards: use another kind, or ask the owner.` };
    }
  }
  if (opName === "upsert" && "roleVisibility" in data && !sameRoles(data.roleVisibility, prev ? prev.roleVisibility : null)) {
    return { error: "owner_only", note: `Only the owner sets who may read a ${noun}: leave out roleVisibility (${prev ? "it keeps its stored value" : "a new one is open to every seated reader"}).` };
  }
  return null;
}

// planKnowledge(ops, stored, { isOwner, role }) -> { errors, steps, state } — the whole batch checked against the project's
// stored rows, nothing written. stored: { <kind>: Map(key -> decoded row) } holding every stored row an op names (all of
// the project's goals when any op is a goal; every node an edge names; the kind of every card named). A non-owner (role:
// the writer's role) is held to the ruling rule and to roleRefusal. Ops apply in order: an upsert MERGES (a field
// present in data overwrites, an absent one keeps its stored value) and the merged row is what is checked; a new row
// needs its required fields. After the ops, the cross-row rules run on the batch's end state: one goal root, every parent
// a goal, no cycle, a removed goal leaves no child behind; an open question has 2+ options and no choice (a ruled one
// with options names its choice or carries a label); an edge's two nodes exist. Every error is
// { index, kind, id, error, note }, the note saying what to send instead. steps: one per applied op, in order.
export function planKnowledge(ops, stored = {}, { isOwner = false, role = null, reader = null } = {}) {
  const errors = [], steps = [];
  const state = Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, new Map(stored[k] || [])]));
  const list = Array.isArray(ops) ? ops : [];
  let bodyBytes = 0, imageBytes = 0;   // the bodies this call carries, as sent (CALL_BODIES_MAX); the pictures it names (CALL_IMAGES_MAX)
  list.forEach((op, i) => {
    const kind = op && typeof op.kind === "string" ? op.kind : null;
    const bad = (id, e) => errors.push({ index: i, kind, id, ...e });
    if (!isObj(op)) return bad(null, { error: "bad_op", note: 'Send each op as {kind, op: "upsert" | "remove", data: {…}}.' });
    const spec = KINDS[kind];
    if (!spec) return bad(null, { error: "unknown_kind", note: `Send kind as one of ${KNOWLEDGE_KINDS.join(", ")} (\`formats\` lists them, each in a line).` });
    if (!KNOWLEDGE_OPS.includes(op.op)) return bad(null, { error: "bad_op", note: `Send op as ${KNOWLEDGE_OPS.map((x) => `"${x}"`).join(" or ")}.` });
    if (!isObj(op.data)) return bad(null, { error: "bad_op", note: `Send data as an object: a ${nounOf(kind, 1)} is {${fieldsOf(kind).join(", ")}}.${seeFormats(kind)}` });
    const data = withKeyDefaults(kind, op.data);
    const badKey = spec.key.find((c) => !keyOk(c, data[c.f]));
    if (badKey) return bad(null, { error: "bad_id", note: `Send data.${badKey.f} as ${hintOf(badKey)}.${seeFormats(kind)}` });
    const id = spec.key.length ? keyString(kind, data) : null;
    const map = state[kind], mk = id ?? "";
    const prev = map.get(mk) || null;
    if (!isOwner && ROLE_LIMITED.has(kind)) {
      const refused = roleRefusal(kind, id, data, prev, state, role, op.op, reader || role);
      if (refused) return bad(id, refused);
    }

    if (op.op === "remove") {
      if (kind === "question" && !isOwner && prev && prev.status !== "open") {
        return bad(id, { error: "owner_only", note: "A ruled question is the owner's: ask the owner to remove it." });
      }
      map.delete(mk);
      // a removed node takes its edges and its renders with it (write.js deletes the stored ones)
      if (kind === "node") {
        for (const [ek, e] of state.edge) if (e.from === id || e.to === id) state.edge.delete(ek);
        for (const [rk, r] of state.render) if (r.screen === id) state.render.delete(rk);
      }
      steps.push({ i, kind, op: "remove", id, key: data, existed: !!prev });
      return;
    }

    const allowed = new Set(fieldsOf(kind));
    const unknown = Object.keys(data).filter((k) => !allowed.has(k));
    // M6: restoring a take (a render naming a hash, no body) is a member's press, never a Partner's (the role CLASS, as Publish,
    // Equip and Regrade refuse one: src/hats.js roleClassOf). authority
    if (kind === "render" && !isOwner && data.hash != null && !unknown.length && roleClassOf(role) === "partner") {
      return bad(id, { error: "partner_refused", note: "A Partner works on the projects they are seated on; restoring a previous take of a screen is a member's press." });
    }
    if (unknown.length) return bad(id, { error: "unknown_field", note: `A ${nounOf(kind, 1)} has no field ${unknown.map((u) => `"${u}"`).join(", ")}: send only ${fieldsOf(kind).join(", ")}.${seeFormats(kind)}` });
    if (kind === "question" && !isOwner) {
      const ruling = RULING_FIELDS.filter((f) => f in data && data[f] !== null);
      if (ruling.length || ("status" in data && data.status !== "open") || (prev && prev.status !== "open")) {
        return bad(id, { error: "owner_only", note: `Only the owner rules a question: file it with status "open" and leave out ${RULING_FIELDS.join(", ")}${prev && prev.status !== "open" ? " (this one is already ruled)" : ""}.` });
      }
    }
    const row = prev ? { ...prev } : Object.fromEntries(spec.cols.map((c) => [c.f, c.def !== undefined ? structuredClone(c.def) : null]));
    const present = [];
    let failed = false;
    for (const c of spec.cols) {
      if (!(c.f in data)) continue;
      // a key field is its validated key value as sent ("" stays "": a render's default state)
      if (c.key) { row[c.f] = data[c.f]; present.push(c.f); continue; }
      const n = normField(c, data[c.f]);
      if (!n) { bad(id, { error: "bad_field", note: `Send data.${c.f} as ${hintOf(c)}.${seeFormats(kind)}` }); failed = true; continue; }
      row[c.f] = n.value;
      present.push(c.f);
    }
    let sentOptions = false;
    if (kind === "question") {
      if ("options" in data) {
        const o = optionsOf(data.options);
        if (!o) { bad(id, { error: "bad_field", note: `Send data.options as a list of up to ${MAX_OPTIONS} {what, tradeoff?}, each what a non-empty string.` }); failed = true; }
        else { row.options = o; sentOptions = true; }
      } else if (!prev) row.options = [];
    }
    if (failed) return;
    // a render's or a style's body (src/render.js): checked, its hash and size set on the row
    let prepared = null;
    if (spec.body) {
      const b = bodyStep(kind, op, data, row, prev, present);
      if (b.errors.length) { for (const e of b.errors) bad(id, e); return; }
      prepared = b.prepared;
      if (prepared) {
        // an image render's picture (prepared.source: the banked artifact's bytes) is named, not carried
        if (prepared.source) imageBytes += prepared.sent || 0;
        else bodyBytes += prepared.sent || 0;
        if (bodyBytes > CALL_BODIES_MAX) {
          return bad(id, { error: "too_large", note: `This op takes the call's bodies to ${sizeWords(bodyBytes)}; one call carries at most ${sizeWords(CALL_BODIES_MAX)} of bodies (html, css, wireframes): split the call, and send this op and the ones after it in another.` });
        }
        if (imageBytes > CALL_IMAGES_MAX) {
          return bad(id, { error: "too_large", note: `This op takes the pictures this call names to ${sizeWords(imageBytes)}; one call names at most ${sizeWords(CALL_IMAGES_MAX)} of image renders' pictures: split the call, and send this op and the ones after it in another.` });
        }
      }
    }
    for (const c of spec.cols) {
      if (!c.req || row[c.f] != null) continue;
      if (!prev && !(c.f in data)) bad(id, { error: "missing_field", note: `A new ${nounOf(kind, 1)} needs data.${c.f}: send it as ${hintOf(c)}.${seeFormats(kind)}` });
      else bad(id, { error: "bad_field", note: `data.${c.f} cannot be empty: send it as ${hintOf(c)}.${seeFormats(kind)}` });
      failed = true;
    }
    if (failed) return;
    const broken = spec.rule ? spec.rule(row) : [];
    if (broken.length) { for (const b of broken) bad(id, { error: "bad_field", note: `Send data.${b.field} as ${b.hint}.${seeFormats(kind)}` }); return; }
    map.set(mk, row);
    // a render or a style whose every column (its hash among them) is what is stored already: nothing to write (write.js)
    const bodyOf_ = spec.body ? { prepared, prevHash: prev ? prev.hash ?? null : null,
      unchanged: !!prev && spec.cols.every((c) => encodeValue(c, row[c.f]) === encodeValue(c, prev[c.f])) } : {};
    steps.push({ i, kind, op: "upsert", id, key: data, row, present, options: sentOptions, existed: !!prev, ...bodyOf_ });
  });
  if (!errors.length) crossRules(steps, state, errors, { isOwner, reader: reader || role, pool: stored.cardPool, owners: stored.owners, before: stored.node });
  return { errors, steps, state };
}

// bodyStep(kind, op, data, row, prev, present) -> { errors, prepared }: a render's or a style's body checked against the
// merged row, and the row's derived columns set. The body was prepared (sanitised and hashed) by the write door before the
// plan (op[PREPARED], src/render.js prepareBodies; an image render's artifact by write.js); a plan run without the door (the
// importer's dry run, the selftests) checks it here with the same src/render.js bodyOf, and leaves the hash null.
function bodyStep(kind, op, data, row, prev, present) {
  const errors = [];
  const no = (error, note) => { errors.push({ error, note }); return { errors, prepared: null }; };
  const field = KINDS[kind].body;
  const sent = field in data && data[field] !== undefined;
  if (kind === "style") {
    const b = op[PREPARED] !== undefined ? op[PREPARED] : sent ? bodyOf(kind, data) : null;
    if (b && b.error) return no(b.error.error, b.error.note);
    if (!b) return prev ? { errors, prepared: null } : no("missing_field", "A new style needs data.css: send the stylesheet's text.");
    return finish(b);
  }
  // a render
  const art = "artifact" in data && data.artifact != null;
  if (sent && art) return no("bad_field", "Send data.body (the html, the wireframe, or an image's base64) or data.artifact (a picture you banked), not both.");
  // M6 · a restore: data.hash names a take the project holds (write.js prepareTakes read it: op[PREPARED].take) and no body. The
  // frame takes the take's format, size and style (a style sent in the same op wins; a picture or a wireframe has none); the
  // trigger files it as the frame's newest take. A plan run without the door (the importer's dry run, a selftest) cannot read
  // the takes: it keeps the hash as sent and leaves the size unknown.
  if (data.hash != null) {
    if (sent || art) return no("bad_field", `Send data.hash (a take to restore) or a new ${sent ? "data.body" : "data.artifact"}, not both.`);
    const b = op[PREPARED];
    if (b && b.error) return no(b.error.error, b.error.note);
    const t = b && b.take;
    if (t && "format" in data && data.format !== t.format) return no("bad_field", `The take ${String(data.hash).slice(0, 12)}… is ${t.format}: send data.format "${t.format}", or leave it out.`);
    if (t) {
      const set = (f, v) => { row[f] = v; if (!present.includes(f)) present.push(f); };
      set("format", t.format);
      set("artifact", null);
      for (const f of ["width", "height"]) if (!(f in data)) set(f, t[f] ?? null);
      if (t.format !== "html") set("style", null);
      else if (!("style" in data)) set("style", t.style ?? null);
    }
    if (row.style != null && row.format !== "html") return no("bad_field", `A style applies to an html render only: send style null on ${row.format === "image" ? "an image" : "a wireframe"} render.`);
    return finish(b || { hash: data.hash, bytes: row.bytes ?? null, sent: 0 });
  }
  if ((sent || art) && !("format" in data)) return no("bad_field", `Send data.format in the same op as the ${sent ? "body" : "artifact"}: ${RENDER_FORMATS.join(", ")}.`);
  if (!prev && !sent && !art) return no("missing_field", 'A new render needs its picture: send data.format with data.body ("html": a markup fragment; "wireframe": the wireframe grammar; "image": the png, jpeg or webp as base64).');
  if (prev && "format" in data && data.format !== prev.format && !sent && !art) return no("bad_field", `This render is ${prev.format}: to make it ${data.format}, send its new data.body (or data.artifact) in the same op.`);
  if (row.format === "image") {
    if (row.style != null) return no("bad_field", "A style applies to an html render only: send style null on an image render.");
    // D1b item 6: the picture itself, as base64 in data.body (src/render.js imageBody: magic bytes checked, SVG refused)
    if (sent) {
      const b = op[PREPARED] !== undefined ? op[PREPARED] : bodyOf(kind, data);
      if (b && b.error) return no(b.error.error, b.error.note);
      if (row.artifact != null) { row.artifact = null; if (!present.includes("artifact")) present.push("artifact"); }
      // sprint 3 S3b: the picture's own size (its header) is the render's: a declared width or height that differs is dropped
      // for the real one, and an undeclared one is filled in
      if (b && b.size) for (const f of ["width", "height"]) { row[f] = b.size[f]; if (!present.includes(f)) present.push(f); }
      return finish(b);
    }
    if (row.artifact == null) return no("missing_field", "An image render needs its picture: send data.body as the png, jpeg or webp's base64 (formats {kind: \"render\"} has an example), or data.artifact (a picture you banked).");
    const b = op[PREPARED];
    if (b && b.error) return no(b.error.error, b.error.note);
    return art ? finish(b || { hash: null, bytes: null, sent: 0 }) : { errors, prepared: null };
  }
  if (art) return no("bad_field", `Only an image render names an artifact: this render is ${row.format}; send its data.body.`);
  if (row.artifact != null) { row.artifact = null; if (!present.includes("artifact")) present.push("artifact"); }
  if (row.style != null && row.format !== "html") return no("bad_field", "A style applies to an html render only: send style null on a wireframe render.");
  const b = op[PREPARED] !== undefined ? op[PREPARED] : sent ? bodyOf(kind, data) : null;
  if (b && b.error) return no(b.error.error, b.error.note);
  return b ? finish(b) : { errors, prepared: null };
  function finish(p) {
    row.hash = p.hash ?? null;
    row.bytes = p.bytes ?? null;
    for (const f of ["hash", "bytes"]) if (!present.includes(f)) present.push(f);
    return { errors, prepared: p };
  }
}

function crossRules(steps, state, errors, who = {}) {
  const err = (i, kind, id, e) => errors.push({ index: i, kind, id, ...e });
  const lastAt = (kind, op) => { const m = new Map(); for (const s of steps) if (s.kind === kind && (!op || s.op === op)) m.set(s.id, s.i); return m; };

  // the goal tree
  const goalSteps = steps.filter((s) => s.kind === "goal");
  if (goalSteps.length) {
    const goals = state.goal, touched = lastAt("goal"), removedAt = lastAt("goal", "remove");
    const first = goalSteps[0].i, before = errors.length;
    const orphans = new Map();
    for (const g of goals.values()) {
      if (g.parent == null || goals.has(g.parent)) continue;
      if (removedAt.has(g.parent)) { if (!orphans.has(g.parent)) orphans.set(g.parent, []); orphans.get(g.parent).push(g.id); }
      else err(touched.get(g.id) ?? first, "goal", g.id, { error: "missing_parent",
        note: `Goal "${g.id}" names parent "${g.parent}", which is not a goal in this project: send an existing goal's id as parent (read {kind: "goal"} lists them), or file that parent in the same batch.` });
    }
    for (const [rid, kids] of orphans) err(removedAt.get(rid), "goal", rid, { error: "has_children",
      note: `Goal "${rid}" still has child goals (${kids.join(", ")}): remove them in the same batch, or give them another parent first.` });
    for (const id of touched.keys()) {
      if (!goals.has(id)) continue;
      const seen = new Set([id]);
      for (let p = goals.get(id).parent; p != null && goals.has(p); p = goals.get(p).parent) {
        if (p === id) { err(touched.get(id), "goal", id, { error: "goal_cycle", note: `Goal "${id}" would be its own ancestor: point its parent at a goal outside its own branch.` }); break; }
        if (seen.has(p)) break;
        seen.add(p);
      }
    }
    const roots = [...goals.values()].filter((g) => g.parent == null);
    if (goals.size && roots.length !== 1 && errors.length === before) {
      const blamed = roots.filter((g) => touched.has(g.id));
      const note = roots.length
        ? `The goal tree would have ${roots.length} roots (${roots.map((g) => g.id).join(", ")}); exactly one goal has no parent: give the others a parent.`
        : "The goal tree would have no root; exactly one goal has no parent: send parent null on the top goal.";
      if (roots.length > 1 && blamed.length) for (const g of blamed) err(touched.get(g.id), "goal", g.id, { error: "goal_roots", note });
      else err(first, "goal", null, { error: "goal_roots", note });
    }
  }

  // questions and their options (the kit's question rule)
  for (const [qid, i] of lastAt("question", "upsert")) {
    const q = state.question.get(qid);
    if (!q) continue;
    const opts = q.options || [];
    const choice = q.choice == null ? "" : q.choice;
    if (q.status === "open") {
      if (opts.length < 2) err(i, "question", qid, { error: "too_few_options", note: `An open question needs at least 2 options (it has ${opts.length}): send data.options as [{what, tradeoff}, …] with 2 or more. A ruling already made is filed decided (the owner's): status "decided" with its options and its choice, or the ruled option alone with choice 0.` });
      if (choice !== "") err(i, "question", qid, { error: "open_has_choice", note: 'An open question carries no choice: send choice null, or (the owner) rule it with status "decided".' });
    } else if (opts.length) {
      // a ruled question names its choice among its options (one option alone is the ruled option itself, choice 0), or says
      // the ruling in its label
      const idx = optionIndex(choice);
      if (!(idx != null && idx >= 0 && idx < opts.length) && !str(q.label)) {
        err(i, "question", qid, { error: "no_choice", note: opts.length === 1
          ? "A ruled question with one option names it as its choice: send choice 0 (the ruled option), or a label saying what was ruled."
          : "A ruled question with options names its choice: send choice as the option's index (0 = A) or letter, or a label saying what was ruled." });
      }
    }
  }

  // a render's screen is a node of type screen, and a style it names (in this batch) a filed style. A style a stored render
  // already named is not re-checked: removing a style leaves its renders unstyled, never refused — nor is the style a restored
  // take was filed with (M6: the op SENDS no style; the take brings its own)
  const styleSent = new Set(steps.filter((s) => s.kind === "render" && s.op === "upsert" && isObj(s.key) && "style" in s.key).map((s) => s.id));
  for (const [rid, i] of lastAt("render", "upsert")) {
    const r = state.render.get(rid);
    if (!r) continue;
    const n = state.node.get(r.screen);
    if (!n || n.type !== "screen") err(i, "render", rid, { error: "missing_node",
      note: n ? `Render ${rid} names "${r.screen}", a ${n.type} node, not a screen: name a node of type screen.`
        : `Render ${rid} names screen "${r.screen}", which is not in this project: file it first (kind "node", type "screen"), in this batch or before.` });
    if (r.style != null && styleSent.has(rid) && !state.style.has(r.style)) err(i, "render", rid, { error: "missing_style",
      note: `Render ${rid} names style "${r.style}", which is not in this project: file it first (kind "style", {id, css}), in this batch or before.` });
  }

  // a card's id matches its card kind's idPattern (the one-pass fix 6: the pattern is enforced by preview as by the write —
  // both run this plan — or it would be a claim the door does not keep)
  for (const [cid, i] of lastAt("card", "upsert")) {
    const c = state.card.get(cid);
    if (!c) continue;
    const ck = state.card_kind.get(String(c.kind));
    const pat = ck && typeof ck.idPattern === "string" && ck.idPattern ? ck.idPattern : null;
    let re = null;
    try { re = pat ? new RegExp(pat) : null; } catch { re = null; }
    if (re && !re.test(String(c.id))) err(i, "card", cid, { error: "bad_id",
      note: `Card id "${clipW(c.id, 60)}" does not match its card kind "${c.kind}"'s idPattern ${clipW(pat, 80)}: send an id that matches it (formats {kind: "card_kind"} says the rule).` });
  }

  // a card's refs (F1): each a card of THIS project's state (stored, or filed in this batch) that the writer may read — its own
  // list and its kind's (rolesAdmit, the one rule) — and never the card itself. Checked only where an op sends refs: a card a
  // stored ref names and that is later removed leaves the ref as it is (the read drops a ref that resolves to nothing). A miss
  // names up to three near matches from the project's own cards (stored.cardPool, write.js loadStored: read only on a miss,
  // filtered here by the same rule, so a near match never names a card the writer may not read).
  const refsSent = new Set(steps.filter((s) => s.kind === "card" && s.op === "upsert" && s.present.includes("refs")).map((s) => s.id));
  const seen = (c) => who.isOwner || (rolesAdmit(who.reader, c.roleVisibility) && rolesAdmit(who.reader, ((state.card_kind.get(String(c.kind)) || {}).roleVisibility) ?? c.kindRoles ?? null));
  let pool = null;
  for (const [cid, i] of lastAt("card", "upsert")) {
    const c = state.card.get(cid);
    if (!c || !refsSent.has(cid) || !Array.isArray(c.refs)) continue;
    const self = c.refs.find((r) => (cardRefOf(r) || {}).key === cid);
    if (self) { err(i, "card", cid, { error: "bad_field", note: `Card "${clipW(c.id, 60)}" names itself in data.refs (${self}): a card relies on other cards only; leave it out.` }); continue; }
    const missing = c.refs.filter((r) => { const t = state.card.get(cardRefOf(r).key); return !t || !seen(t); });
    if (!missing.length) continue;
    // matched on the card's id and name, whatever its kind (a ref sent with the wrong kind still finds its card); the full ref
    // rides in nearOf's type, which it hands back untouched
    if (!pool) pool = (Array.isArray(who.pool) ? who.pool : []).filter((x) => seen({ kind: x.kind, roleVisibility: x.roleVisibility, kindRoles: x.kindRoles }))
      .map((x) => ({ id: x.id, name: x.name, type: `card/${x.kind}/${x.id}` }));
    const near = missing.map((r) => ({ ref: r, near: nearOf(cardRefOf(r).id, pool).map((x) => ({ ref: x.type, name: x.name })) }));
    const said = near.slice(0, 3).map((m) => `${m.ref}${m.near.length ? ` (near ${m.near.map((x) => (x.name ? `${x.ref} (${clipW(x.name, 40)})` : x.ref)).join(", ")})` : " (no near match)"}`).join("; ");
    err(i, "card", cid, { error: "missing_card", near,
      note: `Card "${clipW(c.id, 60)}" names in data.refs ${missing.length === 1 ? "a card" : `${missing.length} cards`} that this project does not hold: ${said}. Send refs as cards of this project, card/<kind>/<id> (read {kind: "card"} lists them), or file that card in the same batch.` });
  }

  // M3: the projects a node's ownedBy names (its own and its diagram parts'). Only a key the stored row did not already name is
  // checked, so a project archived later never refuses a part filed again as it was. The write door hands in who.owners
  // ({ self: the project written, keys: the projects the writer may read, which are the ones they may name }: write.js
  // prepareOwners); a plan run without the door (the importer's dry run, the selftests' rules) checks the form only.
  const owners = who.owners && Array.isArray(who.owners.keys) ? who.owners : null;
  if (owners) for (const [nid, i] of lastAt("node", "upsert")) {
    const n = state.node.get(nid);
    if (!n) continue;
    const had = new Set(ownedByIn(who.before && who.before.get(nid)));
    const may = owners.keys.filter((k) => k !== owners.self);
    for (const key of ownedByIn(n)) {
      if (had.has(key)) continue;
      const where = isObj(n.data) && n.data.ownedBy === key ? "data.ownedBy" : "a part's ownedBy (data.diagram.nodes)";
      if (key === owners.self) { err(i, "node", nid, { error: "bad_field", note: `Node "${clipW(nid, 60)}" names its own project "${key}" in ${where}: a part of this project is its own; leave ownedBy out.` }); continue; }
      if (!may.includes(key)) err(i, "node", nid, { error: "unknown_project", ownedBy: key, projects: may,
        note: `Node "${clipW(nid, 60)}" names "${clipW(key, 40)}" in ${where}, which is not a project you may name: ${may.length ? `send one of [${may.join(", ")}]` : "you may read no other project of this org, so leave ownedBy out"}.` });
    }
  }

  // an edge's two nodes exist
  for (const [eid, i] of lastAt("edge", "upsert")) {
    const e = state.edge.get(eid);
    if (!e) continue;
    for (const end of [e.from, e.to]) {
      if (!state.node.has(end)) err(i, "edge", eid, { error: "missing_node",
        note: `Edge ${e.from} -> ${e.to} names node "${end}", which is not in this project: file the node first (kind "node"), in this batch or before.` });
    }
  }
}
