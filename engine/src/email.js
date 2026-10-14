// src/email.js — THE send (sprint 21, slice 21.4a; migrate-081's mail_days and mail_addresses; the owner's rulings of 2026-10-14):
// every email the worker or the operator's tool sends goes through sendMail, so ONE place counts them against THE CAP.
//
// THE CAP (the owner, 2026-10-14: "stay inside the 3,000" that Workers Paid includes each month): before each COUNTED send, one
// conditional upsert (MAIL_DAY_TAKE_SQL) adds it to today's row of mail_days only while the last MAIL_WINDOW_DAYS days (31: any
// billing month lies inside them) hold fewer than MAIL_CAP (2,900) — so no billing cycle passes 3,000 — and the send happens
// only when that row changed. D1 runs a statement at a time and a batch as one transaction, so two sends at once never both take
// the last unit. At the cap nothing is sent (the person's page says email checks are paused, src/accountpage.js) and the team is
// told ONCE a day (MAIL_ALERT_SQL: today's row's alerted flag, set by the first send the cap refuses).
// THE PER-ADDRESS LIMIT: a counted send to a person also takes one of MAIL_PER_ADDRESS_DAY (3) for that address today
// (mail_addresses, keyed by a digest of the address: no plain email in the table), FIRST, in the same batch, with this send's own
// nonce; the day's unit is taken only when that row carries the nonce, so a refused address never spends the cap (a bot hammering
// one address burns three a day, not the month). The operator's "You're in" is counted but not limited (perAddress false: no
// request of a stranger triggers it). Yesterday's address rows and the days before the window are deleted by the same batch.
// Sends to the team (counted false: the new request's alert, the cap's) are not counted — Cloudflare does not count verified
// destination addresses — and each is made once by its own trigger (a verification spends its link once; the cap's alert once a
// day).
//
// THE MAILER (the transport, never chosen by a caller's input): mailerOf(env) for the worker — the `send_email` binding EMAIL
// (wrangler.jsonc; env.EMAIL.send({ from, to, cc, subject, html, text })) on a deployment, or THE LOCAL CAPTURE when the config's
// MAIL_CAPTURE var says "kv" (only tools/lib-r-local.sh writes it, into every local config): each message is written to the
// worker's own OAUTH_KV under mail-capture:<when>:<id> and nothing leaves the machine (tools/mail-capture.mjs reads them;
// tools/operator.mjs --local writes its own there too). No binding and no capture: nothing is sent (reason no_mailer).
//   sendMail(env, mailer, { to, cc, counted, perAddress, at, build }) -> { sent: true } | { sent: false, reason[, code] }
//     env: the worker's (its statements on db(env), src/data.js), or the operator's { DB } (the deployment's own D1); build(): the
//     message ({ subject, html, text }), made only AFTER the units are taken (it may write the link the email carries: src/requestaccess.js, src/accounts.js), or null for
//     nothing to send. reason: no_mailer · address_limit · cap · nothing · send_failed (code: the binding's error code).
//   mailPaused(env, at) -> true when the window holds the cap already (the pages' "email checks are paused").
import { db } from "./data.js";
import { sha256, hex, now } from "./util.js";
import { capMail } from "./mails.js";

// every email is sent From hello@sharingu.xyz (the owner, 2026-10-14); a reply is forwarded by Cloudflare Email Routing
export const MAIL_FROM = { email: "hello@sharingu.xyz", name: "sharingu" };
// the team (both verified destination addresses on Cloudflare: free): a new verified request, the cap reached
export const TEAM_TO = "ryuk@ryuklabs.io";
export const TEAM_CC = "acie@ryuklabs.io";
export const MAIL_CAP = 2900;
export const MAIL_WINDOW_DAYS = 31;
export const MAIL_PER_ADDRESS_DAY = 3;
export const MAIL_CAPTURE_PREFIX = "mail-capture:";

// dayOf(at) -> the UTC day of an ISO time ("2026-10-14"); windowStartOf(at) -> the first day of the 31 that end with it
export const dayOf = (at) => String(at).slice(0, 10);
export const windowStartOf = (at) => new Date(Date.parse(`${dayOf(at)}T00:00:00.000Z`) - (MAIL_WINDOW_DAYS - 1) * 86400000).toISOString().slice(0, 10);
// addressDigest(address) -> what mail_addresses keys an address by (the address itself is kept nowhere here)
export const addressDigest = (address) => sha256(`sharingu-mail-address:v1:${String(address == null ? "" : address).toLowerCase().trim()}`);

// ---- the statements (exported for the selftests that run and plan them) ----
// the window's counted sends: ?1 its first day
export const MAIL_WINDOW_SQL = "SELECT COALESCE(SUM(n), 0) AS n FROM mail_days WHERE day >= ?1";
// the days before the window, and yesterday's address rows (?1 the window's first day; today)
export const MAIL_OLD_DAYS_SQL = "DELETE FROM mail_days WHERE day < ?1";
export const MAIL_OLD_ADDRESSES_SQL = "DELETE FROM mail_addresses WHERE day < ?1";
// the address's unit: ?1 today, ?2 its digest, ?3 this send's nonce, ?4 the limit — a new row, or one more while under the limit
export const MAIL_ADDRESS_TAKE_SQL = "INSERT INTO mail_addresses (day, address, n, nonce) VALUES (?1, ?2, 1, ?3) " +
  "ON CONFLICT (day, address) DO UPDATE SET n = mail_addresses.n + 1, nonce = excluded.nonce WHERE mail_addresses.n < ?4";
// the day's unit, only under the cap and (for a limited send) only when the address's row carries THIS send's nonce: ?1 today,
// ?2 the window's first day, ?3 the cap, ?4 the address's digest (NULL: not limited), ?5 the nonce
const UNDER_CAP = "(SELECT COALESCE(SUM(w.n), 0) FROM mail_days w WHERE w.day >= ?2) < ?3 " +
  "AND (?4 IS NULL OR EXISTS (SELECT 1 FROM mail_addresses m WHERE m.day = ?1 AND m.address = ?4 AND m.nonce = ?5))";
export const MAIL_DAY_TAKE_SQL = `INSERT INTO mail_days (day, n) SELECT ?1, 1 WHERE ${UNDER_CAP} ON CONFLICT (day) DO UPDATE SET n = mail_days.n + 1 WHERE ${UNDER_CAP}`;
// the cap's alert, once a day: the first refusal of the day sets today's flag (?1 today)
export const MAIL_ALERT_SQL = "INSERT INTO mail_days (day, n, alerted) VALUES (?1, 0, 1) ON CONFLICT (day) DO UPDATE SET alerted = 1 WHERE mail_days.alerted = 0";

const changed = (r) => ((r && r.meta && r.meta.changes) || 0) >= 1;

// mailerOf(env) -> the worker's transport (see THE MAILER), or null
export function mailerOf(env) {
  if (env && env.MAIL_CAPTURE === "kv") return env.OAUTH_KV ? captureMailer(env.OAUTH_KV) : null;
  if (env && env.EMAIL && typeof env.EMAIL.send === "function") return { kind: "binding", send: (m) => env.EMAIL.send(m) };
  return null;
}
// captureMailer(KV) -> the local capture: each message as JSON under mail-capture:<when>:<this isolate's count><id>, so the keys'
// own order is the order sent (two in one millisecond included)
let captured = 0;
export const captureMailer = (KV) => ({ kind: "capture", send: async (m) => {
  const at = now();
  await KV.put(`${MAIL_CAPTURE_PREFIX}${at}:${String(++captured).padStart(6, "0")}${hex(2)}`, JSON.stringify({ at, ...m }));
} });

export async function mailPaused(env, at = now()) {
  const row = await db(env).prepare(MAIL_WINDOW_SQL).bind(windowStartOf(at)).first();
  return Number((row && row.n) || 0) >= MAIL_CAP;
}

export async function sendMail(env, mailer, { to, cc = null, counted = true, perAddress = true, at = now(), build } = {}) {
  if (!mailer) return { sent: false, reason: "no_mailer" };
  if (counted) {
    const day = dayOf(at), start = windowStartOf(at), nonce = hex(8);
    const addr = perAddress ? await addressDigest(to) : null;
    const stmts = [db(env).prepare(MAIL_OLD_DAYS_SQL).bind(start), db(env).prepare(MAIL_OLD_ADDRESSES_SQL).bind(day)];
    if (addr) stmts.push(db(env).prepare(MAIL_ADDRESS_TAKE_SQL).bind(day, addr, nonce, MAIL_PER_ADDRESS_DAY));
    stmts.push(db(env).prepare(MAIL_DAY_TAKE_SQL).bind(day, start, MAIL_CAP, addr, addr ? nonce : null));
    const res = await db(env).batch(stmts);
    if (addr && !changed(res[2])) return { sent: false, reason: "address_limit" };
    if (!changed(res[res.length - 1])) {
      await alertCap(env, mailer, at);
      return { sent: false, reason: "cap" };
    }
  }
  const msg = await build();
  if (!msg) return { sent: false, reason: "nothing" };
  try {
    await mailer.send({ from: MAIL_FROM, to, ...(cc ? { cc } : {}), subject: msg.subject, html: msg.html, text: msg.text });
    return { sent: true };
  } catch (e) {
    console.warn("sendMail: the send failed", String((e && e.code) || ""), String((e && e.message) || e).slice(0, 200));
    return { sent: false, reason: "send_failed", code: String((e && e.code) || "") };
  }
}
// alertCap(env, mailer, at) — the team told once a day that the cap is reached (uncounted: a verified destination)
async function alertCap(env, mailer, at) {
  if (!changed(await db(env).prepare(MAIL_ALERT_SQL).bind(dayOf(at)).run())) return;
  const row = await db(env).prepare(MAIL_WINDOW_SQL).bind(windowStartOf(at)).first();
  await sendMail(env, mailer, { to: TEAM_TO, cc: TEAM_CC, counted: false, build: () => capMail({ total: Number((row && row.n) || 0), cap: MAIL_CAP, days: MAIL_WINDOW_DAYS }) });
}
