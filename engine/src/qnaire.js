// The answer door's filing seam (qnaire.js).
//
// UI-B2 (owner ruling QBDD22130, the /respond hard cut): the Decisions screen (src/decisions.js, GET /decisions and GET
// /question/:qid) is where a person answers, and POST /respond takes an OPTION of an open question and nothing else:
//   · respondAnswers — the ONE filing seam every answer goes through (REST and the MCP `respond` tool);
//   · respondOptions + handleRespond — the option-only door: the body names {qid, option} (or answers[]), each qid is
//     checked against the project's question (open, and the option exists) BEFORE anything is written, and the filed
//     text is the question's own option text, never the body's. The owner's answer rules the question at once.

import { db } from "./data.js";
import { json, uid, now, isD1Quota } from "./util.js";
import { fileTransmissionsBatch, decideTransmission, seatsOnce, doorProject, evalMarkRefused, REF_CONTENT } from "./core.js";
import { resolveProject } from "./project.js";
import { checkOptionAnswers, entriesFrom, answerProjectOf } from "./decisions.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// respondAnswers(reader, answers, env) — the SHARED tail of POST /respond (lifted out,
// door-true batch, QF9C8E14A): records every already-parsed {item,answer,eval?,project?}
// as a fragment event, then re-files each one through the
// leader-lane loop via fileTransmissionsBatch — the ONE seam both the REST route and the
// `respond` MCP tool call, so a body already parsed from JSON, a form, or an MCP tool
// argument reaches the SAME loop (ADR-063 seam rule). Returns { sent, transmissions, note? },
// never a Response — the caller (handleRespond / mcp.js) maps that to its own wire shape.
//
// Schema audit finding 6 (the /respond N+1, eff/door): the contribution filing (below) shares
// state (the day-scoped id sequence), so it is batched via fileTransmissionsBatch — see that
// function's header for the id-race reasoning. For N answers, regardless of N: 1 D1 batch
// (fragment events) + 1 D1 SELECT + 1 D1 batch (contributions, +1 more only on a rare retry).
export async function respondAnswers(reader, answers, env, { via = null } = {}) {
  if (!answers.length) return { sent: 0, transmissions: [] };
  const recs = answers.map((a) => ({
    id: uid(), at: now(), by: { person: reader.name, role: reader.role, id: reader.id },
    item: a.item, answer: a.answer, ...(a.provisional ? { provisional: true } : {}),
  }));
  await db(env).batch(recs.map((rec, i) =>
    db(env).prepare("INSERT INTO events (id,session_id,person_id,kind,payload_json,created_at,org) VALUES (?,?,?,?,?,?,{org})")
      .bind(uid(), null, reader.id, "fragment", JSON.stringify({ what: "questionnaire response: " + answers[i].item, responseId: rec.id, ...(answers[i].eval ? { eval: 1 } : {}) }), now())   // the mark rides the event too (residue audit 2026-09-06)
  ));

  // THE LOOP (ADR-078): an answer IS a leader-lane contribution — file it
  // through the router so it lands on the owner queue (`answers-a-question`),
  // gets its decide, and turns its q/ ref green at close. Before this, /respond
  // banked the answer and the loop never saw it — the S-032 session-prep audit
  // caught it. Filed as ONE reserved id-block + ONE D1 batch instead of N
  // sequential fileTransmission() calls (schema audit finding 6).
  const items = answers.map((a, i) => ({
    lane: "leader", kind: "answer", eval: a.eval === true,
    what: a.item + " — " + a.answer.slice(0, 400),
    // a provisional pick says so first (src/decisions.js liveOf reads it back for the card)
    why: (a.provisional ? "provisional answer" : "answer") + " to " + a.item + " via /respond (response " + recs[i].id + ")",
    touches: ["decisions"], gapRefs: ["q/" + a.item],
    ...(a.project ? { project: a.project } : {}),
    // sprint 3 B2: file (src/preview.js) names each answer by a clientRef, so a retry never files it twice; the doors
    // (POST /respond, respond) never carry one (entriesFrom parses none)
    ...(a.clientRef ? { clientRef: String(a.clientRef).slice(0, 60) } : {}),
    // G2 item 7: a clientRef's content is the answer itself (the why carries this response's own fresh id)
    [REF_CONTENT]: { qid: a.item, answer: a.answer, provisional: !!a.provisional },
  }));
  let txs = [];
  try { txs = await fileTransmissionsBatch(reader, items, env); } catch { txs = []; }
  // Clean-sweep w1 finding (2026-09-01): a per-item ERROR from the batch (e.g.
  // project_required for a multi-seat submitter) used to vanish here — tx stayed
  // null with HTTP 200 and the leader-lane loop contribution was silently lost.
  // Surface it: the answer's event is recorded either way, but the
  // caller SEES which transmissions did not file, and why.
  answers.forEach((a, i) => {
    const tx = txs[i];
    if (tx && tx.id) { a.tx = tx.id; a.route = tx.route; }
    else if (tx && tx.error) { a.txError = tx.error; a.txSeats = tx.seats; }
    else if (!tx) { a.txError = "batch_failed"; }
  });
  // THE FILING->RULING LINK (UI-B3 C14, ADR-079: a leader's own answer IS the ruling). When the owner picks a
  // non-provisional OPTION (respondOptions carries its letter), the answer is decided approve in this same request,
  // through the ONE decide seam (core.js decideTransmission: the approval_audit row, the mirrored ruling event, the row
  // closed), and approving an answer rules its question in k_questions there (knowledge/decisions.js ruleFromAnswer), so
  // every face reads it decided on the next load and a second answer is refused not_open. Owner only: anyone else's
  // answer waits for the owner, as before. A provisional pick stays open. One at a time: two answers to one question in
  // one call rule it once (the second finds it decided). decideTransmission refuses to re-decide a closed row
  // (already_decided), so no row is ever decided twice.
  if (reader && reader.role === "owner" && !reader.readOnly) {
    for (const a of answers) {
      if (!a.tx || a.provisional || !a.letter) continue;
      try {
        const d = await decideTransmission(reader, a.tx, { verdict: "approve", note: `ruled by option ${a.letter}` }, env, { via });
        if (d && !d.error && d.ruled) a.ruled = true;
        else a.ruleError = (d && (d.error || d.ruleError)) || "not_decided";
      } catch (e) { if (isD1Quota(e)) throw e; a.ruleError = "not_decided"; }
    }
  }
  const errs = answers.filter((a) => a.txError).length;
  return { sent: answers.length, transmissions: answers.map((a) => ({ item: a.item, tx: a.tx || null, route: a.route || null,
    ...(a.ruled ? { ruled: true } : {}), ...(a.ruleError ? { ruleError: a.ruleError } : {}),
    ...(a.txError ? { error: a.txError, ...(a.txSeats ? { seats: a.txSeats } : {}) } : {}) })),
    ...(errs ? { note: `${errs} answer(s) banked but did NOT file as contributions — see per-item error (a multi-seat submitter must name "project").` } : {}) };
}

// respondOptions(reader, entries, env, { via }) — the option-only door both /respond and the MCP `respond` tool call
// (QBDD22130). Refusals file NOTHING: { status, error: option_required | unknown_option | unknown_qid | not_open,
// note }. On success the question's option text is filed through respondAnswers: lane leader · kind answer ·
// gapRefs q/<qid> · what "<qid> — <A|B|C>: <option.what>"; the owner's (not provisional) rules the question at once.
// via is the door ("mcp" | "http"), for the ruling's ledger row.
//
// D5 (U-MCP-tail-b, QE6B9CEBA): ONE project per answer call, on every face (the JSON body, the MCP arguments, the form).
// The entries' projects and the call's top-level one must be one project (answerProjectOf), else project_forbidden with
// nothing filed. A named project goes through resolveProject (a seat; the owner: any active project) and the qids are
// checked against THAT project's questions (checkOptionAnswers on the scoped env), and every answer is stamped into it — so
// the questions a qid is validated against are always those of the project the filing lands in. The REST seam scopes only
// a GET's ?project=, so this door scopes a POST body's project itself.
export async function respondOptions(reader, entries, env, { via = null } = {}) {
  let list = Array.isArray(entries) ? entries : [];
  const one = answerProjectOf(list);
  if (one.error) return { status: 403, ...one };
  if (one.project) {
    const sc = await resolveProject(reader, one.project, await seatsOnce(env, reader.id), env);
    if (sc.error) return { status: 403, ...sc };
    env = sc.env;
    list = list.map((e) => ({ ...e, project: one.project }));
  }
  const chk = await checkOptionAnswers(env, list);
  if (chk.error) return chk;
  // G2: the eval mark only on an eval project or from a test seat — refused before the answer's event is recorded
  if (chk.answers.some((x) => x.eval === true)) {
    const proj = one.project || (await doorProject(reader, {}, await seatsOnce(env, reader.id), env).catch(() => ({}))).project || null;
    const er = await evalMarkRefused(reader, proj, env); if (er) return { status: 403, ...er };
  }
  const out = await respondAnswers(reader, chk.answers, env, { via });
  const ruled = (out.transmissions || []).filter((t) => t.ruled).map((t) => t.item);
  return { status: 200, ...out, picked: chk.picked,
    ...(ruled.length ? { note: `Ruled: ${ruled.join(", ")}. ${ruled.length === 1 ? "It shows" : "They show"} decided on every face now.` + (out.note ? " " + out.note : "") } : {}) };
}

// formEntries(fd) — the form face: {qid, option, provisional, eval, project, next} for one question (the QuestionCard,
// a Decisions row's choose-option), or option_<qid> fields for many (Answer in bulk). A legacy free-text field (the
// retired page's a_<ID> / x_<ID>, or `answer` / `item`) marks the call so it is refused option_required.
export function formEntries(fd) {
  const ev = String(fd.get("eval") || "") === "1";
  const project = String(fd.get("project") || "").trim().slice(0, 80);
  const provisional = String(fd.get("provisional") || "") === "1";
  const text = [...fd.keys()].some((k) => /^[ax]_/.test(k) || k === "answer" || k === "item");
  const list = [];
  const qid = String(fd.get("qid") || "").trim();
  if (qid || fd.get("option") != null) list.push({ qid, option: fd.get("option") == null ? undefined : String(fd.get("option")), provisional, eval: ev, project, text });
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("option_")) continue;
    list.push({ qid: k.slice(7).trim(), option: String(v), provisional, eval: ev, project, text: false });
  }
  if (!list.length || text) list.push({ qid, option: undefined, provisional, eval: ev, project, text });
  return list.slice(0, 50);
}

// sameOriginNext(candidate, origin) — the open-redirect guard (the same test index.js's sameOriginPath applies):
// resolve against OUR origin with the real URL parser, keep it only if the origin survived. "" when unsafe.
function sameOriginNext(candidate, origin) {
  if (typeof candidate !== "string" || !candidate.startsWith("/")) return "";
  try { const u = new URL(candidate, origin); return u.origin === origin ? u.pathname + u.search + u.hash : ""; } catch { return ""; }
}
const withParam = (path, k, v) => path + (path.includes("?") ? "&" : "?") + k + "=" + encodeURIComponent(v);

// handleRespond(request, env, url, reader) — the /respond POST handler. The caller resolves `reader` and applies the
// read-only and cross-origin refusals BEFORE calling this. A JSON caller gets the receipt or the refusal (422 · 404 ·
// 409); a form gets a 302 to a same-origin `next` (default /question/<qid>) carrying filed=<n> or refused=<code>.
export async function handleRespond(request, env, url, reader) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("form")) {
    const fd = await request.formData().catch(() => null);
    const entries = fd ? formEntries(fd) : [{ text: false, option: undefined, qid: "" }];
    const firstQid = (entries.find((e) => e.qid) || {}).qid || "";
    const next = sameOriginNext(fd ? String(fd.get("next") || "") : "", url.origin)
      || (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(firstQid) ? orgPath(`/question/${encodeURIComponent(firstQid)}`) : orgPath("/decisions"));
    const res = await respondOptions(reader, entries, env, { via: "http" });
    const txErr = !res.error && (res.transmissions || []).find((t) => t && t.error);
    const ruled = !res.error ? (res.transmissions || []).filter((t) => t && t.ruled).length : 0;
    const to = res.error ? withParam(next, "refused", res.error)
      : txErr ? withParam(next, "txerror", txErr.error) : ruled ? withParam(next, "ruled", String(ruled)) : withParam(next, "filed", String(res.sent || 0));
    return new Response(null, { status: 302, headers: { location: to } });
  }
  const b = await request.json().catch(() => ({}));
  const res = await respondOptions(reader, entriesFrom(b), env, { via: "http" });
  const { status, ...body } = res;
  return json(body, status || 200);
}
