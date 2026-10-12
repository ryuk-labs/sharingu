# sharingu — the store submission kit (M4; `docs/plan/MARKETPLACE.md`)

What each store's form asks for, filled in, to paste. The owner submits from their own accounts: the paid claude.ai plan
(with GitHub connected on claude.ai) and the verified OpenAI organisation. The reviewer accounts' codes are NOT in this
file: they are in `~/.sharingu/reviewer-credentials.txt` on the operator's machine (mode 600), made by
`engine/tools/make-reviewer-org.mjs --live` (2026-10-10; org 3 at /sharingu-review, the real sharingu project and a
sample project). `--reissue` replaces them.

## The facts every form shares

| Field | Value |
|---|---|
| Name | sharingu |
| Slug | `sharingu` (permanent once published) |
| One-liner (≤ 200) | One company brain for your team's AI tools: file goals, decisions, questions and docs through MCP, preview every write, and see it live in your org. Humans decide. |
| MCP server | `https://agent.sharingu.xyz/mcp` (one URL for every org; Streamable HTTP) |
| Authentication | OAuth 2.0 with dynamic client registration (its registration endpoint, /oauth/register), PKCE S256; no key in the client |
| Website | https://www.sharingu.xyz |
| Documentation | https://www.sharingu.xyz/docs.html · the tools and routes: https://www.sharingu.xyz/mcp-tools.html |
| Privacy policy | https://www.sharingu.xyz/privacy.html |
| Terms of service | https://www.sharingu.xyz/terms.html |
| Support | https://www.sharingu.xyz/support.html · acie@ryuklabs.io |
| Company | Ryuk Labs · https://www.sharingu.xyz · contact acie@ryuklabs.io |
| Icon | `listing/icon/` (64 × 64 under 5 KB, and 128, 256, 512; from the site's favicon) |
| Reads or writes | Both: 18 read-only tools, 17 write tools, each with a title and its annotation |
| Prerequisites | A sharingu account (the beta is by invitation: the operator hands a one-time sign-up code) and an org |

**Description (≤ 2,000):**

sharingu is one company brain for the AI tools your team already uses. People and their assistants file contributions
through one MCP server: goals and their progress, decisions with their reasons, open questions, docs, screens and a
map of the product. Each org's work lands in its own walled space, and the app shows it live in eight tabs: Home,
Build, GTM, Goals, Decisions, Map, Broadcast and Control, with a search across the project.

Every write is previewed before it lands. Your AI calls `preview`, you see exactly what would be filed and what it
touches, and `file` files it only then; where the client supports confirmation, nothing is filed until you say yes.
Questions go to the person who owns the decision, who rules on them; the record keeps who decided, when and why.

Roles decide what each seat reads and does: an owner manages the org, its projects and its people; members work across
the projects they are seated on; a partner sees only the project it was invited to. Reads never change anything, and
every write tool is marked as such.

Start with `whoami` (who you are and where your writes land), then `missing` (what a project still needs, each with
the call that fills it), then `preview` and `file`.

**Use cases:**
1. Keep the team's goals, decisions and open questions in one place that every AI tool can read and update.
2. File what an assistant learned during a session (a decision, a doc, a note) as a reviewed contribution, with its why.
3. Bring an outside partner into one project without exposing the rest of the org.

## Claude · the connector (claude.ai/directory/manage → Submit new → MCP connector)

1. **Connection:** `https://agent.sharingu.xyz/mcp`, one URL.
2. **Tools:** sync from the server; every tool already carries `title` and `readOnlyHint` or `destructiveHint`
   (the door's M0, `engine/tools/annotations-selftest.mjs`). Nothing should be flagged.
3. **Listing:** the facts above; categories: productivity, project management, knowledge (the closest the portal offers).
4. **Use cases:** the three above; prerequisites: the account and org; reads and writes.
5. **Company:** Ryuk Labs.
6. **Authentication:** OAuth with dynamic client registration.
7. **Data handling:** our own first-party API (the server is the product's own); no personal health data; no
   sponsored content.
8. **Test & launch:** paste "Reviewer access" below, with the seven accounts' emails and codes from the private file.
   Confirm every tool was run: the product's suites call every tool on every ship (the smoke, `s51` walks these test
   cases); the owner also connects once as a custom connector in Claude and runs P1–P3 before ticking it. While there,
   open Activity after P1's filing: its row must read "from Claude" (13.1's label; a filing through Claude Desktop's
   `mcp-remote` bridge reads "from another client", `docs/plan/PLATFORM.md` §3). If claude.ai's own row reads "another
   client" too, stop and fix the label before submitting.
   **Allowed link URIs** (optional, on the same form): `https://agent.sharingu.xyz` — the card's "Open in the app"
   opens there, and a declared origin opens without the user confirming each link.
9. **Compliance:** the seven acknowledgements (the owner reads and ticks each).
10. **MCP App carousel:** 3–5 PNGs ≥ 1000 px wide, cropped to the app's response, each with its prompt
    (`listing/carousel/`: four PNGs 1120 px wide, each with its prompt in `listing/carousel/prompts.md`; retaken
    2026-10-12 on sprint 13's code). The store asks for the app's response only, without the prompt in the image:
    each PNG is the card alone.

## Claude · the plugin (claude.ai/directory/manage → Submit new → Plugin bundle)

1. **Source:** repository ryuk-labs/sharingu-plugin, plugin path `plugin`, branch `main` (public; GitHub connected on
   claude.ai with push access). **Validate**; it reads the manifest (`plugin/.claude-plugin/plugin.json`), the README (≥ 40 words) and the license
   (`Proprietary`, the `LICENSE` file).
2. **Listing details:** read from the manifest and the README (the generator owns both; a change is a new version).
3. **Data handling:** the plugin itself reads or stores no personal data and runs no code (skills and one MCP server
   entry); it sends data only to its declared connector, the sharingu MCP server; it keeps nothing; not intended for
   people under 18.
4. **Compliance:** the contact email (acie@ryuklabs.io) and the four acknowledgements.
5. **Review and submit:** keep the GitHub push webhook (it needs admin on the repo); the directory follows `main`.
   Submit the connector as well (above): the plugin points at it.

## ChatGPT · the plugin with its MCP server (OpenAI platform → Apps)

1. **The package:** the ZIP that `node engine/tools/make-plugin-skills.mjs --openai-zip <out.zip>` builds (it refuses when
   the plugin is stale or a file holds a credential): the Codex manifest `plugin/.codex-plugin/plugin.json`, `plugin/.mcp.json`
   (the one server, no header; OAuth with dynamic client registration found by discovery), the skills, the logo and
   composer icon (`plugin/assets/`, from `listing/icon/`), LICENSE and README. The manifest is GENERATED with the skills:
   its identity is the Claude manifest's, its `interface` listing `listing/codex-listing.json`'s facts plus this file's
   description and four URLs, its review block the five positive and three negative cases of `listing/test-cases.md`.
2. **Not ready to submit** until: the domain verification answer at
   `https://agent.sharingu.xyz/.well-known/openai-apps-challenge` (live once sprint 11 ships; the operator stores the portal's
   token: `node tools/operator.mjs set-openai-challenge --token <the portal's token> --live --config wrangler.jsonc
   --confirm-live ryuklabs-agent-r` from `engine/`, then the portal's Verify), and a demo video
   of the test cases at a URL reviewers can open (the owner's: add it to `listing/codex-listing.json` as
   `demoRecordingURL`, then regenerate). Reviewer access goes in the dashboard, never in the ZIP; reviewer sign-in works
   without MFA or email codes (an email and its code), as the store asks.
3. **Release notes** (the review form asks for them; paste):

   > First public release of sharingu for ChatGPT. One MCP server (`https://agent.sharingu.xyz/mcp`, OAuth with dynamic
   > client registration) and 19 skills. Read a project's goals, decisions, open questions, docs and map; preview every
   > write before it lands and file it only on confirmation; questions go to the person who owns the decision. Each
   > contribution records which AI tool filed it, as the tool names itself. Hosted beta: an account comes with a
   > one-time sign-up code from the operator.

## The videos (the owner's, after the submissions are prepared)

`listing/videos/` holds the four walkthroughs (1 join and connect, 2 the org and its people, 3 fill the product side,
4 fill the GTM side and every contribution tracked; each under 90 s, captions only). Neither Claude form takes a video.
The owner uploads them as unlisted YouTube videos (owner's MCQ, 2026-10-12) and links them where wanted; ChatGPT's
`demoRecordingURL` is the owner's own ChatGPT recording of the test cases, not these.

## Reviewer access (paste into the forms; the codes from the private file)

The reviewer org is "sharingu review" at `https://agent.sharingu.xyz/sharingu-review`. It holds the real sharingu
project (its goals, decisions, map and docs) and a small Sample project.

- **admin** `admin@review.sharingu.invalid`, code `<from the private file>` (the org's owner, Management and Finance: both projects, every tool)
- **member** `member@review.sharingu.invalid`, code `<from the private file>` (both projects)
- **dev** `dev@review.sharingu.invalid`, code `<from the private file>` (a member, Engineering: both projects)
- **bd** `bd@review.sharingu.invalid`, code `<from the private file>` (a member, Go-to-market and Organization: both projects)
- **marketing** `marketing@review.sharingu.invalid`, code `<from the private file>` (a member, Go-to-market: both projects)
- **tester** `tester@review.sharingu.invalid`, code `<from the private file>` (a member, Quality: both projects)
- **partner** `partner@review.sharingu.invalid`, code `<from the private file>` (an outside partner: the Sample project only)

The Sample project holds the Pilot Shop walkthrough (a made-up shop): every Map layer, and one request's loop on its goal,
each step filed by the account that does it (`listing/test-cases.md`).

To connect: add `https://agent.sharingu.xyz/mcp` as a custom connector, press Connect, and sign in on sharingu's page
with an account's email and its code (the code is the passphrase). No header or key goes in the client. The test
cases, step by step: `listing/test-cases.md` (paste its text).
