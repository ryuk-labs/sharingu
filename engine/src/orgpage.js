// src/orgpage.js — the create-an-org pages (sprint 7, slice 7.3; docs/plan/PLATFORM.md §2 item 9): GET /orgs/new (the form:
// your account's email and passphrase, the org's name, its address, its first project and your name) and the page POST /orgs
// answers when the org is made. The same front door as the sign-in and the sign-up (src/login.js authPage: the website's scene,
// both worlds, the one accent), never a second skin. No statement here: the creation is src/orgs.js createOrg, the routes
// src/index.js.
//
// renderOrgNew({ error, field, values, host }) · renderOrgMade({ made, origin, signedIn }) -> the pages (field: the product step's wrong
// field, sprint 21, 21.4b, marked on itself). `values` re-fills what was typed
// (never the passphrase), or, as a web sign-up's answer (sprint 21, 21.2) or an approved account session's form (21.4a), the email
// and the approved request's company, its suggested address and name (then the passphrase takes the focus: it is asked again); `host` is the address the org's path will hang off (the
// request's own: nothing per deployment here).
// sprint 21, 21.P (the owner's MCQs of 2026-10-14): D19 — the address is suggested from the org's name as the person types
// (src/orgnames.js suggestSlug, the same function the page's script runs by its own source), still theirs to edit: once they
// type in it, it is left alone; without a script the field is typed as before. A form that knows its email (a sign-up's answer, a
// refusal's re-render) carries no way to sign up: the person has an account. D18 — the made page leads with Connect your AI
// (src/connectcards.js, the cards the first Home shows), the owner key folded behind "Show the owner key" (for scripts and API
// calls, shown once, Copy), then Open your org, the page's one orange primary: POST /orgs signed the person in (D17).
import { esc, errorState, uchanPose } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { authPage, authBrand, JOIN_WORDS } from "./login.js";
import { REQUEST_PATH } from "./requestaccess.js";
import { googleLink, GOOGLE_CSS } from "./googlepage.js";   // sprint 21, 21.4c: the step-up's Continue with Google
import { ORG_SLUG_MAX, suggestSlug } from "./orgnames.js";
import { ORG_NAME_MAX, PROJECT_SLUG_MAX } from "./orgs.js";
import { projectSlug } from "./project.js";
import { connectCards, CONNECT_CARDS_CSS, COPY_JS } from "./connectcards.js";
import { PRODUCT_CHOICES, PRODUCT_MAX, PRODUCT_REQUIRED, PRODUCT_NOTE, PRODUCT_FIELD_WORDS } from "./orgprofile.js";   // sprint 21, 21.4b: the product step
// the first project as a person reads it: its name and the slug its AI names it by, never the org-prefixed key (12.6)
const projectWords = (p) => { const slug = projectSlug(String((p && p.key) || "")); const name = String((p && p.name) || ""); return name && slug && name !== slug ? `${name} (${slug})` : name || slug; };

// the page belongs to the platform, not to an org: the product's own wordmark (the org's name rides the made page)
const frame = (brand) => authBrand(brand || DEFAULT_BRAND);

// the address follows the org's name while it is the name's suggestion (or empty); a person's own address is left alone
const SLUG_JS = `<script>(function(){var s=(${suggestSlug.toString()}),n=document.getElementById('name'),a=document.getElementById('slug');if(!n||!a)return;` +
  `var last=s(n.value,${ORG_SLUG_MAX});n.addEventListener('input',function(){var next=s(n.value,${ORG_SLUG_MAX});if(a.value===''||a.value===last)a.value=next;last=next;});})();</script>`;

// THE PRODUCT STEP (21.4b; src/orgprofile.js): "What you'll build with sharingu" under the org's own fields — the product and its one
// line, then each choice as CHIPS in the website's look: a real checkbox (multi) or radio (one) under each chip's label, so the keyboard
// (Tab, Space, the arrows in a radio group) and a browser with no script work; a ticked chip in ink, never the page's orange. A wrong
// field (field: readProductStep's) is marked on itself, its words under it, the focus on it; the answers come back as sent.
const PRODUCT_CSS = `
  .build{margin:6px 0 0;padding:20px 0 0;border:0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:16px;min-width:0}
  .build>legend{float:left;width:100%;padding:0;margin:0;font:800 18px/1.25 var(--sans);letter-spacing:-.01em;color:var(--text)}
  .build>legend+*{clear:both}
  .build-note{margin:-8px 0 0;font:400 12.5px/1.45 var(--sans);color:var(--text-muted)}
  .chips{margin:0;padding:0;border:0;min-width:0}
  .chips>legend{padding:0;margin:0 0 8px;font:600 13.5px/1.3 var(--sans);color:var(--text)}
  .chips .opt{font:500 12px/1 var(--sans);color:var(--text-muted)}
  .chip-row{display:flex;flex-wrap:wrap;gap:8px}
  .chip{position:relative;display:inline-flex}
  .chip input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
  .chip span{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;font:600 13px/1 var(--sans);color:var(--text);background:var(--page);
    border:1px solid var(--line-strong);border-radius:999px;transition:background-color var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}
  .chip:hover span{background:var(--hover)}
  .chip input:checked+span{background:var(--text);border-color:var(--text);color:var(--page)}
  .chip input:checked+span::before{content:"";width:9px;height:5px;margin:-3px 0 0;border-left:2px solid currentColor;border-bottom:2px solid currentColor;rotate:-45deg}
  .chip input:focus-visible+span{outline:2px solid var(--field-ring);outline-offset:2px}
  .chips[aria-invalid="true"] .chip span{border-color:var(--err)}
  .field-err{margin:6px 0 0;font:600 12.5px/1.45 var(--sans);color:var(--err)}
  [aria-invalid="true"]>input,input[aria-invalid="true"]{border-color:var(--err)!important}
`;
// chipGroup(key, values, wrong) -> one choice as a fieldset of chips (its label the legend; optional ones say so)
function chipGroup(key, values, wrong) {
  const c = PRODUCT_CHOICES[key];
  const sent = [].concat(values[key] == null ? [] : values[key]).map(String);
  const required = PRODUCT_REQUIRED.includes(key), bad = wrong === key;
  const chips = c.values.map(([k, w]) => `<label class="chip"><input type="${c.multi ? "checkbox" : "radio"}" name="${key}" value="${esc(k)}"${sent.includes(k) ? " checked" : ""}${required && !c.multi ? " required" : ""}${bad && k === c.values[0][0] ? " autofocus" : ""} data-input-exception="auth"><span>${esc(w)}</span></label>`).join("");
  return `<fieldset class="chips" data-chips="${key}"${bad ? ` aria-invalid="true" aria-describedby="err-${key}"` : ""}>
          <legend>${esc(c.label)}${required ? "" : ` <span class="opt">optional${c.multi ? ", any" : ""}</span>`}</legend>
          <div class="chip-row">${chips}</div>
          ${bad ? `<p class="field-err" id="err-${key}" data-field-error="${key}">${esc(PRODUCT_FIELD_WORDS[key])}</p>` : ""}
        </fieldset>`;
}
// productStep(values, wrong) -> the step: the two texts, then the six choices in the form's order
function productStep(values, wrong) {
  const text = (k, label, hint) => {
    const bad = wrong === k;
    return `<div class="field">
          <label for="${k}">${esc(label)}</label>
          <input type="text" id="${k}" name="${k}" required maxlength="${PRODUCT_MAX[k]}" value="${esc(String(values[k] == null ? "" : values[k]))}"${bad ? ` aria-invalid="true" autofocus aria-describedby="err-${k}"` : ""} data-input-exception="auth">
          ${bad ? `<p class="field-err" id="err-${k}" data-field-error="${k}">${esc(PRODUCT_FIELD_WORDS[k])}</p>` : hint ? `<p class="hint">${esc(hint)}</p>` : ""}
        </div>`;
  };
  return `<fieldset class="build" data-region="product-step">
        <legend>What you'll build with sharingu</legend>
        <p class="build-note">${esc(PRODUCT_NOTE)}</p>
        ${text("product", "Product name")}
        ${text("line", "What it is, in one line", "Like: a mobile app that books dog walkers")}
        ${Object.keys(PRODUCT_CHOICES).map((k) => chipGroup(k, values, wrong)).join("\n        ")}
      </fieldset>`;
}

// google (sprint 21, 21.4c, the owner's ruling: THE STEP-UP, src/accounts.js accountStepUp): "fresh" — this browser's account session
// was proven by Google less than 10 minutes ago, so the org is created without a passphrase (the email is the session's, shown
// locked); "stale" — proven by Google longer ago: the passphrase field, and Continue with Google again beside it (back to this form);
// "" — the passphrase, as before
export function renderOrgNew(opts) {
  const { error = "", field: wrong = "", values = {}, host = "", google = "" } = opts || {};
  const v = (k) => esc(String(values[k] == null ? "" : values[k]));
  const { wordmark } = frame(DEFAULT_BRAND);
  const body = `<form method="POST" action="/orgs" data-screen="org-new" data-region="create-org">
      <input type="hidden" name="web" value="1">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required${values.email || wrong ? "" : " autofocus"}${google === "fresh" ? " readonly" : ""} value="${v("email")}" data-input-exception="auth">
      </div>
      ${google === "fresh" ? `<p class="hint" data-region="google-step-up">Signed in with Google just now: no passphrase needed.</p>` : `<div class="field">
        <label for="password">Account passphrase</label>
        <input type="password" id="password" name="password" autocomplete="current-password"${google === "stale" ? ' aria-describedby="hint-password"' : " required"}${values.email && !wrong ? " autofocus" : ""} data-input-exception="auth">
        ${google === "stale" ? `<p class="hint" id="hint-password">Or confirm it is you with Google again: your Google sign-in is more than 10 minutes old.</p>
        <div data-region="google-step-up">${googleLink("signin", [["next", "/orgs/new"]])}</div>` : ""}
      </div>`}
      <div class="field">
        <label for="name">Org name</label>
        <input type="text" id="name" name="name" required maxlength="${ORG_NAME_MAX}" autocomplete="organization" value="${v("name")}" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="slug">Address</label>
        <div class="affix"><span class="pre" title="${esc(host)}/">${esc(host)}/</span><input type="text" id="slug" name="slug" required minlength="2" maxlength="${ORG_SLUG_MAX}" autocapitalize="none" spellcheck="false" value="${v("slug")}" data-input-exception="auth"></div>
        <p class="hint">a to z, 0 to 9 and dashes</p>
      </div>
      <div class="field">
        <label for="project">First project <span class="opt">(optional)</span></label>
        <input type="text" id="project" name="project" maxlength="${PROJECT_SLUG_MAX}" autocapitalize="none" spellcheck="false" value="${v("project")}" data-input-exception="auth">
        <p class="hint">Empty: the address</p>
      </div>
      <div class="field">
        <label for="you">Your name <span class="opt">(optional)</span></label>
        <input type="text" id="you" name="you" autocomplete="name" maxlength="${ORG_NAME_MAX}" value="${v("you")}" data-input-exception="auth">
      </div>
      ${productStep(values, wrong)}
      <button type="submit">Create org</button>
    </form>${SLUG_JS}`;
  return authPage({
    title: "Create an org · sharingu",
    wordmark,
    lede: "Create your org",
    // a product step's field says so on itself (21.4b); any other refusal is the banner
    banner: error && !PRODUCT_FIELD_WORDS[wrong] ? errorState({ what: error }) : "",
    body,
    css: PRODUCT_CSS + (google === "stale" ? GOOGLE_CSS : ""),
    intro: { eyebrow: "Your org", heading: "Make it yours.", lede: "One org for your company: its people, its projects and the AI that files into them.",
      art: `<div class="art-pose" data-art="comment">${uchanPose({ pose: "comment", size: 240 })}</div>`, phone: false },
    // a person who typed or was given an email holds an account; only a bare form offers the way in for one who has none
    footnote: values.email ? "" : `No account yet? <a href="${REQUEST_PATH}" data-region="request-access-link">${JOIN_WORDS}</a>`,
  });
}

// the made page (D18): the owner key ONCE (the response body only: no URL, no redirect, no store), folded; Connect your AI first
// (the request's own origin), the org's address and its first project, then Open your org. signedIn: POST /orgs set the session
// (false when the mint found the seat or the passphrase changed meanwhile: the address then asks for a sign-in, as any does)
export function renderOrgMade(opts) {
  const { made = {}, origin = "", signedIn = false } = opts || {};
  const org = made.org || {}, project = made.project || {};
  const { wordmark } = frame({ org: org.name || "" });
  const host = String(origin).replace(/^https?:\/\//, "");
  const at = `/${esc(org.slug || "")}`;
  const body = `<div class="made" data-screen="org-made" data-region="org-made">
      ${connectCards(origin, org.name)}
      <details class="key-fold" data-region="owner-key">
        <summary>Show the owner key</summary>
        <div class="key-body">
          <p class="key-for">For your scripts and API calls. Shown once: copy it now.</p>
          <div class="cc-line"><code data-secret="owner-key">${esc(made.key || "")}</code><button type="button" class="cc-copy" data-copy title="Copy">Copy</button></div>
        </div>
      </details>
      <a class="primary" data-region="open-org" href="${at}">Open your org</a>
      ${signedIn ? "" : `<p class="key-for">Sign in there with your account's passphrase.</p>`}
    </div>${COPY_JS}`;
  return authPage({ title: `${org.name || "Org"} · sharingu`, wordmark, here: signedIn ? "in" : "", lede: "", body, css: CONNECT_CARDS_CSS + MADE_CSS,
    intro: { eyebrow: `${org.name || "Your org"} is ready`, heading: "Connect your AI.",
      ledeHtml: `Your org lives at <a data-region="org-address" href="${at}">${esc(host)}${at}</a>. Connect the AI you use, then open it.`,
      more: `<p class="made-fact" data-region="first-project"><span>First project</span> ${esc(projectWords(project))}</p>`,
      art: `<div class="art-pose" data-art="verify">${uchanPose({ pose: "verify", size: 240 })}</div>`, phone: false } });
}
// the made page's few rules on the front door's tokens: the fold (a quiet summary with its chevron), the key's line, the primary
// across the card, the first project as a quiet fact under the lede
const MADE_CSS = `
  .made{display:flex;flex-direction:column;gap:18px}
  .key-fold{border:1px solid var(--line);border-radius:10px;background:var(--page)}
  .key-fold summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:0 14px;font:600 13.5px/1.3 var(--sans);color:var(--text);
    cursor:pointer;list-style:none;border-radius:10px}
  .key-fold summary::-webkit-details-marker{display:none}
  .key-fold summary::after{content:"";width:7px;height:7px;border-right:1.6px solid var(--text-muted);border-bottom:1.6px solid var(--text-muted);transform:rotate(45deg) translateY(-2px);
    transition:transform var(--dur-fast) var(--ease)}
  .key-fold[open] summary::after{transform:rotate(-135deg) translateY(-2px)}
  .key-fold summary:hover{background:var(--hover)}
  .key-fold summary:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .key-body{display:flex;flex-direction:column;gap:8px;padding:0 14px 14px}
  .key-for{margin:0;font:400 12.5px/1.45 var(--sans);color:var(--text-muted)}
  .key-body code{user-select:all;-webkit-user-select:all}
  .made .primary{width:100%}
  .made-fact{display:flex;gap:8px;margin:22px 0 0;font:500 13px/1.45 var(--mono);color:var(--text)}
  .made-fact span{font:500 12px/1.45 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)}
`;
