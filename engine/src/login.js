// Agent R — the ONE sign-in page (ADR-093 brand seam → M-ADR-024 "one front door") and the front door's shell (frontHead,
// authPage: sprint 21, 21.3). Standalone HTML (NOT wrapped by shell.js): it renders before any session exists, so it carries
// its own styling inline, on the shell's own tokens.
//
// Two doors render a sign-in (this one · the OAuth consent form in src/oauth.js); both go
// through renderLogin()/authPage() here, so a person meets ONE sign-in, wherever they
// arrive from. (A third, the retired launcher's frame.js, was deleted 2026-09-27, Q6FA72180.)
//
// Usage: renderLogin({ error, next, brand, action, lede, footnote, hidden, submit })
//   error    — string; when present, shown as the ERROR state pattern (ui.js errorState) above the form
//   next     — string; when present, carried as a hidden field so the POST handler
//              can redirect back to the originally-requested page
//   brand    — { org } from the tenant seam (DEFAULT_BRAND fallback); the product name is sharingu (authBrand)
//   action   — the form's POST target (default "/login"; "" = this URL, for OAuth)
//   lede     — the card's one-line heading
//   footnote — the small print under the form (TEXT — escaped; footnoteHtml for trusted markup); none given on the platform's
//              own sign-in (action "/login"): the one link to request access
//   hidden   — extra [{ name, value }] hidden fields (default: web=1, the org login marker)
//   submit   — the button label (default "Sign in")
//
// Form fields (for the POST /login handler to match):
//   email    — text input, name="email"
//   password — password input, name="password"
//   web      — hidden input, name="web", value="1" (default hidden set)
//   next     — hidden input, name="next" (present only when next is passed)
//
// esc() comes from src/ui.js (Pass B de-dup). "Standalone" above is about the RENDERED
// page (no shell() chrome), not the module graph: wrangler bundles the whole worker as
// one artifact, so importing from ui.js/tenant.js adds no request.

import { esc, errorState, uchan } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { PLATFORM_ROOT } from "./orgpath.js";
import { BRAND_FONTS_LINK, WORLDS_CSS, BASE_CSS, STATE_CSS, THEME_BOOT, PRODUCT_NAME, FAVICON_LINK } from "./shell.js";

// The product's name on the front door. The sign-in page names the PRODUCT (sharingu) with the org as
// secondary text; it never reads brand.engine or brand.loginTitle (UI-B1b: the live manifest's loginTitle
// and engine carry the retired "Agent R" product string, which the front door must not show). A
// manifest-less org's fallback org IS the product name, so it is not repeated as its own secondary line.
const PRODUCT = PRODUCT_NAME;   // one literal, src/shell.js (the shelled pages title from it too, QE7ACBBA8)
export function authBrand(brand) {
  const org = String((brand && brand.org) || "").trim();
  const showOrg = org && org.toLowerCase() !== PRODUCT;
  return {
    title: showOrg ? `Sign in · ${org} · ${PRODUCT}` : `Sign in · ${PRODUCT}`,
    wordmark: `<span class="wm-product">${PRODUCT}</span>${showOrg ? ` <span class="wm-org">${esc(org)}</span>` : ""}`,
  };
}

// THE FRONT DOOR'S SHELL (sprint 21, 21.3: the website's look, the owner's MCQ of 2026-10-14): every page drawn before a session
// exists — the sign-in, the sign-up and its invite, creating an org and its done page, request access and its pages, the OAuth
// connect page, the org picker, the not-here page — and the showcase at `/` (src/showcase.js) stand on ONE frame: the paper
// page (Paper and Ink from the shell's own tokens, following the system and the choice remembered in this browser; shell.js,
// one copy: no second skin), the lowercase Fredoka wordmark top-left beside U-chan (ui.js uchan, the brand's own vector), Manrope
// for reading. The faces and the state patterns are the shell's. <body data-shell="front"> is the frame's one marker (the smoke
// and the selftests find a front page by it).
// frontHead({ title, description, css }) -> the document's <head>: the faces, both worlds, the frame's rules and the page's own
// (trusted constant css). Each front page writes its own doctype and <body data-shell="front"> around it (authPage below,
// src/showcase.js), so a render function's own text says it is a whole document (tools/import/read-code.mjs reads it so).
export function frontHead(opts) {
  const { title = "", description = "", css = "" } = opts || {};
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">\n` : ""}${THEME_BOOT}
${FAVICON_LINK}
${BRAND_FONTS_LINK}
<style>
${WORLDS_CSS}
${BASE_CSS}
${FRONT_CSS}
${STATE_CSS}
${css}
</style>
</head>`;
}
// the frame's own rules: the page's column, the top bar (a hairline under it, as the website's header), the wordmark lockup and
// the links that read as words (ink, a quiet underline: the orange stays the view's one accent)
const FRONT_CSS = `
  body{min-height:100vh;display:flex;flex-direction:column}
  .front-top{border-bottom:1px solid var(--line)}
  .front-bar{width:min(1120px,calc(100% - 32px));margin:0 auto;height:68px;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .front-brand{display:inline-flex;align-items:center;gap:8px;min-width:0;color:var(--text);border-radius:6px}
  .front-brand .u-uchan{flex:none;width:27px;height:30px}
  .wordmark{display:inline-flex;align-items:center;gap:10px;min-width:0}
  .wordmark .wm-product{font:600 26px/1 var(--display);letter-spacing:-.04em;color:var(--text)}
  .wordmark .wm-org{padding-left:10px;border-left:1px solid var(--line-strong);font:600 13px/1.2 var(--sans);color:var(--text-muted);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .front-link{display:inline-flex;align-items:center;height:38px;padding:0 14px;font:600 13.5px/1 var(--sans);color:var(--text);
    border:1px solid var(--line-strong);border-radius:10px;transition:background-color var(--dur-fast) var(--ease)}
  .front-link:hover{background:var(--hover)}
  .u-words a:not([class]),.footnote a{font-weight:600;color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);
    text-underline-offset:3px;transition:text-decoration-color var(--dur-fast) var(--ease)}
  .u-words a:not([class]):hover,.footnote a:hover{text-decoration-color:var(--text)}
`;
// frontTop(wordmark, right) -> the top bar: the wordmark (authBrand's: the product, the org as secondary text) home to the
// platform's own `/` (src/orgpath.js PLATFORM_ROOT: never an org's, so the not-here page's bytes stay one for every org), and
// on the right one link or nothing
export function frontTop(wordmark, right = "") {
  return `<header class="front-top"><div class="front-bar">
    <a class="front-brand" href="${PLATFORM_ROOT}">${uchan({ size: 30 })}<span class="wordmark">${wordmark}</span></a>
    ${right}
  </div></header>`;
}

// authPage({ title, wordmark, lede, banner, body, footnote, css }) -> a front-door page with ONE card: a surface with a hairline
// edge, its heading (the lede) and the form or the facts. `body` is trusted markup from a renderer here; css: a page's own few
// rules on the same tokens (the org picker's list, src/orgpicker.js), trusted constant text. The primary button is ink on
// paper (the text colour on the ground, so in Ink it is the light one); a field being typed in shows a neutral ring
// (--field-ring), every other control the shell's focus ring. The brand's radii: 6 a field, 10 a button or a list, 14 the card.
export function authPage(opts) {
  const { title = "", wordmark = "", lede = "", banner = "", body = "", footnote = "", css = "" } = opts || {};
  return `<!doctype html>
<html lang="en">
${frontHead({ title, css: AUTH_CSS + css })}
<body data-shell="front">
${frontTop(wordmark)}
  <main class="auth">
    <div class="card u-words">
      ${lede ? `<h1 class="lede">${lede}</h1>` : ""}
      ${banner}
      ${body}
      ${footnote ? `<div class="footnote">${footnote}</div>` : ""}
    </div>
  </main>
</body>
</html>`;
}
const AUTH_CSS = `
  .auth{flex:1;display:flex;align-items:center;justify-content:center;padding:48px 16px 72px}
  .card{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:32px 28px 28px}
  .lede{margin:0 0 22px;font:800 24px/1.2 var(--sans);letter-spacing:-.02em;color:var(--text)}
  form{display:flex;flex-direction:column;gap:14px;margin:0}
  .field{display:flex;flex-direction:column;gap:6px}
  label{font:600 12.5px/1.3 var(--sans);color:var(--text-muted)}
  input[type="email"],input[type="password"],input[type="text"]{width:100%;height:42px;padding:0 12px;font:400 14.5px/1 var(--sans);color:var(--text);
    background:var(--page);border:1px solid var(--line-strong);border-radius:6px;transition:border-color var(--dur-fast) var(--ease)}
  input[type="email"]:focus,input[type="password"]:focus,input[type="text"]:focus{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  input.code{font:500 14px/1 var(--mono);letter-spacing:.06em}
  input.code::placeholder{color:var(--text-faint);letter-spacing:.06em}
  button,.done-action{display:flex;align-items:center;justify-content:center;height:44px;margin-top:6px;padding:0 18px;font:700 14.5px/1 var(--sans);
    color:var(--page);background:var(--text);border:1px solid var(--text);border-radius:10px;cursor:pointer;text-decoration:none;
    transition:background-color var(--dur-fast) var(--ease)}
  button:hover,.done-action:hover{background:color-mix(in srgb,var(--text) 84%,var(--page))}
  button:focus-visible,.done-action:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .done{display:flex;flex-direction:column;gap:10px}
  .done-what{margin:0;font:600 15px/1.45 var(--sans);color:var(--text)}
  .done-why{margin:0;font:400 14px/1.55 var(--sans);color:var(--text-muted)}
  .done-action{margin-top:12px}
  .opt{font-weight:400;color:var(--text-faint)}
  .hint{margin:0;font:400 12px/1.45 var(--sans);color:var(--text-faint)}
  .affix{display:flex;align-items:stretch;height:42px;border:1px solid var(--line-strong);border-radius:6px;background:var(--page);overflow:hidden}
  .affix:focus-within{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  .affix .pre{display:flex;align-items:center;padding:0 2px 0 12px;font:500 13px/1 var(--mono);color:var(--text-muted);white-space:nowrap;max-width:55%;overflow:hidden;text-overflow:ellipsis}
  .affix input[type="text"]{height:40px;border:0;border-radius:0;padding:0 12px 0 0;min-width:0;flex:1;font:500 14px/1 var(--mono)}
  .affix input[type="text"]:focus{outline:none}
  .done .facts{display:flex;flex-direction:column;gap:12px;margin:8px 0 0}
  .done .fact{display:flex;flex-direction:column;gap:4px}
  .done .fact-k{font:600 12.5px/1.3 var(--sans);color:var(--text-muted)}
  .done .fact-v{font:500 13px/1.45 var(--mono);color:var(--text);overflow-wrap:anywhere}
  .secret{display:block;padding:10px 12px;font:500 13.5px/1.4 var(--mono);color:var(--text);background:var(--page);border:1px solid var(--line-strong);
    border-radius:6px;overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}
  .footnote{margin:22px 0 0;font:400 13px/1.55 var(--sans);color:var(--text-muted)}
  .footnote p{margin:0}
  .footnote p+p{margin-top:8px}
  .card .state{margin:0 0 18px}
  @media (max-width:480px){.auth{padding:24px 16px 48px}.card{padding:24px 20px 22px}.wordmark .wm-org{max-width:40vw}}
`;

export function renderLogin(opts) {
  const {
    error = "", next = "", brand = DEFAULT_BRAND, action = "/login",
    lede, footnote, footnoteHtml, hidden, submit = "Sign in", email = "", orgChoice = null,
  } = opts || {};
  // orgChoice (sprint 7's review, A1: the OAuth form never picks an org for an account in several): [{ slug, name }] — the
  // account's orgs, each a radio named `org`, one required; shown only after the account's passphrase proved the account (src/
  // oauth.js), with the email filled back in (never the passphrase)
  const choice = Array.isArray(orgChoice) && orgChoice.length ? `<fieldset class="org-choice" data-region="org-choice">
        <legend>Connect in which org?</legend>
        <div class="org-list">${orgChoice.map((o) => `<label class="org-opt"><input type="radio" name="org" value="${esc(o.slug)}" required><span><b>${esc(o.name)}</b> <code>/${esc(o.slug)}</code></span></label>`).join("")}</div>
      </fieldset>` : "";

  // a refused sign-in is the ERROR pattern (ui.js): the only red, always with its icon
  const errorBanner = error ? errorState({ what: error }) : "";

  const hiddenFields = (Array.isArray(hidden) ? hidden : [{ name: "web", value: "1" }])
    .map((h) => `<input type="hidden" name="${esc(h.name)}" value="${esc(h.value)}">`)
    .join("\n      ");
  const nextField = next
    ? `<input type="hidden" name="next" value="${esc(next)}">`
    : "";

  // D2b item 8: the sign-in's own hooks, so its check names what a working page carries (not only "200 HTML")
  const body = `<form method="POST" action="${esc(action)}" data-screen="login" data-region="sign-in">
      ${hiddenFields}
      ${nextField}
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required autofocus data-input-exception="auth"${email ? ` value="${esc(email)}"` : ""}>
      </div>
      <div class="field">
        <label for="password">Passphrase</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required data-input-exception="auth" title="The email and passphrase you were given: the same account as the CLI and the connector">
      </div>
      ${choice}
      <button type="submit">${esc(submit)}</button>
    </form>`;

  const { title, wordmark } = authBrand(brand);
  return authPage({
    title,
    wordmark,
    // sprint 3 L3 (pristine copy): "Sign in" and nothing more; the org's name rides the wordmark, the account rule the
    // passphrase's title
    lede: lede !== undefined ? esc(lede) : "Sign in",
    banner: errorBanner,
    body,
    // every text slot is escaped here; only footnoteHtml (a renderer's own constant markup) is raw. The platform's own sign-in
    // (action /login) carries one quiet way in for a person with no account yet (sprint 21, 21.1: GET /request-access)
    footnote: footnoteHtml !== undefined ? footnoteHtml
      : footnote !== undefined ? esc(footnote) : action === "/login" ? REQUEST_ACCESS_LINK : "",
    css: choice ? ORG_CHOICE_CSS : "",
  });
}
// the sign-in's way to request access (sprint 21, 21.1), constant markup
const REQUEST_ACCESS_LINK = `No account yet? <a href="/request-access" data-region="request-access-link">Request access</a>`;
// the OAuth form's org choice: one bordered list, a radio per org (its name, its address)
const ORG_CHOICE_CSS = `
  .org-choice{margin:0;padding:0;border:0;min-width:0}
  .org-choice legend{padding:0 0 6px;font:600 12.5px/1.3 var(--sans);color:var(--text-muted)}
  .org-list{border:1px solid var(--line-strong);border-radius:10px;overflow:hidden;background:var(--page)}
  .org-opt{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 12px;font:400 14px/1.3 var(--sans);color:var(--text);cursor:pointer}
  .org-opt+.org-opt{border-top:1px solid var(--line)}
  .org-opt:hover{background:var(--hover)}
  .org-opt code{font:500 12px/1 var(--mono);color:var(--text-muted)}
`;

// THE NOT-HERE PAGE (sprint 7, 7.4b; src/index.js NOT_HERE): the ONE answer for an org's address that serves the caller nothing —
// an org no one holds, an org the account holds no seat in, a credential of another org, a platform door asked for under an
// org. A calm front-door page in the PLATFORM's brand, never the org's, with one way on: the root's sign-in. Its one body never
// tells who belongs to an org (membership); an org's existence and name are public at its branded sign-in (src/index.js
// signInBrandOf: ruled kept until the one pre-public revisit, sprint 7's review B4). It reads nothing and depends on nothing in the request, so its bytes are the same for every case
// (tools/attack-xorg.mjs and the smoke compare them).
export function renderNotHere() {
  const { wordmark } = authBrand(DEFAULT_BRAND);
  return authPage({
    title: `Not found · ${PRODUCT}`,
    wordmark,
    lede: "Nothing here",
    body: `<div class="done" data-screen="not-found" data-region="not-found"><a class="done-action" href="/login">Go to sign-in</a></div>`,
  });
}
