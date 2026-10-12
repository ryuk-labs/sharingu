# sharingu — the architecture

The owner's model is in `README.md`. This file says HOW it is built TODAY: ONE worker and ONE D1 database serve many
orgs, ryuklabs org 1, each org at its own address; what happens in an org stays in the org (§10, with the accounts, the
sign-up and the address). Where each screen reads and renders is `INVENTORY.md`; the slices are `SPRINTS.md`.

## 1. The shape, in one picture

```
        agents / people (their Claude)                       the browser (8 tabs)
                  │  the one /mcp (OAuth or key)                      │  session cookie, /<org>/…
                  ▼                                                   ▼
   ┌──────────── the door: ONE worker, every org (ryuklabs-agent-r) ────────────────┐
   │  auth (accounts · seats · tokens · keys · OAuth) → the org → project → handler │
   │                                                                                │
   │  WRITE                                    READ                                 │
   │  preview → file    ─┐                ┌─ read tools + REST twins + pages         │
   │  (the write doors) ─┤─► D1 ◄─────────┤   (all live, same read per screen)      │
   │  human verbs       ─┘   │            └─ versions (snapshots in D1)              │
   │                         └─► cron, per org: reports, backup, prune (no webhooks)│
   └────────────────────────────────────────────────────────────────────────────────┘
        R2 keeps BLOBS (o<org>/…): saved files, wrap-up reports, backups, render bodies
```

- **D1 is the truth** for every project's knowledge AND its ledger, every org's in the one database.
- **R2 holds no served truth.** The worker reads nothing under R2 `serve/`; it reads R2 only for blobs (a saved file, a
  wrap-up report, a render body), each under its org's prefix (§10).
- **KV** keeps only OAuth.

## 2. The data model (D1)

Every knowledge table carries `project TEXT NOT NULL REFERENCES projects(key)` and
`created_by / created_at / updated_by / updated_at`. Primary keys are `(project, id)` unless noted. Ids are the
caller's (validated), so an import is idempotent: an upsert by id. The validation rules live in ONE registry,
`src/knowledge/schema.js` (`KINDS`), used by the write door, `formats`, the checklist, the preview and the importer.

| Table | Holds | Key fields |
|---|---|---|
| `k_aim` | the project's aim + measure (one row per project) | `aim` (required), `measure` JSON `{name,value,period,prior,priorPeriod,source}` or a ruled absence, `product_model` (null, or none by design), `source`, `as_of`, `confidence` |
| `k_goals` | the goal tree | `id`, `parent` (one root; no cycles), `title`, `dimensions` ⊆ lane keys, `weight`, `target`, `outcome_metric`, `owner`, `due`, `note`, `status`, `sort`, `source`, `as_of`, `confidence`, `budget` (optional: allocated, spent, currency, source; rolled up the tree) |
| `k_questions` | questions + their ruling | `qid`, `question`, `why`, `area`, `severity`, `status` ∈ open·provisional·decided·superseded·moot, `choice`, `label`, `rationale`, `decided_by`, `decided_at`, `affects`, `blocks`, `who_owes`, `waiting_on`, `impl_status`, `superseded_by`, `source`. An open question has ≥2 options and no choice. |
| `k_options` | a question's options | PK `(project, qid, idx)`, `what`, `tradeoff` |
| `k_checks` | checks (given/when/then) | `id`, `kind`, `method`, `severity`, `title`, `given`, `when_`, `then_`, `source_type`, `source_id`, `refs` JSON (the node/goal/question ids it grades), `rulings`, `status` |
| `check_results` | grades | one row per grade: `check_id`, `status`, `graded_by`, `graded_at`, the filing; the latest wins, the history stays |
| `k_cards` | any other knowledge card | PK `(project, kind, id)`: `name`, `status`, `body_md`, `role_visibility`, `as_of`, `confidence`, `source`, `refs` (optional: the cards of the same project it relies on) |
| `k_card_kinds` | the kinds a project uses | `key`, `label`, `id_pattern`, `role_visibility`, `tab` (the tab it lists on), `review_after_days` |
| `k_nodes` | the MODEL: surface · lane · screen · door · table · entity · flow · gap · dep · evidence · service · architecture | `type`, `id`, `name`, `status` (live·planned·retired / open·closed), `data` JSON (type-specific) | A node's `data` may carry `ownedBy` (M3): the key of another active project of the org that owns the part, checked by name at the write door, never read across the fence.
| `k_edges` | model relations | `from_id`, `to_id`, `kind` (nav · reads · writes · relation · depends · blocks · flow-step), `label`, `data`; PK `(project, from_id, to_id, kind)` |
| `k_gtm` | the GTM template (one row per project) | `template` JSON (`activityKinds` non-empty), `as_of`, `confidence` |
| `k_docs` | docs, role briefs (`capsules/<role>.md`), start-here, the GTM strategy (`gtm/…`) | `path`, `title`, `body_md`, `role_visibility`, `as_of`, `confidence`, `source` |
| `k_versions` · `k_snapshots` | the version spine and a version's content | `n`, `title`, `cause` (published · restored), `counts` · PK `(project, n, table_name, chunk)`, `payload` |
| `k_renders` · `k_styles` | a screen's frames and shared stylesheets (§11) | the index only; bodies in R2 |

Kept by the write door and triggers, never written by a caller: `k_check_refs` and `k_check_ungraded` (which checks name
a ref, which are ungraded), `k_node_lights` and `k_node_links` (a node's light and its edges), `k_screen_renders`,
`k_fill` (the checklist's counts), `k_node_stale` and `k_check_stale` (stale proof, §12), and `k_find` (a contentless
FTS5 index for `search`).

Platform-level (no org): `accounts` (one per email: the account passphrase's hash; `migrate-070`) and `signup_codes`
(the operator's one-time codes, their hashes only; `migrate-071`). Org-level: `people` (a person's SEAT in one org,
joined to its account by `account_id`), `project_seats`, `projects`, `tokens` (a session proven by the account's
passphrase carries `account_id`, `migrate-073`), `login_attempts`. The **ledger**: `transmission` (a
contribution: its shape, next action, pick-up and `happened_at` columns; `transmission_refs` and the tallies
`transmission_goals`, `transmission_kinds`, `transmission_open`, each with an org-level bucket per org), `events`,
`loops` (no `project` column), `artifacts`, `approval_audit`, `check_results`, `previews` (one row per preview). The
nine org-wide tables (`people`, `tokens`, `invites`, `events`, `artifacts`, `loops`, `approval_audit`, `login_attempts`,
`transmission`) carry an `org` column (`migrate-067`), and a trigger refuses a new row without one (`migrate-068`);
`projects.org` and `projects.slug` are generated from the key (§10). The `org` table holds one row per org: `name`,
`slug` (its address, unique, never a name the platform uses; `migrate-072`), `brand`, `home`, `settings` (`migrate-063`:
domain, test seats, the repo a wrap-up's issue opens in, trace floor) and `created_by_account` (the account that
created it through the door), read by `src/tenant.js` for the reader's org.
Read by nothing: `invites` (the sign-up codes are `signup_codes`; it goes in a contract migration, `PLATFORM.md` §3).

**Budget.** Reads are bounded by indexes on `(project, …)`, one statement per screen region (`src/hotsql.js`, pinned by
`tools/d1-hot-selftest.mjs`); `tools/page-budget.mjs` flags a load over 1,500 rows read (in the shared database it keeps
one org from blocking the rest; the budget stays at the free tier's scale: 5M rows read and 100k written a day).

## 3. The MCP door — writes

**Every write is previewed, then filed.** `preview` (and `POST /preview`) takes items in four forms — a knowledge op, a
contribution, a grade, an answer — runs each through the same checks its write door runs, and writes only its own row in
`previews`. `file` (and `POST /file`) takes the preview's id and the same items and files what is ready, through the
write doors, in order:

| Write door | Who | Does |
|---|---|---|
| knowledge items `{kind, op, data}` | any seated member; role-limited kinds by role | validates each op with the registry, applies all in ONE `DB.batch` (all or nothing), files ONE ledger row (lane leader, kind `knowledge`). Kinds: aim · goal · question · check · card · card_kind · node · edge · gtm · doc · render · style. At most 200 ops a call; 256 KB of bodies. |
| contributions `{contribution}` | seated | the ledger; the shape checked; `goalRef` checked against `k_goals`; ids a contribution names checked against the project's own Map (`src/maprefs.js`) |
| grades `{grade}` (and `submit_grade`) | seated | `checkId` must exist in `k_checks`; proof is a stated result with its numbers, a command with its result, or a link |
| answers `{answer}` (and `respond`) | seated | the owner's non-provisional answer rules the question at once; a member's waits for the owner |

Verbs beside them: `rule_question` and `decide_contribution` (owner), `publish_version` / `restore_version` (owner),
`create_project` (admin), `pick_up`, `publish` and `equip` (refused to a Partner by role class), `ask`, `save_file`,
`open_items`, `wrap_up`; REST only, `POST /rank` and `POST /round`. Every tool and REST row is declared in `src/index.js`
(`MCP_TOOLS`, `CAPABILITIES`) and `contracts/door.declared.json`; `contracts/door.json` is generated.

**Sign-in, one rule:** a browser navigation without a session goes to sign-in; anything else is answered 401. An id
door checks the caller before the lookup. The sign-in sets the request's org: the org of the seat the credential (a
key, a session, an OAuth grant) found — under an org's address, a seat of that org only; for an account's grant, its
seat in the org a call names (`orgSlug`) or its current one, never an org it holds no seat in. One request, one org
(`src/data.js`).

## 4. Reads — one knowledge store, the project scope

- **`src/knowledge/`** — the readers every page uses: `store.js` (the generic readers behind `read {kind}`), and one
  module per shape: `goals.js`, `decisions.js`, `canvas.js`, `checks.js`, `docs.js`, `cards.js`, `mapmodel.js`,
  `versions.js`, `screens.js`, `stale.js` (stale by change), `fresh.js` (due by age). Per-request memo (`reqmemo.js`),
  one statement per shape.
- **Extract** — `src/extract.js`: `search`, `read`, `changes`, `brief`, each one function behind its tool, its REST twin
  and its page (`src/extractpage.js`; a card's page `src/cardpage.js`). A card kind lists on the tab it names
  (`src/tablists.js`).
- **The project scope** lives in `src/project.js`: a named project needs a seat (the owner: any active project of the
  org), else the caller's active project (a live stamp or the one seat), else the first project they may read in key
  order (§10).
  A write's stamp is `doorProject`'s (`src/core.js`); `INVENTORY.md` §Scope lists the rest.
- **D1 only (owner, 2026-09-30):** every tab and its read tools read D1, with no R2 fallback.

## 5. The three loops — how each closes

1. **What is missing → file → it shows.** `missing` reads the checklist (`src/checklist.js` over `k_fill`): the aim, the
   goal tree, options and rulings owed, gaps, a start-here doc, the model, checks and grades, the GTM template. Each open
   item names the `preview` call that fills it. Filing it closes the item on the next read — no publish.
2. **Decisions → respond → it shows.** Decisions reads `k_questions` + `k_options` + the ledger overlay. The owner's
   non-provisional answer rules it at once; a member's answer shows as "answered, with the owner" and the owner rules it.
   Agents ask the owner a real, optioned question by filing a question.
3. **Checks → grade → it shows.** `k_checks` is the register; `check_results` holds grades. Goals shows each goal's
   checks (via `refs`); the Map lights a node from its checks' latest grades (green all pass · red a fail · amber partly
   graded · grey none), and marks it stale when the node changed after the grade.

## 6. The frontend (8 tabs — live data)

| Tab | Reads |
|---|---|
| Home | the aim and its measure · goals moved · what needs you · follow-ups due · what changed · the checklist's meter |
| Build | contributions (knowledge writes too) · tempo · the finish line from `k_goals` |
| GTM | the template's lanes · the Strategy docs under `gtm/` · the card kinds that name GTM · follow-ups due |
| Goals | the goal tree + the ledger roll-up by the month the work happened + checks per goal |
| Decisions | `k_questions`/`k_options` + overlay; the question page; round |
| Map | one canvas with layers from `k_nodes`/`k_edges`, Arch, the Screens view (§11), lights and stale marks; Versions |
| Broadcast | the shelf, the built-in starter pack, the live picture |
| Control | Members · Projects · Connect · Admin |

Every tab carries its checklist chip and what changed since the project's version. Every empty state names the
`preview` → `file` call that fills it. The look: `LOOK.md`.

## 7. Hooks — none outbound (owner, 2026-09-30)

The MCP is the intake; nothing outside needs sharingu to call it back, so there are NO outbound webhooks. What stays:
the cron, once per org (the report backfill, the backup dump, the prune of expired previews), and the opt-in GitHub
issue on a wrap-up.

## 8. The importer (use-and-throw)

- **`engine/tools/import-brain.mjs <source> --project <key> [--layout kit|bank|pack|board|code] [--renders <file|dir>]
  [--overlay <ops.json> …] [--url <worker>] [--dry-run]`** reads one source (`engine/tools/import/read*.mjs`: a kit
  brain, a markdown knowledge bank, a served pack, a board directory, or this repo's code), maps each item to a knowledge
  op validated with the registry, folds in the overlays, and FILES them through the door in batches with a `clientRef`
  per batch, so a re-run is a no-op. It then reads every kind back: stored must equal built. It counts the rows each
  call writes and refuses a live run the account's plan cannot take.
- `engine/tools/dev-local.sh up` imports every project into a local org; `engine/tools/import-live.sh` runs the same
  import against a version preview during a ship (`SHIP_PREVIEW_HOOK`), smallest project first, with an optional prune.
- The sources and their order are in `engine/tools/dev-local.sh`: ryuklabs (the ops brain), sharingu (this repo's code,
  its wireframes from the old brain, its overlays), siru, saruspay, bunny, and demo (no source: the website's pitch as
  overlays).
- sharingu's history (its contributions and screen pictures) is filed after the import by
  `engine/tools/ship/after-import.mjs`, through `preview` → `file`.
- An imported source is frozen (a read-only archive). The kit reader is `engine/tools/import/load.mjs`.

## 9. sharingu plans itself in sharingu

The `sharingu` project holds the product's model and checks generated from this repo's code, the owner's rulings, the
goals and the docs from this plan (overlays under `engine/tools/import/overlays/sharingu/`), and its history as
contributions. `docs/plan/` stays the working plan across sessions.

## 10. The project and the org

The project a request reads is found once at the door (`src/project.js` `resolveProject`) and carried on the request;
every reader asks `projectOf(env)`. The org's facts are its D1 row (`org`, read by `src/tenant.js` for the reader's
org): the MCP greeting and Map · Arch name the org from it. The worker reads nothing from R2 `serve/`.

**The org wall.** One database holds every org; what happens in an org stays in it:

- **The key carries the org.** A project's key is `o<org>--<slug>` for every org but org 1, whose keys are its bare
  slugs (the live keys unchanged); the slug is unique inside its org and never holds `--`, and the org's number (not its
  name) rides the key, so renaming an org never rekeys (`src/project.js` `orgOfKey`; `projects.org` and `projects.slug`
  generated from the key). Everything kept apart by project is kept apart by org; a bare slug a caller types resolves
  inside the reader's org only.
- **One scoped data layer.** Every statement runs on `db(env)` (`src/data.js`), which writes in the reader's org from
  the sign-in; a statement that names the org with no one signed in is refused, never run as org 1. The caches and
  request memos are keyed by org. The gate's `tools/check-scoped-data.py` fails a statement or an R2 key outside the
  layers.
- **An owner owns one org.** The admin is the admin of its own org; storage, the log, the backup dump, the measures and
  clean-eval answer the reader's org alone. Work across orgs (allowing an email, one org's undo) runs only with the
  deployment's credentials, from the operator's machine, never through a seat.
- **An org is born one way:** `POST /orgs` (`src/orgs.js`, the page `/orgs/new`): an account, proven by its own
  passphrase (never a seat's key), makes the org, its owner seat and its first project in one batch; one org per
  account (the beta's free tier). The platform is hosted-only (2026-10-09); a second platform the operator boots is
  this same code on another worker, booted empty (`engine/ORG-SETUP.md`).
- **Storage carries the org.** Every R2 object lies at `o<org>/<key>` (`src/storage.js`, the one place keys are
  spelled); a file read by its exact id is looked up under its row's org. A bare key is no org's (org 1's were moved by
  `tools/ship/r2-org-keys.mjs` at the sprint-6 ship).
- **The cron runs per org** (`src/cron.js`): each step once for each org, as the deployment for that org, at most 20
  orgs a run; the nightly backup lands under the org's own prefix.
- **One org's undo.** Time Travel restores the WHOLE database, so it is a platform incident tool. One org's undo is
  `engine/tools/org-undo.mjs` on the deployment's credentials: export the org, restore it under a new org id with every
  remap recorded, verify it table by table, delete one org (never org 1, never without a fresh matching export).
- **Proven in the gate.** `tools/attack-xorg.mjs` holds two orgs, their data filed through the door, and, as each org's
  owner and member against the other, calls every tool, resource and route: no answer carries the other org's rows,
  none is a 5xx, the other org's tables stay unchanged. The one ruled exception: a public file read by its exact id
  answers from any org (ADR-055, kept while sign-up is allowlisted; `PLATFORM.md` §2.7). Contribution ids stay
  numbered across the database.
- **Accounts and seats, two secrets.** One account per email (`src/accounts.js`), a seat per org it belongs to. The
  account's passphrase is its holder's alone (set by the sign-up, or proven on `/profile`) and signs in to every seat
  of the account; a seat's own key (its admin hands it over and rotates it) opens that seat alone, and never creates
  an org. The lockout counts per account; an attempt counts in the org of the seat the sign-in chose.
- **Sign-up by allowlist** (no email service): only an email the operator allowed signs up, with the one-time code the
  operator hands over by hand (`tools/operator.mjs`, the deployment's credentials; single-use, expiring, revocable;
  no route mints one). The sign-up makes the account, or gives a passphrase-less account its passphrase.
- **The address** (`src/orgpath.js`): every page of an org at `/<slug>/…`, the platform's own routes at the root
  (sign-in, sign-up, creating an org, the picker, `/mcp`, OAuth, health). Under an address only that org's people sign
  in (a bearer of its org, a browser session as its seat there); an unknown org, a platform path under an org and a
  credential with no seat there answer one 404. A cookie at the root signs no one in (a page navigation goes to the
  session's org). One URL helper builds every link (`tools/check-org-paths.py`). A root page before sign-in wears
  sharingu's brand, an org's address its own; an account in several orgs picks one after sign-in, and the rail switches.
- **One `/mcp`, two grant kinds** (`src/oauthgrants.js`): an OAuth grant signed in with the account's passphrase reaches
  the account's own seats, one org a call (`orgSlug`, else its current org); one signed in with a seat's key reaches
  that seat forever. A bearer key is its seat. Any other org is `org_unreachable` before a call runs, the same answer
  whether the org exists or not; `whoami` lists the orgs a connection reaches.

## 11. Screens and renders — the standard (owner, 2026-10-01)

The owner's rule: **sharingu is a tool, like Claude Code — the core never changes per project.** A project's screens
reach the app the way everything else does: an agent files them through the MCP in ONE standard format, appends and
updates piece by piece, and the Screens view shows them. Importers and per-source mappers are TOOLS outside the core.

- **A screen** is a `node` of type `screen`: `data.surface` (the app or apps it belongs to), `data.lane` and
  `data.step` (where it sits in its app's flow; optional — the layout falls back to the nav edges), `data.states`,
  `data.wireframe` (optional).
- **A render** is the kind `render`: `{ screen, state?, variant?, format: "html" | "image" | "wireframe", body |
  artifact, style?, width?, height? }`, keyed by `(project, screen, state, variant)`. `html` is a fragment (no script
  runs: stored stripped and shown sandboxed); `image` is a png, jpeg or webp sent as base64 in `body`, or a banked
  artifact the writer filed themselves or a public one (an SVG is refused: it can carry a working link); `wireframe` is
  the grammar as JSON. An upsert replaces that one render; an unchanged body (same hash) writes nothing. Every take is kept (`k_screen_takes`, migrate-065: one row per filing of a frame, the body by its hash): a screen's inspector shows its previous takes, and a previous take is restored through the door as the person (a render upsert naming the hash with no body; `POST /render/restore` is the page's press). A new picture
  never makes a grade stale (owner, 2026-10-02).
- **A style** is the kind `style`: `{ id, css }` — a stylesheet many html renders share.
- **Storage:** the BODY goes to R2, content-addressed (`o<org>/renders/<project>/<sha256>`), immutable and cacheable;
  D1 keeps only the index (`k_renders`). The Screens view reads the index in one statement and loads bodies lazily.
- **The wireframe grammar** (`src/wireframe.js`, drawn by the engine as SVG): a list of blocks — `header · nav · tabbar ·
  title · text · input · button · list · card · image · divider · spacer` — each with an optional `label`,
  `lines`/`items` count and `emphasis`.
- **Limits:** an html body ≤ 200 KB, a wireframe ≤ 50 KB, a picture ≤ 1 MB, a style ≤ 200 KB; a call carries ≤ 256 KB
  of bodies and names ≤ 1 MB of banked pictures; the door says which op was over.

## 12. Filling a project, and impact (owner, 2026-10-01)

The loop the product closes: **fill → change → impact → re-prove.**

- **Who does what.** The person's own AI client reads the input where it lives and extracts on the person's machine and
  plan. sharingu runs NO model: it validates against the standard, stores, shows, and answers what is still missing.
  The credential picks the person (role and seats) and, with them, the org (an account's grant: the org a call names);
  `project` picks the project.
- **The checklist is the standard.** One list in the core (`src/checklist.js`), the same for every project, counted only
  in the areas a project has. Every item is a bounded aggregate over `k_fill` and carries the call that fills it.
  `missing` is its reader; the meter is its count. A project never gets its own list.
- **The fill kit.** `create_project` (admin only), `formats` (generated from the registry), and the built-in "Fill a
  project" skill. Everything works through tools alone. Bulk input goes through the same door in batches from a script
  the agent writes; the importers under `engine/tools/import/` are one such script.
- **Impact.** A change is a contribution (it names what it touches) or a knowledge write. Its reach (`src/reach.js`,
  `src/impact.js`) is a bounded walk over what D1 holds: `k_node_links`, `k_check_refs`, the goals of those checks, the
  questions that name the node. Computed on read, never stored, never a table scan.
- **Stale proof.** A check graded before its node last changed is stale: the light shows it and `missing` asks for the
  regrade. Three trigger-kept rows (`k_node_stale`, `k_check_stale`, the `k_fill` row `stale`); a change counts only on
  a graded node.
