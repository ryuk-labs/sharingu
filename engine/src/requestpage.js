// src/requestpage.js — the request-access pages (sprint 21, slice 21.1; src/requestaccess.js reads and writes): GET /request-access
// (the form: the profile, the optional fields folded under one disclosure, a field no person sees as the honeypot), the request's
// own page at its private link (GET /request-access/<token>: by its status — in line, its place open, or declined; sprint 21, 21.2),
// the repeat's page (GET /request-access/asked), the check page (GET /request-access/check: 21.P, "Check my request") and the one
// not-found for a link that opens no request. The front door's scenes (src/login.js authPage: both worlds, the one accent, the
// website's marks and U-chan's poses, src/ui.js), never a second skin. No statement here: the route reads and hands each page its
// numbers.
// REQUEST_FIELD_WORDS — each field problem in the words the form shows (readRequest names the field).
import { esc, errorState, brandMark, uchanPose } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { authPage, authBrand, SITE_URL, JOIN_WORDS } from "./login.js";
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
// the form's own few rules on the front door's tokens: the team size's select as the inputs are, the optional fields' disclosure, a
// wrong field marked on itself, the honeypot out of sight; the beta panel beside the form (the website's marks, U-chan's comment)
const REQUEST_CSS = `
  select{width:100%;height:42px;padding:0 10px;font:400 14.5px/1 var(--sans);color:var(--text);background:var(--page);border:1px solid var(--line-strong);border-radius:6px}
  select:focus{outline:2px solid var(--field-ring);outline-offset:1px;border-color:transparent}
  .more{border:1px solid var(--line);border-radius:10px;background:var(--page)}
  .more>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:0 14px;font:600 13.5px/1.3 var(--sans);color:var(--text);
    cursor:pointer;list-style:none;border-radius:10px}
  .more>summary::-webkit-details-marker{display:none}
  .more>summary::after{content:"";flex:none;width:8px;height:8px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);rotate:45deg;
    translate:0 -2px;transition:rotate var(--dur-fast) var(--ease)}
  .more[open]>summary::after{rotate:225deg;translate:0 2px}
  .more>summary:hover{background:var(--hover)}
  .more-fields{display:flex;flex-direction:column;gap:14px;padding:4px 14px 16px}
  .field-err{margin:0;font:600 12.5px/1.45 var(--sans);color:var(--err)}
  [aria-invalid="true"]{border-color:var(--err)!important}
  .trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
  .get{position:relative;padding:24px 24px 20px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
  .get-list{margin:14px 0 0;padding:0;list-style:none;display:flex;flex-direction:column}
  .get-list li{display:flex;align-items:center;gap:14px;min-height:56px;border-top:1px solid var(--line)}
  .get-list li:first-child{border-top:0}
  .get-list .u-mark{flex:none}
  .get-list b{display:block;font:700 14.5px/1.3 var(--sans);color:var(--text)}
  .get-list span span{display:block;font:400 13.5px/1.45 var(--sans);color:var(--text-muted)}
  .get .u-pose{position:absolute;right:18px;top:-58px;width:84px;height:100px}
  @media (max-width:900px){.get .u-pose{top:-40px;width:67px;height:80px}}
`;
// field(name, label, opts) -> one labelled input, its value kept when the form comes back; a wrong one is marked on itself
// (aria-invalid, its words beside it, the focus on it: `autofocus`, so it holds without a script)
function field(name, label, { type = "text", required = false, value = "", auto = "", hint = "", error = "" } = {}) {
  const described = [hint ? `hint-${name}` : "", error ? `err-${name}` : ""].filter(Boolean).join(" ");
  return `<div class="field">
        <label for="${name}">${esc(label)}${required ? "" : ` <span class="opt">optional</span>`}</label>
        <input type="${type}" id="${name}" name="${name}"${required ? " required" : ""} maxlength="${REQUEST_MAX[name]}"${auto ? ` autocomplete="${auto}"` : ""} value="${esc(value)}"${error ? ' aria-invalid="true" autofocus' : ""}${described ? ` aria-describedby="${described}"` : ""} data-input-exception="auth">
        ${error ? `<p class="field-err" id="err-${name}" data-field-error="${name}">${esc(error)}</p>` : ""}
        ${hint ? `<p class="hint" id="hint-${name}">${esc(hint)}</p>` : ""}
      </div>`;
}
// the optional fields, folded under one disclosure that opens itself when one holds a value or is the wrong one
export const OPTIONAL_FIELDS = ["website", "linkedin", "x", "github", "ai_tools", "use_case"];
// the beta, beside the form: what a team gets, each with the website's own mark (src/ui.js brandMark), and U-chan's comment pose
const BETA_GETS = [
  ["goal", "Goals", "What the team is working toward"],
  ["contribution", "Contributions", "Filed by your AI, through MCP"],
  ["decision", "Decisions", "Made by people, with their reasons"],
  ["proof", "Proof", "Every check graded on its evidence"],
  ["question", "Questions", "Asked and answered in one place"],
];
const betaPanel = () => `<div class="get" data-art="beta">
      ${uchanPose({ pose: "comment", size: 100 })}
      <p class="eyebrow">In the beta</p>
      <ul class="get-list">${BETA_GETS.map(([m, k, v]) => `<li>${brandMark(m, 36)}<span><b>${esc(k)}</b><span>${esc(v)}</span></span></li>`).join("")}</ul>
    </div>`;

// renderRequestAccess({ error, field, brand, values }) -> the form (values: what the person sent, kept when a field was wrong;
// field: the wrong one, readRequest's, marked on itself — error then names it there, never only at the top)
export function renderRequestAccess(opts) {
  const { error = "", field: wrong = "", brand = DEFAULT_BRAND, values = {} } = opts || {};
  const v = (k) => (values && typeof values[k] === "string" ? values[k] : "");
  const at = Object.prototype.hasOwnProperty.call(REQUEST_FIELD_WORDS, wrong) ? wrong : "";
  const err = (k) => (at === k ? error || REQUEST_FIELD_WORDS[k] : "");
  const f = (name, label, o = {}) => field(name, label, { ...o, value: v(name), error: err(name) });
  const sizes = Object.entries(TEAM_SIZES).map(([k, w]) => `<option value="${esc(k)}"${v("team_size") === k ? " selected" : ""}>${esc(w)}</option>`).join("");
  const open = OPTIONAL_FIELDS.some((k) => v(k).trim() !== "" || at === k);
  const body = `<form method="POST" action="${REQUEST_PATH}" data-screen="request-access" data-region="request-access">
      <input type="hidden" name="web" value="1">
      ${f("name", "Your name", { required: true, auto: "name" })}
      ${f("email", "Work email", { type: "email", required: true, auto: "email" })}
      ${f("company", "Company", { required: true, auto: "organization" })}
      ${f("role", "Your role", { required: true, auto: "organization-title" })}
      <div class="field">
        <label for="team_size">Team size</label>
        <select id="team_size" name="team_size" required${at === "team_size" ? ' aria-invalid="true" autofocus aria-describedby="err-team_size"' : ""}><option value="">Choose one</option>${sizes}</select>
        ${at === "team_size" ? `<p class="field-err" id="err-team_size" data-field-error="team_size">${esc(err("team_size"))}</p>` : ""}
      </div>
      <details class="more" data-region="request-more"${open ? " open" : ""}>
        <summary>More about you (optional)</summary>
        <div class="more-fields">
        ${f("website", "Company website", { auto: "url" })}
        ${f("linkedin", "LinkedIn")}
        ${f("x", "X")}
        ${f("github", "GitHub")}
        ${f("ai_tools", "The AI tools you use", { hint: "Claude, ChatGPT, Codex, Cursor…" })}
        ${f("use_case", "What you would use sharingu for, in one line")}
        </div>
      </details>
      <div class="trap" aria-hidden="true"><label for="${REQUEST_TRAP}">Leave this empty</label><input type="text" id="${REQUEST_TRAP}" name="${REQUEST_TRAP}" tabindex="-1" autocomplete="off" data-input-exception="auth"></div>
      <button type="submit">Request access</button>
    </form>`;
  return authPage({
    ...brandOf(brand, "Request access"),
    lede: "Request access",
    // a wrong field says so on itself; a refusal that is no field's (cross-site, too many attempts) is the banner
    banner: error && !at ? errorState({ what: error }) : "",
    body,
    footnote: `Already have an account? <a href="/login">Sign in</a>`,
    css: REQUEST_CSS,
    intro: { eyebrow: "The private beta", heading: `${JOIN_WORDS}.`, lede: "Fifty teams, reviewed in the order they ask.", art: betaPanel() },
  });
}

// betaWords(count) -> the beta's places in words, ONE way on every page (sprint 21, 21.P A6: the showcase, the request's pages),
// from src/accounts.js betaCount's answer (read from D1 by the route), or "" when there is none (the read failed: the page leaves
// the count out, never a guess). Past the cap (the operator may allow beyond it) it says every place is taken, never "51 of 50".
export function betaWords(count) {
  const taken = Number(count && count.taken), cap = Number(count && count.cap);
  if (!count || !Number.isSafeInteger(taken) || !Number.isSafeInteger(cap) || taken < 0 || cap < 1) return "";
  return taken >= cap ? `All ${cap} places taken` : `${taken} of ${cap} places taken`;
}
// the count as the mono label, or nothing
const betaLabel = (count) => { const w = betaWords(count); return w ? `<p class="eyebrow beta-count" data-beta-count>${esc(w)}</p>` : ""; };
// the walkthrough while a person waits: the showcase's own section, the ONE list (src/walkthrough.js); primary or quiet
const walkLink = (cls = "quiet") => `<a class="${cls}" href="${WALKTHROUGH_PATH}" data-walkthrough>See the walkthrough</a>`;

// THE TRACK: a request's road, its step lit (sprint 21, 21.P C12): requested -> in line -> approved -> signed up -> your org.
// track(at) -> the <ol>, the steps before `at` done, `at` the current one (aria-current="step")
export const TRACK = [["requested", "Requested"], ["in-line", "In line"], ["approved", "Approved"], ["signed-up", "Signed up"], ["org", "Your org"]];
function track(at) {
  const i = TRACK.findIndex(([k]) => k === at);
  return `<ol class="track" data-track="${esc(at)}" aria-label="Your request's steps">${TRACK.map(([k, w], j) => `<li data-step="${k}"${j < i ? " data-done" : ""}${j === i ? ' aria-current="step"' : ""}>` +
    `<span>${esc(w)}</span>${j < i ? '<span class="u-sr"> (done)</span>' : j === i ? '<span class="u-sr"> (now)</span>' : ""}</li>`).join("")}</ol>`;
}
// the pages' few rules on the front door's tokens: the track, what comes next, the place in line as the hero number, the
// address kept with its Copy link
const LINE_CSS = `
  .track{display:flex;margin:0 0 24px;padding:0;list-style:none}
  .track li{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;font:600 11.5px/1.25 var(--sans);color:var(--text-faint)}
  .track li::before{content:"";position:relative;z-index:1;width:10px;height:10px;border-radius:50%;border:2px solid var(--line-strong);background:var(--surface)}
  .track li::after{content:"";position:absolute;top:6px;left:16px;right:4px;height:2px;border-radius:2px;background:var(--line)}
  .track li:last-child::after{display:none}
  .track li[data-done]{color:var(--text-muted)}
  .track li[data-done]::before{background:var(--ok);border-color:var(--ok)}
  .track li[data-done]::after{background:var(--ok)}
  .track li[aria-current]{color:var(--text)}
  .track li[aria-current]::before{background:var(--text);border-color:var(--text);box-shadow:0 0 0 4px var(--well)}
  .solo .track{width:100%;margin:28px 0 0}
  .next{margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:6px;font:400 13.5px/1.5 var(--sans);color:var(--text)}
  .place{display:flex;flex-direction:column;align-items:flex-start;margin:30px 0 0}
  .place-k{font:600 13px/1.3 var(--sans);color:var(--text-muted)}
  .place-n{margin:4px 0 6px;font:600 clamp(88px,11vw,132px)/.9 var(--display);letter-spacing:-.04em;color:var(--text);font-variant-numeric:tabular-nums}
  .place-n::before{content:"#";font-size:.5em;vertical-align:.62em;margin-right:.04em;color:var(--text-faint)}
  .keep{display:flex;flex-direction:column;gap:6px;margin:22px 0 0;padding:16px 0 0;border-top:1px solid var(--line)}
  .keep-row{display:flex;gap:8px;align-items:stretch}
  .keep-row input{flex:1;min-width:0;height:46px!important;font:500 12.5px/1 var(--mono)!important;color:var(--text-muted)!important;text-overflow:ellipsis}
  .keep-row .primary{flex:none}
  .card .acts{margin-top:18px}
  .beta-count{margin-top:18px}
  .solo .beta-count{margin-top:22px}
  @media (max-width:480px){.track li{padding-right:6px;font-size:10px}.place{margin-top:22px}}
`;
// the request's own address, kept: selectable as text without a script; with one, Copy link (the page's one primary action) copies it
const KEEP_JS = `<script>(function(){var b=document.querySelector('[data-copy-link]'),i=document.getElementById('keep-url');if(!b||!i||!navigator.clipboard)return;` +
  `b.hidden=false;i.addEventListener('focus',function(){i.select();});b.addEventListener('click',function(){navigator.clipboard.writeText(i.value).then(function(){` +
  `b.textContent='Copied';setTimeout(function(){b.textContent='Copy link';},1600);},function(){i.focus();});});})();</script>`;
const keepRow = (url) => url ? `<div class="keep" data-region="request-keep">
        <label for="keep-url">Your request's own page: keep its address</label>
        <div class="keep-row"><input type="text" id="keep-url" readonly value="${esc(url)}" data-input-exception="auth"><button type="button" class="primary" data-copy-link hidden>Copy link</button></div>
      </div>${KEEP_JS}` : "";

// renderRequestReceived({ brand, request, place, count, url }) -> the request's own page, by its status (sprint 21, 21.2; 21.P the
// scenes): OPEN, "you're in line" (the place in line as the hero number, the beta's count when it was read, the track, what comes
// next, the page's own address with Copy link, the walkthrough as a quiet link); APPROVED, its place is open (the track at
// approved, the code by email, Sign up); DECLINED, one plain sentence (no reason, no count) and a way on (the walkthrough, the
// website). place: src/requestaccess.js placeInLine; count: src/accounts.js betaCount (null: left out); url: this page's address
// (the request's origin and path, src/index.js).
export function renderRequestReceived(opts) {
  const { brand = DEFAULT_BRAND, request = {}, place = null, count = null, url = "" } = opts || {};
  const status = String(request.status || "");
  if (status === "approved") {
    const body = `<div class="done" data-screen="request-approved" data-region="request-approved">
      ${track("approved")}
      <p class="done-why">Your sign-up code for <b data-request-company>${esc(request.company || "")}</b> comes to your email, ${esc(request.name || "")}. With it, sign up: the org form comes filled in from your request.</p>
      <div class="acts"><a class="primary" href="/signup">Sign up</a></div>
    </div>`;
    return authPage({ ...brandOf(brand, "Your place is open"), lede: "Your place is open.", solo: { pose: "verify", eyebrow: "Your request" }, body, css: LINE_CSS });
  }
  if (status !== "open") {
    const body = `<div class="done" data-screen="request-declined" data-region="request-declined">
      <p class="done-why">We cannot offer you a place in this beta.</p>
      <div class="acts">${walkLink("primary")}<a class="quiet" href="${SITE_URL}">Visit sharingu.xyz</a></div>
    </div>`;
    return authPage({ ...brandOf(brand, "Request closed"), lede: "Request closed.", solo: { pose: "classic", eyebrow: "Your request" }, body, css: LINE_CSS });
  }
  const hero = `${place ? `<div class="place" data-region="request-place"><span class="place-k">Your place in line</span><span class="place-n" data-request-place>${esc(String(place))}</span></div>` : ""}${betaLabel(count)}`;
  const body = `<div class="done" data-screen="request-in-line" data-region="request-in-line">
      ${track("in-line")}
      <ol class="next" data-region="request-next">
        <li>We review the requests in the order they came.</li>
        <li>When your place opens, we email a sign-up code to your address.</li>
        <li>With the code, sign up: the org form comes filled in from this request.</li>
      </ol>
      ${keepRow(url)}
      <div class="acts">${walkLink()}</div>
    </div>`;
  return authPage({ ...brandOf(brand, "You're in line"), lede: "What comes next", body, css: LINE_CSS,
    intro: { eyebrow: "Your request", heading: "You're in line.", more: hero,
      ledeHtml: `Thank you, ${esc(request.name || "")}. We have your request for <b data-request-company>${esc(request.company || "")}</b>.` } });
}

// renderRequestAsked({ brand, count }) -> the repeat's page (the first request stands): it names nothing the repeat typed; the
// beta's count (public numbers only) and the walkthrough
export function renderRequestAsked(opts) {
  const { brand = DEFAULT_BRAND, count = null } = opts || {};
  const body = `<div class="done" data-screen="request-asked" data-region="request-asked">
      <p class="done-why">The link from your first request shows your place in line.</p>
      ${betaLabel(count)}
      <div class="acts">${walkLink("primary")}</div>
    </div>`;
  return authPage({ ...brandOf(brand, "Already asked"), lede: "This email has asked already.", solo: { pose: "comment", eyebrow: "Already asked" }, body, css: LINE_CSS });
}

// renderRequestCheck({ brand }) -> the check page ("Check my request", sprint 21, 21.P F24: the front door's second path beside Sign
// in): the request's own link holds its place; a lost one waits for 21.4 (a check by Google or by email). No form, nothing read.
export function renderRequestCheck(opts) {
  const { brand = DEFAULT_BRAND } = opts || {};
  const body = `<div class="done" data-screen="request-check" data-region="request-check">
      <p class="done-why">The link you got when you asked holds your place in line. Open it again to see where you are.</p>
      <p class="done-why">Lost it? Checking your request by Google or by email is coming.</p>
      <div class="acts"><a class="primary" href="${REQUEST_PATH}" data-region="request-access-link">${JOIN_WORDS}</a></div>
    </div>`;
  return authPage({ ...brandOf(brand, "Check my request"), here: "check", lede: "Open the link from your request.", solo: { pose: "inspect", eyebrow: "Check my request" }, body });
}

// renderRequestMissing({ brand }) -> the one not-found: a link that opens no request, whatever it held
export function renderRequestMissing(opts) {
  const { brand = DEFAULT_BRAND } = opts || {};
  const body = `<div class="done" data-screen="request-missing">
      <p class="done-why">Check the address you were given.</p>
      <div class="acts"><a class="primary" href="${REQUEST_PATH}">${JOIN_WORDS}</a></div>
    </div>`;
  return authPage({ ...brandOf(brand, "Not found"), lede: "This link opens no request.", solo: { pose: "inspect", eyebrow: "Not found" }, body });
}
