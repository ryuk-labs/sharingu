# tools/lib-logout-ruling.sh — the ONE verdict for E232g (evals.sh), sourced by tools/lib.sh and by its
# own gate selftest (tools/logout-ruling-selftest.mjs). Batch post-consolidation-suite-heal, 2026-09-25.
#
# THE RULING IT CHECKS (QC74D4892, one org worker — #162 retired the launcher, `wrangler.frame.jsonc`
# deleted, `LAUNCHER_URL` ""): no launcher sits in front of an org any more, so an org's own sign-in IS
# the front door. Signing out must therefore land on the org's OWN /login, that /login must be a live
# sign-in page (never a dead link, never a hop to a launcher that no longer exists), and no page may
# offer the retired launcher's "All workspaces" link.
#
# SCAR it replaces: the old E232g branched on `grep -q 'launcher-link'` over the signed-in /home — and
# that string is ALWAYS in the page, because the shell's own stylesheet carries the `.launcher-link{…}`
# rule whether or not a link is rendered. So the branch could never see "standalone": it took the
# launcher side on every run, passed while a launcher existed, and failed the moment it was retired
# (measured 2026-09-23: `logout->launcher (got 302 …/login)`). A check that cannot tell its two cases
# apart is not a check. This verdict counts the rendered ANCHOR (`class="launcher-link"`), and requires
# proof first that the page it counted in really is the shell. UI-B1a (2026-09-27) re-pinned that proof:
# the Brand v2 shell carries no `.launcher-link{` stylesheet rule any more (the launcher link and its CSS
# are gone), so the shell is recognised by its own top bar instead. The look pass (sprint 2) moved the shell to a left
# rail, so the marker is now its semantic hook: the destinations' region (`data-region="tabs"`, the wireframe's shell
# region, drawn only by src/shell.js). Same intent; tools/logout-ruling-selftest.mjs proves the marker both ways.
#
# logout_ruling_verdict <U> <home_code> <home_html_file> <logout "code redirect_url"> <login "code content_type"> <login_html_file>
#   exit 0 = the ruling holds; exit 1 = it does not, with the reason on stdout (one line).
logout_ruling_verdict() {
  _lr_u="$1"; _lr_hc="$2"; _lr_hf="$3"; _lr_lo="$4"; _lr_lg="$5"; _lr_lf="$6"
  # the page the anchor is counted in must be the rendered shell — absence of a link in an error page proves nothing
  [ "$_lr_hc" = "200" ] || { echo "signed-in /home did not render (got $_lr_hc) — the launcher-link count below would prove nothing"; return 1; }
  grep -q 'data-region="tabs"' "$_lr_hf" 2>/dev/null || { echo "signed-in /home carries no shell rail (data-region=tabs) — not the shell, the anchor count would prove nothing"; return 1; }
  _lr_n=$(grep -o 'class="launcher-link"' "$_lr_hf" 2>/dev/null | wc -l | tr -d ' ')
  [ "$_lr_n" = "0" ] || { echo "the shell still renders the retired launcher's All-workspaces link ($_lr_n anchor(s))"; return 1; }
  [ "$_lr_lo" = "302 $_lr_u/login" ] || { echo "/logout does not land on this org's own /login (got $_lr_lo)"; return 1; }
  case "$_lr_lg" in "200 text/html"*) ;; *) echo "the /logout target $_lr_u/login is not a live sign-in page — a dead link or a hop elsewhere (GET got $_lr_lg, want 200 text/html)"; return 1;; esac
  grep -q 'name="password"' "$_lr_lf" 2>/dev/null || { echo "the /logout target $_lr_u/login serves no sign-in form"; return 1; }
  return 0
}
