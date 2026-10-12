// src/pickup.js — carry-forward (sprint 3, B4; docs/plan/MCP.md §9 demands 3 and 6): a person takes a contribution's next
// action (pick_up, its REST twin POST /contribution/:id/pick-up and the button on the contribution's page), and the
// follow-ups due (Home, GTM). The columns are migrate-053's, beside next_by and next_who on the contribution's own row: a
// pick-up, a done and a release each update that ONE row, never a new one, and file nothing on the ledger.
//
// THE RULES (authority-relevant; the selftest proves each, tools/impact-selftest.mjs):
//   · who may pick up: anyone who may read the contribution (the owner; its contributor; a reader seated on its project, an
//     org with no project axis: core.js READER_SCOPE, the read rule), and the person its next.who names (by
//     their id or their email) always, seated or not. Anyone else gets not_found, exactly as a missing id (the row's
//     existence is never said).
//   · the first pick-up holds: the write is conditional on nobody holding it, so two at once land one; the second is told who
//     has it (next_taken, with their name and when). Picking up what you already hold changes nothing.
//   · it is a lock on the NEXT ACTION only, never on the work: anyone may still file on the contribution.
//   · release: the contributor, the owner or the person who holds it; the date comes back to the follow-ups due.
//   · done: the person who holds it (or anyone who may pick it up, when nobody holds it: they pick it up and mark it done in
//     one write), with an optional note. A later contribution that names this one as its parent closes it too (the trigger
//     transmission_next_done, migrate-053; a counter, a critique, a rank, a knowledge row or a grade never does).
//   · a HANDOFF (the answer's handedOver) is a pick-up by someone other than the contributor: the activation event. Slice C counts the first and the
//     repeats in one indexed statement (HANDOFFS_SQL, idx_transmission_handoffs).
import { db } from "./data.js";
import { READER_SCOPE } from "./hotsql.js";
import { decodeShape } from "./shapes.js";
import { now } from "./util.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address

export const NOTE_MAX = 400;
const PICK_COLS = "t.id, t.project, t.submitter, t.shape, t.next_by, t.next_who, t.next_due, t.next_picked_by, t.next_picked_at, t.next_done_at, t.next_done_by, t.next_done_note, t.eval, t.lane, t.what, " +
  "pk.name AS picked_name, sb.name AS by_name, dn.name AS done_name";
// one contribution with its pick-up state; scoped (every non-owner) adds READER_SCOPE (binds: id, then reader id twice)
export const PICKUP_ROW_SQL = (scoped) => `SELECT ${PICK_COLS} FROM transmission t LEFT JOIN people pk ON pk.id = t.next_picked_by LEFT JOIN people sb ON sb.id = t.submitter ` +
  "LEFT JOIN people dn ON dn.id = t.next_done_by WHERE t.id = ? AND t.org = {org}" + (scoped ? " AND " + READER_SCOPE("t") : "");
export const PICK_SQL = "UPDATE transmission SET next_picked_by = ?1, next_picked_at = ?2, next_due = NULL WHERE id = ?3 AND org = {org} AND next_picked_by IS NULL AND next_done_at IS NULL";
export const DONE_SQL = "UPDATE transmission SET next_done_at = ?2, next_done_by = ?1, next_done_note = ?3, next_due = NULL, next_picked_by = COALESCE(next_picked_by, ?1), " +
  "next_picked_at = COALESCE(next_picked_at, ?2) WHERE id = ?4 AND org = {org} AND next_done_at IS NULL AND (next_picked_by IS NULL OR next_picked_by = ?1)";
export const RELEASE_SQL = "UPDATE transmission SET next_picked_by = NULL, next_picked_at = NULL, next_due = next_by WHERE id = ?1 AND org = {org} AND next_picked_by = ?2 AND next_done_at IS NULL";
// the activation measure (slice C): the first handoff and how many in one project, one range of the partial index
export const HANDOFFS_SQL = "SELECT MIN(next_picked_at) AS first_handoff, COUNT(*) AS handoffs FROM transmission INDEXED BY idx_transmission_handoffs " +
  "WHERE project = ?1 AND next_picked_by IS NOT NULL AND next_picked_by <> submitter AND +eval = 0";

const lc = (v) => String(v ?? "").trim().toLowerCase();
// namedWho(row, person) -> true when the contribution's next.who names this person (their id or their email)
export const namedWho = (row, person) => {
  const w = lc(row && row.next_who);
  return !!w && !!person && (w === lc(person.id) || (!!person.email && w === lc(person.email)));
};
// stateOf(row) -> the pick-up state of a row as the answers carry it
export function stateOf(r) {
  const sh = r.shape !== undefined ? decodeShape(r.shape) : { next: r.next };
  const next = sh.next && sh.next.what ? { what: sh.next.what, ...(sh.next.who ? { who: sh.next.who } : {}), ...(sh.next.by ? { by: sh.next.by } : {}) } : null;
  return {
    id: r.id, project: r.project ?? null, next,
    pickedUp: r.next_picked_by ? { by: { id: r.next_picked_by, name: r.picked_name || null }, at: r.next_picked_at || null } : null,
    handedOver: !!(r.next_picked_by && r.next_picked_by !== r.submitter),
    done: r.next_done_at ? { at: r.next_done_at, by: r.next_done_by || null, name: r.done_name || null, note: r.next_done_note || null, byContribution: /^T-\d{8}-\d+$/.test(String(r.next_done_by || "")) } : null,
  };
}
// readPick(env, person, id) -> the row, or null when the person may neither read it nor is named on it (the same not_found)
async function readPick(env, person, id) {
  const owner = person.role === "owner";
  const rid = String(person.id || "");
  const row = owner ? await db(env).prepare(PICKUP_ROW_SQL(false)).bind(id).first() : await db(env).prepare(PICKUP_ROW_SQL(true)).bind(id, rid, rid).first();
  if (row) return row;
  if (owner) return null;
  const named = await db(env).prepare(PICKUP_ROW_SQL(false)).bind(id).first();
  return named && namedWho(named, person) ? named : null;
}
// pickStateOf(env, row) -> stateOf for a row the caller already read (the contribution's page): the names of who picked it up
// and who marked it done, in ONE statement and only when one of them is set
// sprint 3 L3: and the person the next action names (next.who), when it is a person's id (an email or a free word stays as typed),
// in the SAME names statement (a page-only field, whoName: the pick_up tool's answer keeps its shape)
export async function pickStateOf(env, row) {
  const r = { ...(row || {}) };
  const sh = r.shape !== undefined ? decodeShape(r.shape) : { next: r.next };
  const whoId = sh && sh.next && sh.next.who && /^[A-Za-z0-9_-]{2,80}$/.test(String(sh.next.who)) ? String(sh.next.who) : null;
  const ids = [r.next_picked_by, /^T-/.test(String(r.next_done_by || "")) ? null : r.next_done_by, whoId].filter(Boolean);
  let whoName = null;
  if (ids.length) {
    const names = new Map((((await db(env).prepare("SELECT id, name FROM people WHERE id IN (SELECT value FROM json_each(?1)) AND org = {org}").bind(JSON.stringify(ids)).all()).results) || []).map((p) => [String(p.id), p.name]));
    r.picked_name = names.get(String(r.next_picked_by)) || null;
    r.done_name = names.get(String(r.next_done_by)) || null;
    whoName = whoId ? names.get(whoId) || null : null;
  }
  const st = stateOf(r);
  return whoName ? { ...st, whoName } : st;
}
const notFound = (id) => ({ error: "not_found", id, note: `No contribution "${id}" you may read. \`read {kind: "contribution"}\` or Build lists the ones you may read.` });

// pickUp(person, env, { id, done?, note?, release? }) -> stateOf(row) + { note } | a refusal. One row updated at most.
export async function pickUp(person, env, a = {}) {
  const id = String(a.id || "").trim().replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  if (!id) return { error: "id_required", note: "Send id: the contribution whose next action you take (T-YYYYMMDD-NNN)." };
  if (!person || !person.id) return notFound(id);
  const row = await readPick(env, person, id);
  if (!row) return notFound(id);
  const st = stateOf(row);
  if (!st.next) return { error: "no_next_action", id, note: `${id} names no next action, so there is nothing to pick up. A next action is filed with the contribution: next {what, who?, by?}.` };
  const me = String(person.id);
  const holder = row.next_picked_by ? String(row.next_picked_by) : null;
  const who = (r) => r.picked_name || r.next_picked_by;
  if (a.release === true || a.release === "true" || a.release === 1) {
    if (st.done) return { error: "next_done", id, done: st.done, note: `The next action of ${id} is done already (${st.done.at}); there is nothing to release.` };
    if (!holder) return { error: "not_picked_up", id, note: `Nobody holds the next action of ${id}, so there is nothing to release.` };
    if (!(holder === me || row.submitter === me || person.role === "owner")) return { error: "release_forbidden", id, pickedUp: st.pickedUp, note: `${who(row)} holds it. Only they, the contributor or the owner release it.` };
    const res = await db(env).prepare(RELEASE_SQL).bind(id, holder).run();
    const after = await readPick(env, { ...person, role: "owner" }, id);
    return { ...stateOf(after || row), released: !!(res && res.meta && res.meta.changes), note: `Released: the next action of ${id} is free for anyone to pick up again.` };
  }
  if (st.done) return { error: "next_done", id, done: st.done, note: `The next action of ${id} is done already (${st.done.at}${st.done.name ? `, by ${st.done.name}` : ""}).` };
  if (holder && holder !== me) return { error: "next_taken", id, pickedUp: st.pickedUp, note: `${who(row)} picked up the next action of ${id} first (${row.next_picked_at}). It is theirs until they mark it done or release it; the contribution itself stays open to anyone.` };
  const at = now();
  if (a.done === true || a.done === "true" || a.done === 1) {
    const note = a.note == null ? null : String(a.note).trim().slice(0, NOTE_MAX) || null;
    const res = await db(env).prepare(DONE_SQL).bind(me, at, note, id).run();
    const after = await readPick(env, { ...person, role: "owner" }, id);
    if (!(res && res.meta && res.meta.changes)) return refusedRace(after, id, me);
    return { ...stateOf(after), note: `Done: the next action of ${id} is marked done${note ? " with your note" : ""}.` };
  }
  if (holder === me) return { ...st, note: `You hold the next action of ${id} already (since ${row.next_picked_at}).` };
  const res = await db(env).prepare(PICK_SQL).bind(me, at, id).run();
  const after = await readPick(env, { ...person, role: "owner" }, id);
  if (!(res && res.meta && res.meta.changes)) return refusedRace(after, id, me);
  const s2 = stateOf(after);
  return { ...s2, note: s2.handedOver ? `Picked up: the next action of ${id} is yours, taken over from ${after.by_name || "its contributor"}.` : `Picked up: the next action of ${id} is yours.` };
}
// a pick-up that lost a race: someone else's write landed between the read and this one
function refusedRace(row, id, me) {
  if (!row) return notFound(id);
  const st = stateOf(row);
  if (st.done) return { error: "next_done", id, done: st.done, note: `The next action of ${id} was marked done a moment ago.` };
  if (row.next_picked_by && row.next_picked_by !== me) return { error: "next_taken", id, pickedUp: st.pickedUp, note: `${row.picked_name || row.next_picked_by} picked up the next action of ${id} a moment before you.` };
  return { ...st, note: "Nothing changed." };
}

// ---- the follow-ups due (Home, GTM) ----
// FOLLOWUPS_SQL(lane, includeEval, mine) — the open dated next actions of ONE project, soonest first: one range of
// idx_transmission_followups (only the rows still open: a pick-up or a done takes a row out of the index). mine adds the
// reader's own (next.who names their id or email): the same range, filtered. Each row's next.who, when it is a person's id,
// by name (one probe of people's primary key per row: at most 7). Binds: project, [id, email], limit.
export const FOLLOWUPS_SQL = (gtmOnly, includeEval, mine) =>
  "SELECT t.id, t.what, t.lane, t.next_due, t.next_who, t.shape, p.name AS by_name, w.name AS who_name FROM transmission t INDEXED BY idx_transmission_followups " +
  "LEFT JOIN people p ON p.id = t.submitter LEFT JOIN people w ON w.id = t.next_who AND w.org = {org} WHERE t.project = ?1 AND t.next_due IS NOT NULL" + (gtmOnly ? " AND lower(t.lane) = 'gtm'" : "") +
  (includeEval ? "" : " AND +t.eval = 0") + (mine ? " AND lower(t.next_who) IN (?2, ?3) ORDER BY t.next_due LIMIT ?4" : " ORDER BY t.next_due LIMIT ?2");
export const FOLLOWUPS_SHOWN = 6;

// followUpsFor(env, reader, { project, gtmOnly, includeEval, nowMs }) -> { rows: [{ id, next, what, who, by, overdue, mine,
// by_name, href }], more } — the reader's own first, then the rest by date, at most FOLLOWUPS_SHOWN. Two statements in one
// batch, each a bounded range of the partial index. No project: nothing (a Partner seated nowhere reads none).
export async function followUpsFor(env, reader, o = {}) {
  if (!o.project) return { rows: [], more: false };
  const id = lc(reader && reader.id), email = lc(reader && reader.email);
  const [mine, all] = await db(env).batch([
    db(env).prepare(FOLLOWUPS_SQL(!!o.gtmOnly, !!o.includeEval, true)).bind(o.project, id || "\u0000", email || "\u0000", FOLLOWUPS_SHOWN),
    db(env).prepare(FOLLOWUPS_SQL(!!o.gtmOnly, !!o.includeEval, false)).bind(o.project, FOLLOWUPS_SHOWN + 1),
  ]);
  const today = new Date(o.nowMs || Date.now()).toISOString().slice(0, 10);
  const seen = new Set(), out = [];
  const add = (r, isMine) => {
    if (seen.has(r.id) || out.length >= FOLLOWUPS_SHOWN) return;
    seen.add(r.id);
    const sh = decodeShape(r.shape);
    const row = { id: r.id, next: (sh.next && sh.next.what) || "", what: r.what || "", who: r.next_who || null, by: r.next_due, overdue: String(r.next_due) < today, mine: isMine,
      lane: r.lane || null, byName: r.by_name || null, href: orgPath(`/contribution/${encodeURIComponent(r.id)}?page=1`) };
    // sprint 3 L3: the person next.who names, by name, when it is a person's id (the people probe on its primary key, in the same
    // statement); not enumerable, so the home and gtm answers keep their shape
    if (r.who_name) Object.defineProperty(row, "whoName", { value: String(r.who_name) });
    out.push(row);
  };
  for (const r of (mine && mine.results) || []) add(r, true);
  const rest = (all && all.results) || [];
  for (const r of rest) add(r, namedWho({ next_who: r.next_who }, reader));
  return { rows: out, more: rest.length > FOLLOWUPS_SHOWN };
}
