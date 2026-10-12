# tools/lib-day0-shape.sh — the day-0 shape classifier (bug0914:day0-verify-assumes-a-multi-project-org).
# Pure shell, no network, sourced by tools/day0-verify.sh. Three of day0-verify's own checks (D3 owner
# seat count >=2 · D6 lands on the picker · D11 an unclaimed transmission 422s on ambiguity) only mean
# anything for an owner who genuinely holds MORE THAN ONE project seat — a single-project kit (the
# doc's own §2a seed shape, ONE project) has nothing to disambiguate: no picker to land on, no seat
# ambiguity to 422 on. Measured live 2026-09-14 walking docs/INSTALL.md §2a verbatim: a single-project
# kit failed exactly those three checks (14 passed, 3 failed) even though the tenant was working
# correctly — the checks were asserting the wrong invariant for that org's shape, not finding a defect.
#
# day0_shape reads the SAME data day0-verify.sh already fetched for D2/D3 (whoami's own `projects`
# array — no new endpoint, per the row's own brief) and is the ONE place the run/skip decision gets
# made, so D3/D6/D11 (and any future check with the same assumption) all gate on it identically.
#
# DAY0_FORCE_SHAPE=multi|single is a TEST-ONLY override (same seam as lib-new-org.sh's
# NEW_ORG_FAULT_AFTER): dormant unless a caller sets it. day0-verify.sh itself never sets it — it
# exists so an eval can force the multi-shape checks to RUN against a genuinely single-project tenant
# and prove they still FAIL on that org's real data (D3/D6/D11 are real assertions, not soft-skipped
# forever once "multi" is decided).
day0_shape() { # day0_shape <nproj> -> prints "multi" or "single"
  case "${DAY0_FORCE_SHAPE:-}" in
    multi|single) printf '%s' "$DAY0_FORCE_SHAPE"; return 0 ;;
  esac
  case "$1" in
    ''|*[!0-9]*) printf 'single'; return 0 ;;  # unreadable/absent seat count -> the conservative shape, never over-claims multi
  esac
  if [ "$1" -ge 2 ]; then printf 'multi'; else printf 'single'; fi
}
