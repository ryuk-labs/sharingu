#!/usr/bin/env python3
"""make-door-contract.py — contracts/door.json: the door's contract (MCP + REST shapes) as one file (M-ADR-038).
DERIVED half from the engine's own registries in src/index.js — the MCP tool list (name + description) and the
REST capability rows (method · path · auth · does) — never typed; DECLARED half merged from contracts/door.declared.json
(receipt fields, the eval-mark rule, run-results, gate steps, error meanings, refusal classes). Idempotent;
the gate regenerates and diffs (drift = red). A reader asserts its contract test against this file instead of parsing
index.js.

Cross-checked, not just merged (door-true batch, 2026-09-21 — B1's verifier refusal, recorded in the run ledger):
a declared shape that names a route or tool the live registries no longer carry is a STALE declaration, not a typo
worth shipping quietly — this generator FAILS on one, naming it, rather than merging it in as if it still held.
Same discipline for the door's error vocabulary (Q5EB6ACE0): a code the engine can actually return with no declared
meaning FAILS generation too — the door cannot ship blank again the way tool descriptions did (QFE3B074B)."""
import re, json, os, sys, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# contracts/ is the SHARED lane (M-ADR-038): beside the engine today (<engine>/contracts), at the monorepo root
# once the engine lives at sharingu/engine/ (<engine>/../contracts). One rule, the same in every reader
# (this file · tools/handoff-selftest.mjs · gate.sh): AGENT_R_CONTRACTS → ./contracts if it exists → ../contracts.
CONTRACTS = os.environ.get('AGENT_R_CONTRACTS') or (os.path.join(ROOT, 'contracts') if os.path.isdir(os.path.join(ROOT, 'contracts')) else os.path.join(ROOT, '..', 'contracts'))
SRC_DIR = os.path.join(ROOT, 'src')
# UI-B8a (QFAEA20A3): the worker serves this contract itself (GET /contract) from src/doorcontract.js, written right after
# door.json in the same run (never hand-edited; gate.sh diffs both)
DOORCONTRACT = 'doorcontract.js'
src = open(os.path.join(ROOT, 'src', 'index.js'), encoding='utf-8').read()

# ---- tools (MCP_TOOLS) ------------------------------------------------------------------
tools = []
for m in re.finditer(r'^\s*\{\s*name:"([^"]+)"(.*)$', src, re.M):
    name, rest = m.group(1), m.group(2)
    # QFE3B074B: the registry writes `desc:"…"`, not `description:"…"` — the old regex here
    # never matched, so every tools[].description shipped empty (GAP-door-json-tool-desc-blank).
    d = re.search(r'desc:"((?:[^"\\]|\\.)*)"', rest)
    # U-MCP D10 (Q0D506BBC): `project` — the row's first-line flag (beside owner/write): the tool reads the project the caller
    # names (`project`, checked against their seats: contracts/door.declared.json projectScope), true|false for every tool
    ti = re.search(r'\btitle:"((?:[^"\\]|\\.)*)"', rest)
    flag = lambda f: bool(re.search(r'\b' + f + r':\s*true', rest))
    t = {"name": name, "title": (ti.group(1) if ti else ""), "description": (d.group(1) if d else "").strip(),
         "owner": flag("owner"), "write": flag("write"), "project": flag("project")}
    # D5: the MCP annotations, DERIVED from the row exactly as src/mcp.js annotationsOf derives them (tools/annotations-selftest.mjs
    # holds the two equal): read-only = no write flag and no `stores`; the other three are the row's own flags
    ro = not t["write"] and not flag("stores")
    t["annotations"] = {"title": t["title"], "readOnlyHint": ro, "destructiveHint": False if ro else flag("destructive"),
                        "idempotentHint": True if ro else flag("idempotent"), "openWorldHint": flag("openWorld")}
    tools.append(t)

# ---- rest (CAPABILITIES) ----------------------------------------------------------------
rest_rows = []
for m in re.finditer(r'\{\s*m:"(\w+)",\s*p:"([^"]+)",\s*auth:"([^"]+)",\s*does:"((?:[^"\\]|\\.)*)"', src):
    rest_rows.append({"method": m.group(1), "path": m.group(2), "auth": m.group(3), "does": m.group(4).strip()})

if not tools or not rest_rows:
    print("✗ registry parse found nothing — index.js changed shape", file=sys.stderr); sys.exit(1)

# Q939178BC: the refusal vocabulary collapses to a small, closed set (not-authenticated ·
# not-allowed · not-found, contracts/door.declared.json refusalClasses) — `refusals` here is
# WHICH of those a door's own auth policy can produce, derived mechanically from data this
# generator already parsed (auth/owner/write), never from reading a route's control flow.
REFUSAL_BY_AUTH = {"none": [], "reader": ["not-authenticated"], "bearer": ["not-authenticated"],
                   "key": ["not-authenticated"], "owner": ["not-authenticated", "not-allowed"],
                   # UI-B11a: a session-only door (Publish, Equip) refuses every non-session credential (403 human_verb)
                   "session": ["not-authenticated", "not-allowed"]}
for r in rest_rows:
    r["refusals"] = REFUSAL_BY_AUTH.get(r["auth"], [])
for t in tools:
    # every MCP tool call requires a resolved bearer identity BEFORE dispatch (src/mcp.js
    # handleMcp: `if (!who) return rpcErr(...)`) — not-authenticated is universal here.
    refusals = ["not-authenticated"]
    if t["owner"] or t["write"] or t["project"]:
        refusals.append("not-allowed")   # owner_only, insufficient_scope on a read-only OAuth grant, or project_forbidden (U-MCP D10)
    t["refusals"] = refusals

# QFE3B074B (permanent guard, not a one-time fix): a tool with no description is exactly the
# bug this row fixed — fail loudly instead of shipping blank again.
empty_desc = sorted(t["name"] for t in tools if not t["description"] or not t["title"])
if empty_desc:
    print("✗ tool(s) with an empty description or no title — fix the desc: or title: field in src/index.js: " + ", ".join(empty_desc), file=sys.stderr)
    sys.exit(1)

declared = json.load(open(os.path.join(CONTRACTS, 'door.declared.json'), encoding='utf-8'))
declared.pop('_doc', None)

# ---- cross-check: a declared shape must name a route/tool that still lives (hardening,
# door-true batch — B1's verifier refusal) --------------------------------------------------
tool_names = {t["name"] for t in tools}
rest_keys = {r["method"] + " " + r["path"] for r in rest_rows}

def find_doors(obj, path):
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            npath = f"{path}.{k}" if path else k
            if k == "doors" and isinstance(v, list):
                found.extend((npath, d) for d in v if isinstance(d, str))
            else:
                found.extend(find_doors(v, npath))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            found.extend(find_doors(v, f"{path}[{i}]"))
    return found

stale_doors = []
for loc, d in find_doors(declared, ""):
    is_route = bool(re.match(r'^[A-Z]+ /', d))
    if is_route and d not in rest_keys: stale_doors.append((loc, d))
    elif not is_route and d not in tool_names: stale_doors.append((loc, d))
if stale_doors:
    print("✗ contracts/door.declared.json names a route/tool the live registry no longer carries:", file=sys.stderr)
    for loc, d in stale_doors:
        print(f"    {loc}: {d!r}", file=sys.stderr)
    sys.exit(1)

# ---- Q5EB6ACE0: every error code the engine can actually return must carry a declared
# meaning + nextAction — cross-checked against the live population, not remembered ---------
# [A-Za-z][A-Za-z0-9_]* (not just [a-z_]+): the narrower class was blind to d1_quota
# (a digit) and checkId_required (mixed case) — both live, reachable, undeclared until
# this fix (verifier refusal, door-true batch). Same lesson as check-mcp-parity.py's own
# [a-z/:-] widening for /backup-dump: a class too narrow to match a real spelling is
# silently exempt, which defeats the guard rather than passing it honestly.
error_re = re.compile(r'error:\s*"([A-Za-z][A-Za-z0-9_]*)"')
code_files = {}
# src/*.js and the modules one folder down (src/knowledge/*.js), each named by its path under src/
src_files = sorted(os.path.relpath(os.path.join(d, f), SRC_DIR) for d, _, fs in os.walk(SRC_DIR) for f in fs if f.endswith('.js'))
for fn in src_files:
    if fn == DOORCONTRACT: continue   # the generated contract module quotes this file: never a source of codes
    text_ = open(os.path.join(SRC_DIR, fn), encoding='utf-8').read()
    for mm in error_re.finditer(text_):
        code_files.setdefault(mm.group(1), set()).add(fn)
live_codes = set(code_files)
declared_errors = {k: v for k, v in declared.get('errors', {}).items() if k != '_doc'}
missing_meaning = sorted(c for c in live_codes if c not in declared_errors)
if missing_meaning:
    print("✗ error code(s) returned by engine/src with no declared meaning in contracts/door.declared.json errors: " + ", ".join(missing_meaning), file=sys.stderr)
    sys.exit(1)
refusal_classes = set(declared.get('refusalClasses', {}).keys())
bad_class = sorted(c for c, meta in declared_errors.items() if meta.get('class') and meta['class'] not in refusal_classes)
if bad_class:
    print("✗ error code(s) declare a class outside refusalClasses: " + ", ".join(bad_class), file=sys.stderr)
    sys.exit(1)
errors_out = {"_doc": declared.get('errors', {}).get('_doc', '')}
errors_out.update({code: {**meta, "files": sorted(code_files.get(code, [])), "live": code in live_codes}
                    for code, meta in declared_errors.items()})

# ---- formats (sprint 3, B1): the knowledge kinds and the contribution shapes, GENERATED from the two registries
# (src/knowledge/schema.js KINDS, src/shapes.js SHAPES) through src/formats.js — the same answers the `formats` tool and GET
# /formats give, so a field, its hint, an example or a place is typed once, in the registry, never here or in the declared
# half. tools/formats-dump.mjs prints them.
try:
    formats = json.loads(subprocess.run(["node", os.path.join(ROOT, "tools", "formats-dump.mjs")], check=True, capture_output=True, text=True).stdout)
except Exception as e:
    print(f"✗ tools/formats-dump.mjs failed — the registries did not load: {e}", file=sys.stderr); sys.exit(1)
if not formats.get("kinds") or not formats.get("shapes"):
    print("✗ tools/formats-dump.mjs answered no kinds or no shapes", file=sys.stderr); sys.exit(1)
formats_out = {"_doc": "GENERATED from the registries (src/knowledge/schema.js KINDS, src/shapes.js SHAPES) by src/formats.js: "
               "the `formats` tool and GET /formats answer the same. list: every kind and shape in a line; kinds.<kind>: its fields, "
               "rules, example, where it shows, its checklist items; shapes.<lane>: a contribution's fields, example and places.",
               **formats}

# ---- the capability inventory (D5, docs/plan/MCP.md §9 demand 9): GENERATED here from the two registries and the declared
# refusal classes, served by GET /capabilities (src/index.js) from src/doorcontract.js: every tool with its title, read or write,
# who may call it, whether it reads a named project and how it fails; every route with who may call it and how it fails ----
WHO_TOOL = lambda t: ("the owner" if t["owner"] else "anyone signed in") + ("" if not t["write"] else ", with a key or grant that may write")
WHO_ROUTE = {"none": "anyone", "reader": "anyone signed in (a key or a session)", "bearer": "anyone signed in (a key or a session)",
             "key": "anyone with a key", "owner": "the owner", "session": "a signed-in browser"}
inventory = {
    "_doc": "GENERATED by tools/make-door-contract.py from src/index.js (MCP_TOOLS, CAPABILITIES) and refusalClasses: the capability inventory GET /capabilities serves. Never typed.",
    "note": "Everything this door offers: each tool with its title, whether it reads or writes, who may call it, whether it reads a project you name, and how it fails; each route with who may call it.",
    "tools": [{"name": t["name"], "title": t["title"], "kind": "read" if t["annotations"]["readOnlyHint"] else "write", "who": WHO_TOOL(t),
               "project": t["project"], "annotations": t["annotations"], "fails": t["refusals"]} for t in sorted(tools, key=lambda t: t["name"])],
    "routes": [{"method": r["method"], "path": r["path"], "kind": "read" if r["method"] == "GET" else "write", "who": WHO_ROUTE.get(r["auth"], r["auth"]),
                "fails": r["refusals"]} for r in sorted(rest_rows, key=lambda r: (r["path"], r["method"]))],
    "failures": {k: v for k, v in declared.get("refusalClasses", {}).items() if k != "_doc"},
}

declared_rest = {k: v for k, v in declared.items() if k != 'errors'}
out = {
    "_doc": "GENERATED by tools/make-door-contract.py from src/index.js (tools, rest) + contracts/door.declared.json "
            "(shapes, error meanings, refusal classes). Do not edit; the gate diffs it.",
    "tools": sorted(tools, key=lambda t: t["name"]),
    "rest": sorted(rest_rows, key=lambda r: (r["path"], r["method"])),
    "counts": {"tools": len(tools), "rest": len(rest_rows), "errors": len(declared_errors)},
    **declared_rest,
    "inventory": inventory,
    "formats": formats_out,
    "errors": errors_out,
}
json.dump(out, open(os.path.join(CONTRACTS, 'door.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False, sort_keys=False)
door_text = open(os.path.join(CONTRACTS, 'door.json'), encoding='utf-8').read()
open(os.path.join(SRC_DIR, DOORCONTRACT), 'w', encoding='utf-8').write(
    "// src/doorcontract.js - GENERATED by tools/make-door-contract.py right after contracts/door.json (UI-B8a, QFAEA20A3).\n"
    "// Never hand-edit: the gate regenerates and diffs both. GET /contract serves DOOR_TEXT, door.json byte for byte.\n"
    "// One JS string per line of door.json, joined back with newlines, so a per-line reader of src/ sees door.json's own lines.\n"
    "export const DOOR_TEXT = [\n" + "".join(" " + json.dumps(l, ensure_ascii=False) + ",\n" for l in door_text.split("\n")) + "].join(\"\\n\");\n"
    "export default JSON.parse(DOOR_TEXT);\n")
print(f"{os.path.relpath(os.path.join(CONTRACTS, 'door.json'))} + src/{DOORCONTRACT} · tools={len(tools)} · rest={len(rest_rows)} · errors={len(declared_errors)} · formats={len(formats['kinds'])} kinds, {len(formats['shapes'])} shapes")
