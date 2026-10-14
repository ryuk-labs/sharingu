# client-drive — a desktop AI client, driven on the Mini

Runs (from `engine/`) `listing/test-cases.md` in a real client (the ChatGPT app, the Claude app, Claude Code) as one reviewer account, and
records it. Keys, clicks and screen capture need Terminal's Screen Recording + Accessibility grants, so every screen verb
re-runs itself inside Terminal (`run-in-terminal.sh`, hidden at once). State lives in `engine/.runs/client-drive/` (700).

**Once, by the owner** (an agent never types a code into a sign-in): `sh tools/client-drive/connect.sh <client> <role>` for each
client (chatgpt, claude-code, claude) and role (admin, member, partner): it adds the `sharingu-<role>` connection, then
opens sharingu's sign-in; sign in as `<role>@review.sharingu.xyz` with the code. For the Claude app it prints the steps
(its connectors live in the Claude account).

**The verbs** (`node tools/client-drive/client-drive.mjs …`; the clients' menus, frames and points are data in `clients.json`):
`place <client> full|left` · `new-chat` · `say <client> <text file>` (pbcopy, Cmd+V, Return) · `set-model` · `sidebar` ·
`menus <client> <menu>` · `wait <client>` · `snap <png> [window|full] [client]` · `rec-start <take> window|full [client]` ·
`rec-stop <take>` · `mark <take> <label>` · `restart <client> [full|left]` · `app-start [right|full] [url]` ·
`app goto <path>|reload|shot <png>` · `use <client> <role>`.

**A walk:** `node tools/client-drive/client-drive.mjs use chatgpt member`, then
`node tools/client-drive/walk.mjs --client chatgpt|claude-app|claude-code --as <role> [--cases P2,P3] [--record] [--frame full|left] [--dry-run]`.
Per ask: say, wait until the window holds still 3 s (90 s at most), snap, mark. A step only a person can do (P4's decline)
waits for `touch <take>/go`. claude-code runs headless (`claude -p`, one session per case) into `<take>/<case>.md`.
Proof: `node tools/client-drive/client-drive-selftest.mjs` (offline). `build.sh` compiles `mouse.swift` on first use.

**Traps**
- `System Events click at` hangs on Electron apps: clicks go through `mouse` (a CGEvent).
- ChatGPT resets the model on every New Chat: the walk runs `set-model` after each (its points hold in the `full` frame only).
- "Call whoami." ran the shell's whoami: walk.mjs asks for "sharingu's whoami" (`askText`).
- Codex's OAuth callback stops waiting after about 3-5 minutes: run connect.sh only when ready; check the Email field
  (Chrome autofill once put the admin into the member's sign-in).
- `use chatgpt` edits `enabled =` in `~/.codex/config.toml` (backed up under `backups/` first) and restarts the app;
  the sharingu plugin's own `sharingu` connection stays as it is.
- ChatGPT asks to approve a tool call in "Ask for approval" mode: the walk then snaps the prompt, not the answer.
- The app half is Playwright's Chrome for Testing with `--use-mock-keychain --password-store=basic` (no keychain
  prompt), its own profile; never the owner's Chrome. The app flashes light on a reload: cut it from a video.
- A Terminal window this tool did not open is never closed; a timed-out run leaves its own window open to read.
