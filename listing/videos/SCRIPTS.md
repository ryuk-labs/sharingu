# The five videos — shot by shot (sprint 12, 12.9; video 5, 2026-10-13)

Videos 1–4 are each 90 seconds or less, recorded on the live reviewer world (`https://agent.sharingu.xyz/sharingu-review`,
the accounts in `listing/SUBMISSION.md`; their codes in the operator's private file). Captions carry the words: no
voice is needed. Every value shown is the reviewer world's (the real sharingu project and the fictional Pilot Shop);
no key, no code, no address bar holding a token. Videos 1–2 are recorded by the session in a browser on the product;
3–4 by the session driving Claude Desktop (the owner approves the app's access at the start); OpenAI's demo video of
the test cases is video 5 (below), recorded in ChatGPT.

## 1 · Join and connect (≈ 75 s)
1. The site, www.sharingu.xyz: the hero, "50 orgs in the beta", "In the beta? Connect your AI". Caption: *The beta
   holds 50 orgs. Join the waitlist; we approve each and hand you a one-time code.*
2. `/signup`: an email, the code, a passphrase (the field masked). Caption: *Sign up with your code.*
3. `/orgs/new`: the org's name, its address, its first project. Caption: *Your org and its first project, in one form.*
4. Back on the site: Add to Claude → Claude's connector dialog prefilled with sharingu and its address. Caption: *Add
   to Claude, Add to ChatGPT, or Claude Code: you sign in on sharingu's page; no key to paste.*
5. Control · Connect: the same three ways in. End card: *Step 1 of 4.*

## 2 · The org, its project, its people (≈ 80 s)
1. Control as the admin: Projects (sharingu, the Sample project). Caption: *Your org's projects.*
2. Invite: a name, an email, role Member, hats Engineering → "Invite link, shown once" with its copy button (the link
   blurred). Caption: *Invite with a one-time link: they choose their own passphrase.*
3. The People list with the seven seats and their hats. Caption: *C-level, devs, BD, marketing, testers, a partner:
   each sees what their role allows, and their hats decide what comes first.*
4. Signed in as the partner: one project only. Caption: *A partner sees only the project it is invited to.* End card:
   *Step 2 of 4.*

## 3 · Fill the product side (≈ 90 s) — Claude Desktop
1. Claude Desktop with the sharingu connector, signed in as the dev. Prompt: *"Run the skill Fill the product side
   for the Sample project from its repo."*
2. The card (the MCP App): the preview, screens with wireframes, doors, tables, "files at once". Caption: *Every item
   is previewed; nothing lands until you say so.*
3. "File it." → the receipt. Then the app: Map · Screens (the wireframes), Map's doors and data, Map · Arch with the
   payments, email and CRM services. Caption: *The screens, the API map, the database schema and the apps it connects.*
4. Goals: the goal *Pilot Shop: a business buyer pays by invoice* with its cells. End card: *Step 3 of 4.*

## 4 · Fill the GTM side, and every contribution tracked (≈ 90 s) — Claude Desktop (ChatGPT: the owner)
1. Signed in as the BD seat. Prompt: *"Run Fill the GTM side for the Sample project from this week's outreach."*
2. The card: outreach and partnership cards, summaries with links only. Caption: *Summaries and links, never the
   messages themselves.*
3. The loop on the goal: BD's request → the owner's decision → the dev's change → the tester's grades → marketing's
   launch; the goal done, both sides landed. Caption: *A request, proposed, decided, built, graded and launched: every
   step is a contribution, and both sides move the goal.*
4. Activity · All projects: who filed what, where, its state. Then the weekly review's answer. Caption: *Every
   contribution, across every project.* End card: *sharingu — your tools, one company brain.*

## 5 · sharingu in ChatGPT: the reviewer's test cases (4:34, 1920×1080) — the OpenAI submission's demo

The eight walks of `listing/test-cases.md`, in ChatGPT's desktop app with the sharingu plugin, against the reviewer
org. P2, P3, P5, N2 and N3 are SPLIT takes (ChatGPT on the left, the live app signed in as Reviewer Admin on the right,
reloading after each filing); P1, P4 and N1 are single-window takes of the admin's chat. 1920×1080 so both halves
stay readable (at 1280×800 the split's text falls to ~8 px). On the paper canvas: the take at 8/9 scale, two half tags
("ChatGPT · the sharingu plugin", "sharingu · the app, live"), the case band at the foot (its label, then one line), a
"▸▸ N× faster" pill on each sped-up wait. Covered in every frame: the macOS menu bar and Dock (cropped), ChatGPT's
account avatar, the test browser's infobar, the app's light reload flashes (cut), a terminal window that crossed the
screen (cut), ChatGPT's browser-access prompt in N1 (cut). Takes: `engine/.runs/chatgpt-demo/` (`admin.mp4`,
`split-member.mp4`, `split-partner.mp4` and their `.marks`); compositor `engine/.runs/chatgpt-demo/work/compose6.mjs`, overlays `engine/.runs/chatgpt-demo/work/band.mjs` (machine-local).

| At | Case · account | The band |
|---|---|---|
| 0:00 | intro card | *sharingu in ChatGPT: the reviewer's test cases* |
| 0:05 | P1 · admin | Connect and sign in: whoami names the account, its role, its org and the projects it writes to. |
| 0:15 | P2 · member (split) | A new chat as the member: whoami names Reviewer Member, role member, both projects. · Read the real sharingu project's goal tree. On the right, the app shows the same tree, live. · Search the project for preview: goals, questions, checks and Map nodes. The app opens the Map. |
| 0:48 | design · Map · Arch (Play) | Arch: sharingu's own architecture. Every client, one MCP door, one D1 database. |
| 0:58 | P3 · member (split) | File a note, preview first … files at once, and has filed nothing. · file_contribution files the previewed note: the receipt with its T- id. · **live:** The app's Build reloads: 7 → 8, the member's note on top, landed now. · "File it." again: it is already filed. Nothing lands twice. · Read it back: by Reviewer Member, in the Sample project. |
| 1:38 | P4 · admin | Nothing is filed until you say yes: the preview shows the goal and files nothing. · Declined: nothing was filed. · Read the goal: there is no such goal. · Now accept: ChatGPT asks before save_knowledge runs. · Allowed: the goal is filed, and it reads back under its parent. · **live:** The app's Goals: A reviewer goal, under Every contribution closes the loop. |
| 2:46 | design · Map · Screens | Screens: every screen of the product as a wireframe, filed through the same door. |
| 2:56 | design · Decisions | What was ruled, and why: every decision, its round and its date. |
| 3:02 | P5 · partner (split) | Signed in as the partner: role partner, and ONE project, the Sample project. · The Sample project's goals, as the partner may read them. · Preview first: not ready yet, one field short, so nothing is filed. · Previewed again, then filed: the app's Build 8 → 9, the partner's note on top. |
| 3:45 | N1 · admin | Delete the Sample project? No sharingu tool deletes a project: nothing is deleted or changed. · **live:** Control still lists both projects. |
| 4:03 | N2 · partner (split) | The sharingu project is refused to the partner: no goal shown. Control seats it on Sample only. |
| 4:15 | N3 · member (split) | Create a project? An owner's tool: refused for a member. Control still shows two projects. |
| 4:29 | end card | *Every case, step by step* · www.sharingu.xyz/docs.html#walkthrough |

The design interludes are filmed headless on a LOCAL reviewer world (the sharingu import with the sample), signed in as
the member, the local address rewritten and the masks of videos 1–4 standing; the world was taken down after.
