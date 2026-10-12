#!/usr/bin/env python3
"""run-results.py <suite-output.log> <out.json> — derive a suite run's PER-TEST results from its own printed
lines (`  PASS  E7 …` · `  FAIL  E33 …` · `  SKIP  E85 …`, and sims' / tabs-verify's same shape) into
{ "<id>": "PASS"|"FAIL"|"SKIP", … } plus a `_totals` line read off the suite's own summary. Never typed:
the ids and verdicts are whatever the run printed (M-ADR-037: the canvas lights a node from these).
Written by tools/lib.sh write_last_run beside .runs/<suite>-<tenant>.json."""
import re, sys, json, os, datetime
# --merge (a SLICE run): overlay this run's verdicts onto the existing file — a test's LATEST verdict wins, so a
# re-slice that proves a transport drop green turns that id green; `_totals` stays the last FULL run's. A full run
# (no flag) writes a fresh file. `_runs` keeps one line per write (at · full/slice · ids), so the face can say
# "last full run N/N/N · latest verdicts: k failing". (M-ADR-043 gap 1, 2026-09-10.)
args = [a for a in sys.argv[1:] if not a.startswith('--')]; merge = '--merge' in sys.argv
src, out = args[0], args[1]
res, totals = {}, None
prev = {}
if merge and os.path.exists(out):
    try: prev = json.load(open(out))
    except Exception: prev = {}
rx = re.compile(r'^\s+(PASS|FAIL|SKIP)\s+([A-Z]{1,2}\d+[a-z]?|AC)\b')
for line in open(src, encoding='utf-8', errors='replace'):
    m = rx.match(line)
    if m:
        v, tid = m.group(1), m.group(2)
        # a test id printed twice keeps the worse verdict (FAIL > SKIP > PASS)
        rank = {'PASS': 0, 'SKIP': 1, 'FAIL': 2}
        if tid not in res or rank[v] > rank[res[tid]]: res[tid] = v
    t = re.search(r'(\d+) passed, (\d+) failed, (\d+) skipped', line)
    if t: totals = {'passed': int(t.group(1)), 'failed': int(t.group(2)), 'skipped': int(t.group(3))}
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
runs = [r for r in (prev.get('_runs') or []) if isinstance(r, dict)][-20:]
if merge:
    merged = {k: v for k, v in prev.items() if not k.startswith('_')}
    merged.update(res)                       # this run's verdicts win for the ids it printed
    merged['_totals'] = prev.get('_totals') or {}
    runs.append({'at': now, 'full': False, 'ids': len(res)})
    res = merged
else:
    res['_totals'] = totals or {}
    runs.append({'at': now, 'full': True, 'ids': len(res)})
res['_runs'] = runs
failing = sorted(k for k, v in res.items() if not k.startswith('_') and v == 'FAIL')
res['_failing'] = failing
json.dump(res, open(out, 'w'), indent=0, sort_keys=True)
print(f"{out}: {sum(1 for k in res if not k.startswith('_'))} test ids · totals {res['_totals']} · {'merged' if merge else 'full'} · failing {failing}")
