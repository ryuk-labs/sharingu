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

import { esc, errorState, uchan, uchanPose } from "./ui.js";
import { REQUEST_PATH, REQUEST_CHECK_PATH } from "./requestaccess.js";
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

// THE FRONT DOOR'S SHELL (sprint 21, 21.3: the website's look, the owner's MCQ of 2026-10-14; 21.P: composed scenes in the
// website's language, the owner's ruling of 2026-10-14): every page drawn before a session exists — the sign-in, the sign-up and its
// invite, creating an org and its done page, request access and its pages, the OAuth connect page, the org picker, the not-here
// page — and the showcase at `/` (src/showcase.js) stand on ONE frame: the paper page (Paper and Ink from the shell's own tokens,
// following the system and the choice remembered in this browser; shell.js, one copy: no second skin), the top bar (the lowercase
// Fredoka wordmark beside U-chan, home to `/`; on the right the way back to the website, Check my request and Sign in), Manrope for
// reading, the mono label for an eyebrow, and a quiet foot (the website, its privacy, terms and support pages). The faces and the
// state patterns are the shell's. ONE accent a view: the page's one primary action is the orange button; every other link or
// button is ink. <body data-shell="front"> is the frame's one marker (the smoke and the selftests find a front page by it).
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
// the website: the way back from every front page (the top bar, the foot), and its pages the foot names
export const SITE_URL = "https://www.sharingu.xyz/";
const SITE_PAGES = [["Privacy", "privacy.html"], ["Terms", "terms.html"], ["Support", "support.html"]];
// the frame's own rules: the page's column, the top bar (a hairline under it, as the website's header) and its links, the wordmark
// lockup, the links that read as words (ink, a quiet underline), the eyebrow, the ONE primary button (orange, the website's own:
// ink text, a deep-orange lip) and the quiet one beside it, and the foot
const FRONT_CSS = `
  body{min-height:100vh;display:flex;flex-direction:column}
  .front-top{border-bottom:1px solid var(--line)}
  .front-bar{width:min(1120px,calc(100% - 32px));margin:0 auto;height:68px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .front-brand{display:inline-flex;align-items:center;gap:8px;min-width:0;color:var(--text);border-radius:6px}
  .front-brand .u-uchan{flex:none;width:27px;height:30px}
  .wordmark{display:inline-flex;align-items:center;gap:10px;min-width:0}
  .wordmark .wm-product{font:600 26px/1 var(--display);letter-spacing:-.04em;color:var(--text)}
  .wordmark .wm-org{padding-left:10px;border-left:1px solid var(--line-strong);font:600 13px/1.2 var(--sans);color:var(--text-muted);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .front-nav{display:flex;align-items:center;gap:6px;flex:none}
  .front-nav a{display:inline-flex;align-items:center;height:38px;padding:0 10px;font:600 13.5px/1 var(--sans);color:var(--text);border-radius:10px;
    white-space:nowrap;transition:background-color var(--dur-fast) var(--ease)}
  .front-nav a:hover{background:var(--hover)}
  .front-nav .front-site{color:var(--text-muted);font-weight:500}
  .front-nav .front-link{padding:0 14px;border:1px solid var(--line-strong);margin-left:4px}
  .u-words a:not([class]),.footnote a,.front-foot a{font-weight:600;color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);
    text-underline-offset:3px;transition:text-decoration-color var(--dur-fast) var(--ease)}
  .u-words a:not([class]):hover,.footnote a:hover,.front-foot a:hover{text-decoration-color:var(--text)}
  .eyebrow{margin:0;font:500 12px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
  .primary,.quiet{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 20px;font:700 14.5px/1 var(--sans);
    border-radius:10px;cursor:pointer;text-decoration:none;white-space:nowrap;transition:filter var(--dur-fast) var(--ease),background-color var(--dur-fast) var(--ease)}
  .primary{color:var(--on-accent);background:var(--accent);border:1px solid var(--accent-text);border-bottom-width:3px}
  .primary:hover{filter:brightness(1.05)}
  .quiet{color:var(--text);background:transparent;border:1px solid var(--line-strong)}
  .quiet:hover{background:var(--hover)}
  .primary:focus-visible,.quiet:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .front-foot{border-top:1px solid var(--line)}
  .front-foot .front-bar{height:auto;min-height:56px;padding:14px 0;flex-wrap:wrap;font:400 13px/1.4 var(--sans);color:var(--text-muted)}
  .front-foot nav{display:flex;gap:16px}
  .front-foot a{font-weight:500;color:var(--text-muted)}
  @media (max-width:640px){.front-nav .front-site{display:none}.front-nav a{padding:0 8px}.front-nav .front-link{padding:0 12px}}
`;
// frontTop(wordmark, here) -> the top bar: the wordmark (authBrand's: the product, the org as secondary text) home to the
// platform's own `/` (src/orgpath.js PLATFORM_ROOT: never an org's, so the not-here page's bytes stay one for every org), then
// the website (wide screens: the foot carries it on a phone), Check my request and Sign in. here: the page's own door, left out
// ("login" on the sign-in, "check" on the check page)
// (here "in": a page that has just signed its reader in, the org's done page: no Sign in, no Check my request)
export function frontTop(wordmark, here = "") {
  return `<header class="front-top"><div class="front-bar">
    <a class="front-brand" href="${PLATFORM_ROOT}">${uchan({ size: 30 })}<span class="wordmark">${wordmark}</span></a>
    <nav class="front-nav" aria-label="sharingu">
      <a class="front-site" href="${SITE_URL}" data-region="site-link">sharingu.xyz</a>
      ${here === "check" || here === "in" ? "" : `<a href="${REQUEST_CHECK_PATH}" data-region="check-link">Check my request</a>`}
      ${here === "login" || here === "in" ? "" : `<a class="front-link" href="/login" data-region="sign-in-link">Sign in</a>`}
    </nav>
  </div></header>`;
}
// frontFoot() -> the quiet foot: the way back to the website and its privacy, terms and support pages
export function frontFoot() {
  return `<footer class="front-foot"><div class="front-bar">
    <a href="${SITE_URL}" data-region="site-foot">sharingu.xyz</a>
    <nav aria-label="The website">${SITE_PAGES.map(([w, p]) => `<a href="${SITE_URL}${p}">${w}</a>`).join("")}</nav>
  </div></footer>`;
}

// authPage({ title, wordmark, here, lede, sub, head, banner, body, footnote, css, intro, solo }) -> a front-door page, in one of three
// compositions on the same tokens:
//   · the card (the default): ONE card, a surface with a hairline edge, its heading (the lede, under `head`: a renderer's own
//     markup above it, the connect page's two marks; `sub` one small line under it) and the form or the facts;
//   · intro { eyebrow, heading, lede (or ledeHtml, a renderer's own markup), more, art, phone }: the website's scene — on the left the mono eyebrow, the big Manrope heading,
//     its lede and `more` under it (the place in line: it comes first on a phone too), the art (a renderer's panel: the brand's marks, U-chan's pose, the place in line), the card on the right; on a phone the
//     heading first, then the card, then the art (phone: false, none on a phone: a form's art never pushes it down);
//   · solo { pose, eyebrow }: a state's page — U-chan's pose, the eyebrow, the heading (the lede) and the body, centred, no card.
// `body`, `head`, `more`, `art` are trusted markup from a renderer; the text slots of intro are escaped here. css: a page's own few rules
// on the same tokens. The primary button is the view's one accent (orange); a field being typed in shows a neutral ring
// (--field-ring), every other control the shell's focus ring. The brand's radii: 6 a field, 10 a button or a list, 14 the card.
export function authPage(opts) {
  const { title = "", wordmark = "", here = "", lede = "", sub = "", head = "", banner = "", body = "", footnote = "", css = "", intro = null, solo = null } = opts || {};
  const card = `<div class="card u-words">
      ${head}
      ${lede && !solo ? `<h${intro ? 2 : 1} class="lede">${lede}</h${intro ? 2 : 1}>` : ""}
      ${sub ? `<p class="lede-sub">${sub}</p>` : ""}
      ${banner}
      ${body}
      ${footnote ? `<div class="footnote">${footnote}</div>` : ""}
    </div>`;
  const main = solo ? `<main class="auth solo u-words">
    <div class="solo-col">
      ${solo.pose ? uchanPose({ pose: solo.pose, size: 132, cls: "solo-pose" }) : ""}
      ${solo.eyebrow ? `<p class="eyebrow">${esc(solo.eyebrow)}</p>` : ""}
      <h1 class="solo-title">${lede}</h1>
      ${banner}
      ${body}
      ${footnote ? `<div class="footnote">${footnote}</div>` : ""}
    </div>
  </main>` : intro ? `<main class="auth scene">
    <div class="scene-intro">
      ${intro.eyebrow ? `<p class="eyebrow">${esc(intro.eyebrow)}</p>` : ""}
      <h1 class="scene-title">${esc(intro.heading || "")}</h1>
      ${intro.ledeHtml || intro.lede ? `<p class="scene-lede">${intro.ledeHtml || esc(intro.lede)}</p>` : ""}
      ${intro.more || ""}
    </div>
    <div class="scene-card">${card}</div>
    ${intro.art ? `<div class="scene-art${intro.phone === false ? " no-phone" : ""}">${intro.art}</div>` : ""}
  </main>` : `<main class="auth">
    ${card}
  </main>`;
  return `<!doctype html>
<html lang="en">
${frontHead({ title, css: AUTH_CSS + css })}
<body data-shell="front">
${frontTop(wordmark, here)}
  ${main}
${frontFoot()}
</body>
</html>`;
}
const AUTH_CSS = `
  .auth{flex:1;display:flex;align-items:center;justify-content:center;padding:48px 16px 72px}
  .card{width:100%;max-width:420px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:32px 28px 28px}
  .lede{margin:0 0 22px;font:800 24px/1.2 var(--sans);letter-spacing:-.02em;color:var(--text)}
  .scene{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,440px);grid-template-areas:"intro card" "art card";grid-template-rows:auto 1fr;align-items:start;
    column-gap:72px;row-gap:28px;width:min(1120px,calc(100% - 32px));margin:0 auto;padding:72px 0 96px}
  .scene-intro{grid-area:intro;padding-top:12px}
  .scene-card{grid-area:card}
  .scene-card .card{max-width:none}
  .scene-art{grid-area:art;align-self:start}
  .art-pose{display:flex;justify-content:flex-start;padding:8px 0 0}
  .art-pose .u-pose{width:202px;height:240px}
  .scene-title{margin:14px 0 0;max-width:14ch;font:800 clamp(36px,4.6vw,56px)/1.04 var(--sans);letter-spacing:-.04em;color:var(--text)}
  .scene-lede{margin:18px 0 0;max-width:42ch;font:400 17px/1.6 var(--sans);color:var(--text-muted)}
  .solo{flex-direction:column}
  .solo-col{width:100%;max-width:560px;display:flex;flex-direction:column;align-items:flex-start;gap:0}
  .solo-pose{width:111px;height:132px;margin:0 0 22px}
  .solo-title{margin:12px 0 0;font:800 clamp(30px,4vw,42px)/1.1 var(--sans);letter-spacing:-.03em;color:var(--text)}
  .solo-col .state{margin:18px 0 0}
  .acts{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin:26px 0 0}
  form{display:flex;flex-direction:column;gap:14px;margin:0}
  .field{display:flex;flex-direction:column;gap:6px}
  label{font:600 12.5px/1.3 var(--sans);color:var(--text-muted)}
  input[type="email"],input[type="password"],input[type="text"]{width:100%;height:42px;padding:0 12px;font:400 14.5px/1 var(--sans);color:var(--text);
    background:var(--page);border:1px solid var(--line-strong);border-radius:6px;transition:border-color var(--dur-fast) var(--ease)}
  input[type="email"]:focus,input[type="password"]:focus,input[type="text"]:focus{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  input.code{font:500 14px/1 var(--mono);letter-spacing:.06em}
  input.code::placeholder{color:var(--text-faint);letter-spacing:.06em}
  form button[type="submit"],.done-action{display:flex;align-items:center;justify-content:center;height:46px;margin-top:6px;padding:0 18px;font:700 14.5px/1 var(--sans);
    color:var(--on-accent);background:var(--accent);border:1px solid var(--accent-text);border-bottom-width:3px;border-radius:10px;cursor:pointer;text-decoration:none;
    transition:filter var(--dur-fast) var(--ease)}
  form button[type="submit"]:hover,.done-action:hover{filter:brightness(1.05)}
  form button[type="submit"]:focus-visible,.done-action:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .done{display:flex;flex-direction:column;gap:10px}
  .done-what{margin:0;font:600 15px/1.45 var(--sans);color:var(--text)}
  .done-why{margin:0;font:400 14px/1.55 var(--sans);color:var(--text-muted)}
  .solo .done-why{margin:14px 0 0;max-width:46ch;font-size:16px;line-height:1.6}
  .done-action{margin-top:12px}
  .opt{font-weight:400;color:var(--text-faint)}
  .hint{margin:0;font:400 12px/1.45 var(--sans);color:var(--text-faint)}
  .affix{display:flex;align-items:stretch;height:42px;border:1px solid var(--line-strong);border-radius:6px;background:var(--page);overflow:hidden}
  .affix:focus-within{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  .affix .pre{display:flex;align-items:center;padding:0 2px 0 12px;font:500 13px/1 var(--mono);color:var(--text-muted);white-space:nowrap;max-width:55%;overflow:hidden;text-overflow:ellipsis}
  .affix input[type="text"]{height:40px;border:0;border-radius:0;padding:0 12px 0 0;min-width:0;flex:1;font:500 14px/1 var(--mono)}
  .affix input[type="text"]:focus{outline:none}
  .footnote{margin:22px 0 0;font:400 13px/1.55 var(--sans);color:var(--text-muted)}
  .footnote p{margin:0}
  .footnote p+p{margin-top:8px}
  .card .state{margin:0 0 18px}
  @media (max-width:900px){.scene{grid-template-columns:minmax(0,1fr);grid-template-areas:"intro" "card" "art";grid-template-rows:none;column-gap:0;padding:36px 0 56px}
    .scene-intro{padding-top:0}
    .scene-title{max-width:none}.scene-art.no-phone{display:none}}
  @media (max-width:480px){.auth{padding:24px 16px 48px}.scene{padding:28px 0 48px}.card{padding:24px 20px 22px}.wordmark .wm-org{max-width:40vw}
    .scene-lede{font-size:16px}.solo-pose{width:84px;height:100px;margin-bottom:16px}}
`;

export function renderLogin(opts) {
  const {
    error = "", next = "", brand = DEFAULT_BRAND, action = "/login",
    lede, footnote, footnoteHtml, hidden, submit = "Sign in", email = "", orgChoice = null, headHtml = "", sub = "", css = "",
  } = opts || {};
  // headHtml, sub, css (the connect page, src/oauth.js connectHead): its two marks above the heading, the one line under it (text,
  // escaped here) and its own few rules
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
    here: "login",
    head: headHtml,
    // the platform's own sign-in (action /login) stands in the website's scene; the connect page keeps its one card, a consent
    intro: action === "/login" && !choice ? { eyebrow: "Your account", heading: "Welcome back",
      art: `<div class="art-pose" data-art="pair">${uchanPose({ pose: "pair", size: 240 })}</div>`, phone: false } : null,
    // sprint 3 L3 (pristine copy): "Sign in" and nothing more; the org's name rides the wordmark, the account rule the
    // passphrase's title
    lede: lede !== undefined ? esc(lede) : "Sign in",
    banner: errorBanner,
    body,
    // every text slot is escaped here; only footnoteHtml and headHtml (a renderer's own markup: the connect page's) are raw. The
    // platform's own sign-in (action /login) carries one quiet way in for a person with no account yet (sprint 21, 21.1: GET
    // /request-access; 21.P: the one button word, "Join the beta")
    footnote: footnoteHtml !== undefined ? footnoteHtml
      : footnote !== undefined ? esc(footnote) : action === "/login" ? joinLink() : "",
    sub: esc(sub),
    css: (choice ? ORG_CHOICE_CSS : "") + css,
  });
}
// the sign-in's way to request access (sprint 21, 21.1; 21.P: "Join the beta", the one word for it on the site and in the app)
export const JOIN_WORDS = "Join the beta";
const joinLink = () => `No account yet? <a href="${REQUEST_PATH}" data-region="request-access-link">${JOIN_WORDS}</a>`;
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
    solo: { pose: "inspect", eyebrow: "Not found" },
    body: `<div class="acts" data-screen="not-found" data-region="not-found"><a class="primary" href="/login">Go to sign-in</a></div>`,
  });
}
