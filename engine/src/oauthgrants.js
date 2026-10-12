// src/oauthgrants.js — what an OAuth grant is bound to, and how a person's grants end (G2 M1, the independent review: a grant
// and its refresh token outlived rotate-key and rotate-my-key, so a thief who connected a client with a stolen key kept read
// and write after the "compromised-key path"). No top-level import of the provider (it imports `cloudflare:workers`, which
// plain Node selftests cannot load): revokeOAuthGrants loads it only when there is a grant store to clear.
//   · credEpoch(person) — the person's credentials as one short digest: sha256(key_hash ":" pass_hash), 16 hex. src/oauth.js
//     stamps it on a NEW grant's props; resolveReader (src/core.js) refuses a grant whose stamp no longer matches, so a key
//     rotation or a passphrase change ends every grant made before it, whatever the grant store holds;
//   · revokeOAuthGrants(env, personId, { seatOnly }) — lists the seat's grants in the provider's store (OAUTH_KV) and revokes
//     each (its access and refresh tokens go with it): the grants made before the stamp existed end too. Called by rotate-key,
//     set-password and remove-person (src/admin.js: its SEAT grants only) and by rotate-my-key and set-my-passphrase
//     (src/secrets.js: every seat of the account when the account's passphrase proved it, else that seat's seat grants);
//   · accountCred(account) — an ACCOUNT grant's stamp (sprint 7, 7.5a: the two grant kinds, below), and accountGrantStands — its
//     check, with the seat's grants epoch (sprint 8, 8.3a: an admin's reissue of a seat ends an account grant's reach into it).
import { sha256 } from "./util.js";

// THE provider's options (src/oauth.js buildEntry constructs the provider from these; revokeOAuthGrants reads the store with them)
// TOKEN LIFETIMES, stated (G2 M1): an access token lives an hour; a refresh token 30 days from the grant, never extended by a
// refresh (the provider caps it at the grant's expiry), and it is ONE-USE: every refresh issues a new one (the previous one is
// honoured once more for a retry). OAuth 2.1 (draft-ietf-oauth-v2-1 §4.3.1) leaves the lifetime to the server and asks a public
// client's refresh token to be sender-constrained or rotated: it is rotated. The provider's own default (0.10.3) is the same 30
// days; it is set here so a new provider version cannot change it silently (package.json takes "latest").
export const ACCESS_TOKEN_TTL_S = 3600;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 3600;
export const OAUTH_OPTIONS = {
  authorizeEndpoint: "/oauth/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["mcp:read", "mcp:write"],
  accessTokenTTL: ACCESS_TOKEN_TTL_S,
  refreshTokenTTL: REFRESH_TOKEN_TTL_S,
};

// ---- A GRANT WITH NO STAMP ENDS (sprint 7, 7.5b; PLATFORM §3, sprint 3's G2 row "OAuth grants made before sprint 3's fix carry
// no stamp") ----
// Every grant minted since G2 (e632fd8bc; on live from the sprint-3 ship, f78b12a8, 2026-10-04) carries cred: a seat grant
// credEpoch(seat) — never null, people.key_hash is NOT NULL — and an account grant accountCred(account) (7.5a). A grant whose
// props carry none was minted by the code before G2: it can never be checked against its person's credentials (a key rotated
// or a passphrase changed since would not end it, only revokeOAuthGrants's sweep of that person would). So it is REFUSED at
// the door (src/core.js resolveReader) and answered 401 invalid_token with the re-connect words below (src/mcp.js callerOf):
// the client connects again, and the new grant carries its stamp. Both 7.5a kinds pass: a seat grant {personId, scope, cred}
// and an account grant {personId, accountId, org, scope, cred}.
export const grantStampless = (props) => !!props && typeof props === "object" && !(typeof props.cred === "string" && props.cred);
export const STAMPLESS_WORDS = "This connection was made before sharingu bound connections to the credentials that made them, so it can no longer be checked. Connect again: sign in once more and the new connection works as before.";

export async function credEpoch(person) {
  if (!person || person.key_hash == null) return null;
  return (await sha256(`${person.key_hash}:${person.pass_hash || ""}`)).slice(0, 16);
}

// ---- THE TWO GRANT KINDS (sprint 7, 7.5a; PLATFORM §2 items 8 and 9: "the OAuth grant carries the person and the org") ----
// The OAuth sign-in proves what POST /login proves (src/accounts.js passphraseSignIn), and the grant records WHICH:
//   · a SEAT grant — the seat's OWN secret proved it (what its org's admin minted or set): props { personId, scope, cred:
//     credEpoch(seat) }. It names that seat, in its org, forever: it never reaches another org (7.1's law: what one org's admin
//     knows never opens another org). Its shape is the shape of every grant minted before this slice, so a client connected
//     before it is a seat grant, acting as that seat exactly as it did (the clients already connected land in ryuklabs).
//   · an ACCOUNT grant — the ACCOUNT's passphrase proved it (its holder's alone): props { personId, accountId, org, scope,
//     cred: accountCred(account) }. personId is the seat the sign-in chose (the grant store keys grants by it, so that seat's
//     rotate-key, set-password or removal ends the grant: never wider, at worst narrower) and org its org, the grant's CURRENT
//     org. Each request it may act in any org where the account holds an ACTIVE seat, as that seat with that seat's role
//     (src/accounts.js accountGrantSeat; a call names the org: src/mcp.js orgArgRefused) — never more than the account's own
//     seats. It ends when the ACCOUNT's passphrase changes (the stamp below), whatever any seat's secret does — and, since sprint
//     8's 8.3a (the sprint-7 review's C2), it stops acting in ONE seat when that seat's org's admin reissues it (rotate-key,
//     set-password: people.reissued_at, migrate-077, the seat's grants epoch): the stamp carries the moment the grant was made,
//     and a seat reissued at or after it refuses the grant (accountGrantStands). Its other seats act on, every session of the
//     account is untouched (the ONE revocation rule, src/accounts.js), and the holder's fresh sign-in (connecting again) makes a
//     grant that acts in the seat again.
// GRANT_KINDS — the words for each (the props' marker is accountId: present on an account grant only)
export const GRANT_KINDS = { seat: "seat", account: "account" };
export const grantKindOf = (props) => (props && typeof props === "object" && typeof props.accountId === "string" && props.accountId ? GRANT_KINDS.account : GRANT_KINDS.seat);
// accountDigest(account) — the ACCOUNT's passphrase as it stands (its hash and salt), one short digest, domain-separated from
// credEpoch's; null for an account with no passphrase (it can make no account grant)
export async function accountDigest(account) {
  if (!account || !account.pass_hash || !account.pass_salt) return null;
  return (await sha256(`account:${account.pass_hash}:${account.pass_salt}`)).slice(0, 16);
}
// accountCred(account, at) — a NEW account grant's stamp (src/oauth.js grantPropsOf): "<accountDigest>.<the moment it is made, ms
// since the epoch in base 36>" (8.3a: what the grant knew — the passphrase, and when). null for an account with no passphrase.
// A stamp minted before 8.3a is the digest alone (16 hex): it reads as made at 0, so it keeps acting in every seat never
// reissued and stops in a seat reissued since migrate-077.
export async function accountCred(account, at = Date.now()) {
  const d = await accountDigest(account);
  return d ? `${d}.${Math.max(0, Math.floor(Number(at) || 0)).toString(36)}` : null;
}
// stampedAt(cred) -> the moment an account stamp says its grant was made (ms; 0 for a stamp from before 8.3a, or no moment)
const stampedAt = (cred) => { const m = /^[0-9a-f]{16}\.([0-9a-z]{1,12})$/.exec(String(cred || "")); return m ? parseInt(m[1], 36) : 0; };
// accountGrantStands(cred, account, reissuedAt) -> true when an account grant stamped `cred` still acts in a seat: its digest is
// the account's passphrase as it stands (accountDigest), AND the seat (its grants epoch, people.reissued_at: NULL, never
// reissued) was not reissued at or after the grant was made. The refusal is the door's 401 invalid_token with the re-connect
// words (src/mcp.js callerOf): connecting again — a fresh sign-in — mints a stamp after the reissue.
export async function accountGrantStands(cred, account, reissuedAt) {
  const c = String(cred || ""), d = await accountDigest(account);
  if (!d || c.slice(0, 16) !== d || !(c.length === 16 || c[16] === ".")) return false;
  if (reissuedAt == null || reissuedAt === "") return true;
  const r = Date.parse(String(reissuedAt));
  return !Number.isFinite(r) ? false : stampedAt(c) > r;
}

// revokeOAuthGrants(env, personId, { seatOnly }) -> { revoked, error? }: every grant the store keys by that seat, revoked (a page of
// 100 at a time). seatOnly (sprint 7's review, B1: the one revocation rule, src/accounts.js): only its SEAT grants — an ACCOUNT
// grant keyed by the seat (metadata.grant "account", src/oauth.js) was made with the account's passphrase, never this seat's
// secret, so an admin's seat action leaves it (it stops acting there once the seat is removed); a grant from before 7.5a carries
// no kind and is a seat grant.
export async function revokeOAuthGrants(env, personId, { seatOnly = false } = {}) {
  if (!env || !env.OAUTH_KV || !personId) return { revoked: 0, skipped: "no grant store" };
  try {
    const { getOAuthApi } = await import("@cloudflare/workers-oauth-provider");
    const noop = { fetch: () => new Response("not found", { status: 404 }) };
    const api = getOAuthApi({ ...OAUTH_OPTIONS, apiRoute: "/mcp", apiHandler: noop, defaultHandler: noop }, env);
    let revoked = 0, cursor;
    for (let page = 0; page < 50; page++) {
      const l = await api.listUserGrants(String(personId), { limit: 100, ...(cursor ? { cursor } : {}) });
      for (const g of (l && l.items) || []) {
        if (seatOnly && g && g.metadata && g.metadata.grant === GRANT_KINDS.account) continue;
        await api.revokeGrant(g.id, String(personId)); revoked++;
      }
      if (!l || !l.cursor) break;
      cursor = l.cursor;
    }
    return { revoked };
  } catch (e) {
    return { revoked: 0, error: String((e && e.message) || e).slice(0, 200) };
  }
}
