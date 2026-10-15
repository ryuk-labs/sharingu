# HANDOFF — where sharingu stands (rewritten at every stop; git holds the history)

**As of 2026-10-15: sprint 21 (onboarding) is SHIPPED** — `d5423ee3-e21f-4679-b276-c2b340e847a0` at 100% (tag
080f1178f; rollback target `850b262c`), D1 at migrate-081. The first ship's red was investigated (A.1: the 500 a platform
transient; 102 plan_limit answers a suite bug, fixed in ryuk-labs/sharingu#9), the re-run went green, and A.3, A.4 and A.6
are done (the Google client stored, the walk 13/13, verify-live 28/28, the site's buttons live). **Left: A.5, the first
real emails, which needs the owner's inbox (the recipe below is corrected: ryuk@ryuklabs.io holds a REAL account). Then
the owner submits the Claude forms (their ruling: only after block A is done).**

This file is the whole memory. A session on any Claude account starts here, needs nothing from a previous session,
and must not trust its own memory over this file. Read, in order: `README.md` (the model, how we work) → this file →
`PLATFORM.md` (the road; §3 is THE one list of open items) → `AGENTS.md` at the repo root (the process, the commands,
the laws). `SPRINTS.md` holds every slice's record; `MARKETPLACE.md` the store road; `listing/SUBMISSION.md` the forms.

## RESUME HERE — the order of work

**0 · Orient (five minutes, read-only).** From the repo root: `git branch --show-current` (expect `main`; sprint 21 is
merged, there is no open sprint branch), `git log --oneline -4`, `git status --short` (expect clean), `uptime` (load under
8 before anything heavy: bunny's simulators share this Mini). Read `SPRINTS.md` sprint 21 (every ruling) and this
block, then tell the owner where things stand in two lines.

**A · Finish sprint 21's ship (the owner's OK for all nine steps was given 2026-10-14; the ruling on the red: investigate
first). DONE except step 5.** Done: (1) PR #8 merged; (2) `cf-budget` and `migrate-dryrun --from 081` green; (3) `migrate.sh
migrate-081.sql` on live — its UNDO is `npx wrangler d1 time-travel restore ryuklabs-agent-r
--bookmark=00001040-00000000-00005104-0ccac1ab91be2c195274f064b1c6007f` (the WHOLE database: never without the owner);
every 081 table, index, `accounts.google_sub` and the triggers verified on live; (4) live's slugs (ryuklabs, suites,
sharingu-review) hold no reserved name, the grants check names only three old eval seats. What is left:
   1. **The 500 — INVESTIGATED 2026-10-15: not reproducible, no exception recorded; but the suite run had a SECOND red.**
      (a) The 500 (`fivexx.json` under `engine/.runs/ship-xorg/1b31a817-…/`: org 5's owner · `changes
      {"eval":true,"projects":["desk","shop"]}`, 2026-10-14T15:46:11Z). Without `org`, `changesAnswer` ignores `projects`:
      the call is the plain `changes {eval:true}` that passed moments before in the same walk. Replayed on the same preview
      on two fresh throwaway orgs built and seeded as the suite builds them, with the people plant (machine-local
      `engine/.runs/repro-500/repro.mjs`): 340 `changes` calls (the exact one 60 times serially and 120 times eight at a
      time, the single-project variants as both owners): 340 × 200, 0 5xx; both orgs and their four accounts removed by
      `attack-xorg --cleanup` (0 left, checked on live). Cloudflare's analytics (GraphQL `workersInvocationsAdaptive`,
      2026-10-14 12:00–20:00) count version 1b31a817 at 11,676 invocations, ALL `success`, 0 errors: the worker recorded
      no exception. Read: a transient at the platform edge, not our code. (b) THE SECOND RED, missed on 10-14: the same run
      had **102 `plan_limit` answers**, the first `POST /auth/google/start 429` — and `runPreview` fails on any. Sprint
      21's `/auth/google/start` (GET, POST) and `/auth/google/link` spend the address's LOGIN_LIMIT budget first
      (`addressFlooded`, src/index.js), but they are NOT in attack-xorg's `SKIP` (the account-flow routes are), so the
      route walk spends the budget and every later flood-checked call answers 429. Only the preview mode counts a 429, so
      local runs stayed green. A re-run as-is goes red again. THE FIX — BUILT AND PROVEN 2026-10-15 on `sprint-21-fix`, its
      PR waiting on the owner's merge OK: `/auth/google/start` and `/auth/google/link` join `SKIP` (covered by smoke s69
      and `tools/google-selftest.mjs`; the callback spends nothing and stays walked). The proof, the preview mode against
      a LOCAL worker (`sh tools/r-local.sh up xorgfix --port 8850 --project shop=Shop`, then `node tools/attack-xorg.mjs
      --url http://127.0.0.1:8850 --local ~/.sharingu/r-local/xorgfix/persist --config
      ~/.sharingu/r-local/xorgfix/wrangler.local.jsonc`, 77 s): main's suite RED (240 plan_limit, the first `POST
      /auth/google/link 429`, and 3 browser sign-ins refused for the spent budget); the fix GREEN (11,276 calls, 0
      findings, 0 5xx, 0 plan_limit). Smoke 371/371, `sh gate.sh` green. After the merge (check its state, then `git
      checkout main && git pull --ff-only`): step 2 on the new `main`.
   2. DONE 2026-10-15 (03:38–05:49 UTC, `engine/.runs/ship-sprint21.log`): ✓ SHIPPED, `850b262c` → `d5423ee3`; the
      cross-org suite 11,276 calls, 0 leaks, 0 5xx, 0 plan_limit (5,790 s). The recipe for a next ship stands: in the
      background, the load gated INSIDE the command, never across 03:00/15:00 UTC; a quiet log is not a stall (watch
      `attack-xorg.mjs`'s CPU time and its ESTABLISHED socket); a tail sees nothing of a preview (Traps).
   3. DONE: the Google client stored for both domains (`operator.mjs set-google-client --file ~/.sharingu/google-oauth.env
      --live --config wrangler.jsonc --confirm-live ryuklabs-agent-r`; never print the file); `/auth/google/start` 302s to
      accounts.google.com, /login shows the button.
   4. DONE: the live walk 13/13 on agent.ryuklabs.io, `sh tools/verify-live.sh --live` 28/28.
   5. **OPEN — the first REAL emails (needs the owner's inbox; run as the owner's MCQ of 2026-10-15 says: ryuk@ first for
      the "already" email, then the plus address).** CORRECTED 2026-10-15: ryuk@ryuklabs.io holds a REAL
      live account with a seat (the owner's), so a join with it only gets "you already have an account", and
      `remove-account` on it would delete the owner's account — NEVER. For the full flow use a fresh plus address on the same inbox
      (ryuklabs.io is Google Workspace: `ryuk+beta1@ryuklabs.io` lands in ryuk@'s inbox; the per-mailbox limit counts it
      as ryuk@: three a day). The owner joins on https://agent.sharingu.xyz/request-access with it (the verify email
      From hello@sharingu.xyz), clicks the link and confirms with the passphrase; then `node tools/operator.mjs requests`
      and `allow --request <id>` (both `--live --config wrangler.jsonc --confirm-live ryuklabs-agent-r`: the operator's
      FIRST live REST send) → "You're in"; then `remove-account --email ryuk+beta1@ryuklabs.io` so it holds no beta
      place. Check the new-request alert reached ryuk@ (cc; acie@ only once her destination is verified). If the verify
      email never arrives, Cloudflare's sending may refuse an unverified recipient: check the send's answer before
      anything else.
   6. DONE: the site's `main` at 72d8ebe (journey-polish merged with A.6: every "Join the beta" →
      `https://agent.sharingu.xyz/request-access?from=site`, `/waitlist` a 307 there, waitlist.html and its form retired,
      the docs tell the join flow; the full verify 246/246 at the push); live checked. Left for the owner on the site:
      `api/inquiry.js` and `server/` now serve no page (retire or keep), leftover form CSS and two lines of copy (the
      consent card's "form contents", privacy's providers paragraph naming the retired intake) — the site's HANDOFF.
   Recorded in `SPRINTS.md` sprint 21. After step 5: the owner submits the Claude forms (step 3 below).

**1 · Ship sprint 14 — DONE 2026-10-12** (`64aad029` at 100%; the steps below are the ship's recipe for the next one). What it ships: four tool descriptions that
said "call this first" now say when a tool is useful (`whoami`, `updates`, `missing`, `impact`: the stores' reviewers
reject descriptions that instruct the model), the plugin manifest's `displayName` and `repository` (plugin 0.1.11), and
the kit's gaps in `listing/SUBMISSION.md`. No migration. Proofs on the branch: every selftest, smoke 327/327, the gate,
evals 42/42, sims 10/10, tabs-verify 40/40 (on 5da011add); the follow-up description commit re-proved by smoke and gate.
The ship, from the repo root, each step only when the one before is green:
   1. `set -a; . ~/.sharingu/env-sharingu.sh; set +a` (in every shell that pushes, calls `gh` or touches live)
   2. `git push -u origin sprint-14`, then `gh pr create --repo ryuk-labs/sharingu --base main --head sprint-14 …`
      (body from a file), then `gh pr merge <n> --repo ryuk-labs/sharingu --merge`; check it merged BEFORE anything else
      (`gh pr view <n> --json state`); then `git checkout main && git pull --ff-only`
   3. from `engine/`: `sh tools/ship-plan.sh ryuklabs --no-import` must end "✓ the plan is complete" (the import hook
      stays off: the projects' data is not on the road, and its measures are stale by design)
   4. `sh tools/cf-budget.sh`, then `sh tools/ship.sh ryuklabs` in the background with its output to a log. It runs
      30–60 min (the cross-org suite on the preview is the long, QUIET part). Watch the suite process's CPU time and
      its socket, not the log (see Traps). It promotes 10% → canary → 100% or rolls back by itself.
   5. after "✓ SHIPPED": the live walk and verify-live (both commands under Traps), then record the ship in
      `SPRINTS.md` sprint 14 and in this file (the new version id, the rollback target), commit, push.

**2 · Refresh the live reviewer world — DONE 2026-10-12.** Org 3 rebuilt on sprint 14's code with `--reissue` (the
seven accounts sign in and read as their roles and hats may; the walkthrough's loop stands); the seven new codes live only
in `~/.sharingu/reviewer-credentials.txt` (mode 600). `listing/test-cases.md` walked on live, 8/8 green
(`node tools/listing-walk.mjs --url https://agent.sharingu.xyz --codes ~/.sharingu/reviewer-credentials.txt`); it left
two notes and the goal `walk-20261012-yes` in the Sample project, as a reviewer's walk would. NEVER refresh again once a
code is in a store form (every code resets and the reviewers are logged out). The recipe for a next refresh: from
`engine/`, credentials sourced, load under 8, `umask 077; node tools/make-reviewer-org.mjs --url
https://agent.sharingu.xyz --live --config wrangler.jsonc --confirm-live ryuklabs-agent-r --reissue >
~/.sharingu/reviewer-credentials.new 2> .runs/reviewer-refresh.err`, count 7 `code:` lines (never print them), move the
file over the old one. If it refuses "no rows-written measure holds" (the source changed since the last measure: any
sprint that touches `contracts/door.json` or the code), take a fresh one first on a throwaway local org:
`DEV_SLUG=measure14 DEV_PORT_BASE=8860 DEV_PROJECTS=sharingu sh tools/dev-local.sh up`, then `down` (17,028 rows on
2026-10-12), and change nothing in the tree until the refresh lands.

**2b · Ship sprint 15 — DONE 2026-10-12** (`16560e8d` at 100%; the site's install line live; ryukdev/sharingu
archived, private).

**3 · The owner's, then M4.** In this order: (a) DONE 2026-10-12: the public plugin repo `ryuk-labs/sharingu-plugin` synced
to 0.1.12 (6de6c0e; `--sync-check` green, 28 files; installs as 0.1.12 on a clean config; the recipe is step 6 of
`sh tools/ship-plan.sh ryuklabs --no-import`); (b) connect `https://agent.sharingu.xyz/mcp` as a custom connector in Claude, run P1–P3, and check the
Activity row of P3's filing reads "from Claude" (if it reads "another client", stop: the label needs a fix first);
(c) for ChatGPT: store the portal's domain token (`node tools/operator.mjs set-openai-challenge --token <it> --live
--config wrangler.jsonc --confirm-live ryuklabs-agent-r`), record the ChatGPT demo video and put its URL in
`listing/codex-listing.json` as `demoRecordingURL`, then regenerate (`node tools/make-plugin-skills.mjs`) and build the
ZIP (`--openai-zip <out.zip>`); (d) DONE 2026-10-14: the five videos on YouTube (the links and the channel in `listing/SUBMISSION.md`, The videos); (e) submit from `listing/SUBMISSION.md`: the Claude connector, the Claude plugin, the
ChatGPT plugin. The stores' pages were re-read on 2026-10-12; re-read them again on the day (sources at the foot of
`MARKETPLACE.md`).

**4 · After M4:** M5 (answer reviewers, launch). The platform's hardening rows still marked S9 in `PLATFORM.md` §3 are
the owner's to open; any time: the beta invites, the allowed emails, the go for the first outside org.

## State (2026-10-15)

- **Live (2026-10-15): sprint 21.** Worker `d5423ee3-e21f-4679-b276-c2b340e847a0` (tag `080f1178f`) at 100% on
  https://agent.sharingu.xyz and https://agent.ryuklabs.io; D1 at migrate-081. Undo: `sh engine/tools/ship.sh rollback
  850b262c-b788-4844-92f0-f023a2fd25d3` (code); the 081 bookmark under block A (data; it restores EVERY org). Proofs: the
  walk 13/13, verify-live 28/28. The Google client stored; the request page, the showcase and the account flow live.
- **The owner's open items, outside the repo:** (a) acie@ryuklabs.io clicks Cloudflare's "verify email address" mail
  (until then the new-application alert reaches only ryuk@ in cc and hello@'s forwarding cannot deliver to her);
  (b) Cloudflare dashboard -> sharingu.xyz -> Email -> Email Routing -> Get started (accept its root MX/SPF records),
  then Routing rules -> Custom addresses -> `hello` -> Send to an email -> acie@ryuklabs.io (the token has no Email
  Routing permission); (c) YouTube Studio: turn off the automatic captions on the five walkthrough videos (they play
  over our burned-in captions and misspell the names); (d) A.5's emails (block A, step 5); (e) AFTER block A: the Claude connector and plugin forms (step 3).

- The OpenAI domain-verification token answers on both domains.
- **The repo:** `ryuk-labs/sharingu` (private) from 2026-10-12, one root commit (6e6918541: the tree of the old repo's
  `main` at 22ed264d0, sprint 14 shipped); `main` = that commit plus sprint 15 (ryuk-labs/sharingu#1, b07cba466). The old
  repo `ryukdev/sharingu` is the `archive` remote (everything before; archived on GitHub, private).
  Rein (`reindev3`) is a `ryuk-labs` org ADMIN, so admin on both repos (the owner's call, 2026-10-12: fine for now,
  changed later on github.com, org People). The plugin's dist repo moved to `ryuk-labs/sharingu-plugin` (a transfer:
  the old path redirects). `engine/.runs/` is machine-local (gitignored): the ship
  logs, the video recorder (`engine/.runs/b12-videos/`: `record.mjs`, `compose-take.sh`, `sweep-take.sh`, `join.sh`).
- **The site** (www.sharingu.xyz, repo `RyukLabs/sharingu_web_fe`, Vercel deploys `main`): `main` at 72d8ebe (2026-10-15: Join the beta → the app's request page, `/waitlist` a 307 there, the waitlist form retired; before it a3b43ec, the walkthrough from YouTube in place): the install line naming
  ryuk-labs/sharingu-plugin, the walkthrough section `docs.html#walkthrough` (five videos: video 5 first, the ChatGPT test cases beside the live app, 4:34 at 1920×1080, the OpenAI submission's demo), the tools page at sprint 19's
  contract (37 tools). Its tools page matches the engine's contract (`npm run check:mcp-tools`).
- **The plugin:** this tree 0.1.12 (`claude plugin validate --strict ./plugin` passes); the public dist repo 0.1.16 (in sync; a team member on a plugin older than 0.1.15 updates: it still names `file`).
- **The live reviewer world:** org 3 at `/sharingu-review` (rebuilt 2026-10-12 on `@review.sharingu.xyz`: the OpenAI
  portal's reviewer credentials and its connection use these), seven active seats (admin, member, dev, bd, marketing,
  tester, partner), the sharingu and Sample projects; its sharingu data from sprint 14's code (refreshed 2026-10-12). The codes
  live only in `~/.sharingu/reviewer-credentials.txt` (mode 600).
- **The listing kit:** `listing/SUBMISSION.md` (every form's fields, the release notes, allowed link URIs),
  `listing/test-cases.md` (5 + 3), `listing/carousel/` (four card PNGs, retaken 2026-10-12), `listing/icon/`,
  `listing/videos/` (four walkthroughs: 63 s, 55 s, 56 s, 53 s, H.264 1280×800, captions only).
- **Both domains are in `engine/wrangler.jsonc`** (`routes`): the ship's triggers deploy detaches any Custom Domain
  not listed there; never attach one by hand alone.
- **Beta is green** (`BETA.md`). Active people on live: Acie, Dr Vasu, Rein, Tyag, Ryuk, Agent Ops; every test seat is
  inactive or in the suites' org.
- **Sprint 21's outside setup (2026-10-14):** the Google OAuth client (project in the ryuklabs Google org, redirect
  `https://agent.sharingu.xyz/auth/google/callback` and the agent.ryuklabs.io twin) lives ONLY in
  `~/.sharingu/google-oauth.env` (mode 600, two lines; never print it; an operator command stores it in the worker's KV);
  Cloudflare Email Routing destination addresses ryuk@ryuklabs.io (verified) and acie@ryuklabs.io (waiting for its
  click); Email Sending onboarded for sharingu.xyz through the API (sending subdomain c2ed4c4d…, return path
  cf-bounce.sharingu.xyz): its MX, SPF and DKIM records are live (the owner's dashboard, 2026-10-14); DMARC stays the
  zone's older record (p=quarantine, relaxed alignment, reports to a GoDaddy mailbox), which passes our DKIM-signed mail.
  Check records with DNS-over-HTTPS (`curl -H 'accept: application/dns-json' 'https://cloudflare-dns.com/dns-query?name=…&type=TXT'`):
  this Mini's resolver answers empty or times out at times. acie@ryuklabs.io still waits for its click.
- **The Cloudflare token** in `~/.sharingu/env-sharingu.sh` is ACCOUNT-scoped: its token-verify endpoint calls it
  invalid (it only verifies user tokens); wrangler and the account APIs work.

## Traps a session must know (each learned the hard way; none is in a session's memory)

**Ships**
- The cross-org suite on the preview runs 50 minutes to almost 3 hours with a QUIET log. A quiet log is not a stall:
  check the `attack-xorg.mjs` process's CPU time moves and it holds an ESTABLISHED socket. Arm any watchdog on that, not
  on the log's age. `ship.sh` prints "✓ live: <id> at 100% (the rollback target)" at its START: that is not the end.
- A dirty tracked file under `engine/` makes the run record non-resumable and tags the version `-dirty`: commit first.
- `gh pr merge` can hit a "base modified" race: never chain a branch delete after it; check the state first.
- A ship window crossing 03:00 or 15:00 UTC meets the cron's backup heartbeat (the suite excludes its exact shape;
  never widen that).
- After the triggers deploy, this Mini's resolver may cache a negative answer for agent.sharingu.xyz for about two
  minutes (curl rc 6): test with a resolver override before calling it an outage.
- The live walk needs a credentials FILE with an `*_AGENT_R_OWNER_KEY=` line, which `env-sharingu.sh` does not have.
  Make a throwaway one and delete it after: `umask 077; f=~/.sharingu/tmp/walk-$$.env; printf
  'RYUKLABS_AGENT_R_OWNER_KEY=%s\n' "$SHARINGU_RYUKLABS_ADMIN_KEY" > $f; node tools/live-walk.mjs --url
  https://agent.ryuklabs.io --creds $f --live --operator-config wrangler.jsonc --confirm-live ryuklabs-agent-r; rm -f $f`.
  Then `sh tools/verify-live.sh --live`: if it SKIPs its authenticated checks on a transient Cloudflare read, run it
  again; 13/13 is not 28/28.

- A request to a VERSION PREVIEW URL is invisible to `wrangler tail` (with or without `--version-id`) AND to Workers Logs
  (proven 2026-10-15: live's requests showed in both within seconds, the preview's never). A tail beside a ship catches
  nothing of the preview's suite. What does see the preview: Cloudflare's GraphQL analytics, `workersInvocationsAdaptive`
  by `scriptVersion` and `status` (`scriptThrewException` vs `success`); the machine-local query is
  `engine/.runs/repro-500/gql.sh <from> <to>`. A 1101 the analytics never counted as an exception is the edge, not us.
- `runPreview` fails on ANY 429 (counted as plan_limit): a new route that spends the address's LOGIN_LIMIT budget must
  join attack-xorg's `SKIP` (or be paced), or the preview goes red while every local run stays green.
- `wrangler kv key delete` takes the KEY FIRST (`npx wrangler kv key delete "<key>" --namespace-id <id> --remote`); a
  `--` before the key makes it fail with rc 1 and delete nothing.

**Secrets and codes**
- Any tool that prints codes "once, on this terminal" prints them into the session's transcript: always redirect its
  stdout to a mode-600 file and count lines; never `cat` it. Never print a key, a code or a token.

**Local worlds**
- A STANDING local world (dev-local, a reviewer world) misses migrations a newer code expects: after a ship with a
  migration, apply it by hand (`npx wrangler d1 execute <db> --local --config <its wrangler.local.jsonc> --persist-to
  <its persist> --file migrate-0NN.sql`) before `dev-local.sh up` (a `PLATFORM.md` §3 row will automate it).

**Videos and screens**
- Screenshots of a LOCAL worker under the public name (agent.sharingu.xyz) LEAK: Playwright's request interception does
  not catch the request a redirect leads to, and in 21.P a few read-only GETs reached live (nothing written). Map the
  name and refuse every other host: Chromium `--host-resolver-rules=MAP agent.sharingu.xyz 127.0.0.1:<port>, MAP *
  ~NOTFOUND`, with wrangler `--local-protocol https --upstream-protocol https`.
  AND Playwright's `ctx.request` / `page.request` resolve with node's own DNS, not the browser's rules: in 21.4c four
  `POST /oauth/register` reached live and left client records in OAUTH_KV (deleted 2026-10-14 with the owner's OK, after a
  read-only check that no grant named them). Send every request from inside the page (`page.evaluate(fetch)`), never the
  request context, when the public name is mapped.
- Claude can NEVER be granted computer-use control of Claude's own app (a platform rule): a Claude Desktop take is the
  owner's to record; the session cuts it.
- A macOS screen recording is variable-frame-rate: seeking into it lands 1–5 s off, unevenly. Transcode to constant
  25 fps with a keyframe every second BEFORE pinning any cut (`ffmpeg -i in.mov -vf fps=25 -g 25 -keyint_min 25
  out.mp4`), pin cuts on that copy, then sweep EVERY half second of what is kept (a 2 s sweep once let a local link show
  for 1.5 s). Its file name has a narrow no-break space before AM/PM: copy it by glob. This ffmpeg has no `drawtext`:
  captions are rendered as PNGs (`engine/.runs/b12-videos/captions.mjs`).
- A filing through `mcp-remote` (Claude Desktop's config bridge) reads "from another client" (a `PLATFORM.md` §3 row).

**The shell and the harness**
- The Bash tool's shell is zsh: an unquoted `$VAR` is not word-split, an unmatched glob is an error, and `sh -c '…'`
  holding `rm` trips the harness's safety check. Put multi-step scripts in a file and run the file.
- Gate a heavy run on load INSIDE its own command (`[ load -lt 8 ] || exit`); printing `uptime` is not a check.
  bunny's simulator runs spike the load in waves: wait, never skip.

## The direction (owner)

Beta is green and the ryuklabs team uses live: keep live stable for real users. sharingu is a hosted platform (one
worker and one database for every org) with a Claude plugin; the marketplace listings are the main aim now. Every
change rides the same process: one sprint branch, vertical slices, a smoke per slice, one review and ONE ship at sprint
end with the owner's OK. Clean all the way: no dead code, no dead docs; a finished brief is deleted.

## Ruled by the owner (the ones a builder must know)

- **Who holds an account (MCQs 2026-10-15, A.5's find; branch `sprint-21-fix2`):** an email whose account has a passphrase,
  a Google subject, an invite mark, or an ACTIVE or PENDING seat is told "you already have an account" on join — never put
  in the beta line; only a shell whose seat is gone joins as new (`ACCOUNT_HELD`). A reset (or Google's first link) that
  sets an account's FIRST passphrase makes its active seats WAIT for the holder's yes on /orgs (no owner exemption), so a
  squat or a self-redeemed invite never lands a stranger silently. The owner's own ryuk@ (an owner seat, no passphrase)
  sets its first passphrase through the operator's code instead (`allow --email`, then /signup), so org 1 never waits. The
  live unverified ryuk@ request (filed 06:19Z under the old rule) is left to expire; nobody clicks its link.
- **The site's old form (MCQ 2026-10-15, done):** the backend retired and the copy reworded (site `main` e9e904f); the
  owner removes the Vercel intake variables and the Turnstile widget by hand; the Sheet's rows stay.

- **After sprint 21's ship (MCQ 2026-10-15):** (1) A.5 runs twice: a join as ryuk@ryuklabs.io proves the "you already have
  an account" email (the owner's real account untouched, never removed), then a join as `ryuk+beta1@ryuklabs.io` proves
  verify → approve → "You're in" → its removal; (2) the site's old form backend RETIRES now (`api/inquiry.js`, `server/`,
  their tests, the vercel `functions` entry, the form-only CSS); (3) the two leftover lines are reworded now (the consent
  card's form line, privacy's providers paragraph), the owner approving the words before the push; (4) the forms go
  connector first (the owner's P1–P3 and the "from Claude" check), then the plugin.

- **The forms wait for green (2026-10-15):** the owner submits the Claude connector and plugin forms only after block A
  is done end to end: sprint 21 shipped green and A.3–A.6 finished. The plugin itself is ready (validate --strict
  passes; `ryuk-labs/sharingu-plugin` at 0.1.16, equal to this tree).

- The MCP is the only input; every write is previewed, then filed; the word is "contribution".
- Screens are optional for work that touches no screen; ids are checked against the project's own Map; proof is a
  stated result with its numbers, a command with its result, or a link — only narration is refused.
- A plan or note feeds the goal it names and moves no code cell. Goals and GTM open on all time.
- A new picture of a screen does not make its grades stale.
- Anyone seated may publish their own draft to the shelf; a Partner may not.
- **The projects' data (2026-10-02):** ryuklabs' private data (client names with amounts, funding details) is stripped,
  on live too, and it holds no product model by design; siru's aim is its proposed mission, its tree's top the
  Thiruvallur pilot, its measure the pharmacies with doors open in that pilot; bunny's measure is the ask → TestFlight
  lead time per week; saruspay's the go-live checklist items done, of 61; sharingu's is activated organisations;
  Siru, FlowZo and Redacted/TOKEN2049 are approved claims with their boundaries. The projects' data is not on the
  platform road (2026-10-06).
- **PROPRIETARY (MCQ 2026-10-09; overturns the 2026-10-05 MIT release):** © Ryuk Labs, all rights reserved; the
  engine's repo stays private for good; the beta is hosted-only (`docs/BETA-NOTE.md`: no SLA, feedback asked); the
  plugin installs free from its own public distribution repo `ryuk-labs/sharingu-plugin`, the service is the priced
  product (the plans; prices at billing time).
- **The platform (2026-10-06; the whole design in `PLATFORM.md` §2):** one worker and one database for every org;
  the wall is org-carrying project keys; what happens in an org stays in the org (no staff seat in the app; only the
  deployment credentials reach the data); each org at `agent.sharingu.xyz/<org>`, the AI at the one `/mcp`; sign-up
  by an allowlist and a one-time code handed over by hand (no email service); payment after the beta succeeds.
- **The suites' cut stands (2026-10-03):** the 80 cases plus the restored proofs; `R-suites-keep-set-review` is the
  owner's ruling.
- **Links, ids, invites and limits (2026-10-06, by MCQ):** a public file's link stays readable from any org (ADR-055
  holds — the wall is the allowlisted sign-up) and contribution ids stay numbered across the database; ONE revisit of
  both together before sign-up opens to everyone. The free tier: 1,500 items a month and 1,000 calls a day; raising
  by hand on request is the paid plan during the beta.
- **The beta-ops grant (2026-10-06):** for the beta the session drives ryuklabs org admin itself as the owner-class
  service seat `agent-ops` (attribution and `approval_audit` show Agent Ops, never the owner). The key is machine-local
  (`SHARINGU_RYUKLABS_ADMIN_KEY` in `~/.sharingu/env-sharingu.sh`; the wrapper `~/.sharingu/rl-admin.sh` sources it,
  never printing). The surface: people, seats, open items, clean-eval through Control and the door, plus the bookmarked
  SQL path for what Control lacks. Ships, schema migrations, money and other orgs still ask the owner. RETIRE AT THE
  BETA'S END: archive `agent-ops` on Control, drop the env line, remove the allow rules.
- **Frictionless start (MCQ 2026-10-10):** the beta's 50 orgs (first come, first served) stay on the WAITLIST, the
  owner approving each; the GTM filing skill files summaries and links only, never raw mail or DM text, each item
  previewed. A seventh hat, Quality, joins the six of 2026-10-01; the showcase world seats each class of an org.
- **Which AI filed it (MCQ 2026-10-11):** each contribution stores one self-declared family word (claude,
  claude-code, chatgpt, codex, web, api, other), never the raw string; the privacy page says so.
- **Onboarding (MCQ 2026-10-13):** after the Claude side, sprint 21: splash, request access with a profile, the in-line
  page with the live beta count, the walkthrough call to action, sign-in pages in the site's look, Google sign-in.
- **The write door split (MCQ 2026-10-13):** each write is its own tool, by what it does (`file_contribution`,
  `save_knowledge`, `remove_knowledge`); `preview` only shows and names the tool for each item; grades through
  `submit_grade`, answers through `respond`; every write is still previewed first.
- **The walkthrough (MCQ 2026-10-13):** the videos are PUBLIC on the site's docs page, `#walkthrough` (one fixed URL:
  ChatGPT's `demoRecordingURL`; YouTube may come later behind it); the OpenAI submission waits for the owner's ChatGPT
  recording (desktop and mobile) to join that section.
- **The graders are destructive (MCQ 2026-10-12):** `submit_grade` and `regrade` change a check's grade, so they carry
  `destructiveHint: true`; a write that only adds stays non-destructive (the MCP spec's meaning).
- **Submission prep (MCQ 2026-10-12):** refresh the live reviewer world now, before any code goes into a form; the
  videos become unlisted YouTube links, uploaded by the owner after the submissions are prepared; descriptions that
  told the model what to call first are softened before submitting (sprint 14).

## How the owner works

- Decisions go to the owner as MCQs, with an inline drawing first, the recommended option first, each with its cost.
  They decide fast, often correct the recommendation, and are usually right. They dislike bulk: keep prose tight.
- They want to SEE the work: shots after every slice, and they judge the product by how it looks (`LOOK.md`).
- Ask only for what is theirs (a ship or anything live, money, access design, scope they ruled on, anything
  irreversible); fold everything else into the plan and carry on.
- A ship needs their OK each time. Never print a secret.
- They may switch Claude accounts mid-work: keep this file current at every stop so the next session resumes cold.

## How builders are run

- Opus sub-agents. One on the door files; others only on disjoint files, each from a frozen copy of the code when it
  needs a running worker. A brief names: what to read, the rulings it implements, what to build, the files it owns
  and must not touch, its ports, the non-negotiables (no widening of authority, nothing per org or project, the row
  budget, and from sprint 6 every statement through the scoped data layer), the tests that follow the code, the proof
  commands, how it must look at its own work, what to report. Builders never commit.
- **Integrating a builder's work** (from `engine/`): `node --check` every `src/*.js src/knowledge/*.js` ·
  `python3 tools/make-door-contract.py` · `python3 check-mcp-parity.py` · `python3 check-brand.py` ·
  `python3 tools/code-atlas.py > code-atlas.json` · `python3 tools/check-boot-schema.py` ·
  `python3 tools/check-docs.py` · `node tools/make-arch-client.mjs --check` · every `tools/*selftest*.mjs` and
  `tools/import/selftest.mjs` (`mcp-client-selftest.mjs` needs a running worker: skip it in a bare run) ·
  `sh tools/smoke.sh` (load under 8) · read the authority-relevant diff and the shots · commit only that builder's
  files · `sh gate.sh` · the shots to the owner.
- A builder's "green" is a claim; a screenshot is not a signed-in user (`shots.mjs --cookie`); rows written are
  counted, never estimated.

Rules that remove ambiguity: a fork that is not the owner's is decided by the plan's laws (one product, nothing per org
or project, no widening of authority, the per-screen row budget) and recorded in `SPRINTS.md`; a builder cut off resumes
from its `engine/.runs/<name>/PROGRESS.md`; a migration takes the next free number at integration time; no full suite
outside a sprint end; load over 8 means wait, never skip the check.

## The machine

A shared Mac Mini (`ryuks-mac-mini`): other projects (bunny, siru, veil) run here — never touch their processes or
folders. One heavy suite at a time, only when load is under 8. Local workers take ports 88xx: 8840 the ship candidate,
8850–8879 builders, 8880–8899 smokes, 8930–8939 video worlds. Commit as the checkout's own git identity (plain
`git commit`, never `-c user.name`). Credentials: `set -a; . ~/.sharingu/env-sharingu.sh; set +a` (never print a
value). `gh` is logged in as an account that cannot see `ryuk-labs/sharingu`: run every `gh …` with those credentials
sourced (its `GH_TOKEN` is the project's own). The remotes: `origin` is `ryuk-labs/sharingu` (the repo from 2026-10-12),
`archive` is `ryukdev/sharingu` (everything before; private, archived: fetched, never pushed to). The site's pushes
go through its own wrapper (`python3 scripts/with-env.py git push origin main` in `~/batcave_vm/sharingu_website`; its
pre-push hook runs the full verify). Browser automation uses Playwright's bundled Chromium or the pinned Chrome for Testing, never the owner's
Chrome.
