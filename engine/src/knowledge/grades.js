// src/knowledge/grades.js — a check's grade, filed: the ONLY code that writes check_results. gradeCheck is submit_grade and
// POST /grade (one grade); gradeChecks is regrade's (src/regrade.js: many grades of one project in a fixed number of
// statements). Both file through the ONE door (core.js fileTransmission / fileTransmissionsBatch, kind "grade"), then write
// the result row that lights every node the check names (src/knowledge/checks.js reads it). The project a grade counts
// against is the request's read scope (project.js projectOf), and the filing's stamp must agree with it.
import { db } from "../data.js";
import { fileTransmission, fileTransmissionsBatch, doorProject, seatsOnce } from "../core.js";
import { projectOf, projectSlug } from "../project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { now, isEvalMark } from "../util.js";
import { checkExists, LIVE_VERSION, GRADE_VERDICTS } from "./checks.js";
import { forgetReqMemo } from "../reqmemo.js";

// the project a grade counts against: the request's scope, else a single-project org's one project, else null (org level)
const gradeProjectOf = async (env) => (await projectOf(env)) || null;

// gradeFilingBody(checkId, verdict, proof) -> the content of a grade's filing (what every grade door files, and the content a
// clientRef's digest is taken over: G2 item 7). Normalised as the doors normalise: checkId trimmed (120), verdict lower-case,
// proof trimmed (4000; none is the owner's to read).
export const gradeNorm = (checkId, verdict, proof) => ({ checkId: String(checkId || "").trim().slice(0, 120), verdict: String(verdict || "").toLowerCase(),
  proof: proof == null ? "" : String(proof).trim().slice(0, 4000) });
export function gradeFilingBody(checkId, verdict, proof) {
  return { lane: "ba", kind: "grade", what: `grade ${checkId}: ${verdict}`,
    why: proof ? `check ${checkId}, with proof` : `check ${checkId}, no proof sent: for the owner`,
    touches: [`check:${checkId}`], ...(proof ? { proof } : {}), about: `grade ${checkId}`.slice(0, 120), ...(proof ? {} : { risk: "owner" }) };
}

export const unknownCheck = (project, id) => ({ error: "unknown_check", project, checkId: String(id).slice(0, 120),
  note: `No check "${String(id).slice(0, 120)}" in ${projectSlug(project)}: \`read\` {kind: "check"} lists the project's checks, and \`brief\` {for: <a ref>} the ones that name one item.` });

// gradeCheck — submit_grade: grade one check of the project's register, through the ONE door (fileTransmission, kind "grade"). The
// checkId must be a check of k_checks in the project the grade counts against (else unknown_check, nothing filed). WITH
// proof the grade counts at once: a check_results row (pack_version "live": the D1 register has no pack version), which
// lights every node the check names; WITHOUT proof nothing is counted and the filing routes to the owner. The reply's note
// says what was counted and the route the filing took. The owner overturns any grade through decide_contribution.
export async function gradeCheck(person, env, a = {}) {
  const checkId = String(a.checkId || "").trim().slice(0, 120);
  const verdict = String(a.verdict || "").toLowerCase();
  if (!checkId) return { error: "check_id_required" };
  if (!GRADE_VERDICTS.includes(verdict)) return { error: "bad_verdict", allowed: GRADE_VERDICTS };
  const proof = a.proof == null ? "" : String(a.proof).trim().slice(0, 4000);
  // D6: a grade counts against ONE project (check_results.project is NOT NULL, a projects key). With no project to grade
  // for — a caller seated nowhere in a multi-project org, whose read scope is the org level — it is refused before anything
  // is filed.
  const gradeProject = await gradeProjectOf(env);
  if (!gradeProject) {
    return { error: "project_required",
             note: "A grade counts against one project's checks, and this request reads the org level (you hold no seat on a project here). Ask the owner for a seat, then grade with `project` set to it. Nothing was filed." };
  }
  // ...and the grade row and its filing agree: the filing's stamp (doorProject, the rule fileTransmission runs below) must be
  // the project the grade counts against — else nothing is filed and the caller names it (e.g. the seatless owner's
  // defaulted read scope is a project, while an unnamed write of theirs in a multi-project org would stamp the org level)
  const stamp = await doorProject(person, { project: a.project }, await seatsOnce(env, person.id), env);
  if (stamp.error) return stamp;
  if ((stamp.project || null) !== gradeProject) {
    return { error: "project_required", example: { project: gradeProject },
             note: `This grade reads "${projectSlug(gradeProject)}"'s checks but would be filed ${stamp.project ? `in "${projectSlug(stamp.project)}"` : "at the org level"}. Retry with \`project: "${projectSlug(gradeProject)}"\`. Nothing was filed.` };
  }
  if (!(await checkExists(env, gradeProject, checkId))) return unknownCheck(gradeProject, checkId);
  // without proof the filing is flagged for the owner (the router's risk flag), so it routes owner, never auto
  const filed = await fileTransmission(person, {
    ...gradeFilingBody(checkId, verdict, proof), via: a.via ? String(a.via).slice(0, 60) : "mcp",
    clientRef: a.clientRef, project: a.project, eval: isEvalMark(a.eval),
  }, env);
  if (filed.error) return filed;
  let counted = false;
  if (proof && !filed.duplicate) {
    await db(env).prepare(
      "INSERT INTO check_results (project, pack_version, check_id, status, transmission_id, graded_by, graded_at) VALUES (?,?,?,?,?,?,?)"
    ).bind(gradeProject, LIVE_VERSION, checkId, verdict, filed.id || null, person.id, now()).run();
    counted = true;
    forgetReqMemo(env, "knowledge:");   // a later read in this request (a JSON-RPC batch) sees the new light
  }
  const queued = filed.route === "owner" ? ` The filing waits in the owner's queue (route owner)${filed.note ? `: ${filed.note}` : "."}` : ` The filing routed ${filed.route}.`;
  const note = filed.duplicate ? "Already filed under this clientRef: nothing was filed or counted again."
    : counted ? `Counted: ${checkId} is ${verdict}, and every node it names lights from it now; the owner can overturn it.${filed.route === "owner" ? queued : ""}`
    : `Not counted: no proof was sent.${queued} Grade it again with proof (a command and its result, a link or an artifact id) to count it.`;
  return { project: gradeProject, checkId, verdict, packVersion: LIVE_VERSION, transmission: filed.id, route: filed.route, counted, note };
}

// gradeChecks(person, env, grades, { project, via, eval }) — sprint 3 B2 (file, src/preview.js): MANY grades of one project
// with gradeCheck's own rules, in a fixed number of statements instead of about ten each: the verdict, the check id, the
// grade's project equal to the request's scope AND to the filing's stamp (doorProject), the checks in the register (ONE
// read for all), the filings through the batch door (fileTransmissionsBatch: one D1 batch, the clientRef replay included),
// then every counted result row in ONE more batch (a grade with proof that was not a replay). The same two writes per grade
// as gradeCheck (the filing, then its result row), so the same honest limit: a filing that landed whose result row did not
// is a replay on retry and stays uncounted. grades: [{ checkId, verdict, proof, clientRef }] -> the per-grade answers, in
// order, each gradeCheck's { project, checkId, verdict, packVersion, transmission, route, counted, note } or its refusal; or
// ONE refusal for the whole call (project_required, project_forbidden).
export async function gradeChecks(person, env, grades, o = {}) {
  const list = Array.isArray(grades) ? grades : [];
  const gradeProject = await gradeProjectOf(env);
  if (!gradeProject) return { error: "project_required", note: "A grade counts against one project's checks, and this request reads the org level. Nothing was filed." };
  const stamp = await doorProject(person, { project: o.project }, await seatsOnce(env, person.id), env);
  if (stamp.error) return stamp;
  if ((stamp.project || null) !== gradeProject) return { error: "project_required", example: { project: gradeProject }, note: `These grades read "${projectSlug(gradeProject)}"'s checks but would be filed elsewhere. Nothing was filed.` };
  const norm = list.map((a) => ({ ...gradeNorm(a && a.checkId, a && a.verdict, a && a.proof), clientRef: a && a.clientRef }));
  const ids = [...new Set(norm.map((g) => g.checkId).filter(Boolean))];
  const known = new Set(ids.length ? ((await db(env).prepare("SELECT id FROM k_checks WHERE project = ?1 AND id IN (SELECT value FROM json_each(?2))").bind(gradeProject, JSON.stringify(ids)).all()).results || []).map((r) => String(r.id)) : []);
  const out = norm.map((g) => (!g.checkId ? { error: "check_id_required" } : !GRADE_VERDICTS.includes(g.verdict) ? { error: "bad_verdict", allowed: GRADE_VERDICTS }
    : !known.has(g.checkId) ? unknownCheck(gradeProject, g.checkId) : null));
  const go = norm.map((g, i) => [g, i]).filter(([, i]) => !out[i]);
  if (go.length) {
    const filed = await fileTransmissionsBatch(person, go.map(([g]) => ({ ...gradeFilingBody(g.checkId, g.verdict, g.proof), via: o.via ? String(o.via).slice(0, 60) : "mcp",
      clientRef: g.clientRef, project: o.project, eval: isEvalMark(o.eval) })), env);
    const rows = [];
    go.forEach(([g, i], k) => {
      const f = filed[k] || { error: "batch_failed" };
      if (f.error) { out[i] = f; return; }
      const counted = !!(g.proof && !f.duplicate);
      if (counted) rows.push(db(env).prepare("INSERT INTO check_results (project, pack_version, check_id, status, transmission_id, graded_by, graded_at) VALUES (?,?,?,?,?,?,?)")
        .bind(gradeProject, LIVE_VERSION, g.checkId, g.verdict, f.id || null, person.id, now()));
      out[i] = { project: gradeProject, checkId: g.checkId, verdict: g.verdict, packVersion: LIVE_VERSION, transmission: f.id, route: f.route, counted,
        note: f.duplicate ? "Already filed under this clientRef: nothing was filed or counted again." : counted ? `Counted: ${g.checkId} is ${g.verdict}.` : "Not counted: no proof was sent." };
    });
    if (rows.length) { await db(env).batch(rows); forgetReqMemo(env, "knowledge:"); }
  }
  return out;
}
