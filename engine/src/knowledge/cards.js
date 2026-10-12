// src/knowledge/cards.js — the card kinds' role rule in SQL (admits, filterRole) for every card reader, and two readers:
// a project's card kinds with their counts (cardKinds: the audit and the importer's validation read it) and each kind's own
// roleVisibility (cardKindRoles). One statement each, memoized per request under "knowledge:".
// Every reader takes `role`: null reads everything (the owner, an internal call); a role reads only the cards its role may
// (schema.js rolesAdmit, in SQL below): the card's own roleVisibility AND its kind's must admit it, so a hidden card is
// absent from every list, count and search, and a hidden kind is absent with all its cards.
import { db } from "../data.js";
import { reqMemo } from "../reqmemo.js";
import { readerKeys } from "../hats.js";

// the role rule in SQL (schema.js rolesAdmit): a list column admits the reader bound at `p` when it is NULL, not a list, an
// empty list, or names one of the reader's keys; a malformed value admits no one. `p` binds the reader's keys as a JSON list
// (filterRole: src/hats.js readerKeys, migrate-044), read with json_each.
export const admits = (col, p) => `(CASE WHEN ${col} IS NULL THEN 1 WHEN NOT json_valid(${col}) THEN 0 WHEN json_array_length(${col}) = 0 THEN 1 ` +
  `ELSE EXISTS (SELECT 1 FROM json_each(${col}) j WHERE j.value IN (SELECT r.value FROM json_each(${p}) r)) END)`;
// every kind the project uses: the kinds its cards carry, counted and labelled from k_card_kinds when declared, and the
// declared kinds that hold no card yet (count 0). ?1 the project, ?2 the role (when filtered).
export const CARD_KINDS_SQL = (filtered) => {
  const c = filtered ? " AND " + admits("c.role_visibility", "?2") : "", k = filtered ? admits("k.role_visibility", "?2") : "";
  return "SELECT g.kind AS key, k.label AS label, g.n AS n FROM (SELECT c.kind AS kind, COUNT(*) AS n FROM k_cards c WHERE c.project = ?1" + c + " GROUP BY c.kind) g " +
    "LEFT JOIN k_card_kinds k ON k.project = ?1 AND k.key = g.kind" + (filtered ? " WHERE " + k : "") + " " +
    "UNION ALL SELECT k.key, k.label, 0 FROM k_card_kinds k WHERE k.project = ?1" + (filtered ? " AND " + k : "") +
    " AND NOT EXISTS (SELECT 1 FROM k_cards c WHERE c.project = ?1 AND c.kind = k.key" + c + ") ORDER BY 1";
};
export const CARD_KIND_ROLES_SQL = "SELECT key, role_visibility FROM k_card_kinds WHERE project = ?";

// what a reader is filtered by: null for the owner and for an internal call (no reader); anyone else, the JSON list of their
// keys (src/hats.js readerKeys: role, the typed role they held before migrate-044, the access hats their admin set)
export const filterRole = (reader) => (reader && reader.role !== "owner" ? JSON.stringify([...readerKeys(reader)]) : null);

// cardKinds(env, project, { role }) -> [{ key, label, count }] in key order
export function cardKinds(env, project, { role = null } = {}) {
  if (!project) return Promise.resolve([]);
  return reqMemo(env, `knowledge:${project}:card-kinds:${JSON.stringify(role)}`, async () =>
    ((await db(env).prepare(CARD_KINDS_SQL(role != null)).bind(...[project, ...(role != null ? [role] : [])]).all()).results || [])
      .map((r) => ({ key: r.key, label: r.label || r.key, count: Number(r.n) || 0 })));
}

// cardKindRoles(env, project) -> Map(kind key -> its roleVisibility list, or null): what a card's kind adds to its own list
export function cardKindRoles(env, project) {
  if (!project) return Promise.resolve(new Map());
  return reqMemo(env, `knowledge:${project}:card-kind-roles`, async () => new Map(
    ((await db(env).prepare(CARD_KIND_ROLES_SQL).bind(project).all()).results || []).map((r) => {
      let roles = null;
      try { const v = JSON.parse(r.role_visibility || "null"); roles = Array.isArray(v) ? v : null; } catch { roles = null; }
      return [r.key, roles];
    })));
}
