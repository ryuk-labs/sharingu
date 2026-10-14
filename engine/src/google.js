// src/google.js — Google sign-in (sprint 21, slice 21.4c; the owner's MCQs of 2026-10-14: sign-up, sign-in and the connect page,
// matched by email, still behind the operator's approval; Google skips the verification email). The standard: OpenID Connect's
// authorization code flow with PKCE (S256), a single-use state and a nonce, and an id_token VERIFIED here (RS256 against Google's
// published keys) — only an email Google itself says it verified (email_verified === true) is ever matched. The routes are
// src/index.js /auth/google/…; the account side (the match by email, the subject linked, the join already verified) is
// src/accounts.js GOOGLE SIGN-IN; the button is src/googlepage.js.
//
// THE CLIENT (the deployment's, never an org's): {client_id, client_secret} under ONE key of the grant store's KV (OAUTH_KV:
// GOOGLE_CLIENT_KEY), written by the operator (tools/operator.mjs set-google-client --file <the mode-600 file>; clear-google-client)
// — the src/wellknown.js precedent: the worker reads no env secret. None stored: no button anywhere and every Google door refused.
// The worker reads it from KV with KV's own edge cache (CLIENT_CACHE_S: a clear takes hold within that minute).
// THE ORIGINS: the redirect URI is the request's origin + CALLBACK_PATH only on the two origins registered with Google
// (REGISTERED_ORIGINS); on any other origin (a workers.dev name, a preview) there is no button and no flow.
// THE STATE, the nonce and the PKCE verifier (STATE_MINUTES) live SERVER-SIDE, in KV under the state's sha256 (never the state
// itself), and the browser holds only the state, in a __Host- cookie (STATE_COOKIE: HttpOnly, Secure, SameSite=Lax — a top-level
// GET from Google carries it, a cross-site subrequest does not). Why both: the KV record keeps the verifier and the nonce off the
// browser (the code cannot be redeemed without the verifier, so a code leaked through a Referer or a log is worthless) and makes
// the state single-use (taken: read, then deleted); the cookie binds the flow to the browser that started it, so a callback URL
// carried into another browser (login CSRF: an attacker's own code and state planted on a victim) finds no cookie and is refused.
// KV's delete is eventually consistent across locations; a replay inside that window still needs this browser's cookie (cleared by
// the callback's answer) AND a code Google has not yet redeemed (one exchange each), so it gains nothing.
// THE ID TOKEN (verifyIdToken, pure): alg RS256 exactly (never none, never HS*: the key's type is RSA, the algorithm fixed here,
// never read from the token to pick a verifier), the kid one of the published keys, the signature, iss one of Google's two
// spellings, aud our client_id (an array must hold it and name it as azp), exp and iat within SKEW_S, the nonce this flow sent, a
// subject, and email_verified === true with an email.
// THE KEYS (jwksOf): Google's JWKS fetched and kept in KV for as long as its Cache-Control max-age says (held to 60 s .. a day),
// refetched once when a token names a kid the cached set lacks (a key rotation) — so a callback spends at most TWO fetches: the
// token endpoint, and the keys only when they are stale or rotated.
// THE LOCAL IdP (tests only): endpointsOf(env) is Google's constants, or — ONLY when the config's var GOOGLE_LOCAL_IDP names a
// loopback host and port (tools/lib-r-local.sh writes it into every local config; production's wrangler.jsonc never sets it, and
// tools/google-selftest.mjs proves both) — that origin's /authorize, /token and /jwks, its issuer the origin itself
// (tools/fake-google.mjs, the fake the smoke and the selftest run). Then a loopback origin may redirect too (the local worker's own).
// THE JOIN TICKET (JOIN_MINUTES): a Google identity with no account yet waits for its join form under a random ticket, in KV by
// the ticket's sha256, the ticket in a __Host- cookie (JOIN_COOKIE) — the form shows the email locked; its POST takes the email
// from the ticket, never from the form.
import { sha256, hex } from "./util.js";
import { normEmail, asciiEmail } from "./accounts.js";

export const START_PATH = "/auth/google/start";
export const CALLBACK_PATH = "/auth/google/callback";
// the KV keys (the OAuth provider keys its own records grant:, token:, client:, so none of these is its)
export const GOOGLE_CLIENT_KEY = "platform:google-client";
export const GOOGLE_JWKS_KEY = "platform:google-jwks";
const STATE_PREFIX = "google-state:";
const JOIN_PREFIX = "google-join:";
export const STATE_MINUTES = 10;
export const JOIN_MINUTES = 30;
export const CLIENT_CACHE_S = 60;
export const SKEW_S = 60;
export const STATE_COOKIE = "__Host-g_state";
export const JOIN_COOKIE = "__Host-g_join";
// Google's own endpoints (its discovery document, accounts.google.com/.well-known/openid-configuration)
export const GOOGLE = {
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  jwks: "https://www.googleapis.com/oauth2/v3/certs",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
};
export const REGISTERED_ORIGINS = ["https://agent.sharingu.xyz", "https://agent.ryuklabs.io"];
export const GOOGLE_INTENTS = ["join", "signin", "connect"];
export const SCOPE = "openid email profile";
// a stored client: Google's client id form, and a secret of printable ASCII
export const CLIENT_ID_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{5,180}\.apps\.googleusercontent\.com$/;
const SECRET_RE = /^[\x21-\x7e]{8,200}$/;

// clientProblem(c) -> "" (a client the worker may use) or why not (never the values themselves)
export function clientProblem(c) {
  if (!c || typeof c !== "object") return "no client";
  if (typeof c.client_id !== "string" || !CLIENT_ID_RE.test(c.client_id)) return "the client id is not a Google OAuth client id (<digits>-<id>.apps.googleusercontent.com)";
  if (typeof c.client_secret !== "string" || !SECRET_RE.test(c.client_secret)) return "the client secret is not 8 to 200 printable characters";
  return "";
}
// googleClient(env) -> { client_id, client_secret } | null (none stored, or what is stored is no client)
export async function googleClient(env) {
  if (!env || !env.OAUTH_KV) return null;
  const c = await env.OAUTH_KV.get(GOOGLE_CLIENT_KEY, { type: "json", cacheTtl: CLIENT_CACHE_S }).catch(() => null);
  return c && !clientProblem(c) ? { client_id: c.client_id, client_secret: c.client_secret } : null;
}
// localIdp(env) -> the local IdP's origin, http on a loopback host and port (the var holds "127.0.0.1:<port>" or "localhost:<port>"
// and nothing else), or "" — production never names one
export function localIdp(env) {
  const v = env && typeof env.GOOGLE_LOCAL_IDP === "string" ? env.GOOGLE_LOCAL_IDP : "";
  const m = /^(127\.0\.0\.1|localhost):([1-9][0-9]{1,4})$/.exec(v);
  return m && Number(m[2]) <= 65535 ? `http://${v}` : "";
}
// endpointsOf(env) -> { authorize, token, jwks, issuers }: Google's, or the local IdP's (localIdp)
export function endpointsOf(env) {
  const base = localIdp(env);
  return base ? { authorize: `${base}/authorize`, token: `${base}/token`, jwks: `${base}/jwks`, issuers: [base] } : GOOGLE;
}
// redirectUriFor(env, origin) -> the callback on a registered origin (with the local IdP, a loopback origin too), "" for any other
export function redirectUriFor(env, origin) {
  let u; try { u = new URL(String(origin)); } catch { return ""; }
  if (u.origin !== String(origin)) return "";
  const loop = !!localIdp(env) && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  return REGISTERED_ORIGINS.includes(u.origin) || loop ? u.origin + CALLBACK_PATH : "";
}
// googleOffer(env, origin) -> true when a page may show the button: a client stored, on an origin that may redirect
export async function googleOffer(env, origin) {
  return !!redirectUriFor(env, origin) && !!(await googleClient(env));
}

// ---- base64url and PKCE ----
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromB64url(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
// newVerifier() -> a PKCE verifier (32 random bytes: 43 characters); challengeOf(v) -> its S256 challenge
export const newVerifier = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const challengeOf = async (v) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(v)))));

// ---- the cookies ----
export const flowCookie = (name, value, seconds) => `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`;
export const clearCookie = (name) => `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
export function cookieOf(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name.replace(/[-]/g, "\\-") + "=([0-9a-f]{64})(?:;|$)"));
  return m ? m[1] : "";
}

// ---- THE STATE (server-side, single use) ----
// startFlow(env, rec) -> { state, url }: the record (intent, origin, and the intent's own: next, source, the connect request) with a
// fresh nonce and verifier kept under the state's hash for STATE_MINUTES; url: the authorization request to send the browser to
export async function startFlow(env, client, rec) {
  const ep = endpointsOf(env);
  const state = hex(32), nonce = hex(16), verifier = newVerifier();
  const exp = Date.now() + STATE_MINUTES * 60 * 1000;
  await env.OAUTH_KV.put(STATE_PREFIX + (await sha256(state)), JSON.stringify({ ...rec, nonce, verifier, exp }), { expirationTtl: STATE_MINUTES * 60 });
  const q = new URLSearchParams({ client_id: client.client_id, redirect_uri: rec.redirect, response_type: "code", scope: SCOPE, state, nonce,
    code_challenge: await challengeOf(verifier), code_challenge_method: "S256", prompt: "select_account" });
  return { state, url: `${ep.authorize}?${q}` };
}
// takeFlow(env, state) -> the flow's record, or null (none, used, expired); taken: it is deleted before it is answered
export async function takeFlow(env, state) {
  if (!/^[0-9a-f]{64}$/.test(String(state || ""))) return null;
  const key = STATE_PREFIX + (await sha256(String(state)));
  const raw = await env.OAUTH_KV.get(key);
  if (raw == null) return null;
  await env.OAUTH_KV.delete(key);
  let rec = null; try { rec = JSON.parse(raw); } catch { rec = null; }
  return rec && Number(rec.exp) > Date.now() ? rec : null;
}
// sameState(a, b) -> true when the callback's state is the cookie's (both 64 hex; compared by their digests, in one time)
export async function sameState(a, b) {
  if (!/^[0-9a-f]{64}$/.test(String(a || "")) || !/^[0-9a-f]{64}$/.test(String(b || ""))) return false;
  const [x, y] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

// ---- THE CODE, exchanged (one fetch) ----
// exchangeCode(env, client, { code, redirect, verifier }) -> { idToken } | { why }
export async function exchangeCode(env, client, { code, redirect, verifier }) {
  if (typeof code !== "string" || !code || code.length > 2048) return { why: "no_code" };
  const body = new URLSearchParams({ grant_type: "authorization_code", code, client_id: client.client_id, client_secret: client.client_secret, redirect_uri: redirect, code_verifier: verifier });
  let r;
  try { r = await fetch(endpointsOf(env).token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, signal: AbortSignal.timeout(10000) }); }
  catch { return { why: "token_unreachable" }; }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || typeof j.id_token !== "string") return { why: "token_refused" };
  return { idToken: j.id_token };
}

// ---- THE KEYS (cached in KV by their Cache-Control) ----
const maxAgeOf = (h) => { const m = /max-age=(\d+)/i.exec(String(h || "")); const n = m ? Number(m[1]) : 3600; return Math.min(86400, Math.max(60, n)); };
// jwksOf(env, { refresh }) -> { keys, fresh } (fresh: fetched by this call) | { keys: [] }
export async function jwksOf(env, { refresh = false } = {}) {
  const uri = endpointsOf(env).jwks;
  const kept = refresh ? null : await env.OAUTH_KV.get(GOOGLE_JWKS_KEY, { type: "json" }).catch(() => null);
  if (kept && kept.uri === uri && Array.isArray(kept.keys) && Number(kept.exp) > Date.now()) return { keys: kept.keys, fresh: false };
  let r;
  try { r = await fetch(uri, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) }); } catch { return { keys: [], fresh: true }; }
  const j = r.ok ? await r.json().catch(() => null) : null;
  const keys = j && Array.isArray(j.keys) ? j.keys.filter((k) => k && k.kty === "RSA" && typeof k.kid === "string" && typeof k.n === "string" && typeof k.e === "string") : [];
  if (keys.length) {
    const s = maxAgeOf(r.headers.get("cache-control"));
    await env.OAUTH_KV.put(GOOGLE_JWKS_KEY, JSON.stringify({ uri, keys, exp: Date.now() + s * 1000 }), { expirationTtl: s }).catch(() => {});
  }
  return { keys, fresh: true };
}

// ---- THE ID TOKEN, verified (pure: the keys, the client id, the nonce and the issuers given) ----
const part = (s) => { try { return JSON.parse(new TextDecoder().decode(fromB64url(s))); } catch { return null; } };
// verifyIdToken(token, { keys, clientId, nonce, issuers, now }) -> { ok: true, claims } | { ok: false, why } (why "kid": no key of the
// set names the token's kid — the caller refetches the keys once)
export async function verifyIdToken(token, { keys = [], clientId, nonce, issuers = GOOGLE.issuers, now = Date.now() } = {}) {
  const bits = typeof token === "string" ? token.split(".") : [];
  if (bits.length !== 3 || !bits.slice(0, 2).every((b) => /^[A-Za-z0-9_-]+$/.test(b))) return { ok: false, why: "shape" };
  const head = part(bits[0]), claims = part(bits[1]);
  if (!head || !claims || typeof head !== "object" || typeof claims !== "object") return { ok: false, why: "shape" };
  if (head.alg !== "RS256") return { ok: false, why: "alg" };
  if (!/^[A-Za-z0-9_-]+$/.test(bits[2])) return { ok: false, why: "signature" };
  const jwk = keys.find((k) => k && k.kid === head.kid && k.kty === "RSA" && (!k.alg || k.alg === "RS256") && (!k.use || k.use === "sig"));
  if (typeof head.kid !== "string" || !jwk) return { ok: false, why: "kid" };
  let good = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(bits[2]), new TextEncoder().encode(`${bits[0]}.${bits[1]}`));
  } catch { good = false; }
  if (!good) return { ok: false, why: "signature" };
  const t = Math.floor(now / 1000);
  if (!issuers.includes(claims.iss)) return { ok: false, why: "iss" };
  const aud = claims.aud;
  if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId) && claims.azp === clientId))) return { ok: false, why: "aud" };
  if (claims.azp != null && claims.azp !== clientId) return { ok: false, why: "aud" };
  if (!Number.isFinite(claims.exp) || claims.exp + SKEW_S < t) return { ok: false, why: "exp" };
  if (!Number.isFinite(claims.iat) || claims.iat - SKEW_S > t) return { ok: false, why: "iat" };
  if (typeof nonce !== "string" || !nonce || claims.nonce !== nonce) return { ok: false, why: "nonce" };
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) return { ok: false, why: "sub" };
  if (claims.email_verified !== true || typeof claims.email !== "string" || !claims.email) return { ok: false, why: "email_unverified" };
  return { ok: true, claims };
}
// identityOf(claims) -> { sub, email (the account's spelling), name (folded, 100 at most) }, or null for an email the platform does
// not take (not one plain ASCII address)
export function identityOf(claims) {
  const email = normEmail(claims && claims.email);
  if (!email || email.length > 254 || !asciiEmail(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = String((claims && typeof claims.name === "string" && claims.name) || "").replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 100);
  return { sub: String(claims.sub), email, name };
}
// verifiedIdentity(env, client, idToken, nonce) -> { identity } | { why }: the keys (cached, then refetched once on an unknown kid),
// the token verified, the identity read
export async function verifiedIdentity(env, client, idToken, nonce) {
  const ep = endpointsOf(env);
  let set = await jwksOf(env);
  let v = await verifyIdToken(idToken, { keys: set.keys, clientId: client.client_id, nonce, issuers: ep.issuers });
  if (!v.ok && v.why === "kid" && !set.fresh) { set = await jwksOf(env, { refresh: true }); v = await verifyIdToken(idToken, { keys: set.keys, clientId: client.client_id, nonce, issuers: ep.issuers }); }
  if (!v.ok) return { why: v.why };
  const identity = identityOf(v.claims);
  return identity ? { identity } : { why: "email_form" };
}

// ---- THE JOIN TICKET (a Google identity with no account, waiting for its form) ----
// putJoin(env, { sub, email, name, source }) -> the ticket (its hash the KV key, JOIN_MINUTES)
export async function putJoin(env, who) {
  const ticket = hex(32);
  const rec = { sub: String(who.sub), email: String(who.email), name: String(who.name || ""), source: String(who.source || ""), exp: Date.now() + JOIN_MINUTES * 60 * 1000 };
  await env.OAUTH_KV.put(JOIN_PREFIX + (await sha256(ticket)), JSON.stringify(rec), { expirationTtl: JOIN_MINUTES * 60 });
  return ticket;
}
// joinOf(env, ticket) -> the identity waiting, or null
export async function joinOf(env, ticket) {
  if (!/^[0-9a-f]{64}$/.test(String(ticket || "")) || !env || !env.OAUTH_KV) return null;
  const rec = await env.OAUTH_KV.get(JOIN_PREFIX + (await sha256(String(ticket))), { type: "json" }).catch(() => null);
  return rec && Number(rec.exp) > Date.now() && typeof rec.sub === "string" && typeof rec.email === "string" ? rec : null;
}
export async function dropJoin(env, ticket) {
  if (/^[0-9a-f]{64}$/.test(String(ticket || ""))) await env.OAUTH_KV.delete(JOIN_PREFIX + (await sha256(String(ticket)))).catch(() => {});
}
