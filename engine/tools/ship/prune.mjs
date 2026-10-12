#!/usr/bin/env node
// tools/ship/prune.mjs — what a project's database holds that this build no longer files, as a PLAN a person reads, and (only
// from a reviewed plan) its removal through the door (S4, 2026-10-02; the contract rewritten by G2 H3, the independent review:
// the old --apply removed every stored-not-built row, people's own filings and whatever a missing input left out of the build).
//
//   PLAN (read-only):  node tools/ship/prune.mjs <source-dir | -> --project <key> --url <worker> --plan <out.json>
//                        [--renders <f>] [--overlay <a,b>] [--layout <l>] [--only <kind,kind>] [--rulings <f>]
//   APPLY:             node tools/ship/prune.mjs --apply <plan.json> [--url <worker>] [--only goal | --except goal] [--max <n>]
// The key goes in SHARINGU_IMPORT_KEY (never an argument), and it is the IMPORT's key: the plan names what that identity made.
//
// THE PLAN builds the import exactly as tools/import-brain.mjs does (import/read.mjs readSource, the layout's own build, the
// overlays folded by import/overlay.mjs) — and REFUSES (exit 2, nothing read) when an input it names is missing: the source
// directory, an overlay file, the renders file. It reads every stored item of every kind with `read` (paged, 100 a page,
// with who made and last changed each), the project's knowledge ledger (every row's clientRef and touches, `read` by id), and
// applies THE RULE (tools/ship/prune-plan.mjs): a stale item (stored, not built) is removed only when the import's own
// identity made it and last changed it and no write that was not an import ever touched it — or when an owner's ruling
// (tools/ship/prune-rulings.json) names it and no such write touched it. Everything else is KEPT and listed with its reason.
// It writes the plan (by kind and ref, each with why; never an item's content) and prints the counts.
// A source of `-` is a project filed from its overlays alone (import/read.mjs NO_SOURCE, the demo): the build is the overlays.
// A project the door does not hold yet (its read answers project_forbidden to the owner's key: its first import creates it)
// stores nothing, so its plan removes nothing.
// Exit: 0 nothing to remove · 3 the plan lists removals (nothing removed) · 1 a read failed · 2 usage, or an input missing.
//
// THE APPLY reads the plan, refuses when the key is not the plan's identity or when it removes more than the cap (--max,
// default 3000: read the plan, then raise it), re-reads each kind it names and removes ONLY the items that still stand as
// the plan read them (stored, last changed at the same moment by the same person); one changed since is left and said. It
// files `remove` items through preview then file, one kind at a time in the door's safe order (renders and styles, edges,
// checks, cards, card kinds, docs, questions, goals, nodes); the goals in ONE call that first upserts the build's own goals
// (the plan carries them), so the tree keeps one root and no orphan at every step. Batches of <= 200 ops, a stable clientRef
// per batch (a re-run replays). --only goal / --except goal split the goals from the rest (tools/import-live.sh removes the
// old goal tree before a project's import and the rest after it). It stops at the first refusal.
// Exit: 0 done (or nothing left to do) · 1 a refusal or a read that failed · 2 usage, a bad plan, the wrong key or over the cap.
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(join(ENGINE, p));
const { mcpClient, pageOf, readPage, fileOps } = await imp("tools/import/door.mjs");
const { keyString, KINDS } = await imp("src/knowledge/schema.js");
const { planPrune, verifyForApply, batchAtOf, ORDER, ONE_ROW, DEFAULT_MAX } = await imp("tools/ship/prune-plan.mjs");

const argv = process.argv.slice(2);
const flag = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const die = (code, msg) => { console.error(msg); process.exit(code); };
const key = process.env.SHARINGU_IMPORT_KEY;
if (!key) die(2, "prune: the key goes in SHARINGU_IMPORT_KEY (never an argument)");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);

// whoami -> the key's person id (the import identity)
async function identityOf(client) {
  const w = await client.tool("whoami", {});
  if (!w.ok || !w.out || !w.out.id) die(1, `prune: whoami failed: ${JSON.stringify(w.out).slice(0, 200)}`);
  return w.out.id;
}
// storedOf(client, project, kinds) -> { kind: [{ key, data, item }] } (every page of `read`)
async function storedOf(client, project, kinds) {
  const out = {};
  for (const kind of kinds) {
    const list = [];
    let cursor = null, guard = 0;
    for (;;) {
      const r = await readPage(client, project, kind, cursor);
      if (!r.ok) die(1, `  ✗ read ${kind} failed: ${JSON.stringify(r.out).slice(0, 200)}`);
      const items = (r.out && (r.out.items || r.out.rows)) || [];
      for (const it of items) list.push({ key: keyString(kind, it), data: Object.fromEntries(KINDS[kind].key.map((c) => [c.f, it[c.f]])), item: it });
      const p = pageOf(r.out);
      if (!p.next || p.next === cursor || ++guard > 10_000) break;
      cursor = p.next;
    }
    out[kind] = list;
  }
  return out;
}
// ledgerOf(client, project) -> every knowledge ledger row of the project (eval-marked ones too): { id, submitter, clientRef, touches, at }
// at: the row's batch moment (its grade's batchAt: the moment the knowledge door stamped on every row of that write, sprint 7's
// review C3), else its created_at (a row filed before)
async function ledgerOf(client, project) {
  const ids = [];
  let after = null;
  for (let page = 0; page < 2000; page++) {
    const r = await client.tool("read", { project, kind: "contribution", limit: 100, eval: true, ...(after ? { after } : {}) });
    if (!r.ok) die(1, `  ✗ read the ledger failed: ${JSON.stringify(r.out).slice(0, 200)}`);
    for (const it of (r.out && r.out.items) || []) if (it.kind === "knowledge") ids.push(it.id);
    if (!r.out || !r.out.next) break;
    after = r.out.next;
  }
  const rows = [];
  for (const id of ids) {
    const r = await client.tool("read", { project, ref: id });
    if (!r.ok || !r.out || !r.out.item) die(1, `  ✗ read ${id} failed: ${JSON.stringify(r.out).slice(0, 200)}`);
    const t = r.out.item;
    rows.push({ id, submitter: t.submitter, clientRef: t.client_ref ?? null, touches: t.touches || "", at: batchAtOf(t.grade) || t.created_at });
  }
  return rows;
}

if (flag("--apply")) {
  // ---- APPLY: only what a reviewed plan names, only while it stands as read ----
  const planPath = resolve(flag("--apply"));
  let plan;
  try { plan = JSON.parse(readFileSync(planPath, "utf8")); } catch (e) { die(2, `prune: the plan ${planPath} does not read (${e.message})`); }
  const url = (flag("--url") || plan.url || "").replace(/\/+$/, "");
  if (!url) die(2, "prune: no --url and the plan names none");
  const max = flag("--max") ? Number(flag("--max")) : DEFAULT_MAX;
  const only = flag("--only"), except = flag("--except");
  const client = mcpClient(url, key);
  const identity = await identityOf(client);
  const kinds = Object.keys(plan.remove || {}).filter((k) => (!only || only.split(",").includes(k)) && (!except || !except.split(",").includes(k)));
  const stored = await storedOf(client, plan.project, kinds);
  const current = Object.fromEntries(kinds.map((k) => [k, new Map(stored[k].map((s) => [s.key, s.item]))]));
  const scoped = { ...plan, remove: Object.fromEntries(kinds.map((k) => [k, plan.remove[k]])) };
  const v = verifyForApply(scoped, current, { identity, max });
  if (!v.ok) die(2, `prune: REFUSED: ${v.refusal}. Nothing was removed.`);
  for (const c of v.changed) console.log(`  · left: ${c.kind} ${c.key} — ${c.why}`);
  let total = 0;
  for (const kind of ORDER) {
    const list = v.go[kind];
    if (!list || !list.length) continue;
    const size = kind === "goal" ? Math.max(200, list.length) : 200;
    for (let i = 0; i < list.length; i += size) {
      let batch = list.slice(i, i + size).map((x) => ({ kind, op: "remove", data: x.data }));
      if (kind === "goal") batch = [...(plan.goalUpserts || []).map((data) => ({ kind: "goal", op: "upsert", data })), ...batch];
      const clientRef = "prune-" + createHash("sha256").update(plan.project + "\n" + JSON.stringify(batch)).digest("hex").slice(0, 24);
      const r = await fileOps(client, { project: plan.project, ops: batch, clientRef });
      if (!r.ok) die(1, `  ✗ REFUSED removing ${batch.length} ${kind}(s) (${clientRef}): ${JSON.stringify(r.out).slice(0, 400)}`);
      const rm = batch.filter((o) => o.op === "remove").length, up = batch.length - rm;
      total += rm;
      console.log(`  removed ${String(rm).padStart(4)} ${kind}(s)${up ? ` (in one call with the build's ${up} ${kind}(s) upserted first)` : ""}  ${r.replay ? "(replay)" : ""}`);
    }
  }
  console.log(`  ✓ ${total} item(s) removed through the door, as the plan ${planPath} names${v.changed.length ? `; ${v.changed.length} left (changed since the plan)` : ""}`);
  process.exit(0);
}

// ---- PLAN: read-only ----
const dir = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
const project = flag("--project"), url = (flag("--url") || "").replace(/\/+$/, ""), out = flag("--plan");
if (!dir || !project || !url || !out) die(2, "usage: node tools/ship/prune.mjs <source-dir> --project <key> --url <worker> --plan <out.json> [--renders f] [--overlay a,b] [--layout l] [--only kinds] [--rulings f]\n       node tools/ship/prune.mjs --apply <plan.json> [--url <worker>] [--only goal | --except goal] [--max n]");
if (argv.includes("--apply")) die(2, "prune: --apply takes the plan file it removes from");
// every input the build names must be on this machine: a missing one would shrink the build, and the plan would list as
// stale what the input files (G2 H3: a missing overlay or renders file once meant mass removal)
const missing = [];
if (dir !== "-" && (!existsSync(dir) || !statSync(dir).isDirectory())) missing.push(`source ${dir}`);
const ovs = (flag("--overlay") || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const o of ovs) if (!existsSync(o)) missing.push(`overlay ${o}`);
if (flag("--renders") && !existsSync(flag("--renders"))) missing.push(`renders ${flag("--renders")}`);
if (argv.includes("--renders") && !flag("--renders")) missing.push("renders (named with no file)");
if (missing.length) die(2, `prune: REFUSED, an input is not on this machine: ${missing.join("; ")}. Nothing was read; the plan was not written.`);
const { readSource } = await imp("tools/import/read.mjs");
const { buildImport } = await imp("tools/import/build.mjs");
const { readOverlay, applyOverlays } = await imp("tools/import/overlay.mjs");
const src = readSource(dir, { layout: flag("--layout") || null, renders: flag("--renders") });
let ops = (src.built || buildImport(src)).ops;
if (ovs.length) ops = applyOverlays(ops, ovs.map((p) => ({ path: resolve(p), ops: readOverlay(p) }))).ops;
const built = new Map();
for (const o of ops) { if (!built.has(o.kind)) built.set(o.kind, new Set()); built.get(o.kind).add(keyString(o.kind, o.data)); }
const only = flag("--only") ? flag("--only").split(",").map((x) => x.trim()) : null;
const kinds = ORDER.filter((k) => KINDS[k] && !ONE_ROW.has(k) && (!only || only.includes(k)));
const rulingsPath = flag("--rulings") || join(ENGINE, "tools/ship/prune-rulings.json");
let rulings = [];
try { rulings = (JSON.parse(readFileSync(rulingsPath, "utf8")).rulings) || []; } catch (e) { die(2, `prune: the rulings ${rulingsPath} do not read (${e.message})`); }

const client = mcpClient(url, key);
const identity = await identityOf(client);
// a project the org does not hold yet stores nothing and has no ledger (the import that follows creates it)
const probe = await readPage(client, project, "aim", null, 1);
const absent = !probe.ok && probe.out && probe.out.error === "project_forbidden";
const stored = absent ? Object.fromEntries(kinds.map((k) => [k, []])) : await storedOf(client, project, kinds);
const ledger = absent ? [] : await ledgerOf(client, project);
const inputs = { source: dir, overlays: ovs.map((p) => ({ path: p, sha: sha(p) })), ...(flag("--renders") ? { renders: { path: flag("--renders"), sha: sha(flag("--renders")) } } : {}), rulings: { path: rulingsPath, sha: sha(rulingsPath) } };
const plan = planPrune({ project, identity, stored, built, ledger, rulings, inputs, url });
plan.goalUpserts = ops.filter((o) => o.kind === "goal").map((o) => o.data);
writeFileSync(resolve(out), JSON.stringify(plan, null, 1) + "\n");
const line = (m, k) => (m[k] || []).slice(0, 3).map((x) => x.key).join(", ");
console.log(`prune plan · ${project} · ${url}: ${plan.counts.remove} to remove, ${plan.counts.kept} kept (stored, not built); the plan: ${resolve(out)}`);
if (absent) console.log(`  ${project} is not an active project of this org yet: nothing is stored, nothing to remove (its import creates it)`);
console.log(`  built from: ${dir === "-" ? "no source (the overlays alone)" : dir} · ${ovs.length} overlay(s)${flag("--renders") ? " · renders " + flag("--renders") : " · no renders file"} · rulings ${rulingsPath} (a smaller build than the import's lists more as stale: check these are the import's own inputs)`);
for (const k of ORDER) {
  const r = plan.counts.removeByKind[k] || 0, kp = plan.counts.keptByKind[k] || 0;
  if (r || kp) console.log(`  ${k.padEnd(9)} remove ${String(r).padStart(5)}${r ? `  e.g. ${line(plan.remove, k)}` : ""}${kp ? `  · kept ${kp}: e.g. ${line(plan.kept, k)}` : ""}`);
}
process.exit(plan.counts.remove ? 3 : 0);
