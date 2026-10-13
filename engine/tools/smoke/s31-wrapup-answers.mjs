// tools/smoke/s31-wrapup-answers.mjs — sprint 5, W1: a wrap_up answering an OPEN QUESTION by its real qid files the
// answer (the known fault: the old questionnaire-id shape made a qid never match, and a member's answers were dropped
// silently). Proven through the real door: the answer row lands and the question's page shows it; an unknown qid files
// nothing and is said back in the receipt's note.
import { smoke, expect, brief, s, html, mcp, control, ownerKey } from "./lib.mjs";

const P = "s31";
const QID = "Q-s31-world";

smoke("W1: a wrap_up answers an open question by its qid — filed, shown on the question's page; an unknown qid is said back", async () => {
  await control({ action: "add-project", key: P, name: "S31" });
  await control({ action: "grant-seat", personId: s.member.id, projectKey: P });
  const items = [{ kind: "question", op: "upsert", data: { qid: QID, question: "Which world is the take recorded in?",
    status: "open", whoOwes: "owner", options: [{ what: "Paper" }, { what: "Ink" }] } }];
  const pv = await mcp(ownerKey, "preview", { project: P, items });
  const f = await mcp(ownerKey, "save_knowledge", { previewId: pv.out.previewId, items });
  expect(!f.isError && f.out.complete === true, () => `the question files: ${brief(f.out)}`);
  const w = await mcp(s.member.key, "wrap_up", { project: P, summary: "s31 session wrap",
    answers: [{ card: QID, answer: "Paper — the brand's reference world", basis: "LOOK.md" },
              { card: "Q-s31-nope", answer: "an answer to nothing" }] });
  const rc = (w.out || {}).receipt || {};
  expect(!w.isError && rc.answers === 2 && rc.filedAnswers === 1 && /Q-s31-nope \(unknown_question\)/.test((w.out || {}).note || ""),
    () => `the wrap_up receipt: filed 1 of 2, the unknown said back in the note -> ${brief(w.out)}`);
  const page = await html(`/question/${QID}?project=${P}`);
  expect(page.status === 200 && /data-answered|Answered /.test(page.text),
    () => `the question's page shows it ANSWERED, with the owner (${page.status})`);
  // the review's L2: once the owner rules the question, a wrap_up answer to it is said back (question_ruled), never filed
  const ruled = await mcp(ownerKey, "rule_question", { project: P, qid: QID, choice: 0, rationale: "s31: the reference world" });
  const w2 = await mcp(s.member.key, "wrap_up", { project: P, summary: "s31 after the ruling", answers: [{ card: QID, answer: "Ink, after all" }] });
  expect(!ruled.isError && (w2.out || {}).receipt && w2.out.receipt.filedAnswers === 0 && /Q-s31-world \(question_ruled\)/.test(w2.out.note || ""),
    () => `after the ruling: ${brief(ruled.out)} · ${brief(w2.out)}`);
  return `the member's wrap_up answer to ${QID} filed and shows on the question's page; Q-s31-nope refused and said back; after the ruling an answer is said back question_ruled`;
});
