// tools/smoke/s1-goals.mjs — slice 1: Goals and Home read D1. What s0 left on project smoke (the aim with its measure, the
// tree ship-the-loop > file-it, see-it) shows on /home and /goals; a goal filed through preview then file shows in the tree on
// the next load; one goal reads through GET /goals/:ref and the `goal` tool; the door checks a goalRef against the filed
// tree.
import { smoke, expect, brief, s, G, http, mcp, html, ownerKey, kwrite, contribute } from "./lib.mjs";

const region = (page, r) => (new RegExp(`data-region="${r}"[\\s\\S]*?</section>`).exec(page) || [""])[0];
const q = (s) => s.replace(/"/g, "&quot;");   // how a sentence with quotes reads in the page's HTML

smoke("the filed aim and its measure show on Home", async () => {
  const j = await http("GET", "/home/summary?project=smoke", { key: ownerKey });
  expect(j.status === 200 && j.json.project.key === "smoke" && j.json.aim.text === "Prove the loop on glass" && j.json.aim.measure
    && j.json.aim.measure.name === "loops closed" && j.json.aim.measure.value === 1 && j.json.aim.measure.prior === 0, () => `GET /home/summary: ${j.status} ${brief(j.json && j.json.aim)}`);
  const p = await html("/home?project=smoke");
  const aim = region(p.text, "aim");
  expect(p.status === 200 && /loops closed/.test(aim) && /Prove the loop on glass/.test(aim) && /data-value="1"/.test(aim) && !/data-state="empty"/.test(aim), () => `GET /home aim region: ${p.status} ${aim.slice(0, 300)}`);
  return "GET /home/summary and the page's aim region: \"Prove the loop on glass\", loops closed 1 against 0";
});

smoke("the filed goals show on Goals, declared", async () => {
  const j = await http("GET", "/goals?project=smoke&period=all", { key: ownerKey });
  const ids = (j.json && j.json.nodes || []).map((n) => n.id).join(",");
  expect(j.status === 200 && j.json.declared === true && ids === "ship-the-loop,file-it,see-it" && j.json.nodes[0].depth === 0 && j.json.nodes[1].depth === 1
    && j.json.project.key === "smoke" && j.json.project.name === "Smoke", () => `GET /goals: ${j.status} ${brief(j.json)}`);
  const tool = await mcp(ownerKey, "goals", { project: "smoke", period: "all" });
  expect(!tool.isError && JSON.stringify(tool.out.nodes) === JSON.stringify(j.json.nodes) && tool.out.declared === true, () => `goals tool: ${brief(tool.out)}`);
  const p = await html("/goals?project=smoke");
  const tree = region(p.text, "goal-tree");
  expect(p.status === 200 && /Ship the loop, end to end/.test(tree) && /file it/.test(tree) && /see it/.test(tree) && !/data-state="empty"/.test(tree),
    () => `GET /goals page: ${p.status} ${tree.slice(0, 300)}`);
  return `declared: true, nodes ${ids} (the root first), the goals tool equal to GET /goals, the page draws the three titles`;
});

smoke("a goal filed through preview then file shows in the tree on the next load", async () => {
  const w = await kwrite(ownerKey, { project: "smoke", ops: [G("prove-it-live", "ship-the-loop", { dimensions: ["leader"] })] });
  expect(!w.isError && w.out.written === 1, () => brief(w.out));
  s.ledgers.push(w.out.ledger);
  const j = await http("GET", "/goals?project=smoke", { key: ownerKey });
  expect(j.json.nodes.some((n) => n.id === "prove-it-live" && n.depth === 1), () => `nodes ${brief(j.json.nodes.map((n) => n.id))}`);
  const p = await html("/goals?project=smoke");
  expect(/prove it live/.test(region(p.text, "goal-tree")), () => `goal-tree: ${region(p.text, "goal-tree").slice(0, 400)}`);
  return `the next GET /goals (JSON and page) has prove-it-live under ship-the-loop (filing ${w.out.ledger})`;
});

smoke("one goal reads through GET /goals/:ref and the goal tool", async () => {
  const j = await http("GET", "/goals/file-it?project=smoke", { key: ownerKey });
  expect(j.status === 200 && j.json.node.id === "file-it" && j.json.node.title === "file it" && j.json.parent && j.json.parent.id === "ship-the-loop", () => `${j.status} ${brief(j.json)}`);
  const t = await mcp(ownerKey, "goals", { project: "smoke", ref: "file-it" });
  expect(!t.isError && t.out.node && t.out.node.id === "file-it" && JSON.stringify(t.out.trail) === JSON.stringify(j.json.trail), () => brief(t.out));
  const root = await http("GET", "/goals/ship-the-loop?project=smoke", { key: ownerKey });
  expect(root.status === 200 && root.json.children.map((c) => c.id).sort().join() === "file-it,prove-it-live,see-it", () => `${root.status} ${brief(root.json && root.json.children)}`);
  const none = await http("GET", "/goals/no-such-goal?project=smoke", { key: ownerKey });
  const tnone = await mcp(ownerKey, "goals", { project: "smoke", ref: "no-such-goal" });
  expect(none.status === 404 && none.json.error === "unknown_goal" && tnone.out.error === "unknown_goal", () => `unknown: ${none.status} ${brief(none.json)} / ${brief(tnone.out)}`);
  return "file-it under ship-the-loop on both doors; the root lists its three children; an unknown ref is 404 unknown_goal";
});

// D2b (pristine copy, owner 2026-10-02): the JSON note names the call (an AI client needs it); the page's empty states are a
// phrase and one button to What is missing, never the call
smoke("a project with no goal: the JSON names preview then file, the page's empty states are a phrase", async () => {
  const j = await http("GET", "/goals?project=local", { key: ownerKey });
  expect(j.status === 200 && j.json.declared === false && j.json.nodes.length === 0 && /preview then file/.test(j.json.note || "") && /"goal"/.test(j.json.note || ""), () => `${j.status} ${brief(j.json)}`);
  const p = await html("/goals?project=local");
  const tree = region(p.text, "goal-tree");
  expect(/data-state="empty"/.test(tree) && /No goals yet/.test(tree) && !/preview then file/.test(tree) && /href="\/missing"/.test(tree), () => `goal-tree: ${tree.slice(0, 300)}`);
  const h = await html("/home?project=local");
  const aim = region(h.text, "aim");
  expect(/data-state="empty"/.test(aim) && /No aim yet/.test(aim) && !/preview then file/.test(aim), () => `aim: ${aim.slice(0, 300)}`);
  return `local: declared false, "${j.json.note}"; the page: "No goals yet", "No aim yet"`;
});

smoke("the door checks a goalRef against the filed tree", async () => {
  const ok = await contribute(ownerKey, { project: "smoke", lane: "leader", kind: "note", what: "The loop closes on glass", why: "the smoke files it against a filed goal", goalRef: "file-it" });
  expect(!ok.isError && /^T-\d{8}-\d{3}$/.test(ok.out.id) && !/not in the current goal tree/.test(ok.out.note || ""), () => brief(ok.out));
  const node = await mcp(ownerKey, "goals", { project: "smoke", ref: "file-it", period: "all" });
  expect((node.out.filings && node.out.filings.rows || []).some((r) => r.id === ok.out.id), () => `file-it's filings: ${brief(node.out.filings)}`);
  const bad = await contribute(ownerKey, { project: "smoke", lane: "leader", kind: "note", what: "A note on a goal nobody filed", why: "the smoke names an unknown goal", goalRef: "no-such-goal" });
  // D5: the door says it in the preview (the item's reasons), before anything is filed; the contribution still files
  expect(!bad.isError && bad.out.id && /no-such-goal/.test(JSON.stringify((bad.preview && bad.preview.items) || [])) && /not in (the|this project's) (current )?goal tree|no goal/i.test(JSON.stringify((bad.preview && bad.preview.items) || [])), () => brief(bad.preview && bad.preview.items));
  return `goalRef file-it recorded with no note (${ok.out.route}) and listed on the goal; goalRef no-such-goal recorded with the unknown note`;
});

smoke("Build draws goal titles and the finish line from the filed tree", async () => {
  const b = await mcp(ownerKey, "build", { project: "smoke", sort: "goal" });
  const fl = b.out.finishLine || {};
  const row = (b.out.rows || []).find((r) => r.goal && r.goal.ref === "file-it");
  expect(!b.isError && fl.total === 3 && fl.done + fl.gating + fl.deferred === 3 && row && row.goal.title === "file it" && b.out.project.name === "Smoke", () => `finishLine ${brief(fl)}, row ${brief(row)}`);
  return `finish line ${fl.done} of ${fl.total} stages (the three leaves), the row on file-it titled "file it"`;
});

// sprint 4, F1 (P3's fault 1: finance read no money): a goal's budget through preview then file; Goals adds it up the tree on
// the tool, its REST twin and the tab; a goal's page shows it beside its measure; brief {for: "finance"} lists the goals that
// carry one; a second currency reads mixed, each added up on its own
smoke("money: a goal's budget rolls up the tree on goals and the tab; its page shows it; the finance brief lists it", async () => {
  const w = await kwrite(ownerKey, { project: "smoke", ops: [
    { kind: "goal", op: "upsert", data: { id: "file-it", budget: { allocated: 1000, spent: 250, currency: "eur", source: "the smoke plan" } } },
    { kind: "goal", op: "upsert", data: { id: "see-it", budget: { allocated: 500, spent: 100, currency: "EUR" } } }] });
  expect(!w.isError && w.out.written === 2, () => brief(w.out));
  const bad = await kwrite(ownerKey, { project: "smoke", ops: [{ kind: "goal", op: "upsert", data: { id: "see-it", budget: { allocated: -5, currency: "EUROS" } } }] });
  expect(bad.isError && /budget/.test(JSON.stringify(bad.out.errors)), () => `a bad budget: ${brief(bad.out)}`);
  const j = await http("GET", "/goals?project=smoke", { key: ownerKey });
  const node = (id) => (j.json.nodes || []).find((n) => n.id === id) || {};
  const sum = { currency: "EUR", allocated: 1500, spent: 350, goals: 2 };
  expect(j.status === 200 && JSON.stringify(j.json.budget) === JSON.stringify(sum) && JSON.stringify(node("ship-the-loop").budgetSum) === JSON.stringify(sum) && !node("ship-the-loop").budget
    && node("file-it").budget.currency === "EUR" && node("file-it").budget.source === "the smoke plan" && node("file-it").budgetSum.allocated === 1000 && !node("prove-it-live").budgetSum,
    () => `GET /goals: ${brief(j.json.budget)} · root ${brief(node("ship-the-loop"))}`);
  const tool = await mcp(ownerKey, "goals", { project: "smoke" });
  expect(!tool.isError && JSON.stringify(tool.out.budget) === JSON.stringify(j.json.budget) && JSON.stringify(tool.out.nodes) === JSON.stringify(j.json.nodes), () => `goals tool: ${brief(tool.out.budget)}`);
  const p = await html("/goals?project=smoke");
  expect(/data-metric="budget" data-value="350"/.test(p.text) && /of 1,500 allocated/.test(p.text) && /350 of 1,500 EUR spent/.test(p.text), () => `the tab: ${(/data-metric="budget"[^>]*>/.exec(p.text) || ["no budget tile"])[0]}`);
  const g = await html("/goals/file-it?project=smoke");
  const cells = (/data-region="cells"[\s\S]*?<\/section>/.exec(g.text) || [""])[0];
  expect(/data-metric="budget" data-value="250"/.test(cells) && /of 1,000 allocated/.test(cells) && /250 of 1,000 EUR spent, from the smoke plan/.test(cells), () => `the goal's page: ${g.status} ${cells.slice(0, 300)}`);
  const f = await mcp(ownerKey, "brief", { project: "smoke", for: "finance" });
  const fg = (f.out.goals || []).map((x) => `${x.ref}:${x.budget && x.budget.allocated}`).sort().join();
  expect(!f.isError && fg === "goal/file-it:1000,goal/see-it:500" && JSON.stringify(f.out.budget) === JSON.stringify(sum) && !f.out.goalsNote, () => `finance brief: ${fg} · ${brief(f.out.budget)}`);
  const mix = await kwrite(ownerKey, { project: "smoke", ops: [{ kind: "goal", op: "upsert", data: { id: "prove-it-live", budget: { allocated: 200, currency: "USD" } } }] });
  const jm = (await http("GET", "/goals?project=smoke", { key: ownerKey })).json;
  expect(!mix.isError && jm.budget.currency === "mixed" && JSON.stringify(jm.budget.byCurrency) === JSON.stringify([{ currency: "EUR", allocated: 1500, spent: 350 }, { currency: "USD", allocated: 200, spent: 0 }]),
    () => `mixed: ${brief(jm.budget)}`);
  const back = await kwrite(ownerKey, { project: "smoke", ops: [{ kind: "goal", op: "upsert", data: { id: "prove-it-live", budget: null } }] });
  expect(!back.isError && JSON.stringify((await http("GET", "/goals?project=smoke", { key: ownerKey })).json.budget) === JSON.stringify(sum), () => brief(back.out));
  return `EUR 350 of 1,500 spent on the top goal (file-it 1,000, see-it 500) on the tool, the twin and the tab's Spent tile; file-it's page shows its own; finance lists the two; a USD goal read mixed per currency`;
});
