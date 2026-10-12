// tools/onepass-selftest.mjs — the one-pass fix of the first real fill's findings (sprint 3, owner ruling 2026-10-01), the pure
// and the SQL parts, offline (no worker). Exit 1 on any failure. The proof rule has its own table (tools/proof-selftest.mjs),
// the gate's route table is tools/transmission-selftest.mjs, the terminal text tools/preview-selftest.mjs.
//   1. the Map refs (src/maprefs.js) on a REAL SQLite database (boot.sql): a screen by its id with or without "screen:", or by
//      its exact name; a component by any node id or a part of the architecture; depends by node, goal, question, check; a
//      ref not in the Map is named with its near matches — never another project's; one statement, a second only on a miss;
//      the plans of the new statements (no scan of k_nodes, k_questions, k_checks, transmission or k_docs)
//   2. the gate over that resolver: the fill's kinds of contribution file at once or name exactly what they lack
//   3. a goal's status (its values, the synonyms) and a done goal reading 100%
//   4. a ruling with its options and choice, with the ruled option alone, or with none; an open question with one option
//   5. a card kind's idPattern, enforced by the plan preview and the write both run; a pattern that could backtrack is refused
//   6. source on a question, a goal, a doc and the aim
//   7. holes: every fill is a preview (or the owner's rule_question), the meter's words, what counts, what a write started
//   8. whoami's gloss for the owner; the batch clientRef's form
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { d1Of } from "./fixtures/home-d1.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const MR = await import(join(ENGINE, "src", "maprefs.js"));
const { gateGrade } = await import(join(ENGINE, "src", "transmission.js"));
const S = await import(join(ENGINE, "src", "knowledge", "schema.js"));
const G = await import(join(ENGINE, "src", "goals.js"));
const C = await import(join(ENGINE, "src", "checklist.js"));
const { projectGloss } = await import(join(ENGINE, "src", "core.js"));
const { BATCH_REF_RE, needsOf } = await import(join(ENGINE, "src", "preview.js"));
const { GOALS_WAITING_SQL } = await import(join(ENGINE, "src", "hotsql.js"));
const { GTM_STRATEGY_SQL } = await import(join(ENGINE, "src", "knowledge", "docs.js"));

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1 · the Map refs ----
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
const at = "2026-10-01T00:00:00Z";
db.exec(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('p-o', 'Owen', 'o@x.test', 'owner', 'h-o', 1, '${at}', 1)`);
for (const p of ["alpha", "beta"]) db.exec(`INSERT INTO projects (key, name, active, created_at) VALUES ('${p}', '${p}', 1, '${at}')`);
const node = (project, id, type, name, data = null) => db.prepare("INSERT INTO k_nodes (project, id, type, name, data, created_by, created_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
  .run(project, id, type, name, data ? JSON.stringify(data) : null, "p-o", at, "p-o", at);
node("alpha", "screen:home", "screen", "Home");
node("alpha", "screen:goals", "screen", "Goals");
node("alpha", "screen:decisions", "screen", "Decisions");
node("alpha", "service:cloudflare-d1", "service", "Cloudflare D1");
node("alpha", "door:mcp:preview", "door", "MCP preview");
node("alpha", "architecture:main", "architecture", "Architecture", { diagram: { nodes: [{ id: "worker", title: "The worker" }, { id: "d1", title: "D1" }] } });
node("beta", "screen:secret-admin", "screen", "Secret admin");   // another project's: never found, never a near match
db.exec(`INSERT INTO k_questions (project, qid, question, status, created_by, created_at, updated_by, updated_at) VALUES ('alpha', 'Q1', 'One?', 'decided', 'p-o', '${at}', 'p-o', '${at}')`);
db.exec(`INSERT INTO k_checks (project, id, title, created_by, created_at, updated_by, updated_at) VALUES ('alpha', 'AC.1', 'It works', 'p-o', '${at}', 'p-o', '${at}')`);
const D1 = d1Of(db);
const env = { DB: D1 };

{
  const n0 = D1.statements.length;
  const hit = await MR.resolveMapRefs(env, "alpha", [{ lane: "code", screens: "goals, screen:home", touches: ["screen:decisions", "docs/plan"], components: ["service:cloudflare-d1", "mind/engines"], depends: ["q/Q1", "goal/g1", "check/AC.1", "T-20261001-001", "door:mcp:preview"] }], { near: true, goalIds: ["g1"] });
  ok(D1.statements.length - n0 === 1 && hit.statements === 1, `every ref resolves by its key: ONE statement (${D1.statements.length - n0})`);
  const byName = await MR.resolveMapRefs(env, "alpha", [{ lane: "code", screens: "Home", components: ["worker"] }], {});
  ok(byName.statements === 2 && byName.screens("Home").ok && byName.components(["worker"]).ok, "a screen by its exact name and a part of the architecture are found by the second statement");
  const s = hit.screens("goals, screen:home, screen:decisions");
  ok(s.ok && same(s.valid, ["screen:goals", "screen:home", "screen:decisions"]), `a screen by its id without "screen:" and with it (${JSON.stringify(s.valid)})`);
  ok(hit.components(["service:cloudflare-d1", "mind/engines"]).ok, "a component by its node id, and the mind namespace");
  ok(hit.depends(["q/Q1", "goal/g1", "check/AC.1", "T-20261001-001", "door:mcp:preview"]).ok, "depends by a question, a goal, a check, a contribution's id (not read) and a node");
}
{
  const n0 = D1.statements.length;
  const miss = await MR.resolveMapRefs(env, "alpha", [{ lane: "code", screens: "001, gols, secret-admin", components: ["made-up", "cloudflare-d"], depends: ["q/NOPE", "goal/nope", "screen:hme"] }], { near: true, goalIds: ["g1"] });
  ok(D1.statements.length - n0 === 2, `a miss reads the names once more: two statements in all, never one per ref (${D1.statements.length - n0})`);
  const s = miss.screens("001, gols, secret-admin");
  ok(!s.ok && same(s.unknown, ["001", "gols", "secret-admin"]), `a made-up 001, a typo and another project's screen are not in the Map (${JSON.stringify(s.unknown)})`);
  ok(same(miss.near("gols", "screens").map((x) => x.id), ["screen:goals"]), `near matches of "gols": ${JSON.stringify(miss.near("gols", "screens").map((x) => x.id))}`);
  ok(!JSON.stringify([miss.near("secret-admin", "screens"), miss.near("001", "screens")]).includes("secret"), "a near match never names another project's node");
  ok(miss.near("cloudflare-d", "components").some((x) => x.id === "service:cloudflare-d1") && miss.near("x", "components").length <= MR.NEAR_MAX, "a component's near matches come from the Map's nodes, at most three");
  const d = miss.depends(["q/NOPE", "goal/nope", "screen:hme"]);
  ok(!d.ok && same(d.unknown, ["q/NOPE", "goal/nope", "screen:hme"]), "a question, a goal and a node not in the project are each named");
  const quiet = await MR.resolveMapRefs(env, "alpha", [{ lane: "code", screens: "gols" }], { near: false });
  ok(same(quiet.near("gols", "screens"), []), "no near match unless the caller asked (the preview asks after its read-scope check)");
  const noMap = await MR.resolveMapRefs(env, "gamma", [{ lane: "code", screens: "001" }], {});
  ok(!noMap.screens("001").ok, "a project with no Map: a made-up 001 does not pass");
  ok(!(await MR.resolveMapRefs(env, "gamma", [{ lane: "code", screens: "061" }], {})).screens("061").ok && !(await MR.resolveMapRefs(env, "alpha", [{ screens: "061" }], {})).screens("061").ok,
    "no old register: the project's own Map is the only check, with or without screens");
}
// the plans: no statement scans a table it should search
const plan = (sql, args) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...args).map((r) => r.detail).join(" | ");
{
  const p1 = plan(MR.MAP_REFS_SQL, ["alpha", "[]", "[]", "[]"]);
  ok(!/SCAN (k_nodes|k_questions|k_checks)\b/.test(p1) && /SEARCH k_nodes/.test(p1) && /SEARCH k_questions/.test(p1) && /SEARCH k_checks/.test(p1), `MAP_REFS_SQL searches every table by its key: ${p1}`);
  const p2 = plan(MR.MAP_NAMES_SQL, ["alpha", "[]", 0]);
  ok(/USING INDEX idx_k_nodes_type/.test(p2) && !/SCAN k_nodes\b/.test(p2), `MAP_NAMES_SQL reads the project's nodes of the asked types on idx_k_nodes_type: ${p2}`);
  const p3 = plan(GOALS_WAITING_SQL(false), ["alpha"]);
  ok(/idx_transmission_owner_open/.test(p3) && !/SCAN transmission\b/.test(p3), `G5 (what waits for the owner) reads the open owner queue's index range: ${p3}`);
  const p4 = plan(GTM_STRATEGY_SQL, ["alpha"]);
  ok(/SEARCH k_docs USING (INDEX sqlite_autoindex_k_docs_1|PRIMARY KEY) \(project=\? AND path>\? AND path<\?\)/.test(p4), `the Strategy read is one range of k_docs' primary key: ${p4}`);
}

// ---- 2 · the gate over the resolver ----
{
  const bodies = [
    { lane: "code", kind: "pr", what: "migrate-055", why: "w", touches: ["migrate-055", "table:k_questions"], proof: "sh tools/migrate-dryrun.sh --selftest -> exit 0, 8/8" },
    { lane: "code", kind: "pr", what: "the Goals page", why: "w", touches: ["screen:goals"], screens: "goals,home", components: ["service:cloudflare-d1"], proof: "smoke 93/93, 51 selftests" },
    { lane: "code", kind: "pr", what: "the eagle", why: "w", touches: ["ui"], screens: "eagle", proof: "smoke 87/87" },
    { lane: "code", kind: "pr", what: "the setup", why: "w", touches: ["orchestrator/"], proof: "none" },
  ];
  const r = await MR.resolveMapRefs(env, "alpha", bodies, { near: true });
  const g = bodies.map((b) => gateGrade(b, r.screens, r.components, r.depends));
  ok(g[0].route === "auto" && g[1].route === "auto", "a migration with touches and proof, and a screen change whose screens are in the Map, file at once");
  ok(g[2].route === "incomplete" && same(g[2].grade.missing, ["screens"]) && same(g[2].grade.screenUnknown, ["eagle"]), "a screen not in the Map needs exactly that, never the owner");
  ok(g[3].route === "incomplete" && same(g[3].grade.missing, ["proof"]) && g[3].grade.proof === "missing", "\"none\" is no proof: it needs proof, and only that");
  const nd = needsOf(g[2].grade, "code", r);
  ok(nd.reasons.length === 1 && /^Screen eagle is not in the project's Map: (no near match|near )/.test(nd.reasons[0]) && nd.unknown[0].ref === "eagle", `the preview's reason names the ref and its near matches: ${nd.reasons[0]}`);
}

// ---- 3 · a goal's status ----
{
  const plan1 = S.planKnowledge([{ kind: "goal", op: "upsert", data: { id: "g", parent: null, title: "G", dimensions: [], status: "in-progress" } }], {}, { isOwner: true });
  ok(!plan1.errors.length && plan1.steps[0].row.status === "in progress", "a goal's status: the synonym in-progress is stored as in progress");
  const bad = S.planKnowledge([{ kind: "goal", op: "upsert", data: { id: "g", parent: null, title: "G", dimensions: [], status: "blocked" } }], {}, { isOwner: true });
  ok(bad.errors.length === 1 && /done, in progress, not started/.test(bad.errors[0].note), `a status outside the three is refused with them named: ${bad.errors[0] && bad.errors[0].note}`);
  ok(same(S.fieldDocs("goal").find((f) => f.name === "status").values, ["done", "in progress", "not started"]) && ["target", "weight", "outcomeMetric"].every((k) => S.fieldDocs("goal").find((f) => f.name === k).hint.length > 20),
    "formats gives status its values and explains target, weight and outcomeMetric in a line each");
  const tree = [{ id: "r", parent: null, dimensions: [] }, { id: "a", parent: "r", dimensions: ["code"], status: "done" }, { id: "b", parent: "r", dimensions: ["code"] }];
  const roll = G.rollupCells(tree, []);
  ok(roll.nodes.find((n) => n.id === "a").pct === 100 && roll.nodes.find((n) => n.id === "b").pct === 0 && roll.globalPct === 50, "a done goal reads 100% with nothing measured; its parent rolls it up (50%)");
  ok(/100 when its status is done/.test(G.GOAL_PCT_RULE) && /waiting for the owner shows as awaiting/.test(G.GOAL_PCT_RULE) && /lane leader/.test(G.GOAL_PCT_RULE), "the % rule says what a goal's % is made of, in one sentence");
}

// ---- 4 · rulings ----
{
  const q = (data) => S.planKnowledge([{ kind: "question", op: "upsert", data: { qid: "Q", question: "Which?", ...data } }], {}, { isOwner: true });
  ok(!q({ status: "decided", options: [{ what: "A" }, { what: "B" }], choice: 1 }).errors.length, "a ruling with its options and its choice files");
  ok(!q({ status: "decided", options: [{ what: "The ruling" }], choice: 0 }).errors.length, "a ruling with the ruled option alone (choice 0) files");
  ok(!q({ status: "decided", label: "The ruling" }).errors.length, "a ruling with no option says it in label, and files");
  const one = q({ status: "decided", options: [{ what: "The ruling" }] });
  ok(one.errors.length === 1 && one.errors[0].error === "no_choice" && /choice 0/.test(one.errors[0].note), "one option with no choice and no label: send choice 0");
  const open1 = q({ status: "open", options: [{ what: "Only" }] });
  ok(open1.errors[0].error === "too_few_options" && /ruled option alone with choice 0/.test(open1.errors[0].note), "an open question needs two options, and the refusal says where a ruling goes");
  ok(S.KINDS.question.rules.some((r) => /ruled option alone/.test(r)), "formats says it outright, in the question's rules");
}

// ---- 5 · a card kind's idPattern ----
{
  const stored = { card_kind: new Map([["decision", { key: "decision", label: "Decisions", idPattern: "^d-\\d+$", roleVisibility: null }]]) };
  const card = (id) => S.planKnowledge([{ kind: "card", op: "upsert", data: { kind: "decision", id, name: "N" } }], stored, { isOwner: true });
  ok(!card("d-12").errors.length, "a card id that matches its kind's idPattern files");
  const bad = card("decision-probe");
  ok(bad.errors.length === 1 && bad.errors[0].error === "bad_id" && /idPattern/.test(bad.errors[0].note), "one that does not is refused, by the plan preview and the write both run");
  const ck = S.planKnowledge([{ kind: "card_kind", op: "upsert", data: { key: "k", label: "K", idPattern: "^(a+)+$" } }], {}, { isOwner: true });
  ok(ck.errors.length === 1, "a pattern that could backtrack without end ((a+)+) is refused");
}

// ---- 6 · source on knowledge ----
{
  const src = [{ kind: "file", ref: "docs/plan/README.md", label: "the plan" }, { kind: "url", ref: "https://github.com/x/y/pull/1" }];
  for (const [kind, data] of [["question", { qid: "Q", question: "Q?", status: "decided", label: "L" }], ["goal", { id: "g", parent: null, title: "G", dimensions: [] }], ["doc", { path: "a.md", body: "b" }], ["aim", { aim: "A" }]]) {
    const p = S.planKnowledge([{ kind, op: "upsert", data: { ...data, source: src } }], {}, { isOwner: true });
    ok(!p.errors.length && same(p.steps[0].row.source, src), `${kind} carries a source`);
  }
  const bad = S.planKnowledge([{ kind: "goal", op: "upsert", data: { id: "g", parent: null, title: "G", dimensions: [], source: [{ kind: "url", ref: "not a link" }] } }], {}, { isOwner: true });
  ok(bad.errors.length === 1 && bad.errors[0].note.includes("data.source"), "a source that is not the shape is refused, naming the field");
  const aim = S.planKnowledge([{ kind: "aim", op: "upsert", data: { aim: "A", asOf: "2026-09-30", confidence: "direction" } }, { kind: "gtm", op: "upsert", data: { template: S.KINDS.gtm.example.op.data.template, asOf: "2026-09-30", confidence: "proposal" } }], {}, { isOwner: true });
  ok(!aim.errors.length, "the aim and the GTM template take asOf and confidence");
  ok(S.showsOf("doc", { path: "gtm/positioning.md" }).some((p) => p.tab === "gtm" && p.region === "strategy") && !S.showsOf("doc", { path: "notes.md" }).some((p) => p.tab === "gtm"), "a doc under gtm/ shows on GTM's Strategy; another doc does not");
}

// ---- 7 · holes ----
{
  for (const it of C.CHECKLIST) {
    const f = C.fillOf({ id: it.id }, "alpha");
    const fp = f.fillPath;
    ok(fp === null ? it.id === "agents-equipped" : fp.tool === "preview" ? C.callText(fp).startsWith("preview {") && Array.isArray(fp.args.items) && /then file/.test(fp.then) : fp.tool === "rule_question",
      `${it.id}: its fillPath is ${fp ? fp.tool : "an Equip press"}, and its fill line says the same call`);
  }
  ok(C.meterWords({ done: 4, total: 14, pct: 50 }) === "4 of 14 complete · 50% by depth", "the meter's words say what the % is: depth");
  const areas = (on) => ["core", "app", "proof", "gtm", "agents"].map((a) => ({ area: a, label: a === "gtm" ? "GTM" : a[0].toUpperCase() + a.slice(1), applies: on.includes(a), total: a === "gtm" ? 3 : 2, done: 0 }));
  ok(C.scopeWords(areas(["core", "app"])) === "it counts Core and App; Proof, GTM and Agents count once started", `what the meter counts: ${C.scopeWords(areas(["core", "app"]))}`);
  const w = C.meterChangeWords({ areas: areas(["core"]), meter: { done: 4, total: 14 } }, { areas: areas(["core", "gtm"]), meter: { done: 5, total: 17 } });
  ok(w === "GTM now counts: +3 items (the meter: 4 of 14 complete -> 5 of 17)", `when an area starts to count, the receipt says so: ${w}`);
  ok(C.meterChangeWords({ areas: areas(["core"]), meter: {} }, { areas: areas(["core"]), meter: {} }) === "", "no area started: nothing said");
}

// ---- 8 · whoami and the batch clientRef ----
{
  ok(/You are the owner: your writes can land in any of the org's 2 active projects \(alpha, beta\)/.test(projectGloss(null, [], null, null, { owner: true, orgKeys: ["alpha", "beta"] })), "the owner with no seat is told every project their writes can land in");
  ok(/land in "alpha", the org's one project/.test(projectGloss(null, [], null, null, { owner: true, orgKeys: ["alpha"] })), "the owner of a one-project org: that project");
  ok(projectGloss(null, [], null, null, {}) === "You hold no project seat — your writes are recorded at the org level.", "a seatless member of an org with no one project: the org level, as before");
  ok(/create_project/.test(projectGloss(null, [], null, null, { owner: true, orgKeys: [] })) && !/org level/.test(projectGloss(null, [], null, null, { owner: true, orgKeys: [] })), "D1b item 11: the owner of an org with no project is pointed at create_project");
  ok(/refused project_required, never filed at the org level/.test(projectGloss(null, [], null, null, { owner: true, orgKeys: ["alpha", "beta"] })), "D1b item 4: the seatless owner of a two-project org is told an unnamed write is refused");
  ok(BATCH_REF_RE.test("sharingu-history-c1") && !BATCH_REF_RE.test("x".repeat(49)) && !BATCH_REF_RE.test("a b"), "the batch clientRef: 1 to 48 of letters, digits, . _ : -");
}

console.log(`onepass selftest: ${pass} pass · ${fail} fail`);
if (fail) process.exit(1);
