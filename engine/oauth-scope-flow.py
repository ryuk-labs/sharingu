#!/usr/bin/env python3
"""M18 — OAuth scope enforcement (the /boot audit finding).

scopesSupported advertised ["mcp:read","mcp:write"] but nothing enforced it: every
claude.ai connection got full MCP write access regardless of the scope the person
actually consented to. This walks the real OAuth 2.1 flow (tools/oauth_token.py, the one
flow oauth-flow.py walks too) but requests scope=mcp:read ONLY, then proves:
  - a WRITE tool (open_items) is refused with insufficient_scope, isError=true
  - a READ tool (updates) still works, isError=false
  - tools/list lists no write tool at all (every tool contracts/door.json marks write: true)
Nothing here writes anything: the write probe is expected to be REFUSED before it
ever reaches the DB, and the read probe is a plain read.
"""
import json, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))
from oauth_token import oauth_access_token, OAuthError, req  # noqa: E402

# the dev org's minted member seat (tools/lib.sh mints a seat per run and exports it under these generic names; evals.sh runs
# this file as a subprocess, so it inherits them)
BASE = os.environ.get("U", "").rstrip("/")
EMAIL = os.environ.get("RYUKLABS_EVALSEAT_EMAIL", "")
PW = os.environ.get("EVALKEY", "")

def fail(msg):
    print(f"FAILED: {msg}"); sys.exit(1)

if not BASE or not PW: fail("U or EVALKEY not set (tools/lib.sh mints these per run; run through evals.sh, not standalone)")
WRITE_TOOLS = {t["name"] for t in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "contracts", "door.json")))["tools"] if t.get("write")}
if "open_items" not in WRITE_TOOLS: fail("contracts/door.json does not mark open_items a write (the probe below would prove nothing)")

# 1-4 · register, authorize with PKCE for scope mcp:read ONLY, sign in, exchange the code
try:
    access = oauth_access_token(BASE, EMAIL, PW, scope="mcp:read", client_name="eval-client-scope")
except OAuthError as e:
    fail(str(e))
H = {"content-type": "application/json", "authorization": f"Bearer {access}"}

# 5 · a WRITE tool must be REFUSED — this never touches the DB, it is refused before that
call = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
    "name": "open_items", "arguments": {"title": "should never be opened — scope eval"}}}).encode()
st, _, out = req(f"{BASE}/mcp", call, H, "POST")
if st != 200: fail(f"open_items mcp call -> {st} {out[:200]}")
res = json.loads(out).get("result", {})
if not res.get("isError"): fail(f"WRITE tool was NOT refused under a read-only grant: {res}")
body_text = json.loads(res["content"][0]["text"])
if body_text.get("error") != "insufficient_scope": fail(f"wrong refusal shape: {body_text}")

# 6 · a READ tool must still work
call = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "updates", "arguments": {}}}).encode()
st, _, out = req(f"{BASE}/mcp", call, H, "POST")
if st != 200: fail(f"updates mcp call -> {st} {out[:200]}")
res = json.loads(out).get("result", {})
if res.get("isError"): fail(f"READ tool was refused under a read-only grant: {res}")

# 7 · tools/list must not even advertise a write tool under this grant
call = json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/list"}).encode()
st, _, out = req(f"{BASE}/mcp", call, H, "POST")
names = {x["name"] for x in json.loads(out)["result"]["tools"]}
leak = names & WRITE_TOOLS
if leak: fail(f"write tools listed under a read-only grant: {sorted(leak)}")
if "updates" not in names: fail(f"the read tool updates is not listed under a read-only grant: {sorted(names)}")

print(f"OK write_refused=insufficient_scope read_ok=True list_hides_write=True ({len(WRITE_TOOLS)} write tools) tools={len(names)}")
