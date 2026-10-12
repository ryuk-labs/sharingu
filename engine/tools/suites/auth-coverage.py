#!/usr/bin/env python3
"""tools/suites/auth-coverage.py — evals.sh AC: every REST row of the door's contract (contracts/door.json `rest`, generated
from src/index.js CAPABILITIES) is probed at the real door for the auth it declares. A mis-tiered row (owner served to a
non-owner, a gated row open to nobody) fails HERE. Per row (its :params filled with ids that exist nowhere):
  · signed out, as a script (Accept: application/json, no credential; a POST sends {}):
      auth none  -> never 401/403 (POST /login, the sign-in itself, answers a missing password 401 invalid_login)
      otherwise  -> 401
  · as a non-owner seated on no project (TESTKEY, the minted tester):
      auth owner -> 403
      session (a browser's own ACCOUNT session only: POST /orgs/seat) -> 401: a bearer is a key, never a browser session
      reader / bearer -> passes auth: never 401, and never a 403 owner_only (POST /signout is not pressed: it signs out)
  · a GET row that is not public, as a browser navigation (Sec-Fetch-Dest document, no credential) -> 302 /login?next=
    (THE sign-in rule, door.json signIn), and with a bad bearer -> 401 (a key is a key, never a page)
Prints one line per failed assertion and a last line `AC <ok> <failed> <rows>`. Env: U, TESTKEY (never printed).
"""
import json, os, re, sys, urllib.error, urllib.request

BASE = os.environ.get("U", "").rstrip("/")
TESTKEY = os.environ.get("TESTKEY", "")
HERE = os.path.dirname(os.path.abspath(__file__))
CONTRACT = os.path.join(HERE, "..", "..", "..", "contracts", "door.json")
PARAMS = {"id": "T-20200101-001", "hash": "0" * 64, "qid": "QZZ000009", "ref": "no-such-goal-ac", "v": "999",
          "slug": "no-such-slug-ac", "file": "nope-ac.woff2", "path": "nope-ac.md", "plane": "arch", "kind": "goal", "role": "nobody"}
BADKEY = "notarealkey0000000000000000000000000000"
# a row whose empty body reaches a branch the contract gives the owner alone (POST /project {key: ""} is the org rollup, owner
# only) is probed with a body that reaches its seated-reader branch instead
PROBE_BODY = {("POST", "/project"): {"key": "no-such-project-ac"}}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


OPENER = urllib.request.build_opener(NoRedirect)


def hit(method, path, headers, body=None):
    data = None
    if method != "GET":
        data = json.dumps(body if body is not None else {}).encode()
        headers = {**headers, "content-type": "application/json"}
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"user-agent": "sharingu-suites/auth-coverage", **headers})
    try:
        with OPENER.open(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return 0, {}, str(e).encode()


def err_of(raw):
    try:
        return (json.loads(raw) or {}).get("error")
    except Exception:
        return None


def main():
    if not BASE or not TESTKEY:
        print("AC 0 1 0"); print("  .AC FAIL no target or no tester key minted"); return
    rows = json.load(open(CONTRACT))["rest"]
    ok = bad = 0
    lines = []

    def check(cond, what):
        nonlocal ok, bad
        if cond: ok += 1
        else: bad += 1; lines.append("  .AC FAIL " + what)

    for row in rows:
        m, p, auth = row["method"], row["path"], row.get("auth")
        path = re.sub(r":([a-z]+)", lambda x: PARAMS.get(x.group(1), "zz-ac"), p)
        label = f"{m} {p} [{auth}]"
        # signed out, a script
        st, _, raw = hit(m, path, {"accept": "application/json"})
        if auth == "none":
            if (m, p) == ("POST", "/login"):
                check(st == 401 and err_of(raw) == "invalid_login", f"{label} signed out want 401 invalid_login got {st} {err_of(raw)}")
            else:
                check(st not in (401, 403) and 200 <= st < 500, f"{label} signed out want a public answer got {st}")   # G2: a 500, or no answer at all, is no answer
            continue
        check(st == 401, f"{label} signed out want 401 got {st}")
        # a non-owner seated nowhere
        if (m, p) != ("POST", "/signout"):
            st, _, raw = hit(m, path, {"accept": "application/json", "authorization": "Bearer " + TESTKEY}, PROBE_BODY.get((m, p)))
            if auth == "owner":
                check(st == 403, f"{label} non-owner want 403 got {st} {err_of(raw)}")
            elif auth == "session":
                # a session-only door (sprint 7's review, A1): only the holder's own browser session answers; a bearer is a key
                check(st == 401, f"{label} non-owner bearer want 401 (session-only door) got {st} {err_of(raw)}")
            else:
                check(st != 401 and 200 <= st < 500 and not (st == 403 and err_of(raw) == "owner_only"), f"{label} non-owner want past auth got {st} {err_of(raw)}")   # G2: a 500, or no answer, is not past auth
        # a browser navigation, and a bad bearer, on a GET door
        if m == "GET":
            st, h, _ = hit(m, path, {"accept": "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate"})
            loc = h.get("Location") or h.get("location") or ""
            check(st == 302 and "/login?next=" in loc, f"{label} browser signed out want 302 /login?next= got {st} {loc}")
            st, _, _ = hit(m, path, {"accept": "text/html", "authorization": "Bearer " + BADKEY})
            check(st == 401, f"{label} bad bearer want 401 got {st}")
    for l in lines:
        print(l)
    print(f"AC {ok} {bad} {len(rows)}")


main()
