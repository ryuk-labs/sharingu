// rt-selftest.mjs — the ratchet for the rt-v1.1 report scaffold (src/rt.js): the eight
// fixed sections, the route table, the stamp/gap/trail renderers, and the footer
// provenance line that both report consumers (the standalone batch artifact and the
// shell-embedded detail page) share. Modeled on tools/tempo-selftest.mjs and
// tools/decide-form-selftest.mjs: a local ok(cond, label) counter, a computed total,
// process.exit(1) on any fail. Run in the gate.
//
// rt.js is a shared toolkit, not a whole renderer, so — like decide-form-selftest.mjs
// does for the decide form — this file exercises it two ways: every exported piece
// directly, and the two real consumers (src/report.js's renderBatchReport, src/txpage.js's
// renderTransmissionPage) that assemble those pieces into an actual report, so the checks
// on "the report" (route coverage, the escaping rule, the id rule) mean something end to end.
import {
  RT_SECTIONS, sectionHeading, RT_CSS, ROUTE, renderVerdictBanner,
  STAMP_KIND, renderStampsSection, renderImpactMeta, renderGapsSection,
  TRAIL_TONE_CLASS, renderEventTrail, FOOTER_PROVENANCE,
} from "../src/rt.js";
import { renderBatchReport } from "../src/report.js";
import { renderTransmissionPage } from "../src/txpage.js";

let fail = 0, checks = 0;
const ok = (cond, label) => { checks++; if (!cond) { console.log(`  ✗ ${label}`); fail = 1; } };
const eq = (got, want, label) => ok(JSON.stringify(got) === JSON.stringify(want), `${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const has = (html, needle, label) => ok(html.includes(needle), `${label} (missing: ${needle})`);
const lacks = (html, needle, label) => ok(!html.includes(needle), `${label} (present: ${needle})`);
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
// the E250 record-id regex (evals.sh, "no record id as text on a leader-facing surface"):
// a canon register slug — question, screen, ruling or artifact — never appears as visible
// text; only an identifier attribute or a citation chip may carry one.
const RECORD_ID = /\b(?:RV|RR|AQ[A-Z]?|ST|AR)\d+\b/g;

// ---- 1. RT_SECTIONS / sectionHeading — the eight sections, fixed order, headings only where the template gives one ----
eq(RT_SECTIONS.map((s) => s.key), ["header", "verdict", "envelope", "impact", "gaps", "stamps", "trail", "footer"], "the eight sections, in order");
eq(RT_SECTIONS.map((s) => s.heading), [null, null, "What · why · what it touches", "Impact", "Honest gaps & questions", "Stamps & approvals", "Event trail", null], "headings: null for header/verdict/footer, the template's own prose otherwise");
eq(sectionHeading("gaps"), "Honest gaps & questions", "sectionHeading resolves a real key");
eq(sectionHeading("header"), null, "sectionHeading returns null for a section with no standalone heading");
eq(sectionHeading("not-a-section"), null, "sectionHeading on an unknown key: null, never thrown");

// ---- 2. RT_CSS / FOOTER_PROVENANCE — the rt-v1.1 marker ----
ok(RT_CSS.includes(":root{--paper:") && RT_CSS.includes(".decision{"), "RT_CSS carries the shared palette and the decision block rule");
has(FOOTER_PROVENANCE, "rt-v1.1", "the rt-v1.1 marker is present in the footer provenance");
eq(FOOTER_PROVENANCE, "one source: the contribution row + ledger · template rt-v1.1", "the footer provenance line, verbatim");

// ---- 3. ROUTE + renderVerdictBanner — auto / owner / incomplete, each with a tone and a reason in words ----
eq(Object.keys(ROUTE), ["auto", "owner", "incomplete"], "the three routes");
eq(Object.values(ROUTE).map((r) => r.tone), ["good", "warn", "bad"], "route tones, in order: auto good, owner warn, incomplete bad");
ok(Object.values(ROUTE).every((r) => typeof r.why === "string" && r.why.length > 10), "every route carries a reason in words, not a code");

const bannerChecks = ["auto", "owner", "incomplete"].map((route) => {
  const b = renderVerdictBanner({ route }, {});
  return b.includes(`class="banner b-${ROUTE[route].tone}"`) && b.includes(ROUTE[route].label) && b.includes(ROUTE[route].why);
});
eq(bannerChecks, [true, true, true], "renderVerdictBanner, per route: the tone class, the label, and the reason in words all render");
const unknownBanner = renderVerdictBanner({ route: "nonsense" }, {});
has(unknownBanner, ROUTE.incomplete.label, "an unrecognized route falls back to incomplete's copy, never invented");
const customBanner = renderVerdictBanner({ route: "owner" }, { bannerClass: "tx-banner", toneClass: (t) => `tx-b-${t}`, bigClass: "tx-b-big" });
has(customBanner, 'class="tx-banner tx-b-warn"', "renderVerdictBanner honors a consumer's own class hooks");
has(customBanner, '<div class="tx-b-big">', "…including the big-label class hook");

// ---- 4. STAMP_KIND + renderStampsSection ----
eq(Object.keys(STAMP_KIND), ["approve", "reject", "needs-work", "ruling", "question"], "the five stamp kinds");
eq(renderStampsSection([], {}), "", "no items: no markup");
const stamps = renderStampsSection([{ kind: "approve", detail: "filed as ruled" }, { kind: "weird-kind", detail: "x" }], { fallback: { tone: "warn", ic: "?" }, icStyle: (tone) => `background:var(--${tone}bg);color:var(--${tone})` });
eq([stamps.includes(STAMP_KIND.approve.label), stamps.includes(STAMP_KIND.approve.ic), stamps.includes(">weird-kind<"), stamps.includes('style="background:var(--warnbg)')], [true, true, true, true],
  "renderStampsSection: a known kind's fixed label + icon (never an id), an unknown kind falls back to its own name, the fallback tone drives the icon style hook");
const labeledStamp = renderStampsSection([{ kind: "ruling", label: "Stamped by the owner" }], {});
has(labeledStamp, "Stamped by the owner", "an explicit label overrides STAMP_KIND's default");

// ---- 5. renderImpactMeta — absent stays silent, partial is honest about what's missing ----
eq(renderImpactMeta(undefined, {}), "", "no meta: no markup (a pre-impact report stays valid)");
eq(renderImpactMeta(null, {}), "", "null meta: no markup");
const fullMeta = renderImpactMeta({ eagleDelta: "2 refs closed", harmony: "aligns", audience: "every workspace" }, {});
eq(["Map delta", "2 refs closed", "Harmony depth", "Audience spread"].map((s) => fullMeta.includes(s)), [true, true, true, true], "impact meta: all three labels + the map-delta value render when the full meta is given (sprint 3 S3b: never \"Eagle\")");
const partialMeta = renderImpactMeta({ harmony: "deepens" }, {});
eq([partialMeta.includes("—"), partialMeta.includes("deepens")], [true, true], "impact meta: a missing field renders an honest dash, never invented text; the one field given still renders");

// ---- 6. renderGapsSection — gaps are first-class; an empty list says so explicitly ----
eq(renderGapsSection([], {}), '<div class="gapnote">None.</div>', "no gaps: the explicit None. rule, not a silent empty section");
eq(renderGapsSection(undefined, {}), '<div class="gapnote">None.</div>', "undefined items: the same explicit None. rule");
const gaps = renderGapsSection([
  { title: "No proof of delivery", detail: "the code lane requires an artifact.", action: "re-file with proof", critical: true },
  { title: "Screen join key unverified", detail: "" },
], {});
eq(["No proof of delivery", "the code lane requires an artifact.", "re-file with proof", "gap crit"].map((s) => gaps.includes(s)), [true, true, true, true], "a gap's title, reason (in words), action and critical class all render");
lacks(renderGapsSection([{ title: "Screen join key unverified" }], {}), '<div class="gd">', "a gap with no detail renders no empty detail line");

// ---- 7. TRAIL_TONE_CLASS + renderEventTrail ----
eq(TRAIL_TONE_CLASS, { g: "good", s: "stamp", w: "warn", b: "bad" }, "the four trail tones");
eq(renderEventTrail([], {}), "", "no trail items: no markup");
const trail = renderEventTrail([{ tone: "g", time: "2026-09-09", text: "recorded" }, { tone: "x", time: "2026-09-09", text: "unknown tone" }], {});
has(trail, "tr-good", "a known tone slugs through TRAIL_TONE_CLASS");
has(trail, "tr-faint", "an unrecognized tone falls back to faint, never thrown");
has(trail, "recorded", "a trail item's text renders");

// ---- 8. the escaping rule — a <script> in user-supplied text never appears raw, anywhere rt.js renders it ----
lacks(renderVerdictBanner({ route: "owner" }, {}), "<script>", "renderVerdictBanner: the route table itself carries no script (sanity: fixed copy)");
const scriptStamp = renderStampsSection([{ kind: "ruling", detail: '<script>alert(1)</script>' }], {});
lacks(scriptStamp, "<script>alert(1)</script>", "renderStampsSection escapes a script in a stamp's detail");
has(scriptStamp, "&lt;script&gt;", "…as an escaped entity");
const scriptGap = renderGapsSection([{ title: '<img src=x onerror=alert(1)>', detail: '<script>bad()</script>', action: '<b>x</b>' }], {});
eq([scriptGap.includes("<img src=x onerror=alert(1)>"), scriptGap.includes("<script>bad()</script>"), scriptGap.includes("<b>x</b>")], [false, false, false], "renderGapsSection escapes a raw title, detail and action alike");
const scriptTrail = renderEventTrail([{ tone: "b", time: "2026-09-09", text: '<script>evil()</script>' }], {});
lacks(scriptTrail, "<script>evil()</script>", "renderEventTrail escapes a trail item's text");

// ---- 9. end to end through the two real consumers: a report renders for each route, the id rule holds, an artifact links ----
const stamp = { publishedAt: "2026-09-08T00:00:00Z" };
const grade = { joinKey: "n/a", proof: "n/a", ownerReasons: [] };
const autoRow = { id: "T-0910-1", lane: "code", kind: "pr", what: "wire the retry queue", why: "flaky sends were dropping silently", touches: "queue-worker", route: "auto", status: "closed", created_at: "2026-09-10T08:00:00Z", by_name: "a contributor", by_role: "eng" };
const ownerRow = { id: "T-0910-2", lane: "vendor", kind: "scope", what: "add a vendor integration <script>alert(1)</script>", why: "the vendor asked for it", touches: "billing", route: "owner", status: "routed", created_at: "2026-09-10T08:05:00Z", by_name: "a contributor", by_role: "vendor" };
const incompleteRow = { id: "T-0910-3", lane: "design", kind: "screen", what: "", why: "", touches: "", route: "incomplete", status: "open", created_at: "2026-09-10T08:10:00Z" };
const incompleteGrade = { joinKey: "absent", proof: "n/a", ownerReasons: [], missing: ["what", "why"] };

const batch = renderBatchReport({ rows: [autoRow, ownerRow, incompleteRow], generatedAt: "2026-09-10T09:00:00Z", origin: "https://example.test" });
eq([ROUTE.auto.label, ROUTE.owner.label, ROUTE.incomplete.label].map((l) => batch.includes(l)), [true, true, true], "the batch report renders all three routes' verdicts (auto/owner/incomplete)");
eq([batch.includes("rt-v1.1"), batch.includes("<script>alert(1)</script>"), batch.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), (visible(batch).match(RECORD_ID) || []).length === 0],
  [true, false, true, true], "the batch report: the rt-v1.1 marker, a script in a row's what is escaped (not raw, shown escaped), no leaked canon register id");

const autoPage = renderTransmissionPage(autoRow, { grade, canDecide: false, servedStamp: stamp });
const ownerPage = renderTransmissionPage(ownerRow, { grade, canDecide: false, servedStamp: stamp });
const incompletePage = renderTransmissionPage(incompleteRow, { grade: incompleteGrade, canDecide: false, servedStamp: stamp });
eq([autoPage.includes(ROUTE.auto.label), ownerPage.includes(ROUTE.owner.label), incompletePage.includes(ROUTE.incomplete.label)], [true, true, true], "the detail page renders for an auto-routed, an owner-routed and an incomplete row");
eq([ownerPage.includes("<script>alert(1)</script>"), incompletePage.includes("The three lines are incomplete"), incompletePage.includes("missing: what, why.")], [false, true, true],
  "the detail page escapes a script in a row's what; the incomplete row's grade reasons appear in words, naming which fields");
eq([autoPage, ownerPage, incompletePage].map((h) => (visible(h).match(RECORD_ID) || []).length), [0, 0, 0], "no page (auto/owner/incomplete) leaks a canon register id into visible text");

const reportedRow = { ...autoRow, id: "T-0910-4", report: "rpt-abc123" };
const reportedPage = renderTransmissionPage(reportedRow, { grade, canDecide: false, servedStamp: stamp });
eq([reportedPage.includes("/view?src=" + encodeURIComponent("/artifact/rpt-abc123")), reportedPage.includes("rt-v1.1 report artifact"), renderTransmissionPage(autoRow, { grade, canDecide: false, servedStamp: stamp }).includes("/view?src=")],
  [true, true, false], "a row carrying a report artifact links it (labeled rt-v1.1 report artifact); a row with none links nothing");

console.log(fail ? `✗ rt drift (${checks} checks)` : `✓ rt selftest: ${checks}/${checks} — the eight sections, the route table, the stamp/gap/trail renderers, the escaping rule and the id rule hold across both report consumers`);
process.exit(fail);
