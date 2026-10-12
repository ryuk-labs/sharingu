// src/preview.js — preview, then file (sprint 3, B2; docs/plan/MCP.md §4 "Two directions", BETA.md Stage B). The owner's
// rule: every filing is previewed first. `preview` (MCP) and POST /preview (REST) take the items a person's own AI client
// extracted, run every one through the SAME checks and planning the real write runs, and answer per item: its line, where
// it will show, how it will be graded, why, and what the whole set reaches. Nothing is written to the project: the ONE write
// a preview makes is its own row in `previews` (migrate-048), and a read-only key's preview writes not even that.
// `file` (MCP) and POST /file (REST) take the preview's id and the SAME items again (bodies are never stored with a
// preview), and file what is ready through the EXISTING write doors, in order: the knowledge ops (writeKnowledge, ONE call,
// all or nothing), the contributions (fileTransmissionsBatch, the batch door: one D1 batch), the grades (gradeChecks:
// gradeCheck's rules over the batch door, one batch of filings and one of result rows), the answers (respondOptions, one
// call). The answer is a receipt in the preview's own shape.
//
// The four item forms, each exactly the body its old door takes:
//   { kind, op, data }                          a knowledge op           (preview then file's op)
//   { contribution: { lane, kind, what, ... } } a contribution           (file's body, every shape field)
//   { grade: { checkId, verdict, proof } }      a grade                  (submit_grade's)
//   { answer: { qid, option, provisional? } }   an answer to a question  (respond's)
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
//   · a grade: gradeCheck's (the verdict, the check in this project's register, the grade's project equal to the filing's);
//   · an answer: respondOptions' (the read scope of the project, an option of an OPEN question; the owner's answer rules it);
//   · a read-only key (or an OAuth grant without mcp:write) previews, writes NOTHING (no preview row), and every item is
//     refused for filing; file refuses it (the REST gate and callTool refuse it before this module, and fileItems again);
//   · a previewId is not a capability: file reads the row only for its own author (another person's id is the same
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
import { resolveProject, projectSlug } from "./project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { gateGrade, PROOF_FORMS, GTM_PROOF_FORMS } from "./transmission.js";
import { checkOptionAnswers, entriesFrom } from "./decisions.js";
import { decisionRows } from "./knowledge/decisions.js";
import { respondOptions } from "./qnaire.js";
import { gradeChecks, gradeFilingBody, gradeNorm } from "./knowledge/grades.js";
import { GRADE_VERDICTS } from "./knowledge/checks.js";
import { goalTree } from "./knowledge/goals.js";
import { collectRefs, readReach, reachWords } from "./reach.js";
import { previewText } from "./previewtext.js";
import { removedAny } from "./render.js";
import { projectCallScope, hasWriteScope } from "./mcp.js";
import { now, sha256, isEvalMark, isD1Quota } from "./util.js";
import { getTenantConfig } from "./tenant.js";
import { checklistFor, meterChangeWords } from "./checklist.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

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
export const FILE_NEXT = 'file {previewId, items} files what is ready (send the SAME items); only: "ready" files the ready ones and leaves the rest.';
const READ_ONLY_REASON = "This key is read-only: it can preview, never file. Use your full key.";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clip = (v, n) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// formOf(item) -> "knowledge" | "contribution" | "grade" | "answer" | null (none, or more than one form in one item)
export function formOf(it) {
  if (!isObj(it)) return null;
  const hits = [isObj(it.contribution) && "contribution", isObj(it.grade) && "grade", isObj(it.answer) && "answer",
    ("kind" in it || "op" in it || "data" in it) && "knowledge"].filter(Boolean);
  return hits.length === 1 ? hits[0] : null;
}
// canon(v) -> v as JSON with every object's keys sorted (arrays keep their order): the digest's input
export const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : isObj(v) ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v === undefined ? null : v));
// digestOf(items) -> the sha256 of the items as sent, canonical: file sends the same items and must match it
export const digestOf = (items) => sha256(canon(items));
const newId = () => { const b = new Uint8Array(8); crypto.getRandomValues(b); return "P-" + [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };
// the clientRef file names each part by, so a retry finds what already landed (each door's own idempotency)
export const refOf = (previewId, part, i) => `pv:${previewId}:${part}${i == null ? "" : i}`;

const PART_LETTER = { contribution: "c", grade: "g", answer: "a" };
// itemOwnRef(raw, form) -> the clientRef an item carries itself (a contribution's or a grade's), or null
function itemOwnRef(it, form) { const c = form === "contribution" ? it && it.contribution && it.contribution.clientRef : form === "grade" ? it && it.grade && it.grade.clientRef : null; return c != null && String(c).trim() ? String(c).trim().slice(0, 60) : null; }
// ownRefLanded(env, personId, refs) -> Map(ref -> { id, route, rd }): what this person already filed under these clientRefs (an
// item's own: a contribution's or a grade's), with the content digest each stored (G2 item 7), ONE statement
export async function ownRefLanded(env, personId, refs) {
  const list = [...new Set(refs.filter(Boolean))];
  if (!list.length) return new Map();
  const rows = (await db(env).prepare("SELECT id, client_ref, route, json_extract(grade, '$.refDigest') AS rd FROM transmission WHERE submitter = ?1 AND client_ref IN (SELECT value FROM json_each(?2))")
    .bind(personId, JSON.stringify(list)).all()).results || [];
  return new Map(rows.map((r) => [r.client_ref, r]));
}
// ownDigestOf(item, form) -> the content digest the door will store for an item's own clientRef (a contribution: its body as
// sent; a grade: the filing gradeChecks makes of it)
export async function ownDigestOf(it, form) {
  if (form === "contribution") return refDigestOf(it.contribution);
  if (form === "grade") { const g = gradeNorm(it.grade.checkId, it.grade.verdict, it.grade.proof); return refDigestOf(gradeFilingBody(g.checkId, g.verdict, g.proof)); }
  return null;
}
// ---- a batch clientRef names CONTENT, not only a slot (D1b item 7) ----
// A batch clientRef used to name each part by its slot alone (<ref>:c0, <ref>:k), so a re-filed batch whose item CHANGED got
// the first filing's receipt ("filed") while nothing was written. Now each part's ref carries the first six hex of its own
// content's digest (<ref>:c0~1a2b3c, <ref>:k~4d5e6f; at most 60 characters with the longest batch ref): the same item filed
// again finds what landed and files nothing twice; a CHANGED knowledge part has a new ref and files as the update it is (an
// upsert merges); a CHANGED contribution, grade or answer in a slot that already filed is refused, saying so, at the preview
// and again at file. A part filed before this rule (<ref>:c0, no digest) is taken as the same content, as it was.
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

// grades: gradeCheck's own checks, one read for every check named; the filing each grade would make graded by the gate
async function gradePart(who, env, project, list, out, ctx) {
  // G2 item 7: a grade's own clientRef already used: the same grade is unchanged, another one is refused saying so
  const landedOwn = await ownRefLanded(env, who.id, list.map((p) => itemOwnRef(p.raw, "grade")));
  const ids = [...new Set(list.map((p) => String(p.raw.grade.checkId || "").trim().slice(0, 120)).filter(Boolean))];
  const rows = ids.length ? ((await db(env).prepare("SELECT id, title, refs FROM k_checks WHERE project = ?1 AND id IN (SELECT value FROM json_each(?2))").bind(project, JSON.stringify(ids)).all()).results || []) : [];
  const byId = new Map(rows.map((r) => { let refs = []; try { refs = JSON.parse(r.refs || "[]"); } catch { refs = []; } return [String(r.id), { title: r.title, refs: Array.isArray(refs) ? refs.map(String) : [] }]; }));
  for (const p of list) {
    const g = p.raw.grade, checkId = String(g.checkId || "").trim().slice(0, 120), verdict = String(g.verdict || "").toLowerCase();
    const proof = g.proof == null ? "" : String(g.proof).trim().slice(0, 4000);
    const c = byId.get(checkId);
    const places = showsOf("check", { id: checkId, refs: c ? c.refs : [] });
    const base = { i: p.i, type: "grade", kind: "grade", kindWord: "grade", line: `Grade: ${clip((c && c.title) || checkId || "a check", 60)}, ${verdict || "no verdict"}${proof ? ", with proof" : ", no proof"}`, places, tab: tabOf(places), ...(checkId ? { key: checkId } : {}) };
    if (!checkId) { out[p.i] = item(base, "needs", { reasons: ["Send checkId: the id of one of the project's checks."], needs: { field: "checkId", hint: "the id of a check (read {kind: \"check\"} lists them)", formats: { kind: "check" } }, effect: "needs checkId" }); continue; }
    if (!GRADE_VERDICTS.includes(verdict)) { out[p.i] = item(base, "needs", { reasons: [`Send verdict as one of ${GRADE_VERDICTS.join(", ")}.`], needs: { field: "verdict", hint: `one of ${GRADE_VERDICTS.join(", ")}`, formats: {} }, effect: "needs verdict" }); continue; }
    if (!c) { out[p.i] = item(base, "needs", { reasons: [`No check "${checkId}" in ${projectSlug(project)}: read {kind: "check"} lists the project's checks.`], needs: { field: "checkId", hint: "the id of a check of this project", formats: { kind: "check" } }, effect: "needs checkId" }); continue; }
    // the filing gradeCheck makes, graded by the same gate
    const body = { lane: "ba", kind: "grade", what: `grade ${checkId}: ${verdict}`, why: proof ? `check ${checkId}, with proof` : `check ${checkId}, no proof sent: for the owner`, touches: [`check:${checkId}`], ...(proof ? {} : { risk: "owner" }) };
    const { route, grade } = gateGrade(body, () => ({ list: [], valid: [], unknown: [], reserved: [], ok: true }), null);
    const reasons = [proof ? "It counts at once: every node the check names lights from it." : "No proof was sent: it is not counted, and the filing waits for the owner.", ...(proof ? (grade.ownerReasons || []).map(reasonWords) : [])];
    ctx.gradeRefs.set(p.i, c.refs);
    const own = itemOwnRef(p.raw, "grade"), was = own && landedOwn.get(own);
    if (was) {
      const d = await ownDigestOf(p.raw, "grade");
      if (was.rd && was.rd !== d) { out[p.i] = item(base, "refused", { reasons: [CLIENT_REF_CLASH_NOTE], refusal: { error: "client_ref_taken", note: CLIENT_REF_CLASH_NOTE, filed: was.id } }); continue; }
      out[p.i] = item(base, "unchanged", { reasons: [`Already filed under this clientRef as ${was.id}: filing it again files nothing.`], effect: "unchanged" }); out[p.i].existing = was.id; continue;
    }
    out[p.i] = item(base, route === "owner" ? "waits_for_owner" : "files", { reasons, effect: route === "owner" ? undefined : "counts at once" });
    ctx.gradeReady.push(p.i);
  }
}

// answers: respondOptions' own checks: the read scope of the project, then each answer an option of an OPEN question (the
// project's questions read once, memoized)
async function answerPart(who, env, project, list, out, ctx) {
  const sc = await resolveProject(who, project, await seatsOnce(env, who.id), env);
  const rows = sc.error ? [] : await decisionRows(sc.env, project);
  const byQid = new Map(rows.map((r) => [r.qid, r]));
  for (const p of list) {
    const a = p.raw.answer, qid = String(a.qid ?? "").trim();
    const q = byQid.get(qid);
    const places = showsOf("question", { qid });
    const base = { i: p.i, type: "answer", kind: "answer", kindWord: "answer", line: `Answer: ${clip(q ? q.question : qid || "a question", 60)}`, places, tab: tabOf(places), ...(qid ? { key: qid } : {}) };
    if (sc.error) { out[p.i] = item(base, "refused", { reasons: [sc.note], refusal: { error: sc.error, note: sc.note } }); continue; }
    const [e] = entriesFrom({ qid: a.qid, option: a.option, provisional: a.provisional, project, ...(a.answer !== undefined ? { answer: a.answer } : {}), ...(a.item !== undefined ? { item: a.item } : {}) });
    const chk = await checkOptionAnswers(sc.env, [e]);
    if (chk.error) {
      if (chk.error === "not_open") { out[p.i] = item(base, "refused", { reasons: [chk.note], refusal: { error: chk.error, note: chk.note } }); continue; }
      const field = chk.error === "unknown_qid" ? "qid" : "option";
      out[p.i] = item(base, "needs", { reasons: [chk.note], needs: { field, hint: chk.note, formats: { kind: "question" } }, effect: `needs ${field}` });
      continue;
    }
    const pick = chk.picked[0], ans = chk.answers[0];
    base.line = `Answer: ${clip(q ? q.question : qid, 40)}: ${pick.letter}. ${clip(pick.what, 40)}`;
    const { route, grade } = gateGrade({ lane: "leader", kind: "answer", what: `${qid} — ${ans.answer.slice(0, 400)}`, why: "answer", touches: ["decisions"], gapRefs: [`q/${qid}`] }, () => ({ list: [], valid: [], unknown: [], reserved: [], ok: true }), null);
    ctx.answerAffects.set(p.i, q ? q.affects : []);
    ctx.answerReady.push(p.i);
    if (route === "owner") { out[p.i] = item(base, "waits_for_owner", { reasons: (grade.ownerReasons || []).map(reasonWords) }); continue; }
    if (who.role === "owner" && !pick.provisional) { out[p.i] = item(base, "files", { reasons: ["You are the owner: your answer rules the question at once."], effect: "rules it at once" }); continue; }
    out[p.i] = item(base, "waits_for_owner", { reasons: [pick.provisional ? "A provisional answer: the question stays open." : "Your answer is recorded; the question stays open until the owner rules it."] });
  }
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
// read-only key), nothing else.
export async function previewItems(person, args, env, o = {}) {
  const a = isObj(args) ? args : {};
  if (!Array.isArray(a.items) || !a.items.length) return { error: "items_required", note: `Send items: 1 to ${PREVIEW_MAX}, each ONE of {kind, op, data} (a knowledge item), {contribution: {lane, what, why, ...}}, {grade: {checkId, verdict, proof}} or {answer: {qid, option}}. formats has every kind and shape.` };
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
  const digest = await digestOf(a.items);   // before any door prepares a body (a prepared body rides a symbol, never JSON)
  const out = new Array(a.items.length);
  const ctx = { eval: isEvalMark(a.eval), knowledgeReady: [], contributionReady: [], gradeReady: [], answerReady: [], gradeRefs: new Map(), answerAffects: new Map() };
  const parsed = a.items.map((raw, i) => ({ i, raw, form: formOf(raw) }));
  for (const p of parsed.filter((x) => !x.form)) {
    out[p.i] = item({ i: p.i, type: null, kind: "item", kindWord: "item", line: "An item of no known form", places: [], tab: "" }, "needs",
      { reasons: ["Send each item as ONE of {kind, op, data} (a knowledge item), {contribution: {...}}, {grade: {...}} or {answer: {...}}."], needs: { field: "item", hint: "one of the four forms", formats: {} }, effect: "needs its form" });
  }
  const of = (form) => parsed.filter((x) => x.form === form);
  if (of("knowledge").length) await knowledgePart(who, penv, project, of("knowledge"), out, ctx);
  if (of("contribution").length) await contributionPart(who, penv, project, of("contribution"), out, ctx);
  if (of("grade").length) await gradePart(who, penv, project, of("grade"), out, ctx);
  if (of("answer").length) await answerPart(who, penv, project, of("answer"), out, ctx);
  // D1b item 7: a batch clientRef whose slot already filed DIFFERENT content refuses that item now, before anything is filed
  if (batchRef) {
    const landed = await batchLanded(penv, person.id, batchRef);
    // G2 item 7: the knowledge part's slot too — the knowledge that would file now, against what the slot filed before
    const kNow = parsed.filter((p) => p.form === "knowledge" && out[p.i] && out[p.i].verdict === "files");
    const kGot = kNow.length ? landed.get(`${batchRef}:k`) : null;
    if (kGot) {
      const kd = await partDigest(kNow.map((p) => p.raw));
      if (!kGot.some((x) => x.d === kd || x.d === null)) for (const p of kNow) out[p.i] = { ...out[p.i], verdict: "refused", effect: "refused", wouldBe: out[p.i].verdict, reasons: [CLASH_NOTE, ...(out[p.i].reasons || [])], refusal: { error: "client_ref_taken", note: CLASH_NOTE, filed: kGot[0].id } };
    }
    if (landed.size) for (const p of parsed) {
      if (!p.form || p.form === "knowledge" || !out[p.i] || out[p.i].verdict === "refused") continue;
      if (itemOwnRef(p.raw, p.form)) continue;
      const got = landed.get(`${batchRef}:${PART_LETTER[p.form]}${p.i}`);
      if (!got) continue;
      const d = await partDigest(p.raw);
      if (got.some((x) => x.d === d || x.d === null)) continue;
      out[p.i] = { ...out[p.i], verdict: "refused", effect: "refused", wouldBe: out[p.i].verdict, reasons: [CLASH_NOTE, ...(out[p.i].reasons || [])], refusal: { error: "client_ref_taken", note: CLASH_NOTE, filed: got[0].id } };
    }
  }
  let items = out;
  if (readOnly) items = items.map((it) => ({ ...it, verdict: "refused", effect: "refused", wouldBe: it.verdict, reasons: [READ_ONLY_REASON, ...it.reasons], refusal: { error: "read_only_credential", note: READ_ONLY_REASON } }));

  // what it reaches: every item but a refused one
  const reachIn = parsed.filter((p) => p.form && out[p.i] && out[p.i].verdict !== "refused").map((p) => p.form === "knowledge" ? { type: "knowledge", op: p.raw }
    : p.form === "contribution" ? { type: "contribution", body: p.raw.contribution }
    : p.form === "grade" ? { type: "grade", checkId: String(p.raw.grade.checkId || "").trim(), refs: ctx.gradeRefs.get(p.i) || [] }
    : { type: "answer", qid: String(p.raw.answer.qid ?? "").trim(), affects: ctx.answerAffects.get(p.i) || [] });
  const reach = await readReach(penv, project, collectRefs(reachIn));
  const { statements: reachStatements, ...reachOut } = reach;

  const leftOut = (Array.isArray(a.leftOut) ? a.leftOut : []).slice(0, LEFT_OUT_MAX).filter(isObj).map((l) => ({ what: clip(l.what, 200), why: clip(l.why, 400) })).filter((l) => l.what);
  const note = a.note != null ? clip(a.note, 1000) : "";
  const counts = countsOf(items);
  const tenant = await getTenantConfig(penv).catch(() => ({}));
  const org = (tenant && tenant.brand && tenant.brand.org) || "";
  const summary = { v: 1, project, org, by: { id: person.id, name: person.name || "" }, items, counts, reach: reachOut, reachLine: reachWords(reachOut), leftOut,
    ...(note ? { note } : {}), ...(ctx.eval ? { eval: true } : {}), ...(batchRef ? { clientRef: batchRef } : {}), verdicts: items.map((it) => it.verdict),
    // D2b item 7: an unchanged item's id (a contribution already filed under its clientRef), kept whole like verdicts, so a
    // replay's receipt maps every clientRef to its contribution even when the summary is stored grouped
    ...(items.some((it) => it.existing) ? { existing: Object.fromEntries(items.filter((it) => it.existing).map((it) => [it.i, it.existing])) } : {}) };
  const ready = items.filter((it) => it.verdict === "files" || it.verdict === "waits_for_owner").length;
  const notReady = items.filter((it) => it.verdict === "needs" || it.verdict === "refused").length;
  if (readOnly) {
    const ans = { previewId: null, expiresAt: null, url: null, readOnly: true, project, ...strip(summary), ready: 0, notReady: items.length,
      note: "Nothing was stored: a read-only key previews, and never files." };
    return { ...ans, text: previewText(ans, { mode: "preview", org }) };
  }
  const id = newId(), at = now(), expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  const stored = fitSummary(summary);
  // sprint 3, D3 (src/confirm.js): a preview the person will confirm in their client carries the confirm's binding in its row
  // ({ key: sha256(nonce:session), until }), written in this same INSERT; it is never part of the answer
  const confirm = o.confirm && o.confirm.key && o.confirm.until ? { key: String(o.confirm.key), until: String(o.confirm.until) } : null;
  await db(penv).prepare("INSERT INTO previews (id, project, person, created_at, expires_at, digest, summary) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, project, person.id, at, expiresAt, digest, JSON.stringify(confirm ? { ...stored, confirm } : stored)).run();
  const url = (o.origin || "") + orgPath(`/preview/${id}`);
  const ans = { previewId: id, expiresAt, url, project, ...strip(summary), ready, notReady, ...(stored.grouped ? { storedGrouped: true } : {}), next: FILE_NEXT };
  return { ...ans, text: previewText(ans, { mode: "preview", org, url, previewId: id }), ...(confirm ? { confirmUntil: confirm.until } : {}), ...(o.debug ? { reachStatements } : {}) };
}
const strip = (s) => { const { v, by, verdicts, org, ...rest } = s; return rest; };

// ---- file ----
const notFound = (id) => ({ error: "preview_not_found", previewId: String(id || "").slice(0, 40), note: "No preview of yours with this id: preview the items again (preview) and file with the id it answers." });
const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
export const PREVIEW_ROW_SQL = "SELECT id, project, person, created_at, expires_at, filed_at, digest, summary, filed FROM previews WHERE id = ?";
// isVerbRow(row) -> the row holds a publish's or an equip's confirm (src/confirm.js storeVerbConfirm), not a preview of items
const isVerbRow = (row) => { const sm = parse(row && row.summary); return !!(sm && typeof sm.verb === "string"); };

// fileItems(person, args, env, { via, origin }) — args { previewId, items, only?: "ready", clientRef? } -> the receipt
// { previewId, project, complete, filedAt, items: [... each with filed: { status: filed | unchanged | left | not_filed, id?,
// route?, note? }], counts, text, url } | a refusal: preview_id_required · items_required · read_only_credential ·
// preview_not_found · project_forbidden · preview_filed (with the receipt) · preview_expired · preview_changed · not_ready.
// ORDER and ATOMICITY: the knowledge ops are ONE writeKnowledge call (all of them, with its one ledger row, or none); then
// the contributions, ONE batch-door call (one D1 batch: every one that passes its checks, or none); then the grades (gradeChecks:
// gradeCheck's rules, the filings in one batch, then the result rows in one more); then the answers (ONE respondOptions call: its records,
// then one D1 batch of filings; the owner's answer then rules each question). A later part that fails leaves the earlier
// parts landed: the receipt names each item's own status, and the preview stays unfiled. A retry of file with the same
// previewId reads which parts already landed by their clientRefs (one statement; each part is filed under
// pv:<previewId>:<part><index>, or the item's own clientRef) and files only the rest; each door's own clientRef replay
// stands behind that.
export async function fileItems(person, args, env, o = {}) {
  const a = isObj(args) ? args : {};
  const previewId = typeof a.previewId === "string" ? a.previewId.trim() : "";
  if (!PREVIEW_ID_RE.test(previewId)) return { error: "preview_id_required", note: "Send previewId (the id preview answered) and the same items." };
  if (!Array.isArray(a.items) || !a.items.length || a.items.length > PREVIEW_MAX) return { error: "items_required", note: `Send items: the SAME 1 to ${PREVIEW_MAX} items you previewed.` };
  if (person.readOnly || !hasWriteScope(person)) return { error: "read_only_credential", note: READ_ONLY_REASON };
  const row = await db(env).prepare(PREVIEW_ROW_SQL).bind(previewId).first();
  // sprint 7, 7.5b: a publish's or an equip's confirm row (src/confirm.js storeVerbConfirm) is no preview of items: unknown here
  if (!row || row.person !== person.id || isVerbRow(row)) return notFound(previewId);
  // the author's right to the project NOW: a seat lost since the preview refuses here, nothing filed
  const sc = await projectCallScope(person, row.project, env);
  if (sc.error) return sc;
  const penv = sc.env, who = sc.person, project = row.project;
  const done = parse(row.filed);
  if (row.filed_at) return { error: "preview_filed", previewId, filedAt: row.filed_at, receipt: done, note: `This preview was filed at ${row.filed_at}; nothing was filed again. Its receipt is in receipt.` };
  if (!done && Date.parse(row.expires_at) < Date.now()) return { error: "preview_expired", previewId, expiredAt: row.expires_at, note: "This preview expired (a preview lives an hour) and nothing of it was filed: preview the items again, then file." };
  if ((await digestOf(a.items)) !== row.digest) return { error: "preview_changed", previewId, note: "The items differ from what was previewed, so nothing was filed: preview them again, then file with the new previewId." };
  const summary = parse(row.summary) || {};
  const verdicts = Array.isArray(summary.verdicts) ? summary.verdicts : [];
  const ev = !!summary.eval;
  const notReady = verdicts.map((v, i) => [v, i]).filter(([v]) => v === "needs" || v === "refused").map(([v, i]) => ({ i, n: i + 1, verdict: v }));
  const only = a.only === "ready";
  if (notReady.length && !only) {
    return { error: "not_ready", previewId, notReady, note: `${notReady.length} item${notReady.length === 1 ? " of this preview is" : "s of this preview are"} not ready (needs one more thing, or refused), so nothing was filed. Fix ${notReady.length === 1 ? "it" : "them"} and preview again, or file again with only: "ready" to file the rest and leave ${notReady.length === 1 ? "it" : "them"}.` };
  }
  const forms = a.items.map(formOf);
  const ready = (i) => verdicts[i] === "files" || verdicts[i] === "waits_for_owner";
  const ownRef = (i) => itemOwnRef(a.items[i], forms[i]);
  // the batch clientRef the preview was given (the one-pass fix 9) names every part; else the preview's own id does. D1b item
  // 7: under a batch ref each part's ref carries its content's digest, so a changed item is never answered with the receipt
  // of what was filed before it (batchLanded, CLASH_NOTE)
  const batchRef = typeof summary.clientRef === "string" && BATCH_REF_RE.test(summary.clientRef) ? summary.clientRef : null;
  const kItems = a.items.filter((_, i) => forms[i] === "knowledge" && verdicts[i] === "files");
  const digests = batchRef ? await Promise.all(a.items.map((it, i) => (forms[i] && forms[i] !== "knowledge" ? partDigest(it) : null))) : [];
  const kDigest = batchRef && kItems.length ? await partDigest(kItems) : null;
  const partRef = (part, i, d) => (batchRef ? `${batchRef}:${part}${i == null ? "" : i}${d ? "~" + d : ""}` : refOf(previewId, part, i));
  const refFor = (i) => ownRef(i) || partRef(PART_LETTER[forms[i]], i, digests[i]);
  const kRef = partRef("k", null, kDigest);
  const existing = (summary && summary.existing) || {};
  const status = verdicts.map((v, i) => (v === "unchanged" ? { status: "unchanged", ...(existing[i] ? { id: existing[i] } : {}) } : ready(i) ? null : { status: "left", note: "Not filed: it was not ready (only: \"ready\")." }));
  // what already landed: one statement over every clientRef this file would use (and, under a batch ref, every part of the
  // batch: a slot that filed under another digest is a clash, a slot filed before digests is the same content)
  const refs = [kRef, ...a.items.map((_, i) => (ready(i) && forms[i] !== "knowledge" ? refFor(i) : null)).filter(Boolean)];
  const landed = new Map(((await db(penv).prepare("SELECT id, client_ref, route, json_extract(grade, '$.refDigest') AS rd FROM transmission WHERE submitter = ?1 AND client_ref IN (SELECT value FROM json_each(?2))").bind(person.id, JSON.stringify(refs)).all()).results || [])
    .map((r) => [r.client_ref, r]));
  // G2 item 7: an item's OWN clientRef that already filed DIFFERENT content is never answered "filed": not_filed, saying so
  for (let i = 0; i < a.items.length; i++) {
    const own = ready(i) && ownRef(i), was = own && landed.get(own);
    if (!was || !was.rd) continue;
    if (was.rd !== await ownDigestOf(a.items[i], forms[i])) { status[i] = { status: "not_filed", note: CLIENT_REF_CLASH_NOTE, clash: was.id }; landed.delete(own); }
  }
  if (batchRef) {
    const bl = await batchLanded(penv, person.id, batchRef);
    const legacy = (slot) => (bl.get(slot) || []).find((x) => x.d === null);
    if (kDigest && !landed.has(kRef) && legacy(`${batchRef}:k`)) landed.set(kRef, legacy(`${batchRef}:k`));
    // G2 item 7: the knowledge slot filed OTHER knowledge before: nothing of this batch's knowledge is written, saying so
    const kOther = kDigest && !landed.has(kRef) ? (bl.get(`${batchRef}:k`) || [])[0] : null;
    if (kOther) a.items.forEach((_, i) => { if (forms[i] === "knowledge" && verdicts[i] === "files") status[i] = { status: "not_filed", note: CLASH_NOTE, clash: kOther.id }; });
    a.items.forEach((_, i) => {
      if (!ready(i) || forms[i] === "knowledge" || ownRef(i)) return;
      const ref = refFor(i), slot = slotOf(ref);
      if (landed.has(ref)) return;
      const old = legacy(slot);
      if (old) { landed.set(ref, old); return; }
      const other = (bl.get(slot) || [])[0];
      if (other) status[i] = { status: "not_filed", note: CLASH_NOTE, clash: other.id };
    });
  }
  const via = o.via || "mcp";
  const fail = (i, note) => { status[i] = { status: "not_filed", note: String(note || "It did not file.").slice(0, 400) }; };

  // 1 · knowledge: ONE writeKnowledge call, all or nothing
  const kIdx = a.items.map((_, i) => i).filter((i) => forms[i] === "knowledge" && verdicts[i] === "files" && !status[i]);
  // the meter before a knowledge write (the one-pass fix 8): when the write starts an area, the receipt says so ("GTM now
  // counts: +3 items"). One checklist read before and one after (CHECKLIST_SQL, the meter's own statement), only when knowledge files
  const meterBefore = kIdx.length && !kIdx.every((i) => landed.has(kRef)) ? await checklistFor(penv, who, { project }).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
  if (kIdx.length) {
    if (landed.has(kRef)) for (const i of kIdx) status[i] = { status: "filed", id: landed.get(kRef).id, ledger: true };
    else {
      try {
        const w = await writeKnowledge(who, { project, ops: kIdx.map((i) => a.items[i]), clientRef: kRef, ...(ev ? { eval: true } : {}) }, penv, { via });
        if (w.error === "invalid_ops") {
          const byIdx = new Map((w.errors || []).map((e) => [e.index, e.note]));
          kIdx.forEach((i, j) => fail(i, byIdx.get(j) || "Another knowledge item of this file was refused, and knowledge files all together: nothing of it was written."));
        } else if (w.error) kIdx.forEach((i) => fail(i, w.note || w.error));
        else for (const i of kIdx) status[i] = { status: "filed", ...(w.ledger ? { id: w.ledger, ledger: true } : {}) };
      } catch (e) { if (isD1Quota(e)) throw e; kIdx.forEach((i) => fail(i, "The knowledge write did not complete; file again with the same previewId.")); }
    }
  }
  // 2 · contributions: ONE batch-door call
  const cIdx = a.items.map((_, i) => i).filter((i) => forms[i] === "contribution" && ready(i) && !status[i]);
  const cTodo = [];
  for (const i of cIdx) { const l = landed.get(refFor(i)); if (l) status[i] = { status: "filed", id: l.id, route: l.route }; else cTodo.push(i); }
  if (cTodo.length) {
    try {
      // the refs were read just above (`landed`) and none of these landed: the batch door does not read them again
      const res = await fileTransmissionsBatch(who, cTodo.map((i) => ({ ...a.items[i].contribution, project, clientRef: refFor(i), via, ...(ev ? { eval: true } : {}) })), penv, false, { refsChecked: new Set(cTodo.map(refFor)) });
      cTodo.forEach((i, k) => { const r = res[k] || {}; if (r.id && !r.error) status[i] = { status: "filed", id: r.id, route: r.route }; else fail(i, r.note || r.error); });
    } catch (e) { if (isD1Quota(e)) throw e; cTodo.forEach((i) => fail(i, "The contributions did not file; file again with the same previewId.")); }
  }
  // 3 · grades: gradeCheck's rules, all of them in one call (gradeChecks: one read of the checks, one batch of filings, one
  // batch of result rows)
  const gIdx = a.items.map((_, i) => i).filter((i) => forms[i] === "grade" && ready(i) && !status[i]);
  const gTodo = [];
  for (const i of gIdx) { const l = landed.get(refFor(i)); if (l) status[i] = { status: "filed", id: l.id, route: l.route }; else gTodo.push(i); }
  if (gTodo.length) {
    try {
      const res = await gradeChecks(who, penv, gTodo.map((i) => ({ checkId: a.items[i].grade.checkId, verdict: a.items[i].grade.verdict, proof: a.items[i].grade.proof, clientRef: refFor(i) })), { project, via, ...(ev ? { eval: true } : {}) });
      if (!Array.isArray(res)) gTodo.forEach((i) => fail(i, res.note || res.error));
      else gTodo.forEach((i, k) => { const r = res[k] || {}; if (r.error) fail(i, r.note || r.error); else status[i] = { status: "filed", id: r.transmission, route: r.route, counted: r.counted }; });
    } catch (e) { if (isD1Quota(e)) throw e; gTodo.forEach((i) => fail(i, "The grades did not file; file again with the same previewId.")); }
  }
  // 4 · answers: ONE respondOptions call
  const aIdx = a.items.map((_, i) => i).filter((i) => forms[i] === "answer" && ready(i) && !status[i]);
  const aTodo = [];
  for (const i of aIdx) { const l = landed.get(refFor(i)); if (l) status[i] = { status: "filed", id: l.id, route: l.route }; else aTodo.push(i); }
  if (aTodo.length) {
    const entries = aTodo.map((i) => { const x = a.items[i].answer; const [e] = entriesFrom({ qid: x.qid, option: x.option, provisional: x.provisional, project, ...(ev ? { eval: true } : {}) }); return { ...e, clientRef: refFor(i) }; });
    try {
      const r = await respondOptions(who, entries, penv, { via });
      if (r.error) aTodo.forEach((i) => fail(i, r.note || r.error));
      else aTodo.forEach((i, k) => { const t = (r.transmissions || [])[k] || {}; if (t.tx) status[i] = { status: "filed", id: t.tx, route: t.route, ...(t.ruled ? { ruled: true } : {}) }; else fail(i, t.error || "It did not file."); });
    } catch (e) { if (isD1Quota(e)) throw e; aTodo.forEach((i) => fail(i, "The answers did not file; file again with the same previewId.")); }
  }

  const complete = status.every((s) => s && s.status !== "not_filed");
  const at = now();
  const meterAfter = meterBefore && !meterBefore.live && kIdx.some((i) => status[i] && status[i].status === "filed") ? await checklistFor(penv, who, { project }).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : null;
  const meterNote = meterAfter && !meterAfter.live ? meterChangeWords(meterBefore, meterAfter) : "";
  const filed = { at, complete, items: status.map((s, i) => ({ i, ...s })), ...(meterNote ? { meterNote } : {}) };
  await db(penv).prepare("UPDATE previews SET filed = ?, filed_at = ? WHERE id = ? AND person = ?").bind(JSON.stringify(filed), complete ? at : null, previewId, person.id).run();
  return receiptOf(summary, filed, { previewId, project, origin: o.origin, sent: a.items });
}

// receiptOf(summary, filed, { previewId, project, origin }) -> the receipt: the preview's items (or its groups) with what each
// became, each place now resolved for a contribution's id
export function receiptOf(summary, filed, o) {
  const by = new Map(((filed && filed.items) || []).map((x) => [x.i, x]));
  // D1b item 14: a preview stored GROUPED (over 64 KB: 424 grades) keeps only the items that were not ready, so the receipt's
  // items were empty for every one that filed (their ids were in results alone). With the items as sent (file has them), every
  // index gets its row: the stored one, else one made from the item itself (its kind and key, its verdict and what it became)
  const stored = summary.items || [];
  const have = new Set(stored.map((it) => it.i));
  const verdicts = Array.isArray(summary.verdicts) ? summary.verdicts : [];
  const made = Array.isArray(o && o.sent) && summary.grouped ? o.sent.map((it, i) => (have.has(i) ? null : sentRow(it, i, verdicts[i]))).filter(Boolean) : [];
  const items = stored.concat(made).sort((x, y) => x.i - y.i).map((it) => {
    const f = by.get(it.i) || null;
    const places = it.type === "contribution" && f && f.id ? shapeShowsOf({ lane: it.lane || "leader", id: f.id, goalRef: undefined }).concat((it.places || []).filter((p) => !/\{id\}/.test(p.path))) : it.places;
    return { ...it, places: dedupe(places || []), filed: f ? { status: f.status, ...(f.id ? { id: f.id } : {}), ...(f.route ? { route: f.route } : {}), ...(f.note ? { note: f.note } : {}), ...(f.ruled ? { ruled: true } : {}), ...(f.counted != null ? { counted: f.counted } : {}) } : null };
  });
  const st = (s) => ((filed && filed.items) || []).filter((x) => x.status === s).length;
  const url = (o.origin || "") + orgPath(`/preview/${o.previewId}`);
  const ans = { previewId: o.previewId, project: o.project, complete: !!(filed && filed.complete), filedAt: filed && filed.complete ? filed.at : null, items, ...(summary.groups ? { groups: summary.groups } : {}),
    leftOut: summary.leftOut || [],
    counts: { filed: st("filed"), unchanged: st("unchanged"), left: st("left"), notFiled: st("not_filed") }, filedCount: st("filed"), leftCount: st("left"), notFiledCount: st("not_filed"), url,
    ...(filed && filed.meterNote ? { meterNote: filed.meterNote } : {}),
    // every item's own result, by its index (whole even when the summary was stored grouped)
    results: ((filed && filed.items) || []).map((x) => ({ i: x.i, n: x.i + 1, status: x.status, ...(x.id ? { id: x.id } : {}) })) };
  // the text block stays the grouped one (the groups say the many; a row per item is for the client to read, not to print)
  const madeSet = new Set(made.map((x) => x.i));
  const forText = made.length ? { ...ans, items: items.filter((it) => !madeSet.has(it.i)) } : ans;
  return { ...ans, text: previewText(forText, { mode: "receipt", org: summary.org, url, previewId: o.previewId }) };
}
// sentRow(item, i, verdict) -> a receipt row for an item a grouped summary did not keep: its form, kind and key from the item
function sentRow(it, i, verdict) {
  return { n: i + 1, ...sentRow0(it, i, verdict) };
}
function sentRow0(it, i, verdict) {
  const form = formOf(it);
  const clip60 = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (form === "grade") return { i, type: "grade", kind: "grade", kindWord: "grade", key: clip60(it.grade.checkId), line: `Grade: ${clip60(it.grade.checkId)}, ${clip60(it.grade.verdict)}`, verdict: verdict || null, places: [] };
  if (form === "answer") return { i, type: "answer", kind: "answer", kindWord: "answer", key: clip60(it.answer.qid), line: `Answer: ${clip60(it.answer.qid)}`, verdict: verdict || null, places: [] };
  if (form === "contribution") return { i, type: "contribution", kind: clip60(it.contribution.kind) || "contribution", kindWord: "contribution", lane: clip60(it.contribution.lane), line: `Contribution: ${clip60(it.contribution.what)}`, verdict: verdict || null, places: [] };
  if (form === "knowledge") { const d = isObj(it.data) ? it.data : {}; const key = clip60(d.id ?? d.qid ?? d.path ?? d.screen ?? ""); return { i, type: "knowledge", kind: clip60(it.kind), kindWord: clip60(it.kind), ...(key ? { key } : {}), line: `${clip60(it.kind)}${key ? `: ${key}` : ""}`, verdict: verdict || null, places: [] }; }
  return { i, type: null, kind: "item", kindWord: "item", line: "An item of no known form", verdict: verdict || null, places: [] };
}
const dedupe = (places) => { const seen = new Set(); return places.filter((p) => { const k = `${p.tab}|${p.path}`; if (seen.has(k)) return false; seen.add(k); return true; }); };

// ---- pruning (sprint 3, D3): a preview lives an hour; a row nothing was filed from is deleted a day after it expired ----
// What a FILED row is read for, and so kept whole: `file` again with its id answers preview_filed with the receipt (filed),
// a partial one is retried against its digest and verdicts (summary), and the receipt's link, the page GET /preview/:id
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
  const filed = parse(row.filed);
  const t = Date.now();
  const state = row.filed_at ? "filed" : Date.parse(row.expires_at) < t && !filed ? "expired" : filed ? "partial" : "open";
  let items = summary.items || [], hidden = 0;
  if (!author) { const keep = items.filter((it) => !it.roles || !it.roles.length || rolesAdmit(person, it.roles)); hidden = items.length - keep.length; items = keep; }
  const view = receiptOf({ ...summary, items }, filed || { items: [] }, { previewId: pid, project: row.project, origin: "" });
  return { id: pid, project: row.project, projectName, author, by: summary.by || {}, org: summary.org || "", createdAt: row.created_at, expiresAt: row.expires_at, filedAt: row.filed_at, filedSoFar: !!filed,
    state, items: view.items, groups: summary.groups || null, counts: summary.counts || countsOf(items), reach: summary.reach || null, reachLine: summary.reachLine || "", leftOut: summary.leftOut || [],
    note: summary.note || "", hidden, scopedEnv: scoped, fileCounts: view.counts };
}
