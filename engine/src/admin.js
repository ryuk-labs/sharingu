// src/admin.js — M-ADR-008a phase 1 (T7): the /control POST action dispatch, hoisted
// out of index.js verbatim. The render half of /control is src/controlread.js (the ONE
// read) + src/controlpage.js (the screen, UI-B12b); this file owns only "what happens
// when the owner submits the control form".

import { db, readerOrg } from "./data.js";
import { store, HANDOFF_EVAL_PREFIX } from "./storage.js";   // sprint 6, 6.4: the org's objects
import { uid, now, sha256, pbkdf2, hex, NOT_EVAL_SEAT_SQL, EVAL_SEAT_PREFIX, isEvalSeat, isEvalMark } from "./util.js";
import { TOKEN_PREFIX } from "./tenant.js";
import { clearReqMemo } from "./reqmemo.js";
import { forgetOrgProjects, withProfile, noProfileCols } from "./core.js";
import { projectKeyOf, keyInOrg, projectSlug, projectWords } from "./project.js";   // sprint 13 (13.2): a flash names a project by its name or slug, never its org-prefixed key
import { revokeOAuthGrants } from "./oauthgrants.js";
import { seatSpan, seatTaken, seatNeedsConsent, asciiEmail, EMAIL_NOT_ASCII_WORDS, INVITE_DAYS, INVITE_TOKEN_BYTES, INVITE_PATH, inviteTokenHash, seatStamp, inviteSeatUse, SEAT_NEVER_USED } from "./accounts.js";   // sprint 7, 7.1: one account per email, a seat per org; the review's A1: a seat waits for its holder's yes
import { fromTypedRole, hatsJson, hatsOf, accessJson, hatOf, HAT_KEYS } from "./hats.js";
import { checkPlan } from "./plans.js";   // sprint 8, 8.2: a new person or project checks the org's plan first

// migrate-045 (the owner's MCQ, 2026-10-01): the ADMIN sets the hats that unlock briefings and cards (people.access_hats,
// src/hats.js readerKeys); a person's own hats only shape their Home. set-access-hats writes one person's list (the seven only,
// none is a valid choice); Invite may set it at once (accessHat, repeated). Both read the form's accessHat fields here.
export const SET_ACCESS_HATS_SQL = "UPDATE people SET access_hats = ? WHERE id = ? AND active = 1 AND org = {org}";
// accessHatsOf(fd) -> { hats: the seven named, in order; unknown: anything else named }
function accessHatsOf(fd) {
  const said = fd.getAll("accessHat").map((h) => String(h || "").trim().toLowerCase()).filter(Boolean);
  return { hats: hatsOf(said), unknown: [...new Set(said.filter((h) => !HAT_KEYS.includes(h)))].slice(0, 6) };
}
const hatWords = (hats) => hats.map((h) => hatOf(h).label).join(", ");
const NOT_A_HAT = (unknown) => `Nothing done — ${unknown.join(", ")} ${unknown.length === 1 ? "is not a hat" : "are not hats"}: the hats are ${HAT_KEYS.join(", ")}.`;

// UI-B12a (D3): the admin marker and the seated default, and the three statements that change who is an admin. Each guard
// is inside its ONE statement (never a read-then-write), and each counts REAL admins only: the suites' fixed owner
// (`eval-fixed-owner`, tools/lib-mint-seat.sh, active during a run) never keeps the org covered.
// migrate-044 (the owner's MCQ, 2026-09-30 evening): the roles are Admin (owner) · Member · Partner. The seated default is
// 'member' (it was the typed label 'leader'); a Partner is an outside collaborator who sees only the projects they are seated
// on. set-role writes one of the three; its demotion of an admin keeps the last-real-admin guard inside the same statement.
export const ADMIN_ROLE = "owner";
export const SEATED_ROLE = "member";
export const PARTNER_ROLE = "partner";
// sprint 6 (6.2): every statement here acts on the ADMIN'S org only (src/data.js {org}, from the admin's sign-in): a person or
// a project of another org is "not known", and the last-real-admin guard counts the admin's own org's admins
const OTHER_REAL_ADMINS = "(SELECT COUNT(*) FROM people WHERE role='owner' AND active=1 AND org = {org} AND id<>?" + NOT_EVAL_SEAT_SQL("id") + ")";
export const SET_ADMIN_SQL = "UPDATE people SET role='owner' WHERE id=? AND active=1 AND role<>'owner' AND org = {org}";
// member or partner: changes only a person who is not that role yet, and an admin only while ANOTHER real admin stays.
// Binds: the role, the person, the role again, the person again (for the guard's id<>?).
export const SET_ROLE_SQL = "UPDATE people SET role=? WHERE id=? AND active=1 AND org = {org} AND role<>? AND (role<>'owner' OR " + OTHER_REAL_ADMINS + ">=1)";
// review fix 7 (sprint 2): a change TO partner clears the access hats in the SAME statement (migrate-045's people.access_hats,
// '[]' for none), so a member demoted to Partner never keeps opening the docs and cards their old hats unlocked. Same binds and
// guard as SET_ROLE_SQL; a database migrate-045 has not reached runs SET_ROLE_SQL (it has no access hats to clear).
export const SET_ROLE_PARTNER_SQL = "UPDATE people SET role=?, access_hats='[]' WHERE id=? AND active=1 AND org = {org} AND role<>? AND (role<>'owner' OR " + OTHER_REAL_ADMINS + ">=1)";
export const REMOVE_PERSON_SQL = "UPDATE people SET active=0 WHERE id=? AND active=1 AND org = {org} AND (role<>'owner' OR id LIKE '" + EVAL_SEAT_PREFIX + "%' OR " + OTHER_REAL_ADMINS + ">=1)";
// UI-B12b (the fold from B12a's adversarial review, c7ce4f0a): Reissue is the compromised-key path, so rotate-key also signs
// the person out: every live session row (tokens) of THAT person is revoked in the same action, the way the holder's own
// rotate-my-key already does (src/secrets.js). One statement on idx_tokens_person; nobody else's session is touched.
// sprint 7's review (B1 + A4: the one revocation rule, src/accounts.js): an admin's seat action ends that seat's SEAT sessions only
// (tokens.account_id NULL: minted by the seat's own secret, which the admin set) — never an ACCOUNT session, which its holder made
// with their account's passphrase and which reads every org of the account: it simply stops reading this seat once it is removed
// (src/accounts.js SESSION_AT_SQL asks for an active seat), so no org's admin signs a person out of another org.
export const REVOKE_SESSIONS_SQL = "UPDATE tokens SET revoked = 1 WHERE person_id = ? AND account_id IS NULL AND revoked = 0";   // run only after the person's org-scoped UPDATE matched
// the admin's words for what the seat actions end (C2: truthful about a connection made with the person's ACCOUNT passphrase).
// Sprint 8, 8.3a (the sprint-7 review's C2, migrate-077): a reissue (rotate-key, set-password) bumps the seat's grants epoch
// (people.reissued_at, in the same UPDATE as the new secret): an app connected with the account passphrase stops acting in THIS
// seat until its holder connects it again (src/oauthgrants.js accountGrantStands); in their other orgs it acts on, and their
// account session is theirs (the one revocation rule, src/accounts.js)
export const ACCOUNT_KEEPS_WORDS = "A session the person signed in with their own account passphrase is theirs and keeps reading this seat while it is active (remove the seat to end it here); an app they connected with it stops acting in this seat until they connect it again.";
// (A1, migrate-074) the words a seat waiting for its holder's yes gets
export const PENDING_WORDS = (email) => `${email}'s account already stands elsewhere, so this seat WAITS for its holder's yes: it signs nothing in and counts nowhere until they accept it on their org list (signed in with their account passphrase at /orgs), save one place in this org's people limit (sprint 8: a waiting seat is held).`;
// U-REISSUE (N1): POST /login's session INSERT is conditional on the secrets the sign-in verified, so a Reissue here inside its
// pbkdf2 wait mints nothing — src/accounts.js LOGIN_SESSION_SQL (sprint 7: it moved there with the sign-in by account).
// sprint 7 (7.1, PLATFORM §2.8): a seat's account may hold seats in other orgs. An admin sets a SEAT's own secret (set-password,
// rotate-key: it opens that seat alone), never an account's passphrase (src/accounts.js); and set-password is refused outright
// while the account holds a seat in another org — its passphrase belongs to the holder (their profile) or the operator.
export const ACCOUNT_ELSEWHERE = "Nothing done — account_elsewhere: that person's account also holds a seat in another org, so their passphrase is theirs to change (on their profile), never an admin's.";

// THE INVITE LINK's mint (sprint 12, 12.3; migrate-079; src/accounts.js THE INVITE LINK): Control's Invite (add-person with
// deliver=link) and invite-link (a seat that stands) make ONE link for ONE active seat of the ADMIN's org ({org}: from the
// admin's sign-in, never a parameter) and that seat's own email (read off its row, never typed), bound to the seat's secrets as
// read (seatStamp; the insert lands only while they still stand). Any older open link of the seat is revoked in the same batch.
// The token is returned once, for the flash; only its hash is stored. A seat of another org, a pending, removed or email-less
// one: nothing is written (null). A pending seat needs no link: its holder's account stands, and they accept it on /orgs.
// (sprint 12's review) nor a WORKING seat: one signed in, used or whose account holds its own passphrase (src/accounts.js
// SEAT_NEVER_USED) gets no link — { refused: "in_use" | "account_stands" }, nothing written; its secret is reset instead.
export const INVITE_SEAT_SQL = "SELECT id, name, lower(trim(email)) AS email, key_hash, pass_hash FROM people WHERE id = ? AND org = {org} AND active = 1 AND pending = 0 AND email IS NOT NULL AND trim(email) <> ''";
export const INVITE_REVOKE_SQL = "UPDATE seat_invites SET revoked_at = ?1 WHERE person_id = ?2 AND org = {org} AND used_at IS NULL AND revoked_at IS NULL";
export const INVITE_MINT_SQL = "INSERT INTO seat_invites (id, org, person_id, email, token_hash, seat_stamp, created_by, created_at, expires_at) " +
  "SELECT ?1, {org}, p.id, lower(trim(p.email)), ?2, ?3, ?4, ?5, ?6 FROM people p WHERE p.id = ?7 AND p.org = {org} AND p.active = 1 AND p.pending = 0 AND p.key_hash IS ?8 AND p.pass_hash IS ?9 AND " + SEAT_NEVER_USED("p");
// mintInvite(env, personId, by) -> { token, name, email, expires } | { refused: "in_use" | "account_stands" } | null
export async function mintInvite(env, personId, by = null) {
  if (!personId) return null;
  const seat = await db(env).prepare(INVITE_SEAT_SQL).bind(String(personId)).first();
  if (!seat || !seat.email) return null;
  const use = await inviteSeatUse(env, seat.id);
  if (use && Number(use.holds) === 1) return { refused: "account_stands", name: seat.name };
  if (!use) return null;   // not a seat of this org after all (its own {org} read: a second wall)
  if (Number(use.used) === 1) return { refused: "in_use", name: seat.name };
  const token = hex(INVITE_TOKEN_BYTES), at = now(), expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const res = await db(env).batch([
    db(env).prepare(INVITE_REVOKE_SQL).bind(at, seat.id),
    db(env).prepare(INVITE_MINT_SQL).bind(uid(), await inviteTokenHash(token), await seatStamp(seat), by ? String(by) : null, at, expires, seat.id, seat.key_hash ?? null, seat.pass_hash ?? null),
  ]);
  if (((res && res[1] && res[1].meta && res[1].meta.changes) || 0) !== 1) return null;
  return { token, name: seat.name, email: seat.email, expires };
}
// the flash's words for a link (the path; Control's page writes the origin in front: src/controlpage.js)
export const INVITE_LINK_WORDS = (email, token) => `ONE-TIME INVITE LINK (it works once, for ${email} only, for ${INVITE_DAYS} days): ${INVITE_PATH}#${token} — copy it now, it is shown only here. They open it, choose their own passphrase and land in this org signed in: nobody else ever sees their secret.`;
export const INVITE_NONE_WORDS = "No invite link: their account already stands, so they sign in at /login with their own passphrase and accept the seat on their org list (/orgs).";
// (sprint 12's review) the refusal of a link for a working seat: its secret is reset, never replaced by a link
export const INVITE_IN_USE_WORDS = (name, why) => `Nothing done — ${why === "account_stands" ? `${name}'s account holds its own passphrase` : `${name}'s seat is already in use (signed in, or its key has worked)`}: an invite link is only for a seat never used. They sign in at /login as they do; to give them a new secret, use Reset passphrase (rotate-key) or set-password.`;

// addProject(env, { key, name }) — THE one way a project is made (ADR-100, workspace-prd §3: projects are admin-managed): POST
// /control add-project and the MCP tool create_project (sprint 3, B3; the admin's agent creates a project through the door)
// both call it, and both check the caller is the admin BEFORE it. Idempotent by design — re-adding an archived key
// reactivates it, and an active key keeps its row with the name given (the eval suite depends on this; a PK conflict would
// otherwise accumulate dead rows per run). The key is lowercased and trimmed: a-z, 0-9 and dashes, 2 to 40 characters; the
// name 1 to 80. It writes the projects row and nothing else (no seat: the admin reads every active project; no event: the
// row's created_at is its trail, as it always was for add-project).
// -> { key, name, existed, reactivated, flash } | { error: "bad_project", flash }
// sprint 3 S3b (migrate-062): a.eval marks a NEW project as a test run's own (projects.eval = 1); authority: the mark is written
// on the INSERT only, never on the conflict update, so a real project can never be marked (and hidden), and an eval one stays so.
// sprint 6 (6.1, the key rule: src/project.js projectKeyOf): a.key is the slug the admin types; the project lands in the
// acting admin's org — 6.2: the request's org, from the admin's sign-in (src/data.js readerOrg), never a read and never a
// parameter — and its key is that org's key of the slug (org 1's keys are bare, so nothing changes there). A slug never holds
// "--"; a request with no signed-in org creates nothing.
export async function addProject(env, a = {}) {
  const slug = String(a.key ?? "").toLowerCase().trim().slice(0, 40);
  const pname = String(a.name ?? "").trim().slice(0, 80);
  const org = readerOrg(env);
  if (org == null) return { error: "bad_project", flash: "Your seat carries no org. Nothing was created." };
  const pkey = projectKeyOf(org, slug);
  if (!(pkey && pname)) return { error: "bad_project", flash: "Project needs a key (a-z, 0-9 and single dashes, 2-40 chars) and a name." };
  // sprint 8, 8.2: a project this makes active counts toward the plan's projects (src/plans.js checkPlan: one read; a key that is
  // active already adds nothing): past the limit nothing is created, refused plan_limit; past 80% it lands and its flash says so
  const quota = await checkPlan(env, "projects", { key: pkey });
  if (quota.refusal) return { ...quota.refusal, flash: `Nothing done — plan_limit: ${quota.refusal.note}` };
  const prev = await db(env).prepare("SELECT active FROM projects WHERE key = ? AND org = {org}").bind(pkey).first();
  await db(env).prepare(
    "INSERT INTO projects (key,name,active,created_at,eval) VALUES (?,?,1,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name, active=1"
  ).bind(pkey, pname, now(), isEvalMark(a.eval) ? 1 : 0).run();
  clearReqMemo(env);   // U-MCP D9: the request's seats and active projects are read again after a project write
  forgetOrgProjects(env);   // U-MCP-tail-b heal: the seam's and the reads' ONE multi-project memo, re-read
  return { key: pkey, name: pname, existed: !!prev, reactivated: !!prev && Number(prev.active) !== 1, ...(!prev && isEvalMark(a.eval) ? { eval: true } : {}),
    flash: `Project ${projectWords(pname, pkey)} is active.${quota.warning ? ` ${quota.warning.note}` : ""}` };
}
// sprint 3 S3b (migrate-062): what clean-eval sweeps from an ARCHIVED eval project (a test run's own): its seats, its previews,
// its knowledge (checks first, so the lights they feed fall with them) and every derived row it left. Its grades (check_results:
// never removed, Q5992857D), the eval rows they point at and the project row itself (both name it) stay, listed only on ?eval=1.
export const EVAL_PROJECT_SWEEP = ["project_seats WHERE project_key = ?", "previews WHERE project = ?",
  ...["k_checks", "k_renders", "k_styles", "k_edges", "k_nodes", "k_options", "k_questions", "k_goals", "k_cards", "k_card_kinds", "k_docs", "k_gtm", "k_aim", "k_snapshots", "k_versions",
    "k_node_stale", "k_check_stale", "k_fill", "k_node_lights", "k_node_links", "k_screen_renders", "k_screen_takes", "k_check_refs", "k_check_ungraded"].map((t) => `${t} WHERE project = ?`)].map((x) => `DELETE FROM ${x}`);

// runControlAction({ action, fd, personId, env, reader }) — dispatches on `action`
// exactly as the inline chain in index.js's /control POST branch did, does the D1
// write, and returns the flash string index.js renders via renderControl({ flash, ... }).
// `reader` (M-ADR-033 C, remove-person): the acting owner, the SAME value index.js's
// /control route already resolves and gates on (role==="owner") before calling here —
// this file only reads `reader.id` off it, never re-authenticates. It is optional and
// additive: every action above ignores it, byte-identical to before. ⚠ index.js's
// call site (the /control POST branch, `runControlAction({ action, fd, personId, env })`)
// needs one more field threaded in — `runControlAction({ action, fd, personId, env, reader })`
// — for the self/last-owner refusals below to see the acting owner; until that lands,
// remove-person still archives correctly but cannot refuse a self-removal (the last-
// active-owner and unknown/inactive refusals do not depend on `reader` and work today).
export async function runControlAction({ action, fd, personId, env, reader }) {
  let flash = "";
  if (action === "set-title" && personId) {
    // The DISPLAY role (ADR-092 §2: users.md is the source; people.title carries
    // it; every surface reads COALESCE(title, role)) — finally editable where
    // people are managed, instead of an orchestrator D1 write. Blank clears.
    const t = String(fd.get("title") || "").trim().slice(0, 80);
    const r = await db(env).prepare("UPDATE people SET title=? WHERE id=? AND org = {org}").bind(t || null, personId).run();
    flash = !(r?.meta?.changes > 0) ? "Nothing done — that person is not known." : t ? `Title set: ${t}.` : "Title cleared — the role tag shows again.";
  } else if (action === "set-password" && personId) {
    const password = String(fd.get("password") || "");
    if (password.length >= 4 && (await seatSpan(env, personId)).elsewhere) {
      flash = ACCOUNT_ELSEWHERE;   // sprint 7 (7.1): the ruling — a passphrase of an account seated in another org is never an admin's
    } else if (password.length >= 4) {
      // the seat's own secret (it opens this seat alone): the old one stops working, as it always did; the account's own
      // passphrase (the holder's) is never touched here
      const saltHex = hex(16); const ph = await pbkdf2(password, saltHex);
      const r = await db(env).prepare("UPDATE people SET pass_hash=?, pass_salt=?, reissued_at=? WHERE id=? AND org = {org}").bind(ph, saltHex, now(), personId).run();   // 8.3a: the bump
      if (!(r?.meta?.changes > 0)) flash = "Nothing done — that person is not known.";
      else {
        await revokeOAuthGrants(env, personId, { seatOnly: true });   // G2 M1: an app connected with the old passphrase is disconnected
        flash = `Passphrase updated — share it over a secure channel; apps connected with the old one are disconnected. ${ACCOUNT_KEEPS_WORDS}`;
      }
    } else flash = "Passphrase too short (min 4).";
  } else if (action === "rotate-key" && personId) {
    // one secret per person (owner ruling S-019): the key IS the password. Rotating the key
    // rotates both — the same value logs in on the web AND authenticates an agent/API call.
    // sprint 7 (7.1): both are this SEAT's (the compromise path is never refused). An account's own passphrase is never set
    // here.
    const key = TOKEN_PREFIX + hex(20); const kh = await sha256(key);
    const saltHex = hex(16); const ph = await pbkdf2(key, saltHex);
    const r = await db(env).prepare("UPDATE people SET key_hash=?, pass_hash=?, pass_salt=?, reissued_at=? WHERE id=? AND org = {org}").bind(kh, ph, saltHex, now(), personId).run();   // 8.3a: the bump
    // sprint 6 (6.2): a person of the admin's own org, or nothing is reissued (and nothing is revoked)
    if (!(r?.meta?.changes > 0)) flash = "Nothing done — that person is not known.";
    else {
      // the old key's sessions die with it (a signed-in browser or a device token minted from the old secret stops answering);
      // a sign-in still in flight on the old secret mints nothing after the UPDATE above (LOGIN_SESSION_SQL's EXISTS, U-REISSUE)
      await db(env).prepare(REVOKE_SESSIONS_SQL).bind(personId).run();
      // G2 M1: so are the apps they connected (OAuth grants, with their access and refresh tokens): the grant store is cleared,
      // and a grant bound to the old credentials is refused at the door whatever the store holds (src/oauthgrants.js)
      await revokeOAuthGrants(env, personId, { seatOnly: true });
      const who = await db(env).prepare("SELECT name FROM people WHERE id=? AND org = {org}").bind(personId).first();
      flash = `New secret for ${who?.name || "person"} (web login AND API key — one value); the sessions and apps made with this seat's old secret are signed out. ${ACCOUNT_KEEPS_WORDS} Copy it now, it won't be shown again: ${key}`;
    }
  } else if (action === "add-person") {
    let taken = "", quota = { verdict: "ok" };
    const name = String(fd.get("name") || "").slice(0, 80).trim();
    const email = String(fd.get("email") || "").toLowerCase().trim().slice(0, 120);
    const role = String(fd.get("role") || SEATED_ROLE).trim().slice(0, 40) || SEATED_ROLE;
    // routing lane at creation, so a new seat isn't heartbeat-blind (2026-08-30)
    const plane = String(fd.get("lane") || "").toLowerCase().trim().slice(0, 60) || null;
    const access = accessHatsOf(fd);
    // sprint 12, 12.3: Invite's form sends deliver=link — a one-time invite link in place of the key (a script names no deliver: the key)
    const byLink = String(fd.get("deliver") || "") === "link";
    if (role.toLowerCase() === ADMIN_ROLE) {
      // UI-B12a D3b: provisioning never mints an admin (it was an unrestricted role). Admin is the role control's alone
      // (set-role), a second press on a person who already exists. Nobody is created.
      flash = "Nothing done — Provisioning seats a person; make an admin with the role control.";
    } else if (access.unknown.length) {
      flash = NOT_A_HAT(access.unknown);   // a hat outside the seven is refused, never dropped silently: nobody is created
    } else if (email && !asciiEmail(email)) {
      flash = `Nothing done — email_not_ascii: ${EMAIL_NOT_ASCII_WORDS}`;   // A5 (sprint 7's review): one spelling of an account's email
    } else if (name && email && (taken = await seatTaken(env, email))) {
      // sprint 7 (7.1): one account, one seat per org — this email's account is already seated here (migrate-070 refuses the
      // second seat too; this says so instead of failing), or a seat for it here already waits for its holder's yes (A1)
      flash = taken === "pending" ? `Nothing done — a seat for ${email} in this org already waits for its holder's yes.` : `Nothing done — ${email} already holds a seat in this org.`;
    } else if (name && email && (quota = await checkPlan(env, "people")).refusal) {
      // sprint 8, 8.2: a new seat counts toward the plan's people, an active one or one that waits for its holder's yes alike (a
      // pending seat is held: consent is no way to park seats); past the limit nobody is created, refused plan_limit
      flash = `Nothing done — plan_limit: ${quota.refusal.note}`;
    } else if (name && email) {
      // sprint 7 (7.1): the new seat joins this email's account, or a new account is made for it WITH NO PASSPHRASE
      // (migrate-070's people_account_attach): the key minted below is this seat's own secret (S-019: its web sign-in and its
      // API key), opening this seat only — never another org's seat of the same account
      // migrate-044: the role is member or partner (Invite's choice); a typed role a script still names (internal-eng,
      // external-ai, …) provisions its role class, keeps the label for visibility and wears the label's hats (src/hats.js)
      const typed = fromTypedRole(role);
      // migrate-045: the access hats are the ones Invite named (accessHat, repeated), else the typed role's hats (a script's
      // typed role reads what that label read); the person's own hats start as the typed role's plus those, for their Home
      const accessHats = access.hats.length ? access.hats : typed.hats;
      const ownHats = hatsOf([...typed.hats, ...accessHats]);
      // key == password: one secret for web login and API/agents (owner ruling S-019).
      const key = TOKEN_PREFIX + hex(20); const kh = await sha256(key);
      const saltHex = hex(16); const ph = await pbkdf2(key, saltHex);
      // sprint 3 S3b: eval=1 (a script's field: the Invite form never sends it) mints one of the suites' seats (an eval-fixed-*
      // id: src/util.js isEvalSeat), so a marked walk's people never show on Control's default list or in a measure. authority:
      // owner-only like every add-person; it grants nothing (the person's role, seats and hats are as for anyone else).
      const newId = isEvalMark(fd.get("eval")) ? `${EVAL_SEAT_PREFIX}${uid()}` : uid(), at = now();
      // the review's A1 (migrate-074): an email whose account already stands elsewhere (its holder's own passphrase, or a seat in
      // another org) gets a PENDING seat (active 0, pending 1) that waits for its holder's yes on their org list; any other is
      // active at once, as before. Read before the insert: an account that gains a passphrase in between is the one race left
      // (its holder then holds an active seat here they never accepted: the same as before this rule, never more)
      const wait = await seatNeedsConsent(env, email);
      const act = wait ? 0 : 1, pend = wait ? 1 : 0;
      // sprint 6 (6.1, 6.2): the new person joins the acting admin's org — the request's org, from the admin's sign-in
      // (src/data.js {org}); no one signed in, no org: the layer refuses the statement (org_unknown)
      await withProfile((x) => (/access_hats/.test(x)
        ? db(env).prepare("INSERT INTO people (id,name,email,role,lane,key_hash,pass_hash,pass_salt,active,pending,created_at,hats,role_label,access_hats,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,{org})")
          .bind(newId, name, email, typed.role, plane, kh, ph, saltHex, act, pend, at, hatsJson(ownHats), typed.label, accessJson(accessHats))
        : x   // before migrate-045: no access hat is written (the migration's backfill gives the typed label's)
        ? db(env).prepare("INSERT INTO people (id,name,email,role,lane,key_hash,pass_hash,pass_salt,active,pending,created_at,hats,role_label,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,{org})")
          .bind(newId, name, email, typed.role, plane, kh, ph, saltHex, act, pend, at, hatsJson(typed.hats), typed.label)
        : db(env).prepare("INSERT INTO people (id,name,email,role,lane,key_hash,pass_hash,pass_salt,active,pending,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,{org})")
          .bind(newId, name, email, typed.label || typed.role, plane, kh, ph, saltHex, act, pend, at)).run());
      // the seats: the ACTIVE projects Invite named (projectKey, repeated). sprint 3 S3b: Control's Invite form sends seatsChosen=1
      // (its project boxes, the sole project's ticked for you): exactly the ticked ones are seated, none when none is ticked, as
      // the form shows. A script that names none (no seatsChosen) keeps ADR-100 for a MEMBER: auto-seated on the org's SOLE
      // project (the single-project org stays zero-admin); a PARTNER is never seated on a project nobody named (authority: a
      // Partner reads only what they are seated on, so a seat is always named). A multi-project org assigns seats explicitly.
      const named = [...new Set(fd.getAll("projectKey").map((k) => keyInOrg(readerOrg(env), String(k || "").toLowerCase().trim())).filter(Boolean))].slice(0, 50);
      const chosen = fd.get("seatsChosen") === "1";
      let seated = [];
      const seatNames = new Map();   // the seated projects' names, for the flash (13.2)
      try {
        const rows = (await db(env).prepare(named.length ? "SELECT key, name FROM projects WHERE active=1 AND org = {org}" : "SELECT key, name FROM projects WHERE active=1 AND org = {org} LIMIT 2").all()).results || [];
        const projs = rows.map((r) => String(r.key));
        for (const r of rows) seatNames.set(String(r.key), String(r.name || ""));
        seated = named.length ? named.filter((k) => projs.includes(k)) : !chosen && typed.role !== PARTNER_ROLE && projs.length === 1 ? projs : [];
        for (const k of seated) await db(env).prepare("INSERT OR IGNORE INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,'member',?)").bind(newId, k, at).run();
        if (seated.length) clearReqMemo(env);
      } catch { /* pre-migration DB */ }
      const as = typed.role === PARTNER_ROLE ? "a partner" : "a member";
      const seatedWords = seated.map((k) => projectWords(seatNames.get(k), k)).join(", ");
      // the invite link (THE INVITE LINK's mint, above): for an ACTIVE seat only; the key minted above is then shown to no one
      const minted = byLink && !wait ? await mintInvite(env, newId, reader && reader.id) : null;
      const link = minted && minted.token ? minted : null;
      if (byLink) flash = `Created ${name} (${email}) as ${as}${seated.length ? `, seated on ${seatedWords}` : ", seated nowhere yet"}${accessHats.length ? `, access hats ${hatWords(accessHats)}` : ""} — ${link ? `their ${INVITE_LINK_WORDS(email, link.token)}` : wait ? `${PENDING_WORDS(email)} ${INVITE_NONE_WORDS}` : "no invite link could be made: make one from their row."}${quota.warning ? ` ${quota.warning.note}` : ""}`;
      else flash = `Created ${name} (${email}) as ${as}${seated.length ? `, seated on ${seatedWords}` : ", seated nowhere yet"}${accessHats.length ? `, access hats ${hatWords(accessHats)}` : ""} — their ONE secret (web login password AND API key): ${key} — copy it now, it won't be shown again.${wait ? ` ${PENDING_WORDS(email)}` : ""}${quota.warning ? ` ${quota.warning.note}` : ""}`;
    } else flash = "Name and email are required.";
  } else if (action === "invite-link") {
    // sprint 12, 12.3: a new one-time invite link for an active seat of this org (an expired or lost one, or a seat Invite gave a
    // key); the older open link of that seat ends. The seat already holds its place in the plan's people: no plan check
    const m = personId ? await mintInvite(env, personId, reader && reader.id) : null;
    flash = !personId ? "Nothing done — invite-link needs a person."
      : m && m.refused ? INVITE_IN_USE_WORDS(m.name, m.refused)
      : m ? `New invite link for ${m.name} — their ${INVITE_LINK_WORDS(m.email, m.token)} Any older link of theirs no longer works.`
      : "Nothing done — no active seat of this org holds that id (a seat that waits for its holder's yes needs no link: they accept it on their org list).";
  } else if (action === "add-project") {
    flash = (await addProject(env, { key: fd.get("key"), name: fd.get("name") })).flash;
  } else if (action === "archive-project" || action === "activate-project") {
    const pkey = keyInOrg(readerOrg(env), String(fd.get("projectKey") || "").toLowerCase().trim());
    // sprint 8, 8.2: reactivating counts toward the plan's projects as making one does (archiving never checks: it frees one)
    const quota = pkey && action === "activate-project" ? await checkPlan(env, "projects", { key: pkey }) : { verdict: "ok" };
    if (quota.refusal) flash = `Nothing done — plan_limit: ${quota.refusal.note}`;
    else if (pkey) {
      await db(env).prepare("UPDATE projects SET active=? WHERE key=? AND org = {org}").bind(action === "activate-project" ? 1 : 0, pkey).run();
      clearReqMemo(env);   // U-MCP D9: an archived project's seats go dormant within this request too
      forgetOrgProjects(env);   // U-MCP-tail-b heal: the seam's and the reads' ONE multi-project memo, re-read
      flash = action === "activate-project" ? `Project ${projectSlug(pkey)} reactivated.${quota.warning ? ` ${quota.warning.note}` : ""}` : `Project ${projectSlug(pkey)} archived — its seats go dormant with it.`;
    } else flash = "Nothing done — archive/activate needs a project key.";
  } else if (action === "grant-seat") {
    const pid = String(fd.get("personId") || "");
    const pkey = keyInOrg(readerOrg(env), String(fd.get("projectKey") || "").toLowerCase().trim());
    if (pid && pkey) {
      // sprint 6 (6.2): a person and a project of the admin's own org, or nothing is seated
      await db(env).prepare("INSERT OR IGNORE INTO project_seats (person_id,project_key,role,created_at) SELECT ?,?,'member',? " +
        "WHERE EXISTS (SELECT 1 FROM people WHERE id = ?1 AND org = {org}) AND EXISTS (SELECT 1 FROM projects WHERE key = ?2 AND org = {org})").bind(pid, pkey, now()).run();
      clearReqMemo(env);   // U-MCP D9: the request's memoized seats (seatsOnce) are read again after a seat write
      flash = "Seat granted.";
    } else flash = "Nothing done — grant-seat needs BOTH a person and a project key.";
  } else if (action === "revoke-seat") {
    const pid = String(fd.get("personId") || "");
    const pkey = keyInOrg(readerOrg(env), String(fd.get("projectKey") || "").toLowerCase().trim());
    if (pid && pkey) {
      await db(env).prepare("DELETE FROM project_seats WHERE person_id=? AND project_key=? AND project_key IN (SELECT key FROM projects WHERE key = ?2 AND org = {org})").bind(pid, pkey).run();
      clearReqMemo(env);   // U-MCP D9: a revoked seat is gone for the rest of this request
      flash = "Seat revoked.";
    } else flash = "Nothing done — revoke-seat needs BOTH a person and a project key.";
  } else if (action === "clean-eval") {
    // Residue audit 2026-09-06: the suites mark every row they file (transmission.eval, payload.eval,
    // group 'eval', the eval handoff prefix); this removes exactly those marks — nothing unmarked, ever.
    // login_attempts: only probe addresses (verify-live's *.invalid) and rows past the lockout's memory
    // (7 days; the lockout window reads minutes). Counts come back in the flash — the suite's E243 reads them.
    //
    // B3-heal (2026-09-22): `del()` used to catch EVERY error and return the sentinel -1, silently —
    // "ABSENCE IS NOT EVIDENCE" (docs/GUARDRAILS.md): a caller reading "transmissions -1" in the flash
    // had no way to tell a genuine zero-row no-op apart from a refused DELETE. It no longer catches at
    // all — a failure (most likely now: a real FOREIGN KEY constraint, since migrate-031..035 attached
    // several to these exact tables) propagates out of this whole branch and is reported VERBATIM in
    // the flash below, never swallowed.
    //
    // release-heal (2026-09-22, Q5992857D): B3-heal's own fix for the FK gap ADDED a delete
    // statement against the check_results table here, which is a regression against a STANDING
    // owner ruling (Q5992857D, 2026-09-18): "check_results is authored — every grade kept as
    // history, never overwritten." Unlike approval_audit (migrate-034's trigger carves out eval rows BY RULING —
    // a delete is sanctioned there only because Q23D7E346 says so), check_results carries NO such
    // carve-out, and this sweep must not invent one: it never deletes (or updates) a check_results
    // row, full stop. That leaves a real FK question B3-heal was right to worry about — a
    // check_results row can still reference an eval transmission — answered the same way a REAL
    // (non-eval) transmission already is: KEPT. Any eval transmission a check_results row still
    // references (and that transmission's own approval_audit / transmission_refs rows) is excluded
    // from this sweep entirely, exactly as if it were a genuine, non-eval row; `kept` is that count,
    // reported below by name so a caller can tell "cleaned" from "protected" apart. Delete order is
    // still FK-safe (every remaining child of `transmission` removed before `transmission` itself):
    // approval_audit and transmission_refs carry `transmission_id`/`tid REFERENCES transmission(id)`
    // as of migrate-031.sql, both queried here.
    // NAMED RESIDUAL RISK, not fixed here: `transmission.parent` self-references `transmission(id)`; a
    // KEPT (non-eval) row whose `parent` happens to name an eval-marked row being deleted would now
    // throw here too. Structurally implausible (a real transmission would not be parented by a test
    // fixture) and never observed live — but if it ever happens, this rewrite is what makes it a loud,
    // diagnosable error instead of a silent -1, which is the actual guarantee asked for.
    // sprint 6, 6.3 (PLATFORM §2 item 6: an owner owns one org): every statement below sweeps the ADMIN'S org alone (src/data.js
    // {org}, the org from the sign-in): its events, files, ledger rows, sign-in attempts and archived eval projects, never another
    // org's; its suites' handoff objects in R2 under its own org prefix (6.4).
    const del = async (sql, ...b) => { const r = await db(env).prepare(sql).bind(...b).run(); return r?.meta?.changes ?? 0; };
    // Every eval transmission id a check_results row still points at — never deleted, and neither is
    // anything that transmission owns. Interpolated as a literal subquery (not a bound param — D1/SQLite
    // bind lists can't carry a variable-length IN() cleanly) into each delete below; it reads no input,
    // so there is nothing here for a caller to inject.
    const KEPT_SQL = "SELECT DISTINCT transmission_id FROM check_results WHERE transmission_id IS NOT NULL";
    let events = null, artifacts = null, kept = null, transmissions = null, attempts = null, handoffs = null, swept = null;
    try {
      events = await del("DELETE FROM events WHERE COALESCE(json_extract(payload_json,'$.eval'),0)=1 AND org = {org}");
      // B7e C4: a banked fragment whose artifact is an eval transmission's report is a suite row (the composer banked it
      // unmarked before B7e) — removed with its transmission, BEFORE that row goes, or it would outlive the mark that
      // hides it from heartbeat. Counted with events.
      events += await del(`DELETE FROM events WHERE kind='fragment' AND org = {org} AND json_extract(payload_json,'$.artifactId') IN (SELECT report FROM transmission WHERE eval=1 AND org = {org} AND report IS NOT NULL AND id NOT IN (${KEPT_SQL}))`);
      // build0925:backfill-eval-integrity (2026-09-25): un-link BEFORE the artifact delete — any
      // transmission row that SURVIVES this sweep (an eval=0 row, or an eval row a check_results
      // grade keeps) must never be left pointing its `report` at an artifact deleted on the
      // next line. NULL is the honest state: the console renders no link (never a 404), and NULL
      // `report` is the backfill target, so the right-mode backfill re-covers the row.
      await del("UPDATE transmission SET report = NULL WHERE org = {org} AND report IN (SELECT id FROM artifacts WHERE (group_tag='eval' OR title LIKE 'eval-%') AND org = {org})");
      artifacts = await del("DELETE FROM artifacts WHERE (group_tag='eval' OR title LIKE 'eval-%') AND org = {org}");
      const keptRow = await db(env).prepare(
        `SELECT COUNT(*) AS n FROM (${KEPT_SQL}) k JOIN transmission t ON t.id = k.transmission_id WHERE t.eval = 1 AND t.org = {org}`
      ).first();
      kept = keptRow?.n ?? 0;
      // children of `transmission` FIRST (031's own FKs) — approval_audit before transmission_refs is
      // an arbitrary but fine order; both must land before the `transmission` delete two lines down,
      // which is the one that actually needs them gone. Each excludes anything check_results still
      // references (KEPT_SQL above) — never check_results itself, which this sweep never touches.
      await del(`DELETE FROM approval_audit WHERE org = {org} AND transmission_id IN (SELECT id FROM transmission WHERE eval=1 AND org = {org}) AND transmission_id NOT IN (${KEPT_SQL})`);
      await del(`DELETE FROM transmission_refs WHERE tid IN (SELECT id FROM transmission WHERE eval=1 AND org = {org}) AND tid NOT IN (${KEPT_SQL})`);
      transmissions = await del(`DELETE FROM transmission WHERE (eval=1 OR id LIKE 'T-evalorphan-%') AND org = {org} AND id NOT IN (${KEPT_SQL})`);
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      // build0920:the-invite-code-flow-is-gone (Q73F14080) removed the mint/redeem doors that ever
      // wrote an "invite:<ipKey>" login_attempts bucket or an invites row in the first place; the
      // LIKE clauses stay here only because a pre-existing org's D1 may still carry residue from
      // before this ruling landed — this sweep still clears it, it just never creates more.
      attempts = await del("DELETE FROM login_attempts WHERE (email LIKE '%.invalid' OR at < ? OR email LIKE 'invite:%') AND org = {org}", weekAgo);
      handoffs = 0;
      // sprint 6, 6.4: the suites' handoffs of the admin's org alone (src/storage.js: under its own org prefix)
      handoffs = await store(env).sweep(HANDOFF_EVAL_PREFIX);
      // the archived eval projects (migrate-062), each swept of what it held; an org before migrate-062 has none
      swept = 0;
      const evalProjects = await db(env).prepare("SELECT key FROM projects WHERE eval = 1 AND active = 0 AND +org = {org}").all()
        .then((r) => (r.results || []).map((x) => String(x.key)), (e) => { if (/no such column: eval/i.test(String((e && e.message) || e))) return []; throw e; });
      for (const k of evalProjects) { for (const sql of EVAL_PROJECT_SWEEP) await del(sql, k); swept++; }
      if (swept) { clearReqMemo(env); forgetOrgProjects(env); }
      flash = `Eval residue cleaned — events ${events} · artifacts ${artifacts} · check_results kept ${kept} · transmissions ${transmissions} · attempts ${attempts} · handoffs ${handoffs} · eval projects ${swept}.`;
    } catch (e) {
      // LOUD, not swallowed: the real DB/R2 error text, plus every count this run DID reach before it
      // failed (a `null` marks a step never attempted). Whatever succeeded above already committed —
      // D1 has no cross-statement transaction here, each `.run()` is its own commit — so this is an
      // honest partial-progress report, not a rollback claim.
      flash = `Eval residue clean FAILED — ${String((e && e.message) || e)} (reached: events ${events} · artifacts ${artifacts} · check_results kept ${kept} · transmissions ${transmissions} · attempts ${attempts} · handoffs ${handoffs} · eval projects ${swept}).`;
    }
  } else if (action === "set-role") {
    // UI-B12a D3a (Fork 2 option 1, Q76EFC99D): Make admin / Make seated. More than one admin is allowed, never zero. Admin
    // is role 'owner' (the one marker every door reads); seated writes add-person's default role. The demotion's last-admin
    // guard is ONE atomic UPDATE: it demotes only while ANOTHER real admin (never the suites' eval-fixed owner) stays active.
    // migrate-044: role admin | member | partner ("seated", the old word, is member). A member or partner change of an admin
    // is SET_ROLE_SQL's guarded demotion (another real admin must stay); of anyone else, a plain change of their role.
    const said = String(fd.get("role") || "").trim().toLowerCase();
    const want = said === "seated" ? SEATED_ROLE : said;
    if (!personId || (want !== "admin" && want !== SEATED_ROLE && want !== PARTNER_ROLE)) {
      flash = "Nothing done — set-role needs a person and a role (admin, member or partner).";
    } else {
      let cleared = false;
      const r = want === "admin"
        ? await db(env).prepare(SET_ADMIN_SQL).bind(personId).run()
        : want === PARTNER_ROLE
          ? await db(env).prepare(SET_ROLE_PARTNER_SQL).bind(want, personId, want, personId).run().then((x) => { cleared = true; return x; },
              (e) => { if (!noProfileCols(e)) throw e; return db(env).prepare(SET_ROLE_SQL).bind(want, personId, want, personId).run(); })
          : await db(env).prepare(SET_ROLE_SQL).bind(want, personId, want, personId).run();
      const target = await db(env).prepare("SELECT name, role, active FROM people WHERE id=? AND org = {org}").bind(personId).first();
      const who = (target && target.name) || "that person";
      const word = want === "admin" ? "an admin" : want === PARTNER_ROLE ? "a partner" : "a member";
      if (r?.meta?.changes > 0) flash = want === "admin" ? `${who} is now an admin.` : want === PARTNER_ROLE
        ? `${who} is now a partner: they see only the projects they are seated on.${cleared ? " Their access hats were cleared; set them again if needed." : ""}` : `${who} is now a member (not an admin).`;
      else if (!target || !target.active) flash = "Nothing done — that person is not known or not active.";
      else if (want === "admin" ? target.role === ADMIN_ROLE : target.role === want) flash = `Nothing done — ${who} is already ${word}.`;
      else flash = `Nothing done — ${who} is the last admin; the org needs at least one admin.`;
    }
  } else if (action === "set-access-hats") {
    // migrate-045: the hats that unlock briefings and cards for this person (src/hats.js readerKeys), the admin's alone: the
    // route's owner check, read-only and CSRF refusals stand in front of this (src/index.js /control). The list the form
    // sends is the whole list (no box ticked: no access hat). It changes no role and no seat, so it carries no last-admin
    // guard; an admin's own access hats change nothing they read (the owner reads everything) but are kept for the day
    // they are a member. One guarded UPDATE (active people only), then the audit trail, like a consent or a hat change.
    const access = accessHatsOf(fd);
    if (!personId) flash = "Nothing done — set-access-hats needs a person.";
    else if (access.unknown.length) flash = NOT_A_HAT(access.unknown);
    else {
      let r = null;
      try { r = await db(env).prepare(SET_ACCESS_HATS_SQL).bind(accessJson(access.hats), personId).run(); }
      catch (e) { if (!noProfileCols(e)) throw e; r = { refused: "schema" }; }
      if (r && r.refused) flash = "Nothing done — this org's database has not reached migrate-045 (access hats) yet.";
      else if (!(r?.meta?.changes > 0)) flash = "Nothing done — that person is not known or not active.";
      else {
        clearReqMemo(env);   // the people rows changed: this request reads them again
        const target = await db(env).prepare("SELECT name FROM people WHERE id=? AND org = {org}").bind(personId).first();
        const who = (target && target.name) || "That person";
        await db(env).prepare(
          "INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})"
        ).bind(uid(), null, (reader && reader.id) || personId, "access", JSON.stringify({ person: personId, accessHats: access.hats, surface: "/control", ...(isEvalSeat(personId) ? { eval: true } : {}) }), now()).run().catch(() => {});
        flash = access.hats.length ? `${who}'s access hats: ${hatWords(access.hats)}. A doc or card opened to ${access.hats.length === 1 ? "that hat" : "one of them"} opens to them now.`
          : `${who} holds no access hat now: they read what their role opens.`;
      }
    }
  } else if (action === "remove-person") {
    // M-ADR-033 C: a day-0 proof on a live org leaves a residue person row because
    // nothing removes one. ARCHIVE, never delete — ledger attribution (events.person_id,
    // transmission.submitter, artifacts.person_id, project_seats history, ...) must
    // survive a removed person; only `active` flips, the row and its id stay.
    if (!personId) {
      flash = "Nothing done — remove-person needs a person id.";
    } else if (reader && reader.id && personId === reader.id) {
      flash = "Nothing done — you can't remove your own account here.";
    } else {
      const target = await db(env).prepare("SELECT id, name, role, active, pending FROM people WHERE id=? AND org = {org}").bind(personId).first();
      if (!target) {
        flash = "Nothing done — that person is not known.";
      } else if (Number(target.pending) === 1) {
        // (A1) a seat still waiting for its holder's yes: the invitation is withdrawn (it stays an archived row, never active)
        const w = await db(env).prepare("UPDATE people SET pending = 0 WHERE id = ? AND pending = 1 AND org = {org}").bind(personId).run();
        if (w?.meta?.changes > 0) await db(env).prepare("DELETE FROM project_seats WHERE person_id = ?").bind(personId).run();
        flash = w?.meta?.changes > 0 ? `${target.name || "That person"}'s seat no longer waits: the invitation is withdrawn.` : `Nothing done — ${target.name || "that person"} is already inactive.`;
      } else if (!target.active) {
        flash = `Nothing done — ${target.name || "that person"} is already inactive.`;
      }
      // UI-B12a D3c: the last-admin guard counts REAL admins only (the suites' eval-fixed owner, active during a run, never
      // keeps the org "covered"), and it is the archive itself — ONE atomic statement, never a read-then-write, so two
      // concurrent removals (or a removal racing a set-role demotion) can never leave zero. A suite's own fixed owner may go.
      if (!flash) {
        const r = await db(env).prepare(REMOVE_PERSON_SQL).bind(personId, personId).run();
        if (!(r?.meta?.changes > 0)) {
          // nothing archived: the guard held, or the person went inactive underneath this request — say which
          const now2 = await db(env).prepare("SELECT active FROM people WHERE id=? AND org = {org}").bind(personId).first();
          flash = now2 && now2.active ? "Nothing done — that's the last active admin; the org needs at least one."
            : `Nothing done — ${target.name || "that person"} is already inactive.`;
        }
      }
      if (!flash) {
        // the seat's own SEAT sessions (the person is the admin's org's: target, above); an account session or grant stops reading
        // this seat now that it is inactive (B1: the one revocation rule)
        await db(env).prepare(REVOKE_SESSIONS_SQL).bind(personId).run();
        await revokeOAuthGrants(env, personId, { seatOnly: true });   // G2 M1: the grant store too (the door already refuses an inactive person)
        await db(env).prepare("DELETE FROM project_seats WHERE person_id = ?").bind(personId).run();
        await db(env).prepare(
          "INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})"
        ).bind(uid(), null, reader?.id || null, "correction", JSON.stringify({ removedPerson: personId, surface: "/control", ...(isEvalSeat(personId) ? { eval: true } : {}) }), now()).run();
        flash = `${target.name || "Person"} removed — archived (not deleted), their key/passphrase revoked, seats cleared; a session or app they connected with their own account passphrase no longer reads this org.`;
      }
    }
  } else if (action) {
    // Backlog #9 (measured 2026-09-01: an empty grant-seat once returned a
    // deceptive 200 with no refusal — a zsh no-word-split slip sent blank keys
    // and the page said nothing). A guarded action that falls through its own
    // field checks — or an unknown action string — refuses LOUDLY here instead
    // of silently doing nothing. 200 + flash, not 422: this is the owner's own
    // form flow, and the page IS the receipt.
    flash = "Nothing done — that action is missing a required field (or is not a known action).";
  }
  return flash;
}
