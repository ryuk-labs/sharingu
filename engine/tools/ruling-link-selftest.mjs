// ruling-link-selftest.mjs — UI-B3 C14, the filing->ruling link (ADR-079: a leader's own answer IS the ruling), driven
// through the REAL src/index.js default export (the cf-workers stub loader, as tools/login-csrf-route-selftest.mjs does)
// against a REAL SQLite D1 (boot.sql) holding the project's questions in k_questions + k_options
// (tools/fixtures/decisions-pack.mjs seedQuestions). Offline: no wrangler, no network.
//
//   1. a SEAT's option answer files and waits undecided (a non-owner's answer is never a ruling);
//   2. the OWNER's PROVISIONAL pick files and waits undecided;
//   3. the OWNER's option pick is decided approve IN THE SAME REQUEST through the one decide seam: the row closed,
//      decided_by the owner, decision_note "ruled by option <L>", one approval_audit row, one mirrored ruling event,
//      and the reply says ruled:true;
//   4. the question is DECIDED in k_questions in the same request (choice, label = the option's text), the overlay reads
//      the answer back as live.ruled (never as an open answer), the question owes nothing (the Decisions "Open: yours"
//      drops by one, and Home's decide count with it), and Decisions, the QuestionCard and the decisions JSON read it
//      decided with option B on the next load, with no word of a publish;
//   5. no row is ever decided twice: re-deciding the ruled answer answers 409 already_decided and adds no audit row;
//   6. the Home form (choose-option, next /home) rules too and lands back on /home;
//   7. the filing's page links to the question's card.
// Then the MUTATION PROOF: the link's call site in a copy of src/qnaire.js is replaced by `if (false && …)`, and the
// owner's pick must then stay undecided and the question open, so the checks above are load-bearing.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const fx = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "decisions-pack.mjs")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };

function makeEnv() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)");
  P.run("p-o", "Owen Park", "owen@northwind.test", "owner", sha("owner-key"), 1, "2026-09-01T00:00:00Z");
  P.run("p-c", "Rae Kim", "rae@northwind.test", "internal-eng", sha("seat-key"), 1, "2026-09-02T00:00:00Z");
  db.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','Alpha',1,'2026-09-01T00:00:00Z')");
  fx.seedQuestions(db, "alpha", fx.ROWS, "p-o");
  const { DB } = fx.d1(db);
  const files = {};   // the R2 binding holds nothing the worker reads (the org is its D1 row)
  const r2 = (t) => ({ text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => new TextEncoder().encode(t).buffer, size: t.length, httpMetadata: { contentType: "application/json" } });
  const BRAIN = { get: async (k) => (files[k] != null ? r2(files[k]) : null), head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) };
  return { db, env: { DB, BRAIN } };
}
const ctx = { waitUntil() {}, passThroughOnException() {} };

// probe(handler, label, assert) -> the facts the checks read (the mutation run reads them without asserting)
async function probe(handler, label, assert) {
  const { db, env } = makeEnv();
  const call = (path, { method = "GET", key = "owner-key", body, form, accept = "application/json" } = {}) => {
    const headers = { authorization: `Bearer ${key}`, accept };
    let payload;
    if (form) { payload = new URLSearchParams(form).toString(); headers["content-type"] = "application/x-www-form-urlencoded"; }
    else if (body) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
    return handler.fetch(new Request(`https://org.test${path}`, { method, headers, body: payload, redirect: "manual" }), env, ctx);
  };
  const jsonOf = async (r) => { try { return await r.json(); } catch { return {}; } };
  const row = (id) => db.prepare("SELECT decision, decided_by, decision_note, status, route FROM transmission WHERE id = ?").get(id) || {};
  const audits = (id) => db.prepare("SELECT verdict, note FROM approval_audit WHERE transmission_id = ?").all(id);
  const rulings = (id) => db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'ruling' AND json_extract(payload_json,'$.transmissionId') = ?").get(id).n;
  const f = {};
  const yours0 = (await jsonOf(await call("/decisions"))).counts?.yours;
  // 1 · a seat's option answer
  const seat = await jsonOf(await call("/respond", { method: "POST", key: "seat-key", body: { qid: fx.HIGH_QID, option: 0 } }));
  f.seatTx = seat.transmissions?.[0]?.tx; f.seat = row(f.seatTx); f.seatRuled = seat.transmissions?.[0]?.ruled === true;
  // 2 · the owner's provisional pick
  const prov = await jsonOf(await call("/respond", { method: "POST", body: { qid: fx.OPEN_QID, option: 0, provisional: true } }));
  f.provTx = prov.transmissions?.[0]?.tx; f.prov = row(f.provTx); f.provRuled = prov.transmissions?.[0]?.ruled === true;
  // 3 · the owner's pick: ruled in the same request
  const own = await jsonOf(await call("/respond", { method: "POST", body: { qid: fx.HIGH_QID, option: 1 } }));
  f.ownTx = own.transmissions?.[0]?.tx; f.own = row(f.ownTx); f.ownRuled = own.transmissions?.[0]?.ruled === true;
  f.ownAudits = audits(f.ownTx); f.ownRulings = rulings(f.ownTx);
  // 4 · read back: the overlay, the counts, the three faces
  const dj = await jsonOf(await call("/decisions"));
  const high = (dj.rows || []).find((r) => r.qid === fx.HIGH_QID) || {};
  f.highStatus = high.status; f.highChoice = high.choice; f.highLabel = high.label;
  f.stored = db.prepare("SELECT status, choice, label, decided_by FROM k_questions WHERE project = 'alpha' AND qid = ?").get(fx.HIGH_QID) || {};
  f.ruled = high.live?.ruled || null; f.highAnswers = (high.live?.answers || []).map((a) => a.tx);
  f.yours1 = dj.counts?.yours; f.yours0 = yours0; f.youOwe = dj.whoOwes?.you;
  f.decHtml = await (await call("/decisions", { accept: "text/html" })).text();
  f.cardHtml = await (await call(`/question/${fx.HIGH_QID}`, { accept: "text/html" })).text();
  f.cardJson = await jsonOf(await call(`/question/${fx.HIGH_QID}`));
  const home = await jsonOf(await call("/home/summary"));
  f.homeDecide = home.metrics?.needsYou?.decide;
  f.homeHtml = await (await call("/home", { accept: "text/html" })).text();
  // sprint 3 L2: a Decisions row is the revision's one-line <li> (it was an <article>)
  const highRow = (html) => (html.match(new RegExp(`<li\\b[^>]*\\sdata-qid="${fx.HIGH_QID}"[\\s\\S]*?</li>`)) || [""])[0];
  f.decHigh = highRow(f.decHtml);
  // 5 · never decided twice
  const again = await call(`/contribution/${f.ownTx}/decide`, { method: "POST", body: { verdict: "approve", note: "again" } });
  f.againStatus = again.status; f.againError = (await jsonOf(again)).error; f.auditsAfter = audits(f.ownTx).length;
  // 6 · the Home form (choose-option) rules too and lands on /home
  const form = await call("/respond", { method: "POST", form: { qid: fx.OPEN_QID, option: "2", next: "/home" }, accept: "text/html" });
  f.formStatus = form.status; f.formLocation = form.headers.get("location");
  const formTx = db.prepare("SELECT id, decision, decision_note FROM transmission WHERE kind = 'answer' AND what LIKE ? ORDER BY rowid DESC LIMIT 1").get(fx.OPEN_QID + " — C:%") || {};
  f.formRow = formTx; f.yours2 = (await jsonOf(await call("/decisions"))).counts?.yours;
  // 7 · the filing's page links to the question's card
  f.txHtml = await (await call(`/contribution/${f.ownTx}`, { accept: "text/html" })).text();
  if (!assert) return f;
  ok(f.seatTx && f.seat.decision == null && !f.seatRuled, `${label}: a seat's option answer files (${f.seatTx}) and waits undecided: a non-owner's answer is never a ruling`);
  ok(f.provTx && f.prov.decision == null && !f.provRuled, `${label}: the owner's PROVISIONAL pick files (${f.provTx}) and stays undecided`);
  ok(f.ownTx && f.ownRuled && f.own.decision === "approve" && f.own.decided_by === "p-o" && f.own.status === "closed" && f.own.decision_note === "ruled by option B",
    `${label}: the owner's pick (${f.ownTx}) is decided approve in the same request: closed, by the owner, "ruled by option B", the reply says ruled`);
  ok(f.ownAudits.length === 1 && f.ownAudits[0].verdict === "approve" && f.ownAudits[0].note === "ruled by option B" && f.ownRulings === 1,
    `${label}: through the one decide seam: one approval_audit row and one mirrored ruling event (${f.ownAudits.length} / ${f.ownRulings})`);
  ok(f.stored.status === "decided" && f.stored.choice === "1" && f.stored.label === "Drop it" && f.stored.decided_by === "p-o",
    `${label}: the question is decided in k_questions in the same request: choice 1, label "Drop it", by the owner (${JSON.stringify(f.stored)})`);
  ok(f.ruled && f.ruled.option === 1 && f.ruled.tx === f.ownTx && !f.highAnswers.includes(f.ownTx) && f.highAnswers.includes(f.seatTx),
    `${label}: the overlay reads it back as live.ruled {option 1, tx ${f.ruled && f.ruled.tx}}, never as an open answer (answers: ${f.highAnswers.join(",")})`);
  ok(f.yours0 === 2 && f.yours1 === 1 && f.youOwe === 1 && f.homeDecide === f.yours1,
    `${label}: the ruled question owes nothing: Decisions "Open: yours" ${f.yours0} -> ${f.yours1} (who owes: you ${f.youOwe}), Home decide ${f.homeDecide}`);
  ok(f.highStatus === "decided" && f.highChoice === 1 && f.highLabel === "Drop it" && /data-status="decided"/.test(f.decHigh) && /data-ruled="B"/.test(f.decHigh)
    && f.cardJson.decision?.status === "decided" && /data-option="B" data-chosen>/.test(f.cardHtml) && /Ruled B/.test(f.cardHtml)
    && !/catches up/.test(f.decHtml + f.cardHtml + f.homeHtml),
    `${label}: Decisions (JSON and HTML) and the QuestionCard read it decided with B at once, and no face speaks of a publish catching up`);
  ok(f.againStatus === 409 && f.againError === "already_decided" && f.auditsAfter === 1, `${label}: re-deciding the ruled answer is refused (409 already_decided) and adds no audit row`);
  ok(f.formStatus === 302 && /^\/home\?ruled=1$/.test(f.formLocation || "") && f.formRow.decision === "approve" && f.formRow.decision_note === "ruled by option C" && f.yours2 === 0,
    `${label}: Home's choose-option form rules too (${f.formRow.id}: ${f.formRow.decision_note}) and lands on ${f.formLocation}; nothing is left owed (${f.yours2})`);
  ok(new RegExp(`href="/question/${fx.HIGH_QID}"`).test(f.txHtml), `${label}: /contribution/${f.ownTx} links to /question/${fx.HIGH_QID}`);
  return f;
}

// ---- 1. the real route, as it ships ----
const { default: wired } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
await probe(wired, "wired", true);

// ---- 2. the mutation proof: the link's call site disabled in a copy ----
const mutDir = mkdtempSync(join(ENGINE, ".ruling-link-mutation-"));
try {
  cpSync(join(ENGINE, "src"), join(mutDir, "src"), { recursive: true });
  const qPath = join(mutDir, "src", "qnaire.js");
  const original = readFileSync(qPath, "utf8");
  const NEEDLE = 'if (reader && reader.role === "owner" && !reader.readOnly) {';
  if (!original.includes(NEEDLE)) ok(false, `mutation: the link's call site no longer reads "${NEEDLE}" in src/qnaire.js — this selftest is stale and must be updated`);
  else {
    writeFileSync(qPath, original.replace(NEEDLE, "if (false && " + NEEDLE.slice(4)));
    const { default: mutated } = await import(pathToFileURL(join(mutDir, "src", "index.js")).href);
    const m = await probe(mutated, "mutated", false);
    // (the "Open: yours" drop is NOT load-bearing on the link: B3a's owedBy already owes nothing once a non-provisional
    // answer is filed, so the mutated run drops it too; the ruling itself, the overlay and the words are the link's)
    ok(m.own.decision == null && !m.ownRuled && !m.ruled && m.ownAudits.length === 0 && m.stored.status === "open" && m.highStatus === "open" && !/data-ruled="B"/.test(m.decHigh),
      `mutation: with the link's call site replaced by "if (false && …)" the owner's pick stays undecided (decision ${m.own.decision}, ${m.ownAudits.length} audit rows), the question open (${m.stored.status}), no ruled overlay, no "ruled B" on Decisions: the checks above are load-bearing`);
  }
} finally {
  rmSync(mutDir, { recursive: true, force: true });
}

console.log(`ruling-link-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
