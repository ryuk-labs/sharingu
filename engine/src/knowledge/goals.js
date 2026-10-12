// src/knowledge/goals.js — the typed readers for a project's goal tree and its aim (k_goals, k_aim). Every screen that
// draws or checks a goal reads the tree here: Goals, one goal, GTM, Build's finish line, the map's goals layer, and the
// door's goalRef check. One statement each, memoized per request under "knowledge:" (the write door forgets it).
import { db } from "../data.js";
import { reqMemo } from "../reqmemo.js";
import { selectSql } from "./store.js";
import { decodeRow } from "./schema.js";

export const GOAL_TREE_MAX = 500;
// the whole tree in the order it was filed to be read: `sort` first (nulls last), then id
export const GOAL_TREE_SQL = selectSql("goal") + " ORDER BY t.sort IS NULL, t.sort, t.id LIMIT " + GOAL_TREE_MAX;
export const AIM_SQL = selectSql("aim") + " LIMIT 1";

// goalTree(env, project) -> [{ id, title, parent, dimensions, weight, target, outcomeMetric, owner, due, note, status, sort }]
// — the node shape src/goals.js rollupCells reads. No project, or no goal filed yet: [].
export function goalTree(env, project) {
  if (!project) return Promise.resolve([]);
  return reqMemo(env, `knowledge:${project}:goal-tree`, async () =>
    ((await db(env).prepare(GOAL_TREE_SQL).bind(project).all()).results || []).map((r) => decodeRow("goal", r)));
}

// aimOf(env, project) -> { text, measure }: the project's aim and its measure {name, value, period, prior, priorPeriod,
// source} (null when none is filed). No project, or no aim filed yet: { text: null, measure: null }.
export function aimOf(env, project) {
  if (!project) return Promise.resolve({ text: null, measure: null });
  return reqMemo(env, `knowledge:${project}:aim`, async () => {
    const r = await db(env).prepare(AIM_SQL).bind(project).first();
    if (!r) return { text: null, measure: null };
    const a = decodeRow("aim", r);
    // D1b items 18 and 19: the aim's asOf and confidence (stored since migrate-055, never shown) and the declared absence of a
    // product model (migrate-058) ride along
    return { text: a.aim || null, measure: a.measure && typeof a.measure === "object" ? a.measure : null,
      asOf: a.asOf || null, confidence: a.confidence || null, productModel: a.productModel && a.productModel.none ? a.productModel : null };
  });
}
