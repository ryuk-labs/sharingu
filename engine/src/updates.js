// src/updates.js — `updates` (D5: heartbeat, state and thread folded into one read): what changed for you since you were last
// here and what waits on you, on the project the door scoped. ONE function for the tool and its REST twin GET /updates — and
// GET /updates reaches it through the tool's own door (src/mcp.js callTool), so the project scope, the owner and scope checks
// and the project note are the same code on both (D5 Part 4 b: GET /updates read the seam's scope, the tool its own).
// It composes three bounded reads that were each a tool before: core.js heartbeatFor (what landed in your lane since your last
// event, your open items, the owner's blockers), core.js stateSummaryFor (the project's aim, as-of, blockers, your projects)
// and src/thread.js threadFor (your own contributions, questions, answers and reports, each with where it stands).
// D5L: the open items are read once, by the heartbeat, and handed to the thread; `limit` bounds every region of `yours` in
// its SQL (src/thread.js), so the bell's limit=1 reads about one row a region.
import { heartbeatFor, stateSummaryFor } from "./core.js";
import { threadFor } from "./thread.js";
import { resolveOwner, ownerName } from "./tenant.js";
import { now, isEvalMark, evalView } from "./util.js";

export const UPDATES_YOURS_DEFAULT = 20, UPDATES_YOURS_MAX = 200;

// updatesFor(person, env, { eval, limit }) -> { note, you, org, project, aim, asOf, ageDays, blockers, activeProject,
// yourProjects, sinceYouWereLast, inYourLane, elsewhere, waitingOnYou: { openItems, blockers }, yours: { count, items }, more,
// doNotEnrich }. eval: the heartbeat part keeps its by-seat default (a suite seat sees suite rows), the rest the explicit mark.
export async function updatesFor(person, env, a = {}) {
  const limit = Math.max(1, Math.min(UPDATES_YOURS_MAX, Number(a.limit) || UPDATES_YOURS_DEFAULT));
  let owner = null; try { owner = ownerName(await resolveOwner(env)); } catch { owner = null; }
  const hbP = heartbeatFor(person, env, { includeEval: evalView(a.eval, person.id) });
  const [hb, st, th] = await Promise.all([
    hbP,
    stateSummaryFor(person, env, {}),
    threadFor(person, env, { includeEval: isEvalMark(a.eval), ownerName: owner, servedStamp: { publishedAt: now() }, limit,
      openLoops: hbP.then((h) => (h.waitingOnYou || {}).openLoops || []) }),
  ]);
  const w = hb.waitingOnYou || {};
  return {
    note: "What changed for you and what waits on you. An empty inYourLane is a real answer: nothing in your lane changed.",
    you: hb.you, org: st.org, project: st.project, aim: st.aim, asOf: st.asOf, ageDays: st.ageDays, blockers: st.blockers,
    activeProject: st.activeProject, yourProjects: st.yourProjects,
    sinceYouWereLast: hb.sinceYouWereLast, inYourLane: hb.inYourLane, elsewhere: hb.elsewhere,
    waitingOnYou: { openItems: w.openLoops || [], blockers: w.blockers || [] },
    yours: { count: th.count, items: th.items },
    more: st.more, doNotEnrich: hb.doNotEnrich,
  };
}
