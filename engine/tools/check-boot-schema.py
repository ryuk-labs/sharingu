#!/usr/bin/env python3
"""check-boot-schema.py — gate step 7 (extraction backlog #1; sprint 6, 6.1: boot.sql EQUALS the migrations).

boot.sql is the fresh-tenant schema (tools/export-boot-schema.sh, hand-mirrored since). The failure mode this kills: a
migration lands and deploys, but boot.sql is not updated — the next fresh org then boots WITHOUT that column, index or
trigger, and every code path touching it fails only on the new org; or boot.sql carries a trigger the migrations never
made (or an older text of one), and a fresh org behaves unlike live.

Checks, purely local (no D1 access — the gate must stay fast and offline):
  1. every `ALTER TABLE t ADD COLUMN c` in migrate-*.sql → boot.sql's `t` DDL names `c`
  2. schema.sql then every migrate-*.sql REPLAYED in order (CREATE / DROP TABLE, ALTER TABLE … RENAME TO, CREATE / DROP
     INDEX, CREATE / DROP TRIGGER; IF NOT EXISTS keeps what exists; a dropped table takes its indexes and triggers with it) leaves EXACTLY boot.sql's
     tables (each with the same body: the sprint-6 review, finding 7 — every column's definition, type, default and
     generated expression, spaces aside, and the table's own constraints; an ALTER … ADD COLUMN lands in the body as SQLite
     writes it; column ORDER is not compared, see table_shape), EXACTLY its indexes (each with the same definition) and
     EXACTLY its triggers (each with the same text, spaces aside: the last migration that wrote a trigger is its truth)
  3. no trigger in boot.sql (or in a migration from migrate-067 on) closes a CASE with "END)" or "END,": wrangler's
     statement splitter would merge every statement after it (a fresh seed's SQLITE_TOOBIG, sprint 6)
Exit 0 clean; exit 1 with every miss listed.
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
boot_path = os.path.join(ROOT, "boot.sql")
if not os.path.exists(boot_path):
    print("  ✗ boot.sql missing — run: sh tools/export-boot-schema.sh")
    sys.exit(1)


def strip_comments(sql):
    """Drop every -- comment, but never inside a '…' string (migrate-067's key rule holds '--' in its literals)."""
    out, i, n, quoted = [], 0, len(sql), False
    while i < n:
        c = sql[i]
        if quoted:
            out.append(c)
            if c == "'":
                if sql[i + 1:i + 2] == "'":
                    out.append("'")
                    i += 2
                    continue
                quoted = False
            i += 1
        elif c == "'":
            quoted = True
            out.append(c)
            i += 1
        elif sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def statements(sql):
    """The file's statements, comments dropped: split on ';' outside strings; a CREATE TRIGGER runs to its END;"""
    out, acc = [], ""
    for piece in re.split(r"(;)", strip_comments(sql)):
        acc += piece
        if piece != ";":
            continue
        s = acc.strip()
        if s.count("'") % 2 or (re.match(r"CREATE\s+TRIGGER\b", s, re.I) and not re.search(r"\bEND\s*;$", s, re.I)):
            continue
        out.append(s)
        acc = ""
    if acc.strip():
        out.append(acc.strip())
    return out


def norm(s):
    """One statement's text, for comparing: IF NOT EXISTS aside, spaces collapsed, none before ',' or ')' or after '('."""
    s = re.sub(r"\bIF\s+NOT\s+EXISTS\s+", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip().rstrip(";").strip()
    return re.sub(r"\(\s+", "(", re.sub(r"\s+([,)])", r"\1", s))


def table_shape(body):
    """A table's body as what it means: {column: its definition} (type, constraints, default, generated expression, each
    spaces-normalised), its table constraints (a sorted tuple) and its options (WITHOUT ROWID, STRICT). Column ORDER is not
    compared: boot.sql's hand mirror writes some added columns before a table's PRIMARY KEY clause, where SQLite appends
    them after it, and people's order predates the mirror; every reader names its columns."""
    b = norm(body)
    if not b.startswith("("):
        return ({"<as-select>": b}, (), "")
    d, k = 0, None
    for i, ch in enumerate(b):
        if ch == "(": d += 1
        elif ch == ")":
            d -= 1
            if d == 0: k = i; break
    inner, opts = b[1:k], b[k + 1:].strip().upper()
    parts, d, cur, q = [], 0, "", False
    for ch in inner:
        if ch == "'": q = not q
        if not q and ch == "(": d += 1
        elif not q and ch == ")": d -= 1
        if ch == "," and d == 0 and not q:
            parts.append(cur.strip()); cur = ""
        else:
            cur += ch
    parts.append(cur.strip())
    cols, cons = {}, []
    for x in parts:
        if re.match(r"(?:PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|CONSTRAINT)\b", x, re.I):
            cons.append(x)
        else:
            m = re.match(r"[\"`\[]?(\w+)[\"`\]]?\s*(.*)$", x, re.S)
            cols[m.group(1).lower()] = m.group(2)
    return (cols, tuple(sorted(cons)), opts)


NAME = r"(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?(\w+)[\"`]?"
GONE = r"(?:IF\s+EXISTS\s+)?[\"`]?(\w+)[\"`]?"


class Schema:
    def __init__(self):
        self.tables, self.indexes, self.triggers = {}, {}, {}   # name -> body / (table, text) / (table, text)

    def apply(self, s):
        keep = re.match(r"CREATE\s+(?:\w+\s+)*?\w+\s+IF\s+NOT\s+EXISTS\b", s, re.I)   # IF NOT EXISTS keeps what exists
        m = re.match(r"CREATE\s+(?:VIRTUAL\s+)?TABLE\s+" + NAME + r"\s*(.*)$", s, re.I | re.S)
        if m:
            if not (keep and m.group(1) in self.tables):
                self.tables[m.group(1)] = m.group(2).strip().rstrip(";").rstrip()
            return
        m = re.match(r"DROP\s+TABLE\s+" + GONE, s, re.I)
        if m:
            t = m.group(1)
            self.tables.pop(t, None)
            for d in (self.indexes, self.triggers):
                for k in [k for k, v in d.items() if v[0] == t]:
                    d.pop(k)
            return
        m = re.match(r"ALTER\s+TABLE\s+[\"`]?(\w+)[\"`]?\s+RENAME\s+TO\s+[\"`]?(\w+)[\"`]?", s, re.I)
        if m:
            old, new = m.group(1), m.group(2)
            self.tables[new] = self.tables.pop(old, "")
            for d in (self.indexes, self.triggers):
                for k, v in list(d.items()):
                    if v[0] == old:
                        d[k] = (new, v[1])
            return
        m = re.match(r"ALTER\s+TABLE\s+[\"`]?(\w+)[\"`]?\s+ADD\s+COLUMN\s+(.*)$", s, re.I | re.S)
        if m and m.group(1) in self.tables:
            # SQLite writes an added column INTO the stored DDL, before the column list's closing parenthesis (after any
            # table option such as WITHOUT ROWID): the replay does the same, so the two bodies compare as text
            body = self.tables[m.group(1)]
            mo = re.search(r"\)\s*((?:WITHOUT\s+ROWID|STRICT)(?:\s*,\s*(?:WITHOUT\s+ROWID|STRICT))*)?\s*$", body, re.I)
            k = mo.start() if mo else len(body)
            self.tables[m.group(1)] = body[:k] + ", " + m.group(2).strip().rstrip(";").rstrip() + body[k:]
            return
        m = re.match(r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+" + NAME + r"\s+ON\s+[\"`]?(\w+)", s, re.I)
        if m:
            if not (keep and m.group(1) in self.indexes):
                self.indexes[m.group(1)] = (m.group(2), norm(s))
            return
        m = re.match(r"DROP\s+INDEX\s+" + GONE, s, re.I)
        if m:
            self.indexes.pop(m.group(1), None)
            return
        m = re.match(r"CREATE\s+TRIGGER\s+" + NAME + r"\s.*?\bON\s+[\"`]?(\w+)", s, re.I | re.S)
        if m:
            if not (keep and m.group(1) in self.triggers):
                self.triggers[m.group(1)] = (m.group(2), norm(s))
            return
        m = re.match(r"DROP\s+TRIGGER\s+" + GONE, s, re.I)
        if m:
            self.triggers.pop(m.group(1), None)


boot = Schema()
for s in statements(open(boot_path).read()):
    boot.apply(s)

misses = []
migrations = sorted(glob.glob(os.path.join(ROOT, "migrate-*.sql")))
replay = Schema()
added = []   # (migration, table, column) for check 1
for path in [os.path.join(ROOT, "schema.sql")] + migrations:
    base = os.path.basename(path)
    for s in statements(open(path).read()):
        replay.apply(s)
        if path == os.path.join(ROOT, "schema.sql"):
            continue
        added += [(base, t, c) for t, c in re.findall(r"^ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)", s, re.I)]

# check 1, against the tables the replay keeps (a table a later migration dropped takes its columns with it)
for base, t, c in added:
    body = boot.tables.get(t)
    if t not in replay.tables:
        continue
    if body is None:
        misses.append(f"{base}: table {t} (has ADD COLUMN {c}) absent from boot.sql")
    # a column ALTERed in appears mid-line in sqlite_master DDL (", col TEXT, …")
    # — match it after a line start, "(" or "," rather than only at line starts
    elif not re.search(rf"(?:^|[(,])\s*{re.escape(c)}\b", body, re.M):
        misses.append(f"{base}: column {t}.{c} absent from boot.sql")

for kind, mine, theirs in (("table", replay.tables, boot.tables), ("index", replay.indexes, boot.indexes),
                           ("trigger", replay.triggers, boot.triggers)):
    for name in sorted(set(mine) - set(theirs)):
        misses.append(f"{kind} {name}: the migrations make it, boot.sql lacks it")
    for name in sorted(set(theirs) - set(mine)):
        misses.append(f"{kind} {name}: boot.sql has it, the migrations replayed do not (dropped, or never made)")
    for name in sorted(set(mine) & set(theirs)):
        if kind == "table":
            # each table's whole body: every column's type, constraints, default and generated expression, and its own constraints
            (ca, ka, oa), (cb, kb, ob) = table_shape(mine[name]), table_shape(theirs[name])
            for c in sorted(set(ca) - set(cb)):
                misses.append(f"table {name}: column {c} — the migrations make it, boot.sql lacks it")
            for c in sorted(set(cb) - set(ca)):
                misses.append(f"table {name}: column {c} — boot.sql has it, the migrations replayed do not")
            diffs = [(f"column {c}", ca[c], cb[c]) for c in sorted(set(ca) & set(cb)) if ca[c] != cb[c]]
            if ka != kb:
                diffs.append(("its table constraints", " · ".join(ka), " · ".join(kb)))
            if oa != ob:
                diffs.append(("its options", oa, ob))
            for what, a, b in diffs:
                k = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
                misses.append(f"table {name}: {what} — boot.sql's definition differs from the migrations' at «…{b[max(0, k - 40):k + 40]}…» "
                              f"(migrations: «…{a[max(0, k - 40):k + 40]}…»)")
            continue
        if mine[name] == theirs[name]:
            continue
        a, b = mine[name][1], theirs[name][1]
        if a != b:
            k = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
            misses.append(f"{kind} {name}: boot.sql's text differs from the last migration's at «…{b[max(0, k - 40):k + 40]}…» "
                          f"(migrations: «…{a[max(0, k - 40):k + 40]}…»)")

# 3. wrangler's statement splitter (d1 execute --file) opens a block at " BEGIN " or " CASE " and closes it only at an END
#    followed by a space or ";": an "END)" or "END," closes nothing, and every statement after it merges into one (a fresh
#    seed then dies on SQLITE_TOOBIG; a migration's statements run merged). Each CASE in a trigger ends "END )" or "END ,".
#    Held on boot.sql and on every migration from migrate-067 on (042 and 050 shipped with "END," and ran merged, harmlessly).
for path in [boot_path] + [m for m in migrations if os.path.basename(m) >= "migrate-067.sql"]:
    for s in statements(open(path).read()):
        if re.match(r"CREATE\s+TRIGGER\b", s, re.I) and re.search(r"\bEND[),]", s):
            misses.append(f"{os.path.basename(path)}: trigger {re.match(r'CREATE\s+TRIGGER\s+' + NAME, s, re.I).group(1)} "
                          f"has a CASE closed by 'END)' or 'END,' (write 'END )': wrangler's splitter would merge what follows)")

if misses:
    for m in sorted(set(misses)):
        print(f"  ✗ {m}")
    print("  → mirror the migration into boot.sql (the same text, in the same place a re-export would put it)")
    sys.exit(1)
print(f"  ✓ boot.sql equals the migrations replayed ({len(boot.tables)} tables, each by its columns' definitions, {len(boot.indexes)} indexes, "
      f"{len(boot.triggers)} triggers, each index and trigger by its text)")
