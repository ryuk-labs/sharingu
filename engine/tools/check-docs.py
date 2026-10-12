#!/usr/bin/env python3
"""tools/check-docs.py — the docs check (BETA.md: a doc names only what exists; owner, 2026-10-02: no dead docs).

It reads EVERY markdown doc of the repo (git's tracked and untracked-not-ignored `*.md`, less EXCLUDE) and fails when one
names something that does not exist:
  - a path: on disk, read beside the doc, from the repo root, from engine/ or from the folders a doc names files in
    without their folder (SEARCH); a pattern (<x>, {x}, *, NN, ~) is not a path and is skipped, and so are a
    machine-local run folder (`.runs/`), an R2 key (R2_PREFIXES), an MCP method and a bare extension (`.md`); a doc
    listed in EXTERNAL may name files under an outside folder, checked only where that folder is on this machine;
  - a route ("GET /x", "POST /x", or a bare `/x` in backticks): a row of contracts/door.json's rest (":id" and "<id>"
    match any one segment); a bare `/x` that names a skill of .claude/skills is a slash command, not a route;
  - a tool: a snake_case name in backticks (a tool of contracts/door.json, else a table, column, index or trigger of
    boot.sql or an error code of the contract: those are not tool names), and in the how-to docs a one-word name in
    backticks where the line speaks of a call or a tool, or a bullet that leads with it;
  - a command: `sh <script>`, `node <script>`, `python3 <script>`, in backticks or a fenced block, from the repo root or
    from engine/;
  - a migration: every `migrate-0NN` (with or without .sql) is a file in engine/;
  - a commit: every backticked 9-to-40-hex-digit sha resolves (`git cat-file -e`);
  - a link: every relative markdown link's target exists.
A name that is PLANNED (below, with the queue step that builds it) passes until a plan doc ticks that step
(`- [x] **<step>`); from then on it must exist like any other name.
Fast and offline: it reads files and asks git only (no worker, no network).

  python3 tools/check-docs.py              # every doc; exit 0 clean, 1 with every finding listed
  python3 tools/check-docs.py <file.md>…   # the named docs only (the selftest's failing fixture)

The rules live in check_text(), which the selftest (tools/check-docs-selftest.py) drives table-first with a stub context.
"""
import glob, json, os, re, sqlite3, subprocess, sys

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ENGINE)
# docs not read by default: the main session's own status file (it names work in flight by design: check it by naming
# it), the release note (the one doc that names the door's old names, by design: tools/names-check.mjs and the smoke's
# s25-names prove them gone), the product's preset texts (tools/presets-selftest.mjs checks them) and test fixtures
EXCLUDE = re.compile(r"^(docs/plan/HANDOFF\.md|docs/RELEASE-NOTES\.md|engine/src/presets/.*|plugin/skills/.*|.*/fixtures/.*)$")   # plugin/skills are the presets' generated copies (9.1): the same exemption, the gate's drift check keeps them true
# how-to docs: a one-word tool name is checked here; a plan doc (docs/plan/) names the tools of the plan by design
HOWTO = {"AGENTS.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md", "SECURITY.md", "engine/CLAUDE.md", "engine/README.md",
         "engine/BUILD.md", "docs/INSTALL.md", "engine/ORG-SETUP.md"}
SEARCH = ["", "engine", "engine/src", "engine/src/knowledge", "engine/tools", "engine/tools/import", "docs/plan", "contracts"]
# a doc that names files of a folder outside this repo: resolved there only when the folder is on this machine
EXTERNAL = {"docs/plan/LOOK.md": ["~/batcave_vm/sharingu_website"]}
# names the plan has decided and a queue step builds: {name: step}. Allowed until a plan doc ticks the step.
PLANNED = {".claude-plugin/plugin.json": "M1", ".mcp.json": "M1"}
R2_PREFIXES = ("serve/", "inbox/", "backups/", "renders/")
MCP_METHODS = {"resources/read", "resources/list", "tools/call", "tools/list", "prompts/list"}
EXT = (".md", ".js", ".mjs", ".sh", ".py", ".json", ".jsonc", ".sql", ".template", ".html", ".css")
METHOD_ROUTE = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE)\s+(/[A-Za-z0-9_\-./:<>{}]*)")
CMD = re.compile(r"(?:^|[\s;&|(`])(sh|node|python3)\s+(?:-[a-z]\S*\s+)*([A-Za-z0-9_./\-]+\.(?:sh|mjs|js|py))\b")
SNAKE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$")
WORD = re.compile(r"^[a-z][a-z0-9]*$")
SHA = re.compile(r"^[0-9a-f]{9,40}$")
MIGRATION = re.compile(r"\bmigrate-(\d{3}[a-z]?)\b")
LINK = re.compile(r"\]\(([^)\s]+)\)")
TOOL_LINE = re.compile(r"\b(call|calls|tool|tools)\b", re.I)
HISTORY = re.compile(r"\b(deleted|retired|removed|gone)\b", re.I)
PATTERN_MARKS = ("<", ">", "{", "}", "*", "~", "NN", "[", "]", "$", "…")


def boot_names():
    """every table, column, index and trigger name of engine/boot.sql (built in memory: a column is never a tool)"""
    db = sqlite3.connect(":memory:")
    db.executescript(open(os.path.join(ENGINE, "boot.sql")).read())
    names = set()
    for typ, name in db.execute("SELECT type, name FROM sqlite_master"):
        names.add(name)
        if typ == "table":
            names |= {r[1] for r in db.execute(f'PRAGMA table_info("{name}")')}
    return names


def ticked_steps():
    """the queue steps a plan doc has ticked: `- [x] **D5 · …`"""
    out = set()
    for p in glob.glob(os.path.join(REPO, "docs", "plan", "*.md")):
        out |= set(re.findall(r"^\s*- \[x\] \*\*([A-Z][A-Za-z0-9]*)\b", open(p).read(), re.M))
    return out


class Commits:
    """one `git cat-file --batch-check` for every sha the docs name"""
    def __init__(self):
        self.seen = {}
    def __call__(self, sha):
        if sha not in self.seen:
            r = subprocess.run(["git", "-C", REPO, "cat-file", "-e", sha + "^{commit}"], capture_output=True)
            self.seen[sha] = r.returncode == 0
        return self.seen[sha]


def load_context():
    """the real context: the contract's tools, routes and error codes, boot.sql's names, the disk, git"""
    door = json.load(open(os.path.join(REPO, "contracts", "door.json")))
    tools = {t["name"] for t in door.get("tools", [])}
    routes = [(r.get("method", "GET"), r["path"]) for r in door.get("rest", [])]
    errors = set(k for k in (door.get("errors") or {}) if not k.startswith("_")) if isinstance(door.get("errors"), dict) else set()
    errors |= set(re.findall(r'"error":\s*"([a-z_]+)"', open(os.path.join(REPO, "contracts", "door.json")).read()))
    skills = {d for d in os.listdir(os.path.join(REPO, ".claude", "skills"))} if os.path.isdir(os.path.join(REPO, ".claude", "skills")) else set()
    return {"tools": tools, "routes": routes, "notTools": errors | boot_names(), "skills": skills, "ticked": ticked_steps(),
            "commit": Commits(), "exists": lambda rel: os.path.exists(os.path.join(REPO, rel)),
            "outside": lambda root, rel: (lambda r: not os.path.isdir(r) or os.path.exists(os.path.join(r, rel)))(os.path.expanduser(root))}


def _seg_match(pattern, path):
    p = [s for s in pattern.split("/") if s != ""]
    q = [s for s in path.split("?")[0].split("/") if s != ""]
    if len(p) != len(q):
        return False
    for a, b in zip(p, q):
        if a.startswith(":") or b.startswith(":") or re.match(r"^[<{].*[>}]$", b):
            continue
        if a != b:
            return False
    return True


def route_known(ctx, method, path):
    path = path.rstrip(".,;:)")
    return any((method is None or m == method) and _seg_match(p, path) for m, p in ctx["routes"])


def path_known(ctx, token, doc):
    t = token[2:] if token.startswith("./") else token
    t = t.rstrip("/")
    if not t:
        return True
    bases = [os.path.dirname(doc)] + SEARCH
    if any(ctx["exists"](os.path.normpath(os.path.join(b, t))) for b in bases):
        return True
    return any(ctx["outside"](root, t) for root in EXTERNAL.get(doc, []))


def is_pathish(tok):
    if any(m in tok for m in PATTERN_MARKS) or "://" in tok or " " in tok or tok.startswith("/") or tok.startswith("-"):
        return False
    if re.match(r"^\d", tok) or tok.count("/") == 0 and not tok.endswith(EXT):
        return False
    if re.search(r"[A-Z_]{4,}", tok) and "/" not in tok:   # an env var or a constant, not a file
        return False
    if re.match(r"^\.[a-z]+$", tok):   # a bare extension (`.md`)
        return False
    if ".runs/" in tok or tok.startswith(R2_PREFIXES) or tok in MCP_METHODS:   # machine-local, an R2 key, an MCP method
        return False
    return bool(re.match(r"^[A-Za-z0-9_.@\-/]+$", tok)) and (tok.endswith("/") or tok.endswith(EXT) or "/" in tok)


def planned(ctx, name):
    step = PLANNED.get(name)
    return step is not None and step not in ctx["ticked"]


def check_text(text, doc, ctx):
    """-> [(line, kind, token, why)] for one doc's text"""
    out = []
    howto = doc in HOWTO
    fenced = False
    lines = text.splitlines()
    # the paragraph each line sits in (blank-line separated): "deleted" may sit on the line after the name it speaks of
    para, start = {}, 0
    for i in range(len(lines) + 1):
        if i == len(lines) or not lines[i].strip():
            block = " ".join(lines[start:i])
            for k in range(start, i):
                para[k] = block
            start = i + 1
    for n, line in enumerate(lines, 1):
        if line.strip().startswith("```"):
            fenced = not fenced
            continue
        spans = re.findall(r"`([^`\n]+)`", line) if not fenced else [line]
        # commands: in a fenced block (the whole line) or a backtick span
        for s in spans:
            for m in CMD.finditer(" " + s):
                script = m.group(2)
                if not any(ctx["exists"](os.path.normpath(os.path.join(b, script))) for b in ("", "engine")):
                    out.append((n, "command", f"{m.group(1)} {script}", "no such script from the repo root or engine/"))
        # migrations, anywhere on the line
        for m in MIGRATION.finditer(line):
            if not glob_migration(ctx, m.group(1)):
                out.append((n, "migration", f"migrate-{m.group(1)}", "no such engine/migrate-NNN.sql"))
        # routes: "METHOD /x" anywhere on the line (prose too), and a bare `/x` in backticks
        for m in METHOD_ROUTE.finditer(line):
            if not route_known(ctx, m.group(1), m.group(2)):
                out.append((n, "route", f"{m.group(1)} {m.group(2).rstrip('.,;:)')}", "not a route of contracts/door.json"))
        if fenced:
            continue
        # relative links
        for m in LINK.finditer(line):
            target = m.group(1).split("#")[0]
            if not target or re.match(r"^[a-z]+:", target) or target.startswith("/"):
                continue
            if not ctx["exists"](os.path.normpath(os.path.join(os.path.dirname(doc), target))):
                out.append((n, "link", target, "no such file beside the doc"))
        # a paragraph that says a thing was deleted names it on purpose (a table row speaks only for itself)
        gone = HISTORY.search(re.sub(r"`[^`]*`", "", line if line.lstrip().startswith("|") else para.get(n - 1, line)))
        for s in spans:
            tok = s.strip()
            if planned(ctx, tok):
                continue
            if SHA.match(tok) and re.search(r"[a-f]", tok) and re.search(r"\d", tok):
                if not ctx["commit"](tok):
                    out.append((n, "commit", tok, "no such commit (git cat-file -e)"))
                continue
            if gone and (is_pathish(tok) or SNAKE.match(tok)):
                continue
            if not howto and is_pathish(tok) and re.match(r"^[A-Za-z0-9_.\-]+/$", tok):
                continue   # a plan doc's one-segment folder (`gtm/`) is often a project's own doc folder, not this repo's
            if re.match(r"^/[a-z][A-Za-z0-9_\-/:]*$", tok) and not route_known(ctx, None, tok):
                if tok[1:] in ctx["skills"]:
                    continue   # a slash command (`/mcq`), not a route
                out.append((n, "route", tok, "not a route of contracts/door.json"))
            elif is_pathish(tok) and not path_known(ctx, tok, doc):
                out.append((n, "path", tok, "no such file or folder"))
            elif SNAKE.match(tok) and tok not in ctx["tools"] and tok not in ctx["notTools"]:
                out.append((n, "tool", tok, "not a tool of contracts/door.json (nor a boot.sql name or an error code)"))
            elif howto and WORD.match(tok) and tok not in ctx["tools"]:
                lead = re.match(r"^\s*[-*]\s+`" + re.escape(tok) + r"`", line)
                spoken = TOOL_LINE.search(line) and re.search(r"(?:call|calls|tool|tools)\s+`" + re.escape(tok) + r"`|`" + re.escape(tok) + r"`\s+(?:tool|call)", line, re.I)
                if lead or spoken:
                    out.append((n, "tool", tok, "not a tool of contracts/door.json"))
    return out


def glob_migration(ctx, num):
    return ctx["exists"](f"engine/migrate-{num}.sql")


def default_docs():
    r = subprocess.run(["git", "-C", REPO, "ls-files", "--cached", "--others", "--exclude-standard", "*.md"],
                       capture_output=True, text=True)
    return sorted(d for d in set(r.stdout.split()) if not EXCLUDE.match(d) and os.path.exists(os.path.join(REPO, d)))


def main(argv):
    ctx = load_context()
    docs = argv or default_docs()
    findings = []
    for d in docs:
        rel = os.path.relpath(os.path.abspath(d if os.path.isabs(d) or argv else os.path.join(REPO, d)), REPO)
        text = open(os.path.join(REPO, rel)).read()
        findings += [(rel,) + f for f in check_text(text, rel, ctx)]
    for rel, n, kind, tok, why in findings:
        print(f"  ✗ {rel}:{n}  {kind} `{tok}` — {why}")
    print(f"check-docs: {len(docs)} docs, {len(findings)} finding(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
