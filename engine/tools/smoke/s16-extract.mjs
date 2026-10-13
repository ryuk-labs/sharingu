// tools/smoke/s16-extract.mjs — sprint 3, B5: extract, through the real door. Self-contained: it adds its own project (s16) and
// its people (a member seated on it, a Partner seated on it, a Partner seated nowhere), so it reads nothing an earlier case left.
//   · the owner files the model through preview, then file (a goal, a screen, a door it depends on, a check, an open doc, a
//     doc for finance only, a claim card), then publishes v1;
//   · the member files a change through preview, then file (a code contribution naming the screen, the screen renamed);
//   · search finds the goal, the screen and the contribution, and never names the finance doc to the member;
//   · read returns the goal and the contribution by their refs; the finance doc is not_found for the member;
//   · changes lists the contribution since v1 with what it reaches (the door);
//   · brief for the engineering hat and for the screen;
//   · the Library page and a search on it load, the Goals tab carries "changed since v1", What changed loads;
//   · a Partner seated on the project reads it; a Partner seated nowhere is refused everywhere.
import { smoke, expect, brief, http, mcp, html, ownerKey, control, fileParts } from "./lib.mjs";

const TAG = String(process.env.S16_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s16" + TAG;
const q = {};
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return { key, email, name };
};
const fileVia = async (key, items) => {
  const pv = await mcp(key, "preview", { project: P, items });
  expect(!pv.isError && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await fileParts((n, a) => mcp(key, n, a), pv.out, items, { only: "ready" });   // sprint 19: each part with its write tool
  expect(!f.isError && f.out.complete === true, () => `file: ${brief(f.out)}`);
  return f.out;
};
const MODEL = [
  { kind: "goal", op: "upsert", data: { id: "s16-root", title: "S16 ship the store", dimensions: ["leader"] } },
  { kind: "goal", op: "upsert", data: { id: "s16-annual", parent: "s16-root", title: "S16 annual pricing launch", dimensions: ["code"] } },
  { kind: "node", op: "upsert", data: { id: "screen:s16-pricing", type: "screen", name: "S16 Pricing", data: { surface: "s16-web" } } },
  { kind: "node", op: "upsert", data: { id: "door:s16-prices", type: "door", name: "GET /s16/prices" } },
  { kind: "edge", op: "upsert", data: { from: "screen:s16-pricing", to: "door:s16-prices", kind: "depends" } },
  { kind: "check", op: "upsert", data: { id: "AC.s16.screen", title: "The S16 pricing screen shows the annual plan", refs: ["screen:s16-pricing"] } },
  { kind: "doc", op: "upsert", data: { path: "s16/pricing.md", title: "S16 pricing guide", body: "How S16 pricing works: annual first.", asOf: "2026-09-30", confidence: "direction" } },
  { kind: "doc", op: "upsert", data: { path: "s16/finance-terms.md", title: "S16 finance only terms", body: "S16 pricing floor for finance.", roleVisibility: ["finance"] } },
  { kind: "card_kind", op: "upsert", data: { key: "s16claim", label: "S16 Claims", tab: "gtm" } },
  { kind: "card", op: "upsert", data: { kind: "s16claim", id: "c1", name: "S16 teams pick annual pricing", asOf: "2026-09-30", confidence: "direction" } },
];

smoke("extract: the model filed through preview then file, v1 published, a change filed after it", async () => {
  await control({ action: "add-project", key: P, name: "S16" });
  q.m = await invite("S16 Mia", `mia${TAG}@s16.local`, "member", [P]);
  q.pa = await invite("S16 Pat", `pat${TAG}@s16.local`, "partner", [P]);
  q.loner = await invite("S16 Loner", `loner${TAG}@s16.local`, "partner", []);
  await fileVia(ownerKey, MODEL);
  const v = await mcp(ownerKey, "publish_version", { project: P, title: "S16 first" });
  expect(!v.isError, () => brief(v.out));
  // wait into the next millisecond so the change is strictly after the version
  await new Promise((r) => setTimeout(r, 5));
  const f = await fileVia(q.m.key, [
    { contribution: { lane: "code", kind: "pr", what: "S16 annual toggle on pricing", why: "Buyers asked for annual billing.", touches: ["screen:s16-pricing"], proof: "npm test -> exit 0, 12 passing" } },
    { kind: "node", op: "upsert", data: { id: "screen:s16-pricing", type: "screen", name: "S16 Pricing, annual first", data: { surface: "s16-web" } } }]);
  q.tx = ((f.items || []).find((x) => x.filed && /^T-/.test(String(x.filed.id || ""))) || {}).filed.id;
  expect(/^T-\d{8}-\d+$/.test(q.tx || ""), () => `no contribution id in the receipt: ${brief(f.items)}`);
  return `filed ${MODEL.length} items, v1 published, then the member's contribution ${q.tx} and the screen renamed`;
});

smoke("search: one search finds the goal, the screen and the contribution; the member never sees the finance-only doc", async () => {
  const own = (await mcp(ownerKey, "search", { project: P, q: "s16 pricing" })).out;
  const mem = (await mcp(q.m.key, "search", { project: P, q: "s16 pricing" })).out;
  const kinds = (a) => Object.fromEntries((a.groups || []).map((g) => [g.kind, g.count]));
  const refs = (a) => (a.groups || []).flatMap((g) => g.hits.map((h) => h.ref));
  expect(kinds(own).doc === 2 && kinds(mem).doc === 1 && refs(mem).includes("goal/s16-annual") && refs(mem).includes("screen:s16-pricing") && refs(mem).includes(q.tx) && refs(mem).includes("card/s16claim/c1")
    && !/finance only|finance-terms/.test(JSON.stringify(mem)), () => brief({ own: kinds(own), mem: kinds(mem), refs: refs(mem) }));
  const rest = await http("GET", `/search?project=${P}&q=${encodeURIComponent("s16 pricing")}`, { key: q.m.key });
  expect(rest.status === 200 && JSON.stringify(rest.json) === JSON.stringify(mem), () => `GET /search ${rest.status}`);
  return `owner ${brief(kinds(own))}; member ${brief(kinds(mem))} (the finance doc neither named nor counted); GET /search is the tool's twin`;
});

smoke("read: the goal and the contribution by their refs, with their links; the finance-only doc is not_found for the member", async () => {
  const g = (await mcp(q.m.key, "read", { project: P, ref: "goal/s16-annual" })).out;
  const t = (await mcp(q.m.key, "read", { project: P, ref: q.tx })).out;
  const d = await mcp(q.m.key, "read", { project: P, ref: "doc/s16/finance-terms.md" }), d0 = (await mcp(ownerKey, "read", { project: P, ref: "doc/s16/finance-terms.md" })).out;
  expect(g.item && g.item.id === "s16-annual" && g.links.some((l) => l.ref === "goal/s16-root") && t.kind === "contribution" && t.links.some((l) => l.ref === "screen:s16-pricing")
    && d.isError && d.out.error === "not_found" && d0.item && d0.item.title === "S16 finance only terms", () => brief({ g, t: t.links, d: d.out }));
  return "goal/s16-annual with its parent, the contribution with what it touches; the finance doc not_found for the member, read by the owner";
});

smoke("changes: since v1 the contribution and the rename, the contribution with what it reaches", async () => {
  const c = (await mcp(q.m.key, "changes", { project: P })).out;
  const tx = (c.changes || []).find((x) => x.id === q.tx);
  expect(c.since && c.since.label === "v1" && tx && tx.change === "contribution" && tx.reaches && tx.reaches.first.includes("door:s16-prices") && (c.changes || []).some((x) => x.change === "knowledge" && x.refs.some((r) => r.ref === "screen:s16-pricing")),
    () => brief(c));
  const page = await html(`/changes?project=${P}`, q.m.key);
  // L4 (the row budget): the page's chip says what each row changed (data-touched); its reach is the row's Impact view's, and
  // the JSON twin (the `changes` tool) keeps the whole walk
  expect(page.status === 200 && page.text.includes(`data-change="${q.tx}"`) && /data-touched="/.test(page.text) && !/data-reach="/.test(page.text), () => `changes page ${page.status}`);
  return `${c.total} changes since v1; ${q.tx} ${tx.reaches.line}; the page lists it with its reach`;
});

smoke("brief: the engineering hat's packet and the screen's packet", async () => {
  const h = (await mcp(q.m.key, "brief", { project: P, for: "engineering" })).out;
  const r = (await mcp(q.m.key, "brief", { project: P, for: "screen:s16-pricing" })).out;
  expect(h.hat && h.hat.key === "engineering" && h.goals.some((g) => g.ref === "goal/s16-annual") && h.changed && h.changed.total >= 1 && h.startHere && h.startHere.href,
    () => brief(h));
  expect(r.kind === "node" && r.dependsOn.some((l) => l.ref === "door:s16-prices") && r.checks.some((x) => x.id === "AC.s16.screen") && r.contributions.some((x) => x.id === q.tx), () => brief(r));
  const rest = await http("GET", `/brief?project=${P}&for=engineering`, { key: q.m.key });
  expect(rest.status === 200 && rest.json.hat && rest.json.hat.key === "engineering", () => `GET /brief ${rest.status}`);
  return `engineering: ${h.goals.length} goals, ${h.changed.total} changed since v1; the screen: depends on the door, its check, ${q.tx}`;
});

smoke("pages: the Library (and its search) and the Goals tab's chip \"changed since v1\" load", async () => {
  const lib = await html(`/library?project=${P}`, q.m.key), s = await html(`/library?project=${P}&q=annual`, q.m.key), goals = await html(`/goals?project=${P}`, q.m.key);
  expect(lib.status === 200 && /data-screen="library"/.test(lib.text) && lib.text.includes('data-doc="s16/pricing.md"') && lib.text.includes('data-card="s16claim/c1"') && /data-lists-on="gtm"/.test(lib.text) && !/finance-terms/.test(lib.text),
    () => `library ${lib.status}`);
  expect(s.status === 200 && s.text.includes('data-hit="goal/s16-annual"'), () => `library search ${s.status}`);
  // nothing since v1 named a goal: the Goals chip says so; the Map's counts the contribution and the rename
  expect(goals.status === 200 && /data-changed="goals" data-n="0"/.test(goals.text) && />Nothing changed since v1</.test(goals.text), () => `goals chip: ${(goals.text.match(/u-changed[^>]*>[^<]*/) || ["none"])[0]}`);
  const map = await html(`/map?project=${P}`, q.m.key);
  expect(map.status === 200 && /data-changed="map" data-n="2"/.test(map.text), () => `map chip: ${(map.text.match(/u-changed[^>]*>[^<]*/) || ["none"])[0]}`);
  return `the Library lists the open doc and the claim (lists on GTM), its search finds the goal; chips: Goals "Nothing changed since v1", Map "${(map.text.match(/class="u-changed"[^>]*>([^<]*)/) || ["", "?"])[1]}"`;
});

smoke("authority: a Partner seated on S16 reads it as a member does; a Partner seated nowhere is refused by search, read, changes and brief", async () => {
  const pa = (await mcp(q.pa.key, "search", { project: P, q: "s16 pricing" })).out;
  const mem = (await mcp(q.m.key, "search", { project: P, q: "s16 pricing" })).out;
  expect(JSON.stringify(pa.groups) === JSON.stringify(mem.groups), () => brief(pa));
  const calls = [["search", { q: "pricing" }], ["read", { ref: "goal/s16-annual" }], ["changes", {}], ["brief", { for: "engineering" }]];
  const outs = [];
  for (const [n, a] of calls) { const r = await mcp(q.loner.key, n, { project: P, ...a }); outs.push(r.isError ? r.out.error : "answered"); }
  const g = await http("GET", `/search?project=${P}&q=pricing`, { key: q.loner.key });
  expect(outs.every((x) => x === "project_forbidden") && g.status === 403, () => brief({ outs, g: g.status }));
  return `the seated Partner reads what the member reads; the Partner seated nowhere: ${outs.join(", ")}, GET /search ${g.status}`;
});

// ---- P3-F: the read side's fixes (after the cases above, so their counts and chips stay theirs) ----
smoke("brief: a question waiting on Vendor X is a blocker in management's brief, not management's own; question/<qid> reads as q/<qid>", async () => {
  await fileVia(ownerKey, [
    { kind: "question", op: "upsert", data: { qid: "Q-s16-vendor", question: "S16 which settlement account?", status: "open", severity: "blocker", options: [{ what: "A" }, { what: "B" }], waitingOn: "Vendor X", blocks: ["screen:s16-pricing"] } },
    { kind: "question", op: "upsert", data: { qid: "Q-s16-mine", question: "S16 launch in May?", status: "open", options: [{ what: "yes" }, { what: "no" }], whoOwes: "owner" } }]);
  const m = (await mcp(q.m.key, "brief", { project: P, for: "management" })).out;
  const b = (m.blockers || []).find((x) => x.ref === "q/Q-s16-vendor");
  expect(b && b.waitingOn === "Vendor X" && b.blocks.includes("screen:s16-pricing") && !m.questions.some((x) => x.ref === "q/Q-s16-vendor") && m.questions.some((x) => x.ref === "q/Q-s16-mine"),
    () => brief({ questions: m.questions, blockers: m.blockers }));
  const d = (await mcp(q.m.key, "decisions", { project: P, status: "open" })).out;
  expect(d.whoOwes.elsewhere >= 1 && d.rows.some((x) => x.qid === "Q-s16-vendor" && x.waitingOn === "Vendor X"), () => brief(d.whoOwes));
  const r1 = (await mcp(q.m.key, "read", { project: P, ref: "question/Q-s16-vendor" })).out, r2 = (await mcp(q.m.key, "read", { project: P, ref: "q/Q-s16-vendor" })).out;
  expect(r1.kind === "question" && JSON.stringify(r1.item) === JSON.stringify(r2.item), () => brief(r1));
  return `management owes Q-s16-mine; Q-s16-vendor waits on ${b.waitingOn} (severity ${b.severity}, blocks ${b.blocks.join(", ")}), counted elsewhere on Decisions; question/Q-s16-vendor reads as q/`;
});

smoke("read: each check carries its latest grade; status fail answers exactly the check graded fail", async () => {
  await fileVia(ownerKey, [{ kind: "check", op: "upsert", data: { id: "AC.s16.total", title: "The S16 total shows", refs: ["screen:s16-pricing"] } }]);
  const g = await mcp(ownerKey, "submit_grade", { project: P, checkId: "AC.s16.screen", verdict: "refused", proof: "GET /s16/pricing -> 200, the annual plan is missing" });
  expect(!g.isError, () => `submit_grade: ${brief(g.out)}`);
  const all = (await mcp(q.m.key, "read", { project: P, kind: "check" })).out, fail = (await mcp(q.m.key, "read", { project: P, kind: "check", status: "fail" })).out;
  const un = (await mcp(q.m.key, "read", { project: P, kind: "check", status: "ungraded" })).out;
  const gr = (all.items || []).find((x) => x.id === "AC.s16.screen") || {};
  expect(gr.grade && gr.grade.verdict === "refused" && gr.grade.gradedAt && gr.grade.stale === false && (all.items || []).find((x) => x.id === "AC.s16.total").grade === null, () => brief(all.items));
  expect(fail.items.map((x) => x.id).join() === "AC.s16.screen" && un.items.map((x) => x.id).join() === "AC.s16.total", () => brief({ fail: fail.items, un: un.items }));
  const rest = await http("GET", `/read?project=${P}&kind=check&status=fail`, { key: q.m.key });
  expect(rest.status === 200 && JSON.stringify(rest.json) === JSON.stringify(fail), () => `GET /read ${rest.status} ${brief(rest.json)}`);
  return `AC.s16.screen refused at ${gr.grade.gradedAt}; status fail: ${fail.items.map((x) => x.id).join()}; ungraded: ${un.items.map((x) => x.id).join()}; GET /read the same`;
});

smoke("project: the owner, seated nowhere, searches with no project; the answer names the projects they may read", async () => {
  const who = (await mcp(ownerKey, "whoami")).out;
  expect(Array.isArray(who.projects) && who.projects.length === 0, () => `the owner holds seats: ${brief(who.projects)}`);
  const r = (await mcp(ownerKey, "search", { q: "s16" })).out;
  expect(/^Add `project`: one of \[/.test(r.projectNote || "") && r.projectNote.includes(P) && r.projectNote.includes("smoke") && r.projectNote.includes(`this reads "${r.project}"`), () => brief(r));
  return r.projectNote;
});
