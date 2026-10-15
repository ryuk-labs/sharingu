# HANDOFF — where sharingu stands (rewritten at every stop; git holds the history)

**As of 2026-10-15 (evening IST): sprint 21 is CLOSED and the Claude forms are the owner's.** Live: `ab85fecb` (sprint 21
with its two fixes), D1 at migrate-081; the walk 13/13, verify-live 28/28, the reviewer walk 8/8; plugin 0.1.17 public;
hello@sharingu.xyz routes. Next: the owner's forms (connector, then plugin); this side's next work is §1 · Next.

This file is the whole memory. A session on any Claude account starts here, needs nothing from a previous session,
and must not trust its own memory over this file. Read, in order: `README.md` (the model, how we work) → this file →
`PLATFORM.md` (the road; §3 is THE one list of open items) → `AGENTS.md` at the repo root (the process, the commands,
the laws). `SPRINTS.md` holds every slice's record (sprint 21's whole story is there); `MARKETPLACE.md` the store road;
`listing/SUBMISSION.md` the forms.

## RESUME HERE

**0 · Orient (five minutes, read-only).** From the repo root: `git branch --show-current` (expect `main`; no sprint
branch open), `git log --oneline -4`, `git status --short` (expect clean), `uptime` (load under 8 before anything heavy:
bunny's simulators share this Mini). Then validate (below) and tell the owner where things stand in two lines.

**Validate in ten minutes** — anyone on the team, from `engine/`, credentials sourced (`set -a; .
~/.sharingu/env-sharingu.sh; set +a`). Each line: the command, then what green looks like. The first three are read-only;
the last two write a little on live, as a reviewer would, and clean up after themselves.

| # | Check | Command | Green |
|---|---|---|---|
| 1 | Both domains answer | `curl -s -o /dev/null -w "%{http_code}\n" https://agent.sharingu.xyz/health https://agent.ryuklabs.io/health` | `200` twice |
| 2 | The live version | `npx wrangler deployments status --name ryuklabs-agent-r` | `(100%) ab85fecb-50ef-4d16-bb46-a019237b19b4` |
| 3 | The plugin, here and public | `node tools/make-plugin-skills.mjs --check` · `gh api repos/ryuk-labs/sharingu-plugin/contents/plugin/.claude-plugin/plugin.json --jq .content \| base64 -d \| grep version` | "current … version 0.1.17" · `"version": "0.1.17"` |
| 4 | The member's whole loop on live | the live walk (the command under Traps · Ships) | `✓ live walk: 13 of 13 steps passed` |
| 5 | Our tools reach the door; the store's test cases | `sh tools/verify-live.sh --live` · `node tools/listing-walk.mjs --url https://agent.sharingu.xyz --codes ~/.sharingu/reviewer-credentials.txt` | `== 28 passed, 0 failed ==` · `✓ all 8 cases green` |

A red line: stop, read its log, say so to the owner. Never "fix" live by hand; the rollback is under State.

## §1 · Next, in order

1. **The owner's, now:** in Claude, add `https://agent.sharingu.xyz/mcp` as a custom connector, run P1–P3 of
   `listing/test-cases.md` with the reviewer accounts (their codes only in `~/.sharingu/reviewer-credentials.txt`),
   check Activity's row for P3 reads "from Claude" (if it reads "another client": stop, the label needs a fix first),
   then submit the **connector** form, then the **plugin** form. The paste sheet: `engine/.runs/forms/claude-forms.md`
   (machine-local; the stores' pages were re-read 2026-10-15). From now on NEVER refresh the reviewer world
   (`make-reviewer-org.mjs --reissue` resets every code the forms hold).
2. **Acie's fresh start — APPROVED 2026-10-15** (the owner's word): Acie re-joined with the Gmail (request 8c2db1e0…,
   "Acie Labs") and was approved ("You're in" sent); Acie signs in with Google and creates the org. acie@ryuklabs.io is a
   ryuklabs ADMIN again (re-granted on the owner's word, 2026-10-15, for the operator page; Google unlinked): its next
   Google sign-in is a first link, so its seat waits for Acie's Accept on `/orgs` (fix2's rule), then
   `/ryuklabs/operator` opens.
   3. **hello@ → acie@:** when acie@ryuklabs.io becomes a verified Cloudflare destination (Acie clicks Cloudflare's mail,
   re-sent 2026-10-15), switch the one rule "hello@ to the team" from ryuk@ to acie@ (Email Routing API, the zone's rule;
   one destination a rule — Traps).
4. **Sprint 22 (one branch, one ship)**, slices in this order: (a) tests focused on the change's region — `tools/smoke.sh
   --only <case,…>`, the cross-org suite's bounded pool for its reads, and `ship-plan.sh` saying when a change needs no
   ship; (b) the dead code (`PLATFORM.md` §3: four exports nothing reads, and the `export` on names only their own file
   uses); (c) video 1's opening re-recorded (`engine/.runs/b12-videos/record.mjs`: the site's Join the beta → the request
   page → confirm → in line → You're in; clips 3–5 kept) and the owner uploads it.
5. **M4's third form, ChatGPT:** store the portal's domain token (`node tools/operator.mjs set-openai-challenge --token <it>
   --live --config wrangler.jsonc --confirm-live ryuklabs-agent-r`), the owner's ChatGPT recording as `demoRecordingURL` in
   `listing/codex-listing.json`, `node tools/make-plugin-skills.mjs`, the ZIP (`--openai-zip <out.zip>`), then the form.
   Re-read the stores' pages on the day (`MARKETPLACE.md`, Sources).
6. **M5:** answer the reviewers, launch. The platform's hardening rows marked S9 in `PLATFORM.md` §3 are the owner's to
   open.

## State (2026-10-15)

- **Live:** worker `ab85fecb-50ef-4d16-bb46-a019237b19b4` (tag `8e743f055`) at 100% on https://agent.sharingu.xyz and
  https://agent.ryuklabs.io; D1 `ryuklabs-agent-r` at migrate-081. Code undo: `sh engine/tools/ship.sh rollback
  001aaf1d-3a31-4d2e-b5a8-00dfa2a8be47`. Data undo (the WHOLE database, every org: never without the owner): `npx wrangler
  d1 time-travel restore ryuklabs-agent-r --bookmark=00001040-00000000-00005104-0ccac1ab91be2c195274f064b1c6007f` (taken
  before migrate-081). The OpenAI domain-verification token answers on both domains.
- **What is live for a new team:** the showcase at `/`, Join the beta (`/request-access`: a profile and a passphrase, or
  Google), the verify email, the line with the live beta count, the operator's approval and its "You're in", the org
  form filled in from the request; Google sign-in; the operator page `/ryuklabs/operator` (org 1's admins). Who holds an
  account and THE FIRST PASSPHRASE WAITS are one rule each (`engine/CLAUDE.md`).
- **Email:** every email From hello@sharingu.xyz (Cloudflare Email Sending, onboarded; MX/SPF/DKIM of the sending
  subdomain `cf-bounce.sharingu.xyz` live; DMARC the zone's older record, p=quarantine, relaxed). Four to the person
  (verify, already have an account, reset, You're in), two to the team (new request, cap reached: to acie@, cc ryuk@).
  Under 2,900 sends in any 31 days, three a day per mailbox. Replies: Email Routing ON for sharingu.xyz (root MX
  route1–3.mx.cloudflare.net, SPF `include:_spf.mx.cloudflare.net`), rule "hello@ to the team" → ryuk@ryuklabs.io.
  Destinations: ryuk@ verified; acie@ waiting for its click.
- **People and orgs on live:** org 1 ryuklabs (Acie, Dr Vasu, Rein, Tyag, Ryuk, Agent Ops active; Ryuk's account has its
  own passphrase since 2026-10-15, kept in `~/.sharingu/ryuk-passphrase.txt`, mode 600); org 2 the suites' org; org 3 the
  reviewer world. The beta's places: 49 of 50 free. Org 6 "acie labs" was deleted for Acie's fresh start (its export in
  `~/.sharingu/exports/org6-acie-labs-20261015`, mode 700).
- **The reviewer world:** org 3 at `/sharingu-review` (`@review.sharingu.xyz`), seven seats (admin, member, dev, bd,
  marketing, tester, partner), the sharingu and Sample projects; walked 8/8 on live 2026-10-15 (it leaves P3's and P5's
  notes, as a reviewer would). The codes live only in `~/.sharingu/reviewer-credentials.txt` (mode 600).
- **The plugin:** this tree and the public `ryuk-labs/sharingu-plugin` at 0.1.17 (b34e0b7; installs as 0.1.17 on a clean
  config). The recipe to sync: step 6 of `sh tools/ship-plan.sh ryuklabs --no-import`.
- **The repo:** `ryuk-labs/sharingu` (private), `main` the only branch in use; the old repo `ryukdev/sharingu` is the
  `archive` remote (fetched, never pushed to). Rein (`reindev3`) is a `ryuk-labs` org admin (the owner's call,
  2026-10-12). `engine/.runs/` is machine-local (gitignored): ship logs, the video recorder (`engine/.runs/b12-videos/`),
  the forms' paste sheet (`engine/.runs/forms/`), the day's probes (`engine/.runs/repro-500/`: `gql.sh` per-version
  analytics, `cf.sh` the Cloudflare API with the token never printed).
- **The site** (www.sharingu.xyz, repo `RyukLabs/sharingu_web_fe`, Vercel deploys `main`): `main` at e9e904f — Join the
  beta → `https://agent.sharingu.xyz/request-access?from=site`, `/waitlist` a 307 there, the old form and its backend
  retired (no Vercel variables, no Turnstile widget left), the walkthrough at `docs.html#walkthrough` (five videos), the
  tools page at the engine's contract (`npm run check:mcp-tools`). Its own `HANDOFF.md` records its side.
- **The listing kit:** `listing/SUBMISSION.md` (every form's fields), `listing/test-cases.md` (5 + 3), `listing/carousel/`
  (four card PNGs and their prompts), `listing/icon/`, `listing/videos/` (the walkthroughs; YouTube links in the kit).
- **Outside setup:** the Google OAuth client lives only in `~/.sharingu/google-oauth.env` (mode 600; stored in the
  worker's KV by `operator.mjs set-google-client`); both domains are in `engine/wrangler.jsonc` `routes` (the ship's
  triggers deploy detaches any Custom Domain not listed there). The Cloudflare token in `~/.sharingu/env-sharingu.sh` is
  account-scoped (its token-verify endpoint calls it invalid; wrangler and the account APIs work).

## Traps a session must know (each learned the hard way)

**Ships**
- The cross-org suite on the preview runs 50 minutes to almost 3 hours with a QUIET log. A quiet log is not a stall:
  check the `attack-xorg.mjs` process's CPU time moves and it holds an ESTABLISHED socket; its progress is the preview
  version's request count (`engine/.runs/repro-500/gql.sh <from> <to>`, ~11,700 for a whole run). `ship.sh` prints
  "✓ live: <id> at 100% (the rollback target)" at its START: that is not the end.
- A request to a VERSION PREVIEW URL is invisible to `wrangler tail` AND to Workers Logs; only the GraphQL analytics
  (`workersInvocationsAdaptive` by `scriptVersion` and `status`) see it. A 1101 the analytics never counted as an
  exception is the edge, not us.
- `runPreview` fails on ANY 429 (counted as plan_limit): a route that spends the address's LOGIN_LIMIT budget must join
  attack-xorg's `SKIP` (or be paced), or the preview goes red while every local run stays green. For the same reason,
  never run sign-ins on live (a reviewer walk, a live walk) WHILE a ship's suite runs: they share the address's budget.
- Never change the database's orgs (a delete, a restore) while a ship's suite runs: it compares every other org's rows.
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
  verify-live: if it SKIPs its authenticated checks on a transient Cloudflare read, run it again; 13/13 is not 28/28.
- `wrangler kv key delete` takes the KEY FIRST (`npx wrangler kv key delete "<key>" --namespace-id <id> --remote`); a
  `--` before the key makes it fail with rc 1 and delete nothing.

**Accounts**
- ryuk@ryuklabs.io is the owner's REAL account: never `remove-account` it, never test a join with it. Test the join with
  a plus address on a mailbox you can read (ryuklabs.io is Google Workspace: `ryuk+test@…` lands in ryuk@'s inbox; the
  per-mailbox limit counts it as ryuk@).
- `remove-account` refuses an account with an active seat or a standing org it founded: delete the org first
  (`tools/org-undo.mjs` export, then delete).

**Email and Cloudflare**
- Cloudflare Email Routing takes ONE destination and ONE action per rule; a destination must be VERIFIED by its holder's
  click before forwarding reaches it.
- The deployment's token reads and writes Email Routing but has NO DNS read and NO zone analytics: check records with
  `dig +short <name> @1.1.1.1` (DoH lookups from this Mini time out at times; IPv4 to Cloudflare can take ~16 s a call
  while IPv6 takes ~1 s), and a delivery by sending a test to a mailbox you can read.
- The binding sends `from: {email, name}`; Cloudflare's REST send takes `{address, name}` (`tools/operator.mjs restBody`).

**Secrets and codes**
- Any tool that prints codes "once, on this terminal" prints them into the session's transcript: always redirect its
  stdout to a mode-600 file and count lines; never `cat` it. Never print a key, a code, a token or a person's email.

**Local worlds**
- A STANDING local world (dev-local, a reviewer world) misses migrations a newer code expects: after a ship with a
  migration, apply it by hand (`npx wrangler d1 execute <db> --local --config <its wrangler.local.jsonc> --persist-to
  <its persist> --file migrate-0NN.sql`) before `dev-local.sh up` (a `PLATFORM.md` §3 row will automate it).

**Videos and screens**
- Screenshots of a LOCAL worker under the public name (agent.sharingu.xyz) LEAK: map the name and refuse every other
  host (Chromium `--host-resolver-rules=MAP agent.sharingu.xyz 127.0.0.1:<port>, MAP * ~NOTFOUND`, wrangler
  `--local-protocol https --upstream-protocol https`), and send every request from inside the page
  (`page.evaluate(fetch)`), never Playwright's request context (it resolves with node's own DNS).
- Claude can NEVER be granted computer-use control of Claude's own app: a Claude Desktop take is the owner's to record.
- A macOS screen recording is variable-frame-rate: transcode to constant 25 fps with a keyframe every second BEFORE
  pinning any cut (`ffmpeg -i in.mov -vf fps=25 -g 25 -keyint_min 25 out.mp4`), then sweep EVERY half second of what is
  kept. This ffmpeg has no `drawtext`: captions are rendered as PNGs (`engine/.runs/b12-videos/captions.mjs`).
- A filing through `mcp-remote` (Claude Desktop's config bridge) reads "from another client" (a `PLATFORM.md` §3 row).

**The shell and the harness**
- The Bash tool's shell is zsh: an unquoted `$VAR` is not word-split, an unmatched glob is an error, there is no
  `timeout` command, and `sh -c '…'` holding `rm` trips the harness's safety check. Put multi-step scripts in a file.
- Gate a heavy run on load INSIDE its own command (`[ load -lt 8 ] || exit`); printing `uptime` is not a check.
  bunny's simulator runs spike the load in waves: wait, never skip.

## The direction (owner)

Beta is green and the ryuklabs team uses live: keep live stable for real users. sharingu is a hosted platform (one
worker and one database for every org) with a Claude plugin; the marketplace listings are the main aim now. Every
change rides the same process: one sprint branch, vertical slices, one review and ONE ship at sprint end with the
owner's OK. Clean all the way: no dead code, no dead docs; a finished brief is deleted.

## Ruled by the owner (the ones a builder must know)

- **Tests focused on the change's region (2026-10-15):** while building, the touched selftests and only the smoke cases a
  change touches; the full smoke and the gate once before the sprint's PR; the cross-org suite stays whole on every code
  ship (the wall's guard) but gets faster; no ship for a change to docs or the plugin alone. The tooling is sprint 22's
  first slice; until it lands, today's process stands (`AGENTS.md`).
- **Who holds an account (MCQs 2026-10-15):** an account with a passphrase, a Google subject, an invite mark, or an active
  or pending seat is held: its join gets "you already have an account", never the beta line (`ACCOUNT_HELD`). A reset or
  Google's first link that sets an account's FIRST passphrase makes its active seats wait for the holder's yes (no role
  exempt; the operator's own sign-up code exempt); an org's only real owner cannot decline its waiting seat.
- **The join is told one way (MCQ 2026-10-15):** request access, confirm the email, the operator's approval and its email,
  then create the org. The connector's suggested name is `sharingu` for every org; the front pages' top bar names the
  Walkthrough (the site's `docs.html#walkthrough`).
- **The operator (MCQ 2026-10-15):** the operator page opens for an admin of org 1 only; there is no narrower role. Who
  operates the beta is the owner's grant.
- **The forms (2026-10-15):** submitted only after everything ships green; connector first (P1–P3 and the "from Claude"
  check), then the plugin; video 1 re-recorded after the forms.
- **Onboarding (MCQs 2026-10-13/14):** the beta's 50 orgs, first come, first served, the owner approving each request;
  emails From hello@sharingu.xyz under the cap; Google sign-in; the team's alert to acie@ cc ryuk@; the data collected as
  the privacy page says (consents with their version, the source, the 90-day clearing).
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
- **PROPRIETARY (MCQ 2026-10-09):** © Ryuk Labs, all rights reserved; the engine's repo stays private for good; the beta
  is hosted-only (`docs/BETA-NOTE.md`: no SLA, feedback asked); the plugin installs free from its own public
  distribution repo `ryuk-labs/sharingu-plugin`, the service is the priced product (prices at billing time).
- **The platform (2026-10-06; the whole design in `PLATFORM.md` §2):** one worker and one database for every org;
  the wall is org-carrying project keys; what happens in an org stays in the org (no staff seat in the app; only the
  deployment credentials reach the data); each org at `agent.sharingu.xyz/<org>`, the AI at the one `/mcp`; payment
  after the beta succeeds.
- **The suites' cut stands (2026-10-03):** the 80 cases plus the restored proofs.
- **Links, ids, invites and limits (2026-10-06, by MCQ):** a public file's link stays readable from any org and
  contribution ids stay numbered across the database; ONE revisit of both together before sign-up opens to everyone. The
  free tier: 1,500 items a month and 1,000 calls a day; raising by hand on request is the paid plan during the beta.
- **The beta-ops grant (2026-10-06):** for the beta the session drives ryuklabs org admin itself as the owner-class
  service seat `agent-ops` (attribution and `approval_audit` show Agent Ops, never the owner). The key is machine-local
  (`SHARINGU_RYUKLABS_ADMIN_KEY` in `~/.sharingu/env-sharingu.sh`; the wrapper `~/.sharingu/rl-admin.sh`). The surface:
  people, seats, open items, clean-eval through Control and the door, plus SQL for what Control lacks. Ships, schema
  migrations, money and other orgs still ask the owner. RETIRE AT THE BETA'S END: archive `agent-ops` on Control, drop the
  env line, remove the allow rules.
- **Frictionless start (MCQ 2026-10-10):** the GTM filing skill files summaries and links only, never raw mail or DM
  text, each item previewed. A seventh hat, Quality, joins the six of 2026-10-01; the showcase world seats each class of
  an org.
- **Which AI filed it (MCQ 2026-10-11):** each contribution stores one self-declared family word (claude,
  claude-code, chatgpt, codex, web, api, other), never the raw string; the privacy page says so.
- **The write door split (MCQ 2026-10-13):** each write is its own tool, by what it does (`file_contribution`,
  `save_knowledge`, `remove_knowledge`); `preview` only shows and names the tool for each item; grades through
  `submit_grade`, answers through `respond`; every write is still previewed first.
- **The walkthrough (MCQ 2026-10-13):** the videos are PUBLIC on the site's docs page, `#walkthrough` (one fixed URL:
  ChatGPT's `demoRecordingURL`); the OpenAI submission waits for the owner's ChatGPT recording to join that section.
- **The graders are destructive (MCQ 2026-10-12):** `submit_grade` and `regrade` carry `destructiveHint: true`; a write
  that only adds stays non-destructive.

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
  budget, every statement through the scoped data layer), the tests that follow the code, the proof commands, how it
  must look at its own work, what to report. Builders never commit.
- An auth change gets an independent, read-only adversarial review before its PR (sprint 21's fixes: two reviews, every
  finding folded).
- **Integrating a builder's work** (from `engine/`): `node --check` every `src/*.js src/knowledge/*.js` ·
  `python3 tools/make-door-contract.py` · `python3 check-mcp-parity.py` · `python3 check-brand.py` ·
  `python3 tools/code-atlas.py > code-atlas.json` · `python3 tools/check-boot-schema.py` ·
  `python3 tools/check-docs.py` · `node tools/make-arch-client.mjs --check` · `node tools/copy-check.mjs --check` · every
  `tools/*selftest*.mjs` the change touches · `sh tools/smoke.sh` (load under 8) · read the authority-relevant diff and
  the shots · commit only that builder's files · `sh gate.sh` (its contract-drift check reads what is COMMITTED) · the
  shots to the owner.
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
`git commit`, never `-c user.name`; a fresh clone of the plugin's repo takes the identity its history shows, ryukdev).
Credentials: `set -a; . ~/.sharingu/env-sharingu.sh; set +a` (never print a value). `gh` is logged in as an account that
cannot see `ryuk-labs/sharingu`: run every `gh …` with those credentials sourced. The remotes: `origin` is
`ryuk-labs/sharingu`, `archive` is `ryukdev/sharingu` (fetched, never pushed to). The site's pushes go through its own
wrapper (`python3 scripts/with-env.py git push origin main` in `~/batcave_vm/sharingu_website`; its pre-push hook runs
the full verify; `python3 scripts/with-env.py vercel …` for its Vercel project). Browser automation uses Playwright's
bundled Chromium or the pinned Chrome for Testing, never the owner's Chrome.
