# The beta gate — GREEN (opened 2026-10-01, closed 2026-10-06)

One page: what beta means, and the proof each line closed with. The slices are in `SPRINTS.md`; what happens next is
`HANDOFF.md`'s queue (the invites, then the platform road in `PLATFORM.md`).

## What "beta" means (the gate — every line is checked on LIVE)

1. **A new member, end to end.** Invited on Control → connects their Claude with the command Connect shows → gets or
   creates a project → hands Claude real input (a repo, docs, screenshots, a discussion) → sees the preview → files →
   every tab fills and the meter moves → answers one question → grades one check → files one change and sees its
   impact and the stale light → regrades. Walked by `node tools/live-walk.mjs` on a throwaway project AND once by hand.
2. **Our five projects are live** (sharingu, ryuklabs, siru, saruspay, bunny), each with its screens atlas, and each
   meter matches what the data really holds (`MCP.md` §6).
3. **Three clients proven:** Claude Code (the inline render and the confirm), Claude desktop or web (the card), and one
   tools-only client (Codex or ChatGPT) through the two-call fallback.
4. **Inside the budget:** no screen or MCP read over 1,500 rows. On our account (Workers Paid) a day of the walk plus
   normal use is priced against the month's allowance; on a stranger's free account it stays under half of every
   daily limit. **Proven on live 2026-10-05** (`SPRINTS.md`, S4-1): the day after the ship, with the walk, the grading run
   and the crons, cost 132 requests, about 1.46 million rows read and about 45,000 rows written — 0.1%, 29% and 45% of
   a free account's daily limits.
5. **Safe:** one adversarial read of the auth and the render sandbox done and fixed; the backup includes the knowledge
   tables; a rollback command is written down for every ship.
6. **Honest docs:** `docs/INSTALL.md`, Control · Connect and the built-in start-here name only the new tool names
   (measured by `tools/names-check.mjs`).
7. **A stranger can install it** (owner, 2026-10-01: an outside beta team runs sharingu on its OWN Cloudflare account):
   a fresh org is minted on a second Cloudflare account from `docs/INSTALL.md` alone, its first run leads straight to
   "create a project and fill it", and the member path of line 1 passes there.

Not in the gate: the Claude plugin (`PLATFORM.md` sprint 9) and the store listings (`MARKETPLACE.md`). The release form and its licence were
ruled at the close (below, item 6).

## The rule for the rest of the road (owner, 2026-10-01 and 2026-10-02)

Everything is built, tested and fine-tuned END TO END on the local app first, on real data. Nothing goes to Cloudflare
until the local run of the gate is green. The old path is deleted before the ship (no dead code, no dead docs): done
(D6a, and D6b with the names). The second video is recorded LAST of the local steps. Then ONE push: the migrations
in order, the org's row written on live from its served `tenant.json` (`tools/org-row.py`, through `tools/migrate.sh`),
one ship, the gate on live.

## How each line closed (2026-10-05/06)

Sprints 1–4 are merged to `main` (the slices sprint by sprint: `SPRINTS.md`); live runs sprint 5 (shipped 2026-10-06,
the record in `HANDOFF.md`). Sprint 4 closed the machine-provable gate lines: line 4 proven on live (below), line 5's
adversarial read done and fixed (the sprint-4 review), line 5's restore rehearsed against a remote D1, line 6 measured
by `tools/names-check.mjs`, and the Map built. The road after the ship, where each stands:

1. **The sprint-4 ship — DONE** (2026-10-05, the owner's OK): the walk on live 13/13, verify-live 18/18.
2. **Line 1's hand walk — DONE**: the scripted walk 13/13 on live; a real-browser member walk 10/10
   (`engine/.runs/hand-walk-s4/`).
3. **Line 3, the three clients — CLOSED, done and approved by the owner (2026-10-05):** the tools-only two calls on
   live (`T-20261005-043`); Claude Code through `sharingu-live` (the two-step filed `T-20261005-045`; the confirm's
   door side proven — Claude Code desktop declares elicitation and auto-declines without a card, so its users get
   the two-step until that client fixes it, the finding in `HANDOFF.md`); the card through the claude.ai custom
   connector over OAuth, signed in as the owner seat (`whoami` → `rl-owner-0001`, owner-class tools exposed).
4. **The second video — DONE** (the final take `~/Desktop/sharingu-walkthrough-v2.mp4`, 3:26).
5. **Line 7** — the stranger's install: CLOSED for beta (owner, 2026-10-05) by the local run from `docs/INSTALL.md`
   alone (a fresh clone, `r-local.sh up`, the first-run ritual, day0-verify 17/17); re-proven on the platform's
   first-run path (sprint 7, 7.6: `r-local.sh up <name> --empty`, the operator's code → sign-up → create the org,
   day0-verify 25 passed, 0 failed); the second-Cloudflare-account run happens with the first outside team's real
   install.
6. **The release form and its licence — RULED** (owner MCQ 2026-10-05: collaborator invites + `docs/BETA-NOTE.md`,
   MIT as-is; public with the plugin). **Left: the invites themselves — the one open item, the owner's; ruled
   2026-10-06: they go out after sprint 7's hosted front door ships, none before.**

## Known risks, and the answer to each

| Risk | Answer |
|---|---|
| A stranger's free account allows about 10 ms of CPU and 50 subrequests a request, which the local worker does not enforce (sanitising and hashing 50 real renders took about 12 ms on the Mini) | the importer's `--max-bytes` ladder; the door's 256 KB body cap a call refuses clearly; the stranger's install is rehearsed on a second account |
| The card and the confirm need a streamed answer from the worker | built (D3) and proven by a selftest client; the three real clients are walked by hand at the gate; the two-call `preview` → `file` always works |
| One sprint with everything means one large review | per-slice commits; the reviewer reads slice by slice |
| The Mini is shared | suites only under load 8, one at a time |

## Rules this road has taught

- **A builder's "green" is a claim.** The main session reruns the smoke, every selftest and the row budget, commits,
  then runs the gate.
- **A screenshot is not a signed-in user.** A new kind of request (a frame, an image, a poll) is checked on the
  cookie-only path (`tools/shots.mjs --cookie`, or a real browser) before the commit.
- **Rows written are counted, not estimated.** An import states its count from the local worker first.
- **A migration the code depends on goes live before the code.**
- **A doc names only what exists; history is deleted, not annotated** (`tools/check-docs.py` is a gate step).
- **New asks go into a step or after beta.** Nothing new is added without removing something or moving the gate.
