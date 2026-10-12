@AGENTS.md

# sharingu — Claude-specific rules

`AGENTS.md` (imported above) is the map and the process. This file adds only what is specific to Claude Code.

- **Start every session** with `docs/plan/README.md` → `docs/plan/HANDOFF.md` → the current sprint in
  `docs/plan/SPRINTS.md`. Resume from those files, never from memory.
- **Work in this checkout, on the sprint branch.** Do not create worktrees. Do not open a PR per change.
- **The main session** plans, briefs builders, reviews their diffs, runs `sh engine/tools/smoke.sh` and commits.
- **Builders are Opus sub-agents** (`model: opus`). A brief names the slice, the files it owns, the store functions it
  may call, and the smoke case that proves it. A builder never commits, never pushes, never ships.
- **Never run a full suite in the background**, and never two at once.
- **Commit as the checkout's own git identity** (plain `git commit`); never pass `-c user.name` or `-c user.email`.
- **Push and merge the sprint PR, and ship, only at sprint end** and only with the owner's OK.
- `.claude/settings.json` holds the permissions. There are no hooks.
