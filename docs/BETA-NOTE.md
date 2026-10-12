# The beta note — what an invited team gets (owner, 2026-10-05)

You are being invited to sharingu's beta. One page, no surprises:

- **What you get.** An org on the hosted platform, `https://agent.sharingu.xyz`. Sign-up is by allowlist: we allow your
  email and hand you a one-time code by hand (nothing is mailed); you sign up, create your org at `/orgs/new` and
  connect your AI at `/mcp` (`docs/INSTALL.md` §1). Your org is walled from every other: work across orgs runs
  only on the deployment's credentials, from the operator's machine, never through an app seat. A seat someone adds
  for an email that already holds an account waits for that holder's own yes on the org picker. sharingu is proprietary software
  (© Ryuk Labs): the beta is HOSTED-ONLY — your org lives on our platform, and the engine's code is not distributed
  (the owner's ruling, 2026-10-09; it replaces the earlier MIT plan).
- **Access.** The hosted platform and the sharingu plugin for your AI tools (it installs free; the service is the
  product). The engine's repository stays private — there is no code access and no self-hosting.
- **The terms.** https://www.sharingu.xyz/terms.html. No SLA and no support promise during the beta; there is a
  direct line to us, and we answer it.
- **What we ask.** Tell us what broke, what confused you and what you removed, on the direct line.
- **Costs.** The hosted platform asks no payment during the beta (billing comes only after the beta succeeds,
  `docs/plan/PLATFORM.md`).
- **Leaving.** Ask us, on the direct line. We export your org first (`engine/tools/org-undo.mjs export`: every truth
  table of your org, people without their keys or emails, no sessions or previews, by design) and hand you the file;
  then the operator's per-org delete removes your org (`engine/tools/org-undo.mjs`, on the deployment's credentials;
  every other org untouched).
  Your sign-in (your account: your email and its passphrase) is the platform's, not your org's, so it stays after
  the org is gone until you ask: we then remove it (`engine/tools/operator.mjs remove-account`), with its sessions and
  its sign-up code. It is removed only once you hold no seat in any org; a seat you held in another org stays in that
  org's own record, with no account behind it.
