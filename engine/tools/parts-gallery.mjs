// tools/parts-gallery.mjs — the revision's parts, on one gallery, before any page adopts them (sprint 3, L1; LOOK.md "The revision").
//
//   node tools/parts-gallery.mjs [--no-shots] [--pages gallery,home,...] [--themes paper,ink] [--widths 1440,390] [--out .runs/look]
//
// Builds, with NO worker and NO data read:
//   .runs/look/gallery.html          every part of src/parts.js in every state (the specimen), with links to the pages below
//   .runs/look/pages/<name>.html     eight composed mock pages built ONLY from the parts (and ui.js's buttons and breadcrumb),
//                                    on realistic sample data: home, goals, decisions, build, gtm, question, contribution, missing
// Every page is the REAL shell (src/shell.js shell(): the rail, the tokens of both worlds, the one stylesheet, the motion
// script) with src/parts.js PARTS_CSS beside it, and the self-hosted faces inlined as data: URLs, so a file opens alone in any
// browser. The rail's destinations point at the sibling mock pages.
// Then it shoots each page in Paper and Ink at 1440 and 390 (the whole page, capped) into .runs/look/shots/<name>-<theme>-<w>.png
// with the pinned Chrome for Testing tools/shots.mjs drives (~/.sharingu/chrome-for-testing.app; never the owner's Chrome),
// over the DevTools protocol with Node's own WebSocket. Reads nothing from D1, starts no worker, writes only under .runs/look.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { shell } from "../src/shell.js";
import { FONT_B64 } from "../src/fontdata.js";
import { FAVICON_SVG, breadcrumb, pills } from "../src/ui.js";
import * as P from "../src/parts.js";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const OUT = join(ENGINE, arg("out", ".runs/look"));
const PAGES_DIR = join(OUT, "pages");
const SHOTS = join(OUT, "shots");
const NOW = Date.parse("2026-10-02T10:40:00Z");
const ago = (iso) => P.ago(iso, NOW);
const { card, tile, tileRow, avatar, avatarStack, bar, segBar, miniBars, sparkline, ring, chip, filterRow, hrefWith, group, line, lines, lineDetail, facts, optionCards, empty, pageHead, cols, stack, btn, id } = P;

// ---- the sample world: one org, one project, six people, realistic rows (sharingu's own, lightly edited) ----
const PEOPLE = {
  robin: { id: "p-robin", name: "Robin Ryuk", tone: "gold", initials: "RR" },
  nia: { id: "p-nia", name: "Nia Mensah", tone: "sky", initials: "NM" },
  kai: { id: "p-kai", name: "Kai Tanaka", tone: "violet", initials: "KT" },
  sara: { id: "p-sara", name: "Sara Iqbal", tone: "stone", initials: "SI" },
  leo: { id: "p-leo", name: "Leo Brandt", tone: "sky", initials: "LB" },
  mira: { id: "p-mira", name: "Mira Okafor", tone: "gold", initials: "MO" },
};
const { robin, nia, kai, sara, leo, mira } = PEOPLE;
const T = (h) => new Date(NOW - h * 3600e3).toISOString();
const DAYS = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"];
const reader = { name: "Robin Ryuk", role: "owner", hats: ["management"], avatar: "gold:RR", viaCookie: true };
const proj = { current: { key: "sharingu", name: "sharingu" }, options: [{ key: "sharingu", name: "sharingu" }, { key: "siru", name: "siru" }, { key: "saruspay", name: "saruspay" }, { key: "bunny", name: "bunny" }], orgEntry: true };
const brand = { org: "Ryuklabs" };
const ghost = (label, href) => btn(label, { href, ghost: true });
const link = (label, href) => `<a class="u-link" href="${href}">${label}</a>`;
const copyBtn = (title) => `<button type="button" class="u-btn small ghost" title="${title}" data-button="copy-call">Copy</button>`;

// ---- the specimen: every part, every state ----
const spec = (label, inner, wide = false) => `<div class="g-spec${wide ? " g-wide" : ""}"><p class="g-cap">${label}</p><div class="g-body">${inner}</div></div>`;
// a specimen section is NOT a card (the parts inside it are): a mono label over a hairline
const sec = (name, specs) => `<section class="g-sec" data-region="part-${name.split(" ")[0]}"><h2 class="p-label">${name}</h2><div class="g-grid">${specs.join("")}</div></section>`;
const faceSrc = pathToFileURL(join(PAGES_DIR, "face.svg")).pathname;
function specimen() {
  const t1 = tileRow([
    tile({ label: "Needs you", value: 2, tone: "warn", sub: "2 decide", href: "/decisions" }),
    tile({ label: "In motion", value: 63, chart: sparkline([41, 44, 47, 52, 55, 60, 63], { label: "In motion a day" }), sub: "+8 this week" }),
    tile({ label: "Landed · 7d", value: 63, chart: miniBars([4, 9, 12, 6, 14, 10, 8], { labels: DAYS, label: "Landed a day" }) }),
    tile({ label: "Goals", value: 15, unit: "of 21", chart: ring({ value: 15, max: 21, size: 36, center: "", label: "Goals done" }) }),
    tile({ label: "Checklist", value: 87, unit: "%", chart: bar({ value: 0.87, show: "", width: 72, label: "Checklist" }) }),
  ], { label: "Glance" });
  const t2 = tileRow([
    tile({ label: "Plain", value: "1,204" }),
    tile({ label: "Unit and sub", value: 32, unit: "of 48", sub: "16 gating" }),
    tile({ label: "Tone ok", value: 51, tone: "ok" }),
    tile({ label: "Tone bad", value: 1, tone: "bad", sub: "refused" }),
    tile({ label: "Not read", value: null }),
    tile({ label: "Stacked week", value: 37, chart: miniBars([3, 5, 2, 0, 6, 4, 5], { stack: [1, 2, 1, 0, 2, 3, 2], labels: DAYS, label: "Filed and landed a day" }) }),
  ], { label: "Tile states" });
  const sampleLines = lines([
    line({ lead: avatar(nia), title: "The door findings pass: 23 fixes from the four real runs", href: "/contribution/T-1", sub: "D1b: the door findings pass", meta: `${chip("Landed", { tone: "ok" })}<span>23m</span>` }),
    line({ lead: chip("Open", { tone: "warn" }), title: "Which number says sharingu is working?", sub: "the aim", meta: "3 options", action: btn("Rule", { href: "/question/q" }) }),
  ]);
  return `${pageHead({ title: "The parts", crumbs: [{ label: "Look", href: "/home" }, { label: "Gallery" }], actions: [ghost("Paper and Ink", "#"), btn("Pages", { href: "#pages", primary: false })] })}
<nav class="g-index" id="pages" aria-label="Composed pages">${["home", "goals", "decisions", "build", "gtm", "question", "contribution", "missing"].map((n) => `<a class="p-fchip" href="pages/${n}.html">${n}</a>`).join("")}</nav>
${stack(
  sec("tile and tileRow", [spec("tileRow · the glance strip", t1, true), spec("tile · states", t2, true)]),
  sec("card", [
    spec("default · count · one action", card({ label: "In motion", count: 63, action: link("All", "/build"), body: `<p class="g-p">Body</p>` })),
    spec("needs you", card({ label: "Needs you", count: 2, tone: "needs", flush: true, body: sampleLines })),
    spec("quiet", card({ label: "Options", tone: "quiet", body: `<p class="g-p">A label and its body, no edge</p>` })),
    spec("flush · empty", card({ label: "Follow-ups", flush: true, body: empty("No follow-up due") })),
  ]),
  sec("avatar and avatarStack", [
    spec("sizes 20 · 24 · 32, tones, a picture", `<div class="g-row">${[20, 24, 32].map((s) => [robin, nia, kai, sara].map((p) => avatar({ ...p, size: s })).join("") + avatar({ name: "Leo Brandt", src: faceSrc, size: s })).join('<span class="g-gap"></span>')}</div>`),
    spec("stacks: 2 · 4 · 7 (+N)", `<div class="g-row">${avatarStack([robin, nia])}<span class="g-gap"></span>${avatarStack([robin, nia, kai, sara])}<span class="g-gap"></span>${avatarStack(Object.values(PEOPLE).concat([{ name: "Ada Brook" }]), { max: 4 })}<span class="g-gap"></span>${avatarStack([robin, nia, kai, sara, leo], { size: 20, max: 3 })}</div>`),
  ]),
  sec("bar", [
    spec("0 · 35 · 70 · 100", `<div class="g-col">${[0, 0.35, 0.7, 1].map((v) => bar({ value: v, width: 220 })).join("")}</div>`),
    spec("count of a target · status tones", `<div class="g-col">${bar({ value: 3, max: 5, show: "of", width: 220 })}${bar({ value: 1, tone: "ok", width: 220 })}${bar({ value: 0.2, tone: "warn", width: 220 })}${bar({ value: 0.1, tone: "bad", width: 220 })}</div>`),
  ]),
  sec("segBar", [
    spec("done · in progress · not started", segBar({ label: "Goals", segments: [{ label: "done", value: 31, tone: "done" }, { label: "in progress", value: 12, tone: "progress" }, { label: "not started", value: 12, tone: "todo" }] })),
    spec("statuses", segBar({ label: "Checks", segments: [{ label: "proven", value: 212, tone: "ok" }, { label: "incomplete", value: 34, tone: "warn" }, { label: "refused", value: 3, tone: "bad" }, { label: "not graded", value: 120, tone: "todo" }] })),
    spec("nothing yet · no legend", `<div class="g-col">${segBar({ label: "Goals", segments: [{ label: "done", value: 0 }] })}${segBar({ label: "Stages", legend: false, segments: [{ label: "done", value: 32, tone: "done" }, { label: "to go", value: 16, tone: "todo" }] })}</div>`),
  ]),
  sec("miniBars and sparkline", [
    spec("a week · labels", miniBars([4, 9, 12, 6, 14, 10, 8], { labels: DAYS, label: "Landed a day", showLabels: true, width: 140, height: 40 })),
    spec("two series stacked", miniBars([3, 5, 2, 4, 6, 4, 5], { stack: [1, 2, 1, 2, 2, 3, 2], labels: DAYS, label: "Filed and landed", showLabels: true, width: 140, height: 40 })),
    spec("quiet days (zeros)", miniBars([0, 2, 0, 0, 1, 0, 3], { labels: DAYS, label: "Ruled a day", showLabels: true, width: 140, height: 40 })),
    spec("sparkline · up · flat · down", `<div class="g-row">${sparkline([3, 5, 4, 8, 6, 9, 12], { label: "Filed" })}<span class="g-gap"></span>${sparkline([6, 6, 7, 6, 6, 7, 6], { label: "Open" })}<span class="g-gap"></span>${sparkline([14, 12, 12, 9, 7, 5, 4], { label: "Behind" })}</div>`),
  ]),
  sec("ring", [
    spec("sizes 16 · 20 · 24 · 32 · 44", `<div class="g-row">${[16, 20, 24, 32, 44].map((s) => ring({ value: 15, max: 21, size: s, label: "Goals" })).join('<span class="g-gap"></span>')}</div>`),
    spec("0 · part · full · tones", `<div class="g-row">${ring({ value: 0, max: 10, size: 32 })}<span class="g-gap"></span>${ring({ value: 4, max: 10, size: 32 })}<span class="g-gap"></span>${ring({ value: 10, max: 10, size: 32 })}<span class="g-gap"></span>${ring({ value: 4, max: 4, size: 32, tone: "ok" })}<span class="g-gap"></span>${ring({ value: 1, max: 4, size: 32, tone: "warn" })}</div>`),
  ]),
  sec("chip", [
    spec("tones", `<div class="g-row">${["quiet", "ok", "warn", "bad", "accent"].map((t) => chip(t === "quiet" ? "In progress" : t === "ok" ? "Landed" : t === "warn" ? "Open" : t === "bad" ? "Refused" : "New", { tone: t })).join("")}</div>`),
    spec("with a count · as a link", `<div class="g-row">${chip("Stale", { tone: "warn", count: 2 })}${chip("pr", { count: 40 })}${chip("Proven", { tone: "ok", count: 212 })}${chip("the MCP", { href: "/decisions?area=mcp" })}</div>`),
  ]),
  sec("filterRow", [
    spec("status · lane · person · time; one set, so Clear shows (at 390 the rest folds into More)", filterRow({
      clear: "/build",
      groups: [
        { key: "status", label: "Status", items: [{ label: "All", count: 63, href: "/build?" }, { label: "Landed", count: 51, href: "/build?status=landed", current: true }, { label: "In", count: 8, href: "/build?status=in" }, { label: "Needs more", count: 4, href: "/build?status=more" }, { label: "Refused", count: 0, href: "/build?status=refused" }] },
        { key: "kind", label: "Kind", items: [{ label: "pr", count: 40, href: "/build?kind=pr" }, { label: "doc", count: 21, href: "/build?kind=doc" }, { label: "note", count: 2, href: "/build?kind=note" }] },
        { key: "by", label: "Person", items: [{ label: "Robin", count: 40, href: "/build?by=robin", person: robin }, { label: "Nia", count: 12, href: "/build?by=nia", person: nia }, { label: "Kai", count: 8, href: "/build?by=kai", person: kai }] },
        { key: "when", label: "Time", items: [{ label: "Today", href: "/build?when=today" }, { label: "7 days", href: "/build?when=7d" }, { label: "All time", href: "/build", current: true, all: true }] },
      ],
    }), true),
  ]),
  sec("group and line", [
    spec("groups: open · folded with a summary (the settled one)", card({ label: "Tree", count: 55, flush: true, body:
      group({ title: "Beta: every line of the gate passes on live", count: 4, open: true, summary: `${avatarStack([robin, nia, kai], { size: 20 })}${bar({ value: 0.7 })}`, body: lines([
        line({ lead: ring({ value: 7, max: 10, size: 20 }), title: "Sprint 3: the MCP whole", href: "/goals/g3", meta: `${avatarStack([nia, kai], { size: 20 })}${bar({ value: 0.7 })}` }),
        line({ lead: ring({ value: 2, max: 10, size: 20 }), title: "The walkthrough video recorded again on real data, every screen in both worlds", href: "/goals/g4", meta: `${avatarStack([mira], { size: 20 })}${bar({ value: 0.2 })}` }),
      ]) })
      + group({ title: "Sprint 1: the MCP brings the app alive", count: 7, summary: `${chip("Done", { tone: "ok" })}${bar({ value: 1 })}`, body: lines([line({ title: "Slice 0: the knowledge core" })]) })
      + group({ title: "No goal named", count: 4, summary: avatarStack([sara, leo], { size: 20 }), body: lines([line({ title: "A note" })]) }) }), true),
    spec("lines: lead chip · face · ring; a cut title; an action; one open with its detail", card({ label: "Lines", flush: true, body: lines([
      line({ lead: chip("Open", { tone: "warn" }), title: "How do directory listings reach each org's own MCP address?", href: "/question/q2", sub: "the marketplace", meta: `${avatar(robin)}<span>3 options</span>`, action: btn("Rule", { href: "/question/q2" }) }),
      line({ lead: avatar(nia), title: "The ship's order written down with the rename and the prune; S4 ticked, the budget tools know the plan and the ship tools are ready for this ship", href: "/contribution/T-2", sub: "S4: the budget tools know the plan", meta: `${chip("Landed", { tone: "ok" })}<span>45m</span>` }),
      line({ lead: ring({ value: 2, max: 3, size: 20 }), title: "The aim's measure", sub: "Home", meta: "2 of 3", action: copyBtn("Copy the call that files it") }),
      line({ lead: avatar(kai), title: "sharingu's model and checks are generated from this repo's code", sub: "P2b: the model from the code", meta: `${chip("In", { tone: "quiet" })}<span>1h</span>`, open: true,
        detail: lineDetail({ facts: [["Id", id("T-20261002-011")], ["Kind", "pr"], ["Goal", link("P2b: the model from the code", "/goals/p2b")], ["Grade", `${ring({ value: 4, max: 4, size: 16 })} complete`], ["Happened", "2 Oct"], ["By", `${avatar({ ...kai, size: 20 })}Kai Tanaka`]], actions: `${btn("Open", { href: "/contribution/T-3" })}${btn("Rank first", { ghost: true })}` }) }),
      line({ lead: avatar(sara), title: "Folded detail (press to open)", sub: "a closed row", meta: "2d", detail: lineDetail({ facts: [["Id", id("T-20260930-004")]] }) }),
    ]) }), true),
  ]),
  sec("facts", [spec("a detail page's header", facts([{ label: "Status", html: chip("Landed", { tone: "ok" }) }, { label: "By", html: `${avatar(nia)}Nia Mensah` }, { label: "Filed", value: "23m ago" }, { label: "Kind", value: "pr" }, { label: "Grade", html: `${ring({ value: 4, max: 4, size: 20 })}complete` }]), true)]),
  sec("optionCards", [
    spec("open · one recommended · each a form", optionCards({ action: "/question/Q-aim-measure/rule", options: [
      { key: "A", label: "Weekly company goals with a count", detail: "Each org's own goals, counted weekly from what is filed.", fields: { choice: "A" } },
      { key: "B", label: "Activated organisations", detail: "An org counts once a member files through the MCP in its first week.", recommended: true, fields: { choice: "B" } },
      { key: "C", label: "Week-1 and week-4 return", detail: "The share of people who file again in week 1 and in week 4.", fields: { choice: "C" } },
    ] }), true),
    spec("ruled (B)", optionCards({ chosen: "B", options: [{ key: "A", label: "One hosted address" }, { key: "B", label: "List our own hosted org address" }, { key: "C", label: "No directory listing yet" }] }), true),
    spec("not yours to rule (disabled, the reason in its title)", optionCards({ action: "/question/q/rule", disabled: "Only Robin Ryuk rules this", options: [{ key: "A", label: "Ship on Friday" }, { key: "B", label: "Ship on Monday", recommended: true }] }), true),
  ]),
  sec("empty", [
    spec("a phrase", empty("No goals yet")),
    spec("a phrase and one button", empty("Nothing contributed yet", { action: { href: "/missing", label: "What is missing" } })),
  ]),
)}`;
}

// ---- the five tab pages ----
function home() {
  const needs = [
    { q: "Which number says sharingu is working?", area: "the aim", n: 3, id: "Q-aim-measure", at: T(30) },
    { q: "How do directory listings reach each org's own MCP address?", area: "the marketplace", n: 3, id: "Q-marketplace-address", at: T(20) },
  ];
  const motion = [
    { by: nia, t: "The door findings pass: 23 fixes from the four real runs", g: "D1b: the door findings pass", h: 0.4, s: "Landed" },
    { by: robin, t: "The ship's order written down with the rename and the prune", g: "S4: the ship tools ready", h: 0.75, s: "Landed" },
    { by: kai, t: "sharingu's model and checks are generated from this repo's code", g: "P2b: the model from the code", h: 1.2, s: "In" },
    { by: sara, t: "siru's measure, ruled: pharmacies with doors open in the Thiruvallur pilot", g: "P2: every project sharp", h: 2.1, s: "Landed" },
  ];
  const main = stack(
    card({ label: "Needs you", count: 2, tone: "needs", flush: true, region: "needs-you", action: link("Decisions", "/decisions"), body: lines(needs.map((x) => line({
      lead: chip("Decide"), title: x.q, href: `/question/${x.id}`, sub: x.area, meta: `<span>${x.n} options</span><span>${ago(x.at)}</span>`, action: btn("Rule", { href: `/question/${x.id}` }),
    }))) }),
    card({ label: "In motion", count: 63, flush: true, region: "in-motion", action: link("Build", "/build"), body:
      group({ title: "Today", count: 12, open: true, summary: avatarStack([nia, robin, kai, sara, leo], { size: 20 }), body: lines(motion.map((x) => line({
        lead: avatar(x.by), title: x.t, href: "/contribution/T", sub: x.g, meta: `${chip(x.s, { tone: x.s === "Landed" ? "ok" : "quiet" })}<span>${ago(T(x.h))}</span>` }))) })
      + group({ title: "Yesterday", count: 20, summary: `${avatarStack([robin, nia, mira], { size: 20 })}<span>18 landed</span>`, body: lines([line({ title: "…" })]) })
      + group({ title: "Earlier this week", count: 31, summary: `${avatarStack([robin, kai, sara, leo, mira], { size: 20 })}<span>31 landed</span>`, body: lines([line({ title: "…" })]) }) }),
  );
  const side = stack(
    card({ label: "Aim", region: "aim", action: chip("No measure", { href: "/missing", title: "What is missing names it" }), body: `<p class="g-aim">A closed loop for everything happening in an organisation: contributions come in through the MCP, the app shows them, people decide, and what is still missing feeds the next contribution.</p>` }),
    card({ label: "Goals moved", count: 3, flush: true, region: "goals-moved", action: link("Goals", "/goals"), body: lines([
      line({ lead: ring({ value: 7, max: 10, size: 20 }), title: "Beta: the gate passes on live", href: "/goals/b", meta: "70%" }),
      line({ lead: ring({ value: 9, max: 10, size: 20 }), title: "Stage A: close sprint 2", href: "/goals/a", meta: "92%" }),
      line({ lead: ring({ value: 3, max: 10, size: 20 }), title: "Stage B: sprint 3, the MCP whole", href: "/goals/s3", meta: "35%" }),
    ], { compact: true }) }),
    card({ label: "People · 7 days", count: 5, flush: true, region: "people", body: lines([[robin, [6, 9, 4, 7, 8, 5, 1], 40], [nia, [2, 1, 3, 2, 0, 3, 1], 12], [kai, [0, 2, 1, 0, 3, 1, 1], 8], [sara, [1, 0, 0, 1, 0, 0, 0], 2], [mira, [0, 0, 1, 0, 0, 0, 0], 1]].map(([p, w, n]) => line({
      lead: avatar(p), title: p.name, meta: `${miniBars(w, { width: 56, height: 16, labels: DAYS, label: `${p.name}, a day` })}<span class="g-n">${n}</span>` })), { compact: true }) }),
    card({ label: "Follow-ups", flush: true, region: "follow-ups", body: empty("No follow-up due") }),
  );
  return `${pageHead({ title: "sharingu", actions: [ghost("Library", "/library"), btn("What changed", { href: "/changes" })] })}
${stack(tileRow([
    tile({ label: "Needs you", value: 2, tone: "warn", sub: "2 decide", href: "/decisions?status=open", key: "needs-you" }),
    tile({ label: "In motion", value: 63, chart: sparkline([41, 44, 47, 52, 55, 60, 63], { label: "In motion a day" }), sub: "+8 this week", key: "in-motion" }),
    tile({ label: "Landed · 7d", value: 63, chart: miniBars([4, 9, 12, 6, 14, 10, 8], { labels: DAYS, label: "Landed a day" }), key: "shipped" }),
    tile({ label: "Goals", value: 15, unit: "of 21", chart: ring({ value: 15, max: 21, size: 36, center: "", label: "Goals done" }), href: "/goals" }),
    tile({ label: "Filled", value: 87, unit: "%", chart: bar({ value: 0.87, show: "", width: 64, label: "The checklist" }), sub: "6 open", href: "/missing" }),
  ], { label: "How it is going", region: "glance" }), cols(main, side))}`;
}

function goals() {
  const fq = { period: "all" };
  const H = (k, v) => hrefWith("/goals", fq, k, v);
  const sub = (rows) => lines(rows.map(([t, v, ppl, open]) => line({
    lead: ring({ value: v, max: 100, size: 20, label: "done" }), title: t, href: "/goals/x", meta: `${avatarStack(ppl, { size: 20 })}${bar({ value: v / 100, width: 96 })}`,
    open, detail: open ? lineDetail({ facts: [["Id", id("G-beta-gate")], ["Measured by", "code 0 of 1 · leader 3 of 1"], ["Fed by", "62 contributions"], ["Owner", `${avatar({ ...robin, size: 20 })}Robin Ryuk`]], actions: btn("Open", { href: "/goals/x" }) }) : "" })));
  const tree = group({ title: "Beta on live, then the marketplace launch", count: 4, open: true, summary: `${avatarStack([robin, nia, kai, mira], { size: 20 })}${bar({ value: 0.35 })}`, body: sub([
      ["Beta: every line of the gate passes on live", 70, [robin, nia, kai], false],
      ["Stage B: sprint 3, the MCP whole", 35, [nia, kai], false],
      ["The walkthrough video recorded again on real data", 20, [mira], false],
      ["The marketplace launch (after beta)", 0, [], false],
    ]) })
    + group({ title: "Stage A: close sprint 2 and ship it", count: 6, open: true, summary: `${avatarStack([robin, sara], { size: 20 })}${bar({ value: 0.92 })}`, body: sub([
      ["The look: five projects, the atlas", 92, [robin, sara], true],
      ["Slice 5: the importer files the old brains through the MCP", 85, [robin], false],
    ]) })
    + group({ title: "Sprint 1: the MCP brings the app alive", count: 7, summary: `${chip("Done", { tone: "ok" })}${bar({ value: 1 })}`, body: sub([["Slice 0: the knowledge core", 100, [robin], false]]) })
    + group({ title: "Setup: the old build machinery deleted", count: 3, summary: `${chip("Done", { tone: "ok" })}${bar({ value: 1 })}`, body: sub([["The process rewritten", 100, [robin], false]]) });
  const side = stack(
    card({ label: "What fed the top goal", count: 63, flush: true, body: lines([["build", 40], ["plans", 23], ["gtm", 0]].filter(([, n]) => n).map(([k, n]) => line({ title: k, meta: `${bar({ value: n, max: 63, show: "", width: 120 })}<span class="g-n">${n}</span>` })), { compact: true }) }),
    card({ label: "Blocked", flush: true, body: empty("Nothing blocked") }),
  );
  return `${pageHead({ title: "Goals" })}
${stack(
    tileRow([
      tile({ label: "Goals", value: 55, chart: segBar({ legend: false, label: "Goals", segments: [{ label: "done", value: 31, tone: "done" }, { label: "in progress", value: 12, tone: "progress" }, { label: "not started", value: 12, tone: "todo" }] }), sub: "31 done · 12 in progress" }),
      tile({ label: "Top goal", value: 35, unit: "%", chart: ring({ value: 35, max: 100, size: 36, center: "", label: "Top goal" }) }),
      tile({ label: "Feeding · 7d", value: 63, chart: sparkline([30, 34, 41, 45, 52, 58, 63], { label: "Contributions feeding a goal" }) }),
      tile({ label: "No feed", value: 14, tone: "warn", href: H("status", "unfed") }),
    ], { label: "How it is going", region: "glance" }),
    filterRow({ clear: "/goals", groups: [
      { key: "status", label: "Status", items: [{ label: "All", count: 55, href: H("status", ""), current: true, all: true }, { label: "In progress", count: 12, href: H("status", "progress") }, { label: "Done", count: 31, href: H("status", "done") }, { label: "Not started", count: 12, href: H("status", "todo") }, { label: "No feed", count: 14, href: H("status", "unfed") }] },
      { key: "lane", label: "Lane", items: [{ label: "build", count: 40, href: H("lane", "build") }, { label: "plans", count: 23, href: H("lane", "plans") }, { label: "gtm", count: 0, href: H("lane", "gtm") }] },
      { key: "by", label: "Person", items: [{ label: "Robin", count: 31, href: H("by", "robin"), person: robin }, { label: "Nia", count: 9, href: H("by", "nia"), person: nia }, { label: "Kai", count: 6, href: H("by", "kai"), person: kai }] },
      { key: "period", label: "Time", items: [{ label: "Quarter", href: H("period", "quarter") }, { label: "Month", href: H("period", "month") }, { label: "All time", href: H("period", "all"), current: true, all: true }] },
    ] }),
    cols(card({ label: "Tree", count: 55, flush: true, region: "tree", body: tree }), side),
  )}`;
}

function decisions() {
  const fq = {};
  const H = (k, v) => hrefWith("/decisions", fq, k, v);
  const open = [
    { q: "Which number says sharingu is working?", area: "the aim", id: "Q-aim-measure", at: T(30), opts: ["Weekly company goals with a count", "Activated organisations", "Week-1 and week-4 return"] },
    { q: "How do directory listings reach each org's own MCP address?", area: "the marketplace", id: "Q-marketplace-address", at: T(20), opts: ["One hosted address that routes by org", "List our own hosted org address", "No directory listing yet"] },
  ];
  const ruled = (rows) => lines(rows.map(([q, k, a, d]) => line({ lead: chip(k), title: q, href: "/question/R", sub: a, meta: `<span>${d}</span>` })));
  return `${pageHead({ title: "Decisions", actions: [ghost("Export the round", "/decisions/export"), btn("Answer in bulk", { attrs: 'data-button="answer-bulk"' })] })}
${stack(
    tileRow([
      tile({ label: "Open", value: 2, tone: "warn", sub: "both yours", href: H("status", "open") }),
      tile({ label: "In force", value: 78, href: H("status", "in-force") }),
      tile({ label: "Ruled · 7d", value: 9, chart: miniBars([0, 2, 0, 1, 3, 1, 2], { labels: DAYS, label: "Ruled a day" }) }),
      tile({ label: "Superseded", value: 1, href: H("status", "superseded") }),
    ], { label: "How it is going", region: "glance" }),
    filterRow({ clear: "/decisions", groups: [
      { key: "status", label: "Status", items: [{ label: "All", count: 81, href: H("status", ""), current: true, all: true }, { label: "Open", count: 2, href: H("status", "open") }, { label: "In force", count: 78, href: H("status", "in-force") }, { label: "Superseded", count: 1, href: H("status", "superseded") }, { label: "Countered", count: 0, href: H("status", "countered") }] },
      { key: "area", label: "Area", max: 4, items: [["the MCP", 21], ["the ship", 9], ["beta", 6], ["the screens atlas", 4], ["the aim", 1], ["the marketplace", 1]].map(([a, n]) => ({ label: a, count: n, href: H("area", a) })) },
      { key: "owed", label: "Owed by", items: [{ label: "You", count: 2, href: H("owed", "me"), person: robin }] },
      { key: "when", label: "Time", items: [{ label: "7 days", href: H("when", "7d") }, { label: "30 days", href: H("when", "30d") }, { label: "All time", href: H("when", ""), current: true, all: true }] },
    ] }),
    card({ label: "Open", count: 2, tone: "needs", flush: true, region: "open", body: lines(open.map((x, i) => line({
      title: x.q, href: `/question/${x.id}`, sub: x.area, meta: `${avatar(robin)}<span>${ago(x.at)}</span>`, action: btn("Rule", { href: `/question/${x.id}` }), open: i === 0,
      detail: lineDetail({ facts: [["Id", id(x.id)], ["Area", x.area], ["Asked", "30 Sep"], ["Owed by", `${avatar({ ...robin, size: 20 })}You`]], body: `<ol class="g-opts">${x.opts.map((o, j) => `<li><b>${"ABC"[j]}</b>${o}</li>`).join("")}</ol>` }),
    }))) }),
    card({ label: "Ruled", count: 79, flush: true, region: "ruled", body:
      group({ title: "the screens atlas", count: 4, open: true, summary: "last 1 Oct", body: ruled([
        ["Does a new picture of a screen make the grades on that screen stale?", "A", "No: a grade is about behaviour, a picture is evidence", "2 Oct"],
        ["How do screens reach sharingu?", "—", "Through the MCP in one standard format, piece by piece", "1 Oct"],
        ["How does the app show a project's screens?", "B", "A Screens view on the Map, per app", "1 Oct"],
        ["Which render wins when two are filed for one state?", "A", "The newest, the older kept as a version", "30 Sep"],
      ]) })
      + group({ title: "beta", count: 6, summary: "last 1 Oct", body: ruled([["What does beta mean?", "A", "Every line of the gate passes on live", "1 Oct"]]) })
      + group({ title: "the ship", count: 9, summary: "last 2 Oct", body: ruled([["At the ship, is the old-brain model removed from live?", "A", "Yes, pruned at the ship", "2 Oct"]]) })
      + group({ title: "the MCP", count: 21, summary: "last 29 Sep", body: ruled([["Is the MCP the only input?", "A", "Yes", "30 Sep"]]) }) }),
  )}`;
}

function build() {
  const fq = {};
  const H = (k, v) => hrefWith("/build", fq, k, v);
  const rows = [
    { by: nia, t: "The door findings pass: 23 fixes from the four real runs", g: "D1b: the door findings pass", h: 0.4, s: "Landed", k: "pr" },
    { by: robin, t: "The door findings pass ticked; D2 and the candidate rebuild in flight", g: "D1b: the door findings pass", h: 0.38, s: "Landed", k: "doc" },
    { by: robin, t: "The ship's order written down with the rename and the prune; S4 ticked", g: "S4: the ship tools ready", h: 0.75, s: "Landed", k: "doc" },
    { by: kai, t: "sharingu's model and checks are generated from this repo's code", g: "P2b: the model from the code", h: 1.2, s: "In", k: "pr" },
    { by: leo, t: "The ship candidate's overlays: the four projects' basics", g: "P2: every project sharp", h: 2.2, s: "Needs more", k: "pr" },
    { by: sara, t: "siru's measure, ruled: pharmacies with doors open in the Thiruvallur pilot", g: "P2: every project sharp", h: 2.1, s: "Landed", k: "note" },
  ];
  const tone = (s) => (s === "Landed" ? "ok" : s === "Needs more" ? "warn" : "quiet");
  const side = stack(
    card({ label: "By kind", count: 63, flush: true, body: lines([["pr", 40], ["doc", 21], ["note", 2]].map(([k, n]) => line({ title: k, href: H("kind", k), meta: `${bar({ value: n, max: 63, show: "", width: 120 })}<span class="g-n">${n}</span>` })), { compact: true }) }),
    card({ label: "Finish line", count: "32/48", region: "finish-line", body: segBar({ label: "Stages", segments: [{ label: "done", value: 32, tone: "done" }, { label: "gating", value: 16, tone: "todo" }] }) }),
  );
  const sort = pills([{ label: "Ranked", href: "/build", current: true }, { label: "Newest", href: "/build?sort=newest" }, { label: "By goal", href: "/build?sort=goal" }], { label: "Order", segment: true, attrs: 'data-button="sort"' });
  return `${pageHead({ title: "Build" })}
${stack(
    tileRow([
      tile({ label: "Open", value: 63, key: "contributions" }),
      tile({ label: "In motion", value: 8, chart: sparkline([5, 7, 6, 9, 8, 10, 8], { label: "In motion a day" }), key: "in-motion" }),
      tile({ label: "Filed · 7d", value: 37, chart: miniBars([3, 5, 2, 4, 6, 4, 5], { stack: [1, 2, 1, 2, 2, 3, 2], labels: DAYS, label: "Landed and still open a day" }), sub: "28 landed", key: "on-canvas-week" }),
      tile({ label: "Finish line", value: 32, unit: "of 48", chart: ring({ value: 32, max: 48, size: 36, center: "", label: "Stages done" }), sub: "16 gating", key: "stages-done" }),
    ], { label: "How it is going", region: "glance" }),
    filterRow({ clear: "/build", groups: [
      { key: "status", label: "Status", items: [{ label: "All", count: 63, href: H("status", ""), current: true, all: true }, { label: "Landed", count: 51, href: H("status", "landed") }, { label: "In", count: 8, href: H("status", "in") }, { label: "Needs more", count: 4, href: H("status", "more") }] },
      { key: "kind", label: "Kind", items: [{ label: "pr", count: 40, href: H("kind", "pr") }, { label: "doc", count: 21, href: H("kind", "doc") }, { label: "note", count: 2, href: H("kind", "note") }] },
      { key: "by", label: "Person", items: [{ label: "Robin", count: 40, href: H("by", "robin"), person: robin }, { label: "Nia", count: 12, href: H("by", "nia"), person: nia }, { label: "Kai", count: 8, href: H("by", "kai"), person: kai }, { label: "Leo", count: 3, href: H("by", "leo"), person: leo }] },
      { key: "when", label: "Time", items: [{ label: "Today", href: H("when", "today") }, { label: "7 days", href: H("when", "7d") }, { label: "All time", href: H("when", ""), current: true, all: true }] },
    ] }),
    cols(card({ label: "Contributions", count: 63, flush: true, region: "filings", action: sort, body:
      group({ title: "Today", count: 12, open: true, summary: avatarStack([nia, robin, kai, leo, sara], { size: 20 }), body: lines(rows.map((x, i) => line({
        lead: avatar(x.by), title: x.t, href: "/contribution/T", sub: x.g, meta: `${chip(x.s, { tone: tone(x.s) })}<span>${ago(T(x.h))}</span>`, open: i === 3,
        detail: lineDetail({ facts: [["Id", id(`T-20261002-0${14 - i}`)], ["Kind", x.k], ["By", `${avatar({ ...x.by, size: 20 })}${x.by.name}`], ["Goal", link(x.g, "/goals/x")], ["Grade", `${ring({ value: 3, max: 4, size: 16 })} 3 of 4`], ["Happened", "2 Oct"]], actions: `${btn("Open", { href: "/contribution/T" })}${btn("Rank first", { ghost: true, attrs: 'data-button="rank"' })}` }) }))) })
      + group({ title: "Yesterday", count: 20, summary: `${avatarStack([robin, nia, mira], { size: 20 })}<span>18 landed</span>`, body: lines([line({ title: "…" })]) })
      + group({ title: "Earlier", count: 31, summary: `${avatarStack([robin, kai, sara, leo, mira], { size: 20 })}<span>31 landed</span>`, body: lines([line({ title: "…" })]) }) }), side),
  )}`;
}

function gtm() {
  const fq = { period: "all" };
  const H = (k, v) => hrefWith("/gtm", fq, k, v);
  const goalsCard = card({ label: "Goals", count: 10, flush: true, region: "metrics", body:
    group({ title: "Under way", count: 4, open: true, summary: bar({ value: 2, max: 4, show: "of" }), body: lines([
      ["Ten design partners signed", 4, 10, [nia, mira]], ["The listing kit approved", 1, 1, [mira]], ["Three directories accept the listing", 1, 3, [nia]], ["First paid org", 0, 1, []],
    ].map(([t, v, m, ppl]) => line({ lead: ring({ value: v, max: m, size: 20, tone: v >= m ? "ok" : "" }), title: t, href: "/goals/x", meta: `${avatarStack(ppl, { size: 20 })}<span class="g-n">${v}/${m}</span>` }))) })
    + group({ title: "Not started", count: 6, summary: "0 of 6", body: lines([line({ title: "Review and launch" })]) }) });
  const lanesCard = card({ label: "Lanes", count: 14, flush: true, region: "lanes", body:
    group({ title: "outreach", count: 6, open: true, summary: avatarStack([nia, mira, leo], { size: 20 }), body: lines([
      line({ lead: avatar(nia), title: "FlowZo: partnership call, demo booked for 8 Oct", sub: "Ten design partners", meta: `${chip("Landed", { tone: "ok" })}<span>3h</span>` }),
      line({ lead: avatar(mira), title: "Ops lead at Kestrel, intro through the founders' list", sub: "Ten design partners", meta: `${chip("Awaiting actual", { tone: "warn" })}<span>1d</span>` }),
      line({ lead: avatar(leo), title: "Three pharmacies in the Thiruvallur pilot asked for the demo", sub: "First paid org", meta: `${chip("Landed", { tone: "ok" })}<span>2d</span>` }),
    ]) })
    + group({ title: "content", count: 4, summary: avatarStack([mira], { size: 20 }), body: lines([line({ title: "…" })]) })
    + group({ title: "listing", count: 4, summary: avatarStack([nia, robin], { size: 20 }), body: lines([line({ title: "…" })]) }) });
  const side = stack(
    card({ label: "Strategy", count: 5, flush: true, region: "strategy", body: lines([
      ["The business model", "direction", "28 Sep"], ["Positioning", "confirmed", "30 Sep"], ["Pricing", "draft", "1 Oct"], ["The ideal customer", "confirmed", "26 Sep"], ["The launch plan", "draft", "2 Oct"],
    ].map(([t, c, d]) => line({ title: t, href: "/doc/gtm/x.md", meta: `${chip(c)}<span>${d}</span>` })), { compact: true }) }),
    card({ label: "Follow-ups", count: 2, flush: true, region: "follow-ups", body: lines([
      line({ lead: avatar(nia), title: "Send FlowZo the claim boundary", meta: `${chip("Overdue", { tone: "bad" })}<span>1 Oct</span>` }),
      line({ lead: avatar(mira), title: "Book the Kestrel call", meta: "4 Oct" }),
    ], { compact: true }) }),
    card({ label: "Approved claims", count: 6, flush: true, region: "lists", body: lines([["FlowZo: a business partnership", "1 Oct"], ["Kestrel: the ops pilot", "29 Sep"], ["Thiruvallur pharmacies", "27 Sep"]].map(([t, d]) => line({ title: t, href: "/read?ref=card/claim/x", meta: d })), { compact: true }) }),
  );
  return `${pageHead({ title: "GTM" })}
${stack(
    tileRow([
      tile({ label: "Goals realized", value: 2, unit: "of 10", chart: ring({ value: 2, max: 10, size: 36, center: "", label: "Goals realized" }), key: "goals" }),
      tile({ label: "Contributions · 30d", value: 14, chart: miniBars([1, 3, 2, 0, 4, 2, 2], { labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7"], label: "A week" }), key: "filings" }),
      tile({ label: "Landed", value: 9, tone: "ok", key: "landed" }),
      tile({ label: "Awaiting an actual", value: 3, tone: "warn", key: "awaiting" }),
    ], { label: "How it is going", region: "glance" }),
    filterRow({ clear: "/gtm", groups: [
      { key: "campaign", label: "Campaign", items: [{ label: "All", count: 14, href: H("campaign", ""), current: true, all: true }, { label: "Design partners", count: 8, href: H("campaign", "dp") }, { label: "Listing", count: 4, href: H("campaign", "listing") }, { label: "Pilot", count: 2, href: H("campaign", "pilot") }] },
      { key: "lane", label: "Lane", items: [{ label: "outreach", count: 6, href: H("lane", "outreach") }, { label: "content", count: 4, href: H("lane", "content") }, { label: "listing", count: 4, href: H("lane", "listing") }] },
      { key: "by", label: "Person", items: [{ label: "Nia", count: 7, href: H("by", "nia"), person: nia }, { label: "Mira", count: 5, href: H("by", "mira"), person: mira }, { label: "Leo", count: 2, href: H("by", "leo"), person: leo }] },
      { key: "period", label: "Time", items: [{ label: "Quarter", href: H("period", "quarter") }, { label: "Month", href: H("period", "month") }, { label: "All time", href: H("period", "all"), current: true, all: true }] },
    ] }),
    cols(stack(goalsCard, lanesCard), side),
  )}`;
}

// ---- the three detail pages ----
function question() {
  return `${pageHead({ title: "Which number says sharingu is working?", crumbs: [{ label: "Decisions", href: "/decisions" }, { label: "the aim", href: "/decisions?area=the%20aim" }, { label: "Q-aim-measure" }], actions: [btn("Add to the round", { attrs: 'data-button="add-to-round"' })] })}
${stack(
    facts([{ label: "Status", html: chip("Open", { tone: "warn" }) }, { label: "Owed by", html: `${avatar(robin)}You` }, { label: "Area", value: "the aim" }, { label: "Asked", value: "30 Sep" }, { label: "Blocks", value: "2 goals" }]),
    cols(stack(
      card({ label: "Options", count: 3, tone: "quiet", region: "options", body: optionCards({ action: "/question/Q-aim-measure/rule", options: [
        { key: "A", label: "Weekly company goals with a count", detail: "Each org's own goals, counted weekly from what is filed.", fields: { choice: "A" } },
        { key: "B", label: "Activated organisations", detail: "An org counts once a member files through the MCP in its first week.", recommended: true, fields: { choice: "B" } },
        { key: "C", label: "Week-1 and week-4 return", detail: "The share of people who file again in week 1 and in week 4.", fields: { choice: "C" } },
      ] }) }),
      card({ label: "Why", region: "why", body: `<div class="g-words"><p>The aim has no measure yet, so Home cannot say whether the loop is working. Every goal under it is counted, the aim is not.</p><p class="g-src">${avatar({ ...robin, size: 20 })}Robin Ryuk · recorded in docs/plan/BETA.md</p></div>` }),
    ), stack(
      card({ label: "Blocks", count: 2, flush: true, region: "blocks", body: lines([
        line({ lead: ring({ value: 7, max: 10, size: 20 }), title: "Beta: the gate passes on live", href: "/goals/b", meta: "70%" }),
        line({ lead: ring({ value: 0, max: 10, size: 20 }), title: "The marketplace launch", href: "/goals/m", meta: "0%" }),
      ], { compact: true }) }),
      card({ label: "Counters", flush: true, region: "counters", body: empty("No counters") }),
    )),
  )}`;
}

function contribution() {
  const changed = lines([
    ["door", "POST /mcp file", "written"], ["table", "transmission", "written"], ["screen", "Build", "a screen it names"], ["check", "C-door-findings-pass", "named in what it touches", true], ["component", "the filter row", "a component it names"],
  ].map(([k, n, how, isNew]) => line({ lead: chip(k), title: n, sub: how, meta: isNew ? chip("New", { tone: "quiet" }) : "" })), { lead: 84 });
  const reach = lines([["screen", "Home"], ["screen", "Decisions"], ["door", "GET /build"], ["table", "k_goals"]].map(([k, n]) => line({ lead: chip(k), title: n })), { lead: 84 });
  const redo = lines([
    line({ lead: chip("Stale", { tone: "warn" }), title: "C-build-rows-under-1500: Build reads under 1,500 rows", sub: "passed 30 Sep", action: copyBtn("Copy the grade call for this check") }),
    line({ lead: chip("Stale", { tone: "warn" }), title: "C-door-refuses-bad-ref: the door refuses an unknown ref", sub: "passed 29 Sep", action: copyBtn("Copy the grade call for this check") }),
  ], { lead: 84 });
  return `${pageHead({ title: "The door findings pass: 23 fixes from the four real runs", crumbs: [{ label: "Build", href: "/build" }, { label: "Today", href: "/build?when=today" }, { label: "T-20261002-014" }], actions: [ghost("Show on the Map", "/map"), btn("Pick it up", { attrs: 'data-button="pick-up"' })] })}
${stack(
    facts([{ label: "Status", html: chip("Landed", { tone: "ok" }) }, { label: "By", html: `${avatar(nia)}Nia Mensah` }, { label: "Filed", value: "23m ago" }, { label: "Kind", value: "pr" }, { label: "Grade", html: `${ring({ value: 4, max: 4, size: 20 })}4 of 4` }]),
    cols(stack(
      card({ label: "Why", region: "envelope", body: `<div class="g-words"><p>The four real runs found 23 places where the door accepted a filing it should have refused or refused one it should have taken. Each is fixed with its smoke case.</p></div>${lineDetail({ facts: [["Goal", link("D1b: the door findings pass", "/goals/d1b")], ["Lane", "build"], ["Route", "Filed"], ["Proof", link("PR #212", "/view")], ["Happened", "2 Oct"], ["Touches", "5 nodes"]] })}` }),
      card({ label: "Impact", count: 23, flush: true, region: "impact", action: link("Open", "/contribution/T/impact"), body:
        group({ title: "Changed", count: 5, open: true, body: changed })
        + group({ title: "Proof to redo", count: 2, open: true, summary: chip("Stale", { tone: "warn", count: 2 }), body: redo })
        + group({ title: "Reaches", count: 14, summary: "6 screens · 5 doors · 3 tables", body: reach }) }),
    ), stack(
      card({ label: "Next", count: 1, flush: true, region: "next-action", body: lines([line({ lead: avatar(kai), title: "Wire the live walk into the gate", meta: "4 Oct", action: btn("Pick it up") })]) }),
      card({ label: "Counters", flush: true, region: "counters", body: empty("No counters") }),
      card({ label: "Trail", flush: true, region: "trail", body: lines([["Filed", "10:17"], ["Graded · complete", "10:17"], ["Landed", "10:17"]].map(([t, m]) => line({ title: t, meta: m })), { compact: true }) }),
    )),
  )}`;
}

function missing() {
  const fq = {};
  const H = (k, v) => hrefWith("/missing", fq, k, v);
  const item = (t, tab, d, n = 3) => line({ lead: ring({ value: d, max: n, size: 20, label: "depth" }), title: t, meta: `${d} of ${n}`, action: copyBtn("Copy the call that files it"),
    detail: lineDetail({ facts: [["Kind", "aim"], ["Needs", "a measure"], ["Id", id("H-aim-measure")]] }) });
  return `${pageHead({ title: "What is missing" })}
${stack(
    tileRow([
      tile({ label: "Filled", value: 15, unit: "of 21", chart: ring({ value: 15, max: 21, size: 36, center: "", label: "Items filled" }) }),
      tile({ label: "By depth", value: 87, unit: "%", chart: bar({ value: 0.87, show: "", width: 64, label: "By depth" }) }),
      tile({ label: "Open", value: 6, tone: "warn" }),
    ], { label: "How filled", region: "glance" }),
    filterRow({ clear: "/missing", groups: [
      { key: "tab", label: "Tab", items: [{ label: "All", count: 6, href: H("tab", ""), current: true, all: true }, { label: "Home", count: 1, href: H("tab", "home") }, { label: "Goals", count: 2, href: H("tab", "goals") }, { label: "Decisions", count: 1, href: H("tab", "decisions") }, { label: "Map", count: 2, href: H("tab", "map") }, { label: "Build", count: 0, href: H("tab", "build") }] },
    ] }),
    card({ label: "Open", count: 6, flush: true, region: "holes", body:
      group({ title: "Goals", count: 2, open: true, summary: bar({ value: 3, max: 5, show: "of" }), body: lines([item("A target on every top goal", "Goals", 1), item("An owner on every goal", "Goals", 2)]) })
      + group({ title: "Map", count: 2, open: true, summary: bar({ value: 4, max: 6, show: "of" }), body: lines([item("A render for every screen", "Map", 2), item("Every door names its table", "Map", 1)]) })
      + group({ title: "Home", count: 1, open: true, summary: bar({ value: 2, max: 3, show: "of" }), body: lines([item("The aim's measure", "Home", 0)]) })
      + group({ title: "Decisions", count: 1, summary: bar({ value: 3, max: 4, show: "of" }), body: lines([item("A recommended option on each open question", "Decisions", 1)]) }) }),
    card({ label: "Filled", count: 15, flush: true, body: group({ title: "Build, GTM, Broadcast, Control and 11 more", count: 15, summary: `${chip("Filled", { tone: "ok" })}${bar({ value: 1 })}`, body: lines([line({ title: "…" })]) }) }),
  )}`;
}

// ---- the gallery's own small stylesheet (the specimen frame only, never a part) ----
const GALLERY_CSS = `
  .g-sec{padding:20px 0 28px;border-top:1px solid var(--line)}
  .g-sec>.p-label{margin:0 0 16px}
  .g-index{display:flex;flex-wrap:wrap;gap:4px;margin:-8px 0 20px}
  .g-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px 24px;padding-top:4px}
  .g-spec{min-width:0}
  .g-wide{grid-column:1/-1}
  .g-cap{margin:0 0 8px;font:400 11.5px/1.3 var(--mono);color:var(--text-faint)}
  .g-body{min-width:0}
  .g-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
  .g-col{display:flex;flex-direction:column;gap:12px}
  .g-gap{width:18px}
  .g-p{margin:0;color:var(--text-muted);font-size:13px}
  .g-aim{margin:0;font:600 15px/1.5 var(--sans);color:var(--text);text-wrap:pretty}
  .g-n{min-width:22px;text-align:right;color:var(--text-muted)}
  .g-words{font:400 14px/1.6 var(--sans);color:var(--text);max-width:68ch}
  .g-words p{margin:0 0 10px}
  .g-src{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-faint)}
  .g-opts{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--text-muted)}
  .g-opts b{display:inline-block;width:18px;font:600 11.5px/1 var(--mono);color:var(--text-faint)}
`;

// ---- the page wrapper: the REAL shell, PARTS_CSS beside it, the faces inlined, the rail pointed at the siblings ----
const fontData = (file) => `data:font/woff2;base64,${FONT_B64[file]}`;
const RAIL = { "/home": "home.html", "/build": "build.html", "/gtm": "gtm.html", "/goals": "goals.html", "/decisions": "decisions.html", "/missing": "missing.html" };
function page(active, content, depth = 1) {
  const up = depth ? "" : "pages/";
  let html = shell({ active, content: `<div data-screen="look-${active}">${content}</div>`, owner: true, reader, brand, proj, briefCount: 2 });
  html = html.replace(/<link rel="preload"[^>]*>/, "").replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">`);
  html = html.replace(/url\(\/fonts\/([a-z-]+\.woff2)\?v=[0-9a-f]+\)/g, (_, f) => `url(${fontData(f)})`);
  html = html.replace("</head>", `<style>${P.PARTS_CSS}${GALLERY_CSS}</style>\n</head>`);
  html = html.replace(/href="(\/[a-z/]+)"/g, (m, h) => (RAIL[h] ? `href="${up}${RAIL[h]}"` : m));
  return html;
}

const FACE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#A7B8C9"/><circle cx="32" cy="26" r="12" fill="#E9D3BF"/><path d="M10 64c2-14 11-21 22-21s20 7 22 21z" fill="#3F4B5B"/><path d="M20 24c0-9 6-14 12-14s12 5 12 14c-3-5-7-7-12-7s-9 2-12 7z" fill="#2B211B"/></svg>`;

const BUILT = {
  gallery: () => page("", specimen(), 0),
  home: () => page("home", home()),
  goals: () => page("goals", goals()),
  decisions: () => page("decisions", decisions()),
  build: () => page("build", build()),
  gtm: () => page("gtm", gtm()),
  question: () => page("question", question()),
  contribution: () => page("transmission", contribution()),
  missing: () => page("holes", missing()),
};
mkdirSync(PAGES_DIR, { recursive: true });
writeFileSync(join(PAGES_DIR, "face.svg"), FACE_SVG);
const files = {};
for (const [name, make] of Object.entries(BUILT)) {
  const file = name === "gallery" ? join(OUT, "gallery.html") : join(PAGES_DIR, `${name}.html`);
  writeFileSync(file, make());
  files[name] = file;
}
console.log(`parts-gallery: ${Object.keys(files).length} pages under ${OUT.slice(ENGINE.length + 1)} (gallery.html, pages/*.html)`);
if (flag("no-shots")) process.exit(0);

// ---- the shots: the pinned Chrome for Testing over the DevTools protocol (tools/shots.mjs's own driver, trimmed) ----
const CHROME = join(homedir(), ".sharingu/chrome-for-testing.app/Contents/MacOS/Google Chrome for Testing");
if (!existsSync(CHROME)) { console.error(`parts-gallery: no pinned Chrome for Testing at ${CHROME}`); process.exit(2); }
const THEMES = arg("themes", "paper,ink").split(",");
const WIDTHS = arg("widths", "1440,390").split(",").map(Number);
const WANT = arg("pages", "") ? arg("pages", "").split(",") : Object.keys(files);
const CAP = Number(arg("cap", "5200"));
mkdirSync(SHOTS, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "sharingu-look-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run",
  "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  let buf = ""; const t = setTimeout(() => rej(new Error("Chrome did not open its DevTools port")), 15000);
  chrome.stderr.on("data", (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); res(m[1]); } });
  chrome.on("exit", () => rej(new Error("Chrome exited")));
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const waiting = new Map(), listeners = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else for (const l of listeners) l(m);
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++seq; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
const once = (sessionId, method, ms = 20000) => new Promise((res) => {
  const t = setTimeout(() => { listeners.splice(listeners.indexOf(fn), 1); res(null); }, ms);
  const fn = (m) => { if (m.sessionId === sessionId && m.method === method) { clearTimeout(t); listeners.splice(listeners.indexOf(fn), 1); res(m.params); } };
  listeners.push(fn);
});
let shots = 0, failed = 0;
try {
  for (const name of WANT) {
    if (!files[name]) continue;
    for (const theme of THEMES) for (const width of WIDTHS) {
      const height = width < 600 ? 844 : 960;
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      try {
        await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId);
        const onErr = (m) => { if (m.sessionId === sessionId && m.method === "Runtime.exceptionThrown") console.log(`  ! ${name} ${theme} ${width}: ${String((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text).split("\n")[0]}`); };
        listeners.push(onErr);
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
        await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme === "ink" ? "dark" : "light" }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
        const loaded = once(sessionId, "Page.loadEventFired");
        await send("Page.navigate", { url: pathToFileURL(files[name]).href }, sessionId);
        await loaded;
        await send("Runtime.evaluate", { expression: "document.fonts ? document.fonts.ready.then(() => 1) : 1", awaitPromise: true }, sessionId);
        await new Promise((r) => setTimeout(r, 300));
        const m = await send("Page.getLayoutMetrics", {}, sessionId);
        const h = Math.min(CAP, Math.max(height, Math.ceil((m.cssContentSize || m.contentSize).height)));
        await send("Emulation.setDeviceMetricsOverride", { width, height: h, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
        await new Promise((r) => setTimeout(r, 150));
        const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: h, scale: 1 }, captureBeyondViewport: true }, sessionId);
        const file = join(SHOTS, `${name}-${theme}-${width}.png`);
        writeFileSync(file, Buffer.from(data, "base64"));
        shots++;
        console.log(`  ✓ ${name} ${theme} ${width} (${h}px) -> ${file.slice(ENGINE.length + 1)}`);
        listeners.splice(listeners.indexOf(onErr), 1);
      } catch (e) {
        failed++; console.log(`  ✗ ${name} ${theme} ${width}: ${e && e.message}`);
      } finally { await send("Target.closeTarget", { targetId }).catch(() => {}); }
    }
  }
} finally {
  try { ws.close(); } catch {}
  chrome.kill("SIGTERM");
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300);
}
console.log(`parts-gallery: ${shots} shots under ${SHOTS.slice(ENGINE.length + 1)}${failed ? ` · ${failed} failed` : ""}`);
process.exitCode = failed ? 1 : 0;
