// tools/smoke/s30-density.mjs — sprint 4, M1 and M5: the Map's panels fold, and its diagrams fold and filter. Self-contained:
// its own project (d30), a surface and three screens on the canvas, an architecture of three lanes with two journeys, and 64
// services with a part naming the 64th. The folds live in the browser (src/parts.js foldKit), so the smoke proves what the
// pages carry for them; tools/map-selftest.mjs (K) and tools/arch-selftest.mjs (B, F) prove what the scripts do with it.
//   · 1  every Map view (Canvas, Screens, Arch, MCP), for a signed-in reader, carries the folds' key under that person's own id
//        and the boot in its head, the rail's toggle first in its toolbar and the panel's last, each titled with its label and
//        the key; Home and Versions carry none; a visitor with no session is sent to sign in
//   · 2  the canvas: each column's head folds it; the keys say the canvas-alone key
//   · 3  the Arch view: each lane with parts folds from its label; each journey's pill filters (none pressed at first), the
//        dim marks in the sheet, the kit's filter set the journey's own parts and links; a part naming the 64th service keeps
//        its "Runs on" (the services it names are kept before the cap of 60)
//   · 4  M3, links between systems: a part another project of the org owns. Its own two projects (m3a draws the architecture,
//        m3b owns a shared service), a Partner seated on m3a alone. The owner files a service and a diagram part owned by m3b;
//        a key that is no project is refused unknown_project naming the keys the owner may name; the owner's Arch view names
//        m3b on the parts and links them to m3b's Map, the inspector too; the Partner reads the name, never a link
//   · 5  M4, the dots say what is real (on d30): a check naming a part graded refused marks the part red and every link to it
//        failing; a check naming another graded proven, then a code change naming that part, makes it stale (its check to
//        regrade) and changed this week; a part a real contribution touched is changed; a freshly-created part (created_at == updated_at) is a birth, not a change; each journey's
//        data names its first blocked step; the side counts them. All in the diagram's JSON (the page's ar-data), one read.
import { smoke, expect, brief, mcp, html, http, ownerKey, control, fileVia, kwrite, contribute, s, BASE } from "./lib.mjs";
import { archKit } from "../../src/archview.js";

const P = "d30" + String(process.env.S30_TAG || "").replace(/[^a-z0-9]/g, "");
const VIEWS = [`/map?project=${P}`, `/map/screens?project=${P}`, `/map/arch?project=${P}`, `/map/mcp?project=${P}`];
const node = (id, type, name, data = {}) => ({ kind: "node", op: "upsert", data: { id, type, name, data } });
const foldKey = (h) => (/^<!doctype html>\s*<html lang="en" data-folds="sharingu-fold:([^"]+)"[^>]*>/.exec(h) || [])[1] || "";
const carries = (h) => /<html lang="en" data-folds=|<button[^>]*data-fold-toggle=/.test(h);
const R = {};

smoke("density · setup: d30 holds a surface and three screens, an architecture of three lanes and two journeys, and 64 services", async () => {
  await control({ action: "add-project", key: P, name: "D30" });
  const services = Array.from({ length: 64 }, (_, i) => node(`service:svc${i}`, "service", `Service ${i}`, { uses: [`the use of ${i}`] }));
  const arch = node("architecture:main", "architecture", "Architecture", { summary: "Three lanes.",
    diagram: { groups: [{ id: "in", label: "Clients", order: 1 }, { id: "worker", label: "The worker", order: 2 }, { id: "data", label: "Stores", order: 3 }],
      nodes: [{ id: "app", group: "in", kind: "client", title: "The app" }, { id: "ai", group: "in", kind: "client", title: "An AI client" },
        { id: "door", group: "worker", kind: "worker", title: "The door", service: "svc63" }, { id: "core", group: "worker", kind: "worker", title: "The core", service: "svc2" },
        { id: "d1", group: "data", kind: "data", title: "D1" }, { id: "r2", group: "data", kind: "data", title: "R2" }],
      edges: [{ from: "app", to: "door", label: "HTTPS" }, { from: "ai", to: "door", label: "MCP", main: true }, { from: "door", to: "core" }, { from: "core", to: "d1", label: "one batch" }, { from: "core", to: "r2", label: "a body" }],
      paths: [{ name: "A filing", steps: [{ from: "ai", to: "door", says: "The AI files" }, { from: "door", to: "core", says: "The door checks" }, { from: "core", to: "d1", says: "One write" }] },
        { name: "A picture", steps: [{ from: "app", to: "door", says: "The app sends" }, { from: "core", to: "r2", says: "Stored by hash" }] }] } });
  const canvas = [node("surface:d30", "surface", "D30"), ...["a", "b", "c"].map((x) => node(`screen:d30-${x}`, "screen", `D30 ${x}`, { surface: "d30", lane: "main", apis: [`GET /d30/${x}`] }))];
  const f = await fileVia(ownerKey, { project: P, items: [...canvas, arch, ...services] });
  expect(!f.isError && f.out.complete, () => `${f.step}: ${brief(f.out)}`);
  R.owner = ((await mcp(ownerKey, "whoami")).out || {}).id || "";
  expect(R.owner && s.member && s.member.id, () => `the owner's id "${R.owner}", the member's "${(s.member && s.member.id) || ""}"`);
  return `${P}: 1 surface, 3 screens, the architecture (3 lanes, 6 parts, 5 links, 2 journeys), 64 services`;
});

smoke("density · 1 every Map view carries the person's folds and the two toggles; Home, Versions and a visitor carry none", async () => {
  const bad = [];
  for (const v of VIEWS) {
    const p = await html(v), h = p.text, bar = (/<header class="mx-bar" data-region="layers">([\s\S]*?)<\/header>/.exec(h) || [, ""])[1];
    if (p.status !== 200) { bad.push(`${v} ${p.status}`); continue; }
    if (foldKey(h) !== R.owner) bad.push(`${v}: the folds' key is "${foldKey(h)}", not the owner's own id`);
    if (!(h.indexOf("window.SGFOLD") > 0 && h.indexOf("window.SGFOLD") < h.indexOf("<body>"))) bad.push(`${v}: no boot in the head`);
    const rail = bar.indexOf('data-fold-toggle="rail"'), layers = bar.indexOf('class="mx-layers"'), panel = bar.indexOf('data-fold-toggle="panel"');
    if (!(rail >= 0 && rail < layers && panel > layers && panel > bar.lastIndexOf("data-view="))) bad.push(`${v}: the toggles are not first and last in the toolbar`);
    if (!/data-button="fold-rail" data-client="[^"]+"[^>]*title="Fold rail · \\ folds both"/.test(bar) || !/data-button="fold-panel" data-client="[^"]+"[^>]*title="Fold panel · \\ folds both"/.test(bar)) bad.push(`${v}: a toggle's title is not its label and the key`);
  }
  const mine = await html("/map?project=smoke", s.member.key);
  if (foldKey(mine.text) !== s.member.id) bad.push(`the member's Map keeps the folds under "${foldKey(mine.text)}", not their own id`);
  for (const v of ["/home", `/versions?project=${P}`]) { const p = await html(v); if (p.status !== 200 || carries(p.text)) bad.push(`${v} ${p.status} carries the folds`); }
  const anon = await fetch(`${BASE}/map?project=${P}`, { headers: { accept: "text/html" }, redirect: "manual" }), at = await anon.text();
  if (!((anon.status === 302 && /\/login/.test(anon.headers.get("location") || "")) || anon.status === 401) || carries(at)) bad.push(`a visitor on /map: ${anon.status} ${anon.headers.get("location")}`);
  expect(!bad.length, () => bad.join(" · "));
  return `Canvas, Screens, Arch and MCP: the folds' key under the reader's own id (the owner's, the member's), the boot in the head, the rail's toggle first and the panel's last ("Fold rail · \\ folds both"); Home and Versions none; a visitor is sent to sign in, with none`;
});

smoke("density · 2 the canvas: each column's head folds it, and the keys say the canvas-alone key", async () => {
  const h = (await html(`/map?project=${P}`)).text;
  const cols = (h.match(/<g class="mx-colh" data-col="\d+"/g) || []).length, folds = (h.match(/<title>Fold column<\/title><\/g>/g) || []).length;
  const keys = (/id="mx-keys"[\s\S]*?<\/section>/.exec(h) || [""])[0];
  expect(cols >= 2 && folds === cols && /class="mx-chev mx-colv"/.test(h) && /<kbd>\\<\/kbd> canvas alone/.test(keys) && /html\[data-fold~="panel"\] \.mx-body/.test(h), () => `${cols} column heads, ${folds} folds; keys ${keys.slice(0, 300)}`);
  return `${cols} columns, each head titled Fold column with its chevron; the keys: \\ canvas alone; the sheet folds the panel`;
});

smoke("density · 3 the Arch view: a lane folds from its label, a journey's pill filters, a part keeps the 64th service it runs on", async () => {
  const h = (await html(`/map/arch?project=${P}`)).text;
  const data = JSON.parse((/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(h) || [, "null"])[1]);
  expect(data && data.M.bands.length === 3, () => `no diagram: ${h.slice(0, 200)}`);
  const lanes = (h.match(/<g class="ar-fold" data-b="\d+"[^>]*><title>Fold lane<\/title>/g) || []).length;
  const pills = [...h.matchAll(/<button type="button" class="ar-pill" data-button="path-pick" data-client="filters the diagram to this journey" data-path="(\d)" aria-pressed="(true|false)"/g)];
  const J = archKit().jset(data.M, 0), steps = data.M.paths[0].steps;
  const svc = data.M.services.map((x) => x.id), door = data.M.nodes.find((n) => n.id === "door");
  const bad = [];
  if (lanes !== 3) bad.push(`${lanes} lanes fold`);
  if (pills.length !== 2 || pills.some((m) => m[2] !== "false")) bad.push(`pills ${pills.map((m) => m[1] + m[2]).join(",")}`);
  if (!/\.ar-stage\.ar-filter \.ar-n:not\(\.ar-jn\)/.test(h) || !/var ARCHKIT=[\s\S]*function jset/.test(h)) bad.push("no dim marks or no filter set in the page");
  if (!(J && Object.keys(J.n).length === 4 && Object.keys(J.l).length === 3 && steps.every((x) => J.n[x.a] && J.n[x.b] && J.l[x.l]))) bad.push(`the filter's set ${brief(J)}`);
  if (!(svc.length === 60 && svc.includes("svc63") && svc.includes("svc2") && door && door.service === "svc63")) bad.push(`services ${svc.length}, svc63 ${svc.includes("svc63")}`);
  if (!/<kbd>Esc<\/kbd> close, then the filter/.test(h)) bad.push("the keys do not say Escape clears the filter");
  expect(!bad.length, () => bad.join(" · "));
  return `3 lanes fold from their labels; 2 pills filter (none pressed), the dim marks in the sheet, "A filing" keeps its 4 parts and 3 links; 60 services kept with svc63, the one The door runs on`;
});

// ---- 4. M3 · links between systems ----
const A3 = "m3a" + String(process.env.S30_TAG || "").replace(/[^a-z0-9]/g, ""), B3 = "m3b" + String(process.env.S30_TAG || "").replace(/[^a-z0-9]/g, "");
const arData = (h) => JSON.parse((/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(h) || [, "null"])[1]);
const inspectorOf = (h) => (/data-region="inspector"[\s\S]*?<\/aside>/.exec(h) || [""])[0];

smoke("links · setup and the door: a service and a part owned by another project file; a key that is no project is refused naming the known keys", async () => {
  await control({ action: "add-project", key: A3, name: "M3 App" });
  await control({ action: "add-project", key: B3, name: "M3 Backend" });
  const r = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", "M3 Partner"], ["email", `partner-${A3}@m3.local`], ["role", "partner"], ["projectKey", A3]] });
  R.partner = (r.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  expect(R.partner, () => `the Partner's invite: ${r.status}`);
  const arch = node("architecture:main", "architecture", "Architecture", { summary: "An app on a backend another project owns.",
    diagram: { groups: [{ id: "app", label: "The app", order: 1 }, { id: "backend", label: "The shared backend", order: 2 }],
      nodes: [{ id: "web", group: "app", kind: "client", title: "Web app" }, { id: "api", group: "backend", kind: "service", title: "Shared API", service: "m3-api" },
        { id: "auth", group: "backend", kind: "service", title: "Auth", sub: "sign-in for both apps", ownedBy: B3 }],
      edges: [{ from: "web", to: "api", label: "HTTPS" }, { from: "web", to: "auth", label: "sign-in" }] } });
  const f = await fileVia(ownerKey, { project: A3, items: [node("service:m3-api", "service", "Shared API", { uses: ["the events API"], ownedBy: B3 }), arch] });
  expect(!f.isError && f.out.complete, () => `${f.step}: ${brief(f.out)}`);
  const bad = await kwrite(ownerKey, { project: A3, ops: [node("service:m3-x", "service", "Elsewhere", { ownedBy: "m3-nowhere" })] });
  const e = ((bad.out && bad.out.errors) || [])[0] || {};
  const named = ((/one of \[([^\]]*)\]/.exec(e.note || "") || [])[1] || "").split(", ");
  expect(bad.isError && e.error === "unknown_project" && named.includes(B3) && !named.includes(A3), () => brief(bad.out));
  const own = await kwrite(ownerKey, { project: A3, ops: [node("service:m3-y", "service", "Mine", { ownedBy: A3 })] });
  expect(own.isError && (((own.out && own.out.errors) || [])[0] || {}).error === "bad_field", () => brief(own.out));
  return `${A3} files service:m3-api and the part "auth" owned by ${B3}; ownedBy "m3-nowhere" is refused unknown_project naming ${B3} among the keys; ${A3} naming itself is bad_field`;
});

smoke("links · the owner's Arch view names the owning project on the part and links to its Map; the inspector too", async () => {
  const h = (await html(`/map/arch?project=${A3}`)).text, data = arData(h);
  const part = (id) => (data && data.M.nodes.find((n) => n.id === id)) || {};
  const href = (id) => `/map?project=${B3}&find=${id}`;
  const bad = [];
  if (!(part("auth").owner && part("auth").owner.name === "M3 Backend" && part("auth").owner.href === href("auth"))) bad.push(`auth ${brief(part("auth"))}`);
  if (!(part("api").owner && part("api").owner.href === href("api"))) bad.push(`api (its service is ${B3}'s) ${brief(part("api"))}`);
  if (part("web").owner) bad.push("web carries an owner");
  if ((h.match(/class="ar-no"[^>]*>Owned by M3 Backend</g) || []).length !== 2) bad.push(`the label lines: ${(h.match(/class="ar-no"[^<]*<[^<]*/g) || []).join(" | ")}`);
  if (!/data-button="open-owner"/.test(h)) bad.push("the pinned side carries no open-owner link");
  const i = inspectorOf((await html(`/map?project=${A3}&node=${encodeURIComponent("service:m3-api")}`)).text);
  if (!new RegExp(`<dt>Owned by</dt><dd data-owner="${B3}"[^>]*><a href="/map\\?project=${B3}&amp;find=m3-api" data-button="open-owner"`).test(i)) bad.push(`inspector ${i.slice(i.indexOf("mx-facts"), i.indexOf("mx-facts") + 300)}`);
  const m = await mcp(ownerKey, "map", { project: A3, ref: "service:m3-api" });
  if (JSON.stringify(m.out && m.out.ownedBy) !== JSON.stringify({ project: B3, name: "M3 Backend", href: `/map?project=${B3}&find=m3-api` })) bad.push(`map {ref} ${brief(m.out && m.out.ownedBy)}`);
  const linked = await html(href("auth"));
  if (linked.status !== 200) bad.push(`${href("auth")} ${linked.status}`);
  expect(!bad.length, () => bad.join(" · "));
  return `the parts "auth" (its own ownedBy) and "Shared API" (its service's) read "Owned by M3 Backend" and link ${href("auth")} (200); the inspector and map {ref} carry the same link`;
});

smoke("links · a Partner seated on the app alone reads the owner's name, never a link", async () => {
  const h = (await html(`/map/arch?project=${A3}`, R.partner)).text, data = arData(h);
  const auth = (data && data.M.nodes.find((n) => n.id === "auth")) || {};
  const i = inspectorOf((await html(`/map?project=${A3}&node=${encodeURIComponent("service:m3-api")}`, R.partner)).text);
  const m = await mcp(R.partner, "map", { project: A3, ref: "service:m3-api" });
  const b = await html(`/map?project=${B3}`, R.partner);
  expect(auth.owner && auth.owner.name === "M3 Backend" && auth.owner.href === null && !h.includes(`project=${B3}&`) && /class="ar-no"[^>]*>Owned by M3 Backend</.test(h)
    && /<dt>Owned by<\/dt><dd data-owner="[^"]+"[^>]*>M3 Backend<\/dd>/.test(i) && !/open-owner/.test(i)
    && m.out && m.out.ownedBy && m.out.ownedBy.href === null && b.status !== 200,
  () => `arch ${brief(auth.owner)} · inspector ${i.slice(i.indexOf("mx-facts"), i.indexOf("mx-facts") + 200)} · map ${brief(m.out && m.out.ownedBy)} · ${B3} ${b.status}`);
  return `the Partner reads "Owned by M3 Backend" on the part, in the inspector and in map {ref} (href null), with no link; ${B3}'s Map answers them ${b.status}`;
});

// ---- 5. M4 · the dots say what is real ----
smoke("marks · the Arch view: a failing check reddens its part and its links, a change marks its part, a journey names its blocked step", async () => {
  const checks = [{ kind: "check", op: "upsert", data: { id: "AC.d30.core", title: "The core checks every filing", refs: ["core"] } },
    { kind: "check", op: "upsert", data: { id: "AC.d30.r2", title: "A body is stored by its hash", refs: ["r2"] } }];
  const f = await fileVia(ownerKey, { project: P, items: checks });
  expect(!f.isError && f.out.complete, () => `${f.step}: ${brief(f.out)}`);
  const g1 = await mcp(ownerKey, "submit_grade", { project: P, checkId: "AC.d30.core", verdict: "refused", proof: "curl -s localhost/d30 -> 500, the core refused nothing" });
  const g2 = await mcp(ownerKey, "submit_grade", { project: P, checkId: "AC.d30.r2", verdict: "proven", proof: "curl -s localhost/d30/r2 -> 200, the body read back by its hash" });
  expect(!g1.isError && !g2.isError, () => `grades: ${brief(g1.out)} · ${brief(g2.out)}`);
  const c = await contribute(ownerKey, { project: P, lane: "code", kind: "pr", what: "D30 bodies keyed by a new hash", why: "The old hash collided.", touches: ["r2"], proof: "npm test -> exit 0" });
  expect(!c.isError && c.out && c.out.id, () => `the change: ${brief(c.out)}`);
  const h = (await html(`/map/arch?project=${P}`)).text;
  const M = (JSON.parse((/<script type="application\/json" id="ar-data">([\s\S]*?)<\/script>/.exec(h) || [, "null"])[1]) || {}).M;
  expect(M, () => `no diagram: ${h.slice(0, 200)}`);
  const at = (id) => M.nodes.findIndex((n) => n.id === id), N = (id) => M.nodes[at(id)];
  const failing = M.links.filter((l) => l.fail).map((l) => `${M.nodes[l.a].id}>${M.nodes[l.b].id}`).sort().join(",");
  const blocks = M.paths.map((p) => (p.block ? `${p.block.step}:${M.nodes[p.block.part].id}` : "-")).join(" ");
  const ov = (/id="ar-ov"[\s\S]*?<\/aside>/.exec(h) || [""])[0];
  const bad = [];
  if (!(N("core").light === "red" && N("core").check && N("core").check.title === "The core checks every filing" && !N("core").check.stale)) bad.push(`core ${brief(N("core"))}`);
  if (failing !== "core>d1,core>r2,door>core") bad.push(`failing links ${failing}`);
  if (!(N("r2").stale === 1 && N("r2").check && N("r2").check.stale && (N("r2").regrade || []).join() === "AC.d30.r2" && N("r2").changed)) bad.push(`r2 ${brief(N("r2"))}`);
  // A1 (sprint 5): a first filing is a part's BIRTH, not a change — d30's services were created this run (created_at ==
  // updated_at), so only r2 (touched by a real contribution above) reads "changed"; the rest do not.
  if (!(N("r2").changed && !N("door").changed && !N("core").changed && !N("app").changed && !N("ai").changed && !N("d1").changed)) bad.push(`changed ${M.nodes.filter((n) => n.changed).map((n) => n.id).join(",")}`);
  if (blocks !== "1:core 1:r2") bad.push(`blocks ${blocks}`);
  if (!(/data-mark="failing"><b>3<\/b>/.test(ov) && /data-mark="blocked"><b>2<\/b>/.test(ov) && /data-mark="changed"><b>1<\/b>/.test(ov))) bad.push(`side ${(/ar-lit[\s\S]*?<\/p>/.exec(ov) || [""])[0].slice(0, 300)}`);
  if (!(new RegExp(`<g class="ar-n" data-i="${at("core")}"[^>]*data-light="red"`).test(h) && (h.match(/ ar-fail" data-l=/g) || []).length === 3 && /<rect class="ar-ring"/.test(h))) bad.push("the drawing does not carry the marks");
  expect(!bad.length, () => bad.join(" · "));
  return `core red ("The core checks every filing"), its 3 links failing; r2 stale after ${c.out.id} (regrade AC.d30.r2) and changed; only r2 changed (a real contribution touched it); the freshly-created parts are births, not changes; "A filing" blocked at core, "A picture" at r2; the side counts 3 failing, 1 changed, 2 blocked`;
});
