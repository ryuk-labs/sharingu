#!/bin/sh
# tools/residue-audit.sh — the residue audit that belongs to every close (M-ADR-036). For ONE org (the
# harness's AGENT_R_ENV_PREFIX), read the ledger for rows the suites could only have left behind:
#   · fragment events whose artifact is gone (the suite's self-clean took the artifact, not the event)
#   · questionnaire-response events named eval…      · rulings whose text starts with eval
# and print, for eyes, what cannot be classified from the ledger alone (unmarked exits · boot sessions ·
# still-flagged rows · login attempts). (The owner's /inbox count it printed went with GET /inbox, D5.) Exit 1 on any residue — the close
# ritual (verify-live) refuses to read green over a polluted ledger. ~3 small reads per org.
# Target (Q9CF32D8F): tools/lib.sh's SUITE_TARGET / --live — the LOCAL R's ledger by default (free), the live
# ryuklabs D1 under --live (budget-guarded by lib.sh before any live read; the NOT IN scan below is a real row cost).
#   sh tools/residue-audit.sh [--live]
. "$(dirname "$0")/lib.sh"
SQL="SELECT \
 SUM(kind='fragment' AND json_extract(payload_json,'\$.artifactId') IS NOT NULL AND json_extract(payload_json,'\$.artifactId') NOT IN (SELECT id FROM artifacts)) AS orphan_fragments, \
 SUM(kind='fragment' AND lower(COALESCE(json_extract(payload_json,'\$.what'),'')) LIKE 'questionnaire response: eval%') AS eval_responses, \
 SUM(kind='ruling' AND COALESCE(json_extract(payload_json,'\$.what'),'') LIKE 'eval%') AS eval_rulings, \
 SUM(COALESCE(json_extract(payload_json,'\$.eval'),0)=1) AS still_flagged, \
 SUM(kind='exit') AS exits, SUM(kind='session_open') AS sessions, COUNT(*) AS events, \
 (SELECT COUNT(*) FROM login_attempts) AS attempts \
FROM events"
ROW=$(suite_d1_json "$SQL" 2>/dev/null \
  | python3 -c "import json,sys
t=sys.stdin.read()
try: r=json.loads(t[t.index('['):])[0]['results'][0]; print(json.dumps(r))
except Exception: print('{}')")
printf '%s' "$ROW" | python3 -c "
import json,sys
r=json.load(sys.stdin); org=sys.argv[1]
if not r: print(f'  ✗ {org}: the ledger did not answer (creds? quota?)'); sys.exit(1)
res=(r.get('orphan_fragments') or 0)+(r.get('eval_responses') or 0)+(r.get('eval_rulings') or 0)
print(f\"  {'✓' if res==0 else '✗'} {org} residue={res} (orphan fragments {r.get('orphan_fragments') or 0} · eval responses {r.get('eval_responses') or 0} · eval rulings {r.get('eval_rulings') or 0}) · still-flagged {r.get('still_flagged') or 0} · exits {r.get('exits') or 0} · sessions {r.get('sessions') or 0} · events {r.get('events') or 0} · attempts {r.get('attempts') or 0}\")
sys.exit(0 if res==0 else 1)
" "$P"
