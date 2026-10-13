// tools/smoke/s18-lists-broadcast.mjs — sprint 3, D2 · B7: a card kind lists on the tab it names, a card's own page, and
// Broadcast's publish and equip through the door. Self-contained: it adds its own project (s18) and its people (a member the
// admin gave the gtm access hat, a member without it, a Partner seated on s18), so it reads nothing an earlier case left.
//   L1 · the owner files GTM lists through preview, then file (claims, targets for the GTM team only, copy with no card yet, a
//        hidden claim, a kind that names Build); GET /gtm, the gtm tool and the GTM page carry the lists;
//        the checklist's gtm-lists count agrees with the screen; the Build page lists its kind; a tab no kind names has none
//   L2 · visibility: the hat member reads the targets, the member without it and the Partner do not; the hidden claim is
//        listed, counted and opened by nobody but the owner
//   L3 · the card page: GET /read?ref=card/<kind>/<id> draws the card (fields, source, confidence, as-of, who may read it);
//        a hidden card is the usual 404 (the old URL: s25-names)
//   L4 · publish and equip through the MCP: the member files a draft, publish previews (nothing filed) then publishes; equip
//        previews then equips; the shelf and the project's equipped list show it at once; the Partner is refused by the tool
//        and the REST twin; the Partner's shelf shows what their seat's project holds
import { smoke, expect, brief, http, mcp, html, ownerKey, control, personId, contributions, fileParts } from "./lib.mjs";

const TAG = String(process.env.S18_TAG || "").replace(/[^a-z0-9]/g, "");
const P = "s18" + TAG;
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
const LISTS = [
  { kind: "goal", op: "upsert", data: { id: "s18-root", title: "S18 sell the kit", dimensions: ["gtm"] } },
  { kind: "card_kind", op: "upsert", data: { key: "s18claim", label: "S18 Claims", tab: "gtm", reviewAfterDays: 30 } },
  { kind: "card_kind", op: "upsert", data: { key: "s18target", label: "S18 Targets", tab: "gtm", roleVisibility: ["gtm"] } },
  { kind: "card_kind", op: "upsert", data: { key: "s18copy", label: "S18 Copy", tab: "gtm" } },
  { kind: "card_kind", op: "upsert", data: { key: "s18note", label: "S18 Build notes", tab: "build" } },
  { kind: "card", op: "upsert", data: { kind: "s18claim", id: "flowzo", name: "S18 FlowZo onboards in a day", body: "**Boundary:** never claim a licence.", asOf: "2026-01-02", confidence: "confirmed", source: [{ kind: "url", ref: "https://example.com/s18", label: "the S18 story" }] } },
  { kind: "card", op: "upsert", data: { kind: "s18claim", id: "fresh", name: "S18 a fresh claim", body: "Measured last week.", asOf: new Date().toISOString().slice(0, 10), confidence: "direction" } },
  { kind: "card", op: "upsert", data: { kind: "s18claim", id: "hidden", name: "S18 hidden finance claim", body: "S18-SECRET", roleVisibility: ["finance"] } },
  { kind: "card", op: "upsert", data: { kind: "s18target", id: "acme", name: "S18 Acme Corp", body: "S18-TARGET head of ops", asOf: "2026-01-02" } },
  { kind: "card", op: "upsert", data: { kind: "s18note", id: "n1", name: "S18 build note", body: "a note Build lists" } },
];
const listsOf = (j) => ((j && j.lists && j.lists.lists) || []);
const keysOf = (j) => listsOf(j).map((l) => `${l.key}:${l.count}`).join(",");

smoke("lists: a card kind lists on the tab it names — GTM's claims, targets and copy; Build's notes; checklist and screen agree", async () => {
  await control({ action: "add-project", key: P, name: "S18" });
  q.g = await invite("S18 Gia", `gia${TAG}@s18.local`, "member", [P]);
  q.m = await invite("S18 Mo", `mo${TAG}@s18.local`, "member", [P]);
  q.pa = await invite("S18 Pat", `pat${TAG}@s18.local`, "partner", [P]);
  const gid = await personId(`gia${TAG}@s18.local`);
  await control([["action", "set-access-hats"], ["personId", gid], ["accessHat", "gtm"]]);
  await fileVia(ownerKey, LISTS);
  const r = await http("GET", `/gtm?project=${P}`, { key: ownerKey });
  const t = await mcp(ownerKey, "gtm", { project: P });
  // (D2b item 10: the tool's lists are the page's, each card cut to its row's fields)
  const refsOf = (L) => JSON.stringify(((L && L.lists) || []).map((k) => [k.key, k.count, k.href, (k.cards || []).map((c) => c.ref)]));
  expect(r.status === 200 && keysOf(r.json) === "s18claim:3,s18copy:0,s18target:1" && refsOf(r.json.lists) === refsOf(t.out.lists), () => `${r.status} ${keysOf(r.json)} · tool ${keysOf(t.out)}`);
  const claim = listsOf(r.json).find((l) => l.key === "s18claim");
  const fz = claim.cards.find((c) => c.id === "flowzo");
  expect(claim.due === 1 && fz.dueForReview && fz.summary === "Boundary: never claim a licence." && fz.href === "/read?ref=card/s18claim/flowzo", () => brief(claim));
  const page = await html(`/gtm?project=${P}`);
  expect(/data-region="lists"/.test(page.text) && /data-list="s18claim" data-cards="3" data-due="1"/.test(page.text) && /No s18 copy yet</.test(page.text), () => `GTM page ${page.status}`);
  const h = (await mcp(ownerKey, "missing", { project: P })).out;
  const it = (h.items || []).find((x) => x.id === "gtm-lists");
  const withCards = listsOf(r.json).filter((l) => l.count > 0).length;
  expect(it && it.have === withCards && it.want === listsOf(r.json).length, () => `checklist ${brief(it)} vs screen ${withCards} of ${listsOf(r.json).length}`);
  const build = await html(`/build?project=${P}`), dec = await html(`/decisions?project=${P}`);
  expect(/data-region="lists"/.test(build.text) && /data-card="s18note\/n1"/.test(build.text) && !/data-region="lists"/.test(dec.text), () => `build ${build.status} decisions ${dec.status}`);
  return `GTM lists ${keysOf(r.json)} (claims due 1), tool == REST, the page draws them; the checklist's gtm-lists ${it.have} of ${it.want} = the screen; Build lists its kind, Decisions none`;
});

smoke("lists: role visibility and access hats — the hat member reads the targets, the member and the Partner do not; the hidden claim is the owner's alone", async () => {
  const g = (await http("GET", `/gtm?project=${P}`, { key: q.g.key })).json;
  const m = (await http("GET", `/gtm?project=${P}`, { key: q.m.key })).json;
  const pa = (await mcp(q.pa.key, "gtm", { project: P })).out;
  const pm = await html(`/gtm?project=${P}`, q.m.key);
  expect(keysOf(g) === "s18claim:2,s18copy:0,s18target:1" && keysOf(m) === "s18claim:2,s18copy:0" && keysOf(pa) === keysOf(m)
    && !/S18-SECRET|hidden finance|Acme/.test(JSON.stringify(m.lists) + JSON.stringify(pa.lists) + pm.text), () => `hat ${keysOf(g)} · member ${keysOf(m)} · partner ${keysOf(pa)}`);
  return `the hat member ${keysOf(g)}; the member and the Partner ${keysOf(m)}; nothing hidden named on their page`;
});

smoke("lists: a card's own page on the new path; a hidden card is the usual 404", async () => {
  const pg = await html(`/read?ref=card/s18claim/flowzo&project=${P}`, q.m.key);
  expect(pg.status === 200 && /data-region="card"/.test(pg.text) && /data-confidence="confirmed"/.test(pg.text) && /data-as-of="2026-01-02"/.test(pg.text) && /due for review/.test(pg.text)
    && /the S18 story/.test(pg.text) && /Everyone seated on this project/.test(pg.text) && /never claim a licence/.test(pg.text), () => `card page ${pg.status}`);
  const hid = await html(`/read?ref=card/s18target/acme&project=${P}`, q.m.key), mine = await html(`/read?ref=card/s18target/acme&project=${P}`, q.g.key);
  expect(hid.status === 404 && !/Acme|S18-TARGET/.test(hid.text) && mine.status === 200 && /Only who holds Go-to-market/.test(mine.text),
    () => `hidden ${hid.status} · hat ${mine.status}`);
  return "the card page draws its fields, source, confidence, as-of, due mark and who may read it; a target is 404 to the member and open to the hat member";
});

// sprint 4, F1 (P3's fault 6: a copy card could not name the claim that backs it): a card's refs are cards of its OWN project
smoke("refs: a card names the cards it relies on; another project's card is refused with the near match; read and the page show the links; the list reads nothing new", async () => {
  // another project's card with a near name: project smoke holds a s18claim kind and a card flowzo-smoke
  await mcp(ownerKey, "save_knowledge", { previewId: (await mcp(ownerKey, "preview", { project: "smoke", items: [{ kind: "card_kind", op: "upsert", data: { key: "s18claim", label: "Smoke claims" } },
    { kind: "card", op: "upsert", data: { kind: "s18claim", id: "flowzo-smoke", name: "Smoke's own FlowZo" } }] })).out.previewId,
    items: [{ kind: "card_kind", op: "upsert", data: { key: "s18claim", label: "Smoke claims" } }, { kind: "card", op: "upsert", data: { kind: "s18claim", id: "flowzo-smoke", name: "Smoke's own FlowZo" } }] });
  const across = await mcp(ownerKey, "preview", { project: P, items: [{ kind: "card", op: "upsert", data: { kind: "s18copy", id: "dm", name: "S18 the DM", refs: ["card/s18claim/flowzo-smoke"] } }] });
  const it = ((across.out && across.out.items) || [])[0] || {};
  const why = (it.reasons || []).join(" ");
  expect(!across.isError && it.verdict === "needs" && it.needs.error === "missing_card" && /near card\/s18claim\/flowzo \(S18 FlowZo onboards in a day\)/.test(why) && !/Smoke's own/.test(JSON.stringify(across.out)),
    () => `across: ${brief(it)}`);
  await fileVia(ownerKey, [{ kind: "card", op: "upsert", data: { kind: "s18copy", id: "dm", name: "S18 the DM", body: "Hi, we onboard in a day.", refs: ["card/s18claim/flowzo", "card/s18claim/hidden"] } }]);
  const ro = (await mcp(ownerKey, "read", { project: P, ref: "card/s18copy/dm" })).out, rm = (await mcp(q.m.key, "read", { project: P, ref: "card/s18copy/dm" })).out;
  expect(JSON.stringify(ro.item.refs) === JSON.stringify([{ ref: "card/s18claim/flowzo", title: "S18 FlowZo onboards in a day", href: "/read?ref=card/s18claim/flowzo" }, { ref: "card/s18claim/hidden", title: "S18 hidden finance claim", href: "/read?ref=card/s18claim/hidden" }])
    && ro.links.some((l) => l.rel === "relies-on" && l.ref === "card/s18claim/flowzo") && rm.item.refs.map((x) => x.ref).join() === "card/s18claim/flowzo" && !/hidden finance|S18-SECRET/.test(JSON.stringify(rm)),
    () => `owner ${brief(ro.item && ro.item.refs)} · member ${brief(rm.item && rm.item.refs)}`);
  const pg = await html(`/read?ref=card/s18copy/dm&project=${P}`, q.m.key);
  expect(pg.status === 200 && /data-field="relies-on"/.test(pg.text) && /data-ref="card\/s18claim\/flowzo"/.test(pg.text) && /S18 FlowZo onboards in a day/.test(pg.text) && !/hidden finance/.test(pg.text), () => `card page ${pg.status}`);
  const copy = listsOf((await http("GET", `/gtm?project=${P}`, { key: ownerKey })).json).find((l) => l.key === "s18copy") || {};
  expect(copy.count === 1 && !("refs" in ((copy.cards || [])[0] || {})), () => `the list: ${brief(copy)}`);
  return "smoke's flowzo-smoke refused for s18 with s18's own near match (flowzo); the DM's refs read as links, the member without the hidden claim; its page draws Relies on; the copy list's row carries no refs";
});

smoke("broadcast through the door: publish and equip preview first, then file; the shelf shows it at once; a Partner is refused by tool and twin", async () => {
  const slug = `s18-kit${TAG}`.slice(0, 40);
  const d = await fileVia(q.m.key, [{ contribution: { lane: "leader", kind: "item", what: "S18 the kit", why: "a skill the S18 team uses", touches: ["skill"], gapRefs: [`item/${slug}`], proof: "https://example.com/s18-kit" } }]);
  const id = ((d.items || []).find((x) => x.filed && /^T-/.test(String(x.filed.id || ""))) || {}).filed.id;
  expect(/^T-/.test(id || ""), () => brief(d.items));
  const before = (await contributions(ownerKey, P, { eval: true })).length;
  const pv = await mcp(q.m.key, "publish", { id });
  const after = (await contributions(ownerKey, P, { eval: true })).length;
  expect(!pv.isError && pv.out.preview === true && pv.out.v === 1 && /publish \{id: /.test(pv.out.text) && after === before, () => `preview ${brief(pv.out)} · filed ${after - before}`);
  const pub = await mcp(q.m.key, "publish", { id, confirm: true });
  const eqv = await mcp(q.g.key, "equip", { slug, v: 1, project: P });
  const eq = await mcp(q.g.key, "equip", { slug, v: 1, project: P, confirm: true });
  expect(!pub.isError && pub.out.v === 1 && !eqv.isError && eqv.out.preview === true && !eq.isError && eq.out.project === P, () => brief([pub.out, eqv.out, eq.out]));
  const b = (await mcp(q.m.key, "broadcast", { project: P })).out;
  expect((b.regions.shelf || []).some((c) => c.slug === slug) && (b.regions["equipped-here"] || []).some((x) => x.slug === slug && x.v === 1), () => brief(b.regions && b.regions.shelf));
  const pt = await mcp(q.pa.key, "equip", { slug, v: 1, project: P, confirm: true });
  const pr = await http("POST", "/broadcast/publish", { key: q.pa.key, body: { id, confirm: true } });
  const ps = (await mcp(q.pa.key, "broadcast", { project: P })).out;
  expect(pt.isError && pt.out.error === "partner_refused" && pr.status === 403 && pr.json.error === "partner_refused" && (ps.regions.shelf || []).some((c) => c.slug === slug),
    () => `partner tool ${brief(pt.out)} · twin ${pr.status} · shelf ${brief((ps.regions.shelf || []).map((c) => c.slug))}`);
  return `${id} previewed (nothing filed), published v1; equip previewed then filed into ${P}; the shelf and the equipped list show it; the Partner refused by tool and twin, and sees their seat's shelf`;
});
