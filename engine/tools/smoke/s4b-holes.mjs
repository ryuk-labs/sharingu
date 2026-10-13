// tools/smoke/s4b-holes.mjs — slice 4b: loop 1 (holes -> file what is missing -> it shows, and the hole closes), and the
// docs, cards and served-state reads on D1. A fresh project s4b (added here); the member from s0 is seated on it. Every
// fill below is the fillPath `holes` handed out, with its placeholders replaced by real values, and nothing else.
import { smoke, expect, brief, s, http, html, mcp, control, ownerKey, kwrite, kread, fileParts } from "./lib.mjs";

const P = "s4b";
const holesOf = async (key = ownerKey) => {
  const h = await mcp(key, "missing", { project: P });
  if (h.isError) throw new Error(`holes: ${brief(h.out)}`);
  return h.out;
};
const openNames = (h) => (h.items || []).map((x) => x.piece);
const holeNamed = (h, name) => (h.items || []).find((x) => x.piece === name) || null;
// send(fillPath, fix) -> the answer, the fillPath's args changed by fix(args) (the real values an agent puts in). The one-pass
// fix 8: a fillPath is a `preview` (then each part's write tool with the same items and its previewId, as fillPath.then says),
// rule_question or (sprint 19) submit_grade; a preview's answer here is the receipt's item (its status, id and route)
async function send(fillPath, fix, key = ownerKey) {
  const args = JSON.parse(JSON.stringify(fillPath.args));
  fix(args);
  const r = await mcp(key, fillPath.tool, args);
  if (r.isError) throw new Error(`${fillPath.tool}: ${brief(r.out)}`);
  if (fillPath.tool !== "preview") return r.out;
  const f = await fileParts((n, a) => mcp(key, n, a), r.out, args.items);   // sprint 19: each part with its write tool
  if (f.isError) throw new Error(`${f.step}: ${brief(f.out)}`);
  return { preview: r.out, receipt: f.out, item: f.out.items[0] };
}
const region = (page, r) => (new RegExp(`data-region="${r}"[\\s\\S]*?</section>`).exec(page) || [""])[0];

smoke("loop 1: holes names the missing aim with its fillPath; sending exactly that op closes it and the aim shows on Home", async () => {
  await control({ action: "add-project", key: P, name: "S4b" });
  await control({ action: "grant-seat", personId: s.member.id, projectKey: P });
  const before = await holesOf();
  const aim = holeNamed(before, "aim");
  expect(before.project === P && before.next && before.next.piece === "aim" && openNames(before)[0] === "aim" && aim && aim.status === "open"
    && aim.fillPath.tool === "preview" && aim.fillPath.args.project === P && aim.fillPath.args.items.length === 1 && aim.fillPath.args.items[0].kind === "aim"
    && /<[^>]+>/.test(aim.fillPath.args.items[0].data.aim) && /^then save_knowledge \{previewId, items\}/.test(aim.fillPath.then) && aim.fill.startsWith("preview {")
    && !JSON.stringify(before).includes("serve/") && !/publish/i.test(JSON.stringify(before.items)),
  () => `holes before: ${brief(before)}`);
  const w = await send(aim.fillPath, (a) => { a.items[0].data.aim = "Close loop one on glass, with no publish step"; });
  expect(w.preview.items[0].verdict === "files" && w.item.filed && w.item.filed.status === "filed", () => brief(w));
  const after = await holesOf();
  expect(!openNames(after).includes("aim") && after.filled.includes("aim") && (!after.next || after.next.piece !== "aim"), () => `holes after: ${brief(after)}`);
  const j = await http("GET", `/home/summary?project=${P}`, { key: ownerKey });
  const page = await html(`/home?project=${P}`);
  expect(j.status === 200 && j.json.aim.text === "Close loop one on glass, with no publish step" && /Close loop one on glass/.test(region(page.text, "aim")) && !/data-state="empty"/.test(region(page.text, "aim")),
    () => `Home: ${j.status} ${brief(j.json && j.json.aim)}`);
  const gp = await html(`/missing?project=${P}`);
  // the aim's piece by its hooks (the look pass): data-hole="aim" with data-status="filed", never "open"
  expect(gp.status === 200 && /data-hole="aim" data-status="filed"/.test(gp.text) && !/data-hole="aim" data-status="open"/.test(gp.text), () => `GET /missing: ${gp.status}`);
  return `before: ${openNames(before).join(", ")}; sent the aim's own op; after: aim filed (next ${after.next ? after.next.piece : "none"}), Home and /missing show it in the same session`;
});

smoke("an ungraded check is a hole whose fillPath is its submit_grade; grading it with proof closes it", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [
    { kind: "goal", op: "upsert", data: { id: "s4b-goal", title: "Close loop one", parent: null, dimensions: ["leader"] } },
    // sprint 3 (B3): the goal tree is complete with a goal under its root, each leaf with a lane
    { kind: "goal", op: "upsert", data: { id: "s4b-step", title: "File what is missing", parent: "s4b-goal", dimensions: ["leader"] } },
    { kind: "check", op: "upsert", data: { id: "AC.s4b.01", title: "The aim shows on Home", given: "an owner", when: "they open Home", then: "the aim is drawn", refs: ["s4b-goal"] } },
    { kind: "check", op: "upsert", data: { id: "AC.s4b.02", title: "The hole closes", given: "an agent", when: "it files the fill", then: "holes drops it", refs: ["s4b-goal"] } },
  ] });
  expect(!w.isError && w.out.written === 4, () => brief(w.out));
  const h = await holesOf();
  const g = holeNamed(h, "grades");
  // sprint 19: a grade files at once, so its fill is the submit_grade call itself (preview refuses a grade)
  expect(g && g.fillPath.tool === "submit_grade" && g.fillPath.args.checkId === "AC.s4b.01" && g.fillPath.args.project === P && g.count === 2 && !openNames(h).includes("checks") && !openNames(h).includes("goals"),
    () => `holes: ${brief(h.items)}`);
  // D1b item 9: the fill line's verdict is a placeholder the client fills from what it observes (never a suggested "proven")
  expect(/^<proven \| refused \| incomplete/.test(g.fillPath.args.verdict), () => `the fill line suggests a verdict: ${brief(g.fillPath)}`);
  const one = await send(g.fillPath, (a) => { a.proof = "curl -s /home/summary?project=s4b -> aim.text set (smoke s4b)"; a.verdict = "proven"; });
  expect(/^T-/.test(one.transmission || "") && one.counted === true && one.checkId === "AC.s4b.01", () => brief(one));
  const mid = holeNamed(await holesOf(), "grades");
  expect(mid && mid.count === 1 && mid.fillPath.tool === "submit_grade" && mid.fillPath.args.checkId === "AC.s4b.02", () => `after one grade: ${brief(mid)}`);
  const two = await send(mid.fillPath, (a) => { a.proof = "holes after the aim write: aim filed (smoke s4b)"; a.verdict = "refused"; });
  expect(/^T-/.test(two.transmission || "") && two.counted === true, () => brief(two));
  const after = await holesOf();
  expect(!openNames(after).includes("grades") && after.filled.includes("grades"), () => `holes after: ${brief(after.items)}`);
  return `grades open with 2 (fillPath: submit_grade AC.s4b.01), then 1 (AC.s4b.02), then filled`;
});

smoke("GET /goals/:ref lists the goal's checks with their grades, and GET /goals counts them", async () => {
  const one = await http("GET", `/goals/s4b-goal?project=${P}`, { key: ownerKey });
  const c = (one.json && one.json.checks) || {};
  const verdicts = (c.rows || []).map((r) => `${r.id}:${r.grade ? r.grade.verdict : "none"}`).join(",");
  expect(one.status === 200 && c.total === 2 && c.passed === 1 && c.failed === 1 && c.ungraded === 0 && c.light === "red" && verdicts === "AC.s4b.01:proven,AC.s4b.02:refused", () => `GET /goals/s4b-goal: ${one.status} ${brief(c)}`);
  const tool = await mcp(ownerKey, "goals", { project: P, ref: "s4b-goal" });
  expect(JSON.stringify(tool.out.checks) === JSON.stringify(c), () => `goal tool: ${brief(tool.out.checks)}`);
  const all = await http("GET", `/goals?project=${P}`, { key: ownerKey });
  const n = (all.json.nodes || []).find((x) => x.id === "s4b-goal") || {};
  expect(JSON.stringify(n.checks) === JSON.stringify({ total: 2, passed: 1, failed: 1, ungraded: 0, stale: 0 }), () => `GET /goals node: ${brief(n)}`);   // stale: sprint 3 B4
  const page = await html(`/goals/s4b-goal?project=${P}`);
  const reg = region(page.text, "checks");
  expect(/data-check="AC.s4b.01" data-verdict="proven"/.test(reg) && /data-check="AC.s4b.02" data-verdict="refused"/.test(reg), () => `checks region: ${reg.slice(0, 300)}`);
  const tree = await html(`/goals?project=${P}`);
  // sprint 3 L2: the goal's checks are its row's fact (opened in place), each verdict a chip with its count (a zero says nothing)
  expect(/data-id="s4b-goal"[\s\S]*?<dt>Checks<\/dt><dd><span class="p-chip" data-tone="ok">Passed<span class="p-chip-n">1<\/span><\/span><span class="p-chip" data-tone="bad">Failed<span class="p-chip-n">1<\/span>/.test(tree.text), "Goals row carries no checks fact");
  return `s4b-goal: ${verdicts} (light ${c.light}); GET /goals counts {2, 1 passed, 1 failed, 0 ungraded}; both pages draw them`;
});

smoke("an owed open question is a hole for the owner (not for a member); rule_question from its fillPath closes it", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [{ kind: "question", op: "upsert", data: { qid: "Q-s4b-1", question: "Where does loop one close?", whoOwes: "owner", options: [{ what: "on the next read" }, { what: "after a publish" }] } }] });
  expect(!w.isError, () => brief(w.out));
  const h = await holesOf();
  const q = holeNamed(h, "questions");
  expect(q && q.fillPath.tool === "rule_question" && q.fillPath.args.qid === "Q-s4b-1" && q.count === 1, () => `owner's holes: ${brief(h.items)}`);
  const m = await holesOf(s.member.key);
  expect(m.project === P && !openNames(m).includes("questions") && !m.filled.includes("rulings-owed"), () => `member's holes: ${brief(m)}`);
  const r = await send(q.fillPath, (a) => { a.rationale = "Live: no publish step."; });
  expect(r.status === "decided" && r.label === "on the next read", () => brief(r));
  expect(!openNames(await holesOf()).includes("questions"), "the ruled question is still a hole");
  return "owner: questions (rule_question Q-s4b-1); member: none; ruled from the fillPath, closed on the next read";
});

smoke("a doc filed through preview then file is listed and read by read; a role that may not read it reads not_found, as a missing doc", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [
    { kind: "doc", op: "upsert", data: { path: "guides/s4b.md", title: "S4b guide", body: "# S4b guide\nFor engineers only.", roleVisibility: ["internal-eng"] } },
    { kind: "doc", op: "upsert", data: { path: "capsules/member.md", title: "Leader brief", body: "# Leader brief\nWhat a leader reads.", roleVisibility: ["member"] } },
    { kind: "doc", op: "upsert", data: { path: "notes/open.md", title: "Open note", body: "# Open note\nEveryone seated reads this." } },
  ] });
  expect(!w.isError && w.out.written === 3, () => brief(w.out));
  // D5: `read`: {kind: "doc"} lists the docs the reader may read, {ref: "doc/<path>"} reads one
  const pathsOf = (r) => ((r.out && r.out.items) || []).map((d) => d.path);
  const lo = await kread(ownerKey, { project: P, kind: "doc", limit: 100 });
  const lm = await kread(s.member.key, { project: P, kind: "doc", limit: 100 });
  expect(["guides/s4b.md", "capsules/member.md", "notes/open.md"].every((d) => pathsOf(lo).includes(d)) && (lo.out.items.find((d) => d.path === "guides/s4b.md") || {}).title === "S4b guide"
    && !pathsOf(lm).includes("guides/s4b.md") && pathsOf(lm).includes("notes/open.md") && pathsOf(lm).includes("capsules/member.md"), () => `owner ${brief(pathsOf(lo))} · member ${brief(pathsOf(lm))}`);
  const dOwner = await kread(ownerKey, { project: P, ref: "doc/guides/s4b.md" });
  const dMember = await kread(s.member.key, { project: P, ref: "doc/guides/s4b.md" });
  const rMember = await http("GET", `/doc/guides/s4b.md?project=${P}`, { key: s.member.key });
  const rOwner = await http("GET", `/doc/guides/s4b.md?project=${P}`, { key: ownerKey });
  const rRead = await http("GET", `/read?project=${P}&ref=doc/guides/s4b.md`, { key: s.member.key });
  expect(dOwner.out.item && dOwner.out.item.body === "# S4b guide\nFor engineers only." && dMember.isError && dMember.out.error === "not_found" && rMember.status === 404 && rRead.status === 404 && rOwner.status === 200 && rOwner.text.startsWith("# S4b guide"),   // D1b item 2: hidden = missing
    () => `owner ${brief(dOwner.out)} · member ${brief(dMember.out)} · GET ${rMember.status}/${rOwner.status}/${rRead.status}`);
  // D5: brief with no `for` is (your role's brief), or a named role's; GET /brief?role= its twin
  const cap = await mcp(s.member.key, "brief", { project: P });
  const capOther = await mcp(s.member.key, "brief", { project: P, role: "finance" });
  const capGet = await http("GET", `/brief?project=${P}&role=member`, { key: s.member.key });
  expect(cap.out.brief && cap.out.brief.body === "# Leader brief\nWhat a leader reads." && capOther.isError && capOther.out.error === "unknown_brief" && capGet.status === 200 && capGet.json.brief.body === cap.out.brief.body,
    () => `brief ${brief(cap.out)} · other ${brief(capOther.out)} · GET ${capGet.status}`);
  const none = await kread(ownerKey, { project: P, ref: "doc/nope.md" });
  expect(none.isError && none.out.error === "not_found", () => brief(none.out));
  return "read lists the three docs to the owner, not the engineers' doc to a leader; read and GET /doc/* answer it not_found / 404, as a missing doc (D1b item 2); the leader reads their role's brief through brief";
});

smoke("start-here: the built-in guide until the project files its own; then that doc answers and the hole closes", async () => {
  const h = await holesOf();
  const sh = holeNamed(h, "start-here");
  const built = await kread(ownerKey, { project: P, ref: "doc/start-here.md" });
  const bb = (built.out.item || {}).body;
  expect(sh && sh.fillPath.args.items[0].data.path === "start-here.md" && typeof bb === "string" && /## Your first five minutes/.test(bb) && !/shared brain/.test(bb) && built.out.item.builtIn === true, () => `hole ${brief(sh)} · built-in ${String(bb).slice(0, 80)}`);
  await send(sh.fillPath, (a) => { a.items[0].data.body = "# Start here, S4b\nFile what `missing` names."; });
  const own = await kread(ownerKey, { project: P, ref: "doc/start-here.md" });
  const after = await holesOf();
  expect((own.out.item || {}).body === "# Start here, S4b\nFile what `missing` names." && !own.out.item.builtIn && !openNames(after).includes("start-here"), () => `own ${brief(own.out)} · missing ${brief(openNames(after))}`);
  return "the built-in guide, then the project's own start-here.md; the item closed";
});

smoke("a card filed through preview then file is returned by read and found by search", async () => {
  const w = await kwrite(ownerKey, { project: P, ops: [{ kind: "card", op: "upsert", data: { kind: "note", id: "s4b-card-1", name: "S4b loop card", status: "live", body: "# S4b loop card\nFiled, then found." } }] });
  expect(!w.isError, () => brief(w.out));
  // D5: read {kind: "card", cardKind} lists a kind's cards, read {ref: card/…} reads one, search finds
  const page = await kread(ownerKey, { project: P, kind: "card", cardKind: "note" });
  expect(!page.isError && (page.out.items || []).length === 1 && page.out.items[0].id === "s4b-card-1", () => `read {kind: card} ${brief(page.out)}`);
  const c = await kread(ownerKey, { project: P, ref: "card/note/s4b-card-1" });
  expect(c.out.item && c.out.item.body === "# S4b loop card\nFiled, then found." && c.out.item.name === "S4b loop card", () => brief(c.out));
  const f = await mcp(ownerKey, "search", { project: P, q: "loop card" });
  const g = await http("GET", `/search?project=${P}&q=${encodeURIComponent("loop card")}`, { key: ownerKey });
  const hits = (o) => ((o && o.groups) || []).flatMap((x) => x.hits || []).map((x) => x.ref);
  expect(hits(f.out).includes("card/note/s4b-card-1") && JSON.stringify(hits(g.json)) === JSON.stringify(hits(f.out)), () => `search ${brief(f.out)} · GET ${brief(g.json)}`);
  const qf = await mcp(ownerKey, "search", { project: P, q: "loop one close" });
  const qr = await kread(ownerKey, { project: P, ref: "q/Q-s4b-1" });
  expect(hits(qf.out).includes("q/Q-s4b-1") && /Where does loop one close\?/.test((qr.out.item || {}).question || "") && (qr.out.item || {}).label === "on the next read", () => `question: ${brief(qf.out)} · ${brief(qr.out)}`);
  const cp = await html(`/read?ref=card/note/s4b-card-1&project=${P}`);   // sprint 3 D2: the card's page, the new path
  expect(cp.status === 200 && /S4b loop card/.test(cp.text) && !/pack null|Pack card/.test(cp.text), () => `card page ${cp.status}`);
  return "read lists the note kind's card and reads its body; search finds it (tool == GET) and the ruled question; the card page draws it";
});

smoke("updates, GET /updates and Home answer from D1, with no R2 state file", async () => {
  // D5: the project's picture is part of updates; GET /updates reaches the tool's own door
  const st = await mcp(ownerKey, "updates", { project: P });
  const rest = await http("GET", `/updates?project=${P}`, { key: ownerKey });
  expect(!st.isError && st.out.project.key === P && st.out.aim === "Close loop one on glass, with no publish step" && /^\d{4}-\d\d-\d\dT/.test(st.out.asOf || "") && st.out.ageDays === 0
    && !("brainVersion" in st.out) && !("rightNow" in st.out) && !("knowledgeAt" in st.out) && rest.status === 200 && rest.json.aim === st.out.aim && rest.json.asOf === st.out.asOf
    && JSON.stringify(rest.json.project) === JSON.stringify(st.out.project), () => `updates ${brief(st.out)} · GET ${rest.status} ${brief(rest.json)}`);
  const home = await http("GET", `/home/summary?project=${P}`, { key: ownerKey });
  expect(home.json.asOf && home.json.asOf.knowledge === st.out.asOf && home.json.metrics.shipped && home.json.metrics.shipped.days === 7 && Number.isInteger(home.json.metrics.shipped.landed), () => `home ${brief(home.json.asOf)} ${brief(home.json.metrics)}`);
  const pub = await fetch(`${process.env.SMOKE_URL.replace(/\/+$/, "")}/missing`, { headers: { accept: "text/html" } });
  const pubText = await pub.text();
  // sprint 3 (B3): every call line reads as it is filed, a knowledge write as its preview
  // sprint 3 L3: the standard is each item's "A good fill"; the call rides its Copy button (the hidden code it copies)
  expect(pub.status === 200 && /A good fill/.test(pubText) && !/ data-next/.test(pubText) && /<code hidden>preview \{/.test(pubText), () => `public /missing ${pub.status}`);
  const gone = await http("GET", `/state?project=${P}`, { key: ownerKey });
  expect(gone.status === 404, `the old address GET /state answers ${gone.status}`);
  return `updates asOf ${st.out.asOf} (the newest knowledge write) == GET /updates == Home asOf; public /missing is the shape only; GET /state is gone (404)`;
});
