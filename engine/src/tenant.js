// src/tenant.js — the org's own facts, from its ONE row in D1 (the `org` table, migrate-039 and migrate-063), read once per
// request (src/reqmemo.js): its name and brand, its home project and its settings. Everything else a page needs is the
// product's own (one product: nothing here differs per project).
//
//   org row          getTenantConfig(env) answers
//   name             brand.org (the name every page title composes from; "<org> · sharingu")
//   slug             slug: the org's path name, its address agent.ryuklabs.io/<slug> (migrate-072; sprint 7, 7.4: the base of
//                    every URL the worker builds for the org, src/orgpath.js)
//   brand (JSON)     brand.productTitle, brand.loginTitle (each defaults from the name); brand.engine is always the product
//   home             home: the org's declared home project (core.js homeProjectOf), or null
//   settings (JSON)  domain (the worker's public origin: the cron's report links), evalSeats (the org's declared test
//                    seats), handoffRepo {owner, repo} (where a handoff files an Issue), traceMandate (the consent floor)
// No row (a database not seeded yet) reads as the product's defaults: the brand "sharingu", no home, no settings. Never
// throws: a failed read is the defaults too (and is not kept). The seed writer (tools/lib-r-local.sh) writes the row.

import { db, addressDb, addressOrg, orgCache, HOME_ORG } from "./data.js";
import { reqMemo } from "./reqmemo.js";
import { isD1Quota } from "./util.js";

// the product's one name, to a person and to a connecting client (sprint 3 S3b: never "R" or "Agent R")
export const PRODUCT = "sharingu";
// the brand an org with no row reads; the shell titles every page "<org> · sharingu" from brand.org (control.js lowercases
// it, so it is never empty)
export const DEFAULT_BRAND = {
  org: PRODUCT,
  engine: PRODUCT,
  productTitle: PRODUCT,
  loginTitle: "Sign in · " + PRODUCT,
};

// TOKEN_PREFIX: what a freshly minted personal key starts with: EMPTY by owner ruling (2026-09-03): keys are bare 40-hex.
// SESSION_TOKEN_PREFIX marks engine-minted session tokens (log legibility only).
export const TOKEN_PREFIX = "";
export const SESSION_TOKEN_PREFIX = TOKEN_PREFIX + "t_";

const json = (v) => { if (v == null || v === "") return null; try { const o = JSON.parse(v); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; } };
const str = (v) => (typeof v === "string" ? v : "");
// configOf(row) -> the answer for one org row (null: the defaults). Pure: tools/brand selftests feed it rows.
export function configOf(row) {
  const name = row && str(row.name).trim() ? str(row.name).trim() : "";
  const b = (row && json(row.brand)) || {};
  const st = (row && json(row.settings)) || {};
  const brand = name
    ? { org: name, engine: PRODUCT, productTitle: str(b.productTitle) || `${name} · ${PRODUCT}`, loginTitle: str(b.loginTitle) || `Sign in · ${name} · ${PRODUCT}` }
    : { ...DEFAULT_BRAND };
  const repo = st.handoffRepo && typeof st.handoffRepo === "object" ? st.handoffRepo : {};
  return {
    brand,
    slug: row && typeof row.slug === "string" && row.slug ? row.slug : null,
    home: row && row.home ? String(row.home) : null,
    domain: str(st.domain),
    evalSeats: Array.isArray(st.evalSeats) ? st.evalSeats.filter((x) => typeof x === "string") : [],
    handoffRepo: { owner: str(repo.owner), repo: str(repo.repo) },
    traceMandate: st.traceMandate && typeof st.traceMandate === "object" ? st.traceMandate : null,
    orgRow: !!row,
  };
}
// HOME_ORG — org 1 (sprint 6, migrate-067: the org table holds many rows; src/data.js holds the constant): the org every bare
// project key names (src/project.js orgOfKey). It is no page's default brand (sprint 7, 7.4b): a page at the root before a
// sign-in wears the platform's own (DEFAULT_BRAND), a page at /<org>/… that org's.
export { HOME_ORG };
// ORG_SQL: the request's org's row (its primary key; src/data.js writes the org in: the signed-in reader's, else the org the
// address serves). SELECT * so a database before migrate-063 reads no settings. For org 1 it is the statement it always was.
export const ORG_SQL = "SELECT * FROM org WHERE id = {org}";
// the row is read once a minute per isolate per org (src/data.js orgCache: keyed by the raw D1 binding, then the org, like
// core.js orgProjectsOnce) and pinned per request (reqMemo, which keys every memo by the org): a page pays no D1 read for it
// but the first one in a minute. The row changes only when an org is seeded or shipped.
const ORG_TTL_MS = 60_000;
const orgMemo = new WeakMap();
// getTenantConfig(env) — the org's facts for this request (one primary-key read of the org row at most, see above). Each
// caller gets its own copy.
export async function getTenantConfig(env) {
  const org = addressOrg(env);
  // no org (a platform page at the root before a sign-in: sprint 7, 7.4b): the platform's own brand, no statement
  const row = org == null ? null : await reqMemo(env, "org", async () => {
    const slot = orgCache(env, orgMemo, org), hit = slot ? slot.get() : undefined;
    if (hit && Date.now() - hit.at < ORG_TTL_MS) return hit.row;
    let r;
    try { r = (await addressDb(env).prepare(ORG_SQL).first()) || null; } catch { return null; }
    // a row is kept a minute; NO row is never kept (sprint 7, 7.4: an org made a moment ago under an id read before it existed
    // answers its own name and address at once, never the defaults for a minute)
    if (slot && r) slot.set({ at: Date.now(), row: r });
    return r;
  });
  const c = configOf(row);
  return { ...c, brand: { ...c.brand }, evalSeats: [...c.evalSeats], handoffRepo: { ...c.handoffRepo } };
}

// ---- the address (sprint 7, 7.4; PLATFORM §2 item 9: each org at agent.ryuklabs.io/<org>) ----
// ORG_BY_SLUG_SQL: the org an address names, by its path name (migrate-072's idx_org_slug: one row at most). A platform read:
// no one is signed in yet, and the slug is the ADDRESS (the router's one resolution, src/index.js), never a parameter a
// signed-in caller sends to reach another org — a sign-in under the address is refused unless its person is of this org
// (src/data.js signIn).
export const ORG_BY_SLUG_SQL = "SELECT * FROM org WHERE slug = ?";
const slugMemo = new WeakMap();
// orgBySlug(env, slug) -> the org row the slug names, or null (no such org; never cached, so an org made a moment ago is found).
// A found row is kept a minute per isolate (keyed by the raw D1 binding, then the slug: src/data.js orgCache) and seeds the
// org row's own cache (getTenantConfig above), so a page under its org's address pays no D1 read for either but the first one
// in a minute.
export async function orgBySlug(env, slug) {
  const s = String(slug == null ? "" : slug);
  if (!s) return null;
  const slot = orgCache(env, slugMemo, s), hit = slot ? slot.get() : undefined;
  if (hit && Date.now() - hit.at < ORG_TTL_MS) return hit.row;
  let row = null;
  try { row = (await db(env).prepare(ORG_BY_SLUG_SQL).bind(s).first()) || null; } catch (e) { if (isD1Quota(e)) throw e; return null; }
  if (row && slot) {
    slot.set({ at: Date.now(), row });
    const byId = orgCache(env, orgMemo, Number(row.id));
    if (byId) byId.set({ at: Date.now(), row });
  }
  return row;
}

// ---- Owner identity (report §1 row 3, §4) ----
// resolveOwner(env) — the people row with role='owner' (the freshest, most
// authoritative source there is: live D1, not a served static config), rather than
// a hand-typed name at ~15 call sites. Mirrors the COALESCE(title, role) shape every
// other by_role join in src/index.js already uses (ADR-092 §2): title, when a person
// has one, is the display role; role stays the fixed capsule/gate scope ("owner").
// build0925:d1-hot-queries: the lookup is served by migrate-037's idx_people_owner(role, active, created_at), a
// one-row read, and it runs ONCE per request (src/reqmemo.js): a page that names the owner in three places, plus the
// shell, used to pay for it each time. The memo is request-scoped only. Each caller still gets its own copy.
// sprint 6 (6.2): the owner of the request's org (src/data.js: the reader's org, else the org the address serves), never the
// first owner of the database; idx_people_owner's walk stops at the org's first owner (org 1's is the oldest row).
export const OWNER_SQL = "SELECT name, title, role FROM people WHERE role = 'owner' AND active = 1 AND org = {org} ORDER BY created_at ASC LIMIT 1";
export async function resolveOwner(env) {
  if (addressOrg(env) == null) return null;   // no org at the root before a sign-in: no owner to name (7.4b)
  const hit = await reqMemo(env, "owner", async () => {
    try {
      const row = await addressDb(env).prepare(OWNER_SQL).first();
      if (row && row.name) return { name: row.name, roleLabel: row.title || row.role };
    } catch { /* DB unreachable — fall through to the honest fallback below */ }
    return null;
  });
  return hit ? { ...hit } : null;
}

// ownerName(owner) — the ONE formatter every hand-typed "Ryuk" site now calls
// through, given resolveOwner's result. Never invents a name in code: "the owner" is
// the honest generic fallback when the people row is missing, exactly as ruled.
export function ownerName(owner) {
  return (owner && owner.name) ? owner.name : "the owner";
}
