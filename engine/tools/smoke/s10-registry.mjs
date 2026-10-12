// tools/smoke/s10-registry.mjs — sprint 3, B1: the registry, through the real door. Builds on s0 (project smoke, the member
// seated on it, the outsider seated nowhere).
//   · a card kind with a tab, and a card with asOf and confidence, read back through read, and drawn
//     on the card's page (the kind's label, a quiet chip and a mono date); a doc with both on its page (a script still gets
//     the markdown);
//   · a contribution with source, depends, open and next (and the GTM four) read back through read and drawn on
//     its page, every depends link opening a page that answers 200;
//   · a bad confidence, a bad next.by and an 11th source refused, naming the field; nothing filed;
//   · formats: the list and one kind, to the owner, a member and a person with no seat, through the tool and GET /formats;
//   · a preview then file call carrying 300 KB of bodies refused too_large, naming the 256 KB cap.
import { smoke, expect, brief, s, http, mcp, html, ownerKey, toolsList, kwrite, kread, contribute, readTx, contributions } from "./lib.mjs";

const P = "smoke";
const write = async (key, ops) => (await kwrite(key, { project: P, ops })).out;
const bytes = (v) => Buffer.byteLength(JSON.stringify(v, null, 2));

smoke("registry: a card kind's tab, a card's asOf and confidence, read back and on the card's page", async () => {
  const w = await write(ownerKey, [{ kind: "card_kind", op: "upsert", data: { key: "s10-claim", label: "S10 Claims", tab: "gtm" } },
    { kind: "card", op: "upsert", data: { kind: "s10-claim", id: "s10-c1", name: "Teams file in ten minutes", body: "Measured on five teams.", asOf: "2026-09-30", confidence: "direction" } },
    { kind: "doc", op: "upsert", data: { path: "gtm/s10-positioning.md", title: "S10 positioning", body: "# Positioning\n\nWho we serve first.", asOf: "2026-09-28", confidence: "proposal" } }]);
  expect(!w.error && w.written === 3, () => brief(w));
  const c = (await kread(ownerKey, { project: P, kind: "card", id: "s10-claim|s10-c1" })).out.item || {};
  const k = (await kread(ownerKey, { project: P, kind: "card_kind", id: "s10-claim" })).out.item || {};
  const pc = ((await kread(ownerKey, { project: P, ref: "card/s10-claim/s10-c1" })).out || {}).item || {};   // D5: a card reads by read {ref: card/<kind>/<id>}
  expect(c.asOf === "2026-09-30" && c.confidence === "direction" && k.tab === "gtm" && pc.confidence === "direction" && pc.tab === "gtm" && pc.kindLabel === "S10 Claims",
    () => brief([c, k, pc]));
  // sprint 3 D2: the card's page is on the new path (GET /read?ref=card/<kind>/<id>); D5: the old URL is gone (s25-names)
  const page = await html(`/read?ref=card/s10-claim/s10-c1&project=${P}`);
  expect(page.status === 200 && /data-region="card"/.test(page.text) && /data-confidence="direction"/.test(page.text) && /data-as-of="2026-09-30"/.test(page.text) && /data-field="kind"[^>]*>[\s\S]{0,80}S10 Claims/.test(page.text)
    , () => `card page ${page.status}: ${page.text.slice(0, 300)}`);
  const doc = await html(`/doc/gtm/s10-positioning.md?project=${P}`), md = await http("GET", `/doc/gtm/s10-positioning.md?project=${P}`, { key: ownerKey });
  expect(doc.status === 200 && /data-region="doc"/.test(doc.text) && /data-confidence="proposal"/.test(doc.text) && /as of 2026-09-28/.test(doc.text) && md.status === 200 && md.text.startsWith("# Positioning"),
    () => `doc page ${doc.status}, markdown ${md.status}: ${md.text.slice(0, 80)}`);
  const plain = await html(`/doc/start-here.md?project=${P}`);
  expect(plain.status === 200 && /data-region="doc"/.test(plain.text) && !/data-confidence=/.test(plain.text), `start-here page ${plain.status}`);
  return "card kind tab gtm; card direction as of 2026-09-30 on read and its page; the doc's page shows proposal as of 2026-09-28; GET /doc to a script is still markdown; no chip when neither is filed";
});

smoke("registry: a contribution's source, depends, open and next, read back and on its page, every depends link resolving", async () => {
  const goal = ((await kread(ownerKey, { project: P, kind: "goal" })).out.items || [])[0];
  const w = await write(ownerKey, [{ kind: "node", op: "upsert", data: { id: "screen:s10-pricing", type: "screen", name: "S10 Pricing", data: { surface: "s10-web" } } },
    { kind: "question", op: "upsert", data: { qid: "Q-s10-1", question: "Per seat or per project?", options: [{ what: "Per seat" }, { what: "Per project" }] } }]);
  expect(!w.error && goal && s.first, () => brief([w, goal, s.first]));
  const depends = ["screen:s10-pricing", `goal/${goal.id}`, "q/Q-s10-1", s.first];
  const body = { project: P, lane: "gtm", kind: "outreach", what: "S10 annual plan email", why: "The waitlist asked for yearly billing.", touches: ["campaign:s10"],
    proof: "https://example.com/s10/campaign", expected: "40 replies", audience: "the waitlist's founders", claim: "two months free", channel: "email", experiment: "does a yearly price lift sign-ups?",
    source: [{ kind: "url", ref: "https://example.com/s10/notes", label: "the call notes" }, { kind: "commit", ref: "4f2a9c1" }, { kind: "file", ref: "docs/s10.md" }],
    depends, open: ["the monthly toggle copy"], next: { what: "review the annual copy", who: "member@smoke.local", by: "2026-10-15" } };
  const f = (await contribute(s.member.key, body)).out;
  expect(f.id && !f.error, () => brief(f));
  s.s10tx = f.id;
  const r = (await readTx(s.member.key, f.id, P)).out;
  expect(r.source.length === 3 && r.depends.join() === depends.join() && r.open[0] === "the monthly toggle copy" && r.next.by === "2026-10-15" && r.next.who === "member@smoke.local"
    && r.audience === "the waitlist's founders" && r.next_by === "2026-10-15" && r.shape === undefined, () => brief(r));
  const page = await html(`/contribution/${f.id}?page=1`);
  const t = page.text;
  expect(page.status === 200 && /data-field="next"/.test(t) && /review the annual copy/.test(t) && /by 2026-10-15/.test(t) && /data-field="source"/.test(t) && /the call notes/.test(t)
    && /data-field="open"/.test(t) && /Still open/.test(t) && /data-field="depends"/.test(t) && /Experiment/.test(t), () => `page ${page.status}: ${t.slice(0, 200)}`);
  const hrefs = [...t.matchAll(/<a class="fl-link" href="([^"]+)" data-depends="([a-z]+)"/g)].map((m) => [m[2], m[1].replace(/&amp;/g, "&")]);
  expect(hrefs.length === 4, () => `depends links: ${brief(hrefs)}`);
  const opened = [];
  for (const [form, href] of hrefs) { const h = await html(href + (href.includes("?") ? "&" : "?") + `project=${P}`); opened.push(`${form} ${h.status}`); expect(h.status === 200, () => `${form} ${href} -> ${h.status}`); }
  return `${f.id}: 3 sources, 4 depends, 1 open, next by 2026-10-15; on its page, each depends link answers: ${opened.join(", ")}`;
});

smoke("registry: a bad confidence, a bad next.by and an 11th source are refused, naming the field; nothing filed", async () => {
  const w = await write(ownerKey, [{ kind: "card", op: "upsert", data: { kind: "s10-claim", id: "s10-c2", name: "x", confidence: "sure" } }]);
  const e = (w.errors || [])[0] || {};
  expect(w.error === "invalid_ops" && e.error === "bad_field" && /data\.confidence/.test(e.note) && e.formats && e.formats.kind === "card", () => brief(w));
  const base = { project: P, lane: "leader", kind: "note", what: "s10 refused", why: "a bad field" };
  const nb = await contribute(s.member.key, { ...base, next: { what: "x", by: "next week" } });
  const ns = await contribute(s.member.key, { ...base, source: Array.from({ length: 11 }, (_, i) => ({ kind: "url", ref: `https://example.com/${i}` })) });
  // D5: a contribution's bad field is the preview's needs : file files nothing
  const { project: _p, ...one } = base;
  const rest = await http("POST", "/preview", { key: s.member.key, body: { project: P, items: [{ contribution: { ...one, next: { what: "x", by: "2026-02-30" } } }] } });
  const nd = (r) => (((r.preview || {}).items || [])[0] || {}).needs || {};
  const rn = (((rest.json || {}).items || [])[0] || {}).needs || {};
  expect(nb.isError && nb.verdict === "needs" && nd(nb).field === "next.by" && nd(nb).hint && nd(nb).example && nd(ns).field === "source" && /at most 10/.test(nd(ns).hint)
    && rest.status === 200 && rn.field === "next.by", () => brief([nd(nb), nd(ns), rest.json]));
  expect(!(await contributions(s.member.key, P, { eval: true })).some((x) => x.what === "s10 refused"), "a refused contribution was filed");
  return `bad_field data.confidence (preview needs), next.by (preview needs, tool and POST /preview), source (11th); nothing filed`;
});

smoke("registry: formats, the list and one kind, to anyone signed in (no seat needed), tool == GET /formats", async () => {
  const names = await toolsList(ownerKey);
  expect(names.includes("formats"), "tools/list lacks formats");
  const list = (await mcp(s.outsider.key, "formats", {})).out, one = (await mcp(s.member.key, "formats", { kind: "card" })).out, sh = (await mcp(ownerKey, "formats", { shape: "gtm" })).out;
  const rl = await http("GET", "/formats", { key: s.outsider.key }), rk = await http("GET", "/formats?kind=card", { key: s.member.key }), bad = await http("GET", "/formats?shape=sales", { key: ownerKey });
  expect(list.kinds.length === 12 && list.shapes.length === 6 && one.fields.some((x) => x.name === "confidence") && one.example.kind === "card" && one.shows[0].region === "card"
    && sh.fields.some((x) => x.name === "experiment") && JSON.stringify(rl.json) === JSON.stringify(list) && JSON.stringify(rk.json) === JSON.stringify(one) && bad.status === 404 && bad.json.error === "unknown_shape",
    () => brief([list, one, rl.status, rk.status, bad.json]));
  const anon = await http("GET", "/formats");
  expect(anon.status === 401, `GET /formats with no credential: ${anon.status}`);
  return `the list ${bytes(list)} bytes, card ${bytes(one)}, gtm ${bytes(sh)}; the seatless outsider reads it; no credential 401; unknown_shape 404`;
});

smoke("registry: a preview then file call carrying 300 KB of bodies is refused too_large, naming the 256 KB cap", async () => {
  const part = "<p>" + "z".repeat(150000) + "</p>";
  const w = await write(ownerKey, [{ kind: "render", op: "upsert", data: { screen: "screen:s10-pricing", state: "", variant: "a", format: "html", body: part } },
    { kind: "render", op: "upsert", data: { screen: "screen:s10-pricing", state: "", variant: "b", format: "html", body: part } }]);
  const e = (w.errors || [])[0] || {};
  expect(w.error === "invalid_ops" && e.index === 1 && e.error === "too_large" && /256 KB/.test(e.note) && /split the call/.test(e.note), () => brief(w));
  const r = (await kread(ownerKey, { project: P, kind: "render", screen: "screen:s10-pricing" })).out;
  expect((r.items || []).length === 0, () => `renders written: ${brief(r)}`);
  return `two bodies of ${part.length.toLocaleString("en-US")} bytes: too_large at op 1 (${e.note.slice(0, 90)}…); nothing written`;
});
