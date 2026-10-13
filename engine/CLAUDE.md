# engine/ — the product (the worker)

ONE Cloudflare worker, with ONE D1 database and ONE R2 bucket, serves many orgs: the app (eight tabs), the REST API and
the MCP door. What happens in an org stays in the org (`docs/plan/ARCHITECTURE.md` §10). The plan and the process are
at the repo root: `AGENTS.md`, then `docs/plan/`.

## The layout

- `src/index.js` — the router: `CAPABILITIES` (the REST rows), `MCP_TOOLS` (the tool registry), the route tables
  (`{ test, run }` rows), `servePage` (wraps a page in the shell).
- `src/mcp.js` — the MCP door, both revisions on one endpoint (2025-06-18 with its handshake, 2026-07-28 per request):
  `callTool` (owner/scope checks, the project scope) and `runTool` (one case per tool).
  One function per tool and its REST twin beside it: `src/updates.js` (`updates`, over `src/thread.js`),
  `src/openitems.js` (`open_items`), `src/ask.js` (`ask`), `src/handoff.js` (`wrap_up`), `src/docread.js` (the docs a
  reader may read: the start-here guide, the Library, one doc, a role's brief).
- `src/accounts.js` · `src/signup.js` — accounts (sprint 7): one account per email, a seat per org; sign-in finds the
  account, then its seat in the org the address serves; the account passphrase is its holder's alone (a seat's own
  secret is an admin's, opening that seat only); sign-up by the operator's allowlist and one-time code
  (`tools/operator.mjs`, the deployment's credentials); sprint 12 (12.3): an org's admin's ONE-TIME INVITE LINK (Control's Invite,
  `src/admin.js` mintInvite; `migrate-079`'s `seat_invites`, only the token's hash kept, the token in the link's fragment) lets the
  invitee choose their own passphrase at `/signup?via=invite` (`src/invite.js`, `src/accounts.js` THE INVITE LINK) for an account
  new in all but name — marked with that org (`accounts.invited_org`), which alone it reaches: it creates no org (the waitlist)
  and answers no other org's seat until the operator's code confirms the email. `src/orgs.js` · `src/orgpage.js` · `src/orgnames.js` — creating an
  org (POST /orgs): an account holder, proven by the ACCOUNT's passphrase, makes the org, its owner seat and its first
  project in one batch, one org per account; an org's address (its path name) is never a name the platform uses, the
  reserved list DERIVED from the route registry (`tools/check-org-names.mjs`, a gate step).
- `src/orgpath.js` — THE address (sprint 7, 7.4): each org at `/<org slug>/…` for every page, the platform's own doors at the
  root (`PLATFORM_PATHS`). `src/index.js` routeRequest resolves the path's first segment ONCE (`installAddress`): under an org's
  address only that org's people sign in (a bearer of its org, a browser session as its seat there), and anything else is the
  one 404; at the root a cookie signs no one in (a page navigation is sent to the session's org; `/mcp` keeps its own seat rule).
  Every URL the worker builds goes through `orgPath(path)` / `orgUrl(origin, path)` (the request's org base, carried by
  AsyncLocalStorage, the nodejs_als compatibility flag in wrangler.jsonc); a page's scripts use its client twin. `tools/check-org-paths.py` (a gate step)
  fails an app path written outside it.
  `src/oauthgrants.js` — the two OAuth grant kinds (7.5a): the ACCOUNT's passphrase makes an ACCOUNT grant (the account's own
  active seats, one org a call: every tool takes `orgSlug`, src/index.js ORG_ARG; the request signs in as the account's seat in
  that org, src/core.js resolveReader), a seat's own secret a SEAT grant (that seat alone: the shape of every grant before 7.5a).
  Any other org is `org_unreachable` before a call runs (src/mcp.js orgArgRefused); whoami lists the orgs.
  `src/orgpicker.js` — the org picker (7.4b, `GET /orgs`): an ACCOUNT session in several orgs picks one after a root sign-in
  (a seat session and a one-org account go straight in); the rail's org switcher lists the same account's orgs. A page at the
  root before a sign-in wears the platform's brand (sharingu), the sign-in from an org's address that org's; the one not-here
  answer is a page in the platform's brand (`src/login.js renderNotHere`).
- `src/requestaccess.js` · `src/requestpage.js` — request access (sprint 21, `migrate-081`'s `access_requests`, a platform table:
  no org): POST /request-access, public, reads the profile strictly (`readRequest`), files ONE open request per email and answers
  a 303 to its private link `/request-access/<token>` (only its hash kept); the first request stands: a repeat changes nothing and
  goes to `/request-access/asked`; the honeypot gets a link that opens nothing; nothing reads accounts. `src/beta.js` — the beta's 50 places,
  the ONE source of the cap and its two counts (`tools/operator.mjs` imports it; the worker reads it by `src/accounts.js betaCount`).
- `src/data.js` — THE scoped data layer (sprint 6): every statement runs on `db(env)`; `{org}`/`{orgbucket}` tokens
  take the signed-in reader's org (a validated integer, from the sign-in only — never a parameter); no token and no
  sign-in is refused loudly (org unknown), never org 1. `tools/check-scoped-data.py` (a gate step) fails any statement outside it.
- `src/storage.js` — THE storage keys (sprint 6, 6.4): every R2 object lies at `o<org>/<key>`, the reader's org (a file read
  by its exact id: its row's); a key with no org prefix is no org's, org 1's included (the sprint-6 ship moved org 1's with
  `tools/ship/r2-org-keys.mjs`). The same gate step fails the raw bucket or a key spelled outside it. `src/cron.js` — the cron,
  every step once per org as the deployment for that org (`platformEnv`), a bounded window of orgs a run.
- `src/wellknown.js` — the platform's OpenAI domain verification (sprint 11, 11.3): GET /.well-known/openai-apps-challenge
  answers the token the operator stored under one key of OAUTH_KV (`tools/operator.mjs set-openai-challenge`), as plain text,
  before the address or any sign-in, with no D1 read; none stored is the ordinary 404. One per deployment, never an org's.
- `src/plans.js` — the org's plan (sprint 8): the ruled limits read, every write's `checkPlan`, the door's call
  counter (`countCall`, `org_usage`), the warning slot every answer carries, and `planShownOf` (Control's card,
  whoami's `plan`). The suspension check rides the org's resolve in `src/index.js`.
- `src/project.js` — THE project rule: which project a request reads, found once at the door (`resolveProject`) and
  carried on the request; every reader asks `projectOf(env)`.
- `src/core.js` — auth (`authenticate`, `resolveReader`), the write stamp (`doorProject`), the ledger
  (`fileTransmission`, `decideTransmission`).
- `src/client.js` — which AI filed a contribution (sprint 13, `migrate-080`'s `transmission.client`): ONE family word
  (claude, claude-code, chatgpt, codex, web, api, other), by its order of trust — the OAuth client's registered name, then
  the MCP clientInfo, then the door — a self-declared label, never the raw string.
- `src/tenant.js` — the org's own facts (name, brand, home project, settings) from its row of `org` (one row per org).
- `src/knowledge/` — the knowledge core: `schema.js` (validators), `write.js` (the write door), `store.js` (the generic
  reader) and one reader per kind beside it (`goals.js`, `decisions.js`, `canvas.js`, `screens.js`, …);
  `grades.js` the only writer of a check's grade.
- `src/shell.js` · `src/ui.js` · `src/parts.js` — the left rail and its eight destinations, the ONE token set for both
  worlds (Paper and Ink, semantic names: pages use those, never a raw colour), the one stylesheet and the shared page
  parts. `src/markdown.js` draws markdown; `src/docpage.js` is one of the project's docs as a page.
  `src/fonts.js` serves the self-hosted faces (`tools/make-fonts.mjs` builds `src/fontdata.js`, the MCP App card's cut faces
  from `assets/fonts/card/` included: `tools/make-card-fonts.py` cuts them, the card inlines them as data: fonts); `tools/shots.mjs`
  screenshots the local app in both worlds.
- `tools/client-drive/` — drives a desktop AI client on the Mini (the ChatGPT app, the Claude app, Claude Code) through
  `listing/test-cases.md` as one reviewer account, and records it (sprint 21; its README: the owner's one-time sign-ins,
  the verbs, the traps). Screen verbs run inside the Mini's Terminal, which holds the Screen Recording grant.
- `src/knowledge/schema.js` (`KINDS`) and `src/shapes.js` — the two registries (the kinds, the contribution shapes);
  `src/formats.js` answers `formats` from them and generates the item schemas of `preview` and the three write tools
  (`file_contribution`, `save_knowledge`, `remove_knowledge`; `WRITE_TOOLS`, sprint 19).
- `src/preview.js` · `reach.js` · `previewtext.js` · `previewpage.js` · `previewcard.js` · `confirm.js` — preview, then
  each part's write tool: the plan without a write, what the items reach, the terminal text, the page, the card (the page's summary and
  the chat's `ui://sharingu/card`), the confirm (a write tool's `fileOnConfirm: true`, MCP elicitation: on a stream, or an
  "input required" answer and its retry).
- `src/transmission.js` — a contribution's grade at the door (the lane gates, the proof rule); `src/maprefs.js` checks
  the ids it names against the project's own Map.
- `src/checklist.js` — the checklist and its meter: the registry's items measured over `migrate-050`'s `k_fill`;
  `src/holes.js` answers `missing` and draws What is missing from it; Home and each tab's chip read it.
- `src/extract.js` · `extractpage.js` · `cardpage.js` — `search`, `read`, `changes`, `brief`, the Library and a card's
  page; `src/tablists.js` lists a card kind on the tab it names.
- `src/impact.js` · `impactpage.js` · `pickup.js` — impact, stale marks, pick-up and follow-ups.
- `src/archview.js` · `archclient.js` — the Architecture view: the layered diagram, its motion and Play. The page
  ships `src/archclientdata.js`, GENERATED from `archclient.js` by `tools/make-arch-client.mjs` (esbuild, whitespace
  only); never edit it — change the source and regenerate (the gate fails on drift).
- `src/render.js` · `wireframe.js` — renders: the sanitiser, the size limits, the wireframe grammar.
- `src/hotsql.js` — the hot SQL, one statement per screen region; `src/week.js` the week's one read (Home and Build).
- `src/backup.js` — the backup: which of the org's rows leave D1 and the rule placing every table; `src/measures.js` —
  the beta measures on Control · Admin and their export.
- One file pair per screen: a read and a renderer.
- `migrate-0NN.sql` — the migrations, expand then contract (below); `boot.sql` is a fresh database's schema and must
  carry every migration.
- `tools/` — scripts and selftests; `tools/import/` the importer, `tools/ship/` the ship's own scripts, `tools/walk/` the
  walk's sample input; `tools/make-plugin-skills.mjs`, `make-listing-docs.mjs` and `make-reviewer-org.mjs` (sprint 9: the
  plugin's skills and its version, the listing's docs page and the stores' reviewer org — the first two gate-checked for drift,
  the third by its selftest; sprint 11: the plugin's Codex manifest `plugin/.codex-plugin/plugin.json` and its images, made by
  the first from `listing/codex-listing.json`, `listing/SUBMISSION.md` and `listing/test-cases.md`, and `--openai-zip`, the
  OpenAI submission ZIP, `tools/plugin-codex-selftest.mjs` its proof). `contracts/` (repo root) — the door's contract, generated.

## The local app

```
sh tools/dev-local.sh up     # the local app with real data (org dev-local; every project imported through the MCP)
sh tools/smoke.sh            # the per-slice proof on a fresh worker: MCP write -> read -> the tabs
```

Nothing local reaches Cloudflare. The suites (`sh evals.sh`, `sh sims.sh`, `sh tools/tabs-verify.sh`,
`sh tools/verify-live.sh`) each start a fresh local org as the smoke does and file their fixtures through the door;
`--live` is the explicit opt-in and calls `tools/cf-budget.sh` first.

## Ship (sprint end only, with the owner's OK)

`sh tools/ship-plan.sh ryuklabs [--no-import]` prints this ship's order, read-only (`--no-import`: a ship with no import
hook — the projects' data is not on the platform road). `sh tools/cf-budget.sh`, then `sh tools/ship.sh ryuklabs` — the
ONE deploy command, resumable by its run record (`engine/.runs/ship/`, keyed by what ships; a rerun says what it
reused): the gate by exit code; live's schema level and its org names checked against this code's reserved names
(`tools/check-org-names.mjs --slugs`) BEFORE the upload; a version upload with no traffic, a smoke on the preview URL, the cross-org suite on the preview (`tools/attack-xorg.mjs --url`: two
throwaway orgs restored, walked both ways, deleted — never org 1), the walk on the preview (`tools/live-walk.mjs --preview`,
as the suites' org), 10%, 100%, and a rollback on any failed smoke. During the canary mix the OLD version's share enforces no sprint-8 limit (the migrations land before the code by design): brief, and over at 100%. Never a bare
`wrangler deploy` on the live worker (only a second platform's first deploy is plain, inside `tools/new-org.sh`, `ORG-SETUP.md`).
Undo: `sh tools/ship.sh rollback [<version-id>]` (it refuses while migrate-068's triggers stand: their down script
first). The operator's tools run on the deployment's credentials, never through a seat: `tools/operator.mjs`
(allow / list / revoke an email's sign-up code, remove-account; sprint 8: list-orgs with each org's plan and usage,
set-plan, raise — a NAMED plan row, never free's or team's ruled numbers — and suspend / unsuspend, one reversible 403
at the org's resolve; sprint 11: set-openai-challenge / clear-openai-challenge, the platform's one OpenAI domain-verification
token in the deployment's KV, answered at `/.well-known/openai-apps-challenge` by `src/wellknown.js`; sprint 12: allow counts the
beta's 50 places — `BETA_ORG_CAP` (`src/beta.js` since sprint 21), the owner's one number: the outside orgs that stand plus the allowed emails with an open code and
no org yet — and refuses past them unless `--beyond-cap`; list and list-orgs say the count at their head; the worker does not
enforce it) and `tools/org-undo.mjs` (one org's export, restore,
verify, delete). Credentials: `set -a; . ~/.sharingu/env-sharingu.sh; set +a` (a bare
`wrangler` hangs on a login prompt).

Migrations are expand then contract (below) and applied one at a time with `sh tools/migrate.sh <file>` (a D1 Time
Travel bookmark first), rehearsed first with `sh tools/migrate-dryrun.sh ryuklabs-agent-r --from <NNN>`. `ship.sh`
never runs one.

## Long runs leave a trail (resumability — the sprint-6 ship's two reboots taught it)

- **A long run writes its record BEFORE it acts**, so a restart resumes instead of re-paying: the preview attack's
  per-run orgs record under `engine/.runs/ship-xorg/` (then `--cleanup <run dir>` finishes a killed run),
  `org-undo.mjs`'s run record and refusing delete,
  `tools/ship/r2-org-keys.mjs`'s state file (idempotent copy, delete only after a fresh complete verify), a
  builder's `engine/.runs/<name>/PROGRESS.md`, and `docs/plan/HANDOFF.md` at every stop.
- **The restart drill:** read the newest run record under `engine/.runs/`, clean what it names, resume from
  `HANDOFF.md`'s order. A milestone is only reused when its key still holds (the same uploaded version id; for
  `ship.sh`, the same SHIPPED content — `engine/` and `contracts/` as committed — so a HANDOFF edit mid-ship keeps the
  resume, and a reused gate still re-runs the docs gate) — never "step N was done". `ship.sh`'s run record lies under
  `engine/.runs/ship/`; a rerun says what it reused.
- **Never edit a script a running ship is executing** (or a tool it will spawn later in that run): the shell reads
  incrementally and node reads at spawn — land such changes between runs.

## One database, every org (the rules)

- **A migration is expand then contract**, always: nothing renamed or dropped in the step that adds. Its header says
  whether it lands BEFORE or AFTER the code (`migrate-067` before; `migrate-068` and `migrate-069` after).
- **Time Travel is a platform incident tool**: it restores the WHOLE database, every org. One org's undo is the per-org
  restore, `node tools/org-undo.mjs` (plan, export, restore, verify, delete) on the deployment's credentials.
- **The canary reaches every org**, so the preview runs the cross-org suite and the walk before any traffic moves.
- **A preview hook writes live data only for the org it was started for.**
- **A migration's dry run uses a copy holding at least two orgs** (`migrate-dryrun.sh` adds one to a copy of one).
- **One org never blocks the rest**: the per-screen row budget (`node tools/page-budget.mjs`) and a rate limit per org
  (sprint 8's, `docs/plan/PLATFORM.md` §4).
- **Before the waitlist opens**: the per-org restore rehearsed on live, the attack suite green on live, and the privacy
  page saying who can reach a hosted org's data.
- **The wall is in the gate**: `tools/check-scoped-data.py` fails a statement or an R2 key outside `src/data.js` and
  `src/storage.js`; `tools/attack-xorg.mjs` walks every tool, resource and route as one org against another.

## Scars worth keeping

- **The D1 free tier is a daily budget** (5M rows read, 100k written, shared by everything on a free account). One day of
  ~15 full suite runs exhausted it and every authenticated page 500'd until 00:00 UTC. Full suites are a sprint-end
  signal, not a loop; a 1101 on authenticated pages with a green `/health` means check the quota first.
- **Contribution ids past 999 in one day collided** (the next id was read in text order) and every filing failed until
  midnight; `migrate-049` and the fix order by length first.
- **A probe on a non-covering index loses to a covering primary-key range:** the nav-to probe read 7,282 rows until
  `INDEXED BY`. A trigger's "before" term needs `IS` wherever a column may be NULL.
- **Never chain a deploy behind a grep** (`gate | grep && deploy` once shipped a red gate).
- **Suites run one at a time**, never concurrently, never in the background.
- **An auth change gets an adversarial read before it ships.**
- **Every row a suite files is eval-marked** (`isEvalMark`), so real screens never show test data.
- The cookie is `__Host-ar_session`; cookie writes are same-origin checked (`csrfRefused`). It signs in only under an org's
  address (sprint 7, 7.4): a test or tool that sends one goes to `/<org>/…` (`tools/shots.mjs --cookie` does).
- **Wrangler's SQL splitter misreads two shapes** (sprint 6, migrate-067): a quoted string holding two dashes (`'--'`)
  reads as a comment opener — write `char(45, 45)` (and the GLOB class `[-][-]`) instead; and a CASE closed by `END)`
  merges every statement after it into one (SQLITE_TOOBIG on a fresh seed) — close it `END )`, as the older triggers'
  `END ,` is the same scar. `tools/check-boot-schema.py` fails the second pattern from migrate-067 on.
- **A top-level `await` in a module a smoke case imports reorders the cases** (s37 ran before s36b until it was
  removed): a smoke module does its async work inside its cases, never at import time.
- **A script's "am I run directly" check compares REAL paths** (macOS keeps var under a private symlink: an
  argv-vs-import-url string compare silently never runs the CLI).
- **An outer statement's ON CONFLICT clause overrides every legacy OR algorithm inside a trigger it fires** (SQLite):
  the door's upsert turned a trigger's `INSERT OR IGNORE` into a plain INSERT, and a node changed while its check was
  already stale failed the whole batch — ON LIVE ONLY, because a fresh org holds no stale row at import time
  (migrate-066). A trigger's insert must be an explicit upsert (`ON CONFLICT … DO NOTHING`), never `OR IGNORE`.
