#!/usr/bin/env python3
"""tools/oauth_token.py — ONE OAuth 2.1 access token for a seat, the way claude.ai gets one (U-READY-e, 2026-09-29).

Steps 1-4 of the M17 flow, extracted from oauth-flow.py so every caller walks the SAME flow: dynamic client
registration → authorize with PKCE (S256) → sign in on the consent page → exchange the code. oauth-flow.py (M17)
imports `oauth_access_token` and keeps steps 5-7 (USE the token, attribution, scoping); the readiness walk
(U-READY-a) can pipe the CLI.

    from oauth_token import oauth_access_token, OAuthError
    access = oauth_access_token(base, email, password)            # scope defaults to "mcp:read mcp:write"

A failed step raises OAuthError carrying exactly the message oauth-flow.py's fail() printed before the extraction
(e.g. "register -> 404 b'...'"), so M17's `FAILED: <msg>` line is byte-identical.

CLI (for a pipe ONLY): reads env U (the base URL), RYUKLABS_EVALSEAT_EMAIL, EVALKEY and optional SCOPE, and prints
ONLY the access token to stdout; on failure `FAILED: <msg>` goes to stderr and the exit code is 1. The token is a
LIVE bearer credential: a caller captures it into a variable and never echoes it, logs it or writes it to a file.
"""
import base64, hashlib, json, os, re, secrets, sys, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "sharingu-oauth-eval"}


class OAuthError(Exception):
    """One OAuth step failed; str(e) is the message M17 prints after `FAILED: `."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


def req(url, data=None, headers=None, method=None, redirect=True):
    h = {**UA, **(headers or {})}
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    op = urllib.request.build_opener() if redirect else urllib.request.build_opener(NoRedirect)
    try:
        with op.open(r) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def oauth_access_token(base, email, password, scope="mcp:read mcp:write",
                       client_name="eval-client", redirect_uri="https://example.invalid/cb"):
    base = base.rstrip("/")
    # 1 · dynamic client registration
    body = json.dumps({"client_name": client_name,
                       "redirect_uris": [redirect_uri],
                       "token_endpoint_auth_method": "none"}).encode()
    st, _, out = req(f"{base}/oauth/register", body, {"content-type": "application/json"}, "POST")
    if st not in (200, 201): raise OAuthError(f"register -> {st} {out[:120]}")
    client_id = json.loads(out)["client_id"]

    # 2 · authorize with PKCE
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    q = urllib.parse.urlencode({"response_type": "code", "client_id": client_id,
        "redirect_uri": redirect_uri, "scope": scope,
        "state": "evalstate", "code_challenge": challenge, "code_challenge_method": "S256"})
    st, _, page = req(f"{base}/oauth/authorize?{q}")
    if st != 200: raise OAuthError(f"authorize GET -> {st}")
    m = re.search(rb'name="oauth_req" value="([^"]+)"', page)
    if not m: raise OAuthError("no oauth_req token on the sign-in page")

    # 3 · sign in on the consent page
    form = urllib.parse.urlencode({"oauth_req": m.group(1).decode(),
                                   "email": email, "password": password}).encode()
    st, hdrs, out = req(f"{base}/oauth/authorize", form,
                        {"content-type": "application/x-www-form-urlencoded"}, "POST", redirect=False)
    if st not in (301, 302, 303, 307): raise OAuthError(f"sign-in -> {st} (expected a redirect) {out[:160]}")
    code = urllib.parse.parse_qs(urllib.parse.urlparse(hdrs["Location"]).query).get("code", [None])[0]
    if not code: raise OAuthError("no authorization code in the redirect")

    # 4 · exchange the code
    tok_body = urllib.parse.urlencode({"grant_type": "authorization_code", "code": code,
        "redirect_uri": redirect_uri, "client_id": client_id,
        "code_verifier": verifier}).encode()
    st, _, out = req(f"{base}/oauth/token", tok_body,
                     {"content-type": "application/x-www-form-urlencoded"}, "POST")
    if st != 200: raise OAuthError(f"token -> {st} {out[:160]}")
    access = json.loads(out).get("access_token")
    if not access: raise OAuthError("no access_token")
    return access


def main():
    base = os.environ.get("U", "").rstrip("/")
    email = os.environ.get("RYUKLABS_EVALSEAT_EMAIL", "")
    pw = os.environ.get("EVALKEY", "")
    scope = os.environ.get("SCOPE", "") or "mcp:read mcp:write"
    try:
        if not base or not pw:
            raise OAuthError("U or EVALKEY not set (tools/lib.sh mints these per run)")
        access = oauth_access_token(base, email, pw, scope)
    except OAuthError as e:
        print(f"FAILED: {e}", file=sys.stderr); sys.exit(1)
    sys.stdout.write(access + "\n")


if __name__ == "__main__":
    main()
