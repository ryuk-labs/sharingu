// src/requestpage.js — the request-access pages (sprint 21, slice 21.1; src/requestaccess.js reads and writes): GET /request-access
// (the form: the profile, required and optional apart, a field no person sees as the honeypot), the request's own page at its
// private link (GET /request-access/<token>: by its status — in line, its place open, or declined; sprint 21, 21.2), the repeat's
// page (GET /request-access/asked) and the one not-found for a link that opens no request. The front door's card (src/login.js
// authPage: both worlds, the one accent), never a second skin. No statement here: the route reads and hands each page its numbers.
// REQUEST_FIELD_WORDS — each field problem in the words the form shows (readRequest names the field).
import { esc, errorState } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { authPage, authBrand } from "./login.js";
import { TEAM_SIZES, REQUEST_MAX, REQUEST_TRAP, REQUEST_PATH } from "./requestaccess.js";
import { WALKTHROUGH_PATH } from "./walkthrough.js";

export const REQUEST_FIELD_WORDS = {
  name: `Type your name (at most ${REQUEST_MAX.name} characters).`,
  email: "Type your work email as one plain address, like you@company.com.",
  company: `Type your company's name (at most ${REQUEST_MAX.company} characters).`,
  role: `Type your role, like founder or engineering lead (at most ${REQUEST_MAX.role} characters).`,
  team_size: "Choose your team's size.",
  website: "Type your company's website as an address, like https://company.com, or leave it empty.",
  linkedin: "Type your LinkedIn address (linkedin.com/in/your-name) or leave it empty.",
  x: "Type your X handle, like @name, or leave it empty.",
  github: "Type your GitHub username or leave it empty.",
  ai_tools: `Name the AI tools you use in at most ${REQUEST_MAX.ai_tools} characters.`,
  use_case: `Say what you would use sharingu for in one line (at most ${REQUEST_MAX.use_case} characters).`,
};

// the page's title and wordmark: the front door's, the product named first
function brandOf(brand, words) {
  const { wordmark, title } = authBrand(brand || DEFAULT_BRAND);
  return { wordmark, title: title.replace(/^Sign in/, words) };
}
// the form's own few rules on the front door's tokens: the team size's select as the inputs are, the honeypot out of sight
const REQUEST_CSS = `
  select{width:100%;height:42px;padding:0 10px;font:400 14.5px/1 var(--sans);color:var(--text);background:var(--page);border:1px solid var(--line-strong);border-radius:6px}
  select:focus{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  .part{margin:6px 0 0;font:700 13px/1.3 var(--sans);color:var(--text)}
  .trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
`;
// field(name, label, opts) -> one labelled input, its value kept when the form comes back
function field(name, label, { type = "text", required = false, value = "", auto = "", hint = "" } = {}) {
  return `<div class="field">
        <label for="${name}">${esc(label)}${required ? "" : ` <span class="opt">optional</span>`}</label>
        <input type="${type}" id="${name}" name="${name}"${required ? " required" : ""} maxlength="${REQUEST_MAX[name]}"${auto ? ` autocomplete="${auto}"` : ""} value="${esc(value)}" data-input-exception="auth">
        ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
      </div>`;
}

// renderRequestAccess({ error, brand, values }) -> the form (values: what the person sent, kept when a field was wrong)
export function renderRequestAccess(opts) {
  const { error = "", brand = DEFAULT_BRAND, values = {} } = opts || {};
  const v = (k) => (values && typeof values[k] === "string" ? values[k] : "");
  const sizes = Object.entries(TEAM_SIZES).map(([k, w]) => `<option value="${esc(k)}"${v("team_size") === k ? " selected" : ""}>${esc(w)}</option>`).join("");
  const body = `<form method="POST" action="${REQUEST_PATH}" data-screen="request-access" data-region="request-access">
      <input type="hidden" name="web" value="1">
      ${field("name", "Your name", { required: true, value: v("name"), auto: "name" })}
      ${field("email", "Work email", { type: "email", required: true, value: v("email"), auto: "email" })}
      ${field("company", "Company", { required: true, value: v("company"), auto: "organization" })}
      ${field("role", "Your role", { required: true, value: v("role"), auto: "organization-title" })}
      <div class="field">
        <label for="team_size">Team size</label>
        <select id="team_size" name="team_size" required><option value="">Choose one</option>${sizes}</select>
      </div>
      <p class="part">A little more about you</p>
      ${field("website", "Company website", { value: v("website"), auto: "url" })}
      ${field("linkedin", "LinkedIn", { value: v("linkedin") })}
      ${field("x", "X", { value: v("x") })}
      ${field("github", "GitHub", { value: v("github") })}
      ${field("ai_tools", "The AI tools you use", { value: v("ai_tools"), hint: "Claude, ChatGPT, Codex, Cursor…" })}
      ${field("use_case", "What you would use sharingu for, in one line", { value: v("use_case") })}
      <div class="trap" aria-hidden="true"><label for="${REQUEST_TRAP}">Leave this empty</label><input type="text" id="${REQUEST_TRAP}" name="${REQUEST_TRAP}" tabindex="-1" autocomplete="off" data-input-exception="auth"></div>
      <button type="submit">Request access</button>
    </form>`;
  return authPage({
    ...brandOf(brand, "Request access"),
    lede: "Request access",
    banner: error ? errorState({ what: error }) : "",
    body,
    footnote: `The beta opens to 50 teams. Already have an account? <a href="/login">Sign in</a>`,
    css: REQUEST_CSS,
  });
}

// betaWords(count, what) -> the beta's places in words, from src/accounts.js betaCount's answer (read from D1 by the route), or ""
// when there is none (the read failed: the page leaves the count out, never a guess). Past the cap (the operator may allow beyond
// it) it says every place is taken, never "51 of 50". what: the places' name ("beta places" on the showcase, src/showcase.js).
export function betaWords(count, what = "places") {
  const taken = Number(count && count.taken), cap = Number(count && count.cap);
  if (!count || !Number.isSafeInteger(taken) || !Number.isSafeInteger(cap) || taken < 0 || cap < 1) return "";
  return taken >= cap ? `All ${cap} ${what} taken` : `${taken} of ${cap} ${what} taken`;
}
// the count as one fact, or nothing
const betaFact = (count) => { const w = betaWords(count); return w ? `<div class="fact"><span class="fact-k">The beta</span><span class="fact-v" data-beta-count>${esc(w)}</span></div>` : ""; };
// the walkthrough while a person waits: the showcase's own section, the ONE list (src/walkthrough.js)
const walkLink = `<a class="done-action" href="${WALKTHROUGH_PATH}" data-walkthrough>See the walkthrough</a>`;
// the in-line page's few rules on the front door's tokens: what comes next, a short numbered list
const LINE_CSS = `
  .next{margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:6px;font:400 13.5px/1.5 var(--sans);color:var(--text)}
`;

// renderRequestReceived({ brand, request, place, count }) -> the request's own page, by its status (sprint 21, 21.2): OPEN, "you're
// in line" (its place, the beta's count when it was read, what comes next, the walkthrough); APPROVED, its place is open (the
// code comes by email, the way to sign up); DECLINED, one plain sentence (no reason, no count). place: src/requestaccess.js
// placeInLine; count: src/accounts.js betaCount (null: left out).
export function renderRequestReceived(opts) {
  const { brand = DEFAULT_BRAND, request = {}, place = null, count = null } = opts || {};
  const status = String(request.status || "");
  if (status === "approved") {
    const body = `<div class="done" data-screen="request-approved" data-region="request-approved">
      <p class="done-what">Your place is open, ${esc(request.name || "")}.</p>
      <p class="done-why">Your sign-up code for <b data-request-company>${esc(request.company || "")}</b> comes to your email. With it, sign up: the org form comes filled in from your request.</p>
      <a class="done-action" href="/signup">Sign up</a>
    </div>`;
    return authPage({ ...brandOf(brand, "Your place is open"), lede: "Your place is open", body });
  }
  if (status !== "open") {
    const body = `<div class="done" data-screen="request-declined" data-region="request-declined">
      <p class="done-why">We cannot offer you a place in this beta.</p>
    </div>`;
    return authPage({ ...brandOf(brand, "Request closed"), lede: "Request closed", body });
  }
  const body = `<div class="done" data-screen="request-in-line" data-region="request-in-line">
      <p class="done-what">Thank you, ${esc(request.name || "")}.</p>
      <p class="done-why">We have your request for <b data-request-company>${esc(request.company || "")}</b>.</p>
      <div class="facts">
        ${place ? `<div class="fact"><span class="fact-k">Your place in line</span><span class="fact-v" data-request-place>${esc(String(place))}</span></div>` : ""}
        ${betaFact(count)}
        <div class="fact"><span class="fact-k">What comes next</span>
          <ol class="next" data-region="request-next">
            <li>We review the requests in the order they came.</li>
            <li>When your place opens, we email a sign-up code to your address.</li>
            <li>With the code, sign up: the org form comes filled in from this request.</li>
          </ol>
        </div>
      </div>
      ${walkLink}
    </div>`;
  return authPage({ ...brandOf(brand, "You're in line"), lede: "You're in line", body, css: LINE_CSS,
    footnote: "Keep this page's address: it is your request's own page." });
}

// renderRequestAsked({ brand, count }) -> the repeat's page (the first request stands): it names nothing the repeat typed; the
// beta's count (public numbers only) and the walkthrough
export function renderRequestAsked(opts) {
  const { brand = DEFAULT_BRAND, count = null } = opts || {};
  const fact = betaFact(count);
  const body = `<div class="done" data-screen="request-asked" data-region="request-asked">
      <p class="done-why">This email has already asked for a place. The link from your first request shows your place.</p>
      ${fact ? `<div class="facts">${fact}</div>` : ""}
      ${walkLink}
    </div>`;
  return authPage({ ...brandOf(brand, "Already asked"), lede: "Already asked", body,
    footnote: `Already have an account? <a href="/login">Sign in</a>` });
}

// renderRequestMissing({ brand }) -> the one not-found: a link that opens no request, whatever it held
export function renderRequestMissing(opts) {
  const { brand = DEFAULT_BRAND } = opts || {};
  const body = `<div class="done" data-screen="request-missing">
      <p class="done-why">This link opens no request. Check the address you were given, or request access again.</p>
      <a class="done-action" href="${REQUEST_PATH}">Request access</a>
    </div>`;
  return authPage({ ...brandOf(brand, "Not found"), lede: "Not found", body });
}
