// src/reports.js — the two owner JSON reports (GET /storage, GET /log), moved out of src/index.js (M-ADR-008a phase 1, task
// T6); the OWNER_ONLY gate itself stays in index.js — these bodies run only after it. Each answers the reader's org alone
// (sprint 6, 6.3: an owner owns one org; the org from the sign-in, src/data.js {org}).
import { db } from "./data.js";
import { json } from "./util.js";
import { orgUrl } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { storageShownOf, RAISE } from "./plans.js";   // sprint 8, 8.5 (8.4's leftover): the plan's storage limit, THE definition

export async function handleStorage(env) {
  // sprint 6, 6.3 (PLATFORM §2 item 6: an owner owns one org): the reader's org's files only ({org}, src/data.js); the orphans' count
  // rides their page as a window (COUNT(*) OVER (), computed before the LIMIT) instead of a second scan.
  // sprint 8, 8.5 (8.4's leftover): what is stored is told by TODAY's rule — the org's plan's storage limit (src/plans.js
  // storageShownOf: ONE statement, the plan the check applies and THE storage definition, the org's files plus every screen-picture
  // body it holds once, the numbers a storage plan_limit names). Sprint 6's 8 GB guard and the 10 GB "free allowance" it quoted are
  // retired (8.2): the plan's limit is the only one. byMonth stays the files' timeline (pictures carry no month here).
  const byMonth = await db(env).prepare(
    "SELECT substr(created_at,1,7) AS month, COUNT(*) AS files, COALESCE(SUM(bytes),0) AS bytes " +
    "FROM artifacts WHERE org = {org} GROUP BY month ORDER BY month DESC"
  ).all();
  const shown = await storageShownOf(env);
  // The orphan-attachment census (ADR-087 §3, PRD Track E6): an artifact is LINKED if
  // (a) some transmission row's report or trace column names it, or (b) its group_tag
  // marks it as an intake/serving object class rather than a general attachment —
  // 'report'/'trace' are the two classes that link via (a) by construction, 'public' is
  // a shareable-deeplink serving object (ADR-055), 'eval'/'ungrouped' are already-tracked
  // noise (mirror.js's orphanArtifacts covers ungrouped; eval is self-cleaned by evals.sh).
  // Anything left over that no transmission row ever cited is a candidate — warn-level,
  // never a hard failure: it may simply not have been submitted through the router yet.
  const orphans = await db(env).prepare(
    "SELECT id, COUNT(*) OVER () AS n FROM artifacts WHERE org = {org} " +
    "AND group_tag NOT IN ('report','trace','public','eval','ungrouped','legacy-ungrouped') " +
    "AND id NOT IN (SELECT report FROM transmission WHERE report IS NOT NULL AND org = {org}) " +
    "AND id NOT IN (SELECT trace FROM transmission WHERE trace IS NOT NULL AND org = {org}) " +
    "ORDER BY created_at DESC LIMIT 10"
  ).all();
  return json({
    note: "What this org stores, against its plan's storage limit: its files plus every screen-picture body it holds, each body once " +
      "(the one definition every storage check reads: a write that would pass the limit is refused plan_limit, past 80% it warns). " + RAISE,
    plan: shown ? shown.plan : null,
    limitBytes: shown ? shown.allowedBytes : null,
    usedBytes: shown ? shown.usedBytes : 0,
    filesBytes: shown ? shown.files : 0,
    picturesBytes: shown ? shown.pictures : 0,
    percentOfLimit: shown ? shown.percentOfLimit : null,
    state: shown ? shown.state : null,
    byMonth: byMonth.results,
    orphanCandidates: {
      note: "warn-level — unreachable from any contribution row's report/trace, and not an intake/serving object class. May simply predate the router; not a failure by itself.",
      count: Number((orphans.results[0] || {}).n) || 0,
      ids: orphans.results.map((r) => r.id),
    },
  });
}

// ---- the master log: one stream of everything, every user of the reader's org (ADR-037). Owner-only. ----
// sprint 6, 6.3: the org's events ({org}: events.org carries no index, so the walk on idx_events_created_at is the one it always
// was, stopped at the LIMIT; on a database holding one org it reads exactly the rows it read before) and the org's files
export async function handleLog(env, url) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "60", 10) || 60, 200);
  const who = url.searchParams.get("person") || null;
  const kind = url.searchParams.get("kind") || null;
  const since = url.searchParams.get("since") || "1970-01-01";

  let sql = "SELECT e.id, e.kind, e.lane AS ev_lane, e.payload_json, e.basis, e.touches, e.stamped, e.created_at, " +
            "p.name AS by_name, COALESCE(p.title, p.role) AS by_role, p.lane AS by_lane " +
            "FROM events e JOIN people p ON p.id = e.person_id WHERE e.created_at >= ? AND e.org = {org}";
  const binds = [since];
  if (who)  { sql += " AND lower(p.name) = ?"; binds.push(who.toLowerCase()); }
  if (kind) { sql += " AND e.kind = ?";        binds.push(kind); }
  const laneQ = url.searchParams.get("lane") || null;   // envelope-lane filter (2026-08-30)
  if (laneQ) { sql += " AND e.lane = ?"; binds.push(laneQ.toLowerCase()); }
  sql += " ORDER BY e.created_at DESC LIMIT ?";
  binds.push(limit);
  const { results } = await db(env).prepare(sql).bind(...binds).all();

  // artifacts carry their own deeplink, so a log line can be opened, not just read
  const arts = await db(env).prepare(
    "SELECT id, title, group_tag, sha256, created_at FROM artifacts WHERE created_at >= ? AND org = {org} ORDER BY created_at DESC LIMIT 200"
  ).bind(since).all();
  const artById = {};
  for (const a of arts.results) artById[a.id] = a;

  const rows = results.map((r) => {
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch {}
    const out = {
      at: r.created_at, kind: r.kind, by: r.by_name, role: r.by_role,
      lane: r.ev_lane || null, routing: r.by_lane || null,
      what: p.what || p.title || p.question || p.claim || p.summary || null,
      basis: r.basis || null, touches: r.touches || null,
    };
    if (r.kind === "ruling") out.binding = !!r.stamped;
    if (p.artifactId && artById[p.artifactId]) {
      const a = artById[p.artifactId];
      out.artifact = { title: a.title, track: a.group_tag,
                       link: orgUrl(url.origin, "/artifact/" + a.id) };
    }
    if (p.handoffId) out.handoff = p.handoffId;
    if (p.transmissionId) out.contribution = p.transmissionId;   // the ruling names the row it decided (WP7, E257a3)
    if (p.eval) out.eval = true;                                   // a suite-marked mirror says so (the eval mark rule)
    return out;
  });

  const byPerson = {};
  for (const r of rows) {
    byPerson[r.by] = byPerson[r.by] || { transmissions: 0, rulings: 0, drifts: 0, artifacts: 0 };
    if (r.kind === "exit") byPerson[r.by].transmissions++;
    if (r.kind === "ruling") byPerson[r.by].rulings++;
    if (r.kind === "drift") byPerson[r.by].drifts++;
    if (r.kind === "fragment") byPerson[r.by].artifacts++;
  }

  return json({
    note: "Every contribution, report and update, all users of this org, newest first. " +
          "Filter with ?person= ?kind= ?since= ?limit=.",
    filters: { person: who, kind, since, limit },
    count: rows.length, byPerson, log: rows,
  });
}
