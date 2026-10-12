// tempo.js — the TEMPO WORDS (R-PRD-ONE-MIND WP2, M-ADR-041). One word per item, everywhere an item
// shows, so a person always knows where it stands:
//   in             — received, live (filed and not yet ruled; an open item; an answer that landed)
//   with <owner>   — waiting for a ruling (route owner, no decision yet)
//   decided        — ruled (approve · reject · needs-work); the card shows it
//   on the canvas  — published and drawn: approved (or filed straight through) BEFORE the served
//                    publish stamp, and the row names what it touches (components/screens)
//   needs more     — the door routed it incomplete and nobody has ruled it: the filer owes one more thing
//                    (W8, B7b, Q60CCC574 — it used to wear "in", which told a newcomer nothing was wrong)
// DERIVED, never typed: from the row's route/decision and the served stamp. PURE — no env, no reads.
// The reader's route words ride here too (routeWord) so every face says filed / with the owner /
// needs one more thing for what the ledger stores as auto / owner / incomplete (WP1 vocabulary).

import { esc, stateChip } from "./ui.js";

export const TEMPO_WORDS = ["in", "with", "decided", "on the canvas", "needs more"];   // appended, order-stable
const DECIDED = new Set(["approve", "reject", "needs-work"]);

function nonEmpty(v) {
  if (Array.isArray(v)) return v.some((x) => String(x).trim());
  return String(v ?? "").trim().length > 0;
}
function toMs(v) {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : null;
}

// tempoOf(row, servedStamp, opts) -> "in" | "with <owner>" | "decided" | "on the canvas" | "needs more"
//   row         — { route, status, decision, decided_at, created_at, components, screens, kind }
//   servedStamp — { publishedAt } (serve/stamp.json's publishedAt, or state.generatedAt)
//   opts        — { ownerName } (default "the owner")
export function tempoOf(row, servedStamp, opts) {
  const r = row || {};
  const ownerName = (opts && opts.ownerName) || "the owner";
  const decision = String(r.decision || "").toLowerCase();
  const route = String(r.route || "").toLowerCase();
  const drawn = nonEmpty(r.components) || nonEmpty(r.screens);
  const landed = decision === "approve" || (!decision && route === "auto");
  if (landed && drawn) {
    const at = toMs(r.decided_at) ?? toMs(r.created_at);
    const pub = toMs(servedStamp && servedStamp.publishedAt);
    if (at != null && pub != null && at < pub) return "on the canvas";
  }
  if (DECIDED.has(decision)) return "decided";
  if (route === "incomplete") return "needs more";
  if (route === "owner") return `with ${ownerName}`;
  return "in";
}

export function tempoSlug(word) {
  const w = String(word || "");
  if (w === "decided") return "decided";
  if (w === "on the canvas") return "canvas";
  if (w === "needs more") return "needs";
  if (w.startsWith("with ")) return "with";
  return "in";
}

// chipOfTempo(word, decision?) -> the ONE state chip a tempo wears (design-law.json tempo.stages[].chip, QB74B1B7E; moved
// here from build.js, UI-B5a): with <owner> -> OPEN · in -> REVIEW · needs more -> gap · on the canvas -> LANDED · decided
// with an approve or a ruling -> LANDED · decided with a reject or needs-work (or no decision named) -> REVIEW. A reject
// is never green: only an approve or a ruling is binding.
const LANDS = new Set(["approve", "ruling"]);
// D1b item 14: route (optional) — a filing routed auto with no decision has LANDED (it filed at once and counts): it used to
// wear REVIEW ("in") until a served publish stamp, which a project kept in D1 never has, so it read REVIEW for ever
export function chipOfTempo(word, decision, route) {
  const w = String(word || "in");
  const d = String(decision || "").toLowerCase();
  if (w === "on the canvas") return "LANDED";
  if (LANDS.has(d)) return "LANDED";
  if (!d && String(route || "").toLowerCase() === "auto") return "LANDED";
  if (d === "reject" || d === "needs-work") return "REVIEW";
  if (w.startsWith("with ")) return "OPEN";
  if (w === "needs more") return "gap";
  return "REVIEW";
}
// the verdict word a REVIEW-decided chip carries beside it (a reject or a send-back says which)
const VERDICT = { reject: "rejected", "needs-work": "sent back for one more thing" };

// tempoChip(word, decision?, { verdict }) -> the chip, through ui.js stateChip (the ONE helper). Exactly one per item;
// the chip's text is the tempo word, its data-chip the state. A reject or needs-work adds its verdict word beside the
// chip (opts.verdict === false leaves it off for a caller that already prints the verdict, the ruling line).
export function tempoChip(word, decision, opts) {
  const w = String(word || "in");
  const d = String(decision || "").toLowerCase();
  const c = chipOfTempo(w, d, opts && opts.route);
  // D2b: a contribution filed straight through has LANDED: its chip says "landed", never "in"
  const chip = stateChip(c, c === "LANDED" && w === "in" ? "landed" : w);
  const v = VERDICT[d] && !(opts && opts.verdict === false) ? `<span class="tempo-verdict">${esc(VERDICT[d])}</span>` : "";
  return chip + v;
}

// routeWord(route, ownerName) — the reader's word for a ledger route (auto · owner · incomplete).
export function routeWord(route, ownerName) {
  const r = String(route || "").toLowerCase();
  if (r === "auto") return "filed";
  if (r === "owner") return `with ${ownerName || "the owner"}`;
  if (r === "incomplete") return "needs one more thing";
  return r || "—";
}

