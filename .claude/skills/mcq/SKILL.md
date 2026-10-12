---
name: mcq
description: Fold anything — a decision, an explanation, a fork in the road, or a worker's escalation — into clean multiple-choice questions the user answers by picking a number, with "type your own" always available. Reusable anywhere, any number of times, before or after planning. Calls /draw for an inline visual when a picture makes the choice clearer. If the project keeps a plan, writes the ruling back into it. Use when the user types /mcq, or says "quiz me", "give me options", "fold this into an MCQ", "turn this into multiple choice", "what are my choices", or when a decision genuinely needs the owner.
---

# /mcq — fold anything into a choice

The user thinks in choices, not paragraphs. Whatever is on the table — a decision to make, an explanation
to check, a fork a worker hit — turn it into pick-one questions. This is the same engine a planning session uses to
grill unknowns; here you can aim it at anything, as many times as needed.

## What you were handed

The argument after `/mcq` plus the live context is the material. Common shapes:

- **A decision** — "which auth flow?" → options with trade-offs.
- **An explanation to confirm** — the user wants to check their understanding → fold your explanation into
  "which of these is right?" so they answer instead of just nodding.
- **A fork mid-work** — a builder hit a choice that is the owner's → surface it as an owner MCQ.
- **A scope/spec call** — "should this slice include X?" → in/out options.

## The format

For each question:

1. A short, specific question ending in `?`.
2. **2–4 concrete options**, each a real distinct choice with its consequence in one line. If you have a
   recommendation, make it option 1 and mark it `(recommended)`.
3. **The user can always type their own answer** as a choice — state this once; never force the list.

Prefer the `AskUserQuestion` tool when it fits (it renders the choices cleanly and captures the pick). For
a quick inline set, a numbered markdown list is fine. Keep options mutually exclusive unless you say
"pick any that apply".

When a choice is clearer *with a picture* — comparing two flows, showing where a fork sits in a
pipeline — call **/draw** and put the render beside the question.

## After the answer

- **Act on it** — the answer is a decision; apply it (or hand it to whatever was waiting).
- **If the project keeps a plan** (in this repo, `docs/plan/`), write the ruling where the plan keeps
  rulings, with its date, and move the work it unblocks back into the queue. Keep the plan the single
  source of truth.
- **Fire again freely** — MCQ is repeatable. A planning session often needs several rounds before and
  after the plan is written.

## Boundaries

- One decision per question — don't smuggle three choices into one.
- Never silently pick for the user on a genuine fork; that's the whole point of surfacing it.
- Options must be honest — no filler option to pad the list to four.

## Standalone, always

This skill **works standalone in any repo** — the decision and its answer are recorded straight into the
project's plan file (or, with no plan file, simply acted on in the conversation), nothing else installed
required. There is no second, sharingu-only mode: the answer lands in the plan file itself —
no redeploy, no second store for decisions.
