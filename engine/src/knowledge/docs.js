// src/knowledge/docs.js — the typed readers for a project's docs (k_docs): the library's list, one doc by its path, and who
// may read it. `read` (docs), `brief` (a role's brief), the start-here read, their REST twins (GET /library, /doc/*,
// GET /brief?role=) and the brain://doc resources all read here. A role's brief is a doc at capsules/<name>.md. One statement each,
// memoized per request under "knowledge:" (the write door forgets it).
import { db } from "../data.js";
import { reqMemo } from "../reqmemo.js";
import { mayRead } from "../core.js";
import { orgPath } from "../orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "../project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key

export const START_HERE_PATH = "start-here.md";
export const CAPSULE_PREFIX = "capsules/";
export const DOC_LIST_MAX = 500;
// the list reads no body: path, title and who may read it, in path order
export const DOC_LIST_SQL = `SELECT path, title, role_visibility FROM k_docs WHERE project = ? ORDER BY path LIMIT ${DOC_LIST_MAX}`;
export const DOC_SQL = "SELECT path, title, body_md, role_visibility, updated_at, as_of, confidence FROM k_docs WHERE project = ? AND path = ?";

const rolesOf = (v) => { try { const a = JSON.parse(v || "null"); return Array.isArray(a) ? a.map(String) : null; } catch { return null; } };
export const capsulePath = (name) => CAPSULE_PREFIX + String(name) + ".md";
export const capsuleNameOf = (path) => { const p = String(path || ""); return p.startsWith(CAPSULE_PREFIX) && p.endsWith(".md") && !p.slice(CAPSULE_PREFIX.length).includes("/") ? p.slice(CAPSULE_PREFIX.length, -3) : null; };
// cleanPath(p) -> a doc path as a caller may send it (a leading "/" dropped, no "..")
export const cleanPath = (p) => String(p ?? "").trim().replace(/\.\./g, "").replace(/^\/+/, "").slice(0, 200);

// mayReadDoc(person, doc) — the capsule read rule (core.js mayRead) over a doc's roleVisibility: the owner reads every doc;
// anyone else a doc that names no role, or one that names theirs. The project scope already required a seat.
export function mayReadDoc(person, doc) {
  const roles = doc && Array.isArray(doc.roleVisibility) ? doc.roleVisibility : null;
  if (!person) return false;
  if (person.role === "owner" || !roles || !roles.length) return true;
  return roles.some((r) => mayRead(person, r));
}

// docList(env, project) -> [{ path, title, roleVisibility }] in path order ([] with no project)
export function docList(env, project) {
  if (!project) return Promise.resolve([]);
  return reqMemo(env, `knowledge:${project}:doc-list`, async () =>
    ((await db(env).prepare(DOC_LIST_SQL).bind(project).all()).results || []).map((r) => ({ path: r.path, title: r.title ?? null, roleVisibility: rolesOf(r.role_visibility) })));
}

// docByPath(env, project, path) -> { path, title, body, roleVisibility, updatedAt, asOf, confidence } | null (asOf and
// confidence: migrate-047, sprint 3 B1)
export function docByPath(env, project, path) {
  const p = cleanPath(path);
  if (!project || !p) return Promise.resolve(null);
  return reqMemo(env, `knowledge:${project}:doc:${p}`, async () => {
    const r = await db(env).prepare(DOC_SQL).bind(project, p).first();
    return r ? { path: r.path, title: r.title ?? null, body: r.body_md ?? "", roleVisibility: rolesOf(r.role_visibility), updatedAt: r.updated_at ?? null, asOf: r.as_of ?? null, confidence: r.confidence ?? null } : null;
  });
}

// the GTM strategy (the one-pass fix 9: docs under gtm/ show on the GTM tab, as the registry's doc `shows` says, and stay in the
// Library): ONE bounded read, a range of the primary key (project, path) over the gtm/ paths alone ('gtm0' is the first
// string after every 'gtm/…'), no body; who may read each is checked by mayReadDoc on the way out (the rows read are the same).
export const GTM_STRATEGY_MAX = 50;
export const GTM_STRATEGY_SQL = `SELECT path, title, role_visibility, as_of, confidence, updated_at FROM k_docs WHERE project = ?1 AND path >= 'gtm/' AND path < 'gtm0' ORDER BY path LIMIT ${GTM_STRATEGY_MAX + 1}`;
// gtmStrategy(env, project, reader) -> { docs: [{ path, title, asOf, confidence, updatedAt, href }], more } (a doc the reader
// may not read is left out, never named)
export async function gtmStrategy(env, project, reader) {
  if (!project) return { docs: [], more: false };
  const rows = (await db(env).prepare(GTM_STRATEGY_SQL).bind(project).all()).results || [];
  const docs = rows.slice(0, GTM_STRATEGY_MAX).map((r) => ({ path: r.path, title: r.title ?? null, roleVisibility: rolesOf(r.role_visibility), asOf: r.as_of ?? null, confidence: r.confidence ?? null, updatedAt: r.updated_at ?? null }))
    .filter((d) => mayReadDoc(reader, d)).map(({ roleVisibility, ...d }) => ({ ...d, href: orgPath("/doc/") + d.path.split("/").map(encodeURIComponent).join("/") }));
  return { docs, more: rows.length > GTM_STRATEGY_MAX };
}

// the empty state every doc read names
export const docFillNote = (project, path) =>
  `File it through preview then save_knowledge: preview {project: "${(project && projectSlug(project)) || "<your project>"}", items: [{kind: "doc", op: "upsert", data: {path: "${path || "<a path, e.g. guides/setup.md>"}", title: "<its title>", body: "<the doc, in markdown>"}}]}.`;
