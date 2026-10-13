#!/usr/bin/env python3
"""tools/suites/door.py — the suites' one way through the MCP door (evals.sh, sims.sh), as any client calls it.

    DOOR_KEY=<key> U=<worker url> python3 tools/suites/door.py tool <name> '<arguments json>' | @<file holding them>
        -> the tool's answer as one line of JSON; a dict answer carries "_isError" (the result's isError) beside its fields,
           any other answer is {"_text": <it>, "_isError": ...}; {} when the door did not answer JSON-RPC at all
    DOOR_KEY=<key> U=<worker url> python3 tools/suites/door.py file '<preview arguments json>'
        -> preview, then each part it answers with its write tool (sprint 19: file_contribution, save_knowledge,
           remove_knowledge), the preview's id and that part's items as previewed (file_parts below, the JS tools' twin:
           tools/import/door.mjs fileParts):
           {"step": "preview"|"file", "tool": the write tool that refused (or null), "isError", "preview": <the preview's
            answer>, "receipt": <every part's receipt as one: items, results, complete, counts, receipts by tool>,
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


WRITE_TOOLS = ("file_contribution", "save_knowledge", "remove_knowledge")


def file_parts(pv, items, only=None):
    """each part of a preview's answer ({tool, items: their numbers from 1}) filed with its tool and ITS items, in order ->
    (receipt, refused tool or None). The first refusal stops the rest (its answer is the receipt); a part already filed on
    this previewId (preview_filed) counts with its first receipt."""
    done = []
    for p in pv.get("parts") or []:
        args = {"previewId": pv["previewId"], "items": [items[n - 1] for n in p.get("items") or []]}
        if only:
            args["only"] = only
        out = call(p.get("tool"), args) or {}
        if out.get("error") == "preview_filed" and isinstance(out.get("receipt"), dict):
            out = dict(out["receipt"], repeat=True)
        elif out.get("_isError") or out.get("error") or not out:
            return out, p.get("tool")
        done.append((p.get("tool"), out))
    by_i = lambda k: sorted([x for _, o in done for x in (o.get(k) or [])], key=lambda x: x.get("i", 0))
    res = by_i("results")
    st = lambda s: len([x for x in res if x.get("status") == s])
    return {"previewId": pv.get("previewId"), "tools": [t for t, _ in done], "complete": all(o.get("complete") is True for _, o in done),
            "items": by_i("items"), "results": res, "counts": {"filed": st("filed"), "unchanged": st("unchanged"), "left": st("left"), "notFiled": st("not_filed")},
            "receipts": {t: o for t, o in done}}, None


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
            print(json.dumps({"step": "preview", "tool": None, "isError": True, "preview": pv, "receipt": None, "id": None, "route": None, "status": None})); return
        fl, refused = file_parts(pv, args.get("items") or [])
        first = ((fl.get("items") or [{}])[0] or {}).get("filed") or {}
        res0 = (fl.get("results") or [{}])[0] or {}
        print(json.dumps({"step": "file", "tool": refused, "isError": bool(refused or fl.get("_isError") or fl.get("error")), "preview": pv, "receipt": fl,
                          "id": first.get("id") or res0.get("id"), "route": first.get("route"), "status": first.get("status") or res0.get("status")}))
    else:
        print("{}")


main()
