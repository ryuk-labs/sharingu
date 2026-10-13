// tools/smoke/s28-video-faults.mjs — sprint 3, the last fixes before the video: the product faults the second video's
// rehearsal frames showed (engine/.runs/walkthrough2). Self-contained: its own project (v28), its own screens on the Map.
//   · 1  what a contribution touches is ONE fact: a contribution naming three files and no node reads "3 files, not on the Map"
//        on the page's Touches fact AND its Impact card (the card said "Touches nothing" beside a Touches of three files)
//   · 2  a ruled question names its decider by NAME and face ("Ruled by"), never the person's raw id, and owes nothing (no
//        "Owed by" dash)
//   · 3  a preview that says "files" files: 30 touches plus a screens list of 21 screens on the Map (51 index tokens; the refs
//        index bound 2 parameters a token, D1 takes 100) answered not_filed after its preview said "files at once"
//   · 4  the contract: GET /map/node and map {ref} answer parent (null on a node that has none); each write twin's POST {}
//        (POST /preview/file-contribution, /save-knowledge, /remove-knowledge; sprint 19) answers preview_id_required and its
//        registry row declares it; POST /file is gone (404)
//   · 6  What is missing: an item's Copy is a link to the item (script off) and the shell's copy handler says "Copied" for two
//        seconds (the behaviour is client-side: the markup and the script are checked)
// Fault 5 (the terminal text's fixed columns) is tools/preview-selftest.mjs's, with the rehearsal's goal row.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { smoke, expect, brief, http, mcp, html, ownerKey, control, fileVia } from "./lib.mjs";

const TAG = String(process.env.S28_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "v28" + TAG;
const V = {};
const CONTRACT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contracts", "door.json");
const SCREENS = Array.from({ length: 21 }, (_, i) => `screen:v28-s${i}`);
const pv = (items, extra = {}) => mcp(ownerKey, "preview", { project: P, items, ...extra });
const textOf = (s) => String(s || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
// regionOf(page, name) -> the markup from data-region="<name>" to the next data-region (a slice wide enough to read one region)
const regionOf = (page, name) => { const at = page.indexOf(`data-region="${name}"`); if (at < 0) return ""; const next = page.indexOf("data-region=", at + 20); return page.slice(at, next < 0 ? at + 8000 : next); };

smoke("video faults · setup: a project with a surface and 21 screens on its Map, and an open question", async () => {
  await control({ action: "add-project", key: P, name: "V28" });
  const nodes = [{ kind: "node", op: "upsert", data: { id: "surface:v28-web", type: "surface", name: "V28 Web" } },
    ...SCREENS.map((id, i) => ({ kind: "node", op: "upsert", data: { id, type: "screen", name: `V28 Screen ${i}`, data: { surface: "v28-web" } } })),
    { kind: "question", op: "upsert", data: { qid: "QV281", question: "V28 which world?", status: "open", whoOwes: "owner", options: [{ what: "Paper" }, { what: "Ink" }] } }];
  const f = await fileVia(ownerKey, { project: P, items: nodes });
  expect(f.out && f.out.complete, () => `${f.step}: ${brief(f.out)}`);
  const people = ((await http("GET", "/control/people", { key: ownerKey })).json || {}).people || [];
  V.owner = people.find((p) => p.you);
  expect(V.owner && V.owner.name && V.owner.id, () => brief(people.slice(0, 2)));
  return `${P}: surface:v28-web, ${SCREENS.length} screens, QV281; the owner ${V.owner.name}`;
});

smoke("video faults · 1 a contribution naming three files and no node reads \"3 files, not on the Map\" on its Touches fact and its Impact card alike", async () => {
  const touches = ["engine/tools/walkthrough/record.mjs", "engine/tools/walkthrough/scenes.mjs", "engine/tools/walkthrough/take.mjs"];
  const f = await fileVia(ownerKey, { project: P, items: [{ contribution: { lane: "code", kind: "pr", what: "V28 the recorder", why: "The video's take.", touches, proof: "node take.mjs --rehearsal -> exit 0" } }] });
  const id = f.out && f.out.items && f.out.items[0].filed && f.out.items[0].filed.id;
  expect(id, () => `${f.step}: ${brief(f.out)}`);
  const page = await html(`/contribution/${id}?page=1&project=${P}`);
  const fact = (page.text.match(/<span data-field="touches"[^>]*>[\s\S]*?<\/span><\/span>/) || [""])[0];
  const impact = regionOf(page.text, "impact");
  expect(page.status === 200 && /data-plain="3"/.test(fact) && /3 files, not on the Map/.test(textOf(fact)), () => `the Touches fact: ${page.status} ${fact.slice(0, 300)}`);
  expect(/3 files, not on the Map/.test(textOf(impact)) && !/Touches nothing/.test(impact) && touches.every((t) => impact.includes(t)), () => `the Impact card: ${textOf(impact).slice(0, 300)}`);
  // and a contribution touching nothing at all still says so, once
  const n = await fileVia(ownerKey, { project: P, items: [{ contribution: { lane: "leader", kind: "note", what: "V28 a plain note", why: "Nothing to touch." } }] });
  const nid = n.out.items[0].filed.id;
  const np = await html(`/contribution/${nid}?page=1&project=${P}`);
  expect(/Touches nothing/.test(regionOf(np.text, "impact")) && !/data-field="touches"/.test(np.text), () => `the note: ${textOf(regionOf(np.text, "impact")).slice(0, 200)}`);
  return `${id}: Touches "3 files, not on the Map" and the Impact card the same, the three paths named; ${nid} (a note) touches nothing, said once`;
});

smoke("video faults · 2 a question ruled by the owner names the owner by name and face (Ruled by), never the raw id; it owes nothing", async () => {
  const r = await mcp(ownerKey, "rule_question", { project: P, qid: "QV281", choice: 0 });
  expect(!r.isError && r.out && r.out.status === "decided" && r.out.decidedBy === V.owner.id, () => brief(r.out));
  const page = await html(`/question/QV281?project=${P}`);
  const facts = regionOf(page.text, "provenance");
  expect(page.status === 200 && !page.text.includes(V.owner.id), () => `the raw id ${V.owner.id} is in the page: ${page.text.slice(Math.max(0, page.text.indexOf(V.owner.id) - 200), page.text.indexOf(V.owner.id) + 60)}`);
  expect(/data-field="ruled-by"/.test(facts) && new RegExp(`Ruled by (?:[A-Z]{1,3} )?${V.owner.name}`).test(textOf(facts)) && !/Owed by/.test(facts), () => `the facts: ${textOf(facts).slice(0, 300)}`);
  expect(textOf(regionOf(page.text, "options")).includes(V.owner.name), () => `the ruling: ${textOf(regionOf(page.text, "options")).slice(0, 300)}`);
  // the JSON keeps the stored id (the data); only the faces read the name
  const j = (await http("GET", `/question/QV281?project=${P}`, { key: ownerKey })).json;
  expect(j && j.decision && j.decision.decidedBy === V.owner.id, () => brief(j && j.decision));
  return `QV281 ruled A: "Ruled by ${V.owner.name}" with a face, the ruling signed by name, no ${V.owner.id} in the HTML; the JSON keeps decidedBy`;
});

smoke("video faults · 3 a preview that says it files, files: 31 touches and a screens list of 21 screens on the Map file; the refs index holds every screen", async () => {
  const touches = Array.from({ length: 31 }, (_, i) => `engine/src/v28-${i}.js`);
  const item = { contribution: { lane: "code", kind: "pr", what: "V28 a wide change", why: "It touches many files and screens.", touches, screens: SCREENS.join(","), proof: "sh tools/smoke.sh -> exit 0" } };
  const f = await fileVia(ownerKey, { project: P, items: [item] });
  expect(f.preview && f.preview.items && f.preview.items[0].verdict === "files", () => `the preview: ${brief(f.preview && f.preview.items)}`);
  const it = f.out && f.out.items && f.out.items[0];
  expect(!f.isError && f.out.complete && it.filed && it.filed.status === "filed" && /^T-/.test(it.filed.id || ""), () => `${f.step}: ${brief(f.out.items || f.out)}`);
  // every index token landed: the LAST screen's history finds it
  const h = await mcp(ownerKey, "impact", { project: P, refs: [SCREENS[20]] });
  expect(((h.out.history || {}).items || []).some((x) => x.id === it.filed.id), () => `history of ${SCREENS[20]}: ${brief(h.out.history)}`);
  // and the rehearsal's own take (take.json's contribution: three files, a goal it names, a next action) previews and files
  const take = { contribution: { lane: "code", kind: "pr", clientRef: `v28-take${TAG}`, what: "Walkthrough recorder", why: "One take of the project on real data.",
    touches: ["engine/tools/walkthrough/record.mjs", "engine/tools/walkthrough/scenes.mjs", "engine/tools/walkthrough/take.mjs"], proof: "node tools/walkthrough/take.mjs --rehearsal -> exit 0, 3:23 at 60 fps",
    next: { what: "Record the final take on the ship candidate", who: V.owner.id, by: "2026-10-03" } } };
  const t = await fileVia(ownerKey, { project: P, items: [take] });
  expect(t.preview.items[0].verdict === "files" && t.out.complete && t.out.items[0].filed.status === "filed", () => `${t.step}: ${brief(t.out)}`);
  return `${it.filed.id}: 31 touches + 21 screens previewed "files" and filed; the 21st screen's history finds it; the take filed ${t.out.items[0].filed.id}`;
});

smoke("video faults · 4 the contract: a node with no parent answers parent null (GET /map/node, map {ref}); each write twin's POST {} answers preview_id_required, which its registry row declares", async () => {
  const r = await http("GET", `/map/node?project=${P}&ref=${encodeURIComponent(SCREENS[0])}`, { key: ownerKey });
  expect(r.status === 200 && r.json && "parent" in r.json && r.json.parent === null, () => `GET /map/node ${r.status}: ${Object.keys(r.json || {}).join(", ")}`);
  const m = await mcp(ownerKey, "map", { project: P, ref: SCREENS[0] });
  expect(!m.isError && m.out && "parent" in m.out && m.out.parent === null, () => `map {ref}: ${Object.keys(m.out || {}).join(", ")}`);
  // sprint 19: the three write tools' twins (file is gone); the two knowledge rows declare the contribution row's refusals
  const rows = JSON.parse(readFileSync(CONTRACT, "utf8")).rest || [];
  const declares = (d) => /\b422 preview_id_required\b/.test(d) && /\b422 items_required\b/.test(d);
  for (const path of ["/preview/file-contribution", "/preview/save-knowledge", "/preview/remove-knowledge"]) {
    const f = await http("POST", path, { key: ownerKey, body: {} });
    const row = rows.find((x) => x.method === "POST" && x.path === path);
    expect(f.status === 422 && f.json && f.json.error === "preview_id_required", () => `POST ${path} {}: ${f.status} ${brief(f.json)}`);
    expect(row && (declares(row.does) || (path !== "/preview/file-contribution" && /the same refusals as POST \/preview\/file-contribution/.test(row.does))), () => `the registry row ${path}: ${row && row.does.slice(0, 200)}`);
  }
  expect(declares((rows.find((x) => x.method === "POST" && x.path === "/preview/file-contribution") || {}).does || ""), "POST /preview/file-contribution declares preview_id_required and items_required");
  const gone = await http("POST", "/file", { key: ownerKey, body: {} });
  expect(gone.status === 404 && !rows.some((x) => x.path === "/file"), () => `POST /file: ${gone.status} (a retired door)`);
  return "parent: null on GET /map/node and map {ref}; POST /preview/{file-contribution,save-knowledge,remove-knowledge} {} 422 preview_id_required, each declared on its row with items_required; POST /file 404";
});

smoke("video faults · 6 What is missing: an item's Copy is a link to the item (script off), and a pressed Copy reads \"Copied\" for two seconds", async () => {
  const page = await html(`/missing?project=${P}`);
  const copies = [...page.text.matchAll(/<span class="p-copy"><code hidden>[^<]*<\/code>(<(a|button)\b[^>]*>)([^<]*)<\/\2><\/span>/g)];
  expect(page.status === 200 && copies.length > 0, () => `GET /missing ${page.status}: ${copies.length} Copy`);
  const links = copies.filter((m) => m[2] === "a");
  expect(links.length > 0 && links.every((m) => /href="\/[^"]*"/.test(m[1]) && /data-copy/.test(m[1]) && /data-button="copy-call"/.test(m[1]) && m[3] === "Copy"), () => `the Copy links: ${copies.slice(0, 3).map((m) => m[1]).join(" | ")}`);
  // the shell's one copy handler: the label "Copied", two seconds, back to the button's own label; a link copies instead of opening
  const script = (page.text.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) || []).join("\n");
  expect(/textContent='Copied'/.test(script) && /data-was-label/.test(script) && /},2000\)/.test(script) && /e\.preventDefault\(\)/.test(script), () => "the shell's copy handler does not say Copied for two seconds");
  return `${copies.length} Copy on What is missing, ${links.length} of them links to their item; the handler reads "Copied" for 2 s, then the label`;
});

smoke("video faults · 7 a batch of 120 contributions with clientRefs, filed twice: the replay files nothing again (the clientRef lookup binds one json parameter, never one per ref — D1 takes 100)", async () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ contribution: { lane: "leader", kind: "note", what: `V28 note ${i}`, why: "A wide batch.", clientRef: `v28-wide-${TAG}-${i}` } }));
  const a = await fileVia(ownerKey, { project: P, items });
  expect(a.out && a.out.complete, () => `first: ${a.step}: ${brief(a.out)}`);
  const b = await fileVia(ownerKey, { project: P, items });
  expect(b.out && b.out.complete, () => `replay: ${b.step}: ${brief(b.out)}`);
  const r = (b.out.results || b.out.items || []).filter((x) => x && (x.duplicate || x.replayed || x.unchanged || /already|unchanged|duplicate/i.test(JSON.stringify(x))));
  const page = (await http("GET", `/build?project=${P}`, { key: ownerKey, json: true })).json || {};
  const count = Number(page.counts && (page.counts.contributions ?? page.counts.filings)) || (page.stamp && page.stamp.counts && page.stamp.counts.filings) || null;
  expect(r.length === 120 || (count !== null && count < 240), () => `replay: ${r.length} of 120 read as a replay; Build counts ${count}: ${brief(b.out).slice(0, 300)}`);
  return `120 filed once, the replay filed nothing again (${r.length} read as replays)`;
});

smoke("video faults · 8 a check's preview line names what it grades (a screen by its name, a goal by its title, a question by its words), never a raw id", async () => {
  const g = await fileVia(ownerKey, { project: P, items: [{ kind: "goal", op: "upsert", data: { id: "v28-root", title: "V28: the root goal", status: "in_progress" } }] });
  expect(g.out && g.out.complete, () => `goal: ${g.step}: ${brief(g.out)}`);
  const r = await pv([{ kind: "check", op: "upsert", data: { id: "AC.v28.names", title: "V28 names its refs", given: "a", when: "b", then: "c", refs: ["screen:v28-s3", "goal/v28-root", "q/QV281"] } }]);
  const t = JSON.stringify(r.out || r);
  expect(/V28 Screen 3/.test(t) && /V28: the root goal/.test(t) && /V28 which world\?/.test(t) && !/grades screen:v28-s3/.test(t) && !/goal\/v28-root/.test(t.replace(/"refs":\[[^\]]*\]/g, "")),
    () => `the line: ${(t.match(/Check: [^"]{0,200}/) || [t.slice(0, 300)])[0]}`);
  return `the line: ${(t.match(/Check: [^"]{0,160}/) || [""])[0]}`;
});
