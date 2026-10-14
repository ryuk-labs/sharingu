// src/orgprofile.js — THE PRODUCT STEP (sprint 21, slice 21.4b; the owner's approved data collection of 2026-10-14, "approve as
// shown"; migrate-081's org_profile): on the org form, after sign-up, "What you'll build with sharingu" — the product's name and one
// line, its stage, what it is, the AI the team will connect, where the work lives today, what it wants first and the people joining
// in its first month. Pure: no statement, no binding. The org form draws it (src/orgpage.js), POST /orgs reads it (src/index.js) and
// writes it in the batch that makes the org (src/orgs.js createOrg), the operator page shows it (src/operatorpage.js).
//
// PRODUCT_CHOICES — each choice field's values (the stored keys) and the words the form shows, in the form's order; `multi` fields
// hold any number (a JSON array of keys, in this order), the others one key. PRODUCT_REQUIRED — the fields a web form must answer.
// readProductStep(input, { required }) -> { profile } | { field } (the first field that is wrong, in the form's order) | { profile:
// null } (nothing answered and the step not required). The web form (src/index.js POST /orgs, a browser's form) requires it; a
// script's JSON POST /orgs and the operator's tools (tools/make-reviewer-org.mjs, tools/new-org.sh) need not answer it: a JSON body
// that names NONE of PRODUCT_FIELDS makes its org with no profile row, and one that names any is read as the form is (the product,
// its line and its stage required). Strict: every text trimmed and its runs of spaces folded, held to its length; a choice outside
// its list, a single field given twice, is the field's error, never dropped quietly.
export const PRODUCT_MAX = { product: 80, line: 160 };
export const PRODUCT_CHOICES = {
  stage: { multi: false, label: "Stage", values: [["idea", "Idea"], ["building", "Building"], ["launched", "Launched"], ["scaling", "Scaling"]] },
  kinds: { multi: true, label: "What it is", values: [["web", "Web app"], ["mobile", "Mobile app"], ["api", "API"], ["agent", "AI agent"], ["internal", "Internal tool"]] },
  ais: { multi: true, label: "The AI you'll connect", values: [["claude-code", "Claude Code"], ["claude", "Claude app"], ["chatgpt", "ChatGPT"], ["codex", "Codex"], ["cursor", "Cursor"]] },
  places: { multi: true, label: "Where the work lives today", values: [["github", "GitHub"], ["linear", "Linear"], ["jira", "Jira"], ["notion", "Notion"], ["slack", "Slack"], ["drive", "Drive"]] },
  first_want: { multi: false, label: "What you want first", values: [["picture", "One picture of the work"], ["decisions", "Decisions tracked"], ["gtm", "GTM in sync"]] },
  people: { multi: false, label: "People joining in the first month", values: [["1", "1"], ["2-5", "2-5"], ["6-20", "6-20"], ["20+", "20+"]] },
};
// the step's fields in the form's order (the two texts first), and the ones a web form must answer
export const PRODUCT_FIELDS = ["product", "line", ...Object.keys(PRODUCT_CHOICES)];
export const PRODUCT_REQUIRED = ["product", "line", "stage"];
// the one line the step says about its data (the owner's words, approved as shown)
export const PRODUCT_NOTE = "Used to set up your org and to improve the beta. Only you and the sharingu operator see it.";
export const PRODUCT_FIELD_WORDS = {
  product: `Name your product (1 to ${PRODUCT_MAX.product} characters).`,
  line: `Say what it is in one line (1 to ${PRODUCT_MAX.line} characters).`,
  stage: "Choose your product's stage.",
  kinds: "Choose what it is from the list, or none.",
  ais: "Choose the AI you'll connect from the list, or none.",
  places: "Choose where the work lives from the list, or none.",
  first_want: "Choose what you want first from the list, or none.",
  people: "Choose how many people join in the first month from the list, or none.",
};

const fold = (v) => String(v == null ? "" : v).replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
// listOf(v) -> the values sent for one field (a form's repeated key, a JSON array, one string), each folded, the empty ones dropped;
// null when one is neither text nor a number (an object, a nested array: the field's error)
function listOf(v) {
  const all = Array.isArray(v) ? v : v == null ? [] : [v];
  if (all.some((x) => typeof x !== "string" && typeof x !== "number")) return null;
  return all.map(fold).filter((x) => x !== "");
}
// answered(input) -> true when the input names any field of the step with a value
export const answered = (input) => !!input && typeof input === "object" && PRODUCT_FIELDS.some((f) => { const vs = listOf(input[f]); return vs === null || vs.length > 0; });

export function readProductStep(input, { required = false } = {}) {
  const i = input && typeof input === "object" ? input : {};
  if (!required && !answered(i)) return { profile: null };
  const p = {};
  for (const f of ["product", "line"]) {
    const vs = listOf(i[f]);
    if (!vs || vs.length !== 1 || vs[0].length > PRODUCT_MAX[f]) return { field: f };
    p[f] = vs[0];
  }
  for (const [f, c] of Object.entries(PRODUCT_CHOICES)) {
    const keys = c.values.map(([k]) => k);
    const vs = listOf(i[f]);
    if (!vs || vs.some((v) => !keys.includes(v))) return { field: f };
    if (c.multi) { p[f] = keys.filter((k) => vs.includes(k)); continue; }
    if (vs.length > 1 || (!vs.length && PRODUCT_REQUIRED.includes(f))) return { field: f };
    p[f] = vs[0] || null;
  }
  return { profile: p };
}
// wordsOf(field, key) -> the words a stored key shows (the operator page), or the key itself when the list no longer holds it
export function wordsOf(field, key) {
  const c = PRODUCT_CHOICES[field];
  const hit = c && c.values.find(([k]) => k === key);
  return hit ? hit[1] : String(key == null ? "" : key);
}
