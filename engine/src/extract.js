// src/extract.js — EXTRACT, the read direction of the door (sprint 3, B5; docs/plan/MCP.md §4 "Two directions, one
// vocabulary", §5 Find): `search`, `read`, `changes` and `brief`, each ONE read function that its MCP tool, its REST twin and
// its page answer from (src/index.js GET /search, /read, /changes, /brief; src/extractpage.js draws the Library and the
// changes page), and the one cheap count behind every tab's "changed since v N" chip (changedCountFor).
//
// AUTHORITY (every line that decides what a caller sees is marked "authority:"). Every read here runs on the project the
// door already scoped: callTool's projectCallScope (MCP, project:true) or the workspace seam (REST), both core.js
// resolveProject, then project.js projectOf(env) — the same rule read and impact read by: a Partner reads only a
// project they are seated on (a seatless Partner reads none: NO_PROJECT), a seatless member the org's single active project
// only, the owner any active project. Inside the project, docs, cards and card kinds obey their role visibility (the one
// rule: knowledge/store.js visibleTo over schema.js rolesAdmit, knowledge/docs.js mayReadDoc): a hidden doc or card is never
// named, counted, snippeted or linked, and reads as not_found exactly as a missing one. Nothing else in a project is
// role-limited (goals, questions, checks, nodes and contributions are every seated reader's).
//
// FREE TIER (5M rows read a day; a load over 1,500 rows is flagged): no read here scans a table. search reads the FTS5
// index k_find (migrate-056: one project's postings, by the p token) and then only the rows it names, by rowid; changes reads
// the ledger on idx_transmission_project, newest first, LIMIT; read and brief compose the existing one-row and bounded readers.
import { db } from "./data.js";
import { transmissionOneFor, projectSeatsFor } from "./core.js";
import { projectOf, projectSlug } from "./project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { getKnowledge, readKnowledge, visibleTo } from "./knowledge/store.js";
import { KNOWLEDGE_KINDS, KINDS, cardRefOf } from "./knowledge/schema.js";
import { mayReadDoc, docByPath, capsulePath, START_HERE_PATH, cleanPath } from "./knowledge/docs.js";
import { docRecordFor } from "./docread.js";
import { checkById, decodeCheck } from "./knowledge/checks.js";
import { questionRow, openQuestionRowsLite } from "./knowledge/decisions.js";
import { goalTree, aimOf } from "./knowledge/goals.js";
import { rollBudgets } from "./goals.js";
import { versionHead } from "./knowledge/versions.js";
import { dueOf } from "./knowledge/fresh.js";
import { reqMemo } from "./reqmemo.js";
import { impactLines, PROOF_SQL } from "./impact.js";
import { REACH_SQL, dataLinks, refOf, IN_MAX } from "./reach.js";
import { followUpsFor } from "./pickup.js";
import { HAT_KEYS, hatOf } from "./hats.js";
import { decodeShape } from "./shapes.js";
import { isD1Quota, isEvalMark } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { activityAcross } from "./activity.js";

const J = (a) => JSON.stringify(a);
const IN = (n) => `(SELECT value FROM json_each(?${n}))`;
const str = (v) => (v == null ? "" : String(v));
const clamp = (v, d, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : d; };
const rolesOf = (v) => { if (Array.isArray(v)) return v.map(String); try { const a = JSON.parse(v || "null"); return Array.isArray(a) ? a.map(String) : null; } catch { return null; } };
const noTable = (e) => /no such table: k_find|no such module: fts5/i.test(String((e && e.message) || e));
const enc = (s) => encodeURIComponent(String(s));
const pathHref = (p) => orgPath("/doc/") + String(p).split("/").map(encodeURIComponent).join("/");

// ---- the kinds search and read know, in the order a list shows them ----
export const FIND_KINDS = ["goal", "question", "check", "card", "doc", "node", "contribution"];
export const KIND_LABEL = { goal: "Goals", question: "Questions", check: "Checks", card: "Cards", doc: "Docs", node: "Map", contribution: "Contributions" };
// migrate-056's rowid: kind code x 2^40 + the source row's rowid
export const ROWID_SPAN = 1099511627776;
export const KIND_CODE = { goal: 1, question: 2, check: 3, card: 4, doc: 5, node: 6, contribution: 7 };
export const FIND_CAP = 100;        // matches counted per kind; past it the count says "100+" (7 kinds x 101 rowids: at most 707 rows read from the index)
export const SHOW_DEFAULT = 5, SHOW_MAX = 25;
export const WORDS_MAX = 6;
// THE EVAL SWITCH (sprint 3 S3b): the tabs' own (?eval=1, eval: true): include the eval-marked rows the suites and a marked walk
// file; left out by default. authority: it widens no scope — the project is the door's, the role rules stand — so every
// reader may pass it, exactly as every reader may pass ?eval=1 on a tab. The index (k_find) never holds an eval-marked
// contribution, so with the switch on, the project's newest EVAL_RECENT ledger rows are read once (one range of
// idx_transmission_project) and the eval-marked ones among them join the answer.
export const evalOn = (a) => isEvalMark(a && a.eval);
export const EVAL_RECENT = 300;
export const EVAL_RECENT_SQL = "SELECT t.rowid AS r, t.id, t.what, t.why, t.lane, t.kind, t.touches, t.screens, t.components, t.gaprefs, t.goal_ref, t.created_at, t.eval " +
  "FROM transmission t INDEXED BY idx_transmission_project WHERE t.project = ?1 ORDER BY t.created_at DESC LIMIT ?2";
const NOT_FOUND_KINDS = new Set(["knowledge", "grade", "answer", "rank", "round", "publish", "equip"]);
// evalRecent(env, project) -> the project's newest eval-marked contributions (the kinds the index holds, never mind/*)
async function evalRecent(env, project) {
  const rows = (await db(env).prepare(EVAL_RECENT_SQL).bind(project, EVAL_RECENT).all()).results || [];
  return rows.filter((t) => Number(t.eval) === 1 && !NOT_FOUND_KINDS.has(str(t.kind).toLowerCase()) && !/mind\//.test(`${str(t.gaprefs)} ${str(t.components)}`));
}
// withEval(sql, on) -> the same statement with its eval filter dropped when the switch is on
export const withEval = (sql, on) => (on ? sql.replace(/ AND \+?t\.eval = 0/g, "") : sql);
// the FTS rule in words (each searched word is the prefix of a token of the text), for the rows the index does not hold
const tokensOf = (t) => str(t).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const matchesAll = (text, words) => { const toks = tokensOf(text); return words.every((w) => toks.some((x) => x.startsWith(w))); };

// hrefOf(kind, item) -> where the app shows it
export function hrefOf(kind, x) {
  switch (kind) {
    case "goal": return orgPath(`/goals/${enc(x.id)}`);
    case "question": return orgPath(`/question/${enc(x.qid || x.id)}`);
    case "check": { const r = (Array.isArray(x.refs) ? x.refs : rolesOf(x.refs) || []).find((v) => refOf(v) && refOf(v).form === "ref"); return r ? orgPath(`/map?node=${enc(r)}`) : orgPath(`/read?ref=${enc("check/" + x.id)}`); }
    case "card": return orgPath(`/read?ref=card/${enc(x.kind)}/${enc(x.id)}`);   // D2: the card's own page (src/cardpage.js)
    case "doc": return pathHref(x.path);
    case "node": return orgPath(`/map?node=${enc(x.id)}`);
    case "contribution": return orgPath(`/contribution/${enc(x.id)}?page=1`);
    default: return "";
  }
}
// refFor(kind, item) -> the ref `read` takes back
export function refFor(kind, x) {
  switch (kind) {
    case "goal": return `goal/${x.id}`;
    case "question": return `q/${x.qid || x.id}`;
    case "check": return `check/${x.id}`;
    case "card": return `card/${x.kind}/${x.id}`;
    case "doc": return `doc/${x.path}`;
    default: return String(x.id);
  }
}

// ---- the card kinds' own fields, once per request: label, tab, shelf life and who may read the kind (one small statement) ----
export const CARD_KIND_META_SQL = "SELECT key, label, tab, review_after_days, role_visibility FROM k_card_kinds WHERE project = ?1 LIMIT 500";
export function cardKindMeta(env, project) {
  if (!project) return Promise.resolve(new Map());
  return reqMemo(env, `knowledge:${project}:card-kind-meta`, async () => new Map(((await db(env).prepare(CARD_KIND_META_SQL).bind(project).all()).results || [])
    .map((r) => [String(r.key), { label: r.label || r.key, tab: r.tab || null, reviewAfterDays: r.review_after_days ?? null, roles: rolesOf(r.role_visibility) }])));
}
// authority: a card is seen when its own list AND its kind's list admit the reader (store.js visibleTo, the one rule); a doc
// when its list admits them (docs.js mayReadDoc). The owner sees all.
const cardSeen = (reader, card, meta) => visibleTo(reader, "card", { kind: card.kind, roleVisibility: rolesOf(card.role_visibility ?? card.roleVisibility) },
  new Map([[String(card.kind), (meta.get(String(card.kind)) || {}).roles || null]]));
const docSeen = (reader, doc) => mayReadDoc(reader, { roleVisibility: rolesOf(doc.role_visibility ?? doc.roleVisibility) });
const isOwner = (p) => !!p && p.role === "owner";

// ======================================================================================================================
// SEARCH
// ======================================================================================================================
// wordsOf(q) -> the words searched: letters and digits, lowercased, two characters and up, at most WORDS_MAX
export function wordsOf(q) {
  return [...new Set(String(q ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))].slice(0, WORDS_MAX);
}
// the project as ONE token of the index (migrate-056: 'p' || hex(project), SQLite's hex of the UTF-8 bytes, upper case)
export const projectToken = (project) => "p" + [...new TextEncoder().encode(String(project))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
// matchOf(project, words) -> the FTS5 expression: the project's token AND every word as a prefix, in the title or the body
export const matchOf = (project, words) => `p : ${projectToken(project)} AND {title body} : (${words.map((w) => `"${w.replace(/"/g, "")}"*`).join(" AND ")})`;
// one kind's matches, newest first (the highest rowid in its range), at most FIND_CAP + 1: rowids only. The range's binds are
// CAST: D1 binds a JS number as REAL, and FTS5 pushes only an INTEGER rowid bound down into the index; with a REAL one it
// walks every match of every kind and drops the rest (measured locally on saruspay: 3,878 rows read for a kind with no
// match, 0 with the CAST)
export const FIND_SQL = "SELECT rowid AS r FROM k_find WHERE k_find MATCH ?1 AND rowid >= CAST(?2 AS INTEGER) AND rowid < CAST(?3 AS INTEGER) ORDER BY rowid DESC LIMIT ?4";
// the rows a hit names, read back by rowid on their own table, the project checked again (authority: a rowid of another
// project can never come back). One statement per kind; json_each(?2) is the rowids. NOT INDEXED: left to itself the planner
// walks the primary key's (project=?) range and reads every row of the project (3,854 rows for two checks on saruspay);
// without an index it looks each rowid up (two rows read).
export const BACK_SQL = {
  goal: `SELECT rowid AS r, id, title, note AS body, status, updated_at FROM k_goals NOT INDEXED WHERE rowid IN ${IN(2)} AND project = ?1`,
  question: `SELECT rowid AS r, qid, question AS title, status, label, substr(why, 1, 400) AS body, updated_at FROM k_questions NOT INDEXED WHERE rowid IN ${IN(2)} AND project = ?1`,
  check: `SELECT rowid AS r, id, title, then_ AS body, refs, updated_at FROM k_checks NOT INDEXED WHERE rowid IN ${IN(2)} AND project = ?1`,
  card: `SELECT rowid AS r, kind, id, name AS title, status, substr(body_md, 1, 600) AS body, role_visibility, as_of, confidence, updated_at FROM k_cards NOT INDEXED WHERE rowid IN ${IN(2)} AND project = ?1`,
  doc: `SELECT rowid AS r, path, COALESCE(title, path) AS title, substr(body_md, 1, 600) AS body, role_visibility, as_of, confidence, updated_at FROM k_docs NOT INDEXED WHERE rowid IN ${IN(2)} AND project = ?1`,
  node: `SELECT rowid AS r, id, type, name AS title, status, updated_at FROM k_nodes NOT INDEXED WHERE rowid IN ${IN(2)} AND project = ?1`,
  contribution: `SELECT rowid AS r, id, what AS title, substr(why, 1, 400) AS body, lane, kind, created_at AS updated_at FROM transmission NOT INDEXED WHERE rowid IN ${IN(2)} AND project = ?1 AND eval = 0`,
};
// snippetOf(text, words) -> about 160 characters around the first word found, else the text's start
export function snippetOf(text, words) {
  const t = str(text).replace(/[#*_`>|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const low = t.toLowerCase();
  let at = -1;
  for (const w of words) { const i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return t.length > 160 ? t.slice(0, 159).trimEnd() + "…" : t;
  const from = Math.max(0, at - 50), to = Math.min(t.length, at + 110);
  return (from > 0 ? "…" : "") + t.slice(from, to).trim() + (to < t.length ? "…" : "");
}
const inTitle = (title, words) => { const t = str(title).toLowerCase(); return words.every((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(t)); };

// searchAnswer(env, person, a) -> { project, q, words, total, groups: [{ kind, label, count, more, hits }], hits } | refusal.
//   a: { q, kinds?, limit? (hits shown per kind, default 5, max 25) }
// Statements: one batch of one FIND_SQL per kind asked (the index only), then one batch of one BACK_SQL per kind with hits
// (the rows shown, and for a reader the owner is not, every doc and card hit, so a hidden one is never counted), then the
// card kinds' meta (one small statement) when a card is among the hits. Rows read: the rows read back, at most
// kinds x 2 x limit, plus up to FIND_CAP docs and FIND_CAP cards for a non-owner.
export async function searchAnswer(env, person, a = {}) {
  const project = await projectOf(env);
  if (!project) return { error: "project_required", note: "Add `project`: one of your projects (`whoami` lists them)." };
  const words = wordsOf(a.q);
  if (!words.length) return { error: "q_required", project, note: "Send q: the words you are looking for (two letters and up), e.g. {q: \"pricing annual\"}." };
  const want = kindsOf(a.kinds, FIND_KINDS);
  if (want.error) return { ...want, project };
  const limit = clamp(a.limit, SHOW_DEFAULT, SHOW_MAX);
  const expr = matchOf(project, words);
  let found;
  try {
    found = await db(env).batch(want.list.map((k) => db(env).prepare(FIND_SQL).bind(expr, KIND_CODE[k] * ROWID_SPAN, (KIND_CODE[k] + 1) * ROWID_SPAN, FIND_CAP + 1)));
  } catch (e) {
    if (isD1Quota(e)) throw e;
    if (noTable(e)) return { error: "search_unavailable", project, note: "Search's index is not built on this org yet (migrate-056). `read` with a kind lists items meanwhile." };
    throw e;
  }
  const owner = isOwner(person);
  const plan = want.list.map((k, i) => {
    const ids = ((found[i] && found[i].results) || []).map((r) => Number(r.r));
    // authority: for a reader who is not the owner, EVERY doc and card hit is read back, so the count is of what they may read
    const roleLimited = !owner && (k === "doc" || k === "card");
    return { kind: k, ids, read: roleLimited ? ids.slice(0, FIND_CAP) : ids.slice(0, limit * 2), raw: ids.length };
  }).filter((p) => p.ids.length);
  const back = plan.length ? await db(env).batch(plan.map((p) => db(env).prepare(BACK_SQL[p.kind]).bind(project, J(p.read.map((r) => r - KIND_CODE[p.kind] * ROWID_SPAN))))) : [];
  const meta = plan.some((p) => p.kind === "card") ? await cardKindMeta(env, project) : new Map();
  const groups = [];
  plan.forEach((p, i) => {
    let rows = (back[i] && back[i].results) || [];
    if (p.kind === "card") rows = rows.filter((r) => cardSeen(person, r, meta));     // authority
    if (p.kind === "doc") rows = rows.filter((r) => docSeen(person, r));              // authority
    const order = new Map(p.read.map((r, j) => [r - KIND_CODE[p.kind] * ROWID_SPAN, j]));
    const hits = rows.map((r) => hitOf(p.kind, r, words, meta)).sort((x, y) => (y.inTitle - x.inTitle) || (order.get(x._r) - order.get(y._r)));
    // the count: for a role-limited kind read by a non-owner, what they may read among what was read; else the index's count
    const roleLimited = !owner && (p.kind === "doc" || p.kind === "card");
    const count = roleLimited ? hits.length : Math.min(p.raw, FIND_CAP);
    const capped = p.raw > FIND_CAP;
    if (!count) return;
    const shown = hits.slice(0, limit);
    groups.push({ kind: p.kind, label: KIND_LABEL[p.kind], count, more: capped || count > shown.length, ...(capped ? { countNote: `${FIND_CAP}+` } : {}),
      hits: shown.map(({ _r, inTitle: t, ...h }) => h) });
  });
  if (evalOn(a) && want.list.includes("contribution")) {
    // the switch: the eval-marked contributions among the project's newest, matched by the index's own rule
    const extra = (await evalRecent(env, project)).filter((t) => matchesAll([t.what, t.id, t.lane, t.kind, t.touches, t.screens, t.components, t.gaprefs, str(t.why).slice(0, 600)].map(str).join(" "), words))
      .map((t) => hitOf("contribution", { r: t.r, id: t.id, title: t.what, body: str(t.why).slice(0, 400), lane: t.lane, kind: t.kind, updated_at: t.created_at }, words, meta));
    if (extra.length) {
      let g = groups.find((x) => x.kind === "contribution");
      if (!g) { g = { kind: "contribution", label: KIND_LABEL.contribution, count: 0, more: false, hits: [] }; groups.push(g); groups.sort((x, y) => FIND_KINDS.indexOf(x.kind) - FIND_KINDS.indexOf(y.kind)); }
      const all = [...extra.map(({ _r, inTitle: t, ...h }) => h), ...g.hits];
      g.count += extra.length; g.hits = all.slice(0, limit); g.more = g.more || all.length > limit; g.eval = extra.length;
    }
  }
  const total = groups.reduce((n, g) => n + g.count, 0);
  return { project, q: String(a.q ?? "").slice(0, 200), words, total, groups, ...(evalOn(a) ? { eval: true } : {}),
    ...(total ? {} : { note: `Nothing in ${projectSlug(project)} matches ${words.map((w) => `"${w}"`).join(" and ")}. Try fewer or shorter words; what is not filed is not found: file it with preview, then the write tool each item names.` }) };
}
function hitOf(kind, r, words, meta) {
  const item = { kind, id: r.id, qid: r.qid, path: r.path, refs: r.refs };
  const h = { kind, ref: refFor(kind, kind === "card" ? { kind: r.kind, id: r.id } : item), title: str(r.title) || str(r.id || r.qid || r.path),
    snippet: snippetOf(r.body || "", words), href: hrefOf(kind, kind === "card" ? { kind: r.kind, id: r.id } : { ...item, refs: rolesOf(r.refs) }),
    updatedAt: r.updated_at || null, _r: Number(r.r), inTitle: inTitle(r.title, words) ? 1 : 0 };
  if (r.status) h.status = String(r.status);
  if (kind === "node") h.type = r.type;
  if (kind === "contribution") { h.lane = r.lane; h.contribution = r.kind; }
  if (kind === "card" || kind === "doc") {
    if (r.as_of) h.asOf = r.as_of;
    if (r.confidence) h.confidence = r.confidence;
    const m = kind === "card" ? meta.get(String(r.kind)) || {} : {};
    const due = dueOf(r.as_of, m.reviewAfterDays);
    if (due && due.due) h.dueForReview = due.dueOn;
    if (kind === "card") { h.cardKind = r.kind; if (m.label) h.cardKindLabel = m.label; }
  }
  return h;
}
// kindsOf(v, allowed) -> { list } | { error: "unknown_kind", ... }
function kindsOf(v, allowed) {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",") : [];
  const list = [...new Set(raw.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return { list: allowed };
  const bad = list.filter((k) => !allowed.includes(k));
  if (bad.length) return { error: "unknown_kind", kind: bad[0].slice(0, 40), kinds: allowed, note: `kinds is a list of: ${allowed.join(", ")}.` };
  return { list: allowed.filter((k) => list.includes(k)) };
}

// ======================================================================================================================
// READ
// ======================================================================================================================
// parseRef(ref) -> { kind, id } | null: goal/<id> · q/<qid> · check/<id> · card/<kind>/<id> · doc/<path> · T-… · a node id.
// question/<qid> reads as q/<qid> (P3-F, M2's nit: the kind's own word is the form an agent tries first; no other ref form
// starts so, and a node's id names its type before a colon)
export function parseRef(raw) {
  const s = str(raw).trim().slice(0, 400);
  if (!s) return null;
  if (/^goal\/./.test(s)) return { kind: "goal", id: s.slice(5) };
  if (/^q\/./.test(s)) return { kind: "question", id: s.slice(2) };
  if (/^question\/./.test(s)) return { kind: "question", id: s.slice(9) };
  if (/^check\/./.test(s)) return { kind: "check", id: s.slice(6) };
  if (/^card\/[^/]+\/./.test(s)) { const rest = s.slice(5), i = rest.indexOf("/"); return { kind: "card", cardKind: rest.slice(0, i), id: rest.slice(i + 1) }; }
  if (/^doc\/./.test(s)) return { kind: "doc", id: s.slice(4) };
  if (/^T-\d{8}-\d{1,6}$/.test(s)) return { kind: "contribution", id: s };
  const r = refOf(s);
  return r && r.form === "ref" ? { kind: "node", id: s } : null;
}
export const READ_KINDS = [...KNOWLEDGE_KINDS, "contribution"];
// the kinds read by their own key (no ref form): read {kind, ref: <key>}
export const BY_KEY_KINDS = new Set(KNOWLEDGE_KINDS.filter((k) => KINDS[k] && KINDS[k].key.length && !["goal", "question", "check", "card", "doc", "node"].includes(k)));
// refWithKind(ref, kind, cardKind) -> the ref in its full form when the kind says what a bare id is (D2b item 7: read {kind:
// "goal", ref: "beta"} read not_found while ref "goal/beta" worked): goal -> goal/<id>, question -> q/<qid>, check ->
// check/<id>, doc -> doc/<path>, card -> card/<cardKind>/<id>; a ref already in its full form, a node id or a
// contribution id is kept as it is (pure)
const KIND_PREFIX = { goal: "goal/", question: "q/", check: "check/", doc: "doc/" };
export function refWithKind(ref, kind, cardKind) {
  const s = str(ref).trim(), k = str(kind).trim().toLowerCase();
  if (!s || !k) return ref;
  if (KIND_PREFIX[k]) return s.startsWith(KIND_PREFIX[k]) || (k === "question" && s.startsWith("question/")) ? s : KIND_PREFIX[k] + s;
  if (k === "card") return /^card\//.test(s) ? s : str(cardKind).trim() ? `card/${str(cardKind).trim()}/${s}` : s.includes("/") ? `card/${s}` : s;
  return s;
}
export const LIST_DEFAULT = 25, LIST_MAX = 100;
// the project's contributions, newest first, one page: idx_transmission_project walked backwards from the cursor
export const CONTRIB_PAGE_SQL = "SELECT t.id, t.lane, t.kind, t.what, t.route, t.status, t.goal_ref, t.created_at, t.happened_at FROM transmission t INDEXED BY idx_transmission_project " +
  "WHERE t.project = ?1 AND (t.created_at < ?2 OR (t.created_at = ?2 AND t.id < ?3)) AND +t.eval = 0 ORDER BY t.created_at DESC, t.id DESC LIMIT ?4";
const notFound = (project, ref) => ({ error: "not_found", project, ref: str(ref).slice(0, 200), note: `Nothing at "${str(ref).slice(0, 120)}" in ${projectSlug(project)} that you may read. \`search\` finds a ref by its words; \`read\` with a kind lists them.` });

// readAnswer(env, person, a) -> { project, kind, ref, item, links, href } (one item) | { project, kind, items, next, href } (a
// kind's page) | refusal. a: { ref } | { kind, limit?, after?, cardKind? }. Each item is read by the reader that already
// serves it (no new SQL where one exists): the store's getKnowledge, questionRow, checkById, docByPath, transmissionOneFor;
// a node's links are k_node_links (its out links, one row) and the links into it (k_edges on idx_k_edges_to, LIMIT).
export async function readAnswer(env, person, a = {}) {
  const project = await projectOf(env);
  if (!project) return { error: "project_required", note: "Add `project`: one of your projects (`whoami` lists them)." };
  // D5: a kind the ref grammar does not name (edge, render, style, card_kind) reads one item by its key through the
  // store's own one-item read (the role rule inside it)
  const k0 = str(a.kind).trim().toLowerCase();
  if (a.ref != null && str(a.ref).trim() && BY_KEY_KINDS.has(k0)) {
    const one = await readKnowledge(env, { kind: k0, id: str(a.ref).trim(), cardKind: a.cardKind }, person);
    if (one.error) return one;
    return { project, kind: k0, ref: str(a.ref).trim(), item: one.item, ...(one.url ? { url: one.url } : {}), links: [], href: listHref(k0) };
  }
  if (a.ref != null && str(a.ref).trim()) return readOne(env, person, project, refWithKind(a.ref, a.kind, a.cardKind));
  const kind = str(a.kind).trim().toLowerCase();
  if (!kind) return { error: "ref_required", project, note: "Send ref (goal/<id>, q/<qid>, check/<id>, card/<kind>/<id>, doc/<path>, a node id, T-YYYYMMDD-NNN) for one item, or kind for a list." };
  if (!READ_KINDS.includes(kind)) return { error: "unknown_kind", project, kind: kind.slice(0, 40), kinds: READ_KINDS, note: `Name one kind: ${READ_KINDS.join(", ")}.` };
  const limit = clamp(a.limit, LIST_DEFAULT, LIST_MAX);
  if (kind === "contribution") {
    const [at, id] = str(a.after).split("|");
    const rows = (await db(env).prepare(withEval(CONTRIB_PAGE_SQL, evalOn(a))).bind(project, at || "9999", id || "￿", limit + 1).all()).results || [];
    const items = rows.slice(0, limit).map((r) => ({ id: r.id, ref: r.id, lane: r.lane, kind: r.kind, what: r.what, route: r.route, status: r.status, goalRef: r.goal_ref || null, at: r.created_at, happenedAt: r.happened_at || null, href: hrefOf("contribution", r) }));
    const last = items[items.length - 1];
    return { project, kind, items, next: rows.length > limit && last ? `${last.at}|${last.id}` : null, href: orgPath("/build"),
      ...(items.length || a.after ? {} : { note: "No contribution here yet: file one with preview, then file_contribution ({contribution: {lane, what, why}})." }) };
  }
  if (kind === "check") return readChecks(env, person, project, a, limit);
  // authority: the store's list applies the role rule (visibleTo) to docs, cards and card kinds
  const out = await readKnowledge(env, { kind, cursor: a.after, limit, cardKind: a.cardKind, q: a.q, screen: a.screen }, person);
  if (out.error) return out;
  const items = (out.items || []).map((x) => { const ref = kind === "card" ? `card/${x.kind}/${x.id}` : kind === "doc" ? `doc/${x.path}` : ["goal", "check"].includes(kind) ? `${kind}/${x.id}` : kind === "question" ? `q/${x.qid}` : kind === "node" ? x.id : null;
    return ref ? { ...x, ref, href: hrefOf(kind, x) } : x; });
  return { project, kind, items, next: out.next || null, href: listHref(kind),
    ...(out.note ? { note: out.note } : {}) };
}
// ---- a page of checks, each with its latest grade (P3-F, P3 E3: "which checks fail right now?") ----
// read {kind: "check"} carries each check's grade {verdict, gradedAt, stale} (null when ungraded; stale: graded before a change
// of what it names, k_check_stale) and takes status: pass (the latest verdict proven) · fail (refused) · ungraded. Checks are
// every seated reader's (no role rule), so the page reads the register directly, in id order as the store's list does.
// Without status: the store's page, then ONE statement for the page's grades (a probe per check). With status: ONE statement
// over a window of at most CHECK_SCAN checks from the cursor, each with its grade, filtered here; `next` goes on from where the
// window stopped, so a page may hold fewer than limit (rows read: at most about 3 x CHECK_SCAN, whatever the register's size).
const CHECK_STATUSES = ["pass", "fail", "ungraded"];
const VERDICT_OF = { pass: "proven", fail: "refused" };
export const CHECK_SCAN = 250;
const LATEST_GRADE = (col) => `(SELECT x.id FROM check_results x WHERE x.project = ?1 AND x.check_id = ${col} ORDER BY x.graded_at DESC, x.id DESC LIMIT 1)`;
const STALE_OF = (col) => `EXISTS (SELECT 1 FROM k_check_stale s WHERE s.project = ?1 AND s.check_id = ${col})`;
export const CHECK_GRADES_SQL = `SELECT j.value AS id, g.status AS g_status, g.graded_at AS g_at, ${STALE_OF("j.value")} AS g_stale ` +
  `FROM json_each(?2) j LEFT JOIN check_results g ON g.id = ${LATEST_GRADE("j.value")}`;
// binds: project, the cursor (the last id read, "" from the start), the window, the q words (lowercased, "" for none)
// (the join keeps one row per check, so LIMIT is the window)
export const CHECK_WINDOW_SQL = `SELECT t.*, g.status AS g_status, g.graded_at AS g_at, ${STALE_OF("t.id")} AS g_stale ` +
  `FROM k_checks t LEFT JOIN check_results g ON g.id = ${LATEST_GRADE("t.id")} ` +
  "WHERE t.project = ?1 AND t.id > ?2 AND (?4 = '' OR instr(lower(coalesce(t.id, '') || ' ' || coalesce(t.title, '')), ?4) > 0) ORDER BY t.id LIMIT ?3";
const gradeOf = (r) => (r && r.g_status ? { verdict: String(r.g_status), gradedAt: r.g_at || null, stale: Number(r.g_stale) === 1 } : null);
// statusOf(grade) -> "pass" · "fail" · "ungraded", or null for a graded verdict that is neither (incomplete). Pure.
const statusOf = (g) => (!g ? "ungraded" : g.verdict === VERDICT_OF.pass ? "pass" : g.verdict === VERDICT_OF.fail ? "fail" : null);
async function readChecks(env, person, project, a, limit) {
  const st = str(a.status).trim().toLowerCase();
  const want = CHECK_STATUSES.includes(st) ? st : null;
  const ignored = st && !want ? { note: `status is one of ${CHECK_STATUSES.join(", ")}: "${st.slice(0, 40)}" was left out, so every check is listed.` } : {};
  const finish = (items, next) => ({ project, kind: "check", ...(want ? { status: want } : {}), items: items.map((x) => ({ ...x, ref: `check/${x.id}`, href: hrefOf("check", x) })), next, href: listHref("check"), ...ignored });
  if (!want) {
    const out = await readKnowledge(env, { kind: "check", cursor: a.after, limit, q: a.q }, person);
    if (out.error) return out;
    const items = out.items || [];
    const rows = items.length ? (await db(env).prepare(CHECK_GRADES_SQL).bind(project, J(items.map((x) => x.id))).all()).results || [] : [];
    const by = new Map(rows.map((r) => [String(r.id), gradeOf(r)]));
    return { ...finish(items.map((x) => ({ ...x, grade: by.get(String(x.id)) || null })), out.next || null), ...(out.note ? { note: out.note } : {}) };
  }
  const words = str(a.q).trim().toLowerCase().slice(0, 200);
  const rows = (await db(env).prepare(CHECK_WINDOW_SQL).bind(project, str(a.after).trim(), CHECK_SCAN, words).all()).results || [];
  const hits = rows.filter((r) => statusOf(gradeOf(r)) === want);
  const items = hits.slice(0, limit).map((r) => ({ ...decodeCheck(r), grade: gradeOf(r) }));
  // next: past the last item shown when more matched, else past the window when it was full, else the end
  const next = hits.length > limit ? items[items.length - 1].id : rows.length === CHECK_SCAN ? String(rows[rows.length - 1].id) : null;
  return finish(items, next);
}
// F1: the cards a card relies on (its refs, at most 12), read by their primary key with their names and who may read them: one
// statement, at most 12 rows, only for a card that names any
export const CARD_REFS_SQL = "SELECT kind, id, name, role_visibility FROM k_cards WHERE project = ?1 AND (kind, id) IN " +
  "(SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?2))";
// reliesOn(env, person, project, refs, meta) -> [{ ref, title, href }] in the order the card names them; authority: a card the
// reader may not read is left out exactly as a missing one (hidden = missing), so the list never says one exists
async function reliesOn(env, person, project, refs, meta) {
  const want = (Array.isArray(refs) ? refs : []).map(cardRefOf).filter(Boolean);
  if (!want.length) return [];
  const rows = (await db(env).prepare(CARD_REFS_SQL).bind(project, J(want.map((c) => [c.kind, c.id]))).all()).results || [];
  const by = new Map(rows.filter((c) => cardSeen(person, c, meta)).map((c) => [`${c.kind}|${c.id}`, c]));
  return want.filter((c) => by.has(c.key)).map((c) => ({ ref: `card/${c.kind}/${c.id}`, title: str(by.get(c.key).name) || c.id, href: hrefOf("card", c) }));
}
const LIST_HREF = { goal: "/goals", question: "/decisions", check: "/map", node: "/map", edge: "/map", card: "/library", doc: "/library", card_kind: "/library", aim: "/home", gtm: "/gtm", render: "/map/screens", style: "/map/screens" };
// listHref(kind) -> the page that lists a kind, under the reader's org (src/orgpath.js)
const listHref = (kind) => orgPath(LIST_HREF[kind] || orgPath("/library"));

async function readOne(env, person, project, raw) {
  const r = parseRef(raw);
  if (!r) return { error: "bad_ref", project, ref: str(raw).slice(0, 200), note: "A ref is goal/<id>, q/<qid> (or question/<qid>), check/<id>, card/<kind>/<id>, doc/<path>, a node id (screen:<id>, door:<method>:<path>, …) or a contribution id T-YYYYMMDD-NNN." };
  const ref = str(raw).trim();
  switch (r.kind) {
    case "goal": {
      const g = await getKnowledge(env, project, "goal", r.id);
      if (!g) return notFound(project, ref);
      const tree = await goalTree(env, project);
      const links = [...(g.parent ? [{ rel: "parent", ref: `goal/${g.parent}`, title: (tree.find((x) => x.id === g.parent) || {}).title || g.parent, href: hrefOf("goal", { id: g.parent }) }] : []),
        ...tree.filter((x) => x.parent === g.id).slice(0, 50).map((x) => ({ rel: "child", ref: `goal/${x.id}`, title: x.title, href: hrefOf("goal", x) }))];
      return { project, kind: "goal", ref, item: g, links, href: hrefOf("goal", g) };
    }
    case "question": {
      const q = await questionRow(env, project, r.id);
      if (!q) return notFound(project, ref);
      const links = [...(q.affects || []).map((x) => ({ rel: "affects", ref: String(x), href: linkHref(x) })), ...(q.blocks || []).map((x) => ({ rel: "blocks", ref: String(x), href: linkHref(x) })),
        ...(q.supersededBy ? [{ rel: "superseded-by", ref: `q/${q.supersededBy}`, href: hrefOf("question", { qid: q.supersededBy }) }] : [])];
      return { project, kind: "question", ref, item: q, links, href: hrefOf("question", q) };
    }
    case "check": {
      const c = await checkById(env, project, r.id, { grades: 10 });
      if (!c) return notFound(project, ref);
      return { project, kind: "check", ref, item: c, links: (c.refs || []).map((x) => ({ rel: "proves", ref: String(x), href: linkHref(x) })), href: hrefOf("check", c) };
    }
    case "card": {
      const c = await getKnowledge(env, project, "card", `${r.cardKind}|${r.id}`);
      const meta = c ? await cardKindMeta(env, project) : new Map();
      if (!c || !cardSeen(person, { kind: c.kind, roleVisibility: c.roleVisibility }, meta)) return notFound(project, ref);   // authority: hidden = missing
      const m = meta.get(String(c.kind)) || {};
      const due = dueOf(c.asOf, m.reviewAfterDays);
      // F1: the cards it relies on, as links (P3's fault 6: a copy card names the claim that backs it)
      const refs = await reliesOn(env, person, project, c.refs, meta);
      // D2: who may read it is the card's own list AND its kind's (kindRoles: the kind's list, shown on its page)
      return { project, kind: "card", ref, item: { ...c, refs, kindLabel: m.label || null, tab: m.tab || null, kindRoles: m.roles || null, ...(due ? { review: due } : {}) },
        links: [...(m.tab ? [{ rel: "lists-on", ref: m.tab, href: TAB_HREF[m.tab] ? orgPath(TAB_HREF[m.tab]) : orgPath("/library") }] : []), ...refs.map((x) => ({ rel: "relies-on", ...x }))], href: hrefOf("card", c) };
    }
    case "doc": {
      const path = cleanPath(r.id);
      const d = path ? await docByPath(env, project, path) : null;
      // D5: start-here.md always answers — the project's own when the reader may read it, else the built-in
      // guide (src/docread.js docRecordFor, the same rule the Library and brain://doc/start-here.md read by)
      if (path === START_HERE_PATH && (!d || !mayReadDoc(person, d))) {
        const g = await docRecordFor(env, person, START_HERE_PATH);
        return { project, kind: "doc", ref, item: { path: g.path, title: g.title, body: g.body, asOf: g.asOf, confidence: g.confidence, builtIn: !d || !mayReadDoc(person, d) }, links: [], href: pathHref(START_HERE_PATH) };
      }
      if (!d || !mayReadDoc(person, d)) return notFound(project, ref);   // authority: hidden = missing (never "forbidden", which says it exists)
      const due = dueOf(d.asOf);
      return { project, kind: "doc", ref, item: { path: d.path, title: d.title, body: d.body, roleVisibility: d.roleVisibility ?? null, asOf: d.asOf, confidence: d.confidence, updatedAt: d.updatedAt, ...(due ? { review: due } : {}) }, links: [], href: pathHref(d.path) };
    }
    case "contribution": {
      // authority: transmissionOneFor is the reader's own scope (owner · contributor · a seat on its project), AND it must be
      // this project's (a contributor's row in another project reads not_found here)
      const one = await transmissionOneFor(r.id, env, person);
      if (one.error || one.project !== project) return notFound(project, ref);
      const { grade, ...row } = one;
      const csv = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
      const links = [...csv(row.touches).map((x) => ({ rel: "touches", ref: x, href: linkHref(x) })), ...csv(row.screens).map((x) => ({ rel: "screen", ref: /^screen:/.test(x) ? x : `screen:${x}`, href: linkHref(/^screen:/.test(x) ? x : `screen:${x}`) })),
        ...csv(row.components).map((x) => ({ rel: "component", ref: x, href: linkHref(x) })), ...csv(row.gaprefs).map((x) => ({ rel: "addresses", ref: x, href: linkHref(x) })),
        ...(row.goal_ref ? [{ rel: "goal", ref: `goal/${row.goal_ref}`, href: hrefOf("goal", { id: row.goal_ref }) }] : []),
        ...(row.parent ? [{ rel: "parent", ref: row.parent, href: hrefOf("contribution", { id: row.parent }) }] : [])];
      return { project, kind: "contribution", ref, item: { ...row, grade }, links, href: hrefOf("contribution", row) };
    }
    default: {
      const n = await getKnowledge(env, project, "node", r.id);
      if (!n) return notFound(project, ref);
      const [outs, ins] = await db(env).batch([db(env).prepare(REACH_SQL.out).bind(project, J([n.id])), db(env).prepare(REACH_SQL.in).bind(project, J([n.id]))]);
      let out = [];
      try { out = JSON.parse(((outs && outs.results) || [])[0]?.links || "[]"); } catch { out = []; }
      const data = n.data && typeof n.data === "object" ? n.data : {};
      const dl = dataLinks({ dscreens: n.type === "door" && data.screens ? J(data.screens) : null, apis: n.type === "screen" && data.apis ? J(data.apis) : null });
      const inRows = (ins && ins.results) || [];
      const links = [...(Array.isArray(out) ? out : []).filter(Array.isArray).map((l) => ({ rel: String(l[1] || "link"), dir: "out", ref: String(l[0]), href: linkHref(l[0]) })),
        ...dl.map((id) => ({ rel: "calls", dir: "out", ref: id, href: linkHref(id) })),
        ...inRows.slice(0, IN_MAX).map((e) => ({ rel: String(e.kind), dir: "in", ref: String(e.from_id), href: linkHref(e.from_id) }))];
      return { project, kind: "node", ref, item: n, links, ...(inRows.length > IN_MAX ? { linksCapped: `more than ${IN_MAX} links into it; the first ${IN_MAX} are listed` } : {}), href: hrefOf("node", n) };
    }
  }
}
// a tab's route (the registry): every link drawn from it goes through orgPath (sprint 7's review, B2: the Library's "Lists on" and
// MCP read's lists-on link were root paths; tools/check-org-paths.py's registry rule fails an unwrapped read)
const TAB_HREF = { home: "/home", build: "/build", gtm: "/gtm", goals: "/goals", decisions: "/decisions", map: "/map", broadcast: "/broadcast", control: "/control" };
// linkHref(ref) -> where the app shows a ref named in a link (a node, a goal, a question, a check, a contribution)
export function linkHref(raw) {
  const r = parseRef(raw);
  if (!r) return null;
  if (r.kind === "card") return hrefOf("card", { kind: r.cardKind, id: r.id });
  if (r.kind === "doc") return pathHref(r.id);
  if (r.kind === "check") return orgPath(`/read?ref=${enc("check/" + r.id)}`);
  return hrefOf(r.kind, r.kind === "question" ? { qid: r.id } : r.kind === "doc" ? { path: r.id } : { id: r.id });
}

// ======================================================================================================================
// CHANGES
// ======================================================================================================================
export const CHANGES_FETCH = 200;   // ledger rows read at most for one answer (the kinds filter runs on them)
export const CHANGES_DEFAULT = 25, CHANGES_MAX = 100;
export const REACH_FIRST = 3;       // reached ids named per change
export const SINCE_DAYS = 7;        // with no version, the window
// THE ledger read behind `changes`, the changes page and Home's tab chips: the project's rows after a time, newest first, on
// idx_transmission_project (project, created_at) walked backwards; suite rows and R's own mind/* rows left out. Binds: project,
// since, limit.
export const CHANGES_SQL = "SELECT t.id, t.kind, t.lane, t.what, t.touches, t.screens, t.components, t.gaprefs, t.goal_ref, t.shape, t.created_at, t.happened_at, t.submitter, t.route, t.decision " +
  "FROM transmission t INDEXED BY idx_transmission_project WHERE t.project = ?1 AND t.created_at > ?2 AND +t.eval = 0 " +
  "AND (t.gaprefs IS NULL OR t.gaprefs NOT LIKE '%mind/%') AND (t.components IS NULL OR t.components NOT LIKE '%mind/%') ORDER BY t.created_at DESC LIMIT ?3";
// sprint 3 L3 (migrate-061), the What changed PAGE's read: the work and the knowledge writes, never a grade (a grade is a record of
// a check, not a change: the page rolls them into one count, GRADED_SINCE_SQL). Two ranges, each on its own partial index
// (idx_transmission_contrib: every row but a grade or a knowledge write; idx_transmission_knowledge), each the newest ?3, merged
// newest first: a grading run of hundreds never pushes the work out of the window. Binds: project, since, limit. The `changes`
// tool keeps CHANGES_SQL (every row, grades too).
const CHANGES_COLS = "t.id, t.kind, t.lane, t.what, t.touches, t.screens, t.components, t.gaprefs, t.goal_ref, t.shape, t.created_at, t.happened_at, t.submitter, t.route, t.decision";
const NOT_MIND = "AND (t.gaprefs IS NULL OR t.gaprefs NOT LIKE '%mind/%') AND (t.components IS NULL OR t.components NOT LIKE '%mind/%')";
export const CHANGES_WORK_SQL = `SELECT * FROM (SELECT ${CHANGES_COLS} FROM transmission t INDEXED BY idx_transmission_contrib WHERE t.project = ?1 AND t.created_at > ?2 AND COALESCE(t.kind,'') NOT IN ('grade','knowledge') AND +t.eval = 0 ${NOT_MIND} ORDER BY t.created_at DESC LIMIT ?3) ` +
  `UNION ALL SELECT * FROM (SELECT ${CHANGES_COLS} FROM transmission t INDEXED BY idx_transmission_knowledge WHERE t.project = ?1 AND t.created_at > ?2 AND t.kind = 'knowledge' AND +t.eval = 0 ${NOT_MIND} ORDER BY t.created_at DESC LIMIT ?3) ` +
  "ORDER BY created_at DESC LIMIT ?3";
// the grades in the same range, counted, at most GRADED_MAX (the page says "N checks graded", "99+" past it)
export const GRADED_MAX = 99;
export const GRADED_SINCE_SQL = `SELECT COUNT(*) AS n FROM (SELECT 1 FROM transmission t INDEXED BY idx_transmission_project WHERE t.project = ?1 AND t.created_at > ?2 AND +t.eval = 0 AND +t.kind = 'grade' LIMIT ${GRADED_MAX + 1})`;
// the chip's read: the same range, three narrow columns, at most CHIP_MAX + 1 rows
export const CHIP_MAX = 99;
export const CHIP_SQL = "SELECT t.kind, t.lane, t.touches, t.goal_ref FROM transmission t INDEXED BY idx_transmission_project WHERE t.project = ?1 AND t.created_at > ?2 AND +t.eval = 0 " +
  "AND (t.gaprefs IS NULL OR t.gaprefs NOT LIKE '%mind/%') AND (t.components IS NULL OR t.components NOT LIKE '%mind/%') ORDER BY t.created_at DESC LIMIT ?3";
const NAMES_SQL = `SELECT id, name FROM people WHERE id IN ${IN(1)} AND org = {org}`;
// authority: the visibility of the cards and docs a knowledge write names (their primary keys), for a reader who is not the owner
const CARD_VIS_SQL = `SELECT kind, id, role_visibility FROM k_cards WHERE project = ?1 AND (kind, id) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?2))`;
const DOC_VIS_SQL = `SELECT path, role_visibility FROM k_docs WHERE project = ?1 AND path IN ${IN(2)}`;
const TOUCHES_FULL = 30;            // src/knowledge/write.js TOUCHES_MAX: a knowledge row names at most 30 items

// the change kinds and the item kinds a change can carry; a tab's filter is a set of them
export const CHANGE_KINDS = ["contribution", "knowledge", "grade", "ruling", "answer", "version", "broadcast", "goal", "question", "check", "card", "doc", "node", "edge", "render", "style", "aim", "gtm", "card_kind"];
// TAB_KINDS: the kinds each tab shows (null: everything). Cards, docs and card kinds are never in a tab's chip count (a
// role-limited item is never counted where the count cannot filter it); the changes page lists them for who may read them.
export const TAB_KINDS = {
  home: null, control: null,
  build: ["contribution", "grade", "answer", "broadcast"],
  gtm: ["gtm"],
  goals: ["goal"],
  decisions: ["question", "ruling", "answer"],
  map: ["node", "edge", "check", "render", "style", "grade"],
  broadcast: ["broadcast"],
};
export const TABS = Object.keys(TAB_KINDS);
const csvOf = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
// refsOfTouch(t) -> { kind, id } for one knowledge touch ("node:screen:x", "goal:g1", "card:claims|c1", "doc:a/b.md", "aim")
function refOfTouch(t) {
  const m = /^([a-z_]+)(?::(.*))?$/.exec(String(t));
  if (!m) return null;
  return { kind: m[1], id: m[2] == null ? null : m[2] };
}
// classify(row) -> { change, kinds: Set }: what one ledger row is (pure; the chip and the page agree by construction)
export function classify(row) {
  const kind = String(row.kind || "").toLowerCase(), lane = String(row.lane || "").toLowerCase();
  const kinds = new Set();
  const touches = csvOf(row.touches);
  let change;
  if (kind === "knowledge") {
    if (touches.some((t) => /^version:/.test(t))) change = "version";
    else if (/^\S+ ruled [A-Z0-9]+:/.test(String(row.what || ""))) change = "ruling";
    else change = "knowledge";
    for (const t of touches) { const r = refOfTouch(t); if (r && r.kind !== "version") kinds.add(r.kind); }
  } else if (kind === "grade") { change = "grade"; kinds.add("check"); }
  else if (kind === "answer") { change = "answer"; kinds.add("question"); }
  else if (kind === "publish" || kind === "equip" || kind === "item") change = "broadcast";
  else {
    change = "contribution";
    if (lane === "gtm") kinds.add("gtm");
    if (row.goal_ref) kinds.add("goal");
    // a node is named by its typed id (screen:<id>, door:…, table:…): a bare word in touches is an area, not the model
    for (const t of [...touches, ...csvOf(row.screens).map((s) => (/^screen:/.test(s) ? s : "screen:" + s)), ...csvOf(row.components)]) if (NODE_REF.test(t)) kinds.add("node");
    for (const g of csvOf(row.gaprefs)) { const r = refOf(g); if (r && r.form === "question") kinds.add("question"); if (r && r.form === "goal") kinds.add("goal"); }
  }
  kinds.add(change);
  return { change, kinds };
}
const ROLE_KINDS = new Set(["card", "doc", "card_kind"]);
const NODE_REF = /^(screen|door|api|table|entity|flow|dep|gap|lane|surface|service|architecture|evidence):./;
// countable(cls, tabKinds) -> does this row count on that tab's chip (a role-limited item kind never does)
export function countable(cls, want) {
  // authority: a knowledge write that named only role-limited items (cards, docs, card kinds) counts on no tab, so a chip never
  // counts what its reader may not read
  const items = [...cls.kinds].filter((k) => k !== cls.change);
  if (cls.change === "knowledge" && items.length && items.every((k) => ROLE_KINDS.has(k))) return false;
  if (!want) return true;
  for (const k of cls.kinds) if (!ROLE_KINDS.has(k) && want.includes(k)) return true;
  return false;
}
// sinceOf(env, project, since) -> { at, label, version } | { error }
export async function sinceOf(env, project, since, nowMs = Date.now()) {
  const s = str(since).trim();
  if (s) {
    const v = /^v?(\d{1,6})$/i.exec(s);
    if (v) {
      const head = await versionHead(env, project);
      if (head && head.n === Number(v[1])) return { at: head.at, label: `v${head.n}`, version: head.n };
      const row = await db(env).prepare("SELECT n, created_at FROM k_versions WHERE project = ?1 AND n = ?2").bind(project, Number(v[1])).first();
      if (!row) return { error: "unknown_version", note: `No version v${v[1]} in ${projectSlug(project)}: \`versions\` lists them.` };
      return { at: row.created_at, label: `v${row.n}`, version: Number(row.n) };
    }
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return { error: "bad_since", note: "since is an ISO time (2026-10-01 or 2026-10-01T09:00:00Z) or a version (v4)." };
    return { at: new Date(t).toISOString(), label: new Date(t).toISOString().slice(0, 10), version: null };
  }
  const head = await versionHead(env, project);
  if (head && head.at) return { at: head.at, label: `v${head.n}`, version: head.n };
  return { at: new Date(nowMs - SINCE_DAYS * 864e5).toISOString(), label: `the last ${SINCE_DAYS} days`, version: null, noVersion: true };
}
const WORD = { goal: ["goal", "goals"], question: ["question", "questions"], check: ["check", "checks"], card: ["card", "cards"], doc: ["doc", "docs"], node: ["node", "nodes"],
  edge: ["link", "links"], render: ["render", "renders"], style: ["style", "styles"], aim: ["aim", "aims"], gtm: ["GTM template", "GTM templates"], card_kind: ["card kind", "card kinds"] };
const tallyWords = (by) => Object.entries(by).map(([k, n]) => `${n} ${(WORD[k] || [k, k + "s"])[n === 1 ? 0 : 1]}`).join(", ");

// changesAnswer(env, person, a, o) -> { project, since: { at, label, version }, total, more, changes: [...], tab? } | refusal.
//   a: { since?, kinds?, tab?, limit? }. o: { reach: true } (each change's reach; brief turns it off).
// Statements: CHANGES_SQL (one, at most CHANGES_FETCH + 1 rows), the names of who filed them (one, by primary key), for a
// reader who is not the owner the cards and docs the knowledge rows name (at most two, by primary key), and the reach of the
// changes shown that touch the model (impact.js impactLines: one batch of four, five when a screen is touched).
// R2 (sprint 5, P3's F5): the org roll-up — where the org's work is going, by project, in ONE call instead of one per
// project. The caller sees only the projects they may read (the owner: the active ones; a seat: their active seats);
// projects with nothing in the window still answer, at zero. Hardened by the sprint-5 review:
//   · H1 authority: a knowledge write can name only cards or docs a non-owner may not read (the single-project
//     `changes` hides such a row), so for anyone but the owner the roll-up counts NO knowledge writes — knowledge is
//     the owner's column alone, and `latest` is the newest of what was counted;
//   · M1: `since` is an ISO time (a date, or a date and time with Z or an offset), normalised to UTC — anything else is
//     refused (a bare number is a version, which is one project's notion);
//   · M2 the row budget: each project reads at most `cap` of its newest rows in the window, cap = ORG_ROWS_MAX shared across the
//     projects (at least one each, so the sum stays inside ORG_ROWS_MAX for any number of projects); a project whose scan fills it answers capped: true and its counts are a floor
//     ("narrow since").
// Sprint 13 (13.4): the read is ORG_COUNT_SQL, ONE statement a project in ONE batch, each a range of idx_transmission_project
// (project, created_at) walked newest first in the index's own order — as src/activity.js scans for the list. The sprint-5
// shape read every counted row twice in D1's count (2,837 rows on a 6,000-filing org): its contributions' NOT IN list of ten
// kinds is an ephemeral b-tree, probed once a row (ORG_WORK_CASE judges the kind instead). And the LIMIT bounds the rows READ, not the
// rows counted: a suite's row (without eval) or a knowledge write (for anyone but the owner) is scanned and counted out, so
// rows the reader may not see never walk a project's history past its share. Binds: ?1 the project key, ?2 the window's
// start, ?3 1 when knowledge writes count (the owner), ?4 the scan, ?5 1 to count the suites' rows.
// a contribution (the work) is any kind but these ten, judged by one CASE: an IN list of ten builds an ephemeral b-tree whose
// every probe D1 counts as one more row read (the sprint-5 shape's other half of its doubled count)
const ORG_WORK_CASE = "CASE COALESCE(x.kind,'') " + ["knowledge", "grade", "answer", "ruling", "rank", "counter", "critique", "round", "version", "broadcast"]
  .map((k) => `WHEN '${k}' THEN 0 `).join("") + "ELSE 1 END";
export const ORG_COUNT_SQL = "SELECT COUNT(*) AS scanned, COALESCE(SUM(x.m), 0) AS n, " +
  "COALESCE(SUM(CASE WHEN x.m = 0 THEN 0 ELSE " + ORG_WORK_CASE + " END), 0) AS c, " +
  "COALESCE(SUM(CASE WHEN x.m = 1 AND x.kind = 'knowledge' THEN 1 ELSE 0 END), 0) AS k, COALESCE(SUM(CASE WHEN x.m = 1 AND x.kind = 'grade' THEN 1 ELSE 0 END), 0) AS g, " +
  "MAX(CASE WHEN x.m = 1 THEN x.created_at END) AS latest " +
  "FROM (SELECT t.kind, t.created_at, CASE WHEN (?5 = 1 OR t.eval = 0) AND (?3 = 1 OR COALESCE(t.kind,'') <> 'knowledge') THEN 1 ELSE 0 END AS m " +
  "FROM transmission t WHERE t.project = ?1 AND +t.org = {org} AND t.created_at > ?2 ORDER BY t.created_at DESC LIMIT ?4) x";
export const ORG_SINCE_DAYS = 30, ORG_ROWS_MAX = 1000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
async function orgChangesAnswer(env, person, a = {}) {
  const owner = isOwner(person);
  const keys = owner
    ? (((await db(env).prepare("SELECT key FROM projects WHERE active = 1 AND +org = {org} ORDER BY key").all()).results) || []).map((r) => String(r.key))
    : ((await projectSeatsFor(person.id, env)) || []).map((r) => String(r.key));
  if (!keys.length) return { org: true, since: null, byProject: [], total: 0, note: "You hold no seat on an active project: there is nothing to roll up." };
  const raw = str(a.since).trim();
  let at, label;
  if (raw) {
    const ms = ISO_RE.test(raw) ? Date.parse(raw) : NaN;
    if (!Number.isFinite(ms)) return { error: "bad_since", org: true, note: "With org, since is an ISO time (2026-10-01, or 2026-10-01T09:00Z); a version (v4) is one project's. Default: the last 30 days." };
    at = new Date(ms).toISOString(); label = `since ${at}`;
  } else { at = new Date(Date.now() - ORG_SINCE_DAYS * 864e5).toISOString(); label = `the last ${ORG_SINCE_DAYS} days`; }
  const cap = Math.max(1, Math.floor(ORG_ROWS_MAX / keys.length));
  let res = [];
  try { res = await db(env).batch(keys.map((k) => db(env).prepare(ORG_COUNT_SQL).bind(k, at, owner ? 1 : 0, cap, evalOn(a) ? 1 : 0))); }
  catch (e) { if (isD1Quota(e)) throw e; return { error: "unreadable", org: true }; }
  const byProject = keys.map((k, i) => { const g = ((res[i] && res[i].results) || [])[0] || {}; const n = Number(g.n) || 0;
    return { project: k, filings: n, contributions: Number(g.c) || 0, ...(owner ? { knowledge: Number(g.k) || 0 } : {}), grades: Number(g.g) || 0,
      latest: g.latest || null, ...(Number(g.scanned) >= cap ? { capped: true } : {}) }; })
    .sort((x, y) => y.filings - x.filings || (x.project < y.project ? -1 : 1));
  const capped = byProject.some((r) => r.capped);
  return { org: true, since: { at, label }, ...(evalOn(a) ? { eval: true } : {}), byProject, total: byProject.reduce((n, r) => n + r.filings, 0), ...(capped ? { capped: true } : {}),
    note: (owner ? "The window's ledger rows by project (contributions are the work; knowledge and grades counted apart)."
      : "The window's ledger rows by project, in the projects you may read (contributions are the work; grades apart; knowledge writes are the owner's to see).")
      + (capped ? ` A project marked capped read its newest ${cap} rows: its counts are a floor — narrow since.` : "") + " One project's detail: changes {project}." };
}
// sprint 12 (12.5): org with list — the contributions themselves across the projects the caller may read, newest first, each
// with who filed it (their role and hats), its project, lane and state, narrowed by person, lane, state and projects and paged
// by before (src/activity.js activityAcross: the ONE read GET /audit?all=1 draws); since defaults to the org roll-up's window
const isOn = (v) => v === true || v === "true" || v === "1" || v === 1;
async function orgListAnswer(env, person, a) {
  const out = await activityAcross(env, person, { projects: a.projects, person: a.person, lane: a.lane, state: a.state, since: a.since, before: a.before, limit: a.limit, eval: a.eval },
    { sinceDays: ORG_SINCE_DAYS });
  if (out.error) return { ...out, org: true, list: true };
  return { org: true, list: true, ...(evalOn(a) ? { eval: true } : {}), ...out,
    note: (out.note ? out.note + " " : "") + "Each item's state: landed (filed straight through), with (waiting for the owner), decided, needs (owes one more thing). "
      + "door is how it came in (mcp, api, web); client is which AI filed it, as the tool names itself (claude, claude-code, chatgpt, codex, web, api, other; null before sprint 13). " + (out.more ? "More: send before = next. " : "") + "One project's detail: changes {project}." };
}
export async function changesAnswer(env, person, a = {}, o = {}) {
  if (isOn(a.org) && isOn(a.list)) return orgListAnswer(env, person, a);
  if (a.org === true || a.org === "true" || a.org === "1" || a.org === 1) return orgChangesAnswer(env, person, a);
  const project = await projectOf(env);
  if (!project) return { error: "project_required", note: "Add `project`: one of your projects (`whoami` lists them)." };
  const since = await sinceOf(env, project, a.since);
  if (since.error) return { ...since, project };
  const tab = str(a.tab).trim().toLowerCase();
  if (tab && !TABS.includes(tab)) return { error: "unknown_tab", project, tab: tab.slice(0, 40), tabs: TABS, note: `tab is one of: ${TABS.join(", ")}.` };
  const k = kindsOf(a.kinds, CHANGE_KINDS);
  if (k.error) return { ...k, project };
  const want = a.kinds ? k.list : tab ? TAB_KINDS[tab] : null;
  const limit = clamp(a.limit, CHANGES_DEFAULT, CHANGES_MAX);
  // o.work (the What changed page only): the work and the knowledge writes, the grades counted apart (CHANGES_WORK_SQL)
  const [rows, gradedRow] = await Promise.all([
    db(env).prepare(withEval(o.work ? CHANGES_WORK_SQL : CHANGES_SQL, evalOn(a))).bind(project, since.at, CHANGES_FETCH + 1).all().then((x) => x.results || []),
    o.work ? db(env).prepare(withEval(GRADED_SINCE_SQL, evalOn(a))).bind(project, since.at).first() : Promise.resolve(null)]);
  const owner = isOwner(person);
  // the head version's own row is not a change since it
  const own = since.version ? `version:${since.version}` : null;
  let list = rows.slice(0, CHANGES_FETCH).filter((r) => !(own && csvOf(r.touches).includes(own))).map((r) => ({ r, cls: classify(r) }));
  // authority: a reader who is not the owner never sees a card, a doc or a card kind they may not read named in a knowledge row
  const vis = owner ? null : await knowledgeVisFor(env, person, project, list.map(({ r }) => r));
  const shaped = [];
  for (const { r, cls } of list) {
    const c = changeOf(r, cls, vis);
    if (!c) continue;   // authority: a knowledge row that named only what this reader may not read is not listed at all
    if (want && !want.some((w) => c.kinds.includes(w))) continue;
    shaped.push({ c, r });
  }
  const shown = shaped.slice(0, limit);
  const ids = [...new Set(shown.map(({ r }) => r.submitter).filter(Boolean))];
  const names = ids.length ? new Map((((await db(env).prepare(NAMES_SQL).bind(J(ids)).all()) || {}).results || []).map((p) => [String(p.id), p.name])) : new Map();
  // the reach of what touched the model (contributions and knowledge writes naming nodes): one batch for all shown together
  const touching = o.reach === false ? [] : shown.filter(({ c }) => c.kinds.some((k) => k === "node" || k === "render")).map(({ r }) => r);
  // o.reach "touched" (L4, the What changed page: the row budget): what each row changed and the checks to redo, no walk one hop
  // out (the reach is each row's Impact view, read when it is opened); the `changes` tool keeps the whole walk
  const lines = touching.length ? await impactLines(env, project, touching, o.reach === "touched" ? { reach: false } : {}) : new Map();
  const changes = shown.map(({ c, r }) => {
    const l = lines.get(String(r.id));
    return { ...c, by: names.get(String(r.submitter)) || null,
      ...(l && (l.touched.total || l.reached.total) ? { reaches: { touched: l.touched.total, total: l.reached.total, byType: l.reached.byType, first: l.reached.ids.slice(0, REACH_FIRST), toRedo: l.toRedo, line: l.line, href: orgPath(`/contribution/${enc(r.id)}/impact`) } } : {}) };
  });
  const more = shaped.length > limit || rows.length > CHANGES_FETCH;
  return { project, since: { at: since.at, label: since.label, version: since.version }, ...(tab ? { tab } : {}), ...(want ? { kinds: want } : {}), ...(evalOn(a) ? { eval: true } : {}),
    total: shaped.length, ...(rows.length > CHANGES_FETCH ? { totalNote: `${shaped.length}+` } : {}), more, changes,
    ...(o.work ? { graded: { n: Math.min(GRADED_MAX, Number((gradedRow || {}).n) || 0), more: (Number((gradedRow || {}).n) || 0) > GRADED_MAX } } : {}),
    ...(since.noVersion ? { noVersion: `No version of ${projectSlug(project)} yet, so this is the last ${SINCE_DAYS} days. The owner makes v1 with publish_version.` } : {}),
    ...(changes.length ? {} : { note: `Nothing changed in ${projectSlug(project)} since ${since.label}${want ? ` among ${want.join(", ")}` : ""}. A change is filed with preview, then the write tool each item names.` }) };
}
// knowledgeVisFor(env, person, project, rows) -> vis(ref) | null — THE visibility of what knowledge ledger rows name, for a
// reader who is not the owner (null: the owner, who reads everything). A knowledge row's `what` ("3 cards, 1 doc written") and
// its touches are stored once for every reader; a card, a doc or a card kind the reader may not read must never be named or
// counted (D1b item 3: Build and the ledger read showed the stored count). At most three statements, by primary key, and none when
// no row names a card, a doc or a card kind. Used by `changes`, Build and the one-contribution read.
export async function knowledgeVisFor(env, person, project, rows) {
  if (isOwner(person)) return null;
  const cards = new Set(), docs = new Set();
  let kindsNamed = false;
  for (const r of rows || []) if (r && String(r.kind) === "knowledge") for (const t of csvOf(r.touches)) {
    const x = refOfTouch(t);
    if (x && x.kind === "card" && x.id && x.id.includes("|")) cards.add(x.id);
    if (x && x.kind === "doc" && x.id) docs.add(x.id);
    if (x && x.kind === "card_kind") kindsNamed = true;
  }
  if (!cards.size && !docs.size && !kindsNamed) return () => true;
  const meta = cards.size || kindsNamed ? await cardKindMeta(env, project) : new Map();
  const [cr, dr] = await Promise.all([
    cards.size ? db(env).prepare(CARD_VIS_SQL).bind(project, J([...cards].slice(0, 400).map((x) => { const i = x.indexOf("|"); return [x.slice(0, i), x.slice(i + 1)]; }))).all() : { results: [] },
    docs.size ? db(env).prepare(DOC_VIS_SQL).bind(project, J([...docs].slice(0, 400))).all() : { results: [] }]);
  const seenCards = new Set(((cr && cr.results) || []).filter((c) => cardSeen(person, c, meta)).map((c) => `${c.kind}|${c.id}`));
  const seenDocs = new Set(((dr && dr.results) || []).filter((d) => docSeen(person, d)).map((d) => String(d.path)));
  const seenKinds = new Set([...meta].filter(([, m]) => visibleTo(person, "card_kind", { roleVisibility: m.roles })).map(([key]) => key));
  return (x) => (x.kind === "card" ? seenCards.has(x.id) : x.kind === "doc" ? seenDocs.has(x.id) : x.kind === "card_kind" ? seenKinds.has(x.id) : true);
}
// knowledgeRowFor(row, vis) -> { what, touches } as THIS reader may see a ledger row, or null when a knowledge row names
// only what the reader may not read. A row that is not knowledge, or a reader who reads all (vis null), is returned as stored.
// A knowledge row that names a role-limited kind (or any hidden item, or a full touches list) has its tally recounted from
// what the reader may see — never the stored count — and its touches cut to those items.
export function knowledgeRowFor(r, vis) {
  if (!r || String(r.kind) !== "knowledge" || !vis) return { what: r ? r.what : null, touches: r ? r.touches : null };
  const raw = csvOf(r.touches);
  const all = raw.map((t) => ({ t, x: refOfTouch(t) })).filter((y) => y.x);
  const seen = all.filter((y) => y.x.kind === "version" || vis(y.x));
  const items = all.filter((y) => y.x.kind !== "version"), seenItems = seen.filter((y) => y.x.kind !== "version");
  if (items.length && !seenItems.length) return null;
  let what = r.what;
  const ruling = /^\S+ ruled [A-Z0-9]+:/.test(String(r.what || ""));
  if (!ruling && (seenItems.length < items.length || items.some((y) => ROLE_KINDS.has(y.x.kind)) || items.length >= TOUCHES_FULL)) {
    const by = {};
    for (const y of seenItems) by[y.x.kind] = (by[y.x.kind] || 0) + 1;
    what = `${tallyWords(by)} written${items.length >= TOUCHES_FULL ? ", and more in the same write" : ""}`;
  }
  return { what, touches: seen.map((y) => y.t).join(",") };
}
// changeOf(row, cls, vis) -> one change as the answer shows it, or null when nothing in it is visible
function changeOf(r, cls, vis) {
  const knowledge = String(r.kind) === "knowledge";
  let refs = [], what = str(r.what), kinds = [...cls.kinds];
  if (knowledge) {
    const all = csvOf(r.touches).map(refOfTouch).filter(Boolean).filter((x) => x.kind !== "version");
    const seen = vis ? all.filter((x) => vis(x)) : all;
    if (vis && all.length && !seen.length) return null;
    refs = seen.map((x) => ({ kind: x.kind, ref: touchRef(x), href: touchHref(x) }));
    if (vis && (seen.length < all.length || all.some((x) => ROLE_KINDS.has(x.kind)) || all.length >= TOUCHES_FULL) && cls.change === "knowledge") {
      // authority: the stored tally counts every item written; this reader gets the count of what they may read
      const by = {};
      for (const x of seen) by[x.kind] = (by[x.kind] || 0) + 1;
      what = `${tallyWords(by)} written${all.length >= TOUCHES_FULL ? ", and more in the same write" : ""}`;
      kinds = [cls.change, ...new Set(seen.map((x) => x.kind))];
    }
  } else {
    const named = [...csvOf(r.touches), ...csvOf(r.screens).map((s) => (/^screen:/.test(s) ? s : "screen:" + s)), ...csvOf(r.components), ...csvOf(r.gaprefs)];
    refs = [...new Set(named)].slice(0, 30).map((x) => { const p = parseRef(x); return { kind: p ? p.kind : "ref", ref: x, href: linkHref(x) }; });
    if (r.goal_ref) refs.push({ kind: "goal", ref: `goal/${r.goal_ref}`, href: hrefOf("goal", { id: r.goal_ref }) });
  }
  return { id: r.id, change: cls.change, kinds, at: r.created_at, ...(r.happened_at ? { happenedAt: r.happened_at } : {}), lane: r.lane, what, refs,
    ...(cls.change === "contribution" ? { route: r.route, ...(r.decision ? { decision: r.decision } : {}) } : {}), href: hrefOf("contribution", r) };
}
const touchRef = (x) => (x.id == null ? x.kind : x.kind === "node" ? x.id : x.kind === "goal" ? `goal/${x.id}` : x.kind === "question" ? `q/${x.id}` : x.kind === "check" ? `check/${x.id}`
  : x.kind === "card" && x.id.includes("|") ? `card/${x.id.replace("|", "/")}` : x.kind === "doc" ? `doc/${x.id}` : x.kind === "render" ? x.id : `${x.kind}:${x.id}`);
const touchHref = (x) => (x.id == null ? (x.kind === "aim" ? orgPath("/home") : x.kind === "gtm" ? orgPath("/gtm") : null) : x.kind === "render" ? orgPath(`/map/screens?node=${enc(x.id)}`) : linkHref(touchRef(x)));

// changedCountFor(env, reader, tab, head) -> null (no version: no chip) | { n, more, since: "v4", tab, href }: the tab chip's ONE
// statement (CHIP_SQL, at most CHIP_MAX + 1 rows of three narrow columns), classified by the same classify the changes page
// uses. A role-limited item kind is never counted (countable), so the number needs no visibility read.
export async function changedCountFor(env, reader, tab, head) {
  if (!head || !head.at || !TABS.includes(tab)) return null;
  const project = await projectOf(env);
  if (!project) return null;
  return reqMemo(env, `changes:chip:${project}:${head.n}:${tab}`, async () => {
    const rows = (await db(env).prepare(CHIP_SQL).bind(project, head.at, CHIP_MAX + 1).all()).results || [];
    const own = `version:${head.n}`;
    let n = 0;
    for (const r of rows.slice(0, CHIP_MAX)) { if (csvOf(r.touches).includes(own)) continue; if (countable(classify(r), TAB_KINDS[tab])) n++; }
    return { n, more: rows.length > CHIP_MAX, since: `v${head.n}`, tab, href: orgPath(`/changes?tab=${tab}`) };
  });
}

// ======================================================================================================================
// BRIEF
// ======================================================================================================================
// the lanes a hat's goals are measured in (a goal's dimensions are lane keys, src/lanes.js); management reads the top of the
// tree (the root's children) whatever their lanes. quality (the seventh hat, 2026-10-10): code, the work a tester verifies
// (its screens, doors and proof), then ba, the lane every grade files in (src/knowledge/grades.js gradeFilingBody) — a goal
// measured in either is one a tester's grades move or hold up
export const HAT_LANES = { management: null, engineering: ["code", "design"], organization: ["ba", "leader"], gtm: ["gtm"], finance: ["leader", "ba"], partner: ["vendor"], quality: ["code", "ba"] };
// the words that mark a question as waiting on a hat (its who_owes / waiting_on / area name the hat, its label or a lane)
const hatWords = (hat) => { const h = hatOf(hat); return [hat, ...(h ? [h.label.toLowerCase()] : []), ...(HAT_LANES[hat] || [])]; };
export const BRIEF_GOALS = 12, BRIEF_QUESTIONS = 10, BRIEF_CHANGES = 8, BRIEF_CONTRIBS = 6;
// waitsOn(q) -> who an open question waits on, as the brief splits them (P3-F, P3 M2 and M3): "owner" when its whoOwes (else
// its waitingOn) names the owner, an admin or management, or it names nobody; "code" when it is code or build (a scan settles
// it); else the name it waits on: someone else, a blocker the management hat watches but does not owe. Pure.
const OWNER_WORDS = /owner|admin|management/;
const SEVERITY_RANK = { blocker: 0, high: 1, normal: 2 };
export function waitsOn(q) {
  const who = str(q && q.whoOwes).trim() || str(q && q.waitingOn).trim();
  if (!who || OWNER_WORDS.test(who.toLowerCase())) return "owner";
  if (/^(code|build)$/i.test(who)) return "code";
  return who;
}
// the newest contributions naming a ref: the index's own postings for the ref's words in the contribution range (migrate-056
// indexes a contribution's touches, screens, components and gapRefs), read back by rowid and checked for the exact ref
const REF_CONTRIB_SQL = FIND_SQL;
const CONTRIB_BACK_SQL = `SELECT t.rowid AS r, t.id, t.what, t.lane, t.kind, t.touches, t.screens, t.components, t.gaprefs, t.goal_ref, t.created_at FROM transmission t NOT INDEXED WHERE t.rowid IN ${IN(2)} AND t.project = ?1 AND t.eval = 0`;
// on idx_transmission_goalref (goal_ref): the rows naming that goal id (bounded by them), this project's kept
const GOAL_CONTRIBS_SQL = "SELECT t.id, t.what, t.lane, t.kind, t.created_at FROM transmission t INDEXED BY idx_transmission_goalref WHERE t.goal_ref = ?2 AND t.project = ?1 AND t.eval = 0 ORDER BY t.created_at DESC LIMIT ?3";

// briefAnswer(env, person, a) -> the work packet | refusal. a: { for: "<hat>" | a ref }.
export async function briefAnswer(env, person, a = {}) {
  const project = await projectOf(env);
  if (!project) return { error: "project_required", note: "Add `project`: one of your projects (`whoami` lists them)." };
  const f = str(a.for ?? a.ref ?? a.hat).trim();
  if (!f) return { error: "for_required", project, note: `Send for: a hat (${HAT_KEYS.join(", ")}) or a ref (goal/<id>, q/<qid>, check/<id>, a node id, T-YYYYMMDD-NNN).` };
  if (HAT_KEYS.includes(f.toLowerCase())) return hatBrief(env, person, project, f.toLowerCase(), evalOn(a));
  return refBrief(env, person, project, f, evalOn(a));
}
async function hatBrief(env, person, project, hat, includeEval = false) {
  const h = hatOf(hat);
  const lanes = HAT_LANES[hat];
  const [aim, tree, open, head] = await Promise.all([aimOf(env, project), goalTree(env, project), openQuestionRowsLite(env, project), versionHead(env, project)]);
  const root = tree.find((g) => !g.parent);
  // F1 (P3's fault 1): finance reads the goals that carry a budget, each with its own figures and its sum with the goals below
  // it (goals.js rollBudgets over the tree already read: no statement), never goals picked by lane
  const money = hat === "finance" ? rollBudgets(tree) : null;
  const picked = money ? tree.filter((g) => money.get(g.id).own) : lanes ? tree.filter((g) => (g.dimensions || []).some((d) => lanes.includes(String(d)))) : tree.filter((g) => root && g.parent === root.id);
  const goals = picked.slice(0, BRIEF_GOALS).map((g) => ({ ref: `goal/${g.id}`, title: g.title, status: g.status || null, owner: g.owner || null, due: g.due || null, href: hrefOf("goal", g),
    ...(money ? { budget: money.get(g.id).own, budgetSum: money.get(g.id).sum } : {}) }));
  const treeBudget = money && root ? money.get(root.id).sum : null;
  const words = hatWords(hat);
  const waits = (q) => { if (hat === "management") return waitsOn(q) === "owner"; const t = [q.whoOwes, q.waitingOn, q.area].map((x) => str(x).toLowerCase()).join(" "); return words.some((w) => t.includes(w)); };
  const row = (q) => ({ ref: `q/${q.qid}`, question: q.question, severity: q.severity || null, whoOwes: q.whoOwes || null, waitingOn: q.waitingOn || null, blocks: q.blocks || [], href: hrefOf("question", q) });
  const mine = open.filter(waits);
  const questions = mine.slice(0, BRIEF_QUESTIONS).map(row);
  // P3-F (P3 M2): what waits on someone else, and on whom: the open questions naming someone other than the owner or code,
  // the hat's own left out, severity blocker first
  const listed = new Set(mine.map((q) => q.qid));
  const blockers = open.filter((q) => !listed.has(q.qid) && !["owner", "code"].includes(waitsOn(q)))
    .sort((x, y) => (SEVERITY_RANK[x.severity] ?? 3) - (SEVERITY_RANK[y.severity] ?? 3) || String(x.qid).localeCompare(String(y.qid)))
    .slice(0, BRIEF_QUESTIONS).map(row);
  const [follow, changes, capsule] = await Promise.all([
    followUpsFor(env, person, { project, gtmOnly: hat === "gtm", includeEval }),
    // engineering and quality read the Map's changes (nodes, edges, checks, renders and grades: what to build and what to verify)
    changesAnswer(env, person, { tab: hat === "gtm" ? "gtm" : hat === "engineering" || hat === "quality" ? "map" : undefined, limit: BRIEF_CHANGES, eval: includeEval }, { reach: false }),
    docByPath(env, project, capsulePath(hat))]);
  // authority: the hat's capsule is named only when the reader may read it (docs.js mayReadDoc); else start-here
  const start = capsule && mayReadDoc(person, capsule) ? { path: capsule.path, title: capsule.title || capsule.path, href: pathHref(capsule.path) } : { path: START_HERE_PATH, title: "Start here", href: pathHref(START_HERE_PATH) };
  return { project, for: hat, ...(includeEval ? { eval: true } : {}), hat: { key: hat, label: h.label, line: h.line, detail: h.detail },
    aim: aim.text ? { text: aim.text, measure: aim.measure } : null, goals, ...(money ? { budget: treeBudget } : {}), questions, blockers,
    followUps: follow.rows || [], changed: changes.error ? { error: changes.error } : { since: changes.since, total: changes.total, more: changes.more, changes: changes.changes, href: orgPath(`/changes${changes.tab ? `?tab=${changes.tab}` : ""}`) },
    version: head ? { n: head.n, title: head.title, at: head.at } : null, startHere: start,
    ...(aim.text ? {} : { aimNote: "No aim is filed yet: file one with preview, then save_knowledge ({kind: \"aim\", op: \"upsert\", data: {aim}})." }),
    ...(goals.length ? {} : { goalsNote: money ? "No goal carries a budget yet: a goal's budget is {allocated, spent, currency, source} (preview, then save_knowledge, kind \"goal\"; formats {kind: \"goal\"} has an example)." : lanes ? `No goal is measured in ${lanes.join(" or ")} yet: a goal names its lanes in dimensions (preview, then save_knowledge, kind "goal").` : "No goal tree yet: file one with preview, then save_knowledge (kind \"goal\")." }) };
}
async function refBrief(env, person, project, ref, includeEval = false) {
  const one = await readOne(env, person, project, ref);
  if (one.error) return one;
  const out = { project, for: ref, kind: one.kind, item: one.item, href: one.href };
  const dependsOn = [], dependedBy = [];
  for (const l of one.links || []) {
    if (l.dir === "in" || l.rel === "child" || l.rel === "superseded-by") dependedBy.push(l); else dependsOn.push(l);
  }
  out.dependsOn = dependsOn.slice(0, 40);
  out.dependedBy = dependedBy.slice(0, 40);
  // the ids checks and questions name it by: a node by its id, a goal and a question by their bare ids (a check's refs name them so)
  const named = one.kind === "node" ? [one.item.id] : one.kind === "goal" ? [one.item.id, `goal/${one.item.id}`] : one.kind === "question" ? [one.item.qid, `q/${one.item.qid}`] : [];
  const stmts = [];
  if (named.length) {
    stmts.push(["checks", db(env).prepare(PROOF_SQL).bind(project, J(named))]);
    stmts.push(["asks", db(env).prepare(REACH_SQL.asks).bind(project, J(named))]);
  }
  // the newest contributions naming it
  // the ref's tokens in order, every one (a phrase must be contiguous: never deduplicated, never shortened)
  const words = one.kind === "contribution" ? [] : String(one.kind === "node" ? one.item.id : one.kind === "question" ? `q ${one.item.qid}` : one.kind === "check" ? `check ${one.item.id}` : "")
    .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 16);
  if (one.kind === "goal") stmts.push(["goalContribs", db(env).prepare(withEval(GOAL_CONTRIBS_SQL, includeEval)).bind(project, one.item.id, BRIEF_CONTRIBS)]);
  else if (words.length) stmts.push(["contribIds", db(env).prepare(REF_CONTRIB_SQL).bind(`p : ${projectToken(project)} AND body : "${words.join(" ")}"`, 7 * ROWID_SPAN, 8 * ROWID_SPAN, BRIEF_CONTRIBS * 4)]);
  let res = [];
  try { res = stmts.length ? await db(env).batch(stmts.map(([, s]) => s)) : []; }
  catch (e) { if (isD1Quota(e) || !noTable(e)) throw e; res = stmts.map(() => ({ results: [] })); }
  const got = Object.fromEntries(stmts.map(([k], i) => [k, (res[i] && res[i].results) || []]));
  if (one.kind === "check") out.checks = [{ id: one.item.id, title: one.item.title, grade: one.item.grade, grades: (one.item.grades || []).slice(0, 5) }];
  else out.checks = (got.checks || []).map((c) => ({ id: c.id, title: c.title, verdict: c.status || null, gradedAt: c.graded_at || null, ref: `check/${c.id}` }));
  out.questions = (got.asks || []).map((q) => ({ ref: `q/${q.qid}`, question: q.question, href: hrefOf("question", q) }));
  let contribs = got.goalContribs || [];
  if (got.contribIds && got.contribIds.length) {
    const back = (await db(env).prepare(CONTRIB_BACK_SQL).bind(project, J(got.contribIds.map((r) => Number(r.r) - 7 * ROWID_SPAN))).all()).results || [];
    const want = new Set([ref, one.kind === "node" ? one.item.id : null, one.kind === "question" ? `q/${one.item.qid}` : null, one.kind === "check" ? `check:${one.item.id}` : null].filter(Boolean));
    const bare = one.kind === "node" && /^screen:/.test(one.item.id) ? one.item.id.slice(7) : null;
    contribs = back.filter((t) => [...csvOf(t.touches), ...csvOf(t.screens), ...csvOf(t.components), ...csvOf(t.gaprefs)].some((x) => want.has(x) || (bare && x === bare)))
      .sort((x, y) => (String(y.created_at) > String(x.created_at) ? 1 : -1)).slice(0, BRIEF_CONTRIBS);
  }
  if (includeEval && one.kind !== "goal" && one.kind !== "contribution") {
    // the switch: the eval-marked contributions among the project's newest that name it exactly
    const want = new Set([ref, one.kind === "node" ? one.item.id : null, one.kind === "question" ? `q/${one.item.qid}` : null, one.kind === "check" ? `check:${one.item.id}` : null].filter(Boolean));
    const bare = one.kind === "node" && /^screen:/.test(one.item.id) ? one.item.id.slice(7) : null;
    const extra = (await evalRecent(env, project)).filter((t) => [...csvOf(t.touches), ...csvOf(t.screens), ...csvOf(t.components), ...csvOf(t.gaprefs)].some((x) => want.has(x) || (bare && x === bare)));
    contribs = [...contribs, ...extra].sort((x, y) => (String(y.created_at) > String(x.created_at) ? 1 : -1)).slice(0, BRIEF_CONTRIBS);
  }
  if (one.kind === "contribution") contribs = [];
  out.contributions = contribs.map((t) => ({ id: t.id, what: t.what, lane: t.lane, kind: t.kind, at: t.created_at, href: hrefOf("contribution", t) }));
  if (one.kind === "contribution") { const sh = decodeShape(one.item.shape); out.next = one.item.next || sh.next || null; }
  if (includeEval) out.eval = true;
  return out;
}

// ======================================================================================================================
// THE LIBRARY (the page): docs and cards by kind, each with its confidence, as-of date and due-for-review mark
// ======================================================================================================================
export const LIB_DOCS_MAX = 300, LIB_CARDS_MAX = 600, LIB_PER_KIND = 12;
export const LIB_DOCS_SQL = `SELECT path, title, role_visibility, as_of, confidence, updated_at FROM k_docs WHERE project = ?1 ORDER BY path LIMIT ${LIB_DOCS_MAX + 1}`;
export const LIB_CARDS_SQL = `SELECT kind, id, name, status, role_visibility, as_of, confidence, updated_at FROM k_cards WHERE project = ?1 ORDER BY kind, id LIMIT ${LIB_CARDS_MAX + 1}`;
// libraryRead(env, person, { kind }) -> { project, docs: [...], kinds: [{ key, label, tab, tabHref, count, cards, more }], capped }:
// three statements (the docs, the cards, the card kinds), every row filtered by the reader's visibility before it is counted
export async function libraryRead(env, person, o = {}) {
  const project = await projectOf(env);
  if (!project) return { error: "project_required", note: "Add `project`: one of your projects (`whoami` lists them)." };
  const [dr, cr, meta] = await Promise.all([db(env).prepare(LIB_DOCS_SQL).bind(project).all(), db(env).prepare(LIB_CARDS_SQL).bind(project).all(), cardKindMeta(env, project)]);
  const docRows = (dr.results || []);
  // authority: a doc or card the reader may not read is dropped before anything is counted
  const docs = docRows.slice(0, LIB_DOCS_MAX).filter((d) => docSeen(person, d)).map((d) => { const due = dueOf(d.as_of);
    return { ref: `doc/${d.path}`, path: d.path, title: d.title || d.path, asOf: d.as_of || null, confidence: d.confidence || null, updatedAt: d.updated_at || null, ...(due && due.due ? { dueForReview: due.dueOn } : {}), href: pathHref(d.path) }; });
  const cardRows = (cr.results || []);
  const byKind = new Map();
  for (const c of cardRows.slice(0, LIB_CARDS_MAX)) {
    if (!cardSeen(person, c, meta)) continue;
    const m = meta.get(String(c.kind)) || {};
    const due = dueOf(c.as_of, m.reviewAfterDays);
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind).push({ ref: `card/${c.kind}/${c.id}`, kind: c.kind, id: c.id, name: c.name, status: c.status || null, asOf: c.as_of || null, confidence: c.confidence || null, updatedAt: c.updated_at || null,
      ...(due && due.due ? { dueForReview: due.dueOn } : {}), href: hrefOf("card", c) });
  }
  const want = str(o.kind).trim();
  const kinds = [...byKind].map(([key, list]) => { const m = meta.get(String(key)) || {};
    return { key, label: m.label || key, tab: m.tab || null, tabHref: m.tab && TAB_HREF[m.tab] ? orgPath(TAB_HREF[m.tab]) : null, count: list.length, due: list.filter((x) => x.dueForReview).length,
      cards: want === key ? list : list.slice(0, LIB_PER_KIND), more: want === key ? false : list.length > LIB_PER_KIND, href: orgPath(`/library?kind=${enc(key)}`) }; });
  return { project, docs, kinds, ...(want ? { kind: want } : {}), capped: docRows.length > LIB_DOCS_MAX || cardRows.length > LIB_CARDS_MAX,
    dueForReview: docs.filter((d) => d.dueForReview).length + kinds.reduce((n, k) => n + k.due, 0) };
}
