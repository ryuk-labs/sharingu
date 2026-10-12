// src/ask.js — `ask`: a question for the owner, in plain words. ONE function for the tool and its REST twin POST /ask (D5:
// record_event and POST /event, the door it shared, fold into file and POST /ask). Recorded as an `unknown` event (the kind an open
// question has always been) that the owner's updates show, and that waits on the asker's own
// items in `updates` as "with <owner>" (src/thread.js) until it is answered.
// The project: THE one project rule (core.js doorProject, orgLevelOk: a seatless member may still ask, D2b) — one seat or an
// active project fills it; a multi-seat person with none active names it or is refused project_required; a project the
// person holds no seat on is refused project_forbidden. Nothing is recorded on a refusal.
import { db } from "./data.js";
import { doorProject, seatsOnce, evalMarkRefused } from "./core.js";
import { resolveOwner, ownerName } from "./tenant.js";
import { uid, now, isEvalMark } from "./util.js";

export const ASK_MAX = 2000, ABOUT_MAX = 200;

// askOwner(person, env, a) -> { status, asked, id, tempo, next } | { status, error, note }
export async function askOwner(person, env, a = {}) {
  const question = String(a.question || "").trim();
  if (!question) return { status: 422, error: "question_required", note: "Send `question`: what you want to ask the owner, in one or two sentences." };
  const about = a.about ? String(a.about).trim().slice(0, ABOUT_MAX) : null;
  // D3 (U-MCP-tail-b): doorProject parses `project` through projectArg — a non-string is project_forbidden, nothing recorded
  const pd = await doorProject(person, { project: a.project }, await seatsOnce(env, person.id), env, { orgLevelOk: true });
  if (pd.error) return { status: pd.error === "project_forbidden" ? 403 : 422, ...pd };
  // G2: the eval mark only on an eval project or from a test seat (an org-level question keeps it: nothing to hide in)
  if (isEvalMark(a.eval)) { const er = await evalMarkRefused(person, pd.project, env); if (er) return { status: 403, ...er }; }
  const id = uid();
  await db(env).prepare(
    "INSERT INTO events (id,session_id,person_id,kind,lane,payload_json,touches,basis,stamped,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,{org})"
  ).bind(id, null, person.id, "unknown", null,
    JSON.stringify({ what: question.slice(0, ASK_MAX), ask: true, ...(about ? { about } : {}), ...(isEvalMark(a.eval) ? { eval: 1 } : {}) }),
    about, null, 1, pd.project || null, now()).run();
  const owner = ownerName(await resolveOwner(env));
  return { status: 200, asked: true, id, tempo: `with ${owner}`, next: `It waits with ${owner} until it is answered; \`updates\` shows it under yours.` };
}
