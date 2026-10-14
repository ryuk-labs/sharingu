// Agent R: the shared UI shell for the worker's live pages (the look pass, sprint 2; docs/plan/LOOK.md).
// One design source: Brand v2 (the brain's source/board/sources/design-law.json `design.*`) and the website's own tokens
// (sharingu_website/_ds/sharingu/tokens), ONE token set for both worlds: Paper (light) and Ink (dark), chosen by the
// system setting (prefers-color-scheme) and overridable by a remembered switch (data-theme on <html>, localStorage),
// applied before the first paint. Navigation is a slim LEFT RAIL (owner, 2026-09-30): the lowercase wordmark, the org
// and the project switcher, search and what changed, the eight destinations, then the person, the theme switch and
// sign-out at the foot. Under 860px the rail folds into a top bar with a menu. The wireframe's shell regions (mark,
// org-name, project-switcher, tabs, search, notifications, avatar) keep their data-region names and doors. Every page
// wraps its already-rendered inner HTML through shell() and inherits these tokens and the one stylesheet (UI_CSS).
//
// Usage: shell({ active, content, owner, reader, brand, proj, briefCount, wide, head, scope })
//   active     : the page key; tabOf(active) picks the highlighted destination and the view bar above the content
//   content    : raw inner HTML string, injected as-is inside the content area
//   owner      : boolean; the owner (ADMIN)
//   reader     : the resolved reader, or falsy for an anonymous public view. `reader.viaCookie`
//                (src/index.js resolveReader) is what makes sign-out real: a Bearer-header visit has
//                no session cookie to clear, so the control shows disabled instead of pretending.
//   brand      : the tenant seam's brand (src/tenant.js); the org's name is STATIC text (no org
//                switcher with one org worker, QC74D4892 / QD0A65555)
//   proj       : the project switcher (ADR-100 §1): { current, options, orgEntry, static } or null.
//                Each option POSTs /project (the server stamps the session, never the client). A
//                signed-in reader with no proj still gets the region, as static scope text.
//   briefCount : the felt-loop count (M-ADR-010); > 0 puts the "needs you" badge on Home and Decisions
//   full       : the page fills the content area edge to edge and draws its own bar (the Map): no view bar, no padding.
//                A full page of the Map's tab, for a signed-in reader, carries the person's folds (M1: FOLD_BOOT)
//   head       : the project's newest version ({ n, at }, src/knowledge/versions.js) or null: every Map view's bar carries
//                the version chip ("v12 · current", or "Not versioned yet"), reading GET /versions
//   scope      : the project the head is of. A signed-in page with a head stamps <meta name="sharingu-served"> with the
//                head's time, and the shell's script asks GET /versions?head=1&project=<scope> when the tab gains focus or turns visible,
//                and every 120 s while visible; a newer head (a publish or a restore since the page was drawn) inserts the
//                BEHIND pattern (ui.js behindState) at the top of the page. It never blocks a write.
// The shell adds no D1 statement: everything it draws comes from servePage's one parallel wave (src/index.js).

import { esc, PRODUCT_NAME, stateChip, behindState, logo, avatar } from "./ui.js";
import { avatarOf, hatsOf, hatOf, roleClassOf, roleWordOf } from "./hats.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { PARTS_CSS, foldKit } from "./parts.js";
import { FONT_FACE_CSS, FONT_PRELOAD, FAVICON_LINK } from "./fonts.js";
import { orgPath, orgBase, orgAt, ORG_PATH_CLIENT } from "./orgpath.js";   // sprint 7, 7.4: every link under the org of the address; 7.4b: another org's
export { FAVICON_LINK };

// The Brand v2 foundation, ONE copy (UI-B1b). shell() renders it, and the standalone pages that cannot
// sit inside shell() (the sign-in / OAuth consent page in login.js: no session yet; the batch report in
// report.js via rt.js RT_CSS: a banked document) import these same strings, so there is no second skin:
// the same tokens, the same values, the same faces. The faces are self-hosted (src/fonts.js, GET /fonts/:file):
// no page asks Google for a font.
export const BRAND_FONTS_LINK = `${FONT_PRELOAD}
<style>${FONT_FACE_CSS}</style>`;
// BRAND_TOKENS_CSS is the PALETTE, the body of a :root rule: every Brand v2 value by its own name, once. The Ink names
// (--bv-dark*, the Ink states) are the Ink world's raw values; in Paper they are re-pointed at the Paper roles (PAPER_WORLD),
// so a page that still says var(--bv-dark-text) reads on Paper too. --bv-identity is the orange that never moves.
export const BRAND_TOKENS_CSS = `
    color-scheme:dark;
    /* Brand Guidelines v2, the palette (design-law.json design.*), every value once, by its own name */
    /* the Paper world: where people read */
    --bv-paper:#F7F5EF; --bv-paper-2:#EFEBE2; --bv-surface:#FFFDF8; --bv-ink:#1C1917; --bv-ink-2:#57534E; --bv-line:#E2DDD3;
    /* the Ink world: where the machine works */
    --bv-dark:#0F0E0D; --bv-dark-2:#1A1917; --bv-dark-3:#262421; --bv-dark-text:#EBE6DC; --bv-dark-text-2:#A39C92;
    --bv-dark-line-2:#3A3733; --bv-orange-well:#2A1A0E;
    /* brand: orange is identity, never a state */
    --bv-orange:#FB923C; --bv-identity:#FB923C; --bv-orange-deep:#C2410C; --bv-peach:#FBEEE3;
    --bv-verified:#059669; --bv-amber:#B45309; --bv-stone:#79716B; --bv-error:#B91C1C;
    /* the Ink states, text and well (QB90F6CC4) */
    --bv-verified-ink:#34D399; --bv-verified-well:#10291F; --bv-needs-ink:#E0A33E; --bv-needs-well:#2C2011;
    --bv-error-ink:#F87171; --bv-error-well:#2E1616; --bv-stone-ink:#79716B; --bv-stone-well:#262421;
    /* presence: avatars, cursors and pins only */
    --bv-gold:#F59E0B; --bv-sky:#0EA5E9; --bv-violet:#8B5CF6;
    /* depth: three named shadows and their tilts */
    --bv-shadow-lift:0 1px 2px rgba(28,25,23,.05),0 10px 28px rgba(28,25,23,.09);
    --bv-shadow-float:0 24px 56px rgba(28,25,23,.16); --bv-tilt-float:rotate(-1.5deg);
    --bv-shadow-pin:5px 5px 0 #1C1917; --bv-shadow-pin-ink:5px 5px 0 #FB923C; --bv-tilt-pin:rotate(1.2deg);
    /* motion: 120 to 200ms, one curve; reduced motion stops it (below) */
    --bv-ease:cubic-bezier(.2,0,0,1); --bv-dur-fast:120ms; --bv-dur:160ms; --bv-dur-slow:200ms;
    /* type: Manrope 800/700/500/400, Fredoka 600 for the mark and big numbers, JetBrains Mono for data */
    --sans:'Manrope',ui-sans-serif,-apple-system,'Segoe UI',Helvetica,sans-serif;
    --display:'Fredoka',ui-rounded,ui-sans-serif,-apple-system,'Segoe UI',Helvetica,sans-serif;
    --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;
`;
// the reduced-motion rule every Brand v2 page carries (standalone pages included)
export const BRAND_MOTION_CSS = "@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}";

// ---- the two worlds: the SEMANTIC tokens every page uses (never a raw value) ----
// --page the ground · --surface cards, the rail's popovers · --well sunken wells and tints · --hover a row's tint ·
// --rail the rail's ground · --text · --text-muted · --text-faint (meta) · --line hairlines · --line-strong controls ·
// --accent the orange fill · --accent-text orange that reads as text · --accent-tint the orange wash · --on-accent text
// on orange · --ok / --needs / --err / --stone and each one's -tint (the four states; colour is always paired with a
// word) · --on-needs text on a solid needs · --stone-text small incomplete text · --focus the focus ring · --shadow-pop
// popovers · --shadow-card a lifted card · --shadow-pin and --note-line the one pinned note (the brand's own pin: 5px ink on
// Paper, 5px orange on Ink, design-law depth) · --scrim the ground under a modal (the palette, the phone's drawer) ·
// --uchan-line / --uchan-rim U-chan's outline (the silhouette, the lens rims; the brand's ink in both worlds) · --uchan-key the
// keyline under the silhouette (none in Paper; in Ink it lifts the ink outline off the dark ground) · --field-ring
// the focus of a field being typed in (neutral: the orange stays the page's one accent) · --media / --on-media and
// --media-chip / --on-media-chip / --media-chip-line: a picture's own ground and the text and chips laid over it (a video's
// poster, sprint 21, 21.P: the same in both worlds, a still is the same still). Motion: --ease, --dur-fast, --dur.
export const INK_WORLD = `
    color-scheme:dark;
    --page:var(--bv-dark); --surface:var(--bv-dark-2); --well:var(--bv-dark-3);
    --hover:color-mix(in srgb,var(--bv-dark-3) 62%,var(--bv-dark)); --rail:color-mix(in srgb,var(--bv-dark-2) 55%,var(--bv-dark));
    --text:var(--bv-dark-text); --text-muted:var(--bv-dark-text-2); --text-faint:color-mix(in srgb,var(--bv-dark-text-2) 84%,var(--bv-dark));
    --line:var(--bv-dark-3); --line-strong:var(--bv-dark-line-2);
    --accent:var(--bv-identity); --accent-text:var(--bv-orange); --accent-tint:var(--bv-orange-well); --on-accent:var(--bv-ink);
    --ok:var(--bv-verified-ink); --ok-tint:var(--bv-verified-well);
    --needs:var(--bv-needs-ink); --needs-tint:var(--bv-needs-well); --on-needs:var(--bv-ink);
    --err:var(--bv-error-ink); --err-tint:var(--bv-error-well);
    --stone:var(--bv-stone); --stone-tint:var(--bv-stone-well); --stone-text:var(--bv-dark-text-2);
    --focus:var(--bv-identity);
    --shadow-pop:0 1px 2px rgba(15,14,13,.4),0 16px 40px rgba(15,14,13,.55); --shadow-card:0 1px 2px rgba(15,14,13,.35),0 10px 28px rgba(15,14,13,.3);
    --shadow-pin:var(--bv-shadow-pin-ink); --note-line:var(--bv-dark-line-2);
    --scrim:rgba(15,14,13,.62); --uchan-line:var(--bv-ink); --uchan-rim:var(--bv-ink); --uchan-key:var(--bv-dark-text-2); --field-ring:var(--bv-dark-text-2);
    --media:var(--bv-ink); --on-media:var(--bv-paper); --media-chip:var(--bv-surface); --on-media-chip:var(--bv-ink); --media-chip-line:var(--bv-line);
`;
export const PAPER_WORLD = `
    color-scheme:light;
    --page:var(--bv-paper); --surface:var(--bv-surface); --well:var(--bv-paper-2);
    --hover:color-mix(in srgb,var(--bv-paper-2) 70%,var(--bv-paper)); --rail:color-mix(in srgb,var(--bv-paper-2) 42%,var(--bv-paper));
    --text:var(--bv-ink); --text-muted:var(--bv-ink-2); --text-faint:color-mix(in srgb,var(--bv-ink-2) 88%,var(--bv-paper));
    --line:var(--bv-line); --line-strong:color-mix(in srgb,var(--bv-line) 62%,var(--bv-ink-2));
    --accent:var(--bv-identity); --accent-text:var(--bv-orange-deep); --accent-tint:var(--bv-peach); --on-accent:var(--bv-ink);
    --ok:color-mix(in srgb,var(--bv-verified) 76%,var(--bv-ink)); --ok-tint:color-mix(in srgb,var(--bv-verified) 11%,var(--bv-surface));
    --needs:var(--bv-amber); --needs-tint:color-mix(in srgb,var(--bv-amber) 11%,var(--bv-surface)); --on-needs:var(--bv-surface);
    --err:var(--bv-error); --err-tint:color-mix(in srgb,var(--bv-error) 9%,var(--bv-surface));
    --stone:var(--bv-stone); --stone-tint:var(--bv-paper-2); --stone-text:var(--bv-ink-2);
    --focus:var(--bv-orange-deep);
    --shadow-pop:0 1px 2px rgba(28,25,23,.06),0 12px 32px rgba(28,25,23,.12); --shadow-card:var(--bv-shadow-lift);
    --shadow-pin:var(--bv-shadow-pin); --note-line:var(--bv-ink);
    --scrim:rgba(28,25,23,.16); --uchan-line:var(--bv-ink); --uchan-rim:var(--bv-ink); --uchan-key:none; --field-ring:var(--bv-ink-2);
    --media:var(--bv-ink); --on-media:var(--bv-paper); --media-chip:var(--bv-surface); --on-media-chip:var(--bv-ink); --media-chip-line:var(--bv-line);
    --bv-dark:var(--page); --bv-dark-2:var(--surface); --bv-dark-3:var(--well); --bv-dark-text:var(--text); --bv-dark-text-2:var(--text-muted);
    --bv-dark-line-2:var(--line-strong); --bv-orange-well:var(--accent-tint); --bv-orange:var(--accent-text);
    --bv-verified-ink:var(--ok); --bv-verified-well:var(--ok-tint); --bv-needs-ink:var(--needs); --bv-needs-well:var(--needs-tint);
    --bv-error-ink:var(--err); --bv-error-well:var(--err-tint); --bv-stone-ink:var(--stone); --bv-stone-well:var(--stone-tint);
    --bv-shadow-pin-ink:var(--bv-shadow-pin);
`;
// the names the pages used before the look pass, ALIASES onto the semantic tokens (never renamed across the pages that
// read them): each resolves in whichever world is in force, so an unmigrated page follows the theme too
export const LEGACY_ALIASES = `
    --background:var(--page); --paper:var(--page); --muted:var(--well);
    --ink:var(--text); --ink-soft:var(--text-muted); --ink-faint:var(--text-muted);
    --input:var(--line-strong); --ring:var(--focus);
    --brand:var(--accent); --brand-ink:var(--accent-text); --brand-fg:var(--on-accent);
    --sidebar:var(--rail); --sidebar-line:var(--line);
    --good:var(--ok); --good-bg:var(--ok-tint); --warn:var(--needs); --warn-bg:var(--needs-tint); --bad:var(--err); --bad-bg:var(--err-tint);
    --stamp:var(--ok); --stamp-bg:var(--ok-tint); --ghost:var(--stone);
    --lane-code-bg:var(--well); --lane-code-fg:var(--text-muted);
    --lane-design-bg:var(--well); --lane-design-fg:var(--text-muted);
    --lane-leader-bg:var(--well); --lane-leader-fg:var(--text-muted);
    --lane-vendor-bg:var(--well); --lane-vendor-fg:var(--text-muted);
    --lane-ba-bg:var(--well); --lane-ba-fg:var(--text-muted);
    --lane-gtm-bg:var(--well); --lane-gtm-fg:var(--text-muted);
    --radius:10px;
    --ease:var(--bv-ease); --dur-fast:var(--bv-dur-fast); --dur:var(--bv-dur);
`;
// WORLDS_CSS: Ink by default and inside any [data-world="ink"] (the Map's canvases), Paper when the system is light
// (unless the person chose Ink) or when the person chose Paper. One rule each; the palette and the aliases are declared
// on the same selector so an Ink subtree inside a Paper page recomputes every alias in Ink.
export const WORLDS_CSS = `:root,[data-world="ink"]{${BRAND_TOKENS_CSS}${INK_WORLD}${LEGACY_ALIASES}}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){${PAPER_WORLD}}}
:root[data-theme="light"]{${PAPER_WORLD}}`;
// THEME_BOOT: the remembered choice, applied before the first paint (the system choice needs no script at all); and the
// motion switch: html.u-motion only when the person has not asked for reduced motion, set before the first paint so a
// number that counts up or a bar that fills never flashes its final state first. Without it (no JS, reduced motion) every
// motion hook renders its final state at once (ui.js MOTION, shell.js MOTION_CSS).
export const THEME_KEY = "sharingu-theme";
export const THEME_BOOT = `<script>try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('u-motion')}catch(e){}</script>`;
// FOLD_BOOT (M1): on a Map view, the person's folds (src/parts.js foldKit, embedded by its own source: the ONE copy the page
// carries) read from this browser under the key <html data-folds> names, and the rail and the panel folded (<html data-fold>)
// before the first paint, so neither the rail nor the canvas moves after it. The kit stays on window.SGFOLD for the toggles
// (SHELL_SCRIPT) and for the Map's and the Arch view's own folds (a column, a lane). __name: esbuild's keepNames helper, as in
// src/mapclient.js.
export const FOLD_PREFIX = "sharingu-fold:";
export const FOLD_BOOT = `<script>(function(){var __name=function(t){return t;};var F=(${foldKit.toString()})(),R=document.documentElement,K=R.getAttribute('data-folds'),a=F.attr(F.read(K));if(a)R.setAttribute('data-fold',a);window.SGFOLD={kit:F,key:K};})()</script>`;

// The product's name on glass (QE7ACBBA8, UI-B2): every page title and the rail's wordmark say sharingu, as
// "<Org> · sharingu" for a signed-in person, "sharingu" alone for an anonymous visitor or an org whose name IS the
// product (the manifest-less fallback, never repeated). The org manifest's brand.productTitle is no longer the page
// title; brand.engine stays the engine's name in docs and on the MCP door, never a brand on glass. login.js's
// front door reads the same PRODUCT_NAME: the literal lives in ui.js (this file imports ui.js, so the reverse would be
// a cycle) and is re-exported here, so every importer keeps working.
export { PRODUCT_NAME };
export function productTitle(brand, signedIn) {
  const org = String((brand && brand.org) || "").trim();
  return signedIn && org && org.toLowerCase() !== PRODUCT_NAME ? `${org} · ${PRODUCT_NAME}` : PRODUCT_NAME;
}

// CHIP_CSS: the ONE state chip's colours (UI-B5a, QB74B1B7E), the only chip colour rules in src/. ui.js stateChip renders
// a span.state-chip carrying the data-chip attribute; each of the law's 11 chips (design-law.json design.stateChips.chips[]) sets
// its ground and text here on the semantic state tokens, which resolve to the law's Ink values in Ink and to the Paper
// state values in Paper. Orange is identity, never a state; red is ERROR's alone (with its icon); gap is stone with a
// 1px dashed stone line. Served inside STATE_CSS, so every page has it.
export const CHIP_CSS = `
  .state-chip{display:inline-flex;align-items:center;gap:4px;font:600 10.5px/1.5 var(--mono);letter-spacing:.04em;
    border-radius:5px;padding:1px 6px;white-space:nowrap;vertical-align:middle;border:1px solid transparent;font-variant-numeric:tabular-nums}
  .state-chip svg{width:12px;height:12px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .state-chip[data-chip="BLOCKER"]{background:var(--needs);color:var(--on-needs)}
  .state-chip[data-chip="HIGH"],.state-chip[data-chip="OPEN"],.state-chip[data-chip="DECIDE"],
  .state-chip[data-chip="APPROVE"],.state-chip[data-chip="GRANT"]{background:var(--needs-tint);color:var(--needs)}
  .state-chip[data-chip="REVIEW"],.state-chip[data-chip="pending"]{background:var(--well);color:var(--stone-text)}
  .state-chip[data-chip="gap"]{background:var(--well);color:var(--stone-text);border:1px dashed var(--stone)}
  .state-chip[data-chip="LANDED"]{background:var(--ok-tint);color:var(--ok)}
  .state-chip[data-chip="ERROR"]{background:var(--err-tint);color:var(--err)}
`;

// STATE_CSS: the five state patterns (ui.js emptyState · loadingState · errorState · unreachableState ·
// behindState; QE9178667: EMPTY drawn per screen, LOADING, ERROR and BEHIND one pattern each; Q47C9CCD3:
// UNREACHABLE blocks writes and says why, BEHIND warns and still lets you act). Red is ERROR's alone and always
// beside its icon; UNREACHABLE is the needs family (a person must wait), never red; EMPTY and LOADING are quiet;
// BEHIND is the stone well with text, never orange, never red (design-law design.behind). While an UNREACHABLE block is
// on the page, every POST form's submit is disabled before the press (the ruling: refuse before, never fail after).
export const STATE_CSS = `
  .state{display:flex;gap:12px;align-items:flex-start;margin:12px 0;padding:14px 16px;border-radius:10px;
    font:400 13.5px/1.5 var(--sans);color:var(--text-muted);background:var(--surface);border:1px solid var(--line)}
  .state p{margin:0}
  .state>div{min-width:0;flex:1}
  .state .state-what{color:var(--text);font-weight:500}
  .state .state-why{margin-top:2px}
  .state>svg{flex:none;width:18px;height:18px;margin-top:1px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .state>svg.u-uchan{width:30px;height:34px;margin-top:-2px;stroke:none}
  .state .state-action{display:inline-flex;align-items:center;height:28px;margin-top:10px;padding:0 10px;border-radius:7px;
    font:600 12.5px/1 var(--sans);color:var(--text);background:var(--surface);border:1px solid var(--line-strong)}
  .state .state-action:hover{background:var(--hover)}
  .state-empty{background:transparent;border:1px dashed var(--line-strong)}
  .state-empty>svg{color:var(--stone)}
  .state-quiet{margin:12px 0 4px;font:400 13px/1.55 var(--sans);color:var(--text-muted)}
  .state-quiet .u-link{margin-left:2px;text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  .state-loading{background:var(--well);border-color:var(--line)}
  .state-loading .state-dots{display:inline-flex;gap:5px;margin-top:6px}
  .state-loading .state-dots i{width:6px;height:6px;border-radius:50%;background:var(--stone);
    animation:bv-pulse 1.2s var(--bv-ease) infinite}
  .state-loading .state-dots i:nth-child(2){animation-delay:.2s}
  .state-loading .state-dots i:nth-child(3){animation-delay:.4s}
  @keyframes bv-pulse{0%,100%{opacity:.35}50%{opacity:1}}
  .state-error{background:var(--err-tint);border-color:transparent;color:var(--text)}
  .state-error svg,.state-error .state-what{color:var(--err)}
  .state-unreachable{background:var(--needs-tint);border-color:transparent;color:var(--text)}
  .state-unreachable svg,.state-unreachable .state-what{color:var(--needs)}
  .state-behind{background:var(--well);border-color:var(--line);color:var(--text)}
  .state-behind svg,.state-behind .state-what{color:var(--text)}
  body:has([data-state="unreachable"]) form[method="POST" i] button,
  body:has([data-state="unreachable"]) form[method="POST" i] [type="submit"]{opacity:.45;pointer-events:none;cursor:not-allowed}
${CHIP_CSS}`;

// BASE_CSS: the ground every page stands on (the shell and the standalone sign-in)
export const BASE_CSS = `
  *{box-sizing:border-box}
  html{background:var(--page);-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--page);color:var(--text);font:400 14px/1.55 var(--sans);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
  a{color:inherit;text-decoration:none}
  svg{display:block}
  button,input,select,textarea{font:inherit;color:inherit}
  code,kbd,samp,.mono{font-family:var(--mono)}
  ::selection{background:var(--accent-tint);color:var(--text)}
  :focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  a:not([class]):focus-visible,summary:focus-visible,.u-link:focus-visible{border-radius:4px}
  input:not([type="radio"]):not([type="checkbox"]):focus-visible,textarea:focus-visible,select:focus-visible{outline-color:var(--field-ring)}
  .u-uchan .uc-line{stroke:var(--uchan-line,#1C1917)}
  .u-uchan .uc-rim{stroke:var(--uchan-rim,#1C1917)}
  .u-uchan .uc-key{stroke:var(--uchan-key,none)}
  .u-uchan-sm .uc-line,.u-uchan-sm .uc-rim{stroke-width:11}
  .u-uchan-sm .uc-key{stroke-width:19}
  details:not([open])>:not(summary){display:none}
  .u-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  ${BRAND_MOTION_CSS}`;

// UI_CSS: the shared parts (ui.js pageHeader · section · row · kv · metric · callLine · uchan; buttons and pills), ONE
// stylesheet every page gets from the shell. Type does the work: 28 / 16 / 14 / 12, Manrope for people's words, mono for
// ids, counts and times, the only ALL-CAPS the tiny mono label. No boxes inside boxes: hairlines and whitespace separate.
export const UI_CSS = `
  .page-head{margin:0 0 28px}
  .page-head .eyebrow,.eyebrow{font:500 12.5px/1.4 var(--sans);color:var(--text-faint);margin:0 0 8px}
  .page-head .page-scope{color:var(--text-faint)}
  .page-head h1{font:800 28px/1.2 var(--sans);letter-spacing:-.02em;margin:0;color:var(--text);text-wrap:balance}
  .page-head .lede,.lede{font-size:14px;line-height:1.55;color:var(--text-muted);max-width:72ch;margin:6px 0 0}
  .page-head.has-actions{display:flex;align-items:flex-end;justify-content:space-between;gap:16px 24px;flex-wrap:wrap}
  .page-head-text{min-width:0;flex:1 1 320px}
  .page-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .page-actions form{margin:0}
  .empty{font-size:13px;color:var(--text-muted);margin:.5rem 0 0;padding:1rem 0}
  .u-label{font:500 11px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint);margin:0}
  .u-section{margin:0 0 36px}
  .u-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 4px;padding:0 0 10px;border-bottom:1px solid var(--line)}
  .u-section-head h2{display:flex;align-items:baseline;gap:8px;margin:0;font:700 15px/1.3 var(--sans);letter-spacing:-.005em;color:var(--text)}
  .u-section-head h2.u-label{font:500 11px/1.4 var(--mono);letter-spacing:.08em;color:var(--text-faint)}
  .u-count{font:500 12px/1 var(--sans);color:var(--text-faint);letter-spacing:0;font-variant-numeric:tabular-nums}
  .u-section-aside{font-size:12.5px;color:var(--text-faint);display:flex;gap:12px;align-items:baseline}
  .u-link{font:500 13px/1.4 var(--sans);color:var(--text-muted);border-radius:4px;transition:color var(--dur-fast) var(--ease)}
  .u-link:hover{color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  .u-rows{list-style:none;margin:0;padding:0}
  .u-row{position:relative;display:flex;align-items:center;gap:14px;min-height:42px;padding:10px 0;border-top:1px solid var(--line);transition:background-color var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease)}
  .u-rows>.u-row:first-child{border-top-color:transparent}
  .u-row:hover{background:var(--hover);box-shadow:-12px 0 0 var(--hover),12px 0 0 var(--hover)}
  .u-row.foot{align-items:flex-start;padding:12px 0}
  .u-row-lead{flex:none;width:84px;display:flex;align-items:center}
  .u-row.foot .u-row-lead{padding-top:2px}
  .u-row-body{flex:1;min-width:0}
  .u-row-title{display:block;font:500 14px/1.5 var(--sans);color:var(--text);overflow-wrap:anywhere}
  a.u-row-title:hover{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  .u-row-context{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 16px;margin:0 0 -3px;padding:3px 0;overflow:hidden;font:400 11.5px/1.55 var(--mono);color:var(--text-faint)}
  .u-row-context>:not(:last-child)::after{content:none}
  .u-row-context>*::before{content:"\\00B7";display:inline-block;width:16px;margin-left:-16px;text-align:center;color:var(--line-strong)}
  .u-row-context .u-details{position:static}
  .u-row-context .u-pop{top:calc(100% - 4px);left:98px}
  .u-row-foot{display:flex;align-items:center;flex-wrap:wrap;gap:6px 16px;margin-top:6px}
  .u-row-foot .u-row-context{flex:1 1 240px;min-width:0;margin:-3px 0}
  .u-row-foot .u-row-actions{margin-left:auto}
  .u-row-meta{flex:none;font:400 12px/1.4 var(--sans);color:var(--text-faint);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .u-row-actions{flex:none;display:flex;align-items:center;gap:8px}
  .u-row-actions form{margin:0}
  .u-rows.compact .u-row{min-height:32px;padding:5px 0}
  .u-rows.compact .u-row-title{font-size:13px}
  .u-details{position:relative}
  .u-pop{position:absolute;left:0;top:calc(100% + 6px);z-index:25;width:min(440px,78vw);padding:12px 14px;font:400 13px/1.5 var(--sans);color:var(--text-muted);
    background:var(--surface);border:1px solid var(--line-strong);border-radius:10px;box-shadow:var(--shadow-pop);white-space:normal;text-align:left}
  .u-pop p{margin:0}
  .u-pop p+p,.u-pop p+.u-call,.u-pop .u-call+p{margin-top:8px}
  .u-letter{flex:none;font:600 11px/1 var(--mono);color:var(--text-faint)}
  .u-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;
    border:1px solid var(--line-strong);background:var(--surface);color:var(--text);font:600 13px/1 var(--sans);cursor:pointer;
    white-space:nowrap;list-style:none;transition:background-color var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}
  .u-btn::-webkit-details-marker{display:none}
  .u-btn:hover{background:var(--hover)}
  .u-btn.primary{background:var(--text);border-color:var(--text);color:var(--page)}
  .u-btn.primary:hover{background:color-mix(in srgb,var(--text) 84%,var(--page))}
  .u-btn.small{height:28px;padding:0 10px;font-size:12.5px;border-radius:7px}
  .u-btn.ghost{background:transparent;border-color:transparent;color:var(--text-muted)}
  .u-btn.ghost:hover{background:var(--hover);color:var(--text)}
  .u-btn:disabled,.u-btn[aria-disabled="true"]{opacity:.45;cursor:not-allowed}
  .u-btn .u-trunc{max-width:240px;overflow:hidden;text-overflow:ellipsis}
  .u-btn svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .u-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .u-pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;border:1px solid var(--line);
    background:transparent;color:var(--text-muted);font:500 12.5px/1 var(--sans);cursor:pointer;list-style:none;white-space:nowrap;
    transition:color var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease),background-color var(--dur-fast) var(--ease)}
  .u-pill::-webkit-details-marker{display:none}
  .u-pill:hover{color:var(--text);border-color:var(--line-strong)}
  .u-pill[aria-current="true"]{background:var(--well);border-color:var(--line-strong);color:var(--text)}
  .u-pill .u-count{font-size:11.5px}
  .u-pill svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .u-metric{min-width:0;padding:14px 20px 16px;border-left:1px solid var(--line)}
  .u-metric:first-child{border-left:0;padding-left:0}
  .u-metric-label{display:block;font:500 12.5px/1.3 var(--sans);color:var(--text-muted)}
  .u-metric-n{display:block;margin:6px 0 3px;font:600 28px/1.05 var(--display);color:var(--text);font-variant-numeric:tabular-nums}
  .u-metric-sub{display:block;font:400 12px/1.45 var(--sans);color:var(--text-faint)}
  .u-stats{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 22px;margin:8px 0 0;font:400 14px/1.5 var(--sans);color:var(--text-muted)}
  .u-stat b{font-weight:700;color:var(--text);font-variant-numeric:tabular-nums}
  .u-stat small{margin-left:2px;font-size:12.5px;color:var(--text-faint)}
  .u-call{display:flex;align-items:flex-start;gap:8px;margin:10px 0 0;padding:7px 6px 7px 12px;background:var(--well);border:1px solid var(--line);border-radius:8px}
  .u-call code{flex:1;min-width:0;font:400 12px/1.6 var(--mono);color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere}
  .u-copy{flex:none;display:grid;place-items:center;width:26px;height:26px;margin:-1px 0;border:0;border-radius:6px;background:transparent;color:var(--text-faint);cursor:pointer}
  .u-copy:hover{background:var(--hover);color:var(--text)}
  .u-copy[data-copied]{color:var(--ok)}
  .u-copy svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .u-avatar{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border-radius:50%;background:var(--well);color:var(--text);font:600 10.5px/1 var(--mono);letter-spacing:.02em}
  /* the avatar's tones (ui.js avatar): the brand's presence colours, for avatars, cursors and pins only, washed into the
     surface so the initials stay ink in Paper and light in Ink; stone is the quiet default. Sizes 20 · 28 · 40 · 64. */
  .u-avatar[data-tone="gold"]{background:color-mix(in srgb,var(--bv-gold) 26%,var(--surface))}
  .u-avatar[data-tone="sky"]{background:color-mix(in srgb,var(--bv-sky) 22%,var(--surface))}
  .u-avatar[data-tone="violet"]{background:color-mix(in srgb,var(--bv-violet) 22%,var(--surface))}
  /* the same tones on an SVG avatar's circle (Broadcast's live picture draws people inside its drawing): .u-av-fill */
  .u-av-fill{fill:var(--well)}
  .u-av-fill[data-tone="gold"]{fill:color-mix(in srgb,var(--bv-gold) 26%,var(--surface))}
  .u-av-fill[data-tone="sky"]{fill:color-mix(in srgb,var(--bv-sky) 22%,var(--surface))}
  .u-av-fill[data-tone="violet"]{fill:color-mix(in srgb,var(--bv-violet) 22%,var(--surface))}
  .u-avatar[data-size="20"]{width:20px;height:20px;font-size:8.5px}
  .u-avatar[data-size="40"]{width:40px;height:40px;font-size:13px}
  .u-avatar[data-size="64"]{width:64px;height:64px;font:600 21px/1 var(--display);letter-spacing:0}
  .u-tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:5px;font:600 10.5px/1 var(--mono);letter-spacing:.04em;white-space:nowrap}
  .u-tag.ok{background:var(--ok-tint);color:var(--ok)}
  .u-tag.needs{background:var(--needs-tint);color:var(--needs)}
  .u-tag.quiet{background:var(--well);color:var(--stone-text)}
  .u-source-sep{color:var(--text-faint)}
  .u-details>summary{list-style:none;cursor:pointer}
  .u-details>summary::-webkit-details-marker{display:none}
  .denied{padding:2rem;text-align:center;color:var(--text-muted)}
  .u-metric{position:relative}
  .u-copy{position:relative}
  .u-copy[data-copied]::after{content:"Copied";position:absolute;right:calc(100% + 6px);top:50%;transform:translateY(-50%);padding:2px 7px;border-radius:5px;
    background:var(--text);color:var(--page);font:500 11px/1.4 var(--sans);white-space:nowrap;pointer-events:none}
  @media (max-width:760px){.u-row-context .u-pop{left:0}}
  /* the logo: U-chan beside the lowercase Fredoka wordmark (ui.js logo) */
  .u-logo{display:inline-flex;align-items:center;line-height:1;color:var(--text)}
  .u-logo .u-uchan{flex:none;display:block}
  .u-logo-word{font-family:var(--display);font-weight:600;letter-spacing:-.02em;line-height:1;color:var(--text);transform:translateY(-.04em)}
  /* table (ui.js table): compact rows, a sticky header, numbers right-aligned; stacks to cards at phone width */
  .u-table-wrap{margin:0}
  .u-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;line-height:1.4}
  .u-table th{position:sticky;top:0;z-index:2;height:32px;padding:0 12px;background:var(--page);border-bottom:1px solid var(--line-strong);
    font:500 11px/1.3 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint);text-align:left;white-space:nowrap}
  .u-table td{height:32px;padding:6px 12px;border-bottom:1px solid var(--line);color:var(--text);vertical-align:middle;overflow-wrap:anywhere}
  .u-table th:first-child,.u-table td:first-child{padding-left:0}
  .u-table th:last-child,.u-table td:last-child{padding-right:0}
  .u-table .num{text-align:right;font-family:var(--sans);font-variant-numeric:tabular-nums;white-space:nowrap}
  .u-table tbody tr{transition:background-color var(--dur-fast) var(--ease)}
  .u-table tbody tr:hover td{background:var(--hover)}
  .u-table td a{color:var(--text)}
  .u-table td a:hover{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  @media (max-width:640px){
    .u-table,.u-table tbody,.u-table tr,.u-table td{display:block;width:100%}
    .u-table thead{display:none}
    .u-table tr{padding:10px 0;border-bottom:1px solid var(--line)}
    .u-table td{display:flex;justify-content:space-between;gap:16px;height:auto;padding:3px 0;border:0;text-align:right}
    .u-table td::before{content:attr(data-label);flex:none;font:500 11px/1.6 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint);text-align:left}
    .u-table td:first-child{display:block;padding-bottom:4px;text-align:left;font-weight:600}
    .u-table td:first-child::before{content:none}
    .u-table tbody tr:hover td{background:none}
  }
  /* pills joined into one segmented control (ui.js pills { segment: true }) */
  .u-seg{gap:0;flex-wrap:nowrap;display:inline-flex;padding:2px;border:1px solid var(--line);border-radius:9px;background:var(--well)}
  .u-seg .u-pill{height:26px;border:0;border-radius:7px;background:transparent}
  .u-seg .u-pill[aria-current="true"]{background:var(--surface);box-shadow:0 0 0 1px var(--line-strong)}
  /* progress (ui.js progress): the fill is a transform, never a width */
  .u-progress-block{min-width:0}
  .u-progress-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 6px;font:500 13px/1.4 var(--sans);color:var(--text)}
  .u-progress-head b{font:500 12px/1 var(--sans);color:var(--text-muted);font-variant-numeric:tabular-nums}
  .u-progress{position:relative;height:6px;border-radius:999px;background:var(--well);overflow:hidden}
  .u-progress-fill{position:absolute;inset:0;border-radius:inherit;background:var(--text);transform:scaleX(var(--p,0));transform-origin:left center}
  .u-progress[data-tone="ok"] .u-progress-fill{background:var(--ok)}
  .u-progress[data-tone="needs"] .u-progress-fill{background:var(--needs)}
  .u-progress[data-tone="stone"] .u-progress-fill{background:var(--stone)}
  .u-progress-sub{margin:6px 0 0;font-size:12px;line-height:1.45;color:var(--text-faint)}
  /* the meter chip (ui.js meterChip): quiet words over a hairline bar, one link to What is missing */
  .u-changed{display:inline-flex;align-items:center;margin:6px 0 0;font:500 12px/1.3 var(--sans);color:var(--text-muted);text-decoration:none;white-space:nowrap;font-variant-numeric:tabular-nums}
  .u-changed:hover{color:var(--text);text-decoration:underline;text-underline-offset:3px}
  .page-head h1+.u-changed{display:flex;width:max-content}
  /* breadcrumb (ui.js breadcrumb) */
  .u-crumbs ol{display:flex;flex-wrap:wrap;align-items:center;gap:2px 0;margin:0 0 10px;padding:0;list-style:none;font:500 13px/1.4 var(--sans);color:var(--text-faint)}
  .u-crumbs li{display:inline-flex;align-items:center;min-width:0}
  .u-crumbs li+li::before{content:"/";margin:0 8px;color:var(--line-strong)}
  .u-crumbs a{color:var(--text-muted);border-radius:4px}
  .u-crumbs a:hover{color:var(--text)}
  .u-crumbs [aria-current="page"]{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:48ch}
  /* spark (ui.js spark): a line or bars in the text's colours, a readout on hover or the arrow keys */
  .u-spark{position:relative;display:inline-block;margin:0;vertical-align:middle;border-radius:4px;line-height:0}
  .u-spark svg{display:block;overflow:visible}
  .u-spark-line{fill:none;stroke:var(--text-muted);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
  .u-spark-area{fill:var(--well);stroke:none}
  .u-spark-end{fill:var(--text)}
  .u-spark-cursor{fill:var(--surface);stroke:var(--text);stroke-width:1.5;opacity:0;transition:opacity var(--dur-fast) var(--ease)}
  .u-spark-bar{fill:var(--line-strong);transition:fill var(--dur-fast) var(--ease)}
  .u-spark-bar:last-child{fill:var(--text-muted)}
  .u-spark-bar[data-on]{fill:var(--text)}
  .u-spark[data-hover] .u-spark-cursor{opacity:1}
  .u-spark-read{position:absolute;bottom:calc(100% + 4px);left:0;padding:2px 6px;border-radius:5px;background:var(--text);color:var(--page);
    font:500 11px/1.4 var(--sans);white-space:nowrap;pointer-events:none;opacity:0;transform:translateX(-50%);transition:opacity var(--dur-fast) var(--ease);font-variant-numeric:tabular-nums}
  .u-spark[data-hover] .u-spark-read{opacity:1}
`;

// MOTION_CSS: the motion hooks (ui.js MOTION). ALL of it sits behind html.u-motion, which the boot script sets only when the
// person has not asked for reduced motion: without it (no JS, reduced motion) every final state renders at once. Transform
// and opacity only (the spark's line draws with a dash offset, a paint), the brand's one curve, 120 to 260 ms. An element
// the motion script observes (data-count, data-progress, data-spark) waits, hidden at its start, for its first view
// (.u-seen). The script marks the page html.u-js as it starts; a page whose script never ran shows every final state at
// 2.4 s (the -late animations), so a value is never lost to a broken script.
export const MOTION_CSS = `
  @keyframes u-rise{from{opacity:0;transform:translateY(6px)}}
  @keyframes u-fade{from{opacity:0}}
  @keyframes u-show{to{opacity:1}}
  @keyframes u-fill-in{from{transform:scaleX(0)}}
  @keyframes u-fill-late{from{transform:scaleX(0)}}
  @keyframes u-grow-in{from{transform:scaleY(0)}}
  @keyframes u-grow-late{from{transform:scaleY(0)}}
  @keyframes u-draw-in{from{stroke-dashoffset:1}}
  @keyframes u-draw-late{from{stroke-dashoffset:1}}
  @keyframes u-pulse{0%{opacity:0}35%{opacity:1}100%{opacity:0}}
  @keyframes u-pop-in{from{opacity:0;transform:translateY(-6px) scale(.985)}}
  @keyframes u-tick{from{transform:scale(.6);opacity:0}}
  @keyframes u-ping{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(2.8)}}
  .u-motion [data-reveal]{animation:u-rise 220ms var(--ease) backwards}
  .u-motion [data-reveal="2"]{animation-delay:40ms}
  .u-motion [data-reveal="3"]{animation-delay:80ms}
  .u-motion [data-reveal="4"]{animation-delay:120ms}
  .u-motion [data-reveal="5"]{animation-delay:160ms}
  .u-motion [data-reveal="6"]{animation-delay:200ms}
  .u-motion [data-enter]{animation:u-rise 220ms var(--ease) backwards}
  .u-motion [data-count]:not(.u-seen){opacity:0}
  .u-motion:not(.u-js) [data-count]:not(.u-seen){animation:u-show 1ms 2.4s forwards}
  .u-motion [data-progress]:not(.u-seen) .u-progress-fill{transform:scaleX(0)}
  .u-motion:not(.u-js) [data-progress]:not(.u-seen) .u-progress-fill{transform:scaleX(var(--p,0));animation:u-fill-late 1ms 2.4s backwards}
  .u-motion [data-progress].u-seen .u-progress-fill{animation:u-fill-in 260ms var(--ease) backwards}
  .u-motion [data-spark] .u-spark-line{stroke-dasharray:1 1}
  .u-motion [data-spark]:not(.u-seen) .u-spark-line{stroke-dashoffset:1}
  .u-motion [data-spark]:not(.u-seen) .u-spark-area,.u-motion [data-spark]:not(.u-seen) .u-spark-end{opacity:0}
  .u-motion [data-spark] .u-spark-bar{transform-box:fill-box;transform-origin:50% 100%}
  .u-motion [data-spark]:not(.u-seen) .u-spark-bar{transform:scaleY(0)}
  .u-motion:not(.u-js) [data-spark]:not(.u-seen) .u-spark-line{stroke-dashoffset:0;animation:u-draw-late 1ms 2.4s backwards}
  .u-motion:not(.u-js) [data-spark]:not(.u-seen) .u-spark-area,.u-motion:not(.u-js) [data-spark]:not(.u-seen) .u-spark-end{opacity:1;animation:u-fade 1ms 2.4s backwards}
  .u-motion:not(.u-js) [data-spark]:not(.u-seen) .u-spark-bar{transform:none;animation:u-grow-late 1ms 2.4s backwards}
  .u-motion [data-spark].u-seen .u-spark-line{animation:u-draw-in 260ms var(--ease) backwards}
  .u-motion [data-spark].u-seen .u-spark-area,.u-motion [data-spark].u-seen .u-spark-end{animation:u-fade 200ms var(--ease) 140ms backwards}
  .u-motion [data-spark].u-seen .u-spark-bar{animation:u-grow-in 220ms var(--ease) backwards;animation-delay:calc(var(--i,0) * 16ms)}
  [data-pulse]{position:relative;isolation:isolate}
  .u-pulse::after{content:"";position:absolute;inset:-6px -10px;border-radius:10px;background:var(--accent-tint);opacity:0;pointer-events:none;z-index:-1;animation:u-pulse 520ms var(--ease) 260ms 1}
  .u-btn,.u-pill,.rail-item,.pal-item{transition-property:background-color,border-color,color,box-shadow,transform}
  .u-motion .u-btn:active,.u-motion .u-pill:active,.u-motion .rail-item:active,.u-motion .pal-item:active{transform:scale(.97)}
  .u-motion .u-copy[data-copied]::after{animation:u-fade 160ms var(--ease)}
  .u-motion .u-copy[data-copied] svg{animation:u-tick 200ms var(--ease)}
`;

// PAGES: the page-identity register (M-ADR-008 T4): one row per served page key, its label, href,
// the vestigial nav group, owner-only / choice-only flags, its icon, and the off-nav rows' own
// labels. The rail draws from TABS, not from it (UI-B1a), but the register stays: it is the
// identity the platform board derives every console screen from (the brain's source/board/normalize.mjs
// reads this block by shape, from its opening line to the PUBLIC_KEYS comment below; keep each row's
// `key, label, href, group[, flags], icon` order). The anonymous rail (PUBLIC_PAGES) reads its labels
// and hrefs from here.
const PAGES = [
  { key: "projects", label: "Projects", href: "/projects", group: "Overview", choiceOnly: true,
    icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { key: "home", label: "Home", href: "/home", group: "Overview",
    icon: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>' },
  { key: "brief", label: "For you", href: "/brief", group: "Overview",
    icon: '<path d="M4 12h4l2 3h4l2-3h4"/><path d="M4 12V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/><path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/>' },
  { key: "audit", label: "Audit trail", href: "/audit", group: "Overview",
    icon: '<path d="M3 12h4l2 6 4-14 2 8h6"/>' },
  { key: "map", label: "Map", href: "/map", group: "Overview",
    icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>' },
  { key: "decisions", label: "Decisions", href: "/decisions", group: "Overview",
    icon: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>' },
  { key: "missing", label: "What is missing", href: "/missing", group: "Overview",
    icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1" stroke-dasharray="2 2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke-dasharray="2 2"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { key: "docs", label: "Docs", href: "/docs", group: "Overview",
    icon: '<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>' },
  { key: "library", label: "Library", href: "/library", group: "Overview",
    icon: '<path d="M4 4.5h4v15H4zM10 4.5h4v15h-4z"/><path d="m16.2 5.4 3.8-1 3 14.5-3.8 1z" transform="translate(-2.4 .4)"/>' },
  { key: "changes", label: "What changed", href: "/changes", group: "Overview",
    icon: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 3.5v4h4"/><path d="M12 7.5V12l3 2"/>' },
  { key: "goals", label: "Goals", href: "/goals", group: "Overview",
    icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>' },
  { key: "control", label: "Control", href: "/control", group: "Admin",
    icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>' },
  { key: "profile", offNav: "Your profile" },
  { key: "view", offNav: "Viewer" },
  { key: "transmission", offNav: "Contribution" },
  { key: "preview", offNav: "Preview" },
  { key: "question", offNav: "A question" },
];
// PUBLIC_KEYS: the tabs an ANONYMOUS visitor sees (QC5F82B90: the "public read set"), named
// directly. This set must equal the GATED_SURFACE-exempt GET pages in index.js (auth:"none"):
// docs and What is missing, nothing else, or the rail offers a link that redirects to sign-in. Their labels and
// hrefs come from PAGES, in PAGES order (missing, then docs).
const PUBLIC_KEYS = new Set(["docs", "missing"]);
const PUBLIC_PAGES = PAGES.filter((p) => PUBLIC_KEYS.has(p.key));

// TABS: THE EIGHT RULED TABS (Q322F3DF0): Home · Build · GTM · Goals · Decisions · Map · Broadcast ·
// Control is the console's ONLY IA vocabulary. All eight register now that each screen exists (GTM
// joined with its screen, UI-B10b; Broadcast with its screen, UI-B11b: the wire-selftest ratchet
// 7 -> 8). Each tab is a GROUPING of existing pages (views); every view href is a page that
// serves as it did. Each row keeps its `icon` key (the PAGES icon it borrows) in the `key, label, icon[, ownerOnly], views`
// order the platform board parses (normalize.mjs), closed by the "which tabs a role sees" comment. The rail draws
// its own outline set (RAIL_ICON below), keyed by the tab.
const TABS = [
  { key: "home", label: "Home", icon: "home",
    views: [{ key: "home", label: "Overview", href: "/home" }] },
  { key: "build", label: "Build", icon: "audit",
    views: [{ key: "build", label: "Build", href: "/build" }] },
  { key: "gtm", label: "GTM", icon: "goals",
    views: [{ key: "gtm", label: "GTM", href: "/gtm" }] },  // UI-B10b: ONE view (the artboard draws no view bar), third of the eight (Q322F3DF0), every seated reader (QC5F82B90)
  { key: "goals", label: "Goals", icon: "goals",
    views: [{ key: "goals", label: "Goals", href: "/goals" }] },  // UI-B6a: ONE view (the artboard draws no view bar); /missing is public and off the bar, the Scorecard is retired
  { key: "decisions", label: "Decisions", icon: "goals",
    views: [{ key: "decisions", label: "Decisions", href: "/decisions" }] },
  // the ruled relative order puts Map after Decisions (Q322F3DF0/Q36AF8BA1)
  { key: "map", label: "Map", icon: "eagle",
    views: [{ key: "map", label: "Map", href: "/map" }, { key: "versions", label: "Versions", href: "/versions" }] },  // the Map, ruled (owner, 2026-09-30): ONE canvas with layers, Arch and MCP as views in its own toolbar; the seven planes (Arch, System, Data, API, MCP, Flows, Deps) fold into it, each old URL opening the same page on its layer or view (OFFNAV_TAB lights the tab for them); Versions (UI-B5b) is a view, not a tab
  { key: "broadcast", label: "Broadcast", icon: "goals",
    views: [{ key: "broadcast", label: "Broadcast", href: "/broadcast" }] },  // UI-B11b: ONE view (the artboard draws no view bar), seventh of the eight after Map and before Control (Q322F3DF0), every seated reader (QC5F82B90)
  { key: "control", label: "Control", icon: "control",
    views: [{ key: "control", label: "Control", href: "/control" }] },
];
// which tabs a role sees: SEATED / ADMIN / ANONYMOUS (QC5F82B90). Every signed-in person sees all eight, Control included:
// the admin holds admin functions, not extra tabs, so a non-admin opens Control and sees each admin control DISABLED with its
// reason (QB963C7EE amended by F6, UI-B12b; Control is ONE view, Desk, Charts and Pack retired); an anonymous visitor gets
// PUBLIC_PAGES only. (tabsFor still honours a row's ownerOnly; no row carries one.)
// Off-nav detail pages highlight the tab they BELONG to (a contribution is Build's, a question Decisions', a plane the Map's).
// THE rule (L4, 2026-10-02): a page that belongs to no tab lights the tab it was reached from when the address says so
// (?from=<tab>, src/index.js stamps it on the request), else NO tab; the pages the rail's own tools open light that tool
// instead (RAIL_TOOL_OF: the Library and a search light Search, What changed lights What changed). What is missing, a doc,
// a card, Projects and the guide belong to no tab.
const OFFNAV_TAB = { transmission: "build", preview: "build", view: "build", question: "decisions", audit: "control", regrade: "map",
  arch: "map", data: "map", api: "map", mcp: "map", flows: "map", deps: "map", screens: "map" };
const RAIL_TOOL_OF = { library: "search", changes: "changes" };
// the palette's crumbs: where the off-nav pages it lists sit (a grouping for the eye, not the rail's lit tab)
const PALETTE_UNDER = { library: "home", changes: "home", missing: "home", audit: "control", docs: "home" };   // UI-B12b: /audit is Control's audit trail (the program's KEEP; wf-control open-audit), off the bar, and lights Control; the /thread page is retired (Q893B08A5). UI-B6a: /missing (public, PUBLIC_KEYS) left the Goals view bar and lights the Goals tab for a seated reader
// TAB_HOME: where a tab lands when it is not its first view (kept outside TABS, whose shape the board parses). The Map's
// first view is the Map itself (GET /map) since the planes folded into it.
const TAB_HOME = { map: "/map" };
export function tabOf(pageKey, from = "") {
  const t = TABS.find((t) => t.views.some((v) => v.key === pageKey));
  if (t) return t.key;
  if (OFFNAV_TAB[pageKey]) return OFFNAV_TAB[pageKey];
  return RAIL_TOOL_OF[pageKey] ? "" : fromTab(from);
}
// fromTab(from) — a ?from= value names a tab only when it IS one of the eight (anything else lights nothing)
export const fromTab = (from) => (TABS.some((t) => t.key === from) ? String(from) : "");
function tabsFor(owner) {
  return owner ? TABS : TABS.filter((t) => !t.ownerOnly);
}
function viewsFor(tab, owner, anonymous) {
  return tab.views.filter((v) => (!v.ownerOnly || owner) && (!anonymous || PUBLIC_KEYS.has(v.key)));
}
// a registry row's href, drawn under the request's org (src/orgpath.js): the rows hold the route, the rail draws the address
const viewHref = (v) => orgPath(v.href);
// a view marked plane stays in the Ink world whichever world the person reads in. None is marked since the Map follows the
// person's world (owner, 2026-09-30: the Map looks right in Paper and in Ink).
const isPlane = (key) => TABS.some((t) => t.views.some((v) => v.key === key && v.plane));

// The rail's icons: ONE outline set, drawn for it (24px grid, 1.75 stroke, round caps and joins: the U-chan line at 18px),
// embedded, no icon font, no CDN. Keyed by the tab (and the two public pages).
const RAIL_ICON = {
  home: '<path d="M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  build: '<path d="M12 3.8 3.8 8 12 12.2 20.2 8z"/><path d="m3.8 12 8.2 4.2 8.2-4.2"/><path d="m3.8 16 8.2 4.2 8.2-4.2"/>',
  gtm: '<path d="M4 5h16l-6.2 7.4V18l-3.6 2v-7.6z"/>',
  goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  decisions: '<path d="M12 3v18"/><path d="M5 5.5h10.5L18 8l-2.5 2.5H5z"/><path d="M19 12.5H8.5L6 15l2.5 2.5H19z"/>',
  map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
  broadcast: '<circle cx="12" cy="12" r="1.8"/><path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13"/>',
  control: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  missing: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" stroke-dasharray="2 2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" stroke-dasharray="2 2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  docs: '<path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M13.5 3.5V8H18M8.5 12.5h7M8.5 16h5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6.5-2.5 7.5-2.5 8.5h17c0-1-2.5-2-2.5-8.5"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
  system: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M9 20h6M12 16v4"/>',
  light: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v1.8M12 19.2V21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M3 12h1.8M19.2 12H21M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"/>',
  dark: '<path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7z"/>',
  signout: '<path d="M9.5 20.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5h3.5"/><path d="m15.5 16.5 4.5-4.5-4.5-4.5"/><path d="M20 12H9.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  updown: '<path d="m8.5 9.5 3.5-3.5 3.5 3.5M8.5 14.5l3.5 3.5 3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${RAIL_ICON[k] || ""}</svg>`;


// The VIEW bar above the content: the active tab's views, the current page marked. Rendered only when there is more than
// one view to choose from (today: the Map's planes and Versions), with the version chip on its right (on every view but
// Versions itself, whose own head names the version: D6a, the state said once).
function renderViewBar(active, owner, anonymous, head = null) {
  const t = TABS.find((t) => t.key === tabOf(active));
  if (!t) return "";
  const vs = viewsFor(t, owner, anonymous);
  if (vs.length < 2) return "";
  return `<nav class="viewbar" aria-label="Views" data-views="${esc(t.key)}"><div class="viewbar-items">${vs.map((v) => {
    const cur = v.key === active;
    // a Map plane chip (wf-map-* button plane-switch, client-side: it switches the Map plane; its href is the plane's own door)
    const plane = v.plane ? ' data-button="plane-switch" data-client="switches the Map plane"' : "";
    return `<a class="view-item" href="${esc(viewHref(v))}" data-view="${esc(v.key)}"${plane}${cur ? ' aria-current="page"' : ""}>${esc(v.label)}</a>`;
  }).join("")}</div>${t.key === "map" && !anonymous && active !== "versions" ? versionChip(head) : ""}</nav>`;   // D6a: never on Versions itself (its own head says it)
}
// versionChip(head) — the version chip on the right of every Map view's bar (wireframe wf-versions button version-chip,
// door GET /versions): the ONE state chip (ui.js stateChip, QB74B1B7E) reading "v12 · current" on the LANDED tokens, or
// "Not versioned yet" before the owner makes v1 with publish_version.
export function versionChip(head) {
  const n = head && Number.isFinite(Number(head.n)) ? Number(head.n) : null;
  const chip = n != null ? stateChip("LANDED", `v${n} · current`) : stateChip("pending", "Not versioned yet");
  // copy: off-screen (the version chip's title)
  const title = n != null ? `v${n} is the current version: see why each version exists` : "No version yet: the owner makes v1 with publish_version";
  return `<a class="version-chip" href="${esc(orgPath("/versions"))}" data-button="version-chip" data-door="GET /versions" title="${esc(title)}">${chip}</a>`;
}

// The destinations (region `tabs`): each links to its first visible view (TAB_HOME aside); the current one carries
// aria-current="true" and the accent tint, the ONE accent in the chrome. Semantic hooks: data-tab="<key>" on each item
// (in the order href, data-tab, aria-current), its label in .rail-label, the "needs you" count as data-badge. Control,
// every signed-in reader's (UI-B12b), is last and set apart. An anonymous visitor gets the public pages only.
// navModel(active, owner, anonymous) — THE destinations a reader may open, in rail order: [{ key, label, href, cur, end,
// views: [{ key, label, href }] }] (views only when a tab has more than one: the Map's planes and Versions). The rail
// (renderNav) and the command palette (renderPalette) both draw from it, so the palette can never offer a page the rail
// does not: an anonymous visitor gets PUBLIC_PAGES alone.
function navModel(active, owner, anonymous, from = "") {
  if (anonymous) return PUBLIC_PAGES.map((p) => ({ key: p.key, label: p.label, href: orgPath(p.href), cur: p.key === active, end: false, views: [] }));
  const curTab = tabOf(active, from);
  return tabsFor(owner).map((t) => {
    const vs = viewsFor(t, owner, false);
    if (!vs[0]) return null;
    return { key: t.key, label: t.label, href: TAB_HOME[t.key] ? orgPath(TAB_HOME[t.key]) : viewHref(vs[0]), cur: t.key === curTab, end: t.key === "control",
      views: vs.length > 1 ? vs.map((v) => ({ key: v.key, label: v.label, href: viewHref(v), cur: v.key === active })) : [] };
  }).filter(Boolean);
}
// the off-nav pages a seated reader reaches from a destination (their labels and hrefs are PAGES rows, their tab OFFNAV_TAB):
// the palette lists them under the tab they light. Never for an anonymous visitor (the public pages are the rail itself).
const PALETTE_RELATED = ["library", "changes", "missing", "audit", "docs"];
function renderNav(active, owner, briefCount, anonymous, from = "") {
  const item = (d, badge = "") =>
    `<a class="rail-item${d.end ? " rail-end" : ""}" href="${esc(d.href)}" data-tab="${esc(d.key)}"${d.cur ? ' aria-current="true"' : ""}>${icon(d.key)}<span class="rail-label">${esc(d.label)}</span>${badge}</a>`;
  // the felt-loop count (what waits on you: questions to rule, filings to approve, grants) sits on Home ONCE: Home lists all
  // of it; Decisions holds only the questions, so a second copy of the same number there over-promised what it lists
  const items = navModel(active, owner, anonymous, from).map((d) => item(d, !anonymous && d.key === "home" && briefCount > 0
    ? `<span class="rail-badge" data-badge="needs-you" title="${esc(briefCount)} waiting on you">${esc(briefCount)}</span>` : "")).join("");
  return `<nav class="rail-nav" data-region="tabs" aria-label="Tabs">${items}</nav>`;
}

// The project switcher (region `project-switcher`, button `project-switch`, door POST /project):
// the person's projects, read server-side from their seats (src/index.js projectSeatsFor, the same
// list whoami answers). A native <details> disclosure in the rail; each option is its own POST /project form.
function renderProjChip(proj, owner) {
  if (!proj) {
    // no choice to offer and no seat to name (or a page that asks for no switcher, the picker itself):
    // the honest scope, never an empty region. The owner reads the org rollup; anyone else is pointed
    // at the picker, which lists the projects they hold.
    return owner
      ? `<span class="proj-switch proj-static" data-region="project-switcher" title="The scope every page reads"><span>All projects</span></span>`
      : `<a class="proj-switch proj-static" data-region="project-switcher" href="${esc(orgPath("/projects"))}" title="The projects you hold"><span>Projects</span></a>`;
  }
  const cur = proj.current || null;
  const label = cur ? cur.name : "All projects";
  if (proj.static) return `<span class="proj-switch proj-static" data-region="project-switcher" title="Your project in this org"><span>${esc(label)}</span></span>`;
  const optForms = (proj.options || [])
    .map((o) => {
      const isCur = !!(cur && cur.key === o.key);
      return `<form method="POST" action="${esc(orgPath("/project"))}"><input type="hidden" name="key" value="${esc(o.key)}"><button type="submit"${isCur ? ' aria-current="true"' : ""}>${esc(o.name)}${isCur ? icon("check") : ""}</button></form>`;
    })
    .join("");
  const allForm = proj.orgEntry
    ? `<form method="POST" action="${esc(orgPath("/project"))}"><input type="hidden" name="key" value=""><button type="submit"${!cur ? ' aria-current="true"' : ""}>All projects${!cur ? icon("check") : ""}</button></form>`
    : "";
  return `<details class="proj-switch pop" data-region="project-switcher" data-button="project-switch" data-door="POST /project"><summary aria-label="Switch project"><span>${esc(label)}</span>${icon("updown")}</summary><div class="proj-menu">${optForms}${allForm}</div></details>`;
}

// THE ORG SWITCHER (region `org-switcher`, sprint 7, 7.4b; PLATFORM §2 item 8): the org's name at the top of the rail, and, for an
// ACCOUNT session whose account holds seats in several orgs (src/index.js servePage: orgs, the account's own, one read), a quiet
// disclosure under it listing those orgs, each a link to its Home (/<org>/home: the session reads as the account's seat there).
// A seat session, a bearer and a one-org account get the name alone.
function renderOrgName(brand, orgs) {
  const name = esc((brand && brand.org) || "");
  if (!Array.isArray(orgs) || orgs.length < 2) return `<span class="rail-org" data-region="org-name">${name}</span>`;
  const here = orgBase().slice(1);
  const opts = orgs.map((o) => {
    const cur = o.slug === here;
    return `<a href="${esc(orgAt(o.slug))}" data-org="${esc(o.slug)}"${cur ? ' aria-current="true"' : ""}><span class="org-opt"><span class="org-opt-name">${esc(o.name)}</span><span class="org-opt-addr">/${esc(o.slug)}</span></span>${cur ? icon("check") : ""}</a>`;
  }).join("");
  return `<details class="org-switch pop" data-region="org-switcher" data-button="org-switch"><summary class="rail-org" data-region="org-name" aria-label="Switch org" title="Switch org"><span>${name}</span>${icon("updown")}</summary><div class="proj-menu org-menu">${opts}</div></details>`;
}

// Search (region `search`, door GET /search, sprint 3 B5): the rail's Search item opens the COMMAND PALETTE (renderPalette), where the
// project's items are found by id or name (read client-side, on demand) beside the destinations, the projects and the
// theme. Cmd/Ctrl+K and "/" open it too.
function renderSearch(lit = false) {
  return `<button type="button" class="rail-item rail-tool" id="tbSearch" data-region="search" data-button="search" data-door="GET /search" data-client="fetch" data-pal-open aria-haspopup="dialog" aria-controls="pal" aria-label="Search" title="Search this project"${lit ? ' aria-current="true"' : ""}>${icon("search")}<span class="rail-label">Search</span><kbd class="rail-kbd" data-kbd-mod>&#8984;K</kbd></button>`;
}

// THE COMMAND PALETTE: one keyboard-first way to move and find. A modal dialog over the page (outside .app, which goes inert
// while it is open), drawn ONCE per page from what the shell already holds: no route, no D1 statement. Its static items:
//   Go to     every destination of navModel (the rail's own list), each tab's views (the Map's planes, Versions), and for a
//             seated reader the off-nav pages PALETTE_RELATED names (under the tab they light)
//   Project   the reader's OWN projects (proj.options, the switcher's list; "All projects" for the owner), each pressing the
//             switcher's own POST /project form (the same form, the same same-origin CSRF rule)
//   Theme     follow the system · Paper · Ink (it presses the rail's own theme switch)
//   You       what changed (opens the rail's panel) · your profile · sign out (a session cookie only); Sign in when anonymous
// and, for a seated reader, as they type: everything in the project they may read, from GET /search (the search door, already
// filtered by role), debounced, the first 8. Keys: Up/Down move (the first item is preselected), Enter goes, Esc closes;
// aria-activedescendant on the combobox, focus trapped while open and returned where it was.
function renderPalette({ active, owner, anonymous, proj, reader, orgs = null }) {
  let n = 0;
  const nextId = () => `pal-o${n++}`;
  const opt = (inner, { href = "", act = "", words = "", attrs = "" } = {}) => href
    ? `<a class="pal-item" role="option" id="${nextId()}" tabindex="-1" href="${esc(href)}" data-pal-static${words ? ` data-words="${esc(words)}"` : ""}${attrs ? ` ${attrs}` : ""}>${inner}</a>`
    : `<div class="pal-item" role="option" id="${nextId()}" tabindex="-1" data-pal-static data-pal-act="${esc(act)}"${words ? ` data-words="${esc(words)}"` : ""}${attrs ? ` ${attrs}` : ""}>${inner}</div>`;
  const label = (text, hint = "", crumb = "") => `<span class="pal-label">${crumb ? `<span class="pal-crumb">${esc(crumb)}</span><span class="pal-sep">/</span>` : ""}${esc(text)}</span>${hint ? `<span class="pal-hint">${esc(hint)}</span>` : ""}`;
  const group = (key, title, items) => items.length ? `<div class="pal-group" role="group" aria-labelledby="pal-h-${key}" data-pal-group><p class="pal-h" id="pal-h-${key}">${esc(title)}</p>${items.join("")}</div>` : "";
  const model = navModel(active, owner, anonymous);
  const go = [];
  for (const d of model) {
    go.push(opt(`${icon(d.key)}${label(d.label, d.cur ? "here" : "")}`, { href: d.href, words: `${d.key} ${d.label}`, attrs: `data-pal-dest="${esc(d.key)}"` }));
    for (const v of d.views) go.push(opt(`${icon(d.key)}${label(v.label, v.cur ? "here" : "", d.label)}`, { href: v.href, words: `${d.label} ${v.key} ${v.label}` }));
  }
  if (!anonymous) for (const k of PALETTE_RELATED) {
    const p = PAGES.find((x) => x.key === k), tab = model.find((d) => d.key === PALETTE_UNDER[k]);
    if (p && p.href && tab) go.push(opt(`${icon(RAIL_ICON[k] ? k : tab.key)}${label(p.label, p.key === active ? "here" : "", tab.label)}`, { href: orgPath(p.href), words: `${tab.label} ${p.key} ${p.label}` }));
  }
  // the reader's own projects, from the switcher's own list (never another reader's): each presses that form
  const projItems = [];
  if (!anonymous && proj && !proj.static) {
    const cur = proj.current || null;
    for (const o of proj.options || []) projItems.push(opt(`${icon("updown")}${label(`Switch to ${o.name}`, cur && cur.key === o.key ? "current" : "")}`, { act: "project", words: `project switch ${o.key} ${o.name}`, attrs: `data-key="${esc(o.key)}"` }));
    if (proj.orgEntry) projItems.push(opt(`${icon("updown")}${label("Switch to all projects", !cur ? "current" : "")}`, { act: "project", words: "project switch all projects org", attrs: 'data-key=""' }));
  }
  // the reader's account's OTHER orgs (the rail's org switcher's own list, sprint 7, 7.4b): each a link to its Home
  const here = orgBase().slice(1);
  const orgItems = !anonymous && Array.isArray(orgs) && orgs.length > 1
    ? orgs.filter((o) => o.slug !== here).map((o) => opt(`${icon("updown")}${label(`Switch to ${o.name}`, "/" + o.slug)}`, { href: orgAt(o.slug), words: `org switch ${o.slug} ${o.name}` }))
    : [];
  const themes = [["system", "Follow the system"], ["light", "Paper"], ["dark", "Ink"]].map(([k, t]) => opt(`${icon(k)}${label(`Theme: ${t}`)}<span class="pal-hint" data-on-hint></span>`, { act: "theme", words: `theme appearance ${k} ${t} ${k === "light" ? "light mode" : k === "dark" ? "dark mode" : ""}`, attrs: `data-theme-set="${k}"` }));
  const you = anonymous
    ? [opt(`${icon("signout")}${label("Sign in")}`, { href: "/login", words: "sign in log in login" })]
    : [opt(`${icon("bell")}${label("What changed since you were last here")}`, { act: "beat", words: "notifications what changed updates" }),
       opt(`${icon("home")}${label("Your profile")}`, { href: orgPath("/profile"), words: "profile account me you" }),
       ...(reader && reader.viaCookie ? [opt(`${icon("signout")}${label("Sign out")}`, { href: "/logout", words: "sign out log out logout" })] : [])];
  const field = `${icon("search")}<input id="pal-q" type="search" name="q" data-input-exception="search" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" aria-activedescendant="" aria-label="${anonymous ? "Go to a page" : "Go to a page, switch project, or search this project"}" placeholder="${anonymous ? "Go to a page" : "Go to, switch or search"}" autocomplete="off" spellcheck="false"><kbd class="pal-esc">esc</kbd>`;
  const find = anonymous ? "" : `<div class="pal-group" role="group" aria-labelledby="pal-h-find" data-pal-find hidden><p class="pal-h" id="pal-h-find">In this project</p><div id="tbFindOut" class="pal-find"></div></div>`;
  return `<div class="pal" id="pal" hidden>
  <div class="pal-scrim" data-pal-close></div>
  <div class="pal-box" role="dialog" aria-modal="true" aria-label="Command palette">
    ${anonymous ? `<div class="pal-field">${field}</div>` : `<form class="pal-field" id="tbFind" method="GET" action="${esc(orgPath("/library"))}" role="search">${field}</form>`}
    <div class="pal-scroll"><div class="pal-list" id="pal-list" role="listbox" aria-label="${anonymous ? "Pages and settings" : "Pages, projects, settings and results"}">${group("go", "Go to", go)}${group("project", "Project", projItems)}${group("org", "Org", orgItems)}${group("theme", "Theme", themes)}${group("you", anonymous ? "Account" : "You", you)}${find}</div><p class="pal-none" hidden>Nothing matches</p></div>
    <p class="u-sr" id="pal-live" aria-live="polite"></p>
    <p class="pal-foot" aria-hidden="true"><span><kbd>&#8593;</kbd><kbd>&#8595;</kbd> move</span><span><kbd>&#8629;</kbd> go</span><span><kbd>esc</kbd> close</span></p>
  </div>
</div>`;
}

// Notifications (region `notifications`, door GET /updates): what changed in your lane since you
// were last here, fetched when the panel opens (a read; never on page load).
function renderNotifications(lit = false) {
  return `<details class="pop rail-tool" id="tbBeat" data-region="notifications" data-button="notifications" data-door="GET /updates" data-client="fetch">
      <summary class="rail-item" aria-label="What changed" title="What changed since you were last here"${lit ? ' aria-current="true"' : ""}>${icon("bell")}<span class="rail-label">What changed</span></summary>
      <div class="pop-panel"><div class="pop-out" id="tbBeatOut"><p class="pop-muted">Reading</p></div></div>
    </details>`;
}

// The person (region `avatar`, door GET /profile): their avatar (their initials on their tone, src/hats.js avatarOf), name
// and hat at the rail's foot (migrate-044: the first hat they wear, and their role when it is not Member; no hat: the role),
// the theme switch and sign-out beside them. A no-reader render gets a plain Sign in link, never a fabricated identity.
function renderPerson(reader) {
  if (!reader) return `<a class="u-btn primary rail-signin" data-region="avatar" href="/login">Sign in</a>`;
  const label = String(reader.name || reader.role || "You").trim() || "You";
  const av = avatarOf({ ...reader, name: label });
  const hats = hatsOf(reader.hats), cls = roleClassOf(reader.role);
  const hat = hats.length ? hatOf(hats[0]).label + (hats.length > 1 ? ` +${hats.length - 1}` : "") : "";
  const line = [hat, !hat || cls !== "member" ? roleWordOf(reader.role) : ""].filter(Boolean).join(" · ");
  return `<a class="rail-person" data-region="avatar" data-button="avatar" data-door="GET /profile" href="${esc(orgPath("/profile"))}" title="${esc(label)}: your profile" aria-label="${esc(label)}, your profile">${avatar({ initials: av.initials, tone: av.tone })}<span class="rail-person-text"><span class="rail-person-name">${esc(label)}</span><span class="rail-person-role">${esc(line)}</span></span></a>`;
}
function renderSignOut(reader) {
  if (!reader) return "";
  return reader.viaCookie
    ? `<a class="rail-icon" href="/logout" title="Sign out" aria-label="Sign out">${icon("signout")}</a>`
    : `<span class="rail-icon disabled" title="Reader-key link: no session to sign out of" aria-label="No session to sign out of">${icon("signout")}</span>`;
}
// the theme switch: follow the system, Paper, or Ink, remembered in this browser (THEME_BOOT applies it before paint)
const THEME_SWITCH = `<div class="theme-switch" role="radiogroup" aria-label="Theme">${[["system", "Follow the system"], ["light", "Paper"], ["dark", "Ink"]]
  .map(([k, t]) => `<button type="button" role="radio" aria-checked="${k === "system" ? "true" : "false"}" data-theme-choice="${k}" data-client="switches the theme, remembered in this browser" title="${t}" aria-label="${t}">${icon(k)}</button>`).join("")}</div>`;

// SHELL_CSS: the rail, the view bar, the popovers and the content frame
const SHELL_CSS = `
  :root{--rail-w:224px;--bar-h:53px}
  .app{display:grid;grid-template-columns:var(--rail-w) minmax(0,1fr);min-height:100vh}
  .shell-rail{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;min-width:0;background:var(--rail);border-right:1px solid var(--line);z-index:20}
  .rail-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 14px 10px 16px}
  .rail-mark{display:inline-flex;align-items:center;gap:8px;padding:2px 4px 2px 2px;margin-left:-2px;border-radius:8px;color:var(--text)}
  .rail-mark .u-uchan{width:20px;height:22px}
  .rail-menu,.rail-find{display:none}
  .rail-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:2px 10px 10px}
  .rail-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;margin:0 -10px;padding:0 10px 8px}
  .rail-scope{position:relative;z-index:3;padding:4px 0 10px}
  .rail-org{display:block;padding:0 10px;margin:0 0 4px;font:500 12px/1.4 var(--sans);color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .org-switch{position:relative;margin:0 0 4px}
  .org-switch>summary.rail-org{display:flex;align-items:center;gap:2px;width:max-content;max-width:100%;margin:0;padding:2px 4px 2px 10px;border-radius:6px;cursor:pointer;
    transition:background-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)}
  .org-switch>summary.rail-org span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .org-switch>summary.rail-org:hover,.org-switch[open]>summary.rail-org{background:var(--hover);color:var(--text-muted)}
  .org-switch>summary svg{width:12px;height:12px;flex:none;fill:none;stroke:var(--text-faint);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .org-menu a{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:36px;padding:6px 9px;border-radius:6px;color:var(--text);text-decoration:none;
    transition:background-color var(--dur-fast) var(--ease)}
  .org-menu a:hover{background:var(--hover)}
  .org-menu a:focus-visible{outline-offset:-2px}
  .org-menu a[aria-current="true"] .org-opt-name{font-weight:700}
  .org-menu svg{width:15px;height:15px;flex:none;fill:none;stroke:var(--text-muted);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .org-opt{display:flex;flex-direction:column;gap:1px;min-width:0}
  .org-opt-name{font:500 13px/1.3 var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .org-opt-addr{font:400 11px/1.3 var(--mono);color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .u-motion .org-switch[open] .proj-menu{animation:u-pop-in 140ms var(--ease) backwards}
  .proj-switch{position:relative}
  .proj-switch>summary,.proj-static{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:34px;padding:0 8px 0 10px;
    border:1px solid var(--line);border-radius:8px;background:var(--surface);font:600 13.5px/1 var(--sans);color:var(--text);cursor:pointer;list-style:none;
    transition:background-color var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}
  .proj-switch>summary span,.proj-static span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .proj-switch>summary:hover,a.proj-static:hover{background:var(--hover);border-color:var(--line-strong)}
  .proj-switch[open]>summary{background:var(--hover);border-color:var(--line-strong)}
  .proj-static{cursor:default}
  a.proj-static{cursor:pointer}
  .proj-switch svg{width:15px;height:15px;flex:none;fill:none;stroke:var(--text-faint);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .proj-menu{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;max-height:min(50vh,320px);overflow:auto;padding:4px;
    border:1px solid var(--line-strong);border-radius:10px;background:var(--surface);box-shadow:var(--shadow-pop)}
  .u-motion .proj-switch[open] .proj-menu{animation:u-pop-in 140ms var(--ease) backwards}
  .proj-menu form{margin:0}
  .proj-menu button{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:32px;padding:6px 9px;border:0;border-radius:6px;
    background:none;font:500 13px/1.3 var(--sans);color:var(--text);text-align:left;cursor:pointer;transition:background-color var(--dur-fast) var(--ease)}
  .proj-menu button:hover{background:var(--hover)}
  .proj-menu button:focus-visible{outline-offset:-2px}
  .proj-menu button[aria-current="true"]{font-weight:700}
  .proj-menu button svg{stroke:var(--text-muted)}
  .rail-tools{display:flex;flex-direction:column;gap:1px;padding:4px 0 8px;border-bottom:1px solid var(--line);margin:0 0 8px}
  .rail-nav{display:flex;flex-direction:column;gap:1px}
  .rail-item{display:flex;align-items:center;gap:10px;width:100%;height:34px;padding:0 10px;border:0;border-radius:8px;background:none;list-style:none;cursor:pointer;
    color:var(--text-muted);font:500 13.5px/1 var(--sans);text-align:left;white-space:nowrap;
    transition:background-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)}
  .rail-item::-webkit-details-marker{display:none}
  .rail-item svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .rail-item:hover,.pop[open]>.rail-item{background:var(--hover);color:var(--text)}
  .rail-item[aria-current="true"]{background:var(--accent-tint);color:var(--accent-text);font-weight:600}
  .rail-label{overflow:hidden;text-overflow:ellipsis}
  .rail-badge{margin-left:auto;min-width:20px;padding:3px 6px;border-radius:999px;background:var(--needs-tint);color:var(--needs);
    font:600 11px/1 var(--sans);text-align:center;font-variant-numeric:tabular-nums}
  .rail-kbd{margin-left:auto;min-width:20px;padding:2px 5px;border:1px solid var(--line);border-radius:5px;background:var(--page);
    color:var(--text-faint);font:500 11px/1.2 var(--mono);text-align:center}
  .rail-end{margin-top:12px;position:relative}
  .rail-end::before{content:"";position:absolute;left:10px;right:10px;top:-7px;border-top:1px solid var(--line)}
  .rail-foot{flex:none;padding:10px 0 0;border-top:1px solid transparent}
  .rail-person{display:flex;align-items:center;gap:10px;min-width:0;padding:6px 8px;border-radius:8px;transition:background-color var(--dur-fast) var(--ease)}
  .rail-person:hover{background:var(--hover)}
  .rail-person-text{display:flex;flex-direction:column;min-width:0}
  .rail-person-name{font:600 13px/1.3 var(--sans);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rail-person-role{font:400 12px/1.3 var(--sans);color:var(--text-faint);text-transform:none}
  .rail-foot-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 6px 0 8px}
  .theme-switch{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--line);border-radius:8px;background:var(--page)}
  .theme-switch button{display:grid;place-items:center;width:28px;height:24px;padding:0;border:0;border-radius:6px;background:none;color:var(--text-faint);cursor:pointer;
    transition:background-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)}
  .theme-switch button:hover{background:var(--hover);color:var(--text)}
  .theme-switch button[aria-checked="true"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line-strong)}
  .theme-switch svg,.rail-icon svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .rail-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:7px;color:var(--text-faint);transition:background-color var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)}
  .rail-icon:hover{background:var(--hover);color:var(--text)}
  .rail-icon.disabled{opacity:.45;cursor:not-allowed}
  .rail-icon.disabled:hover{background:none;color:var(--text-faint)}
  .rail-signin{width:100%}
  .rail-scrim{display:none}
  /* M1: the rail folded to its icons (a Map view, html[data-fold~="rail"], FOLD_BOOT); each label kept for assistive tech, the
     project switcher and the theme switch put away (the palette still reaches both); under 860px the rail is a bar already */
  @media (min-width:861px){
    html[data-fold~="rail"]{--rail-w:56px}
    html[data-fold~="rail"] .rail-head{justify-content:center;padding:16px 0 10px}
    html[data-fold~="rail"] .rail-mark .u-logo-word{display:none}
    html[data-fold~="rail"] .rail-body{padding:2px 8px 10px}
    html[data-fold~="rail"] .rail-scroll{margin:0 -8px;padding:0 8px 8px}
    html[data-fold~="rail"] .rail-scope,html[data-fold~="rail"] .rail-kbd,html[data-fold~="rail"] .theme-switch{display:none}
    html[data-fold~="rail"] .rail-item{position:relative;justify-content:center;padding:0}
    html[data-fold~="rail"] .rail-label,html[data-fold~="rail"] .rail-person-text{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
    html[data-fold~="rail"] .rail-badge{position:absolute;top:6px;right:8px;min-width:0;width:7px;height:7px;padding:0;font-size:0;background:var(--needs)}
    html[data-fold~="rail"] .rail-end::before{left:4px;right:4px}
    html[data-fold~="rail"] .rail-person{justify-content:center;padding:6px 0}
    html[data-fold~="rail"] .rail-foot-row{justify-content:center;padding:6px 0 0}
  }
  /* a short window: the destinations scroll, the foot compacts to one line (never over the destinations) */
  @media (min-width:861px) and (max-height:640px){
    .rail-head{padding-top:12px;padding-bottom:6px}
    .rail-item{height:30px}
    .rail-tools{padding-bottom:6px;margin-bottom:6px}
    .rail-end{margin-top:10px}
    .rail-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:8px;border-top-color:var(--line)}
    .rail-person{padding:4px}
    .rail-person-text{display:none}
    .rail-foot-row{padding:0;gap:4px}
  }
  .pop>summary{list-style:none}
  .pop>summary::-webkit-details-marker{display:none}
  .pop-panel{position:fixed;top:16px;left:calc(var(--rail-w) + 20px);z-index:40;width:min(460px,calc(100vw - var(--rail-w) - 40px));max-height:min(70vh,560px);overflow:auto;
    padding:10px;background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;box-shadow:var(--shadow-pop)}
  .u-motion .pop[open]>.pop-panel{animation:u-pop-in 160ms var(--ease) backwards}
  .pop-panel input{width:100%;height:38px;padding:0 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--page);font:400 14px/1 var(--sans);color:var(--text)}
  .pop-out{margin-top:8px;font-size:13px}
  .pop-muted{margin:6px 4px;color:var(--text-muted);font-size:13px}
  .pop-h{margin:12px 4px 4px;font:500 11px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint)}
  .pop-list{list-style:none;margin:0;padding:0}
  .pop-list li{padding:7px 4px;border-top:1px solid var(--line)}
  .pop-list li:first-child{border-top:0}
  .pop-list a{color:var(--text);font-weight:500}
  .pop-list a:hover{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
  .pop-meta{display:block;margin-top:2px;font:400 11.5px/1.4 var(--sans);color:var(--text-faint);font-variant-numeric:tabular-nums}
  /* the command palette (renderPalette): a centred dialog over a scrim, outside .app (inert while it is open) */
  .pal{position:fixed;inset:0;z-index:60;display:flex;justify-content:center;align-items:flex-start;padding:max(56px,12vh) 16px 16px}
  .pal[hidden]{display:none}
  .pal-scrim{position:absolute;inset:0;background:var(--scrim)}
  .pal-box{position:relative;display:flex;flex-direction:column;width:min(640px,100%);max-height:min(560px,calc(100vh - 120px));
    background:var(--surface);border:1px solid var(--line-strong);border-radius:14px;box-shadow:var(--shadow-pop);overflow:clip}
  .u-motion .pal:not([hidden]) .pal-box{animation:u-pop-in 160ms var(--ease) backwards}
  .u-motion .pal:not([hidden]) .pal-scrim{animation:u-fade 120ms var(--ease) backwards}
  .pal-field{flex:none;display:flex;align-items:center;gap:10px;height:54px;margin:0;padding:0 12px 0 16px;border-bottom:1px solid var(--line)}
  .pal-field>svg{width:18px;height:18px;flex:none;fill:none;stroke:var(--text-faint);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .pal-field input{flex:1;min-width:0;height:100%;padding:0;border:0;background:none;font:500 16px/1.2 var(--sans);color:var(--text)}
  .pal-field input:focus,.pal-field input:focus-visible{outline:none}
  .pal-field input::placeholder{color:var(--text-faint)}
  .pal-field input::-webkit-search-cancel-button{display:none}
  .pal-esc,.pal-foot kbd{display:inline-grid;place-items:center;min-width:22px;height:20px;padding:0 5px;border:1px solid var(--line);border-radius:5px;background:var(--page);
    font:500 11px/1 var(--mono);color:var(--text-faint)}
  .pal-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 8px 8px}
  .pal-h{margin:10px 8px 4px;font:500 11px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint)}
  .pal-group[hidden],.pal-item[hidden]{display:none}
  .pal-item{display:flex;align-items:center;gap:10px;min-height:38px;padding:7px 10px;border-radius:8px;color:var(--text);font:500 14px/1.3 var(--sans);cursor:pointer;
    scroll-margin:28px 0 8px;transition:background-color var(--dur-fast) var(--ease)}
  .pal-item>svg{width:17px;height:17px;flex:none;fill:none;stroke:var(--text-muted);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  .pal-item[aria-selected="true"]{background:var(--well)}
  .pal-item[aria-selected="true"]>svg{stroke:var(--text)}
  .pal-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pal-crumb{color:var(--text-muted)}
  .pal-sep{margin:0 7px;color:var(--line-strong)}
  .pal-hint{flex:none;font:400 11.5px/1 var(--mono);color:var(--text-faint)}
  .pal-meta{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 11.5px/1.3 var(--mono);color:var(--text-faint)}
  .pal-item[data-on] [data-on-hint]::before{content:"current"}
  .pal-find .pop-muted{margin:6px 10px 8px}
  .pal-none{margin:18px 10px;font-size:13.5px;color:var(--text-muted)}
  .pal-foot{flex:none;display:flex;gap:18px;margin:0;padding:9px 16px;border-top:1px solid var(--line);font:400 12px/1 var(--sans);color:var(--text-faint);background:var(--rail)}
  .pal-foot span{display:inline-flex;align-items:center;gap:4px}
  .main{min-width:0;display:flex;flex-direction:column}
  .viewbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 24px;border-bottom:1px solid var(--line);background:var(--page);overflow-x:auto}
  .viewbar-items{display:flex;gap:2px}
  .view-item{padding:5px 10px;border-radius:7px;font:500 13px/1.2 var(--sans);color:var(--text-muted);white-space:nowrap;
    transition:color var(--dur-fast) var(--ease),background-color var(--dur-fast) var(--ease)}
  .view-item:hover{color:var(--text);background:var(--hover)}
  .view-item[aria-current="page"]{color:var(--text);background:var(--well);font-weight:600}
  .version-chip{display:inline-flex;align-items:center;flex:none}
  .content{flex:1;width:100%;max-width:1216px;margin:0 auto;padding:40px 40px 80px}
  .content.wide{max-width:none;margin:0;padding:18px 20px 28px}
  .content.full{max-width:none;margin:0;padding:0;display:flex;flex-direction:column;flex:none;height:100vh;height:100dvh;min-height:0;overflow:hidden}
  .content[data-world="ink"]{background:var(--page);color:var(--text)}
  @media (max-width:1100px){.content{padding:32px 28px 72px}}
  /* under 860px: a top bar (the logo, search, the menu); the rail opens as a drawer OVER the page, a scrim behind it */
  @media (max-width:860px){
    .app{display:block}
    .shell-rail{position:sticky;top:0;height:auto;width:100%;border-right:0;border-bottom:1px solid var(--line);background:var(--rail);z-index:40}
    .rail-head{gap:6px;padding:8px 10px 8px 16px;min-height:52px}
    .rail-head .rail-mark{margin-right:auto}
    .rail-menu,.rail-find{display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);cursor:pointer;
      transition:background-color var(--dur-fast) var(--ease)}
    .rail-find{border-color:transparent;background:none;color:var(--text-muted)}
    .rail-menu:hover,.rail-find:hover{background:var(--hover);color:var(--text)}
    .rail-menu svg,.rail-find svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
    .rail-menu .when-open{display:none}
    .shell-rail[data-open] .rail-menu .when-open{display:block}
    .shell-rail[data-open] .rail-menu .when-closed{display:none}
    .rail-body{position:fixed;top:var(--bar-h);left:0;bottom:0;z-index:2;width:min(320px,86vw);padding:6px 12px 12px;background:var(--rail);border-right:1px solid var(--line);
      box-shadow:var(--shadow-pop);transform:translateX(-101%);visibility:hidden;transition:transform var(--dur) var(--ease),visibility 0s linear var(--dur)}
    .shell-rail[data-open] .rail-body{transform:none;visibility:visible;transition:transform var(--dur) var(--ease)}
    .rail-scroll{margin:0 -12px;padding:0 12px 8px}
    .rail-scrim{display:block;position:fixed;inset:var(--bar-h) 0 0;z-index:35;background:var(--scrim)}
    .rail-scrim[hidden]{display:none}
    .u-motion .rail-scrim:not([hidden]){animation:u-fade var(--dur) var(--ease) backwards}
    .rail-item{height:40px}
    .rail-kbd{display:none}
    .pop-panel{left:12px;right:12px;top:62px;width:auto}
    .viewbar{padding:8px 12px}
    .content{padding:24px 16px 56px}
    .content.wide{padding:12px 10px 20px}
    .content.full{height:auto;overflow:visible}
    .pal{padding:10px}
    .pal-box{max-height:calc(100dvh - 20px)}
    .pal-foot{display:none}
    .pal-item{min-height:44px;flex-wrap:wrap;row-gap:2px}
    .pal-meta{flex-basis:100%;max-width:100%}
  }
`;

// The shell's two inline scripts (every page carries them): written readable here, shipped without their comment lines
// and indentation (stripScript: whole-line // comments only, so no code token changes). SHELL_SCRIPT: UNREACHABLE's submit
// guard, the BEHIND head poll, the theme, the drawer, the popovers, the command palette and what changed. MOTION_SCRIPT:
// the motion hooks (ui.js MOTION).
const stripScript = (src) => src.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
const SHELL_SCRIPT = stripScript(`
  (function(){
    // UNREACHABLE (Q47C9CCD3): while the page says the worker cannot be reached, a write is refused
    // BEFORE the press (the Enter key included), never failed after it; reads and links still work
    if(document.querySelector('[data-state="unreachable"]'))document.addEventListener('submit',function(e){
      var f=e.target;if(f&&String(f.method||'').toLowerCase()==='post'){e.preventDefault();e.stopPropagation();}},true);
    // BEHIND (QD08A1E8F): a version was made (published or restored) since this page was drawn. The page names the time
    // of the newest version it was drawn under (meta sharingu-served); the project's head is asked for when the tab gains
    // focus or turns visible, and every 120 s while it is visible (GET /versions?head=1, no-store, one row). A newer head
    // puts the BEHIND pattern at the top of the page: it warns and never blocks a write (Q47C9CCD3). A newer version this
    // browser already saw (localStorage, per project) shows it on load too, with no request.
    var sv=document.querySelector('meta[name="sharingu-served"]');
    if(sv&&window.fetch){
      // the head is the page's own project's (data-scope): a page opened with ?project=B polls B's head, never the default's
      var scope=sv.getAttribute('data-scope')||'',served=Date.parse(sv.getAttribute('content')||''),LS='sharingu-seen-at:'+scope,lastPoll=0;
      var headUrl=orgPath('/versions?head=1')+(scope?'&project='+encodeURIComponent(scope):'');
      var seenGet=function(){try{return JSON.parse(localStorage.getItem(LS)||'null');}catch(e){return null;}};
      var seenPut=function(at,n){try{var s=seenGet();if(!s||Date.parse(s.at)<Date.parse(at)||(s.at===at&&n!=null&&s.n==null))localStorage.setItem(LS,JSON.stringify({at:at,n:n==null?null:n}));}catch(e){}};
      var behind=function(n){
        if(document.querySelector('[data-state="behind"][data-shell]'))return;
        var t=document.getElementById('sg-behind'),m=document.querySelector('main.content');if(!t||!m)return;
        var box=document.createElement('div');box.innerHTML=t.innerHTML.split('v0').join(n==null?'a newer version':'v'+(parseInt(n,10)||0));
        var b=box.firstElementChild;if(!b)return;b.setAttribute('data-shell','1');m.insertBefore(b,m.firstChild);
      };
      if(!isNaN(served)){
        var s0=seenGet();
        if(s0&&Date.parse(s0.at)>served)behind(s0.n);else seenPut(sv.getAttribute('content'),null);
        var poll=function(){
          if(document.visibilityState!=='visible'||Date.now()-lastPoll<5000)return;lastPoll=Date.now();
          fetch(headUrl,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}})
            .then(function(r){return r.ok?r.json():null;})
            .then(function(h){if(!h||h.n==null||!h.at)return;var at=h.at;seenPut(at,h.n);if(Date.parse(at)>served)behind(h.n);})
            .catch(function(){});
        };
        window.addEventListener('focus',poll);
        document.addEventListener('visibilitychange',poll);
        setInterval(poll,120000);
      }
    }
    // the theme: follow the system (no data-theme), Paper or Ink, remembered in this browser
    var root=document.documentElement,TK='${THEME_KEY}';
    function theme(t){if(!root)return;if(t==='light'||t==='dark')root.setAttribute('data-theme',t);else root.removeAttribute('data-theme');
      [].forEach.call(document.querySelectorAll('[data-theme-choice]'),function(b){b.setAttribute('aria-checked',b.getAttribute('data-theme-choice')===(t==='light'||t==='dark'?t:'system')?'true':'false');});}
    var chosen=null;try{chosen=localStorage.getItem(TK);}catch(e){}
    theme(chosen);
    // the rail folds into a top bar under 860px: the menu opens it as a drawer OVER the page (a scrim behind it, the page
    // inert while it is open); Esc, the scrim, a link inside it, a wider window or the page coming back from the cache close it
    var rail=document.getElementById('rail'),menu=document.getElementById('rail-menu'),scrim=document.querySelector('.rail-scrim'),main=document.querySelector('.main');
    var mqNarrow=window.matchMedia?window.matchMedia('(max-width:860px)'):{matches:false};
    function openDrawer(){if(!rail||!menu)return;rail.setAttribute('data-open','');if(scrim)scrim.hidden=false;if(main)main.setAttribute('inert','');menu.setAttribute('aria-expanded','true');
      var f=rail.querySelector('#rail-body summary,#rail-body a[href],#rail-body button');if(f)f.focus();}
    function closeDrawer(back){if(!rail||!rail.hasAttribute('data-open'))return;rail.removeAttribute('data-open');if(scrim)scrim.hidden=true;if(main)main.removeAttribute('inert');
      if(menu){menu.setAttribute('aria-expanded','false');if(back)menu.focus();}}
    if(rail&&menu)menu.addEventListener('click',function(){if(rail.hasAttribute('data-open'))closeDrawer(true);else openDrawer();});
    if(scrim)scrim.addEventListener('click',function(){closeDrawer(true);});
    if(rail)rail.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#rail-body a[href]'))closeDrawer(false);});
    window.addEventListener('pageshow',function(){closeDrawer(false);});
    if(mqNarrow.addEventListener)mqNarrow.addEventListener('change',function(){closeDrawer(false);});
    document.addEventListener('click',function(e){
      var t=e.target&&e.target.closest?e.target:null;if(!t)return;
      var b=t.closest('[data-theme-choice]');
      if(b){var k=b.getAttribute('data-theme-choice');try{if(k==='system')localStorage.removeItem(TK);else localStorage.setItem(TK,k);}catch(err){}theme(k);return;}
      // a copyable call: the mono line beside the button. A pressed Copy reads "Copied" for two seconds (its own label, then back;
      // an icon button keeps its icon and says it in its title); a Copy that is a link (parts.js copyBtn href) copies instead of
      // opening, and opens the item when the clipboard is not there or refuses
      var c=t.closest('[data-copy]');
      if(c){var code=c.parentNode&&c.parentNode.querySelector('code'),link=c.tagName==='A'&&c.href;
        if(code&&navigator.clipboard&&navigator.clipboard.writeText){if(link)e.preventDefault();
          navigator.clipboard.writeText(code.textContent).then(function(){var icon=c.querySelector('svg');
            if(!c.hasAttribute('data-copied')){c.setAttribute('data-was-title',c.getAttribute('title')||'');if(!icon)c.setAttribute('data-was-label',c.textContent);}
            c.setAttribute('data-copied','');c.setAttribute('title','Copied');if(!icon)c.textContent='Copied';
            clearTimeout(c._copied);c._copied=setTimeout(function(){c.removeAttribute('data-copied');c.setAttribute('title',c.getAttribute('data-was-title')||'Copy');if(!icon)c.textContent=c.getAttribute('data-was-label')||'Copy';},2000);
          },function(){if(link)location.href=link;});}}
    });
    // one popover open at a time; Esc and a click outside close it
    var pops=[].slice.call(document.querySelectorAll('.pop'));
    pops.forEach(function(p){p.addEventListener('toggle',function(){if(p.open)pops.forEach(function(o){if(o!==p)o.open=false;});});});
    document.addEventListener('click',function(e){pops.forEach(function(p){if(p.open&&!p.contains(e.target))p.open=false;});});
    function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
    function say(box,msg){box.textContent='';box.appendChild(el('p','pop-muted',msg));}
    function list(box,title,rows){if(!rows.length)return;box.appendChild(el('p','pop-h',title));var ul=el('ul','pop-list');rows.forEach(function(r){var li=el('li');if(r.href){var a=el('a',null,r.text);a.href=r.href;li.appendChild(a);}else{li.appendChild(el('span',null,r.text));}if(r.meta)li.appendChild(el('span','pop-meta',r.meta));ul.appendChild(li);});box.appendChild(ul);}
    // a page opened with ?project=B searches and reads B, never the default project
    var pageProject=(function(){try{return new URLSearchParams(location.search).get('project')||'';}catch(e){return '';}})();
    function withProject(u){return pageProject?u+(u.indexOf('?')<0?'?':'&')+'project='+encodeURIComponent(pageProject):u;}
    function getJson(url,sig){return fetch(withProject(url),{credentials:'same-origin',headers:{accept:'application/json'},signal:sig}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j||{}};});});}
    // THE COMMAND PALETTE (renderPalette): Cmd/Ctrl+K, "/" and every [data-pal-open] open it. Its static items are in the page;
    // what a seated reader types (two letters and up) also asks the search door, GET /search (sprint 3, B5), 180 ms after the last key.
    var pal=document.getElementById('pal'),app=document.querySelector('.app'),pq=document.getElementById('pal-q'),plist=document.getElementById('pal-list'),psc=pal&&pal.querySelector('.pal-scroll');
    var pnone=pal&&pal.querySelector('.pal-none'),plive=document.getElementById('pal-live'),pfind=pal&&pal.querySelector('[data-pal-find]'),fout=document.getElementById('tbFindOut');
    var pstatic=pal?[].slice.call(pal.querySelectorAll('[data-pal-static]')):[],pback=null,pact=-1,pseq=0,ptimer=0,pctl=null,plast='';
    function popts(){return plist?[].filter.call(plist.querySelectorAll('[role="option"]'),function(o){return !o.hidden&&!o.closest('[hidden]');}):[];}
    function pset(i,noScroll){var o=popts();[].forEach.call(plist.querySelectorAll('[aria-selected]'),function(x){x.removeAttribute('aria-selected');});
      if(!o.length){pact=-1;pq.setAttribute('aria-activedescendant','');return;}
      pact=(i%o.length+o.length)%o.length;var a=o[pact];a.setAttribute('aria-selected','true');pq.setAttribute('aria-activedescendant',a.id);if(!noScroll&&psc){var r=a.getBoundingClientRect(),b=psc.getBoundingClientRect();if(r.top<b.top+30)psc.scrollTop-=b.top+30-r.top;else if(r.bottom>b.bottom-8)psc.scrollTop+=r.bottom-b.bottom+8;}}
    function psearch(v){if(!pfind||!fout)return;var my=++pseq;if(pctl&&pctl.abort)pctl.abort();pctl=window.AbortController?new AbortController():null;
      pfind.hidden=false;say(fout,'Searching this project.');
      getJson(orgPath('/search?limit=3&q=')+encodeURIComponent(v),pctl?pctl.signal:undefined).then(function(x){
        if(my!==pseq)return;
        if(!x.ok){say(fout,'The search did not run: '+(x.j.error||'error')+'.');return;}
        var all=[];(x.j.groups||[]).forEach(function(g){(g.hits||[]).forEach(function(h){all.push({h:h,g:g});});});
        var m=all.slice(0,8),more=(Number(x.j.total)||0)-m.length;
        if(!m.length){say(fout,'Nothing in this project matches that.');if(plive)plive.textContent='No result in this project.';if(pact<0)pset(0);return;}
        fout.textContent='';
        m.forEach(function(r,i){var h=r.h,a=el('a','pal-item');a.setAttribute('role','option');a.id='pal-r'+i;a.tabIndex=-1;a.href=h.href||orgPath('/library?q=')+encodeURIComponent(v);
          a.appendChild(el('span','pal-label',h.title||h.ref));a.appendChild(el('span','pal-meta',r.g.label+' · '+h.ref+(h.status?' · '+h.status:'')));fout.appendChild(a);});
        if(more>0){var all2=el('a','pal-item');all2.setAttribute('role','option');all2.id='pal-r'+m.length;all2.tabIndex=-1;all2.href=orgPath('/library?q=')+encodeURIComponent(v);all2.appendChild(el('span','pal-label','All '+x.j.total+' results in the Library'));fout.appendChild(all2);}
        if(plive)plive.textContent=m.length+' result'+(m.length===1?'':'s')+' in this project.';
        pset(pact<0?popts().length-m.length:pact,pact>=0);
      }).catch(function(e){if(my!==pseq||(e&&e.name==='AbortError'))return;say(fout,'Search is unreachable right now. Try again in a moment.');});}
    function pfilter(){var v=pq.value.trim(),lv=v.toLowerCase(),w=lv.split(' ').filter(Boolean),n=0;
      pstatic.forEach(function(o){var t=((o.getAttribute('data-words')||'')+' '+o.textContent).toLowerCase(),ok=w.every(function(x){return t.indexOf(x)>=0;});o.hidden=!ok;if(ok)n++;});
      [].forEach.call(pal.querySelectorAll('[data-pal-group]'),function(g){g.hidden=!g.querySelector('[data-pal-static]:not([hidden])');});
      var searching=!!(pfind&&v.length>=2);
      if(pfind&&!searching){pseq++;clearTimeout(ptimer);pfind.hidden=true;if(fout)fout.textContent='';}
      if(pnone)pnone.hidden=n>0||searching;
      pset(0);
      if(searching&&lv!==plast){clearTimeout(ptimer);ptimer=setTimeout(function(){psearch(v);},180);}
      plast=searching?lv:'';}
    function popen(){if(!pal||!pal.hidden||!pq)return;pback=document.activeElement;closeDrawer(false);pops.forEach(function(p){p.open=false;});
      var th=root.getAttribute('data-theme')||'system';pstatic.forEach(function(o){var k=o.getAttribute('data-theme-set');if(k){if(k===th)o.setAttribute('data-on','');else o.removeAttribute('data-on');}});
      pal.hidden=false;if(app)app.setAttribute('inert','');pq.value='';plast='';pfilter();pq.focus();}
    function pclose(back){if(!pal||pal.hidden)return;pal.hidden=true;pseq++;clearTimeout(ptimer);if(app)app.removeAttribute('inert');
      if(back&&pback&&document.contains(pback)&&pback.focus)pback.focus();pback=null;}
    function pgo(o,ev){if(!o)return;var act=o.getAttribute('data-pal-act');
      if(!act){if(ev&&(ev.metaKey||ev.ctrlKey)&&o.href){window.open(o.href,'_blank','noopener');return;}pclose(false);if(o.href)location.href=o.href;return;}
      if(act==='theme'){var tb=document.querySelector('.theme-switch [data-theme-choice="'+o.getAttribute('data-theme-set')+'"]');pclose(true);if(tb)tb.click();return;}
      if(act==='project'){var key=o.getAttribute('data-key')||'',f=null;
        [].forEach.call(document.querySelectorAll('.proj-menu form'),function(x){var i=x.querySelector('input[name="key"]');if(i&&i.value===key)f=x;});
        pclose(!f);if(f){if(f.requestSubmit)f.requestSubmit();else f.submit();}return;}
      if(act==='beat'){pclose(false);if(mqNarrow.matches)openDrawer();var bt=document.getElementById('tbBeat');if(bt){bt.open=true;var su=bt.querySelector('summary');if(su)su.focus();}}}
    if(pal&&pq){
      pq.addEventListener('input',pfilter);
      pq.addEventListener('keydown',function(e){
        if(e.key==='ArrowDown'){e.preventDefault();pset(pact+1);}
        else if(e.key==='ArrowUp'){e.preventDefault();pset(pact-1);}
        else if(e.key==='Enter'){e.preventDefault();var o=popts()[pact];if(o)pgo(o,e);else if(pfind&&pq.value.trim().length>=2){clearTimeout(ptimer);psearch(pq.value.trim());}}});
      pal.addEventListener('keydown',function(e){if(e.key==='Tab'){e.preventDefault();pq.focus();}});
      pal.addEventListener('submit',function(e){e.preventDefault();},true);
      document.addEventListener('focusin',function(e){if(!pal.hidden&&!pal.contains(e.target))pq.focus();});
      plist.addEventListener('mousemove',function(e){var o=e.target.closest&&e.target.closest('[role="option"]');if(!o)return;var i=popts().indexOf(o);if(i>=0&&i!==pact)pset(i,true);});
      plist.addEventListener('click',function(e){var o=e.target.closest&&e.target.closest('[role="option"]');if(!o)return;if(o.getAttribute('data-pal-act')){e.preventDefault();pgo(o,e);}else if(!e.metaKey&&!e.ctrlKey)pclose(false);});
    }
    document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target:null;if(!t)return;
      if(t.closest('[data-pal-open]')){e.preventDefault();popen();}else if(t.closest('[data-pal-close]'))pclose(true);});
    document.addEventListener('keydown',function(e){
      var k=e.key;
      if((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&(k==='k'||k==='K')){if(pal){e.preventDefault();if(pal.hidden)popen();else pclose(true);}return;}
      if(k==='Escape'){if(pal&&!pal.hidden){e.preventDefault();pclose(true);return;}
        var any=pops.some(function(p){return p.open;});pops.forEach(function(p){p.open=false;});if(!any)closeDrawer(true);return;}
      // "/" opens the palette, from anywhere but a field
      var tg=e.target,tn=tg&&tg.tagName;
      if(k==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&tn!=='INPUT'&&tn!=='TEXTAREA'&&tn!=='SELECT'&&!(tg&&tg.isContentEditable)&&pal&&pal.hidden){e.preventDefault();popen();}
    });
    // M1, the folds (FOLD_BOOT put the kit on window.SGFOLD, a Map view only): a toggle folds the rail or the panel, "\\" folds
    // both and leaves the canvas alone (pressed again: both open), outside a field; kept for this person in this browser. Each
    // toggle's aria-pressed follows <html data-fold>; the Map's views hear 'sharingu:fold' and fit their drawing once
    var FD=window.SGFOLD;
    if(FD&&FD.kit){
      var foldSync=function(s){var a=FD.kit.attr(s);if(a)root.setAttribute('data-fold',a);else root.removeAttribute('data-fold');
        [].forEach.call(document.querySelectorAll('[data-fold-toggle]'),function(b){b.setAttribute('aria-pressed',s[b.getAttribute('data-fold-toggle')]?'true':'false');});};
      var foldSet=function(s){FD.kit.write(FD.key,s);foldSync(s);try{window.dispatchEvent(new Event('sharingu:fold'));}catch(err){}};
      foldSync(FD.kit.read(FD.key));
      document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-fold-toggle]'):null;if(b)foldSet(FD.kit.flip(FD.kit.read(FD.key),b.getAttribute('data-fold-toggle')));});
      document.addEventListener('keydown',function(e){
        if(e.key!=='\\\\'||e.metaKey||(e.ctrlKey&&!e.altKey))return;var tg=e.target,tn=tg&&tg.tagName;
        if(tn==='INPUT'||tn==='TEXTAREA'||tn==='SELECT'||(tg&&tg.isContentEditable)||(pal&&!pal.hidden))return;
        e.preventDefault();foldSet(FD.kit.alone(FD.kit.read(FD.key)));});
    }
    // the shortcut as this machine writes it: Cmd K on a Mac, Ctrl K elsewhere
    if(typeof navigator!=='undefined'&&!/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||''))[].forEach.call(document.querySelectorAll('[data-kbd-mod]'),function(x){x.textContent='Ctrl K';});
    // notifications: GET /updates (the updates tool's twin), read when the panel opens; limit=1 keeps yours to one row,
    // which the panel does not draw: it shows what moved in your lane and what waits on you
    var beat=document.getElementById('tbBeat'),bout=document.getElementById('tbBeatOut'),read=false;
    if(beat&&bout)beat.addEventListener('toggle',function(){
      if(!beat.open||read)return;read=true;say(bout,'Reading what changed.');
      getJson(orgPath('/updates?limit=1')).then(function(x){
        if(!x.ok){read=false;say(bout,'What changed did not load: '+(x.j.error||'error')+'.');return;}
        var w=x.j.waitingOnYou||{},loops=(w.openItems||[]).concat(w.blockers||[]),moved=x.j.inYourLane||[];
        bout.textContent='';
        if(!loops.length&&!moved.length){say(bout,'Nothing in your lane moved since you were last here.');return;}
        list(bout,'Waiting on you',loops.map(function(l){return {text:l.title||l.id,meta:l.since?String(l.since).slice(0,10):''};}));
        list(bout,'Moved in your lane',moved.map(function(m){return {text:m.what||m.kind,meta:(m.by||'')+(m.at?' · '+String(m.at).slice(0,16).replace('T',' '):'')};}));
      }).catch(function(){read=false;say(bout,'What changed is unreachable right now. Try again in a moment.');});
    });
  })();
`);
const MOTION_SCRIPT = stripScript(`
  (function(){
    // MOTION (ui.js MOTION, MOTION_CSS): a spark reads a point out on hover or the arrow keys; a metric that moved since this
    // browser's last visit to the page pulses once; a number counts up, a bar fills and a spark draws in the first time each
    // is in view. Only the readout and the remembered values run under reduced motion (no html.u-motion).
    var R=document.documentElement;if(!R||!R.classList)return;var M=R.classList.contains('u-motion');
    try{var P='sharingu-pulse:'+location.pathname+'|'+(new URLSearchParams(location.search).get('project')||'')+'|';
      [].forEach.call(document.querySelectorAll('[data-pulse][data-value]'),function(e){var k=P+e.getAttribute('data-pulse'),v=e.getAttribute('data-value'),o=localStorage.getItem(k);
        if(M&&o!==null&&o!==v)e.classList.add('u-pulse');localStorage.setItem(k,v);});}catch(e){}
    [].forEach.call(document.querySelectorAll('[data-spark]'),function(f){
      var pts=(f.getAttribute('data-pts')||'').split(' ').map(function(p){var x=p.split(',');return [+x[0],+x[1]];}),rd=(f.getAttribute('data-read')||'').split('|');
      var out=f.querySelector('.u-spark-read'),cur=f.querySelector('.u-spark-cursor'),bars=f.querySelectorAll('.u-spark-bar'),svg=f.querySelector('svg'),at=-1;
      if(!svg||!out||pts.length<2)return;
      function show(i){at=Math.max(0,Math.min(pts.length-1,i));var vb=svg.viewBox.baseVal,w=svg.getBoundingClientRect().width||vb.width,p=pts[at];
        out.textContent=rd[at]||'';out.style.left=(p[0]/vb.width*w)+'px';f.setAttribute('data-hover','');
        if(cur){cur.setAttribute('cx',p[0]);cur.setAttribute('cy',p[1]);}
        [].forEach.call(bars,function(b,j){if(j===at)b.setAttribute('data-on','');else b.removeAttribute('data-on');});}
      function hide(){f.removeAttribute('data-hover');[].forEach.call(bars,function(b){b.removeAttribute('data-on');});}
      f.addEventListener('pointermove',function(e){var b=svg.getBoundingClientRect(),x=(e.clientX-b.left)/(b.width||1),n=pts.length;show(bars.length?Math.floor(x*n):Math.round(x*(n-1)));});
      f.addEventListener('pointerleave',hide);f.addEventListener('blur',hide);
      f.addEventListener('focus',function(){show(at<0?pts.length-1:at);});
      f.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show((at<0?pts.length-1:at)+(e.key==='ArrowLeft'?-1:1));}});
    });
    if(!M)return;
    R.classList.add('u-js');
    var marks=[].slice.call(document.querySelectorAll('[data-count],[data-progress],[data-spark]'));
    function seen(e){if(e.hasAttribute('data-count'))count(e);e.classList.add('u-seen');}
    function count(e){var s=e.textContent,m=/^([^0-9-]*)(-?[0-9,]*[.]?[0-9]+)(.*)$/.exec(s);if(!m||!e.animate)return;
      var raw=m[2],n=parseFloat(raw.split(',').join('')),dec=(raw.split('.')[1]||'').length,grp=raw.indexOf(',')>=0;if(!isFinite(n)||n===0)return;
      var w=e.getBoundingClientRect().width;if(getComputedStyle(e).display==='inline')e.style.display='inline-block';e.style.minWidth=w+'px';
      var a=e.animate([{opacity:1},{opacity:1}],{duration:260,easing:'cubic-bezier(.2,0,0,1)'});
      var put=function(p){var t=(n*p).toFixed(dec);if(grp)t=Number(t).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});e.textContent=m[1]+t+m[3];};
      var done=function(){e.textContent=s;e.style.minWidth='';e.style.display='';};
      put(0);a.onfinish=done;a.oncancel=done;
      (function tick(){if(a.playState!=='running'&&a.playState!=='pending')return;var p=a.effect&&a.effect.getComputedTiming().progress;if(p!=null)put(p);requestAnimationFrame(tick);})();}
    try{
      var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){io.unobserve(x.target);seen(x.target);}});},{threshold:.2});
      marks.forEach(function(e){io.observe(e);});
    }catch(err){marks.forEach(function(e){e.classList.add('u-seen');});}
  })();
`);

export function shell(opts) {
  const { active = "", content = "", owner = false, wide = false, full = false, reader = null,
          brand = DEFAULT_BRAND, proj = null, briefCount = 0,
          head = null, scope = "", from = "", orgs = null } = opts || {};
  const anonymous = !reader;
  const tool = RAIL_TOOL_OF[active] || "";
  // BEHIND: a signed-in page carries the time of the newest version it was drawn under
  const served = head && typeof head.at === "string" ? head.at : "";
  const stamped = !anonymous && served !== "";
  const title = productTitle(brand, !anonymous);
  // M1: a full page of the Map's tab, for a signed-in reader, keeps the person's folds under their own id (FOLD_BOOT)
  const folds = full && !anonymous && reader.id && tabOf(active) === "map" ? `${FOLD_PREFIX}${reader.id}` : "";

  return `<!doctype html>
<html lang="en"${folds ? ` data-folds="${esc(folds)}"` : ""}${orgBase() ? ` data-org-base="${esc(orgBase())}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
${stamped ? `<meta name="sharingu-served" content="${esc(served)}" data-scope="${esc(scope)}">` : ""}
${THEME_BOOT}
<script>${ORG_PATH_CLIENT}</script>
${folds ? FOLD_BOOT : ""}
${FAVICON_LINK}
${BRAND_FONTS_LINK}
<style>
${WORLDS_CSS}
${BASE_CSS}
${UI_CSS}
${PARTS_CSS}
${STATE_CSS}
${SHELL_CSS}
${MOTION_CSS}
</style>
</head>
<body>
<div class="app">
  <aside class="shell-rail" id="rail" aria-label="${esc(PRODUCT_NAME)}">
    <header class="rail-head">
      <a class="rail-mark" href="${esc(anonymous ? orgPath("/docs") : orgPath("/home"))}" title="${esc(title)}" aria-label="${esc(title)}" data-region="mark">${logo({ size: 24 })}</a>
      <button class="rail-find" type="button" data-pal-open aria-haspopup="dialog" aria-controls="pal" aria-label="${anonymous ? "Go to a page" : "Search and go to"}">${icon("search")}</button>
      <button class="rail-menu" id="rail-menu" type="button" aria-expanded="false" aria-controls="rail-body" aria-label="Menu"><svg class="when-closed" viewBox="0 0 24 24" aria-hidden="true">${RAIL_ICON.menu}</svg><svg class="when-open" viewBox="0 0 24 24" aria-hidden="true">${RAIL_ICON.close}</svg></button>
    </header>
    <div class="rail-body" id="rail-body">
      <div class="rail-scope">
        ${renderOrgName(brand, anonymous ? null : orgs)}
        ${anonymous ? "" : renderProjChip(proj, owner)}
      </div>
      <div class="rail-scroll">
      ${anonymous ? "" : `<div class="rail-tools">
        ${renderSearch(tool === "search")}
        ${renderNotifications(tool === "changes")}
      </div>`}
      ${renderNav(active, owner, briefCount, anonymous, fromTab(from))}
      </div>
      <div class="rail-foot">
        ${renderPerson(reader)}
        <div class="rail-foot-row">${THEME_SWITCH}${renderSignOut(reader)}</div>
      </div>
    </div>
  </aside>
  <div class="rail-scrim" data-rail-close hidden></div>
  <div class="main">
  ${full ? "" : renderViewBar(active, owner, anonymous, head)}
  <main class="content${full ? " full" : wide ? " wide" : ""}"${isPlane(active) ? ' data-world="ink"' : ""}>
${content}
  </main>
  </div>
</div>
${renderPalette({ active, owner, anonymous, proj, reader, orgs })}
  ${stamped ? `<template id="sg-behind">${behindState({ page: "This page", head: { n: 0 } })}</template>` : ""}
  <script>${SHELL_SCRIPT}</script>
  <script>${MOTION_SCRIPT}</script>
</body>
</html>`;
}
