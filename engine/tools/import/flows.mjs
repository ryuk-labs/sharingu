// engine/tools/import/flows.mjs — the flows (the kit's `flows` source, checked by load.mjs) → `node` type flow, the steps
// verbatim in data; plus one `flow-step` edge per (flow, screen|door) a step names, when that screen/door is a node (a
// later step on the same target folds into that edge's data.steps — the door keys an edge by (from, to, kind)).
import { result, nodeId, capName, NODE_STATUSES } from "./common.mjs";

// op field ← source field (the door: schema.js KINDS.node, type flow)
export const FLOW_NODE_MAP = {
  type: '"flow"',
  id: '"flow:" + id',
  name: "name",
  status: "status (live·planned·retired, the kit's FLOW_STATUSES)",
  data: "every other field verbatim: desc, audience, goalRef, steps[], foldedInto, endToEnd, blockedBy",
};

// the door's flow rule: data.steps is a list of {actor, does}. A source whose steps name a screen but no actor (saruspay: a
// bare screen id; bunny: {screen, to, does}) keeps them verbatim in data.screenSteps — the door would refuse them as steps.
const actorStep = (s) => s !== null && typeof s === "object" && typeof s.actor === "string" && s.actor.trim() !== "" && typeof s.does === "string" && s.does.trim() !== "";
export const SCREEN_STEPS = "screenSteps";

// known: the node ids the model files (a flow-step edge only joins two nodes)
export function mapFlows(src, known = new Set()) {
  const r = result();
  const flows = src.flows || [];
  r.count("node", flows.length);
  for (const f of flows) {
    const { id, name, status, ...rest } = f;
    const fid = nodeId("flow", id);
    if (Array.isArray(rest.steps) && !rest.steps.every(actorStep)) {
      rest[SCREEN_STEPS] = rest.steps;
      delete rest.steps;
      r.note("node", `flow: steps that name no actor (a bare screen id, or {screen, to, does}) ride verbatim in data.${SCREEN_STEPS} — the door takes data.steps only as {actor, does}`);
    }
    r.add("node", { type: "flow", id: fid, name: capName(name ?? id, rest, r), status: NODE_STATUSES.includes(status) ? status : null, data: rest });
    const seen = new Map();
    (f.steps || []).forEach((st0, i) => {
      const st = typeof st0 === "string" ? { screen: st0 } : st0 || {};
      for (const [type, ref] of [["screen", st.screen], ["door", st.door]]) {
        if (!ref) continue;
        const to = nodeId(type, ref);
        if (seen.has(to)) { seen.get(to).data.steps.push({ i, state: st.state ?? null }); r.note("edge", "flow-step: a later step on the same (flow, target) folds into that edge's data.steps"); continue; }
        r.count("edge");
        if (!known.has(to)) { seen.set(to, { data: { steps: [] }, dead: true }); r.skip("edge", `flow-step target ${type} is not a model node`, `${fid} > ${to}`); continue; }
        seen.set(to, { from: fid, to, kind: "flow-step", label: st.state ?? null, data: { steps: [{ i, state: st.state ?? null }] } });
      }
    });
    for (const e of seen.values()) if (!e.dead) r.add("edge", e);
  }
  return r;
}
