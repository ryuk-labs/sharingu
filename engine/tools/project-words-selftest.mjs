// tools/project-words-selftest.mjs — sprint 13, 13.2: no answer, page or flash names a project by its org-prefixed key
// (`o2--sample`) to a person. A project reads as its name or its slug (src/project.js projectSlug; the door reads a slug inside
// the caller's org, so a call shown to copy names the slug too). JSON fields that carry the key as DATA (project, key, projects,
// a call's args) stay as they are: the door's contract uses keys. Through the REAL worker (tools/fixtures/sqlite-worker.mjs) in
// org 2 ("Two": projects sample and shop, an owner, a member seated on sample):
//   A. Control's flashes: add-person with a key and with an invite link ("seated on Sample"), add-project, archive-project,
//      activate-project — each names the project's name or slug, never o2--;
//   B. the door's sentences that name a project (the notes of changes, search, read, brief, versions, the fill calls of
//      missing, equip's preview line, reach, text and REST call, Broadcast's reason) and the Map's and Screens' titles and call;
//   C. the sweep: every tool (with the project by slug, a key the caller holds no seat on, and none) as the owner and the
//      member, and the tabs' pages: any sentence (a string with a space) or visible page text naming an o<N>-- key fails —
//      strict since sprint 13's second pass (no file is excused: src/core.js, src/mcp.js and src/confirm.js included);
//   D. the door's refusals and glosses (src/core.js: whoami's projectGloss, doorProject's and resolveProject's refusals, the
//      unnamed write's project_required, projectArg's, the Partner fence's): each names slugs, and EVERY project a refusal
//      suggests is one the door accepts from that same caller (the call is made again with it: no refusal);
//   E. create_project's note and tip (src/mcp.js: created, already there, reactivated — the name and the slug, and the tip's
//      `missing` call accepted) and the confirm form's line (src/confirm.js confirmSchema: "File n items into sample").
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);

let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const KEY = /o[1-9][0-9]*--[a-z0-9-]+/;
const visible = (html) => String(html).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
const around = (s) => { const v = String(s), i = v.search(KEY); return i < 0 ? "" : `…${v.slice(Math.max(0, i - 80), i + 40)}…`; };
// sentences(v) -> every string with a space inside v (a JSON answer): the words a person reads; a bare key is data
const sentences = (v, path = "", out = []) => {
  if (typeof v === "string") { if (/\s/.test(v)) out.push([path, v]); }
  else if (Array.isArray(v)) v.forEach((x, i) => sentences(x, `${path}[${i}]`, out));
  // a call's wire form (next.rest: "POST /broadcast/equip {...}") is data sent as given: it keeps the key (the review's should-fix 1)
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k !== "rest") sentences(x, path ? `${path}.${k}` : k, out); }
  return out;
};

// world(more, orgs) — org 2 ("Two": sample and "Pilot shop" (shop); an owner, a member seated on sample), `more` people beside them
async function world(more = [], orgs = []) {
  const W = await sqliteWorker({ org: "One", projects: ["alpha"], people: [["one-owner", "Owner One", "owner", "one-owner-key", []]],
    orgs: [{ id: 2, name: "Two", projects: ["sample", "shop"], people: [["two-owner", "Owner Two", "owner", "two-owner-key", []], ["two-mem", "Mia Two", "member", "two-mem-key", ["sample"]], ...more] }, ...orgs] });
  W.db.prepare("UPDATE projects SET name = 'Pilot shop' WHERE key = 'o2--shop'").run();
  const call = async (method, path, { key = "two-owner-key", form, accept = "text/html", body } = {}) => {
    const headers = { accept, authorization: "Bearer " + key };
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await W.fetch(new Request(W.origin + path, { method, headers, body: payload, redirect: "manual" }));
    return { status: r.status, text: await r.text() };
  };
  return { ...W, call };
}
const flashOf = (html) => { const m = /class="ct-flash[^"]*"[\s\S]*?<\/(section|div)>/.exec(html); return visible(m ? m[0] : ""); };

// ---- A. Control's flashes ----
{
  const W = await world();
  const a1 = flashOf((await W.call("POST", "/control", { form: { action: "add-person", name: "Ann", email: "ann@two.test", projectKey: "sample", seatsChosen: "1" } })).text);
  ok(/seated on Sample\b/.test(a1) && !KEY.test(a1), "A1 · add-person (a key): the flash says 'seated on Sample', never o2--sample", a1.slice(0, 240));
  const a2 = flashOf((await W.call("POST", "/control", { form: { action: "add-person", name: "Bob", email: "bob@two.test", projectKey: "shop", seatsChosen: "1", deliver: "link" } })).text);
  ok(/seated on Pilot shop \(shop\)/.test(a2) && !KEY.test(a2), "A2 · add-person (an invite link): the flash says 'seated on Pilot shop (shop)' — the name, and the slug where they differ", a2.slice(0, 240));
  const a3 = flashOf((await W.call("POST", "/control", { form: { action: "add-project", key: "beta", name: "Beta lab" } })).text);
  ok(/Project Beta lab \(beta\) is active/.test(a3) && !KEY.test(a3), "A3 · add-project: 'Project Beta lab (beta) is active.'", a3.slice(0, 200));
  const a4 = flashOf((await W.call("POST", "/control", { form: { action: "archive-project", projectKey: "beta" } })).text);
  const a5 = flashOf((await W.call("POST", "/control", { form: { action: "activate-project", projectKey: "beta" } })).text);
  ok(/Project beta archived/.test(a4) && /Project beta reactivated/.test(a5) && !KEY.test(a4 + a5), "A4 · archive and activate name the slug", `${a4.slice(0, 120)} | ${a5.slice(0, 120)}`);
}

// ---- B. the door's sentences and the Map's titles, one by one ----
{
  const W = await world();
  const t = (name, args, key = "two-owner-key") => W.mcp(name, { project: "sample", ...args }, key).then((r) => r.out || {});
  const words = (o) => sentences(o).map(([, s]) => s).join(" ¶ ");
  const ch = await t("changes", {});
  ok(/No version of sample yet/.test(ch.noVersion || "") && /Nothing changed in sample /.test(ch.note || ""), "B1 · changes: 'No version of sample yet', 'Nothing changed in sample'", words(ch).slice(0, 240));
  const se = await t("search", { q: "zebra" });
  ok(/Nothing in sample matches/.test(se.note || ""), "B2 · search: 'Nothing in sample matches'", se.note);
  const rd = await t("read", { ref: "goal:nope" });
  ok(!KEY.test(words(rd)), "B3 · read of a ref that is not there names no key", words(rd).slice(0, 200));
  const br = await t("brief", {});
  ok(/preview \{project: "sample"/.test(words(br)) && !KEY.test(words(br)), "B4 · brief's empty note: the call names project \"sample\"", words(br).slice(0, 240));
  const mi = await t("missing", {});
  const fills = (mi.items || []).map((x) => x.fill || "").filter(Boolean);
  ok(fills.length > 0 && fills.every((f) => /"project":"sample"/.test(f) && !KEY.test(f)), `B5 · missing: every fill call names "sample" (${fills.length} calls)`, fills[0]);
  const rv = await t("restore_version", { v: 1 });
  ok(/^sample has no version yet/.test(rv.note || ""), "B6 · restore_version with no version: 'sample has no version yet'", rv.note);
  let eq = await t("equip", { slug: "preset:weekly-review", v: 1 });
  if (eq.error === "unknown_version" && eq.latest) eq = await t("equip", { slug: "preset:weekly-review", v: eq.latest });   // the engine's version of the starter
  ok(eq.preview === true && / in sample$/.test(eq.line || "") && /seated on sample /.test(eq.reaches || "") && !KEY.test(eq.text || "") && /"project":"o2--sample"/.test(eq.next && eq.next.rest || "") && eq.project === "o2--sample" && eq.next.args.project === "o2--sample",
    "B7 · equip's preview: its line, reach and text name sample; its project, args and REST call keep the key (data sent as given)", JSON.stringify({ line: eq.line, reaches: eq.reaches, rest: eq.next && eq.next.rest, error: eq.error, note: eq.note }).slice(0, 300));
  for (const [path, re] of [["/map", /The map of sample\b/], ["/map/arch", /The architecture of sample\b/], ["/map/screens", /No screen yet|The screens of sample\b/]]) {
    const v = visible((await W.call("GET", `${path}?project=sample`)).text);
    ok(re.test(v) && !KEY.test(v), `B8 · ${path}: ${re.source.replace(/\\b/g, "")}, and no key in its text`, around(v) || v.slice(0, 160));
  }
  const sc = visible((await W.call("GET", "/map/screens?project=sample")).text);
  ok(/project: "?sample"?/.test(sc) || /project:\s*sample/.test(sc), "B9 · Screens' empty call names project sample", around(sc));
}

// ---- C. the sweep: every tool and the tabs, as the owner and the member ----
{
  const W = await world();
  const hits = [];
  const judge = (where, s) => { if (KEY.test(s)) hits.push(`${where}: ${around(s)}`); };
  const list = JSON.parse((await W.call("POST", "/mcp", { accept: "application/json", body: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).text);
  const tools = ((list.result && list.result.tools) || []).map((x) => x.name);
  const ARGS = { preview: { items: [{ kind: "goal", op: "upsert", data: { id: "g1", title: "Goal one", parent: null, dimensions: [] } }] }, read: { kind: "goal" },
    map: { plane: "screens" }, ask: { question: "what is the goal" }, search: { q: "goal" }, equip: { slug: "preset:weekly-review", v: 1 }, impact: { id: "T-1" } };
  for (const key of ["two-owner-key", "two-mem-key"]) for (const tl of tools.filter((x) => x !== "create_project")) {
    for (const args of [{ project: "sample" }, { project: "o2--nope" }, {}]) {
      const r = await W.mcp(tl, { ...args, ...(ARGS[tl] || {}) }, key);
      for (const [path, s] of sentences(r.out)) judge(`${tl} ${JSON.stringify(args)} ${path}`, s);
    }
  }
  const PAGES = ["/home", "/build", "/gtm", "/goals", "/decisions", "/map", "/map/arch", "/map/data", "/map/api", "/map/mcp", "/map/flows", "/map/deps", "/map/screens",
    "/versions", "/broadcast", "/control", "/missing", "/audit", "/audit?all=1", "/library", "/changes", "/profile", "/orgs"];
  for (const key of ["two-owner-key", "two-mem-key"]) for (const p of PAGES) {
    const r = await W.call("GET", `${p}${p.includes("?") ? "&" : "?"}project=sample`, { key });
    if (/^\s*</.test(r.text)) judge(`GET ${p}`, visible(r.text));
  }
  ok(tools.length > 20 && !hits.length, `C1 · ${tools.length} tools x 3 project args x 2 callers and ${PAGES.length} pages x 2: no sentence or page text names an o<N>-- key`, hits.slice(0, 6).join(" ;; "));
}

// ---- D. the refusals and glosses of src/core.js: slugs, and every suggested project accepted from the same caller ----
{
  const W = await world([["two-multi", "Max Two", "member", "two-multi-key", ["sample", "shop"]], ["two-shop", "Sol Two", "member", "two-shop-key", ["shop"]]],
    [{ id: 3, name: "Three", projects: ["solo"], people: [["three-owner", "Owner Three", "owner", "three-owner-key", []], ["three-ptn", "Pia Three", "partner", "three-ptn-key", []]] }]);
  const GOAL = [{ kind: "goal", op: "upsert", data: { id: "g-words", title: "Goal words", parent: null, dimensions: [] } }];
  const listOf = (note) => { const m = /one of \[([^\]]*)\]/.exec(String(note || "")); return m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : []; };
  // accepted(tool, args, key, list) -> the values of `list` the door refuses from that caller (each tried as `project`)
  const refusedOf = async (tool, args, key, list) => {
    const bad = [];
    for (const p of list) { const r = await W.mcp(tool, { ...args, project: p }, key); if (!r.out || /^project_(forbidden|required)$/.test(r.out.error || "")) bad.push(`${p}: ${(r.out && r.out.error) || r.status}`); }
    return bad;
  };
  const cases = [
    ["D1 · a read naming a project with no seat (resolveProject)", "brief", { project: "o2--shop" }, "two-mem-key", "project_forbidden", /^You hold no seat on "shop"\. Use `project`: one of \[sample\]\.$/],
    ["D2 · a write naming a project with no seat (doorProject)", "preview", { project: "o2--shop", items: GOAL }, "two-mem-key", "project_forbidden", /^You hold no seat on "shop"\. Use `project`: one of \[sample\]\.$/],
    ["D3 · an unnamed write by a member seated on two (project_required)", "preview", { items: GOAL }, "two-multi-key", "project_required", /^Add `project`: one of \[sample, shop\] — you hold seats on more than one project/],
    ["D4 · an unnamed write by the seatless owner of two projects (project_required)", "preview", { items: GOAL }, "two-owner-key", "project_required", /^Add `project`: one of \[sample, shop\] — this org holds more than one project/],
    ["D5 · a `project` that is not a string (projectArg)", "preview", { project: ["sample"], items: GOAL }, "two-multi-key", "project_forbidden", /^`project` is one project key, a string: one of \[sample, shop\]\.$/],
  ];
  for (const [label, tool, args, key, err, re] of cases) {
    const r = await W.mcp(tool, args, key), o = r.out || {}, list = listOf(o.note);
    const bad = list.length ? await refusedOf(tool, args, key, list) : ["no list"];
    ok(o.error === err && re.test(o.note || "") && !KEY.test(o.note || "") && !bad.length, `${label}: the note names slugs, and each one it suggests is accepted from that caller`, `${o.error} | ${o.note} | refused: ${bad.join("; ")}`);
  }
  // the readable default's note: a defaulted read by the seatless owner names the slugs it could read instead, each accepted
  const dr = await W.mcp("changes", {}, "two-owner-key"), dn = (dr.out && dr.out.projectNote) || sentences(dr.out).map(([, x]) => x).find((x) => /^Add `project`: one of \[/.test(x)) || "";
  const dl = listOf(dn), dbad = dl.length ? await refusedOf("changes", {}, "two-owner-key", dl) : ["no list"];
  ok(/^Add `project`: one of \[sample, shop\] to read another project; this reads "sample"/.test(dn) && !dbad.length, "D6 · a defaulted read's note names slugs, each accepted", `${dn} | refused: ${dbad.join("; ")}`);
  // the Partner fence: a seatless Partner's write in a one-project org names the project to ask a seat on by its slug
  const pt = (await W.mcp("preview", { items: GOAL }, "three-ptn-key")).out || {};
  ok(pt.error === "project_forbidden" && /ask the owner for a seat on "solo"\. Nothing was filed\.$/.test(pt.note || "") && pt.project === "o3--solo", "D7 · the Partner fence names the slug (its `project` field keeps the key: data)", JSON.stringify(pt).slice(0, 240));
  // whoami's projectGloss, one caller each (the seats' and the org's keys stay in `projects` / `writeProjects`: data)
  const gl = async (key) => ((await W.mcp("whoami", {}, key)).out || {});
  const [wm, wx, ws, wo, w3] = await Promise.all(["two-mem-key", "two-multi-key", "two-shop-key", "two-owner-key", "three-owner-key"].map(gl));
  ok(/^Your writes land in "sample" unless you name another `project`\.$/.test(wm.projectGloss || "") && JSON.stringify(wm.projects) === '["o2--sample"]', "D8 · one seat: 'Your writes land in \"sample\"' (its projects field keeps the key)", `${wm.projectGloss} | ${JSON.stringify(wm.projects)}`);
  ok(/^Your writes land in "shop" \(Pilot shop\) unless you name another `project`\.$/.test(ws.projectGloss || ""), "D9 · one seat whose name differs: the slug and the name", ws.projectGloss);
  ok(/^You hold seats on 2 projects \(sample, shop\) and none is active\. /.test(wx.projectGloss || "") && /any of your projects \(sample, shop\) is fine\.$/.test(wx.projectGloss || "") && !KEY.test(wx.projectGloss || ""), "D10 · two seats: the slugs, twice", wx.projectGloss);
  ok(/your writes can land in any of the org's 2 active projects \(sample, shop\)/.test(wo.projectGloss || "") && !KEY.test(wo.projectGloss || "") && JSON.stringify(wo.writeProjects) === '["o2--sample","o2--shop"]', "D11 · the seatless owner of two: the slugs (writeProjects keeps the keys)", `${wo.projectGloss} | ${JSON.stringify(wo.writeProjects)}`);
  ok(/^You are the owner: your writes land in "solo", the org's one project/.test(w3.projectGloss || ""), "D12 · the seatless owner of one: the slug", w3.projectGloss);
  // the slugs the glosses name are the ones the door takes: each gloss's projects filed into by that caller, by slug
  const gbad = [...(await refusedOf("preview", { items: GOAL }, "two-multi-key", ["sample", "shop"])), ...(await refusedOf("preview", { items: GOAL }, "two-owner-key", ["sample", "shop"])), ...(await refusedOf("preview", { items: GOAL }, "three-owner-key", ["solo"]))];
  ok(!gbad.length, "D13 · every slug a gloss names is accepted as `project` from that caller", gbad.join("; "));
  // the org-note sentence (orgNoteDefault): a declared home project of org 2 names its slug and its name
  const { orgNoteDefault } = await import(pathToFileURL(join(ENGINE, "src", "core.js")).href);
  ok(orgNoteDefault("o2--shop", [], "Pilot shop") === 'A note about the org rather than one project goes under "shop" (Pilot shop — the org\'s own project).' && orgNoteDefault("o2--sample", [], "Sample") === 'A note about the org rather than one project goes under "sample".'
    && orgNoteDefault(null, ["o2--sample", "o2--shop"]) === "A note about the org rather than one project: any of your projects (sample, shop) is fine.", "D14 · orgNoteDefault names a home project and a seat list by slug", orgNoteDefault("o2--shop", [], "Pilot shop"));
}

// ---- E. create_project (src/mcp.js) and the confirm form (src/confirm.js) ----
{
  const W = await world();
  const c1 = (await W.mcp("create_project", { key: "beta", name: "Beta lab" }, "two-owner-key")).out || {};
  const tipCall = /`missing` with project "([^"]+)"/.exec(c1.tip || "");
  const mi = tipCall ? (await W.mcp("missing", { project: tipCall[1] }, "two-owner-key")).out || {} : {};
  ok(c1.created === true && /^Project Beta lab \(beta\) is created and active\./.test(c1.note || "") && tipCall && tipCall[1] === "beta" && !mi.error && c1.project && c1.project.key === "o2--beta" && !KEY.test(`${c1.note} ${c1.tip}`),
    "E1 · create_project: 'Project Beta lab (beta) is created', the tip's `missing` call names \"beta\" and the door takes it (project.key keeps the key: data)", `${c1.note} | ${c1.tip} | missing: ${mi.error || "ok"}`);
  const c2 = (await W.mcp("create_project", { key: "beta", name: "Beta lab" }, "two-owner-key")).out || {};
  ok(c2.created === false && /^Project Beta lab \(beta\) already exists and is active: nothing new was created\.$/.test(c2.note || ""), "E2 · create_project again: 'already exists', by name and slug", c2.note);
  await W.call("POST", "/control", { form: { action: "archive-project", projectKey: "beta" } });
  const c3 = (await W.mcp("create_project", { key: "beta", name: "Beta lab" }, "two-owner-key")).out || {};
  ok(c3.reactivated === true && /^Project Beta lab \(beta\) was archived and is active again\.$/.test(c3.note || ""), "E3 · create_project on an archived project: 'was archived and is active again'", c3.note);
  const { partAsk } = await import(pathToFileURL(join(ENGINE, "src", "confirm.js")).href);
  const d = (n, p, tool = "file_contribution") => partAsk({ previewId: "P-0", tool, ready: n, project: p, text: "" }, { key: "k", until: "u" }).schema.properties.file.description;
  ok(d(3, "o2--sample") === "File 3 contributions into sample" && d(1, "alpha", "save_knowledge") === "Save 1 knowledge item in alpha" && d(2, null, "remove_knowledge") === "Remove 2 knowledge items from the org", "E4 · the confirm form's line names the slug ('File 3 contributions into sample'; org 1's bare key is its slug; no project: the org)", `${d(3, "o2--sample")} | ${d(1, "alpha")} | ${d(2, null)}`);
}

console.log(`\nproject-words-selftest: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
