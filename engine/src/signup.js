// src/signup.js — the sign-up pages (sprint 7, slice 7.2; docs/plan/PLATFORM.md §2 item 10): GET /signup (the form: email,
// the operator's one-time code, the passphrase twice). The same front door as the sign-in (src/login.js authPage: one card, both worlds, the one accent), never a second
// skin. No statement here: the sign-up itself is src/accounts.js signUp, the route POST /signup (src/index.js).
//
// signupProblem({ email, code, password, confirm }) -> "" or the field that is wrong (email · email_ascii: an address holding a
// letter outside ASCII, src/accounts.js asciiEmail · code · passphrase · confirm),
// checked BEFORE anything is read: it says nothing about which emails are allowed (an unallowed email and a wrong code are
// one answer, src/accounts.js).
// renderSignup({ error, brand, email }) -> the page (a sign-up with no seat answers the create-an-org page: src/orgpage.js).
// THE INVITE PAGE (sprint 12, 12.3; src/accounts.js THE INVITE LINK): GET /signup?via=invite, the page an org's invite link opens
// (<origin>/signup?via=invite#<token>). The token rides the URL's FRAGMENT, which the browser never sends: the page's script moves
// it into the form (and drops it from the address bar and the history entry), and the form POSTs it. It sets no session: only the
// POST, after the passphrase is set, does. inviteProblem({ invite, password, confirm }) -> "" or the field that is wrong (invite ·
// passphrase · confirm), checked before anything is read; renderInvite({ error, brand, invite }) -> the page (invite: the token the
// person already sent, kept in the form when a field was wrong, never on a refusal).
import { esc, errorState } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { authPage, authBrand } from "./login.js";
import { passphraseProblem, ACCOUNT_MIN_PASSPHRASE } from "./secrets.js";
import { asciiEmail, normInvite, INVITE_TOKEN_RE } from "./accounts.js";

// the one refusal (an email not allowed; a wrong, used, expired or revoked code): the same words for every case
export const SIGNUP_REFUSED_WORDS = "That email and code do not open a sign-up. Check both with the person who gave you the code.";
// the field problems, in the words the page shows (nothing here depends on the allowlist)
export const SIGNUP_FIELD_WORDS = {
  email: "Type the email the code was given for.",
  code: "Type the code exactly as it was given to you.",
  passphrase: `Choose a passphrase of at least ${ACCOUNT_MIN_PASSPHRASE} characters.`,
  confirm: "The two passphrases differ. Type the same one twice.",
};
// an email's form, the front door's one test (the sign-up's and the org creation's: src/orgs.js)
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function signupProblem({ email, code, password, confirm } = {}) {
  const e = String(email == null ? "" : email).trim();
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) return "email";
  if (!asciiEmail(e)) return "email_ascii";   // A5 (sprint 7's review): one spelling of an account's email (POST /signup: email_not_ascii)
  const c = String(code == null ? "" : code).replace(/[\s-]+/g, "");
  if (!c || c.length > 64) return "code";
  if (passphraseProblem(password, { account: true }) || String(password).length > 1024) return "passphrase";
  if (confirm != null && String(confirm) !== String(password)) return "confirm";
  return "";
}

// the sign-up page: the front door's card, its title and wordmark naming the product (the org is secondary text)
function brandOf(brand) {
  const { wordmark, title } = authBrand(brand || DEFAULT_BRAND);
  return { wordmark, title: title.replace(/^Sign in/, "Sign up") };
}

export function renderSignup(opts) {
  const { error = "", brand = DEFAULT_BRAND, email = "" } = opts || {};
  const { title, wordmark } = brandOf(brand);
  // the code field is text (no browser keeps it), never autofilled from history, and it never rides a URL: the form POSTs
  const body = `<form method="POST" action="/signup" data-screen="signup" data-region="sign-up">
      <input type="hidden" name="web" value="1">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required autofocus value="${esc(email)}" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="code">Sign-up code</label>
        <input type="text" id="code" name="code" class="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required maxlength="64" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="password">Passphrase</label>
        <input type="password" id="password" name="password" autocomplete="new-password" required minlength="${ACCOUNT_MIN_PASSPHRASE}" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="confirm">Passphrase again</label>
        <input type="password" id="confirm" name="confirm" autocomplete="new-password" required minlength="${ACCOUNT_MIN_PASSPHRASE}" data-input-exception="auth">
      </div>
      <button type="submit">Sign up</button>
    </form>`;
  return authPage({
    title,
    wordmark,
    lede: "Sign up",
    banner: error ? errorState({ what: error }) : "",
    body,
    footnote: `The email and code come from the person who invited you. Already signed up? <a href="/login">Sign in</a>`,
  });
}

// ---- the invite page (sprint 12, 12.3) ----
// the one refusal (no such open link: used, expired, replaced by a newer one, its seat removed or reissued): the same words for each
export const INVITE_REFUSED_WORDS = "That invite link does not open a sign-up: it was used, it expired, or the admin made a newer one or changed the seat. Ask the admin who invited you for a new link.";
// an email whose account already stands (its own passphrase, or a seat in another org): the link changed nothing
export const INVITE_STANDS_WORDS = "Your email already holds a sharingu account, so this link sets no passphrase and changed nothing. Sign in at /login with your account passphrase; if the seat waits for your yes, accept it on your org list (/orgs). No passphrase yet? Ask the sharingu operator for a sign-up code (/signup).";
export const INVITE_FIELD_WORDS = {
  invite: "Open the invite link you were given, or paste the whole link here.",
  passphrase: `Choose a passphrase of at least ${ACCOUNT_MIN_PASSPHRASE} characters.`,
  confirm: "The two passphrases differ. Type the same one twice.",
};
export function inviteProblem({ invite, password, confirm } = {}) {
  if (String(invite == null ? "" : invite).length > 512 || !INVITE_TOKEN_RE.test(normInvite(invite))) return "invite";
  if (passphraseProblem(password, { account: true }) || String(password).length > 1024) return "passphrase";
  if (confirm != null && String(confirm) !== String(password)) return "confirm";
  return "";
}
// the page's one script: the fragment's token into the form, then out of the address bar and its history entry (the field hides
// once it holds a token; with none, it stays for a pasted link)
const INVITE_JS = `<script>(function(){var f=document.getElementById('invite'),w=document.getElementById('invite-field');if(!f)return;` +
  `var h=location.hash?location.hash.slice(1):'';if(h&&!f.value)f.value=h;if(location.hash){try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}}` +
  `if(f.value&&w){w.hidden=true;var p=document.getElementById('password');if(p)p.focus();}})();</script>`;
export function renderInvite(opts) {
  const { error = "", brand = DEFAULT_BRAND, invite = "" } = opts || {};
  const { title, wordmark } = brandOf(brand);
  const kept = INVITE_TOKEN_RE.test(normInvite(invite)) ? normInvite(invite) : "";
  const body = `<form method="POST" action="/signup" data-screen="signup-invite" data-region="invite">
      <input type="hidden" name="web" value="1">
      <input type="hidden" name="via" value="invite">
      <div class="field" id="invite-field">
        <label for="invite">Invite link</label>
        <input type="text" id="invite" name="invite" class="code" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="512" value="${esc(kept)}" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="password">Passphrase</label>
        <input type="password" id="password" name="password" autocomplete="new-password" required minlength="${ACCOUNT_MIN_PASSPHRASE}" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="confirm">Passphrase again</label>
        <input type="password" id="confirm" name="confirm" autocomplete="new-password" required minlength="${ACCOUNT_MIN_PASSPHRASE}" data-input-exception="auth">
      </div>
      <button type="submit">Join</button>
    </form>${INVITE_JS}`;
  return authPage({
    title,
    wordmark,
    lede: "Choose your passphrase",
    banner: error ? errorState({ what: error }) : "",
    body,
    css: ".field[hidden]{display:none}",
    footnote: `An admin of the org that invited you made this link; it works once. Already have an account? <a href="/login">Sign in</a>`,
  });
}
