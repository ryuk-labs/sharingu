// src/openitems.js — a person's open items (the loops table: unfinished work they carry between sessions; a ref it names is a
// courtesy, never a lock). ONE function for the `open_items` tool and its REST twin POST /open-items (D5: the tool
// and its REST door ran the same SQL twice before), and the list `updates` shows under waitingOnYou.
import { db } from "./data.js";
import { normalizeRef } from "./core.js";
import { uid, now } from "./util.js";

export const OPEN_ITEM_TITLE_MAX = 400;
// the person's own open items, oldest first (R's own mind/* claims are never a reader's item)
export const OPEN_ITEMS_SQL = "SELECT id, title, opened_at, ref FROM loops WHERE person_id = ? AND status = 'open' AND (ref IS NULL OR ref NOT LIKE 'mind/%') ORDER BY opened_at";
export const listOpenItems = async (env, person) =>
  ((await db(env).prepare(OPEN_ITEMS_SQL).bind(person.id).all()).results || []).map((l) => ({ id: l.id, title: l.title, since: l.opened_at, ...(l.ref ? { ref: l.ref } : {}) }));

// openItems(person, env, a) -> { status, ...answer }: a = { title, ref?, close? }. close: closes the person's own item with that
// id (another person's id changes nothing); title: opens one. Either way the answer carries the person's open items after it.
// Refused: title_required (neither), ref_too_long.
export async function openItems(person, env, a = {}) {
  if (a.close) {
    await db(env).prepare("UPDATE loops SET status='closed', closed_at=? WHERE id=? AND person_id=?").bind(now(), String(a.close), person.id).run();
    return { status: 200, closed: String(a.close), openItems: await listOpenItems(env, person) };
  }
  if (!a.title) return { status: 422, error: "title_required", note: "Send title: what is unfinished, in a line (or close: an item's id)." };
  const rn = normalizeRef(a.ref ?? a.card);   // WP9: a card id is a ref
  if (rn.error) return { status: 422, error: rn.error, max: rn.max };
  const id = uid();
  await db(env).prepare("INSERT INTO loops (id, person_id, title, status, opened_at, ref, org) VALUES (?,?,?,'open',?,?,{org})")
    .bind(id, person.id, String(a.title).slice(0, OPEN_ITEM_TITLE_MAX), now(), rn.ref).run();
  return { status: 200, opened: id, title: String(a.title).slice(0, OPEN_ITEM_TITLE_MAX), ref: rn.ref, openItems: await listOpenItems(env, person) };
}
