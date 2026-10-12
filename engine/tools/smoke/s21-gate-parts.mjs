// tools/smoke/s21-gate-parts.mjs — sprint 3, S3b: the beta gate's local parts, through the real door. Self-contained: its own
// project (s21) and people (a member and a Partner seated on it, a Partner seated nowhere), and its own eval project.
//   · THE BACKUP: the owner walks POST /backup-dump?page= from "" to the end: every dumped table comes back, people without a
//     key hash, a passphrase or an address, the rule on the first page; the whole dump to R2 and the suites' window answer
//     their counts. ATTACK: a member and a Partner calling the backup (a page and the whole) are refused owner_only, nothing
//     is answered; anonymous is 401.
//   · THE MEASURES: the owner reads GET /control/measures (seven measures, each with its one-sentence definition) and its
//     export (?download=1, a file); Control draws the Measures card for the owner only. ATTACK: a member and a Partner
//     reading or exporting the measures are refused owner_only.
//   · THE EVAL SWITCH: a test seat's eval-marked contribution is found by a member's search, listed by read and changes, and
//     named by brief only with eval: true; ATTACK: a Partner seated nowhere passing eval: true is refused on every read, as without it.
//   · THE CHECKLIST AND THE DOOR AGREE: a member's checklist offers no owner's item (start-here, rulings owed: listed in
//     `others`, the owner's) and every call it offers previews with no refusal; formats says who files a decided question.
//   · AN EVAL PROJECT: create_project {eval: true} marks it; Control lists it only on ?eval=1; archived, clean-eval sweeps it.
//   · INVITE SEATS AS THE FORM SAYS: seatsChosen=1 with no project ticked seats nobody; with one ticked, that one.
//   · THE NAME: initialize's server is "sharingu — <org>" (no worker name) and its instructions name sharingu.
//   · AN IMAGE'S SIZE is its header's: a render declared 1 x 1 files at the picture's own 240 x 150.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { smoke, expect, brief, http, mcp, html, ownerKey, control, BASE, kread } from "./lib.mjs";

const TAG = String(process.env.S21_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s21" + TAG, EP = "s21-eval" + TAG;
const q = {};
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects, extra = []) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p]), ...extra] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return { key, email, name, text: r.text };
};
const fileVia = async (key, items, project = P, extra = {}) => {
  const pv = await mcp(key, "preview", { project, items, ...extra });
  expect(!pv.isError && pv.out.previewId, () => `preview: ${brief(pv.out)}`);
  const f = await mcp(key, "file", { previewId: pv.out.previewId, items, only: "ready" });
  expect(!f.isError && f.out.complete === true, () => `file: ${brief(f.out)}`);
  return f.out;
};
const PNG = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "walk", "fixtures", "screenshot-pricing.png"));

smoke("gate parts: a project, a member and two Partners (one seated nowhere)", async () => {
  await control({ action: "add-project", key: P, name: "S21" });
  q.m = await invite("S21 Mia", `mia${TAG}@s21.local`, "member", [P]);
  q.pa = await invite("S21 Pat", `pat${TAG}@s21.local`, "partner", [P]);
  q.loner = await invite("S21 Loner", `loner${TAG}@s21.local`, "partner", []);
  // a test seat (eval-fixed-*): the one whose marked contribution the eval switch hides (G2: the eval mark is accepted only on
  // an eval project or from a test seat)
  q.ev = await invite("S21 Test Seat", `evs${TAG}@s21.local`, "member", [P], [["eval", "1"]]);
  await fileVia(ownerKey, [{ kind: "goal", op: "upsert", data: { id: "s21-root", title: "S21 root goal", dimensions: ["code"] } },
    { kind: "node", op: "upsert", data: { id: "screen:s21-a", type: "screen", name: "S21 A", data: { surface: "s21-web" } } },
    { kind: "question", op: "upsert", data: { qid: "Q-s21-1", question: "S21 which way?", status: "open", whoOwes: "owner", options: [{ what: "Left" }, { what: "Right" }] } }]);
  return `${P}, ${q.m.email}, ${q.pa.email}, ${q.loner.email}`;
});

smoke("gate parts: the backup, page by page, holds every table that holds truth and no credential", async () => {
  const tables = new Set(); let cursor = "", pages = 0, rule = null, peopleRows = [];
  while (cursor != null && pages < 200) {
    const r = await http("POST", `/backup-dump?page=${encodeURIComponent(cursor)}&rows=500`, { key: ownerKey });
    expect(r.status === 200 && r.json && r.json.format === "sharingu-backup/1", () => `page ${pages}: ${r.status} ${brief(r.json || r.text)}`);
    if (r.json.rule) rule = r.json.rule;
    if (r.json.table) tables.add(r.json.table);
    if (r.json.table === "people") peopleRows.push(...r.json.rows);
    cursor = r.json.next; pages++;
  }
  const want = ["projects", "people", "org", "project_seats", "k_aim", "k_goals", "k_questions", "k_options", "k_nodes", "k_edges", "k_checks", "k_cards", "k_card_kinds", "k_docs", "k_gtm", "k_renders", "k_styles", "k_versions", "k_snapshots", "transmission", "approval_audit", "events", "check_results"];
  expect(cursor == null && want.every((t) => tables.has(t)) && rule && rule.never && rule.never.tokens, () => `missing ${want.filter((t) => !tables.has(t))}, rule ${brief(rule)}`);
  const leak = peopleRows.filter((p) => ["key_hash", "pass_hash", "pass_salt", "email"].some((c) => c in p));
  expect(peopleRows.length >= 4 && !leak.length && !JSON.stringify(peopleRows).includes(q.m.email), () => `people rows carry a credential or an address: ${brief(leak[0])}`);
  const whole = await http("POST", "/backup-dump", { key: ownerKey });
  const ev = await http("POST", "/backup-dump?eval=1", { key: ownerKey });
  expect(whole.status === 200 && whole.json.complete === true && /manifest\.json$/.test(whole.json.key) && whole.json.counts.k_goals >= 1 && ev.status === 200 && /\.eval\.json$/.test(ev.json.key) && ev.json.counts.transmission <= 50,
    () => `whole ${whole.status} ${brief(whole.json)} · eval ${ev.status} ${brief(ev.json)}`);
  return `${pages} pages, ${tables.size} tables, people with no credential; the whole dump ${whole.json.pages} objects (${whole.json.key}); the window ${ev.json.key}`;
});

smoke("ATTACK gate parts: a member and a Partner calling the backup are refused; anonymous is 401", async () => {
  const out = [];
  for (const [who, key] of [["member", q.m.key], ["partner", q.pa.key]]) {
    for (const path of ["/backup-dump?page=", "/backup-dump", "/backup-dump?eval=1"]) {
      const r = await http("POST", path, { key });
      expect(r.status === 403 && r.json && r.json.error === "owner_only" && !r.json.rows && !r.json.key, () => `${who} ${path}: ${r.status} ${brief(r.json || r.text)}`);
      out.push(`${who} ${path} ${r.status}`);
    }
  }
  const anon = await http("POST", "/backup-dump?page=");
  expect(anon.status === 401, () => `anonymous: ${anon.status}`);
  return `${out.join(", ")}; anonymous 401`;
});

smoke("gate parts: the beta measures, for the owner, with their definitions, exportable; the Measures card is the owner's", async () => {
  const r = await http("GET", "/control/measures", { key: ownerKey });
  const ms = (r.json && r.json.measures) || [];
  expect(r.status === 200 && ms.length === 7 && ms.every((m) => m.key && m.label && m.definition && m.value !== undefined), () => `${r.status} ${brief(r.json)}`);
  const d = await fetch(BASE + "/control/measures?download=1", { headers: { authorization: "Bearer " + ownerKey } });
  const body = await d.text();
  expect(d.status === 200 && /attachment; filename="sharingu-measures-\d{4}-\d{2}-\d{2}\.json"/.test(d.headers.get("content-disposition") || "") && JSON.parse(body).measures.length === 7 && !body.includes(q.m.email),
    () => `export ${d.status} ${d.headers.get("content-disposition")}`);
  const page = await html("/control"), seat = await html("/control", q.m.key);
  expect(/<section[^>]*data-region="measures"/.test(page.text) && /data-button="export-measures"/.test(page.text) && ms.every((m) => page.text.includes(`title="${m.definition.replace(/"/g, "&quot;")}"`) || page.text.includes(m.label))
    && !/<section[^>]*data-region="measures"/.test(seat.text), () => `owner page measures ${/data-region="measures"/.test(page.text)}, member page ${/<section[^>]*data-region="measures"/.test(seat.text)}`);
  return ms.map((m) => `${m.key} ${JSON.stringify(m.value).slice(0, 60)}`).join(" · ");
});

smoke("ATTACK gate parts: a member and a Partner reading or exporting the measures are refused owner_only", async () => {
  const out = [];
  for (const [who, key] of [["member", q.m.key], ["partner", q.pa.key], ["partner seated nowhere", q.loner.key]]) {
    for (const path of ["/control/measures", "/control/measures?download=1"]) {
      const r = await http("GET", path, { key });
      expect(r.status === 403 && r.json && r.json.error === "owner_only" && !r.json.measures, () => `${who} ${path}: ${r.status} ${brief(r.json || r.text)}`);
      out.push(`${who} ${r.status}`);
    }
  }
  return out.join(", ");
});

smoke("gate parts: the eval switch — a marked contribution is found by search, read, changes and brief only with eval: true", async () => {
  const f = await fileVia(q.ev.key, [{ contribution: { lane: "code", kind: "pr", what: "S21 zebra toggle on A", why: "the zebra test", touches: ["screen:s21-a"], proof: "npm test -> exit 0, 3 passing", eval: true } }], P, { eval: true });
  q.etx = ((f.items || []).find((x) => x.filed && /^T-/.test(String(x.filed.id || ""))) || {}).filed.id;
  const refs = (o) => ((o && o.groups) || []).flatMap((g) => (g.hits || []).map((h) => h.ref));
  const [s0, s1] = [await mcp(q.m.key, "search", { project: P, q: "zebra" }), await mcp(q.m.key, "search", { project: P, q: "zebra", eval: true })];
  const [r0, r1] = [await mcp(q.m.key, "read", { project: P, kind: "contribution" }), await mcp(q.m.key, "read", { project: P, kind: "contribution", eval: true })];
  const [c0, c1] = [await mcp(q.m.key, "changes", { project: P, since: "2020-01-01" }), await mcp(q.m.key, "changes", { project: P, since: "2020-01-01", eval: true })];
  const [b0, b1] = [await mcp(q.m.key, "brief", { project: P, for: "screen:s21-a" }), await mcp(q.m.key, "brief", { project: P, for: "screen:s21-a", eval: true })];
  const rest = await http("GET", `/search?project=${P}&q=zebra&eval=1`, { key: q.m.key });
  const has = (list, id) => (list || []).some((x) => x.id === id);
  expect(!refs(s0.out).includes(q.etx) && refs(s1.out).includes(q.etx) && refs(rest.json).includes(q.etx)
    && !has(r0.out.items, q.etx) && has(r1.out.items, q.etx) && !has(c0.out.changes, q.etx) && has(c1.out.changes, q.etx)
    && !has(b0.out.contributions, q.etx) && has(b1.out.contributions, q.etx),
    () => `search ${refs(s0.out)} / ${refs(s1.out)} · read ${has(r0.out.items, q.etx)} / ${has(r1.out.items, q.etx)} · changes ${has(c0.out.changes, q.etx)} / ${has(c1.out.changes, q.etx)} · brief ${has(b0.out.contributions, q.etx)} / ${has(b1.out.contributions, q.etx)}`);
  return `${q.etx}: hidden by default from search, read, changes and brief; shown with eval: true (and GET /search?eval=1)`;
});

smoke("ATTACK gate parts: a Partner seated nowhere passing the eval switch is refused, as without it", async () => {
  const out = [];
  for (const [tool, args] of [["search", { q: "zebra" }], ["read", { kind: "contribution" }], ["changes", {}], ["brief", { for: "screen:s21-a" }]]) {
    for (const ev of [{}, { eval: true }]) {
      const r = await mcp(q.loner.key, tool, { project: P, ...args, ...ev });
      expect(r.isError && /forbidden|not_found/.test(r.out.error || ""), () => `${tool} ${JSON.stringify(ev)}: ${brief(r.out)}`);
    }
    out.push(`${tool} refused`);
  }
  const rest = await http("GET", `/search?project=${P}&q=zebra&eval=1`, { key: q.loner.key });
  expect(rest.status === 403 || rest.status === 404, () => `GET /search?eval=1: ${rest.status}`);
  return `${out.join(", ")} (with and without eval: true); GET /search?eval=1 ${rest.status}`;
});

smoke("gate parts: the checklist offers a member only calls the door lets them make; the owner's items are named as the owner's", async () => {
  const h = (await mcp(q.m.key, "missing", { project: P })).out;
  const ids = (h.items || []).map((x) => x.id), others = (h.others || []).map((x) => `${x.id}:${x.by}`);
  expect(!ids.includes("start-here") && !ids.includes("rulings-owed") && others.includes("start-here:owner") && others.includes("rulings-owed:owner"), () => `holes ${ids} · others ${others}`);
  const refused = [];
  for (const x of h.items || []) {
    if (!x.fillPath || x.fillPath.tool !== "preview") continue;
    const pv = await mcp(q.m.key, "preview", { ...x.fillPath.args });
    const bad = ((pv.out && pv.out.items) || []).filter((i) => i.verdict === "refused");
    if (pv.isError || bad.length) refused.push(`${x.id}: ${pv.isError ? pv.out.error : bad.map((i) => (i.reasons || [])[0]).join(" / ")}`);
  }
  expect(!refused.length, () => refused.join(" | "));
  const page = await html(`/missing?project=${P}`, q.m.key);
  const fq = (await mcp(q.m.key, "formats", { kind: "question" })).out, fd = (await mcp(q.m.key, "formats", { kind: "doc" })).out;
  expect(/<section[^>]*data-region="others"/.test(page.text) && /data-item="start-here"[^>]*data-by="owner"/.test(page.text)
    && (fq.ownerOnly || []).some((x) => /decided/.test(x.what)) && (fd.ownerOnly || []).some((x) => /start-here\.md/.test(x.what)), () => `page others ${/data-region="others"/.test(page.text)} · formats ${brief(fq.ownerOnly)} ${brief(fd.ownerOnly)}`);
  return `${ids.length} offered, each previewed with no refusal; not the member's: ${others.join(", ")}; formats names the owner's question and doc`;
});

smoke("gate parts: an eval project is listed only on ?eval=1, and clean-eval sweeps it once archived", async () => {
  const c = await mcp(ownerKey, "create_project", { key: EP, name: "S21 eval", eval: true });
  expect(!c.isError && c.out.eval === true && c.out.created === true, () => brief(c.out));
  await fileVia(ownerKey, [{ kind: "goal", op: "upsert", data: { id: "s21e-root", title: "S21 eval root" } }], EP, { eval: true });
  const listed = async (qs) => { const j = (await http("GET", "/control/people" + qs, { key: ownerKey })).json || {}; return [...(j.workspaces || []), ...(j.archived || [])].some((x) => x.key === EP); };
  expect(!(await listed("")) && (await listed("?eval=1")), () => "an eval project shows on Control's default list, or not on ?eval=1");
  const again = await mcp(ownerKey, "create_project", { key: P, name: "S21", eval: true });
  expect(!again.isError && !again.out.eval && (await listed("")) === false && ((await http("GET", "/control/people", { key: ownerKey })).json.workspaces || []).some((x) => x.key === P),
    () => `re-adding a real project with eval: true must never mark it: ${brief(again.out)}`);
  await control({ action: "archive-project", projectKey: EP });
  const ce = await control({ action: "clean-eval" });
  const fl = (/Eval residue cleaned[^<]*/.exec(ce.text) || [""])[0];
  const read = await kread(ownerKey, { project: EP, kind: "goal" });
  expect(/eval projects [1-9]/.test(fl) && !(await listed("")), () => `clean-eval: ${fl} · read ${brief(read.out)}`);
  return `created marked, hidden from the default list, a real key never marked; archived and swept (${fl.trim()})`;
});

smoke("gate parts: Invite seats exactly the projects its form ticks (the form sends seatsChosen)", async () => {
  const none = await invite("S21 Nobody", `nobody${TAG}@s21.local`, "member", [], [["seatsChosen", "1"]]);
  const one = await invite("S21 Somebody", `somebody${TAG}@s21.local`, "member", [P], [["seatsChosen", "1"]]);
  expect(/seated nowhere yet/.test(none.text) && new RegExp(`seated on ${P === "s21" ? "S21\\b(?! \\()" : `S21 \\(${P}\\)`}`).test(one.text), () => `${(none.text.match(/Created[^<]*?seated[^,<]*/) || [""])[0]} · ${(one.text.match(/Created[^<]*?seated[^,<]*/) || [""])[0]}`);
  const page = await html("/control");
  expect(/name="seatsChosen" value="1"/.test(page.text), () => "Control's Invite form does not send seatsChosen");
  return "seatsChosen=1 with none ticked: seated nowhere; with one ticked: that one; the Invite form sends it";
});

smoke("gate parts: the product is sharingu to a connecting client; an image's size is its header's", async () => {
  const r = await http("POST", "/mcp", { key: ownerKey, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } } });
  const res = (r.json && r.json.result) || {};
  expect(/^sharingu( — .+)?$/.test(res.serverInfo && res.serverInfo.name) && !/agent-r/i.test(JSON.stringify(res.serverInfo)) && /^You are connected to sharingu/.test(res.instructions || "") && !/Agent R/.test(res.instructions || ""),
    () => `serverInfo ${brief(res.serverInfo)} · ${String(res.instructions || "").slice(0, 80)}`);
  await fileVia(ownerKey, [{ kind: "render", op: "upsert", data: { screen: "screen:s21-a", variant: "shot", format: "image", body: PNG.toString("base64"), width: 1, height: 1 } }]);
  const sc = (await http("GET", `/map/screens?project=${P}&surface=s21-web`, { key: ownerKey })).json || {};
  const rd = (((sc.screens || []).find((x) => x.id === "screen:s21-a") || {}).renders || []).find((x) => x.variant === "shot");
  expect(rd && rd.width === 240 && rd.height === 150, () => `the render filed as ${brief(rd)}`);
  return `server "${res.serverInfo.name}"; a render declared 1 x 1 filed as ${rd.width} x ${rd.height}`;
});
