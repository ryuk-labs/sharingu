// src/formats.js — the `formats` read (sprint 3, B1; docs/plan/MCP.md §4–§5): the standard every project is filled in, the
// same for every project, so it needs no seat and no project. Generated ENTIRELY from the two registries — the knowledge
// kinds (src/knowledge/schema.js KINDS) and the contribution shapes (src/shapes.js SHAPES): no field, hint, example or place
// is typed here. The `formats` tool, its REST twin GET /formats and the contract (tools/make-door-contract.py, through
// tools/formats-dump.mjs) answer from these functions. Pure, no I/O.
//   formatsAnswer({})              -> the list: every kind and every shape, one line each
//   formatsAnswer({ kind })        -> one kind: its fields, rules, example, where it shows, its checklist items
//   formatsAnswer({ shape })       -> one shape: its fields, example, where it shows
import { KINDS, KNOWLEDGE_KINDS, KNOWLEDGE_FIELDS_DOC, MAX_OPS, fieldDocs, nounOf } from "./knowledge/schema.js";
import { SHAPES, SHAPE_KEYS } from "./shapes.js";
import { PROOF_FORMS } from "./transmission.js";
import { GRADE_VERDICTS } from "./knowledge/checks.js";

// ITEM_FORMS (D1b item 14): the two things people file that are neither a knowledge kind nor a contribution — a grade of a
// check and an answer to a question — declared like a kind, so `formats {kind: "grade"}` answers how to file one instead of
// unknown_kind. Each files through its own tool at once (sprint 19: submit_grade, respond), never through a preview.
export const ITEM_FORMS = {
  grade: {
    line: "a grade of one check of the project's register: proven, refused or incomplete, with the proof you observed",
    fields: [
      { name: "checkId", type: "text", required: true, hint: "a check's id (read {kind: \"check\"} lists them; an unknown id is refused unknown_check)" },
      { name: "verdict", type: "text", required: true, values: GRADE_VERDICTS, hint: "what you observed: proven when the check holds, refused when it does not, incomplete when you could not tell" },
      { name: "proof", type: "text", hint: `P${PROOF_FORMS.slice(1)}. With proof the grade counts at once and lights every node the check names; without, it waits for the owner` },
    ],
    rules: ["the verdict is what YOU observed: never copy one from an example or an earlier grade", "a grade with proof counts at once; the owner can overturn any grade"],
    example: { checkId: "<a check id>", verdict: "<proven | refused | incomplete: what you observed>", proof: "npm test -> exit 0, 12 passing" },
    call: "submit_grade {project, checkId, verdict, proof}",
    shows: [{ tab: "map", path: "/map", region: "lights", what: "the light of every node the check names" }, { tab: "goals", path: "/goals", region: "tree", what: "the checks under each goal" }],
  },
  answer: {
    line: "an answer to an open question: one of its options, by index (the owner's answer rules it)",
    fields: [
      { name: "qid", type: "text", required: true, hint: "the question's id, as `decisions` lists it" },
      { name: "option", type: "int", required: true, hint: "the chosen option's index: 0 for A, 1 for B, 2 for C" },
      { name: "provisional", type: "bool", hint: "mark the answer provisional (the question stays open)" },
    ],
    rules: ["typed text is refused: choose an option", "a question that is not open is refused"],
    example: { qid: "<a question id>", option: 0 },
    call: "respond {project, qid, option}",
    shows: [{ tab: "decisions", path: "/decisions", region: "questions", what: "the question, with your answer (ruled at once when the owner answers)" }],
  },
};
export const ITEM_FORM_KEYS = Object.keys(ITEM_FORMS);

// ---- the split door (sprint 19, the owner's ruling 2026-10-13: "by what the write does") ----
// A preview shows; three write tools file, each ONE operation of a preview: file_contribution its contributions (it only adds),
// save_knowledge its knowledge upserts (an upsert can change what is held), remove_knowledge its knowledge removes. WRITE_TOOLS
// maps each operation to its tool, and opOf(item) names an item's operation, so the preview (src/preview.js, every item's
// filesWith), the three tools (each refuses another operation's item, naming its tool), their schemas (below) and the confirm
// (src/mcp.js) read ONE table. A knowledge item whose op is not "remove" is an upsert's: an unknown op is planKnowledge's
// bad_op, a `needs` the preview shows and save_knowledge never files.
export const WRITE_TOOLS = { contribution: "file_contribution", upsert: "save_knowledge", remove: "remove_knowledge" };
export const WRITE_TOOL_NAMES = Object.values(WRITE_TOOLS);
export const OP_OF_TOOL = Object.fromEntries(Object.entries(WRITE_TOOLS).map(([op, t]) => [t, op]));
// the words an operation is named by in a refusal and a receipt ("Item 2 is a knowledge remove")
export const OP_WORDS = { contribution: ["contribution", "contributions"], upsert: ["knowledge upsert", "knowledge upserts"], remove: ["knowledge remove", "knowledge removes"] };
// the tools the other two forms file through, at once (a preview refuses them, pointing here)
export const OTHER_DOORS = { grade: "submit_grade", answer: "respond" };
const isObjV = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// itemForm(item) -> "knowledge" | "contribution" | "grade" | "answer" | null (none, or more than one form in one item)
export function itemForm(it) {
  if (!isObjV(it)) return null;
  const hits = [isObjV(it.contribution) && "contribution", isObjV(it.grade) && "grade", isObjV(it.answer) && "answer",
    ("kind" in it || "op" in it || "data" in it) && "knowledge"].filter(Boolean);
  return hits.length === 1 ? hits[0] : null;
}
// opOf(item) -> "contribution" | "upsert" | "remove" (a write tool files it) | "grade" | "answer" (its own tool) | null
export function opOf(it) {
  const f = itemForm(it);
  return f === "knowledge" ? (it.op === "remove" ? "remove" : "upsert") : f;
}

// The item schemas (sprint 17, 17.1; split in sprint 19): GENERATED here at load from the registries the door validates with,
// never typed: the knowledge kinds (KINDS; the two ops of KNOWLEDGE_OPS, one tool each above; data's fields per kind from KNOWLEDGE_FIELDS_DOC, data
// left open since the kinds differ: formats {kind} has each one's; a remove's data names its key, KINDS[k].key) and the
// contribution shapes (SHAPES: the lanes, the fields every shape requires, every field's type). Never stricter than the door: each
// form requires its own keys and is closed to nothing, since the door takes an extra key beside them; an item's inner object stays
// open too (a field the door reads that the registry does not list, a contribution's clientRef, passes). PREVIEW_ITEM_SCHEMA is the
// anyOf of the three forms a preview shows (anyOf: the tool-schema subset OpenAI takes; oneOf is outside it); each write tool's
// items are exactly its form (ITEM_SCHEMA_OF). The forms are told apart by their required keys and the op's const: an item naming
// two forms matches two branches, and the door's itemForm refuses it. tools/annotations-selftest.mjs proves a valid item of each
// form passes its schemas and a shape outside them is refused.
const JSON_TYPE = { text: "string", int: "integer", real: "number", bool: "boolean", list: "array", object: "object" };
const propOf = (x) => ({ ...(JSON_TYPE[x.type] ? { type: JSON_TYPE[x.type] } : {}), ...(x.values ? { enum: x.values } : {}) });
const shapeFields = new Map();
for (const s of SHAPE_KEYS) for (const x of SHAPES[s].fields) if (!shapeFields.has(x.name)) shapeFields.set(x.name, x);
const KEY_DOC = KNOWLEDGE_KINDS.map((k) => `${k} {${KINDS[k].key.map((c) => c.f).join(", ")}}`).join(" · ");
const knowledgeForm = (op, description, data) => ({ type: "object", description, required: ["kind", "op", "data"],
  properties: { kind: { type: "string", enum: KNOWLEDGE_KINDS, description: "the knowledge kind (formats {kind} answers its fields, an example and where it shows)" },
    op: { type: "string", const: op }, data: { type: "object", description: data } } });
export const ITEM_SCHEMA_OF = {
  file_contribution: { type: "object", description: `a contribution, in one of the shapes (its lane): ${SHAPE_KEYS.map((s) => `${s}: ${SHAPES[s].line}`).join("; ")}`,
    required: ["contribution"], properties: { contribution: { type: "object",
      required: [...shapeFields.values()].filter((x) => SHAPE_KEYS.every((s) => SHAPES[s].fields.some((y) => y.name === x.name && y.required))).map((x) => x.name),
      properties: Object.fromEntries([...shapeFields.values()].map((x) => [x.name, x.name === "lane" ? { type: "string", enum: SHAPE_KEYS } : propOf(x)])) } } },
  save_knowledge: knowledgeForm("upsert", "a knowledge upsert: kind, op \"upsert\" (adds the item, or changes it, merging the fields sent) and data, the kind's fields", `the kind's fields: ${KNOWLEDGE_FIELDS_DOC}`),
  remove_knowledge: knowledgeForm("remove", "a knowledge remove: kind, op \"remove\" and data, the key of the item it removes", `the item's key: ${KEY_DOC}`),
};
export const PREVIEW_ITEM_SCHEMA = { anyOf: [ITEM_SCHEMA_OF.file_contribution, ITEM_SCHEMA_OF.save_knowledge, ITEM_SCHEMA_OF.remove_knowledge] };

const whenWords = (w) => (!w ? null : w.is ? `${w.field} is ${w.is.join(" or ")}` : w.prefix ? `${w.field} starts with ${w.prefix}` : w.present ? `${w.field} is sent` : null);
const tabWords = (p) => (p.tabFrom === "card_kind.tab" ? `its card kind's tab (default ${p.tab})` : p.tabFrom === "tab" ? `its own tab (default ${p.tab})` : p.tab);
const placeDoc = (p) => ({ tab: tabWords(p), path: p.path, region: p.region, what: p.what, ...(p.when ? { when: whenWords(p.when) } : {}) });
// a field as the answer says it: required only when it is
const fieldDoc = (x) => { const { required, checked, ...rest } = x; return { ...(required ? { required: true } : {}), ...rest }; };

export const FORMATS_NEXT = "Call formats {kind} or formats {shape} for its fields, an example and where it shows.";
export function formatsList() {
  return {
    kinds: KNOWLEDGE_KINDS.map((k) => ({ kind: k, line: KINDS[k].line, tabs: [...new Set(KINDS[k].shows.map((p) => p.tab))] })),
    items: ITEM_FORM_KEYS.map((k) => ({ kind: k, line: ITEM_FORMS[k].line, tabs: [...new Set(ITEM_FORMS[k].shows.map((p) => p.tab))] })),
    shapes: SHAPE_KEYS.map((s) => ({ shape: s, line: SHAPES[s].line })),
    file: `Preview first, then file: preview {project, items} shows what will be filed, where it shows, how it is graded and what it reaches, and writes nothing. An item is a contribution {contribution: {lane: <the shape>, what, why, ...}}, a knowledge upsert {kind, op: "upsert", data} or a knowledge remove {kind, op: "remove", data}; 1 to ${MAX_OPS} a call. Each item's filesWith names the tool that writes it, with the previewId and that tool's items as previewed: file_contribution the contributions, save_knowledge the upserts, remove_knowledge the removes (each tool's knowledge files all or nothing). A grade is submit_grade's and an answer respond's: each files at once, without a preview.`,
    next: FORMATS_NEXT,
  };
}
export function formatsOfKind(kind) {
  const spec = KINDS[kind];
  return {
    kind, noun: nounOf(kind, 1), line: spec.line, key: spec.key.map((c) => c.f),
    fields: fieldDocs(kind).map(fieldDoc),
    ...(spec.rules && spec.rules.length ? { rules: spec.rules } : {}),
    // sprint 3 S3b: what only the owner files, and what anyone else does instead (the write door refuses it owner_only)
    ...(spec.ownerOnly && spec.ownerOnly.length ? { ownerOnly: spec.ownerOnly } : {}),
    example: spec.example.op,
    ...(spec.example.imageOp ? { imageExample: spec.example.imageOp } : {}),
    ...(spec.example.needs ? { needsFirst: spec.example.needs } : {}),
    call: `preview {project, items: [${spec.example.needs ? "<needsFirst>, " : ""}<example>]}, then save_knowledge {previewId, items}`,
    shows: spec.shows.map(placeDoc),
    checklist: spec.checklist,
  };
}
export function formatsOfShape(shape) {
  const s = SHAPES[shape];
  return {
    shape, label: s.label, line: s.line,
    ...(s.rule ? { rule: s.rule } : {}),
    ...(s.proofRule ? { proofRule: s.proofRule } : {}),
    fields: s.fields.map(fieldDoc),
    example: s.example,
    ...(s.cases ? { cases: s.cases } : {}),
    call: "preview {project, items: [{contribution: <example>}]}, then file_contribution {previewId, items}",
    shows: s.shows.map(placeDoc),
  };
}
// formatsAnswer(args) -> the list, one kind, one shape, or { error: unknown_kind | unknown_shape, kinds | shapes, note }
export function formatsAnswer(a = {}) {
  const args = a && typeof a === "object" ? a : {};
  const kind = args.kind != null ? String(args.kind).trim().toLowerCase().slice(0, 40) : "";
  const shape = args.shape != null ? String(args.shape).trim().toLowerCase().slice(0, 40) : "";
  if (kind) {
    if (ITEM_FORMS[kind]) return { kind, ...ITEM_FORMS[kind], fields: ITEM_FORMS[kind].fields.map(fieldDoc) };
    if (!KINDS[kind]) return { error: "unknown_kind", kind, kinds: [...KNOWLEDGE_KINDS, ...ITEM_FORM_KEYS], note: `No kind "${kind}": send kind as one of ${[...KNOWLEDGE_KINDS, ...ITEM_FORM_KEYS].join(", ")}.` };
    return formatsOfKind(kind);
  }
  if (shape) {
    if (!SHAPES[shape]) return { error: "unknown_shape", shape, shapes: SHAPE_KEYS, note: `No shape "${shape}": send shape as one of ${SHAPE_KEYS.join(", ")} (a contribution's shape is its lane).` };
    return formatsOfShape(shape);
  }
  return formatsList();
}
// formatsAll() -> every answer at once: what the contract carries (tools/formats-dump.mjs)
export function formatsAll() {
  return { list: formatsList(), kinds: Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, formatsOfKind(k)])), items: Object.fromEntries(ITEM_FORM_KEYS.map((k) => [k, formatsAnswer({ kind: k })])), shapes: Object.fromEntries(SHAPE_KEYS.map((s) => [s, formatsOfShape(s)])) };
}
