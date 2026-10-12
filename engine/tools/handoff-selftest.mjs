// handoff-selftest.mjs — the ratchet for the wrap_up contract
// (build0905:handoff-response-carries-filed-and-receipt). Locks: POST /wrap-up's 200 body
// carries filed:true + receipt{decisions,answers,stillOpen} additively alongside the
// pre-existing stored/id/issueUrl; summary_required still 422s without a summary; the MCP
// wrap_up tool returns the identical shape via the same seam (src/handoff.js
// fileHandoffRecord), not a second copy. Run in the gate.
//
// WP3 (PRD one-mind 2026-09-09 · M-ADR-041): a report's answers[] items that name a CARD file as
// that card's answer rows through the REAL core.js fileTransmissionsBatch (nothing stubbed in the
// seam — the fake D1 below is stateful enough to run it: the clientRef pre-query answers from the
// rows the batch inserted, so the idempotent path exercised is the real one). Locks: two card
// answers → two rows with gapRefs q/<card>; an answer without a card → none; receipt.filedAnswers
// counts them; receipt.tempo is the declared constant; the same report twice → the same clientRefs
// (no double-file); the MCP path files identically; the card regex agrees with the declared shape.
import { orgRow } from "./fixtures/org-row.mjs";
import { ORG_SQL } from "../src/tenant.js";
import { fileHandoffRecord, handleHandoff, cardAnswersOf, cardAnswerItems, openLoopTitlesOf, mcpHandoffReply, HANDOFF_CARD_RE, HANDOFF_TEMPO, HANDOFF_LOOPS_MAX } from "../src/handoff.js";
import { callTool } from "../src/mcp.js";

const MCP_TOOLS = [{ name: "wrap_up", owner: false, write: true }];
// the receipt shape has ONE source: contracts/door.declared.json (M-ADR-038) — the code is asserted against it
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { asOrg, org1 } from "./fixtures/org.mjs";
// the contracts dir rule (M-ADR-038, one rule in every reader): AGENT_R_CONTRACTS → ./contracts if it exists → ../contracts
const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTRACTS = process.env.AGENT_R_CONTRACTS || (existsSync(join(ENGINE, "contracts")) ? join(ENGINE, "contracts") : join(ENGINE, "..", "contracts"));
const DECLARED = JSON.parse(readFileSync(join(CONTRACTS, "door.declared.json"), "utf8"));
const DECL = DECLARED.wrapUpReceipt;
const DECL_ANSWER = DECLARED.wrapUpAnswer;
const hasDeclared = (r) => DECL.fields.every((f) => f in r) && DECL.receipt.every((f) => f in (r.receipt || {}));
// B7a W10: the per-door difference is DECLARED — `stored` rides the REST reply only, `title` the MCP reply only
const hasRestOnly = (r) => (DECL.restOnly || []).every((f) => f in r) && !(DECL.mcpOnly || []).some((f) => f in r);
const hasMcpOnly = (r) => (DECL.mcpOnly || []).every((f) => f in r) && !(DECL.restOnly || []).some((f) => f in r);

let fail = 0;
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); fail = 1; } };

// the transmission rows' column order (core.js fileTransmissionsBatch, TX_BATCH_SQL's TX_COLS) — read back by column name here
const TX_COLS = ["id", "submitter", "lane", "kind", "what", "why", "touches", "screens", "components", "gaprefs", "report", "digest", "proof",
  "parent", "grade", "route", "status", "eval", "trace", "about", "project", "via", "client_ref", "goal_ref", "expected", "actual", "outcome", "created_at"];
const txRow = (args) => Object.fromEntries(TX_COLS.map((c, i) => [c, args[i]]));

function fakeEnv({ org = null } = {}) {
  const puts = [];
  const runs = [];
  const txs = [];       // every transmission row the batch inserted (parsed by column)
  const batches = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { runs.push(args); },
    first: async () => {
      // nextSeqStart: the day's top id, so a second batch reserves the next block (as D1 would)
      if (/^SELECT id FROM transmission WHERE id (?:LIKE|>=)/.test(sql)) return txs.length ? { id: txs.map((t) => t.id).sort().at(-1) } : undefined;
      if (sql === org1(ORG_SQL)) return org ? orgRow(org) : undefined;   // the org's own row (src/tenant.js)
      return undefined; // consentOf reads this -> "off"; resolveOwner -> "the owner"; no projects
    },
    all: async () => {
      // the clientRef idempotency pre-query (M-ADR-006): answer from the rows already inserted
      if (/client_ref IN/.test(sql)) {
        // the refs arrive as ONE json parameter (json_each), as the door binds them
        const [submitter, refsJson] = args;
        const refs = JSON.parse(refsJson);
        return { results: txs.filter((t) => t.submitter === submitter && refs.includes(t.client_ref))
          .map((t) => ({ id: t.id, route: t.route, status: t.status, client_ref: t.client_ref })) };
      }
      return { results: [] }; // seats, projects, everything else: an org with no project axis
    },
    _sql: sql, _args: args,
  });
  return asOrg({   // a request signed in to org 1 (src/data.js)
    BRAIN: {
      get: async () => null,
      put: async (key, body, opts) => { puts.push({ key, body, opts }); },
    },
    DB: {
      prepare: (sql) => stmt(sql),
      batch: async (stmts) => {
        batches.push(stmts);
        // sprint 8, 8.3b: the batch door files a block's rows in ONE statement (core.js TX_BATCH_SQL: ?1 the submitter, ?2 the rows
        // as JSON arrays in TX_COLS' order), read back row by row here
        for (const s of stmts) if (/^INSERT INTO transmission \(/.test(s._sql)) for (const r of JSON.parse(s._args[1])) txs.push(txRow(r));
        return stmts.map(() => ({ success: true }));
      },
    },
    GH_TOKEN: undefined, // skip the live GitHub Issue fetch() entirely
    _puts: puts,
    _runs: runs,
    _txs: txs,
    _batches: batches,
  });
}

const person = { id: "p-test", name: "Test Person", role: "member" };

// --- eval arm: fileHandoffRecord (the shared seam) carries filed + receipt, additively ---
{
  const env = fakeEnv();
  const body = { summary: "shipped the thing", decisions: [1, 2], answers: ["a"], open: [1, 2, 3] };
  const r = await fileHandoffRecord(person, body, env);
  ok(r.filed === true, "filed === true");
  ok(hasDeclared(r), "REST receipt carries every DECLARED field (contracts/door.declared.json)");
  ok(typeof r.stored === "string" && r.stored.length > 0, "stored present");
  ok(typeof r.id === "string" && r.id.length > 0, "id present");
  ok("issueUrl" in r, "issueUrl key still present (byte-identical pre-existing key)");
  ok(JSON.stringify(r.receipt) === JSON.stringify({ decisions: 2, answers: 1, proposals: 0, stillOpen: 3, filedAnswers: 0, tempo: HANDOFF_TEMPO, openItemsOpened: 0, openItemIds: [] }),
     `receipt matches {decisions:2,answers:1,proposals:0,stillOpen:3,filedAnswers:0,tempo,openItemsOpened:0,openItemIds:[]} (numbers are not loop titles) -> got ${JSON.stringify(r.receipt)}`);
  ok(hasRestOnly(r), "the REST reply carries the REST-only fields (stored) and none of the MCP-only ones (title)");
  ok(env._puts.length === 1, "R2 put happened exactly once");
  ok(env._runs.length === 1, "D1 insert happened exactly once");
  ok(JSON.parse(env._puts[0].body).via === "rest", "REST record carries via:rest");
  ok(env._txs.length === 0 && env._batches.length === 0, "a string answer files no answer row (WP3: no card, nothing extra)");
}

// --- eval arm: POST /wrap-up route wraps the same seam, 200, same shape ---
{
  const env = fakeEnv();
  const body = { summary: "route path", decisions: [1], answers: [], open: [1, 2] };
  const req = { json: async () => body };
  const res = await handleHandoff(req, env, person);
  ok(res.status === 200, `handleHandoff status 200 -> got ${res.status}`);
  const j = await res.json();
  ok(j.filed === true, "route response filed === true");
  ok(JSON.stringify(j.receipt) === JSON.stringify({ decisions: 1, answers: 0, proposals: 0, stillOpen: 2, filedAnswers: 0, tempo: HANDOFF_TEMPO, openItemsOpened: 0, openItemIds: [] }),
     `route receipt matches -> got ${JSON.stringify(j.receipt)}`);
}

// --- eval arm: summary_required still 422s ---
{
  const env = fakeEnv();
  const req = { json: async () => ({ decisions: [], answers: [], open: [] }) };
  const res = await handleHandoff(req, env, person);
  ok(res.status === 422, `missing summary -> 422, got ${res.status}`);
  const j = await res.json();
  ok(j.error === "summary_required", `error === summary_required, got ${j.error}`);
}

// --- eval arm (seam): the MCP wrap_up tool returns the identical shape via the same seam ---
{
  const env = fakeEnv();
  const a = { summary: "via mcp", decisions: [1, 2], answers: ["a"], open: [1, 2, 3] };
  const r = await callTool("wrap_up", a, person, env, {}, MCP_TOOLS);
  ok(r.filed === true, "mcp wrap_up filed === true");
  ok(hasDeclared(r), "MCP receipt carries every DECLARED field (contracts/door.declared.json)");
  ok(JSON.parse(env._puts[env._puts.length - 1].body).via === "mcp", "MCP record carries via:mcp");
  // B7a W10: the MCP reply carries NO internal storage path — no `stored`, and no inbox/ anywhere in it
  ok(!("stored" in r), "mcp wrap_up has no `stored` (REST-only)");
  ok(!JSON.stringify(r).includes("inbox/"), `mcp wrap_up reply carries no inbox/ path -> ${JSON.stringify(r).slice(0, 200)}`);
  ok(hasMcpOnly(r) && r.title === "via mcp", `mcp wrap_up carries title = the summary -> ${r.title}`);
  ok(typeof r.id === "string" && r.id.length > 0, "mcp wrap_up id present");
  ok(JSON.parse(env._runs[env._runs.length - 1][4]).handoffId === r.id, "one id: the exit event (the thread's report item) carries the id the reply answered with");
  ok(JSON.stringify(r.receipt) === JSON.stringify({ decisions: 2, answers: 1, proposals: 0, stillOpen: 3, filedAnswers: 0, tempo: HANDOFF_TEMPO, openItemsOpened: 0, openItemIds: [] }),
     `mcp wrap_up receipt matches -> got ${JSON.stringify(r.receipt)}`);

  const envMissing = fakeEnv();
  const rMissing = await callTool("wrap_up", { decisions: [] }, person, envMissing, {}, MCP_TOOLS);
  ok(rMissing.error === "summary_required" && /summary/.test(rMissing.note || ""), `mcp wrap_up missing summary -> summary_required + a note, got ${JSON.stringify(rMissing)}`);
}

// ===================== B7a W10: a report's open items become the person's loops =====================
const loopInserts = (env) => env._batches.flat().filter((st) => /^INSERT INTO loops/.test(st._sql));
{
  // a real (unmarked) report: two open strings -> two loops, titled verbatim, for this person
  const env = fakeEnv();
  const r = await fileHandoffRecord(person, { summary: "real session", open: ["follow up on the vendor", "  ", { title: "re-check the proof" }, 7] }, env);
  const li = loopInserts(env);
  ok(r.receipt.openItemsOpened === 2 && li.length === 2, `open:[a, blank, {title}, 7] opens 2 loops -> receipt ${r.receipt.openItemsOpened}, inserts ${li.length}`);
  ok(li.map((st) => st._args[2]).join("|") === "follow up on the vendor|re-check the proof" && li.every((st) => st._args[1] === person.id),
     `the loops carry the open items' titles, for this person -> ${li.map((st) => st._args[2]).join("|")}`);
  ok(JSON.parse(env._runs[0][4]).summary === "real session", "the exit event carries the summary (the thread's title)");
  // B7e C3: the receipt names the opened loops by the SAME ids the inserts carry, in open[] order
  ok(Array.isArray(r.receipt.openItemIds) && r.receipt.openItemIds.length === 2 && JSON.stringify(r.receipt.openItemIds) === JSON.stringify(li.map((st) => st._args[0])) && new Set(r.receipt.openItemIds).size === 2,
     `B7e C3: receipt.loopIds === the inserted loop ids -> ${JSON.stringify(r.receipt.openItemIds)} vs ${JSON.stringify(li.map((st) => st._args[0]))}`);
  ok(DECL.receipt.includes("openItemIds") && typeof DECL.openItemIds === "string" && typeof DECL.issueUrl === "string", "B7e C3: the declared receipt carries loopIds, with a loopIds and an issueUrl note");
}
{
  // a suite (eval) report opens NONE — the loops table carries no eval mark
  const env = fakeEnv();
  const r = await fileHandoffRecord(person, { eval: true, summary: "suite session", open: ["x", "y"] }, env);
  ok(r.receipt.openItemsOpened === 0 && loopInserts(env).length === 0, `an eval report opens 0 loops -> receipt ${r.receipt.openItemsOpened}, inserts ${loopInserts(env).length}`);
  ok(JSON.stringify(r.receipt.openItemIds) === "[]", `B7e C3: an eval report's loopIds is [] -> ${JSON.stringify(r.receipt.openItemIds)}`);
}
{
  // the MCP path opens them too (same seam), and the cap holds
  const env = fakeEnv();
  const many = Array.from({ length: HANDOFF_LOOPS_MAX + 5 }, (_, i) => `item ${i + 1}`);
  const r = await callTool("wrap_up", { summary: "a long list", open: many }, person, env, {}, MCP_TOOLS);
  ok(r.receipt.openItemsOpened === HANDOFF_LOOPS_MAX && loopInserts(env).length === HANDOFF_LOOPS_MAX, `at most ${HANDOFF_LOOPS_MAX} loops from one report -> ${r.receipt.openItemsOpened}`);
  ok(r.receipt.openItemIds.length === HANDOFF_LOOPS_MAX && JSON.stringify(r.receipt.openItemIds) === JSON.stringify(loopInserts(env).map((st) => st._args[0])), "B7e C3: the MCP reply carries the same loopIds, unchanged");
  ok(openLoopTitlesOf(["a".repeat(500)])[0].length === 400, "a loop title is capped at 400 chars");
}
{
  // a loop-insert failure never loses the report: it files, loopsOpened 0, and the note says so
  const env = fakeEnv();
  env.DB.batch = async () => { throw new Error("D1_ERROR: simulated outage"); };
  const r = await fileHandoffRecord(person, { summary: "outage", open: ["a", "b"] }, env);
  ok(JSON.stringify(r.receipt.openItemIds) === "[]", `B7e C3: a failed loop insert answers loopIds [] -> ${JSON.stringify(r.receipt.openItemIds)}`);
  ok(r.filed === true && r.receipt.openItemsOpened === 0 && /2 open item\(s\) stored in the report but NOT opened as open items/.test(r.note || ""), `a failed loop insert is surfaced in the note -> ${r.note}`);
  ok(mcpHandoffReply({ error: "summary_required" }, "") .error === "summary_required", "mcpHandoffReply passes an error through untouched");
}

// ===================== WP3: a report's card answers file as per-card answer rows =====================

// --- the declared shape and the code agree (one source for the card id shape) ---
{
  ok(DECL_ANSWER && DECL_ANSWER.card === HANDOFF_CARD_RE.source, `declared wrapUpAnswer.card === HANDOFF_CARD_RE (${HANDOFF_CARD_RE.source})`);
  ok(Array.isArray(DECL_ANSWER.fields) && DECL_ANSWER.fields.includes("card") && DECL_ANSWER.fields.includes("answer"), "declared wrapUpAnswer fields carry card + answer");
  ok(DECL.receipt.includes("filedAnswers") && DECL.receipt.includes("tempo"), "declared wrapUpReceipt.receipt carries filedAnswers + tempo");
  ok(HANDOFF_TEMPO === "in", `HANDOFF_TEMPO is the constant 'in' (WP2 owns the words) -> got ${HANDOFF_TEMPO}`);
  // the pure normaliser: strings, cardless objects, truly bad ids, empty answers, repeats. Sprint 5 W1: the shape is
  // the question registry's own (QID_RE), so a REAL qid matches — the legacy questionnaire ids stay a subset.
  const cards = cardAnswersOf(["free text", { answer: "no card" }, { card: "has spaces", answer: "bad id" }, { card: ".leading-dot", answer: "bad id" },
    { card: "x".repeat(65), answer: "too long" }, { card: "a/b", answer: "bad id" },
    { card: "RR1", answer: "" }, { card: "RR1", answer: "first" }, { card: "RR1", answer: "repeat" }, { card: "SK3a", answer: "sub-item", basis: "ADR-1" },
    { card: "Q-video-world", answer: "Paper" }, { card: "Q25318A79", answer: "choice A" }, { card: "R-mcp-stale", answer: "stands" }]);
  ok(JSON.stringify(cards) === JSON.stringify([{ card: "RR1", answer: "first", basis: "" }, { card: "SK3a", answer: "sub-item", basis: "ADR-1" },
    { card: "Q-video-world", answer: "Paper", basis: "" }, { card: "Q25318A79", answer: "choice A", basis: "" }, { card: "R-mcp-stale", answer: "stands", basis: "" }]),
     `cardAnswersOf keeps one valid id each (legacy cards AND real qids), first wins -> got ${JSON.stringify(cards)}`);
  const items = cardAnswerItems(cards, { id: "H1", via: "rest", isEval: true, clientRef: null, project: undefined });
  ok(items.length === 5 && items[1].what === "sub-item — basis: ADR-1" && items[0].what === "first", "what = answer (+ ' — basis: ' + basis when present)");
  ok(items.every((it) => it.lane === "leader" && it.kind === "answer" && it.eval === true && JSON.stringify(it.touches) === '["decisions"]'), "items: lane leader · kind answer · eval · touches decisions");
  ok(items[0].gapRefs[0] === "q/RR1" && items[1].gapRefs[0] === "q/SK3a" && items[2].gapRefs[0] === "q/Q-video-world", "items carry gapRefs q/<card>, real qids included");
  ok(items[0].clientRef === "H1:RR1" && items[2].clientRef === "H1:Q-video-world", "clientRef = <report id>:<card>");
  const long = cardAnswerItems([{ card: "RR1", answer: "x".repeat(3000), basis: "b" }], { id: "H1", via: "rest", isEval: false })[0];
  ok(long.what.length === 2000, `what is capped at 2000 chars -> got ${long.what.length}`);
  ok(cardAnswerItems(cards, { id: "H1", via: "rest", isEval: false, clientRef: "rep-7" })[0].clientRef === "rep-7:RR1", "the report's own clientRef prefixes the card ref when the caller sent one");
}

// --- two card answers (Rein's shape) → two answer rows, q/<card> refs, the report's eval mark, the receipt counts them ---
{
  const env = fakeEnv();
  const body = { eval: true, summary: "session report", decisions: [],
    answers: [{ card: "RR1", answer: "TAKEN — the retry", basis: "ADR-105 R1 c; M-ADR-006" }, { card: "RR2", answer: "DEFERRED to the next wave" }, "a loose remark"],
    open: ["x"] };
  const r = await fileHandoffRecord(person, body, env);
  ok(hasDeclared(r), "card-answer receipt carries every DECLARED field");
  ok(r.receipt.answers === 3, `receipt.answers counts every item stored (3) -> got ${r.receipt.answers}`);
  ok(r.receipt.filedAnswers === 2, `receipt.filedAnswers === 2 -> got ${r.receipt.filedAnswers}`);
  ok(r.receipt.tempo === HANDOFF_TEMPO, `receipt.tempo === '${HANDOFF_TEMPO}' -> got ${r.receipt.tempo}`);
  ok(!("note" in r), `no note when every card filed -> got ${JSON.stringify(r.note)}`);
  ok(env._batches.length === 1, `ONE D1 batch for the card answers -> got ${env._batches.length}`);
  ok(env._txs.length === 2, `two transmission rows -> got ${env._txs.length}`);
  ok(env._txs.map((t) => t.gaprefs).join("|") === "q/RR1|q/RR2", `rows carry gaprefs q/RR1, q/RR2 -> got ${env._txs.map((t) => t.gaprefs).join("|")}`);
  ok(env._txs.every((t) => t.lane === "leader" && t.kind === "answer" && t.touches === "decisions" && t.submitter === person.id), "rows: lane leader · kind answer · touches decisions · the same person");
  ok(env._txs.every((t) => t.eval === 1), "rows carry the report's eval mark (eval=1)");
  ok(env._txs[0].what === "TAKEN — the retry — basis: ADR-105 R1 c; M-ADR-006" && env._txs[1].what === "DEFERRED to the next wave", "what = answer text (+ basis when present)");
  ok(env._txs[0].client_ref === `${r.id}:RR1` && env._txs[1].client_ref === `${r.id}:RR2`, `client_ref = <handoff id>:<card> -> got ${env._txs.map((t) => t.client_ref).join("|")}`);
  ok(env._txs.every((t) => t.via === "rest"), "rows carry the report's surface (via rest)");
  ok(JSON.parse(env._puts[0].body).answers.length === 3, "the stored report keeps every answers[] item verbatim");
  ok(env._runs.length === 1 && JSON.parse(env._runs[0][4]).counts.filedAnswers === 2, "the exit event's counts carry filedAnswers");
  // the mirrored events('pr') rows in the same batch carry the mark too (residue audit: nothing unmarked)
  // the mirrors ride ONE statement (core.js EVENTS_BATCH_SQL: ?2 the rows, each [id, lane, payload_json, touches, basis, project, at])
  const prRows = env._batches[0].filter((s) => /^INSERT INTO events/.test(s._sql)).flatMap((s) => JSON.parse(s._args[1]));
  ok(prRows.length === 2 && prRows.every((r) => JSON.parse(r[2]).eval === true), "the mirrored pr events carry the eval mark");
}

// --- an unmarked report files UNMARKED rows (the mark is the report's, never assumed) ---
{
  const env = fakeEnv();
  const r = await fileHandoffRecord(person, { summary: "real report", answers: [{ card: "AQ0", answer: "yes" }] }, env);
  ok(r.receipt.filedAnswers === 1 && env._txs.length === 1 && env._txs[0].eval === 0, `an unmarked report files an unmarked row (eval=0) -> got eval=${env._txs[0]?.eval}`);
}

// --- answers without a card (strings · objects without card · bad ids) file nothing ---
{
  const env = fakeEnv();
  const r = await fileHandoffRecord(person, { summary: "no cards", answers: ["free text", { answer: "an object without a card" }, { card: "not a qid", answer: "bad id" }, { question: "RR1", answer: "wrong key" }] }, env);
  ok(r.receipt.answers === 4 && r.receipt.filedAnswers === 0, `four cardless answers stored, none filed -> got ${JSON.stringify(r.receipt)}`);
  ok(env._txs.length === 0 && env._batches.length === 0, "no transmission row, no batch call, for a report without cards");
  ok(!("note" in r), "no note either — nothing was refused");
}

// --- the same report twice → the same clientRefs, no double-file (M-ADR-006 through the real batch dedupe) ---
{
  const env = fakeEnv();
  const body = { summary: "retried report", clientRef: "rein-2026-09-08", answers: [{ card: "RR1", answer: "TAKEN" }, { card: "RR2", answer: "DEFERRED" }] };
  const r1 = await fileHandoffRecord(person, body, env);
  const r2 = await fileHandoffRecord(person, body, env);
  ok(env._txs.length === 2, `the retry inserted no new answer rows (still 2) -> got ${env._txs.length}`);
  ok(env._txs.map((t) => t.client_ref).join("|") === "rein-2026-09-08:RR1|rein-2026-09-08:RR2", `clientRefs = <body.clientRef>:<card> -> got ${env._txs.map((t) => t.client_ref).join("|")}`);
  ok(r1.receipt.filedAnswers === 2 && r2.receipt.filedAnswers === 2, `both receipts count 2 on file (the retry resolves to the originals) -> got ${r1.receipt.filedAnswers}/${r2.receipt.filedAnswers}`);
  ok(r1.id !== r2.id && JSON.parse(env._puts[1].body).clientRef === "rein-2026-09-08", "each report is stored (own id) and carries the caller's clientRef");
  // without a caller clientRef the report id is the prefix — two distinct reports are two distinct filings
  const env2 = fakeEnv();
  const b2 = { summary: "no ref", answers: [{ card: "RR1", answer: "TAKEN" }] };
  const a1 = await fileHandoffRecord(person, b2, env2);
  const a2 = await fileHandoffRecord(person, b2, env2);
  ok(env2._txs.length === 2 && env2._txs[0].client_ref === `${a1.id}:RR1` && env2._txs[1].client_ref === `${a2.id}:RR1`, "without a caller clientRef the report id prefixes the ref (two reports, two rows)");
}

// --- a refused card (the batch says why) is surfaced in the note, never lost; the rest still file ---
{
  const env = fakeEnv();
  const body = { summary: "with a refused card", answers: [{ card: "RR1", answer: "ok" }, { card: "RR2", answer: "ok too" }] };
  const orig = env.DB.batch;
  env.DB.batch = async () => { throw new Error("D1_ERROR: simulated outage"); };
  const r = await fileHandoffRecord(person, body, env);
  env.DB.batch = orig;
  ok(r.filed === true && r.stored && r.receipt.filedAnswers === 0, `the report still files when the answer batch fails (filedAnswers 0) -> got ${JSON.stringify(r.receipt)}`);
  ok(typeof r.note === "string" && /2 answer\(s\) stored but NOT filed/.test(r.note) && /RR1 \(batch_failed\)/.test(r.note), `the note names the cards that did not file -> got ${r.note}`);
}

// --- the MCP path files identically (same seam, same rows, via mcp) ---
{
  const env = fakeEnv();
  const a = { eval: true, summary: "via mcp with cards", answers: [{ card: "RR1", answer: "TAKEN", basis: "b" }, { card: "RR2", answer: "DEFERRED" }], open: [1] };
  const r = await callTool("wrap_up", a, person, env, {}, MCP_TOOLS);
  ok(hasDeclared(r) && r.receipt.filedAnswers === 2 && r.receipt.tempo === HANDOFF_TEMPO, `mcp receipt carries filedAnswers 2 + tempo -> got ${JSON.stringify(r.receipt)}`);
  ok(!("stored" in r) && "stored" in (await fileHandoffRecord(person, { ...a }, fakeEnv())), "the per-door difference: MCP omits stored, REST keeps it");
  ok(env._txs.length === 2 && env._txs.map((t) => t.gaprefs).join("|") === "q/RR1|q/RR2", "mcp path files the same two rows with q/<card> refs");
  ok(env._txs.every((t) => t.via === "mcp" && t.eval === 1 && t.kind === "answer" && t.lane === "leader"), "mcp rows: via mcp · eval · kind answer · lane leader");
  ok(env._txs[0].client_ref === `${r.id}:RR1`, "mcp rows carry <handoff id>:<card> clientRefs");
  const req = { json: async () => ({ ...a }) };
  const envRest = fakeEnv();
  const j = await (await handleHandoff(req, envRest, person)).json();
  const strip = (rows) => rows.map((t) => [t.lane, t.kind, t.what, t.touches, t.gaprefs, t.eval, t.route, t.status].join("·")).join("|");
  ok(strip(envRest._txs) === strip(env._txs), "REST and MCP file byte-identical answer rows (lane·kind·what·touches·gaprefs·eval·route·status)");
  ok(JSON.stringify(j.receipt) === JSON.stringify(r.receipt), `REST and MCP receipts are identical -> ${JSON.stringify(j.receipt)} vs ${JSON.stringify(r.receipt)}`);
}

// --- P4 prune (2026-09-27): the handoff repo is the ORG's (its org row's settings.handoffRepo), never a default ---
// With GH_TOKEN set, an org that names no repo files NO
// GitHub Issue at all (never a POST to /repos//issues), the handoff is still stored; an org that names its repo files there,
// under the engine's neutral user-agent. fetch is stubbed — nothing leaves this process.
{
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), ua: init && init.headers && init.headers["user-agent"] });
    return { ok: true, json: async () => ({ html_url: "https://github.example/o/r/issues/1" }) }; };
  try {
    const bare = { ...fakeEnv(), GH_TOKEN: "fixture-token-not-a-credential" };
    const r0 = await fileHandoffRecord(person, { summary: "no repo named" }, bare);
    ok(calls.length === 0 && r0.issueUrl === null && r0.filed === true && bare._puts.length === 1,
      `no handoffRepo in the org's settings: no GitHub call, issueUrl null, still stored -> calls ${JSON.stringify(calls)}`);
    const named = { ...fakeEnv({ org: { name: "Org", settings: { handoffRepo: { owner: "o", repo: "r" } } } }), GH_TOKEN: "fixture-token-not-a-credential" };
    const r1 = await fileHandoffRecord(person, { summary: "repo named" }, named);
    ok(calls.length === 1 && calls[0].url === "https://api.github.com/repos/o/r/issues" && calls[0].ua === "sharingu-agent-r" && r1.issueUrl === "https://github.example/o/r/issues/1",
      `the org's own handoffRepo: one Issue POST there, user-agent sharingu-agent-r -> ${JSON.stringify(calls)}`);
  } finally { globalThis.fetch = realFetch; }
}

// ===================== sprint 8's review B4: the record's lists are bounded (the summary's 4,000 idiom) =====================
// A report sending 200 decisions of 10,000 characters, a 9,000-character answer object, 60 open lines, a non-list attachments and
// 400 KB of proposals is stored within the bounds: at most HANDOFF_LIST_MAX items a list, each item at most HANDOFF_ITEM_MAX
// characters as JSON, HANDOFF_LISTS_MAX in all; the cut answer keeps its card and files; a small report's lists are stored as
// sent; the receipt's note says what was cut. RED THEN GREEN: a mutant copy of src/ storing the lists as sent (the code before
// the fix) fails the bounds; the real code passes.
{
  const { mkdtempSync, cpSync, writeFileSync, rmSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const H = await import("../src/handoff.js");
  const big = {
    summary: "a big report",
    decisions: Array.from({ length: 200 }, (_, i) => `${i} ` + "d".repeat(10000)),
    answers: [{ card: "Q-7", answer: "a".repeat(9000), basis: "the logs" }],
    proposals: Array.from({ length: 40 }, () => ({ what: "p".repeat(3900) })),
    open: Array.from({ length: 60 }, (_, i) => `open ${i}`),
    attachments: { not: "a list" },
  };
  const run = async (src) => {
    const F = src ? await import(pathToFileURL(join(src, "handoff.js")).href) : H;
    const env = fakeEnv();
    const r = await F.fileHandoffRecord(person, big, env);
    const stored = env._puts[0] ? JSON.parse(env._puts[0].body) : null;
    const small = fakeEnv();
    const s = { summary: "small", decisions: [{ what: "keep" }], answers: [{ card: "Q-1", answer: "yes" }], proposals: ["p"], open: ["o"], attachments: ["a"] };
    await F.fileHandoffRecord(person, s, small);
    const sr = small._puts[0] ? JSON.parse(small._puts[0].body) : null;
    const lists = H.HANDOFF_LISTS.filter((n) => n !== "authoredPrompts");
    const listsLen = stored ? lists.reduce((t, n) => t + JSON.stringify(stored[n]).length, 0) : Infinity;
    return {
      bounded: !!stored && lists.every((n) => Array.isArray(stored[n]) && stored[n].length <= H.HANDOFF_LIST_MAX && stored[n].every((x) => (typeof x === "string" ? x.length : JSON.stringify(x).length) <= H.HANDOFF_ITEM_MAX))
        && listsLen <= H.HANDOFF_LISTS_MAX + 6 * 2 && stored.attachments.length === 0 && stored.open.length === 50,
      cutAnswer: !!stored && stored.answers[0] && stored.answers[0].cut === true && stored.answers[0].card === "Q-7" && stored.answers[0].basis === "the logs"
        && H.cardAnswersOf(stored.answers).length === 1,
      noted: /did not fit/.test(r.note || "") && r.receipt && r.receipt.decisions === stored.decisions.length,
      smallSame: !!sr && lists.every((n) => JSON.stringify(sr[n]) === JSON.stringify(s[n])),
      detail: stored ? JSON.stringify({ lens: Object.fromEntries(lists.map((n) => [n, Array.isArray(stored[n]) ? stored[n].length : typeof stored[n]])), listsLen, note: r.note }).slice(0, 600) : "nothing stored",
    };
  };
  const BOUND_LINE = "  const bounded = boundedLists({ ...body, authoredPrompts: prompts });\n";
  const dir = mkdtempSync(join(ENGINE, ".handoff-mutant-"));
  try {
    // dereference (the relocate layout's engine/src is a SYMLINK: copying the link and writing "into the copy" would
    // write through it into the REAL src/handoff.js — the gate's relocate step did exactly that once); the realpath
    // guard makes the mistake loud if a future copy mode regresses
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true, dereference: true });
    const hp = join(dir, "src", "handoff.js"), ht = readFileSync(hp, "utf8");
    if (realpathSync(hp) === realpathSync(join(ENGINE, "src", "handoff.js"))) throw new Error("the mutant copy IS the real file: refusing to write");
    ok(ht.includes(BOUND_LINE), "B4 · the mutant: handoff.js holds the one bounding line to replace");
    writeFileSync(hp, ht.split(BOUND_LINE).join("  const bounded = { lists: { decisions: body.decisions ?? [], answers: body.answers ?? [], proposals: body.proposals ?? [], open: body.open ?? [], attachments: body.attachments ?? [], authoredPrompts: prompts }, cut: 0, dropped: 0 };\n"));
    const red = await run(join(dir, "src"));
    ok(!red.bounded && !red.noted, `B4 · RED: the lists stored as sent pass the bounds (the record holds them all) -> ${red.detail}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const green = await run(null);
  ok(green.bounded, `B4 · GREEN: every list at most ${H.HANDOFF_LIST_MAX} items of at most ${H.HANDOFF_ITEM_MAX} characters, ${H.HANDOFF_LISTS_MAX} in all; a non-list stored as [] -> ${green.detail}`);
  ok(green.cutAnswer, `B4 · GREEN: the 9,000-character answer is kept cut (its card and basis stand) and still files -> ${green.detail}`);
  ok(green.noted, `B4 · GREEN: the receipt's note says what did not fit; its counts are what was stored -> ${green.detail}`);
  ok(green.smallSame, "B4 · GREEN: a small report's lists are stored exactly as sent");
}

if (fail) { console.log("handoff selftest FAILED"); process.exit(1); }
console.log(`handoff selftest: ${checks - failed}/${checks}`);   // computed, never typed
