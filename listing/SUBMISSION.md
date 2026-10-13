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
| Reads or writes | Both: 18 read-only tools and 19 writes; 12 of the writes are destructive (`create_project`, `decide_contribution`, `equip`, `open_items`, `pick_up`, `regrade`, `remove_knowledge`, `respond`, `restore_version`, `rule_question`, `save_knowledge`, `submit_grade`), the other 7 only add; each tool has a title and its three hints (their reasons: the ChatGPT section) |
| Prerequisites | A sharingu account (the beta is by invitation: the operator hands a one-time sign-up code) and an org |

**Description (≤ 2,000):**

sharingu is one company brain for the AI tools your team already uses. People and their assistants file contributions
through one MCP server: goals and their progress, decisions with their reasons, open questions, docs, screens and a
map of the product. Each org's work lands in its own walled space, and the app shows it live in eight tabs: Home,
Build, GTM, Goals, Decisions, Map, Broadcast and Control, with a search across the project.

Every write is previewed before it lands. Your AI calls `preview`, you see exactly what would be filed and what it
touches, and only then does it file each part with the tool its items name: `file_contribution` the contributions,
`save_knowledge` the knowledge it adds or changes, `remove_knowledge` the knowledge it removes; where the client
supports confirmation, nothing is filed until you say yes.
Questions go to the person who owns the decision, who rules on them; the record keeps who decided, when and why.

Roles decide what each seat reads and does: an owner manages the org, its projects and its people; members work across
the projects they are seated on; a partner sees only the project it was invited to. Reads never change anything, and
every write tool is marked as such.

Start with `whoami` (who you are and where your writes land), then `missing` (what a project still needs, each with
the call that fills it), then `preview` and the write tool each item names.

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

**Before submitting, locally:** `claude plugin validate --strict ./plugin` from the repo root, exit 0 (the same manifest
and files the form's Validate reads).

1. **Source:** repository ryuk-labs/sharingu-plugin, plugin path `plugin`, branch `main` (public; GitHub connected on
   claude.ai with push access). **Validate**; it reads the manifest (`plugin/.claude-plugin/plugin.json`), the README (≥ 40 words) and the license
   (`Proprietary`, the `LICENSE` file).
2. **Listing details:** read from the manifest and the README (the generator owns both; a change is a new version).
3. **Data handling:** reads and stores (the form counts data pulled through connectors: through sharingu it reads the
   team's names and emails and stores each filing with its author); no skill sends data anywhere but its declared
   connector, the sharingu MCP server; retention longer (filings stay until removed); not intended for people under 18.
   The plugin runs no code (skills and one MCP server entry). The manifest declares the docs, privacy, support and
   terms URLs (plugin 0.1.16, the directory's link checks).
4. **Compliance:** the contact email (acie@ryuklabs.io) and the four acknowledgements.
5. **Review and submit:** keep the GitHub push webhook (it needs admin on the repo); the directory follows `main`.
   **Auto-publish passing versions:** leave it OFF for the first submission (the kit's advice): each version is then
   reviewed by hand before it reaches users, and a push to `main` publishes nothing on its own. Turn it on later, once a
   few versions have passed review. Submit the connector as well (above): the plugin points at it.

## ChatGPT · the plugin with its MCP server (OpenAI platform → Apps)

1. **The package:** the ZIP that `node engine/tools/make-plugin-skills.mjs --openai-zip <out.zip>` builds (it refuses when
   the plugin is stale or a file holds a credential): the Codex manifest `plugin/.codex-plugin/plugin.json`, `plugin/.mcp.json`
   (the one server, no header; the ZIP's copy alone adds OpenAI's `extensions["com.openai"].auth`
   `{ "type": "oauth", "client": { "mode": "dcr" } }`, its registration endpoint found by discovery), the skills, the logo and
   composer icon (`plugin/assets/`, from `listing/icon/`), LICENSE and README. The manifest is GENERATED with the skills:
   its identity is the Claude manifest's, its `interface` listing `listing/codex-listing.json`'s facts plus this file's
   description and four URLs, its review block the five positive and three negative cases of `listing/test-cases.md`,
   its `publication.release_notes` the release notes below (item 4).
   **Developer identity:** on upload, choose the verified business identity **Ryuk Labs** (not an individual): the
   directory shows the name of the identity chosen, and the manifest's `developerName` is the same.
2. **Not ready to submit** until: the domain verification answer at
   `https://agent.sharingu.xyz/.well-known/openai-apps-challenge` (live since sprint 11; the operator stores the portal's
   token: `node tools/operator.mjs set-openai-challenge --token <the portal's token> --live --config wrangler.jsonc
   --confirm-live ryuklabs-agent-r` from `engine/`, then the portal's Verify; stored 2026-10-13, both domains answer
   it), and the demo. Its URL is fixed: `https://www.sharingu.xyz/docs.html#walkthrough` (`demoRecordingURL` in
   `listing/codex-listing.json`; the docs page's walkthrough section, owner's MCQ 2026-10-13), so the ZIP never changes
   for a new video. The store asks that it show the main use cases and tools "across supported platforms": the owner
   records the test cases in ChatGPT on desktop AND on mobile (the ChatGPT app), and it joins that section BEFORE
   submitting (the owner's ruling: submit only once it is there).
   Reviewer access goes in the dashboard, never in the ZIP; reviewer sign-in works without MFA or email codes (an email
   and its code), as the store asks.
3. **Tool annotations:** the portal reads each tool and its three hints from its scan of the live server, and the final
   submission asks "a justification for each value on every MCP tool" (the submission-errors page; the guidelines also say
   justifications "are no longer required", and an automated finding can be appealed). No field of the ZIP carries one, so
   paste each reason from the table below where the portal asks. It is GENERATED from `contracts/door.json` by
   `node engine/tools/make-plugin-skills.mjs` (one sentence per hint, by rule; `--check` is red when it drifts).

<!-- BEGIN GENERATED by engine/tools/make-plugin-skills.mjs from contracts/door.json: each tool's three hints and their reasons. Do not edit by hand. -->

37 tools: 18 read-only, 19 writes (12 destructive, 7 that only add), 2 open-world (`save_file`, `wrap_up`).

| Tool | readOnlyHint | destructiveHint | openWorldHint |
|---|---|---|---|
| `ask` | false: it keeps state on sharingu, so it is not read-only: it asks the owner a question in a sentence or two. | false: it only adds to the org's record and changes nothing already there. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `brief` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `broadcast` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `build` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `changes` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `create_project` | false: it keeps state on sharingu, so it is not read-only: it creates a project, or makes an archived one active again, and answers its first checklist items with their calls. | true: it can change what is already in the org's record: it creates a project, or makes an archived one active again, and answers its first checklist items with their calls. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `decide_contribution` | false: it keeps state on sharingu, so it is not read-only: it decides a contribution that waits for the owner. | true: it can change what is already in the org's record: it decides a contribution that waits for the owner. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `decisions` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `equip` | false: it keeps state on sharingu, so it is not read-only: it equips a shelf item into a project at version v, or updates it to that version. | true: it can change what is already in the org's record: it equips a shelf item into a project at version v, or updates it to that version. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `file_contribution` | false: it keeps state on sharingu, so it is not read-only: it files the contributions of a preview the person has seen and agreed to, by its previewId and the SAME contribution items in their order. | false: it only adds to the org's record and changes nothing already there. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `formats` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `goals` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `gtm` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `home` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `impact` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `map` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `missing` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `open_items` | false: it keeps state on sharingu, so it is not read-only: it opens an open item or closes one, and answers your open items. | true: it can change what is already in the org's record: it opens an open item or closes one, and answers your open items. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `pick_up` | false: it keeps state on sharingu, so it is not read-only: it takes a contribution's next action. | true: it can change what is already in the org's record: it takes a contribution's next action. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `preview` | false: it keeps state on sharingu, so it is not read-only: it shows what filing 1 to 200 items would do and keeps that preview for an hour. | false: it only adds to the org's record and changes nothing already there. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `publish` | false: it keeps state on sharingu, so it is not read-only: it publishes one of your own drafts to the org's shelf as its next version. | false: it only adds to the org's record and changes nothing already there. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `publish_version` | false: it keeps state on sharingu, so it is not read-only: it keeps a snapshot of the project's whole knowledge as version n+1, with a title that says why it exists. | false: it only adds to the org's record and changes nothing already there. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `read` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `read_file` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `regrade` | false: it keeps state on sharingu, so it is not read-only: it regrades the stale or ungraded checks of one flow, node or list of checks. | true: it can change what is already in the org's record: it regrades the stale or ungraded checks of one flow, node or list of checks. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `remove_knowledge` | false: it keeps state on sharingu, so it is not read-only: it removes what the knowledge removes of a preview the person has seen and agreed to name, by its previewId and the SAME remove items in their order. | true: it can change what is already in the org's record: it removes what the knowledge removes of a preview the person has seen and agreed to name, by its previewId and the SAME remove items in their order. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `respond` | false: it keeps state on sharingu, so it is not read-only: it answers an open question with one of its options. | true: it can change what is already in the org's record: it answers an open question with one of its options. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `restore_version` | false: it keeps state on sharingu, so it is not read-only: it makes the project's knowledge that version's on every screen. | true: it can change what is already in the org's record: it makes the project's knowledge that version's on every screen. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `rule_question` | false: it keeps state on sharingu, so it is not read-only: it rules an open question. | true: it can change what is already in the org's record: it rules an open question. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `save_file` | false: it keeps state on sharingu, so it is not read-only: it saves a document or an HTML dump and answers its id and a link you can cite. | false: it only adds to the org's record and changes nothing already there. | true: it can reach beyond sharingu: what it hands over may also go to a service the org has linked. |
| `save_knowledge` | false: it keeps state on sharingu, so it is not read-only: it saves the knowledge upserts of a preview the person has seen and agreed to, by its previewId and the SAME upsert items in their order. | true: it can change what is already in the org's record: it saves the knowledge upserts of a preview the person has seen and agreed to, by its previewId and the SAME upsert items in their order. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `search` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `submit_grade` | false: it keeps state on sharingu, so it is not read-only: it grades one check. | true: it can change what is already in the org's record: it grades one check. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `updates` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `versions` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `whoami` | true: it only reads what the signed-in account may see, and writes nothing. | false: it only reads, so it removes or overwrites nothing. | false: it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace. |
| `wrap_up` | false: it keeps state on sharingu, so it is not read-only: it hands over at a session's end. | false: it only adds to the org's record and changes nothing already there. | true: it can reach beyond sharingu: what it hands over may also go to a service the org has linked. |

<!-- END the generated annotations -->

4. **Release notes** (the manifest carries them as `publication.release_notes`, so the review form imports them; the
   generator reads them from here):

   > First public release of sharingu for ChatGPT. One MCP server (`https://agent.sharingu.xyz/mcp`, OAuth with dynamic
   > client registration) and 19 skills. Read a project's goals, decisions, open questions, docs and map; preview every
   > write before it lands and file it only on confirmation; questions go to the person who owns the decision. Each
   > contribution records which AI tool filed it, as the tool names itself. Hosted beta: an account comes with a
   > one-time sign-up code from the operator.

## The videos (the owner's, after the submissions are prepared)

`listing/videos/` holds the four walkthroughs (1 join and connect, 2 the org and its people, 3 fill the product side,
4 fill the GTM side and every contribution tracked; each under 90 s, captions only). Neither Claude form takes a video.
They are public on the site's docs page, section `#walkthrough` (owner's MCQ, 2026-10-13: the site first, YouTube may
come later behind the same URL); the owner's ChatGPT recording of the test cases joins the same section, and that
section's URL is ChatGPT's `demoRecordingURL`.

## Reviewer access (paste into the forms; the codes from the private file)

The reviewer org is "sharingu review" at `https://agent.sharingu.xyz/sharingu-review`. It holds the real sharingu
project (its goals, decisions, map and docs) and a small Sample project.

- **admin** `admin@review.sharingu.xyz`, code `<from the private file>` (the org's owner, Management and Finance: both projects, every tool)
- **member** `member@review.sharingu.xyz`, code `<from the private file>` (both projects)
- **dev** `dev@review.sharingu.xyz`, code `<from the private file>` (a member, Engineering: both projects)
- **bd** `bd@review.sharingu.xyz`, code `<from the private file>` (a member, Go-to-market and Organization: both projects)
- **marketing** `marketing@review.sharingu.xyz`, code `<from the private file>` (a member, Go-to-market: both projects)
- **tester** `tester@review.sharingu.xyz`, code `<from the private file>` (a member, Quality: both projects)
- **partner** `partner@review.sharingu.xyz`, code `<from the private file>` (an outside partner: the Sample project only)

The Sample project holds the Pilot Shop walkthrough (a made-up shop): every Map layer, and one request's loop on its goal,
each step filed by the account that does it (`listing/test-cases.md`).

To connect: add `https://agent.sharingu.xyz/mcp` as a custom connector (Claude) or a custom MCP server with OAuth
(ChatGPT: Plugins, the plus button, Add custom MCP server), press Connect, and sign in on sharingu's page with an
account's email and its code (the code is the passphrase). No header or key goes in the client. The test
cases, step by step: `listing/test-cases.md` (paste its text).
