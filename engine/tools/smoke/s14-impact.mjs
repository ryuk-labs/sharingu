// tools/smoke/s14-impact.mjs — sprint 3, B4: impact and carry-forward, through the real door. Self-contained: it adds its own
// project (s14) and its people (two members seated on it, a Partner seated nowhere), so it reads nothing an earlier case left.
//   · a screen, a door it depends on (and the door's table, a flow), a check on each, both graded proven: both lights green;
//   · a code contribution naming the screen, its next action due tomorrow for the second member: its Impact view lists the
//     door it reaches and ONE check to redo (the screen's, graded before it), with the regrade call; the screen's light is
//     STALE on the Map (the layout's mark, the inspector's line) and What is missing asks for the regrade first; impact
//     {refs} agrees; Home lists it under What changed and, for the second member, under Follow-ups due as theirs;
//   · the second member picks it up: a handover recorded on the contribution, its page and Build's row; a second pick-up
//     is told who has it; the follow-up leaves the due list; the regrade makes the light fresh again everywhere;
//   · a card whose asOf is older than its kind's shelf life is due for review (its answer, its page, the checklist);
//   · a Partner seated nowhere gets nothing from impact (not_found by id, project_forbidden by refs).
import { smoke, expect, brief, http, mcp, html, ownerKey, control, kwrite, contribute, kread } from "./lib.mjs";

const TAG = String(process.env.S14_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s14" + TAG;
const q = {};
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return { key, email, name };
};
const MODEL = [
  { kind: "node", op: "upsert", data: { id: "screen:s14-pricing", type: "screen", name: "S14 Pricing", data: { surface: "s14-web", lane: "buy", step: 1, states: ["annual"] } } },
  { kind: "node", op: "upsert", data: { id: "door:s14-prices", type: "door", name: "GET /s14/prices" } },
  { kind: "node", op: "upsert", data: { id: "table:s14-prices", type: "table", name: "s14 prices" } },
  { kind: "edge", op: "upsert", data: { from: "screen:s14-pricing", to: "door:s14-prices", kind: "depends", label: "calls" } },
  { kind: "edge", op: "upsert", data: { from: "door:s14-prices", to: "table:s14-prices", kind: "reads" } },
  { kind: "check", op: "upsert", data: { id: "AC.s14.screen", title: "The pricing screen shows the annual plan", refs: ["screen:s14-pricing"] } },
  { kind: "check", op: "upsert", data: { id: "AC.s14.door", title: "The prices door answers the plans", refs: ["door:s14-prices"] } },
];
const light = async (ref, key = ownerKey) => (await mcp(key, "map", { project: P, ref })).out;
const holesGrades = async () => ((await mcp(ownerKey, "missing", { project: P })).out.items || []).find((h) => h.id === "grades") || null;
const tomorrow = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);

smoke("impact: a screen and a door it reaches, a check on each, both graded proven: both lights green", async () => {
  await control({ action: "add-project", key: P, name: "S14" });
  q.a = await invite("S14 Ada", `ada${TAG}@s14.local`, "member", [P]);
  q.b = await invite("S14 Bo", `bo${TAG}@s14.local`, "member", [P]);
  q.loner = await invite("S14 Loner", `loner${TAG}@s14.local`, "partner", []);
  const m = await kwrite(ownerKey, { project: P, ops: MODEL });
  expect(!m.isError && m.out.written === MODEL.length, () => brief(m.out));
  for (const id of ["AC.s14.screen", "AC.s14.door"]) {
    const g = await mcp(q.a.key, "submit_grade", { project: P, checkId: id, verdict: "proven", proof: "node tools/s14.mjs -> exit 0" });
    expect(!g.isError && g.out.counted === true, () => brief(g.out));
  }
  const s = await light("screen:s14-pricing"), d = await light("door:s14-prices");
  expect(s.state === "green" && d.state === "green" && !s.stale && !d.stale, () => brief([s.state, s.stale, d.state]));
  const gr = await holesGrades();
  expect(!gr, () => `grades still open: ${brief(gr)}`);
  return "the screen and the door lit green, nothing stale, grades done";
});

smoke("impact: a code contribution naming the screen: its Impact view reaches the door and asks for ONE regrade; the light is stale on the Map and in What is missing; impact {refs} agrees", async () => {
  const by = tomorrow();
  const f = await contribute(q.a.key, { project: P, lane: "code", kind: "pr", what: "S14 the annual toggle on pricing", why: "Buyers asked for annual billing.",
    touches: ["screen:s14-pricing"], proof: "npm test -> exit 0", next: { what: "S14 review the annual copy", who: q.b.email, by } });
  expect(!f.isError && /^T-\d{8}-\d+$/.test(f.out.id || ""), () => brief(f.out));
  q.tx = f.out.id;
  const imp = await http("GET", `/contribution/${q.tx}/impact`, { key: q.a.key });
  const i = imp.json || {};
  expect(imp.status === 200 && i.touched.names.some((n) => n.id === "screen:s14-pricing" && n.how) && i.reached.names.some((n) => n.id === "door:s14-prices")
    && i.proof.toRedo.length === 1 && i.proof.toRedo[0].id === "AC.s14.screen" && i.proof.toRedo[0].stale === true && /^submit_grade \{"project":"[^"]+","checkId":"AC\.s14\.screen",/.test(i.proof.calls[0].call) && /1 check to redo/.test(i.line),
    () => `impact ${imp.status}: ${brief({ touched: i.touched, reached: i.reached, proof: i.proof, line: i.line })}`);
  const page = await html(`/contribution/${q.tx}/impact`, q.a.key);
  expect(page.status === 200 && page.text.includes('data-region="proof"') && page.text.includes('data-check="AC.s14.screen" data-state="stale"') && page.text.includes('data-reached="door:s14-prices"'), () => `page ${page.status}`);
  const s = await light("screen:s14-pricing"), d = await light("door:s14-prices");
  expect(s.stale && s.stale.count === 1 && s.stale.by === q.tx && !d.stale, () => brief([s.stale, d.stale]));
  const insp = await http("GET", `/map/node?ref=screen:s14-pricing&project=${P}`, { key: ownerKey });
  const ih = (await html(`/map/node?ref=screen:s14-pricing&project=${P}`, ownerKey)).text;
  expect(insp.status === 200 && /data-stale="1"/.test(ih) && /1 of 1 check graded before the last change/.test(ih), () => `inspector: ${(ih.match(/mx-stale[\s\S]{0,240}/) || [""])[0]}`);
  const map = await http("GET", `/map?project=${P}`, { key: ownerKey });
  const node = ((map.json && map.json.nodes) || []).find((n) => n.r === "screen:s14-pricing");
  expect(map.status === 200 && node && node.z === 1 && map.json.counts.stale === 1, () => `map ${map.status}: ${brief(node)}`);
  const gr = await holesGrades();
  expect(gr && /stale/.test(gr.what) && gr.first && gr.first.id === "AC.s14.screen" && gr.what.includes(`since ${q.tx}`) && gr.fillPath.tool === "submit_grade" && gr.fillPath.args.checkId === "AC.s14.screen", () => `holes: ${brief(gr)}`);
  const ref = (await mcp(q.a.key, "impact", { project: P, refs: ["screen:s14-pricing"] })).out;
  expect(!ref.error && ref.reached.names.some((n) => n.id === "door:s14-prices") && ref.proof.toRedo.some((c) => c.id === "AC.s14.screen") && ref.decisions && ref.goals, () => brief(ref));
  const home = await http("GET", `/home/summary?project=${P}`, { key: q.b.key });
  const wc = ((home.json && home.json.whatChanged && home.json.whatChanged.rows) || []).find((r) => r.id === q.tx);
  const fu = ((home.json && home.json.followUps && home.json.followUps.rows) || []).find((r) => r.id === q.tx);
  expect(home.status === 200 && wc && wc.toRedo === 1 && /changed/.test(wc.line) && fu && fu.mine === true && fu.by === by, () => `home ${home.status}: ${brief({ wc, fu })}`);
  return `${q.tx}: reaches the door, 1 check to redo (${i.line}); the screen's light stale on the Map (z 1) and in its inspector; holes: ${gr.what}; impact {refs} agrees; Home lists it under What changed and as Bo's follow-up due ${by}`;
});

smoke("pick-up: the second member takes the next action (a handover, on the page and Build), a second pick-up is told who has it, the follow-up leaves the due list", async () => {
  const p = (await mcp(q.b.key, "pick_up", { id: q.tx })).out;
  expect(!p.error && p.pickedUp && p.handedOver === true && p.next && p.next.who === q.b.email, () => brief(p));
  const again = await mcp(q.a.key, "pick_up", { id: q.tx });
  expect(again.isError && again.out.error === "next_taken" && again.out.pickedUp.by.name === "S14 Bo", () => brief(again.out));
  const rest = await http("POST", `/contribution/${q.tx}/pick-up`, { key: ownerKey, body: {} });
  expect(rest.status === 409 && rest.json.error === "next_taken", () => `${rest.status} ${brief(rest.json)}`);
  const page = await html(`/contribution/${q.tx}?page=1`, q.a.key);
  expect(page.status === 200 && page.text.includes('data-region="next-action"') && /Picked up by <b>S14 Bo<\/b>/.test(page.text) && page.text.includes('data-region="impact"'), () => `page ${page.status}`);
  const b = await http("GET", `/build?project=${P}`, { key: q.a.key });
  const row = ((b.json && b.json.rows) || []).find((r) => r.id === q.tx);
  expect(row && row.pickedUp && row.pickedUp.by === "S14 Bo", () => brief(row));
  const home = await http("GET", `/home/summary?project=${P}`, { key: q.b.key });
  expect(!((home.json.followUps && home.json.followUps.rows) || []).some((r) => r.id === q.tx), "the picked-up follow-up still lists as due");
  const done = (await mcp(q.b.key, "pick_up", { id: q.tx, done: true, note: "S14 copy reviewed" })).out;
  expect(!done.error && done.done && done.done.note === "S14 copy reviewed", () => brief(done));
  return `Bo picked up ${q.tx} (taken over from Ada), Ada's and the owner's second pick-up next_taken naming Bo, its page and Build say so, it left the due list, Bo marked it done`;
});

smoke("regrade: the stale check graded again is fresh everywhere: the Map, the inspector, What is missing, the Impact view", async () => {
  const g = await mcp(q.a.key, "submit_grade", { project: P, checkId: "AC.s14.screen", verdict: "proven", proof: "node tools/s14.mjs -> exit 0 (after the toggle)" });
  expect(!g.isError && g.out.counted, () => brief(g.out));
  const s = await light("screen:s14-pricing");
  const map = await http("GET", `/map?project=${P}`, { key: ownerKey });
  const node = ((map.json && map.json.nodes) || []).find((n) => n.r === "screen:s14-pricing");
  const gr = await holesGrades();
  const imp = (await http("GET", `/contribution/${q.tx}/impact`, { key: q.a.key })).json;
  const lights = await http("GET", `/map/lights?since=2000-01-01T00:00:00.000Z&project=${P}`, { key: ownerKey });
  const mark = ((lights.json && lights.json.stale) || []).find((z) => z.id === "screen:s14-pricing");
  expect(s.state === "green" && !s.stale && node && !node.z && !gr && imp.proof.toRedo.length === 0 && imp.proof.regraded.some((c) => c.id === "AC.s14.screen") && mark && mark.stale === 0,
    () => brief({ s: s.stale, z: node && node.z, gr, redo: imp.proof.toRedo, mark }));
  return "regraded: green and fresh on the Map and in the inspector, grades done, the Impact view lists it as graded again since, the lights poll carried the mark back to 0";
});

smoke("stale by age: a card whose asOf is older than its kind's shelf life is due for review: its answer, its page and the checklist say so", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [{ kind: "card_kind", op: "upsert", data: { key: "s14claim", label: "S14 Claims", reviewAfterDays: 30 } },
    { kind: "card", op: "upsert", data: { kind: "s14claim", id: "old-1", name: "S14 teams file in ten minutes", asOf: "2026-01-02", confidence: "direction" } },
    { kind: "card", op: "upsert", data: { kind: "s14claim", id: "new-1", name: "S14 a fresh claim", asOf: new Date().toISOString().slice(0, 10) } }] });
  expect(!w.isError && w.out.written === 3, () => brief(w.out));
  const bad = await kwrite(ownerKey, { project: P, ops: [{ kind: "card_kind", op: "upsert", data: { key: "s14claim", label: "S14 Claims", reviewAfterDays: 0 } }] });
  expect(bad.isError, () => `reviewAfterDays 0 was accepted: ${brief(bad.out)}`);
  const c = ((await kread(ownerKey, { project: P, ref: "card/s14claim/old-1" })).out || {}).item || {};   // D5: read {ref: card/<kind>/<id>}
  const n = ((await kread(ownerKey, { project: P, ref: "card/s14claim/new-1" })).out || {}).item || {};
  expect(c.review && c.review.due === true && c.review.days === 30 && n.review && n.review.due === false, () => brief([c.review, n.review]));
  const page = await html(`/read?ref=card/s14claim/old-1&project=${P}`, ownerKey);   // sprint 3 D2: the card's page, the new path
  expect(page.status === 200 && /due for review/.test(page.text), () => `card page ${page.status}`);
  const h = (await mcp(ownerKey, "missing", { project: P })).out;
  const it = (h.items || []).find((x) => x.id === "knowledge-fresh");
  expect(it && it.have === 1 && it.want === 2 && it.first && it.first.id === "card:s14claim/old-1" && it.fillPath && it.fillPath.args.items[0].data.asOf, () => brief(it));
  return `old-1 (as of 2026-01-02, a 30-day kind) due for review on its answer, its page and in What is missing (${it.what}); new-1 fresh; a shelf life of 0 refused`;
});

smoke("impact: a Partner seated nowhere gets nothing: not_found by id, project_forbidden by refs; the page is the usual 404", async () => {
  const byId = await mcp(q.loner.key, "impact", { contribution: q.tx });
  const byRefs = await mcp(q.loner.key, "impact", { project: P, refs: ["screen:s14-pricing"] });
  const page = await http("GET", `/contribution/${q.tx}/impact`, { key: q.loner.key });
  const pick = await mcp(q.loner.key, "pick_up", { id: q.tx });
  expect(byId.isError && byId.out.error === "not_found" && byRefs.isError && byRefs.out.error === "project_forbidden" && page.status === 404 && pick.isError && pick.out.error === "not_found",
    () => brief([byId.out, byRefs.out, page.status, pick.out]));
  return "impact by id not_found, by refs project_forbidden, the Impact view 404, pick_up not_found";
});
