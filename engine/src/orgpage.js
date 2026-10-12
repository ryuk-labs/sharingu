// src/orgpage.js — the create-an-org pages (sprint 7, slice 7.3; docs/plan/PLATFORM.md §2 item 9): GET /orgs/new (the form:
// your account's email and passphrase, the org's name, its address, its first project and your name) and the page POST /orgs
// answers when the org is made (its owner key, shown ONCE, and how to reach the org). The same front door as the sign-in and
// the sign-up (src/login.js authPage: one card, both worlds, the one accent), never a second skin. No statement here: the
// creation is src/orgs.js createOrg, the routes src/index.js.
//
// renderOrgNew({ error, values, host }) · renderOrgMade({ made, origin }) -> the pages. `values` re-fills what was typed
// (never the passphrase); `host` is the address the org's path will hang off (the request's own: nothing per deployment here).
import { esc, errorState } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { authPage, authBrand } from "./login.js";
import { ORG_SLUG_MAX } from "./orgnames.js";
import { ORG_NAME_MAX, PROJECT_SLUG_MAX } from "./orgs.js";
import { projectSlug } from "./project.js";
// the first project as a person reads it: its name and the slug its AI names it by, never the org-prefixed key (12.6)
const projectWords = (p) => { const slug = projectSlug(String((p && p.key) || "")); const name = String((p && p.name) || ""); return name && slug && name !== slug ? `${name} (${slug})` : name || slug; };

// the page belongs to the platform, not to an org: the product's own wordmark (the org's name rides the made page)
const frame = (brand) => authBrand(brand || DEFAULT_BRAND);

export function renderOrgNew(opts) {
  const { error = "", values = {}, host = "" } = opts || {};
  const v = (k) => esc(String(values[k] == null ? "" : values[k]));
  const { wordmark } = frame(DEFAULT_BRAND);
  const body = `<form method="POST" action="/orgs" data-screen="org-new" data-region="create-org">
      <input type="hidden" name="web" value="1">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" autocomplete="email" required autofocus value="${v("email")}" data-input-exception="auth">
      </div>
      <div class="field">
        <label for="password">Account passphrase</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required data-input-exception="auth">
      </div>
      <div class="field">
        <label for="name">Org name</label>
        <input type="text" id="name" name="name" required maxlength="${ORG_NAME_MAX}" value="${v("name")}" data-input-exception="auth">
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
      <button type="submit">Create org</button>
    </form>`;
  return authPage({
    title: "Create an org · sharingu",
    wordmark,
    lede: "Create your org",
    banner: error ? errorState({ what: error }) : "",
    body,
    footnote: `No account yet? <a href="/signup">Sign up</a> with the code you were given.`,
  });
}

// the made page: the owner key ONCE (the response body only: no URL, no redirect, no store), the org's address (its pages, sprint 7,
// 7.4) and its AI's one door
export function renderOrgMade(opts) {
  const { made = {}, origin = "" } = opts || {};
  const org = made.org || {}, project = made.project || {};
  const { wordmark } = frame({ org: org.name || "" });
  const host = String(origin).replace(/^https?:\/\//, "");
  const body = `<div class="done" data-screen="org-made" data-region="org-made">
      <p class="done-what">${esc(org.name || "Your org")} is ready.</p>
      <div class="facts">
        <div class="fact"><span class="fact-k">Your owner key, shown once: copy it now</span><code class="secret" data-secret="owner-key">${esc(made.key || "")}</code></div>
        <div class="fact"><span class="fact-k">Connect your AI now</span><span class="fact-v">${esc(origin)}/mcp with the key as its bearer</span></div>
        <div class="fact"><span class="fact-k">Its address: its pages, for you and its members</span><a class="fact-v" data-region="org-address" href="/${esc(org.slug || "")}">${esc(host)}/${esc(org.slug || "")}</a></div>
        <div class="fact"><span class="fact-k">Its first project</span><span class="fact-v" data-region="first-project">${esc(projectWords(project))}</span></div>
      </div>
      <p class="done-why">Open its address signed in with your account's passphrase; the key is your owner seat's own secret, for your AI and your scripts. Lost, it cannot be shown again.</p>
    </div>`;
  return authPage({ title: `${org.name || "Org"} · sharingu`, wordmark, lede: "Your org is made", body });
}
