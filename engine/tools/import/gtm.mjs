// engine/tools/import/gtm.mjs — the GTM template (the kit's kit.gtm: the product's default template or the brain's own
// file, checked by load.mjs for GTM_FIELDS and a non-empty activityKinds) → ONE `gtm` op (k_gtm, one row per project).
import { result } from "./common.mjs";

// op field ← source
export const GTM_MAP = { template: "the whole template JSON object, verbatim (engine/tools/import/templates/gtm.json when kit.gtm is {template: \"default\"})" };

export function mapGtm(src) {
  const r = result();
  if (!src.gtm) { r.skip("gtm", (src.why && src.why.gtm) || "the brain declares no GTM template (kit.gtm absent or null)", "-"); return r; }
  r.count("gtm");
  r.add("gtm", { template: src.gtm.template });
  r.note("gtm", `from ${src.gtm.from}`);
  return r;
}
