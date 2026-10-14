// tools/showcase-selftest.mjs — sprint 21, slice 21.3 (src/showcase.js, src/walkthrough.js, src/login.js frontHead, frontTop, authPage; the
// `/` gate in src/index.js): the showcase and the front door's one shell, through the REAL worker (src/index.js over node:sqlite
// built from boot.sql, tools/fixtures/sqlite-worker.mjs) and the splash's own script run in a sandbox.
//   F1 · GET / at the root, a browser with no session: 200 HTML on the front shell, the hero line and its lede, Request access
//        (-> /request-access) and the walkthrough beside it (#walkthrough, a section of the page), the five videos and the
//        channel as src/walkthrough.js lists them (each target=_blank rel=noopener), the beta's places as betaCount answers them
//        ("N of 50 beta places taken"; past the cap "All 50 beta places taken"); nothing third-party loads (no iframe, no
//        external src, stylesheet or script); a count that cannot be read is left out, the page still 200
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
//        access and its pages, the org picker, the not-here page and the showcase each stand on <body data-shell="front"> with
//        the top bar's wordmark home to `/`; each card page holds ONE card; the request's pages send the walkthrough to the
//        showcase's section (/#walkthrough), and no source names the website's docs list any more; GET /login, /signup,
//        /signup?via=invite, /orgs/new and /request-access answer 200 on the shell
// Exit 1 on any failure.
import { readFileSync, readdirSync } from "node:fs";
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
  ok(/<a class="access" href="\/request-access"[^>]*>Request access<\/a>/.test(h) && /<a class="see" href="#walkthrough">See the walkthrough<\/a>/.test(h) && /<section [^>]*id="walkthrough"/.test(h)
    && /<a class="front-link" href="\/login"[^>]*>Sign in<\/a>/.test(h) && (h.match(/class="access"/g) || []).length === 1,
    "F1 · ONE orange Request access (-> /request-access), the walkthrough beside it (#walkthrough, on this page), Sign in top-right (-> /login)");
  ok(WALKTHROUGH.length === 5 && videos.every((a) => a && /target="_blank"/.test(a) && /rel="noopener"/.test(a)) && WALKTHROUGH.every((v) => /^https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}$/.test(v.url))
    && channel && /target="_blank"/.test(channel) && /rel="noopener"/.test(channel) && WALKTHROUGH_CHANNEL.url === "https://www.youtube.com/@SharinguAIApp"
    && WALKTHROUGH.every((v) => h.includes(`>${v.title}<`)),
    `F1 · the five videos and the channel, as src/walkthrough.js lists them, each a new tab with rel=noopener (${videos.filter(Boolean).length}/5, channel ${!!channel})`);
  ok(c.taken === 4 && h.includes(`data-beta-count>4 of 50 beta places taken<`), `F1 · the beta's places as betaCount answers them (${c.taken} of ${c.cap})`);
  ok(thirdParty(h).length === 0 && !/<script\b[^>]*\bsrc=/.test(h), `F1 · nothing third-party loads: no iframe, no external src, stylesheet or script (${thirdParty(h).join(" ") || "none"})`);
  const real = W.w.env.DB;
  W.w.env.DB = { ...real, prepare: (q) => real.prepare(q), batch: async () => { throw new Error("D1 down for the count"); } };
  const down = await W.call("GET", "/", { nav: true });
  W.w.env.DB = real;
  for (let id = 6; id <= 60; id++) W.w.db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (?, ?, ?, ?, 'free')").run(id, `Org ${id}`, T0, T0);
  const full = await W.call("GET", "/", { nav: true });
  ok(down.status === 200 && !/data-beta-count|places taken/.test(down.text) && down.text.includes(SHOWCASE_LINE.replace(/'/g, "&#39;")) && full.text.includes("data-beta-count>All 50 beta places taken<"),
    `F1 · a count that cannot be read is left out, the page still 200 (${down.status}); past the cap "All 50 beta places taken"`);
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
  const { renderRequestAccess, renderRequestReceived, renderRequestAsked, renderRequestMissing } = await mod("requestpage.js");
  const { renderOrgPicker } = await mod("orgpicker.js");
  const cards = {
    login: renderLogin({}),
    connect: renderLogin({ action: "", lede: "A client asks to connect as you", hidden: [{ name: "oauth_req", value: "e30=" }], submit: "Sign in and connect", footnoteHtml: "<p>It sends you back.</p>" }),
    signup: renderSignup({}), invite: renderInvite({}), orgNew: renderOrgNew({ host: "agent.example.test" }),
    orgMade: renderOrgMade({ origin: "https://agent.example.test", made: { org: { name: "Acme", slug: "acme" }, project: { key: "o3--acme", name: "Acme" }, key: "k" } }),
    requestAccess: renderRequestAccess({}), inLine: renderRequestReceived({ request: { name: "Ada", company: "A", status: "open" }, place: 1, count: { taken: 3, cap: 50 } }),
    asked: renderRequestAsked({ count: { taken: 3, cap: 50 } }), missing: renderRequestMissing({}), picker: renderOrgPicker({ orgs: [{ slug: "acme", name: "Acme", role: "owner" }] }), notHere: renderNotHere(),
  };
  const off = Object.entries({ ...cards, showcase: page }).filter(([, h]) => !(/<body data-shell="front">/.test(h) && /<header class="front-top">[\s\S]*?<a class="front-brand" href="\/">[\s\S]*?class="wordmark"><span class="wm-product">sharingu<\/span>/.test(h))).map(([k]) => k);
  ok(off.length === 0, `F4 · ${Object.keys(cards).length + 1} front pages on the one shell, the wordmark home to / (off it: ${off.join(", ") || "none"})`);
  const notOne = Object.entries(cards).filter(([, h]) => (h.match(/<div class="card /g) || []).length !== 1).map(([k]) => k);
  ok(notOne.length === 0, `F4 · each card page holds ONE card (not one: ${notOne.join(", ") || "none"})`);
  const walk = `href="${WALKTHROUGH_PATH}"`;
  const docsList = readdirSync(join(ENGINE, "src")).filter((f) => f.endsWith(".js") && readFileSync(join(ENGINE, "src", f), "utf8").includes("sharingu.xyz/docs.html#walkthrough"));
  ok(WALKTHROUGH_PATH === "/#walkthrough" && cards.inLine.includes(walk) && cards.asked.includes(walk) && docsList.length === 0,
    `F4 · the request's pages send the walkthrough to the showcase's section (${WALKTHROUGH_PATH}); no source names the website's docs list (${docsList.join(", ") || "none"})`);
  const W = await world();
  const got = await Promise.all(["/login", "/signup", "/signup?via=invite", "/orgs/new", "/request-access"].map(async (p) => [p, await W.call("GET", p, { nav: true })]));
  const bad = got.filter(([, r]) => r.status !== 200 || !/<body data-shell="front">/.test(r.text)).map(([p, r]) => `${p} ${r.status}`);
  ok(bad.length === 0, `F4 · GET /login, /signup, /signup?via=invite, /orgs/new and /request-access: 200 on the shell (${bad.join(", ") || "all"})`);
}

console.log(`${failed ? "✗" : "✓"} showcase selftest: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
