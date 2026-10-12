# Release notes

## Sprint 3 (`7fafeb61b`) — the door speaks one vocabulary

It reaches an org with the sprint-3 ship. The MCP door's tools are renamed and folded **at once**: 66 tools become 34.
There is no alias and no redirect: an old tool name answers `unknown tool`, an old REST address answers 404, an old
resource is not found.

The first time, in order: `whoami` → `missing` → `formats` → `preview` → `file`. Every session: `updates` first;
`ask` asks the owner; `wrap_up` hands over at the end.

Writing is one door: `preview` (files nothing, shows what would be filed, where it shows, how it is graded, what it
reaches) then `file` (the same items, by the preview's id). Knowledge, contributions, grades and answers all go through
it.

What a client changes:

1. Re-read `tools/list` (or `GET /capabilities`); drop any cached tool list.
2. Replace every old name in prompts, skills and scripts with the tables below; a write is `preview` then `file`.
3. Read the renamed fields (`items`/`piece` on `missing`, `openItems`, `openItemIds`); a role's brief is `brief`, refused `unknown_brief`.
4. Links to old REST addresses (`/transmission/...`, `/pack/card/...`, `/holes`) now 404: use the new addresses.

### The tools

| tool | title | read-only | what it does |
|---|---|---|---|
| `ask` | Ask the owner | no | Asks the owner a question in a sentence or two (about: what it concerns). |
| `brief` | Brief | yes | The work packet. |
| `broadcast` | Broadcast | yes | The org's shelf of published skills, agents and workflows, the built-in starter items, what this project has equipped and your drafts, each with where the project stands on it. |
| `build` | Build | yes | The project's Build tab in one read: its contributions (the newest 50, each with its state, goal, counters and rank), what moved this week and the finish line. |
| `changes` | What changed | yes | What changed in one project since a time or a version (default its current version, else the last 7 days), newest first: knowledge, contributions, grades, rulings and answers, each with who, when and what it reaches. |
| `create_project` | Create a project | no | Admin only. |
| `decide_contribution` | Decide a contribution | no | Owner only. |
| `decisions` | Decisions | yes | The project's questions as the Decisions tab shows them: who owes each answer, the options, the ruling and what was filed on it. |
| `equip` | Equip from Broadcast | no | Equips a shelf item (slug, or preset:<slug> for a starter item) into a project at version v, or updates it to that version. |
| `file` | File | no | Files what a preview showed: previewId and the SAME items. |
| `formats` | Formats | yes | How every item is shaped, the same for every project: with nothing, each knowledge kind and contribution shape in a line; with kind or shape, its fields, an example and where it shows. |
| `goals` | Goals | yes | The project's goal tree: each goal's status, how far it moved, what fed it and its checks. |
| `gtm` | GTM | yes | The project's GTM tab: its go-to-market contributions by activity kind, each with its state and counters, the strategy docs and the gtm goals' numbers. |
| `home` | Home | yes | The project's Home in one read: its aim, what is moving, what needs you, who moved the goals this month and who is here. |
| `impact` | Impact | yes | What a change reaches, before or after it: contribution (an id) or refs (the ids you are about to change). |
| `map` | Map | yes | One plane of the project's Map: arch (the default), data (table: the one inspected), api, mcp, flows or deps, or screens (surface: one app) with their renders. |
| `missing` | What is missing | yes | How filled a project is and what it still needs: the checklist's meter overall and per area, then each open item, the next first, with the preview call that fills it (fill, fillPath). |
| `open_items` | Open items | no | Opens an open item (title, and a ref it concerns) or closes one (close: its id), and answers your open items. |
| `pick_up` | Pick up | no | Takes a contribution's next action (id): it is yours until done: true or release: true, and a second taker is told who holds it. |
| `preview` | Preview a filing | no | Shows what would be filed before anything is: for 1 to 200 items (a knowledge item {kind, op, data}, {contribution}, {grade} or {answer}), where each shows, how it is graded, what it reaches, and a text to show the person. |
| `publish` | Publish to Broadcast | no | Publishes one of your own drafts (id: a contribution of kind item) to the org's shelf as its next version. |
| `publish_version` | Publish a version | no | Owner only. |
| `read` | Read | yes | Reads one item by its ref (goal/<id>, q/<qid>, check/<id>, card/<kind>/<id>, doc/<path>, a node id, T-YYYYMMDD-NNN) with its links, or one page of a kind (kind, limit, after). |
| `read_file` | Read a file | yes | Reads a saved file by id (meta: true for who saved it and when instead of its content), or with no id lists the files you may read (q, group, limit). |
| `respond` | Answer a question | no | Answers an open question with one of its options: qid and option (0 for A, 1 for B), or answers: [{qid, option}] for several. |
| `restore_version` | Restore a version | no | Owner only. |
| `rule_question` | Rule a question | no | Owner only. |
| `save_file` | Save a file | no | Saves a document or an HTML dump (content, title, group) and answers its id and a link you can cite; public: true serves it to anyone with the link. |
| `search` | Search | yes | Searches one project for words across the goals, questions, checks, cards, docs, map nodes and contributions you may read. |
| `submit_grade` | Grade a check | no | Grades one check: checkId and verdict (proven, refused or incomplete). |
| `updates` | What changed for you | yes | What changed since you were last here and what waits on you: the project's aim and blockers, the changes in your lane, your open items, and your own contributions, questions and reports with where each stands. |
| `versions` | Versions | yes | The project's versions: why each exists, the current one, and what changed in each. |
| `whoami` | Who am I | yes | Who you are in this org: your name, role, projects, the project your writes land in, and what your consent allows. |
| `wrap_up` | Wrap up a session | no | Hands over at a session's end: a summary, and any decisions, answers, proposals and what is still open. |

### Renamed

| was | is now | how |
|---|---|---|
| `heartbeat` | `updates` | updates answers what changed for you since you were last here and what waits on you (open items, the owner's blockers), with the project's picture state gave and your own items thread gave |
| `open_loop` | `open_items` | open_items {title, ref?} opens one, {close: id} closes one; it answers your open items |
| `send_handoff` | `wrap_up` |  |
| `holes` | `missing` |  |
| `decide_transmission` | `decide_contribution` |  |
| `gtm_pipeline` | `gtm` |  |
| `bank_artifact` | `save_file` |  |
| `read_artifact` | `read_file` |  |

### Folded into another tool

| was | is now | how |
|---|---|---|
| `state` | `updates` | the project's picture (its aim, as-of, blockers, your projects, the active one) is part of updates; full:true's list is `missing` |
| `thread` | `updates` | your own items (what you filed, asked, answered and reported, each with where it stands) are updates' `yours` |
| `loops` | `updates` | your open items are updates' waitingOnYou.openItems |
| `write_knowledge` | `file` | preview {project, items: [{kind, op, data}, ...]} then file {previewId, items}: the knowledge items land all or nothing |
| `submit_transmission` | `file` | preview {project, items: [{contribution: {lane, what, why, ...}}]} then file |
| `record_event` | `file` | a ruling, a correction or a drift is a contribution: preview then file (ruled by the plan's laws, HANDOFF D6) |
| `read_knowledge` | `read` | read {kind} lists a kind (a page of it, `after` for the next); read {ref} or {kind, ref} reads one item |
| `capsule` | `brief` | brief with no `for` answers your own role's brief (the doc capsules/<role>.md the project holds); brief {role} names another's, under the doc's own visibility |
| `area_brief` | `brief` | brief {for: <ref>} |
| `library` | `read` | read {kind: "doc"} lists the project's docs you may read |
| `doc` | `read` | read {ref: "doc/<path>"}; doc/start-here.md always answers (the project's own, else the built-in guide) |
| `transmission_queue` | `build` | build lists the project's contributions as the Build tab does; read {kind: "contribution"} pages them all |
| `read_transmission` | `read` | read {ref: "T-YYYYMMDD-NNN"} (with its grade and links) |
| `goal` | `goals` | goals {ref} answers one goal, as decisions {qid} answers one question |
| `map_plane` | `map` | map {plane} (arch, data, api, mcp, flows, deps; arch when left out) |
| `map_node` | `map` | map {ref} (and gap) answers one node, as the Map's inspector shows it |
| `map_screens` | `map` | map {plane: "screens"} (and surface) answers the Screens view |
| `list_artifacts` | `read_file` | read_file with no id lists the files you may read (q, group, limit) |
| `pack_kinds` | `read` | read {kind: "card_kind"} |
| `pack_card` | `read` | read {ref: "card/<kind>/<id>"} |
| `pack_find` | `search` | search {q, kinds: ["card"]} |
| `pack_checks` | `read` | read {kind: "check"}, or read {ref: "check/<id>"} |
| `pack_decisions` | `decisions` | decisions |
| `pack_live` | `changes` | changes |
| `eagle_claims` | `read` | read {kind: "card", cardKind: "claim"}; impact {ref} for what a ref reaches |
| `eagle_history` | `impact` | impact {refs} answers `history`: the project's contributions that named those refs, newest first (at most 50; "screen:home" and "home" read the same; a goal by its goalRef too; a non-owner only what they may open). The history is now one project's (it was the org's). |
| `eagle_timeline` | `changes` | changes {since} |

### Gone

| was | why |
|---|---|
| `answers` | every question on decisions carries its answers and its ruling; the owner's org-wide answer dump has no screen (the need: `decisions`) |
| `eagle_critiques` | nothing files a critique any more; a challenge is a contribution, read with read and changes |
| `inbox` | the reports a wrap_up files show on updates' `yours` and in Activity; the owner's raw R2 list has no screen |
| `read_inbox` | as inbox |
| `rank` | no tool: POST /rank stays for Build's Rank button (HANDOFF D6, decided by the plan's laws) |
| `round` | no tool: POST /round stays for Decisions' Add to round button |

Unchanged names (25): `whoami`, `formats`, `preview`, `file`, `ask`, `respond`, `rule_question`, `submit_grade`, `pick_up`, `impact`, `search`, `read`, `changes`, `brief`, `home`, `build`, `goals`, `decisions`, `broadcast`, `versions`, `publish`, `equip`, `create_project`, `publish_version`, `restore_version`.

### REST addresses

A row not listed keeps its address.

| was | is now | verdict |
|---|---|---|
| `GET /holes` | `GET /missing` | renamed: the page says What is missing; the twin of missing |
| `GET /heartbeat` | `GET /updates` | renamed: the twin of updates |
| `GET /state` | `GET /updates` | folds: state folds into updates; both doors scope the project through the one function (Part 4 b) |
| `GET /thread` | `GET /updates` | folds |
| `GET /loops` | `GET /updates` | folds |
| `POST /loops` | `POST /open-items` | renamed: the twin of open_items |
| `POST /handoff` | `POST /wrap-up` | renamed: the twin of wrap_up |
| `GET /gtm/pipeline` | `GET /gtm` | renamed: the tab says GTM; the twin of gtm |
| `GET /transmission/:id` | `GET /contribution/:id` | renamed: the page says contribution |
| `POST /transmission/:id/decide` | `POST /contribution/:id/decide` | renamed: the twin of decide_contribution |
| `GET /transmission/:id/impact` | `GET /contribution/:id/impact` | renamed |
| `POST /transmission/:id/pick-up` | `POST /contribution/:id/pick-up` | renamed: the twin of pick_up |
| `POST /pack/grade` | `POST /grade` | renamed: the twin of submit_grade |
| `POST /event` | `POST /ask` | folds: record_event folds into file; ask keeps a REST twin of its own |
| `POST /transmission` | `POST /file` | folds: preview then file |
| `POST /transmission/batch` | `POST /file` | folds: preview then file (up to 200 items) |
| `GET /transmission` | `GET /build` | folds: the Build tab lists the contributions; GET /read?kind=contribution pages them |
| `POST /knowledge` | `POST /file` | folds: preview then file |
| `GET /knowledge/:kind` | `GET /read` | folds: GET /read?kind=<kind> |
| `GET /knowledge/:kind/:id` | `GET /read` | folds: GET /read?ref=<ref> |
| `GET /capsule/:role` | `GET /brief` | folds: GET /brief (your own) or GET /brief?role=<role>: the doc capsules/<role>.md under its visibility, which GET /doc/:path already served to any signed-in reader (auth reader) |
| `GET /pack/kinds` | `GET /read` | folds |
| `GET /pack/card/:kind/:id` | `GET /read` | folds |
| `GET /pack/find` | `GET /search` | folds |
| `GET /pack/checks/:kind/:id` | `GET /read` | folds |
| `GET /pack/decisions` | `GET /decisions` | folds |
| `GET /pack/live` | `GET /changes` | folds |
| `GET /eagle/claims` | `GET /read` | folds |
| `GET /eagle/history` | `GET /impact` | folds: GET /impact?refs=<ref>[&eval=1] answers history:{refs, count, items, more} |
| `GET /eagle/timeline` | `GET /changes` | folds |
| `GET /eagle/critiques` | — | goes |
| `GET /answers` | `GET /decisions` | goes |
| `GET /inbox` | — | goes |
| `GET /inbox/:id` | — | goes |

### Resources

| was | is now | |
|---|---|---|
| `brain://state` | `brain://updates` | renamed |
| `brain://holes` | `brain://missing` | renamed |
| `brain://gtm/pipeline` | `brain://gtm` | renamed |
| `brain://area/{ref}` | `brain://brief/{ref}` | renamed |
| `brain://capsule/{role}` | `brain://brief/{ref}` | folds: a role's brief is brief {role}; its doc reads at brain://doc/capsules/<role>.md |

### Fields and refusal codes in the answers

| where | was | is now |
|---|---|---|
| missing (was holes) and GET /missing | holes[] | items[] |
| missing: each of items[] | hole | piece |
| whoami | openLoops (a count) | openItems |
| updates (was heartbeat) and GET /updates | waitingOnYou.openLoops | waitingOnYou.openItems |
| updates | you.openLoops (state's titles list) | (gone: waitingOnYou.openItems lists them with their ids) |
| updates | knowledgeAt (heartbeat) | asOf (when the project's knowledge last changed) |
| wrap_up (was send_handoff) and POST /wrap-up: receipt | loopsOpened | openItemsOpened |
| wrap_up and POST /wrap-up: receipt | loopIds | openItemIds |
| wrap_up: the GitHub issue it may open | title "Handoff — <name> — <date>", label handoff | title "Wrap-up — <name> — <date>", label wrap-up |
| open_items (was open_loop) | {opened, title, ref} / {closed} | {opened, title, ref, openItems} / {closed, openItems}: the caller's open items ride every answer |
| brief with no `for` (was capsule) | the doc's markdown as a bare string | {role, path, title, body} |
| brief {role} refused (was capsule) | {error: unknown_capsule, capsules: [...]} | {error: unknown_brief, briefs: [...]} |
| impact {refs} | (eagle_history's {ref, count, timeline}) | history: {refs, count, items, more} beside the reach (one project's, newest first) |
| read_file with no id (was list_artifacts) | (list_artifacts' answer) | the same list, unchanged |
| a refusal code | `unknown_capsule` | `unknown_brief` |

### Titles and annotations

Every tool carries a `title` and the four MCP annotations. The rule: `readOnlyHint` is true when the tool neither writes nor stores a row (a read-only tool is idempotent and never destructive); `destructiveHint` is true when a write can replace or remove what is there; `idempotentHint` when the same call again changes nothing more; `openWorldHint` only where a call reaches outside the org's own store (`wrap_up` may open a GitHub issue). A read-only tool, called, writes no row (tools/annotations-selftest.mjs).

Read-only (18): `brief`, `broadcast`, `build`, `changes`, `decisions`, `formats`, `goals`, `gtm`, `home`, `impact`, `map`, `missing`, `read`, `read_file`, `search`, `updates`, `versions`, `whoami`.

Writes (16): `ask`, `create_project` (destructive) (idempotent), `decide_contribution` (destructive) (idempotent), `equip` (destructive) (idempotent), `file` (destructive) (idempotent), `open_items` (destructive), `pick_up` (destructive) (idempotent), `preview`, `publish` (idempotent), `publish_version`, `respond` (destructive), `restore_version` (destructive) (idempotent), `rule_question` (destructive), `save_file`, `submit_grade`, `wrap_up` (open world).

`GET /capabilities` serves the inventory generated from the contract: every tool and route, read or write, who may call it, and whether you may.

### Words

Retired on every face (the vocabulary check bans them): `transmission`, `handoff`, `loop`, `heartbeat`, `capsule`, `holes`, `envelope`. The words: a CONTRIBUTION (verb: file), a knowledge item, a check and its grade, a question and its ruling, a version, an open item.

Kept: POST /artifact, GET /artifact/:id and GET /artifacts keep their addresses (save_file and read_file's twins): a saved file's link is cited inside filed proof, and an address change would break proof already filed.

Internal, never read by a client or a person, not renamed: the tables transmission, loops, handoff events and their columns; file names (src/transmission.js, src/handoff.js, src/holes.js, txpage.js ...); function names; the org setting handoffRepo; R2 keys inbox/handoffs/; the brain:// scheme; the ref grammar's T-YYYYMMDD-NNN id.
