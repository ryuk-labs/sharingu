// engine/tools/import/checks.mjs — the checks register (the board's board-pack/checks.json, given/when/then) → `check`
// ops. The door keeps refs as a list of the node, goal or question ids a check grades, so each source ref {type, id}
// becomes that id: a question or goal → its own id; anything else → the node id `<type>:<id>` (the board's `api` = the
// node type `door`), through the same safeId the model uses. The check's `source` stays verbatim in sourceType/sourceId.
import { result, applyMap, nodeId, safeId, ID_RE } from "./common.mjs";

// the board's `api` and the SarusPay-family boards' `endpoint` are both the node type `door`; a bunny ref names its target
// in `ref` (a test file, a screen) where the others use `id`
const REF_NODE_TYPE = { api: "door", endpoint: "door" };
export const refId = (ref) => {
  const id = ref.id ?? ref.ref;
  return ref.type === "question" || ref.type === "goal" ? String(id) : nodeId(REF_NODE_TYPE[ref.type] || ref.type, id);
};
// a check's source: {type, id}; a bunny PRD check's is {doc, line} (a file:line cite) → sourceType "doc", sourceId "<doc>:<line>"
const sourceType = (v) => (v ? v.type ?? (v.doc ? "doc" : null) : null);
const sourceId = (v) => (v ? v.id ?? (v.doc ? (v.line != null ? `${v.doc}:${v.line}` : v.doc) : null) : null);
// refsOf(refs, r) -> the ref ids, deduped. A source quirk: the board's API checks carry {type: "table", id: {read: [...],
// write: [...]}} (the door's whole tables object where an id belongs) — it expands to one ref per table named.
export function refsOf(refs, r) {
  const out = [];
  for (const x of refs || []) {
    if (typeof x === "string") out.push(x);
    else if (x && x.type === "table" && x.id && typeof x.id === "object") {
      for (const t of [...(x.id.read || []), ...(x.id.write || [])]) out.push(refId({ type: "table", id: t }));
      if (r) r.note("check", "a table ref carrying {read, write} (a source quirk) expands to one ref per table");
    } else out.push(refId(x));
  }
  return [...new Set(out)];
}

// op field ← source field (the door: schema.js KINDS.check)
export const CHECK_MAP = [
  ["id", "id", (v) => safeId(v)],            // a space → ":" (220 API checks: "API.GET /x.behavior" → "API.GET:/x.behavior")
  ["kind", "kind"],
  ["method", "method"],
  ["severity", "severity"],
  ["title", "title"],
  ["given", "given"],
  ["when", "when"],
  ["then", "then"],
  ["sourceType", "source", sourceType],
  ["sourceId", "source", sourceId],
  ["refs", "refs"],                          // set below: refsOf
  ["rulings", "rulings", (v) => v ?? []],
  ["status", "status"],
];

// known: every id this import files (node ids, qids, goal ids) — a ref naming none of them is noted, not refused
export function mapChecks(src, { known = new Set() } = {}) {
  const r = result();
  const b = src.board;
  const why = src.why && src.why.check;
  if (!b) { r.skip("check", why || "no build board — the brain files no checks register", "-"); return r; }
  if (!b.checks) { r.skip("check", why || "the board has no board-pack/checks.json", "-"); return r; }
  if (!Array.isArray(b.checks)) { r.skip("check", "board-pack/checks.json is not a list", "-"); return r; }
  r.count("check", b.checks.length);
  const ids = new Set();
  for (const c of b.checks) {
    if (!c || typeof c.id !== "string" || !c.id) { r.skip("check", "a row with no id", "?"); continue; }
    const { data, used } = applyMap(CHECK_MAP, c);
    data.refs = refsOf(c.refs, r);
    if (c.source && c.source.doc && !c.source.type) r.note("check", "source {doc, line} (a file:line cite) → sourceType \"doc\", sourceId \"<doc>:<line>\"");
    for (const x of c.refs || []) if (x && typeof x === "object" && x.id == null && x.ref != null) {
      r.note("check", "a ref {type, ref} names its target in `ref` → \"<type>:<ref>\"");
      for (const k of Object.keys(x)) if (!["type", "ref"].includes(k)) r.note("check", `ref field \`${k}\` not carried (a ref is its id)`);
    }
    if (ids.has(data.id)) { r.skip("check", "a duplicate id (the first row wins)", c.id); continue; }
    if (!ID_RE.test(data.id)) { r.skip("check", "an id the door's id rule refuses even after safeId", c.id); continue; }
    ids.add(data.id);
    if (data.id !== c.id) r.note("check", "id rewritten by safeId (a space → \":\") to fit the door's id rule");
    for (const ref of data.refs) if (!known.has(ref)) r.note("check", "a ref names no node, question or goal this import files (kept)");
    r.add("check", data);
    r.unmapped("check", c, used);
  }
  return r;
}
