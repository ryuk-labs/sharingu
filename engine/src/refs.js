// src/refs.js — the ref grammar: a ref is a short token naming one thing a contribution touches (q/<id> a question,
// c/<id> a component, mind/* the engine's own namespace, screen:<id> a screen, flow:<n> a flow); gapRefs on a contribution
// is a comma-joined list of them. Parsing, its chip, the index tokens a contribution is found by (refTokensFor) and the
// one canonical form of a ref (canonicalRef) live here.

import { db } from "./data.js";
import { esc } from "./ui.js";

// parseRefs(v) — a comma-separated string or array -> trimmed, non-empty ref strings.
// Same shape as the local list() helper every one of the three renderers already carries
// for touches/screens/components (that broader csv-or-array helper is unrelated to ref
// grammar and stays where it is); this is scoped to gapRefs specifically.
export function parseRefs(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Byte-identical to src/transmission.js's pre-existing gateGrade check (the
// "answers-a-question" ownerReason): it matches a q/ ref ANYWHERE in a raw comma-joined string.
export function hasQuestionRef(rawCsv) {
  return /(^|,)\s*q\//.test(String(rawCsv || ""));
}

// Byte-identical to src/transmission.js's pre-existing mind-namespace check (mindJoin: R's
// own infra components, ADR-075/077 — a verified, all-mind components list is its own join
// key, no product screen required).
export function isMindRef(ref) {
  return String(ref || "").startsWith("mind/");
}

// refChip(ref, opts) — a gapRefs chip; opts.className keeps each page's own class hook.
export function refChip(ref, opts) {
  const o = opts || {};
  const cls = o.className || "ref-chip mono";
  return `<span class="${cls}">${esc(ref)}</span>`;
}

// ---- a ref's contributions: the index tokens a contribution is found by ----

// refTokensFor(body) — schema audit finding 3 / migrate-018: the exact set of ref
// tokens a transmission row should be findable by, derived from the SAME three
// envelope fields fileTransmission()/fileTransmissionsBatch() write to gaprefs/
// screens/components (src/core.js) — gapRefs verbatim (e.g. "screen:041A",
// "q/AR1", "mind/worker"), screens bare (e.g. "041A"), components bare-or-mind-
// verbatim (e.g. "comp-id", "mind/worker"): what to index given a filed row — the three-column
// mapping as impact {refs}'s history reads (src/refs.js canonicalRef: a screen bare and prefixed).
// toList() below accepts raw arrays and CSV interchangeably.
export function refTokensFor(body) {
  const toList = (v) => Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter(Boolean)
    : String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
  const refs = new Set([
    ...toList(body.gapRefs ?? body.gaprefs),
    ...toList(body.screens),
    ...toList(body.components),
    // D1b item 13: what a contribution touches is indexed too, verbatim (the Map's own ids: screen:<id>, table:<name>, a
    // path), so one ref's history finds it. Never a knowledge write's touches: they name the items written (a doc or a card
    // a reader may not read), and a knowledge write is read by `changes`, never by a ref's history.
    ...(String(body.kind || "").toLowerCase() === "knowledge" ? [] : toList(body.touches).slice(0, 30)),
  ]);
  return [...refs].filter((r) => r.length <= 200);
}

// refsInsert(env, tid, refs) -> ONE prepared statement (through the request's data layer, src/data.js) indexing every ref of a filed row, however many. The refs travel as one
// JSON parameter (json_each), never as a (?,?) pair per ref: D1 takes at most 100 bound parameters per statement, so a row with
// more than 50 index tokens (30 touches plus a screens list) refused the whole batch at file after its preview said "files".
export const REFS_INSERT_SQL = "INSERT INTO transmission_refs (tid, ref) SELECT ?1, value FROM json_each(?2)";
export const refsInsert = (env, tid, refs) => db(env).prepare(REFS_INSERT_SQL).bind(tid, JSON.stringify(refs));
// sprint 8, 8.3b: the refs of MANY filings in one statement (src/core.js fileTransmissionsBatch), as [[tid, ref], …] in the order
// the per-filing statements wrote them
export const REFS_BATCH_SQL = "INSERT INTO transmission_refs (tid, ref) SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?1)";

// canonicalRef(ref) -> { ref, forms, goal } — THE one ref form of a ref's history, in and out (D1b item 13). In: a Map id
// (screen:<id>, door:…, table:…), goal/<id> (or goal:<id>), q/<qid> (or q:<qid>, question:<qid>), any other token as filed,
// or a bare screen id ("home"). Out: the canonical form (goal/<id>, q/<qid>, screen:<id> for a bare id) and every index token
// it is filed under: a screen is indexed bare from `screens` and prefixed from gapRefs and touches, so "screen:home" and
// "home" read the same history; a goal is the goal_ref column as well (goal: the id to read it by).
export function canonicalRef(raw) {
  let r = String(raw ?? "").trim().slice(0, 200);
  if (!r) return { ref: "", forms: [], goal: null };
  let m;
  if ((m = /^goal[:/](.+)$/i.exec(r))) { const id = m[1].trim(); return { ref: `goal/${id}`, forms: [`goal/${id}`], goal: id }; }
  if ((m = /^(?:q|question)[:/](.+)$/i.exec(r))) { const id = m[1].trim(); return { ref: `q/${id}`, forms: [`q/${id}`, `q:${id}`], goal: null }; }
  if ((m = /^screen:(.+)$/i.exec(r))) { const id = m[1].trim(); return { ref: `screen:${id}`, forms: [`screen:${id}`, id], goal: null }; }
  if (!/[:/]/.test(r)) return { ref: `screen:${r}`, forms: [`screen:${r}`, r], goal: null };
  return { ref: r, forms: [r], goal: null };
}

