// src/accountpage.js — the account flow's pages (sprint 21, slice 21.4a; the owner's MCQ of 2026-10-14; src/accounts.js THE ACCOUNT
// FLOW), each a scene of the front door (src/login.js authPage: both worlds, the one accent, U-chan's poses), never a second skin.
// No statement here: the routes (src/index.js /account/…) read and hand each page what it shows.
//   renderSent({ brand, paused, email, google })  check your inbox: POST /request-access's and a resend's ONE answer, whatever the
//                                             email (new, already asked, an account's, the honeypot's) — or, at the cap, email checks
//                                             are paused (21.4c: Continue with Google beside it when a client is stored); the resend
//   renderVerify({ brand, token, email, error })  the verification link's page: the passphrase the join chose, then Verify (POST)
//   renderLinkDead({ brand, kind })           a link that is expired, used or none (kind verify: the resend; reset: a new link)
//   renderResend({ brand, error, email })     the resend's own form (the sign-in's "Didn't get the email? Resend")
//   renderForgot({ brand, error })            forgot your passphrase: the email
//   renderForgotSent({ brand, paused, google })  its ONE answer, whether or not an account holds the email (paused: Google too)
//   renderReset({ brand, token, error })      a reset link's page: the new passphrase twice
//   renderAccountStatus({ brand, request, place, count, standing })  the signed-in account's own page (an ACCOUNT session):
//                                             in line (its place, the beta's count, the track), its place open (Create your org),
//                                             closed, cleared (no request on file: the 90-day clearing), or its org made (sign in to it)
//   renderNoAccount({ brand, email, vouched })  (21.4c) Google proved an email no account holds: Join the beta with it (the form
//                                             comes filled in, the email locked); vouched false — a mailbox Google does not run —
//                                             the plain join, its email checked by the emailed link
//   renderGoogleLink({ brand, email, error })   (the sprint end's review) an account whose email Google does not run: its passphrase
//                                             links Google the first time (POST /auth/google/link)
//   renderGoogleRefused({ brand, why })       (21.4c) Google's sign-in did not complete: ONE plain page, nothing signed in
import { esc, errorState, uchanPose } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { authPage, SITE_URL, JOIN_WORDS } from "./login.js";
import { brandOf, betaLabel, track, LINE_CSS } from "./requestpage.js";
import { REQUEST_PATH, VERIFY_PATH, RESEND_PATH, FORGOT_PATH, RESET_PATH } from "./requestaccess.js";
import { WALKTHROUGH_PATH } from "./walkthrough.js";
import { VERIFY_HOURS, RESET_MINUTES } from "./mails.js";
import { ACCOUNT_MIN_PASSPHRASE } from "./secrets.js";
import { googleLink, GOOGLE_CSS } from "./googlepage.js";   // sprint 21, 21.4c
import { LINK_PATH } from "./google.js";

const walkLink = (cls = "quiet") => `<a class="${cls}" href="${WALKTHROUGH_PATH}" data-walkthrough>See the walkthrough</a>`;
const art = (pose) => `<div class="art-pose" data-art="${esc(pose)}">${uchanPose({ pose, size: 240 })}</div>`;
// the words a page says at the cap (THE CAP, src/email.js): no email went out; Google is the other way in (21.4c), when it is offered
export const PAUSED_WORDS = "We send a set number of emails each month, and that number is reached for now: no email went out.";
const pausedWords = (google) => `${PAUSED_WORDS} ${google ? "Continue with Google instead: Google has checked your email already." : "Try again in a few days."}`;
// the Google button under a solo page's actions (paused: the other way in)
const googleWrap = (intent) => `<div class="google-wrap">${googleLink(intent)}</div>`;
// the resend's small form (an email, one quiet button): on the sent page and a dead verification link's
const resendForm = (email = "", primary = false) => `<form method="POST" action="${RESEND_PATH}" class="resend" data-region="resend">
      <input type="hidden" name="web" value="1">
      <div class="field">
        <label for="resend-email">Didn't get it? Your email</label>
        <input type="email" id="resend-email" name="email" autocomplete="email" required value="${esc(email)}" data-input-exception="auth">
      </div>
      ${primary ? '<button type="submit">Resend</button>' : '<button class="quiet" type="submit">Resend</button>'}
    </form>`;
const ACCOUNT_CSS = `
  .resend{margin:26px 0 0;width:100%;max-width:420px;padding:18px 0 0;border-top:1px solid var(--line)}
  .resend button.quiet{display:inline-flex;align-items:center;justify-content:center;height:46px;margin-top:6px;padding:0 20px;font:700 14.5px/1 var(--sans);color:var(--text);
    background:transparent;border:1px solid var(--line-strong);border-radius:10px;cursor:pointer}
  .resend button.quiet:hover{background:var(--hover)}
  .who{margin:0;font:500 13px/1.4 var(--mono);color:var(--text-muted)}
`;

export function renderSent(opts) {
  const { brand = DEFAULT_BRAND, paused = false, email = "", google = false } = opts || {};
  if (paused) {
    const body = `<div class="done" data-screen="account-paused" data-region="account-paused">
      <p class="done-why">${esc(pausedWords(google))}</p>
      <div class="acts">${walkLink("primary")}<a class="quiet" href="${SITE_URL}">Visit sharingu.xyz</a></div>
      ${google ? googleWrap("join") : ""}
    </div>`;
    return authPage({ ...brandOf(brand, "Email checks paused"), lede: "Email checks are paused.", solo: { pose: "inspect", eyebrow: "Your request" }, body, css: ACCOUNT_CSS + (google ? GOOGLE_CSS : "") });
  }
  const body = `<div class="done" data-screen="account-sent" data-region="account-sent">
      <p class="done-why">We sent an email to the address you gave. Open its link within ${VERIFY_HOURS} hours and type your passphrase: your request then takes its place in line.</p>
      <div class="acts">${walkLink("primary")}</div>
      ${resendForm(email)}
    </div>`;
  return authPage({ ...brandOf(brand, "Check your inbox"), lede: "Check your inbox.", solo: { pose: "verify", eyebrow: "Your request" }, body, css: ACCOUNT_CSS });
}

export function renderVerify(opts) {
  const { brand = DEFAULT_BRAND, token = "", email = "", error = "" } = opts || {};
  const body = `<form method="POST" action="${VERIFY_PATH}" data-screen="account-verify" data-region="verify">
      <input type="hidden" name="web" value="1">
      <input type="hidden" name="token" value="${esc(token)}">
      <div class="field">
        <label for="username">Email</label>
        <input type="email" id="username" name="username" autocomplete="username" readonly value="${esc(email)}" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="password">Your passphrase</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required autofocus data-input-exception="auth">
        <p class="hint">The one you chose when you asked to join.</p>
      </div>
      <button type="submit">Verify my email</button>
    </form>`;
  return authPage({ ...brandOf(brand, "Verify your email"), lede: "Verify your email", banner: error ? errorState({ what: error }) : "", body, css: ACCOUNT_CSS,
    intro: { eyebrow: "Your request", heading: "One last step.", lede: "Type your passphrase: it proves the request is yours, and your request takes its place in line.", art: art("verify"), phone: false } });
}

export function renderLinkDead(opts) {
  const { brand = DEFAULT_BRAND, kind = "verify" } = opts || {};
  const reset = kind === "reset";
  const body = `<div class="done" data-screen="account-link-dead" data-region="link-dead">
      <p class="done-why">${reset ? `A reset link works once, for ${RESET_MINUTES} minutes.` : `A verification link works once, for ${VERIFY_HOURS} hours. Ask for a new one.`}</p>
      ${reset ? `<div class="acts"><a class="primary" href="${FORGOT_PATH}">Ask for a new link</a></div>` : resendForm("", true)}
    </div>`;
  return authPage({ ...brandOf(brand, "Link expired"), lede: "This link has expired or was used.", solo: { pose: "inspect", eyebrow: reset ? "Reset your passphrase" : "Verify your email" }, body, css: ACCOUNT_CSS });
}

export function renderResend(opts) {
  const { brand = DEFAULT_BRAND, error = "", email = "" } = opts || {};
  const body = `<form method="POST" action="${RESEND_PATH}" data-screen="account-resend" data-region="resend">
      <input type="hidden" name="web" value="1">
      <div class="field">
        <label for="email">The email you asked with</label>
        <input type="email" id="email" name="email" autocomplete="email" required autofocus value="${esc(email)}" data-input-exception="auth">
      </div>
      <button type="submit">Resend the email</button>
    </form>`;
  return authPage({ ...brandOf(brand, "Resend the email"), lede: "Resend the verification", banner: error ? errorState({ what: error }) : "", body, css: ACCOUNT_CSS,
    footnote: `<p>Verified already? <a href="/login">Sign in</a></p><p>No request yet? <a href="${REQUEST_PATH}">${JOIN_WORDS}</a></p>`,
    intro: { eyebrow: "Your request", heading: "A new link.", lede: `It works for ${VERIFY_HOURS} hours; at most three emails go to one address a day.`, art: art("comment"), phone: false } });
}

export function renderForgot(opts) {
  const { brand = DEFAULT_BRAND, error = "" } = opts || {};
  const body = `<form method="POST" action="${FORGOT_PATH}" data-screen="account-forgot" data-region="forgot">
      <input type="hidden" name="web" value="1">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required autofocus data-input-exception="auth">
      </div>
      <button type="submit">Send me a reset link</button>
    </form>`;
  return authPage({ ...brandOf(brand, "Forgot your passphrase"), lede: "Forgot your passphrase?", banner: error ? errorState({ what: error }) : "", body, css: ACCOUNT_CSS,
    footnote: `<p>Remembered it? <a href="/login">Sign in</a></p>`,
    intro: { eyebrow: "Your account", heading: "Choose a new one.", lede: `We email a link that works once, for ${RESET_MINUTES} minutes. Every session of your account is signed out when you use it.`, art: art("inspect"), phone: false } });
}

export function renderForgotSent(opts) {
  const { brand = DEFAULT_BRAND, paused = false, google = false } = opts || {};
  const offer = paused && google;
  const body = `<div class="done" data-screen="${paused ? "account-paused" : "account-forgot-sent"}" data-region="forgot-sent">
      <p class="done-why">${paused ? esc(pausedWords(google)) : `If an account holds that email, a link to choose a new passphrase is on its way. It works once, for ${RESET_MINUTES} minutes.`}</p>
      <div class="acts"><a class="primary" href="/login">Back to sign in</a></div>
      ${offer ? googleWrap("signin") : ""}
    </div>`;
  return authPage({ ...brandOf(brand, paused ? "Email checks paused" : "Check your inbox"), lede: paused ? "Email checks are paused." : "Check your inbox.",
    solo: { pose: paused ? "inspect" : "verify", eyebrow: "Reset your passphrase" }, body, css: ACCOUNT_CSS + (offer ? GOOGLE_CSS : "") });
}

// renderNoAccount — Google proved an email no account holds (21.4c, the sign-in or the connect page): the way in is the join, its
// form filled in from Google (the email locked: src/requestpage.js); Join the beta is the page's one primary
export function renderNoAccount(opts) {
  const { brand = DEFAULT_BRAND, email = "", vouched = true } = opts || {};
  const how = vouched ? "Google has checked the email, so no email comes to verify it." : "Google does not run that address's mailbox, so we email you a link to verify it.";
  const body = `<div class="done" data-screen="google-no-account" data-region="google-no-account" data-vouched="${vouched ? "1" : "0"}">
      <p class="done-why">No sharingu account holds <b data-google-email>${esc(email)}</b>. Join the beta with it: ${how}</p>
      <div class="acts"><a class="primary" href="${REQUEST_PATH}" data-region="request-access-link">${JOIN_WORDS}</a><a class="quiet" href="/login">Back to sign in</a></div>
    </div>`;
  return authPage({ ...brandOf(brand, "No account yet"), lede: "No account yet.", solo: { pose: "comment", eyebrow: "Continue with Google" }, body, css: ACCOUNT_CSS });
}
// GOOGLE_REFUSED_WORDS — why Google's sign-in did not complete, one sentence each (src/index.js /auth/google/…: the reason's key);
// any other reason is "failed"
export const GOOGLE_REFUSED_WORDS = {
  off: "Google sign-in is not available on this address.",
  cancelled: "The Google sign-in was cancelled.",
  expired: "That Google sign-in expired or was used already. Start again from the sign-in page.",
  failed: "Google could not confirm who you are. Start again from the sign-in page.",
  unverified: "Google has not verified that account's email, so it cannot sign in here.",
  email_form: "That Google account's email is not one plain address, so sharingu cannot take it.",
  other_sub: "That sharingu account signs in with a different Google account. Use that one, or your passphrase.",
  linked_elsewhere: "That Google account signs in to another sharingu account, under its earlier email.",
  connect: "That connection request expired. Start again from the app you were connecting.",
  exists: "An account holds that email already: sign in with Google or with its passphrase.",
  link_invited: "That account's passphrase came from an org's invite link, so it cannot link Google. Reset the passphrase by email first, then continue with Google.",
};
// the link page's words on a refusal of its passphrase (the page again, the ticket kept)
export const GOOGLE_LINK_WORDS = { wrong: "That is not this account's passphrase.", locked: "Too many attempts on this account. Wait 15 minutes and try again." };
// renderGoogleLink — Google proved an email whose mailbox it does not run, and an account holds it: the account's own passphrase links
// Google this once (the link ticket rides this browser's cookie, never the form); a forgotten one is reset by email first
export function renderGoogleLink(opts) {
  const { brand = DEFAULT_BRAND, email = "", error = "" } = opts || {};
  const body = `<form method="POST" action="${LINK_PATH}" data-screen="google-link" data-region="google-link">
      <div class="field">
        <label for="google-email">Email</label>
        <input type="email" id="google-email" value="${esc(email)}" readonly data-google-email data-input-exception="auth">
      </div>
      <div class="field">
        <label for="password">Your sharingu passphrase</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required autofocus data-input-exception="auth"${error ? ' aria-invalid="true"' : ""}>
        ${error ? `<p class="hint" data-field-error>${esc(GOOGLE_LINK_WORDS[error] || GOOGLE_LINK_WORDS.wrong)}</p>` : ""}
      </div>
      <button type="submit">Link Google and sign in</button>
    </form>`;
  return authPage({ ...brandOf(brand, "Link Google"), lede: "Link Google to your account", body, css: ACCOUNT_CSS,
    footnote: `<p>Forgot it? <a href="${FORGOT_PATH}">Reset your passphrase</a>, then continue with Google again.</p>`,
    intro: { eyebrow: "Continue with Google", heading: "Once, with your passphrase.", lede: "Google does not run this email's mailbox, so the first Google sign-in needs your sharingu passphrase too. After that, Google alone signs you in.", art: art("inspect"), phone: false } });
}
// the join form's words when its Google identity is gone (used, past JOIN_MINUTES, another browser): the plain form again
export const GOOGLE_JOIN_GONE = "Your Google sign-in for this form expired. Continue with Google again, or join with your email and a passphrase.";
export function renderGoogleRefused(opts) {
  const { brand = DEFAULT_BRAND, why = "failed" } = opts || {};
  const body = `<div class="done" data-screen="google-refused" data-region="google-refused" data-why="${esc(GOOGLE_REFUSED_WORDS[why] ? why : "failed")}">
      <p class="done-why">${esc(GOOGLE_REFUSED_WORDS[why] || GOOGLE_REFUSED_WORDS.failed)} Nothing was signed in.</p>
      <div class="acts"><a class="primary" href="/login">Back to sign in</a></div>
    </div>`;
  return authPage({ ...brandOf(brand, "Google sign-in stopped"), lede: "Google sign-in did not complete.", solo: { pose: "inspect", eyebrow: "Continue with Google" }, body, css: ACCOUNT_CSS });
}

export function renderReset(opts) {
  const { brand = DEFAULT_BRAND, token = "", error = "" } = opts || {};
  const body = `<form method="POST" action="${RESET_PATH}" data-screen="account-reset" data-region="reset">
      <input type="hidden" name="web" value="1">
      <input type="hidden" name="token" value="${esc(token)}">
      <div class="field">
        <label for="password">New passphrase</label>
        <input type="password" id="password" name="password" autocomplete="new-password" required minlength="${ACCOUNT_MIN_PASSPHRASE}" autofocus data-input-exception="auth">
        <p class="hint">At least ${ACCOUNT_MIN_PASSPHRASE} characters.</p>
      </div>
      <div class="field">
        <label for="confirm">New passphrase again</label>
        <input type="password" id="confirm" name="confirm" autocomplete="new-password" required minlength="${ACCOUNT_MIN_PASSPHRASE}" data-input-exception="auth">
      </div>
      <button type="submit">Set my passphrase</button>
    </form>`;
  return authPage({ ...brandOf(brand, "Choose a new passphrase"), lede: "Choose a new passphrase", banner: error ? errorState({ what: error }) : "", body, css: ACCOUNT_CSS,
    intro: { eyebrow: "Your account", heading: "A fresh start.", lede: "Every session of your account is signed out, in every org; then you are signed in fresh.", art: art("verify"), phone: false } });
}

// renderAccountStatus — the account session's own page (here "account": the top bar's Sign out). request: the email's verified
// request (src/requestaccess.js verifiedRequestOf), place and count read for an open one; standing: src/accounts.js
// accountStanding ({ coded: the operator's code signed it up, founded: its org's path name })
export function renderAccountStatus(opts) {
  const { brand = DEFAULT_BRAND, request = null, place = null, count = null, standing = {} } = opts || {};
  const status = request ? String(request.status || "") : standing.coded ? "approved" : "";
  const solo = (words, pose, eyebrow, inner) => authPage({ ...brandOf(brand, words), here: "account", lede: `${words}.`, solo: { pose, eyebrow }, body: inner, css: LINE_CSS + ACCOUNT_CSS });
  if (standing.founded) return solo("Your org is ready", "verify", "Your account", `<div class="done" data-screen="account-org" data-region="account-org">
      ${track("org")}
      <p class="done-why">Sign in to open it: your org lives at /${esc(standing.founded)}.</p>
      <div class="acts"><a class="primary" href="/login">Sign in</a></div>
    </div>`);
  if (status === "approved") return solo("Your place is open", "verify", "Your request", `<div class="done" data-screen="account-approved" data-region="account-approved">
      ${track("approved")}
      <p class="done-why">Create the org for <b data-request-company>${esc((request && request.company) || "your team")}</b>: the form comes filled in from your request.</p>
      <div class="acts"><a class="primary" href="/orgs/new" data-region="create-org-link">Create your org</a></div>
    </div>`);
  // (the sprint end's review) no request on file: THE 90-DAY CLEARING emptied it (a declined one, or an approved one with no org)
  if (!request && !standing.coded) return solo("Request cleared", "classic", "Your request", `<div class="done" data-screen="account-cleared" data-region="account-cleared">
      <p class="done-why">Your request is no longer on file: we clear a request 90 days after it is declined, or 90 days after its approval when no org was made. To ask again, reply to any email we sent you.</p>
      <div class="acts">${walkLink("primary")}<a class="quiet" href="${SITE_URL}">Visit sharingu.xyz</a></div>
    </div>`);
  if (status !== "open") return solo("Request closed", "classic", "Your request", `<div class="done" data-screen="account-closed" data-region="account-closed">
      <p class="done-why">We cannot offer you a place in this beta.</p>
      <div class="acts">${walkLink("primary")}<a class="quiet" href="${SITE_URL}">Visit sharingu.xyz</a></div>
    </div>`);
  const hero = `${place ? `<div class="place" data-region="request-place"><span class="place-k">Your place in line</span><span class="place-n" data-request-place>${esc(String(place))}</span></div>` : ""}${betaLabel(count)}`;
  const body = `<div class="done" data-screen="account-in-line" data-region="account-in-line">
      ${track("in-line")}
      <ol class="next" data-region="request-next">
        <li>We review the requests in the order their emails were verified.</li>
        <li>When your place opens, we email you: sign in, then create your org.</li>
        <li>The org form comes filled in from your request.</li>
      </ol>
      <div class="acts">${walkLink()}</div>
    </div>`;
  return authPage({ ...brandOf(brand, "You're in line"), here: "account", lede: "What comes next", body, css: LINE_CSS + ACCOUNT_CSS,
    intro: { eyebrow: "Your request", heading: "You're in line.", more: hero,
      ledeHtml: `Thank you, ${esc(request.name || "")}. Your request for <b data-request-company>${esc(request.company || "")}</b> is verified.` } });
}
