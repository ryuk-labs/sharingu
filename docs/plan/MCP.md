# The MCP, whole — the door's plan

The owner's ask: the MCP is how ANY input (docs, screenshots, code, a discussion, anything the person's AI client can
reach) becomes knowledge in sharingu, and how any person's AI gets knowledge back out. It must be visual enough that the
person understands what is about to be filed and graded, and nothing may fall between the door and the screens.

The door's counts below are read from `contracts/door.json` (2026-10-08, sprint 7's branch). `ARCHITECTURE.md` §11–§12 are
the standards the door builds on.

## 0. Ruled by the owner (MCQ, 2026-10-01)

- The person's AI client reads the input where it lives and extracts; sharingu runs no model.
- The admin's agent creates a project through the MCP.
- "Filled" is a full checklist per page, with a fill meter.
- A light goes STALE when what it proves changes after the grade (a new picture of a screen does not: 2026-10-02).
- **Every filing is previewed first — always.** The preview shows what will be filed, where it will show, how it will be
  graded and what it reaches.
- The preview and the receipt are a card in the chat where the client can draw one, the same page in the app, and an
  inline text render for CLI users.
- The plan is validated on our own scattered data, across every project we hold.

## 1. The app: eight tabs, their pages, and the reads on the door

Every page below lies under its org's address, `/<org>/…` (sprint 7).

| Tab | Pages | Read through the MCP by |
|---|---|---|
| Home | `/home` · What is missing `/missing` · the Library `/library`, `/doc/:path` · `/profile` · `/projects` | `home`, `missing`, `read {kind: "doc"}`, `read {ref: "doc/<path>"}`, `changes` |
| Build | `/build` · a contribution `/contribution/:id` and its impact · a preview `/preview/:id` · the viewer `/view`, `/artifact/:id` | `build`, `read {ref: "T-YYYYMMDD-NNN"}`, `impact`, `read_file` |
| GTM | `/gtm`: the strategy (docs under `gtm/`), the card kinds that name GTM, follow-ups due | `gtm` |
| Goals | `/goals` · one goal `/goals/:ref` | `goals`, `goals {ref}` |
| Decisions | `/decisions` · one question `/question/:qid` | `decisions`, `decisions {qid}` |
| Map | `/map` (layers, Arch, Screens `/map/screens`) · `/map/:plane` · the inspector `/map/node` · Versions `/versions`, `/versions/:v` | `map {plane}`, `map {ref}`, `map {plane: "screens"}`, `versions` |
| Broadcast | `/broadcast` · the live picture `/broadcast/live` · a starter item `/broadcast/starter/:slug` | `broadcast` (writes: `publish`, `equip`) |
| Control | `/control` (Members · Projects · Connect · Admin) · `/audit` | `whoami` (write: `create_project`; people and keys stay in the app) |

Extract pages, one function with their tools: `/search`, `/read` (a card's own page is `/read?ref=card/…`), `/changes`,
`/brief`, `/impact`. The platform's own routes, at the root: sign-in `/login`, sign-up `/signup`, the org picker `/orgs`,
creating an org `/orgs/new`, the one MCP address `/mcp`, `/install`, `/health`. Outside the tabs: public `/docs`; the
contract `/capabilities`, `/contract`, `/formats`.

The owner utilities: `/log`, `/storage`.

## 2. The door today: 35 tools, 87 REST rows (57 GET, 30 POST), 138 error codes

The tools are §5's. For an owner, the `tools/list` answer is 36,715 bytes of compact JSON and the descriptions 8,405
characters (measured 2026-10-08 on a local worker; every tool's schema carries `orgSlug` since sprint 7).
`GET /capabilities` serves the inventory generated from the contract: every tool and route, read or write, who may call
it, and whether you may. `POST /rank` and `POST /round` are REST only, for Build's Rank button and Decisions' Add to round.

## 3. Every kind of change, and where it lands

| A change to | Enters as | Shows on |
|---|---|---|
| The architecture | the `architecture` node, service and dep nodes, `depends` edges | Map · Arch; changed since the version on every tab |
| The app (screens, flows, doors, tables) | node, edge, render, style | Map, Screens; the node's grades go stale |
| The GTM strategy | docs under `gtm/` | GTM · Strategy; a change is a contribution with its impact |
| GTM activity | a contribution in lane `gtm` (expected, actual, proof) | GTM |
| A decision | question, options, `respond`, `rule_question` | Decisions |
| A goal | goal; a contribution's `goalRef` | Goals, Home |
| Proof | check, `submit_grade`, `regrade` | Goals, Map lights; stale after a change, fresh again from a page |
| A version | `publish_version`, `restore_version` | Map · Versions; what changed since it, on every tab |
| Agents and workflows | `publish`, `equip` | Broadcast |
| People and seats | — (the app only) | Control |

Every write in this table goes through `preview` → `file`.

## 4. The architecture, whole

**One registry drives everything.** Each kind declares, in ONE registry (`engine/src/knowledge/schema.js`, the
contribution shapes in `engine/src/shapes.js`), its format, the page and region it shows on, its checklist items and its
line on a preview. The door's validation, `formats`, the checklist and its meter, the preview and the contract are
generated from it, so a kind cannot be fileable and not shown, or shown and not fileable.

**Two directions, one vocabulary.**

- *Add:* the client extracts → `preview` (nothing filed: each item with its kind, where it shows, its grade and route,
  what it reaches, and what was left out) → the person confirms → `file` (the same items, checked against the preview's
  digest; the knowledge items land all or nothing, then contributions, grades and answers, each part under its own
  clientRef so a retry files only what did not land) → a receipt with links.
- *Extract:* `search` (one search across everything a seat may read), `read` (one item by its ref, or a kind's list),
  the eight tab reads, `changes` (since a time or a version, with what each change reaches), `impact` (for a ref, before
  changing it), `brief` (the work packet for a role or a ref).

**How the person sees it.** One preview, three renders of the same data, all built: the inline text in the tool's
answer, the page `/preview/:id`, and the card in the chat (MCP Apps: the resource `ui://sharingu/card`). The confirm is
`preview {fileOnConfirm: true}`: a client that declared elicitation is asked (on the call's own stream, or as an "input
required" answer it retries) and the preview is filed on a yes. `publish {publishOnConfirm: true}` and
`equip {equipOnConfirm: true}` ask the same way: one confirm row holds what was shown, and nothing is published or
equipped before a yes (a decline or a timeout writes nothing). The two calls, `preview` then `file`, always work. The
door speaks MCP 2025-06-18 and 2026-07-28 on one endpoint, `/mcp` at the platform's root, for every org.

**Orgs on the door (sprint 7).** An OAuth grant is an ACCOUNT's (signed in with the account's passphrase: the account's
own seats) or a SEAT's (signed in with a seat's key: that seat forever); a bearer key is its seat. Every tool and
resource takes an optional `orgSlug`: an account's grant acts as its seat in that org (left out, its current org); a
seat's grant or a key acts in its own org alone. An org the connection does not reach answers `org_unreachable` before
the call runs, the same answer whether that org exists or not. `whoami` lists the orgs the connection reaches (slug, name, role, current).
`whoami` also answers the plan (sprint 8, 8.4: `plan`): the plan whose limits apply, each limit with its usage and its
state (`ok`, `warn` from 80%, `limit` at it), storage split into files and screen pictures, counted exactly as the write's
check counts them; a Partner reads the plan's limits only, never the org's usage.
The OAuth sign-in form asks which org when the account holds several (an org is never defaulted), and a grant reaches
ACTIVE seats only: a pending seat — one its holder has not yet accepted on the picker (`POST /orgs/seat`) — opens
nothing on the door.

**The plan's answers (sprint 8).** Every tools/call and signed-in REST write is one of the org's counted calls; past 80%
of any limit the answer carries `planWarning`, at 100% a WRITE is refused `plan_limit` (its own numbers, never another
org's; reads always answer), the burst and the day answer 429 with Retry-After. A suspended org's people get one 403
`org_suspended` on every door until the operator lifts it.

**Impact and stale proof:** `ARCHITECTURE.md` §12. The preview shows the reach before the write; the Impact view shows
it after.

**Versions.** Four things carry a version: the project's knowledge (`publish_version`), the engine (the deployed worker,
shown on Control · Connect), the door's contract (`/contract`), the starter pack. Every tab marks what changed since the
project's current version, from the same read as `changes`.

## 5. The tool surface (35 names, one vocabulary)

| Intent | Tools |
|---|---|
| Start | `whoami`, `updates` (what changed for you and what waits on you) |
| What is missing | `missing` (the checklist), `formats` |
| Add | `preview`, `file` |
| Decide and prove | `respond`, `rule_question`, `submit_grade`, `regrade`, `decide_contribution` |
| Carry forward | `pick_up`, `open_items`, `wrap_up` |
| Find | `search`, `read`, `changes`, `impact`, `brief` |
| Read a tab | `home`, `build`, `gtm`, `goals`, `decisions`, `map`, `broadcast`, `versions` |
| Files | `save_file`, `read_file` |
| Ask | `ask` |
| Agents | `publish`, `equip` |
| Admin | `create_project`, `publish_version`, `restore_version` |

**Regrade (sprint 4, R1):** `regrade` {flow | node | checks} observes each stale or ungraded check's own page as the
caller (one GET each, at most 8 a call) and files what came back as its grade; a walk, a check of another kind or an id it
cannot fill comes back under needsProof with its preview call. Its REST twin, `POST /regrade`, is the Regrade press on a
flow's view, a Map node and the Impact view: the first press shows the plan, the second files.

**The words (owner, 2026-10-01): the thing people file is a CONTRIBUTION; the verb is "file".** Also: a **knowledge
item**, a **check** and its **grade**, a **question** and its **ruling**, a **version**, an **open item**. The engine's
vocabulary check (`tools/check-vocab-selftest.mjs`) bans transmission, handoff, loop, heartbeat, capsule, holes and
envelope on every face, the door's names and texts included.

**Titles and annotations:** every tool has a title and the four MCP annotations, set by one rule (read-only when it
writes no row: 18 tools; open-world only `wrap_up`, which may open a GitHub issue); `tools/annotations-selftest.mjs`.

## 6. Validation on our own scattered data

The ship candidate, as audited (`engine/.runs/ship-candidate/auditB-final.txt`, `tools/audit/project-audit.mjs`):

| Project | Screens | Doors | Checks (graded) | Open questions | Aim | Goals | GTM template | Gaps | Meter | Worst load (rows) |
|---|---|---|---|---|---|---|---|---|---|---|
| sharingu | 33 | 196 | 266 (263) | 2 | yes, measure open | 55 | yes | 6 | 87% | Map 1,362 |
| saruspay | 195 | 182 | 3,851 (0) | 23 | yes, measured | 66 | no | 0 | 90% | Map 1,462 |
| bunny | 130 | 164 | 3,008 (0) | 0 | yes, measured | 56 | no | 0 | 84% | Map 856 |
| siru | 338 | 0 | 0 | 0 | yes, measured | 19 | no | 49 | 57% | Map 600 |
| ryuklabs | 0 (no model, by design) | 0 | 0 | 0 | yes, measure ruled absent | 24 | yes | 4 | 92% | GTM 153 |

Each meter recounts true; sharingu's measure was ruled after this audit (activated organisations). On the current code
a fresh import of the five writes 169,956 rows.

The runs (a Claude agent holding only the MCP and the source; what it could not work out from the door alone is a bug
in the standard, fixed in the core, never in a per-project note):

| Input type | Our example | State |
|---|---|---|
| Code | this repo → sharingu's model and checks | done, by the importer's code layout (`tools/import/read-code.mjs`) |
| A board file | `~/Desktop/SarusPay Board.html` → screens, renders, flows | done, by the importer (`read-board.mjs`, `read-renders.mjs`) |
| Screenshots | sharingu's own screens → image renders | done: 30 screens pictured through the MCP |
| Docs | `docs/plan/*.md` → the aim, goals, decisions | done (sharingu's overlay) |
| A discussion | the owner's rulings → questions with their rulings | done (sharingu's overlay) |
| A knowledge bank | siru's bank → its aim, goals, measure | done (the basics fill) |
| An ops brain | ryuklabs → a project with no product model | done (the basics fill) |
| A team context pack | `~/Desktop/sharingu-team-context.md` → claims, GTM docs | done (sharingu's overlay) |
| An outreach workspace | `~/Desktop/ryuk_labs_MASTER-CONTEXT.md` → GTM cards | done: ryuklabs holds 9 claims, 14 targets and 8 copy cards, listed on GTM |
| Public material | the sharingu website → the `demo` project | done on the candidate (sprint 4, 2026-10-05: 31 items in 5 batches through preview → file, the overlays under `tools/import/overlays/demo/`; the meter 10 of 16; the aim's measure and the supported clients left as the owner's two open questions); filed on live at the sprint-4 ship |
| A change | a commit → a contribution with what it touches | done by the walk (`tools/live-walk.mjs`: a change from its sample repo, its impact, the stale light, the regrade) |
| Read side | five questions per hat (management, engineering, GTM, finance, partner) through `search`, `read`, `changes`, `brief` | P3 run (sprint 4, 2026-10-05, `engine/.runs/p3/REPORT.md`): 17 answered, 7 partial, 1 not answerable (finance holds no money); no answer over 1,500 rows (largest 789); the faults are sprint 4's P3-F slice and two owner questions |

## 7. Ruled on this plan (MCQ, 2026-10-01)

- **Tool names: renamed at once, no aliases.** Built (`7fafeb61b`): the names of §5 (34 then; `regrade` made 35 in
  sprint 4), with every caller in the same commit — the importer, the smoke, `live-walk`, the suites, the starter pack, the built-in start-here text, Control ·
  Connect, `contracts/door.declared.json`. On the sprint-3 ship every connected client, saved prompt and script that
  uses an old name breaks; the release note, `docs/RELEASE-NOTES.md`, lists old → new.
- **The GTM strategy lives as docs under `gtm/`**, shown as a Strategy section on GTM; strategy questions go to
  Decisions; a strategy change is a contribution with its impact. No new kind.
- **One sprint 3 with everything**, one review, one ship (the old path's deletion included, owner 2026-10-02).

## 8. The order

The queue is `HANDOFF.md`; the slices built are `SPRINTS.md`.

## 9. Demands from the two team context files (read 2026-10-01)

`~/Desktop/sharingu-team-context.md` is what sharingu promises outside; `~/Desktop/ryuk_labs_MASTER-CONTEXT.md` is the
ryuklabs project's real GTM data.

| # | Demand | State |
|---|---|---|
| 1 | One word: **contribution** (ruled) | built (the screens D2b, the tool names D5) |
| 2 | **Contribution shapes:** goal, source, why, evidence, depends, what is still open, the next action (who, by when); engineering and GTM fields | built (B1, B2) |
| 3 | **Pick-up:** another person takes a contribution's next action — the activation event | built (B4) |
| 4 | **Beta measures** from the ledger with their definitions, exportable by the admin | built (S3b) |
| 5 | **Cards on a screen:** the Library; a card kind lists on the tab it names | built (B5, B7) |
| 6 | **Follow-ups due** on GTM and Home | built (B4) |
| 7 | **Freshness and confidence:** an as-of date and a status (confirmed · direction · proposal · unknown); stale by age and by change | built (B1, B4) |
| 8 | **The checklist fits the project:** the meter counts only the areas a project has | built (B3) |
| 9 | **A capability inventory** generated from the contract | built (D5: `GET /capabilities`) |
| 10 | **A shareable demo project** on live, from public material | built (sprint 4: `demo`, filed on live at its ship) |
| 11 | **Home leads with goals moved and who contributed** (ruled); no ranking of people | built (B3) |

Sensitive outreach data (contacts, terms, client names) lives in its own project seated to the GTM team, with role
visibility on its cards and docs; the adversarial read (G2) proves a Partner never sees it.

An earlier ruling had **an outside beta team run sharingu on its OWN Cloudflare account** (overturned: hosted on
2026-10-06, hosted-only on 2026-10-09). What it left standing: a stranger walks in from the docs alone, a fresh org's
first run leads straight to "create a project and fill it", and our beta measures reach us only if an admin exports them. Since
2026-10-06 the main road is the hosted platform (`PLATFORM.md`), and since 2026-10-09 it is the only one (hosted-only):
a team's first org is made through the door (`docs/INSTALL.md` §1).
