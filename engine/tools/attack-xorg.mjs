// tools/attack-xorg.mjs — THE cross-org attack suite (sprint 6, 6.6; docs/plan/PLATFORM.md §2 items 3 and 7, §5). One database
// holds every org: a statement that forgets the org shows up here as a row of the other org. Two orgs are seeded THROUGH THE DOOR
// with a little of everything (an aim, goals, a question and its answer, a check and its grade, a screen and its render, a card
// kind and its cards, docs one of them role-restricted, contributions one of them decided, a private file, a PUBLIC file, a
// session report, a version, an ask, an open item), each text carrying the org's own canary word. Then, in BOTH directions
// (org B's owner and member against org A, then org A's owner and member against org B):
//   · first, the victim's PEOPLE in the attacker's own fields (the sprint-6 review, finding 5): in its own project the attacker
//     files a contribution per victim person naming them as next.who (and depending on a victim's contribution) and, as an
//     owner, a ruled question per victim person naming them as decidedBy; every read after sees those rows, and their own
//     pages (the contribution's, the question's, Home, GTM, Build, read {ref}) are read back: a victim's NAME there (it carries
//     the victim's canary word) is an id -> name oracle across the wall. Instrument: the same rows naming the attacker's OWN id
//     show the attacker's own name;
//   · every MCP tool of tools/list (reads AND writes), with no argument and with the victim's project keys and ids in every
//     argument its schema names (a preview of items naming the victim's goal, contribution, check and question is also filed);
//   · every brain:// resource (resources/list, each template filled with the victim's refs), with and without ?project=;
//   · every GET route of GET /capabilities (its :params filled with the victim's ids; ?project=, ?ref=, ?id=, ?qid=), as a browser
//     and as a client; every POST route with JSON bodies naming the victim's ids, and POST /control's every action aimed at
//     the victim's people and projects.
// It asserts: NO answer carries a victim row (its canary word, a contribution id, a file id, a render hash, a preview id, a
// project key in a project field) beyond the values the attacker itself sent; NO answer is a 5xx; the victim's rows are
// UNCHANGED table by table (a write aimed across the wall lands nowhere: count and content hash of every table, by
// tools/org-undo.mjs's rule placing each — sign-in attempts aside: a sign-in at the root counts in the org it chose, which for a
// victim's typed email is the victim's); the attacker's credential still works at the end (a walk that locked itself out proves
// nothing).
// THE VICTIM'S ADDRESS (sprint 7, 7.4; PLATFORM §2 item 9): inside each walk, every GET route under /<victim>/… (its path, and with
// the victim's project) and every POST route once, as the attacker's bearer AND its browser session (signed in at the root by its
// seat's secret): each the ONE not-here answer (404, src/index.js NOT_HERE), nothing of either org; the instrument: its own
// address answers its session. --prove: the address's sign-in check and its one 404 reverted, each turns it red.
// THE ACCOUNT MOVES (sprint 7, 7.1; PLATFORM §2.8: one account per email, a seat per org), after both directions, each org's
// owner against the other, under the review's A1 (migrate-074: a seat an admin adds for an email whose account already stands
// elsewhere — its own passphrase, or a seat in another org — WAITS for its holder's yes, pending and inert): (1) it seats the
// victim's MEMBER's email in its own org — the seat must be PENDING and its key inert (401 at the door, refused at /mcp) —,
// tries Control's set-password on that seat (refused: account_elsewhere, a pending seat too), Reissues it (still pending, still
// inert), tries /profile with the key it holds (401), and tries to sign in as that email at the root with every value it holds
// (none signs in anywhere); (2) the squat: it seats a FRESH email first (no account yet: ACTIVE), the victim's owner seats the same
// email after (PENDING): before the holder's yes, nothing of the squatter's answers that seat — its key and its SEAT session on
// POST /orgs/seat, its /profile (which gives the account no passphrase) — and the victim's waiting key signs nothing in; then the
// email's holder signs up (the operator's code: its own passphrase, an ACCOUNT session) and accepts through POST /orgs/seat; after
// the yes the victim's new member signs in to the victim's org with the victim's own key (the old sign-in by email found the
// squatter's older row first: that member was shut out), and no value of the squatter's lands there. Asserted throughout: no
// sign-in by the attacker lands in the victim's org; the victim's accounts are unchanged; and (sprint 7, 7.4: the sign-in lives
// at the root, both directions) the victim's member still signs in as themselves with their own passphrase. The squat leaves the
// sign-in moves their set-up: an account seated in BOTH orgs whose attacker-side seat secret the attacker holds. Run where the walk's
// orgs are this process's (in-process, the smoke's local worker); the preview leaves it out (it would seat emails of ANOTHER org's
// people and leave accounts holding passphrases on the live database: tested in-process and locally, tools/accounts-selftest.mjs;
// the preview's own throwaway accounts — its owners' and members' emails — are removed by its cleanup).
// THE SIGN-UP MOVES (sprint 7, 7.2; PLATFORM §2 items 6 and 10: only the OPERATOR allows an email and mints its code, by hand),
// after the account moves, each org's owner against the other: (1) no route, for any seat, mints a code — the codes are
// unchanged across both walks (every tool and route) and across aimed calls (POST /control's would-be actions allow,
// allow-email, allowlist, signup-code, mint-code, invite; POST /signup asked to allow); (2) the operator (this suite, on the
// database, as tools/operator.mjs writes) allows a FRESH email of the attacker's and gives it the code; the attacker brings that
// code to POST /signup with the victim's member's and owner's emails: refused, the victim's accounts and sessions unchanged, and
// the passphrase it chose opens no seat of the victim's; the instrument: its own email with its own code signs up (200).
// THE INVITE MOVES (sprint 12, 12.3; src/accounts.js THE INVITE LINK: an org's admin mints a one-time link for a seat of its own
// org), after the sign-up moves, each org's owner against the other: its invite-link aimed at every victim person, and Invite with a
// link for the victim member's email (its seat waits: no link) — no link answered, no link row of the victim's; its link for a
// fresh email the victim seats after — refused account_stands, the account takes no passphrase; the squat by link (its own link
// redeemed by itself, then the victim seats the email) — the invite-made account sees, answers and reads nothing of the victim and
// creates no org; its link at the victim's address — the one 404, nothing spent — and at the root, its own org alone. Left out of
// the preview (it leaves seats, links and accounts holding passphrases on the live database). --prove: four guards reverted.
// THE ORG-CREATION MOVES (sprint 7, 7.3; POST /orgs: an account holder makes an org, its owner seat and its first project), after
// the sign-up moves, each org's owner against the other: it seats the victim OWNER's email in its own org and tries to create an
// org AS that account with the seat secret its Control minted (and with its own key): refused (invalid_account), the victim's
// account founds nothing; with its own operator-allowed account it asks for the victim org's address (org_name_taken) and nine
// of the platform's names (never made); then it creates its OWN org and reads, as that org's new owner, the victim's project,
// contribution and goal, Home, updates, Build, Control's people: nothing of the victim; the victim's rows unchanged; and no org
// of the database holds a reserved name. Left out of the preview (it would leave an org on the live database).
// THE ORG OF A CALL (sprint 7, 7.5a; PLATFORM §2 items 8 and 9: one /mcp; a call names its org, orgSlug, on every tool): in every
// walk each tool is also called with the VICTIM's org as orgSlug, and every such call must be refused org_unreachable (a key names
// one seat). THE GRANT MOVES, after the sign-up moves, each org's owner against the other: a fresh seat of its own and its account
// (the operator gives it a passphrase), connected through the REAL OAuth provider as a SEAT grant and as an ACCOUNT grant (no seat
// in the victim's org), each naming the victim's org on five tools and a resource: every one refused, the same answer as a name no
// org holds; the victim's rows unchanged. Left out of the preview (they leave a seat, a passphrase and grants on live).
// THE SIGN-IN SURFACES (sprint 7, 7.5b; PLATFORM §3, the sprint-6 review: the suite walked keys only): in each direction, the
// attacker's owner's READ-ONLY credential (derived from its key, ADR-050) walks every GET and POST route and the victim's address:
// nothing of the victim, its own org unchanged (it never writes), /mcp 401 — it writes nothing, so it runs on the preview too. After
// the account moves, THE SIGN-IN MOVES: the OAuth form and the root's sign-in with the squatted email (its account seated in both
// orgs, the victim's seat accepted by its holder) and the seat secret the attacker's Control minted for it must open the
// attacker's own seat alone (a seat grant, a seat session): the victim's org
// refused, its address the one 404, a code used twice gives no token, a refresh the same seat. After the grant moves, THE REACH
// AND COOKIE WALKS: its fresh account's ACCOUNT grant on every tool and resource; its account session and its seat session at the
// victim's address (the one 404) and at the root (pages never sent to the victim's address); /mcp takes no cookie. Then THE
// PARTNERS: a Partner seated nowhere and one seated on a project of its own walk every tool, resource and GET route with the
// victim's ids AND its own org's other project's ("the vault", filed with a canary of its own): nothing of either. --prove: each
// walk's own guard reverted turns it red, run alone (--only) and red by it. The count-leak differential walk and the cron are S8's.
// THE ACTIVITY ACROSS EVERY PROJECT (sprint 12, 12.5; src/activity.js activityAcross: `changes {org: true, list: true}` and its
// REST twin, GET /audit?all=1): every walk calls `changes` with each argument set again under {org: true, list: true} (and once
// {org: true}), its projects the victim's keys and slugs, its person the victim's people, its before a cursor naming the victim's
// contribution; GET /audit?all=1 (with ?in= the victim's project, ?who= the victim's person) and GET /changes?org=1&list=1 with the
// victim's project and person. After both directions, THE ACTIVITY WALK, each org's owner and member against the other: those
// calls once more, and — in-process only, where the suite writes the database — with a victim row filed under the ATTACKER's own
// project key (a key collision no door makes: the wall must hold even then; removed right after): nothing of the victim; the
// instrument, the attacker reads its own contributions there. --prove: the activity read's org filters, and the owner's project
// read's (projectsHeldBy), each reverted, the activity walk alone (--only activity), red by it.
// THE ONE RULED EXCEPTION (PLATFORM §2.7, owner 2026-10-06, ADR-055): a PUBLIC file read by its EXACT id (GET/HEAD
// /artifact/<id>, read_file {id}) answers from any org — asserted explicitly: it IS served to the attacker, and listed as the
// exception, never counted as a leak. The same file in any LIST is a leak like any row.
// Instruments (each "none" has its proof): the victim's owner reads its own canary through the same door; the attacker's
// reads answer (a walk of refusals proves nothing: the count of answered calls is printed and must be most of them).
//
//   node tools/attack-xorg.mjs            the gate step: an in-process world (the REAL src/index.js over node:sqlite, two orgs)
//   node tools/attack-xorg.mjs --prove    and then each named MUTATION (one org filter or guard removed from a copy of src/) must
//                                         turn it red — the suite can fail (--mutation <name>: that one alone)
//   (internal) --src <dir> --fail-fast [--only <walk>] [--run-dir <dir>]   the walk against another copy of src/ (a mutant),
//                                         stopping at the first finding; --only signin | reach | readonly | partner | invite | activity: the seed and
//                                         that 7.5b walk alone; --run-dir keeps each 5xx's answer there (the fivexx-kept mutation)
// The smoke's `xorg` case (tools/smoke/s36b-xorg.mjs) runs attack() against the real local worker (wrangler dev).
//
// THE PREVIEW (PLATFORM §5: "the canary reaches every org, so the preview runs the cross-org suite before any traffic moves";
// tools/ship.sh runs it on every version preview, after the preview smoke and before the preview hook and the 10% canary):
//   node tools/attack-xorg.mjs --url <the version preview URL> --live --config wrangler.jsonc --live-write-ok [--creds <file>]
//        [--run-dir <dir>]
//   node tools/attack-xorg.mjs --url http://127.0.0.1:<port> --local <persist dir> --config <wrangler config> [--run-dir <dir>]
// The preview serves the NEW code over the LIVE database, so the walk never names org 1: two THROWAWAY orgs are restored into
// the database the worker serves by tools/org-undo.mjs (planRestore + loadRestore of fixtureExport() below: an org row, its
// owner and member, two projects; each under the next free id, ≥ 2), each owner's fresh key held in memory only (its seat secret
// too: the key's pbkdf2); each org's member gets its key through the door (the owner's POST /control rotate-key, which makes it the
// member's seat secret as well); then the same attack() as the gate, both directions — with the browser session REQUIRED under the
// victim's address (the sprint-7 review, D1: each attacker signs in at the root by its email and seat secret; a walk without one is
// a finding, never a silent bearer-only note; the summary counts the address's calls by credential and prints every note); then
// BOTH orgs are deleted through org-undo.mjs (export, then delete naming the org by this run's name) — in a finally, and on
// SIGINT/SIGTERM, whatever failed before — and then the platform ACCOUNTS their four emails made (migrate-070: an @example.com
// email per owner and member) through tools/operator.mjs removeAccount (D6: none left on the live database). <run-dir>/orgs.json
// records each org BEFORE it is written (its id, its name, its state, its emails and whether their accounts are removed: never a
// key), so `--cleanup <run-dir>` (the same backend flags) removes what a killed run left, accounts included. A 5xx KEEPS ITS ANSWER
// (sprint 10, 10.5: the sprint-9 ship's one 500 kept only its line, and the preview's Workers Logs held none): <run-dir>/fivexx.json
// holds each one's who, what, status and its first 2 KB, every key, session, passphrase and bearer value redacted before the cut
// (answerOf), and the red verdict line names the file; attack()'s report carries them as fivexxAnswers (the smoke's, no file).
// REFUSALS (exit 1, nothing written; 2 on a usage error): --live without --live-write-ok; --live with a --url that is not this
// worker's VERSION PREVIEW (https://<8 hex>-<worker>.<sub>.workers.dev: the production route answers every org with the old
// code); --local with a --url that is not this machine; a --creds file that does not exist; a /health that does not answer
// 200; a restore whose new id would be org 1 (HOME_ORG) or the other throwaway's; a restored owner who does not sign in at
// --url (the URL and the database are not one deployment: cleaned, then refused). The cleanup touches only an org of this
// run: an id ≥ 2 whose org row still carries this run's name (a row of another name is reported, never deleted). A delete is
// done when org-undo's delete says ok — the org at 0 everywhere, and the other orgs by its rule for the backend (--local exactly
// as before; --live none fewer than before: org 1 takes writes meanwhile, a note) — and its row and prefix are gone.
// EVAL-MARKED, for the OLD code (the sprint-6 review, finding 14): while the walk runs, the live traffic is still served by the
// previous, org-blind version, which reads the throwaway orgs' rows as its own org's. So the throwaway orgs are written as a
// suite's rows: eval projects (projects.eval = 1), the member one of the suites' fixed seats (eval-fixed-…; the owner cannot be:
// a restore takes the export's first REAL owner, tools/restore-local.mjs ownerOf), and every call of the seed and of the walk
// that takes an eval mark carries one (a read too, so the victim's marked rows are in every answer that could leak them: the
// instrument, its owner reads its own eval-marked contributions). After the walk the run says, per org, the rows the old code's
// eval filters do not hide (on a local run: "people (Control)" 1 — the owner —, everything else 0). The sprint-5 code (main) still shows,
// whatever the marks: to org 1's OWNER, the two project keys and names in /projects, the picker at / and /profile, whoami's
// writeProjects, an MCP "Add project: one of […]" note and a project_required refusal, and changes {org: true} (a row each,
// 0 counted); every event of the orgs on /log and their files' bytes on /storage; the throwaway owner on Control's people
// (its id is not a fixed seat's); and, should the owner open a throwaway project from the picker, its knowledge (k_* carries
// no mark). To ANYONE of org 1: +2 in Map · Arch's project count and home's whoIsHere.projects (JSON), and the throwaway
// owner as an "admin" in Home's who-is-here ONLY if its email did not land (the old HOME_SEATS lists every role-owner person
// not seated on the project, and Home drops a fixture's: a fixed seat or an @example.com email — the run's "people (Home)"
// count says which). The old code also takes a throwaway owner's key as an owner of org 1 (it reads no org): the
// key lives in this process's memory only, for the walk's minutes, and is never printed. Every other old screen hides them by
// its eval filters (the transmission and event marks, the fixed-seat prefix, the eval group of a file); its cron writes
// nothing for an eval row.
// COST on live (Workers Paid): the walk is ~6,000 worker requests against the preview (the gate's count: both directions, each
// org's owner and member), each reading a few rows of a two-person org; the operator's D1 API calls are a few hundred (the
// restore, the facts, a count-and-hash snapshot per direction, the export and delete of each org). The deploy waits ~10-20 min.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileParts } from "./import/door.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const brief = (v) => JSON.stringify(v).slice(0, 300);
// a canary: letters only (one search word, untouched by any escaping), unique to this run
export const canary = (tag) => tag + randomBytes(6).toString("hex").replace(/[0-9]/g, (d) => "ghijklmnop"[d]);

// ---- the mutations: each removes ONE org filter from a copy of src/ (the suite must then go red) ----
export const MUTATIONS = [
  { name: "files-list", file: "src/core.js", from: "AND a.title NOT LIKE 'fragment %' AND a.org = {org}\";", to: "AND a.title NOT LIKE 'fragment %'\";",
    why: "the files list (read_file {}, GET /artifacts) without its org filter" },
  { name: "audit", file: "src/index.js", from: "const clauses = [...AUDIT_BASE_CLAUSES, \"e.org = {org}\"];", to: "const clauses = [...AUDIT_BASE_CLAUSES];",
    why: "the activity log (GET /audit) without its org filter" },
  { name: "owner-projects", file: "src/core.js", from: "return ((await db(env).prepare(\"SELECT key, name FROM projects WHERE active = 1 AND org = {org} ORDER BY slug LIMIT 200\")",
    to: "return ((await db(env).prepare(\"SELECT key, name FROM projects WHERE active = 1 ORDER BY key LIMIT 200\")", why: "an owner's projects without their org filter" },
  { name: "names-pickup", file: "src/pickup.js", from: "FROM people WHERE id IN (SELECT value FROM json_each(?1)) AND org = {org}", to: "FROM people WHERE id IN (SELECT value FROM json_each(?1))",
    why: "the review's finding 2 put back: a contribution page names next.who's person by id without the org" },
  { name: "names-decider", file: "src/decisions.js", from: "SELECT name FROM people WHERE id = ? AND org = {org}", to: "SELECT name FROM people WHERE id = ?",
    why: "the review's finding 3 put back: a question page names decidedBy's person by id without the org" },
  { name: "names-followups", file: "src/pickup.js", from: "LEFT JOIN people w ON w.id = t.next_who AND w.org = {org} WHERE", to: "LEFT JOIN people w ON w.id = t.next_who WHERE",
    why: "the follow-ups' sibling put back: Home and GTM name next.who's person by id without the org" },
  { name: "account-by-seat-proof", file: "src/secrets.js", from: "    if (provedAccount) {\n", to: "    if (ok) {\n",
    why: "sprint 7: a seat's credential (which its org's admin holds) sets the account's passphrase — the other org's admin signs in as the person at the victim's address" },
  { name: "signup-code-unbound", file: "src/accounts.js", from: "db(env).prepare(SIGNUP_OPEN_SQL).bind(e).first()",
    to: "db(env).prepare(SIGNUP_OPEN_SQL.replace(\"email = ?1\", \"code_hash = ?1\")).bind(hash).first()",
    why: "sprint 7, 7.2: a sign-up code found by itself, not by its email — the code the operator gave for one email signs up the victim's (the attacker's passphrase on the victim's account)" },
  { name: "org-by-seat-secret", file: "src/orgs.js", from: "if (proof.verdict !== \"ok\" || !proof.account) return", to: "if (!proof.account) return",
    why: "sprint 7, 7.3: any value proves an existing account to the org creation — the attacker creates an org AS the victim owner's account with the seat secret its own Control minted (an owner seat on the victim's account, its key the attacker's)" },
  { name: "address-unchecked", file: "src/data.js", from: "  if (s.address && s.address.org !== org) throw orgError(\"org_mismatch\", \"the address serves another org\");\n", to: "",
    why: "sprint 7, 7.4: a sign-in under another org's address is not refused — a bearer of org B reads at /<org A>/… (the address no longer picks the org)" },
  { name: "address-tells-membership", file: "src/index.js", from: "if (await credentialLive(request, env).catch((e) => { if (isD1Quota(e)) throw e; return false; })) return NOT_HERE();", to: "",
    why: "sprint 7, 7.4: a live credential with no seat at an org's address is sent to sign in instead of the one 404 — the answer tells the org exists and the caller is not in it" },
  { name: "org-arg-unchecked", file: "src/mcp.js", from: "    const refused = await orgArgRefused(isObj(a) ? a.orgSlug : undefined, person, env);\n    if (refused) return refused;\n", to: "",
    why: "sprint 7, 7.5a: a call's orgSlug naming another org is not refused — a key or a seat grant of org B names org A and the call runs (in its own org: the refusal is the wall's word that the call acts nowhere else)" },
  // sprint 7, 7.5b: the sign-in surfaces — each walk's own guard reverted, that walk alone (only), red by it (expect)
  { name: "oauth-seat-secret-account-grant", file: "src/oauth.js", only: "signin", expect: /the sign-in moves/,
    from: 'if (signin.session === "account" && signin.account && signin.account.id && signin.account.pass_hash) {', to: "if (signin.account && signin.account.id && signin.account.pass_hash) {",
    why: "7.5b, the OAuth form: a seat's own secret makes an ACCOUNT grant — the other org's admin, holding a seat secret of an account seated in the victim's org too (its own Control minted it), connects as that account and reaches the victim's seat" },
  { name: "cookie-seat-secret-account-session", file: "src/accounts.js", only: "signin", expect: /sign-in moves\) · its session/,
    from: 'const accountId = r.session === "account" && r.account ? r.account.id : null;', to: "const accountId = r.account ? r.account.id : null;",
    why: "7.5b, the cookie: a sign-in by a seat's own secret mints an ACCOUNT session — under the victim's address it reads as the account's seat there" },
  { name: "account-grant-any-seat", file: "src/accounts.js", only: "reach", expect: /reach and cookie walks\) · its ACCOUNT grant/,
    from: "FROM accounts a JOIN people p ON p.account_id = a.id AND p.active = 1 WHERE", to: "FROM accounts a JOIN people p ON (p.account_id = a.id OR p.org = (SELECT o.id FROM org o WHERE o.slug = ?2)) AND p.active = 1 WHERE",
    why: "7.5b, the grant's reach: an account grant acts as ANY active seat of the org a call names, not only its account's — its every tool naming the victim's org reads the victim" },
  { name: "read-only-anywhere", file: "src/core.js", only: "readonly", expect: /READ-ONLY credential/,
    from: "  if (!readOnlyOk) return null;\n  // the read-only credential, as a Bearer header (ADR-050), on a read-only route only", to: "  // the read-only credential, as a Bearer header (ADR-050), on a read-only route only",
    why: "7.5b, the read-only credential: accepted on every route, not only the read-only ones — it writes and reaches /mcp" },
  { name: "partner-unseated-project", file: "src/project.js", only: "partner", expect: /PARTNER/,
    from: "    if (d.error || d.project !== named) {", to: "    if (false) {",
    why: "7.5b, the Partner: a NAMED project is read without a seat on it (the project rule's first line reverted) — a Partner seated nowhere, or on another project, reads its org's project it holds no seat on" },
  { name: "preview-by-id", file: "src/preview.js", from: "    if (!p) return null;\n    if (p.name) projectName = p.name;", to: "    if (p && p.name) projectName = p.name;",
    why: "a preview page by its id without its project's org (the leak this suite found: org 1's bare key resolved as the reader's slug)" },
  // sprint 12, 12.3: the invite moves — each guard reverted, the invite walk alone, red by it
  { name: "invite-mint-any-org", only: "invite", expect: /the invite moves/,
    // (sprint 12's review) and the seat's use read (src/accounts.js INVITE_SEAT_USE_SQL), its second {org} wall
    edits: [["src/admin.js", "FROM people WHERE id = ? AND org = {org} AND active = 1 AND pending = 0 AND email IS NOT NULL AND trim(email) <> ''\";\nexport const INVITE_REVOKE_SQL = \"UPDATE seat_invites SET revoked_at = ?1 WHERE person_id = ?2 AND org = {org} AND used_at IS NULL AND revoked_at IS NULL\";\nexport const INVITE_MINT_SQL = \"INSERT INTO seat_invites (id, org, person_id, email, token_hash, seat_stamp, created_by, created_at, expires_at) \" +\n  \"SELECT ?1, {org}, p.id, lower(trim(p.email)), ?2, ?3, ?4, ?5, ?6 FROM people p WHERE p.id = ?7 AND p.org = {org} AND",
      "FROM people WHERE id = ? AND active = 1 AND pending = 0 AND email IS NOT NULL AND trim(email) <> ''\";\nexport const INVITE_REVOKE_SQL = \"UPDATE seat_invites SET revoked_at = ?1 WHERE person_id = ?2 AND org = {org} AND used_at IS NULL AND revoked_at IS NULL\";\nexport const INVITE_MINT_SQL = \"INSERT INTO seat_invites (id, org, person_id, email, token_hash, seat_stamp, created_by, created_at, expires_at) \" +\n  \"SELECT ?1, {org}, p.id, lower(trim(p.email)), ?2, ?3, ?4, ?5, ?6 FROM people p WHERE p.id = ?7 AND"],
      ["src/accounts.js", "LEFT JOIN accounts a ON a.id = p.account_id WHERE p.id = ?1 AND p.org = {org}\";", "LEFT JOIN accounts a ON a.id = p.account_id WHERE p.id = ?1\";"]],
    why: "12.3, the mint: an admin's invite-link reads and links ANY org's seat by its id — the other org's admin mints a link for the victim's member, redeems it, and holds that account's passphrase" },
  { name: "invite-stands-unchecked", file: "src/accounts.js", only: "invite", expect: /the invite moves/,
    from: 'export const INVITE_OTHER_SEAT = "EXISTS (SELECT 1 FROM people x WHERE x.account_id = p.account_id AND x.id <> p.id AND (x.active = 1 OR x.pending = 1))";', to: 'export const INVITE_OTHER_SEAT = "0";',
    why: "12.3, the redemption: a link sets the passphrase of an account seated in another org — the attacker's link, after the victim seated the same email, gives the account (and the victim's waiting seat's yes) the attacker's passphrase" },
  { name: "invite-squat-answers", file: "src/accounts.js", only: "invite", expect: /the invite moves/,
    from: 'const INVITED_ELSEWHERE = " AND NOT EXISTS', to: 'const INVITED_ELSEWHERE = "" && " AND NOT EXISTS',
    why: "12.3, the mark: an invite-made account (its passphrase the inviting admin's to hold) answers another org's waiting seat — the attacker redeems its own link, the victim seats the email, the attacker accepts the victim's seat" },
  { name: "invite-org-by-invite", file: "src/orgs.js", only: "invite", expect: /the invite moves/,
    edits: [["src/orgs.js", '  if (proof.verdict === "invited") return { error: "org_by_invite", status: 403 };\n', ""],
      ["src/orgs.js", '  if (proof.verdict !== "ok" || !proof.account) return', '  if ((proof.verdict !== "ok" && proof.verdict !== "invited") || !proof.account) return']],
    why: "12.3, the waitlist: an invite-made account creates an org — any approved org's admin mints org creators past the owner's approval" },
  // sprint 12, 12.5: the activity walk — each org filter reverted, the activity walk alone, red by it. The activity read's org
  // filters go together (edits): each project's scan is by a key of the reader's own set, and its shown rows are read again by
  // primary key AND the org, so one of them alone leaks nothing even under a key collision (the walk plants one)
  { name: "activity-any-org", only: "activity", expect: /the activity walk/,
    edits: [["src/activity.js", "export const ACTIVITY_SCAN_SQL = (le) => SCAN_COLS + \"WHERE t.project = ?1 AND +t.org = {org} AND", "export const ACTIVITY_SCAN_SQL = (le) => SCAN_COLS + \"WHERE t.project = ?1 AND"],
      ["src/activity.js", "export const ACTIVITY_MOMENT_SQL = SCAN_COLS + \"WHERE t.project = ?1 AND +t.org = {org} AND", "export const ACTIVITY_MOMENT_SQL = SCAN_COLS + \"WHERE t.project = ?1 AND"],
      ["src/activity.js", "JOIN transmission t ON t.id = j.value AND t.org = {org} LEFT JOIN", "JOIN transmission t ON t.id = j.value LEFT JOIN"]],
    why: "12.5: the activity read (each project's scan and its shown rows) without its org filter — a row of the victim's filed under a key the attacker reads is listed as the attacker's activity" },
  { name: "activity-owner-projects", file: "src/core.js", only: "activity", expect: /the activity walk/,
    from: "return ((await db(env).prepare(\"SELECT key, name FROM projects WHERE active = 1 AND org = {org} ORDER BY slug LIMIT 200\")",
    to: "return ((await db(env).prepare(\"SELECT key, name FROM projects WHERE active = 1 ORDER BY key LIMIT 200\")",
    why: "12.5: the owner's readable projects (projectsHeldBy) without their org filter — Activity across every project lists, and reads, the victim's projects" },
  // sprint 10, 10.5 (the sprint-9 ship's one 500, whose answer was never kept): one route answers 500, its body echoing the
  // caller's credentials — red by the 5xx, and its answer KEPT (kept: the child runs with --run-dir; keptRefusal reads the file).
  // The review's M2: the echo is a browser SESSION (its cookie header, and its "t_" token bare, which no 40-hex pattern bounded by
  // \b catches) and the PASSPHRASE the suite tries (TRIED_PASSPHRASE, in no key's shape): only the held list redacts it. The walk's
  // first such call: the victim's address, POST /<victim>/control as the attacker's session (walk()'s address section)
  { name: "fivexx-kept", file: "src/index.js", kept: true, expect: /· POST \/\S+\/control (?:as its session|\(its session\)) -> 500/,
    from: "        const res = await routeRequest(request, tenv, ctx);\n",
    to: "        { const ck = request.headers.get(\"cookie\") || \"\"; if (request.method === \"POST\" && path.endsWith(\"/control\") && ck.includes(\"__Host-ar_session=\")) { const pw = new URLSearchParams(await request.clone().text()).get(\"password\") || \"\"; if (pw) return new Response(\"mutant 10.5: POST /control threw (D1_ERROR) — the caller sent \" + ck + \", its session \" + ck.split(\"__Host-ar_session=\")[1].split(\";\")[0] + \", its passphrase \" + pw, { status: 500 }); } }\n        const res = await routeRequest(request, tenv, ctx);\n",
    why: "10.5: POST /control answers 500, its body echoing the caller's session (cookie and bare token) and the passphrase it sent — the suite goes red by the 5xx and keeps the answer in <run dir>/fivexx.json (who, what, status, the body's first bytes, the session and the passphrase redacted)" },
];

// ---- the seed: one org's canary rows, through the door, as its owner (and an answer as its member) ----
// door(target) -> { mcp(key, name, args), http(method, path, { key, body, form, accept }) } over target.call
// sprint 7, 7.5b: a credential is a bearer key (a string) or a browser session ({ cookie: <token> }): the cookie walks pass the
// latter wherever a key goes (an http call, an MCP call at the root's /mcp: its own seat, src/mcp.js callerOf's anchorCookie)
function door(target) {
  let n = 0;
  const http = async (method, path, { key, body, form, accept = "application/json", cookie } = {}) => {
    const headers = { accept };
    if (key && typeof key === "object" && key.cookie) cookie = key.cookie;
    else if (key) headers.authorization = "Bearer " + key;
    // a browser's session (sprint 7, 7.4: it signs in only under its org's address), sent as a same-origin browser does
    if (cookie) { headers.cookie = "__Host-ar_session=" + cookie; headers["sec-fetch-site"] = "same-origin"; }
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    holdSent(key, cookie, form, body);
    const r = await target.call(method, path, { headers, body: payload });
    holdMinted(r && r.text);
    return r;
  };
  const rpc = async (key, method, params) => {
    const r = await http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: ++n, method, ...(params ? { params } : {}) } });
    let j = null; try { j = JSON.parse(r.text); } catch { j = null; }
    return { ...r, json: j };
  };
  const mcp = async (key, name, args = {}) => {
    const r = await rpc(key, "tools/call", { name, arguments: args });
    const res = r.json && r.json.result;
    let out = null; try { out = JSON.parse(res.content[0].text); } catch { out = res ? res.content && res.content[0] && res.content[0].text : (r.json && r.json.error) || r.text; }
    return { status: r.status, text: r.text, out, isError: !res || !!res.isError };
  };
  return { http, rpc, mcp };
}
// fileWith(D, key, previewAnswer, items, onCall?) -> fileParts' answer { ok, out, step, parts }: each part the preview answers
// with its write tool (file_contribution, save_knowledge, remove_knowledge) and its items as previewed, over D.mcp; onCall(tool,
// the raw answer) sees every call (the sweep's look, a call count)
const fileWith = (D, key, pv, items, onCall) => fileParts(async (n, a) => { const r = await D.mcp(key, n, a); if (onCall) onCall(n, r); return { ok: !r.isError, out: r.out }; }, pv, items);
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAGX8C/V8+/0LAAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));

// seedOrg(target, o) -> the facts its seeding answered: o = { word, owner, member (keys), project (its key as the org names it),
// eval (the preview's throwaway orgs: every write that takes an eval mark carries one, every file is the eval group's, so the
// old code serving the live traffic meanwhile hides them as it hides a suite's rows — the sprint-6 review, finding 14) }
export async function seedOrg(target, o) {
  const D = door(target), W = o.word, w = W.toLowerCase(), P = o.project;
  const E = o.eval ? { eval: true } : {}, grp = o.eval ? "eval" : "xorg", ttl = (t) => (o.eval ? `eval-${t}` : t);
  const fail = (what, r) => { throw new Error(`seed ${W}: ${what}: ${brief(r && (r.out || r.text))}`); };
  const file = async (key, items, project = P) => {
    const pv = await D.mcp(key, "preview", { project, items, ...E });
    if (pv.isError || !pv.out || !pv.out.previewId) fail("preview", pv);
    const stuck = (pv.out.items || []).filter((it) => it.verdict === "needs" || it.verdict === "refused");
    if (stuck.length) fail("preview items", { out: stuck });
    // sprint 19: each part through its write tool (file_contribution, save_knowledge, remove_knowledge), its items as previewed
    const results = [], filed = [];
    for (const part of pv.out.parts || []) {
      const f = await D.mcp(key, part.tool, { previewId: pv.out.previewId, items: part.items.map((n) => items[n - 1]) });
      if (f.isError || !f.out || f.out.error) fail(part.tool, f);
      results.push(...(f.out.results || [])); filed.push(...(f.out.items || []));
    }
    return { preview: pv.out.previewId, results, items: filed };
  };
  const node = `screen:${w}-home`, check = `AC.${w}.1`, qid = `Q-${w}-1`, kind = `${w}claim`;
  // a project holds one root goal: under the one it already holds, if any
  const tree = await D.mcp(o.owner, "read", { project: P, kind: "goal", limit: 100 });
  const root = ((tree.out && tree.out.items) || []).find((g) => !g.parent);
  const k = await file(o.owner, [
    { kind: "aim", op: "upsert", data: { aim: `Aim of ${W}`, measure: { name: `${W} teams`, value: 3, source: `${W} ledger` } } },
    { kind: "goal", op: "upsert", data: { id: `${w}-root`, title: `Grow ${W}`, parent: root ? root.id : null, dimensions: ["leader"] } },
    { kind: "goal", op: "upsert", data: { id: `${w}-leaf`, title: `Ship ${W}`, parent: `${w}-root`, dimensions: ["code"] } },
    { kind: "question", op: "upsert", data: { qid, question: `Which way for ${W}?`, whoOwes: "owner", options: [{ what: `${W} left` }, { what: `${W} right` }] } },
    { kind: "node", op: "upsert", data: { id: node, type: "screen", name: `${W} home`, status: "planned", data: { surface: `${w}-app`, lane: "buy", step: 1 } } },
    { kind: "check", op: "upsert", data: { id: check, title: `${W} home shows`, refs: [node] } },
    { kind: "render", op: "upsert", data: { screen: node, state: "default", variant: "live", format: "html", body: `<p>${W} render</p>` } },
    { kind: "card_kind", op: "upsert", data: { key: kind, label: `${W} claims`, tab: "gtm" } },
    { kind: "card", op: "upsert", data: { kind, id: `${w}-c1`, name: `${W} claim`, body: `# ${W} claim\n` } },
    { kind: "doc", op: "upsert", data: { path: `gtm/${w}.md`, title: `${W} plan`, body: `# ${W} plan\n` } },
    { kind: "doc", op: "upsert", data: { path: `notes/${w}.md`, title: `${W} secret notes`, body: `# ${W} secret\n`, roleVisibility: ["finance"] } },
  ]);
  const c = await file(o.owner, [
    { contribution: { lane: "leader", kind: "note", what: `${W} note`, why: `${W} why` } },
    { contribution: { lane: "vendor", kind: "scope", what: `${W} vendor scope`, why: `${W} needs the owner`, touches: [`${w}-scope`] } },
    { contribution: { lane: "code", kind: "pr", what: `${W} home built`, why: `${W} screen`, touches: [node], proof: "npm test -> exit 0" } },
  ]);
  const tx = c.results.map((x) => x.id).filter(Boolean);
  if (tx.length !== 3) fail("contributions", { out: c.results });
  const g = await D.mcp(o.owner, "submit_grade", { project: P, checkId: check, verdict: "proven", proof: "GET /home -> 200", ...E });
  if (g.isError) fail("grade", g);
  const d = await D.mcp(o.owner, "decide_contribution", { id: tx[1], verdict: "approve", note: `${W} ok` });
  if (d.isError) fail("decide", d);
  const a = await D.mcp(o.member, "respond", { project: P, qid, option: 0, ...E });
  if (a.isError) fail("answer", a);
  const priv = await D.mcp(o.owner, "save_file", { content: `<p>${W} private</p>`, title: ttl(`${W} private`), group: grp });
  const pub = await D.mcp(o.owner, "save_file", { content: `<p>${W} public</p>`, title: ttl(`${W} public`), group: grp, public: true });
  if (!priv.out || !priv.out.id || !pub.out || !pub.out.id) fail("files", { out: [priv.out, pub.out] });
  // a picture banked by POST /artifact (its id is read with the facts)
  await target.call("POST", `/artifact?title=${encodeURIComponent(ttl(`${W} picture`))}&group=${grp}`, { headers: { authorization: "Bearer " + o.owner, "content-type": "image/png", accept: "application/json" }, body: PNG });
  const wr = await D.mcp(o.owner, "wrap_up", { project: P, summary: `${W} session`, ...E });
  if (wr.isError) fail("wrap_up", wr);
  const v = await D.mcp(o.owner, "publish_version", { project: P, title: `${W} v1`, ...E });
  if (v.isError) fail("version", v);
  const ask = await D.mcp(o.member, "ask", { question: `${W} ask?`, about: `${W} about`, project: P, ...E });
  const item = await D.mcp(o.owner, "open_items", { title: `${W} open item`, ref: node });
  if (ask.isError || item.isError) fail("ask / open item", { out: [ask.out, item.out] });
  return { word: w, project: P, eval: !!o.eval, node, check, qid, kind, card: `${w}-c1`, goal: `${w}-root`, doc: `gtm/${w}.md`, tx, preview: c.preview, file: priv.out.id, pub: pub.out.id,
    item: item.out && (item.out.id || (item.out.item && item.out.item.id)) };
}

// ---- what a leak looks like ----
const PROJECT_FIELDS = new Set(["project", "key", "activeProject", "projects", "writeProjects", "seats", "yourProjects", "projectKey"]);
// variantsOf(v) -> the spellings an echo of v takes in an answer (raw, URL-encoded, HTML-escaped) and its parts (goal/x -> x)
function variantsOf(v) {
  const s = String(v), out = new Set([s, encodeURIComponent(s), s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\//g, "&#x2F;"), s.replace(/\//g, "\\/")]);
  for (const part of s.split(/[/|]/)) if (part.length >= 3) out.add(part);
  if (/^o\d+--./.test(s)) out.add(s.replace(/^o\d+--/, ""));   // a project key's echo by its slug (12.5: a refusal names the projects it refused by slug)
  return [...out].filter((x) => x.length >= 3);
}
// sentOf(x) -> every string value the caller named (a tool's arguments flattened; a path's segments and query values; a form)
function sentOf(x) {
  const out = new Set();
  const add = (v) => { if (Array.isArray(v)) v.forEach(add); else if (v && typeof v === "object") Object.values(v).forEach(add); else if (v != null && v !== "") out.add(String(v)); };
  if (typeof x === "string") { const [p, q = ""] = x.split("?"); p.split("/").forEach((seg) => { try { add(decodeURIComponent(seg)); } catch { add(seg); } }); for (const [, v] of new URLSearchParams(q)) add(v); }
  else add(x);
  return out;
}
// leaksOf(text, V, planted) -> what of the victim V an answer carries, beyond every value the attacker ever sent (`planted`: a
// value the attacker wrote may come back as its own data)
// A value is cut where it stands whole (never inside a longer token), so a value naming the victim (its goal id, a search
// prefix) never cuts the canary word out of a title that leaked beside it.
const RX = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function leaksOf(text, V, planted) {
  let t = String(text).replace(/\\"/g, '"').replace(/\\u002[fF]/g, "/");
  const cut = [...planted].flatMap(variantsOf).sort((a, b) => b.length - a.length);
  for (const s of cut) if (t.includes(s)) t = t.replace(new RegExp(`(?<![A-Za-z0-9])${RX(s)}(?![A-Za-z0-9])`, "g"), " ");
  // an echo cut short for a column ("AC.<word>..." of a sent "AC.<word>.1") is the same echo
  const sentList = [...planted].map(String);
  t = t.replace(/(?<![A-Za-z0-9])([A-Za-z0-9_.:/-]{3,}?)(\.\.\.|…)/g, (m, head) => (sentList.some((s) => s.startsWith(head)) ? " " : m));
  const low = t.toLowerCase(), out = [];
  if (low.includes(V.word)) { const i = low.indexOf(V.word); out.push(`the canary «${t.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, " ")}»`); }
  // an id where it stands whole (T-20261006-142 is not inside T-20261006-1424): one pattern per victim, built once
  if (V.idRe === undefined) V.idRe = V.ids.length ? new RegExp(`(?<![A-Za-z0-9_-])(?:${V.ids.map(RX).join("|")})(?![A-Za-z0-9_])`, "g") : null;
  if (V.idRe) for (const m of new Set(t.match(V.idRe) || [])) out.push(`id ${m}`);
  if (V.prefix && t.includes(V.prefix)) out.push(`a project key ${V.prefix}…`);
  let j = null; try { j = JSON.parse(t); } catch { j = null; }
  const walk = (v, k) => {
    if (Array.isArray(v)) { for (const x of v) walk(x, k); return; }
    if (v && typeof v === "object") { for (const [kk, x] of Object.entries(v)) walk(x, kk); return; }
    if (typeof v === "string" && PROJECT_FIELDS.has(k) && V.keys.has(v)) out.push(`${k}: ${v}`);
  };
  if (j) walk(j, "");
  for (const m of t.matchAll(/[?&](?:amp;)?project=([a-z0-9-]+)/g)) if (V.keys.has(m[1])) out.push(`?project=${m[1]}`);
  return [...new Set(out)];
}

// ---- the arguments and bodies aimed at the victim ----
const DEFAULTS = { verdict: "approve", proof: "GET / -> 200", option: 0, choice: 0, confirm: true, content: "<p>x</p>", title: "an item", summary: "a session",
  question: "a question?", name: "A name", note: "a note", rationale: "why", done: true };
const REQUIRED = { decide_contribution: ["verdict"], submit_grade: ["verdict", "proof"], respond: ["option"], rule_question: ["choice"], save_file: ["content", "title"],
  wrap_up: ["summary"], ask: ["question"], open_items: ["title"], create_project: ["name"], publish: ["confirm"], equip: ["confirm"], regrade: [] };
const VERDICTS = { submit_grade: "proven" };
// slugsOf(V) -> the victim's project slugs (its keys without the o<N>-- prefix)
const slugsOf = (V) => [...new Set([...V.keys].map((k) => String(k).replace(/^o\d+--/, "")))];
// valuesFor(V) -> property name -> the victim values that property is tried with
function valuesFor(V) {
  const refs = [V.tx[0], V.tx[1], `goal/${V.goal}`, `q/${V.qid}`, `check/${V.check}`, V.node, `card/${V.kind}/${V.card}`, `doc/${V.doc}`];
  return {
    project: [...V.keys, ...(V.prefix ? [] : ["o1--shop"])], ref: refs, id: [V.tx[0], V.tx[1], V.file, V.preview, ...(V.item ? [V.item] : [])], contribution: [V.tx[0]],
    for: [V.tx[0], `goal/${V.goal}`, V.node], qid: [V.qid], checkId: [V.check], previewId: [V.preview], slug: [V.kind, `preset:${V.kind}`], v: ["1"], node: [V.node],
    flow: [V.node], screen: [V.node], surface: [`${V.word}-app`], table: [`${V.word}-table`], cardKind: [V.kind], close: V.item ? [V.item] : [V.tx[0]], q: [V.word.slice(0, -4), "note"],
    refs: [[V.node], [`goal/${V.goal}`]], checks: [[V.check]], kinds: [["goal", "card", "doc", "contribution"]], since: ["2000-01-01"],
    answers: [[{ card: V.qid, answer: "A" }]], decisions: [[{ what: "x", parent: V.tx[0] }]],
    // sprint 12, 12.5: Activity across every project (changes {org, list}): the victim's projects by key and by slug, its people,
    // and a cursor naming its contribution
    projects: [[...V.keys], ...[...V.keys].map((k) => [k]), slugsOf(V), [...V.keys, ...slugsOf(V)]], person: [...V.people],
    before: [`2999-01-01T00:00:00.000Z|${V.tx[0]}`, "2999-01-01T00:00:00.000Z|le"],
    // sprint 7, 7.5a: every tool takes orgSlug, the org the call acts in — the victim's, on every tool (refused org_unreachable)
    ...(V.slug ? { orgSlug: [V.slug] } : {}),
    items: [[{ kind: "goal", op: "upsert", data: { id: "xorg-g", title: "x", parent: V.goal } }], [{ contribution: { lane: "leader", kind: "note", what: "x", why: "y", parent: V.tx[0] } }],
      [{ grade: { checkId: V.check, verdict: "proven", proof: "GET / -> 200" } }], [{ answer: { qid: V.qid, option: 0 } }]],
  };
}
// argSets(tool, VAL) -> the argument sets a tool is called with: none, each victim value in each property its schema names (with
// the defaults its write needs), each value of an enum (with the victim's first project)
// evalMark (the preview's throwaway orgs, finding 14): every call that takes an eval mark carries one — a write lands marked (the
// old code serving live traffic hides it), a read answers the eval rows too (the victim's seed is eval-marked: a read that left
// them out could not show them leaking)
const EVAL_READ_BY_CODE = new Set(["wrap_up", "submit_grade"]);   // a mark these tools read from their arguments, outside their schema
function argSets(tool, VAL, V, evalMark = false) {
  const p = (tool.inputSchema && tool.inputSchema.properties) || {};
  const base = evalMark && (p.eval || EVAL_READ_BY_CODE.has(tool.name)) ? { eval: true } : {};
  for (const k of REQUIRED[tool.name] || []) if (k in p) base[k] = k === "verdict" ? (VERDICTS[tool.name] || DEFAULTS.verdict) : DEFAULTS[k];
  const sets = [{ ...base }];
  for (const [k, vs] of Object.entries(VAL)) if (p[k]) for (const v of vs) {
    if (tool.name === "create_project" && k === "project") continue;
    sets.push({ ...base, [k]: v });
    if (p.project && k !== "project") sets.push({ ...base, [k]: v, project: [...V.keys][0] });
  }
  if (tool.name === "create_project") sets.push({ ...base, key: "shop" });   // the slug both orgs hold (a key with the victim's word would plant it)
  for (const [k, s] of Object.entries(p)) if (Array.isArray(s.enum)) for (const e of s.enum) sets.push({ ...base, [k]: e, ...(p.project ? { project: [...V.keys][0] } : {}) });
  // sprint 12, 12.5: changes is also Activity across every project — every set again under {org: true, list: true}, and once {org: true}
  if (tool.name === "changes") return [...sets, ...sets.map((x) => ({ ...x, org: true, list: true })), { ...base, org: true }];
  return sets;
}
// the GET paths a route is fetched at: its own, its :params filled with the victim's ids, and with the victim's keys and refs in
// the query
function getPaths(route, V, evalMark = false) {
  if (evalMark) return getPaths(route, V).map((x) => x + (x.includes("?") ? "&" : "?") + "eval=1");
  const fill = { ":id": route.startsWith("/artifact/") ? [V.file] : route.startsWith("/preview/") ? [V.preview] : [V.tx[0], V.tx[1]], ":qid": [V.qid], ":ref": [V.goal],
    ":v": ["1"], ":hash": V.hashes.slice(0, 1), ":slug": [V.kind], ":plane": ["arch", "data", "api", "mcp", "flows", "deps", "screens"], ":path": [V.doc], ":file": [] };
  let base = [route];
  for (const [ph, vs] of Object.entries(fill)) if (route.includes(ph)) base = base.flatMap((r) => vs.map((v) => r.replace(ph, encodeURIComponent(v))));
  const q = (x) => (x.includes("?") ? "&" : "?");
  const keys = [...V.keys];
  // sprint 12, 12.5: Activity across every project, by its page (?all=1) and the REST twin of changes {org, list}
  const pid = V.people[0] || "", slug = slugsOf(V).find((x) => x !== "shop") || slugsOf(V)[0] || "";
  const extra = route === "/audit" ? ["/audit?all=1", `/audit?all=1&in=${encodeURIComponent(slug)}`, `/audit?all=1&in=${encodeURIComponent(keys[keys.length - 1] || "")}`, `/audit?all=1&who=${encodeURIComponent(pid)}`]
    : route === "/changes" ? [`/changes?org=1&list=1&projects=${encodeURIComponent(keys[keys.length - 1] || "")}&person=${encodeURIComponent(pid)}`, `/changes?org=1&list=1&projects=${encodeURIComponent(slug)}`, `/changes?org=1&list=1&person=${encodeURIComponent(pid)}`] : [];
  return [...base.flatMap((r) => [r, ...keys.map((k) => r + q(r) + "project=" + encodeURIComponent(k)),
    r + q(r) + `ref=${encodeURIComponent(V.tx[0])}&id=${encodeURIComponent(V.tx[0])}&qid=${encodeURIComponent(V.qid)}&node=${encodeURIComponent(V.node)}&q=${V.word.slice(0, -4)}`]), ...extra];
}
// the passphrase POST /control's set-password tries on the victim's people (a passphrase the suite holds: HELD, answerOf)
const TRIED_PASSPHRASE = "a-long-passphrase-123";
// the POST bodies a route is sent: none, each victim reference, and POST /control's actions aimed at the victim's people and projects
function postCalls(route, V, VAL, evalMark = false) {
  if (evalMark) return postCalls(route, V, VAL).map((c) => (c.body ? { ...c, body: { ...c.body, eval: true } } : c));
  const fill = { ":id": [V.tx[0], V.tx[1]], ":qid": [V.qid] };
  let paths = [route];
  for (const [ph, vs] of Object.entries(fill)) if (route.includes(ph)) paths = paths.flatMap((r) => vs.map((v) => r.replace(ph, encodeURIComponent(v))));
  const out = [];
  if (route === "/control") {
    for (const pid of V.people) for (const action of ["set-title", "set-password", "rotate-key", "set-role", "set-access-hats", "remove-person", "grant-seat", "revoke-seat", "invite-link"])
      out.push({ path: route, form: { action, personId: pid, title: "x", password: TRIED_PASSPHRASE, role: "member", hats: "finance", projectKey: [...V.keys][0] } });
    for (const k of V.keys) for (const action of ["archive-project", "activate-project"]) out.push({ path: route, form: { action, projectKey: k, key: k } });
    out.push({ path: route, form: { action: "add-project", key: "shop", name: "Shop" } });
    return out;
  }
  for (const path of paths) {
    out.push({ path, body: {} });
    for (const [k, vs] of Object.entries(VAL)) if (["project", "id", "ref", "qid", "checkId", "previewId", "slug", "v", "contribution", "items", "answers"].includes(k))
      for (const v of vs.slice(0, 3)) out.push({ path, body: { [k]: v, verdict: "approve", option: 0, choice: 0, confirm: true, proof: "GET / -> 200", summary: "x", question: "x?" } });
    out.push({ path, form: { verdict: "approve", qid: V.qid, option: "0", project: [...V.keys][0], id: V.tx[0] } });
  }
  return out;
}
// the paths a walk never takes, and why
const SKIP = new Map([["/logout", "ends the session"], ["/mcp", "walked as the MCP door itself"], ["/login", "walked by the account moves (a sign-in at the root lands in the seat it chooses, never the victim's for the attacker's values)"],
  ["/signup", "walked by the sign-up moves (its every call spends the address's sign-in budget, LOGIN_LIMIT, shared with /login)"],
  ["/request-access", "a platform door before any account or org (its every POST spends the address's sign-in budget, LOGIN_LIMIT, shared with /login): smoke s62 and tools/request-access-selftest.mjs"],
  ...["/account/verify", "/account/resend", "/account/forgot", "/account/reset"].map((p) => [p, "the account flow's platform door (sprint 21, 21.4a: its every POST spends the address's sign-in budget, LOGIN_LIMIT, shared with /login; an email it sends counts in the platform's cap): smoke s67 and tools/request-access-selftest.mjs"]),
  ["/favicon.svg", "static bytes"], ["/fonts/:file", "static bytes"], ["/install", "static page"], ["/health", "the platform's check, names no org"]]);

// ---- the snapshot: every row of an org, table by table (count and content hash) ----
// the tables a snapshot leaves out, and why
const SNAP_SKIP = { login_attempts: "a sign-in attempt at the root counts in the org it chose (the typed email's account's seat: the victim's, when the attacker types a victim's email): the lockout's bookkeeping, never a read" };
export async function snapshot(target, org) {
  const { ruleOf } = await import("./org-undo.mjs");
  const { orgSql } = await import("../src/data.js");
  const cols = await target.query("SELECT m.name AS t, m.sql AS s, p.name AS c FROM sqlite_master m LEFT JOIN pragma_table_info(m.name) p WHERE m.type = 'table' AND m.name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY m.name, p.cid");   // D1 refuses to read its own _cf_ tables
  const tables = new Map();
  for (const r of cols) { if (!tables.has(r.t)) tables.set(r.t, { name: r.t, cols: [], virtual: /^\s*CREATE\s+VIRTUAL/i.test(r.s || ""), own: /^(sqlite_|_cf_|d1_)/.test(r.t) }); if (r.c) tables.get(r.t).cols.push(r.c); }
  const fts = [...tables.values()].filter((t) => t.virtual).map((t) => t.name);
  for (const t of tables.values()) if (fts.some((v) => new RegExp(`^${v}_(data|idx|config|docsize|content)$`).test(t.name))) t.shadow = true;
  const parts = [];
  for (const t of tables.values()) {
    const r = ruleOf(t);
    if (!r.sql || SNAP_SKIP[t.name]) continue;
    // the deployment's own heartbeat is not the attacker's write (proven 2026-10-09: the 03:00 UTC cron's backup record,
    // ONE events row per org per run — src/backup.js recordBackup, kind 'backup', payload '{"mind":1,"backup":…' — landed in
    // a throwaway org mid-suite and read as "the victim's rows changed"). Excluded by the cron's EXACT shape, all three
    // terms: every door's events kind is a code literal (no caller chooses one), and no door writes this payload prefix —
    // an attacker cannot wear this shape, so the wall's compare stays honest.
    const heartbeat = t.name === "events" ? ` AND NOT (kind = 'backup' AND payload_json LIKE '{"mind":1,"backup":%')` : "";
    parts.push(`(SELECT json_group_array(json_array(${t.cols.map((c) => `"${c}"`).join(", ")})) FROM "${t.name}" WHERE ${orgSql(r.sql, org)}${heartbeat}) AS "${t.name}"`);
  }
  const row = (await target.query("SELECT " + parts.join(", ")))[0] || {};
  const out = {};
  for (const [t, v] of Object.entries(row)) { const rows = JSON.parse(v || "[]").map((x) => JSON.stringify(x)).sort(); out[t] = { n: rows.length, hash: sha(rows.join("\n")).slice(0, 16) }; }
  return out;
}

// ---- the victim's PEOPLE in the attacker's own fields (the sprint-6 review, finding 5) ----
// A field the filer types may hold a person's id (next.who on a contribution; decidedBy on a question the owner rules). A
// reader that looks a NAME up by such an id without the org is a cross-org id -> name oracle (findings 2 and 3: the
// contribution's page, the follow-ups, the question's page). The attacker files, in ITS OWN project, a contribution per
// victim person naming them as next.who (and depending on a victim's contribution), and, as an owner, a ruled question per
// victim person naming them as decidedBy; every later read of the walk sees those rows, and readBack() opens their pages.
// The instrument: the same rows naming the ATTACKER'S OWN id must show the attacker's own name (a page that never names
// anyone proves nothing).
async function plantPeople(D, who, V, look) {
  const me = await D.mcp(who.key, "whoami");
  const myId = me.out && me.out.id, myName = me.out && (me.out.person || me.out.name);
  if (!myId || !myName) return { findings: [`${who.label}: whoami named no id and name (${brief(me.out)}): the people plant cannot run`] };
  const today = new Date().toISOString().slice(0, 10), tag = randomBytes(3).toString("hex");
  const pids = [myId, ...V.people];
  const file = async (items) => {
    const pv = await D.mcp(who.key, "preview", { project: who.project, items, ...(who.eval ? { eval: true } : {}) });
    look(`preview (the people plant) ${JSON.stringify(items).slice(0, 100)}`, pv.text, sentOf(items), pv.status);
    if (pv.isError || !pv.out || !pv.out.previewId) return [];
    const f = await fileWith(D, who.key, pv.out, items, (n, r) => look(`${n} (the people plant) ${JSON.stringify(items).slice(0, 100)}`, r.text, sentOf(items), r.status));
    return ((f.ok && f.out.results) || []).map((r) => (r && r.id) || null);
  };
  const tx = await file(pids.map((pid, i) => ({ contribution: { lane: "leader", kind: "note", what: `xorg plant ${tag} ${i}`, why: "its next action names a person by id",
    next: { what: `follow up ${tag} ${i}`, who: pid, by: today }, ...(i ? { depends: [V.tx[0]] } : {}) } })));
  const qids = [];
  if (who.owner) {
    const qs = pids.map((pid, i) => ({ kind: "question", op: "upsert", data: { qid: `Q-xorgp-${tag}-${i}`, question: `Ruled by whom ${tag} ${i}?`, status: "decided",
      options: [{ what: "this way" }, { what: "that way" }], choice: 0, label: "this way", decidedBy: pid, decidedAt: new Date().toISOString() } }));
    await file(qs);
    qids.push(...qs.map((q) => q.data.qid));
  }
  return { myId, myName, mine: { tx: tx[0] || null, qid: qids[0] || null }, tx: tx.filter(Boolean), qids };
}
// readBack(D, who, plant, look) -> findings: the pages of the attacker's own planted rows (and the screens listing them), each
// read looked at for the victim (its people's names carry its canary word); the instrument asserted on the attacker's own row
async function readBack(D, who, plant, look) {
  const out = [];
  const q = `project=${encodeURIComponent(who.project)}`;
  const get = async (path, accept) => { const r = await D.http("GET", path, { key: who.key, accept }); look(`GET ${path} (${accept}, the people plant read back)`, r.text, sentOf(path), r.status, false); return r; };
  for (const id of plant.tx) for (const accept of ["text/html", "application/json"]) {
    const r = await get(`/contribution/${encodeURIComponent(id)}?page=1&${q}`, accept);
    if (id === plant.mine.tx && accept === "text/html" && !r.text.includes(plant.myName))
      out.push(`${who.label}: instrument — the contribution page of its own next.who (${id}) does not show its own name "${plant.myName}" (${r.status}): the people plant proves nothing`);
  }
  for (const path of ["/home", "/gtm", "/build"]) for (const accept of ["text/html", "application/json"]) await get(`${path}?${q}`, accept);
  for (const qid of plant.qids) for (const accept of ["text/html", "application/json"]) {
    const r = await get(`/question/${encodeURIComponent(qid)}?${q}`, accept);
    if (qid === plant.mine.qid && accept === "text/html" && !r.text.includes(plant.myName))
      out.push(`${who.label}: instrument — the question page of its own decidedBy (${qid}) does not show its own name "${plant.myName}" (${r.status}): the people plant proves nothing`);
  }
  for (const ref of [...plant.tx, ...plant.qids.map((x) => `q/${x}`)]) {
    const r = await D.mcp(who.key, "read", { ref, project: who.project });
    look(`read {ref: ${ref}} (the people plant read back)`, r.text, sentOf({ ref }), r.status, false);
  }
  return out;
}

// ---- a 5xx keeps its answer (sprint 10, 10.5: the sprint-9 ship's one 500 kept only its line, and the preview's logs held none) ----
// answerOf(who, what, status, text, secrets) -> { who, what, status, at, bytes, body }: the answer's first ANSWER_BYTES, every
// credential the suite holds (HELD, below: its keys, sessions, passphrases, tokens) and every 40-or-more-hex key, "t_" session
// token, bearer header and session cookie redacted BEFORE the cut (tools/live-walk.mjs redact: a key cut in half by the excerpt would pass the pattern) — never a secret
// on disk; keepFivexx writes them into the run dir
const ANSWER_BYTES = 2048;
// redactOf is set by attack() (the redaction). HELD is every credential the suite holds (the sprint-10 review, M2): attack() seeds
// it with both orgs' owner and member keys, and every call through door() adds what it sends (its bearer, its session, a
// passphrase, a current or a code field) and what its answer mints (a token, an access or refresh token); a walk adds its
// own key, its session (sessionOf) and its secrets, the read-only walk its credential. A body may echo any of them
let redactOf = null;
const HELD = new Set();
const hold = (...vs) => { for (const v of vs) if (typeof v === "string" && v.length >= 8) HELD.add(v); };
const SENT_FIELDS = ["password", "current", "code", "refresh_token", "code_verifier"];
const holdSent = (key, cookie, form, body) => {
  hold(typeof key === "string" ? key : null, cookie);
  for (const o of [form, body]) {
    if (Array.isArray(o)) { for (const [k, v] of o) if (SENT_FIELDS.includes(k)) hold(v); }
    else if (o && typeof o === "object") for (const k of SENT_FIELDS) hold(o[k]);
  }
};
const holdMinted = (text) => {
  let j = null; try { j = JSON.parse(String(text)); } catch { return; }
  if (j && typeof j === "object") hold(j.token, j.access_token, j.refresh_token);
};
// TOKEN_RE: a credential-shaped value the held list may not know (one minted inside the failing call): a session token
// (src/index.js SESSION_TOKEN_PREFIX "t_" + 40 hex), a key (40 hex), the read-only credential (64 hex) — a run of 40 or more hex
// digits standing alone (no letter or digit either side; "_" is no boundary, so "t_<hex>" and "x_<hex>" are both caught; a
// longer run may be two credentials side by side, so it goes too). Ordinary text never holds 40 hex digits in a row
const TOKEN_RE = /(?<![0-9A-Za-z])(t_)?[0-9a-f]{40,}(?![0-9A-Za-z])/g;
export const redactTokens = (v) => String(v).replace(TOKEN_RE, (_, t) => (t ? "<session>" : "<key>"));
const answerOf = (who, what, status, text, secrets = []) => {
  const held = [typeof who.key === "string" ? who.key : who.key && who.key.cookie, ...secrets, ...HELD].filter((x) => typeof x === "string" && x);
  const red = (v) => redactTokens(redactOf(String(v), held));
  const body = red(text);
  return { who: who.label, what: red(what), status, at: new Date().toISOString(), bytes: String(text).length, body: body.slice(0, ANSWER_BYTES) };
};
// keepFivexx(dir, answers) -> the file (<run dir>/fivexx.json) holding every kept answer, or "" when there is none or no run dir
function keepFivexx(dir, answers) {
  if (!dir || !answers || !answers.length) return "";
  mkdirSync(dir, { recursive: true });
  const f = join(dir, FIVEXX_FILE);
  writeFileSync(f, JSON.stringify(answers, null, 1) + "\n");
  return f;
}

// ---- the walk: one attacker against one victim ----
// walk(target, attacker { label, key }, V, o) -> { calls, answered, findings: [], served: [], exceptions: [] }
// sprint 7, 7.5b (the sign-in surfaces): who.key is a bearer key or a browser session ({ cookie }); o.sections picks the parts
// walked (default every part: plant, tools, resources, gets, posts, address, readBack, end); o.also lists more "victims" whose rows
// must not show either (a Partner's own org's unseated project); o.getSlice keeps the first n paths of each GET route and o.accepts
// its kinds; o.routes is the route list (GET /capabilities as a key reads it) for a credential that cannot read it itself;
// o.secrets: the other credentials the caller holds beside who.key (a 5xx's kept answer redacts them, answerOf)
const ALL_SECTIONS = { plant: true, tools: true, resources: true, gets: true, posts: true, address: true, readBack: true, end: true };
// mergeVal(a, b) -> each property's victim values from both (a Partner's walk names the other org's ids and its own org's
// unseated project's)
const mergeVal = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b)) out[k] = [...(out[k] || []), ...v]; return out; };
async function walk(target, who, V, o = {}) {
  const sec = { ...ALL_SECTIONS, ...(o.sections || {}) };
  const also = o.also || [];
  hold(typeof who.key === "string" ? who.key : who.key && who.key.cookie, ...(o.secrets || []));
  const D = door(target), VAL = also.reduce((m, X) => mergeVal(m, valuesFor(X)), valuesFor(V));
  const res = { calls: 0, answered: 0, findings: [], fivexx: [], fivexxAnswers: [], exceptions: [], notes: [], planted: o.planted, cover: { tools: 0, resources: 0, gets: 0, posts: 0, address: 0 }, addressBy: { bearer: 0, session: 0 } };
  const stop = () => o.failFast && (res.findings.length || res.fivexx.length);
  // a WRITE's values are planted (they may come back as the attacker's own data in any later answer); a read's are cut from its
  // own answer only (an echo)
  const look = (what, text, sent, status, write = true) => {
    res.calls++;
    if (write) for (const s of sent) res.planted.add(s);
    if (status >= 500) { res.fivexx.push(`${who.label} · ${what} -> ${status}`); res.fivexxAnswers.push(answerOf(who, what, status, text, o.secrets)); }
    if (status < 300) res.answered++;
    for (const X of [V, ...also]) {
      const l = leaksOf(text, X, write ? res.planted : new Set([...res.planted, ...sent]));
      if (l.length) res.findings.push(`${who.label} · ${what}: ${l.join(", ")}${X === V ? "" : ` (${X.label || "outside its seats"})`}`);
    }
  };
  const isPublicRead = (sent, exact) => exact && sent.has(V.pub);
  // 0. the victim's people in the attacker's own fields (planted first: every read below sees them too)
  const plant = sec.plant && who.project ? await plantPeople(D, who, V, look) : null;
  if (plant && plant.findings) res.findings.push(...plant.findings);
  if (stop()) return res;
  // 1. every tool
  if (sec.tools) {
    const list = await D.rpc(who.key, "tools/list");
    const tools = (list.json && list.json.result && list.json.result.tools) || [];
    if (tools.length < 20) res.findings.push(`${who.label}: tools/list answered ${tools.length} tools`);
    res.cover.tools = tools.length;
    for (const t of tools) {
      for (const args of argSets(t, VAL, V, !!who.eval)) {
        if (stop()) return res;
        const r = await D.mcp(who.key, t.name, args);
        const sent = sentOf(args);
        look(`${t.name} ${JSON.stringify(args).slice(0, 120)}`, r.text, sent, r.status, !(t.annotations && t.annotations.readOnlyHint));
        // sprint 7, 7.5a: a key names one seat — a call naming the victim's org is refused before it runs (src/mcp.js orgArgRefused)
        if (V.slug && args.orgSlug === V.slug && !(r.out && r.out.error === "org_unreachable")) res.findings.push(`${who.label} · ${t.name} {orgSlug: <the victim's org>} was not refused org_unreachable (${brief(r.out)})`);
        if (t.name === "preview" && r.out && r.out.previewId && !r.isError) await fileWith(D, who.key, r.out, args.items || [], (n, f) => look(`${n} (its preview) ${JSON.stringify(args).slice(0, 100)}`, f.text, sent, f.status));
      }
    }
    // the ruled exception, through the MCP: read_file by the public file's exact id (its body served, never counted)
    { const r = await D.mcp(who.key, "read_file", { id: V.pub }); res.calls++; res.exceptions.push(`read_file {id: <the public file>} -> ${r.isError ? "refused" : "served"}`); }
  }
  // 2. every brain:// resource
  if (sec.resources) {
    const rl = await D.rpc(who.key, "resources/list"), tl = await D.rpc(who.key, "resources/templates/list");
    const fixed = ((rl.json && rl.json.result && rl.json.result.resources) || []).map((r) => r.uri);
    const filled = ((tl.json && tl.json.result && tl.json.result.resourceTemplates) || []).flatMap((t) => [V, ...also].flatMap((X) =>
      [X.tx[0], `goal/${X.goal}`, X.goal, X.node, X.qid, "arch", "screens", X.doc].map((v) => t.uriTemplate.replace(/\{[a-z]+\}/, encodeURIComponent(v)))));
    if (fixed.length < 3) res.findings.push(`${who.label}: resources/list answered ${fixed.length}`);
    res.cover.resources = fixed.length + ((tl.json && tl.json.result && tl.json.result.resourceTemplates) || []).length;
    const keys = [V, ...also].flatMap((X) => [...X.keys]);
    for (const uri of [...new Set([...fixed, ...filled])].flatMap((u) => [u, ...keys.map((k) => u + (u.includes("?") ? "&" : "?") + "project=" + encodeURIComponent(k))])) {
      if (stop()) return res;
      const r = await D.rpc(who.key, "resources/read", { uri });
      look(`resources/read ${uri}`, r.text, sentOf(uri.replace(/^brain:\/\//, "/")), r.status, false);
    }
  }
  // 3. every route of /capabilities
  let routes = o.routes || null;
  if (!routes) {
    const caps = await D.http("GET", "/capabilities", { key: who.key });
    try { routes = JSON.parse(caps.text).routes || []; } catch { routes = []; }
  }
  if ((sec.gets || sec.posts || sec.address) && routes.length < 60) res.findings.push(`${who.label}: GET /capabilities answered ${routes.length} routes`);
  res.cover.gets = routes.filter((x) => x.method === "GET" && !SKIP.has(x.path)).length;
  res.cover.posts = routes.filter((x) => x.method === "POST" && !SKIP.has(x.path)).length;
  const pathsOf = (route) => [V, ...also].flatMap((X) => getPaths(route, X, !!who.eval).slice(0, o.getSlice || Infinity));
  if (sec.gets) for (const rt of routes.filter((x) => x.method === "GET" && !SKIP.has(x.path))) {
    for (const path of [...new Set(pathsOf(rt.path))]) for (const accept of o.accepts || ["text/html", "application/json"]) {
      if (stop()) return res;
      const r = await D.http("GET", path, { key: who.key, accept });
      look(`GET ${path} (${accept})`, r.text, sentOf(path), r.status, false);
      // 7.5b: a page navigation at the root is sent to the session's OWN org, never under the victim's address
      if (V.slug && r.location && new RegExp(`^(?:https?://[^/]+)?/${V.slug}(?:[/?#]|$)`).test(r.location)) res.findings.push(`${who.label} · GET ${path} (${accept}) was sent to the victim's address (${r.location})`);
    }
  }
  if (sec.gets && sec.tools && typeof who.key === "string") {
    // the ruled exception, by its link: GET and HEAD /artifact/<the public file> (and ?meta, ?download) are served, never counted
    for (const [m, qs] of [["GET", ""], ["GET", "?meta=1"], ["GET", "?download=1"], ["HEAD", ""]]) {
      const r = await target.call(m, `/artifact/${encodeURIComponent(V.pub)}${qs}`, { headers: { authorization: "Bearer " + who.key, accept: "application/json" } });
      res.calls++;
      res.exceptions.push(`${m} /artifact/<the public file>${qs} -> ${r.status}${m === "GET" && !qs && r.status === 200 && r.text.toLowerCase().includes(`${V.word} public`) ? " (its body)" : ""}`);
    }
  }
  // 3b. THE VICTIM'S ADDRESS (sprint 7, 7.4; PLATFORM §2 item 9: each org at /<org>; the org from the address and the
  // membership): every GET route under /<victim>/… (its own path and with the victim's project), and every POST route once, as
  // the attacker's bearer AND as its browser session — each the ONE not-here answer (404, NOT_HERE_BODY), nothing of either
  // org; the instrument: the attacker's own address answers its session as itself. 7.5b: a walk whose credential IS a session
  // (the cookie walks) walks it alone; a read-only credential has no session (who.noSession)
  if (sec.address && V.slug) {
    await notHereBody();
    const isCookie = who.key && typeof who.key === "object";
    const sess = isCookie ? who.key.cookie : who.noSession ? null : await sessionOf(D, who);
    hold(sess);   // the review's M2: a "t_" session token, which a kept answer may echo (door() holds it too, from /login's answer)
    // o.requireSession (the ship's preview, the sprint-7 review D1): a walk with no browser session is a FINDING — the cookie under the
    // victim's address (7.4: an account session read as the account's seat in the address's org) must be proven against live's data
    // before traffic moves; elsewhere it is said as a note
    if (!sess && !who.noSession) (o.requireSession ? res.findings : res.notes).push(`${who.label}: no browser session (its seat's secret is not its key, or it has no email): the victim's address walked by its bearer only`);
    const creds = isCookie ? [["session", { cookie: sess, accept: "text/html" }]] : [["bearer", { key: who.key, accept: "application/json" }], ...(sess ? [["session", { cookie: sess, accept: "text/html" }]] : [])];
    const notHere = (what, r) => { if (r.status !== 404 || r.text !== NOT_HERE_BODY) res.findings.push(`${who.label} · ${what} -> ${r.status}: the victim's address answered it (an org's address serves only its own people; ${JSON.stringify(r.text.slice(0, 60))})`); };
    for (const rt of routes.filter((x) => x.method === "GET" && !SKIP.has(x.path))) {
      for (const path of getPaths(rt.path, V).slice(0, 2)) for (const [cn, c] of creds) {
        if (stop()) return res;
        const r = await D.http("GET", `/${V.slug}${path}`, c);
        look(`GET /<victim>${path} (its ${cn})`, r.text, sentOf(path), r.status, false);
        notHere(`GET /${V.slug}${path} as its ${cn}`, r);
        res.cover.address++; res.addressBy[cn]++;
      }
    }
    for (const rt of routes.filter((x) => x.method === "POST" && !SKIP.has(x.path))) {
      const c0 = postCalls(rt.path, V, VAL)[0];
      if (c0) for (const [cn, c] of creds) {
        if (stop()) return res;
        const r = await D.http("POST", `/${V.slug}${c0.path}`, { ...c, ...(c0.form ? { form: c0.form } : { body: c0.body }) });
        look(`POST /<victim>${c0.path} (its ${cn})`, r.text, sentOf(c0.form || c0.body), r.status);
        notHere(`POST /${V.slug}${c0.path} as its ${cn}`, r);
        res.cover.address++; res.addressBy[cn]++;
      }
    }
    if (sess && who.slug) {
      const mine = await D.http("GET", `/${who.slug}/whoami`, { cookie: sess });
      let id = null; try { id = JSON.parse(mine.text).id; } catch { id = null; }
      if (mine.status !== 200 || !id) res.findings.push(`${who.label}: instrument — its own address /${who.slug} does not answer its session (${mine.status}): a walk of 404s proves nothing`);
    }
  }
  if (sec.posts) for (const rt of routes.filter((x) => x.method === "POST" && !SKIP.has(x.path))) {
    for (const c of postCalls(rt.path, V, VAL, !!who.eval)) {
      if (stop()) return res;
      const r = await D.http("POST", c.path, { key: who.key, ...(c.form ? { form: c.form } : { body: c.body }) });
      look(`POST ${c.path} ${JSON.stringify(c.form || c.body).slice(0, 120)}`, r.text, sentOf(c.form || c.body), r.status);
    }
  }
  // the pages of the attacker's own planted rows (the victim's people named in them), and the instruments
  if (sec.readBack && plant && !plant.findings) res.findings.push(...await readBack(D, who, plant, look));
  // the attacker is still signed in (a walk that locked itself out proves nothing)
  if (sec.end) {
    const me = await D.mcp(who.key, "whoami");
    if (me.isError || !me.out || !me.out.id) res.findings.push(`${who.label}: its credential no longer works after the walk (${brief(me.out)})`);
  }
  return res;
}

// slugOf(target, org) -> the org's path name, its address /<slug> (migrate-072; sprint 7, 7.4), or null
async function slugOf(target, org) {
  const r = await target.query(`SELECT slug FROM org WHERE id = ${Number(org)}`);
  return (r && r[0] && r[0].slug) || null;
}
// NOT_HERE: the one answer an org's address gives a caller it serves nothing (src/index.js NOT_HERE): sprint 7, 7.4b, a page in
// the platform's brand drawn from constants (src/login.js renderNotHere), the same bytes for every case; read once, from the
// source the target runs (the local worker's tree; on a ship's preview, the commit it shipped)
let NOT_HERE_BODY = null;
const notHereBody = async () => NOT_HERE_BODY || (NOT_HERE_BODY = (await import("../src/login.js")).renderNotHere());
// sessionOf(D, who) -> a browser session token of the attacker's own seat, signed in at the root by its email and its seat's
// secret (the key, as add-person's S-019 secret is), or null when that secret is not the key (the walk then says so)
async function sessionOf(D, who) {
  const me = await D.mcp(who.key, "whoami");
  const email = me.out && me.out.email;
  if (!email) return null;
  const r = await D.http("POST", "/login", { body: { email, password: who.key, device: "attack-xorg" } });
  try { return JSON.parse(r.text).token || null; } catch { return null; }
}
// victimOf(seed, people, keys, target facts) -> the victim's facts: its word, ids, keys
async function victimOf(target, org, seed) {
  const f = await target.facts(org);
  const ids = new Set([...f.tx, ...f.files, ...f.hashes, ...f.previews].filter((x) => x && x.length >= 8));
  ids.delete(seed.pub);
  return { ...seed, ids: [...ids], hashes: f.hashes, people: f.people, keys: new Set(f.keys), prefix: org === 1 ? null : `o${org}--`, slug: await slugOf(target, org) };
}

// ---- the account moves (sprint 7, 7.1): one account per email, a seat per org ----
// accountMoves(target, attacker { label, key, org, word }, victim { org, owner, member, home }, V) -> { calls, findings, line }
async function accountMoves(target, who, vic, V) {
  const D = door(target), out = { calls: 0, findings: [] }, planted = new Set();
  const tag = randomBytes(3).toString("hex");
  const look = (what, text, sent, status) => {
    out.calls++;
    for (const x of sent) planted.add(x);
    if (status >= 500) out.findings.push(`${who.label} · ${what} -> ${status}`);
    const l = leaksOf(text, V, planted);
    if (l.length) out.findings.push(`${who.label} · ${what}: ${l.join(", ")}`);
  };
  const form = async (key, fields) => { const r = await D.http("POST", "/control", { key, form: fields }); look(`POST /control ${fields.action}`, r.text, sentOf(fields), r.status); return r; };
  const secretOf = (t) => (String(t).match(/(?:API key\)|shown again): ([0-9a-f]{40})\b/) || [])[1] || null;
  // seatOf(key) -> { id, org, active, pending } of the seat a minted key opens (found by the key's hash, as the door finds it:
  // a PENDING seat's key opens nothing, so its own whoami cannot name it), or null
  const seatOf = async (k) => (k ? (await target.query(`SELECT id, org, active, pending FROM people WHERE key_hash = ${qSql(sha(k))}`))[0] || null : null);
  const rowOf = async (id) => (id ? (await target.query(`SELECT active, pending FROM people WHERE id = ${qSql(id)}`))[0] || null : null);
  const waits = (r) => !!r && Number(r.pending) === 1 && Number(r.active) === 0;
  // signIn(email, password, victim) -> { status, token, id, org }: the seat a sign-in at the root lands in (org null: no session);
  // the victim's own sign-ins (victim: true) answer the victim's own name, so only the attacker's are read for a leak. Each spends
  // the address's sign-in budget: sent again once after the window when the flood filter answered (pacedHttp)
  const signIn = async (email, password, victim = false) => {
    const body = { email, password, device: "attack-xorg" };
    const r = await pacedHttp(D, "POST", "/login", { body });
    if (victim) { out.calls++; if (r.status >= 500) out.findings.push(`the victim's own sign-in -> ${r.status}`); }
    else look(`POST /login as ${email}`, r.text, sentOf(body), r.status);
    let tok = null; try { tok = JSON.parse(r.text).token || null; } catch { tok = null; }
    if (r.status !== 200 || !tok) return { status: r.status, token: null, org: null };
    const me = await D.mcp(tok, "whoami");
    return { status: r.status, token: tok, id: me.out && me.out.id, org: me.out && me.out.id ? await orgOfPerson(target, me.out.id) : null };
  };
  // inert(what, k): a PENDING seat's key reaches nothing (A1, migrate-074: no active seat, so the bearer answers 401 at the door,
  // the MCP door too)
  const inert = async (what, k) => {
    if (!k) return;
    const w = await D.http("GET", "/whoami", { key: k }), m = await D.mcp(k, "whoami");
    look(`GET /whoami (${what})`, w.text, [], w.status); look(`MCP whoami (${what})`, m.text, [], m.status);
    // /mcp: a minted key's hash routes to the app's own door (src/oauth.js buildEntry: presence-only, as a revoked or archived
    // key's does), which refuses it in JSON-RPC (-32001 unauthorized, HTTP 200); any other credential the provider's 401
    const mcpRefused = m.status === 401 || (m.isError && m.out && m.out.code === -32001);
    if (w.status !== 401 || !mcpRefused) out.findings.push(`${who.label}: ${what} is not inert — its key answers GET /whoami ${w.status}, /mcp ${m.status} ${brief(m.out).slice(0, 120)} (a seat that waits for its holder's yes reaches nothing)`);
  };
  const accountsOf = async (emails) => JSON.stringify(await target.query(`SELECT email, pass_hash, pass_salt FROM accounts WHERE email IN (${emails.map((e) => `'${String(e).replace(/'/g, "''")}'`).join(", ") || "''"}) ORDER BY email`));
  // the victim's member: its own passphrase first (the victim's own act, through /profile with its key), where the address
  // serves the victim's org
  const vm = await D.mcp(vic.member, "whoami");
  const vEmail = vm.out && vm.out.email, vId = vm.out && vm.out.id;
  if (!vEmail || !vId) { out.findings.push(`${who.label}: the victim's member has no email (${brief(vm.out)}): the account moves cannot run`); return out; }
  const vPass = `victim-${tag}-own-pass`;
  if (vic.home) {
    const r = await D.http("POST", "/profile", { key: vic.member, body: { action: "set-my-passphrase", current: vic.member, password: vPass } });
    if (r.status !== 200) out.findings.push(`instrument: the victim's member could not set its own passphrase (${r.status}): the account moves prove nothing`);
  }
  const before = await accountsOf([vEmail]);
  // 1 · the victim's member's email in the attacker's own org (sprint 7's review, A1: the account already holds a seat in the
  // victim's org, so the seat WAITS for its holder's yes — pending, inert), then every move on that seat
  const held = [];
  const a1 = await form(who.key, { action: "add-person", name: `Aaa Xorg Seat ${tag}`, email: vEmail });
  const k1 = secretOf(a1.text); if (k1) held.push(k1);
  const seat1 = await seatOf(k1), seatId = seat1 && seat1.id;
  if (!seatId || Number(seat1.org) !== Number(who.org)) out.findings.push(`${who.label}: instrument — add-person of the victim member's email made no seat in its own org (${a1.status}, ${brief(seat1)}): the moves prove nothing`);
  else {
    if (!waits(seat1)) out.findings.push(`${who.label}: its seat of the victim member's email (an account seated in org ${vic.org}) is not PENDING (active ${seat1.active}, pending ${seat1.pending}): an org made itself a place that account's sign-ins land without its holder's yes`);
    await inert("its pending seat of the victim member's email", k1);
    // set-password: the account is seated in another org, so its passphrase is never an admin's — a pending seat included
    // (src/accounts.js seatSpan reads any seat of the account elsewhere)
    const chose = `attacker-${tag}-chose`;
    const sp = await form(who.key, { action: "set-password", personId: seatId, password: chose });
    if (!/account_elsewhere/.test(sp.text)) out.findings.push(`${who.label}: Control's set-password on its seat of the victim's account was not refused (account_elsewhere): an admin set the passphrase of an account seated in another org`);
    held.push(chose);
    const k2 = secretOf((await form(who.key, { action: "rotate-key", personId: seatId })).text); if (k2) held.push(k2);
    if (!waits(await rowOf(seatId))) out.findings.push(`${who.label}: its Reissue of its pending seat of the victim member's email made the seat active (${brief(await rowOf(seatId))})`);
    await inert("its pending seat of the victim member's email, Reissued", k2);
    const own = `attacker-${tag}-profile`;
    const pf = await D.http("POST", "/profile", { key: k2 || k1, body: { action: "set-my-passphrase", current: k2 || k1, password: own } });
    look("POST /profile set-my-passphrase (its pending seat of the victim's account)", pf.text, sentOf({ own }), pf.status);
    if (pf.status !== 401) out.findings.push(`${who.label}: /profile took the key of its PENDING seat of the victim member's email (${pf.status}): a seat that waits reaches nothing`);
    held.push(own);
  }
  // every value it holds signs in NOWHERE as that email: its seat waits (it signs nothing in), and no value of the attacker's is
  // the victim's — so a session at all is a finding, the victim's org the worst one
  for (const v of held) {
    const r = await signIn(vEmail, v);
    if (r.org === vic.org) out.findings.push(`${who.label}: signed in as the victim's member (${vEmail}) into org ${vic.org} with a value it holds (${r.status})`);
    else if (r.token) out.findings.push(`${who.label}: a value it holds for its PENDING seat of the victim member's email signed in (org ${r.org}): a seat that waits signs nothing in`);
  }
  if (vic.home) {
    const r = await signIn(vEmail, vPass, true);
    if (!(r.status === 200 && r.id === vId)) out.findings.push(`${who.label}: after its moves the victim's member no longer signs in as themselves with their own passphrase (${r.status}, ${r.id || "no seat"})`);
  }
  if ((await accountsOf([vEmail])) !== before) out.findings.push(`${who.label}: the victim's account (${vEmail}) changed under its moves`);
  // 2 · the squat: a fresh email seated by the attacker FIRST (no account yet: the first seat makes it, ACTIVE), then by the
  // victim's owner — now a seat of an account seated elsewhere, so it WAITS for its holder's yes (A1). The attacker's seat is
  // older and its name sorts first, so a sign-in that looks the email up across orgs — the old code's — finds the attacker's
  // row first in either plan, rowid or name order. Before the yes: nothing of the attacker's answers the victim's seat (its key,
  // its seat session, its /profile on the account); then the HOLDER signs up (the operator's code: the account's own passphrase)
  // — signed in to nothing, and its JSON sign-in asks (409 choose_org: the owner's ruling, 2026-10-09, a seat waits) — names its
  // one active org for an ACCOUNT session, and accepts through POST /orgs/seat with it; after the yes the victim's new member signs in to the victim's
  // org with the victim's own key, and no value of the attacker's lands there
  const fresh = `xorg-sq-${tag}@xorg.invalid`;
  const ks = secretOf((await form(who.key, { action: "add-person", name: `Aaa Xorg Squat ${tag}`, email: fresh })).text);
  const kv = secretOf((await D.http("POST", "/control", { key: vic.owner, form: { action: "add-person", name: `Zzz Xorg Hire ${tag}`, email: fresh } })).text);
  const sS = await seatOf(ks), sV = await seatOf(kv);
  let accepted = false;
  if (!ks || !kv || !sS || !sV) out.findings.push(`${who.label}: instrument — the squat's two seats were not made (attacker ${sS ? "yes" : "no"}, victim ${sV ? "yes" : "no"})`);
  else if (!(Number(sS.active) === 1 && Number(sS.pending) === 0 && Number(sS.org) === Number(who.org))) out.findings.push(`${who.label}: instrument — the squat's first seat (a fresh email, no account) is not active in its own org (${brief(sS)}): the squat proves nothing`);
  else {
    if (!waits(sV) || Number(sV.org) !== Number(vic.org)) out.findings.push(`${who.label}: the squat — the victim's later seat of an email the attacker seated first (an account seated in org ${who.org}) does not wait for its holder's yes (${brief(sV)})`);
    // before the yes: the squatter's key lands in its own seat, never the victim's; the victim's waiting key signs nothing in
    const r = await signIn(fresh, ks);
    if (r.org === vic.org) out.findings.push(`${who.label}: the squat — the key it minted for an email it seated first signs in to the victim's later seat of it (org ${vic.org})`);
    if (!r.token || r.id !== sS.id) out.findings.push(`${who.label}: instrument — the squat's own key does not sign in as its own seat (${r.status}, ${r.id || "no seat"}): its seat session's moves prove nothing`);
    const h0 = await signIn(fresh, kv, true);
    if (h0.token) out.findings.push(`${who.label}: the squat — the victim's WAITING seat of ${fresh} signed in before its holder's yes (org ${h0.org})`);
    await inert("the victim's waiting seat of the squatted email", kv);
    // the squatter answers the victim's waiting seat: with its key (a bearer) and its SEAT session (no account; live — the
    // instrument: its own org's address answers it as its seat) — nothing changes
    const aslug = await slugOf(target, who.org);
    const mine = r.token && aslug ? await D.http("GET", `/${aslug}/whoami`, { cookie: r.token }) : null;
    let mineId = null; try { mineId = mine ? JSON.parse(mine.text).id : null; } catch { mineId = null; }
    out.calls++;
    if (mineId !== sS.id) out.findings.push(`${who.label}: instrument — its squat seat's session does not read as its seat at its own address (${mine && mine.status}, ${mineId}): its answers below prove less`);
    for (const [cred, o] of [["its key", { key: ks }], ["its seat session", { cookie: r.token }]]) {
      if (!o.key && !o.cookie) continue;
      for (const answer of ["accept", "decline"]) {
        const a = await D.http("POST", "/orgs/seat", { ...o, body: { seat: sV.id, answer } });
        look(`POST /orgs/seat ${answer} (${cred}, the victim's waiting seat)`, a.text, sentOf({ seat: sV.id, answer }), a.status);
        if (a.status >= 200 && a.status < 300) out.findings.push(`${who.label}: the squat — ${cred} answered the victim's waiting seat (${answer}: ${a.status}): a holder's yes is the account's alone`);
      }
    }
    if (!waits(await rowOf(sV.id))) out.findings.push(`${who.label}: the squat — the victim's waiting seat changed under the squatter's answers (${brief(await rowOf(sV.id))})`);
    // the squatter, holding the account's only active seat, gives the ACCOUNT no passphrase (a seat's secret proves that seat
    // alone: src/secrets.js) — its own seat's secret is what changes
    const own = `attacker-${tag}-squat`;
    const pf = await D.http("POST", "/profile", { key: ks, body: { action: "set-my-passphrase", current: ks, password: own } });
    look("POST /profile set-my-passphrase (its squat seat)", pf.text, sentOf({ own }), pf.status);
    const acct = (await target.query(`SELECT pass_hash FROM accounts WHERE email = ${qSql(fresh)}`))[0];
    if (!acct || acct.pass_hash) out.findings.push(`${who.label}: the squat — its seat's secret gave the ACCOUNT of ${fresh} a passphrase through /profile (${pf.status}): the squatter holds the account the victim's seat waits on`);
    // the HOLDER signs up: the operator allows the email and hands its code over (as tools/operator.mjs; this suite writes the
    // code on the database), the holder brings it with its own passphrase — an ACCOUNT session on its one active seat
    const { signupCodeHash } = await import("../src/accounts.js");
    const { newCode } = await import("./operator.mjs");
    const code = newCode(), hPass = `holder-${tag}-own-pass`, at = new Date().toISOString(), until = new Date(Date.now() + 86400000).toISOString();
    out.codes = [`xorg-sq-${tag}`];   // the operator's act, said to the walks' code check (attack(): never a door's)
    await target.query(`INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES (${qSql(`xorg-sq-${tag}`)}, ${qSql(fresh)}, ${qSql(await signupCodeHash(code))}, ${qSql(at)}, ${qSql(until)})`);
    const su = await pacedHttp(D, "POST", "/signup", { body: { email: fresh, code, password: hPass, device: "attack-xorg" } });
    out.calls++;
    let suTok = null; try { suTok = JSON.parse(su.text).token || null; } catch { suTok = null; }
    if (su.status !== 200) out.findings.push(`${who.label}: instrument — the squatted email's holder did not sign up (${su.status}): the squat proves less`);
    // the owner's ruling (2026-10-09; PLATFORM §3's squat row): while the victim's seat waits, the holder's JSON sign-up and
    // sign-in by its passphrase never default into the account's one active seat — the squatter's org
    if (suTok) out.findings.push(`${who.label}: the squat — the holder's JSON sign-up signed straight into the squatter's org (its account's one active seat) while the victim's seat waits for its yes`);
    const ask = waits(await rowOf(sV.id)) ? await pacedHttp(D, "POST", "/login", { body: { email: fresh, password: hPass, device: "attack-xorg" } }) : null;
    if (ask) {
      out.calls++;
      let aj = null; try { aj = JSON.parse(ask.text); } catch { aj = null; }
      if (!(ask.status === 409 && aj && aj.error === "choose_org" && !aj.token)) out.findings.push(`${who.label}: the squat — the holder's JSON sign-in by its passphrase, naming no org while the victim's seat waits, answered ${ask.status} ${aj && aj.error} (not 409 choose_org): it defaults into the squatter's org`);
    }
    // the holder names the one org it holds an active seat in (its own choice): an ACCOUNT session, which gives the yes
    const named = waits(await rowOf(sV.id)) && aslug ? await pacedHttp(D, "POST", "/login", { body: { email: fresh, password: hPass, org: aslug, device: "attack-xorg" } }) : null;
    if (named) out.calls++;
    let hTok = null; try { hTok = named ? JSON.parse(named.text).token || null : null; } catch { hTok = null; }
    // the holder's own Accept (only while the seat still waits: a wrongful answer above is its own finding, and the walks after
    // still run on the account as it then stands)
    if (waits(await rowOf(sV.id))) {
      if (!hTok) out.findings.push(`${who.label}: instrument — the squatted email's holder got no account session from its sign-in naming its org (${named && named.status}): the yes cannot be given, the squat proves less`);
      else {
        const yes = await D.http("POST", "/orgs/seat", { cookie: hTok, body: { seat: sV.id, answer: "accept" } });
        out.calls++;
        if (yes.status !== 200) out.findings.push(`${who.label}: instrument — the holder's own Accept of the victim's waiting seat was refused (${yes.status}): the squat proves less`);
      }
    }
    accepted = Number((await rowOf(sV.id) || {}).active) === 1;
    if (!accepted) out.findings.push(`${who.label}: instrument — the victim's seat of the squatted email is not active after its holder's yes (${brief(await rowOf(sV.id))}): the squat proves less`);
    // after the yes: the victim's new member signs in to the victim's org as that seat; the attacker's values never land there
    if (accepted) {
      for (const v of [ks, own]) {
        const x = await signIn(fresh, v);
        if (x.org === vic.org) out.findings.push(`${who.label}: the squat — a value it holds for the email it seated first signs in to the victim's accepted seat of it (org ${vic.org})`);
      }
      const h = await signIn(fresh, kv, true);
      if (!(h.status === 200 && h.org === vic.org && h.id === sV.id)) out.findings.push(`${who.label}: the squat — the victim's new member (${fresh}), its seat accepted by its holder, cannot sign in to org ${vic.org} with its own key (${h.status}, ${h.id || "no seat"}): the attacker's earlier seat shadows them`);
      // 7.5b: the sign-in surfaces' set-up — an account seated in BOTH orgs (the victim's seat accepted by its holder), the
      // attacker holding its own seat's secret (the value that opens that seat now: its /profile change, else its key)
      out.held = { email: fresh, value: pf.status === 200 ? own : ks, seatId: sS.id };
    }
  }
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — the victim member's email seated (${seat1 && waits(seat1) ? "pending, inert" : "NOT pending"}), set-password ${seatId ? "tried" : "not reached"}, rotate-key and /profile on its seat, ${held.length} values tried at the root (none signs in); the squat: the victim's later seat waited, the squatter's key, seat session and /profile answered nothing of it, its holder's yes ${accepted ? "given, then" : "NOT given"}${vic.home ? " the victim's own sign-ins checked" : ""}`;
  return out;
}

// ---- the sign-up moves (sprint 7, 7.2): only the operator allows an email; a code opens its own email alone ----
// codesOf(target, except) -> every sign-up code row as text (its hash, never a code: none is kept), to compare; `except`: the ids
// of the codes this suite itself wrote AS THE OPERATOR (the squat's holder's: the account moves), never a door's
export const codesOf = async (target, except = []) => JSON.stringify(await target.query("SELECT id, email, code_hash, expires_at, used_at, used_how, revoked_at FROM signup_codes" +
  (except.length ? ` WHERE id NOT IN (${except.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(", ")})` : "") + " ORDER BY id"));
// signupMoves(target, attacker { label, key }, victim { org, owner, member, home }, V) -> { calls, findings, line }
async function signupMoves(target, who, vic, V) {
  const D = door(target), out = { calls: 0, findings: [] }, planted = new Set();
  const tag = randomBytes(3).toString("hex");
  const look = (what, text, sent, status) => {
    out.calls++;
    for (const x of sent) planted.add(x);
    if (status >= 500) out.findings.push(`${who.label} · ${what} -> ${status}`);
    const l = leaksOf(text, V, planted);
    if (l.length) out.findings.push(`${who.label} · ${what}: ${l.join(", ")}`);
  };
  // paced(...) — a sign-up or sign-in call, sent again ONCE after the address's budget window when the flood filter (LOGIN_LIMIT,
  // one budget for /login and /signup; enforced by the local worker too) answered 429 too_many_attempts_ip: the moves run right
  // after the account moves' sign-ins, and a refusal by the flood filter proves nothing about the door behind it
  const paced = async (method, path, o) => {
    let r = await D.http(method, path, o);
    if (r.status === 429 && /too_many_attempts_ip/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await D.http(method, path, o); }
    return r;
  };
  const post = async (path, { key, form, body }) => { const r = await (path === "/signup" ? paced : D.http)("POST", path, { key, form, body }); look(`POST ${path} ${(form && form.action) || (body && body.action) || ""}`.trim(), r.text, sentOf(form || body), r.status); return r; };
  const fresh = `xorg-su-${tag}@xorg.invalid`;
  // the victim's member's email is the attacker's own typing already (the account moves seated it in the attacker's org, so its
  // Control page lists it): planted, as any value the attacker sent
  const vm = (await D.mcp(vic.member, "whoami")).out || {}, vo = (await D.mcp(vic.owner, "whoami")).out || {};
  if (vm.email) planted.add(vm.email);
  // 1 · no route mints a code: the attacker's seat asks every door that could
  const c0 = await codesOf(target);
  for (const action of ["allow", "allow-email", "allowlist", "signup-code", "mint-code", "invite", "add-invite"]) await post("/control", { key: who.key, form: { action, email: fresh, days: "7" } });
  await post("/signup", { key: who.key, body: { action: "allow", email: fresh, days: 7 } });
  await post("/signup", { key: who.key, form: { email: fresh, code: "", web: "1" } });
  if ((await codesOf(target)) !== c0) out.findings.push(`${who.label}: a sign-up code was minted or changed through the door (only the operator mints one)`);
  // 2 · the operator allows the attacker's own fresh email; the attacker brings that code to the victim's emails
  const { signupCodeHash } = await import("../src/accounts.js");
  const { newCode } = await import("./operator.mjs");
  const code = newCode(), at = new Date().toISOString(), until = new Date(Date.now() + 86400000).toISOString();
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  await target.query(`INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES (${q(`xorg-su-${tag}`)}, ${q(fresh)}, ${q(await signupCodeHash(code))}, ${q(at)}, ${q(until)})`);
  const emails = [vm.email, vo.email].filter(Boolean).map((e) => String(e).toLowerCase());
  if (emails.length !== 2) { out.findings.push(`${who.label}: instrument — the victim's member and owner have no emails (${brief([vm.email, vo.email])}): the sign-up moves prove nothing`); return out; }
  const ids = [vm.id, vo.id].map((x) => `'${String(x).replace(/'/g, "''")}'`).join(", ");
  const state = async () => JSON.stringify([await target.query(`SELECT email, pass_hash, pass_salt FROM accounts WHERE email IN (${emails.map(q).join(", ")}) ORDER BY email`),
    await target.query(`SELECT COUNT(*) AS n FROM tokens WHERE revoked = 0 AND person_id IN (${ids})`)]);
  const before = await state();
  const chose = `attacker-${tag}-signup`;
  for (const e of emails) {
    const r = await post("/signup", { body: { email: e, code, password: chose, device: "attack-xorg" } });
    if (r.status === 200) out.findings.push(`${who.label}: the code the operator gave for ITS email signed up the victim's ${e} (${r.status})`);
  }
  if ((await state()) !== before) out.findings.push(`${who.label}: the victim's accounts or sessions changed under a sign-up with another email's code`);
  // the passphrase it chose opens no seat of the victim's, at the address
  const li = await paced("POST", "/login", { body: { email: emails[0], password: chose, device: "attack-xorg" } });
  look(`POST /login as ${emails[0]}`, li.text, sentOf({ email: emails[0], password: chose }), li.status);
  let tok = null; try { tok = JSON.parse(li.text).token || null; } catch { tok = null; }
  if (li.status === 200 && tok) {
    const me = (await D.mcp(tok, "whoami")).out || {};
    const org = me.id ? Number(((await target.query(`SELECT org FROM people WHERE id = ${q(me.id)}`))[0] || {}).org) : null;
    if (org === vic.org) out.findings.push(`${who.label}: signed in as the victim's member (${emails[0]}) into org ${vic.org} with the passphrase it chose at sign-up`);
  }
  // the instrument: the attacker's own email with its own code signs up (the door is open, so its refusals above meant something)
  const own = await post("/signup", { body: { email: fresh, code, password: chose, device: "attack-xorg" } });
  if (own.status !== 200) out.findings.push(`${who.label}: instrument — its own allowed email with its own code did not sign up (${own.status}): the moves prove nothing`);
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — 9 doors asked to mint a code (none did); the operator's code for its own email tried on the victim's member and owner (refused, nothing changed); its own sign-up ${own.status}`;
  return out;
}

// ---- the invite moves (sprint 12, 12.3; src/accounts.js THE INVITE LINK: an org's admin mints a one-time link for a seat of its
// own org; the invitee sets the account's passphrase, for an account new in all but name, marked with that org) ----
// inviteMoves(target, attacker { label, key, org }, victim { org, owner, member }, V) -> { calls, findings, line }
//   (1) it aims the mint at the victim: invite-link on every victim person (the walk's postCalls do too) and Invite with a link for
//       the victim member's email (an account seated in the victim's org: its seat waits, so no link) — no link in any answer, no
//       link row naming a victim seat or the victim's org; (2) the race: it mints a link for a FRESH email, the victim's owner seats
//       that email after (it waits), and the attacker brings its own link — refused account_stands, nothing written: the account the
//       victim seated takes no passphrase of the attacker's; (3) the squat by link: it mints for another fresh email and redeems the
//       link ITSELF (it holds the passphrase), the victim's owner seats that email after (it waits) — the invite-made account's
//       session shows no victim seat on the picker, answers it neither way, reads nothing at the victim's address, and creates no
//       org; (4) a link used at the victim's address (POST /<victim>/signup) is the one 404 and spends nothing; the same link at
//       the root lands in the ATTACKER's org alone. Instruments: its own links appear, its own redemptions sign in.
async function inviteMoves(target, who, vic, V) {
  const D = door(target), out = { calls: 0, findings: [] }, planted = new Set();
  const tag = randomBytes(3).toString("hex");
  const look = (what, text, sent, status) => {
    out.calls++;
    for (const x of sent) planted.add(x);
    if (status >= 500) out.findings.push(`${who.label} · ${what} -> ${status}`);
    const l = leaksOf(text, V, planted);
    if (l.length) out.findings.push(`${who.label} · ${what}: ${l.join(", ")}`);
  };
  const LINK = /\/signup\?via=invite#([0-9a-f]{48})\b/;
  const form = async (key, fields) => { const r = await D.http("POST", "/control", { key, form: fields }); look(`POST /control ${fields.action}${fields.deliver ? ` deliver=${fields.deliver}` : ""}`, r.text, sentOf(fields), r.status); return r; };
  const linkOf = (r) => (LINK.exec(String((r && r.text) || "")) || [])[1] || null;
  const redeem = async (token, path = "/signup") => {
    const body = { via: "invite", invite: token, password: `attacker-${tag}-invite-pass`, device: "attack-xorg" };
    const r = await pacedHttp(D, "POST", path, { body });
    look(`POST ${path} (an invite link)`, r.text, sentOf({ ...body, invite: "" }), r.status);
    let j = null; try { j = JSON.parse(r.text); } catch { j = null; }
    return { status: r.status, json: j, token: (j && j.token) || null };
  };
  const rowOf = async (id) => (id ? (await target.query(`SELECT org, active, pending FROM people WHERE id = ${qSql(id)}`))[0] || null : null);
  const seatOf = async (email, org) => (await target.query(`SELECT id, active, pending FROM people WHERE email = ${qSql(email)} AND org = ${Number(org)}`))[0] || null;
  const waits = (r) => !!r && Number(r.pending) === 1 && Number(r.active) === 0;
  const victimLinks = async () => JSON.stringify(await target.query(`SELECT id, person_id, used_at, revoked_at FROM seat_invites WHERE org = ${Number(vic.org)} OR person_id IN (SELECT id FROM people WHERE org = ${Number(vic.org)}) ORDER BY id`));
  const vslug = await slugOf(target, vic.org);
  // 1 · the mint aimed at the victim
  // (sprint 12's review) a link is only for a seat never used, and the victim's seeded people have all worked: the victim's owner
  // adds a FRESH seat (a key, never used), so the mint aimed across the wall meets a seat it would link
  await D.http("POST", "/control", { key: vic.owner, form: { action: "add-person", name: `Zzz Xorg Fresh ${tag}`, email: `xorg-ifr-${tag}@xorg.invalid` } });
  const fresh = await seatOf(`xorg-ifr-${tag}@xorg.invalid`, vic.org);
  if (!fresh) out.findings.push(`${who.label}: instrument — the victim's fresh seat was not made: the mint across the wall meets only working seats`);
  const l0 = await victimLinks();
  for (const pid of [...V.people, ...(fresh ? [fresh.id] : [])]) { const r = await form(who.key, { action: "invite-link", personId: pid }); if (linkOf(r)) out.findings.push(`${who.label}: invite-link on the victim's person ${pid} answered a link`); }
  const vm = (await D.mcp(vic.member, "whoami")).out || {};
  if (vm.email) {
    planted.add(vm.email);
    const r = await form(who.key, { action: "add-person", name: `Aaa Xorg Invite ${tag}`, email: vm.email, deliver: "link" });
    if (linkOf(r)) out.findings.push(`${who.label}: Invite with a link for the victim member's email (an account seated in org ${vic.org}) answered a link: its seat must wait, linkless`);
  } else out.findings.push(`${who.label}: instrument — the victim's member has no email: the linkless wait is not walked`);
  if ((await victimLinks()) !== l0) out.findings.push(`${who.label}: an invite link row of the victim's org (or naming a victim seat) was made or changed by its mints`);
  // 2 · the race: its link for a fresh email, then the victim seats that email (it waits): its link sets nothing
  const e2 = `xorg-inv-${tag}@xorg.invalid`;
  const t2 = linkOf(await form(who.key, { action: "add-person", name: `Aaa Xorg Link ${tag}`, email: e2, deliver: "link" }));
  await D.http("POST", "/control", { key: vic.owner, form: { action: "add-person", name: `Zzz Xorg Linked ${tag}`, email: e2 } });
  const v2 = await seatOf(e2, vic.org);
  if (!t2 || !v2) out.findings.push(`${who.label}: instrument — the race's link (${t2 ? "made" : "none"}) or the victim's seat (${v2 ? "made" : "none"}) is missing: the race proves nothing`);
  else {
    if (!waits(v2)) out.findings.push(`${who.label}: the victim's later seat of an email the attacker invited first does not wait for its holder's yes (${brief(v2)})`);
    const r = await redeem(t2);
    const acct = (await target.query(`SELECT pass_hash FROM accounts WHERE email = ${qSql(e2)}`))[0];
    if (r.status !== 409 || (acct && acct.pass_hash)) out.findings.push(`${who.label}: its own link, after the victim seated the same email, ${r.status === 200 ? "SET the account's passphrase" : `answered ${r.status}`} (an account the victim's seat waits on must take no passphrase of the attacker's: 409 account_stands)`);
    if (!waits(await rowOf(v2.id))) out.findings.push(`${who.label}: the victim's waiting seat changed under the attacker's link (${brief(await rowOf(v2.id))})`);
  }
  // 3 · the squat by link: its link redeemed by itself, then the victim seats that email (it waits)
  const e3 = `xorg-isq-${tag}@xorg.invalid`;
  const t3 = linkOf(await form(who.key, { action: "add-person", name: `Aaa Xorg Squat ${tag}`, email: e3, deliver: "link" }));
  const own3 = t3 ? await redeem(t3) : null;
  if (!own3 || own3.status !== 200 || !own3.token) out.findings.push(`${who.label}: instrument — its own link for a fresh email did not sign it in (${own3 && own3.status}): the squat proves nothing`);
  else {
    await D.http("POST", "/control", { key: vic.owner, form: { action: "add-person", name: `Zzz Xorg Squatted ${tag}`, email: e3 } });
    const v3 = await seatOf(e3, vic.org);
    if (!waits(v3)) out.findings.push(`${who.label}: the squat by link — the victim's later seat of the email whose link the attacker redeemed does not wait (${brief(v3)})`);
    else {
      const sess = { cookie: own3.token };
      const pick = await D.http("GET", "/orgs", { key: sess, accept: "text/html" });
      look("GET /orgs (the invite-made account)", pick.text, [], pick.status);
      if (String(pick.text).includes(v3.id) || (vslug && String(pick.text).includes(`/${vslug}`))) out.findings.push(`${who.label}: the squat by link — the invite-made account's picker shows the victim's waiting seat`);
      for (const answer of ["accept", "decline"]) {
        const a = await D.http("POST", "/orgs/seat", { key: sess, body: { seat: v3.id, answer } });
        look(`POST /orgs/seat ${answer} (the invite-made account, the victim's waiting seat)`, a.text, sentOf({ seat: v3.id, answer }), a.status);
        if (a.status >= 200 && a.status < 300) out.findings.push(`${who.label}: the squat by link — the invite-made account answered the victim's waiting seat (${answer}: ${a.status})`);
      }
      if (!waits(await rowOf(v3.id))) out.findings.push(`${who.label}: the squat by link — the victim's waiting seat changed (${brief(await rowOf(v3.id))})`);
      if (vslug) {
        const w = await D.http("GET", `/${vslug}/whoami`, { key: sess });
        look(`GET /${vslug}/whoami (the invite-made account's session)`, w.text, [], w.status);
        if (w.status === 200) out.findings.push(`${who.label}: the squat by link — the invite-made account's session reads at the victim's address (${w.status})`);
      }
      const mk = await pacedHttp(D, "POST", "/orgs", { body: { email: e3, password: `attacker-${tag}-invite-pass`, name: `Xorg Squat ${tag}`, slug: `xorg-squat-${tag}` } });
      look("POST /orgs (the invite-made account)", mk.text, sentOf({ email: e3, slug: `xorg-squat-${tag}`, name: `Xorg Squat ${tag}` }), mk.status);
      if (mk.status === 200) out.findings.push(`${who.label}: the squat by link — the invite-made account created an org (the waitlist bypassed)`);
    }
  }
  // 4 · a link used at the victim's address: the one 404, nothing spent; the same link at the root: the attacker's org alone
  const e4 = `xorg-iat-${tag}@xorg.invalid`;
  const t4 = linkOf(await form(who.key, { action: "add-person", name: `Aaa Xorg There ${tag}`, email: e4, deliver: "link" }));
  if (!t4 || !vslug) out.findings.push(`${who.label}: instrument — no link (or no victim address) for the address move`);
  else {
    const there = await redeem(t4, `/${vslug}/signup`);
    const spent = (await target.query(`SELECT used_at FROM seat_invites WHERE email = ${qSql(e4)}`))[0];
    if (there.status !== 404 || (spent && spent.used_at)) out.findings.push(`${who.label}: its link at the victim's address (POST /${vslug}/signup) answered ${there.status}${spent && spent.used_at ? " and was SPENT" : ""} (the one 404, nothing spent)`);
    const root = await redeem(t4);
    const me = root.token ? (await D.mcp(root.token, "whoami")).out || {} : {};
    const org = me.id ? await orgOfPerson(target, me.id) : null;
    if (root.status !== 200 || org !== Number(who.org)) out.findings.push(`${who.label}: its link at the root did not land in its own org alone (${root.status}, org ${org})`);
  }
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — invite-link on ${V.people.length + (fresh ? 1 : 0)} victim people (a fresh seat among them) and a link for the victim member's email (none made); its link after the victim seated the email (refused, nothing set); the squat by link (no picker row, no answer, no read at /${vslug}, no org); its link at the victim's address (the one 404)`;
  return out;
}

// ---- the activity walk (sprint 12, 12.5: Activity across every project) ----
// activityMoves(target, attacker { label, key, org, slug }, victim { org }, V, failFast) -> { calls, answered, findings, line }
//   changes {org: true, list: true} (and its narrowings: the victim's projects by key and slug, its people, a cursor naming its
//   contribution, every lane and state) and {org: true}; GET /audit?all=1 (?in=, ?who=) as a page and GET /changes?org=1&list=1
//   (projects, person) as JSON. In-process (target.write), first a victim row filed under the attacker's OWN project key, newest
//   of all, its text the victim's canary (a key collision no door makes), removed after. Nothing of the victim may answer; the
//   instrument: the attacker's own list answers its own contributions (a walk of empty answers proves nothing).
async function activityMoves(target, who, vic, V, failFast = false) {
  const D = door(target), out = { calls: 0, answered: 0, findings: [], fivexx: [], fivexxAnswers: [] }, planted = new Set();
  const look = (what, text, sent, status) => {
    out.calls++;
    if (status < 300) out.answered++;
    if (status >= 500) out.fivexx.push(`${who.label} · ${what} -> ${status}`);
    const l = leaksOf(text, V, new Set([...planted, ...sent]));
    if (l.length) out.findings.push(`${who.label} · ${what}: ${l.join(", ")}`);
  };
  const me = (await D.mcp(who.key, "whoami")).out || {};
  // eval: true on every read of this walk: on the preview the throwaway orgs' rows are eval-marked (the fixture export), and the
  // activity read hides eval rows unless asked (the screens' rule), so a read without it answers nothing either way and proves nothing
  const mine = await D.mcp(who.key, "changes", { org: true, list: true, since: "2000-01-01", eval: true });
  const own = (mine.out && Array.isArray(mine.out.items) ? mine.out.items : []);
  const ownKey = own.length ? String(own[0].project) : null;
  // the attacker's own projects' slugs are its own values (its links name them: ?project=<slug>); "shop", which both orgs hold, is
  // org 1's bare KEY as well, so an org-2 attacker's own link would otherwise read as org 1's key
  for (const x of (mine.out && Array.isArray(mine.out.projects) ? mine.out.projects : [])) if (x && x.slug) planted.add(String(x.slug));
  let plant = null;
  if (target.write && ownKey) {
    plant = `T-29990101-${randomBytes(3).toString("hex")}`;
    await target.write("INSERT INTO transmission (id, submitter, lane, kind, what, route, status, eval, via, project, created_at, org) VALUES (?, ?, 'code', 'pr', ?, 'auto', 'routed', 0, 'mcp', ?, ?, ?)",
      plant, V.people[0] || "nobody", `${V.word} collision row`, ownKey, "2999-01-01T00:00:00.000Z", Number(vic.org));
    V.ids = [...V.ids, plant]; V.idRe = undefined;
  }
  try {
    const VAL = valuesFor(V);
    const sets = [{}, ...VAL.projects.map((x) => ({ projects: x })), ...VAL.person.map((x) => ({ person: x })), ...VAL.before.map((x) => ({ before: x })),
      ...["code", "gtm"].map((x) => ({ lane: x })), ...["landed", "with", "decided", "needs"].map((x) => ({ state: x })), { person: V.people[0], projects: [...V.keys] }, { eval: true }];
    for (const a of sets) {
      if (failFast && (out.findings.length || out.fivexx.length)) break;
      const args = { org: true, list: true, since: "2000-01-01", eval: true, ...a };
      const r = await D.mcp(who.key, "changes", args);
      look(`changes ${JSON.stringify(args).slice(0, 140)}`, r.text, sentOf(args), r.status);
    }
    { const r = await D.mcp(who.key, "changes", { org: true, since: "2000-01-01", eval: true }); look("changes {org: true}", r.text, [], r.status); }
    const slug = slugsOf(V).find((x) => x !== "shop") || slugsOf(V)[0] || "", key = [...V.keys].pop() || "";
    const paths = ["/audit?all=1", `/audit?all=1&in=${encodeURIComponent(slug)}`, `/audit?all=1&in=${encodeURIComponent(key)}`, ...V.people.map((p) => `/audit?all=1&who=${encodeURIComponent(p)}`),
      "/changes?org=1&list=1&since=2000-01-01&eval=1", `/changes?org=1&list=1&eval=1&projects=${encodeURIComponent(key)}`, `/changes?org=1&list=1&eval=1&projects=${encodeURIComponent(slug)}`,
      ...V.people.map((p) => `/changes?org=1&list=1&since=2000-01-01&eval=1&person=${encodeURIComponent(p)}`)];
    const base = who.slug ? `/${who.slug}` : "";
    // GET /changes?org=1&list=1 is the activity read as JSON; to a browser it is the one-project What changed page, which reads its
    // project's ledger by the door's key (no org term to test: keys are org-namespaced) and is walked by every walk without the
    // planted collision
    for (const path of paths) for (const accept of path.startsWith("/changes") ? ["application/json"] : ["text/html", "application/json"]) {
      if (failFast && (out.findings.length || out.fivexx.length)) break;
      const r = await D.http("GET", base + path, { key: who.key, accept });
      look(`GET ${base}${path} (${accept})`, r.text, sentOf(path), r.status);
    }
  } finally {
    if (plant) { await target.write("DELETE FROM transmission WHERE id = ?", plant); V.ids = V.ids.filter((x) => x !== plant); V.idRe = undefined; }
  }
  if (!own.length) out.findings.push(`${who.label}: instrument — its own changes {org: true, list: true} answered none of its own contributions (${brief(mine.out)}): the walk proves nothing`);
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — changes {org, list} narrowed by the victim's projects, people and a cursor, {org}, GET /audit?all=1 and /changes?org=1&list=1${plant ? ", a victim row planted under its own project's key" : ""}: nothing of org ${vic.org}${me.id ? "" : " (whoami answered no id)"}`;
  return out;
}

// ---- the grant moves (sprint 7, 7.5a; PLATFORM §2 items 8 and 9: one /mcp, the OAuth grant carries the person and the org, a
// call names its org with orgSlug) ----
// grantMoves(target, attacker { label, key, org }, victim { org }, V) -> { calls, findings, line }
//   The attacker's admin seats a FRESH email in its own org (Control's add-person: the seat's own secret, which it holds) and the
//   operator gives that account its own passphrase (as the sign-up does: this suite writes it on the database). Through the REAL
//   OAuth provider (register, the sign-in form, the code exchange) it connects TWICE: with the seat's secret (a SEAT grant) and
//   with the account's passphrase (an ACCOUNT grant, whose account holds no seat in the victim's org). Each grant then names the
//   victim's org (orgSlug, and ?orgSlug= on a resource) on whoami, a read of the victim's project, a preview of an item under the
//   victim's goal and brain://updates — every one refused org_unreachable (-32003 on the resource), carrying nothing of the
//   victim; the account grant naming a name no org holds gets the SAME answer (the refusal tells nothing of the victim's org's
//   existence); the victim's rows unchanged. Instruments: each grant answers whoami as its own seat, and the answer lists only
//   the attacker's org. (The bearer keys' and sessions' orgSlug is in every walk: valuesFor.)
async function grantMoves(target, who, vic, V) {
  const D = door(target), out = { calls: 0, findings: [] }, planted = new Set();
  const tag = randomBytes(3).toString("hex");
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const look = (what, text, sent, status) => {
    out.calls++;
    for (const x of sent) planted.add(x);
    if (status >= 500) out.findings.push(`${who.label} · ${what} -> ${status}`);
    const l = leaksOf(text, V, planted);
    if (l.length) out.findings.push(`${who.label} · ${what}: ${l.join(", ")}`);
  };
  // the victim's people the account moves seated in the attacker's org are the attacker's own typing already (its Control page
  // lists them): planted, as any value the attacker sent
  for (const k of [vic.member, vic.owner]) { const m = k ? (await D.mcp(k, "whoami")).out || {} : {}; if (m.email) planted.add(m.email); }
  const email = `xorg-grant-${tag}@xorg.invalid`;
  const add = await D.http("POST", "/control", { key: who.key, form: { action: "add-person", name: `Grant ${tag}`, email } });
  look("POST /control add-person (its own fresh seat)", add.text, sentOf({ email }), add.status);
  const seatKey = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  if (!seatKey) { out.findings.push(`${who.label}: instrument — add-person minted no seat secret (${add.status}): the grant moves prove nothing`); return out; }
  const { pbkdf2 } = await import("../src/util.js");
  const pass = `xorg-grant-pass-${tag}`, salt = randomBytes(16).toString("hex");
  await target.query(`UPDATE accounts SET pass_hash = ${q(await pbkdf2(pass, salt))}, pass_salt = ${q(salt)} WHERE email = ${q(email)}`);
  // oauth(password) -> an access token through the provider, signed in as `email` (oauthConnect, below)
  const oauth = async (password) => (await oauthConnect(target, email, password)).token;
  out.held = { email, pass, seatKey };
  const before = await snapshot(target, vic.org);
  const items = [{ kind: "goal", op: "upsert", data: { id: `xorg-grant-${tag}`, title: "x", parent: V.goal } }];
  const vkey = [...V.keys][0];
  for (const [kind, password] of [["seat grant", seatKey], ["account grant", pass]]) {
    const tok = await oauth(password);
    if (!tok) { out.findings.push(`${who.label}: instrument — its ${kind} did not connect: the grant moves prove nothing`); continue; }
    const me = await D.mcp(tok, "whoami");
    look(`${kind} · whoami`, me.text, [], me.status);
    const mine = (me.out && Array.isArray(me.out.orgs) ? me.out.orgs : []).map((o) => o.slug);
    if (!me.out || !me.out.id || mine.length !== 1 || mine[0] !== who.slug) out.findings.push(`${who.label}: instrument — its ${kind}'s whoami (${brief(me.out)}) is not its own seat in its own org alone`);
    const calls = [["whoami", { orgSlug: V.slug }], ["read", { project: vkey, kind: "goal", orgSlug: V.slug }], ["read", { ref: `goal/${V.goal}`, orgSlug: V.slug }],
      ["preview", { project: vkey, items, orgSlug: V.slug }], ["home", { project: vkey, orgSlug: V.slug }]];
    let answers = [];
    for (const [name, args] of calls) {
      const r = await D.mcp(tok, name, args);
      look(`${kind} · ${name} ${JSON.stringify(args).slice(0, 100)}`, r.text, sentOf(args), r.status);
      if (!(r.out && r.out.error === "org_unreachable")) out.findings.push(`${who.label} · its ${kind} · ${name} naming the victim's org was not refused org_unreachable (${brief(r.out)})`);
      answers.push(JSON.stringify(r.out));
    }
    const res = await D.rpc(tok, "resources/read", { uri: `brain://updates?project=${encodeURIComponent(vkey)}&orgSlug=${encodeURIComponent(V.slug)}` });
    look(`${kind} · resources/read brain://updates?orgSlug=<victim>`, res.text, sentOf(`/updates?project=${vkey}&orgSlug=${V.slug}`), res.status);
    if (!(res.json && res.json.error && res.json.error.code === -32003 && /^org_unreachable/.test(res.json.error.message))) out.findings.push(`${who.label} · its ${kind} · brain://updates naming the victim's org was not refused (${brief(res.json)})`);
    // a name no org holds: the SAME answer as the victim's org (the refusal tells nothing of whether an org exists)
    const ghost = await D.mcp(tok, "whoami", { orgSlug: `no-org-${tag}` });
    look(`${kind} · whoami {orgSlug: <no org>}`, ghost.text, [`no-org-${tag}`], ghost.status);
    if (JSON.stringify(ghost.out) !== answers[0]) out.findings.push(`${who.label} · its ${kind}: naming the victim's org and naming no org answer differently (${brief(ghost.out)} vs ${answers[0].slice(0, 200)})`);
  }
  const after = await snapshot(target, vic.org);
  const moved = Object.keys({ ...before, ...after }).filter((t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]));
  if (moved.length) out.findings.push(`${who.label}: org ${vic.org}'s rows changed under the grant moves: ${moved.join(", ")}`);
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — a seat grant and an account grant (no seat there), each naming the victim's org on 5 tools and a resource: every one org_unreachable, one answer with a name no org holds; the victim's rows unchanged`;
  return out;
}

// ---- THE SIGN-IN SURFACES (sprint 7, 7.5b; PLATFORM §3, the sprint-6 review: "the attack suite does not walk the OAuth, cookie,
// read-only, Partner or cron surfaces" — the four sign-in ones here; the cron and the count-leak differential walk are S8's) ----
// pacedHttp(D, method, path, o) -> a call that spends the address's sign-in budget (POST /login), sent again ONCE after the window
// when the flood filter answered 429 (the local worker enforces LOGIN_LIMIT; a refusal by it proves nothing about the door)
async function pacedHttp(D, method, path, o) {
  let r = await D.http(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await D.http(method, path, o); }
  return r;
}
// oauthConnect(target, email, password, scope) -> { status, text, token, refresh, code, client, verifier, redirect }: a connection
// through the REAL provider (register, the sign-in form, the code exchange); token null when the form signed no one in
export async function oauthConnect(target, email, password, scope = "mcp:read mcp:write") {
  const redirect = "https://client.invalid/cb";
  const reg = await target.call("POST", "/oauth/register", { headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ client_name: "attack-xorg", redirect_uris: [redirect], token_endpoint_auth_method: "none" }) });
  let client = null; try { client = JSON.parse(reg.text).client_id; } catch { client = null; }
  const verifier = randomBytes(32).toString("base64url");
  const qs = new URLSearchParams({ response_type: "code", client_id: client || "", redirect_uri: redirect, scope, state: "s", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const page = await target.call("GET", `/oauth/authorize?${qs}`, { headers: { accept: "text/html" } });
  const req = (page.text.match(/name="oauth_req" value="([^"]+)"/) || [])[1] || "";
  hold(password);
  const r = await target.call("POST", "/oauth/authorize", { headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" }, body: new URLSearchParams({ oauth_req: req, email, password }).toString() });
  let code = null; try { code = new URL(r.location || "http://x/").searchParams.get("code"); } catch { code = null; }
  if (!code) return { status: r.status, text: r.text, token: null, client, redirect, verifier };
  const t = await tokenCall(target, { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: client, code_verifier: verifier });
  return { status: r.status, text: r.text, token: t.access_token || null, refresh: t.refresh_token || null, code, client, verifier, redirect };
}
// tokenCall(target, form) -> the token endpoint's JSON answer ({} when it is not JSON), with its status as _status
async function tokenCall(target, form) {
  const t = await target.call("POST", "/oauth/token", { headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(form).toString() });
  let j = {}; try { j = JSON.parse(t.text) || {}; } catch { j = {}; }
  hold(form.code, form.refresh_token, j.access_token, j.refresh_token);
  return { ...j, _status: t.status };
}
// movesLook(out, who, V, planted) -> look(what, text, sent, status): the moves' own leak check (as the account moves')
const movesLook = (out, who, V, planted) => (what, text, sent, status) => {
  out.calls++;
  for (const x of sent) planted.add(x);
  if (status >= 500) out.findings.push(`${who.label} · ${what} -> ${status}`);
  const l = leaksOf(text, V, planted);
  if (l.length) out.findings.push(`${who.label} · ${what}: ${l.join(", ")}`);
};
const qSql = (v) => `'${String(v).replace(/'/g, "''")}'`;
const orgOfPerson = async (target, id) => { const r = id ? await target.query(`SELECT org FROM people WHERE id = ${qSql(id)}`) : []; return r.length ? Number(r[0].org) : null; };

// signinMoves(target, attacker { label, key, org, slug }, victim { org }, V, held) -> { calls, findings, line }
//   THE AUTHORIZE FORM AND THE COOKIE, with an email the victim's org holds a seat of. The account moves' squat left the attacker
//   holding a seat of an account seated in BOTH orgs — its own org's seat of the email it seated first, whose secret its Control
//   minted, and the victim's later seat of it, accepted by the account's holder (the review's A1: a seat added for an account
//   that stands elsewhere waits for that yes, so the holder gives it before this walk) — held: the email, the value that opens
//   the attacker's seat now and its id. (1) OAuth: the sign-in form with that email and that value must make a SEAT grant of the
//   attacker's own seat (never the account): whoami is that seat, in the attacker's org, listing that org alone; naming the
//   victim's org is org_unreachable; reads of the victim's project and refs carry nothing; /<victim>/mcp with the token is the one
//   404; the token exchange: the same code again gives no token, the refresh token gives a new one of the same seat. (2) The
//   cookie: a sign-in at the root with the same values is a SEAT session: under the victim's address it is the one 404, under its
//   own org's address it is that seat, and the one /mcp refuses it (it takes no cookie).
async function signinMoves(target, who, vic, V, held) {
  const D = door(target), out = { calls: 0, findings: [] }, planted = new Set([held.email, held.value]);
  const look = movesLook(out, who, V, planted);
  await notHereBody();
  const vkey = [...V.keys][0];
  const notHere = (what, r) => { out.calls++; if (r.status !== 404 || r.text !== NOT_HERE_BODY) out.findings.push(`${who.label} · ${what} -> ${r.status}: the victim's address answered it (${JSON.stringify(String(r.text).slice(0, 60))})`); };
  // the account holds its OWN passphrase, as every signed-up account does (the squat's holder signed up with the operator's code;
  // this suite writes one on the database should the account have none), so an account grant of it, wrongly made, would stand
  // and act — as the account's ACTIVE seat in the victim's org
  const acct = (await target.query(`SELECT pass_hash FROM accounts WHERE email = ${qSql(String(held.email).toLowerCase())}`))[0];
  if (acct && !acct.pass_hash) {
    const { pbkdf2 } = await import("../src/util.js");
    const salt = randomBytes(16).toString("hex");
    await target.query(`UPDATE accounts SET pass_hash = ${qSql(await pbkdf2(`victim-account-${randomBytes(6).toString("hex")}`, salt))}, pass_salt = ${qSql(salt)} WHERE email = ${qSql(String(held.email).toLowerCase())}`);
  }
  // (1) the authorize form, the token exchange, the grant's reach
  const c = await oauthConnect(target, held.email, held.value);
  look("the OAuth sign-in form with the squatted email (an account seated in both orgs) and the seat secret it holds", c.text, [], c.status);
  if (!c.token) out.findings.push(`${who.label}: instrument — the OAuth form did not connect its own seat of the squatted email (an account seated in both orgs) (${c.status}): the OAuth moves prove nothing`);
  else {
    const me = await D.mcp(c.token, "whoami");
    look("its grant · whoami", me.text, [], me.status);
    const org = await orgOfPerson(target, me.out && me.out.id), orgs = ((me.out && me.out.orgs) || []).map((o) => o.slug);
    if (!me.out || me.out.id !== held.seatId || org !== who.org || orgs.length !== 1 || orgs[0] !== who.slug)
      out.findings.push(`${who.label}: the grant the OAuth form made with the squatted email (an account seated in both orgs) is not its own seat in its own org alone (whoami ${brief(me.out)}; org ${org}) — an ACCOUNT grant, the account's seat in the victim's org`);
    for (const [name, args] of [["whoami", { orgSlug: V.slug }], ["read", { project: vkey, kind: "goal" }], ["read", { ref: `goal/${V.goal}` }], ["read", { ref: V.tx[0] }], ["home", { project: vkey }], ["updates", {}], ["decisions", { qid: V.qid }]]) {
      const r = await D.mcp(c.token, name, args);
      look(`its grant · ${name} ${JSON.stringify(args).slice(0, 100)}`, r.text, sentOf(args), r.status);
      if (args.orgSlug && !(r.out && r.out.error === "org_unreachable")) out.findings.push(`${who.label} · its grant · ${name} naming the victim's org was not refused org_unreachable (${brief(r.out)})`);
    }
    const at = await D.http("POST", `/${V.slug}/mcp`, { key: c.token, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } } });
    look("its grant · POST /<victim>/mcp", at.text, [], at.status);
    notHere(`its grant at POST /${V.slug}/mcp`, at);
    // the token exchange: the refresh token gives a new token of the SAME seat; then the same code again gives none (the provider
    // also ends the grant a reused code came from: OAuth 2.1 §4.1.3)
    const fresh = c.refresh ? await tokenCall(target, { grant_type: "refresh_token", refresh_token: c.refresh, client_id: c.client }) : {};
    const me2 = fresh.access_token ? await D.mcp(fresh.access_token, "whoami") : null;
    out.calls += 2;
    if (!me2 || !me2.out || me2.out.id !== (me.out && me.out.id)) out.findings.push(`${who.label}: instrument — the refresh token gave no token of the same seat (${fresh._status}, ${brief(me2 && me2.out)})`);
    const again = await tokenCall(target, { grant_type: "authorization_code", code: c.code, redirect_uri: c.redirect, client_id: c.client, code_verifier: c.verifier });
    out.calls++;
    if (again.access_token) out.findings.push(`${who.label}: the token exchange gave a second token for the same code (${again._status})`);
  }
  // (2) the cookie: the same values at the root's sign-in
  const li = await pacedHttp(D, "POST", "/login", { body: { email: held.email, password: held.value, device: "attack-xorg" } });
  look("POST /login with the squatted email (an account seated in both orgs) and the seat secret it holds", li.text, [], li.status);
  let sess = null; try { sess = JSON.parse(li.text).token || null; } catch { sess = null; }
  if (!sess) out.findings.push(`${who.label}: instrument — its own seat of the squatted email (an account seated in both orgs) did not sign in (${li.status}): the cookie moves prove nothing`);
  else {
    for (const path of ["/whoami", "/home", `/goals?project=${encodeURIComponent(vkey)}`, "/control"]) {
      const r = await D.http("GET", `/${V.slug}${path}`, { cookie: sess, accept: "text/html" });
      look(`its session · GET /<victim>${path}`, r.text, sentOf(path), r.status);
      notHere(`its session at GET /${V.slug}${path}`, r);
    }
    const mine = await D.http("GET", `/${who.slug}/whoami`, { cookie: sess });
    let id = null; try { id = JSON.parse(mine.text).id; } catch { id = null; }
    out.calls++;
    if (id !== held.seatId) out.findings.push(`${who.label}: instrument — its own org's address does not answer its session as its seat (${mine.status}, ${id})`);
    // the one /mcp takes no cookie (the OAuth provider answers a call with no bearer: 401)
    const w = await D.mcp({ cookie: sess }, "whoami", { orgSlug: V.slug });
    look("its session · /mcp whoami {orgSlug: <the victim's org>}", w.text, sentOf({ orgSlug: V.slug }), w.status);
    if (w.status !== 401) out.findings.push(`${who.label}: its session reached /mcp (${w.status}: ${brief(w.out)})`);
  }
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — the OAuth form and the root's sign-in with the squatted email (an account seated in both orgs) and the seat secret it holds: its own seat alone (a seat grant, a seat session), the victim's org refused, its address the one 404; a code used twice gives nothing, a refresh the same seat`;
  return out;
}

// reachMoves(target, attacker { label, key, org, slug }, victim { org }, V, g, routes) -> { calls, findings, line, report }
//   THE GRANT'S REACH AND THE COOKIE WALKS, with the attacker's fresh seat and account (the grant moves made them: g = { email,
//   pass, seatKey }): (1) its ACCOUNT grant walks every tool (each victim value in each argument, and orgSlug the victim's) and
//   every resource; (2) its ACCOUNT session (the account's passphrase at the root) walks the victim's address (every GET route,
//   every POST once: the one 404) and the root (every GET route as a page: never sent under the victim's address; every POST
//   route); (3) its SEAT session (the seat's own secret) the victim's address and the root; /mcp refuses either (it takes no
//   cookie: the OAuth provider's 401). Nothing of the victim.
async function reachMoves(target, who, vic, V, g, routes, failFast) {
  const D = door(target), out = { calls: 0, answered: 0, findings: [], fivexx: [], fivexxAnswers: [], notes: [] }, planted = new Set([g.email, g.pass, g.seatKey]);
  const add = (r) => { out.calls += r.calls; out.answered += r.answered; out.findings.push(...r.findings); out.fivexx.push(...r.fivexx); out.fivexxAnswers.push(...r.fivexxAnswers); out.notes.push(...r.notes); };
  const acc = await oauthConnect(target, g.email, g.pass);
  out.calls += 4;
  if (!acc.token) out.findings.push(`${who.label}: instrument — its account grant did not connect (${acc.status}): the reach walk proves nothing`);
  else add(await walk(target, { label: `${who.label} · its ACCOUNT grant`, key: acc.token, slug: who.slug }, V, { planted, failFast, routes, secrets: [g.pass, g.seatKey], sections: { plant: false, gets: false, posts: false, address: false, readBack: false } }));
  for (const [kind, password] of [["ACCOUNT", g.pass], ["SEAT", g.seatKey]]) {
    if (failFast && (out.findings.length || out.fivexx.length)) break;
    const li = await pacedHttp(D, "POST", "/login", { body: { email: g.email, password, device: "attack-xorg" } });
    out.calls++;
    let sess = null; try { sess = JSON.parse(li.text).token || null; } catch { sess = null; }
    if (!sess) { out.findings.push(`${who.label}: instrument — its ${kind} session did not sign in (${li.status}): the cookie walk proves nothing`); continue; }
    // at the root (every GET route as a page: a page navigation is sent to the session's own org, never the victim's) and under the
    // victim's address (the one 404); its own address answers it (the walk's instrument)
    add(await walk(target, { label: `${who.label} · its ${kind} session`, key: { cookie: sess }, slug: who.slug }, V, { planted, failFast, routes, secrets: [g.pass, g.seatKey, acc.token], getSlice: 2, accepts: ["text/html"],
      sections: { plant: false, tools: false, resources: false, posts: kind === "ACCOUNT", readBack: false, end: false } }));
    // the one /mcp takes no cookie (the OAuth provider answers a call with no bearer: 401)
    const m = await D.mcp({ cookie: sess }, "whoami", { orgSlug: V.slug });
    out.calls++;
    if (m.status !== 401) out.findings.push(`${who.label} · its ${kind} session reached /mcp (${m.status}: ${brief(m.out)})`);
  }
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — its account grant on every tool and resource; its account session and its seat session at the victim's address (the one 404) and at the root (pages never sent to the victim), /mcp refusing both: nothing of the victim`;
  return out;
}

// readOnlyMoves(target, attacker { label, key, org, slug }, victim { org }, V, routes) -> { calls, findings, line }
//   THE READ-ONLY CREDENTIAL (ADR-050: sha256(key_hash + ":agent-r-read-only:v1"), derived from the attacker's own key, sent as a
//   Bearer header): every GET route with the victim's ids (as a page and as JSON) and every POST route (the victim's ids in each
//   body) — nothing of the victim; it never writes: the attacker's OWN org's rows unchanged table by table (and the direction's
//   snapshot holds the victim's); /mcp refuses it (401); the victim's address is the one 404. Instrument: GET /whoami answers it
//   as its seat. Writes nothing, so it runs on the ship's preview too.
// planted: the values the attacker's own walks sent (its people plant names the victim's people in its own rows: its own data)
async function readOnlyMoves(target, who, vic, V, routes, failFast, planted = new Set()) {
  const D = door(target);
  const me = await D.mcp(who.key, "whoami");
  const kh = me.out && me.out.id ? ((await target.query(`SELECT key_hash FROM people WHERE id = ${qSql(me.out.id)}`))[0] || {}).key_hash : null;
  const out = { calls: 1, answered: 0, findings: [], fivexx: [], fivexxAnswers: [], notes: [] };
  if (!kh) { out.findings.push(`${who.label}: instrument — its seat has no key hash to derive the read-only credential from`); return out; }
  const ro = createHash("sha256").update(kh + ":agent-r-read-only:v1").digest("hex");
  hold(ro);   // the review's M2: 64 hex, derived here (no answer carries it)
  const own0 = await snapshot(target, who.org);
  const r = await walk(target, { label: `${who.label} · its READ-ONLY credential`, key: ro, slug: who.slug, noSession: true }, V,
    { planted: new Set([...planted, ro]), failFast, routes, sections: { plant: false, tools: false, resources: false, readBack: false, end: false } });
  out.calls += r.calls; out.answered += r.answered; out.findings.push(...r.findings); out.fivexx.push(...r.fivexx); out.fivexxAnswers.push(...r.fivexxAnswers); out.notes.push(...r.notes);
  const own1 = await snapshot(target, who.org);
  // org_usage aside (8.2f, main's ruling): every call the credential makes counts in its OWN org's counter row (metering, not a
  // write it did); the victim's snapshots keep the table, so a call counted in another org's row still shows
  const moved = Object.keys({ ...own0, ...own1 }).filter((t) => t !== "org_usage" && JSON.stringify(own0[t]) !== JSON.stringify(own1[t]));
  if (moved.length) out.findings.push(`${who.label} · its READ-ONLY credential wrote: its own org's ${moved.map((t) => `${t} ${own0[t] && own0[t].n}→${own1[t] && own1[t].n}`).join(", ")}`);
  const m = await D.rpc(ro, "tools/call", { name: "whoami", arguments: {} });
  out.calls++;
  if (m.status !== 401) out.findings.push(`${who.label} · its READ-ONLY credential reached /mcp (${m.status}: ${String(m.text).slice(0, 80)})`);
  const w = await D.http("GET", "/whoami", { key: ro });
  let id = null; try { id = JSON.parse(w.text).id; } catch { id = null; }
  out.calls++;
  if (w.status !== 200 || id !== me.out.id) out.findings.push(`${who.label}: instrument — its read-only credential does not read GET /whoami as its seat (${w.status}): the walk proves nothing`);
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — its READ-ONLY credential on every GET and POST route and the victim's address: nothing of the victim, its own org unchanged, /mcp ${m.status}`;
  return out;
}

// partnerMoves(target, attacker { label, key, org, slug }, victim { org }, V, routes) -> { calls, findings, line }
//   THE PARTNER (a seat whose role class is Partner reads only the projects it is seated on: src/project.js, src/mcp.js
//   callTool's Partner branch): the attacker's admin makes two Partners in its own org — one seated NOWHERE, one seated on a
//   project of its own (made for it) — and a second project ("the vault") filed with a canary of its own (a goal, a question, a
//   doc, a contribution). Each Partner walks every tool, resource and GET route with the victim's ids AND the vault's: zero rows
//   of the other org, and zero rows of its own org's project it holds no seat on; the vault unchanged. Instruments: the seated
//   Partner reads its own project's goal; the vault's owner reads the vault's canary.
async function partnerMoves(target, who, vic, V, routes, failFast) {
  const D = door(target), out = { calls: 0, answered: 0, findings: [], fivexx: [], fivexxAnswers: [], notes: [] };
  const tag = randomBytes(3).toString("hex"), w2 = canary("vault"), W2 = w2.toUpperCase();
  const fail = (what, r) => out.findings.push(`${who.label}: instrument — ${what} (${brief(r && (r.out || r.text))}): the Partner moves prove nothing`);
  const mk = async (slug, name) => { const r = await D.mcp(who.key, "create_project", { key: slug, name }); out.calls++; return r.out && r.out.project ? r.out.project.key : null; };
  const desk = await mk(`pd${tag}`, `Partner desk ${tag}`), vault = await mk(`pv${tag}`, `Vault ${tag}`);
  if (!desk || !vault) { fail("the two projects were not made", null); return out; }
  const file = async (key, project, items) => {
    const pv = await D.mcp(key, "preview", { project, items }); out.calls++;
    if (!pv.out || !pv.out.previewId) return { error: pv };
    const f = await fileWith(D, key, pv.out, items, () => { out.calls++; });
    return f.ok ? { preview: pv.out.previewId, results: f.out.results || [] } : { error: f };
  };
  const vs = await file(who.key, vault, [
    { kind: "goal", op: "upsert", data: { id: `${w2}-root`, title: `Grow ${W2}`, parent: null, dimensions: ["leader"] } },
    { kind: "question", op: "upsert", data: { qid: `Q-${w2}-1`, question: `Which way for ${W2}?`, whoOwes: "owner", options: [{ what: `${W2} left` }, { what: `${W2} right` }] } },
    { kind: "doc", op: "upsert", data: { path: `notes/${w2}.md`, title: `${W2} notes`, body: `# ${W2} notes\n` } },
    { contribution: { lane: "leader", kind: "note", what: `${W2} note`, why: `${W2} why` } }]);
  const ds = await file(who.key, desk, [{ kind: "goal", op: "upsert", data: { id: `pd-${tag}-root`, title: `Desk ${tag}`, parent: null, dimensions: ["leader"] } }]);
  if (vs.error || ds.error) { fail("the vault and the desk were not filed", vs.error || ds.error); return out; }
  const vtx = vs.results.map((x) => x && x.id).filter(Boolean);
  const own = await D.mcp(who.key, "read", { project: vault, kind: "goal" }); out.calls++;
  if (!String(own.text).toLowerCase().includes(w2)) { fail("the vault's owner does not read its canary", own); return out; }
  // the vault as a second "victim": its word, its ids, its key (a project field naming it, a ?project= link to it)
  const V2 = { label: "its own org's project it holds no seat on", word: w2, ids: [...vtx, vs.preview], keys: new Set([vault]), prefix: null, people: [], hashes: [], slug: null,
    tx: [vtx[0], vtx[0]], goal: `${w2}-root`, qid: `Q-${w2}-1`, check: `AC.${w2}.1`, node: `screen:${w2}-home`, kind: `${w2}claim`, card: `${w2}-c1`, doc: `notes/${w2}.md`, file: `${w2}-file`, preview: vs.preview, pub: `${w2}-pub` };
  const vaultRows = async () => JSON.stringify(await target.query(`SELECT (SELECT COUNT(*) FROM transmission WHERE project = ${qSql(vault)}) AS t, (SELECT COUNT(*) FROM k_goals WHERE project = ${qSql(vault)}) AS g, (SELECT COUNT(*) FROM k_questions WHERE project = ${qSql(vault)}) AS q, (SELECT COUNT(*) FROM k_docs WHERE project = ${qSql(vault)}) AS d, (SELECT COUNT(*) FROM previews WHERE project = ${qSql(vault)}) AS p`));
  const v0 = await vaultRows();
  const secretOf = (t) => (String(t).match(/API key\): ([0-9a-f]{40})\b/) || [])[1] || null;
  for (const [label, seats] of [["seated nowhere", []], ["seated on one project", [desk]]]) {
    if (failFast && (out.findings.length || out.fivexx.length)) break;
    const a = await D.http("POST", "/control", { key: who.key, form: [["action", "add-person"], ["name", `Xorg Partner ${tag} ${seats.length}`], ["email", `xorg-pt-${tag}-${seats.length}@xorg.invalid`], ["role", "partner"], ["seatsChosen", "1"], ...seats.map((k) => ["projectKey", k])] });
    out.calls++;
    const pk = secretOf(a.text);
    if (!pk) { fail(`its Partner ${label} was not made`, a); continue; }
    const me = await D.mcp(pk, "whoami"); out.calls++;
    if (!me.out || !/partner/i.test(String(me.out.role || me.out.roleClass || ""))) { fail(`its Partner ${label} is not a Partner`, me); continue; }
    if (seats.length) {
      const g = await D.mcp(pk, "read", { project: desk, kind: "goal" }); out.calls++;
      if (!String(g.text).includes(`pd-${tag}-root`)) { fail(`its Partner ${label} does not read its own project's goal`, g); continue; }
    }
    const r = await walk(target, { label: `${who.label} · its PARTNER ${label}`, key: pk, project: seats[0] || null, slug: who.slug }, V,
      { planted: new Set([desk]), failFast, routes, also: [V2], getSlice: 2, sections: { posts: false, address: false } });
    out.calls += r.calls; out.answered += r.answered; out.findings.push(...r.findings); out.fivexx.push(...r.fivexx); out.fivexxAnswers.push(...r.fivexxAnswers); out.notes.push(...r.notes);
  }
  if ((await vaultRows()) !== v0) out.findings.push(`${who.label}: its own org's vault changed under its Partners' walks (${v0} → ${await vaultRows()})`);
  out.line = `${who.label} against org ${vic.org} and its own vault: ${out.calls} calls — a Partner seated nowhere and one seated on one project, every tool, resource and GET route with both's ids: nothing of the other org, nothing of the project it holds no seat on, the vault unchanged`;
  return out;
}

// ---- the org-creation moves (sprint 7, 7.3): creating an org reaches no other org ----
// orgMoves(target, attacker { label, key }, victim { org, owner, member }, V) -> { calls, findings, line }
//   (1) the attacker seats the victim OWNER's email in its own org (Control's add-person: a seat secret of the victim owner's
//       account, which the attacker holds) and tries to create an org AS that account with it, and with its own key: refused
//       (invalid_account), and the victim's account founded nothing — else the attacker would hold the key of an owner seat on the
//       victim's account (and spend its one org); (2) the operator allows a fresh email of the attacker's (as tools/operator.mjs
//       writes) and it signs up: the victim org's address is refused (org_name_taken) and the victim's org row unchanged; the
//       platform's names refused (org_name_reserved); (3) it creates its OWN org: its new owner key reads its org alone (whoami,
//       Control's people, the victim's project, contribution and goal: nothing of the victim) and the victim's rows are unchanged
//       table by table; (4) no org of the database holds a reserved name.
async function orgMoves(target, who, vic, V) {
  const D = door(target), out = { calls: 0, findings: [] }, planted = new Set();
  const tag = randomBytes(3).toString("hex");
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  const look = (what, text, sent, status) => {
    out.calls++;
    for (const x of sent) planted.add(x);
    if (status >= 500) out.findings.push(`${who.label} · ${what} -> ${status}`);
    const l = leaksOf(text, V, planted);
    if (l.length) out.findings.push(`${who.label} · ${what}: ${l.join(", ")}`);
  };
  // a sign-in-budget call, sent again ONCE after the address's window when the flood filter answered (as the sign-up moves)
  const paced = async (method, path, o) => {
    let r = await D.http(method, path, o);
    if (r.status === 429 && /too_many_attempts_ip/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await D.http(method, path, o); }
    return r;
  };
  const post = async (path, body) => { const r = await paced("POST", path, { body }); look(`POST ${path} ${JSON.stringify({ ...body, password: body.password ? "<held>" : undefined }).slice(0, 110)}`, r.text, sentOf(body), r.status); return r; };
  const vo = (await D.mcp(vic.owner, "whoami")).out || {};
  if (!vo.email) { out.findings.push(`${who.label}: instrument — the victim's owner has no email (${brief(vo)}): the org moves prove nothing`); return out; }
  planted.add(vo.email);
  // the victim's member's email is the attacker's own typing already (the account moves seated it in the attacker's org, so its
  // Control page lists it): planted, as the sign-up moves hold it
  const vm = (await D.mcp(vic.member, "whoami")).out || {};
  if (vm.email) planted.add(vm.email);
  const vAcc = ((await target.query(`SELECT id FROM accounts WHERE email = ${q(String(vo.email).toLowerCase())}`))[0] || {}).id;
  const founded = async () => (await target.query(`SELECT COUNT(*) AS n FROM org WHERE created_by_account = ${q(vAcc || "")}`))[0].n;
  const orgCount = async () => (await target.query("SELECT COUNT(*) AS n FROM org"))[0].n;
  const victimRow = async () => JSON.stringify(await target.query(`SELECT * FROM org WHERE id = ${Number(vic.org)}`));
  const before = await snapshot(target, vic.org), row0 = await victimRow(), n0 = await orgCount(), f0 = await founded();
  // 1 · a seat secret of the victim owner's account (minted by the attacker's own Control) creates nothing
  const add = await D.http("POST", "/control", { key: who.key, form: { action: "add-person", name: `Aaa Xorg Founder ${tag}`, email: vo.email } });
  look("POST /control add-person (the victim owner's email)", add.text, sentOf({ email: vo.email }), add.status);
  let held = (String(add.text).match(/API key\): ([0-9a-f]{40})\b/) || [])[1];
  if (!held) {
    // that email is already seated in the attacker's org (an earlier act): its Control reissues that seat's secret instead
    const ppl = await D.http("GET", "/control/people", { key: who.key });
    let pid = null; try { pid = ((JSON.parse(ppl.text).people || []).find((x) => String(x.email || "").toLowerCase() === String(vo.email).toLowerCase()) || {}).id || null; } catch { pid = null; }
    look("GET /control/people (its own org)", ppl.text, new Set(), ppl.status);
    // or a seat of it there WAITS for its holder's yes (the review's A1: the account stands in the victim's org; Control's list
    // leaves a pending seat out): found on the database, Reissued all the same (its key still opens nothing — and must prove nothing)
    if (!pid) {
      const meId = ((await D.mcp(who.key, "whoami")).out || {}).id;
      const aOrg = await orgOfPerson(target, meId);
      if (aOrg) pid = ((await target.query(`SELECT id FROM people WHERE org = ${Number(aOrg)} AND lower(email) = ${q(String(vo.email).toLowerCase())} AND (active = 1 OR pending = 1)`))[0] || {}).id || null;
    }
    if (pid) {
      const rk = await D.http("POST", "/control", { key: who.key, form: { action: "rotate-key", personId: pid } });
      look("POST /control rotate-key (its seat of the victim owner's email)", rk.text, sentOf({ personId: pid }), rk.status);
      held = (String(rk.text).match(/shown again: ([0-9a-f]{40})\b/) || [])[1];
    }
  }
  if (!held) out.findings.push(`${who.label}: instrument — add-person of the victim owner's email minted no seat secret (${add.status}): the org moves prove less`);
  for (const pw of [held, who.key].filter(Boolean)) {
    const r = await post("/orgs", { email: vo.email, password: pw, name: `Xorg Shadow ${tag}`, slug: `xorg-shadow-${tag}` });
    if (r.status === 200) out.findings.push(`${who.label}: created an org AS the victim owner's account (${vo.email}) with a value it holds (${r.status}): an owner seat on the victim's account, its key the attacker's`);
  }
  if ((await founded()) !== f0) out.findings.push(`${who.label}: the victim owner's account founded an org under the attacker's moves`);
  // 2 · its own account (the operator's code for a fresh email), then the victim's address and the platform's names
  const { signupCodeHash } = await import("../src/accounts.js");
  const { newCode } = await import("./operator.mjs");
  const fresh = `xorg-org-${tag}@xorg.invalid`, code = newCode(), pass = `attacker-${tag}-account-pass`;
  const at = new Date().toISOString(), until = new Date(Date.now() + 86400000).toISOString();
  await target.query(`INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES (${q(`xorg-org-${tag}`)}, ${q(fresh)}, ${q(await signupCodeHash(code))}, ${q(at)}, ${q(until)})`);
  const su = await post("/signup", { email: fresh, code, password: pass, device: "attack-xorg" });
  if (su.status !== 200) { out.findings.push(`${who.label}: instrument — its own allowed email did not sign up (${su.status}): the org moves prove nothing`); return out; }
  const vSlug = ((await target.query(`SELECT slug FROM org WHERE id = ${Number(vic.org)}`))[0] || {}).slug;
  if (vSlug) {
    const r = await post("/orgs", { email: fresh, password: pass, name: `Xorg Twin ${tag}`, slug: vSlug });
    if (r.status !== 409 || !/org_name_taken/.test(r.text)) out.findings.push(`${who.label}: the victim org's address (${vSlug}) was not refused as taken (${r.status})`);
  } else out.findings.push(`${who.label}: instrument — the victim's org holds no path name (migrate-072)`);
  const { reservedNames, orgSlugProblem } = await import("../src/orgnames.js");
  const { capabilitiesOf } = await import("./check-org-names.mjs");
  const RES = reservedNames(capabilitiesOf(join(ENGINE, "src")));
  for (const slug of ["login", "mcp", "docs", "orgs", "oauth", "control", "goals", "signup", "contribution"]) {
    const r = await post("/orgs", { email: fresh, password: pass, name: `Xorg Reserved ${tag}`, slug });
    if (r.status === 200) out.findings.push(`${who.label}: an org took the platform's name "${slug}"`);
  }
  // 3 · its own org: the new owner key reads its org alone
  const mine = await post("/orgs", { email: fresh, password: pass, name: `Xorg Own ${tag}`, slug: `xorg-own-${tag}`, project: "xown" });
  let mineKey = null; try { mineKey = JSON.parse(mine.text).key || null; } catch { mineKey = null; }
  if (mine.status !== 200 || !mineKey) out.findings.push(`${who.label}: instrument — its own account did not create its own org (${mine.status}): the door is shut, the refusals prove nothing`);
  else {
    planted.add(mineKey);
    const me = await D.mcp(mineKey, "whoami");
    const meOrg = me.out && me.out.id ? Number(((await target.query(`SELECT org FROM people WHERE id = ${q(me.out.id)}`))[0] || {}).org) : null;
    look("whoami (the new org's owner)", me.text, new Set(), me.status);
    if (meOrg === vic.org || meOrg == null) out.findings.push(`${who.label}: the new org's owner key signs in to org ${meOrg} (the victim's is ${vic.org})`);
    for (const [tool, args] of [["read", { project: [...V.keys][0], kind: "goal" }], ["read", { ref: V.tx[0] }], ["read", { ref: `goal/${V.goal}` }], ["home", {}], ["updates", {}], ["build", { project: [...V.keys][0] }]]) {
      const r = await D.mcp(mineKey, tool, args);
      look(`${tool} ${JSON.stringify(args)} (the new org's owner)`, r.text, sentOf(args), r.status);
    }
    for (const path of ["/control/people", "/home/summary", `/build?project=${encodeURIComponent([...V.keys][0])}`, `/contribution/${encodeURIComponent(V.tx[0])}`]) {
      const r = await D.http("GET", path, { key: mineKey });
      look(`GET ${path} (the new org's owner)`, r.text, sentOf(path), r.status);
    }
  }
  if ((await victimRow()) !== row0) out.findings.push(`${who.label}: the victim's org row changed under the org moves`);
  const after = await snapshot(target, vic.org);
  const moved = Object.keys({ ...before, ...after }).filter((t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]));
  if (moved.length) out.findings.push(`${who.label}: the victim's rows changed under the org moves: ${moved.join(", ")}`);
  // 4 · no org of the database holds a name the platform uses
  for (const r of await target.query("SELECT id, slug FROM org")) if (r.slug && orgSlugProblem(r.slug, RES) === "reserved") out.findings.push(`org ${r.id} holds the platform's name "${r.slug}"`);
  out.line = `${who.label} against org ${vic.org}: ${out.calls} calls — a seat secret of the victim owner's account (and its own key) refused as an account proof, the victim's address refused, 9 platform names refused, its own org made (${(await orgCount()) - n0} new) and walked as its new owner: nothing of org ${vic.org}`;
  return out;
}

// attack(target, { a, b }) -> the report. target = { call(method, path, { headers, body }) -> { status, text }, query(sql) -> rows,
// facts(org) -> { tx, files, hashes, previews, people, keys } }; a/b = { org, word, owner, member, project } (b's org ≠ 1)
// orgs: false leaves the org-creation moves out (they leave new orgs and seats behind: the smoke's s36b runs before cases that
// count orgs by id, so the smoke runs them in s40-neworg, its last case)
// surfaces: false leaves the sign-in surfaces' moves out (7.5b: the OAuth form, the grant's reach, the cookie walks, the Partners;
// the read-only walk writes nothing and runs wherever the walks run): the smoke's s40-neworg leaves them to s36b-xorg
// only (the --prove of a 7.5b walk, and sprint 12's invite moves and activity walk): "signin" · "reach" · "readonly" · "partner" · "invite" · "activity" runs the seed and that walk alone (with what it
// needs first: the account moves for "signin", the grant moves for "reach"), so its mutation is shown red by THAT walk
export async function attack(target, { a, b, failFast = false, log = () => {}, accounts = true, orgs = true, surfaces = true, only = null, requireSession = false } = {}) {
  const t0 = Date.now();
  // 10.5: the redaction a kept 5xx answer goes through (tools/live-walk.mjs's, the walk transcript's; imported here, never at the
  // module's top: live-walk.mjs holds a top-level await, which would make every importer — the smoke — an async module)
  if (!redactOf) redactOf = (await import("./live-walk.mjs")).redact;
  HELD.clear(); hold(a.owner, a.member, b.owner, b.member, TRIED_PASSPHRASE);
  const seedA = await seedOrg(target, { word: a.word, owner: a.owner, member: a.member, project: a.project, eval: !!a.eval });
  const seedB = await seedOrg(target, { word: b.word, owner: b.owner, member: b.member, project: b.project, eval: !!b.eval });
  log(`· seeded org ${a.org} (${a.word}) and org ${b.org} (${b.word}) through the door: ${seedA.tx.length + seedB.tx.length} contributions, a public and a private file each`);
  const D = door(target);
  // the instruments: each victim's owner reads its own canary through the same door
  for (const [s, k] of [[seedA, a.owner], [seedB, b.owner]]) {
    const r = await D.mcp(k, "read", { project: s.project, kind: "goal" });
    if (!r.text.toLowerCase().includes(s.word)) throw new Error(`instrument: the owner of ${s.word} does not read its own canary (${brief(r.out)})`);
    // the preview's eval-marked seed: its owner (an eval seat) reads its own eval-marked contributions through the door, so a walk
    // whose reads answered no eval row could not pass for "nothing leaked"
    if (s.eval) {
      const c = await D.mcp(k, "read", { project: s.project, kind: "contribution", eval: true });
      if (!s.tx.every((id) => c.text.includes(id))) throw new Error(`instrument: the owner of ${s.word} does not read its own eval-marked contributions (${brief(c.out)})`);
    }
  }
  const report = { directions: [], findings: [], fivexx: [], fivexxAnswers: [], exceptions: [], notes: [], calls: 0, answered: 0, cover: null, addressBy: { bearer: 0, session: 0 }, skipped: Object.fromEntries(SKIP), surfaces: [] };
  const codes0 = accounts ? await codesOf(target) : null;   // sprint 7, 7.2: no walk may mint a sign-up code
  // the routes (GET /capabilities as org A's owner reads them): the walks whose credential cannot read them itself take this list
  let routes = []; try { routes = JSON.parse((await D.http("GET", "/capabilities", { key: a.owner })).text).routes || []; } catch { routes = []; }
  const red = () => failFast && (report.findings.length || report.fivexx.length);
  const fold = (r) => { report.calls += r.calls; report.answered += r.answered || 0; report.findings.push(...r.findings); report.fivexx.push(...(r.fivexx || [])); report.fivexxAnswers.push(...(r.fivexxAnswers || [])); report.notes.push(...(r.notes || [])); if (r.line) { report.surfaces.push(r.line); log(`· ${r.line}`); } };
  const pairs = [[a, b], [b, a]];   // [victim side, attacker side]
  const attackerOf = async (side) => ({ label: `org ${side.org}'s owner`, key: side.owner, org: side.org, slug: await slugOf(target, side.org) });
  const seedOf = (side) => (side.org === a.org ? seedA : seedB);
  if (only) {
    // one 7.5b walk alone (its --prove): the moves it needs, then it, both directions
    for (const [vside, aside] of pairs) {
      const V = await victimOf(target, vside.org, seedOf(vside)), who = await attackerOf(aside);
      if (only === "readonly") fold(await readOnlyMoves(target, { ...who, label: `${who.label} (the read-only walk)` }, { org: vside.org }, V, routes, failFast));
      else if (only === "partner") fold(await partnerMoves(target, { ...who, label: `${who.label} (the Partner moves)` }, { org: vside.org }, V, routes, failFast));
      else if (only === "signin") {
        const am = await accountMoves(target, { label: `org ${aside.org}'s owner (the account moves)`, key: aside.owner, org: aside.org }, { org: vside.org, owner: vside.owner, member: vside.member, home: true }, V);
        // the account moves are this walk's set-up here: what they find is said, the walk's own finding decides
        report.calls += am.calls; report.notes.push(...am.findings.map((f) => `(the set-up) ${f}`));
        if (am.held) fold(await signinMoves(target, { ...who, label: `${who.label} (the sign-in moves)` }, { org: vside.org }, V, am.held));
        else report.findings.push(`${who.label}: instrument — the account moves left no held seat (the squat's yes not given): the sign-in moves cannot run`);
      } else if (only === "reach") {
        const gm = await grantMoves(target, { ...who, label: `org ${aside.org}'s owner (the grant moves)` }, { org: vside.org, member: vside.member, owner: vside.owner }, V);
        report.calls += gm.calls; report.notes.push(...gm.findings.map((f) => `(the set-up) ${f}`));
        if (gm.held) fold(await reachMoves(target, { ...who, label: `${who.label} (the reach and cookie walks)` }, { org: vside.org }, V, gm.held, routes, failFast));
      } else if (only === "activity") {
        for (const [role, key] of [["owner", aside.owner], ["member", aside.member]])
          fold(await activityMoves(target, { label: `org ${aside.org}'s ${role} (the activity walk)`, key, org: aside.org, slug: await slugOf(target, aside.org) }, { org: vside.org }, V, failFast));
      } else if (only === "invite") {
        const r = await inviteMoves(target, { label: `org ${aside.org}'s owner (the invite moves)`, key: aside.owner, org: aside.org }, { org: vside.org, owner: vside.owner, member: vside.member }, V);
        report.calls += r.calls; report.findings.push(...r.findings); if (r.line) log(`· ${r.line}`);
      } else throw new Error(`attack: no walk named ${only}`);
      if (red()) break;
    }
    return { ...report, ms: Date.now() - t0 };
  }
  for (const [victimOrg, seed, attackerOrg, side, attackers] of [[a.org, seedA, b.org, b, [["owner", b.owner], ["member", b.member]]], [b.org, seedB, a.org, a, [["owner", a.owner], ["member", a.member]]]]) {
    const V = await victimOf(target, victimOrg, seed);
    const before = await snapshot(target, victimOrg);
    // the slug both orgs hold ("shop") is the attacker's own value too: org 1's bare key, and the slug in the attacker's own links
    // (12.5's Activity links every row ?project=<slug>)
    const planted = new Set([String(side.project).replace(/^o\d+--/, "")]);
    const dir = { attacker: attackerOrg, victim: victimOrg, calls: 0, answered: 0 };
    const aslug = await slugOf(target, attackerOrg);
    for (const [role, key] of attackers) {
      const r = await walk(target, { label: `org ${attackerOrg}'s ${role}`, key, project: side.project, owner: role === "owner", eval: !!side.eval, slug: aslug }, V, { failFast, planted, requireSession });
      report.notes.push(...r.notes);
      for (const k of Object.keys(report.addressBy)) report.addressBy[k] += (r.addressBy && r.addressBy[k]) || 0;
      dir.calls += r.calls; dir.answered += r.answered;
      report.cover = Object.fromEntries(Object.entries(r.cover).map(([k, n]) => [k, Math.max(n, (report.cover || {})[k] || 0)]));   // the owner's walk is the widest
      report.findings.push(...r.findings); report.fivexx.push(...r.fivexx); report.fivexxAnswers.push(...r.fivexxAnswers); report.exceptions.push(...r.exceptions.map((x) => `org ${attackerOrg}'s ${role}: ${x}`));
      if (failFast && (report.findings.length || report.fivexx.length)) { report.directions.push(dir); return { ...report, calls: report.calls + dir.calls, answered: report.answered + dir.answered, ms: Date.now() - t0 }; }
    }
    // 7.5b: THE READ-ONLY CREDENTIAL of the attacker's owner, inside the direction (the victim's snapshot below holds it too)
    {
      const ro = await readOnlyMoves(target, { label: `org ${attackerOrg}'s owner`, key: side.owner, org: attackerOrg, slug: aslug }, { org: victimOrg }, V, routes, failFast, planted);
      dir.calls += ro.calls; dir.answered += ro.answered;
      report.findings.push(...ro.findings); report.fivexx.push(...ro.fivexx); report.fivexxAnswers.push(...ro.fivexxAnswers); report.notes.push(...ro.notes); report.surfaces.push(ro.line);
      if (failFast && (report.findings.length || report.fivexx.length)) { report.directions.push(dir); return { ...report, calls: report.calls + dir.calls, answered: report.answered + dir.answered, ms: Date.now() - t0 }; }
    }
    const after = await snapshot(target, victimOrg);
    const moved = Object.keys({ ...before, ...after }).filter((t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]));
    if (moved.length) report.findings.push(`org ${victimOrg}'s rows changed under org ${attackerOrg}'s walk: ${moved.map((t) => `${t} ${before[t] && before[t].n}→${after[t] && after[t].n}`).join(", ")}`);
    dir.tables = Object.keys(before).length; dir.rows = Object.values(before).reduce((n, x) => n + x.n, 0);
    report.calls += dir.calls; report.answered += dir.answered;
    report.directions.push(dir);
    log(`· org ${attackerOrg} against org ${victimOrg}: ${dir.calls} calls (${dir.answered} answered 2xx), the victim's ${dir.rows} rows in ${dir.tables} tables ${moved.length ? "CHANGED" : "unchanged"}`);
  }
  // THE ACTIVITY WALK (sprint 12, 12.5), each org's owner and member against the other (reads only; in-process, a planted key
  // collision, removed right after)
  for (const [vside, aside] of pairs) {
    const V = await victimOf(target, vside.org, seedOf(vside));
    for (const [role, key] of [["owner", aside.owner], ["member", aside.member]]) {
      const r = await activityMoves(target, { label: `org ${aside.org}'s ${role} (the activity walk)`, key, org: aside.org, slug: await slugOf(target, aside.org) }, { org: vside.org }, V, failFast);
      report.calls += r.calls; report.answered += r.answered; report.findings.push(...r.findings); report.fivexx.push(...r.fivexx);
      log(`· ${r.line}`);
      if (red()) return { ...report, ms: Date.now() - t0 };
    }
  }
  // THE ACCOUNT MOVES (sprint 7, 7.1), each org's owner against the other, after both walks (the victim's own acts in them —
  // its member's passphrase, its owner seating the squatted email — would read as changes inside a walk's snapshot)
  if (accounts) {
    const operatorCodes = [];   // the codes the account moves wrote as the operator (the squat's holder signs up): never a door's
    for (const [vside, aside] of [[a, b], [b, a]]) {
      const V = await victimOf(target, vside.org, vside.org === a.org ? seedA : seedB);
      // sprint 7, 7.4: the sign-in lives at the root and chooses the account's seat, so the victim's own sign-ins are checked in
      // both directions (7.1 checked them only where the address served the victim's org, HOME_ORG)
      const r = await accountMoves(target, { label: `org ${aside.org}'s owner (the account moves)`, key: aside.owner, org: aside.org }, { org: vside.org, owner: vside.owner, member: vside.member, home: true }, V);
      report.calls += r.calls; report.findings.push(...r.findings); operatorCodes.push(...(r.codes || []));
      if (r.line) log(`· ${r.line}`);
      if (failFast && report.findings.length) return { ...report, ms: Date.now() - t0 };
      // 7.5b: THE AUTHORIZE FORM AND THE COOKIE with the squatted email (an account seated in both orgs) and the seat secret the account moves left it
      if (surfaces && r.held) { const who = await attackerOf(aside); fold(await signinMoves(target, { ...who, label: `${who.label} (the sign-in moves)` }, { org: vside.org }, V, r.held)); }
      if (red()) return { ...report, ms: Date.now() - t0 };
    }
    // THE SIGN-UP MOVES (sprint 7, 7.2): first, both walks minted no code; then each org's owner against the other
    if ((await codesOf(target, operatorCodes)) !== codes0) report.findings.push("a sign-up code was minted or changed during the walks (only the operator mints one)");
    for (const [vside, aside] of [[a, b], [b, a]]) {
      const V = await victimOf(target, vside.org, vside.org === a.org ? seedA : seedB);
      const r = await signupMoves(target, { label: `org ${aside.org}'s owner (the sign-up moves)`, key: aside.owner }, { org: vside.org, owner: vside.owner, member: vside.member, home: true }, V);
      report.calls += r.calls; report.findings.push(...r.findings);
      if (r.line) log(`· ${r.line}`);
      if (failFast && report.findings.length) return { ...report, ms: Date.now() - t0 };
    }
    // THE INVITE MOVES (sprint 12, 12.3): each org's owner's invite links against the other
    for (const [vside, aside] of [[a, b], [b, a]]) {
      const V = await victimOf(target, vside.org, vside.org === a.org ? seedA : seedB);
      const r = await inviteMoves(target, { label: `org ${aside.org}'s owner (the invite moves)`, key: aside.owner, org: aside.org }, { org: vside.org, owner: vside.owner, member: vside.member }, V);
      report.calls += r.calls; report.findings.push(...r.findings);
      if (r.line) log(`· ${r.line}`);
      if (failFast && report.findings.length) return { ...report, ms: Date.now() - t0 };
    }
    // THE GRANT MOVES (sprint 7, 7.5a): each org's owner's fresh seat and account, connected through OAuth, against the other
    for (const [vside, aside] of [[a, b], [b, a]]) {
      const V = await victimOf(target, vside.org, vside.org === a.org ? seedA : seedB);
      const r = await grantMoves(target, { label: `org ${aside.org}'s owner (the grant moves)`, key: aside.owner, org: aside.org, slug: await slugOf(target, aside.org) }, { org: vside.org, member: vside.member, owner: vside.owner }, V);
      report.calls += r.calls; report.findings.push(...r.findings);
      if (r.line) log(`· ${r.line}`);
      if (failFast && report.findings.length) return { ...report, ms: Date.now() - t0 };
      // 7.5b: THE GRANT'S REACH AND THE COOKIE WALKS with that fresh seat and account; then THE PARTNERS
      if (surfaces && r.held) {
        const who = await attackerOf(aside);
        fold(await reachMoves(target, { ...who, label: `${who.label} (the reach and cookie walks)` }, { org: vside.org }, V, r.held, routes, failFast));
        if (red()) return { ...report, ms: Date.now() - t0 };
        fold(await partnerMoves(target, { ...who, label: `${who.label} (the Partner moves)` }, { org: vside.org }, V, routes, failFast));
        if (red()) return { ...report, ms: Date.now() - t0 };
      }
    }
    if (!surfaces) report.skipped["the sign-in surfaces' moves"] = "left out of this run (surfaces: false): the OAuth form, the grant's reach, the cookie walks and the Partners run in the smoke's s36b-xorg";
    // THE ORG-CREATION MOVES (sprint 7, 7.3): each org's owner against the other
    if (!orgs) report.skipped["the org-creation moves"] = "left out of this run (orgs: false): they run in the smoke's s40-neworg";
    else for (const [vside, aside] of [[a, b], [b, a]]) {
      const V = await victimOf(target, vside.org, vside.org === a.org ? seedA : seedB);
      const r = await orgMoves(target, { label: `org ${aside.org}'s owner (the org moves)`, key: aside.owner }, { org: vside.org, owner: vside.owner, member: vside.member }, V);
      report.calls += r.calls; report.findings.push(...r.findings);
      if (r.line) log(`· ${r.line}`);
      if (failFast && report.findings.length) return { ...report, ms: Date.now() - t0 };
    }
  } else {
    report.skipped["the account moves"] = "left out here (they leave platform account rows): in-process, the smoke and tools/accounts-selftest.mjs";
    report.skipped["the sign-up moves"] = "left out here (they leave platform code and account rows): in-process, the smoke and tools/signup-selftest.mjs";
    report.skipped["the org-creation moves"] = "left out here (they leave an org, an account and its code on the live database): in-process, the smoke and tools/orgs-selftest.mjs";
    report.skipped["the invite moves"] = "left out here (they leave seats, accounts holding passphrases and links on the live database): in-process, the smoke and tools/invite-selftest.mjs";
    report.skipped["the grant moves"] = "left out here (they leave a seat, an account passphrase and OAuth grants on the live deployment): in-process, the smoke and tools/mcp-orgs-selftest.mjs";
    report.skipped["the sign-in surfaces' moves"] = "left out here (they leave seats, Partners, projects, sessions and OAuth grants on the live deployment): in-process and the smoke; the read-only walk runs here (it writes nothing)";
  }
  // THE RULED EXCEPTION, asserted: the public file by its exact id is served to the other org (its body), as ADR-055 holds
  const served = report.exceptions.filter((x) => /GET \/artifact\/<the public file> -> 200 \(its body\)/.test(x)).length;
  if (served !== 4) report.findings.push(`the ruled exception: a public file by its exact id must be served across the wall (ADR-055, PLATFORM §2.7) to each attacker (4), served ${served}`);
  return { ...report, ms: Date.now() - t0 };
}

// ---- the in-process world: the REAL worker over node:sqlite, two orgs ----
export async function inProcess(src) {
  const { orgDef, twoOrgWorker } = await import("./fixtures/two-orgs.mjs");
  const wa = canary("orga"), wb = canary("orgb");
  const A = orgDef(1, wa, { name: `Org ${wa}`, projects: ["shop", `${wa}-desk`] }), B = orgDef(2, wb, { name: `Org ${wb}`, projects: ["shop", `${wb}-desk`] });
  const w = await twoOrgWorker({ a: A, b: B, src });
  // each person's seat secret is their key, as add-person's S-019 secret is (and live's seeds): the walk signs each attacker in
  // with it at the root for a browser session (sprint 7, 7.4: the session walked under the victim's address)
  const { pbkdf2 } = await import("../src/util.js");
  for (const p of [A.owner, A.member, B.owner, B.member]) { const salt = randomBytes(16).toString("hex"); w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = ?").run(await pbkdf2(p.key, salt), salt, p.id); }
  const target = {
    call: async (method, path, { headers = {}, body } = {}) => { const r = await w.fetch(new Request(w.origin + path, { method, headers, body, redirect: "manual" })); return { status: r.status, text: method === "HEAD" ? "" : await r.text(), location: r.headers.get("location") || "" }; },
    query: async (sql) => w.db.prepare(sql).all(),
    // in-process only (the activity walk's planted key collision): one write on the database, its values bound
    write: async (sql, ...args) => w.db.prepare(sql).run(...args),
    facts: async (org) => {
      const one = (sql) => w.db.prepare(sql).all(org).map((r) => Object.values(r)[0]);
      return { tx: one("SELECT id FROM transmission WHERE org = ?"), files: one("SELECT id FROM artifacts WHERE org = ?"), people: one("SELECT id FROM people WHERE org = ?"),
        keys: one("SELECT key FROM projects WHERE org = ?"), hashes: one("SELECT hash FROM k_renders WHERE project IN (SELECT key FROM projects WHERE org = ?)"),
        previews: one("SELECT id FROM previews WHERE project IN (SELECT key FROM projects WHERE org = ?)") };
    },
  };
  return { target, a: { org: 1, word: A.word, owner: A.owner.key, member: A.member.key, project: "shop" }, b: { org: 2, word: B.word, owner: B.owner.key, member: B.member.key, project: "o2--shop" } };
}

// ---- the deployed worker (the ship's preview): two THROWAWAY orgs, restored, walked, deleted ----
export const PREVIEW_SLUGS = ["shop", "desk"];
const FIXTURE_ORG = 2;   // the fixture's own id: the restore rewrites it to the new org's (never kept)
export const throwawayName = (word) => `xorg-preview ${String(word).toLowerCase()}`;
// fixtureExport(word, at) -> a tiny export in tools/org-undo.mjs's format: the org row, its owner and its member (no credential:
// the restore gives the owner the fresh key — and its seat secret, the key's pbkdf2 — the owner rotates the member's through the
// door, which sets the member's seat secret to its new key), two projects, the member's seat; no object, no knowledge (the attack's
// seed files those through the door). BOTH carry an email (fixtureEmails: @example.com, a fixture's), so each signs in at the root
// by its email and seat secret for the browser session the walk takes under the victim's address (the sprint-7 review, D1); each
// email makes a platform account (migrate-070), which the cleanup removes once the org is gone (tools/operator.mjs removeAccount).
// EVAL-MARKED (the sprint-6 review, finding 14): the preview's walk writes into the LIVE database while the OLD code still serves
// every request, and the old code is org-blind. So the throwaway orgs look to it like a suite's own rows: both projects are eval
// projects (projects.eval = 1: Control lists them only on ?eval=1), the member is one of the suites' fixed seats (an id under
// EVAL_SEAT_PREFIX: Control's people and devices leave it out), the owner's email is a fixture's (@example.com: the old Home's
// who-is-here leaves it out), and the seed marks every write that takes a mark (seedOrg's eval). What the old code still shows of them is said in the PREVIEW header above.
// fixtureEmails(word) -> the throwaway org's two emails, owner's then member's (the run's record keeps them for the cleanup)
export async function fixtureEmails(word) {
  const { EVAL_SEAT_PREFIX } = await import("../src/util.js");
  const w = String(word).toLowerCase();
  return [`xorgp-${w}-owner@example.com`, `${EVAL_SEAT_PREFIX}xorgp-${w}-member@example.com`];
}
export async function fixtureExport(word, at = new Date().toISOString()) {
  const { EXPORT_FORMAT, listingOf } = await import("./org-undo.mjs");
  const { BACKUP_DUMPED, BACKUP_FORMAT } = await import("../src/backup.js");
  const { EVAL_SEAT_PREFIX } = await import("../src/util.js");
  // the owner keeps a plain id: a restore takes the org's first REAL owner (tools/restore-local.mjs ownerOf leaves the suites' fixed
  // seats out), so an eval-seat owner would be refused; the member is a fixed seat
  const w = String(word).toLowerCase(), owner = `xorgp-${w}-owner`, member = `${EVAL_SEAT_PREFIX}xorgp-${w}-member`, name = throwawayName(w);
  const keys = PREVIEW_SLUGS.map((s) => `o${FIXTURE_ORG}--${s}`);
  const [ownerEmail, memberEmail] = await fixtureEmails(word);
  const tables = {
    projects: keys.map((key, i) => ({ key, name: `${PREVIEW_SLUGS[i]} ${w}`, active: 1, created_at: at, eval: 1 })),
    people: [{ id: owner, name: `Owner ${w}`, email: ownerEmail, role: "owner", active: 1, created_at: at, capture_mode: "yield", org: FIXTURE_ORG },
      { id: member, name: `Member ${w}`, email: memberEmail, role: "member", active: 1, created_at: at, capture_mode: "yield", org: FIXTURE_ORG }],
    org: [{ id: FIXTURE_ORG, name, home: keys[0], created_by: owner, created_at: at, updated_by: owner, updated_at: at }],
    project_seats: [{ person_id: member, project_key: keys[0], role: "member", created_at: at }],
  };
  return { format: EXPORT_FORMAT, at, source: { database: "fixture:attack-xorg", org: FIXTURE_ORG, name },
    dump: { format: BACKUP_FORMAT, rule: null, tables, missing: [], pages: 0 },
    counts: Object.fromEntries(BACKUP_DUMPED.map((t) => [t.table, (tables[t.table] || []).length])), objects: [], listing: listingOf(new Map()), left: {}, leftWhy: {} };
}
// throwawayRefusal(id, others) -> why an org id may not be a throwaway (org 1, not a whole number, one of this run's already), or ""
export function throwawayRefusal(id, others = []) {
  if (!Number.isSafeInteger(id) || id < 1) return `not an org id: ${id}`;
  if (id === 1) return "org 1 (HOME_ORG) is never a party to the preview's walk";
  if (others.includes(id)) return `org ${id} is already this run's other throwaway`;
  return "";
}
// previewRefusal(o, cfg) -> why the preview mode may not run with these flags, or "" (checked before anything is read or written)
export function previewRefusal(o, cfg) {
  let u;
  try { u = new URL(o.url); } catch { return `--url is not a URL: ${o.url}`; }
  if (o.live) {
    if (!o.liveWriteOk) return "--live refused without --live-write-ok: the preview shares the LIVE database (two throwaway orgs are written into it and deleted)";
    const worker = String((cfg && cfg.name) || "");
    const re = new RegExp(`^[0-9a-f]{8}-${worker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[a-z0-9-]+\\.workers\\.dev$`);
    if (u.protocol !== "https:" || !worker || !re.test(u.hostname) || (u.pathname !== "/" && u.pathname !== "")) return `--live refused: --url must be ${worker || "the worker"}'s VERSION PREVIEW (https://<8 hex>-${worker}.<subdomain>.workers.dev): the production route answers every org with the old code`;
  } else if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return `--local refused: --url must be this machine (the worker over ${o.local}), not ${u.hostname}`;
  if (o.creds && !existsSync(o.creds)) return `--creds ${o.creds} does not exist`;
  return "";
}
// loadCreds(file) -> fills CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the deployment's credentials file (KEY=VALUE lines)
// when the environment lacks them; never prints a value
function loadCreds(file) {
  for (const l of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=(.*)$/.exec(l);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
// 10.5: a run with a run dir keeps each 5xx's answer there (keepFivexx); the red verdict line names the file
const FIVEXX_FILE = "fivexx.json";
// the run's record: every org it creates, BEFORE it is written (never a key)
const saveRec = (rec) => { mkdirSync(rec.dir, { recursive: true }); writeFileSync(join(rec.dir, "orgs.json"), JSON.stringify({ ...rec, dir: undefined }, null, 1)); };
// restoreThrowaway(be, word, rec) -> { org, name, owner (its key), ownerId }
async function restoreThrowaway(be, word, rec) {
  const { planRestore, loadRestore } = await import("./org-undo.mjs");
  const plan = await planRestore(be.DB, await fixtureExport(word), { name: throwawayName(word) });
  if (plan.refused) throw new Error(`the restore of a throwaway org refused: ${plan.refused}`);
  const why = throwawayRefusal(plan.to, rec.orgs.map((x) => x.org));
  if (why) throw new Error(`refused: the restore would land in ${why}`);
  const key = randomBytes(20).toString("hex");
  // the record names the two emails BEFORE the restore writes their accounts (a killed run's --cleanup removes them too)
  const entry = { org: plan.to, name: plan.name, state: "restoring", emails: await fixtureEmails(word), accounts: "pending" };
  rec.orgs.push(entry); saveRec(rec);
  // the owner's seat secret is its fresh key (add-person's S-019 rule): it signs in at the root for a browser session (D1)
  const { pbkdf2 } = await import("../src/util.js");
  const salt = randomBytes(16).toString("hex");
  const loaded = await loadRestore(be.DB, be.O, plan, async () => null, { ownerKeyHash: sha(key), ownerPass: { hash: await pbkdf2(key, salt), salt }, chunk: 100 });
  if (loaded.refused) { rec.orgs.pop(); saveRec(rec); throw new Error(`the restore of a throwaway org refused: ${loaded.refused}`); }   // not ours: never cleaned
  entry.state = "restored"; saveRec(rec);
  // sprint 8, 8.5 (the must-close: 8.2f's find): a throwaway org rides the SHIP'S OWN plan, `suite` (tools/operator.mjs SUITE_PLAN:
  // big honest numbers sized to the suites), written BEFORE the first restore (runPreview, recorded as rec.suitePlan) and removed
  // with the throwaways (cleanupAll) unless an org still rides it — on the preview and on --local alike, so the suite runs
  // unthrottled without touching free, team or any real org's plan. A refused move is a failure (the walk would be throttled).
  const moved = await be.DB.prepare("UPDATE org SET plan = 'suite' WHERE id = ?1 AND EXISTS (SELECT 1 FROM plan_limits WHERE plan = 'suite')").bind(plan.to).run();
  if (!Number((moved && moved.meta && moved.meta.changes) || 0)) throw new Error(`org ${plan.to} could not be put on the ship's plan "suite" (no such row?): the walk would ride its real plan's limits`);
  return { org: plan.to, name: plan.name, owner: key, ownerId: plan.owner };
}
// removeThrowaway(be, entry) -> { ok, why, deleted }: export, then delete naming the org by this run's name (a cron run that
// writes to it between the two makes the delete refuse "changed since the export": exported again, up to 3 times)
async function removeThrowaway(be, entry) {
  const { exportOrg, deleteOrg } = await import("./org-undo.mjs");
  const { orgPrefix } = await import("../src/storage.js");
  const id = entry.org;
  const no = throwawayRefusal(id);
  if (no) return { ok: false, why: `refused: ${no}` };
  for (let i = 0; i < 3; i++) {
    const row = await be.DB.prepare("SELECT name FROM org WHERE id = ?1").bind(id).first();
    if (row && row.name !== entry.name) return { ok: false, why: `refused: org ${id} is named "${row.name}", not this run's "${entry.name}" — not this run's, never deleted` };
    let exp = null;
    if (row) { const e = await exportOrg(be.DB, be.O, id, { database: be.database }); if (e.refused) return { ok: false, why: e.refused }; exp = e.exp; }
    // the other orgs by org-undo's rule for the backend: --local exactly as before; --live never fewer rows than before
    const r = await deleteOrg(be.DB, be.O, id, { confirm: row ? entry.name : String(id), exp, database: be.database, others: String(be.database).startsWith("local:") ? "exact" : "kept" });
    if (r.refused && /changed since the export/.test(r.refused) && i < 2) continue;
    if (r.refused) return { ok: false, why: r.refused, cross: r.cross };
    const gone = !(await be.DB.prepare("SELECT 1 AS x FROM org WHERE id = ?1").bind(id).first());
    const objects = (await be.O.list(orgPrefix(id))).length;
    const ok = r.ok && gone && !r.left.length && objects === 0;
    const lostOrMoved = [...(r.othersLost || []), ...(r.othersMoved || [])];
    return { ok, deleted: r.deleted, note: r.othersNote, why: ok ? "" : `after the delete: ${[...r.left.map((x) => `left ${x}`), ...(objects ? [`${objects} objects left`] : []), ...(gone ? [] : ["the org row left"]), ...lostOrMoved.map((x) => `another org ${x}`)].join(", ")}` };
  }
  return { ok: false, why: "changed since the export three times" };
}
// unmarked(DB, org) -> the throwaway org's rows that carry NO eval mark the old code reads (the sprint-6 review, finding 14): what
// the org-blind old code serving the live traffic during the walk could list of it on org 1's screens (each table by the filter
// the old code hides a suite's rows with: projects.eval, the fixed seats' id prefix, transmission.eval, an event's payload eval,
// a file's eval group or title). Said after the walk, before the delete; never a failure (the PREVIEW header names the rest)
async function unmarked(DB, org) {
  const n = Number(org);
  const r = await DB.prepare(`SELECT (SELECT COUNT(*) FROM projects WHERE org = ${n} AND eval = 0) AS projects, ` +
    `(SELECT COUNT(*) FROM people WHERE org = ${n} AND id NOT LIKE 'eval-fixed-%') AS "people (Control)", ` +
    `(SELECT COUNT(*) FROM people WHERE org = ${n} AND id NOT LIKE 'eval-fixed-%' AND COALESCE(email, '') NOT LIKE '%@example.com') AS "people (Home)", ` +
    `(SELECT COUNT(*) FROM transmission WHERE org = ${n} AND eval = 0) AS transmission, ` +
    `(SELECT COUNT(*) FROM events WHERE org = ${n} AND COALESCE(json_extract(payload_json, '$.eval'), 0) != 1) AS events, ` +
    `(SELECT COUNT(*) FROM artifacts WHERE org = ${n} AND NOT (group_tag = 'eval' OR title LIKE 'eval-%')) AS artifacts, ` +
    `(SELECT group_concat(k || ' ' || c, ', ') FROM (SELECT kind AS k, COUNT(*) AS c FROM events WHERE org = ${n} AND COALESCE(json_extract(payload_json, '$.eval'), 0) != 1 GROUP BY kind ORDER BY c DESC)) AS eventKinds`).first();
  return r || {};
}
// cleanupAll(be, rec, log) -> true when every org of the run is gone (two passes: a delete refused for a row crossing to the
// other throwaway may pass once that one is gone)
async function cleanupAll(be, rec, log) {
  for (let pass = 0; pass < 2; pass++) {
    for (const e of rec.orgs.filter((x) => x.state !== "deleted").reverse()) {
      let r;
      try { r = await removeThrowaway(be, e); } catch (x) { r = { ok: false, why: String((x && x.message) || x) }; }
      if (r.ok) { e.state = "deleted"; delete e.why; log(`  · throwaway org ${e.org} deleted: ${r.deleted.rows} rows, ${r.deleted.objects} objects, 0 left${r.note ? ` (${r.note})` : ""}`); }
      else e.why = r.why;
      saveRec(rec);
    }
  }
  // the platform accounts its two emails made (migrate-070), once its org is gone (no active seat left): removed (the sprint-7
  // review, D6), never left to pile up on the live database; a record from before names no emails (nothing to do)
  const { removeAccount } = await import("./operator.mjs");
  for (const e of rec.orgs.filter((x) => x.state === "deleted" && Array.isArray(x.emails) && x.accounts !== "removed")) {
    const why = [];
    for (const email of e.emails) {
      let r;
      try { r = await removeAccount(be.DB, email); } catch (x) { r = { refused: String((x && x.message) || x) }; }
      if (r.refused && !/has no account on the platform/.test(r.refused)) why.push(r.refused);
    }
    e.accounts = why.length ? "left" : "removed";
    if (why.length) e.why = `its accounts: ${why.join("; ")}`; else log(`  · throwaway org ${e.org}'s ${e.emails.length} accounts removed (tools/operator.mjs removeAccount)`);
    saveRec(rec);
  }
  // 8.5: the ship's own plan row, removed with its throwaways once no org rides it (the suites' org raised onto it by the operator
  // keeps it: said, never forced)
  if (rec.suitePlan === "writing" || rec.suitePlan === "written") {
    const { dropSuitePlan } = await import("./operator.mjs");
    let d;
    try { d = await dropSuitePlan(be.DB); } catch (x) { d = { error: String((x && x.message) || x) }; }
    if (d.removed) { rec.suitePlan = "removed"; log("  · the ship's plan row \"suite\" removed with the throwaways (no org rides it)"); }
    else if (d.kept != null) { rec.suitePlan = `kept: ${d.kept} org(s) ride it`; log(`  · the ship's plan row "suite" kept: ${d.kept} org(s) still ride it (the suites' org, raised by the operator)`); }
    else log(`  · the ship's plan row "suite" not removed: ${d.error}`);
    saveRec(rec);
  }
  const left = rec.orgs.filter((x) => x.state !== "deleted" || x.accounts === "left");
  for (const e of left) log(`  ✗ throwaway org ${e.org} ("${e.name}") NOT ${e.state !== "deleted" ? "deleted" : "cleaned (its accounts)"}: ${e.why} — by hand: node tools/attack-xorg.mjs --cleanup ${rec.dir} ${rec.flags}`);
  return !left.length;
}
// previewTarget(url, DB, stopped) -> the attack's target: the worker at url, and the database it serves (the operator's backend);
// once stopped() (a signal), every call throws, so the walk ends before the cleanup writes
// 8.5: every answer that names plan_limit (a 429 at the door, or a write's refusal in its body) is counted on the target
// (target.planLimits; an error field naming it, or a refusal's own words "plan's limit of N" — never the contract's vocabulary, which
// names the code too): the ship's suites must run unthrottled on the ship's own plan, so the preview fails on any
function previewTarget(url, DB, stopped = () => false) {
  const planLimits = { n: 0, first: "" };
  const call = async (method, path, { headers = {}, body } = {}) => {
    if (stopped()) throw new Error(`stopped by ${stopped()}: the walk ends, this run's throwaway orgs are removed`);
    const go = async () => { const r = await fetch(url + path, { method, headers, body, redirect: "manual" }); return { status: r.status, text: method === "HEAD" ? "" : await r.text(), location: r.headers.get("location") || "" }; };
    let a;
    try { a = await go(); } catch { await new Promise((r) => setTimeout(r, 200)); a = await go(); }   // a dropped socket, once
    if (a.status === 429 || /\\?"error\\?"\s*:\s*\\?"plan_limit\\?"|plan(?:'|&#39;|&#x27;)s limit of \d|Nothing done — plan_limit/.test(a.text)) { planLimits.n++; if (!planLimits.first) planLimits.first = `${method} ${path} ${a.status}`; }
    return a;
  };
  const query = async (sql) => (await DB.prepare(sql).all()).results || [];
  const facts = async (org) => {
    const n = Number(org);
    const r = (await query(`SELECT (SELECT json_group_array(id) FROM transmission WHERE org = ${n}) AS tx, (SELECT json_group_array(id) FROM artifacts WHERE org = ${n}) AS files, ` +
      `(SELECT json_group_array(id) FROM people WHERE org = ${n}) AS people, (SELECT json_group_array(key) FROM projects WHERE org = ${n}) AS keys, ` +
      `(SELECT json_group_array(hash) FROM k_renders WHERE project IN (SELECT key FROM projects WHERE org = ${n})) AS hashes, ` +
      `(SELECT json_group_array(id) FROM previews WHERE project IN (SELECT key FROM projects WHERE org = ${n})) AS previews`))[0] || {};
    const J = (x) => JSON.parse(x || "[]");
    return { tx: J(r.tx), files: J(r.files), people: J(r.people), keys: J(r.keys), hashes: J(r.hashes), previews: J(r.previews) };
  };
  return { call, query, facts, planLimits };
}
// runPreview(o) -> exit code. o = { url, live, local, config, liveWriteOk, creds, runDir, cleanup }
export async function runPreview(o) {
  const { readConfig, localBackends, liveBackends } = await import("./org-undo.mjs");
  const cfg = readConfig(o.config);
  if (!o.cleanup) { const why = previewRefusal(o, cfg); if (why) { console.log(`✗ attack-xorg (preview): ${why}`); return 1; } }
  else if (o.live && !o.liveWriteOk) { console.log("✗ attack-xorg (cleanup): --live refused without --live-write-ok"); return 1; }
  if (o.creds) { if (!existsSync(o.creds)) { console.log(`✗ attack-xorg: --creds ${o.creds} does not exist`); return 1; } loadCreds(o.creds); }
  const flags = o.live ? `--live --config ${o.config} --live-write-ok` : `--local ${o.local} --config ${o.config}`;
  if (o.cleanup) {
    const dir = resolve(o.cleanup), f = join(dir, "orgs.json");
    if (!existsSync(f)) { console.log(`✗ attack-xorg (cleanup): no record at ${f}`); return 1; }
    const be = o.live ? await liveBackends(cfg) : await localBackends(o.local, cfg);
    try {
      const rec = { ...JSON.parse(readFileSync(f, "utf8")), dir, flags };
      if (rec.database && rec.database !== be.database) { console.log(`✗ attack-xorg (cleanup): the record is of ${rec.database}, not ${be.database}`); return 1; }
      const ok = await cleanupAll(be, rec, say);
      console.log(ok ? `✓ attack-xorg (cleanup): every throwaway org of ${dir} is gone` : "✗ attack-xorg (cleanup): an org is left (the ✗ lines)");
      return ok ? 0 : 1;
    } finally { await be.close(); }
  }
  const url = String(o.url).replace(/\/+$/, "");
  const health = await fetch(url + "/health").then((r) => r.status, () => 0);
  if (health !== 200) { console.log(`✗ attack-xorg (preview): ${url}/health answered ${health || "nothing"} — refused, nothing written`); return 1; }
  const be = o.live ? await liveBackends(cfg) : await localBackends(o.local, cfg);
  const rec = { dir: resolve(o.runDir || join(ENGINE, ".runs", "attack-xorg-preview", new Date().toISOString().replace(/[:.]/g, "-"))), flags, url, database: be.database, at: new Date().toISOString(), orgs: [] };
  saveRec(rec);
  let cleaning = null;
  const cleanup = () => cleaning || (cleaning = cleanupAll(be, rec, say));
  // a signal removes this run's orgs FIRST: the local proxy (wrangler's getPlatformProxy) holds its own SIGINT/SIGTERM listeners
  // that exit at once, so they are set aside while the run holds the orgs and put back after (a terminal's Ctrl-C also stops the
  // local proxy's workerd, a child in the same group: on --local, `--cleanup <run dir>` then removes what is left)
  const prior = Object.fromEntries(["SIGINT", "SIGTERM"].map((s) => [s, process.listeners(s)]));
  for (const s of Object.keys(prior)) process.removeAllListeners(s);
  // the first signal stops the walk (every next call throws) and the run goes on to its cleanup; a second one exits at once
  let signalled = "";
  const onSignal = (sig) => {
    if (signalled) { console.log(`✗ attack-xorg (preview): a second ${sig} — exiting NOW; remove what is left: node tools/attack-xorg.mjs --cleanup ${rec.dir} ${flags}`); process.exit(130); }
    signalled = sig; console.log(`✗ attack-xorg (preview): ${sig} — the walk stops; removing this run's throwaway orgs first`);
  };
  process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal);
  const stopped = () => signalled;
  let r = null, failure = "";
  try {
    // 8.5: the ship's own plan row first (recorded before it is written: a killed run's --cleanup removes it too)
    const { ensureSuitePlan, SUITE_PLAN } = await import("./operator.mjs");
    rec.suitePlan = "writing"; saveRec(rec);
    if (!(await ensureSuitePlan(be.DB))) throw new Error("the ship's plan row \"suite\" could not be written");
    rec.suitePlan = "written"; saveRec(rec);
    say(`· the ship's plan row "suite" written into ${be.database} (tools/operator.mjs SUITE_PLAN: ${Object.entries(SUITE_PLAN).filter(([k]) => k !== "plan").map(([k, v]) => `${k} ${v}`).join(", ")}): the throwaways ride it`);
    const sides = [];
    for (const tag of ["xorgpa", "xorgpb"]) {
      if (signalled) throw new Error(`stopped by ${signalled}`);
      const word = canary(tag);
      const t = await restoreThrowaway(be, word, rec);
      const target = previewTarget(url, be.DB, stopped);
      const who = await door(target).mcp(t.owner, "whoami");
      if (who.isError || !who.out || who.out.id !== t.ownerId) throw new Error(`the restored owner of org ${t.org} does not sign in at ${url} (${brief(who.out)}): the URL and the database are not one deployment`);
      const project = `o${t.org}--${PREVIEW_SLUGS[0]}`;
      // the member (restored with no credential, an eval seat): its key through the door, the owner's POST /control rotate-key
      const mrow = await be.DB.prepare("SELECT id FROM people WHERE org = ?1 AND id <> ?2").bind(t.org, t.ownerId).first();
      if (!mrow) throw new Error(`org ${t.org}: the restored member is missing`);
      const rot = await target.call("POST", "/control", { headers: { authorization: "Bearer " + t.owner, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ action: "rotate-key", personId: mrow.id }).toString() });
      const member = (rot.text.match(/shown again: ([0-9a-f]{40})\b/) || [])[1];
      if (!member) throw new Error(`org ${t.org}'s member through the door (POST /control rotate-key ${rot.status}): no secret in the answer`);
      sides.push({ org: t.org, word, owner: t.owner, member, project, eval: true });
    }
    say(`· two throwaway orgs restored into ${be.database} (tools/org-undo.mjs, an eval-marked fixture export): ${sides.map((x) => `org ${x.org}`).join(" and ")}, each owner signed in at ${url}, each member's key rotated through the door`);
    const walked = previewTarget(url, be.DB, stopped);
    r = await attack(walked, { a: sides[0], b: sides[1], log: say, accounts: false, requireSession: true });
    r.planLimits = walked.planLimits;
    // 10.5: each 5xx's answer (redacted by answerOf) kept in the run dir before the cleanup
    r.fivexxFile = keepFivexx(rec.dir, r.fivexxAnswers);
    for (const x of sides) { try { const u = await unmarked(be.DB, x.org); say(`  · org ${x.org}'s rows with no eval mark the old code reads (what it could list meanwhile): ${Object.entries(u).map(([t, k]) => `${t} ${k ?? "none"}`).join(", ")}`); } catch (e) { say(`  · org ${x.org}'s unmarked rows: not read (${String((e && e.message) || e).slice(0, 120)})`); } }
  } catch (e) { failure = String((e && e.message) || e).slice(0, 600); }
  const cleaned = await cleanup();
  process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
  for (const [s, ls] of Object.entries(prior)) for (const l of ls) process.on(s, l);
  await be.close();
  const left = cleaned ? "" : `✗ attack-xorg (preview): a throwaway org is left in ${rec.database} (the ✗ lines above; the record: ${join(rec.dir, "orgs.json")})`;
  if (failure) { console.log(`✗ attack-xorg (preview): ${failure}`); if (left) console.log(left); return signalled ? 130 : 1; }
  const throttled = (r.planLimits && r.planLimits.n) || 0;
  const bad = r.findings.length + r.fivexx.length + throttled;
  if (bad) {
    console.log(`✗ attack-xorg (preview): ${r.findings.length} finding(s), ${r.fivexx.length} 5xx${r.fivexxFile ? ` (each answer kept: ${r.fivexxFile})` : ""}, ${throttled} plan_limit answer(s)${throttled ? ` (the first: ${r.planLimits.first}; the throwaways ride the ship's plan "suite": a throttled walk proves less)` : ""} in ${r.calls} calls against ${url}`);
    for (const x of [...r.findings, ...r.fivexx].slice(0, 25)) console.log(`  ✗ ${x}`);
  } else console.log(`✓ attack-xorg (preview): ${r.calls} calls against ${url} in both directions (${r.answered} answered 2xx) as each throwaway org's owner and member against the other: 0 rows of the other org read, 0 written, 0 5xx, 0 plan_limit (the throwaways on the ship's plan "suite"); under the victim's address ${r.addressBy.bearer} calls as a bearer and ${r.addressBy.session} as a browser session, each the one 404; the public file by its exact id the one ruled exception (${(r.ms / 1000).toFixed(1)} s)`);
  // the notes the walk took (D1: a silent gap read green before): each said, once
  for (const n of [...new Set(r.notes || [])]) say(`  · note: ${n}`);
  if (left) console.log(left);
  else say(`  · both throwaway orgs deleted (the record: ${join(rec.dir, "orgs.json")})`);
  return bad || !cleaned ? 1 : 0;
}

// ---- the CLI ----
const quiet = process.argv.includes("--quiet");
const say = (s) => { if (!quiet) console.log(s); };
async function runOnce(src, failFast, only = null) {
  const { target, a, b } = await inProcess(src);
  return attack(target, { a, b, failFast, log: say, only });
}
function mutant(m) {
  const dir = join(ENGINE, ".runs", "attack-xorg", `mutant-${m.name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
  // a mutation is one edit (file, from, to) or several (edits: [[file, from, to], …]), each found exactly once
  for (const [file, from, to] of m.edits || [[m.file, m.from, m.to]]) {
    const f = join(dir, file), s = readFileSync(f, "utf8"), n = s.split(from).length - 1;
    if (n !== 1) throw new Error(`mutation ${m.name}: its text is in ${file} ${n} times (want 1): the mutation is stale`);
    writeFileSync(f, s.replace(from, to));
  }
  return join(dir, "src");
}
// keptRefusal(runDir, out) -> why a red run's 5xx answer is not kept as 10.5 rules, or "": <run dir>/fivexx.json holds the 500's
// who, what, status and the body's first bytes (the mutant's own words); on disk no session token ("t_" + 40 hex), no 40-hex
// run, no bearer or cookie value and not the passphrase the suite tried (the mutant's body echoes the caller's session twice, in
// its cookie header and bare, and that passphrase: the review's M2); and the red verdict line names the file
function keptRefusal(runDir, out) {
  const f = join(runDir, FIVEXX_FILE);
  if (!existsSync(f)) return `no ${f}`;
  const text = readFileSync(f, "utf8");
  let k = null; try { k = JSON.parse(text); } catch { return `${f} is not JSON`; }
  const a = Array.isArray(k) ? k[0] : null;
  if (!a || !a.who || !/POST \/\S+\/control \(its session\)/.test(a.what || "") || a.status !== 500) return `its answer lacks who, what or status: ${brief(a)}`;
  if (!String(a.body || "").includes("mutant 10.5: POST /control threw")) return `its answer lacks the body's first bytes: ${brief(a.body)}`;
  if (/t_[0-9a-f]{40}/.test(text)) return `a session token is on disk unredacted: ${brief(a.body)}`;
  if (text.includes(TRIED_PASSPHRASE)) return `the passphrase the suite holds is on disk unredacted: ${brief(a.body)}`;
  if (/[0-9a-f]{40}/.test(text) || /Bearer (?!<redacted>)/.test(text) || /__Host-ar_session=(?!<redacted>)/.test(text) || !String(a.body).includes("<redacted>")) return `a key or a session is on disk unredacted: ${brief(a.body)}`;
  if (!out.split("\n").some((l) => /^✗ attack-xorg/.test(l) && l.includes(f))) return "the red verdict line does not name the file";
  return "";
}
const runChild = (src, only, runDir) => new Promise((done) => execFile(process.execPath, [fileURLToPath(import.meta.url), "--src", src, "--fail-fast", "--quiet", ...(only ? ["--only", only] : []), ...(runDir ? ["--run-dir", runDir] : [])], { maxBuffer: 1 << 26, cwd: ENGINE },
  (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: `${stdout || ""}${stderr || ""}` })));

// the CLI runs inside a function, never at the module's top level: a top-level await would make every importer (the smoke) an
// async module, and the smoke's cases register in import order only while no case module waits
async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const has = (k) => process.argv.includes(k);
  if (has("--url") || has("--cleanup")) {
    const o = { url: arg("--url"), cleanup: arg("--cleanup"), live: has("--live"), local: arg("--local"), config: arg("--config"), liveWriteOk: has("--live-write-ok"),
      creds: arg("--creds"), runDir: arg("--run-dir") };
    if ((!o.url && !o.cleanup) || (o.url && o.cleanup) || !o.config || !o.live === !o.local) {
      console.error("usage: node tools/attack-xorg.mjs (--url <worker> | --cleanup <run dir>) (--live --config <wrangler config> --live-write-ok [--creds <file>] | --local <persist dir> --config <wrangler config>) [--run-dir <dir>]");
      process.exit(2);
    }
    let rc;
    try { rc = await runPreview(o); } catch (e) { console.log(`✗ attack-xorg (preview): ${String((e && e.stack) || e).slice(0, 1200)}`); rc = 1; }
    process.exit(rc);
  }
  const failFast = process.argv.includes("--fail-fast");
  let r;
  try { r = await runOnce(arg("--src") || undefined, failFast, arg("--only")); }
  catch (e) { console.log(`✗ attack-xorg: the world did not build — ${String((e && e.stack) || e).slice(0, 1200)}`); process.exit(2); }
  const bad = r.findings.length + r.fivexx.length;
  const kept = arg("--run-dir") ? keepFivexx(resolve(arg("--run-dir")), r.fivexxAnswers) : "";
  if (bad) {
    console.log(`✗ attack-xorg: ${r.findings.length} finding(s), ${r.fivexx.length} 5xx${kept ? ` (each answer kept: ${kept})` : ""} in ${r.calls} calls`);
    for (const x of [...r.findings, ...r.fivexx].slice(0, 25)) console.log(`  ✗ ${x}`);
  } else {
    say(`  · the ruled exception (PLATFORM §2.7): ${r.exceptions.filter((x) => /\(its body\)/.test(x)).length} reads of the other org's PUBLIC file by its exact id served its body; read_file by that id: ${r.exceptions.filter((x) => /read_file.*served/.test(x)).length} served`);
    const cv = r.cover || {};
    say(`  · each walk: ${cv.tools} tools (reads and writes), ${cv.resources} brain:// resources and templates, ${cv.gets} GET routes as a page and as JSON, ${cv.posts} POST routes (POST /control's every action at the victim's people and projects), ${cv.address} calls under the victim's address (/<org>/…: its bearer and its browser session, each the one 404); not walked: ${Object.entries(r.skipped).map(([p, why]) => `${p} (${why})`).join("; ")}`);
    if ((r.surfaces || []).length) say(`  · the sign-in surfaces (7.5b): ${r.surfaces.length} walks — the read-only credential, the OAuth form and the token exchange, the grant's reach, the account and seat sessions, the Partners`);
    for (const n of [...new Set(r.notes || [])]) say(`  · note: ${n}`);
    console.log(`✓ attack-xorg: ${r.calls} calls in both directions (${r.answered} answered 2xx) as each org's owner and member against the other: 0 rows of the other org read, 0 written, 0 5xx; the public file by its exact id the one ruled exception (${(r.ms / 1000).toFixed(1)} s)`);
  }
  if (!bad && process.argv.includes("--prove")) {
    let red = 0;
    // --mutation <name> proves that one alone (a builder's loop); the gate proves them all
    const which = arg("--mutation") ? MUTATIONS.filter((m) => m.name === arg("--mutation")) : MUTATIONS;
    for (const m of which) {
      const src = mutant(m), runDir = m.kept ? dirname(src) : null;
      const c = await runChild(src, m.only, runDir);
      // a 7.5b walk's mutation runs that walk alone (m.only) and must be red by IT: its first finding names the walk (m.expect)
      const first = (c.out.split("\n").find((l) => /^  ✗ /.test(l)) || c.out.split("\n")[0] || "").trim();
      // 10.5: a 5xx's mutation must also leave its answer kept in the run dir, its credential redacted (keptRefusal)
      const keptWhy = m.kept ? keptRefusal(runDir, c.out) : "";
      const ok = c.rc === 1 && (!m.expect || m.expect.test(first)) && !keptWhy;
      if (ok) red++;
      console.log(`  ${ok ? "✓" : "✗"} mutation ${m.name} (${m.why}): the suite goes ${ok ? "RED" : keptWhy ? `red, but its answer NOT kept: ${keptWhy}` : c.rc === 1 ? "red, but NOT by its walk" : `rc ${c.rc}, NOT red`}${m.only ? ` (the ${m.only} walk alone)` : ""}${m.kept && ok ? " and its answer kept, the session and the passphrase redacted" : ""} — ${first.slice(0, 220)}`);
    }
    rmSync(join(ENGINE, ".runs", "attack-xorg"), { recursive: true, force: true });
    console.log(`${red === which.length && which.length ? "✓" : "✗"} attack-xorg proof: ${red} of ${which.length} mutations (one guard removed each) turn it red`);
    process.exit(red === which.length && which.length ? 0 : 1);
  }
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
