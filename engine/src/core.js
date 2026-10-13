// src/core.js — Agent R domain logic (M-ADR-008a phase 2a). Pure move out of
// src/index.js: these are the domain-logic functions (gate-grading, filing, auth
// resolution, the project axis, the report/backup jobs) that used to live inline in
// the router file. index.js now imports what it needs from here; this file NEVER
// imports from index.js (the cycle rule — index.js imports FROM core.js, so the
// reverse would be circular). Everything below comes from the neutral modules
// (util.js, transmission.js, tenant.js, refs.js, report.js) or is defined locally
// when nothing outside this file needs it (csvJoin, doorProject, the READ_ONLY_SUFFIX/
// DECIDE_VERDICTS/BANNED_KEYS/SANCTIONED_TEXT_FIELD constants).

import { db, signIn, readerOrg, orgCache, atAddress, addressServes } from "./data.js";
import { store, artifactKey, CRON_REPORT_OWNER, CRON_REPORT_KEY_RE } from "./storage.js";   // sprint 6, 6.4: every R2 key carries the org
import { uid, now, sha256, TX_LANES, isEvalSeat, isD1Quota } from "./util.js";
import { gateGrade, completingExample, incompleteNote, RESERVED_KINDS, KNOWLEDGE_KIND } from "./transmission.js";
import { checkShape, shapeColumns, decodeShape } from "./shapes.js";
import { resolveMapRefs } from "./maprefs.js";
import { projectOf, projectScopeOf, projectClause, scopedProjectOf, keyInOrg, orgOfKey, projectSlug } from "./project.js";   // sprint 13 (13.2): a sentence names a project by its slug
import { getTenantConfig, resolveOwner, ownerName } from "./tenant.js";
import { refTokensFor, refsInsert, REFS_BATCH_SQL } from "./refs.js";
import { reqMemo, signInMemo } from "./reqmemo.js";
import { renderBatchReport } from "./report.js";
import { credEpoch, accountGrantStands, grantKindOf, GRANT_KINDS } from "./oauthgrants.js";
import { verifyGoalRef, proposeGoalRef } from "./goals.js";
import { orgUrl } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { requestClient } from "./client.js";   // sprint 13, 13.1: the client word the request's door set (migrate-080's transmission.client)
import { orgsOfAccount, pendingOf, accountGrantSeat, normOrgArg, sessionAtRow } from "./accounts.js";   // sprint 7, 7.4b: an account session's own orgs (the root's picker); 7.5a: an account grant's seat
import { tempoOf } from "./tempo.js";
import { checkPlan, itemsTally, planShownOf } from "./plans.js";   // sprint 8, 8.2: every ledger row checks the org's plan and is counted with it; 8.4: whoami answers it
import { readerKeys, hatsOf, roleClassOf, isOutsideLabel } from "./hats.js";
import { TX_ONE_SQL, FILING_COUNTERS_SQL, notMind, KNOWLEDGE_AT_SQL, OWNER_OPEN_COUNT_SQL, LOOPS_OPEN_SQL, HEARTBEAT_LANDED_SQL } from "./hotsql.js";

export async function consentOf(personId, env) {
  try {
    const r = await db(env).prepare("SELECT trace_consent FROM people WHERE id = ? AND org = {org}").bind(personId).first();
    return r?.trace_consent || "off";
  } catch { return "off"; } // pre-migration DB reads as 'off' — consent stays opt-in
}

// M-ADR-019: effective consent = the person's own grade, OR the org's mandated FLOOR
// when their role is mandated — INTERNAL roles only. This is a pure grade computation;
// what gets captured / how it's sanitized is unchanged (mandate is who-enables, not what).
export const CONSENT_RANK = { off: 0, traces: 1, "traces+prompts": 2 };
// mandateFloorFor(who, tenant) — the floor the org's settings.traceMandate imposes on this role,
// or "off" (none). Never applies to external*/vendor: external contributors are NEVER
// org-mandated (defense-in-depth — even if the settings mistakenly list such a role).
// `who` is a role string (as before) or a person (migrate-044): their role and their typed label (people.role_label, the
// role they held before the migration) are both read, so a mandate on "internal-eng" still binds a migrated internal-eng
// member; a Partner is outside the org and never mandated, like external*/vendor. Hats never trigger a mandate.
export function mandateFloorFor(who, tenant) {
  const roles = who && typeof who === "object"
    ? [String(who.role || ""), ...(who.role_label ? [String(who.role_label)] : [])] : [String(who || "")];
  if (roles.some((r) => isOutsideLabel(r) || r === "partner")) return "off";
  const m = tenant && tenant.traceMandate;
  if (m && typeof m === "object" && Array.isArray(m.roles) && roles.some((r) => m.roles.includes(r)) &&
      CONSENT_RANK[m.floor] != null) return m.floor;
  return "off";
}
// consentStatus — the full picture for a person: their self-set grade, the mandate floor
// (if any), the effective grade the door enforces, and whether a mandate is in force
// (for transparency on /profile and in whoami — mandated is never hidden).
export async function consentStatus(person, env) {
  const personal = await consentOf(person.id, env);
  let floor = "off";
  try { floor = mandateFloorFor(person, await getTenantConfig(env)); } catch {}
  const effective = CONSENT_RANK[floor] > CONSENT_RANK[personal] ? floor : personal;
  return { personal, effective, floor, mandated: CONSENT_RANK[floor] > 0 };
}
// effectiveConsent — the grade the door actually enforces (personal raised to any mandate
// floor). Every enforcement site (trace strip, handoff prompts, whoami) reads
// THIS, never the raw personal grade, so the two doors can never diverge on the guarantee.
export async function effectiveConsent(person, env) {
  return (await consentStatus(person, env)).effective;
}

// normalizeRef — B3 (PRD 02_AGENT_R/prd-work-loop.md; migrate-014): a loop's optional
// canonical ref (screen:NNN · c/<id> · q/<id> · mind/<area>), stored VERBATIM (never
// classified — an open item may name a ref no grammar parses yet, and
// per ADR-082 §2 a claim is a courtesy signal, never a lock, so this stays loose).
// Validated loosely: absent/blank -> null (no ref), too long -> {error}, otherwise the
// trimmed string. Shared by MCP open_items and REST POST /open-items so the two seams — the
// same table, the same column — cannot validate differently.
export function normalizeRef(raw) {
  if (raw === undefined || raw === null) return { ref: null };
  const s = String(raw).trim();
  if (!s) return { ref: null };
  if (s.length > 80) return { error: "ref_too_long", max: 80 };
  return { ref: s };
}

// The router's ONE insert path (ADR-062/063). Called by BOTH POST /preview/file-contribution and the MCP
// file_contribution tool (through the batch door), so the seam has a single implementation — the seam rule (ADR-063):
// one shape, one place. Returns the response object (an {error} field means a 4xx to the caller).
// "ba" added by owner ruling 2026-08-30: BA (requirements/flows) files through its OWN
// envelope row — supersedes the S-018 "no BA lane" correction, which predated any BA seat.
// Derived from src/lanes.js (Pass A shared-vocabulary de-dup) so the gate and the UI read
// the same five lanes and cannot silently disagree.

// mapRefsFor(env, project, bodies, { near, goalIds }) — the gate's three verifiers for ONE project's contributions (src/maprefs.js
// resolveMapRefs): the project's own Map is the check. A project the door could not stamp (null) checks against nothing:
// every screen, component or node depends it names reads as not in the Map.
export async function mapRefsFor(env, project, bodies, o = {}) {
  return resolveMapRefs(env, project, bodies, { near: !!o.near, goalIds: o.goalIds || [] });
}
// artifactScreens(env, project, list) -> {list, valid, reserved, unknown, ok}: the screens an artifact
// names, checked against the project's own Map (save_file and POST /artifact; a screen not in it is dropped, never refused)
export async function artifactScreens(env, project, list) {
  const l = (Array.isArray(list) ? list : []).map((x) => String(x).trim()).filter(Boolean);
  if (!l.length) return { list: [], valid: [], reserved: [], unknown: [], ok: false };
  return (await mapRefsFor(env, project, [{ screens: l }])).screens(l.join(","));
}

// nextSeqStart(env, day) — MAX+1, not COUNT+1: eval self-cleans delete rows, and
// COUNT+1 then collides with surviving higher-numbered ids (D1_ERROR UNIQUE, measured
// 2026-08-31 — the suites died in bursts on exactly this). MAX over the day's ids
// gap-proofs it. Shared by fileTransmission() (one id) and fileTransmissionsBatch()
// (a reserved block of N ids, schema audit finding 6) — same query either way, kept
// in one place so the two id-allocation paths can never compute it differently.
// The day's top id is read by its NUMBER, not its text (sprint 3 B2, migrate-049): "T-<day>-1000" sorts before
// "T-<day>-999" as text, so a text order answered 999 for ever once a day held a thousand ids, and every filing after it
// collided (UNIQUE, a 500) until midnight. For ids of one prefix the numeric order is the length, then the text. The range
// on the primary key bounds the read to the day without migrate-049 (the day's ids, sorted); with it, the equality on the
// day's prefix walks idx_transmission_day_seq in order and reads ONE index row.
export const NEXT_SEQ_SQL = "SELECT id FROM transmission WHERE id >= ?1 AND id < ?2 AND substr(id, 1, 11) = ?3 ORDER BY length(id) DESC, id DESC LIMIT 1";
export async function nextSeqStart(env, day) {
  const prefix = `T-${day}-`;   // 11 characters: the expression migrate-049 indexes
  const top = await db(env).prepare(NEXT_SEQ_SQL).bind(prefix, `T-${day}.`, prefix).first();
  const m = top && /-(\d+)$/.exec(top.id);
  return (m ? parseInt(m[1], 10) : 0) + 1;
}

// a contribution's shape columns (migrate-047) and when its work happened (migrate-051's happened_at): each named in the
// INSERT only when the filing sends it, so a filing without one writes exactly the statement it wrote before (and files on a
// database without that migration)
// next_due (migrate-053): the next action's date while it is open, written with the row (no row of its own); the follow-ups
// due read it on idx_transmission_followups, and a pick-up or a done clears it (src/pickup.js)
const SHAPE_COLS = (sc) => (sc.shape ? ", shape, next_by, next_who" : "") + (sc.nextBy ? ", next_due" : "") + (sc.happenedAt ? ", happened_at" : "");
const SHAPE_MARKS = (sc) => (sc.shape ? ",?,?,?" : "") + (sc.nextBy ? ",?" : "") + (sc.happenedAt ? ",?" : "");
const SHAPE_ARGS = (sc) => [...(sc.shape ? [sc.shape, sc.nextBy, sc.nextWho] : []), ...(sc.nextBy ? [sc.nextBy] : []), ...(sc.happenedAt ? [sc.happenedAt] : [])];

// dedupe (owner ruling 2026-08-31): ref lists are sets — no double counting anywhere.
const csvJoin = (v) => Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].join(",") : (v ?? null);

// B7d S5/S6 — the filing reply in start-here's words. replyTempo is tempoOf (src/tempo.js, the ONE mapping) on the
// fresh row: in · with <owner> · needs more (a fresh filing is never yet decided or on the canvas). AUTO_NOTE says
// what `binding` means in plain words; withSuggestionNote says the goal suggestion is optional. All additive: the
// reply keeps id/route/status/grade/binding exactly as before.
export function replyTempo(route, status, owner) {
  return tempoOf({ route, status }, null, { ownerName: owner || "the owner" });
}
export const AUTO_NOTE = (res) => (res && res.binding
  ? "Filed — it counts on the record (binding). Where it stands: " + res.tempo + "."
  : "Filed. Where it stands: " + ((res && res.tempo) || "in") + ".");
export function withSuggestionNote(sg) {
  if (!sg || typeof sg !== "object" || !sg.goalRef) return sg;
  return { ...sg, note: `Optional: resend with goalRef "${sg.goalRef}" if this moves that goal; ignore it otherwise — nothing changes either way.` };
}

// UI-B4a C5 — the parent check. A filing that names a `parent` (an update, or a counter disputing that filing,
// QC8B94276) must name a filing that EXISTS and shares the filer's project; otherwise the door answers 422
// unknown_parent and files nothing. Before this, an unknown id reached the INSERT and the transmission.parent foreign
// key threw (only UNIQUE errors are caught), so the caller got a 500. The same answer covers "no such filing" and
// "a filing in a project you hold no seat on", so the refusal never says that a row exists elsewhere. Projects match
// when they are equal (a null project matches a null project, an org with no project axis); the owner may name any.
export const parentIdOf = (body) => (body && body.parent != null && String(body.parent).trim() !== "" ? String(body.parent).trim().slice(0, 60) : null);
export function unknownParent(parent, extra) {
  return { error: "unknown_parent", parent, ...(extra || {}),
    note: `No filing "${parent}" in your project, so nothing was filed. Name an existing filing's id as parent (\`read {kind: "contribution"}\` or \`build\` lists the ones you may read), or counter a question with gapRefs ["q/<qid>"] instead.` };
}
export const parentMatches = (person, parentRow, project) => !!parentRow && (
  (person && person.role === "owner") || (parentRow.project ?? null) === (project ?? null));

// UI-B11a D4 — the reserved kinds (Q60CCC574: a human verb has NO tool). kind "publish" and kind "equip" are written only
// by src/broadcast.js, the seam behind a person's own press on Broadcast in a signed-in browser. Every other writer
// (POST /preview/file-contribution, file_contribution, the composer) is refused 422 reserved_kind and files
// nothing. The kind compares trimmed and lowercased, exactly those two; any other kind (and no kind) files as before. The
// seam's pass is `internal`, the FOURTH FUNCTION ARGUMENT, never a body field and never `via` (a caller sets both).
export const isReservedKind = (kind) => RESERVED_KINDS.includes(String(kind ?? "").trim().toLowerCase());
export function reservedKind(kind, extra) {
  const k = String(kind ?? "").trim().toLowerCase();
  // kind knowledge is filed only by the knowledge write door (src/knowledge/write.js), one row per save_knowledge or remove_knowledge call
  if (k === KNOWLEDGE_KIND) return { error: "reserved_kind", kind: k, ...(extra || {}),
    hint: "preview then save_knowledge files it", note: "Knowledge is filed through preview, then save_knowledge (items {kind, op: \"upsert\", data}) or remove_knowledge (items {kind, op: \"remove\", data}), each of which files its own ledger row; nothing was filed." };
  return { error: "reserved_kind", kind: k, ...(extra || {}),
    hint: "a person presses Publish or Equip on Broadcast", note: "Publishing and equipping are a person's own press on Broadcast in a signed-in browser; nothing was filed." };
}

// goalTree(env, project) — the project's goal tree (src/knowledge/goals.js), imported on first use: the knowledge modules
// import this one, so a static import would close the cycle
const goalTree = async (env, project) => (await import("./knowledge/goals.js")).goalTree(env, project);

// fileTransmission(person, body, env, internal?) — `internal` is { reserved: true, project, batch?, at? } from a seam that files a
// reserved kind (src/broadcast.js, src/knowledge/write.js) and nothing else: its project stamp is the seam's own (the item's
// project for a publish, the target project for an equip, the written project for knowledge, each validated there against
// the caller's seat), so doorProject and the parent check are skipped: an equip's parent is a publish row in the ITEM's
// project, which the target project's check would refuse (unknown_parent). `batch` (D1 statements) commits in the SAME
// D1 batch as the filing's row: either both land or neither does. `at` (sprint 7, 7.5b) is the seam's own moment (the knowledge door's: the
// updated_at of every row the write lands), kept in the row's grade as batchAt; the row's created_at is always when it lands
// (sprint 7's review, C3).
// ---- a clientRef names CONTENT on every door (G2 item 7, the independent review: a grade re-filed under its own clientRef with
// another verdict answered "filed" and wrote nothing; a changed contribution under a reused clientRef answered "unchanged") ----
// The first filing under a clientRef stores its content's digest in its grade (`refDigest`, 16 hex of sha256 over the body as
// sent, its transport fields left out: clientRef, via, eval, project, payload — or over a door's own stated content,
// REF_CONTENT, where the body carries a fresh id of its own). The same clientRef again with the SAME content is the replay it
// always was; with DIFFERENT content it is refused client_ref_taken, saying so, and nothing is filed. A row filed before the
// digest existed (no refDigest) is taken as the same content, as it was.
export const REF_CONTENT = Symbol.for("sharingu.refContent");
const REF_TRANSPORT = new Set(["clientRef", "via", "eval", "project", "payload"]);
const canonRef = (v) => (Array.isArray(v) ? `[${v.map(canonRef).join(",")}]` : v !== null && typeof v === "object"
  ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonRef(v[k])}`).join(",")}}` : JSON.stringify(v === undefined ? null : v));
export async function refDigestOf(body) {
  const c = body && body[REF_CONTENT] !== undefined ? body[REF_CONTENT]
    : Object.fromEntries(Object.entries(body || {}).filter(([k, v]) => !REF_TRANSPORT.has(k) && v !== undefined));
  return (await sha256(canonRef(c))).slice(0, 16);
}
export const CLIENT_REF_CLASH_NOTE = "This clientRef already filed different content: use a new clientRef (or leave it out) to file it as new. Nothing was filed.";
export const clientRefClash = (clientRef, dup) => ({ error: "client_ref_taken", clientRef, filed: dup.id, note: CLIENT_REF_CLASH_NOTE });
// the replay lookup: the row this person filed under the ref, with the digest it stored
export const CLIENT_REF_SQL = "SELECT id, route, status, json_extract(grade, '$.refDigest') AS rd FROM transmission WHERE submitter = ? AND client_ref = ?";
// replayOf(dup, clientRef, refDigest) -> the answer for a clientRef this person already filed: the original (the same content)
// or client_ref_taken (other content)
const replayOf = (dup, clientRef, refDigest) => (dup.rd && dup.rd !== refDigest ? clientRefClash(clientRef, dup)
  : { id: dup.id, route: dup.route, status: dup.status, duplicate: true, note: "Already filed under this clientRef — returning the original (idempotent door, M-ADR-006)." });
// migrate-069: (submitter, client_ref) is UNIQUE, so a filing that races past the lookup with the same ref is refused by the index
// (the error names the column); the door then answers what the lookup would have: the replay
const refRace = (e) => /UNIQUE/.test(String(e)) && /client_ref/.test(String(e));

export async function fileTransmission(person, body, env, internal = null) {
  const inside = !!(internal && internal.reserved === true);
  if (!inside && isReservedKind(body && body.kind)) return reservedKind(body.kind);
  const lane = String(body.lane || "").toLowerCase();
  if (!TX_LANES.includes(lane)) return { error: "bad_lane", allowed: TX_LANES };
  // the contribution's shape (src/shapes.js, sprint 3 B1): its new fields (source, depends, open, next, the GTM four), each
  // optional, checked here before anything is read or written; a refusal names the field, a hint and an example
  const shapeRefused = checkShape({ ...body, lane });
  if (shapeRefused) return shapeRefused;
  const sc = shapeColumns(body);
  // clientRef idempotency (M-ADR-006 / migrate-021): a retrying agent re-sending the
  // same clientRef gets the ORIGINAL filing back — never a double-file. Scoped per
  // submitter; `via` records the submitting surface ("cli/0.x", "mcp", …) so
  // human-authored vs agent-refined stays queryable. Neither is ever graded.
  const clientRef = body.clientRef ? String(body.clientRef).slice(0, 60) : null;
  const via = body.via ? String(body.via).slice(0, 60) : null;
  // sprint 13, 13.1: which AI filed it — the request's ONE family word (src/client.js: set by the door that signed the request in,
  // from what the client declares; null outside a request), never a body field and never the raw name
  const client = requestClient();
  const refDigest = clientRef ? (internal && internal.refDigest) || await refDigestOf(body) : null;
  if (clientRef) {
    let dup = null;
    try { dup = await db(env).prepare(CLIENT_REF_SQL).bind(person.id, clientRef).first(); } catch { dup = null; /* pre-migration DB — files normally */ }
    if (dup) return replayOf(dup, clientRef, refDigest);   // G2 item 7: different content is client_ref_taken
  }
  // The project stamp (ADR-100): server-side, from the submitter's seat — the client
  // is never trusted; a multi-seat submitter without a valid claim is a loud 422.
  let project;
  if (inside) project = internal.project == null ? null : String(internal.project);
  else {
    const seats = await projectSeatsFor(person.id, env);
    const projRes = await doorProject(person, body, seats, env);
    if (projRes.error) return projRes;
    project = projRes.project;
  }
  // G2: the eval mark only where it hides nothing real (evalMarkRefused), checked before anything is written
  if ((body.eval || (body.payload && body.payload.eval)) && !body[EVAL_INHERITED]) { const er = await evalMarkRefused(person, project, env); if (er) return er; }
  const parentId = parentIdOf(body);
  if (parentId && !inside) {
    const pr = await db(env).prepare("SELECT id, project FROM transmission WHERE id = ? AND org = {org}").bind(parentId).first();
    if (!parentMatches(person, pr, project)) return unknownParent(parentId);
  }
  // The goal ref (M-ADR-020 G1, the Goals Engine): validated against the stamped project's
  // goal tree (D1, knowledge/goals.js goalTree) — an unknown ref still records with a loud
  // note (R3, never blocks), an absent ref records as unaligned (no note). A reserved seam's
  // filing with no ref reads no tree (no suggestion is shown for it). expected/actual (G2, the
  // gtm dimension's declared-vs-real outcome) are free text on ANY lane, capped, never graded.
  const tenant = await getTenantConfig(env);
  const namesGoal = body.goalRef != null && String(body.goalRef).trim() !== "";
  const dependsGoal = Array.isArray(body.depends) && body.depends.some((d) => /^goal\//.test(String(d)));
  const goalNodes = namesGoal || dependsGoal || !inside ? await goalTree(env, project) : [];
  const goalCheck = verifyGoalRef(body.goalRef, goalNodes);
  // the one-pass fix 2 and 5: the screens, components and depends it names, checked against the project's OWN Map (src/maprefs.js:
  // one statement for every ref, one more only when one misses). The served register and arch-grade (the old path, sprint 4
  // deletes it) are read only as the fallback: the register when the Map holds no screen, the arch-grade beside the Map.
  const mapRefs = await mapRefsFor(env, project, [body], { goalIds: goalNodes.map((g) => g.id) });
  const expected = body.expected != null ? String(body.expected).trim().slice(0, 500) || null : null;
  const actual = body.actual != null ? String(body.actual).trim().slice(0, 500) || null : null;
  // outcome (M-ADR-021 fine-tune): realized units for weight-by-outcome — a plain
  // number (or numeric string), clamped non-negative; absent/non-numeric stays null
  // and the row behaves exactly as before (byte-safety invariant).
  const outcome = (body.outcome===0||body.outcome) && Number.isFinite(Number(body.outcome)) ? Math.max(0, Number(body.outcome)) : null;
  // THE MIND NAMESPACE (owner ruling 2026-08-31): R's own code declares mind/* —
  // valid at the gate, disjoint from the product target, NEVER counted in ARCH.
  const { grade, route, status } = gateGrade({ ...body, lane }, mapRefs.screens, mapRefs.components, mapRefs.depends);
  // trace consent (ADR-102): a trace pointer below the submitter's standing grade is
  // STRIPPED — the filing itself proceeds untouched, and the note back says so plainly.
  let traceId = body.trace ? String(body.trace).slice(0, 60) : null;
  let traceNote = null;
  if (traceId) {
    const consent = await effectiveConsent(person, env); // M-ADR-019: personal OR mandate floor
    if (consent !== "traces" && consent !== "traces+prompts") {
      traceId = null;
      traceNote = "Trace dropped — your standing consent is 'off'. Set it on /profile to share session traces (ADR-102).";
    }
  }
  // sprint 8, 8.2: the org's plan, checked after every other check and before anything is written (src/plans.js checkPlan: one
  // read of the month's tally). At its items limit the filing is refused plan_limit, nothing written; past 80% it lands and the
  // door's answer says so (src/plans.js PLAN_NOTE). The row is counted by ONE upsert in the row's own batch (itemsTally, below). A replay (above) is no filing.
  // A seam that checked it itself before it stored anything (internal.itemsChecked: the knowledge door, before its bodies' put —
  // sprint 8's review B1) is not read twice.
  const quota = inside && internal.itemsChecked === true ? { verdict: "ok" } : await checkPlan(env, "items_month", { add: 1 });
  if (quota.refusal) return quota.refusal;
  const day = now().slice(0, 10).replace(/-/g, "");
  const csv = csvJoin;
  let id = `T-${day}-${String(await nextSeqStart(env, day)).padStart(3, "0")}`;
  const isEval = !!(body.eval || (body.payload && body.payload.eval));
  // gapRefs (ADR-074): the canvas join — canonical refs this contribution addresses.
  // report: the rt-v1.1 artifact id; NULL marks it for the backfill cron.
  // One-shot retry on an id race: two burst filings can read the same MAX — the loser
  // recomputes once instead of throwing 1101 at the caller.
  const withBatch = inside && Array.isArray(internal.batch) && internal.batch.length ? internal.batch : null;
  // sprint 7, 7.5b: a seam's write names its own moment (internal.at: the knowledge door's, stamped on every row it writes) — the
  // batch's identity with its submitter (tools/ship/prune-plan.mjs). Sprint 7's review (C3): the moment rides the row's grade JSON
  // as batchAt, and the row itself is stamped when it lands (created_at = now()): a reader that polls by time (updates' since,
  // changes since) never misses a row that committed after a slow write's moment
  const batchAt = inside && typeof internal.at === "string" && internal.at ? internal.at : null;
  const createdAt = now();
  const insertTx = async () => { const txRow = db(env).prepare(
    "INSERT INTO transmission (id, submitter, lane, kind, what, why, touches, screens, components, gaprefs, report, digest, proof, parent, grade, route, status, eval, trace, about, project, via, client_ref, goal_ref, expected, actual, outcome, created_at, client" + SHAPE_COLS(sc) + ", org) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?" + SHAPE_MARKS(sc) + ",{org})"
  ).bind(
    id, person.id, lane, body.kind ?? null, body.what ?? null, body.why ?? null,
    csv(body.touches), csv(body.screens), csv(body.components), csv(body.gapRefs ?? body.gaprefs),
    body.report ? String(body.report).slice(0, 60) : null,
    body.digest ? String(body.digest).slice(0, 8000) : null,
    body.proof ? String(body.proof).slice(0, 4000) : null,
    parentId, JSON.stringify(refDigest || batchAt ? { ...(refDigest ? { refDigest } : {}), ...(batchAt ? { batchAt } : {}), ...grade } : grade).slice(0, 4000), route, status, isEval ? 1 : 0,
    // trace (ADR-084 §2): an opt-in banked-artifact id, sanitized exactly like `report` —
    // R never grades it, the gate never reads it (gateGrade above never sees this field).
    // Consent-gated above (ADR-102): traceId is null when the submitter's grade is 'off'.
    traceId,
    // about (ADR-085 §2): the insight kind's claim summary, free text, capped short —
    // persisted for any kind (harmless if absent), read for insight.
    body.about ? String(body.about).slice(0, 120) : null,
    project,
    via, clientRef,
    // goal_ref/expected/actual (M-ADR-020 G1/G2): stored VERBATIM regardless of
    // known/unknown — same discipline as `screens` above; only the note differs.
    // outcome (M-ADR-021 fine-tune): realized units, null when absent (byte-safe).
    goalCheck.ref, expected, actual, outcome,
    createdAt, client, ...SHAPE_ARGS(sc)
  );
  // with a seam's batch the events mirror (below) rides the SAME batch: all of it lands or none of it does, so a
  // publish, a restore or a knowledge write never answers "nothing was written" after its rows landed. The month's tally
  // (sprint 8, 8.2) rides the row's batch either way: the row and its count land together or not at all
  return withBatch ? await db(env).batch([...withBatch, txRow, eventsRow(), itemsTally(env, 1)]) : await db(env).batch([txRow, itemsTally(env, 1)]); };
  // Mirror into events (kind "pr") so /audit and /log are ONE merged per-user, per-lane
  // trail — before this, transmissions lived only in their own table and the audit page's
  // "and PRs" claim was false (alignment sweep 2026-08-30). Server-side only: "pr" is
  // deliberately not in the validated event-kind set, so it can't be posted directly via /event.
  const eventsRow = () => db(env).prepare(
    "INSERT INTO events (id,session_id,person_id,kind,lane,payload_json,touches,basis,stamped,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,1,?,?,{org})"
  ).bind(uid(), null, person.id, "pr", lane,
    JSON.stringify({ what: body.what ?? null, transmissionId: id, route,
      // ADR-075/the-owner's-S-040-ruling: R's own mind-namespace work never rides the
      // ORG activity trail — the two axes stay disjoint on every human surface.
      ...((Array.isArray(body.components) ? body.components : String(body.components || "").split(",")).filter(Boolean).length &&
          (Array.isArray(body.components) ? body.components : String(body.components || "").split(",")).filter(Boolean).every((c) => String(c).trim().startsWith("mind/"))
        ? { mind: true } : {}),
      ...(isEval ? { eval: true } : {}) }).slice(0, 2000),
    csv(body.touches), body.why ?? null, project, now());
  try { await insertTx(); } catch (e) {
    if (!/UNIQUE/.test(String(e))) throw e;
    if (clientRef && refRace(e)) {   // the same ref landed between the lookup and this insert: its replay
      const dup = await db(env).prepare(CLIENT_REF_SQL).bind(person.id, clientRef).first();
      if (dup) return replayOf(dup, clientRef, refDigest);
      throw e;
    }
    id = `T-${day}-${String(await nextSeqStart(env, day)).padStart(3, "0")}`;
    await insertTx();
  }
  // a plain filing has landed by now: its mirror is best-effort, so a failed mirror never reports a landed filing as failed
  if (!withBatch) { try { await eventsRow().run(); } catch { /* the filing stands; /audit misses one mirror row */ } }
  // Schema audit finding 3 (migrate-018): index this row into transmission_refs so
  // impact {refs}'s history (src/impact.js, IMPACT_HISTORY_SQL) finds it without a leading-wildcard LIKE
  // scan. Additive, best-effort — never blocks or fails the filing itself if it
  // throws (e.g. migrate-018 not yet applied against this DB).
  const refs = refTokensFor(body);
  if (refs.length) {
    try {
      await refsInsert(env, id, refs).run();
    } catch { /* pre-migration DB — the row stands, unindexed */ }
  }
  const res = { id, route, status, grade, binding: grade.binding !== false };
  if (route === "incomplete") {   // W7: what is missing, and an example that completes it
    res.note = incompleteNote(lane, grade.missing, body.kind, grade);
    res.example = completingExample(lane, grade.missing, body.kind);
  }
  let replyOwner = null;
  if (route === "owner") {
    const ownerLabel = ownerName(await resolveOwner(env));
    replyOwner = ownerLabel;
    res.note = `Routed to ${ownerLabel}'s owner-check queue — ` +
      (grade.ownerReasons || []).join(", ") + `. Nothing outward-facing changes until ${ownerLabel} rules.`;
  }
  // B7d S5: the reply wears start-here's word too (tempoOf, the one mapping) — route/status/binding stay for L + evals
  res.tempo = replyTempo(route, status, replyOwner);
  if (route === "auto") res.note = AUTO_NOTE(res);
  if (traceNote) res.note = (res.note ? res.note + " " : "") + traceNote;
  // M-ADR-020 G1: an unknown goalRef still records (R3, never blocks) but LOUDLY —
  // an absent ref is silent (recorded as unaligned, no note needed).
  if (goalCheck.status === "unknown") res.note = (res.note ? res.note + " " : "") +
    `goalRef "${goalCheck.ref}" is not in the current goal tree — recorded, but it won't move any node's needle until the ref is corrected or the tree is updated.`;
  // MCP-proposes (M-ADR-021 fine-tune): no goalRef was given at all — offer a
  // deterministic best-guess node from the project's tree. Purely additive, never
  // blocks and never changes route (R3) — only present when there's a tree to
  // score against and proposeGoalRef actually finds a positive-scoring match.
  if (goalCheck.status === "absent" && goalNodes.length) {
    const suggestion = proposeGoalRef(goalNodes, { what: body.what, touches: body.touches, lane });
    if (suggestion) res.suggestion = withSuggestionNote(suggestion);
  }
  return res;
}

// fileTransmissionsBatch(person, items, env) — schema audit finding 6 (the /respond
// N+1), eff/door. Files N transmissions in ~3 D1 round trips (2 on the common,
// no-collision path) instead of fileTransmission()'s ~3N sequential ones, WITHOUT
// weakening nextSeqStart()'s day-scoped MAX+1 gap-proofing or its UNIQUE-collision
// retry contract — same contract, applied to a reserved BLOCK of ids instead of one.
//
// Why this is still correct under concurrency: grading (gateGrade) is pure — no DB
// call, no shared state — so every item
// can be graded in the same tick, no race there. The ONLY shared mutable state is
// the day-scoped sequence itself, and that is reserved with exactly ONE
// `nextSeqStart` (the same query fileTransmission() runs), then N ids are assigned
// in memory as one contiguous block. Every insert pair (transmission + its mirrored
// events('pr') row) for the whole block goes into ONE db(env).batch() call — D1
// batches are wrapped in an implicit transaction (this is D1's documented batch
// semantic; flagging it explicitly since this file has no live D1 to re-verify
// against, unlike the schema-audit sweep's EXPLAIN QUERY PLAN checks — worth a
// second look before merge given this is DOOR-class code): if ANY statement in the
// batch fails, NONE of it commits.
//
// The race this must still cover: a concurrent OTHER writer (fileTransmission(),
// used by every other route — POST /preview/file-contribution, /verb, file_contribution) can
// file into the same day between our SELECT and our batch, and grab one of the ids
// we reserved. The batch then throws a UNIQUE error and — because batch() is
// atomic — NOTHING in it commits, including items that never collided. That is
// deliberately easier to reason about than a per-row race: on that failure we
// re-derive a FRESH block (a fresh nextSeqStart — it now sees whatever the other
// writer just committed) and retry the WHOLE batch exactly once — the same
// "one-shot retry" contract fileTransmission() documents, just at batch
// granularity, so two of our OWN rows can never race each other's retries (there
// is only ever one retry, run sequentially, for the whole call — never two
// concurrent re-derivations of the block colliding with each other). A second
// collision after that retry propagates the error, same as fileTransmission().
//
// A consequence worth naming (correctness over speed, per the audit's own bar): if
// the one-shot retry ALSO fails, this whole call's items lose their transmission
// linkage together — not the partial per-item failure fileTransmission()'s callers
// see today. Given a second collision inside a one-shot retry window is already the
// rare case the original design accepts, and the alternative (per-row retries that
// can race each other) is a strictly worse correctness story, this trade is
// intentional: either the whole reserved block lands with sequential ids, or none
// of it does — never an interleaved partial state.
// planTransmissionsBatch(person, items, env) — the batch door's every check, NOTHING written (sprint 3 B2: the preview runs
// exactly this, and fileTransmissionsBatch below runs it before it writes). -> { all: [refusal per item] } when the WHOLE
// batch is refused (a reserved kind, an unknown parent), else { prepared: [per item: { skip: true, result } | { skip: false,
// lane, body, grade, route, status, isEval, project, goalCheck, expected, actual, outcome }], traceAllowed }. The project
// stamp (doorProject) is resolved once per distinct claim in the call: the same claim answers the same, so a batch of 200
// filings into one project reads it once, not 200 times.
export async function planTransmissionsBatch(person, items, env, o = {}) {
  // UI-B11a D4: a reserved kind anywhere refuses the WHOLE batch, nothing filed (the batch is atomic, M-ADR-006), each
  // result naming the first offending item — the unknown_parent idiom below
  const resAt = items.findIndex((b) => b && isReservedKind(b.kind));
  if (resAt >= 0) return { all: items.map(() => reservedKind(items[resAt].kind, { item: resAt })) };
  // The goal tree (M-ADR-020 G1, D1): ONE read per stamped project whose items name a
  // goalRef (or a goal/ depends), shared by every such item in the call.
  const treesByProject = new Map();
  const treeOf = (p) => { if (!treesByProject.has(p)) treesByProject.set(p, goalTree(env, p)); return treesByProject.get(p); };

  // One seats read covers every item (same submitter throughout — /respond's batch);
  // the project stamp itself still resolves per item so an explicit body.project claim
  // is validated exactly as fileTransmission() would (ADR-100, same door, same rules).
  const seats = await seatsOnce(env, person.id);   // the request's one seats read (D9)
  // trace consent (ADR-102): one fetch covers the call (same submitter throughout),
  // read only when some item actually carries a trace. Same strip+note contract as
  // fileTransmission() — the two door paths may never diverge on a guarantee.
  const anyTrace = items.some((b) => b && b.trace);
  const callerConsent = anyTrace ? await effectiveConsent(person, env) : "off"; // M-ADR-019
  const traceAllowed = callerConsent === "traces" || callerConsent === "traces+prompts";
  // clientRef idempotency (M-ADR-006), batch form: ONE pre-query resolves every
  // already-filed ref — those items return their originals and never re-insert.
  // (sprint 8, 8.3b: o.refsChecked — refs the caller read and found unfiled a moment ago — are not read again)
  const refsWanted = [...new Set(items.map((b) => b && b.clientRef ? String(b.clientRef).slice(0, 60) : null).filter(Boolean))].filter((r) => !(o.refsChecked && o.refsChecked.has(r)));
  const dupMap = new Map();
  if (refsWanted.length) {
    // the refs go as ONE json parameter (json_each), never one bound parameter each: D1 binds at most 100 per statement,
    // and a batch of 100 or more clientRefs would otherwise fail this lookup and, the error swallowed, file every item again
    for (const r of (await db(env).prepare(
      "SELECT id, route, status, client_ref, json_extract(grade, '$.refDigest') AS rd FROM transmission WHERE submitter = ?1 AND client_ref IN (SELECT value FROM json_each(?2))"
    ).bind(person.id, JSON.stringify(refsWanted)).all()).results) dupMap.set(r.client_ref, r);
  }
  const prepared = [];
  // the stamp per distinct claim (a string, or none): doorProject answers the same for the same claim within one call
  const stamps = new Map();
  const stampOf = (body) => {
    const claim = body ? body.project : undefined;
    if (claim !== undefined && claim !== null && typeof claim !== "string") return doorProject(person, body, seats, env);
    const k = claim == null ? "" : "=" + claim;
    if (!stamps.has(k)) stamps.set(k, doorProject(person, body, seats, env));
    return stamps.get(k);
  };
  // first pass: every check that needs no Map (the lane, the shape, the clientRef replay, the project stamp)
  const pre = [];
  // the sprint-6 review, finding 8: two items of ONE call under the same clientRef file ONCE (migrate-069's unique index
  // would refuse the whole batch): the first that files is the original, a later one with the same content its replay
  // (sameAs: the original's item index; its id is filled in once the batch lands), other content client_ref_taken
  const firstOfRef = new Map();
  for (const body of items) {
    const lane = String(body.lane || "").toLowerCase();
    if (!TX_LANES.includes(lane)) { pre.push({ skip: true, result: { error: "bad_lane", allowed: TX_LANES } }); continue; }
    // the shape's new fields (src/shapes.js), as the single door checks them: this item is refused, the others file
    const shapeRefused = checkShape({ ...body, lane });
    if (shapeRefused) { pre.push({ skip: true, result: shapeRefused }); continue; }
    const cr = body.clientRef ? String(body.clientRef).slice(0, 60) : null;
    const refDigest = cr ? await refDigestOf(body) : null;
    if (cr && dupMap.has(cr)) {
      const d = dupMap.get(cr);
      if (d.rd && d.rd !== refDigest) { pre.push({ skip: true, result: clientRefClash(cr, d) }); continue; }   // G2 item 7
      pre.push({ skip: true, result: { id: d.id, route: d.route, status: d.status, duplicate: true,
        note: "Already filed under this clientRef — returning the original (idempotent door, M-ADR-006)." } });
      continue;
    }
    if (cr && firstOfRef.has(cr)) {
      const k = firstOfRef.get(cr);
      pre.push({ skip: true, sameAs: k, result: pre[k].refDigest !== refDigest
        ? { error: "client_ref_taken", clientRef: cr, sameAs: k, note: CLIENT_REF_CLASH_NOTE }
        : { duplicate: true, sameAs: k, note: `The same clientRef as item ${k} of this call — filed once, returning that filing (idempotent door, M-ADR-006).` } });
      continue;
    }
    const projRes = await stampOf(body);
    if (projRes.error) { pre.push({ skip: true, result: projRes }); continue; }
    // G2: the eval mark only where it hides nothing real (one read per project, memoized for the request)
    if (body.eval || (body.payload && body.payload.eval)) { const er = await evalMarkRefused(person, projRes.project, env); if (er) { pre.push({ skip: true, result: er }); continue; } }
    if (cr) firstOfRef.set(cr, pre.length);
    pre.push({ skip: false, body, lane, project: projRes.project, refDigest });
  }
  // the one-pass fix 2 and 5: the Map refs of every item, resolved per stamped project in one statement (src/maprefs.js; a
  // second only when some ref misses), never one read per ref. o.near (the preview, after its read-scope check) adds the
  // near matches of a ref that is not in the Map.
  const resolvers = new Map();
  for (const p of [...new Set(pre.filter((x) => !x.skip).map((x) => x.project))]) {
    const bodies = pre.filter((x) => !x.skip && x.project === p).map((x) => x.body);
    const wantsTree = bodies.some((b) => (b.goalRef != null && String(b.goalRef).trim() !== "") || (Array.isArray(b.depends) && b.depends.some((d) => /^goal\//.test(String(d)))));
    const tree = wantsTree ? await treeOf(p) : [];
    resolvers.set(p, await mapRefsFor(env, p, bodies, { near: !!o.near, goalIds: tree.map((g) => g.id) }));
  }
  for (const x of pre) {
    if (x.skip) { prepared.push(x); continue; }
    const { body, lane } = x, projRes = { project: x.project };
    const mr = resolvers.get(x.project);
    const { grade, route, status } = gateGrade({ ...body, lane }, mr.screens, mr.components, mr.depends);
    const isEval = !!(body.eval || (body.payload && body.payload.eval));
    const namesGoal = body.goalRef != null && String(body.goalRef).trim() !== "";
    const goalCheck = verifyGoalRef(body.goalRef, namesGoal ? await treeOf(projRes.project) : []);
    const expected = body.expected != null ? String(body.expected).trim().slice(0, 500) || null : null;
    const actual = body.actual != null ? String(body.actual).trim().slice(0, 500) || null : null;
    // outcome (M-ADR-021 fine-tune): same parse as fileTransmission() above.
    const outcome = (body.outcome===0||body.outcome) && Number.isFinite(Number(body.outcome)) ? Math.max(0, Number(body.outcome)) : null;
    prepared.push({ skip: false, lane, body, grade, route, status, isEval, project: projRes.project, goalCheck, expected, actual, outcome, mapRefs: mr, refDigest: x.refDigest });
  }
  const wanted = prepared.filter((p) => !p.skip);
  // UI-B4a C5 — the parent check, batch form: ONE read covers every parent the call names (chunked under D1's bound
  // parameter cap). One unknown parent refuses the WHOLE batch with nothing filed (the batch is atomic, M-ADR-006):
  // every result carries unknown_parent, naming the first offending item.
  const namedParents = [...new Set(wanted.map((p) => parentIdOf(p.body)).filter(Boolean))];
  if (namedParents.length) {
    const found = new Map();
    for (let i = 0; i < namedParents.length; i += 90) {
      const chunk = namedParents.slice(i, i + 90);
      for (const r of (await db(env).prepare(`SELECT id, project FROM transmission WHERE id IN (${chunk.map(() => "?").join(",")}) AND org = {org}`).bind(...chunk).all()).results || []) found.set(r.id, r);
    }
    const badAt = prepared.findIndex((p) => !p.skip && parentIdOf(p.body) && !parentMatches(person, found.get(parentIdOf(p.body)), p.project));
    if (badAt >= 0) {
      const bad = parentIdOf(prepared[badAt].body);
      return { all: items.map(() => unknownParent(bad, { item: badAt })) };
    }
  }
  return { prepared, traceAllowed };
}

// the batch door's three statements (buildBatch below): every row of a block, one statement per table and chunk. ?1 is the
// submitter (the same for every row of a call), ?2 the rows as JSON arrays in the column order named here
const TX_COLS = ["id", "submitter", "lane", "kind", "what", "why", "touches", "screens", "components", "gaprefs", "report", "digest", "proof", "parent", "grade",
  "route", "status", "eval", "trace", "about", "project", "via", "client_ref", "goal_ref", "expected", "actual", "outcome", "created_at", "shape", "next_by",
  "next_who", "next_due", "happened_at", "client"];
export const TX_BATCH_SQL = `INSERT INTO transmission (${TX_COLS.join(", ")}, org) SELECT ` +
  TX_COLS.map((c, i) => (c === "submitter" ? "?1" : `json_extract(j.value, '$[${i}]')`)).join(", ") + ", {org} FROM json_each(?2) j";
export const EVENTS_BATCH_SQL = "INSERT INTO events (id,session_id,person_id,kind,lane,payload_json,touches,basis,stamped,project,created_at,org) " +
  "SELECT json_extract(j.value, '$[0]'), NULL, ?1, 'pr', json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'), json_extract(j.value, '$[3]'), " +
  "json_extract(j.value, '$[4]'), 1, json_extract(j.value, '$[5]'), json_extract(j.value, '$[6]'), {org} FROM json_each(?2) j";
// a bound list stays far under D1's 2 MB value cap (a filing's digest alone may be 8,000 characters)
export const TX_CHUNK_BYTES = 400000;
function chunkRows(rows) {
  const out = [];
  let cur = [], bytes = 0;
  for (const r of rows) {
    const b = JSON.stringify(r).length + 1;
    if (cur.length && bytes + b > TX_CHUNK_BYTES) { out.push(cur); cur = []; bytes = 0; }
    cur.push(r); bytes += b;
  }
  if (cur.length) out.push(cur);
  return out;
}

export async function fileTransmissionsBatch(person, items, env, raced = false, o = {}) {
  // o.refsChecked: the clientRefs the caller has just read and found unfiled (src/preview.js filePart), so the plan's replay
  // lookup skips them; a ref that lands in between is refused by migrate-069's unique index, and the retry below reads it
  const plan = await planTransmissionsBatch(person, items, env, raced ? {} : { refsChecked: o.refsChecked });
  if (plan.all) return plan.all;
  const { prepared, traceAllowed } = plan;
  const wanted = prepared.filter((p) => !p.skip);
  // sprint 8, 8.2: the org's plan, once for the call's new rows (src/plans.js checkPlan: one read of the month's tally). Rows that
  // would take the month past its items limit refuse the WHOLE batch, nothing written (the batch is atomic, M-ADR-006): each item
  // answers plan_limit, a replay of an earlier filing keeps its own answer. Past 80% the rows land and the door's answer says so.
  const quota = wanted.length ? await checkPlan(env, "items_month", { add: wanted.length }) : { verdict: "ok" };
  if (quota.refusal) return prepared.map((p) => (p.skip && p.sameAs == null ? p.result : quota.refusal));
  const day = now().slice(0, 10).replace(/-/g, "");
  const csv = csvJoin;
  let ownerLabelCache = null; // resolveOwner(env) is the same query for every owner-routed item in one call
  const ownerLabel = async () => ownerLabelCache || (ownerLabelCache = ownerName(await resolveOwner(env)));
  const client = requestClient();   // sprint 13, 13.1: the request's one client word, the same for every row of the call

  // sprint 8, 8.3b (PLATFORM §3: a file of 50 contributions was 160 statements, over a free account's 50 queries a call): the
  // block's rows go in ONE statement per table — the filings, their events mirrors and their refs, each an INSERT … SELECT over a
  // json_each list (the idiom of src/knowledge/write.js optionStatements), cut into chunks under TX_CHUNK_BYTES — never one
  // statement per row. The rows are the same rows in the same order (each table's rowids as before): every column a filing
  // does not send is NULL, as the per-row statement left it (the shape columns' default), and every trigger fires per row.
  const buildBatch = (startSeq) => {
    let n = startSeq;
    const ids = [], txRows = [], evRows = [], refRows = [];
    for (const p of wanted) {
      const id = `T-${day}-${String(n++).padStart(3, "0")}`;
      ids.push(id);
      const { body, lane, grade, route, status, isEval, project, goalCheck, expected, actual, outcome, refDigest } = p;
      const sc = shapeColumns(body);
      txRows.push([
        id, person.id, lane, body.kind ?? null, body.what ?? null, body.why ?? null,
        csv(body.touches), csv(body.screens), csv(body.components), csv(body.gapRefs ?? body.gaprefs),
        body.report ? String(body.report).slice(0, 60) : null,
        body.digest ? String(body.digest).slice(0, 8000) : null,
        body.proof ? String(body.proof).slice(0, 4000) : null,
        parentIdOf(body), JSON.stringify(refDigest ? { refDigest, ...grade } : grade).slice(0, 4000), route, status, isEval ? 1 : 0,
        traceAllowed && body.trace ? String(body.trace).slice(0, 60) : null, // ADR-102 strip, same as fileTransmission()
        body.about ? String(body.about).slice(0, 120) : null,
        project,
        body.via ? String(body.via).slice(0, 60) : null,
        body.clientRef ? String(body.clientRef).slice(0, 60) : null,
        // goal_ref/expected/actual (M-ADR-020 G1/G2) — same verbatim-storage discipline
        // as the singular fileTransmission() above.
        // outcome (M-ADR-021 fine-tune) — same parse, null when absent (byte-safe).
        goalCheck.ref, expected, actual, outcome,
        now(),
        // the shape columns exactly as SHAPE_COLS names them: shape, next_by, next_who with a shape; next_due with a date;
        // happened_at with a moment; NULL otherwise
        sc.shape ? sc.shape : null, sc.shape ? sc.nextBy : null, sc.shape ? sc.nextWho : null, sc.nextBy ? sc.nextBy : null, sc.happenedAt ? sc.happenedAt : null,
        client,
      ]);
      const compsArr = (Array.isArray(body.components) ? body.components : String(body.components || "").split(",")).filter(Boolean);
      evRows.push([uid(), lane,
        JSON.stringify({ what: body.what ?? null, transmissionId: id, route,
          ...(compsArr.length && compsArr.every((c) => String(c).trim().startsWith("mind/")) ? { mind: true } : {}),
          ...(isEval ? { eval: true } : {}) }).slice(0, 2000),
        csv(body.touches), body.why ?? null, project, now()]);
      // Schema audit finding 3: index this row's refs in the SAME batch, so it
      // either lands with its transmission row or not at all (no half-indexed row
      // if the batch retries) — see fileTransmission()'s twin write for the
      // matching, non-batched insert used by every other filing path.
      for (const ref of refTokensFor(body)) refRows.push([id, ref]);
    }
    const stmts = [
      ...chunkRows(txRows).map((c) => db(env).prepare(TX_BATCH_SQL).bind(person.id, JSON.stringify(c))),
      ...chunkRows(evRows).map((c) => db(env).prepare(EVENTS_BATCH_SQL).bind(person.id, JSON.stringify(c))),
      ...chunkRows(refRows).map((c) => db(env).prepare(REFS_BATCH_SQL).bind(JSON.stringify(c))),
    ];
    // sprint 8, 8.2: the month's tally, ONE upsert for every row of the block, in the block's own batch
    if (ids.length) stmts.push(itemsTally(env, ids.length));
    return { ids, stmts };
  };

  let ids = [], stmts = [];
  if (wanted.length) {
    let startSeq = await nextSeqStart(env, day);
    ({ ids, stmts } = buildBatch(startSeq));
    try {
      await db(env).batch(stmts);
    } catch (e) {
      if (!/UNIQUE/.test(String(e))) throw e;
      // migrate-069: a ref of this batch landed between the pre-query and the batch (a racing retry): nothing of this batch
      // landed (one batch, atomic), so plan it again once: the pre-query now answers that ref's replay
      if (!raced && refRace(e)) return fileTransmissionsBatch(person, items, env, true);
      startSeq = await nextSeqStart(env, day);
      ({ ids, stmts } = buildBatch(startSeq)); // one-shot — a second collision propagates, same as fileTransmission()
      await db(env).batch(stmts);
    }
  }

  let wi = 0;
  const out = [];
  const idAt = [];   // the id each filed item landed under, by item index (an in-call replay answers its original's)
  prepared.forEach((p, k) => { if (!p.skip) idAt[k] = ids[wi++]; });
  wi = 0;
  for (const p of prepared) {
    if (p.skip) {
      if (p.sameAs == null) { out.push(p.result); continue; }
      // the same answer as a replay across calls (replayOf): the original's id, route and status, or client_ref_taken naming it
      const first = prepared[p.sameAs], { sameAs, ...r } = p.result;
      out.push(r.error ? { error: r.error, clientRef: r.clientRef, filed: idAt[sameAs], note: r.note }
        : { id: idAt[sameAs], route: first.route, status: first.status, duplicate: true, note: r.note });
      continue;
    }
    const id = ids[wi++];
    const res = { id, route: p.route, status: p.status, grade: p.grade, binding: p.grade.binding !== false };
    if (p.route === "incomplete") {   // W7: the same note + example as fileTransmission
      res.note = incompleteNote(p.lane, p.grade.missing, p.body && p.body.kind, p.grade);
      res.example = completingExample(p.lane, p.grade.missing, p.body && p.body.kind);
    }
    let replyOwner = null;
    if (p.route === "owner") {
      const ol = await ownerLabel();
      replyOwner = ol;
      res.note = `Routed to ${ol}'s owner-check queue — ` +
        (p.grade.ownerReasons || []).join(", ") + `. Nothing outward-facing changes until ${ol} rules.`;
    }
    res.tempo = replyTempo(p.route, p.status, replyOwner);   // B7d S5 — the same word fileTransmission answers
    if (p.route === "auto") res.note = AUTO_NOTE(res);
    if (p.body && p.body.trace && !traceAllowed) res.note = (res.note ? res.note + " " : "") +
      "Trace dropped — your standing consent is 'off'. Set it on /profile to share session traces (ADR-102).";
    if (p.goalCheck && p.goalCheck.status === "unknown") res.note = (res.note ? res.note + " " : "") +
      `goalRef "${p.goalCheck.ref}" is not in the current goal tree — recorded, but it won't move any node's needle until the ref is corrected or the tree is updated.`;
    out.push(res);
  }
  return out;
}

// ---- THE EVAL MARK'S RULE (G2, the independent review: any member could mark a write as a test on a real project — real
// changes that hide from Build and What changed, and that clean-eval deletes) ----
// The eval mark makes a row a test run's own: hidden from every real screen, removed by Control's clean-eval. It is accepted
// only where it can hide nothing real: on an EVAL project (projects.eval = 1, migrate-062: create_project {eval: true}, the
// admin's) or from an eval seat (the suites' and the walk's people: util.js isEvalSeat). A real seat's marked write on a real
// project is refused, with this reason, before anything is written. A write that lands on no project (the org level) keeps its
// mark: there is no project for it to hide in. NARROWS only: an unmarked write is never touched.
// EVAL_INHERITED: a door that marks its filing because the row it acts on is a test row (a rank of a test row, src/build.js
// fileRank) sets this on the body; the mark is then the row's, not the caller's choice, and the rule does not apply
export const EVAL_INHERITED = Symbol.for("sharingu.evalInherited");
export const EVAL_MARK_NOTE = "The eval mark is for test runs: it hides a write from every real screen, and the suites' clean-up deletes it. It is accepted on an eval project (create_project {eval: true}) or from a test seat, never on a real project. Leave eval out to file this for real. Nothing was filed.";
// KNOWLEDGE (sprint 1's review, closed in sprint 6, 6.6): a knowledge row (a goal, a card, a node …) carries no mark of its own —
// its PROJECT is its mark (projects.eval, which every real screen and roll-up leaves out). So a marked knowledge write is
// accepted on an eval project ALONE: a test seat's marked knowledge on a real project would land unmarked on every real screen.
export const EVAL_KNOWLEDGE_NOTE = "Knowledge carries its project's mark, never one of its own: a test run writes knowledge on an eval project (create_project {eval: true}), never on a real one, test seat or not. Leave eval out to write it for real. Nothing was filed.";
export async function evalMarkRefused(person, project, env, { knowledge = false } = {}) {
  if (!project || (!knowledge && isEvalSeat(person && person.id))) return null;
  let row = null;
  try { row = await reqMemo(env, `project-eval:${project}`, () => db(env).prepare("SELECT eval FROM projects WHERE key = ? AND org = {org}").bind(String(project)).first()); }
  catch (e) { if (isD1Quota(e)) throw e; row = null; }
  if (row && Number(row.eval) === 1) return null;
  return { error: "eval_mark_refused", project: String(project), note: knowledge ? EVAL_KNOWLEDGE_NOTE : EVAL_MARK_NOTE };
}

// The report backfill (ADR-074): transmissions that arrived without their rt-v1.1
// report get ONE unified batch report, generated here, banked as an artifact, and
// linked back to every covered row. Only router-entered work — a raw push that never
// became a submission does not exist to the brain. Runs on the cron; POST /backfill
// (owner) runs the same seam so the mechanic is provable by evals.
// The two modes are DISJOINT populations, never a superset (build0925:backfill-eval-integrity,
// 2026-09-25): production (the cron, POST /backfill) covers eval=0 rows only; eval mode
// (POST /backfill?eval=1, the suites) covers eval=1 rows only. Eval mode used to select
// "report IS NULL" with no eval filter at all, so a suite run linked eval=0 PRODUCTION rows to
// an eval-batch-report artifact that self_clean then deleted — 213 production rows on
// ryuklabs-agent-r were left pointing at an artifact that no longer existed (repaired by
// migrate-036.sql). Proven offline by tools/backfill-eval-selftest.mjs.
// G2 H2 (the independent review): a batch report used to bank up to 100 rows of EVERY project as ONE artifact owned by
// whoever filed the oldest, so that person read other projects' work through it. Now:
//   * ONE report per project (the rows of one project only; a row with no project gets an org-level report of its own);
//   * owned by no person: person_id is the org's owner (the column is NOT NULL; the owner reads every file anyway), the project
//     is stamped on the artifact, and mayReadArtifact reads a report under the project's own rule (the owner; a reader
//     seated on its project; an org-level report, the owner only) — never as its person_id's own file;
//   * a knowledge write is not covered (its ledger row names the items it wrote, some of them behind a role: a report would
//     show them whole to every seat; the knowledge door's receipt is its record).
// -> { backfilled, report (the first report's id), reports: [{ id, project, rows }] }
export const REPORT_OWNER_SQL = "SELECT id FROM people WHERE role = 'owner' AND active = 1 AND org = {org} ORDER BY created_at ASC LIMIT 1";
export async function backfillReports(env, origin, includeEval) {
  // sprint 6 (6.2): the rows and the owner of the caller's org (the route: the owner's sign-in; the cron: src/data.js platformEnv)
  const where = (includeEval ? "report IS NULL AND eval = 1" : "report IS NULL AND eval = 0") + " AND COALESCE(t.kind, '') <> 'knowledge' AND t.org = {org}";
  const { results } = await db(env).prepare(
    "SELECT t.*, p.name AS by_name, COALESCE(p.title, p.role) AS by_role FROM transmission t LEFT JOIN people p ON p.id = t.submitter " +
    "WHERE " + where + " ORDER BY t.created_at ASC LIMIT 100").all();
  if (!results.length) return { backfilled: 0 };
  const owner = await db(env).prepare(REPORT_OWNER_SQL).first();
  if (!owner || !owner.id) return { backfilled: 0, error: "no_owner", note: "No active owner to hold the report: nothing was banked." };
  const brand = (await getTenantConfig(env)).brand;
  const byProject = new Map();
  for (const r of results) { const k = r.project == null ? "" : String(r.project); if (!byProject.has(k)) byProject.set(k, []); byProject.get(k).push(r); }
  const reports = [];
  for (const [project, rows] of byProject) {
    const html = renderBatchReport({ rows, generatedAt: now(), origin, brand });
    const bytes = new TextEncoder().encode(html);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const key = artifactKey(now().slice(0, 7), CRON_REPORT_OWNER, hash, "html");
    await store(env).put(key, bytes, { httpMetadata: { contentType: "text/html" } });
    const id = uid();
    await db(env).prepare(
      "INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,screens,states,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,{org})"
    ).bind(id, owner.id, "html", (includeEval ? "eval-" : "") + "batch-report-" + now().slice(0, 10) + (project ? "-" + project : ""), key, hash, bytes.byteLength,
           "report", now(), null, null, project || null).run();
    for (const r of rows) {
      await db(env).prepare("UPDATE transmission SET report=? WHERE id=? AND org = {org}").bind(id, r.id).run();
    }
    reports.push({ id, project: project || null, rows: rows.length });
  }
  return { backfilled: results.length, report: reports[0].id, reports };
}

// isCronReport(row) -> true for a batch report the cron banked: group 'report' AND its body under the engine's own R2 prefix
// (inbox/artifacts/<month>/agent-r/, which no person's file ever uses: theirs is inbox/artifacts/<month>/<their id>/). A
// person may group their OWN file 'report' (a sender-side rt-v1.1 report, ADR-074): that one stays their file.
export const isCronReport = (row) => !!row && row.group_tag === "report" && CRON_REPORT_KEY_RE.test(String(row.r2_key || ""));
// mayReadArtifact(reader, row, env) -> whether this reader may read this banked file (GET /artifact/:id and read_file, one rule):
// a public file, anyone with the link (ADR-055); otherwise a signed-in reader who is the owner (every file), or — for a batch
// report the cron banked (G2 H2) — a reader seated on the report's project (an org-level report: the owner only; its person_id
// never admits anyone), or — for any other file — its author.
export async function mayReadArtifact(reader, row, env) {
  if (!row) return false;
  if (row.group_tag === "public") return true;
  if (!reader || !reader.id) return false;
  // sprint 6 (6.2): a file of another org is no reader's (the owner's "every file" is every file of the owner's org)
  if (Number(row.org) !== readerOrg(env)) return false;
  if (reader.role === "owner") return true;
  if (isCronReport(row)) return !!row.project && (await seatsOnce(env, reader.id)).some((s) => s && s.key === String(row.project));
  return reader.id === row.person_id;
}

// The D1 -> R2 nightly backup (PRD A3, ADR-082 §4), and POST /backup-dump: src/backup.js holds the dump (every table that
// holds truth, page by page; the rule for every table boot.sql creates; nothing about a credential). One function, two
// callers (ADR-063 seam rule): the cron and the owner's route. evalFlag: the suites' window (at most 50 rows a table, its own
// key, never the real backup's).
export async function backupDump(env, evalFlag) {
  const { backupEval, backupToR2 } = await import("./backup.js");
  return evalFlag ? await backupEval(env) : await backupToR2(env);
}

// The durable owner gate's EXIT (closed-loop P2, ADR-072). The D1 row IS the durable
// gate (sleeps at zero cost); this is the decision path it never had. ONE seam for
// REST + MCP, owner-only at both doors. Idempotency guard (P1's steal): a terminal
// decision (approve/reject) cannot be re-decided — a double-click or re-fired call
// returns already_decided instead of re-deciding. needs-work stays open and CAN be
// followed by a terminal decision later. Every accepted decision appends an IMMUTABLE
// approval_audit row and mirrors a stamped ruling event into the ONE audit trail (ADR-069).
// Approving an answer filing rules the question it answers, in the same request (knowledge/decisions.js ruleFromAnswer:
// open questions only, in the filing's project, through the knowledge door); the reply carries `ruled`, or `ruleError` and
// `ruleNote` when the question was not ruled (the approve stands). opts.via is the door ("mcp" | "http") for that ruling.
const DECIDE_VERDICTS = ["approve", "reject", "needs-work"];
export async function decideTransmission(person, txId, body, env, { via = null } = {}) {
  const verdict = String(body.verdict || "").toLowerCase();
  if (!DECIDE_VERDICTS.includes(verdict)) return { error: "bad_verdict", allowed: DECIDE_VERDICTS };
  const note = body.note ? String(body.note).slice(0, 2000) : null;
  // sprint 6 (6.2): a contribution of the decider's own org only; another org's id is not_found, as a missing one
  const t = await db(env).prepare("SELECT * FROM transmission WHERE id = ? AND org = {org}").bind(txId).first();
  if (!t) return { error: "not_found", id: txId };
  if (t.decision === "approve" || t.decision === "reject") {
    return { error: "already_decided", id: txId, decision: t.decision, decidedBy: t.decided_by, decidedAt: t.decided_at };
  }
  const at = now();
  await db(env).prepare(
    "INSERT INTO approval_audit (id, transmission_id, verdict, note, decided_by, created_at, org) VALUES (?,?,?,?,?,?,{org})"
  ).bind(uid(), txId, verdict, note, person.id, at).run();
  const terminal = verdict !== "needs-work";
  await db(env).prepare(
    "UPDATE transmission SET decision=?, decided_by=?, decided_at=?, decision_note=?" +
    (terminal ? ", status='closed', grade = json_set(COALESCE(grade,'{}'), '$.stages[#]', 'closed', '$.stagedAt.closed', ?)" : "") + " WHERE id=? AND org = {org}"   // WP9: the fourth stage on the row
  ).bind(...(terminal ? [verdict, person.id, at, note, at, txId] : [verdict, person.id, at, note, txId])).run();
  const isEval = t.eval === 1;
  // The mirrored ruling inherits the TRANSMISSION's project (ADR-100): the decision
  // belongs to the row it decides, not to whichever project the owner is browsing.
  await db(env).prepare(
    "INSERT INTO events (id,session_id,person_id,kind,lane,payload_json,touches,basis,stamped,project,created_at,org) VALUES (?,?,?,?,?,?,?,?,1,?,?,{org})"
  ).bind(uid(), null, person.id, "ruling", t.lane || null,
    JSON.stringify({ what: `owner decision — ${verdict}: ${t.what || txId}`, transmissionId: txId, ...(isEval ? { eval: true } : {}) }).slice(0, 2000),
    t.touches || null, note || "the owner's decision on a contribution", t.project || null, at).run();
  let ruling = {};
  if (verdict === "approve" && t.kind === "answer") {
    try { ruling = await (await import("./knowledge/decisions.js")).ruleFromAnswer(person, t, env, { via: via || "http" }); }
    catch (e) { if (isD1Quota(e)) throw e; ruling = { ruleError: "write_failed", ruleNote: "The question was not ruled: the write did not complete." }; }
  }
  return { id: txId, decision: verdict, status: terminal ? "closed" : (t.status || "routed"), decidedBy: person.id, decidedAt: at,
           note: terminal ? "Decided and closed — audit row appended, ruling mirrored to the trail."
                          : "Sent back needs-work — the contribution stays open; the contributor files again with parent=" + txId + ".",
           ...ruling };
}

// ---- the project axis (ADR-100 · workspace-prd · migrate-019) ----
// projectSeatsFor(personId) — the person's admin-assigned seats, joined to ACTIVE
// projects only (an archived project's seat goes dormant with it, no cleanup pass
// needed). Pre-migration DB (no project tables yet) degrades to [] — every caller
// treats [] as "the org has no project axis yet" and behaves exactly as before.
export async function projectSeatsFor(personId, env) {
  try {
    const { results } = await db(env).prepare(
      "SELECT s.project_key AS key, p.name FROM project_seats s JOIN projects p ON p.key = s.project_key AND p.active = 1 AND p.org = {org} " +
      "WHERE s.person_id = ? ORDER BY s.project_key"
    ).bind(personId).all();
    return results;
  } catch { return []; }
}

// projectsHeldBy(person, env) — D2b: the projects a person HOLDS, for the pages that list them (/projects, Profile): the owner
// (role class admin) holds every ACTIVE project (the same rule POST /project and liveStampOf apply: the owner may use any
// active project), a seated member or partner their seats. Display only: it grants nothing the stamp and the scope do not.
// [{ key, name }], at most 200; a failed read is [].
export async function projectsHeldBy(person, env) {
  if (!person || person.role !== "owner") return person ? projectSeatsFor(person.id, env) : [];
  try {
    return ((await db(env).prepare("SELECT key, name FROM projects WHERE active = 1 AND org = {org} ORDER BY slug LIMIT 200").all()).results || [])
      .map((r) => ({ key: String(r.key), name: r.name }));
  } catch { return []; }
}

// countActiveProjects(env) — the org's ACTIVE project count (moved here from index.js, UI-B8b): the shell's switcher reads it
// on every page, and the arch plane (src/mapplanes.js, GET /map/arch and its map {plane} twin) reads the SAME statement as its
// org worker's `active`. A failed read is 0.
export async function countActiveProjects(env) {
  try {
    const r = await db(env).prepare(ACTIVE_COUNT_SQL).first();
    return r?.n ?? 0;
  } catch { return 0; }
}

// ---- U-MCP (Q0D506BBC): the READ scope — which project a project-scoped read answers, at every door ----
// seatsOnce(env, personId) — projectSeatsFor, read ONCE per request (D9): the seam's read is reused by resolveProject, the
// scoped tools, resources/read, missing, ask, updates, whoami, build, read_file and the arch plane. Request-
// scoped (src/reqmemo.js), never isolate-wide; src/admin.js drops it (clearReqMemo) right after a seat or project write.
export function seatsOnce(env, personId) {
  return reqMemo(env, "seats:" + String(personId), () => projectSeatsFor(personId, env));
}
// activeKeysOnce(env) — the org's ACTIVE project keys, once per request: only the owner's default reads it (the owner may
// read any active project, so the owner's default is the first ACTIVE project, by key). A failed read is [].
export function activeKeysOnce(env) {
  return reqMemo(env, "active-project-keys", async () => {
    try { return ((await db(env).prepare("SELECT key FROM projects WHERE active = 1 AND org = {org} ORDER BY slug").all()).results || []).map((r) => String(r.key)); }
    catch { return []; }
  });
}
// ---- U-MCP-tail-b (QE6B9CEBA, Q952CAE10): the scope helper's input, the live stamp and the read project ----
// projectArg(v, seats?) — D3: THE one parse of a caller's `project` argument (an MCP argument, a JSON body field, a
// ?project= value), at every door. undefined, null and "" mean none; a string is trimmed and lower-cased (empty is none);
// ANY other shape (an object — even one whose toString is not callable —, an array, a number, a boolean) is the refusal
// project_forbidden (class not-allowed, no new code): a 1-element array is never a project key, and nothing throws. The
// caller reads or files nothing on a refusal; `seats` (the caller's project keys, when passed) is listed on it.
// -> { project: string|null } | { error: "project_forbidden", note, seats?, example? }
export const PROJECT_ARG_NOTE = "`project` is one project key, a string";
// sprint 6 (6.2): `org` (the reader's, src/data.js readerOrg: never the caller's) resolves a bare slug inside that org
// (src/project.js keyInOrg): org 1's bare keys are its own, unchanged; in another org "web" is that org's "o<org>--web".
export function projectArg(v, seats, org = null) {
  if (v === undefined || v === null) return { project: null };
  if (typeof v !== "string") {
    const keys = Array.isArray(seats) ? seats.map((s) => (s && typeof s === "object" ? s.key : s)).filter((k) => typeof k === "string") : null;
    return { error: "project_forbidden", note: PROJECT_ARG_NOTE + (keys && keys.length ? `: one of [${keys.map(projectSlug).join(", ")}].` : "."),
             ...(keys ? { seats: keys } : {}), ...(keys && keys.length ? { example: { project: keys[0] } } : {}) };
  }
  const k = v.trim().toLowerCase().slice(0, 200);   // bounded: a key is at most 40 chars, a refusal never echoes more
  return { project: (k && keyInOrg(org, k)) || null };
}
// liveStampOf(person, seats, env) — D4: the session stamp ONLY while it is live: one of the caller's seats (seats are
// ACTIVE projects only, projectSeatsFor), or — for the owner, who may use any active project (ADR-100) — an ACTIVE project
// (activeKeysOnce: the same request memo the owner default reads, so at most ONE statement, owner only). A stamp on an
// archived project, the org rollup '*', or no stamp is none: it never defaults a read nor stamps a write. The sync
// tokenProjectFor (below) stays only for read_file's list (artifactsListFor: public files) — the
// top bar's switcher chip reads the request's read scope instead (switcherCurrentOf, U-TOPBAR).
export async function liveStampOf(person, seats, env) {
  const stamped = person && typeof person.token_project === "string" ? person.token_project : null;
  if (!stamped || stamped === "*") return null;
  if ((Array.isArray(seats) ? seats : []).some((s) => s && s.key === stamped)) return stamped;
  if (person.role !== "owner") return null;
  return (await activeKeysOnce(env)).includes(stamped) ? stamped : null;
}
// ---- THE one "multi-project" rule (U-MCP-tail-b heal, the adversarial review's finding 1) ----
// orgProjectsOnce(env) -> the org's ACTIVE project keys, at most two (LIMIT 2: "more than one" needs no more), through ONE
// memo that the workspace seam (src/index.js, via orgIsMultiProject — whether a request is scoped at all) and
// projectScopeOf (a null scope's filter, a single-project org's one project) BOTH read, so the two never disagree:
//   * not on the population — the D1 ACTIVE projects (the one countActiveProjects, the switcher and the U-MCP ruling
//     count);
//   * not on time — the per-isolate memo lives a minute (the seam's own cost rule, M-ADR-027), and the request pins its
//     first answer (reqMemo), so a memo expiring mid-request cannot split the seam from the reads after it.
// The isolate memo is keyed by the raw D1 binding (a WeakMap; src/timing.js REAL_BINDING under the per-request proxy),
// never shared across bindings. A failed read is [] (not memoized across requests).
// sprint 6 (6.2): the reader's org's projects only. `+org`: the walk stays the key order it always was (it stops at the LIMIT),
// the org a test on each row walked; on a database holding one org it reads exactly the rows it read before.
export const ORG_PROJECTS_SQL = "SELECT key FROM projects WHERE active = 1 AND org = {org} ORDER BY slug LIMIT 2";
export const ORG_PROJECTS_TTL_MS = 60000;
// every active project's key (whoami for a seatless owner, the one-pass fix 9: where the owner's writes can land); bounded
export const ACTIVE_PROJECT_KEYS_SQL = "SELECT key FROM projects WHERE active = 1 AND org = {org} ORDER BY slug LIMIT 200";
// the org's ACTIVE project count (countActiveProjects; Home's who-is-here counts with the same predicate, src/hotsql.js)
export const ACTIVE_COUNT_SQL = "SELECT COUNT(*) AS n FROM projects WHERE active = 1 AND org = {org}";
const orgProjectsMemo = new WeakMap();
// sprint 6 (6.2, PLATFORM §2 item 4): the isolate memo is keyed by the binding AND the reader's org (src/data.js orgCache), the
// request memo by the org too (src/reqmemo.js). No signed-in org is refused before the memo (src/data.js org_unknown): the
// population of "no org" is never read as [] (that would read as a project-less org, no filter at all).
export function orgProjectsOnce(env) {
  const org = readerOrg(env);
  if (org == null) return Promise.reject(Object.assign(new Error("org_unknown: the org's projects with no one signed in"), { code: "org_unknown" }));
  return reqMemo(env, "org-active-projects", async () => {
    const slot = orgCache(env, orgProjectsMemo, org);
    const hit = slot ? slot.get() : undefined;
    if (hit && Date.now() - hit.at < ORG_PROJECTS_TTL_MS) return hit.keys;
    let keys;
    try { keys = ((await db(env).prepare(ORG_PROJECTS_SQL).all()).results || []).map((r) => String(r.key)); }
    catch { return []; }
    if (slot) slot.set({ at: Date.now(), keys });
    return keys;
  });
}
// forgetOrgProjects(env) — a /control project write (src/admin.js add/archive/activate) drops this isolate's memo of the
// writer's org, so the writer's isolate answers the new population at once (other isolates within the minute; each still
// agrees with itself)
export function forgetOrgProjects(env) {
  const org = readerOrg(env);
  const slot = org == null ? null : orgCache(env, orgProjectsMemo, org);
  if (slot) slot.drop();
}
// orgIsMultiProject(env) — THE seam's question ("scope this request?"), answered from the SAME memo projectScopeOf reads
export async function orgIsMultiProject(env) {
  return (await orgProjectsOnce(env)).length > 1;
}
// isPartnerReader(person) -> true for a Partner (src/hats.js roleClassOf: role partner, or a typed outside label such as
// external-* or vendor), never for the owner or a member
export function isPartnerReader(person) {
  return !!person && typeof person === "object" && roleClassOf(person.role) === "partner";
}

// READ_PROJECT_RULE (D7; D5: short) — THE one sentence for `project` on a read: the `project` property description of every
// project-scoped read tool (src/index.js MCP_TOOLS). The writes take PROJECT_ARG.
export const READ_PROJECT_RULE = "one of your projects (`whoami` lists them; the owner: any active one); left out, your active project, else your first. Another is refused project_forbidden.";
// PROJECT_ARG (D5) — the `project` property of a write tool: short, the rule itself is PROJECT_RULE (below) and doorProject
export const PROJECT_ARG = "the project it belongs to; left out with one project or an active one, else refused project_required.";

// ---- U-TOPBAR: the top bar's project chip names the project the page READ ----
// READ_SCOPE — the per-request record { project, named, active } the workspace seam (src/index.js routeRequest) stores on
// the scoped env it hands every route, from resolveProject's answer (only its env survived before, so a page could not tell
// a named or live-stamped scope from the owner's default). Request-scoped: it rides the request's own env object, never a
// module global. Symbol.for so a selftest can read it by name.
export const READ_SCOPE = Symbol.for("sharingu.readscope");
// switcherCurrentOf(reader, seats, scope) -> string | null — pure, sync: the project key the top-bar chip names.
//   * no scope, or a scope with no project (a caller seated nowhere, the org root) -> null (the honest scope text);
//   * a NAMED scope (?project=) or the ACTIVE one (the live stamp, or a single seat) -> that project;
//   * an unnamed, inactive scope read by the OWNER is resolveProject's owner default: the page is the org rollup, so null
//     ("All projects", the All form aria-current) — unchanged from before;
//   * an unnamed, inactive scope read by a member is their first-readable default: the chip names the project they read.
// It never reads the stamp (the scope already did, through liveStampOf) and never types a key.
export function switcherCurrentOf(reader, seats, scope) {
  if (!scope || !scope.project) return null;
  // U-MCP-tail-c: the scope's project is already a key (resolveProject parsed it through projectArg, or read it off a seat /
  // liveStampOf), so it is returned as is — never re-coerced by String() outside projectArg (Q952CAE10)
  if (scope.named || scope.active) return scope.project;
  if (reader && reader.role === "owner") return null;
  return scope.project;
}

// doorProject(person, body, seats, env) — THE server-side stamp (ADR-100 / the ruled
// door): the client is never trusted. One seat -> that project, no field needed
// (SIRU today: zero-field change). Multiple seats -> the submission must carry a
// `project` CLAIM, validated against the submitter's seats — missing or invalid is
// a loud 422, never a silent re-file. The owner may file into any ACTIVE project.
// Zero seats (an unseated person, or a pre-migration DB): the org's sole active
// project stamps implicitly; otherwise null (recorded honestly, org-level).
// D2b item 7: a seatless MEMBER (or partner) in an org of more than one project is refused too (project_required, with no
// project named back to them: they hold none), never filed at the org level — EXCEPT where the feature needs the org-level
// record: `ask` (a question to the owner from someone with no seat yet) and `wrap_up` (the session's close), and the
// loose stamp of the audit rows (stampProjectLoose). Those pass opts.orgLevelOk. It narrows only.
export async function doorProject(person, body, seats, env, opts = {}) {
  // D3: the claim is parsed by projectArg — a non-string `project` is refused project_forbidden, nothing filed
  const arg = projectArg(body ? body.project : undefined, seats, readerOrg(env));
  if (arg.error) return arg;
  const claimed = arg.project;
  if (claimed) {
    if (seats.some((s) => s.key === claimed)) return { project: claimed };
    if (person.role === "owner") {
      try {
        // sprint 6 (6.2): the owner may name any ACTIVE project of the OWNER'S org, never another org's
        const p = await db(env).prepare("SELECT key FROM projects WHERE key = ? AND active = 1 AND org = {org}").bind(claimed).first();
        if (p) return { project: claimed };
      } catch { /* pre-migration DB — fall through to the refusal below */ }
    }
    const keys = seats.map((s) => s.key);
    return { error: "project_forbidden", project: claimed, seats: keys,
             // sprint 13 (13.2): the note names slugs (the door reads a slug inside the caller's org); seats and example keep the keys (data)
             note: keys.length ? `You hold no seat on "${projectSlug(claimed)}". Use \`project\`: one of [${keys.map(projectSlug).join(", ")}].` : `You hold no seat on "${projectSlug(claimed)}" — ask the owner for one, or leave \`project\` out.`,
             ...(keys.length ? { example: { project: keys[0] } } : {}) };
  }
  if (seats.length === 1) return { project: seats[0].key };
  // B7e C2: THE one project rule (PROJECT_RULE) — an ACTIVE project (the session's own stamp, whoami's activeProject)
  // fills an unnamed write, exactly as whoami's gloss promises ("Your writes land in … unless you name another").
  // D4: only a LIVE stamp fills it — an owner's stamp on an archived project never stamps a write there
  const active = await liveStampOf(person, seats, env);
  if (active) return { project: active };
  if (seats.length === 0) {
    // U-MCP-tail-b heal: the SAME population and memo the seam and projectScopeOf read (orgProjectsOnce), so a seatless
    // caller's write lands where its read scope reads — the org's one active project, else org-level (a failed read: [])
    const rows = await orgProjectsOnce(env);
    // D5 Part 4 (a), the Partner fence on WRITES (authority: narrowing only): a Partner seated on no project never files into
    // the org's sole project (their reads already see no project: src/project.js NO_PROJECT). A write that needs a project is
    // refused with the fence's own refusal, project_forbidden; an org-level record (orgLevelOk: ask, a saved file's stamp)
    // lands at the org level, as a seatless member's does in an org of several projects.
    if (rows.length === 1 && isPartnerReader(person)) {
      if (opts && opts.orgLevelOk) return { project: null };
      return { error: "project_forbidden", project: rows[0], seats: [], note: `A Partner files only into a project they hold a seat on, and you hold none: ask the owner for a seat on "${projectSlug(rows[0])}". Nothing was filed.` };
    }
    if (rows.length === 1) return { project: rows[0] };
    // D1b item 4: the OWNER (who may file into any active project) with no seat in an org of more than one project is never
    // filed silently at the org level (it answered 200 with project null): refused project_required naming the projects, the
    // multi-seat refusal's shape. It narrows only: a write that names a project is untouched (above); a seatless member's
    // write stays org-level as before (they are shown no project), and an org with no project yet files org-level too
    // (whoami, holes and the instructions point its owner at create_project).
    if (rows.length > 1 && person && person.role === "owner") {
      const keys = await activeKeysOnce(env);
      return { error: "project_required", seats: [], projects: keys,
        note: `Add \`project\`: one of [${keys.map(projectSlug).join(", ")}] — this org holds more than one project and you hold no seat, so sharingu will not guess (and never files at the org level).`,
        example: { project: keys[0] } };
    }
    if (rows.length > 1 && !(opts && opts.orgLevelOk))
      return { error: "project_required", seats: [],
        note: "You hold no seat on any project of this org, and it holds more than one, so nothing is filed: ask the owner for a seat (`ask` reaches them without one)." };
    return { project: null };
  }
  // W6 (B7a): the refusal says what to do. Still a refusal — never a silent default to one seat (ADR-100).
  const keys = seats.map((s) => s.key);
  // B7c: the note names the SAME org-note default whoami's projectGloss names (orgNoteDefault, one source) —
  // it names it, never stamps it. The tenant read is best-effort: a fake/pre-migration env gets the fallback.
  let home = null;
  try { home = homeProjectOf(await getTenantConfig(env)); } catch { home = null; }
  const seated = keys.includes(home) ? home : null;
  return { error: "project_required", seats: keys,
           note: `Add \`project\`: one of [${keys.map(projectSlug).join(", ")}] — you hold seats on more than one project, so sharingu will not guess. ${orgNoteDefault(seated, keys, seatName(seats, seated))}`,
           example: { project: keys[0] } };
}

// stampProjectLoose(person, env) — the never-blocking variant for event/artifact
// writes (a drift or a banked dump must never 422 on the project axis): derive the
// single-seat project, else the org's sole project, else null. One cheap indexed
// query; the audit/attribution rows it stamps are exactly the ones the scoped
// surfaces read (workspace-prd §7).
export async function stampProjectLoose(person, env) {
  const seats = await projectSeatsFor(person.id, env);
  const d = await doorProject(person, {}, seats, env, { orgLevelOk: true });
  return d.project || null;
}

// SESSION_COOKIE — the web session cookie's name (ADR-056 → M-ADR-024). `__Host-` prefixed on
// purpose (security review 2026-09-05, finding 2): every org worker shares the registrable
// domain `*.workers.dev`'s account label, i.e. two orgs are the SAME SITE — so a plain cookie
// set by one sibling origin with `Domain=<account>.workers.dev` would be presented to every
// other (session fixation across the hard wall). A `__Host-` cookie can carry no Domain, must
// be Secure + Path=/, and is therefore bound to exactly this origin. The old `siru_session`
// name also carried a tenant fact; this one carries none.
export const SESSION_COOKIE = "__Host-ar_session";
export const SESSION_COOKIE_ATTRS = "HttpOnly; Secure; SameSite=Lax; Path=/";

// sessionCookieToken(request) — the ONE parser for the web session cookie. Three hand-rolled
// copies of this regex used to live in resolveReader, POST /project and the resolver below; one
// reader now, so the cookie name can never drift between them.
export function sessionCookieToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const cm = cookie.match(new RegExp("(?:^|;\\s*)" + SESSION_COOKIE.replace(/[-]/g, "\\-") + "=([^;]+)"));
  return cm ? decodeURIComponent(cm[1]) : "";
}

// csrfRefused(request, url, person) — the same-ORIGIN check for a cookie-authenticated write
// (security review 2026-09-05, finding 1). SameSite=Lax only separates SITES, and sibling org
// workers on workers.dev are one site — so Lax alone cannot stop same-site HTML (e.g. a banked
// artifact served from a sibling origin) from POSTing with the victim's cookie. Browsers always
// send Sec-Fetch-Site on a fetch/form; a script client (curl, the suites) sends neither header
// and is unaffected — the ambient cookie is the only thing being guarded. Explicit Bearer
// callers (no viaCookie) are never touched by this.
export function csrfRefused(request, url, person) {
  if (!person || !person.viaCookie || request.method === "GET" || request.method === "HEAD") return false;
  // Sec-Fetch-Site is the browser's own verdict and a forbidden header (no script can forge it): when
  // present it decides. `Origin: null` — what every browser sends on its own form POST under a
  // no-referrer policy — is NOT cross-site (scar 2026-09-08, the launcher refused every real sign-in).
  const sfs = request.headers.get("sec-fetch-site");
  if (sfs) return sfs !== "same-origin" && sfs !== "none";
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return true;
  return false;
}

// (humanSessionRefused and HUMAN_VERB_HINT, UI-B11a's session-only guard, are gone: sprint 3 D2 put publish and equip
// through the door as tools with REST twins below the gate, src/broadcast.js; MCP.md §5 supersedes Q60CCC574.)

// ---- migrate-044: the profile columns every resolver selects (people.hats, avatar, role_label) ----
// Every resolver below reads a person with PERSON_COLS plus the profile columns, which the visibility rule (src/hats.js
// readerKeys) and the rail's foot read off the reader, so no page adds a statement for them. A database migrate-044 has not
// reached answers "no such column": the resolver then reads PERSON_COLS alone (one failed statement, no row read), and the
// person has no hats and no label, their role alone gating exactly as before the migration. The WHERE of every resolver is
// unchanged; only its column list grew.
// migrate-045 adds access_hats (the admin-set hats readerKeys admits by) to the same list. A database migrate-045 has not
// reached reads the migrate-044 columns (one more failed statement, no row read): the person then has NO access hat, so a
// hat admits them to nothing until the migration's backfill has run (less, never more).
export const PROFILE_COLS = ", hats, avatar, role_label, access_hats";
export const noProfileCols = (e) => /no such column|has no column named/i.test(String((e && e.message) || e));
// profileTiers(cols) -> the column lists to try, newest first: as given, without access_hats (migrate-044), none
const profileTiers = (cols) => [...new Set([cols, cols.replace(/,\s*(?:\w+\.)?access_hats\b/g, ""), ""])];
// withProfile(run) — run(cols) with the profile columns, else (a pre-migrate-045 database) without access_hats, else (a
// pre-migrate-044 database) without any of them. run reads `cols` as a string: "" is none.
export async function withProfile(run, cols = PROFILE_COLS) {
  const tiers = profileTiers(cols);
  for (let i = 0; i < tiers.length; i++) {
    try { return await run(tiers[i]); }
    catch (e) { if (!noProfileCols(e) || i === tiers.length - 1) throw e; }
  }
}

// bearerOf(request) -> the Authorization: Bearer value, or ""
const bearerOf = (request) => { const h = request.headers.get("authorization") || ""; return h.startsWith("Bearer ") ? h.slice(7).trim() : ""; };
// keyRow(env, key) -> the people row a bearer credential names (a personal key, or a session token sent as a bearer: its seat,
// tokens.person_id), or null. Memoized per request under the credential's hash (signInMemo); signs no one in.
async function keyRow(env, key) {
  const hash = await sha256(key);
  // sprint 2 (the live budget): the SAME credential is resolved by the workspace seam, the gate and the route (up to four
  // times a request), so the answer is memoized PER REQUEST under its full hash (src/reqmemo.js: never across requests, never
  // isolate-wide), and a deactivated person or a revoked or expired token is refused on the very next request exactly as
  // before. A write to people inside the request drops the memo (clearReqMemo). Callers copy the answer ({ ...person }), never
  // mutate it: it is frozen so a caller that tried would throw rather than change another caller's reader.
  return signInMemo(env, "auth:" + hash, async () => {
    // 1 · a long-lived issued key (owner/admin path)
    // `title` is selected on BOTH paths (product pass 2026-09-05): the shell's identity chip
    // renders title||role, and the OAuth resolver already selected it — so the same
    // person used to see their title on a link visit and their role on a session visit.
    let person = await withProfile((x) => db(env).prepare(
      "SELECT id, name, email, role, title, capture_mode, lane, org" + x + " FROM people WHERE key_hash = ? AND active = 1"
    ).bind(hash).first());
    if (person) return Object.freeze(person);
    // 2 · a session token from signing in, sent as a bearer (POST /login's JSON answer): ITS SEAT only (tokens.person_id), never
    // the account's other seats — a bearer is the key's seat (sprint 7, 7.4); only the browser's cookie reads by the address.
    // token_project (ADR-100 §1): the picker/switcher's session stamp rides the token row —
    // selected here so every resolved reader carries its active project with no second query.
    person = await withProfile((x) => db(env).prepare(
      "SELECT p.id, p.name, p.email, p.role, p.title, p.capture_mode, p.lane, p.org" + x + ", t.project AS token_project FROM tokens t JOIN people p ON p.id = t.person_id " +
      "WHERE t.token_hash = ? AND t.revoked = 0 AND t.expires_at > ? AND p.active = 1"
    ).bind(hash, now()).first(), ", p.hats, p.avatar, p.role_label, p.access_hats");
    return person ? Object.freeze(stampHere(person)) : null;
  });
}

export async function authenticate(request, env) {
  const key = bearerOf(request);
  if (!key) return null;
  // sprint 6 (6.2): the credential's people row carries its org, and the sign-in (src/data.js signIn) makes it the request's:
  // the org of every statement after it. The lookup itself is keyed by the credential (signInMemo), never by an org. Sprint 7
  // (7.4): under an org's address the sign-in is refused unless the row is of that org (org_mismatch: no reader here).
  const found = await keyRow(env, key);
  return found ? signIn(env, found) : null;
}

// ---- the browser's session (sprint 7, 7.4; PLATFORM §2 items 8 and 9: one session per account, the org from the address and
// the membership). The `__Host-` cookie names a tokens row; it signs a person in ONLY under an org's address (/<org>/…, src/data.js
// addressServes): the reader is the session's seat there — for an ACCOUNT session (tokens.account_id, minted by proving the
// account's passphrase) the account's active seat in the address's org; for a SEAT session (account_id NULL, minted by a seat's
// own secret: every session before migrate-073) its own seat, and only when that seat is of the address's org. At the root a
// cookie signs no one in (the router redirects a page navigation to the session's org: sessionHome below). One statement: the
// token by its primary key, the account's seat in the org by idx_people_account_seat, the person by its primary key.
// Binds: ?1 the token's hash, ?2 now, ?3 the address's org.
// session_account (7.4b): the account an ACCOUNT session belongs to (NULL: a SEAT session), so the rail's org switcher lists that
// account's own orgs and a seat session's lists none
// The statement is src/accounts.js SESSION_AT_SQL (sprint 12's review: it names an account's invite mark, and every statement on
// accounts lives there — tools/check-scoped-data.py's account rule); sessionAtRow runs it.
// a session that signs in nobody HERE, but is live (its seat active, or its account holding an active seat somewhere): the router
// answers the plain 404 (membership never told) rather than the sign-in page. A yes or no. Binds: ?1 the token's hash, ?2 now.
export const SESSION_LIVE_SQL = "SELECT 1 AS live FROM tokens t WHERE t.token_hash = ?1 AND t.revoked = 0 AND t.expires_at > ?2 " +
  "AND (EXISTS (SELECT 1 FROM people p WHERE p.id = t.person_id AND p.active = 1) OR EXISTS (SELECT 1 FROM people s WHERE s.account_id = t.account_id AND s.active = 1))";
// where a live session may go (sprint 7, 7.4b: an old bookmark at the root, and the org picker GET /orgs): the session's kind (its
// account, NULL for a SEAT session) and its own seat's org. A seat session goes to its seat's org only; an account session to
// any org its account holds a seat in (src/accounts.js orgsOfAccount). Binds: ?1 the hash, ?2 now.
export const SESSION_PLACE_SQL = "SELECT t.account_id, o.slug, o.name, p.role FROM tokens t LEFT JOIN people p ON p.id = t.person_id AND p.active = 1 " +
  "LEFT JOIN org o ON o.id = p.org WHERE t.token_hash = ?1 AND t.revoked = 0 AND t.expires_at > ?2";

// THE PROJECT STAMP IS PER ORG (sprint 7's review, B5): one token may be an ACCOUNT session reading several orgs, and its stamp
// (tokens.project, POST /project) is one column — a project of another org than the seat it reads as is NO stamp here (the `/`
// picker test and liveStampOf then answer as for a token never stamped). The org rollup '*' names no org's project and stays.
// stampHere(row) -> the row, its token_project kept only when it is the row's own org's
export function stampHere(row) {
  const k = row && row.token_project;
  if (!k || k === "*") return row;
  const o = orgOfKey(k);
  return o && Number(o.org) === Number(row.org) ? row : { ...row, token_project: null };
}
// authenticateSession(token, env) -> the reader the session cookie names under this address, or null (the root, where a cookie
// signs no one in — /mcp included: a dead bearer there is a 401, never a cookie's seat (sprint 7's review, C5); an address no org
// holds; a dead session; no seat of it in the address's org)
export async function authenticateSession(token, env) {
  if (!token || !atAddress(env)) return null;
  const org = addressServes(env);
  if (org == null) return null;
  const hash = await sha256(token);
  const found = await signInMemo(env, `session:${org}:${hash}`, async () => {
    const row = await withProfile((x) => sessionAtRow(env, x, hash, now(), org), ", p.hats, p.avatar, p.role_label, p.access_hats");
    return row ? Object.freeze(stampHere(row)) : null;
  });
  return found ? signIn(env, found) : null;
}
// sessionLive(token, env) -> true when the session is live somewhere (see SESSION_LIVE_SQL)
export async function sessionLive(token, env) {
  if (!token) return false;
  return !!(await db(env).prepare(SESSION_LIVE_SQL).bind(await sha256(token), now()).first());
}
// sessionPlace(token, env) -> { account, orgs: [{ slug, name, role }], pending: [{ id, slug, name, role }] } — the orgs a live
// session reaches (SESSION_PLACE_SQL): a SEAT session (account false) its own seat's org, ONE; an ACCOUNT session (account true)
// every org its account holds an active seat in (src/accounts.js orgsOfAccount: the account's own, no widening) and the seats
// waiting for its yes (the review's A1: src/accounts.js pendingOf, the picker's Accept and Decline) — or null (a dead session,
// nothing at all). Signs no one in: the root uses it to send a page navigation into an org, or to the picker (sprint 7, 7.4b).
export async function sessionPlace(token, env) {
  if (!token) return null;
  const row = await db(env).prepare(SESSION_PLACE_SQL).bind(await sha256(token), now()).first();
  if (!row) return null;
  if (row.account_id) {
    const [orgs, pending] = await Promise.all([orgsOfAccount(env, row.account_id), pendingOf(env, row.account_id)]);
    return orgs.length || pending.length ? { account: true, orgs, pending: pending.map((p) => ({ id: String(p.id), slug: String(p.slug), name: String(p.name || p.slug), role: String(p.role || "") })) } : null;
  }
  return row.slug ? { account: false, orgs: [{ slug: String(row.slug), name: String(row.name || row.slug), role: String(row.role || "") }], pending: [] } : null;
}
// credentialLive(request, env) -> true when the request carries a credential that is valid SOMEWHERE (a bearer key or session
// token of any org, a read-only credential, a live session cookie), whether or not it signs anyone in under this address: the
// router tells "not here" (the plain 404) from "not signed in" (the sign-in rule) by it. Signs no one in.
export async function credentialLive(request, env) {
  const key = bearerOf(request);
  if (key) {
    if (await keyRow(env, key)) return true;
    return !!(await readOnlyRow(key, env));
  }
  return sessionLive(sessionCookieToken(request), env);
}

// Identity for the generic REST gate below (ADR-050): the full write-capable path, or — only
// if that fails — the read-only derived credential (resolveReadOnly, defined with resolveReader
// further down). The caller MUST still refuse person.readOnly on anything but GET; this function
// only resolves who is asking, not what they may do.
//
// THE WEB SESSION IS HONORED HERE TOO (M-ADR-024, product pass 2026-09-05). Before this, only
// resolveReader (the above-the-gate pages) read the session cookie, so every HTML page that
// lives below the REST gate — /transmission?page=1 (the Orchestrator's own "queue" lever),
// /inbox, /metrics — answered a signed-in browser with 401 {"hint":"Authorization: Bearer"}:
// the product telling a logged-in person they were not logged in. Proven live before the fix.
// Order + safety: the Authorization header still wins (an explicit credential is never
// overridden by an ambient one); the cookie is consulted ONLY when no header is present; the
// same authenticate() path resolves it (a session token row — never a raw key, which is never
// set as a cookie); CSRF on the write routes is held by csrfRefused() at the gate (same-ORIGIN,
// not just SameSite — see its note) plus the `__Host-` cookie. viaCookie is carried so the
// gate can apply that check and the shell's Logout stays honest on these pages.
export async function resolveAny(request, env) {
  const person = await authenticate(request, env);
  if (person) return { ...person, readOnly: false };
  const header = request.headers.get("authorization") || "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) {
    // the browser's session: only under an org's address, as its seat there (authenticateSession)
    const viaSession = await authenticateSession(sessionCookieToken(request), env);
    return viaSession ? { ...viaSession, readOnly: false, viaCookie: true } : null;
  }
  return await resolveReadOnly(key, env);
}

// ---- ADR-050: a genuinely read-only credential ----
// The /boot link was documented "read only" but carried the person's full key_hash — the SAME
// secret accepted as Bearer on every write route. A leaked boot link was a leaked write key.
// Fix: derive a second value from that same key_hash, one hash further, domain-separated —
//   readOnlyToken = sha256(key_hash + READ_ONLY_SUFFIX)
// Nobody needs to store it: it is computable by anyone who already knows the person's plaintext
// key, exactly the way key_hash itself has always been computable (key_hash = sha256(key)) — so
// this needs no new column and no new secret. It can never equal key_hash or a tokens.token_hash
// (different construction entirely), so authenticate() — the ONLY path every write route uses —
// refuses it by construction. It is accepted ONLY by resolveReader, as a Bearer header, and only where the caller opted
// the route in as read-only-safe (readOnlyOk: true, below).
const READ_ONLY_SUFFIX = ":agent-r-read-only:v1";
const READ_ONLY_TOKEN_SHAPE = /^[0-9a-f]{64}$/;   // util.sha256 output: lowercase hex, 32 bytes
// the roster with the profile columns (withProfile's tiers: before migrate-045 without access_hats, before migrate-044 none)
const rosterSql = (cols) => "SELECT id, name, email, role, title, capture_mode, lane, org, key_hash" + (cols ? ", " + cols.replace(/^\s*,\s*/, "") : "") + " FROM people WHERE active = 1";
export const ROSTER_SQL = rosterSql(PROFILE_COLS);

export async function resolveReadOnly(candidate, env) {
  const p = await readOnlyRow(candidate, env);
  return p ? signIn(env, { ...p, readOnly: true }) : null;
}
// readOnlyRow(candidate, env) -> the person a read-only credential names (any org), or null; signs no one in
async function readOnlyRow(candidate, env) {
  if (!candidate) return null;
  // candidate IS the final derived token already (sha256(key_hash + SUFFIX)) — unlike
  // authenticate(), there is no stored hash to compare a hash-of-candidate against, so
  // candidate is compared directly. (Bug fixed 2026-08-28: this used to hash candidate a
  // second time — sha256(candidate) — which can never equal sha256(key_hash + SUFFIX) for
  // any person, so every read-only token 401'd everywhere, read routes included.)
  // build0925:d1-hot-queries (hot #7): this roster scan was one of the top D1 readers. Two narrowings, and neither
  // changes who is accepted:
  //   * the token is sha256 output, 64 lowercase hex characters. Anything else (a wrong full key, an OAuth
  //     string, junk) can never equal one, so it is refused before any D1 read;
  //   * the roster is read at most ONCE per request (src/reqmemo.js). The workspace seam and the route's own
  //     resolveReader both land here. The memo is request-scoped only: a deactivated person's token fails on the
  //     very next request.
  // No index can narrow the scan itself (the match is a hash computed per row).
  if (typeof candidate !== "string" || !READ_ONLY_TOKEN_SHAPE.test(candidate)) return null;
  // the roster of every org: the token names its person, and the person names the org (the sign-in's own read, signInMemo)
  const results = await signInMemo(env, "roster:active", async () => (await withProfile((x) => db(env).prepare(rosterSql(x)).all())).results || []);
  for (const p of results) {
    if ((await sha256(p.key_hash + READ_ONLY_SUFFIX)) === candidate) {
      const { key_hash, ...person } = p;
      return person;
    }
  }
  return null;
}

// ONE reader resolver (ADR-039). Six routes used to each run their own inline key check — six copies of security-critical
// logic that agreed only by luck. This is the single path. G2 M2 (the independent review): a key in the ADDRESS (?k=) no
// longer signs anyone in, on any route — a URL leaks through history, logs, the Referer and, the review proved it, the very
// page it opens (a saved HTML file read the viewer's whole key off its own location). A caller sends the key as an
// Authorization: Bearer header, or holds a session cookie (sign in). readOnlyOk marks a read-only route: only there is the
// read-only credential (ADR-050, sent as a Bearer header) accepted, so it can never reach a route (like /mcp) that was not
// deliberately opted in.
export async function resolveReader(request, env, url, { readOnlyOk = false, props = null, wantOrg = "" } = {}) {
  // OAuth path (ADR-047): the provider validated the token and handed us the person's id.
  // It resolves HERE, not in a parallel path — §3.6 of the PRD.
  // viaOAuth + oauthScope (the consented scope[] carried in props, see oauth.js) are what let
  // callTool() enforce mcp:read vs mcp:write below — a bearer/owner-key caller never sets
  // viaOAuth, so hasWriteScope() treats it as unlimited, exactly as before this change.
  // sprint 7, 7.5a (src/oauthgrants.js: the two grant kinds): an ACCOUNT grant (props.accountId) acts as one of the account's
  // OWN active seats — the one in the org the call names (wantOrg: an org's path name, the MCP door reads it off the call:
  // src/mcp.js orgWantedOf), else the grant's current org's, else the org-1 seat, else the oldest (accountGrantSeat) — and
  // stands only while the ACCOUNT's passphrase is the one that made it (accountCred) — and, sprint 8's 8.3a (the sprint-7 review's
  // C2), only in a seat its org's admin has not reissued since the grant was made (the seat's grants epoch, p.reissued_at, on the
  // same row: accountGrantStands; refused, the request is signed out and src/mcp.js callerOf answers the re-connect 401). A SEAT
  // grant (no accountId: every grant made before 7.5a) is below, unchanged: its person, whatever the call names (wantOrg never
  // reaches it).
  if (props && grantKindOf(props) === GRANT_KINDS.account) {
    const scope = Array.isArray(props.scope) ? props.scope : [];
    const seat = await signInMemo(env, `grant:${props.accountId}:${props.org}:${normOrgArg(wantOrg)}`, async () => {
      const row = await withProfile((x) => accountGrantSeat(env, props.accountId, { want: wantOrg, org: props.org }, x), ", p.hats, p.avatar, p.role_label, p.access_hats");
      return row ? Object.freeze(row) : null;
    });
    if (!seat) return null;
    const { account_hash, account_salt, reissued_at, ...who } = seat;
    if (!props.cred || !(await accountGrantStands(props.cred, { pass_hash: account_hash, pass_salt: account_salt }, reissued_at))) return null;
    // the review's A1 (never a default seat): a call that names no org acts in the grant's own org — the one its holder chose at
    // the OAuth form. When the account no longer holds an active seat there (removed, its org's admin's act), the seat above is
    // another org's: grantOrgGone, and every call must name its org (src/mcp.js orgArgRefused), never acting there by default
    const gone = !normOrgArg(wantOrg) && Number.isSafeInteger(Number(props.org)) && Number(who.org) !== Number(props.org);
    return signIn(env, { ...who, readOnly: false, viaOAuth: true, oauthScope: scope, grantAccount: String(props.accountId), ...(gone ? { grantOrgGone: true } : {}) });
  }
  if (props && props.personId) {
    const byProps = await withProfile((x) => db(env).prepare(
      "SELECT id, name, email, role, title, capture_mode, lane, org, key_hash, pass_hash" + x + " FROM people WHERE id = ? AND active = 1"
    ).bind(props.personId).first());
    if (byProps) {
      const { key_hash, pass_hash, ...who } = byProps;
      // G2 M1: a grant is bound to the credentials it was made with (src/oauthgrants.js credEpoch): a key rotation or a
      // passphrase change since refuses it here (no reader: the request is signed out). Sprint 7, 7.5b: a grant with NO stamp
      // (minted before G2: src/oauthgrants.js grantStampless) is refused too — it could never be checked (src/mcp.js callerOf
      // answers it with the re-connect words)
      if (props.cred !== await credEpoch({ key_hash, pass_hash })) return null;
      return signIn(env, { ...who, readOnly: false, viaOAuth: true, oauthScope: Array.isArray(props.scope) ? props.scope : [] });
    }
  }
  let person = await authenticate(request, env);
  let viaCookie = false;
  if (!person) {
    // ADR-056: the web session cookie — sprint 7 (7.4): only under an org's address, as the session's seat in that org
    // (authenticateSession); at the root (/mcp included) never
    person = await authenticateSession(sessionCookieToken(request), env);
    if (person) viaCookie = true;
  }
  // viaCookie (S-040 amend 5 §3): the shell's profile corner needs to know whether this reader has an actual session cookie
  // to clear — a bare Bearer header never set one, so GET /logout would clear nothing. Only a cookie-backed session gets a
  // working Logout; everything else hides/no-ops honestly (src/shell.js).
  if (person) return { ...person, readOnly: false, viaCookie };
  if (!readOnlyOk) return null;
  // the read-only credential, as a Bearer header (ADR-050), on a read-only route only
  const header = request.headers.get("authorization") || "";
  const bearerKey = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return bearerKey ? await resolveReadOnly(bearerKey, env) : null;
}

// A role may read its own capsule; the owner may read any. migrate-044: "its own" is any key the person reads by (src/hats.js
// readerKeys: their role, the typed role they held before the migration, and since migrate-045 the ACCESS hats their admin
// set), so a capsule or a roleVisibility list that named a typed role still admits the people who held it, and one that
// names a hat admits the people the admin gave it. A hat a person picked for themselves (people.hats) admits nothing.
export function mayRead(person, capsule) {
  return person.role === "owner" || readerKeys(person).has(capsule);
}

const BANNED_KEYS = ["transcript", "messages", "conversation", "chatlog", "history"];
// ADR-022: the ONE sanctioned conversation-text field. Consent + authorship:
// a person's own prompts, only inside a handoff THEY trigger, stored only in R2 for owner review.
// Everything else conversational stays a 422, forever.
const SANCTIONED_TEXT_FIELD = "authoredPrompts";

export function carriesTranscript(obj, depth = 0, allowAuthored = false) {
  if (!obj || typeof obj !== "object" || depth > 4) return false;
  for (const k of Object.keys(obj)) {
    // the sanctioned field passes ONLY at the top level of a handoff; anywhere else it is a transcript
    if (k === SANCTIONED_TEXT_FIELD) { if (allowAuthored && depth === 0) continue; return true; }
    if (BANNED_KEYS.includes(k.toLowerCase())) return true;
    if (carriesTranscript(obj[k], depth + 1, false)) return true;
  }
  return false;
}


// knowledgeAtOf(env) -> when the request's project's knowledge last changed (its newest preview then save_knowledge call's ledger row,
// hotsql.js KNOWLEDGE_AT_SQL), or null (nothing filed yet, or a read at the org level): the "as of" of `updates` and the
// heartbeat (Home reads the same inside its S1). One statement, memoized per request under "knowledge:".
export async function knowledgeAtOf(env) {
  const project = await projectOf(env);
  if (!project) return null;
  return reqMemo(env, `knowledge:${project}:at`, async () => ((await db(env).prepare(KNOWLEDGE_AT_SQL).bind(project).first()) || {}).at || null);
}

// heartbeatFor(person, env, opts) — opts.includeEval (W12, B7b): include the suites' rows (eval-marked payloads and the
// fixed eval seats' events). Absent -> by seat (util.js isEvalSeat): a real seat's feed never carries them.
// B7d S8: a seat the ORG declares as a test seat (its org row's settings.evalSeats: person ids or emails — a seed's
// eval seat, minted with a uuid id, is the case) counts as a suite seat here too, never by a name match.
export function declaredEvalSeats(tenant) {
  const list = tenant && Array.isArray(tenant.evalSeats) ? tenant.evalSeats : [];
  return [...new Set(list.map((x) => String(x || "").toLowerCase().trim()).filter(Boolean))].slice(0, 50);
}
export async function heartbeatFor(person, env, opts = {}) {
  let evalSeats = [];
  try { evalSeats = declaredEvalSeats(await getTenantConfig(env)); } catch { evalSeats = []; }
  const selfDeclared = evalSeats.includes(String((person && person.id) || "").toLowerCase()) || (person && person.email && evalSeats.includes(String(person.email).toLowerCase()));
  const includeEval = (opts && typeof opts.includeEval === "boolean") ? opts.includeEval : (isEvalSeat(person && person.id) || !!selfDeclared);

  // A missing lane must NOT mean "all" — a new seat would silently see everyone (audit).
      const lanes = (person.lane || "none").split(",").map((s) => s.trim());
  const all = lanes.includes("all");
  // "last here" = their most recent event of any kind, excluding this call
  const last = await db(env).prepare(
    "SELECT MAX(created_at) AS t FROM events WHERE person_id = ?"
  ).bind(person.id).first();
  const since = last?.t || "1970-01-01T00:00:00.000Z";

  // what landed across everyone since then — the brain moved, they were away
  // sprint 2 (the live budget): the statement lives in src/hotsql.js (HEARTBEAT_LANDED_SQL), EXPLAINed by tools/d1-hot-selftest.mjs
  // review fix 2c (sprint 2): a Partner reads only what landed in the projects they are seated on (the request's one seats
  // read), "elsewhere" counted from those alone; seated on none, nothing landed is read at all
  const partner = isPartnerReader(person);
  const fenced = partner ? (await seatsOnce(env, person.id)).map((x) => x.key).slice(0, 50) : [];
  const { results: landed } = partner && !fenced.length ? { results: [] } : await db(env).prepare(HEARTBEAT_LANDED_SQL(includeEval, evalSeats.length, fenced.length)
  ).bind(since, person.id, ...(includeEval || !evalSeats.length ? [] : [...evalSeats, ...evalSeats]), ...fenced).all();

  // a change is IN YOUR LANE if its author's lane overlaps yours, or it names your lane in touches
  const inLane = (r) => {
    if (all) return true;
    const t = (r.touches || "").toLowerCase();
    const bl = (r.by_lane || "").toLowerCase();
    return lanes.some((l) => l && (t.includes(l) || bl.includes(l)));
  };
  const mine = landed.filter(inLane);

  // #16 (readiness review, Wave 4): the badge count already excludes R's own mind/* namespace
  // from an owner's open loops (M-ADR-012 followup a — mind/* stays off ALL tenant
  // owner-glass); the heartbeat's own open items read this same shape but lacked the
  // guard, so it could surface a mind/* loop the /brief page would never show. Same
  // clause, so the two agree.
  const loops = await db(env).prepare(
    "SELECT id, title, opened_at, ref FROM loops WHERE person_id = ? AND status='open' AND (ref IS NULL OR ref NOT LIKE 'mind/%') ORDER BY opened_at"
  ).bind(person.id).all();

  // when the project's knowledge last changed; the blockers are the owner-owed open questions (ownerOwedOnce, QE6B9CEBA)
  const knowledgeAt = await knowledgeAtOf(env);

  const summarise = (r) => {
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch {}
    return { kind: r.kind, at: r.created_at, by: r.by_name,
             what: p.what || p.title || p.question || p.claim || p.summary || null,
             basis: r.basis || null, touches: r.touches || null };
  };

  
  const isOwner = person && person.role === "owner";
  return {
        note: "What moved while you were away. Silence here is a real answer — it means nothing in your lane changed. " +
              "`elsewhere` counts what moved in other lanes (not shown here).",
        you: { person: person.name, role: person.role, lane: person.lane || "all" },
        sinceYouWereLast: since === "1970-01-01T00:00:00.000Z" ? null : since,
        // when the project's knowledge last changed (its newest preview then save_knowledge), null when nothing is filed
        knowledgeAt,
        inYourLane: mine.slice(0, 12).map(summarise),
        elsewhere: all ? 0 : landed.length - mine.length,
        waitingOnYou: {
          openLoops: (loops.results || []).map((l) => ({ id: l.id, title: l.title, since: l.opened_at })),
          // W2 (B7b): [{id,title}] — a reader never gets a bare record slug. B7d S7d: the org's blockers wait on the OWNER;
          // any other seat gets [] here (they still read them, titled, under `updates`'s blockers). QE6B9CEBA: the set is the
          // open questions the ONE owedBy says the owner owes (ownerOwedOnce), following this read's own eval view
          blockers: isOwner ? await ownerOwedOnce(env, { includeEval }) : [],   // B1: updates' blockers draw no menu (owedBy reads no option)
        },
        doNotEnrich: [
          "anything the person has not committed to — half-formed thinking is not a decision",
          "work belonging to another client, project or employer",
          "credentials, keys, tokens, personal data",
          "conversation text — rejected at the door regardless",
          "restating what the project already holds; only the delta is worth transmitting",
        ],
      };
}


// tallyOr(tally, ledger) — sprint 2 (the live budget): a read off a migrate-042 tally, or, on a database that does not carry
// the tally yet ("no such table": a deploy that ran ahead of its migration, a local org not yet migrated), the ledger statement
// it replaced, so an identity door never 500s for want of a counter. Any other error propagates as before.
async function tallyOr(tally, ledger) {
  try { return await tally(); }
  catch (e) { if (/no such table/i.test(String(e && e.message || e))) return await ledger(); throw e; }
}

// whoamiFor(person, env) — the identity packet BOTH doors return (M-ADR-008a T10):
// GET /whoami and the MCP whoami tool call this ONE function, so the two can never drift
// on shape again. Carries standing consent (the person's own assistant should know it,
// M-ADR-006), lane, project seats (ADR-100), and the open-loop count — the union of what
// the two doors used to return separately (REST had consent-not-lane; MCP had lane-not-consent).
export async function whoamiFor(person, env) {
  // sprint 2: the loops_open tally, every ref (the ledger count before migrate-042)
  const loops = await tallyOr(() => db(env).prepare(LOOPS_OPEN_SQL(true)).bind(person.id).first(),
    () => db(env).prepare("SELECT COUNT(*) AS n FROM loops WHERE person_id = ? AND status = 'open'").bind(person.id).first());
  const seats = await seatsOnce(env, person.id);   // D9 (U-MCP): the request's one seats read
  // M-ADR-019: surface effective consent + whether a mandate is in force, so the person's
  // own assistant knows before it attaches a trace — mandated is never hidden.
  const cs = await consentStatus(person, env);
  // `email` (M-ADR-024): the address the person signs in with — their own identity answer
  // was missing the one field every door keys on. Same shape on REST and MCP (one function).
  // W1 (B7a, Q60CCC574): additive — the org, the project a write lands in by default, and one plain line each for
  // what the lane and consent words mean. Every field above stays byte-identical (L reads GET /whoami).
  let org = null, home = null, slug = null;
  try { const t = await getTenantConfig(env); org = (t.brand && t.brand.org) || null; home = homeProjectOf(t); slug = t.slug || null; } catch { org = null; home = null; }
  const lane = person.lane || "all";
  const keys = seats.map((s) => s.key);
  const ap = await activeProjectOf(person, seats, env);   // D4: a live stamp only (bytes unchanged for every live stamp)
  // the one-pass fix 9: where this person's writes can land — a seat's projects; the owner's, every active project of the org
  // (doorProject: the owner may name any active one); a seatless member's, the org's one active project when there is one.
  // The org's active keys are read only for a seatless caller (orgProjectsOnce, memoized; the same population doorProject and
  // the read scope use), so no seated person's whoami reads more than before. Never a project the caller could not write to.
  // (the owner: every active key, one bounded read of projects; orgProjectsOnce reads at most two, enough to say "one or more")
  const orgKeys = !keys.length ? (person.role === "owner" ? await reqMemo(env, "org-active-project-keys", async () => {
    try { return ((await db(env).prepare(ACTIVE_PROJECT_KEYS_SQL).all()).results || []).map((r) => String(r.key)); } catch (e) { if (isD1Quota(e)) throw e; return []; }
  }) : await orgProjectsOnce(env)) : [];
  const writeTo = person.role === "owner" && !keys.length ? orgKeys : keys.length ? keys : orgKeys.length === 1 ? orgKeys : [];
  // migrate-044 (additive): the person's hats (src/hats.js, set on /profile) and their role as the product names it;
  // migrate-045 (additive): accessHats, the hats their admin set, which the visibility rule reads (their own hats never)
  // sprint 7, 7.5a (additive): orgs — where this credential may act (whoamiOrgs)
  const reach = await whoamiOrgs(person, env, { slug, name: org });
  // sprint 8, 8.4 (additive; PLATFORM §4: "whoami answers the plan"): plan — the plan the checks apply and each limit with its usage
  // (src/plans.js planShownOf: ONE statement on the org's own ranges, the checks' own definitions)
  const plan = await whoamiPlan(person, env);
  return { id: person.id, person: person.name, email: person.email || null, role: person.role, lane,
           hats: hatsOf(person.hats), accessHats: hatsOf(person.access_hats), roleClass: roleClassOf(person.role),
           openItems: loops?.n ?? 0, projects: keys,
           consent: cs.effective, consentSelf: cs.personal, consentMandated: cs.mandated, consentFloor: cs.floor,
           org, activeProject: ap,
           writeProjects: writeTo,
           projectGloss: projectGloss(ap, keys, home, seatName(seats, home), { owner: person.role === "owner", orgKeys, activeName: seatName(seats, ap) }),
           laneGloss: laneGloss(lane), consentGloss: consentGloss(cs.effective, cs.mandated),
           orgs: reach.orgs, orgNote: reach.note, plan };
}
// whoamiPlan(person, env) -> whoami's plan: { plan, limits: { <limit>: { used, allowed, state } }, storage: { files, pictures },
// windows, note } (src/plans.js shownFrom). A Partner reads the plan and its limits, never the org's usage (review fix 2b: a
// Partner is never told the org's counts): limits { <limit>: { allowed } }, no storage. A read that fails answers null (whoami
// never fails for want of it); the D1 quota error is the platform's and is thrown on.
export async function whoamiPlan(person, env) {
  let shown;
  try { shown = await planShownOf(env); } catch (e) { if (isD1Quota(e)) throw e; return null; }
  if (!shown || roleClassOf(person.role) !== "partner") return shown || null;
  return { plan: shown.plan, limits: shown.limits && Object.fromEntries(Object.entries(shown.limits).map(([k, v]) => [k, { allowed: v.allowed }])), note: shown.note };
}
// ---- whoami's orgs (sprint 7, 7.5a; PLATFORM §2 items 8 and 9: "whoami lists the orgs and a call switches between them") ----
// accountOfReader(person) -> the account whose seats this credential may act as, or null: an ACCOUNT grant (OAuth, the account's
// passphrase proved it: grantAccount) or an ACCOUNT session's cookie (session_account, migrate-073). A bearer key, a SEAT grant,
// a SEAT session and a read-only credential name one seat: null.
export const accountOfReader = (person) => (person && (person.grantAccount || (person.viaCookie && person.session_account))) || null;
// ORG_ARG_WORDS — the one sentence that names the argument (src/index.js ORG_ARG: every tool's schema carries it)
export const ORG_ARG_WORDS = "orgSlug";
// whoamiOrgs(person, env, here) -> { orgs: [{ slug, name, role, current }], note }: an account's own orgs (src/accounts.js
// orgsOfAccount: its ACTIVE seats, one read, only for an account reader) with the one this request acts in marked current; any
// other credential its one org (no statement: the request's own org row). The note says how a call picks one.
export async function whoamiOrgs(person, env, here = {}) {
  const account = accountOfReader(person);
  const cur = here.slug || null;
  if (!account) {
    return { orgs: [{ slug: cur, name: here.name || cur, role: person.role, current: true }],
      note: `This connection is your seat in ${here.name || cur || "this org"}: it acts there only. To act in another org you belong to, connect by signing in with your account's passphrase.` };
  }
  const orgs = (await orgsOfAccount(env, account)).map((o) => ({ slug: o.slug, name: o.name, role: o.role, current: o.slug === cur }));
  return { orgs, note: person.grantAccount
    ? `This connection is your account's: it may act in each org listed, with your role there. Any call takes ${ORG_ARG_WORDS} (one of these slugs) to act in that org; left out, it acts in ${here.name || cur}.`
    : `Your session reaches each org listed; this page acts in ${here.name || cur}.` };
}

// activeProjectOf(person, seats, env) — the project a write lands in without naming one: the session's own LIVE stamp
// (liveStampOf, D4 — never the sync tokenProjectFor: an owner's stamp on an archived project is no longer active), else
// the one seat a single-seat person holds, else null (a multi-seat person names it). resolveProject, doorProject's reads,
// whoamiFor and stateSummaryFor all read it, so reads, writes and whoami agree.
export async function activeProjectOf(person, seats, env) {
  return (await liveStampOf(person, seats, env)) || (seats.length === 1 ? seats[0].key : null);
}
// PROJECT_RULE — B7e C2 (r109): THE one rule for `project`, in ONE sentence that every place a newcomer reads it
// renders verbatim: whoami's projectGloss (a multi-seat seat with none active) and start-here's "Which project" section. The door
// behaves as it says: doorProject fills one seat or the active project and refuses the rest with project_required.
export const PROJECT_RULE = "`project` says which of your projects a write belongs to. With one project, or an active one (`activeProject` in `whoami`), leave it out: it is filled in for you. With more than one and none active, name it on every write that files something (`preview`, `ask`, `wrap_up`, `respond`); without it the write answers `project_required` with your projects to pick from, and nothing is guessed.";
// seatName(seats, key) — the project's own name from the person's seats (projectSeatsFor's {key, name}, read from the
// projects table — never typed); null when the key is not one of the seats.
export function seatName(seats, key) {
  if (!key) return null;
  const s = (Array.isArray(seats) ? seats : []).find((x) => x && x.key === key);
  return s && s.name ? String(s.name) : null;
}
// NO_PROJECT_YET — THE first step of a brand-new org (D1b item 11), the one sentence whoami, holes, the MCP's first
// instructions and every empty state of a project-less org say: create the project, then preview and file into it
export const NO_PROJECT_YET = "This org holds no project yet. Create the first with create_project {key, name} (the admin), then fill it: `missing` with that project lists what it needs, each with the preview call that files it.";
// the one-line glosses (W1) — pure, so a selftest can pin them
// B7c: `home` (the org's declared home project, homeProjectOf) only feeds the org-note sentence, and only when seated.
// B7e C5: `homeName` (the projects table's name for it) rides along so the sentence names the key AND the name.
// sprint 13 (13.2): every project is named by its slug (src/project.js projectSlug: the door reads a slug inside the caller's org),
// never its org-prefixed key; `o.activeName` (the active project's seat name, when held) follows the slug when the two differ.
export function projectGloss(active, keys, home = null, homeName = null, o = {}) {
  if (active) { const s = projectSlug(active), n = o.activeName ? String(o.activeName).trim() : ""; return `Your writes land in "${s}"${n && n.toLowerCase() !== s ? ` (${n})` : ""} unless you name another \`project\`.`; }
  if (keys.length > 1) { const h = keys.includes(home) ? home : null; return `You hold seats on ${keys.length} projects (${keys.map(projectSlug).join(", ")}) and none is active. ${PROJECT_RULE} ${orgNoteDefault(h, keys, h ? homeName : null)}`; }
  // the one-pass fix 9: a person whose writes are stamped by role, not a seat — the owner — is told where they can land
  const org = Array.isArray(o.orgKeys) ? o.orgKeys.filter(Boolean) : [];
  if (o.owner && org.length === 1) return `You are the owner: your writes land in "${projectSlug(org[0])}", the org's one project, unless you name another \`project\`.`;
  if (o.owner && org.length > 1) return `You are the owner: your writes can land in any of the org's ${org.length} active projects (${org.map(projectSlug).join(", ")}); name it with \`project\` on every write that files something (a write that names none is refused project_required, never filed at the org level).`;
  // D1b item 11: a brand-new org is pointed at create_project, never comforted with an org-level record
  if (o.owner) return NO_PROJECT_YET;
  if (org.length === 1) return `You hold no project seat; your writes land in "${projectSlug(org[0])}", the org's one project.`;
  return "You hold no project seat — your writes are recorded at the org level.";
}
// orgNoteDefault(home, keys, homeName) — B7c, THE one source of the org-note sentence (whoami's projectGloss, the
// project_required note AND start-here's Which-project section all render it — B7d S1: start-here never promises a
// name the gloss cannot give). Pure, one line. It NAMES a default; nothing ever stamps it (ADR-100). Callers pass
// `home` only when the person holds a seat on it; with no home, any of the person's projects is fine (named when known).
// B7e C5: with `homeName` (read from the projects table by the caller, never typed) the key is followed by the
// project's own name — `"<key>" (<name> — the org's own project)`; a name equal to the key adds nothing.
export function orgNoteDefault(home, keys = [], homeName = null) {
  if (home) {
    const n = homeName ? String(homeName).trim() : "", h = projectSlug(home);   // sprint 13 (13.2): the slug, never the org-prefixed key
    return `A note about the org rather than one project goes under "${h}"` + (n && n.toLowerCase() !== h ? ` (${n} — the org's own project).` : ".");
  }
  const ks = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (ks.length > 1) return `A note about the org rather than one project: any of your projects (${ks.map(projectSlug).join(", ")}) is fine.`;
  return "A note about the org rather than one project: any of your projects is fine.";
}
// homeProjectOf(tenant) — the org's declared home project (its org row's `home`), lowercased; else null. Pure; no default
// is ever invented.
export function homeProjectOf(tenant) {
  return tenant && tenant.home ? String(tenant.home).toLowerCase().trim() : null;
}
// B7d S3: a non-"all" lane still says a plain note is lane "leader" — anyone may file one there (start-here's step 4).
export const LEADER_NOTE_LINE = "Anyone may file a plain note in lane \"leader\".";
export function laneGloss(lane) {
  const l = String(lane || "all");
  if (l === "all") return "Lane \"all\": `updates` shows you what changed in every lane.";
  return `Lane "${l}": \`updates\` shows you what changed in ${l} first; you can still file in any lane. ${LEADER_NOTE_LINE}`;
}
export function consentGloss(effective, mandated) {
  const tail = mandated ? " Your org sets this as the minimum for your role." : " Change it on /profile.";
  if (effective === "traces+prompts") return "Consent \"traces+prompts\": sharingu keeps what you file, the session traces you attach, and the prompts you share in a report." + tail;
  if (effective === "traces") return "Consent \"traces\": sharingu keeps what you file and the session traces you attach — never your prompts." + tail;
  return "Consent \"off\": sharingu keeps only what you file — no session traces, no prompts." + tail;
}

// briefCountFor(person, env) — the FELT LOOP nudge (Mission A,
// M-ADR-010). "What's waiting on YOU", actionable-only, computed on-load. briefCountFor is
// the cheap badge count (two COUNTs); the rows themselves are updates' `yours` (src/updates.js). v1
// covers: your open loops · (owner) transmissions awaiting your ruling — the read that
// replaced the web decide button (M-ADR-009) · (owner) the pack rows owed you (QE6B9CEBA). Answerable-questions and
// claimed-gaps are the v1.1 enrichment (they need the q/-ref open model).
// ownerOwedOnce(env, { includeEval }) -> [{id, title}] — U-MCP-tail Fork 1 (1), ruling QE6B9CEBA: what waits on the OWNER
// at every door (the heartbeat, `updates`, the thread brief and its badge) is the request's project's open questions the ONE
// owedBy (src/decisions.js) says the owner owes — the same set Home's Needs-you and Decisions' "Open: yours" show, titled by
// the row. It reads the open questions only and the live overlay (src/decisions.js ownerOwed), so a ruled question drops
// out at once. The reader is the owner ROLE, never the caller: a member's `updates` lists the owner's rows too. reqMemo'd per
// project + eval, so the badge and the brief on one request read it once. A failed read is [] (an honest empty); a D1
// quota error propagates. decisions.js imports FROM this module, so it is loaded lazily, never at module top level.
export async function ownerOwedOnce(env, { includeEval = false } = {}) {
  const scope = (await projectOf(env)) || "";
  return await reqMemo(env, "owner-owed:" + scope + ":" + (includeEval ? 1 : 0), async () => {
    const { ownerOwed } = await import("./decisions.js");
    return await ownerOwed(env, { includeEval });
  });
}

// clip(v, n) — B7d S7b: never cut mid-word. A text longer than n is cut at the last word boundary at or before n-1
// (a single over-long word falls back to the hard cut) and wears "…"; the result is at most n characters.
export const clip = (v, n) => {
  const t = v == null ? "" : String(v);
  if (t.length <= n) return t;
  const head = t.slice(0, n - 1);
  const at = /\s/.test(t.charAt(n - 1)) ? head.length : head.search(/\s\S*$/);
  return (at > 0 ? head.slice(0, at) : head).replace(/[\s,;:—-]+$/, "") + "…";
};
// projectRefOf(env, seats) -> {key, name} | null: the project a scoped env reads (src/project.js scopedProjectOf), by name —
// the caller's seat's name (the projects table), else the key itself. Never typed.
function projectRefOf(env, seats) {
  const key = scopedProjectOf(env);
  if (!key) return null;
  return { key, name: seatName(seats, key) || key };
}
// stateSummaryFor(person, env) — the project's picture inside `updates` (src/updates.js, D5): the org,
// the project the request reads (named), its aim (k_aim), when its knowledge last changed (asOf, ageDays), what blocks it (the
// owner-owed open questions, titled), the person's active project and own projects. The open items are heartbeatFor's.
export async function stateSummaryFor(person, env) {
  const project = await projectOf(env);
  const [asOf, seats, aim, blockers] = await Promise.all([
    knowledgeAtOf(env),
    seatsOnce(env, person.id),   // D9 (U-MCP): the request's one seats read
    // loaded on first use: the knowledge modules import this one
    project ? import("./knowledge/goals.js").then((m) => m.aimOf(env, project)) : Promise.resolve({ text: null, measure: null }),
    ownerOwedOnce(env),   // QE6B9CEBA: the owner-owed open questions, listed for every caller (B1: no menu drawn)
  ]);
  let org = null;
  try { org = ((await getTenantConfig(env)).brand || {}).org || null; } catch { org = null; }
  const t = asOf ? Date.parse(asOf) : NaN;
  return {
    org,
    // U-MCP D6 (Q0D506BBC, Q93B3F368): the project this read ANSWERED — the request's read scope (resolveProject, carried
    // on the env: src/project.js PROJECT), named {key, name} (the seat's name, else the key); null at the org root
    project: projectRefOf(env, seats),
    aim: aim && aim.text ? clip(aim.text, 240) : null,
    asOf,
    ageDays: Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 864e5)) : null,
    blockers,
    activeProject: await activeProjectOf(person, seats, env),   // D4: a live stamp only
    yourProjects: seats.slice(0, 8).map((seat) => ({ key: seat.key, name: seat.name || seat.key })),
    more: !project ? "This read is at the org level: name one of your projects with `project`."
      : !aim || !aim.text ? 'This project has no aim yet: file one through preview then save_knowledge, an item {kind: "aim", op: "upsert", data: {aim}}. `missing` lists everything it still needs.'
      : "`missing` lists what this project still needs.",
  };
}
// M-ADR-012: a tenant workspace's brief is WORKSPACE-SPECIFIC — scoped to the session's
// project, and EXCLUDING R's own namespace (mind/*). R's infra/updates/issues/next-steps
// belong to R's own brain + R's own needs-you page (the personal/local plane), not the org
// (cloud tenant) workspace. NOT_MIND is the reusable exclusion — two forms: NOT_MIND_TX for
// queries aliased `t` (M-ADR-012 followup (a): the
// exclusion now guards ALL tenant owner-glass — /brief, the owner queue, the orchestrator).
// UI-B4b: the one string lives in src/hotsql.js notMind(alias) (so the Build statements there use it without importing
// this module); this name stays the one every reader here imports.
export const NOT_MIND_TX = notMind("t");
export async function briefCountFor(person, env, includeEval = false) {
  // D7 (U-MCP-tail-b): the owner's pending rulings are read in the request's SCOPE (projectScopeOf: the seam's /
  // callTool's project; a multi-project org's null scope is the org-level rows only), never the raw session stamp —
  // the SAME clause updates' `yours` reads, so the badge equals the list
  const sc = await projectScopeOf(env);
  // build0925-home-latency: three independent counts, one parallel wave (they ran one after another)
  const [l, rulings, blockerList] = await Promise.all([
    // sprint 2: the open loops that are not R's own, off migrate-042's loops_open tally (one row), never the loops themselves
    tallyOr(() => db(env).prepare(LOOPS_OPEN_SQL(false)).bind(person.id).first(),
      () => db(env).prepare("SELECT COUNT(*) AS n FROM loops WHERE person_id=? AND status='open' AND (ref IS NULL OR ref NOT LIKE 'mind/%')").bind(person.id).first()),
    (async () => {
      if (person.role !== "owner") return 0;
      // sprint 2 (the live budget): the count updates' `yours` lists (route owner, not closed, R's own out, suites out unless asked, in
      // the scope), read off migrate-042's transmission_open tally: a few rows on its primary key, on every signed-in page,
      // never the queue itself (it walked every owner-routed filing of the org)
      const pc = projectClause(sc, "t.project");
      const r = await tallyOr(() => { const stmt = db(env).prepare(OWNER_OPEN_COUNT_SQL(sc && sc.filter, includeEval)); return (sc && sc.filter === "eq" ? stmt.bind(sc.project) : stmt).first(); },
        () => { const stmt = db(env).prepare("SELECT COUNT(*) AS n FROM transmission t WHERE " + (includeEval ? "" : "t.eval=0 AND ") + "t.route='owner' AND t.status != 'closed' AND " + NOT_MIND_TX + pc.sql);
          return (pc.args.length ? stmt.bind(...pc.args) : stmt).first(); });
      return r?.n ?? 0;
    })(),
    person.role === "owner" ? ownerOwedOnce(env, { includeEval }) : [],   // QE6B9CEBA: ONE set with updates' `yours`
  ]);
  return (l?.n ?? 0) + rulings + blockerList.length;
}

// tokenProjectFor(person, seats) — moved from index.js (door-true batch, QF9C8E14A) so
// the read-scoped functions below (artifactsListFor) share the
// SAME project-axis resolution the REST routes already used, instead of a second copy in
// mcp.js. The session stamp (tokens.project, set by the picker/switcher via POST
// /project), validated against the person's CURRENT seats so a revoked seat or archived
// project silently falls back instead of scoping to a project the person no longer holds.
// The owner's stamp is trusted against any active project (the org rollup ruling); an
// owner with NO stamp is the org view.
export function tokenProjectFor(person, seats) {
  const stamped = person && person.token_project ? String(person.token_project) : null;
  if (!stamped || stamped === "*") return null; // '*' = the org rollup was picked deliberately (owner)
  if (seats.some((s) => s.key === stamped)) return stamped;
  if (person.role === "owner") return stamped; // validated against projects at stamp time
  return null;
}

// transmissionOneFor(id, env, reader) — GET /contribution/:id's own read, lifted here for the
// `read` MCP tool (QF9C8E14A); the filing page reads it too. UI-B4a (Q0B546903): the row is
// returned to the owner (org-wide), to its submitter, to a seat holder on the row's project, and to every
// reader when the org has no project axis. The seat check rides the SAME one statement (src/hotsql.js
// TX_ONE_SQL + READER_SCOPE, so it costs no second D1 read), and a row outside the reader's scope answers
// EXACTLY like a missing id: {error:"not_found", id} (a 404, never a 403 that would say the row exists).
// No reader (a caller that forgot to pass one) sees nothing: the default is closed.
export async function transmissionOneFor(id, env, reader) {
  const clean = String(id || "").replace(/[^A-Za-z0-9-]/g, "");
  const owner = !!reader && reader.role === "owner";
  const rid = reader && reader.id ? String(reader.id) : "";
  if (!owner && !rid) return { error: "not_found", id: clean };
  const row = await (owner
    ? db(env).prepare(TX_ONE_SQL(false)).bind(clean)
    : db(env).prepare(TX_ONE_SQL(true)).bind(clean, rid, rid)   // the seat scope: submitter, a seat on the row's project, or no project axis
  ).first();
  if (!row) return { error: "not_found", id: clean };
  // D1b item 3: a knowledge write's stored tally and touches name every item it wrote; a reader who is not the owner reads
  // them cut to what they may read (src/extract.js knowledgeVisFor), and a write that named only hidden items is not_found
  if (!owner && String(row.kind) === "knowledge" && row.project) {
    const { knowledgeVisFor, knowledgeRowFor } = await import("./extract.js");   // loaded here: extract.js imports this module
    const v = knowledgeRowFor(row, await knowledgeVisFor(env, reader, String(row.project), [row]));
    if (!v) return { error: "not_found", id: clean };
    row.what = v.what; row.touches = v.touches;
  }
  // the opt-in session trace (ADR-084 §2, consent-gated by ADR-102) is shared with the owner, never with the
  // submitter's project peers: a seated reader who did not file the row does not get its trace artifact id
  if (!owner && row.submitter !== rid) delete row.trace;
  let grade = {}; try { grade = JSON.parse(row.grade || "{}"); } catch {}
  // the one-pass fix 5: a row graded before components were checked against the Map recorded "unavailable" (no served target to
  // check against): it reads as what it was, unchecked, never as a check the door claims to make
  if (grade && grade.componentKey === "unavailable") grade = { ...grade, componentKey: "unchecked", componentNote: "filed before components were checked against the project's Map" };
  // the shape's new fields (src/shapes.js; migrate-047): source, depends, open, next and the GTM four, each only when filed
  const { shape, ...rest } = row;
  return { ...rest, grade, ...decodeShape(shape) };
}

// filingFor(id, env, reader, { includeEval }) — the filing page's ONE read (UI-B4a, wf-filing): the row
// (transmissionOneFor, scoped to the reader) plus ONE counters statement (src/hotsql.js FILING_COUNTERS_SQL: every
// counter filed on it by parent, each with its STANDING_COUNTER flag, scoped the same way for a non-owner) — 2 D1
// statements in total, counted by tools/d1-hot-selftest.mjs section H. A row the reader may not see is the same
// not_found as a missing id, and no counters statement runs for it. Suite counters show when asked or when the
// filing itself is a suite row.
export async function filingFor(id, env, reader, { includeEval = false } = {}) {
  const one = await transmissionOneFor(id, env, reader);
  if (one.error) return one;
  const owner = reader.role === "owner";
  const withEval = !!includeEval || Number(one.eval) === 1;
  const rid = String(reader.id || "");
  const counters = ((await db(env).prepare(FILING_COUNTERS_SQL(withEval, !owner)).bind(...(owner ? [one.id] : [one.id, rid, rid])).all()).results) || [];
  return { ...one, counters, evalView: withEval };
}

// artifactsListFor(person, env, seats, { q, group, limit }) — the banked-artifact half of
// GET /artifacts' own D1 query (Files' data, ADR-089 §1), lifted here (door-true batch,
// QF9C8E14A) for the `read_file` MCP tool: an MCP-only owner could save_file and
// read one back by id (read_file) but never LIST them (GAP-mcp-rest-asymmetry).
// Scoped exactly like the REST route: the project axis (ADR-100 §7) + a non-owner sees
// group_tag='public' only. The intake-registry docs and the Finder bucket/issuer/type
// facets (src/pages.js, presentation-only) are NOT mirrored here — named, not hidden:
// this tool is the DATA half, not the Files page.
export async function artifactsListFor(person, env, seats, { q, group, limit } = {}) {
  const filesAp = tokenProjectFor(person, seats);
  const owner = person.role === "owner";
  // sprint 6 (6.2): the reader's org's files only (the owner's list too)
  const NOISE = "a.group_tag NOT IN ('eval','ungrouped','legacy-ungrouped') AND a.title NOT LIKE 'fragment %' AND a.org = {org}";
  const PROJ = filesAp ? " AND a.project = ?" : "";
  const GROUP = group ? " AND a.group_tag = ?" : "";
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
  const base = owner
    ? `SELECT a.id,a.title,a.group_tag,a.created_at,p.name AS by_name FROM artifacts a JOIN people p ON p.id=a.person_id WHERE ${NOISE}${PROJ}${GROUP}`
    : `SELECT a.id,a.title,a.group_tag,a.created_at,p.name AS by_name FROM artifacts a JOIN people p ON p.id=a.person_id WHERE a.group_tag='public' AND ${NOISE}${PROJ}${GROUP}`;
  const binds = [...(filesAp ? [filesAp] : []), ...(group ? [group] : [])];
  const sql = base + " ORDER BY a.created_at DESC LIMIT " + lim;
  const { results } = await (binds.length ? db(env).prepare(sql).bind(...binds) : db(env).prepare(sql)).all();
  let items = results.map((a) => ({ id: a.id, title: a.title, group: a.group_tag, by: a.by_name,
    at: a.created_at, public: a.group_tag === "public" }));
  if (q) { const needle = String(q).toLowerCase(); items = items.filter((d) => d.title.toLowerCase().includes(needle) || String(d.by || "").toLowerCase().includes(needle)); }
  return { count: items.length, items };
}

// bankArtifact — bank one file as an artifact (the one-mind PRD, WP8). The body POST /artifact always had,
// lifted here so the composer's send banks a file through the SAME seam: the consent floor for a trace
// (dropped below "traces", never stored — an honest note, not an error), the billing guard (R2 is the only
// paid service; refuse past 8 GB, well inside the free allowance), the hash, the R2 put under the month's
// inbox, the artifacts row, the fragment event (eval-marked when the caller is), and the improve note.
// Returns the receipt the route answers; an error carries `status` for the route to use.
export async function bankArtifact(person, env, { bytes, contentType, title, group, screens, states, isEval, origin }) {
  const ct = String(contentType || "application/octet-stream").split(";")[0];
  title = title || "untitled";
  // QE2D90B38: a filing must carry extracted meaning — which system-part this belongs to — never the
  // untagged sentinel. 'ungrouped' used to be silently assigned here; the schema's own CHECK
  // (boot.sql, migrate-035.sql) now refuses it outright, so refuse it here first with a clear note
  // instead of a raw SQLite constraint error.
  group = String(group || "").trim();
  if (!group || group === "ungrouped") {
    return { error: "group_required", status: 422,
             note: "Every artifact needs a group — which system-part this belongs to. 'ungrouped' is no longer accepted; name the stitch group." };
  }
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || new ArrayBuffer(0));
  if (u8.byteLength === 0) return { error: "empty", status: 422 };
  if (u8.byteLength > 5_000_000) return { error: "too_large", maxBytes: 5_000_000, status: 413 };
  if (group === "trace") {
    const consent = await effectiveConsent(person, env);
    if (CONSENT_RANK[consent] < CONSENT_RANK.traces) {
      return { stored: false, dropped: "trace", consent,
        note: "Session-trace artifact NOT stored — your standing consent is below 'traces'. Set it on /profile to bank traces." };
    }
  }
  // G2: the eval mark only on an eval project or from a test seat — refused before the body is stored
  if (isEval || group === "eval") { const er = await evalMarkRefused(person, await stampProjectLoose(person, env), env); if (er) return { ...er, status: 403 }; }
  // sprint 8, 8.2: the org's plan's storage limit (src/plans.js checkPlan: ONE covering sum of the org's files, where sprint 6's
  // 8 GB guard read the same sum): a file that would take the org past it is refused plan_limit before its body is stored (403);
  // past 80% it lands and the door's answer says so (src/plans.js PLAN_NOTE)
  const quota = await checkPlan(env, "storage_bytes", { add: u8.byteLength });
  if (quota.refusal) return { ...quota.refusal, status: 403 };
  const digest = await crypto.subtle.digest("SHA-256", u8);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const kindMap = { "text/html": "html", "image/png": "image", "image/jpeg": "image",
                    "image/svg+xml": "svg", "application/pdf": "pdf", "application/json": "json" };
  const kind = kindMap[ct] || "other";
  const ext = { html: "html", image: "png", svg: "svg", pdf: "pdf", json: "json", other: "bin" }[kind];
  const month = now().slice(0, 7);  // YYYY-MM — the inbox is a timeline, not a pile
  const key = artifactKey(month, person.id, hash, ext);   // the logical key (artifacts.r2_key); src/storage.js puts it under the writer's org
  await store(env).put(key, u8, { httpMetadata: { contentType: ct } });
  const id = uid();
  // screens/states arrive as the query's comma string (POST /artifact) or as arrays — one shape here
  const asList = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const st = asList(states);
  const artProject = await stampProjectLoose(person, env);
  // the join key, checked against the project's own Map — accepted either way, the screens it names kept
  const scr = await artifactScreens(env, artProject, asList(screens));
  await db(env).prepare(
    "INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,screens,states,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,{org})"
  ).bind(id, person.id, kind, title.slice(0, 200), key, hash, u8.byteLength, group, now(),
         scr.valid.join(",") || null, st.join(",") || null, artProject).run();
  await db(env).prepare(
    "INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})"
  ).bind(uid(), null, person.id, "fragment",
         JSON.stringify({ artifactId: id, kind, title, group, hash, bytes: u8.byteLength, ...(group === "eval" || isEval ? { eval: 1 } : {}) }), now()).run();
  const res = { id, kind, title, group, hash, bytes: u8.byteLength, stored: key, by: person.name,
                deeplink: orgUrl(origin || "", "/artifact/" + id),
                screens: scr.valid, states: st, binding: scr.ok };
  // never rejected — banked, graded, and told once what is missing
  if (!scr.list.length) res.improve = "No screen numbers. Which of 01-399 does this touch? Without the join key it cannot be tracked, synced or counted.";
  else if (scr.unknown.length) res.improve = `Not in the register: ${scr.unknown.join(", ")}. Valid space is 01-399 plus 41A and 100A.`;
  else if (scr.reserved.length) res.improve = `Reserved band, nothing is designed there yet: ${scr.reserved.join(", ")}.`;
  else if (!st.length) res.improve = "Consider sending the states too (?states=) — coverage counts screen x state, not screens.";
  return res;
}
