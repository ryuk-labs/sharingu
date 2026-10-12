// engine/tools/import/aim.mjs — the project's aim + measure → ONE `aim` op (k_aim, one row per project).
// The kit's loader already checked it (load.mjs: aim non-empty, checkMeasure).
import { result } from "./common.mjs";

// op field ← source (loadBrain's m.aim: { text, measure, source, measureSource })
export const AIM_MAP = {
  aim: "m.aim.text — the kit's `aim` (file) or the JSON pointer it declares (e.g. model.json#/vision/mission)",
  measure: "m.aim.measure — null, or {name, value, period, prior, priorPeriod, source} (checkMeasure)",
};

export function mapAim(src) {
  const r = result();
  if (!src.aim) { r.skip("aim", (src.why && src.why.aim) || "the brain declares no aim", "-"); return r; }
  r.count("aim");
  r.add("aim", { aim: src.aim.text, measure: src.aim.measure ?? null });
  if (src.aim.measure == null) r.note("aim", `measure is null (${src.aim.measureSource})`);
  return r;
}
