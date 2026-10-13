// tools/confirm-card-selftest.mjs — sprint 3, D3: the confirm prompt, the card and the prune, offline (no worker). Exit 1 on
// any failure. The live door is proven by tools/mcp-client-selftest.mjs and the smoke (tools/smoke/s23-card-confirm.mjs).
//   1. sessions (src/confirm.js): which capabilities get which flags; a session id is parsed back; a malformed one is none
//   2. the elicitation: one boolean, required, false by default; the message bounded; the answer read as one word
//      (accept only with file: true)
//   3. recordAnswer on a REAL SQLite (boot.sql): ONE conditional UPDATE records the first answer of the author, from the same
//      session, with the right nonce, inside the window, before any file; every other answer changes nothing
//   3b. D3b, the same confirm on the 2026-07-28 revision (MRTR): the requestState's form and parse, the key bound to the
//      person (sha256(nonce:person:mrtr)), recordInput's one UPDATE (the author, in time, once), and the two revisions'
//      keys never answer each other's rows
//   4. the prune (src/preview.js prunePreviews): only unfiled rows a day past their hour; a filed or partly filed row stays;
//      (sprint 6, 6.4) run per org by the cron, an org's prune deletes its own projects' previews alone
//   3c. sprint 19: the confirm moved to the write tools: storePartConfirm writes the binding into the preview's row (its author,
//      not filed whole; a later part's replaces it), the stateless retry is bound to the tool that asked
//   5. the card (src/previewcard.js): the template is one self-contained document (no external URL, no inline handler, one
//      script, the CSP); the fragment's rows equal the preview's items; the File action names each part's write tool, its items
//      and the preview id;
//      no File action for a reader who is not the author, for a preview not ready, or once filed; publish and equip previews
//      name their own tool with confirm: true; the page and the card draw the same summary block
//   5b. (sprint 12, 12.6) the brand faces inlined as data: fonts (font-src data: alone) inside the template's budget; a
//      question's line has no "?,"; an equip names each place once and its Reaches spans the row; the project by its slug,
//      never o<N>--; a needs row says its need once; a decided question's rationale, one line
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { d1Of } from "./fixtures/home-d1.mjs";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const C = await import(join(ENGINE, "src", "confirm.js"));
const PV = await import(join(ENGINE, "src", "preview.js"));
const K = await import(join(ENGINE, "src", "previewcard.js"));
const PG = await import(join(ENGINE, "src", "previewpage.js"));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };

// ---- 1 · sessions ----
const UI = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };
ok(/^sg1e\.[0-9a-f]{32}$/.test(C.sessionFor({ elicitation: {} })), "elicitation: {} (2025-06-18) -> sg1e.");
ok(/^sg1e\./.test(C.sessionFor({ elicitation: { form: {}, url: {} } })), "elicitation: {form, url} (2025-11-25) -> sg1e.");
ok(C.sessionFor({ elicitation: { url: {} } }) === null, "elicitation with the URL mode only -> no session (the confirm is a form)");
ok(/^sg1u\./.test(C.sessionFor(UI)) && /^sg1eu\./.test(C.sessionFor({ elicitation: {}, ...UI })), "the Apps extension -> u; both -> eu");
ok(C.sessionFor({ extensions: { "io.modelcontextprotocol/ui": {} } }) === null && C.sessionFor({ extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/plain"] } } }) === null, "the extension without its HTML type -> nothing (mimeTypes is required)");
ok(C.sessionFor({}) === null && C.sessionFor(null) === null && C.sessionFor({ roots: {} }) === null, "nothing declared -> no session id at all");
const hdr = (v) => ({ headers: new Headers(v == null ? {} : { "mcp-session-id": v }) });
const s1 = C.sessionOf(hdr("sg1eu." + "a".repeat(32)));
ok(s1 && s1.elicit && s1.ui, "a session id reads back its flags");
ok(C.sessionOf(hdr("sg1e.XYZ")) === null && C.sessionOf(hdr("random")) === null && C.sessionOf(hdr(null)) === null && C.sessionOf(hdr("sg1ue." + "a".repeat(32))) === null, "a malformed or foreign id is no session (never an error)");

// ---- 2 · the elicitation ----
const sch = C.partAsk({ previewId: "P-1", tool: "file_contribution", ready: 3, project: "alpha", text: "t" }, { key: "k", until: "u" }).schema;
ok(sch.type === "object" && Object.keys(sch.properties).length === 1 && sch.properties.file.type === "boolean" && sch.properties.file.default === false && JSON.stringify(sch.required) === '["file"]', "the form: ONE boolean, required, false by default (flat, primitive: inside the spec's limits)");
const long = Array.from({ length: 400 }, (_, i) => `line ${i} ${"x".repeat(40)}`).join("\n");
ok(C.confirmMessage(long).length <= C.MESSAGE_MAX && /the rest is on the preview page/.test(C.confirmMessage(long)) && C.confirmMessage("short") === "short", "the message is the text, cut at MESSAGE_MAX on a line, saying so");
ok(C.answerWord({ id: 1, result: { action: "accept", content: { file: true } } }) === "accept", "accept with file: true -> accept");
ok(C.answerWord({ id: 1, result: { action: "accept", content: { file: false } } }) === "decline" && C.answerWord({ id: 1, result: { action: "accept" } }) === "decline" && C.answerWord({ id: 1, result: { action: "accept", content: { file: "true" } } }) === "decline", "accept without file === true -> decline (only a real yes files)");
ok(C.answerWord({ id: 1, result: { action: "decline" } }) === "decline" && C.answerWord({ id: 1, result: { action: "cancel" } }) === "cancel" && C.answerWord({ id: 1, error: { code: -1, message: "x" } }) === "error" && C.answerWord({ id: 1, result: { action: "maybe" } }) === null, "decline, cancel, an error; anything else is no answer");
ok(C.isResponse({ jsonrpc: "2.0", id: "x", result: {} }) && !C.isResponse({ jsonrpc: "2.0", id: 1, method: "ping" }) && !C.isResponse({ jsonrpc: "2.0", method: "n" }), "a JSON-RPC response is told from a request and a notification");
ok(C.CONFIRM_POLLS.length === 18 && C.CONFIRM_POLLS[C.CONFIRM_POLLS.length - 1] < C.CONFIRM_WINDOW_MS && C.CONFIRM_WINDOW_MS < 60000 && C.CONFIRM_POLLS.every((t, i) => !i || t > C.CONFIRM_POLLS[i - 1]), `the poll schedule: ${C.CONFIRM_POLLS.length} reads (+1 after the window) over ${C.CONFIRM_WINDOW_MS / 1000} s (under the SDK's 60 s request timeout)`);
ok(C.confirmPlan({ previewId: "P-1", ready: 2 }) === null && C.confirmPlan({ previewId: "P-1", ready: 0 }) && C.confirmPlan({}), "asked only for a part that files at least one item (a refused check is answered as it is, before)");
ok(sch.properties.file.title === "File" && sch.properties.file.description === "File 3 contributions into alpha" && C.partAsk({ previewId: "P-1", tool: "remove_knowledge", ready: 1, project: "o2--x", text: "" }, { key: "k", until: "u" }).schema.properties.file.description === "Remove 1 knowledge item from x",
  "the form is titled by the write tool and says its part: how many items, into which project (by its slug)");

// ---- 3 · recordAnswer on SQLite ----
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
const T0 = "2026-10-01T00:00:00.000Z";
db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('p','P',1,'${T0}'); INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('o','O','o@x','owner','h',1,'${T0}',1),('m','M','m@x','member','h2',1,'${T0}',1)`);
const env = { DB: d1Of(db) };
const session = { id: "sg1e." + "b".repeat(32) };
const nonce = "c".repeat(32);
const ins = async (id, until, extra = {}) => { const st = await C.confirmState(nonce, session, Date.parse(until) - C.CONFIRM_WINDOW_MS); db.prepare("INSERT INTO previews (id,project,person,created_at,expires_at,filed_at,digest,summary,filed) VALUES (?,?,?,?,?,?,?,?,?)").run(id, "p", extra.person || "o", T0, extra.expires || "2999-01-01T00:00:00.000Z", extra.filedAt || null, "d", JSON.stringify({ v: 1, items: [], confirm: st }), extra.filed || null); };
const FUT = new Date(Date.now() + 40000).toISOString(), PAST = new Date(Date.now() - 1000).toISOString();
await ins("P-0000000000000001", FUT);
const msg = (pid, n = nonce, result = { action: "accept", content: { file: true } }) => ({ jsonrpc: "2.0", id: `sg-confirm:${pid}:${n}`, result });
const O = { id: "o" }, M = { id: "m" };
const ans = (pid) => (db.prepare("SELECT json_extract(summary,'$.confirm.answer') AS a FROM previews WHERE id=?").get(pid) || {}).a;
ok((await C.recordAnswer(env, M, session, msg("P-0000000000000001"), { canWrite: true })).error === "confirm_not_open" && !ans("P-0000000000000001"), "another person's answer: refused, nothing recorded");
ok((await C.recordAnswer(env, O, { id: "sg1e." + "d".repeat(32) }, msg("P-0000000000000001"), { canWrite: true })).error === "confirm_not_open", "another session's answer: refused");
ok((await C.recordAnswer(env, O, session, msg("P-0000000000000001", "e".repeat(32)), { canWrite: true })).error === "confirm_not_open", "a wrong nonce: refused");
ok((await C.recordAnswer(env, O, session, msg("P-0000000000000001"), { canWrite: false })).error === "read_only_credential" && !ans("P-0000000000000001"), "a read-only credential: refused before any write");
ok((await C.recordAnswer(env, O, null, msg("P-0000000000000001"), { canWrite: true })).error === "session_required", "no session: refused");
ok((await C.recordAnswer(env, O, session, { jsonrpc: "2.0", id: 7, result: {} }, { canWrite: true })).error === "unknown_response", "an id this door never sent: refused");
const good = await C.recordAnswer(env, O, session, msg("P-0000000000000001"), { canWrite: true });
ok(good.recorded && good.answer === "accept" && ans("P-0000000000000001") === "accept", "the author, the session, the nonce, in time: recorded (one word)");
ok((await C.recordAnswer(env, O, session, msg("P-0000000000000001", nonce, { action: "decline" }), { canWrite: true })).error === "confirm_not_open" && ans("P-0000000000000001") === "accept", "a second answer (a replay, or a change of mind): refused, the first stands");
await ins("P-0000000000000002", PAST);
ok((await C.recordAnswer(env, O, session, msg("P-0000000000000002"), { canWrite: true })).error === "confirm_not_open" && !ans("P-0000000000000002"), "after the window: refused");
await ins("P-0000000000000003", FUT, { filedAt: T0, filed: "{}" });
ok((await C.recordAnswer(env, O, session, msg("P-0000000000000003"), { canWrite: true })).error === "confirm_not_open", "a preview already filed: refused");
const stored = JSON.parse(db.prepare("SELECT summary FROM previews WHERE id='P-0000000000000001'").get().summary);
ok(!JSON.stringify(stored).includes(nonce) && !JSON.stringify(stored).includes(session.id), "the row keeps the binding's hash only: neither the nonce nor the session id");

// ---- 3b · the MRTR state ----
const RS = C.requestStateOf("P-0000000000000009", nonce);
ok(RS === `sg2.P-0000000000000009.${nonce}` && JSON.stringify(C.parseRequestState(RS)) === JSON.stringify({ previewId: "P-0000000000000009", nonce }), "the requestState sg2.<previewId>.<nonce> parses back");
ok(C.parseRequestState(RS + "0") === null && C.parseRequestState("sg-confirm:P-0000000000000009:" + nonce) === null && C.parseRequestState(42) === null, "anything else is no state");
ok((await C.mrtrKey(nonce, "o")) === (await C.confirmKey(nonce, "o:mrtr")) && (await C.mrtrKey(nonce, "o")) !== (await C.mrtrKey(nonce, "m")), "the key binds the nonce to the person (sha256(nonce:person:mrtr))");
const mst = await C.mrtrState(nonce, "o");
ok(Math.abs(Date.parse(mst.until) - Date.now() - C.MRTR_WINDOW_MS) < 5000 && C.MRTR_WINDOW_MS === 600000, "the MRTR window: 10 minutes");
db.prepare("INSERT INTO previews (id,project,person,created_at,expires_at,digest,summary) VALUES (?,?,?,?,?,?,?)").run("P-0000000000000009", "p", "o", T0, "2999-01-01T00:00:00.000Z", "d", JSON.stringify({ v: 1, items: [], confirm: mst }));
ok((await C.recordInput(env, M, RS, "accept", { canWrite: true })).error === "confirm_not_open" && !ans("P-0000000000000009"), "another person's retry: refused, nothing recorded");
ok((await C.recordInput(env, O, RS, "accept", { canWrite: false })).error === "read_only_credential", "a read-only credential: refused before any write");
ok(C.sessionOf(hdr("o:mrtr")) === null && (await C.recordAnswer(env, O, session, msg("P-0000000000000009"), { canWrite: true })).error === "confirm_not_open" && !ans("P-0000000000000009"), "a legacy answer cannot reach an MRTR row: its key needs a session id of the form <person>:mrtr, which the door never reads");
const rec2 = await C.recordInput(env, O, RS, "decline", { canWrite: true });
ok(rec2.recorded && rec2.answer === "decline" && ans("P-0000000000000009") === "decline", "the author's retry, in time: recorded");
ok((await C.recordInput(env, O, RS, "accept", { canWrite: true })).error === "confirm_not_open" && ans("P-0000000000000009") === "decline", "a second retry: refused, the first answer stands");

// ---- 3c · sprint 19: the write tools' confirm on a preview's row ----
db.prepare("INSERT INTO previews (id,project,person,created_at,expires_at,digest,summary) VALUES (?,?,?,?,?,?,?)").run("P-000000000000000c", "p", "o", T0, "2999-01-01T00:00:00.000Z", "{}", JSON.stringify({ v: 2, items: [], parts: {} }));
const st1 = { ...(await C.mrtrState(nonce, "o")), tool: "file_contribution" };
ok(!(await C.storePartConfirm(env, "P-000000000000000c", "m", st1)) && (await C.storePartConfirm(env, "P-000000000000000c", "o", st1)), "storePartConfirm: another person's write changes nothing; the author's is written");
const RS3 = C.requestStateOf("P-000000000000000c", nonce);
ok((await C.recordInput(env, O, RS3, "accept", { canWrite: true, verb: null, tool: "save_knowledge" })).error === "confirm_not_open" && !ans("P-000000000000000c"), "a retry naming another write tool than the one that asked: refused, nothing recorded");
const st2 = { ...(await C.mrtrState("f".repeat(32), "o")), tool: "save_knowledge" };
await C.storePartConfirm(env, "P-000000000000000c", "o", st2);
ok((await C.recordInput(env, O, RS3, "accept", { canWrite: true, verb: null, tool: "file_contribution" })).error === "confirm_not_open", "a later part's confirm replaces the earlier: the first state answers nothing");
const r3 = await C.recordInput(env, O, C.requestStateOf("P-000000000000000c", "f".repeat(32)), "accept", { canWrite: true, verb: null, tool: "save_knowledge" });
ok(r3.recorded && ans("P-000000000000000c") === "accept", "the confirm that stands, retried on its own tool: recorded");
db.prepare("UPDATE previews SET filed_at = ? WHERE id = 'P-000000000000000c'").run(T0);
ok(!(await C.storePartConfirm(env, "P-000000000000000c", "o", st1)), "a preview filed whole takes no new confirm");

// ---- 4 · the prune ----
const now = Date.parse("2026-10-03T12:00:00.000Z");
const day = 24 * 3600 * 1000, iso = (t) => new Date(t).toISOString();
const row = db.prepare("INSERT INTO previews (id,project,person,created_at,expires_at,filed_at,digest,summary,filed) VALUES (?,?,?,?,?,?,?,?,?)");
row.run("P-a000000000000001", "p", "o", T0, iso(now - day - 60000), null, "d", "{}", null);            // unfiled, a day past: pruned
row.run("P-a000000000000002", "p", "o", T0, iso(now - day + 60000), null, "d", "{}", null);            // unfiled, not yet a day past: kept
row.run("P-a000000000000003", "p", "o", T0, iso(now - 30 * day), iso(now - 30 * day), "d", "{}", "{}"); // filed long ago: kept (the record)
row.run("P-a000000000000004", "p", "o", T0, iso(now - 30 * day), null, "d", "{}", '{"items":[]}');    // partly filed: kept (a retry, the receipt)
// another org's preview, as old: org 1's prune never touches it, its own org's does
db.exec(`INSERT INTO projects (key,name,active,created_at) VALUES ('o2--x','X',1,'${T0}'); INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('q','Q','q@y','owner','hq',1,'${T0}',2)`);
row.run("P-b000000000000001", "o2--x", "q", T0, iso(now - day - 60000), null, "d", "{}", null);
const before = db.prepare("SELECT count(*) AS n FROM previews").get().n;
const pr = await PV.prunePreviews(asOrg(env, 1), now);   // the cron runs it as the deployment for one org (src/cron.js)
const left = db.prepare("SELECT id FROM previews WHERE id LIKE 'P-a%' ORDER BY id").all().map((r) => r.id);
ok(pr.deleted === 1 && JSON.stringify(left) === JSON.stringify(["P-a000000000000002", "P-a000000000000003", "P-a000000000000004"]), `the prune deletes only the unfiled row a day past its hour (${pr.deleted} of ${before})`);
const other = () => db.prepare("SELECT COUNT(*) AS n FROM previews WHERE id = 'P-b000000000000001'").get().n;
ok(other() === 1, "org 1's prune leaves another org's expired preview");
const pr2 = await PV.prunePreviews(asOrg(env, 2), now);
ok(pr2.deleted === 1 && other() === 0 && db.prepare("SELECT COUNT(*) AS n FROM previews WHERE id LIKE 'P-a%'").get().n === 3, `org 2's prune deletes its own expired preview alone (${pr2.deleted})`);
ok(/LIMIT 500/.test(PV.PRUNE_SQL) && PV.PRUNE_GRACE_MS === day, "bounded: at most 500 rows an org a run, a day's grace");

// ---- 5 · the card ----
const tpl = K.cardTemplate();
ok(/^<!doctype html>/i.test(tpl) && tpl.length < 256 * 1024, `the template: one HTML5 document, ${tpl.length} bytes`);
ok(!/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(tpl) && !/url\(\s*['"]?(?!data:)[a-z]/i.test(tpl), "no external URL in it");
ok(!/<[^>]+\son[a-z]+\s*=/i.test(tpl) && (tpl.match(/<script\b/gi) || []).length === 1, "no inline event handler; one script (the bridge)");
ok(tpl.includes(`content="${K.CARD_CSP}"`) && /default-src 'none'/.test(K.CARD_CSP) && /connect-src 'none'/.test(K.CARD_CSP), "its CSP: nothing from the network");
ok(/--page:/.test(tpl) && /\.p-card\{/.test(tpl) && /prefers-color-scheme:light/.test(tpl), "the brand tokens (both worlds) and the parts' stylesheet are inlined");
ok(/ui\/initialize/.test(tpl) && /ui\/notifications\/initialized/.test(tpl) && /ui\/notifications\/tool-result/.test(tpl) && /ui\/open-link/.test(tpl) && /size-changed/.test(tpl) && /'tools\/call'/.test(tpl), "the bridge speaks ui/initialize, initialized, tool-result, tools/call, ui/open-link, size-changed");
const it = (i, verdict, extra = {}) => ({ i, n: i + 1, type: "knowledge", kind: "goal", kindWord: "goal", line: `Goal: G${i}`, verdict, effect: "files at once", tab: "goals", places: [{ tab: "goals", path: "/goals/g" + i, region: "tree", what: "w" }], reasons: [], ...extra });
const ans1 = { previewId: "P-00000000000000aa", project: "alpha", items: [it(0, "files"), it(1, "waits_for_owner")], counts: { byVerdict: { files: 1, waits_for_owner: 1 } }, reach: null, leftOut: [{ what: "a side thread", why: "no fact" }], ready: 2, notReady: 0, url: "http://x/preview/P-00000000000000aa", text: "t",
  parts: [{ tool: "save_knowledge", items: [1, 2], ready: 2 }] };
const fr = K.cardFragment(ans1, { origin: "https://org.example" });
const rows = [...fr.matchAll(/data-i="(\d+)" data-verdict="([a-z_]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
ok(JSON.stringify(rows) === '["0:files","1:waits_for_owner"]', "the fragment's rows are the preview's items with their verdicts");
ok(/data-file data-tool="parts" data-parts="\[\{&quot;tool&quot;:&quot;save_knowledge&quot;,&quot;items&quot;:\[1,2\]\}\]" data-preview-id="P-00000000000000aa"/.test(fr), "the File action names each part's write tool and its items, and the preview's id");
ok(/req\('tools\/call',calls\[k\]\)/.test(tpl) && /name:p\.tool,arguments:\{previewId:pid,items:p\.items\.map/.test(tpl) && !/tool==='file'/.test(tpl), "the bridge calls each part's tool in turn, with its items picked from the preview's own");
ok(!/href="\/(?!\/)/.test(fr) && /href="https:\/\/org\.example\/goals\/g0\?project=alpha" data-open/.test(fr) && /href="https:\/\/org\.example\/preview\/P-00000000000000aa" data-open/.test(fr), "its links are absolute and opened through the host (data-open)");
ok(!/\sdata-file\s/.test(K.cardFragment({ ...ans1, items: [it(0, "files"), it(1, "needs")], ready: 1, notReady: 1, counts: { byVerdict: { files: 1, needs: 1 } } }, { origin: "https://o" })), "a preview with an item not ready: no File action");
const view = { id: "P-00000000000000aa", project: "alpha", projectName: "Alpha", author: false, by: { name: "Rae" }, createdAt: T0, expiresAt: T0, filedAt: null, state: "open", items: [it(0, "files")], counts: { byVerdict: { files: 1 } }, reach: null, leftOut: [], note: "", hidden: 0, fileCounts: {},
  parts: [{ tool: "save_knowledge", items: [1], filed: false }] };
ok(!/\sdata-file\s/.test(K.cardFragment(view, { origin: "https://o" })) && /\sdata-file\s/.test(K.cardFragment({ ...view, author: true }, { origin: "https://o" })), "brain://card for a reader who is not the author: no File action (the author's: one)");
const rec = { previewId: "P-00000000000000aa", project: "alpha", complete: true, filedAt: T0, items: [{ ...it(0, "files"), filed: { status: "filed", id: "T-20261001-001" } }], leftOut: [], counts: { filed: 1, unchanged: 0, left: 0, notFiled: 0 }, results: [{ i: 0, status: "filed" }], url: "" };
const rf = K.cardFragment(rec, { origin: "https://o" });
ok(/data-state="filed"/.test(rf) && !/\sdata-file\s/.test(rf) && /data-filed-id="T-20261001-001"/.test(rf), "a receipt: filed, what each item became, no File action");
const pub = { preview: true, verb: "publish", id: "T-20261001-009", slug: "triage", v: 2, line: "Publish triage v2 (skill): sorts the inbox", shows: [{ tab: "broadcast", path: "/broadcast", region: "shelf", what: "w" }], reaches: "No project yet.", next: { tool: "publish", args: { id: "T-20261001-009", confirm: true } } };
const pf = K.cardFragment(pub, { origin: "https://o" });
ok(/data-tool="publish"/.test(pf) && pf.includes(`data-args="${'{&quot;id&quot;:&quot;T-20261001-009&quot;,&quot;confirm&quot;:true}'}"`), "a publish preview's button calls publish with confirm: true (its own next)");
ok(K.cardFragment({ error: "project_forbidden" }) === "" && K.cardFragment("text") === "", "a refusal draws no card (the text says it)");
// the page and the card draw the same summary block
const page = PG.renderPreviewPage({ ...view, author: true });
const pageRows = [...page.matchAll(/data-i="(\d+)" data-verdict="([a-z_]+)"/g)].map((m) => m[0]);
const cardRows = [...K.cardFragment({ ...view, author: true }, { origin: "" }).matchAll(/data-i="(\d+)" data-verdict="([a-z_]+)"/g)].map((m) => m[0]);
ok(pageRows.length === 1 && JSON.stringify(pageRows) === JSON.stringify(cardRows), "the page and the card draw the same rows (one renderer: summaryParts)");
// ---- 5b · sprint 12, 12.6: the card's polish ----
// the brand faces ride the template as data: URIs, and the CSP lets data: fonts in and nothing else
const fontSrc = (/(?:^|;\s*)font-src ([^;]*)/.exec(K.CARD_CSP) || [])[1];
ok(fontSrc === "data:" && /default-src 'none'/.test(K.CARD_CSP), `the CSP allows data: fonts alone (font-src ${fontSrc || "absent: the default-src 'none' blocks every face"})`);
const faces = [...tpl.matchAll(/@font-face\{font-family:'([^']+)'[^}]*src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\) format\('woff2'\)/g)].map((m) => [m[1], m[2].length]);
ok(JSON.stringify(faces.map((f) => f[0]).sort()) === JSON.stringify(["Fredoka", "JetBrains Mono", "Manrope"]) && faces.every((f) => f[1] > 1000 && f[1] < 20000),
  `the three brand faces inlined, each a small cut (${faces.map((f) => `${f[0]} ${f[1]} b64`).join(", ") || "none"})`);
ok(K.CARD_TEMPLATE_MAX === 96 * 1024 && new TextEncoder().encode(tpl).length <= K.CARD_TEMPLATE_MAX, `the template inside its budget: ${new TextEncoder().encode(tpl).length} of ${K.CARD_TEMPLATE_MAX} bytes`);
// a question's line: no comma after its question mark
const qLine = (await import(join(ENGINE, "src", "knowledge", "schema.js"))).previewLine("question", { qid: "Q-t", question: "Do the connector and the plugin go together?", status: "decided", options: [{ what: "a" }, { what: "b" }] });
const qFr = K.cardFragment({ ...ans1, items: [{ ...it(0, "files"), kind: "question", kindWord: "question", line: qLine }] }, { origin: "https://o" });
ok(!/\?,/.test(qLine) && /together\? 2 options, decided/.test(qFr), `a question's line has no "?," (${qLine})`);
// an equip preview names each place once, and its one fact (Reaches) takes the row's width
const eq = { preview: true, verb: "equip", slug: "qa-verify", project: "o3--sharingu", line: "Equip the starter agent QA verify v2 in sharingu", reaches: "Everyone seated on sharingu gets it: the doc starter/qa-verify.md is written.",
  shows: [{ tab: "broadcast", path: "/broadcast", region: "shelf", what: "w" }, { tab: "broadcast", path: "/broadcast/starter/qa-verify", region: "item", what: "w" }, { tab: "home", path: "/home", region: "week", what: "w" }],
  next: { tool: "equip", args: { slug: "qa-verify", confirm: true } } };
const ef = K.cardFragment(eq, { origin: "https://o" });
const eqPlaces = [...ef.matchAll(/class="pv-place"[^>]*>([^<]+)</g)].map((m) => m[1]);
ok(JSON.stringify(eqPlaces) === '["Broadcast","Home"]', `an equip names each place once: ${eqPlaces.join(" · ")}`);
ok(/\[data-region="items"\] \.p-ld-facts>div:only-child\{grid-column:1\/-1\}/.test(tpl) && (ef.match(/<dt>/g) || []).length === 1, "an item's one fact (an equip's Reaches) spans the row, never a third of it");
ok(/<span class="sg-proj">sharingu<\/span>/.test(ef) && !/o3--/.test(ef.replace(/data-args="[^"]*"|href="[^"]*"/g, "")), "the card names the project by its slug, never the org-prefixed key o3--sharingu");
// a needs row says its need once: a Why that only restates Needs is not drawn; a Why that adds a field stays
const needsIt = (reasons) => ({ ...it(0, "needs"), kind: "contribution", kindWord: "contribution", line: "Contribution (Code): Long previews", reasons, needs: { field: "touches", fields: ["touches"], hint: "the ids or areas it touches (leave it out for a plain note)", formats: { shape: "code" } } });
const nf = K.cardFragment({ ...ans1, items: [needsIt(["It needs touches (what it touches: touches or components)."])], ready: 0, notReady: 1, counts: { byVerdict: { needs: 1 } } }, { origin: "https://o" });
const dts = [...nf.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
ok(JSON.stringify(dts) === '["Needs","Format"]', `a needs row whose Why restates Needs shows it once: ${dts.join(", ")}`);
const nf2 = K.cardFragment({ ...ans1, items: [needsIt(["It needs what and touches."])], ready: 0, notReady: 1, counts: { byVerdict: { needs: 1 } } }, { origin: "https://o" });
ok(/<dt>Why<\/dt>/.test(nf2) && typeof K.isEcho === "function" && K.isEcho("It needs touches.", { field: "touches" }) && !K.isEcho("It needs what and touches.", { field: "touches" }) && !K.isEcho("Screen x is not in the project's Map.", { field: "screens" }), "a Why naming more than the one field it needs stays");
// a decided question shows its ruling's reason, one line, on the card and the page
const ruled = { ...it(0, "files"), kind: "question", kindWord: "question", line: qLine, rationale: "One review covers both, and the listing links them." };
const rfr = K.cardFragment({ ...ans1, items: [ruled] }, { origin: "https://o" });
ok(/data-region="rationale"[^>]*><span class="pv-k">Why<\/span>One review covers both, and the listing links them\.<\/span>/.test(rfr) && /\.pv-why,\.pv-at\{display:block;[^}]*white-space:nowrap\}/.test(tpl), "a decided question's rationale: one line under its line on the card");
ok(/data-region="rationale"/.test(PG.renderPreviewPage({ ...view, author: true, items: [ruled] })) && !/data-region="rationale"/.test(fr), "the page draws it too; a row with no rationale draws none");

const doc = K.cardDocument({ fragment: fr, theme: "light" });
ok(/<html lang="en" data-theme="light">/.test(doc) && doc.includes(fr), "a standalone document: the template with the fragment drawn and the theme set");

console.log(`${fail ? "✗" : "✓"} confirm-card-selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
