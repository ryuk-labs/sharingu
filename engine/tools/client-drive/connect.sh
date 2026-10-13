#!/bin/bash
# connect.sh <client> <role> — the OWNER's one-time sign-in of one named sharingu connection (sharingu-<role>), run by the
# owner when ready: it adds the connection if missing, then starts its OAuth, which opens sharingu's sign-in page. The
# reviewer account's email and code are typed by the owner on that page, never by a script or an agent.
#   chatgpt      codex mcp add sharingu-<role> --url <door>   then  codex mcp login sharingu-<role>   (~/.codex/config.toml)
#   claude-code  claude mcp add --transport http --scope user sharingu-<role> <door>   then  claude mcp login sharingu-<role>
#   claude       the Claude app keeps its connectors in the account: printed steps, by hand
# Exit 0 ok, 1 failed, 2 usage.
set -u
client=${1:-}; role=${2:-}; door=https://agent.sharingu.xyz/mcp; name="sharingu-$role"
case "$role" in admin|member|partner) ;; *) echo "usage: connect.sh chatgpt|claude-code|claude admin|member|partner" >&2; exit 2 ;; esac
ready() { echo "sign in as $role@review.sharingu.xyz now; the page waits about 3 minutes (check the Email field: autofill may hold another role)"; }
case "$client" in
  chatgpt)
    codex mcp get "$name" >/dev/null 2>&1 || codex mcp add "$name" --url "$door" || exit 1
    ready; codex mcp login "$name" ;;
  claude-code)
    claude mcp get "$name" >/dev/null 2>&1 || claude mcp add --transport http --scope user "$name" "$door" || exit 1
    ready; claude mcp login "$name" ;;
  claude)
    echo "In the Claude app: Settings, Connectors, Add custom connector; name $name, URL $door; then Connect."
    ready ;;
  *) echo "usage: connect.sh chatgpt|claude-code|claude admin|member|partner" >&2; exit 2 ;;
esac
