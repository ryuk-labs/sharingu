// engine/tools/import/validate.mjs — every batch is checked with the DOOR'S OWN rules before anything is filed:
// src/knowledge/schema.js planKnowledge (ARCHITECTURE §2: one module for the write tools and the importer), run batch by
// batch as the owner, each batch against the state every earlier batch left — so a batch that passes here is one the door
// accepts given the batches before it (per op: the key, the fields, their caps; per batch end state: one goal root, every
// parent a goal, no cycle, an open question with 2+ options and no choice, an edge's two nodes present). On top, two
// importer rules the door does not have: a batch holds at most MAX_OPS ops, and a card's kind is a filed card_kind whose
// idPattern its id matches (the brain kit's card rule).
import { planKnowledge, MAX_OPS } from "../../src/knowledge/schema.js";

export { MAX_OPS };

// keyOf(op) -> the op's identity inside its kind (for messages)
export const keyOf = (o) => {
  const d = (o && o.data) || {};
  switch (o && o.kind) {
    case "aim": case "gtm": return o.kind;
    case "question": return d.qid;
    case "card_kind": return d.key;
    case "card": return `${d.kind}/${d.id}`;
    case "doc": return d.path;
    case "edge": return `${d.from} > ${d.to} (${d.kind})`;
    default: return d.id;
  }
};

// validateAll(batches) -> [{ batch, kind, key, error }]
export function validateAll(batches) {
  const errors = [];
  let stored = {};
  const cardKinds = new Map();
  batches.forEach((b, bi) => {
    if (b.ops.length > MAX_OPS) errors.push({ batch: bi, kind: b.kind, key: "(batch)", error: `too_many_ops: ${b.ops.length} > ${MAX_OPS}` });
    const plan = planKnowledge(b.ops, stored, { isOwner: true });
    for (const e of plan.errors) {
      const o = b.ops[e.index];
      errors.push({ batch: bi, kind: e.kind || (o && o.kind), key: e.id ?? keyOf(o), error: `${e.error} — ${e.note}` });
    }
    if (plan.errors.length) return;   // the door writes nothing of a refused batch: the next batch sees the state before it
    stored = plan.state;
    for (const o of b.ops) if (o.kind === "card_kind") cardKinds.set(o.data.key, o.data);
    for (const o of b.ops) {
      if (o.kind !== "card") continue;
      const ck = cardKinds.get(o.data.kind);
      if (!ck) errors.push({ batch: bi, kind: "card", key: keyOf(o), error: `importer rule: kind ${o.data.kind} is not a card_kind filed before it` });
      else if (ck.idPattern && !new RegExp(ck.idPattern).test(o.data.id)) errors.push({ batch: bi, kind: "card", key: keyOf(o), error: `importer rule: id does not match its kind's idPattern ${ck.idPattern}` });
    }
  });
  return errors;
}
