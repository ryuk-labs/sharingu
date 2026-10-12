// src/broadcast.js — Broadcast, the two verbs: Publish and Equip (UI-B11a; through the door since sprint 3, D2 · B7: MCP.md §5
// "Agents: publish, equip"). Owner rulings: Q0E5A1073 (anyone publishes freely; publishing is an OFFER; every control sits on
// equip) · Q571B3D89 (equip per project, attributed, visible) · QEBB5D318 (an equip is pinned to its version; update-version
// files a NEW equip row, the old one stands) · owner MCQ 2026-09-29: Fork 1 (a) each press is ONE filing on the existing
// ledger, Fork 2 (a) anyone seated publishes their OWN item; equip and update by anyone seated on the target project ·
// owner MCQ 2026-10-01 (docs/plan/MCP.md §3 and §5, BETA.md B7): `publish` and `equip` go through the door, which supersedes
// Q60CCC574 ("a human verb has no tool at the MCP door").
//
// THE ONLY WRITER of kind "publish" and kind "equip" (the reserved kinds, core.js isReservedKind): every other door refuses
// them 422 reserved_kind. ONE function per verb serves both doors: publishAnswer / equipAnswer, called by the MCP tools
// `publish` and `equip` (src/mcp.js) and by their REST twins POST /broadcast/publish and POST /broadcast/equip (src/index.js,
// below the gate: a read-only credential and a cross-origin cookie write are refused before them).
//
// WHO MAY CALL (authority; every line that decides it is marked "authority:"):
//   · publish: anyone in the org whose role CLASS is not Partner (src/hats.js roleClassOf: role 'partner', or a typed outside
//     label such as external-* or vendor, still on a row migrate-044 has not reached), on their OWN draft only (not_yours),
//     seated somewhere in the org (not_seated; the admin needs no seat). Sprint 2's review: the routes tested the BARE role
//     (`role === "partner"`), so a typed outside label passed; mayPublish / mayEquip test the class.
//   · equip: anyone whose role class is not Partner, into a project they hold a seat on (the admin: any active project).
//   · a Partner (class) is refused partner_refused for both, before anything is read; a read-only credential previews and is
//     refused read_only_credential at the confirm (the REST twin's gate refuses it on the POST before this module).
//
// PREVIEW FIRST (the owner's rule: every filing is previewed first). Publish and equip are their own write doors, not items of
// `preview` / `file`: they file a RESERVED kind (publish, equip) that the contribution door refuses by design, their checks
// (whose draft, which version, which seat, already current) are the shelf's own, and a starter equip writes a doc AND a
// filing in one press. So each verb previews itself: called without confirm it runs every check and answers the preview
// (what will be filed, where it shows, what it reaches, the terminal text) and writes NOTHING; called again with confirm:
// true it files. A press on the Broadcast page in a signed-in browser is the person's own confirm (they see the item, its
// version and the warning line before they press), so a cookie session's press files at once, as it always has.
// Sprint 7, 7.5b: the MCP door may ask the person itself (publish {publishOnConfirm: true}, equip {equipOnConfirm: true}: the
// confirm, src/confirm.js): the preview then also writes ONE confirm row in `previews` (withConfirmRow) — still nothing
// published or equipped — and a yes runs the verb with confirm: true on exactly what this preview showed.
//
//   publishItem(env, reader, {id, eval}) -> { http: 200, id, slug, v, item } | { http, error }: ONE filing, lane leader, kind
//     publish, parent the item, project the item's own. v = the n-th publish of the slug. Refusals: unknown_item (404: no
//     filing of kind item by that id), not_yours (403: another person's draft), not_seated (403: a person seated nowhere),
//     incomplete_item (422: the draft is not complete), already_published (409), slug_taken (409: the slug's first publisher
//     is another person).
//   equipItem(env, reader, {slug, v, project, eval}) -> { http: 200, id, slug, v, project, from } | { http, error }: ONE
//     filing, lane leader, kind equip, parent the version's publish row, project the target. It serves equip and
//     update-version alike (append-only: an update is a new row). Refusals: project_required (422: no project named and
//     none is this request's), not_seated (403: no seat on the target; the owner may equip into any active project),
//     unknown_item (404: no published slug), unknown_version (404), already_current (409: the project's newest equip of the
//     slug is that version already).
// A suite press carries eval (the item's own eval mark, or eval:true), so the shelf leaves it out unless ?eval=1.
//
// Sprint 2, the starter shelf (src/starter.js): equipItem with slug "preset:<slug>" equips a starter item built into the
// engine. v must be the engine's own version of it (an older one is no longer carried: 404 unknown_version with latest).
// It writes TWO things, in this order: the project's copy (the item's body as the doc starter/<slug>.md, through the
// knowledge write door: its k_docs row and its ONE ledger row, kind knowledge, attributed to the presser), then ONE filing,
// kind equip, parent none, gapRefs ["preset/<slug>"], touches the item's kind, proof "preset:<slug>@v<n>", project the
// target. A refused copy files nothing; an equip that fails after its copy landed leaves the doc, and the next press
// rewrites the same doc and files the equip. Refusals as for an org item: not_seated, unknown_item, unknown_version,
// already_current (the project's newest equip of the slug is that version), project_required; and the knowledge door's
// own (project_forbidden, invalid_ops).

import { db, readerOrg } from "./data.js";
import { fileTransmission, projectSeatsFor, projectArg, EVAL_INHERITED } from "./core.js";
import { projectOf, projectSlug } from "./project.js";   // sprint 13 (13.2): a note names a project by its slug, never its org-prefixed key
import { EQUIP_KIND, PUBLISH_KIND, itemKindOf, itemSlugOf, itemSourceOf } from "./transmission.js";
import { slugOfRow } from "./broadcastread.js";
import { isEvalMark } from "./util.js";
import { PRESET_PREFIX, PRESETS, presetOf, presetRef, presetSource, presetVersionOf, starterDoc, starterDocTitle } from "./starter.js";
import { writeKnowledge } from "./knowledge/write.js";
import { roleClassOf } from "./hats.js";
import { WIDTH, ascii } from "./previewtext.js";

import { PARTNER_PUBLISH_REASON } from "./broadcastpage.js";
import { PARTNER_EQUIP_REASON } from "./starter.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { storeVerbConfirm } from "./confirm.js";   // sprint 7, 7.5b: publish and equip ask their confirm
export { PARTNER_PUBLISH_REASON, PARTNER_EQUIP_REASON };
// mayPublish(person) / mayEquip(person) -> null (may) | the refusal. authority: the role CLASS (src/hats.js roleClassOf), never
// the bare role: a row still carrying a typed outside label (external-ai, vendor) is a Partner here as everywhere else.
export function mayPublish(person) {
  if (!person) return { http: 401, error: "unauthorized" };
  if (roleClassOf(person.role) === "partner") return { http: 403, error: "partner_refused", hint: PARTNER_PUBLISH_REASON };   // authority
  return null;
}
export function mayEquip(person) {
  if (!person) return { http: 401, error: "unauthorized" };
  if (roleClassOf(person.role) === "partner") return { http: 403, error: "partner_refused", hint: PARTNER_EQUIP_REASON };   // authority
  return null;
}
const confirmed = (a) => a && (a.confirm === true || a.confirm === "true" || a.confirm === "1" || a.confirm === 1);

const cleanId = (v) => String(v ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 60);
const ordAsc = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// the publishes of every slug, oldest first, each with its item's slug (the version spine: the n-th publish is vn). Suite
// publishes count only for a suite press, as the shelf counts them only with ?eval=1.
async function publishesOf(env, slug, includeEval) {
  const { results } = await db(env).prepare(
    "SELECT p.id, p.submitter, p.parent, p.eval, p.created_at, i.gaprefs, i.touches, pp.name AS by_name FROM transmission p " +
    "JOIN transmission i ON i.id = p.parent AND i.kind = 'item' LEFT JOIN people pp ON pp.id = p.submitter " +
    "WHERE p.kind = '" + PUBLISH_KIND + "' AND p.org = {org}" + (includeEval ? "" : " AND p.eval = 0")
  ).all();
  return (results || []).filter((r) => slugOfRow(r.gaprefs) === slug).sort(ordAsc);
}

// planPublish(env, reader, a) -> { http: 200, plan } | the refusal: every check publishItem makes, nothing written
export async function planPublish(env, reader, a = {}) {
  const id = cleanId(a && a.id);
  const isOwner = !!(reader && reader.role === "owner");
  if (!id) return { http: 422, error: "id_required", note: "Send id: the id of your own draft (a contribution of kind item). `broadcast` lists yours under mine." };
  const row = await db(env).prepare("SELECT id, kind, submitter, what, why, touches, gaprefs, proof, route, project, eval FROM transmission WHERE id = ? AND org = {org}").bind(id).first();
  if (!row || String(row.kind || "").toLowerCase() !== "item") return { http: 404, error: "unknown_item", id, note: "No draft (a filing of kind item) with that id. GET /broadcast lists yours under mine." };
  if (row.submitter !== reader.id) return { http: 403, error: "not_yours", id, note: "Only the person who filed a draft publishes it." };   // authority: your own draft only
  if (!isOwner && !(await projectSeatsFor(reader.id, env)).length) return { http: 403, error: "not_seated", id, note: "You hold no seat in this org, so you cannot publish to its shelf." };   // authority
  const slug = itemSlugOf(row.gaprefs);
  if (row.route === "incomplete" || !slug || !itemKindOf(row.touches) || !itemSourceOf(row.proof)) {
    return { http: 422, error: "incomplete_item", id, note: "This draft is incomplete: file it again with what, why, touches (skill, agent or workflow), gapRefs [\"item/<slug>\"] and proof (its source)." };
  }
  const isEval = Number(row.eval) === 1 || isEvalMark(a.eval);
  const pubs = await publishesOf(env, slug, isEval);
  if (pubs.some((p) => p.parent === row.id)) return { http: 409, error: "already_published", id, slug, note: "This draft is published already. File a new draft of the slug for its next version." };
  if (pubs.length && pubs[0].submitter !== reader.id) {
    return { http: 409, error: "slug_taken", id, slug, note: `The slug ${slug} is taken: ${pubs[0].by_name || "another person"} published it first. File your draft under another slug.` };
  }
  return { http: 200, plan: { row, slug, v: pubs.length + 1, isEval } };
}
export async function publishItem(env, reader, a = {}) {
  const pl = await planPublish(env, reader, a);
  if (!pl.plan) return pl;
  const { row, slug, v, isEval } = pl.plan;
  const res = await fileTransmission(reader, {
    lane: "leader", kind: PUBLISH_KIND, parent: row.id, gapRefs: ["item/" + slug], touches: row.touches,
    what: `Published ${slug} v${v} to the shelf`,
    why: "A person's press on Broadcast: an offer to the org, equipped per project by the people seated there (Q0E5A1073).",
    eval: isEval, via: a.via || "broadcast",
    // a publish of a test item is a test row: the mark is the item's (G2: a caller's own mark meets the eval rule)
    ...(!isEvalMark(a.eval) && Number(row.eval) === 1 ? { [EVAL_INHERITED]: true } : {}),
  }, env, { reserved: true, project: row.project ?? null });
  if (res && res.error) return { http: 422, ...res };
  return { http: 200, id: res.id, slug, v, item: row.id };
}

// planEquip(env, reader, a) -> { http: 200, plan } | the refusal: every check equipItem makes, nothing written
export async function planEquip(env, reader, a = {}) {
  const isOwner = !!(reader && reader.role === "owner");
  const slug = String((a && a.slug) ?? "").trim().toLowerCase();
  if (!slug) return { http: 422, error: "slug_required", note: "Send slug (an item on the shelf, or preset:<slug> for a starter item) and v: `broadcast` lists both." };   // reads nothing
  // D3 (U-MCP-tail-b): `project` is parsed by core.js projectArg — a non-string is REFUSED project_forbidden (never coerced)
  const pa = projectArg(a ? a.project : undefined, undefined, readerOrg(env));
  if (pa.error) return { http: 403, ...pa };
  let project = pa.project;
  if (!project) project = (await projectOf(env)) || null;
  if (!project) return { http: 422, error: "project_required", note: "Name the project to equip into: {slug, v, project}." };
  // authority: a seat on the target project (the admin: any active project)
  const seated = isOwner
    ? !!(await db(env).prepare("SELECT key FROM projects WHERE key = ? AND active = 1 AND org = {org}").bind(project).first())
    : (await projectSeatsFor(reader.id, env)).some((s) => s.key === project);
  if (!seated) return { http: 403, error: "not_seated", project, note: `You hold no seat on ${projectSlug(project)}, so you cannot equip into it. The people seated there can.` };
  if (slug.startsWith(PRESET_PREFIX)) return planStarter(env, slug.slice(PRESET_PREFIX.length), a, project);
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return { http: 404, error: "unknown_item", slug: slug.slice(0, 40), note: "Nothing on the shelf by that slug. GET /broadcast lists the shelf." };
  const isEval = isEvalMark(a.eval);
  const pubs = await publishesOf(env, slug, isEval);
  if (!pubs.length) return { http: 404, error: "unknown_item", slug, note: "Nothing on the shelf by that slug. GET /broadcast lists the shelf." };
  const vn = Number(String((a && a.v) ?? "").trim().replace(/^v/i, ""));
  if (!Number.isInteger(vn) || vn < 1 || vn > pubs.length) return { http: 404, error: "unknown_version", slug, v: String((a && a.v) ?? "").slice(0, 12), latest: pubs.length, note: `${slug} has versions v1 to v${pubs.length}.` };
  const ids = pubs.map((p) => p.id);
  const cur = await db(env).prepare(
    `SELECT id, parent FROM transmission WHERE kind = '${EQUIP_KIND}' AND project = ? AND parent IN (${ids.map(() => "?").join(",")})` + (isEval ? "" : " AND eval = 0") +
    " ORDER BY created_at DESC, id DESC LIMIT 1"
  ).bind(project, ...ids).first();
  const from = cur ? ids.indexOf(cur.parent) + 1 : null;
  if (from === vn) return { http: 409, error: "already_current", slug, v: vn, project, note: `${projectSlug(project)} is on v${vn} of ${slug} already.` };
  return { http: 200, plan: { starter: null, slug, v: vn, project, from, pub: pubs[vn - 1], publisher: pubs[0].by_name || null, isEval } };
}
export async function equipItem(env, reader, a = {}) {
  const pl = await planEquip(env, reader, a);
  if (!pl.plan) return pl;
  if (pl.plan.starter) return equipStarter(env, reader, pl.plan, a);
  const { slug, v: vn, project, from, pub, isEval } = pl.plan;
  const res = await fileTransmission(reader, {
    lane: "leader", kind: EQUIP_KIND, parent: pub.id, gapRefs: ["item/" + slug], touches: pub.touches,
    what: from ? `Updated ${slug} from v${from} to v${vn} in ${projectSlug(project)}` : `Equipped ${slug} v${vn} into ${projectSlug(project)}`,
    why: "A person's press on Broadcast: this project uses this version until someone seated here updates it (QEBB5D318).",
    eval: isEval || Number(pub.eval) === 1, via: a.via || "broadcast",
    // an equip of a test publish is a test row: the mark is the publish's (G2: a caller's own mark meets the eval rule)
    ...(!isEvalMark(a.eval) && Number(pub.eval) === 1 ? { [EVAL_INHERITED]: true } : {}),
  }, env, { reserved: true, project });
  if (res && res.error) return { http: 422, ...res };
  return { http: 200, id: res.id, slug, v: vn, project, from };
}

// planStarter(env, name, a, project) — the starter half of planEquip (the seat is checked already)
async function planStarter(env, name, a, project) {
  const p = presetOf(name);
  if (!p) return { http: 404, error: "unknown_item", slug: (PRESET_PREFIX + name).slice(0, 48), note: `No starter item by that slug. The shelf holds: ${PRESETS.map((x) => x.slug).join(", ")}.` };
  const vn = Number(String((a && a.v) ?? "").trim().replace(/^v/i, ""));
  if (vn !== p.version) return { http: 404, error: "unknown_version", slug: PRESET_PREFIX + p.slug, v: String((a && a.v) ?? "").slice(0, 12), latest: p.version, note: `This engine carries ${p.slug} at v${p.version} only.` };
  const isEval = isEvalMark(a && a.eval);
  const cur = await db(env).prepare(
    `SELECT id, proof FROM transmission WHERE kind = '${EQUIP_KIND}' AND project = ? AND parent IS NULL AND gaprefs = ?` + (isEval ? "" : " AND eval = 0") +
    " ORDER BY created_at DESC, id DESC LIMIT 1"
  ).bind(project, presetRef(p.slug)).first();
  const from = cur ? presetVersionOf(cur.proof) : null;
  if (from === vn) return { http: 409, error: "already_current", slug: PRESET_PREFIX + p.slug, v: vn, project, note: `${projectSlug(project)} is on v${vn} of ${p.slug} already.` };
  return { http: 200, plan: { starter: p, slug: PRESET_PREFIX + p.slug, v: vn, project, from, doc: starterDoc(p.slug), isEval } };
}
// equipStarter(env, reader, plan, a) — the copy, then the press. -> { http: 200, id, slug: "preset:<slug>", v, project, from, doc,
// knowledge } | { http, error }
async function equipStarter(env, reader, plan, a) {
  const { starter: p, v: vn, project, from, doc, isEval } = plan;
  const copy = await writeKnowledge(reader, { project, eval: isEval, ops: [{ kind: "doc", op: "upsert", data: { path: doc, title: starterDocTitle(p), body: p.body } }] }, env,
    { via: a.via || "broadcast", what: `${from ? "Updated" : "Copied"} the starter ${p.kind} ${p.title} (v${vn}) as ${doc}` });
  if (copy && copy.error) return { http: copy.error === "project_forbidden" ? 403 : 422, ...copy };
  const res = await fileTransmission(reader, {
    lane: "leader", kind: EQUIP_KIND, parent: null, gapRefs: [presetRef(p.slug)], touches: p.kind, proof: presetSource(p.slug, vn),
    what: from ? `Updated the starter ${p.slug} from v${from} to v${vn} in ${projectSlug(project)}` : `Equipped the starter ${p.slug} v${vn} into ${projectSlug(project)}`,
    why: `A person's press on Broadcast: the starter ${p.kind} is copied into this project as the doc ${doc}, which its AI reads and anyone seated edits through preview then file (QEBB5D318: pinned to v${vn}).`,
    eval: isEval, via: a.via || "broadcast",
  }, env, { reserved: true, project });
  if (res && res.error) return { http: 422, ...res };
  return { http: 200, id: res.id, slug: PRESET_PREFIX + p.slug, v: vn, project, from, doc, knowledge: copy && copy.ledger ? copy.ledger : null };
}

// ======================================================================================================================
// THE DOOR: publishAnswer and equipAnswer, ONE function per verb for the MCP tool and its REST twin
// ======================================================================================================================
// o: { press: true } when the caller is a person's press in a signed-in browser (a cookie session): that press is its own
// confirm. Anyone else (a Bearer key, an OAuth grant, an MCP client) previews first and files only with confirm: true.
// -> the preview { preview: true, verb, ..., line, shows, reaches, text, next } (nothing written) | the receipt (filed) | the refusal
export async function publishAnswer(env, person, a = {}, o = {}) {
  const no = mayPublish(person);
  if (no) return no;
  const go = o.press === true || confirmed(a);
  if (go && person.readOnly) return { http: 403, error: "read_only_credential", note: "A read-only credential can preview a publish, never file it. Use your full key." };   // authority
  if (!go) {
    const pl = await planPublish(env, person, a);
    if (!pl.plan) return pl;
    const { row, slug, v } = pl.plan;
    const kind = itemKindOf(row.touches);
    const line = `Publish ${slug} v${v} (${kind}): ${String(row.what || "").slice(0, 160)}`;
    const shows = [{ tab: "broadcast", path: orgPath("/broadcast"), region: "shelf", what: `a card on the org's shelf, at v${v}, published by you` }];
    const reaches = "No project yet: an item on the shelf is an offer. It reaches a project only when someone seated there equips it.";
    const next = { tool: "publish", args: { id: row.id, confirm: true }, rest: `POST /broadcast/publish {"id": "${row.id}", "confirm": true}` };
    const ans = { http: 200, preview: true, verb: "publish", id: row.id, slug, v, kind, line, shows, reaches,
      text: doorText("Publish", [line, `shows on  Broadcast, the org's shelf (v${v})`, `reaches   ${reaches}`], `publish {id: "${row.id}", confirm: true}`), next,
      note: "Nothing is published yet. Show the person this preview; call publish again with confirm: true to publish it." };
    // sprint 7, 7.5b: the confirm (src/confirm.js): the row the person's answer is recorded on, holding what this preview showed
    return await withConfirmRow(env, person, ans, o.confirm, "publish", row.project, { id: row.id, ...(isEvalMark(a.eval) ? { eval: true } : {}) });
  }
  return publishItem(env, person, { ...a, via: o.via || a.via });
}
export async function equipAnswer(env, person, a = {}, o = {}) {
  const no = mayEquip(person);
  if (no) return no;
  const go = o.press === true || confirmed(a);
  if (go && person.readOnly) return { http: 403, error: "read_only_credential", note: "A read-only credential can preview an equip, never file it. Use your full key." };   // authority
  if (!go) {
    const pl = await planEquip(env, person, a);
    if (!pl.plan) return pl;
    const x = pl.plan;
    const what = x.starter ? `the starter ${x.starter.kind} ${x.starter.title}` : `${x.slug}${x.publisher ? ` (published by ${x.publisher})` : ""}`;
    const pw = projectSlug(x.project);   // the project as the person reads it (13.2); args and the confirm row keep the key
    const line = `${x.from ? `Update ${what} from v${x.from} to v${x.v}` : `Equip ${what} v${x.v}`} in ${pw}`;
    const shows = [{ tab: "broadcast", path: orgPath("/broadcast"), region: "equipped-here", what: `this project's equipped list, pinned to v${x.v}` },
      { tab: "broadcast", path: orgPath("/broadcast"), region: "live", what: "the live picture, as this project's contribution" },
      ...(x.starter ? [{ tab: "home", path: orgPath("/doc/") + x.doc, region: "doc", what: `the project's copy, the doc ${x.doc}, which its AI reads` }] : [])];
    const reaches = `Everyone seated on ${pw} gets it${x.starter ? `: the doc ${x.doc} is ${x.from ? "rewritten (edits since are replaced; publish a version first to keep them)" : "written"}` : ""}.`;
    const args = { slug: x.slug, v: x.v, project: x.project, confirm: true };
    return await withConfirmRow(env, person, { http: 200, preview: true, verb: "equip", slug: x.slug, v: x.v, project: x.project, from: x.from, ...(x.starter ? { doc: x.doc } : {}), line, shows, reaches,
      text: doorText(x.from ? "Update" : "Equip", [line, `shows on  Broadcast, ${pw}'s equipped list (v${x.v})${x.starter ? `; the doc ${x.doc}` : ""}`, `reaches   ${reaches}`],
        `equip {slug: "${x.slug}", v: ${x.v}, project: "${pw}", confirm: true}`),
      next: { tool: "equip", args, rest: `POST /broadcast/equip ${JSON.stringify(args)}` },   // a call sent as given keeps the key (the review's should-fix 1)
      note: `Nothing is equipped yet. Show the person this preview; call equip again with confirm: true to ${x.from ? "update" : "equip"} it.` },
      // sprint 7, 7.5b: the confirm's row holds what this preview showed (the RESOLVED project), so a yes equips exactly that
      o.confirm, "equip", x.project, { slug: x.slug, v: x.v, project: x.project, ...(isEvalMark(a.eval) ? { eval: true } : {}) });
  }
  return equipItem(env, person, { ...a, via: o.via || a.via });
}
// withConfirmRow(env, person, preview, confirm, verb, project, args) -> the preview, and when the MCP door asks the person to
// confirm (confirm: { key, until, digest }, src/mcp.js) its confirm row's id and window (src/confirm.js storeVerbConfirm), never
// for a read-only credential (it never files) nor a verb with no project to hold the row. The REST twins never pass a confirm.
async function withConfirmRow(env, person, ans, confirm, verb, project, args) {
  if (!confirm || !confirm.key || !confirm.until) return ans;
  if (person.readOnly) return { ...ans, readOnly: true };
  if (!project) return ans;
  const id = await storeVerbConfirm(env, person, { verb, project, args }, confirm);
  return { ...ans, confirmRow: id, confirmUntil: String(confirm.until) };
}
// doorText(verb, lines, call) -> the terminal block, in the preview's own style (src/previewtext.js: plain ASCII, WIDTH columns);
// a line too long for the width WRAPS under its label (a path or a project's name is never cut off), the call stays whole
export function doorText(verb, lines, call) {
  const rule = "-".repeat(WIDTH);
  return [`sharingu  ${verb}, nothing written yet`, rule, ...lines.flatMap((l) => wrapLine(l)), rule, `then      ${call}`].join("\n");
}
const LABEL = /^(shows on|reaches)\s+/;
function wrapLine(raw) {
  const m = LABEL.exec(String(raw));
  const label = m ? m[1].padEnd(9) + " " : "", indent = " ".repeat(label.length);
  const words = ascii(m ? String(raw).slice(m[0].length) : raw).split(" ");
  const out = [];
  let cur = label;
  for (const w of words) {
    const lead = out.length ? indent : label;
    if (cur.length > lead.length && (cur + " " + w).length > WIDTH) { out.push(cur); cur = indent + w; }
    else cur = cur.length > lead.length ? cur + " " + w : cur + w;
  }
  out.push(cur);
  return out.map((l) => (l.length > WIDTH ? l.slice(0, WIDTH - 3) + "..." : l));   // one word longer than the width (never a path a person needs: the call below is whole)
}
