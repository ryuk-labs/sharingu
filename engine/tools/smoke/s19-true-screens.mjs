// tools/smoke/s19-true-screens.mjs — sprint 3, D2b · the truth-and-look pass: every number on a screen agrees with the rows
// under it, every word is the owner's ("contribution"), an empty screen is a phrase, and the door says the small truths. Each
// case fails on the code before D2b. Self-contained: its own projects (s19, s19n: nothing contributed, no product model by
// design) and its own people (a member seated on s19, a member seated nowhere).
//   T1  · the proof rule: a true statement the old rule refused files at once; a narration needs proof, the refusal says what
//         is missing and the rule in one sentence; formats {shape: "code"} states the same sentence
//   T2  · counts: a landed contribution is neither in motion nor open: Home and Build agree (contributions, in motion = the
//         rows still OPEN or gap), Build has no records pill and reads "Contributions"; the tempo word is never "in"
//   T3  · Goals: a cell past its target says "met, N landed", a done goal's cell says done, no map button under "Nothing is
//         blocking a goal"; the Map's Screens pill counts the screens column; a project with no model by design says so
//   T4  · the owner holds every active project on /projects and Profile
//   T5  · a picture's reach: a render of a graded screen puts no check in question (preview) and its impact redoes none
//   T6  · the door: a replay's unchanged contribution carries its id; preview items carry n, the number the text prints;
//         read {kind, ref: <bare id>} reads as the full ref; project_required declared on the three doors; a seatless member
//         is refused a write with no project, and may still ask
//   T7  · plain words: no "Agent R" on Profile or Docs; the atlas draws a quiet plate for a screen with nothing to show
//   T8  · empty is plain: an unfed project's Home is one phrase (no zero tiles), its Goals read "not started" (no 0% bars), its
//         GTM with goals and no contribution one phrase (no zero tiles, no campaign chips repeating the goal names)
//   T9  · lists: the checklist's gtm-lists counts what the reader may read; gtm's lists are the page's, cut to a row;
//         a list mounts on Home, Goals, Broadcast and the Map's overview
import { smoke, expect, brief, http, mcp, html, ownerKey, control, contribute } from "./lib.mjs";
import { PROOF_RULE } from "../../src/transmission.js";

const TAG = String(process.env.S19_TAG || "").replace(/[^a-z0-9]/g, "");   // a rerun on a kept worker takes its own projects
const P = "s19" + TAG, PN = "s19n" + TAG;
const q = {};
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return key;
};
const fileVia = async (key, items, extra = {}, project = P) => {
  const pv = await mcp(key, "preview", { project, items, ...extra });
  expect(!pv.isError && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await mcp(key, "file", { previewId: pv.out.previewId, items, only: "ready" });
  expect(!f.isError, () => `file: ${brief(f.out)}`);
  return { pv: pv.out, rc: f.out };
};
const C = (o) => ({ contribution: { lane: "code", kind: "pr", why: "s19", touches: ["engine/s19.js"], ...o } });
const metricOf = (text, k) => (new RegExp(`data-metric="${k}" data-value="([^"]*)"`).exec(text) || [])[1];
const region = (text, r) => { const i = text.indexOf(`data-region="${r}"`); return i < 0 ? "" : text.slice(i, i + 6000); };

smoke("true screens · T1 the proof rule: a true statement files, a narration needs what is missing, one sentence everywhere", async () => {
  await control({ action: "add-project", key: P, name: "S19" });
  await control({ action: "add-project", key: PN, name: "S19 Ops" });
  q.member = await invite("S19 Mo", `mo${TAG}@s19.local`, "member", [P]);
  q.loner = await invite("S19 Sol", `sol${TAG}@s19.local`, "member", []);
  const items = [
    C({ what: "S19 a rebuild", proof: "Rebuilt from empty: stored == built for every kind on all five projects, the privacy re-check reads 83 ryuklabs items with 0 hits." }),
    C({ what: "S19 a tool call", proof: 'read {project: "siru", kind: "aim"} -> measure.name "Pharmacies with doors open", measure.target 11' }),
    C({ what: "S19 a narration", proof: "tested it, works fine" }),
  ];
  const pv = (await mcp(ownerKey, "preview", { project: P, items })).out;
  const v = pv.items.map((x) => x.verdict);
  const fmt = (await mcp(ownerKey, "formats", { shape: "code" })).out;
  const rule = JSON.stringify(fmt);
  expect(v[0] === "files" && v[1] === "files" && v[2] === "needs" && /nothing observed in it/.test(pv.items[2].reasons[0]) && pv.items[2].needs.hint.startsWith(PROOF_RULE)
    && rule.includes(PROOF_RULE[0].toUpperCase() + PROOF_RULE.slice(1)), () => brief([v, pv.items[2].reasons, pv.items[2].needs, rule.slice(0, 200)]));
  return `"…83 ryuklabs items with 0 hits" and a tool call with its answer file at once; "tested it, works fine" needs proof (${pv.items[2].reasons[0].slice(0, 60)}…); formats states the rule`;
});

smoke("true screens · T2 counts agree with rows: Home and Build count contributions and what is in motion the same way; a landed one is neither", async () => {
  const items = [
    C({ what: "S19 one", proof: "smoke 1/1", clientRef: `s19-one${TAG}` }),
    C({ what: "S19 two", proof: "smoke 2/2" }),
    { kind: "goal", op: "upsert", data: { id: "s19-root", title: "S19 root", dimensions: ["code"] } },
  ];
  await fileVia(ownerKey, items);
  // one flagged for the owner (risk owner): it files and waits with the owner, in motion until it is ruled (D5: a contribution
  // that needs more is never filed: it is fixed in its preview)
  const inc = await contribute(ownerKey, { project: P, lane: "code", kind: "pr", what: "S19 three, for the owner", why: "s19", touches: ["engine/s19.js"], proof: "smoke 3/3", risk: "owner" });
  expect(!inc.isError && inc.verdict === "waits_for_owner", () => brief(inc.out));
  const sum = (await http("GET", `/home/summary?project=${P}`, { key: ownerKey })).json;
  const b = (await http("GET", `/build?project=${P}`, { key: ownerKey })).json;
  const home = await html(`/home?project=${P}`), build = await html(`/build?project=${P}`);
  const open = b.rows.filter((r) => r.chip === "OPEN" || r.chip === "gap").length;
  expect(!("openFilings" in sum.metrics) && sum.metrics.contributions.total === 3 && sum.metrics.inMotion.total === 1 && b.counts.contributions === 3 && b.counts.inMotion === 1 && !("open" in b.counts)
    && open === 1 && metricOf(home.text, "in-motion") === "1" && metricOf(build.text, "contributions") === "3" && metricOf(build.text, "in-motion") === "1",   // (sprint 3 L2: contributions is Build's tile)
    () => brief([sum.metrics, b.counts, open]));
  const landedRows = build.text.split('<li class="p-li"').filter((x) => /data-chip="LANDED"/.test(x.split("</li>")[0])).map((x) => x.split("</li>")[0]);
  expect(!/>(grades|knowledge writes)<\/span><span class="p-count">/.test(build.text) && /<h2 class="p-label">Contributions<\/h2>/.test(build.text) && !/Filings/.test(build.text) && !/Open filings/.test(home.text)
    && landedRows.length >= 2 && landedRows.every((x) => !/<span>in<\/span>/.test(x)), () => `Build page: ${build.text.length} bytes, ${landedRows.length} LANDED rows`);
  return `Home and Build: 3 contributions, 1 in motion (the one waiting with the owner); the two LANDED are neither; no records pill; "Contributions", never "Filings"`;
});

smoke("true screens · T3 Goals cells, the Blocked button, the Screens pill, a project with no model by design", async () => {
  await fileVia(ownerKey, [
    { kind: "goal", op: "upsert", data: { id: "s19-met", title: "S19 met", parent: "s19-root", dimensions: ["code"] } },
    { kind: "goal", op: "upsert", data: { id: "s19-done", title: "S19 done", parent: "s19-root", dimensions: ["code"], status: "done" } },
    C({ what: "S19 feeds met 1", proof: "smoke 3/3", goalRef: "s19-met" }), C({ what: "S19 feeds met 2", proof: "smoke 4/4", goalRef: "s19-met" }),
    { kind: "node", op: "upsert", data: { id: "surface:s19-web", type: "surface", name: "S19 Web" } },
    { kind: "node", op: "upsert", data: { id: "screen:s19-a", type: "screen", name: "S19 A", data: { surface: "s19-web" } } },
    { kind: "node", op: "upsert", data: { id: "screen:s19-b", type: "screen", name: "S19 B", data: { surface: "s19-web" } } },
  ]);
  await fileVia(ownerKey, [{ kind: "aim", op: "upsert", data: { aim: "S19 Ops runs the outreach", productModel: { none: true, why: "operations only" } } }], {}, PN);
  const goals = await html(`/goals?project=${P}`);
  const row = (id) => (goals.text.split(`data-id="${id}"`)[1] || "").split("</li>")[0];
  // L4: the fill chip left the tabs; the Map's own canvas says a project declared no product model
  const map = await html(`/map?project=${P}`), mapN = await html(`/map?project=${PN}`);
  const pill = (/data-layer="screens"[^>]*>Screens<b>(\d+)<\/b>/.exec(map.text) || [])[1];
  // (sprint 3 L2: what measures a goal is its row's fact, opened in place)
  expect(/<dt>Measured by<\/dt><dd>code met, 2 landed<\/dd>/.test(row("s19-met")) && !/\b2 of 1\b/.test(row("s19-met")) && /<dt>Measured by<\/dt><dd>code done<\/dd>/.test(row("s19-done")) && !/\b0 of 1\b/.test(row("s19-done"))
    && /Nothing blocked/.test(goals.text) && !/data-button="see-gap-on-map"/.test(goals.text), () => brief([row("s19-met").slice(0, 300), row("s19-done").slice(0, 300)]));
  expect(pill === "2" && /No product model, by design/.test(mapN.text) && !/Map filled: not started/.test(mapN.text), () => brief([pill, mapN.status]));
  return `"code met, 2 landed", "code done", no map button under nothing blocked; the Screens pill 2 (two screens, one surface); s19n's Map "No product model, by design"`;
});

smoke("true screens · T4 the owner holds every active project: /projects and Profile list them all", async () => {
  const picker = await html("/projects"), prof = await html("/profile");
  expect(picker.status === 200 && /data-region="projects"/.test(picker.text) && picker.text.includes(`value="${P}"`) && picker.text.includes(`value="${PN}"`) && !/No projects assigned yet/.test(picker.text)
    && /S19 Ops/.test(prof.text) && !/No project yet/.test(prof.text), () => brief([picker.status, picker.text.length, prof.status]));
  return "/projects lists s19 and s19n (the owner seated on neither), Profile names them";
});

smoke("true screens · T5 a picture's reach: a render of a graded screen puts no check in question, and its impact redoes none", async () => {
  await fileVia(ownerKey, [{ kind: "check", op: "upsert", data: { id: "s19-a.loads", title: "S19 A loads", given: "a reader", when: "GET", then: "200", refs: ["screen:s19-a"] } }]);
  await fileVia(ownerKey, [{ grade: { checkId: "s19-a.loads", verdict: "proven", proof: "curl /s19 -> 200" } }]);
  const R = [{ kind: "render", op: "upsert", data: { screen: "screen:s19-a", format: "html", body: "<main><h1>S19 A</h1></main>" } }];
  const pv = (await mcp(ownerKey, "preview", { project: P, items: R })).out;
  expect(pv.reach && pv.reach.checks && !Number(pv.reach.checks.graded) && !/in question/.test(pv.reachLine || ""), () => brief([pv.reach && pv.reach.checks, pv.reachLine]));
  const f = (await mcp(ownerKey, "file", { previewId: pv.previewId, items: R })).out;
  const id = (f.items[0].filed || {}).id;
  const imp = (await mcp(ownerKey, "impact", { contribution: id })).out;
  expect(id && imp.proof && imp.proof.toRedo.length === 0 && !/to redo/.test(imp.line || ""), () => brief([id, imp.proof, imp.line]));
  return `the render's preview: ${pv.reachLine}; its impact (${id}): ${imp.line}, no check to redo`;
});

smoke("true screens · T6 the door's small truths: a replay names its id, items carry their printed number, a bare id reads by its kind, project_required declared, a seatless member refused", async () => {
  const items = [C({ what: "S19 one", proof: "smoke 1/1", clientRef: `s19-one${TAG}` }), { kind: "goal", op: "upsert", data: { id: "s19-bare", title: "S19 bare", parent: "s19-root", dimensions: [] } }];
  const first = (await mcp(ownerKey, "read", { project: P, kind: "contribution" })).out.items.find((x) => x.what === "S19 one");
  const { pv, rc } = await fileVia(ownerKey, items);
  const r0 = rc.items.find((x) => x.i === 0);
  expect(r0.filed.status === "unchanged" && r0.filed.id === first.id && rc.results[0].id === first.id, () => brief([r0.filed, first]));
  expect(pv.items.every((it) => it.n === it.i + 1 && new RegExp(`(^|\\n)\\s*${it.n}  `).test(pv.text)), () => brief(pv.items.map((x) => [x.i, x.n])) + pv.text.slice(0, 300));
  const bare = (await mcp(ownerKey, "read", { project: P, kind: "goal", ref: "s19-bare" })).out, full = (await mcp(ownerKey, "read", { project: P, ref: "goal/s19-bare" })).out;
  expect(bare.item && full.item && bare.item.id === "s19-bare" && JSON.stringify(bare.item) === JSON.stringify(full.item), () => brief([bare, full]));
  const contract = await http("GET", "/contract", { key: ownerKey });
  const rows = (contract.json.rest || []).filter((x) => ["POST /versions/restore", "POST /questions/:qid/rule"].includes(`${x.method} ${x.path}`));
  // D5: the project rule rides the tool's `project` argument (tools/list), the description stays short
  const tool = ((((await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).json || {}).result || {}).tools || []).find((t) => t.name === "restore_version");
  expect(rows.length === 2 && rows.every((x) => /422 project_required/.test(x.does)) && tool && /refused project_required/.test(JSON.stringify(((tool.inputSchema || {}).properties || {}).project || {})), () => brief(rows.map((x) => x.does.slice(0, 80))));   // D5: the rule rides the project argument
  const refused = await mcp(q.loner, "preview", { items: [C({ what: "S19 seatless", proof: "smoke 1/1" })] });
  const asked = await mcp(q.loner, "ask", { question: "S19: may I have a seat?" });
  expect(refused.isError && refused.out.error === "project_required" && !(refused.out.projects || []).length && !asked.isError, () => brief([refused.out, asked.out]));
  return `replay: unchanged with ${first.id}; n == i + 1 == the text's number; read {kind: goal, ref: s19-bare} == goal/s19-bare; project_required declared; a seatless member refused project_required (no project named back), ask still answers`;
});

smoke("true screens · T7 plain words: no retired product name on Profile or Docs; the atlas draws a plate for a screen with nothing to show", async () => {
  const prof = await html("/profile"), docs = await html("/docs"), atlas = await html(`/map/screens?project=${P}&surface=s19-web`);
  expect(!/Agent R\b/.test(prof.text) && !/Agent R\b/.test(docs.text) && /class="ax-plate"[^>]*><b>S19 B<\/b><span>No picture yet<\/span>/.test(atlas.text), () => brief([prof.status, docs.status, atlas.status]));
  return "Profile and Docs name sharingu; S19 B (no render, no wireframe) is a quiet plate with its name";
});

smoke("true screens · T8 empty is plain: an unfed project's Home is one phrase, its Goals read not started, its GTM no zero tiles", async () => {
  await fileVia(ownerKey, [
    { kind: "goal", op: "upsert", data: { id: "s19n-root", title: "S19n root", dimensions: [] } },
    { kind: "goal", op: "upsert", data: { id: "s19n-reach", title: "S19n reach", parent: "s19n-root", dimensions: ["gtm"] } },
    { kind: "goal", op: "upsert", data: { id: "s19n-pipe", title: "S19n pipeline", parent: "s19n-root", dimensions: ["gtm"] } },
  ], {}, PN);
  const home = await html(`/home?project=${PN}`), goals = await html(`/goals?project=${PN}`), gtm = await html(`/gtm?project=${PN}`);
  const met = region(home.text, "metrics");
  expect(/Nothing contributed yet/.test(met) && !/data-metric="(in-motion|contributions)"/.test(home.text), () => met.slice(0, 300));
  expect(/data-state="todo"[\s\S]*?>Not started</.test(goals.text) && !/data-progress=/.test(region(goals.text, "goal-tree")) && !/Fed by<\/dt><dd>0/.test(goals.text), () => region(goals.text, "goal-tree").slice(0, 400));
  const gm = region(gtm.text, "metrics");
  expect(/data-state="empty"/.test(gm) && /Nothing contributed yet/.test(gm) && !/data-button="campaigns"/.test(gtm.text) && !/class="p-tile"/.test(gtm.text) && !/preview \{/.test(gm), () => gm.slice(0, 400));
  return "Home: \"Nothing contributed yet\" (no zero tiles); Goals: \"not started\" (no 0% bar, no \"fed by 0\"); GTM: one phrase, no tiles, no campaign chips, no call";
});

smoke("true screens · T9 lists: gtm-lists counts what the reader may read; the tool's lists are the page's cut to a row; a list on Home, Goals, Broadcast and the Map", async () => {
  await fileVia(ownerKey, [
    { kind: "card_kind", op: "upsert", data: { key: "s19secret", label: "S19 Finance claims", tab: "gtm", roleVisibility: ["finance"] } },
    { kind: "card_kind", op: "upsert", data: { key: "s19claim", label: "S19 Claims", tab: "gtm" } },
    ...Array.from({ length: 10 }, (_, i) => ({ kind: "card", op: "upsert", data: { kind: "s19claim", id: `c${i}`, name: `S19 claim ${i}`, body: `Claim ${i}, with a long body that a list row never prints whole.` } })),
    ...["home", "goals", "broadcast", "map"].map((t) => ({ kind: "card_kind", op: "upsert", data: { key: `s19${t}`, label: `S19 ${t} notes`, tab: t } })),
    ...["home", "goals", "broadcast", "map"].map((t) => ({ kind: "card", op: "upsert", data: { kind: `s19${t}`, id: "n1", name: `S19 ${t} note`, body: "a note" } })),
  ]);
  const gl = (k) => ((k.checklist || []).find((x) => x.id === "gtm-lists") || {});   // every item, open or filled
  const own = gl((await mcp(ownerKey, "missing", { project: P })).out), mem = gl((await mcp(q.member, "missing", { project: P })).out);
  expect(own.want === 2 && own.have === 1 && mem.want === 1 && mem.have === 1, () => `owner ${own.have}/${own.want} · member ${mem.have}/${mem.want}`);
  const page = (await http("GET", `/gtm?project=${P}`, { key: ownerKey })).json, tool = (await mcp(ownerKey, "gtm", { project: P })).out;
  const pc = page.lists.lists.find((k) => k.key === "s19claim"), tc = tool.lists.lists.find((k) => k.key === "s19claim");
  expect(pc.count === 10 && tc.count === 10 && tc.cards.length === 8 && tc.href === "/library?kind=s19claim" && tc.cards.every((c) => Object.keys(c).every((f) => ["ref", "name", "summary", "asOf", "status"].includes(f)))
    && JSON.stringify(tc.cards.map((c) => c.ref)) === JSON.stringify(pc.cards.map((c) => c.ref)), () => brief([pc, tc]));
  const pages = { home: `/home?project=${P}`, goals: `/goals?project=${P}`, broadcast: `/broadcast?project=${P}`, map: `/map?project=${P}` };
  const seen = {};
  for (const [t, path] of Object.entries(pages)) { const h = await html(path); seen[t] = /data-region="lists"/.test(h.text) && h.text.includes(`data-card="s19${t}/n1"`); }
  const dec = await html(`/decisions?project=${P}`);
  expect(Object.values(seen).every(Boolean) && !/data-region="lists"/.test(dec.text), () => brief(seen));
  return `gtm-lists: the owner 2 kinds, the member 1 (the finance kind is not theirs); gtm: 8 of 10 claims, each a row's fields, the Library link; lists on Home, Goals, Broadcast and the Map, none on Decisions`;
});
