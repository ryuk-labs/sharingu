// thread-selftest.mjs — the ratchet for YOUR THREAD (R-PRD-ONE-MIND WP5, M-ADR-041). threadFor(person, env)
// is the ONE runtime read both doors answer (GET /updates, JSON only · MCP `updates`). A stateful
// fake env/DB (the tools/handoff-selftest.mjs idiom: statements answered by SQL shape, rows kept in memory) answers the
// thread's own statements (src/hotsql.js THREAD_*_SQL); the open items come in as the heartbeat reads them (src/updates.js
// hands them over). Locks: newest-first ordering · an answer row
// is titled by what was answered, its card id never shown · a sent row carries a tempo from tempoOf · the owner gets
// `waiting` items and a non-owner does not · suite rows (eval=1) are out unless includeEval · mind/* rows never show ·
// an empty read is empty (never a throw) · the item shape matches the declared `thread` shape in
// contracts/door.declared.json.
// D5L: every region is a window with `limit` in its SQL, and the owner's queue is read only as far back as the oldest listed
// filing when that list is full: the answer equals the unbounded one (checked on a long ledger), the queue read binds the cut.
// UI-B4b (Q893B08A5): the thread PAGE (renderThread) and its `only` filter (threadOnlyOf, the Build tab's Queue view)
// are retired, so their render and filter sections are gone; the read and the tool stay, and nothing exported here
// renders a page any more (checked below).
// Run in the gate.
import * as THREAD from "../src/thread.js";
const { threadFor, THREAD_ITEM_FIELDS, THREAD_ITEM_OPTIONAL, THREAD_KINDS, THREAD_MAX } = THREAD;
import { TEMPO_WORDS } from "../src/tempo.js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTRACTS = process.env.AGENT_R_CONTRACTS || (existsSync(join(ENGINE, "contracts")) ? join(ENGINE, "contracts") : join(ENGINE, "..", "contracts"));
let DECL = null;
try { DECL = JSON.parse(readFileSync(join(CONTRACTS, "door.declared.json"), "utf8")).thread || null; } catch { DECL = null; }

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } };

const T = (h, m = 0) => `2026-09-08T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

// --- the stateful fake: rows by table, statements answered by their SQL shape (the handoff-selftest idiom)
function fakeEnv(data) {
  const d = { tx: [], audit: [], events: [], loops: [], people: [], state: null, reads: [], ...data };
  const nameOf = (id) => (d.people.find((p) => p.id === id) || {}).name || id;
  const notMind = (t) => !/mind\//.test(String(t.gaprefs || "")) && !/mind\//.test(String(t.components || ""));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ success: true }),
    first: async () => {
      if (/^SELECT COUNT\(\*\) AS n FROM loops/.test(sql)) return { n: d.loops.filter((l) => l.person_id === args[0] && l.status === "open").length };
      return undefined;
    },
    all: async () => {
      if (/FROM transmission t INDEXED BY idx_transmission_owner_open LEFT JOIN people p ON p.id = t.submitter WHERE/.test(sql) && /t\.route='owner'/.test(sql)) {
        const withEval = !/t\.eval=0/.test(sql), since = /t\.created_at >= \?/.test(sql) ? args[0] : null, limit = Number((/LIMIT (\d+)$/.exec(sql) || [])[1]);
        d.reads.push({ waiting: true, since, limit });
        return { results: d.tx.filter((t) => t.route === "owner" && t.status !== "closed" && (withEval || t.eval === 0) && notMind(t) && (!since || t.created_at >= since))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((t) => ({ ...t, by_name: nameOf(t.submitter) })) };
      }
      if (/^SELECT t\.id, t\.kind, t\.lane, t\.what, t\.route, t\.status, t\.decision/.test(sql)) {
        const [who, limit] = args; const withEval = !/t\.eval=0/.test(sql);
        // each filing carries the rulings on it (the statement's one approval_audit probe a filing)
        return { results: d.tx.filter((t) => t.submitter === who && (withEval || t.eval === 0) && notMind(t))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
          .map((t) => ({ ...t, rulings_json: JSON.stringify(d.audit.filter((a) => a.transmission_id === t.id).map((a) => ({ id: a.id, verdict: a.verdict, note: a.note, created_at: a.created_at, by: nameOf(a.decided_by) }))) })) };
      }
      if (/FROM events WHERE person_id=\? AND kind='unknown'/.test(sql)) {
        const [who, limit] = args; const withEval = !/NOT LIKE/.test(sql);
        return { results: d.events.filter((e) => e.person_id === who && e.kind === "unknown" && (withEval || !/"eval":(1|true)/.test(e.payload_json || "")))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit) };
      }
      if (/FROM events WHERE person_id=\? AND kind='exit'/.test(sql)) {
        const [who, limit] = args; const withEval = !/NOT LIKE/.test(sql);
        return { results: d.events.filter((e) => e.person_id === who && e.kind === "exit" && (withEval || !/"eval":1/.test(e.payload_json || "")))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit) };
      }
      return { results: [] };
    },
    _sql: sql, _args: args,
  });
  return asOrg({   // a request signed in to org 1 (src/data.js)
    BRAIN: { get: async () => null },   // the thread reads nothing from R2
    DB: { prepare: (sql) => stmt(sql) },
    _d: d,
  });
}

// the open items as the heartbeat's read answers them (src/core.js heartbeatFor: open, not the engine's mind/*, oldest first)
const openLoopsOf = (fx, who) => fx.loops.filter((l) => l.person_id === who && l.status === "open" && !String(l.ref || "").startsWith("mind/"))
  .sort((a, b) => a.opened_at.localeCompare(b.opened_at)).map((l) => ({ id: l.id, title: l.title, since: l.opened_at }));

const cto = { id: "p-cto", name: "Vasu", title: "CTO", role: "leader" };
const owner = { id: "p-own", name: "Ryuk", role: "owner" };
const other = { id: "p-x", name: "Someone Else", role: "member" };
const people = [{ id: "p-cto", name: "Vasu" }, { id: "p-own", name: "Ryuk" }, { id: "p-x", name: "Someone Else" }];
const stamp = { publishedAt: T(23, 59) };

const fixture = () => ({
  people,
  tx: [
    // the CTO's own questionnaire answer (the /respond seam's shape): what carries the card id, gaprefs q/<card>, auto route
    { id: "T-20260908-001", submitter: "p-cto", lane: "leader", kind: "answer", what: "RV1 — 15% — the pilot margin holds at fifteen", why: "questionnaire answer via /respond", route: "auto", status: "routed", decision: null, decided_at: null, decision_note: null, components: null, screens: null, gaprefs: "q/RV1", eval: 0, created_at: T(9) },
    // a contribution with the owner (waiting for a ruling)
    { id: "T-20260908-002", submitter: "p-cto", lane: "vendor", kind: "doc", what: "Cold-chain vendor contract draft", why: "the vendor terms", route: "owner", status: "routed", decision: null, decided_at: null, decision_note: null, components: null, screens: null, gaprefs: null, eval: 0, created_at: T(10) },
    // a contribution decided (approved, drawn, before the publish -> on the canvas)
    { id: "T-20260908-003", submitter: "p-cto", lane: "design", kind: "screen", what: "Checkout flow redraw", why: "the redraw", route: "owner", status: "closed", decision: "approve", decided_at: T(12), decision_note: "good", components: "c/checkout", screens: "045", gaprefs: null, eval: 0, created_at: T(11) },
    // a suite row (eval=1) — out unless includeEval
    { id: "T-20260908-004", submitter: "p-cto", lane: "leader", kind: "answer", what: "RR2 — VendorA (eval)", why: "eval", route: "auto", status: "routed", decision: null, decided_at: null, decision_note: null, components: null, screens: null, gaprefs: "q/RR2", eval: 1, created_at: T(13) },
    // R's own namespace — never on a tenant face (M-ADR-012)
    { id: "T-20260908-005", submitter: "p-cto", lane: "code", kind: "pr", what: "engine plumbing", why: "mind", route: "auto", status: "routed", decision: null, decided_at: null, decision_note: null, components: "mind/worker", screens: null, gaprefs: null, eval: 0, created_at: T(14) },
    // someone else's row waiting on the owner (the owner's `waiting` item; never on the CTO's thread)
    { id: "T-20260908-006", submitter: "p-x", lane: "code", kind: "pr", what: "A pull request from someone else", why: "x", route: "owner", status: "routed", decision: null, decided_at: null, decision_note: null, components: "c/a", screens: "012", gaprefs: null, eval: 0, created_at: T(8) },
  ],
  audit: [
    { id: "A1", transmission_id: "T-20260908-003", verdict: "approve", note: "good", decided_by: "p-own", created_at: T(12) },
  ],
  events: [
    { id: "E1", person_id: "p-cto", kind: "exit", payload_json: JSON.stringify({ handoffId: "H1", via: "rest", summary: "Pilot week one wrap-up", counts: { decisions: 2, answers: 1, proposals: 0, open: 3, filedAnswers: 1 } }), created_at: T(15) },
    { id: "E2", person_id: "p-cto", kind: "exit", payload_json: JSON.stringify({ handoffId: "H2", via: "rest", eval: 1, counts: { decisions: 0, answers: 0, proposals: 0, open: 0, filedAnswers: 0 } }), created_at: T(16) },
    // B7a W9: the questions the CTO asked (events kind unknown) — one real (the ask tool's shape), one suite-marked
    { id: "Q1", person_id: "p-cto", kind: "unknown", payload_json: JSON.stringify({ what: "Who signs off the vendor shortlist?", ask: true, about: "the vendor terms" }), created_at: T(14, 30) },
    { id: "Q2", person_id: "p-cto", kind: "unknown", payload_json: JSON.stringify({ what: "a suite question", ask: true, eval: 1 }), created_at: T(16, 30) },
    { id: "Q3", person_id: "p-x", kind: "unknown", payload_json: JSON.stringify({ what: "someone else's question", ask: true }), created_at: T(14, 40) },
  ],
  loops: [
    { id: "L1", person_id: "p-cto", title: "Bring the vendor shortlist", status: "open", opened_at: T(7), ref: "q/RR2" },
    { id: "L2", person_id: "p-cto", title: "closed one", status: "closed", opened_at: T(6), ref: null },
    { id: "L3", person_id: "p-cto", title: "engine item", status: "open", opened_at: T(5), ref: "mind/worker" },
  ],
});

const E250 = /\b(?:RV|RR|AQ[A-Z]?|ST|AR)\d+\b|\bq-id\b/;
const isTempoWord = (w) => w === "in" || w === "decided" || w === "on the canvas" || w === "needs more" || /^with .+/.test(String(w));

// ===================== the CTO's thread =====================
{
  const env = fakeEnv(fixture());
  const r = await threadFor(cto, env, { ownerName: "Ryuk", servedStamp: stamp, openLoops: openLoopsOf(fixture(), "p-cto") });
  ok(r.count === r.items.length, `count equals items.length -> ${r.count}/${r.items.length}`);
  const kinds = r.items.map((x) => x.kind);
  ok(kinds.includes("answered") && kinds.includes("ruled") && kinds.includes("sent") && kinds.includes("report") && kinds.includes("question") && kinds.includes("open"), `every non-owner kind present -> ${kinds.join(",")}`);
  ok(!kinds.includes("waiting"), "a non-owner gets no `waiting` item");
  // ordering: dated items strictly newest-first; undated after every dated one
  const dated = r.items.filter((x) => x.at);
  const undatedIdx = r.items.findIndex((x) => !x.at);
  ok(dated.every((x, i) => i === 0 || Date.parse(dated[i - 1].at) >= Date.parse(x.at)), `dated items are newest-first -> ${dated.map((x) => x.at.slice(11, 16)).join(" > ")}`);
  ok(undatedIdx === -1 || r.items.slice(undatedIdx).every((x) => !x.at), "undated items sit after every dated item");
  ok(r.items[0].kind === "report" && r.items[0].at === T(15), `the newest item is the 15:00 report -> ${r.items[0].kind} @ ${r.items[0].at}`);
  // an answer row is titled by what was answered (the card id dropped) and its detail never carries the id
  const ans = r.items.find((x) => x.kind === "answered");
  ok(ans && ans.title === "15% — the pilot margin holds at fifteen", `an answer row is titled by what was answered -> ${ans && ans.title}`);
  ok(ans && ans.card === "RV1" && ans.id === "T-20260908-001", "the answer item carries card + id");
  ok(ans && !E250.test(ans.detail) && /^15% — the pilot margin holds/.test(ans.detail), `the answer detail drops the id prefix -> ${ans && ans.detail}`);
  ok(ans && ans.tempo === "in", `a leader's own answer (auto route) wears in -> ${ans && ans.tempo}`);
  ok(ans && ans.href === "/contribution/T-20260908-001?page=1", "the answer links to its contribution page");
  // a sent row carries a tempo from tempoOf — the vendor doc is with Ryuk, the approved+drawn redraw is on the canvas
  const sent = r.items.filter((x) => x.kind === "sent");
  ok(sent.length === 2, `two sent rows (the eval row and the mind/* row are out) -> ${sent.length}`);
  const vendor = sent.find((x) => x.id === "T-20260908-002"), redraw = sent.find((x) => x.id === "T-20260908-003");
  ok(vendor && vendor.tempo === "with Ryuk", `a row with the owner wears 'with <owner>' -> ${vendor && vendor.tempo}`);
  ok(redraw && redraw.tempo === "on the canvas", `an approved, drawn row before the publish wears 'on the canvas' -> ${redraw && redraw.tempo}`);
  ok(sent.every((x) => isTempoWord(x.tempo)), "every sent row carries one of the tempo words");
  ok(vendor && vendor.detail === "vendor · doc", `sent detail = lane · kind -> ${vendor && vendor.detail}`);
  // the ruling
  const ruled = r.items.find((x) => x.kind === "ruled");
  ok(ruled && ruled.title === "approved — Checkout flow redraw" && ruled.detail === "Ryuk: good", `the ruling reads verdict — title, detail = who: note -> ${ruled && ruled.title} / ${ruled && ruled.detail}`);
  ok(ruled && ruled.tempo === "on the canvas" && ruled.at === T(12), "the ruling wears the decided row's tempo, dated by the audit row");
  // the report — counts in words; the eval-marked report is out
  const reports = r.items.filter((x) => x.kind === "report");
  ok(reports.length === 1 && reports[0].detail === "2 decisions · 1 answer · 3 still open · 1 filed on cards" && reports[0].tempo === "in", `one unmarked report, its counts in words -> ${JSON.stringify(reports.map((x) => x.detail))}`);
  // B7a W10: ONE id — the report item carries the handoff's own id (what wrap_up answered), and its summary is the title
  ok(reports[0].id === "H1", `the report item's id is the handoff id, not the exit event's -> ${reports[0].id}`);
  ok(reports[0].title === "Pilot week one wrap-up", `the report is titled by its summary -> ${reports[0].title}`);
  // B7a W9: a question the CTO asked waits on his thread "with <owner>"; the suite-marked one and someone else's never show
  const qs = r.items.filter((x) => x.kind === "question");
  ok(qs.length === 1 && qs[0].id === "Q1" && qs[0].title === "Who signs off the vendor shortlist?" && qs[0].tempo === "with Ryuk" && qs[0].detail === "the vendor terms",
     `one question, titled by what was asked, tempo 'with Ryuk' -> ${JSON.stringify(qs)}`);
  // open items: by their own title; the closed one and the mind/* one out
  const open = r.items.filter((x) => x.kind === "open");
  ok(open.length === 1 && open[0].title === "Bring the vendor shortlist" && !("card" in open[0]) && open[0].tempo === "in", `one open item, by its own title -> ${JSON.stringify(open)}`);
  // no eval row, no mind/* row, nobody else's row
  ok(!r.items.some((x) => x.id === "T-20260908-004" || x.id === "T-20260908-005" || x.id === "T-20260908-006" || x.id === "E2" || x.id === "H2" || x.id === "Q2" || x.id === "Q3" || x.id === "L3"), "eval rows, mind/* rows, other people's rows and closed items never show");
  // the item shape
  const declaredFields = (DECL && DECL.item) || THREAD_ITEM_FIELDS;
  const declaredOptional = (DECL && DECL.optional) || THREAD_ITEM_OPTIONAL;
  ok(r.items.every((x) => declaredFields.every((f) => f in x)), `every item carries the ${DECL ? "DECLARED" : "code's"} fields (${declaredFields.join(",")})`);
  ok(r.items.every((x) => Object.keys(x).every((k) => declaredFields.includes(k) || declaredOptional.includes(k))), "no item carries an undeclared field");
  if (DECL) {
    ok(JSON.stringify(DECL.item) === JSON.stringify(THREAD_ITEM_FIELDS) && JSON.stringify(DECL.optional) === JSON.stringify(THREAD_ITEM_OPTIONAL), "the declared thread shape equals the code's constants (one source)");
    ok(JSON.stringify(Object.keys(DECL.kinds || {})) === JSON.stringify(Object.keys(THREAD_KINDS)), "the declared kinds equal the code's kinds");
  }
  ok(Object.values(THREAD_KINDS).join("|") === "you answered|ruled|you sent|you reported|you asked|open item|waiting on you", "the kind words are the reader's vocabulary");
  ok(r.items.every((x) => x.tempo === null || isTempoWord(x.tempo)), `tempo is null or one of ${TEMPO_WORDS.join(" · ")}`);
  ok(r.items.every((x) => (x.detail || "").length <= 160), "every detail is at most 160 chars");

  // includeEval lets the suite rows in (the ?eval=1 seam)
  const re = await threadFor(cto, env, { includeEval: true, ownerName: "Ryuk", servedStamp: stamp, openLoops: openLoopsOf(fixture(), "p-cto") });
  ok(re.count === r.count + 3 && re.items.some((x) => x.id === "T-20260908-004") && re.items.some((x) => x.id === "H2") && re.items.some((x) => x.id === "Q2"), `includeEval adds exactly the three marked rows -> ${re.count} vs ${r.count}`);
  const evRep = re.items.find((x) => x.id === "H2");
  ok(evRep && evRep.title === "a report", `a report with no summary falls back to 'a report' -> ${evRep && evRep.title}`);
  const evAns = re.items.find((x) => x.id === "T-20260908-004");
  ok(evAns && evAns.kind === "answered" && evAns.title === "VendorA (eval)" && evAns.tempo === "in", `an eval answer is titled by what was answered, tempo in (E255b's shape) -> ${evAns && evAns.title}`);

  // the items carry no card id and no contribution id in their words (E250): a card id rides in `card`, a contribution
  // id only in `id`/`href` (the declared `ids` rule)
  const words = r.items.map((x) => `${x.title} ${x.detail}`).join(" ");
  ok(!E250.test(words) && !/T-20260908-\d+/.test(words), `no record id in any item's title or detail (E250) -> ${(words.match(E250) || []).join(",") || "clean"}`);
}

// ===================== the owner's thread: `waiting` items =====================
{
  const env = fakeEnv(fixture());
  const r = await threadFor(owner, env, { ownerName: "Ryuk", servedStamp: stamp });
  const waiting = r.items.filter((x) => x.kind === "waiting");
  ok(waiting.length === 2, `the owner gets a waiting item per open owner-route row (eval out) -> ${waiting.length}`);
  ok(waiting.every((x) => x.tempo === "with Ryuk"), `waiting items wear 'with <owner>' -> ${waiting.map((x) => x.tempo).join(",")}`);
  const w = waiting.find((x) => x.id === "T-20260908-006");
  ok(w && w.title === "A pull request from someone else" && w.detail === "by Someone Else · code · pr" && w.href === "/contribution/T-20260908-006?page=1", `a waiting item names who sent it -> ${JSON.stringify(w)}`);
}

// ===================== empty → the honest line =====================
{
  const env = fakeEnv({ people });
  const r = await threadFor(other, env, {});
  ok(r.count === 0 && r.items.length === 0, `a person with nothing has an empty thread -> ${r.count}`);
  // an empty DB — never throws
  const r2 = await threadFor(cto, fakeEnv({ people, state: null }), { includeEval: true });
  ok(r2.count === 0, "no rows -> empty, no throw");
}

// ===================== the cap and defaults =====================
{
  const many = fixture();
  many.tx = Array.from({ length: 260 }, (_, i) => ({ id: `T-20260907-${String(i).padStart(3, "0")}`, submitter: "p-cto", lane: "vendor", kind: "doc", what: `doc ${i}`, why: "w", route: "owner", status: "routed", decision: null, decided_at: null, decision_note: null, components: null, screens: null, gaprefs: null, eval: 0, created_at: `2026-09-07T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z` }));
  many.audit = []; many.events = []; many.loops = [];
  const env = fakeEnv(many);
  const r = await threadFor(cto, env, {});
  ok(r.count === THREAD_MAX && r.items.length === THREAD_MAX, `the thread caps at ${THREAD_MAX} -> ${r.count}`);
  ok(r.items[0].id === "T-20260907-259", "the cap keeps the newest");
  ok(r.items.filter((x) => x.kind === "sent")[0].tempo === "with the owner", "no ownerName -> 'with the owner' (the tempo default, never invented)");
  const r10 = await threadFor(cto, env, { limit: 10 });
  ok(r10.count === 10, `opts.limit trims -> ${r10.count}`);
}

// ===================== D5L: every region a window; the owner's queue cut at the oldest listed filing =====================
// The owner files 30 contributions, 50 more wait on the owner's ruling (someone else's, interleaved in time), 3 of the owner's
// newest filings are ruled and 2 items are open: the answer at limit 20 equals the unbounded list's newest 20, the queue read
// binds the cut (the 20th newest filing's time) and asks for 20 rows at most; at limit 200 (fewer filings than that) it reads
// with no cut. The open items come as the heartbeat hands them over: a promise.
{
  const at = (i) => `2026-09-0${1 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00:00.000Z`;
  const fx = { people, events: [], audit: [], tx: [], loops: [
    { id: "L-a", person_id: "p-own", title: "Sign the pilot terms", status: "open", opened_at: at(3), ref: null },
    { id: "L-b", person_id: "p-own", title: "Call the vendor back", status: "open", opened_at: at(150), ref: null },
  ] };
  for (let i = 0; i < 30; i++) fx.tx.push({ id: `T-own-${i}`, submitter: "p-own", lane: "leader", kind: "note", what: `owner note ${i}`, route: "auto", status: "routed", decision: null, decided_at: null, decision_note: null, components: null, screens: null, gaprefs: null, eval: 0, created_at: at(i * 5) });
  for (let i = 0; i < 50; i++) fx.tx.push({ id: `T-x-${i}`, submitter: "p-x", lane: "code", kind: "pr", what: `pull request ${i}`, route: "owner", status: "routed", decision: null, decided_at: null, decision_note: null, components: null, screens: null, gaprefs: null, eval: 0, created_at: at(i * 3 + 1) });
  for (const i of [27, 28, 29]) fx.audit.push({ id: `A-${i}`, transmission_id: `T-own-${i}`, verdict: "approve", note: null, decided_by: "p-own", created_at: at(i * 5 + 2) });
  const all = async (limit) => {
    const env = fakeEnv(fx);
    const r = await threadFor(owner, env, { ownerName: "Ryuk", servedStamp: stamp, limit, openLoops: Promise.resolve(openLoopsOf(fx, "p-own")) });
    return { r, reads: env._d.reads };
  };
  // the unbounded list: every open item, every queued row, every filing and every ruling, newest first
  const every = [...openLoopsOf(fx, "p-own").map((l) => ({ id: l.id, at: l.since })), ...fx.tx.filter((t) => t.route === "owner").map((t) => ({ id: t.id, at: t.created_at })),
    ...fx.tx.filter((t) => t.submitter === "p-own").map((t) => ({ id: t.id, at: t.created_at })), ...fx.audit.map((a) => ({ id: a.id, at: a.created_at }))]
    .sort((a, b) => b.at.localeCompare(a.at));
  const r20 = await all(20);
  const want20 = every.slice(0, 20).map((x) => x.id).join(",");
  ok(r20.r.items.map((x) => x.id).join(",") === want20, `limit 20: the newest 20 of the unbounded list -> ${r20.r.items.map((x) => x.id).join(",")}`);
  ok(r20.r.items.some((x) => x.kind === "waiting") && r20.r.items.some((x) => x.kind === "ruled") && r20.r.items.some((x) => x.kind === "open"), "limit 20: queued rows, rulings and an open item all reach the answer");
  const w20 = r20.reads.find((x) => x.waiting) || {};
  ok(w20.since === at(10 * 5) && w20.limit === 20, `limit 20: the queue read binds the cut (the 20th newest filing, ${at(50)}) and asks for 20 rows at most -> since ${w20.since}, limit ${w20.limit}`);
  const r200 = await all(200);
  ok(r200.r.items.map((x) => x.id).join(",") === every.map((x) => x.id).join(","), `limit 200: every item, newest first (${r200.r.count} of ${every.length})`);
  const w200 = r200.reads.find((x) => x.waiting) || {};
  ok(w200.since === null && w200.limit === 200, `limit 200 (30 filings): the queue read has no cut -> since ${w200.since}, limit ${w200.limit}`);
  const r1 = await all(1);
  ok(r1.r.count === 1 && r1.r.items[0].id === every[0].id && (r1.reads.find((x) => x.waiting) || {}).limit === 1, `limit 1 (the bell): one item, the newest, from a queue read of one row -> ${r1.r.items.map((x) => x.id).join(",")}`);
}

// ===================== UI-B4b: the page and its filter are gone, the read stays (Q893B08A5) =====================
{
  ok(!("renderThread" in THREAD) && !("threadOnlyOf" in THREAD), `src/thread.js exports no page render and no view filter -> [${Object.keys(THREAD).join(", ")}]`);
  ok(typeof threadFor === "function" && Object.keys(THREAD_KINDS).includes("waiting"), "threadFor and the declared kinds stay (the tool's read)");
}

if (failed) { console.log(`thread selftest FAILED: ${failed}/${checks}`); process.exit(1); }
console.log(`thread selftest: ${checks - failed}/${checks}`);   // computed, never typed
