// transmission-selftest.mjs — the ratchet for the gate-grade heuristic in src/transmission.js
// (the router's grading of a filed contribution into route auto · owner · incomplete, with
// reasons). Modeled on tools/tempo-selftest.mjs and tools/planned-selftest.mjs: a local ok()
// counter, computed totals, process.exit(1) with the failing labels on any fail. Fake
// verifyScreens/verifyComponents mirror the shapes core.js's fileTransmission actually passes
// (verifyScreens(raw) -> {list, valid, reserved, unknown, ok}; verifyComponents(list) ->
// {available, ok, list, unknown}) so this is a real exercise of the pure function, not a
// re-statement of its source. Run in the gate.
import { gateGrade, MIND_REFS, proofArtifact, gtmProofArtifact, completingExample, incompleteNote, counterTargetOf, FILING_COUNTER_CALL, RANK_KIND, ITEM_KIND, FILING_ITEM_CALL, itemKindOf, itemSlugOf, itemSourceOf } from "../src/transmission.js";

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } };

// ---- fake verifiers, shaped like core.js's real ones ---------------------------------------
// A small canon: screens 010/020 are valid, 090 is reserved, everything else unknown.
function verifyScreens(raw) {
  const list = String(raw || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const known = new Set(["010", "020"]);
  const reserved_ = new Set(["090"]);
  const valid = [], reserved = [], unknown = [];
  for (const s of list) {
    if (reserved_.has(s)) reserved.push(s);
    else if (known.has(s)) valid.push(s);
    else unknown.push(s);
  }
  return { list, valid, reserved, unknown, ok: list.length > 0 && unknown.length === 0 && reserved.length === 0 };
}
// A small ratified target: ai-gateway/policy-engine are known component ids.
function verifyComponents(list) {
  const known = new Set(["ai-gateway", "policy-engine"]);
  const unknown = list.filter((c) => !known.has(c) && !MIND_REFS.has(c));
  return { available: true, ok: unknown.length === 0, list, unknown };
}
// A registry the door never resolved (arch-grade not yet served) — componentKey stays
// "unavailable", never failed (core.js's own "absent = recorded, not failed" note).
function verifyComponentsUnavailable(list) {
  return { available: false, ok: false, list, unknown: [] };
}

const BASE = { lane: "code", what: "wire the thing", why: "it was missing", touches: "src/thing.js" };
const PROOF = "npm test — 12 passing, exit code 0";

// ---- 1 · binding — the three core fields ----------------------------------------------------
{
  const r = gateGrade({ lane: "code" }, verifyScreens, verifyComponents);
  ok(r.route === "incomplete", "no what/why/touches at all gates incomplete");
  ok(r.grade.binding === false, "binding false when the core fields are missing");
  ok(same(r.grade.missing, ["what", "why", "touches"]), "missing names all three absent fields");
}
{
  const r = gateGrade({ ...BASE, why: "" }, verifyScreens, verifyComponents);
  ok(r.route === "incomplete" && same(r.grade.missing, ["why"]), "one missing field is named alone");
}

// ---- 2 · a full code PR with components + artifact proof + a known screen routes auto -------
{
  const sub = { ...BASE, screens: "010", components: "ai-gateway", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "auto", `clean code PR (screen+components+proof) routes auto (got ${r.route}, reasons ${JSON.stringify(r.reasons)})`);
  ok(r.grade.joinKey === "ok", "a known screen resolves joinKey ok");
  ok(r.grade.componentKey === "ok", "a known component resolves componentKey ok");
  ok(r.grade.proof === "ok", "an artifact-grade proof resolves proof ok");
  ok(r.status === "routed", "status is routed");
  ok(same(r.grade.stages, ["received", "graded", "routed"]), "the stage record carries all three stages in order");
  ok(!!r.grade.stagedAt.received && !!r.grade.stagedAt.graded && !!r.grade.stagedAt.routed, "every stage carries a timestamp");
}

// ---- 3 · the one-pass fix 1: a code PR that says what it touches needs no components (absent is recorded, never a gate) ----
{
  const sub = { ...BASE, screens: "010", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "auto", `code PR with touches and no components routes auto (got ${r.route} ${JSON.stringify(r.reasons)})`);
  ok(r.grade.componentKey === "absent", "componentKey reads absent");
  ok(!r.reasons.includes("components-undeclared"), "no components-undeclared reason any more");
}
{
  // components alone say what it touches: no touches needed on the code lane
  const r = gateGrade({ lane: "code", what: "the importer", why: "brains become ops", components: "ai-gateway", proof: PROOF }, verifyScreens, verifyComponents);
  ok(r.route === "auto" && r.grade.binding === true, `code with components and no touches is binding and routes auto (got ${r.route} ${JSON.stringify(r.grade.missing)})`);
  const n = gateGrade({ lane: "code", what: "x", why: "y", proof: PROOF }, verifyScreens, verifyComponents);
  ok(n.route === "incomplete" && same(n.grade.missing, ["touches"]), "code with neither touches nor components needs touches");
  const lead = gateGrade({ lane: "leader", kind: "doc", what: "x", why: "y", components: "ai-gateway" }, verifyScreens, verifyComponents);
  ok(lead.route === "incomplete" && same(lead.grade.missing, ["touches"]), "outside code and design, components do not stand in for touches");
}
// ---- 4 · a narrated "trust me" proof reads not-artifact --------------------------------------
{
  const sub = { ...BASE, screens: "010", components: "ai-gateway", proof: "done it, works fine, trust me" };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "incomplete", "a narration proof gates incomplete");
  ok(r.grade.proof === "not-artifact", "proof reads not-artifact");
  ok(r.reasons.includes("proof-not-artifact"), "reasons name proof-not-artifact");
  ok(proofArtifact("done it, works fine") === false, "proofArtifact rejects a bare narration");
  ok(proofArtifact(PROOF) === true, "proofArtifact accepts a command + observed result");
}
{
  const sub = { ...BASE, screens: "010", components: "ai-gateway" };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "incomplete" && r.grade.proof === "missing", "no proof at all on a code lane gates incomplete, proof missing");
  ok(r.reasons.includes("unproven"), "reasons name unproven");
}

// ---- 5 · a leader `answer` on a q/ ref routes auto -------------------------------------------
{
  const sub = { lane: "leader", kind: "answer", what: "the answer", why: "asked", touches: "docs", gapRefs: "q/RR1" };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "auto", `a leader's own answer to a q/ ref auto-syncs (got ${r.route}, reasons ${JSON.stringify(r.reasons)})`);
  ok(!r.reasons.includes("answers-a-question"), "the leader-answer exception drops the answers-a-question reason");
}

// ---- 6 · a non-answer claim on a q/ ref routes owner, naming answers-a-question --------------
{
  const sub = { lane: "doc", kind: "note", what: "background for the question", why: "context", touches: "docs", gapRefs: "q/RR1" };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "owner", `a doc claiming a q/ ref (not a leader answer) routes owner (got ${r.route})`);
  ok(r.grade.ownerReasons.includes("answers-a-question"), "ownerReasons names answers-a-question");
}
{
  const sub = { lane: "code", ...BASE, screens: "010", components: "ai-gateway", proof: PROOF, gapRefs: "q/RR1" };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "owner", "a code PR claiming a q/ ref also routes owner, not auto");
  ok(r.grade.ownerReasons.includes("answers-a-question"), "…naming answers-a-question, not the leader exception");
}

// ---- 7 · a risk word in touches/what routes owner, naming risk-surface -----------------------
{
  const sub = { ...BASE, what: "wire the payment flow", screens: "010", components: "ai-gateway", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "owner", "a risk word in `what` (payment) routes owner");
  ok(r.grade.ownerReasons.includes("risk-surface"), "ownerReasons names risk-surface");
}
{
  const sub = { ...BASE, touches: "src/payout.js", screens: "010", components: "ai-gateway", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "owner" && r.grade.ownerReasons.includes("risk-surface"), "a risk word in `touches` also routes owner via risk-surface");
}
{
  const sub = { ...BASE, screens: "010", components: "ai-gateway", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(!r.grade.ownerReasons || !r.grade.ownerReasons.includes("risk-surface"), "no risk word in what/touches never fires risk-surface");
}

// ---- 8 · the one-pass fix 2: a screen not in the Map is a fix the sender makes (needs), never the owner's -------------
{
  const sub = { ...BASE, screens: "090", components: "ai-gateway", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.grade.joinKey === "unverified", "a screen the Map does not hold resolves joinKey unverified, not accepted on faith");
  ok(r.reasons.some((x) => x.startsWith("join-key-unverified:")), "reasons name join-key-unverified with the offending id");
  ok(r.route === "incomplete" && same(r.grade.missing, ["screens"]) && same(r.grade.screenUnknown, ["090"]), "it gates incomplete, missing [screens], naming the id");
  ok(!(r.grade.ownerReasons || []).includes("join-key-suspect"), "join-key-suspect is never raised");
  const t = gateGrade({ ...BASE, touches: ["screen:999"], components: "ai-gateway", proof: PROOF }, verifyScreens, verifyComponents);
  ok(t.route === "incomplete" && same(t.grade.missing, ["screens"]), "a screen: ref in touches is a screen it names, checked the same way");
}
{
  // the one-pass fix 1: work that changes no screen files at once with touches and proof
  const r = gateGrade({ ...BASE, touches: ["migrate-055", "table:k_questions"], proof: "sh tools/migrate-dryrun.sh --selftest -> exit 0, 8/8" }, verifyScreens, verifyComponents);
  ok(r.route === "auto" && r.grade.joinKey === "n/a", `a migration with touches and proof and no screen routes auto (got ${r.route} ${JSON.stringify(r.reasons)})`);
  const d = gateGrade({ lane: "design", kind: "screen", what: "the card", why: "y", touches: ["design/cards"] }, verifyScreens, verifyComponents);
  ok(d.route === "incomplete" && d.reasons.includes("no-screen-number") && same(d.grade.missing, ["screens"]), "a design of kind screen that names no screen needs screens");
  const dn = gateGrade({ lane: "design", kind: "brand", what: "the logo", why: "y", touches: ["brand/logo"] }, verifyScreens, verifyComponents);
  ok(dn.route === "auto", "a design that changes no screen files at once with what it touches");
}

// ---- 9 · MIND_REFS / the mind namespace verifies ok, no screen required ----------------------
{
  ok(MIND_REFS.has("mind/brain") && MIND_REFS.has("mind/worker") && MIND_REFS.has("mind/engines") && MIND_REFS.has("mind/ring"),
    "MIND_REFS carries the four R-infra areas");
  const sub = { ...BASE, components: "mind/worker", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.grade.componentKey === "ok", "an all-mind components list verifies ok against the ratified target's verifier");
  ok(r.grade.joinKey === "mind", "the mind join stands in for the screen requirement (joinKey 'mind')");
  ok(r.route === "auto", `a mind-namespace code PR (no screen, no product component) routes auto (got ${r.route})`);
}
// ---- 10 · a lane the registry does not know -----------------------------------------------
{
  const sub = { lane: "smoke-signal", what: "a lane R has never heard of", why: "it still files", touches: "x" };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.route === "auto", `an unrecognized lane still grades and routes (never blocks) — got ${r.route}`);
  ok(r.grade.binding === true, "binding is still true on an unknown lane with the three core fields present");
}

// ---- extra coverage: an unverified (declared but unknown) component, and unavailable target ---
{
  const sub = { ...BASE, screens: "010", components: "not-a-real-component", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.grade.componentKey === "unverified", "a declared-but-unknown component reads unverified");
  ok(r.grade.componentUnknown.includes("not-a-real-component"), "componentUnknown names the offending id");
  ok(r.route === "incomplete" && same(r.grade.missing, ["components"]) && !(r.grade.ownerReasons || []).length, "the one-pass fix 5: a component not in the Map needs a fix (incomplete, missing [components]), never the owner");
}
{
  const sub = { ...BASE, screens: "010", components: "ai-gateway", proof: PROOF };
  const r = gateGrade(sub, verifyScreens, verifyComponentsUnavailable);
  ok(r.grade.componentKey === "unavailable", "an unresolved arch-grade target reads componentKey unavailable, never failed");
  ok(r.route !== "incomplete", "unavailable never hard-fails the route (absent ≠ invalid)");
}
{
  const sub = { lane: "gtm", kind: "social", what: "posted the update", why: "goal-tree delivery", touches: "twitter", proof: "https://example.com/post/123" };
  const r = gateGrade(sub, verifyScreens, verifyComponents);
  ok(r.grade.proof === "ok" && r.route === "auto", "a gtm lane accepts a live link as proof and routes auto — no screen required");
  ok(gtmProofArtifact("https://example.com/x") === true && gtmProofArtifact("posted it, went well") === false,
    "gtmProofArtifact accepts a bare URL, rejects a narration");
}

// ---- UI-B3 (Q45D29B33): consent per occasion — a kind "grant" filing routes owner with asks-a-grant ----
{
  const ask = { lane: "leader", what: "run the release script once", why: "the fix is verified and needs the deploy key", touches: ["engine"] };
  const g = gateGrade({ ...ask, kind: "grant" }, verifyScreens, verifyComponents);
  const pr = gateGrade({ ...ask, kind: "pr" }, verifyScreens, verifyComponents);
  ok(g.route === "owner" && g.reasons.includes("asks-a-grant") && g.grade.ownerReasons.includes("asks-a-grant"), "a lane-leader kind grant routes owner, naming asks-a-grant");
  ok(pr.route === "auto" && !pr.reasons.includes("asks-a-grant"), "the same filing as kind pr routes auto with no asks-a-grant: the reason is keyed on the kind");
  ok(gateGrade({ ...ask, kind: "GRANT" }, verifyScreens, verifyComponents).reasons.includes("asks-a-grant"), "the kind is read case-insensitively, like every other kind");
  // UI-B3 picked the lane-leader ask: a code grant still meets the code lane's gates first (the gates are unchanged)
  const codeGrant = gateGrade({ ...BASE, kind: "grant" }, verifyScreens, verifyComponents);
  ok(codeGrant.route === "incomplete" && !codeGrant.reasons.includes("asks-a-grant"), "a code-lane grant with no screen or proof still meets its gates (incomplete), unchanged");
  ok(gateGrade({ lane: "leader", kind: "grant", what: "x", why: "y" }, verifyScreens, verifyComponents).route === "incomplete", "a grant still needs touches (only the plain note skips them)");
}

// ---- UI-B4a (QC8B94276 + QB953462F): kind "counter" — graded before the lane gates, routed owner, stands until ruled ----
{
  const drawn = { lane: "leader", kind: "counter", what: "a seat per project is not enough", why: "the owner keeps the org view" };
  const byParent = gateGrade({ ...drawn, parent: "T-20260928-001" }, verifyScreens, verifyComponents);
  const byQuestion = gateGrade({ ...drawn, gapRefs: ["q/Q0B546903"] }, verifyScreens, verifyComponents);
  const both = gateGrade({ ...drawn, parent: "T-20260928-001", gapRefs: "q/Q0B546903" }, verifyScreens, verifyComponents);
  ok(byParent.route === "owner" && same(byParent.grade.ownerReasons, ["counters-a-filing"]) && byParent.grade.binding === true, "a counter filed as drawn (parent, no touches) routes owner with counters-a-filing, binding");
  ok(byQuestion.route === "owner" && same(byQuestion.grade.ownerReasons, ["counters-a-question"]) && !byQuestion.reasons.includes("answers-a-question"), "a counter by gapRefs q/<qid> routes owner with counters-a-question, never answers-a-question");
  ok(same(both.grade.ownerReasons, ["counters-a-filing", "counters-a-question"]), "a counter naming both targets carries both reasons");
  const none = gateGrade(drawn, verifyScreens, verifyComponents);
  ok(none.route === "incomplete" && none.grade.binding === false && same(none.grade.missing, ["parent"]), "a counter with no target is incomplete, missing [parent]");
  const ex = completingExample("leader", none.grade.missing, "counter");
  ok(/^T-YYYYMMDD-NNN/.test(ex.parent) && ex.call === FILING_COUNTER_CALL && /parent \(the filing it counters\), gapRefs \["q\/<qid>"\] \(the question it counters\) or gapRefs \["goal\/<id>"\]/.test(incompleteNote("leader", none.grade.missing, "counter")),
    "its example carries parent and the drawn call, its note names all three target forms (parent, q/, goal/)");
  ok(same(gateGrade({ ...drawn, what: "" , parent: "T-1" }, verifyScreens, verifyComponents).grade.missing, ["what"]), "a counter still needs what and why (the three lines less touches)");
  // a counter disputes, it changes nothing: the lane's screen, proof and component gates do not apply
  const codeCounter = gateGrade({ lane: "code", kind: "counter", what: "x", why: "y", parent: "T-1" }, verifyScreens, verifyComponents);
  ok(codeCounter.route === "owner" && same(codeCounter.grade.ownerReasons, ["counters-a-filing"]), "a code-lane counter skips the screen, proof and component gates and routes owner");
  ok(gateGrade({ ...drawn, kind: "COUNTER", parent: "T-1" }, verifyScreens, verifyComponents).route === "owner", "the kind is read case-insensitively");
  // unchanged neighbours: a leader's answer on a q/ ref still auto-syncs; any other complete filing on a q/ ref still answers-a-question; a critique keeps its own route
  ok(gateGrade({ lane: "leader", kind: "answer", what: "x", why: "y", touches: ["t"], gapRefs: ["q/Q1"] }, verifyScreens, verifyComponents).route === "auto", "a leader's answer on a q/ ref still routes auto (leaderAnswer, unchanged)");
  const noteQ = gateGrade({ lane: "leader", kind: "note", what: "x", why: "y", gapRefs: ["q/Q1"] }, verifyScreens, verifyComponents);
  ok(noteQ.route === "owner" && noteQ.grade.ownerReasons.includes("answers-a-question") && !noteQ.grade.ownerReasons.includes("counters-a-question"), "a note on a q/ ref still answers-a-question (the counter reason is the counter's alone)");
  const crit = gateGrade({ lane: "leader", kind: "critique", what: "x", why: "y", touches: ["t"], parent: "T-1" }, verifyScreens, verifyComponents);
  ok(crit.route === "owner" && crit.grade.ownerReasons.includes("critique-ruling-territory") && !crit.grade.ownerReasons.includes("counters-a-filing"), "a critique keeps its own route and reason");
  ok(same(counterTargetOf({ parent: " T-2 ", gapRefs: "q/Q9, screen:010" }), { parent: "T-2", question: true, goal: null }) && same(counterTargetOf({}), { parent: null, question: false, goal: null }) &&
    same(counterTargetOf({ gapRefs: ["screen:010", " goal/engine "] }), { parent: null, question: false, goal: "engine" }) && same(counterTargetOf({ gapRefs: "goals/x, goal/, q-goal/x" }), { parent: null, question: false, goal: null }),
    "counterTargetOf reads the three target forms (goal/<id> by its id; goals/, a bare goal/ and a mid-string goal/ name nothing)");
  // UI-B6a (Q48115AD1): the third form, gapRefs goal/<id> -> counters-a-goal; a gapRef of none of the three is still no target
  const byGoal = gateGrade({ ...drawn, gapRefs: ["goal/engine"] }, verifyScreens, verifyComponents);
  ok(byGoal.route === "owner" && same(byGoal.grade.ownerReasons, ["counters-a-goal"]) && byGoal.grade.binding === true && !byGoal.reasons.includes("answers-a-question"), "a counter by gapRefs goal/<id> routes owner with counters-a-goal, binding");
  const stray = gateGrade({ ...drawn, gapRefs: ["screen:041"] }, verifyScreens, verifyComponents);
  ok(stray.route === "incomplete" && same(stray.grade.missing, ["parent"]), "a counter whose only gapRef is screen:041 is still incomplete, missing [parent]");
  ok(same(gateGrade({ ...drawn, parent: "T-1", gapRefs: ["q/Q1", "goal/engine"] }, verifyScreens, verifyComponents).grade.ownerReasons, ["counters-a-filing", "counters-a-question", "counters-a-goal"]), "a counter naming all three targets carries all three reasons");
}

// ---- UI-B4b (QEFC716D5): kind "rank" — a filing, graded before the lane gates, parent required, routed AUTO ----
{
  const press = { lane: "leader", kind: "rank", what: "Ranked first on Build: a filing", why: "a rank press", parent: "T-1" };
  const r = gateGrade(press, verifyScreens, verifyComponents);
  ok(RANK_KIND === "rank" && r.route === "auto" && r.grade.binding === true && r.reasons.includes("ranks-a-filing") && !(r.grade.ownerReasons || []).length,
    "a rank press (lane leader, kind rank, parent, no touches) routes auto with ranks-a-filing, binding, nobody's ruling");
  const noParent = gateGrade({ ...press, parent: "" }, verifyScreens, verifyComponents);
  ok(noParent.route === "incomplete" && noParent.grade.binding === false && same(noParent.grade.missing, ["parent"]), "a rank with no parent is incomplete, missing [parent]");
  ok(same(gateGrade({ ...press, why: "" }, verifyScreens, verifyComponents).grade.missing, ["why"]), "a rank still needs what and why");
  // a rank never trips the counter branch (which routes to the owner), nor a risk word, nor the code lane's gates
  const risky = gateGrade({ ...press, what: "Ranked first on Build: the payment page" }, verifyScreens, verifyComponents);
  ok(risky.route === "auto" && !risky.reasons.includes("risk-surface") && !risky.reasons.includes("counters-a-filing"), "a rank whose title names a risk word still routes auto (it changes nothing)");
  const codeRank = gateGrade({ ...press, lane: "code" }, verifyScreens, verifyComponents);
  ok(codeRank.route === "auto" && !codeRank.reasons.includes("no-screen-number"), "a code-lane rank skips the screen, proof and component gates");
  ok(gateGrade({ ...press, kind: "RANK" }, verifyScreens, verifyComponents).route === "auto", "the kind is read case-insensitively");
  ok(gateGrade({ ...press, kind: "counter" }, verifyScreens, verifyComponents).route === "owner", "a counter with the same body still routes owner (the two kinds stay apart)");
}

// ---- UI-B11a (Q2485A7FD): kind "item" — the draft of a skill, an agent or a workflow, graded before the lane gates ----
{
  const draft = { lane: "leader", kind: "item", what: "release-notes", why: "drafts release notes", touches: "skill", gapRefs: ["item/release-notes"], proof: "https://src.example/rn" };
  const g = (o) => gateGrade({ ...draft, ...o }, verifyScreens, verifyComponents);
  ok(ITEM_KIND === "item" && g({}).route === "auto" && g({}).grade.binding === true && g({}).reasons.includes("files-an-item"), "a complete item (what, why, one kind, item/<slug>, a source link) routes auto with files-an-item");
  ok(g({ proof: "/artifact/A-1" }).route === "auto" && g({ touches: ["workflow"] }).route === "auto", "an /artifact/<id> source and touches as a list both complete it");
  ok(same(g({ proof: undefined }).grade.missing, ["proof"]) && g({ proof: undefined }).route === "incomplete", "no source is incomplete, missing [proof]");
  ok(same(g({ proof: "npm test -> exit 0, 12 passing" }).grade.missing, ["proof"]), "the code lane's proof shape is no source for an item");
  ok(same(g({ touches: "skill,agent" }).grade.missing, ["touches"]) && same(g({ touches: "engine" }).grade.missing, ["touches"]), "touches must name exactly one of skill, agent or workflow");
  ok(same(g({ gapRefs: ["item/X"] }).grade.missing, ["gapRefs"]) && same(g({ gapRefs: ["item/a", "item/b"] }).grade.missing, ["gapRefs"]) && same(g({ gapRefs: ["q/Q1"] }).grade.missing, ["gapRefs"]), "gapRefs must name exactly one item/<slug> with slug [a-z0-9-]{2,40}");
  ok(g({ what: "the payment page kit" }).route === "auto", "an item whose name carries a risk word still routes auto (a draft is nobody's ruling)");
  ok(itemKindOf("Agent") === "agent" && itemSlugOf("item/ok-2,screen:041") === "ok-2" && itemSourceOf("javascript:alert(1)") === null && itemSourceOf(" https://x.example/a ") === "https://x.example/a", "the three item readers: the kind, the one slug, a source link only when http(s) or /artifact/");
  const ex = completingExample("leader", ["proof"], "item");
  ok(ex.call === FILING_ITEM_CALL && !/npm test/.test(ex.proof) && /kind: "item"/.test(FILING_ITEM_CALL) && /item\/<slug>/.test(FILING_ITEM_CALL) && incompleteNote("leader", ["proof"], "item").includes(FILING_ITEM_CALL), "an incomplete item's example and note carry FILING_ITEM_CALL, never the code lane's proof");
  ok(gateGrade({ lane: "leader", kind: "publish", what: "p", why: "w" }, verifyScreens, verifyComponents).route === "auto" && gateGrade({ lane: "leader", kind: "equip", what: "e", why: "w" }, verifyScreens, verifyComponents).reasons.includes("equips-an-item"), "the seam's publish and equip rows route auto (core.js refuses both kinds on every other door)");
}

// ---- the one-pass fix 2: depends resolve too ---------------------------------------------------------------------------
{
  const vd = (list) => { const unknown = list.filter((d) => !["q/Q1", "goal/engine", "screen:010"].includes(d) && !/^T-/.test(d)); return { ok: !unknown.length, unknown }; };
  const r = gateGrade({ ...BASE, proof: PROOF, depends: ["q/Q1", "T-20261001-001", "q/NOPE"] }, verifyScreens, verifyComponents, vd);
  ok(r.route === "incomplete" && same(r.grade.missing, ["depends"]) && same(r.grade.dependsUnknown, ["q/NOPE"]), "a depends that names nothing in the project needs a fix, naming it");
  ok(gateGrade({ ...BASE, proof: PROOF, depends: ["q/Q1", "goal/engine"] }, verifyScreens, verifyComponents, vd).route === "auto", "depends that resolve file at once");
}

// ---- THE ROUTE TABLE (the one-pass fix: report it before and after; each row proved here) -----------------------------------
// [label, body, route after, the reason or missing it carries, route before]
const P2 = "sh tools/smoke.sh -> exit 0, 93 passing";
const ROUTES = [
  ["code: touches + screen in the Map + stated proof", { ...BASE, screens: "010", proof: "smoke 93/93, gate exit 0" }, "auto", null, "incomplete (components undeclared; the proof had no command)"],
  ["code: touches, no screen, proof (a migration)", { ...BASE, proof: P2 }, "auto", null, "incomplete (no screen number)"],
  ["code: components only, no touches", { lane: "code", what: "w", why: "y", components: "ai-gateway", proof: P2 }, "auto", null, "incomplete (touches; no screen)"],
  ["code: a screen NOT in the Map", { ...BASE, screens: "777", proof: P2 }, "incomplete", "screens", "owner (join-key-suspect)"],
  ["code: a component NOT in the Map", { ...BASE, components: "made-up", proof: P2 }, "incomplete", "components", "owner (component-key-suspect)"],
  ["code: proof 'none'", { ...BASE, proof: "none" }, "incomplete", "proof", "incomplete (a narration)"],
  ["code: proof a narration", { ...BASE, proof: "works fine" }, "incomplete", "proof", "incomplete"],
  ["code: no proof", { ...BASE }, "incomplete", "proof", "incomplete"],
  ["code: a risk word (payment)", { ...BASE, what: "the payment flow", proof: P2 }, "owner", "risk-surface", "owner (once it had a screen and components)"],
  ["code: answers a question (q/ gapRef)", { ...BASE, proof: P2, gapRefs: "q/Q1" }, "owner", "answers-a-question", "owner"],
  ["vendor lane", { lane: "vendor", what: "w", why: "y", touches: "svc" }, "owner", "lane:vendor", "owner"],
  ["leader: a plan naming a goal", { lane: "leader", kind: "doc", what: "w", why: "y", touches: "docs/plan", goalRef: "g" }, "auto", null, "auto"],
  ["leader: a plain note", { lane: "leader", kind: "note", what: "w", why: "y" }, "auto", null, "auto"],
  ["leader: a critique", { lane: "leader", kind: "critique", what: "w", why: "y", touches: "t" }, "owner", "critique-ruling-territory", "owner"],
  ["leader: a grant", { lane: "leader", kind: "grant", what: "w", why: "y", touches: "t" }, "owner", "asks-a-grant", "owner"],
  ["leader: consent named", { lane: "leader", kind: "note", what: "consent copy", why: "y" }, "owner", "risk-surface", "owner"],
  ["gtm: a link", { lane: "gtm", kind: "social", what: "w", why: "y", touches: "x", proof: "https://example.com/p" }, "auto", null, "auto"],
  ["gtm: a bare count", { lane: "gtm", kind: "social", what: "w", why: "y", touches: "x", proof: "40 replies" }, "incomplete", "proof", "incomplete"],
  ["design: kind screen with no screen", { lane: "design", kind: "screen", what: "w", why: "y", touches: "t" }, "incomplete", "screens", "incomplete"],
  ["any: no what or why", { lane: "code", touches: "t" }, "incomplete", "what", "incomplete"],
  ["counter", { lane: "leader", kind: "counter", what: "w", why: "y", parent: "T-1" }, "owner", "counters-a-filing", "owner"],
  ["mind namespace", { ...BASE, components: "mind/worker", proof: P2 }, "auto", null, "auto"],
];
for (const [label, body, route, mark] of ROUTES) {
  const r = gateGrade(body, verifyScreens, verifyComponents);
  const carries = mark == null || (r.grade.missing || []).includes(mark) || (r.reasons || []).includes(mark) || (r.grade.ownerReasons || []).includes(mark);
  ok(r.route === route && carries, `route table: ${label} -> ${route}${mark ? ` (${mark})` : ""} (got ${r.route} ${JSON.stringify(r.grade.missing || r.reasons)})`);
}
// the money / payments / consent rule stands: a sensitive area waits for the owner however complete the rest is
for (const w of ["money", "pricing", "payment", "payout", "clinical", "consent", "rls"]) {
  ok(gateGrade({ ...BASE, what: `touches the ${w} flow`, proof: P2 }, verifyScreens, verifyComponents).route === "owner", `a contribution naming ${w} still waits for the owner`);
}
export { ROUTES };

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log(`transmission selftest: ${checks - failed}/${checks} passed`);
if (failed) process.exit(1);
