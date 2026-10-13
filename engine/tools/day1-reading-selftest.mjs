// day1-reading-selftest.mjs — the ratchet for B7b THE READING (Q60CCC574: a key + one MCP URL make a rung-1 citizen in
// about five minutes). Offline: an in-memory SQLite built from boot.sql behind a tiny D1 shim (so every eval filter is
// proven on real SQL, json_extract and LIKE included — never by matching the query text) and a fake R2. Locks, per
// walk defect:
//   W2  heartbeat's blockers carry their titles [{id,title}]. QE6B9CEBA Fork 1 (1) (U-MCP-tail-a, re-pinned by name): the
//       set is the project's open questions (D1, k_questions) the ONE owedBy says the owner owes (ownerOwedOnce) — the
//       owner's heartbeat, `state` for everyone and the thread brief + its badge read that ONE set; the served
//       questionnaire (openQuestions) is never read.
//   W3  `state` answers a SHORT picture of the project read (< 4 KB): the org, the project, its aim (k_aim), when its
//       knowledge last changed (asOf: its newest preview then file row), titled blockers, the person's own projects and
//       open items; full:true adds what the project still needs (the holes answer). No R2 state file is read.
//   W4  `library` lists the project's docs (k_docs) with start-here.md FIRST; `doc` start-here.md answers the project's own
//       doc, else the built-in text — which names only door tools (never land · deploy · publish · consent · reopen),
//       explains every tempo word, and carries no engine or org name of its own (both come from the seam).
//   W5  `holes` takes `project`: a seat reads that project; an unseated one is refused with the list; every open piece's
//       fillPath is a door call (preview, or rule_question: the one-pass fix 8), and nothing in the reply says serve/ or
//       publish.
//   W8  an incomplete filing on the thread wears "needs more" (tempo-selftest locks tempoOf itself).
//   W12 the suites' fixed seats (eval-fixed-*) and eval-marked payloads stay out of a REAL seat's heartbeat feed and
//       read; a fixed seat sees them by default; an explicit eval arg wins.
//   B7d (the re-walk): S1 the start-here carries the gloss's sentence · S2 state names only the person's own scope ·
//       S4b thread detail names the project · S7d a member's heartbeat has no org blockers (the owner keeps them) · S7b
//       clip never cuts mid-word · S8 a declared test seat (the org's settings.evalSeats) and a row about an eval=1 transmission stay
//       out of a real seat's feed.
// Run in the gate (next to day1-door-selftest).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { callTool, handleMcp, libraryDocs, instructionsFor, START_HERE_DOC } from "../src/mcp.js";
import { heartbeatFor, ownerOwedOnce, stateSummaryFor, briefCountFor, clip, orgNoteDefault, declaredEvalSeats } from "../src/core.js";
import { readDecisions, owedBy } from "../src/decisions.js";
import { installReqMemo } from "../src/reqmemo.js";
import { DECISIONS_LIVE_SQL, OWNER_OWED_LIVE_SQL } from "../src/hotsql.js";
import { threadFor } from "../src/thread.js";
import { startHereText, START_HERE_TOOLS } from "../src/starthere.js";
import { TEMPO_WORDS } from "../src/tempo.js";
import { evalView, isEvalSeat, EVAL_SEAT_PREFIX } from "../src/util.js";
import { seedQuestions } from "./fixtures/decisions-pack.mjs";
import { seedOrg } from "./fixtures/org-row.mjs";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } };

// ---- a real schema behind a D1-shaped shim, and an R2-shaped map ----
function d1(db) {
  const norm = (a) => a.map((v) => (v === undefined ? null : v));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, norm(a)),
    all: async () => ({ results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return { prepare: (sql) => stmt(sql) };
}
function r2(map) {
  return {
    get: async (k) => (Object.prototype.hasOwnProperty.call(map, k) ? { text: async () => map[k] } : null),
    head: async (k) => (Object.prototype.hasOwnProperty.call(map, k) ? { key: k } : null),
    list: async (o) => ({ objects: Object.keys(map).filter((k) => k.startsWith((o && o.prefix) || "")).map((key) => ({ key })) }),
    put: async (k, v) => { map[k] = String(v); }, delete: async (k) => { delete map[k]; },
  };
}
const T = (m) => new Date(Date.UTC(2026, 8, 20, 10, m)).toISOString();
function seeded(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,lane,org) VALUES (?,?,?,?,?,1,?,?,1)");
  P.run("p-owner", "Olive Owner", "o@org.test", "owner", "h0", T(0), "all");
  P.run("p-day1", "Dana Day1", "d@org.test", "member", "h1", T(0), "code");
  P.run("p-peer", "Pat Peer", "p@org.test", "member", "h2", T(0), "code");
  P.run("eval-fixed-member", "Eval Seat", "e@org.test", "member", "h3", T(0), "code");
  P.run("eval-fixed-owner", "Eval Run Owner", "eo@org.test", "owner", "h4", T(0), "all");
  const J = db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)");
  J.run("alpha", "Alpha", T(0)); J.run("beta", "Beta", T(0)); J.run("gamma", "Gamma", T(0));
  const S = db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
  for (const k of ["alpha", "beta"]) { S.run("p-day1", k, "member", T(0)); S.run("eval-fixed-member", k, "member", T(0)); }
  const E = db.prepare("INSERT INTO events (id,session_id,person_id,kind,payload_json,created_at,touches,stamped,org) VALUES (?,?,?,?,?,?,?,1,1)");
  E.run("e-mine", null, "p-day1", "fragment", JSON.stringify({ what: "day1 was here" }), T(1), null);
  E.run("e-emine", null, "eval-fixed-member", "fragment", JSON.stringify({ what: "the seat was here", eval: 1 }), T(1), null);
  E.run("e-real", null, "p-peer", "drift", JSON.stringify({ what: "a real drift in code" }), T(5), "code");
  E.run("e-mark", null, "p-peer", "drift", JSON.stringify({ what: "an eval-marked drift", eval: 1 }), T(6), "code");
  E.run("e-seat", null, "eval-fixed-owner", "ruling", JSON.stringify({ what: "a suite seat's ruling" }), T(7), "code");
  // B7d S8: the live escape — a TEST seat minted with a uuid id (an org's settings.evalSeats), its rows carrying no eval mark,
  // and a ruling about a suite filing (payload.transmissionId names an eval=1 transmission) by a real-looking seat
  P.run("8c1f0e2a-uuid-seat", "Test Seat", "evalseat@org.test", "internal-eng", "h5", T(0), "code");
  E.run("e-uuid", null, "8c1f0e2a-uuid-seat", "fragment", JSON.stringify({ artifactId: "A-1", title: "a declared test seat's document" }), T(7), null);
  E.run("e-txeval", null, "p-peer", "ruling", JSON.stringify({ what: "a ruling on a suite filing", transmissionId: "T-EVAL" }), T(7), "code");
  const L = db.prepare("INSERT INTO loops (id,person_id,title,status,opened_at,ref,org) VALUES (?,?,?,'open',?,?,1)");
  L.run("l-real", "p-peer", "peer is on the checkout", T(2), "screen:100");
  L.run("l-seat", "eval-fixed-owner", "the suite is on a ref", T(3), "screen:200");
  L.run("l-day1", "p-day1", "finish my first note", T(4), null);
  const X = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,created_at,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)");
  X.run("T-1", "p-day1", "code", "pr", "a code change without proof", "why", "code", "incomplete", "routed", 0, T(8), "alpha");
  X.run("T-2", "p-day1", "leader", "note", "a plain note", "why", "notes", "auto", "routed", 0, T(9), "alpha");
  X.run("T-EVAL", "p-peer", "code", "pr", "a suite filing", "why", "code", "auto", "routed", 1, T(6), "alpha");
  if (!o.noQuestions) { seedQuestions(db, "alpha", ALPHA_ROWS, "p-owner"); seedQuestions(db, "beta", BETA_ROWS, "p-owner"); }
  return db;
}
// the org row: its name, and the seat it declares a test seat (settings.evalSeats)
const ORG = { name: "Testorg", settings: { evalSeats: ["EvalSeat@org.test"] } };
// QE6B9CEBA: the questions the owner's blockers come from, each one project's (D1, k_questions). Alpha's owe the owner
// two open rows (one titled by its label) and a third the owner is asked to rule, plus a code row and a ruled row; beta's
// owe none (a code row). An org-level read (no project, in this three-project org) reads no question at all.
const ALPHA_ROWS = [
  { qid: "QROOT1", question: "Pick the Cloudflare plan", status: "open", whoOwes: "owner", severity: "high", options: [{ what: "Free" }, { what: "Paid" }] },
  { qid: "QROOT2", question: "", label: "The account token", status: "open", whoOwes: "owner", options: [{ what: "Mint it" }, { what: "Wait" }] },
  { qid: "QROOT3", question: "A scan settles this", status: "open", whoOwes: "code", options: [{ what: "Scan" }, { what: "Skip" }] },
  { qid: "QROOT4", question: "Already ruled", status: "decided", choice: "0", label: "Done", whoOwes: "owner", options: [{ what: "Done" }, { what: "Not yet" }] },
  { qid: "QROOT6", question: "Answered through the link", status: "open", whoOwes: "owner", options: [{ what: "Yes" }, { what: "No" }] },
];
const BETA_ROWS = [{ qid: "QBETA1", question: "Beta's code question", status: "open", whoOwes: "code", options: [{ what: "B" }, { what: "C" }] }];
const OWED = [{ id: "QROOT1", title: "Pick the Cloudflare plan" }, { id: "QROOT2", title: "The account token" }, { id: "QROOT6", title: "Answered through the link" }];
// answerThroughLink(db, qid, { approved, unapplied }) — an answer filed on alpha's question (the live overlay): undecided (a
// member's, with the owner: still owed), or approved by the owner (the ruling through the link: owed no more; unapplied:
// the ruling did not land, the question is still open and still owed)
// approved: the owner approved it, and the link ruled the question (decided, option A) — unless unapplied: the approve
// stands but the ruling did not land (the question stays open, F7)
function answerThroughLink(db, qid, o = {}) {
  db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,decision,eval,created_at,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)")
    .run("T-ANS-" + qid + (o.approved ? "-OK" : ""), "p-peer", "leader", "answer", qid + " — A: yes", "the peer chose", null, "auto", o.approved ? "closed" : "routed", o.approved ? "approve" : null, 0, T(12), "alpha");
  db.prepare("INSERT INTO transmission_refs (tid, ref) VALUES (?, ?)").run("T-ANS-" + qid + (o.approved ? "-OK" : ""), "q/" + qid);
  if (o.approved && !o.unapplied) db.prepare("UPDATE k_questions SET status = 'decided', choice = '0', label = 'yes' WHERE project = 'alpha' AND qid = ?").run(qid);
}
// inAlpha(env) — the same env read in alpha's scope (src/project.js inProject, as resolveProject sets it)
const inAlpha = (env) => ({ ...env, [Symbol.for("sharingu.project")]: "alpha" });
// the project's knowledge in D1: alpha's aim, its docs (one for engineers only) and ONE preview then file ledger row (the
// "as of"); beta has none. The org's name is its org row; nothing is served from R2.
const ALPHA_AIM = "Ship the day-1 path so a newcomer is working in five minutes.";
const KNOWLEDGE_AT = T(11);
function seedKnowledge(db, o = {}) {
  const K = (sql, ...a) => db.prepare(sql).run(...a);
  K("INSERT INTO k_aim (project,aim,measure,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,NULL,'p-owner',?,'p-owner',?)", o.aim || ALPHA_AIM, T(11), T(11));
  const D = db.prepare("INSERT INTO k_docs (project,path,title,body_md,role_visibility,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,?,'p-owner',?,'p-owner',?)");
  D.run("docs/zeta.md", "Zeta", "# zeta", null, T(11), T(11));
  D.run("arch/aardvark.md", "Aardvark", "# a", null, T(11), T(11));
  D.run("eng/only.md", "Engineers only", "# for engineers", JSON.stringify(["internal-eng"]), T(11), T(11));
  db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,created_at,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)")
    .run("T-K1", "p-owner", "leader", "knowledge", "1 aim, 3 docs written", "the knowledge door", "aim", "auto", "routed", 0, KNOWLEDGE_AT, "alpha");
}
function envWith(extra = {}, o = {}) {
  const db = seeded(o);
  seedOrg(db, o.org || ORG);
  if (!o.noKnowledge) seedKnowledge(db, o);
  const map = { ...extra };
  return { env: asOrg({ DB: d1(db), BRAIN: r2(map) }), db, map };   // signed in to org 1 (src/data.js)
}
const person = (id, over = {}) => ({ id, name: id, role: "member", lane: "code", ...over });
// the registry rows these calls reach, with MCP_TOOLS' own project flag (U-MCP D3: every project-scoped read is project:true)
// — callTool resolves the read scope from the flag, as it does for the real registry. D5: updates, read, missing
//
const TOOLS = ["updates", "read", "missing", "brief"].map((name) => ({ name, owner: false, project: true }));
const call = async (env, name, a, who) => callTool(name, a, who, env, new URL("https://x/mcp"), TOOLS);
const noHumanVerbTool = (text) => ![...String(text).matchAll(/`([a-z_]+)`/g)].some((m) => /(^|_)(land|deploy|publish|consent|reopen)(_|$)/.test(m[1]));

// ===================== W12 · evalView, the one reading =====================
{
  ok(EVAL_SEAT_PREFIX === "eval-fixed-" && isEvalSeat("eval-fixed-member") && !isEvalSeat("p-day1") && !isEvalSeat(null), "isEvalSeat reads the fixed seats' prefix (tools/lib-mint-seat.sh MINT_RUN_PIDS)");
  ok(evalView(undefined, "p-day1") === false && evalView(null, "eval-fixed-owner") === true && evalView("", "eval-fixed-owner") === true, "absent -> by seat");
  ok(evalView(true, "p-day1") === true && evalView("1", "p-day1") === true && evalView(false, "eval-fixed-owner") === false && evalView("0", "eval-fixed-owner") === false, "an explicit eval arg wins either way");
}

// ===================== B7e C4 · a suite send's banked fragment (a report of an eval transmission) =====================
{
  const { env, db } = envWith();
  const E = db.prepare("INSERT INTO events (id,session_id,person_id,kind,payload_json,created_at,touches,stamped,org) VALUES (?,?,?,?,?,?,?,1,1)");
  const X = db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,created_at,project,report,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  // the live leak's shape: a peer's composer send, banked UNMARKED (before B7e), whose transmission is eval=1
  E.run("e-sent-eval", null, "p-peer", "fragment", JSON.stringify({ artifactId: "A-SENT-EVAL", title: "here is the note on 001 — eval document", group: "sent" }), T(10), null);
  X.run("T-SENT-EVAL", "p-peer", "code", "doc", "here is the note on 001 — eval document", "why", null, "auto", "routed", 1, T(10), "alpha", "A-SENT-EVAL");
  // the same shape, but a REAL send (eval=0) — it must stay
  E.run("e-sent-real", null, "p-peer", "fragment", JSON.stringify({ artifactId: "A-SENT-REAL", title: "a real sent document", group: "sent" }), T(11), null);
  X.run("T-SENT-REAL", "p-peer", "code", "doc", "a real sent document", "why", null, "auto", "routed", 0, T(11), "alpha", "A-SENT-REAL");
  const w = async (o) => (await heartbeatFor(person("p-day1", { lane: "all" }), env, o)).inYourLane.map((x) => x.what);
  const dflt = await w(undefined), asked = await w({ includeEval: true });
  ok(!dflt.includes("here is the note on 001 — eval document") && dflt.includes("a real sent document"), `B7e C4: default heartbeat leaves out a fragment whose artifact is an eval transmission's report, keeps a real one -> ${JSON.stringify(dflt)}`);
  ok(asked.includes("here is the note on 001 — eval document") && asked.includes("a real sent document"), "B7e C4: eval=true shows it");
  const hb = await call(env, "updates", {}, person("p-day1", { lane: "all" }));
  ok(!JSON.stringify(hb).includes("here is the note on 001"), "B7e C4: the MCP updates tool reads the same seam");
}

// ===================== W2 + W12 · heartbeat =====================
{
  const { env: orgEnv } = envWith();
  const env = inAlpha(orgEnv);
  // QE6B9CEBA Fork 1 (1): ownerOwedOnce is the project's open questions the ONE owedBy says the owner owes, titled by the row
  const owedHere = await ownerOwedOnce(env);
  ok(JSON.stringify(owedHere) === JSON.stringify(OWED), `ownerOwedOnce: alpha's owner-owed open rows, titled (question, else label) — no code row, no ruled row -> ${JSON.stringify(owedHere)}`);
  const dec = await readDecisions(env, { role: "owner" }, {});
  const decYou = dec.rows.filter((r) => owedBy(r, { role: "owner" }, r.live) === "you").map((r) => r.qid);
  ok(JSON.stringify(owedHere.map((b) => b.id)) === JSON.stringify(decYou) && dec.counts.yours === owedHere.length, `…the SAME set Decisions' "Open: yours" counts (${dec.counts.yours}) -> ${JSON.stringify(decYou)}`);
  ok(JSON.stringify(await ownerOwedOnce(orgEnv)) === "[]", "the org level (no project named, three active projects) reads no question: a question is one project's -> []");
  ok(JSON.stringify(await ownerOwedOnce(inAlpha(envWith({}, { noQuestions: true }).env))) === "[]", "no question filed -> [] (an honest empty, never a throw)");
  const down = inAlpha(envWith().env); const rawPrepare = down.DB.prepare;
  down.DB = { prepare: (sql) => { if (/FROM k_questions/.test(sql)) throw new Error("D1_ERROR: network connection lost"); return rawPrepare(sql); } };
  ok(JSON.stringify(await ownerOwedOnce(down)) === "[]", "a failed questions read -> []");
  const answered = envWith(); answerThroughLink(answered.db, "QROOT6");
  ok(JSON.stringify(await ownerOwedOnce(inAlpha(answered.env))) === JSON.stringify(OWED), "a member's answer on a row (not provisional) keeps it the owner's to rule (the live overlay)");
  const unapplied = envWith(); answerThroughLink(unapplied.db, "QROOT6", { approved: true, unapplied: true });
  ok(JSON.stringify(await ownerOwedOnce(inAlpha(unapplied.env))) === JSON.stringify(OWED), "F7 · an answer the owner approved whose ruling did NOT apply (the question still open) keeps it the owner's to rule");
  answerThroughLink(answered.db, "QROOT6", { approved: true });
  ok(JSON.stringify(await ownerOwedOnce(inAlpha(answered.env))) === JSON.stringify(OWED.slice(0, 2)), "an answer the owner approved (the ruling through the link) drops the row out at once");

  const whats = (hb) => hb.inYourLane.map((x) => x.what).sort();
  const real = await heartbeatFor(person("p-day1"), env);
  // B7d S7d: the org's blockers wait on the OWNER — a member's waitingOnYou.blockers is [] (still a list); the owner's is titled
  ok(Array.isArray(real.waitingOnYou.blockers) && real.waitingOnYou.blockers.length === 0, `B7d S7d: a member's waitingOnYou.blockers is empty -> ${JSON.stringify(real.waitingOnYou.blockers)}`);
  const own = await heartbeatFor(person("p-owner", { role: "owner", lane: "all" }), env);
  ok(JSON.stringify(own.waitingOnYou.blockers) === JSON.stringify(OWED) && JSON.stringify(own.waitingOnYou.blockers) === JSON.stringify(owedHere), `QE6B9CEBA: the owner's heartbeat blockers are alpha's owner-owed questions, titled -> ${JSON.stringify(own.waitingOnYou.blockers)}`);
  // when the project's knowledge last changed (its newest preview then file row), the same for the owner and a member; no
  // served build stamp or brain version any more; elsewhere is explained
  ok(real.knowledgeAt === KNOWLEDGE_AT && own.knowledgeAt === KNOWLEDGE_AT && !("agentRAsOf" in real) && !("brainVersion" in own), `knowledgeAt is alpha's newest knowledge write -> ${real.knowledgeAt}`);
  ok((await heartbeatFor(person("p-day1"), inAlpha(envWith({}, { noKnowledge: true }).env))).knowledgeAt === null && (await heartbeatFor(person("p-day1"), orgEnv)).knowledgeAt === null, "…null with nothing filed, and at the org level");
  ok(Number.isInteger(real.elsewhere) && /`elsewhere` counts what moved in other lanes/.test(real.note), "B7d S7a: elsewhere stays an int and the note says what it counts");
  ok(JSON.stringify(whats(real)) === JSON.stringify(["a real drift in code"]), `a real seat's feed: the real drift only (no eval-marked row, no fixed seat's row, no declared test seat's row, no ruling on a suite filing) -> ${JSON.stringify(whats(real))}`);
  ok(real.elsewhere === 0 && Array.isArray(real.waitingOnYou.openLoops) && real.you && "knowledgeAt" in real && "sinceYouWereLast" in real && "doNotEnrich" in real && !/brain/.test(JSON.stringify(real.doNotEnrich)), "the heartbeat's fields (GET /updates is read by L)");
  const realAsked = await heartbeatFor(person("p-day1"), env, { includeEval: true });
  ok(JSON.stringify(whats(realAsked)) === JSON.stringify(["a declared test seat's document", "a real drift in code", "a ruling on a suite filing", "a suite seat's ruling", "an eval-marked drift"]), `eval=true shows a real seat every suite row -> ${JSON.stringify(whats(realAsked))}`);
  const seat = await heartbeatFor(person("eval-fixed-member"), env);
  ok(whats(seat).length === 5, `a fixed seat sees the suites' rows by default -> ${JSON.stringify(whats(seat))}`);
  // B7d S8: the declared test seat (uuid id, no prefix) — by the org's declaration, never a name match
  const allLane = await heartbeatFor(person("p-day1", { lane: "all" }), env);
  const allAsked = await heartbeatFor(person("p-day1", { lane: "all" }), env, { includeEval: true });
  ok(!whats(allLane).includes("a declared test seat's document") && whats(allAsked).includes("a declared test seat's document"), `B7d S8: a declared test seat's row is out of a real seat's feed, in with eval=true -> ${JSON.stringify(whats(allLane))}`);
  ok(!whats(allLane).includes("a ruling on a suite filing") && whats(allAsked).includes("a ruling on a suite filing"), "B7d S8: a row about an eval=1 transmission is out of a real seat's feed, in with eval=true");
  ok(JSON.stringify(declaredEvalSeats({ evalSeats: [" A@B ", "a@b", "", null, "id-1"] })) === '["a@b","id-1"]' && declaredEvalSeats({}).length === 0 && declaredEvalSeats(null).length === 0, "B7d S8: declaredEvalSeats reads the org's list (lowercased, deduped), else none");
  const declaredSelf = await heartbeatFor(person("zz-declared-by-email", { lane: "all", email: "EvalSeat@org.test" }), env);
  ok(whats(declaredSelf).includes("an eval-marked drift"), "B7d S8: a declared test seat itself sees the suites' rows by default (as a fixed seat does)");
  const seatAsReal = await heartbeatFor(person("eval-fixed-member"), env, { includeEval: false });
  ok(JSON.stringify(whats(seatAsReal)) === JSON.stringify(["a real drift in code"]), `a fixed seat with eval=false reads as a real seat -> ${JSON.stringify(whats(seatAsReal))}`);
  const viaTool = JSON.parse(JSON.stringify(await call(env, "updates", {}, person("p-day1"))));
  ok(viaTool.inYourLane.length === 1 && viaTool.waitingOnYou.blockers.length === 0 && viaTool.asOf === KNOWLEDGE_AT, "the MCP updates tool reads the same seam (real seat: no blockers waiting on them, alpha's asOf)");
  // re-pinned by name (U-MCP Fork 2 (1), Q0D506BBC; QE6B9CEBA Fork 1 (1)): heartbeat is project-scoped, so the owner with no
  // project reads the org's first ACTIVE project (alpha), whose questions owe the owner three rows; naming beta reads beta's
  // (a code row only: none)
  const ownerEnv = envWith().env;
  const viaToolOwner = JSON.parse(JSON.stringify(await call(ownerEnv, "updates", {}, person("p-owner", { role: "owner", lane: "all" }))));
  ok(JSON.stringify(viaToolOwner.waitingOnYou.blockers) === JSON.stringify(OWED), `the MCP heartbeat tool: the owner's blockers are alpha's owner-owed questions, titled -> ${JSON.stringify(viaToolOwner.waitingOnYou.blockers)}`);
  const viaToolOwnerBeta = JSON.parse(JSON.stringify(await call(ownerEnv, "updates", { project: "beta" }, person("p-owner", { role: "owner", lane: "all" }))));
  ok(JSON.stringify(viaToolOwnerBeta.waitingOnYou.blockers) === "[]", `U-MCP: the owner naming beta reads beta's questions (no owner row), never alpha's -> ${JSON.stringify(viaToolOwnerBeta.waitingOnYou.blockers)}`);
  const viaToolDay1Alpha = JSON.parse(JSON.stringify(await call(ownerEnv, "updates", { project: "alpha" }, person("p-day1"))));
  ok(JSON.stringify(viaToolDay1Alpha.waitingOnYou.blockers) === "[]", "B7d S7d: a member's heartbeat naming alpha stays [] (only the owner owes them)");
  const viaToolEval = await call(env, "updates", { eval: true }, person("p-day1"));
  ok(viaToolEval.inYourLane.length === 5, "the MCP heartbeat tool honours eval=true");
}

// ===================== QE6B9CEBA · the thread brief and its badge read ONE blockers set, once per request =====================
{
  const { env: orgEnv, db } = envWith();
  const env = inAlpha(orgEnv);
  const owner = person("p-owner", { role: "owner", lane: "all" });
  db.prepare("INSERT INTO loops (id,person_id,title,status,opened_at,ref,org) VALUES (?,?,?,'open',?,?,1)").run("l-own", "p-owner", "the owner's own open item", T(4), null);
  db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,eval,created_at,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)")
    .run("T-OWN", "p-peer", "code", "pr", "a change with the owner", "why", "code", "owner", "routed", 0, T(10), "alpha");
  const n = await briefCountFor(owner, env);
  ok(n === 1 + 1 + OWED.length, `the owner's badge is their open item + the pending ruling + alpha's owner-owed questions -> ${n}`);
  const mn = await briefCountFor(person("p-day1"), env);
  ok(mn === 1, `a member's badge carries no owner blockers: their one open item (${mn})`);
  // one request, one reading: the badge, the heartbeat and state share ONE overlay statement (reqMemo). Sprint 2 (the
  // live budget): with no whole overlay read in the request, that statement is the open questions' answers (OWNER_OWED_LIVE_SQL)
  let lives = 0;
  const DB = { prepare: (sql) => { if (sql === OWNER_OWED_LIVE_SQL(false) || sql === DECISIONS_LIVE_SQL(false)) lives++; return env.DB.prepare(sql); } };
  const req = installReqMemo({ ...env, DB });
  await Promise.all([briefCountFor(owner, req), heartbeatFor(owner, req, { includeEval: false }), stateSummaryFor(owner, req, {})]);
  ok(lives === 1, `the badge + heartbeat + state on ONE request run the overlay statement once -> ${lives}`);
  lives = 0;
  const bare = { ...env, DB };
  await Promise.all([briefCountFor(owner, bare), briefCountFor(owner, bare)]);
  ok(lives === 2, `the instrument: with no request memo two badge reads read it twice -> ${lives}`);
  // a write tool in a JSON-RPC batch drops the memoized overlay + owner blockers (mcp.js callTool -> forgetReqMemo), so the
  // next message re-reads them; a read tool keeps them
  const req2 = installReqMemo({ ...orgEnv });
  const before = (await call(req2, "updates", {}, owner)).blockers.map((x) => x.id);
  // a member's answer on the code-owed QROOT3 (the live overlay): it becomes the owner's to rule
  answerThroughLink(db, "QROOT3");
  const kept = (await call(req2, "updates", {}, owner)).blockers.map((x) => x.id);
  const WRITE_TOOLS = [...TOOLS, { name: "zz_probe_write", owner: false, write: true }];
  await callTool("zz_probe_write", {}, owner, req2, new URL("https://x/mcp"), WRITE_TOOLS);
  const after = (await call(req2, "updates", {}, owner)).blockers.map((x) => x.id);
  ok(JSON.stringify(before) === '["QROOT1","QROOT2","QROOT6"]' && JSON.stringify(kept) === JSON.stringify(before) && JSON.stringify(after) === '["QROOT1","QROOT2","QROOT3","QROOT6"]',
    `after a write tool the same request re-reads the owner's blockers (a read kept the memo: ${JSON.stringify(kept)}; after the write: ${JSON.stringify(after)})`);
}

// ===================== W3 · state =====================
{
  const { env } = envWith();
  const who = person("p-day1", { name: "Dana Day1" });
  const s = await stateSummaryFor(who, inAlpha(env), {});
  const text = JSON.stringify(s, null, 2);   // the bytes the MCP reply carries (mcp.js asText)
  ok(Buffer.byteLength(text) < 4096, `the default summary is short -> ${Buffer.byteLength(text)} bytes (< 4096)`);
  for (const k of ["org", "project", "aim", "asOf", "ageDays", "blockers", "activeProject", "yourProjects", "more"]) ok(k in s, `summary carries ${k}`);
  ok(!("readiness" in s) && !("rightNow" in s) && !("brainVersion" in s) && !("counts" in s) && !("about" in s), "no served-state field: readiness, rightNow, brainVersion, counts, about");
  ok(s.org === "Testorg" && s.aim === ALPHA_AIM && s.asOf === KNOWLEDGE_AT && typeof s.ageDays === "number", `org from the seam; the aim (k_aim); asOf = alpha's newest knowledge write -> ${s.asOf}`);
  ok(JSON.stringify(s.blockers) === JSON.stringify(OWED), `QE6B9CEBA: a member's state lists alpha's owner-owed questions, titled (state gives them to everyone) -> ${JSON.stringify(s.blockers)}`);
  const own = await stateSummaryFor(person("p-owner", { role: "owner", lane: "all" }), inAlpha(env), {});
  const ownHb = await heartbeatFor(person("p-owner", { role: "owner", lane: "all" }), inAlpha(env));
  ok(JSON.stringify(own.blockers) === JSON.stringify(s.blockers) && JSON.stringify(ownHb.waitingOnYou.blockers) === JSON.stringify(own.blockers) && ownHb.knowledgeAt === own.asOf,
    "the owner's state blockers == a member's == the owner's heartbeat blockers (one set); the heartbeat's knowledgeAt == state's asOf");
  const stAlpha = await call(env, "updates", { project: "alpha" }, who);
  ok(JSON.stringify(stAlpha.blockers) === JSON.stringify(OWED) && stAlpha.aim === ALPHA_AIM, `updates naming alpha lists alpha's owner-owed questions and its aim -> ${JSON.stringify(stAlpha.blockers)}`);
  ok(s.yourProjects.length === 2 && JSON.stringify(s.yourProjects) === JSON.stringify([{ key: "alpha", name: "Alpha" }, { key: "beta", name: "Beta" }]), `each of the person's own projects, named -> ${JSON.stringify(s.yourProjects)}`);
  // U-MCP D6 (Q0D506BBC + Q93B3F368): state names the project it READ ({key, name}; the org root: null)
  const root = await stateSummaryFor(who, env, {});
  ok(root.project === null && root.aim === null && root.asOf === null && /org level/.test(root.more), `U-MCP D6: an unscoped read names no project, no aim, no asOf -> ${JSON.stringify(root.project)}`);
  const named = await call(env, "updates", { project: "beta" }, who);
  ok(named.project && named.project.key === "beta" && named.project.name === "Beta" && named.aim === null && named.asOf === null && /no aim yet/.test(named.more) && /\bpreview\b/.test(named.more),
    `U-MCP D6: updates naming a seat names that project {key, name}; beta has no aim and no knowledge filed -> ${JSON.stringify(named.project)}`);
  ok(s.activeProject === null && /`missing`/.test(s.more), "activeProject (two seats, no stamp -> null), and the pointer to `missing`");
  // D5: the updates tool carries the picture, the person's open items and their own items, on the person's first project
  // (alpha) when none is named (U-MCP Fork 2 (1))
  const viaTool = await call(env, "updates", {}, who);
  ok(viaTool.project && viaTool.project.key === "alpha" && viaTool.aim === ALPHA_AIM && JSON.stringify(viaTool.waitingOnYou.openItems.map((x) => x.title)) === JSON.stringify(["finish my first note"])
    && viaTool.yours && Array.isArray(viaTool.yours.items) && !("items" in viaTool),
    "the MCP updates tool: the project's picture, the person's open items and their own items (what is missing is `missing`'s)");
  const none = await stateSummaryFor(who, inAlpha(envWith({}, { noKnowledge: true }).env), {});
  ok(!none.error && none.aim === null && none.asOf === null && none.yourProjects.length === 2, "nothing filed: still the person's projects and a plain word, never a bare error");
}

// ===================== W4 · library + start-here =====================
{
  ok(JSON.stringify(libraryDocs(["zeta.md", "arch/a.md", START_HERE_DOC, "b.md"])) === JSON.stringify([START_HERE_DOC, "arch/a.md", "b.md", "zeta.md"]), "libraryDocs: start-here first, once, the rest sorted");
  ok(libraryDocs([])[0] === START_HERE_DOC, "start-here is listed even when nothing is filed");

  const { env, db } = envWith();
  // D5: `read`: a page of kind doc (the docs the reader may read) and one doc by its ref
  const body = (r) => (r && r.item ? r.item.body : r);
  const lib = await call(env, "read", { project: "alpha", kind: "doc", limit: 100 }, person("p-day1"));
  const paths = (r) => (r.items || []).map((d) => d.path);
  ok(lib.project === "alpha" && paths(lib).includes("docs/zeta.md") && paths(lib).includes("arch/aardvark.md") && (lib.items.find((d) => d.path === "docs/zeta.md") || {}).title === "Zeta",
    `read {kind: doc}: alpha's docs (k_docs) -> ${paths(lib).slice(0, 3).join(", ")}`);
  ok(!paths(lib).includes("eng/only.md") && paths(await call(env, "read", { project: "alpha", kind: "doc", limit: 100 }, person("p-owner", { role: "owner", lane: "all" }))).includes("eng/only.md"),
    "a doc whose roleVisibility leaves the reader's role out is not listed (the owner's list carries it)");
  const forbidden = await call(env, "read", { project: "alpha", ref: "doc/eng/only.md" }, person("p-day1"));
  const allowed = await call(env, "read", { project: "alpha", ref: "doc/eng/only.md" }, person("p-day1", { role: "internal-eng" }));
  // D1b item 2: a doc the reader may not read answers EXACTLY as a missing one (not_found), never "forbidden"
  const absent = await call(env, "read", { project: "alpha", ref: "doc/eng/never.md" }, person("p-day1"));
  ok(forbidden.error === "not_found" && absent.error === "not_found" && JSON.stringify({ ...forbidden, ref: 0, note: String(forbidden.note).split("eng/only.md").join("X") }) === JSON.stringify({ ...absent, ref: 0, note: String(absent.note).split("eng/never.md").join("X") }) && body(allowed) === "# for engineers",
    "read: a doc the reader's role may not read answers as a missing one (not_found, the same note); one it names reads it (mayRead)", JSON.stringify([forbidden, absent]).slice(0, 600));
  const empty = await call(env, "read", { project: "beta", kind: "doc" }, person("p-day1"));
  ok(!(empty.items || []).length && /\bpreview\b/.test(empty.note || ""), "a project with no doc lists none and names preview (D1b item 11)");
  const built = await call(env, "read", { project: "alpha", ref: `doc/${START_HERE_DOC}` }, person("p-day1"));
  ok(typeof body(built) === "string" && body(built).length > 500 && body(built).includes("Testorg") && body(built).includes("sharingu") && built.item.builtIn === true, "read doc/start-here.md with none filed answers the built-in text, the org from its row and the product's name");
  const missing = await call(env, "read", { project: "alpha", ref: "doc/nope.md" }, person("p-day1"));
  ok(missing.error === "not_found" && /`read`/.test(missing.note), "a missing doc says what next");
  db.prepare("INSERT INTO k_docs (project,path,title,body_md,role_visibility,created_by,created_at,updated_by,updated_at) VALUES ('alpha',?,?,?,NULL,'p-owner',?,'p-owner',?)").run(START_HERE_DOC, "Start", "# Our own start page", T(12), T(12));
  ok(body(await call(env, "read", { project: "alpha", ref: `doc/${START_HERE_DOC}` }, person("p-day1"))) === "# Our own start page", "the project's own start-here.md wins");
  db.prepare("DELETE FROM k_docs WHERE project = 'alpha' AND path = ?").run(START_HERE_DOC);

  const t = startHereText({ org: "O", engine: "E", owner: "Olive" });
  ok(noHumanVerbTool(t), "the start-here text names no human-verb tool");
  for (const tool of ["whoami", "updates", "missing", "preview", "file_contribution", "save_knowledge", "remove_knowledge", "ask", "wrap_up"]) ok(t.includes("`" + tool + "`"), `start-here names \`${tool}\``);
  ok(START_HERE_TOOLS.every((x) => t.includes("`" + x + "`")), "every START_HERE_TOOLS entry appears");
  ok(TEMPO_WORDS.every((w) => t.includes(w === "with" ? "with Olive" : `**${w}**`)) && !/ — \n/.test(t), "every tempo word is explained (with the owner's name)");
  ok(!/Agent R|SIRU|siru|Ryuklabs|ryuklabs/.test(startHereText({})) && startHereText({}).includes("this org"), "no org or engine name of its own (the seam supplies them)");
  ok(/"lane": "leader", "kind": "note"/.test(t) && /`project`/.test(t), "the plain-note example and the project rule are there");
  // B7d S1 (replaces B7c's pointer): the Which-project section renders the SAME org-note sentence as the gloss
  // (orgNoteDefault, one source) — it never promises that `projectGloss` names a project it cannot name
  { const wp = (t.split("## Which project")[1] || "").split("\n## ")[0];
    ok(wp.includes(orgNoteDefault(null)) && !/`projectGloss` names/.test(t) && !/any seated project is accepted/.test(t), `B7d S1: Which project carries the gloss's own org-note sentence -> ${wp.trim().slice(-120)}`); }
  { const d = body(await call(env, "read", { ref: `doc/${START_HERE_DOC}` }, person("p-day1")));
    ok(typeof d === "string" && d.includes(orgNoteDefault(null)), "B7d S1: the start-here (built-in) carries the same sentence");
    const homeEnv = envWith({}, { org: { ...ORG, home: "alpha" } });
    const dh = body(await call(homeEnv.env, "read", { ref: `doc/${START_HERE_DOC}` }, person("p-day1")));
    ok(typeof dh === "string" && dh.includes(orgNoteDefault("alpha")), "B7d S1: a declared home project is named in start-here, as the gloss names it"); }

  const req = (body) => ({ json: async () => body, headers: new Headers() });
  const init = await (await handleMcp(req({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), env, {}, new URL("https://x/mcp"), { MCP_TOOLS: [], VERSION: "t", workerName: "w" })).json();
  const last = init.result.instructions.split("\n").slice(-1)[0] || "";
  ok(last.includes(`\`read\` {ref: "doc/${START_HERE_DOC}"}`), `initialize's session line names start-here even with nothing published -> ${last}`);
  ok(instructionsFor({ startHere: START_HERE_DOC }).split("\n").filter((l) => /^\d\. /.test(l)).length === 5, "five numbered lines (the first-run guide)");
}

// ===================== W5 · holes per project, through the door =====================
{
  const { env } = envWith();
  const who = person("p-day1");
  const h = await call(env, "missing", { project: "alpha" }, who);
  const txt = JSON.stringify(h);
  // alpha holds an aim with no measure and docs (no start-here of its own), no goal, check, model or GTM template; a member owes
  // no ruling. Sprint 3 (B3): the checklist counts only the areas a project has, so the ones alpha lacks (app, proof, GTM,
  // agents) sit in notApplicable under the sprint-1 names that started them (model, checks, gtm), never as open pieces; an
  // aim with no measure is partial
  // sprint 3 S3b: a member is offered only what the door lets them file: start-here is the owner's (it comes back in `others`,
  // the owner's, with no call), as the rulings the owner owes are
  ok(h.project === "alpha" && JSON.stringify(h.items.map((x) => x.piece)) === JSON.stringify(["aim", "goals"]) && h.items[0].state === "partial" && h.filled.includes("questions-options") && !h.filled.includes("questions")
    && (h.others || []).some((x) => x.id === "start-here" && x.by === "owner")
    && JSON.stringify(h.notApplicable.map((x) => x.piece)) === JSON.stringify(["model", "checks", "gtm", "agents"]) && h.meter.total === 5 && h.meter.done === 1,   // the rulings the owner owes count in everyone's meter, handed to the owner alone
    `holes project=alpha echoes the project and grades its knowledge -> open ${h.items.map((x) => x.piece).join(", ")}; the owner's ${(h.others || []).map((x) => x.id).join(", ")}; filled ${h.filled.join(", ")}; not started ${h.notApplicable.map((x) => x.area).join(", ")}; ${h.meter.words}`);
  ok(!txt.includes("serve/") && !/publish/i.test(txt) && !/AGENT-TEMPLATE\.md/.test(txt), "through the door: no serve/ path, no publish step, no repo file anywhere in the reply");
  ok(h.items.every((x) => ["preview", "rule_question"].includes(x.fillPath.tool) && x.fillPath.args.project === "alpha") && JSON.stringify(h.next) === JSON.stringify(h.items[0]),
    "every open piece's fillPath is a door call on the project read, and next is the first");
  const ownerH = await call(env, "missing", { project: "alpha" }, person("p-owner", { role: "owner", lane: "all" }));
  const q = ownerH.items.find((x) => x.piece === "questions");
  ok(q && q.fillPath.tool === "rule_question" && q.fillPath.args.qid === OWED[0].id && q.count === OWED.length, `the owner's holes carry the questions they owe, first ${q && q.fillPath.args.qid}`);
  ok(h.intake.some((x) => /fillPath/.test(x)), "the intake steps say how to use a fillPath");
  // sprint 12, 12.2: the intake names the two fill skills that walk a whole side with the same calls (the four steps' 3 and 4)
  ok(h.intake.some((x) => x.includes("`fill-the-product-side`") && x.includes("`fill-the-gtm-side`") && /summaries and links only/.test(x) && /preview/.test(x)),
    `12.2: the intake names the two fill skills -> ${h.intake.slice(-1)[0]}`);
  const refused = await call(env, "missing", { project: "gamma" }, who);
  ok(refused.error === "project_forbidden" && JSON.stringify(refused.seats) === JSON.stringify(["alpha", "beta"]) && /one of \[alpha, beta\]/.test(refused.note), `an unseated project is refused with the list -> ${JSON.stringify(refused).slice(0, 160)}`);
  // re-pinned by name (U-MCP Fork 2 (1), Q0D506BBC): no project and none active -> the first project in the org's order the
  // person may read (alpha, the manifest's first), never the org-wide reading; projectNote names how to pick another
  const dflt = await call(env, "missing", {}, who);
  ok(dflt.project === "alpha" && /Add `project`: one of \[alpha, beta\]/.test(dflt.projectNote || ""), `no project on a two-seat person: the first project they may read + how to pick another -> ${dflt.project}`);
  const owner = await call(env, "missing", { project: "gamma" }, person("p-owner", { role: "owner", lane: "all" }));
  ok(owner.project === "gamma" && !owner.error, "the owner may read any active project");
}

// ===================== W8 · an incomplete filing on the thread =====================
{
  const { env } = envWith();
  const r = await threadFor(person("p-day1"), env, { ownerName: "Olive" });
  const inc = r.items.find((x) => x.id === "T-1"), note = r.items.find((x) => x.id === "T-2");
  ok(inc && inc.tempo === "needs more", `an incomplete filing wears 'needs more' -> ${inc && inc.tempo}`);
  ok(note && note.tempo === "in", `a filed plain note still wears 'in' -> ${note && note.tempo}`);
  // B7d S4b: every sent row shows which project it landed in, inside `detail` (the item shape is unchanged)
  ok(note && note.detail === "leader · note · alpha" && inc.detail === "code · pr · alpha" && Object.keys(note).every((k) => ["at", "kind", "title", "detail", "tempo", "href", "id", "card"].includes(k)), `B7d S4b: thread detail names the project -> ${note && note.detail}`);
}

// ===================== B7d S7b · no mid-word cut =====================
{
  const line = "ONE .claude at the root, the run record with it, sharinguroku retired, a thin AGENTS.md at the top";
  const c = clip(line, 60);   // line[0..59) ends inside "sharinguroku" — the old cut ended "sharinguro…"
  ok(c.endsWith("…") && c.length <= 60 && line.startsWith(c.slice(0, -1)) && !/[A-Za-z0-9]/.test(line.charAt(c.length - 1)), `B7d S7b: clip cuts at a word boundary -> ${c}`);
  ok(clip("short", 70) === "short" && clip(null, 5) === "" && clip("x".repeat(20), 10) === "x".repeat(9) + "…", "clip leaves short text alone and hard-cuts one over-long word");
  const { env } = envWith({}, { aim: "sevens ".repeat(60) + "a thin AGENTS.md" });
  const s = await stateSummaryFor(person("p-day1"), inAlpha(env), {});
  ok(/(^|\s)sevens…$/.test(s.aim) && s.aim.length <= 240, `B7d S7b: state.aim ends on a whole word -> …${s.aim.slice(-20)}`);
}

console.log(`day1-reading selftest: ${checks - failed}/${checks}`);
process.exit(failed ? 1 : 0);
