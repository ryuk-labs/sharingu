// src/knowledge/fresh.js — stale by AGE (sprint 3, B4; docs/plan/MCP.md §9 demand 7): a card or a doc whose as-of date
// (asOf, migrate-047) is older than its kind's shelf life is "due for review". The shelf life is data with a default: a card
// kind may say reviewAfterDays (k_card_kinds.review_after_days, migrate-052; 1 to 3650), a doc and a card of a kind that says
// nothing take REVIEW_DAYS_DEFAULT. Computed on read from as_of, never stored: no trigger, no write. An item with no as-of
// date is never due (nothing says when it was true). Pure.
export const REVIEW_DAYS_DEFAULT = 90;
export const REVIEW_DAYS_MAX = 3650;
const DAY_MS = 864e5;
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// shelfOf(days) -> the shelf life in days (a kind's own, else the default)
export const shelfOf = (days) => (Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= REVIEW_DAYS_MAX ? Number(days) : REVIEW_DAYS_DEFAULT);
// dueOf(asOf, days, nowMs) -> null (no as-of date) | { due, dueOn, days }: dueOn is the day it falls due (asOf + days); due
// when that day is before today (UTC)
export function dueOf(asOf, days, nowMs = Date.now()) {
  if (!isDay(asOf)) return null;
  const d = shelfOf(days);
  const t = Date.parse(asOf + "T00:00:00Z");
  if (!Number.isFinite(t)) return null;
  const dueOn = new Date(t + d * DAY_MS).toISOString().slice(0, 10);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return { due: dueOn < today, dueOn, days: d };
}
// the SQL twin of dueOf, for the checklist's counts: as_of before (today - days), days the kind's own or the default
export const DUE_SQL = (asOf, days) => `(${asOf} < date('now', '-' || COALESCE(${days}, ${REVIEW_DAYS_DEFAULT}) || ' days'))`;
