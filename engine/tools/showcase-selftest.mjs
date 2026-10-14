// tools/showcase-selftest.mjs — sprint 21, slice 21.3 (src/showcase.js, src/walkthrough.js, src/login.js frontHead, frontTop, authPage; the
// `/` gate in src/index.js): the showcase and the front door's one shell, through the REAL worker (src/index.js over node:sqlite
// built from boot.sql, tools/fixtures/sqlite-worker.mjs) and the splash's own script run in a sandbox.
//   F1 · GET / at the root, a browser with no session: 200 HTML on the front shell, the hero line and its lede, ONE orange Join the
//        beta (-> /request-access?from=showcase: 21.4b, the source) and the walkthrough beside it (#walkthrough, a section of the page), the five videos and the
//        channel as src/walkthrough.js lists them (each target=_blank rel=noopener), the beta's places as betaCount answers them
//        ("N of 50 places taken"; past the cap "All 50 places taken"); nothing third-party loads (no iframe, no external src,
//        stylesheet or script); a count that cannot be read is left out, the page still 200
//   F2 · the other callers of `/` as before: a script with no credential 401 auth_required, a dead bearer 401 (never the page), a
//        live bearer 302 to its org's Home, a browser session at the root 302 to its org, a signed-out browser under an org's
//        address 302 to the sign-in carrying next
//   F3 · the splash's script, as the page carries it, in a sandbox: a first visit shows it (the flag written), removes it at
//        SPLASH_MS (under 1.5 s) or at once on a key, a pointer or a touch (its listeners gone); a visit after it, a storage that
//        throws, a storage that forgets the flag and prefers-reduced-motion each show nothing (reduced motion writes no flag);
//        the CSS hides the splash under reduced motion and until the script shows it, fades it out by itself, and nods with the
//        website's own uchan-nod keyframes. Both ways: a script without its reduced-motion test, or without its re-read of the
//        flag, goes red
//   F4 · ONE front shell: the sign-in, the connect page, the sign-up and its invite, creating an org and its done page, request
//        access and the account flow's pages (21.4a: check your inbox and paused, verify, a dead link, resend, forgot and its
//        answer, reset; the signed-in status in line, approved and declined), the org picker, the not-here page and the showcase
//        each stand on <body data-shell="front"> with the top bar's wordmark home to `/`; each page one card, or a state's page with
//        U-chan's pose and none; one orange primary a view (exactly one on each of the front door's own); the doors on every page
//        (the website and Sign in in the top bar, none on its own page, Sign out on an account session's pages, no Check my request
//        anywhere: 21.4a; the foot); the request's pages send the walkthrough to the showcase's section (/#walkthrough), and no
//        source names the website's docs list any more; GET /login, /signup, /signup?via=invite, /orgs/new, /request-access,
//        /account/sent, /account/resend and /account/forgot answer 200 on the shell
//   F5 · (21.P B9/B10) the walkthrough in place: the five videos the website's own (its docs.html, when its checkout is on this
//        machine: the same ids, titles, durations, order); each a facade without a script (our poster from /assets/, its badge,
//        title and duration, a plain youtu.be link), no row printing youtu.be; the worker serves the posters and the logos
//        itself (immutable, nosniff; any other path and any under an org's address 404); the player's script in a sandbox: each
//        link a real <button>, nothing made before a press, a press the youtube-nocookie player in place, autoplaying, focused
// Exit 1 on any failure.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker, d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const mod = (f) => import(pathToFileURL(join(ENGINE, "src", f)).href);
const T0 = "2026-10-01T00:00:00.000Z";
const { renderShowcase, SHOWCASE_LINE, SHOWCASE_LEDE, SPLASH_KEY, SPLASH_MS } = await mod("showcase.js");
const { WALKTHROUGH, WALKTHROUGH_CHANNEL, WALKTHROUGH_PATH } = await mod("walkthrough.js");
const { betaCount } = await mod("accounts.js");
const { pbkdf2 } = await mod("util.js");

let passed = 0, failed = 0;
const ok = (cond, label) => { if (cond) passed++; else failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`); };

async function world() {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], people: [["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"]] });
  const call = async (method, path, { key, body, cookie, nav = false, accept } = {}) => {
    const headers = { accept: accept || (nav ? "text/html" : "application/json") };
    if (nav) { headers["sec-fetch-dest"] = "document"; headers["sec-fetch-mode"] = "navigate"; }
    if (key) headers.authorization = "Bearer " + key;
    if (cookie) { headers.cookie = "__Host-ar_session=" + cookie; headers["sec-fetch-site"] = "same-origin"; }
    let payload;
    if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" }));
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, text, json, type: r.headers.get("content-type") || "", location: r.headers.get("location") || "" };
  };
  return { w, call, slug: w.db.prepare("SELECT slug FROM org WHERE id = 1").get().slug };
}
// what loads from elsewhere: an iframe, a src or a stylesheet/script link to another origin
const thirdParty = (html) => [...html.matchAll(/<iframe\b|\bsrc="(?:https?:)?\/\/[^"]*"|<link\b[^>]*\bhref="(?:https?:)?\/\/[^"]*"/gi)].map((m) => m[0]);
const linkOf = (html, url) => (new RegExp(`<a [^>]*href="${url.replace(/[.?*+^$()[\]{}|\\]/g, "\\$&")}"[^>]*>`).exec(html) || [])[0] || "";

// ---- F1 ----
{
  const W = await world();
  for (let id = 2; id <= 5; id++) W.w.db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (?, ?, ?, ?, 'free')").run(id, `Org ${id}`, T0, T0);
  const page = await W.call("GET", "/", { nav: true });
  const c = await betaCount({ DB: d1(W.w.db) });
  const h = page.text;
  const videos = WALKTHROUGH.map((v) => linkOf(h, v.url));
  const channel = linkOf(h, WALKTHROUGH_CHANNEL.url);
  ok(page.status === 200 && /^text\/html/.test(page.type) && /<body data-shell="front">/.test(h) && /data-screen="showcase"/.test(h) && h.includes(SHOWCASE_LINE.replace(/'/g, "&#39;")) && h.includes(SHOWCASE_LEDE),
    `F1 · GET / signed out: 200 HTML on the front shell, the hero line and its lede (${page.status} ${page.type})`);
  ok(/<a class="access" href="\/request-access\?from=showcase"[^>]*>Join the beta<\/a>/.test(h) && /<a class="see" href="#walkthrough">See the walkthrough<\/a>/.test(h) && /<section [^>]*id="walkthrough"/.test(h)
    && /<a class="front-link" href="\/login"[^>]*>Sign in<\/a>/.test(h) && (h.match(/class="access"|class="primary"/g) || []).length === 1,
    "F1 · ONE orange Join the beta (-> /request-access?from=showcase: 21.4b, the source), the walkthrough beside it (#walkthrough, on this page), Sign in top-right (-> /login)");
  ok(WALKTHROUGH.length === 5 && videos.every((a) => a && /target="_blank"/.test(a) && /rel="noopener"/.test(a)) && WALKTHROUGH.every((v) => /^https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}$/.test(v.url))
    && channel && /target="_blank"/.test(channel) && /rel="noopener"/.test(channel) && WALKTHROUGH_CHANNEL.url === "https://www.youtube.com/@SharinguAIApp"
    && WALKTHROUGH.every((v) => h.includes(`>${v.title}<`)),
    `F1 · the five videos and the channel, as src/walkthrough.js lists them, each a new tab with rel=noopener (${videos.filter(Boolean).length}/5, channel ${!!channel})`);
  ok(c.taken === 4 && h.includes(`data-beta-count>4 of 50 places taken<`), `F1 · the beta's places as betaCount answers them, said as every page says them (${c.taken} of ${c.cap})`);
  ok(thirdParty(h).length === 0 && !/<script\b[^>]*\bsrc=/.test(h), `F1 · nothing third-party loads: no iframe, no external src, stylesheet or script (${thirdParty(h).join(" ") || "none"})`);
  const real = W.w.env.DB;
  W.w.env.DB = { ...real, prepare: (q) => real.prepare(q), batch: async () => { throw new Error("D1 down for the count"); } };
  const down = await W.call("GET", "/", { nav: true });
  W.w.env.DB = real;
  for (let id = 6; id <= 60; id++) W.w.db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (?, ?, ?, ?, 'free')").run(id, `Org ${id}`, T0, T0);
  const full = await W.call("GET", "/", { nav: true });
  ok(down.status === 200 && !/data-beta-count|places taken/.test(down.text) && down.text.includes(SHOWCASE_LINE.replace(/'/g, "&#39;")) && full.text.includes("data-beta-count>All 50 places taken<"),
    `F1 · a count that cannot be read is left out, the page still 200 (${down.status}); past the cap "All 50 places taken"`);
}

// ---- F5: the walkthrough in place (21.P B9/B10) ----
{
  const W = await world();
  const h = (await W.call("GET", "/", { nav: true })).text;
  // the website's own list, when its checkout is on this machine: the same ids, titles, durations and order
  const SITE = join(homedir(), "batcave_vm", "sharingu_website", "docs.html");
  const site = existsSync(SITE) ? [...readFileSync(SITE, "utf8").matchAll(/data-youtube="([\w-]{11})"[\s\S]*?<strong class="walk-title">([^<]+)<\/strong><time class="walk-time mono" datetime="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2], m[3], m[4]]) : null;
  const ours = WALKTHROUGH.map((v) => [v.id, v.title, v.duration, v.time]);
  ok(!site || JSON.stringify(site) === JSON.stringify(ours), site ? `F5 · the five videos are the website's (docs.html#walkthrough): the same ids, titles, durations, order (${site.map((x) => x[1]).join(" · ")})` : "F5 · (no website checkout on this machine: its list not compared)");
  const facades = [...h.matchAll(/<a class="walk-play" href="(https:\/\/youtu\.be\/[\w-]{11})"[^>]*data-youtube="([\w-]{11})"[^>]*>([\s\S]*?)<\/a>/g)];
  ok(facades.length === 5 && facades.every((m, i) => m[2] === WALKTHROUGH[i].id && m[1] === WALKTHROUGH[i].url && new RegExp(`<img src="/assets/${WALKTHROUGH[i].poster.replace(/[.]/g, "\\.")}\\?v=[0-9a-f]{10}"`).test(m[3])
    && m[3].includes(`>${WALKTHROUGH[i].title}<`) && m[3].includes(`datetime="${WALKTHROUGH[i].duration}">${WALKTHROUGH[i].time}<`) && m[3].includes(WALKTHROUGH[i].badge)),
    `F5 · each video a facade without a script: our poster, its badge, title and duration, a plain youtu.be link (${facades.length}/5)`);
  ok(!/>youtu\.be</.test(h) && !h.includes("walk-host"), "F5 · no row prints youtu.be");
  const posters = await Promise.all(WALKTHROUGH.map((v) => W.w.fetch(new Request(W.w.origin + `/assets/${v.poster}?v=1`))));
  const logo = await W.w.fetch(new Request(W.w.origin + "/assets/clients/claude.png"));
  const none = await W.w.fetch(new Request(W.w.origin + "/assets/walkthrough/nope.jpg")), under = await W.call("GET", `/${W.slug}/assets/${WALKTHROUGH[0].poster}`);
  ok(posters.every((r) => r.status === 200 && r.headers.get("content-type") === "image/jpeg" && /immutable/.test(r.headers.get("cache-control")) && r.headers.get("x-content-type-options") === "nosniff")
    && logo.status === 200 && logo.headers.get("content-type") === "image/png" && none.status === 404 && under.status === 404,
    `F5 · the worker serves the posters and the logos itself (image/jpeg, image/png, a year immutable, nosniff); any other path 404, and none under an org's address (${posters.map((r) => r.status).join("/")} · ${logo.status} · ${none.status} · ${under.status})`);
  // the player's script in a sandbox: each link becomes a <button>; a press puts the youtube-nocookie player in its place, focused;
  // nothing is made before the press
  const js = (/<script>(\(function\(\)\{var q=document\.querySelectorAll\('#walkthrough a\.walk-play\[data-youtube\]'\)[\s\S]*?)<\/script>/.exec(h) || [])[1] || "";
  const made = [];
  const el = (tag, attrs = {}) => {
    const e = { tagName: tag, attrs: { ...attrs }, kids: [], listeners: {}, parentNode: null, className: attrs.class || "", focused: false,
      getAttribute: (k) => e.attrs[k] ?? null, setAttribute: (k, v) => { e.attrs[k] = String(v); },
      querySelector: (sel) => ({ ".walk-badge": { textContent: " B " }, ".walk-title": { textContent: "T" }, ".walk-time": { textContent: "1:00" } })[sel] || null,
      appendChild: (k) => { if (k.from) k.from.kids = k.from.kids.filter((x) => x !== k); k.from = e; e.kids.push(k); }, get firstChild() { return e.kids[0] || null; },
      replaceChild: (n, o) => { n.parentNode = e; o.parentNode = null; e.slot = n; }, addEventListener: (t, f) => { e.listeners[t] = f; }, focus: () => { e.focused = true; } };
    return e;
  };
  const frame = el("div");
  const links = WALKTHROUGH.map((v) => { const a = el("a", { "data-youtube": v.id, "data-video": "1", class: "walk-play" }); a.kids = [{ from: a }]; a.parentNode = frame; return a; });
  let thrown = "";
  try { vm.runInNewContext(js, { document: { querySelectorAll: () => links, createElement: (t) => { const e = el(t); made.push(e); return e; } } }); } catch (e) { thrown = String(e.message); }
  const buttons = made.filter((e) => e.tagName === "button");
  const before = made.filter((e) => e.tagName === "iframe").length;
  frame.slot = null; buttons[0]?.parentNode && (frame.slot = buttons[0]);
  buttons[0]?.listeners.click?.();
  const iframe = made.find((e) => e.tagName === "iframe");
  ok(js && !thrown && buttons.length === 5 && buttons.every((b) => b.type === "button" && /^Play B, T \(1:00\)$/.test(b.attrs["aria-label"])) && before === 0,
    `F5 · with the script each poster is a real <button> (${buttons.length}), labelled Play <badge>, <title> (<time>); no player made before a press (${before})${thrown ? ` threw ${thrown}` : ""}`);
  ok(iframe && iframe.src === `https://www.youtube-nocookie.com/embed/${WALKTHROUGH[0].id}?autoplay=1&rel=0` && iframe.focused && iframe.allowFullscreen === true && iframe.referrerPolicy === "strict-origin-when-cross-origin" && frame.slot === iframe,
    `F5 · a press swaps the button for the youtube-nocookie player in place, autoplaying, focused (${iframe ? iframe.src : "none"})`);
}

// ---- F2 ----
{
  const W = await world();
  const script = await W.call("GET", "/");
  const scriptHtml = await W.call("GET", "/", { accept: "*/*" });
  const dead = await W.call("GET", "/", { nav: true, key: "0".repeat(40) });
  const bearer = await W.call("GET", "/", { key: "one-owner-key" });
  // a seat's own passphrase (as an admin sets one), then a sign-in at the root: its session
  const SALT = "00112233445566778899aabbccddeeff";
  W.w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = 'one-owner'").run(await pbkdf2("showcase-seat-pass", SALT), SALT);
  const s = await W.call("POST", "/login", { body: { email: "owner@one.test", password: "showcase-seat-pass", device: "showcase-selftest" } });
  const tok = s.json && s.json.token;
  const session = tok ? await W.call("GET", "/", { nav: true, cookie: tok }) : {};
  const under = await W.call("GET", `/${W.slug}`, { nav: true });
  ok(script.status === 401 && script.json && script.json.error === "auth_required" && scriptHtml.status === 401 && dead.status === 401 && !/data-screen="showcase"/.test(dead.text),
    `F2 · a script with no credential 401 auth_required (${script.status}, Accept */* ${scriptHtml.status}); a dead bearer 401, never the page (${dead.status})`);
  ok(bearer.status === 302 && bearer.location === `/${W.slug}/home`, `F2 · a live bearer at the root: 302 to its org's Home (${bearer.status} ${bearer.location})`);
  ok(tok && session.status === 302 && session.location === `/${W.slug}`, `F2 · a browser session at the root: 302 to its org (${session.status} ${session.location})`);
  ok(under.status === 302 && under.location === `/login?next=${encodeURIComponent(`/${W.slug}`)}`, `F2 · signed out under an org's address: the sign-in with next (${under.status} ${under.location})`);
}

// ---- F3: the splash ----
const page = renderShowcase({ count: { taken: 16, cap: 50 } });
const SPLASH_SRC = (/<div class="splash" id="splash" hidden aria-hidden="true">[\s\S]*?<\/div>\s*<script>([\s\S]*?)<\/script>/.exec(page) || [])[1] || "";
// splash(src, { reduced, store }) -> what the script did in a sandbox: shown, the flag, its timer, its listeners, and two moves
// (fire an event; fire the timer) each answering whether the overlay left the page
function splash(src, { reduced = false, store = "empty" } = {}) {
  const m = new Map(store === "seen" ? [[SPLASH_KEY, "1"]] : []);
  const storage = store === "throws" ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
    : store === "forgets" ? { getItem: () => null, setItem: () => {} }
    : { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
  const el = { hidden: true, parentNode: null };
  el.parentNode = { removeChild: (n) => { if (n === el) el.parentNode = null; } };
  const listeners = new Map(), timers = [];
  const ctx = {
    document: { getElementById: (id) => (id === "splash" ? el : null) },
    matchMedia: (q) => ({ matches: reduced && /prefers-reduced-motion:\s*reduce/.test(q) }),
    localStorage: storage,
    addEventListener: (e, f) => listeners.set(e, f), removeEventListener: (e, f) => { if (listeners.get(e) === f) listeners.delete(e); },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {},
  };
  try { vm.runInNewContext(src, ctx); } catch (e) { return { error: String(e && e.message) }; }
  return { shown: el.hidden === false, flag: m.get(SPLASH_KEY) || null, timer: timers[0] ? timers[0].ms : null, events: [...listeners.keys()].sort().join(),
    fire: (e) => { listeners.get(e)?.({}); return { gone: el.parentNode === null, left: listeners.size }; },
    tick: () => { timers[0]?.f(); return { gone: el.parentNode === null, left: listeners.size }; } };
}
// the splash's rules: [ok, label] for each, on one script
function splashRules(src) {
  const first = splash(src), key = splash(src).fire?.("keydown"), tap = splash(src).fire?.("touchstart"), point = splash(src).fire?.("pointerdown"), end = splash(src).tick?.();
  const seen = splash(src, { store: "seen" }), throws = splash(src, { store: "throws" }), forgets = splash(src, { store: "forgets" }), reduced = splash(src, { reduced: true });
  return [
    [first.shown && first.flag === "1" && first.timer === SPLASH_MS && SPLASH_MS <= 1500 && first.events === "keydown,pointerdown,touchstart",
      `F3 · a first visit: the splash shows, the flag written, its end at ${first.timer} ms (under 1.5 s), skipped by a key, a pointer or a touch (${first.events})`],
    [key && key.gone && key.left === 0 && tap && tap.gone && point && point.gone && end && end.gone && end.left === 0, "F3 · a key, a tap or a click removes it at once, its end removes it too, every listener gone"],
    [seen.shown === false && !seen.events && seen.timer === null, "F3 · a visit after the first: no splash, no listener, no timer"],
    [throws.shown === false && forgets.shown === false && !throws.events && !forgets.events, "F3 · a storage that throws, or forgets the flag: no splash (never one each visit, never a stuck overlay)"],
    [reduced.shown === false && reduced.flag === null && !reduced.events, "F3 · prefers-reduced-motion: no splash, and no flag written (it shows on a later visit with motion on)"],
  ];
}
ok(!!SPLASH_SRC, "F3 · the page carries the splash's markup, hidden, and its one script right after it");
for (const [c, label] of splashRules(SPLASH_SRC)) ok(c, label);
ok(page.includes("@media (prefers-reduced-motion:reduce){.splash{display:none}}") && page.includes(".splash[hidden]{display:none}") && page.includes("@keyframes splash-out{to{opacity:0;visibility:hidden}}")
  && page.includes("@keyframes uchan-nod{0%,100%{rotate:0deg}45%{rotate:2deg}70%{rotate:-1deg}}") && page.indexOf('id="splash"') < page.indexOf('data-screen="showcase"'),
  "F3 · the CSS: hidden under reduced motion and until shown, a fade that ends invisible by itself, the website's uchan-nod; the page's content follows in the HTML");
const MUTANTS = [
  ["the reduced-motion test dropped", (s) => s.replace("matchMedia('(prefers-reduced-motion: reduce)').matches||", ""), "prefers-reduced-motion"],
  ["the flag's re-read dropped (a storage that forgets would splash every visit)", (s) => s.replace("if(localStorage.getItem(K)!=='1')return;", ""), "forgets the flag"],
];
for (const [name, mut, red] of MUTANTS) {
  const src = mut(SPLASH_SRC);
  ok(src !== SPLASH_SRC && splashRules(src).some(([c, label]) => !c && label.includes(red)), `F3 · both ways: ${name} goes red`);
}

// ---- F4: one front shell ----
{
  const { renderLogin, renderNotHere } = await mod("login.js");
  const { renderSignup, renderInvite } = await mod("signup.js");
  const { renderOrgNew, renderOrgMade } = await mod("orgpage.js");
  const { renderRequestAccess } = await mod("requestpage.js");
  const A = await mod("accountpage.js");
  const { renderOrgPicker } = await mod("orgpicker.js");
  const cards = {
    login: renderLogin({}),
    connect: renderLogin({ action: "", lede: "A client asks to connect as you", hidden: [{ name: "oauth_req", value: "e30=" }], submit: "Sign in and connect", footnoteHtml: "<p>It sends you back.</p>" }),
    signup: renderSignup({}), invite: renderInvite({}), orgNew: renderOrgNew({ host: "agent.example.test" }),
    orgMade: renderOrgMade({ origin: "https://agent.example.test", made: { org: { name: "Acme", slug: "acme" }, project: { key: "o3--acme", name: "Acme" }, key: "k" } }),
    requestAccess: renderRequestAccess({}), inLine: A.renderAccountStatus({ request: { name: "Ada", company: "A", status: "open" }, place: 1, count: { taken: 3, cap: 50 } }),
    sent: A.renderSent({}), paused: A.renderSent({ paused: true }), verify: A.renderVerify({ token: "ab".repeat(24), email: "ada@x.test" }), linkDead: A.renderLinkDead({}),
    resend: A.renderResend({}), forgot: A.renderForgot({}), forgotSent: A.renderForgotSent({}), reset: A.renderReset({ token: "ab".repeat(24) }), resetDead: A.renderLinkDead({ kind: "reset" }),
    approved: A.renderAccountStatus({ request: { name: "Ada", company: "A", status: "approved" } }), declined: A.renderAccountStatus({ request: { status: "declined" } }), picker: renderOrgPicker({ orgs: [{ slug: "acme", name: "Acme", role: "owner" }] }), notHere: renderNotHere(),
  };
  const off = Object.entries({ ...cards, showcase: page }).filter(([, h]) => !(/<body data-shell="front">/.test(h) && /<header class="front-top">[\s\S]*?<a class="front-brand" href="\/">[\s\S]*?class="wordmark"><span class="wm-product">sharingu<\/span>/.test(h))).map(([k]) => k);
  ok(off.length === 0, `F4 · ${Object.keys(cards).length + 1} front pages on the one shell, the wordmark home to / (off it: ${off.join(", ") || "none"})`);
  // the three compositions (21.P): a state's page (solo: U-chan's pose, no card) or one card, never two
  const solo = ["sent", "paused", "linkDead", "forgotSent", "resetDead", "notHere", "approved", "declined"];
  const badCards = Object.entries(cards).filter(([k, h]) => (h.match(/<div class="card /g) || []).length !== (solo.includes(k) ? 0 : 1) || (solo.includes(k) && !/<svg class="u-uchan u-pose /.test(h))).map(([k]) => k);
  ok(badCards.length === 0, `F4 · each page one card, or a state's page with U-chan's pose and none (off: ${badCards.join(", ") || "none"})`);
  // ONE accent a view: at most one orange primary on any front page, exactly one on each of the front door's own
  const PRIMARY = /class="primary"|class="access"|<button type="submit"|class="done-action"/g;
  const nPrimary = (h) => (h.match(PRIMARY) || []).length;
  const mine = ["login", "connect", "signup", "invite", "requestAccess", "sent", "paused", "verify", "linkDead", "resend", "forgot", "forgotSent", "reset", "resetDead", "notHere", "approved", "declined"];
  const accents = Object.entries({ ...cards, showcase: page }).filter(([k, h]) => nPrimary(h) > 1 || (mine.includes(k) && nPrimary(h) !== 1)).map(([k, h]) => `${k} ${nPrimary(h)}`);
  ok(accents.length === 0 && /form button\[type="submit"\],\.done-action\{[^}]*background:var\(--accent\)/.test(cards.login), `F4 · one orange primary a view (off: ${accents.join(", ") || "none"}); the forms' submit is the orange one`);
  // the doors (21.P F24; 21.4a: ONE door, Sign in — a request is checked by signing in): every front page's top bar has the website
  // and Sign in (none on its own page), an account session's own pages Sign out in its place; no Check my request anywhere
  const signedIn = ["inLine", "approved", "declined"];
  const doors = Object.entries({ ...cards, showcase: page }).filter(([k, h]) => {
    const bar = (/<header class="front-top">[\s\S]*?<\/header>/.exec(h) || [""])[0];
    const site = /<a class="front-site" href="https:\/\/www\.sharingu\.xyz\/"/.test(bar), sign = /href="\/login"[^>]*>Sign in</.test(bar), out = /href="\/logout"[^>]*>Sign out</.test(bar);
    return !(site && sign === !["login", "connect", ...signedIn].includes(k) && out === signedIn.includes(k) && !/Check my request|request-access\/check/.test(h) && /<footer class="front-foot">/.test(h));
  }).map(([k]) => k);
  ok(doors.length === 0, `F4 · the doors on every front page: the website and Sign in in the top bar (none on its own page; Sign out on an account session's pages), no Check my request, the foot (off: ${doors.join(", ") || "none"})`);
  const walk = `href="${WALKTHROUGH_PATH}"`;
  const docsList = readdirSync(join(ENGINE, "src")).filter((f) => f.endsWith(".js") && readFileSync(join(ENGINE, "src", f), "utf8").includes("sharingu.xyz/docs.html#walkthrough"));
  ok(WALKTHROUGH_PATH === "/#walkthrough" && cards.inLine.includes(walk) && cards.sent.includes(walk) && docsList.length === 0,
    `F4 · the request's pages send the walkthrough to the showcase's section (${WALKTHROUGH_PATH}); no source names the website's docs list (${docsList.join(", ") || "none"})`);
  const W = await world();
  const PAGES = ["/login", "/signup", "/signup?via=invite", "/orgs/new", "/request-access", "/account/sent", "/account/resend", "/account/forgot"];
  const got = await Promise.all(PAGES.map(async (p) => [p, await W.call("GET", p, { nav: true })]));
  const bad = got.filter(([, r]) => r.status !== 200 || !/<body data-shell="front">/.test(r.text)).map(([p, r]) => `${p} ${r.status}`);
  ok(bad.length === 0, `F4 · GET ${PAGES.join(", ")}: 200 on the shell (${bad.join(", ") || "all"})`);
}

// F6 · the connect page's head (21.P): a known client's logo only when the code goes back to that client's own host; a name
// alone is anyone's claim, so another host gets a plain tile and the name in quotes as the app's own words
{
  const { connectHead } = await import(pathToFileURL(join(ENGINE, "src", "oauth.js")).href);
  const real = connectHead("Claude", "claude.ai"), fake = connectHead("Claude", "attacker.example"), gpt = connectHead("ChatGPT", "chatgpt.com:443"), cli = connectHead("Claude Code", "127.0.0.1:33418");
  ok(/data-client-logo="clients\/claude.png"/.test(real.head) && real.lede === "Connect Claude to sharingu" && real.sub === ""
    && !/data-client-logo/.test(fake.head) && fake.lede === "Connect “Claude” to sharingu" && /calls itself “Claude”: that name is its own claim/.test(fake.sub)
    && /clients\/chatgpt.png/.test(gpt.head) && !/data-client-logo/.test(cli.head),
    `F6 · the client's logo only on its own host (claude.ai yes, attacker.example no, chatgpt.com yes, a loopback no) -> ${fake.lede} | ${fake.sub}`);
}

console.log(`${failed ? "✗" : "✓"} showcase selftest: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
