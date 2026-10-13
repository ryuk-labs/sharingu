// tools/smoke/s0-core.mjs — slice 0: the knowledge core, through the door every client uses (D5: preview, then — sprint 19 —
// each part's write tool for the writes, `read` for the reads; their REST twins POST /preview, POST
// /preview/save-knowledge (and its two siblings) and GET /read), and the ledger row
import { smoke, expect, brief, s, G, goalIds, http, mcp, toolsList, control, addPerson, personId, readOnlyOf, ownerKey, kwrite, kread, contribute, restFileParts } from "./lib.mjs";

smoke("the fresh org serves the knowledge door", async () => {
  const names = await toolsList(ownerKey);
  expect(["preview", "file_contribution", "save_knowledge", "remove_knowledge", "read"].every((n) => names.includes(n)) && !names.includes("file"), () => `tools/list: ${names.join(" ")}`);
  const r = await http("GET", "/read?kind=goal", { key: ownerKey });
  expect(r.status === 200 && r.json.project === "local" && Array.isArray(r.json.items) && r.json.items.length === 0 && /preview then save_knowledge/.test(r.json.note || ""),
    () => `GET /read?kind=goal: ${r.status} ${brief(r.json)}`);
  return "preview, the three write tools and read listed (no file), GET /read?kind=goal empty on the fresh project, its note names preview then save_knowledge (every old name and address: s25-names)";
});

smoke("a person with no seat cannot write a single-project org's knowledge", async () => {
  s.outsider = await addPerson("Smoke Outsider", "outsider@smoke.local");   // seated on the one project at creation
  await control({ action: "revoke-seat", personId: s.outsider.id, projectKey: "local" });
  const w = await kwrite(s.outsider.key, { ops: [G("root", null)] });
  expect(w.isError && w.out.error === "project_forbidden" && w.out.project === "local", () => `preview: ${brief(w.out)}`);
  const r = await http("GET", "/read?kind=goal", { key: ownerKey });
  expect(r.json.items.length === 0, "a goal was written");
  return "project_forbidden on local (the door alone would have stamped them into it), nothing written";
});

smoke("a second project and a member seated on it", async () => {
  await control({ action: "add-project", key: "smoke", name: "Smoke" });
  s.member = await addPerson("Smoke Member", "member@smoke.local");
  await control({ action: "grant-seat", personId: s.member.id, projectKey: "smoke" });
  const who = await mcp(s.member.key, "whoami");
  expect(Array.isArray(who.out.projects) && who.out.projects.join() === "smoke", () => `whoami: ${brief(who.out)}`);
  return "project smoke added; the member holds one seat, on smoke";
});

smoke("the owner files an aim and three goals through preview then file", async () => {
  const w = await kwrite(ownerKey, { project: "smoke", clientRef: "smoke-aim-goals", ops: [
    { kind: "aim", op: "upsert", data: { aim: "Prove the loop on glass", measure: { name: "loops closed", value: 1, period: "this week", prior: 0, priorPeriod: "last week", source: "the ledger" } } },
    G("ship-the-loop", null, { dimensions: ["code"], weight: 3, target: 10 }), G("file-it", "ship-the-loop"), G("see-it", "ship-the-loop"),
  ] });
  const kinds = ((w.out.receipt || {}).items || []).map((x) => x.kind).join();
  expect(!w.isError && w.out.written === 4 && kinds === "aim,goal,goal,goal" && /^T-\d{8}-\d{3}$/.test(w.out.ledger), () => brief(w.out));
  s.first = w.out.ledger; s.ledgers.push(w.out.ledger);
  return `written 4 (1 aim, 3 goals), ledger ${w.out.ledger}`;
});

smoke("read returns the aim and the goals", async () => {
  const ids = await goalIds();
  expect(ids === "file-it,see-it,ship-the-loop", `goals: ${ids}`);
  const aim = await kread(ownerKey, { project: "smoke", kind: "aim" });
  expect(aim.out.items.length === 1 && aim.out.items[0].aim === "Prove the loop on glass" && aim.out.items[0].measure.value === 1, () => brief(aim.out));
  const root = await kread(ownerKey, { project: "smoke", kind: "goal", id: "ship-the-loop" });
  expect(root.out.item && root.out.item.weight === 3 && root.out.item.dimensions.join() === "code" && root.out.item.parent === null, () => brief(root.out));
  return "3 goals, the aim and its measure, one goal by id";
});

smoke("GET /read?kind=goal and GET /read?ref=goal/<id> answer as the read tool does", async () => {
  const list = await http("GET", "/read?project=smoke&kind=goal", { key: ownerKey });
  expect(list.status === 200 && list.json.items.map((g) => g.id).sort().join() === "file-it,see-it,ship-the-loop", () => `${list.status} ${brief(list.json)}`);
  const one = await http("GET", "/read?project=smoke&ref=goal/file-it", { key: ownerKey });
  const tool = await kread(ownerKey, { project: "smoke", ref: "goal/file-it" });
  expect(one.status === 200 && one.json.item.parent === "ship-the-loop" && JSON.stringify(one.json.item) === JSON.stringify(tool.out.item), () => `${one.status} ${brief(one.json)}`);
  const none = await http("GET", "/read?project=smoke&ref=goal/nope", { key: ownerKey });
  const kind = await http("GET", "/read?project=smoke&kind=planet", { key: ownerKey });
  expect(none.status === 404 && none.json.error === "not_found" && kind.status >= 400 && kind.json.error === "unknown_kind", `unknown id ${none.status}, unknown kind ${kind.status}`);
  return "the REST twin lists the same 3 goals and reads one, equal to the tool; an unknown id 404, an unknown kind refused";
});

smoke("an upsert of one field changes only that field", async () => {
  const before = (await kread(ownerKey, { project: "smoke", kind: "goal", id: "ship-the-loop" })).out.item;
  const w = await kwrite(ownerKey, { project: "smoke", clientRef: "smoke-title", ops: [{ kind: "goal", op: "upsert", data: { id: "ship-the-loop", title: "Ship the loop, end to end" } }] });
  expect(!w.isError && w.out.written === 1, () => brief(w.out));
  s.ledgers.push(w.out.ledger); s.titleLedger = w.out.ledger;
  const after = (await kread(ownerKey, { project: "smoke", kind: "goal", id: "ship-the-loop" })).out.item;
  const same = ["parent", "weight", "target", "createdAt", "createdBy"].every((f) => JSON.stringify(after[f]) === JSON.stringify(before[f])) && after.dimensions.join() === before.dimensions.join();
  expect(after.title === "Ship the loop, end to end" && same && after.updatedAt !== before.updatedAt, () => `before ${brief(before)} after ${brief(after)}`);
  return "the title changed; parent, weight, target, dimensions and createdAt kept";
});

smoke("a batch with one bad op writes nothing", async () => {
  const w = await kwrite(ownerKey, { project: "smoke", ops: [G("fourth", "ship-the-loop"), G("orphan", "no-such-goal")] });
  const e = (w.out.errors || [])[0] || {};
  expect(w.isError && w.out.error === "invalid_ops" && w.out.errors.length === 1 && e.index === 1 && e.kind === "goal" && e.id === "orphan" && e.error === "missing_parent" && /parent/.test(e.note || ""), () => brief(w.out));
  const ids = await goalIds();
  expect(ids === "file-it,see-it,ship-the-loop", `goals now: ${ids}`);
  return "invalid_ops: op 1 missing_parent with its note; the good op 0 was not written either";
});

smoke("the same batch again is a replay: nothing filed twice", async () => {
  // D5: preview then file with the batch's clientRef; an item stored the same previews `unchanged` and nothing is filed
  const w = await kwrite(ownerKey, { project: "smoke", clientRef: "smoke-title", ops: [{ kind: "goal", op: "upsert", data: { id: "ship-the-loop", title: "Ship the loop, end to end" } }] });
  const ids = await goalIds();
  expect(!w.isError && w.out.replay === true && w.out.written === 0 && ids === "file-it,see-it,ship-the-loop", () => `${brief(w.out)} · goals now: ${ids}`);
  return `replay: the batch previews unchanged, file is not called, nothing filed (the first call's ledger ${s.titleLedger} stands alone)`;
});

smoke("a question carries its options; an open one needs two", async () => {
  const q = { kind: "question", op: "upsert", data: { qid: "Q-smoke-1", question: "Which door files knowledge?", options: [{ what: "preview then file", tradeoff: "one validated path" }, { what: "a script of its own" }, { what: "a file in git" }] } };
  const w = await kwrite(ownerKey, { project: "smoke", ops: [q] });
  expect(!w.isError && w.out.written === 1, () => brief(w.out));
  s.ledgers.push(w.out.ledger);
  const r = await kread(ownerKey, { project: "smoke", kind: "question", id: "Q-smoke-1" });
  expect(r.out.item && r.out.item.status === "open" && r.out.item.options.map((o) => o.what).join() === "preview then file,a script of its own,a file in git", () => brief(r.out));
  const one = await kwrite(ownerKey, { project: "smoke", ops: [{ kind: "question", op: "upsert", data: { qid: "Q-smoke-2", question: "One option?", options: [{ what: "only" }] } }] });
  expect(one.isError && one.out.errors[0].error === "too_few_options", () => brief(one.out));
  return "open with 3 options in order; one option refused too_few_options";
});

// restPreviewFile(key, items, body) -> POST /preview then each part's write twin (POST /preview/save-knowledge, …), the two answers
const restPreviewFile = async (key, items, body = {}) => {
  const pv = await http("POST", "/preview", { key, body: { ...body, items } });
  const f = pv.json && pv.json.previewId ? await restFileParts(key, pv.json, items) : null;
  return { pv, f };
};
smoke("a seated member writes through POST /preview and POST /preview/save-knowledge, and cannot rule", async () => {
  const { pv, f } = await restPreviewFile(s.member.key, [G("member-goal", "ship-the-loop")]);
  const res = (f && f.json && f.json.results) || [];
  expect(pv.status === 200 && pv.json.project === "smoke" && f && f.status === 200 && res.length === 1 && res[0].status === "filed", () => `${pv.status} ${brief(pv.json)} / ${f && f.status} ${brief(f && f.json)}`);
  s.ledgers.push(res[0].id);
  expect((await goalIds()) === "file-it,member-goal,see-it,ship-the-loop", "the member's goal is not there");
  const rule = await restPreviewFile(s.member.key, [{ kind: "question", op: "upsert", data: { qid: "Q-smoke-1", status: "decided", choice: 0 } }]);
  const it = (rule.pv.json && rule.pv.json.items && rule.pv.json.items[0]) || {};
  expect(it.verdict === "refused" && it.refusal && it.refusal.error === "owner_only" && rule.f && rule.f.status === 422 && rule.f.json.error === "not_ready", () => `${rule.pv.status} ${brief(rule.pv.json)}`);
  return "200 and 200, the member's goal on the project; a member's ruling previews refused owner_only and save_knowledge files nothing";
});

smoke("a person with no seat on the project is refused", async () => {
  const w = await kwrite(s.outsider.key, { project: "smoke", ops: [G("intruder", "ship-the-loop")] });
  expect(w.isError && w.out.error === "project_forbidden", () => brief(w.out));
  const p = await http("POST", "/preview", { key: s.outsider.key, body: { project: "smoke", items: [G("intruder", "ship-the-loop")] } });
  expect(p.status === 403 && p.json.error === "project_forbidden", () => `${p.status} ${brief(p.json)}`);
  const r = await kread(s.outsider.key, { project: "smoke", kind: "goal" });
  expect(r.isError && r.out.error === "project_forbidden", () => brief(r.out));
  expect(!(await goalIds()).includes("intruder"), "the intruder goal was written");
  return "preview, POST /preview (403) and read all project_forbidden; nothing filed";
});

smoke("a read-only credential reads but cannot write", async () => {
  const ro = readOnlyOf(s.member.key);
  const w = await http("POST", "/preview/save-knowledge", { key: ro, body: { previewId: "P-0000000000000000", items: [G("read-only", "ship-the-loop")] } });
  expect(w.status === 403 && w.json.error === "read_only_credential", () => `${w.status} ${brief(w.json)}`);
  const r = await http("GET", "/read?kind=goal", { key: ro });
  expect(r.status === 200 && r.json.project === "smoke" && r.json.items.length === 4, () => `${r.status} ${brief(r.json)}`);
  return "POST /preview/save-knowledge 403 read_only_credential; GET /read reads the member's project";
});

smoke("kind knowledge is reserved to the knowledge door", async () => {
  const w = await contribute(ownerKey, { project: "smoke", lane: "leader", kind: "knowledge", what: "a forged knowledge row", why: "to prove the door refuses it", touches: ["goal:file-it"] });
  const it = ((w.preview && w.preview.items) || [])[0] || {};
  expect(w.isError && it.verdict === "refused" && it.refusal && it.refusal.error === "reserved_kind" && /preview, then save_knowledge/.test(it.refusal.note || "") && /remove_knowledge/.test(it.refusal.note || ""), () => brief(w.preview));
  return "a contribution of kind knowledge previews refused reserved_kind, its note naming preview then save_knowledge or remove_knowledge; nothing filed";
});

smoke("the ledger has one knowledge row per successful call, on Build", async () => {
  const b = await mcp(ownerKey, "build", { project: "smoke", kind: "knowledge" });
  const rows = b.out.rows || [];
  const n = b.out.counts && b.out.counts.byKind && b.out.counts.byKind.knowledge;
  expect(n === s.ledgers.length && s.ledgers.every((id) => rows.some((r) => r.id === id)) && rows.every((r) => r.lane === "leader"), () => `byKind.knowledge ${n}, want ${s.ledgers.length}: ${brief(rows.map((r) => r.id))}`);
  const t = (await kread(ownerKey, { project: "smoke", ref: s.first })).out.item || {};
  expect(t.kind === "knowledge" && t.via === "mcp" && t.route === "auto" && /1 aim, 3 goals written/.test(t.what || ""), () => brief(t));
  const local = await mcp(ownerKey, "build", { project: "local", kind: "knowledge" });
  expect(!(local.out.counts.byKind || {}).knowledge, "a knowledge row landed on local");
  return `${s.ledgers.length} knowledge rows on smoke's Build, each lane leader; the first reads "1 aim, 3 goals written", via mcp, routed auto`;
});

smoke("a goal with children cannot be removed alone; a leaf can", async () => {
  const w = await kwrite(ownerKey, { project: "smoke", ops: [{ kind: "goal", op: "remove", data: { id: "ship-the-loop" } }] });
  expect(w.isError && w.out.errors[0].error === "has_children", () => brief(w.out));
  const leaf = await kwrite(ownerKey, { project: "smoke", ops: [{ kind: "goal", op: "remove", data: { id: "member-goal" } }] });
  expect(!leaf.isError && leaf.out.removed === 1, () => brief(leaf.out));
  s.ledgers.push(leaf.out.ledger);
  expect((await goalIds()) === "file-it,see-it,ship-the-loop", "the leaf is still there");
  return "has_children on the root; the leaf removed (1)";
});
