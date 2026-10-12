// src/data.js — THE scoped data layer (sprint 6, 6.2; docs/plan/PLATFORM.md §2 items 3 and 4). One database holds many orgs;
// every statement the worker runs goes through this module, and the org a statement reads or writes is the READER's, taken
// from the sign-in alone (a key, a session, an OAuth grant: the people row the credential found), never from a parameter, a
// header or a project key a caller typed. tools/check-scoped-data.py (a gate step) fails any statement written outside it.
//
//   db(env)            the request's handle: { org, prepare(sql), batch(stmts) }. A statement that names the org writes the
//                      token {org} (the reader's org id, an integer) or {orgbucket} (the org-level bucket of the three running
//                      counts, migrate-067: '' for HOME_ORG, 'o<org>--' for another org); the layer writes the reader's value
//                      in place of each before the statement reaches D1. The value is an integer the layer validated, never
//                      text a caller sent, so nothing is spliced but a number. A statement with a token and no signed-in org
//                      is refused loudly (org_unknown), never run against org 1 or against every org.
//   addressDb(env)     the same handle for the statements a page runs before anyone signs in (the brand on a page): the
//                      signed-in reader's org when there is one, else the org the address serves, else none (a platform
//                      page at the root, before a sign-in: the platform's own brand, sprint 7, 7.4b; a token is refused).
//   signIn(env, row)   the sign-in: the resolvers (src/core.js authenticate, authenticateSession, resolveReadOnly and
//                      resolveReader's OAuth path) hand it the people row the credential found; its org becomes the request's.
//                      One request, one org: a second sign-in into another org is refused (org_mismatch), and so is a sign-in
//                      into any org but the one the ADDRESS serves (sprint 7, 7.4: /<org>/…; an unknown org's address serves
//                      none, so nobody signs in there).
//   signInEnv(env, row) a NEW env for a request that establishes an identity of its own (POST /login, the OAuth sign-in
//                      form): the person whose passphrase was just checked, whatever the ambient cookie said.
//   platformEnv(env, org) the deployment's own env for one org (the cron): never reached by a caller's request.
//   foundingEnv(env, org) the env of the ONE batch that creates org `org` (POST /orgs, sprint 7): it writes only into the org
//                      the same batch makes (its first statement inserts the org row; an existing id fails the whole batch).
//   readerOrg(env)     the signed-in org (an integer), or null.
//
// The org rides the request's env under ORG_SLOT, one mutable slot per request installed at the worker's entry (installOrgSlot,
// next to the request memo, src/reqmemo.js): every copy of the env the seam makes ({ ...env }) shares the same slot, so the
// org the sign-in found is the org of every statement after it in that request, and no copy can carry another.
// THE ADDRESS (sprint 7, 7.4; PLATFORM §2 item 9: each org at agent.ryuklabs.io/<org>) rides the same slot: src/index.js
// routeRequest resolves the path's first segment ONCE per request and installs what it names (installAddress): an org
// ({ org, slug }), an org address naming no org ({ org: null, slug }: nobody signs in there), or nothing (the platform's root).
//   installAddress(env, a)  the router's one write of the address (src/index.js only)
//   atAddress(env)          true under an org's address (/<seg>/…), known or not: a cookie session signs in only there
//   addressServes(env)      the org the address serves (an integer), or null (the root, or an address naming no org)
// tools/check-scoped-data.py's allowlist names the only files that may call signIn, signInEnv, platformEnv, foundingEnv,
// installAddress, addressDb or addressServes.

import { REAL_BINDING } from "./timing.js";

// HOME_ORG — org 1 (migrate-067): ryuklabs, the org every bare project key names (src/project.js orgOfKey); re-exported by
// src/tenant.js
export const HOME_ORG = 1;
export const ORG_SLOT = Symbol.for("sharingu.org");

const validOrg = (o) => Number.isSafeInteger(o) && o >= 1;
const orgError = (code, note) => Object.assign(new Error(`${code}: ${note}`), { code });
export const isOrgError = (e) => !!e && (e.code === "org_unknown" || e.code === "org_mismatch");

// installOrgSlot(env) — the request's empty slot (the one installer: src/index.js workerHandler.fetch)
export function installOrgSlot(env) {
  if (env && typeof env === "object") env[ORG_SLOT] = { org: null, address: null };
  return env;
}
const slotOf = (env) => (env && typeof env === "object" ? env[ORG_SLOT] : null);
// readerOrg(env) -> the org the request's sign-in found, or null (no one signed in yet)
export function readerOrg(env) {
  const s = slotOf(env);
  return s && validOrg(s.org) ? s.org : null;
}
// installAddress(env, a) — the address the router resolved (src/index.js routeRequest, once per request, before any sign-in):
// { org: <id> | null, slug } under an org's address, null at the root. An env with no slot is refused (org_unknown).
export function installAddress(env, a) {
  const s = slotOf(env);
  if (!s) throw orgError("org_unknown", "an address on an env with no request slot (src/data.js installOrgSlot)");
  if (a == null) { s.address = null; return null; }
  const org = a.org == null ? null : Number(a.org);
  if (org != null && !validOrg(org)) throw orgError("org_unknown", "the address names no whole-number org");
  s.address = Object.freeze({ org, slug: String(a.slug || "") });
  return s.address;
}
const addressOfSlot = (env) => { const s = slotOf(env); return s && s.address ? s.address : null; };
// atAddress(env) -> true under an org's address (/<seg>/…), whether or not an org holds that name
export const atAddress = (env) => !!addressOfSlot(env);
// addressServes(env) -> the org the ADDRESS serves (sprint 7, 7.4: the path's first segment, by org.slug), whoever is signed in;
// null at the root and at an address no org holds. HOME_ORG is no address's default.
export const addressServes = (env) => { const a = addressOfSlot(env); return a && validOrg(a.org) ? a.org : null; };
// addressOrg(env) -> the reader's org, else the org the address serves, else null: a platform page at the root before a sign-in
// (the sign-in, the sign-up, /docs, the MCP greeting) is no org's and wears the PLATFORM's own brand (sprint 7, 7.4b: never
// org 1's by default); src/tenant.js reads no row for it
export const addressOrg = (env) => readerOrg(env) ?? addressServes(env);

const orgOfRow = (row) => {
  const org = row && typeof row === "object" ? Number(row.org) : NaN;
  if (!validOrg(org)) throw orgError("org_unknown", "the signed-in person carries no org");
  return org;
};
// signIn(env, row) -> row: the request's org is the org of the people row the credential found
// An env with no slot is refused (org_unknown): only a request's own env carries one (installOrgSlot at the entry), and the
// runtime's env is shared by every request of the isolate, so a sign-in never writes onto an env it did not get a slot for.
export function signIn(env, row) {
  const org = orgOfRow(row);
  const s = slotOf(env);
  if (!s) throw orgError("org_unknown", "a sign-in on an env with no request slot (src/data.js installOrgSlot)");
  if (s.org != null && s.org !== org) throw orgError("org_mismatch", "one request reads one org");
  // sprint 7, 7.4: under an org's address only that org's people sign in (an address naming no org: nobody)
  if (s.address && s.address.org !== org) throw orgError("org_mismatch", "the address serves another org");
  s.org = org;
  return row;
}
// signInEnv(env, row) -> a new env whose org is this row's (a request that signs a person in: the ambient reader is not asked)
export function signInEnv(env, row) {
  return { ...env, [ORG_SLOT]: { org: orgOfRow(row) } };
}
// platformEnv(env, org) -> the deployment's env for one org (the cron; never a request)
export function platformEnv(env, org) {
  if (!validOrg(org)) throw orgError("org_unknown", "the platform names no org");
  return { ...env, [ORG_SLOT]: { org } };
}
// foundingEnv(env, org) -> a NEW env whose org is the one this request is CREATING (POST /orgs, src/orgs.js createOrg; sprint 7,
// 7.3). Its statements run only inside the creation's ONE batch, whose first statement inserts that org's row with {org} as its
// id: an org that already exists fails that insert, and the whole batch with it, so no statement on this env ever lands in an
// org that was there before the request.
export function foundingEnv(env, org) {
  if (!validOrg(org)) throw orgError("org_unknown", "a new org needs a whole number id");
  return { ...env, [ORG_SLOT]: { org } };
}

// orgBucketOf(org) -> the running counts' org-level bucket (migrate-067: '' for HOME_ORG, 'o<org>--' for another org)
export const orgBucketOf = (org) => (org === HOME_ORG ? "" : `o${org}--`);
const TOKEN = /\{org(?:bucket)?\}/;
// orgSql(sql, org) -> the statement with the org written in: {org} the id, {orgbucket} the bucket as a SQL string (its two
// dashes written char(45, 45), the one spelling every statement of this codebase uses for them). Exported for the selftests
// that EXPLAIN a statement outside the worker.
export function orgSql(sql, org) {
  if (!TOKEN.test(sql)) return sql;
  if (!validOrg(org)) throw orgError("org_unknown", "a statement names the org and no one is signed in");
  const bucket = org === HOME_ORG ? "''" : `('o${org}' || char(45, 45))`;
  return sql.replace(/\{orgbucket\}/g, bucket).replace(/\{org\}/g, String(org));
}

function handle(env, orgOf) {
  return {
    get org() { return orgOf(env); },
    prepare(sql) { return env.DB.prepare(TOKEN.test(sql) ? orgSql(sql, orgOf(env)) : sql); },
    batch(stmts) { return env.DB.batch(stmts); },
  };
}
// db(env) — the request's handle; a token is the signed-in reader's org
export const db = (env) => handle(env, readerOrg);
// addressDb(env) — before a sign-in: the reader's org, else the org the address serves
export const addressDb = (env) => handle(env, addressOrg);

// ---- the isolate caches (PLATFORM §2 item 4: caches know the org) ----
// orgCache(env, cache, org) -> the per-org Map of an isolate-wide cache: keyed by the RAW D1 binding (the timed proxy is a
// fresh object per request: src/timing.js REAL_BINDING), then by the org, so two databases never share an answer and neither
// do two orgs of one database. cache is the caller's WeakMap. null when there is no binding (a unit test's bare env).
export function orgCache(env, cache, org) {
  let b = null;
  try { b = env && env.DB ? (env.DB[REAL_BINDING] || env.DB) : null; } catch { b = null; }
  if (!b || typeof b !== "object") return null;
  let m = cache.get(b);
  if (!m) { m = new Map(); cache.set(b, m); }
  return { get: () => m.get(org), set: (v) => m.set(org, v), drop: () => m.delete(org) };
}
