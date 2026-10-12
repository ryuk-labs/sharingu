#!/usr/bin/env python3
"""tools/ship-plan-migrations.py — which migrate-0NN.sql a database already holds, and each pending one's order rule (S4,
2026-10-02; tools/ship-plan.sh prints it). Read-only, local: it reads the migration files and a SCHEMA, never a database
connection to live.

  python3 tools/ship-plan-migrations.py <engine-dir> --schema-json <file>   the answer of `wrangler d1 execute … --json
                                                                            --command "SELECT type, name, tbl_name, sql
                                                                            FROM sqlite_master WHERE sql NOT NULL"`
  python3 tools/ship-plan-migrations.py <engine-dir> --schema-sql <boot.sql> a schema file (e.g. the live tag's boot.sql)
  python3 tools/ship-plan-migrations.py <engine-dir> --live-at <NNN>        no schema: the number stated (said as stated)

A migration's MARKERS are what it creates — CREATE TABLE / VIRTUAL TABLE / INDEX / TRIGGER names and ALTER TABLE … ADD COLUMN
columns — read from the file, never a hand list. The database is AT the highest-numbered migration whose markers are all in
the schema (a column counts when the table's CREATE sql, which SQLite rewrites on every ADD COLUMN, names it); every file
numbered above it is PENDING, in order. An earlier file with a missing marker is normal (a later file dropped or rebuilt
what it made) and only counted. A pending file's ORDER rule is read from its header: its `ORDER:` paragraph saying "AFTER the
code" (sprint 6: a contract step, e.g. migrate-068 and migrate-069) is AFTER, naming the files it lands after ("after
migrate-068"); otherwise "BEFORE the code", "before or after the code", "does not depend on it" (any time); anything else
prints as unstated. An AFTER file's ORDER paragraph may say WHEN ("right after it reaches 100%": migrate-068, whose window the
old code's org-less rows sit in). A header's PREFLIGHT (the read-only query the ship runs right before the file: a "PREFLIGHT"
line, then its SELECT) is printed beside it; its UNDO ("THE UNDO OF THIS FILE: tools/….sql", a down script applied as a
migration is) names the file that takes it back. THE SEQUENCE is every pending file not AFTER the code (in order), then the
code, then every file AFTER it (in order, each with its WHEN): migrate-067 -> the code -> migrate-068 (right after the code
reaches 100%) -> migrate-069. Prints JSON with --json, else lines."""
import glob, json, os, re, sqlite3, sys

eng = sys.argv[1]
args = sys.argv[2:]
def opt(name):
    return args[args.index(name) + 1] if name in args else None

files = sorted(glob.glob(os.path.join(eng, "migrate-[0-9][0-9][0-9]*.sql")))
num = lambda f: int(re.match(r"migrate-(\d{3})", os.path.basename(f)).group(1))

def markers(text):
    t = re.sub(r"--[^\n]*", "", text)
    objs = set(m.group(2) for m in re.finditer(r"CREATE\s+(?:UNIQUE\s+|VIRTUAL\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?\"?(\w+)\"?", t, re.I))
    cols = set((m.group(1), m.group(2)) for m in re.finditer(r"ALTER\s+TABLE\s+\"?(\w+)\"?\s+ADD\s+COLUMN\s+\"?(\w+)\"?", t, re.I))
    # a table renamed out of the way and recreated keeps its name: a *_old / *_new helper is never a marker
    objs = {o for o in objs if not re.search(r"_(old|new|defuse_old)$", o)}
    return objs, cols

def header(text):
    """the header's comment lines, the leading `--` and one space dropped (indentation kept)"""
    return [l[2:][1:] if l[2:3] == " " else l[2:] for l in text.splitlines()[:60] if l.startswith("--")]

def order_para(text):
    """the header's ORDER paragraph: the `ORDER:` line and its continuation, up to an empty line or the next label
    ("Re-runnable: ...", "WRITE COST: ...")"""
    lines = header(text)
    for i, l in enumerate(lines):
        if re.match(r"\s*ORDER:\s", l, re.I):
            out = [l.strip()]
            for c in lines[i + 1:]:
                if not c.strip() or re.match(r"\s*[A-Z][\w' -]{0,30}:\s", c): break
                out.append(c.strip())
            return " ".join(out)
    return ""

def after_rule(text):
    """(rule, [files it lands after]) when the ORDER paragraph puts the file AFTER the code, else None"""
    para = order_para(text)
    if not re.search(r"\bAFTER the code\b", para) or re.search(r"BEFORE the code|before or after the code|either side", para, re.I): return None
    m = re.search(r"AFTER the code[^.;]*", para)
    return m.group(0).strip(), re.findall(r"\bafter (migrate-\d{3}\w*)", para[m.start():])

def preflight(text):
    """the read-only query the header names as the ship's PREFLIGHT (the first SELECT after a PREFLIGHT line), or None"""
    lines = header(text)
    for i, l in enumerate(lines):
        if "PREFLIGHT" in l:
            for j, c in enumerate(lines[i + 1:i + 8]):
                if c.strip().upper().startswith("SELECT"):
                    q = [c.strip()]
                    for d in lines[i + 2 + j:]:
                        if len(d) - len(d.lstrip()) < 4 or not d.strip(): break
                        q.append(d.strip())
                    return " ".join(q)
            return None
    return None

def when_of(text):
    """when an AFTER file lands, if its ORDER paragraph says ("right after it reaches 100%"), else None"""
    return "right after the code reaches 100%" if re.search(r"right after (?:it|the code) reaches 100%", order_para(text)) else None

def undo_of(text):
    """the down script the header names as THE UNDO OF THIS FILE (a path under tools/), else None"""
    flat = re.sub(r"\s+", " ", "\n".join(header(text)))
    m = re.search(r"THE UNDO OF THIS FILE:\s*(tools/[\w./-]+\.sql)", flat)
    return m.group(1) if m else None

def order_rule(text):
    after = after_rule(text)
    if after: return "after", after[0]
    head = "\n".join(l[2:].strip() for l in text.splitlines()[:60] if l.startswith("--"))
    flat = re.sub(r"\s+", " ", head)
    if re.search(r"before or after the code", flat, re.I): return "either", "before or after the code"
    if re.search(r"does not depend on it", flat, re.I): return "either", "any time: the code does not depend on it"
    m = re.search(r"the order against the code does not matter[^.;]*", flat, re.I)
    if m: return "either", m.group(0).strip()
    m = re.search(r"BEFORE the code[^.;:]*", flat)
    if m: return "before", m.group(0).strip()
    return "unstated", "no order rule in its header: read it"

def title(text):
    first = text.splitlines()[0] if text else ""
    return re.sub(r"^--\s*migrate-\d+\w*\.sql\s*[—-]\s*", "", first).strip()[:110]

schema = None
if opt("--schema-json"):
    raw = open(opt("--schema-json")).read()
    sys.path.insert(0, os.path.join(eng, "tools"))
    from lib_wrangler_json import parse_wrangler_json
    d = parse_wrangler_json(raw)
    schema = d[0]["results"] if isinstance(d, list) else d["results"]
elif opt("--schema-sql"):
    db = sqlite3.connect(":memory:"); db.executescript(open(opt("--schema-sql")).read())
    schema = [{"type": r[0], "name": r[1], "tbl_name": r[2], "sql": r[3]} for r in db.execute("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql NOT NULL")]

out = {"at": None, "source": None, "applied_with_missing_markers": 0, "pending": [], "files": len(files)}
if schema is not None:
    names = {r["name"] for r in schema}
    tsql = {r["name"]: (r["sql"] or "") for r in schema if r["type"] == "table"}
    has_col = lambda t, c: t in tsql and re.search(r"(^|[\s,(\"])" + re.escape(c) + r"([\s,)\"]|$)", tsql[t]) is not None
    held = {}
    for f in files:
        objs, cols = markers(open(f).read())
        if not objs and not cols: held[f] = None; continue
        held[f] = all(o in names for o in objs) and all(has_col(t, c) for t, c in cols)
    top = max([num(f) for f in files if held[f]] or [0])
    out["at"], out["source"] = top, "read from the schema"
    out["applied_with_missing_markers"] = sum(1 for f in files if num(f) <= top and held[f] is False)
elif opt("--live-at"):
    out["at"], out["source"] = int(opt("--live-at")), "stated (--live-at), not read"
if out["at"] is not None:
    for f in files:
        if num(f) > out["at"]:
            text = open(f).read(); kind, rule = order_rule(text)
            out["pending"].append({"file": os.path.basename(f), "n": num(f), "order": kind, "rule": rule, "title": title(text),
                                   "after": (after_rule(text) or ("", []))[1], "preflight": preflight(text),
                                   "when": when_of(text) if kind == "after" else None, "undo": undo_of(text)})
    # the sequence: every pending file not AFTER the code, the code, then every file AFTER it (each group in number order)
    out["sequence"] = ([p["file"] for p in out["pending"] if p["order"] != "after"] + ["the code"]
                       + [p["file"] + (f" ({p['when']})" if p.get("when") else "") for p in out["pending"] if p["order"] == "after"])
if "--json" in args:
    print(json.dumps(out)); sys.exit(0)
if out["at"] is None:
    print("  live is at: unknown (no schema read, nothing stated)"); sys.exit(0)
print(f"  live is at migrate-{out['at']:03d} ({out['source']}; {out['files']} migration files in the repo"
      + (f"; {out['applied_with_missing_markers']} earlier file(s) whose objects a later file replaced" if out['applied_with_missing_markers'] else "") + ")")
TAG = {"before": "BEFORE the code", "after": "AFTER the code", "either": "either side"}
for p in out["pending"]:
    print(f"    {p['file']:<18} {TAG.get(p['order'], 'UNSTATED'):<16} {p['title']}")
    print(f"    {'':<18} {'':<16} rule: {p['rule']}")
    if p["preflight"]: print(f"    {'':<18} {'':<16} preflight (read-only, right before it; must answer no row): {p['preflight']}")
    if p["undo"]: print(f"    {'':<18} {'':<16} undo: sh tools/migrate.sh {p['undo']}")
if out["pending"]:
    print("  the sequence: " + " -> ".join(x.replace(".sql", "") for x in out["sequence"]))
