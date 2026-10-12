// tools/prune-selftest.mjs — G2 H3 (the independent review): THE prune rule (tools/ship/prune-plan.mjs planPrune) and the
// apply's own checks (verifyForApply), on fixtures, offline. The old tools/ship/prune.mjs removed EVERY stored-not-built row:
// a person's own filing through the MCP and whatever a missing input left out of the build. Each case below fails on that rule.
//   A. the import's own stale item (made and last changed by the import's identity, touched by no other write) is removed;
//      a built item is never listed; a one-row kind (aim, gtm) never.
//   B. a stale item another person made, or last changed, is KEPT with its reason.
//   C. a stale item the import's identity made but a write that was not an import touched (the owner by hand through the MCP)
//      is KEPT; a render is touched as its screen.
//   D. a ledger row at the touches cap (30 names) protects what its submitter changed in the two minutes before it.
//   E. an owner's ruling: explicit keys remove an item another identity made (unless a write that was not an import touched
//      it); stale: true names every stale item of the kinds in its project only.
//   F. the apply: the wrong key, a plan over the cap and a bad plan are refused, nothing kept; an item changed since the plan,
//      or gone, is left and said; the rest goes.
//   G. the old rule, run on the same fixture, removes the person's own filing (the review's finding, reproduced).
//   H. (sprint 7, 7.5b) a hand-filed batch over 30 items stays protected past the two-minute window: through the REAL worker
//      (tools/fixtures/sqlite-worker.mjs), the import's identity files 35 docs by hand (preview then file, its own clientRef) while
//      the clock moves 2 minutes and 1 second between the write's moment and its ledger row (as slow body puts would); the plan,
//      every doc stale, keeps all 35 — the 5 its row does not name sit at the row's own moment. Before 7.5b the row took its own
//      later moment and the window (120 s) missed them: removed. MUTANTS (each must turn H red): the knowledge door stops handing
//      its moment to the ledger row (src/knowledge/write.js), and the seam stops using it (src/core.js fileTransmission).
//      Sprint 7's review (C3): the moment rides the row's grade as batchAt (read as tools/ship/prune.mjs reads it: batchAtOf) and
//      the row's created_at is when it LANDED — 121 s after its rows, so a reader polling by time during the slow write still
//      sees it next time (H's gap is the landing's, its batch moment equal to its rows'). A third MUTANT puts the batch moment
//      back into created_at (the reader's miss): H's landing gap turns red.
import { planPrune, verifyForApply, isImportRef, batchAtOf, TOUCHES_CAP, CAP_WINDOW_MS } from "./ship/prune-plan.mjs";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

let fail = 0, checks = 0;
const eq = (got, want, label) => { checks++; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail = 1; } else if (/^(D:|H)/.test(label)) console.log(`  ✓ ${label}`); };
const I = "owner-1", M = "member-7";
const at = (s) => new Date(Date.UTC(2026, 9, 1, 10, 0, 0) + s * 1000).toISOString();   // seconds after 10:00
const item = (key, by = I, up = by, t = at(0), extra = {}) => ({ key, data: { id: key }, item: { createdBy: by, updatedBy: up, updatedAt: t, ...extra } });
const keysOf = (m, k) => (m[k] || []).map((x) => x.key).sort();

// the fixture: sharingu-like — the import filed old-model nodes and goals; a person filed some by hand since
const stored = {
  node: [item("old:1"), item("old:2"), item("kept:built"), item("hand:owner"), item("by:member", M), item("changed:member", I, M), item("capped:1", I, I, at(570)), item("ruled:other", "retired-9", "retired-9"), item("ruled:touched", "retired-9", "retired-9")],
  render: [item("screen:a||wireframe", I, I, at(0), { screen: "screen:a" }), item("screen:b||wireframe", I, I, at(0), { screen: "screen:b" })],
  goal: [item("global"), item("launch")],
  aim: [item("")],
  doc: [item("capsules/gtm.md", "retired-9", "retired-9"), item("other.md", "retired-9", "retired-9")],
};
const built = new Map([["node", new Set(["kept:built"])], ["goal", new Set(["launch"])], ["aim", new Set()], ["render", new Set()], ["doc", new Set()]]);
const ledger = [
  { id: "T-imp-1", submitter: I, clientRef: "import:abc:k~123456", touches: "node:old:1,node:old:2,goal:global", at: at(1) },
  { id: "T-hand-1", submitter: I, clientRef: "pv:P-0011223344556677:k", touches: "node:hand:owner,render:screen:b,node:ruled:touched", at: at(5) },
  { id: "T-cap-1", submitter: I, clientRef: "my-batch:k~654321", touches: Array.from({ length: TOUCHES_CAP }, (_, i) => `card:x|c${i}`).join(","), at: at(600) },
  { id: "T-prune-1", submitter: I, clientRef: "prune-0123456789abcdef01234567:k~aaaaaa", touches: "node:old:9", at: at(2) },
];
const rulings = [
  { project: "sharingu", kind: "node", keys: ["ruled:other", "ruled:touched"], ruling: "the old model goes" },
  { project: "ryuklabs", kind: "doc", keys: ["capsules/gtm.md"], ruling: "private" },
  { project: "sharingu", kinds: ["goal"], stale: true, ruling: "the old tree goes" },
];
const plan = planPrune({ project: "sharingu", identity: I, stored, built, ledger, rulings, url: "http://x", at: "2026-10-03T00:00:00.000Z" });

// A
eq(keysOf(plan.remove, "node"), ["old:1", "old:2", "ruled:other"], "A/E: the node removals: the import's own two and the explicitly ruled one");
eq(keysOf(plan.remove, "goal"), ["global"], "A: the old goal root goes; the built one is never listed");
eq([plan.remove.aim, plan.kept.aim], [undefined, undefined], "A: a one-row kind is never pruned");
eq(isImportRef("import:x") && isImportRef("prune-x") && !isImportRef("pv:P-1:k") && !isImportRef(null), true, "A: an import's clientRef is import:… or prune-…; a preview's or none is not");
// B
const why = (k, key) => ((plan.kept[k] || []).find((x) => x.key === key) || {}).why || "";
eq([/created by member-7/.test(why("node", "by:member")), /last changed by member-7/.test(why("node", "changed:member"))], [true, true], "B: another person's item, and one another person last changed, are kept with the reason");
// C
eq([/T-hand-1/.test(why("node", "hand:owner")), keysOf(plan.kept, "render"), keysOf(plan.remove, "render")], [true, ["screen:b||wireframe"], ["screen:a||wireframe"]], "C: the owner's hand filing is kept (touched by T-hand-1); a render is touched as its screen");
// D
eq(/T-cap-1.*window/.test(why("node", "capped:1")), true, "D: a ledger row at the cap protects what its submitter changed in the two minutes before it");
// E
eq([/T-hand-1/.test(why("node", "ruled:touched")), /ruled: the old model goes/.test(((plan.remove.node || []).find((x) => x.key === "ruled:other") || {}).why || "")], [true, true], "E: a ruling removes an item another identity made, never one a write that was not an import touched");
eq([keysOf(plan.remove, "doc"), keysOf(plan.kept, "doc")], [[], ["capsules/gtm.md", "other.md"]], "E: a ruling names its own project only (ryuklabs' doc is not sharingu's)");
eq(plan.counts, { remove: 5, kept: 8, removeByKind: { render: 1, goal: 1, node: 3 }, keptByKind: { render: 1, doc: 2, node: 5 } }, "the plan's counts");
// F
const cur = (over = {}) => Object.fromEntries(Object.entries(plan.remove).map(([k, l]) => [k, new Map(l.map((e) => [e.key, over[e.key] === null ? undefined : over[e.key] || { updatedAt: e.updatedAt, updatedBy: e.updatedBy }]).filter(([, v]) => v))]));
eq(verifyForApply(plan, cur(), { identity: "someone-else" }).ok, false, "F: another key is refused");
eq(verifyForApply(plan, cur(), { identity: I, max: 4 }).ok, false, "F: a plan over the cap is refused");
eq(verifyForApply({ v: 9 }, cur(), { identity: I }).ok, false, "F: a file that is not a plan is refused");
const v = verifyForApply(plan, cur({ "old:2": { updatedAt: at(40), updatedBy: M }, "global": null }), { identity: I });
eq([v.ok, keysOf(v.go, "node"), v.changed.map((c) => `${c.kind}:${c.key}`).sort()], [true, ["old:1", "ruled:other"], ["goal:global", "node:old:2"]], "F: an item changed since the plan, or gone, is left and said; the rest goes");
const v2 = verifyForApply(plan, cur({ "old:1": { updatedAt: at(900), updatedBy: I } }), { identity: I });
eq(v2.changed.map((c) => `${c.kind}:${c.key}`), ["node:old:1"], "F: an item the same identity changed again since the plan is left too (its moment moved)");
// G
const oldRule = Object.fromEntries(Object.entries(stored).filter(([k]) => k !== "aim").map(([k, l]) => [k, l.filter((s) => !(built.get(k) || new Set()).has(s.key)).map((s) => s.key)]));
eq(oldRule.node.includes("hand:owner") && oldRule.node.includes("by:member"), true, "G: the old rule removed the owner's own hand filing and a member's item (the review's finding)");

// D (7.5b, pure): the window's edge, which a write's own rows no longer meet (7.5b: they sit at its row's moment): 119 s before a
// capped row is covered, 121 s is not
{
  const p2 = planPrune({ project: "sharingu", identity: I, built: new Map([["node", new Set()]]), at: "2026-10-03T00:00:00.000Z",
    stored: { node: [item("at:moment", I, I, at(7200)), item("out:window", I, I, at(7200 - 121)), item("in:window", I, I, at(7200 - 119))] },
    ledger: [{ id: "T-cap-3", submitter: I, clientRef: "hand:k~2", touches: Array.from({ length: TOUCHES_CAP }, (_, i) => `doc:e${i}`).join(","), at: at(7200) }] });
  eq([keysOf(p2.kept, "node"), keysOf(p2.remove, "node")], [["at:moment", "in:window"], ["out:window"]],
    `D: a capped row's window (${CAP_WINDOW_MS / 1000} s) covers an item at its own moment and 119 s before it, not 121 s`);
}

// H (7.5b): the batch through the REAL worker, the clock moving 2 minutes and 1 second inside the write
const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
async function batchCase(src) {
  const { sqliteWorker } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
  const w = await sqliteWorker({ projects: ["alpha"], src, people: [["imp-1", "Importer", "owner", "imp-key", []]] });
  const RealDate = Date;
  let skew = 0, armed = false;
  class SkewDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + skew); } static now() { return RealDate.now() + skew; } }
  // the ledger row's id is read (NEXT_SEQ_SQL) after the write's moment is taken and its rows are planned, before the row is
  // made: the clock jumps there, once, as a slow put of the bodies would make it
  const real = w.env.DB, { NEXT_SEQ_SQL } = await import(pathToFileURL(join(src || join(ENGINE, "src"), "core.js")).href);
  w.env.DB = { ...real, prepare: (sql) => { if (armed && sql === NEXT_SEQ_SQL) { armed = false; skew += 121_000; } return real.prepare(sql); } };
  const items = Array.from({ length: 35 }, (_, i) => ({ kind: "doc", op: "upsert", data: { path: `notes/hand-${String(i).padStart(2, "0")}.md`, title: `Hand ${i}`, body: `# Hand ${i}\n` } }));
  globalThis.Date = SkewDate;
  try {
    const pv = await w.mcp("preview", { project: "alpha", items, clientRef: "hand-batch-1" }, "imp-key");
    if (!pv.out || !pv.out.previewId) return { error: `preview: ${JSON.stringify(pv.out).slice(0, 200)}` };
    armed = true;
    const f = await w.mcp("file", { previewId: pv.out.previewId, items }, "imp-key");
    if (f.isError || (f.out && f.out.error)) return { error: `file: ${JSON.stringify(f.out).slice(0, 200)}` };
  } finally { globalThis.Date = RealDate; }
  const docs = w.db.prepare("SELECT path, created_by, updated_by, updated_at FROM k_docs WHERE project = 'alpha'").all();
  const rows = w.db.prepare("SELECT id, submitter, client_ref, touches, created_at, grade FROM transmission WHERE kind = 'knowledge'").all();
  const ledger = rows.map((t) => ({ id: t.id, submitter: t.submitter, clientRef: t.client_ref, touches: t.touches, at: batchAtOf(t.grade) || t.created_at }));
  const gap = ledger.length ? (Date.parse(ledger[0].at) - Date.parse(docs[0].updated_at)) / 1000 : null;
  // the landing: the row's own created_at, after its rows' moment by the write's whole time (C3: a time-cursor reader sees it)
  const landed = rows.length ? Math.round((Date.parse(rows[0].created_at) - Date.parse(docs[0].updated_at)) / 1000) : null;
  const plan = planPrune({ project: "alpha", identity: "imp-1", built: new Map([["doc", new Set()]]), ledger,
    stored: { doc: docs.map((d) => ({ key: d.path, data: { path: d.path }, item: { createdBy: d.created_by, updatedBy: d.updated_by, updatedAt: d.updated_at } })) } });
  return { docs: docs.length, named: ledger[0] ? ledger[0].touches.split(",").length : 0, gap, landed, kept: plan.counts.kept, removed: plan.counts.remove,
    slow: skew === 121_000 };
}
{
  const h = await batchCase(undefined);
  eq(h.error || [h.slow, h.docs, h.named, h.kept, h.removed, h.gap], [true, 35, TOUCHES_CAP, 35, 0, 0],
    `H: a hand batch of 35 docs whose write took 2 min 1 s: its row names ${h.named}, the plan keeps ${h.kept} and removes ${h.removed} (its batch moment ${h.gap} s after its rows)`);
  eq(h.error || h.landed >= 121, true, `H (C3): the ledger row's created_at is when it landed, ${h.landed} s after its rows: a reader polling by time during the write sees it`);
  const MUTANTS = [
    { name: "the ledger row takes its own later moment again", file: "src/knowledge/write.js", from: "batch: stmts, at, ...(refDigest", to: "batch: stmts, ...(refDigest" },
    { name: "the fileTransmission seam ignores the moment it is given", file: "src/core.js", from: "typeof internal.at === \"string\" && internal.at ? internal.at : null", to: "false ? internal.at : null" },
    { name: "the row is stamped with the batch moment again (C3)", file: "src/core.js", from: "  const createdAt = now();", to: "  const createdAt = batchAt || now();", landing: true },
  ];
  for (const m of MUTANTS) {
    const dir = mkdtempSync(join(ENGINE, ".prune-mutation-"));
    try {
      cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
      const f = join(dir, m.file), t = readFileSync(f, "utf8");
      if (t.split(m.from).length !== 2) { eq(false, true, `H mutant "${m.name}": its needle is not found once in ${m.file}`); continue; }
      writeFileSync(f, t.replace(m.from, m.to));
      const src = join(dir, "src");
      const r = await batchCase(src);
      if (m.landing) eq(!r.error && r.landed < 121, true, `H mutant "${m.name}" turns H red (its row lands at ${r.landed} s, before the write ended${r.error ? `; ${r.error}` : ""})`);
      else eq(!r.error && r.removed > 0, true, `H mutant "${m.name}" turns H red (it removes ${r.removed} of the batch's docs${r.error ? `; ${r.error}` : ""})`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

// I. (sprint 8, 8.3b) the cron's previews prune reads only the unfiled previews past the cutoff (migrate-078's idx_previews_prune),
// never the whole table: the filed previews are kept for ever, so the walk by the key grew with every preview of every org. On a
// REAL SQLite (boot.sql): the plan SEARCHes the index (red: the same statement with the index dropped SCANs previews); it deletes
// exactly the same rows with and without it (the org's own unfiled previews a day past expiry, at most PRUNE_MAX); and no other
// statement on previews in src/ moves its plan with the index.
{
  const { DatabaseSync } = await import("node:sqlite");
  const { readdirSync } = await import("node:fs");
  const P = await import(pathToFileURL(join(ENGINE, "src", "preview.js")).href);
  const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
  const org1 = (sql) => sql.replaceAll("{org}", "1");
  const world = (withIndex) => {
    const d = new DatabaseSync(":memory:");
    d.exec(BOOT);
    if (!withIndex) d.exec("DROP INDEX IF EXISTS idx_previews_prune");
    d.exec("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p1','P','p@x','owner','h',1,'2026-01-01',1)");
    d.exec("INSERT INTO projects (key,name,active,created_at) VALUES ('alpha','A',1,'2026-01-01'),('o2--beta','B',1,'2026-01-01')");
    const ins = d.prepare("INSERT INTO previews (id, project, person, created_at, expires_at, filed_at, digest, summary, filed) VALUES (?,?,?,?,?,?,?,?,?)");
    let k = 0;
    const id = () => "P-" + String(++k).padStart(16, "0");
    for (let i = 0; i < 400; i++) ins.run(id(), i % 2 ? "alpha" : "o2--beta", "p1", "2026-09-01", "2026-09-01T01:00:00Z", "2026-09-01T00:10:00Z", "d", "{}", "{}");   // filed, kept
    for (let i = 0; i < 30; i++) ins.run(id(), i % 3 ? "alpha" : "o2--beta", "p1", "2026-09-02", "2026-09-02T01:00:00Z", null, "d", "{}", null);                         // unfiled, long expired
    for (let i = 0; i < 6; i++) ins.run(id(), "alpha", "p1", "2026-10-08", "2026-10-08T12:00:00Z", null, "d", "{}", null);                                           // unfiled, in their day
    for (let i = 0; i < 4; i++) ins.run(id(), "alpha", "p1", "2026-09-02", "2026-09-02T01:00:00Z", null, "d", "{}", "{\"items\":[]}");                           // partly filed: kept
    return d;
  };
  const cutoff = "2026-10-07T00:00:00Z";
  const plan = (d) => d.prepare("EXPLAIN QUERY PLAN " + org1(P.PRUNE_SQL)).all(cutoff).map((r) => r.detail).join(" | ");
  const W = world(true), O = world(false);
  eq(/SEARCH previews USING INDEX idx_previews_prune \(expires_at<\?\)/.test(plan(W)) && !/SCAN previews/.test(plan(W)), true, `I · the prune SEARCHes idx_previews_prune, never a SCAN of previews: ${plan(W)}`);
  eq(/SCAN previews/.test(plan(O)), true, `I · the instrument: with the index dropped the same statement SCANs previews: ${plan(O)}`);
  const left = (d) => { d.prepare(org1(P.PRUNE_SQL)).run(cutoff); return d.prepare("SELECT id FROM previews ORDER BY id").all().map((r) => r.id); };
  const lw = left(W), lo = left(O);
  eq(lw.length === 400 + 10 + 6 + 4 && JSON.stringify(lw) === JSON.stringify(lo), true, `I · the same rows go with the index and without it: org 1's 20 long-expired unfiled previews (${440 - lw.length} deleted); the filed, the partly filed, the fresh and org 2's stay`);
  // no other statement on previews moves (every self-contained literal in src/ naming the table)
  const lits = [];
  for (const f of readdirSync(join(ENGINE, "src"), { recursive: true }).filter((x) => String(x).endsWith(".js"))) {
    const t = readFileSync(join(ENGINE, "src", String(f)), "utf8");
    for (const m of t.matchAll(/"((?:SELECT|UPDATE|DELETE|INSERT)\b[^"\\]*(?:\\.[^"\\]*)*)"/g)) if (/\b(FROM|UPDATE|INTO)\s+previews\b/.test(m[1]) && m[1] !== P.PRUNE_SQL) lits.push([String(f), m[1]]);
  }
  const plans = (d) => lits.map(([f, sql]) => { try { return d.prepare("EXPLAIN QUERY PLAN " + org1(sql)).all().map((r) => r.detail).join(" | "); } catch { return null; } });
  const pw = plans(world(true)), po = plans(world(false));
  const moved = lits.filter((_, i) => pw[i] !== po[i]).map(([f, sql]) => `${f}: ${sql.slice(0, 60)}`);
  eq(lits.length >= 4 && pw.filter((x) => x != null).length >= 4 && !moved.length, true, `I · no other previews statement moves its plan with the index (${lits.length} compared${moved.length ? `; moved: ${moved.join(" · ")}` : ""})`);
}

if (fail) { console.log(`  → prune rule case(s) failed (${checks} checks run)`); process.exit(1); }
console.log(`  ✓ the prune removes only the import's own stale items and the owner's rulings; a person's own filing is kept; the apply removes only what a reviewed plan names, as it stands (${checks} checks)`);
