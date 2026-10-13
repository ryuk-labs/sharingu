// tools/smoke/s20-look.mjs — sprint 3, L2 · the look revision on the five tabs (docs/plan/LOOK.md "The revision"): Home, Goals,
// Decisions, Build and GTM on the shared parts. Self-contained: its own project (s20) filled through the door by two people
// (the owner and a member seated on it), and its own empty one (s20e). For each tab, against its own JSON twin (the same read):
//   L1 · the glance: every tile's number is the JSON's (one definition each: contributions, in motion, landed; goals done, in
//        progress, not started; open and in force)
//   L2 · the filter row: a chip's count is the rows the page shows when it is followed (a kind, a person, a status, an area, a
//        lane), and the choice is kept in the address
//   L3 · the settled fold: a folded group is a <details> that opens in place (its rows are in the page, no script needed)
//   L4 · pristine copy: no raw call, no "your Claude", no sentence of the product's own over ~8 words in the page's content
//        (a title, a value or a person's own words may be long; the copy check's patterns, on the served page)
//   L5 · empty is quiet: the empty project's five tabs are phrases, never a wall of zeros
// sprint 3, L3 · the detail pages on the parts (a goal, a question, a contribution and its Impact, What is missing, a card, a
// doc, a preview, the Library, search, What changed, Versions, Activity, Profile, Projects, Control, Broadcast, sign-in, the
// Map's views):
//   L6 · every detail page loads for the signed-in owner and for the seated member (sign-in for nobody)
//   L7 · the header facts are the JSON twin's (a goal's done %, status and counters; a question's status and options; a
//        contribution's filed time, author and kind; What is missing's meter)
//   L8 · pristine copy on every detail page (the L4 rule)
//   L9 · the decide presses: present for the owner on a contribution that waits on them, absent for anyone else, absent on
//        one that landed on its own and once it is ruled (pressed through the page's own form)
//   L10 · Control's forms post and flash: the same fields, the page answers 200 with its flash and its regions
import { smoke, expect, brief, http, mcp, html, ownerKey, control, BASE, contribute, fileParts } from "./lib.mjs";
import { kindWord } from "../../src/parts.js";

const TAG = String(process.env.S20_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s20" + TAG, PE = "s20e" + TAG;
const q = {};
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return key;
};
const fileVia = async (key, items, project = P) => {
  const pv = await mcp(key, "preview", { project, items });
  expect(!pv.isError && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await fileParts((n, a) => mcp(key, n, a), pv.out, items, { only: "ready" });   // sprint 19: each part with its write tool
  expect(!f.isError, () => `file: ${brief(f.out)}`);
  return f.out;
};
const page = async (path, key = ownerKey) => { const r = await html(`${path}${path.includes("?") ? "&" : "?"}project=${P}`, key); expect(r.status === 200, () => `${path}: HTTP ${r.status}`); return r.text; };
const twin = async (path, key = ownerKey) => { const r = await http("GET", `${path}${path.includes("?") ? "&" : "?"}project=${P}`, { key }); expect(r.status === 200 && r.json, () => `${path} JSON: HTTP ${r.status}`); return r.json; };
const metricOf = (text, k) => (new RegExp(`data-metric="${k}" data-value="([^"]*)"`).exec(text) || [])[1];
const unesc = (x) => String(x || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
// a region's markup: from its data-region to the end of the element that carries it (balanced on its own tag name)
function region(text, r) {
  const i = text.indexOf(`data-region="${r}"`);
  if (i < 0) return "";
  const open = text.lastIndexOf("<", i), tag = (/^<([a-z0-9]+)/i.exec(text.slice(open)) || [])[1];
  if (!tag) return "";
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = open;
  let depth = 0, m;
  while ((m = re.exec(text))) { depth += m[1] ? -1 : 1; if (!depth) return text.slice(open, m.index + m[0].length); }
  return text.slice(open);
}
// the filter row's chips: [{ group, label, count, href, current }]
function chips(text) {
  const nav = (/<nav class="p-filter"[\s\S]*?<\/nav>/.exec(text) || [""])[0];
  const out = [];
  for (const g of nav.matchAll(/<div class="p-fgroup[^"]*" role="group"(?: aria-label="[^"]*")? data-filter="([a-z]+)">([\s\S]*?)<\/div>(?=<span class="p-fsep"|<details class="p-fmore"|<a class="p-fclear"|<\/nav>|<div class="p-fgroup)/g)) {
    for (const a of g[2].matchAll(/<a class="p-fchip" href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g)) {
      const label = unesc((/<span class="p-fchip-w">([^<]*)<\/span>/.exec(a[3]) || [])[1] || "");
      const count = (/<span class="p-count">([^<]*)<\/span>/.exec(a[3]) || [])[1];
      out.push({ group: g[1], label, count: count == null ? null : Number(String(count).replace(/,/g, "")), href: unesc(a[1]), current: /aria-current="true"/.test(a[2]) });
    }
  }
  return out;
}
// the card's own count (the p-count beside its label)
const cardCount = (regionHtml) => Number(((/<header class="p-card-head">[\s\S]*?<span class="p-count">([^<]*)<\/span>/.exec(regionHtml) || [])[1] || "NaN").replace(/,/g, ""));

// ---- pristine copy, on the served page ----
// the product's own words in the page's content: every text node of <main> that is not a person's own words (a line's title
// or secondary, a group's title, the aim, an open row's body or a fact's value, an option, a filter chip's word: data) nor
// inside a <style>, <script>, <template> or <svg>
const OWN_WORDS = /\b(p-line-title|p-line-sub|p-group-title|hm-aim|p-ld-body|p-opt-label|p-opt-detail|p-fchip-w|p-id|u-trunc|dq-panel)\b/;
// sprint 3 L3, the detail pages: a doc's or a card's own markdown and a contribution's why (p-md, pk-md, p-words) are the filer's
// words; a refusal a person must read beside a disabled press (ct-why, the copy check's error class) and screen-reader-only
// text (u-sr) are allowed; a row of the door's own registry (data-tool: the MCP view's tool and its description), a page's
// title (h1: the item's own name), a Map node's name (data-light, data-i), a flow (data-flow), a crossing rule (data-rule), a
// filed diagram's summary (ar-sum), a project's declared reason (mx-note) and a goal's name on the live feed (lv-lg) are data
const ALSO_OWN = /\b(p-md|pk-md|p-words|ct-why|ct-why-row|u-sr|ar-sum|mx-note|lv-lg)\b/;
const VOID = new Set(["input", "br", "img", "meta", "link", "hr", "source", "col", "area", "wbr"]);
function productText(full) {
  const main = (/<main\b[^>]*>([\s\S]*)<\/main>/.exec(full) || ["", ""])[1].replace(/<(style|script|template|svg)\b[\s\S]*?<\/\1>/gi, "");
  const stack = [], texts = [];
  const re = /<(\/?)([a-z0-9]+)\b([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(main))) {
    if (m[4] != null) { if (!stack.some((x) => x.own) && !stack.some((x) => x.tag === "dd")) { const t = unesc(m[4]).replace(/\s+/g, " ").trim(); if (/[A-Za-z]{2}/.test(t)) texts.push(t); } continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
    if (VOID.has(tag) || /\/\s*$/.test(m[3])) continue;
    const cls = (/class="([^"]*)"/.exec(m[3]) || [])[1] || "";
    stack.push({ tag, own: OWN_WORDS.test(cls) || ALSO_OWN.test(cls) || /\shidden(?=[\s>=]|$)/.test(m[3]) || /\sdata-(tool|light|flow|i|g)="|\sdata-rule(?=\s|$)/.test(m[3]) || tag === "h1" || tag === "title" });
  }
  return texts;
}
export function copyFails(full, label) {
  const f = [];
  const noHidden = full.replace(/<(template|script)\b[\s\S]*?<\/\1>/gi, "").replace(/<code hidden>[\s\S]*?<\/code>/g, "");   // a Copy button's clipboard text is never shown
  // a raw call in the product's own visible words (sprint 3 L3: the registry's own words, a starter item's purpose or a tool's
  // description, are data, and a Copy button's clipboard text is never shown)
  const own = productText(full).join("\n");
  if (/preview \{|then file|file \{|publish_version/.test(own)) f.push(`${label}: a raw call on the page`);
  if (/your (own )?(claude|ai|assistant)\b/i.test(unesc(noHidden.replace(/\s(title|aria-label|data-client)="[^"]*"/g, "")))) f.push(`${label}: "your Claude…" on the page`);
  for (const t of productText(full)) {
    const words = (t.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
    if (words > 8) f.push(`${label}: a sentence of the product's own (${words} words): "${t.slice(0, 90)}"`);
    else if (/[a-z]{2}\.\s*$/.test(t) && words > 3) f.push(`${label}: a phrase with a full stop: "${t}"`);
  }
  return f;
}
const TABS = ["/home", "/build", "/goals", "/decisions", "/gtm"];

smoke("look · the five tabs on the parts: a filled project (two people, goals, questions, GTM), and an empty one", async () => {
  await control({ action: "add-project", key: P, name: "S20" });
  await control({ action: "add-project", key: PE, name: "S20 Empty" });
  q.member = await invite("S20 Mia", `mia${TAG}@s20.local`, "member", [P]);
  await fileVia(ownerKey, [
    { kind: "aim", op: "upsert", data: { aim: "S20 every tab reads as designed", measure: { name: "tabs on the parts", value: 5, period: "this sprint", source: "the shots" } } },
    { kind: "goal", op: "upsert", data: { id: "s20-root", title: "S20 the revision", parent: null } },
    { kind: "goal", op: "upsert", data: { id: "s20-a", title: "S20 the tabs", parent: "s20-root", dimensions: ["code"], target: 3 } },
    { kind: "goal", op: "upsert", data: { id: "s20-a1", title: "S20 Home", parent: "s20-a", dimensions: ["code"] } },
    { kind: "goal", op: "upsert", data: { id: "s20-b", title: "S20 the parts", parent: "s20-root", dimensions: ["leader"], status: "done" } },
    { kind: "goal", op: "upsert", data: { id: "s20-b1", title: "S20 the gallery", parent: "s20-b", dimensions: ["leader"], status: "done" } },
    { kind: "goal", op: "upsert", data: { id: "s20-g", title: "S20 the video", parent: "s20-root", dimensions: ["gtm"], target: 2 } },
    { kind: "goal", op: "upsert", data: { id: "s20-z", title: "S20 later", parent: "s20-root", dimensions: ["design"] } },
    { kind: "question", op: "upsert", data: { qid: "Q-s20-open", question: "S20 which tab leads?", area: "the look", options: [{ what: "Home" }, { what: "Build" }] } },
    { kind: "question", op: "upsert", data: { qid: "Q-s20-ruled", question: "S20 one stylesheet?", area: "the parts", options: [{ what: "Yes" }, { what: "No" }] } },
    { kind: "question", op: "upsert", data: { qid: "Q-s20-ruled2", question: "S20 initials for faces?", area: "the look", options: [{ what: "Initials" }, { what: "Pictures" }] } },
  ]);
  for (const [qid, choice] of [["Q-s20-ruled", 0], ["Q-s20-ruled2", 0]]) { const r = await mcp(ownerKey, "rule_question", { project: P, qid, choice }); expect(!r.isError, () => `rule ${qid}: ${brief(r.out)}`); }
  const C = (o) => ({ contribution: { lane: "code", kind: "pr", why: "s20", touches: ["engine/s20.js"], proof: "smoke s20 -> 5/5 passing", ...o } });
  await fileVia(ownerKey, [C({ what: "S20 Home on the parts", goalRef: "s20-a1" }), C({ what: "S20 Build on the parts", goalRef: "s20-a" }),
    { contribution: { lane: "leader", kind: "note", what: "S20 the parts approved", why: "the gallery", goalRef: "s20-b" } },
    { contribution: { lane: "gtm", kind: "outreach", what: "S20 the video posted", why: "the launch", touches: ["campaign:s20"], proof: "https://example.com/s20/video", goalRef: "s20-g", expected: "40 views" } }]);
  await fileVia(q.member, [C({ what: "S20 Goals on the parts", goalRef: "s20-a" }), C({ what: "S20 Decisions on the parts", goalRef: "s20-a" }), C({ what: "S20 GTM on the parts", kind: "fix" })]);
  return `${P} filled (2 people), ${PE} empty`;
});

smoke("look · L1 the glance: every tile's number is its JSON twin's, one definition each", async () => {
  const f = [];
  const hp = await page("/home"), hj = await twin("/home/summary");
  const want = { "needs-you": hj.metrics.needsYou.total, "in-motion": hj.metrics.inMotion.total, shipped: hj.metrics.shipped.landed, "goals-moved": hj.goalsMoved.rows.length };
  for (const [k, v] of Object.entries(want)) if (metricOf(region(hp, "metrics"), k) !== String(v)) f.push(`home ${k}: tile ${metricOf(hp, k)}, JSON ${v}`);
  if (hj.week && hj.week.landed.reduce((a, n) => a + n, 0) !== hj.metrics.shipped.landed) f.push(`home: the week's bars add up to ${hj.week.landed.reduce((a, n) => a + n, 0)}, the Landed tile says ${hj.metrics.shipped.landed}`);
  const bp = await page("/build"), bj = await twin("/build");
  if (metricOf(bp, "contributions") !== String(bj.counts.contributions) || metricOf(bp, "in-motion") !== String(bj.counts.inMotion) || metricOf(bp, "on-canvas-week") !== String(bj.counts.onCanvasWeek)) f.push(`build counts: ${metricOf(bp, "contributions")}/${metricOf(bp, "in-motion")} vs ${brief(bj.counts)}`);
  if (metricOf(bp, "filed-week") !== String(bj.week.filed.reduce((a, n) => a + n, 0))) f.push(`build filed-week ${metricOf(bp, "filed-week")} vs the week ${bj.week.filed}`);
  if (bj.counts.contributions !== hj.metrics.contributions.total || bj.counts.inMotion !== hj.metrics.inMotion.total) f.push(`Home and Build disagree: ${bj.counts.contributions}/${bj.counts.inMotion} vs ${hj.metrics.contributions.total}/${hj.metrics.inMotion.total}`);
  const gp = await page("/goals"), gj = await twin("/goals");
  if (metricOf(gp, "goals") !== String(gj.nodes.length) || metricOf(gp, "feeding") !== String(gj.aligned) || metricOf(gp, "no-feed") !== String(gj.noFeed.length)) f.push(`goals: ${metricOf(gp, "goals")}/${metricOf(gp, "feeding")}/${metricOf(gp, "no-feed")} vs ${gj.nodes.length}/${gj.aligned}/${gj.noFeed.length}`);
  // the done goal's row says done; its cell never reads progress counted from anything but its status and its cells
  const done = (/<[a-z]+\b[^>]*data-id="s20-b"[^>]*data-state="([a-z]+)"/.exec(gp) || [])[1];
  if (done !== "done") f.push(`goals: the done goal s20-b reads ${done}`);
  if (!/data-id="s20-z"[^>]*data-state="todo"/.test(gp) || !/data-id="s20-z"[\s\S]{0,1500}?Not started/.test(gp)) f.push("goals: the unfed goal s20-z does not read Not started");
  const dp = await page("/decisions"), dj = await twin("/decisions");
  for (const [k, v] of Object.entries({ open: dj.counts.open, "in-force": dj.counts.inForce, superseded: dj.counts.superseded, total: dj.rows.length, yours: dj.counts.yours })) if (metricOf(dp, k) !== String(v)) f.push(`decisions ${k}: ${metricOf(dp, k)} vs ${v}`);
  const tp = await page("/gtm"), tj = await twin("/gtm");
  const c = tj.stamp.counts;
  if (metricOf(tp, "filings") !== String(c.filings) || metricOf(tp, "landed") !== String(c.landed) || metricOf(tp, "awaiting") !== String(c.awaiting)) f.push(`gtm: ${metricOf(tp, "filings")}/${metricOf(tp, "landed")}/${metricOf(tp, "awaiting")} vs ${brief(c)}`);
  if (metricOf(tp, "goals") !== String(tj.regions.metrics.filter((m) => m.pct >= 100).length)) f.push(`gtm goals realized ${metricOf(tp, "goals")} vs ${tj.regions.metrics.filter((m) => m.pct >= 100).length}`);
  expect(!f.length, () => f.join(" · "));
  return `home ${brief(want)} · build ${bj.counts.contributions}/${bj.counts.inMotion} · goals ${gj.nodes.length} · decisions ${dj.counts.open} open · gtm ${c.filings}`;
});

smoke("look · L2 the filter row: a chip's count is the rows the page shows when it is followed, the choice kept in the address", async () => {
  const f = [], seen = [];
  const follow = async (path, chip, rowsOf) => {
    const t = await html(chip.href + (chip.href.includes("?") ? "&" : "?") + `project=${P}`);
    const n = rowsOf(t.text);
    seen.push(`${path} ${chip.group}:${chip.label} ${chip.count}=${n}`);
    if (n !== chip.count) f.push(`${path} ${chip.group} "${chip.label}": the chip says ${chip.count}, following it shows ${n}`);
    if (!chips(t.text).some((x) => x.current && x.label === chip.label)) f.push(`${path} ${chip.group} "${chip.label}": not current once followed`);
  };
  const bp = await page("/build");
  const bc = chips(bp);
  const buildRows = (t) => (region(t, "filings").match(/<li class="p-li" data-id="/g) || []).length;
  for (const c of [bc.find((x) => x.group === "kind" && x.label === kindWord("pr")), bc.find((x) => x.group === "by"), bc.find((x) => x.group === "when" && x.label === "7 days")]) {
    if (!c) { f.push(`build: a chip is missing (${brief(bc.map((x) => `${x.group}:${x.label}`))})`); continue; }
    await follow("/build", c, buildRows);
  }
  if (!bc.some((x) => x.group === "by" && x.label === "S20")) f.push(`build: the member's chip is missing (${brief(bc.filter((x) => x.group === "by"))})`);
  const gp = await page("/goals");
  const gdone = chips(gp).find((x) => x.group === "status" && x.label === "Done");
  if (gdone) await follow("/goals", gdone, (t) => (region(t, "goal-tree").match(/data-id="[^"]+"[^>]*data-state="done"/g) || []).length); else f.push("goals: no Done chip");
  const dp = await page("/decisions");
  const darea = chips(dp).find((x) => x.group === "area" && x.label === "the look");
  if (darea) await follow("/decisions", darea, (t) => (region(t, "question-list").match(/<li class="p-li" data-qid="/g) || []).length); else f.push(`decisions: no area chip "the look" (${brief(chips(dp))})`);
  const dopen = chips(dp).find((x) => x.group === "status" && x.label === "Open");
  if (dopen) await follow("/decisions", dopen, (t) => (region(t, "question-list").match(/<li class="p-li" data-qid="/g) || []).length);
  const tp = await page("/gtm");
  const tlane = chips(tp).find((x) => x.group === "lane");
  if (tlane) await follow("/gtm", tlane, (t) => (region(t, "lanes").match(/<li class="p-li" data-row="/g) || []).length); else f.push(`gtm: no lane chip (${brief(chips(tp))})`);
  // a chip that would show nothing is not drawn
  for (const [p, t] of [["/build", bp], ["/goals", gp], ["/decisions", dp], ["/gtm", tp]]) for (const c of chips(t)) if (c.count === 0 && !c.current) f.push(`${p}: a chip with nothing to show ("${c.label}" 0)`);
  expect(!f.length, () => f.join(" · ") + ` [${seen.join(" · ")}]`);
  return seen.join(" · ");
});

smoke("look · L3 the settled fold: a folded group is a <details> whose rows are on the page (it opens in place, no script)", async () => {
  const f = [];
  const dp = await page("/decisions");
  const ruled = region(dp, "ruled");
  const folded = [...ruled.matchAll(/<details class="p-group"(?! open)[^>]*>([\s\S]*?)<\/details>(?=<details class="p-group"|<\/div><\/section>|<nav)/g)];
  if (!folded.length || !folded.some((m) => /<li class="p-li" data-qid="/.test(m[1]))) f.push(`decisions: no folded area with its rulings inside (${(ruled.match(/<details class="p-group"/g) || []).length} groups)`);
  // a ruled decision shows its RULING as the row's secondary text
  if (!/data-qid="Q-s20-ruled" data-status[\s\S]{0,1200}?<span class="p-line-sub">Yes<\/span>/.test(ruled)) f.push("decisions: the ruled question does not show its ruling (Yes) as its secondary");
  const gp = await page("/goals");
  if (!/<details class="p-group"(?! open)[^>]*data-id="s20-b"[^>]*data-state="done"/.test(gp)) f.push("goals: the done branch s20-b is not a folded group");
  if (!/<details class="p-group"(?! open)[^>]*data-id="s20-b"[\s\S]*?data-id="s20-b1"/.test(gp)) f.push("goals: the done branch's child is not inside its folded group");
  // an open row: every line of Build opens in place to its facts
  const bp = await page("/build");
  if (!/<li class="p-li" data-id="[^"]+"[^>]*><details class="p-x"><summary class="p-line"[\s\S]*?<div class="p-detail"><div class="p-ld"><dl class="p-ld-facts"><div><dt>Id<\/dt>/.test(bp)) f.push("build: a row does not open in place to its facts");
  expect(!f.length, () => f.join(" · "));
  return `decisions ${folded.length} folded area(s), goals' done branch folded, Build's rows open in place`;
});

smoke("look · L4 pristine copy: no raw call, no \"your Claude\", no sentence of the product's own on the five tabs (filled and empty)", async () => {
  const f = [];
  for (const proj of [P, PE]) for (const t of TABS) {
    const r = await html(`${t}${t.includes("?") ? "&" : "?"}project=${proj}`);
    expect(r.status === 200, () => `${t} ${proj}: HTTP ${r.status}`);
    f.push(...copyFails(r.text, `${t} (${proj})`));
  }
  expect(!f.length, () => f.slice(0, 12).join(" · "));
  return `${TABS.length * 2} pages`;
});

smoke("look · L5 empty is quiet: the empty project's tabs are phrases, never a strip of zeros", async () => {
  const f = [];
  for (const t of TABS) {
    const r = await html(`${t}${t.includes("?") ? "&" : "?"}project=${PE}`);
    const zeros = [...r.text.matchAll(/class="p-tile"[^>]*data-value="0"/g)].length;
    if (zeros > 1) f.push(`${t}: ${zeros} tiles read 0`);
    if (!/data-state="empty"/.test(r.text)) f.push(`${t}: no empty phrase`);
  }
  expect(!f.length, () => f.join(" · "));
  return "five quiet tabs";
});

// ---------------------------------------------------------------------------------------------------------------------
// sprint 3, L3 · the detail pages
const fact = (text, label) => { const m = new RegExp(`<div class="p-fact"([^>]*)><dt>${label}</dt><dd>([\\s\\S]*?)</dd></div>`).exec(text); return m ? { attrs: m[1], html: m[2] } : null; };
const detailPages = () => [`/goals/s20-a`, `/question/Q-s20-open`, `/question/Q-s20-ruled`, `/contribution/${q.landed}?page=1`, `/contribution/${q.counter}?page=1`,
  `/contribution/${q.landed}/impact`, "/missing", "/read?ref=card/s20claim/c1", "/doc/s20/notes.md", `/preview/${q.pv}`, "/library", "/library?q=S20", "/changes",
  "/versions", "/audit", "/profile", "/projects", "/control", "/broadcast", "/map", "/map/screens", "/map/arch", "/map/mcp", "/map/api", "/map/data", "/map/flows"];

smoke("look · L6 the detail pages load for the signed-in owner and the seated member; sign-in loads for nobody", async () => {
  await fileVia(ownerKey, [
    { kind: "card", op: "upsert", data: { kind: "s20claim", id: "c1", name: "S20 teams read the pages", asOf: "2026-10-01", confidence: "direction" } },
    { kind: "doc", op: "upsert", data: { path: "s20/notes.md", title: "S20 notes", body: "# The pages\n\nOne look for every page.", asOf: "2026-10-01", confidence: "direction" } },
  ]);
  const landed = await fileVia(ownerKey, [{ contribution: { lane: "code", kind: "pr", why: "s20", touches: ["engine/s20.js"], proof: "smoke s20 -> 5/5 passing", what: "S20 the detail pages", goalRef: "s20-a" } }]);
  q.landed = landed.items && landed.items[0] && landed.items[0].filed && landed.items[0].filed.id;
  expect(q.landed, () => `the landed contribution: ${brief(landed)}`);
  const c = await contribute(q.member, { project: P, lane: "leader", kind: "counter", parent: q.landed, what: "S20 the pages need one more pass", why: "the member read them" });
  q.counter = c.out && c.out.id;
  expect(!c.isError && q.counter && c.out.route === "owner", () => `the counter: ${brief(c.out)}`);
  const pv = await mcp(q.member, "preview", { project: P, items: [{ contribution: { lane: "leader", kind: "note", what: "S20 a preview to read", why: "the page" } }] });
  q.pv = pv.out && pv.out.previewId;
  expect(q.pv, () => `preview: ${brief(pv.out)}`);
  const f = [];
  for (const path of detailPages()) {
    for (const [who, key] of [["owner", ownerKey], ["member", q.member]]) {
      const r = await html(`${path}${path.includes("?") ? "&" : "?"}project=${P}`, key);
      if (path === "/projects" && who === "member" && r.status === 302) continue;   // one seat: the picker sends them straight home
      if (r.status !== 200) f.push(`${path} (${who}): HTTP ${r.status}${r.location ? ` -> ${r.location}` : ""}`);
      else if (!/<main\b/.test(r.text)) f.push(`${path} (${who}): no page`);
    }
  }
  const login = await fetch(`${BASE}/login`, { headers: { accept: "text/html" }, redirect: "manual" });
  const lt = await login.text();
  if (login.status !== 200 || !/<form[^>]*action="\/login"/.test(lt)) f.push(`/login: HTTP ${login.status}, form ${/<form[^>]*action="\/login"/.test(lt)}`);
  expect(!f.length, () => f.join(" · "));
  return `${detailPages().length} detail pages x 2 readers, and sign-in`;
});

smoke("look · L7 the header facts are the JSON twin's: a goal, a question (open and ruled), a contribution, What is missing", async () => {
  const f = [];
  const gp = await page("/goals/s20-a"), gj = await twin("/goals/s20-a");
  const pct = (/data-pct="([^"]*)"/.exec((fact(gp, "Done") || {}).html || "") || [])[1];
  if (pct !== (gj.node.pct == null ? "?" : String(Math.max(0, Math.min(100, Math.round(Number(gj.node.pct))))))) f.push(`goal done: page ${pct}, JSON ${gj.node.pct}`);
  const st = (/data-status="([^"]*)"/.exec((fact(gp, "Status") || {}).html || "") || [])[1];
  if (st !== String(gj.node.status || "")) f.push(`goal status: page ${st}, JSON ${gj.node.status}`);
  const standing = (/data-standing="([^"]*)"/.exec(region(gp, "counters")) || [])[1];
  if (standing !== String(gj.counters.standing)) f.push(`goal counters: page ${standing}, JSON ${gj.counters.standing}`);
  const qo = await page("/question/Q-s20-open"), qj = await twin("/question/Q-s20-open");
  const qs = (/data-status="([^"]*)"/.exec((fact(qo, "Status") || {}).attrs || "") || [])[1];
  if (qs !== qj.decision.status) f.push(`question status: page ${qs}, JSON ${qj.decision.status}`);
  const forms = (region(qo, "options").match(/<form [^>]*action="\/respond"/g) || []).length;
  if (forms !== qj.decision.options.length) f.push(`question options: ${forms} forms, JSON ${qj.decision.options.length}`);
  const qr = await page("/question/Q-s20-ruled"), rj = await twin("/question/Q-s20-ruled");
  if ((/data-status="([^"]*)"/.exec((fact(qr, "Status") || {}).attrs || "") || [])[1] !== rj.decision.status) f.push(`ruled question status vs ${rj.decision.status}`);
  if (/<form [^>]*action="\/respond"/.test(qr)) f.push("the ruled question still offers its options as forms");
  if (!/data-chosen/.test(qr) || !/Yes/.test(region(qr, "options"))) f.push("the ruled question does not show its ruling (Yes, the chosen option)");
  const tp = await page(`/contribution/${q.landed}?page=1`), tj = await twin(`/contribution/${q.landed}`);
  // L4: the header's "when" is when the work happened (else filed), the filing time in its title; the kind is its word
  const filed = fact(tp, "Happened"), by = fact(tp, "By"), kind = fact(tp, "Kind");
  if (!filed || !filed.attrs.includes(`title="filed ${tj.created_at}"`)) f.push(`contribution happened: ${filed && filed.attrs} vs filed ${tj.created_at}`);
  if (!by || !by.html.includes(tj.by_name)) f.push(`contribution by: ${by && by.html.slice(0, 80)} vs ${tj.by_name}`);
  if (!kind || unesc(kind.html) !== kindWord(tj.kind)) f.push(`contribution kind: ${kind && kind.html} vs ${kindWord(tj.kind)}`);
  if (!/aria-label="1 standing, 0 ruled"/.test((fact(tp, "Counters") || {}).html || "")) f.push(`contribution counters: ${(fact(tp, "Counters") || {}).html} (one counter stands on it)`);
  const hp = await page("/missing"), hj = (await mcp(ownerKey, "missing", { project: P })).out;
  if (metricOf(hp, "done") !== String(hj.meter.done) || metricOf(hp, "open") !== String((hj.items || []).length)) f.push(`holes: ${metricOf(hp, "done")}/${metricOf(hp, "open")} vs ${hj.meter.done}/${(hj.items || []).length}`);
  expect(!f.length, () => f.join(" · "));
  return `goal ${pct}% ${st}, question ${qs} with ${forms} options, ${q.landed} by ${tj.by_name}, holes ${hj.meter.done} filled`;
});

smoke("look · L8 pristine copy on every detail page: no raw call, no \"your Claude\", no sentence of the product's own", async () => {
  const f = [];
  for (const path of detailPages()) {
    const r = await html(`${path}${path.includes("?") ? "&" : "?"}project=${P}`);
    f.push(...copyFails(r.text, path));
  }
  const login = await (await fetch(`${BASE}/login`, { headers: { accept: "text/html" } })).text();
  f.push(...copyFails(login, "/login"));
  expect(!f.length, () => f.join("\n      "));
  return `${detailPages().length + 1} pages`;
});

smoke("look · L9 the decide presses: the owner's on a contribution that waits on them; none for the member, none on one that landed, none once ruled", async () => {
  const f = [];
  const own = await page(`/contribution/${q.counter}?page=1`);
  if ((own.match(/<form class="fl-rule /g) || []).length !== 3 || !own.includes(`data-decide="${q.counter}"`)) f.push("the owner has no three presses on the counter that waits on them");
  const mem = await page(`/contribution/${q.counter}?page=1`, q.member);
  if (/data-decide=/.test(mem)) f.push("the member sees presses");
  const landedPage = await page(`/contribution/${q.landed}?page=1`);
  if (/data-decide=/.test(landedPage)) f.push("presses on a contribution that landed on its own");
  // press Approve through the page's own form (its action and hidden fields read off the page, never typed)
  const m = /<form class="fl-rule fl-rule-approve" method="POST" action="([^"]+)">([\s\S]*?)<\/form>/.exec(own);
  const fields = m ? [...m[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((x) => [x[1], unesc(x[2])]) : [];
  const r = m ? await http("POST", unesc(m[1]), { key: ownerKey, form: fields }) : { status: "no-form" };
  if (r.status !== 302) f.push(`Approve: HTTP ${r.status}`);
  const after = await page(`/contribution/${q.counter}?page=1`);
  if (/data-decide=/.test(after) || !after.includes(`data-ruling="${q.counter}"`)) f.push("once ruled: presses still drawn or no ruling");
  const tj = await twin(`/contribution/${q.counter}`);
  if (tj.decision !== "approve") f.push(`the ruling did not land: ${tj.decision}`);
  expect(!f.length, () => f.join(" · "));
  return `${q.counter}: three presses for the owner, none for the member; ${q.landed} (landed) none; Approve pressed -> ${r.status}, the ruling drawn`;
});

smoke("look · L10 Control's forms post and flash: the same fields, 200 with the flash and the regions", async () => {
  const cp = await page("/control");
  const actions = [...new Set([...cp.matchAll(/<form[^>]*action="\/control"[^>]*>[\s\S]*?<input type="hidden" name="action" value="([a-z-]+)"/g)].map((m) => m[1]))].sort();
  for (const a of ["add-person", "add-project", "grant-seat", "remove-person", "revoke-seat", "rotate-key", "set-access-hats", "set-role"]) expect(actions.includes(a), () => `Control has no ${a} form (${actions.join(",")})`);
  const pid = (/<li class="p-li" data-person="([^"]+)"[^>]*>[\s\S]*?S20 Mia/.exec(cp) || [])[1];
  expect(pid, "the member's row on Control");
  const r = await control({ action: "grant-seat", personId: pid, projectKey: PE });
  expect(r.status === 200 && /class="ct-flash/.test(r.text) && /data-region="people"/.test(r.text) && /data-region="this-org"/.test(r.text), () => `grant-seat: HTTP ${r.status} ${(r.text.match(/ct-flash[\s\S]{0,200}/) || [""])[0]}`);
  return `${actions.length} form actions; grant-seat -> 200 with its flash`;
});
