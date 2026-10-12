// engine/tools/import/overlay.mjs — `--overlay <ops.json>`: knowledge ops filed AFTER a source, folded into the import so
// the ship carries one consistent set (P2, 2026-10-01: sharingu's brain still describes the deleted build machinery; the
// architecture rewritten from the code, engine/tools/walkthrough/sharingu-architecture.ops.json, and the knowledge the
// real fill filed through preview → file must replace it in the data the ship imports).
// An overlay file is a JSON list of ops ({kind, op, data}), or an object holding one under `ops` or `items` (the walkthrough
// file's {project, clientRef, ops}, a fill's items file). The fold follows the door's own semantics (src/knowledge/schema.js
// planKnowledge), so filing the merged list writes what filing the source and then the overlay would:
//   · upsert on a key the import already files → merged onto it, field by field (the overlay's fields win; the door merges
//     an upsert onto the stored row the same way); on a new key → added;
//   · remove → the op with that key is dropped (a node takes its edges and renders with it, as the door does);
//   · an overlay that files its own goal ROOT (a goal with no parent) replaces the source's goal tree whole: the door allows
//     one root, so the source's goals that the overlay does not file again are dropped.
//   · edit (the importer's own, never filed as it is — sprint 3, "secrets in the data"): {kind, op: "edit", data: {the key
//     fields}, edits: [{field, find, flags?, replace, count?}]} rewrites a text field of the op with that key in place, so a
//     value that must not be stored (a retired password a source quotes) is removed WITHOUT the overlay holding it: `find` is
//     a regular expression naming the shape around it (e.g. "rotated off `\\d{3}`"), `replace` the words that stand
//     instead. `field` is a field of data ("body", "question") or one level down ("data.line"). `count` (default: one or
//     more) is how many matches the edit expects; a different count is reported (the source changed), never silent.
// The overlays fold in the order given; each op's key is the door's own (schema.js keyString).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keyString, KNOWLEDGE_KINDS } from "../../src/knowledge/schema.js";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// readOverlay(path) -> [{ kind, op, data }] (throws on a file that holds no op list)
export function readOverlay(path) {
  const p = resolve(path);
  let j;
  try { j = JSON.parse(readFileSync(p, "utf8")); } catch (e) { throw new Error(`--overlay ${path}: not readable JSON (${e.message})`); }
  const list = Array.isArray(j) ? j : isObj(j) ? (Array.isArray(j.ops) ? j.ops : Array.isArray(j.items) ? j.items : null) : null;
  if (!list) throw new Error(`--overlay ${path}: holds no op list (a JSON list, or {ops: […]} / {items: […]})`);
  list.forEach((o, i) => {
    if (!isObj(o) || !KNOWLEDGE_KINDS.includes(o.kind) || !["upsert", "remove", "edit"].includes(o.op) || !isObj(o.data)) {
      throw new Error(`--overlay ${path}: item ${i} is not a knowledge op {kind, op: "upsert" | "remove" | "edit", data}`);
    }
    if (o.op === "edit") {
      if (!Array.isArray(o.edits) || !o.edits.length) throw new Error(`--overlay ${path}: item ${i} (edit) holds no edits [{field, find, replace}]`);
      o.edits.forEach((e, j) => {
        if (!isObj(e) || typeof e.field !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(e.field) || typeof e.find !== "string" || !e.find || typeof e.replace !== "string" || (e.count != null && !(Number.isInteger(e.count) && e.count >= 0))) {
          throw new Error(`--overlay ${path}: item ${i} edit ${j} is not {field, find, flags?, replace, count?}`);
        }
        try { new RegExp(e.find, editFlags(e.flags)); } catch (err) { throw new Error(`--overlay ${path}: item ${i} edit ${j}: find is not a regular expression (${err.message})`); }
      });
    }
  });
  return list.map((o) => ({ kind: o.kind, op: o.op, data: o.data, ...(o.op === "edit" ? { edits: o.edits } : {}) }));
}

// an edit's flags: its own (i, m, s, u), always global (every match is rewritten)
const editFlags = (f) => [...new Set(["g", ...String(f || "").replace(/[^imsu]/g, "")])].join("");
// editOp(op, edits) -> [{ field, found, expected }] — each edit applied to a COPY of the op's data (op.data is replaced)
function editOp(op, edits) {
  const out = [];
  const data = { ...op.data };
  if (isObj(data.data)) data.data = { ...data.data };
  for (const e of edits) {
    const [a, b] = e.field.split(".");
    const holder = b ? data[a] : data, key = b || a;
    const v = isObj(holder) ? holder[key] : undefined;
    if (typeof v !== "string") { out.push({ field: e.field, found: 0, expected: e.count ?? null, missing: true }); continue; }
    const re = new RegExp(e.find, editFlags(e.flags));
    const found = (v.match(re) || []).length;
    holder[key] = v.replace(re, e.replace);
    out.push({ field: e.field, found, expected: e.count ?? null });
  }
  op.data = data;
  return out;
}

const keyOf = (o) => `${o.kind}\u0000${keyString(o.kind, o.data) ?? ""}`;

// applyOverlays(ops, overlays: [{ path, ops }]) -> { ops, report: [{ path, replaced, merged, added, removed, edited, ignored,
// goalsDropped, editFaults }], source: { kind: n } } — `source` counts the overlay ops per kind (the report's source column)
export function applyOverlays(opsIn, overlays) {
  let ops = opsIn.map((o) => ({ ...o, data: { ...o.data } }));
  const report = [], source = {};
  for (const ov of overlays) {
    const rep = { path: ov.path, merged: 0, added: 0, removed: 0, edited: 0, ignored: 0, goalsDropped: 0, editFaults: [] };
    // a goal root in the overlay replaces the source's tree (one root per project)
    const roots = ov.ops.filter((o) => o.kind === "goal" && o.op === "upsert" && o.data.parent == null && "parent" in o.data);
    if (roots.length) {
      const keep = new Set(ov.ops.filter((o) => o.kind === "goal").map((o) => o.data.id));
      const before = ops.length;
      ops = ops.filter((o) => o.kind !== "goal" || keep.has(o.data.id));
      rep.goalsDropped = before - ops.length;
    }
    const at = new Map(ops.map((o, i) => [keyOf(o), i]));
    for (const o of ov.ops) {
      const k = keyOf(o);
      if (o.op === "edit") {   // an edit rewrites an op the import already files: it adds no item (not counted as source)
        if (!at.has(k)) { rep.editFaults.push(`${o.kind} ${keyString(o.kind, o.data)}: not in the import (nothing edited)`); continue; }
        const res = editOp(ops[at.get(k)], o.edits);
        for (const x of res) {
          if (x.missing) rep.editFaults.push(`${o.kind} ${keyString(o.kind, o.data)} ${x.field}: no such text field`);
          else if (x.expected != null ? x.found !== x.expected : x.found < 1) rep.editFaults.push(`${o.kind} ${keyString(o.kind, o.data)} ${x.field}: ${x.found} match(es), expected ${x.expected ?? "1 or more"} (the source changed?)`);
        }
        rep.edited++;
        continue;
      }
      source[o.kind] = (source[o.kind] || 0) + 1;
      if (o.op === "remove") {
        if (!at.has(k)) { rep.ignored++; continue; }
        const drop = new Set([k]);
        if (o.kind === "node") {
          const id = o.data.id;
          for (const x of ops) if ((x.kind === "edge" && (x.data.from === id || x.data.to === id)) || (x.kind === "render" && x.data.screen === id)) drop.add(keyOf(x));
        }
        ops = ops.filter((x) => !drop.has(keyOf(x)));
        at.clear(); ops.forEach((x, i) => at.set(keyOf(x), i));
        rep.removed++;
        continue;
      }
      if (at.has(k)) { const t = ops[at.get(k)]; t.data = { ...t.data, ...o.data }; rep.merged++; }
      else { at.set(k, ops.length); ops.push({ kind: o.kind, op: "upsert", data: { ...o.data } }); rep.added++; }
    }
    report.push(rep);
  }
  return { ops, report, source };
}
