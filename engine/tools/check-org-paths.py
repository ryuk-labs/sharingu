#!/usr/bin/env python3
"""check-org-paths.py — gate step (sprint 7, slice 7.4; docs/plan/PLATFORM.md §2 item 9: each org at agent.ryuklabs.io/<org> for
every page; the platform's own doors at the root).

Every URL the worker builds for an org — a page's links and forms, a Location header, the rail, the links an MCP or REST answer
carries, a page script's fetch — goes through ONE helper, src/orgpath.js orgPath(path) (orgUrl(origin, path) for an absolute
one; a page's own scripts call its client twin, ORG_PATH_CLIENT, by the same name), which puts the request's org base in front
(/<slug>). This check fails an APP path written as a literal anywhere else, so a link that forgot the org cannot ship: it would
send a person to the root, where their cookie signs no one in, or a member of two orgs into the other one.

  APP path   a path whose first segment is a route's (the registry, src/index.js CAPABILITIES) and not a PLATFORM path
             (src/orgpath.js PLATFORM_PATHS: the sign-in, the sign-up, creating an org, the MCP door, OAuth, the static files,
             which live at the root only). Both lists are READ from the source, never typed here.
Rules (each miss names its file, line and rule):
  literal   a string or template literal whose text OPENS with an app path ("/home", `/goals/${id}`) is the first argument of
            orgPath( or the second of orgUrl( — or sits in a ROUTE TEST (the router matching a path it was given: `path ===`,
            `.startsWith(`, a CAPABILITIES row's p:, …: CONTEXTS) or on ALLOW with its reason
  attr      inside a literal (a page's HTML), an attribute whose value opens with an app path or is the bare root
            (href="/map", action="/control", src="/render/…", href="/") — build it as href="${orgPath(…)}"
  quoted    inside a literal (a page's script, nested markup), a quoted app path ('/versions?head=1') not preceded by orgPath(
  joined    inside a template literal, an app path right after an expression (`${origin}/goals/…`): write
            ${orgUrl(origin, "/goals/…")} or ${orgPath(…)}
  registry  (sprint 7's review, B2) a read of a route registry by index (TAB_HREF[…], LIST_HREF[…], TAB_HOME[…]: REGISTRY_READS)
            is the argument of orgPath( (at any depth: orgPath(`${TAB_HREF[t]}?q`) counts), or a test (`TAB_HREF[t] ?`) — a
            registry's value handed out raw is a root path (the Library's "Lists on" link and MCP read's lists-on were)
A registry literal is exempt only in the FILE it lives in (REGISTRIES: (file, regex, reason)), never wherever its name appears;
an ALLOW or REGISTRIES entry no literal matches is itself a miss (a stale entry is a hole).
  python3 tools/check-org-paths.py [--src <dir>]     exit 0 clean, 1 with every miss
  python3 tools/check-org-paths.py --prove           and each named mutation (a copy of src/) must turn it red
"""
import importlib.util, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
if "--src" in sys.argv:
    SRC = os.path.abspath(sys.argv[sys.argv.index("--src") + 1])

# the one JavaScript scanner the gate already trusts (comments blanked, the inside of strings, templates and regexes kept apart)
_spec = importlib.util.spec_from_file_location("check_scoped_data", os.path.join(ROOT, "tools", "check-scoped-data.py"))
_csd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_csd)
scan, line_of, SKIP = _csd.scan, _csd.line_of, _csd.SKIP

# the route tests: the router (and a page's own script reading where it is) MATCHING a path it was handed, never building one
CONTEXTS = [
    (r"\b(?:path|p|pathname|rest|inner|u\.pathname|c\.p|k)\s*(?:===|!==|==|!=)\s*$", "a route test: the path it was handed, compared"),
    (r"\.(?:startsWith|endsWith|includes|indexOf)\(\s*$", "a route test: the path it was handed, matched by its start or end"),
    (r"\.slice\([^()]*,\s*-\s*$", "a route test: the path it was handed, read up to a suffix it matched (-\"/impact\".length)"),
    (r"\bsurface\s*:\s*$", "an event's record of the surface it came from (a label kept in the row, never a link)"),
    (r"\bVIEW_SRC_PREFIXES\s*=\s*\[\s*$", "the in-frame viewer's test of the src it was handed (GET /view)"),
    (r"\.slice\(\s*$", "a route test: the path it was handed, read past a prefix it matched (\"/goals/\".length)"),
    (r"\{\s*m\s*:\s*\"[^\"]*\"\s*,\s*p\s*:\s*$", "a CAPABILITIES row: the registry's route, declared"),
]
# the route REGISTRIES (sprint 7's review, B2: each exempt only in its own file, never wherever its name is spelled): a registry
# holds routes as data, and every link drawn from it goes through orgPath where it is read (the registry rule below).
# (file, a regex the code BEFORE the literal must end with, the reason)
REGISTRIES = [
    ("shell.js", r"\{\s*key\s*:\s*\"[^\"]*\"\s*,\s*label\s*:\s*\"[^\"]*\"\s*,\s*href\s*:\s*$", "a page registry row (src/shell.js PAGES, TABS): the route, drawn under the org by viewHref and navModel when the rail is rendered"),
    ("mapplanes.js", r"\{\s*key\s*:\s*\"[^\"]*\"\s*,\s*label\s*:\s*\"[^\"]*\"\s*,\s*href\s*:\s*$", "the Map's planes registry rows (src/mapplanes.js): the route, drawn under the org where the plane is linked"),
    ("mappage.js", r"\bVIEWS\s*=\s*\[(?:\[[^\]]*\],\s*)*\[[^\]]*$", "the Map's views registry (src/mappage.js VIEWS): drawn under the org by the toolbar"),
    ("extract.js", r"\bLIST_HREF\s*=\s*\{[^}]*$", "a kind's list page registry (src/extract.js LIST_HREF): drawn under the org by listHref"),
    ("extract.js", r"\bTAB_HREF\s*=\s*\{[^}]*$", "a tab's route registry (src/extract.js TAB_HREF): drawn under the org where the Library and MCP read link a card kind's tab"),
    ("cardpage.js", r"\bTAB_HREF\s*=\s*\{[^}]*$", "a tab's route registry (src/cardpage.js TAB_HREF): drawn under the org where a card's page links it"),
    ("shell.js", r"\bTAB_HOME\s*=\s*\{\s*map\s*:\s*$", "the rail's tab landing (src/shell.js TAB_HOME): the route, drawn under the org by navModel"),
    ("knowledge/schema.js", r"\b(?:at|place)\(\s*\"[^\"]*\"\s*,\s*$", "a where-it-shows registry row (src/knowledge/schema.js at): the route, resolved under the org where it becomes a link (resolvePlaces)"),
    ("shapes.js", r"\b(?:at|place)\(\s*\"[^\"]*\"\s*,\s*$", "a where-it-shows registry row (src/shapes.js place): the route, resolved under the org where it becomes a link (resolvePlaces)"),
    ("knowledge/schema.js", r"\bitem\((?:\s*\"[^\"]*\"\s*,){4}\s*$", "a checklist registry row's page (src/knowledge/schema.js item): the route, drawn under the org where What is missing links it"),
    ("index.js", r"\bGATED_SURFACE\s*=\s*\[[^\]]*$", "the gate's list of the routes a signed-out visit is sent to sign in from"),
    ("index.js", r"\bOWNER_ONLY\s*=\s*\[[^\]]*$", "the owner-only routes the gate refuses a seat"),
]
# the registries whose values are app paths, read by index: each read is orgPath's argument, or a test (the registry rule)
REGISTRY_READS = ["TAB_HREF", "LIST_HREF", "TAB_HOME"]
# the registry's prose: a route's or a tool's description (what GET /capabilities, the contract and tools/list answer), and the
# proof rule's examples (src/transmission.js), which NAME routes in words for a reader, never a link a page or an answer follows
PROSE = r"\b(?:does|desc|description)\s*:\s*$|\b(?:PROOF_EXAMPLES|GTM_PROOF_FORMS)\s*=\s*$"
# literals that open with an app path and are not built through orgPath, each with its reason: (file, a regex the code BEFORE the
# literal must end with, a regex the literal's text must match, the reason)
ALLOW = [
    ("formats.js", r"\bshows\s*:\s*\[(?:\{[^{}]*\},\s*)*\{\s*tab\s*:\s*\"[^\"]*\"\s*,\s*path\s*:\s*", r"^/", "the formats tool's documentation of where an item shows (the standard, the same for every org: src/formats.js ITEM_FORMS): a route, never a link"),
    ("*", r"encodeURIComponent\(\s*", r"^/artifact/$", "the in-frame viewer's src (GET /view?src=/artifact/<id>, an argument of the link orgPath builds): the file's path the viewer checks, then draws under the org"),
    ("shapes.js", r"\bproof\s*:\s*", r"^/artifact/<id>$", "a contribution example's proof (the formats tool's documentation): the placeholder a filer replaces with a file's link, never a link"),
]
# the generated files are data (the contract quotes routes; the client bundle is regenerated from its source, checked there)
SKIP_FILES = set(SKIP) | {"orgpath.js"}


def app_segments(src):
    """-> (app, platform): the registry's first segments that are not platform paths, and the platform paths themselves"""
    idx = open(os.path.join(src, "index.js")).read()
    segs = set()
    for m in re.finditer(r"\{\s*m:\"\w+\",\s*p:\"(/[^\"]*)\"", idx):
        s = (m.group(1).split("?")[0].split("/") + ["", ""])[1].lower()
        if s and not s.startswith(":"):
            segs.add(s)
    op = open(os.path.join(src, "orgpath.js")).read()
    pm = re.search(r"PLATFORM_PATHS\s*=\s*new Set\(\[([^\]]*)\]\)", op)
    platform = set(re.findall(r"\"([^\"]+)\"", pm.group(1))) if pm else set()
    return segs - platform, platform, len(segs)


def literals(code, plain):
    """-> [(start, end, kind, first)]: the text of every string literal (kind "s") and template chunk ("t"; first: the chunk
    right after the opening backtick) as offsets into plain — templates nested inside ${ … } expressions included. The scanner
    blanked every literal's inside in `code` (its delimiters kept), so a delimiter found in `code` is a real one."""
    out = []
    n, i = len(code), 0
    stack = []   # one entry per open ${ … }: (the brace depth inside it, the template's opening offset)
    depth = 0

    def template(j):
        """from just after a backtick or an expression's closing brace: one text chunk, to the next ` or ${"""
        k = j
        while k < n and code[k] != "`" and not (code[k] == "$" and k + 1 < n and code[k + 1] == "{"):
            k += 1
        return k

    while i < n:
        c = code[i]
        if c in "'\"" and plain[i] == c:
            j = i + 1
            while j < n and code[j] != c and code[j] != "\n":
                j += 1
            out.append((i + 1, j, "s", True, i + 1))
            i = j + 1
            continue
        if c == "`":
            k = template(i + 1)
            out.append((i + 1, k, "t", True, i + 1))
            if k < n and code[k] == "$":
                stack.append((depth, i + 1)); depth = 0; i = k + 2
            else:
                i = k + 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            if stack and depth == 0:
                depth, open_at = stack.pop()
                k = template(i + 1)
                out.append((i + 1, k, "t", False, open_at))
                if k < n and code[k] == "$":
                    stack.append((depth, open_at)); depth = 0; i = k + 2
                else:
                    i = k + 1
                continue
            depth -= 1
        i += 1
    return out


def check(src):
    app, platform, nsegs = app_segments(src)
    misses = []
    if nsegs < 20:
        misses.append(f"src/index.js: {nsegs} route segments read from CAPABILITIES (the shape changed?)")
    if len(platform) < 8:
        misses.append(f"src/orgpath.js: {len(platform)} PLATFORM_PATHS read (the shape changed?)")
    alt = "|".join(sorted((re.escape(s) for s in app), key=len, reverse=True))
    APP = rf"/(?:{alt})(?=[/?#\"'`$\\]|$)"
    opens = re.compile("^" + APP)
    attr = re.compile(r"\b(?:href|action|src|formaction)\s*=\s*\\?[\"']?(?:" + APP + r"|/(?=\\?[\"']))")
    quoted = re.compile(r"(?<![\w$])(\\?[\"'`])(" + APP + ")")
    used = [0] * len(ALLOW)
    reg_used = [0] * len(REGISTRIES)
    reads = re.compile(r"\b(?:" + "|".join(REGISTRY_READS) + r")\[")
    files = []
    for dirpath, _, names in os.walk(src):
        for nm in sorted(names):
            if nm.endswith(".js"):
                files.append(os.path.join(dirpath, nm))
    counted = {"orgPath": 0, "context": 0, "allow": 0}
    for path in sorted(files):
        rel = os.path.relpath(path, src)
        if os.path.basename(rel) in SKIP_FILES:
            continue
        text = open(path).read()
        code, plain = scan(text)
        for (a, b, kind, first, start) in literals(code, plain):
            t = plain[a:b]
            if (kind == "s" or first) and re.search(PROSE, code[max(0, a - 60):a - 1]):
                continue
            if kind == "s" or (kind == "t" and first):
                if opens.search(t):
                    before = code[max(0, a - 220):a - 1]
                    if re.search(r"\b(?:orgPath)\(\s*$", before) or re.search(r"\borgUrl\((?:[^()]|\([^()]*\))*,\s*$", before):
                        counted["orgPath"] += 1
                    elif any(re.search(rx, before) for rx, _ in CONTEXTS):
                        counted["context"] += 1
                    elif [k for k, (f, rx, _) in enumerate(REGISTRIES) if f == rel and re.search(rx, before)]:
                        for k in [k for k, (f, rx, _) in enumerate(REGISTRIES) if f == rel and re.search(rx, before)]: reg_used[k] += 1
                        counted["context"] += 1
                    else:
                        hit = [k for k, (f, bx, tx, _) in enumerate(ALLOW) if f in (rel, "*") and re.search(bx + r"$", before) and re.search(tx, t)]
                        if hit:
                            for k in hit: used[k] += 1
                            counted["allow"] += 1
                        else:
                            misses.append(f"{rel}:{line_of(text, a)}: literal — {t[:60]!r} built outside orgPath(): write orgPath({t[:24]!r}…) (src/orgpath.js)")
            elif kind == "t" and opens.search(t) and not re.search(r"\b(?:orgPath)\(\s*$|\borgUrl\((?:[^()]|\([^()]*\))*,\s*$", code[max(0, start - 220):start - 1]):
                misses.append(f"{rel}:{line_of(text, a)}: joined — an app path right after an expression ({t[:40]!r}): build it with orgUrl(origin, …) or orgPath(…)")
            for m in attr.finditer(t):
                misses.append(f"{rel}:{line_of(text, a + m.start())}: attr — {m.group(0)[:50]!r} in a page's markup: write {m.group(0).split('=')[0]}=\"${{orgPath(…)}}\"")
            for m in quoted.finditer(t):
                pre = t[max(0, m.start() - 12):m.start()]
                if re.search(r"orgPath\(\s*$", pre) or re.search(r"(?:href|action|src|formaction)\s*=\s*\\?$", pre):
                    continue   # orgPath's own argument (a page's script), or an attribute (reported above)
                misses.append(f"{rel}:{line_of(text, a + m.start())}: quoted — {t[m.start():m.start() + 40]!r} inside a literal (a page's script or nested markup): write orgPath({m.group(2)!r}…)")
        # the registry rule: every index read of a route registry is orgPath's argument (at any depth), or a test
        for m in reads.finditer(code):
            if registry_read_ok(code, m.start(), m.end()):
                counted["registry"] = counted.get("registry", 0) + 1
            else:
                misses.append(f"{rel}:{line_of(text, m.start())}: registry — {m.group(0)}…] handed out raw (a root path): write orgPath({m.group(0)}…])")
    for k, n in enumerate(used):
        if not n:
            f, bx, tx, _ = ALLOW[k]
            misses.append(f"{f}: allowlist — ALLOW entry /{tx}/ matches no literal: delete it (a stale entry is a hole)")
    for k, n in enumerate(reg_used):
        if not n:
            f, rx, _ = REGISTRIES[k]
            misses.append(f"{f}: registries — REGISTRIES entry /{rx[:40]}…/ matches no literal in {f}: delete it (a stale entry is a hole)")
    return misses, counted, len(app), len(files)


def registry_read_ok(code, start, open_end):
    """a registry's index read at code[start:…]: True when it is a TEST (its closing ] is followed by `?`, a ternary's condition)
    or sits inside an orgPath( call — walking out through every enclosing ( [ and ${ (an esc( or a template inside orgPath counts)
    until a statement's end (; or a block's {) says it is not"""
    n, j, d = len(code), open_end, 1
    while j < n and d:
        d += {"[": 1, "]": -1}.get(code[j], 0)
        j += 1
    if re.match(r"\s*\?(?![?.])", code[j:j + 4]):
        return True
    i, depth = start - 1, 0
    while i >= 0:
        c = code[i]
        if c in ")]}":
            depth += 1
        elif c in "([{":
            if depth:
                depth -= 1
            elif c == "(":
                if re.search(r"\borgPath\s*$", code[max(0, i - 12):i]):
                    return True
            elif c == "{" and not (i > 0 and code[i - 1] == "$"):
                return False   # a block (a function's body, an object at statement level): the read was never wrapped
        elif c == ";" and not depth:
            return False
        i -= 1
    return False


MUTATIONS = [
    ("the rail's Home link unwrapped", "shell.js", 'orgPath("/home")', '"/home"', "literal"),
    ("a Location header unwrapped", "index.js", 'location: orgPath("/home")', 'location: "/home"', "literal"),
    ("a page's form action as markup", "controlpage.js", 'action="${orgPath(`/control`)}"', 'action="/control"', "attr"),
    ("a page script's fetch unwrapped", "shell.js", "var headUrl=orgPath('/versions?head=1')", "var headUrl='/versions?head=1'", "quoted"),
    ("an MCP answer's link joined to the origin", "mcp.js", "url: orgUrl(url.origin, `/preview/${r.previewId}`),", "url: `${url.origin}/preview/${r.previewId}`,", "joined"),
    ("a platform path made an app path", "orgpath.js", '"login", "logout", ', '"logout", ', "literal|attr|quoted"),
    # sprint 7's review, B2: the Library's (and MCP read's) "Lists on" link handed out raw again, and a registry spelled in a file
    # that is not its own (an exemption by name alone would let it through)
    ("a registry read handed out raw", "extract.js", 'href: TAB_HREF[m.tab] ? orgPath(TAB_HREF[m.tab]) : orgPath("/library") }', 'href: TAB_HREF[m.tab] || orgPath("/library") }', "registry"),
    ("a registry spelled outside its own file", "mcp.js", "const NOT_YOURS_TO_CLAIM = ", 'const TAB_HREF = { home: "/home" }; const NOT_YOURS_TO_CLAIM = ', "literal"),
]


def main():
    misses, counted, napp, nfiles = check(SRC)
    if misses:
        for x in misses:
            print("  ✗ " + x)
        print(f"✗ org paths: {len(misses)} miss(es) in {nfiles} files")
    else:
        print(f"✓ org paths: every app path ({napp} route segments, the registry's less the platform's) is built by orgPath — {counted['orgPath']} literals through the helper, "
              f"{counted['context']} route tests and registry rows ({len(REGISTRIES)} registries, each in its own file), {counted['allow']} allowlisted ({len(ALLOW)} entries), "
              f"{counted.get('registry', 0)} registry reads each through orgPath or a test; no app path in a page's markup, script or joined to an origin outside it")
    if misses or "--prove" not in sys.argv:
        return 1 if misses else 0
    red = 0
    for name, f, a, b, want in MUTATIONS:
        d = tempfile.mkdtemp(prefix=".org-paths-mutation-", dir=ROOT)
        try:
            shutil.copytree(SRC, os.path.join(d, "src"))
            p = os.path.join(d, "src", f)
            s = open(p).read()
            if a not in s:
                print(f"  ✗ mutation {name}: its needle {a!r} is not in src/{f} (update this check)")
                continue
            open(p, "w").write(s.replace(a, b, 1))
            r = subprocess.run([sys.executable, os.path.abspath(__file__), "--src", os.path.join(d, "src")], capture_output=True, text=True)
            first = next((l for l in r.stdout.splitlines() if l.startswith("  ✗ ")), "")
            ok = r.returncode == 1 and re.search(r": (?:" + want + r") —", first)
            if ok: red += 1
            print(f"  {'✓' if ok else '✗'} mutation {name}: {'RED' if ok else f'rc {r.returncode}, NOT red as {want}'} — {first.strip()[:160]}")
        finally:
            shutil.rmtree(d, ignore_errors=True)
    print(f"{'✓' if red == len(MUTATIONS) else '✗'} org paths proof: {red} of {len(MUTATIONS)} mutations turn it red")
    return 0 if red == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
