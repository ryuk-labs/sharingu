// src/preview.js — preview, then file (sprint 3, B2; docs/plan/MCP.md §4 "Two directions", BETA.md Stage B; split in sprint 19
// by the owner's ruling of 2026-10-13, "by what the write does"). The owner's rule: every filing is previewed first. `preview`
// (MCP) and POST /preview (REST) take the items a person's own AI client extracted, run every one through the SAME checks and
// planning the real write runs, and answer per item: its line, where it will show, how it will be graded, why, what the whole
// set reaches, and which write tool files it (filesWith). Nothing is written to the project: the ONE write a preview makes is its
// own row in `previews` (migrate-048), and a read-only key's preview writes not even that. It never files.
// Three write tools file a preview, each ONE operation of it (src/formats.js WRITE_TOOLS): file_contribution (MCP) and POST
// /preview/file-contribution its contributions, save_knowledge and POST /preview/save-knowledge its knowledge upserts, remove_knowledge and POST
// /preview/remove-knowledge its knowledge removes. Each takes the preview's id and that operation's items AGAIN, as previewed and in their
// order (bodies are never stored with a preview: the row keeps each operation's digest), refuses an item of another operation
// (naming the tool that files it), and files what is ready through the EXISTING write doors: the knowledge ops through
// writeKnowledge (ONE call, all or nothing), the contributions through fileTransmissionsBatch (the batch door: one D1 batch). Each
// part files once: the row records each part's receipt, and a repeat of a filed part answers it. The answer is a receipt in the
// preview's own shape.
//
// The three item forms a preview shows, each exactly the body its door takes:
//   { contribution: { lane, kind, what, ... } } a contribution           (file_contribution's; every shape field)
//   { kind, op: "upsert", data }                a knowledge upsert       (save_knowledge's)
//   { kind, op: "remove", data }                a knowledge remove       (remove_knowledge's)
// A grade ({grade}) and an answer ({answer}) are refused per item, pointing at their own doors (submit_grade, respond), which
// file at once.
//
// Verdicts: files (it files at once) · waits_for_owner (it files, and waits in the owner's queue) · needs (one more thing:
// the field, its hint and the formats call) · unchanged (it is stored already, the same) · refused (the door's own refusal).
//
// Authority (no widening; each line is the rule of the write it previews):
//   · the project is resolved ONCE by the door's own stamp (core.js doorProject: a seat; the owner any active project) and
//     then held to the read scope (mcp.js projectCallScope): a caller with no seat on it (the owner excepted) is refused
//     project_forbidden and nothing is read. Every underlying check then names that project explicitly, so a seatless member
//     of a single-project org, whom the old direct write stamped into the one project, is refused here (narrower);
//   · knowledge: writeKnowledge's own project rule (a seat, or the owner), the ruling rule and the role rule (planKnowledge);
//   · a contribution: the batch door's every check (reserved kinds, the lane, the shape, the project stamp, the parent);
//   · a read-only key (or an OAuth grant without mcp:write) previews, writes NOTHING (no preview row), and every item is
//     refused for filing; a write tool refuses it (the REST gate and callTool refuse it before this module, and filePart again);
//   · a previewId is not a capability: a write tool reads the row only for its own author (another person's id is the same
//     preview_not_found as a missing one) and re-checks the author's right to the project now, then every write door checks
//     again as it always does;
//   · a preview reveals nothing the caller could not read: its reads are the write doors' own, on the caller's project; a
//     refused item says so in the door's usual words and no more. The page (src/previewpage.js) hides from anyone but the
//     author an item whose roleVisibility does not admit them.
import { db } from "./data.js";
import { KINDS, MAX_OPS, previewLine, showsOf, encodeValue, withKeyDefaults, ROLE_LIMITED, rolesAdmit } from "./knowledge/schema.js";
import { planKnowledgeCall, replan, writeKnowledge } from "./knowledge/write.js";
import { SHAPES, shapePreviewLine, shapeShowsOf, happenedAtOf } from "./shapes.js";
import { planTransmissionsBatch, fileTransmissionsBatch, seatsOnce, doorProject, evalMarkRefused, refDigestOf, CLIENT_REF_CLASH_NOTE } from "./core.js";
import { WRITE_TOOLS, WRITE_TOOL_NAMES, OP_OF_TOOL, OP_WORDS, OTHER_DOORS, itemForm, opOf } from "./formats.js";   // sprint 19: the split door's one table
import { resolveProject, projectSlug } from "./project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { PROOF_FORMS, GTM_PROOF_FORMS } from "./transmission.js";
import { goalTree } from "./knowledge/goals.js";
import { collectRefs, readReach, reachWords } from "./reach.js";
import { previewText } from "./previewtext.js";
import { removedAny } from "./render.js";
import { projectCallScope, hasWriteScope } from "./mcp.js";
import { now, sha256, isEvalMark, isD1Quota } from "./util.js";
import { getTenantConfig } from "./tenant.js";
import { checklistFor, meterChangeWords } from "./checklist.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { NOT_ASKED } from "./confirm.js";   // sprint 19: a write tool's fileOnConfirm the door could not ask

export const PREVIEW_MAX = MAX_OPS;            // items a preview (and a file) takes
export const PREVIEW_TTL_MS = 60 * 60 * 1000;  // a preview expires an hour after it is made
export const SUMMARY_MAX = 64 * 1024;          // the stored summary's cap: past it, the plain items are stored grouped
export const LEFT_OUT_MAX = 50;
export const PREVIEW_ID_RE = /^P-[0-9a-f]{16}$/;
// a batch clientRef (the one-pass fix 9): the caller's idempotency key for the whole batch, passed to file's parts (each part's
// clientRef is <it>:<part><index>, at most 60 characters, the door's cap), so the same batch previewed again and filed again
// files nothing twice (each door's own clientRef replay)
export const BATCH_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/;
// a contribution's route at the gate (src/transmission.js gateGrade) -> its verdict
export const ROUTE_VERDICT = { auto: "files", owner: "waits_for_owner", incomplete: "needs" };
export const VERDICT_WORDS = { files: "files at once", waits_for_owner: "waits for the owner", needs: "needs one more thing", unchanged: "unchanged", refused: "refused" };
const READ_ONLY_REASON = "This key is read-only: it can preview, never file. Use your full key.";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clip = (v, n) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// formOf(item) -> "knowledge" | "contribution" | "grade" | "answer" | null (none, or more than one form in one item)
export const formOf = itemForm;
// numbers(list) -> "1, 3 and 4": item numbers as the text and the page print them
const numbers = (ns) => (ns.length > 1 ? `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}` : String(ns[0] ?? ""));
// partsOf(summary) -> [{ tool, idx }] in WRITE_TOOLS' order: each write tool and the preview's item indices it files
export const partsOf = (summary) => WRITE_TOOL_NAMES.filter((t) => isObj(summary && summary.parts) && Array.isArray(summary.parts[t]) && summary.parts[t].length).map((t) => ({ tool: t, idx: summary.parts[t] }));
// nextOf(previewId, parts) -> the answer's `next`: each write tool with the items it files
export const nextOf = (parts) => `${parts.map((p) => `${p.tool} {previewId, items} files item${p.idx.length === 1 ? "" : "s"} ${numbers(p.idx.map((i) => i + 1))}`).join("; ")} (send each tool its items as previewed, in their order); only: "ready" files a part's ready items and leaves the rest.`;
// canon(v) -> v as JSON with every object's keys sorted (arrays keep their order): the digest's input
export const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : isObj(v) ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v === undefined ? null : v));
// digestOf(items) -> the sha256 of the items as sent, canonical: a write tool sends its part's items and must match its digest
export const digestOf = (items) => sha256(canon(items));
const newId = () => { const b = new Uint8Array(8); crypto.getRandomValues(b); return "P-" + [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };
// the clientRef a write tool names each part by, so a retry finds what already landed (each door's own idempotency): a
// contribution c<index>; the knowledge upserts k, the removes kr (one writeKnowledge call each)
export const refOf = (previewId, part, i) => `pv:${previewId}:${part}${i == null ? "" : i}`;
const KNOWLEDGE_PART = { upsert: "k", remove: "kr" };

// itemOwnRef(raw) -> the clientRef a contribution carries itself, or null
function itemOwnRef(it) { const c = it && isObj(it.contribution) ? it.contribution.clientRef : null; return c != null && String(c).trim() ? String(c).trim().slice(0, 60) : null; }
// ---- a batch clientRef names CONTENT, not only a slot (D1b item 7) ----
// A batch clientRef used to name each part by its slot alone (<ref>:c0, <ref>:k; the removes' <ref>:kr since sprint 19), so a re-filed batch whose item CHANGED got
// the first filing's receipt ("filed") while nothing was written. Now each part's ref carries the first six hex of its own
// content's digest (<ref>:c0~1a2b3c, <ref>:k~4d5e6f; at most 60 characters with the longest batch ref): the same item filed
// again finds what landed and files nothing twice; a CHANGED knowledge part has a new ref and files as the update it is (an
// upsert merges); a CHANGED contribution in a slot that already filed is refused, saying so, at the preview and again at
// file_contribution. A part filed before this rule (<ref>:c0, no digest) is taken as the same content, as it was.
export const CLASH_NOTE = "This clientRef already filed different content in this place of the batch: use a new clientRef (or leave it out) to file it as new.";
export const slotOf = (ref) => String(ref).replace(/~[0-9a-f]{6}$/, "");
export async function partDigest(v) { return (await digestOf(v)).slice(0, 6); }
// batchLanded(env, personId, batchRef) -> Map(slot "<ref>:c0" -> [{ id, client_ref, route, d }]) — every part of this batch
// the person ever filed, ONE statement on idx_transmission_clientref_once (a range on the ref's prefix: <ref>: to <ref>;)
export async function batchLanded(env, personId, batchRef) {
  const out = new Map();
  if (!batchRef) return out;
  const rows = (await db(env).prepare("SELECT id, client_ref, route FROM transmission WHERE submitter = ?1 AND client_ref >= ?2 AND client_ref < ?3 LIMIT 1000")
    .bind(personId, `${batchRef}:`, `${batchRef};`).all()).results || [];
  for (const r of rows) {
    const ref = String(r.client_ref), m = /~([0-9a-f]{6})$/.exec(ref);
    const k = slotOf(ref);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push({ ...r, d: m ? m[1] : null });
  }
  return out;
}

// ---- the reasons, in plain words: src/transmission.js gateGrade's reason codes translated (never a code alone) ----
const REASON_WORDS = {
  "lane:vendor": "A vendor change always waits for the owner.",
  // two codes the gate no longer raises (the one-pass fix 2: an id not in the Map is a fix the sender makes); kept for the rows
  // filed before
  "join-key-suspect": "A screen it names was not in the org's register, so it waited for the owner (filed before the Map check).",
  "component-key-suspect": "A component it names was not in the ratified architecture, so it waited for the owner (filed before the Map check).",
  "answers-a-question": "It answers a question, and the owner rules questions.",
  "critique-ruling-territory": "A critique is the owner's to rule.",
  "proposal-targets-a-ghost": "A proposal is the owner's to rule.",
  "insight-proposes-understanding": "An insight changes the shared understanding, which the owner rules.",
  "asks-a-grant": "It asks the owner for a one-time grant.",
  "conflict-with-ruled-truth": "It conflicts with something already ruled.",
  "flagged-owner": "It is flagged for the owner.",
  "risk-surface": "It names money, pricing, payments, clinical data, consent or another sensitive area, so the owner checks it.",
  "counters-a-filing": "It disputes a contribution, and the owner rules disputes.",
  "counters-a-question": "It disputes a question, and the owner rules disputes.",
  "counters-a-goal": "It disputes a goal, and the owner rules disputes.",
  "restores-a-version": "Restoring a version is the owner's.",
  "unproven": "It carries no proof.",
  "proof-not-artifact": "Its proof has nothing observed in it (no number, status, answer, link, or named file with what it shows), so it reads as narration.",
  "gtm-proof-not-link": "Its proof is not the shipped thing: send the live link or an artifact you banked.",
  "components-undeclared": "It named no architecture component (filed before touches could say it instead).",
  "no-screen-number": "A screen design names the screen it changes: send screens (its id in the project's Map).",
  "ranks-a-filing": "It orders the shared list.",
  "files-an-item": "It files a draft for Broadcast.",
};
// reasonWords(code) -> the reason as a sentence; a code with a detail ("missing:what+why", "join-key-unverified:301") reads
// its detail too; an unknown code is named inside a sentence, never alone
export function reasonWords(code) {
  const c = String(code || "");
  if (REASON_WORDS[c]) return REASON_WORDS[c];
  const m = /^([a-z-]+):(.*)$/.exec(c);
  if (m && m[1] === "missing") return `It needs ${m[2].split("+").join(" and ")}.`;
  if (m && m[1] === "join-key-unverified") return `Screen ${m[2].split(",").join(", ")} ${m[2].includes(",") ? "are" : "is"} not in the project's Map.`;
  if (m && m[1] === "component-key-unverified") return `Component ${m[2].split(",").join(", ")} ${m[2].includes(",") ? "are" : "is"} not in the project's Map.`;
  if (m && m[1] === "depends-unverified") return `What it depends on (${m[2].split(",").join(", ")}) is not in the project.`;
  return `A rule of the door applies (${c}).`;
}
const fieldHint = (lane, field) => { const s = SHAPES[String(lane || "").toLowerCase()]; const f = s && s.fields.find((x) => x.name === field); return f ? f.hint : null; };

// what the sanitiser takes out of a body (src/render.js sanitizeHtml's tally), in words
const STRIP_WORD = { scripts: ["script", "scripts"], handlers: ["event handler", "event handlers"], frames: ["frame", "frames"], jsUrls: ["script link", "script links"],
  externalUrls: ["outside link", "outside links"], tags: ["other tag", "other tags"], comments: ["comment", "comments"] };
const strippedWords = (k, n) => `${n} ${(STRIP_WORD[k] || [k, k])[n === 1 ? 0 : 1]}`;

// ---- per-item builders ----
const NODE_KIND = { surface: "app", lane: "lane", screen: "screen", door: "door", table: "table", entity: "entity", flow: "flow", gap: "gap", dep: "dependency", evidence: "evidence", service: "service", architecture: "architecture" };
const kindWordOf = (kind, row) => (kind === "node" ? NODE_KIND[row && row.type] || "node" : kind === "card_kind" ? "card kind" : kind === "gtm" ? "GTM template" : kind);
const tabOf = (places) => { const p = places || []; return (p.find((x) => x.tab === "gtm") || p[0] || {}).tab || ""; };
// a knowledge refusal's note without its trailing pointer at formats (the item carries `needs.formats` instead)
const noteBody = (n) => String(n || "").replace(/\s*formats \{[^}]*\} has every field[^.]*\.\s*$/, "").trim();
const fieldOfNote = (n) => { const m = /data\.([A-Za-z][\w.]*)/.exec(String(n || "")); return m ? m[1].replace(/\.$/, "") : null; };
// the field a knowledge refusal is about when its note names no data.<field>: the cross-row rules (src/knowledge/schema.js)
const ERROR_FIELD = { missing_parent: "parent", goal_roots: "parent", goal_cycle: "parent", has_children: "id", too_few_options: "options", open_has_choice: "choice",
  no_choice: "choice", missing_style: "style", too_large: "body", unknown_kind: "kind", bad_op: "op", bad_id: "id" };
function fieldOfError(e, kind, data) {
  const f = fieldOfNote(e.note);
  if (f) return f;
  if (e.error === "missing_node") {
    if (kind === "render") return "screen";
    const m = /names node "([^"]+)"/.exec(String(e.note || ""));
    return m && data && data.to === m[1] ? "to" : "from";
  }
  return ERROR_FIELD[e.error] || null;
}
const REFUSALS = new Set(["partner_refused", "owner_only", "forbidden", "project_forbidden", "project_required", "reserved_kind", "not_open", "read_only_credential"]);

// D2b item 7: n is the item's NUMBER as the text and the page print it (from 1); i stays the index into the items sent
function item(base, verdict, extra = {}) {
  return { ...base, n: base.i + 1, verdict, effect: extra.effect || VERDICT_WORDS[verdict], reasons: extra.reasons || [], ...(extra.needs ? { needs: extra.needs } : {}),
    ...(extra.refusal ? { refusal: extra.refusal } : {}), ...(extra.body ? { body: extra.body } : {}), ...(extra.roles && extra.roles.length ? { roles: extra.roles } : {}),
    ...(extra.changes && extra.changes.length ? { changes: extra.changes } : {}) };
}

// sameRow(kind, step, prev) -> every column the op sends already holds that value (and a question's options are the same)
// changedFields(kind, s, prev) -> the fields an update changes (D1b item 14: the preview said only "updates 1"): every field
// sent whose stored value differs, key fields aside, and "options" for a question whose options move
function changedFields(kind, s, prev) {
  if (!prev) return [];
  const out = KINDS[kind].cols.filter((c) => s.present.includes(c.f) && !c.derived && !c.key && encodeValue(c, s.row[c.f]) !== encodeValue(c, prev[c.f])).map((c) => c.f);
  if (s.options && JSON.stringify(prev.options || []) !== JSON.stringify(s.row.options || [])) out.push("options");
  return out;
}
function sameRow(kind, s, prev) {
  if (!prev) return false;
  const cols = KINDS[kind].cols.filter((c) => s.present.includes(c.f) && !c.derived);
  if (!cols.every((c) => encodeValue(c, s.row[c.f]) === encodeValue(c, prev[c.f]))) return false;
  return !s.options || JSON.stringify(prev.options || []) === JSON.stringify(s.row.options || []);
}

async function knowledgePart(who, env, project, list, out, ctx) {
  const ops = list.map((p) => p.raw);
  const r = await planKnowledgeCall(who, { project, ops }, env);
  if (r.error) {
    for (const p of list) {
      const kind = String(p.raw.kind || "");
      out[p.i] = item({ i: p.i, type: "knowledge", kind, kindWord: KINDS[kind] ? kindWordOf(kind, p.raw.data) : kind || "item", line: KINDS[kind] ? previewLine(kind, p.raw.data, {}) : "A knowledge item", places: [], tab: "" },
        "refused", { reasons: [r.note || "The door refused it."], refusal: { error: r.error, note: r.note } });
    }
    return;
  }
  // the ops that fail, round by round: the cross-row rules run only once every op passes its own (src/knowledge/schema.js
  // planKnowledge), so each round leaves the failed ops out and plans the rest again, until what is left is ready
  let live = ops.map((_, j) => j), plan = r.plan;
  const failed = new Map();
  for (let round = 0; plan && plan.errors.length && round < 6; round++) {
    for (const e of plan.errors) { const j = live[e.index]; if (j !== undefined && !failed.has(j)) failed.set(j, { ...e, round }); }
    live = live.filter((j) => !failed.has(j));
    plan = live.length ? replan(who, live.map((j) => ops[j]), r.stored) : null;
  }
  if (plan && plan.errors.length) { for (const j of live) failed.set(j, { error: "bad_op", note: "It could not be checked on its own: preview it with fewer items.", round: 6 }); live = []; plan = null; }
  const state = plan ? plan.state : Object.fromEntries(Object.entries(r.stored).map(([k, m]) => [k, new Map(m)]));
  // a check's refs by name (loadStored reads them): a node by its id, a goal by its id or goal/id, a question by q/qid
  const nameOf = (ref) => {
    const n = state.node.get(ref) || r.stored.node.get(ref); if (n && n.name) return n.name;
    for (const k of [ref, ref.replace(/^goal\//, "")]) { const g = state.goal.get(k) || r.stored.goal.get(k); if (g && g.title) return g.title; }
    if (ref.startsWith("q/")) { const q = state.question.get(ref.slice(2)) || r.stored.question.get(ref.slice(2)); if (q && q.question) return q.question; }
    return null;
  };
  const ctxFor = (kind, d) => {
    const names = {};
    for (const ref of [d.parent, d.screen, d.from, d.to, ...(Array.isArray(d.refs) ? d.refs : [])]) if (typeof ref === "string") { const n = nameOf(ref); if (n) names[ref] = n; }
    const ck = kind === "card" ? (state.card_kind.get(String(d.kind)) || r.stored.card_kind.get(String(d.kind))) : null;
    return { names, kindLabel: ck && ck.label, cardKindTab: ck && ck.tab };
  };
  for (const [j, e] of failed) {
    const p = list[j], kind = KINDS[p.raw.kind] ? p.raw.kind : null;
    const d = kind && isObj(p.raw.data) ? withKeyDefaults(kind, p.raw.data) : {};
    const c = kind ? ctxFor(kind, d) : {};
    const places = kind ? showsOf(kind, d, c) : [];
    const base = { i: p.i, type: "knowledge", kind: kind || String(p.raw.kind || ""), kindWord: kind ? kindWordOf(kind, d) : "item", line: kind ? previewLine(kind, d, c) : "A knowledge item", places, tab: tabOf(places), ...(kind && e.id ? { key: e.id } : {}) };
    if (REFUSALS.has(e.error)) { out[p.i] = item(base, "refused", { reasons: [noteBody(e.note)], refusal: { error: e.error, note: e.note } }); continue; }
    // the note says what to send (and, for a cross-row rule, what to file first); the needs block carries it with its field
    const reasons = [noteBody(e.note)];
    const field = fieldOfError(e, kind, d);
    out[p.i] = item(base, "needs", { reasons, needs: { field: field || e.error, error: e.error, hint: noteBody(e.note), formats: kind ? { kind } : {} },
      effect: field === "to" || field === "from" ? `needs the ${field} node` : `needs ${field || "a fix"}` });
  }
  for (const s of plan ? plan.steps : []) {
    const j = live[s.i], p = list[j], kind = s.kind;
    const d = s.op === "upsert" ? { ...s.row, ...(kind === "question" ? { options: s.row.options } : {}) } : withKeyDefaults(kind, p.raw.data);
    const c = ctxFor(kind, d);
    if (s.prepared && s.prepared.bytes != null) c.bytes = s.prepared.bytes;
    const places = showsOf(kind, d, c);
    const prev = s.existed ? r.stored[kind].get(s.id ?? "") : null;
    // a render's or a style's body is no column: the plan's own hash comparison (s.unchanged) decides for those kinds
    const unchanged = s.op === "remove" ? !s.existed : KINDS[kind].body ? !!s.unchanged : !!(prev && sameRow(kind, s, prev));
    const roles = ROLE_LIMITED.has(kind) ? [...new Set([...(Array.isArray(d.roleVisibility) ? d.roleVisibility : []),
      ...(kind === "card" ? (((state.card_kind.get(String(d.kind)) || {}).roleVisibility) || []) : [])])] : [];
    const body = s.prepared ? { bytes: s.prepared.bytes ?? null, ...(removedAny(s.prepared.removed) ? { stripped: Object.fromEntries(Object.entries(s.prepared.removed).filter(([, n]) => n > 0)) } : {}) } : null;
    // a decided question carries its ruling's reason (sprint 12, 12.6): the card and the page show it under its line
    const rationale = kind === "question" && s.op === "upsert" && d.status && d.status !== "open" && typeof d.rationale === "string" && d.rationale.trim() ? clip(d.rationale, 300) : "";
    const base = { i: p.i, type: "knowledge", kind, kindWord: kindWordOf(kind, d), line: previewLine(kind, d, c), places, tab: tabOf(places), ...(s.id != null ? { key: s.id } : {}), ...(rationale ? { rationale } : {}) };
    if (unchanged) { out[p.i] = item(base, "unchanged", { reasons: [s.op === "remove" ? "It is not there: nothing to remove." : "It is stored already, the same: nothing changes."], body, roles }); continue; }
    const effect = s.op === "remove" ? "removes 1" : s.existed ? (KINDS[kind].body ? "replaces 1" : "updates 1") : "files at once";
    const reasons = [];
    const changes = s.op === "upsert" && s.existed && !KINDS[kind].body ? changedFields(kind, s, prev) : [];
    if (changes.length) reasons.push(`It changes ${changes.join(", ")}; every other field stays as stored.`);
    if (body && body.stripped) reasons.push(`The sanitiser strips ${Object.entries(body.stripped).map(([k, n]) => strippedWords(k, n)).join(", ")} from its body; nothing is refused for it.`);
    out[p.i] = item(base, "files", { effect, reasons, body, roles, ...(changes.length ? { changes } : {}) });
    ctx.knowledgeReady.push(p.i);
  }
}

// needsOf(grade, lane, mapRefs) -> { reasons, hints, unknown }: one sentence per thing an incomplete contribution needs, each
// saying exactly what is missing (never one reason for all): a ref not in the Map names itself and up to three near matches
// (mapRefs.near: the preview's, after its read-scope check); the proof says which kind it lacks and one accepted form of each
export function needsOf(grade, lane, mapRefs) {
  const g = grade || {}, reasons = [], hints = {}, unknown = [];
  const nearWords = (ref, what) => { const n = mapRefs && mapRefs.near ? mapRefs.near(ref, what) : []; unknown.push({ field: what, ref, near: n.map((x) => ({ id: x.id, name: x.name })) });
    return n.length ? `: near ${n.map((x) => (x.name && x.name !== x.id ? `${x.id} (${x.name})` : x.id)).join(", ")}` : ": no near match"; };
  const notIn = (list, what, word) => { for (const r of list || []) reasons.push(`${word} ${r} is not in the project's Map${nearWords(r, what)}.`); };
  const core = (g.missing || []).filter((m) => ["what", "why", "touches"].includes(m));
  if (core.length) reasons.push(`It needs ${core.join(" and ")}${core.includes("touches") && (lane === "code" || lane === "design") ? " (what it touches: touches or components)" : ""}.`);
  if ((g.missing || []).includes("screens")) {
    if (g.joinKey === "absent") reasons.push("A screen design names the screen it changes: send screens (its id in the project's Map).");
    notIn(g.screenUnknown, "screens", "Screen");
    hints.screens = "the screens it changes by their id in the project's Map (e.g. screen:pricing), or leave screens out and say what it touches in touches";
  }
  if ((g.missing || []).includes("proof")) {
    reasons.push(g.proof === "missing" ? "It carries no proof." : reasonWords(lane === "gtm" ? "gtm-proof-not-link" : "proof-not-artifact"));
    hints.proof = lane === "gtm" ? GTM_PROOF_FORMS : PROOF_FORMS;
  }
  if ((g.missing || []).includes("components")) { notIn(g.componentUnknown, "components", "Component"); hints.components = "node ids of the project's Map (a service, a door, a table, the architecture or one of its parts), or leave components out and say what it touches in touches"; }
  if ((g.missing || []).includes("depends")) {
    for (const r of g.dependsUnknown || []) reasons.push(/^(goal|q|check)\//.test(r) ? `It depends on ${r}, which is not in the project.` : `It depends on ${r}, which is not in the project's Map${nearWords(r, "depends")}.`);
    hints.depends = "node ids of the Map, goal/<id>, q/<qid> or check/<id> of this project";
  }
  if (!reasons.length) reasons.push(`It needs ${(g.missing || []).join(", ") || "one more thing"}.`);
  return { reasons, hints, unknown };
}

// contributions: the batch door's own plan, round by round when ONE item refuses the whole batch (a reserved kind, an
// unknown parent): that item is marked, the rest planned again without it
async function contributionPart(who, env, project, list, out, ctx) {
  const bodyOf = (p) => ({ ...p.raw.contribution, project, ...(ctx.eval ? { eval: true } : {}) });
  const own = list.filter((p) => { const pr = p.raw.contribution.project; return pr === undefined || pr === null || (typeof pr === "string" && pr.trim().toLowerCase() === project); });
  for (const p of list) if (!own.includes(p)) {
    out[p.i] = item({ i: p.i, type: "contribution", kind: "contribution", kindWord: "contribution", line: shapePreviewLine(p.raw.contribution, {}) || "A contribution", places: [], tab: "" }, "refused",
      { reasons: [`This preview files into ${projectSlug(project)}: leave project out of the item, or preview the other project's items on their own.`], refusal: { error: "project_forbidden", note: `This preview files into ${projectSlug(project)}.` } });
  }
  let live = own.slice();
  let plan = null;
  for (let round = 0; live.length && round < 6; round++) {
    // near: the preview runs after projectCallScope held the caller to this project's read scope, so the near matches of a
    // ref that is not in the Map come only from a project the caller may read (src/maprefs.js AUTHORITY)
    plan = await planTransmissionsBatch(who, live.map(bodyOf), env, { near: true });
    if (!plan.all) break;
    const r0 = plan.all[0] || {}, at = Number.isInteger(r0.item) ? r0.item : 0, p = live[at];
    const base = { i: p.i, type: "contribution", kind: "contribution", kindWord: "contribution", line: shapePreviewLine(p.raw.contribution, {}) || "A contribution", places: shapeShowsOf(p.raw.contribution), tab: "" };
    base.tab = tabOf(base.places);
    out[p.i] = r0.error === "unknown_parent"
      ? item(base, "needs", { reasons: [r0.note], needs: { field: "parent", hint: r0.note, formats: { shape: String(p.raw.contribution.lane || "").toLowerCase() } }, effect: "needs parent" })
      : item(base, "refused", { reasons: [r0.note || "The door refused it."], refusal: { error: r0.error, note: r0.note } });
    live = live.filter((x) => x !== p);
    plan = null;
  }
  if (!plan || plan.all) return;
  // the goals' titles name a goalRef in a line (src/shapes.js preview: nothing else reads them), so the tree is read only when an
  // item names one (sprint 8, 8.3b: 133 rows on saruspay for 50 lines that name no goal); the batch plan read it then already
  const names = {};
  const namesGoal = live.some((p) => p.raw.contribution && p.raw.contribution.goalRef != null && String(p.raw.contribution.goalRef).trim() !== "");
  if (namesGoal) try { for (const g of await goalTree(env, project)) names[g.id] = g.title || g.id; } catch (e) { if (isD1Quota(e)) throw e; }
  plan.prepared.forEach((pp, k) => {
    const p = live[k], b = p.raw.contribution, lane = String(b.lane || "").toLowerCase();
    const places = shapeShowsOf({ ...b, lane });
    const hp = b.happenedAt != null ? happenedAtOf(b.happenedAt) : null;   // when the work happened (it files now): the line says it too
    const base = { i: p.i, type: "contribution", kind: "contribution", kindWord: "contribution", line: shapePreviewLine({ ...b, lane }, { names }) || `Contribution: ${clip(b.what, 60)}`, places, tab: tabOf(places), lane,
      ...(hp && hp.value ? { happenedAt: hp.value } : {}) };
    if (pp.skip) {
      const res = pp.result || {};
      if (res.duplicate && res.sameAs != null) { out[p.i] = item(base, "unchanged", { reasons: [`The same clientRef as another item of this call: it files once, as that item.`], effect: "unchanged" }); return; }
      if (res.duplicate) { out[p.i] = item(base, "unchanged", { reasons: [`Already filed under this clientRef as ${res.id}: filing it again files nothing.`], effect: "unchanged" }); out[p.i].existing = res.id; return; }
      if (res.error === "bad_lane") { out[p.i] = item(base, "needs", { reasons: [`Send lane as one of ${(res.allowed || []).join(", ")}.`], needs: { field: "lane", hint: `one of ${(res.allowed || []).join(", ")}`, formats: {} }, effect: "needs lane" }); return; }
      if (res.error === "bad_field") { out[p.i] = item(base, "needs", { reasons: [res.note || `Send ${res.field} as ${res.hint}.`], needs: { field: res.field, hint: res.hint, formats: { shape: lane }, ...(res.example ? { example: res.example } : {}) }, effect: `needs ${res.field}` }); return; }
      out[p.i] = item(base, "refused", { reasons: [res.note || "The door refused it."], refusal: { error: res.error, note: res.note } });
      return;
    }
    const reasons = (pp.grade.ownerReasons || []).map(reasonWords);
    if (pp.goalCheck && pp.goalCheck.status === "unknown") reasons.push(`goalRef "${pp.goalCheck.ref}" is not in the goal tree: it files, but moves no goal until the ref is corrected.`);
    if (pp.route === "incomplete") {
      const missing = pp.grade.missing || [];
      const f = missing[0] || "what";
      const nd = needsOf(pp.grade, lane, pp.mapRefs);
      out[p.i] = item(base, "needs", { reasons: nd.reasons,
        needs: { field: f, fields: missing, hint: nd.hints[f] || fieldHint(lane, f) || `send ${f}`, formats: { shape: lane }, ...(nd.unknown.length ? { unknown: nd.unknown } : {}) },
        effect: `needs ${f}${missing.length > 1 ? ` +${missing.length - 1}` : ""}` });
      return;
    }
    out[p.i] = item(base, ROUTE_VERDICT[pp.route] || "waits_for_owner", { reasons });
    ctx.contributionReady.push(p.i);
  });
}

// counts(items) -> { byVerdict, byKind }
export function countsOf(items) {
  const byVerdict = {}, byKind = {};
  for (const it of items) { byVerdict[it.verdict] = (byVerdict[it.verdict] || 0) + 1; const k = it.kindWord || it.kind; byKind[k] = (byKind[k] || 0) + 1; }
  return { byVerdict, byKind };
}
// fitSummary(summary) -> the summary as stored, at most SUMMARY_MAX bytes: whole when it fits; else the plain items (files,
// unchanged) lose their reasons and all but their first place, then are stored GROUPED by kind (a count and the first
// lines), the items the person must see (needs, refused, waits for the owner) kept whole. `verdicts` (one per item, in
// order) is always whole: file reads which items are ready from it.
const enc = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
export function fitSummary(s) {
  if (enc(s) <= SUMMARY_MAX) return s;
  const slim = { ...s, items: s.items.map((it) => (["files", "unchanged"].includes(it.verdict) ? { ...it, reasons: [], places: it.places.slice(0, 1) } : it)) };
  if (enc(slim) <= SUMMARY_MAX) return slim;
  const must = slim.items.filter((it) => !["files", "unchanged"].includes(it.verdict));
  const groups = new Map();
  for (const it of slim.items.filter((x) => ["files", "unchanged"].includes(x.verdict))) {
    const k = `${it.kindWord}|${it.verdict}`;
    if (!groups.has(k)) groups.set(k, { kindWord: it.kindWord, verdict: it.verdict, count: 0, lines: [], tab: it.tab, places: it.places });
    const g = groups.get(k); g.count++; if (g.lines.length < 5) g.lines.push(it.line);
  }
  const grouped = { ...slim, grouped: true, items: must.slice(0, 120), groups: [...groups.values()] };
  return enc(grouped) <= SUMMARY_MAX ? grouped : { ...grouped, items: must.slice(0, 40), reach: { ...grouped.reach, touched: { ...grouped.reach.touched, names: [] }, reached: { ...grouped.reach.reached, names: [] } } };
}

// previewItems(person, args, env, { via, origin }) — args { project?, items, leftOut?, note?, eval? }. -> the preview (below)
// | a refusal (items_required · too_many_items · project_forbidden · project_required). Writes ONE previews row (none for a
// read-only key), nothing else; it never files.
const FORMS_WORDS = "{contribution: {lane, what, why, ...}}, {kind, op: \"upsert\", data} (a knowledge upsert) or {kind, op: \"remove\", data} (a knowledge remove)";
// a grade or an answer in a preview: refused, pointing at the tool that files it at once
const OTHER_DOOR_REASON = { grade: "A grade is not previewed: submit_grade {checkId, verdict, proof} files it at once.", answer: "An answer is not previewed: respond {qid, option} files it at once." };
export async function previewItems(person, args, env, o = {}) {
  const a = isObj(args) ? args : {};
  if (!Array.isArray(a.items) || !a.items.length) return { error: "items_required", note: `Send items: 1 to ${PREVIEW_MAX}, each ONE of ${FORMS_WORDS}. formats has every kind and shape.` };
  if (a.items.length > PREVIEW_MAX) return { error: "too_many_items", max: PREVIEW_MAX, got: a.items.length, note: `Send at most ${PREVIEW_MAX} items in one preview: split them.` };
  const batchRef = a.clientRef == null || a.clientRef === "" ? null : typeof a.clientRef === "string" && BATCH_REF_RE.test(a.clientRef.trim()) ? a.clientRef.trim() : undefined;
  if (batchRef === undefined) return { error: "bad_field", field: "clientRef", hint: "1 to 48 letters, digits, . _ : -", note: "Nothing was previewed: send clientRef as 1 to 48 letters, digits, . _ : - (your key for the whole batch), or leave it out." };
  const readOnly = !!(person.readOnly || !hasWriteScope(person));
  const seats = await seatsOnce(env, person.id);
  const d = await doorProject(person, { project: a.project }, seats, env);
  if (d.error) return d;
  if (!d.project) return { error: "project_required", seats: seats.map((s) => s.key), note: "Add `project`: the key of the project these items belong to (`whoami` lists your projects)." };
  const project = d.project;
  const sc = await projectCallScope(person, project, env);
  if (sc.error) return sc;
  const penv = sc.env, who = { ...sc.person, readOnly: person.readOnly };
  // G2: the eval mark only on an eval project or from a test seat (src/core.js evalMarkRefused) — with a knowledge item among
  // the items, on an eval project alone (its rows carry their project's mark): refused whole, nothing stored
  if (isEvalMark(a.eval)) { const er = await evalMarkRefused(person, project, penv, { knowledge: a.items.some((x) => formOf(x) === "knowledge") }); if (er) return er; }
  const out = new Array(a.items.length);
  const ctx = { eval: isEvalMark(a.eval), knowledgeReady: [], contributionReady: [] };
  const parsed = a.items.map((raw, i) => ({ i, raw, form: formOf(raw), op: opOf(raw) }));
  // the parts: each write tool and the indices of the items it files (every item of its operation, ready or not: the tool is
  // sent them all, as previewed), kept whole like verdicts; each part's digest (canon JSON by its tool) goes in the row's digest
  // column, taken before any door prepares a body
  const parts = Object.fromEntries(WRITE_TOOL_NAMES.map((t) => [t, parsed.filter((p) => WRITE_TOOLS[p.op] === t).map((p) => p.i)]).filter(([, l]) => l.length));
  const digests = {};
  for (const [t, idx] of Object.entries(parts)) digests[t] = await digestOf(idx.map((i) => a.items[i]));
  for (const p of parsed.filter((x) => !x.form)) {
    out[p.i] = item({ i: p.i, type: null, kind: "item", kindWord: "item", line: "An item of no known form", places: [], tab: "" }, "needs",
      { reasons: [`Send each item as ONE of ${FORMS_WORDS}.`], needs: { field: "item", hint: "one of the three forms", formats: {} }, effect: "needs its form" });
  }
  // sprint 19: a grade or an answer files through its own tool, at once; the preview refuses it and names that tool
  for (const p of parsed.filter((x) => OTHER_DOORS[x.form])) {
    const key = p.form === "grade" ? String(p.raw.grade.checkId ?? "").trim() : String(p.raw.answer.qid ?? "").trim();
    out[p.i] = item({ i: p.i, type: p.form, kind: p.form, kindWord: p.form, line: `${p.form === "grade" ? "Grade" : "Answer"}: ${clip(key || `a ${p.form === "grade" ? "check" : "question"}`, 60)}`, places: [], tab: "", ...(key ? { key: clip(key, 120) } : {}) },
      "refused", { reasons: [OTHER_DOOR_REASON[p.form]], refusal: { error: "wrong_tool", tool: OTHER_DOORS[p.form], note: OTHER_DOOR_REASON[p.form] } });
  }
  const of = (form) => parsed.filter((x) => x.form === form);
  if (of("knowledge").length) await knowledgePart(who, penv, project, of("knowledge"), out, ctx);
  if (of("contribution").length) await contributionPart(who, penv, project, of("contribution"), out, ctx);
  // D1b item 7: a batch clientRef whose slot already filed DIFFERENT content refuses that item now, before anything is filed
  if (batchRef) {
    const landed = await batchLanded(penv, person.id, batchRef);
    // G2 item 7: each knowledge part's slot too (the upserts' k, the removes' kr) — the knowledge that would file now, against
    // what the slot filed before
    for (const op of ["upsert", "remove"]) {
      const kNow = parsed.filter((p) => p.op === op && out[p.i] && out[p.i].verdict === "files");
      const kGot = kNow.length ? landed.get(`${batchRef}:${KNOWLEDGE_PART[op]}`) : null;
      if (!kGot) continue;
      const kd = await partDigest(kNow.map((p) => p.raw));
      if (!kGot.some((x) => x.d === kd || x.d === null)) for (const p of kNow) out[p.i] = { ...out[p.i], verdict: "refused", effect: "refused", wouldBe: out[p.i].verdict, reasons: [CLASH_NOTE, ...(out[p.i].reasons || [])], refusal: { error: "client_ref_taken", note: CLASH_NOTE, filed: kGot[0].id } };
    }
    if (landed.size) for (const p of parsed) {
      if (p.form !== "contribution" || !out[p.i] || out[p.i].verdict === "refused") continue;
      if (itemOwnRef(p.raw)) continue;
      const got = landed.get(`${batchRef}:c${p.i}`);
      if (!got) continue;
      const d = await partDigest(p.raw);
      if (got.some((x) => x.d === d || x.d === null)) continue;
      out[p.i] = { ...out[p.i], verdict: "refused", effect: "refused", wouldBe: out[p.i].verdict, reasons: [CLASH_NOTE, ...(out[p.i].reasons || [])], refusal: { error: "client_ref_taken", note: CLASH_NOTE, filed: got[0].id } };
    }
  }
  // which write tool files each item (sprint 19): the item's operation's (src/formats.js WRITE_TOOLS)
  let items = out.map((it, i) => (WRITE_TOOLS[parsed[i].op] ? { ...it, filesWith: WRITE_TOOLS[parsed[i].op] } : it));
  if (readOnly) items = items.map((it) => ({ ...it, verdict: "refused", effect: "refused", wouldBe: it.verdict, reasons: [READ_ONLY_REASON, ...it.reasons], refusal: { error: "read_only_credential", note: READ_ONLY_REASON } }));

  // what it reaches: every item but a refused one
  const reachIn = parsed.filter((p) => (p.form === "knowledge" || p.form === "contribution") && out[p.i] && out[p.i].verdict !== "refused")
    .map((p) => (p.form === "knowledge" ? { type: "knowledge", op: p.raw } : { type: "contribution", body: p.raw.contribution }));
  const reach = await readReach(penv, project, collectRefs(reachIn));
  const { statements: reachStatements, ...reachOut } = reach;

  const leftOut = (Array.isArray(a.leftOut) ? a.leftOut : []).slice(0, LEFT_OUT_MAX).filter(isObj).map((l) => ({ what: clip(l.what, 200), why: clip(l.why, 400) })).filter((l) => l.what);
  const note = a.note != null ? clip(a.note, 1000) : "";
  const counts = countsOf(items);
  const tenant = await getTenantConfig(penv).catch(() => ({}));
  const org = (tenant && tenant.brand && tenant.brand.org) || "";
  const summary = { v: 2, project, org, by: { id: person.id, name: person.name || "" }, items, counts, reach: reachOut, reachLine: reachWords(reachOut), leftOut,
    ...(note ? { note } : {}), ...(ctx.eval ? { eval: true } : {}), ...(batchRef ? { clientRef: batchRef } : {}), verdicts: items.map((it) => it.verdict), parts,
    // D2b item 7: an unchanged item's id (a contribution already filed under its clientRef), kept whole like verdicts, so a
    // replay's receipt maps every clientRef to its contribution even when the summary is stored grouped
    ...(items.some((it) => it.existing) ? { existing: Object.fromEntries(items.filter((it) => it.existing).map((it) => [it.i, it.existing])) } : {}) };
  const ready = items.filter((it) => it.verdict === "files" || it.verdict === "waits_for_owner").length;
  const notReady = items.filter((it) => it.verdict === "needs" || it.verdict === "refused").length;
  const shownParts = partsOf(summary);
  const partsOut = shownParts.map((p) => ({ tool: p.tool, items: p.idx.map((i) => i + 1), ready: p.idx.filter((i) => ["files", "waits_for_owner"].includes(items[i].verdict)).length }));
  if (readOnly) {
    const ans = { previewId: null, expiresAt: null, url: null, readOnly: true, project, ...strip(summary), ready: 0, notReady: items.length,
      note: "Nothing was stored: a read-only key previews, and never files." };
    return { ...ans, text: previewText(ans, { mode: "preview", org }) };
  }
  const id = newId(), at = now(), expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  const stored = fitSummary(summary);
  await db(penv).prepare("INSERT INTO previews (id, project, person, created_at, expires_at, digest, summary) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, project, person.id, at, expiresAt, canon(digests), JSON.stringify(stored)).run();
  const url = (o.origin || "") + orgPath(`/preview/${id}`);
  const ans = { previewId: id, expiresAt, url, project, ...strip(summary), parts: partsOut, ready, notReady, ...(stored.grouped ? { storedGrouped: true } : {}),
    ...(shownParts.length ? { next: nextOf(shownParts) } : {}) };
  return { ...ans, text: previewText(ans, { mode: "preview", org, url, previewId: id, parts: partsOut }), ...(o.debug ? { reachStatements } : {}) };
}
const strip = (s) => { const { v, by, verdicts, org, parts, ...rest } = s; return rest; };

// ---- the write tools: file_contribution, save_knowledge, remove_knowledge (sprint 19) ----
const notFound = (id) => ({ error: "preview_not_found", previewId: String(id || "").slice(0, 40), note: "No preview of yours with this id: preview the items again (preview) and file with the id it answers." });
const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
export const PREVIEW_ROW_SQL = "SELECT id, project, person, created_at, expires_at, filed_at, digest, summary, filed FROM previews WHERE id = ?";
// isVerbRow(row) -> the row holds a publish's or an equip's confirm (src/confirm.js storeVerbConfirm), not a preview of items
const isVerbRow = (row) => { const sm = parse(row && row.summary); return !!(sm && typeof sm.verb === "string"); };
const isReady = (v) => v === "files" || v === "waits_for_owner";
const plural = (n, one, many) => (n === 1 ? one : many);
// partCalls(parts) -> each part as the answers name it: { tool, items: [numbers] }
const partCalls = (parts) => parts.map((p) => ({ tool: p.tool, items: p.idx.map((i) => i + 1) }));
// restOf(parts, filed, tool) -> the other parts not filed yet (complete), each with its tool and its items
const restOf = (parts, filed, tool) => partCalls(parts.filter((p) => p.tool !== tool && !(isObj(filed) && isObj(filed.parts) && isObj(filed.parts[p.tool]) && filed.parts[p.tool].complete)));

// filedView(filed, summary) -> the row's `filed` as ONE receipt over every part: { at (the newest part's), complete (every part
// of the preview filed whole), items (each part's), meterNote? }, or null when nothing was filed. A row filed before the split
// (sprint 19: { at, complete, items }, one file call for every item) is read as it was stored.
export function filedView(filed, summary) {
  if (!isObj(filed)) return null;
  if (!isObj(filed.parts)) return Array.isArray(filed.items) ? filed : null;
  const ps = Object.values(filed.parts).filter(isObj);
  if (!ps.length) return null;
  const all = partsOf(summary);
  const meter = ps.map((p) => p.meterNote).filter(Boolean);
  return { at: ps.map((p) => String(p.at || "")).sort().pop(), complete: all.length > 0 && all.every((p) => isObj(filed.parts[p.tool]) && filed.parts[p.tool].complete),
    items: ps.flatMap((p) => (Array.isArray(p.items) ? p.items : [])).sort((x, y) => x.i - y.i), ...(meter.length ? { meterNote: meter.join("; ") } : {}) };
}

// filePart(person, args, env, { via, origin, tool, check }) — one write tool's filing of its part of a preview (tool:
// file_contribution, save_knowledge or remove_knowledge; its operation is src/formats.js OP_OF_TOOL's). args { previewId, items
// (the preview's items of this operation, as previewed and in their order), only?: "ready", fileOnConfirm? } -> the part's
// receipt { previewId, project, tool, complete, filedAt, items: [... each with filed: { status: filed | unchanged | left |
// not_filed, id?, route?, note? }], counts, results, rest (the other parts still to file, each with its tool), text, url } | a
// refusal: preview_id_required · items_required · wrong_tool (an item of another operation, each named with the tool that files
// it) · read_only_credential · preview_not_found · project_forbidden · nothing_to_file (the preview holds none of this operation)
// · preview_filed (this part, with its first receipt) · preview_expired · preview_changed · not_ready.
// check: true (the confirm, src/mcp.js) runs every refusal and files nothing, answering the part as the person is asked it;
// args.fileOnConfirm: true reaching here (a client the door could not ask, or the REST twin) is that same check, saying the
// person was not asked.
// ORDER and ATOMICITY: save_knowledge's upserts and remove_knowledge's removes are each ONE writeKnowledge call (all of the part,
// with its one ledger row, or none); file_contribution's contributions are ONE batch-door call (one D1 batch: every one that
// passes its checks, or none). The part's receipt is recorded on the row under its tool (one UPDATE; the row counts as filed once
// every part is); a part that did not land whole is retried with the same previewId and files only what did not land: it reads
// which items already landed by their clientRefs (one statement; a contribution is filed under pv:<previewId>:c<index>, or its own
// clientRef; the upserts under pv:<previewId>:k, the removes under pv:<previewId>:kr), each door's own clientRef replay standing
// behind that.
export async function filePart(person, args, env, o = {}) {
  const tool = o.tool, op = OP_OF_TOOL[tool];
  if (!op) throw new Error(`filePart: ${String(tool)} is no write tool`);
  const a = isObj(args) ? args : {};
  const words = OP_WORDS[op];
  const previewId = typeof a.previewId === "string" ? a.previewId.trim() : "";
  if (!PREVIEW_ID_RE.test(previewId)) return { error: "preview_id_required", note: `Send previewId (the id preview answered) and the preview's ${words[1]} as items, as previewed.` };
  if (!Array.isArray(a.items) || !a.items.length || a.items.length > PREVIEW_MAX) return { error: "items_required", note: `Send items: the preview's ${words[1]} (1 to ${PREVIEW_MAX}), as previewed and in their order.` };
  // an item of another operation is refused before anything is read, each named with the tool that files it
  const wrong = a.items.map((it, j) => ({ n: j + 1, op: opOf(it) })).filter((x) => x.op !== op);
  if (wrong.length) {
    const toolOf = (x) => WRITE_TOOLS[x] || OTHER_DOORS[x] || null;
    const said = (x) => (x.op ? `item ${x.n} is a ${(OP_WORDS[x.op] || [x.op])[0]}, filed by ${toolOf(x.op)}` : `item ${x.n} is of no known form`);
    return { error: "wrong_tool", tool, items: wrong.map((x) => ({ n: x.n, ...(x.op ? { is: (OP_WORDS[x.op] || [x.op])[0] } : {}), filesWith: toolOf(x.op) })),
      note: `${tool} files only ${words[1]}: ${wrong.slice(0, 5).map(said).join("; ")}${wrong.length > 5 ? `; and ${wrong.length - 5} more` : ""}. Nothing was filed.` };
  }
  if (person.readOnly || !hasWriteScope(person)) return { error: "read_only_credential", note: READ_ONLY_REASON };
  const row = await db(env).prepare(PREVIEW_ROW_SQL).bind(previewId).first();
  // sprint 7, 7.5b: a publish's or an equip's confirm row (src/confirm.js storeVerbConfirm) is no preview of items: unknown here
  if (!row || row.person !== person.id || isVerbRow(row)) return notFound(previewId);
  // the author's right to the project NOW: a seat lost since the preview refuses here, nothing filed
  const sc = await projectCallScope(person, row.project, env);
  if (sc.error) return sc;
  const penv = sc.env, who = sc.person, project = row.project;
  const summary = parse(row.summary) || {};
  const digests = parse(row.digest);
  // a preview made before the split keeps one digest for every item: preview again (a preview lives an hour)
  if (!isObj(summary.parts) || !isObj(digests)) return { error: "preview_changed", previewId, note: "This preview was made before each operation was filed by its own tool, so nothing was filed: preview the items again, then file each part with the tool its items name." };
  const parts = partsOf(summary);
  const part = parts.find((p) => p.tool === tool);
  if (!part) return { error: "nothing_to_file", previewId, tool, parts: partCalls(parts),
    note: `This preview holds no ${words[1]}, so nothing was filed${parts.length ? `: ${parts.map((p) => `${p.tool} files ${plural(p.idx.length, "item", "items")} ${numbers(p.idx.map((i) => i + 1))}`).join("; ")}` : ""}.` };
  const idx = part.idx;
  const done = parse(row.filed);
  const was = isObj(done) && isObj(done.parts) && isObj(done.parts[tool]) ? done.parts[tool] : null;
  if (was && was.complete) return { error: "preview_filed", previewId, tool, filedAt: was.at, receipt: receiptOf(summary, was, { previewId, project, origin: o.origin, tool, idx, rest: restOf(parts, done, tool) }),
    note: `This preview's ${words[1]} were filed at ${was.at}; nothing was filed again. Their receipt is in receipt.` };
  if (!was && Date.parse(row.expires_at) < Date.now()) return { error: "preview_expired", previewId, expiredAt: row.expires_at, note: `This preview expired (a preview lives an hour) and none of its ${words[1]} was filed: preview the items again, then file.` };
  if ((await digestOf(a.items)) !== digests[tool]) return { error: "preview_changed", previewId, tool, items: idx.map((i) => i + 1),
    note: `The items differ from the preview's ${words[1]} (${plural(idx.length, "item", "items")} ${numbers(idx.map((i) => i + 1))}, in that order), so nothing was filed: send them as previewed, or preview again and file with the new previewId.` };
  const verdicts = Array.isArray(summary.verdicts) ? summary.verdicts : [];
  const ev = !!summary.eval;
  const notReady = idx.filter((i) => verdicts[i] === "needs" || verdicts[i] === "refused").map((i) => ({ i, n: i + 1, verdict: verdicts[i] }));
  const only = a.only === "ready";
  if (notReady.length && !only) {
    return { error: "not_ready", previewId, tool, notReady, note: `${notReady.length} of this preview's ${words[1]} ${notReady.length === 1 ? "is" : "are"} not ready (needs one more thing, or refused), so nothing was filed. Fix ${notReady.length === 1 ? "it" : "them"} and preview again, or call ${tool} again with only: "ready" to file the rest and leave ${notReady.length === 1 ? "it" : "them"}.` };
  }
  // the item as sent, by its index in the preview (the digest held: the part's items, in their order)
  const sentAt = new Map(idx.map((i, j) => [i, a.items[j]]));
  const ready = (i) => isReady(verdicts[i]);
  if (o.check || a.fileOnConfirm === true) {
    const keep = new Set(idx);
    const shown = { project, items: (summary.items || []).filter((it) => keep.has(it.i)), leftOut: [], reachLine: summary.reachLine, counts: countsOf((summary.items || []).filter((it) => keep.has(it.i))) };
    const n = idx.filter(ready).length;
    const out = { previewId, project, tool, items: shown.items, ready: n, left: idx.length - n, notReady: 0, counts: shown.counts, text: previewText(shown, { mode: "preview", org: summary.org, url: (o.origin || "") + orgPath(`/preview/${previewId}`) }) };
    return o.check ? out : { ...out, filed: false, confirm: { asked: false, note: NOT_ASKED.capability } };
  }
  const isK = op !== "contribution";
  // the batch clientRef the preview was given (the one-pass fix 9) names every part; else the preview's own id does. D1b item
  // 7: under a batch ref each part's ref carries its content's digest, so a changed item is never answered with the receipt
  // of what was filed before it (batchLanded, CLASH_NOTE)
  const batchRef = typeof summary.clientRef === "string" && BATCH_REF_RE.test(summary.clientRef) ? summary.clientRef : null;
  const ownRef = (i) => (isK ? null : itemOwnRef(sentAt.get(i)));
  const cDigest = new Map();
  if (batchRef && !isK) for (const i of idx) cDigest.set(i, await partDigest(sentAt.get(i)));
  const kItems = isK ? idx.filter((i) => verdicts[i] === "files").map((i) => sentAt.get(i)) : [];
  const kDigest = batchRef && kItems.length ? await partDigest(kItems) : null;
  const partRef = (letter, i, d) => (batchRef ? `${batchRef}:${letter}${i == null ? "" : i}${d ? "~" + d : ""}` : refOf(previewId, letter, i));
  const refFor = (i) => ownRef(i) || partRef("c", i, cDigest.get(i));
  const kSlot = KNOWLEDGE_PART[op];
  const kRef = isK ? partRef(kSlot, null, kDigest) : null;
  const existing = (summary && summary.existing) || {};
  const status = new Map(idx.map((i) => [i, verdicts[i] === "unchanged" ? { status: "unchanged", ...(existing[i] ? { id: existing[i] } : {}) } : ready(i) ? null : { status: "left", note: "Not filed: it was not ready (only: \"ready\")." }]));
  // what already landed: one statement over every clientRef this call would use (and, under a batch ref, every part of the
  // batch: a slot that filed under another digest is a clash, a slot filed before digests is the same content)
  const refs = isK ? [kRef] : idx.filter(ready).map(refFor);
  const landed = new Map(((await db(penv).prepare("SELECT id, client_ref, route, json_extract(grade, '$.refDigest') AS rd FROM transmission WHERE submitter = ?1 AND client_ref IN (SELECT value FROM json_each(?2))").bind(person.id, JSON.stringify(refs)).all()).results || [])
    .map((r) => [r.client_ref, r]));
  // G2 item 7: a contribution's OWN clientRef that already filed DIFFERENT content is never answered "filed": not_filed, saying so
  if (!isK) for (const i of idx) {
    const own = ready(i) && ownRef(i), w = own && landed.get(own);
    if (!w || !w.rd) continue;
    if (w.rd !== await refDigestOf(sentAt.get(i).contribution)) { status.set(i, { status: "not_filed", note: CLIENT_REF_CLASH_NOTE, clash: w.id }); landed.delete(own); }
  }
  if (batchRef) {
    const bl = await batchLanded(penv, person.id, batchRef);
    const legacy = (slot) => (bl.get(slot) || []).find((x) => x.d === null);
    if (isK && kDigest) {
      const slot = `${batchRef}:${kSlot}`;
      if (!landed.has(kRef) && legacy(slot)) landed.set(kRef, legacy(slot));
      // G2 item 7: the knowledge slot filed OTHER knowledge before: nothing of this part is written, saying so
      const kOther = !landed.has(kRef) ? (bl.get(slot) || [])[0] : null;
      if (kOther) for (const i of idx) if (verdicts[i] === "files") status.set(i, { status: "not_filed", note: CLASH_NOTE, clash: kOther.id });
    }
    if (!isK) for (const i of idx) {
      if (!ready(i) || ownRef(i)) continue;
      const ref = refFor(i), slot = slotOf(ref);
      if (landed.has(ref)) continue;
      const old = legacy(slot);
      if (old) { landed.set(ref, old); continue; }
      const other = (bl.get(slot) || [])[0];
      if (other) status.set(i, { status: "not_filed", note: CLASH_NOTE, clash: other.id });
    }
  }
  const via = o.via || "mcp";
  const fail = (i, note) => { status.set(i, { status: "not_filed", note: String(note || "It did not file.").slice(0, 400) }); };
  let meterBefore = null;
  if (isK) {
    // the knowledge: ONE writeKnowledge call, all or nothing
    const kIdx = idx.filter((i) => verdicts[i] === "files" && !status.get(i));
    // the meter before a knowledge write (the one-pass fix 8): when the write starts an area, the receipt says so ("GTM now
    // counts: +3 items"). One checklist read before and one after (CHECKLIST_SQL, the meter's own statement), only when knowledge files
    meterBefore = kIdx.length && !landed.has(kRef) ? await checklistFor(penv, who, { project }).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
    if (kIdx.length) {
      if (landed.has(kRef)) for (const i of kIdx) status.set(i, { status: "filed", id: landed.get(kRef).id, ledger: true });
      else {
        try {
          const w = await writeKnowledge(who, { project, ops: kIdx.map((i) => sentAt.get(i)), clientRef: kRef, ...(ev ? { eval: true } : {}) }, penv, { via });
          if (w.error === "invalid_ops") {
            const byIdx = new Map((w.errors || []).map((e) => [e.index, e.note]));
            kIdx.forEach((i, j) => fail(i, byIdx.get(j) || `Another ${words[0]} of this call was refused, and they file all together: nothing of it was written.`));
          } else if (w.error) kIdx.forEach((i) => fail(i, w.note || w.error));
          else for (const i of kIdx) status.set(i, { status: "filed", ...(w.ledger ? { id: w.ledger, ledger: true } : {}) });
        } catch (e) { if (isD1Quota(e)) throw e; kIdx.forEach((i) => fail(i, `The knowledge write did not complete; call ${tool} again with the same previewId.`)); }
      }
    }
  } else {
    // the contributions: ONE batch-door call
    const cTodo = [];
    for (const i of idx.filter((x) => ready(x) && !status.get(x))) { const l = landed.get(refFor(i)); if (l) status.set(i, { status: "filed", id: l.id, route: l.route }); else cTodo.push(i); }
    if (cTodo.length) {
      try {
        // the refs were read just above (`landed`) and none of these landed: the batch door does not read them again
        const res = await fileTransmissionsBatch(who, cTodo.map((i) => ({ ...sentAt.get(i).contribution, project, clientRef: refFor(i), via, ...(ev ? { eval: true } : {}) })), penv, false, { refsChecked: new Set(cTodo.map(refFor)) });
        cTodo.forEach((i, k) => { const r = res[k] || {}; if (r.id && !r.error) status.set(i, { status: "filed", id: r.id, route: r.route }); else fail(i, r.note || r.error); });
      } catch (e) { if (isD1Quota(e)) throw e; cTodo.forEach((i) => fail(i, `The contributions did not file; call ${tool} again with the same previewId.`)); }
    }
  }
  const complete = idx.every((i) => status.get(i) && status.get(i).status !== "not_filed");
  const at = now();
  const meterAfter = meterBefore && !meterBefore.live && idx.some((i) => status.get(i) && status.get(i).status === "filed") ? await checklistFor(penv, who, { project }).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
  const meterNote = meterAfter && !meterAfter.live ? meterChangeWords(meterBefore, meterAfter) : "";
  const rec = { at, complete, items: idx.map((i) => ({ i, ...status.get(i) })), ...(meterNote ? { meterNote } : {}) };
  // ONE update: this part's receipt under its tool; the row counts as filed (filed_at) once every part of it is complete (each
  // other part's flag read from the row as it stands, in the same statement). The tool names are the registry's, never a caller's.
  const others = parts.filter((p) => p.tool !== tool).map((p) => ` AND json_extract(filed, '$.parts.${p.tool}.complete') = 1`).join("");
  await db(penv).prepare(`UPDATE previews SET filed = json_set(COALESCE(filed, '{}'), '$.parts.${tool}', json(?1)), filed_at = CASE WHEN ?2 = 1${others} THEN ?3 ELSE filed_at END WHERE id = ?4 AND person = ?5`)
    .bind(JSON.stringify(rec), complete ? 1 : 0, at, previewId, person.id).run();
  return receiptOf(summary, rec, { previewId, project, origin: o.origin, tool, idx, sent: sentAt, rest: restOf(parts, done, tool) });
}

// receiptOf(summary, filed, { previewId, project, origin, tool?, idx?, sent?, rest? }) -> the receipt: the preview's items (one
// part's, with idx; else every one, the page's view) with what each became, each place now resolved for a contribution's id
export function receiptOf(summary, filed, o) {
  const by = new Map(((filed && filed.items) || []).map((x) => [x.i, x]));
  const inPart = Array.isArray(o && o.idx) ? new Set(o.idx) : null;
  // D1b item 14: a preview stored GROUPED (over 64 KB) keeps only the items that were not ready, so the receipt's items were
  // empty for every one that filed (their ids were in results alone). With the items as sent (a write tool has them), every
  // index of its part gets its row: the stored one, else one made from the item itself (its kind and key, its verdict and what
  // it became)
  const stored = (summary.items || []).filter((it) => !inPart || inPart.has(it.i));
  const have = new Set(stored.map((it) => it.i));
  const verdicts = Array.isArray(summary.verdicts) ? summary.verdicts : [];
  const made = o && o.sent instanceof Map && summary.grouped ? [...o.sent].filter(([i]) => !have.has(i)).map(([i, it]) => sentRow(it, i, verdicts[i])) : [];
  const items = stored.concat(made).sort((x, y) => x.i - y.i).map((it) => {
    const f = by.get(it.i) || null;
    const places = it.type === "contribution" && f && f.id ? shapeShowsOf({ lane: it.lane || "leader", id: f.id, goalRef: undefined }).concat((it.places || []).filter((p) => !/\{id\}/.test(p.path))) : it.places;
    return { ...it, places: dedupe(places || []), filed: f ? { status: f.status, ...(f.id ? { id: f.id } : {}), ...(f.route ? { route: f.route } : {}), ...(f.note ? { note: f.note } : {}), ...(f.ruled ? { ruled: true } : {}), ...(f.counted != null ? { counted: f.counted } : {}) } : null };
  });
  const st = (s) => ((filed && filed.items) || []).filter((x) => x.status === s).length;
  const url = (o.origin || "") + orgPath(`/preview/${o.previewId}`);
  // a part's receipt names its own items; the whole preview's groups (a summary stored grouped) belong to the page's view
  const groups = !inPart && summary.groups ? summary.groups : null;
  const ans = { previewId: o.previewId, project: o.project, ...(o.tool ? { tool: o.tool } : {}), complete: !!(filed && filed.complete), filedAt: filed && filed.complete ? filed.at : null, items, ...(groups ? { groups } : {}),
    leftOut: inPart ? [] : summary.leftOut || [],
    counts: { filed: st("filed"), unchanged: st("unchanged"), left: st("left"), notFiled: st("not_filed") }, filedCount: st("filed"), leftCount: st("left"), notFiledCount: st("not_filed"), url,
    ...(filed && filed.meterNote ? { meterNote: filed.meterNote } : {}),
    ...(o.rest ? { rest: o.rest } : {}),
    // every item's own result, by its index (whole even when the summary was stored grouped)
    results: ((filed && filed.items) || []).map((x) => ({ i: x.i, n: x.i + 1, status: x.status, ...(x.id ? { id: x.id } : {}) })) };
  // the page's text block stays the grouped one (the groups say the many; a row per item is for the client to read, not to print)
  const madeSet = new Set(made.map((x) => x.i));
  const forText = made.length && groups ? { ...ans, items: items.filter((it) => !madeSet.has(it.i)) } : ans;
  return { ...ans, text: previewText(forText, { mode: "receipt", org: summary.org, url, previewId: o.previewId, tool: o.tool, rest: o.rest }) };
}
// sentRow(item, i, verdict) -> a receipt row for an item a grouped summary did not keep: its form, kind and key from the item
function sentRow(it, i, verdict) {
  const form = formOf(it);
  const clip60 = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (form === "contribution") return { i, n: i + 1, type: "contribution", kind: clip60(it.contribution.kind) || "contribution", kindWord: "contribution", lane: clip60(it.contribution.lane), line: `Contribution: ${clip60(it.contribution.what)}`, verdict: verdict || null, places: [] };
  const d = isObj(it.data) ? it.data : {}; const key = clip60(d.id ?? d.qid ?? d.path ?? d.screen ?? "");
  return { i, n: i + 1, type: "knowledge", kind: clip60(it.kind), kindWord: clip60(it.kind), ...(key ? { key } : {}), line: `${clip60(it.kind)}${key ? `: ${key}` : ""}`, verdict: verdict || null, places: [] };
}
const dedupe = (places) => { const seen = new Set(); return places.filter((p) => { const k = `${p.tab}|${p.path}`; if (seen.has(k)) return false; seen.add(k); return true; }); };

// ---- pruning (sprint 3, D3): a preview lives an hour; a row nothing was filed from is deleted a day after it expired ----
// What a FILED row is read for, and so kept whole: a write tool again with its id answers preview_filed with its part's receipt
// (filed), a partial part is retried against its digest and verdicts (summary), and the receipt's link, the page GET /preview/:id
// and the card's brain://card/<id>, draws the items and what each became (summary, filed). The ledger never reads a preview
// row (a filing names its preview only inside its clientRef). An UNFILED row is read only by those same doors, which answer
// "expired" after its hour; a day later the row goes and its id answers as an unknown one (preview_not_found, the usual
// 404). Run by the cron (twice a day, src/cron.js) once per org, as the deployment for that org (src/data.js platformEnv; sprint
// 6, 6.4): only the org's own previews (a preview carries no org: its project's, {org}), at most PRUNE_MAX rows an org a run.
// Cost (sprint 8, 8.3b; migrate-078): the statement reads the unfiled previews past the cutoff on idx_previews_prune (unfiled
// rows by expires_at) and WRITES one row per row deleted. Before that index it walked the whole table by its key — every org's
// previews, the filed ones kept for ever — once an org a run (the real-data org held 42 rows, 38 filed, on 2026-10-02).
export const PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;
export const PRUNE_MAX = 500;
export const PRUNE_SQL = "DELETE FROM previews WHERE id IN (SELECT id FROM previews WHERE filed IS NULL AND filed_at IS NULL AND expires_at < ?1 " +
  "AND project IN (SELECT key FROM projects WHERE org = {org}) LIMIT " + PRUNE_MAX + ")";
export async function prunePreviews(env, at = Date.now()) {
  const cutoff = new Date(at - PRUNE_GRACE_MS).toISOString();
  const r = await db(env).prepare(PRUNE_SQL).bind(cutoff).run();
  const m = (r && r.meta) || {};
  return { cutoff, deleted: Number(m.changes) || 0, rowsRead: Number(m.rows_read) || 0, rowsWritten: Number(m.rows_written) || 0 };
}

// ---- the page's read (src/previewpage.js draws it) ----
// readPreviewView(env, person, id) -> the view | null (the usual 404: no such id, another person's preview on a project the
// reader may not read, a malformed id). Who may open it: its author, and anyone who may read its project (a seat; the owner:
// any active project; a Partner only with a seat). For anyone but the author, an item whose roleVisibility does not admit
// them is left out (counted, never named).
export async function readPreviewView(env, person, id) {
  const pid = String(id || "").trim();
  if (!PREVIEW_ID_RE.test(pid) || !person) return null;
  const row = await db(env).prepare(PREVIEW_ROW_SQL).bind(pid).first();
  if (!row || isVerbRow(row)) return null;   // sprint 7, 7.5b: a verb's confirm row is no preview: the usual 404
  const author = row.person === person.id;
  // sprint 6 (6.2): previews carry no org of their own; one at the org level (no project) opens only inside its author's org
  // (one people probe, on this path alone), so no reader of another org opens it by its id (one with a project is the project
  // rule's: resolveProject, in the reader's org)
  if (!author && !row.project && !(await db(env).prepare("SELECT 1 AS x FROM people WHERE id = ? AND org = {org}").bind(row.person).first())) return null;
  // sprint 6 (6.6, found by tools/attack-xorg.mjs): the row's project is a stored KEY, never a slug a caller typed — the project
  // rule resolves a bare slug inside the reader's org, so org 1's bare key "shop" read by org 2 resolved to org 2's own o2--shop
  // and org 1's preview opened. The key must be a project of the reader's org (the name read here, one statement as before)
  let projectName = row.project;
  if (row.project) {
    const p = await db(env).prepare("SELECT name FROM projects WHERE key = ? AND org = {org}").bind(row.project).first();
    if (!p) return null;
    if (p.name) projectName = p.name;
  }
  let scoped = env;
  const sc = await resolveProject(person, row.project, await seatsOnce(env, person.id), env);
  if (sc.error) { if (!author) return null; } else scoped = sc.env;
  const summary = parse(row.summary) || {};
  const raw = parse(row.filed);
  const filed = filedView(raw, summary);
  const t = Date.now();
  const state = row.filed_at ? "filed" : Date.parse(row.expires_at) < t && !filed ? "expired" : filed ? "partial" : "open";
  let items = summary.items || [], hidden = 0;
  if (!author) { const keep = items.filter((it) => !it.roles || !it.roles.length || rolesAdmit(person, it.roles)); hidden = items.length - keep.length; items = keep; }
  const view = receiptOf({ ...summary, items }, filed || { items: [] }, { previewId: pid, project: row.project, origin: "" });
  // sprint 19: each part with its tool, its items and whether it is filed (the page's calls, the card's File press)
  const parts = partsOf(summary).map((p) => ({ tool: p.tool, items: p.idx.map((i) => i + 1), filed: !!(isObj(raw) && isObj(raw.parts) && isObj(raw.parts[p.tool]) && raw.parts[p.tool].complete) }));
  return { id: pid, project: row.project, projectName, author, by: summary.by || {}, org: summary.org || "", createdAt: row.created_at, expiresAt: row.expires_at, filedAt: row.filed_at, filedSoFar: !!filed,
    state, items: view.items, groups: summary.groups || null, counts: summary.counts || countsOf(items), reach: summary.reach || null, reachLine: summary.reachLine || "", leftOut: summary.leftOut || [],
    note: summary.note || "", hidden, scopedEnv: scoped, fileCounts: view.counts, parts };
}
