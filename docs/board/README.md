# The board

`board.html` is the take-over board: one self-contained page (open it in any browser, offline) for a dev team taking
sharingu over — Start · Product · Design · Build · Verify · Go-live · Gaps · Decisions · History, with a search (press /),
deep links (`#build/tools`) and the Paper and Ink themes. It is GENERATED from the repo's own files (each section names its
source: edit the source, never the page) and reads no live data, so it holds no secret and no applicant's details.

Regenerate, from `engine/`:

```
node tools/make-board.mjs            # writes docs/board/board.html from the sources
node tools/make-board.mjs --check    # the gate's step: exit 1 when the page is stale or holds anything shaped like a secret
node tools/make-board.mjs --shots    # refreshes the pictures in shots/ from a local reviewer world, then writes the page
```

`--shots` needs the 1-minute load under 8 and the pinned Chrome for Testing; it starts its own local worker (port 8851 by
default, `--port` in 8850–8879) and takes it down after. The pictures are kept in `shots/` because `--check` needs no worker.

After each sprint the page is synced to the private repo ryuk-labs/sharingu-board.
