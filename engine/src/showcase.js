// src/showcase.js — the platform's front page for a visitor with no session (sprint 21, 21.3; the owner's MCQs of 2026-10-13/14):
// GET / at the root answers a browser navigation that signs no one in with this page, where it used to send it to /login (a
// signed-in browser still goes to its org or the org picker, a script with no credential still gets its 401: src/index.js).
// The front door's frame (src/login.js frontHead, frontTop: the paper page, the wordmark top-left, "Sign in" top-right), the
// website's hero line and its lede, ONE orange button (Request access) and the walkthrough beside it, the beta's places taken in
// the mono label style (src/accounts.js betaCount, read by the route; left out when it could not be read, never guessed), U-chan
// (ui.js uchan, the brand's own vector), and the walkthrough's section: the five videos and the channel as plain links that open
// YouTube in a new tab (src/walkthrough.js, the one list: nothing third-party loads here — no embed, no iframe, no thumbnail).
//
// THE SPLASH (the owner's ruling): U-chan pops in over the paper and nods once (the website's own uchan-nod keyframes,
// assets/brand/brand.css, run once instead of its 3 s loop), then the splash fades into the page: 1.2 s in all, removed by its
// script at 1.2 s. It is progressive: the page is in the HTML underneath, readable without a script, and the splash is `hidden`
// until its script shows it, so a page whose script never runs has none, and an overlay that is shown fades itself out by CSS
// alone (its last frame is invisible and lets every click through). FIRST VISIT ONLY: the script shows it only when this
// browser's storage holds no SPLASH_KEY and keeps the one it writes (a storage that throws or forgets shows nothing, never a
// splash each visit, never a stuck overlay). Any key, click or tap skips it at once; under prefers-reduced-motion it is never
// shown (the script asks, and the CSS hides it too).
import { esc, uchan, PRODUCT_NAME } from "./ui.js";
import { DEFAULT_BRAND } from "./tenant.js";
import { frontHead, frontTop, authBrand } from "./login.js";
import { betaWords } from "./requestpage.js";
import { REQUEST_PATH } from "./requestaccess.js";
import { WALKTHROUGH, WALKTHROUGH_CHANNEL } from "./walkthrough.js";

export const SHOWCASE_LINE = "Your company's work, on boards nobody maintains.";
export const SHOWCASE_LEDE = "Your tools. One company brain. Contributions, decisions and goals, filed by your AI through MCP.";
export const SPLASH_KEY = "sharingu-splash";
// the splash's one timeline (ms): U-chan in, the nod, the fade; the script removes the overlay at its end (under 1.5 s)
const SPLASH_IN = 200, SPLASH_NOD = 800, SPLASH_OUT = 200;
export const SPLASH_MS = SPLASH_IN + SPLASH_NOD + SPLASH_OUT;

const SHOWCASE_CSS = `
  .show{flex:1}
  .hero{width:min(1120px,calc(100% - 32px));margin:0 auto;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr);align-items:center;gap:48px;padding:88px 0 80px}
  .hero h1{margin:0;max-width:15ch;font:800 clamp(36px,5vw,58px)/1.06 var(--sans);letter-spacing:-.03em;color:var(--text)}
  .hero-lede{margin:22px 0 0;max-width:46ch;font:400 18px/1.6 var(--sans);color:var(--text-muted)}
  .hero-acts{display:flex;flex-wrap:wrap;align-items:center;gap:14px 26px;margin:32px 0 0}
  .access{display:inline-flex;align-items:center;height:48px;padding:0 22px;font:700 15px/1 var(--sans);color:var(--on-accent);background:var(--accent);
    border:1px solid var(--accent-text);border-bottom-width:3px;border-radius:10px;transition:filter var(--dur-fast) var(--ease)}
  .access:hover{filter:brightness(1.05)}
  .see{font:600 15px/1.2 var(--sans);color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:5px;
    transition:text-decoration-color var(--dur-fast) var(--ease)}
  .see:hover{text-decoration-color:var(--text)}
  .label{margin:0;font:500 12px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
  .hero .label{margin-top:28px}
  .hero-mark{display:flex;justify-content:center}
  .hero-mark .u-uchan{width:217px;height:240px}
  .walk{width:min(1120px,calc(100% - 32px));margin:0 auto 96px;padding:28px;background:var(--surface);border:1px solid var(--line);border-radius:14px;scroll-margin-top:24px}
  .walk h2{margin:6px 0 18px;font:800 24px/1.2 var(--sans);letter-spacing:-.02em;color:var(--text)}
  .walk-list{margin:0;padding:0;list-style:none;border-top:1px solid var(--line)}
  .walk-list li{border-bottom:1px solid var(--line)}
  .walk-list a{display:flex;align-items:center;gap:14px;min-height:52px;padding:8px 6px;color:var(--text);transition:background-color var(--dur-fast) var(--ease)}
  .walk-list a:hover{background:var(--hover)}
  .walk-n{flex:none;width:22px;font:500 12px/1 var(--mono);color:var(--text-faint)}
  .walk-t{flex:1;min-width:0;font:600 15px/1.35 var(--sans)}
  .walk-host{flex:none;font:500 12px/1 var(--mono);color:var(--text-muted)}
  .channel{display:inline-block;margin-top:18px;font:600 14px/1.2 var(--sans);color:var(--text);text-decoration:underline;
    text-decoration-color:var(--line-strong);text-underline-offset:4px}
  .channel:hover{text-decoration-color:var(--text)}
  .splash{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:var(--page);
    animation:splash-out ${SPLASH_OUT}ms var(--ease) ${SPLASH_IN + SPLASH_NOD}ms forwards}
  .splash[hidden]{display:none}
  .splash .u-uchan{width:109px;height:120px;animation:splash-in ${SPLASH_IN}ms var(--ease) both,uchan-nod ${SPLASH_NOD}ms ease-in-out ${SPLASH_IN}ms}
  @keyframes splash-in{from{opacity:0;scale:.9}to{opacity:1;scale:1}}
  @keyframes uchan-nod{0%,100%{rotate:0deg}45%{rotate:2deg}70%{rotate:-1deg}}
  @keyframes splash-out{to{opacity:0;visibility:hidden}}
  @media (prefers-reduced-motion:reduce){.splash{display:none}}
  @media (max-width:760px){.hero{grid-template-columns:1fr;gap:24px;padding:40px 0 48px}.hero-mark{order:-1;justify-content:flex-start}
    .hero-mark .u-uchan{width:87px;height:96px}.walk{padding:20px 16px;margin-bottom:56px}.walk-host{display:none}}
`;
// the splash's one script, right after its markup at the top of <body> (it runs before the page below it paints): shown only on
// a first visit whose flag this browser keeps, never under reduced motion; any key, pointer or touch removes it, else its end
const SPLASH_JS = `<script>(function(){var s=document.getElementById('splash'),K='${SPLASH_KEY}';if(!s)return;` +
  `try{if(matchMedia('(prefers-reduced-motion: reduce)').matches||localStorage.getItem(K))return;localStorage.setItem(K,'1');if(localStorage.getItem(K)!=='1')return;}catch(e){return;}` +
  `var ev=['keydown','pointerdown','touchstart'],t;function done(){clearTimeout(t);ev.forEach(function(e){removeEventListener(e,done,true);});if(s.parentNode)s.parentNode.removeChild(s);}` +
  `s.hidden=false;ev.forEach(function(e){addEventListener(e,done,{capture:true,passive:true});});t=setTimeout(done,${SPLASH_MS});})();</script>`;

// renderShowcase({ count }) -> the page. count: src/accounts.js betaCount's answer, or null (left out)
export function renderShowcase(opts) {
  const { count = null } = opts || {};
  const { wordmark } = authBrand(DEFAULT_BRAND);
  const places = betaWords(count, "beta places");
  const host = (u) => new URL(u).host.replace(/^www\./, "");
  const out = (u) => `href="${esc(u)}" target="_blank" rel="noopener"`;
  const videos = WALKTHROUGH.map((v, i) => `<li><a ${out(v.url)} data-video="${i + 1}"><span class="walk-n">0${i + 1}</span><span class="walk-t">${esc(v.title)}</span>` +
    `<span class="walk-host">${esc(host(v.url))}</span><span class="u-sr"> (opens YouTube in a new tab)</span></a></li>`).join("\n        ");
  return `<!doctype html>
<html lang="en">
${frontHead({ title: PRODUCT_NAME, description: SHOWCASE_LEDE, css: SHOWCASE_CSS })}
<body data-shell="front">
<div class="splash" id="splash" hidden aria-hidden="true">${uchan({ size: 120 })}</div>
${SPLASH_JS}
${frontTop(wordmark, `<a class="front-link" href="/login" data-region="sign-in-link">Sign in</a>`)}
  <main class="show" data-screen="showcase">
    <section class="hero" aria-labelledby="hero-line">
      <div>
        <h1 id="hero-line">${esc(SHOWCASE_LINE)}</h1>
        <p class="hero-lede">${esc(SHOWCASE_LEDE)}</p>
        <div class="hero-acts">
          <a class="access" href="${REQUEST_PATH}" data-region="request-access-link">Request access</a>
          <a class="see" href="#walkthrough">See the walkthrough</a>
        </div>
        ${places ? `<p class="label" data-beta-count>${esc(places)}</p>` : ""}
      </div>
      <div class="hero-mark">${uchan({ size: 240, label: "U-chan" })}</div>
    </section>
    <section class="walk" id="walkthrough" data-region="walkthrough" aria-labelledby="walk-title">
      <p class="label">Five videos</p>
      <h2 id="walk-title">The walkthrough</h2>
      <ol class="walk-list">
        ${videos}
      </ol>
      <a class="channel" ${out(WALKTHROUGH_CHANNEL.url)} data-channel>${esc(WALKTHROUGH_CHANNEL.title)}<span class="u-sr"> (opens YouTube in a new tab)</span></a>
    </section>
  </main>
</body>
</html>`;
}
