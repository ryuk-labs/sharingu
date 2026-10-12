// tools/smoke/s7-broadcast.mjs — Broadcast interactive and the starter pack (sprint 2; the owner's MCQs of 2026-09-30 and
// 2026-10-01), through the real door. Builds on s0/s1: project smoke with the goals ship-the-loop, file-it, see-it.
//   B1 · GET /broadcast/live: the week's landed contributions of the project as people, goals (the unaligned row, a ref not
//        in the tree) and dots; the page draws the picture; the poll (?since=) answers only what landed after
//   B2 · the starter shelf: every built-in item of the pack (its own count) on GET /broadcast (JSON and page), the broadcast tool and the Map's MCP
//        view, and each item's own page
//   B3 · Equip a starter item into smoke (a signed-in browser's press): the copy is a doc the project's AI reads (doc,
//        library), the item shows on the shelf (equipped-here, workspace-shelf) pinned to its version; a second press is
//        already_current, another version unknown_version
//   B4 · refused or only previewed, nothing filed (sprint 3 D2: publish and equip go through the door, previewed first): a
//        Partner's press and the Partner's equip tool (partner_refused), the read-only credential (read_only_credential), a
//        key in the URL (401), a Bearer key and the equip tool with no confirm (the preview, nothing written)
import { smoke, expect, brief, s, http, mcp, html, ownerKey, readOnlyOf, BASE, contribute, kread, contributions, sessionPath, unbased } from "./lib.mjs";
import { PRESETS } from "../../src/presetdata.js";

const P = "smoke";
// raw(method, path, headers, body) — a request with exactly these headers (a browser's cookie and origin, no bearer)
async function raw(method, path, headers = {}, body) {
  const r = await fetch(BASE + await sessionPath(headers.cookie, path), { method, headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await unbased(await r.text());   // the org base off its paths (sprint 7, 7.4: lib.mjs unbased)
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text, location: r.headers.get("location") };
}
const signIn = async (email, key) => {
  const r = await http("POST", "/login", { body: { email, password: key, device: "smoke-s7" } });
  if (!r.json || !r.json.token) throw new Error(`POST /login ${email}: ${r.status} ${brief(r.json)}`);
  return r.json.token;
};
const press = (tok, body) => raw("POST", "/broadcast/equip", { cookie: `__Host-ar_session=${encodeURIComponent(tok)}`, origin: BASE, "sec-fetch-site": "same-origin" }, body);
const live = async (q = "") => (await http("GET", `/broadcast/live?project=${P}${q}`, { key: ownerKey })).json || {};
const bjson = async (key = ownerKey) => (await http("GET", `/broadcast?project=${P}`, { key })).json || {};
// equips() -> how many equip filings the project holds, off the ledger's own read (each case counts before and after its press)
const equips = async () => (await contributions(ownerKey, P)).filter((x) => x.kind === "equip").length;   // D5: read {kind: "contribution"}, every page

smoke("B1: GET /broadcast/live answers the week's landed contributions as people, goals and dots; the poll answers only what is new", async () => {
  const file = (what, goalRef) => contribute(ownerKey, { project: P, lane: "leader", kind: "note", what, why: "the live picture's smoke", ...(goalRef ? { goalRef } : {}) });
  for (const [w, g] of [["s7 one", "file-it"], ["s7 two", "file-it"], ["s7 three", "see-it"], ["s7 four", null], ["s7 five", "no-such-goal-s7"]]) {
    const f = await file(w, g); expect(!f.isError && /^T-/.test(f.out.id), () => `file ${w}: ${brief(f.out)}`);
  }
  const j = await live();
  const g = (ref) => (j.goals || []).find((x) => x.ref === ref) || {};
  const un = (j.goals || []).find((x) => x.ref === null) || {};
  expect(j.project && j.project.key === P && j.days === 7 && j.limit === 200 && Array.isArray(j.dots) && j.dots.length >= 5
    && g("file-it").n >= 3 && g("file-it").known === true && g("file-it").title === "file it" && g("see-it").n >= 1
    && g("no-such-goal-s7").known === false && un.n >= 1 && un.title === "Unaligned"
    && (j.people || []).length >= 1 && j.people.every((p) => p.id && p.name && p.initials && p.tone && p.n >= 1)
    && j.dots.every((d) => /^T-/.test(d.id) && d.by && d.at) && j.dots.some((d) => d.what === "s7 four" && d.goal === null),
    () => `live: ${brief({ n: (j.dots || []).length, goals: j.goals, people: (j.people || []).length })}`);
  // the page draws it: the region, a curve per person and goal, a dot per contribution linking to its filing, the list
  const page = await html(`/broadcast?project=${P}`);
  expect(page.status === 200 && /data-region="live-picture"/.test(page.text) && /<svg class="lv-svg"/.test(page.text) && /class="lv-c"/.test(page.text)
    && (page.text.match(/class="lv-d[" ]/g) || []).length >= 5 && /href="\/contribution\/T-/.test(page.text) && /class="lv-list"/.test(page.text) && /id="lv-data"/.test(page.text),
    `GET /broadcast (page): ${page.status}, the live picture not drawn`);
  // the poll: from the newest seen, nothing new but that one; one more filing comes back alone, poll:true
  const p0 = await live(`&since=${encodeURIComponent(j.at)}`);
  const f6 = await file("s7 six", "see-it");
  const p1 = await live(`&since=${encodeURIComponent(j.at)}`);
  expect(p0.poll === true && (p0.dots || []).every((d) => d.at >= j.at) && p1.poll === true && (p1.dots || []).some((d) => d.id === f6.out.id) && p1.dots.length <= 2 && p1.at >= j.at,
    () => `poll: before ${brief(p0.dots)} · after ${brief(p1.dots)}`);
  s.liveAt = p1.at;
  return `${j.dots.length} dots from ${j.people.length} person(s): file-it ${g("file-it").n}, see-it ${g("see-it").n}, a ref not in the tree, unaligned ${un.n}; the poll brought back only ${f6.out.id}`;
});

smoke("B2: the starter shelf: every built-in item of the pack on GET /broadcast, the broadcast tool, the Map's MCP view and each item's page", async () => {
  const j = await bjson();
  const st = (j.regions || {})["starter-shelf"] || [];
  const kinds = st.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] || 0) + 1 }), {});
  const N = PRESETS.length, want = PRESETS.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] || 0) + 1 }), {});
  expect(st.length === N && kinds.agent === want.agent && kinds.workflow === want.workflow && kinds.skill === want.skill && j.stamp.counts.starter === N
    && st.every((c) => /^[a-z0-9-]{2,40}$/.test(c.slug) && c.title && c.purpose && c.v >= 1 && c.equipSlug === "preset:" + c.slug && c.href === "/broadcast/starter/" + c.slug && c.here && c.can),
    () => `starter-shelf: ${brief(st.map((c) => c.slug))} ${brief(kinds)}`);
  const t = await mcp(ownerKey, "broadcast", { project: P });
  expect(!t.isError && ((t.out.regions || {})["starter-shelf"] || []).length === N, () => `broadcast tool: ${brief(t.out).slice(0, 200)}`);
  const page = await html(`/broadcast?project=${P}`);
  expect(/data-region="starter-shelf"/.test(page.text) && (page.text.match(/data-preset="/g) || []).length === N && /value="preset:frontend"/.test(page.text)
    && /data-button="equip" data-door="POST \/broadcast\/equip"/.test(page.text), "the page draws no starter shelf with its Equip");
  const mp = await http("GET", `/map/mcp?project=${P}`, { key: ownerKey });
  expect(mp.status === 200 && ((mp.json.regions || {})["global-presets"] || []).length === N, () => `GET /map/mcp: ${mp.status} ${brief((mp.json.regions || {})["global-presets"])}`);
  const one = await http("GET", `/broadcast/starter/frontend?project=${P}`, { key: ownerKey });
  const onePage = await html(`/broadcast/starter/frontend?project=${P}`);
  const none = await http("GET", `/broadcast/starter/no-such-item?project=${P}`, { key: ownerKey });
  s.fv = (st.find((c) => c.slug === "frontend") || {}).v; s.qv = (st.find((c) => c.slug === "qa-verify") || {}).v;   // the starter items' versions (the engine's own)
  expect(one.status === 200 && one.json.kind === "agent" && /# Frontend agent/.test(one.json.body) && one.json.calls.includes("preview")
    && onePage.status === 200 && /data-region="starter-body"/.test(onePage.text) && none.status === 404 && none.json.error === "unknown_item",
    () => `GET /broadcast/starter/frontend: ${one.status} · page ${onePage.status} · unknown ${none.status}`);
  return `${N} items (${want.agent} agents, ${want.workflow} workflows, ${want.skill} skills: the pack's own count) on the JSON, the tool, the page and GET /map/mcp's global-presets; frontend's page and its JSON body; an unknown slug 404`;
});

smoke("B3: Equip a starter item into smoke: its copy is a doc the project's AI reads, and it shows on the shelf pinned to its version", async () => {
  const tok = await signIn((await http("GET", "/whoami", { key: ownerKey })).json.email, ownerKey);
  const before = await equips();
  const r = await press(tok, { slug: "preset:frontend", v: s.fv, project: P });
  expect(r.status === 200 && /^T-/.test(r.json.id) && r.json.slug === "preset:frontend" && r.json.v === s.fv && r.json.project === P && r.json.from === null && r.json.doc === "starter/frontend.md" && /^T-/.test(r.json.knowledge || ""),
    () => `equip: ${r.status} ${brief(r.json)}`);
  // the copy: read reads it and lists it (D5), through the project's own door
  const d = await kread(ownerKey, { project: P, ref: "doc/starter/frontend.md" });
  const lib = await kread(ownerKey, { project: P, kind: "doc", limit: 100 });
  const docText = d.out && d.out.item ? d.out.item.body : JSON.stringify(d.out);
  expect(!d.isError && /Frontend agent/.test(docText) && /`preview \{/.test(docText) && JSON.stringify(lib.out).includes("starter/frontend.md"),
    () => `read: ${brief(d.out).slice(0, 160)} · list: ${brief(lib.out).slice(0, 200)}`);
  // the shelf: equipped-here (source starter, its doc), the card current, the Map's workspace-shelf and global-presets
  const j = await bjson();
  const held = ((j.regions || {})["equipped-here"] || []).find((h) => h.slug === "frontend") || {};
  const card = ((j.regions || {})["starter-shelf"] || []).find((c) => c.slug === "frontend") || {};
  const mp = (await http("GET", `/map/mcp?project=${P}`, { key: ownerKey })).json || {};
  const ws = ((mp.regions || {})["workspace-shelf"] || []).find((h) => h.slug === "frontend");
  const gp = ((mp.regions || {})["global-presets"] || []).find((c) => c.slug === "frontend") || {};
  expect(held.source === "starter" && held.v === s.fv && held.state === "current" && held.doc === "starter/frontend.md" && held.href === `/contribution/${r.json.id}`
    && card.here.state === "current" && card.here.v === s.fv && card.can.equip === false && ws && gp.here && gp.here.state === "current" && (await equips()) === before + 1,
    () => `shelf: held ${brief(held)} · card ${brief(card.here)} · map ${brief(ws)} ${brief(gp.here)}`);
  const page = await html(`/broadcast?project=${P}`);
  expect(/data-held="frontend" data-source="starter"/.test(page.text) && /Equipped on Smoke/.test(page.text), "the page does not show the equipped starter item");
  // the same version again is already_current; another version is unknown_version; nothing more filed
  const again = await press(tok, { slug: "preset:frontend", v: s.fv, project: P });
  const wrong = await press(tok, { slug: "preset:frontend", v: s.fv + 1, project: P });
  const unknown = await press(tok, { slug: "preset:no-such-item", v: 1, project: P });
  expect(again.status === 409 && again.json.error === "already_current" && wrong.status === 404 && wrong.json.error === "unknown_version" && wrong.json.latest === s.fv
    && unknown.status === 404 && unknown.json.error === "unknown_item" && (await equips()) === before + 1,
    () => `again ${again.status} ${brief(again.json)} · v2 ${wrong.status} · unknown ${unknown.status}`);
  s.starterTok = tok;
  return `${r.json.id} equips frontend v${s.fv} into smoke, its copy starter/frontend.md (ledger ${r.json.knowledge}) read and listed by read; equipped-here, the card and the Map's two regions agree; again 409, v${s.fv + 1} 404, an unknown slug 404`;
});

smoke("B4: refused or previewed, nothing filed: a Partner's press and tool, the read-only credential, a key in the URL; a Bearer key and the equip tool preview first", async () => {
  const add = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", "Smoke S7 Partner"], ["email", "s7partner@smoke.local"], ["role", "partner"], ["projectKey", P]] });
  const pkey = (add.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(add.status === 200 && pkey, `add a partner: ${add.status}`);
  const before = await equips();
  const ptok = await signIn("s7partner@smoke.local", pkey);
  const part = await press(ptok, { slug: "preset:qa-verify", v: s.qv, project: P });
  const ro = await raw("POST", "/broadcast/equip", { authorization: "Bearer " + readOnlyOf(ownerKey) }, { slug: "preset:qa-verify", v: s.qv, project: P });
  const inUrl = await raw("POST", `/broadcast/equip?k=${ownerKey}`, {}, { slug: "preset:qa-verify", v: s.qv, project: P });
  const bearer = await raw("POST", "/broadcast/equip", { authorization: "Bearer " + ownerKey }, { slug: "preset:qa-verify", v: s.qv, project: P });
  const tool = await mcp(ownerKey, "equip", { slug: "preset:qa-verify", v: s.qv, project: P });
  const ptool = await mcp(pkey, "equip", { slug: "preset:qa-verify", v: s.qv, project: P, confirm: true });
  // the partner's own read shows every Equip disabled with the reason
  const pj = await bjson(pkey);
  const pcards = (pj.regions || {})["starter-shelf"] || [];
  expect(part.status === 403 && part.json.error === "partner_refused" && ro.status === 403 && ro.json.error === "read_only_credential" && inUrl.status === 401
    && bearer.status === 200 && bearer.json.preview === true && !tool.isError && tool.out.preview === true && /equip \{slug: "preset:qa-verify"/.test(tool.out.text || "")
    && ptool.isError && ptool.out.error === "partner_refused" && pcards.length === PRESETS.length && pcards.every((c) => c.can.equip === false && /Partner/.test(c.can.reason || ""))
    && (await equips()) === before && !((await bjson()).regions["equipped-here"] || []).some((h) => h.slug === "qa-verify"),
    () => `partner ${part.status} ${brief(part.json)} · read-only ${ro.status} ${brief(ro.json)} · ?k= ${inUrl.status} · bearer ${bearer.status} ${brief(bearer.json).slice(0, 80)} · tool ${brief(tool.out).slice(0, 80)} · partner's tool ${brief(ptool.out).slice(0, 80)} · partner's cards ${brief(pcards.map((c) => c.can.reason)).slice(0, 120)}`);
  return "partner 403 partner_refused, by press and by the equip tool (every card disabled with its reason); read-only 403 read_only_credential, ?k= 401; a Bearer key and the equip tool with no confirm answer the preview; nothing filed";
});
