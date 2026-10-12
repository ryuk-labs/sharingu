// engine/tools/import/batch.mjs — orders the ops so every batch is valid given the batches before it, and cuts them
// into preview-then-file calls: one kind per batch (a clean ledger row per call, a refusal names one kind), at most
// `max` ops (the door's cap, 200) and `maxBytes` of ops JSON each. Kind order: the aim and the template first; the
// goals (parents first, so a split tree is still valid, and all in ONE batch while they fit); card kinds before
// cards; questions; nodes before edges; checks after the nodes, questions and goals they ref; docs; then the styles and
// the renders (a render names a screen node and a style filed before it; its body rides in the op, so a batch of renders
// is cut by the same bytes cap: the door takes at most 256 KB of bodies a call).
import { canon, sha256 } from "./common.mjs";

export const KIND_ORDER = ["aim", "gtm", "goal", "card_kind", "question", "node", "edge", "check", "card", "doc", "style", "render"];

export function toBatches(ops, project, { max = 200, maxBytes = 256_000 } = {}) {
  const batches = [];
  for (const kind of KIND_ORDER) {
    const list = ops.filter((o) => o.kind === kind);
    let cur = [], bytes = 0;
    for (const o of list) {
      const n = Buffer.byteLength(JSON.stringify(o));
      if (cur.length && (cur.length >= max || bytes + n > maxBytes)) { batches.push(cur); cur = []; bytes = 0; }
      cur.push(o); bytes += n;
    }
    if (cur.length) batches.push(cur);
  }
  const unknown = ops.filter((o) => !KIND_ORDER.includes(o.kind));
  if (unknown.length) batches.push(unknown);   // the validator refuses them by name
  return batches.map((b) => ({ kind: b[0].kind, clientRef: clientRefOf(project, b), bytes: Buffer.byteLength(JSON.stringify(b)), ops: b }));
}

// a stable hash of the batch: the same project + the same ops (canonical JSON) → the same clientRef, so a re-run is a
// no-op at the door
export const clientRefOf = (project, ops) => "import:" + sha256(canon({ project, ops })).slice(0, 32);
