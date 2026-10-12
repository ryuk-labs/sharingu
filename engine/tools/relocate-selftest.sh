#!/bin/sh
# relocate-selftest.sh — the ratchet for the monorepo layout (M-ADR-038). The move puts the engine at
# sharingu/engine/ and the shared contracts/ lane at the ROOT; every reader of contracts/ must find it there
# with no env set. Scar 2026-09-08: a subtree rehearsal (tools/monorepo-rehearse.sh) ran the gate from engine/
# and went RED at the handoff selftest + the door-contract diff — both had "<engine>/contracts" baked in.
# Builds a throwaway tree <tmp>/engine (src + tools linked, no contracts/) with <tmp>/contracts beside it and
# runs the two readers from there. Prints its own counts; exit 1 on any failure. Run in the gate.
cd "$(dirname "$0")/.." || exit 1
ENGINE="$(pwd)"; T="$(mktemp -d "${TMPDIR:-/tmp}/ar-relocate.XXXXXX")"; trap 'rm -rf "$T"' EXIT
SRC="${AGENT_R_CONTRACTS:-$([ -d "$ENGINE/contracts" ] && echo "$ENGINE/contracts" || echo "$ENGINE/../contracts")}"   # the same rule — this test runs from BOTH layouts
mkdir -p "$T/engine" "$T/contracts"
ln -s "$ENGINE/src" "$T/engine/src"; ln -s "$ENGINE/tools" "$T/engine/tools"; ln -s "$ENGINE/node_modules" "$T/engine/node_modules" 2>/dev/null
cp "$SRC/door.declared.json" "$T/contracts/"
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }
# 1. the generator writes the ROOT contracts/door.json from engine/ (no env)
( cd "$T/engine" && unset AGENT_R_CONTRACTS && python3 tools/make-door-contract.py >/dev/null 2>&1 ) && [ -f "$T/contracts/door.json" ] \
  && ok "make-door-contract.py resolves ../contracts from engine/" || bad "make-door-contract.py did not write ../contracts/door.json"
# 2. the generated file is byte-identical to the one beside the engine (one generator, two layouts, no drift)
python3 tools/make-door-contract.py >/dev/null 2>&1; cmp -s "$T/contracts/door.json" "$SRC/door.json" \
  && ok "door.json identical from either layout" || bad "door.json differs between layouts"
# 3. the handoff selftest reads the declared shape from ../contracts (the tools/ symlink means import.meta.url is the real tools/ — so the rule must be tested through the env-free parent walk on a REAL tree: copy tools/ instead)
rm "$T/engine/tools"; mkdir -p "$T/engine/tools/fixtures"; cp "$ENGINE"/tools/handoff-selftest.mjs "$T/engine/tools/"; cp "$ENGINE"/tools/fixtures/org-row.mjs "$ENGINE"/tools/fixtures/org.mjs "$T/engine/tools/fixtures/"
( cd "$T/engine" && unset AGENT_R_CONTRACTS && node tools/handoff-selftest.mjs >/dev/null 2>&1 ) \
  && ok "handoff-selftest.mjs resolves ../contracts from engine/" || bad "handoff-selftest.mjs could not find ../contracts/door.declared.json"
# 4. the env override wins over both walks
( cd "$ENGINE" && AGENT_R_CONTRACTS="$T/contracts" node tools/handoff-selftest.mjs >/dev/null 2>&1 ) \
  && ok "AGENT_R_CONTRACTS overrides the walk" || bad "AGENT_R_CONTRACTS ignored"
# 5. the layout this engine sits in resolves with no env — standalone (./contracts) today, ../contracts after the move
( cd "$ENGINE" && unset AGENT_R_CONTRACTS && node tools/handoff-selftest.mjs >/dev/null 2>&1 ) \
  && ok "this layout resolves with no env ($SRC)" || bad "this layout does not resolve ($SRC)"
echo "relocate-selftest: $pass pass · $fail fail"
[ "$fail" -eq 0 ]
