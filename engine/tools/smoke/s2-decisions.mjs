// tools/smoke/s2-decisions.mjs — slice 2: Decisions read D1 and a ruling is live. Builds on s0: project smoke with the open
// question Q-smoke-1 (three options), the member seated on smoke, the outsider seated nowhere.
import { smoke, expect, brief, s, http, html, mcp, control, ownerKey, BASE, kwrite, kread } from "./lib.mjs";

const Q = (qid, question, options, extra = {}) => ({ kind: "question", op: "upsert", data: { qid, question, options: options.map((what) => ({ what })), whoOwes: "owner", ...extra } });
const row = async (project, qid, key = ownerKey) => {
  const r = await http("GET", `/decisions?project=${project}`, { key });
  if (r.status !== 200) throw new Error(`GET /decisions?project=${project}: ${r.status} ${brief(r.json)}`);
  return (r.json.rows || []).find((x) => x.qid === qid) || null;
};
// the row Decisions draws for one question: the line carrying its data-qid (the semantic hook), whatever its classes (sprint 3
// L2: the revision's one-line <li>; before, an <article>)
const articleOf = (page, qid) => (page.match(new RegExp(`<li\\b[^>]*\\sdata-qid="${qid}"[\\s\\S]*?</li>`)) || [""])[0];

smoke("a question filed through preview then file shows open on Decisions, its page and the decisions tool", async () => {
  // the same qid in ANOTHER project, filed first: the ruling below must never touch it, and its overlay must not leak
  const other = await kwrite(ownerKey, { project: "local", ops: [Q("Q-smoke-1", "The same qid, another project: which door?", ["this one", "that one"])] });
  expect(!other.isError && other.out.written === 1, () => `local: ${brief(other.out)}`);
  const j = await row("smoke", "Q-smoke-1");
  expect(j && j.status === "open" && j.options.length === 3 && j.options[0].what === "preview then file" && j.choice == null, () => `JSON row: ${brief(j)}`);
  const page = await html("/decisions?project=smoke");
  const art = articleOf(page.text, "Q-smoke-1");
  expect(page.status === 200 && /data-status="open"/.test(art) && /Which door files knowledge\?/.test(art) && /data-button="choose-option"/.test(art), () => `HTML ${page.status}: ${art.slice(0, 300)}`);
  const card = await http("GET", "/question/Q-smoke-1?project=smoke", { key: ownerKey });
  const cardHtml = await html("/question/Q-smoke-1?project=smoke");
  expect(card.status === 200 && card.json.decision.status === "open" && card.json.project === "smoke" && cardHtml.status === 200 && /data-button="record-ruling"/.test(cardHtml.text),
    () => `question ${card.status} ${brief(card.json)} / HTML ${cardHtml.status}`);
  const tool = await mcp(s.member.key, "decisions", { project: "smoke" });
  const t = (tool.out.rows || []).find((x) => x.qid === "Q-smoke-1");
  expect(!tool.isError && t && t.status === "open" && tool.out.project === "smoke", () => `decisions tool: ${brief(tool.out)}`);
  return "open with 3 options on GET /decisions (JSON and HTML), /question/Q-smoke-1 and the member's decisions tool";
});

smoke("a member's respond leaves it open, answered and with the owner", async () => {
  const r = await mcp(s.member.key, "respond", { qid: "Q-smoke-1", option: 1 });
  const t = (r.out.transmissions || [])[0] || {};
  expect(!r.isError && /^T-\d{8}-\d{3}$/.test(t.tx || "") && !t.ruled, () => `respond: ${brief(r.out)}`);
  s.memberAnswer = t.tx;
  const j = await row("smoke", "Q-smoke-1");
  expect(j.status === "open" && j.live.answers.length === 1 && j.live.answers[0].option === 1 && !j.live.ruled, () => `row: ${brief(j)}`);
  const own = await http("GET", "/decisions?project=smoke", { key: ownerKey });
  expect(own.json.whoOwes.you >= 1 && own.json.counts.yours >= 1, () => `the owner owes nothing: ${brief(own.json.counts)}`);
  const page = await html("/decisions?project=smoke");
  expect(/data-answered="B"[^>]*>Answered B</.test(articleOf(page.text, "Q-smoke-1")), "Decisions does not say answered B, with the owner");
  const card = await html("/question/Q-smoke-1?project=smoke", s.member.key);
  expect(/Answered B, with the owner: Smoke Member chose it/.test(card.text) && /The owner: an answer is filed/.test(card.text), "the question page does not show the member's answer with the owner");
  return `filed ${t.tx}, not ruled; open, answered B, owed by the owner (Open: yours ${own.json.counts.yours})`;
});

smoke("the owner's respond rules it: decided with the chosen option on the very next read", async () => {
  const r = await mcp(ownerKey, "respond", { project: "smoke", qid: "Q-smoke-1", option: 0 });
  const t = (r.out.transmissions || [])[0] || {};
  expect(!r.isError && t.ruled === true && /Ruled: Q-smoke-1/.test(r.out.note || ""), () => `respond: ${brief(r.out)}`);
  const j = await row("smoke", "Q-smoke-1");
  expect(j.status === "decided" && j.choice === 0 && j.label === "preview then file", () => `JSON row: ${brief(j)}`);
  const page = await html("/decisions?project=smoke");
  const art = articleOf(page.text, "Q-smoke-1");
  expect(/data-status="decided"/.test(art) && /data-ruled="A"/.test(art) && !/choose-option/.test(art), () => `HTML: ${art.slice(0, 400)}`);
  const card = await html("/question/Q-smoke-1?project=smoke");
  expect(/data-option="A" data-chosen>/.test(card.text) && /Ruled A/.test(card.text) && !/data-button="record-ruling"/.test(card.text), "the question page does not show A chosen and ruled");
  const tool = await mcp(ownerKey, "decisions", { project: "smoke", qid: "Q-smoke-1" });
  const d = tool.out.decision || {};
  expect(!tool.isError && d.status === "decided" && d.choice === 0 && d.label === "preview then file" && d.decidedAt, () => `decisions tool: ${brief(tool.out)}`);
  const dq = (h) => h.slice(h.indexOf('<section class="dq"'), h.lastIndexOf("</section>"));
  const faces = [dq(page.text), dq(card.text), JSON.stringify(tool.out), JSON.stringify(r.out)].join(" ");
  expect(!/catches up|publish/i.test(faces), () => `a face still speaks of a publish: ${(faces.match(/.{60}(catches up|publish).{60}/i) || [""])[0]}`);
  return "decided, choice 0 (A), label preview then file: on /decisions (JSON, HTML), the question page and the decisions tool";
});

smoke("a decided question answers not_open, on every door", async () => {
  const owner = await mcp(ownerKey, "respond", { project: "smoke", qid: "Q-smoke-1", option: 1 });
  const member = await mcp(s.member.key, "respond", { qid: "Q-smoke-1", option: 2 });
  expect(owner.isError && owner.out.error === "not_open" && member.isError && member.out.error === "not_open", () => `owner ${brief(owner.out)} member ${brief(member.out)}`);
  const form = await fetch(BASE + "/respond", { method: "POST", redirect: "manual", body: new URLSearchParams({ qid: "Q-smoke-1", option: "2", next: "/question/Q-smoke-1" }),
    headers: { authorization: "Bearer " + s.member.key, "content-type": "application/x-www-form-urlencoded" } });
  expect(form.status === 302 && /refused=not_open/.test(form.headers.get("location") || ""), `form: ${form.status} ${form.headers.get("location")}`);
  const rest = await http("POST", "/respond", { key: ownerKey, body: { project: "smoke", qid: "Q-smoke-1", option: 1 } });
  expect(rest.status === 409 && rest.json.error === "not_open", () => `POST /respond: ${rest.status} ${brief(rest.json)}`);
  const j = await row("smoke", "Q-smoke-1");
  expect(j.status === "decided" && j.choice === 0 && j.live.answers.length === 1, () => `row changed: ${brief(j)}`);
  return "respond (owner and member, MCP), POST /respond (JSON 409, the form's 302 refused=not_open) refuse; nothing filed, still A";
});

smoke("rule_question rules a question; a member, an unknown qid and an unknown option are refused", async () => {
  // a member files the question (an agent asks the owner a real, optioned question)
  const f = await kwrite(s.member.key, { project: "smoke", ops: [Q("Q-smoke-3", "Where do rulings live?", ["in D1", "in a git repo"])] });
  expect(!f.isError && f.out.written === 1, () => `file: ${brief(f.out)}`);
  const m1 = await mcp(s.member.key, "rule_question", { project: "smoke", qid: "Q-smoke-3", choice: 0 });
  const m2 = await http("POST", "/questions/Q-smoke-3/rule", { key: s.member.key, body: { project: "smoke", choice: 0 } });
  expect(m1.isError && m1.out.error === "owner_only" && m2.status === 403 && m2.json.error === "owner_only", () => `member: ${brief(m1.out)} / ${m2.status} ${brief(m2.json)}`);
  const u1 = await mcp(ownerKey, "rule_question", { project: "smoke", qid: "Q-smoke-nope", choice: 0 });
  const u2 = await http("POST", "/questions/Q-smoke-nope/rule", { key: ownerKey, body: { project: "smoke", choice: 0 } });
  expect(u1.isError && u1.out.error === "unknown_qid" && u2.status === 404 && u2.json.error === "unknown_qid", () => `unknown qid: ${brief(u1.out)} / ${u2.status}`);
  const o1 = await mcp(ownerKey, "rule_question", { project: "smoke", qid: "Q-smoke-3", choice: 5 });
  const o2 = await http("POST", "/questions/Q-smoke-3/rule", { key: ownerKey, body: { project: "smoke", choice: 2 } });
  expect(o1.isError && o1.out.error === "unknown_option" && o2.status === 422 && o2.json.error === "unknown_option", () => `unknown option: ${brief(o1.out)} / ${o2.status}`);
  expect((await row("smoke", "Q-smoke-3")).status === "open", "a refusal ruled it");
  const r = await mcp(ownerKey, "rule_question", { project: "smoke", qid: "Q-smoke-3", choice: 0, rationale: "Live, no publish step." });
  expect(!r.isError && r.out.status === "decided" && r.out.letter === "A" && r.out.label === "in D1" && /^T-\d{8}-\d{3}$/.test(r.out.ledger || ""), () => `rule_question: ${brief(r.out)}`);
  s.ruleLedger = r.out.ledger;
  const again = await http("POST", "/questions/Q-smoke-3/rule", { key: ownerKey, body: { project: "smoke", choice: 1 } });
  expect(again.status === 409 && again.json.error === "not_open", () => `again: ${again.status} ${brief(again.json)}`);
  const card = await http("GET", "/question/Q-smoke-3?project=smoke", { key: s.member.key });
  expect(card.json.decision.status === "decided" && card.json.decision.choice === 0 && card.json.decision.rationale === "Live, no publish step.", () => brief(card.json));
  return `member owner_only (MCP, REST 403); unknown qid 404; unknown option 422; ruled A with its rationale (${r.out.ledger}); again 409 not_open`;
});

smoke("decide_contribution approve on a member's answer rules its question", async () => {
  const f = await kwrite(ownerKey, { project: "smoke", ops: [Q("Q-smoke-4", "Who rules a member's answer?", ["the owner, by approving it", "nobody"])] });
  expect(!f.isError, () => brief(f.out));
  const a = await mcp(s.member.key, "respond", { qid: "Q-smoke-4", option: 0 });
  const tx = ((a.out.transmissions || [])[0] || {}).tx;
  expect(tx && (await row("smoke", "Q-smoke-4")).status === "open", () => `answer: ${brief(a.out)}`);
  const d = await mcp(ownerKey, "decide_contribution", { id: tx, verdict: "approve", note: "yes" });
  expect(!d.isError && d.out.decision === "approve" && d.out.ruled && d.out.ruled.qid === "Q-smoke-4" && d.out.ruled.letter === "A", () => `decide: ${brief(d.out)}`);
  const j = await row("smoke", "Q-smoke-4");
  expect(j.status === "decided" && j.choice === 0, () => `row: ${brief(j)}`);
  return `approving ${tx} ruled Q-smoke-4 A`;
});

smoke("a ruling's ledger row names the question and the option", async () => {
  const t = (await kread(ownerKey, { project: "smoke", ref: s.ruleLedger })).out.item || {};
  expect(t.kind === "knowledge" && t.project === "smoke" && t.what === "Q-smoke-3 ruled A: in D1", () => brief(t));
  const b = await mcp(ownerKey, "build", { project: "smoke", kind: "knowledge" });
  const whats = (b.out.rows || []).map((r) => r.title);
  expect(whats.includes("Q-smoke-1 ruled A: preview then file") && whats.includes("Q-smoke-4 ruled A: the owner, by approving it"), () => `Build: ${brief(whats)}`);
  return 'the rows read "Q-smoke-3 ruled A: in D1", "Q-smoke-1 ruled A: preview then file" and Q-smoke-4\'s, on Build';
});

smoke("the same qid in another project is untouched, and the overlay does not leak", async () => {
  const j = await row("local", "Q-smoke-1");
  expect(j && j.status === "open" && j.choice == null && j.options.length === 2 && j.live.answers.length === 0 && !j.live.ruled, () => `local row: ${brief(j)}`);
  const card = await http("GET", "/question/Q-smoke-1?project=local", { key: ownerKey });
  expect(card.status === 200 && card.json.decision.status === "open" && card.json.live.answers.length === 0 && !card.json.live.ruled, () => `local card: ${brief(card.json)}`);
  const page = await html("/decisions?project=local");
  expect(!/answered B/.test(articleOf(page.text, "Q-smoke-1")), "smoke's answer leaked onto local's Decisions");
  return "local's Q-smoke-1 still open, no answers, no ruling, on Decisions and its page";
});

smoke("a project with no question shows the empty sentence naming preview then save_knowledge", async () => {
  await control({ action: "add-project", key: "quiet", name: "Quiet" });
  const j = await http("GET", "/decisions?project=quiet", { key: ownerKey });
  expect(j.status === 200 && j.json.empty === "no_questions" && /preview then save_knowledge/.test(j.json.note || "") && j.json.rows.length === 0, () => `${j.status} ${brief(j.json)}`);
  const page = await html("/decisions?project=quiet");
  // sprint 3 L2 (pristine copy): the page says a phrase and offers What is missing; the call is the JSON's and the tool's
  expect(page.status === 200 && /data-state="empty"/.test(page.text) && /No questions yet/.test(page.text) && !/preview then (file|save_knowledge)/.test(page.text) && /href="\/missing"/.test(page.text) && !/data-state="error"/.test(page.text), () => `HTML ${page.status}`);
  const p = await mcp(ownerKey, "decisions", { project: "quiet" });
  expect(!p.isError && p.out.empty === "no_questions" && (p.out.rows || []).length === 0 && /preview then save_knowledge/.test(p.out.note || ""), () => `decisions: ${brief(p.out)}`);
  return "empty no_questions, its note names preview then save_knowledge (D1b item 11), the page's EMPTY a phrase with What is missing; the decisions tool says the same";
});

smoke("a long Decisions page leads with what needs an answer and pages the settled ones, 50 newest first", async () => {
  await control({ action: "add-project", key: "paged", name: "Paged" });
  const day = (i) => `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z`;
  const ops = [];
  for (let i = 0; i < 60; i++) ops.push(Q(`Q-paged-d${String(i).padStart(2, "0")}`, `Settled question ${i}?`, ["yes", "no"], { status: "decided", choice: 0, label: "yes", decidedAt: day(i) }));
  ops.push(Q("Q-paged-open", "Still open?", ["yes", "no"]), Q("Q-paged-prov", "Provisional?", ["yes", "no"], { status: "provisional", choice: 1, label: "no", decidedAt: day(0) }));
  const w = await kwrite(ownerKey, { project: "paged", ops });
  expect(!w.isError && w.out.written === 62, () => `file: ${brief(w.out)}`);
  // the JSON and the tool keep their contract: every row, the counts whole
  const j = await http("GET", "/decisions?project=paged", { key: ownerKey });
  const t = await mcp(ownerKey, "decisions", { project: "paged" });
  expect(j.status === 200 && j.json.rows.length === 62 && j.json.counts.open === 1 && j.json.counts.inForce === 61 && !("page" in j.json) && (t.out.rows || []).length === 62,
    () => `JSON ${j.status} rows ${j.json && j.json.rows.length} counts ${brief(j.json && j.json.counts)} / tool ${(t.out.rows || []).length}`);
  const qids = (h) => [...h.matchAll(/<li\b[^>]*\sdata-qid="([^"]+)"/g)].map((m) => m[1]);
  const p1 = await html("/decisions?project=paged");
  const q1 = qids(p1.text);
  expect(p1.status === 200 && q1.length === 52 && q1[0] === "Q-paged-open" && q1[1] === "Q-paged-prov" && q1[2] === "Q-paged-d59" && q1[51] === "Q-paged-d10",
    () => `page 1 (${p1.status}): ${q1.length} rows ${q1.slice(0, 4).join(",")} … ${q1.slice(-1)}`);
  expect(/data-region="pager"[^>]*data-page="1" data-pages="2"/.test(p1.text) && /href="\/decisions\?project=paged&amp;page=2" rel="next"/.test(p1.text) && /rel="next"/.test(p1.text) && !/rel="prev"/.test(p1.text)
    && /data-metric="total" data-value="62"/.test(p1.text), () => `page 1 pager: ${(p1.text.match(/<nav class="p-pager"[\s\S]*?<\/nav>/) || ["none"])[0].slice(0, 500)}`);
  const next = (p1.text.match(/<a [^>]*href="([^"]+)" rel="next"/) || [])[1];
  const p2 = await html(next ? next.replace(/&amp;/g, "&") : "/decisions?project=paged&page=2");
  const q2 = qids(p2.text);
  expect(p2.status === 200 && q2.length === 10 && q2[0] === "Q-paged-d09" && q2[9] === "Q-paged-d00" && !q2.includes("Q-paged-open") && /rel="prev"/.test(p2.text) && !/rel="next"/.test(p2.text)
    && /data-metric="total" data-value="62"/.test(p2.text), () => `page 2 via ${next}: ${q2.length} rows ${q2.join(",")}`);
  const far = await html("/decisions?project=paged&page=99");
  expect(far.status === 200 && qids(far.text).length === 10, "a page past the end draws the last page");
  return `JSON and the tool: 62 rows; page 1: the 2 that need an answer + 50 settled, newest first (${p1.text.length.toLocaleString("en-US")} bytes); page 2 (by its own link): the last 10`;
});

smoke("the latest ruling: decisions sort decided, limit 1 answers the later of two rulings, with who ruled it and when", async () => {
  // a project of its own, so the cases after this one count what they counted before
  await control({ action: "add-project", key: "ruled", name: "Ruled" });
  const f = await kwrite(ownerKey, { project: "ruled", ops: [Q("Q-ruled-1", "Which ruled first?", ["this one", "not this"]), Q("Q-ruled-2", "Which ruled last?", ["this one", "not this"]), Q("Q-ruled-3", "Still open?", ["yes", "no"])] });
  expect(!f.isError && f.out.written === 3, () => brief(f.out));
  const r1 = await mcp(ownerKey, "rule_question", { project: "ruled", qid: "Q-ruled-1", choice: 0 });
  await new Promise((r) => setTimeout(r, 5));
  const r2 = await mcp(ownerKey, "rule_question", { project: "ruled", qid: "Q-ruled-2", choice: 0, rationale: "The later one." });
  expect(!r1.isError && !r2.isError, () => `${brief(r1.out)} / ${brief(r2.out)}`);
  const t = (await mcp(ownerKey, "decisions", { project: "ruled", sort: "decided", limit: 1 })).out;
  const top = (t.rows || [])[0] || {};
  expect(t.rows.length === 1 && top.qid === "Q-ruled-2" && top.decidedBy === r2.out.decidedBy && top.decidedAt === r2.out.decidedAt && t.more === true && t.counts.inForce === 2 && t.counts.open === 1,
    () => brief(t));
  const all = (await mcp(ownerKey, "decisions", { project: "ruled", sort: "decided" })).out;
  expect(all.rows.map((x) => x.qid).join() === "Q-ruled-2,Q-ruled-1,Q-ruled-3" && all.rows[2].decidedBy === null && !("more" in all), () => brief(all.rows.map((x) => [x.qid, x.decidedAt])));
  const rest = await http("GET", "/decisions?project=ruled&sort=decided&limit=1", { key: ownerKey });
  expect(rest.status === 200 && JSON.stringify(rest.json) === JSON.stringify(t), () => `GET /decisions ${rest.status} ${brief(rest.json)}`);
  return `Q-ruled-2 first, ruled by ${top.decidedBy} at ${top.decidedAt}; then Q-ruled-1, then the open one; GET /decisions the same`;
});
