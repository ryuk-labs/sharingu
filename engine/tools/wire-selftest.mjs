// wire-selftest.mjs: the shell against the board's wireframe and Brand v2 (UI-B1a, program guardrail 1).
//
// Renders src/shell.js's shell() for anonymous · contributor · owner against a served-looking fixture
// (a brand, a reader, projects with a real choice, a felt-loop count) and FAILS on:
//   · a shell region (wireframe.json .shell.regions) missing, or present but EMPTY
//   · a shell button (.shell.buttons) whose door (.shell.wires[b].door) is not the one it carries, or is
//     neither in contracts/door.json `rest` nor marked client-side; every form, data-door and link in
//     the rendered page must be a door in contracts/door.json too
//   · a colour literal in src/shell.js that is not a Brand v2 token value (design-law.json design.*)
//   · every Brand v2 colour token not carried in the token block
//   · Geist anywhere (source or page) · Manrope / Fredoka / JetBrains Mono not loaded from the worker's own /fonts/ (the look
//     pass: self-hosted, src/fonts.js; a request to Google is red)
//   · (the look pass, sprint 2) the two worlds: Paper when the system is light or the person chose it, Ink otherwise, the
//     remembered choice applied before the first paint, the theme switch in the rail; pages name the SEMANTIC tokens only
//     (no colour literal outside the palette's home, shell.js, and U-chan's vector, ui.js; a screen moved onto the shared
//     parts reads no --bv-* name); the chips resolve to the law's Ink values in Ink and to the Paper state family in Paper
//   · (UI-B1b) a colour literal or Geist in ANY src/*.js (since UI-B7a the generated eagle.js and canvasapp.js
//     too, no exception by name): comments are stripped by a string-aware scanner, so a colour inside a template
//     or a string is caught and a `/*` inside a string never swallows the code after it
//   · (UI-B1b) the four state patterns (ui.js EMPTY · LOADING · ERROR · UNREACHABLE) and the restyled pages
//     (/profile · /docs · /missing through shell(); the standalone /login, the OAuth consent and error pages,
//     the batch report) rendered and audited: no em dash, Brand v2 faces, no second skin (a standalone page
//     carries the shell's own token block verbatim), sign-in inputs declared, red only on ERROR and only
//     beside its icon, UNREACHABLE refusing a write before the press
//   · an em dash in the rendered page (text, attributes, the shell's own script strings)
//   · a text input outside the declared exceptions (auth · admin · search, see INPUT_EXCEPTIONS)
//   · no prefers-reduced-motion rule that stops transitions and animations
//   · the old shell served again (sidebar, hint overlay, footer, collapse script). The theme switch is RULED now (owner,
//     2026-09-30: follow the system, a remembered manual switch), so data-theme is no longer an old-shell mark
//   · shell.js's registers (PAGES · TABS · PUBLIC_KEYS) no longer in the shape the platform board derives
//     every console screen from (the brain's source/board/normalize.mjs parses them by shape; restated here
//     so a shell change that breaks the board goes red in this gate, never first on the board)
//   · (UI-B2) the Decisions screen and the QuestionCard against the pinned wf-decisions (3 regions, 6 buttons) and
//     wf-question (5 regions, 7 buttons), rendered by the REAL readers over a served-looking pack
//     (tools/fixtures/decisions-pack.mjs): every region present and non-empty, every button wired to its own door
//     (or marked client-side), every door in contracts/door.json, no text input, exactly one pin-ink note (the
//     card's why; none on Decisions), the card's counter call the wireframe's verbatim, EMPTY on an empty pack,
//     ERROR on an unreadable one, UNREACHABLE (writes refused before the press) when the live read fails; and the
//     product named sharingu on the authed shell's title and wordmark (QE7ACBBA8), never "Agent R"
//   · (UI-B3) Home against the pinned wf-home (6 regions, 8 buttons), rendered by the REAL readHomeSummary over a
//     served-looking brain and a REAL SQLite D1 (tools/fixtures/home-d1.mjs): the six regions in the artboard's order and
//     non-empty, every button on its own door or client-side, every door in contracts/door.json, no text input, no em
//     dash, no pin, both counter calls verbatim from the wireframe, exactly one kind chip per needs-you row, the decide
//     count equal to the Decisions "Open: yours", the aim's measure drawn (and its EMPTY sentence without one), EMPTY
//     on an empty fixture, the seat's and the newcomer's Home, UNREACHABLE on a failed D1 wave, and no "Your thread"
//     view on Home's bar
//   · (UI-B4a) the filing page against the pinned wf-filing (6 regions, 6 buttons), rendered from the REAL core.js
//     filingFor (the scoped row + ONE counters statement) over the Home fixture's real SQLite D1: the six regions in
//     the spec's order and non-empty, every button on its own door, every door in contracts/door.json, no text input,
//     no em dash, no colour literal and --bv-* tokens only in the page's own content, big numbers in Fredoka, the
//     exact counter call with the id filled in, "N standing · M ruled" from the one STANDING_COUNTER definition (equal
//     to Home's count on the same row), EMPTY "No counters on this filing.", the owner's three buttons and none for a
//     seated reader, and another project's reader answered not_found exactly like a missing id
//   · (UI-B4b) Build against the pinned wf-build (3 regions, 5 buttons), rendered by the REAL readBuild over the Home
//     fixture's real SQLite D1 (plus a goal, a rank press and a ruled row): the three regions in the artboard's order and
//     non-empty, every button on its own door or client-side, every door in contracts/door.json, no text input, no em
//     dash, no colour literal and --bv-* tokens only in the page's own content, big numbers in Fredoka, exactly one
//     design-law state chip per row, the counters call verbatim from wf-build, the newest rank press first under Ranked,
//     EMPTY on an empty fixture (the finish line EMPTY always until B6), a seated reader's Build equal to the owner's, a
//     reader seated only on another project reading EMPTY, UNREACHABLE on a failed D1 wave (rank refused), and the Build
//     tab ONE view (no Queue /thread view, no Files /artifacts view, in shell.js TABS or on the page)
//   · (UI-B5a, QB74B1B7E) the ONE state chip: ui.js stateChip renders each of design-law stateChips' 11 chips as
//     data-chip=<chip>, and shell.js CHIP_CSS draws each on the law's ground and text (resolved through shell.js's own
//     --bv-* token values), gap dashed stone, ERROR with its icon; no chip colour rule in any other src/*.js and no
//     hand-written data-chip outside ui.js; tempoChip maps design-law tempo.stages[].chip (a reject never green); every
//     rendered data-chip on Home, Decisions, the question card, Build and the filing page one of the 11; no orange in any
//     chip; red only on ERROR. Seven injected reds each fail (orange GRANT, green APPROVE, red needs-more, green reject,
//     a page-local chip rule, a 12th chip, ERROR without its icon)
//   · (UI-B5b) Versions against the pinned wf-versions (3 regions, 5 buttons), rendered by the REAL readVersionsView over the
//     versions fixture (tools/fixtures/versions.mjs: two versions made in a real SQLite by src/knowledge/versions.js): the three regions in the
//     artboard's order and non-empty, every button on its own door or client-side, every door in contracts/door.json, no
//     typed input, no em dash, --bv-* tokens only; viewing an older version is the BEHIND pattern with back-to-current, the
//     current one says so with the LANDED chip, no spine is each region's EMPTY; Restore is a POST for the owner and
//     disabled with its reason for a seated reader; every Map view's bar carries the version chip (LANDED "v2 · current",
//     door GET /versions; "Not versioned yet" before v1); Versions is a Map VIEW, so the tab row stays eight (Broadcast the eighth, UI-B11b). BEHIND joins the
//     state patterns: its own markup and icon, the stone well with dark text, never orange, never red, never a write
//     block; a signed-in page with a version head stamps sharingu-served and polls GET /versions?head=1. Injected reds: a
//     dropped region, BEHIND orange, BEHIND red, BEHIND on ERROR's icon, a Map view without the chip, Restore enabled for a
//     non-owner, the version chip on another door, a Versions TAB
//   · (UI-B6a) Goals against the pinned wf-goals (3 regions, 4 buttons) and one goal against
//     wf-goal-node (5 regions, 3 buttons), rendered by the REAL readGoals / readGoalNode over the Home fixture's real SQLite
//     D1 (a five-node tree filed in k_goals, two landed code filings and one approved note naming goals, a standing counter
//     by gapRefs goal/engine, one preview then file row, an open pack decision on goals): the regions in order and non-empty,
//     every button on its own door or client-side
//     (see-gap-on-map disabled, data-client waits, until UI-B7), every door in contracts/door.json, no typed input, no em
//     dash, no colour literal and --bv-* only, the % in Fredoka, the goal counter call verbatim from the wireframe (goal/<id>
//     filled in), the header's counts, the rows indented by depth with "fed by", What fed's per-lane deltas and the person
//     credit an honest EMPTY, Blocked's DECIDE and gap chips; EMPTY (no tree), honest 0% rows (a tree with no filings),
//     UNREACHABLE (? for every number, titles kept); the node's five regions, one state chip per filing, the leaf's and the
//     root's children, an unknown ref null; the Goals tab ONE view. Injected reds: a region dropped or out of order, the
//     hero card back, the Scorecard view back, a view bar back, see-gap-on-map enabled, person credit shown, a wrong door, the
//     call without goal/, a colour literal, an old token, an em dash, two chips on a filing row
//   · (sprint 2, the Map, the main tab; the owner's ruling of 2026-09-30 supersedes the seven wf-map-* planes) the ONE Map
//     page, rendered by the REAL worker over a model filed in D1 through the importer's mappers (tools/fixtures/map-canvas.json,
//     the brain's flows, chains and architecture) with three checks, one graded: GET /map and every old plane URL
//     draw it on their layers or view for the owner and a seat, each passing the shell's audit and the Map's own (its four
//     regions in order, every button on its door or client-side, the layer pills' counts read off the model, no view bar
//     and the version chip in its bar, find the one declared search input, the node list holding every drawn node, the page's
//     sheet on the semantic tokens only); a pin draws the inspector's hooks; the light filter counts off k_node_lights;
//     Arch draws the architecture node and MCP the registry's tools; EMPTY names preview then file; the inspector's HTML walks
//     the gaps; the client under 60 KB. Injected reds: a button off its door, an em dash, a raw
//     colour, a --bv-* name, the view bar back, a region dropped, a typed count, a layer pressed that the URL did not open
//   · (sprint 2, the Map's Screens view, the atlas; ARCHITECTURE §11) GET /map/screens, rendered by the REAL worker over the
//     same model with render index rows filed (k_renders, k_styles): for the owner and a seat, the shell's audit and the
//     view's own (its four regions in order, every button on its door or client-side, the Screens view current, the chip in
//     the bar, no view bar, one frame per screen the JSON twin lists, each a link in its lane's list, find the declared
//     search input, no iframe or image in the page itself, the view's sheet on the semantic tokens only); a project with no
//     screen draws EMPTY naming preview then file. Injected reds: a button off its door, an em dash, a raw colour in the
//     view's sheet, a region dropped, an iframe that is not sandboxed
//   · (UI-B10b, Q792A0B9F, Q8E554970, Q61A1D91E) GTM (wf-gtm) on GET /gtm, rendered by the REAL worker (so the
//     REAL readGtmPipeline) over the Home fixture's SQLite plus gtm filings, a tree with two gtm nodes and the template
//     (tools/fixtures/gtm-template.json, verbatim, filed in k_gtm), also filed with its kinds reordered and one renamed, and
//     absent: metrics · lanes · goal-link once each in order, data-lane = the JSON lanes (the template's order,
//     then each unlisted filed kind), data-row = the JSON rows each with data-campaign = its goalRef, one counters button
//     per row on GET /gtm with its exact call, the campaigns chips (client) onto exactly the gtm nodes,
//     open-on-goals on GET /goals/:ref to the first gtm node (disabled with its reason when there is none), a proof linked
//     only when it is http(s) and always escaped, the tiles equal GET /goals nodes[].dims gtm, every message the read
//     answers on glass, the GTM tab lit and third in TABS (eight registered since UI-B11b). Injected reds: a typed "312 reached", the
//     four funnel lanes, a sample org, a kind list typed in src/gtm.js, open-on-goals enabled with no gtm node, GTM out
//     of TABS order
//   · (UI-B11b) Broadcast against the pinned wf-broadcast (3 regions, 4 buttons), rendered by the REAL worker (the REAL
//     readBroadcast and the route's HTML face) over the Home fixture's SQLite plus a shelf filed as the ledger holds it (item
//     drafts, publish rows, a per-project equip pinned to v1 of a slug published twice): shelf · equipped-here ·
//     org-wall-note once each in order, data-item/data-kind = the JSON shelf, equip on POST /broadcast/equip enabled exactly
//     on can.equip with D8's line (disabled with its reason otherwise), update-version enabled only on a card this project
//     holds at an older version ("Update to v<n> (this project is on v<m>)"), one publish form per own publishable draft
//     (else disabled with its reason and the exact call), kind-filter chips (client) = filter.kinds, the EMPTY sentences,
//     the UNREACHABLE block, the Broadcast tab lit and seventh (eight registered). Injected reds: a typed "9 published", a
//     sample item, a sample person, "siru or veil", publish enabled with no draft, equip enabled for an unseated reader,
//     the tab out of order, the tab not lit, D8's line dropped, update-version not offered, a card without its kind, a
//     region twice, a silent EMPTY, a hex colour
//   · (UI-B12b) Control against the pinned wf-control (5 regions, 9 buttons), rendered by the REAL worker (the REAL
//     readControl and GET /control's HTML face) over the Home fixture's SQLite plus a second active project, an archived one,
//     a person seated nowhere and the suites' fixed owner, as the admin, a seat, a reader seated nowhere, the admin's
//     read-only credential, the admin alone and a failed read: nav · people · workspaces · keys · this-org once each in
//     order, data-person = the JSON's people in order, data-project only the reader's ACTIVE projects, every admin control
//     on POST /control enabled exactly on its can.* and otherwise DISABLED (its own attribute) with aria-describedby naming a
//     reason that names the admin, never hidden (F6), no enabled submit in a /control form on a non-writer's page, no archive
//     button, no email but the reader's own on a non-admin's page, the provisioning inputs data-input-exception="admin",
//     the nav's /audit and /decisions?status=in-force, the EMPTY sentences, UNREACHABLE, the Control tab lit, last and
//     pushed right for every reader, TABS' Control ONE view with no ownerOnly and no retired view, the top-bar chip naming
//     ?project=. Injected reds: a typed sample, Control ownerOnly again, Desk back in TABS, an admin button enabled for a
//     seat, an admin button hidden from a seat, an archived project listed, an archive button, another's email, a bare text
//     input, a reason that names nobody, the people out of order, a hex colour
// Then it PROVES ITSELF both ways on every run: each defect is injected into the rendered page or the
// source string and the same audit must go red on the named check (the clean render is green first).
//
// The gate never reads outside the repo: the wireframe and the design law are pinned snapshots under
// tools/fixtures/ (each carries `_pinned`: the brain path and sha it was copied from).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { shell, BRAND_TOKENS_CSS, STATE_CSS, CHIP_CSS, versionChip, INK_WORLD, PAPER_WORLD, LEGACY_ALIASES } from "../src/shell.js";
import { emptyState, loadingState, errorState, unreachableState, stateChip, statusChip, STATE_CHIPS, behindState } from "../src/ui.js";
import { readVersionsView, renderVersions, VERSIONS_REGIONS, TIMELINE_EMPTY, DIFF_EMPTY_NONE, RESTORE_REASON } from "../src/versionsview.js";
import { versionsFixture, RULED_QID as V_RULED_QID } from "./fixtures/versions.mjs";
import { tempoChip } from "../src/tempo.js";
import { renderLogin, authPage, authBrand } from "../src/login.js";
import { renderSignup, SIGNUP_REFUSED_WORDS } from "../src/signup.js";
import { renderOrgNew, renderOrgMade } from "../src/orgpage.js";
import { renderRequestAccess, renderRequestReceived, renderRequestAsked, renderRequestMissing, REQUEST_FIELD_WORDS } from "../src/requestpage.js";
import { ORG_WORDS } from "../src/orgs.js";
import { renderProfilePage } from "../src/profile.js";
import { renderDocs } from "../src/docs.js";
import { renderHoles, holesShape, computeHoles, callText } from "../src/holes.js";
import { renderReportShell } from "../src/report.js";
import { readDecisions, readQuestion, renderDecisionsPage, renderQuestionPage, COUNTER_CALL, owedBy } from "../src/decisions.js";
import { fixtureEnv, OPEN_QID, RULED_QID, seedQuestions } from "./fixtures/decisions-pack.mjs";
import { readHomeSummary, renderHome, HOME_REGIONS, AIM_EMPTY, MEASURE_EMPTY } from "../src/home.js";
// sprint 3 L2 (pristine copy): the parent counter call left Home and Build (it rides What is missing); the wireframe still pins it
const PARENT_COUNTER_CALL = 'preview {items: [{contribution: {lane, kind: "counter", parent: <this id>, what, why}}]}, then file';
import { renderTransmissionPage, FILING_REGIONS, filingCounterCall, FILING_RULINGS } from "../src/txpage.js";
import { filingFor, projectSeatsFor, switcherCurrentOf, READ_SCOPE, tokenProjectFor } from "../src/core.js";
import { callTool } from "../src/mcp.js";
import { homeFixtureEnv, OWNER as H_OWNER, SEAT as H_SEAT, NEWCOMER as H_NEW, MEASURE as H_MEASURE, APPROVE_ID as H_APPROVE, GRANT_ID as H_GRANT, OPEN_QID as H_OPEN_QID } from "./fixtures/home-d1.mjs";
import * as HOT from "../src/hotsql.js";
import { org1 } from "./fixtures/org.mjs";
// the hot statements as org 1's request runs them (sprint 6, 6.2: src/data.js writes the reader's org in)
const [FILING_COUNTERS_SQL, BUILD_ROWS_SQL, BUILD_AGG_SQL, GOALS_AGG_SQL] = [HOT.FILING_COUNTERS_SQL, HOT.BUILD_ROWS_SQL, HOT.BUILD_AGG_SQL, HOT.GOALS_AGG_SQL].map(org1);
const { GOALS_NOT_KIND } = HOT;
import { readBuild, renderBuild, stagesOf, BUILD_REGIONS, BUILD_CHIPS, BUILD_EMPTY, TEMPO_EMPTY, FINISH_EMPTY, FINISH_DOWN } from "../src/build.js";
import { rollupCells, renderGoals, renderGoalNode, GOALS_REGIONS, GOAL_NODE_REGIONS, GOALS_EMPTY, BLOCKED_EMPTY, LEAF_CHILDREN, whatFedEmpty, nodeFilingsEmpty } from "../src/goals.js";
import { readGoals, readGoalNode, periodFrom } from "../src/goalsread.js";
import { GOAL_TREE_SQL } from "../src/knowledge/goals.js";
import { GOAL_COUNTER_CALL, FILING_COUNTER_CALL } from "../src/transmission.js";
import { ORG_SQL } from "../src/tenant.js";
// a four-leaf tree under one root (the shape the retired manifest default had), the undeclared case's fixture
const DEFAULT_GOALS = { tree: [
  { id: "global", title: "Product readiness", parent: null, dimensions: [], weight: 1 },
  { id: "scope", title: "Scope", parent: "global", dimensions: ["ba"], weight: 1 },
  { id: "dev", title: "Dev", parent: "global", dimensions: ["code"], weight: 1 },
  { id: "design", title: "Design", parent: "global", dimensions: ["design"], weight: 1 },
  { id: "ai", title: "AI", parent: "global", dimensions: ["vendor"], weight: 1 },
] };
import { renderInspector, MAP_EMPTY } from "../src/mapnode.js";
import { MAP_REGIONS } from "../src/mappage.js";
import { MAP_CLIENT } from "../src/mapclient.js";
import { ATLAS_REGIONS } from "../src/atlaspage.js";
import { seedModel, seedChecks, seedGrade } from "./fixtures/model-d1.mjs";
import { GTM_REGIONS } from "../src/gtm.js";
import { GTM_NO_GOAL, GTM_NO_TEMPLATE, GTM_EMPTY } from "../src/gtmread.js";
// the person credit's old explanation (sprint 3 L2 deleted it from src/goals.js): it must never be back on the page
const CREDIT_EMPTY = "Credit to the person whose ruling a contribution flowed from shows once contributions are linked to the rulings they flow from.";
import { BROADCAST_REGIONS } from "../src/broadcastpage.js";
import { EMPTY_SHELF, EMPTY_HERE, NO_DRAFT } from "../src/broadcastread.js";
import { CONTROL_REGIONS } from "../src/controlpage.js";
import { EMPTY_ALONE, EMPTY_NOSEAT, READ_ONLY_REASON } from "../src/controlread.js";
const CONTROL_PROJECTS_SQL = org1(HOT.CONTROL_PROJECTS_SQL);
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { ROWS as DECISION_ROWS } from "./fixtures/decisions-pack.mjs";
const FILING_COUNTERS_SQL_OWNER = FILING_COUNTERS_SQL(false, false);

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(p, "utf8");
// the one contracts/ rule (gate.sh · tools/make-door-contract.py): AGENT_R_CONTRACTS, else beside, else above
const CONTRACTS = process.env.AGENT_R_CONTRACTS || (existsSync(join(ENGINE, "contracts")) ? join(ENGINE, "contracts") : join(ENGINE, "..", "contracts"));
const WF = JSON.parse(read(join(ENGINE, "tools", "fixtures", "wireframe.json")));
const LAW = JSON.parse(read(join(ENGINE, "tools", "fixtures", "design-law.json"))).design;
const DOOR = JSON.parse(read(join(CONTRACTS, "door.json")));
const SRC = read(join(ENGINE, "src", "shell.js"));
// the widened scan's population: every src/*.js (the Map's own files included; the generated eagle.js and canvasapp.js retired
// with the Map's sprint-2 build)
const SRC_FILES = readdirSync(join(ENGINE, "src")).filter((f) => f.endsWith(".js")).sort();
const SOURCES = Object.fromEntries(SRC_FILES.map((f) => [f, read(join(ENGINE, "src", f))]));

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };

// ---- the law, derived from the pinned snapshots (never hand-typed here) ----
const SHELL = WF.shell;
const REGIONS = SHELL.regions;                       // mark · org-name · project-switcher · tabs · search · notifications · avatar
const BUTTONS = SHELL.buttons;                       // project-switch · search · notifications · avatar
const WIRES = SHELL.wires;
// an anonymous visitor has no person: the three regions that act for one are absent, never dead buttons
const MEMBER_ONLY = new Set(["project-switcher", "search", "notifications"]);
const hex6 = (h) => { h = h.replace("#", "").toUpperCase(); return h.length === 3 || h.length === 4 ? h.slice(0, 3).split("").map((c) => c + c).join("") : h.slice(0, 6); };
const TOKENS = new Map();                            // RRGGBB -> token name
const addTok = (n, v) => { if (/^#[0-9a-f]{6}$/i.test(String(v || ""))) TOKENS.set(hex6(v), n); };
for (const w of LAW.worlds) for (const t of w.tokens) addTok(t.n, t.v);
for (const t of LAW.brand) addTok(t.n, t.v);
for (const t of LAW.presence) addTok(t.n, t.v);
for (const t of LAW.inkStates.tokens) { addTok(t.n, t.v); addTok(`${t.n} well`, t.well); addTok(`${t.n} paper`, t.paper); }
for (const d of LAW.depth) for (const m of String(d.v).match(/#[0-9a-f]{6}/gi) || []) addTok(d.n, m);
// doors: "M /path" with :params
const REST = DOOR.rest.map((r) => ({ m: r.method, re: new RegExp("^" + r.path.replace(/:[a-z]+/gi, "[^/]+") + "$") }));
const inDoor = (m, path) => REST.some((r) => r.m === m && r.re.test(path));
// sprint 7, 7.4: a page's links and forms carry its org's address (<html data-org-base>, src/orgpath.js): the door is the route
// under it (a fragment with no <html> carries none)
const baseOf = (html) => (String(html).match(/<html\b[^>]*\sdata-org-base="([^"]*)"/) || [])[1] || "";
const unbase = (b, p) => { const c = String(p).replace(/^'\+orgPath\('([^']*)'\)\+'$/, "$1");   // a form a page script builds: '+orgPath('/x')+'
  return b && (c === b || c.startsWith(b + "/") || c.startsWith(b + "?")) ? (c.slice(b.length) || "/") : c; };
// the declared text-input exceptions: auth (sign-in, the OAuth consent), admin (OD5: an admin may type to
// provision), search (the top bar's search, a read, never a contribution: wireframe.json shell button `search`)
const INPUT_EXCEPTIONS = new Set(["auth", "admin", "search"]);

// ---- jsCodeOf(src): the source with its JS comments removed and every string and template kept (UI-B1b) ----
// B1a stripped /* */ and whole-line // with two regexes, which is fine for shell.js alone; across every src/*.js a
// `/*` inside a string (a glob, a path) swallowed up to 23k characters of real code, so a colour there could never
// go red. This walks the source: code · // · /* */ · "…" · '…' · `…` with ${} nesting · a regex literal.
function jsCodeOf(src) {
  let out = "", i = 0, mode = "code"; const stack = [];
  const regexOk = () => { const p = out.replace(/\s+$/, ""); return p === "" || /[(,=:[!&|?{};+\-*%<>~^]$/.test(p) || /\b(?:return|typeof|case|in|of|void|delete|throw)$/.test(p); };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "lc"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "bc"; i += 2; out += " "; continue; }
      if (c === "/" && regexOk()) {
        let j = i + 1, cls = false;
        while (j < src.length && src[j] !== "\n" && (cls || src[j] !== "/")) { if (src[j] === "\\") j++; else if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; j++; }
        j++; while (j < src.length && /[a-z]/i.test(src[j])) j++;
        out += src.slice(i, j); i = j; continue;
      }
      if (c === "`") { mode = "tpl"; out += c; i++; continue; }
      if (c === '"') { mode = "dq"; out += c; i++; continue; }
      if (c === "'") { mode = "sq"; out += c; i++; continue; }
      if (c === "}" && stack.length) { if (stack[stack.length - 1] > 0) stack[stack.length - 1]--; else { stack.pop(); mode = "tpl"; } out += c; i++; continue; }
      if (c === "{" && stack.length) stack[stack.length - 1]++;
      out += c; i++; continue;
    }
    if (mode === "lc") { if (c === "\n") { mode = "code"; out += c; } i++; continue; }
    if (mode === "bc") { if (c === "*" && n === "/") { mode = "code"; i += 2; continue; } if (c === "\n") out += c; i++; continue; }
    if (mode === "tpl") {
      if (c === "\\") { out += c + (n || ""); i += 2; continue; }
      if (c === "$" && n === "{") { stack.push(0); mode = "code"; out += "${"; i += 2; continue; }
      if (c === "`") { mode = "code"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    const q = mode === "dq" ? '"' : "'";
    if (c === "\\") { out += c + (n || ""); i += 2; continue; }
    if (c === q || c === "\n") mode = "code";
    out += c; i++;
  }
  return out;
}
// colourFails(code, file, fail): a hex, rgb()/rgba() or named colour that is not a Brand v2 token value
function colourFails(code, file, fail) {
  for (const m of code.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) if (![3, 4, 6, 8].includes(m[1].length) || !TOKENS.has(hex6(m[1]))) fail("colour", `${file}: #${m[1]} is not a Brand v2 token`);
  for (const m of code.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
    const h = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
    if (!TOKENS.has(h)) fail("colour", `${file}: ${m[0]}) is not a Brand v2 token`);
  }
  for (const m of code.matchAll(/(?:^|[;{\s])(?:color|background|background-color|border(?:-[a-z]+)?|fill|stroke|outline)\s*:\s*[^;}"]*?(?<![-\w])(white|black|red|green|blue|purple|pink|violet|teal|gray|grey|yellow|orange)(?![-\w])/gim)) fail("colour", `${file}: named colour "${m[1]}"`);
}
// srcAudit(sources): the widened per-file scan, (file -> source) -> failures by check id
function srcAudit(sources) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  for (const [file, src] of Object.entries(sources)) {
    colourFails(jsCodeOf(src), file, fail);
    if (/geist/i.test(src)) fail("type", `${file}: Geist is still referenced`);
  }
  return f;
}

// ---- a tiny HTML reader: the element carrying an attribute, balanced by its own tag name ----
function elementAt(html, idx) {
  const open = html.lastIndexOf("<", idx);
  const name = /^<([a-z0-9]+)/i.exec(html.slice(open))[1].toLowerCase();
  const tagEnd = html.indexOf(">", idx);
  const startTag = html.slice(open, tagEnd + 1);
  let depth = 1, i = tagEnd + 1;
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  re.lastIndex = i;
  let m;
  while ((m = re.exec(html))) { if (m[1]) { if (--depth === 0) return { startTag, inner: html.slice(tagEnd + 1, m.index) }; } else if (!/\/>$/.test(m[0])) depth++; }
  return { startTag, inner: "" };                    // void element or unclosed: no inner
}
const regionOf = (html, r) => { const i = html.indexOf(`data-region="${r}"`); return i < 0 ? null : elementAt(html, i); };
const textOf = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, "x").replace(/\s+/g, " ").trim();
const attr = (tag, a) => { const m = new RegExp(`\\s${a}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
// a region is non-empty when it carries visible text, or it is a control with an accessible name
const nonEmpty = (el) => !!el && (textOf(el.inner).length > 0 || /aria-label="[^"]+"/.test(el.startTag + el.inner));
// ---- the look pass (sprint 2): the rail's semantic hooks, read instead of its markup ----
// a destination: <a … href="…" data-tab="<key>"[ aria-current="true"]>…its label…[<span data-badge>n</span>]</a> in region tabs
const tabItems = (h) => [...((regionOf(h, "tabs") || { inner: "" }).inner).matchAll(/<a\b([^>]*\sdata-tab="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g)]
  .map((m) => ({ key: m[2], href: attr(`<a${m[1]}>`, "href"), cur: /\saria-current="true"/.test(m[1]), label: textOf(m[3].replace(/<span\b[^>]*\sdata-badge=[^>]*>[\s\S]*?<\/span>/g, "")) }));
const litTab = (h) => tabItems(h).find((t) => t.cur) || null;
// isLit(h, key, href, label): that destination is the current one, and it opens href
const isLit = (h, key, href, label) => { const t = litTab(h); return !!t && t.key === key && t.href === href && (!label || t.label === label); };
const unlight = (h, key) => h.replace(new RegExp(`(\\sdata-tab="${key}") aria-current="true"`), "$1");
// the view bar above the content (the Map's planes and Versions): the <nav> labelled Views
const VIEWBAR_RE = /<nav\b[^>]*\saria-label="Views"[^>]*>([\s\S]*?)<\/nav>/;
const hasViewBar = (h) => VIEWBAR_RE.test(h);
const viewBarOf = (h) => (VIEWBAR_RE.exec(h) || [])[1] || "";
const viewLabels = (h) => [...viewBarOf(h).matchAll(/<a\b[^>]*\sdata-view="[^"]*"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
const injectViewBar = (h, links) => h.replace('<main class="content', `<nav class="viewbar" aria-label="Views">${links}</nav><main class="content`);
// fontFails: the three faces are the worker's own (GET /fonts/:file, src/fonts.js), one @font-face each; no font from Google
const fontFails = (html, kind, fail) => {
  for (const [face, file] of [["Manrope", "manrope"], ["Fredoka", "fredoka"], ["JetBrains Mono", "jetbrains-mono"]])
    if (!new RegExp(`@font-face\\{font-family:'${face}'[^}]*src:url\\(/fonts/${file}\\.woff2\\?v=[0-9a-f]+\\)`).test(html)) fail("type", `${kind}${face} is not loaded from the worker's own /fonts/`);
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) fail("type", `${kind}a font is asked of Google (the faces are self-hosted)`);
};

// ---- the audit: (html of one render, the persona, the source) -> failures by check id ----
function audit(html, persona, src) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  // regions
  for (const r of REGIONS) {
    const el = regionOf(html, r);
    if (persona === "anonymous" && MEMBER_ONLY.has(r)) { if (el) fail("region", `${r} rendered for an anonymous visitor (it acts for a person)`); continue; }
    if (!el) fail("region", `${r} missing`);
    else if (!nonEmpty(el)) fail("region", `${r} is empty`);
  }
  const tabs = regionOf(html, "tabs");
  if (tabs && !/\sdata-tab="[a-z]+"/.test(tabs.inner)) fail("region", "tabs carries no tab (no data-tab destination)");
  // buttons: each wired to its own door, the door real (door.json) or marked client-side
  if (persona !== "anonymous") {
    for (const b of BUTTONS) {
      if (b === "project-switch" && persona === "single-seat") continue;   // nothing to switch: the region names the scope instead
      const i = html.indexOf(`data-button="${b}"`);
      if (i < 0) { fail("door", `button ${b} not rendered`); continue; }
      const tag = html.slice(html.lastIndexOf("<", i), html.indexOf(">", i) + 1);
      const door = attr(tag, "data-door");
      const want = WIRES[b] && WIRES[b].door;
      if (door !== want) fail("door", `button ${b} carries door "${door}", the wireframe wires "${want}"`);
    }
  }
  for (const m of html.matchAll(/<[^>]*\sdata-door="([^"]*)"[^>]*>/g)) {
    const [meth, path] = m[1].split(" ");
    if (!inDoor(meth, path) && !/\sdata-client="/.test(m[0])) fail("door", `${m[1]} is not in contracts/door.json and not marked client-side`);
  }
  const B = baseOf(html);
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) {
    const meth = (attr(m[0], "method") || "GET").toUpperCase(), act = (/action="'\+orgPath\(["']([^"']*)["']\)\+'"/.exec(m[0]) || [])[1] || attr(m[0], "action") || "";
    if (!inDoor(meth, unbase(B, act.split("?")[0]))) fail("door", `form ${meth} ${act} is not in contracts/door.json`);
  }
  for (const m of html.matchAll(/<a\b[^>]*\shref="(\/[^"#]*)"/gi)) {
    const path = unbase(B, m[1].replace(/&amp;/g, "&").split("?")[0]);
    if (!inDoor("GET", path)) fail("door", `link ${m[1]} is not a GET door in contracts/door.json`);
  }
  // colours: every literal in the SOURCE is a Brand v2 token value
  const code = jsCodeOf(src);
  colourFails(code, "shell.js", fail);
  for (const [v, n] of TOKENS) if (!new RegExp(`--bv-[a-z0-9-]+:#${v}\\b`, "i").test(code)) fail("colour", `the token block does not carry ${n} #${v}`);
  // type
  if (/geist/i.test(src) || /geist/i.test(html)) fail("type", "Geist is still referenced");
  fontFails(html, "", fail);
  // the two worlds (the look pass): Paper when the system is light or the person chose it, Ink otherwise; the remembered
  // choice is applied before the first paint (a boot script ahead of every style), and the switch is in the rail
  if (!/@media \(prefers-color-scheme:light\)\{:root:not\(\[data-theme="dark"\]\)\{/.test(html) || !/:root\[data-theme="light"\]\{/.test(html)) fail("theme", "the Paper world is not chosen by the system setting and the remembered switch");
  if (!/localStorage\.getItem\('sharingu-theme'\)/.test(html.slice(0, html.indexOf("<style>")))) fail("theme", "the remembered theme is not applied before the first paint (no boot script ahead of the styles)");
  if (!["system", "light", "dark"].every((k) => html.includes(`data-theme-choice="${k}"`))) fail("theme", "the theme switch (system / Paper / Ink) is not on the page");
  // no em dash anywhere on the rendered page
  if (/—|&mdash;|&#8212;|&#x2014;/i.test(html)) fail("emdash", `an em dash in the rendered page ("${(/.{0,30}(?:—|&mdash;|&#8212;|&#x2014;).{0,30}/i.exec(html) || [""])[0]}")`);
  // text inputs outside the declared exceptions
  for (const m of html.matchAll(/<(input|textarea)\b[^>]*>/gi)) {
    const type = (attr(m[0], "type") || "text").toLowerCase();
    if (m[1].toLowerCase() === "input" && ["hidden", "submit", "button", "checkbox", "radio"].includes(type)) continue;
    const ex = attr(m[0], "data-input-exception");
    if (!ex || !INPUT_EXCEPTIONS.has(ex)) fail("input", `${m[0].slice(0, 60)} is a text input outside ${[...INPUT_EXCEPTIONS].join("/")}`);
  }
  // motion
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*transition:\s*none[^}]*animation:\s*none/.test(html)) fail("motion", "no prefers-reduced-motion rule stopping transitions and animations");
  // the old shell, dropped (the program's drop list)
  for (const [what, re] of [["the sidebar", /class="sidebar"|class="navitem|renderNav/], ["the hint overlay", /id="hintov"|id="hint"/],
                           ["the footer", /class="site-footer"/], ["the collapse script", /ar-nav|data-nav/], ["the launcher link", /launcher-link/]])
    if (re.test(html)) fail("old-shell", `${what} is served again`);
  // the registers, by the board's own parse shape: every row of each block must parse, none silently skipped
  // the board slices by indexOf, so each opening literal must appear exactly once (a comment quoting it would move the slice)
  const between = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return i < 0 || j < 0 || src.indexOf(a, i + 1) >= 0 ? null : src.slice(i, j); };
  const pagesBlk = between("const PAGES = [", "// PUBLIC_KEYS");
  if (!pagesBlk) fail("registers", "no single `const PAGES = [` block closed before a `// PUBLIC_KEYS` comment");
  else {
    const rows = (pagesBlk.match(/\{\s*key:\s*"/g) || []).length;
    const nav = [...pagesBlk.matchAll(/\{\s*key:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*href:\s*"([^"]*)",\s*group:\s*"([^"]+)"([^}]*?)\n?\s*icon:/gs)].length;
    const off = [...pagesBlk.matchAll(/\{\s*key:\s*"([^"]+)",\s*offNav:\s*"([^"]+)"\s*\}/g)].length;
    if (!rows || nav + off !== rows) fail("registers", `PAGES: ${nav + off} of ${rows} rows parse as \`key, label, href, group[, flags], icon\` or \`key, offNav\``);
  }
  const tabsBlk = between("const TABS = [", "// which tabs a role sees");
  if (!tabsBlk) fail("registers", "no single `const TABS = [` block closed before a `// which tabs a role sees` comment");
  else {
    const rows = [...tabsBlk.matchAll(/^\s*\{\s*key:\s*"/gm)].length;
    const tabs = [...tabsBlk.matchAll(/\{\s*key:\s*"(\w+)",\s*label:\s*"([^"]+)",\s*icon:\s*"(\w+)"(,\s*ownerOnly:\s*true)?,\s*\n?\s*views:\s*\[([^\]]*)\]\s*\}/gs)];
    if (!rows || tabs.length !== rows || tabs.some((t) => !/\{\s*key:\s*"[^"]+",\s*label:\s*"[^"]+",\s*href:/.test(t[5])))
      fail("registers", `TABS: ${tabs.length} of ${rows} rows parse as \`key, label, icon[, ownerOnly], views\``);
  }
  if (!/const PUBLIC_KEYS = new Set\(\[\s*"[^"]+"(?:\s*,\s*"[^"]+")*\s*\]\)/.test(src)) fail("registers", "PUBLIC_KEYS is not a literal `new Set([\"...\"])`");
  return f;
}

// ---- the served-looking fixture ----
const brand = { org: "Northwind", engine: "Agent R", productTitle: "Northwind · Agent R", owner: "Owner" };
const options = [{ key: "alpha", name: "Alpha" }, { key: "beta", name: "Beta" }];
const content = '<section class="page-head"><p class="eyebrow">Northwind</p><h1>Home</h1><p class="lede">Hello from the fixture.</p></section>';
const PERSONAS = {
  anonymous: { active: "docs", reader: null, owner: false, proj: null },
  contributor: { active: "home", reader: { id: "p-c", name: "Rae Kim", role: "internal-eng", title: "Engineer", viaCookie: true }, owner: false,
                 proj: { current: options[0], options, orgEntry: false } },
  owner: { active: "audit", reader: { id: "p-o", name: "Owen Park", role: "owner", viaCookie: true }, owner: true,
           proj: { current: null, options, orgEntry: true } },
  // one project, no choice: the switcher region still names the scope (never empty); no switch button to wire
  "single-seat": { active: "goals", reader: { id: "p-s", name: "Sam", role: "internal-eng", viaCookie: false }, owner: false, proj: null },
};
const render = (p) => shell({ ...p, content, brand, briefCount: 3, hasPack: true });

// 1. clean: green for every persona
const pages = {};
for (const [name, p] of Object.entries(PERSONAS)) {
  let html = "";
  try { html = render(p); } catch (e) { ok(false, `${name}: shell() throws: ${e && e.message}`); continue; }
  pages[name] = html;
  const f = audit(html, name, SRC);
  ok(f.length === 0, `${name}: every region present and non-empty, every door real, tokens · type · no em dash · no stray input · reduced motion · no old shell · board registers${f.length ? `\n      ${f.join("\n      ")}` : ""}`);
}
ok(TOKENS.size >= 25, `the Brand v2 colour set derived from the pinned design law (${TOKENS.size} values)`);
ok(REGIONS.length === 7 && BUTTONS.length === 4, `the pinned wireframe's shell: ${REGIONS.length} regions, ${BUTTONS.length} buttons (${WF._pinned && WF._pinned.sha ? `brain ${WF._pinned.sha.slice(0, 10)}` : "no _pinned sha"})`);
ok(!!(WF._pinned && /^[0-9a-f]{40}$/.test(WF._pinned.sha) && LAW && JSON.parse(read(join(ENGINE, "tools", "fixtures", "design-law.json")))._pinned), "both fixtures record the brain sha they were copied from");
// Control is pushed right and last for EVERY seated reader (UI-B12b, QC5F82B90: admin functions, not extra tabs); the anonymous
// visitor has none (the public set only)
const tabsOf = (h) => tabItems(h).map((t) => t.label);
// renderShellFrom(src, persona): shell() out of a scratch copy of src/ whose shell.js is `src` (an injected defect, rendered for real)
async function renderShellFrom(src, persona) {
  const { mkdtempSync, cpSync, rmSync, writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(ENGINE, ".wire-shell-"));
  try {
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "shell.js"), src);
    const m = await import(pathToFileURL(join(dir, "src", "shell.js")).href);
    return m.shell({ ...persona, content, brand, briefCount: 3, hasPack: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const endsOnControl = (h) => { const t = tabItems(h); const last = t[t.length - 1]; return !!last && last.label === "Control" && last.key === "control" && last.href === "/control"; };
if (pages.owner && pages.contributor && pages.anonymous) {
  const o = tabsOf(pages.owner), c = tabsOf(pages.contributor), a = tabsOf(pages.anonymous);
  ok(endsOnControl(pages.owner) && endsOnControl(pages.contributor) && JSON.stringify(o) === JSON.stringify(c) && !a.includes("Control"),
    `tabs: owner [${o.join(" ")}] and contributor [${c.join(" ")}] both end on Control, set apart at the rail's end (one list for every seated reader); anonymous [${a.join(" ")}] has no Control`);
  // both ways: Control back on ownerOnly hides it from the contributor (the render of the mutated shell source)
  const mutSrc = SRC.replace('  { key: "control", label: "Control", icon: "control",\n', '  { key: "control", label: "Control", icon: "control", ownerOnly: true,\n');
  let redC = "";
  try { redC = mutSrc !== SRC ? await renderShellFrom(mutSrc, PERSONAS.contributor) : ""; } catch (e) { redC = ""; }
  ok(mutSrc !== SRC && !!redC && !tabsOf(redC).includes("Control"), `both ways: Control ownerOnly again drops the tab from the contributor's row [${tabsOf(redC).join(" ")}] (the check above would go red)`);
}

// 2. both ways: each injected defect goes red on its own check
const base = pages.contributor || "";
const mutations = [
  ["region", "a missing region (notifications dropped)", (h) => h.replace('data-region="notifications"', 'data-x="notifications"'), null],
  ["region", "an empty region (org-name blank)", (h) => h.replace(/(data-region="org-name">)[^<]*/, "$1"), null],
  ["door", "a button wired to a door not in door.json", (h) => h.replace('data-door="GET /search" data-client="fetch"', 'data-door="GET /pack/nowhere"'), null],
  ["door", "a button carrying another door than its wire", (h) => h.replace('data-door="GET /profile"', 'data-door="GET /whoami"'), null],
  ["door", "a form posting to a door not in door.json", (h) => h.replace('action="/project"', 'action="/project/nope"'), null],
  ["colour", "a non-token colour in shell.js (stamp purple)", null, (s) => s.replace("--radius:10px;", "--radius:10px; --x:#6B4FA8;")],
  ["colour", "a non-token rgba in shell.js", null, (s) => s.replace("--radius:10px;", "--radius:10px; --x:rgba(0,0,0,.5);")],
  ["colour", "a Brand v2 token dropped from the block", null, (s) => s.replace("--bv-dark-line-2:#3A3733;", "")],
  ["colour", "a named colour in shell.js", null, (s) => s.replace("color:var(--text);font:400 14px/1.55 var(--sans)", "color:white;font:400 14px/1.55 var(--sans)")],
  ["type", "Geist in shell.js", null, (s) => s.replace("--sans:'Manrope'", "--sans:'Geist','Manrope'")],
  ["type", "Geist on the page", (h) => h.replace("font-family:'Manrope'", "font-family:'Geist'"), null],
  ["type", "a Google font link back on the page", (h) => h.replace("</head>", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope"></head>'), null],
  ["type", "a face dropped from the self-hosted set", (h) => h.replace("src:url(/fonts/fredoka.woff2", "src:url(/assets/fredoka.woff2"), null],
  ["theme", "the Paper world dropped (Ink only again)", (h) => h.replace(':root[data-theme="light"]{', ':root[data-x="light"]{'), null],
  ["theme", "the remembered theme applied after the first paint (the boot script gone)", (h) => h.replace(/<script>try\{var t=localStorage\.getItem\('sharingu-theme'\)[\s\S]*?<\/script>/, ""), null],
  ["theme", "the theme switch dropped from the rail", (h) => h.replace(/<div class="theme-switch"[\s\S]*?<\/div>/, ""), null],
  ["emdash", "an em dash in a title attribute", (h) => h.replace('title="Search this project"', 'title="Search — this project"'), null],
  ["emdash", "an em dash in rendered text", (h) => h.replace('data-region="org-name">Northwind', 'data-region="org-name">Northwind &mdash; HQ'), null],
  ["input", "a text input outside the exceptions", (h) => h.replace("</header>", '<input type="text" name="note"></header>'), null],
  ["input", "a textarea outside the exceptions", (h) => h.replace("</header>", '<textarea name="note"></textarea></header>'), null],
  ["motion", "no reduced-motion rule", (h) => h.replace("prefers-reduced-motion:reduce", "min-width:1px"), null],
  ["old-shell", "the sidebar served again", (h) => h.replace('<div class="app">', '<div class="app"><aside class="sidebar"></aside>'), null],
  ["old-shell", "the hint overlay served again", (h) => h.replace("</body>", '<div id="hintov" hidden></div></body>'), null],
  ["registers", "the PAGES register deleted", null, (s) => s.replace("const PAGES = [", "const PAGE_ROWS = [")],
  ["registers", "a comment quoting the PAGES opening line", null, (s) => s.replace("// PAGES: the page-identity register", "// const PAGES = [ is below. PAGES: the page-identity register")],
  ["registers", "a PAGES row that no longer parses (icon dropped)", null, (s) => s.replace(/(\{ key: "home", label: "Home", href: "\/home", group: "Overview",)\s*icon:/, "$1 glyph:")],
  ["registers", "a TABS row without its icon key", null, (s) => s.replace('{ key: "build", label: "Build", icon: "audit",', '{ key: "build", label: "Build",')],
  ["registers", "PUBLIC_KEYS derived instead of literal", null, (s) => s.replace('const PUBLIC_KEYS = new Set(["docs", "missing"]);', 'const PUBLIC_KEYS = new Set(PUBLIC_PAGES.map((p) => p.key));')],
];
ok(audit(base, "contributor", SRC).length === 0, "both ways: the clean contributor render is green before any injection");
for (const [id, label, mh, ms] of mutations) {
  const h = mh ? mh(base) : base, s = ms ? ms(SRC) : SRC;
  const changed = h !== base || s !== SRC;
  const f = audit(h, "contributor", s);
  ok(changed && f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${changed ? "" : " (the injection did not apply: the fixture moved)"}`);
}
// an anonymous page that suddenly acts for a person goes red too
if (pages.anonymous) ok(audit(pages.anonymous.replace('<nav class="rail-nav"', `${'<span data-region="search" aria-label="Search">s</span>'}<nav class="rail-nav"`), "anonymous", SRC).some((x) => x.startsWith("region:")),
  "both ways: a member-only region on the anonymous page goes red");

// ---- U-TOPBAR: the top-bar chip names the project the page READ (the seam's READ_SCOPE), never the raw stamp ----
// projP's own branch (src/index.js servePage), fed by a chip rule: curOf(reader, seats, scope) -> the key the chip names.
// The live walk reads `[data-region="project-switcher"] summary span`; the switcher's aria-current follows the same key.
const chipProj = (reader, seats, scope, curOf) => {
  const k = curOf(reader, seats, scope);
  return { current: k ? (seats.find((x) => x.key === k) || { key: k, name: k }) : null, options: seats, orgEntry: reader.role === "owner" };
};
const chipRead = (reader, seats, scope, curOf = switcherCurrentOf) => {
  const html = shell({ active: "home", reader: { ...reader, viaCookie: true }, owner: reader.role === "owner", proj: chipProj(reader, seats, scope, curOf), content, brand, briefCount: 0, hasPack: true });
  const sw = regionOf(html, "project-switcher");
  const span = sw ? (/<summary[^>]*><span>([^<]*)<\/span>/.exec(sw.inner) || [])[1] : null;
  const curOpt = sw ? [...sw.inner.matchAll(/<button type="submit" aria-current="true">([^<]*)</g)].map((m) => m[1]) : [];
  return { span, curOpt };
};
const TB_MEMBER = { id: "p-m", name: "Mia", role: "internal-eng", token_project: null };   // multi-seat, no stamp
const TB_OWNER = { id: "p-o", name: "Owen Park", role: "owner", token_project: null };
const tbScope = (project, named, active) => ({ project, named, active });
ok(typeof READ_SCOPE === "symbol" && READ_SCOPE === Symbol.for("sharingu.readscope"), "U-TOPBAR: READ_SCOPE is the one per-request scope record's symbol");
{
  const m = chipRead(TB_MEMBER, options, tbScope("beta", true, false));
  ok(m.span === "Beta" && m.curOpt.length === 1 && m.curOpt[0] === "Beta",
    `U-TOPBAR: a multi-seat member with no stamp opening /home?project=beta sees the chip name Beta, aria-current on Beta's option (span "${m.span}", current [${m.curOpt.join(", ")}])`);
  const d = chipRead(TB_MEMBER, options, tbScope("alpha", false, false));
  ok(d.span === "Alpha" && d.curOpt.join() === "Alpha", `U-TOPBAR: a member's unnamed first-readable default names the project read (span "${d.span}")`);
  const o = chipRead(TB_OWNER, options, tbScope("alpha", false, false));
  ok(o.span === "All projects" && o.curOpt.join() === "All projects",
    `U-TOPBAR: the owner's unnamed default (the org rollup) reads "All projects", the All form aria-current (span "${o.span}", current [${o.curOpt.join(", ")}])`);
  const on = chipRead(TB_OWNER, options, tbScope("beta", true, false)), oa = chipRead(TB_OWNER, options, tbScope("alpha", false, true));
  ok(on.span === "Beta" && on.curOpt.join() === "Beta" && oa.span === "Alpha" && oa.curOpt.join() === "Alpha",
    `U-TOPBAR: the owner naming ?project=beta sees Beta; the owner's live stamp on alpha sees Alpha (spans "${on.span}", "${oa.span}")`);
  ok(switcherCurrentOf(TB_MEMBER, options, null) === null && switcherCurrentOf(TB_MEMBER, options, tbScope(null, false, false)) === null,
    "U-TOPBAR: no scope, or a project-less scope (seated nowhere), names no project (the honest scope text)");
  // both ways: the chip back on the stamp (tokenProjectFor) loses the ?project= read
  const red = chipRead(TB_MEMBER, options, tbScope("beta", true, false), (r, seats) => tokenProjectFor(r, seats));
  ok(red.span !== "Beta" && red.span === "All projects",
    `both ways: the chip back on the session stamp (tokenProjectFor) fails the member ?project=beta case (span "${red.span}")`);
  // both ways: a rule that ignores the owner default turns the owner's rollup into the first project
  const red2 = chipRead(TB_OWNER, options, tbScope("alpha", false, false), (r, seats, sc) => (sc && sc.project) || null);
  ok(red2.span !== "All projects", `both ways: a chip keyed naively on the read project turns the owner's rollup into "${red2.span}"`);
}

// ---- 3. UI-B1b: the widened source scan, the state patterns and the restyled pages ----
// (a) every src/*.js: token colours only, no Geist; since UI-B7a the generated pair is scanned like the rest
ok(SRC_FILES.length >= 40 && SRC_FILES.includes("login.js") && SRC_FILES.includes("rt.js") && SRC_FILES.includes("mappage.js") && SRC_FILES.includes("mapclient.js") && !SRC_FILES.includes("eagle.js") && !SRC_FILES.includes("canvasapp.js"),
  `the widened scan's population: ${SRC_FILES.length} src/*.js, the Map's own files included (the generated eagle.js and canvasapp.js retired)`);
const srcF = srcAudit(SOURCES);
ok(srcF.length === 0, `every src/*.js: Brand v2 colour tokens only, no Geist${srcF.length ? `\n      ${srcF.join("\n      ")}` : ""}`);
// (a2) the look pass (sprint 2): pages speak the SEMANTIC tokens (--page, --surface, --text, --line, --accent-*, --ok/--needs/
// --err/--stone), so each reads in Paper and in Ink. A colour literal lives only in the palette's home (shell.js) and U-chan's own
// vector (ui.js); a screen moved onto the shared parts (MIGRATED, the ratchet: it only grows) reads no --bv-* name at all
// (the Map, sprint 2: its page, its layout kit, its client and its inspector included).
const PALETTE_HOMES = new Set(["shell.js", "ui.js", "fontdata.js", "doorcontract.js"]);
const MIGRATED = ["home.js", "decisions.js", "login.js", "signup.js", "orgpage.js", "goals.js", "gtm.js", "holes.js", "build.js", "txpage.js", "versionsview.js", "broadcastpage.js", "controlpage.js", "mappage.js", "maplayout.js", "mapclient.js", "mapnode.js", "broadcastlive.js", "requestpage.js"];
function semanticAudit(sources) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  for (const [file, src] of Object.entries(sources)) {
    const code = jsCodeOf(src);
    if (!PALETTE_HOMES.has(file)) for (const m of code.matchAll(/(?<![&\w])#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g)) fail("semantic", `${file}: a raw colour (${m[0]}) in page CSS: name a semantic token (--page, --surface, --text, --accent, --ok ...)`);
    if (MIGRATED.includes(file)) for (const m of code.matchAll(/var\(--bv-[a-z0-9-]+\)/g)) fail("semantic", `${file}: ${m[0]} on a screen moved onto the semantic tokens`);
  }
  return f;
}
const semF = semanticAudit(SOURCES);
ok(semF.length === 0 && MIGRATED.every((f) => SOURCES[f]), `every page names the semantic tokens: no colour literal outside shell.js (the palette) and ui.js (U-chan's vector), and the screens on the shared parts (${MIGRATED.join(", ")}) read no --bv-* name${semF.length ? `\n      ${semF.join("\n      ")}` : ""}`);

// (b) the four state patterns, rendered inside the real shell
const STATES = {
  empty: emptyState("No projects yet. Add the first one below.", { action: { href: "/control", label: "Add a project" } }),
  loading: loadingState(),
  error: errorState({ what: "The activity list did not load.", why: "The ledger read timed out.", retryHref: "/audit" }),
  unreachable: unreachableState(),
};
const statesPage = (st) => shell({ ...PERSONAS.contributor, content: Object.values(st).join("\n"), brand, briefCount: 3, hasPack: true });
// stateAudit(renders, stateCss, page): each pattern holds its own law -> failures by check id
function stateAudit(st, css, page) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  for (const k of ["empty", "loading", "error", "unreachable"]) if (!new RegExp(`class="state state-${k}" data-state="${k}"`).test(st[k] || "")) fail("state", `${k}: not the shared pattern markup`);
  if (!/role="alert"/.test(st.error) || !/<svg\b/.test(st.error)) fail("state", "ERROR without role=alert and its icon (red is always beside an icon)");
  if (!/role="status"/.test(st.loading) || !/aria-live="polite"/.test(st.loading)) fail("state", "LOADING is not a polite live region");
  if (!/Saving is off/.test(st.unreachable) || !/because/.test(st.unreachable)) fail("state", "UNREACHABLE does not say that writes are off and why");
  if (!/class="state-action" href="\/control"/.test(st.empty)) fail("state", "EMPTY dropped its per-screen action");
  if (/state-action/.test(emptyState("x", { action: { href: "https://evil.example/", label: "Go" } }))) fail("state", "EMPTY linked off-site");
  // red (--err, --err-tint, --bv-error*) only in a .state-error rule or the ERROR state chip (UI-B5a); every other rule carries none
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/--bv-error|--err\b/.test(m[2]) && !m[1].split(",").every((sel) => /\.state-error\b|\[data-chip="ERROR"\]/.test(sel))) fail("state", `red outside ERROR: "${m[1].trim()}"`);
  // UNREACHABLE refuses a write BEFORE the press: the shell's guard is on the page
  if (!/querySelector\('\[data-state="unreachable"\]'\)\)document\.addEventListener\('submit'/.test(page)) fail("state", "no submit guard for UNREACHABLE in the shell");
  return f;
}
const sPage = statesPage(STATES);
const sAud = audit(sPage, "contributor", SRC), stAud = stateAudit(STATES, STATE_CSS, sPage);
ok(sAud.length === 0 && stAud.length === 0, `the four state patterns (EMPTY · LOADING · ERROR · UNREACHABLE) in the shell: tokens, no em dash, red only on ERROR beside its icon, UNREACHABLE blocks writes and says why${[...sAud, ...stAud].length ? `\n      ${[...sAud, ...stAud].join("\n      ")}` : ""}`);

// (c) the restyled shelled pages: /profile (a contributor), /docs and public /missing (anonymous), seated /missing
const person = { id: "p-c", name: "Rae Kim", role: "internal-eng", title: "Engineer" };
// the seated /missing reads a REAL project's knowledge: the Home fixture's D1 (alpha: an aim and the questions the owner owes)
const seatedHoles = await computeHoles(homeFixtureEnv({}).env, H_OWNER, { brand: { org: "Northwind" } });
const PAGE_RENDERS = {
  profile: ["contributor", () => renderProfilePage({ person, seats: [{ key: "alpha" }], consent: "traces", saved: true, brand, mandateFloor: "traces", secret: "wrong" })],
  docs: ["anonymous", () => renderDocs({ brand, domain: "https://northwind.example" })],
  holesPublic: ["anonymous", () => renderHoles(holesShape({ brand }), { brand })],
  holesSeated: ["contributor", () => renderHoles(seatedHoles, { brand })],
};
const shelled = {};
for (const [name, [persona, fn]] of Object.entries(PAGE_RENDERS)) {
  let html = "";
  try { html = shell({ ...PERSONAS[persona], active: name.startsWith("holes") ? "missing" : name, content: fn(), brand, briefCount: 3, hasPack: true }); }
  catch (e) { ok(false, `${name}: render throws: ${e && e.message}`); continue; }
  shelled[name] = html;
  const f = audit(html, persona, SRC);
  ok(f.length === 0, `${name} through shell(): every link and form a door, no em dash, no stray input, Brand v2 type${f.length ? `\n      ${f.join("\n      ")}` : ""}`);
}

// the restyle keeps every page-wording anchor the evals read (E211c E215b E217a/b · E208a E229 E246a · E194a2 E220b
// E249h E246b), so each E-check keeps its intent; E220b SKIPs on a manifest with no mandate, so this is its offline pin
const ANCHORS = {
  // the look pass: a seat's piece carries data-status (open | filed); the public shape never does (E217a/b read the same hook)
  // sprint 3 (B3): every call line is the call as it is filed, a knowledge write as its preview (the owner's ruling: every
  // filing is previewed first); a ruling stays rule_question
  // sprint 3 L3 (the revision): the public lines carry the standard as their expanded body ("A good fill"); the seat's first open
  // item is marked data-next (the "Fill next" heading is gone with the sentences); every call rides a Copy button's hidden code
  holesPublic: [["What is missing", "A good fill", "Sign in", "preview {"], ["Fill next", "data-status="]],
  holesSeated: [["data-next", 'data-status="open"', "preview {", "rule_question", 'data-region="meter"'], ["serve/", "frame slots filled", "Fill next"]],
  // the retired local agent's name is spelled as a regex (as E246a/b do), so this guard is not itself a mention
  docs: [["One secret", "Five calls", "/mcp", "Goal-setting SOP", "goalRef", "Connect your Claude"], [/Agent[ ]L/, "join --r"]],
  profile: [["set-consent", "monitors internal staff", "Change passphrase", "Rotate my key", "Your secrets"], [/Agent[ ]L/]],
};
// a never-entry is a string (substring) or a RegExp (tested); each hit is an "anchors:" finding
const anchorLeaks = (name, h) => (ANCHORS[name] || [[], []])[1].filter((x) => (x instanceof RegExp ? x.test(h) : h.includes(x))).map((x) => `anchors: ${name} must not carry ${String(x)}`);
for (const [name, [must]] of Object.entries(ANCHORS)) {
  const h = shelled[name] || "";
  const miss = must.filter((x) => !h.includes(x)), leak = anchorLeaks(name, h);
  ok(h && !miss.length && !leak.length, `${name}: the evals' wording anchors survive the restyle${miss.length ? ` (missing: ${miss.join(", ")})` : ""}${leak.length ? ` (${leak.join(", ")})` : ""}`);
}

// (c2) seated /missing with every piece open, from the REAL hole strings: computeHoles over two D1 projects (one with nothing
// filed; one with owed questions, an ungraded check and an open gap), then each open piece rendered as the Fill-next, its
// line and its call on the page. An em dash in any piece's line goes red here.
const holesEnvA = homeFixtureEnv({ empty: true, noGoal: true }), holesEnvB = homeFixtureEnv({ noGoal: true });
holesEnvB.sqlite.prepare("INSERT INTO k_checks (project,id,title,refs,created_by,created_at,updated_by,updated_at) VALUES ('alpha','AC.home.01','Home loads','[]','p-o',?,'p-o',?)").run("2026-09-30", "2026-09-30");
holesEnvB.sqlite.prepare("INSERT INTO k_nodes (project,id,type,name,status,data,created_by,created_at,updated_by,updated_at) VALUES ('alpha','gap:login','gap','No login screen yet','open','{}','p-o',?,'p-o',?)").run("2026-09-30", "2026-09-30");
const realA = await computeHoles(holesEnvA.env, H_OWNER, { brand: { org: "Northwind" } }), realB = await computeHoles(holesEnvB.env, H_OWNER, { brand: { org: "Northwind" } });
const realHoles = realB;
const escH = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const seatedWith = (hole) => shell({ ...PERSONAS.contributor, active: "missing", content: renderHoles({ ...realHoles, next: hole, items: [hole, ...realHoles.items.filter((x) => x.id !== hole.id)] }, { brand }), brand, briefCount: 3, hasPack: true });
const allReal = [...new Map([...realA.items, ...realB.items].map((h) => [h.piece, h])).values()];
const realBad = [];
let realLines = 0;
for (const h of allReal) {
  const html = seatedWith(h);
  if (html.includes(escH(h.what.replace(/\s*[\u2014\u2013]\s*/g, " - "))) && html.includes(escH(callText(h.fillPath)))) realLines++;
  const f = audit(html, "contributor", SRC);
  if (f.length) realBad.push(`${h.piece}: ${f.join("; ")}`);
}
// a filed title's em dash (a question, a check, a gap) never reaches the page: the voice law, drawn as " - "
const dashed = allReal.find((x) => x.piece === "gaps");
ok(dashed && !/\u2014/.test(seatedWith({ ...dashed, what: dashed.what + " \u2014 as filed" })) && /as filed/.test(seatedWith({ ...dashed, what: dashed.what + " \u2014 as filed" })), "a filed title's em dash is drawn as a plain dash on /missing");
// sprint 3 (B3): the checklist lists only the areas a project has, so a project with a check and a gap and no app shows the
// core's pieces and its grades; the areas it lacks (app, GTM, agents) sit apart, not as open pieces
ok(realLines === allReal.length && allReal.map((h) => h.piece).sort().join() === "aim,gaps,goals,grades,questions,start-here" && !realBad.length
  && realB.notApplicable.map((a) => a.area).join() === "app,gtm,agents" && realA.notApplicable.map((a) => a.area).join() === "app,proof,gtm,agents",
  `seated /missing with every piece open, each real Fill-next line and its call (${realLines}/${allReal.length}: ${allReal.map((h) => h.piece).join(", ")}): no em dash, the full audit clean${realBad.length ? `\n      ${realBad.join("\n      ")}` : ""}`);

// (d) the standalone pages: the sign-in (a served brand and the manifest-less fallback), the OAuth consent and
// error pages, the batch report. No second skin: each carries the shell's OWN token block, byte for byte.
function standaloneAudit(html, kind) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  if (!html.includes(BRAND_TOKENS_CSS)) fail("skin", `${kind}: does not carry the shell's own Brand v2 token block (a second skin)`);
  for (const m of html.matchAll(/--bv-([a-z0-9-]+):(#[0-9a-f]{6})\b/gi)) {
    const want = new RegExp(`--bv-${m[1]}:(#[0-9a-f]{6})\\b`, "i").exec(BRAND_TOKENS_CSS);
    if (!want || want[1].toUpperCase() !== m[2].toUpperCase()) fail("skin", `${kind}: --bv-${m[1]} is ${m[2]}, the shell's is ${want ? want[1] : "absent"}`);
  }
  if (/geist/i.test(html)) fail("type", `${kind}: Geist is still referenced`);
  fontFails(html, `${kind}: `, fail);
  if (/—|&mdash;|&#8212;|&#x2014;/i.test(html)) fail("emdash", `${kind}: an em dash ("${(/.{0,30}(?:—|&mdash;|&#8212;|&#x2014;).{0,30}/i.exec(html) || [""])[0]}")`);
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*transition:\s*none[^}]*animation:\s*none/.test(html)) fail("motion", `${kind}: no prefers-reduced-motion rule`);
  for (const m of html.matchAll(/<(input|textarea)\b[^>]*>/gi)) {
    const type = (attr(m[0], "type") || "text").toLowerCase();
    if (m[1].toLowerCase() === "input" && ["hidden", "submit", "button", "checkbox", "radio"].includes(type)) continue;
    if (attr(m[0], "data-input-exception") !== "auth") fail("input", `${kind}: ${m[0].slice(0, 60)} is not declared an auth input`);
  }
  if (/--bv-error-/.test(html.replace(/<style[\s\S]*?<\/style>/gi, "")) || (/class="state state-error"/.test(html) && !/class="state state-error"[^>]*>\s*<svg\b/.test(html))) fail("state", `${kind}: an ERROR without its icon`);
  return f;
}
// the front door names the product: title + wordmark say sharingu, the org is secondary text, never "Agent R"
function frontDoorAudit(html, kind, org) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || "";
  const wm = elementAt(html, html.indexOf('class="wordmark"'));
  if (!/\bsharingu\b/.test(title) || !/class="wm-product">sharingu</.test(wm.inner)) fail("front-door", `${kind}: the title "${title}" or the wordmark does not say sharingu`);
  if (/Agent R/.test(html)) fail("front-door", `${kind}: the retired "Agent R" product string is on the page`);
  if (org && !new RegExp(`class="wm-org">${org}<`).test(wm.inner)) fail("front-door", `${kind}: the org's name is not the wordmark's secondary text`);
  if (!org && /wm-org/.test(wm.inner)) fail("front-door", `${kind}: the manifest-less fallback repeats the product name as an org`);
  return f;
}
const servedBrand = { org: "Northwind", engine: "Agent R", productTitle: "Northwind · Agent R", loginTitle: "Sign in · Northwind · Agent R" };
const fallbackBrand = { org: "sharingu", engine: "Agent R", productTitle: "sharingu · Agent R", loginTitle: "Sign in · sharingu · Agent R" };
const STANDALONE = {
  login: [renderLogin({ brand: servedBrand, next: "/home" }), "Northwind"],
  loginRefused: [renderLogin({ brand: servedBrand, error: "That email and passphrase do not match." }), "Northwind"],
  loginFallback: [renderLogin({ brand: fallbackBrand }), ""],
  oauthConsent: [renderLogin({ brand: servedBrand, action: "", lede: "Claude is asking to connect.", hidden: [{ name: "oauth_req", value: "e30=" }], submit: "Sign in and connect", footnote: "scope" }), "Northwind"],
  oauthError: [authPage({ ...authBrand(servedBrand), banner: errorState({ what: "That connection request is not valid." }) }), "Northwind"],
  // sprint 7, 7.2: the sign-up's pages are the front door's own (one card, the shell's tokens, declared inputs)
  signup: [renderSignup({ brand: servedBrand }), "Northwind"],
  signupRefused: [renderSignup({ brand: servedBrand, error: SIGNUP_REFUSED_WORDS, email: "a@b.test" }), "Northwind"],
  // sprint 21, 21.1: request access and the request's own pages are the front door's own too
  requestAccess: [renderRequestAccess({ brand: servedBrand }), "Northwind"],
  requestAccessRefused: [renderRequestAccess({ brand: servedBrand, error: REQUEST_FIELD_WORDS.email, values: { name: "Ada", email: "ada" } }), "Northwind"],
  requestInLine: [renderRequestReceived({ brand: servedBrand, request: { name: "Ada", company: "Analytical", status: "open" }, place: 3, count: { taken: 7, cap: 50 } }), "Northwind"],
  requestApproved: [renderRequestReceived({ brand: servedBrand, request: { name: "Ada", company: "Analytical", status: "approved" } }), "Northwind"],
  requestDeclined: [renderRequestReceived({ brand: servedBrand, request: { name: "Ada", company: "Analytical", status: "declined" } }), "Northwind"],
  requestAsked: [renderRequestAsked({ brand: servedBrand, count: { taken: 7, cap: 50 } }), "Northwind"],
  requestMissing: [renderRequestMissing({ brand: servedBrand }), "Northwind"],
  // sprint 7, 7.3: the create-an-org pages: the platform's (the product's wordmark alone), and the made page the new org's
  orgNew: [renderOrgNew({ host: "agent.example.test" }), ""],
  // sprint 21, 21.2: the org form a web sign-up answers, filled in from the approved request
  orgNewPrefilled: [renderOrgNew({ host: "agent.example.test", values: { email: "a@b.test", name: "Analytical", you: "Ada" } }), ""],
  orgNewRefused: [renderOrgNew({ host: "agent.example.test", error: ORG_WORDS.org_name_taken, values: { email: "a@b.test", name: "Acme", slug: "acme" } }), ""],
  orgMade: [renderOrgMade({ origin: "https://agent.example.test", made: { org: { id: 3, name: "Acme", slug: "acme" }, project: { key: "o3--acme", name: "Acme" }, key: "0123456789abcdef0123456789abcdef01234567" } }), "Acme"],
  report: [renderReportShell("Backfilled Reports", "<h1>Backfilled</h1>"), null],
};
for (const [kind, [html, org]] of Object.entries(STANDALONE)) {
  const f = [...standaloneAudit(html, kind), ...(org === null ? [] : frontDoorAudit(html, kind, org))];
  ok(f.length === 0, `${kind} (standalone): the shell's own token block and faces, no em dash, reduced motion, declared inputs${org === null ? "" : ", the sharingu wordmark with the org as secondary text, no Agent R"}${f.length ? `\n      ${f.join("\n      ")}` : ""}`);
}
ok(/name="email"/.test(STANDALONE.signup[0]) && /name="code"/.test(STANDALONE.signup[0]) && /name="password"/.test(STANDALONE.signup[0]) && /name="confirm"/.test(STANDALONE.signup[0]) && /action="\/signup"/.test(STANDALONE.signup[0]),
  "the sign-up keeps its fields (email · code · password · confirm, posting to /signup) (sprint 7, 7.2)");
ok(["email", "password", "name", "slug", "project", "you"].every((f) => new RegExp(`name="${f}"`).test(STANDALONE.orgNew[0])) && /action="\/orgs"/.test(STANDALONE.orgNew[0]) && /agent\.example\.test\//.test(STANDALONE.orgNew[0])
  && !/<form/.test(STANDALONE.orgMade[0]) && /data-secret="owner-key">0123456789abcdef/.test(STANDALONE.orgMade[0]) && /data-region="first-project">Acme \(acme\)</.test(STANDALONE.orgMade[0]) && !/o3--/.test(STANDALONE.orgMade[0]) && /\/mcp/.test(STANDALONE.orgMade[0])
  && !/value="[^"]*passphrase/i.test(STANDALONE.orgNewRefused[0])
  && /id="name"[^>]*value="Analytical"/.test(STANDALONE.orgNewPrefilled[0]) && /id="you"[^>]*value="Ada"/.test(STANDALONE.orgNewPrefilled[0]) && /id="password"[^>]*autofocus/.test(STANDALONE.orgNewPrefilled[0]),
  "the create-an-org page keeps its fields (email · password · name · slug under the address's host · project · you, posting to /orgs); the made page shows the owner key, the first project (its name and slug, never o3--) and the MCP address, no form; a web sign-up's answer holds the request's company and name, the passphrase focused (sprint 7, 7.3; sprint 21, 21.2)");
ok(/name="email"/.test(STANDALONE.login[0]) && /name="password"/.test(STANDALONE.login[0]) && /name="web" value="1"/.test(STANDALONE.login[0]) && /name="next" value="\/home"/.test(STANDALONE.login[0]) && /name="oauth_req" value="e30="/.test(STANDALONE.oauthConsent[0]),
  "the sign-in keeps its fields (email · password · web=1 · next; the consent page's oauth_req): E233b and the OAuth flow read them");

// (e) both ways for (a) to (d): each injected defect goes red on its own check
const srcMut = (file, from, to) => { const src = SOURCES[file] || ""; return src.includes(from) ? { ...SOURCES, [file]: src.replace(from, to) } : null; };
const B1B = [
  ["type", "Geist in login.js", () => srcAudit(srcMut("login.js", ".auth{width:100%;max-width:392px}", ".auth{width:100%;max-width:392px;font-family:'Geist'}") || {})],
  ["colour", "stamp purple #6B4FA8 in rt.js", () => srcAudit(srcMut("rt.js", "--stamp:var(--bv-verified-ink)", "--stamp:#6B4FA8") || {})],
  ["colour", "stamp purple #6B4FA8 in profile.js", () => srcAudit(srcMut("profile.js", "background:var(--ok-tint);color:var(--ok);font:500 13px/1.3 var(--sans)}", "background:#6B4FA8;color:var(--ok);font:500 13px/1.3 var(--sans)}") || {})],
  ["colour", "a black rgba shadow in home.js", () => srcAudit(srcMut("home.js", ".hm{display:block}", ".hm{display:block;box-shadow:0 20px 60px rgba(0,0,0,.35)}") || {})],
  ["semantic", "a token value typed as a hex in home.js (#1C1917: a Brand v2 value, still not a semantic token)", () => semanticAudit(srcMut("home.js", ".hm{display:block}", ".hm{display:block;color:#1C1917}") || {})],
  ["semantic", "a --bv-* name back on Decisions (a migrated screen)", () => semanticAudit(srcMut("decisions.js", ".dq{display:block}", ".dq{display:block;color:var(--bv-dark-text)}") || {})],
  ["semantic", "an ink rgba back in archview.js (a page off the migrated list still names no raw colour)", () => semanticAudit(srcMut("archview.js", "box-shadow:var(--shadow-pop)}", "box-shadow:0 4px 14px rgba(28,25,23,.18)}") || {})],
  ["colour", "a named colour in docs.js", () => srcAudit(srcMut("docs.js", ".docs-page b{color:var(--bv-dark-text)}", ".docs-page b{color:white}") || {})],
  ["colour", "a colour behind a '/*' inside a string (the old regex stripper swallowed it)", () => srcAudit({ "x.js": 'const g = "src/*.js";\nconst c = `a{color:#123456}`;\n// */' })],
  ["state", "ERROR without its icon", () => stateAudit({ ...STATES, error: STATES.error.replace(/<svg[\s\S]*?<\/svg>/, "") }, STATE_CSS, sPage)],
  ["state", "red on UNREACHABLE", () => stateAudit(STATES, STATE_CSS.replace(".state-unreachable svg,.state-unreachable .state-what{color:var(--needs)}", ".state-unreachable svg,.state-unreachable .state-what{color:var(--err)}"), sPage)],
  ["state", "UNREACHABLE without the write guard", () => stateAudit(STATES, STATE_CSS, sPage.replace("document.querySelector('[data-state=\"unreachable\"]')", "false"))],
  ["emdash", "an em dash in a state pattern's copy", () => audit(statesPage({ ...STATES, loading: loadingState("Reading the ledger — one moment.") }), "contributor", SRC)],
  ["emdash", "an em dash on /missing", () => audit((shelled.holesPublic || "").replace("A good fill", "A good &mdash; fill"), "anonymous", SRC)],
  ["emdash", "an em dash in the seated /missing page's own copy", () => { const h = allReal.find((x) => x.piece === "aim"); const page = h ? seatedWith(h) : ""; return page.includes("<h1>What is missing</h1>") ? audit(page.replace("<h1>What is missing</h1>", "<h1>What is missing \u2014 now</h1>"), "contributor", SRC) : []; }],
  ["anchors", "the retired local agent's name injected into /docs", () => anchorLeaks("docs", (shelled.docs || "") + `<p>${"Agent" + " L"} runs here</p>`)],
  ["input", "a profile passphrase input without its auth declaration", () => audit((shelled.profile || "").replace('name="current" required autocomplete="current-password" data-input-exception="auth"', 'name="current" required autocomplete="current-password"'), "contributor", SRC)],
  ["skin", "the sign-in with a second palette (orange drifted)", () => standaloneAudit(STANDALONE.login[0].replace("--bv-orange:#FB923C", "--bv-orange:#FB923D"), "login")],
  ["type", "Geist back on the sign-in", () => standaloneAudit(STANDALONE.login[0].replace("font-family:'Manrope'", "font-family:'Geist'"), "login")],
  ["type", "a Google font back on the sign-in", () => standaloneAudit(STANDALONE.login[0].replace("</head>", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope"></head>'), "login")],
  ["input", "a sign-in input without its auth declaration", () => standaloneAudit(STANDALONE.login[0].replace(' data-input-exception="auth"', ""), "login")],
  ["emdash", "an em dash on the report", () => standaloneAudit(STANDALONE.report[0].replace("<h1>Backfilled</h1>", "<h1>Backfilled — today</h1>"), "report")],
  ["front-door", "the live defect: an 'Org · Agent R' wordmark", () => frontDoorAudit(STANDALONE.login[0].replace(/<p class="wordmark">[\s\S]*?<\/p>/, '<p class="wordmark">Northwind &middot; Agent R</p>'), "login", "Northwind")],
  ["front-door", "the live defect: a loginTitle with Agent R", () => frontDoorAudit(STANDALONE.login[0].replace(/<title>[^<]*<\/title>/, "<title>Sign in · Northwind · Agent R</title>"), "login", "Northwind")],
  ["front-door", "the fallback repeating sharingu as the org", () => frontDoorAudit(STANDALONE.loginFallback[0].replace('<span class="wm-product">sharingu</span>', '<span class="wm-product">sharingu</span> <span class="wm-org">sharingu</span>'), "loginFallback", "")],
];
for (const [id, label, run] of B1B) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? "" : " (nothing went red: the injection did not apply or the check is blind)"}`);
}
// no file is excepted by name: the Map's own files (the page, the kit, the client) are in the scan and clean
ok(["mappage.js", "maplayout.js", "mapclient.js"].every((f) => (SOURCES[f] || "").length > 5000) && srcAudit(SOURCES).length === 0,
  "the Map's page, layout kit and client are inside the scan and clean, and so is every other src/*.js");

// ---- 4. UI-B2: the Decisions screen (wf-decisions) and the QuestionCard (wf-question) ----
const SCREEN = (id) => (WF.screens || []).find((x) => x.id === id);
const WFD = SCREEN("wf-decisions"), WFQ = SCREEN("wf-question");
ok(!!(WFD && WFQ) && WFD.regions.length === 3 && WFD.buttons.length === 6 && WFQ.regions.length === 5 && WFQ.buttons.length === 7,
  `the pinned wireframe's wf-decisions (${WFD ? `${WFD.regions.length} regions, ${WFD.buttons.length} buttons` : "absent"}) and wf-question (${WFQ ? `${WFQ.regions.length} regions, ${WFQ.buttons.length} buttons` : "absent"})`);
// the call a counter is filed with: the wireframe's wires.counters.mcp up to its parenthesised note, verbatim (QB953462F)
const wfCall = (x) => String((((x || {}).wires || {}).counters || {}).mcp || "").split(" (")[0];
ok(wfCall(WFD) === COUNTER_CALL && wfCall(WFQ) === COUNTER_CALL && /gapRefs: \["q\/<qid>"\]/.test(COUNTER_CALL) && !/parent/.test(COUNTER_CALL),
  `the card's counterCall is the pinned wireframe's call, verbatim: ${COUNTER_CALL}`);
// pinsOf(html): the elements carrying a class whose rule draws the pinned note (var(--shadow-pin), the look pass's one
// token for it, or the legacy var(--bv-shadow-pin-ink)), plus any inline use
function pinsOf(html) {
  const cls = new Set();
  for (const st of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    for (const m of st[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/var\(--(?:bv-)?shadow-pin(?:-ink)?\)/.test(m[2])) for (const c of m[1].matchAll(/\.([a-z0-9_-]+)/gi)) cls.add(c[1]);
  const els = [];
  for (const m of html.replace(/<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>/gi, "").matchAll(/<[a-z][^>]*>/gi)) {
    const c = (attr(m[0], "class") || "").split(/\s+/);
    if (c.some((x) => cls.has(x)) || /--(?:bv-)?shadow-pin/.test(attr(m[0], "style") || "")) els.push(m[0]);
  }
  return els;
}
// screenAudit(html, spec, want) -> failures by check id (html: the whole shelled page)
function screenAudit(html, spec, want) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  for (const r of spec.regions) {
    const el = regionOf(html, r);
    if (!el) fail("region", `${spec.id} ${r} missing`); else if (!nonEmpty(el)) fail("region", `${spec.id} ${r} is empty`);
  }
  for (const b of spec.buttons) {
    const tags = [...html.matchAll(new RegExp(`<[^>]*\\sdata-button="${b}"[^>]*>`, "g"))].map((m) => m[0]);
    if (!tags.length) { fail("door", `${spec.id} button ${b} not rendered`); continue; }
    const w = (spec.wires || {})[b] || {};
    for (const t of tags) {
      const door = attr(t, "data-door");
      if (w.door && door !== w.door) fail("door", `${spec.id} button ${b} carries door "${door}", the wireframe wires "${w.door}"`);
      if (!w.door && (door || !/\sdata-client="/.test(t))) fail("door", `${spec.id} button ${b} is client-side in the wireframe, it carries ${door ? `door "${door}"` : "no data-client"}`);
    }
  }
  for (const d of spec.doors || []) if (!inDoor(d.m, d.path)) fail("door", `${spec.id} wireframe door ${d.m} ${d.path} is not in contracts/door.json`);
  for (const m of html.matchAll(/<[^>]*\sdata-door="([^"]*)"[^>]*>/g)) { const [meth, path] = m[1].split(" "); if (!inDoor(meth, path) && !/\sdata-client="/.test(m[0])) fail("door", `${m[1]} is not in contracts/door.json and not marked client-side`); }
  const B = baseOf(html);
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) { const meth = (attr(m[0], "method") || "GET").toUpperCase(), act = attr(m[0], "action") || ""; if (!inDoor(meth, unbase(B, act.split("?")[0]))) fail("door", `form ${meth} ${act} is not in contracts/door.json`); }
  for (const m of html.matchAll(/<a\b[^>]*\shref="(\/[^"#]*)"/gi)) { const path = unbase(B, m[1].replace(/&amp;/g, "&").split("?")[0]); if (!inDoor("GET", path)) fail("door", `link ${m[1]} is not a GET door in contracts/door.json`); }
  for (const m of html.matchAll(/<(input|textarea|select)\b[^>]*>/gi)) {
    const type = (attr(m[0], "type") || "text").toLowerCase();
    if (m[1].toLowerCase() === "input" && ["hidden", "submit", "button", "radio"].includes(type)) continue;
    if (attr(m[0], "data-input-exception") === "search") continue;   // the top bar's own search (the shell's declared exception)
    fail("input", `${spec.id}: ${m[0].slice(0, 60)} is a typed input (a person only chooses, Q1E8D4C9C)`);
  }
  const pins = pinsOf(html);
  if (pins.length !== want.pins) fail("pin", `${spec.id}: ${pins.length} pin-ink note(s), want ${want.pins}`);
  if (want.pinRegion && pins.length === 1 && attr(pins[0], "data-region") !== want.pinRegion) fail("pin", `${spec.id}: the pin-ink note is not ${want.pinRegion}`);
  if (/—|&mdash;|&#8212;|&#x2014;/i.test(html)) fail("emdash", `${spec.id}: an em dash ("${(/.{0,30}(?:—|&mdash;|&#8212;|&#x2014;).{0,30}/i.exec(html) || [""])[0]}")`);
  if (want.call && !html.includes(esc4(want.call))) fail("call", `${spec.id}: the counters region does not show the exact call`);
  return f;
}
const esc4 = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const B2_READER = PERSONAS.contributor.reader;
const b2page = (active, content) => shell({ ...PERSONAS.contributor, active, content, brand, briefCount: 3, hasPack: true });
const dRead = await readDecisions(fixtureEnv(), B2_READER, {});
const qRead = await readQuestion(fixtureEnv(), B2_READER, OPEN_QID, {});
const B2 = {
  decisions: b2page("decisions", renderDecisionsPage(dRead)),
  question: b2page("question", renderQuestionPage(qRead)),
};
// sprint 3 L2 (the revision, ADOPTION.md): Decisions' side column (who owes · rulings in code) is gone ("You" is the Open tile's
// sub and the Owed-by filter, "in code" rides the expanded row), and no counter call is on the list (it rides What is missing):
// the screen is held to wf-decisions' regions less who-owes, its six buttons, no call
const WFD_L2 = WFD ? { ...WFD, regions: WFD.regions.filter((r) => r !== "who-owes") } : WFD;
// sprint 3 L3 (the revision on the detail pages): the question's options are cards side by side, each ITS OWN POST /respond
// form whose press records it (data-option on the form; the radio choice option-a/b/c is gone with the one form), the why is a
// card (no pin-ink note) and the counter call is off the page (pristine copy: What is missing carries the calls)
const WFQ_L3 = WFQ ? { ...WFQ, buttons: WFQ.buttons.filter((b) => !/^option-[a-z]$/.test(b)) } : WFQ;
const WANT = { decisions: [WFD_L2, { pins: 0, call: null }], question: [WFQ_L3, { pins: 0, call: null }] };
const noCounterCall = (html) => (html.includes(esc4('kind: "counter"')) ? ["call: the counter call is printed on the question page (pristine copy)"] : []);
for (const [name, html] of Object.entries(B2)) {
  const [spec, want] = WANT[name];
  const f = [...screenAudit(html, spec, want), ...audit(html, "contributor", SRC), ...noCounterCall(html)];
  ok(f.length === 0, `${name} (${spec.artboard}): every region non-empty, every button on its own door, every door in door.json, no typed input, ${want.pins} pin-ink note${want.pinRegion ? ` (${want.pinRegion})` : ""}, no counter call printed, and the shell's own audit${f.length ? `\n      ${f.join("\n      ")}` : ""}`);
}
ok(dRead.rows.length === 4 && dRead.counts.open === 2 && dRead.counts.countered === 1 && dRead.counts.pending === 1 && dRead.counts.superseded === 1 && qRead.live.inRound && qRead.live.counters.length === 1 && qRead.live.answers[0].provisional,
  `the fixture read: ${dRead.rows.length} rows, ${dRead.counts.open} open, ${dRead.counts.countered} countered, the card's live overlay (in the round, 1 counter, a provisional answer)`);
// UI-B3a F2 — who owes it, ONE definition (owedBy): "Open: yours" and the who-owes "You" are the same count, over open rows
// only. The fixture: two open rows owed by the owner (one carries only a provisional answer, so it still owes), one decided
// row owed by build (not open: owes nothing), one superseded with no owner. The owner sees 2 and 2; anyone else 0 and 0,
// the two owner rows counted as elsewhere; code is 0 because the build row is decided.
const OWNER_R = PERSONAS.owner.reader;
const dOwn = await readDecisions(fixtureEnv(), OWNER_R, {});
const htmlOwn = renderDecisionsPage(dOwn), htmlOther = renderDecisionsPage(dRead);
const metricYours = (h) => (/data-metric="yours" data-value="(\d+)"/.exec(h) || [])[1];
const asideYou = (h) => (/data-owe="you" data-value="(\d+)"/.exec(h) || [])[1];
ok(dOwn.counts.yours === 2 && dOwn.whoOwes.you === 2 && dOwn.whoOwes.code === 0 && dOwn.whoOwes.elsewhere === 0 && metricYours(htmlOwn) === "2" && asideYou(htmlOwn) === "2",
  `F2 owner: Open: yours ${metricYours(htmlOwn)} == You ${asideYou(htmlOwn)} == 2 (whoOwes ${JSON.stringify(dOwn.whoOwes)}, over open rows only)`);
ok(dRead.counts.yours === 0 && dRead.whoOwes.you === 0 && dRead.whoOwes.elsewhere === 2 && metricYours(htmlOther) === "0" && asideYou(htmlOther) === "0",
  `F2 non-owner: Open: yours ${metricYours(htmlOther)} == You ${asideYou(htmlOther)} == 0, the owner rows elsewhere (${JSON.stringify(dRead.whoOwes)})`);
ok(owedBy({ status: "open", whoOwes: null, waitingOn: "a member" }, OWNER_R, null) === "elsewhere"
  && owedBy({ status: "open", whoOwes: "code" }, OWNER_R, { answers: [{ provisional: false }] }) === "you"
  && owedBy({ status: "open", whoOwes: "owner" }, PERSONAS.contributor.reader, { answers: [{ provisional: false }] }) === "elsewhere"
  && owedBy({ status: "open", whoOwes: "code" }, OWNER_R, { answers: [], ruled: { option: 0 } }) === "you"
  && owedBy({ status: "open", whoOwes: "code" }, PERSONAS.contributor.reader, { answers: [], ruled: { option: 0 } }) === "elsewhere"
  && owedBy({ status: "open", whoOwes: "owner" }, OWNER_R, { answers: [{ provisional: true }] }) === "you"
  && owedBy({ status: "decided", whoOwes: "owner" }, OWNER_R, null) === null && owedBy({ status: "open", whoOwes: "Build" }, null, null) === "code"
  && owedBy({ status: "open" }, OWNER_R, null) === null,
  "F2 owedBy: a waitingOn is elsewhere, an answer waiting is the owner's to rule (you for the owner, elsewhere for anyone else), an approved answer whose ruling did not apply (the row still open) is still the owner's to rule, a provisional one still owes, a ruled row owes nothing, build is code, nobody named is null");
// the states (QE9178667 · Q47C9CCD3): EMPTY per screen, ERROR on an unreadable pack, UNREACHABLE when the live read fails
const listOf = (html) => (regionOf(html, "question-list") || { inner: "" }).inner;
const dEmpty = b2page("decisions", renderDecisionsPage(await readDecisions(fixtureEnv({ empty: true }), B2_READER, {})));
const dNoMatch = b2page("decisions", renderDecisionsPage(await readDecisions(fixtureEnv(), B2_READER, { area: "nowhere" })));
const qEmpty = b2page("question", renderQuestionPage(await readQuestion(fixtureEnv({ empty: true }), B2_READER, OPEN_QID, {})));
const dError = b2page("decisions", renderDecisionsPage(await readDecisions(fixtureEnv({ rowsThrow: true }), B2_READER, {})));
const dDown = b2page("decisions", renderDecisionsPage(await readDecisions(fixtureEnv({ overlayThrows: true }), B2_READER, {})));
const qDown = b2page("question", renderQuestionPage(await readQuestion(fixtureEnv({ overlayThrows: true }), B2_READER, OPEN_QID, {})));
// sprint 3 L2 (pristine copy): the EMPTY is a phrase and one button to What is missing, never the call
const emptyOk = (h) => /data-state="empty"/.test(listOf(h)) && !/\bpreview\b/.test(listOf(h)) && /href="\/missing"/.test(listOf(h));
const guard = /querySelector\('\[data-state="unreachable"\]'\)\)document\.addEventListener\('submit'/;
const downOk = (h) => /<div class="state state-unreachable" data-state="unreachable"/.test(h.replace(/<template[\s\S]*?<\/template>/g, "")) && guard.test(h) && /form method="POST"/.test(h);
ok(emptyOk(dEmpty) && /data-state="empty"/.test(listOf(dNoMatch)) && /Nothing matches/.test(dNoMatch) && /data-state="empty"/.test(qEmpty),
  "EMPTY: no question filed puts the Decisions screen's own phrase in question-list with What is missing (pristine copy: the call is not on the screen) (and the card its own); a filter with no match says so with the way back");
ok(/class="state state-error" data-state="error" role="alert"><svg/.test(dError) && !/data-region="question-list"/.test(dError), "ERROR: a failed questions read is the ERROR pattern (icon, alert), never an empty list that looks true");
ok(downOk(dDown) && downOk(qDown) && /<template id="dq-offline"><div class="state state-unreachable"/.test(B2.question),
  "UNREACHABLE: a failed live read shows the pattern and the shell refuses every POST before the press; an offline browser gets the same block (the template the page keeps ready)");
for (const [k, h] of Object.entries({ dEmpty, dNoMatch, qEmpty, dError, dDown, qDown })) { const e = audit(h, "contributor", SRC); ok(e.length === 0, `${k}: the shell's own audit holds on the state render${e.length ? `\n      ${e.join("\n      ")}` : ""}`); }
// the product's name on the authed shell (QE7ACBBA8): "<org> · sharingu" in the title and the wordmark, never Agent R
function nameAudit(html, org) {
  const f = []; const t = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || "";
  const mark = (/<a\b[^>]*\sdata-region="mark"[^>]*>/.exec(html) || [""])[0];
  const want = org ? `${org} · sharingu` : "sharingu";
  if (t !== want) f.push(`name: the title is "${t}", want "${want}"`);
  if (attr(mark, "title") !== want || attr(mark, "aria-label") !== want) f.push(`name: the wordmark says "${attr(mark, "title")}" / "${attr(mark, "aria-label")}", want "${want}"`);
  if (/Agent R/.test(t + mark)) f.push("name: Agent R on the title or the wordmark");
  return f;
}
const named = { contributor: [pages.contributor, "Northwind"], owner: [pages.owner, "Northwind"], anonymous: [pages.anonymous, ""], decisions: [B2.decisions, "Northwind"],
  fallback: [shell({ ...PERSONAS.contributor, content, brand: { org: "sharingu", engine: "Agent R", productTitle: "sharingu · Agent R" } }), ""] };
for (const [k, [h, org]] of Object.entries(named)) { const e = nameAudit(h || "", org); ok(h && e.length === 0, `${k}: the page is named "${org ? `${org} · ` : ""}sharingu" (title and wordmark), not the manifest's productTitle${e.length ? `\n      ${e.join("\n      ")}` : ""}`); }
// both ways: each injected defect goes red on its own check
const B2MUT = [
  ["region", "a dropped region (question-list)", () => screenAudit(B2.decisions.replace('data-region="question-list"', 'data-x="question-list"'), WFD_L2, WANT.decisions[1])],
  ["region", "a dropped region (the card's counters)", () => screenAudit(B2.question.replace('data-region="counters"', 'data-x="counters"'), WFQ_L3, WANT.question[1])],
  ["region", "an emptied region (why)", () => screenAudit(B2.question.replace(/ aria-label="Why" (data-region="why">)[\s\S]*?(<\/section>)/, " $1$2"), WFQ_L3, WANT.question[1])],
  ["door", "an undeclared door (POST /rounds)", () => screenAudit(B2.decisions.replace('data-button="export-round" data-door="POST /round"', 'data-button="export-round" data-door="POST /rounds"'), WFD_L2, WANT.decisions[1])],
  ["door", "a button on another door than its wire (record-ruling on POST /round)", () => screenAudit(B2.question.replace('data-button="record-ruling" data-door="POST /respond"', 'data-button="record-ruling" data-door="POST /round"'), WFQ_L3, WANT.question[1])],
  ["door", "an undeclared card door (GET /questions/:qid)", () => screenAudit(B2.question.replace('data-door="GET /question/:qid"', 'data-door="GET /questions/:qid"'), WFQ_L3, WANT.question[1])],
  ["input", "a textarea on the card", () => screenAudit(B2.question.replace('<div class="p-opts"', '<textarea name="answer"></textarea><div class="p-opts"'), WFQ_L3, WANT.question[1])],
  ["input", "a text input on Decisions", () => screenAudit(B2.decisions.replace('<nav class="p-filter"', '<input type="text" name="q"><nav class="p-filter"'), WFD_L2, WANT.decisions[1])],
  ["pin", "a pin on the card (provenance)", () => screenAudit(B2.question.replace('class="p-card p-facts" data-region="provenance"', 'class="p-card p-facts" style="box-shadow:var(--shadow-pin)" data-region="provenance"'), WFQ_L3, WANT.question[1])],
  ["pin", "a pin on Decisions", () => screenAudit(B2.decisions.replace('<section class="p-card p-tiles" data-region="metrics"', '<section class="p-card p-tiles" style="box-shadow:var(--shadow-pin)" data-region="metrics"'), WFD_L2, WANT.decisions[1])],
  ["call", "the counter call back on the question page", () => noCounterCall(B2.question.replace('data-region="counters">', `data-region="counters"><code>${esc4(COUNTER_CALL)}</code>`))],
  ["emdash", "an em dash from the filed text", () => screenAudit(B2.question.replace("How does a counter", "How — does a counter"), WFQ_L3, WANT.question[1])],
  ["empty", "no question filed and no EMPTY rendered", () => (emptyOk(dEmpty.replace('data-state="empty"', 'data-state="x"')) ? [] : ["empty: no EMPTY in question-list"])],
  ["unreachable", "a failed live read without the UNREACHABLE block", () => (downOk(dDown.replace('<div class="state state-unreachable" data-state="unreachable"', '<div class="state"')) ? [] : ["unreachable: no block"])],
  ["name", "the manifest's productTitle back as the title", () => nameAudit(B2.decisions.replace(/<title>[^<]*<\/title>/, "<title>Northwind · Agent R</title>"), "Northwind")],
  ["name", "Agent R on the wordmark", () => nameAudit(B2.decisions.replace(/(<a\b[^>]*?)title="[^"]*"([^>]*\sdata-region="mark")/, '$1title="Northwind · Agent R"$2'), "Northwind")],
];
ok(screenAudit(B2.decisions, WFD_L2, WANT.decisions[1]).length === 0 && screenAudit(B2.question, WFQ_L3, WANT.question[1]).length === 0 && noCounterCall(B2.question).length === 0, "both ways: the clean Decisions and card renders are green before any injection");
for (const [id, label, run] of B2MUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? "" : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

// ---- 5. UI-B3: Home (wf-home) ----
const WFH = SCREEN("wf-home");
ok(!!WFH && WFH.regions.length === 6 && WFH.buttons.length === 8 && JSON.stringify(WFH.regions) === JSON.stringify(HOME_REGIONS),
  `the pinned wireframe's wf-home: ${WFH ? `${WFH.regions.length} regions [${WFH.regions.join(" ")}], ${WFH.buttons.length} buttons` : "absent"}; src/home.js draws the same six, in order`);
// the two counter calls, verbatim from wf-home wires.counters.mcp (a question by gapRefs, a filing by parent, QB953462F); sprint 3
// L2 (pristine copy): neither is drawn on Home any more (they ride What is missing), the pinned wireframe still names them
const wfHomeCalls = String((((WFH || {}).wires || {}).counters || {}).mcp || "").match(/preview \{items: \[\{contribution: \{[^}]*\}\}\]\}, then file/g) || [];
ok(wfHomeCalls.length === 2 && wfHomeCalls[0] === COUNTER_CALL && wfHomeCalls[1] === PARENT_COUNTER_CALL,
  `Home's two counter calls are the wireframe's, verbatim: [${wfHomeCalls.join(" | ")}]`);
const homePage = (persona, sum, o = {}) => shell({ ...PERSONAS[persona], active: "home", content: renderHome(sum, { owner: persona === "owner", brand, ...o }), brand, briefCount: 3, hasPack: true });
const regionAt = (html, r) => html.indexOf(`data-region="${r}"`);
const needsRowsOf = (html) => (regionOf(html, "needs-you") || { inner: "" }).inner.match(/<li\b[^>]*\sdata-kind="[a-z]+"[\s\S]*?<\/li>/g) || [];
// homeAudit(html, persona) -> failures by check id: the screen audit (regions, buttons, doors, inputs, pins, em dash),
// both counter calls, the artboard order, one kind chip per row, and Home's bar (no "Your thread" view, no view bar)
// sprint 3 L2 (the revision): the regions in the revision's reading order (the head, the glance, the cards; the reader's hats pick
// the card that leads), each present and non-empty, the order not pinned; no call on the page (it rides What is missing); and no
// call of any kind leaks back (the counter popover is gone)
function homeAudit(html, persona, src = SRC, o = {}) {
  const f = screenAudit(html, WFH, { pins: 0, call: null });
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const main = html.replace(/<template[\s\S]*?<\/template>|<script[\s\S]*?<\/script>/g, "");
  if (main.includes(esc4(PARENT_COUNTER_CALL)) || main.includes(esc4(COUNTER_CALL)) || /preview \{/.test(main)) fail("call", "wf-home: a raw call is back on Home (pristine copy: it rides What is missing)");
  const rows = needsRowsOf(html);
  // UI-B5a: ONE state chip per row, counted by data-chip, and it names the row's kind (decide DECIDE · approve APPROVE · grant GRANT)
  const KIND_CHIP = { decide: "DECIDE", approve: "APPROVE", grant: "GRANT" };
  const bad = rows.filter((r) => { const c = [...r.matchAll(/data-chip="([^"]*)"/g)].map((m) => m[1]); const k = (/data-kind="([a-z]+)"/.exec(r) || [])[1]; return c.length !== 1 || c[0] !== KIND_CHIP[k]; });
  if (bad.length) fail("chip", `wf-home: ${bad.length} needs-you row(s) without exactly one kind chip naming its kind`);
  if (hasViewBar(html) || />Your thread</.test((regionOf(html, "tabs") || { inner: "" }).inner + viewBarOf(html))) fail("bar", "Home carries a view bar (Your thread is back)");
  const homeRow = (/\{ key: "home", label: "Home", icon: "home",\s*views: \[([^\]]*)\]/.exec(src) || [])[1];
  if (homeRow == null) fail("bar", "shell.js TABS carries no Home row");
  else if (/"\/thread"|Your thread/.test(homeRow)) fail("bar", "shell.js TABS: the Home tab carries the Your thread view again");
  if (/<textarea\b/i.test(html)) fail("input", "wf-home: a textarea on Home");
  return [...f, ...audit(html, persona, src)];
}
const hFullEnv = homeFixtureEnv({ measure: true, filed: true });
// the request memo the worker installs on every request (src/reqmemo.js): the open questions are read once and shared by the
// decide rows, the checklist and the owner's owed set, as on the real handler (tools/d1-hot-selftest.mjs G4)
(await import("../src/reqmemo.js")).installReqMemo(hFullEnv.env);
const hFull = await readHomeSummary(hFullEnv.env, H_OWNER, {});
// the org row (src/tenant.js ORG_SQL) is read once a minute per isolate, never per page: a cold fixture reads it, so it is left out
const notOrg = (list) => list.filter((q) => q !== org1(ORG_SQL));   // as org 1's request runs it (src/data.js)
const hStatements = notOrg(hFullEnv.db.statements).length;
const hDec = await readDecisions(homeFixtureEnv({}).env, H_OWNER, {});
const HOME = {
  full: homePage("owner", hFull),
  noMeasure: homePage("owner", await readHomeSummary(homeFixtureEnv({}).env, H_OWNER, {})),
  empty: homePage("owner", await readHomeSummary(homeFixtureEnv({ empty: true, noGoal: true }).env, H_OWNER, {})),
  seat: homePage("contributor", await readHomeSummary(homeFixtureEnv({}).env, H_SEAT, {})),
  newcomer: homePage("contributor", await readHomeSummary(homeFixtureEnv({}).env, H_NEW, {})),
  down: homePage("owner", await readHomeSummary(homeFixtureEnv({ throwOn: (sql) => /AS approve_n/.test(sql) }).env, H_OWNER, {})),
};
const fFull = homeAudit(HOME.full, "owner");
ok(fFull.length === 0, `Home (Home.dc.html), the owner with everything full: six regions non-empty in order, eight buttons on their own doors, every door in door.json, no typed input, no pin, both counter calls, one kind chip per row, no view bar, and the shell's own audit${fFull.length ? `\n      ${fFull.join("\n      ")}` : ""}`);
const kinds = needsRowsOf(HOME.full).map((r) => (/data-kind="([a-z]+)"/.exec(r) || [])[1]);
// choose-option files into the project Home shows: a multi-seat person with no stamped project is otherwise refused
// project_required by the door (caught by sims S10c on the local R, where the owner holds two seats)
// the one-pass fix 9 (owner, 2026-10-01): a decide row shows its options, each its own press, and pre-selects none (it used to
// offer option A alone): the forms of a row carry options 0, 1, … in order, never only 0
const pickForms = [...HOME.full.matchAll(/<form method="POST" action="\/respond">([\s\S]*?)<\/form>/g)].map((m) => m[1]);
const pickOpts = pickForms.map((f) => (/name="option" value="(\d+)"/.exec(f) || [])[1]);
ok(pickForms.length > 2 && pickForms.every((f) => /<input type="hidden" name="project" value="alpha">/.test(f) && /name="next" value="\/home"/.test(f)) && pickOpts.includes("1") && !/checked|aria-pressed="true"/.test(regionOf(HOME.full, "needs-you").inner),
  `choose-option: ${pickForms.length} forms over the decide rows (options ${pickOpts.join(",")}), each POST /respond {qid, its option, next /home} carrying Home's own project (alpha); no option pre-selected`);
ok(JSON.stringify(kinds) === JSON.stringify(["decide", "decide", "approve", "grant"]) && hFull.metrics.needsYou.decide === hDec.counts.yours && hFull.metrics.needsYou.decide === 2
  && hFull.metrics.needsYou.approve === 1 && hFull.metrics.needsYou.grant === 1 && hFull.needsYou.more === 0,
  `needs you: rows [${kinds.join(" ")}] (decide by severity, then approve, then grant), decide ${hFull.metrics.needsYou.decide} == Decisions "Open: yours" ${hDec.counts.yours}, approve ${hFull.metrics.needsYou.approve}, grant ${hFull.metrics.needsYou.grant}`);
// sprint 3 L2: the glance's tiles (contributions moved to Build's strip); the week's bars add up to the Landed tile
const METRIC_KEY = { "Needs you": "needs-you", "In motion": "in-motion", "Landed · 7d": "shipped", "Goals moved": "goals-moved" };
const cardN = (html, h) => (new RegExp(`data-metric="${METRIC_KEY[h]}" data-value="([^"]*)"`).exec(regionOf(html, "metrics") ? regionOf(html, "metrics").inner : "") || [])[1];
ok(cardN(HOME.full, "Needs you") === String(hFull.metrics.needsYou.total) && cardN(HOME.full, "In motion") === String(hFull.metrics.inMotion.total) && cardN(HOME.full, "Goals moved") === String(hFull.goalsMoved.rows.length)
  && cardN(HOME.full, "Landed · 7d") === String(hFull.metrics.shipped.landed) && hFull.metrics.shipped.landed === 9 && hFull.week && hFull.week.landed.reduce((a, n) => a + n, 0) === 9 && hStatements <= 13,   // S1..S5, the aim, the questions and the checklist's meter (D1), THE WEEK (sprint 3 L2); sprint 3 B4: What changed's two lane ranges (and the walk's one batch of four only when a change names something in the model: none in this fixture) and the follow-ups' two ranges
  `summary == render: Needs you ${cardN(HOME.full, "Needs you")}, In motion ${cardN(HOME.full, "In motion")}, Goals moved ${cardN(HOME.full, "Goals moved")}, Landed ${cardN(HOME.full, "Landed · 7d")} (L4: the fixture's filings whose work happened this week and landed, Build's own count: approved, or filed straight through; no counter, answer or knowledge row; the week's bars add up to it), from ${hStatements} D1 statements`);
// sprint 3 (B3, MCP.md §9 demand 11): the goals moved, each with how far and its contributors by name; never a rank or a
// per-person total (the leaderboard's own hooks, data-rank and the per-person total, are gone)
const gm = regionOf(HOME.full, "goals-moved") || { inner: "" };
const gmGoals = [...gm.inner.matchAll(/data-goal="([^"]*)" data-moved="(\d+)"/g)].map((m) => `${m[1]}:${m[2]}`);
// the contributors ride the goal's face stack (its title names them, in name order)
const gmBy = ((/<span class="p-avs"[^>]*title="([^"]*)"/.exec(gm.inner) || [])[1] || "").split(", ").filter(Boolean);
const whoRoles = [...(regionOf(HOME.full, "who-is-here") || { inner: "" }).inner.matchAll(/data-person="([^"]*)" data-role="(admin|seated)"/g)].map((m) => `${m[1]}:${m[2]}`);
ok(JSON.stringify(gmGoals) === JSON.stringify(["g1:6"]) && JSON.stringify(gmBy) === JSON.stringify(["Amir", "Owen Park"]) && /title="contributions this month">6</.test(gm.inner)
  && !/data-rank=|hm-rank|hm-total/.test(HOME.full) && hFull.goalsMoved.rows[0].contributors.every((c) => !("n" in c) && !("total" in c)) && !("leaderboard" in hFull)
  && JSON.stringify([...whoRoles].sort()) === JSON.stringify(["Amir:seated", "Owen Park:admin", "Rae Kim:seated"]) && !/Eval Seat/.test(HOME.full) && !/data-person="Nia New"/.test(HOME.full),
  `the goals moved this month [${gmGoals.join(", ")}], each with its contributors' faces by name [${gmBy.join(", ")}], no rank; the people of the week [${whoRoles.join(", ")}], each with their days (contributions a day), no suite seat, no one with 0 (L4: Nia New contributed nothing this week)`);
// the meter (sprint 3, B3): in the header region, overall and per area the project has, one link to What is missing
// sprint 3 L2: the meter is the glance's Filled tile (its hooks on the tile), linking to What is missing
const meterTag = (/<a class="p-tile" href="\/missing" data-metric="filled" data-value="\d+" data-meter="home" data-pct="(\d+)" data-open="(\d+)" data-done="(\d+)" data-total="(\d+)"/.exec((regionOf(HOME.full, "metrics") || { inner: "" }).inner) || []).slice(1).map(Number);
ok(meterTag.length === 4 && meterTag[0] === hFull.meter.pct && meterTag[1] === hFull.meter.open && meterTag[3] === hFull.meter.total,
  `the meter on Home's glance: ${hFull.meter.words}, the Filled tile, linking to What is missing`);
ok(/<h1>Alpha<\/h1>/.test(HOME.full) && !/<h1>alpha<\/h1>/.test(HOME.full) && !/people · updated/.test(HOME.full) && !/data-region="identity">[\s\S]{0,200}class="eyebrow"/.test(HOME.full),
  "identity: the project's NAME (never its key), no identity sentence (pristine copy), and no eyebrow");
const aimOf = (h) => (regionOf(h, "aim") || { inner: "" }).inner;
ok(/human touches per shipped unit/.test(aimOf(HOME.full)) && /data-value="2\.8"/.test(aimOf(HOME.full)) && /data-prior="4\.2"/.test(aimOf(HOME.full)) && !/data-measure="missing"/.test(aimOf(HOME.full))
  && /data-measure="missing">No measure</.test(aimOf(HOME.noMeasure)) && /Human touches per shipped unit, trending down\./.test(aimOf(HOME.noMeasure)) && /data-state="empty"[\s\S]*No aim yet/.test(aimOf(HOME.empty)) && !/preview then file/.test(aimOf(HOME.empty) + aimOf(HOME.noMeasure)),
  `the aim (k_aim): with its measure it draws "${H_MEASURE.name}" ${H_MEASURE.value} against ${H_MEASURE.prior}; without one, the aim and "No measure"; with no aim filed, "No aim yet" (D2b, pristine copy: a phrase, never how to file it)`);
const emptyIn = (h, r) => /data-state="empty"/.test((regionOf(h, r) || { inner: "" }).inner);
ok(["aim", "needs-you", "goals-moved", "who-is-here", "metrics"].every((r) => emptyIn(HOME.empty, r)) && /No goal moved this month</.test(HOME.empty) && /Nobody seated yet</.test(HOME.empty)
  && /Nothing contributed yet/.test((regionOf(HOME.empty, "metrics") || { inner: "" }).inner) && homeAudit(HOME.empty, "owner", SRC, { full: false }).filter((x) => !/button .* not rendered|^call: /.test(x)).length === 0,
  "EMPTY: an empty fixture draws each region's own sentence (aim, needs-you, goals-moved, who-is-here) and, nothing contributed, the metrics one phrase (D2b: never four zero tiles), and, the row buttons aside (no row, no button), the page still audits clean");
ok(!/data-button="(approve|grant-once|not-yet)"/.test(HOME.seat) && emptyIn(HOME.seat, "needs-you") && /Nothing needs you</.test(HOME.seat) && !/data-steps="first-five"/.test(HOME.seat)
  && /data-steps="first-five"/.test(HOME.newcomer) && /href="\/docs"[^>]*>Connect an assistant</.test(HOME.newcomer)
  && !/data-steps="first-five"/.test(HOME.full),
  "a seat: needs-you EMPTY with no Approve or Grant button; a seat with nothing filed yet: the first five steps are that EMPTY's next action; never on the owner's Home");
ok(/<div class="state state-unreachable" data-state="unreachable"/.test(HOME.down.replace(/<template[\s\S]*?<\/template>/g, "")) && guard.test(HOME.down) && /<template id="hm-offline"><div class="state state-unreachable"/.test(HOME.full)
  && /data-metric="in-motion" data-value="–"/.test(HOME.down) && homeAudit(HOME.down, "owner").length === 0,
  "UNREACHABLE: a failed D1 statement shows the block, the shell refuses every POST before the press, and an offline browser gets the same (the template the page keeps)");
for (const [k, h] of Object.entries({ seat: HOME.seat, newcomer: HOME.newcomer })) { const e = audit(h, "contributor", SRC); ok(e.length === 0, `Home (${k}): the shell's own audit holds${e.length ? `\n      ${e.join("\n      ")}` : ""}`); }
// both ways: each injected defect goes red on its own check
const HMUT = [
  ["region", "a dropped region (who-is-here)", () => homeAudit(HOME.full.replace('data-region="who-is-here"', 'data-x="who-is-here"'), "owner")],
  ["door", "a grant pressed at POST /grants (a door that does not exist)", () => homeAudit(HOME.full.replace('data-button="grant-once" data-door="POST /contribution/:id/decide"', 'data-button="grant-once" data-door="POST /grants"'), "owner")],
  ["door", "a grant form posting to /grants", () => homeAudit(HOME.full.replace(`action="/contribution/${H_GRANT}/decide"`, 'action="/grants"'), "owner")],
  ["door", "all-open carrying a door the wireframe does not wire", () => homeAudit(HOME.full.replace('data-button="all-open" data-client=', 'data-button="all-open" data-door="GET /decisions" data-client='), "owner")],
  ["input", "a textarea on Home", () => homeAudit(HOME.full.replace(/<section class="p-card"[^>]*data-region="aim">/, (m) => '<textarea name="note"></textarea>' + m), "owner")],
  ["input", "a text input on Home", () => homeAudit(HOME.full.replace(/<section class="p-card"[^>]*data-region="aim">/, (m) => '<input type="text" name="ask">' + m), "owner")],
  ["bar", "Your thread back on Home's bar (the page)", () => homeAudit(injectViewBar(HOME.full, '<a class="view-item" href="/home" data-view="home" aria-current="page">Overview</a><a class="view-item" href="/thread" data-view="thread">Your thread</a>'), "owner")],
  ["bar", "Your thread back on Home's bar (shell.js TABS)", () => homeAudit(HOME.full, "owner", SRC.replace('views: [{ key: "home", label: "Overview", href: "/home" }] },', 'views: [{ key: "home", label: "Overview", href: "/home" }, { key: "thread", label: "Your thread", href: "/thread" }] },'))],
  ["chip", "a needs-you row with two kind chips", () => homeAudit(HOME.full.replace(statusChip("APPROVE", "Approve", "quiet"), statusChip("APPROVE", "Approve", "quiet") + statusChip("GRANT", "Grant", "quiet")), "owner")],
  ["chip", "an approve row wearing the DECIDE chip", () => homeAudit(HOME.full.replace(statusChip("APPROVE", "Approve", "quiet"), statusChip("DECIDE", "Decide", "quiet")), "owner")],
  ["call", "a counter call back on Home", () => homeAudit(HOME.full.replace('data-region="needs-you"', `data-region="needs-you"><code>${esc4(PARENT_COUNTER_CALL)}</code><i hidden`), "owner")],
  ["emdash", "an em dash from a filing's own words", () => homeAudit(HOME.full.replace("Workspace scoping: one column", "Workspace scoping — one column"), "owner")],
  ["pin", "a pin on Home", () => homeAudit(HOME.full.replace(/<section class="p-card"([^>]*data-region="aim">)/, '<section class="p-card" style="box-shadow:var(--shadow-pin)"$1'), "owner")],
];
ok(homeAudit(HOME.full, "owner").length === 0, "both ways: the clean Home render is green before any injection");
for (const [id, label, run] of HMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? "" : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

// ---- 6. UI-B4a: the filing page (wf-filing) ----
// the look pass (sprint 2), group B's screens (the filing page, Build, Versions, Broadcast, Control): a page's own style names
// only the SEMANTIC tokens shell.js declares for both worlds (read off INK_WORLD, never hand-typed here), the three faces and
// the motion tokens; never a --bv-* palette name, never a pre-look alias like --ink or --stamp
const LOOK_TOKENS = new Set([...[...INK_WORLD.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]), "ease", "dur-fast", "dur", "sans", "display", "mono"]);
const noUchan = (h) => h.replace(/<svg class="u-uchan\b[^"]*"[\s\S]*?<\/svg>/g, "");
const lookVarFails = (own, where, fail) => { for (const m of own.matchAll(/var\(--([a-z0-9-]+)/g)) if (!LOOK_TOKENS.has(m[1])) fail("colour", `${where}: var(--${m[1]}) is not a semantic token (page, surface, text, line, accent-*, ok/needs/err/stone ...)`); };
const WFF = SCREEN("wf-filing");
ok(!!WFF && WFF.artboard === null && JSON.stringify(WFF.regions) === JSON.stringify(FILING_REGIONS) && WFF.buttons.length === 6,
  `the pinned wireframe's wf-filing: ${WFF ? `${WFF.regions.length} regions [${WFF.regions.join(" ")}], ${WFF.buttons.length} buttons [${WFF.buttons.join(" ")}]` : "absent"}; src/txpage.js draws the same six regions, in order`);
const wfFilingCall = String((((WFF || {}).wires || {}).counters || {}).mcp || "");
ok(wfFilingCall === filingCounterCall("<id>"), `the filing's counter call is the wireframe's, verbatim with the id slot: ${wfFilingCall}`);
ok(FILING_RULINGS.every((r) => WFF && WFF.buttons.includes(r.value) && WFF.wires[r.value].door === "POST /contribution/:id/decide"), "the three ruling buttons are wf-filing's approve · needs-work · reject, each on POST /contribution/:id/decide");
// the fixture: the Home fixture's real SQLite plus one filing that names a question and carries two counters by parent
// (one standing, one ruled), and a reader seated only on another project
const FIL = "T-20260928-401", FIL_STAND = "T-20260928-402", FIL_RULED = "T-20260928-403";
function filingFixture(o = {}) {
  const fx = homeFixtureEnv(o);
  const X = fx.sqlite.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,gaprefs,route,status,decision,decided_by,decided_at,decision_note,eval,project,parent,goal_ref,via,created_at,grade,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  const at = (m) => new Date(Date.now() - m * 60000).toISOString();
  X.run(FIL, "p-a", "code", "pr", "Scope the ledger to seated readers", "Q0B546903 opens the ledger", "engine", "q/" + H_OPEN_QID, "owner", "routed", null, null, null, null, 0, "alpha", null, "g1", "mcp", at(80), JSON.stringify({ binding: true, joinKey: "ok", proof: "ok", ownerReasons: ["answers-a-question"] }));
  X.run(FIL_STAND, "p-c", "leader", "counter", "A seat per project is not enough", "the owner keeps the org view", null, null, "owner", "routed", null, null, null, null, 0, "alpha", FIL, null, "mcp", at(70), JSON.stringify({ binding: true, ownerReasons: ["counters-a-filing"] }));
  X.run(FIL_RULED, "p-c", "leader", "counter", "Say 404, never 403", "a 403 says the row exists", null, null, "owner", "closed", "approve", "p-o", at(60), "Approved on its page.", 0, "alpha", FIL, null, "mcp", at(65), JSON.stringify({ binding: true, ownerReasons: ["counters-a-filing"] }));
  // a ruled counter on Home's approve row too: Home's S2 and the filing page count standing counters only
  X.run("T-20260928-404", "p-c", "leader", "counter", "Ruled already", "r", null, null, "owner", "closed", "reject", "p-o", at(55), "Rejected on its page.", 0, "alpha", H_APPROVE, null, "mcp", at(58), "{}");
  fx.sqlite.exec("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-b','Bo Beta','bo@northwind.test','internal-eng','h-b',1,'2026-09-01T00:00:00Z',1)");
  fx.sqlite.exec("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-b','beta','member','2026-09-01T00:00:00Z')");
  return fx;
}
const H_OTHER = { id: "p-b", name: "Bo Beta", role: "internal-eng", viaCookie: true };
const filingPage = (persona, read, o = {}) => { const { grade, counters, evalView, ...row } = read; return shell({ ...PERSONAS[persona], active: "transmission", content: renderTransmissionPage(row, { grade, counters, evalView, canDecide: persona === "owner", ownerName: "Owen Park", brand, ...o }), brand, briefCount: 3, hasPack: true }); };
const contentOf = (read, canDecide) => { const { grade, counters, evalView, ...row } = read; return renderTransmissionPage(row, { grade, counters, evalView, canDecide, ownerName: "Owen Park", brand }); };
const RULE_BUTTONS = new Set(FILING_RULINGS.map((r) => r.value));
// filingAudit(html, content, id, o) -> failures by check id: the screen audit (regions, buttons, doors, inputs, pins,
// em dash, the call), the spec's order, the page's own content (no colour literal, the semantic tokens only), no textarea,
// and the shell's own audit. o.reader: the three ruling buttons must be ABSENT, not missing.
function filingAudit(html, content, id, o = {}) {
  // sprint 3 L3: the counter call is off the page (pristine copy: What is missing carries the calls); the presses show only
  // while the owner owes a ruling (o.reader, or o.landed: absent, not missing)
  const f = screenAudit(html, WFF, { pins: 0, call: null }).filter((x) => !((o.reader || o.landed) && /button (approve|needs-work|reject) not rendered/.test(x)) && !(o.noQuestion && /button question-link not rendered/.test(x)));
  const fail = (k, why) => f.push(`${k}: ${why}`);
  if (html.includes(esc4(filingCounterCall(id)))) fail("call", "wf-filing: the counter call is printed on the page (pristine copy)");
  const idx = FILING_REGIONS.map((r) => html.indexOf(`data-region="${r}"`));
  if (idx.some((i) => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) fail("region", `wf-filing: the regions are not in the spec's order (${FILING_REGIONS.join(" ")})`);
  if (o.reader && [...RULE_BUTTONS].some((b) => html.includes(`data-button="${b}"`))) fail("door", "wf-filing: a seated reader is shown a ruling button");
  if (/<textarea\b/i.test(html)) fail("input", "wf-filing: a textarea on the filing page");
  const own = noUchan(content).replace(/<style>([\s\S]*?)<\/style>/, (m, css) => css);
  for (const m of own.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) fail("colour", `wf-filing: a colour literal #${m[1]} in the page's own content`);
  lookVarFails(own, "wf-filing", fail);
  return [...f, ...audit(html, o.reader ? "contributor" : "owner", SRC)];
}
const ff = filingFixture();
const before = ff.db.statements.length;
const fOwn = await filingFor(FIL, ff.env, H_OWNER, {});
const fOwnStatements = ff.db.statements.slice(before);
const fSeat = await filingFor(FIL, ff.env, H_SEAT, {});
const fEmpty = await filingFor(H_GRANT, ff.env, H_OWNER, {});
const FILING = { full: filingPage("owner", fOwn), reader: filingPage("contributor", fSeat), empty: filingPage("owner", fEmpty) };
const cFull = contentOf(fOwn, true);
const fFullAudit = filingAudit(FILING.full, cFull, FIL);
ok(fFullAudit.length === 0, `the filing page (wf-filing), the owner with a question and two counters: six regions non-empty in order, six buttons on their own doors, every door in door.json, no typed input, no em dash, no colour literal and the semantic tokens only, the exact call with the id, and the shell's own audit${fFullAudit.length ? `\n      ${fFullAudit.join("\n      ")}` : ""}`);
const fReaderAudit = filingAudit(FILING.reader, contentOf(fSeat, false), FIL, { reader: true });
ok(!fSeat.error && fReaderAudit.length === 0 && /title="Waits on Owen Park" data-region="ruling"/.test(FILING.reader) && /data-chip="OPEN">With Owen Park</.test(FILING.reader),
  `the filing page as a seated reader (Rae, seated on alpha): the same six regions, no ruling button, who it waits on${fReaderAudit.length ? `\n      ${fReaderAudit.join("\n      ")}` : ""}`);
const fEmptyAudit = filingAudit(FILING.empty, contentOf(fEmpty, true), H_GRANT, { noQuestion: true });
const cntOf = (h) => (regionOf(h, "counters") || { inner: "" }).inner;
ok(fEmptyAudit.length === 0 && /data-state="empty"/.test(cntOf(FILING.empty)) && /No counters/.test(cntOf(FILING.empty)) && /aria-label="0 standing, 0 ruled">0</.test(FILING.empty),
  `EMPTY: a filing with no counters says "No counters" (the Counters fact 0 standing, 0 ruled), and the page still audits clean${fEmptyAudit.length ? `\n      ${fEmptyAudit.join("\n      ")}` : ""}`);
// the counters: N standing · M ruled from the one STANDING_COUNTER definition, each linking to its own page; Home agrees
const hOwnRows = (await readHomeSummary(ff.env, H_OWNER, {})).needsYou.rows;
const hApprove = hOwnRows.find((r) => r.id === H_APPROVE);
const fApprove = await filingFor(H_APPROVE, ff.env, H_OWNER, {});
const standingN = (fr) => (fr.counters || []).filter((c) => Number(c.standing) === 1).length;
ok(/aria-label="1 standing, 1 ruled">1</.test(FILING.full) && [FIL_STAND, FIL_RULED].every((c) => cntOf(FILING.full).includes(`href="/contribution/${c}"`))
  && hApprove && hApprove.counters === 1 && standingN(fApprove) === 1 && fApprove.counters.length === 2,
  `counters: "1 standing · 1 ruled" with each counter linking to its own page; on Home's approve row ${H_APPROVE} Home counts ${hApprove && hApprove.counters} and its filing page ${standingN(fApprove)} standing of ${fApprove.counters && fApprove.counters.length} (the ruled one counts on neither)`);
ok(fOwnStatements.length === 2 && fOwnStatements[1] === FILING_COUNTERS_SQL_OWNER,
  `filingFor runs ${fOwnStatements.length} D1 statement(s) for the owner: the row, then the one counters statement`);
// the counter of a filing says what it counters: a link to its parent (and a question link only when it names one)
const fCounter = filingPage("owner", await filingFor(FIL_STAND, ff.env, H_OWNER, {}));
ok(/>Counters<\/span><\/span><span class="p-line-main"><a href="\/contribution\/T-20260928-401"/.test((regionOf(fCounter, "refs") || { inner: "" }).inner), "a counter's refs region says what it counters: a link to its parent filing, led by a Counters chip");
// scoping (Q0B546903): a reader seated only on another project gets not_found, exactly like a missing id; the queue too
const other = await filingFor(FIL, ff.env, H_OTHER, {}), missing = await filingFor("T-19700101-999", ff.env, H_OTHER, {});
// D5: the list's scope is `read` {kind: "contribution"}'s, through the door (callTool scopes it to the reader's own project)
const RD = [{ name: "read", owner: false, project: true }];
const q = await callTool("read", { kind: "contribution", limit: 100 }, H_OTHER, ff.env, new URL("https://org.test/mcp"), RD);
const qSeat = await callTool("read", { kind: "contribution", limit: 100 }, H_SEAT, ff.env, new URL("https://org.test/mcp"), RD);
const idsOf = (r) => (r.items || []).map((x) => x.id);
ok(JSON.stringify(Object.keys(other).sort()) === JSON.stringify(Object.keys(missing).sort()) && other.error === "not_found" && missing.error === "not_found"
  && !idsOf(q).includes(FIL) && q.project !== "alpha" && qSeat.project === "alpha" && idsOf(qSeat).includes(FIL),
  `scoping: a reader seated only on beta gets ${JSON.stringify(other)} for an alpha filing, the same shape as a missing id; its contributions never list it (${q.project || q.error}), a seat on alpha reads ${idsOf(qSeat).length} alpha row(s)`);
// both ways: each injected defect goes red on its own check
const FMUT = [
  ["input", "a textarea back on the filing page", () => filingAudit(FILING.full.replace('<div class="fl-rules"', '<textarea name="note"></textarea><div class="fl-rules"'), cFull, FIL)],
  ["region", "the counters region dropped", () => filingAudit(FILING.full.replace('data-region="counters"', 'data-x="counters"'), cFull, FIL)],
  ["door", "a POST /counter door", () => filingAudit(FILING.full.replace('data-button="approve" data-door="POST /contribution/:id/decide"', 'data-button="approve" data-door="POST /counter"'), cFull, FIL)],
  ["region", "the regions out of the spec's order (trail before counters)", () => filingAudit(FILING.full.replace('data-region="counters"', 'data-region="trail-x"').replace('data-region="trail"', 'data-region="counters"').replace('data-region="trail-x"', 'data-region="trail"'), cFull, FIL)],
  ["door", "a seated reader shown the ruling buttons", () => filingAudit(FILING.reader.replace('data-region="ruling">', 'data-region="ruling"><button data-button="approve" data-door="POST /contribution/:id/decide">Approve</button>'), contentOf(fSeat, false), FIL, { reader: true })],
  ["call", "the counter call back on the page", () => filingAudit(FILING.full.replace('data-region="counters">', `data-region="counters"><code>${esc4(filingCounterCall(FIL))}</code>`), cFull, FIL)],
  ["emdash", "an em dash from a filing's own words", () => filingAudit(FILING.full.replace("Scope the ledger to seated readers</h1>", "Scope the ledger — seated readers</h1>"), cFull, FIL)],
  ["colour", "a hex colour in the page's own style", () => filingAudit(FILING.full, cFull.replace(".fl{display:block}", ".fl{display:block;color:#6B4FA8}"), FIL)],
  ["colour", "an old shell token in the page's own style", () => filingAudit(FILING.full, cFull.replace(".fl{display:block}", ".fl{display:block;color:var(--stamp)}"), FIL)],
  ["colour", "a --bv-* palette name back in the page's own style", () => filingAudit(FILING.full, cFull.replace(".fl{display:block}", ".fl{display:block;color:var(--bv-dark-text)}"), FIL)],
];
ok(filingAudit(FILING.full, cFull, FIL).length === 0, "both ways: the clean filing page is green before any injection");
for (const [id, label, run] of FMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? "" : " (nothing went red: the injection did not apply or the check is blind)"}`);
}
ok(!(/data-state="empty"/.test(cntOf(FILING.full))) && /data-state="empty"/.test(cntOf(FILING.empty)), "both ways: EMPTY shows on the filing with no counters and never on the one with two");

// ---- 7. UI-B4b: Build (wf-build) ----
const WFB = SCREEN("wf-build");
ok(!!WFB && JSON.stringify(WFB.regions) === JSON.stringify(BUILD_REGIONS) && WFB.buttons.length === 5 && JSON.stringify(WFB.buttons) === JSON.stringify(["filter", "sort", "rank", "counters", "open-row"]),
  `the pinned wireframe's wf-build: ${WFB ? `${WFB.regions.length} regions [${WFB.regions.join(" ")}], ${WFB.buttons.length} buttons [${WFB.buttons.join(" ")}]` : "absent"}; src/build.js draws the same three regions, in order`);
const wfBuildCall = (String((((WFB || {}).wires || {}).counters || {}).mcp || "").match(/preview \{items: \[\{contribution: \{[^}]*\}\}\]\}, then file/) || [""])[0];
ok(wfBuildCall === PARENT_COUNTER_CALL, `Build's counter call is the wireframe's, verbatim: ${wfBuildCall}`);
ok(WFB && WFB.wires.rank.door === "POST /rank" && WFB.wires["open-row"].door === "GET /contribution/:id" && WFB.wires.counters.door === "GET /build" && !WFB.wires.filter.door && !WFB.wires.sort.door,
  "wf-build wires rank to POST /rank, open-row to GET /contribution/:id, counters to GET /build, and filter and sort client-side");
// the fixture: the Home fixture's real SQLite, plus a row naming goal g1 (titled when g1 is filed: o.titled), a ruled row, a rank press on the OLDEST
// alpha row, and a reader seated only on beta
const B_RANKED = "T-20260927-101";   // the approve row, filed 120 minutes ago: older than every other alpha row but the grant's peers
const B_RANK = "T-20260928-501", B_REJECTED = "T-20260928-502";
// the finish line's declared tree (Q572FF8F6, the brain probe finish_line_stages.py's): root g · s1 (l1..l6, one graded code
// filing each: all six at 100%, so s1 itself reads 100% and must never count) · s2 (l7 two dimensions, one filled: 50%; l8
// only an EVAL filing; l9 only another project's; l10 only an approved COUNTER) · s3 (l11..l13 deferred: true, no filings).
// 13 leaves: 6 done, 3 deferred, 4 gating.
const STAGE_LEAF = (id, parent, extra = {}) => ({ id, title: "Stage " + id, parent, dimensions: ["code"], ...extra });
const STAGE_TREE = [
  { id: "g", title: "The release", parent: null, dimensions: [] },
  { id: "s1", title: "Built", parent: "g", dimensions: [] }, { id: "s2", title: "Proven", parent: "g", dimensions: [] }, { id: "s3", title: "Later", parent: "g", dimensions: [] },
  ...[1, 2, 3, 4, 5, 6].map((i) => STAGE_LEAF("l" + i, "s1")),
  STAGE_LEAF("l7", "s2", { dimensions: ["code", "design"] }), STAGE_LEAF("l8", "s2"), STAGE_LEAF("l9", "s2"), STAGE_LEAF("l10", "s2"),
  ...[11, 12, 13].map((i) => STAGE_LEAF("l" + i, "s3", { deferred: true })),
];
const STAGE_WANT = { done: 6, total: 13, gating: 4, deferred: 3 };
const STALE_EXPORT = { done: 9, total: 9, gating: 0, deferred: 0 };
function stageFilings(sqlite) {
  const X = sqlite.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,decision,eval,project,parent,goal_ref,via,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
  const at = (m) => new Date(Date.now() - m * 60000).toISOString();
  let n = 700;
  const F = (goal, o = {}) => X.run(`T-20260928-${n++}`, "p-a", "code", o.kind || "pr", "moved " + goal, "the stage", "x", o.route || "auto", o.decision ? "closed" : "routed", o.decision || null, o.eval || 0, o.project || "alpha", null, goal, "mcp", at(30 + n % 50));
  for (let i = 1; i <= 6; i++) F("l" + i);
  F("l7"); F("l8", { eval: 1 }); F("l9", { project: "beta" }); F("l10", { kind: "counter", route: "owner", decision: "approve" });
}
// fileGoals(sqlite, tree) — a goal tree filed on alpha as preview then file files it (k_goals, by the owner p-o), read back in
// the given order (sort); a `deferred: true` node files status "deferred"
function fileGoals(sqlite, tree, project = "alpha") {
  const G = sqlite.prepare("INSERT INTO k_goals (project,id,parent,title,dimensions,weight,target,outcome_metric,owner,due,status,sort,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  (tree || []).forEach((n, i) => G.run(project, n.id, n.parent ?? null, n.title, JSON.stringify(n.dimensions || []), n.weight ?? null, n.target ?? null,
    n.outcomeMetric == null ? null : n.outcomeMetric ? 1 : 0, n.owner ?? null, n.due ?? null, n.status ?? (n.deferred ? "deferred" : null), i, "p-o", "2026-09-01T00:00:00Z", "p-o", "2026-09-01T00:00:00Z"));
}
function buildFixture(o = {}) {
  const fx = homeFixtureEnv(o);
  if (!o.empty) {
    const X = fx.sqlite.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,decision,decided_by,decided_at,eval,project,parent,goal_ref,via,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
    const at = (m) => new Date(Date.now() - m * 60000).toISOString();
    X.run(B_RANK, "p-c", "leader", "rank", "Ranked first on Build: Workspace scoping", "a rank press", null, "auto", "routed", null, null, null, 0, "alpha", B_RANKED, null, "build", at(5));
    X.run(B_REJECTED, "p-a", "design", "screen", "A second pass on the header", "the pass", "x", "owner", "closed", "reject", "p-o", at(8), 0, "alpha", null, null, "mcp", at(30));
    fx.sqlite.exec("UPDATE transmission SET goal_ref = 'g1' WHERE id = 'T-20260927-102'");
    fx.sqlite.exec("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-b','Bo Beta','bo@northwind.test','internal-eng','h-b',1,'2026-09-01T00:00:00Z',1)");
    fx.sqlite.exec("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-b','beta','member','2026-09-01T00:00:00Z')");
    if (o.tree && o.filings !== false) stageFilings(fx.sqlite);
  }
  // o.tree: the goal tree filed on alpha (k_goals; a `deferred: true` node files status "deferred"); o.titled: one goal, g1
  fileGoals(fx.sqlite, o.tree || (o.titled ? [{ id: "g1", title: "Ship the ledger to every seat", parent: null, dimensions: [] }] : []));
  const base = fx.env.BRAIN;
  const obj = (t) => ({ text: async () => t, json: async () => JSON.parse(t) });
  // o.stale: a state.json finishLine export beside the tree (the export B6b stopped reading)
  const state = o.stale ? JSON.stringify({ generatedAt: new Date(Date.now() - 3 * 60000).toISOString(), finishLine: o.stale }) : null;
  fx.env.BRAIN = { ...base, get: async (k) => (k === "serve/state.json" && state ? obj(state) : base.get(k)) };
  return fx;
}
const B_OTHER = { id: "p-b", name: "Bo Beta", role: "internal-eng", viaCookie: true };
const buildPage = (persona, read) => shell({ ...PERSONAS[persona], active: "build", content: renderBuild(read, { brand }), brand, briefCount: 3, hasPack: true });
// a filing row is the <li> carrying data-id inside the filings region (its semantic hook), never a page class
const bRowsOf = (html) => (regionOf(html, "filings") || { inner: "" }).inner.match(/<li\b[^>]*\sdata-id="[^"]*"[\s\S]*?<\/li>/g) || [];
// buildAudit(html, content, persona, src) -> failures by check id: the screen audit (regions, buttons, doors, inputs, pins,
// em dash, the call), the artboard's order, one state chip per row, the page's own content (no colour literal, the semantic
// tokens only), and the Build tab: ONE view, never the retired Queue or Files view
function buildAudit(html, content, persona, src = SRC, o = {}) {
  // sprint 3 L2 (the revision, pristine copy): no call on the page (it rides What is missing), and the regions in the revision's
  // reading order (the list, then the finish line and what moved beside it): each present and non-empty, the order not pinned
  const f = screenAudit(html, WFB, { pins: 0, call: null }).filter((x) => !(o.rows === false && /button (rank|counters|open-row|filter|sort) not rendered/.test(x)));
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const bad = bRowsOf(html).filter((r) => { const c = [...r.matchAll(/data-chip="([^"]*)"/g)].map((m) => m[1]); return c.length !== 1 || !BUILD_CHIPS.includes(c[0]); });
  if (bad.length) fail("chip", `wf-build: ${bad.length} row(s) without exactly one design-law state chip`);
  if (/<textarea\b/i.test(html)) fail("input", "wf-build: a textarea on Build");
  const own = noUchan(content).replace(/<style>([\s\S]*?)<\/style>/, (m, css) => css);
  for (const m of own.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) fail("colour", `wf-build: a colour literal #${m[1]} in the page's own content`);
  lookVarFails(own, "wf-build", fail);
  // the Build tab: ONE view, /build; the retired Queue (/thread?only=waiting) and Files (/artifacts) views never return
  const buildRow = (/\{ key: "build", label: "Build", icon: "audit",\s*views: \[([^\]]*)\]/.exec(src) || [])[1];
  if (buildRow == null) fail("bar", "shell.js TABS carries no Build row");
  else if (buildRow.trim() !== '{ key: "build", label: "Build", href: "/build" }') fail("bar", `shell.js TABS: the Build tab is not ONE view on /build: [${buildRow.trim()}]`);
  if (hasViewBar(html)) fail("bar", "Build carries a view bar (a second Build view is back)");
  if (/href="\/thread[?"]|href="\/artifacts[?"]/.test(html)) fail("bar", "Build links to the retired /thread or /artifacts page");
  if (!isLit(html, "build", "/build")) fail("bar", "the Build tab is not the current tab, or does not open /build");
  return [...f, ...audit(html, persona, src)];
}
const bfx = buildFixture();
const bBefore = bfx.db.statements.length;
const bOwn = await readBuild(bfx.env, H_OWNER, {});
const bOwnStatements = notOrg(bfx.db.statements.slice(bBefore));
const bSeat = await readBuild(bfx.env, H_SEAT, {});
const bOther = await readBuild(bfx.env, B_OTHER, {});
const bGoal = await readBuild(buildFixture({ titled: true }).env, H_OWNER, { sort: "goal" });
const bNewest = await readBuild(bfx.env, H_OWNER, { sort: "newest" });
const bKind = await readBuild(bfx.env, H_OWNER, { kind: "pr" });
const bEmpty = await readBuild(buildFixture({ empty: true }).env, H_OWNER, {});
const sfx = buildFixture({ tree: STAGE_TREE });
const sBefore = sfx.db.statements.length;
const bFinish = await readBuild(sfx.env, H_OWNER, {});
const bFinishStatements = notOrg(sfx.db.statements.slice(sBefore));
const bStale = await readBuild(buildFixture({ tree: STAGE_TREE, stale: STALE_EXPORT }).env, H_OWNER, {});
const bStaleOnly = await readBuild(buildFixture({ stale: STALE_EXPORT }).env, H_OWNER, {});
const bZero = await readBuild(buildFixture({ tree: STAGE_TREE, filings: false }).env, H_OWNER, {});
const bStageDown = await readBuild(buildFixture({ tree: STAGE_TREE, throwOn: (sql) => sql === GOALS_AGG_SQL(true, false) }).env, H_OWNER, {});
const bDown = await readBuild(buildFixture({ throwOn: (sql) => sql.startsWith(BUILD_ROWS_SQL(true, false, false).slice(0, 60)) }).env, H_OWNER, {});
const bDownAgg = await readBuild(buildFixture({ throwOn: (sql) => sql === BUILD_AGG_SQL(true, false) }).env, H_OWNER, {});
const BUILD = { downAgg: buildPage("owner", bDownAgg), full: buildPage("owner", bOwn), seat: buildPage("contributor", bSeat), other: buildPage("contributor", bOther), goal: buildPage("owner", bGoal),
  empty: buildPage("owner", bEmpty), finish: buildPage("owner", bFinish), down: buildPage("owner", bDown), zero: buildPage("owner", bZero), stageDown: buildPage("owner", bStageDown) };
const cBuild = renderBuild(bOwn, { brand });
const bFullAudit = buildAudit(BUILD.full, cBuild, "owner");
ok(bFullAudit.length === 0, `Build (Build.dc.html), the owner with filings: three regions non-empty in order, five buttons on their own doors, every door in door.json, no typed input, no em dash, no colour literal and the semantic tokens only, one state chip per row, the counters call, the Build tab one view, and the shell's own audit${bFullAudit.length ? `\n      ${bFullAudit.join("\n      ")}` : ""}`);
const ledgerOf = (list) => list.filter((q) => q.includes("FROM transmission"));
// sprint 3 L2 (the week walked once): the rows of the week (and, the week holding fewer than a page, the rows before it), the
// counts (the tally and the week's decisions), never THE WEEK statement beside the week's own rows
const B1_WEEK = BUILD_ROWS_SQL(true, false, false, { since: true }), B1_BEFORE = BUILD_ROWS_SQL(true, false, false, { before: true });
ok(bOwnStatements.length <= 6 && ledgerOf(bOwnStatements).length <= 3 && bOwnStatements.includes(B1_WEEK) && !bOwnStatements.some((q) => /^SELECT w\.f, w\.l/.test(q)) && !bOwnStatements.includes(GOALS_AGG_SQL(true, false)) && bOwnStatements.includes(GOAL_TREE_SQL),
  `readBuild with no declared tree runs ${ledgerOf(bOwnStatements).length} ledger statement(s) (the week's rows, the rows before it when the week is short, the counts; never the goal aggregate, never the week twice) and ${bOwnStatements.length} D1 statement(s) in all (the owner lookup unmemoized here)`);
ok(bFinishStatements.length <= 7 && ledgerOf(bFinishStatements).length <= 4 && bFinishStatements.filter((q) => q === GOALS_AGG_SQL(true, false)).length === 1 && bFinishStatements.filter((q) => q === GOAL_TREE_SQL).length === 1,
  `readBuild with a declared tree runs ${ledgerOf(bFinishStatements).length} ledger statement(s) (the rows, the counts and the goal aggregate once) and ${bFinishStatements.length} D1 statement(s) in all`);
const bIds = bOwn.rows.map((r) => r.id);
// the header's counts, read by their hooks (data-metric + data-value), never by the markup around them
const bStat = (html, k) => (new RegExp(`data-metric="${k}" data-value="([^"]*)"`).exec(html) || [])[1];
const bLede = ["contributions", "in-motion", "on-canvas-week"].map((k) => `${k} ${bStat(cBuild, k)}`).join(" · ");
ok(bIds[0] === B_RANKED && bOwn.rows[0].rank && !bIds.includes(B_RANK) && !("rank" in bOwn.counts.byKind) && bNewest.rows[0].id !== B_RANKED && bSeat.rows[0].id === B_RANKED,
  `Ranked: the ranked row ${B_RANKED} goes first for the owner and the seat alike (Newest puts ${bNewest.rows[0] && bNewest.rows[0].id} first), and the rank filing itself is no row and no kind`);
// D2b: one definition each (Home's too): contributions (never a record), in motion = not landed (with a person, or needing
// more this week: a contribution filed straight through is NOT in motion), on the Map this week
ok(bStat(cBuild, "contributions") === String(bOwn.counts.contributions) && bStat(cBuild, "in-motion") === String(bOwn.counts.inMotion) && bStat(cBuild, "on-canvas-week") === String(bOwn.counts.onCanvasWeek)
  && bOwn.counts.contributions > 0 && !("open" in bOwn.counts)
  && bOwn.counts.inMotion === bOwn.rows.filter((r) => !r.decidedAt && (r.chip === "OPEN" || r.chip === "gap")).length,
  `the header: "${bLede}" (in motion counts exactly the rows still OPEN or gap, never a LANDED one)`);
const chipOfId = (id) => (bOwn.rows.find((r) => r.id === id) || {}).chip;
ok(chipOfId("T-20260927-101") === "OPEN" && chipOfId(B_REJECTED) === "REVIEW" && /data-verdict="rejected"/.test(cBuild) && /data-chip="REVIEW">Rejected</.test(cBuild)
  && bOwn.rows.some((r) => r.chip === "gap") && bOwn.rows.some((r) => r.chip === "LANDED" && r.tempo === "in") && !bOwn.rows.some((r) => r.chip === "REVIEW" && r.tempo === "in") && bOwn.rows.some((r) => r.chip === "LANDED"),
  `the chips (design-law stateChips): with a person OPEN, filed at once (in) LANDED (D1b item 14: it counts, never REVIEW), needs more gap, approved LANDED, rejected REVIEW with its verdict word -> ${[...new Set(bOwn.rows.map((r) => r.chip))].join(" ")}`);
const approveRow = bOwn.rows.find((r) => r.id === "T-20260927-101");
ok(approveRow && approveRow.counters === 1 && cBuild.includes('href="/contribution/T-20260927-101#counters"') && (bRowsOf(BUILD.full).find((r) => r.includes('data-id="T-20260927-101"')) || "").includes('data-counters="1"'),
  "counters: the standing count from the one STANDING_COUNTER definition (1 on the approve row), 'Read them on the filing' to /contribution/:id#counters");
const goalRow = bGoal.rows.find((r) => r.id === "T-20260927-102");
// sprint 3 L2: By goal is one folded group per goal (its title the group's), the goal named on each row (data-goal; its title
// the line's secondary on the other orders)
ok(goalRow && goalRow.goal && goalRow.goal.title === "Ship the ledger to every seat" && bGoal.rows[0].goal && bGoal.rows[0].goal.ref === "g1"
  && /<details class="p-group"[^>]*data-goal="g1"[^>]*>[\s\S]*?<span class="p-group-title"[^>]*>Ship the ledger to every seat<\/span>/.test(BUILD.goal)
  && /<li\b[^>]*data-goal="g1"/.test(cBuild),
  "By goal: rows grouped under their goal's title (the goal filed in k_goals), the goal named on the row");
ok(bKind.rows.length > 0 && bKind.rows.every((r) => r.kind === "pr") && bKind.filter.kind === "pr" && /<a class="p-fchip"[^>]*aria-current="true"[^>]*>(?:<[^>]+>)*<span class="p-fchip-w">code change<\/span>/.test(renderBuild(bKind, { brand })),
  `?kind=pr: ${bKind.rows.length} row(s), every one a pr, and its chip ("code change", L4: the kind's word) marked current`);
const bSeatAudit = buildAudit(BUILD.seat, renderBuild(bSeat, { brand }), "contributor");
ok(bSeatAudit.length === 0 && JSON.stringify(bSeat.rows.map((r) => r.id)) === JSON.stringify(bIds) && JSON.stringify(bSeat.counts) === JSON.stringify(bOwn.counts),
  `a seated reader (Rae, seated on alpha): the same rows and counts as the owner, the same audit${bSeatAudit.length ? `\n      ${bSeatAudit.join("\n      ")}` : ""}`);
const regionIn = (h, r) => (regionOf(h, r) || { inner: "" }).inner;
ok(bOther.rows.length === 0 && bOther.counts.contributions === 0 && Object.keys(bOther.counts.byKind).length === 0 && /data-state="empty"/.test(regionIn(BUILD.other, "filings")) && !/T-20260927-/.test(BUILD.other),
  "a reader seated only on beta reads Build EMPTY: no alpha row, no count, never another project's rows (Q0B546903)");
const bEmptyAudit = buildAudit(BUILD.empty, renderBuild(bEmpty, { brand }), "owner", SRC, { rows: false });
ok(bEmptyAudit.length === 0 && /Nothing contributed yet/.test(regionIn(BUILD.empty, "filings")) && !/preview/.test(regionIn(BUILD.empty, "filings")) && /data-state="empty"/.test(regionIn(BUILD.empty, "tempo")) && regionIn(BUILD.empty, "tempo").includes(TEMPO_EMPTY),
  `EMPTY: an empty project draws the filings' and the tempo's own sentences, and, the row buttons aside and the filter and order chips (no row, nothing to filter or order), audits clean${bEmptyAudit.length ? `\n      ${bEmptyAudit.join("\n      ")}` : ""}`);
// the finish line (Q572FF8F6): finishAudit(fl) -> failures by check id over the four reads a finish line must get right:
// the declared tree, the same tree beside a stale state.json export, the export with no tree, and no tree at all
const sameStages = (a, b) => !!a && !!b && ["done", "total", "gating", "deferred"].every((k) => a[k] === b[k]) && Object.keys(a).length === 4;
function finishAudit(fl) {
  const f = [];
  if (!sameStages(fl.declared, STAGE_WANT)) f.push(`stages: the declared tree reads ${JSON.stringify(fl.declared)}, want ${JSON.stringify(STAGE_WANT)} (13 leaves: 6 at 100%, 3 deferred, 4 gating)`);
  if (!sameStages(fl.stale, STAGE_WANT)) f.push(`export: beside a stale state.json export the tree reads ${JSON.stringify(fl.stale)}, want ${JSON.stringify(STAGE_WANT)}`);
  if (fl.staleOnly !== null) f.push(`export: the state.json export with no declared tree reads ${JSON.stringify(fl.staleOnly)}, want null`);
  if (fl.undeclared !== null) f.push(`default: no declared tree reads ${JSON.stringify(fl.undeclared)}, want null (never a finish line against the default tree)`);
  return f;
}
const bFinishAudit = finishAudit({ declared: bFinish.finishLine, stale: bStale.finishLine, staleOnly: bStaleOnly.finishLine, undeclared: bOwn.finishLine });
ok(bFinishAudit.length === 0, `the finish line from the declared tree's leaves (Q572FF8F6): 6 of 13 stages, 4 gating, 3 deferred; a stale state.json export never read; no declared tree -> null${bFinishAudit.length ? `\n      ${bFinishAudit.join("\n      ")}` : ""}`);
// sprint 3 L2: the finish line's number is the glance's tile (data-metric stages-done, "6 of 13", "4 gating · 3 deferred"); its
// card draws done, gating and deferred as one bar with its legend
const stageTile = (h) => (/<(?:a|div) class="p-tile"[^>]*data-metric="stages-done"[\s\S]*?<\/(?:a|div)>/.exec(h) || [""])[0];
ok([BUILD.full, BUILD.empty, BUILD.seat].every((h) => /data-state="empty"/.test(regionIn(h, "finish-line")) && regionIn(h, "finish-line").includes(esc4(FINISH_EMPTY)))
  && /data-metric="stages-done" data-value="6"/.test(stageTile(BUILD.finish)) && /<small>of 13<\/small>/.test(stageTile(BUILD.finish)) && />4 gating · 3 deferred</.test(stageTile(BUILD.finish))
  && /6\/13/.test(regionIn(BUILD.finish, "finish-line")) && /data-seg="done"/.test(regionIn(BUILD.finish, "finish-line")) && /<b>4<\/b> gating/.test(regionIn(BUILD.finish, "finish-line")) && /<b>3<\/b> deferred/.test(regionIn(BUILD.finish, "finish-line"))
  && !/data-state=/.test(regionIn(BUILD.finish, "finish-line")) && JSON.stringify(Object.keys(bFinish)).indexOf("stagesDown") < 0,
  "the finish line drawn: the tile '6 of 13' with '4 gating · 3 deferred', the card's bar and legend, from the tree; EMPTY on every fixture with no declared tree");
ok(sameStages(bZero.finishLine, { done: 0, total: 13, gating: 10, deferred: 3 }) && /data-metric="stages-done" data-value="0"/.test(stageTile(BUILD.zero)) && /<small>of 13<\/small>/.test(stageTile(BUILD.zero)) && !/data-state="empty"/.test(regionIn(BUILD.zero, "finish-line")),
  `a declared tree with no filings: ${JSON.stringify(bZero.finishLine)} -> '0 of 13', never EMPTY`);
const sdRegion = regionIn(BUILD.stageDown, "finish-line");
ok(bStageDown.finishLine === null && bStageDown.stagesDown === true && bStageDown.live === "unreachable" && !Object.keys(bStageDown).includes("stagesDown") && !("stagesDown" in JSON.parse(JSON.stringify(bStageDown)))
  && sdRegion.includes(FINISH_DOWN) && /data-metric="stages-done" data-value="–"/.test(stageTile(BUILD.stageDown)) && !/data-seg=/.test(sdRegion) && bStageDown.rows.length > 0,
  "the goal aggregate lost: finishLine null, the region says the ledger did not answer (UNREACHABLE, never a guessed '0 of N'), the rows still drawn, and the JSON keeps its shape (stagesDown is not enumerable)");
ok(bDown.live === "unreachable" && /<div class="state state-unreachable" data-state="unreachable"/.test(BUILD.down.replace(/<template[\s\S]*?<\/template>/g, "")) && guard.test(BUILD.down)
  && !/data-button="rank"(?![^>]*disabled)/.test(BUILD.down) && /The ledger did not answer/.test(regionIn(BUILD.down, "filings")) && /<template id="bd-offline"><div class="state state-unreachable"/.test(BUILD.full),
  "UNREACHABLE: a failed D1 statement shows the block, no enabled rank press, the shell refuses every POST before the press, and an offline browser gets the same (the template the page keeps)");
const rankTags = (h) => [...h.matchAll(/<button[^>]*data-button="rank"[^>]*>/g)].map((m) => m[0]);
ok(bDownAgg.live === "unreachable" && bDownAgg.rows.length > 0 && rankTags(BUILD.downAgg).length === bDownAgg.rows.filter((r) => r.chip !== "LANDED").length && rankTags(BUILD.downAgg).every((t) => / disabled\b/.test(t))
  && bDownAgg.counts.contributions === null && bStat(BUILD.downAgg, "contributions") === "–" && bStat(BUILD.downAgg, "in-motion") === "–" && !/>0 contributions</.test(BUILD.downAgg) && rankTags(BUILD.full).every((t) => !/ disabled\b/.test(t)),
  `UNREACHABLE with the rows read but the counts lost: ${bDownAgg.rows.length} row(s) drawn, every rank button (one per row not landed) disabled (none on the healthy page), the counts unknown ("–"), never a guessed zero`);
const tempoRows = [...regionIn(BUILD.full, "tempo").matchAll(/<li\b[^>]*\sdata-moved="/g)].length;
ok(tempoRows === 3 && bOwn.tempo.every((t) => t.id && t.tempo && t.ago) && !/>in</.test(regionIn(BUILD.full, "tempo")) && !/Work is filed from your own Claude/.test(regionIn(BUILD.full, "tempo")),
  `tempo: the three filings that moved last this week (title, the tempo word a person reads: "landed", never "in", how long ago), no legend prose (pristine copy) -> ${tempoRows} row(s)`);
// both ways: each injected defect goes red on its own check
const BMUT = [
  ["bar", "the Queue view (/thread) back on Build (shell.js TABS)", () => buildAudit(BUILD.full, cBuild, "owner", SRC.replace('views: [{ key: "build", label: "Build", href: "/build" }] },', 'views: [{ key: "build", label: "Build", href: "/build" }, { key: "transmission", label: "Queue", href: "/thread?only=waiting", ownerOnly: true }] },'))],
  ["bar", "a Files view (/artifacts) back on Build (shell.js TABS)", () => buildAudit(BUILD.full, cBuild, "owner", SRC.replace('views: [{ key: "build", label: "Build", href: "/build" }] },', 'views: [{ key: "build", label: "Build", href: "/build" }, { key: "artifacts", label: "Files", href: "/artifacts" }] },'))],
  ["bar", "a Queue view bar back on the page", () => buildAudit(injectViewBar(BUILD.full, '<a class="view-item" href="/build" data-view="build" aria-current="page">Build</a><a class="view-item" href="/thread?only=waiting" data-view="queue">Queue</a>'), cBuild, "owner")],
  ["door", "a POST /counter door on the counters button", () => buildAudit(BUILD.full.replace('data-button="counters" data-door="GET /build"', 'data-button="counters" data-door="POST /counter"'), cBuild, "owner")],
  ["door", "rank pressed at POST /ranks (a door that does not exist)", () => buildAudit(BUILD.full.replace('data-button="rank" data-door="POST /rank"', 'data-button="rank" data-door="POST /ranks"'), cBuild, "owner")],
  ["door", "a sort chip carrying a door the wireframe does not wire", () => buildAudit(BUILD.full.replace('data-button="sort" data-client=', 'data-button="sort" data-door="GET /build" data-client='), cBuild, "owner")],
  ["region", "the tempo region dropped", () => buildAudit(BUILD.full.replace('data-region="tempo"', 'data-x="tempo"'), cBuild, "owner")],
  ["input", "a text input on Build", () => buildAudit(BUILD.full.replace('<section class="bd" data-screen="build">', '<section class="bd" data-screen="build"><input type="text" name="q">'), cBuild, "owner")],
  ["chip", "a row with two state chips", () => buildAudit(BUILD.full.replace(/(<span class="p-chip"[^>]*data-chip="OPEN"[^>]*>[^<]*<\/span>)/, `$1${statusChip("LANDED")}`), cBuild, "owner")],
  ["emdash", "an em dash from a filing's own words", () => buildAudit(BUILD.full.replace("Workspace scoping: one column", "Workspace scoping — one column"), cBuild, "owner")],
  ["colour", "a hex colour in the page's own style", () => buildAudit(BUILD.full, cBuild.replace(".bd{display:block}", ".bd{display:block;color:#6B4FA8}"), "owner")],
  ["colour", "an old shell token in the page's own style", () => buildAudit(BUILD.full, cBuild.replace(".bd{display:block}", ".bd{display:block;color:var(--ink)}"), "owner")],
  ["colour", "a --bv-* palette name back in the page's own style", () => buildAudit(BUILD.full, cBuild.replace(".bd{display:block}", ".bd{display:block;color:var(--bv-dark-text)}"), "owner")],
];
ok(buildAudit(BUILD.full, cBuild, "owner").length === 0, "both ways: the clean Build render is green before any injection");
for (const [id, label, run] of BMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? "" : " (nothing went red: the injection did not apply or the check is blind)"}`);
}
ok(!/data-state="empty"/.test(regionIn(BUILD.full, "filings")) && /data-state="empty"/.test(regionIn(BUILD.empty, "filings")), "both ways: EMPTY shows on the project with no filing and never on the one with filings");
// both ways, the finish line: each wrong reading of a stage, run over the SAME fixture's rows, goes red on finishAudit
const stageAgg = (sql, sqlite = sfx.sqlite) => sqlite.prepare(sql).all("alpha", periodFrom("all").from);
const S_AGG = stageAgg(GOALS_AGG_SQL(true, false));
const S_ROLL = rollupCells(STAGE_TREE, S_AGG);
const pctOfId = new Map(S_ROLL.nodes.map((n) => [n.id, n.pct]));
const leavesOf = (t) => t.filter((n) => !t.some((k) => k.parent === n.id));
const tally = (list, doneIf, deferIf) => { const done = list.filter(doneIf).length, deferred = list.filter((n) => !doneIf(n) && deferIf(n)).length; return { done, total: list.length, gating: list.length - done - deferred, deferred }; };
const oldExport = (st) => { const x = st && st.finishLine; return x && Number(x.total) > 0 ? { done: x.done, total: x.total, gating: x.gating, deferred: x.deferred } : null; };
const REAL = { declared: stagesOf(STAGE_TREE, S_ROLL), stale: stagesOf(STAGE_TREE, S_ROLL), staleOnly: null, undeclared: null };
const SMUT = [
  ["stages", "every node counted as a stage (17, the segments and the root too)", () => ({ ...REAL, declared: tally(STAGE_TREE, (n) => pctOfId.get(n.id) >= 100, (n) => n.deferred === true) })],
  ["stages", "done at any progress (pct > 0)", () => ({ ...REAL, declared: tally(leavesOf(STAGE_TREE), (n) => pctOfId.get(n.id) > 0, (n) => n.deferred === true) })],
  ["stages", "a deferred leaf counted as gating", () => ({ ...REAL, declared: tally(leavesOf(STAGE_TREE), (n) => pctOfId.get(n.id) >= 100, () => false) })],
  ["export", "the state.json finishLine export read (the retired finishLineOf)", () => ({ ...REAL, stale: oldExport({ finishLine: STALE_EXPORT }), staleOnly: oldExport({ finishLine: STALE_EXPORT }) })],
  ["stages", "an eval row moving a stage (the aggregate read with ?eval=1)", () => ({ ...REAL, declared: stagesOf(STAGE_TREE, rollupCells(STAGE_TREE, stageAgg(GOALS_AGG_SQL(true, true)))) })],
  ["stages", "a counter moving a stage (the aggregate without GOALS_NOT_KIND)", () => ({ ...REAL, declared: stagesOf(STAGE_TREE, rollupCells(STAGE_TREE, stageAgg(GOALS_AGG_SQL(true, false).replace("AND COALESCE(+kind,'') NOT IN " + GOALS_NOT_KIND + " ", "")))) })],
  ["stages", "another project's row moving a stage (the aggregate unscoped)", () => ({ ...REAL, declared: stagesOf(STAGE_TREE, rollupCells(STAGE_TREE, sfx.sqlite.prepare(GOALS_AGG_SQL(true, false).replace("project = ?", "project IS NOT ?")).all("zz", periodFrom("all").from))) })],
  ["default", "the default tree used when none is declared", () => ({ ...REAL, undeclared: stagesOf(DEFAULT_GOALS.tree, rollupCells(DEFAULT_GOALS.tree, stageAgg(GOALS_AGG_SQL(true, false)))) })],
];
ok(finishAudit(REAL).length === 0 && sameStages(REAL.declared, bFinish.finishLine), "both ways: the real stagesOf over the fixture's own aggregate is green before any injection, and equals readBuild's");
for (const [id, label, run] of SMUT) {
  let f = [];
  try { f = finishAudit(run()); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? ` (${f[0].slice(0, 90)})` : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

// ---- 8. UI-B5a: the ONE state chip (design-law stateChips, QB74B1B7E) ----
// The law's 11 chips, their grounds and texts, and the tempo -> chip mapping are read from the pinned design-law.json;
// the colours a chip actually wears are resolved through shell.js's OWN --bv-* token values (BRAND_TOKENS_CSS), so a
// token that drifts goes red here too. chipAudit(o) -> failures by check id; o carries every seam an injection swaps.
const LAW_CHIPS = (LAW.stateChips && LAW.stateChips.chips) || [];
const BV = new Map([...BRAND_TOKENS_CSS.matchAll(/(--bv-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)].map((m) => [m[1], hex6(m[2])]));
const ORANGE_HEX = new Set([...TOKENS.entries()].filter(([, n]) => /orange|peach/.test(n)).map(([h]) => h).concat(["D97757"]));
const RED_HEX = new Set(LAW.inkStates.tokens.filter((t) => t.n.startsWith("error")).flatMap((t) => [t.v, t.well, t.paper]).map(hex6));
const COLOUR_PROP = /^(color|background(-color)?|border(-[a-z]+)?|outline|box-shadow)$/;
// a CSS value -> the hex colours it resolves to (var(--bv-*) through shell.js's own values, or a literal)
// the look pass: a colour names a SEMANTIC token (--needs, --ok-tint, --well …) that each world points at the palette. INK_SEM
// is the Ink world (shell.js INK_WORLD plus the legacy aliases), PAPER_SEM the Paper one (PAPER_WORLD, which also re-points the
// Ink --bv-* names at the Paper roles); hexesIn resolves a value down to the palette's own --bv-* values (BV), color-mix included
const declsOf = (css) => new Map([...String(css).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const INK_SEM = declsOf(INK_WORLD + LEGACY_ALIASES), PAPER_SEM = declsOf(PAPER_WORLD);
function hexesIn(v, world, depth = 0) {
  const out = [];
  for (const m of String(v || "").matchAll(/var\(\s*(--[\w-]+)\s*\)|#([0-9a-fA-F]{3,8})\b/g)) {
    if (m[2]) { out.push(hex6(m[2])); continue; }
    if (depth < 8 && world.has(m[1])) out.push(...hexesIn(world.get(m[1]), world, depth + 1));
    else out.push(BV.get(m[1]) || `unresolved ${m[1]}`);
  }
  return out;
}
// a CSS value -> the hex colours it resolves to in Ink (the law's chips are Ink values)
const hexesOf = (v) => hexesIn(v, INK_SEM);
const cssRules = (css) => [...String(css).matchAll(/([^{}`$;]+)\{([^{}]*)\}/g)].map((m) => ({ sels: m[1].split(",").map((x) => x.trim()), decl: Object.fromEntries(m[2].split(";").filter((d) => d.includes(":")).map((d) => [d.slice(0, d.indexOf(":")).trim().toLowerCase(), d.slice(d.indexOf(":") + 1).trim()])) }));
// the chip's effective declarations: the base .state-chip rule, then its own [data-chip="X"] rule, in source order
function chipEffective(css, c) {
  const eff = {};
  for (const r of cssRules(css)) if (r.sels.some((x) => x === ".state-chip") ) Object.assign(eff, r.decl);
  for (const r of cssRules(css)) if (r.sels.some((x) => x === `.state-chip[data-chip="${c}"]`)) Object.assign(eff, r.decl);
  return eff;
}
const chipsIn = (html) => [...String(html || "").matchAll(/<([a-z]+)\b[^>]*\bdata-chip="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({ chip: m[2], inner: m[3] }));
const CHIP_PAGES = ["home", "decisions", "question", "build", "filing"];
function chipAudit(o) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const law = new Map(LAW_CHIPS.map((c) => [c.chip, c]));
  if (law.size !== 11 || JSON.stringify([...law.keys()]) !== JSON.stringify(STATE_CHIPS)) fail("law", `ui.js STATE_CHIPS [${STATE_CHIPS.join(" ")}] is not the law's 11 [${[...law.keys()].join(" ")}]`);
  // (1) the colours: each chip on the law's ground and text; gap dashed stone; no orange; red only on ERROR
  for (const [c, want] of law) {
    const eff = chipEffective(o.css, c);
    const bg = hexesOf(eff["background-color"] || eff.background), fg = hexesOf(eff.color);
    if (bg.length !== 1 || bg[0] !== hex6(want.ground)) fail("chip-colour", `${c}: background ${bg.join(" ") || "none"}, the law says ${hex6(want.ground)}`);
    if (fg.length !== 1 || fg[0] !== hex6(want.text)) fail("chip-colour", `${c}: text ${fg.join(" ") || "none"}, the law says ${hex6(want.text)}`);
    if (want.line) { const b = String(eff.border || ""); const lh = (/#[0-9a-fA-F]{6}/.exec(want.line) || [""])[0]; if (!/\bdashed\b/.test(b) || !hexesOf(b).includes(hex6(lh))) fail("chip-colour", `${c}: the law draws it ${want.line}; its border is "${b}"`); }
    const all = Object.entries(eff).filter(([k]) => COLOUR_PROP.test(k)).flatMap(([, v]) => hexesOf(v));
    for (const h of all) { if (ORANGE_HEX.has(h)) fail("orange", `${c}: wears orange #${h} (orange is identity, never a state)`); if (c !== "ERROR" && RED_HEX.has(h)) fail("red", `${c}: wears red #${h} (red is ERROR's alone)`); }
  }
  // (1b) the look pass: in Paper the same rules resolve through PAPER_WORLD to the law's Paper state family (design-law
  // inkStates[].paper): a needs chip reads amber, LANDED verified green, ERROR the Paper error red; never orange; red only on ERROR
  const PAPER_OF = Object.fromEntries(LAW.inkStates.tokens.map((t) => [t.n, hex6(t.paper)]));
  const WANT_PAPER = { BLOCKER: ["background", "needs-ink"], HIGH: ["color", "needs-ink"], OPEN: ["color", "needs-ink"], DECIDE: ["color", "needs-ink"],
    APPROVE: ["color", "needs-ink"], GRANT: ["color", "needs-ink"], LANDED: ["color", "verified-ink"], ERROR: ["color", "error-ink"] };
  const paperSem = o.paper || PAPER_SEM;
  for (const c of law.keys()) {
    const eff = chipEffective(o.css, c);
    for (const h of Object.entries(eff).filter(([k]) => COLOUR_PROP.test(k)).flatMap(([, v]) => hexesIn(v, paperSem))) {
      if (/^unresolved/.test(h)) fail("paper", `${c}: in Paper a colour is ${h}`);
      else if (ORANGE_HEX.has(h)) fail("paper", `${c}: in Paper it wears orange #${h} (orange is identity, never a state)`);
      else if (c !== "ERROR" && RED_HEX.has(h)) fail("paper", `${c}: in Paper it wears red #${h} (red is ERROR's alone)`);
    }
    const w = WANT_PAPER[c];
    if (w) { const got = hexesIn(eff[w[0]] || (w[0] === "background" ? eff["background-color"] : ""), paperSem); if (!got.includes(PAPER_OF[w[1]])) fail("paper", `${c}: in Paper its ${w[0]} does not resolve to the law's Paper ${w[1]} #${PAPER_OF[w[1]]} (got ${got.join(" ") || "none"})`); }
  }
  // (2) the helper: each law chip renders exactly one data-chip, itself; ERROR carries its icon; an unknown is never a 12th
  for (const c of law.keys()) {
    let html = ""; try { html = String(o.stateChip(c)); } catch (e) { fail("helper", `stateChip("${c}") threw: ${e.message}`); continue; }
    const got = chipsIn(html).map((x) => x.chip);
    if (got.length !== 1 || got[0] !== c) fail("helper", `stateChip("${c}") renders data-chip [${got.join(" ")}]`);
    if (c === "ERROR" && !/<svg\b/.test(html)) fail("icon", "stateChip(\"ERROR\") carries no icon (red only beside its icon)");
  }
  let bogus = []; try { bogus = chipsIn(o.stateChip("URGENT")).map((x) => x.chip); } catch (e) { bogus = []; }
  if (bogus.some((x) => !law.has(x))) fail("twelfth", `stateChip("URGENT") renders a 12th chip value [${bogus.join(" ")}]`);
  // (3) one home for chip colour: no other src/*.js carries a rule that colours a chip, and only ui.js writes data-chip
  for (const [file, src] of Object.entries(o.sources)) {
    if (file !== "shell.js") for (const r of cssRules(src)) if (r.sels.some((x) => /\.state-chip\b|\[data-chip\b/.test(x)) && Object.keys(r.decl).some((k) => COLOUR_PROP.test(k))) fail("local", `${file}: a chip colour rule "${r.sels.join(",")}" (chip colour lives once, in shell.js CHIP_CSS)`);
    if (file !== "ui.js" && /(?<![[\w-])data-chip\s*=/.test(src)) fail("local", `${file}: writes data-chip by hand (ui.js stateChip is the ONE helper)`);
  }
  // (4) tempoChip maps design-law tempo.stages[].chip; a reject or a send-back is REVIEW, never LANDED
  for (const st of LAW.tempo.stages) {
    const word = st.stage === "with <owner>" ? "with Owen Park" : st.stage;
    const got = chipsIn(o.tempoChip(word, st.stage === "decided" ? "approve" : undefined)).map((x) => x.chip);
    if (got.length !== 1 || got[0] !== st.chip) fail(got.includes("ERROR") ? "red" : "tempo", `tempoChip("${word}") wears [${got.join(" ")}], the law's tempo stage says ${st.chip}`);
  }
  for (const d of ["reject", "needs-work"]) {
    const got = chipsIn(o.tempoChip("decided", d)).map((x) => x.chip);
    if (got.length !== 1 || got[0] !== "REVIEW") fail(got.includes("LANDED") ? "green" : "tempo", `tempoChip("decided", "${d}") wears [${got.join(" ")}], want REVIEW (a ${d} is never green)`);
  }
  // (5) the real pages: at least one chip each, every one of the 11, ERROR only with its icon; Decisions' own mapping
  for (const pg of CHIP_PAGES) {
    const cs = chipsIn(o.renders[pg]);
    if (!cs.length) fail("pages", `the rendered ${pg} carries no data-chip (its chips bypass the helper)`);
    for (const x of cs) { if (!law.has(x.chip)) fail("twelfth", `the rendered ${pg} carries data-chip="${x.chip}", not one of the 11`); if (x.chip === "ERROR" && !/<svg\b/.test(x.inner)) fail("icon", `the rendered ${pg} carries an ERROR chip without its icon`); }
  }
  for (const art of String(o.renders.decisions || "").match(/<article\b[^>]*\sdata-qid="[\s\S]*?<\/article>/g) || []) {
    const st = (/data-status="([^"]*)"/.exec(art) || [])[1], cs = chipsIn(art).map((x) => x.chip);
    const want = st === "open" ? ["BLOCKER", "HIGH", "OPEN"] : ["superseded", "moot", "provisional"].includes(st) ? ["REVIEW"] : ["pending"];
    if (cs.length > 1 || (st === "open" && cs.length !== 1) || cs.some((c) => !want.includes(c))) fail("decisions", `a Decisions row (${st}) wears [${cs.join(" ")}], want ${st === "open" ? "one of " : "at most "}[${want.join(" ")}]`);
  }
  return f;
}
const CHIP_RENDERS = { home: HOME.full, decisions: B2.decisions, question: B2.question, build: BUILD.full, filing: FILING.full };
const CHIP_O = { css: CHIP_CSS, sources: SOURCES, stateChip, tempoChip, renders: CHIP_RENDERS };
const chipClean = chipAudit(CHIP_O);
const chipCounts = Object.fromEntries(CHIP_PAGES.map((p) => [p, chipsIn(CHIP_RENDERS[p]).length]));
ok(chipClean.length === 0 && LAW_CHIPS.length === 11 && BV.size >= 20,
  `the ONE state chip (QB74B1B7E): the law's ${LAW_CHIPS.length} chips on their law colours through shell.js's ${BV.size} --bv-* values, gap dashed stone, ERROR with its icon, no orange, red only on ERROR; chip colour in shell.js alone, data-chip written by ui.js alone; tempoChip on the law's tempo stages; rendered chips ${JSON.stringify(chipCounts)} all of the 11${chipClean.length ? `\n      ${chipClean.join("\n      ")}` : ""}`);
ok(STATE_CSS.includes(CHIP_CSS.trim()) && /\$\{STATE_CSS\}/.test(SRC), "CHIP_CSS rides inside STATE_CSS, which the shell serves on every page");
const withCss = (extra) => ({ ...CHIP_O, css: CHIP_CSS + extra });
const CMUT = [
  ["orange", "an orange GRANT", () => chipAudit(withCss('.state-chip[data-chip="GRANT"]{background:var(--bv-orange-well);color:var(--bv-orange)}'))],
  ["chip-colour", "a green APPROVE", () => chipAudit(withCss('.state-chip[data-chip="APPROVE"]{background:var(--bv-verified-well);color:var(--bv-verified-ink)}'))],
  ["paper", "Paper's needs pointed at orange (PAPER_WORLD --needs on orange-deep)", () => chipAudit({ ...CHIP_O, paper: declsOf(PAPER_WORLD.replace("--needs:var(--bv-amber);", "--needs:var(--bv-orange-deep);")) })],
  ["paper", "Paper's LANDED off the verified family (PAPER_WORLD --ok on stone)", () => chipAudit({ ...CHIP_O, paper: declsOf(PAPER_WORLD.replace("--ok:color-mix(in srgb,var(--bv-verified) 76%,var(--bv-ink));", "--ok:var(--bv-stone);")) })],
  ["red", "a red needs-more (the gap chip drawn in error-ink)", () => chipAudit(withCss('.state-chip[data-chip="gap"]{color:var(--bv-error-ink);background:var(--bv-error-well)}'))],
  ["red", "a red needs-more (tempoChip maps it to ERROR)", () => chipAudit({ ...CHIP_O, tempoChip: (w, d) => (w === "needs more" ? stateChip("ERROR", w) : tempoChip(w, d)) })],
  ["green", "a green reject (tempoChip maps decided+reject to LANDED)", () => chipAudit({ ...CHIP_O, tempoChip: (w, d) => (d === "reject" ? stateChip("LANDED", w) : tempoChip(w, d)) })],
  ["local", "a page-local chip rule (home.js colours its chip)", () => chipAudit({ ...CHIP_O, sources: { ...SOURCES, "home.js": SOURCES["home.js"].replace(".hm{display:block}", ".hm{display:block}\n.hm .state-chip{margin:0 0 6px;color:var(--accent)}") } })],
  ["local", "a hand-written data-chip in build.js", () => chipAudit({ ...CHIP_O, sources: { ...SOURCES, "build.js": SOURCES["build.js"] + '\nconst x = `<span data-chip="OPEN">OPEN</span>`;' } })],
  ["twelfth", "a 12th chip on a rendered page", () => chipAudit({ ...CHIP_O, renders: { ...CHIP_RENDERS, home: CHIP_RENDERS.home.replace(statusChip("GRANT", "Grant", "quiet"), '<span class="p-chip" data-chip="URGENT">Grant</span>') } })],
  ["twelfth", "a 12th chip from the helper (an unknown state passed through)", () => chipAudit({ ...CHIP_O, stateChip: (c, w) => (STATE_CHIPS.includes(c) ? stateChip(c, w) : `<span class="state-chip" data-chip="${c}">${c}</span>`) })],
  ["icon", "ERROR without its icon", () => chipAudit({ ...CHIP_O, stateChip: (c, w) => stateChip(c, w).replace(/<svg[\s\S]*?<\/svg>/, "") })],
];
ok(chipAudit(CHIP_O).length === 0, "both ways: the clean chip audit is green before any injection");
for (const [id, label, run] of CMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? ` (${f.find((x) => x.startsWith(id + ":")) || f[0]})` : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

// ---- 9. UI-B5b: Versions (wf-versions), the version chip on every Map view, and BEHIND ----
const WFV = SCREEN("wf-versions");
ok(!!WFV && JSON.stringify(WFV.regions) === JSON.stringify(VERSIONS_REGIONS) && JSON.stringify(WFV.buttons) === JSON.stringify(["view", "restore", "back-to-current", "filter", "version-chip"])
  && WFV.wires.view.door === "GET /versions/:v" && WFV.wires.restore.door === "POST /versions/restore" && WFV.wires["version-chip"].door === "GET /versions" && !WFV.wires.filter.door && !WFV.wires["back-to-current"].door
  && (WFV.superseded || []).some((x) => /orange/.test(x.el) && /BEHIND/.test(x.now)),
  `the pinned wireframe's wf-versions: ${WFV ? `${WFV.regions.length} regions [${WFV.regions.join(" ")}], ${WFV.buttons.length} buttons, its doors, the orange banner superseded by BEHIND` : "absent"}; src/versionsview.js draws the same three regions`);
const VFX = await versionsFixture(), VFX0 = await versionsFixture({ empty: true });
const V_OWNER = PERSONAS.owner.reader, V_SEAT = PERSONAS.contributor.reader;
const vPage = (persona, read, path) => shell({ ...PERSONAS[persona], active: "versions", content: renderVersions(read, { brand, ownerLabel: "Owen Park", path }), brand, briefCount: 3,
  head: read.current || null, scope: "alpha" });
const vRead = { current: await readVersionsView(VFX.env, V_SEAT, {}), older: await readVersionsView(VFX.env, V_SEAT, { v: "1" }), ownerOlder: await readVersionsView(VFX.env, V_OWNER, { v: "1" }),
  empty: await readVersionsView(VFX0.env, V_SEAT, {}) };
const VER = { current: vPage("contributor", vRead.current, "/versions"), older: vPage("contributor", vRead.older, "/versions/1"), ownerOlder: vPage("owner", vRead.ownerOlder, "/versions/1"), empty: vPage("contributor", vRead.empty, "/versions") };
const cVer = renderVersions(vRead.older, { brand, ownerLabel: "Owen Park", path: "/versions/1" });
// versionsAudit(html, content, persona, o) -> failures by check id: the screen audit, the artboard's order, the page's own
// content (no colour literal, the semantic tokens only), the banner (BEHIND viewing an older version, LANDED on the current one),
// Restore (a POST for the owner, disabled with its reason for anyone else), the chip on the bar
function versionsAudit(html, content, persona, o = {}) {
  // D6a: the version chip is the Map views' (their bar); the Versions page names its version in its own head
  const skip = new RegExp(`button (${[...(o.absent || []), "version-chip"].join("|")}) not rendered`);
  const f = screenAudit(html, WFV, { pins: 0 }).filter((x) => !skip.test(x));
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const idx = VERSIONS_REGIONS.map((r) => html.indexOf(`data-region="${r}"`));
  if (idx.some((i) => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) fail("region", `wf-versions: the regions are not in the artboard's order (${VERSIONS_REGIONS.join(" ")})`);
  const own = noUchan(content).replace(/<style>([\s\S]*?)<\/style>/, (m, css) => css);
  for (const m of own.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) fail("colour", `wf-versions: a colour literal #${m[1]} in the page's own content`);
  lookVarFails(own, "wf-versions", fail);
  const banner = (regionOf(html, "not-current-banner") || { inner: "" }).inner;
  if (o.view === "older" && !/data-state="behind"/.test(banner)) fail("behind", "viewing an older version is not the BEHIND pattern");
  if (o.view === "older" && !/data-button="back-to-current" data-client="[^"]+"[^>]*>See v\d+</.test(banner)) fail("behind", "BEHIND has no back-to-current (See v<n>, client-side)");
  if (o.view === "current" && (!/data-chip="LANDED"/.test(banner) || /data-state="behind"/.test(banner))) fail("banner", "the current version does not say so with the LANDED chip (or says BEHIND)");
  const restore = [...html.matchAll(/<button[^>]*data-button="restore"[^>]*>/g)].map((m) => m[0]);
  if (persona === "owner" && o.view === "older" && (restore.length !== 1 || / disabled\b/.test(restore[0]) || !/<form method="POST" action="\/versions\/restore">/.test(html))) fail("restore", "the owner's Restore is not an enabled POST /versions/restore");
  if (persona !== "owner" && o.view === "older" && (restore.length !== 1 || !/ disabled\b/.test(restore[0]) || !html.includes(esc4(RESTORE_REASON("Owen Park"))) || /action="\/versions\/restore"/.test(html))) fail("restore", "a seated reader's Restore is not disabled with its reason (or a restore form is on their page)");
  const bar = viewBarOf(html);
  // D6a: the Versions page's own bar carries no version chip (its head names the version: the state said once); every other
  // Map view's does (below)
  if (/data-button="version-chip"/.test(bar) || (html.match(/Not versioned yet/g) || []).length > 1) fail("chip", "the Versions page says its version twice (a version chip on its own bar, or Not versioned yet more than once)");
  return [...f, ...audit(html, persona, SRC)];
}
const vAud = { older: versionsAudit(VER.older, cVer, "contributor", { view: "older" }), ownerOlder: versionsAudit(VER.ownerOlder, renderVersions(vRead.ownerOlder, { brand, ownerLabel: "Owen Park", path: "/versions/1" }), "owner", { view: "older" }),
  current: versionsAudit(VER.current, renderVersions(vRead.current, { brand, ownerLabel: "Owen Park" }), "contributor", { view: "current", absent: ["restore", "back-to-current"] }),
  empty: versionsAudit(VER.empty, renderVersions(vRead.empty, { brand }), "contributor", { absent: ["restore", "back-to-current", "view", "filter"] }) };   // no version: nothing to filter
ok(vAud.older.length === 0, `Versions (Versions.dc.html), a seat viewing v1: three regions non-empty in order, five buttons on their own doors or client-side, every door in door.json, no typed input, no em dash, the semantic tokens only, BEHIND with back-to-current, Restore disabled with its reason, the chip on the bar, and the shell's own audit${vAud.older.length ? `\n      ${vAud.older.join("\n      ")}` : ""}`);
ok(vAud.ownerOlder.length === 0, `the owner viewing v1: the same, and Restore an enabled POST /versions/restore${vAud.ownerOlder.length ? `\n      ${vAud.ownerOlder.join("\n      ")}` : ""}`);
ok(vAud.current.length === 0 && /You are looking at v2, the current version/.test(VER.current), `the current version (v2): it says so with the LANDED chip, no BEHIND, no Restore${vAud.current.length ? `\n      ${vAud.current.join("\n      ")}` : ""}`);
const vIn = (h, r) => (regionOf(h, r) || { inner: "" }).inner;
ok(vAud.empty.length === 0 && vIn(VER.empty, "timeline").includes(TIMELINE_EMPTY("Alpha")) && vIn(VER.empty, "diff").includes(DIFF_EMPTY_NONE) && /data-state="empty"/.test(vIn(VER.empty, "timeline")) && /Not versioned yet/.test(VER.empty),
  `EMPTY with no spine: "${TIMELINE_EMPTY("Alpha")}", the diff's own sentence, and the chip reads Not versioned yet${vAud.empty.length ? `\n      ${vAud.empty.join("\n      ")}` : ""}`);
ok(new RegExp(`<a\\b[^>]*href="/question/${V_RULED_QID}"`).test(vIn(VER.current, "diff")) && /Changes v1 → v2/.test(VER.current) && /1 question changed/.test(vIn(VER.current, "timeline"))
  && /v1 is the first/.test(vIn(VER.older, "diff")),
  `v2's changes name ${V_RULED_QID} as a link to its question, under "Changes v1 → v2", and its timeline row reads "1 question changed"; v1 has nothing before it (sprint 3 L3: labels, not sentences)`);
// the viewing tag (its hook data-viewing) wears the identity tint (--accent-tint: the look pass's name for orange-well): design-law
// tokenDecisions names it identity (the selected row), never a state chip
const vViewTag = (/<span\b([^>]*)\sdata-viewing\b[^>]*>viewing<\/span>/.exec(vIn(VER.older, "timeline")) || [])[1] || "";
const vViewCls = (/class="([a-z0-9-]+)"/.exec(vViewTag) || [])[1] || "-";
ok(!!vViewTag && new RegExp(`\\.${vViewCls}\\{[^}]*var\\(--accent-tint\\)`).test(cVer) && !/state-chip/.test(vViewTag) && /data-n="1" data-cause="[a-z]+" aria-current="true"/.test(vIn(VER.older, "timeline")),
  "the viewing tag on the viewed row (aria-current) wears the identity tint (--accent-tint): design-law tokenDecisions names it identity (the selected row), not a state");
// every Map view carries the chip; Versions is a VIEW: the tab row is the eight (GTM joined with its screen, UI-B10b; Broadcast with its screen, UI-B11b), the Map row's views end on Versions
const mapPage = (active, head) => shell({ ...PERSONAS.contributor, active, content, brand, briefCount: 3, head });
const MAPV = { arch: mapPage("arch", { n: 2 }), map: mapPage("map", { n: 2 }), data: mapPage("data", { n: 2 }), api: mapPage("api", { n: 2 }), mcp: mapPage("mcp", { n: 2 }), flows: mapPage("flows", { n: 2 }), deps: mapPage("deps", { n: 2 }) };   // D6a: Versions names its version in its own head (versionsAudit), not on its bar
const chipOf = (h) => /<nav\b[^>]*\saria-label="Views"[\s\S]*?<a class="version-chip" href="\/versions" data-button="version-chip" data-door="GET \/versions"[^>]*><span class="state-chip" data-chip="LANDED">v2 · current<\/span><\/a><\/nav>/.test(h);
const mapRow = (/\{ key: "map", label: "Map", icon: "eagle",\s*views: \[([^\]]*)\]/.exec(SRC) || [])[1] || "";
const mapAudit = (pages, src) => { const f = []; for (const [k, h] of Object.entries(pages)) if (!chipOf(h)) f.push(`chip: the Map view ${k} carries no version chip`);
  if (/data-button="version-chip"/.test(VER.current.replace(/<header class="mx-bar"[\s\S]*?<\/header>/g, ""))) f.push("chip: the Versions view carries the version chip on its own bar");
  if (!/\{ key: "versions", label: "Versions", href: "\/versions" \}\s*$/.test(((/\{ key: "map", label: "Map", icon: "eagle",\s*views: \[([^\]]*)\]/.exec(src) || [])[1] || "").trim())) f.push("tab: the Map row's views do not end on Versions");
  if ([...((/const TABS = \[([\s\S]*?)\n\];/.exec(src) || [])[1] || "").matchAll(/^\s*\{ key: "(\w+)", label:/gm)].length !== 8) f.push("tab: TABS no longer registers the eight tabs (Versions is a view, not a tab; Broadcast is the eighth, UI-B11b)");
  return f; };
const mapF = mapAudit(MAPV, SRC);
ok(mapF.length === 0 && /Versions<\/a>/.test(VER.current) && tabsOf(pages.owner).length === 8 && /Not versioned yet/.test(versionChip(null)) && !/Not versioned/.test(pages.contributor),
  `every page of the Map tab (the Map, the old plane keys arch, data, api, mcp, flows, deps; Versions names it in its own head) carries the version chip "v2 · current" on GET /versions (the Map page itself carries it in its own bar: section 9-14); the Map row's views [${mapRow.replace(/\s+/g, " ").trim().slice(0, 140)}...]; the tab row is the eight; no chip off the Map tab${mapF.length ? `\n      ${mapF.join("\n      ")}` : ""}`);
// BEHIND, one pattern (design-law design.behind): its markup, its own icon, the stone well, dark text, never orange or red
const BEH = { page: behindState({ page: "This page", head: { n: 3 } }), viewing: behindState({ head: { n: 3 }, viewing: { n: 1, at: "2026-09-12T09:00:00.000Z" } }) };
const iconOf = (h) => (/<svg[\s\S]*?<\/svg>/.exec(h) || [""])[0];
// orange, by shell.js's own token NAMES too (the pinned law names #FB923C's hex after the pin-ink shadow as well, so the
// hex map alone can miss the brand orange itself)
const BEHIND_ORANGE = new Set([...ORANGE_HEX, ...[...BV].filter(([n]) => /orange|peach/.test(n)).map(([, h]) => h)]);
function behindAudit(st, css, page) {
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const law = LAW.behind || {};
  for (const [k, h] of Object.entries(st)) {
    if (!/^<div class="state state-behind" data-state="behind" role="status"><svg\b/.test(h)) fail("behind", `${k}: not the shared markup (data-state=behind, role=status, its icon first)`);
    const ic = iconOf(h);
    if (!ic || ic === iconOf(errorState({})) || ic === iconOf(unreachableState())) fail("behind", `${k}: its icon is ERROR's or UNREACHABLE's, not its own`);
    if (!/Acting still works/.test(h) || !/>See v3</.test(h)) fail("behind", `${k}: does not say acting still works, or its one action is not "See v3"`);
    if (/—|&mdash;/.test(h)) fail("emdash", `${k}: an em dash in BEHIND`);
  }
  if (!/You are looking at v1, from 12 September\. It is not the current version\. Viewing changes nothing\./.test(st.viewing)) fail("behind", "viewing: not the wireframe's sentence (You are looking at v1, from 12 September...)");
  const rules = cssRules(css).filter((r) => r.sels.some((x) => /\.state-behind\b|\[data-state="behind"\]/.test(x)));
  const eff = Object.assign({}, ...rules.filter((r) => r.sels.some((x) => x === ".state-behind")).map((r) => r.decl));
  const bg = hexesOf(eff.background || eff["background-color"]), fg = hexesOf(eff.color);
  if (bg[0] !== hex6(law.ground || "#262421") || BV.get("--bv-dark-3") !== bg[0]) fail("behind", `the well is ${bg.join(" ") || "none"}, the law's stone well is ${law.ground}`);
  if (fg[0] !== hex6(law.text || "#EBE6DC")) fail("behind", `the text is ${fg.join(" ") || "none"}, the law's dark-text is ${law.text}`);
  for (const r of rules) for (const [k, v] of Object.entries(r.decl)) if (COLOUR_PROP.test(k)) for (const h of hexesOf(v)) { if (BEHIND_ORANGE.has(h)) fail("orange", `${r.sels.join(",")}: ${k} is orange #${h} (orange is identity, never a state)`); if (RED_HEX.has(h)) fail("red", `${r.sels.join(",")}: ${k} is red #${h} (red is ERROR's alone)`); }
  for (const r of cssRules(css)) if (r.sels.some((x) => /data-state="behind"/.test(x)) && /pointer-events:\s*none/.test(Object.entries(r.decl).map(([k, v]) => `${k}:${v}`).join(";"))) fail("block", "BEHIND blocks a press (it warns and still lets you act)");
  // read in the page's SCRIPTS only (the look pass): the BEHIND template's markup sits right before the shell's script, whose
  // UNREACHABLE guard is not a BEHIND guard; the old span check was kept apart from it only by a semicolon inside a comment
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.some((sc) => /data-state="behind"[^;]*addEventListener\('submit'|addEventListener\('submit'[^;]*data-state="behind"/.test(sc))) fail("block", "the shell refuses a write while BEHIND is on the page");
  if (!/<meta name="sharingu-served" content="[^"]+" data-scope="alpha">/.test(page) || !/fetch\(headUrl,/.test(page) || !/var headUrl=orgPath\('\/versions\?head=1'\)\+\(scope\?'&project='\+encodeURIComponent\(scope\):''\)/.test(page) || !/setInterval\(poll,120000\)/.test(page) || !/visibilitychange/.test(page) || !/<template id="sg-behind"><div class="state state-behind"/.test(page)) fail("poll", "a page with a version head does not stamp sharingu-served and poll GET /versions?head=1 on focus, visibility and every 120 s");
  return f;
}
// the poll, RUN: the shell's own client script against a minimal DOM stub (a meta, main.content, the template, a stubbed
// fetch and localStorage): a newer head inserts BEHIND ("v4"), the same head inserts nothing, a newer publish this browser
// already saw shows it on load with no request, the poll is GET /versions?head=1 no-store every 120 s, no submit guard
async function pollSim(page, { served, head, stored }) {
  const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const tpl = (/<template id="sg-behind">([\s\S]*?)<\/template>/.exec(page) || [])[1] || "";
  const inserted = [], listeners = {}, docListeners = {}, fetched = []; let interval = null;
  const main = { firstChild: null, insertBefore(el) { inserted.push(el); } };
  const ls = new Map(stored ? [["sharingu-seen-at:alpha", JSON.stringify(stored)]] : []);
  const document = { visibilityState: "visible", querySelectorAll: () => [], addEventListener: (t, f) => { docListeners[t] = f; },
    querySelector: (sel) => (sel === 'meta[name="sharingu-served"]' ? { getAttribute: (a) => (a === "content" ? served : "alpha") } : sel === "main.content" ? main : sel.includes('data-state="behind"') ? (inserted.length ? {} : null) : null),
    getElementById: (id) => (id === "sg-behind" ? { innerHTML: tpl } : null),
    createElement: () => ({ set innerHTML(v) { this.firstElementChild = { html: v, setAttribute() {} }; } }) };
  const run = new Function("document", "window", "localStorage", "fetch", "setInterval", script);
  run(document, { fetch: true, addEventListener: (t, f) => { listeners[t] = f; } }, { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) },
    async (u, o) => { fetched.push(`${u} ${o && o.cache}`); return { ok: true, json: async () => head }; }, (f, ms) => { interval = ms; });
  const onLoad = inserted.length;
  if (listeners.focus) listeners.focus();
  await new Promise((r) => setTimeout(r, 5));
  const w = inserted[0] ? `${(/state-what">([^<]*)/.exec(inserted[0].html) || [])[1]} | ${(/>(See [^<]*)</.exec(inserted[0].html) || [])[1]}` : "";
  return { onLoad, after: inserted.length, what: w, fetched, interval, guard: !!docListeners.submit };
}
async function pollAudit(page) {
  const f = [];
  const H = { n: 4, at: "2026-09-28T06:00:00.000Z", title: "t", cause: "published" };
  const newer = await pollSim(page, { served: "2026-09-28T05:00:00.000Z", head: H });
  const same = await pollSim(page, { served: "2026-09-28T06:00:00.000Z", head: H });
  const seen = await pollSim(page, { served: "2026-09-28T05:00:00.000Z", head: null, stored: { at: "2026-09-28T06:00:00.000Z", n: 4 } });
  if (newer.after !== 1 || !/behind: v4 was published/.test(newer.what) || !/See v4/.test(newer.what)) f.push(`poll: a newer head did not insert BEHIND (${newer.after}: "${newer.what}")`);
  if (same.after !== 0) f.push("poll: the same head inserted BEHIND");
  if (seen.onLoad !== 1) f.push("poll: a newer publish already seen (localStorage) did not show BEHIND on load");
  if (newer.fetched[0] !== "/versions?head=1&project=alpha no-store" || newer.interval !== 120000) f.push(`poll: not GET /versions?head=1&project=<the page's project> no-store every 120 s (${newer.fetched[0]}, ${newer.interval})`);
  if (newer.guard) f.push("block: the page refuses a write while BEHIND shows");
  return f;
}
const pAud = await pollAudit(VER.current);
ok(pAud.length === 0, `the head poll, run against a DOM stub: a newer head inserts "This page is behind: v4 ... See v4", the same head nothing, a newer publish already seen shows on load, GET /versions?head=1 no-store every 120 s, no write guard${pAud.length ? `\n      ${pAud.join("\n      ")}` : ""}`);
const pMut = await pollAudit(VER.current.replace("if(Date.parse(at)>served)behind(h.n)", "if(Date.parse(at)<served)behind(h.n)"));
ok(pMut.some((x) => x.startsWith("poll:")), `both ways: a poll whose compare is turned around goes red on "poll" (${pMut[0] || "nothing went red"})`);
const bAud = behindAudit(BEH, STATE_CSS, VER.current);
ok(bAud.length === 0 && !/<meta name="sharingu-served"/.test(pages.anonymous || "") && !/<template id="sg-behind">/.test(pages.anonymous || "") && inDoor("GET", "/versions"),
  `BEHIND (design-law design.behind): data-state=behind role=status with its own icon, the stone well (dark-3) with dark text, never orange or red, never a write block, "See v<n>"; a signed-in page with a version head stamps sharingu-served and polls GET /versions?head=1; the anonymous page does not${bAud.length ? `\n      ${bAud.join("\n      ")}` : ""}`);
ok(stateAudit(STATES, STATE_CSS, sPage).length === 0 && /\.state-behind\{/.test(STATE_CSS) && !/state-behind/.test(STATE_CSS.replace(/\.state-behind[^{]*\{[^}]*\}/g, "")), "BEHIND's CSS is written once, in STATE_CSS, beside the other four patterns");
// both ways: each injected defect goes red on its own check
const VMUT = [
  ["region", "a dropped region (diff)", () => versionsAudit(VER.older.replace('data-region="diff"', 'data-x="diff"'), cVer, "contributor", { view: "older" })],
  ["region", "the regions out of order (timeline before diff)", () => versionsAudit(VER.older.replace('data-region="diff"', 'data-region="d-x"').replace('data-region="timeline"', 'data-region="diff"').replace('data-region="d-x"', 'data-region="timeline"'), cVer, "contributor", { view: "older" })],
  ["orange", "BEHIND in orange", () => behindAudit(BEH, STATE_CSS.replace(".state-behind{background:var(--well)", ".state-behind{background:var(--bv-orange-well)"), VER.current)],
  ["orange", "BEHIND's text in orange", () => behindAudit(BEH, STATE_CSS.replace(".state-behind svg,.state-behind .state-what{color:var(--text)}", ".state-behind svg,.state-behind .state-what{color:var(--bv-orange)}"), VER.current)],
  ["red", "BEHIND in red", () => behindAudit(BEH, STATE_CSS.replace(".state-behind svg,.state-behind .state-what{color:var(--text)}", ".state-behind svg,.state-behind .state-what{color:var(--bv-error-ink)}"), VER.current)],
  ["behind", "BEHIND wearing ERROR's icon", () => behindAudit({ ...BEH, page: BEH.page.replace(iconOf(BEH.page), iconOf(errorState({}))) }, STATE_CSS, VER.current)],
  ["block", "BEHIND blocking the press", () => behindAudit(BEH, STATE_CSS + 'body:has([data-state="behind"]) form button{pointer-events:none}', VER.current)],
  ["block", "the shell's script refusing a submit while BEHIND shows", () => behindAudit(BEH, STATE_CSS, VER.current.replace("<script>(function(){", "<script>(function(){if(document.querySelector('[data-state=\"behind\"]'))document.addEventListener('submit',function(e){e.preventDefault()},true);"))],
  ["poll", "a page with no head poll", () => behindAudit(BEH, STATE_CSS, VER.current.replace("fetch(headUrl,", "fetch('/nowhere',"))],
  ["behind", "an older version drawn without BEHIND", () => versionsAudit(VER.older.replace('data-state="behind"', 'data-state="x"'), cVer, "contributor", { view: "older" })],
  ["chip", "a Map view without the version chip", () => mapAudit({ ...MAPV, map: MAPV.map.replace(/<a class="version-chip"[\s\S]*?<\/a><\/nav>/, "</nav>") }, SRC)],
  ["chip", "a version chip back on the Versions view's own bar", () => versionsAudit(VER.older.replace(/(<nav class="viewbar"[\s\S]*?<\/div>)(<\/nav>)/, '$1<a class="version-chip" href="/versions" data-button="version-chip" data-door="GET /versions"><span class="state-chip" data-chip="LANDED">v2 · current</span></a>$2'), cVer, "contributor", { view: "older" })],
  ["chip", "the version chip on another door (a Map view's bar)", () => mapAudit({ ...MAPV, map: MAPV.map.replace('data-button="version-chip" data-door="GET /versions"', 'data-button="version-chip" data-door="GET /versions/:v"') }, SRC)],
  ["restore", "Restore enabled for a non-owner", () => versionsAudit(VER.older.replace(/(<button[^>]*) disabled( data-button="restore")/, "$1$2"), cVer, "contributor", { view: "older" })],
  ["restore", "a non-owner's Restore without its reason", () => versionsAudit(VER.older.split(esc4(RESTORE_REASON("Owen Park"))).join("Not now."), cVer, "contributor", { view: "older" })],
  ["tab", "Versions registered as a TAB", () => mapAudit(MAPV, SRC.replace('  { key: "control", label: "Control", icon: "control",\n', '  { key: "versions", label: "Versions", icon: "eagle",\n    views: [{ key: "versions", label: "Versions", href: "/versions" }] },\n  { key: "control", label: "Control", icon: "control",\n'))],
  ["emdash", "an em dash from a version's title", () => versionsAudit(VER.older.replace("Keep the ruled versions, thin the scans later", "Keep the ruled versions — thin the scans later"), cVer, "contributor", { view: "older" })],
];
ok(versionsAudit(VER.older, cVer, "contributor", { view: "older" }).length === 0 && mapAudit(MAPV, SRC).length === 0 && behindAudit(BEH, STATE_CSS, VER.current).length === 0, "both ways: the clean Versions, Map and BEHIND audits are green before any injection");
for (const [id, label, run] of VMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? ` (${f.find((x) => x.startsWith(id + ":")) || f[0]})` : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

// ---- 10. UI-B6a: Goals (wf-goals) and one goal (wf-goal-node, Q1A7AB8C6) ----
const WFG = SCREEN("wf-goals"), WFN = SCREEN("wf-goal-node");
// the pinned wireframe's three regions, in order (sprint 2 dropped sprint 1's Just filed: the live tree is the proof)
ok(!!WFG && !!WFN && JSON.stringify(WFG.regions) === JSON.stringify(GOALS_REGIONS) && JSON.stringify(WFN.regions) === JSON.stringify(GOAL_NODE_REGIONS)
  && JSON.stringify(WFG.buttons) === JSON.stringify(["period", "counters", "see-gap-on-map", "expand-node"]) && JSON.stringify(WFN.buttons) === JSON.stringify(["open-row", "expand-node", "counters"])
  && WFG.wires.counters.door === "GET /goals" && WFG.wires["expand-node"].door === "GET /goals/:ref" && !WFG.wires.period.door && WFG.wires["see-gap-on-map"].door === "GET /map/node"
  && WFN.wires["open-row"].door === "GET /contribution/:id" && WFN.wires["expand-node"].door === "GET /goals/:ref" && WFN.wires.counters.door === "GET /goals/:ref",
  `the pinned wireframe's wf-goals (${WFG ? `${WFG.regions.join(" ")}; ${WFG.buttons.join(" ")}` : "absent"}) and wf-goal-node (${WFN ? `${WFN.regions.join(" ")}; ${WFN.buttons.join(" ")}` : "absent"}); src/goals.js draws the same regions, in order`);
const wfGoalCall = (String((((WFG || {}).wires || {}).counters || {}).mcp || "").match(/preview \{items: \[\{contribution: \{[^}]*\}\}\]\}, then file/) || [""])[0];
const wfNodeCall = (String((((WFN || {}).wires || {}).counters || {}).mcp || "").match(/preview \{items: \[\{contribution: \{[^}]*\}\}\]\}, then file/) || [""])[0];
ok(wfGoalCall === GOAL_COUNTER_CALL && wfNodeCall === GOAL_COUNTER_CALL, `the goal counter call is the wireframe's, verbatim, on both screens (Q48115AD1): ${wfGoalCall}`);
// the fixture: the Home fixture's real SQLite plus a five-node tree filed in k_goals (in this order, by sort), two landed code
// filings on engine, one approved leader note on intaker, a standing counter by gapRefs goal/engine, one preview then file
// ledger row (it never feeds a goal: kind knowledge), and one open pack decision on goals
const G_TREE = [
  { id: "global", title: "Ship the org's first quarter", parent: null, dimensions: [] },
  { id: "engine", title: "The engine", parent: "global", dimensions: ["code"], owner: "Owen Park", due: "2026-12-31" },
  { id: "intaker", title: "The intaker", parent: "global", dimensions: ["leader"] },
  { id: "product", title: "The product", parent: "global", dimensions: ["design"] },
  { id: "onboarding", title: "Onboarding", parent: "global", dimensions: ["gtm"] },
];
const G_KNOWLEDGE = "T-20260928-905";
const G_DECISION = { qid: "QE0000005", question: "Is one filing enough to fill a goal cell?", status: "open", updated: "2026-09-28", severity: "high", area: "goals",
  why: "A cell reads 100% after one filing at the default target.", options: [{ what: "Yes", tradeoff: "fast" }, { what: "Set targets", tradeoff: "real" }], blocks: [], whoOwes: "owner" };
function goalsFixture(o = {}) {
  const fx = homeFixtureEnv({ empty: o.empty, throwOn: o.throwOn });
  if (!o.empty && !o.noFilings) {
    const at = (m) => new Date(Date.now() - m * 60000).toISOString();
    const X = fx.sqlite.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,route,status,decision,eval,project,parent,goal_ref,via,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
    X.run("T-20260928-901", "p-a", "code", "pr", "The door grades a goalRef", "the tree", "engine", "auto", "routed", null, 0, "alpha", null, "engine", "mcp", at(40));
    X.run("T-20260928-902", "p-c", "code", "pr", "The rollup is one statement", "the budget", "engine", "auto", "routed", null, 0, "alpha", null, "engine", "mcp", at(35));
    X.run("T-20260928-903", "p-a", "leader", "note", "Intake answers in a day", "the intake", "intaker", "owner", "closed", "approve", 0, "alpha", null, "intaker", "mcp", at(33));
    X.run("T-20260928-904", "p-c", "leader", "counter", "Engine is weighted too high", "one filing fills it", "goals", "owner", "routed", null, 0, "alpha", null, null, "mcp", at(20));
    fx.sqlite.prepare("INSERT INTO transmission_refs (tid, ref) VALUES (?, ?)").run("T-20260928-904", "goal/engine");
    X.run(G_KNOWLEDGE, "p-o", "leader", "knowledge", "5 goals written", "the project's knowledge", "goal:global", "auto", "routed", null, 0, "alpha", null, null, "mcp", at(10));
  }
  if (!o.undeclared) fileGoals(fx.sqlite, G_TREE);
  // the goals question beside the Decisions fixture's (homeFixtureEnv files those), in alpha's k_questions
  if (!o.empty) seedQuestions(fx.sqlite, "alpha", [G_DECISION], "p-o");
  return fx;
}
const goalsPage = (persona, read) => shell({ ...PERSONAS[persona], active: "goals", content: renderGoals(read, { brand }), brand, briefCount: 3, hasPack: true });
const nodePage = (persona, read) => shell({ ...PERSONAS[persona], active: "goals", content: renderGoalNode(read, { brand }), brand, briefCount: 3, hasPack: true });
const G_PEOPLE = ["Owen Park", "Rae Kim", "Amir", "Nia New"];
// the page's own content (the look pass, sprint 2): no colour literal, and only the semantic tokens (LOOK_TOKENS, read off
// shell.js INK_WORLD above: never a --bv-* palette name, never a pre-look alias like --ink)
function ownContent(content, id, f) {
  // U-chan (an EMPTY that names its call) is ui.js's own vector, a palette home (see PALETTE_HOMES): not the page's colour
  const own = content.replace(/<style>([\s\S]*?)<\/style>/, (m, css) => css).replace(/<svg class="u-uchan\b[^"]*"[\s\S]*?<\/svg>/g, "");
  for (const m of own.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) f(`colour`, `${id}: a colour literal #${m[1]} in the page's own content`);
  lookVarFails(own, id, f);
}
// goalsAudit(html, content, persona, src, o) -> failures by check id: the screen audit (regions, buttons on their doors,
// every door in door.json, no typed input, no em dash, the call), the artboard's order, no hero card, see-gap-on-map
// on GET /map/node (UI-B7b, Q0E486A34: enabled to the first no-feed goal while Blocked has rows, disabled with its reason
// when Blocked is empty), the person credit an honest EMPTY (no person named in What fed), and the Goals tab ONE view
function goalsAudit(html, content, persona, src = SRC, o = {}) {
  const skip = new RegExp(`button (${(o.absent || []).join("|") || "-"}) not rendered`);
  // sprint 3 L2 (the revision, pristine copy): no call on the list (it rides What is missing), the regions each present and
  // non-empty in the revision's reading order (the tree, then what fed it and what blocks it beside it)
  const f = screenAudit(html, WFG, { pins: 0, call: null }).filter((x) => !skip.test(x));
  const fail = (id, why) => f.push(`${id}: ${why}`);
  if (/class="[^"]*(?:g-global|hero)[^"]*"/.test(html)) fail("hero", "wf-goals: the hero global-needle card is back (the artboard draws none; the root is the tree's first row)");
  // a Blocked row is the <li> carrying data-qid (an open question) or data-id (a goal with no feed): its semantic hooks
  const blRows = /<li\b[^>]*\sdata-(?:qid|id)="/.test((regionOf(html, "blocked") || { inner: "" }).inner);
  const noFeed = ((regionOf(html, "blocked") || { inner: "" }).inner.match(/<li\b[^>]*\sdata-id="([^"]+)"/) || [])[1];
  for (const t of html.match(/<[^>]*data-button="see-gap-on-map"[^>]*>/g) || []) {
    if (attr(t, "data-door") !== "GET /map/node" || attr(t, "data-client")) fail("map", `wf-goals: see-gap-on-map does not ride GET /map/node alone (${t.slice(0, 140)})`);
    const off = /\sdisabled\b/.test(t);
    if (blRows && off) fail("map", "wf-goals: see-gap-on-map is disabled while Blocked has rows");
    if (!blRows && (!off || attr(t, "title") !== esc4(BLOCKED_EMPTY))) fail("map", `wf-goals: with Blocked empty, see-gap-on-map is not disabled with "${BLOCKED_EMPTY}"`);
    const want = noFeed ? `/map?node=${encodeURIComponent("goal/" + noFeed)}` : "/map?gap=1";
    if (blRows && attr(t, "href") !== esc4(want)) fail("map", `wf-goals: see-gap-on-map lands on ${attr(t, "href")}, want ${want} (the first no-feed goal, else the gap walk)`);
  }
  const wf = regionOf(html, "what-fed");
  const wfText = wf ? textOf(wf.inner) : "";
  // D2b (pristine copy, owner 2026-10-02): the person credit's explanation is gone from the page; no person is credited either
  if (wfText.includes(CREDIT_EMPTY)) fail("credit", "wf-goals: the person credit's explanation is back on the page (pristine copy)");
  for (const p of G_PEOPLE) if (wfText.includes(p)) fail("credit", `wf-goals: What fed names a person (${p}): credit waits on the brain linking filings to rulings`);
  const goalsRow = (/\{ key: "goals", label: "Goals", icon: "goals",\s*views: \[([^\]]*)\]/.exec(src) || [])[1];
  if (goalsRow == null) fail("bar", "shell.js TABS carries no Goals row");
  else if (goalsRow.trim() !== '{ key: "goals", label: "Goals", href: "/goals" }') fail("bar", `shell.js TABS: the Goals tab is not ONE view on /goals: [${goalsRow.trim()}]`);
  if (/(?:key|href|label):\s*"[^"]*scorecard/i.test(src.slice(src.indexOf("const TABS = ["), src.indexOf("// which tabs a role sees")))) fail("bar", "shell.js TABS: the Scorecard view is back");
  if (hasViewBar(html)) fail("bar", "Goals carries a view bar (the artboard draws none)");
  if (/href="\/pack\/scorecard"/.test(html)) fail("bar", "Goals links to the retired /pack/scorecard");
  if (!isLit(html, "goals", "/goals")) fail("bar", "the Goals tab is not the current tab, or does not open /goals");
  ownContent(content, "wf-goals", fail);
  return [...f, ...audit(html, persona, src)];
}
// nodeAudit(html, content, persona, id, o) -> the same for one goal: its five regions in order, open-row on each filing with
// ONE state chip, the exact call with this goal's id, the counters button on GET /goals/:ref
function nodeAudit(html, content, persona, id, o = {}) {
  const skip = new RegExp(`button (${(o.absent || []).join("|") || "-"}) not rendered`);
  // sprint 3 L3: the counter call box is gone from the page (pristine copy: it only printed a call; What is missing carries calls)
  const f = screenAudit(html, WFN, { pins: 0, call: null }).filter((x) => !skip.test(x));
  if (html.includes(esc4(GOAL_COUNTER_CALL.replace("<id>", id)))) f.push("call: wf-goal-node: the counter call is printed on the page again (pristine copy)");
  const fail = (idc, why) => f.push(`${idc}: ${why}`);
  const idx = GOAL_NODE_REGIONS.map((r) => html.indexOf(`data-region="${r}"`));
  if (idx.some((i) => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) fail("region", `wf-goal-node: the regions are not in the spec's order (${GOAL_NODE_REGIONS.join(" ")})`);
  const fl = regionOf(html, "filings");
  const rows = fl ? fl.inner.match(/<li\b[^>]*\sdata-id="[^"]*"[^>]*>[\s\S]*?<\/li>/g) || [] : [];
  const badChip = rows.filter((r) => { const c = [...r.matchAll(/data-chip="([^"]*)"/g)].map((m) => m[1]); return c.length !== 1 || !STATE_CHIPS.includes(c[0]); });
  if (badChip.length) fail("chip", `wf-goal-node: ${badChip.length} filing row(s) without exactly one state chip`);
  if (rows.some((r) => !/data-button="open-row" data-door="GET \/contribution\/:id"/.test(r))) fail("door", "wf-goal-node: a filing row without open-row on GET /contribution/:id");
  if (hasViewBar(html)) fail("bar", "the goal node carries a view bar");
  ownContent(content, "wf-goal-node", fail);
  return [...f, ...audit(html, persona, SRC)];
}
const gfx = goalsFixture();
const gOwn = await readGoals(gfx.env, H_OWNER, { period: "all" });
const gSeat = await readGoals(gfx.env, H_SEAT, { period: "all" });
const gNode = await readGoalNode(gfx.env, H_OWNER, "engine", { period: "all" });
const gRoot = await readGoalNode(gfx.env, H_OWNER, "global", { period: "all" });
const gLeafEmpty = await readGoalNode(gfx.env, H_OWNER, "product", { period: "all" });
const gUnknown = await readGoalNode(gfx.env, H_OWNER, "no-such-goal", { period: "all" });
const gUndeclared = await readGoals(goalsFixture({ undeclared: true }).env, H_OWNER, {});
const gZero = await readGoals(goalsFixture({ noFilings: true }).env, H_OWNER, {});
const gDown = await readGoals(goalsFixture({ throwOn: (sql) => sql.startsWith("SELECT goal_ref, LOWER(lane)") }).env, H_OWNER, {});
const gNodeDown = await readGoalNode(goalsFixture({ throwOn: (sql) => sql.startsWith("SELECT goal_ref, LOWER(lane)") }).env, H_OWNER, "engine", {});
const cGoals = renderGoals(gOwn, { brand }), cNode = renderGoalNode(gNode, { brand }), cRoot = renderGoalNode(gRoot, { brand });
const GOALS = { full: goalsPage("owner", gOwn), seat: goalsPage("contributor", gSeat), undeclared: goalsPage("owner", gUndeclared), zero: goalsPage("owner", gZero), down: goalsPage("owner", gDown),
  node: nodePage("owner", gNode), root: nodePage("owner", gRoot), leafEmpty: nodePage("owner", gLeafEmpty), nodeDown: nodePage("owner", gNodeDown) };
const gFull = goalsAudit(GOALS.full, cGoals, "owner");
ok(gFull.length === 0, `Goals (Goals.dc.html), the owner with filings: three regions non-empty in order, four buttons on their own doors (period client-side, see-gap-on-map on GET /map/node to the gap walk, /map?gap=1: Blocked holds open questions only, D1b item 16), every door in door.json, no typed input, no em dash, no colour literal and --bv-* only, Fredoka numbers, no hero card, the person credit an honest EMPTY, the Goals tab one view, and the shell's own audit${gFull.length ? `\n      ${gFull.join("\n      ")}` : ""}`);
const gNodes = new Map(gOwn.nodes.map((n) => [n.id, n]));
ok(gOwn.nodes.length === 5 && gNodes.get("engine").fed.total === 2 && gNodes.get("engine").counters.standing === 1 && gNodes.get("engine").pct === 100 && gNodes.get("global").pct === 50
  && gNodes.get("global").fed.total === 3 && JSON.stringify(gNodes.get("global").fed.byArea) === JSON.stringify({ build: 2, plans: 1 }) && JSON.stringify(gOwn.noFeed) === JSON.stringify(["product", "onboarding"])
  && gOwn.aligned === 3 && gOwn.nodes.every((n) => !("rows" in n)) && gOwn.nodes[0].id === "global" && gOwn.nodes[1].depth === 1,
  `the read: 5 nodes in tree order (the root first, depth 0), engine fed by 2 with 1 standing counter (by gapRefs goal/engine) at 100%, the root 50% fed by 3 (build 2 · plans 1: the one-pass fix 4c names the leader lane's area plans), no feed on product and onboarding, no nodes[].rows (the goal tool's)`);
// the header's counts, read by their hooks (data-metric + data-value), never by the markup around them
// sprint 3 L2: the glance's tiles; "No feed" opens the same list filtered (?status=unfed)
const gStat = (html, k) => { const m = new RegExp(`<(a|div)\\b([^>]*)\\sdata-metric="${k}" data-value="([^"]*)"`).exec(html); return m ? { tag: m[1], attrs: m[2], v: m[3] } : null; };
const gNoFeed = gStat(cGoals, "no-feed");
ok((gStat(cGoals, "goals") || {}).v === "5" && (gStat(cGoals, "feeding") || {}).v === "3" && gNoFeed && gNoFeed.v === "2" && gNoFeed.tag === "a" && /href="\/goals\?status=unfed"/.test(gNoFeed.attrs) && /<h1>Goals<\/h1>/.test(cGoals),
  `the glance: "Goals" and its tiles (5 goals · 3 contributions feeding · 2 with no feed), "No feed" opening the list filtered`);
// a tree row by its hooks: data-id, data-depth (the indent) and data-pct (the number drawn), and its bar's width
const gTreeRow = (html, id) => (new RegExp(`<li\\b[^>]*\\sdata-id="${id}" data-depth="(\\d)" data-pct="([^"]*)"[^>]*>([\\s\\S]*?)</li>`).exec((regionOf(html, "goal-tree") || { inner: "" }).inner) || []);
const [, gDepthG, gPctG] = gTreeRow(cGoals, "global"), [, gDepthE, gPctE, gRowE] = gTreeRow(cGoals, "engine"), [, , gPctP, gRowP] = gTreeRow(cGoals, "product");
// D2b: a cell at or past its target says it is met with how many landed ("code 2 of 1" read as more than the target); a goal
// nothing has fed reads "not started", no 0% bar and no "fed by 0"
// sprint 3 L2: what measures a goal and what fed it are its row's facts (opened in place); a done goal says Done; a goal nothing
// has fed says Not started (no 0% bar)
ok(gDepthG === "0" && gDepthE === "1" && gPctE === "100" && gPctG === "50" && gPctP === "0" && /<dt>Fed by<\/dt><dd>2 · build 2<\/dd>/.test(gRowE || "") && /<dt>Measured by<\/dt><dd>code met, 2 landed<\/dd>/.test(gRowE || "") && !/2 of 1/.test(gRowE || "")
  && /data-progress="1\.000"/.test(gRowE || "") && />Not started</.test(gRowP || "") && !/data-progress=|Fed by<\/dt><dd>0/.test(gRowP || ""),
  `goal-tree: one row per goal in tree order, its depth (data-depth) and its % (data-pct), measured by 'code met, 2 landed', fed by '2 · build 2', its bar full at 100%, an unfed goal 'Not started'`);
const whatFedRows = gOwn.whatFed.rows.map((r) => `${r.lane}:${r.area}:${r.n}:${r.delta}`).join(" ");
ok(gOwn.whatFed.node === "global" && whatFedRows === "code:build:2:25 leader:plans:1:25" && gOwn.whatFed.credit === null && /What fed the top goal/.test(regionOf(GOALS.full, "what-fed").inner),
  `what-fed: the root's lanes with the points each one moved it (left out, the root loses them): ${whatFedRows}; credit null`);
const bl = regionOf(GOALS.full, "blocked").inner;
const blRowOf = (h, attr) => (new RegExp(`<li\\b[^>]*\\s${attr}[^>]*>[\\s\\S]*?</li>`).exec(h) || [""])[0];
const blQ = blRowOf(bl, 'data-qid="QE0000005"'), blP = blRowOf(bl, 'data-id="product"');
ok(/data-chip="DECIDE"/.test(blQ) && /href="\/question\/QE0000005"/.test(blQ) && (blQ.match(/data-chip=/g) || []).length === 1 && !/QA0000001|QD0000004/.test(bl)
  && !blP && gOwn.noFeed.includes("product") && /data-metric="no-feed"/.test(cGoals),
  "blocked: the pack's OPEN decision on goals with its DECIDE chip linking /question/:qid (never another area's); a goal with no feed is the header's count, never a Blocked row (D1b item 16)");
const gSeatAudit = goalsAudit(GOALS.seat, renderGoals(gSeat, { brand }), "contributor");
ok(gSeatAudit.length === 0 && JSON.stringify(gSeat.nodes) === JSON.stringify(gOwn.nodes), `a seated reader (Rae, on alpha): the same tree and numbers as the owner, the same audit${gSeatAudit.length ? `\n      ${gSeatAudit.join("\n      ")}` : ""}`);
const gUndAudit = goalsAudit(GOALS.undeclared, renderGoals(gUndeclared, { brand }), "owner", SRC, { absent: ["counters", "expand-node", "period"], call: null });
ok(gUndeclared.declared === false && gUndAudit.length === 0 && /No goals yet/.test(regionOf(GOALS.undeclared, "goal-tree").inner) && !/preview then file/.test(regionOf(GOALS.undeclared, "goal-tree").inner) && /data-state="empty"/.test(regionOf(GOALS.undeclared, "goal-tree").inner),
  `EMPTY: no declared tree reads declared:false and "No goals yet" (pristine copy: a phrase and one button), never a % against the seam fallback; the row buttons aside (no row), it audits clean${gUndAudit.length ? `\n      ${gUndAudit.join("\n      ")}` : ""}`);
const gZeroAudit = goalsAudit(GOALS.zero, renderGoals(gZero, { brand }), "owner", SRC, { absent: ["counters"] });
ok(gZero.declared === true && gZero.nodes.length === 5 && gZero.nodes.every((n) => n.pct === 0 && n.fed.total === 0) && !/data-state="empty"/.test(regionOf(GOALS.zero, "goal-tree").inner)
  && !/data-progress=/.test(regionOf(GOALS.zero, "goal-tree").inner) && (regionOf(GOALS.zero, "goal-tree").inner.match(/data-state="todo"/g) || []).length === 5
  && /data-state="empty"/.test(regionOf(GOALS.zero, "what-fed").inner) && gZeroAudit.length === 0,
  `a declared tree with no filings: the tree kept, each goal "not started" (D2b: never a wall of 0% bars, never the EMPTY), and What fed says "${whatFedEmpty("all")}"${gZeroAudit.length ? `\n      ${gZeroAudit.join("\n      ")}` : ""}`);
ok(gDown.live === "unreachable" && gDown.nodes.length === 5 && gDown.nodes.every((n) => n.pct === null && n.fed.total === null) && /<div class="state state-unreachable" data-state="unreachable"/.test(GOALS.down)
  && ((regionOf(GOALS.down, "goal-tree") || { inner: "" }).inner.match(/<li\b[^>]*\sdata-pct="\?"/g) || []).length === 5 && GOALS.down.includes("The engine") && !/data-pct="0"/.test(GOALS.down),
  "UNREACHABLE: a failed aggregate keeps every title, shows ? for every number (never a guessed zero) and the block");
const gNodeAudit = nodeAudit(GOALS.node, cNode, "owner", "engine");
ok(gNodeAudit.length === 0 && gNode.node.id === "engine" && gNode.node.pct === 100 && gNode.filings.rows.map((r) => r.id).join() === "T-20260928-902,T-20260928-901" && gNode.counters.standing === 1 && gNode.counters.ruled === 0
  && gNode.owner === "Owen Park" && gNode.due === "2026-12-31" && gNode.parent && gNode.parent.id === "global" && /data-metric="cell-code" data-value="2" data-dim="code"[^>]*title="code met, 2 landed"/.test(regionOf(GOALS.node, "cells").inner) && !/of 1</.test(regionOf(GOALS.node, "cells").inner)
  && /data-region="counters"/.test(cNode) && /data-standing="1" data-ruled="0"/.test(cNode) && /<dt>Owner<\/dt><dd>[\s\S]*?Owen Park<\/dd>/.test(cNode) && /<dt>Due<\/dt><dd>2026-12-31<\/dd>/.test(cNode)
  && regionOf(GOALS.node, "children").inner.includes(esc4(LEAF_CHILDREN)),
  `the goal node (engine): five regions in order, the parent breadcrumb, owner and due-by from the served tree (facts), the code cell a tile "2 landed" (met, its words in the title), the two filings newest first each with one state chip and open-row, the counters' standing 1 · ruled 0 as hooks and no call printed, a leaf says "${LEAF_CHILDREN}"${gNodeAudit.length ? `\n      ${gNodeAudit.join("\n      ")}` : ""}`);
const gRootAudit = nodeAudit(GOALS.root, cRoot, "owner", "global", { absent: ["open-row"] });
ok(gRootAudit.length === 0 && gRoot.children.length === 4 && (regionOf(GOALS.root, "children").inner.match(/data-button="expand-node" data-door="GET \/goals\/:ref"/g) || []).length === 4
  && /<dt>Owner<\/dt><dd>–<\/dd>/.test(regionOf(GOALS.root, "node").inner) && /data-metric="children" data-value="4"/.test(regionOf(GOALS.root, "cells").inner),
  `the root's page: its four children each on expand-node (GET /goals/:ref), no owner served (–), no cells of its own (the cells tile counts its 4 child goals)${gRootAudit.length ? `\n      ${gRootAudit.join("\n      ")}` : ""}`);
ok(regionOf(GOALS.leafEmpty, "filings").inner.includes(esc4(nodeFilingsEmpty("all"))) && /data-state="empty"/.test(regionOf(GOALS.leafEmpty, "filings").inner) && gUnknown === null,
  `a goal with no filing reads "${nodeFilingsEmpty("all")}"; an unknown ref reads null (the route answers 404 unknown_goal)`);
ok(gNodeDown.live === "unreachable" && gNodeDown.node.pct === null && /data-pct="\?"/.test((regionOf(GOALS.nodeDown, "node") || { inner: "" }).inner) && /data-state="unreachable"/.test(GOALS.nodeDown), "the goal node UNREACHABLE: its % reads ? under the block");
// both ways: each injected defect goes red on its own check
const GMUT = [
  ["region", "the what-fed region dropped", () => goalsAudit(GOALS.full.replace('data-region="what-fed"', 'data-x="what-fed"'), cGoals, "owner")],
  ["region", "the goal node's cells region dropped", () => nodeAudit(GOALS.node.replace('data-region="cells"', 'data-x="cells"'), cNode, "owner", "engine")],
  ["hero", "the hero global-needle card back", () => goalsAudit(GOALS.full.replace('<div class="p-cols">', '<div class="g-global"><div class="g-global-n">50%</div></div><div class="p-cols">'), cGoals, "owner")],
  ["bar", "the Scorecard view back on Goals (shell.js TABS)", () => goalsAudit(GOALS.full, cGoals, "owner", SRC.replace('views: [{ key: "goals", label: "Goals", href: "/goals" }] },', 'views: [{ key: "goals", label: "Goals", href: "/goals" }, { key: "scorecard", label: "Scorecard", href: "/pack/scorecard", pack: true }] },'))],
  ["bar", "a view bar back on the page", () => goalsAudit(injectViewBar(GOALS.full, '<a class="view-item" href="/goals" data-view="goals" aria-current="page">Tree</a><a class="view-item" href="/missing" data-view="holes">What is missing</a>'), cGoals, "owner")],
  ["map", "see-gap-on-map off its door (client-side only, the pre-B7b wire)", () => goalsAudit(GOALS.full.replace('data-button="see-gap-on-map" data-door="GET /map/node"', 'data-button="see-gap-on-map" data-client="waits"'), cGoals, "owner")],
  ["map", "see-gap-on-map disabled while Blocked has rows", () => goalsAudit(GOALS.full.replace('data-button="see-gap-on-map" data-door="GET /map/node"', 'data-button="see-gap-on-map" data-door="GET /map/node" disabled aria-disabled="true"'), cGoals, "owner")],
  // D1b item 16: Blocked holds open questions only, so the button walks the gaps (/map?gap=1): pointing it at a goal goes red
  ["map", "see-gap-on-map landing on a goal while Blocked holds only questions", () => goalsAudit(GOALS.full.replace(/href="\/map\?gap=1"/, 'href="/map?node=goal%2Fengine"'), cGoals, "owner")],
  // (D2b: the credit EMPTY mutation is gone with its check: pristine copy)
  ["door", "a POST /counter door on a row's counters", () => goalsAudit(GOALS.full.replace('data-button="counters" data-door="GET /goals"', 'data-button="counters" data-door="POST /counter"'), cGoals, "owner")],
  ["door", "expand-node on the retired /goals/tree door", () => goalsAudit(GOALS.full.replace('data-button="expand-node" data-door="GET /goals/:ref"', 'data-button="expand-node" data-door="GET /goals/tree"'), cGoals, "owner")],
  ["colour", "a hex colour in the page's own style", () => goalsAudit(GOALS.full, cGoals.replace(".gl{display:block}", ".gl{display:block;color:#6B4FA8}"), "owner")],
  ["colour", "an old shell token in the page's own style", () => goalsAudit(GOALS.full, cGoals.replace(".gl{display:block}", ".gl{display:block;color:var(--ink)}"), "owner")],
  ["colour", "a --bv-* palette name back in the page's own style", () => goalsAudit(GOALS.full, cGoals.replace(".gl{display:block}", ".gl{display:block;color:var(--bv-dark-text)}"), "owner")],
  ["emdash", "an em dash from a goal's own title", () => goalsAudit(GOALS.full.replace("The engine</a>", "The engine — core</a>"), cGoals, "owner")],
  ["chip", "a goal node's filing row with two state chips", () => nodeAudit(GOALS.node.replace(/(<li\b[^>]*\sdata-id="T-20260928-902"[^>]*>[\s\S]*?)(<span class="p-chip"[^>]*data-chip="[^"]*"[^>]*>[^<]*<\/span>)/, "$1$2$2"), cNode, "owner", "engine")],
];
ok(goalsAudit(GOALS.full, cGoals, "owner").length === 0 && nodeAudit(GOALS.node, cNode, "owner", "engine").length === 0, "both ways: the clean Goals and goal node renders are green before any injection");
for (const [id, label, run] of GMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? ` (${f.find((x) => x.startsWith(id + ":")) || f[0]})` : " (nothing went red: the injection did not apply or the check is blind)"}`);
}
ok(!/data-state="empty"/.test(regionOf(GOALS.full, "goal-tree").inner) && /data-state="empty"/.test(regionOf(GOALS.undeclared, "goal-tree").inner), "both ways: the goal-tree EMPTY shows on the undeclared tree and never on a declared one");

// ---- 9-14. The Map, the main tab (sprint 2; docs/plan/LOOK.md "The Map, ruled") ----
// ONE page for the seven planes: GET /map draws it; GET /map/<plane> opens the same page on a layer or a view
// (the planes' JSON twins answer as they did; tools/d1-hot-selftest.mjs M counts their reads). Rendered by the REAL worker
// (src/index.js through the cf-workers stub loader) over the Home fixture's SQLite with the pinned map canvas, the brain's
// flows and dependency chains and its architecture filed in alpha through the importer's own mappers, and three checks naming
// two screens and a table, one graded. Held to: the shell's own audit (every door in door.json, Brand v2 faces, no em dash,
// no typed input but find, reduced motion), the Map's four regions in order, every button on its door or client-side, the
// layer pills' counts read off the model, each old URL opening its layer or view, a pin drawing the inspector with its hooks,
// the light filter's counts, the Arch and MCP views' regions and rows off the registries, no view bar on the full-width page
// but the version chip in its bar, the page's own sheet on the semantic tokens only, the client under 60 KB.
// (The pinned wireframes wf-map-system, wf-map-api, wf-map-mcp, wf-map-arch, wf-map-data, wf-map-flows and wf-map-deps are
// superseded by the owner's ruling of 2026-09-30: one canvas with layers; their plane-by-plane pins retired with the planes.)
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const { default: WORKER } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
// the org's name, from its own row: Map · Arch's org worker carries it (sprint 6, 6.3: the worker's name is the platform's, never the org's)
const MODEL_ORG = "Northwind";
const M_CV = JSON.parse(read(join(ENGINE, "tools", "fixtures", "map-canvas.json")));
const FL_CV = JSON.parse(read(join(ENGINE, "tools", "fixtures", "flows-canvas.json")));
const MC_ARCH = JSON.parse(read(join(ENGINE, "tools", "fixtures", "model-canvas.json"))).architecture;
// mapWorld({ canvas }): the model filed in alpha (null: none), the org's one project alpha, keys for the owner and a seat
function mapWorld({ canvas = { ...M_CV, flows: FL_CV.flows, deps: FL_CV.deps, architecture: MC_ARCH } } = {}) {
  const fx = homeFixtureEnv();
  if (canvas) {
    seedModel(fx.sqlite, "alpha", canvas, { by: "p-o" });
    seedChecks(fx.sqlite, "alpha", [{ id: "AC.w.1", refs: ["screen:" + M_CV.screens[0].id] }, { id: "AC.w.2", refs: ["screen:" + M_CV.screens[0].id, "screen:" + M_CV.screens[1].id] }, { id: "AC.w.3", refs: ["table:" + M_CV.tables[0].name] }], { by: "p-o" });
    seedGrade(fx.sqlite, "alpha", "AC.w.1", "proven", { by: "p-o" });
  }
  const hash = (x) => createHash("sha256").update(x).digest("hex");
  fx.sqlite.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-o'").run(hash("wire-owner-key"));
  fx.sqlite.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-c'").run(hash("wire-seat-key"));
  fx.sqlite.prepare("INSERT OR REPLACE INTO org (id, name, created_at, updated_at) VALUES (1, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')").run(MODEL_ORG);
  const files = {};   // the R2 binding holds nothing the worker reads (the org is its D1 row)
  const base = fx.env.BRAIN;
  const obj = (t) => { const b = new TextEncoder().encode(t); return { text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), size: t.length, etag: hash(t).slice(0, 16) }; };
  fx.env.BRAIN = { ...base, get: async (k) => (files[k] != null ? obj(files[k]) : base.get(k)), head: async (k) => (files[k] != null ? { size: files[k].length, etag: hash(files[k]).slice(0, 16) } : base.head(k)) };
  return fx;
}
// the real worker gets the env a request starts with: the Home fixture's pre-resolved project (a direct reader's convenience)
// is dropped, so the project seam resolves each reader itself (a seatless Uma in the two-project org reads the org level)
const modelGet = async (W, path, who, accept) => {
  const env = { ...W.env, [Symbol.for("sharingu.project")]: null };
  const r = await WORKER.fetch(new Request("https://org.test" + path, { headers: { accept, authorization: `Bearer wire-${who}-key` } }), env, { waitUntil() {}, passThroughOnException() {} });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
  return { status: r.status, type: r.headers.get("content-type") || "", html: j ? "" : t, j };
};
const MWF = mapWorld(), MWE = mapWorld({ canvas: null });
const SCR0 = "screen:" + M_CV.screens[0].id, TBL0 = M_CV.tables[0].name;
const MAPP = {};
for (const who of ["owner", "seat"]) {
  for (const [k, path] of [["map", "/map"], ["data", "/map/data"], ["api", "/map/api"], ["flows", "/map/flows"], ["deps", "/map/deps"], ["arch", "/map/arch"], ["mcp", "/map/mcp"],
    ["pin", `/map?node=${encodeURIComponent(SCR0)}`], ["table", `/map/data?table=${encodeURIComponent(TBL0)}`]]) MAPP[`${k}.${who}`] = await modelGet(MWF, path, who, "text/html");
}
MAPP.empty = await modelGet(MWE, "/map", "owner", "text/html");
// the Screens view: render index rows filed beside the model (k_renders, k_styles: the page reads the index, never a body);
// its read batches SELECTs (D1's batch answers each statement's rows; the fixture's batch runs them, so it reads them here)
const MWS = mapWorld(), MWSE = mapWorld({ canvas: null });
for (const w of [MWS, MWSE]) w.env.DB.batch = async (list) => Promise.all(list.map((st) => st.all()));
{
  const AT0 = "2026-10-01T00:00:00.000Z", H64 = (x) => createHash("sha256").update(String(x)).digest("hex");
  MWS.sqlite.prepare("INSERT INTO k_styles (project,id,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?)").run("alpha", "app", H64("css"), 10, "p-o", AT0, "p-o", AT0);
  const R = MWS.sqlite.prepare("INSERT INTO k_renders (project,screen,state,variant,format,style,width,height,hash,bytes,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  M_CV.screens.forEach((sc, i) => { if (i % 2 === 0) R.run("alpha", "screen:" + sc.id, "", "live", "html", "app", 1440, 900, H64("r" + i), 900, "p-o", AT0, "p-o", AT0); });
}
for (const who of ["owner", "seat"]) MAPP[`screens.${who}`] = await modelGet(MWS, "/map/screens", who, "text/html");
MAPP.screensJson = await modelGet(MWS, "/map/screens", "owner", "application/json");
MAPP.screensEmpty = await modelGet(MWSE, "/map/screens", "owner", "text/html");
MAPP.json = await modelGet(MWF, "/map", "owner", "application/json");
MAPP.gapHtml = await modelGet(MWF, "/map/node?gap=1", "owner", "text/html");
MAPP.unknown = await modelGet(MWF, "/map/nope", "owner", "text/html");
MAPP.system = await WORKER.fetch(new Request("https://org.test/map/system", { headers: { accept: "text/html", authorization: "Bearer wire-owner-key" } }), MWF.env, { waitUntil() {}, passThroughOnException() {} });
// the truth: the model as filed (the layout's own counts are read off it, never typed)
const MJ = MAPP.json.j || { nodes: [], flows: [], layerN: {}, counts: {} };
const typeN = (t) => MJ.nodes.filter((n) => n.t === t).length;
const MAP_CSS = (h) => ((/<style>\n\.mx\{[\s\S]*?<\/style>/.exec(h) || [""])[0]);
// mapPageAudit(html, persona, o) -> failures by check id: the shell's own audit, the Map's regions in order, the buttons, the
// layers (o.layers: the pills pressed), the counts off the model, the view (o.view), no view bar, the version chip in the bar,
// the page's own sheet
function mapPageAudit(html, persona, o = {}) {
  const f = audit(html, persona, SRC);
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const view = o.view || "canvas";
  const regions = view === "arch" ? ["layers", "lanes", "crossing-rules", "seam", "org-worker"] : view === "mcp" ? ["layers", "mcp-tools", "workspace-shelf", "global-presets"] : MAP_REGIONS;
  const at = regions.map((r) => html.indexOf(`data-region="${r}"`));
  if (at.some((x) => x < 0) || at.some((x, i) => i && x < at[i - 1])) fail("region", `the Map (${view}): the regions are not all there in order (${regions.join(" ")}): ${at.join(",")}`);
  for (const m of html.matchAll(/<[^>]*\sdata-button="([^"]+)"[^>]*>/g)) {
    const d = attr(m[0], "data-door"), c = attr(m[0], "data-client");
    if (!d && !c) fail("door", `the Map: button ${m[1]} carries no door and is not client-side`);
    if (d && !c) { const [meth, path] = d.split(" "); if (!inDoor(meth, path)) fail("door", `the Map: button ${m[1]}'s door ${d} is not in door.json`); }
  }
  if (/<nav class="viewbar"/.test(html)) fail("bar", "the Map is full width with its own bar: the shell's view bar is back");
  if (!/<header class="mx-bar" data-region="layers">[\s\S]*?data-button="version-chip" data-door="GET \/versions"[\s\S]*?<\/header>/.test(html)) fail("chip", "the Map's bar carries no version chip");
  if (!/<a class="rail-item" href="(?:\/[a-z0-9-]+)?\/map" data-tab="map" aria-current="true">/.test(html)) fail("tab", "the rail's Map destination is not current, or does not land on /map");
  const cur = (/<a class="mx-view" href="[^"]*" data-button="view-switch" data-door="[^"]+" data-view="(\w+)" aria-current="page">/.exec(html) || [])[1];
  if (cur !== view) fail("view", `the current view is ${cur}, want ${view}`);
  if (view === "canvas") {
    const pressed = [...html.matchAll(/data-button="layer-toggle" data-client="[^"]*" data-layer="(\w+)" aria-pressed="true"/g)].map((m) => m[1]).sort().join(" ");
    if (o.layers && pressed !== [...o.layers].sort().join(" ")) fail("layer", `the layers pressed are [${pressed}], want [${[...o.layers].sort().join(" ")}]`);
    const pill = (k) => Number((new RegExp(`data-layer="${k}"[^>]*>[A-Za-z]+<b>(\\d+)</b>`).exec(html) || [])[1] ?? -1);
    // D2b: the Screens pill counts the screens, the same number as the Screens column (it counted the surfaces too: 34 over 33)
    const want = { screens: typeN("screen"), doors: typeN("door"), data: typeN("table") + typeN("entity"), flows: MJ.flows.length, deps: typeN("dep") + typeN("gap") };
    for (const [k, v] of Object.entries(want)) if (pill(k) !== v) fail("count", `the ${k} pill counts ${pill(k)}, the model ${v}`);
    if (!/<svg class="mx-svg" id="mx-svg" viewBox="[-\d. ]+" preserveAspectRatio="xMidYMin meet"/.test(html)) fail("canvas", "the first paint is not the SVG in a viewBox the browser fits");
    if (!/<input type="search" id="mx-q" data-input-exception="search"/.test(html)) fail("find", "find is not the declared search input");
    if (!/<script type="application\/json" id="mx-data">/.test(html) || !html.includes(MAP_CLIENT.slice(0, 200))) fail("client", "the page does not carry its data and its client");
    const listN = ((regionOf(html, "node-list") || { inner: "" }).inner.match(/<li><a href="(?:\/[a-z0-9-]+)?\/map\?node=/g) || []).length;   // under the org's address (sprint 7, 7.4)
    if (listN !== MJ.nodes.length) fail("list", `the node list holds ${listN} links, the canvas ${MJ.nodes.length} nodes`);
  }
  const css = MAP_CSS(html);
  if (!css) fail("sheet", "the Map's own sheet is missing");
  for (const m of css.matchAll(/(?<![&\w])#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g)) fail("colour", `the Map's sheet: a raw colour ${m[0]}`);
  for (const m of css.matchAll(/var\(--bv-[a-z0-9-]+\)/g)) fail("colour", `the Map's sheet: ${m[0]} (the semantic tokens only)`);
  return f;
}
const LAY = ["screens", "doors", "data"];
const MAPS = [["map", { layers: LAY }], ["data", { layers: ["doors", "data"] }], ["api", { layers: ["screens", "doors"] }], ["flows", { layers: [...LAY, "flows"] }],
  ["deps", { layers: [...LAY, "deps"] }], ["arch", { view: "arch" }], ["mcp", { view: "mcp" }], ["pin", { layers: LAY }], ["table", { layers: ["doors", "data"] }]];
for (const who of ["owner", "seat"]) {
  const bad = [];
  for (const [k, o] of MAPS) { const p = MAPP[`${k}.${who}`]; if (p.status !== 200) bad.push(`${k}: HTTP ${p.status}`); else bad.push(...mapPageAudit(p.html, who === "owner" ? "owner" : "single-seat", o).map((x) => `${k}: ${x}`)); }
  ok(!bad.length, `the Map as ${who === "owner" ? "the owner" : "a seat"}: /map and every old plane URL (data, api, flows, deps, arch, mcp) draw the ONE page on their layers or view, each passing the shell's audit and the Map's (regions in order, buttons on their doors, counts off the model, no view bar, the chip in its bar, semantic tokens only)${bad.length ? `\n      ${bad.slice(0, 8).join("\n      ")}` : ""}`);
}
ok(MAPP.json.status === 200 && Array.isArray(MJ.nodes) && MJ.nodes.length === typeN("surface") + typeN("screen") + typeN("door") + typeN("table") + typeN("entity") + typeN("dep") + typeN("gap") && Array.isArray(MJ.links) && MJ.links.length % 3 === 0 && MJ.cols.length >= 4,
  `GET /map to a script: the compact layout (${MJ.nodes.length} nodes in ${MJ.cols ? MJ.cols.length : 0} columns, ${MJ.links.length / 3} links, ${MJ.flows.length} flows)`);
{
  const p = MAPP["pin.owner"].html, t = MAPP["table.owner"].html;
  const cnt = (h, l) => Number((new RegExp(`data-show="${l}"[^>]*><i></i><b>(\\d+)</b>`).exec(h) || [])[1] ?? -1);
  ok(/<aside class="mx-insp is-node" id="mx-insp" data-region="inspector"/.test(p) && new RegExp(`data-node="${SCR0}" data-kind="screen" data-light="amber"`).test(p) && /data-checks="2"/.test(p)
    && /class="mx-u mx-n mx-pin"/.test(p) && /data-button="unpin" data-client=/.test(p) && new RegExp(`data-node="table:${TBL0}" data-kind="table"`).test(t),
    `/map?node=${SCR0} pins it: the inspector's hooks (data-node, data-kind, data-light amber: one of its two checks graded, data-checks), the node marked on the canvas; /map/data?table=${TBL0} pins the table`);
  ok(cnt(MAPP["map.owner"].html, "amber") === 1 && cnt(MAPP["map.owner"].html, "green") === 0 && cnt(MAPP["map.owner"].html, "grey") === MJ.nodes.length - 1,
    `the light filter counts every drawn node off k_node_lights: amber ${cnt(MAPP["map.owner"].html, "amber")}, green ${cnt(MAPP["map.owner"].html, "green")}, grey ${cnt(MAPP["map.owner"].html, "grey")} of ${MJ.nodes.length}`);
  const flows = MAPP["flows.owner"].html, deps = MAPP["deps.owner"].html;
  const workHead = (h) => (/<g class="mx-colh" data-col="\d+" transform="[^"]*"( style="display:none")?><text class="mx-colt" y="0">DECISIONS AND GAPS<\/text>/.exec(h) || [null, "absent"])[1];
  ok((flows.match(/data-button="flow-pick"/g) || []).length === FL_CV.flows.length && workHead(deps) === undefined && workHead(MAPP["map.owner"].html) === ' style="display:none"',
    `/map/flows lists every flow to play (${(flows.match(/data-button="flow-pick"/g) || []).length}); /map/deps draws the decisions and gaps column (D1b item 15: named for what it holds), hidden on /map's default layers`);
  const arch = MAPP["arch.owner"].html, mcp = MAPP["mcp.owner"].html;
  const tools = (mcp.match(/<li class="p-li" data-tool="/g) || []).length;   // L4: a list of lines, not a table
  ok(/data-lane="/.test(arch) && /<svg class="mx-archsvg"/.test(arch) && /data-rule>/.test(arch) && new RegExp(`data-worker="${MODEL_ORG}"`).test(arch) && tools === DOOR.tools.length,
    `Map · Arch draws the architecture node's diagram, its lanes, its crossing rules and the one org worker, named from the org's row (${MODEL_ORG}); Map · MCP a line per tool, ${tools} = door.json's ${DOOR.tools.length}`);
  ok(MAPP.empty.status === 200 && /data-region="canvas"[\s\S]*?data-state="empty"[\s\S]*?preview/.test(MAPP.empty.html) && MAPP.empty.html.includes("No screen or entity is filed"),
    "a project with no model draws EMPTY on the canvas, naming preview (D1b item 11)");
  ok(MAPP.gapHtml.status === 200 && /class="mx-walk" data-walk="1\/\d+"/.test(MAPP.gapHtml.html) && !/file-it|\/verb/.test(MAPP.gapHtml.html),
    "GET /map/node?gap=1 (the inspector's HTML): the walk over the open gaps, and no press to a deleted door (POST /verb is gone)");
  ok(MAPP.unknown.status === 404 && MAPP.system.status === 302 && /^(?:\/[a-z0-9-]+)?\/map$/.test(MAPP.system.headers.get("location") || ""),   // under the org's address (sprint 7, 7.4)
    "an unknown plane is 404 on the Map tab; /map/system (the old System plane) lands on /map");
}
ok(MAP_CLIENT.length < 60000, `the Map's client is ${MAP_CLIENT.length} bytes, under 60 KB (the drawing kit included)`);
// atlasPageAudit(html, persona, n) -> failures by check id: the shell's own audit and the Screens view's (n: the JSON's screens)
const ATLAS_CSS = (h) => ((/<style>\n\.ax\{[\s\S]*?<\/style>/.exec(h) || [""])[0]);
function atlasPageAudit(html, persona, n) {
  const f = audit(html, persona, SRC);
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const at = ATLAS_REGIONS.map((r) => html.indexOf(`data-region="${r}"`));
  if (at.some((x) => x < 0) || at.some((x, i) => i && x < at[i - 1])) fail("region", `the Screens view: the regions are not all there in order (${ATLAS_REGIONS.join(" ")}): ${at.join(",")}`);
  for (const m of html.matchAll(/<[^>]*\sdata-button="([^"]+)"[^>]*>/g)) {
    const d = attr(m[0], "data-door"), c = attr(m[0], "data-client");
    if (!d && !c) fail("door", `the Screens view: button ${m[1]} carries no door and is not client-side`);
    if (d && !c) { const [meth, path] = d.split(" "); if (!inDoor(meth, path)) fail("door", `the Screens view: button ${m[1]}'s door ${d} is not in door.json`); }
  }
  if (/<nav class="viewbar"/.test(html)) fail("bar", "the Screens view is full width with the Map's bar: the shell's view bar is back");
  if (!/<header class="mx-bar" data-region="layers">[\s\S]*?data-button="version-chip" data-door="GET \/versions"[\s\S]*?<\/header>/.test(html)) fail("chip", "the Map's bar carries no version chip");
  if (!/<a class="rail-item" href="(?:\/[a-z0-9-]+)?\/map" data-tab="map" aria-current="true">/.test(html)) fail("tab", "the rail's Map destination is not current on the Screens view");
  if (!/<a class="mx-view" href="(?:\/[a-z0-9-]+)?\/map\/screens[^"]*" data-button="view-switch" data-door="[^"]+" data-view="screens" aria-current="page">/.test(html)) fail("view", "the Screens view is not the current view");
  if (n != null) {
    const frames = (html.match(/<li class="ax-f[^"]*" data-i="\d+"[^>]*><a class="ax-cap" href="(?:\/[a-z0-9-]+)?\/map\/screens\?[^"]*screen=/g) || []).length;
    if (frames !== n) fail("frames", `the board draws ${frames} frames, the JSON lists ${n} screens`);
    if (!/<input type="search" id="ax-q" data-input-exception="search"/.test(html)) fail("find", "find is not the declared search input");
  }
  for (const m of html.replace(/<script>[\s\S]*?<\/script>/g, "").matchAll(/<iframe\b[^>]*>/g)) if (!/\ssandbox=""/.test(m[0])) fail("sandbox", `an iframe that is not sandboxed: ${m[0].slice(0, 60)}`);
  if (/<iframe\b|<img\b[^>]*\/render\//.test(html.replace(/<script>[\s\S]*?<\/script>/g, ""))) fail("lazy", "the page itself loads a render: renders are loaded by the client, by zoom");
  const css = ATLAS_CSS(html);
  if (n != null && !css) fail("sheet", "the Screens view's own sheet is missing");
  for (const m of css.matchAll(/(?<![&\w])#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g)) fail("colour", `the Screens view's sheet: a raw colour ${m[0]}`);
  for (const m of css.matchAll(/var\(--bv-[a-z0-9-]+\)/g)) fail("colour", `the Screens view's sheet: ${m[0]} (the semantic tokens only)`);
  return f;
}
{
  const SJ = MAPP.screensJson.j || { screens: [] };
  for (const who of ["owner", "seat"]) {
    const p = MAPP[`screens.${who}`], bad = p.status !== 200 ? [`HTTP ${p.status}`] : atlasPageAudit(p.html, who === "owner" ? "owner" : "single-seat", SJ.screens.length);
    ok(!bad.length && SJ.screens.length > 0, `the Screens view as ${who === "owner" ? "the owner" : "a seat"}: GET /map/screens draws the atlas of ${SJ.screens.length} screens (${(SJ.surfaces || []).map((x) => x.key).join(", ")}), passing the shell's audit and its own (regions in order, buttons on their doors, the view current, a frame per screen, no render loaded by the page, semantic tokens only)${bad.length ? `\n      ${bad.slice(0, 8).join("\n      ")}` : ""}`);
  }
  const e = MAPP.screensEmpty;
  ok(e.status === 200 && /data-region="canvas"[\s\S]*?data-state="empty"[\s\S]*?preview/.test(e.html) && atlasPageAudit(e.html, "owner", null).length === 0,
    `a project with no screen: the Screens view draws EMPTY with the preview call (a screen node and its render)${atlasPageAudit(e.html, "owner", null).length ? `: ${atlasPageAudit(e.html, "owner", null).slice(0, 3).join("; ")}` : ""}`);
  const base = MAPP["screens.owner"].html;
  const reds = [
    ["door", "the Render switch off its door and not client-side", base.replace(/data-button="render-mode" data-client="[^"]*"/, 'data-button="render-mode"')],
    ["emdash", "an em dash in a screen's name", base.replace('<span>', '<span>\u2014 ')],
    ["colour", "a raw colour in the Screens view's sheet", base.replace(".ax-e{fill:none;stroke:var(--line-strong)", ".ax-e{fill:none;stroke:#10A37F")],
    ["region", "the screens bar dropped", base.replace('data-region="screens-bar"', "")],
    ["sandbox", "an iframe that is not sandboxed", base.replace('<div class="ax-dev">', '<div class="ax-dev"><iframe src="/render/x">')],
  ];
  for (const [id, label, h] of reds) ok(atlasPageAudit(h, "owner", SJ.screens.length).some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"`);
}
// both ways: every check above can fail
{
  const base = MAPP["map.owner"].html;
  const reds = [
    ["door", "a layer pill off its door and not client-side", base.replace('data-button="layer-toggle" data-client="shows or hides a layer of the canvas"', 'data-button="layer-toggle"')],
    ["emdash", "an em dash in a drawn name", base.replace("<title>", "<title>— ")],
    ["colour", "a raw colour in the Map's sheet", base.replace(".mx-t{font:500 13px/1 var(--sans);fill:var(--text)}", ".mx-t{font:500 13px/1 var(--sans);fill:#10A37F}")],
    ["colour", "a --bv-* name in the Map's sheet", base.replace(".mx-dot{fill:var(--stone)}", ".mx-dot{fill:var(--bv-stone)}")],
    ["bar", "the shell's view bar back over the Map", base.replace('<div class="main">', '<div class="main"><nav class="viewbar" aria-label="Views"></nav>')],
    ["region", "the inspector region dropped", base.replace('data-region="inspector"', "")],
    ["count", "a typed count on a layer pill", base.replace(/(data-layer="doors"[^>]*>Doors<b>)\d+/, "$1999")],
    ["layer", "the Data layer pressed on /map/api", MAPP["api.owner"].html.replace('data-layer="data" aria-pressed="false"', 'data-layer="data" aria-pressed="true"')],
  ];
  for (const [id, label, h] of reds) {
    const f = mapPageAudit(h, "owner", label.includes("/map/api") ? { layers: ["screens", "doors"] } : { layers: LAY });
    ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"`);
  }
}

// ---- 15. UI-B10b (Q792A0B9F, Q8E554970, Q61A1D91E): GTM (wf-gtm) ----
// Rendered by the REAL worker (so the REAL readGtmPipeline and the route's HTML face) over the Home fixture's SQLite plus
// gtm filings, a tree with two gtm nodes, and the brain's gtm.json pinned verbatim (tools/fixtures/gtm-template.json,
// brain board-pack/gtm.json at 8a0c9647). The truth each page is held to is its own JSON twin (the same read), GET /goals
// (the tiles are Goals' own gtm cells) and the pinned template, re-derived here, never the renderer's helpers.
const WFGT = SCREEN("wf-gtm");
ok(!!WFGT && JSON.stringify(WFGT.regions) === JSON.stringify(GTM_REGIONS) && JSON.stringify(WFGT.buttons) === JSON.stringify(["campaigns", "counters", "open-on-goals"])
  && WFGT.wires.counters.door === "GET /gtm" && WFGT.wires["open-on-goals"].door === "GET /goals/:ref" && !WFGT.wires.campaigns.door && !!WFGT.wires.campaigns.client
  && String(WFGT.wires.counters.mcp) === FILING_COUNTER_CALL && WFGT.doors.some((d) => d.m === "GET" && d.path === "/gtm"),
  `the pinned wireframe's wf-gtm (${WFGT ? `${WFGT.regions.join(" ")}; ${WFGT.buttons.join(" ")}` : "absent"}): src/gtm.js GTM_REGIONS draws the same regions; the counters call is the wireframe's, verbatim`);
const GT_TEXT = read(join(ENGINE, "tools", "fixtures", "gtm-template.json"));
const GT = JSON.parse(GT_TEXT);
const GT_KINDS = GT.activityKinds;
// the reordered template (the probe's own variant): the kinds reversed and one renamed, so a lane order typed in src goes red
const GT_REN = [GT_KINDS[2], `${GT_KINDS[2]}-renamed`];
const GT_R = (() => { const g = JSON.parse(GT_TEXT);
  g.activityKinds = g.activityKinds.map((k) => (k === GT_REN[0] ? GT_REN[1] : k)).reverse();
  for (const k of g.activityTemplate.kinds) if (k.kind === GT_REN[0]) k.kind = GT_REN[1];
  g.activityTemplate.kinds.reverse(); return g; })();
ok(Array.isArray(GT_KINDS) && GT_KINDS.length >= 3 && GT_KINDS.every((k) => GT.activityTemplate.kinds.some((e) => e.kind === k)),
  `the pinned template (v${GT.v}) is the real export: activityKinds [${GT_KINDS.join(" ")}], each with its activityTemplate entry`);
const GT_TREE = [
  { id: "grow", title: "Grow the practice", parent: null, dimensions: [] },
  { id: "reach", title: "Reach the teams", parent: "grow", dimensions: ["gtm"], target: 3 },
  { id: "pipeline", title: "Book the calls", parent: "grow", dimensions: ["gtm"], target: 8, outcomeMetric: true },
  { id: "ship", title: "Ship the kit", parent: "grow", dimensions: ["code"], target: 2 },
];
const GT_UNLISTED = "webinar";   // a kind the template does not list: it gets its own lane, by name, after the template's
function gtmWorld({ tree = GT_TREE, gtm = "own", rows = true, down = false } = {}) {
  const fx = homeFixtureEnv(down ? { throwOn: (q) => /transmission/.test(q) } : {});
  const q = fx.sqlite, hash = (x) => createHash("sha256").update(x).digest("hex");
  q.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-o'").run(hash("wire-owner-key"));
  q.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-c'").run(hash("wire-seat-key"));
  const now = Date.now(), at = (m) => new Date(now - m * 60000).toISOString();
  const [k0, k1, , k3] = GT_KINDS;
  if (rows) {
    const X = q.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,proof,route,status,decision,eval,project,parent,goal_ref,via,created_at,expected,actual,outcome,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
    X.run("T-GTW-01", "p-c", "gtm", k0, "posted the launch thread", "reach", "gtm", "https://social.example/p/1?a=1&b=2", "auto", "routed", null, 0, "alpha", null, "reach", "mcp", at(11), "40 replies", null, null);
    X.run("T-GTW-02", "p-a", "gtm", k1, "wrote to three teams", "pipeline", "gtm", "https://mail.example/log/2", "owner", "routed", null, 0, "alpha", null, "reach", "mcp", at(12), "3 calls", null, null);
    X.run("T-GTW-03", "p-c", "gtm", k3, "a guide on the org wall", "reach", "gtm", "posted it <b>went well</b>", "incomplete", "routed", null, 0, "alpha", null, "reach", "mcp", at(13), null, null, null);
    X.run("T-GTW-04", "p-c", "gtm", GT_UNLISTED, "ran the first session", "pipeline", "gtm", "https://video.example/w/4", "auto", "routed", null, 0, "alpha", null, "pipeline", "mcp", at(14), "10 seats", "7 came", null);
    X.run("T-GTW-05", "p-o", "gtm", k1, "booked five calls", "pipeline", "gtm", "https://cal.example/9", "owner", "closed", "approve", 0, "alpha", null, "pipeline", "mcp", at(18), "8 calls", "5 calls", 5);
    X.run("T-GTW-06", "p-a", "gtm", "counter", "the thread overclaims", "a counter", "gtm", null, "owner", "routed", null, 0, "alpha", "T-GTW-01", null, "mcp", at(9), null, null, null);
  } else q.prepare("DELETE FROM transmission WHERE LOWER(lane) = 'gtm'").run();
  fileGoals(q, tree);
  // the project's template, filed as preview then file files it (k_gtm), or none
  const tpl = gtm === "own" ? GT_TEXT : gtm === "reordered" ? JSON.stringify(GT_R) : null;
  if (tpl) q.prepare("INSERT OR REPLACE INTO k_gtm (project, template, created_by, created_at, updated_by, updated_at) VALUES ('alpha', ?, 'p-o', ?, 'p-o', ?)").run(JSON.stringify(JSON.parse(tpl)), at(30), at(30));
  const files = {};   // the R2 binding holds nothing the worker reads (the org is its D1 row)
  const base = fx.env.BRAIN, enc = new TextEncoder();
  const obj = (t) => { const b = enc.encode(t), e = hash(t).slice(0, 16); return { text: async () => t, json: async () => JSON.parse(t), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    get body() { return new Response(b).body; }, size: b.byteLength, etag: e, httpEtag: '"' + e + '"', uploaded: new Date(now), writeHttpMetadata() {} }; };
  const baseText = async (k) => { const o = await base.get(k); return o ? await o.text() : null; };
  fx.env.BRAIN = { ...base,
    get: async (k) => { const t = files[k] != null ? files[k] : await baseText(k); return t == null ? null : obj(t); },
    head: async (k) => { const t = files[k] != null ? files[k] : await baseText(k); return t == null ? null : { size: enc.encode(t).byteLength, etag: hash(t).slice(0, 16), uploaded: new Date(now) }; } };
  return fx;
}
const GTP = {}, GTW = {};
for (const [k, o] of Object.entries({ full: {}, reordered: { gtm: "reordered" }, absent: { gtm: "absent" }, notree: { tree: null },
  nogtm: { tree: [GT_TREE[0], GT_TREE[3]] }, empty: { rows: false }, down: { down: true } })) {
  const W = GTW[k] = gtmWorld(o);
  GTP[k] = { json: await modelGet(W, "/gtm", "owner", "application/json"), page: await modelGet(W, "/gtm", "owner", "text/html"),
    goals: k === "down" ? null : await modelGet(W, "/goals", "owner", "application/json") };
  if (k === "full") GTP.seat = { json: await modelGet(W, "/gtm", "seat", "application/json"), page: await modelGet(W, "/gtm", "seat", "text/html") };
}
const GT_SRC = read(join(ENGINE, "src", "gtm.js"));
const GT_SAMPLES = ["312 reached", "57 replied", "31 ran it", "2 stayed", "+41 this week", "goal: 200", "goal: 25", "18% of reached", "Ran it once", "Ran a second week",
  "Northwind Labs", "Kestrel", "Ovid", "Merrow", "Tessel", "Halcyon", "Brant", "Ardent", "Pell"];
const GT_FUNNEL = ["Reached", "Replied", "Ran it", "Stayed"];
const GT_TABS = ["home", "build", "gtm", "goals", "decisions", "map", "broadcast", "control"];
const tabKeysOf = (src) => { const m = /^const TABS = (\[[\s\S]*?^\]);/m.exec(src); try { return m ? new Function("return " + m[1])().map((t) => t.key) : null; } catch { return null; } };
// gtmAudit(html, j, persona, o) -> failures by check id: the screen audit (regions non-empty, every button on its door or
// client-side, every door in door.json, no typed input, no em dash), each region once and in the artboard's order, the tab
// lit and third, no view bar, the lanes / rows / buttons against the page's own JSON, the proof rule, the messages, no
// artboard sample, no kind typed in src/gtm.js, Brand v2 tokens only, and the shell's own audit
function gtmAudit(html, j, persona, o = {}) {
  const gsrc = o.gsrc || GT_SRC, ssrc = o.ssrc || SRC;
  const skip = new RegExp(`button (${(o.absent || []).join("|") || "-"}) not rendered`);
  const f = screenAudit(html, WFGT, { pins: 0 }).filter((x) => !skip.test(x));
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const tags = (b) => [...html.matchAll(new RegExp(`<[^>]*data-button="${b}"[^>]*>`, "g"))].map((m) => m[0]);
  const off = (t) => /\sdisabled(?=[\s>])/.test(t.replace(/"[^"]*"/g, '""')) || attr(t, "aria-disabled") === "true";
  const un = (x) => (x == null ? x : x.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  // sprint 3 L2 (the revision): goal-link is the head's Open on Goals, so the order is not pinned; each region appears once
  for (const r of GTM_REGIONS) { const n = html.split(`data-region="${r}"`).length - 1; if (n !== 1) fail("region", `wf-gtm: data-region="${r}" appears ${n} times`); }
  // the tab: GTM lit, third of the rendered row, TABS registering the eight in the ruled order; one view, so no view bar
  if (!isLit(html, "gtm", "/gtm", "GTM")) fail("tab", "the GTM tab is not the current tab, or does not open /gtm");
  const row = tabsOf(html), wantRow = ["Home", "Build", "GTM", "Goals", "Decisions", "Map", "Broadcast", "Control"];   // UI-B12b: Control for every seated reader
  if (JSON.stringify(row) !== JSON.stringify(wantRow)) fail("tab", `the tab row reads [${row.join(" ")}], want [${wantRow.join(" ")}]`);
  const keys = tabKeysOf(ssrc);
  if (JSON.stringify(keys) !== JSON.stringify(GT_TABS)) fail("tab", `shell.js TABS registers [${(keys || []).join(" ")}], want [${GT_TABS.join(" ")}] (GTM third, Q322F3DF0)`);
  if (hasViewBar(html)) fail("bar", "GTM carries a view bar (one view, the artboard draws none)");
  const text = textOf(html);
  for (const s_ of GT_SAMPLES) if (text.includes(s_)) { fail("sample", `the page draws the artboard's sample "${s_}"`); break; }
  // sprint 3 L2: a lane is drawn when it holds a row (a lane with none would only say 0); with no row at all, the activity kinds
  // are listed once, folded, in the read's order
  const lanesAll = ((j && j.regions) || {}).lanes || [];
  const lanes = lanesAll.some((l) => (l.rows || []).length) ? lanesAll.filter((l) => (l.rows || []).length) : lanesAll;
  const dl = []; for (const m of html.matchAll(/data-lane="([^"]+)"/g)) if (!dl.includes(un(m[1]))) dl.push(un(m[1]));
  if (JSON.stringify(dl) !== JSON.stringify(lanes.map((l) => l.kind))) fail("lane", `data-lane [${dl.join(" ")}], want the read's lanes [${lanes.map((l) => l.kind).join(" ")}]`);
  const funnel = dl.filter((x) => GT_FUNNEL.includes(x));
  if (funnel.length) fail("lane", `a funnel lane is drawn [${funnel.join(" ")}] (Q792A0B9F: a lane is a filed kind)`);
  const jr = new Map(lanes.flatMap((l) => l.rows || []).map((r) => [r.id, r]));
  const rtags = new Map(); for (const m of html.matchAll(/<[^>]*data-row="([^"]+)"[^>]*>/g)) if (!/data-button=/.test(m[0]) && !rtags.has(un(m[1]))) rtags.set(un(m[1]), m[0]);
  if (JSON.stringify([...rtags.keys()].sort()) !== JSON.stringify([...jr.keys()].sort())) fail("row", `data-row [${[...rtags.keys()].join(" ")}], want the read's rows [${[...jr.keys()].join(" ")}]`);
  for (const [id, t] of rtags) if (jr.has(id) && (un(attr(t, "data-campaign")) || "") !== (jr.get(id).goalRef || "")) fail("row", `row ${id} carries data-campaign "${attr(t, "data-campaign")}", its goalRef is "${jr.get(id).goalRef || ""}"`);
  // sprint 3 L2 (pristine copy): a row's counters show where some stand (one link per such row, read on its page); the call that
  // files one is never on glass (it rides the JSON and What is missing)
  const ct = tags("counters"), standing = [...jr.values()].filter((r) => r.counters && Number(r.counters.standing) > 0);
  if (ct.length !== standing.length) fail("counters", `${ct.length} counters link(s), want one per row with a standing counter (${standing.length})`);
  for (const r of standing) if (!ct.some((t) => un(attr(t, "data-row-id")) === r.id)) fail("counters", `row ${r.id}: its counters link is not on glass`);
  for (const [id, r] of jr) if (r.call && html.includes(esc4(r.call))) fail("call", `row ${id}: its counter call is on glass (pristine copy: it rides What is missing)`);
  const links = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => un(m[1]));
  for (const [id, r] of jr) {
    const p = r.proof || "";
    if (/^https?:\/\//.test(p) && !links.includes(p)) fail("proof", `row ${id}'s http(s) proof is not drawn as a link`);
    if (p && !/^https?:\/\//.test(p) && links.includes(p)) fail("proof", `row ${id}'s narration proof is drawn as a link`);
  }
  if (/<b>went well<\/b>/.test(html)) fail("proof", "a proof is drawn unescaped");
  const camps = (j && j.campaigns) || [];
  const cc = tags("campaigns");
  if (cc.some((t) => attr(t, "data-client") == null || attr(t, "data-door"))) fail("campaign", "a campaigns chip is not client-side (data-client, no door)");
  const cids = cc.map((t) => un(attr(t, "data-campaign"))).filter(Boolean).sort();
  // D2b item 9: nothing contributed toward the gtm goals: one phrase in metrics, no tiles and no chips repeating the goal names
  const noneFiled = /data-state="empty"/.test((regionOf(html, "metrics") || { inner: "" }).inner);
  // (a chip that would show nothing is not drawn: the gtm nodes some row names)
  const named = camps.filter((c) => [...jr.values()].some((r) => r.goalRef === c.id)).map((c) => c.id).sort();
  if (!(noneFiled && !cids.length) && JSON.stringify(cids) !== JSON.stringify(named)) fail("campaign", `the campaigns chips name [${cids.join(" ")}], want exactly the gtm nodes a row names [${named.join(" ")}]`);
  const og = tags("open-on-goals");
  if (og.length !== 1) fail("goal-link", `${og.length} open-on-goals button(s), want one`);
  else if (camps.length && (off(og[0]) || un(attr(og[0], "href")) !== "/goals/" + camps[0].id)) fail("goal-link", `open-on-goals is not enabled on /goals/${camps[0].id} (the first gtm node): ${og[0].slice(0, 140)}`);
  else if (!camps.length && (!off(og[0]) || un(attr(og[0], "title")) !== GTM_NO_GOAL || attr(og[0], "href"))) fail("goal-link", `with no gtm node open-on-goals is not disabled with "${GTM_NO_GOAL}": ${og[0].slice(0, 140)}`);
  // D2b (pristine copy, owner 2026-10-02): a read's message rides the JSON and the tool; the page says a short phrase, never
  // the message's sentence with its call
  for (const m of (j && j.messages) || []) if (text.includes(m)) fail("message", `the page prints the read's message: "${m}" (a phrase, never the message: pristine copy)`);
  const c = ((j && j.stamp) || {}).counts || {};
  if (c.filings != null && !noneFiled && !new RegExp(`data-metric="filings" data-value="${c.filings}"`).test(html)) fail("count", `the glance does not read the read's own count (${c.filings} contributions)`);
  // no kind typed in src/gtm.js (the template names them; the engine never does), and the page's own tokens
  for (const k of new Set([...GT_KINDS, GT_UNLISTED])) if (new RegExp(`(["'\`])${k}\\1`).test(jsCodeOf(gsrc))) fail("kind", `src/gtm.js types the kind "${k}"`);
  // the look pass: the page's own style names the semantic tokens only (the Fredoka tile number is judged on the shots)
  const own = gsrc.replace(/`/g, "");
  for (const m of own.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) fail("colour", `src/gtm.js: a colour literal #${m[1]}`);
  lookVarFails(own, "src/gtm.js", fail);
  return [...f, ...audit(html, persona, ssrc)];
}
const gtJ = (k) => (GTP[k].json || {}).j || {};
const GTA = {};
for (const k of ["full", "reordered", "absent", "notree", "nogtm", "empty", "down"]) {
  const noNode = k === "notree" || k === "nogtm" || k === "empty", noRow = k === "empty" || k === "down";
  // (sprint 3 L2: a campaign chip that would show no row is not drawn, so a page with no row draws none)
  GTA[k] = gtmAudit(GTP[k].page.html, gtJ(k), "owner", { absent: [...(noNode || noRow ? ["campaigns"] : []), ...(noRow ? ["counters"] : [])] });
}
GTA.seat = gtmAudit(GTP.seat.page.html, GTP.seat.json.j, "single-seat");
const gtFull = gtJ("full");
ok(GTP.full.page.status === 200 && /text\/html/.test(GTP.full.page.type) && GTP.full.json.status === 200 && /json/.test(GTP.full.json.type) && GTA.full.length === 0,
  `GTM (GTM.dc.html), the owner, through the real worker: HTML to a browser and JSON otherwise; metrics · lanes · goal-link once each in order, data-lane [${dl0()}], ${gtRows(gtFull)} data-row each with its goalRef, a counters button and exact call per row, the campaigns chips onto the gtm nodes, open-on-goals on /goals/${(gtFull.campaigns || [{}])[0].id}, proofs linked only when http(s), the GTM tab lit and third, no sample, no typed kind, Brand v2 tokens, and the shell's own audit${GTA.full.length ? `\n      ${GTA.full.join("\n      ")}` : ""}`);
function dl0() { return (((gtFull.regions || {}).lanes) || []).map((l) => l.kind).join(" "); }
function gtRows(j) { return (((j.regions || {}).lanes) || []).reduce((a, l) => a + (l.rows || []).length, 0); }
ok(GTA.seat.length === 0 && JSON.stringify(GTP.seat.json.j.regions.lanes.map((l) => l.kind)) === JSON.stringify(gtFull.regions.lanes.map((l) => l.kind)),
  `GTM, a seated reader (Rae, on alpha): the same page, the Control tab on her row too (UI-B12b), the same audit${GTA.seat.length ? `\n      ${GTA.seat.join("\n      ")}` : ""}`);
// the truth the page is held to, re-derived: lanes = the pinned template's kinds in order, then every filed kind it does not
// list (read off the fixture's own SQLite: the gtm lane, alpha, no counter kind, no suite row), by name
const GT_FILED = [...new Set(GTW.full.sqlite.prepare("SELECT kind FROM transmission WHERE LOWER(lane) = 'gtm' AND project = 'alpha' AND eval = 0 AND kind NOT IN ('counter','critique','rank','restore')").all().map((x) => x.kind))];
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const wantLanes = [...GT_KINDS, ...GT_FILED.filter((x) => !GT_KINDS.includes(x)).sort(byName)];
const wantR = [...GT_R.activityKinds, ...GT_FILED.filter((x) => !GT_R.activityKinds.includes(x)).sort(byName)];
const gotLanes = (k) => ((gtJ(k).regions || {}).lanes || []).map((l) => l.kind);
ok(JSON.stringify(gotLanes("full")) === JSON.stringify(wantLanes) && JSON.stringify(gotLanes("reordered")) === JSON.stringify(wantR)
  && gotLanes("absent").every((x, i, a) => !i || a[i - 1] < x) && JSON.stringify(gotLanes("absent")) === JSON.stringify([...GT_FILED].sort(byName)) && GT_FILED.includes(GT_UNLISTED),
  `the lanes follow the filed template: [${gotLanes("full").join(" ")}]; reordered and renamed [${gotLanes("reordered").join(" ")}]; no template, the filed kinds by name [${gotLanes("absent").join(" ")}]`);
{ const gn = new Map((((GTP.full.goals || {}).j || {}).nodes || []).map((n) => [n.id, (n.dims || []).find((d) => d.dim === "gtm")]));
  const tiles = (gtFull.regions || {}).metrics || [];
  const same = tiles.length === 2 && tiles.every((m) => { const d = gn.get(m.id); return d && d.count === m.count && d.target === m.target && d.pct === m.pct; });
  const html = GTP.full.page.html, met = (regionOf(html, "metrics") || { inner: "" }).inner;
  const gl = (regionOf(html, "goals") || { inner: "" }).inner;
  ok(same && tiles.every((m) => gl.includes(`data-goal="${m.id}" data-count="${m.count}" data-target="${m.target}"`)) && /data-metric="goals"/.test(met),
    `goals: one line per gtm node [${tiles.map((m) => `${m.id} ${m.count} of ${m.target} ${m.pct}%`).join(", ")}], each equal to GET /goals nodes[].dims gtm and drawn off it`); }
ok(GTA.reordered.length === 0 && GTA.absent.length === 0 && (gtJ("absent").messages || []).includes(GTM_NO_TEMPLATE) && gtJ("absent").template === null
  && !GTP.absent.page.html.includes(esc4(GTM_NO_TEMPLATE)),
  `the template filed reordered, and none filed: each page audits clean; with none the read says "${GTM_NO_TEMPLATE}" and the page does not print it (D2b, pristine copy: What is missing holds the call)${[...GTA.reordered, ...GTA.absent].length ? `\n      ${[...GTA.reordered, ...GTA.absent].join("\n      ")}` : ""}`);
ok(GTA.notree.length === 0 && GTA.nogtm.length === 0 && gtJ("notree").declared === false && (gtJ("nogtm").campaigns || []).length === 0
  && /data-state="empty"/.test((regionOf(GTP.nogtm.page.html, "goals") || { inner: "" }).inner) && !/data-metric="goals"/.test(GTP.nogtm.page.html),
  `no declared tree, and a tree with no gtm node: the goals EMPTY (a phrase, D2b), no Goals realized tile, no chip, open-on-goals disabled with "${GTM_NO_GOAL}" as its title${[...GTA.notree, ...GTA.nogtm].length ? `\n      ${[...GTA.notree, ...GTA.nogtm].join("\n      ")}` : ""}`);
ok(GTA.empty.length === 0 && (gtJ("empty").messages || []).includes(GTM_EMPTY) && /data-state="empty"/.test((regionOf(GTP.empty.page.html, "metrics") || { inner: "" }).inner)
  && (GTP.empty.page.html.match(/<li\b[^>]*data-lane=/g) || []).length === ((gtJ("empty").regions || {}).lanes || []).length,
  `EMPTY: no gtm filing: the read says "${GTM_EMPTY}", the glance a phrase (D2b), the template's activity kinds still listed${GTA.empty.length ? `\n      ${GTA.empty.join("\n      ")}` : ""}`);
ok(GTP.down.page.status === 200 && gtJ("down").live === "unreachable" && /data-state="unreachable"/.test(GTP.down.page.html) && GTA.down.length === 0 && !/data-count="0"/.test(GTP.down.page.html),
  `UNREACHABLE: a failed ledger read is 200 with live:'unreachable', the block on the page and ? for every number, never a guessed zero${GTA.down.length ? `\n      ${GTA.down.join("\n      ")}` : ""}`);
// both ways: each injected defect goes red on its own check
const GTF = GTP.full.page.html, GTNG = GTP.nogtm.page.html, GTE = GTP.empty.page.html;
const gtmRow = (/\n  \{ key: "gtm"[^\n]*\n[^\n]*\n/.exec(SRC) || [""])[0];
const GTMUT = [
  ["sample", 'a typed "312 reached"', () => gtmAudit(GTF.replace("<h1>GTM</h1>", '<h1>GTM</h1><p class="lede">312 reached · 57 replied · 31 ran it · 2 stayed</p>'), gtFull, "owner")],
  ["lane", "the four funnel lanes", () => gtmAudit(GTF.replace(/<section[^>]*data-region="lanes">/, (m) => m + GT_FUNNEL.map((x) => `<div class="gt-lane" data-lane="${x}"><h3 class="gt-lane-h"><span>${x}</span></h3></div>`).join("")), gtFull, "owner")],
  ["sample", "a sample org (Northwind Labs)", () => gtmAudit(GTF.replace(/<section[^>]*data-region="lanes">/, (m) => m + '<p class="gt-x">Northwind Labs · 4-person team, ships weekly</p>'), gtFull, "owner")],
  ["kind", "a kind list typed in src/gtm.js", () => gtmAudit(GTF, gtFull, "owner", { gsrc: GT_SRC + `\nconst LANES = [${GT_KINDS.map((k) => JSON.stringify(k)).join(", ")}];\n` })],
  ["goal-link", "open-on-goals enabled with no gtm node", () => gtmAudit(GTNG.replace(/<button\b[^>]*data-button="open-on-goals"[^>]*>/, '<a class="u-btn small" href="/goals/grow" data-button="open-on-goals" data-door="GET /goals/:ref">'), gtJ("nogtm"), "owner", { absent: ["campaigns"] })],
  ["tab", "GTM out of TABS order (after Goals)", () => gtmAudit(GTF, gtFull, "owner", { ssrc: gtmRow ? SRC.replace(gtmRow, "\n").replace(/(\n  \{ key: "goals", label: "Goals", icon:[^\n]*\n[^\n]*\n)/, (m) => m + gtmRow.slice(1)) : "no gtm row" })],
  ["tab", "the GTM tab not lit", () => gtmAudit(unlight(GTF, "gtm"), gtFull, "owner")],
  ["region", "the lanes region twice", () => gtmAudit(GTF.replace(/<span data-region="goal-link"/, (m) => '<section data-region="lanes">x</section>' + m), gtFull, "owner")],
  ["row", "a row's data-campaign that is not its goalRef", () => gtmAudit(GTF.replace('data-row="T-GTW-04" data-campaign="pipeline"', 'data-row="T-GTW-04" data-campaign="reach"'), gtFull, "owner")],
  ["call", "a row's counter call back on glass", () => gtmAudit(GTF.replace('data-region="lanes"', `data-region="lanes"><code>${esc4(FILING_COUNTER_CALL.replace("<id>", "T-GTW-01"))}</code><i hidden`), gtFull, "owner")],
  ["door", "counters on another door", () => gtmAudit(GTF.replace('data-button="counters" data-door="GET /gtm"', 'data-button="counters" data-door="POST /counter"'), gtFull, "owner")],
  ["proof", "a narration proof drawn as a link", () => gtmAudit(GTF.replace("<dd>posted it &lt;b&gt;went well&lt;/b&gt;</dd>", '<dd><a href="posted it &lt;b&gt;went well&lt;/b&gt;">proof</a></dd>'), gtFull, "owner")],
  ["proof", "a proof drawn unescaped", () => gtmAudit(GTF.replace("posted it &lt;b&gt;went well&lt;/b&gt;", "posted it <b>went well</b>"), gtFull, "owner")],
  ["campaign", "a campaigns chip onto a non-gtm node", () => gtmAudit(GTF.replace('data-button="campaigns" data-campaign="pipeline"', 'data-button="campaigns" data-campaign="ship"'), gtFull, "owner")],
  // D2b (pristine copy): the read's message printed on the page as a sentence goes red
  ["message", "the read's message printed on the page", () => gtmAudit(GTE.replace('<section class="gt"', `<p>${esc4(GTM_EMPTY)}</p><section class="gt"`), gtJ("empty"), "owner", { absent: ["counters", "campaigns"] })],
  ["colour", "a hex colour in the page's own style", () => gtmAudit(GTF, gtFull, "owner", { gsrc: GT_SRC.replace(".gt{display:block}", ".gt{display:block;color:#6B4FA8}") })],
  ["colour", "a --bv-* palette name back in the page's own style", () => gtmAudit(GTF, gtFull, "owner", { gsrc: GT_SRC.replace(".gt{display:block}", ".gt{display:block;color:var(--bv-dark-text)}") })],
];
ok(GTA.full.length === 0 && GTA.nogtm.length === 0 && GTA.empty.length === 0, "both ways: the clean GTM renders (full, no gtm node, EMPTY) are green before any injection");
for (const [id, label, run] of GTMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? ` (${f.find((x) => x.startsWith(id + ":")) || f[0]})` : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

// ---- 16. UI-B11b (Q2485A7FD, Q0E5A1073, Q571B3D89, QEBB5D318, QF4501CEC): Broadcast (wf-broadcast) ----
// Rendered by the REAL worker (so the REAL readBroadcast and the route's HTML face) over the Home fixture's SQLite plus a
// shelf filed as the ledger holds it (Fork 1 (a): item drafts, publish rows whose parent is the draft, equip rows whose parent
// is the publish, per project): field-notes (a skill, Rae's, published twice, alpha pinned to v1 by the owner, so "update"),
// handoff-kit (a workflow, the owner's, published once, not equipped) and Rae's unpublished draft tidy-queue. Three readers:
// the owner (no draft of his own left to publish), Rae (seated on alpha, one publishable draft) and Uma (in the org, no
// seat: equip disabled with its reason). The truth each page is held to is its own JSON twin (the same read), never the
// renderer's helpers; the empty and unreachable worlds are the same fixture with no shelf rows and with the ledger down.
const WFBC = SCREEN("wf-broadcast");
ok(!!WFBC && JSON.stringify(WFBC.regions) === JSON.stringify(BROADCAST_REGIONS) && JSON.stringify(WFBC.buttons) === JSON.stringify(["publish", "equip", "update-version", "kind-filter"])
  && WFBC.wires.publish.door === "POST /broadcast/publish" && WFBC.wires.equip.door === "POST /broadcast/equip" && WFBC.wires["update-version"].door === "POST /broadcast/equip"
  && !WFBC.wires["kind-filter"].door && !!WFBC.wires["kind-filter"].client && WFBC.doors.some((d) => d.m === "GET" && d.path === "/broadcast"),
  `the pinned wireframe's wf-broadcast (${WFBC ? `${WFBC.regions.join(" ")}; ${WFBC.buttons.join(" ")}` : "absent"}): src/broadcastpage.js BROADCAST_REGIONS draws the same regions`);
function broadcastWorld({ rows = true, down = false } = {}) {
  const fx = gtmWorld({ rows: false, down });
  const q = fx.sqlite, hash = (x) => createHash("sha256").update(x).digest("hex");
  q.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)").run("p-u", "Uma Reyes", "uma@northwind.test", "internal-eng", hash("wire-unseat-key"), 1, new Date().toISOString());
  if (rows) {
    const now = Date.now(), at = (m) => new Date(now - m * 60000).toISOString();
    const X = q.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,why,touches,gaprefs,proof,route,status,decision,eval,project,parent,via,created_at,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
    const item = (id, who, what, kind, slug, m) => X.run(id, who, "leader", "item", what, "one line on why", kind, "item/" + slug, "https://src.example/" + slug, "auto", "routed", null, 0, "alpha", null, "mcp", at(m));
    const press = (id, who, kind, parent, project, m) => X.run(id, who, "leader", kind, kind, kind, null, null, null, "auto", "routed", null, 0, project, parent, "web", at(m));
    item("T-BCW-01", "p-c", "Field notes, the first cut", "skill", "field-notes", 60); press("T-BCW-02", "p-c", "publish", "T-BCW-01", "alpha", 59);
    press("T-BCW-03", "p-o", "equip", "T-BCW-02", "alpha", 50);
    item("T-BCW-04", "p-c", "Field notes, sharper", "skill", "field-notes", 40); press("T-BCW-05", "p-c", "publish", "T-BCW-04", "alpha", 39);
    item("T-BCW-06", "p-o", "The handoff kit", "workflow", "handoff-kit", 30); press("T-BCW-07", "p-o", "publish", "T-BCW-06", "alpha", 29);
    item("T-BCW-08", "p-c", "Tidy the queue", "agent", "tidy-queue", 20);
  }
  return fx;
}
const BCW = { full: broadcastWorld(), empty: broadcastWorld({ rows: false }), down: broadcastWorld({ down: true }) };
const BCP = {};
for (const [k, who] of [["owner", "owner"], ["seat", "seat"], ["unseat", "unseat"]])
  BCP[k] = { json: await modelGet(BCW.full, "/broadcast", who, "application/json"), page: await modelGet(BCW.full, "/broadcast", who, "text/html") };
for (const k of ["empty", "down"]) BCP[k] = { json: await modelGet(BCW[k], "/broadcast", "seat", "application/json"), page: await modelGet(BCW[k], "/broadcast", "seat", "text/html") };
const BC_SRC = read(join(ENGINE, "src", "broadcastpage.js"));
// the artboard's typed content (Broadcast.dc.html, superseded by served data in wf-broadcast): its counts, its four items,
// its three people, its ages, the other orgs and "workspace" (Q93B3F368). Sprint 2: the artboard's per-kind chip counts
// ("Skills 4", "Agents 3", "Workflows 2") are no longer samples: the starter pack built into the engine makes every kind's
// count a served number (the starter's plus the org's), which can equal them
const BC_SAMPLES = ["9 published", "All 9", "release-notes", "release-checker", "outreach-log", "surface-sweep", "by ryuk", "by amir", "by jun",
  "updated today", "3 days ago", "siru", "veil", "Publish something", "this workspace", "workspaces"];
const BC_TABS = ["home", "build", "gtm", "goals", "decisions", "map", "broadcast", "control"];
// bcAudit(html, j, persona, o) -> failures by check id: the screen audit, the regions once each in the artboard's order, the tab
// lit and seventh, no view bar, no artboard sample, the cards / publish / equip / update-version / kind-filter against the page's
// own JSON, the EMPTY sentences, the stamp read off the read, Brand v2 tokens only, and the shell's own audit
function bcAudit(html, j, persona, o = {}) {
  const bsrc = o.bsrc || BC_SRC, ssrc = o.ssrc || SRC;
  const skip = new RegExp(`button (${(o.absent || []).join("|") || "-"}) not rendered`);
  const f = screenAudit(html, WFBC, { pins: 0 }).filter((x) => !skip.test(x));
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const tags = (b, h = html) => [...h.matchAll(new RegExp(`<[^>]*data-button="${b}"[^>]*>`, "g"))].map((m) => m[0]);
  const off = (t) => /\sdisabled(?=[\s>])/.test(t.replace(/"[^"]*"/g, '""')) || attr(t, "aria-disabled") === "true";
  const un = (x) => (x == null ? x : x.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  const idx = BROADCAST_REGIONS.map((r) => html.indexOf(`data-region="${r}"`));
  if (idx.some((i) => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) fail("region", `wf-broadcast: the regions are not in the artboard's order (${BROADCAST_REGIONS.join(" ")})`);
  for (const r of BROADCAST_REGIONS) { const n = html.split(`data-region="${r}"`).length - 1; if (n !== 1) fail("region", `wf-broadcast: data-region="${r}" appears ${n} times`); }
  // the tab: Broadcast lit, seventh of the rendered row (after Map, before Control), TABS registering the eight in the ruled order
  if (!isLit(html, "broadcast", "/broadcast", "Broadcast")) fail("tab", "the Broadcast tab is not the current tab, or does not open /broadcast");
  const row = tabsOf(html), wantRow = ["Home", "Build", "GTM", "Goals", "Decisions", "Map", "Broadcast", "Control"];   // UI-B12b: Control for every seated reader
  if (JSON.stringify(row) !== JSON.stringify(wantRow)) fail("tab", `the tab row reads [${row.join(" ")}], want [${wantRow.join(" ")}]`);
  const keys = tabKeysOf(ssrc);
  if (JSON.stringify(keys) !== JSON.stringify(BC_TABS)) fail("tab", `shell.js TABS registers [${(keys || []).join(" ")}], want [${BC_TABS.join(" ")}] (Broadcast seventh, before Control, Q322F3DF0)`);
  if (hasViewBar(html)) fail("bar", "Broadcast carries a view bar (one view, the artboard draws none)");
  const text = textOf(html), low = un(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").toLowerCase();
  for (const s_ of BC_SAMPLES) if (low.includes(s_.toLowerCase())) { fail("sample", `the page draws the artboard's sample "${s_}"`); break; }
  const shelf = ((j && j.regions) || {}).shelf || [];
  const cards = [...html.matchAll(/<[^>]*data-item="[^"]+"[^>]*>/g)].map((m) => m[0]).filter((t) => !/data-button=/.test(t));
  const got = cards.map((t) => `${un(attr(t, "data-item"))}/${un(attr(t, "data-kind"))}`), want = shelf.map((c) => `${c.slug}/${c.kind}`);
  if (JSON.stringify(got) !== JSON.stringify(want)) fail("card", `data-item/data-kind [${got.join(" ")}], want the read's shelf [${want.join(" ")}]`);
  const segs = html.split(/(?=<[^>]*data-item=")/);
  const pname = (j && j.project && (j.project.name || j.project.key)) || "";
  for (const c of shelf) {
    const seg = segs.find((s) => new RegExp(`^<[^>]*data-item="${c.slug}"`).test(s)) || "";
    const eq = tags("equip", seg), can = c.can || {}, here = c.here || {};
    if (eq.length !== 1) fail("equip", `card ${c.slug}: ${eq.length} equip button(s), want one`);
    else {
      if (!!can.equip === off(eq[0])) fail("equip", `card ${c.slug}: equip is ${off(eq[0]) ? "disabled" : "enabled"}, the read says can.equip ${!!can.equip}`);
      if (off(eq[0]) && !attr(eq[0], "title")) fail("equip", `card ${c.slug}: a disabled equip carries no reason`);
      const line = esc4(`Adds ${(c.publisher || {}).name}'s ${c.kind} to ${pname}. Everyone seated here gets it.`);
      if (can.equip && !seg.includes(line)) fail("equip", `card ${c.slug}: an enabled equip without D8's line`);
    }
    const up = tags("update-version", seg), live = up.filter((t) => !off(t));
    if (here.state === "update" && can.update) {
      // sprint 3 L3: the press reads "Update to v<n>"; where the project stands rides its title ("stays pinned to v<m>")
      if (live.length !== 1 || !seg.includes(`>Update to v${c.v}<`) || !seg.includes(`pinned to v${here.v}`)) fail("update", `card ${c.slug}: this project is on v${here.v} of v${c.v}, and no enabled update-version reads "Update to v${c.v}" (pinned to v${here.v} in its title)`);
    } else if (live.length) fail("update", `card ${c.slug}: an enabled update-version though the read says state ${here.state}, can.update ${!!can.update}`);
  }
  const mine = ((j && j.mine) || []).filter((m) => m.publishable);
  const forms = [...html.matchAll(/<form[^>]*action="\/broadcast\/publish"[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const fids = forms.filter((x) => /method="post"/.test(x) && tags("publish", x).some((t) => !off(t))).map((x) => un((/<input type="hidden" name="id" value="([^"]*)"/.exec(x) || [])[1]));
  if (JSON.stringify(fids.sort()) !== JSON.stringify(mine.map((m) => m.id).sort())) fail("publish", `publish forms for [${fids.join(" ")}], want one per own publishable draft [${mine.map((m) => m.id).join(" ")}]`);
  if (!mine.length) {
    const pt = tags("publish");
    if (!pt.length || pt.some((t) => !off(t) || !attr(t, "title"))) fail("publish", "with no draft to publish, publish is not disabled with its reason");
    // sprint 3 L3 (pristine copy): the call that files a draft rides What is missing, never this page
    if (j && j.call && html.includes(esc4(j.call))) fail("publish", "with no draft to publish, the call that files one is printed on the page");
  }
  const kf = tags("kind-filter");
  if (kf.some((t) => attr(t, "data-client") == null || attr(t, "data-door"))) fail("kind", "a kind-filter chip is not client-side (data-client, no door)");
  const kk = kf.map((t) => attr(t, "data-kind")).sort(), wk = (((j && j.filter) || {}).kinds || []).map((k) => k.kind).sort();
  if (JSON.stringify(kk) !== JSON.stringify(wk)) fail("kind", `kind-filter chips [${kk.join(" ")}], want filter.kinds [${wk.join(" ")}]`);
  // sprint 3 L3: an empty region is a phrase (data-state="empty"); the read's own sentence stays the JSON's
  for (const [r] of Object.entries((j && j.empty) || {})) if (r !== "mine" && !/data-state="empty"/.test((regionOf(html, r) || { inner: "" }).inner)) fail("empty", `the read says ${r} is empty, the page draws no EMPTY there`);
  const wall = (((j && j.regions) || {})["org-wall-note"] || {}).text;
  if (wall && !html.includes(esc4(wall))) fail("wall", "the org-wall note is not the read's own sentence");
  const c = ((j && j.stamp) || {}).counts || {};
  if (c.published != null && !html.includes(`data-metric="published" data-value="${c.published}"`)) fail("count", `the stamp does not read the read's own count (${c.published} published)`);
  // sprint 2: the starter shelf, one card per built-in item in the read's order, each with its Equip (or Update) on the equip
  // door, or the held mark; and the live picture's region
  const st = ((j && j.regions) || {})["starter-shelf"] || [];
  const pre = [...html.matchAll(/<li class="p-li" data-preset="([^"]+)" data-kind="([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`);
  if (JSON.stringify(pre) !== JSON.stringify(st.map((x) => `${x.slug}/${x.kind}`))) fail("starter", `data-preset/data-kind [${pre.join(" ")}], want the read's starter-shelf [${st.map((x) => `${x.slug}/${x.kind}`).join(" ")}]`);
  for (const x of st) {
    const seg = (html.split(/(?=<li class="p-li" data-preset=")/).find((q) => q.startsWith(`<li class="p-li" data-preset="${x.slug}"`)) || "").split("</li>")[0];
    const presses = [...seg.matchAll(/<button[^>]*data-button="(equip|update-version)"[^>]*>/g)].map((m) => m[0]);
    const held = /data-tone="ok" title="Equipped on [^"]*">Equipped</.test(seg);
    if (x.here && x.here.state === "current" ? !held || presses.length : presses.length !== 1 || !/data-door="POST \/broadcast\/equip"/.test(presses[0]) || !seg.includes(`value="preset:${x.slug}"`))
      fail("starter", `starter card ${x.slug} (${x.here && x.here.state}): ${presses.length} press(es), held mark ${held}`);
    else if (presses.length && !!(x.can.equip || x.can.update) === off(presses[0])) fail("starter", `starter card ${x.slug}: its press is ${off(presses[0]) ? "disabled" : "enabled"}, the read says ${JSON.stringify(x.can)}`);
  }
  if (st.length && !/data-region="live-picture"/.test(html)) fail("starter", "the live picture's region is not drawn");
  const own = bsrc.replace(/`/g, "");
  for (const m of own.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) fail("colour", `src/broadcastpage.js: a colour literal #${m[1]}`);
  lookVarFails(own, "src/broadcastpage.js", fail);
  return [...f, ...audit(html, persona, ssrc)];
}
const bcJ = (k) => (BCP[k].json || {}).j || {};
const BCA = { owner: bcAudit(BCP.owner.page.html, bcJ("owner"), "owner"), seat: bcAudit(BCP.seat.page.html, bcJ("seat"), "single-seat"),
  unseat: bcAudit(BCP.unseat.page.html, bcJ("unseat"), "single-seat", { absent: ["update-version"] }),
  empty: bcAudit(BCP.empty.page.html, bcJ("empty"), "single-seat", { absent: ["equip", "update-version"] }),
  down: bcAudit(BCP.down.page.html, bcJ("down"), "single-seat", { absent: ["equip", "update-version"] }) };
const bcShelf = (k) => ((bcJ(k).regions || {}).shelf || []);
const bcCard = (k, s) => bcShelf(k).find((c) => c.slug === s) || {};
ok(BCP.owner.page.status === 200 && /text\/html/.test(BCP.owner.page.type) && BCP.owner.json.status === 200 && /json/.test(BCP.owner.json.type) && BCA.owner.length === 0
  && JSON.stringify(bcShelf("owner").map((c) => `${c.slug} v${c.v} ${c.here.state}`)) === JSON.stringify(["handoff-kit v1 none", "field-notes v2 update"]),
  `Broadcast (Broadcast.dc.html), the owner, through the real worker: HTML to a browser and JSON otherwise; shelf · equipped-here · org-wall-note once each in order, the cards [${bcShelf("owner").map((c) => `${c.slug} v${c.v} ${c.here.state}`).join(", ")}], equip enabled exactly on can.equip with D8's line, Update to v2 (this project is on v1), publish disabled with its reason and the exact call, the kind chips, the Broadcast tab lit and seventh, no sample, Brand v2 tokens, and the shell's own audit${BCA.owner.length ? `\n      ${BCA.owner.join("\n      ")}` : ""}`);
ok(BCA.seat.length === 0 && (bcJ("seat").mine || []).filter((m) => m.publishable).map((m) => m.id).join() === "T-BCW-08",
  `Broadcast, a seated reader (Rae, on alpha): one publish form for her own draft T-BCW-08 (POST /broadcast/publish), the Control tab on her row too (UI-B12b), the same audit${BCA.seat.length ? `\n      ${BCA.seat.join("\n      ")}` : ""}`);
// seated nowhere in a two-project org, Uma reads the org level (project.js projectOf: no project), so there is nothing to equip into
ok(BCA.unseat.length === 0 && bcCard("unseat", "handoff-kit").can && bcCard("unseat", "handoff-kit").can.equip === false && (bcJ("unseat").project || {}).key == null
  && bcShelf("unseat").every((c) => c.can.equip === false && c.can.update === false && /no project to equip into|no seat/.test(c.can.reason || "")),
  `Broadcast, a reader with no seat (Uma): every equip disabled with "${bcCard("unseat", "handoff-kit").can ? bcCard("unseat", "handoff-kit").can.reason : "?"}"${BCA.unseat.length ? `\n      ${BCA.unseat.join("\n      ")}` : ""}`);
ok(BCA.empty.length === 0 && /Nothing published yet/.test(regionOf(BCP.empty.page.html, "shelf").inner) && /Nothing equipped/.test(regionOf(BCP.empty.page.html, "equipped-here").inner) && /data-state="empty"/.test((regionOf(BCP.empty.page.html, "shelf") || { inner: "" }).inner)
  && BCP.empty.page.html.includes(`title="${esc4(EMPTY_SHELF(bcJ("empty").org))}"`) && !BCP.empty.page.html.includes(`>${esc4(EMPTY_SHELF(bcJ("empty").org))}<`) && !BCP.empty.page.html.includes(esc4(NO_DRAFT)),
  `EMPTY: nothing published reads "Nothing published yet" and "Nothing equipped" (the read's own sentence rides the empty's title, whole), publish disabled with its reason, no call on the page${BCA.empty.length ? `\n      ${BCA.empty.join("\n      ")}` : ""}`);
ok(BCP.down.page.status === 200 && bcJ("down").live === "unreachable" && /data-state="unreachable"/.test(BCP.down.page.html) && BCA.down.length === 0 && /data-metric="published" data-value="–"/.test(BCP.down.page.html),
  `UNREACHABLE: a failed ledger read is 200 with live:'unreachable', the block on the page and ? for every count, never a guessed zero${BCA.down.length ? `\n      ${BCA.down.join("\n      ")}` : ""}`);
// both ways: each injected defect goes red on its own check
const BCO = BCP.owner.page.html, BCU = BCP.unseat.page.html, BCE = BCP.empty.page.html;
const bcRow = (/\n  \{ key: "broadcast"[^\n]*\n[^\n]*\n/.exec(SRC) || [""])[0];
const BCMUT = [
  ["sample", 'a typed "9 published"', () => bcAudit(BCO.replace('<section class="p-card p-tiles"', '<p class="lede">9 published · 3 equipped in this project · 1 update available</p><section class="p-card p-tiles"'), bcJ("owner"), "owner")],
  ["sample", "a sample item (release-checker)", () => bcAudit(BCO.replace('data-region="starter-shelf">', 'data-region="starter-shelf"><p class="bc-what">release-checker</p>'), bcJ("owner"), "owner")],
  ["sample", "a sample person (by amir)", () => bcAudit(BCO.replace('<section class="bc" data-screen="broadcast">', '<section class="bc" data-screen="broadcast"><p>published by amir</p>'), bcJ("owner"), "owner")],
  ["sample", '"siru or veil" on the org wall', () => bcAudit(BCO.replace(/(data-region="org-wall-note"[^>]*>)Stays inside/, "$1Stays inside siru or veil, not"), bcJ("owner"), "owner")],
  ["publish", "publish enabled with no draft", () => bcAudit(BCO.replace(/(<button type="button" class="u-btn small" data-button="publish" data-door="POST \/broadcast\/publish") disabled title="[^"]*"/, "$1"), bcJ("owner"), "owner")],
  ["equip", "equip enabled for a reader with no seat", () => bcAudit(BCU.replace(/(data-button="equip" data-door="POST \/broadcast\/equip") disabled title="[^"]*"/g, "$1"), bcJ("unseat"), "single-seat", { absent: ["update-version"] })],
  ["starter", "a starter card dropped", () => bcAudit(BCO.replace(/<li class="p-li" data-preset="qa-verify"[\s\S]*?<\/li>(?=<li class="p-li")/, ""), bcJ("owner"), "owner")],
  ["starter", "a starter Equip enabled for a reader with no seat", () => bcAudit(BCU.replace(/(<li class="p-li" data-preset="release"[\s\S]*?data-button="equip" data-door="POST \/broadcast\/equip") disabled title="[^"]*"/, "$1"), bcJ("unseat"), "single-seat", { absent: ["update-version"] })],
  ["tab", "Broadcast out of TABS order (after Control)", () => bcAudit(BCO, bcJ("owner"), "owner", { ssrc: bcRow ? SRC.replace(bcRow, "\n").replace(/(\n  \{ key: "control", label: "Control", icon:[^\n]*\n[^\n]*\n)/, (m) => m + bcRow.slice(1)) : "no broadcast row" })],
  ["tab", "the Broadcast tab not lit", () => bcAudit(unlight(BCO, "broadcast"), bcJ("owner"), "owner")],
  ["equip", "D8's line dropped", () => bcAudit(BCO.split(esc4(bcCard("owner", "handoff-kit").warning || "none")).join(""), bcJ("owner"), "owner")],
  ["update", "update-version not offered on the card that is behind", () => bcAudit(BCO.replace(/data-button="update-version"/g, 'data-button="update-versio"'), bcJ("owner"), "owner", { absent: ["update-version"] })],
  ["card", "a card missing its data-kind", () => bcAudit(BCO.replace('data-item="handoff-kit" data-kind="workflow"', 'data-item="handoff-kit"'), bcJ("owner"), "owner")],
  ["region", "the shelf region twice", () => bcAudit(BCO.replace('<p class="bc-wall" data-region="org-wall-note"', '<section class="u-section" data-region="shelf">x</section><p class="bc-wall" data-region="org-wall-note"'), bcJ("owner"), "owner")],
  ["empty", "a silent EMPTY", () => bcAudit(BCE.split('data-state="empty"').join('data-state="x"'), bcJ("empty"), "single-seat", { absent: ["equip", "update-version"] })],
  ["colour", "a hex colour in the page's own style", () => bcAudit(BCO, bcJ("owner"), "owner", { bsrc: BC_SRC.replace(".bc{display:block;", ".bc{display:block;color:#6B4FA8;") })],
];
ok(BCA.owner.length === 0 && BCA.unseat.length === 0 && BCA.empty.length === 0, "both ways: the clean Broadcast renders (owner, no seat, EMPTY) are green before any injection");
for (const [id, label, run] of BCMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? ` (${f.find((x) => x.startsWith(id + ":")) || f[0]})` : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

// ---- 17. Control (sprint 2, "Control, simple": Members · Projects · Connect; the owner's MCQ of 2026-09-30 evening). The
// authority half is UI-B12b's, unchanged (Q925964F5, QB963C7EE amended by F6, QC5F82B90, Q8EFBCCF8, Q76EFC99D): rendered by
// the REAL worker (the REAL readControl and GET /control's HTML face) over the Home fixture's SQLite plus a second active
// project (beta: Amir seated there too), an archived one (gamma: Rae seated there, so a non-admin never sees it; the admin
// sees it in Projects, to activate), Uma (active, seated nowhere), the suites' fixed owner (an admin during a run, never
// listed) and a live device each for Owen, Rae and Amir. Readers: the owner Owen, Rae (a seat on alpha), Uma, and Owen's
// read-only credential; plus the owner alone and a failed read. The truth each page is held to is its own JSON twin (GET
// /control/people, the same read), never the renderer. The old artboard's pins (wf-control: its regions, its nine buttons,
// "no archive button") were DELETED with the old page (tests follow the code); the F6, email, scope and input checks stay.
const CT_ADMIN_BTNS = ["provision-person-key", "role-picker", "access-hats", "remove", "add-workspace", "seat", "reissue-key", "archive-project", "clean-eval"];
ok(JSON.stringify(CONTROL_REGIONS) === JSON.stringify(["nav", "people", "workspaces", "connect", "keys", "this-org"]),
  `src/controlpage.js CONTROL_REGIONS: ${CONTROL_REGIONS.join(" ")} (Members · Projects · Connect, your key, the Admin disclosure)`);
function controlWorld({ alone = false, down = false } = {}) {
  const fx = homeFixtureEnv(down ? { throwOn: (q) => q === CONTROL_PROJECTS_SQL } : {});
  const q = fx.sqlite, hash = (x) => createHash("sha256").update(x).digest("hex"), at = new Date(Date.now() - 3600000).toISOString(), exp = new Date(Date.now() + 86400000).toISOString();
  q.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-o'").run(hash("wire-owner-key"));
  q.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-c'").run(hash("wire-seat-key"));
  // migrate-044's shape: Rae a member wearing Engineering (she was internal-eng), Amir a partner wearing Partner and Finance
  q.prepare("UPDATE people SET role = 'member', role_label = 'internal-eng', hats = '[\"engineering\"]' WHERE id = 'p-c'").run();
  q.prepare("UPDATE people SET role = 'partner', hats = '[\"partner\",\"finance\"]' WHERE id = 'p-a'").run();
  const P = q.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)");
  P.run("p-u", "Uma Reyes", "uma@northwind.test", "internal-eng", hash("wire-unseat-key"), 1, at);
  P.run("eval-fixed-owner", "Eval Owner", "eval-owner@example.com", "owner", hash("wire-evalowner-key"), 1, at);
  q.prepare("INSERT INTO projects (key,name,active,created_at) VALUES ('gamma','Gamma',0,?)").run(at);
  const S = q.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,?,?)");
  S.run("p-a", "beta", "member", at); S.run("p-c", "gamma", "member", at);
  const T = q.prepare("INSERT INTO tokens (token_hash,person_id,device,created_at,expires_at,revoked,org) VALUES (?,?,?,?,?,0,1)");
  for (const [pid, dev] of [["p-o", "owen-laptop"], ["p-c", "rae-phone"], ["p-a", "amir-desk"]]) T.run(hash("wire-tok-" + pid), pid, dev, at, exp);
  if (alone) q.prepare("UPDATE people SET active = 0 WHERE id IN ('p-c','p-a','p-n','p-u','eval-fixed-seat')").run();
  // a BRAIN object answers arrayBuffer() and its metadata like R2's
  const get0 = fx.env.BRAIN.get;
  fx.env.BRAIN.get = async (k) => { const o = await get0(k); if (!o) return o; const t = await o.text();
    return { ...o, size: t.length, arrayBuffer: async () => new TextEncoder().encode(t).buffer, httpMetadata: { contentType: "application/json" } }; };
  fx.emails = q.prepare("SELECT id, email FROM people WHERE email IS NOT NULL").all();
  return fx;
}
const CT_RO = createHash("sha256").update(createHash("sha256").update("wire-owner-key").digest("hex") + ":agent-r-read-only:v1").digest("hex");
const ctGet = async (W, path, bearer, accept) => {
  const r = await WORKER.fetch(new Request("https://org.test" + path, { headers: { accept, authorization: `Bearer ${bearer}` } }), W.env, { waitUntil() {}, passThroughOnException() {} });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
  return { status: r.status, type: r.headers.get("content-type") || "", html: j ? "" : t, j };
};
const CTW = { full: controlWorld(), alone: controlWorld({ alone: true }), down: controlWorld({ down: true }) };
const CTP = {};
for (const [k, key] of [["owner", "wire-owner-key"], ["seat", "wire-seat-key"], ["unseat", "wire-unseat-key"], ["ro", CT_RO]])
  CTP[k] = { json: await ctGet(CTW.full, "/control/people", key, "application/json"), page: await ctGet(CTW.full, "/control", key, "text/html") };
for (const k of ["alone", "down"]) CTP[k] = { json: await ctGet(CTW[k], "/control/people", "wire-owner-key", "application/json"), page: await ctGet(CTW[k], "/control", "wire-owner-key", "text/html") };
CTP.chipBeta = await ctGet(CTW.full, "/control?project=beta", "wire-owner-key", "text/html");
CTP.audit = await ctGet(CTW.full, "/audit", "wire-seat-key", "text/html");
const CT_SRC = read(join(ENGINE, "src", "controlpage.js"));
// the old artboard's typed content (Control.dc.html): never in the source nor on the page
const CT_SRC_SAMPLES = ["ryuk", "amir", "jun", "sara", "all workspaces", "siru-services", "ryuklabs"];
const CT_PAGE_SAMPLES = ["all workspaces", "Workspaces in this org", "siru-services", "ryuklabs-agent-r", "Add a workspace", "workspace"];
const ctTags = (h, b) => [...h.matchAll(new RegExp(`<[^>]*\\sdata-button="${b}"[^>]*>`, "g"))].map((m) => m[0]);
const ctOff = (t) => /\sdisabled(?=[\s>=/])/.test(t.replace(/"[^"]*"/g, '""')) || attr(t, "aria-disabled") === "true";
const ctUn = (x) => String(x).replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const ctById = (h, id) => { const m = new RegExp(`<([a-z0-9]+)[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(h); return m ? ctUn(m[2]) : ""; };
const ctContent = (h) => { const i = h.indexOf('<section class="ct"'); return i < 0 ? "" : h.slice(i); };
// sprint 3 L3: a member is one line (<li class="p-li" data-person=…>), the u-table gone (ADOPTION.md, Control)
const ctRow = (h, id) => (h.split(`<li class="p-li" data-person="${id}"`)[1] || "").split('<li class="p-li"')[0];
// ctAudit(html, j, persona, o) -> failures by check id
function ctAudit(html, j, persona, o = {}) {
  const csrc = o.csrc || CT_SRC, ssrc = o.ssrc || SRC, world = o.world || CTW.full;
  const f = [];
  const fail = (id, why) => f.push(`${id}: ${why}`);
  const rd = (j && j.reader) || {}, admin = !!rd.admin, writes = admin && !rd.readOnly && !(j && j.live);
  // regions: once each, in the page's order
  const idx = CONTROL_REGIONS.map((r) => html.indexOf(`data-region="${r}"`));
  if (idx.some((i) => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) fail("region", `the regions are not all drawn in order (${CONTROL_REGIONS.join(" ")})`);
  for (const r of CONTROL_REGIONS) { const n = html.split(`data-region="${r}"`).length - 1; if (n !== 1) fail("region", `data-region="${r}" appears ${n} times`); }
  // the tab: Control lit, last and pushed right on every reader's row, one view (no bar); TABS' Control row one view, no ownerOnly, no retired view
  if (!isLit(html, "control", "/control", "Control") || !endsOnControl(html)) fail("tab", "the Control tab is not the current tab, last in the rail, or does not open /control");
  const row = tabsOf(html);
  if (JSON.stringify(row) !== JSON.stringify(["Home", "Build", "GTM", "Goals", "Decisions", "Map", "Broadcast", "Control"])) fail("tab", `the tab row reads [${row.join(" ")}], want the eight with Control last`);
  if (hasViewBar(html)) fail("bar", "Control carries a view bar (one view)");
  const m = /^const TABS = (\[[\s\S]*?^\]);/m.exec(ssrc); let T = null; try { T = m ? new Function("return " + m[1])() : null; } catch { T = null; }
  const c = (T || []).find((t) => t.key === "control");
  if (!c) fail("tab", "shell.js TABS has no Control row");
  else {
    if (c.ownerOnly) fail("tab", "shell.js TABS Control is ownerOnly again (QC5F82B90: admin functions, not extra tabs)");
    if (JSON.stringify((c.views || []).map((v) => v.href)) !== '["/control"]') fail("tab", `shell.js TABS Control views [${(c.views || []).map((v) => v.href).join(" ")}], want ONE on /control`);
  }
  const back = (T || []).flatMap((t) => (t.views || []).map((v) => v.href)).filter((h) => ["/orchestrator", "/observatory", "/control/pack"].includes(h));
  if (back.length) fail("tab", `shell.js TABS carries the retired view(s) ${back.join(" ")} (Desk, Charts, Pack retired in UI-B12b)`);
  // rows: data-person = the JSON's people in order; each row names the person's role and draws their hats and access hats as
  // chips in the Hats cell (migrate-045: the ⋯ menu's access checkboxes name every hat too, so a bare label is no proof)
  const dp = [...new Set([...html.matchAll(/<li class="p-li" data-person="([^"]+)"/g)].map((x) => x[1]))], want = ((j && j.people) || []).map((p) => p.id);
  if (JSON.stringify(dp) !== JSON.stringify(want)) fail("rows", `data-person [${dp.join(" ")}], want the read's people in order [${want.join(" ")}]`);
  for (const p of (j && j.people) || []) {
    const seg = ctRow(html, p.id);
    if (!new RegExp(`data-role="${p.role}"`).test(seg)) { fail("rows", `row ${p.id} does not name its role ${p.role}`); break; }
    const chip = (h) => new RegExp(`<span class="ct-hat[^"]*"[^>]*>${esc4(({ management: "Management", engineering: "Engineering", organization: "Organization", gtm: "Go-to-market", finance: "Finance", partner: "Partner" })[h])}<`);
    const miss = [...(p.hats || []), ...(p.access || [])].filter((h) => !chip(h).test(seg));
    if (miss.length) { fail("rows", `row ${p.id} does not draw its hats ${miss.join(", ")}`); break; }
  }
  // projects: a non-admin sees only their own ACTIVE projects; the admin every active one and the archived ones (to activate)
  const allowed = new Set(admin ? [...(((j && j.org) || {}).projects || []), ...(((j && j.archived) || []).map((x) => x.key))] : ((j && j.workspaces) || []).map((x) => x.key));
  // a failed read: the seat chips the people statement did answer are the read's own (its ACTIVE projects, X1's join)
  if (j && j.live) for (const p of j.people || []) for (const x of p.seats || []) allowed.add(x.project);
  const stray = [...new Set([...html.matchAll(/data-project="([^"]+)"/g)].map((x) => x[1]))].filter((k) => !allowed.has(k));
  if (stray.length) fail("project", `data-project [${stray.join(" ")}] is not one of the reader's projects [${[...allowed].join(" ")}]`);
  // emails: a non-admin reads only their own
  if (!admin) for (const e of world.emails) if (e.id !== rd.id && html.includes(e.email)) { fail("email", `a non-admin's page carries another person's email (${e.id})`); break; }
  // every admin control: present (activate only when a project is archived), on POST /control, and enabled exactly when the
  // read lets this reader act, else disabled with a reason that names the admin (F6)
  const reason = admin ? READ_ONLY_REASON : (((j && j.people) || [])[0] || { can: {} }).can.reason || "";
  // D6a: the suites' clean-up (clean-eval) is drawn only on the suites' own view (?eval=1): absent from the org's page
  const evalView = !!(j && j.eval);
  if (!evalView && ctTags(html, "clean-eval").length) fail("f6", "clean-eval is drawn outside the suites' view (?eval=1): nothing of theirs to act on");
  for (const b of [...CT_ADMIN_BTNS.filter((x) => evalView || x !== "clean-eval"), ...((j && j.archived) || []).length ? ["activate-project"] : []]) {
    const ts = ctTags(html, b);
    if (!ts.length) { if (!(b === "archive-project" && !((j && j.workspaces) || []).length)) fail("f6", `${b} is not drawn (F6: shown disabled with its reason to a non-admin, never hidden)`); continue; }
    for (const t of ts) if (attr(t, "data-door") !== "POST /control" || !attr(t, "data-action")) { fail("door", `${b} does not carry data-door="POST /control" and its data-action: ${t.slice(0, 120)}`); break; }
    if (!writes) {
      for (const t of ts) {
        const why = attr(t, "aria-describedby"), text = why ? ctById(html, why) : "";
        if (!ctOff(t)) { fail("f6", `${b} is ENABLED for a reader who cannot act: ${t.slice(0, 140)}`); break; }
        if (!text || (!(j && j.live) && (!/admin/.test(text) || (reason && !text.includes(reason))))) { fail("f6", `${b} is disabled without its reason naming the admin ("${text}")`); break; }
      }
    } else if (ts.every(ctOff) && (["provision-person-key", "add-workspace", "archive-project", "clean-eval"].includes(b) || ((j && j.people) || []).some((p) => !p.you))) fail("f6", `every ${b} is disabled for the admin`);
  }
  if (!writes) for (const fm of html.matchAll(/<form[^>]*action="\/control"[^>]*>[\s\S]*?<\/form>/g))
    if ([...fm[0].matchAll(/<button[^>]*type="submit"[^>]*>/g)].some((x) => !ctOff(x[0]))) { fail("f6", "an ENABLED submit sits in a form posting to /control on a non-writer's page"); break; }
  if (writes) for (const p of (j && j.people) || []) {
    const seg = ctRow(html, p.id);
    const rm = ctTags(seg, "remove")[0] || "", rp = ctTags(seg, "role-picker")[0] || "";
    if (!!p.can.remove === ctOff(rm) || !!p.can.role === ctOff(rp)) { fail("f6", `row ${p.id}: remove/role enabled ${!ctOff(rm)}/${!ctOff(rp)}, the read says ${p.can.remove}/${p.can.role}`); break; }
    if (!p.can.remove && !ctById(html, attr(rm, "aria-describedby") || "-")) { fail("f6", `row ${p.id}: remove disabled with no reason`); break; }
  }
  if (!/href="\/profile"/.test(regionOf(html, "keys") ? regionOf(html, "keys").inner || html : html)) fail("keys", "Your key does not point at /profile to rotate your own key");
  for (const [b, href] of [["open-audit", "/audit"], ["open-rulings", "/decisions?status=in-force"]]) { const t = ctTags(html, b)[0]; if (!t || attr(t, "href") !== href) fail("nav", `the nav has no ${b} linking ${href}`); }
  // Connect: the org's own MCP URL (the request's origin), each of the four clients, Claude Code's command with /docs's flags,
  // and no key on the page but a flash's (a 40-hex token)
  const conn = (regionOf(html, "connect") || { inner: "" }).inner || "";
  if (!conn.includes("https://org.test/mcp")) fail("connect", "Connect does not name the org's own MCP URL (https://org.test/mcp)");
  for (const k of ["claude-code", "claude-connector", "chatgpt", "codex"]) if (!conn.includes(`data-client-block="${k}"`)) fail("connect", `Connect has no ${k} block`);
  if (!/claude mcp add [a-z0-9-]+ --transport http https:\/\/org\.test\/mcp --header &quot;Authorization: Bearer &lt;your-key&gt;&quot;/.test(conn)) fail("connect", "Claude Code's command is not /docs's own (claude mcp add <name> --transport http <url> --header \"Authorization: Bearer <your-key>\")");
  if (/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/.test(textOf(conn))) fail("connect", "Connect carries a 40-hex key");
  // inputs: a typed input on the content is the admin's declared exception (name, email, a project's key and name) or the
  // Members filter (a read); a radio or a checkbox is a choice
  for (const x of ctContent(html).matchAll(/<(input|textarea)\b[^>]*>/gi)) {
    const ty = (attr(x[0], "type") || "text").toLowerCase();
    if (x[1].toLowerCase() === "input" && ["hidden", "submit", "button", "radio", "checkbox"].includes(ty)) continue;
    if (attr(x[0], "data-input-exception") === "search") continue;
    if (attr(x[0], "data-input-exception") !== "admin" || !/name="(?:name|email|key)"/.test(x[0])) { fail("input", `a typed input outside the admin's provisioning (name, email, a project's key and name): ${x[0].slice(0, 90)}`); break; }
  }
  // samples: the old artboard's typed content, never in the source nor on the page. One named exception: PLUGIN_MARKET is
  // the plugin's real dist repo (ryuk-labs/sharingu-plugin since 2026-10-12, sprint 15), a deployment fact, not the sample person
  const code = jsCodeOf(csrc).replace(/(const PLUGIN_MARKET = )"[^"]*"/, '$1""');
  for (const s_ of CT_SRC_SAMPLES) if (new RegExp(`["'\`>][^"'\`<\\n]*\\b${s_}\\b`, "i").test(code)) { fail("sample", `src/controlpage.js types the artboard's sample "${s_}"`); break; }
  const low = textOf(ctContent(html)).toLowerCase();
  for (const s_ of CT_PAGE_SAMPLES) if (low.includes(s_.toLowerCase())) { fail("sample", `the page draws the artboard's "${s_}"`); break; }
  // EMPTY: the read's own situations, its own sentences
  if (o.empty && !html.includes(esc4(o.empty))) fail("empty", `the page does not say "${o.empty}"`);
  // colours: the semantic tokens only in the page's own style (the look pass)
  const own = csrc.replace(/`/g, "");
  for (const x of own.matchAll(/(?<![&\w])#([0-9a-fA-F]{3,8})\b/g)) fail("colour", `src/controlpage.js: a colour literal #${x[1]}`);
  lookVarFails(own, "src/controlpage.js", fail);
  return [...f, ...audit(html, persona, ssrc)];
}
const ctJ = (k) => (CTP[k].json || {}).j || {};
const CTA = { owner: ctAudit(CTP.owner.page.html, ctJ("owner"), "owner"), seat: ctAudit(CTP.seat.page.html, ctJ("seat"), "single-seat"),
  unseat: ctAudit(CTP.unseat.page.html, ctJ("unseat"), "single-seat", { empty: EMPTY_NOSEAT }), ro: ctAudit(CTP.ro.page.html, ctJ("ro"), "owner"),
  alone: ctAudit(CTP.alone.page.html, ctJ("alone"), "owner", { empty: EMPTY_ALONE, world: CTW.alone }),
  down: ctAudit(CTP.down.page.html, ctJ("down"), "owner", { world: CTW.down }) };
const ctIds = (k) => (ctJ(k).people || []).map((p) => p.id).join(" ");
ok(CTP.owner.page.status === 200 && /text\/html/.test(CTP.owner.page.type) && CTP.owner.json.status === 200 && CTA.owner.length === 0 && ctIds("owner") === "p-a p-n p-o p-c p-u"
  && JSON.stringify(ctJ("owner").workspaces.map((x) => x.key)) === '["alpha","beta"]' && JSON.stringify((ctJ("owner").archived || []).map((x) => x.key)) === '["gamma"]'
  && (ctJ("owner").people.find((p) => p.id === "p-c") || {}).label === "internal-eng" && (ctJ("owner").people.find((p) => p.id === "p-a") || {}).role === "partner",
  `Control, the owner, through the real worker: nav · people · workspaces · connect · keys · this-org once each in order, the people [${ctIds("owner")}] (never the fixed owner) with their roles and hats, the ACTIVE projects [${(ctJ("owner").workspaces || []).map((x) => x.key)}] and the archived [${(ctJ("owner").archived || []).map((x) => x.key)}] to activate, every admin control enabled on its can.* and his own Remove disabled with its reason, Connect with the org's MCP URL and the four clients, the Control tab lit and pushed right, no sample, semantic tokens, and the shell's own audit${CTA.owner.length ? `\n      ${CTA.owner.join("\n      ")}` : ""}`);
ok(CTP.seat.page.status === 200 && CTA.seat.length === 0 && ctIds("seat") === "p-a p-n p-c" && ctTags(CTP.seat.page.html, "role-picker").length === 6 && !("archived" in ctJ("seat")) && !(ctJ("seat").people || []).some((p) => "label" in p || "lastFiled" in p),
  `Control, a seat (Rae, on alpha): 200, the people she shares alpha with [${ctIds("seat")}], Amir's chips alpha only, only her own email, no archived project, no one's typed label or last filing, every admin control present and DISABLED with "${(ctJ("seat").people || [{ can: {} }])[0].can.reason}", no enabled submit in any /control form, Your key pointing at /profile${CTA.seat.length ? `\n      ${CTA.seat.join("\n      ")}` : ""}`);
ok(CTP.unseat.page.status === 200 && CTA.unseat.length === 0 && ctIds("unseat") === "p-u",
  `Control, a reader seated nowhere (Uma): only herself, "${EMPTY_NOSEAT}", every control disabled with its reason${CTA.unseat.length ? `\n      ${CTA.unseat.join("\n      ")}` : ""}`);
ok(CTP.ro.page.status === 200 && CTA.ro.length === 0 && ctIds("ro") === ctIds("owner") && ctJ("ro").reader.readOnly === true,
  `Control, the owner's READ-ONLY credential: the owner's roster, every admin control DISABLED with "${READ_ONLY_REASON}" (the fold from B12a's adversarial review)${CTA.ro.length ? `\n      ${CTA.ro.join("\n      ")}` : ""}`);
ok(CTA.alone.length === 0 && ctIds("alone") === "p-o", `EMPTY: the admin alone reads "${EMPTY_ALONE}"${CTA.alone.length ? `\n      ${CTA.alone.join("\n      ")}` : ""}`);
ok(CTP.down.page.status === 200 && ctJ("down").live === "unreachable" && /data-state="unreachable"/.test(CTP.down.page.html) && CTA.down.length === 0,
  `UNREACHABLE: a failed read is 200 with live:'unreachable', the block on the page and every control disabled${CTA.down.length ? `\n      ${CTA.down.join("\n      ")}` : ""}`);
{
  const chipOf = (h) => ((/<summary[^>]*><span>([^<]*)<\/span>/.exec((regionOf(h, "project-switcher") || { inner: "" }).inner)) || [])[1] || null;
  // (the fixture's owner holds no seat, so the chip names the project by its key: servePage's own fallback)
  ok(CTP.chipBeta.status === 200 && ["Beta", "beta"].includes(chipOf(CTP.chipBeta.html)) && chipOf(CTP.owner.page.html) === "All projects",
    `U-TOPBAR on Control: /control?project=beta names Beta on the top-bar chip ("${chipOf(CTP.chipBeta.html)}"), /control the owner's rollup ("${chipOf(CTP.owner.page.html)}"): the page is drawn through servePage with the seam's read scope`);
  ok(CTP.audit.status === 200 && isLit(CTP.audit.html, "control", "/control", "Control") && endsOnControl(CTP.audit.html),
    "/audit (the nav's Audit trail) lights Control for a seat (OFFNAV_TAB.audit, the program's KEEP: Control's audit trail)");
}
// both ways: each injected defect goes red on its own check
const CTO = CTP.owner.page.html, CTS = CTP.seat.page.html;
const CTMUT = [
  ["sample", 'a typed sample person in the source ("sara")', () => ctAudit(CTO, ctJ("owner"), "owner", { csrc: CT_SRC.replace("const DOOR = ", 'const SAMPLE = "sara";\nconst DOOR = ') })],
  ["sample", '"Workspaces in this org" on the page', () => ctAudit(CTO.replace('<h1>Control</h1>', '<h1>Control</h1><p>Workspaces in this org</p>'), ctJ("owner"), "owner")],
  ["tab", "Control ownerOnly again", () => ctAudit(CTO, ctJ("owner"), "owner", { ssrc: SRC.replace('  { key: "control", label: "Control", icon: "control",\n', '  { key: "control", label: "Control", icon: "control", ownerOnly: true,\n') })],
  ["tab", "Desk back in TABS", () => ctAudit(CTO, ctJ("owner"), "owner", { ssrc: SRC.replace('views: [{ key: "control", label: "Control", href: "/control" }] },', 'views: [{ key: "control", label: "Control", href: "/control" }, { key: "orchestrator", label: "Desk", href: "/orchestrator" }] },') })],
  ["f6", "an admin button enabled for a seat", () => ctAudit(CTS.replace(/(data-button="role-picker"[^>]*?) disabled aria-describedby="ct-why"/, "$1"), ctJ("seat"), "single-seat")],
  ["f6", "an archive button enabled for a seat", () => ctAudit(CTS.replace(/(data-button="archive-project"[^>]*?) disabled aria-describedby="ct-why"/, "$1"), ctJ("seat"), "single-seat")],
  ["f6", "an admin button hidden from a seat", () => ctAudit(CTS.replace(/data-button="remove"/g, 'data-button="gone"'), ctJ("seat"), "single-seat")],
  ["f6", "a reason that names nobody", () => ctAudit(CTS.replace(/(<p class="ct-why" id="ct-why">)[^<]*/, "$1Not available."), ctJ("seat"), "single-seat")],
  ["project", "an archived project on a seat's page", () => ctAudit(CTS.replace('<ul class="p-lines" data-list="projects">', '<ul class="p-lines" data-list="projects"><li data-project="gamma">Gamma</li>'), ctJ("seat"), "single-seat")],
  ["email", "another person's email on a seat's page", () => ctAudit(CTS.replace('<b>Amir</b>', '<b>Amir</b> amir@northwind.test'), ctJ("seat"), "single-seat")],
  ["input", "a text input without its exception", () => ctAudit(CTO.replace('<div class="ct-chips">', '<div class="ct-chips"><input type="text" name="note">'), ctJ("owner"), "owner")],
  ["rows", "the people out of order", () => { const a = CTO.indexOf('<li class="p-li" data-person="p-a"'), b = CTO.indexOf('<li class="p-li" data-person="p-n"'); const seg = CTO.slice(a, b); const end = CTO.indexOf('</ul>', b); return ctAudit(CTO.slice(0, a) + CTO.slice(b, end) + seg + CTO.slice(end), ctJ("owner"), "owner"); }],
  ["rows", "a hat dropped from its row", () => ctAudit(CTO.replace(/(<li class="p-li" data-person="p-c"[\s\S]*?<span class="ct-hat[^"]*"[^>]*)>Engineering</, "$1>Nothing<"), ctJ("owner"), "owner")],
  ["connect", "a real key in Connect", () => ctAudit(CTO.replace('<div class="ct-clients">', `<div class="ct-clients"><p>${"ab12".repeat(10)}</p>`), ctJ("owner"), "owner")],
  ["connect", "Claude Code's command with a guessed flag", () => ctAudit(CTO.replace("--transport http https://org.test/mcp", "--transport sse https://org.test/mcp"), ctJ("owner"), "owner")],
  ["colour", "a hex colour in the page's own style", () => ctAudit(CTO, ctJ("owner"), "owner", { csrc: CT_SRC.replace(".ct{display:block;", ".ct{display:block;color:#6B4FA8;") })],
];
ok(CTA.owner.length === 0 && CTA.seat.length === 0 && CTA.unseat.length === 0, "both ways: the clean Control renders (owner, seat, seated nowhere) are green before any injection");
for (const [id, label, run] of CTMUT) {
  let f = [];
  try { f = run(); } catch (e) { f = [`throw: ${e && e.message}`]; }
  ok(f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${f.length ? ` (${f.find((x) => x.startsWith(id + ":")) || f[0]})` : " (nothing went red: the injection did not apply or the check is blind)"}`);
}

console.log(`wire-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
