// engine/tools/import/goals.mjs — the goal tree (tenant-manifest.json goals.tree, checked by the kit's checkTree) → `goal`
// ops, parents before children, so ANY prefix of the list is a valid tree (one root, every parent present, no cycle).
import { result, applyMap, nz } from "./common.mjs";

// op field ← source field (the door: schema.js KINDS.goal)
export const GOAL_MAP = [
  ["id", "id"],
  ["parent", "parent"],
  ["title", "title"],
  ["dimensions", "dimensions", (v) => v ?? []],
  ["weight", "weight"],
  ["target", "target"],
  ["outcomeMetric", "outcomeMetric"],
  ["owner", "owner"],
  ["due", "due", (v, n) => nz(v ?? n.dueBy), ["dueBy"]],
  ["note", "note"],
  ["status", "status"],                  // a kit tree carries none (null); a go-live item its own (todo · in-progress · done …)
  ["sort", null, () => null],            // set below: the node's index in the source tree
];

export function mapGoals(src) {
  const r = result();
  const tree = src.tree || [];
  if (!tree.length) { r.skip("goal", (src.why && src.why.goal) || "the brain declares no goal tree", "-"); return r; }
  r.count("goal", tree.length);
  const idx = new Map(tree.map((n, i) => [n.id, i]));
  const depth = (n) => { let d = 0; for (let p = n.parent; p != null; p = tree[idx.get(p)].parent) d++; return d; };
  const ordered = [...tree].sort((a, b) => depth(a) - depth(b) || idx.get(a.id) - idx.get(b.id));
  for (const n of ordered) {
    const { data, used } = applyMap(GOAL_MAP, n);
    data.sort = idx.get(n.id);
    r.add("goal", data);
    r.unmapped("goal", n, used);
  }
  return r;
}
