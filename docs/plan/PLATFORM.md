# PLATFORM — sharingu as a hosted platform (the road from beta to launch; owner, 2026-10-06)

sharingu becomes a platform: a person signs up, creates an org, creates projects in it; each org has a plan with limits
(raised by hand during the beta, by payment after it). ONE worker and ONE D1 database serve every org; what happens in
an org stays in the org. The road is four sprints, platform first and the plugin last (owner MCQ, 2026-10-06); payment
waits until the beta has succeeded. Each sprint runs by the process in `README.md`: a branch, slices, a smoke per
slice, the gate and the suites once, one review, one PR, a ship on the owner's OK. The stores themselves (listings,
submission, launch) stay in `MARKETPLACE.md`.

## 1. Where we start (the audit, 2026-10-06)

- **Live:** one worker (`ryuklabs-agent-r`), one D1 (46 MB, six projects, at `migrate-066`), one R2 bucket, one KV.
- **Schema:** 46 tables plus the search index, 88 triggers, about 60 indexes, no views. The `org` table holds one row
  (a CHECK on its id); `projects.key` is a slug every project-scoped table points at. The 16 knowledge tables, the
  derived tables, the triggers and the search index already keep everything apart BY PROJECT.
- **Code:** 322 database statements across 53 files of `engine/src`; no org or host is hardcoded. The one-org
  assumptions sit in two caches, the org row, four env values, the storage keys, sign-in, the cron and the id rules
  (§2 answers each; §3 lists what is left and the sprint that closes it).
- **Tools:** every operator tool assumes one org per worker; the gate runs 83 steps, none with a second org.
- **D1 facts** (Cloudflare's pages, read 2026-10-06): a database answers one query at a time; 10 GB a database; 100
  bound parameters a statement; 1,000 statements a request on the paid plan; Time Travel restores the WHOLE database
  in place (30 days, no copy), so it cannot undo one org's mistake.

## 2. The design (ruled)

1. **The wall is the project key (owner MCQ, 2026-10-06).** A project's key carries its org, as a repository's name
   carries its owner on GitHub; the slug a person types is unique inside the org. Everything already kept apart by
   project is then kept apart by org, with no table rebuilt. The six live projects keep their keys as org 1 (ryuklabs).
   The key's exact form is fixed by sprint 6's first slice, inside the key rules the door already enforces.
2. **Org-wide rows carry the org.** `people`, `tokens`, `invites`, `events`, `artifacts`, `loops`, `approval_audit`,
   `login_attempts` and `transmission` gain an org column: added, filled with org 1, then a trigger refuses any new row
   without one, so a forgotten write fails loudly instead of landing in org 1. The `org` table is rebuilt to hold many
   rows. The three running-count tables keep their `''` bucket for org-level rows per org, not one shared bucket.
3. **One scoped data layer.** Every statement runs through one layer that takes the reader's org; a new gate step fails
   any statement written outside it. The org comes only from the sign-in (a key, a session, an OAuth grant), never from
   a parameter; the one rule that finds a project resolves a slug inside the reader's org only.
4. **Caches know the org.** The org-row cache and the active-projects cache are keyed by org, and so is every request
   memo built from a project key.
5. **Storage carries the org.** Every R2 key (inbox, renders, backups) gains an org prefix. The OAuth store keys grants
   by person id (random, safe); client registrations hold no data and stay shared.
6. **An owner owns one org.** The admin role is the admin of its own org. The routes that today run over the whole
   database (storage, log, backup dump, backfill, clean-eval, measures) are scoped to the reader's org. Work across
   orgs runs only with the deployment credentials, from the operator's machine, never through an app seat (owner,
   2026-10-06).
7. **Ids.** Ids a caller supplies (questions, cards, checks, nodes, goals) are safe under org-carrying project keys.
   Contribution ids stay numbered across the database (T-date-number): they reveal the platform's volume, not content.
   A public file's link (a render or artifact by its exact id) answers from any org — ADR-055's "anyone with the link"
   holds, ruled kept (owner, 2026-10-06) because sign-up is allowlisted; the 6.6 attack suite treats a read by exact id
   as this ruled exception, lists stay per org. Both are revisited together, once, before sign-up opens to everyone.
   Broadcast slugs become unique per org (today a taken slug answers across orgs).
8. **Accounts.** Today a person is a row inside an org and sign-in looks the email up unchecked. Sprint 7 makes an
   account per email (unique) with a membership per org; the lockout counts per account. One session per account
   (the cookie stays `__Host-` with the whole site as its path); the org comes from the address and the membership.
9. **The address (owner, 2026-10-06): by path.** The platform answers at `agent.ryuklabs.io` (the owner: "the main";
   their words), each org at its own path, `agent.ryuklabs.io/<org>`, and the AI at the one address, `/mcp` on that host.
   Org names never take a name the platform uses (`login`, `mcp`, `docs`, every route of the door). ryuklabs moves to
   its path; its old addresses redirect, and the connected clients keep working.
10. **Joining (owner, 2026-10-06; RE-RULED by sprint 21's MCQs of 2026-10-13/14).** The first rule was no email
    service: only an email the operator allowed signs up, with a one-time code handed over by hand. Since sprint 21 a
    new team requests access at `/request-access`, its email is checked by a mailed link (or Google), and the operator's
    approval mails "You're in" (Cloudflare Email Sending, From hello@sharingu.xyz, under a cap); knowing an email is
    still not enough to take its account (the mailbox proves it). The operator's code stays for the operator's own
    accounts and the reviewer accounts.
    Since sprint 12 (12.3) an org's admin may also hand ONE invited person a one-time invite link for that person's seat:
    it sets a passphrase only on an account that has none and no other seat, and such an account reaches only the org that
    invited it (it can create no org and accept no other org's seat) until the operator's code confirms its email. Who
    founds an org stays the operator's alone (the beta's 50, the owner approving each).

## 3. The residual ledger — everything open, and the sprint that closes it

Nothing open lives anywhere else: the old "open" list in `SPRINTS.md` was reconciled into this table (2026-10-06).
Sprint 9 became the plugin and the listing kit alone: every row below still marked **S9** is OPEN (the platform's
hardening), its sprint the owner's to open (2026-10-10).

The sprint-9 ship's table (its seven rows) CLOSED with sprint 10, shipped 2026-10-10 (`SPRINTS.md` sprint 10).

| Item (sprint 12's builds, 2026-10-10) | Where it comes from | Closes in |
|---|---|---|
| The rail's project switcher names the current project while `/audit?all=1` shows every project | 12.5 | the next look pass |
| The one-project What changed page reads the ledger by the project key alone: a key collision across orgs would show another org's row there (no door can make one — keys carry their org — so it is defense in depth); the activity walk proves the JSON only | sprint 12's review fixes | the next platform sprint |
| A STANDING local world's D1 misses the migrations a new sprint's code expects (`dev-local` after sprint 13's ship: the import failed on `transmission.client` until migrate-080 was applied by hand with `wrangler d1 execute --local`). `dev-local.sh`/`r-local.sh` should apply pending `migrate-0NN.sql` files to a standing world before the worker starts | the sprint-13 carousel retake | the next platform sprint |
| A filing through `mcp-remote` (a Claude Desktop config's stdio bridge) reads "from another client": its OAuth registration names it "MCP CLI Proxy", and 13.1's order of trust puts the registered name above the clientInfo the bridge forwards, so Claude Desktop's own `claude` never shows. A known bridge's registered name should defer to the forwarded clientInfo (still a self-declared label) | 12.9's video takes (2026-10-12) | the next platform sprint |
| The cross-org suite on the preview is most of a ship: 2 h 4 min of sprint 14's 2 h 10 min (10,332 calls, about 0.6 s each, sent one at a time). The flood filter's `retry-after` is a fixed 60 s, so the 61 s waits are right; the cost is serial latency. A builder's read (2026-10-12): only the reads (about 57% of the calls: the read-only tools, `resources/read`, the GET routes, the read-backs) can run side by side, between the writes, checked in their order; every write, `preview` with its write tools, the paced sign-ins and `/orgs`, the snapshots and the cleanup stay serial: at most about 2.3x faster | `engine/tools/attack-xorg.mjs` | THE NEXT SPRINT'S FIRST SLICE (the owner, 2026-10-15: tests focused on the change's region): a bounded pool for the read runs (a knob, 1 = today's serial), proven against a serial run on a local worker (same counts, same findings in the same order); never widen the flood filter for it |
| THE DEAD CODE, listed 2026-10-15 (a scan of every export against every file of the repo): four exports nothing reads — `isOrgError` (`src/data.js`), `UCHAN_POSES` and `BRAND_MARKS` (`src/ui.js`), `embedUrl` (`src/walkthrough.js`); and ~450 names exported but read only inside their own file (the `export` is noise: trim it where no selftest imports the name). The dead table `invites` is its own row below (a contract migration) | sprint 21's close-out | SPRINT 22, its second slice (one ship with the focused tests): remove the four, trim the needless exports, prove nothing else moved (`node --check`, the gate, the smoke) |
| Tests run everything every time (the owner, 2026-10-15: "focused on the sprint and its impact region, not everything every time"): each of 2026-10-15's three fixes paid the whole smoke (372 cases, ~15 min), the gate and the whole cross-org suite (~1.5 h). The smoke has no way to run only the cases a change touches; a change to docs or the plugin alone still reads as needing a ship | sprint 21's close-out | THE NEXT SPRINT'S FIRST SLICE: `tools/smoke.sh --only <case,…>` (the touched cases while building; the full smoke and the gate once before the sprint's PR, as now); `ship-plan.sh` says when a change needs no ship (nothing under `engine/` or `contracts/` moved); the cross-org suite stays whole on every code ship (the wall's guard) and gets the bounded pool above |
| The reviewer world refreshes its data only by resetting every code: a run on a standing world signs each account in with a code it does not keep, so a changed source (13.3: any engine change) needs `--reissue`, which ends the store reviewers' sessions. A data refresh should keep the codes (sign the admin in by the operator's own path, or reset the admin's code alone). Until then: no refresh after the codes are handed over (`tools/ship-plan.sh` says so) | sprint 13's review (should-fix 2) | the next platform sprint, before any refresh after M4 |

| Item | Where it comes from | Closes in |
|---|---|---|
| `/log`, `/audit`, the owner's open queue and the per-org dump read PAST other orgs' rows (no index led by the org — a migration); exact beside one org. The page budget has only ever run AS the big org: it also runs as a SMALL org beside a full org 1 | slice 6.3; the sprint-6 review | S8 (with the cost cuts) |
| `resolveReadOnly` reads and hashes every active person platform-wide on any 64-hex bearer, unauthenticated (an indexed hash column) | the sprint-6 review | S9 |
| An org id is MAX(id)+1: after the newest org is deleted, the next org reuses its id, and the 60-second org-row cache can show the deleted org's name there for up to a minute (never ids that never existed; never another live org's rows) | slice 7.3 | S9 (never reuse an org id: a high-water mark) |
| The squat's residual under A1: an account whose ONE active seat is a squatter's org signs a JSON sign-in/sign-up straight into it (a browser lands on the picker, since a seat waits) — RULED by the owner at sprint 8's ship MCQ (2026-10-09): a pending seat makes the JSON sign-in and sign-up ask (`409 choose_org`) too; lands with sprint 8's ship | the sprint-7 review fixes (F3); the owner 2026-10-09 | closing with S8's ship |
| `addressFlooded`'s LOGIN_LIMIT bucket keys a compressed IPv6 address as typed, so one host's spellings land in different buckets (the lockout's own `addressKey`, 8.3a, expands them right) | 8.3a's build | S9 |
| A contribution whose `what` passes ~1,950 characters fails its audit-log insert (the filing lands, the mirror row refuses): cap or split the mirror's text | 8.3b's build | S9 |
| The test database shims bind a missing SQL parameter as NULL where D1 refuses the call: a wrongly bound statement passes every selftest and only the real worker catches it — the shims should refuse as D1 does | 8.3b's build | S9 |
| The render purge removes nothing under today's rules (every take is history): a retention rule is the owner's | 8.3b's measurement | the owner's, then S9 |
| The storage shown and checked reads ~one row per screen take (takes are never purged): Control, both whoami doors and every file upload pay it, and ~1,400 takes push whoami past the row budget — a running byte total on `org_usage`, kept by the take/style triggers (a trigger migration); superseded STYLE bodies and the wrap-up records in R2 are uncounted too (the sprint-8 review B3, B4) | 8.4's build; the review | S9 |
| An org's own least-privileged credential (a Partner, the read-only link) can spend `calls_day` and freeze the org's writes for the day (intra-org; the burst caps the pace; the operator raises) | the sprint-8 review (A2) | S9 (the quota design's revisit) |
| The items check is a read before the batch, the tally in it: concurrent batches can overshoot the limit by the in-flight count, once (the tally stays true; the next write refuses) | the sprint-8 review (B2) | S9 (the transactional limit check) |
| The ship-fix glue (the walk's plan check, the suite row's lifecycle) has no selftest: the local end-to-end run and the preview's fail-on-plan_limit are the guard | the sprint-8 review (D2) | S9 |
| A body stored before a genuine mid-flight failure (a crash partway, a failed batch, the goal-guard rollback) can remain in R2 unnamed by any row — rare since the review's B1 put the items check before the store; bodies are never deleted, so a sweep needs its own ruled tool | the sprint-8 review's fix (B1's trade) | S9 (with the storage tally row) |
| `idx_people_org_seated` and `idx_transmission_org_month` (075's) serve no statement since the review's C2 removed the display recount: dropping them is a contraction migration | the sprint-8 review's fix (C2) | S9 |
| A read flood is counted but never refused ("reads are never refused", the 8.2 ruling): the burst holds writes only, so reads can still load the shared database | the 8.2f rulings | S9 (the one pre-public revisit) |
| The cron's fixed half-day window: a heavy org can starve the orgs behind it in its window | the sprint-6 review | S9 |
| The attack suite cannot see COUNT leaks (a differential walk) and does not walk the cron (its OAuth, cookie, read-only and Partner walks landed in 7.5b) | the sprint-6 review | S9 |
| `ship.sh` is monolithic: a restart re-pays the gate, the upload and the ~30-minute preview attack (two reboots cost two full runs). Milestones keyed to the commit and the uploaded version id; a rerun reuses proven steps and auto-cleans a prior run's throwaways; promotion steps never skipped | the sprint-6 ship, 2026-10-07 | S6 ship's close: built between runs, before sprint 7's ship |
| `/health`'s one schema read against a FREE account's daily quota gate (the 2026-09-05 scar): unmeasurable on our Workers Paid account (no daily limit); `/health` answers 200 and names no org on live | slice 6.3; the sprint-6 ship | the first outside install on a free account |
| The live bucket's orphan `serve/…` objects of an earlier app (nothing reads them; the tool leaves them alone) | slice 6.4 | the owner's, any time |
| The write cost: a fresh five-project import writes ~170,000 rows; the two cuts named (`WITHOUT ROWID`, derived rows once per call) each rebuild live tables — a ruling and its own migration window | sprint 2; measured again 8.3b | S9 |
| The owed live measures: the page budget after sprint 5; a 200-item preview's CPU; the search index; `migrate-061`'s partial index on a real D1; the cron backup's CPU | the ship-time measures owed since sprint 3; sprint 5's B1 | S6 entry: the baseline before the migration |
| Sign-in by an unchecked email; the lockout per email; a sign-in attempt counts in org 1 until the org is in the address (6.1) | `src/index.js`, `src/oauth.js` | S7 |
| `new-org.sh`, `teardown-org.sh`, `r-local.sh`, `dev-local.sh`, `import-live.sh`, `restore-local.mjs`, `gate-rehearsal.sh` mint or read one org per worker | `engine/tools/` | S6 (the test harness), S7 (creating an org is a write; self-host = the platform holding one org) |
| The dead table `invites` (the sign-up codes went to their own platform table, `signup_codes`, slice 7.2: a code exists before any org) | `boot.sql` | S7: dropped in the sprint's next CONTRACT migration (never in the file that adds) |
| The `agent-ops` beta grant | `HANDOFF.md` | at the beta's end (the owner's ruling); from S6 the org wall keeps it inside ryuklabs |
| Rows read, what 8.3b left: Home 218 (its own option lists; ~20 more cuttable), the ship prune's row-by-row ledger read (needs `read` to answer more fields: a contract change), the ledger reads that grow with time (a window or a live-ledger index: a ruling) | sprint 3; 8.3b's measurements | S9 |
| The palette's search in a real browser with a cookie (G1) | sprint 3's G1 | S7 (the front door's browser walk) |
| GitHub hand-off uses one token for the whole worker | `src/handoff.js` | after the road (§4): an org connects its own; until then org 1 only |
| No inbound webhooks exist (billing needs one) | `ARCHITECTURE.md`, `INVENTORY.md` | billing, after the beta succeeds |
| The Map: the reverse direction between two projects' parts is not drawn; a link's `find=` highlights nothing without a matching node; "changed" for an ungraded part reads the service's date | sprint 4's M3 and M4 | after the road (§4) |
| A person's own picture (initials stand in for faces) | `LOOK.md` | after the road (§4) |
| The frame history's strip is a grid of three (the plain plate was fixed by sprint 5's A2) | sprint 4's M6 | after the road (§4) |
| The owner's active-projects check costs 6 rows a call (capped by the plan's project limit; the only cut is a cache that could be a minute stale: a ruling) | sprint 4's D5L; 8.3b's skip | S9 |
| The projects' data nits (siru, saruspay, bunny, ryuklabs; `askedAt`; saruspay and bunny ungraded; saruspay's imported rulings carry no `decidedBy`) | sprint 3 | not on this road (owner, 2026-10-06: the platform, not the projects' data) |
| The secrets still in the import sources | sprint 3 | the owner's (rotate or clean) — no urgency: the engine's repo stays private for good (2026-10-09, the proprietary ruling) |
| The invites (the ryuklabs team on Control; an outside team also a GitHub collaborator invite) — ruled 2026-10-06: NO new invite before sprint 7's hosted front door ships | `HANDOFF.md`, `BETA.md` | the owner's, after S7 ships |
| The Claude Code elicitation report; Dr Vasu's open item | `HANDOFF.md`, `BETA.md` | the owner's, any time |
| A terms page on sharingu.xyz; a claude.ai plan for the portal; a verified OpenAI organisation; the approval of what the stores show; an Anthropic partner contact; the launch (who is told, where, when) | `MARKETPLACE.md`, the owner's table items 3, 5, 8, 11, 12 | the owner's: by S9 (terms, accounts, approval), at M5 (partner, launch) |
| Contribution ids numbered across the database; a public file's link answering from any org; and an org's ADDRESS answering its own branded sign-in (anyone can learn an address is taken — never who is in it; slice 7.4b) (§2.7; kept by the owner 2026-10-06 while sign-up is allowlisted) | the audit; slices 6.2, 7.4b | the owner's, ONE revisit of all three together before sign-up opens to everyone |
| The privacy page on sharingu.xyz says who can reach a hosted org's data (only the deployment credentials) | `MARKETPLACE.md` item 3, §5 | the owner's, before the first outside org (S7) |
| The payment account and the prices | `MARKETPLACE.md` item 9 | the owner's, after the beta succeeds |
| The allowed emails, and the go for the first outside org; any change to a proposed limit | §2.10, §4 sprint 8 | the owner's: S7, S8 |
| Which roles see ryuklabs' claim cards; the demo project's aim measure and its supported clients | sprint 4; `MCP.md` §6 | the owner's, any time |
| The docs that say "one worker per org", "each org its own address" or "`new-org.sh` makes an org" | `README.md`, `llms.txt`, `AGENTS.md`, `engine/CLAUDE.md`, `docs/INSTALL.md`, `docs/BETA-NOTE.md`, `engine/ORG-SETUP.md`, `orgs/README.md`, `ARCHITECTURE.md`, `INVENTORY.md` (true today: each names the coming change where it matters) | rewritten by the sprint that changes the fact: S6 (`ARCHITECTURE.md`, `INVENTORY.md`, `engine/CLAUDE.md`, `AGENTS.md`), S7 (the rest), billing (webhooks) |

| Item (the board's review, 2026-10-16: verified against the code) | Where it comes from | Closes in |
|---|---|---|
| No email to a declined applicant: a decline (the operator page, `tools/operator.mjs` decline --request) changes the request only, and the person learns it on their status page. To close: a seventh email in `src/mails.js`, sent through sendMail by the one decline statement both doors share; the operator page says sent or not sent. | the board's review, 2026-10-16: `tools/operator.mjs`, `src/operatorread.js` | open — the owner's to schedule |
| No self-service account deletion: only the operator's remove-account (refused while a seat or a founded org stands); the privacy page sends people to email. To close: a delete door that re-proves the passphrase and runs remove-account's guarded batch, refused with its reason while a seat or a founded org stands; a Delete account card on the profile and the status page. | the board's review, 2026-10-16: `tools/operator.mjs`, `src/accountpage.js` | open — the owner's to schedule |
| No change of an account's email (the account's email is unique, a seat's is set once). To close: a pending-email row and a verify link to the new address (a notice to the old one), then the account and its seats swapped in one batch, other sessions ended; a field on the profile. | the board's review, 2026-10-16: `migrate-070.sql`, `src/accounts.js` | open — the owner's to schedule |
| No second factor (TOTP or passkeys) on a passphrase sign-in; Google is another way in, not a second factor. To close: a factors table, an enroll and a verify step after the passphrase and on the step-up, recovery codes, a Two-step sign-in card on the profile; an adversarial review before its PR. | the board's review, 2026-10-16: `src/accounts.js`, `src/google.js` | open — the owner's to schedule |
| No email preferences: the join's updates consent is stored (`consent_updates`) but read only by the operator page, and nobody can change it after joining. To close: the preference on the account, a toggle on the profile, an unsubscribe link in any future updates email, which sends only to those who said yes. | the board's review, 2026-10-16: `src/requestaccess.js`, `src/operatorread.js` | open — the owner's to schedule |
| No self-service export in the app: an org owner can only page the JSON dump through POST /backup-dump (no screen, no file bodies, no emails); the whole export is the operator's `tools/org-undo.mjs`; a person has none of their own. To close: an owner's export on Control · Admin (the dump's pages and the file bodies as one download) and a person's own on the profile. | the board's review, 2026-10-16: `src/index.js`, `tools/org-undo.mjs` | open — the owner's to schedule |
| No invite email: Control's Invite shows a one-time link the admin sends by hand, and a seat added for an existing account gets no email (it waits on the org picker). To close: an invite email in `src/mails.js` behind a Send by email choice on Invite, and an "you were added" email for a waiting seat, both through sendMail under the cap. | the board's review, 2026-10-16: `src/admin.js`, `src/controlpage.js` | open — the owner's to schedule |
| No list of a person's sessions and no sign-out everywhere: sign-out ends this device; the others end only as a side effect of a key rotation, a passphrase change or a reset. To close: the person's sessions listed on the profile (device, started, last seen) with End and End all. | the board's review, 2026-10-16: `src/profile.js`, `src/secrets.js` | open — the owner's to schedule |
| No list of connected AI clients: OAuth grants are revoked only as a side effect (a rotation, a passphrase change, remove-person); neither a person nor an admin sees them. To close: Connected apps on the profile, each grant with Disconnect, and a per-member count with Disconnect on Control. | the board's review, 2026-10-16: `src/oauthgrants.js` | open — the owner's to schedule |
| No standalone invite revoke and no list of open invites: a new link revokes the old one; otherwise only remove-person or the 7-day expiry ends it. To close: a revoke-invite action on Control and an "open until" chip on the member's row. | the board's review, 2026-10-16: `src/admin.js`, `src/accounts.js` | open — the owner's to schedule |
| No way for a member to leave an org: a waiting seat can be declined, an active seat cannot be left, and remove-person refuses the admin's own seat. To close: a leave answer for an active seat behind the same last-owner guard as remove-person; Leave org on the org picker and the profile. | the board's review, 2026-10-16: `src/accounts.js`, `src/admin.js` | open — the owner's to schedule |
| No rename or delete of an org by its owner: Control has neither; a deletion is the operator's `tools/org-undo.mjs`. To close: a rename on Control (the name; a new address also needs the reserved-name check and a redirect) and a Delete this org request re-proved by the passphrase, run by the operator or a delayed cron. | the board's review, 2026-10-16: `src/admin.js`, `tools/org-undo.mjs` | open — the owner's to schedule |
| No transfer of an org's founder mark: several admins are allowed, but the org's created-by account stays the founder's and keeps the founder's remove-account refused. To close: a transfer on Control that moves the mark to another active admin's account, re-proved by the passphrase. | the board's review, 2026-10-16: `tools/operator.mjs`, `src/admin.js` | open — the owner's to schedule |
| No security emails: nothing is sent on a sign-in from a new client, a passphrase change, a reset, Google's first link or a lockout (the lockout answers 429 only). To close: one security email in `src/mails.js`, sent after those events (a lockout once a window), through sendMail. | the board's review, 2026-10-16: `src/accounts.js`, `src/mails.js` | open — the owner's to schedule |
| No recovery when the mailbox is lost: recovery is the emailed reset alone, else the operator's hand-made code. To close: recovery codes (only their hashes kept) issued with the second factor or on the profile, and a written identity check for the operator. | the board's review, 2026-10-16: `src/accounts.js`, `tools/operator.mjs` | open — the owner's to schedule |
| No terms record for an invite or a code sign-up: the consent and its version are stored only for a request-access or a Google join, and the account holds no terms version. To close: the terms version and time on the account, a required box on the invite's and the code's sign-up, asked again when the version changes. | the board's review, 2026-10-16: `src/signup.js`, `src/invite.js` | open — the owner's to schedule |
| No withdrawal of a request: the status page only reads, so a person in line cannot leave it. To close: a withdraw action on the status page (the account session) that closes the request and clears its fields as the 90-day clearing does. | the board's review, 2026-10-16: `src/accountpage.js`, `src/requestaccess.js` | open — the owner's to schedule |
| No resend of "You're in": approve works on an open request only, so a lost or unsent email cannot go again (the page says to tell the person yourself). To close: a resend for an approved request with no org yet, on the operator page and in `tools/operator.mjs`. | the board's review, 2026-10-16: `src/operatorread.js`, `tools/operator.mjs` | open — the owner's to schedule |
| No single sign-on for an org (SAML, or the org's own OIDC): Google sign-in is per person. To close: an org's identity-provider setting (its client in KV), the email's domain matched at sign-in, seats made on first sign-in; an adversarial review before its PR. | the board's review, 2026-10-16: `src/google.js` | open — the owner's to schedule |
| No status page and no way to tell the orgs of an incident: GET /health only. To close: a status page linked from the front pages' foot and an operator announce that emails each org's admins under the cap. | the board's review, 2026-10-16: `src/index.js`, `src/login.js` | open — the owner's to schedule |
| The profile's passphrase form says minlength 4 while an account's passphrase needs 12 (`ACCOUNT_MIN_PASSPHRASE`): a short one passes the browser and the server refuses it. To close: the form's minlength read from that one number. | the board's review, 2026-10-16: `src/profile.js`, `src/secrets.js` | open — the owner's to schedule |
| The operator is any admin of org 1 (the owner's MCQ of 2026-10-15: no narrower role), so every request's profile and Approve and Decline come with an org-1 admin seat. To close: only on a new ruling — an operator mark that `mayOperate` checks instead of the admin role. | the board's review, 2026-10-16: `src/operatorread.js` | the owner's (the ruling stands; a revisit is theirs) |

Decided and kept as they are: a refused unknown project answers 403; nothing writes "drift" events.

## 4. The sprints

Each sprint's slices go into `SPRINTS.md` when it opens, in the slice order the process sets (the table, the write,
the screen). Sizes: L about two weeks of slices, M about one.

### Sprint 6 · Isolation (L) — nothing visible changes

- **Entry:** the live baseline (§3's owed measures, the rows read per screen, the row count per table) and a fresh
  backup.
- **6.1 · The tables.** `org` holds many orgs; `projects` gains its org and slug; the key rule; the org column and its
  refusing trigger on the org-wide tables; the per-org buckets; `sso_nonce` dropped; a gate check that `boot.sql`
  equals the migrations, triggers included.
- **6.2 · The scoped data layer.** Every statement moves behind it; the gate step that fails a statement outside it;
  the caches and request memos keyed by org.
- **6.3 · An owner owns one org.** The whole-database routes scoped; owner lookups by org; storage per org; the
  Partner seam; broadcast slugs per org; `/health` as a platform check; the worker's name stands for the platform,
  the org's name comes from its row.
- **6.4 · Storage and the cron.** R2 keys with the org (org 1's objects copied; the old keys read for org 1 until the
  copy is verified, then deleted); the cron loops over orgs inside its CPU; the backup per org.
- **6.5 · One org's undo.** Export one org; restore it into the shared database under a new org id (the rehearsal);
  delete one org. This is the undo Time Travel cannot give.
- **6.6 · The second org everywhere.** The fixtures build two orgs; the smoke seeds two and gains the cross-org case;
  the suites start org A and org B; the eval seats live in their own org; the cross-org attack suite joins the gate
  (every tool, every page and every route as org B against org A: zero rows); the dry run carries two orgs; sprint 1's
  isolation items fixed.
- **6.7 · The docs of the fact.** `ARCHITECTURE.md`, `INVENTORY.md`, `engine/CLAUDE.md` (with §5's rules) and
  `AGENTS.md` say one worker, one database, many orgs.
- **Ship:** the migrations one at a time, expand then contract, a bookmark before each; the code on the preview runs
  the cross-org suite and the walk BEFORE the 10% canary.
- **Done when:** ryuklabs works exactly as before (walk 13/13, verify-live 18/18, rows read per screen at or under the
  baseline, since a missing org filter shows as more rows read), and on live a throwaway second org proves blind to
  org 1, then leaves through the new per-org delete.
- **The owner provides:** nothing but the ship's OK.

### Sprint 7 · Accounts, sign-up and the front door (L)

- **7.1 · Accounts.** One account per email; a membership per org (today's person row becomes the account's seat in
  its org); one session per account; the lockout per account.
- **7.2 · Sign-up by allowlist.** The operator allows an email and gets a one-time code for it (the `invites` table);
  the owner hands both over by hand; the person signs up with the email, the code and a passphrase. No mail is sent
  and none is needed (§2.10).
- **7.3 · Create an org.** The org's name (its path, never a reserved one), the owner's membership and the first
  project, as a write (what `new-org.sh` does today); switch org; add a member by allowed email.
- **7.4 · The front door by path.** `agent.ryuklabs.io/<org>` for every page; sign-in lists the person's orgs; each
  org's brand on its own pages; ryuklabs moves to its path with redirects from the old addresses.
- **7.5 · The door.** One `/mcp`; `publish` and `equip` ask their confirm; grants older than sprint 3's stamp end; a hand-filed batch over 30
  items stays protected past its two-minute window; the OAuth grant carries the person and the org; `whoami` lists the orgs and a call
  switches between them; the clients already connected land in ryuklabs.
- **7.6 · The docs and self-hosting.** `docs/INSTALL.md`, `README.md`, `llms.txt`, `docs/BETA-NOTE.md`,
  `engine/ORG-SETUP.md`, `orgs/README.md` rewritten; self-hosting becomes the same platform on your own account.
- **Done when:** on live, a stranger with an allowed email and its code signs up, creates an org and a project, files
  through `/mcp`, and the attack suite shows the new org and ryuklabs blind to each other. The privacy page on
  sharingu.xyz says who can reach a hosted org's data before the first outside org is allowed. A real-browser
  walk of the front door, the palette's search included, signed in with a cookie.
- **The owner provides:** the allowed emails, the privacy page's update, and the go to let the first outside org in.

### Sprint 8 · Limits, usage and the operator (M)

- **8.1 · Plans and usage.** A plan per org, its limits in a table (the numbers below); usage counted by SQL
  aggregates, never by reading a table to count it.
- **8.2 · Enforcement.** Every write checks the plan: a warning at 80%, a clear refusal at 100% with its error code;
  reads are never refused; the per-minute burst limit per org, so one busy org cannot starve a database that answers
  one query at a time.
- **8.3 · The cost cuts the limits stand on.** §3's S8 rows: the rows-read overages and the pages' blockers read; the
  50-item file and preview; the prune; the growing ledger reads; the render purge; the write cost of an import; the
  Map inspector's question read; the active-projects check; and the goal invariants checked inside the write.
- **8.4 · Shown.** The storage limit counts files and screen pictures per org; Control shows the plan and the usage;
  `whoami` answers the plan.
- **8.5 · The operator.** A command-line tool on the deployment credentials: allow an email (and its code), list orgs,
  raise an org's limits, suspend, export, delete. While there is no payment, raising the limits by hand IS the paid
  plan.

**The limits (ruled by the owner 2026-10-06: the free tier TIGHTENED from the proposal — items and calls halved;
raising by hand on request IS the paid plan during the beta):**

| Limit | Free (everyone in the beta) | Team (after the beta: paid; in the beta: raised by hand) |
|---|---|---|
| Orgs a person creates | 1 (a member of any number) | — |
| People in an org | 10 | 50 |
| Projects in an org | 3 | 25 |
| Items filed a month (contributions, knowledge, grades) | 1,500 | 50,000 |
| MCP and API calls a day | 1,000 | 25,000 |
| Burst | 60 calls a minute | 300 a minute |
| Files and screen pictures stored | 1 GB | 25 GB |

Why these hold: a hundred free orgs at their full limits make about 3 million requests a month (the paid plan
includes 10 million), at most 4.5 billion rows read at the 1,500-row budget (25 billion included), a few million rows
written (50 million included) and about 5 GB of database (one database holds 10 GB; ryuklabs is 46 MB with six
projects). So the beta costs nothing beyond the plan we already pay, and the burst limit protects the shared database.

### Sprint 9 · The plugin and the listing kit (M) — `MARKETPLACE.md` M1 + M2 — SHIPPED 2026-10-10 (`SPRINTS.md`)

- **9.1 · The plugin.** The manifest, the MCP config on the one address (sign-in, no questions), the skills generated
  from `engine/src/presets/` with a gate check that they match; our marketplace file at the repo root; `claude plugin
  validate`; the install proven on a clean machine (a fresh user account on the Mini).
- **9.2** Control · Connect offers the plugin.
- **9.3 · The listing kit.** The docs page from `GET /capabilities`; the icon and screenshots (the sharingu project
  only); the reviewer org; five positive and three negative test cases; ~~the repo public (MIT)~~ — OVERTURNED 2026-10-09: proprietary, the repo stays private; the plugin ships from its own public distribution repo.
- **Taken from sharingu.xyz (owner, 2026-10-06):** the name and slug `sharingu` (never changeable once
  published), the icon (the site's favicon and brand marks), the description (the site's), the contact the site
  gives for support and security, the privacy page (sharingu.xyz/privacy.html) and the docs
  (sharingu.xyz/docs.html). The terms page is live (www.sharingu.xyz/terms.html, 2026-10-09).
- **The owner provides:** the claude.ai plan for the portal, a verified OpenAI organisation, the approval of
  everything shown.

Then `MARKETPLACE.md` M4 (submit) and M5 (launch).

### After the road · the product

What the product still owes, taken up as fix-and-update sprints once sprint 9 ships: the Map's reverse direction
between two projects' parts, a link's `find=` without a matching node, "changed" on an ungraded part; the frame
history's strip; a person's own picture; GitHub hand-off per org.

### After the beta succeeds · Billing (M)

- A customer and a subscription per org with the payment provider; checkout; the customer's own billing page.
- The first inbound webhook, its signature checked, sets the org's plan (`ARCHITECTURE.md` and `INVENTORY.md`
  updated).
- Downgrade and grace rules; after any restore, billing is reconciled with the provider.
- Test mode end to end, then live; the terms published.
- **The owner provides:** the payment account (Stripe), the prices, the legal entity and the terms.

## 5. Rules for one database shared by every org (they join `engine/CLAUDE.md` with sprint 6)

- A migration is expand then contract, always: nothing renamed or dropped in the step that adds.
- Time Travel is a platform incident tool. The undo for one org is the per-org restore.
- The canary reaches every org, so the preview runs the cross-org suite and the walk before any traffic moves.
- A preview hook writes live data only for the org it was started for.
- A migration's dry run uses a copy holding at least two orgs.
- One org never blocks the rest: a rate limit per org and the per-screen row budget.
- Before the waitlist opens: the per-org restore rehearsed on live, the attack suite green on live, and the privacy
  policy saying who can reach the data.

## 6. The owner's, at a glance

A view of §3's rows that are the owner's (§3 stays the one list): the allowed emails, the privacy page's update and
the go for the first outside org (S7); any change to a proposed limit (S8); the terms page, the store accounts and the
approval of what is shown (by S9); the partner contact and the launch (M5); contribution ids before sign-up opens to
everyone; the invites, the Claude Code report, Dr Vasu's item, the claim cards' roles, the demo's two questions and the
import sources' secrets (any time); the payment account and the prices after the beta succeeds.
