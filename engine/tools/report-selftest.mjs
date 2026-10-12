// report-selftest.mjs — the ratchet for src/report.js, the batch/backfill report renderer
// POST /backfill produces (src/core.js backfillReports -> renderBatchReport, banked as an
// artifact; sims.sh's bad-agent scenario proves the backfilled artifact "actually says Thank
// you"). Locks: every exported function is called directly; a batch renders one report with
// each row's grade spelled out in words (ROUTE's own labels, never retyped here); the thanks
// line lands once per row; a row's free text is escaped, never echoed raw; counts in the
// report match the fixture's own counts (computed via .length/.filter, never typed); an empty
// or missing batch renders an honest empty report instead of throwing. Modeled on
// tools/planned-selftest.mjs. Run in the gate.
import { renderReportShell, renderBatchReport } from "../src/report.js";
import { ROUTE, FOOTER_PROVENANCE, RT_CSS } from "../src/rt.js";
import { esc } from "../src/ui.js";
import { parseRefs } from "../src/refs.js";
import { DEFAULT_BRAND } from "../src/tenant.js";

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } };

// a fixture brand, kept generic (no real tenant identity) so the report's own brand fields
// are exercised without retyping anyone's actual name
const BRAND = { org: "Org", engine: "Engine", productTitle: "Engine console", loginTitle: "sign in" };

// ---- 1 · renderReportShell, called directly (the wrapper every report page uses) ----------
{
  const shell = renderReportShell("A Title & More", "<p>inner-marker</p>");
  ok(shell.includes(`<title>${esc("A Title & More")}</title>`), "renderReportShell escapes the title it's given");
  ok(shell.includes("<p>inner-marker</p>"), "renderReportShell carries its inner content through verbatim");
  ok(shell.includes(RT_CSS), "renderReportShell embeds the one shared rt-v1.1 stylesheet");
  ok(shell.includes('<div class="wrap">'), "renderReportShell wraps the page in the standard shell div");
}

// ---- 2 · an empty or missing batch renders honestly, never throws -------------------------
{
  const htmlEmpty = renderBatchReport({ rows: [], generatedAt: "2026-01-01T00:00:00Z", origin: null, brand: BRAND });
  ok(htmlEmpty.includes("0 submissions"), "an empty batch says 0 submissions (plural, computed from the empty list)");
  ok(!htmlEmpty.includes('<section class="txn"'), "an empty batch renders no row sections");
  ok(!htmlEmpty.includes("Thank you,"), "an empty batch carries no thanks line");

  const htmlNoRows = renderBatchReport({ generatedAt: "2026-01-01T00:00:00Z", brand: BRAND });
  ok(htmlNoRows.includes("0 submissions"), "a missing rows field is treated as an empty batch, not a throw");

  const rowOne = { id: "R-S1", submitter: "filer-s", route: "auto", created_at: "2026-01-01T00:00:00Z" };
  const htmlOne = renderBatchReport({ rows: [rowOne], generatedAt: "2026-01-01T00:00:00Z", brand: BRAND });
  ok(htmlOne.includes("1 submission") && !htmlOne.includes("1 submissions"), "a single-row batch says 1 submission, singular");
}

// ---- 3 · a mixed batch: one row per route, one carrying an attack string ------------------
const rowAuto = {
  id: "R-A1", submitter: "filer-a", lane: "lane-one", kind: "kind-one",
  what: "did a thing", why: "because it was needed", touches: "area-1,area-2",
  screens: "045", components: "comp-1", gaprefs: null, proof: "artifact:abc",
  route: "auto", decision: null, decided_by: null, created_at: "2026-01-01T00:00:00Z",
};
const rowOwner = {
  id: "R-A2", submitter: "filer-b", by_name: "Reviewer B", by_role: "role-b",
  lane: "lane-two", kind: "kind-two", what: "did another thing", why: "reason two",
  touches: "area-3", screens: null, components: "comp-2", gaprefs: "screen:050,q/QQ1",
  proof: "artifact:def", route: "owner", decision: "approve", decided_by: "owner-x",
  created_at: "2026-01-02T00:00:00Z", decided_at: "2026-01-02T01:00:00Z",
};
const rowIncomplete = {
  id: "R-A3", submitter: "filer-c", lane: null, kind: "kind-three",
  what: "<script>alert(1)</script> a landed but incomplete row", why: "", touches: "",
  screens: "", components: "", gaprefs: "", proof: "",
  route: "incomplete", decision: null, decided_by: null, created_at: "2026-01-03T00:00:00Z",
};
const rowsAll = [rowAuto, rowOwner, rowIncomplete];
const origin = "https://example.test";
const html = renderBatchReport({ rows: rowsAll, generatedAt: "2026-01-04T00:00:00Z", origin, brand: BRAND });

ok(html.includes(`${rowsAll.length} submissions`), "the batch-meta count is the fixture's own row count, not a typed number");
ok(html.includes(esc("2026-01-04T00:00:00Z")), "the batch-meta carries the generatedAt it was given");
ok(["auto", "owner", "incomplete"].every((r) => html.includes(ROUTE[r].label)),
  "every row's grade is spelled out in words — the route table's own labels, filed with the owner and needs-one-more-thing alike");
ok((html.match(/Thank you,/g) || []).length === rowsAll.length, "one thanks line lands per row in the batch, computed from the fixture length");

// escaping: the attacker's row never lands raw, but its escaped text is present
ok(!html.includes("<script>alert(1)</script>"), "a row's raw <script> text never appears unescaped in the report");
ok(html.includes(esc(rowIncomplete.what)), "the same text lands, html-escaped, in the envelope");

// gapRefs: rowAuto and rowIncomplete declare none -> the honest-gap warning; rowOwner
// declares two -> that many chips. Both expectations are computed from the fixture via the
// same ref-parsing the app itself uses, never hand-counted.
const expectNoGapRows = rowsAll.filter((r) => parseRefs(r.gaprefs).length === 0).length;
const expectGapChips = rowsAll.reduce((n, r) => n + parseRefs(r.gaprefs).length, 0);
ok((html.match(/no gapRefs declared/g) || []).length === expectNoGapRows, "the no-gapRefs warning appears once per row that declared none");
ok((html.match(/class="gapchip"/g) || []).length === expectGapChips, "one gap chip renders per declared ref, summed across the batch");
ok(html.includes(`parent=${rowAuto.id}`), "the no-gapRefs warning names the row's own id as the re-file parent");

// decision + trail: only rowOwner carries a decision
ok((html.match(/Approved/g) || []).length === 1, "the Approved stamp renders exactly once — only the owner-routed row was decided");
ok(html.includes(`decided by ${rowOwner.decided_by}`), "the decision detail names who decided");
ok(
  (html.match(/recorded/g) || []).length === rowsAll.length &&
  rowsAll.every((r) => html.includes(`routed ${r.route}`)) &&
  (html.match(/decision approve/g) || []).length === 1,
  "every row's event trail opens with recorded and names its own route; the decision entry appears once, for the decided row only",
);

// who + link: a named reviewer carries role; an anonymous row falls back to unattributed
ok(html.includes(esc(rowOwner.by_name)) && html.includes(esc(rowOwner.by_role)), "a row with a name and role renders both");
ok(html.includes(`href="${origin}/contribution/${rowOwner.id}"`), "a report generated with an origin links each row back to its ledger entry");

const htmlNoOrigin = renderBatchReport({ rows: [rowOwner], generatedAt: "2026-01-04T00:00:00Z", origin: null, brand: BRAND });
ok(!htmlNoOrigin.includes("view in ledger") && !htmlNoOrigin.includes("each section above is linked"),
  "without an origin, no dead link to the ledger is offered, and the footer makes no linking claim it can't back");

const rowUnattributed = { id: "R-U1", route: "auto", created_at: "2026-01-06T00:00:00Z" };
const htmlUnattributed = renderBatchReport({ rows: [rowUnattributed], generatedAt: "2026-01-06T00:00:00Z", brand: BRAND });
ok(htmlUnattributed.includes("unattributed"), "a row with no submitter and no name honestly says unattributed");

const rowEmptyEnvelope = { id: "R-E1", submitter: "filer-e", route: "auto", created_at: "2026-01-05T00:00:00Z", what: "", why: "", touches: "", screens: "", components: "", proof: "" };
const htmlEmptyEnvelope = renderBatchReport({ rows: [rowEmptyEnvelope], generatedAt: "2026-01-05T00:00:00Z", brand: BRAND });
ok(htmlEmptyEnvelope.includes("no envelope fields declared"), "a row with every envelope field blank says so honestly instead of rendering an empty card");

// ---- 4 · footer + the default brand (unexercised elsewhere above) -------------------------
ok(html.includes(FOOTER_PROVENANCE), "the footer carries the one shared provenance line");
ok(html.includes(`linked to its row at ${esc(origin)}`), "with an origin, the footer states where every section links");
ok(html.includes("<title>Backfilled Reports</title>"), "the report's own title names what it is, regardless of its brand or rows");

const htmlDefaultBrand = renderBatchReport({ rows: [rowAuto], generatedAt: "2026-01-01T00:00:00Z" });
ok(htmlDefaultBrand.includes(esc(DEFAULT_BRAND.org)) && htmlDefaultBrand.includes(esc(DEFAULT_BRAND.engine)),
  "brand defaults to the tenant's own served brand when the caller passes none");

console.log(`report selftest: ${checks - failed}/${checks} passed`);
process.exit(failed ? 1 : 0);
