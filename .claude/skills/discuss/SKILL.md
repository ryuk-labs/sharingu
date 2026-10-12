---
name: discuss
description: A MODE, not a one-shot render — while active, the session reads, draws, mcqs, scouts, and explains, and writes NOTHING (zero filings, zero edits, zero commits, zero pushes or ships). Everything foldable accrues in a visible CANDIDATES ledger, rendered at every turn end. The only exit is the owner's own natural-language confirm ("fold 1 and 3"), which releases exactly those candidates to their normal doors. Invoke with /discuss, or when the owner says "let's just talk this through", "don't build anything yet", or "discuss mode". Use when the owner wants to think out loud without an agent under broad permissions silently starting to act on it.
---

# /discuss — think, without the drive

An agent running under broad permissions has DRIVE as its resting posture: unspecified words read as
steering, and a session can end up filing, committing, or pushing a verb the owner only meant as a
thought. `/discuss` makes intent structural instead of guessed — it doesn't ask the model to be more
careful, it removes the doors.

## While the mode is active

- **Reads freely** — explore the repo, run read-only commands, answer questions, explain code.
- **/draw and /mcq stay open** — they don't write product state; they visualize and ask. Use them
  exactly as normal.
- **Every write door refuses, by name** — a filing through the MCP, a file edit, a commit, a push, a
  ship all refuse with the mode itself as the stated reason. The gate is THIS rule, held by the
  session in-context. Say the refusal out loud when it happens; never silently drop the intent.
- **Nothing foldable is lost** — anything that WOULD have gone through a write door instead becomes a
  numbered row in the CANDIDATES ledger, and the full ledger renders at the end of every turn (an
  empty ledger still renders "none yet", never omitted).

## The only exit

The owner confirms in plain language which candidates to release — "fold 1 and 3", "fold all". A bare
"fold" or anything that doesn't name numbers or "all" changes nothing (never guess which candidates
were meant). A real confirm releases exactly the confirmed rows, each through its OWN normal door (a
filing through the MCP door, a commit through git, a plan change through `docs/plan/`), and leaves the
rest sitting in the ledger for a later confirm. Discuss mode itself
only ends when every candidate the owner wanted has been released; anything left unconfirmed just
keeps accruing.

## Boundaries

- Never fold on your own judgment — a candidate sits in the ledger until the owner's own words release
  it, not until it "seems obviously right."
- Never paraphrase the confirm into a guess — if it names no numbers, ask, don't act.
- The ledger is conversation state, not a file — nothing here is written to disk until a confirmed
  candidate is released through its real door.

## Standalone, always

This skill **works standalone in any repo** — the write-door gate and candidates ledger are this
skill's own text and the session's ledger block, nothing sharingu-specific required to hold the mode or track
what accrues in it. A released candidate rides the SAME doors every other action already uses (an MCP
filing, a commit, a plan edit) — no second write path, no separate sharingu-only release mechanism.
