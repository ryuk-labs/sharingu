// decide-form-selftest.mjs — the ratchet for RULINGS ON THE PAGE (R-PRD-ONE-MIND WP7, M-ADR-041, which
// reverses the 2026-09-01 "no decide button" ruling). Pure renders, no env, no reads: the filing page
// (src/txpage.js; UI-B4a: three fixed-note buttons, Approve · Needs work · Reject, and no typed note, Q1E8D4C9C)
// for the owner vs a seated reader (the queue rows went with the owner-queue page, UI-B4b), the asker's card
// (UI-B2: the Decisions screen and the QuestionCard, src/decisions.js), and the shared pieces (VERDICTS · verdictWord · renderDecideForm).
// Locks: the form is present ONLY for the owner and ONLY while the row is not terminally ruled; it posts
// to the EXISTING seam (POST /contribution/:id/decide) with the three ledger verdicts the seam accepts
// (core.js DECIDE_VERDICTS — asserted against the seam's own `allowed` list, one source); the ruling
// block after a decision (who · when · the verdict word · the note, tempo `decided`); a ruled question's mark on the Decisions screen and the card; and no old noun as visible text on any of the three faces.
// Modeled on tools/tempo-selftest.mjs. Run in the gate.
import { renderTransmissionPage, renderDecideForm, verdictWord, isTerminal, VERDICTS, FILING_RULINGS } from "../src/txpage.js";
import { readDecisions, readQuestion, renderDecisionsPage, renderQuestionPage } from "../src/decisions.js";
import { fixtureEnv, OPEN_QID, RULED_QID } from "./fixtures/decisions-pack.mjs";
import { decideTransmission } from "../src/core.js";

let fail = 0, checks = 0;
const eq = (got, want, label) => { checks++; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail = 1; } };
const has = (html, needle, label) => eq(html.includes(needle), true, `${label} (missing: ${needle})`);
const lacks = (html, needle, label) => eq(html.includes(needle), false, `${label} (present: ${needle})`);
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
const BANNED = /\b(transmissions?|handoffs?|loops?|heartbeat|capsules?|holes|envelopes?)\b/gi;   // the WP1 list (tools/check-vocab-selftest.mjs)
const count = (html, re) => (html.match(re) || []).length;

const stamp = { publishedAt: "2026-09-08T00:00:00Z" };
const open = { id: "T-0909-1", lane: "vendor", kind: "scope", what: "a vendor scope", why: "because", touches: "ai-scope", route: "owner", status: "routed", created_at: "2026-09-09T08:00:00Z", by_name: "Vasu", by_role: "CTO" };
const grade = { joinKey: "n/a", proof: "n/a", ownerReasons: ["lane:vendor"] };

// 1 · the verdicts are the seam's own three words, in the reader's order (approve · needs-work · reject)
const seamAllowed = await decideTransmission({ id: "p" }, "x", { verdict: "nonsense" }, {});   // bad_verdict short-circuits before any DB read
eq(seamAllowed.error, "bad_verdict", "the seam refuses an unknown verdict before touching the DB");
eq([...VERDICTS.map((v) => v.value)].sort(), [...seamAllowed.allowed].sort(), "VERDICTS are exactly the seam's allowed verdicts (one source)");
eq(VERDICTS.map((v) => v.label), ["Approve", "Send back for one more thing", "Reject"], "the three buttons, plain words");
eq(VERDICTS.every((v) => v.happens && v.happens.length > 20), true, "every verdict carries its one-line what-happens");
eq(["approve", "needs-work", "reject", "weird", ""].map(verdictWord), ["approved", "sent back for one more thing", "rejected", "weird", ""], "the verdict words; an unknown value reads as itself");
eq(["approve", "reject", "needs-work", ""].map(isTerminal), [true, true, false, false], "approve/reject are terminal, needs-work is not");

// 2 · the filing page (UI-B4a): the owner sees three fixed-note buttons, a seated reader none; no typed note anywhere
eq([...FILING_RULINGS.map((v) => v.value)].sort(), [...seamAllowed.allowed].sort(), "the page's three rulings are exactly the seam's allowed verdicts (one source)");
eq(FILING_RULINGS.map((v) => v.label), ["Approve", "Needs work", "Reject"], "the page's three buttons: Approve · Needs work · Reject");
eq(FILING_RULINGS.every((v) => v.note && v.note.length > 8 && !/[\u2014]/.test(v.note + v.happens)), true, "every ruling carries its fixed note and its what-happens line, no em dash");
const ownerPage = renderTransmissionPage(open, { grade, canDecide: true, ownerName: "Ryuk", servedStamp: stamp });
const otherPage = renderTransmissionPage(open, { grade, canDecide: false, ownerName: "Ryuk", servedStamp: stamp });
const noOptsPage = renderTransmissionPage(open, { grade });
for (const v of FILING_RULINGS) {
  has(ownerPage, `<form class="fl-rule fl-rule-${v.value}" method="POST" action="/contribution/T-0909-1/decide"><input type="hidden" name="verdict" value="${v.value}"><input type="hidden" name="note" value="${v.note}"><input type="hidden" name="next" value="/contribution/T-0909-1?page=1">`, `owner: the ${v.value} form posts the seam a hidden verdict, its FIXED note and next`);
  // the look pass: the button wears the shared class (ui.js .u-btn); it is read by its hooks, never by its class. sprint 3 L3: what
  // the press does rides its title (pristine copy), never a line under it
  eq(new RegExp(`<button type="submit"(?: class="[^"]*")? data-button="${v.value}" data-door="POST /contribution/:id/decide" title="${v.happens.replace(/[.?()]/g, "\\$&")}">${v.label}</button>`).test(ownerPage), true, `owner: the ${v.value} button carries its wf-filing data-button, door and what it does (its title)`);
}
lacks(ownerPage, "<textarea", "owner: no textarea (Q1E8D4C9C: the note is fixed, never typed)");
eq((ownerPage.match(/<input\b[^>]*>/g) || []).filter((t) => !/type="hidden"/.test(t)).length, 0, "owner: every input on the page is hidden (no typed input at all)");
has(ownerPage, 'data-region="ruling"', "owner: the ruling region");
eq(count(ownerPage, /data-decide="T-0909-1"/g), 1, "owner: exactly one set of ruling buttons on the page");
eq(count(ownerPage, /<form class="fl-rule /g), 3, "owner: three ruling forms, no more");
// exactly ONE primary among the three presses (the look pass: Approve), the other two plain; what each submits is above
const pressTags = (ownerPage.match(/<button type="submit"[^>]*data-door="POST \/contribution\/:id\/decide"[^>]*>/g) || []);
eq(pressTags.filter((t) => /class="[^"]*\bprimary\b/.test(t)).map((t) => (/data-button="([^"]+)"/.exec(t) || [])[1]), ["approve"], "owner: exactly one primary press, Approve");
has(ownerPage, 'title="vendor contributions always go to the owner." data-reason="lane:vendor">Vendor lane<', "owner: why it waits is a chip, its reason in the title (pristine copy)");
lacks(otherPage, "data-decide=", "seated reader: no ruling buttons");
lacks(otherPage, 'name="verdict"', "seated reader: no verdict input");
has(otherPage, 'title="Waits on Ryuk" data-region="ruling"', "seated reader: the ruling region (the status cell) says who it waits on (never empty)");
lacks(noOptsPage, "data-decide=", "no canDecide opt: no form (the default is read-only)");
lacks(ownerPage, 'class="ruling', "an unruled row shows no ruling block");
has(ownerPage, 'data-chip="OPEN">With Ryuk</span>', "the open row wears its tempo word (with <owner>) on the OPEN state chip");
lacks(ownerPage, ".decide-note textarea", "the page no longer carries the old decide-form styles (the textarea rules)");
// sprint 3 L3: the presses show while it is not ruled for good and has not landed on its own: a row routed auto (its chip
// Landed, nothing waits on anyone) offers none, even to the owner; one sent back or with the owner keeps them (above)
const landed = renderTransmissionPage({ ...open, route: "auto", status: "closed" }, { grade: {}, canDecide: true, ownerName: "Ryuk", servedStamp: stamp });
has(landed, 'data-chip="LANDED">Landed</span>', "landed: its status chip says Landed");
lacks(landed, "data-decide=", "landed on its own (routed auto): no presses, even for the owner");
has(landed, 'title="No ruling needed" data-region="ruling"', "landed: the ruling region (the status cell) says no ruling is needed");
const sentBack0 = renderTransmissionPage({ ...open, decision: "needs-work", decided_by: "p-owner", decided_name: "Ryuk", decided_at: "2026-09-09T09:30:00Z", status: "open" }, { grade, canDecide: true, ownerName: "Ryuk", servedStamp: stamp });
eq(count(sentBack0, /<form class="fl-rule /g), 3, "sent back (needs work): the owner can rule it again, the three presses");
const incomplete = renderTransmissionPage({ ...open, route: "incomplete" }, { grade: { binding: false, missing: ["proof"] }, canDecide: true, ownerName: "Ryuk", servedStamp: stamp });
eq(count(incomplete, /<form class="fl-rule /g), 3, "incomplete: the owner keeps the three presses (HEAD's rule)");

// 3 · after a decision: the ruling (who · when · the verdict · the note), no form on a terminal ruling
const approved = { ...open, decision: "approve", decided_by: "p-owner", decided_name: "Ryuk", decided_at: "2026-09-09T09:30:00Z", decision_note: "good — lands at the next close", status: "closed" };
const ruledPage = renderTransmissionPage(approved, { grade, canDecide: true, ownerName: "Ryuk", servedStamp: stamp });
lacks(ruledPage, "data-decide=", "approved: no form, even for the owner");
has(ruledPage, 'data-ruling="T-0909-1"', "approved: the ruling block");
has(ruledPage, 'data-tone="ok">Approved</span>', "approved: the verdict chip");
has(ruledPage, "Ryuk</span>", "approved: who (the joined name, not the id)");
has(ruledPage, "9 Sep", "approved: when");
has(ruledPage, "<p>good - lands at the next close</p>", "approved: the note, its em dash dropped on glass (the voice law)");
has(ruledPage, 'data-region="ruling"', "approved: the verdict sits in the ruling region");
lacks(visible(ruledPage), "p-owner", "approved: the decider's id never shows as text when the name is known");
eq(count(ruledPage, /data-chip="LANDED">Approved</g), 1, "approved: the header's status chip reads Approved on LANDED");
has(ruledPage, "Decided · approved", "approved: the trail says the verdict word");
const ruledReader = renderTransmissionPage(approved, { grade, canDecide: false, ownerName: "Ryuk", servedStamp: stamp });
has(ruledReader, 'data-tone="ok">Approved</span>', "a seated reader sees the verdict");
lacks(ruledReader, "data-decide=", "…and no button");
const rejected = renderTransmissionPage({ ...approved, decision: "reject", decision_note: "" }, { grade, canDecide: true });
lacks(rejected, "data-decide=", "rejected: no form");
has(rejected, 'data-tone="bad">Rejected</span>', "rejected: the verdict chip");
lacks(rejected, "<p></p>", "rejected without a note: no empty note line");
// UI-B5a (QB74B1B7E): a reject is never green: its status chip reads Rejected on REVIEW, never LANDED
eq(count(rejected, /data-chip="REVIEW">Rejected</g), 1, "rejected: the header's status chip reads Rejected on REVIEW");
eq(count(rejected, /data-chip="LANDED"/g), 0, "rejected: no LANDED chip anywhere on the page (a reject is never green)");
const sentBack = renderTransmissionPage({ ...approved, decision: "needs-work", status: "routed" }, { grade, canDecide: true });
has(sentBack, 'data-tone="warn">Sent back</span>', "needs-work: the verdict chip");
has(sentBack, "data-decide=", "needs-work: the form stays (the row is open; the seam lets it be ruled again)");
lacks(sentBack, "<textarea", "needs-work: still no typed note");

// 4 · the owner-queue page and its rows are retired (UI-B4b: GET /transmission as a page 302s to /build); nothing to lock
// 5 · the shared form pieces, standalone
const withNext = renderDecideForm({ id: "T-9", next: "/build" });
eq(count(withNext, /<form /g), 3, "three forms, one per ruling");
has(withNext, '<input type="hidden" name="next" value="/build">', "carries the next it was given");
eq(renderDecideForm({ id: "" }), "", "no id: no form (never a form with an empty action)");
const escaped = renderDecideForm({ id: 'T"1', next: '/x"y' });
lacks(escaped, 'T"1', "the id is escaped into the action/attrs");
has(escaped, "T&quot;1", "…as &quot;");
has(escaped, "/x&quot;y", "next is escaped too");
const full = renderDecideForm({ id: "T-9" });
lacks(full, 'name="next"', "full form without next: no hidden next (the handler falls back to the item's page)");

// 6 · a ruled question (UI-B2, replaces the retired questionnaire's decided chip): on the Decisions screen it wears
// the green "ruled" mark and no choose-option; its card shows the ruling and offers no Record this ruling (a
// ruled question takes no answer, POST /respond answers 409 not_open); an open one offers both.
const rdr = { id: "p-c", name: "A", role: "owner" };
const dq = renderDecisionsPage(await readDecisions(fixtureEnv(), rdr, {}));
// sprint 3 L2: a row is the revision's one-line <li>; a ruled one leads with its option's letter and carries data-ruled
const rowOf = (html, qid) => { const i = html.indexOf(`data-qid="${qid}"`); const j = html.indexOf("</li>", i); return i < 0 ? "" : html.slice(i, j); };
has(rowOf(dq, RULED_QID), 'data-ruled="A"', "a ruled row wears the ruled mark with its chosen option");
lacks(rowOf(dq, RULED_QID), 'data-button="choose-option"', "a ruled row offers no choose-option");
has(rowOf(dq, RULED_QID), "18 Sep", "a ruled row's provenance: when");
has(rowOf(dq, RULED_QID), "Pending in code", "a ruled row's provenance: where it stands in code");
has(rowOf(dq, OPEN_QID), 'data-button="choose-option"', "an open row offers choose-option");
lacks(rowOf(dq, OPEN_QID), "data-ruled=", "an open row wears no ruled mark");
const ruledCard = renderQuestionPage(await readQuestion(fixtureEnv(), rdr, RULED_QID, {}));
const openCard = renderQuestionPage(await readQuestion(fixtureEnv(), rdr, OPEN_QID, {}));
lacks(ruledCard, 'data-button="record-ruling"', "a ruled card offers no Record this ruling");
lacks(ruledCard, 'action="/respond"', "a ruled card posts nothing to /respond");
has(ruledCard, "One worker per org; workspaces are a soft scope.", "a ruled card shows the ruling's own words");
has(ruledCard, " data-chosen>", "a ruled card marks the chosen option (data-chosen on its option card)");
has(openCard, 'data-button="record-ruling" data-door="POST /respond"', "an open card offers Record this ruling on POST /respond");

// 7 · no old noun as visible text on any of the three faces
for (const [name, html] of Object.entries({ ownerPage, ruledPage, sentBack, dq, ruledCard, openCard })) {
  const hits = visible(html).match(BANNED) || [];
  eq(hits, [], `${name}: no banned noun in visible text`);
}

console.log(fail ? `✗ decide-form drift (${checks} checks)` : `✓ decide form: ${checks} checks — owner-only, the seam's three verdicts as three fixed-note buttons and no typed note on the filing page, the ruling after a decision, a ruled question's mark, no old noun`);
process.exit(fail);
