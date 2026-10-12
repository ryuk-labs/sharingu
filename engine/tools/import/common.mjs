// engine/tools/import/common.mjs — the importer's shared plumbing: the op shape, the field-map applier, a mapper's
// result record (ops · skips · notes · source counts), the id rule, canonical JSON + the stable hash a batch's clientRef
// is made of. No I/O here: the mappers stay pure (source objects in, ops out). The kinds, node types and statuses are the
// door's own registry (src/knowledge/schema.js — ARCHITECTURE §2: one module for the write tools and the importer).
import { createHash } from "node:crypto";
import { NODE_TYPES, NODE_STATUSES, GAP_STATUSES, EDGE_KINDS, KNOWLEDGE_KINDS } from "../../src/knowledge/schema.js";

export { NODE_TYPES, NODE_STATUSES, GAP_STATUSES, EDGE_KINDS };
export const KINDS = KNOWLEDGE_KINDS;

export const op = (kind, data) => ({ kind, op: "upsert", data });
export const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// an empty source value is "none": "" and undefined both file as null
export const nz = (v) => (v === undefined || v === "" ? null : v);

// the door's id charset for a check, card or node id (schema.js ID, not exported there): no spaces, no comma, no "|".
// safeId: a space becomes ":" (the board's own evidence keys already write "GET:/agentic"), any other refused character
// "_". Deterministic, so a check's ref and the node it names always agree.
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/+#@{}-]{0,119}$/;
export const safeId = (s) => String(s).replace(/ /g, ":").replace(/[^A-Za-z0-9._:/+#@{}-]/g, "_");
// a node's id is `<type>:<source id>` — k_nodes is keyed (project, id), and the model reuses one name across types
// (the lane `home` and the screen `home`; the table and the entity `approval_audit`). The board's own refs use this form
// (evidence.ref "api:GET /agentic", gaps' affects "surface:wf-goals"); the board's type `api` is the node type `door`.
export const nodeId = (type, id) => safeId(`${type}:${id}`);
export const NAME_MAX = 400;   // the door's cap on a node's / card's name (schema.js)
// capName(name, data, r) -> the name, cut to the door's cap; a cut name's full text stays verbatim in data.name
export function capName(name, data, r) {
  if (typeof name !== "string" || name.length <= NAME_MAX) return name;
  data.name = name;
  if (r) r.note("node", `a name over the door's ${NAME_MAX}-character cap is cut to ${NAME_MAX}; the full text stays in data.name`);
  return name.slice(0, NAME_MAX - 1) + "\u2026";
}

// applyMap(MAP, row) -> { data, used } · a MAP is [[opField, srcKey, fn?, alsoConsumes?], …]: data[opField] = fn ?
// fn(row[srcKey], row) : nz(row[srcKey]). `used` is every source key the map consumed (for the unmapped-field notes).
export function applyMap(map, row) {
  const data = {}, used = new Set();
  for (const [to, from, fn, also] of map) {
    if (from) used.add(from);
    for (const a of also || []) used.add(a);
    data[to] = fn ? fn(from ? row[from] : undefined, row) : nz(row[from]);
  }
  return { data, used };
}

// a mapper's result: ops for one or more kinds, what was skipped (reason → ids) and notes (a mapped-with-a-caveat line)
export function result() {
  const r = { ops: [], source: {}, skips: [], notes: [] };
  r.count = (kind, n = 1) => { r.source[kind] = (r.source[kind] || 0) + n; };
  r.add = (kind, data) => { r.ops.push(op(kind, data)); };
  r.skip = (kind, reason, id) => { r.skips.push({ kind, reason, id: String(id) }); };
  r.note = (kind, note, n = 1) => {
    const hit = r.notes.find((x) => x.kind === kind && x.note === note);
    if (hit) hit.n += n; else r.notes.push({ kind, note, n });
  };
  // unmapped(kind, row, used, ignore) — each source key no map consumed becomes a note, counted per key
  r.unmapped = (kind, row, used, ignore = []) => {
    for (const k of Object.keys(row)) if (!used.has(k) && !ignore.includes(k)) r.note(kind, `source field \`${k}\` not mapped (no field for it)`);
  };
  return r;
}

// canonical JSON: keys sorted at every level, so the same batch always hashes the same
export function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// the first `# ` heading of a markdown body, verbatim, else null
export function firstH1(md) {
  const m = /^# (.+)$/m.exec(String(md));
  return m ? m[1].trim() : null;
}
