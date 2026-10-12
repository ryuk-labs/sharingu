#!/usr/bin/env python3
"""tools/lib_wrangler_json.py — QC74D4892-heal (2026-09-23): the ONE robust wrangler `d1`
`execute --json` output parser, shared by every site in this repo that pipes wrangler's stdout into Python
(tools/lib-migrate-chain.sh's mdr_export_and_load/mdr_apply_chain, which tools/migrate-dryrun.sh sources).

THE DEFECT THIS REPLACES: wrangler's own stdout is NOT guaranteed to be pure JSON — a banner line
("⛅️ wrangler 4.131.2"), an update-available notice, or an experimental-flag warning can appear
before (rarely after) the actual JSON payload. The one-shot org merge (tools/org-merge.sh, since deleted
with its source DBs — P4 prune, 2026-09-27) hit this LIVE on 2026-09-23: the remote write to ryuklabs' real D1 succeeded (verified afterwards by hand
— project created, seat granted, all 11 token hashes present) and the tool still printed "✗ apply did
not return JSON" and exited 1, because its own step 5 piped wrangler's stdout straight into
`json.loads(raw)`, which throws the instant one stray banner byte precedes the JSON. After a REAL
remote write, that makes "wrote everything" and "wrote half" look identical to the caller — the exact
failure mode named in 02_AGENT_R/next-batch-org-merge-apply-report.md.

THE FIX: scan the raw text for the first position a JSON value can be decoded from
(`json.JSONDecoder.raw_decode`, which — unlike `json.loads` — tolerates trailing bytes after the
value closes, so it copes with banner/notice text on EITHER side of the payload), rather than
assuming the whole stream IS the payload.

Importable (`from lib_wrangler_json import parse_wrangler_json`, called with `sys.path` pointing at
this file's own directory — every site above already runs with this directory reachable) or a
subprocess CLI for the POSIX-shell call sites, whose own inline `python3 -c "..."` snippets
cannot import a sibling module without extra plumbing:

  wrangler d1 (execute) ... --json | python3 tools/lib_wrangler_json.py --mode apply
    -> stdout "OK <n>"        exit 0   (a statement-list payload; n = len(payload))
    -> stdout "ERROR:<text>"  exit 1   (a real {"error": {...}} payload from wrangler)
    -> stdout "PARSEFAIL:<snippet>" exit 1  (no JSON payload found anywhere in the stream)

  wrangler d1 (execute) ... --json | python3 tools/lib_wrangler_json.py --mode rows
    -> stdout the JSON array of row-dicts from the FIRST statement's own "results" (mdr_d1_query's
       own shape: `d[0]["results"]`), or the same ERROR:/PARSEFAIL: lines + exit 1 on failure.

See tools/wrangler-json-selftest.py for the offline, stubbed-wrangler-on-PATH proof (both
that this parses banner+JSON/real-error/malformed correctly, AND that reverting to bare
`json.loads(raw)` regresses case 1 — the PR body carries that revert-and-rerun evidence).

It first tries the whole stream, then falls back to a scan for the first `[`/`{`-leading line;
`json.JSONDecoder.raw_decode` tolerates trailing bytes AFTER the payload closes too, not only banner
text before it (the live incident this closes showed noise on both sides).
"""
import json
import sys


class WranglerJSONError(Exception):
    """Raised when no JSON value can be decoded anywhere in wrangler's own stdout. `args[0]` carries
    a truncated snippet of the raw text for the caller to print — never swallowed silently."""


def parse_wrangler_json(raw):
    """Return the first JSON value (dict or list) decodable anywhere in `raw`. Tries every '{' or
    '[' byte, left to right, via `json.JSONDecoder.raw_decode` (tolerates trailing bytes after the
    value closes — a plain `json.loads` on the same slice would reject those as "Extra data" the
    moment any text follows the payload, which a trailing banner/notice line routinely does).
    Wrangler's own real payload is always the FIRST JSON value in the stream in every case this repo
    has ever observed; a stray non-JSON bracket in banner text (never seen in practice) would simply
    fail to decode at that position and scanning continues to the next candidate.
    Raises WranglerJSONError (never returns None) when nothing decodes."""
    dec = json.JSONDecoder()
    i, n = 0, len(raw)
    while i < n:
        if raw[i] in "{[":
            try:
                obj, _end = dec.raw_decode(raw, i)
                return obj
            except json.JSONDecodeError:
                pass
        i += 1
    raise WranglerJSONError(raw[:400])


def _cli():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["apply", "rows"], default="apply")
    args = ap.parse_args()

    raw = sys.stdin.read()
    try:
        d = parse_wrangler_json(raw)
    except WranglerJSONError as e:
        snippet = str(e.args[0]).replace("\n", " ")
        print(f"PARSEFAIL:{snippet}")
        return 1

    if isinstance(d, dict) and "error" in d:
        print(f"ERROR:{d['error']['text']}")
        return 1

    if args.mode == "apply":
        if isinstance(d, list):
            print(f"OK {len(d)}")
            return 0
        print(f"PARSEFAIL:unexpected JSON shape ({type(d).__name__}) for an apply result")
        return 1

    # rows
    try:
        rows = d[0]["results"] if d else []
    except Exception:
        print(f"PARSEFAIL:unexpected JSON shape ({type(d).__name__}) for a rows result")
        return 1
    print(json.dumps(rows))
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
