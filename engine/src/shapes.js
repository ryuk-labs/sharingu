// src/shapes.js — THE contribution shapes (sprint 3, B1; docs/plan/MCP.md §9 demand 2): ONE declaration of what a
// contribution carries, the second registry beside the kinds (src/knowledge/schema.js). The lanes (src/lanes.js) are the
// shapes: every shape carries the common accountability fields (its goal, where it came from, why, what it relies on, what
// is still open, the next action), and each lane adds its own (the code lane its components, screens and proof; the GTM
// lane its expected and actual outcome, proof, audience, claim, channel and experiment).
// Read by: the filing doors (src/core.js fileTransmission and fileTransmissionsBatch call checkShape, then store
// shapeColumns), read and the contribution's page (decodeShape), src/formats.js (the `formats` read) and the
// contract (tools/make-door-contract.py). Pure, no I/O.
// The fields new in B1 (source, depends, open, next and the GTM four) are CHECKED at the door (`checked: true`), each
// optional: a missing one is never a refusal and src/transmission.js gateGrade never reads them. The older fields keep the
// door's older, lenient rules, so every existing call files exactly as before.
import { LANES, LANE_KEYS } from "./lanes.js";
import { place, resolvePlaces, isRealDay, SOURCE_KINDS, SOURCE_MAX, lineJoins } from "./knowledge/schema.js";
import { PROOF_FORMS, GTM_PROOF_FORMS, PROOF_RULE } from "./transmission.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// the source shape is ONE declaration (src/knowledge/schema.js): a contribution's and a knowledge item's are the same
export { SOURCE_KINDS, SOURCE_MAX };
export const DEPENDS_MAX = 30;
export const OPEN_MAX = 20;
const REF_MAX = 400, LABEL_MAX = 200, LINE_MAX = 400, NEXT_WHAT_MAX = 400, WHO_MAX = 120;
const isDay = isRealDay;
// happenedAt (owner MCQ 2026-10-01: "keep the filing time true, add the real date beside it"): WHEN the work really happened,
// a date YYYY-MM-DD or a UTC date-time (ISO 8601, Z). The contribution is filed NOW (created_at, never backdated); this rides
// beside it. Never in the future (so it is never later than created_at: the timelines' COALESCE(happened_at, created_at)
// always sits inside the created_at range they already walk), never before HAPPENED_MIN. A date-time is stored as
// toISOString() (the same form as created_at, so the two compare as text); a date is stored as given (it sorts as the start
// of its day)
export const HAPPENED_MIN = "2000-01-01";
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(\.\d{1,3})?)?Z$/;
// happenedAtOf(v, nowMs) -> { value } (normalized) | { bad: "form" | "future" | "old" }
export function happenedAtOf(v, nowMs = Date.now()) {
  if (typeof v !== "string") return { bad: "form" };
  const s = v.trim();
  let value;
  if (isRealDay(s)) value = s;
  else { const m = DATE_TIME.exec(s); if (!m || !isRealDay(m[1])) return { bad: "form" }; value = new Date(s).toISOString(); }
  const today = new Date(nowMs).toISOString();
  if (value.length === 10 ? value > today.slice(0, 10) : value > today) return { bad: "future" };
  if (value < HAPPENED_MIN) return { bad: "old" };
  return { value };
}
// what depends may name: a node of the model (its id, e.g. screen:pricing), goal/<id>, q/<qid>, check/<id>, or a
// contribution (T-YYYYMMDD-NNN). The grammar only: the door reads nothing to check it (a ref that names nothing filed
// stays a plain word on the page)
const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+#@{}-]{0,119}$/;
export const DEPEND_FORMS = [
  { form: "contribution", re: /^T-\d{8}-\d{1,6}$/, href: (r) => orgPath(`/contribution/${encodeURIComponent(r)}?page=1`) },
  { form: "goal", re: /^goal\/[a-z][a-z0-9-]{0,79}$/, href: (r) => orgPath(`/goals/${encodeURIComponent(r.slice(5))}`) },
  { form: "question", re: /^q\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, href: (r) => orgPath(`/question/${encodeURIComponent(r.slice(2))}`) },
  { form: "check", re: /^check\/[A-Za-z0-9][A-Za-z0-9._:/+#@{}-]{0,119}$/, href: null },
  { form: "node", re: NODE_ID, href: (r) => orgPath(`/map?node=${encodeURIComponent(r)}`) },
];
export const dependForm = (ref) => DEPEND_FORMS.find((f) => f.re.test(String(ref ?? ""))) || null;
// who takes the next action: a person of the org, by their id or their email. Only the form is checked: the door never
// says whether such a person exists (nothing is read for it), so the answer can never tell a caller who is in the org
const WHO = /^(?:[^\s@<>"]{1,80}@[^\s@<>"]{1,80}\.[^\s@<>"]{1,40}|[A-Za-z0-9][A-Za-z0-9._-]{0,79})$/;

const f = (name, type, o = {}) => ({ name, type, required: false, ...o });
const str = (v) => typeof v === "string" && v.trim() !== "";

// ---- the fields ----
const COMMON = [
  f("lane", "text", { required: true, values: LANE_KEYS, hint: "the shape it is filed in: one of the lanes" }),
  f("kind", "text", { hint: "what sort of contribution: note (a plain note, lane leader: the default there, so a leader filing with no kind is a note), counter (disputes a contribution, a question or a goal), pr, screen, doc, social, outreach, update, content, campaign" }),
  f("what", "text", { required: true, hint: "what changed, in one line" }),
  f("why", "text", { required: true, hint: "why it matters" }),
  f("touches", "list", { hint: "the ids or areas it touches (leave it out for a plain note)" }),
  f("goalRef", "text", { hint: "the goal it moves: a goal id of the project's tree (`goals` lists them)" }),
  f("parent", "text", { hint: "the contribution it updates or counters (T-YYYYMMDD-NNN), in your project" }),
  f("gapRefs", "list", { hint: 'the refs it addresses, e.g. "q/<qid>" for the question it answers' }),
  f("source", "list", { checked: true, limits: `at most ${SOURCE_MAX}; ref at most ${REF_MAX} characters, label ${LABEL_MAX}`,
    hint: `where it came from: [{kind, ref, label?}], kind one of ${SOURCE_KINDS.join(", ")}; a url is an http(s) link, an artifact the id of one you banked` }),
  f("depends", "list", { checked: true, limits: `at most ${DEPENDS_MAX}`,
    hint: "what it relies on: node ids of the project's Map (screen:pricing), goal/<id>, q/<qid>, check/<id> or a contribution's id (T-YYYYMMDD-NNN); each but a contribution's id is checked against this project" }),
  f("open", "list", { checked: true, limits: `at most ${OPEN_MAX}, each at most ${LINE_MAX} characters`, hint: "what is still unresolved, one short line each" }),
  f("next", "object", { checked: true, limits: `what at most ${NEXT_WHAT_MAX} characters`,
    hint: "the next action: {what, who?, by?}: who is a person of the org (their id or email), by a date YYYY-MM-DD" }),
  f("happenedAt", "text", { checked: true, limits: `a date or a UTC date-time, from ${HAPPENED_MIN} to now`,
    hint: "when the work really happened: a date YYYY-MM-DD or a UTC date-time (2026-09-30T14:05:00Z), never in the future; it is still filed now, and the record keeps both" }),
  f("clientRef", "text", { hint: "your idempotency key: the same clientRef again answers the first filing, never a second" }),
  f("project", "text", { hint: "the project it belongs to (leave it out with one project, or an active one)" }),
];
// copy: off-screen (formats' field hints, an agent's answer)
const SCREENS = f("screens", "text", { hint: "only when it changes a screen: the screens it changes by their id in the project's Map (screen:pricing, or pricing, or the screen's exact name), comma-separated; each is checked against the Map" });
// copy: off-screen (formats' field hints, an agent's answer)
const COMPONENTS = f("components", "list", { hint: "the node ids of the project's Map it touches: a service, a door, a table, the architecture or one of its parts; each is checked against the Map (touches may say it instead)" });
const GTM_FIELDS = [
  f("expected", "text", { limits: "at most 500 characters", hint: "the outcome declared when filed (reach, replies, sign-ups), never graded" }),
  f("actual", "text", { limits: "at most 500 characters", hint: "the real outcome, reported later, never graded" }),
  f("proof", "text", { hint: `the shipped thing: ${GTM_PROOF_FORMS}` }),
  f("audience", "text", { checked: true, limits: "at most 400 characters", hint: "who it is for" }),
  f("claim", "text", { checked: true, limits: "at most 1000 characters", hint: "what it says to them: the claim it makes" }),
  f("channel", "text", { checked: true, limits: "at most 200 characters", hint: "where it goes out: the channel" }),
  f("experiment", "text", { checked: true, limits: "at most 1000 characters", hint: "what it tests, and what would count as it working" }),
];
const LANE_FIELDS = {
  code: [COMPONENTS, SCREENS, f("proof", "text", { hint: `proof it works: ${PROOF_FORMS}` })],
  design: [SCREENS, f("proof", "text", { hint: "a link to the design, or an artifact you banked (/artifact/<id>)" })],
  leader: [],
  vendor: [COMPONENTS],
  ba: [],
  gtm: GTM_FIELDS,
};
const GTM_ONLY = new Set(["audience", "claim", "channel", "experiment"]);
const TEXT_MAX = { audience: 400, claim: 1000, channel: 200, experiment: 1000 };

// ---- where a contribution shows (the places, as data; schema.js resolvePlaces resolves them) ----
const SHOWS = [
  place("build", "/build", "filings", "in Build's list, with where it stands"),
  place("build", "/contribution/{id}?page=1", "envelope", "its own page: what was filed, its source, what it depends on, what is open and the next action"),   // vocab:allow: the page's data-region id, never copy
  place("goals", "/goals/{goalRef}", "filings", "on the goal it moves", { when: { field: "goalRef", present: true } }),
];
const GTM_SHOWS = [place("gtm", "/gtm", "lanes", "in the GTM lane of its kind")];

// ---- the examples (each passes checkShape; tools/knowledge-selftest.mjs proves it) ----
const COMMON_EXAMPLE = {
  goalRef: "grow-revenue",
  source: [{ kind: "commit", ref: "4f2a9c1", label: "the change" }, { kind: "url", ref: "https://example.com/notes/pricing", label: "the call notes" }],
  depends: ["screen:pricing", "q/Q-pricing-1"],
  open: ["the monthly toggle copy is not final"],
  next: { what: "review the annual copy", who: "ada@example.com", by: "2026-10-15" },
};
const EXAMPLES = {
  code: { lane: "code", kind: "pr", what: "The pricing page shows the annual plan", why: "Annual buyers asked for it on every call.", touches: ["screen:pricing"], screens: "screen:pricing",
    components: ["service:payments"], proof: "npm test -> exit 0, 12 passing", ...COMMON_EXAMPLE, happenedAt: "2026-09-30" },
  design: { lane: "design", kind: "screen", what: "The annual plan card", why: "The pricing page needs the annual plan.", touches: ["screen:pricing"], screens: "screen:pricing",
    proof: "/artifact/<id>", ...COMMON_EXAMPLE },
  leader: { lane: "leader", kind: "note", what: "We price per project, not per seat", why: "Teams share seats; a project is what they buy.", ...COMMON_EXAMPLE },
  vendor: { lane: "vendor", kind: "update", what: "The payments provider moved the payout day", why: "Payouts land two days later from November.", touches: ["service:payments"],
    components: ["service:payments"], ...COMMON_EXAMPLE },
  ba: { lane: "ba", kind: "requirement", what: "An invoice names the project, not the seat", why: "Finance reconciles by project.", touches: ["table:invoices"], ...COMMON_EXAMPLE },
  gtm: { lane: "gtm", kind: "outreach", what: "Annual plan email to the waitlist", why: "The waitlist asked about yearly billing.", touches: ["campaign:annual"],
    expected: "40 replies, 10 annual sign-ups", proof: "https://example.com/campaigns/annual", audience: "the waitlist's founders", claim: "two months free on the annual plan",
    channel: "email", experiment: "does a yearly price lift sign-ups? it works at 10 annual sign-ups in a week", ...COMMON_EXAMPLE },
};

// THE RULE of the shapes that touch the product (the one-pass fix 1 and 2, owner ruling 2026-10-01), said once, with an example
// of each case: formats {shape} answers it beside the fields
// copy: off-screen (formats' rule, an agent's answer)
const TOUCH_RULE = "A contribution names a screen only when it changes one: then `screens` (or a screen: ref in touches) names it by its id in the project's Map; work that changes no screen (a migration, an importer, a gate script) leaves screens out and says what it touches in `touches` and/or `components`. Every id it names (screens, components, depends) is checked against the project's own Map: one that is not there needs a fix, and the preview lists its near matches.";
const CASES = {
  code: {
    "changes a screen": { lane: "code", kind: "pr", what: "The pricing page shows the annual plan", why: "Annual buyers asked for it on every call.", touches: ["screen:pricing"], screens: "screen:pricing", proof: "npm test -> exit 0, 12 passing" },
    "changes no screen": { lane: "code", kind: "pr", what: "migrate-055: questions and goals carry their source", why: "A filed ruling says where it was recorded.", touches: ["migrate-055", "table:k_questions"], proof: "sh tools/migrate-dryrun.sh --selftest -> exit 0, 8/8" },
  },
  design: {
    "changes a screen": { lane: "design", kind: "screen", what: "The annual plan card", why: "The pricing page needs the annual plan.", touches: ["screen:pricing"], screens: "screen:pricing", proof: "/artifact/<id>" },
    "changes no screen": { lane: "design", kind: "brand", what: "The logo's dark variant", why: "The dark theme needs it.", touches: ["brand/logo"], proof: "/artifact/<id>" },
  },
};

const clipW = (v, n = 80) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// ", happened 2026-09-30" when the body names a valid happenedAt (the day only), else ""
const happenedLine = (v) => { const h = v == null ? null : happenedAtOf(v); return h && h.value ? `, happened ${h.value.slice(0, 10)}` : ""; };
const nameOf = (ctx, ref) => clipW((ctx && ctx.names && ctx.names[ref]) || ref, 60);

export const SHAPES = Object.fromEntries(LANES.map((l) => [l.key, {
  shape: l.key, label: l.label,
  line: { code: "a change to the product's code: what it touches, its components, the screens and the proof it works",
    design: "a design: the screens it covers and a link to it", leader: "a note, an answer, a ruling or a plan: what and why (a plain note needs nothing more)",
    vendor: "a change from a vendor or a service the project depends on", ba: "a requirement or a business rule", gtm: "go-to-market work: who it is for, what it claims, where it goes, what it tests, and the shipped link" }[l.key] || l.label,
  fields: [...COMMON, ...(LANE_FIELDS[l.key] || [])],
  example: EXAMPLES[l.key],
  ...(CASES[l.key] ? { rule: TOUCH_RULE, cases: CASES[l.key] } : {}),
  ...(l.key === "code" ? { proofRule: `${PROOF_RULE[0].toUpperCase()}${PROOF_RULE.slice(1)}.`, proofForms: PROOF_FORMS } : l.key === "gtm" ? { proofRule: `Proof is ${GTM_PROOF_FORMS}.` } : {}),
  shows: l.key === "gtm" ? [...SHOWS, ...GTM_SHOWS] : SHOWS,
  preview: (b, ctx) => `Contribution (${l.label}): ${clipW(b.what, 60)}${b.goalRef ? `, moves ${nameOf(ctx, b.goalRef)}` : ""}${b.next && b.next.what ? `, next: ${clipW(b.next.what, 40)}${b.next.by ? ` by ${b.next.by}` : ""}` : ""}${happenedLine(b.happenedAt)}`,
}]));
export const SHAPE_KEYS = Object.keys(SHAPES);

// shapePreviewLine(body, ctx) -> one short human line for a filing preview (B2). Pure.
export function shapePreviewLine(body, ctx = {}) {
  const s = SHAPES[String((body && body.lane) || "").toLowerCase()];
  return s ? lineJoins(s.preview(body || {}, ctx || {})) : "";
}
// shapeShowsOf(body) -> [{ tab, path, region, what }]: where ONE contribution shows (body.id: its id, once filed)
export function shapeShowsOf(body) {
  const s = SHAPES[String((body && body.lane) || "").toLowerCase()];
  return s ? resolvePlaces(s.shows, body || {}) : [];
}

// ---- the door ----
const given = (v) => v !== undefined && v !== null;
// checkShape(body) -> null (fine) | the refusal { error: "bad_field", field, hint, example, note }: the new fields of the
// body's shape, each checked when sent (an unknown lane is left to the door's bad_lane)
export function checkShape(body, nowMs = Date.now()) {
  const b = body && typeof body === "object" ? body : {};
  const lane = String(b.lane || "").toLowerCase();
  const shape = SHAPES[lane];
  if (!shape) return null;
  const no = (field, hint, example, note = null) => ({ error: "bad_field", field, hint, example,
    note: `Nothing was filed: ${note || `send ${field} as ${hint}`}. formats {shape: "${note ? "gtm" : lane}"} has every field, an example and where it shows.` });
  const ex = shape.example;
  if (given(b.source)) {
    const h = shape.fields.find((x) => x.name === "source").hint;
    if (!Array.isArray(b.source)) return no("source", h, { source: ex.source });
    if (b.source.length > SOURCE_MAX) return no("source", `at most ${SOURCE_MAX} sources (this call sends ${b.source.length}): ${h}`, { source: ex.source });
    for (let i = 0; i < b.source.length; i++) {
      const s = b.source[i];
      const fld = `source[${i}]`;
      if (!s || typeof s !== "object" || Array.isArray(s) || Object.keys(s).some((k) => !["kind", "ref", "label"].includes(k))) return no(fld, `{kind, ref, label?}: ${h}`, { source: ex.source });
      if (!SOURCE_KINDS.includes(s.kind)) return no(`${fld}.kind`, `one of ${SOURCE_KINDS.join(", ")}`, { source: ex.source });
      if (!str(s.ref) || s.ref.length > REF_MAX) return no(`${fld}.ref`, `a string of 1 to ${REF_MAX} characters`, { source: ex.source });
      if (s.kind === "url" && !/^https?:\/\/\S+$/i.test(s.ref)) return no(`${fld}.ref`, "an http(s) link (a url source)", { source: ex.source });
      if (s.kind === "artifact" && !/^(?:\/artifact\/)?[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(s.ref)) return no(`${fld}.ref`, "the id of an artifact you banked (or /artifact/<id>)", { source: ex.source });
      if (given(s.label) && (typeof s.label !== "string" || s.label.length > LABEL_MAX)) return no(`${fld}.label`, `a string of at most ${LABEL_MAX} characters`, { source: ex.source });
    }
  }
  if (given(b.depends)) {
    const h = shape.fields.find((x) => x.name === "depends").hint;
    if (!Array.isArray(b.depends) || b.depends.length > DEPENDS_MAX) return no("depends", `a list of at most ${DEPENDS_MAX} refs: ${h}`, { depends: ex.depends });
    const bad = b.depends.findIndex((r) => typeof r !== "string" || !dependForm(r));
    if (bad >= 0) return no(`depends[${bad}]`, h, { depends: ex.depends });
  }
  if (given(b.open)) {
    if (!Array.isArray(b.open) || b.open.length > OPEN_MAX) return no("open", `a list of at most ${OPEN_MAX} short lines`, { open: ex.open });
    const bad = b.open.findIndex((x) => !str(x) || x.length > LINE_MAX);
    if (bad >= 0) return no(`open[${bad}]`, `a line of 1 to ${LINE_MAX} characters`, { open: ex.open });
  }
  if (given(b.next)) {
    const n = b.next;
    if (!n || typeof n !== "object" || Array.isArray(n) || Object.keys(n).some((k) => !["what", "who", "by"].includes(k))) return no("next", "{what, who?, by?}", { next: ex.next });
    if (!str(n.what) || n.what.length > NEXT_WHAT_MAX) return no("next.what", `the next action in a line of 1 to ${NEXT_WHAT_MAX} characters`, { next: ex.next });
    if (given(n.who) && !(typeof n.who === "string" && n.who.length <= WHO_MAX && WHO.test(n.who))) return no("next.who", "a person of the org: their id or their email", { next: ex.next });
    if (given(n.by) && !isDay(n.by)) return no("next.by", "a date, YYYY-MM-DD", { next: ex.next });
  }
  if (given(b.happenedAt)) {
    const h = happenedAtOf(b.happenedAt, nowMs), hint = shape.fields.find((x) => x.name === "happenedAt").hint;
    if (h.bad === "future") return no("happenedAt", `today or earlier (this one is in the future): ${hint}`, { happenedAt: SHAPES.code.example.happenedAt });
    if (h.bad === "old") return no("happenedAt", `a date from ${HAPPENED_MIN} on: ${hint}`, { happenedAt: SHAPES.code.example.happenedAt });
    if (h.bad) return no("happenedAt", hint, { happenedAt: SHAPES.code.example.happenedAt });
  }
  for (const k of GTM_ONLY) {
    if (!given(b[k])) continue;
    if (lane !== "gtm") return no(k, `left out in lane ${lane}: ${k} belongs to the gtm shape`, { lane: "gtm", [k]: SHAPES.gtm.example[k] }, `${k} belongs to the gtm shape: file it in lane "gtm", or leave it out`);
    if (typeof b[k] !== "string" || b[k].length > TEXT_MAX[k]) return no(k, `a string of at most ${TEXT_MAX[k]} characters: ${SHAPES.gtm.fields.find((x) => x.name === k).hint}`, { [k]: SHAPES.gtm.example[k] });
  }
  return null;
}

// shapeColumns(body) -> { shape, nextBy, nextWho, happenedAt }: what the door stores for a CHECKED body (checkShape returned null).
// shape: the JSON of the new fields sent (source, depends, open, next, and the GTM four), null when none is; nextBy and
// nextWho: next.by and next.who, the real columns later slices query (follow-ups due, pick-up); happenedAt: the normalized
// happenedAt (migrate-051's column, never inside shape), null when not sent
export function shapeColumns(body) {
  const b = body && typeof body === "object" ? body : {};
  const out = {};
  if (Array.isArray(b.source) && b.source.length) out.source = b.source.map((s) => ({ kind: s.kind, ref: s.ref.trim(), ...(str(s.label) ? { label: s.label.trim() } : {}) }));
  if (Array.isArray(b.depends) && b.depends.length) out.depends = [...new Set(b.depends.map((r) => r.trim()))];
  if (Array.isArray(b.open) && b.open.length) out.open = b.open.map((x) => x.trim());
  if (b.next && typeof b.next === "object" && str(b.next.what)) out.next = { what: b.next.what.trim(), ...(str(b.next.who) ? { who: b.next.who.trim() } : {}), ...(str(b.next.by) ? { by: b.next.by } : {}) };
  for (const k of GTM_ONLY) if (str(b[k])) out[k] = b[k].trim();
  const h = given(b.happenedAt) ? happenedAtOf(b.happenedAt) : null;
  return { shape: Object.keys(out).length ? JSON.stringify(out) : null, nextBy: (out.next && out.next.by) || null, nextWho: (out.next && out.next.who) || null,
    happenedAt: (h && h.value) || null };
}
// decodeShape(raw) -> the stored new fields ({} when none): what read and the contribution's page show
export function decodeShape(raw) {
  if (raw == null || raw === "") return {};
  try { const v = typeof raw === "string" ? JSON.parse(raw) : raw; return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

