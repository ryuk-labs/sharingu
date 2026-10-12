// src/project.js — THE one project rule: which project a request reads, found once at the door, carried on the request.
//  1. A NAMED project (?project= on a GET, `project` on a tool or a brain:// URI) is read only by a caller holding a seat on it,
//     or by the owner when it is ACTIVE; anything else is refused project_forbidden and nothing is read (doorProject).
//  2. Unnamed: the caller's active project (a live session stamp, or their one seat: core.js activeProjectOf).
//  3. Else the first project the caller may read in key order (the owner: every active project; others: their seats).
//  4. A non-owner seated nowhere gets no project: in an org of several active projects that reads the org-level rows only
//     (`project IS NULL`); in an org of ONE active project it reads that project, EXCEPT a Partner, who then reads no
//     project in any org (the fence, NO_PROJECT).
//  5. The answer rides the request's env under PROJECT (never a binding); projectOf(env) reads it back for every reader.
//  6. A write's stamp is doorProject's (core.js): this rule never widens who may write where.
// Who resolves it: the workspace seam (src/index.js routeRequest), callTool and resources/read (src/mcp.js), serveRender.
import { doorProject, activeProjectOf, activeKeysOnce, projectArg, orgProjectsOnce, isPartnerReader } from "./core.js";
import { PROJECT_KEY_RE } from "./knowledge/schema.js";
import { HOME_ORG, readerOrg } from "./data.js";

// PROJECT — the request's resolved project key (a string), or null at the org root: set by resolveProject's env only.
// Symbol.for so a selftest reads it by name; object spread carries it through every env copy of the request.
export const PROJECT = Symbol.for("sharingu.project");
// NO_PROJECT — the Partner fence's mark (rule 4): resolveProject puts it on a Partner's env when it scoped them to no project
// (seated on no ACTIVE project), so projectScopeOf answers no project whatever the org's population.
export const NO_PROJECT = Symbol.for("sharingu.noproject");

// ---- THE KEY RULE (sprint 6, 6.1; PLATFORM.md §2 item 1): a project's key carries its org, as a repository's name carries
// its owner. A key is `o<org>--<slug>` (`o2--web`) for every org but HOME_ORG; HOME_ORG's keys are its bare slugs, so the
// keys every project already had (the six live ones among them) stay valid and resolve to org 1 — nothing is rekeyed. The
// slug a person types is unique inside its org (migrate-067's index on projects(org, slug)) and never holds "--", so the
// two forms never meet (HOME_ORG: src/tenant.js); every key stays inside the form the door already checks (PROJECT_KEY_RE:
// a-z, 0-9, dashes, 2 to 40 characters). migrate-067.sql's generated columns projects.org and projects.slug are the SQL twin of orgOfKey
// (tools/project-rule-selftest.mjs proves the two agree key by key).
const ORG_KEY = /^o([1-9][0-9]*)--(.+)$/;
// orgOfKey(key) -> { org, slug } | null (not a key): `o<org>--<slug>` names its org (never org 1: that one is bare); any
// other key is HOME_ORG's, its slug the key itself
export function orgOfKey(key) {
  if (typeof key !== "string" || !PROJECT_KEY_RE.test(key)) return null;
  const m = ORG_KEY.exec(key);
  const org = m ? Number(m[1]) : HOME_ORG;
  return m && org !== HOME_ORG && Number.isSafeInteger(org) ? { org, slug: m[2] } : { org: HOME_ORG, slug: key };
}
// projectSlug(key) -> the project's slug, the most of its key a person ever reads (sprint 12, 12.6): `o3--sharingu` reads
// `sharingu`; org 1's bare keys are their slugs. A screen names a project by its NAME; this is the fallback when no name is
// at hand, never the org-prefixed key itself
export function projectSlug(key) {
  const k = orgOfKey(key);
  return k ? k.slug : String(key ?? "");
}
// projectWords(name, key) -> a project as a sentence names it (sprint 13, 13.2): its name, with its slug when the two differ
// ("Pilot shop (shop)"; "Sample" alone for sample), else the slug — never the org-prefixed key (`o2--shop`), which is the door's
// data, not a person's word
export function projectWords(name, key) {
  const slug = projectSlug(key), n = String(name || "").trim();
  return n && n.toLowerCase() !== slug ? `${n} (${slug})` : n || slug;
}
// projectKeyOf(org, slug) -> the key of slug in org, or null: the slug is a-z, 0-9 and single dashes (never "--"), and the
// key it makes fits the key form (2 to 40 characters, so another org's slug is shorter by its `o<org>--` prefix)
export function projectKeyOf(org, slug) {
  if (!Number.isSafeInteger(org) || org < 1 || typeof slug !== "string" || slug.includes("--") || !PROJECT_KEY_RE.test(slug)) return null;
  const key = org === HOME_ORG ? slug : `o${org}--${slug}`;
  return PROJECT_KEY_RE.test(key) ? key : null;
}

// keyInOrg(org, want) -> the key `want` names inside `org` (sprint 6, 6.2: THE one rule that finds a project resolves a slug
// inside the reader's org only; `org` is src/data.js readerOrg, never a caller's). A bare slug in another org than HOME_ORG is
// that org's key (projectKeyOf); a key already of that org is itself; HOME_ORG's bare keys are its own, unchanged. Anything else
// (another org's key, a string that is not a key) is returned as typed: every lookup of it is in the reader's org
// (`org = {org}`), so it finds nothing and is refused there, as an unknown project always was. No org (no sign-in): as typed.
export function keyInOrg(org, want) {
  if (!Number.isSafeInteger(org) || org < 1 || typeof want !== "string" || !want) return want;
  const k = orgOfKey(want);
  if (!k || org === HOME_ORG || k.org !== HOME_ORG) return want;
  return projectKeyOf(org, want) || want;
}

// scopedProjectOf(env) -> the project resolveProject put on this env, or null (no fallback: the org root, or not scoped)
export function scopedProjectOf(env) {
  const p = env ? env[PROJECT] : null;
  return typeof p === "string" && p ? p : null;
}
// inProject(env, project) -> the env a read of `project` runs on (null: the org root). The same env when it already reads it.
export function inProject(env, project) {
  const p = project || null;
  return scopedProjectOf(env) === p ? env : { ...env, [PROJECT]: p };
}

// projectScopeOf(env) -> { project, filter: "eq" | "null" | "none" } — the rule as the filter a ledger read applies:
//   * a resolved project -> "eq": `project = ?` bound to it;
//   * a Partner fenced to no project (NO_PROJECT) -> "null": the org-level rows only, in any org;
//   * no resolved project in an org of more than one ACTIVE project -> "null" (the seam scoped the request and the caller is
//     seated nowhere and not the owner), never org-wide;
//   * no resolved project in an org of ONE active project -> "eq" on it (the MCP twin scopes every seated caller and the
//     owner to that one project, so the REST read the seam did not scope reads the same rows);
//   * no active project at all (a project-less org) -> "none": no filter.
// The keys come from the request and the projects table (core.js orgProjectsOnce: one memo the seam reads too), never typed.
export async function projectScopeOf(env) {
  const p = scopedProjectOf(env);
  if (p) return { project: p, filter: "eq" };
  if (env && env[NO_PROJECT]) return { project: null, filter: "null" };
  const active = await orgProjectsOnce(env);
  if (active.length > 1) return { project: null, filter: "null" };
  if (active.length === 1) return { project: active[0], filter: "eq" };
  return { project: null, filter: "none" };
}
// projectOf(env) -> the project key a request's read answers, or null (the org level): THE one read of the rule.
export async function projectOf(env) {
  return (await projectScopeOf(env)).project;
}
// projectClause(sc, col) -> { sql, args }: projectScopeOf's filter as SQL on `col` (" AND <col> = ?", " AND <col> IS NULL" or "")
// sprint 6 (6.2): "null" is the READER'S org's rows no project stamps, and "none" (an org with no active project) the reader's
// org's rows, never every org's: the org column beside `col` (t.project -> t.org), written as the layer's {org} (src/data.js)
export function projectClause(sc, col) {
  const i = col.lastIndexOf("."), org = (i < 0 ? "" : col.slice(0, i + 1)) + "org";
  if (sc && sc.filter === "eq") return { sql: ` AND ${col} = ?`, args: [sc.project] };
  if (sc && sc.filter === "null") return { sql: ` AND ${col} IS NULL AND ${org} = {org}`, args: [] };
  return { sql: ` AND ${org} = {org}`, args: [] };
}

// resolveProject(person, want, seats, env) — rules 1–4 at the door (the seam's GET ?project=, callTool for every project:true
// tool, resources/read for a brain:// URI's ?project=).
//   * a NAMED want goes through doorProject's own validation (a seat; the owner: any ACTIVE project), else the refusal
//     { error:"project_forbidden", project, seats, note, example? } — nothing is read;
//   * no want: the caller's active project, else the first project in key order the caller may read; a caller seated nowhere
//     who is not the owner gets project null. A defaulted read by a caller who may read more than one project (their seats;
//     the owner: the active projects) carries `note`.
// -> { project, named, active, env, note? }: env carries the project (inProject), and a Partner's null scope carries the
// fence. It never writes the stamp and never types a key: the keys are the caller's seats and the projects table's.
export async function resolveProject(person, want, seats, env) {
  const keys = (Array.isArray(seats) ? seats : []).map((s) => s.key);
  const fence = isPartnerReader(person);
  const at = (project) => (!project && fence ? { ...env, [PROJECT]: null, [NO_PROJECT]: true } : inProject(env, project));
  // the want is parsed by projectArg — a non-string is refused project_forbidden (never a 500, never coerced)
  const arg = projectArg(want, keys, readerOrg(env));
  if (arg.error) return arg;
  const named = arg.project;
  if (named) {
    const d = await doorProject(person, { project: named }, seats, env);
    if (d.error || d.project !== named) {
      return { error: "project_forbidden", project: named, seats: keys,
               note: d.note || (keys.length ? `You hold no seat on "${projectSlug(named)}". Use \`project\`: one of [${keys.map(projectSlug).join(", ")}].` : `You hold no seat on "${projectSlug(named)}".`),
               ...(d.example ? { example: d.example } : keys.length ? { example: { project: keys[0] } } : {}) };
    }
    return { project: named, named: true, active: named === await activeProjectOf(person, seats, env), env: at(named) };
  }
  const active = await activeProjectOf(person, seats, env);   // a live stamp, or the one seat
  if (active) return { project: active, named: false, active: true, env: at(active) };
  const readable = person && person.role === "owner" ? await activeKeysOnce(env) : keys;
  const pick = readable[0] || null;
  // a defaulted read that could have read another project names how to pick it, from the projects the caller may read (P3-F,
  // P3 fault 5: built from the seats, a seatless owner's default read was silent)
  const note = pick && readable.length > 1
    ? `Add \`project\`: one of [${readable.map(projectSlug).join(", ")}] to read another project; this reads "${projectSlug(pick)}", the first you may read in the org's order.`
    : undefined;
  return { project: pick, named: false, active: false, env: at(pick), ...(note ? { note } : {}) };
}
