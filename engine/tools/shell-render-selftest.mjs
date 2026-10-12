// shell-render-selftest.mjs — renders the shell with a served-looking fixture (onboarding steps WITH detail, lifecycle
// stages, a reader, a brand) so a runtime error in the chrome (scar 2026-09-09: a helper defined after its first use —
// node --check and the wrangler dry-run both pass, every page 1101s) is caught in the gate, not by users.
// The look pass (sprint 2, group C) adds, each proven both ways (an injected defect goes red on its own check):
//   · THE COMMAND PALETTE: a modal dialog (role dialog, aria-modal, a labelled combobox driving a listbox by
//     aria-activedescendant); its destinations ARE the rail's (same keys, labels, hrefs, order); an anonymous visitor's
//     palette offers only doors that need no sign-in (contracts/door.json auth "none") and no search; the project items are
//     exactly the reader's own seats (the switcher's list, "All projects" for the owner), each pressing the switcher's own
//     POST /project form; sign out only for a cookie session
//   · the "needs you" badge once, on Home; THE LOGO in the rail (U-chan beside the wordmark) and the favicon a link to
//     GET /favicon.svg; the motion hooks: the boot script sets html.u-motion only without reduced motion, every keyframe
//     moves transform, opacity or a stroke offset (never a layout property), and the parts carry the value in the markup
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shell, THEME_BOOT, MOTION_CSS, FAVICON_LINK } from "../src/shell.js";
import { metric, statLine, progress, spark, table, pills, breadcrumb, emptyState, logo, FAVICON_SVG } from "../src/ui.js";
let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const brand = { org: "Org", engine: "Agent R", owner: "Owner" };
const rules = { onboarding: [{ step: "Pick up a work package", detail: "R assists capsule · align · draw" }, { step: "Do the work", detail: "Yield handoff · finetune" }, { step: "Report" }],
                lifecycle: [{ stage: "send", detail: "docs · answers → R" }, { stage: "ruled", detail: "owner rules" }], lifecycleAdr: "x", onboardingAdr: "y" };
for (const reader of [null, { id: "p", name: "Rein", role: "internal-eng", title: "CTO" }, { id: "o", name: "Owner", role: "owner" }]) {
  let html = "";
  try { html = shell({ active: "home", title: "Home", content: "<p>hello</p>", brand, reader, owner: reader?.role === "owner", rules, tenant: { brand, name: "Org" }, agentic: rules }); }
  catch (e) { ok(false, `shell renders for ${reader ? reader.role : "anonymous"}: ${e && e.message}`); continue; }
  ok(typeof html === "string" && html.includes("hello"), `shell renders for ${reader ? reader.role : "anonymous"}`);
  ok(!/\bReferenceError|TypeError\b/.test(html), "no error text leaked into the page");
}

// ---- the command palette ----
const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const DOOR = JSON.parse(readFileSync(join(ENGINE, "..", "contracts", "door.json"), "utf8"));
const REST = DOOR.rest.map((r) => ({ m: r.method, auth: r.auth, re: new RegExp("^" + r.path.replace(/:[a-z]+/gi, "[^/]+") + "$") }));
const doorOf = (path) => REST.find((r) => r.m === "GET" && r.re.test(path));
const attr = (tag, a) => { const m = new RegExp(`\\s${a}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, "x").replace(/\s+/g, " ").trim();
const opts = [{ key: "alpha", name: "Alpha" }, { key: "beta", name: "Beta" }];
const PERSONAS = {
  anonymous: { active: "docs", reader: null, owner: false, proj: null },
  contributor: { active: "decisions", reader: { id: "c", name: "Rae Kim", role: "internal-eng", viaCookie: true }, owner: false, proj: { current: opts[0], options: opts, orgEntry: false } },
  owner: { active: "arch", reader: { id: "o", name: "Owen Park", role: "owner", viaCookie: true }, owner: true, proj: { current: null, options: opts, orgEntry: true } },
  keyLink: { active: "goals", reader: { id: "s", name: "Sam", role: "internal-eng", viaCookie: false }, owner: false, proj: null },
};
const render = (p) => shell({ ...p, content: "<p>x</p>", brand, briefCount: 3 });
const paletteOf = (h) => { const i = h.indexOf('<div class="pal" id="pal"'); return i < 0 ? "" : h.slice(i, h.indexOf("</div>\n</div>", i) + 12); };
const railTabs = (h) => { const nav = (/<nav class="rail-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(h) || [])[1] || "";
  return [...nav.matchAll(/<a\b([^>]*\sdata-tab="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g)].map((m) => `${m[2]}|${attr(m[0], "href")}|${text(m[3].replace(/<span\b[^>]*data-badge[\s\S]*?<\/span>/g, ""))}`); };
const palDests = (pal) => [...pal.matchAll(/<a\b[^>]*\sdata-pal-dest="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => `${m[1]}|${attr(m[0], "href")}|${text((/<span class="pal-label">([\s\S]*?)<\/span>/.exec(m[2]) || [])[1] || "")}`);
const palOptions = (pal) => [...pal.matchAll(/<(a|div)\b[^>]*\srole="option"[^>]*>/g)].map((m) => m[0]);
// paletteAudit(html, persona) -> failures by check id
function paletteAudit(h, name) {
  const f = [], fail = (id, why) => f.push(`${id}: ${why}`);
  const p = PERSONAS[name], pal = paletteOf(h), anon = !p.reader;
  if (!pal) { fail("a11y", "no palette on the page"); return f; }
  // a11y: a modal dialog, a labelled combobox that drives the listbox by aria-activedescendant
  const box = (/<div class="pal-box"[^>]*>/.exec(pal) || [""])[0], input = (/<input id="pal-q"[^>]*>/.exec(pal) || [""])[0];
  if (attr(box, "role") !== "dialog" || attr(box, "aria-modal") !== "true" || !attr(box, "aria-label")) fail("a11y", "the palette is not a labelled modal dialog");
  if (attr(input, "role") !== "combobox" || attr(input, "aria-controls") !== "pal-list" || attr(input, "aria-activedescendant") == null || !attr(input, "aria-label") || attr(input, "data-input-exception") !== "search")
    fail("a11y", "the palette's field is not a labelled combobox on #pal-list with aria-activedescendant (the declared search input)");
  if (!/<div class="pal-list" id="pal-list" role="listbox"/.test(pal)) fail("a11y", "no listbox #pal-list");
  const ids = palOptions(pal).map((t) => attr(t, "id"));
  if (ids.some((x) => !x) || new Set(ids).size !== ids.length || palOptions(pal).some((t) => attr(t, "tabindex") !== "-1")) fail("a11y", "an option without its own id, or reachable by Tab");
  // the destinations ARE the rail's
  const rail = railTabs(h), dests = palDests(pal);
  if (!rail.length || JSON.stringify(rail) !== JSON.stringify(dests)) fail("dest", `the palette's destinations [${dests.join(" ")}] are not the rail's [${rail.join(" ")}]`);
  // every link a GET door; an anonymous visitor's only doors that need no sign-in
  for (const t of palOptions(pal)) { const href = attr(t, "href"); if (!href) continue; const d = doorOf(href.split("?")[0]);
    if (!d) fail("door", `${href} is not a GET door`); else if (anon && d.auth !== "none") fail("anon", `${href} (auth ${d.auth}) offered to an anonymous visitor`); }
  if (anon && (/id="tbFind"|data-pal-find|data-pal-act="project"|data-pal-act="beat"/.test(pal))) fail("anon", "search, a project or what changed offered to an anonymous visitor");
  // sprint 3 B5: the palette searches through GET /search as you type; without the script, Enter opens the Library's search
  if (!anon && !/<form class="pal-field" id="tbFind" method="GET" action="\/library"/.test(pal)) fail("search", "a seated reader's palette does not fall back to the Library's search (GET /library?q=)");
  // the project items: exactly the reader's own
  const keys = [...pal.matchAll(/data-pal-act="project"[^>]*\sdata-key="([^"]*)"/g)].map((m) => m[1]);
  const want = anon || !p.proj ? [] : [...p.proj.options.map((o) => o.key), ...(p.proj.orgEntry ? [""] : [])];
  if (JSON.stringify(keys) !== JSON.stringify(want)) fail("project", `project items [${keys.join(",")}], the reader's own are [${want.join(",")}]`);
  for (const k of keys) if (!new RegExp(`<form method="POST" action="/project"><input type="hidden" name="key" value="${k}">`).test(h)) fail("project", `no switcher form for "${k}" to press`);
  // sign out only for a cookie session
  const out = /href="\/logout"/.test(pal);
  if (out !== !!(p.reader && p.reader.viaCookie)) fail("signout", `sign out ${out ? "offered" : "missing"} for ${name}`);
  return f;
}
const PAGES = Object.fromEntries(Object.entries(PERSONAS).map(([k, p]) => [k, render(p)]));
for (const [k, h] of Object.entries(PAGES)) { const f = paletteAudit(h, k); ok(f.length === 0, `palette (${k}): a labelled modal dialog, the rail's destinations, doors only${k === "anonymous" ? " that need no sign-in" : ""}, the reader's own projects${f.length ? `\n      ${f.join("\n      ")}` : ""}`); }
ok(palDests(paletteOf(PAGES.owner)).length === 8 && /href="\/map"[^>]*data-pal-static/.test(PAGES.owner) && /href="\/versions"[^>]*data-pal-static/.test(PAGES.owner) && /href="\/missing"[^>]*data-pal-static/.test(PAGES.owner),
  "the owner's palette: the eight destinations, the Map (its planes folded into it, sprint 2) and Versions, and What is missing");
ok(palDests(paletteOf(PAGES.anonymous)).map((d) => d.split("|")[0]).join() === "missing,docs", "an anonymous visitor's palette: What is missing and Docs, nothing else to go to");
const PMUT = [
  ["anon", "a member-only page offered to an anonymous visitor", "anonymous", (h) => h.replace('<div class="pal-group" role="group" aria-labelledby="pal-h-go" data-pal-group>', '$&<a class="pal-item" role="option" id="pal-x" tabindex="-1" href="/control" data-pal-static>Control</a>')],
  ["anon", "search offered to an anonymous visitor", "anonymous", (h) => h.replace('<div class="pal-field">', '<div class="pal-field" data-pal-find>')],
  ["dest", "a destination missing from the palette", "contributor", (h) => h.replace(/<a class="pal-item"[^>]*data-pal-dest="gtm"[^>]*>[\s\S]*?<\/a>/, "")],
  ["project", "another reader's project offered", "contributor", (h) => h.replace('data-key="beta"', 'data-key="beta"></div><div class="pal-item" role="option" id="pal-y" tabindex="-1" data-pal-static data-pal-act="project" data-key="gamma"')],
  ["a11y", "the dialog no longer modal", "owner", (h) => h.replace('aria-modal="true"', 'aria-modal="false"')],
  ["a11y", "the combobox loses aria-activedescendant", "owner", (h) => h.replace(' aria-activedescendant=""', "")],
  ["signout", "sign out offered on a reader-key link", "keyLink", (h) => h.replace('<div class="pal-group" role="group" aria-labelledby="pal-h-you" data-pal-group>', '$&<a class="pal-item" role="option" id="pal-z" tabindex="-1" href="/logout" data-pal-static>Sign out</a>')],
];
for (const [id, label, who, mut] of PMUT) { const h = mut(PAGES[who]); const f = paletteAudit(h, who); ok(h !== PAGES[who] && f.some((x) => x.startsWith(id + ":")), `both ways: ${label} goes red on "${id}"${h === PAGES[who] ? " (the injection did not apply)" : ""}`); }

// ---- the badge, the logo, the favicon ----
const badges = (h) => [...h.matchAll(/data-tab="([a-z]+)"[^>]*>(?:(?!<\/a>)[\s\S])*data-badge="needs-you"/g)].map((m) => m[1]);
ok(badges(PAGES.contributor).join() === "home" && badges(PAGES.anonymous).length === 0, `the "needs you" badge once, on Home (${badges(PAGES.contributor).join(",")})`);
const mark = (/<a class="rail-mark"[^>]*data-region="mark">([\s\S]*?)<\/a>/.exec(PAGES.owner) || [])[1] || "";
ok(/<svg class="u-uchan u-logo-mark"/.test(mark) && /class="u-logo-word"[^>]*>sharingu</.test(mark) && /M40 96 L40 176 C40 226 72 250 120 250/.test(mark),
  "the rail's mark is THE logo: U-chan (the brand's own vector) beside the lowercase wordmark");
ok(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg\?v=[0-9a-f]{8}">/.test(PAGES.owner) && FAVICON_LINK.includes("/favicon.svg?v=") && !/data:image\/svg/.test(PAGES.owner)
  && /M40 96 L40 176/.test(FAVICON_SVG) && /prefers-color-scheme:dark/.test(FAVICON_SVG), "the favicon is GET /favicon.svg (U-chan, versioned), never an inline data: URI; its outline lifts off a dark tab strip");
ok(/class="uc-line"/.test(logo({ size: 16 })) && /class="uc-rim"/.test(logo({ size: 16 })) && /u-uchan-sm/.test(logo({ size: 16 })) && !/u-uchan-sm/.test(logo({ size: 32 })) && !/u-logo-word/.test(logo({ wordmark: false })),
  "the logo: the outline in two groups (the silhouette and the lens rims, so Ink keeps both visible), a heavier line at 20px and under, the mark alone on request");

// ---- motion ----
ok(/prefers-reduced-motion: reduce\)'\)\.matches\)document\.documentElement\.classList\.add\('u-motion'\)/.test(THEME_BOOT), "the boot script sets html.u-motion only when reduced motion is not asked for, before the first paint");
const frames = [...MOTION_CSS.matchAll(/@keyframes ([\w-]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)];
const props = new Set(frames.flatMap((m) => [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1])));
ok(frames.length >= 8 && [...props].every((p) => ["opacity", "transform", "stroke-dashoffset"].includes(p)), `every keyframe moves transform, opacity or a stroke offset, never layout (${[...props].join(", ")})`);
ok(MOTION_CSS.split("\n").filter((l) => /animation|:active/.test(l) && !/@keyframes/.test(l)).every((l) => /\.u-motion|u-pulse/.test(l)), "every animation sits behind html.u-motion (the pulse is added only by the script under it)");
const m1 = metric({ key: "k", label: "L", value: 66, count: true, pulse: "k" }), m2 = metric({ key: "k", label: "L", value: null, count: true });
ok(/data-pulse="k" data-metric="k" data-value="66"><span class="u-metric-label">L<\/span><b class="u-metric-n" data-count>66<\/b>/.test(m1) && !/data-count/.test(m2) && /data-value="\?"/.test(m2),
  "metric({ count, pulse }): the number in the markup, data-metric then data-value adjacent (the checks read them so), an unknown never counts");
ok(/<b data-count>2<\/b>/.test(statLine([{ key: "y", value: 2, label: "yours", count: true }])), "statLine items count up on request, the value in the markup");
const pg = progress({ value: 3, max: 4, label: "Done" });
ok(/role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="75" aria-label="Done" data-progress="0\.750"><span class="u-progress-fill" style="--p:0\.750">/.test(pg) && /<b data-count>75%<\/b>/.test(pg) && /data-progress="1\.000"/.test(progress({ value: 9, max: 4 })),
  "progress: a progressbar with its numbers, the fill a transform of the value (clamped), the percentage in the markup");
const sp = spark([1, 3, 2], { label: "Filings", labels: ["Mon", "Tue", "Wed"] });
ok(spark([4]) === "" && /data-spark="line"/.test(sp) && /aria-label="Filings: 1, 3, 2"/.test(sp) && /data-read="Mon: 1\|Tue: 3\|Wed: 2"/.test(sp) && /pathLength="1"/.test(sp) && /data-spark="bars"/.test(spark([1, 2], { kind: "bars" })),
  "spark: nothing under two points, the whole series in its accessible name, a readout per point, a line or bars");
const tb = table({ columns: [{ key: "a", label: "A" }, { key: "n", label: "N", num: true }], rows: [{ cells: { a: "<b>x</b>", n: { html: "<i>3</i>" } } }] });
ok(/<th scope="col">A<\/th><th scope="col" class="num">N<\/th>/.test(tb) && /<td data-label="A">&lt;b&gt;x&lt;\/b&gt;<\/td><td data-label="N" class="num"><i>3<\/i><\/td>/.test(tb) && table({ rows: [], empty: "E" }) === "E",
  "table: scoped headers, numbers right-aligned, a text cell escaped and an { html } cell kept, each cell labelled for the phone's stacked card, the EMPTY in place of no row");
ok(/<nav class="u-pills u-seg" aria-label="P"><a class="u-pill" href="\/a" aria-current="true">A <span class="u-count" data-count>2<\/span><\/a><span class="u-pill">B<\/span><\/nav>/.test(pills([{ label: "A", href: "/a", count: 2, current: true, countUp: true }, { label: "B", href: "https://x.test" }], { label: "P", segment: true })),
  "pills: links (never an input), the current one marked, an off-site href drawn as text, the segmented variant");
ok(/<li><a href="\/goals">Goals<\/a><\/li><li><span aria-current="page">Look<\/span><\/li>/.test(breadcrumb([{ label: "Goals", href: "/goals" }, { label: "Look", href: "/x" }])), "breadcrumb: links up, the current page as text");
ok(/^<p class="state-quiet" data-state="empty">No goal moved\.<\/p>$/.test(emptyState("No goal moved.", { quiet: true })) && /state-empty/.test(emptyState("x")), "the quiet EMPTY: one muted sentence, still data-state=\"empty\"; the boxed one unchanged");
console.log(`shell-render-selftest: ${checks - failed} pass · ${failed} fail`); process.exit(failed ? 1 : 0);
