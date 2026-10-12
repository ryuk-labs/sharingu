#!/usr/bin/env python3
# tools/volume-local.py — the synthetic VOLUME behind tools/volume-local.sh: SQL that makes a local org look like a busy one
# (and beyond today's live org), so tools/page-budget.mjs sees on this machine the D1 rows a screen reads at scale.
# Local synthetic data only, never a live write. Deterministic: the same --seed and --anchor give byte-identical SQL.
#
#   python3 tools/volume-local.py --ids <ids.json> --anchor <ISO> [--seed N] --out <file.sql>
#
# <ids.json> is what the org already holds, read by the shell from the local D1 (wrangler d1 execute --local --json):
#   {"owner": "<person id>", "goals": [[project, id]...], "questions": [[project, qid]...], "checks": [[project, id]...]}
# Every row it writes has valid foreign keys and a plausible time between anchor-90d and anchor-1min: projects (4 more, one
# archived), people (300: most inactive, and the suites' five eval-fixed seats), seats, tokens (1,500: most expired or
# revoked), filings (1,000 over every lane, kind and project; some naming a goal, some decided, some routed to the owner,
# about a fifth the suites'), their transmission_refs, approval_audit and "pr" event mirrors, events (5,000 in all), loops
# (300 open, 200 closed), login attempts (400), artifacts (200) and grades for most checks (check_results).
import argparse, hashlib, json, random, uuid
from datetime import datetime, timedelta, timezone

ap = argparse.ArgumentParser()
ap.add_argument("--ids", required=True)
ap.add_argument("--anchor", required=True)
ap.add_argument("--seed", type=int, default=20260930)
ap.add_argument("--out", required=True)
a = ap.parse_args()
ids = json.load(open(a.ids))
R = random.Random(a.seed)
ANCHOR = datetime.strptime(a.anchor, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
OWNER = ids["owner"]
NS = uuid.uuid5(uuid.NAMESPACE_URL, f"volume-local:{a.seed}")

def q(v):
    if v is None: return "NULL"
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"
def ts(dt): return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"
def ago(days_max, days_min=0.0, bias=1.0):
    # bias > 1 packs more rows into the recent end (a busy org files more now than 90 days ago)
    f = R.random() ** bias
    return ANCHOR - timedelta(minutes=1) - timedelta(seconds=(days_min + f * (days_max - days_min)) * 86400)
def uid(tag, i): return str(uuid.uuid5(NS, f"{tag}:{i}"))
def hx(tag, i): return hashlib.sha256(f"volume-local:{a.seed}:{tag}:{i}".encode()).hexdigest()
def pick(weighted):
    tot = sum(w for _, w in weighted); x = R.random() * tot
    for v, w in weighted:
        x -= w
        if x <= 0: return v
    return weighted[-1][0]

sql = ["PRAGMA defer_foreign_keys = ON;"]
# sprint 6 (migrate-068): a row of the nine org-wide tables carries its org; this volume is the seeded org's, org 1
ORG_WIDE = {"people", "tokens", "invites", "events", "artifacts", "loops", "approval_audit", "login_attempts", "transmission"}
ins = lambda table, cols, vals: sql.append(f"INSERT INTO {table} ({','.join(cols + (['org'] if table in ORG_WIDE else []))}) VALUES ({','.join([q(v) for v in vals] + (['1'] if table in ORG_WIDE else []))});")

# ---- projects: the seed's `local`, the two imported, three more active, one archived (live holds six) ----
EXTRA = [("bunny", "BunnyEvents", 1), ("saruspay", "SarusPay", 1), ("veil", "Veil", 1), ("old-pilot", "Old pilot", 0)]
for k, n, act in EXTRA:
    sql.append(f"INSERT OR IGNORE INTO projects (key,name,registry_ptr,active,created_at) VALUES ({q(k)},{q(n)},'',{act},{q(ts(ANCHOR - timedelta(days=95)))});")
PROJ_W = [("sharingu", 35), ("siru-services", 30), ("bunny", 12), ("saruspay", 8), ("veil", 5), ("local", 4), ("old-pilot", 4), (None, 2)]
ACTIVE_PROJ = ["sharingu", "siru-services", "bunny", "saruspay", "veil", "local"]

# ---- people: 300, about a quarter active; plus the suites' five fixed seats (inactive between runs) ----
FIRST = ["Asha", "Ben", "Chen", "Dara", "Eli", "Fatima", "Gopal", "Hana", "Ivan", "Jia", "Kofi", "Lena", "Mateo", "Nia", "Omar",
         "Priya", "Quinn", "Ravi", "Sofia", "Tariq", "Uma", "Viktor", "Wen", "Xavi", "Yara", "Zane", "Anil", "Bea", "Carlos", "Divya"]
LAST = ["Rao", "Smith", "Okafor", "Kim", "Silva", "Novak", "Haddad", "Iyer", "Mensah", "Tanaka", "Weber", "Costa", "Nair", "Ali",
        "Moreau", "Singh", "Park", "Lopez", "Evans", "Sato"]
ROLES = [("internal-eng", 30), ("product", 15), ("design", 12), ("ai-platform", 10), ("external-ai", 12), ("logistics", 6),
         ("economics", 5), ("external-logistics", 5), ("vendor", 5)]
LANE_OF_ROLE = {"internal-eng": "code", "product": "leader", "design": "design", "ai-platform": "code", "external-ai": "code",
                "logistics": "ba", "economics": "gtm", "external-logistics": "vendor", "vendor": "vendor"}
people = []   # (id, active, lane, seats)
for i in range(300):
    pid = uid("person", i)
    fn, ln = FIRST[i % len(FIRST)], LAST[(i * 7) % len(LAST)]
    role = pick(ROLES)
    active = 1 if R.random() < 0.25 else 0
    lane = LANE_OF_ROLE[role] if R.random() < 0.8 else pick([("all", 1), ("code,design", 1), ("leader,gtm", 1)])
    created = ago(400, 91)
    ins("people", ["id", "name", "email", "role", "key_hash", "active", "created_at", "title", "capture_mode", "lane", "trace_consent"],
        [pid, f"{fn} {ln}", f"{fn.lower()}.{ln.lower()}.{i:03d}@volume.local", role, hx("key", i), active, ts(created),
         (role.replace("-", " ").title() if R.random() < 0.5 else None), "yield", lane, pick([("off", 6), ("traces", 3), ("traces+prompts", 1)])])
    nseat = pick([(1, 6), (2, 3), (3, 1)])
    seats = R.sample(ACTIVE_PROJ[:5] + ["old-pilot"], nseat)
    for s in seats:
        ins("project_seats", ["person_id", "project_key", "role", "created_at"], [pid, s, pick([("member", 9), ("lead", 1)]), ts(created + timedelta(days=1))])
    people.append((pid, active, lane.split(",")[0], seats))
for role in ["owner", "member", "leader", "thiyag", "tester"]:
    pid = "eval-fixed-" + role
    sql.append("INSERT OR IGNORE INTO people (id,name,email,role,key_hash,active,created_at,capture_mode,lane,org) VALUES "
               f"({q(pid)},{q('eval ' + role)},{q(pid + '@eval.local')},{q('owner' if role == 'owner' else 'internal-eng')},{q(hx('evalkey', role))},0,{q(ts(ANCHOR - timedelta(days=60)))},'yield','all',1);")
    for s in ["sharingu", "siru-services"]:
        sql.append(f"INSERT OR IGNORE INTO project_seats (person_id,project_key,role,created_at) VALUES ({q(pid)},{q(s)},'member',{q(ts(ANCHOR - timedelta(days=60)))});")
EVAL_SEATS = ["eval-fixed-" + r for r in ["owner", "member", "leader", "thiyag", "tester"]]
by_proj = {p: [x for x in people if p in x[3]] for p in ACTIVE_PROJ + ["old-pilot"]}

# ---- tokens: 1,500 sessions and devices; about a fifth live, the rest expired or revoked. The owner holds 60 ----
DEV = [("web", 50), ("sso", 10), ("cli", 15), ("mcp", 15), ("frame", 5), ("laptop", 5)]
for i in range(1500):
    who = OWNER if i < 60 else R.choice(people)[0]
    created = ago(90, 0, 1.3)
    live = R.random() < 0.22
    expires = created + timedelta(days=30) if live else created + timedelta(days=R.choice([1, 7, 30]))
    if live and expires <= ANCHOR: expires = ANCHOR + timedelta(days=R.randint(1, 29))
    revoked = 0 if live else (1 if R.random() < 0.55 else 0)
    if not live and not revoked and expires > ANCHOR: expires = ANCHOR - timedelta(hours=R.randint(1, 500))
    ins("tokens", ["token_hash", "person_id", "device", "created_at", "expires_at", "revoked", "project"],
        [hx("token", i), who, pick(DEV), ts(created), ts(expires), revoked, R.choice([None, None, "sharingu", "siru-services"])])

# ---- filings: 1,000 over 90 days ----
goals = {}
for p, gid in ids.get("goals", []): goals.setdefault(p, []).append(gid)
questions = {}
for p, qid in ids.get("questions", []): questions.setdefault(p, []).append(qid)
LANE_W = [("code", 34), ("leader", 16), ("design", 10), ("gtm", 16), ("ba", 10), ("vendor", 6), ("code", 8)]
KINDS = {"code": [("pr", 5), ("fix", 2), ("refactor", 1), ("test", 1), ("component", 1)], "design": [("screen", 6), ("flow", 4)],
         "leader": [("note", 4), ("ruling", 2), ("decision", 2), ("scope", 2)], "gtm": [("outreach", 3), ("post", 3), ("campaign", 2), ("update", 2)],
         "ba": [("requirement", 6), ("flow", 3), ("grade", 1)], "vendor": [("quote", 5), ("delivery", 5)]}
SPECIAL = [("answer", 30), ("counter", 18), ("critique", 6), ("rank", 10), ("round", 6), ("knowledge", 14), ("item", 4), ("publish", 3), ("grant", 4), ("restore", 1)]
VIAS = [(None, 3), ("mcp", 4), ("mcp/claude-code", 3), ("cli/0.4", 2), ("http", 1)]
WORDS = ["checkout", "login", "search", "map", "pricing", "onboarding", "billing", "ledger", "inbox", "goals", "export", "import",
         "sync", "roster", "badge", "timeline", "deploy", "cache", "index", "report"]
tx = []   # (id, project, created, kind, route, decision, eval)
seq = {}
for i in range(1000):
    created = ago(90, 0, 1.6)
    project = pick(PROJ_W)
    special = R.random() < 0.22
    lane = pick(LANE_W)
    kind = pick(SPECIAL) if special else pick(KINDS[lane])
    if kind in ("answer", "round", "knowledge", "grant"): lane = "leader"
    is_eval = 1 if R.random() < 0.2 else 0
    pool = by_proj.get(project) or people
    submitter = OWNER if R.random() < 0.18 else (R.choice(EVAL_SEATS) if is_eval and R.random() < 0.7 else R.choice(pool)[0])
    route = pick([("auto", 55), ("owner", 30), ("incomplete", 15)])
    if kind in ("answer", "grant", "round"): route = "owner"
    if kind in ("knowledge", "rank", "restore", "publish", "item"): route = "auto"
    gaprefs = None; parent = None; touches = None; goal_ref = None; screens = None; components = None
    qs = questions.get(project or "", [])
    earlier = [t for t in tx if t[1] == project and t[2] < created and t[3] not in ("counter", "critique", "rank")]
    if kind in ("answer", "round") and qs: gaprefs = "q/" + R.choice(qs)
    if kind in ("counter", "critique"):
        if earlier and R.random() < 0.6: parent = R.choice(earlier)[0]
        elif goals.get(project or "") and R.random() < 0.5: gaprefs = "goal/" + R.choice(goals[project])
        elif qs: gaprefs = "q/" + R.choice(qs)
        elif earlier: parent = R.choice(earlier)[0]
    if kind == "rank" and earlier: parent = R.choice(earlier)[0]
    if kind == "knowledge":
        touches = ",".join(R.sample(["goal:" + g for g in goals.get(project or "", [])] + ["aim", "node:n1", "question:q1", "check:c1"], 2))
    if kind in ("pr", "fix", "screen", "flow", "component") and R.random() < 0.6:
        screens = ",".join(f"{R.randint(1, 120):03d}" for _ in range(R.randint(1, 2)))
    if kind in ("pr", "fix", "refactor", "component") and R.random() < 0.4: components = "c-" + R.choice(WORDS)
    if R.random() < 0.02: components = "mind/worker"
    if goals.get(project or "") and kind not in ("counter", "critique", "rank", "restore", "knowledge", "item", "publish") and R.random() < 0.4:
        goal_ref = R.choice(goals[project]) if R.random() < 0.95 else "g-unknown-" + str(i)
    decision = decided_by = decided_at = None; status = "routed"
    if route == "owner" and R.random() < 0.55:
        decision = pick([("approve", 6), ("reject", 2), ("needs-work", 2)])
        decided_by = OWNER; decided_at = created + timedelta(hours=R.randint(1, 96))
        if decided_at >= ANCHOR: decided_at = ANCHOR - timedelta(minutes=2)
        status = "closed" if decision != "needs-work" else "routed"
    elif route == "auto" and R.random() < 0.3: status = "closed"
    elif route == "incomplete": status = "graded"
    if kind in ("counter", "critique") and R.random() < 0.3:
        decision = pick([("approve", 1), ("reject", 1)]); decided_by = OWNER
        decided_at = min(created + timedelta(hours=R.randint(1, 48)), ANCHOR - timedelta(minutes=2)); status = "closed"
    day = created.strftime("%Y%m%d")
    seq[day] = seq.get(day, 99) + 1
    tid = f"T-{day}-{seq[day]:03d}"
    what = f"{'[eval] ' if is_eval and R.random() < 0.3 else ''}{kind} {R.choice(WORDS)} {R.choice(WORDS)} #{i}"
    expected = actual = outcome = None
    if lane == "gtm":
        expected = f"{R.randint(5, 500)} signups"
        if R.random() < 0.5: actual = f"{R.randint(0, 600)} signups"
        if R.random() < 0.4: outcome = float(R.randint(0, 300))
    grade = json.dumps({"binding": route != "incomplete", "stages": ["received", "graded", "routed"] + (["closed"] if status == "closed" else [])})
    ins("transmission", ["id", "submitter", "lane", "kind", "what", "why", "touches", "screens", "components", "gaprefs", "parent", "grade", "route",
                         "status", "eval", "created_at", "decision", "decided_by", "decided_at", "project", "via", "client_ref", "goal_ref",
                         "expected", "actual", "outcome"],
        [tid, submitter, lane, kind, what, "because " + R.choice(WORDS), touches, screens, components, gaprefs, parent, grade, route,
         status, is_eval, ts(created), decision, decided_by, ts(decided_at) if decided_at else None, project, pick(VIAS), f"vol-{a.seed}-{i}",
         goal_ref, expected, actual, outcome])
    for ref in sorted({x for x in (gaprefs or "").split(",") + (screens or "").split(",") + (components or "").split(",") if x}):
        ins("transmission_refs", ["tid", "ref"], [tid, ref])
    if decision:
        ins("approval_audit", ["id", "transmission_id", "verdict", "note", "decided_by", "created_at"], [uid("audit", i), tid, decision, None, OWNER, ts(decided_at)])
        ins("events", ["id", "session_id", "person_id", "kind", "lane", "payload_json", "touches", "basis", "stamped", "project", "created_at"],
            [uid("ruling", i), None, OWNER, "ruling", lane, json.dumps({"what": f"owner decision — {decision}: {what}", "transmissionId": tid, **({"eval": True} if is_eval else {})}),
             touches, "owner decision on the transmission queue", 1, project, ts(decided_at)])
    ins("events", ["id", "session_id", "person_id", "kind", "lane", "payload_json", "touches", "basis", "stamped", "project", "created_at"],
        [uid("pr", i), None, submitter, "pr", lane, json.dumps({"what": what, "transmissionId": tid, "route": route, **({"mind": True} if components == "mind/worker" else {}), **({"eval": True} if is_eval else {})}),
         touches, "because", 1, project, ts(created)])
    tx.append((tid, project, created, kind, route, decision, is_eval))
n_pr = len(tx) + sum(1 for t in tx if t[5])

# ---- artifacts (200) and the other events, to 5,000 in all ----
arts = []
for i in range(200):
    who = R.choice(people)[0] if R.random() < 0.8 else OWNER
    created = ago(90, 0, 1.3)
    aid = uid("artifact", i)
    ins("artifacts", ["id", "person_id", "kind", "title", "r2_key", "sha256", "bytes", "group_tag", "created_at", "screens", "states", "project"],
        [aid, who, pick([("html", 6), ("image", 2), ("json", 1), ("pdf", 1)]), f"fragment {hx('a', i)[:8]}", f"artifacts/{aid}.html", hx("art", i),
         R.randint(800, 90000), pick([("eval", 2), ("checkout", 2), ("onboarding", 2), ("legacy-ungrouped", 1), ("map", 1)]), ts(created),
         None, None, pick(PROJ_W)])
    arts.append((aid, who, created))
EV = [("session_open", 40), ("exit", 10), ("drift", 10), ("unknown", 5), ("ruling", 6), ("fragment", 10), ("correction", 5), ("file", 5), ("note", 3)]
others = 5000 - n_pr
for i in range(others):
    kind = pick(EV)
    who = OWNER if R.random() < 0.12 else (R.choice(EVAL_SEATS) if R.random() < 0.08 else R.choice(people)[0])
    created = ago(90, 0.05 if who == OWNER else 0, 1.4)   # the owner was last here about an hour ago, at the earliest
    ev = R.random() < 0.15
    if kind == "fragment" and arts:
        art = R.choice(arts); payload = {"artifactId": art[0], "hash": hx("art", i)[:16], "stitchGroup": "checkout", "bytes": 1200}
    elif kind == "session_open": payload = {"client": pick([("claude-code", 3), ("cursor", 1), ("web", 1)]), "v": "0.4"}
    elif kind == "exit": payload = {"reason": "done"}
    else: payload = {"what": f"{kind} about {R.choice(WORDS)}", **({"claim": "the " + R.choice(WORDS) + " moved"} if kind == "drift" else {})}
    if ev: payload["eval"] = 1
    if R.random() < 0.01: payload["mind"] = 1
    ins("events", ["id", "session_id", "person_id", "kind", "lane", "payload_json", "touches", "basis", "stamped", "project", "created_at"],
        [uid("event", i), None, who, kind, R.choice(["code", "design", "leader", "gtm", None]), json.dumps(payload),
         (R.choice(WORDS) if R.random() < 0.4 else None), ("seen in " + R.choice(WORDS) if kind in ("drift", "ruling", "correction") else None),
         1 if R.random() < 0.7 else 0, pick(PROJ_W), ts(created)])

# ---- loops: 300 open (the owner holds 15), 200 closed ----
for i in range(500):
    open_ = i < 300
    who = OWNER if i < 15 else R.choice(people)[0]
    opened = ago(90, 0, 1.2)
    ref = pick([(None, 5), ("q", 2), ("c", 1), ("mind", 1), ("screen", 1)])
    if ref == "q":
        allq = [x for v in questions.values() for x in v]
        ref = "q/" + R.choice(allq) if allq else None
    elif ref == "c": ref = "c/c-" + R.choice(WORDS)
    elif ref == "mind": ref = "mind/worker"
    elif ref == "screen": ref = f"screen:{R.randint(1, 120):03d}"
    ins("loops", ["id", "person_id", "title", "status", "opened_at", "closed_at", "ref"],
        [uid("loop", i), who, f"follow up on {R.choice(WORDS)} {R.choice(WORDS)}", "open" if open_ else "closed", ts(opened),
         None if open_ else ts(min(opened + timedelta(days=R.randint(1, 10)), ANCHOR - timedelta(minutes=1))), ref])

# ---- login attempts (400) ----
for i in range(400):
    who = R.choice(people)
    ins("login_attempts", ["id", "email", "ok", "at"], [uid("login", i), f"user{R.randint(0, 299):03d}@volume.local" if R.random() < 0.3 else f"{i % 50}@volume.local",
                                                          1 if R.random() < 0.7 else 0, ts(ago(90, 0, 1.2))])

# ---- grades: most checks of every project get one or two results (check_results is append-only) ----
grades = 0
for p, cid in ids.get("checks", []):
    if R.random() < 0.8:
        for _ in range(pick([(1, 3), (2, 1)])):
            ins("check_results", ["project", "pack_version", "check_id", "status", "transmission_id", "graded_by", "graded_at"],
                [p, pick([("v1", 1), ("v2", 2)]), cid, pick([("proven", 6), ("refused", 2), ("incomplete", 2)]), None,
                 OWNER if R.random() < 0.5 else R.choice(EVAL_SEATS), ts(ago(60, 0, 1.2))])
            grades += 1

open(a.out, "w").write("\n".join(sql) + "\n")
print(json.dumps({"people": 305, "tokens": 1500, "filings": len(tx), "events": n_pr + others, "loops": 500, "loginAttempts": 400,
                  "artifacts": 200, "grades": grades, "projects": len(EXTRA), "statements": len(sql)}))
