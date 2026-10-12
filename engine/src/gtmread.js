// src/gtmread.js — GTM, the pipeline read (UI-B10a; the screen, src/gtm.js, is UI-B10b). Owner rulings: Q792A0B9F (a GTM
// lane is measured from its filings and nothing else) · Q8E554970 (gtm is the sixth axis of the SAME goals apparatus: the
// falsifier is "gtm grows its own tree or rollup") · Q61A1D91E (a campaign is a goal-tree node) · QB74B1B7E (one state
// chip) · QD0A65555 + QC8B94276 (a counter is a filing, shown with its exact call) · owner MCQ 2026-09-29: Fork 1 (a) the
// lanes are the template's activity kinds, Fork 3 (a) with no template filed the lanes are the kinds actually filed and the
// answer says so. The template is the project's k_gtm row, filed with preview then file kind "gtm".
//
// ONE seam, two faces (the readGoals pattern): readGtmPipeline(env, reader, q) is the whole read; GET /gtm answers
// it as JSON (UI-B10b renders it to a browser from the SAME call), the MCP `gtm` tool and brain://gtm
// answer the same object.
//
//   metrics   one tile per goal-tree node whose dimensions include gtm: that node's gtm cell from goalsread.js goalCells over
//             G1 (GOALS_AGG_SQL, the SAME text GET /goals runs, once), in GET /goals node order. No second aggregation.
//   campaigns the same nodes (id, title, the cell's target, outcomeMetric, href); goal-link the first of them.
//   lanes     the template's activityKinds in its order, then every filed kind it does not list, by name, so the
//             lane totals equal the row count; with no template, the filed kinds by name. The engine types no kind name.
//   rows      every gtm filing of the project in the period (X1), landed or not, seat-scoped, newest first, each with its one
//             chip (tempo.js), its standing counters and the exact counter call (transmission.js FILING_COUNTER_CALL).
//   stamp     counts {filings, landed} off X2, {awaiting} the tiles' awaiting summed, {goals} the gtm nodes.
//   lists     D2 (B7): the card kinds whose tab is gtm, each with its cards (src/tablists.js tabListsFor; null when none).
//
// Budget (guardrail 5), beyond the memoized auth (src/hotsql.js, EXPLAINed by tools/d1-hot-selftest.mjs section N): the goal
// tree (D1, goalsread.js contextOf), then ONE parallel wave: G1 + X1 and the template (k_gtm, knowledge/gtm.js gtmTemplate,
// one row); with no goal filed (or no gtm node) no G1. X2 runs only when X1 is cut at GTM_ROWS_LIMIT (sprint 2: otherwise
// its counts are X1's own rows, counted here). A failed
// statement is live:'unreachable' (200); a quota error propagates.

import { db } from "./data.js";
import { contextOf, optsOf, wave, goalsAggQuery, goalCells } from "./goalsread.js";
import { GTM_ROWS_SQL, GTM_KINDS_SQL } from "./hotsql.js";
import { gtmTemplate } from "./knowledge/gtm.js";
import { tempoOf, chipOfTempo } from "./tempo.js";
import { FILING_COUNTER_CALL } from "./transmission.js";
import { now, isD1Quota } from "./util.js";
import { followUpsFor } from "./pickup.js";
import { gtmStrategy } from "./knowledge/docs.js";
import { tabListsSafe } from "./tablists.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const GTM_DIM = "gtm";
export const GTM_ROWS_LIMIT = 200;   // rows listed; X1 reads one more to know there is more
// the read's own notes (its JSON `message(s)`, the `gtm` tool's answer; GTM_NO_GOAL is also the disabled button's title)
// copy: off-screen
export const GTM_NO_GOAL = 'No go-to-market goal yet. Your Claude files one through preview then file: an item of kind "goal", dimensions ["gtm"].';
// copy: off-screen
export const GTM_NO_TEMPLATE = 'No GTM template is filed for this project yet: file one through preview then file, an item of kind "gtm".';
// copy: off-screen
export const GTM_EMPTY = "No go-to-market contribution in this project this period.";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hasGtm = (n) => Array.isArray(n && n.dimensions) && n.dimensions.includes(GTM_DIM);
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);   // code-point order, locale-free

// the project's template -> { v, kinds:[{kind, holds:[field names], proofConcrete}] } in activityKinds order, or null
export function templateOf(g) {
  if (!g || typeof g !== "object" || !Array.isArray(g.activityKinds)) return null;
  const entries = g.activityTemplate && Array.isArray(g.activityTemplate.kinds) ? g.activityTemplate.kinds : [];
  const byKind = new Map(entries.filter((e) => e && typeof e.kind === "string").map((e) => [e.kind, e]));
  const seen = new Set();
  const kinds = [];
  for (const k of g.activityKinds) {
    if (typeof k !== "string" || !k || seen.has(k)) continue;
    seen.add(k);
    const e = byKind.get(k) || {};
    kinds.push({ kind: k, holds: (Array.isArray(e.holds) ? e.holds : []).map((h) => (h && h.field != null ? String(h.field) : null)), proofConcrete: e.proofConcrete ?? null });
  }
  return { v: g.v ?? null, kinds };
}

// ---- readGtmPipeline: the GTM read (the shape in contracts/door.declared.json `gtm`) ----
export async function readGtmPipeline(env, reader, q = {}) {
  const { includeEval, period } = optsOf(q);
  const { declared: ownTree, tree, project, down: treeDown } = await contextOf(env, reader);
  const declared = !!(ownTree && tree.length);
  const gtmNodes = declared ? tree.filter(hasGtm) : [];
  const scoped = !!project.key, pb = scoped ? [project.key] : [];
  const isOwner = !!(reader && reader.role === "owner");
  const rid = reader && reader.id ? String(reader.id) : "";
  const runG1 = gtmNodes.length > 0;   // no gtm node: no metric, so no metrics statement
  // THE WAVE: X1 (and G1 when there is a gtm node), with the template (D1) beside it. Sprint 2 (the
  // live budget): X1 reads every gtm filing of the period up to GTM_ROWS_LIMIT + 1, and X2's counts per kind are the same rows'
  // (the same WHERE), so while X1 is not cut they are counted from X1 and X2 never runs; only a period with more gtm filings
  // than the list shows (or a failed X1) reads X2, after the wave. The counts are the same either way.
  let templateDown = false;
  const [w, g, followUps, strategy, lists] = await Promise.all([
    wave([
      db(env).prepare(GTM_ROWS_SQL(scoped, includeEval)).bind(...pb, period.from, isOwner ? 1 : 0, rid, GTM_ROWS_LIMIT + 1).all(),
      ...(runG1 ? [goalsAggQuery(env, project, includeEval, period)] : []),
    ]),
    gtmTemplate(env).catch((e) => { if (isD1Quota(e)) throw e; templateDown = true; return null; }),
    // sprint 3 B4: the GTM lane's follow-ups due (src/pickup.js followUpsFor: two bounded ranges of idx_transmission_followups)
    scoped ? followUpsFor(env, reader, { project: project.key, gtmOnly: true, includeEval }).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : Promise.resolve({ rows: [], more: false }),
    // the one-pass fix 9: the GTM strategy, the docs under gtm/ (one bounded read, src/knowledge/docs.js gtmStrategy)
    scoped ? gtmStrategy(env, project.key, reader).catch((e) => { if (isD1Quota(e)) throw e; return null; }) : Promise.resolve({ docs: [], more: false }),
    // D2 (B7): the lists, the card kinds whose tab is gtm (claims, targets, copy), as every tab lists the kinds that name it
    // (src/tablists.js: the kinds, then one batch, role visibility and access hats applied in SQL); null when no kind names GTM
    scoped ? tabListsSafe(env, reader, GTM_DIM, { project: project.key }) : Promise.resolve(null),
  ]);
  const rowsRes = w.val(0), aggRes = runG1 ? w.val(1) : null;
  let kindsRes = null, kindsDown = false;
  const rows1 = rowsRes ? rowsRes.results || [] : null;
  if (rows1 && rows1.length <= GTM_ROWS_LIMIT) {
    const per = new Map();
    for (const x of rows1) {
      const k = x.kind == null ? "" : String(x.kind), c = per.get(k) || { kind: k, n: 0, landed: 0 };
      c.n++; if (x.route === "auto" || x.decision === "approve") c.landed++;
      per.set(k, c);
    }
    kindsRes = { results: [...per.values()] };
  } else {
    const w2 = await wave([db(env).prepare(GTM_KINDS_SQL(scoped, includeEval)).bind(...pb, period.from, isOwner ? 1 : 0, rid).all()]);
    kindsRes = w2.val(0); kindsDown = w2.down;
  }
  const template = templateOf(g);

  // metrics + campaigns: the gtm cells of GET /goals' own rolled nodes, in its node order
  const agg = aggRes ? (aggRes.results || []) : null;
  const cellNodes = runG1 ? goalCells(tree, agg).nodes.filter(({ dims }) => dims.some((d) => d.dim === GTM_DIM)) : [];
  const metrics = [], campaigns = [];
  for (const { t, dims, href } of cellNodes) {
    const c = dims.find((d) => d.dim === GTM_DIM);
    metrics.push({ id: t.id, title: t.title || t.id, count: c.count, target: c.target, pct: c.pct, realized: c.realized, awaiting: c.awaiting, href });
    campaigns.push({ id: t.id, title: t.title || t.id, target: c.target, outcomeMetric: t.outcomeMetric === true, href });
  }

  // rows: newest first, each with its chip, counters and the exact call
  const publishedAt = now();   // live: a landed filing is on the canvas at once
  const raw = (rowsRes && rowsRes.results) || [];
  const rows = raw.slice(0, GTM_ROWS_LIMIT).map((x) => ({
    id: x.id, what: x.what ?? null, by: x.by_name ?? null, created_at: x.created_at ?? null, happenedAt: x.happened_at ?? null, goalRef: x.goal_ref ?? null,
    expected: x.expected ?? null, actual: x.actual ?? null, outcome: x.outcome ?? null, proof: x.proof ?? null,
    chip: chipOfTempo(tempoOf(x, { publishedAt }), x.decision, x.route),
    counters: { standing: num(x.standing) }, call: FILING_COUNTER_CALL.replace("<id>", String(x.id)), href: orgPath("/contribution/") + encodeURIComponent(String(x.id)),
    _kind: x.kind == null ? "" : String(x.kind),
  }));

  // lanes: the template's kinds in its order, then each filed kind it does not list, by name
  const kindRows = (kindsRes && kindsRes.results) || [];
  const filed = new Set([...kindRows.map((k) => (k.kind == null ? "" : String(k.kind))), ...rows.map((r) => r._kind)]);
  const tKinds = template ? template.kinds.map((k) => k.kind) : [];
  const tByKind = new Map(template ? template.kinds.map((k) => [k.kind, k]) : []);
  const order = [...tKinds, ...[...filed].filter((k) => !tByKind.has(k)).sort(byName)];
  const lanes = order.map((kind) => ({ kind, template: tByKind.get(kind) || null, rows: rows.filter((r) => r._kind === kind).map(({ _kind, ...r }) => r) }));

  const down = w.down || kindsDown || !!treeDown || templateDown;
  const filings = kindsRes ? kindRows.reduce((s, k) => s + num(k.n), 0) : null;
  const landed = kindsRes ? kindRows.reduce((s, k) => s + num(k.landed), 0) : null;
  const awaiting = metrics.reduce((s, m) => s + num(m.awaiting), 0);
  const messages = [
    ...(campaigns.length ? [] : [GTM_NO_GOAL]),
    ...(template || templateDown ? [] : [GTM_NO_TEMPLATE]),
    ...(rowsRes && !raw.length ? [GTM_EMPTY] : []),
  ];
  return {
    declared, project, period, template, campaigns,
    stamp: { counts: { filings, landed, awaiting, goals: campaigns.length } },
    regions: { metrics, lanes, "goal-link": campaigns.length ? { ref: campaigns[0].id, href: campaigns[0].href } : null },
    ...(followUps ? { followUps } : {}),
    strategy: strategy || { docs: [], more: false, live: "unreachable" },
    lists: lists || null,
    ...(raw.length > GTM_ROWS_LIMIT ? { more: true } : {}),
    ...(messages.length ? { message: messages[0], messages } : {}),
    ...(includeEval ? { eval: true } : {}),
    ...(down ? { live: "unreachable" } : {}),
  };
}
