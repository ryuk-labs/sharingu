// src/broadcastread.js — Broadcast, the shelf read (UI-B11a; the screen is UI-B11b). Owner rulings: Q2485A7FD (Broadcast is its
// own tab; publish a skill, an agent or a workflow; any user equips; updates push) · Q0E5A1073 (anyone publishes freely;
// publishing is an OFFER; every control sits on equip) · Q571B3D89 (equip per project, attributed, visible) · QEBB5D318 (an
// equip is pinned to its version; an update shows a notice and the holder chooses) · QF4501CEC (Broadcast stops at the org
// wall) · Q93B3F368 (project, not workspace) · owner MCQ 2026-09-29: Fork 1 (a) the three kinds are filings on the existing
// ledger (no table), Fork 2 (a) anyone seated publishes their OWN item, equip and update by anyone seated on that project.
//
// ONE seam, every face (the readGtmPipeline pattern): readBroadcast(env, reader, q) is the whole read; GET /broadcast answers it
// as JSON (in UI-B11a a browser gets the JSON too; UI-B11b renders it), and the MCP `broadcast` tool and brain://broadcast
// answer the same object. equippedHere(env, reader, project) is its equipped-here region alone, the SAME function GET /map/mcp's
// workspace-shelf reads (guardrail 7).
//
//   shelf          one card per published slug, newest publish first: its version v (= how many times the slug was
//                  published, the n-th publish is vn), what · why · kind · source of the newest publish's item, its publisher
//                  (the slug's FIRST publisher: a slug belongs to them), where this project stands on it (here: the newest equip
//                  row of the slug in this project, pinned to its version: none, current or update) and what the reader may
//                  press (can.equip when this project has none of it, can.update when it is behind; each false with its reason).
//   equipped-here  the cards this project holds, each pinned to its version with who equipped it and when (its filing).
//   org-wall-note  the org's own name: nothing on this shelf reaches another org.
//   mine           the reader's own drafts (kind item), newest first, each published (its version) or not, and whether it
//                  can be published (complete, not yet published, its slug not another person's), else why not.
//   call           the exact call that files a draft (transmission.js FILING_ITEM_CALL).
//   stamp          counts {published, equippedHere, updates}; filter.kinds one chip per item kind (skill · agent · workflow).
//   empty          the named EMPTY sentence of each empty region (D11), so the screen types none of its own.
//   starter-shelf  (sprint 2) the starter items BUILT INTO the product (src/starter.js, the same twelve for every org), each
//                  with where this project stands on it (the newest preset equip of the slug here: none, current or update)
//                  and what the reader may press; equipped-here then carries the starter items too (source "starter",
//                  doc: the project's copy, starter/<slug>.md). A Partner never equips (can.reason PARTNER_EQUIP_REASON).
//
// Budget (guardrail 5): ONE D1 statement beyond the memoized auth, src/hotsql.js BROADCAST_SQL (EXPLAINed by
// tools/d1-hot-selftest.mjs section O), for the read and for Map · MCP alike. The project is GET /goals' own
// (goalsread.js projectNamed). A failed statement answers 200 live:'unreachable' with empty regions; a quota error propagates.

import { db } from "./data.js";
import { projectNamed, optsOf, wave } from "./goalsread.js";
import { getTenantConfig } from "./tenant.js";
import { isPartnerReader } from "./core.js";
import { projectOf, projectSlug } from "./project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { BROADCAST_SQL, BROADCAST_ROWS_LIMIT } from "./hotsql.js";
import { FILING_ITEM_CALL, ITEM_KINDS, ITEM_SLUG, itemSourceOf } from "./transmission.js";
import { PRESETS, presetOf, presetSlugOf, presetVersionOf, starterShelf, starterDoc, PARTNER_EQUIP_REASON } from "./starter.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

// copy: off-screen (the read's JSON; the page draws its own phrase or puts it in a title)
export const EMPTY_SHELF = (org) => `Nothing is published to ${org}'s shelf yet.`;
// copy: off-screen (the read's JSON; the page draws its own phrase or puts it in a title)
export const EMPTY_HERE = "This project has equipped nothing.";
// copy: off-screen (the read's JSON; the page draws its own phrase or puts it in a title)
export const NO_DRAFT = "You have no draft to publish. Your own Claude files one with the call below.";
// copy: off-screen (the read's JSON; the page draws its own phrase or puts it in a title)
export const ORG_WALL = (org) => `Everything on this shelf stays inside ${org}. Nothing here reaches another org.`;
// D8, the equip warning: one fixed line, text and never input (the blessing gate, Q8FEF8087, is out of scope)
// copy: off-screen (the read's JSON; the page draws its own phrase or puts it in a title)
export const EQUIP_LINE = (publisher, kind, project) => `Adds ${publisher}'s ${kind} to ${projectSlug(project)}. Everyone seated here gets it.`;

// slugOfRow(gaprefs) -> the first item/<slug> the row names, else null (pure): the version spine of a slug is its items' publishes
export function slugOfRow(gaprefs) {
  for (const r of String(gaprefs ?? "").split(",")) { const m = ITEM_SLUG.exec(r.trim()); if (m) return m[1]; }
  return null;
}
const ordAsc = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const ordDesc = (a, b) => ordAsc(b, a);

// ledgerOf(env, reader, includeEval) -> { rows, seats, more, down }: the ONE statement (BROADCAST_SQL)
async function ledgerOf(env, reader, includeEval) {
  const isOwner = !!(reader && reader.role === "owner");
  const rid = reader && reader.id ? String(reader.id) : "";
  const w = await wave([db(env).prepare(BROADCAST_SQL(includeEval)).bind(isOwner ? 1 : 0, rid, BROADCAST_ROWS_LIMIT + 1, rid).all()]);
  const res = w.val(0);
  if (!res) return { rows: [], seats: [], more: false, down: true };
  const all = res.results || [];
  const rows = all.filter((r) => r.kind !== "seat");
  return { rows: rows.slice(0, BROADCAST_ROWS_LIMIT), seats: all.filter((r) => r.kind === "seat"), more: rows.length > BROADCAST_ROWS_LIMIT, down: false };
}

// modelOf(ledger, reader, project) -> { cards, here, mine } (pure over the one statement's rows)
export function modelOf({ rows, seats }, reader, project) {
  const rid = reader && reader.id ? String(reader.id) : "";
  const isOwner = !!(reader && reader.role === "owner");
  const partner = isPartnerReader(reader);
  const key = project && project.key ? String(project.key) : null;
  const pname = (project && (project.name || projectSlug(project.key))) || "this project";
  const seated = !!key && (isOwner || seats.some((s) => s.project === key));
  const asc = [...rows].sort(ordAsc);
  const items = new Map(asc.filter((r) => r.kind === "item").map((r) => [r.id, r]));
  const ver = new Map(), bySlug = new Map();
  for (const p of asc) {
    if (p.kind !== "publish" || !items.has(p.parent)) continue;
    const slug = slugOfRow(items.get(p.parent).gaprefs);
    if (!slug) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(p);
    ver.set(p.id, { slug, v: bySlug.get(slug).length, item: p.parent });
  }
  const eqs = asc.filter((e) => e.kind === "equip" && ver.has(e.parent));
  // review fix 2a (sprint 2): a Partner's shelf is the slugs published FROM, or equipped INTO, a project they are seated on
  // (the statement's own seat rows; an equip row already reaches only their seated projects), never the org's whole shelf.
  // The starter pack (built in, the same for every org) is everyone's.
  if (partner) {
    const mineP = new Set(seats.map((x) => x.project).filter(Boolean));
    const seen = new Set();
    for (const [slug, ps] of bySlug) if (ps.some((p) => mineP.has(p.project))) seen.add(slug);
    for (const e of eqs) if (mineP.has(e.project)) seen.add(ver.get(e.parent).slug);
    for (const slug of [...bySlug.keys()]) if (!seen.has(slug)) bySlug.delete(slug);
  }
  const cards = [];
  for (const [slug, ps] of bySlug) {
    const last = ps[ps.length - 1], first = ps[0], it = items.get(last.parent);
    const mineEq = eqs.filter((e) => ver.get(e.parent).slug === slug);
    const hereRows = key ? mineEq.filter((e) => e.project === key) : [];
    const h = hereRows.length ? hereRows[hereRows.length - 1] : null;
    const hv = h ? ver.get(h.parent).v : null;
    const state = !h ? "none" : hv === ps.length ? "current" : "update";
    const kind = it.touches ?? null;
    const canEquip = !partner && seated && state === "none", canUpdate = !partner && seated && state === "update";
    const reason = canEquip || canUpdate ? null
      : partner ? PARTNER_EQUIP_REASON
      : !key ? "There is no project to equip into."   // copy: error
      : !seated ? `You hold no seat on ${pname}, so you cannot equip into it.`
      : `${pname} is on the newest version, v${ps.length}.`;   // copy: error
    const publisher = { id: first.submitter ?? null, name: first.by_name ?? null };
    cards.push({
      slug, kind, v: ps.length, what: it.what ?? null, why: it.why ?? null, source: itemSourceOf(it.proof),
      publisher, publishedAt: last.created_at ?? null,
      equippedIn: new Set(mineEq.map((e) => e.project)).size,
      here: { v: hv, state, by: h ? (h.by_name ?? null) : null, at: h ? (h.created_at ?? null) : null },
      can: { equip: canEquip, update: canUpdate, reason },
      warning: EQUIP_LINE(publisher.name || "its publisher", kind || "item", pname),
      href: orgPath("/contribution/") + encodeURIComponent(String(last.id)),
      _key: last, _eq: h,
    });
  }
  cards.sort((a, b) => ordDesc(a._key, b._key));
  const here = cards.filter((c) => c._eq).map((c) => ({ slug: c.slug, kind: c.kind, v: c.here.v, latest: c.v, state: c.here.state, by: c.here.by, at: c.here.at,
    href: orgPath("/contribution/") + encodeURIComponent(String(c._eq.id)), source: "org" }));
  // the starter items this project equipped: an equip row with no parent naming preset/<slug> (src/starter.js), the newest
  // per slug in this project, pinned to the version its proof names
  const heres = new Map();
  if (key) for (const e of asc) {
    if (e.kind !== "equip" || e.parent || e.project !== key) continue;
    const slug = presetSlugOf(e.gaprefs), v = presetVersionOf(e.proof);
    if (slug && v && presetOf(slug)) heres.set(slug, { v, by: e.by_name ?? null, at: e.created_at ?? null, id: e.id });
  }
  const starter = starterShelf(heres, { key, pname, seated, partner });
  const starterHere = starter.filter((c) => c.here.state !== "none").sort((a, b) => (a.here.at < b.here.at ? 1 : a.here.at > b.here.at ? -1 : 0))
    .map((c) => ({ slug: c.slug, kind: c.kind, title: c.title, v: c.here.v, latest: c.v, state: c.here.state, by: c.here.by, at: c.here.at, href: c.here.href,
      source: "starter", doc: starterDoc(c.slug) }));
  here.push(...starterHere);
  const ownerOf = new Map([...bySlug].map(([s, ps]) => [s, ps[0]]));
  const takenAnywhere = new Set([...ver.values()].map((x) => x.slug));
  const pubOf = new Map([...ver.values()].map((x) => [x.item, x.v]));
  const mine = [...items.values()].filter((r) => r.submitter === rid).sort(ordDesc).map((r) => {
    const slug = slugOfRow(r.gaprefs);
    const published = pubOf.has(r.id) ? pubOf.get(r.id) : null;
    const owner = slug ? ownerOf.get(slug) : null;
    // a Partner's own draft whose slug another person holds outside their projects: taken, its publisher never named
    const hidden = partner && slug && !owner && takenAnywhere.has(slug);
    const taken = !!(owner && owner.submitter !== rid) || hidden;
    const incomplete = r.route === "incomplete" || !slug;
    const publishable = !incomplete && published == null && !taken;
    const reason = publishable ? null
      : published != null ? `Published as v${published}.`   // copy: off-screen
      : incomplete ? "This draft is incomplete. File it again with every field (the call below)."
      : `The slug ${slug} is taken: ${(owner && owner.by_name) || "another person"} published it first.`;   // copy: error
    return { id: r.id, slug, kind: r.touches ?? null, what: r.what ?? null, published, publishable, reason };
  });
  return { cards: cards.map(({ _key, _eq, ...c }) => c), here, mine, starter };
}

// ---- readBroadcast: the Broadcast read (the shape in contracts/door.declared.json `broadcast`) ----
export async function readBroadcast(env, reader, q = {}) {
  const { includeEval } = optsOf(q);
  const [project, tenant] = await Promise.all([projectNamed(env, reader), getTenantConfig(env)]);
  const org = (tenant && tenant.brand && tenant.brand.org) || "";
  const L = await ledgerOf(env, reader, includeEval);
  const { cards, here, mine, starter } = modelOf(L, reader, project);
  const counts = L.down ? { published: null, equippedHere: null, updates: null, starter: PRESETS.length }
    : { published: cards.length, equippedHere: here.length, updates: here.filter((x) => x.state === "update").length, starter: PRESETS.length };
  // the named EMPTY sentences (D11); none when the ledger did not answer (live:'unreachable' says so instead)
  const empty = L.down ? {} : {
    ...(cards.length ? {} : { shelf: EMPTY_SHELF(org) }),
    ...(here.length ? {} : { "equipped-here": EMPTY_HERE }),
    ...(mine.some((m) => m.publishable) ? {} : { mine: NO_DRAFT }),
  };
  return {
    project, org,
    stamp: { counts },
    filter: { kinds: ITEM_KINDS.map((kind) => ({ kind, count: cards.filter((c) => c.kind === kind).length })) },
    regions: { shelf: cards, "equipped-here": here, "org-wall-note": { org, text: ORG_WALL(org) }, "starter-shelf": starter },
    mine, call: FILING_ITEM_CALL, empty,
    ...(L.more ? { more: true } : {}),
    ...(includeEval ? { eval: true } : {}),
    ...(L.down ? { live: "unreachable" } : {}),
  };
}

// equippedHere(env, reader, project?) -> readBroadcast's equipped-here rows for the project (GET /goals' own when none is
// named), in ONE D1 statement (the same BROADCAST_SQL): GET /map/mcp's workspace-shelf (guardrail 7). A failed read is [].
export async function equippedHere(env, reader, project = null) {
  return (await shelvesHere(env, reader, project)).here;
}
// shelvesHere(env, reader, project?) -> { here, starter }: the equipped-here rows and the starter shelf for the project, off
// the SAME one statement (GET /map/mcp: its workspace-shelf and its global-presets, the starter items with their Equip)
export async function shelvesHere(env, reader, project = null) {
  const p = project || { key: await projectOf(env), name: null };   // the here rows need the key alone
  const L = await ledgerOf(env, reader, false);
  const m = modelOf(L, reader, p);
  return { here: m.here, starter: m.starter };
}
