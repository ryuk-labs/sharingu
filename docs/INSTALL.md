# INSTALL — using sharingu (hosted; the engine is proprietary — © Ryuk Labs, no self-hosting)

sharingu is one hosted platform, `https://agent.sharingu.xyz`: one worker and one database serve every org, each org at
its own address, `/<org>`, and every AI at the one `/mcp`. The engine is proprietary and runs only there. A new team
starts in four steps, the same on the site's docs page (https://www.sharingu.xyz/docs.html), in the plugin's README and
in the door's first-run guide:

| Step | Section |
|---|---|
| 1. Join and connect | [§1](#1-join-and-connect) |
| 2. Your org, its project, its people | [§2](#2-your-org-its-project-its-people) |
| 3. Fill the product side | [§3](#3-fill-the-product-side) |
| 4. Fill the GTM side | [§4](#4-fill-the-gtm-side) |
| Then: every contribution tracked | [§5](#5-then-every-contribution-tracked) |
| Work on sharingu itself (Ryuk Labs' team) | [§6](#6-work-on-sharingu-ryuk-labs-team) |

## 1. Join and connect

1. **The waitlist.** The beta holds 50 orgs, first come, first served, through the waitlist
   (https://www.sharingu.xyz/waitlist). We approve each org and hand you a one-time sign-up code for your email, by hand.
   Nothing is mailed, ever (`docs/BETA-NOTE.md`).
2. **Sign up** at `https://agent.sharingu.xyz/signup`: your email, the code and a passphrase of at least 12 characters.
   That is your account: one sign-in for every org you hold a seat in.
3. **Create your org** at `https://agent.sharingu.xyz/orgs/new`: your email and that passphrase, the org's name, its
   address (a to z, 0 to 9 and single dashes, 2 to 40 characters, never a name the platform uses) and its first
   project's short name. One write makes the org, your owner seat in it and its first project, and shows your owner key
   ONCE: keep it. An account creates one org during the beta and may be a member of any number. Your org is at
   `https://agent.sharingu.xyz/<your-org>/`.
4. **Connect your AI.** Every client uses the one MCP address, `https://agent.sharingu.xyz/mcp`, and signs in on the
   platform's own page: there is no key to paste. Control · Connect shows each way with the exact lines.
   - **Add to Claude** (Claude Desktop and claude.ai): Claude's install link for a custom connector opens its "Add custom
     connector" dialog with sharingu and the `/mcp` URL filled in; confirm it, press Connect and sign in.
   - **Add to ChatGPT:** on https://chatgpt.com/plugins choose Add custom MCP server, paste the `/mcp` URL and sign in.
   - **Claude Code, the plugin:** `claude plugin marketplace add ryuk-labs/sharingu-plugin`, then
     `claude plugin install sharingu@sharingu` (the plugin's public distribution repository; the engine's stays private).
     Run `/mcp`, pick `sharingu` and sign in (`plugin/README.md`). It carries the skills of steps 3 and 4.

   Signed in with your account's passphrase, a connection reaches every org your account has a seat in and acts in its
   current one unless a call names another with `orgSlug`; `whoami` lists the orgs and marks the current one.
   With a seat's own key instead, the connection is that seat alone. The key ways, for scripts and clients without the
   sign-in:
   - **Claude Code, with a key:**
     `claude mcp add sharingu --transport http https://agent.sharingu.xyz/mcp --header "Authorization: Bearer <your-key>"`
   - **Codex:** a streamable HTTP server: the `/mcp` URL and the header `Authorization: Bearer <your-key>`.
   - **Plain HTTP:** the REST API takes the same key as `Authorization: Bearer <your-key>`; `GET /whoami` proves it.

## 2. Your org, its project, its people

- **The project.** Your org's first project came with it. An admin adds another on Control, or through the door with
  `create_project` (a key and a name).
- **Invite people.** On Control, Members · Invite (name, email, role, projects) gives a ONE-TIME INVITE LINK, shown once:
  send it yourself. It works once, for that person's email only, for 7 days. They open it, choose their own passphrase
  and land in your org signed in; nobody else ever sees their secret. An account made by an invite reaches only that
  org; creating an org of its own still takes the operator's code (§1). A person whose email already holds an account
  gets no link: they sign in at `/login` and accept the seat on their org list (`/orgs`); until they accept, the seat
  opens nothing. A row's "New invite link" makes a fresh one (any older link ends).
- **Roles.** Admin, Member, and Partner: an outside collaborator who sees only the projects they are seated on (one,
  if that is all they work on).
- **Hats.** Each person's hats shape what Home shows them first; the admin sets the hats that unlock briefings and
  cards. The seven: Management (the C-level), Engineering (the devs), Go-to-market (BD and marketing), Quality (the
  testers), Finance, Organization and Partner.

## 3. Fill the product side

Your AI, with the code, docs and tickets it can already read, runs the skill **Fill the product side**
(`fill-the-product-side`): goals, the Map (screens with their wireframes, the API map, the database schema, the flows
and the services the product connects to), decisions with their reasons, and docs. Every item is previewed, then filed.
The plugin carries it as a skill; in any other client, the `broadcast` call lists it on the starter shelf and
`equip` {slug: "preset:fill-the-product-side", v: <its version on the shelf>} previews the copy, and the same call
with `confirm: true` puts it in the project as a doc to `read`.

The skill walks the door's first calls, which are also the way to file anything by hand, in order:

1. `whoami` — your name, your projects, your hats, where your writes land, and your orgs;
2. `missing` with `project` — what that project still needs, each item with the `preview` call that fills it;
3. `formats` — how each kind of item is shaped;
4. `preview` — every write: the aim, goals, questions, checks, cards, the model, docs, a contribution with its proof.
   It files nothing and shows what will land, where it shows, how it is graded, what it reaches and which tool files it
   (a grade goes through `submit_grade`, an answer through `respond`);
5. the write tool each item names — `file_contribution`, `save_knowledge` or `remove_knowledge` — with the `previewId`
   and the same items: it files them, and the app shows them at once.

## 4. Fill the GTM side

Your AI, with the apps you have connected to it (mail, DMs, meetings, CRM, revenue, search and AI-answer signals), runs
the skill **Fill the GTM side** (`fill-the-gtm-side`): GTM cards and contributions, as summaries and links only, never
the raw mail or message text; revenue only as the figures the person names. Every item is previewed, then filed.
sharingu reads none of those apps itself: your AI reads them with its own connectors.

## 5. Then: every contribution tracked

Home shows what changed and what waits on you; Build, the contributions and their grades; Goals, how far each goal
has moved: a request is proposed, decided, built and graded, and both the product side and the GTM side move the goal.
Activity follows the contributions across every project. The skill **The weekly review** (`weekly-review`) reads the
week: what changed, who filed what, where.

Every session: `updates` first (what changed for you and what waits on you); `ask` asks the owner; `wrap_up` hands over
at the end. The open questions are `decisions`; the owner rules one with `rule_question`. Every tool, who may call it
and whether you may: `GET /capabilities`.

## 6. Work on sharingu (Ryuk Labs' team)

The engine's repository is private (proprietary, © Ryuk Labs). Nothing local reaches Cloudflare.

```bash
git clone https://github.com/ryuk-labs/sharingu.git && cd sharingu/engine && npm install
sh tools/dev-local.sh up     # the local app; prints its URL
sh tools/smoke.sh            # the per-slice proof
```

How a change is built: `AGENTS.md`.
