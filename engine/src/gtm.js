// src/gtm.js — GTM, the screen (UI-B10b, wf-gtm on GTM.dc.html; the read is src/gtmread.js, UI-B10a). Owner rulings:
// Q792A0B9F (a GTM lane is measured from its filings and nothing else) · Q8E554970 (gtm is the sixth axis of the SAME goals
// apparatus: the tiles are Goals' own gtm cells, never a second rollup) · Q61A1D91E (a campaign is a goal-tree node) ·
// QB74B1B7E (one state chip per row) · QD0A65555 + QC8B94276 (a counter is a filing, shown with its exact call) · Q67288EF5 /
// QD74AC4E2 (Brand v2 decides the tokens, the artboard decides the regions) · owner MCQ 2026-09-29 (Fork 1 (a): the lanes are
// the template's activity kinds; Fork 3 (a): no template filed, the kinds filed and the sentence that names the op).
//
// PURE: renderGtm(read, { brand }) draws exactly what readGtmPipeline answered, inside the shell (the route wraps it with the
// GTM tab lit). Regions in the artboard's order: metrics (one tile per gtm goal node, and the campaigns chips onto exactly
// those nodes) · lanes (one per r.regions.lanes entry, in its order, one row per filing) · goal-link (open-on-goals). This file
// types no kind name, no count and no sample org: every lane, number and title on glass comes off the read. The artboard's
// funnel (its typed counts, its four stages, its prospect orgs, its warm/stuck tags) is superseded by served data (wf-gtm).
//
// The look pass (sprint 2, docs/plan/LOOK.md): on ui.js's shared parts and the semantic tokens only (never a --bv-* name).
// The counts are one calm line under the title and the period switch quiet pills beside it; each gtm goal is a number
// (Fredoka) with its bar, separated by hairlines, never a card; the lanes are columns of rows at desktop width (auto-fill,
// so three at 1440) and one stacked list on a phone; every EMPTY names the exact call that fills it. Hooks a check reads:
// data-region; data-goal + data-count + data-target + data-pct on a tile; data-lane on a lane; data-row + data-campaign on
// a row; data-metric + data-value on a count.

import { esc, unreachableState, statusChip } from "./ui.js";
import { card, tile, tileRow, avatar, avatarStack, ring, miniBars, chip, filterRow, hrefWith, group, line, lines, lineDetail, empty, pageHead, cols, stack, id as idCode, ago, happenedOf } from "./parts.js";
import { GTM_NO_GOAL } from "./gtmread.js";
import { PERIOD_LABELS, GOALS_DEFAULT_PERIOD } from "./goals.js";
import { tabListsRegion } from "./tablists.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const GTM_REGIONS = ["metrics", "lanes", "goal-link"];

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const known = (v) => v != null && Number.isFinite(Number(v));
const num = (v) => (known(v) ? Number(v) : 0);
const isLink = (p) => typeof p === "string" && /^https?:\/\//i.test(p.trim());
const clampPct = (v) => Math.max(0, Math.min(100, Number(v)));
const cap = (w) => { const s = String(w || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
const face = (name, size) => avatar({ name: name || "someone", size: size || 24 });
const DAY = 864e5, WEEKS = 7;
const CSS = `<style>
.gt{display:block}
.gt-n{min-width:40px;text-align:right;color:var(--text-muted);white-space:nowrap}
.gt-n b{font-weight:500;color:var(--text)}
.gt-n>span{margin-left:4px}
.gt .p-ld-body a{overflow-wrap:anywhere}
</style>`;

// ---- GTM (sprint 3, L2: the revision, docs/plan/LOOK.md; the approved mock is tools/parts-gallery.mjs gtm()) ----
// PURE: renderGtm(read, { brand, params }) draws exactly what readGtmPipeline answered. The glance (the go-to-market goals
// realized, the contributions with their weeks, landed, awaiting an actual), the ONE filter row (the campaign: a gtm goal; the
// lane: an activity kind; the person; the period: each a link, the choice kept in the address, narrowing the SAME read), the
// goals (under way open, not started folded), the lanes (one group per activity kind, the template's holds and proof in its
// title), and beside them the strategy, the follow-ups and the tab's lists. This file types no kind name, no count and no
// sample org: every lane, number and title comes off the read. Hooks a check reads: data-region (metrics · lanes · goal-link,
// goals, strategy, follow-ups, lists), data-metric + data-value on a tile (goals · filings · landed · awaiting), data-goal +
// data-count + data-target + data-pct on a goal's row, data-lane on a lane, data-row + data-campaign on a row, data-button.
export function renderGtm(r, opts = {}) {
  const read = r || {};
  const down = read.live === "unreachable";
  const nowMs = opts.nowMs || Date.now();
  const period = (read.period && read.period.key) || GOALS_DEFAULT_PERIOD;
  const regions = read.regions || {};
  const metrics = Array.isArray(regions.metrics) ? regions.metrics : [];
  const lanes = Array.isArray(regions.lanes) ? regions.lanes : [];
  const campaigns = Array.isArray(read.campaigns) ? read.campaigns : [];
  const c = (read.stamp && read.stamp.counts) || {};
  const get = (k) => { const p = opts.params; return p && typeof p.get === "function" ? p.get(k) : p && p[k]; };
  // a campaign is a gtm goal node (Q61A1D91E): its filter is ?goal=<id>
  const fCampaign = campaigns.some((x) => x.id === get("goal")) ? String(get("goal")) : null;
  const fLane = lanes.some((l) => l.kind === get("lane")) ? String(get("lane")) : null;
  const allRows = lanes.flatMap((l) => (l.rows || []).map((x) => ({ ...x, kind: l.kind })));
  const fBy = allRows.some((x) => x.by && x.by === get("by")) ? String(get("by")) : null;
  const params = { ...(period !== GOALS_DEFAULT_PERIOD ? { period } : {}), ...(fCampaign ? { goal: fCampaign } : {}), ...(fLane ? { lane: fLane } : {}), ...(fBy ? { by: fBy } : {}), ...(read.eval ? { eval: "1" } : {}) };
  const H = (k, v) => hrefWith(orgPath("/gtm"), params, k, v);
  const matches = (x, but) => (but === "goal" || !fCampaign || x.goalRef === fCampaign) && (but === "lane" || !fLane || x.kind === fLane) && (but === "by" || !fBy || x.by === fBy);
  const rowsNow = allRows.filter((x) => matches(x));
  const titleOf = new Map(campaigns.map((x) => [x.id, x.title || x.id]));

  // the head: GTM, and Open on Goals (the selected campaign, else the first gtm goal; disabled with its reason when there is none)
  const gl = regions["goal-link"];
  const first = fCampaign ? campaigns.find((x) => x.id === fCampaign) : gl && gl.ref ? { id: gl.ref, href: gl.href } : campaigns[0] || null;
  const openGoals = first
    ? `<a class="u-btn small" href="${esc(first.href || orgPath("/goals/") + encodeURIComponent(String(first.id)))}" data-button="open-on-goals" data-door="GET /goals/:ref" title="Each number is its goal's own gtm cell on Goals">Open on Goals</a>`
    : `<button type="button" class="u-btn small" data-button="open-on-goals" data-door="GET /goals/:ref" disabled aria-disabled="true" title="${esc(GTM_NO_GOAL)}">Open on Goals</button>`;
  const head = pageHead({ title: "GTM", actions: [`<span data-region="goal-link">${openGoals}</span>`] });

  // ---- the glance ----
  const realized = metrics.filter((m) => known(m.pct) && Number(m.pct) >= 100).length;
  const weeks = Array(WEEKS).fill(0);
  for (const x of allRows) { const t = Date.parse(String(happenedOf(x) || "")); if (Number.isFinite(t) && t >= nowMs - WEEKS * 7 * DAY) weeks[WEEKS - 1 - Math.min(WEEKS - 1, Math.floor((nowMs - t) / (7 * DAY)))]++; }
  const filed = known(c.filings) ? Number(c.filings) : null;
  // nothing filed for go-to-market at all, or goals filed and nothing contributed toward them: one phrase, never four zero tiles
  const allEmpty = !down && !metrics.length && !lanes.some((l) => (l.rows || []).length) && filed === 0;
  const noneFiled = !down && filed === 0;
  // L4: when the tab holds goals, lists or strategy but no contribution, the phrase is one quiet line (no ground, no edge,
  // no label), never the first card on the page
  const quietEmpty = metrics.length > 0 || !!(read.strategy && Array.isArray(read.strategy.docs) && read.strategy.docs.length) || !!(read.lists && Array.isArray(read.lists.lists) && read.lists.lists.length);
  const tiles = noneFiled
    ? card({ region: "metrics", ...(quietEmpty ? { tone: "quiet" } : { label: "Contributions" }), body: empty(metrics.length ? `Nothing contributed ${period === "all" ? "yet" : "this period"}` : "Nothing contributed yet", quietEmpty ? {} : { action: { href: metrics.length ? orgPath("/goals") : orgPath("/missing"), label: metrics.length ? "Goals" : "What is missing" } }) })
    : tileRow([
      metrics.length ? tile({ label: "Goals realized", value: down ? null : realized, unit: `of ${metrics.length}`, count: true, key: "goals", chart: ring({ value: realized, max: Math.max(1, metrics.length), size: 36, center: "", label: "Goals realized" }) }) : "",
      tile({ label: `Contributions · ${period === "all" ? "all" : PERIOD_LABELS[period].toLowerCase()}`, value: filed, count: true, key: "filings", chart: miniBars(weeks, { labels: weeks.map((_, i) => `W${i + 1}`), label: "Contributions a week, the last seven weeks" }) }),
      tile({ label: "Landed", value: c.landed, tone: num(c.landed) ? "ok" : "", count: true, key: "landed" }),
      tile({ label: "Awaiting an actual", value: c.awaiting, tone: num(c.awaiting) ? "warn" : "", count: true, key: "awaiting" }),
    ], { region: "metrics", label: "How it is going" });

  // ---- the filter row ----
  const FILTER = 'data-client="filters the rows to the contributions that name this campaign (a gtm goal node)"';
  const countBy = (key, val, but) => allRows.filter((x) => matches(x, but) && x[key] === val).length;
  const people = [...new Set(allRows.map((x) => x.by).filter(Boolean))];
  const filters = filterRow({ clear: hrefWith(orgPath("/gtm"), read.eval ? { eval: "1" } : {}), label: "Filter the go-to-market contributions", groups: [
    { key: "goal", label: "Campaign", max: 4, items: [
      { label: "All", count: rowsNow.length, href: H("goal", ""), current: !fCampaign, all: true },
      ...campaigns.map((x) => ({ label: noDash(x.title || x.id), count: countBy("goalRef", x.id, "goal"), href: H("goal", fCampaign === x.id ? "" : x.id), current: fCampaign === x.id,
        attrs: `data-button="campaigns" data-campaign="${esc(x.id)}" ${FILTER}` }))] },
    { key: "lane", label: "Lane", items: lanes.map((l) => ({ label: l.kind || "no kind", count: countBy("kind", l.kind, "lane"), href: H("lane", fLane === l.kind ? "" : l.kind), current: fLane === l.kind })) },
    { key: "by", label: "Person", max: 4, items: people.map((p) => ({ label: String(p).split(/\s+/)[0], title: p, count: countBy("by", p, "by"), person: { name: p }, href: H("by", fBy === p ? "" : p), current: fBy === p })) },
    { key: "period", label: "Time", items: Object.keys(PERIOD_LABELS).map((k) => ({ label: k === "all" ? "All time" : k === "quarter" ? "Quarter" : "Month", href: H("period", k === GOALS_DEFAULT_PERIOD ? "" : k), current: k === period, all: k === GOALS_DEFAULT_PERIOD })) },
  ] });

  // ---- the goals: under way open, not started folded ----
  const goalLine = (m) => line({ attrs: `data-goal="${esc(m.id)}" data-count="${esc(known(m.count) ? m.count : "?")}" data-target="${esc(known(m.target) ? m.target : "?")}" data-pct="${esc(known(m.pct) ? clampPct(m.pct) : "?")}"`,
    lead: ring({ value: num(m.count), max: Math.max(1, num(m.target)), size: 20, tone: known(m.pct) && Number(m.pct) >= 100 ? "ok" : "", label: "contributions of the target" }),
    title: noDash(m.title || m.id), href: m.href || orgPath(`/goals/${encodeURIComponent(String(m.id))}`),
    meta: `<span class="gt-n"><b>${esc(known(m.count) ? m.count : "?")}</b><span>of ${esc(known(m.target) ? m.target : "?")}</span></span>`,
    detail: lineDetail({ facts: [["Id", idCode(m.id)], ["Realized", esc(known(m.realized) ? m.realized : "?")], num(m.awaiting) ? ["Awaiting an actual", esc(m.awaiting)] : null, ["Done", esc(known(m.pct) ? `${clampPct(m.pct)}%` : "?")]],
      actions: `<a class="u-btn small" href="${esc(m.href || orgPath(`/goals/${encodeURIComponent(String(m.id))}`))}">Open on Goals</a>` }) });
  const underWay = metrics.filter((m) => num(m.count) > 0), notStarted = metrics.filter((m) => !(num(m.count) > 0));
  const goalsCard = card({ label: "Goals", count: metrics.length || "", flush: true, region: "goals", attrs: 'data-reveal="2"',
    body: metrics.length ? (underWay.length ? group({ title: "Under way", count: underWay.length, open: true, summary: `<span>${esc(realized)} of ${esc(underWay.length)} realized</span>`, body: lines(underWay.map(goalLine)) }) : "")
      + (notStarted.length ? group({ title: "Not started", count: notStarted.length, open: !underWay.length && notStarted.length <= 3, body: lines(notStarted.map(goalLine)) }) : "")
      : empty("No go-to-market goals yet", { action: { href: orgPath("/missing"), label: "What is missing" } }) });

  // ---- the lanes: one group per activity kind (its template's holds and proof in the group's title) ----
  const rowLine = (x) => {
    const p = x.proof == null ? "" : String(x.proof);
    const proof = !p ? "" : isLink(p) ? `<a class="u-link" href="${esc(p.trim())}" rel="noopener noreferrer" target="_blank">${esc(p.trim())}</a>` : txt(p);
    const standing = x.counters && num(x.counters.standing);
    const facts = [["Id", idCode(x.id)], x.by ? ["By", `${face(x.by, 20)}${txt(x.by)}`] : null, x.goalRef ? ["Goal", `<a class="u-link" href="${orgPath(`/goals/${encodeURIComponent(x.goalRef)}`)}">${txt(titleOf.get(x.goalRef) || x.goalRef)}</a>`] : null,
      x.expected != null && x.expected !== "" ? ["Expected", txt(x.expected)] : null, x.actual != null && x.actual !== "" ? ["Actual", txt(x.actual)] : null,
      known(x.outcome) ? ["Outcome", esc(x.outcome)] : null, proof ? ["Proof", proof] : null,
      standing ? ["Counters", `<a class="u-link" href="${esc(x.href)}#counters" data-button="counters" data-door="GET /gtm" data-client="the counters standing on this contribution, read on its page" data-row-id="${esc(x.id)}">${esc(standing)}</a>`] : null];
    return line({ attrs: `data-row="${esc(x.id)}" data-campaign="${esc(x.goalRef || "")}"${x.goalRef ? ` data-goal="${esc(x.goalRef)}"` : ""}`, lead: face(x.by), title: noDash(x.what || x.id), href: x.href,
      sub: x.goalRef ? txt(titleOf.get(x.goalRef) || x.goalRef) : "", meta: `${statusChip(x.chip, x.chip === "LANDED" ? "Landed" : x.actual == null || x.actual === "" ? cap(String(x.chip || "").toLowerCase()) : "Reported")}<span>${esc(ago(happenedOf(x), nowMs))}</span>`,
      detail: lineDetail({ facts }) });
  };
  const laneGroups = lanes.map((l, i) => {
    const xs = (l.rows || []).map((x) => ({ ...x, kind: l.kind })).filter((x) => matches(x));
    if (!xs.length) return "";
    const t = l.template;
    // copy: off-screen (the lane group's title="" value)
    const tTitle = t ? [t.holds && t.holds.filter(Boolean).length ? `holds ${t.holds.filter(Boolean).join(", ")}` : "", t.proofConcrete ? `proof ${noDash(t.proofConcrete)}` : ""].filter(Boolean).join(" · ") : "Not in the template: filed under this kind all the same";
    return group({ title: l.kind || "no kind", titleAttr: tTitle || l.kind, count: xs.length, open: i < 2, attrs: `data-lane="${esc(l.kind)}"`,
      summary: `${t ? "" : chip("Off template", { title: tTitle })}${avatarStack(peopleOf(xs), { size: 20 })}`, body: lines(xs.map(rowLine)) });
  }).join("");
  const kindsOnly = !rowsNow.length && lanes.length
    // L4: a lane's line is its kind; what its template holds (raw field names) and its proof ride the title, never the screen
    ? group({ title: "Activity kinds", count: lanes.length, open: true, body: lines(lanes.map((l) => line({ attrs: `data-lane="${esc(l.kind)}"${l.template ? ` title="${esc(laneTitle(l.template))}"` : ""}`, title: l.kind || "no kind",
      meta: l.template ? "" : chip("Off template") })), { compact: true }) }) : "";
  const lanesCard = card({ label: "Lanes", count: rowsNow.length || "", flush: true, region: "lanes", attrs: 'data-reveal="2"',
    body: down && !lanes.length ? empty("The ledger did not answer") : (laneGroups || (fCampaign || fLane || fBy ? empty("Nothing matches") : kindsOnly ? "" : empty("No lanes yet")) + (laneGroups ? "" : kindsOnly))
      + (read.more ? `<p class="p-empty"><span title="More go-to-market contributions than the newest shown">More</span></p>` : "") });

  // ---- the side: the strategy, the follow-ups, the tab's lists ----
  const st = read.strategy || { docs: [] };
  const stDocs = Array.isArray(st.docs) ? st.docs : [];
  // D6a: a doc opened from the Strategy card keeps GTM lit (shell.js tabOf: ?from=gtm), as a card opened from a list does
  const fromGtm = (h) => (typeof h === "string" && h.startsWith("/") ? `${h}${h.includes("?") ? "&" : "?"}from=gtm` : h);
  const strategy = card({ label: "Strategy", count: stDocs.length || "", flush: true, region: "strategy", attrs: 'data-reveal="3"',
    body: stDocs.length ? lines(stDocs.map((d) => line({ attrs: `data-doc="${esc(d.path)}"${d.confidence ? ` data-confidence="${esc(d.confidence)}"` : ""}${d.asOf ? ` data-as-of="${esc(d.asOf)}"` : ""}`, title: noDash(d.title || d.path), href: fromGtm(d.href), linkAttrs: 'data-button="open-doc" data-door="GET /doc/*"',
      meta: `${d.confidence ? chip(d.confidence) : ""}${d.asOf ? `<span>${esc(shortDate(d.asOf))}</span>` : ""}` })), { compact: true }) + (st.more ? `<p class="p-empty"><span title="The Library lists them all">More in the Library</span></p>` : "")
      : st.live === "unreachable" ? empty("The strategy docs did not answer") : empty("No strategy yet") });
  const fu = read.followUps || { rows: [] };
  const fuRows = Array.isArray(fu.rows) ? fu.rows : [];
  const follow = card({ label: "Follow-ups", count: fuRows.length || "", flush: true, region: "follow-ups", attrs: 'data-reveal="3"',
    body: fuRows.length ? lines(fuRows.map((x) => line({ attrs: `data-followup="${esc(x.id)}" data-due="${esc(x.by)}" data-mine="${x.mine ? 1 : 0}" data-overdue="${x.overdue ? 1 : 0}"`, lead: x.who ? face(x.whoName || x.who) : chip("Anyone"), title: noDash(x.next), href: x.href, sub: x.who ? esc(noDash(x.whoName || x.who)) : "",
      meta: `${x.overdue ? chip("Overdue", { tone: "bad" }) : ""}<span>${esc(x.by)}</span>` })), { compact: true }) : empty("No follow-up due") });
  const lists = tabListsRegion(read.lists, { side: true });
  const banner = down ? unreachableState({ what: "GTM could not be read from the ledger, so its numbers show ? until it answers." }) : "";
  // D6a: the quiet "nothing contributed" line never opens the page: with goals, strategy or lists to show it closes the main
  // column (the cards lead); alone on the tab it stays the one phrase on top
  const quietLast = noneFiled && quietEmpty;
  return CSS + `<section class="gt" data-screen="gtm">${banner}${head}${stack(quietLast ? "" : tiles, noneFiled && !lanes.some((l) => (l.rows || []).length) ? "" : filters, cols(stack(goalsCard, lanesCard, quietLast ? tiles : ""), stack(strategy, follow, lists)))}</section>`;
}
// the words a template's held fields mean (a lane line's title="")
const HOLD_WORD = { expected: "the expected result", actual: "the actual result", proof: "proof", postLink: "the post's link", channel: "the channel", audience: "the audience", outcome: "the outcome", claim: "the claim", experiment: "the experiment" };
// copy: off-screen (a lane line's title="" value)
const laneTitle = (t) => [t.holds && t.holds.filter(Boolean).length ? `needs ${t.holds.filter(Boolean).map((h) => HOLD_WORD[h] || h).join(", ")}` : "", t.proofConcrete ? `proof: ${noDash(t.proofConcrete)}` : ""].filter(Boolean).join(" · ");
const peopleOf = (xs) => [...new Map(xs.filter((x) => x.by).map((x) => [x.by, { name: x.by }])).values()];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return String(iso || ""); const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
