#!/usr/bin/env node
// tools/live-walk.mjs — gate line 1 of docs/plan/BETA.md, walked end to end through the real door as TWO people (an admin
// and a new member) on a THROWAWAY project that it creates and removes. The walk is the member's "AI": it reads the sample
// input under tools/walk/fixtures/ (a tiny repo, a product brief, a screenshot, a discussion) with no model, turns it into
// items, previews them, files them, and checks that every face shows what was filed. Then it walks the rest of the member
// path (answer and rule a question, grade a check, file a change and see its impact and the stale light, regrade, hand the
// next action to the admin, find it all again), probes what must be refused, and leaves the org as it found it, also when
// a step fails (a `finally`).
//
//   node tools/live-walk.mjs [--url <org>] [--creds <file>] [--live] [--json <transcript.json>] [--keep] [--unmarked]
//
//   --url      the org (default http://127.0.0.1:8870, the walk's own local org: engine/.runs/walk/)
//   --creds    a file holding the admin's key: a credentials.env with an *_AGENT_R_OWNER_KEY= line, or the bare key
//              (default .runs/walk/state/walk-org/credentials.env). WALK_URL and WALK_KEY_FILE are still read.
//              The key is never printed; every key, session and read-only credential is redacted from the transcript.
//   --live     REQUIRED for any URL that is not local; it runs tools/cf-budget.sh first and stops on its refusal.
//   --preview  the URL MUST be a worker's version preview (https://<8 hex>-<worker>.<subdomain>.workers.dev), else the walk
//              refuses (exit 2) before anything runs: tools/ship.sh walks the new version's preview before any traffic moves
//              (PLATFORM §5), never the production route.
//   --json     writes the transcript (every call, its answer, its rows; keys redacted).
//   --keep     leaves the project and the two people for inspection (no clean-up).
//   --operator-config <wrangler config> --confirm-live <its D1 database name>   (with --live only; the sprint-7 review, D6)
//              the clean-up ALSO removes the platform accounts its two people's emails made (migrate-070: one account per
//              email, platform-wide; remove-person archives a seat, it leaves the account): tools/operator.mjs removeAccount on
//              that config's live D1, with the deployment's credentials (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the
//              environment, never printed). Refused before anything runs (exit 2) without --live, or when --confirm-live does
//              not name the config's D1. tools/ship.sh's preview walk and ship-plan's live walk pass it; a local walk leaves its
//              throwaway accounts in its own local database.
//   MARKED BY DEFAULT (sprint 3 S3b): the project is created eval-marked (create_project {eval: true}: a test run's own,
//              listed on Control only with ?eval=1), the two people are the suites' kind (add-person eval=1: eval-fixed-*),
//              every write carries eval: true and every read passes the tabs' switch (eval: true, ?eval=1: the extract reads
//              search, read, changes and brief take it too; a marked change stales grades inside an eval project). The
//              clean-up removes the knowledge, archives the project, removes the people and runs Control's clean-eval (the
//              marked rows, and the archived eval project swept of what it held), then checks that Control lists none of it
//              and that the beta measures did not move. What stays (said in the clean-up line): the project row, archived and
//              eval-marked; the two people, archived; the grades (check_results is never removed) and the marked filings
//              they point at. --eval is accepted and changes nothing.
//   --unmarked a member's own path, unmarked: the rows stay on the ARCHIVED throwaway project (the old default).
//   THE ORG'S PLAN (sprint 8, 8.5): before anything is written the walk reads its org's plan (GET /whoami) and refuses (exit 2)
//              when the plan cannot hold it (walkPlanRefusal below: fewer than WALK_CALLS calls a minute, or left today) — the
//              operator's raise is named, never done here.
//
// Each step prints one line: ✓ or ✗, what it did, and on failure the call, the answer and what was expected. Exit 0 only
// when every step passed. Rows: every request sends `x-count-rows: 1` and the worker answers its D1 rows read and written
// in `Server-Timing: d1-rows` (src/timing.js); the walk sums them over every request it made (requests that answer no
// such header are counted apart as "unmetered").
//
// THE RENAME (sprint 3, B6): the tool names and the REST paths the walk calls are the two tables right below. Every name
// is resolved from tools/list before the first step; a missing one fails the walk with its name.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ============ THE NAME TABLE: the only lines the rename slice edits ============
// role -> the tool's name on the door today, and who must see it on their own tools/list (admin or member)
export const TOOLS = {
  whoami:        { name: "whoami",         holder: "member" },
  checklist:     { name: "missing",        holder: "member" },
  formats:       { name: "formats",        holder: "member" },
  createProject: { name: "create_project", holder: "admin" },
  preview:       { name: "preview",        holder: "member" },
  file:          { name: "file",           holder: "member" },
  decisions:     { name: "decisions",      holder: "member" },
  respond:       { name: "respond",        holder: "member" },
  rule:          { name: "rule_question",  holder: "admin" },
  grade:         { name: "submit_grade",   holder: "member" },
  mapNode:       { name: "map",            holder: "member" },
  goals:         { name: "goals",          holder: "member" },
  impact:        { name: "impact",         holder: "member" },
  pickUp:        { name: "pick_up",        holder: "admin" },
  home:          { name: "home",           holder: "admin" },
  search:        { name: "search",         holder: "member" },
  read:          { name: "read",           holder: "member" },
  changes:       { name: "changes",        holder: "member" },
  brief:         { name: "brief",          holder: "member" },
};
// the REST doors and pages the walk opens ({id} {qid} {ref} are filled in)
export const ROUTES = {
  login: "/login", whoami: "/whoami", profile: "/profile", control: "/control", people: "/control/people", measures: "/control/measures",
  previewPage: "/preview/{id}", previewPost: "/preview", filePost: "/file",
  home: "/home", homeSummary: "/home/summary", goals: "/goals", goal: "/goals/{ref}", decisions: "/decisions", render: "/render/{hash}",
  question: "/question/{qid}", map: "/map", mapNode: "/map/node", mapScreens: "/map/screens", library: "/library",
  build: "/build", gtm: "/gtm", broadcast: "/broadcast", missing: "/missing", changes: "/changes", search: "/search",
  contribution: "/contribution/{id}", impactView: "/contribution/{id}/impact", read: "/read",
};
// ===============================================================================

// resolveTools({admin: [names], member: [names]}) -> {names: role -> name, missing: [{role, name, holder}]}: every tool the
// walk uses must be on the tools/list of the person who calls it
export function resolveTools(lists, table = TOOLS) {
  const names = {}, missing = [];
  for (const [role, t] of Object.entries(table)) {
    const have = new Set((lists && lists[t.holder]) || []);
    if (have.has(t.name)) names[role] = t.name;
    else missing.push({ role, name: t.name, holder: t.holder });
  }
  return { names, missing };
}
export const missingLine = (missing) => missing.map((m) => `${m.name} (the ${m.holder}'s tools/list; the walk's "${m.role}")`).join(", ");

// redact(value, secrets, allow) -> the same value with every secret, every 40-hex key, every bearer header and every
// session cookie replaced; walks strings, arrays and objects (a JSON transcript is redacted the same way). `allow` names
// 40-hex values that are known not to be keys (the sample commit's sha), kept as they are.
export function redact(value, secrets = [], allow = []) {
  const list = [...new Set(secrets.filter((s) => typeof s === "string" && s.length >= 8))].sort((a, b) => b.length - a.length);
  const one = (s) => {
    let t = s;
    for (const k of list) t = t.split(k).join("<redacted>");
    for (const k of list) { const e = encodeURIComponent(k); if (e !== k) t = t.split(e).join("<redacted>"); }
    return t.replace(/\b[0-9a-f]{40}\b/g, (x) => (allow.includes(x) ? x : "<key>")).replace(/(Bearer\s+)[^\s"'<]+/gi, "$1<redacted>").replace(/(__Host-ar_session=)[^;\s"']+/g, "$1<redacted>");
  };
  const walk = (v) => typeof v === "string" ? one(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return walk(value);
}

// a person's read-only credential (src/core.js resolveReadOnly): sha256(sha256(key) + the read-only suffix)
const sha = (s) => createHash("sha256").update(s).digest("hex");
export const readOnlyOf = (key) => sha(sha(key) + ":agent-r-read-only:v1");
// isPreviewUrl(u) -> a worker's version preview URL (its origin only): https://<8 hex>-<worker>.<subdomain>.workers.dev
export const isPreviewUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" && /^[0-9a-f]{8}-[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(x.hostname) && (x.pathname === "/" || x.pathname === "") && !x.search; } catch { return false; } };
export const isLocalUrl = (u) => { try { return /^(127\.\d+\.\d+\.\d+|localhost|0\.0\.0\.0|\[::1\])$/.test(new URL(u).hostname); } catch { return false; } };
// operatorRefusal({ live, config, confirm }, cfg) -> why --operator-config may not run with these flags, or "" (checked before the walk)
export function operatorRefusal(o, cfg) {
  if (!o.config) return o.confirm ? "--confirm-live without --operator-config" : "";
  if (!o.live) return "--operator-config needs --live (it removes the throwaway accounts on the deployment's live D1)";
  const d1 = cfg && cfg.d1_databases && cfg.d1_databases[0];
  if (!d1 || !d1.database_id) return `${o.config}: no D1 database`;
  if (o.confirm !== d1.database_name) return `--confirm-live must name the D1 database of ${o.config} (${d1.database_name}) — the live shared database, every org's`;
  return "";
}
// THE WALK'S ORG'S PLAN (sprint 8, 8.5; the must-close, 8.2f's find): every call the walk makes counts on its org's plan (the
// door's calls a day and a minute, src/plans.js), so an org on a plan too small for the walk would throttle it into a false red.
// WALK_CALLS: the counted calls one walk may make, with headroom — the sprint-7 ship's preview walk sent 108 requests, 63 of them
// counted (POST /mcp tools/calls and REST writes), and a walk may land them in one minute. walkPlanRefusal(plan) -> why the walk
// does not run on this plan (its whoami's `plan`: the burst below WALK_CALLS, or fewer than WALK_CALLS calls left today), or ""
// (also "" when the door answers no plan: an engine before sprint 8 limits nothing). The ship's walk runs as the suites' org, put
// ONCE on the ship's own plan row by the operator (tools/ship-plan.sh prints the step); a local walk's org rides the harness's.
export const WALK_CALLS = 150;
export function walkPlanRefusal(plan) {
  const l = plan && plan.limits;
  if (!l || !l.burst_minute || !l.calls_day) return "";
  const raise = "raise it first, as the operator: node tools/operator.mjs raise --org <its id> --plan suite … (the ship's own row; for the suites' org: --org suites)";
  if (Number(l.burst_minute.allowed) < WALK_CALLS) return `its org rides plan ${plan.plan}, whose ${l.burst_minute.allowed} calls a minute cannot hold the walk's up to ${WALK_CALLS}: ${raise}`;
  const left = Number(l.calls_day.allowed) - Number(l.calls_day.used || 0);
  if (left < WALK_CALLS) return `its org has ${left} of its plan ${plan.plan}'s ${l.calls_day.allowed} calls left today, fewer than the walk's up to ${WALK_CALLS}: wait for 00:00 UTC, or ${raise}`;
  return "";
}
export const keyFromFile = (text) => (String(text).match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1] || (/^[0-9a-f]{40}$/.test(String(text).trim()) ? String(text).trim() : null);
export const rowsOf = (h) => { const m = /d1-rows;dur=0;desc="read=(\d+) written=(\d+) stmts=(\d+)(?: unknown=(\d+))?/.exec(h || ""); return m ? { read: +m[1], written: +m[2], stmts: +m[3], unknown: +(m[4] || 0) } : null; };

// ============ the input: the sample folder, read as a member's AI would read it (deterministic, no model) ============
const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(HERE, "walk", "fixtures");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const doorId = (route) => "door:" + slug(route);

// the repo: routes.js (pages -> screens, apis -> doors and the tables they read or write), tests/*.test.js (-> checks)
export async function readRepo(dir = join(FIXTURES, "repo")) {
  const routes = (await import(pathToFileURL(join(dir, "routes.js")).href)).default;
  const title = (readFileSync(join(dir, "README.md"), "utf8").match(/^#\s+(.+?)(?:\s*\(.*\))?\s*$/m) || [])[1] || "The app";
  const surface = { key: slug(title), name: `${title} web` };
  const pages = routes.filter((r) => r.type === "page"), apis = routes.filter((r) => r.type === "api");
  const screens = pages.map((p) => ({ id: `screen:${p.id}`, name: p.name, route: p.route, lane: p.lane, step: p.step, file: p.file, uses: p.uses || [] }));
  const doors = apis.map((a) => ({ id: doorId(a.route), name: a.route, reads: a.reads || [], writes: a.writes || [] }));
  const tables = [...new Set(apis.flatMap((a) => [...(a.reads || []), ...(a.writes || [])]))].map((t) => ({ id: `table:${t}`, name: t }));
  const edges = [];
  for (const s of screens) for (const u of s.uses) edges.push({ from: s.id, to: doorId(u), kind: "depends", label: "calls" });
  for (const d of doors) { for (const t of d.reads) edges.push({ from: d.id, to: `table:${t}`, kind: "reads" }); for (const t of d.writes) edges.push({ from: d.id, to: `table:${t}`, kind: "writes" }); }
  const byLane = {};
  for (const s of screens) (byLane[s.lane] = byLane[s.lane] || []).push(s);
  for (const l of Object.values(byLane)) { l.sort((a, b) => a.step - b.step); for (let i = 1; i < l.length; i++) edges.push({ from: l[i - 1].id, to: l[i].id, kind: "nav" }); }
  const checks = [];
  for (const f of ["pricing.test.js", "checkout.test.js"]) {
    const src = readFileSync(join(dir, "tests", f), "utf8");
    for (const m of src.matchAll(/test\("([^"]+)",\s*\{\s*(screen|door):\s*"([^"]+)",\s*goal:\s*"([^"]+)"\s*\}/g)) {
      const ref = m[2] === "screen" ? `screen:${m[3]}` : doorId(m[3]);
      checks.push({ id: `AC.walk.${String(checks.length + 1).padStart(2, "0")}`, title: m[1], refs: [ref, m[4]], file: `tests/${f}` });
    }
  }
  return { surface, screens, doors, tables, edges, checks, fileToScreen: Object.fromEntries(screens.map((s) => [s.file, s.id])) };
}

// the brief: "## Aim" (a line, then "Measure: <name> = <value> (<period>), from <source>"), "## Goals" (an indented list of
// "id: title [lane]"), "## Start here" (the body of start-here.md)
export function readBrief(file = join(FIXTURES, "brief.md")) {
  const t = readFileSync(file, "utf8");
  const sec = (h) => (t.split(/^## /m).find((s) => s.startsWith(h + "\n")) || "").slice(h.length + 1).trim();
  const aimLines = sec("Aim").split("\n");
  const m = /^Measure:\s*(.+?)\s*=\s*(\d+)\s*\(([^)]+)\),\s*from\s+(.+)$/.exec(aimLines.find((l) => l.startsWith("Measure:")) || "");
  const goals = [];
  const stack = [];
  for (const line of sec("Goals").split("\n")) {
    const g = /^(\s*)-\s*([a-z0-9-]+):\s*(.+?)\s*\[([a-z]+)\]\s*$/.exec(line);
    if (!g) continue;
    const depth = g[1].length / 2;
    stack.length = depth;
    goals.push({ id: g[2], title: g[3], parent: depth ? stack[depth - 1] : null, dimensions: [g[4]] });
    stack[depth] = g[2];
  }
  return { aim: aimLines.find((l) => l && !l.startsWith("Measure:")), measure: m ? { name: m[1], value: Number(m[2]), period: m[3], source: m[4] } : null,
    goals, startHere: { path: "start-here.md", title: "Start here", body: sec("Start here") } };
}

// the discussion: "QUESTION: <q> | <option> | <option>" (open) and "RULED: <q> | <option> | <option> | chose <option>"
export function readDiscussion(file = join(FIXTURES, "discussion.md")) {
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const q = /^(QUESTION|RULED):\s*(.+)$/.exec(line);
    if (!q) continue;
    const parts = q[2].split("|").map((x) => x.trim());
    const chose = q[1] === "RULED" ? (parts.pop().match(/^chose\s+(.+)$/) || [])[1] : null;
    out.push({ question: parts[0], options: parts.slice(1), choice: chose ? parts.slice(1).indexOf(chose) : null });
  }
  return out;
}

// the change: a git patch — its subject (what), the body's first paragraph (why), "Tested:" (the proof), "Next:" (the next
// action), the files it changes (-> the screens they render, through routes.js)
export function readPatch(file = join(FIXTURES, "repo", "change.patch")) {
  const t = readFileSync(file, "utf8");
  const head = t.split(/^---$/m)[0];
  const body = head.split(/^Subject: .*$/m)[1] || "";
  return {
    commit: (/^From ([0-9a-f]{40})/m.exec(t) || [])[1],
    what: ((/^Subject: (?:\[PATCH\]\s*)?(.+)$/m.exec(t) || [])[1] || "").trim(),
    why: (body.trim().split(/\n\s*\n/)[0] || "").replace(/\s+/g, " ").trim(),
    proof: ((/^Tested:\s*(.+)$/m.exec(t) || [])[1] || "").trim(),
    next: ((/^Next:\s*(.+?)(?:\s*\(the admin\))?\s*$/m.exec(t) || [])[1] || "").trim(),
    files: [...t.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((x) => x[1]),
  };
}

// the items the walk hands in (the four kinds of input), each a knowledge op of the registry's standard
export async function inputItems({ imageItem } = {}) {
  const repo = await readRepo(), brief = readBrief(), talk = readDiscussion();
  const png = readFileSync(join(FIXTURES, "screenshot-pricing.png"));
  const node = (data) => ({ kind: "node", op: "upsert", data });
  const items = {
    repo: [
      node({ id: `surface:${repo.surface.key}`, type: "surface", name: repo.surface.name }),
      ...repo.screens.map((s) => node({ id: s.id, type: "screen", name: s.name, data: { surface: repo.surface.key, lane: s.lane, step: s.step, route: s.route, states: ["default"] } })),
      ...repo.doors.map((d) => node({ id: d.id, type: "door", name: d.name })),
      ...repo.tables.map((x) => node({ id: x.id, type: "table", name: x.name })),
      ...repo.edges.map((e) => ({ kind: "edge", op: "upsert", data: e })),
      ...repo.checks.map((c) => ({ kind: "check", op: "upsert", data: { id: c.id, title: c.title, refs: c.refs } })),
    ],
    doc: [
      { kind: "aim", op: "upsert", data: { aim: brief.aim, measure: brief.measure } },
      ...brief.goals.map((g) => ({ kind: "goal", op: "upsert", data: g })),
      { kind: "doc", op: "upsert", data: brief.startHere },
    ],
    screenshot: [(() => {
      // the shape formats {kind: render} answers for a picture (its imageExample), with this screen and these bytes
      const ex = imageItem ? JSON.parse(JSON.stringify(imageItem)) : { kind: "render", op: "upsert", data: { format: "image" } };
      ex.data.screen = repo.screens.find((s) => /pricing/.test(s.id)).id;
      ex.data.body = png.toString("base64");
      if ("width" in ex.data || "height" in ex.data) Object.assign(ex.data, pngSize(png));
      return ex;
    })()],
    discussion: talk.map((q, i) => {
      const affects = repo.screens.filter((s) => q.question.toLowerCase().includes(s.name.toLowerCase())).map((s) => s.id);
      const data = { qid: `Q-walk-${i + 1}`, question: q.question, options: q.options.map((what) => ({ what })), whoOwes: "owner", ...(affects.length ? { affects } : {}) };
      return { kind: "question", op: "upsert", data: q.choice === null ? { ...data, status: "open" } : { ...data, status: "decided", choice: q.choice } };
    }),
  };
  return { repo, brief, talk, items, all: [...items.repo, ...items.doc, ...items.screenshot, ...items.discussion] };
}

// pageOf(html) -> what the transcript keeps of a page: its flash (Control's answer) and its body without scripts and styles
export function pageOf(text) {
  const t = String(text || "");
  if (!/^\s*<!doctype html|^\s*<html/i.test(t)) return t.slice(0, 4000);
  const flash = (/<p class="flash-value">([^<]*)</.exec(t) || /class="[^"]*flash[^"]*"[^>]*>([^<]{4,})</.exec(t) || [])[1] || null;
  const body = (t.split(/<body[^>]*>/i)[1] || t).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<svg[\s\S]*?<\/svg>/gi, "<svg/>");
  return { html: t.length, ...(flash ? { flash } : {}), body: body.slice(0, 20000) };
}

// pngSize(buffer) -> {width, height} from the PNG header (IHDR)
export const pngSize = (b) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });

// ============ the walk ============
async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
  const has = (n) => argv.includes(n);
  const ENGINE = resolve(HERE, "..");
  const BASE = String(flag("--url", process.env.WALK_URL || "http://127.0.0.1:8870")).replace(/\/+$/, "");
  const CREDS = flag("--creds", process.env.WALK_KEY_FILE || join(ENGINE, ".runs/walk/state/walk-org/credentials.env"));
  const JSON_OUT = flag("--json"), KEEP = has("--keep"), MARK = !has("--unmarked"), LIVE = has("--live");
  if (has("--preview") && !isPreviewUrl(BASE)) { console.error(`✗ --preview: ${BASE} is not a worker's version preview (https://<8 hex>-<worker>.<subdomain>.workers.dev) — the walk does not run`); process.exit(2); }
  if (!existsSync(CREDS)) { console.error(`usage: node tools/live-walk.mjs [--url <org>] [--creds <file>] [--live] [--json <file>] [--keep] [--unmarked] — no creds file at ${CREDS}`); process.exit(2); }
  const ownerKey = keyFromFile(readFileSync(CREDS, "utf8"));
  if (!ownerKey) { console.error(`no admin key in ${CREDS} (an *_AGENT_R_OWNER_KEY= line, or the bare key)`); process.exit(2); }
  // D6: the throwaway accounts, removed on the deployment's live D1 at the clean-up (checked before anything runs)
  let OPS = null;
  if (has("--operator-config") || has("--confirm-live")) {
    const { readConfig, liveD1 } = await import("./org-undo.mjs");
    const o = { live: LIVE, config: flag("--operator-config"), confirm: flag("--confirm-live") };
    let cfg = null;
    try { cfg = o.config ? readConfig(o.config) : null; } catch (e) { console.error(`✗ --operator-config ${o.config}: ${String((e && e.message) || e)}`); process.exit(2); }
    const why = operatorRefusal(o, cfg);
    if (why) { console.error(`✗ ${why} — the walk does not run`); process.exit(2); }
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) { console.error("✗ --operator-config needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (the deployment's credentials, sourced first) — the walk does not run"); process.exit(2); }
    const { removeAccount } = await import("./operator.mjs");
    OPS = { DB: liveD1(cfg.d1_databases[0].database_id), removeAccount, database: `live:${cfg.d1_databases[0].database_name}` };
  }
  if (!isLocalUrl(BASE)) {
    if (!LIVE) { console.error(`✗ ${BASE} is not local: pass --live to walk it (the walk writes; tools/cf-budget.sh runs first)`); process.exit(2); }
    try { execFileSync("sh", [join(ENGINE, "tools/cf-budget.sh")], { stdio: "inherit", cwd: ENGINE }); }
    catch (e) { console.error(`✗ tools/cf-budget.sh refused (exit ${e.status}): the walk does not run`); process.exit(3); }
  }

  const secrets = [ownerKey, readOnlyOf(ownerKey)];
  const red = (v) => redact(v, secrets, [readPatch().commit]);
  const brief = (v, n = 400) => { const s = typeof v === "string" ? v : JSON.stringify(v); return red(String(s)).slice(0, n); };
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  // the project's key: the walk ASKS with the bare slug and then carries the key the door ANSWERS, as a client does —
  // bare in org 1, org-carrying (o<org>--walk-…) when the walk's seat is another org's (the ship's preview walk runs as
  // the suites' org; sprint 6's key rule, src/project.js). Reassigned once, in step b.
  let P = `walk-${stamp}`;
  const EV = MARK ? { eval: true } : {};
  const evq = MARK ? "&eval=1" : "";
  const totals = { requests: 0, metered: 0, read: 0, written: 0, stmts: 0, unknown: 0 };
  const transcript = { url: BASE, project: P, startedAt: new Date().toISOString(), marked: MARK, steps: [], totals, cleanup: null };
  let cur = null;   // the step being walked: its calls
  let last = null;  // the last call, for the failure line
  const st = {};    // what earlier steps leave for later ones

  // ---- the door ----
  async function req(method, path, { key = null, body, form, accept = "application/json", headers = {}, who = "anonymous", binary = false } = {}) {
    const h = { accept, "x-count-rows": "1", ...headers };
    if (key) h.authorization = "Bearer " + key;
    let payload;
    if (form) { h["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { h["content-type"] = "application/json"; payload = JSON.stringify(body); }
    let r, text = "", bytes = null;
    try { r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" }); if (binary) { bytes = Buffer.from(await r.arrayBuffer()); text = `<${bytes.length} bytes, ${r.headers.get("content-type")}>`; } else text = await r.text(); }
    catch (e) { last = { call: `${who}: ${method} ${path}`, status: "no answer", answer: String(e && e.message || e) }; throw new Error(`${method} ${path}: ${e && e.message || e}`); }
    let json = null; try { json = JSON.parse(text); } catch { const d = /^data: (.+)$/m.exec(text); if (d) { try { json = JSON.parse(d[1]); } catch { /* not SSE JSON */ } } }
    const rows = rowsOf(r.headers.get("server-timing"));
    totals.requests++;
    if (rows) { totals.metered++; totals.read += rows.read; totals.written += rows.written; totals.stmts += rows.stmts; totals.unknown += rows.unknown; }
    const location = r.headers.get("location");
    const rec = { who, call: `${method} ${path}`, ...(body !== undefined ? { body } : {}), ...(form ? { form: Array.isArray(form) ? Object.fromEntries(form) : form } : {}), status: r.status,
      ...(location ? { location } : {}), rows, answer: json !== null ? json : pageOf(text) };
    if (cur) { cur.calls.push(rec); if (rows) { cur.rows.read += rows.read; cur.rows.written += rows.written; } }
    const pg = json === null ? pageOf(text) : null;
    last = { call: `${who}: ${method} ${path}${body !== undefined ? " " + brief(body, 300) : ""}`, status: r.status, answer: json !== null ? json : typeof pg === "string" ? pg.slice(0, 600) : (pg.flash || pg.body.replace(/\s+/g, " ").slice(0, 600)) };
    return { status: r.status, json, text, location, rows, bytes, type: r.headers.get("content-type") };
  }
  const html = (path, key, who) => req("GET", path, { key, accept: "text/html", who });
  let rpcId = 0;
  async function rpc(key, method, params, who) { return req("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: ++rpcId, method, params }, who }); }
  async function tool(key, role, args, who) {
    const name = (st.names && st.names[role]) || TOOLS[role].name;
    const r = await rpc(key, "tools/call", { name, arguments: args }, who);
    const res = r.json && r.json.result;
    if (!res) { last = { call: `${who}: ${name} ${brief(args, 300)}`, status: r.status, answer: r.json || r.text.slice(0, 400) }; throw new Error(`/mcp ${name}: HTTP ${r.status} ${brief(r.json || r.text, 200)}`); }
    const t = res.content && res.content[0] && res.content[0].text;
    let out; try { out = JSON.parse(t); } catch { out = t; }
    last = { call: `${who}: ${name} ${brief(args, 300)}`, status: r.status, answer: out };
    if (cur) cur.calls[cur.calls.length - 1].tool = name;
    return { out, isError: !!res.isError };
  }
  class Expected extends Error {}
  const must = (cond, expected) => { if (!cond) throw new Expected(typeof expected === "function" ? expected() : expected); };
  const need = (k, from) => { if (st[k] === undefined || st[k] === null) throw new Expected(`not run: it needs ${k} from "${from}", which did not pass`); return st[k]; };
  const keyOf = (text) => (String(text).match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
  const control = (fields, key = ownerKey) => req("POST", ROUTES.control, { key, form: fields, accept: "text/html", who: "admin" });
  const people = async (q = "") => ((await req("GET", ROUTES.people + q, { key: ownerKey, who: "admin" })).json || {});
  const measuresNow = async () => { const m = (await req("GET", ROUTES.measures, { key: ownerKey, who: "admin" })).json || {}; return JSON.stringify((m.measures || []).map((x) => [x.key, x.value])); };
  const projectsNow = async () => ((await people()).workspaces || []).map((w) => w.key).sort();
  const peopleNow = async () => ((await people()).people || []).map((p) => p.email).filter(Boolean).sort();
  const fileVia = async (key, items, who, extra = {}) => {
    const pv = await tool(key, "preview", { project: P, items, ...EV, ...extra }, who);
    must(!pv.isError && pv.out && pv.out.previewId, () => `preview answers a previewId`);
    const f = await tool(key, "file", { previewId: pv.out.previewId, items }, who);
    must(!f.isError && f.out, () => `file files the previewed items`);
    return { pv: pv.out, f: f.out };
  };
  const invite = async (name, email, role) => {
    const r = await control([["action", "add-person"], ["name", name], ["email", email], ["role", role], ...(MARK ? [["eval", "1"]] : [])]);
    const key = keyOf(r.text);
    must(r.status === 200 && key, () => `POST /control add-person answers 200 with the one-time key in its flash`);
    secrets.push(key, readOnlyOf(key));
    // a marked walk's people are the suites' kind (eval-fixed-*): Control lists them only on ?eval=1
    const p = ((await people(MARK ? "?eval=1" : "")).people || []).find((x) => x.email === email);
    must(p && p.id, () => `GET /control/people lists ${email}`);
    return { id: p.id, key, email, name };
  };
  const holesOf = async (key, who) => { const h = await tool(key, "checklist", { project: P, ...EV }, who); must(!h.isError && h.out && h.out.meter, () => `the checklist answers its meter`); return h.out; };
  const item = (h, id) => (h.items || []).find((x) => x.id === id) || null;
  const light = async (key, ref, who) => { const n = await tool(key, "mapNode", { project: P, ref }, who); must(!n.isError && n.out && n.out.state, () => `map {ref} answers ${ref}'s light`); return n.out; };

  // ---- the steps ----
  const STEPS = [];
  const step = (id, name, fn) => STEPS.push({ id, name, fn });
  const inTwoDays = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);

  step("0", "the org as found: its projects and people are noted, the walk's tools are on the door", async () => {
    st.before = { projects: await projectsNow(), people: await peopleNow() };
    st.measures0 = await measuresNow();
    const ad = await rpc(ownerKey, "tools/list", {}, "admin");
    st.adminTools = ((ad.json && ad.json.result && ad.json.result.tools) || []).map((t) => t.name);
    must(st.adminTools.length > 0, () => `tools/list answers the admin's tools`);
    return `${st.before.projects.length} active projects, ${st.before.people.length} people; the admin's tools/list holds ${st.adminTools.length} tools`;
  });

  step("a", "the admin invites a member on Control; the member's key and sign-in work; Connect shows this org's /mcp and the member connects there", async () => {
    st.member = await invite("Walk Member", `member-${stamp}@walk.local`, "member");
    const login = await req("POST", ROUTES.login, { body: { email: st.member.email, password: st.member.key, device: "live-walk" }, who: "member" });
    must(login.status === 200 && login.json && login.json.token, () => `POST /login with the member's email and key answers 200 and a session`);
    secrets.push(login.json.token);
    const who = await req("GET", ROUTES.whoami, { key: st.member.key, who: "member" });
    must(who.status === 200 && who.json && who.json.email === st.member.email && who.json.roleClass === "member", () => `GET /whoami with the member's key names them, role class member`);
    const ctl = await html(ROUTES.control, st.member.key, "member");
    const text = ctl.text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const cmd = /claude mcp add (\S+) --transport http (\S+) --header "Authorization: Bearer <your-key>"/.exec(text);
    st.clients = ["claude-code", "claude-connector", "chatgpt", "codex"].filter((c) => ctl.text.includes(`data-client-block="${c}"`));
    must(ctl.status === 200 && cmd && cmd[2] === `${BASE}/mcp`, () => `GET /control (the member's Connect) shows "claude mcp add <org> --transport http ${BASE}/mcp …"; it showed ${cmd ? cmd[2] : "no such command"}`);
    st.mcpUrl = cmd[2];
    const init = await rpc(st.member.key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "live-walk", version: "1" } }, "member");
    must(init.status === 200 && init.json && init.json.result && init.json.result.serverInfo, () => `initialize at ${st.mcpUrl} with the member's key answers serverInfo`);
    const tl = await rpc(st.member.key, "tools/list", {}, "member");
    st.memberTools = ((tl.json && tl.json.result && tl.json.result.tools) || []).map((t) => t.name);
    const { names, missing } = resolveTools({ admin: st.adminTools, member: st.memberTools });
    must(!missing.length, () => `every tool the walk calls is on its caller's tools/list; missing: ${missingLine(missing)}`);
    st.names = names;
    return `${st.member.email} invited (role member); POST /login 200; whoami names them; Connect shows "claude mcp add ${cmd[1]} --transport http ${cmd[2]}" (clients shown: ${st.clients.join(", ")}); the member's initialize answers and its tools/list (${st.memberTools.length}) holds every tool the walk needs`;
  });

  step("b", "the admin creates the project through the MCP (create_project) and seats the member on Control", async () => {
    const m = need("member", "a");
    const c = await tool(ownerKey, "createProject", { key: P, name: `Walk ${stamp}`, ...EV }, "admin");
    const got = (!c.isError && c.out.project && String(c.out.project.key || "")) || "";
    must(c.out && c.out.created === true && (got === P || got.endsWith(`--${P}`)),
      () => `create_project {key: ${P}} answers created: true with the key (bare in org 1, o<org>--${P} in another org; got: ${got || "none"})`);
    P = got;
    st.created = true;
    const seat = await control([["action", "grant-seat"], ["personId", m.id], ["projectKey", P]]);
    if (MARK) must(c.out.project && c.out.eval === true, () => `create_project {eval: true} marks the new project (eval: ${c.out.eval})`);
    must(seat.status === 200 && /Seat granted/.test(seat.text), () => `POST /control grant-seat answers "Seat granted."`);
    const who = await tool(m.key, "whoami", {}, "member");
    must(!who.isError && (who.out.projects || []).includes(P), () => `the member's whoami lists ${P} among their projects`);
    return `${P} created (next: ${(c.out.next || []).map((x) => x.id).join(", ")}); the member is seated on it (whoami: ${who.out.projects.join(", ")})`;
  });

  step("c", "the member starts as a client does: whoami, the checklist, formats", async () => {
    const m = need("member", "a"); need("created", "b");
    const who = await tool(m.key, "whoami", {}, "member");
    must(!who.isError && who.out.email === m.email, () => `whoami answers the member`);
    st.h0 = await holesOf(m.key, "member");
    must(st.h0.meter.done === 0 && (st.h0.items || []).length > 0 && st.h0.items.every((x) => x.fillPath && x.fillPath.tool), () => `the checklist on an empty project: nothing done, each open item with its fill call`);
    const f = await tool(m.key, "formats", {}, "member");
    const fr = await tool(m.key, "formats", { kind: "render" }, "member");
    must(!f.isError && (f.out.kinds || []).length && !fr.isError && fr.out.imageExample && fr.out.imageExample.data, () => `formats lists the kinds and formats {kind: render} answers an imageExample`);
    st.imageItem = fr.out.imageExample;
    // the checklist hands the member only calls the member may make: each open item's fill call, previewed AS GIVEN by the
    // member (its placeholders make it "needs"; nothing is written but one previews row each), must never be refused
    const refusedToMe = [];
    for (const h of st.h0.items) {
      if (!h.fillPath || h.fillPath.tool !== TOOLS.preview.name) continue;
      const pv = await tool(m.key, "preview", { ...h.fillPath.args, ...EV }, "member");
      const bad = ((pv.out && pv.out.items) || []).filter((x) => x.verdict === "refused");
      if (pv.isError || bad.length) refusedToMe.push(`${h.id}: ${pv.isError ? pv.out.error : bad.map((x) => (x.reasons || [])[0]).join(" / ")}`);
    }
    must(!refusedToMe.length, () => `every call the member's checklist offers is one the member may make; refused to the member: ${refusedToMe.join(" | ")}`);
    const theirs = (st.h0.others || []).map((x) => `${x.id} (${x.by}'s)`);
    must((st.h0.others || []).some((x) => x.id === "start-here" && x.by === "owner"), () => `the checklist names start-here as the owner's, with no call (others: ${JSON.stringify(st.h0.others || [])})`);
    const fq = await tool(m.key, "formats", { kind: "question" }, "member");
    must(!fq.isError && (fq.out.ownerOnly || []).some((x) => /decided/.test(x.what) && /open/.test(x.instead)), () => `formats {kind: question} says a decided question is the owner's and what to file instead`);
    return `whoami ${who.out.person}; checklist ${st.h0.meter.words || `${st.h0.meter.done} of ${st.h0.meter.total}`}, first: ${(st.h0.next || {}).id}, its ${st.h0.items.length} calls each one the member may make, not theirs: ${theirs.join(", ")}; formats: ${f.out.kinds.length} kinds, render's picture shape (${Object.keys(st.imageItem.data).join(", ")}), a decided question the owner's`;
  });

  step("d", "the member hands in real input of four kinds: a tiny repo, a product brief, a screenshot, a discussion", async () => {
    need("imageItem", "c");
    st.input = await inputItems({ imageItem: st.imageItem });
    const n = Object.fromEntries(Object.entries(st.input.items).map(([k, v]) => [k, v.length]));
    must(n.repo >= 10 && n.doc >= 4 && n.screenshot === 1 && n.discussion >= 2, () => `items from every input (repo, doc, screenshot, discussion)`);
    return `items built from tools/walk/fixtures/: repo ${n.repo} (${st.input.repo.screens.length} screens, ${st.input.repo.doors.length} doors, ${st.input.repo.tables.length} tables, ${st.input.repo.checks.length} checks), brief ${n.doc} (aim, ${st.input.brief.goals.length} goals, start-here), screenshot 1 (a ${readFileSync(join(FIXTURES, "screenshot-pricing.png")).length}-byte png), discussion ${n.discussion} (open and ruled)`;
  });

  step("e", "preview → the verdicts and the text → the preview page → file → every tab shows it → the meter moved", async () => {
    const m = need("member", "a"); const input = need("input", "d");
    const pv = await tool(m.key, "preview", { project: P, items: input.all, note: "From the Tea Shop repo, its brief, a screenshot and the pricing call.", ...EV }, "member");
    must(!pv.isError && /^P-/.test(pv.out.previewId || ""), () => `preview answers a previewId`);
    const verdicts = (pv.out.items || []).map((x) => x.verdict);
    const tally = verdicts.reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {});
    const notFiles = (pv.out.items || []).map((x, i) => ({ i, v: x.verdict, kind: input.all[i].kind, id: input.all[i].data.id || input.all[i].data.qid || input.all[i].data.path || input.all[i].data.screen || "", reasons: x.reasons, needs: x.needs })).filter((x) => x.v !== "files");
    st.previewText = pv.out.text || "";
    must(verdicts.length === input.all.length && typeof pv.out.text === "string" && pv.out.text.includes(pv.out.previewId), () => `one verdict per item and a text block naming the preview`);
    st.previewNotFiles = notFiles;
    const page = await html(ROUTES.previewPage.replace("{id}", pv.out.previewId), m.key, "member");
    must(page.status === 200 && /data-screen="preview"/.test(page.text), () => `GET /preview/${pv.out.previewId} opens (200) for the member`);
    // a refusal is followed the way its reason says, as a client would (and said in the step's line): a ruling the member
    // may not make is filed as an open question and the admin rules it; a doc only the owner writes is handed to the admin.
    // Anything else that does not file at once fails the step.
    const OPEN_IT = /file it with status "open"/, OWNERS = /only the owner writes it/;
    const odd = notFiles.filter((x) => !(x.v === "refused" && (x.reasons || []).some((r) => OPEN_IT.test(r) || OWNERS.test(r))));
    must(!odd.length, () => `every item files at once, or is refused with a reason that says what to do; not: ${JSON.stringify(odd.map((x) => [x.i, x.kind, x.id, x.v, x.reasons, x.needs && x.needs.field]))}`);
    st.reshaped = notFiles.map((x) => `${x.kind} ${x.id}: ${x.v} — "${(x.reasons || [])[0]}"`);
    const toAdmin = [], rulings = [];
    const mine = input.all.flatMap((it, i) => {
      const nf = notFiles.find((x) => x.i === i);
      if (!nf) return [it];
      if (nf.reasons.some((r) => OWNERS.test(r))) { toAdmin.push(it); return []; }
      const { status, choice, label, rationale, decidedBy, decidedAt, supersededBy, ...open } = it.data;
      rulings.push({ qid: it.data.qid, choice });
      return [{ ...it, data: { ...open, status: "open" } }];
    });
    let pvId = pv.out.previewId;
    if (notFiles.length) {
      const pv2 = await tool(m.key, "preview", { project: P, items: mine, note: "The same input; the ruling filed open for the admin, the start-here handed to the admin.", ...EV }, "member");
      const v2 = ((pv2.out && pv2.out.items) || []).filter((x) => x.verdict !== "files");
      must(!pv2.isError && pv2.out.previewId && !v2.length, () => `the re-shaped items all file at once; not: ${JSON.stringify(v2.map((x) => [x.verdict, x.reasons]))}`);
      pvId = pv2.out.previewId;
    }
    const f = await tool(m.key, "file", { previewId: pvId, items: mine }, "member");
    const filed = (f.out.items || []).map((x) => x.filed && x.filed.status);
    must(!f.isError && f.out.complete === true && filed.every((s) => s === "filed"), () => `file files every item (complete: true)`);
    st.filed = true;
    st.knowledgeLedger = ((f.out.items || []).find((x) => x.filed && /^T-/.test(String(x.filed.id || ""))) || {}).filed;
    if (toAdmin.length) {
      const a = await fileVia(ownerKey, toAdmin, "admin");
      must((a.f.items || []).every((x) => x.filed && x.filed.status === "filed"), () => `the admin files what only the owner writes (${toAdmin.map((x) => x.data.path || x.data.id).join(", ")})`);
    }
    for (const r of rulings) {
      const ru = await tool(ownerKey, "rule", { project: P, qid: r.qid, choice: r.choice, rationale: "ruled in the pricing call (the discussion)", ...EV }, "admin");
      must(!ru.isError && ru.out.status === "decided", () => `the admin rules ${r.qid} as the discussion did (choice ${r.choice})`);
    }
    // every face shows what was filed: the JSON twin carries the item, the page carries its title
    const g = input.brief.goals, pricing = input.repo.screens.find((s) => /pricing/.test(s.id)), openQ = input.items.discussion[0].data;
    const faces = [];
    const face = async (name, jsonPath, jsonHas, htmlPath, htmlHas) => {
      const j = await req("GET", jsonPath, { key: m.key, who: "member" });
      const h = await html(htmlPath, m.key, "member");
      const ok = j.status === 200 && h.status === 200 && jsonHas(j.json || {}, j.text) && (!htmlHas || htmlHas(h.text));
      faces.push(`${name} ${ok ? "✓" : "✗"}`);
      must(ok, () => `${name}: ${jsonPath} 200 carrying the item (${j.status}) and ${htmlPath} 200 carrying its title (${h.status})`);
    };
    const q = (p) => `${p}${p.includes("?") ? "&" : "?"}project=${P}${evq}`;
    await face("Home", q(ROUTES.homeSummary), (j) => j.aim && (j.aim.text || "").includes(input.brief.aim), q(ROUTES.home), (t) => t.includes(input.brief.aim));
    await face("Goals", q(ROUTES.goals), (j, t) => g.every((x) => t.includes(`"${x.id}"`)), q(ROUTES.goals), (t) => g.every((x) => t.includes(x.title)));
    await face("Decisions", q(ROUTES.decisions), (j, t) => t.includes(openQ.qid), q(ROUTES.decisions), (t) => t.includes(openQ.question));
    await face("Map", q(ROUTES.map), (j) => (j.nodes || []).some((n) => n.r === pricing.id), q(ROUTES.map), (t) => t.includes(pricing.name));
    await face("Screens", q(`${ROUTES.mapScreens}?surface=${input.repo.surface.key}`), (j) => (j.screens || []).some((x) => x.id === pricing.id && (x.renders || []).some((r) => r.format === "image" && /^[0-9a-f]{64}$/.test(r.hash || "") && (st.renderHash = r.hash))), q(`${ROUTES.mapScreens}?surface=${input.repo.surface.key}`), (t) => t.includes(pricing.name));
    const pic = await req("GET", `${ROUTES.render.replace("{hash}", st.renderHash)}?project=${P}`, { key: m.key, accept: "image/*", binary: true, who: "member" });
    must(pic.status === 200 && /^image\/png/.test(pic.type || "") && pic.bytes.equals(readFileSync(join(FIXTURES, "screenshot-pricing.png"))), () => `GET /render/<hash> serves the screenshot back, byte for byte (${pic.status} ${pic.type}, ${pic.bytes && pic.bytes.length} bytes)`);
    faces.push("the picture byte for byte ✓");
    await face("Library", q(ROUTES.library), (j, t) => t.includes("start-here.md"), q(ROUTES.library), (t) => t.includes('data-doc="start-here.md"'));
    await face("Build", q(`${ROUTES.build}?kind=knowledge`), (j) => (j.rows || []).some((r) => st.knowledgeLedger && r.id === st.knowledgeLedger.id), q(`${ROUTES.build}?kind=knowledge`), (t) => !st.knowledgeLedger || t.includes(st.knowledgeLedger.id));
    for (const [name, path] of [["GTM", ROUTES.gtm], ["Broadcast", ROUTES.broadcast]]) {
      const h = await html(q(path), m.key, "member");
      must(h.status === 200, () => `${name} answers 200`);
      faces.push(`${name} 200 (nothing of this input belongs there)`);
    }
    const h1 = await holesOf(m.key, "member");
    st.h1 = h1;
    must(h1.meter.done > st.h0.meter.done && (h1.meter.pct || 0) > (st.h0.meter.pct || 0), () => `the meter moved: ${st.h0.meter.done}/${st.h0.meter.total} (${st.h0.meter.pct}%) before`);
    return `${verdicts.length} items: ${JSON.stringify(tally)}${st.reshaped.length ? ` (followed as the door said: ${st.reshaped.join(" · ")})` : ""}; the page 200; filed complete; ${faces.join(" · ")}; meter ${st.h0.meter.done}/${st.h0.meter.total} ${st.h0.meter.pct ?? 0}% → ${h1.meter.done}/${h1.meter.total} ${h1.meter.pct}%`;
  });

  step("f", "the member answers the open question (respond); the admin rules it (rule_question); Decisions shows it decided at once", async () => {
    const m = need("member", "a"); need("filed", "e");
    const qid = st.input.items.discussion[0].data.qid, opts = st.input.items.discussion[0].data.options;
    const a = await tool(m.key, "respond", { project: P, qid, option: 0, ...EV }, "member");
    must(!a.isError && a.out.ruled !== true, () => `respond {qid: ${qid}, option: 0} files the member's answer, the question still open (it waits for the owner)`);
    const mid = await tool(m.key, "decisions", { project: P, qid }, "member");
    must(!mid.isError && mid.out.decision && mid.out.decision.status === "open", () => `decisions {qid} reads open after the member's answer`);
    const r = await tool(ownerKey, "rule", { project: P, qid, choice: 0, rationale: "the pricing call, as the member answered", ...EV }, "admin");
    must(!r.isError && r.out.status === "decided", () => `rule_question {qid: ${qid}, choice: 0} answers decided`);
    const d = await tool(m.key, "decisions", { project: P, qid }, "member");
    must(!d.isError && d.out.decision && d.out.decision.status === "decided" && d.out.decision.label === opts[0].what, () => `the member's very next decisions read shows ${qid} decided "${opts[0].what}"`);
    const page = await html(`${ROUTES.question.replace("{qid}", qid)}?project=${P}`, m.key, "member");
    must(page.status === 200 && page.text.includes(opts[0].what), () => `GET /question/${qid} (the member) 200 naming the ruling`);
    return `${qid}: the member answered A (still open, waiting on the owner), the admin ruled A; decisions and the question's page show decided "${opts[0].what}" on the next read`;
  });

  step("g", "the member grades one check with proof (submit_grade): graded on its goal, and its Map node's light turns", async () => {
    const m = need("member", "a"); need("filed", "e");
    const ck = st.input.repo.checks[0], ref = ck.refs[0], goal = ck.refs[1];
    const before = await light(m.key, ref, "member");
    const g = await tool(m.key, "grade", { project: P, checkId: ck.id, verdict: "proven", proof: "node --test tests/pricing.test.js -> 2 passing, 0 failing", ...EV }, "member");
    must(!g.isError && g.out.counted !== false, () => `submit_grade {${ck.id}, proven, with proof} counts`);
    const after = await light(m.key, ref, "member");
    must(before.state !== "green" && after.state === "green", () => `${ref}'s light turns green (was ${before.state}, now ${after.state})`);
    const gj = await req("GET", `${ROUTES.goal.replace("{ref}", goal)}?project=${P}${evq}`, { key: m.key, who: "member" });
    const gt = JSON.stringify(gj.json || {});
    const checksOn = (gj.json && (gj.json.checks || (gj.json.node && gj.json.node.checks))) || null;
    must(gj.status === 200 && checksOn && Number(checksOn.passed || 0) >= 1, () => `GET /goals/${goal} (its JSON twin) counts the check passed; it answered checks ${JSON.stringify(checksOn)} (${gt.slice(0, 200)})`);
    st.graded = { id: ck.id, ref, goal };
    return `${ck.id} proven with proof; ${ref}: ${before.state} → ${after.state}; goal ${goal}: checks ${JSON.stringify(checksOn)}`;
  });

  step("h", "the member files a CHANGE touching the graded node: its Impact shows what it reaches, the grade goes STALE, the regrade makes it fresh", async () => {
    const m = need("member", "a"); const gr = need("graded", "g");
    const patch = readPatch();
    const screens = patch.files.map((f) => st.input.repo.fileToScreen[f]).filter(Boolean);
    must(screens.includes(gr.ref), () => `the patch changes ${gr.ref}'s page (files: ${patch.files.join(", ")})`);
    const contribution = { lane: "code", kind: "pr", what: patch.what, why: patch.why, touches: screens, proof: patch.proof, goalRef: gr.goal,
      source: [{ kind: "commit", ref: patch.commit, label: "change.patch" }], next: { what: patch.next, who: "", by: inTwoDays } };
    contribution.next.who = st.adminEmail || (st.adminEmail = ((await req("GET", ROUTES.whoami, { key: ownerKey, who: "admin" })).json || {}).email);
    const { f } = await fileVia(m.key, [{ contribution }], "member");
    const id = ((f.items || [])[0] || {}).filed && f.items[0].filed.id;
    must(/^T-\d{8}-\d+$/.test(id || "") && f.items[0].filed.status === "filed", () => `the change files at once with a contribution id`);
    st.change = id;
    const imp = await req("GET", ROUTES.impactView.replace("{id}", id), { key: m.key, who: "member" });
    const i = imp.json || {};
    const reached = ((i.reached && i.reached.names) || []).map((n) => n.id);
    const redo = ((i.proof && i.proof.toRedo) || []).map((c) => c.id);
    must(imp.status === 200 && reached.some((r) => r.startsWith("door:")) && redo.includes(gr.id), () => `GET /contribution/${id}/impact reaches the door the screen calls and asks to redo ${gr.id}; reached ${JSON.stringify(reached)}, to redo ${JSON.stringify(redo)}`);
    const page = await html(ROUTES.impactView.replace("{id}", id), m.key, "member");
    must(page.status === 200 && page.text.includes(`data-check="${gr.id}" data-state="stale"`), () => `the Impact page shows ${gr.id} stale`);
    const stale = await light(m.key, gr.ref, "member");
    const h = await holesOf(m.key, "member");
    const gi = item(h, "grades");
    must(stale.stale && Number(stale.stale.count) >= 1 && gi && /stale/.test(gi.what || "") && gi.first && gi.first.id === gr.id, () => `the light is stale (${JSON.stringify(stale.stale)}) and the checklist asks for ${gr.id}'s regrade first (${gi && gi.what})`);
    const g2 = await tool(m.key, "grade", { project: P, checkId: gr.id, verdict: "proven", proof: patch.proof, ...EV }, "member");
    must(!g2.isError, () => `the regrade counts`);
    const fresh = await light(m.key, gr.ref, "member");
    const h2 = await holesOf(m.key, "member");
    const gi2 = item(h2, "grades");
    must(fresh.state === "green" && !fresh.stale && !(gi2 && /stale/.test(gi2.what || "")), () => `after the regrade: green and fresh (${fresh.state}, ${JSON.stringify(fresh.stale)}), the checklist no longer stale (${gi2 && gi2.what})`);
    return `${id} "${patch.what}": reaches ${reached.join(", ")}; ${redo.length} to redo (${redo.join(", ")}); ${gr.ref} stale (${stale.stale.count}), checklist "${gi.what}"; regraded: green, fresh`;
  });

  step("i", "carry-forward: the change names a next action; the ADMIN takes it (pick_up), the handoff; Home's follow-ups show it", async () => {
    const id = need("change", "h");
    const due = await req("GET", `${ROUTES.homeSummary}?project=${P}${evq}`, { key: ownerKey, who: "admin" });
    const fu = (((due.json || {}).followUps || {}).rows || []).find((r) => r.id === id);
    must(due.status === 200 && fu && fu.mine === true, () => `the admin's Home lists ${id} under Follow-ups due as theirs`);
    const p = await tool(ownerKey, "pickUp", { id }, "admin");
    must(!p.isError && p.out.pickedUp && p.out.handedOver === true, () => `pick_up {id: ${id}} by the admin answers pickedUp with handedOver: true (a pick-up by someone other than the contributor)`);
    const c = await req("GET", `${ROUTES.contribution.replace("{id}", id)}`, { key: st.member.key, who: "member" });
    const after = await req("GET", `${ROUTES.homeSummary}?project=${P}${evq}`, { key: ownerKey, who: "admin" });
    const still = (((after.json || {}).followUps || {}).rows || []).find((r) => r.id === id);
    const pageH = await html(`${ROUTES.contribution.replace("{id}", id)}?page=1`, st.member.key, "member");
    must(c.status === 200 && pageH.status === 200 && /Picked up by/.test(pageH.text) && !still, () => `the contribution's page says "Picked up by" (${pageH.status}) and it left the follow-ups due`);
    return `Home (admin): ${id} due ${fu.by}, theirs; the admin picked it up (handedOver: true); its page says picked up; it left the due list`;
  });

  step("j", "extract: search finds what was filed, read returns it, changes lists the change with its reach, brief answers for the member's hat", async () => {
    const m = need("member", "a"); const id = need("change", "h");
    const goal = st.input.brief.goals.find((x) => /annual/.test(x.id));
    const s = await tool(m.key, "search", { project: P, q: "annual", ...EV }, "member");
    const refs = ((s.out && s.out.groups) || []).flatMap((x) => (x.hits || []).map((h) => h.ref));
    must(!s.isError && refs.includes(`goal/${goal.id}`) && refs.includes(id), () => `search "annual" finds goal/${goal.id} and ${id}; it found ${JSON.stringify(refs)}`);
    const r1 = await tool(m.key, "read", { project: P, ref: `goal/${goal.id}`, ...EV }, "member");
    const r2 = await tool(m.key, "read", { project: P, ref: id, ...EV }, "member");
    const rl = await tool(m.key, "read", { project: P, kind: "contribution", ...EV }, "member");
    must(!rl.isError && (rl.out.items || []).some((x) => x.id === id), () => `read {kind: contribution} lists ${id}`);
    must(!r1.isError && r1.out.item && r1.out.item.id === goal.id && !r2.isError && r2.out.kind === "contribution", () => `read returns the goal and the contribution by their refs`);
    const c = await tool(m.key, "changes", { project: P, ...EV }, "member");
    const ch = ((c.out && c.out.changes) || []).find((x) => x.id === id);
    must(!c.isError && ch && ch.reaches && (ch.reaches.first || []).some((x) => String(x).startsWith("door:")), () => `changes lists ${id} with what it reaches`);
    const prof = await req("POST", ROUTES.profile, { key: m.key, body: { action: "set-profile", hats: ["engineering"], ...EV }, who: "member" });
    must(prof.status === 200, () => `the member puts on the engineering hat (POST /profile set-profile)`);
    const b = await tool(m.key, "brief", { project: P, for: "engineering", ...EV }, "member");
    must(!b.isError && b.out.hat && b.out.hat.key === "engineering" && (b.out.goals || []).length >= 1, () => `brief {for: engineering} answers the hat's packet with its goals`);
    return `search "annual": ${refs.length} hits incl. goal/${goal.id} and ${id}; read both; changes: ${id} ${ch.reaches.line || JSON.stringify(ch.reaches.first)}; brief engineering: ${b.out.goals.length} goals`;
  });

  step("k", "authority: what must be refused is refused (anonymous, a Partner seated nowhere, a member ruling, a read-only credential)", async () => {
    const m = need("member", "a"); need("filed", "e");
    const out = [];
    const anon = await req("GET", `${ROUTES.homeSummary}?project=${P}`, { who: "anonymous script" });
    const anonMcp = await req("POST", "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: st.names.search, arguments: { project: P, q: "annual" } } }, who: "anonymous script" });
    const nav = await req("GET", `${ROUTES.home}?project=${P}`, { accept: "text/html", headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }, who: "anonymous browser" });
    must(anon.status === 401 && (anonMcp.status === 401 || (anonMcp.json && anonMcp.json.error)) && nav.status === 302 && /\/login/.test(nav.location || ""), () => `anonymous: a script 401 on GET /home/summary (${anon.status}), /mcp refused (${anonMcp.status}), a browser navigation 302 to /login (${nav.status} ${nav.location})`);
    out.push(`anonymous: script 401, /mcp ${anonMcp.status}, navigation 302 /login`);
    st.partner = await invite("Walk Partner", `partner-${stamp}@walk.local`, "partner");
    // seated NOWHERE: an add-person naming no project never seats a Partner (sprint 3 S3b; a member alone keeps ADR-100's
    // sole-project seat), so Control must list no seat for them; any seat found is taken back and said
    const pq = MARK ? "?eval=1" : "";
    const given = ((((await people(pq)).people || []).find((x) => x.id === st.partner.id) || {}).seats || []).map((x) => x.project || x.key);
    for (const k of given) await control([["action", "revoke-seat"], ["personId", st.partner.id], ["projectKey", k]]);
    const seatsNow = ((((await people(pq)).people || []).find((x) => x.id === st.partner.id) || {}).seats || []);
    must(!seatsNow.length, () => `the Partner holds no seat after revoke-seat (${JSON.stringify(seatsNow)})`);
    st.partnerAutoSeated = given;
    const pz = st.partner.key, refused = [];
    // the eval switch widens nothing: the Partner passing it is refused the same
    for (const [role, args] of [["search", { q: "annual", eval: true }], ["read", { ref: `goal/${st.input.brief.goals[0].id}`, eval: true }], ["changes", { eval: true }], ["brief", { for: "engineering", eval: true }], ["checklist", {}], ["decisions", {}]]) {
      const r = await tool(pz, role, { project: P, ...args }, "partner seated nowhere");
      refused.push(`${st.names[role]} ${r.isError ? r.out.error : "ANSWERED"}`);
      must(r.isError && /forbidden|not_found/.test(r.out.error || ""), () => `the Partner seated nowhere is refused ${st.names[role]} on ${P}`);
    }
    const ph = await req("GET", `${ROUTES.homeSummary}?project=${P}`, { key: pz, who: "partner seated nowhere" });
    must(ph.status === 403 || ph.status === 404, () => `the Partner seated nowhere: GET /home/summary?project=${P} refused (${ph.status})`);
    const pm = await req("GET", ROUTES.measures, { key: pz, who: "partner seated nowhere" });
    must(pm.status === 403 && pm.json && pm.json.error === "owner_only", () => `the Partner is refused the beta measures (${pm.status} ${pm.json && pm.json.error})`);
    out.push(`partner seated nowhere${st.partnerAutoSeated.length ? ` (had a seat on ${st.partnerAutoSeated.join(", ")}; revoked)` : " (add-person seated them nowhere)"}: ${refused.join(", ")} (the read tools with eval: true), GET /home/summary ${ph.status}, GET /control/measures ${pm.status}`);
    const openQ = st.input.items.discussion.find((x) => x.data.status === "open" && x.data.qid !== st.input.items.discussion[0].data.qid);
    const mr = await tool(m.key, "rule", { project: P, qid: openQ.data.qid, choice: 0, ...EV }, "member");
    const still = await tool(m.key, "decisions", { project: P, qid: openQ.data.qid }, "member");
    must(mr.isError && still.out.decision && still.out.decision.status === "open", () => `a member's rule_question on ${openQ.data.qid} is refused and it stays open`);
    out.push(`member rules: ${mr.out.error || brief(mr.out, 80)}, ${openQ.data.qid} still open`);
    const ro = readOnlyOf(m.key);
    const roPv = await req("POST", ROUTES.previewPost, { key: ro, body: { project: P, items: [{ contribution: { lane: "leader", kind: "note", what: "a read-only write", why: "the walk's probe" } }], ...EV }, who: "member read-only" });
    const roFile = await req("POST", ROUTES.filePost, { key: ro, body: { previewId: "P-0000000000000000", items: [{ contribution: { lane: "leader", kind: "note", what: "a read-only write", why: "the walk's probe" } }] }, who: "member read-only" });
    const roMcp = await req("POST", "/mcp", { key: ro, body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: st.names.file, arguments: { previewId: "P-0000000000000000", items: [] } } }, who: "member read-only" });
    const roMcpRefused = roMcp.status === 401 || roMcp.status === 403 || (roMcp.json && (roMcp.json.error || (roMcp.json.result && roMcp.json.result.isError)));
    must(roPv.status === 200 && roPv.json && roPv.json.previewId === null && (roPv.json.items || []).every((x) => x.verdict === "refused") && roFile.status === 403 && roFile.json && roFile.json.error === "read_only_credential" && roMcpRefused,
      () => `the member's read-only credential: preview stores nothing and refuses every item (${roPv.status}), POST /file 403 read_only_credential (${roFile.status}), /mcp file refused (${roMcp.status})`);
    out.push(`read-only: preview stores nothing (every item refused), POST /file 403 read_only_credential, /mcp ${roMcp.status}`);
    return out.join("; ");
  });

  // ---- the org's plan, read before anything is written (8.5: walkPlanRefusal above) ----
  {
    const w = await req("GET", ROUTES.whoami, { key: ownerKey, who: "admin" });
    const why = w.status === 200 && w.json ? walkPlanRefusal(w.json.plan) : "";
    if (why) { console.error(`✗ the walk does not run (nothing written): ${why}`); process.exit(2); }
  }
  // ---- run ----
  let failed = 0;
  const print = (ok, s, detail) => console.log(`${ok ? "✓" : "✗"} ${s.id} · ${s.name}${detail ? ` — ${detail}` : ""}`);
  console.log(`live walk · ${BASE} · throwaway project ${P}${MARK ? " · marked: an eval project, eval people, every write eval-marked, every read with the eval switch" : " · unmarked (a member's own path; the rows stay on the archived project)"}`);
  try {
    for (const s of STEPS) {
      cur = { id: s.id, name: s.name, calls: [], rows: { read: 0, written: 0 } };
      transcript.steps.push(cur);
      try { const d = await s.fn(); cur.ok = true; cur.detail = red(d || ""); print(true, s, cur.detail); }
      catch (e) {
        failed++; cur.ok = false;
        const exp = e instanceof Expected ? e.message : `the step threw: ${String(e && e.message || e)}`;
        cur.failure = red({ call: last && last.call, status: last && last.status, answer: last && last.answer, expected: exp });
        print(false, s, `expected: ${red(exp)}`);
        if (last && !/^not run/.test(exp)) console.log(`      call:   ${red(last.call)} → ${last.status}\n      answer: ${brief(last.answer, 700)}`);
      }
    }
  } finally {
    cur = { id: "l", name: "clean-up: the walk's knowledge removed, the project archived, the people removed; the org as it was found", calls: [], rows: { read: 0, written: 0 } };
    transcript.steps.push(cur);
    try {
      if (KEEP) {
        cur.ok = true; cur.detail = `--keep: ${P} and ${[st.member, st.partner].filter(Boolean).map((p) => p.email).join(", ") || "no one"} left in place`;
        print(true, cur, cur.detail);
      } else {
        const notes = [];
        if (st.created && st.input) {
          // the knowledge the walk filed, removed (contributions, grades and the ledger are append-only and stay, on the archived project)
          const rm = [...st.input.all].reverse().map((x) => {
            const d = x.data;
            const key = x.kind === "render" ? { screen: d.screen, ...(d.state !== undefined ? { state: d.state } : {}), ...(d.variant !== undefined ? { variant: d.variant } : {}) }
              : x.kind === "edge" ? { from: d.from, to: d.to, kind: d.kind } : x.kind === "question" ? { qid: d.qid } : x.kind === "doc" ? { path: d.path } : x.kind === "aim" ? {} : { id: d.id };
            return { kind: x.kind, op: "remove", data: key };
          });
          try {
            const pv = await tool(ownerKey, "preview", { project: P, items: rm, ...EV }, "admin");
            const f = pv.out && pv.out.previewId ? await tool(ownerKey, "file", { previewId: pv.out.previewId, items: rm, only: "ready" }, "admin") : null;
            const left = (f && f.out && f.out.items || []).filter((x) => !(x.filed && /filed|unchanged/.test(x.filed.status))).length;
            notes.push(f && !f.isError ? `${rm.length - left} of ${rm.length} knowledge items removed` : `the knowledge removal was refused (${brief(pv.out || (f && f.out), 200)})`);
          } catch (e) { notes.push(`the knowledge removal failed: ${String(e.message || e).slice(0, 200)}`); }
        }
        if (st.created) {
          const a = await control([["action", "archive-project"], ["projectKey", P]]);
          notes.push(/archived/.test(a.text) ? `${P} archived` : `archive-project answered ${a.status} without "archived"`);
        }
        for (const p of [st.member, st.partner].filter(Boolean)) {
          const r = await control([["action", "remove-person"], ["personId", p.id]]);
          notes.push(r.status === 200 && !/Nothing done/.test(r.text) ? `${p.email} removed` : `remove-person ${p.email}: ${r.status}`);
        }
        // D6: their platform accounts (their seats now inactive), removed on the deployment's D1 when --operator-config names it
        let accountsGone = true;
        if (OPS) for (const p of [st.member, st.partner].filter(Boolean)) {
          let r;
          try { r = await OPS.removeAccount(OPS.DB, p.email); } catch (e) { r = { refused: String((e && e.message) || e).slice(0, 200) }; }
          if (r.refused) { accountsGone = false; notes.push(`${p.email}'s account NOT removed: ${r.refused}`); }
          else notes.push(`${p.email}'s account removed from ${OPS.database}`);
        }
        let swept = true, measuresSame = true;
        if (MARK) {
          // Control's clean-eval: the marked rows, and the archived eval project swept of what it held (its grades stay)
          const ce = await control([["action", "clean-eval"]]);
          const fl = (/Eval residue cleaned[^<]*/.exec(ce.text) || [""])[0].replace(/\s+/g, " ").trim();
          swept = /eval projects [1-9]/.test(fl);
          notes.push(`clean-eval: ${fl || `answered ${ce.status} with no count`}`);
          // Control's default read (what the admin sees without asking for more): no walk project, no walk person
          const def = await people();
          const walkers = [st.member, st.partner].filter(Boolean);
          const shown = [...(def.workspaces || []), ...(def.archived || [])].some((x) => x.key === P) || (def.people || []).some((x) => walkers.some((p) => p.id === x.id));
          const all = await people("?all=1");
          const asked = [...(all.workspaces || []), ...(all.archived || [])].filter((x) => x.key === P).length + (all.people || []).filter((x) => walkers.some((p) => p.id === x.id)).length;
          notes.push(`what stays: ${P} (archived, eval-marked), ${walkers.length} people (archived, eval-fixed-*), the grades it filed (check_results is never removed) and the marked filings they point at; Control's default lists ${shown ? "SHOW some of it" : "show none of it"}; its Show all (?all=1) lists ${asked} of them, archived`);
          if (shown) swept = false;
          measuresSame = st.measures0 === (await measuresNow());
          notes.push(`the beta measures ${measuresSame ? "did not move" : "MOVED"}`);
        }
        const after = { projects: await projectsNow(), people: await peopleNow() };
        const same = swept && measuresSame && accountsGone && st.before && JSON.stringify(after.projects) === JSON.stringify(st.before.projects) && JSON.stringify(after.people) === JSON.stringify(st.before.people);
        cur.ok = !!same;
        cur.detail = red(`${notes.join("; ")}; projects ${st.before ? st.before.projects.length : "?"} → ${after.projects.length}, people ${st.before ? st.before.people.length : "?"} → ${after.people.length}${same ? " (as found)" : " — NOT as found"}`);
        if (!same) { failed++; cur.failure = red({ expected: "the active projects and people as the walk found them", before: st.before, after }); }
        print(!!same, cur, cur.detail);
      }
    } catch (e) {
      failed++; cur.ok = false; cur.failure = red({ call: last && last.call, answer: last && last.answer, expected: String(e.message || e) });
      print(false, cur, `the clean-up threw: ${red(String(e.message || e))}`);
    }
    const total = STEPS.length + 1;
    transcript.finishedAt = new Date().toISOString();
    transcript.passed = total - failed; transcript.total = total;
    console.log(`rows (Server-Timing d1-rows, summed over ${totals.metered} of ${totals.requests} requests): read ${totals.read}, written ${totals.written}, ${totals.stmts} statements${totals.unknown ? `, ${totals.unknown} unmetered statements` : ""}`);
    console.log(`${failed ? "✗" : "✓"} live walk: ${total - failed} of ${total} steps passed on ${new URL(BASE).host}`);
    if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(red(transcript), null, 1)); console.log(`transcript: ${JSON_OUT}`); }
    process.exitCode = failed ? 1 : 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
