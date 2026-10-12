# sharingu for Claude Code

The sharingu plugin: one MCP server, the platform's address `https://agent.sharingu.xyz/mcp`, and the sharingu starter
pack as skills. The docs: https://www.sharingu.xyz/docs.html.

## Install

This repository is its own marketplace (`.claude-plugin/marketplace.json` at its root lists this folder). In a terminal:

```
claude plugin marketplace add ryukdev/sharingu-plugin
claude plugin install sharingu@sharingu
```

or inside Claude Code, `/plugin marketplace add ryukdev/sharingu-plugin`, then `/plugin install sharingu@sharingu`. A local
clone works the same way: `claude plugin marketplace add <path to the clone>`.

The plugin adds one MCP server, `sharingu`, at `https://agent.sharingu.xyz/mcp`. It carries no key. The first time,
run `/mcp`, pick `sharingu` and sign in on the platform's page. Signed in with your account's passphrase, the connection
reaches every org your account has a seat in; with a seat's key, that seat alone.

## The four steps

1. **Join and connect.** The beta holds 50 orgs, first come, first served, through the waitlist
   (https://www.sharingu.xyz/waitlist). We approve each org and hand you a one-time sign-up code by hand; nothing is
   mailed. Sign up at `https://agent.sharingu.xyz/signup`, create your org and its first project in one form at
   `https://agent.sharingu.xyz/orgs/new`, then connect: this plugin, or Add to Claude and Add to ChatGPT (the docs).
2. **Your org, its project, its people.** On Control, Invite gives each person a one-time invite link: they choose
   their own passphrase. Someone whose email already has an account accepts the seat on their org list. Roles: Admin,
   Member, Partner (only the projects they are seated on). Hats: Management, Engineering, Go-to-market, Quality,
   Finance, Organization, Partner.
3. **Fill the product side.** Ask Claude to run the skill `fill-the-product-side` with the code, docs and tickets it
   can read: goals, the Map (screens with wireframes, the API map, the database schema, flows, the services the product
   connects to), decisions with their reasons, docs. Every item is previewed, then filed.
4. **Fill the GTM side.** With the apps you have connected to Claude (mail, DMs, meetings, CRM, revenue, search and
   AI-answer signals), the skill `fill-the-gtm-side` files GTM cards and contributions: summaries and links only,
   previewed, then filed.

Then every contribution is tracked: Home, Build, Goals (a request proposed, decided, built and graded; both sides move
the goal), Activity across every project, and the skill `weekly-review` for the week.

## The first calls, in order

1. `whoami`: your name, your orgs and projects, and where your writes land;
2. `missing` with `project`: what that project still needs, each item with the call that fills it;
3. `preview`: every write, shown before it lands (`formats` gives each kind's shape);
4. `file` with the `previewId` and the same items: it files them, and the app shows them at once.

The skill `fill-a-project` walks a new project through these calls to its first filed contribution.

## The skills

`skills/` holds one skill per starter item of the product, generated from the product's own starter pack: an edit here
is overwritten by the next release.

## License

sharingu is proprietary software, © Ryuk Labs (`LICENSE` at the repository root). The plugin installs free; the hosted
service is the product.
