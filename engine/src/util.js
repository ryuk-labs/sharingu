// src/util.js — shared primitives (M-ADR-008a foundation): pure helpers with no domain
// or tenant knowledge, hoisted out of index.js so handler modules (reports.js, admin.js,
// …) import ONE copy instead of index.js re-owning them or passing them as deps. None of
// these are matched by the regex gate scripts (check-orphans reads `path === "..."` and
// `p:"..."`; check-mcp-parity reads `{ name:"..." }`), so centralizing them is gate-safe.

import { LANES } from "./lanes.js";

export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const text = (body, headers = {}) =>
  new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", ...headers } });

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

// hex(n) — a random hex string of n bytes (2n chars): session/key/salt material.
export const hex = (n) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// (The retired launcher's signing primitives — hmacHex · ctEq · ssoTokenValid · ssoCallSign/ssoCallValid ·
// the sso_nonce prune helpers — were deleted with it and its /sso/* routes, Q6FA72180, 2026-09-27; the
// sso_nonce table went with migrate-067, sprint 6.)

// crossSiteLogin(request, url) — the LOGIN-CSRF guard (heal round 1, QC74D4892 verifier finding,
// 2026-09-22): a browser POST to /login must come from THIS origin, or a cross-site form could
// sign the victim into the attacker's account (login-CSRF — the same class csrfRefused() below
// guards for an already-authenticated cookie WRITE, but csrfRefused() never fires here because no
// `person` exists yet at login time). Ported 2026-09-22 from the retired launcher's own former
// `crossSite()` (frame.js, deleted 2026-09-27, Q6FA72180). Same Sec-Fetch-Site-first, Origin-
// fallback shape as csrfRefused (scar 2026-09-08: under `referrer-policy: no-referrer` a browser's
// OWN form POST carries `Origin: null`, which is NOT cross-site — Sec-Fetch-Site, a forbidden
// header no script can forge, is authoritative whenever present). A script client (curl, the
// suites) sends neither header and is unaffected.
export function crossSiteLogin(request, url) {
  const sfs = request.headers.get("sec-fetch-site");
  if (sfs) return sfs !== "same-origin" && sfs !== "none";
  const o = request.headers.get("origin");
  return !!(o && o !== url.origin);
}

export async function pbkdf2(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Events the eval suite writes carry payload.eval=1 and are excluded from every measurement.
// isEvalMark(v) — the ONE reading of an eval marker on any door (body.eval · ?eval=1 · an MCP arg): true /
// 1 / "1" / "true". Scar 2026-09-06 (the residue audit): only transmissions and /event payloads carried the
// mark, so every suite handoff, fragment, boot-link session and MCP ruling stayed behind as a real-looking
// row (SIRU: 1,265 eval handoffs in the owner's inbox, ~2,500 orphan fragment events, 735 boot sessions;
// the leaderboard scanned all of it on every /home). Every door now stamps eval:1 into the event payload
// (and the artifact group / the handoff key) when the caller marks the row, and clean-eval removes it.
// isD1Quota(err) — Cloudflare's daily row-read limit (free tier), thrown by every D1 call once exceeded (moved here
// from src/index.js, UI-B2, so a route module can tell a quota error from any other failed read).
export function isD1Quota(e) { const m = String((e && e.message) || e || ""); return /row read limit|daily.*limit|code: 7500|\b7500\b/i.test(m); }
export const isEvalMark = (v) => v === true || v === 1 || v === "1" || v === "true";
// W12 (B7b, Q60CCC574): the suites' FIXED seats (tools/lib-mint-seat.sh MINT_RUN_PIDS: `eval-fixed-<role>`) author rows
// a day-1 person should never read as the org's news: a real seat's reads drop them unless it asks (eval=true). A
// fixed seat itself sees them by default, so a suite that reads another fixed seat's rows keeps working.
export const EVAL_SEAT_PREFIX = "eval-fixed-";
export const isEvalSeat = (personId) => String(personId || "").startsWith(EVAL_SEAT_PREFIX);
export const NOT_EVAL_SEAT_SQL = (col) => ` AND ${col} NOT LIKE '${EVAL_SEAT_PREFIX}%'`;
// evalView(arg, personId) — whether a read includes the suites' rows: an explicit eval arg wins either way
// (true -> include; false -> exclude, even for a fixed seat reading as a real one); absent -> by seat.
export const evalView = (arg, personId) =>
  (arg === undefined || arg === null || arg === "") ? isEvalSeat(personId) : isEvalMark(arg);

// TX_LANES (M-ADR-008a phase 2a) — the canonical lane KEYS, derived from src/lanes.js's
// LANES (Pass A shared-vocabulary de-dup) exactly as index.js used to compute it locally.
// Hoisted here because it is needed by BOTH src/core.js's door functions (fileTransmission /
// fileTransmissionsBatch) and index.js's callTool/router — a neutral module both import
// from, so core.js never has to import it from index.js (the cycle rule).
export const TX_LANES = LANES.map((l) => l.key);


// redirectToLogin(url, next?) — the ONE login redirect (moved from src/index.js for THE sign-in rule below; its history is
// in index.js beside its old home). `k` never rides along.
export function redirectToLogin(url, next) {
  // `k` never rides along (security review 2026-09-05, finding 5): a stale ?k= boot link that
  // fails the gate must not put the personal key into the Location header / login form / history.
  const q = new URLSearchParams(url.search || ""); q.delete("k");
  const qs = q.toString();
  const dest = next !== undefined ? next : (url.pathname.replace(/\/+$/, "") || "/") + (qs ? "?" + qs : "");
  return new Response(null, { status: 302, headers: { location: "/login?next=" + encodeURIComponent(dest) } });
}

// THE sign-in rule (D1b item 5; contracts/door.declared.json "signIn"): a caller no credential resolved for is answered by
// WHAT it is, never by which door it knocked on. A browser NAVIGATION (Sec-Fetch-Dest document, or Sec-Fetch-Mode navigate,
// or, from a client that sends neither, an Accept whose FIRST type is text/html) with no Authorization header is sent to
// sign-in (302 /login?next=…); anything else — a request that asks for JSON, carries a bearer header (a bad key is still a
// key: 401, never a page), or is a script/fetch — is refused 401 JSON. Every door that refuses a signed-out caller answers
// through signInOr401, so the 302-vs-401 choice is made here only.
export function isBrowserNavigation(request) {
  if (request.headers.get("authorization")) return false;
  const dest = request.headers.get("sec-fetch-dest");
  if (dest) return dest === "document";
  const mode = request.headers.get("sec-fetch-mode");
  if (mode) return mode === "navigate";
  return (request.headers.get("accept") || "").trim().toLowerCase().startsWith("text/html");
}
export const SIGN_IN_HINT = "Sign in, or send Authorization: Bearer <your key>.";
export function signInOr401(request, url, next, body) {
  if (isBrowserNavigation(request)) return redirectToLogin(url, next);
  return json(body || { error: "auth_required", hint: SIGN_IN_HINT }, 401, { "cache-control": "private, no-store" });
}

