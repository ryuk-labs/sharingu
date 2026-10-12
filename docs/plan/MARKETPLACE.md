# The marketplace launch — the main aim once beta is green (owner, 2026-10-01)

sharingu listed where people already find tools: Claude (the plugin marketplace and the connector directory) and
ChatGPT / Codex (the app directory). Starts when every line of the beta gate in `BETA.md` passes. Store rules change:
each requirement below is re-read from the store's own page on the day we submit (the sources are at the foot).

The brand's domain is **sharingu.xyz** (the owner, 2026-10-09; the site LIVE there — privacy and docs answer; support and terms restored this sprint). The app's address on it: **agent.sharingu.xyz** (the same worker; agent.ryuklabs.io keeps answering). The old sharingu.ryuklabs.io is dead and every reference here moved.

## The three listings

| Listing | Reaches | What the store asks | Where we stand (checked 2026-10-10) |
|---|---|---|---|
| **Claude Code plugin** | Claude Code and Cowork; browsable on claude.ai | a plugin folder (a manifest, skills, an MCP config file), submitted at claude.ai/directory/manage (a paid claude.ai plan), an automated security scan | READY but held for sprint 12 (owner, 2026-10-10): the plugin in the public dist repo ryukdev/sharingu-plugin (0.1.4 live; sprint 11 makes 0.1.5), passing the directory's automated checks as read (README ≥ 40 words, a license, no scripts); `listing/SUBMISSION.md` holds every field |
| **Claude connector directory** | claude.ai, Claude desktop, Claude Code | a remote HTTPS MCP server; a supported sign-in; every tool with a title and a read-only or destructive annotation; a docs URL, a privacy policy, a support contact, an icon; a populated reviewer account | READY but held for sprint 12: OAuth with dynamic client registration, every tool annotated, the public docs at www.sharingu.xyz/mcp-tools.html, the reviewer org on live, the carousel (sprint 11, retaken after sprint 12's card polish) |
| **ChatGPT app directory** (the route to Codex — to confirm) | ChatGPT; Codex | the same server and annotations; an icon (64 × 64, under 5 KB), a name (30 characters), descriptions, screenshots; privacy policy AND terms at stable public URLs; a verified website; reviewer credentials; five positive and three negative test cases | since 2026-07-09 the PLUGIN directory (skills + one MCP server): sprint 11 builds the Codex manifest, the ZIP and the domain verification route; the owner's: the demo video, the portal's token |

## The one structural decision — ruled: hosted, one address (owner, 2026-10-06)

A directory listing points every user at ONE address. Until 2026-10-06 every org had its own worker and address and
M3 was parked (MCQs 2026-10-02 and 2026-10-05). On 2026-10-06 the owner made sharingu a hosted platform: one worker and
one database for every org, each org at `agent.ryuklabs.io/<org>`, the AI at the one `/mcp` there, sign-up by an
allowlist during the waitlist, payment after the beta succeeds. The design, the sprints and every open item:
`PLATFORM.md`. The release ruled on 2026-10-05 stands: beta teams by GitHub collaborator invite with
`docs/BETA-NOTE.md`. OVERTURNED 2026-10-09 by the owner: sharingu is PROPRIETARY (© Ryuk Labs) and the engine's repo stays PRIVATE for good — the plugin is distributed from its own small PUBLIC repo holding only the plugin folder (no engine code; synced from this repo). The plugin installs FREE; the SERVICE is the priced product (the platform's plans; prices at billing time). The beta is hosted-only.

## The stages

| # | Stage | What is built | Done when |
|---|---|---|---|
| M0 | Store-ready door — built (D5, `7fafeb61b`) | every tool has a title and the four MCP annotations, set by one rule from the registry; the names are final | the contract lists them for every tool; `tools/annotations-selftest.mjs` fails a tool without them and calls each read-only tool to prove it writes no row |
| M1 | The plugin (`PLATFORM.md` sprint 9) — shipped 2026-10-10; installs from ryukdev/sharingu-plugin | a plugin folder in the repo: the manifest, the skills generated from the starter pack, an MCP config on the one address (sign-in, no questions); a README; our own marketplace file so it installs from the repo first | installs in Claude Code from the repo on a clean machine; connects to a fresh org; the fill skill takes a new project to its first filed contribution |
| M2 | The listing kit (`PLATFORM.md` sprint 9) — shipped 2026-10-10; the shots and the reviewer org live at M4 prep | the docs page, generated from `GET /capabilities` (every tool with its title, read or write, who may call it and how it fails; every route with who may call it); the privacy page, the support address and the icon from sharingu.xyz, a terms page; the screenshots; the reviewer org (the real sharingu project, a second sample project, three accounts: admin, member, partner); the test cases | every URL answers; a stranger follows the docs from zero to a filed contribution |
| M3 | One address (the platform road, `PLATFORM.md` sprints 6–8) — shipped (sprints 6–8) | the hosted front door: sign up, your org minted, one MCP address that reaches it; budgets and backups per org | two orgs behind one address, each seeing only its own data, proven by the adversarial read |
| M4 | Submit | the plugin to Anthropic's directory portal; the connector to the Claude directory; the app to the ChatGPT directory; each with reviewer notes | three submissions acknowledged |
| M5 | Review and launch | answer the reviewers; fix what they find; the launch post, the second video, the waitlist told | listed and installable from each store |

Order (owner MCQ, 2026-10-06): M0 is built; M3 comes first as `PLATFORM.md` sprints 6–8; M1 and M2 are sprint 9;
then M4 and M5; billing after the beta succeeds.

## What only the owner can prepare

| # | What | Needed for | State (2026-10-10) |
|---|---|---|---|
| 1 | The address, the sign-up and the limits of hosted orgs | M3 | RULED: `agent.sharingu.xyz/<org>` (2026-10-09; agent.ryuklabs.io answers too); an allowlist with a one-time code, no email service; the limits proposed in `PLATFORM.md` sprint 8 (the owner may change any) |
| 2 | The engine's release form and licence | M1 | RE-RULED 2026-10-09: proprietary, © Ryuk Labs, repo private; the plugin ships from its own public distribution repo (was: MIT public (`BETA.md` line 6) |
| 3 | The legal name that publishes, a **terms of service**, and the **privacy policy** saying who can reach a hosted org's data (only the deployment credentials) | M4 (terms); the first outside org (privacy) | DONE 2026-10-09: live at www.sharingu.xyz — privacy.html, support.html, terms.html (each 200) |
| 4 | A support and a security contact | M4 | RULED: the contact sharingu.xyz gives |
| 5 | Accounts: a paid claude.ai plan for the directory portal; an OpenAI developer account with the organisation verified; the website's domain verified for OpenAI | M4 | READY (the owner, 2026-10-10: the paid plan and the OpenAI organisation, when needed) |
| 6 | The name and one-liner: the plugin's slug (NEVER changeable once published), the 30-character store name, the descriptions | M1, M4 | RULED: `sharingu`, the site's title and description |
| 7 | Brand files: an icon at 64 × 64 under 5 KB and larger sizes | M2 | RULED: from sharingu.xyz (`~/batcave_vm/sharingu_website`) |
| 8 | Approval of what is shown publicly: the sharingu project only, no client names | M2, M5 | APPROVED as-is at sprint 9's ship MCQ (2026-10-09): the shots and the reviewer org's content |
| 9 | Payment: the provider account, the prices | billing | after the beta succeeds |
| 10 | ~~A second Cloudflare account for a self-hosted install~~ (dead 2026-10-09: hosted-only, no self-hosting) | — | deferred (`BETA.md` line 7) |
| 11 | An Anthropic partner contact, for the official (Anthropic-run) marketplace | after M5 | open |
| 12 | The launch: who is told, where it is posted, the date | M5 | open |

## Sources (read again on submission day)

- https://code.claude.com/docs/en/plugins/publish · https://code.claude.com/docs/en/plugins/anthropic-marketplaces
- https://claude.com/docs/connectors/building/submission
- https://help.openai.com/en/articles/20001040-submitting-apps-to-the-chatgpt-app-directory
- https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/
