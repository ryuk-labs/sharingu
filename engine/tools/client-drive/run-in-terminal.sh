#!/bin/bash
# run-in-terminal.sh <script> [timeout seconds, default 120] — run a bash script INSIDE the Mini's Terminal, which holds the
# Screen Recording and Accessibility grants a session's own shell lacks (screencapture, keystrokes, clicks, ffmpeg's screen).
# Terminal is hidden as soon as the script starts (or it crosses a recording); the script's output and exit code come back
# here; its window (titled "client-drive") is closed once idle, and no other Terminal window is touched.
# Exit: the script's own code; 124 on a timeout (the window is left open to look at); 2 on usage.
set -u
script=${1:-}; timeout=${2:-120}
[ -f "$script" ] || { echo "usage: run-in-terminal.sh <script> [timeout seconds]" >&2; exit 2; }
script=$(cd "$(dirname "$script")" && pwd)/$(basename "$script")
here=$(cd "$(dirname "$0")" && pwd); state=$(cd "$here/../.." && pwd)/.runs/client-drive
mkdir -p "$state" && chmod 700 "$state"
work=$(mktemp -d "$state/term.XXXXXX"); out="$work/out"; rc="$work/rc"

# The one line Terminal's shell runs. Every path is %q-quoted for that shell, and \$? stays unexpanded HERE so the exit
# code read is the inner script's, not this file's.
q() { printf %q "$1"; }
line="osascript -e 'tell application \"System Events\" to set visible of process \"Terminal\" to false' >/dev/null 2>&1;"
line+=" bash $(q "$script") > $(q "$out") 2>&1; echo \$? > $(q "$rc.tmp"); mv $(q "$rc.tmp") $(q "$rc"); exit"

osascript - "$line" >/dev/null <<'OSA' || { echo "Terminal refused the script" >&2; rm -rf "$work"; exit 1; }
on run argv
  tell application "Terminal"
    set t to do script (item 1 of argv)
    set custom title of t to "client-drive"
  end tell
end run
OSA
osascript -e 'tell application "System Events" to set visible of process "Terminal" to false' >/dev/null 2>&1

deadline=$((SECONDS + timeout))
while [ ! -f "$rc" ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then cat "$out" 2>/dev/null; echo "run-in-terminal: timeout after ${timeout}s ($work)" >&2; exit 124; fi
  sleep 0.3
done
code=$(cat "$rc"); cat "$out"; rm -rf "$work"

sleep 0.5   # the inner shell's exit, so its tab is no longer busy
osascript >/dev/null 2>&1 <<'OSA'
tell application "Terminal"
  set ws to every window
  repeat with w in ws
    try
      if (custom title of selected tab of w) is "client-drive" and not (busy of selected tab of w) then close w
    end try
  end repeat
end tell
OSA
exit "$code"
