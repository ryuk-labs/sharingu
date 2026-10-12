// tools/lists-broadcast-selftest.mjs — sprint 3, D2 · B7: a card kind lists on the tab it names, a card's own page, and
// Broadcast's publish and equip through the door. Offline: a REAL SQLite built from boot.sql (node:sqlite), the knowledge filed
// through the real write door, then the REAL src/index.js handler (the seam, callTool, the routes) driven with Request/Response.
//   A. THE LISTS, per caller (the owner, a member holding the gtm access hat, a member without it, a Partner seated on alpha, a
//      Partner seated nowhere): what GET /gtm's `lists`, the gtm tool, the GTM page and the Build page list,
//      count and name. A card the reader may not read (its own roleVisibility, or its kind's) is never listed, counted, summed
//      or linked; a kind they may not read is absent with its cards; the owner reads all. The checklist's gtm-lists count
//      agrees with the screen (the owner's: N of M lists hold a card). A tab no kind names draws no region.
//   B. THE CARD PAGE: GET /read?ref=card/<kind>/<id> to a browser draws the card (its fields, source, confidence, as-of, who
//      may read it); a hidden card is the usual 404 page that names nothing; the old /pack/card/<kind>/<id> address is gone (a 404).
//   C. PUBLISH AND EQUIP, who may: the role CLASS (src/hats.js roleClassOf) — the owner and a member may; a Partner, and a row
//      still carrying a typed outside label as its role (external-ai, vendor), are refused partner_refused by the tool AND the
//      REST twin, nothing filed. Preview first: no confirm writes nothing; confirm files ONE filing; a read-only key previews
//      and is refused at the confirm. A Partner's shelf (the broadcast tool) is their seats' only (sprint 2's review fix).
//   D. BOUNDED: LIST_SQL runs on the primary key (EXPLAIN QUERY PLAN: no SCAN of k_cards).
//   E. A MUTATION PROOF: mayPublish rewritten to test the bare role lets a typed-label Partner publish, so C is load-bearing.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { contribute } from "./fixtures/door-helpers.mjs";
import { asOrg } from "./fixtures/org.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const { writeKnowledge } = await imp("src/knowledge/write.js");
const L = await imp("src/tablists.js");
const B = await imp("src/broadcast.js");
const { default: handler } = await imp("src/index.js");

let passes = 0, fails = 0;
const ok = (cond, label, detail = "") => { if (cond) passes++; else fails++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? ` — ${detail}` : ""}`); };
const show = (v) => String(JSON.stringify(v)).slice(0, 400);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const BOOT = readFileSync(join(ENGINE, "boot.sql"), "utf8");
const T0 = "2026-09-01T00:00:00.000Z";
const ROK = (key) => sha(sha(key) + ":agent-r-read-only:v1");

// ---- the org: two projects, every kind of reader ----
const PEOPLE = [
  ["p-o", "Owen Owner", "owner", null, "owner-key"],
  ["p-g", "Gia Gtm", "member", '["gtm"]', "gtm-key"],          // a member the admin gave the gtm access hat
  ["p-m", "Mo Member", "member", null, "mem-key"],             // a member with no access hat
  ["p-pa", "Pat Partner", "partner", null, "partner-key"],     // a Partner seated on alpha
  ["p-pb", "Bo Partner", "partner", null, "partnerb-key"],     // a Partner seated on beta only
  ["p-pz", "Lone Partner", "partner", null, "loner-key"],      // a Partner seated nowhere
  ["p-x", "Xena External", "external-ai", null, "ext-key"],    // a row still carrying a typed outside label as its role
  ["p-v", "Vic Vendor", "vendor", null, "vendor-key"],
];
const SEATS = [["p-g", "alpha"], ["p-m", "alpha"], ["p-pa", "alpha"], ["p-pb", "beta"], ["p-x", "alpha"], ["p-v", "alpha"]];
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(BOOT);
  const P = db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,access_hats,org) VALUES (?,?,?,?,?,1,?,?,1)");
  for (const [id, name, role, hats, key] of PEOPLE) P.run(id, name, `${id}@x.test`, role, sha(key), T0, hats);
  for (const k of ["alpha", "beta"]) db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES (?,?,1,?)").run(k, k[0].toUpperCase() + k.slice(1), T0);
  for (const [p, k] of SEATS) db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES (?,?,'member',?)").run(p, k, T0);
  return db;
}
function d1(db) {
  const exec = (sql, args) => (/^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: {} } : { results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } });
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => exec(sql, args).results[0] ?? null, all: async () => ({ results: exec(sql, args).results }), run: async () => exec(sql, args), _exec: () => exec(sql, args) });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const OWNER = { id: "p-o", name: "Owen Owner", role: "owner" };
const W = async (db, project, ops) => { const r = await writeKnowledge(OWNER, { project, ops }, asOrg({ DB: d1(db), BRAIN: { get: async () => null, put: async () => {} } })); if (r.error) throw new Error(`write ${project}: ${show(r)}`); return r; };
const ALPHA = [
  { kind: "goal", op: "upsert", data: { id: "root", title: "Sell alpha", dimensions: ["gtm"] } },
  { kind: "card_kind", op: "upsert", data: { key: "claim", label: "Approved claims", tab: "gtm", reviewAfterDays: 30 } },
  { kind: "card_kind", op: "upsert", data: { key: "target", label: "Targets", tab: "gtm", roleVisibility: ["gtm"] } },   // the GTM team's only
  { kind: "card_kind", op: "upsert", data: { key: "copy", label: "Copy", tab: "gtm" } },                                  // a list with no card yet
  { kind: "card_kind", op: "upsert", data: { key: "build-note", label: "Build notes", tab: "build" } },
  { kind: "card_kind", op: "upsert", data: { key: "deal", label: "Deals" } },                                            // names no tab: the Library only
  { kind: "card", op: "upsert", data: { kind: "claim", id: "c-flowzo", name: "FlowZo onboards in a day", body: "**Boundary:** never claim a bank licence.\n\nSource: the outreach pack.", asOf: "2026-01-02", confidence: "confirmed", source: [{ kind: "url", ref: "https://example.com/flowzo", label: "the FlowZo story" }] } },
  { kind: "card", op: "upsert", data: { kind: "claim", id: "c-fresh", name: "Teams file in ten minutes", body: "Measured on five teams.", asOf: new Date().toISOString().slice(0, 10), confidence: "direction" } },
  { kind: "card", op: "upsert", data: { kind: "claim", id: "c-secret", name: "Hidden finance claim", body: "SECRET-CLAIM-BODY", roleVisibility: ["finance"] } },
  { kind: "card", op: "upsert", data: { kind: "target", id: "t-acme", name: "Acme Corp", body: "SECRET-TARGET-BODY head of ops", asOf: "2026-01-02" } },
  { kind: "card", op: "upsert", data: { kind: "build-note", id: "b-1", name: "Build note one", body: "a note the Build tab lists" } },
  { kind: "card", op: "upsert", data: { kind: "deal", id: "d-1", name: "Deal one", body: "deal terms" } },
];
function door(db) {
  const hbrain = { get: async () => null, head: async () => null, list: async () => ({ objects: [], truncated: false }), put: async () => ({}) };
  const env = asOrg({ DB: d1(db), BRAIN: hbrain });
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  let n = 0;
  const req = async (method, path, key, { accept = "application/json", body } = {}) => {
    const r = await handler.fetch(new Request(`https://org.test${path}`, { method, headers: { accept, ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
    return { status: r.status, j, t, location: r.headers.get("location") };
  };
  const mcp = async (name, args, key) => {
    const r = await handler.fetch(new Request("https://org.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), env, ctx);
    const j = await r.json();
    let out = null; try { out = JSON.parse(j.result.content[0].text); } catch { out = j.error || j; }
    return { isError: !!(j.result && j.result.isError), out };
  };
  return { req, mcp, env };
}
const filed = (db) => db.prepare("SELECT COUNT(*) AS n FROM transmission").get().n;

const db = freshDb();
await W(db, "alpha", ALPHA);
const D = door(db);
const listsOf = (j) => ((j && j.lists && j.lists.lists) || []);
const namesOf = (j) => listsOf(j).flatMap((l) => l.cards.map((c) => c.name));

// ================= A. the lists, per caller =================
{
  const CALLERS = [["the owner", "owner-key"], ["a member with the gtm hat", "gtm-key"], ["a member without it", "mem-key"], ["a Partner seated on alpha", "partner-key"]];
  const seen = {};
  for (const [who, key] of CALLERS) {
    const r = await D.req("GET", "/gtm?project=alpha", key);
    const t = await D.mcp("gtm", { project: "alpha" }, key);
    seen[who] = r.j;
    // D2b item 10: the tool carries the SAME lists (kinds, counts, the Library link, the same cards in the same order), each
    // card cut to what its row says (ref, name, summary, as-of, a status other than approved)
    const head = (L) => L && { ...L, lists: (L.lists || []).map((k) => ({ ...k, cards: (k.cards || []).map((c) => c.ref) })) };
    const slimOk = !t.out.lists || (t.out.lists.lists || []).every((k) => (k.cards || []).length <= 8 && (k.cards || []).every((c) => Object.keys(c).every((f) => ["ref", "name", "summary", "asOf", "status"].includes(f))));
    ok(r.status === 200 && JSON.stringify(head(r.j.lists)) === JSON.stringify(head(t.out.lists)) && slimOk, `A · ${who}: GET /gtm's lists equal the gtm tool's (the tool's cards cut to their row)`, show([r.status, r.j && r.j.lists, t.out && t.out.lists]));
  }
  const o = seen["the owner"], g = seen["a member with the gtm hat"], m = seen["a member without it"], pa = seen["a Partner seated on alpha"];
  const keysOf = (j) => listsOf(j).map((l) => `${l.key}:${l.count}`).join(",");
  ok(keysOf(o) === "claim:3,copy:0,target:1" && namesOf(o).includes("Hidden finance claim") && namesOf(o).includes("Acme Corp"),
    "A · the owner reads every GTM list (claims 3, copy 0, targets 1), the hidden claim and the GTM team's targets included", keysOf(o));
  ok(keysOf(g) === "claim:2,copy:0,target:1" && !namesOf(g).includes("Hidden finance claim") && namesOf(g).includes("Acme Corp"),
    "A · a member with the gtm access hat reads the targets; the finance-only claim is neither listed nor counted (claims 2)", keysOf(g));
  ok(keysOf(m) === "claim:2,copy:0" && !namesOf(m).includes("Acme Corp") && !JSON.stringify(m.lists).includes("SECRET") && !JSON.stringify(m.lists).includes("target"),
    "A · a member without the hat: no Targets list at all (the kind is the GTM team's), the hidden claim absent", keysOf(m));
  ok(keysOf(pa) === keysOf(m) && !JSON.stringify(pa.lists).includes("SECRET"), "A · a Partner seated on alpha reads exactly what a member without the hat reads", keysOf(pa));
  const lone = await D.req("GET", "/gtm?project=alpha", "loner-key"), loneT = await D.mcp("gtm", { project: "alpha" }, "loner-key");
  ok(lone.status === 403 && loneT.isError && loneT.out.error === "project_forbidden", "A · a Partner seated nowhere reads no list: 403 project_forbidden, by REST and by the tool", show([lone.status, loneT.out]));
  // each card: its one-line summary, its confidence and as-of, the due mark by its kind's shelf life (30 days for claims)
  const claim = listsOf(o).find((l) => l.key === "claim");
  const fz = claim.cards.find((c) => c.id === "c-flowzo"), fr = claim.cards.find((c) => c.id === "c-fresh");
  ok(fz && fz.summary === "Boundary: never claim a bank licence." && fz.confidence === "confirmed" && fz.asOf === "2026-01-02" && fz.dueForReview && fr && !fr.dueForReview && claim.due === 1
    && fz.href === "/read?ref=card/claim/c-flowzo", "A · a row carries its summary, confidence, as-of, due mark (claims due 1) and its page's href", show(claim));
  // the GTM page: the region, a list per kind, the rows; the member's page names nothing hidden
  const po = await D.req("GET", "/gtm?project=alpha", "owner-key", { accept: "text/html" });
  const pm = await D.req("GET", "/gtm?project=alpha", "mem-key", { accept: "text/html" });
  ok(/data-region="lists"/.test(po.t) && /data-list="claim" data-cards="3" data-due="1"/.test(po.t) && /data-list="target"/.test(po.t) && /data-card="claim\/c-flowzo" data-due=/.test(po.t) && /No copy yet</.test(po.t),   // sprint 3 L2: the empty list is a phrase (pristine copy)
    "A · the owner's GTM page draws the Lists region: one list per kind, its count and due, a row per card, the empty list's sentence");
  // the motion system's count-up (shell.js) rewrites the TEXT of any [data-count] element: a list must never carry it (the first
  // shots flattened every list to one paragraph)
  const region = po.t.slice(po.t.indexOf('data-region="lists"'), po.t.indexOf('data-region="lists"') + 20000);
  ok(region.length > 100 && !/data-count=/.test(region.split("</section>")[0]), "A · the Lists region carries no data-count (the count-up hook would rewrite a whole list's text)");
  ok(/data-list="claim" data-cards="2"/.test(pm.t) && !/data-list="target"/.test(pm.t) && !/Hidden finance claim|Acme Corp|SECRET/.test(pm.t), "A · the member's GTM page lists none of what they may not read");
  // the checklist and the screen agree: gtm-lists counts the lists that hold a card, of the GTM lists
  const h = (await D.mcp("missing", { project: "alpha" }, "owner-key")).out;
  const it = (h.items || []).find((x) => x.id === "gtm-lists") || ((h.filled || []).includes("gtm-lists") ? { have: -1 } : null);
  const withCards = listsOf(o).filter((l) => l.count > 0).length, total = listsOf(o).length;
  ok(it && it.have === withCards && it.want === total, `A · the checklist's gtm-lists (${it && it.have} of ${it && it.want}) agrees with the owner's GTM screen (${withCards} of ${total} lists hold a card)`, show(it));
  // any tab a kind names: Build lists its kind; Decisions (named by none) draws no region
  const bp = await D.req("GET", "/build?project=alpha", "mem-key", { accept: "text/html" });
  const dp = await D.req("GET", "/decisions?project=alpha", "mem-key", { accept: "text/html" });
  ok(bp.status === 200 && /data-region="lists"/.test(bp.t) && /data-card="build-note\/b-1"/.test(bp.t) && !/data-card="claim\//.test(bp.t), "A · the Build page lists the kind that names Build, and only it", String(bp.status));
  ok(dp.status === 200 && !/data-region="lists"/.test(dp.t), "A · a tab no kind names (Decisions) draws no Lists region");
  // the shared part, direct: a tab no kind names reads null; the Library-only kind lists nowhere
  const env = { ...D.env };
  ok((await L.tabListsFor(env, OWNER, "decisions", { project: "alpha" })) === null && !JSON.stringify(await L.tabListsFor(env, OWNER, "gtm", { project: "alpha" })).includes("Deal one"), "A · tabListsFor: null for a tab no kind names; a kind that names no tab lists on none");
}

// ================= B. the card page =================
{
  const pg = await D.req("GET", "/read?ref=card/claim/c-flowzo&project=alpha", "gtm-key", { accept: "text/html" });
  ok(pg.status === 200 && /data-region="card"/.test(pg.t) && /FlowZo onboards in a day/.test(pg.t) && /data-confidence="confirmed"/.test(pg.t) && /data-as-of="2026-01-02"/.test(pg.t)
    && /due for review/.test(pg.t) && /data-field="who"/.test(pg.t) && /Everyone seated on this project/.test(pg.t) && /data-region="source"/.test(pg.t) && /the FlowZo story/.test(pg.t)
    && /Approved claims/.test(pg.t) && /never claim a bank licence/.test(pg.t), "B · the card page: its fields, confidence, as-of and due mark, source, who may read it, its kind's label and its body", String(pg.status));
  const tp = await D.req("GET", "/read?ref=card/target/t-acme&project=alpha", "gtm-key", { accept: "text/html" });
  ok(tp.status === 200 && /Only who holds Go-to-market/.test(tp.t), "B · a target's page says who may read it (its kind: the gtm hat)");
  const hid = await D.req("GET", "/read?ref=card/target/t-acme&project=alpha", "mem-key", { accept: "text/html" });
  const hid2 = await D.req("GET", "/read?ref=card/claim/c-secret&project=alpha", "partner-key", { accept: "text/html" });
  const miss = await D.req("GET", "/read?ref=card/claim/no-such&project=alpha", "mem-key", { accept: "text/html" });
  ok(hid.status === 404 && hid2.status === 404 && miss.status === 404 && !/Acme|SECRET|Hidden/.test(hid.t + hid2.t) && hid.t.replace(/t-acme|target/g, "") .length > 0,
    "B · a card the reader may not read is the usual 404 page, exactly as a missing one, naming nothing", show([hid.status, hid2.status, miss.status]));
  // the card page's old address, from tools/names.json (the one source of the old names)
  const NAMES = JSON.parse((await import("node:fs")).readFileSync(new URL("./names.json", import.meta.url), "utf8"));
  const oldPath = NAMES.rest.find((r) => r.new === "GET /read" && /:kind\/:id$/.test(r.old) && /card/.test(r.old)).old.split(" ")[1].replace(":kind/:id", "claim/c-flowzo");
  const old = await D.req("GET", `${oldPath}?project=alpha`, "mem-key", { accept: "text/html" });
  const oldJ = await D.req("GET", `${oldPath}?project=alpha`, "mem-key");
  ok(old.status === 404 && oldJ.status === 404,
    "B · the card page's old address is gone (D5: renamed at once, no redirect): a 404 for a browser and for JSON; a card's page is /read?ref=card/…", show([old.status, old.location, oldJ.status]));
}

// ================= C. publish and equip, who may =================
{
  const P = B.mayPublish, E = B.mayEquip;
  const role = (r) => ({ id: "x", role: r });
  ok(P(role("owner")) === null && P(role("member")) === null && E(role("owner")) === null && E(role("member")) === null, "C · mayPublish / mayEquip: the admin and a member may");
  ok(["partner", "external-ai", "external-logistics", "vendor"].every((r) => P(role(r)) && P(role(r)).error === "partner_refused" && E(role(r)) && E(role(r)).error === "partner_refused"),
    "C · the role CLASS: partner, external-ai, external-logistics and vendor are each refused partner_refused (sprint 2's review: not the bare role)");
  const item = (slug) => ({ lane: "leader", kind: "item", what: `the ${slug} kit`, why: "a kit the selftest publishes", touches: "skill", gapRefs: ["item/" + slug], proof: "https://src.example/" + slug, project: "alpha" });
  const draft = (await contribute(D.mcp, item("d2-kit"), "mem-key")).out;
  const xd = (await contribute(D.mcp, item("d2-ext"), "ext-key")).out;
  ok(draft && /^T-/.test(draft.id) && xd && /^T-/.test(xd.id), "C · a member and a typed-label row each file a draft (kind item)", show([draft, xd]));
  const f0 = filed(db);
  const pv = await D.mcp("publish", { id: draft.id }, "mem-key");
  ok(!pv.isError && pv.out.preview === true && pv.out.v === 1 && /publish \{id: "T-/.test(pv.out.text) && pv.out.shows[0].tab === "broadcast" && filed(db) === f0, "C · publish with no confirm is the preview: its line, where it shows, its text; nothing filed", show(pv.out));
  // a read-only key never reaches the MCP door (the entry hands it to the OAuth provider: 401); at the REST twin the gate refuses
  // it on the POST, and publishAnswer refuses one at the confirm should a caller ever carry one there
  const ro = await D.req("POST", "/broadcast/publish", ROK("mem-key"), { body: { id: draft.id, confirm: true } });
  const roIn = await B.publishAnswer(D.env, { id: "p-m", role: "member", readOnly: true }, { id: draft.id, confirm: true });
  ok(ro.status === 403 && ro.j.error === "read_only_credential" && roIn.error === "read_only_credential" && filed(db) === f0, "C · a read-only key is refused at the confirm (the REST gate, and publishAnswer itself), nothing filed", show([ro.status, ro.j, roIn]));
  const xp = await D.mcp("publish", { id: xd.id, confirm: true }, "ext-key");
  const xr = await D.req("POST", "/broadcast/publish", "ext-key", { body: { id: xd.id, confirm: true } });
  const vp = await D.mcp("equip", { slug: "preset:frontend", v: 1, project: "alpha", confirm: true }, "vendor-key");
  const pp = await D.mcp("equip", { slug: "preset:frontend", v: 1, project: "alpha", confirm: true }, "partner-key");
  const pr = await D.req("POST", "/broadcast/equip", "partner-key", { body: { slug: "preset:frontend", v: 1, project: "alpha", confirm: true } });
  ok(xp.isError && xp.out.error === "partner_refused" && xr.status === 403 && xr.j.error === "partner_refused" && vp.isError && vp.out.error === "partner_refused"
    && pp.isError && pp.out.error === "partner_refused" && pr.status === 403 && filed(db) === f0, "C · a typed-label row and a Partner are refused partner_refused by the tool and the REST twin, publish and equip; nothing filed",
    show([xp.out, xr.status, vp.out, pp.out, pr.status]));
  const pub = await D.mcp("publish", { id: draft.id, confirm: true }, "mem-key");
  ok(!pub.isError && pub.out.slug === "d2-kit" && pub.out.v === 1 && filed(db) === f0 + 1, "C · a member publishes their draft with confirm: ONE filing, v1", show(pub.out));
  const not = await D.mcp("publish", { id: draft.id, confirm: true }, "gtm-key");
  ok(not.isError && not.out.error === "not_yours", "C · another member may not publish it (not_yours)", show(not.out));
  const eqv = await D.mcp("equip", { slug: "d2-kit", v: 1, project: "alpha" }, "gtm-key");
  const eq = await D.mcp("equip", { slug: "d2-kit", v: 1, project: "alpha", confirm: true }, "gtm-key");
  const eqBeta = await D.mcp("equip", { slug: "d2-kit", v: 1, project: "beta", confirm: true }, "gtm-key");
  ok(!eqv.isError && eqv.out.preview === true && !eq.isError && eq.out.project === "alpha" && filed(db) === f0 + 2 && eqBeta.isError && eqBeta.out.error === "not_seated",
    "C · equip previews, then files into a project the member is seated on; never into one they are not (not_seated)", show([eqv.out, eq.out, eqBeta.out]));
  const sh = (await D.mcp("broadcast", { project: "alpha" }, "gtm-key")).out;
  const here = ((sh.regions || {})["equipped-here"] || []).some((x) => x.slug === "d2-kit" && x.v === 1);
  ok((sh.regions.shelf || []).some((c) => c.slug === "d2-kit") && here, "C · the shelf and alpha's equipped list show it at once");
  const pA = (await D.mcp("broadcast", { project: "alpha" }, "partner-key")).out, pB = (await D.mcp("broadcast", {}, "partnerb-key")).out;
  ok((pA.regions.shelf || []).some((c) => c.slug === "d2-kit") && !(pB.regions.shelf || []).some((c) => c.slug === "d2-kit"),
    "C · a Partner sees only their seat's shelf: alpha's Partner sees d2-kit, beta's Partner does not", show([(pA.regions.shelf || []).map((c) => c.slug), (pB.regions.shelf || []).map((c) => c.slug)]));
}

// ================= D. bounded =================
{
  const plan = (sql, ...a) => db.prepare("EXPLAIN QUERY PLAN " + sql).all(...a).map((r) => r.detail).join(" | ");
  const p1 = plan(L.LIST_SQL(true), "alpha", "claim", 8, 30, '["member"]'), p0 = plan(L.LIST_SQL(false), "alpha", "claim", 8, 30);
  // every part (the rows c, the count x, the due count y) on the primary key's (project, kind) range: never a scan, never the
  // as_of index (which would walk every dated card of the project for one kind)
  const onPk = (p) => ["c", "x", "y"].every((a) => new RegExp(`SEARCH ${a} USING (?:COVERING )?INDEX sqlite_autoindex_k_cards_1 \\(project=\\? AND kind=\\?\\)`).test(p)) && !/SCAN (c|x|y)\b|idx_k_cards_as_of/.test(p);
  ok(onPk(p1), "D · LIST_SQL (filtered): the rows, the count and the due count each on the primary key's (project, kind) range", p1);
  ok(onPk(p0), "D · LIST_SQL (the owner's): the same", p0);
}

// ================= E. the mutation proof =================
{
  const dir = mkdtempSync(join(ENGINE, ".lists-broadcast-mutation-"));
  try {
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const f = join(dir, "src", "broadcast.js"), src = readFileSync(f, "utf8");
    const needle = `  if (roleClassOf(person.role) === "partner") return { http: 403, error: "partner_refused", hint: PARTNER_PUBLISH_REASON };   // authority`;
    if (src.split(needle).length !== 2) ok(false, "E · the mutation's needle is not found once in src/broadcast.js: this selftest is stale");
    else {
      writeFileSync(f, src.replace(needle, needle.replace("roleClassOf(person.role) === \"partner\"", "person.role === \"partner\"")));
      const M = await import(pathToFileURL(f).href);
      ok(M.mayPublish({ id: "x", role: "external-ai" }) === null, "E · with the bare role tested, a typed-label Partner may publish: the role-class check is load-bearing");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log(`lists-broadcast-selftest: ${passes} pass · ${fails} fail`);
process.exit(fails ? 1 : 0);
