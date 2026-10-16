# Security

## Reporting a vulnerability

**Email the owner directly: ryuk@ryuklabs.io.** This is a private repo in the `ryuk-labs` organisation; please use email, not GitHub's
"Report a vulnerability" advisory form does not exist here. Please do not open a public issue for a security report.
You will get an acknowledgement within 72 hours.

## The security model (what to test against)

The product is one platform (`engine/`): one worker and one database serve every org, each at its own address
(`/<org>`), and what happens in an org stays in it (`docs/plan/ARCHITECTURE.md` §10; the cross-org attack suite is a
gate step). It is reached directly; nothing else the owner runs sits in front of it. A development machine holds only sharingu's own env file, `~/.sharingu/env-sharingu.sh` (chmod 600),
never synced, never committed.

- **Two credential planes.** A seat's key (one person in one org) is long-lived: it is both that seat's web passphrase
  and its API/MCP bearer token, opens that seat alone, and only its hash is stored (`people.key_hash`). An ACCOUNT (one
  per email) has a passphrase of its own, set only by its holder (the sign-up with the operator's code, or proving it on
  `/profile`), which signs in to every seat of the account; only its hash is stored (`accounts`). Signing in on the web mints a separate 90-day session token,
  also stored only as a hash (`tokens.token_hash`) and carried in the `__Host-ar_session` cookie, which signs in only
  under an org's address. `authenticate()` in
  `engine/src/core.js` checks the key first, then a session token that is neither revoked nor expired. `GET /logout`
  revokes the session the cookie names; `POST /signout` revokes the token the request carries.
- **MCP clients that sign in** (the Claude Desktop and claude.ai connector) use OAuth on the platform's sign-in page,
  scopes `mcp:read` and `mcp:write`; the grants live in KV. A grant signed in with an account's passphrase reaches that
  account's own seats, one org a call (`orgSlug`); one signed in with a seat's key reaches that seat alone.
- **Narrower doors.** A key in a URL (`?k=`) reads and never writes. Cookie writes are same-origin checked. Sign-in is
  locked per account after 8 failures in 15 minutes, and rate-limited per address where the `LOGIN_LIMIT` binding
  exists (sign-up and creating an org share that budget).
- **Joining an org is a handed-over key.** Only its admin adds a person: Control → Invite (`add-person`,
  `engine/src/admin.js`; `POST /control` is owner-only). The new key is shown once, to hand over out of band; the admin
  can rotate it. A seat added for an email whose account already holds a passphrase or a seat in another org is
  PENDING — inert (its key answers 401) until the holder accepts it on the org picker (`POST /orgs/seat`) — so an
  admin never silently attaches a seat to someone's existing account. Emails are ASCII-only (`email_not_ascii`).
  One revocation rule: the holder's own passphrase change ends every other session of the account; an admin's seat
  action ends only that seat's sessions and grants. An org is never defaulted at sign-in: a several-org account picks
  (the picker; `409 choose_org` for a JSON sign-in; the OAuth form asks) — and a seat WAITING for its holder's yes
  makes the JSON paths and the OAuth form ask too (the owner, 2026-10-09), so a possible squat is never signed into
  by default.
- **Joining is approved by the operator.** A new team requests access (`/request-access`: a profile and a passphrase,
  or Google) and proves its mailbox by an emailed single-use link (only its hash kept); the operator approves each org,
  and the approval emails "You're in". An email whose account is already held (a passphrase, a Google subject, an invite
  mark, or a seat) gets "you already have an account" and never a second account; a first passphrase set by a reset or
  Google's first link makes that account's seats wait for its holder's yes (`engine/CLAUDE.md`, the account flow). The
  operator's one-time sign-up code remains for the operator's own and the reviewer accounts (only its hash stored;
  single-use, expiring, revocable; no route mints one). An account creates at most one org, proven by its own
  passphrase (a seat's key never creates one).
- **CI is local.** No GitHub Actions workflow exists and no runner executes this repo's code. The suites run on the
  developer's own machine. The internal team (`sharingu-devs`) has write access; `main` changes only through a merged PR.

## Current posture (read before assessing)

**This repo is PRIVATE, permanently (the owner, 2026-10-09: proprietary, hosted-only)**, released to named
collaborators the owner adds by hand: no open signup, no shared demo password. A retired Supabase project's
`service_role` JWT, gone from the current tree, remains in git history — acceptable while the repo never goes
public; rotate/retire stands done on the Supabase side.

## Supply chain

Joining an org is a URL and a key: nothing to clone, nothing to install. The one optional script is the platform's
`GET /install` (`curl -fsSL https://agent.sharingu.xyz/install | sh`): it signs in once, keeps the session token in
`~/.sharingu-agent-r-token` (chmod 600) and writes skills into `~/.claude/skills`. A new org is a write through the door
(`/orgs/new`). The engine is proprietary and hosted-only (the owner, 2026-10-09): no self-hosted installs exist.
