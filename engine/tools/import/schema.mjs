// engine/tools/import/schema.mjs — the brain reader's schema (the importer reads old brains as one-time sources): the closed
// `kit` section of a brain's 02_AGENT_R/publish-map.json (an unknown key is refused, at every level; each section names a
// data file, or a JSON pointer into one), the field lists the reader checks, and the files a kit brain derived (KIT_OUTPUTS,
// which the reader skips as derived). The product registries are IMPORTED (lanes.js LANES/LANE_KEYS, decisions.js QID_RE).
import { LANES, LANE_KEYS } from "../../src/lanes.js";
import { QID_RE } from "../../src/decisions.js";

export { LANES, LANE_KEYS, QID_RE };

// ---- the field lists ---------------------------------------------------------------------------------------------
// the six fields of an aim's measure
export const MEASURE_FIELDS = ["name", "value", "period", "prior", "priorPeriod", "source"];
export const DECISION_STATUSES = ["open", "provisional", "decided", "superseded", "moot"];
export const GTM_FIELDS = ["identity", "activityKinds", "fields", "activityTemplate", "proofRule", "outcomeModel"];
export const FLOW_STATUSES = ["live", "planned", "retired"];

// ---- the files a kit brain derived (never a source) -------------------------------------------------------------
export const KIT_OUTPUTS = ["serve/goal.json", "serve/lib/canvas/canvas.json", "serve/lib/agentic.json", "serve/lib/canon/screens.json",
  "serve/state.json", "dist/pack/**"];

// ---- the INPUT schema (D2): the closed `kit` section --------------------------------------------------------------
// A tiny declarative checker. A spec is one of: "string" · "string?" (absent or a string) · "bool?" · "strings" (an array
// of strings) · ["oneOf", spec, spec…] · { key: spec, … } (closed: an unknown key is refused; a key ending in "?" may be
// absent) · ["list", spec] · ["map", spec] (an object whose values match) · "null" · "any".
const MD_CARD = { kind: "string", label: "string", "idPattern?": "string", "roleVisibility?": "strings" };
export const KIT_SCHEMA = {
  aim: ["oneOf", { file: "string" }, { from: "string", pointer: "string", "measurePointer?": "string" }],
  "goals?": "string",
  "flows?": ["oneOf", { file: "string" }, { from: "string", pointer: "string" }],
  "decisions?": ["list", ["oneOf",
    { rows: "string", "pointer?": "string" },
    { mdSplit: "string", heading: "string", supersededIf: "string", "stripLead?": "string", card: MD_CARD }]],
  "gaps?": "string",
  "gtm?": ["oneOf", "null", { template: "string" }, { file: "string" }],
  "cards?": ["list", ["oneOf",
    { kind: "string", label: "string", dir: "string", "idPattern?": "string", "roleVisibility?": "strings", "skip?": "strings", "exclude?": "string" },
    { kind: "string", label: "string", files: ["map", { path: "string", name: "string" }], "idPattern?": "string", "roleVisibility?": "strings" },
    { kindFile: "string", index: "string", dir: "string" },
    { kind: "string" }]],
  "files?": ["list", { id: "string", label: "string", from: "string", to: "string", "product?": "bool?" }],
  "roles?": ["list", { key: "string", mapsTo: "string" }],
  "volatile?": "strings",
  "copies?": ["list", { from: "string", to: "string" }],
  "canvas?": ["oneOf", "derive", { from: "string" }],
  "screens?": { from: "string", "screens?": "string", "lanes?": "string" },
  "agentic?": { from: "string", pointer: "string" },
  "state?": { "engineSignals?": { suites: "strings" } },
  "citations?": { file: "string", sourceKey: "string" },
  "changes?": { file: "string" },
};

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
// shapeErrors(value, spec, at) -> [error strings]
export function shapeErrors(v, spec, at) {
  if (spec === "any") return [];
  if (spec === "string") return typeof v === "string" && v.trim() ? [] : [`${at}: must be a non-empty string`];
  if (spec === "derive") return v === "derive" ? [] : [`${at}: must be "derive"`];
  if (spec === "null") return v === null ? [] : [`${at}: must be null`];
  if (spec === "bool?") return v === undefined || typeof v === "boolean" ? [] : [`${at}: must be a boolean`];
  if (spec === "strings") return Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim()) ? [] : [`${at}: must be a list of non-empty strings`];
  if (Array.isArray(spec) && spec[0] === "oneOf") {
    const tries = spec.slice(1).map((s) => shapeErrors(v, s, at));
    if (tries.some((e) => !e.length)) return [];
    // the closest alternative's errors: the object whose keys overlap the value's most
    const keysOf = (s) => (s && typeof s === "object" && !Array.isArray(s) ? Object.keys(s).map((k) => k.replace(/\?$/, "")) : []);
    const vk = typeOf(v) === "object" ? Object.keys(v) : [];
    let best = 0, score = -1;
    spec.slice(1).forEach((s, i) => { const n = keysOf(s).filter((k) => vk.includes(k)).length; if (n > score) { score = n; best = i; } });
    return score > 0 ? tries[best] : [`${at}: matches none of the accepted shapes (${spec.slice(1).map((s) => (typeof s === "string" ? JSON.stringify(s) : "{" + keysOf(s).join(",") + "}")).join(" | ")})`];
  }
  if (Array.isArray(spec) && spec[0] === "list") {
    if (!Array.isArray(v)) return [`${at}: must be a list`];
    return v.flatMap((x, i) => shapeErrors(x, spec[1], `${at}[${i}]`));
  }
  if (Array.isArray(spec) && spec[0] === "map") {
    if (typeOf(v) !== "object") return [`${at}: must be an object`];
    return Object.entries(v).flatMap(([k, x]) => shapeErrors(x, spec[1], `${at}.${k}`));
  }
  if (spec && typeof spec === "object") {
    if (typeOf(v) !== "object") return [`${at}: must be an object`];
    const errs = [];
    const allowed = new Map(Object.keys(spec).map((k) => [k.replace(/\?$/, ""), k]));
    for (const k of Object.keys(v)) if (!allowed.has(k)) errs.push(`${at}.${k}: unknown key (the kit schema is closed; accepted: ${[...allowed.keys()].join(", ")})`);
    for (const [k, sk] of allowed) {
      const optional = sk.endsWith("?");
      if (!(k in v)) { if (!optional) errs.push(`${at}.${k}: required`); continue; }
      errs.push(...shapeErrors(v[k], spec[sk], `${at}.${k}`));
    }
    return errs;
  }
  return [`${at}: unknown spec`];
}
export const kitShapeErrors = (kit) => shapeErrors(kit, KIT_SCHEMA, "kit");
