# sharingu — the look (owner, 2026-09-30)

**The bar:** the app must feel as clean as Obsidian and Claude Code, in sharingu's own brand: a design built on shared
parts, never a recolour.

## The brand source (do not invent, do not drift)

`~/batcave_vm/sharingu_website` is the source of truth. Read `DESIGN.md` there first.

| What | Where | Value |
|---|---|---|
| Colour tokens | `_ds/sharingu/tokens/colors.css` | Paper `#f7f5ef` · surface `#fffdf8` · peach `#fbeee3` · ink `#1c1917` · ink-2 `#57534e` · line `#e2ddd3` · orange `#fb923c` · deep orange `#c2410c` (readable emphasis) · dark `#0f0e0d` / `#1a1917` / `#262421` · states: verified green `#059669`, amber `#b45309`, stone `#79716b`, error `#b91c1c` |
| Type | `_ds/sharingu/tokens/typography.css`, `assets/fonts/` (self-hosted woff2) | Manrope for reading (400 / 600 / 700 / 800), Fredoka for the wordmark and character, JetBrains Mono for data and the only ALL-CAPS labels (12px, tracked) |
| Space, radii, motion | `_ds/sharingu/tokens/layout.css` | 4px grid · radii 6 / 10 / 14 · hairline borders `1px var(--line)` · soft sparse shadows · motion 120–200 ms, one curve, never ambient (the one exception, owner 2026-10-01: the Architecture view's travelling dots) |
| Mascot and marks | `assets/brand/u-*.svg`, `goal.svg`, `decision.svg`, `proof.svg`, `question.svg`, `contribution.svg` | U-chan, code-native vectors; lowercase wordmark `sharingu`; no substitute mark |
| The public guide | `brand.html` | the reference rendering |

The app carries them as ONE token set for both worlds, `BRAND_TOKENS_CSS` in `engine/src/shell.js`.

## What "clean like Obsidian and Claude Code" means here

1. **Quiet chrome.** Navigation is a slim rail, not a bar of buttons. One accent (orange) used once per view; everything
   else is ink on paper. Each region of a page is its own card with a hairline edge; never a card inside a card.
2. **Type does the work.** A clear scale (28 / 18 / 14 / 12), Manrope for people's words, mono for ids, counts and
   times. Numbers align. Nothing is ALL CAPS except the tiny mono labels.
3. **Dense but calm.** Lists are rows with one line of meaning and one of context, 36–44px tall, generous left margin,
   no zebra, hover is a tint. A screen shows its most important thing first and never scrolls to reach it.
4. **Every state is designed.** Empty, loading, unreachable and error are each a short phrase ("No goals yet") and at
   most one button — never a blank region, never a sentence of instructions, never a command on the screen.
5. **Fast and keyboard-first.** No layout shift, no spinner for a read under 200 ms, a command palette for
   navigation and search, focus rings that are visible.
6. **Both worlds.** Paper (light) and Ink (dark) from the same tokens, following the system setting.

## Ruled by the owner (MCQ, 2026-09-30, after the sprint-1 ship)

- **Layout:** a slim LEFT RAIL — the wordmark, the project switcher, the eight destinations, then the person, the
  theme switch and sign-out at the foot. Content takes the full height. Under ~860px the rail folds to a top bar with
  a menu.
- **Theme:** follow the system — Paper in light, Ink in dark — with a manual switch that is remembered. Both from the
  SAME tokens.
- **Density:** comfortable (rows ≈ 42px) on Home, Decisions, Goals, Build; compact (≈ 32px) only in the Map's
  inspector and long tables.

## Added by the owner (2026-09-30, after seeing the foundation)

1. **The Map is the MAIN tab.** It gets the highest quality in the product and is highly interactive (pan, zoom,
   layers, search, an inspector that feels instant, lights that change as checks are graded, flows you can follow).
2. **The sharingu logo is clean and universal**: one part, the brand's approved vectors, the same everywhere (rail,
   phone bar, sign-in, public pages, empty states, errors, the favicon).
3. **Numbers, graphs and plots move**: micro-interactions (a number counts up, a bar fills, a row responds) and macro
   ones (sections reveal, a changed metric pulses, a chart draws itself), to draw people in — one shared motion
   system, never per-page animation, off under reduced motion.
4. **Control shows how to connect**: the MCP install and its config for each client, the versions, and the grading
   concept, explained on glass.
5. **Profiles**: a person sets their own profile the way the website presents people — their hat (Management ·
   Engineering · Organization · Go-to-market · Finance · Partner), and the app leads with what that hat needs.
6. **User management is simple**, like Devin or Claude Enterprise: a members list, invite, role, remove.
7. **Broadcast is interactive**, with a live picture of people contributing.
8. **sharingu ships with a starter Broadcast**: simple agents and workflows to equip, following the standard approach
   to building a web or mobile app.

## Ruled by the owner (MCQ, 2026-09-30, evening)

- **Roles:** Admin · Member · Partner (an outside collaborator who sees only the projects they are seated on).
  A typed role label becomes a person's HAT on their profile.
- **Profile:** name, photo or initials, title, one or more of the six website hats (Management · Engineering ·
  Organization · Go-to-market · Finance · Partner); Home leads with what the hat needs; briefings follow the hat. A
  seventh, **Quality** (the testers: test runs, grades on checks, bugs found, release readiness), the owner's MCQ of
  2026-10-10 (`engine/src/hats.js`).
- **Starter Broadcast:** the web-and-mobile app pack — six agents (product spec, UX design, frontend, backend and
  API, QA verify, release), three workflows (build a web app, build a mobile app, fix a bug), three skills (file a
  contribution, grade a check, ask the owner).
- **Connect your AI** shows setup for Claude (Code, Desktop, the claude.ai connector), ChatGPT and Codex.
- **All projects filled:** siru, saruspay and bunny are imported from what is on this machine, so the UI is judged on
  real data across every project.

## The Map, ruled (MCQ, 2026-09-30, night)

- ONE canvas with layers (Screens · Doors · Data · Flows · Deps), Arch and the MCP tool list as views in the same
  toolbar; the seven pages fold into it.
- A LAYERED layout: surfaces → screens → doors → tables in columns, curved links, stable positions.
- All four interactions in the first version: hover highlights links and click pins the inspector · play a flow ·
  live lights when a check is graded · minimap, fit, zoom and keyboard moves.
- Node lights come from a maintained table; a load reads under 1,500 rows.
- Owner, on the mockup: the toolbar and the side panel type were too big — a compact strip (12px pills, 11px mono)
  and a compact inspector (13/12/11px, ≤ 300px wide, truncation not wrapping). It must generalise to large projects
  (siru ~550 nodes, saruspay ~440 nodes / 3,850 checks): level of detail by zoom (dots without labels when zoomed
  out), collapsible clusters, find as the primary way in, dimming rather than hiding, and proven on saruspay and siru.

## Hats, archive and Broadcast, ruled (MCQ, 2026-10-01)

- The ADMIN sets the hats that unlock briefings and cards (`access_hats`); a person's own hats shape only what Home
  shows first. The project archive / reactivate stays on Control.
- Broadcast's live picture: the last week's contributions as dots flowing from people to the goals they name,
  replayed on open and live after; hover follows one person or goal; a dot opens its filing.
- The starter pack is BUILT INTO the product (versioned with the engine, the same shelf for every org); Equip copies an
  item into the project.

## The screens atlas, ruled (owner, 2026-10-01)

"Wireframe and screen should be super cool as well: full screenshots and full wireframes of the various apps inside
the project." The reference is Revyl's Atlas (https://x.com/tryrevyl/status/2103335699969941604); the owner's own
example of the content is `~/Desktop/SarusPay Board.html`.

- A **Screens view** on the Map, per app inside the project: each screen as its real render, else its wireframe, else an
  outline (the person can switch), transitions as the nav edges, states as variants; pan and zoom like the Map; a click
  opens the screen's inspector.
- Efficient in size and render; filed through the MCP in any form (html, image, wireframe), piece by piece, in ONE
  standard format; the core is never customised per project (`ARCHITECTURE.md` §11).

## The revision (owner, 2026-10-02)

The whole front end is revised before the second video, on shared parts, in the brand above. No change to the MCP, the
write door or the tables: the pages read what they read today.

- **Three depths on every page.** Glance: one strip that answers "how is it going" with a number and a shape. Scan: one
  line per row (a title, one status, one number), grouped, with what is settled folded to a single line. Expand: the
  details open in place when asked for.
- **Clear segregation.** A page is a few cards; each has a tiny mono label and one job.
- **People have faces.** An avatar (the person's picture, else their initials) on every row a person owns, and a stacked
  row for who contributed.
- **Shapes over sentences.** A segmented bar for done, in progress and not started; a bar per lane or area; a
  sparkline or small bar chart for a week; a ring for a count of a target. Drawn by the page as inline SVG, no chart
  library. Bars are ink; the status colours (green, amber, red) mean status only; orange stays once per view.
- **One filter row, the same on every list:** status, area or lane, person, time, each chip with its count, the choice
  kept in the address.
- **Show the answer, not the label:** a ruled question shows its ruling in one phrase; ids and refs live in the
  expanded row.
- **Pristine copy — no hints, no explanations on the screen.** A screen holds titles, labels, values, names and
  buttons. It holds no helper paragraph, no "how this works", no legend that explains the product, no sentence telling
  the reader what their Claude could file, no raw call or JSON, no rule spelled out in prose, no "0 of something" that
  says nothing. What a control means lives in its `title` (a hover) and in the docs; what to file next lives on What
  is missing, as a list of items, each with a copy button. An empty region is a short phrase and at most one button.
- **Done when:** every page in both worlds, at 1440 and 390, has been read by the main session and the owner, and the
  copy check (a selftest that reads every renderer's text) finds no sentence outside a title, a value or a person's
  own words.

The parts live in `engine/src/parts.js` (one stylesheet, `PARTS_CSS`, on the shell's tokens) beside `ui.js`; the gallery is
`node tools/parts-gallery.mjs` (eight mock pages, shot in both worlds at 1440 and 390). The rail's current tab is a
view's one orange; the parts use none. The copy check is `tools/copy-check.mjs`; its allowlist is empty and stays
empty. **The owner approved the gallery as shown (MCQ, 2026-10-02)**, with one new read
(contributions per day and person for the last 7 days) and initials for faces (a person's own picture comes later: `PLATFORM.md` §4, after the road).

Order: the parts and their gallery (approved) → Home, Goals, Decisions, Build, GTM →
the detail pages (a goal, a question, a contribution and its Impact, a card, a doc, a preview, the Library, What
changed, What is missing, Broadcast, Control, Profile, Versions, Activity) → the Map's views get the copy rule only.

## Rules for every screen change

- Shared parts and tokens only: the parts in `engine/src/ui.js` and its one stylesheet; the tokens in
  `engine/src/shell.js`.
- `engine/tools/shots.mjs` shoots the local app in both worlds at 1440 and 390 wide (`--cookie` as a signed-in user);
  the builder LOOKS at every shot, and the owner gets them.
- The semantic hooks stay: every `data-region`, `data-button`, `data-door`, `data-state` attribute and every route
  keeps its name, so the smoke and the suites keep proving behaviour while the markup around them changes. A check
  that pins old class names or old copy is deleted, not re-pinned.
