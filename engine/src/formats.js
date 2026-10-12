// src/formats.js — the `formats` read (sprint 3, B1; docs/plan/MCP.md §4–§5): the standard every project is filled in, the
// same for every project, so it needs no seat and no project. Generated ENTIRELY from the two registries — the knowledge
// kinds (src/knowledge/schema.js KINDS) and the contribution shapes (src/shapes.js SHAPES): no field, hint, example or place
// is typed here. The `formats` tool, its REST twin GET /formats and the contract (tools/make-door-contract.py, through
// tools/formats-dump.mjs) answer from these functions. Pure, no I/O.
//   formatsAnswer({})              -> the list: every kind and every shape, one line each
//   formatsAnswer({ kind })        -> one kind: its fields, rules, example, where it shows, its checklist items
//   formatsAnswer({ shape })       -> one shape: its fields, example, where it shows
import { KINDS, KNOWLEDGE_KINDS, MAX_OPS, fieldDocs, nounOf } from "./knowledge/schema.js";
import { SHAPES, SHAPE_KEYS } from "./shapes.js";
import { PROOF_FORMS } from "./transmission.js";

// ITEM_FORMS (D1b item 14): the two things people file that are neither a knowledge kind nor a contribution — a grade of a
// check and an answer to a question — declared like a kind, so `formats {kind: "grade"}` answers how to file one instead of
// unknown_kind. They are filed through preview → file as {grade: {…}} and {answer: {…}} (src/preview.js).
export const ITEM_FORMS = {
  grade: {
    line: "a grade of one check of the project's register: proven, refused or incomplete, with the proof you observed",
    fields: [
      { name: "checkId", type: "text", required: true, hint: "a check's id (read {kind: \"check\"} lists them; an unknown id is refused unknown_check)" },
      { name: "verdict", type: "text", required: true, values: ["proven", "refused", "incomplete"], hint: "what you observed: proven when the check holds, refused when it does not, incomplete when you could not tell" },
      { name: "proof", type: "text", hint: `P${PROOF_FORMS.slice(1)}. With proof the grade counts at once and lights every node the check names; without, it waits for the owner` },
    ],
    rules: ["the verdict is what YOU observed: never copy one from an example or an earlier grade", "a grade with proof counts at once; the owner can overturn any grade"],
    example: { grade: { checkId: "<a check id>", verdict: "<proven | refused | incomplete: what you observed>", proof: "npm test -> exit 0, 12 passing" } },
    call: "preview {project, items: [<example>]}, then file {previewId, items}",
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
    example: { answer: { qid: "<a question id>", option: 0 } },
    call: "preview {project, items: [<example>]}, then file {previewId, items}",
    shows: [{ tab: "decisions", path: "/decisions", region: "questions", what: "the question, with your answer (ruled at once when the owner answers)" }],
  },
};
export const ITEM_FORM_KEYS = Object.keys(ITEM_FORMS);

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
    file: `Preview first, then file: preview {project, items} shows what will be filed, where it shows, how it is graded and what it reaches, and writes nothing; file {previewId, items} (the same items) writes it. An item is a kind's op {kind, op: "upsert" | "remove", data} (knowledge files all or nothing), or {contribution: {lane: <the shape>, what, why, ...}}, {grade: {checkId, verdict, proof}} or {answer: {qid, option}}; 1 to ${MAX_OPS} a call. respond and submit_grade still file at once, without a preview.`,
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
    call: `preview {project, items: [${spec.example.needs ? "<needsFirst>, " : ""}<example>]}, then file {previewId, items}`,
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
    call: "preview {project, items: [{contribution: <example>}]}, then file {previewId, items}",
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
