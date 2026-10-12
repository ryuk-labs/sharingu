# Running sharingu, and setting up an org — the operator's page

sharingu is one platform: one worker with one D1, one R2 bucket and one KV serves every org, each at its own address,
`/<org>`. An org, its projects, people and seats are rows of the D1; everything a project knows is filed through the MCP
door (`docs/INSTALL.md` §3). The engine code is the same for every org: never a fork. The platform is
`ryuklabs-agent-r` (`wrangler.jsonc`, at `agent.sharingu.xyz` and `agent.ryuklabs.io`).

sharingu is proprietary and the beta is HOSTED-ONLY (the owner, 2026-10-09): teams use the hosted platform, and this
repository is private. Everything below is the operator's own: a second platform on our account (staging, a rebuild),
the local platform for building sharingu, and the hosted platform's orgs.

An org is born one way, a write through the door: an account, signed up with the operator's one-time code, creates it
at `/orgs/new` (`POST /orgs`), proven by the account's own passphrase. During the beta an account creates one org.

## A second platform on Cloudflare: `tools/new-org.sh`

From `engine/` (after `npm install`), with `CLOUDFLARE_API_TOKEN` (Workers, D1, R2 and KV edit) and
`CLOUDFLARE_ACCOUNT_ID` set for the account:

```
sh tools/new-org.sh <name> --email <you> [--dry-run] [--no-cron]
```

- `<name>` is lowercase `[a-z0-9-]` and names the deployment: the worker and its D1 are `<name>-agent-r`, the R2 bucket
  `<name>-brain`, the KV namespace `<name>-agent-r-oauth`, the config `wrangler.<name>.jsonc`. Its orgs' addresses are
  chosen at `/orgs/new`.
- `--email <you>` is the email you sign up with: the platform's first allowed email (required for a real run).
- `--dry-run` validates the name (and the email, when given) and prints the plan; nothing is created.
- `--no-cron` deploys with no scheduled crons (the Workers Free plan allows 5 cron triggers per account).

In order: validate the name, the email and the account's D1 and cron caps → create D1, R2 (read back: an account must
have R2 turned on) and KV → fill the three blanks of `wrangler.tenant.template.jsonc` into `wrangler.<name>.jsonc` →
apply `boot.sql`, the schema alone (an EMPTY platform: no org, no person, no key) → `wrangler deploy` → wait until
`/health` answers its D1 and `/signup` answers → allow your email with `tools/operator.mjs` (its one-time code printed
once, on your terminal) → print the way in. A failure after the first resource exists and before the deploy runs
`sh tools/teardown-org.sh <name>` (`NEW_ORG_ROLLBACK_ON_FAIL=0` keeps the partial state instead); a refused allow after
the deploy rolls nothing back and prints the operator line to run again.

The way in, the same as on the hosted platform:

1. `<url>/signup`: your email, the code and a passphrase of at least 12 characters (your account);
2. `<url>/orgs/new`: your email and that passphrase, the org's name, its address, its first project's short name and
   your name. One write makes the org, your owner seat and the first project; the owner key is shown once.
3. Prove it before anyone is invited (it prints its own N/N; all green):

```
DAY0_URL=<url> DAY0_KEY=<owner key> DAY0_EMAIL=<you> DAY0_PASS=<your passphrase> sh tools/day0-verify.sh
```

`tools/day0-verify.sh` also runs the first run end to end from a terminal, instead of the browser: `DAY0_CODE`,
`DAY0_PASS` and `DAY0_ORG` (the address) sign up, create the org through `POST /orgs` and walk it (`DAY0_KEY_OUT=<path>`
keeps the owner key, mode 600). The code is single-use: that run IS the sign-up.

Tear it down with `sh tools/teardown-org.sh <name> [--dry-run]`: it refuses `ryuklabs`, `siru` and `frame` by name,
deletes the worker, D1, R2 (emptied first) and KV — every org the platform holds, with their data — removes
`wrangler.<name>.jsonc`, and reads back that each is gone.

A custom domain is a `routes` entry in the config, as `wrangler.jsonc` has for both of the platform's: a deploy of the
triggers DETACHES any custom domain the list does not name (the sprint-9 ship did it once), so a domain is added to the
config, never attached by hand alone. The hosted platform ships through `sh tools/ship.sh` (`BUILD.md`); it ships no
other platform. A second one takes a new version in this order: the migrations its database lacks that land before the
code (each file's header says), `npx wrangler deploy -c wrangler.<name>.jsonc`, then those that land after it.

## The operator: `tools/operator.mjs`

The operator's tool works on the deployment's credentials, from the operator's machine, and no app seat can do what it
does.

```
node tools/operator.mjs allow --email <e> [--days N] [--reset] --live --config wrangler.<name>.jsonc --confirm-live <name>-agent-r
node tools/operator.mjs list [--email <e>] [--json] --live --config wrangler.<name>.jsonc --confirm-live <name>-agent-r
node tools/operator.mjs revoke --email <e> --live --config wrangler.<name>.jsonc --confirm-live <name>-agent-r
```

`allow` makes a new one-time code for the email, valid N days (default 7, at most 30), printed once and kept nowhere
(the database holds its hash); any code still open for the email is revoked. An account that already has a passphrase
needs `--reset`: its sign-up then replaces the passphrase and ends every session of the account. `list` shows the
allowed emails and the state of each one's newest code, never a code; `revoke` ends an open one. A local platform takes
`--local <its persist dir> --config <its config>` instead of the three `--live` flags.

## Run it locally: `tools/r-local.sh`

The same worker under `wrangler dev --local`, with D1, R2 and KV on disk. No Cloudflare account and no call to
Cloudflare.

```
cd engine && npm install
sh tools/r-local.sh up <name> --empty [--email <you>] [--port <N>] [--lan]
```

The first `up --empty` applies `boot.sql` alone (an empty platform); `--email` allows your email once the worker answers
(`tools/operator.mjs allow --local`, the code printed once). Then `/signup`, `/orgs/new` and the `tools/day0-verify.sh`
line, on the URL it prints. It binds `127.0.0.1` unless `--lan` is given. State lives in `~/.sharingu/r-local/<name>/`
(`R_LOCAL_STATE_ROOT` overrides it): the data and the generated config.

- `sh tools/r-local.sh status <name>` · `sh tools/r-local.sh down <name>` (the data stays).
- Connect: `claude mcp add <name> --transport http http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <key>"`.
- Start it at login on macOS, once the first `up` ran: `sh tools/r-local-launchd.sh --org <name> [--port <N>] [--lan]
  --load`. On Linux: the systemd user unit `tools/systemd/sharingu-agent-r-local@.service.template` (its header says how
  to install it).
- Locally there is no cron.
- Without `--empty`, the first `up` (or `sh tools/r-local.sh seed <name> [--seed <seed.json>] [--project
  <key>[=<name>]]`) seeds org 1 by SQL, its owner key in the state's `credentials.env` (chmod 600, never printed): the
  test harness's mode (`tools/smoke.sh`, the suites), so a script holds a key before any browser exists.
  `sh tools/dev-local.sh up` is that mode with every project on this machine imported: the local app for building
  sharingu.

## Projects, people and seats

On Control, the admin:

- **Projects:** add one (re-adding an archived key reactivates it), archive, reactivate.
- **Members:** Invite (name, email, role member or partner, the projects to seat them on, their access hats) shows the
  new key once; then set role, set access hats, rotate key, remove. The new seat joins its email's account, or a new
  account is made for it; the seat's key signs in to that seat alone, and the account's own passphrase (a sign-up with
  the operator's code) signs in to every seat of the account.

The admin's Claude can also add a project through the MCP (`create_project`, a key and a name; seats stay on Control).
A project is then filled through the MCP, the first time in this order: `whoami` → `missing` (each open item with the
`preview` call that fills it) → `formats` → `preview` → `file`. Every write is stamped with its project server-side
from the writer's seats (the owner may name any active project); naming a project the writer holds no seat on is
refused `project_forbidden`.

## The rules

- One platform, every org a row; the org is the hard wall (`docs/plan/ARCHITECTURE.md` §10). Inside it, a project is a
  soft scope: seats decide who reads and files where.
- No tenant fact is typed into the code: a page takes its brand through `src/tenant.js`, and `check-brand.py` is a
  gate step.
