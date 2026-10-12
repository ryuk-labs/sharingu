import { db } from "./data.js";
import { effectiveConsent, carriesTranscript, fileTransmissionsBatch, doorProject, projectSeatsFor, projectArg, evalMarkRefused, REF_CONTENT } from "./core.js";
import { QID_RE } from "./knowledge/schema.js";
import { json, uid, now, isEvalMark } from "./util.js";
import { store, handoffKey as handoffKeyOf } from "./storage.js";   // sprint 6, 6.4: the report lies under the writer's org
import { getTenantConfig } from "./tenant.js";
import { timedFetch } from "./timing.js";

// Extracted from index.js's POST /wrap-up route (M-ADR-008a phase 2b, T9) — behavior-preserving.
// Couples three concerns, all preserved exactly: the ADR-102 consent-strip gate on
// authoredPrompts, the R2 put + D1 insert of the handoff record, and a conditional live
// fetch() to the GitHub API (guarded by env.GH_TOKEN) that opens an Issue.
//
// fileHandoffRecord is the ONE seam (ADR-063 seam rule): POST /wrap-up and the MCP
// wrap_up tool both call this, so there is one mapping of the wrap_up
// contract, not two. `summary` is required by both callers (the wrap_up contract
// §handoff — the contract text didn't say so explicitly, but every filer needs it to be legible).
// `via` names the submitting surface ("rest" | "mcp") — recorded on the R2 record and the exit event for
// review policy, never graded (M-ADR-034 loose end: the old MCP copy wrote via:"mcp"; the seam keeps it).
//
// WP3 (PRD one-mind 2026-09-09 · M-ADR-041): a report's `answers[]` may name a questionnaire CARD per
// answer — `{card, answer, basis?}` (contracts/door.declared.json handoffAnswer). Each such item files as
// that card's answer through the SAME seam /respond uses (core.js fileTransmissionsBatch: lane leader ·
// kind answer · touches decisions · gapRefs q/<card>), so the card shows the answered chip and the owner
// queue gets the row — the report is stored verbatim either way. Items without a card (strings, objects)
// file nothing, exactly as before. The eval mark rides every filed row when the report carries it.

// HANDOFF_CARD_RE — what a report's answers[] may answer: a QUESTION of the project, by its qid, so the shape is the
// question registry's own rule (QID_RE; the old questionnaire's record ids — RR1 · AQ0 · SK3a — are a subset). Sprint 5
// W1: the old shape alone made a real qid never match, so a member's wrap_up answers were dropped silently. Existence is
// the door's own gate (src/maprefs.js resolves gapRefs q/<qid> against k_questions): an unknown qid refuses and is said
// back in the receipt's note. Declared once more in contracts/door.declared.json handoffAnswer.card; the selftest
// asserts the two agree.
export const HANDOFF_CARD_RE = QID_RE;
// HANDOFF_TEMPO — a report that landed is `in` (received, live). WP2 (src/tempo.js) owns the vocabulary;
// this is the one constant a receipt wears, declared in door.declared.json handoffReceipt.receipt.
export const HANDOFF_TEMPO = "in";
export const HANDOFF_ANSWER_MAX = 2000;   // the `what` cap of a filed card answer (text + basis)
// W10 (B7a): a report's still-open items become the person's open loops (never for a suite row — the loops table
// carries no eval mark, so an eval report opening loops would pile them up on the fixed eval seats).
export const HANDOFF_LOOPS_MAX = 20;      // at most this many loops from one report
export const HANDOFF_SUMMARY_MAX = 200;   // the summary the exit event carries — the report's title on the thread

// THE RECORD'S BOUNDS (sprint 8's review B4): the report is ONE object in R2 per call, so every list in it is bounded as the
// summary is (4,000 characters): each of decisions, answers, proposals, open, attachments and authoredPrompts keeps at most
// HANDOFF_LIST_MAX items, each item at most HANDOFF_ITEM_MAX characters (a string's text cut to it, as the summary's; an object's
// JSON: a longer one keeps its plain fields, its strings cut to share the room, and is marked cut: true; anything else is its
// JSON text, cut), and the lists together at most HANDOFF_LISTS_MAX characters (filled in that order: an item past it is
// dropped). A list sent as anything but a list is stored as []. The receipt's note says how many items were cut or dropped.
// The record itself is not counted by the storage limit (PLATFORM §4 rules "files and screen pictures"; §3 carries it).
export const HANDOFF_LIST_MAX = 50;
export const HANDOFF_ITEM_MAX = 4000;
export const HANDOFF_LISTS_MAX = 256000;
export const HANDOFF_LISTS = ["decisions", "answers", "proposals", "open", "attachments", "authoredPrompts"];
const jsonLen = (x) => { try { return JSON.stringify(x).length; } catch { return Infinity; } };
// boundedItem(x) -> [the item as stored, cut?]. Pure.
function boundedItem(x) {
  if (x == null || typeof x === "number" || typeof x === "boolean") return [x ?? null, false];
  if (typeof x === "string") return x.length > HANDOFF_ITEM_MAX ? [x.slice(0, HANDOFF_ITEM_MAX), true] : [x, false];
  if (jsonLen(x) <= HANDOFF_ITEM_MAX) return [x, false];
  if (typeof x !== "object" || Array.isArray(x)) { let t = ""; try { t = JSON.stringify(x); } catch { t = ""; } return [t.slice(0, HANDOFF_ITEM_MAX), true]; }
  // its plain fields, in its own order; the strings filled shortest first, each with the room left (a short card id or basis
  // always stands beside a long answer)
  const fields = Object.entries(x).filter(([k, v]) => k !== "cut" && (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"));
  const out = { cut: true, ...Object.fromEntries(fields.map(([k, v]) => [k, typeof v === "string" ? "" : v])) };
  for (const k of Object.keys(out).reverse()) { if (jsonLen(out) <= HANDOFF_ITEM_MAX || k === "cut") break; delete out[k]; }
  for (const [k, v] of fields.filter(([k, v]) => typeof v === "string" && k in out).sort((a, b) => a[1].length - b[1].length)) {
    out[k] = v.slice(0, Math.max(0, HANDOFF_ITEM_MAX - jsonLen(out)));
    while (jsonLen(out) > HANDOFF_ITEM_MAX && out[k].length) out[k] = out[k].slice(0, Math.max(0, out[k].length - (jsonLen(out) - HANDOFF_ITEM_MAX)));
  }
  return [out, true];
}
// boundedLists(src) -> { lists: { <name>: [...] }, cut, dropped }: src's lists (HANDOFF_LISTS; authoredPrompts only when src
// carries it) within the bounds above. Pure; exported for the selftest.
export function boundedLists(src) {
  const lists = {};
  let total = 0, cut = 0, dropped = 0;
  for (const name of HANDOFF_LISTS) {
    const v = src ? src[name] : undefined;
    if (name === "authoredPrompts" && v === undefined) continue;
    const items = Array.isArray(v) ? v : [];
    if (items.length > HANDOFF_LIST_MAX) dropped += items.length - HANDOFF_LIST_MAX;
    const kept = [];
    for (const x of items.slice(0, HANDOFF_LIST_MAX)) {
      const [item, wasCut] = boundedItem(x);
      const len = jsonLen(item) + 1;
      if (total + len > HANDOFF_LISTS_MAX) { dropped++; continue; }
      total += len; kept.push(item); if (wasCut) cut++;
    }
    lists[name] = kept;
  }
  return { lists, cut, dropped };
}

// openLoopTitlesOf(open) — the loop titles a report's open[] yields: a string, or an object's `title`; trimmed,
// empty dropped, each capped at 400 (the loops.title cap open_items uses), at most HANDOFF_LOOPS_MAX. Pure.
export function openLoopTitlesOf(open) {
  const out = [];
  for (const x of Array.isArray(open) ? open : []) {
    const t = typeof x === "string" ? x : (x && typeof x === "object" && typeof x.title === "string" ? x.title : "");
    const v = t.trim();
    if (v) out.push(v.slice(0, 400));
    if (out.length >= HANDOFF_LOOPS_MAX) break;
  }
  return out;
}

// cardAnswersOf(answers) — the items of a report's answers[] that name a card, normalised: ONE per card
// (the first occurrence wins — a report that answers a card twice files it once), the card must match
// HANDOFF_CARD_RE, and the answer text must be non-empty. Pure; exported for the selftest.
export function cardAnswersOf(answers) {
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(answers) ? answers : []) {
    if (!a || typeof a !== "object" || Array.isArray(a)) continue;
    const card = typeof a.card === "string" ? a.card.trim() : "";
    if (!HANDOFF_CARD_RE.test(card) || seen.has(card)) continue;
    const answer = a.answer == null ? "" : String(a.answer).trim();
    if (!answer) continue;
    const basis = a.basis == null ? "" : String(a.basis).trim();
    seen.add(card);
    out.push({ card, answer, basis });
  }
  return out;
}

// cardAnswerItems(cards, {id, via, isEval, clientRef, project}) — the batch items for fileTransmissionsBatch,
// one per card. `what` = the answer text (+ " — basis: " + basis when present), capped at HANDOFF_ANSWER_MAX;
// `clientRef` = "<report ref>:<card>" — the report's own clientRef when the caller sent one (a RETRIED report
// then resolves to the original rows, M-ADR-006), else the stored report's id — so a card is never double-filed
// from one report. Pure; exported for the selftest.
export function cardAnswerItems(cards, { id, via, isEval, clientRef, project }) {
  const refBase = clientRef ? String(clientRef).slice(0, 40) : id;
  return cards.map(({ card, answer, basis }) => ({
    lane: "leader", kind: "answer", eval: isEval === true,
    what: (answer + (basis ? " — basis: " + basis : "")).slice(0, HANDOFF_ANSWER_MAX),
    why: `answer to card ${card} in a report (${via}, report ${id})`,
    touches: ["decisions"], gapRefs: ["q/" + card],
    via, clientRef: `${refBase}:${card}`.slice(0, 60),
    ...(project ? { project: String(project) } : {}),
    // G2 item 7: a clientRef's content is the card's answer (the why carries this report's own fresh id)
    [REF_CONTENT]: { card, answer, basis: basis || null },
  }));
}

export async function fileHandoffRecord(person, body, env, via = "rest") {
  const isEval = isEvalMark(body.eval);   // a suite row: own key prefix, eval:1 on the event, never in /inbox
  // ADR-102: the ONE sanctioned text field is consent-gated at the full grade —
  // below 'traces+prompts' it is STRIPPED (the handoff still files) with an honest
  // note in the receipt. Nothing else in the record is affected.
  let prompts = Array.isArray(body.authoredPrompts) ? body.authoredPrompts.slice(0, 200) : undefined;
  let promptsNote = null;
  if (prompts && (await effectiveConsent(person, env)) !== "traces+prompts") { // M-ADR-019: personal OR mandate floor
    prompts = undefined;
    promptsNote = "authoredPrompts dropped — your standing consent is below 'traces+prompts'. Set it on /profile to share authored prompts (ADR-102).";
  }
  // B7d S4a: the project rule is uniform — a report may name `project` like every other write. A claim is validated
  // through the SAME door (doorProject): a project the person holds no seat on is refused BEFORE anything is stored.
  // With no claim, a single-seat (or sole-project) person's project is stamped; a multi-seat person's report still
  // files on the REST door (the report is durable first — R never blocks on it) and its card answers say they need
  // `project` (below); on the MCP door it is refused first since B7e C2 (below).
  // B7e C2 (r109): the MCP wrap_up follows THE one project rule (core.js PROJECT_RULE) like ask and
  // file — a multi-seat seat with no active project and no `project` is refused with project_required,
  // BEFORE anything is stored (a refusal, never a lost report: nothing was written). POST /wrap-up (the REST door,
  // which sends no project) keeps filing that report at the org level, unchanged
  // (contracts/door.declared.json handoffReceipt.project).
  let project = null;
  let refusal = null;
  try {
    const seats = await projectSeatsFor(person.id, env);
    // D3 (U-MCP-tail-b): the claim is parsed by projectArg (doorProject's own) — a non-string `project` is a claim, refused
    const pa = projectArg(body.project);
    const claimed = !!pa.error || !!pa.project;
    const d = await doorProject(person, { project: body.project }, seats, env, { orgLevelOk: true });   // the org-level close stays (D2b)
    if (d.error && (claimed || via === "mcp")) refusal = { ...d, status: 422 };
    else project = d.project || null;
  } catch { project = null; }   // a pre-migration / fake env: honest null, never a guess
  if (refusal) return refusal;
  // G2: the eval mark only on an eval project or from a test seat — refused before the record is stored
  if (isEval) { const er = await evalMarkRefused(person, project, env); if (er) return { ...er, status: 403 }; }
  const id = uid();
  const clientRef = body.clientRef ? String(body.clientRef).slice(0, 60) : null;   // WP3: the retry key for the card answers
  // sprint 8's review B4: the lists within the record's bounds (boundedLists, above)
  const bounded = boundedLists({ ...body, authoredPrompts: prompts });
  const record = {
    id, at: now(),
    from: { person: person.name, role: person.role, id: person.id },
    via,
    ...(isEval ? { eval: true } : {}),
    ...(clientRef ? { clientRef } : {}),
    ...(project ? { project } : {}),
    summary: String(body.summary).slice(0, 4000),
    decisions: bounded.lists.decisions,
    answers: bounded.lists.answers,
    proposals: bounded.lists.proposals,
    open: bounded.lists.open,
    attachments: bounded.lists.attachments,
    // ADR-022: the author's own prompts, submitted by them, for owner review. R2 only.
    // ADR-102: already consent-gated above — undefined here when the grade is below 'traces+prompts'.
    authoredPrompts: bounded.lists.authoredPrompts,
    // ADR-054: R's end-of-session self-review — structured misfires it caught in itself, never the transcript.
    selfReflection: Array.isArray(body.selfReflection) ? body.selfReflection.slice(0, 50).map((s) => ({
      failure: s && s.failure ? String(s.failure).slice(0, 40) : null,
      detail: s && s.detail ? String(s.detail).slice(0, 500) : null,
      tool: s && s.tool ? String(s.tool).slice(0, 60) : null,
      basis: s && s.basis ? String(s.basis).slice(0, 200) : null,
    })) : [],
  };
  const handoffKey = handoffKeyOf(isEval, now().slice(0, 7), id);
  await store(env).put(handoffKey, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
  // WP3: the card answers file as answer rows through the /respond seam. The report is already stored
  // (R never blocks on the loop); a batch failure or a per-item refusal (project_required for a multi-seat
  // submitter, ADR-100) is SURFACED in the receipt's note — never lost (the clean-sweep w1 scar, 2026-09-01).
  const cards = cardAnswersOf(record.answers);
  let filedAnswers = 0;
  const answerNotes = [];
  if (cards.length) {
    // Sprint 5 W1: an answer names a QUESTION of the project by its qid. The unknown are never filed dangling — they
    // are said back in the receipt's note, so a member learns in the same breath (an org-level report, with no project
    // to check against, files as before). One indexed read for the whole batch.
    let known = cards;
    const checkProject = project || (body.project ? String(body.project) : null);
    if (checkProject) {
      try {
        const rows = (await db(env).prepare("SELECT qid, status FROM k_questions WHERE project = ?1 AND qid IN (SELECT value FROM json_each(?2))")
          .bind(checkProject, JSON.stringify(cards.map((c) => c.card))).all()).results || [];
        const status = new Map(rows.map((r) => [String(r.qid), String(r.status || "open")]));
        // only an OPEN question takes an answer (the review's L2: a ruled one took a stray answer row; the ruling itself
        // was always safe, ruling re-checks the question is open)
        known = cards.filter((c) => status.get(c.card) === "open");
        for (const c of cards) {
          if (!status.has(c.card)) answerNotes.push(`${c.card} (unknown_question)`);
          else if (status.get(c.card) !== "open") answerNotes.push(`${c.card} (question_ruled)`);
        }
      } catch { known = cards; }   // a pre-migration / fake env: file as before, never a guess
    }
    let txs = [];
    try { txs = known.length ? await fileTransmissionsBatch(person, cardAnswerItems(known, { id, via, isEval, clientRef, project: project || body.project }), env) : []; }
    catch { txs = []; }
    known.forEach((c, i) => {
      const tx = txs[i];
      if (tx && tx.id) filedAnswers++;   // a retried report's duplicate resolves to its original — still on file
      else answerNotes.push(`${c.card} (${tx && tx.error ? tx.error : "batch_failed"})`);
    });
  }
  // W10: the report's open items open as the person's loops (non-eval only; a failure is surfaced, never fatal)
  // B7e C3: the ids are minted BEFORE the insert and returned as receipt.openItemIds — the same ids `updates` lists under
  // waitingOnYou.openItems, so a caller closes one without guessing where to look. [] for an eval report, a report
  // with no open items, or a failed insert (loopsNote then says so).
  let loopsOpened = 0;
  let loopIds = [];
  let loopsNote = null;
  const loopTitles = isEval ? [] : openLoopTitlesOf(record.open);
  if (loopTitles.length) {
    const minted = loopTitles.map(() => uid());
    try {
      const at = now();
      await db(env).batch(loopTitles.map((t, i) => db(env).prepare(
        "INSERT INTO loops (id,person_id,title,status,opened_at,ref,org) VALUES (?,?,?,'open',?,NULL,{org})").bind(minted[i], person.id, t, at)));
      loopsOpened = loopTitles.length;
      loopIds = minted;
    } catch { loopsNote = `${loopTitles.length} open item(s) stored in the report but NOT opened as open items — open them with open_items.`; }
  }
  const answersNote = answerNotes.length
    ? `${answerNotes.length} answer(s) stored but NOT filed as answer rows: ${answerNotes.join(", ")} — unknown_question: no question with that qid in the project (\`decisions\` lists them); question_ruled: it is no longer open; project_required: a multi-seat submitter must name "project"; client_ref_taken: this clientRef already filed other answers, send a new one.`
    : null;
  await db(env).prepare(
    "INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})"
  ).bind(uid(), body.sessionId ?? null, person.id, "exit",
         JSON.stringify({ handoffId: id, via, ...(isEval ? { eval: 1 } : {}), ...(project ? { project } : {}), summary: record.summary.slice(0, HANDOFF_SUMMARY_MAX), selfReflection: record.selfReflection, counts: {
           decisions: record.decisions.length, answers: record.answers.length,
           proposals: record.proposals.length, open: record.open.length, filedAnswers } }), now()).run();
  // GitHub Issue is added when the fine-grained PAT lands (PRD §10); R2 is the durable store either way.
  // The repo itself is a tenant value (src/tenant.js DEFAULT_HANDOFF_REPO) — each org files its
  // handoffs in its own repo; an org that names none (the empty default) files no Issue at all.
  let issueUrl = null;
  const { owner: repoOwner, repo: repoName } = env.GH_TOKEN ? ((await getTenantConfig(env)).handoffRepo || {}) : {};
  if (env.GH_TOKEN && repoOwner && repoName) {
    const r = await timedFetch(env, `https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.GH_TOKEN}`, "content-type": "application/json",
                 "user-agent": "sharingu-agent-r", accept: "application/vnd.github+json" },
      body: JSON.stringify({
        title: `Wrap-up — ${person.name} — ${record.at.slice(0, 10)}`,
        body: "```json\n" + JSON.stringify({ ...record, authoredPrompts: record.authoredPrompts ? `[${record.authoredPrompts.length} prompts — owner-readable in R2 only]` : undefined }, null, 2) + "\n```",
        labels: ["wrap-up"],
      }),
    });
    if (r.ok) issueUrl = (await r.json()).html_url;
  }
  // copy: off-screen (an agent's answer: the receipt's note)
  const boundsNote = bounded.cut || bounded.dropped
    ? `${bounded.cut + bounded.dropped} item(s) of this report did not fit and were ${bounded.dropped ? (bounded.cut ? `cut (${bounded.cut}) or dropped (${bounded.dropped})` : "dropped") : "cut"}: a report keeps at most ${HANDOFF_LIST_MAX} items a list, each at most ${HANDOFF_ITEM_MAX.toLocaleString("en-US")} characters, ${HANDOFF_LISTS_MAX.toLocaleString("en-US")} in all.`
    : null;
  const note = [promptsNote, answersNote, loopsNote, boundsNote].filter(Boolean).join(" ");
  return { stored: handoffKey, id, issueUrl,
            ...(note ? { note } : {}),
            // the wrap_up contract — additive:
            // filed + receipt land alongside the pre-existing stored/id/issueUrl, byte-identical.
            filed: true,
            // WP3 additive: filedAnswers = the card answers now on file as answer rows; tempo = the one
            // word a landed report wears (declared: contracts/door.declared.json wrapUpReceipt.receipt). D5: the open items it
            // opened are openItemsOpened and openItemIds (the receipt's words; the loops table stays the store).
            receipt: { decisions: record.decisions.length, answers: record.answers.length,
                       proposals: record.proposals.length, stillOpen: record.open.length,
                       filedAnswers, tempo: HANDOFF_TEMPO, openItemsOpened: loopsOpened, openItemIds: loopIds } };
}

// mcpHandoffReply(r, summary) — W10 (B7a): what the MCP wrap_up tool answers — the SAME receipt minus `stored`
// (an internal storage path a person never needs; REST POST /wrap-up keeps it), plus `title` (the summary, as updates shows
// it). `id` is the one id: the report's item in updates carries it too.
export function mcpHandoffReply(r, summary) {
  if (!r) return r;
  if (r.error) { const { status, ...refusal } = r; return refusal; }   // B7d S4a: the refusal, as the other tools answer it
  const { stored, ...rest } = r;
  const t = String(summary || "").replace(/\s+/g, " ").trim();
  return { ...rest, title: t.length > 120 ? t.slice(0, 119).trimEnd() + "…" : t };
}

export async function handleHandoff(request, env, person) {
  const body = await request.json().catch(() => ({}));
  if (carriesTranscript(body, 0, true)) return json({ error: "transcript_rejected" }, 422);
  if (!body.summary) return json({ error: "summary_required" }, 422);
  const r = await fileHandoffRecord(person, body, env, "rest");
  if (r && r.error) { const { status, ...rest } = r; return json(rest, status || 422); }   // B7d S4a: a project refusal
  return json(r);
}
