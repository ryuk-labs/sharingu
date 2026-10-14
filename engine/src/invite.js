// src/invite.js — POST /signup with an org's invite link (sprint 12, slice 12.3; src/accounts.js THE INVITE LINK): the answer of
// the sign-up door when the request carries `via: "invite"` or an `invite` field. The router (src/index.js POST /signup) has
// already refused a cross-site form and spent the address's flood-filter budget (LOGIN_LIMIT, the one POST /login and POST
// /signup share) before it hands the body here. No statement here: the redemption is src/accounts.js redeemInvite, the session
// src/accounts.js openSession (the one mint POST /login uses).
//   inviteSignup({ request, env, url, body, isWeb }) -> the Response:
//     422 bad_invite {field: invite|passphrase|confirm} — before anything is read
//     401 invalid_invite — the ONE refusal (no such open link, used, expired, replaced, its seat removed or reissued): nothing written
//     409 account_stands — the email's account has its own passphrase or a seat in another org: nothing written; sign in and accept
//     200 / 302 — the account's passphrase set, the ACCOUNT session minted on the invited seat; a browser lands in the org
//     (/<its slug>), a JSON caller gets {account: "invited", signedIn, org, person, role, title, token, expiresAt, note}
// The token is never logged and never put in a URL: it arrived in the body, and only the form a wrong field re-renders holds it.
import { json } from "./util.js";
import { sessionSetCookie } from "./core.js";
import { getTenantConfig } from "./tenant.js";
import { redeemInvite, openSession, landingOf, clientOf } from "./accounts.js";
import { renderInvite, inviteProblem, INVITE_FIELD_WORDS, INVITE_REFUSED_WORDS, INVITE_STANDS_WORDS } from "./signup.js";

// every answer of the invite door, and the invite page itself (src/index.js GET /signup?via=invite), is never cached and sends no
// Referer (sprint 12's review: the token rides the fragment, which no Referer carries; the policy keeps the page's own address out
// of any request it makes as well)
export const INVITE_HEADERS = { "cache-control": "no-store", "referrer-policy": "same-origin" };   // the token rides the fragment (never in a Referer); same-origin keeps Origin for the form's same-origin check on browsers without Sec-Fetch-Site
const NO_STORE = INVITE_HEADERS;
// isInviteBody(body) -> true when a POST /signup body is an invite link's (the invite page's form sends via=invite)
export const isInviteBody = (body) => !!body && (body.via === "invite" || (body.invite != null && body.invite !== ""));

export async function inviteSignup({ request, env, url, body, isWeb }) {
  const page = async (status, error, invite = "") => new Response(renderInvite({ error, invite, brand: (await getTenantConfig(env)).brand }),
    { status, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } });
  const field = inviteProblem({ invite: body.invite, password: body.password, confirm: isWeb ? (body.confirm ?? "") : body.confirm });
  if (field) return isWeb ? page(422, INVITE_FIELD_WORDS[field], field === "invite" ? "" : body.invite)
    : json({ error: "bad_invite", field, note: INVITE_FIELD_WORDS[field] }, 422, NO_STORE);
  const r = await redeemInvite(env, url, { token: body.invite, password: body.password, client: await clientOf(request) });
  if (r.verdict === "account_stands") return isWeb ? page(409, INVITE_STANDS_WORDS) : json({ error: "account_stands", note: INVITE_STANDS_WORDS }, 409, NO_STORE);
  if (r.verdict !== "ok") return isWeb ? page(401, INVITE_REFUSED_WORDS) : json({ error: "invalid_invite", note: INVITE_REFUSED_WORDS }, 401, NO_STORE);
  // the passphrase is the account's now: its ACCOUNT session on the invited seat (a rotate landing meanwhile mints nothing:
  // LOGIN_SESSION_SQL's EXISTS — then signed up, not signed in)
  const opened = r.seat ? await openSession(env, r, { device: isWeb ? "web" : body.device || "unknown" }) : null;
  const token = opened ? opened.token : null, expires = opened ? opened.expires : null;
  if (isWeb) return token
    ? new Response(null, { status: 302, headers: { location: await landingOf(env, r), "set-cookie": sessionSetCookie(token), ...NO_STORE } })
    : new Response(null, { status: 302, headers: { location: "/login", ...NO_STORE } });
  return json({ account: "invited", signedIn: !!token, org: r.seat ? String(r.seat.org_slug || "") : null,
    ...(token ? { person: r.seat.name, role: r.seat.role, title: r.seat.title, token, expiresAt: expires } : {}),
    note: token ? "Joined and signed in. Save this token: send it as Authorization: Bearer <token>. It lasts 90 days." : "Joined. Sign in at /login with your email and the new passphrase." }, 200, NO_STORE);
}
