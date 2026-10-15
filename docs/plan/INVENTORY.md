# sharingu — the code, measured

What the code holds, by area. Paths are relative to `engine/`. No line numbers: find a function by its name. The layout
of `src/` and `tools/` is `engine/CLAUDE.md`; the tools and routes are `contracts/door.json`.

## Where each screen reads and renders

| Screen | Read | Render | Tool |
|---|---|---|---|
| Home | `src/home.js` `readHomeSummary` | `src/home.js` `renderHome` | `home` |
| Build · a contribution | `src/build.js` `readBuild` | `src/build.js` `renderBuild` · `src/txpage.js` `renderTransmissionPage` | `build` · `read {ref: "T-…"}` |
| GTM | `src/gtmread.js` `readGtmPipeline`; its lists `src/tablists.js` `tabListsFor` | `src/gtm.js` `renderGtm` | `gtm` |
| Goals · one goal | `src/goalsread.js` `readGoals`, `readGoalNode` | `src/goals.js` `renderGoals`, `renderGoalNode` | `goals` · `goals {ref}` |
| Decisions · a question | `src/decisions.js` `readDecisions`, `readQuestion` | `src/decisions.js` `renderDecisionsPage`, `renderQuestionPage` | `decisions` · `decisions {qid}` |
| Map | `src/mapread.js` `readMapPage`; the inspector `src/mapnode.js` `readMapNode`; a plane `src/mapplanes.js` `readMapPlane` | `src/mappage.js` `renderMapPage` (client `src/mapclient.js`, layout `src/maplayout.js`); Arch `src/archview.js` `renderArchView` (client `src/archclient.js`, shipped as its generated build `src/archclientdata.js`) | `map {plane}` · the inspector `map {ref}` |
| Map · Screens | `src/knowledge/screens.js` `readScreens` | `src/atlaspage.js` `renderAtlasPage` (client `src/atlasclient.js`, layout `src/atlaslayout.js`) | `map {plane: "screens"}` |
| Versions | `src/versionsview.js` `readVersionsView` | `src/versionsview.js` `renderVersions` | `versions` |
| Broadcast | `src/broadcastread.js` `readBroadcast`; the live picture `src/broadcastlive.js` `readLive` | `src/broadcastpage.js` `renderBroadcast`, `renderStarterPage` | `broadcast` |
| Control | `src/controlread.js` `readControl`; its one write `src/admin.js` `runControlAction`; the admin's Plan card `src/plans.js` `planShownOf` | `src/controlpage.js` `renderControl` (the Plan card `planCard`) | — (`whoami` for who you are, and its `plan`) |
| What is missing | `src/holes.js` `computeHoles` over `src/checklist.js` `checklistFor` | `src/holes.js` `renderHoles` | `missing` |
| The Library · What changed | `src/extract.js` `libraryRead`, `changesAnswer` | `src/extractpage.js` `renderLibraryPage`, `renderChangesPage` | `read {kind: "doc"}` · `changes` |
| A card | `src/extract.js` `readAnswer` | `src/cardpage.js` `renderCardPage` | `read {ref: "card/…"}` |
| Impact | `src/impact.js` `impactAnswer`; follow-ups `src/pickup.js` | `src/impactpage.js` `renderImpactPage` | `impact` |
| A preview | `src/preview.js` `readPreviewView` | `src/previewpage.js` `renderPreviewPage` | — (`preview` answers its own text) |
| The front door (at the root) | sign-in `src/accounts.js` `passphraseSignIn`; sign-up `src/accounts.js` `signUp`; an org made `src/orgs.js` `createOrg`; the picker `src/accounts.js` `orgsOfAccount` | `src/login.js` `renderLogin`, `renderNotHere` · `src/signup.js` `renderSignup` · `src/orgpage.js` `renderOrgNew`, `renderOrgMade` · `src/orgpicker.js` `renderOrgPicker` | `whoami` (its `orgs`) |

Each read is also its page's JSON twin; the Tool column names the MCP tool that reads the same data. Every page of an
org lies at `/<org>/…` and every link is built by `src/orgpath.js` `orgPath`; the front door lives at the root. The
knowledge readers they call are in `src/knowledge/` (`ARCHITECTURE.md` §4); the hot SQL is `src/hotsql.js`. Every read
runs on `db(env)` (`src/data.js`) in the reader's org, the org of the sign-in (`ARCHITECTURE.md` §10).

## Scope — one rule, plus the write stamp and the raw session stamp

- **`src/project.js`** — THE rule for a read: a named `project` (a tool argument, `?project=` on a GET twin or on a
  `brain://` URI; a bare slug resolves inside the reader's org) needs a seat (the owner: any active project of the
  org), else the caller's active project (a live stamp or the one seat), else the first project they may read in key
  order. `resolveProject` finds it once at the door (the router, `callTool`, `resources/read`) and carries it on the
  request's env; every reader asks `projectOf(env)`. A non-owner seated nowhere reads the org-level rows in an org of
  several projects, the one project in an org of one, and a Partner reads no project in any org (`NO_PROJECT`, the
  fence).
- **`doorProject`** (`src/core.js`) — the write stamp: a named project checked against the seats (the owner: any
  active one), else a single seat, else the live stamp, else the org's one active project (never for a Partner with no
  seat: refused, and an org-level record such as `ask` lands at the org level); anything else is refused
  `project_forbidden` or `project_required`.
- **`tokenProjectFor`** (`src/core.js`) — the raw session stamp (`tokens.project`, set by `POST /project`), read by
  the file list (`read_file` with no id, `GET /artifacts`). The owner's "All projects" pick writes `'*'`
  into that column, which references `projects(key)`.

Not project-scoped at all: a person's open items (`open_items`; the `loops` table has no `project` column).

## Known faults

- None open. (A `wrap_up`'s answers matching only the old questionnaire's ids was fixed by sprint 5 W1.)

## Auth (keep)

A key is `TOKEN_PREFIX + hex(20)`, stored as `people.key_hash` (sha256) and `pass_hash` (pbkdf2); the key IS the
seat's passphrase. One ACCOUNT per email (`accounts`, `src/accounts.js`): sign-in finds the account by its email,
then its seat in the org the address serves; the password is the account's passphrase (set only by its holder — on
`/profile` by proving it, or by the one-time-code sign-up) or that seat's own secret (an admin's to set, opening that
seat alone). Signing in mints a 90-day session token, stored as a sha256 in `tokens`, carried in the
`__Host-ar_session` cookie; `LOGIN_SESSION_SQL` (`src/accounts.js`) inserts it only if the verified secrets are
unchanged. A read-only credential is derived from the key (`READ_ONLY_SUFFIX`, `src/core.js`); a key in `?k=` reads
and never writes; cookie writes are same-origin checked (`csrfRefused`); sign-in locks after 8 failures in 15 minutes
(`src/accounts.js` `LOCKOUT_FAILS`, `lockOf`; the same lock on sign-up, creating an org and `/profile`), keyed by the ACCOUNT
and the CLIENT (`login_attempts.client`, `migrate-077`: `clientOf`, the caller's address): a client the account's own
passphrase signed in from in the last 30 days is judged by its own failures, every other vantage (a seat secret's, no client)
by the account's failures from everywhere — so a stranger knowing only the email never locks the holder's own client;
plus the `LOGIN_LIMIT` binding (shared by sign-up and creating an org). At the root
the sign-in NEVER defaults an org: a seat-key sign-in and a one-org account go straight in; a several-org account
picks at the picker (`GET /orgs`, `src/orgpicker.js`); a JSON sign-in answers `409 choose_org` and names its org — as
does an account's passphrase while any seat of it waits for its holder's yes (its JSON sign-up then signs in nothing:
the owner's ruling, 2026-10-09); the OAuth form asks a several-org account the same choice (`src/oauth.js`, `src/login.js`). A session proven by the account's passphrase reads
as the account's seat under any of its orgs' addresses, a session proven by a seat's key stays that seat's
(`tokens.account_id`). A seat an admin adds for an email whose account already holds a passphrase or a seat in
another org is PENDING (`people.pending`, `migrate-074`): inert — its key answers 401 — until its holder accepts or
declines it on the picker (`POST /orgs/seat`); the admin's flash says the seat waits, and remove-person withdraws it.
ONE revocation rule: the holder's own passphrase change ends every other session of the account; an admin's seat
action ends only that seat's seat sessions and seat grants (`src/secrets.js`, `src/oauthgrants.js` `{seatOnly}`), and an
admin's reissue (rotate-key, set-password) bumps the seat's grants epoch (`people.reissued_at`): an account grant made
before it stops acting in THAT seat until its holder connects again (`accountGrantStands`).
add-person and sign-up refuse a non-ASCII email (`email_not_ascii`, `src/accounts.js` `asciiEmail`). CREATING AN ORG (`src/orgs.js`, `GET /orgs/new`,
`POST /orgs`): proven by the ACCOUNT's passphrase only, one org per account, its address never a reserved name
(`src/orgnames.js`, derived from the routes; `tools/check-org-names.mjs` is a gate step); the owner key is shown once.
JOINING (sprint 21, `src/requestaccess.js`, `src/accounts.js`): the way in for a new team is `/request-access` (a profile and a passphrase, or Google) → the emailed check → the line → the operator's approval (`operator.mjs allow --request`, or the operator page) and its "You're in" → sign in → `/orgs/new`; an email whose account is held (`ACCOUNT_HELD`) gets "you already have an account" instead. SIGN-UP BY CODE (`src/signup.js`, `GET`/`POST /signup`, the operator's own path and the reviewer accounts'): only an email the OPERATOR allowed, with the one-time code the operator hands over by hand (`tools/operator.mjs allow`, on the deployment's credentials — no app seat mints one; only the code's sha256 is stored, `signup_codes`; single-use, expiring, revocable); it creates the account, gives a passphrase-less account its passphrase, or — the operator's `--reset` — replaces one and ends every session of every seat; every refusal is one answer (`invalid_signup`) and counts in the account's lockout, and a valid code passes the lock (the operator's code is possession proof); an account passphrase is at least 12 characters, a seat's own secret at least 4. A browser navigation without a session goes to sign-in; anything else is 401. The sign-in sets the request's
org: the org of the people row the credential found (`src/data.js` `signIn`); one request, one org. OAuth for MCP
clients keeps its grants in KV `OAUTH_KV`, keyed by person, scopes `mcp:read` and `mcp:write`; a grant is an ACCOUNT's
(its own seats, one org a call: `orgSlug`) or a SEAT's (`src/oauthgrants.js`), and a grant with no credential stamp
answers 401. The admin is
`people.role = 'owner'` of its own org; an org never has zero admins. A public file read by its exact id answers from
any org (ADR-055, ruled kept while sign-up is allowlisted, `PLATFORM.md` §2.7); every list stays inside the org.

## Hooks

Crons `0 3 * * *` and `0 15 * * *` (`wrangler.jsonc`) → `src/cron.js`, each step once per org (at most 20 orgs a run):
the reports backfill, the backup dump of the org to R2 `o<org>/backups/d1/` (`src/backup.js`: every table `boot.sql`
creates is dumped, rebuilt on restore, or never dumped with its reason; people without credentials) and the prune of
expired previews. R2 otherwise holds only blobs, every key under its org's `o<org>/` (`src/storage.js`): saved files
under `inbox/artifacts/`, wrap-up reports under `inbox/handoffs/` and the render bodies `renders/<project>/<sha256>`.
Outbound: the GitHub issue a `wrap_up` may open (`src/handoff.js`, only when `GH_TOKEN`, one for the whole worker, is
set and the org row's settings name a `handoffRepo`). Inbound webhooks: none.
