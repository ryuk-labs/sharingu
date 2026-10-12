// tempo-selftest.mjs — the ratchet for the TEMPO WORDS (R-PRD-ONE-MIND WP2, M-ADR-041). tempoOf() is a pure
// derivation from a row's route/decision and the served stamp — this locks its five words (W8, B7b: "needs more"), the default owner
// name, the chip shape and the route words, so a route/stamp drift shows up here first. Modeled on
// tools/first5-selftest.mjs. Run in the gate.
import { tempoOf, tempoChip, chipOfTempo, tempoSlug, routeWord, TEMPO_WORDS } from "../src/tempo.js";

let fail = 0;
const eq = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail = 1; } };
const stamp = { publishedAt: "2026-09-08T00:00:00Z" };
const before = "2026-09-07T10:00:00Z", after = "2026-09-08T10:00:00Z";

eq(TEMPO_WORDS, ["in", "with", "decided", "on the canvas", "needs more"], "the five words, in order (needs more appended, W8)");

// 1. in — received, live: no route, or filed straight through but not drawn / not yet published
eq(tempoOf({}, stamp), "in", "an empty row is in");
eq(tempoOf({ route: "auto", created_at: before }, stamp), "in", "auto with nothing drawn is in (never on the canvas)");
eq(tempoOf({ route: "auto", created_at: after, components: "c/x" }, stamp), "in", "auto + drawn but AFTER the publish stamp is in");
eq(tempoOf({ route: "auto", created_at: before, components: "c/x" }, null), "in", "auto + drawn with no stamp is in (never invented)");
// W8 (B7b): an incomplete filing nobody has ruled wears "needs more" — never "in" (the walk read "in" as all-fine)
eq(tempoOf({ route: "incomplete", created_at: before, components: "c/x" }, stamp), "needs more", "an incomplete filing needs more");
eq(tempoOf({ route: "incomplete" }, stamp), "needs more", "incomplete with nothing drawn needs more");
eq(tempoOf({ route: "INCOMPLETE", status: "open" }, null), "needs more", "the route word is read case-blind, no stamp needed");
eq(tempoOf({ route: "incomplete", decision: "reject", decided_at: before }, stamp), "decided", "a ruled incomplete filing is decided (a ruling wins)");
eq(tempoOf({ route: "incomplete", decision: "approve", decided_at: before, components: "c/x" }, stamp), "on the canvas", "an approved, drawn incomplete filing before the publish is on the canvas");
eq(tempoOf({ kind: "loop", status: "open" }, stamp), "in", "an open item has in only");

// 2. with <owner> — route owner, no decision; the owner's name when known, "the owner" otherwise
eq(tempoOf({ route: "owner" }, stamp), "with the owner", "owner route, no decision, no name -> with the owner");
eq(tempoOf({ route: "owner" }, stamp, { ownerName: "Ryuk" }), "with Ryuk", "owner route carries the passed owner name");
eq(tempoOf({ route: "owner", components: "c/x", created_at: before }, stamp), "with the owner", "owner route + drawn is still with the owner until decided");

// 3. decided — approve / reject / needs-work; approve stays decided when not drawn or not yet published
eq(tempoOf({ route: "owner", decision: "reject", decided_at: before }, stamp), "decided", "reject is decided");
eq(tempoOf({ route: "owner", decision: "needs-work", decided_at: before }, stamp), "decided", "needs-work is decided");
eq(tempoOf({ route: "owner", decision: "approve", decided_at: before }, stamp), "decided", "approve with nothing drawn is decided, not on the canvas");
eq(tempoOf({ route: "owner", decision: "approve", decided_at: after, components: "c/x" }, stamp), "decided", "approve + drawn but decided AFTER the publish is decided");
eq(tempoOf({ route: "owner", decision: "approve", decided_at: before, components: "c/x" }, {}), "decided", "approve + drawn with no stamp is decided (never invented)");

// 4. on the canvas — approve (or auto) + drawn + landed before the served publish
eq(tempoOf({ route: "owner", decision: "approve", decided_at: before, components: "c/x" }, stamp), "on the canvas", "approve + components before the publish -> on the canvas");
eq(tempoOf({ route: "owner", decision: "approve", decided_at: before, screens: ["045"] }, stamp), "on the canvas", "screens count as drawn");
eq(tempoOf({ route: "auto", created_at: before, components: ["c/x"] }, stamp), "on the canvas", "auto + components before the publish -> on the canvas");
eq(tempoOf({ route: "owner", decision: "approve", created_at: before, components: "c/x" }, stamp), "on the canvas", "decided_at absent falls back to created_at");
eq(tempoOf({ route: "auto", created_at: before, components: "  " }, stamp), "in", "blank components are not drawn");

// the chip (UI-B5a, QB74B1B7E): ONE state chip through ui.js stateChip, counted by data-chip, never by a class name.
// The mapping is design-law tempo.stages[].chip: with -> OPEN · in -> REVIEW · needs more -> gap · on the canvas ->
// LANDED · decided+approve (or a ruling) -> LANDED · decided+reject / needs-work -> REVIEW with its verdict word.
const sc = (state, word) => `<span class="state-chip" data-chip="${state}">${word}</span>`;
eq(tempoChip("in"), sc("REVIEW", "in"), "chip: in -> REVIEW");
eq(tempoChip("with Ryuk"), sc("OPEN", "with Ryuk"), "chip: with <owner> -> OPEN");
eq(tempoChip("on the canvas"), sc("LANDED", "on the canvas"), "chip: on the canvas -> LANDED");
eq(tempoChip("with <x>"), sc("OPEN", "with &lt;x&gt;"), "chip escapes its word");
eq(tempoChip("needs more"), sc("gap", "needs more"), "chip: needs more -> gap (stone dashed, never red)");
eq(tempoChip("decided", "approve"), sc("LANDED", "decided"), "chip: decided + approve -> LANDED");
eq(tempoChip("decided", "ruling"), sc("LANDED", "decided"), "chip: decided + a ruling -> LANDED");
eq(tempoChip("decided", "reject"), sc("REVIEW", "decided") + '<span class="tempo-verdict">rejected</span>', "chip: decided + reject -> REVIEW with its verdict word (never green)");
eq(tempoChip("decided", "needs-work"), sc("REVIEW", "decided") + '<span class="tempo-verdict">sent back for one more thing</span>', "chip: decided + needs-work -> REVIEW with its verdict word");
eq(tempoChip("decided", "reject", { verdict: false }), sc("REVIEW", "decided"), "chip: the verdict word can be left to a caller that prints it");
eq(tempoChip("decided"), sc("REVIEW", "decided"), "chip: decided with no decision named is never green (REVIEW)");
eq(["in", "with the owner", "needs more", "on the canvas"].map((w) => chipOfTempo(w)), ["REVIEW", "OPEN", "gap", "LANDED"], "chipOfTempo: the four undecided stages");
eq(["approve", "ruling", "reject", "needs-work"].map((d) => chipOfTempo("decided", d)), ["LANDED", "LANDED", "REVIEW", "REVIEW"], "chipOfTempo: decided by its decision");
eq(["in", "with the owner", "decided", "on the canvas", "needs more"].map(tempoSlug), ["in", "with", "decided", "canvas", "needs"], "slugs");

// the reader's route words (WP1)
eq(["auto", "owner", "incomplete", "", "weird"].map((r) => routeWord(r)), ["filed", "with the owner", "needs one more thing", "—", "weird"], "route words");
eq(routeWord("owner", "Ryuk"), "with Ryuk", "route word carries the owner name");

console.log(fail ? "✗ tempo drift" : "✓ tempo: the five derivations, the default owner name, the chip and the route words hold");
process.exit(fail);
