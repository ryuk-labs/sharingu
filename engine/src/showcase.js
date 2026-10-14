// src/showcase.js — the platform's front page for a visitor with no session (sprint 21, 21.3; the owner's MCQs of 2026-10-13/14):
// GET / at the root answers a browser navigation that signs no one in with this page, where it used to send it to /login (a
// signed-in browser still goes to its org or the org picker, a script with no credential still gets its 401: src/index.js).
// The front door's frame (src/login.js frontHead, frontTop: the paper page, the wordmark top-left, the website and Sign in
// top-right; frontFoot), the website's hero line and its lede, ONE orange button (Join the beta: 21.P, the one word on
// the site and in the app) and the walkthrough beside it, the beta's places taken in the mono label style (src/accounts.js
// betaCount, read by the route; left out when it could not be read, never guessed), U-chan (ui.js uchan, the brand's own vector),
// and the walkthrough's section (21.P B9/B10): the website's five videos in its order (src/walkthrough.js, the one list), each our
// own poster (src/frontassets.js: the website's JPEGs, served by the worker) with its badge, title and duration. Each PLAYS IN
// PLACE as the website's does: without a script it is a plain link to youtu.be (a new tab); the page's script turns each into a
// real <button> that, on a press, swaps itself for the youtube-nocookie player (autoplay, focused). Nothing from YouTube loads
// before a press: no embed, no iframe, no thumbnail of theirs.
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
import { frontHead, frontTop, frontFoot, authBrand, JOIN_WORDS } from "./login.js";
import { betaWords } from "./requestpage.js";
import { REQUEST_PATH } from "./requestaccess.js";
import { WALKTHROUGH, WALKTHROUGH_CHANNEL } from "./walkthrough.js";
import { frontAssetHref } from "./frontassets.js";

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
  .walk{width:min(1120px,calc(100% - 32px));margin:0 auto 96px;scroll-margin-top:24px}
  .walk h2{margin:10px 0 0;font:800 clamp(30px,3.6vw,44px)/1.08 var(--sans);letter-spacing:-.03em;color:var(--text)}
  .walk-lede{margin:14px 0 0;max-width:60ch;font:400 16px/1.6 var(--sans);color:var(--text-muted)}
  .walk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 18px;margin:28px 0 0;padding:0;list-style:none}
  .walk-wide{grid-column:1 / -1}
  .walk-frame{position:relative;aspect-ratio:16/10;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:var(--media)}
  .walk-wide .walk-frame{aspect-ratio:16/9}
  .walk-frame:has(.walk-play:focus-visible){outline:2px solid var(--focus);outline-offset:3px}
  .walk-play,.walk-video{position:absolute;inset:0;display:block;width:100%;height:100%;margin:0;padding:0;border:0}
  .walk-play{font:inherit;color:var(--on-media);text-align:left;background:none;cursor:pointer}
  .walk-play:focus-visible{outline:none}
  .walk-play img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform var(--dur) var(--ease)}
  .walk-play::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,color-mix(in srgb,var(--media) 95%,transparent) 0%,color-mix(in srgb,var(--media) 85%,transparent) 21%,color-mix(in srgb,var(--media) 40%,transparent) 46%,color-mix(in srgb,var(--media) 16%,transparent) 72%,color-mix(in srgb,var(--media) 8%,transparent) 100%);transition:opacity var(--dur) var(--ease)}
  .walk-icon{position:absolute;z-index:1;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:var(--on-media);
    box-shadow:0 0 0 6px color-mix(in srgb,var(--on-media) 22%,transparent),0 12px 32px color-mix(in srgb,var(--media) 35%,transparent);transition:transform var(--dur) var(--ease)}
  .walk-icon::before{content:"";position:absolute;left:50%;top:50%;margin:-10px 0 0 -6px;border-style:solid;border-width:10px 0 10px 17px;border-color:transparent transparent transparent var(--media)}
  .walk-badge{position:absolute;z-index:1;top:12px;left:12px;padding:5px 8px;border:1px solid var(--media-chip-line);border-radius:6px;background:var(--media-chip);color:var(--on-media-chip);
    font:500 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase}
  .walk-meta{position:absolute;z-index:1;left:14px;right:12px;bottom:12px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
  .walk-title{font:600 20px/1.15 var(--display);color:var(--on-media);text-wrap:balance}
  .walk-time{flex:none;padding:5px 7px;border:1px solid color-mix(in srgb,var(--on-media) 25%,transparent);border-radius:6px;background:color-mix(in srgb,var(--media) 80%,transparent);color:var(--on-media);font:500 11px/1 var(--mono)}
  .walk-wide .walk-icon{width:78px;height:78px;margin:-39px 0 0 -39px}
  .walk-wide .walk-icon::before{margin:-13px 0 0 -8px;border-width:13px 0 13px 22px}
  .walk-wide .walk-badge{top:16px;left:16px}
  .walk-wide .walk-meta{left:20px;right:16px;bottom:16px}
  .walk-wide .walk-title{font-size:30px}
  .walk-play:hover img,.walk-play:focus-visible img{transform:scale(1.03)}
  .walk-play:hover::after,.walk-play:focus-visible::after{opacity:.8}
  .walk-play:hover .walk-icon,.walk-play:focus-visible .walk-icon{transform:scale(1.08)}
  .walk-more{margin:18px 0 0;font:400 14px/1.5 var(--sans);color:var(--text-muted)}
  .walk-more a{font-weight:600;color:var(--text);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:4px}
  .walk-more a:hover{text-decoration-color:var(--text)}
  .splash{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:var(--page);
    animation:splash-out ${SPLASH_OUT}ms var(--ease) ${SPLASH_IN + SPLASH_NOD}ms forwards}
  .splash[hidden]{display:none}
  .splash .u-uchan{width:109px;height:120px;animation:splash-in ${SPLASH_IN}ms var(--ease) both,uchan-nod ${SPLASH_NOD}ms ease-in-out ${SPLASH_IN}ms}
  @keyframes splash-in{from{opacity:0;scale:.9}to{opacity:1;scale:1}}
  @keyframes uchan-nod{0%,100%{rotate:0deg}45%{rotate:2deg}70%{rotate:-1deg}}
  @keyframes splash-out{to{opacity:0;visibility:hidden}}
  @media (prefers-reduced-motion:reduce){.splash{display:none}}
  @media (max-width:760px){.hero{grid-template-columns:1fr;gap:24px;padding:40px 0 48px}.hero-mark{order:-1;justify-content:flex-start}
    .hero-mark .u-uchan{width:87px;height:96px}.walk{margin-bottom:56px}.walk-grid{grid-template-columns:minmax(0,1fr)}}
  @media (max-width:550px){.walk-icon{width:50px;height:50px;margin:-25px 0 0 -25px}.walk-icon::before{margin:-8px 0 0 -5px;border-width:8px 0 8px 14px}
    .walk-title,.walk-wide .walk-title{font-size:17px}.walk-badge,.walk-wide .walk-badge{top:10px;left:10px;font-size:9px}
    .walk-meta,.walk-wide .walk-meta{left:12px;right:10px;bottom:10px}.walk-wide .walk-icon{width:58px;height:58px;margin:-29px 0 0 -29px}
    .walk-wide .walk-icon::before{margin:-10px 0 0 -6px;border-width:10px 0 10px 17px}}
`;
// the splash's one script, right after its markup at the top of <body> (it runs before the page below it paints): shown only on
// a first visit whose flag this browser keeps, never under reduced motion; any key, pointer or touch removes it, else its end
const SPLASH_JS = `<script>(function(){var s=document.getElementById('splash'),K='${SPLASH_KEY}';if(!s)return;` +
  `try{if(matchMedia('(prefers-reduced-motion: reduce)').matches||localStorage.getItem(K))return;localStorage.setItem(K,'1');if(localStorage.getItem(K)!=='1')return;}catch(e){return;}` +
  `var ev=['keydown','pointerdown','touchstart'],t;function done(){clearTimeout(t);ev.forEach(function(e){removeEventListener(e,done,true);});if(s.parentNode)s.parentNode.removeChild(s);}` +
  `s.hidden=false;ev.forEach(function(e){addEventListener(e,done,{capture:true,passive:true});});t=setTimeout(done,${SPLASH_MS});})();</script>`;

// the walkthrough's one script, at the end of the page: each poster's link becomes a <button> that, on a press, swaps itself for
// the youtube-nocookie player in place (the website's guide.js, the same steps); an id that is not a video's name is left a link
const PLAYER_JS = `<script>(function(){var q=document.querySelectorAll('#walkthrough a.walk-play[data-youtube]');for(var n=0;n<q.length;n++)(function(a){` +
  `var id=a.getAttribute('data-youtube');if(!/^[\\w-]{11}$/.test(id))return;var t=function(s){var e=a.querySelector(s);return e?e.textContent.trim():'';};` +
  `var name=t('.walk-badge')+', '+t('.walk-title')+' ('+t('.walk-time')+')';var b=document.createElement('button');b.type='button';b.className=a.className;` +
  `b.setAttribute('aria-label','Play '+name);b.setAttribute('data-video',a.getAttribute('data-video'));while(a.firstChild)b.appendChild(a.firstChild);a.parentNode.replaceChild(b,a);` +
  `b.addEventListener('click',function(){var f=document.createElement('iframe');f.className='walk-video';f.title=name+', on YouTube';` +
  `f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;f.referrerPolicy='strict-origin-when-cross-origin';` +
  `f.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';b.parentNode.replaceChild(f,b);f.focus();});})(q[n]);})();</script>`;

// renderShowcase({ count }) -> the page. count: src/accounts.js betaCount's answer, or null (left out)
export function renderShowcase(opts) {
  const { count = null } = opts || {};
  const { wordmark } = authBrand(DEFAULT_BRAND);
  const places = betaWords(count);
  const out = (u) => `href="${esc(u)}" target="_blank" rel="noopener"`;
  const videos = WALKTHROUGH.map((v, i) => `<li class="walk-item${i === 0 ? " walk-wide" : ""}"><div class="walk-frame">` +
    `<a class="walk-play" ${out(v.url)} data-youtube="${esc(v.id)}" data-video="${i + 1}" aria-label="Watch on YouTube, in a new tab: ${esc(v.badge)}, ${esc(v.title)} (${esc(v.time)})">` +
    `<img src="${frontAssetHref(v.poster)}" width="${v.w}" height="${v.h}" alt="" decoding="async" loading="lazy"><span class="walk-icon" aria-hidden="true"></span>` +
    `<span class="walk-badge">${esc(v.badge)}</span><span class="walk-meta"><strong class="walk-title">${esc(v.title)}</strong><time class="walk-time" datetime="${esc(v.duration)}">${esc(v.time)}</time></span></a></div></li>`).join("\n        ");
  return `<!doctype html>
<html lang="en">
${frontHead({ title: PRODUCT_NAME, description: SHOWCASE_LEDE, css: SHOWCASE_CSS })}
<body data-shell="front">
<div class="splash" id="splash" hidden aria-hidden="true">${uchan({ size: 120 })}</div>
${SPLASH_JS}
${frontTop(wordmark)}
  <main class="show" data-screen="showcase">
    <section class="hero" aria-labelledby="hero-line">
      <div>
        <h1 id="hero-line">${esc(SHOWCASE_LINE)}</h1>
        <p class="hero-lede">${esc(SHOWCASE_LEDE)}</p>
        <div class="hero-acts">
          <a class="access" href="${REQUEST_PATH}" data-region="request-access-link">${JOIN_WORDS}</a>
          <a class="see" href="#walkthrough">See the walkthrough</a>
        </div>
        ${places ? `<p class="label" data-beta-count>${esc(places)}</p>` : ""}
      </div>
      <div class="hero-mark">${uchan({ size: 240, label: "U-chan" })}</div>
    </section>
    <section class="walk" id="walkthrough" data-region="walkthrough" aria-labelledby="walk-title">
      <p class="label">The walkthrough</p>
      <h2 id="walk-title">See it work.</h2>
      <p class="walk-lede">The reviewer’s test cases first, then a new team’s four steps, about a minute each. Each plays here once you press it.</p>
      <ol class="walk-grid">
        ${videos}
      </ol>
      <p class="walk-more">All five are on <a ${out(WALKTHROUGH_CHANNEL.url)} data-channel>${esc(WALKTHROUGH_CHANNEL.title)}<span class="u-sr"> (opens YouTube in a new tab)</span></a>.</p>
    </section>
  </main>
${frontFoot()}
${PLAYER_JS}
</body>
</html>`;
}
