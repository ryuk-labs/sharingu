// tools/shots.mjs — screenshots of the local app, both worlds, desktop and phone (the look pass, sprint 2).
//
//   node tools/shots.mjs [--base http://127.0.0.1:8895] [--out .runs/shots] [--pages home,decisions,home-menu] [--themes paper,ink]
//                        [--widths 1440,390] [--full] [--project sharingu|all] [--creds <file>] [--find <word>] [--cookie [--email <e>]] [--height <px>]
//   A page row may press keys, type, click and wait before its shot (how.steps), seed the page's storage first (how.before),
//   slow every animation to catch it mid-way (how.rate + how.settle), set the window's height (how.height) or put a specimen
//   of the shared parts in the content (how.inject).
//
// Drives the pinned headless Chrome for Testing (~/.sharingu/chrome-for-testing.app, never the owner's own Chrome) over
// the DevTools protocol with Node's built-in WebSocket: no dependency. Each shot emulates the system theme the app
// follows (prefers-color-scheme: light is Paper, dark is Ink) and saves <out>/<page>-<paper|ink>-<width>.png. --full
// captures the whole page (capped at 4000px tall); the default is the first screen, what a person sees on arrival.
//
// The owner key is read from the local org's credentials file (engine/.runs/r-local/dev-local/credentials.env, the
// *_AGENT_R_OWNER_KEY line) and rides every request as a bearer header (a key in a URL signs no one in: G2 M2). It is NEVER
// printed: the log names each page by its path only. Nothing here reaches Cloudflare; the base must be a loopback address.
//
// --cookie: a REAL signed-in user instead (BETA.md: "a screenshot is not a signed-in user"). The browser opens /login,
// types the owner's email (--email, else the one /whoami answers) and the key into the app's own form and submits it;
// the app's POST /login answers its session cookie (__Host-ar_session: Secure, HttpOnly, SameSite=Lax), and every keyed
// page then rides that cookie alone: no bearer header. A __Host- cookie needs a secure context; Chrome counts
// http://127.0.0.1 and http://localhost as one, so the plain-http local app keeps it (checked after the sign-in: no
// cookie is a stop, exit 2, never a silent bearer). The pages shot signed out (login, holes-public, the signup and create-an-org ones) open in a fresh
// browser context with no cookie. (The tool's own lookups before the shots, an open question, a filing, a goal, still ask
// the JSON routes with the key from node: they pick what to shoot and are never shot.)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const BASE = arg("base", "http://127.0.0.1:8895").replace(/\/+$/, "");
const OUT = join(ENGINE, arg("out", ".runs/shots"));
const PROJECT = arg("project", "sharingu");
const THEMES = arg("themes", "paper,ink").split(",");
const WIDTHS = arg("widths", "1440,390").split(",").map(Number);
const FULL = flag("full");
// --scale <n>: the device scale factor (1 by default; L4's close-ups of the small figures at 1 and 2)
const SCALE = Math.max(1, Math.min(3, Number(arg("scale", "1")) || 1));
// --height <px>: the window's height for every shot (default 960 desktop, 844 phone; a row's how.height wins). Sprint 11, 11.2:
// the listing's Plan shot at a height that leaves the Admin card (the worker's own origin as the MCP address) above the window
const HEIGHT = Number(arg("height", "0")) || 0;
const COOKIE = flag("cookie");
const CHROME = join(homedir(), ".sharingu/chrome-for-testing.app/Contents/MacOS/Google Chrome for Testing");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) { console.error("shots: the base must be the local app (http://127.0.0.1:<port>)"); process.exit(2); }
if (!existsSync(CHROME)) { console.error(`shots: no pinned Chrome for Testing at ${CHROME}`); process.exit(2); }

// --cookie with SHOTS_ACCOUNT="<email> <passphrase>" in the environment (sprint 7, 7.4b): the sign-in proves an ACCOUNT's own
// passphrase (an account session); an account in several orgs lands on the org picker, and the keyed pages then open under
// --org <slug> (else the picker's first org). --brand-org <slug> adds the sign-in a signed-out visit to that org is sent to.
// the owner key: read, never logged
// --creds <file>: another local org's credentials (the parked org on 8870: .runs/r-local/parked-local/credentials.env)
const credFile = join(ENGINE, arg("creds", ".runs/r-local/dev-local/credentials.env"));
const KEY = existsSync(credFile) ? ((/^[A-Z0-9_]*_AGENT_R_OWNER_KEY=["']?([^"'\n]+)/m.exec(readFileSync(credFile, "utf8")) || [])[1] || "") : "";
if (!KEY) { console.error("shots: no owner key in .runs/r-local/dev-local/credentials.env (run sh tools/dev-local.sh up)"); process.exit(2); }

// an open question for the question page: the first open row the Decisions JSON lists
async function openQid() {
  try {
    const r = await fetch(`${BASE}/decisions?project=${encodeURIComponent(PROJECT)}&status=open`, { headers: { authorization: `Bearer ${KEY}`, accept: "application/json" } });
    const j = await r.json();
    return ((j.rows || []).find((x) => x.status === "open") || (j.rows || [])[0] || {}).qid || "";
  } catch { return ""; }
}
// --qid <qid> names the question page's question (a ruled one with its source, say); --goal <id> the goal page's goal;
// --period <quarter|month|all> the Goals and goal pages' period (the one-pass fix: a ruling's source and a goal's status shots)
const qid = arg("qid", "") || await openQid();
const PERIOD = ["quarter", "month", "all"].includes(arg("period", "")) ? arg("period", "") : "";
// the Map's flow shot plays the flow with the most steps (a flow of no step shows nothing)
const MAP_LONGEST_FLOW = `(function(){var n=function(b){var m=/(\\d+) steps?/.exec(b.textContent);return m?+m[1]:0;};
  var bs=[].slice.call(document.querySelectorAll('[data-button="flow-pick"]')).sort(function(a,b){return n(b)-n(a);});if(bs[0])bs[0].click();})()`;
// the Screens view's shots: the board focused (its keys zoom about the middle), and the frame nearest the middle of the view
const AX_FOCUS = { js: "(function(){var s=document.getElementById('ax-stage');if(s)s.focus();})()" };
const AX_MID_FRAME = "#ax-world .ax-f.ax-mid-pick";
const AX_PICK = "(function(){var s=document.getElementById('ax-stage');if(!s)return;var r=s.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,b=null,bd=1e9;[].forEach.call(document.querySelectorAll('#ax-world .ax-f'),function(f){var q=f.getBoundingClientRect(),d=Math.hypot(q.left+q.width/2-cx,q.top+q.height/2-cy);if(d<bd){bd=d;b=f;}});if(b)b.classList.add('ax-mid-pick');})()";
// a filing for the filing page: the first row the Build JSON lists
const txid = await fetch(`${BASE}/build?project=${encodeURIComponent(PROJECT)}`, { headers: { authorization: `Bearer ${KEY}`, accept: "application/json" } })
  .then((r) => r.json()).then((j) => ((j.rows || [])[0] || {}).id || "").catch(() => "");
// M1, M5: the person's folds are kept in the browser, which a run's shots share: a fold's shot starts from none
const FOLD_CLEAN = "try{Object.keys(localStorage).forEach(function(k){if(k.indexOf('sharingu-fold:')===0)localStorage.removeItem(k)})}catch(e){}";
// the create-an-org form filled and sent (the shots of 7.3): every value as a JS string literal
const ORG_FILL = (email, pass, name, slug) => `(function(){var f=document.querySelector('form[action="/orgs"]');if(!f)return;f.email.value=${JSON.stringify(email)};f.password.value=${JSON.stringify(pass)};f.name.value=${JSON.stringify(name)};f.slug.value=${JSON.stringify(slug)};if(f.product){f.product.value="Shots App";f.line.value="The shots' product, in one line";f.querySelector('input[name="stage"]').checked=true;}f.submit();})()`;
const NEWORG = String(process.env.SHOTS_NEWORG || "").split(",").map((x) => x.trim().split(/\s+/)).filter((x) => x.length === 2 && x[0] && x[1]);
// the showcase's splash flag (src/showcase.js SPLASH_KEY): set, a returning visitor's page; cleared, the first visit's splash
const SPLASH_SEEN = "try{localStorage.setItem('sharingu-splash','1')}catch(e){}";
const SPLASH_FIRST = "try{localStorage.removeItem('sharingu-splash')}catch(e){}";
const ALL = [
  // sprint 21, 21.3: the showcase at `/` (signed out): the page, and the first visit's splash caught mid-way (its timeline slowed)
  ["showcase", "/", false, { before: SPLASH_SEEN }],
  ["showcase-splash", "/", false, { before: SPLASH_FIRST, rate: 0.2, settle: 60 }],
  ["login", "/login", false],
  // sprint 7, 7.4b: an org's own sign-in (--brand-org <slug>: the page a signed-out visit to /<slug>/… is sent to, in that org's
  // brand), the one not-here page (a platform door asked for under an org's address), the org picker (GET /orgs: an ACCOUNT
  // session in several orgs, SHOTS_ACCOUNT below) and the rail's org switcher open (the same session; the phone opens the menu)
  ...(arg("brand-org") ? [["login-org", `/login?next=${encodeURIComponent(`/${arg("brand-org")}/home`)}`, false]] : []),
  ["not-here", "/no-such-org/login", false],
  ["picker", "/orgs", true],
  ["rail-orgs", "/home", true, { click: '[data-region="org-switcher"] summary', desktopOnly: true }],
  ["rail-orgs-menu", "/home", true, { steps: [{ click: "#rail-menu" }, { wait: 300 }, { click: '[data-region="org-switcher"] summary' }, { wait: 300 }], phoneOnly: true }],
  ["home", "/home", true],
  ["decisions", "/decisions", true],
  ...(qid ? [["question", `/question/${qid}`, true]] : []),
  ["goals", `/goals${PERIOD ? `?period=${PERIOD}` : ""}`, true],
  // one goal (a fed leaf, else the top goal), GTM, and What is missing for a seat and for the public
  ...await fetch(`${BASE}/goals?project=${encodeURIComponent(PROJECT)}&period=all`, { headers: { authorization: `Bearer ${KEY}`, accept: "application/json" } }).then((r) => r.json())
    .then((j) => { const n = arg("goal", "") ? { id: arg("goal", "") } : (j.nodes || []).find((x) => x.fed && x.fed.total > 0 && (x.dims || []).length) || { id: j.globalId }; return n.id ? [["goal-node", `/goals/${encodeURIComponent(n.id)}?period=all`, true]] : []; }).catch(() => []),
  ["gtm", "/gtm", true],
  // sprint 3 D2: GTM's Lists region (the card kinds that list on GTM) brought to the top of the screen
  ["gtm-lists", "/gtm", true, { steps: [{ js: "(function(){var r=document.querySelector('[data-region=\"lists\"]');if(r)r.scrollIntoView();})()" }, { wait: 300 }] }],
  ["holes", "/missing", true],
  ["holes-public", "/missing", false],
  // sprint 7, 7.2: the sign-up (signed out): the form, the one refusal (a code typed for an email it does not open)
  ["signup", "/signup", false],
  ["signup-refused", "/signup", false, { steps: [{ js: "(function(){var f=document.querySelector('form[action=\"/signup\"]');if(!f)return;f.email.value='someone@example.org';f.code.value='ABCDE-FGHJK-MNPQR-STVWX';f.password.value='a passphrase';f.confirm.value='a passphrase';f.submit();})()" }, { wait: 900 }] }],
  // sprint 21, 21.1: request access (signed out): the form
  ["request-access", "/request-access", false],
  // sprint 7, 7.3: create an org (signed out): the form, a refusal (an address the platform uses), and the made page. Each made-page
  // shot is a REAL creation, and an account creates one org: SHOTS_NEWORG="<email> <passphrase>,…" names one fresh local account per
  // shot (allowed by tools/operator.mjs, signed up), read from the environment and never printed
  ["orgs-new", "/orgs/new", false],
  ["orgs-new-refused", "/orgs/new", false, { steps: [{ js: ORG_FILL("someone@example.org", "a passphrase", "Acme Labs", "login") }, { wait: 900 }] }],
  ...(NEWORG.length ? [["orgs-made", "/orgs/new", false, { steps: () => { const [e, p] = NEWORG.shift() || ["", ""]; return [{ js: ORG_FILL(e, p, "Acme Labs", `acme-labs-${NEWORG.length + 1}`) }, { wait: 1500 }]; } }]] : []),
  ["build", "/build", true],
  // D2b: the whole sprint-3 set a stranger walks: Build's other two orders, a contribution's Impact, the Library, a search,
  // What changed, the projects page and the Map's layers one at a time
  ["build-newest", "/build?sort=newest", true],
  ["build-goal", "/build?sort=goal", true],
  // sprint 3 L2 (the revision on the five tabs): a filter followed on Goals and Decisions, and one of Build's rows opened in place
  ["goals-progress", "/goals?status=progress", true],
  ["decisions-open", "/decisions?status=open", true],
  ["build-open", "/build", true, { steps: [{ js: "(function(){var d=document.querySelectorAll('[data-region=\"filings\"] details.p-x');var t=d[Math.min(d.length-1,1)];if(t)t.open=true;})()" }, { wait: 250 }] }],
  ...(arg("tx", txid) ? [["filing", `/contribution/${arg("tx", txid)}`, true], ["impact", `/contribution/${arg("tx", txid)}/impact`, true]] : []),
  ["library", "/library", true],
  ["search", `/library?q=${encodeURIComponent(arg("q", "preview"))}`, true],
  ["changes", "/changes", true],
  ["projects", "/projects", true],
  ["map-doors", "/map?layer=doors", true],
  ["map-data", "/map?layer=data", true],
  ["map-flows", "/map?layer=flows", true],
  // sprint 3 B1: one card's page and one doc's page (--card <kind>/<id>, --doc <path>), each with its confidence and as-of date
  ...(arg("card") ? [["card", `/read?ref=card/${arg("card")}`, true]] : []),   // sprint 3 D2: the card's page on the new path
  ...(arg("doc") ? [["doc", `/doc/${arg("doc")}`, true]] : []),
  // sprint 3 B2: preview pages, --preview <name>=<id>[,<name>=<id>...] (each shot preview-<name>; a bare id is preview)
  ...String(arg("preview", "")).split(",").filter(Boolean).map((x) => { const [n, id] = x.includes("=") ? x.split("=") : ["", x]; return [n ? `preview-${n}` : "preview", `/preview/${id}`, true]; }),
  // --extra name=/path,name2=/path2: any page by its path, named for its file (sprint 3 B4: the Impact view, ?impact= on the
  // Map and the Screens view, a stale node, a picked-up contribution); the name is cut at the first "="
  ...String(arg("extra", "")).split(",").filter(Boolean).map((x) => { const i = x.indexOf("="); return [x.slice(0, i), x.slice(i + 1), true, { settle: /\/map/.test(x) ? 2500 : undefined }]; }),
  ["broadcast", "/broadcast", true, { settle: 1800 }],   // D2b: settled, so each goal's count reads its dots
  // Broadcast interactive (sprint 2): the live picture caught mid-flight (the replay stretched ten times through its own hook),
  // settled, a person hovered (the rest dimmed), and one starter item's page; the shelf with an item equipped is the plain
  // shot once a project holds one; the phone list is the plain shot at 390
  ["broadcast-flight", "/broadcast", true, { before: "window.__lvSlow=10", settle: 2600, desktopOnly: true }],
  ["broadcast-settled", "/broadcast", true, { settle: 1600, desktopOnly: true }],
  ["broadcast-hover", "/broadcast", true, { settle: 1400, steps: [{ wait: 1200 }, { hover: '#lv-svg [data-hp="1"] .lv-pn' }, { wait: 300 }], desktopOnly: true }],
  ["broadcast-goal", "/broadcast", true, { settle: 1400, steps: [{ wait: 1200 }, { hover: '#lv-svg [data-hg="0"] .lv-gt' }, { wait: 300 }], desktopOnly: true }],
  ["broadcast-starter", "/broadcast/starter/frontend", true],
  ["versions", "/versions", true],
  // the Map (the main tab): at rest (fit), a group opened, a node hovered, a node pinned, find, the light filter, a zoom in,
  // a flow mid-playback, the Arch and MCP views; --project picks the model (saruspay and siru on the parked org, 8870)
  ["map", "/map", true],
  ["map-open", "/map", true, { steps: [{ js: "(function(){var c=document.querySelector('#mx-units .mx-c');if(c)c.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()" }, { wait: 350 }] }],
  ["map-hover", "/map", true, { steps: [{ js: "(function(){var c=document.querySelectorAll('#mx-units .mx-c')[1]||document.querySelector('#mx-units .mx-c');if(c)c.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()" }, { wait: 300 }, { hover: '#mx-units .mx-n[data-t="screen"]' }, { wait: 300 }] }],
  ["map-pin", "/map", true, { steps: [{ js: "(function(){var a=document.querySelectorAll('.mx-list a[data-i]');var t=a[Math.min(a.length-1,Math.floor(a.length/3))];if(t)t.click();})()" }, { wait: 900 }] }],
  ["map-find", "/map", true, { steps: [{ js: "(function(){var q=document.getElementById('mx-q');if(q)q.focus();})()" }, { type: arg("find", "auth") }, { wait: 500 }] }],
  ["map-filter", "/map", true, { steps: [{ click: '[data-button="state-toggle"][data-show="grey"]' }, { wait: 300 }] }],
  ["map-zoom", "/map", true, { steps: [{ js: "(function(){var s=document.getElementById('mx-stage');if(s)s.focus();})()" }, { key: "=" }, { key: "=" }, { key: "=" }, { wait: 400 }], desktopOnly: true }],
  ["map-flow", "/map?layer=screens,doors,data,flows", true, { steps: [{ js: MAP_LONGEST_FLOW }, { wait: 400 }, { js: "(function(){var b=document.querySelector('[data-button=\"flow-next\"]');if(b)b.click();})()" }, { wait: 250 }, { js: "(function(){var b=document.querySelector('[data-button=\"flow-next\"]');if(b)b.click();})()" }, { wait: 500 }] }],
  // the keyboard alone: focus the canvas, move right into the screens, down twice, Enter opens (a group) or pins (a node)
  ["map-keys", "/map", true, { steps: [{ js: "(function(){var s=document.getElementById('mx-stage');if(s)s.focus();})()" }, { key: "ArrowDown" }, { key: "ArrowRight" }, { key: "Enter" }, { wait: 300 }, { key: "ArrowDown" }, { key: "Enter" }, { wait: 900 }], desktopOnly: true }],
  // R1: the Regrade press on a stale node's inspector (--regrade-node <ref>): the page its first press answers, the plan
  ["regrade-plan", `/map?node=${encodeURIComponent(arg("regrade-node", "screen:home"))}`, true, { click: '[data-region="inspector"] [data-button="regrade"]', settle: 1800 }],
  ["map-deps", "/map/deps", true],
  // the Arch view (sprint 3): settled after its open, a part hovered (its links and labels), a part pinned (the side
  // panel), a journey mid-play (the pulse and its caption) and the open caught mid-way (slowed)
  ["map-arch", "/map/arch", true, { settle: 1700 }],
  ["map-arch-open", "/map/arch", true, { rate: 0.15, settle: 900, desktopOnly: true }],
  ["map-arch-hover", "/map/arch", true, { settle: 1500, steps: [{ hover: '#ar-world .ar-n[data-kind="door"]' }, { wait: 300 }], desktopOnly: true }],
  ["map-arch-pin", "/map/arch", true, { settle: 1500, steps: [{ js: "(function(){var n=document.querySelector('#ar-world .ar-n[data-kind=\"door\"]');if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()" }, { wait: 400 }] }],
  ["map-arch-play", "/map/arch", true, { settle: 1500, steps: [{ click: "#ar-play" }, { wait: 3300 }], desktopOnly: true }],
  ["map-mcp", "/map/mcp", true],
  // M1 and M5 (sprint 4): the rail and the panel folded by the key (the canvas alone), a column folded from its head, the Arch
  // view folded by the key, a lane folded from its label, one journey filtered; each starts from no fold (FOLD_CLEAN)
  ["map-folded", "/map", true, { before: FOLD_CLEAN, steps: [{ wait: 300 }, { key: "\\" }, { wait: 600 }] }],
  ["map-col", "/map", true, { before: FOLD_CLEAN, steps: [{ js: "(function(){var h=document.querySelectorAll('#mx-heads .mx-colh')[1];if(h)h.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()" }, { wait: 400 }] }],
  ["map-arch-folded", "/map/arch", true, { before: FOLD_CLEAN, settle: 1500, steps: [{ key: "\\" }, { wait: 900 }] }],
  ["map-arch-lane", "/map/arch", true, { before: FOLD_CLEAN, settle: 1500, steps: [{ js: "(function(){var l=document.querySelectorAll('#ar-world .ar-fold')[1];if(l)l.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()" }, { wait: 700 }] }],
  ["map-arch-filter", "/map/arch", true, { before: FOLD_CLEAN, settle: 1500, steps: [{ click: '[data-button="path-pick"][data-path="0"]' }, { wait: 500 }] }],
  // the Screens view (the atlas, sprint 2): an app at fit (outlines), one step in (wireframes), close (live renders, given
  // time to load), a frame hovered (its transitions and their labels), a frame pinned (the inspector with its states), the
  // full-size viewer on a state other than the first, the wide app (--atlas-wide names it), Wireframe forced, find; the
  // phone's rows are the plain shot at 390; --project <a project with no screen> shoots the EMPTY state
  // sprint 3 L3: the atlas settles until the last frames' pictures land (they load nearest first: at 900 ms the two frames
  // farthest from the middle, Sign in and You, still drew their sparse grammar and read as near-blank)
  ["atlas", "/map/screens", true, { settle: 2600 }],
  ["atlas-mid", `/map/screens?screen=${arg("atlas-near", "cards")}`, true, { steps: [{ wait: 300 }, { key: "Escape" }, AX_FOCUS, ...Array(4).fill({ key: "-" }), { wait: 900 }], desktopOnly: true }],
  ["atlas-near", `/map/screens?screen=${arg("atlas-near", "cards")}`, true, { steps: [{ wait: 300 }, { key: "Escape" }, { wait: 300 }], settle: 3500, desktopOnly: true }],
  ["atlas-hover", `/map/screens?screen=${arg("atlas-near", "cards")}`, true, { steps: [{ wait: 300 }, { key: "Escape" }, AX_FOCUS, { key: "-" }, { key: "-" }, { wait: 900 }, { js: AX_PICK }, { hover: AX_MID_FRAME }, { wait: 400 }], settle: 2500, desktopOnly: true }],
  ["atlas-pin", `/map/screens?screen=${arg("atlas-screen", "create")}`, true, { settle: 3000 }],
  ["atlas-full", `/map/screens?screen=${arg("atlas-screen", "create")}&full=1`, true, { steps: [{ wait: 600 }, { js: "(function(){var c=document.querySelectorAll('.ax-view [data-button=\"view-state\"]');if(c[2])c[2].click();})()" }], settle: 2500 }],
  ["atlas-wide", `/map/screens?surface=${arg("atlas-wide", "web")}`, true, { steps: [AX_FOCUS, ...Array(5).fill({ key: "=" }), { wait: 400 }], settle: 3500, desktopOnly: true }],
  ["atlas-wire", `/map/screens?mode=wire&screen=${arg("atlas-near", "cards")}`, true, { steps: [{ wait: 300 }, { key: "Escape" }, { wait: 300 }], settle: 3000, desktopOnly: true }],
  ["atlas-find", "/map/screens", true, { steps: [{ js: "(function(){var q=document.getElementById('ax-q');if(q)q.focus();})()" }, { type: arg("atlas-find", "card") }, { wait: 500 }] }],
  ["control", "/control", true],
  // Control, simple (sprint 2): Invite open, a row's ⋯ menu open, Connect with ChatGPT open, the glass explainers, the invite's
  // one-time secret (typed and pressed through the page's own form: it FILES A PERSON, so point --base/--creds at your own
  // org, never the shared app), the admin's show-all; the profile with its hats
  ["control-invite", "/control", true, { click: '[data-button="invite"] summary' }],
  ["control-menu", "/control", true, { steps: [{ js: "(function(){var d=document.querySelectorAll('.ct-more');var t=d[Math.min(d.length-1,2)];if(t)t.open=true;})()" }, { wait: 250 }] }],
  // sprint 3 L3: Control's four sections, each brought to the top (Members is the plain shot); Connect with ChatGPT open
  ["control-projects", "/control", true, { steps: [{ js: "(function(){var c=document.getElementById('ct-projects');if(c)c.scrollIntoView();})()" }, { wait: 300 }] }],
  ["control-connect", "/control", true, { steps: [{ js: "(function(){var d=document.querySelector('[data-client-block=\"chatgpt\"] details');if(d){d.open=true;}var c=document.getElementById('ct-connect');if(c)c.scrollIntoView();})()" }, { wait: 300 }] }],
  ["control-admin", "/control", true, { steps: [{ js: "(function(){var c=document.getElementById('ct-admin');if(c)c.scrollIntoView();})()" }, { wait: 300 }] }],
  // sprint 3 S3b: the beta measures under Admin (the admin's alone)
  // sprint 8, 8.4: the admin's Plan card (the plan and its usage)
  ["control-plan", "/control", true, { settle: 1200, steps: [{ js: "(function(){var c=document.getElementById('ct-plan');if(c)c.scrollIntoView({block:'start'});})()" }, { wait: 400 }] }],
  ["control-measures", "/control", true, { settle: 1200, steps: [{ js: "(function(){var c=document.getElementById('ct-measures');if(c)c.scrollIntoView({block:'center'});})()" }, { wait: 400 }] }],
  // sprint 3 L3: Activity
  ["audit", "/audit", true],
  // sprint 12 (12.5): Activity across every project (with --project all: no ?project=, the read is every project the reader may
  // read), and one row opened
  ["audit-all", "/audit?all=1", true],
  ["audit-all-open", "/audit?all=1", true, { settle: 600, steps: [{ js: "(function(){var d=document.querySelector('[data-region=\"trail\"] details.p-x');if(d)d.open=true;})()" }, { wait: 300 }] }],
  ["control-flash", "/control", true, { settle: 1800, steps: [{ js: "(function(){var d=document.querySelector('[data-button=\"invite\"]');if(!d)return;d.open=true;var f=d.querySelector('form');f.querySelector('[name=name]').value='Nia Mensah';f.querySelector('[name=email]').value='nia@shots.test';var c=f.querySelector('[name=projectKey]');if(c)c.checked=true;f.querySelector('[data-button=\"provision-person-key\"]').click();})()" }] }],
  ["control-all", "/control?all=1", true],
  ["profile", "/profile", true],
];
// home-menu: the phone's top bar with the rail opened (the menu pressed before the shot); phone widths only
ALL.push(["home-menu", "/home", true, { click: "#rail-menu", phoneOnly: true }]);
// the popovers, open: a needs-you row's counters (the exact call) and Decisions' Answer in bulk; desktop widths only
ALL.push(["home-counters", "/home", true, { click: '[data-region="needs-you"] [data-button="counters"] summary', desktopOnly: true }]);
ALL.push(["decisions-bulk", "/decisions", true, { click: '[data-button="answer-bulk"] summary', desktopOnly: true }]);
// the look pass, group C: the command palette (open; a destination typed; a word that asks the search door), the project
// switcher open, the rail at a short window, the parts specimen (the logo at 16/24/32 and every new ui.js part), and the
// motion caught mid-way (every animation slowed ten times) beside a pulse (a remembered value that differs from the page's)
const META_K = { key: "k", mods: ["meta"] };
ALL.push(["palette", "/home", true, { steps: [META_K, { wait: 250 }] }]);
ALL.push(["palette-go", "/home", true, { steps: [META_K, { type: "arch" }, { key: "ArrowDown" }, { wait: 250 }] }]);
ALL.push(["palette-search", "/decisions", true, { steps: [META_K, { type: "token" }, { wait: 900 }] }]);
ALL.push(["switcher", "/home", true, { click: '[data-region="project-switcher"] summary', desktopOnly: true }]);
ALL.push(["rail-short", "/decisions", true, { height: 560, desktopOnly: true }]);
ALL.push(["parts", "/home", true, { inject: "parts" }]);
ALL.push(["home-motion", "/home", true, { rate: 0.1, settle: 1300, desktopOnly: true }]);
ALL.push(["home-pulse", "/home", true, { rate: 0.25, settle: 1500, desktopOnly: true,
  before: "try{['needs-you','in-motion','open-filings','shipped'].forEach(function(k){localStorage.setItem('sharingu-pulse:/home|sharingu|'+k,'-1')})}catch(e){}" }]);
const want = arg("pages", "");
const PAGES = want ? ALL.filter(([n]) => want.split(",").includes(n)) : ALL;
// sprint 7, 7.4: under --cookie a keyed page opens under the org's address the sign-in landed on (/<org>/…): a session cookie
// signs in only there (a page at the root would be sent there anyway); a page shot signed out, and a bearer's, at the root
// (7.4b: a platform door, /orgs, /login, stays at the root whoever asks)
let ORG_BASE = "";
const PLATFORM_SEGS = new Set(["login", "logout", "signup", "request-access", "account", "orgs", "install", "mcp", "oauth", ".well-known", "health", "fonts", "favicon.svg"]);
const atRoot = (path) => PLATFORM_SEGS.has((String(path).split(/[/?#]/)[1] || "").toLowerCase());
// --project all (sprint 11, 11.2): no ?project= at all, the reader's own default (an owner's: the org rollup, All projects)
const urlOf = (path, keyed = false) => `${BASE}${keyed && !atRoot(path) ? ORG_BASE : ""}${path}${PROJECT === "all" ? "" : `${path.includes("?") ? "&" : "?"}project=${encodeURIComponent(PROJECT)}`}`;

// ---- Chrome over the DevTools protocol ----
const profile = mkdtempSync(join(tmpdir(), "sharingu-shots-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  let buf = "";
  const t = setTimeout(() => rej(new Error("Chrome did not open its DevTools port")), 15000);
  chrome.stderr.on("data", (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); res(m[1]); } });
  chrome.on("exit", () => rej(new Error("Chrome exited")));
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const waiting = new Map(), listeners = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else for (const l of listeners) l(m);
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const once = (sessionId, method, ms = 20000) => new Promise((res) => {
  const t = setTimeout(() => { listeners.splice(listeners.indexOf(fn), 1); res(null); }, ms);
  const fn = (m) => { if (m.sessionId === sessionId && m.method === method) { clearTimeout(t); listeners.splice(listeners.indexOf(fn), 1); res(m.params); } };
  listeners.push(fn);
});

// --cookie: sign in through the app's own form, as a person does, and keep the session cookie the app answers. The default
// browser context holds it (every keyed page); ANON is a second context with no cookie (the pages shot signed out).
let ANON;
if (COOKIE) {
  // SHOTS_ACCOUNT="<email> <passphrase>" (sprint 7, 7.4b): sign in with an ACCOUNT's own passphrase instead of the owner's seat
  // secret (an account session: the picker and the rail's org switcher); read from the environment, never printed
  const ACCOUNT = String(process.env.SHOTS_ACCOUNT || "").trim().split(/\s+/);
  const asAccount = ACCOUNT.length === 2 && ACCOUNT[0] && ACCOUNT[1];
  const email = asAccount ? ACCOUNT[0] : arg("email", "") || await fetch(`${BASE}/whoami`, { headers: { authorization: `Bearer ${KEY}` } }).then((r) => r.json()).then((j) => j.email || "").catch(() => "");
  const secret = asAccount ? ACCOUNT[1] : KEY;
  const fail = (why) => { console.error(`shots: --cookie: ${why}`); try { ws.close(); } catch {} chrome.kill("SIGTERM"); process.exit(2); };
  if (!email) fail("no owner email (pass --email; /whoami answered none)");
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId); await send("Network.enable", {}, sessionId);
  let loaded = once(sessionId, "Page.loadEventFired");
  await send("Page.navigate", { url: `${BASE}/login` }, sessionId); await loaded;
  for (const [sel, text] of [["#email", email], ["#password", secret]]) {
    await send("Runtime.evaluate", { expression: `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(e){e.focus();e.value="";}return !!e;})()` }, sessionId);
    await send("Input.insertText", { text }, sessionId);
  }
  loaded = once(sessionId, "Page.loadEventFired");
  await send("Runtime.evaluate", { expression: "(function(){var b=document.querySelector('form[action=\"/login\"] button[type=submit]');if(b)b.click();return !!b;})()" }, sessionId);
  await loaded;
  const at = await send("Runtime.evaluate", { expression: "location.pathname", returnByValue: true }, sessionId);
  // an account in several orgs lands on the org picker (7.4b): the keyed pages open under --org <slug>, else its first org
  const firstPick = await send("Runtime.evaluate", { expression: "(function(){var a=document.querySelector('a.org-pick');return a?a.getAttribute('href'):'';})()", returnByValue: true }, sessionId);
  const { cookies } = await send("Network.getCookies", { urls: [`${BASE}/`] }, sessionId);
  await send("Target.closeTarget", { targetId }).catch(() => {});
  const c = (cookies || []).find((x) => x.name === "__Host-ar_session");
  const landed0 = at && at.result && at.result.value;
  const pickedHref = (firstPick && firstPick.result && firstPick.result.value) || "";
  const landed = landed0 === "/orgs" ? (arg("org") ? `/${arg("org")}` : pickedHref) : landed0;
  if (!c) fail(landed0 === "/login" ? `the app refused the sign-in for ${email} (still on /login): check --email and --creds`
    : `the sign-in left no __Host-ar_session cookie (landed on ${landed}); a __Host- cookie needs a secure context (http://127.0.0.1 or localhost)`);
  // the org's root (/<org>: a picker) or its Home (/<org>/home: one project)
  const orgAt = /^(\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(landed || "");
  if (!orgAt || orgAt[1] === "/login") fail(`the sign-in landed on ${landed}, not an org's address (/<org>/…)`);
  ORG_BASE = orgAt[1];
  console.log(`  ✓ signed in as ${email} through the app's form (POST /login): __Host-ar_session kept (secure ${c.secure}, httpOnly ${c.httpOnly}, sameSite ${c.sameSite}), landed on ${landed0}${landed !== landed0 ? ` (the picker: every keyed page under ${ORG_BASE})` : ": every keyed page under it"}`);
  ANON = (await send("Target.createBrowserContext", {})).browserContextId;
}

// step(st): one input, as a person makes it, through the DevTools Input domain
const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const VK = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27, Tab: 9 };
async function step(st, sessionId) {
  if (st.click) await send("Runtime.evaluate", { expression: `(function(){var b=document.querySelector(${JSON.stringify(st.click)});if(b)b.click();return 1;})()` }, sessionId);
  if (st.key) {
    const modifiers = (st.mods || []).reduce((m, k) => m | (MODS[k] || 0), 0);
    const code = VK[st.key] ? st.key : `Key${st.key.toUpperCase()}`, vk = VK[st.key] || st.key.toUpperCase().charCodeAt(0);
    for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: st.key, code, modifiers, windowsVirtualKeyCode: vk }, sessionId);
  }
  if (st.type) await send("Input.insertText", { text: st.type }, sessionId);
  // st.hover: the mouse moves onto the element's centre (a real pointer move, so :hover and pointer handlers run);
  // st.js: an expression evaluated in the page (the Map's shots press a cluster or pick a flow through the page's own DOM)
  if (st.hover) {
    const r = await send("Runtime.evaluate", { expression: `(function(){var e=document.querySelector(${JSON.stringify(st.hover)});if(!e)return null;var b=e.getBoundingClientRect();return JSON.stringify([b.left+b.width/2,b.top+b.height/2]);})()`, returnByValue: true }, sessionId);
    const xy = r && r.result && r.result.value ? JSON.parse(r.result.value) : null;
    if (xy) for (const type of ["mouseMoved"]) await send("Input.dispatchMouseEvent", { type, x: xy[0], y: xy[1], button: "none" }, sessionId);
  }
  if (st.js) await send("Runtime.evaluate", { expression: st.js }, sessionId);
  if (st.wait) await new Promise((r) => setTimeout(r, st.wait));
}
// specimen("parts"): the new shared parts at a glance, rendered by the real src/ui.js (the logo at 16, 24 and 32 px)
async function specimen(kind) {
  const ui = await import("../src/ui.js");
  if (kind !== "parts") return "";
  const logos = [16, 24, 32].map((n) => `<div style="display:flex;align-items:center;gap:18px;margin:0 0 12px">${ui.logo({ size: n })}${ui.logo({ size: n, wordmark: false })}<span class="u-count">${n}px</span></div>`).join("");
  const tbl = ui.table({ caption: "Goals by area", columns: [{ key: "goal", label: "Goal" }, { key: "area", label: "Area" }, { key: "fed", label: "Filings", num: true }, { key: "pct", label: "Done", num: true }],
    rows: [["Ship the look", "build", 42, "68%"], ["First live walk", "gtm", 7, "20%"], ["One brain per org", "goals", 1204, "91%"]].map(([g, a, f, p]) => ({ cells: { goal: g, area: a, fed: String(f), pct: p } })) });
  return `${ui.pageHeader({ title: "The parts", eyebrow: "", lede: "The shared parts group C added, as the other screens will use them." })}
    ${ui.breadcrumb([{ label: "Goals", href: "/goals" }, { label: "Ship the look", href: "/goals/look" }, { label: "The rail" }])}
    ${ui.section({ title: "The logo", body: logos })}
    ${ui.section({ title: "Pills", body: `${ui.pills([{ label: "All", href: "/decisions", count: 346, current: true }, { label: "Open", href: "/decisions?status=open", count: 2 }, { label: "In force", href: "/decisions?status=in-force", count: 339 }], { label: "Filter" })}<div style="height:12px"></div>${ui.pills([{ label: "Week", href: "/goals", current: true }, { label: "Month", href: "/goals" }, { label: "All", href: "/goals" }], { label: "Period", segment: true })}` })}
    ${ui.section({ title: "Progress", body: `<div style="display:grid;gap:18px;max-width:420px">${ui.progress({ value: 0.68, label: "Ship the look", sub: "42 filings feeding" })}${ui.progress({ value: 1, label: "Fonts self-hosted", tone: "ok" })}${ui.progress({ value: 0.2, label: "First live walk", tone: "needs" })}</div>` })}
    ${ui.section({ title: "Spark", body: `<div style="display:flex;gap:32px;align-items:center">${ui.spark([3, 5, 4, 8, 6, 9, 12], { label: "Filings a day", labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] })}${ui.spark([2, 4, 1, 6, 3, 7, 5, 8], { kind: "bars", label: "Shipped a week" })}</div>` })}
    ${ui.section({ title: "Table", body: tbl })}
    ${ui.section({ title: "Quiet empty", body: ui.emptyState("No goal moved this month.", { quiet: true }) })}`;
}

mkdirSync(OUT, { recursive: true });
let shots = 0, failed = 0;
try {
  for (const [name, path, keyed, how = {}] of PAGES) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        if ((how.phoneOnly && width >= 860) || (how.desktopOnly && width < 860)) continue;
        const height = how.height || HEIGHT || (width < 600 ? 844 : 960);
        const { targetId } = await send("Target.createTarget", { url: "about:blank", ...(COOKIE && !keyed ? { browserContextId: ANON } : {}) });
        const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
        try {
          await send("Page.enable", {}, sessionId);
          // a script error on the page is printed beside its shot (a page that throws is never a silent pass)
          await send("Runtime.enable", {}, sessionId);
          const onErr = (m) => { if (m.sessionId === sessionId && m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails || {}; console.log(`  ! ${name} ${theme} ${width}: ${String((d.exception && d.exception.description) || d.text || "an exception").split("\n").slice(0, 3).join(" | ").split(KEY).join("<key>")}`); } };
          listeners.push(onErr);
          await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: SCALE, mobile: width < 600 }, sessionId);
          await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme === "ink" ? "dark" : "light" }] }, sessionId);
          // how.before: a script run in the page before its own (seeds localStorage); how.rate: every animation slowed (a
          // mid-way shot), applied to the page's timeline before it loads
          if (how.before) await send("Page.addScriptToEvaluateOnNewDocument", { source: how.before }, sessionId);
          // a keyed page's own reads (the palette's search, what changed) carry the key too, as a signed-in browser's cookie would
          // (--cookie: the session cookie alone, as a signed-in browser sends it)
          if (keyed && !COOKIE) { await send("Network.enable", {}, sessionId); await send("Network.setExtraHTTPHeaders", { headers: { authorization: `Bearer ${KEY}` } }, sessionId); }
          if (how.rate) { await send("Animation.enable", {}, sessionId); await send("Animation.setPlaybackRate", { playbackRate: how.rate }, sessionId); }
          const loaded = once(sessionId, "Page.loadEventFired");
          await send("Page.navigate", { url: urlOf(path, keyed && COOKIE) }, sessionId);
          await loaded;
          // the faces settle before the shot (self-hosted, so this is quick)
          await send("Runtime.evaluate", { expression: "document.fonts ? document.fonts.ready.then(() => 1) : 1", awaitPromise: true }, sessionId);
          if (how.click) await send("Runtime.evaluate", { expression: `(function(){var b=document.querySelector(${JSON.stringify(how.click)});if(b)b.click();return 1;})()` }, sessionId);
          // how.steps: key presses (with modifiers), typed text, clicks and waits, in order, as a person would
          // (a function of the shot's theme and width when each shot needs its own: the made-org page, one creation each)
          for (const st of (typeof how.steps === "function" ? how.steps(theme, width) : how.steps) || []) await step(st, sessionId);
          // how.inject: a specimen drawn here from src/ui.js, put in the page's content (the page's own chrome around it)
          if (how.inject) await send("Runtime.evaluate", { expression: `(function(){var m=document.querySelector('main.content');if(m)m.innerHTML=${JSON.stringify(await specimen(how.inject))};document.documentElement.classList.remove('u-motion');return 1;})()` }, sessionId);
          await new Promise((r) => setTimeout(r, how.settle != null ? how.settle : 450));
          // sprint 3 L3: a page that scrolls sideways is said beside its shot (the phone's rule: no horizontal scroll), with the
          // widest element that pokes out
          const hs = await send("Runtime.evaluate", { returnByValue: true, expression: "(function(){var d=document.documentElement,o=d.scrollWidth-d.clientWidth;if(o<=1)return '';var w=null,m=0;[].forEach.call(document.querySelectorAll('main *'),function(e){var r=e.getBoundingClientRect();if(r.right-d.clientWidth>m&&getComputedStyle(e).position!=='fixed'){m=r.right-d.clientWidth;w=e;}});return o+'px'+(w?' ('+w.tagName.toLowerCase()+(w.className&&w.className.baseVal===undefined?'.'+String(w.className).split(' ').join('.'):'')+')':'');})()" }, sessionId);
          if (hs && hs.result && hs.result.value) console.log(`  ⚠ ${name} ${theme} ${width}: scrolls sideways ${hs.result.value}`);
          let clip;
          if (FULL) {
            const m = await send("Page.getLayoutMetrics", {}, sessionId);
            const h = Math.min(4000, Math.ceil((m.cssContentSize || m.contentSize).height));
            await send("Emulation.setDeviceMetricsOverride", { width, height: Math.max(height, h), deviceScaleFactor: SCALE, mobile: width < 600 }, sessionId);
            await new Promise((r) => setTimeout(r, 150));
            clip = { x: 0, y: 0, width, height: Math.max(height, h), scale: 1 };
          }
          const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) }, sessionId);
          const file = join(OUT, `${name}-${theme}-${width}${SCALE > 1 ? `@${SCALE}x` : ""}.png`);
          writeFileSync(file, Buffer.from(data, "base64"));
          shots++;
          console.log(`  ✓ ${name} ${theme} ${width}  ${path}  -> ${file.slice(ENGINE.length + 1)}`);
        } catch (e) {
          failed++;
          console.log(`  ✗ ${name} ${theme} ${width}  ${path}: ${String(e && e.message).split(KEY).join("<key>")}`);
        } finally {
          await send("Target.closeTarget", { targetId }).catch(() => {});
          for (let k = listeners.length - 1; k >= 0; k--) if (listeners[k].length === 1 && String(listeners[k]).includes("exceptionThrown")) listeners.splice(k, 1);
        }
      }
    }
  }
} finally {
  try { ws.close(); } catch {}
  chrome.kill("SIGTERM");
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300);
}
console.log(`shots: ${shots} saved under ${OUT.slice(ENGINE.length + 1)}${COOKIE ? " (signed in with the session cookie)" : ""}${failed ? ` · ${failed} failed` : ""}`);
process.exitCode = failed ? 1 : 0;
