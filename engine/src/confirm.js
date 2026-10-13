// src/confirm.js — the confirm prompt (sprint 3, D3; docs/plan/MCP.md §4 "How the person sees it": one preview, three
// renders; the confirm is MCP elicitation; sprint 19: asked by the write tools, never by preview). ONE tool call from the
// person's side, still two steps inside: a write tool (file_contribution, save_knowledge, remove_knowledge: src/formats.js
// WRITE_TOOLS) with fileOnConfirm: true runs every check of its filing and files nothing (src/preview.js filePart, check), writes
// the confirm's binding into the preview's row (storePartConfirm), then — only for a client that DECLARED elicitation at
// initialize — the answer to that tools/call is a Server-Sent Events stream whose first message is the server's
// `elicitation/create` request (the part's own text render, bounded, and a one-boolean form). The client answers on ANOTHER POST
// (the JSON-RPC response, with the session id); that answer is recorded on the preview's row; the open stream reads the row
// and, on accept, files exactly what was previewed through the SAME tool (callTool with that tool's name: the write scope, the
// read-only refusal, the author's project scope, the part's digest), then sends the tools/call result and closes. Decline,
// cancel, a JSON-RPC error, a timeout or a closed stream file nothing and say so. The plain call (the tool without
// fileOnConfirm) stays exactly as it was: the fallback every client can use.
//
// Spec: MCP 2025-06-18 (client/elicitation, basic/transports "Streamable HTTP"); notes in engine/.runs/d3/SPEC-NOTES.md.
//
// Sessions (stateless worker, nothing stored): a client whose initialize declares `capabilities.elicitation` (an empty
// object, or one with `form`: the 2025-11-25 shape) is answered with an `Mcp-Session-Id` of the form sg1e.<32 hex> (sg1eu.,
// sg1u. when it declared the MCP Apps extension too, or only it: src/previewcard.js), random; since sprint 13 (13.1) a client
// whose clientInfo names a known family gets one too, the family word between the flags and the hex (sg1.claude-code.<32 hex>,
// sessionFor below); a client that declares none of these gets no session id (its answers are byte-for-byte what they were).
// The id a sprint-13 door mints does not match an older door's pattern: after a rollback such a client reads as session-less
// (the capability fallback) until it initializes again — never a 404. The flag in the id
// only decides whether the door MAY ask; it grants nothing: a forged id gets a stream the client cannot answer, and the
// filing is still the bearer's own write tool. A malformed id is treated as no session (never a 404: the door keeps no sessions
// to lose).
//
// Correlation (no shared memory between requests on Workers): the preview row IS the state. Its stored summary carries
// confirm: { key, until, tool } where key = sha256(<nonce>:<session id>) and the nonce is 128 random bits that ride ONLY inside
// the elicitation request's JSON-RPC id (sg-confirm:<previewId>:<nonce>); each new confirm on the row (one per part) replaces
// the last, and the stream reads an answer only under its OWN key, so a yes to one part never files another. An answer is recorded by ONE conditional UPDATE:
// the same person as the preview's author, the same session id, the same nonce, before `until`, not answered before, not
// filed — so an answer to someone else's id, from another session, after the window, or a second (replayed) answer changes
// nothing and is refused 400. What is recorded is one word (accept · decline · cancel · error); nothing else of the
// answer's content is kept.
//
// Limits (stated, not hidden): the stream stays open at most CONFIRM_WINDOW_MS (under the 60-second request timeout the
// MCP TypeScript SDK sets by default, so a client is not left with a cut-off call), reading the row on a backing-off
// schedule (CONFIRM_POLLS, then one read after the window: at most 19 reads of one row each, by its primary key) and sending
// a keep-alive comment between. The stream adds those reads to the call's own D1 statements (the check's, then the filing's
// on accept); Workers Paid allows 1,000 statements a request, the free plan 50 — a free-plan limit the plain call meets the same
// way. The door asks only when the part would file (every refusal of the plain call is answered as it is, and a part that files
// nothing, every item unchanged, is answered without asking, saying why).
//
// D3b: the same confirm on the 2026-07-28 revision (MRTR, basic/patterns/mrtr; notes in engine/.runs/d3b/SPEC-NOTES.md). No
// session and no stream: a request that declares form elicitation in its own `_meta` clientCapabilities is answered
// `resultType: "input_required"` with ONE input request (`file`: the same message and the same one-boolean form) and a
// `requestState` of sg2.<previewId>.<nonce>. The client retries the call with that state and its answer; the retry is recorded
// by the same ONE conditional UPDATE, keyed sha256(<nonce>:<person id>:mrtr) (the person in place of the session) and bound to
// the tool retried (confirm.tool), inside MRTR_WINDOW_MS, then an accept files through the same tool. The state is opaque to the client and grants nothing by
// itself: it names a row, and only the row's author, able to write, inside the window, once, can use it; a tampered state
// matches no row. The retry reads one row (the UPDATE) where the stream read it up to 19 times.
//
// Sprint 7, 7.5b: `publish` and `equip` ask the SAME confirm (PLATFORM §3, sprint 3's D3 row "publish and equip show the card but
// ask no confirm"). publish {id, publishOnConfirm: true} / equip {slug, v, project?, equipOnConfirm: true}: the verb runs every
// check and answers its preview (src/broadcast.js, nothing published or equipped), and — only for a client that declared form
// elicitation — the same confirm row is written into `previews` (storeVerbConfirm: its summary { v, verb, args, confirm }, args
// being what the preview SHOWED: the draft's id, or the slug, version and resolved project; digest the call as SENT), then the
// same elicitation (a stream on the handshake revision; "input required" and its retry on the stateless one). On accept the row
// is CLAIMED (claimVerb: one read, one conditional DELETE: the author's, unfiled, answered accept — once) and the verb runs with
// confirm: true through the same callTool, as its author, with the args the person saw; decline, cancel, a timeout or a closed
// stream run nothing. A verb's row is never a preview of items: the write tools and the preview page answer it as unknown
// (src/preview.js). The two calls (the verb, then the verb with confirm: true) stay as they were: the fallback every client can
// use, and what a client that declines every confirm on its own (Claude Code desktop: BETA line 3) gets — the answer says so.
import { db } from "./data.js";
import { now, sha256, hex } from "./util.js";
import { NAMED_FAMILIES } from "./client.js";
import { projectSlug } from "./project.js";   // sprint 13 (13.2): the form's line names the project by its slug

export const SESSION_HEADER = "Mcp-Session-Id";
// sprint 13, 13.1: the id may carry the client's family word (src/client.js NAMED_FAMILIES) between the flags and the hex: sg1eu.claude-code.<32 hex>
export const SESSION_RE = new RegExp(`^sg1(e?)(u?)\\.(?:(${NAMED_FAMILIES.join("|")})\\.)?([0-9a-f]{32})$`);
export const CONFIRM_ID_RE = /^sg-confirm:(P-[0-9a-f]{16}):([0-9a-f]{32})$/;
export const CONFIRM_WINDOW_MS = 50_000;
// the poll schedule (ms after the elicitation was sent): every 2 s for 10 s, then every 3 s to 49 s — 18 reads, then one
// after the window
export const CONFIRM_POLLS = [...Array.from({ length: 5 }, (_, i) => (i + 1) * 2000), ...Array.from({ length: 13 }, (_, i) => 10_000 + (i + 1) * 3000)];
export const KEEPALIVE_MS = 15_000;
export const MESSAGE_MAX = 4000;         // the elicitation message: the preview's text, at most this many characters
export const ANSWERS = ["accept", "decline", "cancel", "error"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// elicitsForm(capabilities) -> true when the client declared form elicitation: `elicitation: {}` (2025-06-18; the
// 2025-11-25 revision reads an empty object as form) or `elicitation: { form: {...} }`. A client that declared only the
// URL mode, or nothing, is never asked.
export function elicitsForm(caps) {
  const e = isObj(caps) ? caps.elicitation : null;
  if (!isObj(e)) return false;
  return Object.keys(e).length === 0 || isObj(e.form);
}
// rendersCard(capabilities) -> true when the client declared the MCP Apps extension with its HTML type (2026-01-26:
// capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes, REQUIRED, includes "text/html;profile=mcp-app")
export const UI_EXTENSION = "io.modelcontextprotocol/ui";
export function rendersCard(caps) {
  const x = isObj(caps) && isObj(caps.extensions) ? caps.extensions[UI_EXTENSION] : null;
  return isObj(x) && Array.isArray(x.mimeTypes) && x.mimeTypes.includes("text/html;profile=mcp-app");
}
// sessionFor(capabilities, family?) -> a new session id for a client that declared form elicitation (flag e) or the Apps extension
// (flag u), or (sprint 13, 13.1) whose initialize clientInfo named a known family (src/client.js familyOfName: claude,
// claude-code, chatgpt, codex), kept as that ONE word between the flags and the hex — never the raw name. A client that declared
// none of these gets no session id, and its answers are what they always were. The word is the client's own say (a label: the
// client presents the id back, and may present any): the door reads it only to stamp which AI filed a row.
export function sessionFor(caps, family = null) {
  const f = `${elicitsForm(caps) ? "e" : ""}${rendersCard(caps) ? "u" : ""}`;
  const fam = NAMED_FAMILIES.includes(family) ? family : "";
  return f || fam ? `sg1${f}.${fam ? fam + "." : ""}${hex(16)}` : null;
}
// sessionOf(request) -> { id, elicit, ui, client } | null — the request's session id, when it is one this door issues (client: its
// family word, or null)
export function sessionOf(request) {
  const v = String((request && request.headers && request.headers.get(SESSION_HEADER)) || "").trim();
  const m = SESSION_RE.exec(v);
  return m ? { id: v, elicit: m[1] === "e", ui: m[2] === "u", client: m[3] || null } : null;
}
// acceptsStream(request) -> the client said it takes text/event-stream (Streamable HTTP: a client MUST list both types)
export const acceptsStream = (request) => /text\/event-stream/i.test(String((request && request.headers && request.headers.get("accept")) || ""));

// confirmSchema({ title, line }) -> the smallest form the spec allows: ONE boolean, required, false by default, titled by what it
// does (a write tool's part, 7.5b's verbs) and described by its line (the key stays `file`: the one answer)
export function confirmSchema(what) {
  return { type: "object", properties: { file: { type: "boolean", title: what.title, description: what.line, default: false } }, required: ["file"] };
}
// sprint 19: each write tool's confirm — its form's title and the line of its part (n items into a project)
export const PART_CONFIRM = {
  file_contribution: { title: "File", line: (n, p) => `File ${n} contribution${n === 1 ? "" : "s"} into ${p}` },
  save_knowledge: { title: "Save", line: (n, p) => `Save ${n} knowledge item${n === 1 ? "" : "s"} in ${p}` },
  remove_knowledge: { title: "Remove", line: (n, p) => `Remove ${n} knowledge item${n === 1 ? "" : "s"} from ${p}` },
};
// partAsk(check, confirm) -> the elicitation for a write tool's part: the part's terminal text and the one-boolean form; key: the
// confirm's own binding, under which alone the stream reads an answer
export const partAsk = (out, confirm) => ({ id: out.previewId, key: confirm.key, until: confirm.until, message: confirmMessage(out.text),
  schema: confirmSchema({ title: PART_CONFIRM[out.tool].title, line: PART_CONFIRM[out.tool].line(Number(out.ready) || 0, projectSlug(out.project) || "the org") }) });
// confirmMessage(text) -> the preview's own text render, at most MESSAGE_MAX characters (a cut says so on its own line)
export function confirmMessage(t) {
  const s = String(t || "");
  if (s.length <= MESSAGE_MAX) return s;
  const cut = s.slice(0, MESSAGE_MAX - 40);
  return cut.slice(0, Math.max(0, cut.lastIndexOf("\n"))) + "\n ... (the rest is on the preview page)";
}
export const confirmKey = (nonce, sessionId) => sha256(`${nonce}:${sessionId}`);
// answerWord(message) -> what the client's JSON-RPC response says, as one word: accept (only with file: true), decline,
// cancel, or error (a JSON-RPC error: the client could not ask)
export function answerWord(msg) {
  if (!isObj(msg)) return null;
  if (isObj(msg.error)) return "error";
  const r = isObj(msg.result) ? msg.result : null;
  if (!r) return null;
  if (r.action === "accept") return isObj(r.content) && r.content.file === true ? "accept" : "decline";
  if (r.action === "decline" || r.action === "cancel") return r.action;
  return null;
}
export const isResponse = (rq) => isObj(rq) && rq.method === undefined && rq.id !== undefined && rq.id !== null && ("result" in rq || "error" in rq);

// recordAnswer(env, who, session, msg) -> { recorded: true, previewId, answer } | { error, note } — the client's answer to an
// elicitation this door sent. ONE conditional UPDATE (one row, by its primary key); every binding is in its WHERE clause.
// AUTHORITY: the answering credential must be the preview's author (person), able to write (not read-only, an OAuth grant
// with mcp:write), on the same session (its id hashed with the nonce), inside the window, the first answer, before any file.
export async function recordAnswer(env, who, session, msg, { canWrite }) {
  const m = CONFIRM_ID_RE.exec(String(msg && msg.id));
  if (!m) return { error: "unknown_response", note: "No request of this door has this id." };
  const answer = answerWord(msg);
  if (!answer) return { error: "bad_answer", note: "The answer is neither an elicitation result nor an error." };
  if (!session) return { error: "session_required", note: `Send the ${SESSION_HEADER} header the initialize answer gave.` };
  if (!canWrite) return { error: "read_only_credential", note: "This credential cannot file, so it cannot answer a confirm. Nothing was filed." };
  const [, previewId, nonce] = m;
  return await recordWord(env, previewId, who.id, await confirmKey(nonce, session.id), answer);
}
// recordWord(env, previewId, personId, key, answer) -> the ONE conditional UPDATE both revisions record an answer with: the row
// by its primary key, its author, not filed, the confirm's key, no answer yet, inside `until`
export const NOT_OPEN = { error: "confirm_not_open", note: "No open confirm of yours has this id: nothing was recorded or filed." };
// bind (7.5b, the stateless retry only): { verb, digest, tool } — the row must be of the tool retried (verb NULL: a preview of
// items, its confirm asked by that write tool, sprint 19; "publish" / "equip": that verb's) and, for a verb, of the call as sent
// (digest), so a requestState never crosses tools
export const RECORD_WORD_SQL = "UPDATE previews SET summary = json_set(summary, '$.confirm.answer', ?1, '$.confirm.at', ?2) WHERE id = ?3 AND person = ?4 AND filed_at IS NULL" +
  " AND json_extract(summary, '$.confirm.key') = ?5 AND json_extract(summary, '$.confirm.answer') IS NULL AND json_extract(summary, '$.confirm.until') > ?2";
async function recordWord(env, previewId, personId, key, answer, bind = null) {
  const at = now();
  const r = bind
    ? await db(env).prepare(RECORD_WORD_SQL + " AND json_extract(summary, '$.verb') IS ?6 AND (?7 IS NULL OR digest = ?7) AND (?8 IS NULL OR json_extract(summary, '$.confirm.tool') = ?8)")
      .bind(answer, at, previewId, personId, key, bind.verb || null, bind.digest || null, bind.tool || null).run()
    : await db(env).prepare(RECORD_WORD_SQL).bind(answer, at, previewId, personId, key).run();
  const changed = Number(r && r.meta && r.meta.changes) || 0;
  // one refusal for every miss (another person's id, another session, a wrong nonce, too late, answered before, filed):
  // the answer never learns which
  if (changed !== 1) return { ...NOT_OPEN };
  return { recorded: true, previewId, answer };
}

// readAnswer(env, previewId, key) -> the recorded answer word, or null (ONE row read by its primary key); with key, only an
// answer to THAT confirm (a later confirm on the same row, another part's, replaced it: its answer is not this one's)
async function readAnswer(env, previewId, key = null) {
  const r = await db(env).prepare("SELECT json_extract(summary, '$.confirm.answer') AS a, json_extract(summary, '$.confirm.key') AS k FROM previews WHERE id = ?").bind(previewId).first();
  return r && ANSWERS.includes(r.a) && (key == null || r.k === key) ? r.a : null;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms)));

// confirmPlan(check) -> null when the door may ask (a write tool's part that passed every check and files at least one item),
// else the reason it does not, in words for the agent (a refused check is answered as the refusal it is)
export function confirmPlan(p) {
  if (!(Number(p && p.ready) > 0)) return "Nothing in it files (every item is unchanged), so the person was not asked.";
  return null;
}
// storePartConfirm(env, previewId, personId, confirm) -> true when the confirm's binding { key, until, tool } is written into the
// preview's row: ONE conditional UPDATE (its author, not filed whole), replacing any earlier confirm of the row (another part's)
export async function storePartConfirm(env, previewId, personId, confirm) {
  const r = await db(env).prepare("UPDATE previews SET summary = json_set(summary, '$.confirm', json(?1)) WHERE id = ?2 AND person = ?3 AND filed_at IS NULL")
    .bind(JSON.stringify({ key: String(confirm.key), until: String(confirm.until), tool: String(confirm.tool) }), previewId, personId).run();
  return (Number(r && r.meta && r.meta.changes) || 0) === 1;
}

// what the call says when the person's answer files nothing (both revisions)
// (sprint 19: a write tool's; "the call" is that tool, sent again without fileOnConfirm)
const AGAIN = "then, on their yes, send the same call again without fileOnConfirm";
export const ANSWER_NOTE = {
  decline: "The person declined: nothing was filed.",
  cancel: "The person dismissed the confirm: nothing was filed.",
  error: `The client could not ask the person: nothing was filed. Show them text, ${AGAIN}.`,
  timeout: `No answer came in time: nothing was filed. Show the person text, ${AGAIN}.`,
};
export const NOT_ASKED = {
  capability: `This client did not declare elicitation, so the person was not asked here and nothing was filed: show them text, ${AGAIN}.`,
  stream: `This request does not accept a stream (Accept: text/event-stream), so the person was not asked and nothing was filed: show them text, ${AGAIN}.`,
  batch: `A confirm cannot ride a JSON-RPC batch, so nothing was filed: show the person text, ${AGAIN}.`,
  // sprint 7's review (C4): an account connection acting in another org than its own, on the handshake revision (src/mcp.js)
  org: `A confirm is asked only in this connection's own org (the person's answer would come back naming none), so the person was not asked here and nothing was filed: show them text, ${AGAIN}.`,
};

// confirmStream({ ask, base, env, ctx, rpcId, nonce, fileCall, toResult, verb? }) -> a text/event-stream Response: the
// elicitation request, keep-alives, then the tools/call result. ask: { id: the row, key?: the confirm's own binding (an answer
// is read only under it), message, schema, until } (partAsk, verbAsk); base: what a call that files nothing answers (the part's
// check, the verb's preview); fileCall(rowId) runs the plain call as the caller (callTool: a write tool without fileOnConfirm, a
// verb with confirm: true). The stream's own work runs under ctx.waitUntil.
export function confirmStream(o) {
  const { ask, env, ctx, rpcId, fileCall, toResult } = o;
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  let open = true;
  const send = async (s) => { if (!open) return false; try { await w.write(enc.encode(s)); return true; } catch { open = false; return false; } };
  const message = (obj) => send(`event: message\ndata: ${JSON.stringify(obj)}\n\n`);
  const result = (out, failed) => message({ jsonrpc: "2.0", id: rpcId, result: toResult(out, failed) });
  const run = (async () => {
    try {
      const elicitId = `sg-confirm:${ask.id}:${o.nonce}`;
      const sent = await message({ jsonrpc: "2.0", id: elicitId, method: "elicitation/create",
        params: { message: ask.message, requestedSchema: ask.schema } });
      if (!sent) return;
      const t0 = Date.now();
      let answer = null, lastBeat = t0, polls = 0;
      for (const at of CONFIRM_POLLS) {
        // a keep-alive comment between polls keeps an idle proxy from closing the stream; a failed write is a closed stream
        while (Date.now() - t0 < at) {
          const next = Math.min(t0 + at, lastBeat + KEEPALIVE_MS);
          await sleep(next - Date.now());
          if (Date.now() - lastBeat >= KEEPALIVE_MS) { if (!(await send(": keep-alive\n\n"))) return; lastBeat = Date.now(); }
        }
        polls++;
        answer = await readAnswer(env, ask.id, ask.key);
        if (answer) break;
      }
      // the window closed: one last read after `until`, so an answer recorded in its last moment is seen (recordAnswer
      // refuses anything later)
      if (!answer) {
        const until = Date.parse(ask.until);
        if (Number.isFinite(until) && Date.now() < until) await sleep(until - Date.now() + 50);
        polls++;
        answer = await readAnswer(env, ask.id, ask.key);
      }
      const base = o.base;
      if (answer !== "accept") {
        const word = answer || "timeout";
        await result({ ...base, confirm: { asked: true, answer: word, filed: false, polls, note: answerNote(word, o.verb) } }, false);
        return;
      }
      // accept: the stream must still be there to carry the receipt; a closed stream files nothing (the person can file)
      if (!(await send(": filing\n\n"))) return;
      const out = await fileCall(ask.id);
      const failed = !!(out && out.error);
      await result({ ...(out && typeof out === "object" ? out : { answer: out }), confirm: { asked: true, answer: "accept", filed: !failed, polls } }, failed);
    } catch (e) {
      // a D1 failure mid-way: the call ends as an error, nothing more is filed by this stream
      try { await result(o.verb ? { error: "confirm_failed", note: `The confirm could not finish; nothing more was ${o.verb.done}. ${o.verb.retry}` }
        : { error: "confirm_failed", note: "The confirm could not finish; nothing more was filed. Send the same call again without fileOnConfirm: it files only what did not land.", previewId: ask.id }, true); } catch { /* the stream is gone */ }
    } finally {
      open = false;
      try { await w.close(); } catch { /* already closed */ }
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(run);
  return new Response(readable, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-store", "x-accel-buffering": "no" } });
}

// confirmState(nonce, session) -> the confirm's binding a write tool stores in the row (storePartConfirm) and a verb in its own
// confirm row (and the window's end, for the stream)
export async function confirmState(nonce, session, at = Date.now()) {
  return { key: await confirmKey(nonce, session.id), until: new Date(at + CONFIRM_WINDOW_MS).toISOString() };
}
export const newNonce = () => hex(16);

// ---- D3b: the confirm on the 2026-07-28 revision (MRTR) ----
// MRTR_WINDOW_MS: how long the person has to answer. No stream is held open, so the window is the person's time, not a
// request timeout; it stays inside the preview row's own hour (PREVIEW_TTL_MS, src/preview.js).
export const MRTR_WINDOW_MS = 10 * 60 * 1000;
export const MRTR_INPUT = "file";   // the one inputRequests key
export const REQUEST_STATE_RE = /^sg2\.(P-[0-9a-f]{16})\.([0-9a-f]{32})$/;
export const mrtrKey = (nonce, personId) => sha256(`${nonce}:${personId}:mrtr`);
// mrtrState(nonce, personId) -> the binding stored as confirmState's is: the key binds the nonce to the person
export async function mrtrState(nonce, personId, at = Date.now()) {
  return { key: await mrtrKey(nonce, personId), until: new Date(at + MRTR_WINDOW_MS).toISOString() };
}
export const requestStateOf = (previewId, nonce) => `sg2.${previewId}.${nonce}`;
// parseRequestState(value) -> { previewId, nonce } | null: anything not of the door's own form is no state at all
export function parseRequestState(v) {
  const m = typeof v === "string" ? REQUEST_STATE_RE.exec(v) : null;
  return m ? { previewId: m[1], nonce: m[2] } : null;
}
// inputRequiredOf(nonce, ask) -> the interim result: the ask's text and its one-boolean form, as ONE input request (ask: a
// write tool's part, partAsk; a verb's, verbAsk)
export function inputRequiredOf(nonce, a) {
  return { resultType: "input_required",
    inputRequests: { [MRTR_INPUT]: { method: "elicitation/create", params: { mode: "form", message: a.message, requestedSchema: a.schema } } },
    requestState: requestStateOf(a.id, nonce) };
}
// inputWord(inputResponses) -> accept (only with file: true) · decline · cancel, or null when the retry carries no answer
export function inputWord(responses) {
  const r = isObj(responses) ? responses[MRTR_INPUT] : null;
  const w = isObj(r) ? answerWord({ result: r }) : null;
  return w === "error" ? null : w;
}
// recordInput(env, who, requestState, answer, { canWrite }) -> { recorded: true, previewId, answer } | { error, note }: the
// retry's answer, recorded by the same conditional UPDATE as a legacy answer (recordWord), keyed by the person
// bind (7.5b): { verb, digest, tool } — the row must be the retried tool's (a preview's: verb null, its confirm the write tool's
// own, sprint 19; a verb's: that verb, the same call)
export async function recordInput(env, who, requestState, answer, { canWrite, verb = null, digest = null, tool = null }) {
  if (!canWrite) return { error: "read_only_credential", note: "This credential cannot file, so it cannot answer a confirm. Nothing was filed." };
  const st = parseRequestState(requestState);
  if (!st) return { ...NOT_OPEN };
  return await recordWord(env, st.previewId, who.id, await mrtrKey(st.nonce, who.id), answer, { verb, digest, tool });
}

// ---- 7.5b: the verbs' confirm (publish, equip) ----
// VERB_CONFIRM — each verb's argument that asks, the words its answers use, and how the two calls finish it
export const VERB_CONFIRM = {
  publish: { flag: "publishOnConfirm", title: "Publish", done: "published", retry: "Call publish again with confirm: true." },
  equip: { flag: "equipOnConfirm", title: "Equip", done: "equipped", retry: "Call equip again with confirm: true." },
};
// verbOf(name) -> the verb's words, or null for any other tool
// (a name that is not a string — a caller's object — is no verb: nothing of the caller's value is converted)
export const verbOf = (name) => (typeof name === "string" && Object.prototype.hasOwnProperty.call(VERB_CONFIRM, name) ? { name, ...VERB_CONFIRM[name] } : null);
// verbArgs(verb, args) -> the call as its preview runs it: the asking flag and confirm left out (orgSlug stays: callTool checks it)
export function verbArgs(verb, args) {
  const { confirm, [verb.flag]: ask, ...rest } = isObj(args) ? args : {};
  return rest;
}
// verbDigest(verb, args) -> the call as SENT, as one digest (domain-separated from a preview's items digest): its retry must match
export async function verbDigest(verb, args) {
  const { orgSlug, ...rest } = verbArgs(verb, args);
  const canon = JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
  return await sha256(`verb:${verb.name}:${canon}`);
}
// verbConfirmPlan(out) -> null when the door may ask (the verb's preview stood and its confirm row was written), else why not
export function verbConfirmPlan(out, verb) {
  if (!isObj(out) || out.error) return `The ${verb.name} was refused, so there is nothing to confirm.`;
  if (out.readOnly) return `A read-only credential previews a ${verb.name} and never ${verb.done === "published" ? "publishes" : "equips"}: nothing was asked.`;
  if (!out.confirmRow) return `Nothing was asked (the ${verb.name} names no project to hold its confirm): show the person text, then ${verb.retry.charAt(0).toLowerCase()}${verb.retry.slice(1)}`;
  return null;
}
// verbAsk(out, verb) -> the elicitation for a verb's preview: its terminal text, the one-boolean form titled by the verb
export const verbAsk = (out, verb) => ({ id: out.confirmRow, message: confirmMessage(out.text), until: out.confirmUntil, schema: confirmSchema({ title: verb.title, line: String(out.line || verb.title).slice(0, 200) }) });
// verbBase(out) -> the verb's preview as the call answers it (the confirm row's id and window are never part of an answer)
export function verbBase(out) {
  const { confirmRow, confirmUntil, ...rest } = isObj(out) ? out : { answer: out };
  return rest;
}

// storeVerbConfirm(env, person, { verb, project, args, digest }, confirm) -> the confirm row's id: ONE previews row (its author, the
// verb's project, the window as its expiry so the cron's prune takes an unanswered one a day later), the summary holding what the
// preview showed (args), the verb and the confirm's binding — never part of any answer
export async function storeVerbConfirm(env, person, { verb, project, args }, confirm) {
  const id = `P-${hex(8)}`, at = now();
  await db(env).prepare("INSERT INTO previews (id, project, person, created_at, expires_at, digest, summary) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, project, person.id, at, String(confirm.until), String(confirm.digest || ""), JSON.stringify({ v: 1, verb, args, by: { id: person.id }, confirm: { key: String(confirm.key), until: String(confirm.until) } })).run();
  return id;
}
// claimVerb(env, rowId, person, verb) -> the args the person confirmed, once: the row read by its key, then ONE conditional DELETE
// (the author's, of this verb, unfiled, answered accept); null when it is not that (another person's, another verb's, already
// claimed, not accepted)
export async function claimVerb(env, rowId, person, verb) {
  const row = await db(env).prepare("SELECT summary FROM previews WHERE id = ? AND person = ?").bind(rowId, person.id).first();
  let sum = null; try { sum = row ? JSON.parse(row.summary) : null; } catch { sum = null; }
  if (!sum || sum.verb !== verb.name || !isObj(sum.args)) return null;
  const r = await db(env).prepare("DELETE FROM previews WHERE id = ? AND person = ? AND filed_at IS NULL AND json_extract(summary, '$.verb') = ? AND json_extract(summary, '$.confirm.answer') = 'accept'")
    .bind(rowId, person.id, verb.name).run();
  return (Number(r && r.meta && r.meta.changes) || 0) === 1 ? sum.args : null;
}
// the words of a verb's answers (a write tool's are ANSWER_NOTE and NOT_ASKED)
const TWO_CALLS = (verb) => `Show the person text, then, on their yes, ${verb.retry.charAt(0).toLowerCase()}${verb.retry.slice(1)}`;
export function answerNote(word, verb) {
  if (!verb) return ANSWER_NOTE[word];
  if (word === "decline") return `The person declined: nothing was ${verb.done}. (A client that declines every confirm on its own, without showing the person, gets the two calls: ${TWO_CALLS(verb)})`;
  if (word === "cancel") return `The person dismissed the confirm: nothing was ${verb.done}.`;
  if (word === "error") return `The client could not ask the person: nothing was ${verb.done}. ${TWO_CALLS(verb)}`;
  return `No answer came in time: nothing was ${verb.done}. ${TWO_CALLS(verb)}`;
}
export function notAskedNote(why, verb) {
  if (!verb) return NOT_ASKED[why];
  if (why === "capability") return `This client did not declare elicitation, so the person was not asked here. ${TWO_CALLS(verb)}`;
  if (why === "stream") return `This request does not accept a stream (Accept: text/event-stream), so the person was not asked. ${TWO_CALLS(verb)}`;
  if (why === "org") return `A confirm is asked only in this connection's own org (the person's answer would come back naming none), so the person was not asked here. ${TWO_CALLS(verb)}`;
  return `A confirm cannot ride a JSON-RPC batch. ${TWO_CALLS(verb)}`;
}
