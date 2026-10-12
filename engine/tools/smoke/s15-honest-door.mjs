// tools/smoke/s15-honest-door.mjs — sprint 3, the one-pass fix of the first real fill's findings (owner ruling 2026-10-01),
// through the real door on a project of its own (s15):
//   · fix 1 + 3: work that touches no screen files at once with touches and proof; proof as people state it ("smoke 93/93")
//     files, a narration needs proof and says the accepted forms, "none" is no proof;
//   · fix 2: screens are checked against the project's OWN Map (by id with or without "screen:", or by name): a ref that is
//     not there needs a fix and the preview lists its near matches; a made-up 001 does not pass; nothing waits for the owner
//     because of a register; the direct door says the same;
//   · fix 5: a component resolves against the Map (read answers componentKey ok, never "unavailable"); one that
//     does not needs a fix;
//   · fix 4: a goal's status comes back and shows; a done goal reads 100%; what lands moves its lane's cell; a leader plan
//     feeds the goal under "plans"; what waits for the owner shows as waiting; the page says what the % is made of;
//   · fix 8: holes points every fill at preview (or the owner's rule_question), every open item carries its fill line, the
//     ids agree, the meter says depth, and the receipt that starts GTM says GTM now counts;
//   · fix 6 + 9: a ruling with the ruled option alone and its source shows on its page; gtm/ docs list on GTM's Strategy; Home
//     offers every option of an open question, none picked; whoami tells the owner where their writes land.
import { smoke, expect, brief, http, mcp, html, ownerKey, control, contribute, readTx } from "./lib.mjs";

const P = "s15";
const preview = async (items, extra = {}) => { const r = await mcp(ownerKey, "preview", { project: P, items, ...extra }); if (r.isError) throw new Error(`preview: ${brief(r.out)}`); return r.out; };
const fileAll = async (pv, items, only) => { const r = await mcp(ownerKey, "file", { previewId: pv.previewId, items, ...(only ? { only } : {}) }); if (r.isError) throw new Error(`file: ${brief(r.out)}`); return r.out; };
const C = (o) => ({ contribution: { lane: "code", kind: "pr", why: "s15 smoke", ...o } });
const MODEL = [
  { kind: "node", op: "upsert", data: { id: "screen:s15-home", type: "screen", name: "S15 Home" } },
  { kind: "node", op: "upsert", data: { id: "screen:s15-goals", type: "screen", name: "S15 Goals" } },
  { kind: "node", op: "upsert", data: { id: "service:s15-db", type: "service", name: "S15 database" } },
  { kind: "goal", op: "upsert", data: { id: "s15-root", parent: null, title: "S15 root", dimensions: [] } },
  { kind: "goal", op: "upsert", data: { id: "s15-done", parent: "s15-root", title: "S15 shipped already", dimensions: ["code"], status: "done" } },
  { kind: "goal", op: "upsert", data: { id: "s15-build", parent: "s15-root", title: "S15 the build", dimensions: ["code"], status: "in-progress" } },
  { kind: "goal", op: "upsert", data: { id: "s15-plan", parent: "s15-root", title: "S15 the plan", dimensions: ["leader"], status: "not started" } },
];

smoke("honest door · work that touches no screen files with touches and proof; proof as people state it files; a narration and 'none' each need proof, said exactly", async () => {
  await control({ action: "add-project", key: P, name: "S15" });
  const m = await preview(MODEL);
  expect(m.items.every((x) => x.verdict === "files"), () => brief(m.items.map((x) => [x.kind, x.verdict, x.reasons])));
  await fileAll(m, MODEL);
  const items = [
    C({ what: "S15 migrate-055: a source on questions", touches: ["migrate-055", "table:k_questions"], proof: "sh tools/migrate-dryrun.sh --selftest -> exit 0, 8/8" }),
    C({ what: "S15 the gate", touches: ["engine/gate.sh"], proof: "smoke 93/93, gate exit 0" }),
    C({ what: "S15 a narration", touches: ["engine/x.js"], proof: "works fine, tested it" }),
    C({ what: "S15 no proof stated", touches: ["engine/y.js"], proof: "none" }),
  ];
  const pv = await preview(items);
  const v = pv.items.map((x) => x.verdict);
  expect(v[0] === "files" && v[1] === "files" && v[2] === "needs" && v[3] === "needs", () => brief(pv.items.map((x) => [x.verdict, x.reasons])));
  expect(pv.items[2].needs.field === "proof" && /nothing observed in it .* reads as narration/.test(pv.items[2].reasons[0]) && /93\/93/.test(pv.items[2].needs.hint) && /https:/.test(pv.items[2].needs.hint)
    && pv.items[3].reasons[0] === "It carries no proof." && pv.items[2].effect === "needs proof" && pv.items[3].effect === "needs proof", () => brief(pv.items.slice(2)));
  expect(/S15 a narration[\s\S]*Its proof has nothing observed in it/.test(pv.text.replace(/\n {7}/g, " ")) && /^ proof    is what you observed: a result with its number/m.test(pv.text), () => pv.text);
  return `a migration and a gate script file at once (no screen); "works fine" and "none" each need proof, with their reasons`;
});

smoke("honest door · screens are checked against the project's own Map: by id or name they file; one not in the Map needs a fix with its near matches; 001 does not pass; nothing waits for the owner over a register", async () => {
  const items = [
    C({ what: "S15 the home screen", touches: ["ui"], screens: "s15-home", proof: "npm test -> exit 0, 4 passing" }),
    C({ what: "S15 the goals screen by name", touches: ["ui"], screens: "S15 Goals", proof: "npm test -> exit 0, 4 passing" }),
    C({ what: "S15 a made-up number", touches: ["ui"], screens: "001", proof: "npm test -> exit 0, 4 passing" }),
    C({ what: "S15 a typo", touches: ["screen:s15-hme"], proof: "npm test -> exit 0, 4 passing" }),
  ];
  const pv = await preview(items);
  const v = pv.items.map((x) => x.verdict);
  expect(same(v, ["files", "files", "needs", "needs"]) && !v.includes("waits_for_owner"), () => brief(pv.items.map((x) => [x.verdict, x.reasons])));
  const typo = pv.items[3];
  expect(typo.needs.field === "screens" && /Screen screen:s15-hme is not in the project's Map: near screen:s15-home \(S15 Home\)/.test(typo.reasons[0])
    && typo.needs.unknown[0].near.some((x) => x.id === "screen:s15-home") && /Screen 001 is not in the project's Map/.test(pv.items[2].reasons[0]), () => brief(pv.items.slice(2)));
  // D5: the one door is preview then file: file with only "ready" files the two that
  // resolve and leaves the two that need a fix, nothing routed to the owner
  const rc = await fileAll(pv, items, "ready");
  const st = (rc.results || []).map((x) => x.status).join(",");
  expect(st === "filed,filed,left,left" && !(rc.items || []).some((x) => x.filed && x.filed.route === "owner"), () => `${st} ${brief(rc).slice(0, 300)}`);
  return `by id and by name: files; 001 and a typo: needs (near: ${typo.needs.unknown[0].near.map((x) => x.id).join(", ")}); file only "ready": ${st}, never the owner`;
});

smoke("honest door · a component resolves against the Map (componentKey ok, never unavailable); one that does not needs a fix", async () => {
  const items = [
    C({ what: "S15 the database change", touches: ["db"], components: ["service:s15-db"], proof: "smoke 5/5" }),
    C({ what: "S15 a made-up component", touches: ["db"], components: ["service:nope"], proof: "smoke 5/5" }),
  ];
  const pv = await preview(items);
  expect(pv.items[0].verdict === "files" && pv.items[1].verdict === "needs" && pv.items[1].needs.field === "components" && /Component service:nope is not in the project's Map/.test(pv.items[1].reasons[0]), () => brief(pv.items));
  const rc = await fileAll(pv, items, "ready");
  const id = rc.items[0].filed.id;
  const t = await readTx(ownerKey, id, P);
  const grade = (t.out && (t.out.grade || (t.out.transmission && t.out.transmission.grade))) || {};
  const g = typeof grade === "string" ? JSON.parse(grade) : grade;
  expect(!t.isError && g.componentKey === "ok", () => brief(t.out));
  return `service:s15-db files (${id}, componentKey ${g.componentKey}); service:nope needs a fix`;
});

smoke("honest door · goals count what was filed: status back and shown, done reads 100%, a landed code contribution moves its cell, a plan feeds under plans, what waits for the owner shows", async () => {
  const items = [
    C({ what: "S15 build lands", touches: ["engine/z.js"], proof: "smoke 9/9", goalRef: "s15-build" }),
    { contribution: { lane: "leader", kind: "doc", what: "S15 the plan for the build", why: "s15", touches: ["docs/plan"], goalRef: "s15-build" } },
    C({ what: "S15 the payment flow", touches: ["engine/pay.js"], proof: "smoke 2/2", goalRef: "s15-build" }),
  ];
  const pv = await preview(items);
  expect(same(pv.items.map((x) => x.verdict), ["files", "files", "waits_for_owner"]), () => brief(pv.items.map((x) => [x.verdict, x.reasons])));
  await fileAll(pv, items);
  const g = await http("GET", `/goals?project=${P}&period=all`, { key: ownerKey });
  const n = (id) => (g.json.nodes || []).find((x) => x.id === id) || {};
  const b = n("s15-build");
  expect(g.status === 200 && n("s15-done").status === "done" && n("s15-done").pct === 100 && b.status === "in progress" && b.pct === 100 && b.waiting === 1
    && b.dims.find((d) => d.dim === "code").waiting === 1 && b.fed.byArea.plans === 1 && b.fed.byArea.build === 1 && /100 when its status is done/.test(g.json.pctRule), () => brief(g.json.nodes));
  const page = await html(`/goals?project=${P}&period=all`);
  // sprint 3 L2: what waits and what fed it are the goal's facts, opened in place
  expect(/data-id="s15-done"[^>]*data-status="done"/.test(page.text) && /data-region="pct-rule"/.test(page.text) && /<dt>Waiting<\/dt><dd>1<\/dd>/.test(page.text) && /plans 1/.test(page.text), () => `Goals page ${page.status}`);
  const one = await mcp(ownerKey, "goals", { project: P, ref: "s15-build", period: "all" });
  expect(!one.isError && one.out.node.status === "in progress" && one.out.node.waiting === 1, () => brief(one.out.node));
  return `s15-done done 100%; s15-build in progress ${b.pct}% (code 1 landed, 1 waiting for the owner, a plan under plans); the page shows the chips and the rule`;
});

smoke("honest door · holes: every fill is a preview (or the owner's rule_question) with its line, ids agree, the meter says depth; the receipt that starts GTM says it now counts", async () => {
  const h = (await mcp(ownerKey, "missing", { project: P })).out;
  const ids = new Set((h.checklist || []).map((x) => x.id));
  expect(h.items.length > 0 && h.items.every((x) => x.fill && (x.fillPath === null ? /Equip/.test(x.fill) : ["preview", "rule_question"].includes(x.fillPath.tool)))
    && h.items.every((x) => ids.has(x.id)) && h.filled.every((x) => ids.has(x)) && / by depth$/.test(h.meter.words) && /^it counts /.test(h.meter.counts), () => brief({ holes: h.items.map((x) => [x.id, x.fillPath && x.fillPath.tool, !!x.fill]), filled: h.filled, meter: h.meter }));
  const gtm = !(h.areas.find((a) => a.area === "gtm") || {}).applies;
  const items = [{ kind: "doc", op: "upsert", data: { path: "gtm/positioning.md", title: "S15 positioning", body: "# Who we serve first", asOf: "2026-09-30", confidence: "direction" } }];
  const pv = await preview(items);
  const rc = await fileAll(pv, items);
  expect(!gtm || (/^GTM now counts: \+\d+ items? \(the meter: /.test(rc.meterNote || "") && /meter    GTM now counts/.test(rc.text)), () => brief({ meterNote: rc.meterNote, text: rc.text }));
  const page = await html(`/gtm?project=${P}`);
  expect(/data-region="strategy"/.test(page.text) && /data-doc="gtm\/positioning.md" data-confidence="direction" data-as-of="2026-09-30"/.test(page.text) && />direction</.test(page.text) && />30 Sep</.test(page.text), () => `GTM page ${page.status}`);
  return `${h.items.length} open, every one with its fill; ${rc.meterNote || "GTM already counted"}; GTM's Strategy lists gtm/positioning.md with its confidence and date`;
});

smoke("honest door · a ruling with the ruled option alone and its source shows on its page; Home offers every option of an open question, none picked; whoami tells the owner where writes land", async () => {
  const items = [
    { kind: "question", op: "upsert", data: { qid: "Q-s15-ruled", question: "Where does S15 hold its truth?", status: "decided", options: [{ what: "In D1" }], choice: 0, decidedBy: "Ryuk", decidedAt: "2026-09-30",
      source: [{ kind: "file", ref: "docs/plan/README.md", label: "the plan" }] } },
    { kind: "question", op: "upsert", data: { qid: "Q-s15-open", question: "S15: which first?", status: "open", whoOwes: "owner", options: [{ what: "The door" }, { what: "The page" }] } },
  ];
  const pv = await preview(items);
  expect(pv.items.every((x) => x.verdict === "files"), () => brief(pv.items));
  await fileAll(pv, items);
  const q = await html(`/question/Q-s15-ruled?project=${P}`);
  expect(/data-region="source"/.test(q.text) && /Recorded in/.test(q.text) && /the plan/.test(q.text), () => `question page ${q.status}`);
  const home = await html(`/home?project=${P}`);
  const forms = [...home.text.matchAll(/data-button="choose-option" data-option="([A-Z])"/g)].map((m) => m[1]);
  expect(forms.includes("A") && forms.includes("B") && !/checked/.test((/data-region="needs-you"[\s\S]*?<\/section>/.exec(home.text) || [""])[0]), () => `Home options ${forms.join(",")}`);
  const who = (await mcp(ownerKey, "whoami", {})).out;
  expect(Array.isArray(who.writeProjects) && who.writeProjects.includes(P) && !/hold no project seat/.test(who.projectGloss), () => brief({ writeProjects: who.writeProjects, gloss: who.projectGloss }));
  return `Q-s15-ruled (one option, choice 0) shows its source; Home offers ${forms.join(", ")}; whoami: ${who.projectGloss.slice(0, 80)}`;
});

smoke("honest door · a batch clientRef on preview names file's parts: the same batch previewed again and filed again files nothing twice", async () => {
  const items = [C({ what: "S15 batch ref probe", touches: ["engine/b.js"], proof: "smoke 1/1" }), { kind: "doc", op: "upsert", data: { path: "s15/batch.md", body: "# batch" } }];
  const one = await preview(items, { clientRef: "s15-batch-1" });
  const r1 = await fileAll(one, items);
  const two = await preview(items, { clientRef: "s15-batch-1" });
  const r2 = await fileAll(two, items);
  const id1 = r1.items[0].filed.id, id2 = r2.items[0].filed && r2.items[0].filed.id;
  const bad = await mcp(ownerKey, "preview", { project: P, items, clientRef: "has a space" });
  expect(one.previewId !== two.previewId && r1.items[0].filed.status === "filed" && id1 && id1 === id2 && ["filed", "unchanged"].includes(r2.items[1].filed.status) && bad.isError && bad.out.field === "clientRef",
    () => brief({ r1: r1.items, r2: r2.items, bad: bad.out }));
  return `two previews (${one.previewId}, ${two.previewId}) of one batch: the contribution files once (${id1}); a malformed clientRef is refused`;
});

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
