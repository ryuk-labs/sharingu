# sharingu — the plan (start here, any session, any account)

This folder is THE plan. Read it in this order (`BETA.md` is the closed beta gate with each line's proof):

1. `HANDOFF.md` — where we are right now and the queue. **Always current.**
2. `SPRINTS.md` — the slices built, sprint by sprint.
3. `ARCHITECTURE.md` — the system: the data model, the MCP door, the reads, the three loops, the standards.
4. `INVENTORY.md` — where each screen reads and renders, the project rule, the known faults, auth and the hooks. Read
   the section for the area you are touching.
5. `MCP.md` — the door: the pages and their reads, the 37 tools, the validation runs.
6. `LOOK.md` — the look: the brand source, the quality bar and the owner's rulings.
7. `PLATFORM.md` — the road from beta to launch: sharingu as a hosted platform (one worker, one database, many orgs), sprints 6–9, and
   the residual ledger: every open item with the sprint that closes it.
8. `MARKETPLACE.md` — the listings on Claude and ChatGPT / Codex, and what the owner prepares.

## What sharingu is (owner, 2026-09-30 — the model every line of code serves)

A closed loop for everything happening in an organisation. Contributions come from many kinds of people and from their
AI tools; the MCP turns each one into structured records; the app shows them; people decide on them; what is still
missing feeds the next contribution.

- **The MCP is the only input.** Agents (and people, through their Claude or Codex) extract data from wherever it lives
  and FILE it through sharingu's MCP door.
- **sharingu holds its own truth, in D1.** Goals, the aim, questions with their options and rulings, checks and their
  grades, cards, the model (screens, doors, tables, flows, gaps), the GTM template, docs — all in D1 tables inside the
  org's worker. No git "brain" repo is needed to run sharingu; the old brain repos are a one-time IMPORT SOURCE.
- **Everything is live.** An MCP write shows on the app at once. Every tab reads D1. No publish step.
- **Versions are snapshots on demand** (`publish_version`, `restore_version`).
- **One product; orgs and projects differ only by data.** No per-org or per-project code. From sprint 6 one worker and
  one database serve every org (`PLATFORM.md`); until then the live org is ryuklabs, one worker of its own.
- **The three loops are the beta proof** (the full gate is `BETA.md`):
  1. `missing` → file what it names → it shows, and the item closes;
  2. `decisions` → `respond` with an option → the question shows decided (owner) or answered (member) at once;
  3. a check → `submit_grade` with proof → the check shows graded on its goal and lights its map node.

## How we work (owner, 2026-09-30)

- **One sprint, one branch** (`sprint-N`), in the main checkout. No per-change worktrees, PRs or verifiers.
- **Vertical slices.** Each slice is built table → MCP/REST write → the screen that reads it, and committed when
  `sh engine/tools/smoke.sh` is green. A screen changes in every slice after the core.
- **Tests follow the code.** A replaced page's old text pins are deleted, not re-pinned; the smoke and a selftest for
  new logic replace them.
- **One review at sprint end:** the full suites once, one independent read-only review of the whole sprint diff, fixes,
  ONE PR, merge, ship, a live walk of the three loops.
- **Builders are Opus sub-agents** briefed by the main session, which reviews every diff and commits.
- **Forks go to the owner as MCQs** (recommended option first, each with its cost).
- **No dead code, no dead docs** (owner, 2026-10-02): a doc names only what exists; history is deleted, git keeps it.
- **Status lives here:** `HANDOFF.md` at every stop, ticks in `SPRINTS.md`, open items in `PLATFORM.md` §3. Nothing
  else.

The full process and the commands: `AGENTS.md` at the repo root.
