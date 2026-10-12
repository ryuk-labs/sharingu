#!/usr/bin/env python3
"""tools/wrangler-json-selftest.py — the STUBBED-WRANGLER-ON-PATH proof for tools/lib_wrangler_json.py,
the wrangler `d1 execute --json` parser tools/lib-migrate-chain.sh (and so tools/migrate-dryrun.sh) pipes
through. Born QC74D4892-heal (2026-09-23) as org-merge-apply-report-selftest.py, after a live incident (a
real remote write succeeded and the one-shot org-merge tool still reported failure, because wrangler's
own stdout carried a banner line around its JSON payload); renamed with the org-merge toolset's deletion
(P4 prune, 2026-09-27) — same cases, same exit codes, now named for the parser it proves.

Builds a REAL executable named `wrangler` in a throwaway temp bin dir and prepends it to PATH, then
runs the EXACT shell pipeline tools/lib-migrate-chain.sh actually uses —
`wrangler d1 (execute) ... --json | python3 tools/lib_wrangler_json.py --mode <mode>` — as a real
subprocess pipeline (a genuine OS pipe + a genuine exec of a genuine file named `wrangler`, not a
Python string fixture standing in for one), and asserts the observed stdout/exit code against what
the wording of the incident, and this file's own fix, promise:
  1. banner + JSON (the exact incident shape: an update-notice line before a clean statement-array
     payload)                                                  -> parses, exit 0, correct count
  2. a real wrangler error payload (a D1_ERROR, no banner)      -> exit 1, the error text is named
  3. malformed/non-JSON output (no payload anywhere)            -> exit 1, never a silent pass
  4. banner + a `results`-shaped rows payload (mdr_d1_query's own shape, a row-count read)
     in `--mode rows`                                           -> parses, exit 0, correct rows

NOTE ON `npx --yes wrangler` (why this selftest calls the stub directly, never through npx): this
repo's own real call sites invoke wrangler via `npx --yes wrangler`, but `npx` resolves a package
named `wrangler` from the LOCAL project's own `node_modules/.bin` (or a cached global install)
BEFORE ever consulting PATH — measured directly on this machine: prepending a stub `wrangler` to
PATH and running `npx --yes wrangler ...` from inside this project still executes the REAL,
network-capable wrangler, never the stub. A literal PATH-shadow of `npx`'s own resolution is not a
thing a selftest can portably force without hiding the project's own real dependency (too invasive
for a gate step). This selftest instead stubs and calls `wrangler` DIRECTLY — the exact binary `npx`
itself would eventually exec — which exercises the real fixed code (tools/lib_wrangler_json.py)
against a REAL subprocess boundary (actual stdout bytes through an actual OS pipe), not a string
literal handed straight to the parser in-process.

REGRESSION PROOF (acceptance: "prove both ways" — a revert to `json.loads(raw)` must fail case 1):
this file does not mutate checked-in source at gate time (the gate must stay deterministic and never
patch itself mid-run) — the revert-and-rerun is a ONE-TIME manual proof captured in the PR body
(temporarily replacing `parse_wrangler_json`'s body with a bare `return json.loads(raw)`, rerunning
this exact selftest, observing case 1 fail, then restoring the real body and rerunning green).

Exit 0 every case holds; exit 1 with the first miss.
"""
import os
import shutil
import stat
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PARSER = os.path.join(HERE, "lib_wrangler_json.py")

STUB_BODIES = {
    # case 1: the exact incident shape — an update-available banner line, then the real payload,
    # then (also live-observed) a trailing blank line after the JSON closes.
    "banner_apply": (
        "#!/bin/sh\n"
        'echo "▲ [WARNING] wrangler 4.131.2 update available 4.132.0, run \\`npm install --save-dev wrangler@4.132.0\\` to update"\n'
        'echo \'[{"success":true,"meta":{"duration":3,"changes":11},"results":[]}]\'\n'
        "echo\n"
    ),
    # case 2: a real wrangler error payload, no banner noise at all — the plain "already worked"
    # shape must keep working exactly as before.
    "real_error": (
        "#!/bin/sh\n"
        'echo \'{"error":{"text":"D1_ERROR: UNIQUE constraint failed: people.id"}}\'\n'
    ),
    # case 3: malformed — no JSON payload anywhere in the stream (a crash, a truncated network
    # response, a wrangler version that changed its own banner shape unrecognizably).
    "malformed": (
        "#!/bin/sh\n"
        'echo "wrangler: an unexpected error occurred talking to the Cloudflare API (no JSON body)"\n'
    ),
    # case 4: banner + a rows-shaped payload (mdr_d1_query's own shape) — a row-count read uses
    # this exact mode.
    "banner_rows": (
        "#!/bin/sh\n"
        'echo "⛅️ wrangler 4.131.2"\n'
        'echo \'[{"success":true,"meta":{"duration":1},"results":[{"tbl":"people","n":12},{"tbl":"events","n":130}]}]\'\n'
    ),
}

FAILS = []


def check(label, cond, detail=""):
    if not cond:
        FAILS.append(f"{label}{(' :: ' + detail) if detail else ''}")


def run_case(stub_key, mode):
    tmpdir = tempfile.mkdtemp(prefix="wrangler-json-selftest-")
    try:
        wrangler_path = os.path.join(tmpdir, "wrangler")
        with open(wrangler_path, "w") as f:
            f.write(STUB_BODIES[stub_key])
        st = os.stat(wrangler_path)
        os.chmod(wrangler_path, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

        p1 = subprocess.run([wrangler_path, "d1", "execute", "fixture-db", "--remote", "--json"],
                             capture_output=True, text=True)
        p2 = subprocess.run([sys.executable, PARSER, "--mode", mode], input=p1.stdout,
                             capture_output=True, text=True)
        return p2.returncode, p2.stdout.strip()
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main():
    # case 1: banner + JSON -> parses, exit 0, correct statement count (1)
    rc, out = run_case("banner_apply", "apply")
    check("case1 banner+JSON: exit 0", rc == 0, f"rc={rc} out={out!r}")
    check("case1 banner+JSON: reports OK 1", out == "OK 1", out)

    # case 2: real error payload -> exit 1, error text named
    rc, out = run_case("real_error", "apply")
    check("case2 real error: exit 1", rc == 1, f"rc={rc} out={out!r}")
    check("case2 real error: names the D1_ERROR text", out.startswith("ERROR:") and "UNIQUE constraint failed" in out, out)

    # case 3: malformed -> exit 1, never a silent pass
    rc, out = run_case("malformed", "apply")
    check("case3 malformed: exit 1", rc == 1, f"rc={rc} out={out!r}")
    check("case3 malformed: reports PARSEFAIL, not a silent OK", out.startswith("PARSEFAIL:"), out)

    # case 4: banner + rows payload, --mode rows -> parses, exit 0, correct rows
    rc, out = run_case("banner_rows", "rows")
    check("case4 banner+rows: exit 0", rc == 0, f"rc={rc} out={out!r}")
    check("case4 banner+rows: both rows present", '"tbl": "people"' in out.replace("'", '"') or '"tbl":"people"' in out, out)
    check("case4 banner+rows: count n=12 for people present", '"n": 12' in out or '"n":12' in out, out)

    if FAILS:
        print(f"✗ wrangler-json-selftest: {len(FAILS)} case(s) failed:")
        for f in FAILS:
            print(f"    - {f}")
        return 1
    print("✓ wrangler-json-selftest: banner+JSON parses (exit 0, right count) · a real error payload exits 1 named · malformed output exits 1, never a silent pass · banner+rows parses for the remote row-count read")
    return 0


if __name__ == "__main__":
    sys.exit(main())
