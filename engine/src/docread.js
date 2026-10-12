// src/docread.js — the project's docs as a reader reads them (moved out of src/mcp.js in D5): the start-here guide (the
// project's own doc at start-here.md, else the built-in text, never a 404), the Library's list, one doc by its path and a
// role's brief (the doc capsules/<role>.md). `read` {ref: "doc/<path>"} and `brief` (src/extract.js, src/mcp.js), the
// Library and doc pages (GET /library, GET /doc/:path) and brain://doc/ all answer from these, over the request's project's
// k_docs, under the one role rule (knowledge/docs.js mayReadDoc): a doc the reader may not read is not_found, as a missing one.
import { db } from "./data.js";
import { dueOf } from "./knowledge/fresh.js";
import { briefKeysOf } from "./hats.js";
import { homeProjectOf } from "./core.js";
import { projectOf, projectSlug } from "./project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { getTenantConfig, resolveOwner, ownerName } from "./tenant.js";
import { startHereText } from "./starthere.js";
import { START_HERE_PATH, docList, docByPath, mayReadDoc, cleanPath, capsulePath, capsuleNameOf, docFillNote } from "./knowledge/docs.js";

// START_HERE_DOC — the ONE name of the newcomer's first read: it always exists (the project's own doc, else the built-in text)
export const START_HERE_DOC = START_HERE_PATH;
// startHereDoc(env, tenant, person) — the start-here text: the request's project's own doc at start-here.md (k_docs), when the
// person may read it, else the built-in one (never a 404).
async function startHereDoc(env, tenant, person) {
  const project = await projectOf(env);
  const own = project ? await docByPath(env, project, START_HERE_DOC) : null;
  if (own && String(own.body || "").trim() && (!person || mayReadDoc(person, own))) return own.body;
  let owner = null; try { owner = ownerName(await resolveOwner(env)); } catch { owner = null; }
  // B7d S1: the org's declared home project feeds the SAME org-note sentence whoami's gloss renders (orgNoteDefault)
  // B7e C5: with its own name from the projects table (never typed) — the same name whoami's gloss reads off the seats
  const home = homeProjectOf(tenant);
  let homeName = null;
  if (home) { try { const r = await db(env).prepare("SELECT name FROM projects WHERE key = ? AND active = 1 AND org = {org}").bind(home).first(); homeName = (r && r.name) || null; } catch { homeName = null; } }
  return startHereText({ org: tenant && tenant.brand && tenant.brand.org, engine: tenant && tenant.brand && tenant.brand.engine, owner, home, homeName });
}
// libraryDocs(keys) — PURE: the library's list, start-here FIRST (always, published or built-in), the rest sorted.
export function libraryDocs(keys) {
  const rest = [...new Set((keys || []).filter((k) => k && k !== START_HERE_DOC))].sort();
  return [START_HERE_DOC, ...rest];
}

// ---- the docs: `read` {ref: "doc/<path>"}, `brief` (a role's), the Library and doc pages (GET /library, /doc/*) and the
// brain://doc resources all answer from these, over the request's project's k_docs ----
// libraryFor(env, person) -> { project, startHere, note, docs: [paths the person may read, start-here first], titles, empty? }
export async function libraryFor(env, person) {
  const project = await projectOf(env);
  const docs = (await docList(env, project)).filter((d) => mayReadDoc(person, d));
  // sprint 3 B4: the docs due for review (their asOf older than the default shelf life), named so an agent re-checks them
  const due = docs.filter((d) => { const x = dueOf(d.asOf); return x && x.due; }).map((d) => d.path);
  return { project, startHere: START_HERE_DOC, note: `Read ${START_HERE_DOC} first: call \`read\` with ref "doc/${START_HERE_DOC}".`,
    docs: libraryDocs(docs.map((d) => d.path)), titles: Object.fromEntries(docs.filter((d) => d.title).map((d) => [d.path, d.title])), ...(due.length ? { dueForReview: due } : {}),
    ...(docs.length ? {} : { empty: `No doc is filed for this project yet (start-here.md is the built-in guide). ${docFillNote(project)}` }) };
}
// docFor(env, person, path, tenantOf) -> the doc's markdown, or { error: path_required | not_found, note } (a hidden doc is not_found)
export async function docFor(env, person, path, tenantOf = () => getTenantConfig(env)) {
  const r = await docRecordFor(env, person, path, tenantOf);
  return r.error ? r : r.body;
}
// docRecordFor(env, person, path, tenantOf) -> { path, title, body, asOf, confidence } (the doc page's read, sprint 3 B1), or
// the same refusals as docFor: the same rules, start-here's built-in fallback included
export async function docRecordFor(env, person, path, tenantOf = () => getTenantConfig(env)) {
  const rel = cleanPath(path);
  if (!rel) return { error: "path_required", note: `Send a doc's path: \`read\` {kind: "doc"} lists them; "${START_HERE_DOC}" is the place to start.` };
  const project = await projectOf(env);
  if (rel === START_HERE_DOC) {
    const own = project ? await docByPath(env, project, START_HERE_DOC) : null;
    const body = await startHereDoc(env, await tenantOf(), person);
    const mine = own && String(own.body || "").trim() && (!person || mayReadDoc(person, own));
    return { path: START_HERE_DOC, title: (mine && own.title) || "Start here", body, asOf: mine ? own.asOf : null, confidence: mine ? own.confidence : null };
  }
  const d = await docByPath(env, project, rel);
  // D1b item 2: a doc the reader may not read answers EXACTLY as a doc that is not there (as \`read\` does, src/extract.js):
  // "forbidden" said it exists, and to whom it is open
  if (!d || !mayReadDoc(person, d)) return { error: "not_found", doc: rel, project, note: `No doc at "${rel}". \`read\` {kind: "doc"} lists them; "${START_HERE_DOC}" is the place to start. ${docFillNote(project, rel)}` };
  // sprint 3 B4, stale by age: a doc takes the default shelf life (src/knowledge/fresh.js)
  const due = dueOf(d.asOf);
  return { path: d.path, title: d.title, body: d.body, asOf: d.asOf, confidence: d.confidence, ...(due ? { review: { due: due.due, dueOn: due.dueOn, days: due.days } } : {}) };
}
// roleBriefFor(env, person, role) -> { path, title, body } of a role's brief (the doc capsules/<role>.md), or { error:
// unknown_brief, briefs?, note } (one the reader may not read is unknown, D1b item 2). No role: the person's own: the first the project holds among their typed label,
// the access hats their admin set (migrate-045; never their own hats) and their role (src/hats.js briefKeysOf); the owner's is
// capsules/owner.md, else the project's first. Naming a role reads its brief under its roleVisibility, as before.
export async function roleBriefFor(env, person, role) {
  const project = await projectOf(env);
  let want = String(role ?? "").trim().slice(0, 80);
  let d = null;
  if (!want && person.role === "owner") {
    d = await docByPath(env, project, capsulePath("owner"));
    if (!d) { const first = (await docList(env, project)).find((x) => capsuleNameOf(x.path)); want = first ? capsuleNameOf(first.path) : "owner"; }
    else want = "owner";
  }
  if (!want) {
    // the first of the person's brief keys the project holds: one lookup when the first is there, the doc list otherwise
    const keys = briefKeysOf(person);
    want = keys[0] || String(person.role || "");
    d = await docByPath(env, project, capsulePath(want));
    if (!d && keys.length > 1) {
      const held = new Set((await docList(env, project)).map((x) => capsuleNameOf(x.path)).filter(Boolean));
      const hit = keys.slice(1).find((k) => held.has(k));
      if (hit) { want = hit; d = await docByPath(env, project, capsulePath(want)); }
    }
  }
  if (!d) d = await docByPath(env, project, capsulePath(want));
  // D1b item 2: a brief the reader may not read answers as one that is not filed (never "forbidden", which says it exists)
  if (d && !mayReadDoc(person, d)) d = null;
  if (!d) {
    const readable = (await docList(env, project)).filter((x) => capsuleNameOf(x.path) && mayReadDoc(person, x)).map((x) => capsuleNameOf(x.path));
    return { error: "unknown_brief", role: want, project, briefs: readable,
      note: readable.length ? `No brief for "${want}" in ${projectSlug(project)}: send \`role\` as one of \`briefs\`.` : `No role's brief is filed for this project yet. ${docFillNote(project, capsulePath(want || "<role>"))}` };
  }
  return { role: want, path: d.path, title: d.title || d.path, body: d.body };
}
