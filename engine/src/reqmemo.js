// reqmemo.js — ONE D1 READ PER REQUEST for identity lookups that repeat within a request (build0925:d1-hot-queries).
// The 2026-09-25 D1 analytics named two per-request people reads among the top readers: the owner lookup
// (resolveOwner, src/tenant.js — 14 call sites in src/index.js, several on the same page) and the active-roster
// scan behind the read-only credential (resolveReadOnly, src/core.js — reached from the workspace seam AND again
// from the route's own resolveReader, so one request paid for it twice).
//
// The memo lives on the REQUEST's env under a Symbol, installed at workerHandler.fetch next to the timing
// accumulator. It is NEVER module-global and never outlives the request:
//   * a deactivated person's read-only token stops working on the very next request (an isolate-wide roster
//     cache would keep it alive for the TTL — a security regression, ruled out on purpose);
//   * a role/title change on /control is seen on the very next request (and clearReqMemo drops it within the
//     same request, right after the write);
//   * nothing is shared between tenants, even if two orgs ever shared an isolate.
// Object spread copies own Symbol keys, so the workspace seam's `{ ...env, BRAIN }` shares the same memo.
// No slot on env (the cron, a unit test that never installs one) = no memo: every call reads D1, exactly as before.
// A rejected read is never memoized — the next caller retries and this caller sees the original error.
import { readerOrg } from "./data.js";
export const REQ_MEMO = Symbol.for("sharingu.reqmemo");

// sprint 6 (6.2, PLATFORM.md §2 item 4: caches know the org): every memo is keyed by the request's org (src/data.js readerOrg,
// "-" before anyone signs in), so a read memoized for one org is never an answer for another, whatever its key was built from
// (a project key carries its org; an org-level read, "owner" or "org", does not). The sign-in's own lookups (signInMemo: the
// credential's people row, the read-only roster) are what FIND the org, so they are keyed by the credential alone.
const orgKey = (env, key) => `${readerOrg(env) ?? "-"}|${key}`;

export function installReqMemo(env) {
  if (env && typeof env === "object") env[REQ_MEMO] = new Map();
  return env;
}

export function reqMemo(env, key, fn) {
  return memo(env, orgKey(env, key), fn);
}
// signInMemo(env, key, fn) — reqMemo for a sign-in's own lookup (src/core.js authenticate, resolveReadOnly): keyed by the
// credential, never by the org it is about to find
export function signInMemo(env, key, fn) {
  return memo(env, "signin|" + key, fn);
}
function memo(env, key, fn) {
  const m = env && env[REQ_MEMO];
  if (!(m instanceof Map)) return fn();
  let p = m.get(key);
  if (!p) {
    p = Promise.resolve().then(fn);
    m.set(key, p);
    p.catch(() => { if (m.get(key) === p) m.delete(key); });
  }
  return p;
}

// clearReqMemo(env) — after a write to `people` inside the same request (a /control action), later reads in
// that request see the new rows.
export function clearReqMemo(env) {
  const m = env && env[REQ_MEMO];
  if (m instanceof Map) m.clear();
}

// forgetReqMemo(env, prefix) — drop only the memoized reads whose key starts with `prefix` (QE6B9CEBA, U-MCP-tail-a): after a
// write tool in a JSON-RPC batch, the next message in that batch re-reads the Decisions overlay ("decisions-live:") and the
// owner's blockers ("owner-owed:") instead of an answer from before the write. Every other memoized read is kept.
export function forgetReqMemo(env, prefix) {
  const m = env && env[REQ_MEMO];
  if (!(m instanceof Map)) return;
  const full = orgKey(env, prefix);
  for (const k of [...m.keys()]) if (typeof k === "string" && k.startsWith(full)) m.delete(k);
}

// reqMemoPeek(env, key) — the read already memoized under `key` in this request (its promise), or undefined; it never runs
// one. Sprint 2 (the live budget): the owner's blockers (src/decisions.js ownerOwed) reuse the whole Decisions overlay when
// the page already read it (Home, Decisions) and read only the open questions' answers when it did not (every other page).
export function reqMemoPeek(env, key) {
  const m = env && env[REQ_MEMO];
  return m instanceof Map ? m.get(orgKey(env, key)) : undefined;
}
