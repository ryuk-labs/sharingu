// src/regrade.js — REGRADE (sprint 4, R1: the second video's seventh fault): a change makes the checks that name what it
// touched stale (src/knowledge/stale.js), and a page now makes them fresh again. ONE function, regradeAnswer, serves the
// `regrade` tool (src/mcp.js) and its REST twin POST /regrade (src/index.js), which is also the press on a flow's view, a
// Map node's inspector and the Impact view's proof to redo.
//
// WHAT IT REGRADES: the stale (or ungraded) checks of ONE scope: a flow (the checks naming the flow or any screen or door of
// its steps), a node (the checks naming it) or a list of check ids. Each check the WORKER CAN OBSERVE ITSELF is observed and
// graded; the rest are answered as needsProof with the submit_grade calls that would file them.
//   · observable: a screen check in the code model's own grammar (tools/import/read-code.mjs: "GET <path> with Accept:
//     text/html" / "200 HTML holding data-screen=… and the regions …; when it has them, also …", optionally "; it links
//     <path>"), and a rail check ("the rail links <href> labelled "<label>""). An id placeholder in the path (<ref>, <id>,
//     <qid>, <path>, <words>) is filled with an id this project holds (FILL_SQL: one row each, read once a call); any other
//     placeholder (a card, a preview, a starter slug) needs a person.
//   · not observable: a walk, a check of another kind (access, shape, refusal: each needs more than one request, or another
//     caller than you), a then that states more than a page's screen, regions and links.
//
// AS THE CALLER (authority: no widening): each observation is ONE GET of this worker's own page, made in-process through the
// worker's own handler (env[SELF_PAGE], installed per request by src/index.js) with the caller's OWN credential headers (the
// same key or session cookie the call came with), so the page reads exactly what the caller may read. A page that does not
// admit that credential (401, 403, a 302 to the sign-in) files nothing: the check is listed as needing a person, never
// refused for our own sake. Only a 200 (or the page's own 302 a check names) files a verdict: proven when the screen, the
// regions and the links named are there, refused when one is missing. Every verdict files through src/knowledge/grades.js
// gradeChecks (gradeCheck's rules, one batch), kind grade, as the caller, its proof the observation: the request made and what
// came back (the status, data-screen, the regions present).
//
// PREVIEW FIRST: without confirm it observes nothing and writes nothing (the plan: what would be observed, what needs a
// person); with confirm it observes and files. A press on a page is a form: its first press answers the plan as a page
// (src/regradepage.js), whose button is the confirm.
//
// BOUNDED: at most REGRADE_CAP observations a call (said as `cap`; `more: true` when cut: press again); a list of at most
// CHECKS_MAX ids. The rows: the scope's one probe, the candidate checks once (CHECKS_BY_REFS_SQL / CHECKS_BY_IDS_SQL), the
// fills (at most three one-row statements), then gradeChecks' fixed batch (one filing and one result row per grade). Each
// observed page reads what it reads for any visit (counted by tools/page-budget.mjs as the page's own).
//
// WHO MAY (authority): anyone whose role CLASS is not Partner (partner_refused, before anything is read), on a project the
// caller may write (callTool / POST /regrade scope it with projectCallScope: project_forbidden); a read-only credential sees
// the plan and is refused read_only_credential at the confirm (POST /regrade's gate refuses it before this runs).
import { db } from "./data.js";
import { projectOf, projectSlug } from "./project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { roleClassOf } from "./hats.js";
import { nodeIdOf, safeId } from "./knowledge/canvas.js";
import { flowRefsOf } from "./knowledge/mapmodel.js";
import { gradeChecks } from "./knowledge/grades.js";
import { doorText } from "./broadcast.js";
import { isEvalMark } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: the observation under the caller's org

// at most 8 observations a press: each is a whole page rendered in this request, and a free account's request gets about
// 10 ms of CPU (AGENTS.md: inside the free tier for any org that is not ours); more: true carries the rest to the next press
export const REGRADE_CAP = 8;
export const CHECKS_MAX = 60;
const CANDIDATES_MAX = 200;
// the checks listed for a person (and their submit_grade calls): no page is rendered for them, so this bounds only
// the answer's size, not the request's CPU
const NEEDS_MAX = 24;
export const SELF_PAGE = Symbol("self-page");
const OBSERVE_HEADER = "x-sharingu-observe";

// copy: off-screen (the door's refusal hint)
export const PARTNER_REGRADE_REASON = "A Partner reads the projects they are seated on and does not grade their checks.";

const STALE_COL = "(SELECT 1 FROM k_check_stale z WHERE z.project = c.project AND z.check_id = c.id) AS stale";
const UNGRADED_COL = "(SELECT 1 FROM k_check_ungraded u WHERE u.project = c.project AND u.check_id = c.id) AS ungraded";
const COLS = `c.id, c.title, c.kind, c.method, c.when_ AS w, c.then_ AS t, ${STALE_COL}, ${UNGRADED_COL}`;
// the stale or ungraded checks naming any of the refs, stale first (k_check_refs' primary key, then k_checks' and two probes each)
export const CHECKS_BY_REFS_SQL = `SELECT ${COLS} FROM k_checks c WHERE c.project = ?1 AND c.id IN (SELECT r.check_id FROM k_check_refs r WHERE r.project = ?1 AND r.ref IN (SELECT value FROM json_each(?2))) ` +
  `AND (EXISTS (SELECT 1 FROM k_check_stale z WHERE z.project = c.project AND z.check_id = c.id) OR EXISTS (SELECT 1 FROM k_check_ungraded u WHERE u.project = c.project AND u.check_id = c.id)) ` +
  `ORDER BY stale IS NULL, c.id LIMIT ${CANDIDATES_MAX + 1}`;
// the checks named, whatever their state (an unknown id is refused; a fresh one is counted and left)
export const CHECKS_BY_IDS_SQL = `SELECT ${COLS} FROM k_checks c WHERE c.project = ?1 AND c.id IN (SELECT value FROM json_each(?2)) ORDER BY stale IS NULL, c.id`;
// the scope's one probe: a flow node, or a node or a goal by its id
export const FLOW_SQL = "SELECT id, name, data FROM k_nodes WHERE project = ?1 AND type = 'flow' AND id IN (?2, ?3) LIMIT 1";
export const NODE_SQL = "SELECT id, name FROM k_nodes WHERE project = ?1 AND id = ?2 UNION ALL SELECT id, title AS name FROM k_goals WHERE project = ?1 AND id = ?2 LIMIT 1";
// an id this project holds, for a placeholder (each one row on an index; read only when a check's path needs it)
export const FILL_SQL = {
  goal: "SELECT id AS v FROM k_goals WHERE project = ?1 AND parent IS NULL ORDER BY id LIMIT 1",
  contribution: "SELECT id AS v FROM transmission INDEXED BY idx_transmission_contrib WHERE project = ?1 AND COALESCE(kind,'') NOT IN ('grade','knowledge') ORDER BY created_at DESC LIMIT 1",
  question: "SELECT qid AS v FROM k_questions WHERE project = ?1 ORDER BY qid LIMIT 1",
};

// mayRegrade(person) -> null (may) | the refusal. authority: the role CLASS (src/hats.js), as Broadcast's verbs test it
export function mayRegrade(person) {
  if (!person) return { http: 401, error: "unauthorized" };
  if (roleClassOf(person.role) === "partner") return { http: 403, error: "partner_refused", hint: PARTNER_REGRADE_REASON };   // authority
  return null;
}
const confirmed = (a) => a && (a.confirm === true || a.confirm === "true" || a.confirm === "1" || a.confirm === 1);
const arr = (v) => (Array.isArray(v) ? v : []);
const parse = (s) => { if (s == null || s === "") return null; try { return JSON.parse(s); } catch { return null; } };

// ---- what a check says, as an observation (pure) ----
const REGIONS = String.raw`data-region="[^"]+"(?:, data-region="[^"]+")*`;
const SCREEN_THEN = new RegExp(String.raw`^200 HTML(?: holding data-screen="([^"]+)")?(?: (?:and|holding)(?: the regions?)? (${REGIONS}))?` +
  String.raw`(?:; when it has them, also (${REGIONS}))?(; a reader the page's own rule sends on gets that 302 instead)?(?:; it links (\/\S*))?$`);
const SCREEN_WHEN = /^GET (\/\S*) with Accept: text\/html(?: \(an id this project holds\))?$/;
const RAIL_WHEN = /^any signed-in page \(GET (\/\S*) with Accept: text\/html\)$/;
const RAIL_THEN = /^the rail links (\/\S*) labelled "([^"]+)"$/;
const regionsOf = (s) => [...String(s || "").matchAll(/data-region="([^"]+)"/g)].map((m) => m[1]);
// the placeholders a path may name, each with what fills it: a read (FILL_SQL's key) or a fixed value
const FILLS = [[/^\/goals\/<ref>/, "<ref>", "goal"], [/^\/contribution\/<id>/, "<id>", "contribution"], [/^\/question\/<qid>/, "<qid>", "question"],
  [/^\/doc\/<path>/, "<path>", "doc"], [/[?&]q=<words>/, "<words>", "words"]];
// the words a check needs a person for (a chip on the plan page; the tool's `why`)
export const WHY = { walk: "A walk", kind: "Not a page", more: "States more", id: "Needs an id", path: "Path says more" };

// observationOf(check) -> { path, fills: [kind], screen, need: [regions], maybe: [regions], sendsOn, link, rail } | { why }
export function observationOf(c) {
  const kind = String((c && c.kind) || ""), method = String((c && c.method) || "");
  if (method === "walk" || kind === "flow") return { why: "walk" };
  const w = String((c && (c.w ?? c.when)) || "").trim(), t = String((c && (c.t ?? c.then)) || "").trim();
  let obs = null;
  if (kind === "screen") {
    const m = SCREEN_WHEN.exec(w), th = SCREEN_THEN.exec(t);
    if (!m) return { why: "kind" };
    if (!th) return { why: "more" };
    obs = { path: m[1], screen: th[1] || null, need: regionsOf(th[2]), maybe: regionsOf(th[3]), sendsOn: !!th[4], link: th[5] || null, rail: null };
  } else if (kind === "rail") {
    const m = RAIL_WHEN.exec(w), th = RAIL_THEN.exec(t);
    if (!m) return { why: "kind" };
    if (!th) return { why: "more" };
    obs = { path: m[1], screen: null, need: [], maybe: [], sendsOn: false, link: null, rail: { href: th[1], label: th[2] } };
  } else return { why: "kind" };
  const fills = [];
  let rest = obs.path;
  for (const [re, ph, k] of FILLS) if (re.test(rest)) { fills.push(k); rest = rest.replace(ph, ""); }
  if (/[<>]/.test(rest)) return { why: "id" };
  return { ...obs, fills };
}
// fillPath(path, values) -> the path with each placeholder replaced by its value (values: { goal, contribution, question,
// doc, words }); null when one has no value
export function fillPath(path, values) {
  let p = String(path);
  for (const [re, ph, k] of FILLS) {
    if (!re.test(p)) continue;
    const v = values && values[k];
    if (!v) return null;
    p = p.replace(ph, encodeURIComponent(v));
  }
  return p;
}
// observeUrl(path, project) -> the URL the observation GETs (the normalised pathname + search, the project set with the URL
// API as the ONE ?project= the seam reads), or null when the path says more than a page. A check's path is a filer's text
// (sprint-4 review, H1): one that carries its own project= (encoded forms too — searchParams decodes names), a fragment
// (which would swallow an appended param), credentials or another origin is never observed; it goes to a person instead.
export function observeUrl(path, project) {
  let u;
  try { u = new URL(String(path), "https://self"); } catch { return null; }
  if (u.origin !== "https://self" || u.hash || u.username || u.password) return null;
  if (u.searchParams.has("project")) return null;
  u.searchParams.set("project", project);
  return u.pathname + u.search;
}

// judge(obs, res) -> { verdict: "proven" | "refused" | null, said, status }: what one page answered against what the check
// says. null: nothing to file (the page did not admit the caller, sent them elsewhere, or did not answer): a person grades it
export function judge(obs, res) {
  const status = Number(res && res.status) || 0, text = String((res && res.text) || ""), loc = String((res && res.location) || "");
  if ((status === 302 || status === 303) && loc && !/\/login\b/.test(loc) && obs.sendsOn) return { verdict: "proven", status, said: `${status} to ${loc.replace(/^https?:\/\/[^/]+/, "")} (the page's own rule)` };
  if (status !== 200) return { verdict: null, status, said: `${status}${loc ? ` to ${loc.replace(/^https?:\/\/[^/]+/, "")}` : ""}` };
  const parts = [`${status}`];
  let ok = true;
  if (obs.screen) { const has = text.includes(`data-screen="${obs.screen}"`); ok = ok && has; parts.push(`data-screen="${obs.screen}" ${has ? "present" : "MISSING"}`); }
  if (obs.need.length) {
    const missing = obs.need.filter((r) => !text.includes(`data-region="${r}"`));
    ok = ok && !missing.length;
    parts.push(`regions ${obs.need.length - missing.length} of ${obs.need.length}${missing.length ? ` (missing ${missing.join(", ")})` : ""}`);
  }
  if (obs.maybe.length) parts.push(`optional regions ${obs.maybe.filter((r) => text.includes(`data-region="${r}"`)).length} of ${obs.maybe.length}`);
  if (obs.link) { const has = text.includes(`href="${obs.link}`); ok = ok && has; parts.push(`a link to ${obs.link} ${has ? "present" : "MISSING"}`); }
  if (obs.rail) {
    const esc = obs.rail.href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const has = new RegExp(`href="${esc}(?:\\?[^"]*)?"[^>]*>(?:(?!</a>)[\\s\\S])*${obs.rail.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);
    ok = ok && has; parts.push(`a link href="${obs.rail.href}" labelled "${obs.rail.label}" ${has ? "found" : "NOT found"}`);
  }
  return { verdict: ok ? "proven" : "refused", status, said: parts.join(", ") };
}
// proofText(path, credential, said) -> the grade's proof: the request this worker made as the caller and what came back
export const proofText = (path, credential, said) => `GET ${path} (Accept: text/html, as the caller's ${credential}) -> ${said}`;
// gradeCall(project, list) -> the calls that file a person's grades of these checks: submit_grade, one a check (sprint 19: a grade
// files at once through its own tool, never through a preview)
export const gradeCall = (project, list) => list.slice(0, NEEDS_MAX).map((c) => `submit_grade ${JSON.stringify({ project, checkId: c.id,
  verdict: "<proven | refused | incomplete: what you observe now>", proof: "<the command you ran and what it printed, a link, or an artifact id>" })}`).join("\n");

// ---- the scope and the plan ----
// scopeOf(a) -> { kind: "flow" | "node" | "checks", value } | { error }: the ONE scope a call names (flow, else node, else checks)
export function scopeOf(a = {}) {
  const s = (v) => String(v ?? "").trim().slice(0, 300);
  if (s(a.flow)) return { kind: "flow", value: s(a.flow) };
  if (s(a.node)) return { kind: "node", value: s(a.node).replace(/^goal\//, "") };
  const raw = Array.isArray(a.checks) ? a.checks : typeof a.checks === "string" ? a.checks.split(",") : [];
  const ids = [...new Set(raw.map((x) => String(x ?? "").trim().slice(0, 120)).filter(Boolean))];
  if (ids.length > CHECKS_MAX) return { http: 422, error: "too_many_items", max: CHECKS_MAX, got: ids.length, note: `Regrade at most ${CHECKS_MAX} checks a call.` };
  if (ids.length) return { kind: "checks", value: ids };
  return { http: 422, error: "ref_required", note: "Send one of flow (a flow's id), node (a node's id) or checks (check ids)." };
}

// regradePlan(env, person, a) -> { http: 200, plan } | the refusal. Reads; never observes, never writes.
export async function regradePlan(env, person, a = {}) {
  const no = mayRegrade(person);
  if (no) return no;
  const project = await projectOf(env);
  if (!project) return { http: 422, error: "project_required", note: "Name the project: `project`, one of your seats." };
  const sc = scopeOf(a);
  if (sc.error) return sc;
  let rows, name = null, ref = null;
  if (sc.kind === "flow") {
    const id = /^flow:/.test(sc.value) ? safeId(sc.value) : nodeIdOf("flow", sc.value);
    const f = await db(env).prepare(FLOW_SQL).bind(project, id, safeId(sc.value)).first();
    if (!f) return { http: 404, error: "unknown_node", ref: sc.value, note: `No flow "${sc.value}" in ${projectSlug(project)}.` };
    const d = parse(f.data) || {};
    name = String(d.name || f.name || f.id); ref = String(f.id);
    rows = (await db(env).prepare(CHECKS_BY_REFS_SQL).bind(project, JSON.stringify(flowRefsOf(f.id, arr(d.steps).length ? d.steps : d.screenSteps))).all()).results || [];
  } else if (sc.kind === "node") {
    const n = await db(env).prepare(NODE_SQL).bind(project, sc.value).first();
    if (!n) return { http: 404, error: "unknown_node", ref: sc.value, note: `No node "${sc.value}" in ${projectSlug(project)}.` };
    name = String(n.name || n.id); ref = String(n.id);
    rows = (await db(env).prepare(CHECKS_BY_REFS_SQL).bind(project, JSON.stringify([ref])).all()).results || [];
  } else {
    rows = (await db(env).prepare(CHECKS_BY_IDS_SQL).bind(project, JSON.stringify(sc.value)).all()).results || [];
    const have = new Set(rows.map((r) => String(r.id)));
    const unknown = sc.value.find((id) => !have.has(id));
    if (unknown) return { http: 404, error: "unknown_check", project, checkId: unknown, note: `No check "${unknown}" in ${projectSlug(project)}: \`read\` {kind: "check"} lists the project's checks. Nothing was regraded.` };
  }
  const cut = rows.length > CANDIDATES_MAX;
  const due = rows.slice(0, CANDIDATES_MAX).filter((r) => r.stale || r.ungraded);
  const fresh = sc.kind === "checks" ? rows.length - due.length : 0;
  const classed = due.map((r) => ({ r, o: observationOf(r) }));
  // the fills the observable checks need, each read once
  const want = new Set(classed.flatMap((x) => (x.o.why ? [] : x.o.fills)).filter((k) => FILL_SQL[k]));
  const values = { doc: "start-here.md", words: project };
  if (want.size) {
    const ks = [...want];
    const got = await db(env).batch(ks.map((k) => db(env).prepare(FILL_SQL[k]).bind(project)));
    ks.forEach((k, i) => { const v = ((got[i] && got[i].results) || [])[0]; if (v && v.v) values[k] = String(v.v); });
  }
  const observe = [], needs = [];
  for (const { r, o } of classed) {
    const c = { id: String(r.id), title: String(r.title || r.id), stale: !!r.stale };
    const path = o.why ? null : fillPath(o.path, values);
    const url = path == null ? null : observeUrl(path, project);
    if (o.why || !url) needs.push({ ...c, why: o.why || (path == null ? "id" : "path") });
    else observe.push({ ...c, path: url, obs: o });
  }
  return { http: 200, plan: { project, scope: { kind: sc.kind, ref: ref || null, name, ids: sc.kind === "checks" ? sc.value : null },
    observe: observe.slice(0, REGRADE_CAP), needs, more: observe.length > REGRADE_CAP || cut, fresh,
    counts: { stale: due.filter((r) => r.stale).length, ungraded: due.filter((r) => !r.stale).length, observable: observe.length, needsProof: needs.length } } };
}

// ---- the door: regradeAnswer, ONE function for the tool and its REST twin ----
const scopeArgs = (s) => (s.kind === "flow" ? { flow: s.ref } : s.kind === "node" ? { node: s.ref } : { checks: s.ids });
const needsOut = (list) => list.slice(0, NEEDS_MAX).map((c) => ({ id: c.id, title: c.title, why: WHY[c.why] || c.why }));
const scopeWord = (s) => (s.kind === "checks" ? `${s.ids.length} ${s.ids.length === 1 ? "check" : "checks"}` : `${s.kind === "flow" ? "the flow" : "the node"} ${s.name || s.ref}`);
// regradeAnswer(env, person, a, o) -> the plan { preview: true, … } (nothing observed or written) | the result | the refusal
// a: { project?, flow? | node? | checks?, confirm?, eval? } · o: { via }
export async function regradeAnswer(env, person, a = {}, o = {}) {
  const pl = await regradePlan(env, person, a);
  if (!pl.plan) return pl;
  const p = pl.plan;
  const needs = needsOut(p.needs);
  const call = p.needs.length ? gradeCall(p.project, p.needs) : null;
  const base = { project: p.project, scope: { kind: p.scope.kind, ref: p.scope.ref, name: p.scope.name, ...(p.scope.ids ? { checks: p.scope.ids } : {}) }, cap: REGRADE_CAP, counts: p.counts,
    ...(p.fresh ? { fresh: p.fresh } : {}), needsProof: needs, ...(call ? { call } : {}), more: p.more };
  if (!confirmed(a)) {
    const args = { project: p.project, ...scopeArgs(p.scope), confirm: true };
    const line = `Regrade ${scopeWord(p.scope)}: ${p.observe.length} to observe on ${p.observe.length === 1 ? "its page" : "their pages"}, ${p.needs.length} for a person`;
    return { http: 200, preview: true, verb: "regrade", ...base, observe: p.observe.map((c) => ({ id: c.id, title: c.title, stale: c.stale, path: c.path })), line,
      text: doorText("Regrade", [line, ...p.observe.slice(0, 8).map((c) => `  GET ${c.path}`), ...(p.observe.length > 8 ? [`  and ${p.observe.length - 8} more`] : [])],
        `regrade ${JSON.stringify(args)}`),
      next: { tool: "regrade", args, rest: `POST /regrade ${JSON.stringify(args)}` },
      note: p.observe.length ? `Nothing is observed or filed yet. Call regrade again with confirm: true to observe these pages as you and file each grade.${p.more ? ` At most ${REGRADE_CAP} a call: call again for the rest.` : ""}` : "Nothing here can be observed from a page: file the grades through `call`." };
  }
  if (person.readOnly) return { http: 403, error: "read_only_credential", note: "A read-only credential can see what a regrade would do, never file it. Use your full key." };   // authority
  const look = env[SELF_PAGE];
  const credential = person.viaCookie ? "session" : "key";
  const seen = [];
  for (let i = 0; i < p.observe.length; i += 4) {
    const batch = p.observe.slice(i, i + 4);
    seen.push(...(await Promise.all(batch.map(async (c) => {
      let res = null;
      try { res = typeof look === "function" ? await look(c.path) : null; } catch { res = null; }
      const j = res ? judge(c.obs, res) : { verdict: null, status: 0, said: "no answer" };
      return { c, j };
    }))));
  }
  const grades = seen.filter((x) => x.j.verdict).map((x) => ({ checkId: x.c.id, verdict: x.j.verdict, proof: proofText(x.c.path, credential, x.j.said) }));
  const filed = grades.length ? await gradeChecks(person, env, grades, { project: p.project, via: o.via || "mcp", eval: isEvalMark(a.eval) }) : [];
  if (filed && filed.error) return { http: filed.error === "project_forbidden" ? 403 : 422, ...filed };
  const byId = new Map(grades.map((g, i) => [g.checkId, filed[i] || {}]));
  const observed = seen.map(({ c, j }) => {
    const f = byId.get(c.id);
    return { id: c.id, title: c.title, path: c.path, status: j.status, verdict: j.verdict, said: j.said,
      ...(f ? (f.error ? { error: f.error } : { counted: !!f.counted, filed: f.transmission || null }) : {}) };
  });
  const unseen = observed.filter((x) => !x.verdict).map((x) => ({ id: x.id, title: x.title, why: `Answered ${x.status || "nothing"}` }));
  const counted = observed.filter((x) => x.counted).length;
  return { http: 200, ...base, observed, counted, needsProof: [...unseen, ...needs].slice(0, NEEDS_MAX),
    ...(unseen.length || call ? { call: gradeCall(p.project, [...unseen, ...p.needs]) } : {}),
    note: `${counted} of ${observed.length} observed ${observed.length === 1 ? "check was" : "checks were"} graded from ${observed.length === 1 ? "its page" : "their pages"}${unseen.length ? `; ${unseen.length} did not answer as a page` : ""}${p.needs.length ? `; ${p.needs.length} need a person (call)` : ""}.${p.more ? ` At most ${REGRADE_CAP} a call: call again for the rest.` : ""}` };
}

// installSelfPage(target, request, env, ctx, handler) — R1: the observation's one door. Stamps on the request's own env (a
// fresh object, never the shared env; object spread carries a Symbol key through the project seam) a function that GETs one
// of this worker's pages through its own handler, in-process, with the incoming request's OWN credential headers
// (Authorization, Cookie): the caller's identity, never a wider one. A request that is itself an observation gets none, so a
// page never observes another. Only a path `allowed` names is fetched (a check's path is a filer's text: a GET with an
// effect, such as /logout, is never reached); anything else answers nothing, so the check goes to a person.
// allowed(pathname): the GET routes an observation may reach (src/index.js passes the registry's reader rows, never /logout).
// It is tested on the URL-NORMALISED pathname (sprint-4 review, M1): a dot-segment or %2e path resolves BEFORE the test, so
// `/goals/../logout` and `/goals/%2e%2e/logout` are `/logout` when tested, and the request sent is the normalised one.
export function installSelfPage(target, request, env, ctx, handler, allowed = () => false) {
  if (!target || request.headers.get(OBSERVE_HEADER)) return;
  let origin;
  try { origin = new URL(request.url).origin; } catch { return; }
  const cred = {};
  for (const h of ["authorization", "cookie"]) { const v = request.headers.get(h); if (v) cred[h] = v; }
  target[SELF_PAGE] = async (path) => {
    let u = null;
    if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) { try { u = new URL(origin + path); } catch { u = null; } }
    if (!u || u.origin !== origin || !allowed(u.pathname)) return { status: 0, location: "", text: "" };
    // sprint 7, 7.4: the page is fetched under the caller's own org (src/orgpath.js: the address the request came by, or a
    // bearer's org), so a browser's session reads it as the same seat; the path was tested above as the route it names
    const r = await handler.fetch(new Request(origin + orgPath(u.pathname + u.search), { headers: { accept: "text/html", "sec-fetch-dest": "document", [OBSERVE_HEADER]: "1", ...cred } }), env, ctx);
    return { status: r.status, location: r.headers.get("location") || "", text: await r.text() };
  };
}
