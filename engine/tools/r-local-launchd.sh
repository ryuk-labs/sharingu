#!/bin/sh
# tools/r-local-launchd.sh — render (+ optionally load) a macOS LaunchAgent that brings local Agent
# R up at login through tools/r-local.sh (R4, sharingu v1.0 install mode 2). OPTIONAL — running R
# locally needs nothing here; `sh tools/r-local.sh up <org>` in a terminal is the whole story. This
# is only for "I want it up automatically after a reboot," same spirit as
# tools/launchd/install.sh's nightly-close units, and it follows the SAME conventions (label
# prefix, render-then-lint-then-optionally-load, never loads without --load).
#
#   sh tools/r-local-launchd.sh --org <org> [--port <N>] [--lan] [--load]
#
# Label: com.sharingu.agent-r.local.<org>. Does NOT load the job unless --load is given.
#
# NOT A SUPERVISOR: `r-local.sh up` starts wrangler dev DETACHED and exits once healthy — launchd
# only re-runs `up` at login/reload, it does not hold the wrangler dev process open or restart it if
# it crashes mid-session. For continuous supervision, use a real process manager; this unit answers
# "bring it back after a reboot," nothing more.
#
# Linux: the systemd user-unit TEMPLATE is tools/systemd/sharingu-agent-r-local@.service (not
# auto-rendered by this script — Linux wake units are out of scope for sharingu v1.0, PRD §7; the
# template is there to hand-adapt if you need it before then).
set -e
ORG=""; PORT=""; LAN=0; LOAD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --org) ORG="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --lan) LAN=1; shift ;;
    --load) LOAD=1; shift ;;
    *) echo "r-local-launchd.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ -n "$ORG" ] || { echo "r-local-launchd.sh: --org <org> is required" >&2; exit 2; }
printf '%s' "$ORG" | grep -qE '^[a-z0-9][a-z0-9-]*$' || { echo "r-local-launchd.sh: slug must be lowercase [a-z0-9-]: '$ORG'" >&2; exit 2; }

HERE="$(cd "$(dirname "$0")" && pwd)"
ENGINE="$(cd "$HERE/.." && pwd)"
. "$ENGINE/tools/lib-r-local.sh"

STATE_DIR="$(rl_org_dir "$ORG")"
mkdir -p "$STATE_DIR"
[ -n "$PORT" ] || PORT="$(rl_pick_port "" "$STATE_DIR")"

LABEL="com.sharingu.agent-r.local.$ORG"
OUT="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"

TMP="$(mktemp "${TMPDIR:-/tmp}/r-local-launchd.XXXXXX.plist")"
sed -e "s|__ORG__|$ORG|g" -e "s|__ENGINE__|$ENGINE|g" -e "s|__PORT__|$PORT|g" -e "s|__STATE_DIR__|$STATE_DIR|g" \
    "$HERE/launchd/com.sharingu.agent-r.local.plist.template" > "$TMP"
if [ "$LAN" = "1" ]; then
  sed -i '' "s|__LAN_FLAG__|--lan|" "$TMP" 2>/dev/null || sed -i "s|__LAN_FLAG__|--lan|" "$TMP"
else
  sed -i '' "/__LAN_FLAG__/d" "$TMP" 2>/dev/null || sed -i "/__LAN_FLAG__/d" "$TMP"
fi
mv "$TMP" "$OUT"

plutil -lint "$OUT" >/dev/null || { echo "r-local-launchd.sh: the rendered plist does not lint: $OUT" >&2; exit 1; }
echo "rendered $OUT"
echo "  label   $LABEL"
echo "  org     $ORG (port $PORT$([ "$LAN" = "1" ] && echo ', --lan (0.0.0.0)' || echo ', 127.0.0.1 only'))"
echo "  engine  $ENGINE"
echo "  logs    $STATE_DIR/launchd.std{out,err}.log"
if [ "$LOAD" = "1" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$OUT"
  echo "loaded: $(launchctl list | grep "$LABEL" || echo '(not listed)')"
else
  echo "NOT loaded. Rehearse: sh $ENGINE/tools/r-local.sh up $ORG --port $PORT$([ "$LAN" = "1" ] && echo ' --lan' || echo '')"
  echo "Install:  launchctl bootstrap gui/$(id -u) \"$OUT\"    Run now: launchctl kickstart -k gui/$(id -u)/$LABEL"
  echo "Stop watching (does not stop wrangler dev): launchctl bootout gui/$(id -u)/$LABEL"
fi
