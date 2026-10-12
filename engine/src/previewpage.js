// src/previewpage.js — GET /preview/:id, the preview in the app (sprint 3, B2; docs/plan/MCP.md §4 "How the person sees
// it": the same preview a CLI draws as text and a chat draws as a card). Content-only: it renders INSIDE shell(), lit under
// Build. READ-ONLY: nothing is filed from this page; the person's own AI files it (the `file` call the page shows).
//
// One read (src/preview.js readPreviewView: the row, by its id), drawn on ui.js's shared parts and the semantic tokens only.
// Hooks: data-screen="preview", data-state (open · partial · filed · expired · empty), the regions header · items ·
// left-out · reach · file, and on each item row data-i and data-verdict (or data-filed once filed).
//   open     Not filed yet: who previewed what, for which project, when it expires; the items, what was left out, what it
//            reaches, and how to file it (the exact call)
//   partial  Filed in part: what landed (each with its link), what did not and why; the retry call
//   filed    Filed: when, and what each item became (a link to it)
//   expired  Expired: nothing of it was filed; preview again
//   empty    no item this reader may see (every item is role-limited and not open to them)
import { esc, statusChip, unreachableState } from "./ui.js";
import { card, facts, chip, avatar, line, lines, empty, pageHead, cols, stack, copyBtn } from "./parts.js";
// sprint 3, D3: the summary block (the glance, the items grouped by verdict, what was left out, the reach) is drawn by
// src/previewcard.js summaryParts, the SAME function the card in the chat draws, so the page and the card cannot drift
import { summaryParts, SUMMARY_CSS } from "./previewcard.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ");
const STATE_TITLE = { open: "Not filed yet", partial: "Filed in part", filed: "Filed", expired: "Expired", empty: "Not filed yet" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortWhen = (iso) => { const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.toISOString().slice(11, 16)}`; };

function fileCard(view) {
  if (view.state === "filed") return card({ label: "Filed", region: "file", flush: true, body: lines([line({ lead: statusChip("LANDED", "Filed"), title: shortWhen(view.filedAt) })], { compact: true }) });
  if (view.state === "expired") return card({ label: "File", region: "file", flush: true, body: empty("Expired") });
  // copy: off-screen (the Copy button's hidden value and title)
  const call = `file {previewId: "${view.id}", items}`;
  const bv = (view.counts && view.counts.byVerdict) || {};
  const notReady = (Number(bv.needs) || 0) + (Number(bv.refused) || 0), ready = (Number(bv.files) || 0) + (Number(bv.waits_for_owner) || 0);
  const by = view.author ? "" : chip(`By ${noDash((view.by && view.by.name) || "its author")}`, { title: "Its author files it from their own AI; nothing is filed from this page" });
  const only = notReady && view.state === "open" ? chip("Not ready", { tone: "warn", count: notReady, title: `the plain call is refused; only: "ready" files the ${ready} ready and leaves the rest` }) : "";
  return card({ label: view.state === "partial" ? "File the rest" : "File", region: "file", flush: true,
    // L4 (pristine copy): no raw call on the screen; the one Copy button carries it (its text in the button's title)
    body: `<div class="p-card-pad pv-file">${by}${only}${copyBtn(call, { label: "Copy the file call", attrs: 'data-button="copy-call"' })}</div>` });
}

// renderPreviewPage(view, { down }) -> the page's content. view: src/preview.js readPreviewView's answer. down: the read
// failed (UNREACHABLE: what failed, and that nothing here can be recorded). sprint 3, L3 (the revision, docs/plan/LOOK.md):
// the head (Build / Preview, its state as the title), the facts (by, previewed, expires or filed, items, project), the glance
// (one tile per verdict), the items grouped by verdict, what was left out (the AI's own words), the reach and the ONE Copy of
// the file call. No sentence of the product's own.
export function renderPreviewPage(view, o = {}) {
  if (o.down || !view) {
    return CSS + `<section class="pv" data-screen="preview" data-state="unreachable">${pageHead({ title: "Preview", crumbs: [{ label: "Build", href: orgPath("/build") }, { label: "Preview" }] })}${unreachableState({ what: "This preview could not be read right now." })}</section>`;
  }
  const v = view;
  const { glance, items, left, reach, state, n } = summaryParts(v);
  const who = v.author ? "You" : noDash((v.by && v.by.name) || "Someone");
  const head = pageHead({ title: STATE_TITLE[state] || "Preview", crumbs: [{ label: "Build", href: orgPath("/build") }, { label: "Preview" }, { label: v.id || "" }] });
  const header = facts([
    { label: "By", html: `${avatar({ name: noDash((v.by && v.by.name) || who), size: 20 })}${esc(who)}` },
    { label: "Project", value: noDash(v.projectName || projectSlug(v.project || "")) },
    { label: "Previewed", value: shortWhen(v.createdAt), title: String(v.createdAt || "") },
    state === "filed" || state === "partial" ? { label: "Filed", value: shortWhen(v.filedAt) || "–" } : { label: state === "expired" ? "Expired" : "Expires", value: shortWhen(v.expiresAt), title: String(v.expiresAt || "") },
    { label: "Items", value: String(n) },
  ], { region: "header" });
  return CSS + `<section class="pv" data-screen="preview" data-state="${esc(state)}" data-preview="${esc(v.id)}">${head}${stack(header, glance, cols(stack(items, left), stack(fileCard(v), reach)))}</section>`;
}

const CSS = `<style>
.pv-file{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-top:12px}
.pv{display:block}
${SUMMARY_CSS}
</style>`;
