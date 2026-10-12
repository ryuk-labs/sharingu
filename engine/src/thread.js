// thread.js — YOUR THREAD (R-PRD-ONE-MIND WP5, M-ADR-041). One ordered list of everything between this
// person and sharingu, newest first: what you answered, the rulings on your contributions, what you sent and reported,
// your open items, and — for the owner — what is waiting on you. Every item wears ONE tempo word (src/tempo.js,
// derived never typed); an open item wears `in`.
//
// One seam: threadFor(person, env, opts) is the RUNTIME READ both doors call (GET /updates, JSON only, and the MCP
// `updates` tool — the same list, the same count). The thread PAGE and its `only` filter (the Build tab's Queue view)
// are retired (Q893B08A5, UI-B4b); the tool stays (start-here names it, guardrail 4). The open items are the heartbeat's
// own read, passed in (opts.openLoops: src/updates.js), never read twice; suite rows (eval=1) are excluded unless
// opts.includeEval; the engine's own namespace (mind/*) never shows (src/hotsql.js notMind, M-ADR-012).
// D5L: every region is a window read newest first with the answer's `limit` in the SQL (src/hotsql.js THREAD_*_SQL), so a
// read costs about `limit` rows a region, never the person's whole ledger or the owner's whole queue.

import { db } from "./data.js";
import { projectScopeOf } from "./project.js";
import { THREAD_YOURS_SQL, THREAD_WAITING_SQL, THREAD_REPORTS_SQL, THREAD_QUESTIONS_SQL } from "./hotsql.js";
import { tempoOf } from "./tempo.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const THREAD_MAX = 200;
export const THREAD_DETAIL_MAX = 160;
// the item shape both doors answer (declared in contracts/door.declared.json as `updates`)
export const THREAD_ITEM_FIELDS = ["at", "kind", "title", "detail", "tempo", "href", "id"];
export const THREAD_ITEM_OPTIONAL = ["card"];
// kind -> the reader's word (WP1 vocabulary: contribution · report · open item — never the ledger's nouns)
export const THREAD_KINDS = {
  answered: "you answered",
  ruled: "ruled",
  sent: "you sent",
  report: "you reported",
  question: "you asked",
  open: "open item",
  waiting: "waiting on you",
};

const CARD_PREFIX = /^(?:[A-Z]+[0-9]+[a-z]?|Q[0-9A-F]{8})\s+—\s+/;   // "/respond" writes what = "<card or board qid> — <answer>" (UI-B2: "<qid> — A: <option>"); the id never shows as text
const VERDICT_WORD = { approve: "approved", reject: "declined", "needs-work": "sent back — needs one more thing" };

const clip = (s, n = THREAD_DETAIL_MAX) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const toMs = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; };
// B7d S4b: which project a row landed in rides at the END of `detail` (never a new item field — THREAD_ITEM_FIELDS is
// the declared shape). The text before it is clipped to leave room, so the project always shows.
export const withProject = (text, project) => {
  const p = project ? String(project) : "";
  if (!p) return clip(text);
  const head = clip(text, Math.max(20, THREAD_DETAIL_MAX - p.length - 3));
  return head ? `${head} · ${p}` : p;
};
const cardOf = (gaprefs) => { const m = /(?:^|,)\s*q\/([^,\s]+)/.exec(String(gaprefs || "")); return m ? m[1] : null; };

// threadFor(person, env, opts) -> { count, items }  · opts = { includeEval, ownerName, servedStamp, limit, openLoops }
// openLoops: the person's open items as the heartbeat read them ([{id, title, since}], or a promise of them)
export async function threadFor(person, env, opts) {
  const o = opts || {};
  const includeEval = !!o.includeEval;
  const limit = Math.max(1, Math.min(THREAD_MAX, Number(o.limit) || THREAD_MAX));
  const tctx = { ownerName: o.ownerName };
  const stamp = o.servedStamp || null;
  const tempo = (row) => tempoOf(row, stamp, tctx);
  const items = [];

  // The reads, newest first, each bounded by `limit`. Wave one: your filings with the rulings on them, your reports, your
  // questions. Wave two (the owner): what waits on your ruling, only as far back as the oldest of your filings when that list
  // is full — the answer is the newest `limit` items, and `limit` filings at least as new already fill it.
  // rowsOr([]) — a D1 read whose ANY failure (sync or async) reads as no rows, each region keeping its own fallback
  const rowsOr = (f) => Promise.resolve().then(f).then((r) => r.results || []).catch(() => []);
  const [loops, txs, reports, questions] = await Promise.all([
    Promise.resolve(o.openLoops || []).catch(() => []),
    rowsOr(() => db(env).prepare(THREAD_YOURS_SQL(includeEval)).bind(person.id, limit).all()),
    rowsOr(() => db(env).prepare(THREAD_REPORTS_SQL(includeEval)).bind(person.id, limit).all()),
    // W9 (B7a): the questions this person asked (events kind unknown — the `ask` tool, POST /ask)
    rowsOr(() => db(env).prepare(THREAD_QUESTIONS_SQL(includeEval)).bind(person.id, limit).all()),
  ]);
  const since = txs.length >= limit ? txs[txs.length - 1].created_at : null;
  // D7: the owner's queue in the request's scope (projectScopeOf), never the raw session stamp; read newest first, listed
  // oldest first as before (equal times keep their order)
  const waiting = person.role !== "owner" ? [] : (await rowsOr(async () => {
    const sc = await projectScopeOf(env);
    const args = [...(since ? [since] : []), ...(sc && sc.filter === "eq" ? [sc.project] : [])];
    const stmt = db(env).prepare(THREAD_WAITING_SQL(includeEval, sc && sc.filter, since, limit));
    return await (args.length ? stmt.bind(...args) : stmt).all();
  })).reverse();

  // 1 · open items · what waits on the owner
  for (const l of Array.isArray(loops) ? loops : []) {
    items.push({ at: l.since || null, kind: "open", title: l.title || "—", detail: "", tempo: "in", href: l.card ? orgPath("/decisions") : null, ...(l.card ? { card: l.card } : {}), id: l.id });
  }
  for (const r of waiting) {
    items.push({ at: r.created_at || null, kind: "waiting", title: r.what || "—", detail: clip(`by ${r.by_name || "—"} · ${r.lane || "—"} · ${r.kind || "—"}`),
      tempo: tempo({ route: "owner", status: "open" }), href: orgPath(`/contribution/${encodeURIComponent(r.id)}?page=1`), id: r.id });
  }

  // 2 · your contributions (answers + everything else) — this person's rows, suite rows out unless asked, mind/* out
  const txTitle = new Map();
  for (const t of txs) {
    const href = orgPath(`/contribution/${encodeURIComponent(t.id)}?page=1`);
    if (t.kind === "answer") {
      const card = cardOf(t.gaprefs);
      const title = clip(String(t.what || "").replace(CARD_PREFIX, ""), 80) || "an answer";
      txTitle.set(t.id, title);
      items.push({ at: t.created_at, kind: "answered", title, detail: withProject(String(t.what || "").replace(CARD_PREFIX, ""), t.project), tempo: tempo(t), href, ...(card ? { card } : {}), id: t.id });
    } else {
      const title = clip(t.what, 120) || "a contribution";
      txTitle.set(t.id, title);
      items.push({ at: t.created_at, kind: "sent", title, detail: clip([t.lane, t.kind, t.project].filter(Boolean).join(" · ")), tempo: tempo(t), href, id: t.id });
    }
  }

  // 3 · rulings on your contributions — the immutable approval_audit rows on the filings listed above
  for (const t of txs) {
    let rulings = []; try { rulings = JSON.parse(t.rulings_json || "[]") || []; } catch { rulings = []; }
    for (const a of Array.isArray(rulings) ? rulings : []) {
      const word = VERDICT_WORD[String(a.verdict || "").toLowerCase()] || String(a.verdict || "ruled");
      items.push({ at: a.created_at, kind: "ruled", title: `${word} — ${txTitle.get(t.id) || "your contribution"}`, detail: clip(a.note ? `${a.by || "the owner"}: ${a.note}` : `by ${a.by || "the owner"}`),
        tempo: tempo({ route: t.route, decision: a.verdict, decided_at: a.created_at, created_at: t.created_at, components: t.components, screens: t.screens }),
        href: orgPath(`/contribution/${encodeURIComponent(t.id)}?page=1`), id: a.id });
    }
  }

  // 4 · your reports — the exit events (the report's counts, in words). W10 (B7a): ONE id — the item carries the
  // handoff's own id (the id wrap_up answered with), and the report's summary is its title.
  for (const r of reports) {
    let pl = {}; try { pl = JSON.parse(r.payload_json || "{}") || {}; } catch { pl = {}; }
    const c = pl.counts || {};
    const n = (k) => Number(c[k]) || 0;
    const parts = [`${n("decisions")} decision${n("decisions") === 1 ? "" : "s"}`, `${n("answers")} answer${n("answers") === 1 ? "" : "s"}`, `${n("open")} still open`];
    if (n("filedAnswers")) parts.push(`${n("filedAnswers")} filed on cards`);
    if (typeof pl.project === "string" && pl.project) parts.push(pl.project);   // B7d S4b: which project it landed in
    items.push({ at: r.created_at, kind: "report", title: clip(pl.summary, 120) || "a report", detail: clip(parts.join(" · ")), tempo: "in", href: null,
      id: typeof pl.handoffId === "string" && pl.handoffId ? pl.handoffId : r.id });
  }

  // 5 · the questions you asked — each waits "with <owner>" (W9, B7a)
  for (const q of questions) {
    let pl = {}; try { pl = JSON.parse(q.payload_json || "{}") || {}; } catch { pl = {}; }
    const said = pl.what || pl.question || pl.q || pl.claim || "";
    items.push({ at: q.created_at, kind: "question", title: clip(said, 120) || "a question", detail: clip(pl.about || ""),
      tempo: `with ${o.ownerName || "the owner"}`, href: null, id: q.id });
  }

  // newest first; undated items after every dated one, in the order they were read
  const dated = items.filter((x) => toMs(x.at) != null).sort((a, b) => toMs(b.at) - toMs(a.at));
  const undated = items.filter((x) => toMs(x.at) == null).map((x) => ({ ...x, at: null }));
  const list = dated.concat(undated).slice(0, limit);
  return { count: list.length, items: list };
}
