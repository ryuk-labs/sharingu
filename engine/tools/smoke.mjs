// tools/smoke.mjs — THE per-slice proof: named cases run in order against a fresh local worker, each printing PASS or
// FAIL on one line, through the real door only. tools/smoke.sh starts the worker and runs this. One case file per slice
// under tools/smoke/, imported below in slice order (a later slice may read what an earlier one left in `s`). Exit code 1
// on any FAIL. It never prints a key.
//   SMOKE_URL=http://127.0.0.1:<port> SMOKE_CREDS=<the org's credentials.env> node tools/smoke.mjs
//   (no per-case flag: the cases build on one another in import order — s33 seeds the org s34-s37 walk, s40 the sign-ins
//   s41-s43 ride — so the suite runs whole, always)
import { CASES } from "./smoke/lib.mjs";
import "./smoke/s0-core.mjs";
import "./smoke/s1-goals.mjs";
import "./smoke/s2-decisions.mjs";
import "./smoke/s3-map.mjs";
import "./smoke/s4a-versions.mjs";
import "./smoke/s4b-holes.mjs";
import "./smoke/s5-authority.mjs";
import "./smoke/s5-integrity.mjs";
import "./smoke/s6-control.mjs";
import "./smoke/s7-broadcast.mjs";
import "./smoke/s8-screens.mjs";
import "./smoke/s9-review.mjs";
import "./smoke/s10-registry.mjs";
import "./smoke/s11-preview.mjs";
import "./smoke/s12-checklist.mjs";
import "./smoke/s13-happened.mjs";
import "./smoke/s14-impact.mjs";
import "./smoke/s15-honest-door.mjs";
import "./smoke/s16-extract.mjs";
import "./smoke/s17-true-door.mjs";
import "./smoke/s18-lists-broadcast.mjs";
import "./smoke/s19-true-screens.mjs";
import "./smoke/s20-look.mjs";
import "./smoke/s21-gate-parts.mjs";
import "./smoke/s22-last-look.mjs";
import "./smoke/s23-card-confirm.mjs";
import "./smoke/s24-d6a-screens.mjs";
import "./smoke/s25-names.mjs";
import "./smoke/s26-review.mjs";
import "./smoke/s27-lost.mjs";
import "./smoke/s28-video-faults.mjs";
import "./smoke/s29-regrade.mjs";
import "./smoke/s30-density.mjs";
import "./smoke/s31-wrapup-answers.mjs";
import "./smoke/s32-org-rollup.mjs";
import "./smoke/s33-orgtwo.mjs";   // a second org (sprint 6, 6.1), after every org-1 case
import "./smoke/s34-scoped.mjs";   // sprint 6, 6.2: org 2 reads none of org 1's rows (on the org s33 seeded)
import "./smoke/s35-ownorg.mjs";   // sprint 6, 6.3: an owner owns one org (the admin's reports, the backup, clean-eval, the names, the seams)
import "./smoke/s36-orgr2.mjs";    // sprint 6, 6.4: storage carries the org (every R2 key under its org's prefix; org 1's old keys; the ship's copy)
import "./smoke/s36b-xorg.mjs";   // sprint 6, 6.6: the cross-org attack suite (tools/attack-xorg.mjs) on the real worker, both directions (before s37: it deletes org 2)
import "./smoke/s37-orgundo.mjs";  // sprint 6, 6.5: one org's undo (export, restore beside it as a new org, delete) — LAST: it deletes org 2
import "./smoke/s38-accounts.mjs"; // sprint 7, 7.1: one account per email, a seat per org, the lockout per account (an org of its own, after s37)
import "./smoke/s39-signup.mjs";   // sprint 7, 7.2: sign-up by allowlist (the operator's tool, the code, the three cases, the one refusal; an org of its own)
import "./smoke/s40-neworg.mjs";   // sprint 7, 7.3: create an org through the door (an account by the operator's code; the refusals; add-person there; the attack both ways)
import "./smoke/s41-bypath.mjs";   // sprint 7, 7.4: the front door by path (each org at /<org>; the old addresses redirect; one session per account; membership never told)
import "./smoke/s42-picker.mjs";   // sprint 7, 7.4b: the org picker, the rail's org switcher, the front door's brand, the one not-here page
import "./smoke/s43-mcporgs.mjs";  // sprint 7, 7.5a: the door — one /mcp, an account grant acts in each of its orgs by orgSlug, a seat grant in its own
import "./smoke/s44-door.mjs";  // sprint 7, 7.5b: publish and equip ask their confirm; a grant with no stamp refused by the real worker
import "./smoke/s45-consent.mjs";  // sprint 7's review: a seat waits for its holder's yes (the picker's Accept and Decline); the sign-in never picks an org; one revocation rule
import "./smoke/s46-plans.mjs";    // sprint 8, 8.1: a fresh org's plan is free with the ruled numbers; its usage moves by what lands; every other org untouched
import "./smoke/s47-limits.mjs";   // sprint 8, 8.2: a tiny org warned at 80%, refused plan_limit at 100%, its reads answer; the burst 429s it alone; the operator's raise unblocks it
import "./smoke/s48-shown.mjs";    // sprint 8, 8.4: whoami answers the plan (free, the ruled numbers, its usage; a screen picture moves storage); Control's Plan card the admin's alone; the warning and the error tones
import "./smoke/s49-operator.mjs"; // sprint 8, 8.5: list-orgs with every plan; raise and set-plan move an org and its next write obeys; suspend turns every door of THAT org to one 403 while org 1 answers; unsuspend at once, nothing deleted
import "./smoke/s50-plugin.mjs";   // sprint 9, 9.1: the plugin — its skills are the presets' (the gate's --check), the ruled slug and MIT, ONE MCP server on the one address with no header, the repo's marketplace, no secret
import "./smoke/s51-listing.mjs";  // sprint 9, 9.3: the listing kit — the docs page is the contract's (the gate's --check); the reviewer org built on this worker, its three accounts sign in; the eight test cases walked
import "./smoke/s52-challenge.mjs";  // sprint 11, 11.3: OpenAI's domain verification — 404 with none stored, the operator's set answers exactly the token as text/plain, never under an org's address; clear 404s it again
import "./smoke/s53-invite.mjs";   // sprint 12, 12.3: an org's one-time invite link — minted by its admin, the invitee's own passphrase, signed in and seated; used, expired, an account that stands (nothing written); the invite-made account reaches its org alone; a member and another org mint nothing
import "./smoke/s54-client.mjs";   // sprint 13, 13.1: which AI filed it — a Claude Code session files claude-code, a stateless Codex call codex, a REST key api; changes {org, list} and Activity say so

let failed = 0;
for (const c of CASES) {
  try { const d = await c.fn(); console.log(`PASS  ${c.name}${d ? ` — ${d}` : ""}`); }
  catch (e) { failed++; console.log(`FAIL  ${c.name} — ${String((e && e.message) || e).slice(0, 600)}`); }
}
console.log(`${failed ? "✗" : "✓"} smoke: ${CASES.length - failed} of ${CASES.length} cases passed`);
process.exit(failed ? 1 : 0);
