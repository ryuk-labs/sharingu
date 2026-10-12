// Agent R — the ONE sign-in page (ADR-093 brand seam → M-ADR-024 "one front door").
// Standalone, fully self-contained HTML (NOT wrapped by shell.js) — this is the front
// door: it renders before any session exists, so it carries its own styling inline.
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
//   lede     — the one-line prompt under the wordmark
//   footnote — the small print under the form (TEXT — escaped; footnoteHtml for trusted markup)
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

import { esc, errorState, logo } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
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

// authPage({ title, wordmark, lede, banner, body, footnote }) — the sign-in-class page frame: one card,
// used by the login form and the OAuth consent form. `body` is trusted markup from a renderer here.
// Brand v2 in both worlds: the SAME palette, the same Paper / Ink tokens (following the system, and the choice a
// person made in the app, remembered in this browser), the same faces and state patterns as shell() (imported from
// shell.js, one copy: no second skin). U-chan greets (ui.js logo, the one mark). It stays a standalone page because no
// session exists yet. The orange sign-in button is the page's ONE accent: a field being typed in shows a neutral ring
// (--field-ring), the top light is peach on Paper and none on Ink (--wash: an orange wash on the dark ground banded).
// css: a page's own few rules on the same tokens (the org picker's list, src/orgpicker.js), trusted constant text
export function authPage(opts) {
  const { title = "", wordmark = "", lede = "", banner = "", body = "", footnote = "", css = "" } = opts || {};
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
${THEME_BOOT}
${FAVICON_LINK}
${BRAND_FONTS_LINK}
<style>
${WORLDS_CSS}
${BASE_CSS}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;
    background:radial-gradient(1200px 600px at 50% -10%,var(--wash),transparent 70%),var(--page)}
  a{color:var(--accent-text)}
  .auth{width:100%;max-width:392px}
  .auth-mark{display:flex;justify-content:center;margin:0 0 14px}
  .auth-mark .u-uchan{width:54px;height:60px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:30px 28px 28px;box-shadow:var(--shadow-card)}
  .wordmark{margin:0 0 4px;text-align:center}
  .wordmark .wm-product{display:block;font:600 34px/1.05 var(--display);letter-spacing:-.02em;color:var(--text)}
  .wordmark .wm-org{display:block;margin-top:8px;font:500 13px/1.3 var(--sans);color:var(--text-muted)}
  .lede{font:700 17px/1.3 var(--sans);letter-spacing:-.01em;color:var(--text);text-align:center;margin:18px 0 22px}
  form{display:flex;flex-direction:column;gap:14px;margin:0}
  .field{display:flex;flex-direction:column;gap:6px}
  label{font:600 12.5px/1.3 var(--sans);color:var(--text-muted)}
  input[type="email"],input[type="password"],input[type="text"]{width:100%;height:42px;padding:0 12px;font:400 14.5px/1 var(--sans);color:var(--text);
    background:var(--page);border:1px solid var(--line-strong);border-radius:8px;transition:border-color var(--dur-fast) var(--ease)}
  input[type="email"]:focus,input[type="password"]:focus,input[type="text"]:focus{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  input.code{font:500 14px/1 var(--mono);letter-spacing:.06em}
  input.code::placeholder{color:var(--text-faint);letter-spacing:.06em}
  button,.done-action{height:42px;margin-top:6px;font:700 14.5px/1 var(--sans);color:var(--on-accent);background:var(--accent);border:0;border-radius:8px;cursor:pointer;
    transition:filter var(--dur-fast) var(--ease)}
  button:hover,.done-action:hover{filter:brightness(1.04)}
  button:focus-visible,.done-action:focus-visible{outline:2px solid var(--text);outline-offset:2px}
  .done{display:flex;flex-direction:column;gap:10px;text-align:center}
  .done-what{margin:0;font:600 15px/1.45 var(--sans);color:var(--text)}
  .done-why{margin:0;font:400 14px/1.55 var(--sans);color:var(--text-muted)}
  .done-action{display:flex;align-items:center;justify-content:center;margin-top:12px;text-decoration:none}
  .opt{font-weight:400;color:var(--text-faint)}
  .hint{margin:0;font:400 12px/1.45 var(--sans);color:var(--text-faint)}
  .affix{display:flex;align-items:stretch;height:42px;border:1px solid var(--line-strong);border-radius:8px;background:var(--page);overflow:hidden}
  .affix:focus-within{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  .affix .pre{display:flex;align-items:center;padding:0 2px 0 12px;font:500 13px/1 var(--mono);color:var(--text-muted);white-space:nowrap;max-width:55%;overflow:hidden;text-overflow:ellipsis}
  .affix input[type="text"]{height:40px;border:0;border-radius:0;padding:0 12px 0 0;min-width:0;flex:1;font:500 14px/1 var(--mono)}
  .affix input[type="text"]:focus{outline:none}
  .done .facts{display:flex;flex-direction:column;gap:12px;margin:8px 0 0;text-align:left}
  .done .fact{display:flex;flex-direction:column;gap:4px}
  .done .fact-k{font:600 12.5px/1.3 var(--sans);color:var(--text-muted)}
  .done .fact-v{font:500 13px/1.45 var(--mono);color:var(--text);overflow-wrap:anywhere}
  .secret{display:block;padding:10px 12px;font:500 13.5px/1.4 var(--mono);color:var(--text);background:var(--page);border:1px solid var(--line-strong);
    border-radius:8px;overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}
  .footnote{font-size:12.5px;color:var(--text-faint);text-align:center;margin:22px 0 0;line-height:1.55}
  .card .state{margin:0 0 18px}
${STATE_CSS}
  @media (max-width:420px){.card{padding:24px 20px 22px}}
${css}
</style>
</head>
<body>
  <div class="auth">
    <div class="auth-mark">${logo({ size: 60, wordmark: false })}</div>
    <div class="card">
      ${wordmark ? `<p class="wordmark">${wordmark}</p>` : ""}
      ${lede ? `<p class="lede">${lede}</p>` : ""}
      ${banner}
      ${body}
      ${footnote ? `<p class="footnote">${footnote}</p>` : ""}
    </div>
  </div>
</body>
</html>`;
}

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
    // every text slot is escaped here; only footnoteHtml (a renderer's own constant markup) is raw
    footnote: footnoteHtml !== undefined ? footnoteHtml
      : footnote !== undefined ? esc(footnote) : "",
    css: choice ? ORG_CHOICE_CSS : "",
  });
}
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
