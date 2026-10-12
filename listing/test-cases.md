# sharingu — test cases for a store reviewer

Five positive and three negative cases, each a numbered walk of what you ask your AI or do, and what you should see, against the **reviewer org**: an organization called
"sharingu review" that holds the real sharingu project (sharingu's own goals, decisions, map and docs) and a small
"Sample project", with seven accounts, one for each class of person in a real org. The operator builds it with
`node tools/make-reviewer-org.mjs` (from `engine/`) and hands you each account's email and sign-in code; the code is your
passphrase.

| Account | Role | Hats | Sees |
|---|---|---|---|
| admin | the org's owner | Management, Finance | both projects, every tool |
| member | a member | none | both projects |
| dev | a member | Engineering | both projects |
| bd | a member | Go-to-market, Organization | both projects |
| marketing | a member | Go-to-market | both projects |
| tester | a member | Quality | both projects |
| partner | an outside partner | Partner | the Sample project only |

The Sample project also holds an authored walkthrough, the Pilot Shop (a made-up online shop): three apps with their
screens and wireframes, its API, its database schema, its flows and the apps it connects on the Map, and one request's
whole loop on the goal "Pilot Shop: a business buyer pays by invoice", each step filed by the account that does it: the
bd account proposes it, the admin approves it, the dev picks it up and files it done, the tester grades its checks, and
marketing announces it. Every account reads it on that goal's page; `brief` for a hat reads what that hat needs first.

**The MCP address:** `https://agent.sharingu.xyz/mcp`. Add it to your client as a remote MCP server (in Claude: Settings,
Connectors, Add custom connector). The client opens sharingu's sign-in: enter the account's email and its code. No
header and no key go in the client's configuration. **The org in a browser:** `https://agent.sharingu.xyz/sharingu-review`,
signed in with the same email and code. The tools named below are listed with who may call them on the docs page,
https://www.sharingu.xyz/mcp-tools.html.

Each walk is what the product's own suites prove; `tools/listing-walk.mjs` walks all eight, each as the account its
heading names: on live after a refresh (`--url <worker> --codes <the refresh's codes file>`; it files P3's and P5's notes and
P4's accepted goal, as a reviewer would) and, through smoke case `s51`, in every smoke run, on a fresh reviewer org built with the sample alone: there the sharingu project is
empty, so P2's sharingu reads are walked as answering, not as its tree (the full world, ~18,130 rows written with the sample by the importer's measure of 2026-10-10, is the tool's local proof).

## Positive cases

### P1 · Connect and sign in — account: admin

1. Add the MCP address to your client and sign in as the admin.
2. Ask your AI: "Call sharingu's whoami." (the `whoami` tool) Expect: your name (Reviewer Admin), the role `owner`, the
   org "sharingu review", and the two projects your writes can land in, sharingu and the Sample project.

Also: a wrong credential is refused before any tool runs. A wrong code at the sign-in answers `invalid_login` and makes no
session; an MCP call with a made-up bearer token (`Authorization: Bearer not-a-real-key`) answers HTTP 401 `invalid_token`.

### P2 · Read the real sharingu project — account: member

1. Sign in as the member (in a new chat, or a second client).
2. Ask: "Show me the goals of the sharingu project" (the `goals` tool, project sharingu). Expect: sharingu's goal tree,
   each goal with its status and progress.
3. Ask: "Search the sharingu project for preview" (the `search` tool). Expect: matching goals, questions, docs and map
   nodes, each with a link.
4. Open the org in a browser as the member. Expect: Home, Decisions and the Map show the same project.

### P3 · File a contribution through preview, then file — account: member

1. Ask: "In the Sample project, file a note in the leader lane: what 'A reviewer's first note', why 'the store's test
   case'. Preview it first." Expect: the preview (the `preview` tool) shows the one item, "files at once", and says
   nothing is filed yet.
2. Ask: "File it." Expect: the receipt (the `file` tool) with the contribution's id, `T-` and the date and a number, and
   its link.
3. Ask: "Read that contribution." (the `read` tool) Expect: what you filed, by Reviewer Member, in the Sample project.
4. In the browser, open Build. Expect: the note is in the list.

### P4 · The confirm: nothing is filed until you say yes — account: admin

1. Ask: "In the Sample project, add a goal 'A reviewer goal' under the goal 'Every contribution closes the loop', and
   file it only after I confirm." (the `preview` tool, with its confirm) Expect: your client asks you to confirm,
   showing what would be filed (a client without confirm prompts answers that you were not asked, and files nothing).
2. Decline. Expect: "The person declined: nothing was filed."
3. Ask: "Read the goal 'A reviewer goal'." (the `read` tool) Expect: there is no such goal (`not_found`).
4. Ask again and accept. Expect: the goal is filed; it reads back under its parent, and the Goals tab shows it.

### P5 · A partner works only where it is seated — account: partner

1. Sign in as the partner.
2. Ask: "Call whoami." (the `whoami` tool) Expect: the role `partner` and ONE project, the Sample project.
3. Ask: "Show the Sample project's goals." (the `goals` tool) Expect: its goal tree.
4. Ask: "In the Sample project, file a note in the leader lane: what 'A reviewer's first note', why 'the store's test
   case'. Preview it, then file it." (`preview`, then `file`, as in P3) Expect: a receipt with its `T-` id.

## Negative cases

Each is a request your AI should not carry out: why, then the refusal or the safe fallback you should see.

### N1 · Nothing is deleted through the AI — account: admin

Why: sharingu has no tool that deletes or archives a project; a project is the owner's to archive on Control, in the
browser, and an archive is never a delete.

1. Ask: "Delete the Sample project and everything in it." Expect: your AI says it cannot: no sharingu tool deletes a
   project. Nothing changes: whoami still lists both projects, and the Sample project's goals still read. If it offers to
   remove the project's items one by one instead, that is a preview, which files nothing until you file it.

### N2 · A partner cannot read a project it has no seat on — account: partner

Why: a partner was invited to the Sample project only; the rest of the org is not its to read.

1. Ask: "Show the sharingu project's goals." Expect: refused with `project_forbidden`, naming the projects the partner
   holds (the Sample project only) and how to name one. No goal of sharingu is shown.

### N3 · A member cannot call an owner's tool — account: member

Why: making a project is the org owner's decision; a member works in the projects it is seated on.

1. Ask: "Create a project called Mine" (the `create_project` tool). Expect: refused with `owner_only`; no project is made
   (the admin's Control page lists only the two projects).
