// src/googlepage.js — the "Continue with Google" button (sprint 21, slice 21.4c; src/google.js the flow): Google's standard sign-in
// button (its branding guidelines: a plain button with Google's own four-colour G mark beside the label "Continue with Google",
// a hairline edge, never recoloured), on the front door's own tokens — the surface, the strong line, the text — so it reads as
// Google's light button on Paper and its dark one on Ink (the repo's colour law: no colour literal on a page; the G mark is
// Google's own picture, engine/assets/clients/google.png, served by the worker itself). A SECONDARY: the page's one orange primary
// stays its own action (src/login.js authPage). Shown only when src/google.js googleOffer says so (a client stored, on an origin
// stored with it). No statement here.
//   googleLink(intent, extra)       a link to GET /auth/google/start (join, signin), extra: the next page or the source
//   googleForm(fields, inner)       a same-origin POST to /auth/google/start (the connect page: its authorize request rides it)
//   googleOr                        the quiet "or" between the page's own form and the button
//   GOOGLE_CSS                      the button's rules on the front door's tokens
import { esc } from "./ui.js";
import { START_PATH } from "./google.js";
import { frontAssetHref } from "./frontassets.js";

export const GOOGLE_WORDS = "Continue with Google";
const inside = () => `<img class="google-g" src="${frontAssetHref("clients/google.png")}" width="18" height="18" alt=""><span>${GOOGLE_WORDS}</span>`;
// googleLink(intent, extra) -> the button as a link (extra: [[name, value]] more query, each escaped)
export function googleLink(intent, extra = []) {
  const q = new URLSearchParams([["intent", intent], ...extra.filter(([, v]) => v)]);
  return `<a class="google-btn" href="${esc(`${START_PATH}?${q}`)}" data-region="google" data-google="${esc(intent)}">${inside()}</a>`;
}
// googleForm(fields, inner) -> the button as a form's submit (fields: [[name, value]] hidden; inner: trusted markup before it)
export function googleForm(fields, inner = "") {
  return `<form method="POST" action="${START_PATH}" class="google-form" data-region="google" data-google="${esc((fields.find(([k]) => k === "intent") || [])[1] || "")}">
      ${fields.map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("\n      ")}
      ${inner}<button type="submit" class="google-btn">${inside()}</button>
    </form>`;
}
export const googleOr = `<p class="google-or" aria-hidden="true"><span>or</span></p>`;
// the rules (the selector beside "form button" outranks the front door's orange submit, src/login.js AUTH_CSS)
export const GOOGLE_CSS = `
  .google-btn,form button.google-btn[type="submit"]{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:44px;margin:0;padding:0 12px;
    font:500 14px/20px Roboto,var(--sans);letter-spacing:.25px;color:var(--text);background:var(--surface);border:1px solid var(--line-strong);border-radius:10px;
    cursor:pointer;text-decoration:none;filter:none;transition:background-color var(--dur-fast) var(--ease)}
  .google-btn:hover,form button.google-btn[type="submit"]:hover{background:var(--hover);filter:none}
  .google-btn:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .google-g{flex:none;width:18px;height:18px}
  .google-form{display:flex;flex-direction:column;gap:14px;margin:0}
  .google-or{display:flex;align-items:center;gap:12px;margin:18px 0;font:500 12px/1 var(--sans);color:var(--text-faint)}
  .google-or::before,.google-or::after{content:"";flex:1;height:1px;background:var(--line)}
  .google-wrap{width:100%;max-width:420px;margin:22px 0 0}
`;
