// src/knowledge/store.js — the ONE read module for project knowledge: every page, read tool and REST twin reads the
// knowledge tables through it. The generic readers below are built from the registry (src/knowledge/schema.js); the typed
// readers a screen needs (the goal tree, the decision rows, the canvas) are added here as each page moves onto D1. Every
// read is one project's, and memoized per request (src/reqmemo.js) under "knowledge:", which the write door forgets.
import { db } from "../data.js";
import { KINDS, KNOWLEDGE_KINDS, decodeRow, keyString, ROLE_LIMITED, rolesAdmit, cardRefOf } from "./schema.js";
import { cardKindRoles } from "./cards.js";
import { reqMemo } from "../reqmemo.js";
import { projectOf, projectSlug } from "../project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { renderUrl } from "../render.js";

export const LIST_LIMIT = 50;
export const LIST_MAX = 200;

// a question's options ride on its row as one JSON array (each with its idx; decodeRow orders them, A first)
const OPTIONS_COL = "(SELECT json_group_array(json_object('idx', o.idx, 'what', o.what, 'tradeoff', o.tradeoff)) " +
  "FROM k_options o WHERE o.project = t.project AND o.qid = t.qid) AS options_json";
// selectSql(kind) -> "SELECT … FROM <table> t WHERE t.project = ?": the one row shape every reader and the write door read
export const selectSql = (kind) => `SELECT t.*${kind === "question" ? ", " + OPTIONS_COL : ""} FROM ${KINDS[kind].table} t WHERE t.project = ?`;

const limitOf = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, LIST_MAX) : LIST_LIMIT; };
const text = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

// A list page stays small whatever the items hold (a free-plan request gets about 10 ms of CPU, and the MCP reply is
// pretty-printed): a keyed kind's unbounded text — a column the registry lets grow past LIST_TEXT_MAX: a doc's or a card's
// body, a node's data — is left out and its size said instead (`bodyBytes`, `dataBytes`: its UTF-8 bytes, null when
// empty); read one item by its id for it whole (getKnowledge). Same rows read as before: the size is a column of the row.
export const LIST_TEXT_MAX = 20000;
const AUDIT_COLS = ["created_by", "created_at", "updated_by", "updated_at"];
const NUMERIC = new Set(["int", "real", "bool"]);
export const listOmitted = (kind) => (KINDS[kind].key.length ? KINDS[kind].cols.filter((c) => !NUMERIC.has(c.t) && (c.bytes || c.max > LIST_TEXT_MAX)) : []);

// listKnowledge(env, project, kind, { q, cursor, limit, cardKind, screen }) -> { items, next }: one page in key order. q
// matches a substring (any case) of the kind's id and title/name/question fields; cursor is the last item's key (read
// `next`: a composite key's parts are joined with "|"); cardKind narrows cards to one kind, screen renders to one screen
// (the index rows only: a render's body is in R2, read one by its id for its URL).
export function listKnowledge(env, project, kind, o = {}) {
  const spec = KINDS[kind];
  const q = text(o.q) ? text(o.q).toLowerCase().slice(0, 200) : null;
  const cursor = text(o.cursor), limit = limitOf(o.limit);
  const cardKind = kind === "card" ? text(o.cardKind) : null;
  const screen = kind === "render" ? text(o.screen) : null;
  return reqMemo(env, `knowledge:${project}:${kind}:list:${JSON.stringify([q, cursor, limit, cardKind, screen])}`, async () => {
    const keys = spec.key.map((c) => "t." + c.c);
    const omitted = listOmitted(kind), shown = spec.cols.filter((c) => !omitted.includes(c));
    const cols = [...shown.map((c) => "t." + c.c), ...AUDIT_COLS.map((c) => "t." + c), ...omitted.map((c) => `length(CAST(t.${c.c} AS BLOB)) AS ${c.c}__bytes`),
      ...(kind === "question" ? [OPTIONS_COL] : [])];
    let sql = `SELECT ${cols.join(", ")} FROM ${spec.table} t WHERE t.project = ?`;
    const args = [project];
    if (cardKind) { sql += " AND t.kind = ?"; args.push(cardKind); }
    if (screen) { sql += " AND t.screen = ?"; args.push(screen.slice(0, 200)); }
    if (q && spec.search.length) { sql += ` AND instr(lower(${spec.search.map((c) => `coalesce(t.${c}, '')`).join(" || ' ' || ")}), ?) > 0`; args.push(q); }
    if (cursor && keys.length) {
      const parts = keys.length === 1 ? [cursor] : cursor.split("|");
      if (parts.length === keys.length) {
        sql += keys.length === 1 ? ` AND ${keys[0]} > ?` : ` AND (${keys.join(", ")}) > (${keys.map(() => "?").join(", ")})`;
        args.push(...parts);
      }
    }
    if (keys.length) sql += ` ORDER BY ${keys.join(", ")}`;
    sql += " LIMIT ?";
    args.push(limit + 1);
    const rows = (await db(env).prepare(sql).bind(...args).all()).results || [];
    const items = rows.slice(0, limit).map((r) => {
      const item = decodeRow(kind, r);
      for (const c of omitted) { delete item[c.f]; item[c.f + "Bytes"] = r[c.c + "__bytes"] == null ? null : Number(r[c.c + "__bytes"]); }
      return item;
    });
    return { items, next: rows.length > limit && keys.length ? keyString(kind, items[items.length - 1]) : null };
  });
}

// getKnowledge(env, project, kind, id, { cardKind }) -> the item, or null. id is the item's key (a composite key's parts
// joined with "|"); the aim and the GTM template have none. A card is named by "kind|id", or by id with cardKind (by id
// alone, the first of its kinds).
export function getKnowledge(env, project, kind, id, o = {}) {
  const spec = KINDS[kind];
  const cardKind = kind === "card" ? text(o.cardKind) : null;
  return reqMemo(env, `knowledge:${project}:${kind}:get:${JSON.stringify([id ?? null, cardKind])}`, async () => {
    let sql = selectSql(kind);
    const args = [project];
    if (spec.key.length) {
      const raw = String(id ?? "");
      const parts = cardKind && !raw.includes("|") ? [cardKind, raw] : spec.key.length === 1 ? [raw] : raw.split("|");
      // a key part left out takes its default (a render named by its screen alone is its "" state's "" variant)
      while (parts.length < spec.key.length && spec.key[parts.length].keyDef !== undefined) parts.push(spec.key[parts.length].keyDef);
      if (kind === "card" && parts.length === 1) { sql += " AND t.id = ? ORDER BY t.kind LIMIT 1"; args.push(parts[0]); }
      else if (parts.length !== spec.key.length) return null;
      else { sql += spec.key.map((c) => ` AND t.${c.c} = ?`).join(""); args.push(...parts); }
    }
    const r = await db(env).prepare(sql).bind(...args).first();
    return r ? decodeRow(kind, r) : null;
  });
}

// readKnowledge(env, a) — read and GET /read (?kind= / ?ref=), on the project the door already scoped
// (project.js projectOf): { kind, id?, q?, cursor?, limit?, cardKind? } -> { project, kind, item } with an id, else
// { project, kind, items, next }.
// A doc, a card and a card kind may carry roleVisibility (a list of roles), read by the ONE role rule (schema.js rolesAdmit,
// the rule `read`, `brief`, `search` and the write door apply): the owner reads everything; any other reader only an
// item whose list is absent, empty or names their role — and a card only when its kind's list admits them too (kindRoles:
// src/knowledge/cards.js cardKindRoles). Without a reader (an internal call) nothing is filtered. A hidden item reads as
// not_found, never as forbidden, and is absent from every list.
export const visibleTo = (reader, kind, item, kindRoles = null) => {
  if (!reader || reader.role === "owner" || !ROLE_LIMITED.has(kind)) return true;
  if (!rolesAdmit(reader, item && item.roleVisibility)) return false;
  return kind !== "card" || rolesAdmit(reader, kindRoles ? kindRoles.get(item.kind) : null);
};
// a listed card's refs name only cards this reader may read — the same rule the card's own read applies through
// extract.js reliesOn (F1, hidden = missing; sprint-4 review, H2: the raw list leaked a hidden card's kind and id). One
// statement for the page (the named cards by their primary key); a hidden or missing ref is left out, so a list never
// says one exists. Owners and internal calls read refs as stored (visibleTo admits them whole).
const REF_CARDS_SQL = "SELECT kind, id, role_visibility FROM k_cards WHERE project = ?1 AND (kind, id) IN " +
  "(SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?2))";
const rolesOf = (v) => { try { const a = JSON.parse(v || "null"); return Array.isArray(a) ? a.map(String) : null; } catch { return null; } };
async function seenCardRefs(env, project, items, reader, kindRoles) {
  const want = new Map();
  for (const it of items) for (const r of (Array.isArray(it.refs) ? it.refs : [])) { const c = cardRefOf(r); if (c) want.set(c.key, c); }
  if (!want.size) return items;
  const rows = (await db(env).prepare(REF_CARDS_SQL).bind(project, JSON.stringify([...want.values()].map((c) => [c.kind, c.id]))).all()).results || [];
  const seen = new Set(rows.filter((c) => visibleTo(reader, "card", { kind: String(c.kind), roleVisibility: rolesOf(c.role_visibility) }, kindRoles)).map((c) => `${c.kind}|${c.id}`));
  return items.map((it) => (Array.isArray(it.refs) && it.refs.length
    ? { ...it, refs: it.refs.filter((r) => { const c = cardRefOf(r); return c && seen.has(c.key); }) } : it));
}
export async function readKnowledge(env, a = {}, reader = null) {
  const kind = String(a.kind ?? "").trim().toLowerCase();
  if (!KINDS[kind]) return { error: "unknown_kind", kind: kind.slice(0, 40), kinds: KNOWLEDGE_KINDS, note: `Name one kind: ${KNOWLEDGE_KINDS.join(", ")}.` };
  const project = await projectOf(env);
  if (!project) return { error: "project_required", note: "Add `project`: one of your projects (`whoami` lists them)." };
  // a card's kind's list binds it too: read once (one small statement), only when a non-owner reads cards
  const kindRoles = kind === "card" && reader && reader.role !== "owner" ? await cardKindRoles(env, project) : null;
  const id = text(a.id);
  if (id && KINDS[kind].key.length) {
    const item = await getKnowledge(env, project, kind, id.slice(0, 400), { cardKind: a.cardKind });
    if (!(item && visibleTo(reader, kind, item, kindRoles))) {
      return { error: "not_found", project, kind, id: id.slice(0, 120), note: `No ${kind} "${id.slice(0, 120)}" in ${projectSlug(project)}: read {kind: "${kind}"} lists what is there.` };
    }
    // a render's body: its URL (GET /render/:hash, sandboxed), naming its style's hash so the answer is cacheable for good
    if (kind === "render") {
      const st = item.style ? await db(env).prepare("SELECT hash FROM k_styles WHERE project = ? AND id = ?").bind(project, item.style).first() : null;
      return { project, kind, item, url: renderUrl(project, item.hash, st ? st.hash : null) };
    }
    return { project, kind, item };
  }
  const page = await listKnowledge(env, project, kind, { q: a.q, cursor: a.cursor, limit: a.limit, cardKind: a.cardKind, screen: a.screen });
  let items = page.items.filter((x) => visibleTo(reader, kind, x, kindRoles));
  if (kind === "card" && reader && reader.role !== "owner") items = await seenCardRefs(env, project, items, reader, kindRoles);
  const next = page.next;
  const empty = !items.length && !text(a.q) && !text(a.cursor);
  const noun = KINDS[kind].noun[KINDS[kind].key.length ? 1 : 0];
  return { project, kind, items, next, ...(empty ? { note: `No ${noun} here yet: file one through preview then file, an item {kind: "${kind}", op: "upsert", data: {…}} (\`formats\` with kind shows its fields).` } : {}) };
}
