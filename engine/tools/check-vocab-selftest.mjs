// check-vocab-selftest.mjs — the ratchet for WP1 VOCABULARY (R-PRD-ONE-MIND, M-ADR-041): the reader's words on
// every face. Two passes, both offline:
//   1. SOURCE — every string literal (template · double · single quoted) in the page renderers is scanned for the
//      banned words. Identifiers never count: attribute values (href/class/data-*/…), <code>…</code> spans, <style>
//      blocks, brain:// URIs, /paths and snake_case names are stripped first; a line carrying `vocab:allow` is
//      exempt (used for skill NAMES, slot ids and agent-facing intake text — each such line says why).
//   2. RENDER — the renderers are called with fixtures and the VISIBLE text (tags · code · style · script stripped)
//      is scanned the way E251a scans a served page. The Guide pages (docs · agentic · understanding) are excepted
//      from the render pass, as the PRD excepts them, but their SOURCE still passes (citations as muted .ref spans).
// Exit 1 on any hit; prints per-file counts either way.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.VOCAB_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");   // VOCAB_ROOT: scan another checkout (a before/after count)
const FILES = ["build", "txpage", "first5", "holes", "docs", "home", "qnaire", "picker", "profile", "audit", "goals", "reports", "tempo", "thread", "decisions", "controlpage", "shapes", "formats", "markdown", "docpage", "previewpage", "previewcard", "confirm", "previewtext", "preview", "reach", "checklist", "impactpage", "extractpage", "tablists", "cardpage", "broadcast", "measures"].map((f) => `src/${f}.js`);   // sprint 3 D2: the lists on a tab, the card page, the publish and equip previews;   // sprint 3 B5: the Library, What changed and the tab chip; B1: the shapes, the formats read and the card and doc pages; B2: the preview (its page, its text, its door, its reach); B3: the checklist's sentences; B4: the Impact view, the next action, What changed and the follow-ups due
const BANNED = /\b(transmissions?|handoffs?|loops?|heartbeat|capsules?|holes|envelopes?|master orchestrator)\b/gi;
const GUIDE = new Set(["docs"]);

// --- pass 1: string literals out of the source, with the line each match sits on ---
function literals(src) {
  // a small scanner: code | template (with ${} nesting) | "…" | '…' | // | /* */ ; regex literals are not tracked
  // (none in these files carry a banned word inside a regex that would also read as prose).
  const out = []; const stack = []; let i = 0, line = 1, mode = "code", buf = "", start = 1;
  const push = () => { if (buf) out.push({ text: buf, line: start }); buf = ""; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "\n") line++;
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "lc"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "bc"; i += 2; continue; }
      if (c === "/") {   // a regex literal (never a division) after an operator/opener — skip to its closing slash
        const prev = src.slice(0, i).replace(/\s+$/, "");
        if (/(?:[(,=:\[!&|?{};]|\breturn)$/.test(prev) || prev === "") {
          let j = i + 1, cls = false;
          while (j < src.length && (cls || src[j] !== "/") && src[j] !== "\n") { if (src[j] === "\\") j++; else if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; j++; }
          i = j + 1; continue;
        }
      }
      if (c === "`") { mode = "tpl"; start = line; i++; continue; }
      if (c === '"') { mode = "dq"; start = line; i++; continue; }
      if (c === "'") { mode = "sq"; start = line; i++; continue; }
      if (c === "}" && stack.length) { if (stack[stack.length - 1] > 0) stack[stack.length - 1]--; else { stack.pop(); mode = "tpl"; start = line; } i++; continue; }
      if (c === "{" && stack.length) stack[stack.length - 1]++;
      i++; continue;
    }
    if (mode === "lc") { if (c === "\n") mode = "code"; i++; continue; }
    if (mode === "bc") { if (c === "*" && n === "/") { mode = "code"; i += 2; continue; } i++; continue; }
    if (mode === "tpl") {
      if (c === "\\") { buf += c + (n || ""); i += 2; continue; }
      if (c === "$" && n === "{") { push(); stack.push(0); mode = "code"; i += 2; continue; }
      if (c === "`") { push(); mode = "code"; i++; continue; }
      buf += c; i++; continue;
    }
    if (mode === "dq" || mode === "sq") {
      const q = mode === "dq" ? '"' : "'";
      if (c === "\\") { buf += c + (n || ""); i += 2; continue; }
      if (c === q) { push(); mode = "code"; i++; continue; }
      buf += c; i++; continue;
    }
  }
  push();
  return out;
}
// what never counts as page copy
const isSql = (t) => /\b(SELECT|INSERT|DELETE|UPDATE)\b/.test(t) || /\b(FROM|JOIN)\s+\w+\b/.test(t);
function stripIdentifiers(t) {
  if (isSql(t)) return "";
  return t
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<code>[^<]*<\/code>/gi, " ")
    .replace(/\s(?:href|src|class|id|name|action|for|uri|value|title|data-[\w-]+)=(?:"[^"]*"?|'[^']*'?)/gi, " ")   // "? — an attribute cut by a ${} chunk boundary
    .replace(/(?:^|[\s{}(,;>])\.[\w-]+/g, " ")                    // .css-class selectors
    .replace(/\b\w+(?:-\w+)+\b/g, " ")                        // hyphenated tokens (class fragments like holes-chip-done); banned words are single words
    .replace(/brain:\/\/[^\s<"')]+/g, " ")
    .replace(/\/[\w.:-]+(?:\/[\w.:-]*)*/g, " ")           // /paths (a leading slash) — never prose
    .replace(/\b\w+_\w+\b/g, " ")                          // snake_case identifiers (submit_transmission · open_loop …)
    .replace(/\btransmission:[\w-]*/g, " ")                // the ref grammar
    .replace(/\bcapsule:[\w-]*/g, " ");                    // the slot id grammar
}

let fail = 0; const counts = {};
for (const rel of FILES) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const lines = src.split("\n");
  let n = 0;
  for (const lit of literals(src)) {
    const clean = stripIdentifiers(lit.text);
    let m; BANNED.lastIndex = 0;
    while ((m = BANNED.exec(clean))) {
      const at = lit.line + (lit.text.slice(0, Math.min(lit.text.length, m.index)).match(/\n/g) || []).length;
      const srcLine = lines[at - 1] || "";
      if (/vocab:allow/.test(srcLine)) continue;
      n++; fail = 1;
      const ctx = clean.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ");
      console.log(`  ✗ ${rel}:${at} "${m[0]}" — …${ctx}…`);
    }
  }
  counts[rel] = n;
}

// --- pass 2: rendered, visible text (the E251a cut) ---
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<code>[^<]*<\/code>/gi, " ").replace(/<[^>]+>/g, " ");
const stamp = { publishedAt: "2026-09-08T00:00:00Z" };
const renders = {};
try {
  const home = await import("../src/home.js"), build = await import("../src/build.js");
  const tx = await import("../src/txpage.js"), audit = await import("../src/audit.js"), holes = await import("../src/holes.js");
  const profile = await import("../src/profile.js");
  // UI-B2: the questionnaire page is gone (QBDD22130); the Decisions screen and the QuestionCard answer instead,
  // rendered from the REAL readers over a served-looking pack (tools/fixtures/decisions-pack.mjs)
  // UI-B3: Home renders the ONE read (readHomeSummary) over the served-looking Home fixture (a real SQLite D1), the
  // owner with every region full, and a newcomer's (the first-five steps as the needs-you EMPTY's next action)
  const hfx = await import("./fixtures/home-d1.mjs");
  renders.home = home.renderHome(await home.readHomeSummary(hfx.homeFixtureEnv({ measure: true, filed: true }).env, hfx.OWNER, {}), { owner: true });
  renders.homeNewcomer = home.renderHome(await home.readHomeSummary(hfx.homeFixtureEnv({}).env, hfx.NEWCOMER, {}), { owner: false });
  // UI-B12b: the owner's Desk (renderOrchestrator) is retired; Control renders the ONE read (readControl) over the same Home
  // fixture, the owner's face and a seat's (every admin control disabled with its reason)
  const ctlRead = await import("../src/controlread.js"), ctlPage = await import("../src/controlpage.js");
  renders.control = ctlPage.renderControl(await ctlRead.readControl(hfx.homeFixtureEnv({}).env, hfx.OWNER, {}), { flash: "Seat granted." });
  renders.controlSeat = ctlPage.renderControl(await ctlRead.readControl(hfx.homeFixtureEnv({}).env, { id: "p-c", name: "Rae Kim", role: "internal-eng" }, {}), {});
  // UI-B4b: the owner-queue page is retired; Build renders the ONE read (readBuild) over the same Home fixture
  renders.build = build.renderBuild(await build.readBuild(hfx.homeFixtureEnv({}).env, hfx.OWNER, {}), {});
  renders.txpage = tx.renderTransmissionPage({ id: "T-1", lane: "code", kind: "pr", what: "w", route: "owner", created_at: "2026-09-01" }, { grade: { missing: ["why"], componentKey: "absent", proof: "not-artifact" }, servedStamp: stamp });
  renders.audit = audit.renderAudit([{ at: "2026-09-01", kind: "pr", by: "A", route: "owner", what: "w" }, { at: "2026-09-01", kind: "ruling", by: "A", what: "r" }], { filters: {}, options: { kinds: ["pr"], lanes: ["code"], routes: ["auto", "owner", "incomplete"] } });
  renders.holesPublic = holes.renderHoles(holes.holesShape({ brand: { org: "Northwind" } }));
  // What is missing for the owner, from the REAL read over the Home fixture's D1 (alpha: an aim and owed questions, the rest open)
  renders.holesSeated = holes.renderHoles(await holes.computeHoles(hfx.homeFixtureEnv({}).env, hfx.OWNER, { brand: { org: "Northwind" } }));
  renders.profile = profile.renderProfilePage({ person: { name: "A" } });
  const dq = await import("../src/decisions.js"), fx = await import("./fixtures/decisions-pack.mjs");
  const rdr = { id: "p-c", name: "A", role: "owner" };
  renders.decisions = dq.renderDecisionsPage(await dq.readDecisions(fx.fixtureEnv(), rdr, {}), { filed: 1 });
  renders.question = dq.renderQuestionPage(await dq.readQuestion(fx.fixtureEnv(), rdr, fx.OPEN_QID, {}), { refused: "option_required" });
  // sprint 3 B2: the preview page and its text block, a mixed preview open and the same one filed (every verdict, every chip)
  const pvp = await import("../src/previewpage.js"), pvt = await import("../src/previewtext.js");
  const pi = (i, kind, line, verdict, extra = {}) => ({ i, type: "x", kind, kindWord: kind, line, verdict, effect: verdict === "files" ? "files at once" : verdict, tab: "build", places: [{ tab: "build", path: "/build", region: "filings", what: "in Build's list" }], reasons: ["It names money, so the owner checks it."], ...extra });
  const pvItems = [pi(0, "contribution", "Contribution (GTM): Annual email", "files"), pi(1, "question", "Question: Annual discount?", "waits_for_owner"), pi(2, "render", "Render: Pricing", "unchanged"),
    pi(3, "contribution", "Contribution (Code): toggle", "needs", { needs: { field: "proof", hint: "a command and its result", formats: { shape: "code" } } }), pi(4, "doc", "Doc: roles/owner.md", "refused")];
  const pvView = { id: "P-0123456789abcdef", project: "alpha", projectName: "Alpha", author: true, by: { name: "Rae" }, createdAt: "2026-10-01T10:00:00Z", expiresAt: "2026-10-01T11:00:00Z", filedAt: null, state: "open",
    items: pvItems, counts: { byVerdict: { files: 1, waits_for_owner: 1, unchanged: 1, needs: 1, refused: 1 } }, reach: { touched: { total: 1, byType: { door: 1 }, names: [{ id: "door:x", type: "door", name: "GET /x", href: "/map?node=door%3Ax" }], more: 0, unknown: [] },
      reached: { total: 1, byType: { table: 1 }, names: [{ id: "table:x", type: "table", name: "x", href: "/map?node=table%3Ax" }], more: 0, unnamed: 0 }, checks: { total: 2, read: 2, graded: 1 }, goals: [{ id: "g", title: "Paid", href: "/goals/g" }], questions: [], asks: [], capped: [] },
    leftOut: [{ what: "10 messages", why: "small talk" }], note: "From the call notes.", hidden: 0, fileCounts: {} };
  renders.preview = pvp.renderPreviewPage(pvView);
  renders.previewFiled = pvp.renderPreviewPage({ ...pvView, state: "filed", filedAt: "2026-10-01T10:30:00Z", items: pvItems.map((x, k) => ({ ...x, filed: k === 3 ? { status: "left" } : { status: "filed", id: "T-20261001-00" + k } })), fileCounts: { filed: 4, left: 1 } });
  // sprint 3 D3: the card in the chat (the same summary block) and the confirm's elicitation message (the text, bounded)
  const pvc = await import("../src/previewcard.js");
  renders.previewCard = pvc.cardFragment({ ...pvView, author: true }, { origin: "https://org.example" });
  renders.previewCardFiled = pvc.cardFragment({ ...pvView, author: true, state: "filed", filedAt: "2026-10-01T10:30:00Z", items: pvItems.map((x, k) => ({ ...x, filed: { status: "filed", id: "T-20261001-00" + k } })), fileCounts: { filed: 5 } }, { origin: "https://org.example" });
  renders.previewText = "<pre>" + pvt.previewText({ project: "alpha", items: pvItems, leftOut: pvView.leftOut, reachLine: "1 door, 1 table; 1 graded check in question", counts: pvView.counts }, { mode: "preview", org: "Northwind", url: "/preview/P-1", previewId: "P-1" }) + "</pre>";
} catch (e) { console.log(`  ✗ render pass could not run: ${e && e.message}`); fail = 1; }
for (const [page, html] of Object.entries(renders)) {
  if (GUIDE.has(page)) continue;
  const hits = visible(html).match(BANNED) || [];
  counts[`render:${page}`] = hits.length;
  if (hits.length) { fail = 1; console.log(`  ✗ rendered ${page} shows: ${[...new Set(hits)].join(", ")}`); }
}
// the one-chip contract on the two E252a faces: every Home needs-you row carries exactly ONE kind chip (UI-B3: decide ·
// approve · grant, the artboard's). UI-B5a (QB74B1B7E): a chip is counted by
// its data-chip (ui.js stateChip, the ONE helper), never by a page's class name.
const chipsPer = (html, rowRe, chipRe) => (html.match(rowRe) || []).map((row) => (row.match(chipRe) || []).length);
// the look pass (sprint 2): a needs-you row is the <li> carrying data-kind (its semantic hook), never a page class
const homeRows = chipsPer(renders.home || "", /<li\b[^>]*\sdata-kind="[a-z]+"[\s\S]*?<\/li>/g, /data-chip="/g);
if (!homeRows.length || homeRows.some((n) => n !== 1)) { fail = 1; console.log(`  ✗ home needs-you rows carry ${JSON.stringify(homeRows)} kind chips (want exactly 1 each)`); }
// UI-B4b: every Build row carries exactly ONE design-law state chip. The look pass: a filing row is the <li> carrying data-id
// (its semantic hook), never a page class
const buildRows = chipsPer(renders.build || "", /<li\b[^>]*\sdata-id="[^"]*"[\s\S]*?<\/li>/g, /data-chip="/g);
if (!buildRows.length || buildRows.some((n) => n !== 1)) { fail = 1; console.log(`  ✗ Build rows carry ${JSON.stringify(buildRows)} state chips (want exactly 1 each)`); }
// UI-B5a: a Decisions row (and the question card's header) carries AT MOST one state chip, and every open row exactly one.
// The look pass: a row is the line carrying data-qid (sprint 3 L2: an <li>, the revision's one-line row; before, an <article>);
// the card's top line sits in its one page header (ui.js pageHeader's .page-head)
const dqTops = [...chipsPer(renders.decisions || "", /<li\b[^>]*\sdata-qid="[\s\S]*?<\/li>/g, /data-chip="/g),
  ...chipsPer(renders.question || "", /<header class="page-head">[\s\S]*?<\/header>/g, /data-chip="/g)];
const dqOpen = chipsPer(renders.decisions || "", /<li\b[^>]*data-status="open"[\s\S]*?<\/li>/g, /data-chip="/g);
if (!dqTops.length || dqTops.some((n) => n > 1)) { fail = 1; console.log(`  ✗ Decisions and question top lines carry ${JSON.stringify(dqTops)} state chips (want at most 1 each)`); }
if (!dqOpen.length || dqOpen.some((n) => n !== 1)) { fail = 1; console.log(`  ✗ open Decisions rows carry ${JSON.stringify(dqOpen)} state chips (want exactly 1 each)`); }

// --- pass 3 (sprint 3 S3b): THE NAME. The product is "sharingu" wherever a person or a connecting client reads it: never "Agent
// R", never "R" as the product ("R keeps …", "R's own …"), never "Eagle Eye". Scanned: the string literals of the renderers
// above and of the door's own files (index.js: the tool descriptions, the REST rows, the install script; mcp.js: the first
// reply; core.js, project.js, transmission.js: the answers and refusals; shell.js, rt.js, docs.js, audit.js, handoff.js), every string of
// the contract (contracts/door.declared.json) and the presets (src/presets/*.md, raw). A line carrying vocab:allow is exempt.
const NAME = [/\bagent\s+r\b/i, /\beagle\s+eye\b/i, /(?<![\w./-])R(?:'s\b|\s+(?:never|keeps|will|grades|reads|assists|is|does|files|knows|understands|carries|challenged|has|can|asks|answers|sees|holds|blocks)\b)/];
// the files the name pass leaves out, each with its reason
const NAME_EXCEPT = {
};
const NAME_FILES = [...new Set([...FILES, ...["index", "mcp", "core", "project", "transmission", "shell", "rt", "docs", "audit", "handoff"].map((f) => `src/${f}.js`)])].filter((f) => !(f in NAME_EXCEPT));
const nameHits = (text) => NAME.map((re) => (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || [])).flat();
let nameN = 0;
for (const rel of NAME_FILES) {
  const src = readFileSync(join(ROOT, rel), "utf8"), lines = src.split("\n");
  let n = 0;
  for (const lit of literals(src)) {
    if (isSql(lit.text)) continue;
    for (const h of nameHits(lit.text)) {
      const at = lit.line + (lit.text.slice(0, Math.max(0, lit.text.indexOf(h))).match(/\n/g) || []).length;
      if (/vocab:allow/.test(lines[at - 1] || "")) continue;
      n++; fail = 1; console.log(`  ✗ name: ${rel}:${at} "${h}"`);
    }
  }
  counts[`name:${rel}`] = n; nameN += n;
}
{
  const walk = (v, path, out) => { if (typeof v === "string") { for (const h of nameHits(v)) out.push(`${path}: "${h}"`); } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, out); };
  const out = [];
  walk(JSON.parse(readFileSync(join(ROOT, "..", "contracts", "door.declared.json"), "utf8")), "", out);
  for (const h of out) { fail = 1; console.log(`  ✗ name: contracts/door.declared.json ${h}`); }
  counts["name:contract"] = out.length; nameN += out.length;
  const { readdirSync } = await import("node:fs");
  let pn = 0;
  for (const f of readdirSync(join(ROOT, "src", "presets")).filter((x) => x.endsWith(".md"))) {
    for (const h of nameHits(readFileSync(join(ROOT, "src", "presets", f), "utf8"))) { pn++; fail = 1; console.log(`  ✗ name: src/presets/${f} "${h}"`); }
  }
  counts["name:presets"] = pn; nameN += pn;
}
// the instrument: the name pass catches each word it must (so a broken pattern goes red here, not silent)
if (!(nameHits("You are connected to Agent R").length && nameHits("R keeps only what you file").length && nameHits("‹ Eagle Eye").length && !nameHits("R2 bucket, our-R, a/R path, sharingu keeps").length)) { fail = 1; console.log("  ✗ name: the pattern does not catch Agent R, R keeps and Eagle Eye, or catches R2"); }

// --- pass 4 (D5, the names): ONE vocabulary on every face. The old tool names, the old addresses and the old words are banned
// in the string literals of the renderers AND the door's own files (index.js: the tool rows and the REST rows; mcp.js: the
// first reply, every answer; core.js, project.js, transmission.js, updates.js, openitems.js, ask.js, docread.js, handoff.js:
// the answers and refusals), in every string of the contract (contracts/door.declared.json) and in the presets (raw). The old
// names come from engine/tools/names.json (a name that is also a current tool's, as read or file, is not old). No exception
// list and no vocab:allow here: a hit is fixed, never excused. SQL text and file paths never count (internal names stay).
const NAMES = JSON.parse(readFileSync(join(ROOT, "tools", "names.json"), "utf8"));
const CURRENT = new Set(NAMES.tools.map((t) => t.new).filter(Boolean));
const OLD_TOOLS = [...new Set(NAMES.tools.map((t) => t.old).filter((o) => !CURRENT.has(o)))];
const SNAKE_OLD = OLD_TOOLS.filter((o) => o.includes("_"));
const WORD_OLD = OLD_TOOLS.filter((o) => !o.includes("_"));
const OLD_NAME = new RegExp(`(?<![\\w/.-])(?:${SNAKE_OLD.join("|")})(?![\\w-])|\`(?:${WORD_OLD.join("|")})\``, "g");
const OLD_PATHS = [...new Set([...NAMES.rest.map((r) => r.old.split(" ")[1]), ...NAMES.resources.map((r) => r.old)])]
  .map((p) => p.replace(/\{[^}]+\}$/, "").replace(/:[a-z]+(?=\/|$)/g, "").replace(/\/+$/, ""));
const OLD_PATH = new RegExp(`(?:${OLD_PATHS.map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})(?![\\w-])`, "g");
const D5_FILES = [...new Set([...FILES, ...["index", "mcp", "core", "project", "transmission", "updates", "openitems", "ask", "docread", "handoff", "shell", "rt", "docs", "audit", "starthere", "starter", "checklist", "extract", "knowledge/schema", "knowledge/write", "knowledge/store", "knowledge/docs", "knowledge/grades"].map((f) => `src/${f}.js`)])];
// internal names never count: a module path (./x.js, src/…), a file name, and a stored path (a role's brief lives at the doc path
// capsules/<role>.md, a report under inbox/…: data, not a word anyone reads)
const stripPaths = (t) => t.replace(/\.{1,2}\/[\w./-]+|(?:src|tools|engine|contracts|capsules|inbox)\/[\w<>./-]*|\b[\w-]+\.(?:js|mjs|py|sh|sql|json|md)\b/g, " ");
// a literal that is ONE bare word (a key, a region id, a page key: "envelope", "transmission") is an identifier, never copy: the
// word rule reads sentences; an old TOOL name is banned even alone
const bareWord = (t) => /^\s*[A-Za-z][\w-]*\s*$/.test(t);
const d5hits = (text) => { const t = stripPaths(text); return [...(t.match(OLD_NAME) || []), ...(t.match(OLD_PATH) || []).map((x) => `${x} (an old address)`),
  ...(bareWord(t) ? [] : (stripIdentifiers(t).match(BANNED) || []).map((x) => `${x} (an old word)`))]; };
let d5n = 0;
for (const rel of D5_FILES) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  let n = 0;
  for (const lit of literals(src)) {
    if (isSql(lit.text)) continue;
    for (const h of d5hits(lit.text)) { n++; fail = 1; console.log(`  ✗ names: ${rel}:${lit.line} ${h}`); }
  }
  counts[`names:${rel}`] = n; d5n += n;
}
{
  const out = [];
  const walk = (v, path) => { if (typeof v === "string") { for (const h of d5hits(v)) out.push(`${path}: ${h}`); } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { for (const h of d5hits(k)) out.push(`${path}.${k} (a key): ${h}`); walk(x, path ? `${path}.${k}` : k); } };
  walk(JSON.parse(readFileSync(join(ROOT, "..", "contracts", "door.declared.json"), "utf8")), "");
  for (const h of out) { fail = 1; console.log(`  ✗ names: contracts/door.declared.json ${h}`); }
  counts["names:contract"] = out.length; d5n += out.length;
  const { readdirSync } = await import("node:fs");
  let pn = 0;
  for (const f of readdirSync(join(ROOT, "src", "presets")).filter((x) => x.endsWith(".md"))) {
    for (const h of d5hits(readFileSync(join(ROOT, "src", "presets", f), "utf8"))) { pn++; fail = 1; console.log(`  ✗ names: src/presets/${f} ${h}`); }
  }
  counts["names:presets"] = pn; d5n += pn;
}
// the instrument: the pass catches an old name, an old address and an old word, and leaves a current name, SQL and a path alone
if (!(d5hits("call `holes`").length && d5hits("then write_knowledge").length && d5hits("GET /gtm/pipeline").length && d5hits("POST /transmission/T-1/decide").length
  && d5hits("the heartbeat").length && d5hits("brain://state").length && !d5hits("call `missing`, `read` and file; GET /contribution/T-1; GET /gtm; src/holes.js; read_file; capsules/owner.md; import x from \"./knowledge/store.js\"").length)) { fail = 1; console.log("  ✗ names: the pattern misses an old name, address or word, or catches a current one"); }

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" · "));
console.log(fail ? `✗ vocabulary: ${total} banned-word hit(s)` : `✓ vocabulary: 0 old tool names, addresses or words across ${D5_FILES.length} files, the contract and the presets (no exception); 0 banned-word hits across ${FILES.length} files + ${Object.keys(renders).length} renders; the product's name: 0 old names across ${NAME_FILES.length} files, the contract and the presets (${Object.keys(NAME_EXCEPT).length} old-path files excepted, each with its reason); home rows ${homeRows.length} (one kind chip each), Build rows ${buildRows.length} (one state chip each), Decisions top lines ${dqTops.length} (at most one each; ${dqOpen.length} open, one each)`);
process.exit(fail);
