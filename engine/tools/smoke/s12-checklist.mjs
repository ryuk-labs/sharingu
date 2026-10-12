// tools/smoke/s12-checklist.mjs — sprint 3, B3: the checklist and the meter, create_project, Home's goals moved and honest
// counts, through the real door. Self-contained: it makes its own project (s12) with create_project and its own member.
//   · create_project: the admin creates s12 and is handed its first three calls; a member is refused owner_only, the owner's
//     read-only credential read_only_credential; an existing key changes nothing new, an archived one is active again;
//   · holes at 0%: the first three calls, every other area not started; the page leads with them;
//   · filing through preview then file moves the items exactly: an aim, its measure; a root goal and a laned child; a surface
//     (the app area appears), three screens, two in a flow; a render; a check (proof appears); a grade; the meter with them;
//   · the meter chip on Home (the per-area meter) and on each tab's header (Goals, Decisions, Map, GTM, Broadcast), none on
//     Build;
//   · a knowledge write is never an open contribution: Home's open filings and Build's list leave them out, Build's filter
//     shows them; Home's answer carries goalsMoved and the meter, never a leaderboard.
import { smoke, expect, brief, http, mcp, html, ownerKey, readOnlyOf, control, contribute } from "./lib.mjs";

const TAG = String(process.env.S12_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s12" + TAG;
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const holes = async (key = ownerKey) => { const h = await mcp(key, "missing", { project: P }); if (h.isError) throw new Error(`holes: ${brief(h.out)}`); return h.out; };
const item = (h, id) => (h.checklist || []).find((x) => x.id === id) || {};
const st = (h, id) => { const x = item(h, id); return x.state ? `${x.state}${x.want ? ` ${x.have}/${x.want}` : ""}` : "absent"; };
// fileThrough(items) -> the file receipt: preview first (nothing written), then file the same items
async function fileThrough(items, key = ownerKey) {
  const pv = await mcp(key, "preview", { project: P, items });
  if (pv.isError || !pv.out.previewId) throw new Error(`preview: ${brief(pv.out)}`);
  const f = await mcp(key, "file", { previewId: pv.out.previewId, items });
  if (f.isError) throw new Error(`file: ${brief(f.out)}`);
  return f.out;
}
const q = {};

smoke("create_project: the admin creates a project and is handed its first three calls; a member, a read-only credential refused; an existing key and an archived one", async () => {
  const r = await mcp(ownerKey, "create_project", { key: P, name: "S12 Checklist" });
  expect(!r.isError && r.out.project.key === P && r.out.created === true && r.out.reactivated === false && r.out.next.length === 3
    && JSON.stringify(r.out.next.map((x) => x.id)) === JSON.stringify(["aim", "goal-tree", "start-here"]) && r.out.next.every((x) => x.fillPath && x.fillPath.args.project === P && /^preview \{/.test(x.fill)),
    () => `create_project: ${brief(r.out)}`);
  const inv = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", "S12 Member"], ["email", `s12${TAG}@smoke.local`], ["projectKey", P]] });
  q.member = keyOf(inv.text);
  expect(q.member, `add-person: no key (HTTP ${inv.status})`);
  const m = await mcp(q.member, "create_project", { key: P + "-x", name: "Nope" });
  // the owner's read-only credential never reaches a tool (the door answers 401 before the call; create_project refuses it too)
  const ro = await http("POST", "/mcp", { key: readOnlyOf(ownerKey), body: { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "create_project", arguments: { key: P + "-y", name: "Nope" } } } });
  const bad = await mcp(ownerKey, "create_project", { key: "Bad Key!", name: "x" });
  const roRefused = ro.status === 401 || (ro.json && ro.json.result && ro.json.result.isError && /read_only_credential/.test(ro.json.result.content[0].text));
  const listed = await http("GET", "/control/people", { key: ownerKey });
  expect(m.isError && m.out.error === "owner_only" && roRefused && bad.isError && bad.out.error === "bad_project" && ![...((listed.json && listed.json.workspaces) || []), ...((listed.json && listed.json.archived) || [])].some((x) => x.key === P + "-y" || x.key === P + "-x"),
    () => `member ${brief(m.out)} · read-only ${ro.status} ${brief(ro.json)} · bad ${brief(bad.out)}`);
  const again = await mcp(ownerKey, "create_project", { key: P, name: "S12 Checklist" });
  await control({ action: "archive-project", projectKey: P });
  const back = await mcp(ownerKey, "create_project", { key: P, name: "S12 Checklist" });
  const tl = await mcp(q.member, "missing", { project: P + "-x" });
  expect(!again.isError && again.out.created === false && again.out.reactivated === false && /already exists/.test(again.out.note)
    && !back.isError && back.out.reactivated === true && /active again/.test(back.out.note) && tl.isError, () => `again ${brief(again.out)} · back ${brief(back.out)}`);
  return `created ${P} (next: aim, goal-tree, start-here); member owner_only, read-only refused, a bad key bad_project; again: nothing new; archived, then active again`;
});

smoke("holes at 0%: the first three calls lead, every other area not started and not counted; the page leads with them", async () => {
  const h = await holes();
  expect(h.meter.pct === 0 && h.meter.done === 0 && h.meter.total === 3 && JSON.stringify(h.items.map((x) => x.id)) === JSON.stringify(["aim", "goal-tree", "start-here"])
    && JSON.stringify(h.notApplicable.map((a) => a.area)) === JSON.stringify(["app", "proof", "gtm", "agents"]) && h.next.id === "aim" && h.summary.open === 3,
    () => `holes: ${brief({ meter: h.meter, holes: h.items.map((x) => x.id), na: h.notApplicable })}`);
  const pg = await html(`/missing?project=${P}`);
  // sprint 3 L3: the Open card (region holes) leads, before Not started; the first open line is the Next one (data-next)
  const nextBlock = (pg.text.match(/data-region="open"[\s\S]*?<\/section>/) || [""])[0];
  expect(pg.status === 200 && (nextBlock.match(/data-status="open"/g) || []).length === 3 && /data-item="aim"[^>]*data-next/.test(nextBlock) && /data-applies="no"/.test(pg.text)
    && pg.text.indexOf('data-region="open"') < pg.text.indexOf('data-applies="no"'),
    () => `the page: ${pg.status} ${nextBlock.slice(0, 200)}`);
  return `0 of 3 complete · 0% by depth; aim, goal tree, start-here lead; app, proof, GTM and agents not started`;
});

smoke("filing through preview then file moves each item exactly, an area appears when declared, and the meter moves with them", async () => {
  await fileThrough([{ kind: "aim", op: "upsert", data: { aim: "Every checklist item filled from the source", measure: null } }]);
  let h = await holes();
  expect(st(h, "aim") === "partial 1/2" && h.meter.pct === 17, () => `aim: ${st(h, "aim")} · ${h.meter.words}`);
  await fileThrough([{ kind: "aim", op: "upsert", data: { measure: { name: "items complete", value: 1, source: "holes" } } },
    { kind: "goal", op: "upsert", data: { id: "s12-top", parent: null, title: "S12 filled", dimensions: [] } }]);
  h = await holes();
  expect(st(h, "aim") === "done 2/2" && st(h, "goal-tree") === "partial 1/3" && h.items.find((x) => x.id === "goal-tree").fillPath.args.items[0].data.parent === "s12-top",
    () => `aim ${st(h, "aim")} · goal tree ${st(h, "goal-tree")}`);
  await fileThrough([{ kind: "goal", op: "upsert", data: { id: "s12-app", parent: "s12-top", title: "S12 the app", dimensions: ["code"] } }]);
  h = await holes();
  expect(st(h, "goal-tree") === "done 3/3" && !h.areas.find((a) => a.area === "app").applies, () => `goal tree ${st(h, "goal-tree")}`);
  q.before = h.meter;
  await fileThrough([{ kind: "node", op: "upsert", data: { id: "surface:s12-web", type: "surface", name: "S12 Web" } },
    { kind: "node", op: "upsert", data: { id: "screen:s12-a", type: "screen", name: "S12 A", data: { surface: "s12-web", lane: "buy", step: 1 } } },
    { kind: "node", op: "upsert", data: { id: "screen:s12-b", type: "screen", name: "S12 B", data: { surface: "s12-web" } } },
    { kind: "node", op: "upsert", data: { id: "screen:s12-c", type: "screen", name: "S12 Card limits", data: { surface: "s12-web" } } },
    { kind: "edge", op: "upsert", data: { from: "screen:s12-a", to: "screen:s12-b", kind: "nav" } }]);
  h = await holes();
  const flow = h.items.find((x) => x.id === "screens-in-flow") || {};
  expect(h.areas.find((a) => a.area === "app").applies && st(h, "screens") === "done 1/1" && st(h, "screens-in-flow") === "partial 2/3" && flow.first && flow.first.id === "screen:s12-c"
    && /^1 of 3 screens is in no flow, first: S12 Card limits\.$/.test(flow.what) && st(h, "screens-pictured") === "empty 0/3" && h.meter.total > q.before.total,
    () => `app: ${brief(h.checklist.filter((x) => x.area === "app"))} · ${flow.what}`);
  await fileThrough([{ kind: "render", op: "upsert", data: { screen: "screen:s12-a", format: "html", body: "<main><h1>S12 A</h1></main>" } }]);
  h = await holes();
  expect(st(h, "screens-pictured") === "partial 1/3", () => `pictured ${st(h, "screens-pictured")}`);
  await fileThrough([{ kind: "check", op: "upsert", data: { id: "AC.s12.01", title: "S12 A shows", given: "a visitor", when: "they open A", then: "A shows", refs: ["screen:s12-a"] } }]);
  h = await holes();
  expect(h.areas.find((a) => a.area === "proof").applies && st(h, "checks-screens") === "partial 1/3" && st(h, "grades") === "empty 0/1" && h.items.find((x) => x.piece === "grades").fillPath.args.items[0].grade.checkId === "AC.s12.01",
    () => `proof: ${brief(h.checklist.filter((x) => x.area === "proof"))}`);
  await fileThrough([{ grade: { checkId: "AC.s12.01", verdict: "proven", proof: "curl /map/screens -> A drawn (smoke s12)" } }]);
  h = await holes();
  const live = h.checklist.filter((x) => x.state !== "not_applicable");
  const pct = Math.round((100 * live.reduce((a, x) => a + x.have / x.want, 0)) / live.length);
  expect(st(h, "grades") === "done 1/1" && h.meter.total === live.length && h.meter.done === live.filter((x) => x.state === "done").length && h.meter.pct === pct,
    () => `grades ${st(h, "grades")} · ${brief(h.meter)} vs ${pct}`);
  q.meter = h.meter;
  return `aim partial then done; goal tree 1/3 then 3/3; the app appeared (2 of 3 screens in a flow, first S12 Card limits; 1 of 3 pictured); proof appeared; graded; ${h.meter.words}`;
});

smoke("the meter on Home (per area) and no fill chip on any tab (L4); a member's Home counts the same", async () => {
  const home = await html(`/home?project=${P}`);
  const hm = /data-meter="home" data-pct="(\d+)" data-open="(\d+)" data-done="(\d+)" data-total="(\d+)"/.exec(home.text);
  // sprint 3 L2: the meter is Home's Filled (the glance's tile, or the chip on the Contributions card while nothing is contributed);
  // the per-area line is gone (What is missing lists the areas)
  expect(home.status === 200 && hm && Number(hm[1]) === q.meter.pct && Number(hm[4]) === q.meter.total && !/data-area="[a-z]+" data-pct=/.test(home.text),
    () => `Home: ${home.status} ${hm ? hm[0] : "no meter"}`);
  const chips = {};
  for (const [tab, path] of [["goals", "/goals"], ["decisions", "/decisions"], ["map", "/map"], ["gtm", "/gtm"], ["broadcast", "/broadcast"], ["build", "/build"]]) {
    const pg = await html(`${path}?project=${P}`);
    const m = new RegExp(`<a class="u-meter" href="/missing" data-meter="${tab}"[^>]*>`).exec(pg.text);
    chips[tab] = pg.status === 200 ? (m ? (/data-total="0"/.test(m[0]) ? "not started" : (/data-pct="(\d+)"/.exec(m[0]) || [])[1] + "%") : "none") : `HTTP ${pg.status}`;
  }
  // L4: the fill lives on What is missing (and Home's Filled tile) alone: no tab draws a meter chip
  expect(Object.values(chips).every((v) => v === "none"), () => `chips: ${brief(chips)}`);
  const sum = await http("GET", `/home/summary?project=${P}`, { key: q.member });
  expect(sum.status === 200 && sum.json.meter && sum.json.meter.total === q.meter.total && sum.json.goalsMoved && Array.isArray(sum.json.goalsMoved.rows) && !("leaderboard" in sum.json),
    () => `member's Home: ${sum.status} ${brief(sum.json && sum.json.meter)}`);
  return `Home ${q.meter.words}; chips ${Object.entries(chips).map(([k, v]) => `${k} ${v}`).join(" · ")}`;
});

smoke("a knowledge write or a grade is never an open contribution: Home and Build leave them out, Build's filter shows them", async () => {
  const sum = await http("GET", `/home/summary?project=${P}`, { key: ownerKey });
  const b = await http("GET", `/build?project=${P}`, { key: ownerKey });
  const bk = await http("GET", `/build?project=${P}&kind=knowledge`, { key: ownerKey });
  const m = sum.json.metrics;
  expect(sum.status === 200 && m.contributions.total === 0 && m.inMotion.total === 0
    && b.status === 200 && !(b.json.rows || []).some((r) => r.kind === "knowledge" || r.kind === "grade") && b.json.counts.contributions === 0 && b.json.counts.byKind.knowledge >= 6
    && bk.status === 200 && bk.json.rows.length >= 6 && bk.json.rows.every((r) => r.kind === "knowledge"),
    () => `Home ${brief(m)} · Build ${brief(b.json && b.json.counts)} rows ${(b.json.rows || []).length} · knowledge ${bk.json ? bk.json.rows.length : "?"}`);
  const note = await contribute(ownerKey, { project: P, lane: "leader", kind: "note", what: "S12 a plain note", why: "work, not a record" });
  const after = await http("GET", `/home/summary?project=${P}`, { key: ownerKey });
  expect(!note.isError && after.json.metrics.contributions.total === 1 && after.json.metrics.inMotion.total === 0, () => `after a note: ${brief(after.json.metrics)}`);
  return `after ${b.json.counts.byKind.knowledge} knowledge writes and a grade: 0 contributions, 0 in motion; Build lists none of them (its filter lists ${bk.json.rows.length}); one note: 1 open`;
});
