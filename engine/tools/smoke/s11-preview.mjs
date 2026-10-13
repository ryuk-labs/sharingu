// tools/smoke/s11-preview.mjs — sprint 3, B2: preview, then file (sprint 19: each part with its write tool), through the real door. Self-contained: it adds its own
// project (s11) and its own people (a member and a Partner seated on it, a Partner seated nowhere, a member seated only on
// the org's first project), so it reads nothing an earlier case left.
//   · a mixed preview by the member (a goal, a screen and its render, a GTM contribution with its shape fields, one that
//     waits for the owner, one missing a field, a grade, an answer, two left-out notes): verdicts, places, reach and the text
//     block as expected (sprint 19: the grade and the answer refused, naming submit_grade and respond; each item its write tool); ONE row written (the d1-rows Server-Timing: the preview's row and its migrate-078 prune-index entry, 2);
//     the project unchanged, read back;
//   · the page: the author, the seated Partner and the owner open it; the Partner seated nowhere and the member of another
//     project get the usual 404; a signed-in COOKIE opens it too;
//   · the write tools (sprint 19): changed items -> preview_changed (each tool); a not-ready item -> not_ready (its tool);
//     only "ready" -> everything ready lands, the rest is left and said, the receipt's links resolve, the tabs show it (the
//     grade and the answer through submit_grade and respond); each tool again -> preview_filed, nothing doubled;
//   · an expired preview refused; a read-only credential previews (nothing stored, every item refused) and cannot file.
import { execFileSync } from "node:child_process";
import { smoke, expect, brief, http, mcp, html, ownerKey, readOnlyOf, control, BASE, kwrite, kread, contribute, contributions, sessionPath, unbased, d1rows, fileParts } from "./lib.mjs";

// S11_TAG: a second run against a kept worker takes its own project and people (the smoke itself runs it once, untagged)
const TAG = String(process.env.S11_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s11" + TAG;
const q = { s: {} };
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(r.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${r.status})`);
  return { key };
};
// raw(method, path, headers, body) -> the response with its headers (the d1-rows Server-Timing)
async function raw(method, path, headers = {}, body) {
  const r = await fetch(BASE + await sessionPath(headers.cookie, path), { method, headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await unbased(await r.text());   // the org base off its paths (sprint 7, 7.4: lib.mjs unbased)
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  const m = /d1-rows;dur=0;desc="read=(\d+) written=(\d+) stmts=(\d+)/.exec(r.headers.get("server-timing") || "");
  return { status: r.status, json, text, rows: m ? { read: +m[1], written: +m[2], stmts: +m[3] } : null };
}
// the plan's running counter (sprint 8, migrate-076 org_usage): every counted call is ONE upsert of its org's ONE row (8.2f, main's
// ruling: every call counts, reads included). A rows-written pin subtracts that one table's writes, read off the table itself:
// usageOf() its org-1 row now, usageRows(a, b) the upserts between two reads (a new day starts the count over)
const usageOf = () => d1rows("SELECT day, calls_day FROM org_usage WHERE org = 1")[0] || { day: "", calls_day: 0 };
const usageRows = (a, b) => (a.day === b.day ? b.calls_day - a.calls_day : b.calls_day);
const signIn = async (email, key) => {
  const r = await http("POST", "/login", { body: { email, password: key, device: "smoke-s11" } });
  if (!r.json || !r.json.token) throw new Error(`POST /login ${email}: ${r.status} ${brief(r.json)}`);
  return r.json.token;
};
const kn = async (kind, extra = {}) => ((await kread(ownerKey, { project: P, kind, ...extra })).out.items || []);
const queue = async () => contributions(ownerKey, P, { eval: true });   // D5: read {kind: "contribution"}, every page

// the model the preview reaches into, filed by the owner first
const MODEL = [
  { kind: "goal", op: "upsert", data: { id: "s11-root", parent: null, title: "S11 root", dimensions: [] } },
  { kind: "node", op: "upsert", data: { id: "door:s11-prices", type: "door", name: "GET /s11/prices" } },
  { kind: "node", op: "upsert", data: { id: "table:s11-prices", type: "table", name: "s11 prices" } },
  { kind: "node", op: "upsert", data: { id: "flow:s11-buy", type: "flow", name: "S11 buy" } },
  { kind: "edge", op: "upsert", data: { from: "door:s11-prices", to: "table:s11-prices", kind: "reads" } },
  { kind: "edge", op: "upsert", data: { from: "flow:s11-buy", to: "door:s11-prices", kind: "flow-step" } },
  { kind: "check", op: "upsert", data: { id: "AC.s11.01", title: "The prices door answers the plans", refs: ["door:s11-prices", "s11-root"] } },
  { kind: "check", op: "upsert", data: { id: "AC.s11.02", title: "The prices table holds a row a plan", refs: ["door:s11-prices"] } },
  { kind: "question", op: "upsert", data: { qid: "Q-s11-1", question: "Annual discount: 15% or 20%?", status: "open", affects: ["door:s11-prices"], options: [{ what: "15%" }, { what: "20%" }] } },
];
// the mixed preview
const ITEMS = [
  { kind: "goal", op: "upsert", data: { id: "s11-annual", parent: "s11-root", title: "S11 annual plans sell", dimensions: ["gtm"] } },
  { kind: "node", op: "upsert", data: { id: "screen:s11-pricing", type: "screen", name: "S11 Pricing", data: { surface: "s11-web", states: ["annual"] } } },
  { kind: "render", op: "upsert", data: { screen: "screen:s11-pricing", state: "annual", format: "html", body: "<main><h1>Pricing</h1><p>Annual</p><script>alert(1)</script></main>" } },
  { contribution: { lane: "gtm", kind: "outreach", what: "S11 annual plan email", why: "The waitlist asked for yearly billing.", touches: ["door:s11-prices"], proof: "https://example.com/s11/campaign",
    audience: "the waitlist", claim: "two months free", channel: "email", experiment: "does a yearly price lift sign-ups?", source: [{ kind: "url", ref: "https://example.com/s11/notes" }],
    next: { what: "review the annual copy", by: "2026-10-15" } } },
  { contribution: { lane: "leader", kind: "note", what: "S11 change the pricing copy on the plans", why: "The annual plan reads as a discount." } },
  { contribution: { lane: "code", kind: "pr", what: "S11 annual toggle", why: "Buyers asked for it.", touches: ["screen:s11-pricing"] } },
  { grade: { checkId: "AC.s11.01", verdict: "proven", proof: "npm test -> exit 0, 3 passing" } },
  { answer: { qid: "Q-s11-1", option: 1 } },
];
// the preview's parts (sprint 19): items 1-3 knowledge upserts (save_knowledge), 4-6 contributions (file_contribution)
const KN = ITEMS.slice(0, 3), CO = ITEMS.slice(3, 6);
const LEFT = [{ what: "10 messages with no fact or decision", why: "small talk" }, { what: "a pasted log", why: "no new fact" }];

smoke("preview: a mixed preview answers each item's verdict, place and reasons, its reach and its text; ONE row written; nothing filed", async () => {
  await control({ action: "add-project", key: P, name: "S11" });
  q.s.member = await invite("S11 Member", `member${TAG}@s11.local`, "member", [P]);
  q.s.partner = await invite("S11 Partner", `partner${TAG}@s11.local`, "partner", [P]);
  q.s.loner = await invite("S11 Loner", `loner${TAG}@s11.local`, "partner", []);
  q.s.other = await invite("S11 Other", `other${TAG}@s11.local`, "member", ["local"]);
  const m = await kwrite(ownerKey, { project: P, ops: MODEL });
  expect(!m.isError && m.out.written === MODEL.length, () => brief(m.out));
  const before = { goals: (await kn("goal")).length, nodes: (await kn("node")).length, tx: (await queue()).length };
  const u0 = usageOf();
  const r = await raw("POST", "/preview", { authorization: "Bearer " + q.s.member.key, "x-count-rows": "1" }, { project: P, items: ITEMS, leftOut: LEFT, note: "From the S11 call notes." });
  const counter = usageRows(u0, usageOf());   // the call's own count (org_usage), not the preview's effect
  const a = r.json || {};
  expect(r.status === 200 && /^P-[0-9a-f]{16}$/.test(a.previewId || ""), () => `preview ${r.status}: ${r.text.slice(0, 300)}`);
  q.s.pv = a;
  const v = (a.items || []).map((x) => x.verdict).join(",");
  expect(v === "files,files,files,files,waits_for_owner,needs,refused,refused", `verdicts: ${v}`);
  const tools = (a.items || []).map((x) => x.filesWith || (x.refusal && x.refusal.error === "wrong_tool" ? `->${x.refusal.tool}` : "-")).join(",");
  expect(tools === "save_knowledge,save_knowledge,save_knowledge,file_contribution,file_contribution,file_contribution,->submit_grade,->respond"
    && (a.parts || []).map((p) => `${p.tool}:${p.items.join("+")}:${p.ready}`).join() === "file_contribution:4+5+6:2,save_knowledge:1+2+3:3", () => `the tools: ${tools} · parts ${brief(a.parts)}`);
  const it = a.items;
  expect(it[0].places.some((p) => p.path === "/goals" && p.tab === "goals") && it[1].places.some((p) => /^\/map\/screens\?surface=s11-web$/.test(p.path)) && it[2].body && it[2].body.stripped && it[2].body.stripped.scripts === 1
    && it[3].tab === "gtm" && it[4].reasons.some((x) => /sensitive area|pricing/.test(x)) && it[5].needs && /screens|proof|components/.test(it[5].needs.field) && it[5].needs.formats.shape === "code"
    && it[6].refusal.tool === "submit_grade" && it[7].refusal.tool === "respond", () => brief(it.map((x) => [x.verdict, x.effect, x.tab, x.needs, x.reasons])));
  const rc = a.reach || {};
  expect(rc.touched.total >= 2 && rc.reached.names.some((n) => n.id === "table:s11-prices") && rc.reached.names.some((n) => n.id === "flow:s11-buy") && rc.checks.total === 2 && rc.checks.graded === 0
    && rc.goals.some((g) => g.id === "s11-root") && (rc.asks || []).some((x) => x.qid === "Q-s11-1"), () => `reach ${brief(rc)}`);
  const t = a.text || "";
  const lines = t.split("\n");
  expect(lines.every((l) => l.length <= 72 && /^[\x20-\x7e]*$/.test(l)) && lines.length <= 34 && /Preview, nothing filed yet/.test(lines[0]) && /left out/.test(t) && /reaches/.test(t) && t.includes(a.previewId)
    && /needs/.test(t) && /waits for the owner/.test(t), () => `text:\n${t}`);
  // the one previews row, written with its idx_previews_prune entry (an unfiled preview: migrate-078, sprint 8 8.3b) — 2 rows billed
  expect(r.rows && r.rows.written - counter === 2, () => `rows: ${brief(r.rows)} (the counter's ${counter} aside)`);
  const after = { goals: (await kn("goal")).length, nodes: (await kn("node")).length, tx: (await queue()).length };
  const renders = await kn("render", { screen: "screen:s11-pricing" });
  expect(JSON.stringify(before) === JSON.stringify(after) && renders.length === 0, () => `project changed: ${brief([before, after, renders.length])}`);
  return `verdicts ${v}; reach ${a.reachLine}; one previews row (${r.rows.written - counter} written with its prune-index entry; the call's counter aside), ${r.rows.read} read in ${r.rows.stmts} statements; the project unchanged (${after.goals} goals, ${after.nodes} nodes, ${after.tx} filings, no render)`;
});

smoke("preview: the page opens for its author, a seated Partner and the owner (and by a signed-in cookie); 404 to anyone else", async () => {
  const id = q.s.pv.previewId;
  const me = await html(`/preview/${id}`, q.s.member.key), pa = await html(`/preview/${id}`, q.s.partner.key), ow = await html(`/preview/${id}`, ownerKey);
  const lo = await html(`/preview/${id}`, q.s.loner.key), ot = await html(`/preview/${id}`, q.s.other.key), bad = await html(`/preview/P-0000000000000000`, ownerKey);
  expect(me.status === 200 && /data-screen="preview"/.test(me.text) && /data-state="open"/.test(me.text) && /data-region="items"/.test(me.text) && /data-region="reach"/.test(me.text) && /data-region="left-out"/.test(me.text)
    && /data-region="file"/.test(me.text) && (me.text.match(/data-verdict="/g) || []).length === 8 && /Not filed yet/.test(me.text) && /Show on the Map/.test(me.text), () => `author ${me.status}: ${me.text.slice(0, 200)}`);
  expect(pa.status === 200 && ow.status === 200 && lo.status === 404 && ot.status === 404 && bad.status === 404, `partner ${pa.status} owner ${ow.status} loner ${lo.status} other ${ot.status} missing ${bad.status}`);
  const j = await http("GET", `/preview/${id}`, { key: q.s.loner.key });
  expect(j.status === 404, `loner JSON ${j.status}`);
  const tok = await signIn(`member${TAG}@s11.local`, q.s.member.key);
  const ck = await raw("GET", `/preview/${id}`, { accept: "text/html", cookie: `__Host-ar_session=${encodeURIComponent(tok)}` });
  // D1b item 5, THE sign-in rule: a signed-out browser NAVIGATION goes to sign-in; a script (node's fetch is one) is refused 401
  const anon = await raw("GET", `/preview/${id}`, { accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" });
  const anonScript = await raw("GET", `/preview/${id}`, { accept: "text/html" });
  expect(ck.status === 200 && /data-screen="preview"/.test(ck.text) && anon.status === 302 && anonScript.status === 401, `cookie ${ck.status}, signed out ${anon.status} (navigation) / ${anonScript.status} (script)`);
  // a cookie preview from another origin is refused (the same-origin write rule); from its own, it previews
  const xo = await raw("POST", "/preview", { cookie: `__Host-ar_session=${encodeURIComponent(tok)}`, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, { project: P, items: [ITEMS[0]] });
  const so = await raw("POST", "/preview", { cookie: `__Host-ar_session=${encodeURIComponent(tok)}`, origin: BASE, "sec-fetch-site": "same-origin" }, { project: P, items: [ITEMS[0]] });
  expect(xo.status === 403 && so.status === 200 && /^P-/.test(so.json.previewId || ""), `cross-origin ${xo.status}, same-origin ${so.status}`);
  return "author, seated Partner and owner 200; Partner with no seat, member of another project and an unknown id 404; a signed-in cookie 200, signed out to sign-in; a cross-origin cookie preview 403";
});

smoke("write tools: changed items, then a not-ready item, are refused with nothing filed; only \"ready\" files the rest, and the receipt's links resolve", async () => {
  const id = q.s.pv.previewId, before = (await queue()).length, goals0 = (await kn("goal")).length;
  const ch = await mcp(q.s.member.key, "save_knowledge", { previewId: id, items: KN.slice(0, 2) });
  const chc = await mcp(q.s.member.key, "file_contribution", { previewId: id, items: [CO[1], CO[0], CO[2]] });
  const nr = await mcp(q.s.member.key, "file_contribution", { previewId: id, items: CO });
  expect(ch.isError && ch.out.error === "preview_changed" && chc.isError && chc.out.error === "preview_changed" && nr.isError && nr.out.error === "not_ready" && nr.out.notReady.length === 1 && nr.out.notReady[0].i === 5
    && (await queue()).length === before && (await kn("goal")).length === goals0, () => brief([ch.out, chc.out, nr.out]));
  const other = await mcp(q.s.other.key, "file_contribution", { previewId: id, items: CO, only: "ready" });
  const otherK = await mcp(q.s.other.key, "save_knowledge", { previewId: id, items: KN });
  expect(other.isError && other.out.error === "preview_not_found" && otherK.isError && otherK.out.error === "preview_not_found", () => `another person's write: ${brief([other.out, otherK.out])}`);
  const f = await fileParts((n, args) => mcp(q.s.member.key, n, args), q.s.pv, ITEMS, { only: "ready" });
  const st = ((f.out && f.out.items) || []).map((x) => x.filed && x.filed.status).join(",");
  expect(f.step === "file" && f.out.complete === true && f.receipts.length === 2 && f.receipts.every((x) => x.complete && /Filed/.test(x.text.split("\n")[0]))
    && st === "filed,filed,filed,filed,filed,left", () => `file: ${brief(f.out).slice(0, 300)} ${st}\n${(f.receipts || []).map((x) => x.text).join("\n")}`);
  // the grade and the answer the preview refused, through their own tools (the preview named them)
  const g = await mcp(q.s.member.key, "submit_grade", { project: P, ...ITEMS[6].grade });
  const an = await mcp(q.s.member.key, "respond", { project: P, ...ITEMS[7].answer });
  expect(!g.isError && g.out.counted !== false && !an.isError, () => `submit_grade / respond: ${brief([g.out, an.out])}`);
  q.s.receipt = f.out;
  const goals = (await kn("goal")).map((g) => g.id), screens = (await kn("node")).filter((n) => n.type === "screen").map((n) => n.id), renders = await kn("render", { screen: "screen:s11-pricing" });
  const tx = await queue();
  const check = ((await kread(ownerKey, { project: P, ref: "check/AC.s11.01" })).out || {}).item || {};   // D5: read {ref: check/<id>}
  expect(goals.includes("s11-annual") && screens.includes("screen:s11-pricing") && renders.length === 1 && tx.some((x) => x.what === "S11 annual plan email") && tx.some((x) => /S11 change the pricing copy/.test(x.what))
    && !tx.some((x) => x.what === "S11 annual toggle") && ((check.grades || [])[0] || {}).verdict === "proven", () => brief([goals, screens, renders.length, tx.map((x) => x.what), check]));
  // every receipt link opens
  const hrefs = new Set();
  for (const x of f.out.items) { if (x.filed && x.filed.id) hrefs.add(`/contribution/${x.filed.id}?page=1`); for (const p of x.places || []) if (!/\{/.test(p.path) && x.filed && x.filed.status === "filed") hrefs.add(p.path); }
  const opened = [];
  for (const h of hrefs) { const r = await html(h + (h.includes("?") ? "&" : "?") + `project=${P}`, q.s.member.key); opened.push(`${r.status}`); expect(r.status === 200, () => `${h} -> ${r.status}`); }
  const tabs = { goals: await html(`/goals?project=${P}`, q.s.member.key), build: await html(`/build?project=${P}`, q.s.member.key), gtm: await html(`/gtm?project=${P}`, q.s.member.key) };
  expect(/S11 annual plans sell/.test(tabs.goals.text) && /S11 annual plan email/.test(tabs.build.text) && /S11 annual plan email/.test(tabs.gtm.text), "the tabs do not show what was filed");
  const page = await html(`/preview/${id}`, q.s.member.key);
  const withId = f.out.items.filter((x) => x.filed && x.filed.id).length;
  expect(/data-state="filed"/.test(page.text) && withId >= 5 && (page.text.match(/data-filed-id="/g) || []).length >= withId && /data-filed="left"/.test(page.text), `filed page (${withId} filed with an id): ${page.text.slice(0, 120)}`);
  return `refused preview_changed (both tools) and not_ready (item 6, file_contribution), another person's id preview_not_found, nothing filed; only ready: ${st} (the grade and the answer through submit_grade and respond); ${hrefs.size} receipt links all 200; Goals, Build and GTM show it; the page reads Filed`;
});

smoke("write tools: again is safe (preview_filed with the receipt, nothing doubled); an expired preview and a read-only key are refused", async () => {
  const id = q.s.pv.previewId;
  // each contribution the preview filed is on the ledger exactly once, before and after a second file
  const once = async () => { const tx = await queue(); return ["S11 annual plan email", "S11 change the pricing copy on the plans"].map((w) => tx.filter((x) => x.what === w).length).join(","); };
  const before = await once();
  const again = await mcp(q.s.member.key, "file_contribution", { previewId: id, items: CO, only: "ready" });
  const againK = await mcp(q.s.member.key, "save_knowledge", { previewId: id, items: KN });
  expect(before === "1,1" && again.isError && again.out.error === "preview_filed" && again.out.receipt && again.out.receipt.complete
    && againK.isError && againK.out.error === "preview_filed" && againK.out.receipt && againK.out.receipt.complete && (await once()) === "1,1", () => `${before} ${brief([again.out, againK.out])}`);
  // an expired preview: aged past its hour in the local database (the door cannot), then refused with nothing filed
  const p2 = await mcp(q.s.member.key, "preview", { project: P, items: [{ contribution: { lane: "leader", kind: "note", what: "S11 expired note", why: "never filed" } }] });
  expect(!p2.isError && p2.out.previewId, () => brief(p2.out));
  const { SMOKE_D1_DB: db, SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  expect(db && cfg && persist, "SMOKE_D1_* not set (tools/smoke.sh sets them)");
  execFileSync("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfg, "--local", "--persist-to", persist, "--command", `UPDATE previews SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = '${p2.out.previewId}'`], { stdio: "ignore" });
  const ex = await mcp(q.s.member.key, "file_contribution", { previewId: p2.out.previewId, items: [{ contribution: { lane: "leader", kind: "note", what: "S11 expired note", why: "never filed" } }] });
  const page = await html(`/preview/${p2.out.previewId}`, q.s.member.key);
  expect(ex.isError && ex.out.error === "preview_expired" && /data-state="expired"/.test(page.text) && !(await queue()).some((x) => x.what === "S11 expired note"), () => `expired: ${brief(ex.out)} page ${page.status}`);
  // a read-only credential: previews (nothing stored, every item refused for filing), never files
  const ro = readOnlyOf(q.s.member.key);
  const v0 = usageOf();
  const rp = await raw("POST", "/preview", { authorization: "Bearer " + ro, "x-count-rows": "1" }, { project: P, items: ITEMS.slice(0, 2) });
  const counted = usageRows(v0, usageOf());   // the call's own count (org_usage), not the preview's effect
  const rf = await raw("POST", "/preview/file-contribution", { authorization: "Bearer " + ro }, { previewId: id, items: CO });
  const inUrl = await raw("POST", `/preview?k=${q.s.member.key}`, {}, { project: P, items: ITEMS.slice(0, 1) });
  expect(rp.status === 200 && rp.json.previewId === null && rp.json.readOnly === true && rp.json.items.every((x) => x.verdict === "refused") && rp.rows && rp.rows.written - counted === 0
    && rf.status === 403 && rf.json.error === "read_only_credential" && inUrl.status === 401, () => `read-only preview ${rp.status} ${brief(rp.json).slice(0, 200)} rows ${brief(rp.rows)} · file ${rf.status} · ?k= ${inUrl.status}`);
  return `again: preview_filed, each contribution on the ledger once before and after (${before}); expired: preview_expired and the page reads Expired; read-only: previews with 0 rows written, every item refused, POST /preview/file-contribution 403; a key in the URL 401`;
});

// the day's next contribution id past 999 (migrate-049; src/core.js nextSeqStart): the day's ledger seeded to 1,000 ids in
// the local database (filing a thousand through the door is too slow for the smoke), then the single door
// (preview then file_contribution) and the batch door (file_contribution) each land past it, no UNIQUE collision
smoke("ids: a day holding 1,000 contribution ids takes the 1,001st on both doors (single and batch)", async () => {
  const { SMOKE_D1_DB: db, SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  expect(db && cfg && persist, "SMOKE_D1_* not set (tools/smoke.sh sets them)");
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const owner = (await http("GET", "/whoami", { key: ownerKey })).json.id;
  execFileSync("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfg, "--local", "--persist-to", persist, "--command",
    `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 1000) INSERT OR IGNORE INTO transmission (id, submitter, lane, kind, what, route, status, eval, project, created_at, org) ` +
    `SELECT printf('T-%s-%03d', '${day}', x), '${owner}', 'leader', 'note', 's11 seeded id ' || x, 'auto', 'routed', 1, '${P}', '${new Date().toISOString()}', 1 FROM n`], { stdio: "ignore" });
  const one = await contribute(ownerKey, { project: P, lane: "leader", kind: "note", what: "S11 past a thousand, single", why: "the 1,001st id" });
  const pv = await mcp(ownerKey, "preview", { project: P, items: [{ contribution: { lane: "leader", kind: "note", what: "S11 past a thousand, batch", why: "the next block" } }] });
  const f = await mcp(ownerKey, "file_contribution", { previewId: pv.out.previewId, items: [{ contribution: { lane: "leader", kind: "note", what: "S11 past a thousand, batch", why: "the next block" } }] });
  const num = (id) => Number((/-(\d+)$/.exec(String(id || "")) || [])[1] || 0);
  const batchId = f.out.items && f.out.items[0].filed && f.out.items[0].filed.id;
  expect(!one.isError && num(one.out.id) > 1000 && one.out.id.startsWith(`T-${day}-`) && !f.isError && num(batchId) === num(one.out.id) + 1, () => `single ${brief(one.out)} · batch ${brief(f.out).slice(0, 200)}`);
  return `the single door took ${one.out.id}, the batch door ${batchId}`;
});
