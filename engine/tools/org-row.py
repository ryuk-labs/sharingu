#!/usr/bin/env python3
"""tools/org-row.py — the org's ONE row (src/tenant.js reads it) as the SQL that writes it, from a manifest-shaped JSON file:
{"brand": {"org", "productTitle"?, "loginTitle"?}, "projects"?: [{"key", "home"?: true}], "domain"?, "evalSeats"?,
"handoffRepo"?: {"owner", "repo"}, "traceMandate"?}. The local seed (tools/lib-r-local.sh rl_seed) writes a
fresh org's row with it; at a ship an org that still serves an old R2 manifest (serve/tenant.json) gets its row from the
same file. Prints ONE statement (an upsert on id 1); it never runs anything and never prints a credential (the file holds
none).

  python3 tools/org-row.py <manifest.json> [--by <person id>] [--at <iso time>] [--home-must-exist]

--by names the person the row is created and updated by (the seed's owner); --at its time (default: now, UTC).
--home-must-exist keeps a home only when the seed also creates that project (the caller passes the seeded keys with
--projects k1,k2); a home that names no project is dropped, never written (org.home references projects(key)).
"""
import datetime, json, sys


def q(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def row_of(m):
    b = m.get("brand") if isinstance(m.get("brand"), dict) else {}
    name = str(b.get("org") or "").strip() or "sharingu"
    brand = {k: b[k] for k in ("productTitle", "loginTitle") if isinstance(b.get(k), str) and b[k].strip()}
    home = next((str(p["key"]).lower().strip() for p in (m.get("projects") or []) if isinstance(p, dict) and p.get("home") is True and p.get("key")), None)
    settings = {k: m[k] for k in ("domain", "evalSeats", "handoffRepo", "traceMandate") if m.get(k) not in (None, "", [], {})}
    return name, (json.dumps(brand, separators=(",", ":"), ensure_ascii=False) if brand else None), home, (json.dumps(settings, separators=(",", ":"), ensure_ascii=False) if settings else None)


def main(argv):
    if not argv or argv[0].startswith("-"):
        print(__doc__.strip().split("\n\n")[1], file=sys.stderr)
        return 2
    path, by, at, projects = argv[0], None, None, None
    i = 1
    while i < len(argv):
        if argv[i] == "--by": by = argv[i + 1]; i += 2
        elif argv[i] == "--at": at = argv[i + 1]; i += 2
        elif argv[i] == "--projects": projects = [k.strip().lower() for k in argv[i + 1].split(",") if k.strip()]; i += 2
        else: print(f"org-row: unknown argument {argv[i]}", file=sys.stderr); return 2
    m = json.load(open(path))
    if not isinstance(m, dict):
        print("org-row: the manifest is not a JSON object", file=sys.stderr); return 2
    name, brand, home, settings = row_of(m)
    if projects is not None and home not in projects: home = None
    at = at or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    print("INSERT INTO org (id, name, brand, home, settings, created_by, created_at, updated_by, updated_at) VALUES "
          f"(1, {q(name)}, {q(brand)}, {q(home)}, {q(settings)}, {q(by)}, {q(at)}, {q(by)}, {q(at)}) "
          "ON CONFLICT(id) DO UPDATE SET name = excluded.name, brand = excluded.brand, home = excluded.home, settings = excluded.settings, "
          "updated_by = excluded.updated_by, updated_at = excluded.updated_at;")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
