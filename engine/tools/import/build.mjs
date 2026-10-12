// engine/tools/import/build.mjs — runs every mapper over one read brain and merges the results: the ops, what each kind
// counted at the source, the skips, the notes and the sources not imported. The model runs first (a flow-step edge joins
// only nodes the model files); the docs run before the cards (a card whose bytes are a filed doc is not filed twice).
import { mapAim } from "./aim.mjs";
import { mapGoals } from "./goals.mjs";
import { mapFlows } from "./flows.mjs";
import { mapQuestions } from "./questions.mjs";
import { mapChecks } from "./checks.mjs";
import { mapModel } from "./model.mjs";
import { mapCards } from "./cards.mjs";
import { mapGtm } from "./gtm.mjs";
import { mapDocs } from "./docs.mjs";
import { mapQueue } from "./queue.mjs";
import { mapRenders } from "./renders.mjs";

export function buildImport(src) {
  const model = mapModel(src);
  const known = new Set(model.ops.filter((o) => o.kind === "node").map((o) => o.data.id));
  const questions = mapQuestions(src);
  const docs = mapDocs(src);
  const qids = new Set(questions.ops.filter((o) => o.kind === "question").map((o) => o.data.qid));
  const goals = mapGoals(src), flows = mapFlows(src, known);
  // every id a check's ref may name: the nodes (model, flows, gaps), the questions and the goals this import files
  const refable = new Set([...known, ...qids, ...[...questions.ops, ...flows.ops, ...goals.ops].filter((o) => o.kind === "node" || o.kind === "goal").map((o) => o.data.id)]);
  // the screens' renders and styles: each names a screen node this import files
  const screens = new Set(model.ops.filter((o) => o.kind === "node" && o.data.type === "screen").map((o) => o.data.id));
  const renders = mapRenders(src, { known: screens });
  const parts = [mapAim(src), mapGtm(src), goals, questions, model, flows, mapChecks(src, { known: refable }), docs,
    mapCards(src, { docs: docs.ops, qids }), mapQueue(src), renders];
  const sourceOf = {};
  for (const p of parts) for (const [k, n] of Object.entries(p.source)) sourceOf[k] = (sourceOf[k] || 0) + n;
  return {
    ops: parts.flatMap((p) => p.ops),
    skips: parts.flatMap((p) => p.skips),
    notes: [...parts.flatMap((p) => p.notes), ...(src.notes || [])],
    notImported: [...src.notImported, ...parts.flatMap((p) => p.notImported || [])],
    sourceOf,
    renders: { from: renders.from || null, byFormat: renders.byFormat, bytes: renders.bytes },
  };
}
