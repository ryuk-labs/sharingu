// goals-derive-selftest.mjs — the ratchet for the Goals Engine (M-ADR-020 G3). UI-B6a: rollupCells (the rollup from the
// ONE period-bounded aggregate, src/hotsql.js GOALS_AGG_SQL) equals deriveGoals (the rollup from the rows) on every number,
// over EVERY fixture below: each fixture's rows go into a real SQLite built from boot.sql, the real GOALS_AGG_SQL runs over
// them, and the two rollups are compared node by node (proven both ways: an aggregate with one lane dropped, and the SQL
// without its kind filter over a counter row, each differ).
// deriveGoals turns the goal tree + graded ledger rows into the rollup, DERIVED (never
// hand-typed, R1). verifyGoalRef is the door's join-key check (mirrors verifyScreens).
// Both are pure — no DB, no env — so the branches (known/unknown/absent ref; leaf vs
// rollup pct; weighted children; honest zero; cycle guard) are covered here, in the gate.
import { verifyGoalRef, deriveGoals, proposeGoalRef, rollupCells, rollBudgets, budgetWords, MIXED } from "../src/goals.js";
import { GOALS_AGG_SQL } from "../src/hotsql.js";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let fail = 0;
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`  ✗ ${label}: got ${g}, want ${w}`); fail = 1; }
};

// ---- verifyGoalRef ----
const tree = [
  { id: "global", title: "Product readiness", parent: null, dimensions: [] },
  { id: "scope", title: "Scope", parent: "global", dimensions: ["ba"] },
  { id: "dev", title: "Dev", parent: "global", dimensions: ["code"] },
];
eq(verifyGoalRef(null, tree), { ref: null, status: "absent" }, "absent ref (null) -> absent, no ref stored");
eq(verifyGoalRef("", tree), { ref: null, status: "absent" }, "absent ref (empty string) -> absent");
eq(verifyGoalRef("  ", tree), { ref: null, status: "absent" }, "absent ref (whitespace) -> absent");
eq(verifyGoalRef("dev", tree), { ref: "dev", status: "known" }, "known ref resolves");
eq(verifyGoalRef("nope", tree), { ref: "nope", status: "unknown" }, "unknown ref still returns verbatim, flagged unknown");
eq(verifyGoalRef("x".repeat(200), tree).ref.length, 80, "ref capped at 80 chars");

// ---- deriveGoals: honest zero (no rows at all) ----
const empty = deriveGoals(tree, []);
eq(empty.globalPct, 0, "no rows -> global 0%, not null");
eq(empty.aligned, 0, "no rows -> aligned 0");
eq(empty.unaligned, 0, "no rows -> unaligned 0");
eq(empty.nodes.every((n) => n.pct === 0), true, "every node 0% with no data");

// ---- deriveGoals: a single graded row moves exactly its own cell ----
const oneRow = deriveGoals(tree, [{ id: "T-1", lane: "code", goalRef: "dev" }]);
const devNode = oneRow.nodes.find((n) => n.id === "dev");
eq(devNode.pct, 100, "dev's own cell hits 100% at the default target (1)");
eq(devNode.contributions, 1, "dev carries 1 contribution");
eq(oneRow.nodes.find((n) => n.id === "scope").pct, 0, "scope untouched by a dev-lane row stays 0%");
eq(oneRow.aligned, 1, "1 row aligned");
eq(oneRow.unaligned, 0, "0 unaligned");

// ---- rollup: global is the weighted average of its children (default weight 1 each) ----
// dev=100 (1 code row), scope=0 (nothing) -> global = round((100+0)/2) = 50
eq(oneRow.globalPct, 50, "global rolls up as the weighted average of its two segments");

// ---- weighted rollup: an explicit weight tilts the average ----
const weighted = [
  { id: "global", title: "G", parent: null, dimensions: [] },
  { id: "a", title: "A", parent: "global", dimensions: ["code"], weight: 3 },
  { id: "b", title: "B", parent: "global", dimensions: ["code"], weight: 1 },
];
// a=100 (its own row), b=0 -> weighted avg = (100*3 + 0*1) / 4 = 75
const wDer = deriveGoals(weighted, [{ id: "T-2", lane: "code", goalRef: "a" }]);
eq(wDer.globalPct, 75, "weight tilts the rollup toward the heavier child");

// ---- dimension mismatch: a row on the wrong lane for that node moves no cell, but a
// VALID goalRef still counts as "aligned" (alignment = does the ref resolve; the cell
// math is a separate concern — a real node with no matching dimension is an honest 0%,
// not an unaligned row) ----
const wrongLane = deriveGoals(tree, [{ id: "T-3", lane: "design", goalRef: "dev" }]);
eq(wrongLane.nodes.find((n) => n.id === "dev").pct, 0, "a design-lane row against 'dev' (dims:[code]) moves no cell");
eq(wrongLane.nodes.find((n) => n.id === "dev").contributions, 1, "but it still counts as a contribution recorded against the node");
eq(wrongLane.aligned, 1, "goalRef 'dev' is a real node -> aligned");
eq(wrongLane.unaligned, 0, "not unaligned — the ref itself is valid");

// ---- unaligned: no goalRef, or a goalRef naming no real node ----
const stray = deriveGoals(tree, [
  { id: "T-4", lane: "code", goalRef: null },
  { id: "T-5", lane: "code", goalRef: "ghost-node" },
]);
eq(stray.aligned, 0, "neither row names a real node");
eq(stray.unaligned, 2, "both rows count as unaligned");
eq(stray.globalPct, 0, "unaligned rows move no needle");

// ---- honest empty tree ----
eq(deriveGoals([], [{ id: "T-6", lane: "code", goalRef: "dev" }]).nodes, [], "no tree declared -> no nodes, never a throw");
eq(deriveGoals(null, null).globalPct, 0, "null tree/rows degrade to honest zero, not a crash");

// ---- cycle guard: a malformed tree (a node parenting itself) never infinite-loops ----
const cyc = [{ id: "x", title: "X", parent: "x", dimensions: ["code"] }];
const cycOut = deriveGoals(cyc, [{ id: "T-7", lane: "code", goalRef: "x" }]);
eq(typeof cycOut.nodes[0].pct, "number", "a self-parenting node still returns a numeric pct, not a hang");

// ---- M-ADR-021 fine-tune: weight-by-outcome (cellsFor's unit(r,n) + node/top-level
// awaiting) and the new proposeGoalRef export. All existing asserts above stay untouched —
// this is the byte-safety ratchet: with no outcomeMetric node and no outcome on any row
// (every case above), realized === matches.length and awaiting === 0 throughout, so every
// number already asserted stays exactly as it was pre-fine-tune. ----

const otree = [
  { id: "global", title: "Product readiness", parent: null, dimensions: [] },
  { id: "scope", title: "Scope", parent: "global", dimensions: ["ba"] },
  { id: "dev", title: "Dev", parent: "global", dimensions: ["code"] },
  { id: "calls", title: "Calls booked", parent: "global", dimensions: ["gtm"], outcomeMetric: true, target: 8 },
];

// (a) outcomeMetric node, activity-only rows (no outcome) -> 0%, not activity-count%.
const actOnly = deriveGoals(otree, [
  { id: "T-10", lane: "gtm", goalRef: "calls" },
  { id: "T-11", lane: "gtm", goalRef: "calls" },
]);
const callsA = actOnly.nodes.find((n) => n.id === "calls");
eq(callsA.pct, 0, "outcomeMetric node, activity-only rows -> 0% (no invented credit for activity alone)");
eq(callsA.dims[0].realized, 0, "realized stays 0 with no finite outcome on an outcomeMetric node");
eq(callsA.dims[0].count, 2, "count still reflects the raw row count (2 activity rows)");
eq(callsA.awaiting, 2, "both activity-only rows are awaiting an actual (node-level awaiting)");
eq(actOnly.awaiting, 2, "top-level awaiting sums every node's awaiting");

// (b) outcomeMetric node, rows carrying outcome values -> realized sums them.
const withOutcome = deriveGoals(otree, [
  { id: "T-12", lane: "gtm", goalRef: "calls", outcome: 2 },
  { id: "T-13", lane: "gtm", goalRef: "calls", outcome: 3 },
]);
const callsB = withOutcome.nodes.find((n) => n.id === "calls");
eq(callsB.dims[0].realized, 5, "realized sums finite outcome values (2+3)");
eq(callsB.pct, 63, "pct = round(100*5/8) against the node's target of 8");
eq(callsB.awaiting, 0, "no awaiting when every matched row carries a finite outcome");

// (c) awaiting counts precisely: outcome:0 is a real reported zero (not awaiting); a
// missing outcome is awaiting; mixed rows only count the missing one.
const mixed = deriveGoals(otree, [
  { id: "T-14", lane: "gtm", goalRef: "calls", outcome: 1 },
  { id: "T-15", lane: "gtm", goalRef: "calls" },
  { id: "T-16", lane: "gtm", goalRef: "calls", outcome: 0 },
]);
const callsC = mixed.nodes.find((n) => n.id === "calls");
eq(callsC.dims[0].realized, 1, "realized = 1 (T-14) + 0 (T-16's real reported zero) -- T-15 contributes 0, awaiting");
eq(callsC.dims[0].count, 3, "count is still the raw row count (3)");
eq(callsC.awaiting, 1, "only the row with NO outcome at all (T-15) is awaiting; outcome:0 is not");

// (d) normal (non-outcomeMetric) node: unit(r,n) is still 1 per row with no outcome, and an
// explicit outcome on a normal node is honored too -- byte-safe with pre-fine-tune math when
// no outcome values are present at all.
const normalOnly = deriveGoals(tree, [{ id: "T-17", lane: "code", goalRef: "dev" }]);
const devOnly = normalOnly.nodes.find((n) => n.id === "dev");
eq(devOnly.dims[0].realized, 1, "normal node, row w/ no outcome -> realized 1 (identical to matches.length pre-fine-tune)");
eq(devOnly.pct, 100, "normal node pct unchanged from the old row-count-based math");
eq(devOnly.awaiting, 0, "a normal node never awaits -- unit() already gives full credit");

const normalWithOutcome = deriveGoals(tree, [
  { id: "T-18a", lane: "code", goalRef: "dev" },
  { id: "T-18b", lane: "code", goalRef: "dev", outcome: 5 },
]);
const devMixed = normalWithOutcome.nodes.find((n) => n.id === "dev");
eq(devMixed.dims[0].realized, 6, "normal node: row w/o outcome counts as 1, row w/ outcome:5 counts as 5 -> 6");
eq(devMixed.dims[0].count, 2, "count is still the raw row count (2)");

// (e) proposeGoalRef: touches (+3), lane (+2), shared title words (+1 each), ties keep tree
// order, and no-match returns null (an honest "no suggestion", never a guess).
const propByTouch = proposeGoalRef(tree, { what: "fix something", touches: ["dev"], lane: null });
eq(propByTouch, { goalRef: "dev", title: "Dev", why: "touches names this node" }, "touches array containing the node id wins on its own (+3)");

const propByLane = proposeGoalRef(tree, { what: "", touches: null, lane: "ba" });
eq(propByLane && propByLane.goalRef, "scope", "lane match (+2) picks the node whose dimensions include it");

const propByWords = proposeGoalRef(tree, { what: "working on scope definition", touches: null, lane: null });
eq(propByWords && propByWords.goalRef, "scope", "a shared title word (>3 chars, 'scope') picks the matching node");

eq(proposeGoalRef(tree, { what: "xyz", touches: null, lane: null }), null, "nothing scores above 0 -> null, no guess");
eq(proposeGoalRef(null, { what: "dev" }), null, "no tree -> null, never a throw");
eq(proposeGoalRef([], {}), null, "empty tree -> null");
eq(proposeGoalRef(tree, {}), null, "empty ctx -> null (no touches/lane/what to score against)");

const tieTree = [
  { id: "root", title: "Root", parent: null, dimensions: [] },
  { id: "alpha", title: "Growth work", parent: "root", dimensions: ["gtm"] },
  { id: "beta", title: "Growth stuff", parent: "root", dimensions: ["gtm"] },
];
const tie = proposeGoalRef(tieTree, { what: "growth", touches: null, lane: null });
eq(tie && tie.goalRef, "alpha", "a scoring tie keeps the FIRST node in tree order");

// ---- UI-B6a: rollupCells(tree, GOALS_AGG_SQL(rows)) == deriveGoals(tree, rows), over every fixture above ----
const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
function aggOf(rows, sql = GOALS_AGG_SQL(true, false), extra = []) {
  const db = new DatabaseSync(":memory:");
  db.exec(BOOT);
  db.exec("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p','P','p@x.test','owner','h',1,'2026-01-01T00:00:00Z',1)");
  db.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('w','W',1,'2026-01-01T00:00:00Z')");
  const X = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,project,goal_ref,outcome,expected,actual,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  [...rows, ...extra].forEach((r, i) => X.run(r.id || `T-${i}`, "p", r.lane ?? null, r.kind || "pr", r.what || "work", "why", "x", "auto", "routed", 0, "w", r.goalRef ?? null,
    r.outcome ?? null, r.expected ?? null, r.actual ?? null, "2026-09-28T00:00:00Z"));
  return db.prepare(sql).all("w", new Date(0).toISOString());
}
// the numbers both rollups carry (the drill rows and the expected samples are deriveGoals' alone: the aggregate has no text)
const numbersOf = (g) => ({ globalId: g.globalId, globalPct: g.globalPct, aligned: g.aligned, unaligned: g.unaligned, awaiting: g.awaiting,
  nodes: g.nodes.map((n) => ({ id: n.id, title: n.title, parent: n.parent, weight: n.weight, pct: n.pct, contributions: n.contributions, awaiting: n.awaiting,
    dims: n.dims.map((d) => ({ dim: d.dim, count: d.count, target: d.target, pct: d.pct, realized: Math.round(d.realized * 1e9) / 1e9, awaiting: d.awaiting })) })) });
const FIXTURES = [
  ["no rows", tree, []],
  ["one row", tree, [{ id: "T-1", lane: "code", goalRef: "dev" }]],
  ["weighted", weighted, [{ id: "T-2", lane: "code", goalRef: "a" }]],
  ["wrong lane", tree, [{ id: "T-3", lane: "design", goalRef: "dev" }]],
  ["unaligned", tree, [{ id: "T-4", lane: "code", goalRef: null }, { id: "T-5", lane: "code", goalRef: "ghost-node" }]],
  ["self-parenting", cyc, [{ id: "T-7", lane: "code", goalRef: "x" }]],
  ["outcomeMetric, activity only", otree, [{ id: "T-10", lane: "gtm", goalRef: "calls" }, { id: "T-11", lane: "gtm", goalRef: "calls" }]],
  ["outcomeMetric, outcomes", otree, [{ id: "T-12", lane: "gtm", goalRef: "calls", outcome: 2 }, { id: "T-13", lane: "gtm", goalRef: "calls", outcome: 3 }]],
  ["outcomeMetric, mixed (0 is a real outcome)", otree, [{ id: "T-14", lane: "gtm", goalRef: "calls", outcome: 1 }, { id: "T-15", lane: "gtm", goalRef: "calls" }, { id: "T-16", lane: "gtm", goalRef: "calls", outcome: 0 }]],
  ["outcomeMetric, an actual reported", otree, [{ id: "T-19", lane: "gtm", goalRef: "calls", expected: "8 calls", actual: "6 calls" }, { id: "T-20", lane: "gtm", goalRef: "calls", expected: "2 calls" }]],
  ["normal node, an outcome", tree, [{ id: "T-18a", lane: "code", goalRef: "dev" }, { id: "T-18b", lane: "code", goalRef: "dev", outcome: 5 }]],
  ["fractional outcomes", otree, [{ id: "T-21", lane: "gtm", goalRef: "calls", outcome: 0.1 }, { id: "T-22", lane: "gtm", goalRef: "calls", outcome: 0.2 }, { id: "T-23", lane: "gtm", goalRef: "calls" }]],
  ["upper-case lane", tree, [{ id: "T-24", lane: "CODE", goalRef: "dev" }, { id: "T-25", lane: "Ba", goalRef: "scope" }]],
  ["ties", tieTree, [{ id: "T-26", lane: "gtm", goalRef: "alpha" }, { id: "T-27", lane: "gtm", goalRef: "beta" }, { id: "T-28", lane: "gtm", goalRef: "beta" }]],
  ["no tree", [], [{ id: "T-6", lane: "code", goalRef: "dev" }]],
];
let eqN = 0;
for (const [label, t, rows] of FIXTURES) {
  const a = numbersOf(rollupCells(t, aggOf(rows))), d = numbersOf(deriveGoals(t, rows));
  eq(a, d, `rollupCells over GOALS_AGG_SQL equals deriveGoals: ${label}`);
  if (JSON.stringify(a) === JSON.stringify(d)) eqN++;
}
eq(eqN, FIXTURES.length, `rollupCells == deriveGoals on all ${FIXTURES.length} fixtures`);
eq(rollupCells(tree, aggOf([])).nodes.every((n) => Array.isArray(n.expected) && !("rows" in n)), true, "rollupCells carries no drill rows (they are GET /goals/:ref's) and an empty expected list");
// both ways: the equality check can fail. An aggregate with one lane dropped differs; GOALS_AGG_SQL without its kind filter
// counts a counter naming the goal (a counter never moves a goal), and the real statement does not.
const mixRows = [{ id: "T-30", lane: "code", goalRef: "dev" }, { id: "T-31", lane: "ba", goalRef: "scope" }];
const dropped = aggOf(mixRows).filter((x) => x.lane !== "ba");
eq(JSON.stringify(numbersOf(rollupCells(tree, dropped))) !== JSON.stringify(numbersOf(deriveGoals(tree, mixRows))), true, "both ways: an aggregate missing one lane does NOT equal deriveGoals (the comparison can fail)");
const withCounter = [{ id: "T-32", lane: "code", goalRef: "dev", kind: "counter" }];
const noKindFilter = GOALS_AGG_SQL(true, false).replace(/ AND COALESCE\(\+kind,''\) NOT IN \([^)]*\)/, "");
eq(noKindFilter !== GOALS_AGG_SQL(true, false), true, "the kind filter is present in GOALS_AGG_SQL (the injection applies)");
eq([rollupCells(tree, aggOf([], GOALS_AGG_SQL(true, false), withCounter)).nodes.find((n) => n.id === "dev").pct, rollupCells(tree, aggOf([], noKindFilter, withCounter)).nodes.find((n) => n.id === "dev").pct], [0, 100],
  "both ways: a counter naming a goal moves nothing through GOALS_AGG_SQL, and WOULD move it without the kind filter");
console.log(`  rollupCells == deriveGoals over ${eqN}/${FIXTURES.length} fixtures (the real GOALS_AGG_SQL on SQLite), and the comparison proven both ways`);


// ---- sprint 4, F1: a goal's money rolled up the tree (rollBudgets, pure: the tree the Goals read already holds) ----
{
  const mt = [
    { id: "root", parent: null, budget: null },
    { id: "gtm", parent: "root", budget: { allocated: 1000, spent: 300, currency: "EUR" } },
    { id: "ads", parent: "gtm", budget: { allocated: 400, spent: 250, currency: "EUR", source: "the ad plan" } },
    { id: "events", parent: "gtm", budget: { spent: 50, currency: "EUR" } },
    { id: "eng", parent: "root", budget: null },
    { id: "loop", parent: "loop", budget: { allocated: 7, currency: "EUR" } },   // a self-loop: counted once, never forever
  ];
  const r = rollBudgets(mt);
  eq(r.get("ads"), { own: { allocated: 400, spent: 250, currency: "EUR", source: "the ad plan" }, sum: { currency: "EUR", allocated: 400, spent: 250, goals: 1 } }, "money: a leaf's sum is its own budget");
  eq(r.get("gtm").sum, { currency: "EUR", allocated: 1400, spent: 600, goals: 3 }, "money: a goal's sum is its own plus every goal below it (a figure not said adds nothing)");
  eq([r.get("root").own, r.get("root").sum], [null, { currency: "EUR", allocated: 1400, spent: 600, goals: 3 }], "money: a goal with no budget of its own sums the goals below it");
  eq(r.get("eng"), { own: null, sum: null }, "money: a branch with no budget anywhere has no sum");
  eq(r.get("loop").sum, { currency: "EUR", allocated: 7, spent: 0, goals: 1 }, "money: a goal that is its own parent counts once");
  const mixed = rollBudgets([...mt.slice(0, 5), { id: "grant", parent: "root", budget: { allocated: 2000, currency: "USD" } }]);
  eq(mixed.get("root").sum, { currency: MIXED, byCurrency: [{ currency: "EUR", allocated: 1400, spent: 600 }, { currency: "USD", allocated: 2000, spent: 0 }], goals: 4 },
    "money: a tree in two currencies reads mixed at the top, each currency added up on its own, never one total");
  eq(mixed.get("gtm").sum.currency, "EUR", "money: a branch in one currency still reads its currency inside a mixed tree");
  eq([budgetWords(r.get("gtm").sum), budgetWords({ allocated: 400, currency: "EUR" }), budgetWords({ spent: 50, currency: "EUR" }), budgetWords(mixed.get("root").sum), budgetWords(null)],
    ["600 of 1,400 EUR spent", "400 EUR allocated", "50 EUR spent", "600 of 1,400 EUR spent · 0 of 2,000 USD spent", ""], "money: the words a page and a tile say");
  // both ways: a rollup that took only a goal's own budget would read gtm at 1000, not 1400
  eq(r.get("gtm").sum.allocated !== r.get("gtm").own.allocated, true, "both ways: the sum is not the goal's own figure (the roll-up can fail)");
  console.log("  rollBudgets: own and subtree sums, one currency or mixed per currency, a cycle counted once");
}

if (fail) { console.log("goals-derive selftest FAILED"); process.exit(1); }
console.log("goals-derive (verifyGoalRef + deriveGoals + proposeGoalRef) selftest: all assertions hold");
