#!/usr/bin/env python3
"""M17 — the acceptance test for the whole MCP project.

Walks the real OAuth 2.1 flow end to end as claude.ai would: register a client,
sign in on the consent page, exchange the code for a token, then USE that token to
file a wrap-up through MCP. If this passes, Dr Vasu's work can no longer silently
fail to arrive. If it does not, nothing of value was delivered.
"""
import json, os, sys

# steps 1-4 (register → PKCE authorize → sign in → token) live in tools/oauth_token.py (U-READY-e) — ONE flow for
# every caller; this file keeps steps 5-7. evals.sh runs it with cwd=engine, so tools/ is found beside __file__.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))
from oauth_token import oauth_access_token, OAuthError, req  # noqa: E402

# Q65300E50 (2026-09-22): every live suite targets the dev org, ryuklabs, only — tools/lib.sh mints
# a seat per run and exports it under these GENERIC names (never org-prefixed, never a pool read);
# evals.sh runs this file as a subprocess, so it inherits them directly. Was tenant-aware via
# AGENT_R_ENV_PREFIX / `${P}_…` (2026-09-06 residue audit fix); that indirection is gone along with
# the pool it read from — one org, one set of names.
BASE = os.environ.get("U", "").rstrip("/")
EMAIL = os.environ.get("RYUKLABS_EVALSEAT_EMAIL", "")
PW = os.environ.get("EVALKEY", "")

def fail(msg):
    print(f"FAILED: {msg}"); sys.exit(1)

if not BASE or not PW: fail("U or EVALKEY not set (tools/lib.sh mints these per run; run through evals.sh, not standalone)")

# 1-4 · register, authorize with PKCE, sign in, exchange the code (tools/oauth_token.py)
try:
    access = oauth_access_token(BASE, EMAIL, PW)
except OAuthError as e:
    fail(str(e))

# 5 · USE it — the whole point: file a wrap-up through MCP with an OAuth token (D5: send_handoff is wrap_up). The one project
#     rule: a seat with several projects and none active names `project` on every write, so read whoami first, as a newcomer
#     would.
st, _, out = req(f"{BASE}/mcp", json.dumps({"jsonrpc": "2.0", "id": 0, "method": "tools/call",
                 "params": {"name": "whoami", "arguments": {}}}).encode(),
                 {"content-type": "application/json", "authorization": f"Bearer {access}"}, "POST")
if st != 200: fail(f"mcp whoami -> {st} {out[:200]}")
me0 = json.loads(json.loads(out)["result"]["content"][0]["text"])
args = {"eval": True, "summary": "M17 — OAuth acceptance run", "open": ["nothing"]}
if not me0.get("activeProject") and len(me0.get("projects") or []) > 1:
    want = os.environ.get("PROJ", "")
    args["project"] = want if want in me0["projects"] else me0["projects"][0]
call = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
    "name": "wrap_up", "arguments": args}}).encode()
st, _, out = req(f"{BASE}/mcp", call,
                 {"content-type": "application/json", "authorization": f"Bearer {access}"}, "POST")
if st != 200: fail(f"mcp tools/call -> {st} {out[:200]}")
res = json.loads(out).get("result", {})
if res.get("isError"): fail(f"tool errored: {res}")
filed = json.loads(res["content"][0]["text"])
if not filed.get("filed"): fail(f"wrap-up not filed: {filed}")

# 6 · attribution — checked through the TOOL, because OAuth guards /mcp only,
#     which is correct: a claude.ai user reaches everything through tools.
call = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                   "params": {"name": "whoami", "arguments": {}}}).encode()
st, _, out = req(f"{BASE}/mcp", call,
                 {"content-type": "application/json", "authorization": f"Bearer {access}"}, "POST")
me = json.loads(json.loads(out)["result"]["content"][0]["text"])
if me.get("person") != "Eval Seat": fail(f"misattributed: {me}")
# 7 · and the scoping still holds under OAuth — the owner-only tools (contracts/door.json, owner: true) stay hidden from a member
OWNER_TOOLS = {t["name"] for t in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "contracts", "door.json")))["tools"] if t.get("owner")}
if not OWNER_TOOLS: fail("contracts/door.json names no owner-only tool (the check would be vacuous)")
lst = json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/list"}).encode()
st, _, out = req(f"{BASE}/mcp", lst,
                 {"content-type": "application/json", "authorization": f"Bearer {access}"}, "POST")
names = {x["name"] for x in json.loads(out)["result"]["tools"]}
leak = names & OWNER_TOOLS
if leak: fail(f"owner tools leaked under OAuth: {sorted(leak)}")
print(f"OK filed={filed['id'][:8]} as={me['person']} lane={me.get('lane')} tools={len(names)} noleak({len(OWNER_TOOLS)} owner tools hidden)")
