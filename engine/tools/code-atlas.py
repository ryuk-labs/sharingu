#!/usr/bin/env python3
"""code-atlas.py (ADR-098 §2) — the deterministic map of src/*.js.

Purpose: a future agent (or session) opens code-atlas.json FIRST and, from it,
knows which of the 28+ files to actually open for a given symbol / route / D1
query / R2 key — instead of re-reading every file to find out. It is a MAP,
not a mirror: it names locations (file + line), it does not restate logic.

Regenerate: python3 tools/code-atlas.py > code-atlas.json
Verify (gate.sh does this): the committed code-atlas.json must be byte-identical
to a fresh regeneration — see the "atlas freshness" step in gate.sh.

Deterministic by construction: no timestamps, no wall-clock/PID/random anything,
every list explicitly sorted before serialization, object keys sorted at dump
time (sort_keys=True). Running this twice against the same src/ tree always
produces the same bytes.

Extraction is regex/text-scanning based (same style as check-orphans.py and
check-mcp-parity.py — no new parser dependency), on these five things, per file:
  exports      — export function/async function/const/let/default at column 0
  routes       — path === "/..." and path.startsWith("/.../") literals
  d1Queries    — line + first ~80 chars of SQL text at every db(env).prepare(...) site (the scoped data layer,
                 src/data.js: addressDb(env).prepare(...) too)
  r2Keys       — literal (or literal-with-*-for-the-dynamic-part) keys at every
                 env.BRAIN.get(...) site; a call whose argument is a bare
                 variable/property with no literal text at all is skipped —
                 there is nothing to name
  constants    — top-level (column 0) `const NAME = ...` where NAME looks like a
                 real constant (starts uppercase), plus a one-line "role guess"
                 taken from the // comment line immediately above the declaration
                 (empty string if there is none) — a GUESS: this codebase often
                 stacks several comment paragraphs with no blank line between them,
                 so only the closest line is trusted, not the whole block
  imports      — import {a, b as c} / import Default / import * as ns, from "..."
                 at column 0
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "src")

IMPORT_RE = re.compile(
    r'^import\s+(?:(\{[^}]*\})|(\*\s+as\s+[A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*))\s+from\s+"([^"]+)";?\s*$'
)
EXPORT_FUNC_RE = re.compile(r'^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)')
EXPORT_CONST_RE = re.compile(r'^export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)')
EXPORT_DEFAULT_RE = re.compile(r'^export\s+default\s+(.+?);?\s*$')
CONST_RE = re.compile(r'^(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=')
ROUTE_EXACT_RE = re.compile(r'path\s*===\s*"(/[^"]*)"')
ROUTE_PREFIX_RE = re.compile(r'path\.startsWith\(\s*"(/[^"]*)"\s*\)')
D1_CALL_RE = re.compile(r'\b(?:db|addressDb)\(env\)\.prepare\(')
R2_CALL_RE = re.compile(r'env\.BRAIN\.get\(([^)]*)\)')


def line_of(text, idx):
    return text.count("\n", 0, idx) + 1


def parse_imports(lines):
    out = {}  # from -> set(names)
    for line in lines:
        m = IMPORT_RE.match(line)
        if not m:
            continue
        named, star, default, src = m.groups()
        names = out.setdefault(src, set())
        if named:
            for part in named.strip("{}").split(","):
                part = part.strip()
                if not part:
                    continue
                if " as " in part:
                    part = part.split(" as ", 1)[1].strip()
                names.add(part)
        elif star:
            names.add(star.strip())
        elif default:
            names.add(default.strip())
    entries = [{"from": src, "names": sorted(names)} for src, names in out.items()]
    return sorted(entries, key=lambda x: x["from"])


def parse_exports(lines):
    out = set()
    for line in lines:
        m = EXPORT_FUNC_RE.match(line)
        if m:
            out.add(m.group(1))
            continue
        m = EXPORT_CONST_RE.match(line)
        if m:
            out.add(m.group(1))
            continue
        m = EXPORT_DEFAULT_RE.match(line)
        if m:
            expr = m.group(1).strip()
            ident_m = re.match(r'^[A-Za-z_$][\w$]*$', expr)
            out.add("default = " + (expr if ident_m else expr[:80]))
    return sorted(out)


def parse_routes(text):
    exact = {m.group(1) for m in ROUTE_EXACT_RE.finditer(text)}
    prefix = {m.group(1) for m in ROUTE_PREFIX_RE.finditer(text)}
    routes = [{"pattern": p, "kind": "exact"} for p in exact]
    routes += [{"pattern": p, "kind": "prefix"} for p in prefix]
    return sorted(routes, key=lambda r: (r["pattern"], r["kind"]))


def extract_sql_literal(text, start_idx):
    """Starting right after 'db(env).prepare(', pull the SQL text if the argument
    is a string literal (optionally " +\n  " concatenated across lines — the
    exact pattern this codebase uses for multi-line queries). Returns
    (sql_or_None, is_dynamic, dynamic_expr)."""
    n = len(text)
    i = start_idx
    while i < n and text[i] in " \t\r\n":
        i += 1
    if i >= n or text[i] not in "\"'`":
        # dynamic: capture the bare expression up to the call's closing paren
        j = i
        depth = 0
        while j < n:
            c = text[j]
            if c == "(":
                depth += 1
            elif c == ")":
                if depth == 0:
                    break
                depth -= 1
            j += 1
        return None, True, text[i:j].strip()
    pieces = []
    quote = None
    while i < n and text[i] in "\"'`":
        quote = text[i]
        i += 1
        piece_start = i
        while i < n and text[i] != quote:
            if text[i] == "\\":
                i += 1
            i += 1
        pieces.append(text[piece_start:i])
        i += 1  # skip closing quote
        j = i
        while j < n and text[j] in " \t\r\n":
            j += 1
        if j < n and text[j] == "+":
            j += 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] in "\"'`":
                i = j
                continue
        break
    sql = "".join(pieces)
    sql = re.sub(r"\s+", " ", sql).strip()
    return sql, False, None


def parse_d1_queries(text):
    out = []
    for m in D1_CALL_RE.finditer(text):
        ln = line_of(text, m.start())
        sql, is_dynamic, expr = extract_sql_literal(text, m.end())
        if is_dynamic:
            out.append({"line": ln, "sql": "<dynamic: " + expr[:76] + ">"})
        else:
            out.append({"line": ln, "sql": sql[:80]})
    return sorted(out, key=lambda r: r["line"])


def resolve_r2_key(arg):
    arg = arg.strip()
    if arg.startswith("`") and arg.endswith("`") and len(arg) >= 2:
        return arg[1:-1]
    # top-level "+" split (these call sites never nest parens/backticks in an arg)
    parts = [p.strip() for p in arg.split("+")]
    out = []
    any_literal = False
    for p in parts:
        m = re.match(r'^"([^"]*)"$', p) or re.match(r"^'([^']*)'$", p)
        if m:
            out.append(m.group(1))
            any_literal = True
        else:
            out.append("*")
    if not any_literal:
        return None
    return "".join(out)


def parse_r2_keys(text):
    keys = {}  # key -> set(lines)
    for m in R2_CALL_RE.finditer(text):
        key = resolve_r2_key(m.group(1))
        if key is None:
            continue
        ln = line_of(text, m.start())
        keys.setdefault(key, set()).add(ln)
    return sorted(
        ({"key": k, "lines": sorted(lns)} for k, lns in keys.items()),
        key=lambda r: r["key"],
    )


def parse_constants(text, lines):
    out = []
    for idx, line in enumerate(lines):
        m = CONST_RE.match(line)
        if not m:
            continue
        name = m.group(1)
        ln = idx + 1
        # The line directly above, if it's a // comment: closest context to the
        # declaration. A block comment often documents the function/section that
        # FOLLOWS the const too (this codebase stacks multiple topics with no blank
        # line between them) — the line immediately touching the declaration is the
        # one most likely to actually be about it, not the paragraph's opening line.
        role = ""
        if idx - 1 >= 0 and lines[idx - 1].strip().startswith("//"):
            role = re.sub(r"^//\s?", "", lines[idx - 1].strip()).strip()[:120]
        out.append({"name": name, "line": ln, "role": role})
    return sorted(out, key=lambda r: r["name"])


def build_file_entry(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    lines = text.split("\n")
    return {
        "imports": parse_imports(lines),
        "exports": parse_exports(lines),
        "routes": parse_routes(text),
        "d1Queries": parse_d1_queries(text),
        "r2Keys": parse_r2_keys(text),
        "constants": parse_constants(text, lines),
    }


def main():
    if not os.path.isdir(SRC_DIR):
        print("no src/ dir found at " + SRC_DIR, file=sys.stderr)
        sys.exit(1)
    # src/*.js and the modules one folder down (src/knowledge/*.js), each keyed by its path under src/
    files = sorted(os.path.relpath(os.path.join(d, f), SRC_DIR) for d, _, fs in os.walk(SRC_DIR) for f in fs if f.endswith(".js"))
    atlas = {
        "note": "Generated by tools/code-atlas.py (ADR-098 §2). Deterministic — "
                "regenerate with `python3 tools/code-atlas.py > code-atlas.json`. "
                "A map: file + line, not a mirror of logic.",
        "files": {f: build_file_entry(os.path.join(SRC_DIR, f)) for f in files},
    }
    print(json.dumps(atlas, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
