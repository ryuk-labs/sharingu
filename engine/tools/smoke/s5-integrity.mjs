// tools/smoke/s5-integrity.mjs — the sprint-end review's integrity and free-tier fixes, through the real door on a fresh
// project s5i (added here; the member from s0 is seated on it). F3: a restore keeps what was filed since the newest version
// as a version first, and the current version with nothing since is refused. F7: an approved answer whose ruling did not
// apply keeps its open question owed on every face. F9: a list page leaves bodies out and says their size. F16: changes
// answers from D1, since the head version. F8: `holes` costs the same rows read whether the checks are graded or not.
import { smoke, expect, brief, s, G, http, html, mcp, control, ownerKey, BASE, kwrite, kread, contribute } from "./lib.mjs";

const P = "s5i";
const Q = (qid, question, options, extra = {}) => ({ kind: "question", op: "upsert", data: { qid, question, options: options.map((what) => ({ what })), whoOwes: "code", ...extra } });
const goals = async () => ((await kread(ownerKey, { project: P, kind: "goal" })).out.items || []).map((g) => g.id).sort().join(",");
const qrow = async (qid, key = ownerKey) => {
  const r = await http("GET", `/decisions?project=${P}`, { key });
  return { row: (r.json.rows || []).find((x) => x.qid === qid) || null, counts: r.json.counts, whoOwes: r.json.whoOwes };
};
// rowsOf(path | tool) -> the D1 rows the worker counted for one call (its d1-rows Server-Timing entry; x-count-rows: 1)
const timing = (res) => { const m = /d1-rows;dur=0;desc="read=(\d+) written=(\d+)/.exec(res.headers.get("server-timing") || ""); return m ? { read: +m[1], written: +m[2] } : null; };
async function counted(name, args, key = ownerKey) {
  const r = await fetch(BASE + "/mcp", { method: "POST", headers: { authorization: "Bearer " + key, "x-count-rows": "1", "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json();
  let out = null; try { out = JSON.parse(j.result.content[0].text); } catch { out = null; }
  return { out, rows: timing(r), isError: !!(j.result && j.result.isError) };
}

smoke("F3 · restore_version keeps what was filed since the newest version as a version first; restoring it brings it back", async () => {
  await control({ action: "add-project", key: P, name: "S5 integrity" });
  await control({ action: "grant-seat", personId: s.member.id, projectKey: P });
  const w = await kwrite(ownerKey, { project: P, ops: [G("s5-root", null), G("s5-kept", "s5-root")] });
  expect(!w.isError && w.out.written === 2, () => brief(w.out));
  const p1 = await mcp(ownerKey, "publish_version", { project: P, title: "The first cut" });
  expect(!p1.isError && p1.out.version.n === 1, () => brief(p1.out));
  // a week's work after v1: the member files a goal and a question, the owner rules it
  const m = await kwrite(s.member.key, { project: P, ops: [G("s5-member-goal", "s5-root"), Q("Q-s5-since", "Filed after v1?", ["yes", "no"])] });
  const ru = await mcp(ownerKey, "rule_question", { project: P, qid: "Q-s5-since", choice: 0, rationale: "it was" });
  expect(!m.isError && !ru.isError, () => `${brief(m.out)} / ${brief(ru.out)}`);
  const r = await counted("restore_version", { project: P, v: "1" });
  expect(!r.isError && r.out.restored === 1 && r.out.kept === 2 && r.out.version.n === 3 && /kept as v2/.test(r.out.note) && (await goals()) === "s5-kept,s5-root",
    () => `restore v1: ${brief(r.out)}; goals ${goals()}`);
  const list = await http("GET", `/versions?project=${P}`, { key: ownerKey });
  const v2 = (list.json.versions || []).find((v) => v.n === 2) || {};
  expect(v2.title === "Before restoring v1" && v2.cause.kind === "published" && v2.changes.byKind.goal.added === 1 && v2.changes.byKind.question.added === 1, () => `v2: ${brief(v2)}`);
  const back = await mcp(ownerKey, "restore_version", { project: P, v: "2" });
  const q = await qrow("Q-s5-since");
  expect(!back.isError && back.out.version.n === 4 && back.out.kept === null && (await goals()) === "s5-kept,s5-member-goal,s5-root" && q.row && q.row.status === "decided" && q.row.choice === 0,
    () => `restore v2: ${brief(back.out)}; question ${brief(q.row)}`);
  const cur = await http("POST", "/versions/restore", { key: ownerKey, body: { project: P, v: "4" } });
  const again = await http("GET", `/versions?project=${P}`, { key: ownerKey });
  expect(cur.status === 409 && cur.json.error === "already_current" && again.json.counts.all === 4, () => `restore the current: ${cur.status} ${brief(cur.json)}`);
  const page = await html(`/versions/1?project=${P}`);
  expect(/data-button="restore"[^>]*>Restore v1, keeping the current state<\/button>/.test(page.text) && /What the project holds now is kept as a version first/.test(page.text), "the page's Restore does not say it keeps the current state");
  s.s5Restore = r.rows;
  return `restore v1 kept the member's goal and the ruled question as v2 "${v2.title}" and restored as v3 (rows ${r.rows ? `read ${r.rows.read}, written ${r.rows.written}` : "?"}); restore v2 brought them back as v4; restoring v4 again: 409 already_current; the page's button says it keeps the current state`;
});

smoke("F7 · an approved answer whose ruling did not apply keeps its question owed: Decisions, the card, Home and holes", async () => {
  // (b) the member answers B, then edits option B's text before the owner approves: the approve stands, the ruling is refused
  const f = await kwrite(s.member.key, { project: P, ops: [Q("Q-s5-b", "Which door for the import?", ["preview then file", "a file drop"])] });
  const a = await mcp(s.member.key, "respond", { project: P, qid: "Q-s5-b", option: 1 });
  const tx = ((a.out.transmissions || [])[0] || {}).tx;
  const e = await kwrite(s.member.key, { project: P, ops: [Q("Q-s5-b", "Which door for the import?", ["preview then file", "a file drop, weekly"])] });
  const before = await qrow("Q-s5-b");
  expect(!f.isError && tx && !e.isError && before.row.status === "open", () => `setup: ${brief(a.out)} / ${brief(e.out)}`);
  const d = await mcp(ownerKey, "decide_contribution", { id: tx, verdict: "approve", note: "yes" });
  expect(!d.isError && d.out.decision === "approve" && !d.out.ruled && d.out.ruleError === "unknown_option", () => `decide: ${brief(d.out)}`);
  const after = await qrow("Q-s5-b");
  // the member's answer made it the owner's to rule (before); the approve that did not apply must not hide it (it used to: -1)
  expect(after.row.status === "open" && after.row.live.ruled && after.row.live.ruled.option === 1 && after.counts.yours === before.counts.yours && after.whoOwes.you === before.whoOwes.you && before.counts.yours >= 1,
    () => `Decisions: ${brief(after.row)} counts ${brief(after.counts)} (before ${brief(before.counts)})`);
  const dec = await html(`/decisions?project=${P}`);
  // sprint 3 L2: the row is the revision's <li>; its chip says it in a phrase, the whole sentence in its title
  const art = (dec.text.match(/<li\b[^>]*\sdata-qid="Q-s5-b"[\s\S]*?<\/li>/) || [""])[0];
  expect(/data-unapplied="B" title="approved B, not applied: rule it">Approved B, not applied</.test(art) && /data-button="choose-option"/.test(art), () => `Decisions row: ${art.slice(0, 500)}`);
  const card = await html(`/question/Q-s5-b?project=${P}`);
  expect(/You: an approved answer did not apply, rule it/.test(card.text) && /Approved B, not applied: rule it\./.test(card.text) && /data-button="record-ruling"/.test(card.text), "the QuestionCard does not show it owed with its ruling offered");
  const home = await http("GET", `/home/summary?project=${P}`, { key: ownerKey });
  const holes = await mcp(ownerKey, "missing", { project: P });
  const hq = (holes.out.items || []).find((h) => h.piece === "questions");
  expect(((home.json.needsYou || {}).rows || []).some((x) => x.qid === "Q-s5-b") && hq && JSON.stringify(hq).includes("Q-s5-b"), () => `Home ${brief(home.json.needsYou)} / holes ${brief(hq)}`);
  const member = await qrow("Q-s5-b", s.member.key);
  expect(member.row.status === "open" && member.whoOwes.elsewhere >= 1, () => `member: ${brief(member.whoOwes)}`);
  // ruling it drops it out everywhere
  const rq = await mcp(ownerKey, "rule_question", { project: P, qid: "Q-s5-b", choice: 1 });
  const done = await qrow("Q-s5-b");
  expect(!rq.isError && done.row.status === "decided" && done.counts.yours === before.counts.yours - 1, () => `ruled: ${brief(done.row)} ${brief(done.counts)}`);
  return `approve of ${tx} stood with ruleError unknown_option; the question stayed open and owed (Open: yours ${before.counts.yours} before the approve, ${after.counts.yours} after), "approved B, not applied: rule it" with the pick still offered, on the card, Home and holes; rule_question closed it (${done.counts.yours})`;
});

smoke("F7 · (a) a restore that brings back a question from before its ruling leaves it owed, not hidden", async () => {
  const f = await kwrite(ownerKey, { project: P, ops: [Q("Q-s5-a", "Restore me?", ["yes", "no"])] });
  const p = await mcp(ownerKey, "publish_version", { project: P, title: "Before the ruling" });
  const a = await mcp(s.member.key, "respond", { project: P, qid: "Q-s5-a", option: 0 });
  const d = await mcp(ownerKey, "decide_contribution", { id: ((a.out.transmissions || [])[0] || {}).tx, verdict: "approve" });
  expect(!f.isError && !p.isError && !d.isError && d.out.ruled, () => `${brief(d.out)}`);
  const r = await mcp(ownerKey, "restore_version", { project: P, v: String(p.out.version.n) });
  const q = await qrow("Q-s5-a");
  const owed = await mcp(ownerKey, "updates", { project: P });
  expect(!r.isError && r.out.kept && q.row.status === "open" && q.row.live.ruled && (owed.out.blockers || []).some((b) => b.id === "Q-s5-a"), () => `restore: ${brief(r.out)}; row ${brief(q.row)}; blockers ${brief(owed.out.blockers)}`);
  return `after restoring v${p.out.version.n} (the ruling kept as v${r.out.kept}), Q-s5-a reads open with its approved answer and is in the owner's blockers`;
});

smoke("F9 · read's list pages leave bodies out and say their size; one item by its ref has it whole", async () => {
  const body = "# A long doc\n\n" + "a line of the doc, long enough to matter.\n".repeat(2400);
  const w = await kwrite(ownerKey, { project: P, ops: [1, 2, 3, 4, 5].map((i) => ({ kind: "doc", op: "upsert", data: { path: `big/${i}.md`, title: `Big ${i}`, body } })) });
  expect(!w.isError && w.out.written === 5, () => brief(w.out));
  const r = await fetch(BASE + `/read?project=${P}&kind=doc&limit=100`, { headers: { authorization: "Bearer " + ownerKey, accept: "application/json" } });
  const text = await r.text(), j = JSON.parse(text);
  const bytes = Buffer.byteLength(body);
  expect(r.status === 200 && j.items.length === 5 && j.items.every((d) => !("body" in d) && d.bodyBytes === bytes) && text.length < 5000, () => `GET /read?kind=doc: ${r.status} ${text.length} bytes ${brief(j.items[0])}`);
  const t = await kread(ownerKey, { project: P, kind: "doc", limit: 100 });
  const one = await kread(ownerKey, { project: P, kind: "doc", id: "big/3.md" });
  expect(!t.isError && t.out.items.every((d) => d.bodyBytes === bytes && d.body === undefined) && one.out.item.body === body, () => `tool: ${brief(t.out.items[0])} / by id ${brief(one.out.item && one.out.item.title)}`);
  const cards = await kwrite(ownerKey, { project: P, ops: [{ kind: "card", op: "upsert", data: { kind: "note", id: "n-1", name: "A note", body } }] });
  const cl = await kread(ownerKey, { project: P, kind: "card" });
  expect(!cards.isError && cl.out.items[0].bodyBytes === bytes && cl.out.items[0].body === undefined, () => brief(cl.out.items[0]));
  return `5 docs of ${bytes} bytes: the list page is ${text.length} bytes (each item says bodyBytes ${bytes}); by id, the body whole; a card list the same`;
});

smoke("F16 · changes answers from D1: what changed since the project's current version, each with the refs it touches", async () => {
  // D5: `changes` (default: since the current version) and GET /changes
  const pub = await mcp(ownerKey, "publish_version", { project: P, title: "changes' start" });
  const w = await kwrite(ownerKey, { project: P, ops: [G("s5-live", "s5-root"), { kind: "node", op: "upsert", data: { id: "screen:home", type: "screen", name: "S5 Home", status: "planned" } }] });
  // (D5: an incomplete contribution is never filed, it is fixed in its preview: a leader's note naming a screen of the Map files at once)
  const g = await contribute(ownerKey, { project: P, lane: "leader", kind: "note", what: "s5 touches the home screen", why: "smoke", touches: ["screen:home"] });
  const t = await mcp(ownerKey, "changes", { project: P, eval: true, limit: 100 });
  const rows = (t.out && t.out.changes) || [];
  const ids = new Set(rows.map((c) => c.id));
  const rest = await http("GET", `/changes?project=${P}&eval=1&limit=100`, { key: ownerKey });
  const touchesHome = (c) => JSON.stringify(c).includes("screen:home");
  expect(!pub.isError && !w.isError && !t.isError && ids.has(w.out.ledger) && g.out && ids.has(g.out.id) && rows.some((c) => c.id === g.out.id && touchesHome(c)) && !ids.has(pub.out.ledger)
    && rest.status === 200 && JSON.stringify((rest.json.changes || []).map((c) => c.id)) === JSON.stringify(rows.map((c) => c.id)),
    () => `changes: ${brief(t.out)} / GET ${rest.status} (filed ${g.out && g.out.id})`);
  const fresh = await mcp(ownerKey, "changes", { project: "smoke-none-such" });
  return `since v${pub.out.version.n} (${t.out.since}): the goal write and the code filing naming screen:home, never the publish's own filing; GET /changes the same (a project nobody may read: ${fresh.out && fresh.out.error})`;
});

smoke("F8 · missing costs the same D1 rows whether the checks are graded or not", async () => {
  const ids = Array.from({ length: 60 }, (_, i) => `AC.s5.${String(i).padStart(2, "0")}`);
  const w = await kwrite(ownerKey, { project: P, ops: ids.map((id) => ({ kind: "check", op: "upsert", data: { id, title: `check ${id}`, refs: ["s5-root"] } })) });
  expect(!w.isError && w.out.written === 60, () => brief(w.out));
  const h0 = await counted("missing", { project: P });
  const g0 = (h0.out.items || []).find((h) => h.piece === "grades") || {};
  for (const id of ids.slice(0, 57)) {
    const g = await mcp(ownerKey, "submit_grade", { project: P, checkId: id, verdict: "proven", proof: "smoke s5: exit 0" });
    if (g.isError || !g.out.counted) throw new Error(`grade ${id}: ${brief(g.out)}`);
  }
  const h1 = await counted("missing", { project: P });
  const g1 = (h1.out.items || []).find((h) => h.piece === "grades") || {};
  expect(g0.countText === "50+" && g1.count === 3 && g1.fillPath.args.items[0].grade.checkId === "AC.s5.57" && h0.rows && h1.rows && h1.rows.read <= h0.rows.read,
    () => `holes: before ${brief(g0)} rows ${brief(h0.rows)}; after ${brief(g1)} rows ${brief(h1.rows)}`);
  return `60 checks: holes read ${h0.rows.read} rows with none graded (grades ${g0.countText}) and ${h1.rows.read} with 57 graded (grades ${g1.count}, first ${g1.fillPath.args.items[0].grade.checkId})`;
});
