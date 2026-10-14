// src/orgs.js — CREATE AN ORG, a write through the door (sprint 7, slice 7.3; docs/plan/PLATFORM.md §2 items 1, 2, 6, 8 and 9;
// §4 sprint 8's free tier; migrate-072). What tools/new-org.sh did by SQL, a person now does through POST /orgs (src/index.js,
// the page src/orgpage.js): the org's row (its name and its PATH NAME, src/orgnames.js), the creator's OWNER seat in it (a people
// row of their account, PLATFORM §2.8) and its first project (src/project.js projectKeyOf: o<id>--<slug>), in ONE batch.
//
// WHO MAY CREATE (the no-widening argument, said once here):
//   · an ACCOUNT holder, proven by the ACCOUNT's own passphrase (src/accounts.js accountProof: the one a person chose at
//     sign-up with the operator's code, or proved on /profile). No seat is needed (a person freshly signed up holds none) and
//     none is used: a SEAT's secret (the key an org's admin minted or set) never creates an org — what an org's admin knows
//     proves nothing about the account's holder. The attempt counts in the account's lockout, as a sign-in's does, keyed by the
//     account and the caller's client (sprint 8, 8.3a: src/accounts.js THE LOCKOUT — a stranger's failures on the email never
//     lock the holder's own client out of creating their org).
//   · at most ONE org per account (ORGS_PER_ACCOUNT: the owner's ruled free tier, PLATFORM §4 sprint 8, "Orgs a person creates:
//     1"); the limit is the creation's own (migrate-072's idx_org_founder holds it under a race), the rest of the plan's limits
//     are sprint 8's.
// WHAT THEY GET: an owner seat in THEIR NEW ORG alone, and its key, shown once. Every statement of the creation runs on
// foundingEnv (src/data.js) for the new id, in ONE batch whose FIRST statement inserts that org's row with {org} as its id: an id
// that exists already fails the insert and the whole batch, so nothing here can land in an org that was there before. The
// owner seat joins the account the passphrase proved (its email and id, as 7.1's trigger joins any seat); the project's key is
// projectKeyOf(the new id, slug), so its org is the new one by the key rule (projects.org is generated from the key). No right
// in any other org changes: no other org's row is read but whether a path name is held (one bit, after the proof) and the
// account's own founded org.
// The ONLY path that inserts an org row from a request: tools/check-scoped-data.py's `orgrow` rule fails a statement writing
// the org table anywhere else in src/.
// Refusals (the route's answer: src/index.js POST /orgs): before anything is read, a malformed field (bad_org {field}) or a
// reserved path name (org_name_reserved); then the account proof (invalid_account, one answer for every case; too_many_attempts);
// then the account's founded org (org_limit) and the path name held (org_name_taken); an account an invite link made is refused
// (org_by_invite, sprint 12, 12.3: the waitlist). Nothing is written on a refusal but the proof's attempt.
import { db, foundingEnv } from "./data.js";
import { uid, now, sha256, pbkdf2, hex } from "./util.js";
import { TOKEN_PREFIX } from "./tenant.js";
import { projectKeyOf } from "./project.js";
import { forgetOrgProjects } from "./core.js";
import { accountProof, normEmail } from "./accounts.js";
import { orgSlugProblem, normSlug } from "./orgnames.js";
import { EMAIL_RE } from "./signup.js";
import { PROJECT_KEY_RE } from "./knowledge/schema.js";

export const ORGS_PER_ACCOUNT = 1;
// the first project's slug: 2 to 30 characters, so its key o<id>--<slug> fits the key form (40) for any id up to 6 digits
export const PROJECT_SLUG_MAX = 30;
export const ORG_NAME_MAX = 80;

// ---- the statements ----
// the next free org id (the restore's rule too, tools/org-undo.mjs): a race is the batch's PRIMARY KEY failure, retried
export const NEXT_ORG_SQL = "SELECT COALESCE(MAX(id), 0) + 1 AS n FROM org";
// whether a path name is held (one bit; asked only after the account is proven)
export const SLUG_HELD_SQL = "SELECT 1 AS x FROM org WHERE slug = ?1";
// the org this account created, if any (idx_org_founder: one row at most)
export const FOUNDED_SQL = "SELECT id, slug FROM org WHERE created_by_account = ?1";
// THE BATCH, on foundingEnv (the new id is {org}); binds named in each
// 1 · the org row: its id IS {org} (an existing id fails here, and the batch with it). ?1 name, ?2 slug, ?3 the account, ?4 now
export const FOUND_ORG_SQL = "INSERT INTO org (id, name, slug, created_by_account, created_at, updated_at) VALUES ({org}, ?1, ?2, ?3, ?4, ?4)";
// 2 · the owner seat, the account's (its email and id): its own key is its secret (S-019, as add-person mints one). ?1 id,
//     ?2 name, ?3 email, ?4 key hash, ?5 pass hash, ?6 salt, ?7 now, ?8 the account
export const FOUND_OWNER_SQL = "INSERT INTO people (id, name, email, role, key_hash, pass_hash, pass_salt, active, created_at, account_id, org) " +
  "VALUES (?1, ?2, ?3, 'owner', ?4, ?5, ?6, 1, ?7, ?8, {org})";
// 3 · the first project, only beside THIS account's new org row. ?1 key (projectKeyOf of the new id), ?2 name, ?3 now, ?4 the account
export const FOUND_PROJECT_SQL = "INSERT INTO projects (key, name, active, created_at, eval) SELECT ?1, ?2, 1, ?3, 0 " +
  "WHERE EXISTS (SELECT 1 FROM org WHERE id = {org} AND created_by_account = ?4)";
// 4 · the org row names its creator seat and its home project (both exist now). ?1 the owner seat, ?2 the project, ?3 the account
export const FOUND_HOME_SQL = "UPDATE org SET created_by = ?1, updated_by = ?1, home = ?2 WHERE id = {org} AND created_by_account = ?3";

// ---- the words ----
export const ORG_FIELD_WORDS = {
  email: "Type the email of your account.",
  password: "Type your account passphrase.",
  name: `Name your org (1 to ${ORG_NAME_MAX} characters).`,
  slug: "The address takes a to z, 0 to 9 and single dashes, 2 to 40 characters, starting and ending with a letter or a digit.",
  project: `The first project's short name takes a to z, 0 to 9 and single dashes, 2 to ${PROJECT_SLUG_MAX} characters.`,
  you: `Your name is at most ${ORG_NAME_MAX} characters.`,
};
export const ORG_WORDS = {
  invalid_account: "That email and account passphrase do not match. Use the passphrase you chose when you signed up: a key an org's admin gave you does not create an org.",
  org_name_reserved: "That name belongs to the platform (one of its pages or doors). Choose another address for your org.",
  org_name_taken: "That address is taken. Choose another address for your org.",
  org_by_invite: "Your account was made by an org's invite link, so it does not create an org during the beta: orgs join by the waitlist. Ask the sharingu operator for a sign-up code (it confirms your email), then create your org.",
  org_limit: "Your account has already created its org. During the beta an account creates one org, and may be a member of any number.",
  too_many_attempts: "Too many attempts. Wait 15 minutes and try again.",
};

// orgFields(raw) -> the fields as the door reads them: { email, password, name, slug, project, projectName, you }
//   project defaults to the address name, projectName to the org's name, you (the owner seat's name) to the email's first part
export function orgFields(raw = {}) {
  const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const email = normEmail(String(raw.email == null ? "" : raw.email).slice(0, 254));
  const name = s(raw.name, ORG_NAME_MAX + 1);
  const slug = normSlug(String(raw.slug == null ? "" : raw.slug).slice(0, 64));
  const project = normSlug(String(raw.project == null ? "" : raw.project).slice(0, 64)) || slug;
  return { email, password: String(raw.password == null ? "" : raw.password), name, slug, project,
    projectName: s(raw.projectName, ORG_NAME_MAX) || name.slice(0, ORG_NAME_MAX), you: s(raw.you, ORG_NAME_MAX + 1) || email.split("@")[0].slice(0, ORG_NAME_MAX) };
}
// orgFormProblem(f, reserved) -> null, or { error, field?, status }: checked BEFORE anything is read (it says nothing about
// accounts, nor about which names orgs hold; a reserved name is the platform's own, public list)
export function orgFormProblem(f, reserved) {
  const bad = (field) => ({ error: "bad_org", field, status: 422 });
  if (!f.email || !EMAIL_RE.test(f.email)) return bad("email");
  if (!f.password || f.password.length > 1024) return bad("password");
  if (!f.name || f.name.length > ORG_NAME_MAX) return bad("name");
  const sp = orgSlugProblem(f.slug, reserved);
  if (sp === "slug") return bad("slug");
  if (f.project.length > PROJECT_SLUG_MAX || f.project.includes("--") || !PROJECT_KEY_RE.test(f.project)) return bad("project");
  if (f.you.length > ORG_NAME_MAX) return bad("you");
  if (sp === "reserved") return { error: "org_name_reserved", field: "slug", status: 409 };
  return null;
}

// createOrg(env, url, f, { client }) -> { org: {id, name, slug}, project: {key, name}, person: {id, name, email}, key, signin } | { error, status }
// f is orgFields' answer that orgFormProblem passed; client, the caller's (src/accounts.js clientOf; "" for none: the lockout is
// then the account's alone). The key is the owner seat's secret, returned here ONCE: never stored (its hashes only), never
// logged; the caller shows it and forgets it.
export async function createOrg(env, url, f, { client = "" } = {}) {
  const proof = await accountProof(env, url, { email: f.email, password: f.password, client });
  if (proof.verdict === "locked") return { error: "too_many_attempts", status: 429 };
  // sprint 12, 12.3: an account whose passphrase an org's invite link set (src/accounts.js THE INVITE LINK) creates no org — the
  // beta's orgs stay on the waitlist, and the operator's code alone makes an account that creates one
  if (proof.verdict === "invited") return { error: "org_by_invite", status: 403 };
  if (proof.verdict !== "ok" || !proof.account) return { error: "invalid_account", status: 401 };
  const account = proof.account;
  const limit = async () => !!(await db(env).prepare(FOUNDED_SQL).bind(account.id).first());
  const held = async () => !!(await db(env).prepare(SLUG_HELD_SQL).bind(f.slug).first());
  if (await limit()) return { error: "org_limit", status: 409 };
  if (await held()) return { error: "org_name_taken", status: 409 };
  for (let attempt = 0; ; attempt++) {
    const n = Number(((await db(env).prepare(NEXT_ORG_SQL).first()) || {}).n) || 0;
    const key = projectKeyOf(n, f.project);
    if (!key) return { error: "bad_org", field: "project", status: 422 };
    const ownerKey = TOKEN_PREFIX + hex(20), kh = await sha256(ownerKey), salt = hex(16), ph = await pbkdf2(ownerKey, salt);
    const personId = uid(), at = now(), fe = foundingEnv(env, n);
    try {
      await db(fe).batch([
        db(fe).prepare(FOUND_ORG_SQL).bind(f.name, f.slug, account.id, at),
        db(fe).prepare(FOUND_OWNER_SQL).bind(personId, f.you, account.email, kh, ph, salt, at, account.id),
        db(fe).prepare(FOUND_PROJECT_SQL).bind(key, f.projectName, at, account.id),
        db(fe).prepare(FOUND_HOME_SQL).bind(personId, key, account.id),
      ]);
    } catch (e) {
      // the batch landed nothing: this account's org appeared (a concurrent creation), the name was taken meanwhile, or the id
      // was (another creation, a restore): the first two are answered, the third tried again with the next id
      if (await limit()) return { error: "org_limit", status: 409 };
      if (await held()) return { error: "org_name_taken", status: 409 };
      if (attempt === 2) throw e;
      continue;
    }
    forgetOrgProjects(fe);   // an id a deleted org once held (tools/org-undo.mjs delete) keeps no isolate memo of its projects
    // signin (sprint 21, 21.P D17): the creation's own answer as a sign-in's, for the web form's session (src/accounts.js openSession,
    // the mint POST /login uses): an ACCOUNT session, proven by the account's passphrase this request checked, on the owner seat this
    // batch made (its hashes as written, so a rotate or a passphrase change landing meanwhile mints nothing). Not enumerable: no
    // answer that serialises `made` carries the account's hashes.
    const made = { org: { id: n, name: f.name, slug: f.slug }, project: { key, name: f.projectName }, person: { id: personId, name: f.you, email: account.email }, key: ownerKey };
    return Object.defineProperty(made, "signin", { value: { session: "account", account, seat: { id: personId, org: n, key_hash: kh, pass_hash: ph } } });
  }
}
