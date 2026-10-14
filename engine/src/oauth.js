// OAuth 2.1 for claude.ai remote connectors (ADR-047).
// The provider handles the protocol; WE only prove who the person is — and that
// proof funnels into the same resolveReader as every other door (PRD §3.6).
//
// esc() now comes from src/ui.js (Pass B de-dup) — was byte-identical to the shared
// superset already. This file is imported straight into src/index.js (buildEntry) and
// bundled into the one worker artifact like everything else, so pulling esc() from
// ui.js changes nothing about how/when the OAuth surface is served.
import { db } from "./data.js";
import OAuthProvider, { getOAuthApi } from "@cloudflare/workers-oauth-provider";
import { errorState, esc, uchan } from "./ui.js";
import { sha256 } from "./util.js";
import { renderLogin, authPage, authBrand, orgChoiceHtml, ORG_CHOICE_CSS } from "./login.js";
import { getTenantConfig } from "./tenant.js";
import { passphraseSignIn, countSignIn, clientOf, NO_SEAT_HERE_WORDS, PENDING_ONLY_WORDS } from "./accounts.js";   // sprint 7, 7.1: the same sign-in as POST /login
import { OAUTH_OPTIONS, credEpoch, accountCred, grantKindOf } from "./oauthgrants.js";
import { grantClientOf, familyOfName } from "./client.js";   // sprint 13, 13.1: which AI filed it
import { frontAssetHref } from "./frontassets.js";   // sprint 21, 21.P: a known client's own logo on the connect page
import { googleOffer } from "./google.js";   // sprint 21, 21.4c: Continue with Google on the connect page
import { googleForm, GOOGLE_CSS } from "./googlepage.js";

const OAUTH_PATHS = ["/oauth/authorize", "/oauth/token", "/oauth/register"];

// grantPropsOf(signin, scope) -> the grant's props (src/oauthgrants.js, the two grant kinds), from passphraseSignIn's answer:
// session "account" (the ACCOUNT's passphrase) -> { personId: the chosen seat, accountId, org: that seat's org, scope, cred:
// accountCred }; session "seat" (a seat's own secret) -> { personId, scope, cred: credEpoch } — exactly the props of every
// grant before 7.5a (a seat grant never names an account, so it can never act as another seat).
// sprint 13, 13.1: clientName, the OAuth client's registered client_name (looked up once for the consent), adds `client`: its ONE
// family word (src/client.js familyOfName: claude, claude-code, chatgpt, codex), never the raw name, so each call stamps which AI
// filed a row without reading the client store. A name we do not know adds nothing (the call's clientInfo, else other). The
// name is the client's own say at registration: a label, never proof, and nothing decides a right on it.
// (sprint 21, 21.4c) Google's sign-in proves the account's holder as its passphrase does, so it makes the same ACCOUNT grant,
// stamped with the account's passphrase — and for an account that holds none (it signs in by Google alone: accountCred has nothing
// to stamp), a SEAT grant on the chosen seat, never wider.
export async function grantPropsOf(signin, scope, clientName = null) {
  const seat = signin.seat;
  const client = grantClientOf(clientName);
  if (signin.session === "account" && signin.account && signin.account.id && signin.account.pass_hash) {
    return { personId: seat.id, accountId: String(signin.account.id), org: Number(seat.org), scope, cred: await accountCred(signin.account), ...client };
  }
  return { personId: seat.id, scope, cred: await credEpoch(seat), ...client };
}

// The consent form IS the engine's sign-in page (M-ADR-024 "one front door"): same renderer,
// same palette, brand from the tenant seam — with the OAuth request riding as a hidden field
// and the scope statement as the footnote. This file used to carry its own page, its own
// teal palette, a hardcoded "Agent R" title and a byte-identical copy of util.pbkdf2.
const htmlRes = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
const SCOPE_NOTE = "It can never read another person's material, and it can never store conversation text.";
// G2 item 8 (the independent review: the consent named only the client's self-chosen name, never where the code goes)
// redirectAllowed(uri) — where a connection may send its code: an https address, or this computer (http on localhost,
// 127.0.0.1 or [::1], any port: Claude Code and other local clients, RFC 8252 §7.3). The MCP authorization spec (2025-06-18,
// "Communication Security") requires every redirect URI to be a localhost URL or an HTTPS URL; the provider (0.10.3) refuses
// only dangerous schemes (javascript:, data:, vbscript:, file:, mailto:, blob:), so this rule is ours, checked at registration
// (clientRegistrationCallback) and again at every sign-in (a client registered before the rule).
export function redirectAllowed(uri) {
  let u; try { u = new URL(String(uri)); } catch { return false; }
  if (u.protocol === "https:") return !!u.hostname;
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}
export const REDIRECT_REFUSED = "A connection may send you back only to an https address, or to this computer (http on localhost).";
// the scopes, in the words the consent shows
const SCOPE_WORDS = { "mcp:read": "read what your role may read", "mcp:write": "file your work" };
export function consentParts(req) {
  const name = String(req.clientName || "").trim().slice(0, 80);
  let host = "", full = "";
  try { const u = new URL(String(req.authRequest && req.authRequest.redirectUri)); host = u.host; full = u.href; } catch { host = ""; }
  const scopes = (Array.isArray(req.authRequest && req.authRequest.scope) ? req.authRequest.scope : []).map((x) => SCOPE_WORDS[x] || String(x).slice(0, 40));
  return { name, host, full, scopes };
}

// THE CONNECT PAGE'S HEAD (sprint 21, 21.P F23: calm and clear, still honest that the name is the client's own claim): a known
// client's logo beside U-chan ONLY when the code goes back to that client's own web host (the redirect's host, which the browser
// enforces; a name alone is anyone's to claim, so a client calling itself "Claude" with any other redirect gets a plain tile with
// its initial and its name in quotes, as its own words); then the heading and the one line saying whose words the name is.
// connectHead(name, host) -> { head, lede, sub }
// (chatgpt.png is the logo on its own white square: it fills its tile; claude.png, on clear ground, sits in it at its own 32px)
const CLIENT_LOGOS = { claude: "clients/claude.png", chatgpt: "clients/chatgpt.png" };
// each logo's own hosts: the code must go back to one of them (a loopback client, Claude Code or Codex, proves nothing: no logo)
const CLIENT_HOSTS = { claude: ["claude.ai", "claude.com"], chatgpt: ["chatgpt.com", "chat.openai.com"] };
export function connectHead(name, host = "") {
  const fam = familyOfName(name);
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "");
  const known = !!CLIENT_LOGOS[fam] && (CLIENT_HOSTS[fam] || []).includes(h);
  const logo = known ? CLIENT_LOGOS[fam] : "";
  const tile = logo ? `<span class="pair-tile pair-client" data-client-logo="${esc(logo)}"><img src="${frontAssetHref(logo)}" width="32" height="32" alt=""${/chatgpt/.test(logo) ? " data-fill" : ""}></span>`
    : `<span class="pair-tile pair-plain" aria-hidden="true">${esc((name || "?").slice(0, 1).toUpperCase())}</span>`;
  return {
    head: `<div class="pair" aria-hidden="true">${tile}<span class="pair-link"></span><span class="pair-tile pair-ours">${uchan({ size: 34 })}</span></div>`,
    lede: !name ? "Connect an app to sharingu" : known ? `Connect ${name} to sharingu` : `Connect “${name}” to sharingu`,
    sub: !name || known ? "" : `The app calls itself “${name}”: that name is its own claim.`,   // a known one: the footnote names its host
  };
}
const CONNECT_CSS = `
  .pair{display:flex;align-items:center;gap:0;margin:0 0 20px}
  .pair-tile{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border:1px solid var(--line);border-radius:14px;flex:none}
  .pair-client{background:var(--surface);overflow:hidden}
  .pair-client img[data-fill]{width:100%;height:100%;object-fit:cover}
  .pair-plain{background:var(--well);font:700 22px/1 var(--sans);color:var(--text)}
  .pair-ours{background:var(--accent-tint)}
  .pair-ours .u-uchan{width:31px;height:34px}
  .pair-link{width:36px;height:0;border-top:2px dashed var(--line-strong)}
  .lede-sub{margin:-14px 0 22px;font:400 13.5px/1.5 var(--sans);color:var(--text-muted)}
`;

// choose (sprint 7's review, A1): { email, orgs } — the account's passphrase proved an account in several orgs and the form named
// none: the form comes back with the email filled in and the orgs to choose from (the grant records the one chosen)
// req.origin (sprint 21, 21.4c): the request's origin — with a Google client stored for it (src/google.js googleOffer), the form
// carries Continue with Google under it (a same-origin POST to /auth/google/start: the authorize request rides it, as the
// passphrase form's oauth_req does)
// connectFoot(c) -> the footnote: where the code goes (the redirect's host, the whole address on hover) and what it asks for
const connectFoot = (c) => `<p data-region="oauth-request">It sends you back to <b data-redirect-host title="${esc(c.full)}">${esc(c.host || "an unknown address")}</b>, and asks to <span data-scopes>${esc(c.scopes.length ? c.scopes.join(" and ") : "read what your role may read")}</span>.</p><p>${esc(SCOPE_NOTE)}</p>`;
const oauthReqOf = (authRequest) => btoa(JSON.stringify(authRequest));
async function signInForm(env, req, err, choose = null) {
  const { brand } = await getTenantConfig(env);
  const c = consentParts(req);
  // the client's name is what it calls itself, never vouched for; where the code goes is the address's host (the whole address
  // on hover); what it asks for is its scopes
  const top = connectHead(c.name, c.host);
  const google = !choose && req.origin && (await googleOffer(env, req.origin)) ? googleForm([["intent", "connect"], ["oauth_req", oauthReqOf(req.authRequest)]]) : "";
  return htmlRes(renderLogin({
    error: err || "", brand, action: "", email: choose ? choose.email : "", orgChoice: choose ? choose.orgs : null,
    lede: choose ? "Your account holds seats in several orgs: choose the one this connection acts in, and sign in once more"
      : top.lede,
    sub: choose ? "" : top.sub, headHtml: top.head, css: CONNECT_CSS, googleHtml: google,
    hidden: [{ name: "oauth_req", value: oauthReqOf(req.authRequest) }],
    submit: "Sign in and connect",
    footnoteHtml: connectFoot(c),
  }), err ? 401 : 200);
}
// googleChoice(env, req, orgs) -> the connect page's org choice after Google proved an account in several orgs (or one with a seat
// waiting for its yes): the orgs as radios, then Continue with Google once more with the one chosen (the passphrase's twin, A1:
// never the oldest seat by default). Shown only to the person Google just proved.
async function googleChoice(env, req, orgs) {
  const { brand } = await getTenantConfig(env);
  const c = consentParts(req);
  const top = connectHead(c.name, c.host);
  return htmlRes(authPage({ ...authBrand(brand), here: "login", head: top.head,
    lede: "Your account holds seats in several orgs: choose the one this connection acts in, then continue with Google once more",
    body: googleForm([["intent", "connect"], ["oauth_req", oauthReqOf(req.authRequest)]], orgChoiceHtml(orgs)),
    footnote: connectFoot(c), css: CONNECT_CSS + ORG_CHOICE_CSS + GOOGLE_CSS }), 200);
}
// oauthApi(env) -> the provider's helpers outside its own request (the Google callback is the worker's route, not the provider's):
// the options buildEntry constructs it from (src/oauthgrants.js OAUTH_OPTIONS), as revokeOAuthGrants reads the store
export const oauthApi = (env) => getOAuthApi({ ...OAUTH_OPTIONS, apiRoute: "/mcp", apiHandler: NOOP, defaultHandler: NOOP }, env);
const NOOP = { fetch: () => new Response("Not found", { status: 404 }) };
// connectRequest(env, raw) -> { authRequest, clientName } | null: the connect page's authorize request as its form carried it, checked
// as the passphrase form's is (an allowed redirect) and its client registered — before Google is asked anything (the provider's
// completeAuthorization checks the redirect against the client's registration once more, at the end)
export async function connectRequest(env, raw) {
  let authRequest; try { authRequest = JSON.parse(atob(String(raw || ""))); } catch { return null; }
  if (!authRequest || typeof authRequest !== "object" || !redirectAllowed(authRequest.redirectUri) || typeof authRequest.clientId !== "string") return null;
  const client = await oauthApi(env).lookupClient(authRequest.clientId).catch(() => null);
  return client ? { authRequest, clientName: client.clientName } : null;
}
// connectByGoogle(env, { authRequest, clientName, signin, origin }) -> the connect page's answer once Google proved the account
// (src/accounts.js googleSignIn): the same rules as the passphrase's POST below — no seat, only seats waiting for a yes, several
// orgs (the choice, googleChoice) — then the authorization completed as that account (grantPropsOf) and the client sent its code
export async function connectByGoogle(env, { authRequest, clientName, signin, origin = "" }) {
  const req = { authRequest, clientName, origin };
  if (signin.verdict === "no_seat_here") return signInForm(env, req, NO_SEAT_HERE_WORDS);
  if (signin.verdict === "ok" && signin.pendingOnly) { await countSignIn(env, signin, true); return signInForm(env, req, PENDING_ONLY_WORDS); }
  if (signin.verdict === "ok" && (signin.ask || signin.waits || signin.pickMissed)) { await countSignIn(env, signin, true); return googleChoice(env, req, signin.orgs || []); }
  const person = signin.verdict === "ok" ? signin.seat : null;
  await countSignIn(env, signin, !!person);
  if (!person) return signInForm(env, req, "That Google account did not sign in.");
  const grant = await grantPropsOf(signin, authRequest.scope, clientName);
  let done;
  try { done = await oauthApi(env).completeAuthorization({ request: authRequest, userId: person.id, scope: authRequest.scope,
    metadata: { name: person.name, connectedAt: new Date().toISOString(), grant: grantKindOf(grant) }, props: grant }); }
  catch { return errorPage(env, REDIRECT_REFUSED, 400); }   // the redirect is not one the client registered: no code goes anywhere
  return Response.redirect(done.redirectTo, 302);
}

async function errorPage(env, msg, status) {
  const { brand } = await getTenantConfig(env);
  // the same front-door name as the sign-in (authBrand: sharingu, the org as secondary text) and the ERROR pattern
  return htmlRes(authPage({ ...authBrand(brand), banner: errorState({ what: msg }) }), status);
}

export const oauthDefaultHandler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/oauth/authorize") {
      return new Response("Not found", { status: 404 });
    }
    const helpers = env.OAUTH_PROVIDER;

    if (request.method === "GET") {
      let authRequest, client = null;
      try {
        authRequest = await helpers.parseAuthRequest(request);
        client = await helpers.lookupClient(authRequest.clientId);
      } catch (e) {
        return errorPage(env, "That connection request is not valid.", 400);
      }
      if (!redirectAllowed(authRequest.redirectUri)) return errorPage(env, REDIRECT_REFUSED, 400);
      return signInForm(env, { authRequest, clientName: client?.clientName, origin: url.origin }, null);
    }

    if (request.method === "POST") {
      const form = await request.formData();
      let authRequest;
      try { authRequest = JSON.parse(atob(String(form.get("oauth_req") || ""))); }
      catch { return errorPage(env, "That request expired. Start again.", 400); }
      if (!authRequest || !redirectAllowed(authRequest.redirectUri)) return errorPage(env, REDIRECT_REFUSED, 400);

      // sprint 7 (7.1): the SAME sign-in as POST /login (src/accounts.js passphraseSignIn): the account the email names, its
      // lockout (8 failures in 15 minutes on the account), then its seat (an account in one org: that one; in several: the one the
      // person chose on this form, below). A seat's
      // own secret makes a SEAT grant (that seat, never a seat of another org); the account's passphrase an ACCOUNT grant (7.5a:
      // the account's own active seats, one org a call: grantPropsOf below)
      const clientName = (await helpers.lookupClient(authRequest.clientId).catch(() => null))?.clientName;
      // the review's A1: the org a connection acts in is the person's own choice — an account in several orgs is asked (the form
      // comes back with its orgs; `org` names the one chosen), never given its oldest seat
      const signin = await passphraseSignIn(env, url, { email: form.get("email"), password: form.get("password"), pick: String(form.get("org") || ""), client: await clientOf(request) });   // 8.3a: the lockout's key
      if (signin.verdict === "locked") return signInForm(env, { authRequest, clientName, origin: url.origin }, "Too many attempts. Try again in 15 minutes.");
      if (signin.verdict === "no_seat_here") return signInForm(env, { authRequest, clientName, origin: url.origin }, NO_SEAT_HERE_WORDS);
      if (signin.verdict === "ok" && signin.pendingOnly) { await countSignIn(env, signin, true); return signInForm(env, { authRequest, clientName, origin: url.origin }, PENDING_ONLY_WORDS); }
      // the owner's ruling (2026-10-09, with the squat residual's close): a seat WAITING for the holder's yes makes this
      // form ask too — the connection never defaults into the one active seat while another waits (signin.waits, as the
      // JSON sign-in's 409 choose_org; naming the org still connects)
      if (signin.verdict === "ok" && (signin.ask || signin.pickMissed || signin.waits)) {
        await countSignIn(env, signin, true);   // the passphrase was right: nothing is granted until the person names the org
        return signInForm(env, { authRequest, clientName, origin: url.origin }, "", { email: signin.email, orgs: signin.orgs || [] });
      }
      const person = signin.verdict === "ok" ? signin.seat : null;
      await countSignIn(env, signin, !!person);   // the org the address serves, on the account (sprint 7: the org in the address, 7.4)
      if (!person) return signInForm(env, { authRequest, clientName, origin: url.origin }, "That email and passphrase do not match.");

      // props travel encrypted inside the access token and land on every API request.
      // The id — the person is re-read from D1 each time, so a role change takes effect at once —
      // PLUS the requested-and-consented scope (authRequest.scope, a string[] per the provider's
      // AuthRequest type), so a read-only grant is representable all the way to callTool(), not
      // just at this one line. Without this, mcp:read was advertised but never actually enforced.
      // sprint 7, 7.5a: the grant records WHAT the sign-in proved (src/oauthgrants.js, the two grant kinds): the ACCOUNT's
      // passphrase -> an ACCOUNT grant (the account, its chosen seat and that seat's org as the grant's current org, stamped with
      // the account's passphrase); a seat's OWN secret -> a SEAT grant (that seat alone, stamped with its credentials: the shape
      // of every grant before this slice)
      const props = await grantPropsOf(signin, authRequest.scope, clientName);
      const { redirectTo } = await helpers.completeAuthorization({
        request: authRequest,
        userId: person.id,
        scope: authRequest.scope,
        metadata: { name: person.name, connectedAt: new Date().toISOString(), grant: grantKindOf(props) },
        // cred (G2 M1): the credentials as they stand now (credEpoch: the seat's; accountCred: the account's passphrase); a
        // change moves it, and resolveReader then refuses this grant's every token
        props,
      });
      return Response.redirect(redirectTo, 302);
    }
    return new Response("Method not allowed", { status: 405 });
  },
};

// Wrap the worker: OAuth owns /mcp and /oauth/*; everything else is untouched,
// and `scheduled` survives because we keep our own entry object.
export function buildEntry(worker) {
  const provider = new OAuthProvider({
    ...OAUTH_OPTIONS,   // the endpoints, the scopes and the token lifetimes (src/oauthgrants.js states them)
    // G2 item 8: a client registers only redirect URIs a code may go to (redirectAllowed): RFC 7591 invalid_redirect_uri
    clientRegistrationCallback: ({ clientMetadata }) => {
      const uris = clientMetadata && clientMetadata.redirect_uris;
      if (!Array.isArray(uris) || !uris.length || uris.some((u) => !redirectAllowed(u))) return { code: "invalid_redirect_uri", description: REDIRECT_REFUSED, status: 400 };
      return undefined;
    },
    apiRoute: "/mcp",
    apiHandler: { fetch: (req, env, ctx) => worker.fetch(req, env, ctx) },
    defaultHandler: oauthDefaultHandler,
    // RFC8707 audience binding stays on the library's DERIVED per-host default —
    // deliberately (ADR-076). Declaring a canonical resourceMetadata.resource was
    // tried 2026-08-31 and 401'd every real caller ("Token audience does not match
    // resource server", measured M17/M18): a worker can be reached on more than one
    // host (workers.dev and a custom domain) — a single declared resource cannot match both.
    // Revisit ONLY when one canonical MCP origin is ruled and live.
  });
  return {
    async fetch(request, env, ctx) {
      const p = new URL(request.url).pathname;
      const isOAuth = OAUTH_PATHS.includes(p) || p.startsWith("/.well-known/oauth");
      // /mcp keeps working with a plain bearer too — Claude Code has no OAuth flow.
      if (isOAuth) return provider.fetch(request, env, ctx);
      if (p === "/mcp") {
        // Ours-vs-OAuth discrimination by LOOKUP, not prefix (owner ruling 2026-09-03:
        // keys mint bare — no org-looking prefix). A bearer whose hash matches a minted
        // credential (personal key or session token) takes the hand-rolled path, which
        // re-validates it fully; anything else (an OAuth-issued token, or no auth) belongs
        // to the OAuth provider. Presence-only match on purpose: a revoked/expired minted
        // credential still routes hand-rolled and 401s there, exactly as the prefix did.
        const h = request.headers.get("authorization") || "";
        const bearer = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
        let ours = false;
        if (bearer) {
          const hash = await sha256(bearer);
          ours = !!(await db(env).prepare("SELECT 1 AS x FROM people WHERE key_hash = ?").bind(hash).first())
              || !!(await db(env).prepare("SELECT 1 AS x FROM tokens WHERE token_hash = ?").bind(hash).first());
        }
        if (!ours) return provider.fetch(request, env, ctx);
      }
      return worker.fetch(request, env, ctx);
    },
    scheduled: worker.scheduled,
  };
}
