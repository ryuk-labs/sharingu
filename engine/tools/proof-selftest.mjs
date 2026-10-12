// tools/proof-selftest.mjs — THE proof rule (src/transmission.js proofKind / proofOf; owner ruling 2026-10-01: "proof is a
// stated result with its numbers, a command with its result, or a link — only narration is refused"). Rewritten in D2b:
// the rule refused TRUE proof in three separate runs, so it is now held to a CORPUS, not to examples. Table-driven from
// tools/fixtures/proof-corpus.json (built by engine/.runs/d2b/corpus/build-fixture.mjs): every proof any real run filed or had
// refused (the fills, the grading runs, the ship candidate, the fix replay, the after-import items, the commit bodies since
// 2026-09-29, the old selftest's tables) must pass; every narration in it must be refused.
import { readFileSync } from "node:fs";
import { proofKind, proofOf, gtmProofArtifact, proofArtifact, PROOF_FORMS, GTM_PROOF_FORMS, PROOF_RULE, incompleteNote } from "../src/transmission.js";
import { reasonWords } from "../src/preview.js";
import { SHAPES } from "../src/shapes.js";

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } };
const CORPUS = JSON.parse(readFileSync(new URL("./fixtures/proof-corpus.json", import.meta.url), "utf8"));
const short = (p) => p.replace(/\s+/g, " ").slice(0, 110);

// 1. every true proof of the corpus passes
ok(CORPUS.accepted.length >= 800, `the corpus holds every real proof (${CORPUS.accepted.length})`);
let pass = 0;
for (const { proof, from } of CORPUS.accepted) {
  const k = proofKind(proof);
  if (k !== null && proofOf(proof) === "ok") pass++;
  ok(k !== null && proofOf(proof) === "ok", `a true proof is accepted (${from}): ${short(proof)}`);
}
// ...and passes for what is observed in it, not only for a URL it carries: a link proof with an arrow, its URLs taken out,
// still reads as a call with its answer
for (const { proof } of CORPUS.accepted) {
  if (proofKind(proof) !== "link" || !/->|→/.test(proof)) continue;
  const bare = proof.replace(/https?:\/\/[^\s)>\]"']+/g, "<the url>");
  ok(proofKind(bare) !== null, `a call with its answer passes without its URL: ${short(bare)}`);
}
// the three the ship candidate's first preview refused, by name
for (const needle of ["83 ryuklabs items with 0 hits", "dry run green, migrations, the rename", "-> measure.name"])
  ok(CORPUS.accepted.some((x) => x.proof.includes(needle) && proofKind(x.proof) !== null), `the candidate's refused proof is accepted now: …${needle}…`);

// L4: a sentence that names a tool or a check and gives the number it reported is an observed result; the same sentence with
// no number stays narration
ok(proofKind("The commit states: the copy check lists 393 strings on the revision's pages; no page adopts the parts yet.") === "result", "L4: a named check with the number it reported is a result (the refused 19355b2e5 wording)");
ok(proofKind("page-budget.mjs reads 1,331 rows at worst") !== null && proofKind("the walk reports 13 steps of 13") !== null, "L4: a named tool with its number passes");
ok(proofKind("the copy check lists the strings on the revision's pages") === null && proofKind("the smoke reports success") === null, "L4: a named check with no number is still narration");

// 2. every narration is refused
ok(CORPUS.narrations.length >= 40, `at least 40 narrations (${CORPUS.narrations.length})`);
let refused = 0;
for (const p of CORPUS.narrations) {
  if (proofKind(p) === null && proofOf(p) === "not-artifact") refused++;
  ok(proofKind(p) === null && proofOf(p) === "not-artifact", `a narration is refused: ${p} (read as ${proofKind(p)})`);
}
// the words that say there is none: no proof at all (the reason is "it carries no proof"), never "a narration"
for (const p of ["none", "None", "n/a", "N/A", "-", "", "  ", null, undefined, "TBD"]) ok(proofOf(p) === "missing", `"${p}" reads as no proof`);

// 3. the kinds, one of each
ok(proofKind("https://github.com/acme/app/pull/12") === "link", "a link reads as a link");
ok(proofKind("/artifact/A-1") === "artifact", "a banked artifact reads as an artifact");
ok(proofKind("sh tools/smoke.sh -> exit 0, 93 passing") === "command", "a command with what it printed reads as a command");
ok(proofKind('read {kind: "goal", ref: "beta"} -> status "done"') === "command", "a tool call with its answer reads as a command");
ok(proofKind("$ git cat-file -e f6efbaa17:scripts/deploy.sh; echo $? -> 128") === "command", "a shell line with ; and its exit status reads as a command");
ok(proofKind("smoke 93/93, gate exit 0") === "result", "a stated result with its numbers reads as a result");
ok(proofKind("docs/plan/HANDOFF.md states: siru reads 4 of 11") === "result" && proofKind("contracts/door.json carries POST /broadcast/publish") === "result", "a named file with what it shows reads as a result");
ok(proofKind("see docs/plan/SPRINTS.md") === null, "a file named with nothing it shows is a pointer, not proof");
ok(proofArtifact("smoke 93/93") === true && proofArtifact("works fine") === false, "proofArtifact (kept for callers) is proofKind !== null");

// 4. the GTM lane: a link, an artifact or a tool's run; a bare count is the outcome, not proof of delivery
ok(gtmProofArtifact("https://example.com/post/123") && gtmProofArtifact("/artifact/A-1") && gtmProofArtifact("node tools/post.mjs -> exit 0, 3 posted"), "GTM takes a link, an artifact or a command with its result");
ok(!gtmProofArtifact("posted it, went well") && !gtmProofArtifact("40 replies of 100 sent"), "GTM refuses a narration and a bare count");

// 5. the rule is ONE sentence, said the same in the refusal, the hint, the note and formats {shape: "code"}
ok(!/\.(\s|$)/.test(PROOF_RULE) && /what you observed/.test(PROOF_RULE) && /narration/.test(PROOF_RULE), "the rule is one sentence");
ok(PROOF_FORMS.startsWith(PROOF_RULE), "the hint starts with the rule");
const forms = ["(a result)", "(a command and what it printed)", "(a tool call and its answer)", "(a link)", "(a named file and what it shows)", "(an artifact you banked)"];
for (const f of forms) ok(PROOF_FORMS.includes(f), `the hint carries one example of each accepted form: ${f}`);
for (const ex of [...PROOF_FORMS.matchAll(/"([^"]+)" \((a|an) [^)]+\)/g)].map((m) => m[1].replace("<id>", "A-1"))) ok(proofKind(ex) !== null, `the hint's example is accepted: ${ex}`);
ok(/nothing observed in it/.test(reasonWords("proof-not-artifact")) && !/\.\s+\S/.test(reasonWords("proof-not-artifact")), "the refusal says what is missing in one sentence");
ok(incompleteNote("code", ["proof"]).includes(PROOF_RULE.slice(1)), "an incomplete filing's note carries the rule");
ok(SHAPES.code && SHAPES.code.proofRule === PROOF_RULE[0].toUpperCase() + PROOF_RULE.slice(1) + ".", "formats {shape: \"code\"} states the rule in one sentence");
ok(/link/.test(GTM_PROOF_FORMS) && /artifact/.test(GTM_PROOF_FORMS), "the GTM hint names the link and the artifact");

console.log(`proof corpus: ${pass}/${CORPUS.accepted.length} true proofs accepted, ${refused}/${CORPUS.narrations.length} narrations refused`);
console.log(`proof selftest: ${checks - failed}/${checks} passed`);
if (failed) process.exit(1);
