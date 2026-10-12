# sharingu — the sprints

A sprint is one branch. A slice is one commit (or a few) that goes: table → MCP/REST write → the screen that reads it.
A slice is done when `sh engine/tools/smoke.sh` is green and its smoke case is in that script. Tick `[x]` with the
commit sha. The full suites, the one review, the PR and the ship happen once, at sprint end.

Design rules for every slice:

- Pages read D1 through `engine/src/knowledge/` and `engine/src/hotsql.js`; a page never reads R2 for knowledge.
- A page is one read function (its JSON twin and its MCP read tool answer from the same call) and one renderer.
- An empty state is a short phrase and at most one button (`LOOK.md`, the revision); the call that fills it is listed
  on What is missing, never printed on the page.
- When a slice replaces a page, delete the old module and its old text pins in the same slice.
- One statement per screen region, indexed on `(project, …)`. Run `node tools/page-budget.mjs` after every slice: a
  load over 1,500 rows read is flagged (a stranger's org may run on the free tier).
- A migration takes the next free number at integration time; its header states its order against the code.

---

## Sprint 1 · The MCP brings the app alive — shipped

Shipped 2026-09-30 (ryukdev/sharingu#268, #269): the knowledge core in D1 (`migrate-039`–`041`), written and read
through the MCP, Goals, Home, Decisions and the Map reading D1, the three loops, the importer. Live version `e870a1b2`.
Its open items moved to `PLATFORM.md` §3.

## Sprint 2 · The look, and the live budget — shipped

Shipped 2026-10-01 (ryukdev/sharingu#270): the look (`LOOK.md`), the Map as the main tab, Control with Connect and
profiles with hats, Broadcast with the starter pack, the screens atlas, the tallies that keep reads flat
(`migrate-042`–`046`), five projects imported. Live version `3eb9f8ff`. The live walk this ship
owed (the import overran that day's write limit) ran with sprint 3's ship instead, 13 of 13.

## Sprint 3 · The MCP, whole: preview, fill, extract, impact — shipped 2026-10-04 (`MCP.md`; the queue: `HANDOFF.md`)

Ruled by MCQ (2026-10-01): the client's AI extracts (sharingu runs no model); every filing is previewed first; the
admin's agent creates a project through the MCP; "filled" is a checklist per page with a meter; lights go stale; the
tool names change at once, no aliases; the GTM strategy is docs under `gtm/`. Ruled 2026-10-02: the old path is deleted
in this sprint (D6), and ONE ship carries it all.

Migrations `047`–`063` are local only; the ship applies them in order, each by the order rule its header states
(`sh tools/ship-plan.sh ryuklabs` prints them). Built, in order:

- [x] **B1 · the registry** (`5d287b1b0`; `migrate-047`, BEFORE the code): every kind declares its format, example,
  place, preview line and checklist items; contribution shapes (`src/shapes.js`); `formats` and `GET /formats`; a
  256 KB body cap a call. With it, the fixes from sprint 2's ship: the importer counts rows written and refuses a live
  run over the budget; an upsert no longer rewrites unchanged columns (a re-import: 139,457 → 23,922 rows written);
  Decisions is paged.
- [x] **B2 · preview, then file** (`af731670e`; `048` BEFORE the code, `049` any time): `preview` plans every item
  through the write doors and writes one row; `file` files exactly what was previewed; the terminal text, the page
  `/preview/:id`, the reach (`src/reach.js`); ids past 999 a day no longer collide. Smoke 104/104.
- [x] **B3 · the checklist and the meter** (`f2ec4c142`; `050` BEFORE): one checklist from the registry, counted only in
  the areas a project has, kept exact by `k_fill`; `create_project`; Home leads with goals moved; the Fill a project
  skill; the animated Architecture view. Smoke 110/110.
- [x] **happenedAt** (`4ea7ea396`; `051` BEFORE): a contribution says when its work happened; the record keeps its
  filing time.
- [x] **B4 · impact and carry-forward** (`8cb9ae32f`; `052`, `053`, `054` BEFORE, in that order): the Impact view and
  `impact`; a grade goes stale when its node changes; cards and docs due by age; `pick_up` and follow-ups due; Goals by
  the month the work happened. Smoke 118/118.
- [x] **The one-pass fix of the first real fill** (`da66abc0a`; `055` BEFORE): screens optional for work that touches
  none, ids checked against the project's Map, proof as people state it, Goals count what was filed. Smoke 125/125,
  57 selftests.
- [x] **Goals and GTM open on all time** (`f6efbaa17`, owner MCQ).
- [x] **A fresh org comes up green, and the proof tools** (`749aa324d`): a local org's seed has no project;
  `day0-verify` 17/0/3; `shots.mjs --cookie`; the docs check and four selftests in the gate.
- [x] **The ship candidate** (`4d563bc25`, `90f615ec8`, `b75a2fa09`): the importer's overlays, `ryuklabs` as the
  ops project's key, the project audit (`tools/audit/project-audit.mjs`), the four projects' basics.
- [x] **B5 · extract** (`78afdf772`; `056` before or after the code): `search`, `read`, `changes`, `brief` (one
  function each in `src/extract.js`); the Library; what changed since the version on every tab. Smoke 132/132, 58
  selftests, worst load 1,457 rows.
- [x] **sharingu's model from its code** (`e76a4b3e7`): `tools/import/read-code.mjs`; about 260 checks an agent can
  observe; 15,684 rows written; a probe of every check, 244 of 255 true.
- [x] **The ship tools** (`2fb5b2076`): the budget tools read the account's plan; `migrate-dryrun.sh --from`;
  `ship-plan.sh`; the rename `siru-services` → `ryuklabs` as a guarded data migration (`tools/ship/`); `import-live.sh`
  with prune. Rehearsed on a local copy of sprint 2's data.
- [x] **D1b · the door findings pass** (`45ab6f186`; `057` after `054` and either side of the code, `058` BEFORE): 23
  fixes from four real runs — no existence oracle, ONE sign-in rule, an image render through the MCP, a new picture
  does not stale a grade, a project may hold no product model by design. Smoke 149/149, 59 selftests.
- [x] **The candidate on the current code** (`8ae508027`): five projects stored == built, 172,161 rows written;
  sharingu filed through the MCP (`tools/ship/after-import.mjs`: 63 contributions, 263 of 266 checks graded with
  observed proof, 30 screens pictured).
- [x] **B7 · lists and Broadcast through the door** (`7ffdc0442`; `059` BEFORE): a card kind lists on the tab it names
  (`src/tablists.js`); a card's own page at `/read?ref=card/…`; `publish` and `equip` as tools, refused to a Partner by
  role class; the registry declares its doors' errors, shapes and refusals. Smoke 153/153, 60 selftests, worst load
  1,469 rows.
- [x] **D2b · the truth-and-look pass** (`95429c92f`; `migrate-060`, one index, live BEFORE the code): the proof rule
  rewritten from a corpus of every proof the runs filed or had refused (856 true accepted, 65 narrations refused);
  counts agree with their rows; the owner holds every project; a picture redoes no check; the atlas's plates and
  labels; plain names for the Map's door groups; 122 of 314 generated checks name a goal; an empty region is a phrase;
  a seatless member in a multi-project org must name the project. Smoke 162/162, 62 selftests, saruspay `/map` 1,072
  rows.
- [x] **L1 and L2 · the look revision's parts and its five tabs** (`19355b2e5`, `87585a170`): `src/parts.js` and its
  gallery, approved by the owner; Home, Goals, Decisions, Build and GTM rebuilt on them (tile strip, filter row kept
  in the address, folded groups, one-line rows that open in place, initials, ink bars); one new read, the week
  (`src/week.js`); the copy check in the gate, its allowlist 471 → 381. Smoke 168/168 with `s20-look`; Build on
  sharingu 1,015 → 655 rows.
- [x] **L3 · the look revision on the detail pages** (`bd0f4befe`; `migrate-061`, a partial index on contributions, live
  BEFORE the code): a goal, a question, a contribution and its impact, What is missing, a card, a doc, a preview, the
  Library, search, What changed, Versions, Activity, Profile, Projects, Control, Broadcast and sign-in on the parts; the
  Map's views lose their explaining paragraphs; forms keep their fields and checks; a contribution that landed by
  itself shows no decide buttons; the copy allowlist 381 → 41 (all on pages D6a deleted); Home on sharingu 1,198 → 854
  rows; the week counts by the day the work happened. Smoke 173/173.
- [x] **The candidate on the new look** (`a37bcc661`, `950d2e94e`): rebuilt from empty on `bd0f4befe`'s code, 174,022 rows
  written, stored == built on all five, no high finding; the code reader follows the revised pages (import selftest
  182/0); sharingu's replayable history is 78 contributions, 30 screens re-pictured, 309 of 315 checks proven with
  observed proof and none refused; the Map reads 209 passing, 17 partly, 0 failing; meters sharingu 93%, ryuklabs 92%,
  saruspay 90%, bunny 84%, siru 57%. A resolved siru question quoted a retired password: removed by overlay (it is on
  live since sprint 2; the ship's import overwrites it).
- [x] **S3b · the beta gate's local parts** (`80714a2ac`; `migrate-062`, eval projects, live BEFORE the code): the backup
  holds every table that holds truth, page by page, with no credential (a selftest places every `boot.sql` table as
  dumped, derived or never); `tools/restore-local.mjs` restores it into a fresh org, verified on the real-data org
  (22,900 rows, the derived tables, both doors); the beta measures on Control for the owner, exportable; the checklist
  offers each role only what the door lets it make; `search`, `read`, `changes`, `brief` take the eval switch and the
  walk runs marked, 13 of 13; the product is sharingu to a connecting client and a fresh org. Smoke 184/184, 65
  selftests; the local gate rehearsal reads 20 ✓, 3 ✗ (D3, D5, G2).
- [x] **The projects' data, before the video** (`c025bc666`): the candidate is seeded with the org's real owner
  (`DEV_OWNER_NAME`); a ruling's why is why the question mattered and its rationale why that option was ruled, from the
  record or empty (103 questions), its provenance in `source`; no machine path and no credential-shaped text in any
  stored text (`tools/audit/text-rules.mjs`: the importer fails on either, the audit reports it high); titles carry no
  markdown, email address or bare question id (`tools/import/tidy.mjs`); four docs that teach the old engine are no
  longer imported. Import selftest 196/0.
- [x] **L4 · the last look pass** (`a547d7a99`): small counts, times and meta in Manrope's tabular figures (the mono zero
  read as an 8); one definition each for a goal's state, when a contribution happened, a change's reach, an area's
  total, the tab a page lights and a kind's word; the fill chips leave the tabs; the atlas loads nearest first under
  named plates; What changed folds a batch and reads no reach walk; a named check with its number is proof. Home on
  sharingu 855 → 520 rows. Smoke 193/193 with `s22-last-look`.
- [x] **The final candidate** (`3d0282d8c`; the org on 8840, a frozen copy of `a547d7a99`, the owner seeded as on live):
  rebuilt from empty, 174,133 rows written, stored == built on all five, no high finding; sharingu's history is 85
  contributions with 30 screens re-pictured; 312 of 317 checks proven with observed proof, none refused; the Map reads
  210 passing, 17 partly, 0 failing; meters sharingu 93%, ryuklabs 92%, saruspay 90%, bunny 84%, siru 57%.
- [x] **D3 · the card and the confirm** (`e6dfa6683`): `preview {fileOnConfirm: true}` asks a client that declared
  elicitation to confirm on the call's own stream and files exactly that preview on yes (50 seconds; bound to the
  person, the session and a nonce); `ui://sharingu/card` draws the preview, the receipt and the publish and equip
  previews in an MCP Apps host from the page's own summary renderer; unfiled previews are pruned a day after they
  expire; the two calls are unchanged. Proven by `tools/mcp-client-selftest.mjs` (70 checks), `tools/card-shots.mjs`
  (10) and smoke 197/197. Open: no real client exercised yet (gate line 3, by hand); `file` of 50 contributions is 160 statements (over a
  free account's 50); `publish` and `equip` have the card but no confirm; the prune reads the whole previews table.
- [x] **D3b · the door speaks both MCP revisions** (`36dd5db8c`; ruled onto sprint 3 by the owner, MCQ 2026-10-03): the
  2026-07-28 revision beside the 2025-06-18 handshake on one endpoint — a request whose `_meta` carries a protocol
  version is served statelessly (`server/discover`, per-request capabilities, the spec's codes: 400 `-32022`, `-32602`,
  `-32020`; 404 `-32601`; `resultType` and `serverInfo` on every result; `Mcp-Session-Id` ignored); the legacy bytes
  unchanged (22 exchanges hashed identical). The confirm on it is an `input_required` answer and its retry: the preview
  row is the state, keyed to the person, ten minutes, one conditional UPDATE, then the same `file` path (one row read
  against the stream's 19). Claude Code 2.1.235 measured to stay modern (`server/discover`, then `tools/list`;
  `MCP-Protocol-Version` and `Mcp-Method` on every request). Stated deviations (`engine/.runs/d3b/SPEC-NOTES.md` §4): an
  absent `Mcp-Name` is tolerated until a real tool call is seen carrying it; `Origin` is not refused on a bearer or
  OAuth caller (the cookie caller keeps same-origin); an unauthorised modern request still answers `-32001`. Smoke
  235/235, dual-era selftest 95, client selftest 84.
- [x] **G2 · the independent review and its fixes** (`e632fd8bc`; the review is `engine/.runs/review/REVIEW.md`): Activity
  under the one project rule (it showed every project to every signed-in person — on live since sprint 2); one batch
  report per project under its project's rule (it put every project's work into one file — on live too, cleaned at
  the ship); the prune a reviewed plan that keeps a person's own filings and refuses a missing input; OAuth grants end
  on a key or passphrase change, refresh tokens 30 days; a key in an address signs no one in, saved files inert under
  a strict CSP; the eval mark only on an eval project or from a test seat; a clientRef names its content on every
  door; the consent screen names where the code goes, registration refuses a non-https redirect; `migrate-054` no
  longer undoes 057 and 062; the backup is never silent; the cut's lost proofs restored (`s27-lost`, five live-only
  legs), four checks that could not fail now can. Each with an attack case that fails on the previous code; the
  reviewer's probes re-run. Smoke 226/226, the suites once each (evals 42, sims 10, tabs-verify 40, verify-live 7 + 3
  live-only). Open: the five live-only legs unrun; the prune reads each ledger row one by one (its cost on live
  unmeasured); OAuth grants made before the fix carry no stamp; a hand-filed batch over 30 items is protected only
  within its two-minute window.
- [x] **G3 · the second video** (`~/Desktop/sharingu-walkthrough-v2.mp4`, 3:20, on the candidate rebuilt on
  `9ecca3292`; all 100 frames read) — the first take (`bbf09a7ad`, 3:25) was read frame by frame and the owner ruled a
  retake after its six page faults (`b82e51292`, `9ecca3292`): a check's refs named on the preview (the write door reads
  them; s28 case 8), the File panel one row, the MCP address wraps on Control, one "Filled" (items done of all; "By
  depth" on What is missing alone), Copy on every proof-to-redo row, a stale node's pill says stale, the published
  version instead of a model hash, "Depends on" by name (`dependNamesOf`). The seventh (regrade from a page) goes after
  the ship with M1–M7. Smoke 234/234, gate exit 0.
- [x] **The last fixes before the video, and G1** (`bbf09a7ad`): one fact for what a contribution touches; a ruling's
  decider by name; a preview that says files files (refs indexed in one statement; a batch of 100 or more clientRefs
  no longer files again on a replay); `map {ref}` answers `parent`, `POST /file` declares its codes; fixed terminal
  columns; Copy says Copied; a ruling dated ahead of now counts; `day0-verify` stamps an eval project. The candidate on
  the final code: 170,008 rows written, stored == built on all five, no high finding, sharingu 98 contributions, 197
  of 201 checks graded; **the local gate rehearsal: 22 ✓, 7 live only, 2 by hand.** Smoke 233/233.
- [x] **S3a · the walk covers the whole member path** (`9b39f30a2`): `tools/live-walk.mjs` walks gate line 1 as an admin
  and a new member on a throwaway project from sample input (`tools/walk/fixtures/`), locally 12 of 13 steps;
  `tools/gate-rehearsal.sh` prints the seven gate lines against a local org (first run: 15 ✓, 8 ✗, 7 live only, 2 by
  hand).
- [x] **D6a · the old path, deleted** (`9e97db345`; `migrate-063`, either side of the code): the pages and modules that
  read the old brain's files, the R2 `serve/` readers, the brain's own tools and the tests of all of it; the org's
  brand and settings on its D1 row; ONE project rule (`src/project.js`), its 432 answers equal to the previous code's,
  case by case; the grade writers and the markdown renderer in modules named for what they are; the shot pass's
  screen findings fixed, all but the rows read; the copy allowlist empty. 59 files and about 12,000 lines gone, the
  worker's source 11% fewer lines. Smoke 202/202, the walk 13 of 13, the five projects import from empty. At the ship,
  live's `org` row is written from its served `tenant.json` (`python3 tools/org-row.py <tenant.json> --by <owner id>`,
  applied with `tools/migrate.sh`).
- [x] **D5 with D6b · the names** (`7fafeb61b`): 66 tools become 34 in one vocabulary, renamed at once with no alias
  (`engine/tools/names.json` is the map; `docs/RELEASE-NOTES.md` lists old → new); every tool has a title and its
  annotations, set by one rule and checked against what it writes; `GET /capabilities` serves the generated inventory;
  the tools block 68 KB → 30 KB. Every caller moved first: the importer files through `preview` → `file` and reads
  through `read` (rebuilt from empty, stored == built on all five), the walk, the audit, the smoke. A Partner with no
  seat no longer files into a one-project org; `GET /updates` and its tool are one path (the authority table: 81 rows
  the same, 19 narrower, none wider). The suites start like the smoke, on a fresh local org with their fixtures filed
  through the door, and are cut to a keep set: evals 42 cases plus an auth net over every REST row, sims 10, tabs-verify
  15 calls, verify-live 13; each ran once, green. Smoke 207/207, the walk 13 of 13.

### Open after sprint 3 — reconciled 2026-10-06

Closed since: the remote-D1 restore (S4-2); "local R" in the scripts, the `updates` rows, the lanes-per-goal measure and
the old `missing` name (D5L); the demo project (sprint 4); verify-live's `--live` paths (18/18 at the sprint-4 and
sprint-5 ships); G2 (the sprint-4 and sprint-5 ends); the owner's release form, licence, hand walk and one-address
question (ruled; `BETA.md`, `MARKETPLACE.md`). Everything still open moved to the residual ledger in `PLATFORM.md` §3,
each with the sprint that closes it.

## Sprint 4 · Beta closed, and the Map (ruled by the owner, MCQ 2026-10-05; the queue: `HANDOFF.md`)

Live runs sprint 3. Five of the seven gate lines are proven on live; this sprint proves what a machine can of the rest,
fills the two project-lane items the plan still owed, closes the video's seventh fault and builds the Map's seven items.
The owner's own lines (the three clients on live, the second Cloudflare account, the licence) wait until after it, by
their ruling. Built on `sprint-4`, each slice committed when its smoke is green:

- [x] **S4-1 · a day of use measured on live** (read 2026-10-05 02:36 UTC, `engine/.runs/s4-1-budget.json`; the account's
  own counters, cumulative since 2026-09-07): the day after the ship (2026-10-04 00:30 UTC → 2026-10-05 01:35 UTC: the
  after-import, the grading run, the live walk, verify-live, the crons, and reading) cost 132 requests, about 1.46 million
  D1 rows read and about 45,000 rows written — on a free account's daily limits (100,000 requests, 5 million rows read,
  100,000 rows written) that is 0.1%, 29% and 45%: under half of each. The restore rehearsal's hour after it (S4-2) read
  1.06 million and wrote 224,000 rows: a restore is a ship-level act, never a day's use. The paid account stands at
  93,863 requests, 18.9 million rows read, 663,177 rows written for the period, no overage. The per-screen row budget
  stays (`page-budget`, every slice).
- [x] **S4-2 · the restore rehearsed against a remote D1** (2026-10-05, `engine/.runs/s4-2/`): live's backup dumped
  through `POST /backup-dump` by a short-lived minted owner seat (28 tables, 27,266 rows, 25.9 MB, no credential in it),
  restored into a fresh local org and verified against live through both doors (6 of 6: every table's count and hash,
  60 project-kind pairs, the five meters, 1,452 Map lights, 15 searches); then the restore's own SQL (21.7 MB, 414
  inserts) applied to a fresh D1 on our account seeded by `tools/day0-seed.sh`, in one `wrangler d1 execute --remote`
  (102,427 rows changed): all 28 tables equal the dump; the D1 deleted after. The procedure is `tools/restore-local.mjs`'s header.
- [x] **P3 · the read side, per hat** (2026-10-05, `engine/.runs/p3/REPORT.md`; MCP.md §6): 25 questions through the
  door on MCP 2026-07-28 (45 calls): 17 answered, 7 partial, 1 not answerable; no answer over 1,500 rows (largest 789).
  The partner fence reasoned from the contract: a Partner on siru alone gets P1–P5, is refused every other project's
  answer, and sees the org's people only through the project they share. Six faults ranked, four of them this sprint's
  P3-F, two the owner's (below).
- [x] **P3-F · the read side's fixes** (`b838208dd`, 2026-10-05): `brief` keeps a question's `waitingOn` and `blocks`,
  and management's own list leaves out what waits on someone else (a `blockers` list, severity first); `read {kind:
  "check"}` carries each check's latest grade and takes `status: pass | fail | ungraded` (through the tool and `GET
  /read`; a filtered page looks at 250 checks at most, `next` carries on); decision rows carry `decidedBy` and
  `decidedAt`, `decisions` takes `sort: "decided"` and `limit`; a seatless owner's unnamed read names the projects they
  may read; `question/<id>` reads as `q/<id>`; Home's empty "Latest changes" reads "No code or design change yet". Extract
  selftest 60, the two new statements indexed; `read kind check` 7 → 10 rows. The Arch view's 60-service cap moves to
  M1+M5 (the file is theirs).
- [x] **The demo project** (2026-10-05, `engine/.runs/demo/REPORT.md`): `demo` ("sharingu demo") filed on the candidate
  from the website's public pages alone — the aim (no measure: the site states none), 7 goals, 4 docs, 9 nodes (the
  console and the eight tabs), 2 card kinds and 6 GTM cards, 2 open questions for the owner; 31 items, every verdict
  "files at once"; the five batches kept under `tools/import/overlays/demo/`; the meter 10 of 16; the privacy grep
  0 hits, the text rules green. On live at the sprint-4 ship (the overlays replayed; the importer needs a no-source
  overlay path or the five files filed as they are: decided at the ship).
- [x] **IMP · the import replays overlay-only projects and ops files** (2026-10-05): a project's overlays are its
  `*.items.json` and `*.ops.json` together in name order (the three `m2-architecture.ops.json` replay after the fill
  files); `demo` joins the import's list with no source (`kind_of` overlays-only, `source_arg -`, `name_of`): the
  importer creates it through `create_project` when the door says the project is not the org's yet, then files, measures
  and reads back as for any project; the prune plans nothing for a project live does not hold; `dev-local.sh` reads the
  same list as the ship, so the local app, the candidate and the ship cannot disagree; demo imports first (about 340
  rows, the smallest). Proven on a small local org (demo created and filed, bunny's architecture merged, a second run
  replayed and wrote nothing) and by the import selftest (211). At the ship the plan takes `--cost-dir` from a candidate
  rebuilt on this code (the measures must hold demo and the architectures).
- [x] **R1 · regrade from a page** (2026-10-05; the 35th tool, `regrade`, and its REST twin `POST /regrade`, one
  function in `src/regrade.js`): the stale or ungraded checks of a flow, a node or a list that the worker can observe
  itself (a screen's page in the generated grammar, a rail link) are fetched through the worker's own handler AS THE
  CALLER (the same key or cookie; only the registry's GET routes, never `/logout`; an observation never observes) and
  graded through the grade door with the request and its answer as proof — at most 8 a call (a free account's CPU),
  `more: true` for the rest; what a page cannot prove (a walk, a judgement, an id it cannot fill) comes back as
  `needsProof` with the `preview` call that files it. The press on a flow's view, a node's inspector and the Impact page's
  "Proof to redo": a plan page first, then the confirm, as Publish and Equip. The walkthrough's beat 7 regrades from the
  page. Row budget: a Map view with stale checks costs one more statement; the plan reads 80 rows, a confirm of 2 checks
  227. Selftest 48, smoke `s29-regrade` (6), annotations 406. **Left for the owner:** a walked flow's checks cannot be
  proven by one page read, so a change still leaves the walks for a person (the video's beat 7 ends with the goal fresh
  and the walks waiting) — either that stays the rule, or a change stales a walk only when it touches the flow node
  itself. OAuth connections (the connector) cannot open pages: their checks go to a person.
- [x] **M7 · A guided first fill** (2026-10-05): two starter skills beside `fill-a-project`, in its voice —
  `draw-the-architecture` (read the repo, ask what it does not say, shape the drawing and the services in the door's own
  fields, the privacy rule, what the source does not decide filed as a question, preview, file, read it back) and
  `file-the-screens` (missing, the code's routes → screens, handlers → doors, schema → tables, the checks each implies,
  preview, file, missing again); the pack is 16 items; each equips on a local org and reads back as its doc; an unknown
  slug's answer now names the shelf. `presets-selftest` 52; the two smoke cases that pinned the pack's count now read it.
- [x] **D5L · what D5 and D6b left** (`68903458f`, 2026-10-05): `updates` and `GET /updates` read newest first with the
  limit in the SQL (four statements on the indexes, the open items read once): the owner's read 229–272 rows → 37 on
  four of the six projects (demo 53, saruspay 200), the bell's `limit=1` 210–440 → 18 (demo 34, saruspay 181), a member
  19; the answers byte-identical; a ruling shows only on one of your newest `limit` filings. The lanes-per-goal measure
  is one aggregate that skips emptied tally groups. `lib.sh` and `verify-live.sh` say "a local org"; the scripts' next
  step already named `missing` since `a6c4d3657`. d1-hot 389 (a section pins the plans), thread 50, measures 17. Left:
  the blockers read every caller gets (`ownerOwed`, 164 rows on saruspay, 16 on demo) keeps those two over the brief's
  100 — a narrower statement (the open questions without their options) is the next cut; the owner's active-projects
  check costs 6 rows a call; `briefFor` in `src/core.js` lost its last caller (deleted at integration).
- [x] **M1 + M5 · collapsible panels, a focus mode, density controls** (2026-10-05, front end only): two toggles fold
  the rail to its icons and the right panel, remembered per person in the browser (never a cookie the server reads); the
  `\` key folds both; a Map column and an Arch lane fold to one cluster with their count; a journey's pill filters the
  Arch diagram and Play walks it, Escape clears; the Arch view keeps the services a part names before its cap (M2's
  fault). map-selftest 107, arch-selftest 86, smoke 249/249 (`s30-density`), `page-budget` equal on every Map and Arch
  load; 32 shots in `engine/.runs/m15/shots/`. Left: the Screens view re-centres after a fold but does not re-fit;
  lane folds have no keyboard route; a pin does not reopen a folded panel (chosen).
- [x] **M3 · Links between systems** (2026-10-05): a node or a diagram part may carry `ownedBy`, the key of another
  active project of the org, checked by name at the write door against the projects the writer may name
  (`unknown_project` lists only those; a node naming its own project is refused; a stored key is never rechecked),
  never a read across the fence; the Map's inspector and the Arch view's label and side name the owner, with a link to
  that project's Map only for a reader who may read it; no migration (the field rides the node's data). knowledge-selftest
  264, three smoke cases; shots in `engine/.runs/m3/shots/` (owner and Partner). No filed part carries it yet: in the
  three architectures nothing is another org project's (saruspay's `console` would be, if Veil became a project). Left:
  the reverse direction is not drawn; the link's `find=` highlights nothing unless the owning Map holds a matching node.
- [x] **M4 · Animation with meaning** (2026-10-05): ONE bounded statement (the parts' and services' lights and stale
  rows by id) rides the architecture part's read; a failing link runs red, a part with a failing check outlines red, a
  stale one dashed amber, a part changed this week pulses once and says so; Play stops at a journey's first blocked
  step and names the check, with Regrade when stale; the side counts failing, changed and blocked. `/map/arch` on siru
  9 → 10 statements, 170 → 200 rows; `/canvas.json` carries the marks too. arch-selftest 107, d1-hot 394, smoke
  258/258; shots in `engine/.runs/m4/shots/`. Left: for a week after a FIRST import every part on a service reads
  "changed" (the import stamps the services; a later identical import stays quiet) — the owner judges whether that week
  is acceptable; "changed" for an ungraded part reads the service's date only; the Arch client is 13 bytes under its
  42 KB cap.
- [x] **M6 · Frame history** (2026-10-05; `migrate-065`, BEFORE the code): every take of a screen's frame is kept
  (`k_screen_takes`, one row per filing, the body by its hash; the backfill one take per render already filed); the
  screen's inspector (and the Screens view's pinned panel, which embeds it) shows the last six takes with who filed each
  and when, the current one marked; a previous take restores through the door as the person (a render upsert naming
  the hash with no body; `POST /render/restore` the page's press), a Partner refused, an unknown hash 404. Clean-eval
  sweeps the takes. A screen's inspector costs one more statement (9 → 10), the Screens view with a pin 20 → 21;
  worst load 38 rows on the smoke org. knowledge-selftest 254, render 150, smoke 254/254; four shots in
  `engine/.runs/m6/shots/`. Left: the strip is a grid of three, a wireframe take shows as a plain plate.
- [x] **F1 · money on goals and refs on cards** (2026-10-05; `migrate-064`, BEFORE the code): a goal's optional
  `budget {allocated, spent, currency, source}`, rolled up the tree in the read already made (no new statement), on the
  Goals tab and a goal's page, listed by `brief {for: "finance"}`; a card's `refs` (`card/<kind>/<id>`, at most 12),
  checked at the write door against the project's own cards (`missing_card` with near matches) and read as links on the
  card's page. knowledge-selftest 246, d1-hot 372, smoke 251/251, `page-budget` within 10 rows on every load; shots in
  `engine/.runs/f1/shots/`. A budget is the goal's own money, summed with its children's, never an envelope (the owner's
  to change); `ARCHITECTURE.md` §2 lists both fields.
- [x] **The review's fixes** (`030d70e41`, 2026-10-05; the report `engine/.runs/review-s4/REVIEW.md`: 2 HIGH, 1 MEDIUM,
  2 LOW): a regrade observes only a reader's own page — the URL built with the URL API (`observeUrl`: the one `?project=`
  the seam reads; a path carrying its own project, a fragment, another origin or credentials goes to a person), the
  allowlist admits reader/none routes only and tests the NORMALISED pathname (`/goals/../logout` resolves to `/logout`
  before the test and is never fetched); a card LIST's refs pass the reader's rule (a member never sees a hidden card's
  kind and id); the takes guard compares the frame's last APPENDED take (rowid, never filed_at, which a version restore
  writes in the past — migrate-065 corrected before any live apply); `staleCountOf` counts in SQL and the card pool caps
  at the budget's 1,500. Each with its attack case: regrade 56, knowledge 265, render 151, d1-hot 394, map 107, arch 107,
  write-door 18, smoke 258/258; the gate green on the final code (`engine/.runs/gate-s4d.log`).
- [x] **SHP · the ship's own tools** (`e95b21e36`, 2026-10-05): `ship-plan.sh` prints only what THIS ship does — the
  sprint-3 one-off data steps (the rename, the strays, the clean-reports) and their scripts leave `tools/ship/` (git
  keeps them); a code-layout source's freshness (`tools/import/cost.mjs`) now reads only what
  `tools/import/read-code.mjs` reads (`engine/src/` minus the generated data modules, the contract, `boot.sql`, the
  code model, the named architecture), so a docs commit or a run log no longer stales sharingu's measure; every other
  layout unchanged. ship-selftest 64, import-budget-selftest 24, import selftest 211, backfill 27, check-docs 0,
  smoke 258/258.

**Ruled by the owner (MCQ 2026-10-05):** a walked flow's checks stay for a person after a change — the page regrades
only what it can observe; a walk's proof comes from the person's AI through the preview call the page copies out. **Data, not core:** saruspay's imported rulings carry no `decidedBy`; ryuklabs' claim cards carry no
role visibility (the owner ruled the team claim's names stay visible; which roles see the cards is theirs); Home's
"Latest changes" empty state: fixed in P3-F.

- [x] **The ship** (2026-10-05, the owner's OK by MCQ; live `7e49b56c-bfc0-4934-8ddd-c9550eac38ba`, tag `f08a09fb1`):
  `migrate-064` and `065` BEFORE the code, each with its bookmark; the import whole on the preview — six projects,
  stored == built, the prune plans removed nothing, the person-made rows kept; 10% canary, then 100%; the live walk
  13 of 13 (`engine/.runs/ship4-after-live-walk.json`); verify-live `--live` 18/18. The first two attempts stopped
  themselves cleanly (a stale bunny measure after its board moved; then the live fault below) — nothing promoted,
  nothing lost, the import resumed by clientRef. **Found on live and fixed:** an outer upsert overrides a trigger's
  legacy `OR IGNORE` (SQLite), so a node changed while its check was already stale failed the whole write; `migrate-066`
  recreates the 13 stale/refs/ungraded triggers with explicit `ON CONFLICT … DO NOTHING` (the attack case through the
  real door in `checklist-selftest`; the scar in `engine/CLAUDE.md`). Also: the mint's fixed seats land on
  sharingu + ryuklabs (`siru-services` died with sprint 3's rename; the FK had refused the dead key silently).

## Sprint 5 · the platform wave (owner approved 2026-10-06; branch `sprint-5`)

Platform readiness for ryuklabs' real users — no data work, no schema migration expected. Built in this order, each
committed on a green smoke; one review, ONE PR, the ship with the owner's OK.

- [x] **W1 · wrap_up answers register** (2026-10-06): the shape is now the question registry's own rule (QID_RE; the
  legacy questionnaire ids are a subset), declared the same in `contracts/door.declared.json` and asserted equal by the
  selftest; an answer naming an unknown qid is never filed dangling — one indexed read per report sorts known from
  unknown, and the unknown are said back in the receipt's note as unknown_question. The attack cases: real qids
  (`Q-…`, `R-…`) accepted, junk shapes refused (handoff-selftest 86); end to end on the real worker a member's wrap_up
  answer files and the question's page reads ANSWERED, the unknown said back (`s31-wrapup-answers`, smoke 259/259).
  s26's fixture now seeds its question, as the rule demands.
- [x] **B1 · the blockers read in budget** (2026-10-06): the UPDATES path (page, MCP and the bell; both blocker call
  sites, the owner's waitingOnYou and the project picture every caller gets) reads the open questions WITHOUT their
  options — OPEN_QUESTION_LITE_SQL, whose plan never touches k_options and stays on the (project, status) index — so
  the per-option rows (saruspay: 164 a call against the brief's 100) are gone from every updates read; the two sites
  share one request memo. The PAGES keep the full read on purpose: Home draws the choices and the checklist's
  questions-options item counts each menu, so no page's statement count moved (d1-hot's B1 cases pin all three:
  updates lite-only for owner and member, the lite plan k_options-free, /home full; the instrument still goes red on a
  double read). d1-hot 397, checklist 43, thread 50, knowledge 265, extract 60, measures 17, smoke 259/259. The live
  figure is re-measured at this sprint's ship (page-budget, as always).
- [x] **R2 · the org roll-up + honest search** (2026-10-06): `changes {org: true}` (and the twin's `?org=1`) answers
  the whole org in ONE call — the window's ledger rows counted by project (contributions, knowledge and grades apart,
  latest each; default the last 30 days, `since` an ISO time, a version refused as one project's notion), ONE
  aggregate on idx_transmission_project, each caller bounded to the projects they may read (the owner: the active
  ones; a seat: their seats; seatless: an honest empty) and silent projects answering at zero. P3's F5 took five
  calls and got no roll-up. The honest-search half was already real: the seam's own projectNote decorates every
  defaulted read since P3-F — verified on live (a no-project search named "bunny" and listed the alternatives), so
  nothing to build. extract-selftest 66, annotations 406 (the roll-up writes no row), smoke 260/260 (`s32-org-rollup`:
  owner, member bounds, the twin, the refusal).
- [x] **A1 · the Arch week** (2026-10-06): a part's first filing is its BIRTH, not a change — a service's own
  "changed" now counts only when it was updated after it was created (the node read carries created_at; a first import
  stamps created_at == updated_at on every part, which lit the whole architecture "changed" for a week after an
  import). A real contribution touching a part (its stale row's changed_at) still always counts. canvas 58, arch 107,
  map 107, d1-hot 397, smoke 260/260; s30's M4 case flipped to the corrected truth — it had asserted that two
  freshly-created parts read "changed", the very false positive (only r2, touched by a real contribution, does now;
  the side reads 1 changed). Sequencing ruled by the plan's laws: A1's three UI nits moved into A2, because they live
  in the Arch client that sits 13 bytes under its 42 KB cap and A2's trim is what makes their room.
- [x] **A2 · the Arch client built, then the UI nits** (2026-10-06): the client was already hand-tight (comments
  stripped, no repeated runs), so the trim became a build (the owner's MCQ): `tools/make-arch-client.mjs` runs esbuild
  with WHITESPACE minification only over `src/archclient.js` ARCH_CLIENT_SRC and writes the shipped
  `src/archclientdata.js` — identifiers, structure and strings untouched; the gate requires it tracked and `--check`
  fresh (as `src/doorcontract.js`), the importer's code reader skips it like the other generated modules. 41,987 →
  37,827 bytes. Then, in that room: a lane's fold bar is a keyboard control (focusable, a button, aria-expanded, named;
  Enter or Space works it and focus stays on the redrawn bar — Space no longer starts Play there); the Screens board
  RE-FITS after a rail or panel fold when it is still at its fit (it only re-centred), and keeps a person's zoom when
  they had zoomed; a wireframe take is DRAWN in the takes strip from its own grammar, server-side into the page (the
  render route still serves it as JSON, as the sprint-2 review hardened it), never a plain plate. Shipped client
  38,229 bytes: 3,771 of headroom. arch 111 (the client boots on what ships; every source identifier survives the
  minify; the keyboard fold), map 108 (both re-fit branches, through a test-driven ResizeObserver the fixture had
  never had — the resize path was untested before), d1-hot 397, render 151, smoke 261/261 (`a2wf`: two wireframe takes
  drawn, no plate).

**Sprint 5's end** (2026-10-06): the gate green; the four suites once each — evals 42, sims 10, tabs-verify 40,
verify-live 7; the independent review (`engine/.runs/review-s5/REVIEW.md`: 1 HIGH, 3 MEDIUM, 5 LOW) fixed at
`698645669`, each with its attack case (the HIGH: the org roll-up leaked knowledge-write counts and a timestamp to a
non-owner — knowledge is now the owner's column; M1 since an ISO time normalised to UTC; M2 the roll-up's read capped
per project; M3 wireframe drawings only on the page, never in JSON or MCP; L1 no one-project note on an org answer;
L2 no answer onto a ruled question; L3 no date fuse in the selftest; L4 esbuild pinned; L5 comments and contract
current); smoke 261/261. **SHIPPED 2026-10-06** (the owner's OK by MCQ): PR #273 merged as `7be4c20c1`; live
`beb954d7` (tag `8e8ac5f6e`), code only, D1 unchanged at 066; preview, canary and production smokes green;
verify-live `--live` 18/18; the live walk 13/13; the org roll-up checked on live (the cap engaged on the two busiest
projects, a version as since refused). Undo: `sh tools/ship.sh rollback 7e49b56c-bfc0-4934-8ddd-c9550eac38ba`.

## Sprints 6–9 · the platform road

The design, the slices and the residual ledger (every item that was open here, each with the sprint that closes it):
`PLATFORM.md`. Each sprint's slices are written here, ticked as they land, when it opens.

## Sprint 6 · Isolation (branch `sprint-6`, opened 2026-10-06) — nothing visible changes

The design: `PLATFORM.md` §4 sprint 6. One tune at the open (this session, 2026-10-06): the second org enters the
smoke at 6.1, the moment the tables allow it, and the cross-org case grows slice by slice — 6.6 is the full attack
suite, not the first contact. Entry baseline: `engine/.runs/s6-baseline/` (read-only on live).

- [x] **6.1 · The tables** (`397118801`). THE KEY FORM, decided by the plan's laws: a key is `o<org>--<slug>` for
  every org but org 1, whose keys stay bare — the six live keys untouched, nothing rekeyed; an org's number (not its
  name) rides the key so renaming an org never rekeys; `--` is the one separator no slug may hold, so the door's key
  form is unchanged. `migrate-067` (expand, BEFORE the code): the nine org-wide tables gain `org` filled with 1;
  `projects.org`/`projects.slug` GENERATED off the key with a unique (org, slug) index; the org table rebuilt for
  many rows; the tallies' org-level bucket per org (`''` stays org 1's); `sso_nonce` dropped. `migrate-068`
  (contract, AFTER the code): nine `org_required` refusing triggers. Every writer stamps the writer's own org, never
  a parameter; sign-in attempts count in org 1 until sprint 7 puts the org in the address. `check-boot-schema.py`
  proves boot equals the migrations replayed (45 tables, 67 indexes, 97 triggers, mutation-tested) and fails
  wrangler's two splitter scars (engine/CLAUDE.md). Proofs: smoke 264/264 (three `orgtwo` cases), the key-rule
  selftest 518/518, contract unchanged, all selftests green.
- [x] **6.2 · The scoped data layer** (`9d868bca4`). `src/data.js`: every statement on `db(env)`; the org from the
  sign-in only (all four resolvers land in `signIn`; one request, one org); a statement names the org by the
  `{org}`/`{orgbucket}` token and the layer writes in the validated integer — no token and no sign-in is refused,
  never org 1. All 345 call sites moved; 6.1's per-insert subselects replaced by the bound org; the caches and
  request memos keyed by org; a bare slug resolves inside the reader's org. The gate gains
  `tools/check-scoped-data.py` (mutation-tested) and `tools/data-layer-selftest.mjs` (39/39). Pulled forward from
  6.3: owner lookups, Control's actions, broadcast slugs and `slug_taken`, backfill — per org. Rows read on the same
  data: 190 of 196 loads identical, 6 lower (two were real leaks of org 2 into org 1's screens), none higher.
  Proofs: smoke 267/267 (`scoped`: 348 tool calls, 186 resource reads, 832 GETs as org 2 — 0 org-1 rows), every
  selftest green, contract unchanged. The public-link fork RULED (owner, 2026-10-06): links stay public while
  sign-up is allowlisted — 6.6's attack suite treats a read by exact id as the ruled exception; revisited before
  sign-up opens to everyone (`PLATFORM.md` §2.7).
- [x] **6.3 · An owner owns one org** (`86216d9c6`). /storage, /log, /control/measures, clean-eval and the storage
  guard answer the reader's org alone (/storage down to 2 statements, 2640 → 1360 rows); POST /backup-dump pages one
  org by `ORG_OF` per table (the `+` keeps every walk on its index); the backup INTO R2 refuses any org but 1 until
  6.4 keys carry the org (409 `org_storage_pending`, contract at 123 errors); the cron's nightly dump runs as org 1
  by `platformEnv` until 6.4 loops orgs. `/health` reads one `sqlite_master` row, nothing org-shaped (its quota
  behavior checked by hand at ship). `WORKER_NAME` deleted from src and both wrangler configs — the MCP greeting and
  Map · Arch name the caller's org from its row. Proofs: smoke 272/272 (five `ownorg` cases; s34's exclusions
  removed, 880 GETs as org 2 — 0 org-1 rows, 0 5xx), page budget on equal data 196/205 identical and 7 lower (/log
  +3 only beside a second org — no org-led index, S8), every selftest green, the checker at 343 calls.
- [x] **6.4 · Storage and the cron** (`90c875281`). Every R2 object at `o<org>/<logical key>` — `src/storage.js`
  the one place keys are spelled (`store(env)` the reader's org; `storeOfRow` only by exact id after
  `mayReadArtifact`, the ruled public-link exception); D1 keeps the bare key, the ship copies objects only. Org 1's
  dual-read until `tools/ship/r2-org-keys.mjs` copies, verifies and deletes at ship (delete refuses without a
  complete fresh verify; selftest 22/22). `src/cron.js` loops orgs under `platformEnv` (20 a run); the per-org
  backup lifts 6.3's 409 (contract back to 122 errors). The checker gains the storage rule (mutation-tested).
  Proofs: smoke 275/275 (`orgr2`: 32 cross-org object probes, 0 bytes; the dual-read and the ship copy walked),
  page budget 143/144 identical and 1 lower, every selftest green. Ship note: deploy the code, then plan →
  `copy --limit 20` → walk → copy → verify → delete → verify; the live REST path runs first at plan/limited copy.
- [x] **6.5 · One org's undo** (`02d4fa60e`). `tools/org-undo.mjs` (plan/export/restore/verify/delete) on the
  deployment's credentials, no worker route: the export is the per-org dump plus the org's bodies; the restore
  lands under a NEW org id with every remap recorded (projects to `o<new>--<slug>`, contribution ids renumbered in
  their day, taken ids rewritten wherever they appear); verify compares all 28 tables modulo the remaps and the
  restored owner signs in; delete refuses org 1 and anything unnamed, mismatched or changed-since-export, then one
  atomic batch to 0 rows with every other org counted unchanged. Flagged to the review: the transient eval-mark
  that passes the audit trigger inside the delete batch. Proofs: smoke 278/278 (`orgundo`: 5 refusals, 92 rows +
  18 objects to 0, orgs 1 and 3 untouched), selftest 30/30 (8 remap mutations red), page budget 142/142 identical,
  contract unchanged. The live rehearsal at ship: plan org 1 → throwaway org through the door → export → restore
  beside it → verify green → delete the copy, then the throwaway → plan shows 0 / org 1 unchanged → the walk.
- [x] **6.6 · The second org everywhere** (`43b33527d`). `tools/attack-xorg.mjs` joins the gate: both directions,
  each org's owner and member, 5,867 calls over every tool, resource and route — 0 rows of the other org, 0 5xx,
  the victim's tables unchanged by hash; the public file by its exact id asserted as the one ruled exception; four
  mutations turn it red. It FOUND a real leak (org 2 opened org 1's `GET /preview/:id` — the stored key resolved as
  the reader's slug), fixed in `src/preview.js` with its mutation pinning it. The suites' eval seats are new
  identities in their own "Suites" org (org 1's old eval-fixed rows stay inactive with their history); the fixtures
  and the dry run carry two orgs. `migrate-069` (AFTER the code and 068; its preflight in the header, 0 duplicate
  pairs on live): UNIQUE `(submitter, client_ref)` — the replay lookup's own scope — and `transmission_refs_meta`
  dropped. Sprint 1's items: counts count only what the reader may read; marked knowledge only on an eval project.
  Proofs: smoke 279/279 (`xorg` on the real worker: 21,891 calls, no findings), page budget identical, every
  selftest green, contract unchanged.
- [x] **6.7 · The docs of the fact** (`455bc453e`). The four docs state the platform fact: ARCHITECTURE §10's org
  wall; INVENTORY's reads on `db(env)`, auth and hooks current; engine/CLAUDE.md's "One database, every org" rules
  (§5's) with every scar kept; AGENTS.md's intro and layout row. check-docs 0 findings; the greps for the old
  claims answer only the new setup. Flagged to the review: INVENTORY's `tokenProjectFor` line may predate sprint 6
  (its only caller is the file list).

**Sprint 6's end** (2026-10-07): the gate green with the attack suite as a standing step; the four suites once —
evals 42, sims 10, tabs-verify 40, verify-live 7; the independent review (four passes: the reviewer plus three
helpers; the union in `engine/.runs/review-s6/REVIEW.md` + `CONSOLIDATED.md`) found 1 HIGH — a code rollback after
migrate-068 would refuse every sign-in and filing — and, proven by probe, three cross-org people-name oracles
(pickup's `next.who`, decisions' `decidedBy`, and the follow-ups join the fix hunt itself found), the scoped-data
checker blind to SELECT/UPDATE/DELETE, the attack suite blind to person-id oracles, `+org` full scans on the hot
projects reads, and the operator tools' freshness/verify/atomicity gaps. ALL FIXED at `3c7221f15`, each with its
attack case red-before/green-after: 068's written down script and ship.sh's refusing rollback; the three `{org}`
filters with the attack suite now filing the victim's ids into every id-shaped field; the checker covering every
statement shape on the nine tables (137 `{org}` · 24 bound-project · 47 allowlisted with reasons); boot-schema by
column definitions; the index fix (28 full scans → 0, 64 loads lower); org-undo's content-hash freshness, presence-
based kept rule and atomicity probe; r2-org-keys' recorded sha256s; restore-local accepting sprint-5 dumps; the
eval-marked preview fixture (the ship window's residue — the throwaway names on the old code's lists for the
minutes before 068 — listed and accepted). Judged sound by the review: the org slot, the `{org}` substitution, the
dual-read, the 6.5 eval-mark, the migrations against a rebuilt live copy. Four items ledgered to S7/S8.

**SHIPPED 2026-10-07** (the owner's OK by MCQ): PR #274 merged as `cb10817e8`; live `6e06c303` (tag `4900841ee`)
at 100%; D1 at migrate-069. Undo: `sh tools/ship.sh rollback beb954d7-50bd-498a-adbc-425f5c394c07` — it REFUSES
while 068's triggers stand: `sh tools/migrate.sh tools/ship/org-required-down.sql` first. The order as run: the
migrate dry run GREEN on live's own copy → 067 (bookmark `00000fac-00000000-000050fc-f6c3a6327b4517531776de05ef498fa1`)
→ the code: on the preview, BEFORE any traffic, the cross-org suite (5,858 calls both ways, 0 rows across the wall,
0 5xx, the public file by exact id the one ruled exception) and the walk 13/13, then 10%, the canary, 100% → 068
(preflight 0 rows; bookmark `00000fb6-00000258-000050fd-aa569fbafa08966067d53afc97f83c95`) → 069 (preflight 0
duplicate pairs; bookmark `00000fb6-0000025e-000050fd-e75836e134da1012d1d0c06bf0488460`) → the live walk 13/13 → the
R2 move: 5,496 of org 1's objects copied under `o1/`, verified equal (bytes, MD5 and content type), the old keys
deleted, 0 left; pre-ship files served by id after the delete (200, full bodies) → the 6.5 LIVE REHEARSAL: a
throwaway org (3) made and filed into through the live door, exported, restored beside itself as org 4, verified
8/8 (its owner signed in on live), org 4 then org 3 deleted to 0 rows and 0 objects with no other org losing a row;
org 1 identical before and after (55,508 rows, 11,373 search rows, 5,497 objects, 0 crossing its wall) →
`verify-live --live` 18/18 → `/health` 200, naming no org. Five ship runs: two cut by the Mini's restarts mid-attack
(each stranded throwaway removed by `--cleanup`), two stopped by real defects. Every defect the ship found was fixed
on main with its case: org-undo placing the 067→069 window's table (`d3d9723bd`); the walk carrying the key the door
answers (`05cf60bd4`); r2-org-keys bounded and retried requests, a journal before every put, progress, lanes, the
listing's content type (`08a622482` and after — a stalled connection had hung the first full copy for two hours);
org-undo's verify undoing `--name`; verify-live's legs filing their own target in the suites' org. The lesson
became law: long runs leave a trail (engine/CLAUDE.md).

## Sprint 7 · Accounts, sign-up and the front door (branch `sprint-7`, opened 2026-10-07)

The design: `PLATFORM.md` §2 items 8–10 and §4 sprint 7. The owner's items (the allowed emails, the privacy page's
update, the go for the first outside org) are due before the first outside org is LET IN, not before the build: the
sprint builds and ships on ryuklabs and throwaway orgs, and the waitlist stays shut until the owner's go.

- [x] **7.0 · Before the sprint (the sprint-6 ship's follow-ups)** (`d4b40e926`). (a) The dual-read is gone: every org
  reads only `o<org>/…`; a bare key is no org's. (b) Ship milestones: `ship.sh`'s run record under
  `engine/.runs/ship/` keyed by WHAT SHIPS (`engine/` + `contracts/` as committed), so a HANDOFF edit mid-ship keeps
  the resume; a rerun reuses a green gate (re-running the docs gate), a still-answering upload, and a smoke, attack
  or walk recorded for that exact version; promotion never reused; stranded throwaways cleaned first. Proofs: ship
  selftest 110/110 (24 resume cases, 15 mutants red), r2-org-keys 33/33, smoke 279/279.
- [x] **7.1 · Accounts** (`cd11186c6`). migrate-070 (BEFORE the code; refuses itself, with its preflight, if an email is in
  two orgs or on two active people — the owner's merge): `accounts` (email unique), a seat per org. Sign-in finds the
  one account, then its seat in the org the address serves (org 1 until 7.4); no seat here → `no_seat_here`, never
  another org; the lockout per account. Two secrets (the no-widening law): the account passphrase is the holder's
  alone (proving it on `/profile`, or 7.2's code sign-up) — migration carries none; each old passphrase stays the
  seat's secret, so org 1 signs in as today; an admin's set-password is refused for a person seated elsewhere.
  Proofs: the attack suite's new account moves RED with the fix reverted (4 findings), green with it; accounts
  selftest 35/35; smoke 282/282 (`accounts`); page budget identical. Accepted: the Suites org's seats sign in again
  once 7.4 gives it an address (the sprint ships once, after 7.4); a refused set-password tells one bit.
- [x] **7.2 · Sign-up by allowlist** (`e9d5f8d36`). The operator allows an email on the deployment's credentials
  (`tools/operator.mjs`) and hands the one-time code over by hand; `signup_codes` (migrate-071) keeps only its hash,
  single-use, expiring, revocable, bound to its email. `/signup` creates the account, gives a migrated account its
  passphrase, or (the operator's `--reset`) replaces one and ends every session in every org; every refusal is one
  answer and counts in the lockout; an account passphrase is at least 12 characters. No app seat mints a code.
  Proofs: signup selftest 36/36, operator 17/17, the attack suite 0 findings (9 with the binding reverted), smoke
  287/287 (`signup`); shots of the page in both worlds.
- [x] **7.3 · Create an org** (`76910d8fb`). migrate-072: the org's path slug (unique; derived for existing orgs:
  ryuklabs, suites) and one org per account (the owner's free tier). Reserved names derived from the door's own
  routes, a gate step (`tools/check-org-names.mjs`) failing any route an org name could shadow. `/orgs/new` creates
  the org, its owner seat and its first project in one write, proven by the ACCOUNT passphrase only (a seat secret
  never creates one); the owner key shown once. Proofs: orgs selftest 37/37, the attack suite 0 findings (RED with the
  guard reverted), smoke 292/292 (`neworg`); shots of the pages.
- [x] **7.4 · The front door by path.** **7.4a, the core** (`c8ad241ac`): the address picks the org (pages at
  `/<slug>/<page>`, the platform's routes at the root; an unknown org, a platform path under an org and a seat-less
  credential answer one 404); migrate-073: an ACCOUNT session reads as the account's seat under any of its orgs'
  addresses, a SEAT session stays bound to its seat; live sessions survive as seat sessions; bearer keys unchanged
  at the root and must match under an address; old bookmarks redirect; one URL helper builds every link, a gate
  step fails a literal app path; the Suites org's seats sign in again. Proofs: the attack suite walks every org
  address (12/12 mutations red), smoke 295/295 (`bypath`), page budget identical. **7.4b** (`2c3011178`): the picker
  after sign-in and the switcher (an account session's own orgs only); the root front door in sharingu's brand, an
  org's address in its own; the 404 a page, one body; the suites' cookie tools at their org's address. Proofs:
  accounts 51/51, the attack suite 0 findings, smoke 298/298 (`picker`); shots signed in.
- [x] **7.5 · The door.** **7.5a** (`48fed7922`): one `/mcp`; the OAuth grant records an ACCOUNT or a SEAT — a seat
  grant reaches its seat forever, an account grant the account's own seats; every call may carry `orgSlug`
  (stateless; any unreachable org one identical refusal); `whoami` lists the reachable orgs; connected clients land
  in ryuklabs unchanged (proven with a grant minted by the pre-slice code). Proofs: mcp-orgs selftest 26/26, the MCP
  client 90/0 for both grant kinds, the attack suite 0 findings with every tool called at the victim's org, smoke
  300/300 (`mcporgs`). **7.5b** (`95a8107ee`): `publish` and `equip` ask
  their confirm (opt-in, as `file`'s); stamp-less grants end (the ship lists any holder to reconnect); a
  hand-filed batch stays protected for its whole life; the attack suite walks the OAuth, cookie, read-only and
  Partner surfaces (18,093 calls, 18/18 mutations red). For the review: the MCP door's cookie path may be dead code
  (the deployed entry never lets a cookie reach `/mcp`).
- [x] **7.6 · The docs and self-hosting** (`1ec60c69d`). Self-hosting is the same platform on your own account: `new-org.sh`
  boots an EMPTY platform and allows the installer's email; the first org is born the one way (the code → sign-up →
  `/orgs/new`). day0-verify proves that first run: 25 passed, 0 failed. The six docs, ARCHITECTURE §10, INVENTORY,
  MCP.md and SECURITY.md say the platform fact; the upgrade order for an install from before sprint 6 is written.
  For the review: `day0-seed.sh` and `validate-seed.py` keep one caller (`restore-local.mjs`'s whole-database restore
  over live) — keep or delete beside `org-undo.mjs`.

Done when: on live, a stranger's allowed email and code (a throwaway the session makes) sign up, create an org and a
project, file through `/mcp`, and the attack suite shows that org and ryuklabs blind to each other; a real-browser
walk of the front door, the palette's search included, signed in with a cookie. The first REAL outside org waits for
the owner's go and the privacy page's update.

**Sprint 7's end** (2026-10-08): the four suites once — evals 42, sims 10, tabs-verify 40, verify-live 7; the
independent review (four read-only passes; the union `engine/.runs/review-s7/CONSOLIDATED.md`) found NO ship-blocker
and no cross-org read or write. Its fixes landed as ONE commit (`73ff65496`, 83 files): A1's pending seats
(`migrate-074` — a seat for an email whose account stands elsewhere WAITS for its holder's yes: the picker's
Accept/Decline, `POST /orgs/seat`, a session-only door; inert until then), never a default org (the picker ·
`409 choose_org` · the OAuth form asks), the ONE revocation rule (the holder's account-proven change ends the
account's sessions everywhere; an admin's seat action only that seat's seat sessions and grants), `email_not_ascii`,
a batch's first call deciding its org, `created_at` always the landing moment (`batchAt` in the grade), the off-org
confirm not asked, the root cookie anchor gone (a cookie signs no one in at `/mcp`), 072's reserved fallback,
ship.sh's pre-upload reads (live's schema level, the org-names check) with `ship-plan --no-import`, `operator
remove-account`, `day0-seed` deleted, the docs of those facts, and the attack suite's account moves re-derived under
A1 (the pending seat asserted inert; the squat's seat accepted through the real sign-up door; `held` from the squat;
18/18 `--prove` red). Every proof rerun on the fixed tree: statics green (35 tools · 87 REST rows · 137 error codes;
org-paths `--prove` 8/8; scoped-data + selftest 36/36), 87 selftests PASS, smoke 305/305, evals 42/42, tabs-verify
40/40, attack-xorg in-process 0 findings over 18,314 calls, THE GATE GREEN. The reprove's own finds, fixed in the
same commit: the backup rule had not placed `people.pending`; `/orgs/seat` had no auth class (now `session`, parity
and the AC eval both teach it); d1-hot's fixture lacked the org row the new sign-in joins; the smoke's transient
socket failures under the shared Mini's spikes (patientFetch; s40's paced form creation). To S8's ledger: the
account lockout, the per-seat grants epoch, and the squat's residual (`PLATFORM.md` §3).

## Sprint 16 · The stores' re-read (branch `sprint-16`, opened 2026-10-12; the owner's MCQ of the day) — SHIPPED 2026-10-12

The spec: the stores' pages re-read on 2026-10-12 against the kit (the Claude connector and plugin pages loaded with
their checklists and review criteria; OpenAI's help article and announcement answered 403, so OpenAI's developer docs
were read instead) and the owner's MCQ: the two tools that change a check's grade are destructive.

- [x] **16.1 · The graders are destructive.** `submit_grade` and `regrade` carry `destructive:true` in `MCP_TOOLS`
  (the rule beside it: a write that can replace, remove or overrule what is held, a check's grade included, is
  destructive; one that only adds is not). 18 read-only and 17 writes, 11 of them destructive; `ask`, `preview`,
  `publish`, `publish_version`, `save_file` and `wrap_up` only add. The contract, `listing/docs.html` and the site's tools
  page (branch `annotations-graders`) follow; annotations selftest 406/406 (the real worker's tools/list = the contract).
- [x] **16.2 · The kit's gaps.** OpenAI's annotation justifications are generated from the contract into
  `listing/SUBMISSION.md` (the portal takes them, the ZIP has no field for them; `--check` reds a drift); the release
  notes ride the manifest (`publication.release_notes`, one source); the ZIP's own copy of `plugin/.mcp.json` declares the DCR auth
  block (`plugin/.mcp.json` untouched); `listing/test-cases.md` gives ChatGPT's connect path and words P4 for a client
  with or without a confirm prompt; SUBMISSION adds the strict validate step, the auto-publish toggle (OFF for the first
  submission), the verified identity (Ryuk Labs) and the demo on desktop and mobile. Plugin 0.1.13. plugin-codex
  129/129, plugin-sync 48/48, `claude plugin validate --strict` passes; the test ZIP 25 files, every field in its limit.
  Smoke 327/327, the gate green (a first run was killed from outside at load 36 and a second overlapped its leftovers:
  429s and a doubled org 2; the clean third run green).
- [x] **The sprint end.** Smoke 327/327 and the gate; merged as ryuk-labs/sharingu#2 (239f3f606); shipped with the
  owner's OK: `16560e8d` → `53f824f0-f259-47ef-8509-c958b4568382` at 100%, no migration (live stays at 080). Proofs: the
  cross-org suite 10,332 calls, 0 rows across; the walk 13/13 on the preview and on live; verify-live 28/28; live's
  tools/list: 35 tools, 11 destructive, the two graders among them. The site's `annotations-graders` merged (abbde89,
  verify 236/236); the dist repo synced to 0.1.13 (575be16, sync-check green). After it, by the owner's MCQ: the reviewer
  world rebuilt on a domain we own (`@review.sharingu.xyz`; `.invalid` read as fishy to a reviewer). A rename was
  refused by migrate-070's `people_email_fixed` (a seat keeps its account's email; nothing changed), so org 3 was
  exported (`.runs/reviewer-org/export-invalid-20261012`), deleted, its 7 accounts removed, and the world rebuilt with
  `--domain review.sharingu.xyz` (a fresh measure first: 17,028 rows); seven new codes in the private file; the eight
  cases 8/8 on live. The OpenAI domain token stored on live (both domains answer it).

## Sprint 15 · The repo move (branch `sprint-15`, opened 2026-10-12; the owner's MCQs of the day) — SHIPPED 2026-10-12

The spec: the owner's rulings of 2026-10-12. Rein reads the engine's code, so the engine moves to the ryuk-labs org with
a FRESH history (one root commit, 6e6918541; the old repo's history, scanned clean by gitleaks: only three fake test
fixtures, stays private and archived); the plugin's public dist repo moves beside it; every forward-looking reference is
updated. Rein is a ryuk-labs admin for now (the owner's call).

- [x] **15.1 · Every forward-looking reference names the new repos.** The clone URL, the land commands, the tools'
  User-Agent, the plugin-sync selftest's refused engine URL, the model fixtures' GitHub node; the plugin's dist repo in
  Control · Connect (`PLUGIN_MARKET`), the generator's `DIST_REPO`, the ship plan and its selftest, the manifest's
  `repository` (plugin 0.1.12), the READMEs, `INSTALL.md`, `MARKETPLACE.md`, `listing/SUBMISSION.md`; the site's install
  line on its branch `plugin-repo-move`. Historical citations (the imported sources' labels and PR links, past sprint
  records) keep naming the archive: they are true. `AGENTS.md` History: the `archive` remote the gate's history checks
  read. Proofs: check-docs 0 findings, plugin-sync 48/48, ship-selftest 134/134, make-listing-docs --check, the door
  contract unchanged, `claude plugin validate --strict` passes. `wire-selftest`'s sample scan read "ryuk-labs" as the
  artboard's sample person `ryuk` (a dash is a word boundary): one named exception, the `PLUGIN_MARKET` literal (a typed
  "by ryuk" is still red). Smoke 327/327, the gate green.
- [x] **15.2 · The live walker.** `tools/listing-walk.mjs` walks `listing/test-cases.md`'s eight cases, each as its
  account, on any worker from a refresh's codes file (never printing one); smoke case `s51` walks the same code. On live
  after the 2026-10-12 refresh: 8/8.
- [x] **The sprint end.** Smoke 327/327 and the gate; merged as ryuk-labs/sharingu#1 (b07cba466); shipped with the
  owner's OK: `64aad029` → `16560e8d-8a29-4e91-a8bd-bad4a7429b14` at 100%, no migration (live stays at 080). Proofs: the
  cross-org suite 10,332 calls both ways, 0 rows across; the walk 13/13 on the preview and on live; the canary pinned;
  verify-live 28/28; live Control · Connect names ryuk-labs/sharingu-plugin. The site's `plugin-repo-move` merged
  (3f6a162, verify 236/236) and live. ryukdev/sharingu archived (private). The cross-org suite's pool waits for the next
  platform sprint (`PLATFORM.md` §3: at most about 2.3x).

## Sprint 14 · Submission prep (branch `sprint-14`, opened 2026-10-12; the owner's MCQ) — SHIPPED 2026-10-12

The spec: the stores' pages re-read on 2026-10-12 (claude.com's connector submission, connector and plugin
pre-submission checklists; OpenAI's plugin submission page) against the kit, and the owner's MCQ of the same day
(refresh the reviewer world now; the videos as unlisted YouTube links, the owner's, later; soften two descriptions).

- [x] **14.1 · Two descriptions say when, not what to do.** `whoami`'s "Call it first." and `missing`'s "Call it before
  you file." (the closest our 35 descriptions come to the reviewers' "instructs Claude" pattern) now read "Useful at the
  start of a session, to see where writes will land." and "Useful when deciding what to file next." The docs page shows
  titles, so it and the site's tools page are unchanged. The sprint-end read of the diff found two more of the same
  shape the first scan's pattern missed: `updates`' "Call it at the start of a session." and `impact`'s "Ask it before
  you change something." now read "Useful at the start of a session." and "Useful before changing something." An
  imperative-sentence scan over all 35 now finds only `submit_grade`'s "Send clientRef to retry safely." (how to use
  its own parameter: kept). The start-here guide's "Call it at the start of every session" is a document the AI reads on
  request, not a tool description: kept.
- [x] **14.2 · The plugin manifest's two warnings.** `displayName` and `repository` (the public dist repo, never the
  engine's) set; the generator moved the plugin to 0.1.11; `claude plugin validate --strict` passes.
- [x] **14.3 · The kit's gaps.** `listing/SUBMISSION.md`: the connector's allowed link URIs (`https://agent.sharingu.xyz`),
  P1's "from Claude" check on Activity, the carousel's "card alone" rule, OpenAI's release notes, where the videos go.
- [x] **The sprint end.** The gate and the suites (on 5da011add; the follow-up by smoke and the gate); merged as
  ryukdev/sharingu#282 (993b1f64e); shipped with the owner's OK: `e5dfd3c4` → `64aad029-1ff5-4ebb-8d7f-187ae9e2087c` at
  100%, no migration (live stays at 080). Proofs: the preview smoke, the cross-org suite 10,332 calls both ways (3,714
  answered 2xx), 0 rows across; the walk 13/13 on the preview and on live; the canary pinned; verify-live 28/28 (the
  limiter SKIP is opt-in). The cross-org suite took 2 h 4 min of the ship's 2 h 10 min (a `PLATFORM.md` §3 row).
- [ ] **After the ship.** In this order: the live reviewer world refreshed with `--reissue` (before any code goes into a
  form) and `listing/test-cases.md` walked on live as each account; the dist repo synced to 0.1.11.

## Sprint 13 · The filing client and sprint 12's rows (branch `sprint-13`, opened 2026-10-11; the owner's "go") — SHIPPED 2026-10-12

The spec: the owner's MCQ of 2026-10-11 (store which AI filed a contribution, a self-declared label, named on the privacy
page) and `PLATFORM.md` §3's sprint-12 rows.

- [x] **13.1 · Which AI filed it.** A migration adds the client (expand, BEFORE the code); each filing is stamped at the
  door with ONE normalised family word (claude, claude-code, chatgpt, codex, web, api, other) from what the client
  declares (the OAuth client's registered name, the MCP session's clientInfo, the web app's own forms; never the raw
  string); Activity's rows, the `changes` list and the weekly review show it; old rows stay unknown; the site's privacy
  page says it is a self-declared label.
  DONE: `migrate-080` (`transmission.client`, BEFORE the code, NULL before it); `src/client.js` — the family word by trust:
  the OAuth client's registered name (saved on the grant when made; no extra KV read), the MCP clientInfo (in the session
  id for the handshake revision, from `_meta` for the stateless one), else the door (`web` for a browser, `api` for a key
  on REST, `other`); a body's `client` ignored; both ledger inserts stamp it; Activity says "from Claude Code", the
  `changes` list carries `client`, the weekly review (v2) may name it; plugin 0.1.10. One behaviour change: a client
  whose clientInfo names a known tool gets a session id at initialize even without elicitation/Apps (the review reads it).
  client selftest 35/35 (red on HEAD; 12 mutants), activity 75/75, mcp-orgs 49/49 (C18), migrate-dryrun knows 080; s54.
  The site's privacy page says it (branch `privacy-client`, verify 236/236), shipped with the engine.
- [x] **13.2 · No internal project key in any answer.** The invite flash's "seated on o2--sample" and every other answer
  or page that can name an `o<N>--` key shows the slug or the name.
  DONE: Control's flashes ("seated on Sample"), the notes of changes, search, read, brief, versions, grades, checks,
  surfaces and questions, missing's fill calls, Broadcast and equip, the Map/Architecture/Screens titles, the door's
  refusals and whoami's line ("Your writes land in "shop" (Pilot shop)"), create_project's note and the confirm form
  ("File 3 items into sample", never "into null") — the slug, with the name where held (`projectWords`); JSON data
  fields keep keys; every refusal's suggested project re-called as the same caller and accepted. project-words selftest
  STRICT, 34/34 (17/34 on HEAD), a gate step; the route texts' row share trued to 1,000.
- [x] **13.3 · The reviewer world re-imports a changed source.** `make-reviewer-org.mjs` keys each import in its run
  record by its sources' digest: a changed overlay imports again (the importer files nothing twice).
  DONE: each import's digest is sha256 over its sources (sharingu: a content hash of what the code importer reads; the
  overlays by file name; the renders); unchanged skips, changed (or an entry with no digest, once) imports again with the
  live dry run first; a sample re-import first sets the showcase goal back to the overlay's state (the door refused the
  done goal against the overlay's — the builder's find), then marks it done again. Selftest 35/35 (31/32 on HEAD; four
  mutants red); a local world proved unchanged / changed / rerun. The live record has no digests yet: its next run
  re-imports both, with `--reissue` (seven new codes) and a fresh measure.
- [x] **13.4 · The org-wide count inside the row budget.** `changes {org: true}`'s per-project count stays under 1,500
  rows on an org of 6,000 filings.
  DONE: `ORG_COUNT_SQL`, one statement per project in one batch, each a newest-first range of its own index, every
  scanned row inside the shared 1,000-row limit (hidden rows counted out); the doubling was the ten-kind `NOT IN` (D1
  counts its temporary index's lookups as rows), now a CASE. On the 6,000-filing org: owner 2,840 → 1,002 rows, member
  2,662 → 1,005. extract selftest 75/75 (red on HEAD; five mutants red).
- [x] **The sprint end.** Smoke 327/327 and the gate green on the slices (24803a484). The review (read-only, the whole
  diff): no blocker. Fixed: (1) a call a client sends as given — `missing`'s and the holes' `fillPath`, equip's
  `next.rest` — keeps the project's KEY again (a slug would resolve in the caller's own org: an account grant reading org
  B could file B's items into A's project of that slug); the line a person reads (`fill`, the copy button) shows the slug;
  (2) the per-project scan's floor is one row (was 20), in `changes {org: true}` and Activity alike, so 1,000 rows holds
  for any number of projects; (3) `confirm.js`'s header and migrate-080's undo name the new session id. Folded: a data
  refresh of the reviewer world that keeps the codes (PLATFORM §3; the ship plan names `--reissue`'s reset meanwhile).
  The fixes committed (c78c998d9) and proven on their tree: every selftest, smoke 327/327, the gate green, evals 42/42,
  sims 10/10, tabs-verify 40/40. The sprint waits on the owner's merge-and-ship OK (migrate-080 BEFORE the code).
- [x] **The ship (2026-10-12, the owner's OK of 2026-10-11).** PR #281 merged (main 9c36ebb34). The plan's `--no-import`
  order (every import measure stale; the projects' data off the road — the plan complete, 0 gaps): budget green;
  migrate-dryrun green; migrate-080 applied BEFORE the code (Time Travel bookmark
  00000ff3-00000000-00005101-2e32cfba286f19c2f08dd49dfd1c265d, the data undo); org names and OAuth grants read green.
  `ship.sh ryuklabs`: 89324a3c → **e5dfd3c4-a4a2-401a-8bad-2aae0a92fd54 at 100%** (tag 9c36ebb34), triggers applied.
  Proofs: the preview's cross-org suite 10,332 calls both directions (3,714 2xx), 0 rows of the other org read or
  written, 0 5xx, 0 plan_limit; under the victim's address 516 calls as bearer and 516 as session, each the one 404;
  the preview walk 13/13; the canary pinned and production smokes green. Post-ship: the live walk 13/13 on
  agent.ryuklabs.io (57,368 rows read, 811 written over 107 requests), verify-live `--live` 28/28. Undo: `sh
  tools/ship.sh rollback 89324a3c-ebf4-4541-b8d3-dd3b273bf8c1` (code); the 080 bookmark (data). The site's privacy page
  (branch `privacy-client`) ships with it.
- [x] **The retakes (2026-10-12, after the ship).** Video 2's invite clip re-filmed on the shipped code (a throwaway
  `--sample-only` reviewer world on a local worker; the flash reads "seated on Sample project (sample)", the link
  blurred, every frame reviewed): `listing/videos/2-org-and-people.mp4`, 55.0 s, H.264 1280×800; the world, its codes
  and its state deleted. The carousel's four cards re-shot by `card-shots.mjs --carousel` on a fresh dev-local (9/9
  checks; slug-only naming on every card): `listing/carousel/`. That dev-local run is the FRESH IMPORT MEASURE for M4's
  reviewer world. Found and folded (PLATFORM §3): a standing local world misses new migrations — dev-local failed on
  `transmission.client` until migrate-080 was applied by hand.

## Sprint 12 · A frictionless start (branch `sprint-12`, opened 2026-10-10) — SHIPPED 2026-10-11

Four steps for a new team, the same in the product, the docs and the videos: (1) join and connect, (2) the org, its
project and its people, (3) the product side filled by your AI, (4) the GTM side filled by your AI — and every
contribution tracked across people and projects. Rulings: the 50 beta orgs stay on the WAITLIST (the owner approves
each); the GTM skill files summaries and links only, never raw mail or DM text; videos 1–2 by the session on the
product, 3–4 by the session driving Claude Desktop with the owner's approval, ChatGPT's by the owner.

- [x] **12.1 · The buttons.** "Add to Claude" (Claude's prefilled install link for a custom connector, the directory
  listing once published), "Add to ChatGPT" (chatgpt.com/plugins and its three steps until the plugin is listed — no
  documented deep link), Claude Code's two commands: on the site's hero and docs page and on Control · Connect.
  DONE: the site (its `9a683af` on branch add-buttons, deployed with the ship): "In the beta? Connect your AI" under
  the hero's CTAs and a docs section that opens "Joining is by the waitlist"; one connect constant the build checks every
  link against; ways.spec 10 checks; verify:affected 236/236 (114 dead CSS rules cut to stay in the home page's budget).
  Control · Connect: plugin · Claude (the install link, named after the org, the request's own /mcp) · ChatGPT (its
  three steps) · Claude with a key · Codex, each link one constant to swap at listing; the MCP address breaks only at its
  natural points; every raw `o<N>--` key on Control shows the slug (12.6's `projectSlug`). s6 pins the rows exactly.
- [x] **12.2 · The four steps, written once:** the site's docs page, INSTALL.md, the plugin README and the door's
  first-run guide tell the same four steps.
  DONE: (1) join and connect — the waitlist's 50, the operator's code by hand, sign up, the org and its first project in
  one form (moved here from step 2: the org must exist before an AI connects), then Add to Claude / ChatGPT / Claude
  Code; (2) the org's people — invite links, roles and the seven hats by class; (3) fill the product side; (4) fill the
  GTM side (summaries and links only); then every contribution tracked. The site's docs page (the stale "MCP URL and a
  person's access key" sentence gone) and its hero's "50 orgs in the beta" (on branch add-buttons; verify 236/236), INSTALL.md
  (its dead §5/§7 pointers fixed), the root README (its self-host block and key-first clients table trued), the plugin
  README (0.1.8), the door's first-run guide and `missing` (day1-door 187/188 → 188/188, day1-reading 99/100 → 100/100).
- [x] **12.3 · Invite links.** Control's Invite makes a one-time link; the invitee sets a passphrase and holds an account
  with no operator code (an auth change: the adversarial read before it ships).
  DONE: Control's Invite gives a one-time link `/signup?via=invite#<token>` (192 bits, in the fragment: in no request
  line, Referer or log; the page moves it into the POST and wipes it), stored only as a hash in its own table
  `seat_invites` (migrate-079, BEFORE the code; never the operator's `signup_codes`), bound to one org, one seat and that
  seat's email, 7 days, single use by one conditional UPDATE, dead on a reissue, a set-password or a newer link. It sets
  a passphrase ONLY on an account with none and no other seat (else `409 account_stands`, nothing written); an
  invite-made account reaches only its inviting org — no org created (`403 org_by_invite`), no other org's seat seen or
  accepted — until the operator's code confirms the email (the squat-by-link attack, the builder's own find). The key
  path stays as the labelled alternative (scripts, the suites). check-scoped-data's `invite` rule; invite selftest 56/56
  (16 mutants red; 9/38 against HEAD); the cross-org attack's invite moves both ways + 4 mutations red; s53 in the
  smoke. Residuals for the owner: an admin's "New invite link" on a passphrase-less person of its own org sets that
  person's passphrase (contained to that org); a refused link answers faster than an open one (meaningless without a
  192-bit token).
- [x] **12.4 · The filing skills** (presets, so the plugin and the Codex manifest carry them): fill the product side
  (code, docs, tickets → goals, the map, screens, decisions, docs), fill the GTM side (mail, DMs, meetings, CRM,
  revenue, SEO / AEO / GEO → GTM cards; summaries and links only), the weekly review (what changed, who filed what, where).
  DONE: three presets (orders 17–19) → the shelf and the plugin (0.1.7; Codex ZIP 25 files): `fill-the-product-side`
  (every Map layer with the door's real shapes — screens with wireframes, doors as the API map, tables and entities as the
  schema, flows, services for the connected apps, deps as the decision chains — plus goals, decisions and docs; keep it
  current through `changes` and `impact`), `fill-the-gtm-side` (summaries and links only, the privacy search before every
  preview, revenue only as the figures the person names), `weekly-review` (reads only: `changes {org: true}`, then per
  project; an optional note filed). presets-selftest 57/0 (its privacy check now covers both fill skills), codex 109/109,
  sync 48/48, validate --strict green. FOUND: the Map's Deps layer is the decision chains, not the connected apps
  (services) — 12.8 places the apps as services; no read says which client filed a contribution (12.5 may add it).
- [x] **12.5 · Activity across every project** for an owner: who filed what, on which project, from which client, its
  state; filtered by person, project and lane; inside the row budget.
  DONE: `/audit?all=1` (and the one-project trail's "All projects" chip): every contribution across the projects the
  reader may read — the owner every active project, a member its seats, a Partner its seated projects — newest first:
  who (role, hats), what (linked into its project), the project, the lane, the state, when, and the door it came through
  (MCP / REST / web app); filters by project, lane, state, person and window; paged by time. The door: `changes {org: true,
  list: true, person, lane, state, projects, before}` and its REST twin; a project outside the reader's set is
  `project_forbidden`, nothing read. Rows: 510 worst on the real local data, 1,306 on a 6,000-filing org (each project's
  own index walked, 1,000 rows shared). activity selftest 60/60, 12 mutants red. FOUND: WHICH CLIENT filed a contribution
  (Claude, ChatGPT, Codex, Claude Code) is stored nowhere — shown as nothing, never guessed; storing it (a `client` column
  on transmission, a self-declared label) is the owner's call. The old org-wide COUNT reads 2,851 rows at 6,000 filings
  (over budget; a §3 row); the attack suite does not walk the new args yet (the sprint-end fix).
- [x] **12.6 · The card's and Control's polish** (sprint 11's shot finds): the brand fonts in the card (data: fonts in
  its CSP), "?," and the doubled places in its lines, the needs row's echo, a decided question's rationale, the internal
  project key in the switcher, Control's MCP address breaking mid-word.
  DONE (Control's address wrap rides 12.1, its file): the card's CSP gains `font-src data:` only and inlines a subset of
  the three faces (template 56,412 → 86,272 bytes, a pinned 96 KiB budget; system faces still close every stack);
  `lineJoins` drops the comma after ? or ! in every line; one de-duplicating place function ("Broadcast · Home"); a
  needs row's echo dropped; a decided question's rationale on the card and the page; the switcher (and the picker, Profile,
  the org-created page, Versions, the card and the terminal) shows a project's name or slug, never an `o<N>--` key.
  Red on HEAD, green now: confirm-card 56/11 → 67/0, preview 56/4 → 60/0, knowledge 303/1 → 304/0, d1-hot 400/1 → 401/0.
- [x] **12.7 · The 50:** the operator's allow counts the beta's orgs and refuses the 51st unless told otherwise; the site
  says "50 orgs in the beta".
  DONE (the operator's half; the site's line rides 12.2): `BETA_ORG_CAP = 50` in `operator.mjs`; `allow` counts the outside
  orgs standing plus the allowed emails with an open code and no org yet (org 1, the suites' org, the plans `reviewer` and
  `suite` never count, each by its durable marker), refuses at 50 with nothing written unless `--beyond-cap`, says "N of
  50 left"; list and list-orgs carry the count. Operator selftest 78/78 (65/78 with the cap at 51; four mutants red).
- [x] **12.8 · The showcase world** (the owner, 2026-10-10: "screens, wireframes, the database schema, the API map and
  the many apps connected" — the Map's screens, doors, data, flows and deps layers — and "every new filing, a request,
  an update, an upgrade, visualised as a proposal, cooked by the devs and filed completed, both sides showing their
  impact on the goal; all contributions"): the sample project carries every layer and ONE request's whole loop
  (proposed → decided → picked up → filed done, the goal moving on both sides), and the reviewer world seats each class
  of a real org — C-level (management), devs (engineering), BD and marketing (GTM), testers (a SEVENTH hat, Quality: the
  owner's MCQ 2026-10-10 — test runs, grades on checks, bugs found, release readiness), a partner — each reading as its role.
  DONE: the Quality hat (seventh; its brief lanes code + ba, Home leads with what changed); the Sample project gains
  "the Pilot Shop", a labelled FICTIONAL example (the demo overlays describe sharingu itself, so its own facts were not
  bent): 3 apps, 11 wireframed screens, 11 doors, 6 tables + 3 entities with 5 relations, 2 flows, 3 generic services
  on Map · Arch, a deps chain, 3 checks, the goal pay-by-invoice; the reviewer world seats seven (admin, member, dev, bd,
  marketing, tester, partner), each with its hats, and files the loop AS THE SEATS through the door: bd proposes → the
  owner decides → dev picks up and files the change → the tester grades two checks → marketing files the launch; the goal
  reads 100% with ba, code and gtm each landed. Local proof: 1,112 rows imported, a rerun writes nothing; every seat and
  every layer read back. hats 32/1 → 34/0, make-reviewer-org 23/26 → 28/28. Left: the six-hat words in files 12.3
  holds (index.js, admin.js, door.declared.json), and the demo import's live measure before the live --reissue.
**Sprint 12's end** (2026-10-11): two independent read-only passes — adversarial (invites, Activity's scope, the cap,
the seats; scratch attacks on the real worker) and general (correctness, the four steps, ops, the look): 0 SHIP-BLOCKER,
1 HIGH, 7 MED, ~12 LOW, fixed in ONE commit: H the cross-org suite walks 12.5 (the activity walk + two mutations; full
in-process 20,003 calls, --prove 25/25 red); M a deleted org's id can no longer re-point an invite-made account's mark
(org-undo clears it; every sign-in path honours the mark — defense in depth that also closes the add-person race); M
Activity inside the row budget under a hostile shape (6,225 → 1,325 rows; an id cursor splits a big millisecond); M the
product skill's `source` (nodes keep it in `data.source`: the shipped skill would have refused whole batches; plugin
0.1.9); M the showcase goal reads done; M Screens open on Wireframe with no filing note; M the one-project page is the
"Audit trail"; L invite links only for never-used seats, `referrer-policy: same-origin` (the token rides the fragment;
no-referrer would refuse old Safari's Origin), `who=` names, `equip`'s real call, the counts, the card's padding and
table names, clipped labels, "sharingu's door". The gate's own finds: migrate-dryrun's replay pin knows 079;
ship-selftest's M4 undo names seven accounts.

**Sprint 12 SHIPPED** (2026-10-11, the owner's MCQ: merge and ship now; and "store the filing client — yes, next
sprint"): PR #280 merged (`ec84203d5`, MERGED verified). migrate-079 on live after its dry run green on a copy with two
orgs, bookmark `00000fe5-00000000-00005101-980e4653a5b52942459ad76d837e3b59` the undo (`seat_invites` and
`accounts.invited_org` read back). Two runs: the first refused itself on the cross-org suite's NEW instrument check — the
activity walk's own list was empty because the preview's throwaway rows are eval-marked and Activity hides eval rows
unless asked (0 rows across, 0 5xx in 10,332 calls) — nothing promoted; the walk now reads with `eval` (`8094d2db9`),
proven first in the preview's own mode on a local worker; the second ran clean: the cross-org suite 10,332 calls, 0
across, 0 5xx, 0 plan_limit, the four activity walks green, 516 + 516 under the victim's address each the one 404
(3,150 s), the preview walk 13/13, the pinned canary, 10% → 100%, the production smoke, the triggers (both domains
attached). Live is `89324a3c-ebf4-4541-b8d3-dd3b273bf8c1` (tag `8094d2db9`). After: `verify-live --live` 28/28 (a
first run skipped its authed checks on a transient Cloudflare read; the rerun green); the live walk 13/13; the site's
branch merged and deployed (its `168a1ce`: the three ways in, "50 orgs in the beta", the four steps; the old access-key
sentence gone); the dist repo at 0.1.9 (`d2e2938`, three new skills; a fresh clone in sync, 28 files; a stranger's
install 0.1.9 with 19 skills); the import measures fresh; THE LIVE REVIEWER WORLD rebuilt with `--reissue`: seven
seats with their hats, the sample re-imported with the showcase (~1,112 rows; the run record had marked the sprint-11
import done — its entry dropped by hand, a §3 row), and the loop filed as the seats: T-20261011-024 proposed by BD →
approved → T-…025 the dev's change → the tester's two checks graded → T-…028 marketing's launch → the goal done; every
seat's read proven, the partner still refused sharingu; the codes only in `~/.sharingu/reviewer-credentials.txt`.
Undo: `sh tools/ship.sh rollback f3c3312a-951c-45cf-a30c-629443656c48` (code); the 079 bookmark (data, the WHOLE database).

- [x] **12.9 · The four videos** (1 and 2 RECORDED 2026-10-11: `listing/videos/1-join-and-connect.mp4` 63 s, `2-org-and-people.mp4` 55 s — live for every read-only view, a local reviewer world for every write, every secret field blurred fail-closed) (≤ 90 s each, after 12.1–12.8, on the showcase world), the carousel retaken (2026-10-12, sprint 13's tail).
  3 and 4 RECORDED 2026-10-12: `3-fill-the-product-side.mp4` 56 s, `4-fill-the-gtm-side.mp4` 53 s. The ruling's "the session
  drives Claude Desktop" cannot hold: computer use is never granted Claude's own app (a platform rule, not a setting). So the
  OWNER ran each take in Claude Desktop (the dev seat for 3, the BD seat for 4, a fictional Pilot Shop's notes attached, on a
  throwaway local reviewer world plus an empty project "Pilot shop"), and the session cut it: five segments a take (prompt,
  preview card, "file it", receipt, summary) on a paper canvas with captions beside, then the app half filmed headless by
  the 12.9 recorder (3: the Map canvas, screens, services, the goal tree; 4: the GTM tab, the showcase goal's loop, Activity
  across every project). The trap (machine-local scar): a screen recording is variable-frame-rate, and seeking into it lands
  1–5 s off, unevenly. Cut times pinned that way let a local preview link onto the screen for 1.5 s; a half-second sweep
  caught it. Every cut was re-pinned on a constant-25 fps copy decoded with no seek, and every half second of both videos'
  take segments re-checked (no account stats, no local address, no stray prompt). The world, its codes, its connector
  tokens and the Desktop config entry are deleted. The dist repo sync stays the owner's.
Then M4: the owner submits from `listing/SUBMISSION.md`.

## Sprint 11 · M4's kit (branch `sprint-11`, opened 2026-10-10) — SHIPPED 2026-10-10

The spec: `MARKETPLACE.md` M4 and the stores' own pages (read 2026-10-10: the Claude connector and plugin submission
pages and checklists; OpenAI's plugin submission guide). The owner's "proceed with M4 prep" (2026-10-10); the paid
claude.ai plan and the OpenAI organisation are ready when needed. DONE BEFORE THE BRANCH, on live: the reviewer world
(`make-reviewer-org.mjs --live`: org 3 /sharingu-review on the plan `reviewer`, the real sharingu project ~16,962 rows and
the sample; the three accounts each proven by role; the codes only in `~/.sharingu/reviewer-credentials.txt`, mode 600),
after a fresh import measure (`dev-local.sh reset` + `up`).

- [x] **11.0 · The submission kit.** `listing/SUBMISSION.md`: every field each store's form asks, filled; the icon
  `listing/icon/` (64 px 4,544 bytes, 128, 256, 512, from the site's favicon); the test cases point at the public tools page.
- [x] **11.1 · The carousel.** `tools/card-shots.mjs` gains a carousel mode: 3–5 PNGs ≥ 1000 px wide, each the card
  alone (the store crops to the app's response), on the local real data, each with its prompt, in a listing/carousel folder.
  DONE: `--carousel`: four scenes on the local sharingu project (a decision with its question, a mixed preview, a goal
  under M4, an equip), 1120 px wide, each scene's verdicts expected and its visible text checked (no address, key or
  eval word), 9/0; `listing/carousel/` with `listing/carousel/prompts.md`. Previews only (the door refuses the eval mark on a real
  project), nothing filed. Its seven look finds are sprint 12's 12.6; retaken after it.
- [x] **11.2 · The Control shot on the reviewer world** (the sprint-9 kit's known limit: it showed a local address).
  DONE: a local reviewer world (the same tool, `--local`), Control's Plan card and Measures in both worlds at 1440 × 544
  (Control prints the request's own origin, so the Admin card is framed out rather than faked; live reads
  agent.sharingu.xyz); `shots.mjs` gains `--height` and `--project all`.
- [x] **11.3 · OpenAI's domain verification.** A GET of /.well-known/openai-apps-challenge answers the token the operator
  stores (plain text, nothing else; 404 when none is stored), before any auth; the operator's tool sets and clears it.
  DONE: `src/wellknown.js`, one KV key in OAUTH_KV (no D1, no env, no migration), GET/HEAD before the address and any
  sign-in, 0 D1 statements; `operator.mjs set-openai-challenge / clear-openai-challenge` (a URL-safe single line ≤ 512),
  operator selftest 64/64 (red-then-green); s52 in the smoke; the contract 88 routes; parity's route regex now reads a
  dotted path (`/favicon.svg` had passed unchecked).
- [x] **11.4 · The Codex manifest.** The plugin's .codex-plugin/plugin.json GENERATED with the skills (its `interface`
  listing, the four URLs, the logo, the review block from `listing/test-cases.md`), the version lock covering it, and a
  submission ZIP that holds no credential.
  DONE: generated from the Claude manifest, `listing/SUBMISSION.md`'s description and URLs, `listing/codex-listing.json`
  and the test cases (5 + 3, every tool a real one); every length limit checked (shortDescription 29/30); the logo and
  composer icon in `plugin/assets/`; the version 0.1.4 → 0.1.6 (the review's fixes moved it once more); `--openai-zip`
  (22 files, no `.claude-plugin`, no credential); `claude plugin validate --strict` green; codex selftest 109/109
  after the review, five mutants red; a gate step.
- [x] **11.5 · The public tools page** on the site (www.sharingu.xyz/mcp-tools.html, from `listing/docs.html`; the
  website repo's own slice and deploy). DONE: the site's `756215e` — the page synced from the engine's file by the site's
  `sync:mcp-tools` (body byte-for-byte; an advisory drift check in its build), linked from the docs guide and every
  footer; verify:affected 226/226; deployed git-less (no secret in the upload), live 200 with 35 tools. FOUND: the site's
  analytics still named the old canonical after the domain move (no consent banner, nothing collected on
  www.sharingu.xyz since 2026-10-09) — fixed in the same commit. Re-sync after 11.3 ships (88 routes).
Owner's, after: the submissions (the kit), the demo video of the test cases in ChatGPT, the shots' approval.

**Sprint 11's end** (2026-10-10): the gate green, evals 42/42, sims 10/10, tabs-verify 40/40 (`engine/.runs/s11-end/`).
The independent review (one read-only pass, A–D): 0 SHIP-BLOCKER, 0 HIGH, 3 MED, 6 LOW. Fixed in ONE commit: the
generated review entries faithful to every numbered step (P4 had lost its decline-then-accept), the negatives prompts
to the AI with their why (N1 now "delete the Sample project": no tool deletes a project — the builder's own find: a
decision CAN be removed through preview then file, so the first idea was unsafe), the wrong code moved into P1's walk,
the description's eight tabs, the carousel prompts' honest wording, ~16,962 rows, homepage www, verify-live D4e on the
challenge route per domain. Open for the ship: the live KV write of the operator's verbs, proven with a throwaway
token right after it (MED 3).

**Sprint 11 SHIPPED** (2026-10-10, 11:33 IST; the owner's "approved proceed"): PR #279 merged (`c254d4f07`, MERGED
verified first). No migration (live 078). Two runs: the first refused itself at the preview smoke — the version record's
tag read came back unreadable once (a transient Cloudflare API read: read by hand twice right after, `c254d4f07`) —
nothing promoted; the second RESUMED from the run record (the gate, the live read and the upload reused, the docs gate
re-run) and ran clean: the preview, the cross-org suite 9,804 calls both ways — 0 rows across, 0 written, 0 5xx, 0
plan_limit, 516 + 516 under the victim's address each the one 404 (2,599 s; the throwaways were orgs 4 and 5, the
reviewer world holding 3) — the preview walk 13/13, the pinned canary, 10% → 100%, the production smoke, the triggers;
both Custom Domains stayed attached. Live is `f3c3312a-951c-45cf-a30c-629443656c48` (tag `c254d4f07`). After: THE
OPERATOR'S LIVE KV PATH proven (MED 3) — a throwaway token set, served exactly (200 text/plain) on both domains at once,
cleared, both 404 within ~45 s; `verify-live --live` 28/28 (D4e on both domains); the live walk 13/13; the dist repo at
0.1.6 (`34bb87c`: the Codex manifest and icons), a fresh clone's `--sync-check` 0 (25 files), a stranger's install 0.1.6;
the site's tools page re-synced to 88 routes (the site's `7ff539d`, verify 226/226, deployed). Undo: `sh tools/ship.sh
rollback d422eedc-0986-470b-863c-95425e3eae82` (code); the dist repo by reverting `34bb87c`. NEXT: sprint 12, then the
submissions.

## Sprint 10 · The sprint-9 ship's rows (branch `sprint-10`, opened 2026-10-10) — SHIPPED 2026-10-10

The spec: `PLATFORM.md` §3, the sprint-9 ship's table (the owner's "proceed", 2026-10-10). No migration, no new route.

- [x] **10.1 · Connect names the plugin's public repo.** Control · Connect's plugin row: `marketplace add
  ryukdev/sharingu-plugin`, its From clause the distribution repo; `plugin/README.md`'s in-session line the same and
  its self-host paragraph cut (hosted-only); the version moves with the content (0.1.4). Smoke: s6's Connect case.
  DONE: s6 pins the exact `<code>…add ryukdev/sharingu-plugin</code>` (the old `includes` passed for both names: the
  engine's is a prefix); the README's skills and license lines say only what the dist repo holds; s50 trued to the
  rulings (Proprietary, agent.sharingu.xyz — it had gone stale on main); INSTALL §4 the team's. Smoke 320/320.
- [x] **10.2 · The dist repo's sync.** `make-plugin-skills.mjs --sync <a clone of ryukdev/sharingu-plugin>` mirrors
  `plugin/`, the marketplace file and `LICENSE` into the clone (strays removed) and names what changed;
  `--sync-check <clone>` exits 1 when the clone differs. Pushing stays the owner's step at the ship. Proof: its selftest.
  DONE: refuses (exit 2, nothing written) a clone whose origin is not exactly the dist repo, or a drifted plugin;
  `plugin-sync-selftest.mjs` 48/48 after the review (symlinks and look-alike hosts refused), four mutants red (no
  removal, any origin, no --check guard, strays outside plugin/), a gate step; `--sync-check` on a fresh clone of the dist repo differs by exactly 10.1's two files.
- [x] **10.3 · ship-plan's own steps.** Sprint 9's one-time steps leave the print (the site is live, the repo stays
  private); this ship's own: the dist repo's sync and push, after the walk. Proof: ship-selftest.
  DONE: the plan prints budget → dry run → org names → grants → the code → the live walk → THE OWNER'S dist sync →
  THE OWNER'S M4; ship-selftest 130/0 (122/8 against the old plan and verify-live).
- [x] **10.4 · verify-live on every route.** The D4 checks run for each Custom Domain `wrangler.jsonc` lists (read
  from the config, never typed). Proof: ship-selftest or its own case; `--live` at the ship.
  DONE: `tools/route-domains.mjs` reads the routes (JSONC; none or unreadable exits 1, a FAIL of verify-live); D4a–d
  per domain, each labelled, no domain typed in the script (pinned); local verify-live 8/0.
- [x] **10.5 · A 5xx keeps its answer.** The cross-org suite writes each 5xx's answer (status, the first bytes, keys
  redacted) into its run dir and names the file on red. Proof: attack-xorg's own selftest.
  DONE: `<run dir>/fivexx.json` (who, what, status, the first 2 KB redacted BEFORE the cut by live-walk's redact and
  the held keys); the red verdict and ship.sh's failure lines name it; the `fivexx-kept` mutation (after the review: a
  session token and a held passphrase echoed) red-then-green, the full `--prove` 19/19 mutations red, the clean walk 0 5xx.
- [x] **10.6 · The mcp-orgs gate flake.** Its cause found under load and fixed; the gate prints a red case's own lines.
  DONE: the cause was the TEST: C1 compared the grant's stamp (8.3a: `<digest>.<the mint's ms>`) with one recomputed a
  moment later — red whenever the clock ticked 1 ms between (5 of 12 probes). C1 now checks the digest and that the
  moment lies inside the sign-in; under load 12/15 green before, 20/20 after. The product mints right (src/ untouched).
- [x] **10.7 · `ORG-SETUP.md` under hosted-only.** Rewritten as the operator's own (a second platform, the local
  platform, an org's setup); the custom-domain line says a triggers deploy detaches an unlisted domain; its dead
  `INSTALL.md` §6 order inlined. The self-host words cut wherever they stood (`README.md`, `ARCHITECTURE.md`, `MCP.md`
  and its dead §4 link, `engine/CLAUDE.md`, `engine/README.md`, a dead §3 row). check-docs 29/0, its selftest 44/44.
Done when: Connect on live offers an install a stranger can run; the dist repo equals this tree's plugin by
`--sync-check`; ship-plan prints only this ship's steps; the gate green twice in a row under load.

**Sprint 10's end** (2026-10-10): the gate green twice (`engine/.runs/s10-end/gate-1.log`, gate-2; the first started
at load 19 by a missed load check — the bunny sims' wave — the second at 7). The independent review (one read-only
pass, A authority · B correctness · C laws-and-docs · D ops): 0 SHIP-BLOCKER, 0 HIGH, 2 MED, 4 LOW, every one fixed
in ONE commit: M1 `--sync` followed a symlink in the clone out of it and took any host — now every clone path is
lstat'ed and a link or an outside path refused, the origin pinned to github.com; M2 a kept 5xx answer could hold a
session token (`t_` + 40 hex escaped the pattern) — every credential a walk sends or mints is held and redacted, the
mutation echoes a session and a passphrase; L1 ship.sh named a rerun's stale fivexx.json — cleared at launch; L2
mcp-orgs' C1 exact again (the stamp at its own moment); L3 route-domains reads a comma before a comment; L4 the
M4 step reaches the brand's address, README's connect lines `agent.sharingu.xyz`, the self-host comments and MCP.md's
old own-account ruling trued. Proofs: plugin-sync 48/48 (34/48 on the old tool), ship-selftest 133/0 (127/6 on the
old), --prove 19/19, mcp-orgs 6/6 runs, check-docs 29/0.

**Sprint 10 SHIPPED** (2026-10-10, 07:45 IST; the owner's MCQ that morning: "merge and ship now", and the dist-repo push
by the session after the ship): PR #278 merged (`b944acb99`, MERGED verified before anything else). No migration
(live stays 078); the stamp-less grants read (only old eval seats, refused since 7.5b). ONE run, clean: the gate, the
budget, live 078 and the org names, the upload `d422eedc-0986-470b-863c-95425e3eae82` (tag `b944acb99`), the
preview, the cross-org suite 9,736 calls both ways — 0 rows across, 0 written, 0 5xx, 0 plan_limit, 508 + 508 under
the victim's address each the one 404 (2,705 s) — the preview walk 13/13, the pinned canary, 10% → 100%, the
production smoke, the triggers. **Both Custom Domains stayed attached through the triggers deploy** (the sprint-9
find, closed by `wrangler.jsonc`'s routes); this machine's own resolver held a negative answer for agent.sharingu.xyz
~2 minutes after it (1.1.1.1 resolved it throughout; pinned to its IP it answered 200 from `d422eedc`). After:
`verify-live --live` **26/26** — D4a–d on BOTH domains for the first time (10.4) — the live walk 13/13, and live's
Control · Connect reads `claude plugin marketplace add ryukdev/sharingu-plugin` (10.1). THE DIST REPO: synced by
`--sync` into a fresh clone (2 files: the version 0.1.3 → 0.1.4 and the README), read, pushed as ryukdev's noreply
identity (`7a2808f`); a fresh clone `--sync-check` 0 (22 files); a stranger's install from GitHub in a throwaway Claude
config — `marketplace add ryukdev/sharingu-plugin`, `install sharingu@sharingu` → 0.1.4 — the real configs untouched.
Undo: `sh tools/ship.sh rollback f495a62c-d864-46b2-8773-03eaed44f30f` (code); the dist repo by reverting `7a2808f`.

## Sprint 9 · The plugin and the listing kit (branch `sprint-9`, opened 2026-10-09)

The spec: `PLATFORM.md` §4 sprint 9; the stages M1 + M2 in `MARKETPLACE.md`. The last build on the road.

- [x] **9.1 · The plugin** (M1, `f7d76214c`). `plugin/` at the repo root: the ruled slug, MIT with its text, the
  one address with no headers, 16 skills GENERATED from the presets (`make-plugin-skills.mjs --check` a gate
  step, red on a hand-edit or a stray), the repo-root marketplace file (install `sharingu@sharingu`), the README;
  `claude plugin validate --strict` green and proven to really read. THE STRANGER'S PROOF: a throwaway macOS user
  installed from the repo, a URL-swapped copy connected to a fresh LOCAL org, the fill skill followed to
  `T-20261009-001`, then user, home and worker deleted (the transcript in the trail, no secrets). check-docs
  exempts the generated copies as the presets; smoke 317/317. Awaiting launch-time: the GitHub install line is
  provable only once the repo is public.
- [x] **9.2 · Control · Connect offers the plugin** (`484910538`). The first row: both install commands with the
  page's own copy buttons, sign-in on connect, no key; the key-based row stays as the labeled alternative (a
  self-hosted install's path — Control's source carries no address, wire-selftest holds); INSTALL.md §3 the same.
  Red-then-green on the Connect smoke case; the row's From clause dies when the repo goes public.
- [x] **9.3 · The listing kit** (M2, `50b9361f7`). `listing/`: the docs page GENERATED from the contract
  (`make-listing-docs.mjs --check` a gate step; the worker path refuses on drift) — every tool and route, who may
  call it and how it fails, self-contained in the site's plain look; the reviewer-org tool
  (`make-reviewer-org.mjs`: the real sharingu project + a sample, admin/member/partner on durable passphrases
  printed once, a named `reviewer` plan; proven locally — 16,962 rows read back equal, an idempotent rerun, seven
  refusals writing nothing, a crash resumed with `--reissue`; `--live` behind the confirm idiom, run only at M4);
  eight test cases, each walked before written; eight sharingu-only shots in `listing/shots/` AWAITING the
  owner's M2 approval (which covers the reviewer org's content too); `s51` in the smoke, 320/320. FOUND BY THIS
  BUILD: the deployed site answers 404 on every path while its repo holds privacy, support AND terms — the
  owner's redeploy restores every listing URL (the ship MCQ carries it). Known shot limits for M4: Home is thin
  (the import files knowledge), the Control shot shows a local address — retaken at M4 on the reviewer org.
Done when: on a clean machine, a stranger installs the plugin from the repo, connects to a fresh org and files
through the fill skill; every listing URL answers; the reviewer org walks its test cases; the gate and the suites
green at sprint end.

**Sprint 9 SHIPPED** (2026-10-10, 00:49 IST, the owner's OK by MCQ 2026-10-09): PR #277 merged (`b6c1fe701`); then on
`main` the brand's move to sharingu.xyz (`8382d5ce2`), the PROPRIETARY ruling (`da5fc7083`) and the plugin's version
lock at 0.1.3 (`378d4327c`: main's lock had said 0.1.1 beside a 0.1.3 plugin). No migration (live stays at 078). Four
runs: (1) the gate's known mcp-orgs load flake, standalone green; (2) a dirty tag (the uncommitted lock) and ONE 5xx
in 9,736 preview calls — `create_project` as a throwaway owner answered 500, 0 findings — NOT promoted, live untouched;
not reproducible from logs (Workers Logs held no preview-version request), the path byte-identical to live since
sprint 8 (src changed only `controlpage.js`), the same call green for the other org and in sprints 7–8, and a
Cloudflare incident in SIN (our D1's colo) 14:41–16:03 UTC over the window; (3) stopped in its gate to commit the
lock; (4) clean: the gate, the budget, live 078 and the org names, the preview, the cross-org suite 9,736 calls both
ways — 0 rows across, 0 written, **0 5xx**, 0 plan_limit, 508 bearer + 508 session calls under the victim's address
each the one 404 (6,905 s: the network ran ~1.2 s a call) — the preview walk 13/13, the pinned canary, 10% → 100%, the
production smoke. Live is `f495a62c-d864-46b2-8773-03eaed44f30f` (tag `378d4327c`). After: `verify-live --live`
19/19, the live walk 13/13. **THE SHIP'S OWN FIND:** `wrangler triggers deploy` (step 8) syncs the worker's Custom
Domains to `wrangler.jsonc`, which listed only agent.ryuklabs.io — it DETACHED agent.sharingu.xyz (attached by API
on 2026-10-09, the brand's listed address): 530/1016 for ~5 minutes, re-attached by the same API call, then the
address answered from `f495a62c`; `wrangler.jsonc` now lists both, and `verify-live`'s domain checks covering only
agent.ryuklabs.io is a §3 row. Undo: `sh tools/ship.sh rollback c88ac5ca-a8bf-44f9-bc6f-c7ee487932d2` (code only).
THE ROAD'S BUILDS ARE DONE (sprints 6–9); open: the post-ship rows in `PLATFORM.md` §3, then M4.

**Sprint 8 SHIPPED** (2026-10-09, the owner's OK by MCQ): PR #276 merged (`f0a61a30d`; a GitHub race closed the
PR mid-merge once — reopened and merged, the branch recreated from the pushed commit, nothing lost); the owner's
`choose_org` ruling landed first on all three doors (`2c13406ab`). Migrations 075–078 applied one at a time with a
bookmark each after the dry run; the operator's one raise put the suites' live org on the ship's `suite` row (run
record kept; free/team untouched — live's ledger read true at once: org 1 team 886 items this month). The ship's
FIRST preview run refused itself on one finding that was the platform's own pulse: the 03:00 UTC cron's backup
record landed in a throwaway org mid-suite and read as "the victim's rows changed" (proven on live: orgs 1 and 2
stamped 03:02; the suite's window crossed 03:00, which no earlier ship's had). Nothing promoted, live untouched —
the guard worked twice over. The snapshot now excludes that exact three-term shape, which no door can wear
(`f757e5c08`, probed both ways). The rerun: the cross-org suite 9,736 calls both directions, 0 rows across, 0
written, 0 5xx, **0 plan_limit** (the ship fix proven on the real preview), the one 404 under the victim's
address; the preview walk 13/13; the canary; 10% → 100%; the production smoke. Live is
`c88ac5ca-a8bf-44f9-bc6f-c7ee487932d2` (tag `f757e5c08`), D1 at migrate-078 — THE LIMITS ARE LIVE. After:
`verify-live --live` 19/19, the live walk 13/13. Undo: `sh tools/ship.sh rollback c853a794…` (code; during any
canary mix the old share enforces no limit, by design), the 075 bookmark (data).

**Sprint 8's end** (2026-10-09): the four suites once, all green — the gate, evals 42/42, sims 10/10,
tabs-verify 40/40, verify-live 7/7 (`engine/.runs/s8-end/`). The independent review: four read-only passes
(A authority · B correctness · C laws-and-docs · D ops), 0 SHIP-BLOCKER, 2 HIGH, 16 MED; the union with owners
`engine/.runs/review-s8/CONSOLIDATED.md`. The fixes landed as ONE commit (`4745127e3`): the items check precedes
any body store (B1 — the R2 delete path REJECTED by ruling: bodies are never deleted; the rare mid-flight orphan
ledgered), a Partner's warnings and refusals carry no counts, wrap_up's lists bounded, the dead plan exports
removed, Control's card carries no sentence, the gate runs limits-selftest (C1), the docs trued (MCP.md's 138
codes and the plan's answers; §3 ±9 rows; the standing one-item rule; plans.js on the map; the canary note).
THE FIX HUNT'S OWN FIND: the relocate harness's symlinked layout let the handoff selftest's mutant write THROUGH
the link into the real `src/handoff.js` (the gate's relocate step did it once — caught by the gate itself going
red): the copy now dereferences and a realpath guard refuses the write; relocate 5/5, handoff 92/92 on the real
file after the run. The gate GREEN on the committed tree (`gate-5.log`; one transient mcp-orgs red in `gate-4`,
46/46 standalone and on the rerun). Not rerun: evals/sims/tabs (the fixes touched no sign-in or tab surface; the
owning selftests and the gate's attack step cover them). The ship next, on the owner's OK: migrations 075–078
before the code, the operator's suites-org raise as ship-plan prints, no import hook.

**Sprint 7 SHIPPED** (2026-10-08, the owner's OK by MCQ): PR #275 merged (`db4831a8d`); migrations 070–074 applied
one at a time with a bookmark each after the dry run on a copy of live and 070's no-row preflight; the org-names
and stamp-less-grant preflights green; `ship.sh` — the gate, the upload, the preview smoke, the cross-org suite on
the preview (9,736 calls both directions, 0 rows of the other org read, 0 written, 0 5xx; 508 bearer and 508
browser-session probes under the victim's address, each the one 404; the public file by exact id the one ruled
exception), the preview walk 13/13, the pinned canary, 10% → 100%, the production smoke — live is
`c853a794-737c-4d61-972a-85cf5f77605d` (tag `db4831a8d`), D1 at 074. Then the done-when on live: day0-verify 25/25
on a throwaway (the operator's code → sign-up → its org → a filing through `/mcp`), the wall both ways one 404
each, the org exported then deleted and its account removed, nothing left; `verify-live --live` 19/19; the live
walk 13/13 on agent.ryuklabs.io. Undo stands: rollback to `6e06c303…` (code), the 070 bookmark (data).

## Sprint 8 · Limits, usage and the operator (branch `sprint-8`, opened 2026-10-08)

The spec and the ruled numbers: `PLATFORM.md` §4 sprint 8. Vertical slices, a smoke per slice, as always:

- [x] **8.1 · Plans and usage** (`35f9abe3c`). `migrate-075`: `plan_limits` seeded with the ruled numbers (1 GB read
  as 2^30 bytes, R2's convention — the owner may change any number by the operator), `org.plan` default `free`,
  org 1 `team`, three covering indexes proven to move no existing statement's plan. `src/plans.js`: `planOf` and
  `usageOf`, every number ONE aggregate on its own index (`INDEXED BY` pinned). Scope held for later slices, written
  in the reader itself: calls and burst not counted yet (8.2's counter), a knowledge write counts one item (a
  per-item tally is 8.2's), screen pictures join storage at 8.4, a restored org's plan is 8.5's; eval-marked rows
  COUNT (a mark is no way around a limit); a fresh local org 1 is free until 8.2 plans the seeds. Proofs:
  plans-selftest 23/23 (mutants red; the numbers pinned against PLATFORM's table), migrate-dryrun 11/11, boot-schema
  ✓, scoped-data ✓, smoke 308/308 (`s46`: a fresh org reads free with the ruled numbers; its usage moves by exactly
  what lands; the other orgs unchanged).
- [x] **8.2 · Enforcement** (`0421b4e63`). `migrate-076`: `org_usage`, ONE counters row per org (day, minute,
  month windows, each reset in the upsert itself; one row per plan rejected: two row-writes per call and 1,440
  minute rows a day with nothing to prune them). Every write checks the plan (`src/plans.js checkPlan`, one read):
  80% lands with the warning on the answer (one PLAN_NOTE slot per request; a JSON answer's `planWarning` and a
  header), 100% is the ONE code `plan_limit` naming only the caller's own numbers; the choke points — filings (the
  month tally atomic with the row's batch), storage (sprint 6's 8 GB `storage_guard` RETIRED into the plan's
  limit), projects (reactivation counts, archiving frees), add-person (a PENDING seat is held: consent parks no
  seats). Every MCP tools/call and signed-in REST write is one counted call (a refused write is never counted; the
  session doors never count, so a throttled org always signs out); past the day or the minute a WRITE gets 429
  with Retry-After. STANDING from 8.1, kept by 8.2's build: a knowledge write counts ONE item however many it carries (the per-item count is not in the schema; revisiting needs a stamped count, a ledger row's own). Rulings decided by the plan's laws at integration (2026-10-08): every call counts, reads
  included ("calls" is the ruled word) but refusals hold WRITES only ("reads are never refused" is the owner's
  written law — the read-flood residual is an S9-revisit ledger row); a write-nothing POST is a read
  (`/backup-dump` whole-route for the beta, plus the 12 any-verb page routes); the harness's orgs ride a
  LOCAL-ONLY `local` plan (seeded by `lib-r-local.sh`, its raises fire only where a `local` row exists — live
  never has one; `free`/`team` untouched, s46/s47 keep testing `free`); the rows-written test pins ignore
  `org_usage`; the call gate answers before the org check (it names only the caller's own numbers). Proofs:
  limits-selftest 41/41 (mutants red, mutated src copies included), plans 23/23, the touched suites green
  (mcp-orgs 37/37, annotations 406/0, regrade 56/0, d1-hot 398/0, project-rule 518/0, +15), attack `--prove` 0
  findings · 18/18, smoke 312/312 (`s47`: the warning, the one refusal, reads still answering, the operator-raised
  plan unblocking), the gate GREEN on the committed tree.
- [x] **8.3 · The cost cuts and the review's auth rows** (two halves). **8.3a** (`686760f69`): the lockout keyed
  by account AND client (migrate-077: a VOUCHED client — the account's own passphrase signed in from it within 30
  days — is judged by its own 8-in-15; every other vantage by the account's everywhere-count, the old law; clients
  are hashed /64-grouped addresses, a seat's secret vouches nothing, a valid sign-up code passes the lock;
  rejected: per-address buckets — a botnet gets 8×N guesses — and a progressive delay, which keeps the holder out);
  and the per-seat grants epoch (`people.reissued_at` set in the reissue's own UPDATE; the account grant's stamp
  carries its mint moment, a reissued seat refuses older grants with the re-connect 401; no extra read, sessions
  and other seats untouched; pre-8.3a stamps read as made-at-0: the safe direction). Proofs: accounts 93/93,
  signup 41/41, mcp-orgs 46/46, attack 18/18 `--prove`, smoke 312/312. The third review row (the squat's
  `choose_org`) is the OWNER'S, at this sprint's ship MCQ. **8.3b** (`17f29d688`): six cost rows cut with
  fail-then-pass proofs — the goal tree's rules INSIDE the write's batch (the one semantic change: a concurrent
  goal write rolls back and answers the plan's own refusal), the blockers read without options (−70 rows a page),
  `file`-of-50 114→15 statements, the 50-item preview cut, the cron's prune on migrate-078's unfiled-only index,
  the Map inspector on `k_question_refs` (saruspay 421→103 rows, bunny 623→54); page-budget on the same data 0 up
  / 55 down (87,079→84,867; worst 980→910); `file`'s own rows +103 kept deliberately (the folded list bills per
  item; the real constraint is the free tier's 50 subrequests a call); the import +2,862 rows written (the refs
  and the index). Four rows skipped with written reasons, retagged in §3 (the ship prune's contract change, the
  growing ledger reads, the render purge's retention rule — the owner's, the import's rebuild); two defects found
  and ledgered (the ~1,950-char `what` audit insert, the shims' NULL parameter leniency). Proofs: knowledge 294/0
  with 4 real interleaves, prune 26/26, d1-hot 400/0, smoke 312/312.
- [x] **8.4 · Shown** (`d67977fed`). ONE storage definition — the org's files plus every screen-picture body it
  holds once (distinct (project, hash) takes and the stylesheets no take holds; archived projects count, their
  bodies stay stored; the tables the backup and the per-org restore name) — read by 8.2's check, `usageOf` and the
  new `planShownOf` alike. Control: the admin's Plan card in the Measures card's idiom (each limit's usage with its
  ok/warn/limit state, amber past 80%, red at the limit, the operator's one line; the bars fold under 640px).
  `whoami` answers `plan` on both doors; a Partner reads the limits alone, never the org's counts (the standing
  rule). No migration (a covering index would save nothing: D1 bills the rows either way). Proofs: plans 40/40
  (pins red under mutants), s48 0/3 on the old code → 3/3, page-budget 18 loads up — Control and the two whoami
  doors only, worst 987 under the 1,500 line — 0 down elsewhere, smoke 315/315; shots both worlds, both widths.
  Known and ledgered: the pictures' count reads ~a row per take and takes are never purged — the running-total
  trigger fix is §3's row.
- [x] **8.5 · The operator and the ship's own plans** (`c84dd5094`). `operator.mjs` grows: `list-orgs` (each
  org's plan and usage by the check's own definitions), `set-plan`, `raise` (a NAMED plan row — `free`'s and
  `team`'s ruled numbers refused in code AND in the SQL: raising by hand IS the beta's paid plan),
  `suspend`/`unsuspend` (ONE reversible check where the request's org resolves — `settings.suspended`, one plain
  403 `org_suspended` to the org's own people on every door, nothing deleted or counted, back within the org
  row's one-minute cache; org 1 and the suites' org behind `--really`; a JSON sign-in still mints its token,
  which reaches only the 403 — the one-check law; public links by exact id and the cron keep working, said
  here). The ship fix CLOSED: the preview attack's throwaways ride their own `suite` plan row (written first,
  removed with them), the walk checks its org's plan up front, `ship-plan` prints the operator's one raise of the
  suites' live org before the suites, and the ship's preview attack now FAILS on any `plan_limit` — the local
  ship-shaped run: 0 over 9,736 calls, versus 3,788 refusals without the fix. 8.4's leftovers closed: a
  render/style body checks storage before it stores (knowledge 298/0 red-then-green); `GET /storage` tells the
  plan's truth (s35's pins moved). Proofs: operator 51/51 (the 403 proven on the real router), ship-selftest
  122/0, copy-check 0, contract 138 errors (+`org_suspended`) with parity, smoke 316/316.

Done when: a free org at its limits gets the warning, then the one refusal, and its reads still answer; raising it
by the operator unblocks it; the burst holds one busy org back while another org's reads answer; the gate and the
suites green at sprint end.

