// tools/preview-selftest.mjs — sprint 3, B2: preview, then file. Offline, no worker. Exit 1 on any failure.
//   1. the text render (src/previewtext.js): every line at most 72 columns of plain ASCII, a cut ends in "...", a long
//      preview groups its plain items by kind and still shows EVERY needs, refused and waits-for-the-owner item (up to the
//      listed cap, then counted), about 30 lines however many items, the receipt reads "Filed"
//   2. the digest (src/preview.js digestOf): key order never matters, array order and every value do
//   3. the verdicts: every reason code src/transmission.js gateGrade can produce reads as a sentence (never a code alone),
//      every route maps to a verdict, and the real gate's routes land where the preview says
//   4. reach planning (src/reach.js) on a fixture model in a REAL SQLite database (boot.sql): one hop out of a touched node
//      (k_node_links) AND one hop into it (k_edges), the checks that name it and how many are graded, the goals those checks
//      name, the open questions that name it; a cap that is hit is said
//   5. the stored summary (fitSummary): a preview over 64 KB is stored grouped, its verdicts whole; formOf tells the four forms
//   6. (sprint 12, 12.6) the lines: no comma after a sentence's end ("together? 2 options"), a project named by its slug
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { d1Of } from "./fixtures/home-d1.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { previewText, cut, ascii, WIDTH, MUST_SHOW, lineBody } = await import(join(ENGINE, "src", "previewtext.js"));
const P = await import(join(ENGINE, "src", "preview.js"));
const R = await import(join(ENGINE, "src", "reach.js"));
const { gateGrade } = await import(join(ENGINE, "src", "transmission.js"));

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };

// ---- 1 · the text render ----
const it = (i, kindWord, line, verdict, tab = "build", extra = {}) => ({ i, type: "x", kind: kindWord, kindWord, line, verdict, effect: P.VERDICT_WORDS[verdict], tab, places: [{ tab, path: `/${tab}`, region: "r", what: "w" }], reasons: [], ...extra });
const small = { project: "pricing", items: [
  it(0, "contribution", "Contribution (Build): New pricing tiers (PR 412), moves Paid orders", "files"),
  it(1, "question", "Question: Annual discount: 15% or 20%?, 2 options", "waits_for_owner", "decisions"),
  { ...it(2, "render", "Render: Pricing, state annual, html, 2 KB", "files", "map"), effect: "replaces 1", places: [{ tab: "map", path: "/map/screens", region: "screen-renders", what: "w" }] },
  it(3, "contribution", "Contribution (Code): A toggle — with a very long title that goes on and on beyond any column", "needs", "build", { effect: "needs proof +2" }),
], leftOut: [{ what: "10 messages with no fact or decision", why: "small talk" }], reachLine: "1 screen, 1 flow, 2 doors, 1 goal; 5 graded checks in question", counts: { byVerdict: { files: 2, waits_for_owner: 1, needs: 1 } } };
const t1 = previewText(small, { mode: "preview", org: "Northwind", url: "http://127.0.0.1:8870/preview/P-0123456789abcdef", previewId: "P-0123456789abcdef", parts: [{ tool: "file_contribution", items: [1, 4] }, { tool: "save_knowledge", items: [2, 3] }] });
const L1 = t1.split("\n");
console.log(t1.split("\n").map((l) => "    | " + l).join("\n"));
ok(L1.every((l) => l.length <= WIDTH), `every line at most ${WIDTH} columns (longest ${Math.max(...L1.map((l) => l.length))})`);
ok(L1.every((l) => /^[\x20-\x7e]*$/.test(l)), "plain ASCII only: no box drawing, no colour code, no typographic mark");
ok(L1[0].startsWith("sharingu  Northwind / pricing") && L1[0].endsWith("Preview, nothing filed yet") && L1[0].length === WIDTH, "the header: the product, the org and project, and the state on the right");
ok(L1[1] === "-".repeat(WIDTH) && L1.filter((l) => l === "-".repeat(WIDTH)).length === 2, "two rules of hyphens");
ok(/^ {2}1 {2}contribution {2}New pricing tiers \(.\.\. {2}Build {5}files at once$/.test(L1[2]) || /^ {2}1 {2}contribution {2}New pricing tiers/.test(L1[2]), `row 1 in its columns -> "${L1[2]}"`);
ok(/Screens\s+replaces 1/.test(t1) && /Decisions waits for the owner/.test(t1), "a render names the Screens view and says it replaces one; a question waits for the owner");
ok(L1.some((l) => /A toggle, with a ve\.\.\.|A toggle - with a ve\.\.\.|A toggle.*\.\.\./.test(l)), "a long line is cut with an ellipsis (three dots)");
ok(/^ {2}- {2}left out {6}10 messages with no fact or decision: small talk$/.test(L1.find((l) => /left out/.test(l)) || ""), "what was left out has its own row");
ok(/^ reaches  1 screen, 1 flow, 2 doors, 1 goal; 5 graded checks in question$/m.test(t1) && /^ open     http:\/\/127\.0\.0\.1:8870\/preview\/P-0123456789abcdef$/m.test(t1) && /^ file     file_contribution \{previewId: "P-0123456789abcdef"\} with items\n {10}1 and 4, as previewed$/m.test(t1) && /^ file     save_knowledge \{previewId: "P-0123456789abcdef"\} with items 2\n {10}and 3, as previewed$/m.test(t1), "the reach, the page and each part's exact call (sprint 19: its write tool and its items)");
ok(cut("abcdefghij", 6) === "abc..." && cut("abc", 6) === "abc" && cut("one, two", 7) === "one..." && ascii("a — b … “c”") === 'a - b ... "c"', "cut and ascii: the ellipsis, no trailing comma before it, typographic marks mapped");
ok(lineBody("Goal: Paid orders, under Grow revenue") === "Paid orders, under Grow revenue" && lineBody("Card (Claims): A claim") === "A claim", "lineBody drops the kind word the kind column already says");

// a long preview: 120 plain items, 20 that need one more thing, 3 refused, 5 that wait
const many = []; let n = 0;
for (let k = 0; k < 120; k++) many.push(it(n++, k % 3 ? "screen" : "goal", `Screen: Generated screen ${k}`, "files", k % 3 ? "map" : "goals"));
for (let k = 0; k < 20; k++) many.push({ ...it(n++, "contribution", `Contribution (Code): fix ${k}`, "needs"), effect: "needs proof" });
for (let k = 0; k < 3; k++) many.push(it(n++, "doc", `Doc: roles/x${k}.md`, "refused", "home"));
for (let k = 0; k < 5; k++) many.push(it(n++, "contribution", `Contribution (Leader): pricing ${k}`, "waits_for_owner"));
const big = { project: "pricing", items: many, leftOut: Array.from({ length: 6 }, (_, k) => ({ what: `note ${k}`, why: "noise" })), reachLine: "40 screens; 3 graded checks in question", counts: P.countsOf(many) };
const t2 = previewText(big, { mode: "preview", org: "Northwind", url: "http://x/preview/P-1", previewId: "P-1" });
const L2 = t2.split("\n");
console.log(t2.split("\n").map((l) => "    | " + l).join("\n"));
// the one-pass fix 7: every must-show item is listed with its reason however long that makes the text (up to 40); the plain
// part stays small: the plain items in groups of one kind, one verdict and one effect, each saying its exact count
ok(L2.every((l) => l.length <= WIDTH && /^[\x20-\x7e]*$/.test(l)), `148 items in ${L2.length} lines, every one at most ${WIDTH} ASCII columns`);
ok(/^ {2}\* {2}80 screens: all 80 file at once \(Map\)/m.test(t2) && /^ {2}\* {2}40 goals: all 40 file at once \(Goals\)/m.test(t2), "the plain items are grouped by kind, each saying its count and its one effect");
const mustRows = L2.filter((l) => /^\s*\d+ {2}/.test(l));
ok(mustRows.length === 28 && mustRows.every((l) => /needs|refused|waits for the owner/.test(l)), `every must-show item is listed one by one (${mustRows.length} of 28), never grouped`);
ok(L2.filter((l) => !/^\s*\d+ {2}/.test(l) && !/^ {7}\S/.test(l)).length <= 30, "the plain part (everything but the must-show rows and their reasons) stays within about 30 lines");
ok(MUST_SHOW.every((v) => t2.includes(P.VERDICT_WORDS[v] === "needs one more thing" ? "needs" : P.VERDICT_WORDS[v])) && /items {4}120 file at once, 5 wait for the owner, 20 need one more thing, 3 refused/.test(t2.replace(/\n {10}/g, " ")), "every must-show verdict is shown, and the tally line counts each");
ok(/shown {4}120 items in groups above; every line is on the page/.test(t2), "a grouped preview says every line is on the page");
ok(/left out {6}and 3 more/.test(t2), "a long left-out list says how many more");
// past the cap: 50 that need something -> 40 listed, then how many more, and where they are
const fifty = Array.from({ length: 50 }, (_, k) => ({ ...it(k, "contribution", `Contribution (Code): fix ${k}`, "needs"), effect: "needs proof", reasons: ["It carries no proof."] }));
const t3 = previewText({ project: "p", items: fifty, counts: P.countsOf(fifty), leftOut: [] }, { mode: "preview", url: "http://x/preview/P-2", previewId: "P-2" });
ok(t3.split("\n").filter((l) => /^\s*\d+ {2}/.test(l)).length === 40 && /and 10 more that need something, wait for the owner or are refused: every one is on the page/.test(t3.replace(/\n\s+/g, " ")), "past 40 must-show items: 40 listed, then 'and 10 more' naming the page");
// 71 decided questions, all filed at once: ONE group, its count and its effect, and the page named
const q71 = Array.from({ length: 71 }, (_, k) => it(k, "question", `Question: ruling ${k}, decided`, "files", "decisions"));
const t4 = previewText({ project: "p", items: q71, counts: P.countsOf(q71), leftOut: [] }, { mode: "preview", url: "http://x/preview/P-3", previewId: "P-3" });
ok(/^ {2}\* {2}71 questions: all 71 file at once \(Decisions\)/m.test(t4) && /every line is on the page/.test(t4) && /^ open {5}http:\/\/x\/preview\/P-3$/m.test(t4), "71 questions that all file at once: one group with its count and effect, and the page");
// THE FILL'S OWN 39-CONTRIBUTION PREVIEW (tools/fixtures/fill-c1-preview.json, the old door's answer): every one of the 28 that
// needed something or waited is listed one by one, each with its own reason; no line carries one verdict for items that differ
const FX = JSON.parse(readFileSync(join(ENGINE, "tools", "fixtures", "fill-c1-preview.json"), "utf8"));
const tf = previewText(FX.preview, { mode: "preview", org: "Ryuk Labs", url: "http://x/preview/" + FX.preview.previewId, previewId: FX.preview.previewId });
console.log(tf.split("\n").map((l) => "    | " + l).join("\n"));
const LF = tf.split("\n");
const fillMust = FX.preview.items.filter((x) => MUST_SHOW.includes(x.verdict));
const listed = (x) => LF.some((l) => new RegExp(`^\\s*${x.i + 1} {2}contribution`).test(l));
ok(fillMust.length === 28 && fillMust.every(listed), `the fill: all 28 that needed something or waited are listed one by one (${fillMust.filter(listed).length})`);
ok(fillMust.every((x) => { const at = LF.findIndex((l) => new RegExp(`^\\s*${x.i + 1} {2}contribution`).test(l)); return at >= 0 && /^ {7}\S/.test(LF[at + 1] || ""); }), "the fill: each one carries its own reason on the line under it");
ok(/^ {2}\* {2}11 contributions: all 11 file at once/m.test(tf) && !/\b11: /.test(tf), "the fill: the 11 that file at once are one group saying all 11 file at once (never '11: ... needs proof')");
ok(LF.every((l) => l.length <= WIDTH && /^[\x20-\x7e]*$/.test(l)), "the fill: every line at most 72 ASCII columns");
// ... and its receipt: the 18 filed in one group saying all 18 filed, the 21 left listed one by one (never "23: ... 18 filed")
const tr = previewText(FX.receipt, { mode: "receipt", org: "Ryuk Labs", url: "http://x/preview/" + FX.receipt.previewId, previewId: FX.receipt.previewId });
console.log(tr.split("\n").map((l) => "    | " + l).join("\n"));
const leftRows = tr.split("\n").filter((l) => /^\s*\d+ {2}contribution.*left, not filed$/.test(l));
ok(/^ {2}\* {2}11 contributions: all 11 filed \(Build\)/m.test(tr) && /^ {2}\* {2}7 contributions: all 7 filed, waiting for the owner/m.test(tr) && leftRows.length === 21 && !/\d+: .*\d+ filed/.test(tr),
  `the fill's receipt: the 11 filed and the 7 filed to wait for the owner each one group with its exact count, the 21 left one by one (${leftRows.length})`);
const rc = previewText({ ...small, complete: true, items: small.items.map((x, i) => ({ ...x, filed: i === 3 ? { status: "left" } : { status: "filed", id: `T-20261001-00${i}` } })), filedCount: 3, leftCount: 1 }, { mode: "receipt", org: "Northwind", url: "http://x/preview/P-1", previewId: "P-1" });
console.log(rc.split("\n").map((l) => "    | " + l).join("\n"));
ok(/Filed$/.test(rc.split("\n")[0]) && /Build {5}T-20261001-000$/m.test(rc) && /left, not filed/.test(rc) && /filed {4}3 items; 1 left, as asked/.test(rc), "the receipt: Filed, each item's id, what was left");
const ro = previewText({ ...small, readOnly: true }, { mode: "preview", org: "N" });
ok(/Preview, read-only key$/.test(ro.split("\n")[0]) && /read-only key previews; it never files/.test(ro) && !/ file {5}/.test(ro), "a read-only preview says so and offers no file call");
// the fix-video step: the rehearsal's goal row (an update of one field) kept its fields on a line of their own under the row,
// breaking the table; the fields ride IN the effect column, and an effect longer than its column is cut, never wrapped
const upd = (changes) => ({ project: "sharingu", items: [
  it(0, "contribution", "Contribution (Code): Walkthrough recorder, moves C6", "files"),
  { ...it(1, "goal", "Goal: C6: the walkthrough video recorded again on real data", "files", "goals"), effect: "updates 1", changes },
  it(2, "question", "Question: Which world to record?, 3 options", "files", "decisions")], counts: { byVerdict: { files: 3 } } });
const tu = previewText(upd(["status"]), { mode: "preview", org: "Ryuklabs" }).split("\n"), tu2 = previewText(upd(["note", "status", "title"]), { mode: "preview", org: "Ryuklabs" }).split("\n");
const rowOf = (L, n) => L.findIndex((l) => new RegExp(`^ {2}${n} {2}`).test(l));
ok(/^ {2}2 {2}goal .* updates status$/.test(tu[rowOf(tu, 2)]) && rowOf(tu, 3) === rowOf(tu, 2) + 1 && !tu.some((l) => /^ +changes /.test(l)),
  `an update's fields ride in its effect column, the next row right under it: "${(tu[rowOf(tu, 2)] || "").trim()}"`);
ok(/ updates note, st\.\.\.$/.test(tu2[rowOf(tu2, 2)]) && tu2[rowOf(tu2, 2)].length <= WIDTH && rowOf(tu2, 3) === rowOf(tu2, 2) + 1,
  `an effect longer than its column is cut with "...", never wrapped: "${(tu2[rowOf(tu2, 2)] || "").trim()}"`);

// ---- 2 · the digest ----
const A = [{ kind: "goal", op: "upsert", data: { id: "g", title: "T", parent: null } }, { contribution: { lane: "leader", what: "w", why: "y" } }];
const B = [{ op: "upsert", data: { parent: null, title: "T", id: "g" }, kind: "goal" }, { contribution: { why: "y", what: "w", lane: "leader" } }];
const d1 = await P.digestOf(A), d2 = await P.digestOf(B), d3 = await P.digestOf([A[1], A[0]]), d4 = await P.digestOf([{ ...A[0], data: { ...A[0].data, title: "T2" } }, A[1]]);
ok(/^[0-9a-f]{64}$/.test(d1) && d1 === d2, "the digest ignores key order (canonical JSON)");
ok(d1 !== d3 && d1 !== d4, "the digest sees the order of the items and every value");
ok(P.canon({ b: 1, a: [2, { d: 1, c: null }] }) === '{"a":[2,{"c":null,"d":1}],"b":1}', "canon sorts keys at every depth, keeps arrays and nulls");

// ---- 3 · the verdicts ----
const src = readFileSync(join(ENGINE, "src", "transmission.js"), "utf8");
const codes = new Set([...src.matchAll(/(?:reasons|ownerReasons)\.push\("([a-z:-]+)"\)/g)].map((m) => m[1]));
for (const m of src.matchAll(/ownerReasons\s*=\s*\[([^\]]*)\]/g)) for (const c of m[1].matchAll(/"([a-z-]+)"/g)) codes.add(c[1]);
for (const m of src.matchAll(/\? \["([a-z-]+)"\]/g)) if (!["proof", "components", "screens", "depends"].includes(m[1])) codes.add(m[1]);   // a missing FIELD is not a reason
const fallback = (w) => /^A rule of the door applies/.test(w);
const silent = ["writes-knowledge", "publishes-an-item", "equips-an-item"];   // reserved kinds: their own seams file them, never a preview
const unworded = [...codes].filter((c) => !silent.includes(c) && fallback(P.reasonWords(c)));
ok(codes.size >= 18 && !unworded.length, `every reason code gateGrade pushes reads as a sentence (${codes.size} codes${unworded.length ? `; unworded: ${unworded.join(", ")}` : ""})`);
ok(/^It needs what and why\.$/.test(P.reasonWords("missing:what+why")) && /Screen 301 is not in the project's Map/.test(P.reasonWords("join-key-unverified:301")) && /Component c\/x is not in the project's Map/.test(P.reasonWords("component-key-unverified:c/x")) && /\(made-up\)/.test(P.reasonWords("made-up")),
  "a code with a detail reads its detail; an unknown code sits inside a sentence, never alone");
const vs = () => ({ list: ["301"], valid: [], unknown: ["301"], reserved: [], ok: false });
const routes = [
  [{ lane: "leader", kind: "note", what: "w", why: "y" }, "auto"],
  [{ lane: "leader", kind: "note", what: "change the pricing page", why: "y" }, "owner"],
  [{ lane: "vendor", kind: "update", what: "w", why: "y", touches: ["service:pay"] }, "owner"],
  [{ lane: "code", kind: "pr", what: "w", why: "y", touches: ["x"] }, "incomplete"],
  [{ lane: "gtm", kind: "outreach", what: "w", why: "y", touches: ["c"], proof: "posted it" }, "incomplete"],
  [{ lane: "leader", kind: "critique", what: "w", why: "y", touches: ["x"] }, "owner"],
];
const got = routes.map(([b]) => gateGrade(b, vs, null).route);
ok(JSON.stringify(got) === JSON.stringify(routes.map((r) => r[1])) && got.every((r) => ["files", "waits_for_owner", "needs"].includes(P.ROUTE_VERDICT[r])), `every gate route maps to a verdict: ${got.map((r) => `${r} -> ${P.ROUTE_VERDICT[r]}`).join(", ")}`);
const owner = gateGrade(routes[1][0], vs, null);
ok(owner.grade.ownerReasons.map(P.reasonWords).every((w) => !fallback(w) && /\.$/.test(w)), `an owner route's reasons in words: ${owner.grade.ownerReasons.map(P.reasonWords).join(" ")}`);

// ---- 4 · reach planning on a fixture model, both ways ----
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
const T0 = "2026-10-01T00:00:00.000Z";
db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('p','P',1,'${T0}'); INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('o','O','o@x','owner','h',1,'${T0}',1)`);
const node = db.prepare("INSERT INTO k_nodes (project,id,type,name,created_by,created_at,updated_by,updated_at) VALUES ('p',?,?,?,'o',?,'o',?)");
for (const [id, type, name] of [["door:prices", "door", "GET /prices"], ["table:prices", "table", "prices"], ["flow:buy", "flow", "Buy"], ["screen:pricing", "screen", "Pricing"], ["table:far", "table", "far away"]]) node.run(id, type, name, T0, T0);
const edge = db.prepare("INSERT INTO k_edges (project,from_id,to_id,kind,created_by,created_at,updated_by,updated_at) VALUES ('p',?,?,?,'o',?,'o',?)");
edge.run("door:prices", "table:prices", "reads", T0, T0);        // out of the touched door
edge.run("flow:buy", "door:prices", "flow-step", T0, T0);        // into the touched door
edge.run("screen:pricing", "flow:buy", "nav", T0, T0);           // two hops away: never reached
edge.run("table:prices", "table:far", "relation", T0, T0);       // two hops away: never reached
db.exec(`INSERT INTO k_goals (project,id,parent,title,dimensions,created_by,created_at,updated_by,updated_at) VALUES ('p','paid',NULL,'Paid orders','[]','o','${T0}','o','${T0}')`);
const chk = db.prepare("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('p',?,?,?,'o',?,'o',?)");
chk.run("AC.1", "prices answer", JSON.stringify(["door:prices", "paid"]), T0, T0);
chk.run("AC.2", "prices cached", JSON.stringify(["door:prices"]), T0, T0);
chk.run("AC.3", "far", JSON.stringify(["table:far"]), T0, T0);
db.exec(`INSERT INTO check_results (project,pack_version,check_id,status,graded_by,graded_at) VALUES ('p','live','AC.1','proven','o','${T0}')`);
db.exec(`INSERT INTO k_questions (project,qid,question,status,affects,created_by,created_at,updated_by,updated_at) VALUES ('p','Q-1','Annual discount?','open','["door:prices"]','o','${T0}','o','${T0}'),('p','Q-2','Ruled one','decided','["door:prices"]','o','${T0}','o','${T0}')`);
// a D1 binding over node:sqlite whose batch answers each statement's rows, as D1's does (the fixture's batch only runs)
const withBatch = (d) => ({ ...d, prepare: d.prepare, batch: (list) => Promise.all(list.map((st) => st.all())) });
const D1 = withBatch(d1Of(db));
const env = { DB: D1 };
const collected = R.collectRefs([{ type: "contribution", body: { lane: "leader", what: "w", why: "y", touches: ["door:prices"], depends: ["goal/paid"] } },
  { type: "knowledge", op: { kind: "node", op: "upsert", data: { id: "screen:new", type: "screen", name: "New" } } }]);
const before = D1.statements.length;
const reach = await R.readReach(env, "p", collected);
const ran = D1.statements.length - before;
ok(reach.touched.names.some((x) => x.id === "door:prices") && reach.touched.names.some((x) => x.id === "screen:new" && x.isNew), "touched: the node the item names, and the node the preview itself files (new)");
ok(reach.reached.names.map((x) => x.id).sort().join() === "flow:buy,table:prices", `reached one hop BOTH ways: out (table:prices, k_node_links) and in (flow:buy, k_edges); two hops never -> ${reach.reached.names.map((x) => x.id).join(", ")}`);
ok(reach.checks.total === 2 && reach.checks.graded === 1, `the checks that name it: 2, of which 1 graded (the one a change puts in question) -> ${JSON.stringify(reach.checks)}`);
ok(reach.goals.map((g) => g.id).join() === "paid" && reach.goals[0].title === "Paid orders", "the goals: named by the item and by a check");
ok(reach.asks.map((q) => q.qid).join() === "Q-1", "the open questions that name a touched node (a ruled one is not open)");
ok(ran <= 10 && reach.statements === ran, `bounded: ${ran} statements in two batches`);
ok(R.reachWords(reach) === "1 door, 1 screen, 1 table, 1 flow, 1 goal, 1 question; 1 graded check in question", `the words: ${R.reachWords(reach)}`);
const none = await R.readReach(env, "p", R.collectRefs([]));
ok(none.statements === 0 && R.reachWords(none) === "nothing in the model yet", "nothing touched: no statement at all");
// the caps, said: more touched refs than walked
const wide = R.collectRefs(Array.from({ length: R.REF_MAX + 5 }, (_, k) => ({ type: "contribution", body: { touches: [`ref:${k}`] } })));
const wr = await R.readReach(env, "p", wide);
ok(wr.touched.unwalked === 5 && wr.capped.some((c) => /5 more touched refs were not walked/.test(c)), `a cap that is hit is said: ${wr.capped.join("; ")}`);
// the pure planner, the same answer from hand-written rows
const inp = R.reachInput(collected);
const second = R.secondInput(inp, { out: [{ node_id: "door:prices", links: '[["table:prices","reads"]]' }], in: [{ from_id: "flow:buy", to_id: "door:prices", kind: "flow-step" }], refs: [{ ref: "door:prices", check_id: "AC.1" }] });
ok(second.reachedIds.sort().join() === "flow:buy,table:prices" && second.checkIds.join() === "AC.1", "secondInput: the reached ids both ways and the checks, from the rows alone (pure)");

// ---- 5 · the stored summary, and the four forms ----
const fat = { v: 1, project: "p", items: Array.from({ length: 200 }, (_, k) => ({ ...it(k, "screen", "Screen: " + "x".repeat(300), k < 190 ? "files" : "needs"), reasons: ["y".repeat(120)] })), counts: {}, reach: R.EMPTY_REACH, verdicts: [] };
fat.verdicts = fat.items.map((x) => x.verdict);
const fit = P.fitSummary(fat);
ok(Buffer.byteLength(JSON.stringify(fat)) > P.SUMMARY_MAX && Buffer.byteLength(JSON.stringify(fit)) <= P.SUMMARY_MAX && fit.grouped && fit.items.length === 10 && fit.groups[0].count === 190 && fit.verdicts.length === 200,
  `a summary over 64 KB (${Math.round(Buffer.byteLength(JSON.stringify(fat)) / 1024)} KB) is stored grouped (${Math.round(Buffer.byteLength(JSON.stringify(fit)) / 1024)} KB): the 10 must-show items whole, 190 as one group, all 200 verdicts kept`);
ok(P.formOf({ kind: "goal", op: "upsert", data: {} }) === "knowledge" && P.formOf({ contribution: {} }) === "contribution" && P.formOf({ grade: {} }) === "grade" && P.formOf({ answer: {} }) === "answer"
  && P.formOf({ contribution: {}, grade: {} }) === null && P.formOf({ kind: "goal", contribution: {} }) === null && P.formOf("x") === null && P.formOf({}) === null, "formOf: the four forms, and none for two at once or nothing");
ok(P.refOf("P-0123456789abcdef", "c", 199).length <= 60 && P.refOf("P-0123456789abcdef", "k") === "pv:P-0123456789abcdef:k", "the clientRefs file names each part by fit the door's 60 characters");

// ---- 6 · the day's next contribution id past 999 (migrate-049; src/core.js nextSeqStart, both filing doors) ----
{
  const { nextSeqStart, NEXT_SEQ_SQL } = await import(join(ENGINE, "src", "core.js"));
  const sq = new DatabaseSync(":memory:");
  sq.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  sq.exec(`INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('o','O','o@x','owner','h',1,'${T0}',1)`);
  const ins = sq.prepare("INSERT INTO transmission (id, submitter, lane, kind, what, route, status, created_at, org) VALUES (?, 'o', 'leader', 'note', 'w', 'auto', 'routed', ?, 1)");
  const day = "20261001";
  for (let k = 1; k <= 1000; k++) ins.run(`T-${day}-${String(k).padStart(3, "0")}`, T0);
  ins.run("T-20260930-5000", T0);   // another day's bigger number never counts
  ins.run("T-20261002-001", T0);    // nor the next day's
  const e6 = { DB: d1Of(sq) };
  const oldTop = sq.prepare("SELECT id FROM transmission WHERE id LIKE ? ORDER BY id DESC LIMIT 1").get(`T-${day}-%`).id;
  ok(oldTop === `T-${day}-999`, `the bug, both ways: the text order's top id of a day holding 1,000 is ${oldTop}, so the old next id (1000) collided`);
  ok((await nextSeqStart(e6, day)) === 1001, "nextSeqStart reads the day's top by its number: 1001 after T-…-1000");
  sq.prepare("INSERT INTO transmission (id, submitter, lane, kind, what, route, status, created_at, org) VALUES (?, 'o', 'leader', 'note', 'w', 'auto', 'routed', ?, 1)").run(`T-${day}-${await nextSeqStart(e6, day)}`, T0);
  ok((await nextSeqStart(e6, day)) === 1002 && (await nextSeqStart(e6, "20261003")) === 1, "the 1,001st lands and the next is 1002; an empty day starts at 1");
  const plan = sq.prepare("EXPLAIN QUERY PLAN " + NEXT_SEQ_SQL).all(`T-${day}-`, `T-${day}.`, `T-${day}-`).map((r) => r.detail).join(" | ");
  ok(/COVERING INDEX idx_transmission_day_seq/.test(plan) && !/TEMP B-TREE/.test(plan), `with migrate-049 the read is one walk of its index, no sort -> ${plan}`);
  sq.exec("DROP INDEX idx_transmission_day_seq");
  const plan2 = sq.prepare("EXPLAIN QUERY PLAN " + NEXT_SEQ_SQL).all(`T-${day}-`, `T-${day}.`, `T-${day}-`).map((r) => r.detail).join(" | ");
  ok((await nextSeqStart(e6, day)) === 1002 && /\(id>\? AND id<\?\)/.test(plan2), `without migrate-049 the same statement is still right, bounded to the day's range -> ${plan2}`);
}

// D1b item 14: the terminal text keeps a one-column character ("§0", "café") and turns only a wide or control one into "?";
// the reach line counts every goal (46), not the 25 it names
{
  ok(ascii("§0 café, naïve") === "§0 café, naïve" && ascii("日本") === "??" && ascii("a\u0007b") === "a?b" && ascii("“x” — y") === '"x" - y', `ascii keeps one-column text: ${ascii("§0 café, naïve")} · ${ascii("日本")}`);
  const goals = Array.from({ length: 25 }, (_, i) => ({ id: "g" + i, title: "G" + i, href: "/goals/g" + i }));
  ok(/^46 goals$/.test(R.reachWords({ touched: { byType: {} }, reached: { byType: {} }, goals, goalsMore: 21, checks: {} })), `the reach line counts 46 goals, the 25 named and 21 more: ${R.reachWords({ touched: { byType: {} }, reached: { byType: {} }, goals, goalsMore: 21, checks: {} })}`);
}

// ---- 6 · sprint 12, 12.6: the lines a person reads ----
{
  const S = await import(join(ENGINE, "src", "knowledge", "schema.js"));
  const { shapePreviewLine } = await import(join(ENGINE, "src", "shapes.js"));
  const { projectSlug } = await import(join(ENGINE, "src", "project.js"));
  const q = S.previewLine("question", { qid: "Q-1", question: "Do the connector and the plugin go together?", options: [{ what: "a" }, { what: "b" }] });
  const c = shapePreviewLine({ lane: "leader", kind: "note", what: "Ship it!", why: "w", goalRef: "g1" }, { names: { g1: "M4" } });
  ok(q === "Question: Do the connector and the plugin go together? 2 options" && c === "Contribution (Leader): Ship it! moves M4", `no comma after a question or exclamation mark: "${q}" · "${c}"`);
  ok(typeof S.lineJoins === "function" && S.lineJoins("Done., then e.g., this; v1.2, x") === "Done. then e.g., this; v1.2, x", `a full stop after a word drops its comma; an abbreviation and a version keep theirs (${typeof S.lineJoins === "function" ? S.lineJoins("Done., then e.g., this; v1.2, x") : "no lineJoins"})`);
  ok(typeof projectSlug === "function" && projectSlug("o3--sharingu") === "sharingu" && projectSlug("siru") === "siru" && projectSlug("") === "", "a project key reads as its slug: o3--sharingu -> sharingu; org 1's bare keys as themselves");
  const h = previewText({ project: "o3--sharingu", items: [] }, { org: "Review" }).split("\n")[0];
  ok(h.startsWith("sharingu  Review / sharingu ") && !/o3--/.test(h), `the text's header names the project by its slug, never o3--: ${h}`);
}

console.log(`preview-selftest: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
