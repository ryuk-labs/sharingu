#!/bin/bash
# build.sh — compile mouse.swift into engine/.runs/client-drive/bin/mouse (machine-local, gitignored); a no-op when the
# binary is newer than its source. client-drive.mjs runs it before any click.
set -eu
here=$(cd "$(dirname "$0")" && pwd); bin=$(cd "$here/../.." && pwd)/.runs/client-drive/bin
mkdir -p "$bin"; chmod 700 "$bin/.."
if [ ! -x "$bin/mouse" ] || [ "$here/mouse.swift" -nt "$bin/mouse" ]; then
  swiftc -O -o "$bin/mouse" "$here/mouse.swift"
  echo "built $bin/mouse"
fi
