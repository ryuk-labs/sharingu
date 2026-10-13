// transmission.js — the gate-grade (ADR-062 · ADR-063). Pure and testable.
//
// A submission carries the transmission envelope (what · why · touches, + lane extras).
// R checks it AT THE DOOR and returns a route — it never judges craft or visual quality:
//   incomplete — missing envelope fields / no screen number where required / (code) no proof.
//                Lands NOT BINDING, failing rows named once. R never blocks (pr-transmission-spec §1).
//   owner      — complete, but touches ruled truth · money · clinical · vendor · a suspect join key,
//                or a conflict the brain flagged. One MCQ into Ryuk's owner-check queue.
//   auto       — complete · maps cleanly to canon · no conflict · low-risk. Lands, engines run.
//
// verifyScreens is injected (from index.js) so this module stays decoupled from the register.
//
// The gtm lane (M-ADR-020 G2, the Goals Engine): kind vocabulary is social · outreach ·
// update · content · campaign — descriptive, like every other lane's kind (pr/screen/doc/
// critique/…); R never gates ON kind, only records it, so an unrecognized kind still files
// (R3, never blocks). What IS gated: proof (below) and the join key (screen requirement is
// NOT applied to gtm — a social post has no canon screen to bind to).

import { isMindRef, hasQuestionRef } from "./refs.js";

const RISKY = /\b(money|price|pricing|payment|payout|clinical|prescription|\brx\b|consent|rls|cross-tenant)\b/i;

// THE MIND NAMESPACE (owner ruling 2026-08-31): R's own code declares mind/* — valid at
// the gate, disjoint from the product target, NEVER counted in ARCH.
export const MIND_REFS = new Set(["mind/brain", "mind/worker", "mind/engines", "mind/ring"]);

// THE PROOF RULE (owner ruling 2026-10-01: "proof is a stated result with its numbers, a command with its result, or a
// link: only narration is refused"). Rewritten in D2b from the corpus of every proof the real runs filed or had refused
// (tools/fixtures/proof-corpus.json: the fills, the grading runs, the ship candidate, the commit bodies; it refused TRUE
// proof three times as a list of patterns). The rule now asks ONE question: is anything OBSERVED in it? proofKind(p) is the
// one pure function; tools/proof-selftest.mjs holds it to the whole corpus (each must pass) and to a list of narrations.
//   link      an http(s) link (the PR, the run, the post)
//   artifact  an artifact you banked: /artifact/<id>
//   command   a command or a tool call AND what came back ("sh tools/smoke.sh -> exit 0, 93 passing", "read {…} -> status
//             \"done\"", "$ git log | wc -l" then its output on the next line)
//   result    an observed outcome, no command needed: a count of a count ("93/93", "4 of 11"), an exit code or a status
//             ("gate exit 0", "HTTP 200"), a number with what it counts as a result ("1,316 rows", "0 hits", "73 steps
//             green", "2 linked checks … graded proven"), a comparison ("stored == built"), or a named file or record with
//             what it shows ("docs/plan/HANDOFF.md states: siru reads 4 of 11")
//   null      a bare claim with nothing observed in it ("works fine", "tested it", "done", "looks good", "verified", "the
//             suites are green"), a bare command with nothing after it ("npm test"), or a word that says there is none
//             ("none", "n/a": proofOf reads those as no proof at all)
// Deterministic, no model. Dates, clock times, versions and commit hashes are stripped first: they are not outcomes.
// copy: off-screen (the door's refusal hint and formats' field hint)
export const PROOF_RULE = "proof is what you observed: a result with its number, a command or tool call with what came back, a link, or a named file or artifact with what it shows; a bare claim with nothing observed in it is narration";
// copy: off-screen (the door's refusal hint)
const PROOF_EXAMPLES = '"smoke 93/93, gate exit 0" (a result), "sh tools/smoke.sh -> exit 0, 93 passing" (a command and what it printed), "read {kind: goal, ref: beta} -> status done, 3 of 4" (a tool call and its answer), "https://github.com/acme/app/pull/12" (a link), "docs/plan/HANDOFF.md states: siru reads 4 of 11" (a named file and what it shows), "/artifact/<id>" (an artifact you banked); a narration ("works fine", "tested it") is refused';
const PROOF_CMD = /(?:^|[\s(`"'])(?:npm|npx|pnpm|yarn|pytest|python3?|node|deno|bun|sh|bash|zsh|go test|cargo|curl|make|flutter|dart|mvn|gradle|wrangler|git|grep|rg|wc|cat|ls|find|jq|sqlite3|docker|kubectl|psql|echo|diff|tail|head)\s+\S/i;
const PROOF_LINK = /https?:\/\/[^\s)>\]"']+/i;
const PROOF_ARTIFACT = /(?:^|[\s("'])\/artifact\/[A-Za-z0-9][A-Za-z0-9._-]*/;
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// what a run says came out: test verdicts, write results, search results, a grade's verdict
const VERDICT = "passing|passed|passes|pass|green|ok|failing|failed|fails|fail|errors?|warnings?|filed|applied|landed|valid|invalid|clean|succeeded|exit|proven|refused|hits?|matches|matched|found|written|changed|unchanged|replayed|stored|returned|served|read|true|false";
// a number with what it measures or counts, as an outcome
// (a COUNT of things done — checks, tests, steps, items — is an outcome only with its verdict: "12 tests passed")
const UNIT = String.raw`(?:rows?|ms|s|sec|secs|seconds|KB|kB|MB|GB|bytes|%|lines?|files?\s+changed|insertions?|deletions?|hits?|matches|errors?|warnings?|passing|failing|failures?|orphans)`;
const PROOF_RESULTS = [
  new RegExp(String.raw`\b${NUM}\s*\/\s*${NUM}\b`),                                       // 93/93 · 52/0
  new RegExp(String.raw`\b${NUM}\s+of\s+${NUM}\b`, "i"),                                   // 5 of 5 · 4 of 11
  /\bexit(?:\s*code)?\s*[:=]?\s*\d+\b/i,                                                   // exit 0 · exit code: 0
  /\b(?:HTTP|status)\s*[:=]?\s*[1-5]\d\d\b/i,                                              // HTTP 200 · status 401
  new RegExp(String.raw`\b${NUM}(?:[\s,;:()\[\]-]+[A-Za-z][\w.()'-]*){0,6}?[\s,;:()-]+(?:${VERDICT})\b`, "i"),   // 73 steps green · 2 linked check(s) … graded proven
  new RegExp(String.raw`\b(?:passed|failed|errors?|warnings?|hits|matches|exit)\s*[:=]?\s*${NUM}\b`, "i"),        // passed 5 · errors: 0
  new RegExp(String.raw`\b${NUM}\s*[kKM]?\s*${UNIT}(?![\w])`, "i"),                        // 1,316 rows · ~15.6k rows · 40 ms · 0 hits
  /(?:✓|✔|✅)\s*\d/,                                                                      // ✓ 12
  /\b[\w.-]+\s*(?:==|!=)\s*[\w.-]+/,                                                       // stored == built
  // a named record and the verdict it carries: "RLC.Q01604FFE … graded proven", "T-20261002-179 reads LANDED"
  /(?=.*\b(?:[A-Z][A-Za-z]*\.[A-Za-z][\w.-]*\d[\w.-]*|[A-Z]{1,3}-\d{6,}[\w-]*|[A-Z]{1,3}-[a-f0-9]{8,})).*\b(?:proven|refused|incomplete|LANDED|passing|failing|stale)\b/,
];
const CONFIDENCE = /\b\d+\s*%\s*(?:sure|certain|confident|positive|done|complete|working|fine)\b|\b(?:works|done|fine|working)\s+\d+\s*%/gi;   // "100% sure" is a feeling, not a measure
// what is not an outcome: dates, clock times, versions, commit hashes
const NOT_OUTCOME = [
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  /\bv\d+(?:\.\d+)*\b/gi,
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g,
];
const stripped = (s) => NOT_OUTCOME.reduce((t, re) => t.replace(re, " "), s);
// a command or a call on the left of an arrow: a known runner, a program word with a flag / path / pipe / "=", a "$ "
// prompt, an MCP tool call (`name {…}`, `tools/list`), a path or file it read, or an HTTP request (`GET /path`)
const ARROW = /\s*(?:->|→|=>|⇒)\s*/g;
const CMD_SHAPE = /(?:^|\s)\$?\s*[a-z][\w.+-]*(?:\s+\S+)*?\s+(?:--?[A-Za-z]|[\w.~-]*\/[\w./~-]*|\||\S+=)/;
const CALL_SHAPE = /(?:^|[\s(`])(?:[a-z][a-z0-9_]*\s*\{|[a-z][a-z0-9_]*\(|(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+\/|\$\s+\S|[a-z][\w.-]*\/[\w./-]+)/;
// what came back: a number, a quoted answer, JSON, a dotted or snake_case key, a status word, an UPPER_CASE code
const CAME_BACK = /\d|["'“”`{\[]|\b[a-z]+(?:[._][a-z0-9]+)+\b|\b(?:ok|OK|true|false|null|empty|nothing|none)\b|\b[A-Z][A-Z_]{2,}\b/;
function calledWithAnswer(raw) {
  // "$ cmd" then its output on the next line(s)
  const shell = /(?:^|\n)\$\s+([^\n]+)\n([^\n$][^\n]*\S[^\n]*)/.exec(raw);
  if (shell && /^[a-z][\w.+-]*/.test(shell[1].trim()) && CAME_BACK.test(shell[2])) return true;
  const flat = stripped(raw.replace(/\s+/g, " "));
  for (const m of flat.matchAll(ARROW)) {
    // the call: back to the sentence's start (a ". " or the text's start; a "; " is part of a shell line)
    const before = flat.slice(0, m.index), cut = Math.max(before.lastIndexOf(". "), -1);
    const call = before.slice(cut + 1);
    // what came back: up to the next "; " or ". "
    const after = flat.slice(m.index + m[0].length).split(/;\s|\.\s/)[0];
    if ((CALL_SHAPE.test(call) || CMD_SHAPE.test(call) || PROOF_CMD.test(call)) && CAME_BACK.test(after)) return true;
  }
  return false;
}
// a tool or a check named, then the number it reported (L4: "the copy check lists 393 strings on the revision's pages" was
// refused while the same fact in the commit's own words passed): a count a named tool gave back is observed. The number must
// be there: "the copy check lists the strings" and "the smoke reports success" stay narration.
const TOOL_NAMED = String.raw`(?:check|checker|smoke|gate|audit|selftest|self-test|suite|probe|scan|scanner|lint|linter|tests?|walk|budget|importer|grader|census|rehearsal|[\w-]+\.(?:mjs|js|py|sh))`;
const TOOL_REPORTED = new RegExp(String.raw`\b${TOOL_NAMED}\s+(?:[a-z]+\s+)?(?:lists?|listed|counts?|counted|reports?|reported|finds?|found|flags?|flagged|measures?|measured|reads?|shows?|showed|prints?|printed|gives?|gave|returns?|returned|says|said|names?|named|records?|recorded)\s+(?:[\w,'-]+\s+){0,3}?${NUM}\b`, "i");
// a named file or record, then what it shows: "contracts/door.json carries POST /broadcast/publish", "HANDOFF.md in this
// commit states: …", "T-20261002-179 reads LANDED". A pointer with nothing it shows ("see docs/plan/SPRINTS.md") is not.
const NAMED = String.raw`(?:[\w.-]+\/[\w./-]*[\w-]|[\w-]+\.(?:md|json|jsonl|js|mjs|ts|sql|sh|py|txt|log|png|webp|html|csv|ya?ml|toml)|\b[A-Z]{1,3}-[A-Za-z0-9-]{3,})`;
const SHOWS = new RegExp(String.raw`${NAMED}(?:[\s,()]+[\w.,:-]+){0,6}?[\s,()]+(?:states?|shows?|reads?|says|carries|holds|lists|contains|prints|records|answers|returns|gives)\b[\s:]+\S+\s+\S+`);
// the words that say a field holds no proof at all: proofOf reads them as no proof (the reason "it carries no proof")
const NO_PROOF = /^(?:none|n\/?a|na|-+|tbd|todo|null|nil|no proof)\.?$/i;
export function proofKind(p) {
  const raw = String(p ?? "").trim();
  const s = raw.replace(/\s+/g, " ");
  if (!s || NO_PROOF.test(s)) return null;
  if (PROOF_LINK.test(s)) return "link";
  if (PROOF_ARTIFACT.test(s)) return "artifact";
  if (calledWithAnswer(raw)) return "command";
  const t = stripped(s).replace(CONFIDENCE, " ");
  if (PROOF_RESULTS.some((re) => re.test(t))) return PROOF_CMD.test(" " + t) ? "command" : "result";
  if (SHOWS.test(s)) return "result";
  if (TOOL_REPORTED.test(t)) return "result";
  return null;
}
// proofOf(p) -> "missing" (nothing, or a word saying none) | "ok" | "not-artifact" (a narration): the gate's reading
export function proofOf(p) {
  const s = String(p ?? "").trim();
  if (!s || NO_PROOF.test(s)) return "missing";
  return proofKind(s) ? "ok" : "not-artifact";
}
// the refusal's hint: the rule in one sentence, then one accepted form of each kind (the code lane; the GTM lane says its own)
export const PROOF_FORMS = `${PROOF_RULE}, e.g. ${PROOF_EXAMPLES}`;
// copy: off-screen (the door's refusal hint)
export const GTM_PROOF_FORMS = 'the shipped link ("https://example.com/the-post") or an artifact you banked ("/artifact/<id>"); a narration ("posted it, went well") is not proof';
// kept for callers: true when the proof is accepted (any kind)
export function proofArtifact(p) { return proofKind(p) !== null; }

// GTM proof (M-ADR-020 G2, the Goals Engine): the shipped thing itself, a live link or a banked artifact, or an automated
// tool's own run (a command with what it printed). A stated count alone ("40 replies") is the `actual` outcome, not proof of
// delivery, so the GTM lane does not take the bare result form. A narration ("posted it, went well") gates incomplete.
export function gtmProofArtifact(p) {
  const k = proofKind(p);
  return k === "link" || k === "artifact" || k === "command";
}

// gateGrade(sub, verifyScreens, verifyComponents)
// verifyComponents (ADR-068 §4 · ADR-071) is injected like verifyScreens: raw -> {list,
// unknown, ok, available}. Checks declared component touches against the RATIFIED target
// (arch-grade component ids, ADR-070) — a declared-but-unknown component is suspect the
// same way a fabricated screen number is. Optional during adoption: absent = recorded,
// not failed; the hard requirement flips by a later ruling.
export function gateGrade(sub, verifyScreens, verifyComponents, verifyDepends) {
  // HONEST STATUSES (WP9 data, PRD one-mind 2026-09-09 · E259a). The schema declares four
  // statuses — received | graded | routed | closed — but the door only ever WROTE two
  // (routed at filing, closed at decide): a row was born "routed" and the first two states
  // were never on the record. They are real states — the envelope is received before the
  // grade exists, graded before the route is decided — they just happen inside ONE
  // synchronous call, so writing them as separate UPDATEs would cost two D1 writes per
  // filing (the read budget scar, M-ADR-032) and change nothing observable. Instead the
  // ONE insert carries the passage: `status` stays the final value ("routed"), and the
  // grade JSON records `stages` (the names, in order) + `stagedAt` (a timestamp per stage)
  // so the audit can prove received → graded → routed from the row alone. The decide path
  // (core.js decideTransmission) appends "closed" the same way — see the WP9 wiring note.
  // Placed FIRST in the object so the grade column's 4000-char cap can never cut them off.
  const receivedAt = new Date().toISOString();
  const r = gradeAndRoute(sub, verifyScreens, verifyComponents, verifyDepends);
  const gradedAt = new Date().toISOString();            // the grade exists from here
  const routedAt = gradedAt;                            // the route is decided in the same call today
  r.grade = { stages: ["received", "graded", "routed"],
              stagedAt: { received: receivedAt, graded: gradedAt, routed: routedAt },
              ...r.grade };
  return r;
}

// gradeAndRoute — the pure grade + route (was the body of gateGrade; gateGrade above only
// adds the stage record). Every return here is {grade, route, status:"routed", reasons}.
function gradeAndRoute(sub, verifyScreens, verifyComponents, verifyDepends) {
  const reasons = [];
  const lane = String(sub.lane || "").toLowerCase();
  const what = (sub.what ?? "").toString().trim();
  const why = (sub.why ?? "").toString().trim();
  const touches = Array.isArray(sub.touches)
    ? sub.touches.map((t) => String(t).trim()).filter(Boolean)
    : String(sub.touches || "").split(",").map((s) => s.trim()).filter(Boolean);

  // 0 · a counter (UI-B4a C3/C4; QC8B94276 a counter is a filing, QB953462F it names a filing by parent and a question
  // by gapRefs q/<qid>; UI-B6a Q48115AD1 it names a goal node by gapRefs goal/<id>). Graded BEFORE the lane gates,
  // because a counter disputes and changes nothing: it needs what, why and a TARGET (parent, a q/ gapRef or a goal/
  // gapRef); touches are optional, as for the plain note; the lane's screen, proof and component gates do not apply. No
  // target (a gapRef of none of the three forms is no target) is incomplete with missing ["parent"] (the reply's example
  // and note carry the drawn call). A complete counter always routes to the owner and stands until it is ruled:
  // counters-a-filing (parent), counters-a-question (q/) and/or counters-a-goal (goal/); the question reason replaces
  // answers-a-question for this kind.
  const kind0 = String(sub.kind || "").toLowerCase();
  if (kind0 === COUNTER_KIND) {
    const target = counterTargetOf(sub);
    const cMissing = [!what && "what", !why && "why", !target.parent && !target.question && !target.goal && "parent"].filter(Boolean);
    if (cMissing.length) {
      reasons.push("missing:" + cMissing.join("+"));
      return { grade: { binding: false, missing: cMissing }, route: "incomplete", status: "routed", reasons };
    }
    const ownerReasons = [...(target.parent ? ["counters-a-filing"] : []), ...(target.question ? ["counters-a-question"] : []), ...(target.goal ? ["counters-a-goal"] : [])];
    reasons.push(...ownerReasons);
    return { grade: { binding: true, joinKey: "n/a", proof: "n/a", componentKey: "n/a", ownerReasons }, route: "owner", status: "routed", reasons };
  }

  // 0b · a rank (UI-B4b, QEFC716D5): any seated reader presses Rank on Build and files ONE filing, lane leader, kind rank,
  // parent <the ranked filing>. It orders the project's shared list (the newest press first) and changes nothing else, so
  // it is graded here, before the lane gates, like a counter: what, why and its target (parent, required; touches
  // optional). No target is incomplete with missing ["parent"]. A complete rank routes AUTO: it is nobody's ruling to make
  // (QA20249FB: rank is a person verb, not an owner one) and it never trips the counter branch above. An unknown parent
  // is refused before this runs (core.js fileTransmission: 422 unknown_parent, nothing filed).
  if (kind0 === RANK_KIND) {
    const parent = sub.parent != null && String(sub.parent).trim() !== "" ? String(sub.parent).trim() : null;
    const rMissing = [!what && "what", !why && "why", !parent && "parent"].filter(Boolean);
    if (rMissing.length) {
      reasons.push("missing:" + rMissing.join("+"));
      return { grade: { binding: false, missing: rMissing }, route: "incomplete", status: "routed", reasons };
    }
    reasons.push("ranks-a-filing");
    return { grade: { binding: true, joinKey: "n/a", proof: "n/a", componentKey: "n/a" }, route: "auto", status: "routed", reasons };
  }

  // 0c · a restore (UI-B5b, Q859A8F0A): the owner presses Restore on a version and files ONE filing, lane leader, kind
  // restore, gapRefs ["v/<key>"]; the door decides it approve at once (src/versionsview.js fileRestore). It asks the
  // brain's next close to publish that version's content again (the worker never writes R2), so it is graded here, before
  // the lane gates, like a counter or a rank: what, why and its target (a v/ gapRef; touches optional). No target is
  // incomplete with missing ["gapRefs"]. A complete restore routes to the OWNER: it is the owner's verb alone, and a
  // plain file with kind restore from anyone else waits for the owner like any ruling-territory filing.
  if (kind0 === RESTORE_KIND) {
    const target = restoreTargetOf(sub);
    const sMissing = [!what && "what", !why && "why", !target && "gapRefs"].filter(Boolean);
    if (sMissing.length) {
      reasons.push("missing:" + sMissing.join("+"));
      return { grade: { binding: false, missing: sMissing }, route: "incomplete", status: "routed", reasons };
    }
    reasons.push("restores-a-version");
    return { grade: { binding: true, joinKey: "n/a", proof: "n/a", componentKey: "n/a", ownerReasons: ["restores-a-version"] }, route: "owner", status: "routed", reasons };
  }

  // 0d · an item (UI-B11a, Q2485A7FD): a person's own Claude files the draft of a skill, an agent or a workflow for the org's
  // Broadcast shelf with file (FILING_ITEM_CALL). Graded here, before the lane gates, like a counter: what,
  // why, touches naming exactly one of the three kinds, gapRefs naming exactly one item/<slug> (slug [a-z0-9-]{2,40}) and
  // proof, a link to its source (http(s)) or an /artifact/:id. Complete routes AUTO (a draft is nobody's ruling to make:
  // publishing it is its author's own press on Broadcast, src/broadcast.js); anything short is incomplete with missing.
  if (kind0 === ITEM_KIND) {
    const iMissing = [!what && "what", !why && "why", !itemKindOf(touches) && "touches", !itemSlugOf(sub.gapRefs ?? sub.gaprefs) && "gapRefs",
      !itemSourceOf(sub.proof) && "proof"].filter(Boolean);
    if (iMissing.length) {
      reasons.push("missing:" + iMissing.join("+"));
      return { grade: { binding: false, missing: iMissing }, route: "incomplete", status: "routed", reasons };
    }
    reasons.push("files-an-item");
    return { grade: { binding: true, joinKey: "n/a", proof: "source", componentKey: "n/a" }, route: "auto", status: "routed", reasons };
  }

  // 0e · a publish or an equip (UI-B11a, Q0E5A1073 · Q571B3D89): RESERVED kinds, written only by src/broadcast.js, the seam
  // behind a person's own press on Broadcast (core.js fileTransmission refuses them 422 reserved_kind on every other door).
  // The seam has checked the item, the version and the seat before it files, so the press routes AUTO: it is the presser's
  // own verb (QA20249FB), never the owner's.
  if (kind0 === PUBLISH_KIND || kind0 === EQUIP_KIND) {
    reasons.push(kind0 === PUBLISH_KIND ? "publishes-an-item" : "equips-an-item");
    return { grade: { binding: true, joinKey: "n/a", proof: "n/a", componentKey: "n/a" }, route: "auto", status: "routed", reasons };
  }
  // 0f · knowledge: RESERVED to the knowledge write door, which validated every op before it files; the row records the
  // write (who, what, which ids), so it routes AUTO like a press
  if (kind0 === KNOWLEDGE_KIND) {
    reasons.push("writes-knowledge");
    return { grade: { binding: true, joinKey: "n/a", proof: "n/a", componentKey: "n/a" }, route: "auto", status: "routed", reasons };
  }

  // 1 · binding — the core fields (the process borderline, ADR-019): what, why, and what it touches. B7e C1 (r109): touches
  // is OPTIONAL for the plain note ONLY (lane leader, kind note — PLAIN_NOTE). The one-pass fix 1 (owner, 2026-10-01): the
  // code and design lanes say what they touch in `touches` AND/OR `components` (doors, tables, services, tools, plain areas):
  // either one is enough, so a migration or a gate script names what it touches and no screen.
  const designOrCode = lane === "design" || lane === "code";
  const compsList = listOf(sub.components);
  const touchesSaid = touches.length > 0 || (designOrCode && compsList.length > 0);
  const touchesOptional = lane === PLAIN_NOTE.lane && kind0 === PLAIN_NOTE.kind;
  const missing = [!what && "what", !why && "why", !touchesOptional && !touchesSaid && "touches"].filter(Boolean);
  if (missing.length) {
    reasons.push("missing:" + missing.join("+"));
    return { grade: { binding: false, missing }, route: "incomplete", status: "routed", reasons };
  }

  // 2 · screens (the one-pass fix 1 and 2): a contribution names a screen only when it changes one — in `screens`, or as a
  //     screen: ref in `touches`; a design of kind "screen" says so by its kind and must name it. Every screen it names must
  //     be in the project's OWN Map (core.js resolveMapRefs: a screen node by its id with or without "screen:", or by its exact
  //     name). One that is not is a fix the sender makes (verdict needs, the preview lists near matches) — never sent to the
  //     owner, never accepted on faith (ADR-041: a model can fabricate a plausible id).
  const screenRefs = [...listOf(sub.screens), ...touches.filter((t) => /^screen:/i.test(t))];
  const saysScreen = designOrCode && kind0 === "screen";
  let joinKey = "n/a";
  let screenUnknown = [];
  if (screenRefs.length) {
    const v = verifyScreens(screenRefs.join(","));
    if (v.ok) joinKey = "ok";
    else { joinKey = "unverified"; screenUnknown = [...v.unknown, ...v.reserved]; reasons.push("join-key-unverified:" + screenUnknown.join(",")); }
  } else if (saysScreen) joinKey = "absent";

  // 3 · proof (the one-pass fix 3): the code lane carries proof of delivery, read by proofOf — a command with its result, a
  //     stated result with its numbers, a link or an artifact; only a narration is refused. gtm carries the SAME discipline,
  //     lane-appropriate: the shipped link or artifact (gtmProofArtifact) — a claim ("posted it") is not.
  let proof = "n/a";
  if (lane === "code" || lane === "gtm") {
    const raw = sub.proof == null ? "" : String(sub.proof).trim();
    proof = proofOf(raw);
    if (proof === "ok" && lane === "gtm" && !gtmProofArtifact(raw)) proof = "not-artifact";
    if (proof === "missing") reasons.push("unproven");
    if (proof === "not-artifact") reasons.push(lane === "gtm" ? "gtm-proof-not-link" : "proof-not-artifact");
  }

  // 3b · components (the one-pass fix 5): each id it names resolves against the project's own Map like a screen does — a
  //     node of any type (a service, a door, a table, the architecture) or a part of the architecture's diagram; the mind
  //     namespace (MIND_REFS) stays valid. One that does not is a fix the sender makes (needs, with near matches). Absent is
  //     recorded, never a gate (fix 1: `touches` may say what it touches instead).
  let componentKey = compsList.length ? "n/a" : (lane === "code" || lane === "vendor" ? "absent" : "n/a");
  let componentUnknown = [];
  if (compsList.length && typeof verifyComponents === "function") {
    const vc = verifyComponents(compsList);
    if (!vc.available) componentKey = "unavailable";
    else if (vc.ok) componentKey = "ok";
    else { componentKey = "unverified"; componentUnknown = vc.unknown; reasons.push("component-key-unverified:" + vc.unknown.join(",")); }
  }
  // 3c · depends (the one-pass fix 2): what it relies on — a node of the Map, goal/<id>, q/<qid>, check/<id> — resolves too;
  //     a contribution's id (T-…) is not read (it may be filed in the same call).
  let dependsKey = "n/a";
  let dependsUnknown = [];
  const depList = Array.isArray(sub.depends) ? sub.depends.map((d) => String(d).trim()).filter(Boolean) : [];
  if (depList.length && typeof verifyDepends === "function") {
    const vd = verifyDepends(depList);
    if (vd.ok) dependsKey = "ok";
    else { dependsKey = "unverified"; dependsUnknown = vd.unknown; reasons.push("depends-unverified:" + vd.unknown.join(",")); }
  }

  // the mind namespace (ADR-075/077): R's own infra work joins through a verified, all-mind components list (joinKey "mind")
  if (lane === "code" && componentKey === "ok" && compsList.length > 0 && compsList.every(isMindRef) && joinKey === "n/a") joinKey = "mind";
  // W7 (B7a): every incomplete route names EVERYTHING still missing in `missing`, so one re-file completes it: the screens it
  // names that are not in the Map (or the screen a screen design never named), the proof, the components and the depends
  const needs = [
    ...(joinKey === "unverified" || joinKey === "absent" ? ["screens"] : []),
    ...((lane === "code" || lane === "gtm") && proof !== "ok" ? ["proof"] : []),
    ...(componentKey === "unverified" ? ["components"] : []),
    ...(dependsKey === "unverified" ? ["depends"] : []),
  ];
  if (joinKey === "absent") reasons.push("no-screen-number");
  if (needs.length) {
    return { grade: { binding: true, joinKey, proof, componentKey, ...(screenUnknown.length ? { screenUnknown } : {}), ...(componentUnknown.length ? { componentUnknown } : {}),
      ...(dependsUnknown.length ? { dependsUnknown } : {}), missing: needs }, route: "incomplete", status: "routed", reasons };
  }

  // 4 · route — it is complete. Owner-check on risk, conflict, a ruling-territory kind
  // (critique/proposal/insight, ADR-082 §3 · ADR-085 §2), or a q/ answer; otherwise auto-sync. An id that is not in the
  // Map never reaches here (it needs a fix, above), so join-key-suspect and component-key-suspect are no longer raised.
  const ownerReasons = [];
  if (lane === "vendor") ownerReasons.push("lane:vendor");                 // Lane C (ADR-002)
  // Answering a question is RULING territory — EXCEPT a leader's own questionnaire
  // answer (ADR-079, owner 2026-08-31: "no need approve to land"): the assigned
  // leader's answer IS the ruling — it auto-syncs and paints green; the owner queue
  // is for NON-auto review (single or bulk) only. Any other contribution claiming a
  // q/ ref (a code PR, a doc) still routes owner — the owner closes those questions.
  const grRaw = Array.isArray(sub.gapRefs ?? sub.gaprefs) ? (sub.gapRefs ?? sub.gaprefs).join(",") : String(sub.gapRefs ?? sub.gaprefs ?? "");
  const leaderAnswer = lane === "leader" && String(sub.kind || "").toLowerCase() === "answer";
  if (hasQuestionRef(grRaw) && !leaderAnswer) ownerReasons.push("answers-a-question");
  // The expert/insight kinds (ADR-082 §3 · ADR-085 §2): critique and proposal are ruling
  // territory the moment they're filed, and EVERY insight routes owner — never auto, no
  // exceptions — because an insight is a proposal to change SHARED understanding, and
  // understanding merges are the orchestrator's alone. These were previously only owner
  // via incidental paths above (a q/ ref, a risk word); a critique/proposal/insight with
  // none of those used to slip to auto, which is the bug this closes.
  const kind = String(sub.kind || "").toLowerCase();
  if (kind === "critique") ownerReasons.push("critique-ruling-territory");
  if (kind === "proposal") ownerReasons.push("proposal-targets-a-ghost");
  if (kind === "insight") ownerReasons.push("insight-proposes-understanding");
  // Consent per occasion (Q45D29B33, UI-B3): a kind "grant" filing asks the owner for a one-time grant; Home answers
  // it with Grant once (decide approve) or Not yet (decide needs-work, terminal: the agent re-files with parent when
  // the occasion returns; no snooze state). Keyed on the KIND at this route step, so the gates above are unchanged:
  // an agent asks in lane leader (the wf-home call), and a code, design or gtm grant still meets its screen and proof
  // gates first (UI-B3 picked the lane-leader ask, not a route ahead of the gates).
  if (kind === "grant") ownerReasons.push("asks-a-grant");
  if (sub.conflict === true) ownerReasons.push("conflict-with-ruled-truth"); // brain-supplied hint
  if (sub.risk && String(sub.risk).toLowerCase() === "owner") ownerReasons.push("flagged-owner");
  if (RISKY.test(what) || RISKY.test(touches.join(" "))) ownerReasons.push("risk-surface");

  if (ownerReasons.length) {
    reasons.push(...ownerReasons);
    return { grade: { binding: true, joinKey, proof, componentKey, ownerReasons }, route: "owner", status: "routed", reasons };
  }
  return { grade: { binding: true, joinKey, proof, componentKey }, route: "auto", status: "routed", reasons };
}

// ---- kind "counter" (UI-B4a) ----
export const COUNTER_KIND = "counter";
// the drawn call (wireframe wf-filing counters.mcp): how a person's own Claude files a counter on a filing
// copy: off-screen (the door's JSON call (gtm rows); What is missing carries calls on glass)
export const FILING_COUNTER_CALL = 'preview {items: [{contribution: {lane, kind: "counter", parent: "<id>", what, why}}]}, then file';
// the drawn call on a goal row (wireframe wf-goals / wf-goal-node counters.mcp, Q48115AD1): a counter names a goal node by
// gapRefs goal/<id>, never by parent (parent is a filing)
// copy: off-screen (the goals JSON's call)
export const GOAL_COUNTER_CALL = 'preview {items: [{contribution: {lane, kind: "counter", gapRefs: ["goal/<id>"], what, why}}]}, then file';
export const goalCounterCall = (id) => GOAL_COUNTER_CALL.replace("<id>", String(id || ""));
// GOAL_REF_PREFIX: the gapRef namespace a goal counter lives in; transmission_refs indexes the gapRef verbatim (refs.js
// refTokensFor), so the goal/ range is one index range (src/hotsql.js GOALS_COUNTERS_SQL)
export const GOAL_REF_PREFIX = "goal/";
// goalRefOf(raw) -> the goal id a gapRef names (goal/<id>, the id trimmed and capped like verifyGoalRef), or null (pure)
export function goalRefOf(raw) {
  const m = /^goal\/(\S.*)$/.exec(String(raw ?? "").trim());
  return m ? m[1].trim().slice(0, 80) : null;
}
// counterTargetOf(sub) -> { parent, question, goal }: the three target forms a counter may name (pure). goal is the id
// after the first goal/<id> gapRef, or null; a gapRef of none of the three forms names nothing.
export function counterTargetOf(sub) {
  const s = sub || {};
  const parent = s.parent != null && String(s.parent).trim() !== "" ? String(s.parent).trim() : null;
  const grList = Array.isArray(s.gapRefs ?? s.gaprefs) ? (s.gapRefs ?? s.gaprefs).map(String) : String(s.gapRefs ?? s.gaprefs ?? "").split(",");
  const grRaw = grList.join(",");
  let goal = null;
  for (const r of grList) { goal = goalRefOf(r); if (goal) break; }
  return { parent, question: hasQuestionRef(grRaw), goal };
}

// ---- kind "rank" (UI-B4b, QEFC716D5) ----
// A rank is a filing: kind "rank", parent <the ranked filing's id>, lane leader, routes auto. No table, no column: the
// project's shared order is the newest rank press first (src/hotsql.js BUILD_ROWS_SQL reads MAX(created_at) of the
// kind rank filings naming a row by parent, on idx_transmission_parent). POST /rank (REST only, D5) files it
// (src/build.js fileRank); a plain file with kind: "rank" and a parent routes the same way.
export const RANK_KIND = "rank";

// ---- kind "restore" (UI-B5b, Q859A8F0A) ----
// A restore is a filing: kind "restore", lane leader, gapRefs ["v/<key>"] (the version's key, src/knowledge/versions.js),
// routed to the owner and decided approve by the owner's own press on the Versions view (POST /versions/restore, the MCP
// `restore_version` tool). The worker never writes R2: the brain's next close carries it out and the spine appends a
// "restored" version whose ref is this filing's id.
export const RESTORE_KIND = "restore";
// restoreTargetOf(sub) -> the first v/<key> gapRef's key (64 hex), or null (pure)
export function restoreTargetOf(sub) {
  const s = sub || {};
  const raw = Array.isArray(s.gapRefs ?? s.gaprefs) ? (s.gapRefs ?? s.gaprefs) : String(s.gapRefs ?? s.gaprefs ?? "").split(",");
  for (const r of raw) { const m = /^v\/([0-9a-f]{64})$/.exec(String(r).trim()); if (m) return m[1]; }
  return null;
}

// ---- kind "item" (UI-B11a, Q2485A7FD) and the two reserved kinds "publish" · "equip" (Q0E5A1073 · Q571B3D89 · QEBB5D318) ----
// An item is a filing: the draft of a skill, an agent or a workflow, lane leader, kind item, touches its kind, gapRefs
// ["item/<slug>"], proof its source. Publishing it is ONE filing, kind publish, parent the item (version n of a slug = its
// n-th publish; a slug belongs to its first publisher); equipping a version into a project is ONE filing, kind equip,
// project the target, parent the publish row. No table, no migration (owner MCQ 2026-09-29, Fork 1 (a)).
export const ITEM_KIND = "item";
export const PUBLISH_KIND = "publish";
export const EQUIP_KIND = "equip";
// kind "knowledge": the ONE ledger row a preview then save_knowledge call files (src/knowledge/write.js), lane leader, routed auto
export const KNOWLEDGE_KIND = "knowledge";
// RESERVED_KINDS: the kinds only their own seam files — publish and equip by src/broadcast.js, knowledge by
// src/knowledge/write.js (core.js fileTransmission / fileTransmissionsBatch refuse them on every other door)
export const RESERVED_KINDS = [PUBLISH_KIND, EQUIP_KIND, KNOWLEDGE_KIND];
// the three kinds an item may be (Q2485A7FD: publish a skill, an agent or a workflow)
export const ITEM_KINDS = ["skill", "agent", "workflow"];
export const ITEM_SLUG = /^item\/([a-z0-9-]{2,40})$/;
// the exact call that files a draft (shown where Publish has nothing to publish, D11)
// copy: off-screen (Broadcast's JSON call)
export const FILING_ITEM_CALL = 'preview {items: [{contribution: {lane: "leader", kind: "item", what, why, touches: ["skill" | "agent" | "workflow"], gapRefs: ["item/<slug>"], proof: "<http(s) link | /artifact/:id>"}}]}, then file';
const listOf = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()) : String(v ?? "").split(",").map((x) => x.trim())).filter(Boolean);
// itemKindOf(touches) -> "skill" | "agent" | "workflow" when touches names exactly one entry and it is one of the three, else null (pure)
export function itemKindOf(touches) {
  const t = listOf(touches).map((x) => x.toLowerCase());
  return t.length === 1 && ITEM_KINDS.includes(t[0]) ? t[0] : null;
}
// itemSlugOf(gapRefs) -> the slug of the ONE item/<slug> gapRef, else null (none, a malformed one, or two) (pure)
export function itemSlugOf(gapRefs) {
  const refs = listOf(gapRefs).filter((r) => r.startsWith("item/"));
  if (refs.length !== 1) return null;
  const m = ITEM_SLUG.exec(refs[0]);
  return m ? m[1] : null;
}
// itemSourceOf(proof) -> the source link when proof is an http(s) link or an /artifact/:id, else null (pure)
export function itemSourceOf(proof) {
  const p = String(proof ?? "").trim();
  return /^https?:\/\/\S+$/i.test(p) || /^\/artifact\/[A-Za-z0-9._-]+$/.test(p) ? p : null;
}

// ---- W7 (B7a, Q60CCC574): an incomplete filing says how to complete it ----
// PLAIN_NOTE — the path that needs no proof, no screen and no component ids: lane "leader", kind "note", what and why
// (touches optional, B7e C1). It routes like any leader filing (auto, or the owner on a risk word) — never a new lane.
export const PLAIN_NOTE = { lane: "leader", kind: "note" };
const EXAMPLE_FIELD = {
  what: "what changed, in one line",
  why: "why it matters",
  touches: ["the area it touches"],
  screens: "the screens it changes, by their id in the project's Map, e.g. screen:pricing (or leave screens out: work that changes no screen names what it touches in touches)",
  components: ["a node id of the project's Map it touches, e.g. service:payments or table:orders"],
  depends: ["a node id of the Map, goal/<id>, q/<qid> or check/<id> it relies on"],
};
// completingExample(lane, missing) -> the fields a re-file adds, one example value each (pure). Proof is
// lane-shaped: the code lane's is a command + its observed result; gtm's is the shipped link.
export function completingExample(lane, missing, kind) {
  const out = {};
  for (const m of Array.isArray(missing) ? missing : []) {
    if (m === "proof") out.proof = lane === "gtm" ? "https://… (the live post or page)" : "sh tools/smoke.sh -> exit 0, 93 passing";
    else if (m === "parent") out.parent = "T-YYYYMMDD-NNN (the id of the filing this counters)";
    else if (EXAMPLE_FIELD[m] !== undefined) out[m] = EXAMPLE_FIELD[m];
  }
  // a counter's example is the drawn call (UI-B4a C3): the target it lacks, and the call it is filed with
  if (String(kind || "").toLowerCase() === COUNTER_KIND && (missing || []).includes("parent")) out.call = FILING_COUNTER_CALL;
  // an item's example is its drawn call (UI-B11a): its own fields, never the code lane's proof shape
  if (String(kind || "").toLowerCase() === ITEM_KIND) {
    const m = Array.isArray(missing) ? missing : [];
    if (m.includes("touches")) out.touches = ["skill"];
    if (m.includes("gapRefs")) out.gapRefs = ["item/<slug>"];
    if (m.includes("proof")) out.proof = "https://… (its source) or /artifact/<id>";
    out.call = FILING_ITEM_CALL;
  }
  return out;
}
// unknownWords(grade) -> " Not in the project's Map: screens x, y; components z." for the refs the gate could not find ("" when none)
export function unknownWords(g) {
  const x = g || {};
  const parts = [["screens", x.screenUnknown], ["components", x.componentUnknown], ["depends", x.dependsUnknown]]
    .filter(([, l]) => Array.isArray(l) && l.length).map(([k, l]) => `${k} ${l.join(", ")}`);
  return parts.length ? ` Not in the project's Map: ${parts.join("; ")} (preview lists the near matches; formats {shape: "code"} has the rule).` : "";
}
// incompleteNote(lane, missing, kind, grade) -> the sentence an incomplete filing's note carries (pure).
export function incompleteNote(lane, missing, kind, grade) {
  return incompleteNote0(lane, missing, kind) + unknownWords(grade) +
    ((Array.isArray(missing) && missing.includes("proof") && (lane === "code" || lane === "gtm")) ? (lane === "gtm" ? ` Proof is ${GTM_PROOF_FORMS}.` : ` P${PROOF_FORMS.slice(1)}.`) : "");
}
function incompleteNote0(lane, missing, kind) {
  const miss = Array.isArray(missing) && missing.length ? missing : null;
  if (String(kind || "").toLowerCase() === COUNTER_KIND && miss && miss.includes("parent"))
    return `Recorded, but NOT binding — missing: ${miss.join(", ")}. A counter needs a target: parent (the filing it counters), gapRefs ["q/<qid>"] (the question it counters) or gapRefs ["goal/<id>"] (the goal it counters). Re-file with ${FILING_COUNTER_CALL}, or ${GOAL_COUNTER_CALL} on a goal. sharingu never blocks.`;
  if (String(kind || "").toLowerCase() === ITEM_KIND && miss)
    return `Recorded, but NOT binding — missing: ${miss.join(", ")}. An item needs what, why, touches naming one of skill, agent or workflow, gapRefs ["item/<slug>"] and proof (its source link or an /artifact/<id>). Re-file with ${FILING_ITEM_CALL}. sharingu never blocks.`;
  const plain = (lane === "code" || lane === "design" || lane === "gtm")
    ? ` Or file it as a plain note — lane "${PLAIN_NOTE.lane}", kind "${PLAIN_NOTE.kind}": what and why only (touches optional), no proof or ids.`
    : "";
  return "Recorded, but NOT binding — " + (miss ? `missing: ${miss.join(", ")}. Re-file with the fields in \`example\`.` : "complete the named fields and it routes.") +
    plain + " sharingu never blocks.";
}
