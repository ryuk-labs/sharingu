#!/usr/bin/env node
// tools/make-reviewer-org.mjs — the reviewer world the stores ask for (sprint 9, 9.3; docs/plan/MARKETPLACE.md M2: "a
// populated reviewer account", "reviewer credentials"), built on a NAMED worker the hosted way, as a person and the operator
// would: an org with the REAL sharingu project's data, one small sample project, and seven accounts whose sign-in codes are
// printed ONCE — every class of a real org (sprint 12, 12.8, the owner's "C-level to devs to BD to marketing to testers"):
// the admin (management), a member, a dev (engineering), a BD seat and a marketing seat (GTM), a tester (Quality, the seventh
// hat) and a partner. Proven on a local worker; the operator runs it against live at M4.
//
//   node tools/make-reviewer-org.mjs --url <worker>
//        (--local <persist dir> --config <wrangler config> | --live --config wrangler.jsonc --confirm-live <its D1 database name>)
//        [--slug sharingu-review] [--name "sharingu review"] [--domain review.sharingu.xyz] [--reissue] [--sample-only] [--source-env]
//
// THE WORLD, every step checked before it is taken (a step already standing is said and skipped):
//   1. the admin's account: the operator allows its email (tools/operator.mjs allowEmail, on the deployment's own database:
//      --local the worker's persisted D1, --live the Cloudflare API) and the tool signs it up (POST /signup) with a generated
//      passphrase — the account's SIGN-IN CODE (email + code sign in at /login and in a client's OAuth sign-in)
//   2. the org: POST /orgs as that account (one org per account), its home project `sharingu`
//   3. its plan: the operator's raise onto the NAMED row `reviewer` (tools/operator.mjs raisePlan: a new row starts from
//      team's numbers, the ruled paid plan; free's 1,500 items a month cannot hold the sharingu import). free and team are
//      never edited
//   4. the sample project: Control's add-project `sample` ("Sample project")
//   5. the data, through the MCP door (tools/import-brain.mjs, preview then file): `sample` from the demo overlays
//      (tools/import/overlays/demo/: "from the public sharingu website only"), `sharingu` from the ONE source list
//      (tools/lib-import-sources.sh: this repo's code, its wireframes and overlays — what dev-local and the ship import);
//      a missing input stops the run before it files (as tools/import-live.sh does). --sample-only files the sample alone
//      (the smoke's: the sharingu import writes ~17,018 rows, ~18,130 with the sample's 1,112 — the importer's own measure on a fresh
//      dev-local, 2026-10-10). The run prints the source, overlays and renders each import
//      uses. The list's inherited overrides (DEV_*, IMPORT_PROJECTS, IMPORT_BUDGET_*) are IGNORED, and named, unless
//      --source-env is passed: a shell left over from dev-local work never changes what a world handed to outsiders holds.
//      The record keys each import by its SOURCES' DIGEST (sprint 13, 13.3: importDigest — the source's identity, every
//      overlay's bytes, the renders file's bytes): an import recorded under the same digest is skipped ("imported (at …):
//      unchanged"); a changed digest imports again ("changed → importing again", naming the parts that changed) and records the
//      new one; an entry with no digest (a record from before 13.3) is treated as changed, once. A re-import of the sample after
//      the walkthrough first files its goal back as the overlay has it (the loop's "done" is content the overlay's goals batch
//      never filed: the door refuses that batch's clientRef for it) and step 7's last step marks it done again
//   6. the seats (SEATS): the member, the dev, the BD seat, the marketing seat and the tester on both projects, the partner on
//      the sample only, each with its ACCESS hats (Control's add-person, accessHat repeated: the admin's, so they unlock what the
//      hat reads; their own hats start the same), then each account is allowed and signed up as in 1; the admin's own hats
//      (POST /profile set-profile: management and finance, what Home leads with)
//   7. the walkthrough (WALK): ONE request's whole loop on the sample, each step filed through the door BY THE SEAT THAT DOES IT,
//      on the goal the demo overlays file for it (tools/import/overlays/demo/6-showcase.items.json: the Pilot Shop, an authored
//      example): the BD seat files the request as a proposal (it waits for the owner) -> the admin approves it -> the dev picks
//      it up -> the dev files the change done (lane code, with its proof) and closes the pick-up -> the tester grades its two
//      checks with proof -> marketing files the launch (lane GTM) -> the admin marks the goal done (its overlay item, status
//      "done": the loop completed it, so Goals never reads 100% beside "In progress"); then the goal reads each lane's cell
//      landed (ba, code, gtm) and its checks passed. Each filing carries a clientRef (a rerun files nothing twice); the ids go to
//      the record
//   8. the proof: each account signs in with its code (POST /login) and reads as its role may — the admin is the owner, the
//      member reads both projects, each hat's seat reads its access hats on whoami and its hat's brief on the sample with the
//      walkthrough's goal in it (the tester also the graded checks), every seat sees the loop on the goal's page, and the
//      partner reads the sample and is refused the sharingu project
// Then the seven codes are printed, once, with the org's address and its MCP address.
//
// SECRETS: the codes go to this terminal only. The run record (engine/.runs/reviewer-org/<database>-<slug>.json, written
// BEFORE each step and completed after it) holds the emails, the org, the plan before, the steps and their outcomes — never
// a code, a key or a token (an account's id, which opens nothing, is kept: it names the accounts this tool made). The
// admin's credential for the door is its own sign-in token (POST /login), held in memory, on every run: POST /orgs' one-time
// owner key is dropped unused.
// FRESH ACCOUNTS ONLY (the sprint-9 review, A1+B2): the world never touches an account that stands outside it. Before
// anything is written, and again right before each account's code, an account is refused when it holds a seat (active,
// waiting for its holder's yes, or removed) in any other org, or founded one, or holds a passphrase this tool did not make (no
// seat in this org and not in its record); --reissue never overrides that. The org itself must be a reviewer world: on the
// plan `reviewer`, or named by the record.
// IDEMPOTENT: a rerun of a COMPLETE world (every import's digest unchanged) reads it (the operator's read) and writes nothing;
// a changed source makes the world incomplete by that import (a gap that names it); an incomplete world whose own
// accounts already hold codes cannot be resumed without them (they are kept nowhere): --reissue gives each of them a NEW
// code (the operator-approved reset: tools/operator.mjs allow --reset, the account's sessions end) and finishes the world.
// The imports are idempotent by the importer's own clientRef (a batch already filed previews as unchanged), so a re-import
// files only what changed.
// REFUSALS before anything is written (exit 1; 2 on a usage error: --local and --live together or neither, no --url or
// --config, a config with no D1): --local with a URL that is not loopback, --live with one that is not https or is loopback;
// a --slug that is not an org address, a --domain that makes no plain email; --live without --confirm-live naming the
// config's D1 database; --live when tools/cf-budget.sh refuses; an org of that slug founded by another account than the
// admin's, or one that is no reviewer world; an account standing outside the world (above); an incomplete world whose own
// accounts hold codes, without --reissue; a sharingu input this machine lacks; --live when an import's own dry run refuses
// (the importer's --dry-run --estimate-from: no rows-written measure holds for it, stale or missing) — a first import and a
// re-import of a changed source alike.
// --live is WRITTEN, NOT YET RUN (the org-undo discipline): it needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the
// deployment's credentials file, sourced first (nothing here prints either), and the import estimates from this machine's
// local measures (.runs/import-cost-<project>.json, the importer's --estimate-from), each answered by that dry run BEFORE the
// first write; the importer's own budget verdict still runs inside each import.
// Exit: 0 the world stands · 1 refused or a step failed · 2 usage.
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { allowEmail, raisePlan, localD1, emailProblem } from "./operator.mjs";
import { readConfig, liveD1 } from "./org-undo.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
export const RECORD_DIR = join(ENGINE, ".runs", "reviewer-org");
export const PLAN = "reviewer";
export const SAMPLE = { slug: "sample", name: "Sample project", from: "demo" };
export const HOME = { slug: "sharingu", name: "sharingu" };
// the seats, one per class of a real org (12.8): the role class, the ACCESS hats the admin gives (the admin's own: its profile's),
// the projects ("both": sharingu and the sample; "sample": the sample alone) and the hat whose brief the proof reads
export const ROLES = ["admin", "member", "dev", "bd", "marketing", "tester", "partner"];
export const SEATS = {
  admin: { name: "Reviewer Admin", role: "owner", hats: ["management", "finance"], on: "both", brief: "management" },
  member: { name: "Reviewer Member", role: "member", hats: [], on: "both" },
  dev: { name: "Reviewer Dev", role: "member", hats: ["engineering"], on: "both", brief: "engineering" },
  bd: { name: "Reviewer BD", role: "member", hats: ["gtm", "organization"], on: "both", brief: "gtm" },
  marketing: { name: "Reviewer Marketing", role: "member", hats: ["gtm"], on: "both", brief: "gtm" },
  tester: { name: "Reviewer Tester", role: "member", hats: ["quality"], on: "both", brief: "quality" },
  partner: { name: "Reviewer Partner", role: "partner", hats: ["partner"], on: "sample" },
};
const NAMES = Object.fromEntries(ROLES.map((r) => [r, SEATS[r].name]));
// the walkthrough (step 7): the goal and the checks the demo overlays file, and each seat's filing (a clientRef each)
export const WALK_GOAL = "pay-by-invoice";
export const SHOWCASE_OVERLAY = join(ENGINE, "tools", "import", "overlays", "demo", "6-showcase.items.json");
// walkGoalDone(goal) -> the last step's item: the walkthrough's goal as the overlay files it, its status "done" (an upsert
// replaces the goal's data whole, so every other field is the overlay's own)
export const walkGoalDone = (goal) => ({ kind: "goal", op: "upsert", data: { ...goal, status: "done" } });
export function showcaseGoal(path = SHOWCASE_OVERLAY) {
  const it = (JSON.parse(readFileSync(path, "utf8")).items || []).find((o) => o.kind === "goal" && o.data && o.data.id === WALK_GOAL);
  if (!it) throw new Error(`${path} files no goal ${WALK_GOAL}`);
  return it.data;
}
// accessRepairs(world) -> [{ r, personId, hats }]: each standing seat (never the admin's: its hats are its own profile's) whose
// ACCESS hats are not SEATS' — the seat step sets them again (Control's set-access-hats, the WHOLE list) instead of the gaps
// check refusing the finished world
export function accessRepairs(w) {
  return ROLES.filter((r) => r !== "admin").map((r) => [r, w.seats && w.seats[r]])
    .filter(([r, s]) => s && Number(s.active) === 1 && hatsKey(s.access_hats) !== [...SEATS[r].hats].sort().join(","))
    .map(([r, s]) => ({ r, personId: s.id, hats: [...SEATS[r].hats] }));
}
export function accessForm({ personId, hats }) {
  const form = new URLSearchParams({ action: "set-access-hats", personId });
  for (const h of hats) form.append("accessHat", h);
  return form;
}
export const WALK_CHECKS = ["AC.invoice.01", "AC.invoice.02"];
export function walkFilings(emails) {
  const on = { goalRef: WALK_GOAL };
  return {
    proposal: { lane: "ba", kind: "proposal", what: "Business buyers pay by invoice at checkout", ...on,
      why: "Pilot buyers asked on three calls to pay on invoice with a PO number; a card-only checkout loses them.",
      touches: ["screen:sf-checkout", "door:POST:/api/invoices", "table:invoices"], depends: ["screen:sf-checkout", "q/Q-demo-invoice-terms"],
      open: ["the payment terms wait on the owner (Q-demo-invoice-terms)"], next: { what: "Build Pay by invoice at checkout", who: emails.dev }, clientRef: "walkthrough-1-proposal" },
    decision: { verdict: "approve", note: "Yes: business buyers first, card stays the default. The terms follow on Q-demo-invoice-terms." },
    code: (parent) => ({ lane: "code", kind: "pr", what: "Checkout offers Pay by invoice for business buyers", ...on, parent,
      why: "The approved request: a business buyer places the order on invoice with a PO number, and the invoice is emailed.",
      touches: ["screen:sf-checkout", "door:POST:/api/invoices", "table:invoices"], screens: "screen:sf-checkout",
      components: ["door:POST:/api/invoices", "table:invoices", "service:email"], proof: "npm test -> exit 0, 48 passing (checkout and invoices)", clientRef: "walkthrough-3-code" }),
    grades: WALK_CHECKS.map((checkId, i) => ({ checkId, verdict: "proven", clientRef: `walkthrough-4-grade-${i + 1}`,
      proof: i === 0 ? "npx playwright test invoice-checkout.spec -> exit 0, 3 passing" : "npx playwright test invoice-email.spec -> exit 0, 2 passing" })),
    gtm: (parent) => ({ lane: "gtm", kind: "campaign", what: "Pay by invoice, announced to the pilot's business buyers", ...on, parent,
      why: "The change is live: the buyers who asked can order on invoice now.", touches: ["screen:sf-checkout"],
      expected: "10 business buyers order on invoice in the first month", proof: "https://example.com/pilot-shop/pay-by-invoice",
      audience: "the Pilot Shop's business buyers", claim: "Order now and pay on invoice with your PO number", channel: "email",
      experiment: "does invoice checkout bring the business buyers back? it works at 10 invoice orders in a month", clientRef: "walkthrough-5-gtm" }),
  };
}
// the default --domain: a domain we own (sharingu.xyz's own subdomain), so no one else can hold an address under it; no mail
// is ever sent to it (an account signs in with its code)
export const DOMAIN = "review.sharingu.xyz";
export const USAGE = "usage: node tools/make-reviewer-org.mjs --url <worker> (--local <persist dir> --config <wrangler config> | --live --config <wrangler config> --confirm-live <D1 database name>) " +
  `[--slug sharingu-review] [--name "sharingu review"] [--domain ${DOMAIN}] [--reissue] [--sample-only] [--source-env]`;
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

// a sign-in code: 20 letters and digits in four groups (24 characters with the dashes; an account needs 12)
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newSignInCode() {
  const b = randomBytes(20);
  let s = "";
  for (let i = 0; i < 20; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s.match(/.{5}/g).join("-");
}
export const emailsOf = (domain) => Object.fromEntries(ROLES.map((r) => [r, `${r}@${domain}`]));

// ---- the operator's reads (the deployment's own: never an app seat) ----
const ACCOUNT_SQL = "SELECT id, pass_hash IS NOT NULL AS has_pass FROM accounts WHERE email = ?1";
const TX_SQL = "SELECT route, decision FROM transmission WHERE id = ?1 AND org = ?2";
const ORG_SQL = "SELECT id, name, slug, plan, created_by_account FROM org WHERE slug = ?1";
const SEATS_SQL = "SELECT id, email, role, active, pending, hats, access_hats FROM people WHERE org = ?1";
const PROJECTS_SQL = "SELECT key, active FROM projects WHERE org = ?1";
const PROJECT_SEATS_SQL = "SELECT s.person_id, s.project_key FROM project_seats s JOIN people p ON p.id = s.person_id WHERE p.org = ?1";
const ROLE_OF = Object.fromEntries(ROLES.map((r) => [r, SEATS[r].role]));
// a stored hats list (people.hats, people.access_hats) as a comparable string
const hatsKey = (v) => { let a = v; if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = []; } } return (Array.isArray(a) ? a : []).map(String).sort().join(","); };
export const projectKey = (org, slug) => (Number(org) === 1 ? slug : `o${org}--${slug}`);
// whose account (A1+B2): ?1 the email, ?2 the reviewer org's id (NULL before it stands — then every seat is outside it). A seat in
// any state counts (active, waiting, removed): a sign-up takes what its account holds, and a removed seat can be given back
const STANDING_SQL = "SELECT a.id, a.pass_hash IS NOT NULL AS has_pass, " +
  "(SELECT COUNT(*) FROM people p WHERE p.account_id = a.id AND (?2 IS NULL OR p.org IS NOT ?2)) AS outside, " +
  "(SELECT COUNT(DISTINCT p.org) FROM people p WHERE p.account_id = a.id AND (?2 IS NULL OR p.org IS NOT ?2)) AS orgs, " +
  "(SELECT COUNT(*) FROM people p WHERE p.account_id = a.id AND ?2 IS NOT NULL AND p.org = ?2) AS inside, " +
  "(SELECT COUNT(*) FROM org o WHERE o.created_by_account = a.id AND (?2 IS NULL OR o.id <> ?2)) AS founded " +
  "FROM accounts a WHERE a.email = ?1";
// standingOf(DB, email, { org, made, slug }) -> { state: "fresh" | "held" | "foreign", id, why }. fresh: no account, or one with no
// passphrase whose every seat lies in this org; held: the tool's own account with a passphrase (every seat in this org, at
// least one, or its id in `made`, the record's); foreign: anything else — refused, --reissue or not
export async function standingOf(DB, email, { org = null, made = [], slug = "" } = {}) {
  const a = await DB.prepare(STANDING_SQL).bind(email, org == null ? null : Number(org)).first();
  if (!a) return { state: "fresh", id: null };
  const n = (k) => Number(a[k]) || 0, hasPass = n("has_pass") === 1;
  if (n("outside") || n("founded")) {
    const what = [n("outside") ? `${n("outside")} seat${n("outside") === 1 ? "" : "s"} (active, waiting or removed) in ${n("orgs")} other org${n("orgs") === 1 ? "" : "s"}` : "",
      n("founded") ? `${n("founded")} org${n("founded") === 1 ? "" : "s"} it founded` : ""].filter(Boolean).join(" and ");
    return { state: "foreign", id: a.id, why: `${email}'s account already stands outside this reviewer world (${what})` };
  }
  if (hasPass && !n("inside") && !made.includes(a.id)) return { state: "foreign", id: a.id, why: `${email} holds a passphrase this tool did not make (no seat in /${slug}, not in its record)` };
  return { state: hasPass ? "held" : "fresh", id: a.id };
}

// readWorld(DB, { slug, emails }) -> what stands now: the accounts, the org, its seats, projects and project seats
export async function readWorld(DB, { slug, emails }) {
  const accounts = {};
  for (const r of ROLES) {
    const a = await DB.prepare(ACCOUNT_SQL).bind(emails[r]).first();
    accounts[r] = a ? { id: a.id, hasPass: Number(a.has_pass) === 1 } : null;
  }
  const org = await DB.prepare(ORG_SQL).bind(slug).first();
  if (!org) return { accounts, org: null, seats: {}, projects: [], seated: {} };
  const people = (await DB.prepare(SEATS_SQL).bind(org.id).all()).results || [];
  const seats = {};
  for (const r of ROLES) seats[r] = people.find((p) => String(p.email).toLowerCase() === emails[r]) || null;
  const projects = ((await DB.prepare(PROJECTS_SQL).bind(org.id).all()).results || []).filter((p) => Number(p.active) === 1).map((p) => p.key);
  const ps = (await DB.prepare(PROJECT_SEATS_SQL).bind(org.id).all()).results || [];
  const seated = {};
  for (const r of ROLES) seated[r] = seats[r] ? ps.filter((x) => x.person_id === seats[r].id).map((x) => x.project_key).sort() : [];
  return { accounts, org, seats, projects, seated };
}
// gaps(world, record, { sampleOnly, digests }) -> what the world still lacks ([] when it is complete). digests (13.3: each
// import's importDigest, by label): an import recorded under another digest, or none, is a gap until it is imported again
export function gaps(w, rec, { sampleOnly = false, digests = null } = {}) {
  const out = [];
  for (const r of ROLES) if (!(w.accounts[r] && w.accounts[r].hasPass)) out.push(`the ${r}'s account`);
  if (!w.org) return [...out, "the org"];
  if (w.org.plan !== PLAN) out.push(`the plan (${w.org.plan}, not ${PLAN})`);
  const home = projectKey(w.org.id, HOME.slug), sample = projectKey(w.org.id, SAMPLE.slug);
  for (const k of [home, sample]) if (!w.projects.includes(k)) out.push(`the project ${k}`);
  for (const r of ROLES) {
    const s = w.seats[r];
    if (!s || Number(s.active) !== 1 || s.role !== ROLE_OF[r]) { out.push(`the ${r}'s seat (${s ? `${s.role}, active ${s.active}` : "none"})`); continue; }
    // the admin's hats are its own (its profile); every other seat's are its ACCESS hats (the admin's)
    const has = hatsKey(r === "admin" ? s.hats : s.access_hats), want = [...SEATS[r].hats].sort().join(",");
    if (has !== want) out.push(`the ${r}'s hats (${has || "none"}, not ${want || "none"})`);
  }
  for (const r of ROLES.filter((x) => x !== "admin")) {
    const want = (SEATS[r].on === "both" ? [home, sample] : [sample]).sort().join();
    if (w.seated[r].join() !== want) out.push(`the ${r}'s projects (${w.seated[r].join() || "none"})`);
  }
  const mine = rec && Number(rec.org) === Number(w.org.id);
  const imp = (mine && rec.imports) || {};
  const plan = importPlan(imp, digests);
  const stale = (label) => plan[label] && plan[label].state !== "unchanged" && plan[label].state !== "new" ? ` (${plan[label].why})` : "";
  if (!imp.sample || stale("sample")) out.push(`the sample's import${stale("sample")}`);
  if (!sampleOnly && (!imp.sharingu || stale("sharingu"))) out.push(`the sharingu import${stale("sharingu")}`);
  if (!(mine && rec.walkthrough && rec.walkthrough.complete)) out.push("the walkthrough");
  else if (!rec.walkthrough.goalDone) out.push(`the walkthrough's last step (goal/${WALK_GOAL} done)`);
  return out;
}

// ---- the record (BEFORE each step; never a secret) ----
export function recordPath(dir, database, slug) { return join(dir, `${String(database).replace(/[^a-zA-Z0-9-]+/g, "_")}-${slug}.json`); }
// fresh: the record on disk is another world's (a database of the same name made again, its org gone or another): it is kept
// beside as <record>.prior.json and this run starts its own
function openWorldRecord(path, fields, { fresh = false } = {}) {
  let rec = {};
  try { rec = JSON.parse(readFileSync(path, "utf8")); } catch { rec = {}; }
  if (fresh && rec.format) { writeFileSync(path.replace(/\.json$/, ".prior.json"), JSON.stringify(rec, null, 1) + "\n"); rec = {}; }
  rec = { format: "reviewer-org/1", ...rec, ...fields, runs: [...(rec.runs || []), { at: new Date().toISOString(), reissue: !!fields.reissue }] };
  delete rec.reissue;
  mkdirSync(dirname(path), { recursive: true });
  const save = () => writeFileSync(path, JSON.stringify(rec, null, 1) + "\n");
  save();
  return {
    rec: () => rec,
    step: (name, more = {}) => { rec.steps = { ...(rec.steps || {}), [name]: { at: new Date().toISOString(), ...more } }; rec.state = "writing"; save(); },
    set: (more) => { rec = { ...rec, ...more }; save(); },
    done: (state, more = {}) => { rec = { ...rec, ...more, state }; rec.runs[rec.runs.length - 1].outcome = state; save(); return rec; },
  };
}

// ---- the door ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function door(base) {
  const B = String(base).replace(/\/+$/, "");
  const call = async (method, path, { key, body, form } = {}) => {
    const headers = { accept: "application/json" };
    if (key) headers.authorization = "Bearer " + key;
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    for (let i = 0; ; i++) {
      let r;
      try { r = await fetch(B + path, { method, headers, body: payload, redirect: "manual" }); }
      catch (e) { if (i < 3) { await sleep(500 * (i + 1)); continue; } throw e; }
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { json = null; }
      // the address's flood filter (POST /login, /signup and /orgs share one budget): wait out its window once
      if (r.status === 429 && json && json.error === "too_many_attempts_ip" && i === 0) { await sleep((Number(r.headers.get("retry-after")) || 61) * 1000 + 500); continue; }
      return { status: r.status, json, text };
    }
  };
  let id = 0;
  const tool = async (key, name, args = {}) => {
    const r = await call("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } } });
    const res = r.json && r.json.result;
    let out = null; try { out = JSON.parse(res.content[0].text); } catch { out = res ? res.content : r.json; }
    return { status: r.status, out, isError: !res || !!res.isError };
  };
  return { call, tool, base: B };
}
// no key, code or token ever leaves in a message
const bare = (j) => JSON.stringify(j && typeof j === "object" ? { ...j, key: j.key ? "<key>" : undefined, token: j.token ? "<token>" : undefined } : j).slice(0, 300);

// ---- the imports (the ONE source list: tools/lib-import-sources.sh) ----
// the list's own overrides (A4): what a dev-local shell may leave set, ignored unless --source-env
const OVERRIDE_ENV = /^(DEV_[A-Z0-9_]+|IMPORT_PROJECTS|IMPORT_BUDGET_[A-Z_]+)$/;
// sourcesOf(project, { sourceEnv }) -> { source, name, renders, overlays, missing, env, ignored }: env is the environment the list
// and the importer run in (the inherited overrides kept out of it unless sourceEnv), ignored the names kept out
export function sourcesOf(project, { sourceEnv = false } = {}) {
  const ignored = sourceEnv ? [] : Object.keys(process.env).filter((k) => OVERRIDE_ENV.test(k)).sort();
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !ignored.includes(k)));
  const script = `ROOT="$1"; . "$ROOT/tools/lib-import-sources.sh"; p="$2"; printf '%s\\n' "$(source_arg "$p")" "$(name_of "$p")" "$(renders_of "$p")"; overlays_of "$p" 2>/dev/null; echo; missing_inputs "$p" | tr '\\n' '|'`;
  const out = execFileSync("sh", ["-c", script, "sh", ENGINE, project], { encoding: "utf8", env }).split("\n");
  return { source: out[0], name: out[1], renders: out[2], overlays: out[3], missing: (out[5] || "").split("|").filter(Boolean), env, ignored };
}
// what an import files from, in one line (said before it files: A4)
const rel = (p) => String(p).replace(dirname(ENGINE) + "/", "");
export const sourceLine = (s) => `source ${s.source === "-" ? "none (its overlays alone)" : rel(s.source)}; overlays ${s.overlays ? s.overlays.split(",").map(rel).join(", ") : "none"}; renders ${s.renders ? rel(s.renders) : "none"}` +
  (s.ignored.length ? ` (ignored the inherited ${s.ignored.join(", ")}: --source-env honours them)` : "");
// ---- an import's digest (sprint 13, 13.3): what its sources ARE, so a changed source imports again ----
// The sprint-12 ship's scar: the record said "sample imported" and sprint 12's new showcase overlay never imported (its entry
// was dropped by hand). importDigest(sources) -> { digest, parts }: parts, in filing order, are the source's identity, every
// overlay's bytes and the renders file's bytes; the digest is the sha256 of them. The source's identity: for a checkout of this
// repo (the `code` layout, sharingu) the sha256 of the files tools/import/read-code.mjs reads — contracts/door.json,
// engine/boot.sql, engine/src/**/*.js less its four generated files, its code-model/model.json — content, not the commit, so
// an uncommitted edit counts and a docs-only commit does not; any other directory: its git HEAD plus a hash of its
// `git status --porcelain` when it is not clean, else (no git) every file's bytes; no source ("-"): none
const sha = (b) => createHash("sha256").update(b).digest("hex");
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const CODE_GENERATED = /\/(doorcontract|fontdata|presetdata|archclientdata)\.js$/;
const filesUnder = (dir, keep) => {
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f), st = statSync(p);
    if (st.isDirectory()) { if (f !== ".git" && f !== "node_modules") out.push(...filesUnder(p, keep)); } else if (st.isFile() && keep(p)) out.push(p);
  }
  return out;
};
const filesHash = (root, files) => { const h = createHash("sha256"); for (const f of files) h.update(`${relative(root, f)}\0${isFile(f) ? sha(readFileSync(f)) : "missing"}\n`); return h.digest("hex"); };
export function sourceIdentity(dir) {
  if (!dir || dir === "-") return null;
  try {
    if (["engine/src/index.js", "contracts/door.json", "engine/boot.sql"].every((f) => isFile(join(dir, f)))) {
      const files = [join(dir, "contracts", "door.json"), join(dir, "engine", "boot.sql"), join(ENGINE, "tools", "import", "code-model", "model.json"),
        ...filesUnder(join(dir, "engine", "src"), (p) => p.endsWith(".js") && !CODE_GENERATED.test(p))];
      return `code:${files.length} files:${filesHash(dir, files)}`;
    }
    try {
      const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const st = execFileSync("git", ["-C", dir, "status", "--porcelain=v1", "-uall"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return `git:${head}${st.trim() ? `+dirty:${sha(st).slice(0, 16)}` : ""}`;
    } catch { return `files:${filesHash(dir, filesUnder(dir, () => true))}`; }
  } catch { return "missing"; }
}
export function importDigest(s) {
  const parts = {};
  const src = sourceIdentity(s.source);
  if (src) parts.source = src;
  // an overlay by its file name (where it lies files nothing; two of one name keep their paths), in filing order
  for (const o of String(s.overlays || "").split(",").filter(Boolean)) {
    const k = `overlay ${basename(o)}` in parts ? `overlay ${rel(o)}` : `overlay ${basename(o)}`;
    parts[k] = isFile(o) ? sha(readFileSync(o)) : "missing";
  }
  if (s.renders) parts[`renders ${basename(s.renders)}`] = isFile(s.renders) ? sha(readFileSync(s.renders)) : "missing";
  return { digest: `sha256:${sha(JSON.stringify(Object.entries(parts)))}`, parts };
}
// importPlan(recorded, digests) -> { <label>: { state, why } } for each label of digests: "new" (no record), "unchanged" (its
// recorded digest matches: skipped), "changed" (why names the parts that differ) or "undigested" (a record from before 13.3,
// with no digest: imported again ONCE, then recorded with its digest)
export function importPlan(recorded, digests) {
  const out = {};
  for (const [label, d] of Object.entries(digests || {})) {
    const r = (recorded || {})[label];
    if (!r) out[label] = { state: "new", why: "not imported yet" };
    else if (!r.digest) out[label] = { state: "undigested", why: "its record holds no digest of its sources (made before sprint 13): imported again once" };
    else if (r.digest === d.digest) out[label] = { state: "unchanged", why: `its sources unchanged (${d.digest.slice(0, 19)})` };
    else {
      const was = r.parts || {}, keys = [...new Set([...Object.keys(was), ...Object.keys(d.parts)])];
      const diff = keys.filter((k) => was[k] !== d.parts[k]).map((k) => (!(k in was) ? `${k} new` : !(k in d.parts) ? `${k} gone` : k));
      out[label] = { state: "changed", why: `its sources changed: ${diff.length ? diff.join("; ") : "the digest"}` };
    }
  }
  return out;
}
const importArgs = (s, { project, from, name, url, costFrom }) => {
  const args = [join(ENGINE, "tools", "import-brain.mjs"), s.source, "--project", project, ...(url ? ["--url", url] : ["--dry-run"])];
  if (s.renders) args.push("--renders", s.renders);
  if (s.overlays) args.push("--overlay", s.overlays);
  if (s.source === "-") args.push("--name", name || s.name);   // the importer names only a project it creates (no source)
  if (costFrom) args.push("--estimate-from", join(costFrom, `import-cost-${from}.json`));
  return args;
};
const runImporter = (args, env) => new Promise((done) => execFile("node", args, { cwd: ENGINE, encoding: "utf8", maxBuffer: 1 << 28, env },
  (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: `${stdout || ""}${stderr || ""}` })));
// preflightImport(...) -> { rc, line | why }: the importer's OWN dry run with the estimate the live import will use (B3): a
// stale or missing measure refuses here, before the run writes anything
export async function preflightImport({ project, from, name, costFrom, sourceEnv, sources = sourcesOf }) {
  const s = sources(from, { sourceEnv });
  if (s.missing.length) return { rc: 1, why: `${from}: this machine lacks ${s.missing.join("; ")}` };
  const r = await runImporter(importArgs(s, { project, from, name, costFrom }), s.env);
  const est = (/this run will write about [0-9,]+ rows/.exec(r.out) || [])[0];
  if (r.rc !== 0 || !est) {
    const line = (re) => (re.exec(r.out) || [])[0];
    return { rc: r.rc || 1, why: (line(/^ *REFUSED.*$/m) || line(/^import-brain:.*$/m) || line(/^ *✗.*$/m) || r.out.trim().split("\n").pop() || "no answer").trim().slice(0, 400) };
  }
  return { rc: 0, line: `${est}; ${sourceLine(s)}` };
}
function importOne({ base, key, project, from, name, costFrom, costDir, log, sourceEnv, sources = sourcesOf }) {
  const s = sources(from, { sourceEnv });
  if (s.missing.length) return Promise.resolve({ rc: 1, why: `${from}: this machine lacks ${s.missing.join("; ")}`, s });
  return runImporter(importArgs(s, { project, from, name, url: base, costFrom }), { ...s.env, SHARINGU_IMPORT_KEY: key, IMPORT_COST_DIR: costDir }).then((r) => {
    writeFileSync(log, r.out);
    return { rc: r.rc, why: r.rc ? `the importer exited ${r.rc} (its log: ${log})` : "", s };
  });
}

// ---- the run ----
// run(argv, { say, err, open, recordDir, budget, costFrom, sources }) -> exit code. say prints to this terminal (the codes go there
// and nowhere else); open, budget, costFrom (the directory of the import measures) and sources (sourcesOf's stand-in: what
// each import files from) are the selftest's seams
export async function run(argv, { say = (s) => console.log(s), err = (s) => console.error(s), open, recordDir = RECORD_DIR, budget, costFrom = join(ENGINE, ".runs"), sources = sourcesOf } = {}) {
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length && !String(argv[i + 1]).startsWith("--") ? argv[i + 1] : undefined; };
  const url = String(flag("--url") || "").replace(/\/+$/, ""), local = flag("--local"), live = argv.includes("--live"), cfgPath = flag("--config");
  const slug = flag("--slug") || "sharingu-review", name = flag("--name") || "sharingu review", domain = String(flag("--domain") || DOMAIN).toLowerCase();
  const reissue = argv.includes("--reissue"), sampleOnly = argv.includes("--sample-only"), sourceEnv = argv.includes("--source-env");
  if (!url || !cfgPath || !local === !live) { err(USAGE); return 2; }
  if (local && !LOOPBACK.test(url)) { err(`refused (nothing written): --local needs a loopback --url (http://127.0.0.1:<port>), not ${url}`); return 1; }
  if (live && (LOOPBACK.test(url) || !/^https:\/\//.test(url))) { err(`refused (nothing written): --live needs the deployment's https address, not ${url}`); return 1; }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 40) { err(`refused (nothing written): --slug ${JSON.stringify(slug)} is not an org address (a-z, 0-9 and single dashes, 2 to 40)`); return 1; }
  const emails = emailsOf(domain);
  for (const r of ROLES) { const bad = emailProblem(emails[r]); if (bad) { err(`refused (nothing written): --domain ${domain}: ${emails[r]} is ${bad}`); return 1; } }
  let cfg;
  try { cfg = readConfig(cfgPath); } catch (e) { err(`${cfgPath}: ${String((e && e.message) || e)}`); return 2; }
  if (!cfg.d1_databases || !cfg.d1_databases[0]) { err(`${cfgPath}: no D1 database`); return 2; }
  if (live && flag("--confirm-live") !== cfg.d1_databases[0].database_name) {
    err(`--live refused: --confirm-live must name the D1 database of ${cfgPath} (${cfg.d1_databases[0].database_name}) — the live shared database, every org's`);
    return 1;
  }
  if (live) {
    const b = budget ? await budget() : await new Promise((done) => execFile("sh", [join(ENGINE, "tools", "cf-budget.sh")], { cwd: ENGINE, encoding: "utf8" }, (e, o, x) => done({ rc: e ? e.code || 1 : 0, out: `${o}${x}` })));
    if (b.rc !== 0) { err(`--live refused: tools/cf-budget.sh refused (exit ${b.rc}):\n${String(b.out || "").trim().slice(-600)}`); return 1; }
  }
  const be = await (open || ((c) => (live ? { DB: liveD1(c.d1_databases[0].database_id), database: `live:${c.d1_databases[0].database_name}`, close: async () => {} } : localD1(local, c))))(cfg);
  const d = door(url);
  const runDir = join(recordDir, `${String(be.database).replace(/[^a-zA-Z0-9-]+/g, "_")}-${slug}`);
  const recPath = recordPath(recordDir, be.database, slug);
  let prior = null; try { prior = JSON.parse(readFileSync(recPath, "utf8")); } catch { prior = null; }
  try {
    let w = await readWorld(be.DB, { slug, emails });
    if (w.org && (!w.accounts.admin || String(w.org.created_by_account) !== String(w.accounts.admin.id))) {
      err(`refused (nothing written): the org /${slug} on ${be.database} was founded by another account than ${emails.admin} — choose another --slug`);
      return 1;
    }
    // the org is a reviewer world: on the plan `reviewer`, or the one this tool's record names (a crash before the raise)
    const recOrg = prior ? Number(prior.org || (prior.steps && prior.steps.org && prior.steps.org.org) || 0) : 0;
    if (w.org && w.org.plan !== PLAN && recOrg !== Number(w.org.id)) {
      err(`refused (nothing written): the org /${slug} on ${be.database} stands on the plan ${w.org.plan} and this tool's record does not name it — it is not a reviewer world this tool made; choose another --slug`);
      return 1;
    }
    // FRESH ACCOUNTS ONLY (A1+B2): an account standing outside this world is refused, --reissue or not (one org per account
    // included: an admin that founded another org stands outside)
    const made = Object.values((prior && prior.accounts) || {});
    const standing = {};
    for (const r of ROLES) standing[r] = await standingOf(be.DB, emails[r], { org: w.org ? w.org.id : null, made, slug });
    const foreign = ROLES.filter((r) => standing[r].state === "foreign");
    if (foreign.length) {
      err(`refused (nothing written): the reviewer world makes fresh accounts and touches no other — ${foreign.map((r) => standing[r].why).join("; ")}. ` +
        `Name accounts no one holds with --domain (the default ${DOMAIN} is a domain we own: no one else can hold an address under it).`);
      return 1;
    }
    // each import's sources and their digest (13.3), read once: the record's entry is reused only while the digest holds
    const todo = [["sample", SAMPLE.slug, SAMPLE.from, SAMPLE.name], ...(sampleOnly ? [] : [["sharingu", HOME.slug, HOME.slug, HOME.name]])];
    const srcs = Object.fromEntries(todo.map(([label, , from]) => [label, sources(from, { sourceEnv })]));
    const digests = Object.fromEntries(todo.map(([label]) => [label, importDigest(srcs[label])]));
    const missing0 = gaps(w, prior, { sampleOnly, digests });
    if (!missing0.length && !reissue) {
      say(`✓ the reviewer world stands on ${be.database}: org ${w.org.id} /${slug} on plan ${PLAN}, projects ${w.projects.join(", ")}, ${ROLES.map((r) => `${r} ${emails[r]}`).join(", ")} — nothing written`);
      const plan0 = importPlan(prior.imports, digests);
      for (const [label] of todo) say(`  · ${label} imported (${prior.imports[label].at}): unchanged, ${plan0[label].why}`);
      say("  Its sign-in codes were printed once, by the run that made them, and are kept nowhere. --reissue gives each account a new one.");
      return 0;
    }
    // every account held here is the tool's own (the guard above): --reissue resumes it
    const held = ROLES.filter((r) => standing[r].state === "held");
    if (held.length && !reissue) {
      err(`refused (nothing written): the world on ${be.database} lacks ${missing0.join(", ")}, and its own accounts ${held.map((r) => emails[r]).join(", ")} already hold sign-in codes the tool does not keep. ` +
        "Run again with --reissue: each of them gets a NEW code (the operator-approved reset: its sessions end) and the world is finished.");
      return 1;
    }
    // sharingu's inputs, before anything is written
    if (!sampleOnly && srcs.sharingu.missing.length) { err(`refused (nothing written): the sharingu import lacks ${srcs.sharingu.missing.join("; ")}`); return 1; }
    const filed = (prior && w.org && Number(prior.org) === Number(w.org.id) && prior.imports) || {};
    // --live (B3): each import still to file — a first import, or one whose sources changed (13.3) — answers the importer's own
    // dry run, with the estimate it will use, BEFORE any write
    if (live) {
      const plan0 = importPlan(filed, digests);
      for (const [label, project, from, pname] of todo) {
        if (plan0[label].state === "unchanged") continue;
        const p = await preflightImport({ project, from, name: pname, costFrom, sourceEnv, sources });
        if (p.rc !== 0) { err(`refused (nothing written): the ${label} import's own dry run refused (exit ${p.rc}): ${p.why}`); return 1; }
        say(`· the ${label} import's dry run: ${p.line}`);
      }
    }
    const R = openWorldRecord(recPath, { database: be.database, url, slug, name, emails, sampleOnly, reissue }, { fresh: !!prior && (!w.org || Number(prior.org) !== Number(w.org.id)) });
    mkdirSync(runDir, { recursive: true });
    say(`· the reviewer world on ${be.database} (${url}), org /${slug}: ${missing0.length ? `it lacks ${missing0.join(", ")}` : "it stands"}${reissue ? " (--reissue: every account gets a new code)" : ""} — the record: ${recPath}`);
    const codes = {};
    // an account's code: its standing checked again right before (A1+B2: nothing outside the world may have appeared since), allowed
    // by the operator (a reset only for the tool's own account under --reissue), then signed up as its person would; its id kept
    const account = async (r) => {
      const st = await standingOf(be.DB, emails[r], { org: w.org ? w.org.id : null, made: [...made, ...Object.values(R.rec().accounts || {})], slug });
      if (st.state === "foreign") throw new Error(`refused before ${emails[r]}'s code: ${st.why}`);
      const a = await allowEmail(be.DB, emails[r], { reset: st.state === "held" && reissue, days: 1 });
      if (a.refused) throw new Error(`the operator's allow of ${emails[r]}: ${a.refused}`);
      const code = newSignInCode();
      const s = await d.call("POST", "/signup", { body: { email: emails[r], code: a.code, password: code, device: "make-reviewer-org" } });
      if (s.status !== 200 || !s.json || !["created", "set", "reset"].includes(s.json.account)) throw new Error(`the sign-up of ${emails[r]}: HTTP ${s.status} ${bare(s.json)}`);
      codes[r] = code;
      const id = ((await be.DB.prepare("SELECT id FROM accounts WHERE email = ?1").bind(emails[r]).first()) || {}).id || null;
      R.set({ accounts: { ...(R.rec().accounts || {}), [r]: id } });
      R.step(`account-${r}`, { email: emails[r], how: s.json.account, account: id });
      say(`  ✓ the ${r}'s account ${emails[r]}: ${s.json.account}`);
    };
    const signIn = async (r) => {
      const l = await d.call("POST", "/login", { body: { email: emails[r], password: codes[r], device: "make-reviewer-org" } });
      if (l.status !== 200 || !l.json || !l.json.token) throw new Error(`the sign-in of ${emails[r]}: HTTP ${l.status} ${bare(l.json)}`);
      return l.json.token;
    };

    // 1 · the admin
    await account("admin");
    // 2 · the org (its home project sharingu)
    let key;
    if (!w.org) {
      R.step("org", { asked: { slug, name, project: HOME.slug } });
      const o = await d.call("POST", "/orgs", { body: { email: emails.admin, password: codes.admin, name, slug, project: HOME.slug, projectName: HOME.name, you: NAMES.admin } });
      if (o.status !== 200 || !o.json || !o.json.key || !o.json.org) throw new Error(`POST /orgs: HTTP ${o.status} ${bare(o.json)}`);
      R.step("org", { org: o.json.org.id, slug, home: o.json.project && o.json.project.key });
      say(`  ✓ the org ${o.json.org.id} /${slug} ("${name}"), its home project ${o.json.project && o.json.project.key}`);
      key = await signIn("admin");   // B8: the admin's own sign-in token, as on a resume; POST /orgs' owner key is dropped unused
    } else {
      key = await signIn("admin");
      say(`  · the org ${w.org.id} /${slug} stands (signed in as its admin)`);
    }
    w = await readWorld(be.DB, { slug, emails });
    const org = Number(w.org.id), home = projectKey(org, HOME.slug), sample = projectKey(org, SAMPLE.slug);
    R.set({ org });
    // 3 · the plan
    if (w.org.plan !== PLAN) {
      R.step("plan", { before: w.org.plan, to: PLAN });
      const p = await raisePlan(be.DB, org, PLAN, {});
      if (p.refused) throw new Error(`the operator's raise: ${p.refused}`);
      R.step("plan", { before: p.from, to: PLAN, created: p.created, after: p.after, undo: `node tools/operator.mjs set-plan --org ${org} --plan ${p.from}` });
      say(`  ✓ the plan: ${p.from} -> ${PLAN} (${p.created ? "its row written from team's numbers" : "its row as it stood"})`);
    } else say(`  · the plan is ${PLAN}`);
    // 4 · the sample project
    if (!w.projects.includes(sample)) {
      R.step("sample-project", { key: sample });
      const c = await d.call("POST", "/control", { key, form: { action: "add-project", key: SAMPLE.slug, name: SAMPLE.name } });
      w = await readWorld(be.DB, { slug, emails });
      if (!w.projects.includes(sample)) throw new Error(`add-project ${SAMPLE.slug}: HTTP ${c.status}, no project ${sample} after it`);
      say(`  ✓ the project ${sample} ("${SAMPLE.name}")`);
    } else say(`  · the project ${sample} stands`);
    // 5 · the data, through the door
    const imports = { ...((R.rec().imports) || {}) };
    const plan = importPlan(imports, digests);
    // the showcase overlay the sample files from (the walkthrough's goal as it stands there)
    const showcaseOf = () => showcaseGoal(String(srcs.sample.overlays || "").split(",").find((f) => f.endsWith("/6-showcase.items.json")) || SHOWCASE_OVERLAY);
    let reopened = false;
    for (const [label, project, from, pname] of todo) {
      // an import this record holds for this org UNDER THE SAME DIGEST is not filed again (a replay still writes its previews'
      // rows); a changed digest, or none recorded, imports again — the importer files nothing twice (an unchanged batch
      // previews as unchanged) — and records the new digest
      const st = plan[label];
      if (st.state === "unchanged") { say(`  · ${label} imported (${imports[label].at}): unchanged, ${st.why}`); continue; }
      if (st.state !== "new") say(`  · ${label} imported (${imports[label].at}) but changed → importing again: ${st.why}`);
      // a re-import of the sample after the walkthrough: the loop's "done" on its goal is content the overlay's goals batch never
      // filed, and the door refuses that batch's clientRef for it (client_ref_taken). The admin files the goal back as the overlay
      // has it first (the record forgets goalDone BEFORE, so a stop here is the walkthrough's last step to finish), and step 7
      // marks it done again after the import
      const wk = R.rec().walkthrough || {};
      if (label === "sample" && st.state !== "new" && wk.goalDone) {
        R.set({ walkthrough: { ...wk, goalDone: null } });
        const items = [{ kind: "goal", op: "upsert", data: showcaseOf() }];
        const rp = await d.tool(key, "preview", { project: SAMPLE.slug, items });
        const ri = rp.out && rp.out.items && rp.out.items[0];
        if (rp.isError || !ri || !["files", "unchanged"].includes(ri.verdict)) throw new Error(`the admin's preview of goal/${WALK_GOAL} as its overlay has it: ${bare(ri || rp.out)}`);
        if (ri.verdict === "files") { const rf = await d.tool(key, "file", { previewId: rp.out.previewId, items }); if (rf.isError) throw new Error(`the admin's filing of goal/${WALK_GOAL} as its overlay has it: ${bare(rf.out)}`); }
        reopened = true;
        say(`  · goal/${WALK_GOAL} filed back as its overlay has it (${ri.verdict === "files" ? `status ${JSON.stringify(showcaseOf().status || null)}` : "it stood so: nothing filed"}), to be marked done again after the import`);
      }
      R.step(`import-${label}`, { project, from, digest: digests[label].digest, was: st.state, ...(imports[label] && imports[label].digest ? { before: imports[label].digest } : {}) });
      say(`  · importing ${label}: ${sourceLine(srcs[label])} …`);
      const i = await importOne({ base: url, key, project, from, name: pname, costFrom: live ? costFrom : null, costDir: runDir, log: join(runDir, `import-${label}.log`), sourceEnv, sources });
      if (i.rc !== 0) throw new Error(`the ${label} import: ${i.why}`);
      imports[label] = { at: new Date().toISOString(), from, digest: digests[label].digest, parts: digests[label].parts };
      R.set({ imports });
      say(`  ✓ ${label} imported (its log: ${join(runDir, `import-${label}.log`)})`);
    }
    // 6 · the seats: a seat with its access hats, then the account's code; then the admin's own hats
    for (const r of ROLES.filter((x) => x !== "admin")) {
      const projects = SEATS[r].on === "both" ? [home, sample] : [sample];
      if (!w.seats[r]) {
        R.step(`seat-${r}`, { email: emails[r], projects, hats: SEATS[r].hats });
        const form = new URLSearchParams({ action: "add-person", name: NAMES[r], email: emails[r], role: SEATS[r].role, seatsChosen: "1" });
        for (const p of projects) form.append("projectKey", p);
        for (const h of SEATS[r].hats) form.append("accessHat", h);
        const c = await d.call("POST", "/control", { key, form });
        w = await readWorld(be.DB, { slug, emails });
        if (!w.seats[r]) throw new Error(`add-person ${emails[r]}: HTTP ${c.status}, no seat after it`);
        say(`  ✓ the ${r}'s seat, on ${projects.join(" and ")}${SEATS[r].hats.length ? `, access hats ${SEATS[r].hats.join(", ")}` : ""}`);
      } else {
        const fix = accessRepairs(w).find((x) => x.r === r);
        if (fix) {
          R.step(`seat-${r}-hats`, { email: emails[r], hats: fix.hats });
          const c = await d.call("POST", "/control", { key, form: accessForm(fix) });
          w = await readWorld(be.DB, { slug, emails });
          if (accessRepairs(w).some((x) => x.r === r)) throw new Error(`set-access-hats ${emails[r]}: HTTP ${c.status}, its access hats still ${hatsKey(w.seats[r] && w.seats[r].access_hats) || "none"}`);
          say(`  ✓ the ${r}'s seat stands; its access hats set again: ${fix.hats.join(", ") || "none"}`);
        } else say(`  · the ${r}'s seat stands`);
      }
      await account(r);
    }
    w = await readWorld(be.DB, { slug, emails });
    if (hatsKey(w.seats.admin && w.seats.admin.hats) !== [...SEATS.admin.hats].sort().join(",")) {
      R.step("admin-hats", { hats: SEATS.admin.hats });
      const h = await d.call("POST", "/profile", { key, body: { action: "set-profile", hats: SEATS.admin.hats } });
      if (h.status !== 200) throw new Error(`the admin's hats (POST /profile set-profile): HTTP ${h.status} ${bare(h.json)}`);
      say(`  ✓ the admin's own hats: ${SEATS.admin.hats.join(", ")}`);
    } else say(`  · the admin's hats stand`);
    // every seat's token (each signs in with its code, as its person would)
    const tok = {};
    for (const r of ROLES) tok[r] = r === "admin" ? key : await signIn(r);
    // 7 · the walkthrough: one request's loop on the sample, each step as the seat that does it
    const walk = { ...((R.rec().walkthrough) || {}) };
    if (!walk.complete) {
      R.step("walkthrough", { goal: WALK_GOAL });
      const F = walkFilings(emails);
      const fileOne = async (r, contribution) => {
        const items = [{ contribution }];
        const pv = await d.tool(tok[r], "preview", { project: SAMPLE.slug, items });
        const it = pv.out && pv.out.items && pv.out.items[0];
        if (pv.isError || !it || !["files", "waits_for_owner", "unchanged"].includes(it.verdict)) throw new Error(`the ${r}'s preview of "${contribution.what}": ${bare(it || pv.out)}`);
        const f = await d.tool(tok[r], "file", { previewId: pv.out.previewId, items });
        const got = f.out && f.out.items && f.out.items[0] && f.out.items[0].filed;
        if (f.isError || !got || !got.id) throw new Error(`the ${r}'s filing of "${contribution.what}": ${bare(f.out)}`);
        // its route and decision as they stand (the operator's read: a replay's preview says only "unchanged")
        const row = await be.DB.prepare(TX_SQL).bind(got.id, org).first();
        if (!row) throw new Error(`the ${r}'s filing ${got.id} is not in org ${org}`);
        return { id: got.id, waits: row.route === "owner" && !row.decision, owner: row.route === "owner" };
      };
      const decide = async (id, verdict, note) => {
        const x = await d.tool(tok.admin, "decide_contribution", { id, verdict, note });
        if (x.isError && !(x.out && x.out.error === "already_decided")) throw new Error(`the admin's decision on ${id}: ${bare(x.out)}`);
      };
      // a pick-up whose next action is done already (next_done: the change filed with parent closes it, src/pickup.js) stands
      const pick = async (args) => {
        const x = await d.tool(tok.dev, "pick_up", args);
        if (x.isError && !(x.out && x.out.error === "next_done")) throw new Error(`the dev's pick-up ${bare(args)}: ${bare(x.out)}`);
        return x.out || {};
      };
      // proposed: the BD seat's request waits for the owner
      const p = await fileOne("bd", F.proposal);
      if (!p.owner) throw new Error(`the proposal ${p.id} did not wait for the owner`);
      walk.proposal = p.id; R.set({ walkthrough: walk });
      say(`  ✓ proposed: the BD seat's request ${p.id} on goal/${WALK_GOAL}, ${p.waits ? "waiting for the owner" : "the owner's (decided before)"}`);
      // decided
      if (p.waits) await decide(p.id, F.decision.verdict, F.decision.note);
      say(`  ✓ decided: the admin approves ${p.id}`);
      // picked up, then filed done by the dev
      await pick({ id: p.id });
      const c = await fileOne("dev", F.code(p.id));
      if (c.waits) await decide(c.id, "approve", "Landed: the change the request asked for.");
      walk.code = c.id; R.set({ walkthrough: walk });
      const closed = await pick({ id: p.id, done: true, note: `filed done: ${c.id}` });
      say(`  ✓ picked up and filed done: the dev's change ${c.id} on goal/${WALK_GOAL}${c.waits ? " (approved by the admin)" : ""}; ${closed.error === "next_done" ? `the change itself closed the request's next action` : "the pick-up closed"}`);
      // graded by the tester, with proof
      for (const g of F.grades) {
        const x = await d.tool(tok.tester, "submit_grade", { project: SAMPLE.slug, ...g });
        if (x.isError || !x.out || x.out.verdict !== g.verdict) throw new Error(`the tester's grade of ${g.checkId}: ${bare(x.out)}`);
      }
      say(`  ✓ graded: the tester proves ${WALK_CHECKS.join(" and ")}, each with its proof`);
      // announced by marketing
      const m = await fileOne("marketing", F.gtm(c.id));
      if (m.waits) await decide(m.id, "approve", "Announce it.");
      walk.gtm = m.id; walk.complete = new Date().toISOString(); R.set({ walkthrough: walk });
      say(`  ✓ announced: marketing's launch ${m.id} on goal/${WALK_GOAL}${m.waits ? " (approved by the admin)" : ""}`);
    } else say(`  · the walkthrough stands (${walk.proposal}, ${walk.code}, ${walk.gtm})`);
    // the goal done: the walkthrough's last step, and again after a re-import of the sample (13.3: the overlay files the goal
    // "in progress", so a changed overlay would undo the loop's done; an unchanged goal previews as unchanged and files nothing)
    if (!walk.goalDone) {
      // done: the loop completed the goal, so the admin (the owner) files its status (preview, then file), the goal as the
      // sample's own showcase overlay files it (the one this run imported)
      const items = [walkGoalDone(showcaseOf())];
      const gp = await d.tool(tok.admin, "preview", { project: SAMPLE.slug, items });
      const gi = gp.out && gp.out.items && gp.out.items[0];
      if (gp.isError || !gi || !["files", "unchanged"].includes(gi.verdict)) throw new Error(`the admin's preview of goal/${WALK_GOAL} done: ${bare(gi || gp.out)}`);
      const gf = gi.verdict === "unchanged" ? { isError: false } : await d.tool(tok.admin, "file", { previewId: gp.out.previewId, items });
      if (gf.isError) throw new Error(`the admin's filing of goal/${WALK_GOAL} done: ${bare(gf.out)}`);
      walk.goalDone = new Date().toISOString(); R.set({ walkthrough: walk });
      say(`  ✓ done: the admin marks goal/${WALK_GOAL} done${reopened ? " again, after the sample's re-import" : ""}${gi.verdict === "unchanged" ? " (it stood done: nothing filed)" : ""}`);
    } else say(`  · goal/${WALK_GOAL} stands done`);
    // 8 · the proof: every account signs in with its code and reads as its role may
    w = await readWorld(be.DB, { slug, emails });
    const left = gaps(w, R.rec(), { sampleOnly, digests });
    if (left.length) throw new Error(`the world still lacks ${left.join(", ")}`);
    const proof = [];
    const loopIds = [walk.proposal, walk.code, walk.gtm];
    for (const r of ROLES) {
      const t = await signIn(r);
      const me = await d.call("GET", "/whoami", { key: t });
      if (me.status !== 200 || !me.json || me.json.role !== ROLE_OF[r]) throw new Error(`the ${r}'s whoami: HTTP ${me.status} role ${me.json && me.json.role}`);
      const hats = hatsKey(r === "admin" ? me.json.hats : me.json.accessHats);
      if (hats !== [...SEATS[r].hats].sort().join(",")) throw new Error(`the ${r}'s hats on whoami: ${hats || "none"}`);
      const readOf = async (p) => d.tool(t, "goals", { project: p });
      const hs = await readOf(HOME.slug), ss = await readOf(SAMPLE.slug);
      // B12: the partner's refusal is THE seat refusal, never any error (a 401, a 500 or a network fault proves nothing)
      const homeOk = r === "partner" ? hs.isError && !!hs.out && hs.out.error === "project_forbidden" : !hs.isError, sampleOk = !ss.isError;
      if (!homeOk || !sampleOk) throw new Error(`the ${r}'s reads: sharingu ${hs.isError ? `refused ${bare(hs.out)}` : "read"}, sample ${ss.isError ? `refused ${bare(ss.out)}` : "read"}`);
      // the loop on the goal's page, as this seat: the three filings, each lane's cell landed, the two checks passed
      const g = await d.tool(t, "goals", { project: SAMPLE.slug, ref: WALK_GOAL });
      const rows = ((g.out && g.out.filings && g.out.filings.rows) || []).map((x) => x.id);
      const cells = Object.fromEntries(((g.out && g.out.dims) || []).map((x) => [x.dim, Number(x.count) || 0]));
      const chk = g.out && g.out.checks;
      const passed = chk ? Number(chk.passed) || 0 : 0;
      const gstatus = (g.out && g.out.node && g.out.node.status) || null;
      if (g.isError || !loopIds.every((id) => rows.includes(id)) || !["ba", "code", "gtm"].every((k) => cells[k] >= 1) || passed < WALK_CHECKS.length || gstatus !== "done")
        throw new Error(`the ${r}'s read of goal/${WALK_GOAL}: filings ${rows.join(",") || "none"}, cells ${bare(cells)}, checks passed ${passed}, status ${gstatus || "none"}${g.isError ? ` (${bare(g.out)})` : ""}`);
      let extra = "";
      if (SEATS[r].brief) {
        const b = await d.tool(t, "brief", { project: SAMPLE.slug, for: SEATS[r].brief });
        const goals = ((b.out && b.out.goals) || []).map((x) => x.ref);
        if (b.isError || (SEATS[r].brief !== "management" && !goals.includes(`goal/${WALK_GOAL}`)) || !goals.length) throw new Error(`the ${r}'s brief for ${SEATS[r].brief}: ${bare(b.out)}`);
        extra = `; its ${SEATS[r].brief} brief: ${goals.length} goal${goals.length === 1 ? "" : "s"}${goals.includes(`goal/${WALK_GOAL}`) ? `, goal/${WALK_GOAL} among them` : ""}`;
      }
      if (r === "tester") {
        const k = await d.tool(t, "read", { project: SAMPLE.slug, kind: "check", status: "pass" });
        const ids = ((k.out && k.out.items) || []).map((x) => x.id || (x.item && x.item.id));
        if (k.isError || !WALK_CHECKS.every((id) => ids.includes(id))) throw new Error(`the tester's passed checks: ${bare(k.out)}`);
        extra += `; the checks passed: ${WALK_CHECKS.join(", ")}`;
      }
      const reads = r === "partner" ? `reads the sample, refused sharingu (${(hs.out && hs.out.error) || "refused"})` : "reads sharingu and the sample";
      proof.push(`${r}: signs in, role ${me.json.role}, ${reads}; hats ${SEATS[r].hats.join(", ") || "none"}${extra}; the loop on goal/${WALK_GOAL}: ${loopIds.join(" -> ")}, cells ba ${cells.ba} · code ${cells.code} · gtm ${cells.gtm}, checks ${passed} passed, the goal ${gstatus}`);
    }
    R.done("complete", { proof, completedAt: new Date().toISOString() });
    say(`✓ the reviewer world stands on ${be.database}: org ${org} /${slug}, plan ${PLAN}, projects ${home} and ${sample}`);
    for (const p of proof) say(`  ✓ ${p}`);
    say("");
    say(`  the org:  ${url}/${slug}`);
    say(`  the MCP:  ${url}/mcp`);
    for (const r of ROLES) say(`  ${r.padEnd(9)} ${emails[r]}  code: ${codes[r]}`);
    say("  Hand these to the store's reviewer yourself. They are shown this once and kept nowhere (the record holds none);");
    say("  --reissue gives each account a new one.");
    return 0;
  } catch (e) {
    try { const R = JSON.parse(readFileSync(recPath, "utf8")); R.state = "failed"; R.why = String((e && e.message) || e).slice(0, 600); writeFileSync(recPath, JSON.stringify(R, null, 1) + "\n"); } catch {}
    err(`✗ ${String((e && e.message) || e)}`);
    err(`  the record: ${recPath} — a rerun resumes (with --reissue when an account already holds its code)`);
    return 1;
  } finally { await be.close(); }
}

// run directly (REAL paths: macOS keeps var under a private symlink — a string compare would silently never run the CLI)
const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) {
  run(process.argv.slice(2)).then((rc) => process.exit(rc), (e) => { console.error(`✗ ${String((e && e.message) || e)}`); process.exit(1); });
}
