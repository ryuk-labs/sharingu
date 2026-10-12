// engine/tools/import/questions.mjs — questions + their options + their rulings → `question` ops (options inline).
// Sources: the kit's `rows` decisions (sharingu: board-pack/served-decisions.json; ryuklabs: 10_TRUTH/owner-questions.json),
// already checked by load.mjs checkRow. decidedBy/decidedAt come from the board's model.json rulings[] (ruledBy,
// recordedAt) when the brain has a board — the door lets only the owner write a ruling, so the import key is the owner's.
// The kit's gaps carry no options, and the door refuses an open question with fewer than 2 — so each gap files as a
// `node` of type gap (open) instead (ARCHITECTURE §2 lists `gap` as a node type).
// The M-ADRs (the kit's mdSplit rows) file as `card` kind decision (cards.mjs, ARCHITECTURE §9), not here.
import { result, applyMap, nz, nodeId, capName } from "./common.mjs";

// op field ← source field (the door: schema.js KINDS.question + options inline)
export const QUESTION_MAP = [
  ["qid", "qid"],
  ["question", "question"],
  ["why", "why"],
  ["area", "area"],
  ["severity", "severity"],
  ["status", "status"],
  ["choice", "choice"],                      // verbatim: a letter, a slug, or (ryuklabs) an integer option index
  ["label", "label"],
  ["rationale", "rationale"],
  ["affects", "affects", (v) => v ?? []],
  ["blocks", "blocks", (v) => v ?? []],
  ["whoOwes", "whoOwes"],
  ["waitingOn", "waitingOn"],
  ["implStatus", "implStatus"],
  ["supersededBy", "supersededBy"],
  ["options", "options", (v) => (v || []).map((o) => ({ what: o.what, tradeoff: nz(o.tradeoff) }))],
  // decidedBy ← model.json rulings[qid].ruledBy · decidedAt ← rulings[qid].recordedAt, else the row's `updated` (set below)
];
// op field ← gap field (k_nodes type gap)
export const GAP_NODE_MAP = {
  type: '"gap"', id: '"gap:" + qid', name: "question", status: '"open"',
  data: "{ qid, ref, affects, waitingOn, updated, rationale } verbatim (+ from: the gaps file)",
};

export function mapQuestions(src) {
  const r = result();
  const rulings = new Map(((src.board && src.board.model && src.board.model.rulings) || []).map((x) => [x.qid, x]));
  r.count("question", src.questionRows.length);
  for (const row of src.questionRows) {
    const { data, used } = applyMap(QUESTION_MAP, row);
    const ru = rulings.get(row.qid);
    const ruled = row.status !== "open";
    data.decidedBy = ruled ? nz(ru && ru.ruledBy) : null;
    data.decidedAt = ruled ? nz((ru && ru.recordedAt) || row.updated) : null;
    used.add("updated");
    if (row.updated && !(ruled && !(ru && ru.recordedAt))) r.note("question", "source field `updated` (a date) not kept: the ruling's recordedAt is decidedAt, or the question is open");
    if (ruled && !data.decidedBy) r.note("question", "ruled, but no source names who ruled it (decidedBy null)");
    if (ruled && !data.decidedAt) r.note("question", "ruled, but no source dates it (decidedAt null)");
    for (const o of row.options || []) for (const k of Object.keys(o)) if (!["what", "tradeoff"].includes(k)) r.note("question", `option field \`${k}\` not mapped`);
    r.add("question", data);
    r.unmapped("question", row, used);
  }
  if (src.board && src.board.model && !rulings.size && (!src.layout || src.layout === "kit")) r.note("question", "the board's model.json has no rulings[] — decidedBy/decidedAt come from nowhere");

  // the gaps → gap nodes
  for (const g of src.gaps || []) {
    r.count("question");
    r.skip("question", src.gapReason || "a gap carries no options (an open question needs >= 2) — filed as a `node` of type gap instead", g.qid);
    r.count("node");
    const { qid, question, ...rest } = g;
    const data = { qid, ...rest, from: src.gapsFrom };
    r.add("node", { type: "gap", id: nodeId("gap", qid), name: capName(question, data, r), status: "open", data });
  }
  return r;
}
