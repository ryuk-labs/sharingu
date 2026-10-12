// tools/copy-check.mjs — the pristine-copy check (sprint 3, L1; docs/plan/LOOK.md "The revision": a screen holds titles,
// labels, values, names and buttons; no hint, no explanation, no raw call, no "0 of something").
//
//   node tools/copy-check.mjs --report          writes .runs/look/COPY-INVENTORY.md (per page, per region: the text, file:line,
//                                               the rule it breaks, a one-line replacement) and prints the totals
//   node tools/copy-check.mjs --check           exit 1 on ANY finding; there is no allowlist (D5: an allowlist file, or any
//                                               entry in one, is itself a failure)
//   node tools/copy-check.mjs --json            the findings as JSON on stdout
//
// It renders nothing and starts nothing: it READS the source. The page renderers are found from src/index.js (each
// servePage(...) call's `active` key and the render function its content comes from, mapped to its file through the
// imports), and the scan covers those files plus the src/ modules each imports directly (where their sentences live:
// ui.js, checklist.js, the *read.js files, ...). From every string and template literal it takes the text a person would
// see: an HTML text node, a placeholder="" or alt="", or a plain string that reads as words. title="" and aria-label=""
// are allowed to explain and are skipped; so are <style>, <script>, <svg>, SQL, CSS, comments and code.
//
// The rules (heuristics, tuned on today's src/; see the report's "What it cannot see"):
//   call      a raw MCP call or JSON on the screen: preview {…}, file {…}, publish_version …
//   chatty    the product explaining itself: "your Claude …", "… through preview then file", "shows here once …",
//             "how it works", "the call below", "file one with …"
//   sentence  more than 8 words, or a clause with a verb that ends in a full stop (more than 5 words)
//   dot       a short phrase that ends in a full stop ("No goal moved this month." -> "No goal moved this month")
//   zero      a count printed beside its word with no zero guard in sight ("${n} counters", "0 counters")
// Allowed and not reported: error and refusal messages (they say what failed), confirm() dialogs, and text that is plainly
// a person's own words (it comes from data, so the scan never sees it).
// sprint 3 L3: WHERE a string is emitted decides, never a list of strings —
//   · inside a state helper's own body (errorState · unreachableState · behindState · renderDenied) or an argument of one: an
//     ERROR, UNREACHABLE or BEHIND message a person must read (allowed);
//   · a literal nested in a title="" / aria-label="" that is open on its line (a hover may explain);
//   · a block marked `copy: off-screen` (the comment on the line above a const's opening line: the whole literal block, to its
//     close) — a string that only ever rides a title="", a hidden value, a door's JSON or an agent's answer; `copy: error`
//     (a refusal a person reads, emitted as an error or a disabled control's reason) and `copy: confirm` (a confirm() dialog's
//     words) the same way;
//   · "zero": a count beside its word chosen by a ternary on its own line (`n ? \`${n} waiting\` : ""`) is guarded;
//   · "chatty" needs a sentence (more than three words: "Connect your AI" is a label);
//   · the Docs page (docs.js) is the docs: the owner's rule puts every explanation there (LOOK.md "The revision"), so it is not
//     scanned. There is no allowlist: the old-path pages it held were deleted in D6 and the file went in D5. OFF_LIST (a page
//     counted apart) is empty.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ENGINE, "src");
const ALLOW_FILE = join(ENGINE, "tools/copy-check-allow.json");   // must not exist (D5): --check fails while it does
const REPORT = join(ENGINE, ".runs/look/COPY-INVENTORY.md");

// ---- a small JS literal scanner: string and template literals with their line, comments and regexes skipped ----
// -> [{ kind: "str" | "tpl", text, line, holes }] where a template's ${…} is replaced by "\u0001" (a hole)
export function literals(src) {
  const out = [];
  let i = 0, line = 1, prevSig = "";
  const n = src.length;
  const regexOk = () => !prevSig || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prevSig) || /\b(return|typeof|case|in|of|void|delete|new)$/.test(prevSig);
  function readTemplate() {
    // at the char after the opening backtick; returns { text, holes }
    let text = "", holes = 0;
    while (i < n) {
      const c = src[i];
      if (c === "\\") { text += src[i + 1] === "\n" ? "" : src[i + 1]; if (src[i + 1] === "\n") line++; i += 2; continue; }
      if (c === "`") { i++; return { text, holes }; }
      if (c === "$" && src[i + 1] === "{") {
        i += 2; let depth = 1; holes++; text += "\u0001";
        while (i < n && depth) {
          const d = src[i];
          if (d === "\n") line++;
          if (d === "`") { i++; const startLine = line; const inner = readTemplate(); out.push({ kind: "tpl", text: inner.text, line: startLine, holes: inner.holes, nested: true }); continue; }
          if (d === '"' || d === "'") { const q = d; i++; const startLine = line; let s = ""; while (i < n && src[i] !== q) { if (src[i] === "\\") { s += src[i + 1]; i += 2; continue; } if (src[i] === "\n") break; s += src[i++]; } i++; out.push({ kind: "str", text: s, line: startLine, nested: true }); continue; }
          if (d === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
          if (d === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
          if (d === "{") depth++;
          if (d === "}") depth--;
          i++;
        }
        continue;
      }
      if (c === "\n") line++;
      text += c; i++;
    }
    return { text, holes };
  }
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === "/" && regexOk()) {
      i++; let cls = false;
      while (i < n && src[i] !== "\n") { const d = src[i]; if (d === "\\") { i += 2; continue; } if (d === "[") cls = true; else if (d === "]") cls = false; else if (d === "/" && !cls) break; i++; }
      i++; while (/[a-z]/i.test(src[i] || "")) i++;
      prevSig = "r"; continue;
    }
    if (c === '"' || c === "'") {
      const q = c, startLine = line; i++; let s = "";
      while (i < n && src[i] !== q) { if (src[i] === "\\") { s += src[i + 1] === "n" ? "\n" : src[i + 1]; i += 2; continue; } if (src[i] === "\n") break; s += src[i++]; }
      i++; out.push({ kind: "str", text: s, line: startLine }); prevSig = "s"; continue;
    }
    if (c === "`") { const startLine = line; i++; const t = readTemplate(); out.push({ kind: "tpl", text: t.text, line: startLine, holes: t.holes }); prevSig = "s"; continue; }
    // a word or a punctuation mark: remember the last significant token for the regex test
    if (/[A-Za-z_$0-9]/.test(c)) { let w = ""; while (i < n && /[A-Za-z_$0-9]/.test(src[i])) w += src[i++]; prevSig = w; continue; }
    prevSig = c; i++;
  }
  return out;
}

// ---- from a literal to the fragments a person reads ----
const HOLE = "\u0001";
const looksCss = (t) => (t.match(/[a-z-]+\s*:\s*[^;{}]+;/g) || []).length >= 2 && !/<[a-z]/i.test(t.replace(/<style[\s\S]*?<\/style>/gi, ""));
const looksCode = (t) => /(^|[^a-z])(function\s*\(|=>|var |const |let |return |document\.|window\.|querySelector|addEventListener)/.test(t) || /[;{}]\s*$/.test(t.trim()) && /[=(]/.test(t);
const looksSql = (t) => /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|WHERE|JOIN|GROUP BY|ORDER BY|CASE WHEN|COALESCE|json_[a-z_]+)\b/.test(t) || /\b[a-z]{1,2}\.[a-z_]+,\s*[a-z]{1,2}\.[a-z_]+/.test(t) || /\(\?[:=!]|\\[sdwb]/.test(t);
const words = (t) => (t.replace(new RegExp(HOLE, "g"), " X ").match(/[A-Za-z][A-Za-z'’-]*|X/g) || []);
const decode = (t) => t.replace(/&middot;/g, "·").replace(/&rarr;/g, "→").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ");

export function fragments(lit) {
  let t = lit.text;
  if (!t || !/[A-Za-z]{2}/.test(t)) return [];
  if (looksSql(t) || looksCss(t)) return [];
  const res = [];
  const lineAt = (pos) => lit.line + (t.slice(0, pos).match(/\n/g) || []).length;
  const hasHtml = /<\/?[a-z][^>]*>/i.test(t) || /^[^<]*>|<[a-z][^>]*$/i.test(t);
  if (!hasHtml) {
    if (lit.kind === "str" || !lit.holes || words(t).length > 1) {
      const s = t.trim();
      // a plain literal reads as words: two or more words, not an identifier, a path, a class list or code
      if (words(s).length < 2 || looksCode(s) || /^[\w./:#?=&%-]+$/.test(s) || /^[a-z0-9_-]+( [a-z0-9_-]+)*$/.test(s) && !/[A-Z]/.test(s) && words(s).length < 4 && !/ (the|a|is|are|no|yet|of) /.test(` ${s} `)) return [];
      if (/^(data-|aria-|class=|style=|href=|[a-z-]+=")/.test(s)) return [];
      res.push({ text: decode(s), line: lit.line, where: "text" });
    }
    return res;
  }
  // HTML: drop style/script/svg, keep placeholder and alt values, then the text between tags
  const strip = t.replace(/<(style|script|svg|template)\b[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, " "));
  for (const m of strip.matchAll(/\b(placeholder|alt)="([^"]*)"/g)) if (/[A-Za-z]{2}/.test(m[2]) && words(m[2]).length > 1) res.push({ text: decode(m[2]), line: lineAt(m.index), where: m[1] });
  // a confirm dialog's words, data-confirm or onclick confirm: allowed (it explains a destructive press), never reported
  const noAttrs = strip.replace(/<[^>]*>/g, (m) => "\u0002".padEnd(m.length, " ")).replace(/^[^<\u0002]*>/, (m) => " ".repeat(m.length)).replace(/<[^>\u0002]*$/, (m) => " ".repeat(m.length));
  let pos = 0;
  for (const part of noAttrs.split("\u0002")) {
    const raw = part.replace(/^ +/, "");
    const off = pos + (part.length - raw.length);
    pos += part.length + 1;
    const s = decode(raw).replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2}/.test(s)) continue;
    if (looksCode(s) || /^[\w-]+=/.test(s)) continue;
    res.push({ text: s, line: lineAt(off), where: "html" });
  }
  return res;
}

// ---- the rules ----
const VERB = /\b(is|are|was|were|be|been|being|has|have|had|can|cannot|can't|will|would|could|should|may|might|must|does|did|do|shows?|files?|filed|reads?|opens?|waits?|needs?|lists?|takes?|makes?|says?|counts?|keeps?|changes?|stays?|works?|goes|gets?|names?|lands?|landed|moves?|moved|holds?|sees?|asks?|adds?|copies|connects?|lights?|picks?|press(es)?|sign(s)?|gives?|sets?|leaves?|comes?|rules?|ruled|checks?|grades?|equips?|publishes|passes|fills?|walks?|drawn|draws?|appears?|belongs?|lives?|starts?|stops?|answers?|carries|matches|finds?|knows?|tells?|uses?|wants?)\b/i;
const CALL = /(\b(preview|file|publish|ask|respond|grade|equip|search|read|brief|changes|whoami|holes|formats|doc|impact|submit_\w+)\s*\{|\bwrite_knowledge\b|\bread_knowledge\b|\bsubmit_[a-z]+\b|\bpublish_version\b|\brestore_version\b|\bcreate_project\b|\{\s*"?(items|kind|project|contribution|op|data)"?\s*:|\bpreview,? then file\b|brain:\/\/)/i;
const CHATTY = /(\byour (own )?(Claude|AI|assistant)\b|\bthrough preview\b|\bpreview then file\b|\bshows? (up )?here (once|until|as soon|when)\b|\bhow (it|this) works\b|\bthe call below\b|\bfile (one|it|them|this) (with|through)\b|\bwith the call\b|\bwhat is not filed is not found\b|\bnothing runs from here\b|\bthe app takes no typed\b)/i;
const ERRORISH = /(could not|did not (load|answer|read|run|match|file)|cannot be reached|can't be reached|not reachable|refused|failed|try again|wait \d+ minutes?|too many attempts|do not match|does not match|is not (one of|in this project|available)|no such|not found|offline|forbidden|not open to your role|nothing was filed|is taken|is already|unknown (project|ref|id)|\bmust be\b|\bnot allowed\b)/i;
const ZERO = new RegExp(`(^|\\s)(0|${HOLE}) (counter|ungraded|stale|blocker|high\\b|waiting|awaiting|open\\b|need more|with a person|approve\\b|grant\\b|decide\\b|deferred|gating|realized|update|standing|ruled\\b)`, "i");

export function judge(frag) {
  const t = frag.text.replace(new RegExp(HOLE, "g"), "X").trim();
  const w = words(t);
  if (frag.where === "title" || frag.where === "aria") return null;
  const lead = /^(no|nothing|none)\b/i.test(t) ? `${shortFix(t)}, at most one button (What is missing); ` : "";
  if (CALL.test(t)) return { rule: "call", fix: `${lead}the call leaves the screen: it rides a Copy button on What is missing` };
  if (CHATTY.test(t) && w.length > 3) return { rule: "chatty", fix: lead ? `${lead}the rest is deleted` : "delete; what to file next is an item on What is missing" };
  if (ERRORISH.test(t)) return null;
  if (w.length > 8 && w.filter((x) => x !== "X").length > 6) return { rule: "sentence", fix: shortFix(t) };
  if (/[.!]\s*$/.test(t) && !/\.\.\.$|…$/.test(t)) {
    if (w.length > 5 && VERB.test(t)) return { rule: "sentence", fix: shortFix(t) };
    if (w.length >= 2) return { rule: "dot", fix: `"${t.replace(/[.!]\s*$/, "")}"` };
  }
  if (ZERO.test(frag.text)) return { rule: "zero", fix: "print it only when the count is not 0 (or fold it into a chip with its count)" };
  return null;
}
function shortFix(t) {
  const head = t.split(/[.:;,(]|\s[-–]\s/)[0].trim();
  const ws = head.split(/\s+/);
  if (/^(no|nothing|none)\b/i.test(head)) return `a phrase: "${ws.slice(0, 5).join(" ").replace(/X/g, "N")}"`;
  if (ws.length <= 4) return `a label: "${head.replace(/X/g, "N")}"`;
  return "delete, or move it into a title=\"\" hover on the control it explains";
}

// ---- the renderers: servePage calls in index.js -> render functions -> files ----
export function pageMap() {
  const idx = readFileSync(join(SRC, "index.js"), "utf8");
  const imports = new Map();   // name -> file
  for (const m of idx.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([^"]+)"/g)) for (const nm of m[1].split(",")) { const k = nm.trim().split(/\s+as\s+/).pop(); if (k) imports.set(k, m[2]); }
  const lines = idx.split("\n");
  const pages = new Map();     // file -> Set(page keys)
  lines.forEach((l, i) => {
    if (!/servePage\(\s*\w+,\s*\{/.test(l)) return;
    const act = /active:\s*(?:"([a-z-]+)"|key === "eagle" \? "eagle" : key|(\w+\(\w+\.item\)))/.exec(l);
    const key = act ? (act[1] || (act[2] ? "card" : "map")) : "";
    const ctx = lines.slice(Math.max(0, i - 25), i + 1).join("\n");
    const fns = new Set([...l.matchAll(/\b(render\w+)\(/g)].map((m) => m[1]));
    if (!fns.size) for (const m of ctx.matchAll(/content\s*=\s*[^;]*?\b(render\w+)\(/g)) fns.add(m[1]);
    for (const f of fns) { const file = imports.get(f); if (!file || !key) continue; if (!pages.has(file)) pages.set(file, new Set()); pages.get(file).add(key); }
  });
  for (const [f, k] of [["login.js", "login"], ["broadcastlive.js", "broadcast"], ["impactpage.js", "transmission"], ["tablists.js", "lists"]]) { if (!pages.has(f)) pages.set(f, new Set()); pages.get(f).add(k); }
  return pages;
}
const SKIP = new Set(["fontdata.js", "fonts.js", "hotsql.js", "parts.js", "index.js", "mcp.js", "core.js", "project.js", "oauth.js", "util.js", "reqmemo.js", "refs.js", "tenant.js"]);
// the door's own modules: their strings answer an MCP call (validator messages, field descriptions), never a screen, so only
// their exported UPPER_CASE constants are read (where a page borrows a sentence: FILING_ITEM_CALL, EMPTY_SHELF, ...)
const DOOR = new Set(["knowledge/schema.js", "shapes.js", "packdoor.js", "transmission.js", "pickup.js", "knowledge/versions.js", "knowledge/store.js", "knowledge/cards.js", "knowledge/fresh.js", "knowledge/goals.js", "knowledge/decisions.js", "knowledge/grades.js", "knowledge/gtm.js", "reach.js", "previewtext.js", "qnaire.js", "rt.js", "lanes.js", "impact.js"]);
// off the revision's list (docs/plan/LOOK.md "The revision"): a page whose strings are counted apart in the allowlist. The
// old-path pages were the only ones (D6 deleted them): none is left.
export const OFF_LIST = new Set([]);
// the Docs page IS the docs (LOOK.md "The revision": what a control means lives in its title and in the docs): not scanned
export const DOCS_PAGE = new Set(["docs.js"]);
export function scanFiles() {
  const pages = pageMap();
  const files = new Map([...pages].map(([f, k]) => [f, new Set(k)]));
  for (const [f, keys] of pages) {
    const p = join(SRC, f);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, "utf8").matchAll(/from\s*"\.\/([^"]+\.js)"/g)) {
      const dep = join(dirname(f), m[1]).replace(/^\.\//, "");
      if (SKIP.has(dep) || !existsSync(join(SRC, dep))) continue;
      if (!files.has(dep)) files.set(dep, new Set());
      for (const k of keys) files.get(dep).add(k);
    }
  }
  for (const f of SKIP) files.delete(f);
  for (const f of DOCS_PAGE) files.delete(f);
  return files;
}

// the region a line sits in: the nearest data-region / region: name above it in the same file (within 60 lines)
function regionAt(lines, ln) {
  for (let i = ln - 1; i >= 0 && i >= ln - 60; i--) { const m = /data-region="([a-z0-9-]+)"|\bregion:\s*"([a-z0-9-]+)"/.exec(lines[i] || ""); if (m) return m[1] || m[2]; }
  return "";
}

// scanSource(src, file) -> findings [{ file, line, region, text, rule, fix }] (the selftest feeds it fixtures)
const CONST_LINE = /^\s*(export\s+)?const\s+[A-Z][A-Z0-9_]+\s*=/;
// the lines a marker covers: `copy: off-screen | error | confirm` on a line covers that line and the next; when the next line
// OPENS a block (a const whose value runs past its line: an object, an array, a call, a template), the marker covers the
// whole block, to the line where its brackets close
const MARK = /\bcopy: (off-screen|error|confirm)\b/;
function markedLines(lines) {
  const out = new Set();
  lines.forEach((l, i) => {
    if (!MARK.test(l)) return;
    out.add(i + 1); out.add(i + 2);
    const next = lines[i + 1] || "";
    let depth = 0, j = i + 1;
    const count = (t) => { for (const ch of t.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")) { if ("{[(".includes(ch)) depth++; else if ("}])".includes(ch)) depth--; } };
    count(next);
    while (depth > 0 && j < lines.length - 1) { j++; out.add(j + 1); count(lines[j]); }
  });
  return out;
}
// the bodies of the state helpers (ERROR, UNREACHABLE, BEHIND, the 404 page): their words say what failed or what moved
const STATE_FN = /^\s*(export\s+)?function\s+(errorState|unreachableState|behindState|renderDenied)\b/;
const STATE_CALL = /\b(errorState|unreachableState|behindState|renderDenied)\(/;
function stateLines(lines) {
  const out = new Set();
  lines.forEach((l, i) => {
    if (!STATE_FN.test(l)) return;
    let depth = 0, started = false;
    for (let j = i; j < lines.length; j++) {
      out.add(j + 1);
      for (const ch of lines[j]) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
      if (started && depth <= 0) break;
    }
  });
  return out;
}
export function scanSource(src, file = "fixture.js", opts = {}) {
  const lines = src.split("\n");
  const found = [];
  const marked = markedLines(lines), states = stateLines(lines);
  for (const lit of literals(src)) {
    const lineText = lines[lit.line - 1] || "";
    if (opts.constsOnly && !CONST_LINE.test(lineText) && !marked.has(lit.line)) continue;
    // a literal written INTO a title="" or aria-label="" (a hover may explain) is skipped: the line holds one still open when
    // its ${…} begins
    if (lit.nested && /\b(title|aria-label)="[^"]*\$\{/.test(lineText)) continue;
    // sprint 3 L3: a marked block (off-screen, an error, a confirm), a state helper's own body, an argument of one
    if (marked.has(lit.line) || states.has(lit.line) || STATE_CALL.test(lineText)) continue;
    if (/console\.|throw |new Error\(|\berr(or)?\(\s*["'`]|json\(\s*\{\s*error|confirm\(|data-confirm|\btitle:\s*["'`]|aria-label|\bwords:\s*`|\bTONE_OF\b/.test(lineText)) continue;
    // sprint 3 L2: a refusal's own note (an answer object carrying `error: "…"` on its line or the line above) says what failed,
    // as an error message does; and a string marked `copy: off-screen` (on its line or the line above: a door's answer, a
    // filed record's own text, a data-client or title="" value, the tools' JSON) never reaches a screen. Both are allowed.
    const prevLine = lines[lit.line - 2] || "";
    if (/\berror:\s*["'`]/.test(lineText) || (/\berror:\s*["'`]/.test(prevLine) && /^\s*(note|receipt)\b/.test(lineText))) continue;
    if (/\bcopy: off-screen\b/.test(lineText) || /\bcopy: off-screen\b/.test(prevLine)) continue;
    for (const fr of fragments(lit)) {
      const v = judge(fr);
      if (!v) continue;
      // a count chosen by a ternary on its own line is guarded (`n ? \`${n} waiting\` : ""`)
      if (v.rule === "zero" && /\?\s*`[^`]*\$\{/.test(lineText)) continue;
      found.push({ file, line: fr.line, region: regionAt(lines, fr.line), text: fr.text.replace(new RegExp(HOLE, "g"), "…").replace(/\s+/g, " ").trim().slice(0, 160), rule: v.rule, fix: v.fix });
    }
  }
  const seen = new Set();
  return found.filter((f) => { const k = `${f.line}|${f.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
export const keyOf = (f) => `${f.file}::${f.text}`;

function scanAll() {
  const files = scanFiles();
  const all = [];
  for (const [f, pages] of [...files].sort()) {
    const src = readFileSync(join(SRC, f), "utf8");
    for (const x of scanSource(src, f, { constsOnly: DOOR.has(f) })) all.push({ ...x, pages: [...pages].sort(), off: OFF_LIST.has(f) });
  }
  return { files, all };
}

const RULE_WORD = { call: "raw call", chatty: "explains itself", sentence: "sentence", dot: "full stop", zero: "zero meta" };
const WEIGHT = { call: 5, chatty: 4, sentence: 3, zero: 2, dot: 1 };
function report({ files, all: every }) {
  const all = every.filter((f) => !f.off), off = every.filter((f) => f.off);
  // per page: a finding counts on every page its file reaches (a shared module's sentence is on each of them); the detail
  // below lists each finding once, under its file
  const byPage = new Map();
  for (const f of all) for (const p of f.pages.length > 6 ? ["(shared by most pages)"] : f.pages) { if (!byPage.has(p)) byPage.set(p, []); byPage.get(p).push(f); }
  const byFile = new Map();
  for (const f of all) { if (!byFile.has(f.file)) byFile.set(f.file, []); byFile.get(f.file).push(f); }
  const tot = (xs) => Object.fromEntries(Object.keys(RULE_WORD).map((r) => [r, xs.filter((x) => x.rule === r).length]));
  const T = tot(all);
  const worst = [...all].sort((a, b) => WEIGHT[b.rule] - WEIGHT[a.rule] || b.text.length - a.text.length).slice(0, 10);
  let md = `# Copy inventory (generated by tools/copy-check.mjs --report; do not edit by hand)\n\n`;
  md += `Scanned ${files.size} files under src/ (the page renderers found from src/index.js servePage calls, and the src/ modules each imports).\n`;
  md += `**${all.length} findings**: ${Object.entries(T).map(([r, n]) => `${n} ${RULE_WORD[r]}`).join(" · ")}.\n\n`;
  md += `## Per page (a shared module's finding counts on each page it reaches)\n\n| Page | Findings | raw call | explains itself | sentence | zero meta | full stop |\n|---|---|---|---|---|---|---|\n`;
  for (const [p, xs] of [...byPage].sort((a, b) => b[1].length - a[1].length)) { const t = tot(xs); md += `| ${p} | ${xs.length} | ${t.call} | ${t.chatty} | ${t.sentence} | ${t.zero} | ${t.dot} |\n`; }
  md += `\n## The ten worst\n\n${worst.map((f, i) => `${i + 1}. \`${f.file}:${f.line}\` (${RULE_WORD[f.rule]}) "${f.text}" → ${f.fix}`).join("\n")}\n`;
  md += `\n## Every finding, per file (and the pages it reaches) and region\n`;
  for (const [file, xs] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    md += `\n### ${file} (${xs.length}) · ${xs[0].pages.length > 6 ? "most pages" : xs[0].pages.join(", ")}\n`;
    const byRegion = new Map();
    for (const x of xs) { const r = x.region || "(no region)"; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(x); }
    for (const [r, ys] of [...byRegion].sort()) {
      md += `\n**${r}**\n\n| Text | Where | Rule | Replacement |\n|---|---|---|---|\n`;
      for (const y of ys.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) md += `| ${y.text.replace(/\|/g, "\\|")} | \`${y.file}:${y.line}\` | ${RULE_WORD[y.rule]} | ${y.fix.replace(/\|/g, "\\|")} |\n`;
    }
  }
  const offBy = {}; for (const f of off) offBy[f.file] = (offBy[f.file] || 0) + 1;
  md += `\n## Off the revision's list (counted apart, not in the totals above)\n\n${Object.entries(offBy).map(([f, n]) => `- \`${f}\`: ${n}`).join("\n")}\n\nThe public Docs page explains on purpose; the old-path pages are D6's to delete. The gate counts them too until they go.\n`;
  md += `\n## What it cannot see\n\n- Text built at run time from data: a person's own words (titles, whys, options) are never judged, and a count's zero is only caught where the template prints a count beside its word.\n- Strings assembled across several literals (a sentence joined from parts with + or [].join) are judged part by part, so a long one may pass as short pieces.\n- Text in client-side scripts that is written into the page after load (the shell's palette, the Map's inspector) when it is built in code rather than a literal.\n- Markdown bodies (docs, starter items): they are content, not chrome.\n- Whether a phrase is good: it finds sentences and calls, it does not judge the words of a label.\n`;
  return md;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const res = scanAll();
  const flag = (k) => process.argv.includes(`--${k}`);
  if (flag("json")) { console.log(JSON.stringify(res.all, null, 1)); process.exit(0); }
  if (flag("report") || !flag("check")) {
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, report(res));
    const on = res.all.filter((f) => !f.off), t = {}; for (const f of on) t[f.rule] = (t[f.rule] || 0) + 1;
    console.log(`copy-check: ${on.length} findings on the revision's pages (+${res.all.length - on.length} off its list) in ${res.files.size} files (${Object.entries(t).map(([r, n]) => `${n} ${r}`).join(", ")}) -> ${relative(ENGINE, REPORT)}`);
  }
  if (flag("check")) {
    // D5: no exception list. An allowlist file, with any entry or none, is a failure: findings are fixed, never allowed
    if (existsSync(ALLOW_FILE)) { console.log(`  ✗ ${relative(ENGINE, ALLOW_FILE)} exists: there is no allowlist, a finding is fixed`); process.exit(1); }
    const left = res.all;
    for (const f of left.slice(0, 40)) console.log(`  ✗ ${f.file}:${f.line} (${f.rule}) ${f.text}`);
    console.log(`copy-check: ${left.length} finding(s) (no allowlist)`);
    process.exit(left.length ? 1 : 0);
  }
}
