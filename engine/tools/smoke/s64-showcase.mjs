// tools/smoke/s64-showcase.mjs — sprint 21, slice 21.3 (src/showcase.js, src/walkthrough.js, src/login.js frontHead, frontTop, authPage; the
// `/` gate in src/index.js), on the real local worker at the platform's root. Self-contained: it signs org 1's owner in with its
// own key (as s41 does) and registers its own OAuth client (as s43 does).
//   · signed out, a browser at `/`: 200 HTML on the front shell, the hero line, Request access -> /request-access, the walkthrough
//     on the same page, the five videos and the channel (each https://youtu.be/… or the channel, target=_blank, rel noopener),
//     the beta's places equal to the count at the head of `operator requests`; no iframe, nothing third-party loads
//   · the other callers of `/` unchanged: a signed-in browser is sent to its org (302), a script with no session 401
//   · the splash: hidden in the markup until its script shows it, the first-visit flag in this browser's storage, off under
//     prefers-reduced-motion (the CSS rule and the script's own test)
//   · the front shell: /login, /signup, /request-access and the OAuth connect page each 200 on <body data-shell="front">
import { randomBytes, createHash } from "node:crypto";
import { smoke, expect, http as http0, ownerKey, orgSlug, betaLine, BASE } from "./lib.mjs";
import { esc } from "../../src/ui.js";
import { SHOWCASE_LINE, SPLASH_KEY } from "../../src/showcase.js";
import { WALKTHROUGH, WALKTHROUGH_CHANNEL } from "../../src/walkthrough.js";

// a request refused by the address's flood filter (LOGIN_LIMIT: shared with /login and /signup) is sent again ONCE after its
// window: that refusal proves nothing about the door behind it
const http = async (method, path, o) => {
  let r = await http0(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many attempts/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http0(method, path, o); }
  return r;
};
const NAV = { accept: "text/html", nav: true, root: true };   // a page navigation at the root (src/util.js isBrowserNavigation)
const SHELL = /<body data-shell="front">/;
const linkTo = (html, url) => (new RegExp(`<a [^>]*href="${url.replace(/[.?*+^$()[\]{}|\\]/g, "\\$&")}"[^>]*>`).exec(html) || [])[0] || "";
const S = {};

smoke("showcase · signed out, a browser at /: the hero line, Request access, the walkthrough's five videos and the channel (new tabs, noopener), the beta's places as the operator counts them; nothing third-party", async () => {
  const r = await http("GET", "/", NAV);
  const h = r.raw;
  expect(r.status === 200 && SHELL.test(h) && /data-screen="showcase"/.test(h) && h.includes(esc(SHOWCASE_LINE)), () => `GET /: ${r.status} ${r.locationRaw || h.slice(0, 200)}`);
  expect(/<a class="access" href="\/request-access"[^>]*>Request access<\/a>/.test(h) && /href="#walkthrough"/.test(h) && /<section [^>]*id="walkthrough"/.test(h),
    "Request access -> /request-access and the walkthrough's section on the page");
  const links = [...WALKTHROUGH.map((v) => v.url), WALKTHROUGH_CHANNEL.url].map((u) => [u, linkTo(h, u)]);
  const bad = links.filter(([u, a]) => !a || !/target="_blank"/.test(a) || !/rel="noopener"/.test(a) || !/^https:\/\/(youtu\.be\/[A-Za-z0-9_-]{11}|www\.youtube\.com\/@SharinguAIApp)$/.test(u));
  expect(WALKTHROUGH.length === 5 && !bad.length, () => `the walkthrough's links: ${bad.map(([u, a]) => `${u} ${a || "absent"}`).join("; ")}`);
  const l = await betaLine();
  const want = l.taken >= l.cap ? `All ${l.cap} beta places taken` : `${l.taken} of ${l.cap} beta places taken`;
  const got = (/data-beta-count>([^<]+)</.exec(h) || [])[1] || "";
  expect(got === want, () => `the count: the page "${got}", the operator's "${want}"`);
  const third = [...h.matchAll(/<iframe\b|\bsrc="(?:https?:)?\/\/[^"]*"|<link\b[^>]*\bhref="(?:https?:)?\/\/[^"]*"/gi)].map((m) => m[0]);
  expect(!third.length, () => `third-party loads: ${third.join(" ")}`);
  S.page = h;
  return `200 on the front shell; ${links.length} links (${WALKTHROUGH.length} videos + the channel), each a new tab with noopener; "${got}" as the operator counts; no iframe, no third-party src`;
});

smoke("showcase · the other callers of / unchanged: a signed-in browser goes to its org, a script with no session 401", async () => {
  const me = (await http("GET", "/whoami", { key: ownerKey })).json || {};
  const s = await http("POST", "/login", { body: { email: me.email, password: ownerKey, device: "smoke-s64" } });
  const tok = s.json && s.json.token;
  expect(s.status === 200 && tok, () => `org 1's owner signs in: ${s.status} ${s.text.slice(0, 200)}`);
  const signedIn = await http("GET", "/", { ...NAV, cookie: tok });
  const script = await http("GET", "/", { root: true });
  expect(signedIn.status === 302 && signedIn.locationRaw === `/${orgSlug(1)}`, () => `signed in: ${signedIn.status} ${signedIn.locationRaw}`);
  expect(script.status === 401 && script.json && script.json.error === "auth_required" && !/data-screen="showcase"/.test(script.raw), () => `a script: ${script.status} ${script.raw.slice(0, 200)}`);
  return `signed in -> ${signedIn.locationRaw}; a script 401 ${script.json.error}`;
});

smoke("showcase · the splash: hidden until its script shows it, the first-visit flag in this browser's storage, off under reduced motion", async () => {
  expect(S.page, "the signed-out case did not run");
  const h = S.page;
  const js = (/<div class="splash" id="splash" hidden aria-hidden="true">[\s\S]*?<\/div>\s*<script>([\s\S]*?)<\/script>/.exec(h) || [])[1] || "";
  expect(js && js.includes(`K='${SPLASH_KEY}'`) && /localStorage\.getItem\(K\)/.test(js) && /localStorage\.setItem\(K,'1'\)/.test(js) && /\btry\{/.test(js)
    && js.includes("matchMedia('(prefers-reduced-motion: reduce)').matches"), () => `the splash's script: ${js.slice(0, 200) || "absent"}`);
  expect(h.includes("@media (prefers-reduced-motion:reduce){.splash{display:none}}") && h.includes(".splash[hidden]{display:none}") && h.indexOf('id="splash"') < h.indexOf('data-screen="showcase"'),
    "the splash's CSS: none under reduced motion, none until shown; the page follows it in the HTML");
  return `hidden in the markup, the flag ${SPLASH_KEY} (read in a try), the reduced-motion rule in the CSS and the script`;
});

smoke("showcase · the front shell: /login, /signup, /request-access and the OAuth connect page each 200 on it", async () => {
  const pages = await Promise.all(["/login", "/signup", "/request-access"].map(async (p) => [p, await http("GET", p, NAV)]));
  const redirect = "http://127.0.0.1:9/cb";
  const reg = await (await fetch(BASE + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "smoke-showcase", redirect_uris: [redirect], token_endpoint_auth_method: "none" }) })).json();
  const verifier = randomBytes(32).toString("base64url");
  const qs = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, scope: "mcp:read", state: "s", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const c = await fetch(`${BASE}/oauth/authorize?${qs}`, { headers: { accept: "text/html" } });
  const connect = { status: c.status, raw: await c.text() };
  const off = [...pages, ["the connect page", connect]].filter(([, r]) => r.status !== 200 || !SHELL.test(r.raw)).map(([p, r]) => `${p} ${r.status}`);
  expect(!off.length && /name="oauth_req"/.test(connect.raw), () => `off the shell: ${off.join(", ") || "the connect page carries no request"}`);
  return `${pages.length + 1} pages on <body data-shell="front">`;
});
