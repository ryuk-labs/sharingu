# engine/ — the worker

One Cloudflare worker serves every org (each at its own address, `/<org>`): the app (eight tabs), the REST API and the
MCP door, all from `src/index.js`. The hosted platform is `ryuklabs-agent-r` (`wrangler.jsonc`): https://agent.ryuklabs.io,
with its workers.dev host as the fallback.

| Read | For |
|---|---|
| `CLAUDE.md` | the layout of `src/` and `tools/`, the local app, the scars |
| `BUILD.md` | the gate, the suites, the ship, the migrations |
| `ORG-SETUP.md` | the operator's page: a second platform on Cloudflare, the local platform, an org's setup |
| `../docs/INSTALL.md` | how a person connects |
| `../docs/plan/ARCHITECTURE.md` | the data model and the door |

What the worker keeps:

- **D1** (binding `DB`) is the truth: each project's knowledge (the `k_*` tables), the ledger (`transmission`, `events`,
  `loops`, `artifacts`, `check_results`, …) and identity (`org`, `accounts`, `people`, `projects`, `project_seats`,
  `tokens`, `signup_codes`). `boot.sql` is a fresh platform's schema; the `migrate-0NN.sql` files are its history.
- **R2** (binding `BRAIN`) keeps blobs, each under its org's prefix: saved files, wrap-up reports, backups, render
  bodies. The org's own facts (name, brand, settings) are its D1 `org` row.
- **KV** (binding `OAUTH_KV`) keeps OAuth only.

`code-atlas.json` maps every source file's exports, routes, D1 queries and R2 keys; regenerate it with
`python3 tools/code-atlas.py > code-atlas.json` (the gate diffs it). The day-to-day commands are in `AGENTS.md` at the
repo root.
