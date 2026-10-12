#!/usr/bin/env python3
"""M11 · tool <-> capability parity.

Every MCP tool must resolve to something the Worker declares, and every capability
that is a VERB (not onboarding, not reporting-over-REST) must be exposed as a tool.
The moment a tool can exist undeclared, the list drifts and nobody notices until an
agent cannot find something — the same failure that orphaned five routes.
"""
import re, sys
src = open("src/index.js", encoding="utf-8").read()

tools = set(re.findall(r'\{ name:"([a-z_]+)"', src))
# [a-z/:-] (not just [a-z/:]): PRD B1/A3 (2026-08-31) added /backup-dump, the worker's
# first hyphenated route — without the hyphen here this capability is invisible to the
# parity check entirely (silently exempt from NOT_TOOLS/TOOL_TO_CAP either way), which
# defeats the guard rather than passing it honestly. Purely additive otherwise.
# [a-z/:.-] (the dot, sprint 11, 11.3): a dotted path (/favicon.svg, /canvas.json, /.well-known/…) was invisible the same way.
caps  = {m.group(2) for m in re.finditer(r'\{ m:"(GET|POST)",\s*p:"(/[a-z/:.-]+)"', src)}

# onboarding and health are deliberately NOT tools — a tool list is verbs, not doors
NOT_TOOLS = {"/install", "/map", "/docs", "/home", "/projects", "/audit", "/logout", "/health", "/login", "/signout", "/mcp", "/profile", "/project", "/view", "/capabilities", "/backfill", "/backup-dump", "/log", "/storage",
    "/canvas.json",   # the Map's canvas, a page's own read
    # sprint 7, 7.2: the sign-up by allowlist is a door before any account exists (like /login), never an agent's verb
    "/signup",
    # sprint 7, 7.3: creating an org is proven by the ACCOUNT's passphrase, before any seat of the new org exists (like /signup):
    # a door for a person, never an agent's verb (an agent's key is a seat's, which never creates an org)
    "/orgs", "/orgs/new",
    # sprint 7's review, A1: the holder's answer to a seat that waits for their yes — their own ACCOUNT session in a browser,
    # same-origin only, never an agent's verb (a seat's key or grant answers nothing there: src/accounts.js answerSeat)
    "/orgs/seat",
    # the door's contract (UI-B8a): a download of contracts/door.json, which tools/list already is — not a verb
    "/contract",
    # the QuestionCard (UI-B2): a page over the `decisions` tool (decisions with a qid returns the same card)
    "/question/:qid",
    # one version (UI-B5b): a page over the `versions` tool (versions with v returns the same read)
    "/versions/:v",
    # UI-B12a: the admin screen's read — whoami already carries the caller's own seats (the admin's writes are presses)
    "/control/people",
    # sprint 3 S3b: the beta measures, the admin's export (src/measures.js): an admin's read on Control, not an agent's verb
    "/control/measures",
    # the brand's self-hosted faces and the favicon: static bytes a page asks for, not a verb
    "/fonts/:file", "/favicon.svg",
    # sprint 11, 11.3: OpenAI's domain verification, the deployment's token for a store's crawler, not a verb
    "/.well-known/openai-apps-challenge",
    # the Map's live lights: the page's own poll of what changed since it was drawn; map {ref} answers a node's light
    "/map/lights",
    # Broadcast's live picture and one starter item's page: the page's own reads (an equipped item is the doc starter/<slug>.md)
    "/broadcast/live", "/broadcast/starter/:slug",
    # a render's body: the bytes a Screens frame shows in a sandbox, not a verb; read {kind: "render", ref} answers its URL
    "/render/:hash",
    # one preview's page: a page over the preview tool's own answer
    "/preview/:id",
    # one contribution's page and its Impact view: pages over `read` {ref: <id>} and `impact` {contribution}
    "/contribution/:id", "/contribution/:id/impact",
    # the Library and one doc's page: pages over `read` {kind: "doc"} and read {ref: "doc/<path>"}
    "/library", "/doc/:path",
    # the saved files' list: read_file with no id answers the same list (its twin is GET /artifact/:id's tool)
    "/artifacts",
    # D5: rank and round stay REST for their buttons, with no tool (decided by the plan's laws, HANDOFF D6)
    "/rank", "/round",
    # M6: the Restore press on a screen's takes: a page's press over the item an agent files through preview then file
    # (render {screen, state, variant, hash}, no body), the same write door; not a verb of its own
    "/render/restore"}
TOOL_TO_CAP = {
    "whoami":"/whoami",
    # D5: heartbeat, state and thread folded into updates; GET /updates calls the tool's own door (src/mcp.js callTool)
    "updates":"/updates",
    # What is missing: the page and its JSON, the same computeHoles
    "missing":"/missing",
    "formats":"/formats",
    # preview, then file (sprint 3, B2; src/preview.js): each the twin of its REST door
    "preview":"/preview", "file":"/file",
    # ask: src/ask.js askOwner, one function for both
    "ask":"/ask",
    "respond":"/respond", "rule_question":"/questions/:qid/rule", "submit_grade":"/grade",
    # R1: regrade from the pages, POST /regrade's twin (src/regrade.js regradeAnswer)
    "regrade":"/regrade",
    "decide_contribution":"/contribution/:id/decide",
    "pick_up":"/contribution/:id/pick-up", "open_items":"/open-items", "wrap_up":"/wrap-up",
    # extract (sprint 3, B5; src/extract.js): each the twin of its REST door
    "search":"/search", "read":"/read", "changes":"/changes", "impact":"/impact", "brief":"/brief",
    # the tab reads, each the twin of its REST door
    "home":"/home/summary", "build":"/build", "gtm":"/gtm", "goals":"/goals", "decisions":"/decisions",
    "map":"/map/:plane", "broadcast":"/broadcast", "versions":"/versions",
    # files: save_file is POST /artifact's twin, read_file GET /artifact/:id's (and, with no id, GET /artifacts')
    "save_file":"/artifact", "read_file":"/artifact/:id",
    # Broadcast's verbs: each the twin of its REST door, the same src/broadcast.js publishAnswer / equipAnswer
    "publish":"/broadcast/publish", "equip":"/broadcast/equip",
    # admin: create_project is POST /control add-project's twin (src/admin.js addProject); the versions' writes their doors
    "create_project":"/control", "publish_version":"/versions/publish", "restore_version":"/versions/restore",
}
# map's other reads (one node, the Screens view) are the same tool: GET /map/node and GET /map/screens are its twins too
TOOL_EXTRA_CAPS = {"/map/node", "/map/screens", "/goals/:ref"}
problems = []
# the allowlist and the tool map must be DISJOINT — an entry in both is dead (it silently exempts a
# route a tool already covers), which is exactly how seven such entries rotted here before 2026-09-05.
for dead in sorted(NOT_TOOLS & set(TOOL_TO_CAP.values())):
    problems.append(f"'{dead}' is in NOT_TOOLS but a tool already covers it — remove it from NOT_TOOLS")
for t in sorted(tools):
    cap = TOOL_TO_CAP.get(t)
    if cap is None:
        problems.append(f"tool '{t}' maps to no capability")
    elif cap not in caps:
        problems.append(f"tool '{t}' maps to '{cap}' which is not declared")
for c in sorted(caps - NOT_TOOLS - TOOL_EXTRA_CAPS):
    if c not in TOOL_TO_CAP.values():
        problems.append(f"capability '{c}' is a verb with no tool")

# U-MCP D10 (Q0D506BBC): the `project` flag and the schema agree. A row flagged project:true (its first line, beside
# owner/write — tools/make-door-contract.py derives door.json tools[].project from it) must declare a top-level `project`
# property (the caller names the project there); a READ that declares `project` must carry the flag (else the door would
# accept the argument and drop it — the U-MCP seat hole). A write may declare a stamp-only `project` without the flag
# (ask, wrap_up: their project is the filing's stamp, nothing read). Rows are parsed from the MCP_TOOLS block.
_a = src.find("const MCP_TOOLS = [")
_b = src.find("\n];", _a)
_blk = src[_a:_b] if _a >= 0 and _b > _a else ""
_starts = [m.start() for m in re.finditer(r'^\s*\{\s*name:"', _blk, re.M)]
if len(_starts) < 20:
    problems.append(f"MCP_TOOLS parses to {len(_starts)} rows — the D10 rule cannot look")
for _i, _st in enumerate(_starts):
    _row = _blk[_st:_starts[_i + 1] if _i + 1 < len(_starts) else len(_blk)]
    _first = _row.split("\n", 1)[0]
    _name = re.match(r'\s*\{\s*name:"([^"]+)"', _row).group(1)
    _flag = bool(re.search(r'\bproject:\s*true', _first))
    _write = bool(re.search(r'\bwrite:\s*true', _first))
    _props = re.search(r'properties:\{', _row)
    # the TOP-level properties only: a nested items schema (respond's answers[]) does not count
    _top, _depth = "", 0
    if _props:
        for _ch in _row[_props.end():]:
            if _ch == "{": _depth += 1
            elif _ch == "}":
                if _depth == 0: break
                _depth -= 1
            _top += _ch if _depth == 0 or _ch == "{" else ("" if _depth else _ch)
    _has = bool(re.search(r'(^|,)\s*project:\s*\{', _top))
    if _flag and not _has:
        problems.append(f"tool '{_name}' is flagged project:true but its schema declares no `project` property (D10)")
    if _has and not _flag and not _write:
        problems.append(f"read tool '{_name}' declares a `project` property but is not flagged project:true (D10: the argument would be dropped)")

print("; ".join(problems))
sys.exit(1 if problems else 0)
