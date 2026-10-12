// src/starter.js — the starter Broadcast built into the product (sprint 2; the owner's MCQ of 2026-09-30 evening: six agents,
// three workflows, three skills for building a web or mobile app; 2026-10-01: BUILT INTO the product, versioned with the
// engine, the same shelf for every org; Equip copies an item into the project). Pure: no D1, no env.
//
// The items are engine/src/presets/*.md, bundled by tools/make-presets.mjs into src/presetdata.js (tools/presets-selftest.mjs
// proves every file parses, every slug is unique and valid, and every call it names is a tool of contracts/door.json).
//
// What Equip writes (src/broadcast.js equipItem, the one door, a person's press in a signed-in browser):
//   1. the project's COPY: the item's body as the doc starter/<slug>.md, through the knowledge write door (one
//      preview then file-shaped batch: the k_docs row and its ONE ledger row, kind knowledge). `read` lists it and `read`
//      reads it, so every AI client connected to the project finds it; anyone seated edits it with preview then file (kind
//      "doc", that path), attributed and kept by the project's versions like any doc.
//   2. ONE filing, kind equip (the reserved kind), lane leader, project the target, parent none (a starter item has no
//      publish row), gapRefs ["preset/<slug>"], touches the item's kind, proof "preset:<slug>@v<version>": the press,
//      attributed and pinned to the version it copied (QEBB5D318). A newer engine version of the item shows as an update
//      the project chooses (Update re-copies the doc, replacing the project's edits: publish a version first to keep them).
import { PRESETS } from "./presetdata.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export { PRESETS };
export const PRESET_PREFIX = "preset:";
export const presetRef = (slug) => "preset/" + slug;                       // the equip row's gapRef
export const presetSource = (slug, v) => `preset:${slug}@v${v}`;           // the equip row's proof
export const starterDoc = (slug) => `starter/${slug}.md`;                  // the project's copy
export const starterHref = (slug) => orgPath("/broadcast/starter/") + encodeURIComponent(slug);
export const presetOf = (slug) => PRESETS.find((p) => p.slug === String(slug || "")) || null;
// presetSlugOf(gaprefs) -> the slug of the row's preset/<slug> gapRef, else null (pure)
export function presetSlugOf(gaprefs) {
  for (const r of String(gaprefs ?? "").split(",")) { const m = /^preset\/([a-z0-9-]{2,40})$/.exec(r.trim()); if (m) return m[1]; }
  return null;
}
// presetVersionOf(proof) -> the version an equip row copied ("preset:<slug>@v<n>"), else null (pure)
export function presetVersionOf(proof) {
  const m = /^preset:[a-z0-9-]{2,40}@v(\d{1,6})$/.exec(String(proof ?? "").trim());
  return m ? Number(m[1]) : null;
}
export const KIND_WORD = { agent: "Agent", workflow: "Workflow", skill: "Skill" };
// copy: off-screen (the Starter pack card's title)
export const STARTER_NOTE = "Built into sharingu: the same shelf for every org, versioned with the engine. Equip copies one into this project as a doc its AI reads with `read`.";
// copy: error (a refusal: the disabled Equip's title)
export const PARTNER_EQUIP_REASON = "A Partner works on the projects they are seated on; equipping is a member's press.";
// the doc Equip writes: the item's own text, titled so `read` names where it came from
export const starterDocTitle = (p) => `${p.title} (starter ${p.kind}, v${p.version})`;

// starterShelf(heres, ctx) -> one card per starter item, in shelf order, with where this project stands on it.
//   heres: Map(slug -> the project's NEWEST preset equip { v, by, at, id }) (src/broadcastread.js modelOf reads them off the
//   one Broadcast statement); ctx { key, pname, seated, partner }.
export function starterShelf(heres, ctx = {}) {
  const { key = null, pname = "this project", seated = false, partner = false } = ctx;
  return PRESETS.map((p) => {
    const h = heres && heres.get ? heres.get(p.slug) || null : null;
    const state = !h ? "none" : h.v === p.version ? "current" : "update";
    const ok = !partner && seated;
    const canEquip = ok && state === "none", canUpdate = ok && state === "update";
    const reason = canEquip || canUpdate ? null
      : partner ? PARTNER_EQUIP_REASON
      : !key ? "There is no project to equip into."   // copy: error
      : !seated ? `You hold no seat on ${pname}, so you cannot equip into it.`
      : `${pname} holds v${p.version}, the newest.`;   // copy: error
    return {
      slug: p.slug, kind: p.kind, title: p.title, purpose: p.purpose, calls: p.calls, v: p.version, source: "starter",
      href: starterHref(p.slug), equipSlug: PRESET_PREFIX + p.slug,
      here: { v: h ? h.v : null, state, by: h ? h.by : null, at: h ? h.at : null, doc: h ? starterDoc(p.slug) : null,
        href: h && h.id ? orgPath("/contribution/") + encodeURIComponent(String(h.id)) : null },
      can: { equip: canEquip, update: canUpdate, reason },
    };
  });
}
