#!/usr/bin/env python3
"""tools/check-docs-selftest.py — the docs check's rules, table-first, on a stub context (a fixed contract, disk, git and
plan), then the real CLI on a failing fixture (tools/fixtures/check-docs-bad.md: exit 1, every planted name found).
Offline, no worker."""
import importlib.util, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("check_docs", os.path.join(HERE, "check-docs.py"))
cd = importlib.util.module_from_spec(spec); spec.loader.exec_module(cd)

FILES = {"engine/tools/smoke.sh", "engine/src/holes.js", "engine/src/knowledge/store.js", "docs/plan/BETA.md", "engine/BUILD.md",
         "engine/gate.sh", "engine/tools", "contracts/door.json", "engine/migrate-047.sql", "engine/tools/import/read-board.mjs",
         "docs/INSTALL.md", "engine/ORG-SETUP.md"}
COMMITS = {"5d287b1b0"}
CTX = {"tools": {"whoami", "missing", "preview", "file", "wrap_up", "create_project"},
       "routes": [("GET", "/whoami"), ("GET", "/missing"), ("GET", "/contribution/:id"), ("POST", "/mcp"), ("POST", "/backup-dump")],
       "notTools": {"k_fill", "project_forbidden", "happened_at"}, "skills": {"mcq"}, "ticked": set(),
       "commit": lambda sha: sha in COMMITS, "exists": lambda rel: os.path.normpath(rel) in FILES,
       "outside": lambda root, rel: rel == "_ds/tokens/colors.css"}
TICKED = dict(CTX, ticked={"M1"})

# (name, doc, text, the findings wanted as [(kind, token)])
CASES = [
    ("a path that exists", "AGENTS.md", "see `engine/src/holes.js`", []),
    ("a path named from its folder", "engine/CLAUDE.md", "the reader `store.js`", []),
    ("a path beside its doc", "engine/ORG-SETUP.md", "through ship (`BUILD.md`)", []),
    ("a missing path", "AGENTS.md", "see `engine/src/gone.js`", [("path", "engine/src/gone.js")]),
    ("a missing folder", "AGENTS.md", "the `orchestrator/` lane", [("path", "orchestrator/")]),
    ("a pattern is not a path", "engine/ORG-SETUP.md", "the config `wrangler.<slug>.jsonc` and `migrate-0NN.sql`", []),
    ("an env var is not a path", "docs/INSTALL.md", "set `R_LOCAL_STATE_ROOT`", []),
    ("a deleted thing named in its paragraph", "AGENTS.md", "The old (the `orchestrator/` lane) was\ndeleted on 2026-09-30.", []),
    ("a plan doc's one-segment folder", "docs/plan/BETA.md", "strategy (docs under `gtm/`)", []),
    ("a route that exists", "docs/INSTALL.md", "`GET /whoami` proves it; POST /mcp in prose", []),
    ("a route with a param", "docs/plan/BETA.md", "GET /contribution/<id> reads one", []),
    ("a missing route", "docs/plan/BETA.md", "the backup (`POST /backup-all`)", [("route", "POST /backup-all")]),
    ("a wrong method", "docs/plan/BETA.md", "POST /whoami", [("route", "POST /whoami")]),
    ("a bare route in backticks", "docs/INSTALL.md", "the `/missing` page and `/nowhere`", [("route", "/nowhere")]),
    ("a snake tool that exists", "docs/plan/BETA.md", "`create_project` then `wrap_up`", []),
    ("a table or an error code is not a tool", "engine/CLAUDE.md", "over `k_fill`; refused `project_forbidden`", []),
    ("a snake tool that does not exist", "docs/plan/BETA.md", "then `submit_nothing`", [("tool", "submit_nothing")]),
    ("a how-to bullet that leads with a tool", "docs/INSTALL.md", "- `missing` — what is missing", []),
    ("a how-to bullet that leads with no tool", "docs/INSTALL.md", "- `frobnicate` — does things", [("tool", "frobnicate")]),
    ("a how-to call of no tool", "docs/INSTALL.md", "ask your AI to call `frob` first", [("tool", "frob")]),
    ("a how-to word that is not a tool claim", "docs/INSTALL.md", "name it with `project`", []),
    ("a plan doc names a tool a slice will build", "docs/plan/BETA.md", "- `search`, `read` — B5", []),
    ("a command that exists", "AGENTS.md", "`sh tools/smoke.sh` and `sh gate.sh`", []),
    ("a missing command", "AGENTS.md", "run `sh tools/gone.sh up`", [("command", "sh tools/gone.sh")]),
    ("a missing command in a fenced block", "AGENTS.md", "```\nnode tools/gone.mjs --x   # comment\n```", [("command", "node tools/gone.mjs")]),
    ("a fenced block's text is no path claim", "AGENTS.md", "```\ncd engine && npm install\n```", []),
    ("a boot.sql column is not a tool", "docs/plan/BETA.md", "the column `happened_at`", []),
    ("a run folder, an R2 key, an MCP method, an extension", "docs/plan/BETA.md",
     "`engine/.runs/d2b/PROGRESS.md`, `serve/tenant.json`, `resources/read`, every `.md`", []),
    ("a bare file of the importer", "docs/plan/MCP.md", "by `read-board.mjs`", []),
    ("an outside folder's file, where the doc may name it", "docs/plan/LOOK.md", "`_ds/tokens/colors.css`", []),
    ("an outside folder's file, from another doc", "docs/plan/BETA.md", "`_ds/tokens/colors.css`", [("path", "_ds/tokens/colors.css")]),
    ("a slash command is not a route", "docs/plan/BETA.md", "type `/mcq` or `/nothing`", [("route", "/nothing")]),
    ("a migration that exists, with or without .sql", "docs/plan/BETA.md", "`migrate-047` and migrate-047.sql", []),
    ("a migration that does not exist", "docs/plan/BETA.md", "`migrate-999` lands first", [("migration", "migrate-999")]),
    ("a commit that exists", "docs/plan/BETA.md", "(`5d287b1b0`)", []),
    ("a commit that does not exist", "docs/plan/BETA.md", "(`abc123def`)", [("commit", "abc123def")]),
    ("a worker version is not a commit", "docs/plan/BETA.md", "live `3eb9f8ff`", []),
    ("a relative link that exists", "engine/BUILD.md", "see [setup](ORG-SETUP.md#mint) and [x](https://x.io)", []),
    ("a relative link that does not exist", "AGENTS.md", "see [gone](docs/GONE.md)", [("link", "docs/GONE.md")]),
    ("a planned name while its step is open", "docs/plan/MARKETPLACE.md", "`.claude-plugin/plugin.json`, `.mcp.json`", []),
    ("an unplanned name", "docs/plan/MCP.md", "`decide_something`", [("tool", "decide_something")]),
    ("a table row speaks only for itself", "docs/plan/BETA.md",
     "| a | live·planned·retired |\n| b | `engine/src/gone.js` |", [("path", "engine/src/gone.js")]),
]

fail = 0
for name, doc, text, want in CASES:
    got = [(k, t) for (_, k, t, _) in cd.check_text(text, doc, CTX)]
    if sorted(got) == sorted(want):
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}: want {want}, got {got}"); fail += 1

# a planned name fails once a plan doc ticks its step
got = [(k, t) for (_, k, t, _) in cd.check_text("`.mcp.json`", "docs/plan/MARKETPLACE.md", TICKED)]
if got == [("path", ".mcp.json")]:
    print("  PASS  a planned name fails once its step is ticked")
else:
    print(f"  FAIL  a planned name fails once its step is ticked: got {got}"); fail += 1
EXTRA = 1

# the real CLI: the failing fixture exits 1 and names every planted thing
r = subprocess.run([sys.executable, os.path.join(HERE, "check-docs.py"), os.path.join(HERE, "fixtures", "check-docs-bad.md")], capture_output=True, text=True)
planted = ["sh tools/no-such-script.sh", "src/no-such-module.js", "GET /no-such-route", "no_such_tool", "node tools/no-such-tool.mjs",
           "migrate-998", "fedcba987", "no-such-doc.md"]
missed = [p for p in planted if p not in r.stdout]
if r.returncode == 1 and not missed:
    print(f"  PASS  the CLI on the failing fixture exits 1 and names all {len(planted)} planted names")
else:
    print(f"  FAIL  the CLI on the failing fixture: exit {r.returncode}, missed {missed}\n{r.stdout}"); fail += 1

print(f"check-docs-selftest: {len(CASES) + EXTRA + 1 - fail} passed, {fail} failed")
sys.exit(1 if fail else 0)
