#!/usr/bin/env python3
"""M16 · PRD §3.6 — OAuth must sit BEHIND resolveReader, never beside it.

The property that matters is not how many times a grant's identity is written, but that every use of it lives INSIDE
resolveReader. A second place turning props into a person would be the parallel auth path this rule exists to forbid.

A grant names its holder two ways since sprint 7 (7.5a, src/oauthgrants.js): `props.personId` (a SEAT grant: that seat) and
`props.accountId` (an ACCOUNT grant: the account's own seats). BOTH are identities: either one read outside resolveReader is a
miss (the sprint-7 review, D4: the check counted personId only, and read three files — an accountId -> seat path in any other
file passed). Every file under src/ is read (comments aside), and so is a destructuring that takes either name off props.
The ONE exemption: src/oauthgrants.js grantKindOf, which reads whether accountId is PRESENT to name the grant's KIND (it
returns a kind, never the id, and turns nothing into a person) — pinned to its exact line, so any change to it is a miss to
read again.

Three callers may pass props in, and ONLY these: the /mcp handler (src/mcp.js) and the router's two seams in src/index.js —
the workspace seam at the root (M-ADR-027 resolves the reader ONCE up front) and, since sprint 7 (7.4a), the seam under an
org's address (/<org>/…). Each hands ctx.props to resolveReader; none turns props into a person itself.

  python3 check-one-resolver.py [--src <dir>]   prints "ok" (exit 0) or every miss (exit 1)
  python3 check-one-resolver.py --prove         and each named mutation (a copy of src/) must turn it red
"""
import glob, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
IDS = ("personId", "accountId")
# the one exemption: the grant's KIND from whether accountId is present (src/oauthgrants.js), this exact line
KIND_LINE = re.compile(r'^export const grantKindOf = \(props\) => \(props && typeof props === "object" && typeof props\.accountId === "string" && props\.accountId \? GRANT_KINDS\.account : GRANT_KINDS\.seat\);$', re.M)


def strip_comments(text):
    """block comments and whole-line // comments out (a comment naming props.accountId is no read of it)"""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return "\n".join("" if l.lstrip().startswith("//") else l for l in text.split("\n"))


def uses(text):
    """every read of a grant identity off props: props.X, props?.X, props["X"], and { X } = props / ctx.props"""
    out = []
    for i in IDS:
        out += re.findall(r"\bprops\s*(?:\?\.|\.)\s*" + i + r"\b", text)
        out += re.findall(r"\bprops\s*\[\s*[\"'`]" + i + r"[\"'`]\s*\]", text)
        out += re.findall(r"\{[^{}]*\b" + i + r"\b[^{}]*\}\s*=\s*(?:\w+\s*(?:\?\.|\.)\s*)?props\b", text)
    return out


def check(src):
    files = sorted(glob.glob(os.path.join(src, "**", "*.js"), recursive=True))
    rel = lambda f: "src/" + os.path.relpath(f, src).replace(os.sep, "/")
    texts = {rel(f): strip_comments(open(f, encoding="utf-8").read()) for f in files}
    bad = []
    core = texts.get("src/core.js", "")
    i = core.find("async function resolveReader")
    j = core.find("\n}", i)
    if i < 0 or j < 0:
        return ["src/core.js: resolveReader not found"]
    inside = core[i:j]
    for f, t in texts.items():
        body = (core[:i] + core[j:]) if f == "src/core.js" else t
        if f == "src/oauthgrants.js":
            body, n = KIND_LINE.subn("", body)
            if n != 1:
                bad.append("src/oauthgrants.js: grantKindOf is not its pinned one line (it reads accountId's presence for the KIND only): read it again and re-pin it here")
        found = uses(body)
        if found:
            bad.append(f"{f}: {len(found)} read(s) of a grant identity outside resolveReader ({', '.join(sorted(set(found)))[:160]})")
    for k in IDS:
        if not re.search(r"\bprops\s*(?:\?\.|\.)\s*" + k + r"\b", inside):
            bad.append(f"resolveReader does not consult props.{k} (both grant kinds resolve there)")
    # the props-passing call sites
    calls = {f: [m for m in re.findall(r"resolveReader\([^)]*props[^)]*\)", t) if "props = null" not in m] for f, t in texts.items()}
    mcp, idx = calls.get("src/mcp.js", []), calls.get("src/index.js", [])
    if len(mcp) != 1:
        bad.append(f"{len(mcp)} props call sites in src/mcp.js (expected exactly 1: the MCP route)")
    if len(idx) != 2 or any("ctx && ctx.props" not in c for c in idx):
        bad.append(f"{len(idx)} props call sites in src/index.js (expected exactly 2: the root's workspace seam and the org address's seam, each passing ctx.props)")
    for f, c in calls.items():
        if f not in ("src/mcp.js", "src/index.js") and c:
            bad.append(f"{len(c)} props call sites in {f} (expected 0)")
    return bad


# each mutation: (name, file, needle in that file or None to add a new file, the text after) — every one must turn it red
MUTATIONS = [
    ("an account grant turned into a seat in src/mcp.js", "mcp.js", None,
     "\nexport async function shadowSeat(env, ctx, account) { return account ? await accountGrantSeat(env, ctx.props.accountId, {}) : null; }\n"),
    ("a seat grant's person read in another file (src/orgs.js)", "orgs.js", None,
     "\nexport const shadowPerson = (ctx) => ctx && ctx.props && ctx.props.personId;\n"),
    ("a destructuring of accountId off props (src/oauth.js)", "oauth.js", None,
     "\nexport function shadowOf(ctx) { const { accountId } = ctx.props; return accountId; }\n"),
    ("an optional-chained personId in a file of src/knowledge/", "knowledge/write.js", None,
     "\nexport const shadowWriter = (ctx) => ctx?.props?.personId;\n"),
    ("resolveReader stops consulting accountId", "core.js", "grant:${props.accountId}:", "grant:${props.org}:"),
]


def prove(src):
    red = 0
    for name, f, needle, after in MUTATIONS:
        d = tempfile.mkdtemp(prefix="one-resolver-")
        try:
            shutil.copytree(src, os.path.join(d, "src"))
            p = os.path.join(d, "src", f)
            t = open(p, encoding="utf-8").read()
            if needle is None:
                t = t + after
            else:
                if t.count(needle) < 1:
                    print(f"  ✗ mutation {name}: its needle is not in src/{f} (update this check)")
                    continue
                t = t.replace(needle, after)
                if f == "core.js":   # every read inside resolveReader's body
                    t = re.sub(r"props\.accountId", "props.org", t)
            open(p, "w", encoding="utf-8").write(t)
            r = subprocess.run([sys.executable, os.path.abspath(__file__), "--src", os.path.join(d, "src")], capture_output=True, text=True)
            ok = r.returncode == 1
            red += ok
            print(f"  {'✓' if ok else '✗'} mutation {name}: {'RED' if ok else f'rc {r.returncode}, NOT red'} — {r.stdout.strip()[:200]}")
        finally:
            shutil.rmtree(d, ignore_errors=True)
    print(f"{'✓' if red == len(MUTATIONS) else '✗'} one-resolver proof: {red} of {len(MUTATIONS)} mutations turn it red")
    return red == len(MUTATIONS)


if __name__ == "__main__":
    a = sys.argv[1:]
    src = a[a.index("--src") + 1] if "--src" in a else os.path.join(HERE, "src")
    bad = check(src)
    print("; ".join(bad) if bad else "ok")
    if bad:
        sys.exit(1)
    if "--prove" in a:
        sys.exit(0 if prove(src) else 1)
    sys.exit(0)
