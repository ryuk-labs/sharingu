---
name: draw
description: Render context as an inline visual — a workflow, architecture blueprint, state machine, sequence, data-flow, or a plan's phase map — so the user sees the mental picture instead of reading prose. Standalone, or called by /mcq when a picture beats words (there is no /plan skill — a plan file's phase map is drawn on request). Produces an inline rendered diagram (the visualize tool when available, otherwise a mermaid or SVG block). Use when the user types /draw, or says "visualize this", "show me a diagram", "draw the flow", "blueprint this", "map this out", "render the architecture", or "let me see it".
---

# /draw — show the mental picture

The user often wants to *see* a thing — a flow, a blueprint, a shape — not read a description of it. Turn
the context into an inline visual. Standalone when asked directly; on call when `/mcq` decides
a picture beats prose.

## Pick the shape to the content

- **Workflow / process** → flowchart (steps + arrows + decision diamonds).
- **Architecture / system** → boxes-and-edges blueprint (components, who talks to whom).
- **States / lifecycle** → state machine (nodes = states, edges = transitions).
- **Order of events** → sequence diagram (actors + messages over time).
- **A plan's phases** → the phase map (P1→P2→… with gates and the status of each).

## How to render (best available first)

1. **The visualize tool** (`mcp__visualize__show_widget`) — the default for a rich inline render, when
   that MCP is connected. Call `mcp__visualize__read_me` (module `diagram`) first, silently, then emit a
   clean SVG. This is what the user means by "inline render."
2. **Mermaid** — when a lighter, text-native diagram fits, or the visualize tool isn't available. Fence it
   as ```mermaid so it renders inline.
3. **Inline SVG** — for full control of a bespoke blueprint, or when neither of the above is available.

## Keep it clean (the whole point is clarity)

- One idea per diagram. If it needs a legend longer than one line, split it into overview + detail.
- Sparse boxes: a label and ≤5-word subtitle. Detail goes in the prose beside it, not inside the box.
- ≤2 colour meanings; if colour encodes something (status, tier), add a one-line legend.
- Sentence case, no emoji, flat fills (no gradients/shadows).
- Explanatory text goes in the response *around* the visual, never crammed inside it.

## When called by another skill

- **For the plan** — usually the queue: render its steps as a flow (in this repo, the queue in
  `docs/plan/HANDOFF.md`), each coloured by its state (done, in flight, queued) so the picture doubles as a status
  board.
- **From /mcq** — render the thing being decided (two flows side by side, where a fork sits) so the choice
  is obvious at a glance.

Return the render inline and a one-line caption. Don't repeat in prose what the picture already says.

## Standalone, always

This skill **works standalone in any repo** — it renders inline in the conversation (and writes a source
file for the diagram when one is asked for or the caller needs it, e.g. a plan's phase map), nothing else
installed required. There is no second, sharingu-only mode: a diagram that becomes part of a
durable artifact (a plan) lives in that artifact's own file and its git history — never a second,
parallel diagram store.
