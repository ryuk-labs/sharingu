// engine/tools/import/read-code.mjs — the `code` layout (sprint 3, P2b; docs/plan/MCP.md §6 "Code"): sharingu's own MODEL
// and CHECKS, generated from what is TRUE — this repo's code — instead of the old brain that described the system before
// the re-architecture. READ-ONLY: it reads a checkout (the directory holding engine/ and contracts/) and builds knowledge
// ops; the importer (import-brain.mjs --layout code) validates, files and reads them back like any other layout.
//
// What it reads, each at run time, so a regeneration (the B6 renames) needs no change here — nothing names a route or tool:
//   contracts/door.json    the registries, as generated from engine/src/index.js: every REST row {method, path, auth, does}
//                          and every MCP tool {name, description, owner, write}
//   engine/src/**/*.js     the code itself, scanned (scanCode below): the route tables (ABOVE_ROUTES, BELOW_ROUTES_*) and
//                          their place around the router's gate, each MCP tool's case in runTool, every top-level function
//                          and constant with what it references, the SQL in its strings (which table it reads, which it
//                          writes), the page key a handler hands servePage (the tab it lights: src/shell.js TABS and
//                          OFFNAV_TAB), the data-screen, data-region, data-door, fetch() and form targets it renders
//   engine/boot.sql        the tables (columns, keys, foreign keys), their indexes and triggers
//   tools/import/code-model/model.json   the little the code cannot say, reviewed and short (the app's key and name, the
//                          lanes the rail does not draw, the flows' step lists, the wireframe spec's screen → page map)
// What it builds (buildCodeOps): one surface (the app) and a lane per tab; a screen per page a person can open (a GET route
// whose handler renders a page; a redirect is not one), with its route, its page's own name, its lane and step; a door per
// REST row and per MCP tool, its auth class, read or write, its `does` verbatim; a table per boot.sql table; the edges the
// code shows (door → the tables its handler reads and writes, screen → the doors it calls via its data, a tool ↔ its REST
// twin when both answer from the same read function); the flows of the beta gate over the true screens and doors; checks an
// agent holding only the door can observe; gaps only where the code shows one. Nothing from the old brain: its questions,
// cards, capsules, evidence, agent flows and checks are left out (the overlays carry the aim, goals, rulings and docs).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { result, nodeId } from "./common.mjs";
import { wireframeFromRegions } from "./renders.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const arr = (v) => (Array.isArray(v) ? v : []);
const uniq = (xs) => [...new Set(xs)];

// isCodeDir(dir): a checkout of this repo (the engine's router and the generated contract beside it)
export const isCodeDir = (dir) => isFile(join(dir, "engine", "src", "index.js")) && isFile(join(dir, "contracts", "door.json")) && isFile(join(dir, "engine", "boot.sql"));

// ======================================================================================================================
// 1. the masker: a JS source with its strings, template text, comments and regex literals blanked (newlines kept), so
// brace depth, identifiers and statement starts read off the code alone; every string piece kept with its offset.
export function maskJs(src) {
  const out = src.split("");
  const nocom = src.split("");   // the source with its comments blanked (strings kept)
  const strings = [];   // [{ at, text }] every string, template piece and regex body, raw
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  const tpl = [];       // template nesting: the brace depth at which a ${ … } returns to its template
  let i = 0, depth = 0, prev = "";   // prev: the last significant code token (a char, or a word)
  const n = src.length;
  const regexAllowed = () => prev === "" || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /^(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(prev);
  const template = (from) => {   // scan template text from `from` (just past the backtick or the closing }) to its end or ${
    let j = from, startPiece = from;
    while (j < n) {
      const c = src[j];
      if (c === "\\") { j += 2; continue; }
      if (c === "`") { strings.push({ at: startPiece, text: src.slice(startPiece, j) }); blank(startPiece - 1 < 0 ? 0 : startPiece, j + 1); return { end: j + 1, open: false }; }
      if (c === "$" && src[j + 1] === "{") { strings.push({ at: startPiece, text: src.slice(startPiece, j) }); blank(startPiece, j + 2); return { end: j + 2, open: true }; }
      j++;
    }
    strings.push({ at: startPiece, text: src.slice(startPiece) }); blank(startPiece, n);
    return { end: n, open: false };
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); const j = e < 0 ? n : e; blank(i, j); for (let k = i; k < j; k++) nocom[k] = " "; i = j; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); const j = e < 0 ? n : e + 2; blank(i, j); for (let k = i; k < j; k++) if (nocom[k] !== "\n") nocom[k] = " "; i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") { if (src[j] === "\\") j++; j++; }
      strings.push({ at: i + 1, text: src.slice(i + 1, j) }); blank(i, j + 1); i = j + 1; prev = "str"; continue;
    }
    if (c === "`") {
      out[i] = " ";
      const r = template(i + 1);
      if (r.open) { tpl.push(depth); depth++; } else prev = "str";
      i = r.end; continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1, cls = false;
      while (j < n && (cls || src[j] !== "/") && src[j] !== "\n") { if (src[j] === "\\") j++; else if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; j++; }
      j++; while (j < n && /[a-z]/.test(src[j])) j++;
      strings.push({ at: i + 1, text: src.slice(i + 1, j), regex: true }); blank(i, j); i = j; prev = "re"; continue;
    }
    if (c === "{" || c === "(" || c === "[") { depth++; prev = c; i++; continue; }
    if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (c === "}" && tpl.length && tpl[tpl.length - 1] === depth) {   // back into the template
        tpl.pop(); out[i] = " ";
        const r = template(i + 1);
        if (r.open) { tpl.push(depth); depth++; } else prev = "str";
        i = r.end; continue;
      }
      prev = c; i++; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; prev = src.slice(i, j); i = j; continue; }
    if (/[0-9]/.test(c)) { let j = i; while (j < n && /[\w.]/.test(src[j])) j++; prev = "num"; i = j; continue; }
    prev = c; i++;
  }
  return { code: out.join(""), nocom: nocom.join(""), strings };
}

// ======================================================================================================================
// 2. the declarations: every top-level function and constant of a file (its name(s), its text span), its imports.
const DECL_RE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
function declsOf(file, src) {
  const { code, nocom, strings } = maskJs(src);
  const lines = code.split("\n");
  const decls = [];   // { file, names, start, end (offsets) }
  let depth = 0, off = 0, cur = null;
  const close = (at) => { if (cur) { cur.end = at; decls.push(cur); cur = null; } };
  for (const line of lines) {
    if (depth === 0 && line.length && !/^\s/.test(line)) {
      const m = DECL_RE.exec(line);
      const attach = /^([A-Za-z_$][\w$]*)\.[\w$]+\s*=/.exec(line);   // `name.prop = …` belongs to name
      if (m) {
        close(off);
        const names = [m[2]];
        if (m[1] !== "function" && m[1] !== "function*" && m[1] !== "class") {   // `const A = 1, B = 2`: every name at depth 0
          let dd = 0;
          for (let k = 0; k < line.length; k++) {
            const ch = line[k];
            if ("([{".includes(ch)) dd++; else if (")]}".includes(ch)) dd--;
            else if (ch === "," && dd === 0) { const mm = /^,\s*([A-Za-z_$][\w$]*)\s*=(?!=)/.exec(line.slice(k)); if (mm) names.push(mm[1]); }
          }
        }
        cur = { file, names, start: off };
      } else if (attach && decls.concat(cur ? [cur] : []).some((x) => x.names.includes(attach[1]))) {
        close(off); cur = { file, names: [attach[1]], start: off, attached: true };
      } else if (/^(import|export\s*\{|export\s+default)\b/.test(line) || /^[A-Za-z_$(]/.test(line)) {
        close(off);
      }
    }
    for (const ch of line) { if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--; }
    off += line.length + 1;
  }
  close(code.length);
  // imports: local name -> { from (resolved file), name (the exported name) }
  const imports = new Map();
  for (const m of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm)) {
    const spec = m[1].trim(), mod = m[2];
    if (!mod.startsWith(".")) continue;
    const from = join(dirname(file), mod);
    const named = /\{([\s\S]*)\}/.exec(spec);
    if (named) for (const part of named[1].split(",")) { const p = part.trim(); if (!p) continue; const mm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(p); if (mm) imports.set(mm[2] || mm[1], { from, name: mm[1] }); }
    const def = /^([\w$]+)\s*(?:,|$)/.exec(spec);
    if (def) imports.set(def[1], { from, name: "default" });
  }
  return { file, src, code, nocom, strings, decls, imports };
}

// the identifiers a span of masked code references (not a property after ".", not an object key)
function refsIn(code, a, b) {
  const out = new Set();
  const s = code.slice(a, b);
  const prevCh = (k) => { let j = k - 1; while (j >= 0 && /\s/.test(s[j])) j--; return j; };
  const nextCh = (k) => { let j = k; while (j < s.length && /\s/.test(s[j])) j++; return j; };
  for (const m of s.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const k = m.index;
    if (k > 0 && /[\w$]/.test(s[k - 1])) continue;
    const p = prevCh(k);
    if (p >= 0 && s[p] === "." && !(p >= 2 && s[p - 1] === "." && s[p - 2] === ".")) continue;
    const q = nextCh(k + m[0].length);
    if (s[q] === ":" && s[q + 1] !== ":" && p >= 0 && (s[p] === "{" || s[p] === ",")) continue;
    out.add(m[0]);
  }
  return out;
}
const piecesIn = (f, a, b) => f.strings.filter((s) => s.at >= a && s.at < b && !s.regex).map((s) => s.text);

// the SQL a span's strings carry: the tables it writes and reads (uppercase keywords, the codebase's own style), checked
// against the real tables
const SQL_WRITE = /\b(?:INSERT(?:\s+OR\s+(?:REPLACE|IGNORE|ABORT|ROLLBACK|FAIL))?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+[A-Z]+)?|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/g;
const SQL_READ = /\b(FROM|JOIN)\s+([a-z_][a-z0-9_]*)/g;
export function sqlTables(text, tables) {
  const reads = new Set(), writes = new Set();
  const delAt = new Set();
  for (const m of text.matchAll(SQL_WRITE)) { if (tables.has(m[1])) writes.add(m[1]); if (/^DELETE/.test(m[0])) delAt.add(m.index + m[0].indexOf("FROM")); }
  for (const m of text.matchAll(SQL_READ)) if (!delAt.has(m.index) && tables.has(m[2])) reads.add(m[2]);
  return { reads, writes };
}

// ======================================================================================================================
// 3. boot.sql: the tables with their columns, keys and foreign keys; their indexes and triggers
export function readBootSql(sql) {
  const text = sql.replace(/--[^\n]*/g, "");
  const tables = new Map();
  for (const m of text.matchAll(/CREATE\s+(VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*(USING\s+(\w+)\s*)?\(/gi)) {
    const name = m[2];
    let j = m.index + m[0].length, d = 1;
    while (j < text.length && d > 0) { if (text[j] === "(") d++; else if (text[j] === ")") d--; j++; }
    const body = text.slice(m.index + m[0].length, j - 1);
    const parts = []; let cur = "", dd = 0;
    for (const ch of body) { if (ch === "(") dd++; else if (ch === ")") dd--; if (ch === "," && dd === 0) { parts.push(cur); cur = ""; } else cur += ch; }
    if (cur.trim()) parts.push(cur);
    const cols = [], pk = [], fks = [];
    for (const p0 of parts) {
      const p = p0.trim().replace(/\s+/g, " ");
      if (!p) continue;
      const tpk = /^PRIMARY KEY\s*\(([^)]*)\)/i.exec(p);
      if (tpk) { pk.push(...tpk[1].split(",").map((s) => s.trim())); continue; }
      const tfk = /^FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+(\w+)\s*\(([^)]*)\)/i.exec(p);
      if (tfk) { fks.push({ cols: tfk[1].split(",").map((s) => s.trim()), table: tfk[2], to: tfk[3].split(",").map((s) => s.trim()) }); continue; }
      if (/^(UNIQUE|CHECK|CONSTRAINT)\b/i.test(p)) continue;
      const c = /^([a-z_][a-z0-9_]*)\s*([A-Za-z]+)?(.*)$/i.exec(p);
      if (!c) continue;
      const rest = c[3] || "";
      const ref = /REFERENCES\s+(\w+)\s*\((\w+)\)/i.exec(rest);
      const col = { name: c[1], type: m[1] ? "fts" : (c[2] || "").toUpperCase(), null: !/NOT NULL/i.test(rest), pk: /PRIMARY KEY/i.test(rest), fk: !!ref, ref: ref ? `${ref[1]}.${ref[2]}` : "" };
      if (col.pk) pk.push(col.name);
      cols.push(col);
    }
    for (const f of fks) for (const [k, cname] of f.cols.entries()) { const c = cols.find((x) => x.name === cname); if (c) { c.fk = true; c.ref = `${f.table}.${f.to[k] || f.to[0]}`; } }
    for (const c of cols) if (pk.includes(c.name)) c.pk = true;
    if (!tables.has(name)) tables.set(name, { name, virtual: !!m[1], using: m[4] || null, cols, pk: uniq(pk), indexes: [], triggers: [] });
  }
  for (const m of text.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)\s*\(([^)]*)\)([^;]*);/gi)) {
    const t = tables.get(m[3]);
    if (!t || t.indexes.some((x) => x.name === m[2])) continue;
    const where = /WHERE\s+([\s\S]+)$/i.exec(m[5].trim());
    t.indexes.push({ name: m[2], cols: m[4].split(",").map((s) => s.trim().replace(/\s+/g, " ")), unique: !!m[1], where: where ? where[1].replace(/\s+/g, " ").trim() : null });
  }
  for (const m of text.matchAll(/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE)(?:\s+OF\s+[\w,\s]+?)?\s+ON\s+(\w+)([\s\S]*?)\bEND\s*;/gi)) {
    const t = tables.get(m[4]);
    if (!t || t.triggers.some((x) => x.name === m[1])) continue;
    const body = m[5];
    const { reads, writes } = sqlTables(body, new Set(tables.keys()));
    t.triggers.push({ name: m[1], on: `${m[2].toUpperCase()} ${m[3].toUpperCase()}`, writes: [...writes].sort(), ...(/RAISE\s*\(/i.test(body) ? { refuses: true } : {}) });
    void reads;
  }
  return tables;
}

// ======================================================================================================================
// 4. the scan: every file, every declaration with its references and SQL; the route tables; the MCP cases
function listJs(dir) {
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (isDir(p)) out.push(...listJs(p));
    else if (f.endsWith(".js")) out.push(p);
  }
  return out;
}

// literalOf(f, decl) -> the value of a top-level `const X = <literal>` (an array, an object, a new Set([...]) of literals),
// evaluated from its own text (the expression alone, cut at its closing bracket), or null
export function literalOf(f, d) {
  if (!f || !d) return null;
  const eq = f.code.indexOf("=", d.start);
  if (eq < 0 || eq >= d.end) return null;
  let a = eq + 1;
  while (a < d.end && /\s/.test(f.code[a])) a++;
  let j = a;
  if (f.code.startsWith("new", j)) { j = f.code.indexOf("(", j); if (j < 0) return null; }
  const open = f.code[j];
  if (!"[{(".includes(open)) return null;
  let dd = 0, k = j;
  for (; k < d.end; k++) { const ch = f.code[k]; if ("([{".includes(ch)) dd++; else if (")]}".includes(ch)) { dd--; if (dd === 0) break; } }
  try { return new Function(`return (${f.src.slice(a, k + 1)});`)(); } catch { return null; }
}

export function scanCode(rootIn) {
  const root = resolve(rootIn);
  const engine = join(root, "engine"), srcDir = join(engine, "src");
  const door = JSON.parse(readFileSync(join(root, "contracts", "door.json"), "utf8"));
  const tables = readBootSql(readFileSync(join(engine, "boot.sql"), "utf8"));
  const tableNames = new Set(tables.keys());
  const files = new Map();
  for (const p of listJs(srcDir)) if (!/\/(doorcontract|fontdata|presetdata|archclientdata)\.js$/.test(p)) files.set(p, declsOf(p, readFileSync(p, "utf8")));
  // the declaration index: "file#name" -> decl (with its refs resolved and its own SQL)
  const index = new Map();
  const keyOf = (file, name) => `${relative(srcDir, file)}#${name}`;
  for (const f of files.values()) for (const d of f.decls) for (const nm of d.names) {
    d.key = keyOf(f.file, d.names[0]);
    if (!index.has(keyOf(f.file, nm))) index.set(keyOf(f.file, nm), d);
  }
  const resolveName = (f, nm) => {
    if (f.decls.some((d) => d.names.includes(nm))) return keyOf(f.file, nm);
    const im = f.imports.get(nm);
    if (im && files.has(im.from)) { const g = files.get(im.from); if (g.decls.some((d) => d.names.includes(im.name))) return keyOf(g.file, im.name); }
    return null;
  };
  // the knowledge registry's tables (src/knowledge/schema.js KINDS: each kind's `table`): a statement built on
  // `${spec.table}` / `${KINDS[kind].table}` / `${s.table}` in a file that imports KINDS touches one of them
  const schemaFile = files.get(join(srcDir, "knowledge", "schema.js"));
  const kindsDecl = schemaFile && schemaFile.decls.find((d) => d.names.includes("KINDS"));
  const kindTables = kindsDecl ? uniq([...schemaFile.src.slice(kindsDecl.start, kindsDecl.end).matchAll(/\btable:\s*"([a-z_][a-z0-9_]*)"/g)].map((m) => m[1]).filter((t) => tableNames.has(t))) : [];
  const DYN_WRITE = /\b(?:INSERT(?:\s+OR\s+[A-Z]+)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+\$\{[^}]*\.table\}/, DYN_READ = /\b(?:FROM|JOIN)\s+\$\{[^}]*\.table\}/;
  const spanInfo = (f, a, b) => {
    const refs = new Set();
    for (const nm of refsIn(f.code, a, b)) { const k = resolveName(f, nm); if (k) refs.add(k); }
    const text = piecesIn(f, a, b).join(" ");
    const sql = sqlTables(text, tableNames);
    const raw = f.nocom.slice(a, b);
    if (f.imports.has("KINDS") || f === schemaFile) {
      const w = DYN_WRITE.test(raw), r = DYN_READ.test(raw.replace(/DELETE\s+FROM/g, ""));
      if (w) for (const t of kindTables) sql.writes.add(t);
      if (r) for (const t of kindTables) sql.reads.add(t);
      if (w || r) sql.dynamic = true;
    }
    const marks = marksOf(text, raw);
    return { refs, reads: sql.reads, writes: sql.writes, dynamic: !!sql.dynamic, marks, text, raw, file: f.file, start: a, end: b };
  };
  for (const f of files.values()) for (const d of f.decls) {
    Object.assign(d, spanInfo(f, d.start, d.end));
    d.refs.delete(d.key);
  }
  const idx = files.get(join(srcDir, "index.js")), mcp = files.get(join(srcDir, "mcp.js")), shell = files.get(join(srcDir, "shell.js"));
  if (!idx || !mcp || !shell) throw new Error(`${srcDir}: no index.js, mcp.js or shell.js — not this repo's engine`);

  // the route tables, in the router's order, and where each sits against the gate (routeRequest: ABOVE_ROUTES answer
  // before it; BELOW_ROUTES_1 after the key gate; BELOW_ROUTES_2 after the owner-only list too)
  const declOf = (f, nm) => f.decls.find((d) => d.names.includes(nm));
  const router = declOf(idx, "routeRequest");
  if (!router) throw new Error("index.js: no routeRequest");
  const order = [...idx.code.slice(router.start, router.end).matchAll(/for\s*\(\s*const\s+r\s+of\s+([A-Z_0-9]+)\s*\)/g)].map((m) => m[1]);
  const routes = [];
  for (const [ti, table] of order.entries()) {
    const d = declOf(idx, table);
    if (!d) continue;
    const code = idx.code.slice(d.start, d.end);
    const tests = [...code.matchAll(/\btest\s*:/g)].map((m) => d.start + m.index);
    tests.forEach((at, k) => {
      const end = k + 1 < tests.length ? tests[k + 1] : d.end;
      const seg = idx.code.slice(at, end);
      const runAt = seg.search(/\brun\s*:/);
      if (runAt < 0) return;
      const testSrc = idx.nocom.slice(at, at + runAt).replace(/^test\s*:/, "").trim().replace(/,\s*$/, "");
      let test;
      try { test = new Function(`return (${testSrc});`)(); } catch { test = null; }
      routes.push({ table, stage: ti, at, end, runAt: at + runAt, testSrc, test, line: idx.src.slice(0, at).split("\n").length, ...spanInfo(idx, at + runAt, end) });
    });
  }
  // the router's own inline answers before the tables (`if (<path test>) return handler(…)`): routes too
  const rcode = idx.code.slice(router.start, router.end), rsrc = idx.src.slice(router.start, router.end);
  for (const m of rcode.matchAll(/\bif\s*\(/g)) {
    let j = m.index + m[0].length, dd = 1;
    while (j < rcode.length && dd > 0) { if (rcode[j] === "(") dd++; else if (rcode[j] === ")") dd--; j++; }
    const cond = idx.nocom.slice(router.start + m.index + m[0].length, router.start + j - 1);
    const rest = rcode.slice(j, j + 200);
    const ret = /^\s*\{?\s*return\s+([A-Za-z_$][\w$]*)\s*\(/.exec(rest);
    // a path test alone (path, request.method, literals): the owner-only list's refusal is the gate, not a route
    const other = cond.replace(/"[^"]*"/g, "").replace(/\brequest\.method\b|\bpath\b|\.startsWith\b|\.endsWith\b/g, "").match(/[A-Za-z_$][\w$]*/g);
    if (!ret || !/\bpath\b/.test(cond) || other) continue;
    let test;
    try { test = new Function("path", "method", `const request = { method }; return (${cond});`); } catch { test = null; }
    const callee = resolveName(idx, ret[1]);
    routes.unshift({ table: "routeRequest", stage: -1, at: router.start + m.index, testSrc: cond, test, line: idx.src.slice(0, router.start + m.index).split("\n").length,
      refs: new Set(callee ? [callee] : []), reads: new Set(), writes: new Set(), marks: emptyMarks(), text: "", raw: (callee && index.get(callee) && index.get(callee).raw) || "" });
  }
  // the gate's own lists, read off routeRequest: the gated surface (a signed-out caller is sent to sign in) and the
  // owner-only paths
  const gated = { exact: [], prefixes: [] };
  const gs = /const\s+GATED_SURFACE\s*=\s*\[([^\]]*)\]/.exec(rsrc);
  if (gs) gated.exact = [...gs[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const gl = /if\s*\(\s*path === "\/" \|\| GATED_SURFACE\.includes\(path\)\s*\|\|\s*\(\(([\s\S]*?)\)\s*&&\s*request\.method === "GET"\)\)/.exec(rsrc);
  if (gl) gated.prefixes = [...gl[1].matchAll(/path\.startsWith\("([^"]+)"\)/g)].map((x) => x[1]);
  const oo = /const\s+OWNER_ONLY\s*=\s*\[([^\]]*)\]/.exec(rsrc);
  const ownerOnly = oo ? [...oo[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  const rnocom = idx.nocom.slice(router.start, router.end);

  // the MCP cases: runTool's `case "<tool>":` bodies (a run of cases shares the body after the last)
  const runTool = declOf(mcp, "runTool");
  const cases = new Map();
  if (runTool) {
    const body = mcp.src.slice(runTool.start, runTool.end);
    const marks = [...body.matchAll(/^\s*case\s+"([a-z_][a-z0-9_]*)"\s*:/gm)].map((m) => ({ name: m[1], at: runTool.start + m.index, len: m[0].length }));
    const dflt = body.search(/^\s*default\s*:/m);
    marks.forEach((c, k) => {
      let e = k + 1 < marks.length ? marks[k + 1].at : (dflt >= 0 ? runTool.start + dflt : runTool.end);
      let a = c.at + c.len;
      // a case with no body of its own falls through to the next one's
      let kk = k;
      while (!mcp.src.slice(a, e).trim() && kk + 1 < marks.length) { kk++; a = marks[kk].at + marks[kk].len; e = kk + 1 < marks.length ? marks[kk + 1].at : (dflt >= 0 ? runTool.start + dflt : runTool.end); }
      cases.set(c.name, { name: c.name, line: mcp.src.slice(0, c.at).split("\n").length, ...spanInfo(mcp, a, e) });
    });
  }
  const callTool = declOf(mcp, "callTool");

  // the shell: the rail's tabs (TABS, in order, each with its views) and where every other page key belongs (OFFNAV_TAB);
  // the page register's labels (PAGES)
  const lit = (name) => literalOf(shell, declOf(shell, name));
  const tabs = arr(lit("TABS")).map((t) => ({ key: t.key, label: t.label, views: arr(t.views).map((v) => ({ key: v.key, label: v.label, href: v.href })) }));
  const offnav = lit("OFFNAV_TAB") || {};
  const pages = arr(lit("PAGES")).map((p) => ({ key: p.key, label: p.label || p.offNav || null, href: p.href || null }));
  const publicKeys = [...(lit("PUBLIC_KEYS") || [])];

  // the plumbing every request pays (the router's own calls before and around the tables, the page shell): a route's own
  // reads stop there, so the tables a page reads are its own, not the sign-in's or the rail's
  const plumbing = new Set();
  for (const k of [router.key, declOf(idx, "servePage")?.key, declOf(idx, "workerHandler")?.key, callTool?.key].filter(Boolean)) {
    plumbing.add(k);
    for (const r of index.get(k).refs) plumbing.add(r);
  }
  for (const r of routes) if (r.table === "routeRequest") for (const k of r.refs) plumbing.delete(k);   // a route the router answers itself is a door
  for (const t of order) plumbing.delete(keyOf(idx.file, t));
  for (const k of [keyOf(idx.file, "CAPABILITIES"), keyOf(idx.file, "MCP_TOOLS"), runTool && runTool.key].filter(Boolean)) plumbing.delete(k);

  const scan = { root, door, tables, files, index, routes, gated, ownerOnly, keyGate: null,
    cases, tabs, offnav, pages, publicKeys, plumbing, srcDir, idx, mcp, shell, spanInfo, resolveName, declOf, kindTables };
  // the gate's two refusals: the gated surface's (`if (!gateReader) { … return … }`) and the key gate's (`if (!person) return …`)
  const ga = noReaderReturn(rnocom, "gateReader");
  if (ga) scan.gated.answer = refusalOf(scan, idx, ga);
  const kg = noReaderReturn(rnocom, "person");
  if (kg) scan.keyGate = refusalOf(scan, idx, kg);
  return scan;
}

// ======================================================================================================================
// 5. what a span renders and calls: data-screen, data-region, data-door, fetch() and form targets, servePage's page key,
// redirects and the answers it gives a caller with no credential
const emptyMarks = () => ({ screens: new Set(), regions: new Set(), doors: new Set(), fetches: new Set(), forms: new Set(), active: new Set(), titles: new Set(), eyebrows: new Set(), buttons: new Set(), links: new Set(), maybe: new Set(), always: new Set(), bindings: new Set(), hosts: new Set(), page: false, map: false, html: false, r2serve: false });
// servePageCalls(raw): each servePage(env, { … }) call's options, read off the masked code (a paren or brace inside a string
// never counts): its page key when it is a literal, the renderer its content calls, and whether it answers a status of its
// own (an error page: a 404 or 422 drawn in the shell, not the screen the route serves)
export function servePageCalls(raw) {
  if (!/\bservePage\s*\(/.test(raw)) return [];
  const code = maskJs(raw).code, calls = [];
  for (const x of code.matchAll(/\bservePage\s*\(/g)) {
    let i = x.index + x[0].length, d = 0, open = -1;
    for (; i < code.length; i++) { const c = code[i]; if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") { if (d === 0) break; d--; } else if (c === "{") { if (d === 0 && open < 0) open = i; d++; } else if (c === "}") d--; if (open >= 0 && d === 0) break; }
    if (open < 0 || i >= code.length) continue;
    const mk = code.slice(open + 1, i), src = raw.slice(open + 1, i);
    const top = (re) => { let dd = 0, last = 0; for (const y of mk.matchAll(re)) { for (let k = last; k < y.index; k++) { const c = mk[k]; if ("({[".includes(c)) dd++; else if (")}]".includes(c)) dd--; } last = y.index; if (dd === 0) return y; } return null; };
    const a = top(/\bactive\s*:/g), s = top(/\bstatus\s*:/g), ct = top(/\bcontent\s*:/g);
    const lit = a ? /^\s*"([a-z][a-z0-9-]*)"/.exec(src.slice(a.index + a[0].length)) : null;
    const st = s ? /^\s*([^,}]+)/.exec(src.slice(s.index + s[0].length)) : null;
    const rend = ct ? /^\s*render([A-Z][A-Za-z0-9]*?)Page\s*\(/.exec(src.slice(ct.index + ct[0].length)) : null;
    calls.push({ active: lit ? lit[1] : null, computed: !!a && !lit, renders: rend ? rend[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase() : null, error: !!st && !/^\s*200\s*$/.test(st[1]) });
  }
  return calls;
}
// marksOfSource(src): the marks of a whole source text (the selftest's door to marksOf)
export function marksOfSource(src) { const mk = maskJs(src); return marksOf(mk.strings.filter((s) => !s.regex).map((s) => s.text).join(" "), mk.nocom); }
function marksOf(text, raw) {
  const m = emptyMarks();
  // a page key: every literal `active:`, except one that only an error page in this span names (a span that draws its own
  // page too); a page whose key is computed (`active: cardTabOf(…)`: the tab its item names) is keyed by its renderer
  // (renderCardPage → card), so the screen it draws is not folded into the error page's
  const calls = servePageCalls(raw);
  const errOnly = new Set(calls.some((c) => !c.error) ? calls.filter((c) => c.error && c.active && !calls.some((o) => !o.error && o.active === c.active)).map((c) => c.active) : []);
  for (const c of calls) if (!c.error && c.computed && c.renders) m.active.add(c.renders);
  for (const x of raw.matchAll(/\bactive:\s*"([a-z][a-z0-9-]*)"/g)) if (!errOnly.has(x[1])) m.active.add(x[1]);
  for (const x of raw.matchAll(/\bserveMap\([^,()]+,[^,()]+,\s*"([a-z]+)"/g)) m.active.add(x[1]);
  if (/\bserveMap\(/.test(raw)) m.map = true;
  if (/\bservePage\(/.test(raw)) m.page = true;
  if (/text\\?\/html/.test(raw)) m.html = true;
  if (/\bBRAIN\.get\(/.test(raw) && /(^|[\s"'`])serve\//.test(text)) m.r2serve = true;
  for (const x of raw.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\.(?:get|put|delete|list|head)\(/g)) m.bindings.add(x[1]);
  for (const x of text.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})\//g)) m.hosts.add(x[1]);
  for (const x of raw.matchAll(/pageHeader\(\{\s*title:\s*"([^"]+)"/g)) m.titles.add(x[1]);
  // the look revision's head (parts.js pageHead({ title, crumbs, … })): a literal title, or the literal a computed one falls
  // back to (`title: noDash(i.what || "Impact")`: the page's own name when the item has none)
  for (const x of raw.matchAll(/\bpageHead\(\{[^{}]*?\btitle:\s*(?:"([^"]+)"|[^,{}"]*?\|\|\s*"([^"]+)"\s*\)?\s*[,}])/g)) m.titles.add(x[1] || x[2]);
  for (const x of raw.matchAll(/\beyebrow:\s*"([^"]+)"/g)) m.eyebrows.add(x[1]);
  for (const x of text.matchAll(/data-button="([a-z][a-z0-9-]*)"/g)) m.buttons.add(x[1]);
  for (const x of text.matchAll(/\bhref="(\/[a-z][a-z0-9/_-]*)/g)) m.links.add(x[1]);
  for (const x of text.matchAll(/data-screen="([a-z][a-z0-9-]*)"/g)) m.screens.add(x[1]);
  // a region drawn only when there is something to draw: inside a `${cond ? … : ""}` or after a `&&` in its template, or
  // in a helper that may return nothing (`return ""`)
  const emptyHelper = /\breturn\s*(""|''|``)\s*;/.test(raw);
  // …or after an early return on a state of the data (not an error's: `if (d.error) return …` is the error page)
  const earlyAt = [...raw.matchAll(/\bif\s*\(([^)]*)\)\s*\{?\s*return\b/g)].filter((m) => !/error|unreach|quota|fail|!\s*[\w.]+\s*$/i.test(m[1].trim())).map((m) => m.index);
  // …or in the consequent of a ternary whose other branch draws nothing (the look revision's parts: `needs.length ? card({
  // region: "open", … }) : ""`, `src ? { html: '<span data-region="source">…' } : null`): a `?` opening a call, an object, a
  // list or a template before the region in the same statement, not yet closed, and a `: ""` / `: null` after it
  const inEmptyTernary = (i) => {
    const w = raw.slice(Math.max(0, i - 400), i), stmt = w.slice(w.lastIndexOf(";") + 1);
    const opens = [...stmt.matchAll(/\?\s*(?:[A-Za-z_$][\w$.]*\(|\{|\[|`)/g)];
    if (!opens.length) return false;
    const between = stmt.slice(opens[opens.length - 1].index);
    if (/:\s*(?:""|''|``|null)\s*[,)}\]]/.test(between)) return false;   // that ternary closed before the region
    const after = raw.slice(i, i + 700); const end = after.indexOf(";");
    return /[)}\]`]\s*:\s*(?:""|''|``|null)(?!\w)/.test(end >= 0 ? after.slice(0, end) : after);
  };
  const maybeAt = (i) => { const w = raw.slice(Math.max(0, i - 300), i); const open = w.lastIndexOf("${"); const seg = open >= 0 ? w.slice(open) : ""; return emptyHelper || /\?|&&/.test(seg) || earlyAt.some((at) => at < i) || inEmptyTernary(i); };
  for (const x of raw.matchAll(/data-region=\\?"([a-z][a-z0-9-]*)\\?"/g)) { m.regions.add(x[1]); if (maybeAt(x.index)) m.maybe.add(x[1]); else m.always.add(x[1]); }
  for (const x of raw.matchAll(/\bregion:\s*"([a-z][a-z0-9-]*)"/g)) { m.regions.add(x[1]); if (maybeAt(x.index)) m.maybe.add(x[1]); else m.always.add(x[1]); }
  for (const x of text.matchAll(/data-door="((?:GET|POST) \/[^"$]*)"/g)) m.doors.add(x[1]);
  for (const x of text.matchAll(/\bfetch\(\s*["'`]?(\/[a-z][a-z0-9/_-]*)/g)) m.fetches.add(x[1]);
  for (const x of text.matchAll(/<form[^>]*method="POST"[^>]*action="(\/[a-z][a-z0-9/_-]*)"|<form[^>]*action="(\/[a-z][a-z0-9/_-]*)"[^>]*method="POST"/gi)) m.forms.add(x[1] || x[2]);
  return m;
}

// the closure of a route or a case: its own span, then every declaration it reaches (stopping at the plumbing), with the
// tables each reads and writes and where (the declaration that holds the SQL), and the page marks found on the way
export function closureOf(scan, start) {
  const seen = new Set(), reads = new Map(), writes = new Map();
  const marks = emptyMarks();
  const merge = (mk) => { for (const k of Object.keys(marks)) { if (marks[k] instanceof Set) for (const v of mk[k]) marks[k].add(v); else if (mk[k]) marks[k] = true; } };
  const take = (span, where) => {
    for (const t of span.reads) if (!reads.has(t)) reads.set(t, where);
    for (const t of span.writes) if (!writes.has(t)) writes.set(t, where);
    merge(span.marks);
  };
  take(start, start.where || "the handler");
  const queue = [...start.refs];
  while (queue.length) {
    const k = queue.shift();
    if (seen.has(k) || scan.plumbing.has(k)) continue;
    seen.add(k);
    const d = scan.index.get(k);
    if (!d) continue;
    take(d, k);
    for (const r of d.refs) if (!seen.has(r)) queue.push(r);
  }
  return { decls: seen, reads, writes, marks };
}

// ======================================================================================================================
// 6. the doors, analysed: each REST row's handler and the part of it that serves the row, what it reads and writes,
// what a caller with no credential gets, whether it is a page (and which), a redirect, or JSON; each MCP tool's case;
// the twins (a REST row and a tool answering from one read function)
const sample = (p) => p.split("/").map((s) => (s.startsWith(":") ? "x1" : s)).join("/");
const prefixOf = (p) => (p.includes("/:") ? p.slice(0, p.indexOf("/:") + 1) : null);
const restId = (r) => `${r.method} ${r.path}`;

// the spans of a handler that serve one row: its own `if (path === "<row>" …)` block when the handler branches on it, else
// the handler less the blocks it keeps for its other rows
function branchSpans(scan, route, row, siblings) {
  if (!route || route.runAt == null) return null;
  const f = scan.idx, code = f.code, src = f.src;
  const blockAfter = (j) => {
    let k = j; while (k < route.end && /\s/.test(code[k])) k++;
    let e = k, dd = 0;
    if (code[k] === "{") { for (; e < route.end; e++) { if (code[e] === "{") dd++; else if (code[e] === "}") { dd--; if (dd === 0) break; } } return [k, e + 1]; }
    for (; e < route.end; e++) { const ch = code[e]; if ("([{".includes(ch)) dd++; else if (")]}".includes(ch)) dd--; else if (ch === ";" && dd === 0) break; }
    return [k, e + 1];
  };
  const own = (r) => {
    const exact = `path === "${r.path}"`, pfx = prefixOf(r.path);
    const re = /\bif\s*\(/g; re.lastIndex = route.runAt;
    let m;
    while ((m = re.exec(code)) && m.index < route.end) {
      let j = m.index + m[0].length, d = 1;
      while (j < route.end && d > 0) { if (code[j] === "(") d++; else if (code[j] === ")") d--; j++; }
      const cond = f.nocom.slice(m.index + m[0].length, j - 1).trim();
      // the row's own block: its path alone, or with a test of the caller (a browser, a method), never with a query test
      const tail = (head) => cond === head || (cond.startsWith(head + " &&") && !/searchParams|\burl\b|\bq\b|\bbody\b/.test(cond.slice(head.length)));
      const hit = tail(exact) || (pfx && tail(`path.startsWith("${pfx}")`));
      if (hit) { const sp = blockAfter(j); sp.pure = cond === exact || cond === `path.startsWith("${pfx}")`; return sp; }
    }
    return null;
  };
  // the row's own block, after the handler's preamble; else the handler less its other rows' blocks
  const mine = own(row);
  const cut = siblings.filter((r) => r !== row).map(own).filter(Boolean).sort((a, b) => a[0] - b[0]);
  // a block on the row's path alone returns for it: what follows serves the others; a block on the path AND a test of
  // the caller (a browser) is one case of the row, the rest of the handler serves its other cases
  const stop = mine && mine.pure ? mine[0] : route.end;
  const spans = []; let at = route.runAt;
  for (const [a, b] of cut) { if (a >= stop) break; if (a > at) spans.push([at, a]); at = Math.max(at, b); }
  if (at < stop) spans.push([at, stop]);
  if (mine && mine.pure) spans.push(mine);
  spans.own = !!mine;
  return spans;
}
const mergeInfo = (scan, spans) => {
  const out = { refs: new Set(), reads: new Set(), writes: new Set(), dynamic: false, raw: "", text: "", marks: null };
  for (const [a, b] of spans) {
    const i = scan.spanInfo(scan.idx, a, b);
    for (const k of ["refs", "reads", "writes"]) for (const v of i[k]) out[k].add(v);
    out.dynamic = out.dynamic || i.dynamic; out.raw += i.raw + "\n"; out.text += i.text + " ";
    if (!out.marks) out.marks = i.marks;
    else for (const k of Object.keys(out.marks)) { if (out.marks[k] instanceof Set) for (const v of i.marks[k]) out.marks[k].add(v); else out.marks[k] = out.marks[k] || i.marks[k]; }
  }
  return out;
};

// what a signed-out caller gets: read off the expression a door returns when no reader resolved (a redirect to sign-in, a
// 401 with its error, or a helper that picks between them for a browser and a script)
function verdictOf(t, refusal = false) {
  const redirect = /\bredirectToLogin\(/.test(t);
  // an expression a door returns when no person resolved may refuse 403 (an owner-only door: no reader is no owner)
  const m403 = refusal && /^json\(\{\s*error:\s*"([a-z_]+)"[^;]*?\}\s*,\s*403\)$/.exec(t.trim());
  if (m403) return { status: 403, error: m403[1] };
  const m401 = /error:\s*"([a-z_]+)"[^;]*?\}\s*,\s*401\b/.exec(t) || /status:\s*401\b[^;]*?error:\s*"([a-z_]+)"/.exec(t)
    || (/new Response\([^;]*status:\s*401\b/.test(t) ? [null, null] : null);
  // who gets the redirect: a form post (`isForm ? redirectToLogin`) or a browser's navigation (every other test of the caller)
  const cv = /\b([A-Za-z_$][\w$]*)\s*\?\s*redirectToLogin/.exec(t);
  const def = cv && new RegExp(`\\b(?:const|let)\\s+${cv[1]}\\s*=([^;]*);`).exec(t);
  const via = cv && (/form/i.test(cv[1]) || (def && /form/i.test(def[1]))) ? "form" : "browser";
  if (redirect && m401) return { status: 401, error: m401[1], browser: 302, to: "/login", via };
  if (redirect) return { status: 302, to: "/login" };
  if (m401) return { status: 401, error: m401[1] };
  return null;
}
export function refusalOf(scan, f, expr) {
  const e = String(expr || "").trim();
  const call = /^(?:await\s+)?([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(e);
  if (call && !/^(json|redirectToLogin)$/.test(call[1])) {
    const k = scan.resolveName(f, call[1]);
    const d = k && scan.index.get(k);
    let hv = d ? verdictOf(d.raw) : null;
    if (!hv && d) for (const r of noValueReturns(d.raw)) { hv = verdictOf(r, true); if (hv) break; }
    if (hv) { const err = /error:\s*"([a-z_]+)"/.exec(call[2]); return { ...hv, ...(err ? { error: err[1] } : {}), by: k }; }
  }
  const v = verdictOf(e, true);
  return v ? { ...v, by: "the handler" } : null;
}
// the expression after `if (!<who>) return …;` or the first return inside `if (!<who>) { … }`
export function noReaderReturn(text, who = "(?:reader|person|who|gateReader|p)") {
  const m = new RegExp(`if\\s*\\(\\s*!\\s*${who}\\s*\\)\\s*(\\{[\\s\\S]*?\\breturn\\s+([^;]+);|return\\s+([^;]+);)`).exec(text);
  return m ? (m[2] || m[3]) : null;
}
// every `if (!<name>) return …;` of a text, in order (a door may refuse a missing key before a missing reader)
// (the last `return` of a block is the one every such caller reaches; one before it answers a sub-case)
function noValueReturns(text) {
  const out = [];
  for (const m of text.matchAll(/if\s*\(\s*!\s*[A-Za-z_$][\w$]*\s*(?:\|\|[^)]*)?\)\s*/g)) {
    let j = m.index + m[0].length;
    if (text[j] === "{") {
      let d = 0, k = j;
      for (; k < text.length; k++) { if (text[k] === "{") d++; else if (text[k] === "}") { d--; if (d === 0) break; } }
      const body = text.slice(j + 1, k);
      let depth = 0, last = null;
      for (const r of body.matchAll(/\breturn\s+([^;]+);|[{}]/g)) { if (r[0] === "{") depth++; else if (r[0] === "}") depth--; else if (depth === 0) last = r[1]; }
      if (last) out.push(last);
    } else { const r = /^return\s+([^;]+);/.exec(text.slice(j)); if (r) out.push(r[1]); }
  }
  return out;
}
function anonOf(scan, row, route, info) {
  if (row.auth === "none") return { open: true };
  if (!route) return null;
  const gated = scan.gated.exact.includes(row.path) || (row.method === "GET" && scan.gated.prefixes.some((p) => row.path.startsWith(p)));
  if (gated && route.stage >= 0 && scan.gated.answer) return { ...scan.gated.answer, by: "GATED_SURFACE (routeRequest)" };
  if (route.stage >= 1 && scan.keyGate) return { ...scan.keyGate, by: "the key gate (routeRequest)" };
  for (const own of noValueReturns(info.raw)) { const v = refusalOf(scan, scan.idx, own); if (v) return v; }
  const guard = /const\s+(\w+)\s*=\s*(?:await\s+)?([A-Za-z_$][\w$]*\([^;]*\));\s*if\s*\(\s*\1\s*\)\s*return\s+\1\s*;/.exec(info.raw);
  if (guard) { const v = refusalOf(scan, scan.idx, guard[2]); if (v) return v; }
  const v = verdictOf(info.raw);
  if (v) return { ...v, by: "the handler" };
  // a handler that hands the request on: the function it calls refuses a missing reader itself
  for (const k of info.refs) {
    const d = scan.index.get(k);
    if (!d || scan.plumbing.has(k)) continue;
    for (const r of noValueReturns(d.raw)) {
      const v2 = refusalOf(scan, scan.files.get(d.file) || scan.idx, r);
      if (v2) return { ...v2, by: v2.by === "the handler" ? k : v2.by };
    }
  }
  return null;
}

export function analyse(scan, model = {}) {
  const rest = arr(scan.door.rest), tools = arr(scan.door.tools);
  const rows = rest.map((r) => ({ ...r, key: restId(r), handlers: [] }));
  for (const row of rows) {
    const p = sample(row.path);
    row.handlers = scan.routes.filter((r) => { try { return !!(r.test && r.test(p, row.method)); } catch { return false; } });
  }
  // rows sharing a handler: the siblings its branches split
  const byHandler = new Map();
  for (const row of rows) if (row.handlers[0]) { const h = row.handlers[0]; if (!byHandler.has(h)) byHandler.set(h, []); byHandler.get(h).push(row); }
  for (const row of rows) {
    const h = row.handlers[0];
    row.route = h || null;
    if (!h) continue;
    const spans = h.table === "routeRequest" ? null : branchSpans(scan, h, row, byHandler.get(h) || []);
    row.ownBranch = !!(spans && spans.own);
    row.info = spans ? mergeInfo(scan, spans) : h;
    // a handler that steps aside for a browser (`return undefined` on Accept: text/html) hands the page to the next one
    if (row.method === "GET" && /text\\?\/html[^\n]*\)\)\s*return undefined/.test(row.info.raw) && row.handlers[1]) {
      const h2 = row.handlers[1];
      const s2 = branchSpans(scan, h2, row, byHandler.get(h2) || [row]);
      row.pageInfo = s2 ? mergeInfo(scan, s2) : h2;
      row.pageRoute = h2;
    } else { row.pageInfo = row.info; row.pageRoute = h; }
    row.closure = closureOf(scan, row.info);
    const raw = row.info.raw;
    let loc = /location["']?\s*:\s*["']([^"']+)["']/.exec(raw) || /\b302\b[^"]*"location"\s*:\s*"([^"]+)"/.exec(raw);
    if (!loc) {
      const v = /location["']?\s*:\s*([A-Za-z_$][\w$]*)/.exec(raw);
      const def = v && new RegExp(`\\b(?:const|let)\\s+${v[1]}\\s*=([^;]*);`).exec(raw);
      // a map keyed by the path ({ "/work": "/build", … }[path]) or a test of it (path === "/x" ? "/a" : "/b") answers per row
      const keyed = def && new RegExp(`"${row.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"(\\/[^"]*)"`).exec(def[1]);
      const tested = def && new RegExp(`path\\s*===\\s*"${row.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*\\?\\s*"(\\/[^"]*)"`).exec(def[1]);
      const paths = def ? [...def[1].matchAll(/"(\/[a-z][a-z0-9/_-]*)"/g)].map((x) => x[1]).filter((x) => !x.endsWith("/")) : [];
      if (keyed || tested) loc = [null, (keyed || tested)[1]];
      else if (paths.length) loc = [null, paths[paths.length - 1]];
    }
    row.redirectOnly = /\bstatus:\s*302\b|redirectToLogin\(|Response\.redirect\(/.test(raw) && !/\bservePage\(|\bserveMap\(|\bjson\(|\btext\(|new Response\(\s*(?!null)/.test(raw);
    if (row.redirectOnly) row.redirectTo = loc ? loc[1] : ((/302 to (\/[a-z/]*)/.exec(row.does) || [])[1] || null);
    // a row that only redirects does so before any sign-in: anyone gets the redirect
    const gatedRow = h.stage >= 0 && (scan.gated.exact.includes(row.path) || (row.method === "GET" && scan.gated.prefixes.some((p) => row.path.startsWith(p))));
    row.anon = row.redirectOnly && !gatedRow && !/redirectToLogin\(|resolveReader\(|signInOr401\(/.test(raw) ? { open: true } : anonOf(scan, row, h, row.info);
    const pr = row.pageInfo.raw;
    // a page: the shell wraps it (servePage, serveMap), or the handler answers a whole document (a render function whose own
    // text opens with a doctype: the sign-in page); a fragment (the Map's inspector) is not a page
    const docOf = (k) => { const d = scan.index.get(k); return !!d && (/<!doctype html/i.test(d.raw) || [...d.refs].some((r) => /<!doctype html/i.test((scan.index.get(r) || {}).raw || ""))); };
    const docRender = [...(row.pageInfo.refs || [])].some((k) => /#render[A-Z]/.test(k) && docOf(k));
    row.isPage = row.method === "GET" && !row.redirectOnly && row.pageRoute.stage >= 0 && (/\bservePage\(|\bserveMap\(/.test(pr) || (/text\\?\/html/.test(pr) && docRender));
    // a handler serving several rows that does not branch on this one: the registry's own words say which of them is a page
    const shared = (byHandler.get(row.pageRoute) || []).length > 1;
    if (row.isPage && shared && !row.ownBranch && !/\b(HTML|to a browser|drawn in the shell|the page)\b/i.test(row.does)) row.isPage = false;
  }
  // the tools: each case's own refs and closure; whether it writes (the registry's flag)
  const toolRows = tools.map((t) => {
    const c = scan.cases.get(t.name) || null;
    return { ...t, key: `MCP ${t.name}`, case: c, closure: c ? closureOf(scan, c) : null };
  });
  // the read functions a span calls directly: a non-plumbing declaration whose own closure touches a table
  const workOf = new Map();
  const doesWork = (k) => {
    if (workOf.has(k)) return workOf.get(k);
    workOf.set(k, false);
    const d = scan.index.get(k);
    if (!d || scan.plumbing.has(k)) return false;
    const c = closureOf(scan, d);
    const v = c.reads.size + c.writes.size > 0;
    workOf.set(k, v);
    return v;
  };
  // a function both doors call directly: neither plumbing nor a shared utility (util.js, ui.js) nor a constant
  const fnsOf = (refs) => new Set([...refs].filter((k) => !scan.plumbing.has(k) && !/^(util|ui|timing|reqmemo|readmemo)\.js#/.test(k) && !/#[A-Z0-9_]+$/.test(k) && scan.index.get(k) && /=>|function/.test(scan.index.get(k).raw.slice(0, 400))));
  for (const r of rows) r.fns = r.info ? fnsOf(r.info.refs) : new Set();
  for (const t of toolRows) t.fns = t.case ? fnsOf(t.case.refs) : new Set();
  // the registry's own twin claims, both ways
  const claims = new Map();   // "tool|METHOD path" -> where
  const toolNames = new Set(tools.map((t) => t.name));
  for (const r of rows) {
    for (const m of r.does.matchAll(/twin of (?:the )?`?([a-z_]+)`?(?!['’\w])/g)) if (toolNames.has(m[1])) claims.set(`${m[1]}|${r.key}`, "rest");
    for (const m of r.does.matchAll(/(?:—|-|,)\s*(?:the )?([a-z_]+) tool with\b/g)) if (toolNames.has(m[1])) claims.set(`${m[1]}|${r.key}`, "rest");
  }
  for (const t of toolRows) for (const m of String(t.description).matchAll(/\b(GET|POST) (\/[A-Za-z0-9/:_-]+)/g)) {
    if (/same read|twin|answers the same|the same as|REST/i.test(t.description) && rows.some((r) => r.key === `${m[1]} ${m[2]}`)) claims.set(`${t.name}|${m[1]} ${m[2]}`, claims.has(`${t.name}|${m[1]} ${m[2]}`) ? "both" : "tool");
  }
  // the code's pairs: a tool and a row calling one read function directly
  // one level down too (a door that wraps the read in its own helper): only where the registry names the pair
  const deeper = (fns) => { const out = new Set(fns); for (const k of fns) for (const r of fnsOf((scan.index.get(k) || { refs: [] }).refs)) out.add(r); return out; };
  for (const r of rows) r.fns2 = deeper(r.fns);
  for (const t of toolRows) t.fns2 = deeper(t.fns);
  const pairs = [];
  for (const t of toolRows) for (const r of rows) {
    let shared = [...t.fns].filter((k) => r.fns.has(k));
    if (!shared.length && claims.has(`${t.name}|${r.key}`)) shared = [...t.fns2].filter((k) => r.fns2.has(k) && doesWork(k));
    if (shared.length) pairs.push({ tool: t, row: r, shared });
  }
  const twins = [], findings = [];
  for (const t of toolRows) {
    const mine = pairs.filter((p) => p.tool === t);
    const claimed = mine.filter((p) => claims.has(`${t.name}|${p.row.key}`));
    let pick = [];
    if (claimed.length) pick = claimed;
    else if (mine.length === 1 && pairs.filter((p) => p.row === mine[0].row).length === 1 && mine[0].shared.some(doesWork)) pick = mine;
    else {
      // the one row whose every read function is one this tool calls (a door that is nothing but the tool's read)
      const only = mine.filter((p) => p.row.fns.size && [...p.row.fns].every((k) => t.fns.has(k)) && p.shared.some(doesWork));
      if (only.length === 1) pick = only;
    }
    for (const p of pick) twins.push({ tool: t, row: p.row, shared: p.shared, by: claims.has(`${t.name}|${p.row.key}`) ? "code+registry" : "code" });
  }
  for (const [k, where] of claims) {
    const [tn, rk] = k.split("|");
    if (!twins.some((x) => x.tool.name === tn && x.row.key === rk)) findings.push({ kind: "twin-claim", ref: rk, tool: tn, where, note: `the registry names ${rk} and the \`${tn}\` tool as twins, but the code shows no read function both call directly` });
  }
  for (const r of rows) if (!r.route) findings.push({ kind: "no-handler", ref: r.key, note: `${r.key} is declared in the registry, and no route table entry or router line serves it` });
  return { rows, toolRows, twins, findings, claims };
}

// ======================================================================================================================
// 7. the ops: the model (surface, lanes, screens, doors, tables, flows, gaps), its edges, the checks, the renders
const human = (k) => { const t = String(k).replace(/[-_/]+/g, " ").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
const WHO = {
  none: "anyone, with no credential", reader: "a signed-in reader (a seated person's key, session or read-only key)",
  bearer: "a signed-in person (a key or a session)", owner: "the owner (the org's admin)", key: "a person's key (a bearer header or ?k=)",
  session: "a signed-in browser session (a key is refused)",
};
// (project_required is NOT generic, D2b item 7: in an org of more than one project it is what an empty body gets from a door
// that takes `project`, so a door that declares it lists it among the refusals its check accepts)
const GENERIC_ERRORS = new Set(["project_forbidden", "owner_only", "forbidden", "not_found", "read_only_credential", "cross_origin_session_write",
  "key_in_url", "human_verb", "not_seated", "partner_refused", "auth_required", "unauthorized", "d1_quota", "unreadable", "transcript_rejected", "preview_not_found"]);
// the top-level fields a registry text declares for its JSON answer: the first {…} after "JSON" (or "answers"/"->")
export function declaredFields(text) {
  const t = String(text || "");
  const at = t.search(/\bJSON(?: otherwise| answer)?\s*\{|\bas JSON\s*\{|\banswers \{|-> \{|JSON \(sprint \d[^)]*\)\s*\{/);
  if (at < 0) return [];
  const open = t.indexOf("{", at);
  let d = 0, j = open, cur = "", parts = [];
  for (; j < t.length; j++) {
    const ch = t[j];
    if ("{[(".includes(ch)) { d++; if (d === 1) continue; }
    if ("}])".includes(ch)) { d--; if (d === 0) break; }
    if (d === 1 && ch === ",") { parts.push(cur); cur = ""; continue; }
    if (d === 1) cur += ch;
  }
  parts.push(cur);
  return uniq(parts.map((x) => (/^\s*["']?([A-Za-z_][\w-]*)["']?\s*(?::|$|\s)/.exec(x) || [])[1]).filter((x) => x && !/^(the|a|an|one|each|every|and|or|with)$/i.test(x)));
}
// the error a write door declares for a body it cannot take: the first 4xx code in its text that is not an auth or scope one
export function declaredErrors(text, rest = true) {
  const t = String(text || "");
  const re = rest ? /\b(4\d\d)\s+([a-z][a-z0-9_]+)\b/g : /\b(?:refused|is refused|answers)\s*\(?\s*`?([a-z][a-z0-9_]+)`?\)?/g;
  const out = [];
  for (const m of t.matchAll(re)) { const code = rest ? m[2] : m[1]; if (!GENERIC_ERRORS.has(code) && code.includes("_") && !out.includes(code)) out.push(code); }
  return out;
}
export function declaredError(text, rest = true) {
  const t = String(text || "");
  const re = rest ? /\b(4\d\d)\s+([a-z][a-z0-9_]+)\b/g : /\b(?:refused|is refused|answers)\s*\(?\s*`?([a-z][a-z0-9_]+)`?\)?/g;
  const all = [];
  for (const m of t.matchAll(re)) {
    const code = rest ? m[2] : m[1];
    if (!GENERIC_ERRORS.has(code) && code.includes("_")) all.push({ code, status: rest ? Number(m[1]) : null });
  }
  // an empty body lacks its fields: a code naming a missing or malformed field first, then a 422, a 400, an unknown_* 404
  const rank = (e) => (/required|missing|^bad_|invalid|empty/.test(e.code) ? 0 : e.status === 422 ? 1 : e.status === 400 ? 2 : e.status === 404 && /^unknown_/.test(e.code) ? 3 : 4);
  return all.length ? all.slice().sort((a, b) => rank(a) - rank(b))[0] : null;
}

export function buildCodeOps(scan, an, model, opts = {}) {
  const r = result();
  r.notImported = [];
  const out = { screens: [], doors: new Map(), lanes: [], tables: [], flows: [], gaps: [], checks: [], edges: new Map() };
  const app = model.app || { key: "app", name: "app" };
  const surfaceId = nodeId("surface", app.key);
  const doorIdOf = (key) => nodeId("door", key);
  const rowByKey = new Map(an.rows.map((x) => [x.key, x]));
  const twinOfRow = new Map(an.twins.map((t) => [t.row.key, t])), twinOfTool = new Map(an.twins.map((t) => [t.tool.name, t]));
  const where = (route) => (route ? `src/index.js:${route.line} (${route.table})` : null);
  const edge = (from, to, kind, label, data) => {
    const k = `${from}|${to}|${kind}`;
    if (from === to || out.edges.has(k)) return;
    out.edges.set(k, { from, to, kind, label: label ?? null, data: data || {} });
  };

  // ---- the lanes: the rail's tabs in order, then the two the rail does not draw ----
  const tabOf = (key) => { const t = scan.tabs.find((x) => x.views.some((v) => v.key === key)); return t ? t.key : (scan.offnav[key] || ""); };
  const lanes = scan.tabs.map((t) => ({ key: t.key, label: t.label, href: (t.views[0] || {}).href || null, tab: true }));
  const extra = model.lanes || {};
  for (const l of [extra.anonymous, extra.signedIn]) if (l && l.key) lanes.push({ key: l.key, label: l.label, href: null, tab: false });

  // ---- the screens: one per page a person opens ----
  const pageRows = an.rows.filter((x) => x.isPage);
  const viewsCfg = model.views || {};
  const litOf = (ref) => { if (!ref) return null; const [file, name] = ref.split("#"); const f = scan.files.get(join(scan.srcDir, file)); return f ? literalOf(f, scan.declOf(f, name)) : null; };
  const views = arr(litOf(viewsCfg.views));   // [[key, label, href]]
  // the canvas's openings on other layers (src/mapread.js OPENS: a key whose view is the canvas and whose layers are not the default)
  const openings = [];
  if (viewsCfg.openings) {
    const [file, name] = viewsCfg.openings.split("#");
    const f = scan.files.get(join(scan.srcDir, file)), d = f && scan.declOf(f, name);
    if (d) for (const m of f.nocom.slice(d.start, d.end).matchAll(/\b([a-z]+):\s*\{\s*view:\s*"canvas"(?:,\s*layers:\s*([^}]+))?\}/g)) {
      if (m[2] && m[2].trim() !== "DEFAULT_LAYERS" && m[1] !== viewsCfg.page) openings.push(m[1]);
    }
  }
  const closureOfPage = new Map();
  const pageClosure = (row) => { if (!closureOfPage.has(row)) closureOfPage.set(row, closureOf(scan, row.pageInfo)); return closureOfPage.get(row); };
  const matchRoute = (pattern, route) => { const a = pattern.split("/"), b = route.split("/"); return a.length === b.length && a.every((x, i) => x.startsWith(":") || x === b[i]); };
  const screens = new Map();   // id -> screen
  const isViewRow = (row) => views.some(([, , href]) => href === row.path);
  const ordered = [...pageRows].sort((a, b) => (isViewRow(b) ? 1 : 0) - (isViewRow(a) ? 1 : 0));
  for (const row of ordered) {
    const m = row.pageInfo.marks;
    const actives = [...m.active];
    const viaMap = /\bserveMap\(/.test(row.pageInfo.raw);
    const key = viaMap && viewsCfg.page ? viewsCfg.page : actives.length ? actives[0] : row.path.split("/").filter(Boolean)[0] || "home";
    const c = pageClosure(row);
    if (viewsCfg.page && key === viewsCfg.page && views.length) {
      // the Map: a screen per view this row serves (the canvas's openings as its states)
      for (const [vkey, vlabel, href] of views) {
        const exact = pageRows.find((x) => x.path === href && x.method === "GET");
        const serves = exact ? exact === row : matchRoute(row.path, href) && !pageRows.some((x) => x !== row && x.path === href);
        if (!serves) continue;
        const id = nodeId("screen", vkey === "canvas" ? viewsCfg.page : `${viewsCfg.page}/${vkey}`);
        const sc = screens.get(id) || { id, key: viewsCfg.page, view: vkey, route: href, rows: [], name: vkey === "canvas" ? (scan.tabs.find((t) => t.key === tabOf(viewsCfg.page)) || {}).label || human(vkey) : `${(scan.tabs.find((t) => t.key === tabOf(viewsCfg.page)) || {}).label || "Map"} · ${vlabel}`,
          ds: c.marks.screens.has(viewsCfg.page) ? viewsCfg.page : null, closure: c, states: [], stateRoutes: {}, shared: true };
        sc.rows.push(row);
        screens.set(id, sc);
      }
      // the openings on other layers: states of the canvas, served by the pattern row
      const canvas = screens.get(nodeId("screen", viewsCfg.page));
      for (const o of openings) if (canvas && matchRoute(row.path, `/${viewsCfg.page}/${o}`)) { if (!canvas.states.includes(o)) canvas.states.push(o); canvas.stateRoutes[o] = `/${viewsCfg.page}/${o}`; if (!canvas.rows.includes(row)) canvas.rows.push(row); }
      // a row opening the canvas as it is (an old URL kept): it serves the canvas too
      if (!views.some(([, , href]) => href === row.path) && !matchRoute(row.path, `/${viewsCfg.page}/x`) && canvas && !canvas.rows.includes(row)) canvas.rows.push(row);
      continue;
    }
    const dsAll = [...c.marks.screens];
    const ds = dsAll.includes(key) ? key : dsAll.length === 1 ? dsAll[0] : null;
    const id = nodeId("screen", ds || key);
    const sc = screens.get(id) || { id, key, ds, route: row.path, rows: [], closure: c, states: [], stateRoutes: {} };
    sc.rows.push(row);
    if (row.path.length < sc.route.length) sc.route = row.path;
    screens.set(id, sc);
  }
  // order, lane, name
  const keyOrder = [];
  for (const t of scan.tabs) for (const v of t.views) keyOrder.push(v.key);
  for (const k of Object.keys(scan.offnav)) if (!keyOrder.includes(k)) keyOrder.push(k);
  for (const p of scan.pages) if (!keyOrder.includes(p.key)) keyOrder.push(p.key);
  const pageLabel = (k) => { const p = scan.pages.find((x) => x.key === k); return p ? p.label : null; };
  const list = [...screens.values()];
  for (const sc of list) {
    const tab = tabOf(sc.key);
    // a page that lights no tab: the model's own word for it (lanes.pages, keyed by data-screen or page key) first — a page
    // whose route also answers with no credential (What is missing shows the bare checklist to anyone) is still the signed-in
    // reader's page — else the sign-in lane when every row it serves needs no credential, else the signed-in lane
    const pinned = !tab && ((extra.pages || {})[sc.ds || sc.key] || (extra.pages || {})[sc.key]);
    sc.lane = tab || (pinned && lanes.some((l) => l.key === pinned) ? pinned : null)
      || (sc.rows.every((x) => x.auth === "none") ? (extra.anonymous || {}).key : (extra.signedIn || {}).key) || "app";
    const named = (model.names || {})[sc.ds || sc.key];
    if (!sc.name && named) sc.name = named.name;
    if (!sc.name) {
      const t = scan.tabs.find((x) => x.key === tab);
      const main = t && t.views[0] && t.views[0].key === sc.key && (!sc.ds || sc.ds === sc.key);
      const view = t && t.views.find((v) => v.key === sc.key);
      const titles = [...sc.closure.marks.titles], brows = [...sc.closure.marks.eyebrows].filter((x) => x && x !== (t && t.label));
      sc.name = main ? t.label : view && (!sc.ds || sc.ds === sc.key) ? view.label
        : (!sc.ds || sc.ds === sc.key) && pageLabel(sc.key) ? pageLabel(sc.key)
        : titles.length === 1 ? titles[0] : brows.length === 1 ? brows[0] : pageLabel(sc.key) && !list.some((o) => o !== sc && o.key === sc.key && (!o.ds || o.ds === o.key)) ? pageLabel(sc.key) : human(sc.ds || sc.key);
    }
    sc.order = (() => { const i = keyOrder.indexOf(sc.key); return i < 0 ? 999 : i; })();
    sc.viewOrder = sc.view ? views.findIndex(([k]) => k === sc.view) : -1;
  }
  const byLane = new Map();
  for (const sc of list.sort((a, b) => a.order - b.order || a.viewOrder - b.viewOrder || (a.ds === a.key ? -1 : 0) - (b.ds === b.key ? -1 : 0) || a.route.length - b.route.length || a.route.localeCompare(b.route))) {
    if (!byLane.has(sc.lane)) byLane.set(sc.lane, []);
    byLane.get(sc.lane).push(sc);
    sc.step = byLane.get(sc.lane).length;
  }
  out.screens = list;
  const screenByRoute = (path, method = "GET") => list.find((sc) => sc.rows.some((x) => x.path === path && x.method === method)) || list.find((sc) => sc.route === path || Object.values(sc.stateRoutes).includes(path))
    || list.find((sc) => matchRoute(sc.route, path)) || null;
  const rowOfPath = (path, method) => {
    const exact = rowByKey.get(`${method} ${path}`);
    if (exact) return exact;
    return an.rows.find((x) => x.method === method && matchRoute(x.path, path)) || null;
  };

  // ---- the doors: a REST row each, an MCP tool each ----
  const screenUses = new Map();   // door key -> Set(screen id)
  const use = (doorKey, sid, how) => { if (!screenUses.has(doorKey)) screenUses.set(doorKey, new Map()); if (!screenUses.get(doorKey).has(sid)) screenUses.get(doorKey).set(sid, how); };
  for (const sc of list) {
    for (const row of sc.rows) use(row.key, sc.id, "serves");
    const mk = sc.closure.marks;
    for (const d of mk.doors) { const [m0, p0] = d.split(" "); const row = rowOfPath(p0, m0); if (row) use(row.key, sc.id, "calls"); }
    for (const f of mk.fetches) { const row = rowOfPath(f, "GET") || rowOfPath(f, "POST"); if (row) use(row.key, sc.id, "calls"); }
    for (const f of mk.forms) { const row = rowOfPath(f, "POST"); if (row) use(row.key, sc.id, "calls"); }
    sc.links = [...mk.links];
  }
  const laneLabel = (k) => (lanes.find((l) => l.key === k) || {}).label || k;
  const groupOf = (key) => { const u = screenUses.get(key); const first = u && [...u.keys()][0]; const sc = first && list.find((x) => x.id === first); return sc ? laneLabel(sc.lane) : null; };
  const tablesOf = (closure, skip) => {
    if (!closure || skip) return { read: [], write: [], where: {} };
    const where = {};
    for (const [t, w] of closure.reads) where[`r:${t}`] = w;
    for (const [t, w] of closure.writes) where[`w:${t}`] = w;
    return { read: [...closure.reads.keys()].sort(), write: [...closure.writes.keys()].sort(), where };
  };
  const isTransport = (row) => row.route && [...row.info.refs].some((k) => /#handleMcp$/.test(k));
  // D2b: a door no screen calls is grouped by who may call it, in a person's words (code-model/model.json doorGroups)
  const DG = model.doorGroups || {};
  const restGroup = (row) => (row.redirectOnly ? (DG.rest && DG.rest.redirect) || "Old addresses" : (DG.rest && DG.rest[row.auth]) || `Not on a page · ${row.auth}`);
  const mcpGroup = (t) => (DG.mcp && DG.mcp[t.owner ? "owner" : "member"]) || "Agent tools";
  for (const row of an.rows) {
    const id = doorIdOf(row.key);
    const tw = twinOfRow.get(row.key);
    const tb = tablesOf(row.closure, isTransport(row));
    const u = screenUses.get(row.key);
    const data = { via: "rest", method: row.method, path: row.path, access: row.auth, write: row.method !== "GET", does: row.does,
      screens: u ? [...u.keys()].map((x) => x.replace(/^screen:/, "")) : [], handler: where(row.route), tables: { read: tb.read, write: tb.write },
      group: groupOf(row.key) || restGroup(row), from: "code" };
    if (tw) data.twin = `MCP ${tw.tool.name}`;
    if (row.redirectOnly) data.redirect = row.redirectTo;
    if (row.anon) data.signedOut = row.anon.open ? "answers" : row.anon.browser ? `${row.anon.status} ${row.anon.error || ""} (a browser: ${row.anon.browser} to ${row.anon.to})`.replace(/\s+/g, " ") : `${row.anon.status}${row.anon.error ? " " + row.anon.error : ""}${row.anon.to ? " to " + row.anon.to : ""}`;
    out.doors.set(id, { id, type: "door", name: row.key, status: "live", data, row, tb });
  }
  for (const t of an.toolRows) {
    const id = doorIdOf(`MCP ${t.name}`);
    const tw = twinOfTool.get(t.name);
    const tb = tablesOf(t.closure, false);
    const data = { via: "mcp", tool: t.name, access: t.owner ? "owner" : "member", write: !!t.write, project: !!t.project, does: t.description,
      screens: [], handler: t.case ? `src/mcp.js:${t.case.line} (runTool)` : null, tables: { read: tb.read, write: tb.write },
      group: (tw && groupOf(tw.row.key)) || mcpGroup(t), from: "code" };
    if (tw) data.twin = tw.row.key;
    out.doors.set(id, { id, type: "door", name: `MCP ${t.name}`, status: "live", data, tool: t, tb });
  }
  // ---- the tables ----
  const readBy = new Map(), writtenBy = new Map();
  for (const d of out.doors.values()) {
    for (const t of d.tb.read) { if (!readBy.has(t)) readBy.set(t, []); readBy.get(t).push(d.name); }
    for (const t of d.tb.write) { if (!writtenBy.has(t)) writtenBy.set(t, []); writtenBy.get(t).push(d.name); }
  }
  // the tables' groups, read off the code: kept by triggers (a trigger writes it, no door does), the knowledge registry's
  // (src/knowledge/schema.js KINDS, and the k_ tables beside them), identity (what resolving a caller reads: the router's
  // resolve* and scope calls), and the ledger (the rest: what the doors file)
  const trigWritten = new Set();
  for (const t of scan.tables.values()) for (const tr of t.triggers) for (const w of tr.writes) trigWritten.add(w);
  const doorWritten = new Set([...out.doors.values()].flatMap((d) => d.tb.write));
  const identity = new Set();
  for (const k of scan.plumbing) if (/#(resolve|readScope|seats)/i.test(k)) { const d = scan.index.get(k); if (d) { const c = closureOf(scan, { refs: d.refs, reads: d.reads, writes: d.writes, marks: d.marks }); for (const t of c.reads.keys()) identity.add(t); } }
  // what every request reads through the plumbing (the sign-in, the project scope, the shell): the app's own reads
  const plumbRead = new Set();
  for (const k of scan.plumbing) {
    const d = scan.index.get(k);
    if (!d) continue;
    for (const t of d.reads) plumbRead.add(t);
    // a plumbing call's SQL held in a constant it names (src/tenant.js getTenantConfig -> ORG_SQL "SELECT * FROM org ..."):
    // a leaf declaration (it names nothing itself) is the call's own statement, so its tables are the call's reads
    for (const r of d.refs) { const c = scan.index.get(r); if (c && !scan.plumbing.has(r) && c.refs.size === 0) for (const t of c.reads) plumbRead.add(t); }
  }
  const groupOfTable = (n) => trigWritten.has(n) && !doorWritten.has(n) ? "Kept by triggers" : scan.kindTables.includes(n) || /^k_/.test(n) ? "Knowledge" : identity.has(n) ? "Identity" : "Ledger";
  for (const t of scan.tables.values()) {
    out.tables.push({ id: nodeId("table", t.name), type: "table", name: t.name, status: "live", data: { group: groupOfTable(t.name),
      scope: t.cols.some((c) => c.name === "project") ? "project" : "org", cols: t.cols, pk: t.pk, indexes: t.indexes, triggers: t.triggers,
      ...(t.virtual ? { virtual: t.using || true } : {}), readBy: readBy.get(t.name) || [], writtenBy: writtenBy.get(t.name) || [], from: "engine/boot.sql" } });
  }
  // ---- the edges: a screen depends on the doors that serve it and the ones it calls; a tool on its REST twin; a door reads
  // and writes its tables; a screen links on to the screens it names ----
  for (const [key, uses] of screenUses) for (const [sid, how] of uses) edge(sid, doorIdOf(key), "depends", how, { by: "code", how: how === "serves" ? "the route that answers the page" : "the page's own data-door, form or fetch" });
  for (const t of an.twins) edge(doorIdOf(`MCP ${t.tool.name}`), doorIdOf(t.row.key), "depends", "twin", { by: t.by, readFunction: t.shared.map((k) => `src/${k}`) });
  for (const d of out.doors.values()) {
    for (const t of d.tb.read) edge(d.id, nodeId("table", t), "reads", null, { by: "scan", in: `src/${d.tb.where[`r:${t}`]}`.replace("src/the handler", d.data.handler || "the handler") });
    for (const t of d.tb.write) edge(d.id, nodeId("table", t), "writes", null, { by: "scan", in: `src/${d.tb.where[`w:${t}`]}`.replace("src/the handler", d.data.handler || "the handler") });
  }
  // the tables' foreign keys (boot.sql): a relation each, as the Data view draws them (derived fk); a second key to the same
  // table folds into the first's data.also
  for (const t of scan.tables.values()) for (const c of t.cols) {
    const to = c.ref ? c.ref.split(".")[0] : null;
    if (!to || !scan.tables.has(to) || to === t.name) continue;
    const k = `${nodeId("table", t.name)}|${nodeId("table", to)}|relation`;
    if (out.edges.has(k)) { (out.edges.get(k).data.also ||= []).push({ label: c.name, col: c.name, ref: c.ref, derived: "fk" }); continue; }
    edge(nodeId("table", t.name), nodeId("table", to), "relation", c.name, { fromTable: t.name, toTable: to, col: c.name, ref: c.ref, derived: "fk", by: "engine/boot.sql" });
  }
  for (const t of [...plumbRead].sort()) edge(surfaceId, nodeId("table", t), "reads", "every request", { by: "scan", in: "the router and the page shell (src/index.js routeRequest, servePage)" });
  // a table no code reads or writes is a gap the code shows
  const touched = new Set([...out.edges.values()].filter((e) => e.kind === "reads" || e.kind === "writes").map((e) => e.to.replace(/^table:/, "")));
  for (const t of scan.tables.values()) if (!touched.has(t.name) && !trigWritten.has(t.name)) out.gaps.push({ id: nodeId("gap", `unused-table:${t.name}`), type: "gap", name: `unused-table:${t.name}`, status: "open",
    data: { what: `engine/boot.sql creates the table ${t.name} and no code reads or writes it`, class: "unknowns", affects: [nodeId("table", t.name)], from: "code" } });
  // the architecture's services: what reaches each (code-model/model.json services; the nodes are the architecture overlay's)
  const svc = model.services || {};
  const svcIds = new Set();
  const svcFile = svc.file ? join(scan.root, "engine", svc.file) : null;
  if (svcFile && isFile(svcFile)) {
    const arch = JSON.parse(readFileSync(svcFile, "utf8"));
    for (const o of arr(arch.ops || arch)) if (o.kind === "node" && o.data && o.data.type === "service") svcIds.add(o.data.id);
    out.archFile = svcFile;
    out.archIds = arr(arch.ops || arch).filter((o) => o.kind === "node" && o.data && o.data.type === "architecture").map((o) => o.data.id);
  }
  const sid = (k) => (k && svcIds.has(`service:${k}`) ? `service:${k}` : null);
  out.services = [];
  const link = (from, k, label, data) => { const to = sid(k); if (!to) return; if (!out.services.includes(to)) out.services.push(to); edge(from, to, "depends", label, { by: "code", ...data }); };
  link(surfaceId, svc.app, "runs on", { what: "the one worker serves the app (engine/wrangler.jsonc main)" });
  for (const t of out.tables) link(t.id, svc.tables, "lives in", { what: "binding DB (engine/boot.sql)" });
  for (const d of out.doors.values()) {
    const c = d.row ? d.row.closure : d.tool ? d.tool.closure : null;
    if (!c) continue;
    for (const b of c.marks.bindings) if ((svc.bindings || {})[b]) link(d.id, svc.bindings[b], `uses ${b}`, { what: `env.${b}` });
    for (const h of c.marks.hosts) if ((svc.hosts || {})[h]) link(d.id, svc.hosts[h], `calls ${h}`, { what: `https://${h}/` });
  }
  const mcpRow = an.rows.find(isTransport);
  if (mcpRow) { link(doorIdOf(mcpRow.key), svc.mcpClients, "its clients", { what: "the MCP door's clients connect here (src/mcp.js handleMcp)" }); if (scan.files.has(join(scan.srcDir, "oauth.js")) && /OAUTH_KV|OAuthProvider/.test(scan.files.get(join(scan.srcDir, "oauth.js")).src)) link(doorIdOf(mcpRow.key), (svc.bindings || {}).OAUTH_KV, "OAuth grants", { what: "src/oauth.js buildEntry: the OAuth provider keeps its grants in KV" }); }
  for (const sc of list) for (const href of sc.links) {
    const to = screenByRoute(href);
    if (to && to !== sc) edge(sc.id, to.id, "nav", null, { by: "code", href });
  }

  // ---- the flows (code-model/model.json), each step resolved to the true screen and door ----
  const flowsCfg = arr(model.flows && model.flows.list);
  for (const f of flowsCfg) {
    const fid = nodeId("flow", f.id);
    const steps = [];
    const refs = new Set([fid]);
    for (const [i, st] of arr(f.steps).entries()) {
      const s0 = { actor: st.actor, does: st.does };
      if (st.screen) {
        const sc = screenByRoute(st.screen);
        if (sc) { s0.screen = sc.id.replace(/^screen:/, ""); s0.on = sc.name; refs.add(sc.id); edge(fid, sc.id, "flow-step", null, { steps: [{ i }] }); }
        else r.note("node", `a flow step names a screen the code does not serve (${f.id} step ${i + 1}: ${st.screen}) — the step keeps its words, unlinked`);
      }
      if (st.door) {
        const row = rowByKey.get(st.door);
        const tw = row && twinOfRow.get(row.key);
        const key = st.mcp ? (tw ? `MCP ${tw.tool.name}` : null) : row ? row.key : null;
        if (key) { s0.door = key; refs.add(doorIdOf(key)); edge(fid, doorIdOf(key), "flow-step", null, { steps: [{ i }] }); }
        else r.note("node", `a flow step names a door the code does not serve${st.mcp ? " (or no MCP twin of it)" : ""} (${f.id} step ${i + 1}: ${st.door}) — the step keeps its words, unlinked`);
      }
      steps.push(s0);
    }
    out.flows.push({ id: fid, type: "flow", name: f.name, status: "live", data: { desc: f.desc, audience: f.audience, steps, from: "tools/import/code-model/model.json" }, refs: [...refs] });
  }

  // ---- the gaps the code shows ----
  const gap = (slug, what, cls, affects) => out.gaps.push({ id: nodeId("gap", slug), type: "gap", name: slug, status: "open", data: { what, class: cls, affects, from: "code" } });
  for (const f of an.findings.filter((x) => x.kind === "no-handler")) gap(`unserved:${f.ref}`, f.note, "missingLinks", [doorIdOf(f.ref)]);
  for (const sc of list) if (sc.closure.marks.r2serve) gap(`old-path:${sc.id.replace(/^screen:/, "")}`, `${sc.name} (${sc.route}) still reads the old served files (R2 serve/**), which a project filed through the door does not have`, "unknowns", [sc.id]);
  // declared regions nothing draws: the contract's own region lists against what every renderer emits
  const emitted = new Set();
  for (const f of scan.files.values()) for (const st of f.strings) { for (const m of st.text.matchAll(/data-region="([a-z][a-z0-9-]*)"/g)) emitted.add(m[1]); }
  for (const f of scan.files.values()) for (const m of f.src.matchAll(/\bregion:\s*"([a-z][a-z0-9-]*)"/g)) emitted.add(m[1]);
  const declared = [];
  const walk = (v, at) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "regions" && x && typeof x === "object") for (const n of Array.isArray(x) ? x : Object.keys(x)) if (typeof n === "string" && /^[a-z][a-z0-9-]*$/.test(n)) declared.push({ n, at: `${at}.regions` }); walk(x, `${at}.${k}`); } };
  for (const [k, v] of Object.entries(scan.door)) if (!["rest", "tools", "errors"].includes(k)) walk(v, k);
  const seenR = new Set();
  for (const d of declared) if (!emitted.has(d.n) && !seenR.has(d.n)) { seenR.add(d.n); gap(`region:${d.n}`, `the contract declares the region "${d.n}" (contracts/door.json ${d.at}) and no renderer draws it`, "ambiguities", []); }
  for (const g of out.gaps) for (const a of g.data.affects) edge(g.id, a, "blocks", null, { by: "code" });

  // ---- the checks: what an agent holding only the door can observe ----
  // D2b item 8: the goal each check proves (code-model/model.json goals): a screen's and a rail's by the lane, a door's by the
  // lanes of the screens that call it, a flow's walk by the flow; added to the check's refs (Goals counts a check on a goal
  // whose id its refs name)
  const GM = model.goals || {}, laneGoals = (k) => arr((GM.lanes || {})[k]), flowGoals = (k) => arr((GM.flows || {})[k]);
  const laneOfScreen = new Map(list.map((x) => [x.id, x.lane]));
  const goalsOfRefs = (refs) => {
    const g = [];
    for (const ref of arr(refs)) {
      if (/^lane:/.test(ref)) g.push(...laneGoals(ref.slice(5)));
      else if (/^screen:/.test(ref)) g.push(...laneGoals(laneOfScreen.get(ref)));
      else if (/^flow:/.test(ref)) g.push(...flowGoals(ref.slice(5)));
      else if (/^door:/.test(ref)) { const d = out.doors.get(ref); for (const s of arr(d && d.data && d.data.screens)) g.push(...laneGoals(laneOfScreen.get(`screen:${s}`))); }
    }
    return uniq(g);
  };
  const check = (id, c) => out.checks.push({ id, sourceType: "code", status: "live", severity: c.severity || "normal", rulings: [], ...c, refs: uniq([...arr(c.refs), ...goalsOfRefs(c.refs)]) });
  const sample2 = (p) => p.replace(/:([a-z]+)/gi, "<$1>");
  for (const d of out.doors.values()) {
    if (d.row) {
      const row = d.row, a = row.anon;
      const who = WHO[row.auth] || row.auth;
      let then;
      if (!a) then = isTransport(row) && model.mcpAnonymous ? model.mcpAnonymous.words : null;
      else if (a.open) then = row.redirectOnly ? `it answers 302 to ${row.redirectTo || "its new place"} with no credential`
        : row.method === "GET" ? "it answers with no credential: no 401, no 403, no redirect to sign-in" : "it takes a call with no credential: no redirect to sign-in (its own refusal of a bad body aside)";
      else if (a.browser && a.via === "form") then = `a JSON body gets ${a.status}${a.error ? ` {"error":"${a.error}"}` : ""}; a form post (Content-Type: application/x-www-form-urlencoded) gets ${a.browser} to ${a.to}?next=…`;
      else if (a.browser) then = `a script (Accept: application/json, no Sec-Fetch-Dest) gets ${a.status}${a.error ? ` {"error":"${a.error}"}` : ""}; a browser navigation (Accept: text/html) gets ${a.browser} to ${a.to}?next=…`;
      else then = a.status === 302 ? `it answers 302 to ${a.to}?next=… (a script and a browser alike)` : `it answers ${a.status}${a.error ? ` {"error":"${a.error}"}` : ""}`;
      if (then) {
        const kOnly = row.auth === "key" && /searchParams\.get\(\s*"k"\s*\)/.test(row.info.raw) && !/authorization/i.test(row.info.raw);
        const admit = row.auth === "none" || row.redirectOnly ? "" : row.auth === "session" ? `; a signed-in same-origin browser session is let through, a bearer key is refused 403`
          : kOnly ? `; the same call with the owner's key as ?k= is let through (a bearer header is not read here)` : `; the same call with the owner's key is let through (no 401, no redirect to sign-in)`;
        check(`${d.id}.access`, { kind: "access", method: "observe", title: `${row.key} admits ${who}${row.auth === "none" ? "" : " and refuses a call with no credential"}`,
          given: "no credential: no Authorization header, no session cookie, no ?k= key", when: `${row.method} ${sample2(row.path)}`, then: then + admit,
          sourceId: `contracts/door.json rest ${row.key} · ${(a && a.by) || (isTransport(row) ? "src/oauth.js buildEntry" : "the router")}`, refs: [d.id] });
      } else r.note("check", `a door whose signed-out answer the code does not show plainly (no access check): ${row.key}`);
      // the JSON shape its registry declares
      if (!row.redirectOnly && row.method === "GET") {
        const fields = declaredFields(row.does);
        if (fields.length >= 2) {
          const tw = twinOfRow.get(row.key);
          check(`${d.id}.shape`, { kind: "shape", method: "observe", title: tw ? `${row.key} and MCP \`${tw.tool.name}\` answer the fields the registry declares` : `${row.key} answers the fields the registry declares`,
            given: "the owner's key, on a project that holds data", when: `${row.method} ${sample2(row.path)} with Accept: application/json${tw ? `, and tools/call ${tw.tool.name} with the same arguments` : ""}`,
            then: `the JSON carries the top-level fields ${fields.join(", ")}${tw ? `; the tool's text answer parses to an object with the same fields` : ""}`,
            sourceId: `contracts/door.json rest ${row.key}`, refs: tw ? [d.id, doorIdOf(`MCP ${tw.tool.name}`)] : [d.id] });
        }
      }
      if (row.method === "POST" && !isTransport(row)) {
        const e = declaredError(row.does, true), all = declaredErrors(row.does, true);
        if (e) check(`${d.id}.refuses`, { kind: "refusal", method: "observe", title: `${row.key} refuses a body it cannot take with an error its registry declares`,
          given: row.auth === "session" ? "the owner signed in: the session cookie from POST /login, sent with this origin's Origin header" : "the owner's key",
          when: `${row.method} ${sample2(row.path)} with an empty JSON body {}`, then: `it answers a 4xx whose error is one its registry declares (${all.join(", ")}) and files nothing`,
          sourceId: `contracts/door.json rest ${row.key}`, refs: [d.id] });
        else r.note("check", "a write door whose registry declares no error for a body it cannot take (no refusal check)");
      }
    } else {
      const t = d.tool, mc = model.mcpAnonymous || {};
      check(`${d.id}.access`, { kind: "access", method: "observe", title: `MCP \`${t.name}\` admits ${t.owner ? "the owner only" : "any seated member"} and refuses a call with no credential`,
        given: "no credential", when: `POST /mcp {"method":"tools/call","params":{"name":"${t.name}"}} with no Authorization header`,
        then: `${mc.words || "it is refused"}${t.owner ? `; a seated member's key gets the tool answer {"error":"owner_only"} (isError true)` : "; the owner's key is let through"}`,
        sourceId: `src/mcp.js callTool · src/oauth.js buildEntry`, refs: [d.id] });
      if (t.write) {
        const all = declaredErrors(t.description, false);
        if (all.length) check(`${d.id}.refuses`, { kind: "refusal", method: "observe", title: `MCP \`${t.name}\` refuses arguments it cannot take with an error its description declares`,
          given: "the owner's key", when: `tools/call ${t.name} with arguments {}`, then: `the answer is an error its description declares (${all.join(", ")}), isError true, and nothing is filed`,
          sourceId: `contracts/door.json tools ${t.name}`, refs: [d.id] });
        else r.note("check", "a write tool whose description declares no error for arguments it cannot take (no refusal check)");
      }
    }
  }
  const planeRegions = litOf("mapplanes.js#PLANE_REGIONS") || {};
  for (const sc of list) {
    // a view of a page with several views shares one handler's closure: it claims only the regions the code declares for it
    let regions = sc.shared ? arr(planeRegions[sc.view]) : [...sc.closure.marks.regions].sort();
    regions = regions.filter((x) => !/\$\{/.test(x));
    sc.regions = regions;
    // claimed: the regions every load draws; the ones drawn only when there is something to draw are named apart
    const own = new Set();
    for (const k of sc.closure.decls) { const d = scan.index.get(k); if (d && sc.ds && d.marks.screens.has(sc.ds)) for (const x of d.marks.always) own.add(x); }
    if (!sc.ds) for (const row of sc.rows) for (const k of row.pageInfo.refs) { const d = scan.index.get(k); if (d && /#render[A-Z]/.test(k)) for (const x of d.marks.always) own.add(x); }
    const maybe = sc.shared ? [] : regions.filter((x) => !own.has(x));
    const always = regions.filter((x) => !maybe.includes(x));
    // a page whose handler sends some readers on (a 302 that is not the sign-in's): its own rule, said
    const sendsOn = sc.rows.some((x) => { const ls = x.pageInfo.raw.split("\n"); return ls.some((l, i) => /\bstatus:\s*302\b|Response\.redirect\(/.test(l) && /\bif\s*\(.*\b(reader|seats?|person|isOwner|owner|role)\b/i.test(`${ls[i - 1] || ""} ${l}`)); });
    // a page that needs a query to draw (its registry names it, its handler answers 400 without it)
    const q = sc.rows.map((x) => /\b400\b/.test(x.pageInfo.raw) && /\?([a-z]+)=<[^>]+>/.exec(x.does)).find(Boolean);
    // …or a page drawn only when its branch has a query (`if (path === "/read" && wantsHtml(request) && p.get("ref"))`: the card's
    // page): the query and the value form its registry row gives last (the `does` of GET /read names ?ref=card/<kind>/<id> as
    // the card's own page, after the JSON forms)
    const qNeed = q ? null : sc.rows.map((x) => {
      const l = String(x.pageInfo.raw).split("\n").find((s) => /\bif\s*\(/.test(s) && /\bwantsHtml\(/.test(s) && /\.get\(\s*"[a-z]+"\s*\)/.test(s));
      const n = l && /\.get\(\s*"([a-z]+)"\s*\)/.exec(l);
      if (!n) return null;
      const forms = [...String(x.does).matchAll(new RegExp(`\\?${n[1]}=([^\\s,;|)]+)`, "g"))];
      return forms.length ? [n[1], forms[forms.length - 1][1]] : null;
    }).find(Boolean);
    sc.buttons = [...sc.closure.marks.buttons].sort();
    const laneId = nodeId("lane", sc.lane);
    // D2b item 8: an old-path page (it reads the old served files, or code-model/model.json oldPath names its route) gets no
    // check: one could only say "200 HTML" and passes while the page shows an error body. Sprint 4 deletes these pages.
    if (sc.closure.marks.r2serve || arr((model.oldPath || {}).routes).includes(sc.route)) { r.note("check", "an old-path page: no load check (sprint 4 deletes it)"); continue; }
    check(`${sc.id}.loads`, { kind: "screen", method: "observe", title: `${sc.name} (${sc.route}) loads for a signed-in reader and carries its regions`,
      given: "the owner signed in (the session cookie from POST /login), on a project that holds data", when: `GET ${sample2(sc.route)}${q ? `?${q[1]}=<${q[0].slice(q[0].indexOf("<") + 1, -1)}>` : qNeed ? `?${qNeed[0]}=${qNeed[1]}` : ""} with Accept: text/html${sc.route.includes(":") ? " (an id this project holds)" : ""}`,
      then: `200 HTML${sc.ds ? ` holding data-screen="${sc.ds}"` : ""}${always.length ? `${sc.ds ? " and" : " holding"} the regions ${always.map((x) => `data-region="${x}"`).join(", ")}` : ""}${maybe.length ? `; when it has them, also ${maybe.map((x) => `data-region="${x}"`).join(", ")}` : ""}${sendsOn ? "; a reader the page's own rule sends on gets that 302 instead" : ""}`,
      sourceId: `${sc.rows.map((x) => x.key).join(" · ")} · ${where(sc.rows[0].pageRoute)}`, refs: [sc.id, laneId, ...(sc.view === "arch" ? arr(out.archIds) : [])] });
  }
  for (const l of lanes.filter((x) => x.tab)) check(`${nodeId("lane", l.key)}.rail`, { kind: "rail", method: "observe", title: `The rail draws the ${l.label} tab`,
    given: "the owner signed in", when: "any signed-in page (GET /home with Accept: text/html)", then: `the rail links ${l.href} labelled "${l.label}"`,
    sourceId: "src/shell.js TABS", refs: [nodeId("lane", l.key), surfaceId] });
  for (const f of out.flows) check(`${f.id}.walk`, { kind: "flow", method: "walk", title: `${f.name}: walked end to end`, severity: "high",
    given: "a member's Claude connected with the member's own key, on a throwaway project", when: f.data.steps.map((s, i) => `${i + 1}. ${s.actor} ${s.does}${s.door ? ` (${s.door})` : ""}${s.on ? `, on ${s.on}` : ""}`).join("; "),
    then: "every step answers as it says and the last one shows the result", sourceId: "tools/import/code-model/model.json flows", refs: f.refs });

  // ---- the renders: the kit's wireframe spec, each on the true screen (code-model/model.json wireframes) ----
  const wf = model.wireframes || {};
  if (opts.wireframes) {
    for (const sp of arr(opts.wireframes.screens)) {
      r.count("render");
      const map = wf[sp.id];
      const sc = map && screenByRoute(map.route);
      if (!sc) { r.skip("render", map ? `its route ${map.route} is no screen the code serves` : "a spec screen code-model/model.json does not place", sp.id); continue; }
      if (map.state && !sc.states.includes(map.state)) { r.skip("render", `its state ${map.state} is no state of ${sc.id}`, sp.id); continue; }
      const body = wireframeFromRegions({ id: sp.id, name: sp.name, regions: sp.regions, buttons: sp.buttons });
      if (!body) { r.skip("render", "a spec screen with no regions or buttons to draw", sp.id); continue; }
      r.add("render", { screen: sc.id, state: map.state || "", variant: "wireframe", format: "wireframe", body });
    }
    r.from = opts.wireframes.from;
  } else r.notImported.push({ what: "the kit's wireframe spec", why: "no --renders <wireframe.json> named: the screens carry the wireframe the code's own regions draw, no spec render" });

  // ---- the ops ----
  r.add("node", { id: surfaceId, type: "surface", name: app.name, status: "live", data: { from: "tools/import/code-model/model.json", lanes: lanes.map((l) => l.key) } });
  r.count("node");
  for (const [i, l] of lanes.entries()) { r.count("node"); r.add("node", { id: nodeId("lane", l.key), type: "lane", name: l.label, status: "live", data: { surface: app.key, order: i + 1, ...(l.href ? { href: l.href } : {}), from: l.tab ? "src/shell.js TABS" : "tools/import/code-model/model.json" } }); }
  for (const sc of list) {
    r.count("node");
    const data = { surface: app.key, lane: sc.lane, step: sc.step, route: sc.route, routes: uniq(sc.rows.map((x) => x.path)), pageKey: sc.key,
      ...(sc.ds ? { dataScreen: sc.ds } : {}), ...(sc.view ? { view: sc.view } : {}), regions: sc.regions, ...(sc.buttons.length ? { buttons: sc.buttons } : {}),
      ...(sc.states.length ? { states: sc.states, stateRoutes: sc.stateRoutes } : {}), servedBy: sc.rows.map((x) => x.key), from: "code" };
    const wfb = wireframeFromRegions({ id: sc.id, name: sc.name, regions: sc.regions, buttons: sc.buttons });
    if (wfb) data.wireframe = wfb;
    r.add("node", { id: sc.id, type: "screen", name: sc.name, status: "live", data });
  }
  for (const d of out.doors.values()) { r.count("node"); r.add("node", { id: d.id, type: "door", name: d.name, status: d.status, data: d.data }); }
  for (const t of out.tables) { r.count("node"); r.add("node", { id: t.id, type: t.type, name: t.name, status: t.status, data: t.data }); }
  for (const f of out.flows) { r.count("node"); r.add("node", { id: f.id, type: f.type, name: f.name, status: f.status, data: f.data }); }
  for (const g of out.gaps) { r.count("node"); r.add("node", { id: g.id, type: g.type, name: g.name, status: g.status, data: g.data }); }
  // the services an edge names: a bare node each (id, type, name), which the architecture overlay merges onto
  for (const id of out.services || []) { r.count("node"); r.add("node", { id, type: "service", name: id.replace(/^service:/, "") }); }
  for (const e of out.edges.values()) { r.count("edge"); r.add("edge", e); }
  for (const c of out.checks) { r.count("check"); r.add("check", c); }
  r.out = out;
  return r;
}

// ======================================================================================================================
// 8. the layout's entry: readCode(dir, { renders }) -> the source object import-brain.mjs files (its ops prebuilt)
export const CODE_MODEL = join(HERE, "code-model", "model.json");
export function readCode(dirIn, opts = {}) {
  const dir = resolve(dirIn);
  if (!isCodeDir(dir)) throw new Error(`${dir}: not a checkout of this repo (needs engine/src/index.js, engine/boot.sql and contracts/door.json)`);
  const model = JSON.parse(readFileSync(opts.model || CODE_MODEL, "utf8"));
  const scan = scanCode(dir);
  const an = analyse(scan, model);
  let wireframes = null;
  if (opts.renders) {
    const p = resolve(opts.renders);
    if (!isFile(p)) throw new Error(`--renders ${opts.renders}: not a file (the code layout takes the kit's wireframe spec, wireframe.json)`);
    const spec = JSON.parse(readFileSync(p, "utf8"));
    if (!Array.isArray(spec.screens)) throw new Error(`--renders ${opts.renders}: no screens[] (the kit's wireframe spec)`);
    wireframes = { from: p, screens: spec.screens };
  }
  const b = buildCodeOps(scan, an, model, { wireframes });
  const notImported = [
    { what: "the old brain (its questions, cards, capsules, evidence, agent flows and checks)", why: "the code layout files sharingu's model and checks from this repo's code; the aim, goals, rulings and docs come from the overlays" },
    ...b.notImported,
  ];
  const sourceOf = { ...b.source };
  const built = { ops: b.ops, skips: b.skips, notes: b.notes, notImported, sourceOf,
    renders: { from: b.from || null, byFormat: { html: 0, wireframe: b.ops.filter((o) => o.kind === "render").length, image: 0 },
      bytes: b.ops.filter((o) => o.kind === "render").reduce((n, o) => n + Buffer.byteLength(JSON.stringify(o.data.body)), 0) } };
  return { layout: "code", dir, brainKey: null, board: null, built, notImported, scan, analysis: an, model: b.out };
}
