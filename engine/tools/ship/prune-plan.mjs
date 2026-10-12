// tools/ship/prune-plan.mjs — THE prune rule (G2 H3, the independent review), pure: no network, no file. tools/ship/prune.mjs
// reads what it needs through the door and calls planPrune; tools/prune-selftest.mjs proves the rule on fixtures.
//
// THE RULE. A stored item this build no longer files ("stale": stored, not built) is REMOVED only when
//   (1) the import's own identity created it AND last updated it (createdBy == updatedBy == the import key's person), and
//   (2) no write that was not an import ever touched it: no knowledge ledger row (transmission kind 'knowledge') whose
//       clientRef is not an import's ("import:…", or a prune's own "prune-…") names it in its touches — whoever filed it, the
//       owner by hand through the MCP included. A ledger row's touches are capped (TOUCHES_MAX, 30 names): a row at the cap
//       may have named more, so it also protects every item its submitter last updated in the two minutes before the row. Since
//       sprint 7, 7.5b the knowledge door stamps its ledger row with the moment every row it writes carries (src/knowledge/write.js;
//       since sprint 7's review, C3, as the row's grade's batchAt — its created_at is when it landed, so a reader polling by time
//       never misses it: batchAtOf), so an item that still holds that write sits at the row's own moment and the window covers it
//       however long the write took (before, the row took its own later moment: a write slower than two minutes, its bodies'
//       puts, left the items past the 30th unprotected); a row filed before 7.5b has only the window;
//   or when an OWNER'S RULING names it (tools/ship/prune-rulings.json: a project, a kind, explicit keys or every stale item
//   of the kinds) and (2) holds.
// Everything else stale is KEPT and listed with its reason (made or changed by another person; touched by a write that was
// not an import). The plan is what a person reads before anything goes: by kind, by ref, with why.
// A one-row kind (aim, gtm) is never pruned.

export const PLAN_VERSION = 1;
export const ORDER = ["render", "style", "edge", "check", "card", "card_kind", "doc", "question", "goal", "node"];
export const ONE_ROW = new Set(["aim", "gtm"]);
export const TOUCHES_CAP = 30;            // src/knowledge/write.js TOUCHES_MAX: the names a ledger row holds at most
export const CAP_WINDOW_MS = 120_000;     // a capped row protects what its submitter updated this long before it (7.5b: its own rows sit at 0)
export const DEFAULT_MAX = 3000;          // the apply refuses a plan that removes more (--max raises it after reading the plan)
export const isImportRef = (ref) => typeof ref === "string" && (ref.startsWith("import:") || ref.startsWith("prune-"));

// touchName(kind, key, item) -> the names a ledger row's touches may carry for this item (src/knowledge/write.js: `<kind>:<key>`;
// a render is touched as its screen, `render:<screen>`)
export function touchNames(kind, key, item) {
  if (kind === "render") return [`render:${(item && item.screen) || String(key).split("|")[0]}`];
  return [`${kind}:${key}`];
}
// batchAtOf(grade) -> a ledger row's batch moment (its grade's batchAt, as read: the parsed object or its JSON text), or null
export function batchAtOf(grade) {
  let g = grade;
  if (typeof g === "string") { try { g = JSON.parse(g); } catch { g = null; } }
  return g && typeof g === "object" && typeof g.batchAt === "string" && g.batchAt ? g.batchAt : null;
}
const csv = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((x) => String(x).trim()).filter(Boolean);
const ms = (t) => { const n = Date.parse(t || ""); return Number.isFinite(n) ? n : null; };

// rulingFor(rulings, project, kind, key) -> the first ruling naming this stale item, or null
export function rulingFor(rulings, project, kind, key) {
  for (const r of Array.isArray(rulings) ? rulings : []) {
    if (!r || r.project !== project) continue;
    const kinds = r.kinds || (r.kind ? [r.kind] : []);
    if (!kinds.includes(kind)) continue;
    if (r.stale === true || (Array.isArray(r.keys) && r.keys.includes(key))) return r;
  }
  return null;
}

// planPrune({ project, identity, stored, built, ledger, rulings, inputs, url, max }) -> the plan:
//   stored: { kind: [{ key, data, item }] } — every stored item of the kinds read (item carries createdBy/updatedBy/updatedAt)
//   built: Map(kind -> Set(key)) — what this build files
//   ledger: [{ id, submitter, clientRef, touches, at }] — the project's knowledge ledger rows (every submitter)
// -> { v, project, url, identity, at, inputs, max, counts, remove: { kind: [{ key, data, updatedAt, updatedBy, why }] },
//      kept: { kind: [{ key, why }] } }
export function planPrune({ project, identity, stored, built, ledger, rulings = [], inputs = {}, url = "", max = DEFAULT_MAX, at = new Date().toISOString() }) {
  // the names every non-import ledger row touched, and the capped rows' windows
  const touched = new Map();   // name -> the first non-import row naming it
  const capped = [];
  for (const l of Array.isArray(ledger) ? ledger : []) {
    if (isImportRef(l.clientRef)) continue;
    const names = csv(l.touches);
    for (const n of names) if (!touched.has(n)) touched.set(n, l);
    if (names.length >= TOUCHES_CAP && ms(l.at) != null) capped.push(l);
  }
  const remove = {}, kept = {};
  const add = (m, kind, row) => { (m[kind] = m[kind] || []).push(row); };
  for (const kind of ORDER) {
    if (ONE_ROW.has(kind) || !stored[kind]) continue;
    const have = built.get(kind) || new Set();
    for (const s of stored[kind]) {
      if (have.has(s.key)) continue;
      const it = s.item || {};
      const by = touchNames(kind, s.key, it).map((n) => touched.get(n)).find(Boolean);
      const up = ms(it.updatedAt);
      const win = !by && up != null ? capped.find((l) => l.submitter === it.updatedBy && up <= ms(l.at) && ms(l.at) - up <= CAP_WINDOW_MS) : null;
      if (by || win) { add(kept, kind, { key: s.key, why: `touched by ${(by || win).id}, a write that was not an import (${(by || win).clientRef || "no clientRef"})${win ? ", within its capped row's window" : ""}` }); continue; }
      const own = !!identity && it.createdBy === identity && it.updatedBy === identity;
      const ruling = rulingFor(rulings, project, kind, s.key);
      if (!own && !ruling) { add(kept, kind, { key: s.key, why: it.createdBy !== identity ? `created by ${it.createdBy || "?"}, not the import` : `last changed by ${it.updatedBy || "?"}, not the import` }); continue; }
      add(remove, kind, { key: s.key, data: s.data, updatedAt: it.updatedAt || null, updatedBy: it.updatedBy || null,
        why: own ? (ruling ? `the import's own; ruled: ${ruling.ruling}` : "the import's own (created and last changed by the import, touched by nothing else)") : `ruled: ${ruling.ruling}` });
    }
  }
  const n = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.length]));
  const total = (m) => Object.values(m).reduce((x, v) => x + v.length, 0);
  return { v: PLAN_VERSION, project, url, identity, at, inputs, max, counts: { remove: total(remove), kept: total(kept), removeByKind: n(remove), keptByKind: n(kept) }, remove, kept };
}

// verifyForApply(plan, current, { identity, max }) -> { ok, refusal?, go: { kind: [entry] }, changed: [{ kind, key, why }] }:
// the apply removes only what the plan names AND still stands as it was read (stored, last changed at the same time by the
// same person); the plan's identity must be the key's; above max it removes nothing
export function verifyForApply(plan, current, { identity, max = DEFAULT_MAX } = {}) {
  if (!plan || plan.v !== PLAN_VERSION || !plan.remove) return { ok: false, refusal: "not a prune plan (tools/ship/prune.mjs --plan writes one)" };
  if (plan.identity !== identity) return { ok: false, refusal: `the plan was made for the import identity ${plan.identity}, and this key is ${identity}` };
  const total = Object.values(plan.remove).reduce((x, v) => x + v.length, 0);
  if (total > max) return { ok: false, refusal: `the plan removes ${total} items, over the cap of ${max}: read it, then raise the cap with --max ${total}` };
  const go = {}, changed = [];
  for (const [kind, list] of Object.entries(plan.remove)) {
    const now = current[kind] || new Map();
    for (const e of list) {
      const c = now.get(e.key);
      if (!c) { changed.push({ kind, key: e.key, why: "no longer stored" }); continue; }
      if ((c.updatedAt || null) !== e.updatedAt || (c.updatedBy || null) !== e.updatedBy) { changed.push({ kind, key: e.key, why: `changed since the plan (${c.updatedBy || "?"} at ${c.updatedAt || "?"})` }); continue; }
      (go[kind] = go[kind] || []).push(e);
    }
  }
  return { ok: true, go, changed };
}
