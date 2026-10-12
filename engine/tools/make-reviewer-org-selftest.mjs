// tools/make-reviewer-org-selftest.mjs — the reviewer-org tool's guards (tools/make-reviewer-org.mjs; the sprint-9 review's
// A1+B2, B3 and A4), against a fresh database built from boot.sql (node:sqlite, the D1 shape of tools/fixtures/sqlite-worker.mjs)
// handed in as the operator's database. A refusal never reaches the door: its URL answers nothing, and "nothing written" is
// SQLite's own total_changes() (triggers included) plus an empty record directory.
//   G1 · an account that stands OUTSIDE the reviewer world is refused, nothing written, with or without --reissue, and the
//        refusal never advises --reissue: a seat in another org (no passphrase yet: its sign-up would take it), a seat waiting
//        for its holder's yes elsewhere, a removed seat elsewhere, a passphrase and a seat elsewhere, a passphrase with no seat
//        that the tool's record does not name, an org it founded
//   G2 · the tool's OWN accounts are not refused: a passphrase the record names (the admin, made before a crash) is refused
//        without --reissue WITH that advice, and with --reissue the run goes on to its first write (the operator's allow)
//   G3 · an org of that slug that is no reviewer world (not on the plan `reviewer`, not in the tool's record) is refused,
//        nothing written, even when the --domain's admin founded it
//   G4 · --live: the importer's own dry run (--dry-run --estimate-from) answers BEFORE any write — a stale measure and a
//        missing one each refuse, nothing written; a measure that holds lets the run go on to its first write
//   G5 · the import sources ignore the inherited DEV_* / IMPORT_* overrides (tools/lib-import-sources.sh) unless --source-env
//        is passed, and the run says which source it used
//   G6 · every class of a real org is seated (sprint 12, 12.8): seven accounts, each a real role and real hats (src/hats.js),
//        the classes management, engineering, gtm, quality and partner each worn, the partner on the sample alone and the rest
//        on both, each email a plain one
//   G7 · the walkthrough is the door's: each seat's filing passes its lane's shape (src/shapes.js checkShape), the request is a
//        proposal (ruling territory: it waits for the owner), the three filings are ba, code and gtm — the goal's own
//        dimensions in the demo overlay — every id they name and every check they grade is one the overlay files, and the
//        checks name the goal; the dev is the request's next action
//   G8 · a COMPLETE world (seven seats with their hats, both projects, the sample imported, the walkthrough complete in the
//        record) reruns with nothing written; a seat whose access hats were changed, or a record with no walkthrough, is a gap
//        (refused without --reissue, nothing written, the gap named); a walkthrough complete but its goal never marked done is
//        the gap its last step names
//   G9 · the walkthrough's last step is the door's: the admin's goal item is the overlay's goal, status "done" and every other
//        field the overlay's own, and the schema files it (planKnowledge as the owner); the overlay itself never claims done
//        (before the loop runs the goal is not done)
//   G10 · --reissue repairs a standing seat's ACCESS hats: accessRepairs names exactly the seat whose hats were changed (the
//        tester's, with its person id and SEATS' hats), never the admin's, and none on a world whose hats stand; its form is
//        Control's set-access-hats with the WHOLE list
//   G11 · the record keys each import by its sources' digest (sprint 13, 13.3), on a copy of the demo overlays: the digest is
//        stable and moves with one overlay's bytes; importPlan says new / unchanged / changed (naming the overlay) / undigested;
//        through the run, on G8's complete world: an unchanged source reruns with nothing written and says "unchanged", a
//        changed overlay and a record entry with no digest are each the sample import's gap (refused without --reissue, nothing
//        written, the reason named); --live with --reissue: a changed source answers the importer's dry run before any write
//        (a stale measure refuses, nothing written), an unchanged one skips that dry run
// node tools/make-reviewer-org-selftest.mjs [<the tool's path>] — exit 1 on any failure. A gate step.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const T = await import(pathToFileURL(resolve(process.argv[2] || join(ENGINE, "tools", "make-reviewer-org.mjs"))).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const J = (x) => JSON.stringify(x);
const tmp = mkdtempSync(join(tmpdir(), "reviewer-org-selftest-"));
const CFG = join(tmp, "wrangler.jsonc");
writeFileSync(CFG, JSON.stringify({ name: "selftest", d1_databases: [{ binding: "DB", database_name: "selftest-db", database_id: "00000000-0000-0000-0000-000000000000" }] }));
const LOCAL = ["--url", "http://127.0.0.1:9", "--local", tmp, "--config", CFG, "--sample-only"];
const LIVE = ["--url", "https://reviewer.invalid", "--live", "--config", CFG, "--confirm-live", "selftest-db", "--sample-only"];

const fresh = () => { const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8")); return db; };
const writes = (db) => Number(db.prepare("SELECT total_changes() AS n").get().n);
const acct = (db, id, email, pass = false) => db.prepare("INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-10-01', '2026-10-01')")
  .run(id, email, pass ? "h" : null, pass ? "s" : null);
const org = (db, id, slug, by = null, plan = "free") => db.prepare("INSERT INTO org (id, name, slug, plan, created_at, updated_at, created_by_account) VALUES (?, ?, ?, ?, '2026-10-01', '2026-10-01', ?)")
  .run(id, slug, slug, plan, by);
const seat = (db, id, email, o, { active = 1, pending = 0, role = "member" } = {}) =>
  db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, pending, created_at, org) VALUES (?, ?, ?, ?, ?, ?, ?, '2026-10-01', ?)")
    .run(id, email, email, role, `kh-${id}`, active, pending, o);

// one run of the tool on db: its exit code, every line it printed, the rows it wrote and the record files it left
async function runOn(db, argv, { record = null, costFrom, sources } = {}) {
  const recordDir = mkdtempSync(join(tmp, "rec-"));
  if (record) writeFileSync(T.recordPath(recordDir, "local:selftest-db", record.slug || "sharingu-review"), JSON.stringify(record));
  const before = writes(db), out = [];
  const rc = await T.run(argv, {
    say: (s) => out.push(s), err: (s) => out.push(s), recordDir, costFrom, ...(sources ? { sources } : {}),
    open: async () => ({ DB: d1(db), database: "local:selftest-db", close: async () => {} }),
    budget: async () => ({ rc: 0, out: "" }),
  });
  const left = readdirSync(recordDir).filter((f) => !record || f !== `${"local_selftest-db"}-${record.slug || "sharingu-review"}.json`);
  return { rc, text: out.join("\n"), wrote: writes(db) - before, records: left };
}
const refusedClean = (r) => r.rc === 1 && r.wrote === 0 && r.records.length === 0 && /refused \(nothing written\)/.test(r.text);
const advisesReissue = (r) => /--reissue/.test(r.text.replace(/^usage:.*$/m, ""));

// ---- G1 · an account standing outside the reviewer world ----
const outside = [
  ["a seat in another org, no passphrase yet", (db) => { org(db, 2, "acme"); seat(db, "p-b", "member@a.test", 2); }, "a.test"],
  ["a seat waiting for its holder's yes elsewhere", (db) => { org(db, 2, "acme"); seat(db, "p-b", "partner@a.test", 2, { active: 0, pending: 1 }); }, "a.test"],
  ["a removed seat elsewhere", (db) => { org(db, 2, "acme"); seat(db, "p-b", "member@a.test", 2, { active: 0 }); }, "a.test"],
  ["a passphrase and a seat elsewhere", (db) => { acct(db, "acc-m", "member@a.test", true); org(db, 2, "acme"); seat(db, "p-b", "member@a.test", 2); }, "a.test"],
  ["a passphrase, no seat, not in the record", (db) => { acct(db, "acc-a", "admin@a.test", true); }, "a.test"],
  ["an org it founded", (db) => { acct(db, "acc-a", "admin@a.test", true); org(db, 2, "acme", "acc-a"); seat(db, "p-o", "admin@a.test", 2, { role: "owner" }); }, "a.test"],
];
for (const [what, seed, domain] of outside) {
  for (const reissue of [false, true]) {
    const db = fresh(); seed(db);
    const r = await runOn(db, [...LOCAL, "--domain", domain, ...(reissue ? ["--reissue"] : [])]);
    ok(refusedClean(r) && !advisesReissue(r) && /outside this reviewer world|this tool did not make/.test(r.text),
      `G1 ${what}${reissue ? " (--reissue)" : ""}: refused, 0 rows, no record, no --reissue advice (rc ${r.rc}, wrote ${r.wrote}, records ${r.records.length}: ${r.text.slice(0, 160)})`);
  }
}

// ---- G2 · the tool's own accounts ----
{
  const seedOwn = (db) => acct(db, "acc-own", "admin@b.test", true);
  const record = { format: "reviewer-org/1", database: "local:selftest-db", slug: "sharingu-review", accounts: { admin: "acc-own" }, steps: {} };
  let db = fresh(); seedOwn(db);
  const r1 = await runOn(db, [...LOCAL, "--domain", "b.test"], { record });
  ok(r1.rc === 1 && r1.wrote === 0 && advisesReissue(r1) && /already hold sign-in codes/.test(r1.text),
    `G2 the admin the record names, without --reissue: refused with the --reissue advice, 0 rows (rc ${r1.rc}, wrote ${r1.wrote}: ${r1.text.slice(0, 160)})`);
  db = fresh(); seedOwn(db);
  const r2 = await runOn(db, [...LOCAL, "--domain", "b.test", "--reissue"], { record });
  ok(r2.rc === 1 && r2.wrote > 0 && !/refused \(nothing written\)/.test(r2.text) && /^✗ /m.test(r2.text),
    `G2 … with --reissue: past every guard to the operator's allow (wrote ${r2.wrote}), then the door (none here) fails the sign-up`);
  // an account whose every seat lies in the reviewer org itself (the tool's own, by its seats)
  db = fresh(); acct(db, "acc-a", "admin@c.test", true); org(db, 5, "sharingu-review", "acc-a", "reviewer"); seat(db, "p-o", "admin@c.test", 5, { role: "owner" });
  acct(db, "acc-m", "member@c.test", true); seat(db, "p-m", "member@c.test", 5);
  const r3 = await runOn(db, [...LOCAL, "--domain", "c.test", "--reissue"]);
  ok(r3.rc === 1 && r3.wrote > 0 && !/refused \(nothing written\)/.test(r3.text),
    `G2 accounts seated only in the reviewer org (on its plan): with --reissue, past every guard to the allow (wrote ${r3.wrote}: ${r3.text.slice(0, 120)})`);
}

// ---- G3 · an org of that slug that is no reviewer world ----
{
  const db = fresh(); acct(db, "acc-a", "admin@d.test", true); org(db, 5, "sharingu-review", "acc-a", "team"); seat(db, "p-o", "admin@d.test", 5, { role: "owner" });
  for (const reissue of [false, true]) {
    const r = await runOn(db, [...LOCAL, "--domain", "d.test", ...(reissue ? ["--reissue"] : [])]);
    ok(refusedClean(r) && !advisesReissue(r) && /not a reviewer world/.test(r.text),
      `G3 /sharingu-review on plan team, founded by the --domain's admin, not in the record${reissue ? " (--reissue)" : ""}: refused, 0 rows (rc ${r.rc}, wrote ${r.wrote}: ${r.text.slice(0, 160)})`);
  }
}

// ---- G4 · --live: the importer's dry run before any write ----
{
  const KINDS = ["aim", "goal", "card_kind", "question", "node", "card", "doc", "check", "decision", "style", "render", "edge", "flow", "screen"];
  const measure = (at) => ({ project: "demo", url: "http://127.0.0.1:1", measuredAt: at, ledgerRows: 26,
    kinds: Object.fromEntries(KINDS.map((k) => [k, { ops: 1, calls: 1, written: 10, perOp: 10, complete: true, measuredAt: at, refs: [] }])) });
  const dirOf = (m) => { const d = mkdtempSync(join(tmp, "cost-")); if (m) writeFileSync(join(d, "import-cost-demo.json"), JSON.stringify(m)); return d; };
  for (const [what, costFrom] of [["a stale measure (2000, no batch of it measured)", dirOf(measure("2000-01-01T00:00:00.000Z"))], ["no measure", dirOf(null)]]) {
    const db = fresh();
    const r = await runOn(db, [...LIVE, "--domain", "e.test"], { costFrom });
    ok(refusedClean(r) && /the sample import's own dry run refused/.test(r.text) && /REFUSED: no rows-written measure holds/.test(r.text),
      `G4 --live with ${what}: refused by the importer's dry run, 0 rows, no record (rc ${r.rc}, wrote ${r.wrote}, records ${r.records.length}: ${r.text.slice(0, 200)})`);
  }
  const db = fresh();
  const r = await runOn(db, [...LIVE, "--domain", "e.test"], { costFrom: dirOf(measure(new Date(Date.now() + 864e5).toISOString())) });
  ok(r.rc === 1 && r.wrote > 0 && /the sample import's dry run: .*rows/.test(r.text) && /^✗ /m.test(r.text),
    `G4 --live with a measure that holds: the dry run answers first, then the run writes (wrote ${r.wrote}: ${r.text.slice(0, 200)})`);
}

// ---- G5 · the inherited overrides ----
{
  const saved = { ...process.env };
  process.env.DEV_SOURCE_SHARINGU = "/nonexistent/sharingu-elsewhere";
  process.env.DEV_OVERLAY_SHARINGU = "none";
  process.env.IMPORT_BUDGET_LEFT = "999999999";
  try {
    const ignored = T.sourcesOf ? T.sourcesOf("sharingu", { sourceEnv: false }) : null;
    const honoured = T.sourcesOf ? T.sourcesOf("sharingu", { sourceEnv: true }) : null;
    ok(ignored && ignored.source === dirname(ENGINE) && ignored.overlays.length > 0 && ignored.ignored.includes("DEV_SOURCE_SHARINGU") && ignored.ignored.includes("IMPORT_BUDGET_LEFT")
      && !("DEV_SOURCE_SHARINGU" in ignored.env) && !("IMPORT_BUDGET_LEFT" in ignored.env),
      `G5 without --source-env: the repo's own source and overlays, the inherited DEV_*/IMPORT_* named as ignored and kept out of the importer's env (${ignored && ignored.source})`);
    ok(honoured && honoured.source === "/nonexistent/sharingu-elsewhere" && honoured.overlays === "" && honoured.ignored.length === 0,
      `G5 with --source-env: the overrides honoured (${honoured && honoured.source})`);
    const db = fresh();
    const r = await runOn(db, ["--url", "http://127.0.0.1:9", "--local", tmp, "--config", CFG, "--domain", "f.test", "--source-env"]);
    ok(refusedClean(r) && /the sharingu import lacks source \/nonexistent\/sharingu-elsewhere/.test(r.text),
      `G5 a run with --source-env reads the override (its missing source refuses, nothing written: ${r.text.slice(0, 160)})`);
  } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
}

// ---- G6 · every class of a real org ----
{
  const H = await import(pathToFileURL(join(ENGINE, "src", "hats.js")).href);
  const { emailProblem } = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
  const S = T.SEATS || {};
  const roles = T.ROLES || [];
  const worn = new Set(roles.flatMap((r) => (S[r] && S[r].hats) || []));
  const bad = roles.filter((r) => !S[r] || !["owner", "member", "partner"].includes(S[r].role) || !(S[r].hats || []).every((h) => H.HAT_KEYS.includes(h))
    || !["both", "sample"].includes(S[r].on) || (S[r].brief && !(S[r].hats || []).includes(S[r].brief)));
  const mails = T.emailsOf(T.DOMAIN);
  ok(roles.length === 7 && J(roles) === J(Object.keys(S)) && !bad.length && ["management", "engineering", "gtm", "quality", "partner"].every((h) => worn.has(h))
    && S.admin.role === "owner" && roles.filter((r) => S[r].role === "owner").length === 1 && S.partner.role === "partner" && S.partner.on === "sample"
    && roles.filter((r) => r !== "partner").every((r) => S[r].on === "both") && S.tester.hats.includes("quality") && roles.every((r) => !emailProblem(mails[r])) && T.DOMAIN === "review.sharingu.xyz",
    `G6 seven seats, one per class, on the default domain ${T.DOMAIN}: ${roles.map((r) => `${r} (${S[r] && S[r].role}${S[r] && S[r].hats.length ? `: ${S[r].hats.join("+")}` : ""})`).join(", ")}${bad.length ? ` — wrong: ${bad.join(",")}` : ""}`);
}

// ---- G7 · the walkthrough is the door's (a tool without it fails here, never crashes the rest) ----
try {
  const { checkShape } = await import(pathToFileURL(join(ENGINE, "src", "shapes.js")).href);
  const ov = JSON.parse(readFileSync(join(ENGINE, "tools", "import", "overlays", "demo", "6-showcase.items.json"), "utf8")).items;
  const ids = new Set(ov.map((o) => o.kind === "node" ? o.data.id : o.kind === "goal" ? `goal/${o.data.id}` : o.kind === "question" ? `q/${o.data.qid}` : o.kind === "check" ? `check/${o.data.id}` : null).filter(Boolean));
  const goal = ov.find((o) => o.kind === "goal" && o.data.id === T.WALK_GOAL);
  const F = T.walkFilings(T.emailsOf(T.DOMAIN));
  const filings = [F.proposal, F.code("T-20261010-001"), F.gtm("T-20261010-002")];
  const named = filings.flatMap((f) => [...(f.touches || []), ...(f.components || []), ...(f.depends || []), ...String(f.screens || "").split(",").filter(Boolean)]);
  const unknown = named.filter((x) => !ids.has(x));
  const shapes = filings.map((f) => checkShape(f)).filter(Boolean);
  const checks = T.WALK_CHECKS.map((c) => ov.find((o) => o.kind === "check" && o.data.id === c));
  ok(!!goal && J(filings.map((f) => f.lane)) === J(goal.data.dimensions) && filings.every((f) => f.goalRef === T.WALK_GOAL && f.clientRef) && F.proposal.kind === "proposal"
    && F.proposal.next.who === "dev@review.sharingu.xyz" && !unknown.length && !shapes.length && F.decision.verdict === "approve"
    && checks.every((c) => c && c.data.refs.includes(T.WALK_GOAL)) && F.grades.every((g) => g.verdict === "proven" && g.proof && g.clientRef && T.WALK_CHECKS.includes(g.checkId)),
    `G7 the walkthrough's filings ${filings.map((f) => `${f.lane}/${f.kind}`).join(", ")} = goal/${T.WALK_GOAL}'s dimensions ${goal && J(goal.data.dimensions)}; ${named.length} ids named, ${unknown.length} not in the overlay${unknown.length ? ` (${unknown.join(", ")})` : ""}; shapes ${shapes.length ? J(shapes) : "pass"}; the checks ${T.WALK_CHECKS.join(", ")} name the goal`);
} catch (e) { ok(false, `G7 the walkthrough: ${String((e && e.message) || e).slice(0, 160)}`); }

// ---- G8 · a complete world reruns with nothing written; a changed seat or no walkthrough is a gap ----
try {
  const S = T.SEATS, roles = T.ROLES, dom = "g.test", mails = T.emailsOf(dom), O = 5;
  const keyOf = (slug) => T.projectKey(O, slug);
  const world = ({ testerHats } = {}) => {
    const db = fresh();
    for (const r of roles) acct(db, `acc-${r}`, mails[r], true);
    org(db, O, "sharingu-review", "acc-admin", "reviewer");
    for (const slug of ["sharingu", "sample"]) db.prepare("INSERT INTO projects (key, name, active, created_at) VALUES (?, ?, 1, '2026-10-01')").run(keyOf(slug), slug);
    for (const r of roles) {
      const hats = r === "tester" && testerHats ? testerHats : S[r].hats;
      seat(db, `p-${r}`, mails[r], O, { role: S[r].role });
      db.prepare("UPDATE people SET account_id = ?, hats = ?, access_hats = ? WHERE id = ?").run(`acc-${r}`, JSON.stringify(r === "admin" ? hats : S[r].hats), JSON.stringify(r === "admin" ? [] : hats), `p-${r}`);
      if (r !== "admin") for (const slug of S[r].on === "both" ? ["sharingu", "sample"] : ["sample"]) db.prepare("INSERT INTO project_seats (person_id, project_key, created_at) VALUES (?, ?, '2026-10-01')").run(`p-${r}`, keyOf(slug));
    }
    return db;
  };
  // the sample's import as recorded under its sources' digest now (13.3: an entry with no digest is a gap, G11)
  const d0 = T.importDigest ? T.importDigest(T.sourcesOf("demo")) : {};
  const rec = (walk) => ({ format: "reviewer-org/1", database: "local:selftest-db", slug: "sharingu-review", org: O, accounts: Object.fromEntries(roles.map((r) => [r, `acc-${r}`])),
    imports: { sample: { at: "2026-10-10", from: "demo", digest: d0.digest, parts: d0.parts } }, ...(walk ? { walkthrough: { proposal: "T-1", code: "T-2", gtm: "T-3", complete: "2026-10-10", ...(walk === "no-done" ? {} : { goalDone: "2026-10-10" }) } } : {}), steps: {} });
  let r = await runOn(world(), [...LOCAL, "--domain", dom], { record: rec(true) });
  ok(r.rc === 0 && r.wrote === 0 && /the reviewer world stands .* nothing written/.test(r.text) && !/code: /.test(r.text),
    `G8 a complete world of seven seats reruns: rc ${r.rc}, wrote ${r.wrote}, no code printed (${r.text.slice(0, 160)})`);
  r = await runOn(world({ testerHats: ["engineering"] }), [...LOCAL, "--domain", dom], { record: rec(true) });
  ok(r.rc === 1 && r.wrote === 0 && /the tester's hats \(engineering, not quality\)/.test(r.text) && /already hold sign-in codes/.test(r.text),
    `G8 the tester's access hats changed: a gap, refused without --reissue, nothing written (rc ${r.rc}, wrote ${r.wrote}: ${r.text.slice(0, 220)})`);
  r = await runOn(world(), [...LOCAL, "--domain", dom], { record: rec(false) });
  ok(r.rc === 1 && r.wrote === 0 && /lacks the walkthrough/.test(r.text),
    `G8 a record with no walkthrough: the walkthrough is the gap, nothing written (rc ${r.rc}, wrote ${r.wrote}: ${r.text.slice(0, 160)})`);
  r = await runOn(world(), [...LOCAL, "--domain", dom], { record: rec("no-done") });
  ok(r.rc === 1 && r.wrote === 0 && /lacks the walkthrough's last step \(goal\/pay-by-invoice done\)/.test(r.text),
    `G8 a walkthrough complete, its goal never marked done: the last step is the gap, nothing written (rc ${r.rc}, wrote ${r.wrote}: ${r.text.slice(0, 160)})`);
  // G10 · the access-hat repair (--reissue's): the seat whose hats were changed, and only it
  const w0 = await T.readWorld(d1(world()), { slug: "sharingu-review", emails: mails });
  const w1 = await T.readWorld(d1(world({ testerHats: ["engineering"] })), { slug: "sharingu-review", emails: mails });
  const fix0 = T.accessRepairs(w0), fix1 = T.accessRepairs(w1);
  const f = fix1[0] ? T.accessForm(fix1[0]) : null;
  ok(fix0.length === 0 && fix1.length === 1 && fix1[0].r === "tester" && fix1[0].personId === "p-tester" && J(fix1[0].hats) === J(S.tester.hats)
    && !!f && f.get("action") === "set-access-hats" && f.get("personId") === "p-tester" && J(f.getAll("accessHat")) === J(S.tester.hats),
    `G10 --reissue repairs a standing seat's access hats: ${fix0.length} on the world as made, ${J(fix1.map((x) => `${x.r}:${x.personId}:${x.hats.join("+")}`))} with the tester's changed; the form ${f ? f.toString() : "none"}`);

  // ---- G11 · the import's digest: a changed source imports again ----
  const ovDir = mkdtempSync(join(tmp, "overlays-"));
  const demo = T.sourcesOf("demo");
  const copies = demo.overlays.split(",").map((f) => { const to = join(ovDir, f.split("/").pop()); writeFileSync(to, readFileSync(f)); return to; });
  const showcase = copies.find((f) => f.endsWith("6-showcase.items.json"));
  const sources = (from, o) => (from === "demo" ? { ...T.sourcesOf(from, o), overlays: copies.join(",") } : T.sourcesOf(from, o));
  const dA = T.importDigest(sources("demo")), dA2 = T.importDigest(sources("demo"));
  const entry = (d) => ({ at: "2026-10-10", from: "demo", ...(d ? { digest: d.digest, parts: d.parts } : {}) });
  const p0 = T.importPlan({}, { sample: dA }).sample, p1 = T.importPlan({ sample: entry(dA) }, { sample: dA }).sample;
  const pU = T.importPlan({ sample: entry(null) }, { sample: dA }).sample;
  const recWith = (e) => ({ ...rec(true), imports: { sample: e } });
  // through the run: the copy unchanged
  r = await runOn(world(), [...LOCAL, "--domain", dom], { record: recWith(entry(dA)), sources });
  ok(dA.digest === dA2.digest && /^sha256:[0-9a-f]{64}$/.test(dA.digest) && Object.keys(dA.parts).length === copies.length && p0.state === "new" && p1.state === "unchanged"
    && r.rc === 0 && r.wrote === 0 && /sample imported \(2026-10-10\): unchanged/.test(r.text),
    `G11 an unchanged source skips: the digest stable (${dA.digest.slice(0, 19)}, ${Object.keys(dA.parts).length} overlays), plan ${p0.state} then ${p1.state}; the run rc ${r.rc}, wrote ${r.wrote} (${(/sample imported.*$/m.exec(r.text) || [""])[0]})`);
  // one overlay's bytes changed
  writeFileSync(showcase, readFileSync(showcase, "utf8").replace(/\n*$/, "\n\n"));
  const dB = T.importDigest(sources("demo"));
  const pC = T.importPlan({ sample: entry(dA) }, { sample: dB }).sample;
  r = await runOn(world(), [...LOCAL, "--domain", dom], { record: recWith(entry(dA)), sources });
  ok(dB.digest !== dA.digest && pC.state === "changed" && /6-showcase\.items\.json/.test(pC.why) && !/1-aim-goals/.test(pC.why)
    && r.rc === 1 && r.wrote === 0 && /lacks the sample's import \(its sources changed: overlay [^)]*6-showcase\.items\.json\)/.test(r.text) && advisesReissue(r),
    `G11 a changed overlay re-imports: plan ${pC.state} (${pC.why}); the run: the sample's import is the gap, refused without --reissue, nothing written (rc ${r.rc}, wrote ${r.wrote}: ${r.text.slice(0, 200)})`);
  // an entry with no digest: changed once, then unchanged under the digest it records
  r = await runOn(world(), [...LOCAL, "--domain", dom], { record: recWith(entry(null)), sources });
  const pOnce = T.importPlan({ sample: entry(dB) }, { sample: dB }).sample;
  ok(pU.state === "undigested" && pOnce.state === "unchanged" && r.rc === 1 && r.wrote === 0 && /lacks the sample's import \(its record holds no digest/.test(r.text),
    `G11 an entry with no digest re-imports once: plan ${pU.state}, then ${pOnce.state} under its recorded digest; the run names it the gap (rc ${r.rc}, wrote ${r.wrote}: ${r.text.slice(0, 200)})`);
  // --live --reissue: the changed source's own dry run first (a stale measure refuses, nothing written); unchanged: no dry run
  const KINDS = ["aim", "goal", "card_kind", "question", "node", "card", "doc", "check", "decision", "style", "render", "edge", "flow", "screen"];
  const stale = mkdtempSync(join(tmp, "cost-"));
  writeFileSync(join(stale, "import-cost-demo.json"), JSON.stringify({ project: "demo", url: "http://127.0.0.1:1", measuredAt: "2000-01-01T00:00:00.000Z", ledgerRows: 26,
    kinds: Object.fromEntries(KINDS.map((k) => [k, { ops: 1, calls: 1, written: 10, perOp: 10, complete: true, measuredAt: "2000-01-01T00:00:00.000Z", refs: [] }])) }));
  const rl = await runOn(world(), [...LIVE, "--domain", dom, "--reissue"], { record: recWith(entry(dA)), sources, costFrom: stale });
  const ru = await runOn(world(), [...LIVE, "--domain", dom, "--reissue"], { record: recWith(entry(dB)), sources, costFrom: stale });
  ok(refusedClean(rl) && /the sample import's own dry run refused/.test(rl.text) && ru.rc === 1 && ru.wrote > 0 && !/dry run/.test(ru.text),
    `G11 --live --reissue: a changed source's dry run refuses before any write (rc ${rl.rc}, wrote ${rl.wrote}: ${rl.text.slice(0, 120)}); an unchanged one skips it and goes on to its first write (wrote ${ru.wrote})`);
} catch (e) { ok(false, `G8/G10/G11 the complete world: ${String((e && e.message) || e).slice(0, 160)}`); }

// ---- G9 · the walkthrough's last step: the goal marked done, the overlay's own goal otherwise ----
try {
  const { planKnowledge } = await import(pathToFileURL(join(ENGINE, "src", "knowledge", "schema.js")).href);
  const g = T.showcaseGoal(), item = T.walkGoalDone(g);
  const rest = (o) => J(Object.fromEntries(Object.entries(o).filter(([k]) => k !== "status")));
  // the goal's own tree (1-aim-goals: its parent and the root) files before it, as the demo import files it
  const tree = JSON.parse(readFileSync(join(ENGINE, "tools", "import", "overlays", "demo", "1-aim-goals.items.json"), "utf8")).items.filter((o) => o.kind === "goal");
  const plan = planKnowledge([...tree, item], {}, { isOwner: true, role: "owner" });
  ok(g.id === T.WALK_GOAL && g.status !== "done" && item.kind === "goal" && item.op === "upsert" && item.data.status === "done" && rest(item.data) === rest(g) && !(plan.errors || []).length,
    `G9 the last step files goal/${g.id} done (the overlay says ${J(g.status || null)}), every other field the overlay's; the schema: ${(plan.errors || []).length ? J(plan.errors).slice(0, 160) : "files"}`);
} catch (e) { ok(false, `G9 the goal done: ${String((e && e.message) || e).slice(0, 160)}`); }

rmSync(tmp, { recursive: true, force: true });
console.log(`make-reviewer-org selftest: ${checks - failed}/${checks} passed`);
process.exit(failed ? 1 : 0);
