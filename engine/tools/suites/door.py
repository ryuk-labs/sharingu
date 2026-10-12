#!/usr/bin/env python3
"""tools/suites/door.py — the suites' one way through the MCP door (evals.sh, sims.sh), as any client calls it.

    DOOR_KEY=<key> U=<worker url> python3 tools/suites/door.py tool <name> '<arguments json>' | @<file holding them>
        -> the tool's answer as one line of JSON; a dict answer carries "_isError" (the result's isError) beside its fields,
           any other answer is {"_text": <it>, "_isError": ...}; {} when the door did not answer JSON-RPC at all
    DOOR_KEY=<key> U=<worker url> python3 tools/suites/door.py file '<preview arguments json>'
        -> preview, then file with the preview's id and the SAME items (the folded write: MCP.md, engine/tools/names.json):
           {"step": "preview"|"file", "isError", "preview": <the preview's answer>, "receipt": <file's answer>,
            "id", "route", "status": the first filed item's (or null)}

The key comes from the environment (DOOR_KEY, never argv) and is never printed. Every argument a suite sends carries its own
eval mark (tools/check-suite-marks.py reads the calls); this file adds nothing to them.
"""
import json, os, sys, urllib.error, urllib.request

BASE = os.environ.get("U", "").rstrip("/")
KEY = os.environ.get("DOOR_KEY", "")
_rpc = [0]


def call(name, args):
    _rpc[0] += 1
    body = json.dumps({"jsonrpc": "2.0", "id": _rpc[0], "method": "tools/call", "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(BASE + "/mcp", data=body, method="POST", headers={
        "content-type": "application/json", "accept": "application/json", "authorization": "Bearer " + KEY,
        "user-agent": "sharingu-suites/door.py"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raw = e.read()
    except Exception:
        return None
    try:
        res = json.loads(raw).get("result")
    except Exception:
        return None
    if not isinstance(res, dict):
        return None
    t = ((res.get("content") or [{}])[0] or {}).get("text")
    try:
        out = json.loads(t)
    except Exception:
        out = {"_text": t}
    if not isinstance(out, dict):
        out = {"_text": out}
    out["_isError"] = bool(res.get("isError"))
    return out


def main():
    if not BASE or not KEY or len(sys.argv) < 3:
        print("{}"); return
    verb = sys.argv[1]
    if verb == "tool" and len(sys.argv) >= 3:
        a = sys.argv[3] if len(sys.argv) > 3 else ""
        args = json.loads(open(a[1:]).read() if a.startswith("@") else a) if a else {}   # @<file>: arguments too big for argv
        print(json.dumps(call(sys.argv[2], args) or {}))
    elif verb == "file":
        args = json.loads(sys.argv[2])
        pv = call("preview", args) or {}
        if pv.get("_isError") or not pv.get("previewId"):
            print(json.dumps({"step": "preview", "isError": True, "preview": pv, "receipt": None, "id": None, "route": None, "status": None})); return
        fl = call("file", {"previewId": pv["previewId"], "items": args.get("items") or []}) or {}
        first = ((fl.get("items") or [{}])[0] or {}).get("filed") or {}
        res0 = (fl.get("results") or [{}])[0] or {}
        print(json.dumps({"step": "file", "isError": bool(fl.get("_isError") or fl.get("error")), "preview": pv, "receipt": fl,
                          "id": first.get("id") or res0.get("id"), "route": first.get("route"), "status": first.get("status") or res0.get("status")}))
    else:
        print("{}")


main()
