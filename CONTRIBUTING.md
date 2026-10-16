# Contributing

For the internal team (GitHub team `sharingu-devs`, write access). sharingu is proprietary (© Ryuk Labs, [`LICENSE`](LICENSE)):
nothing here leaves the team.

## Before you start

- Read [`docs/plan/HANDOFF.md`](docs/plan/HANDOFF.md) (where things stand, what is next) and open the team board,
  [`docs/board/board.html`](docs/board/board.html).
- Read [`AGENTS.md`](AGENTS.md): the process and the laws. The short version: the MCP is the only input, D1 is the truth,
  one product (nothing per org or project), no dead code and no dead docs.

## Your first day

1. Clone [ryuk-labs/sharingu](https://github.com/ryuk-labs/sharingu). The gate's history checks also need the old repo as a remote:
   `git remote add archive https://github.com/ryukdev/sharingu.git && git fetch archive` (ask the owner for access).
2. `cd engine && npm ci`.
3. Credentials live in one machine-local file, `~/.sharingu/env-sharingu.sh` (chmod 600; never committed, never
   printed). You need it only to touch live or push to the plugin's repo; local work needs none. Ask the owner.
4. The local app with real data: `sh tools/dev-local.sh up` (it prints the URL). The per-slice proof: `sh tools/smoke.sh`.
5. Prove live is healthy any time: the "validate in ten minutes" table in HANDOFF.

## Making a change

1. **Pick a gap.** The board's Gaps section (it is [`docs/plan/PLATFORM.md`](docs/plan/PLATFORM.md) §3) lists every
   open item with how to close it. Tell the owner which one you take.
2. **Work on the sprint's branch** (`sprint-N`, off `main`), as vertical slices: the table, then the MCP/REST write, then
   the screen that reads it, with a smoke case. Tests follow the code: a replaced page's old checks are deleted.
3. **Before your PR:** the touched selftests, `sh tools/smoke.sh` and `sh gate.sh` green (from `engine/`), the board
   regenerated if a source moved (`node tools/make-board.mjs`). An auth change gets an independent review first.
4. **One PR per sprint**, merged with the owner's OK. A ship to live is the owner's call and runs `sh tools/ship.sh
   ryuklabs` ([`engine/CLAUDE.md`](engine/CLAUDE.md), Ship).
5. **The door's contract** changes through [`contracts/README.md`](contracts/README.md).

Installing, joining an org, or standing one up: [`docs/INSTALL.md`](docs/INSTALL.md). Security reports:
[`SECURITY.md`](SECURITY.md).
