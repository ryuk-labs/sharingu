// tools/walkthrough/record.mjs — the walkthrough RECORDER (a library: tools/walkthrough/take.mjs is the one command, the
// beats are tools/walkthrough/scenes.mjs). It drives the pinned headless Chrome for Testing (~/.sharingu/chrome-for-testing.app,
// never the owner's own Chrome) over the DevTools protocol, captures the page with the CDP screencast, and cuts the film:
//
//   · SHOTS. A take is a list of shots; a shot is one continuous capture (no cut inside it). Between two shots the film
//     cross-fades (FADE within a beat, BEAT_FADE between beats). Every shot starts and ends on a still hold as long as its
//     fade, so a cross-fade never blends two motions.
//   · THE OPEN ANIMATIONS PLAY. A cut to a page freezes the page's animation timeline before it navigates
//     (Animation.setPlaybackRate 0, the shots.mjs hook), waits for the load and the faces, starts the shot on that first
//     frame (every [data-reveal] at its start, every count at 0), holds through the fade, then sets the rate back to 1:
//     the page's own open animation (src/shell.js MOTION_CSS and its count-up) plays whole, on camera. src/ is never edited.
//   · A REAL POINTER. An arrow drawn in the page (the recorder's own layer, above everything, never a click target) follows
//     the DevTools mouse events; moves ease in and out; a press shows a soft ring. Its place survives a navigation (the
//     layer's init script is re-registered with the pointer and the caption before each one, read before the first paint).
//   · CAPTIONS live in the rail's empty space, bottom-left above the person (never over content); on a page with no rail
//     (sign-in, the terminal) bottom-left of the frame. Manrope, ink on a paper chip. A caption leaves before a shot's
//     tail hold and comes after the next shot's head hold, so a cross-fade never blends two.
//   · THE TERMINAL. A terminal pane is the recorder's own full-frame layer on the current document (the app's faces):
//     the command is typed, then RUN for real (a child process, the seat's key in its env, never on screen), and its
//     stdout is shown line by line.
//   · FRAMES. Each screencast frame is acked at once and kept with its own timestamp; a shot's frames become a constant
//     60 fps clip (ffmpeg concat with the real durations, then fps=60); the clips are joined with xfade into one H.264 mp4.
//     The capture's own rate is measured per shot (frames per second while the page moved) and written to the take's report.
//
// Nothing secret reaches a frame: the key is typed only into the sign-in form's password field (checked to be
// type="password" before a key is typed), never put in an address (no ?k=), never echoed to a terminal pane.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

export const CHROME = join(homedir(), ".sharingu/chrome-for-testing.app/Contents/MacOS/Google Chrome for Testing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// the recorder's own layer: pointer, caption, terminal (one style sheet, the app's tokens' values; the app's faces)
const LAYER = `(function(){ if (window.top !== window || window.__rec) return; window.__rec = 1;
  var S = window.__RS || {};
  var css = ''
   + '#__cur{position:fixed;left:0;top:0;z-index:2147483647;width:22px;height:28px;pointer-events:none;will-change:transform}'
   + '#__cur svg{display:block;filter:drop-shadow(0 1px 1.5px rgba(28,25,23,.35))}'
   + '#__ring{position:fixed;z-index:2147483646;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid rgba(28,25,23,.55);opacity:0;pointer-events:none;transform:scale(.4)}'
   + '#__ring.__on{animation:__ring .42s cubic-bezier(.2,0,0,1)}'
   + '@keyframes __ring{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.25)}}'
   + '#__cap{position:fixed;z-index:2147483645;left:16px;bottom:24px;max-width:192px;background:#fffdf8;color:#1c1917;border:1px solid #e2ddd3;'
   +   'border-radius:10px;padding:10px 12px;font:600 14px/1.35 Manrope,system-ui,sans-serif;letter-spacing:-.005em;box-shadow:0 2px 10px rgba(28,25,23,.06);'
   +   'opacity:0;transform:translateY(4px);transition:opacity .28s cubic-bezier(.2,0,0,1),transform .28s cubic-bezier(.2,0,0,1);pointer-events:none}'
   + '#__cap.__on{opacity:1;transform:none}#__cap.__now{transition:none}'
   + '#__cap.__wide{max-width:520px;font-size:17px;padding:12px 16px;left:32px;bottom:32px}'
   + '#__term{position:fixed;inset:0;z-index:2147483640;background:#f7f5ef;display:none;align-items:flex-start;justify-content:center;padding-top:72px}'
   + '#__term.__on{display:flex}'
   + '#__tw{width:880px;max-width:calc(100vw - 80px);background:#fffdf8;border:1px solid #e2ddd3;border-radius:14px;box-shadow:0 14px 44px rgba(28,25,23,.10);overflow:hidden}'
   + '#__tb{height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#f1eee6;border-bottom:1px solid #e2ddd3;color:#79716b;font:500 12px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.02em}'
   + '#__tb i{width:11px;height:11px;border-radius:50%;background:#d6d1c6;display:inline-block}#__tb span{margin-left:10px}'
   + '#__tx{margin:0;padding:18px 22px 22px;height:612px;box-sizing:border-box;color:#1c1917;font:400 15.5px/1.5 "JetBrains Mono",ui-monospace,monospace;white-space:pre;overflow:hidden}'
   + '#__tx .p{color:#c2410c;font-weight:600}#__tx .c{color:#1c1917;font-weight:600}#__tx .k{display:inline-block;width:.6em;height:1.1em;vertical-align:-.15em;background:#1c1917;animation:__blink 1s steps(1) infinite}'
   + '@keyframes __blink{50%{opacity:0}}'
   + (S.css || '');
  function boot(){ if (document.getElementById('__cur')) return;
    var st = document.createElement('style'); st.id = '__recst'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
    var c = document.createElement('div'); c.id = '__cur'; c.innerHTML = '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2 L2 22 L7.2 17.4 L10.6 25.4 L14 23.9 L10.7 16.2 L17.6 16.2 Z" fill="#1c1917" stroke="#fffdf8" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    var g = document.createElement('div'); g.id = '__ring';
    var p = document.createElement('div'); p.id = '__cap';
    var t = document.createElement('div'); t.id = '__term'; t.innerHTML = '<div id="__tw"><div id="__tb"><i></i><i></i><i></i><span id="__tt"></span></div><pre id="__tx"></pre></div>';
    [t, p, g, c].forEach(function(e){ document.documentElement.appendChild(e); });
    window.__cur(S.x == null ? -60 : S.x, S.y == null ? -60 : S.y);
    if (S.hide) c.style.display = 'none';
    if (S.cap) { p.className = '__now __on' + (S.wide ? ' __wide' : ''); p.innerHTML = S.cap; window.__place(); }
  }
  window.__cur = function(x, y){ var c = document.getElementById('__cur'); if (c) c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
  window.__press = function(x, y){ var g = document.getElementById('__ring'); if (!g) return; g.style.left = x + 'px'; g.style.top = y + 'px'; g.className = ''; void g.offsetWidth; g.className = '__on'; };
  // the caption's place: above the rail's foot (the person), in the rail's empty space; with no rail, bottom-left
  window.__place = function(){ var p = document.getElementById('__cap'); if (!p) return; var f = document.querySelector('.rail-foot'), r = document.querySelector('.rail');
    var term = document.getElementById('__term'); var on = term && term.classList.contains('__on');
    if (f && !p.classList.contains('__wide')) { var b = f.getBoundingClientRect(), rr = (r || f).getBoundingClientRect(); window.__capB = innerHeight - b.top + 14; window.__capL = rr.left + 16; window.__capW = Math.max(140, rr.width - 32); p.style.bottom = window.__capB + 'px'; p.style.left = window.__capL + 'px'; p.style.maxWidth = window.__capW + 'px'; }
    else if (!p.classList.contains('__wide')) { p.style.bottom = (window.__capB || 28) + 'px'; p.style.left = (window.__capL || 28) + 'px'; p.style.maxWidth = (window.__capW || 420) + 'px'; } };
  window.__capt = function(t, wide){ var p = document.getElementById('__cap'); if (!p) return; if (!t) { p.className = ''; return; } p.className = wide ? '__wide' : ''; p.innerHTML = t; window.__place(); void p.offsetWidth; p.className = '__on' + (wide ? ' __wide' : ''); };
  window.__term = function(on, title){ var t = document.getElementById('__term'); if (!t) return; t.className = on ? '__on' : ''; if (title != null) document.getElementById('__tt').textContent = title; if (on) document.getElementById('__tx').innerHTML = ''; window.__place(); };
  window.__tline = function(html){ var x = document.getElementById('__tx'); x.insertAdjacentHTML('beforeend', html); var n = x.innerHTML.split('\\n'); if (n.length > 23) x.innerHTML = n.slice(n.length - 23).join('\\n'); };
  window.__tset = function(html){ document.getElementById('__tx').innerHTML = html; };
  if (document.documentElement) boot(); document.addEventListener('DOMContentLoaded', boot);
})();`;

export async function openRecorder({ base, out, view = { w: 1440, h: 810, dpr: 4 / 3 }, fade = 0.5, beatFade = 0.5, quality = 90, log = console.log }) {
  if (!existsSync(CHROME)) throw new Error(`no pinned Chrome for Testing at ${CHROME}`);
  const W = Math.round(view.w * view.dpr), H = Math.round(view.h * view.dpr);
  rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, "f"), { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "walk2-"));
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${view.w},${view.h + 143}`, `--force-device-scale-factor=${view.dpr}`,
    "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  // the browser never outlives the recorder (a take that throws, a test that exits early)
  process.on("exit", () => { try { chrome.kill(); } catch {} });
  const wsUrl = await new Promise((res, rej) => { let b = ""; chrome.stderr.on("data", (d) => { b += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(b); if (m) res(m[1]); }); setTimeout(() => rej(new Error("no devtools")), 15000); });
  const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener("open", r));
  let id = 0, sid = null; const pending = new Map(); const waiters = [];
  const send = (method, params = {}, s = sid) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(s ? { sessionId: s } : {}) })); });
  // ---- the capture: every frame acked at once; the latest kept; a shot's frames written with their own time ----
  let latest = null, seq = 0, cur = null, nframe = 0, prevF = null;
  // now, on the frames' clock: the last frame's time plus the wall time since it arrived
  const clock = () => (prevF ? prevF.ts + (Date.now() / 1000 - prevF.arr) : Date.now() / 1000);
  const shots = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Page.screencastFrame") {
      const p = m.params; send("Page.screencastFrameAck", { sessionId: p.sessionId });
      // a frame's time on our clock: the spacing between two frames is their own timestamps' (exact), unless that clock
      // jumped (a sign-in's redirect moved it by seconds): when the timestamps and the arrivals disagree by more than
      // 0.25 s, the arrival's spacing is taken instead
      const arr = Date.now() / 1000, meta = p.metadata.timestamp;
      let ts;
      if (!prevF) ts = arr;
      else { const dm = meta - prevF.meta, da = arr - prevF.arr; ts = prevF.ts + (Math.abs(dm - da) > 0.25 || dm <= 0 ? Math.max(0.001, da) : dm); }
      prevF = { meta, arr, ts };
      latest = { ts, data: p.data, n: ++seq };
      if (cur) { const f = join("f", `${String(nframe++).padStart(6, "0")}.jpg`); writeFileSync(join(out, f), Buffer.from(p.data, "base64")); cur.frames.push({ ts, f, arr, meta }); }
    }
    for (const w of waiters.slice()) if (w.method === m.method) { waiters.splice(waiters.indexOf(w), 1); w.res(m.params); }
  });
  const once = (method, ms = 15000) => new Promise((res) => { const w = { method, res }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); res(null); } }, ms); });
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" }, null);
  sid = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).result.sessionId;
  for (const d of ["Page", "Network", "Runtime", "Animation"]) await send(`${d}.enable`);
  await send("Emulation.setDeviceMetricsOverride", { width: view.w, height: view.h, deviceScaleFactor: view.dpr, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }] });
  let layerId = (await send("Page.addScriptToEvaluateOnNewDocument", { source: LAYER })).result.identifier;
  await send("Page.startScreencast", { format: "jpeg", quality, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  const js = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  // ---- the state a new document boots with: the pointer, the caption, extra css ----
  let mx = -60, my = -60, capText = "", capWide = false, hidePtr = false, extraCss = "";
  // the next document boots with the pointer where it is and the caption that is on (window.name would not survive a
  // browsing-context swap, which a typed address or a form's redirect can make): the layer's init script is re-registered
  const carry = async () => {
    const st = { x: mx, y: my, cap: capText, wide: capWide, hide: hidePtr, css: extraCss };
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: layerId });
    layerId = (await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__RS=${JSON.stringify(st)};` + LAYER })).result.identifier;
  };
  const frameAfter = async (n0, ms = 1500) => { const t = Date.now(); while ((!latest || latest.n <= n0) && Date.now() - t < ms) await sleep(10); };

  // ---- shots ----
  let beat = null;
  // a shot's start and end are read on the screencast's own clock (its frame timestamps), so a clip lasts what the shot lasted
  async function begin(name) {
    if (cur) await end();
    await sleep(60);
    const now = clock();
    cur = { name, beat, frames: [], start: now };
    // the shot opens on the frame on screen now (the screencast sends a frame only when something changes)
    if (latest) { const f = join("f", `${String(nframe++).padStart(6, "0")}.jpg`); writeFileSync(join(out, f), Buffer.from(latest.data, "base64")); cur.frames.push({ ts: now, f }); }
    await sleep(fade * 1000);
  }
  async function end() {
    if (!cur) return;
    await js("window.__capt('')"); capText = "";
    await sleep(fade * 1000 + 40);
    cur.end = clock();
    cur.frames = cur.frames.filter((x, i) => i === 0 || x.ts > cur.frames[0].ts);
    shots.push(cur); log(`    shot ${cur.name}: ${cur.frames.length} frames, ${(cur.end - cur.start).toFixed(1)} s`); cur = null;
  }
  async function freeze(on) { await send("Animation.setPlaybackRate", { playbackRate: on ? 0 : 1 }); }
  async function load(url) {
    const loaded = once("Page.loadEventFired", 15000);
    await send("Page.navigate", { url });
    await loaded;
    await js("document.fonts ? document.fonts.ready.then(function(){return 1}) : 1");
  }
  const ready = async (sel, ms = 8000) => { if (!sel) return true; const t = Date.now(); while (Date.now() - t < ms) { if (await js(`!!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(80); } log(`    ! never appeared: ${sel}`); return false; };
  // cut(path): a new shot on a page, its open animation played whole after the fade
  // prep(): a step a person took before the shot opens (a zoom to reading size), run on the loaded page before the first frame
  async function cut(path, { name = path, caption, wide = false, settle = 250, waitFor = null, theme = "light", prep = null } = {}) {
    if (cur) await end();
    capText = ""; capWide = wide;
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "no-preference" }] });
    await carry(); await freeze(true);
    const n0 = latest ? latest.n : 0;
    await load(base + path); await ready(waitFor); await sleep(settle);
    if (prep) { await freeze(false); await prep(); await freeze(true); }
    await frameAfter(n0);
    await begin(name);
    await freeze(false);
    if (caption) await cap(caption, wide);
  }
  // nav(fn): a click inside the shot that opens another page: the page changes on camera, its own animation plays
  async function nav(fn, { settle = 400, waitFor = null, caption } = {}) {
    if (caption !== undefined) { capText = caption || ""; capWide = false; }
    await carry();
    const loaded = once("Page.loadEventFired", 15000);
    await fn(); await loaded;
    await js("document.fonts ? document.fonts.ready.then(function(){return 1}) : 1");
    await ready(waitFor); await sleep(settle);
  }
  async function cap(text, wide = false) { capText = text || ""; capWide = wide; await js(`window.__capt(${JSON.stringify(text || "")}, ${wide ? "true" : "false"})`); }
  // ---- the pointer ----
  async function move(x, y, ms = 650) {
    const n = Math.max(8, Math.round(ms / 16)), x0 = mx, y0 = my;
    if (x0 < 0) { mx = x; my = y; await js(`window.__cur(${x},${y})`); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); return; }
    for (let i = 1; i <= n; i++) {
      const e = ease(i / n); mx = x0 + (x - x0) * e; my = y0 + (y - y0) * e;
      await Promise.all([send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my }), js(`window.__cur(${mx.toFixed(1)},${my.toFixed(1)})`)]);
      await sleep(Math.max(1, 16 - 6));
    }
  }
  async function press() {
    await js(`window.__press(${mx},${my})`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: mx, y: my, button: "left", clickCount: 1 }); await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mx, y: my, button: "left", clickCount: 1 });
  }
  async function rectOf(sel, nth = 0) { return js(`(function(){var a=document.querySelectorAll(${JSON.stringify(sel)});var e=a[${nth < 0 ? `a.length${nth}` : nth}];if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,top:r.top,bottom:r.bottom,left:r.left};})()`); }
  async function need(sel, nth = 0) { const r = await rectOf(sel, nth); if (!r || !(r.w > 0 && r.h > 0)) throw new Error(`no ${r ? "visible " : ""}element ${sel}${nth ? ` [${nth}]` : ""} on ${await js("location.pathname+location.search")}`); return r; }
  // the point a person aims at: a little left of the middle of a wide target, the middle of a small one
  const aim = (r, at) => (at === "right" ? { x: r.left + r.w - 22, y: r.y } : { x: r.w > 260 ? r.left + Math.min(r.w * 0.3, 160) : r.x, y: r.y });
  async function hover(sel, { nth = 0, ms = 650, at = null } = {}) { const p = aim(await need(sel, nth), at); await move(p.x, p.y, ms); return p; }
  async function click(sel, { nth = 0, ms = 650, pause = 140, at = null } = {}) { await hover(sel, { nth, ms, at }); await sleep(pause); await press(); }
  async function clickNav(sel, o = {}) { await hover(sel, o); await sleep(o.pause ?? 140); await nav(press, o); }
  // ---- scrolling, eased: the page's own scroll container moved by the page's frame clock (requestAnimationFrame, an ease
  // in and out), which the capture keeps at 60 fps; DevTools wheel events are acked one frame late and halve the rate ----
  const SCROLLER = `function(el){for(var e=el;e&&e!==document.body&&e!==document.documentElement;e=e.parentElement){var s=getComputedStyle(e);if(/(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+4)return e;}return document.scrollingElement;}`;
  async function scrollBy(dy, { ms = 1000, at = null } = {}) {
    const sel = at ? JSON.stringify(at) : "null";
    await js(`new Promise(function(done){var find=${SCROLLER};var a=${sel}?document.querySelector(${sel}):document.elementFromPoint(${Math.round(view.w * 0.6)},${Math.round(view.h * 0.6)});var el=find(a||document.body);
      var y0=el.scrollTop,max=el.scrollHeight-el.clientHeight,dy=Math.max(-y0,Math.min(max-y0,${dy})),t0=null,D=${ms};
      function f(t){if(t0===null)t0=t;var p=Math.min(1,(t-t0)/D),e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;el.scrollTop=y0+dy*e;if(p<1)requestAnimationFrame(f);else done(1);}requestAnimationFrame(f);})`);
    await sleep(120);
  }
  // bring an element into view, eased; it stops `top` px below the window's top
  async function scrollTo(sel, { top = 90, ms = 1000, nth = 0 } = {}) { const r = await need(sel, nth); const dy = r.top - top; if (Math.abs(dy) > 4) await scrollBy(dy, { ms, at: sel }); }
  const wheel = (dy, o = {}) => scrollBy(dy, o);
  async function key(k, mods = 0) {
    const map = { Escape: 27, Enter: 13, ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, " ": 32, Tab: 9 };
    const p = { key: k, code: k === " " ? "Space" : k.length === 1 ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: map[k] || k.toUpperCase().charCodeAt(0), modifiers: mods, text: k.length === 1 ? k : k === "Enter" ? "\r" : undefined };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...p }); await send("Input.dispatchKeyEvent", { type: "keyUp", ...p });
  }
  async function type(text, ms = 55) { for (const ch of text) { await send("Input.insertText", { text: ch }); await sleep(ms); } }
  // ---- the terminal pane ----
  const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  async function terminal(title, { caption } = {}) {
    if (cur) await end();
    capText = caption || ""; capWide = false;
    const n0 = latest ? latest.n : 0;
    await js(`window.__term(true, ${JSON.stringify(title)}); window.__tset('<span class="p">$</span> <span class="k"></span>'); window.__capt(''); document.getElementById('__cur').style.display='none';1`);
    await frameAfter(n0); await sleep(120);
    await begin(`terminal: ${title}`);
    if (caption) await cap(caption);
  }
  let termText = "";
  const TERM_LINES = 24;   // what the window holds: older lines scroll off the top
  const tail = (html) => { const l = html.split("\n"); return l.length > TERM_LINES ? l.slice(l.length - TERM_LINES).join("\n") : html; };
  // run(cmd, exec): the command typed, then run for real; its stdout shown line by line. exec() -> the text it printed.
  async function run(cmd, exec, { typeMs = 38, lineMs = 45, after = 1200 } = {}) {
    await js(`window.__tset(${JSON.stringify(tail(termText + '<span class="p">$</span> <span class="c"></span><span class="k"></span>'))})`);
    for (let i = 1; i <= cmd.length; i++) { await js(`(function(){var c=document.querySelectorAll('#__tx .c');c[c.length-1].textContent=${JSON.stringify(cmd.slice(0, i))};})()`); await sleep(typeMs); }
    await sleep(260);
    const outText = await exec();
    const lines = String(outText).replace(/\s+$/, "").split("\n");
    termText += `<span class="p">$</span> <span class="c">${escH(cmd)}</span>\n`;
    await js(`window.__tset(${JSON.stringify(tail(termText))})`);
    for (const l of lines) { termText += escH(l) + "\n"; await js(`window.__tset(${JSON.stringify(tail(termText))})`); await sleep(lineMs); }
    termText += "\n";
    await js(`window.__tset(${JSON.stringify(tail(termText + '<span class="p">$</span> <span class="k"></span>'))})`);
    await sleep(after);
    return outText;
  }
  async function closeTerminal() {
    if (cur) await end(); termText = ""; const n0 = latest ? latest.n : 0;
    await js("window.__term(false); var c=document.getElementById('__cur'); if(c) c.style.display=''; 1");
    await frameAfter(n0); await sleep(80);
  }
  // ---- the encode: each shot to a constant-rate clip, the clips joined by cross-fades ----
  async function finish({ mp4, fps = 60, crf = 18 }) {
    if (cur) await end();
    await send("Page.stopScreencast");
    ws.close(); chrome.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 500);
    writeFileSync(join(out, "shots.json"), JSON.stringify(shots.map((s) => ({ name: s.name, beat: s.beat, start: s.start, end: s.end, frames: s.frames.map((x) => [x.ts, x.arr, x.meta]) }))));
    const clips = [], stats = [];
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i]; const fr = s.frames;
      let list = "";
      for (let k = 0; k < fr.length; k++) { const next = k + 1 < fr.length ? fr[k + 1].ts : s.end; list += `file '${fr[k].f}'\nduration ${Math.max(0.001, next - fr[k].ts).toFixed(5)}\n`; }
      list += `file '${fr[fr.length - 1].f}'\n`;
      const lf = join(out, `shot-${String(i).padStart(2, "0")}.txt`); writeFileSync(lf, list);
      const clip = join(out, `shot-${String(i).padStart(2, "0")}.mp4`);
      await ff(["-y", "-f", "concat", "-safe", "0", "-i", lf, "-vf", `fps=${fps},scale=${W}:${H}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "8", "-r", String(fps), clip], out);
      // the capture's own rate while the page moved: the intervals between frames under 0.1 s (a still page sends none)
      const iv = []; for (let k = 2; k < fr.length; k++) iv.push(fr[k].ts - fr[k - 1].ts);
      const moving = iv.filter((d) => d > 0 && d < 0.1);
      const med = moving.length ? moving.slice().sort((a, b) => a - b)[Math.floor(moving.length / 2)] : null;
      const long = moving.filter((d) => d > 1.6 / fps).length;
      stats.push({ shot: s.name, beat: s.beat, seconds: +(s.end - s.start).toFixed(2), frames: fr.length, movingFps: med ? +(1 / med).toFixed(1) : null, gapsOver2Frames: long, movingIntervals: moving.length });
      const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]).toString().trim()) || (s.end - s.start);
      clips.push({ clip, dur, beat: s.beat });
    }
    // the join: xfade between consecutive clips (a longer fade where the beat changes)
    const inputs = clips.flatMap((c) => ["-i", c.clip]);
    let graph = "", last = "[0:v]", t = clips[0].dur;
    for (let i = 1; i < clips.length; i++) {
      const d = clips[i].beat !== clips[i - 1].beat ? beatFade : fade;
      const off = Math.max(0, t - d);
      graph += `${last}[${i}:v]xfade=transition=fade:duration=${d}:offset=${off.toFixed(3)}[v${i}];`;
      last = `[v${i}]`; t = off + clips[i].dur;
    }
    const args = ["-y", ...inputs];
    if (clips.length > 1) args.push("-filter_complex", graph.replace(/;$/, ""), "-map", last);
    args.push("-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", mp4);
    await ff(args, out);
    return { shots: stats, seconds: +t.toFixed(2), size: { w: W, h: H } };
  }
  async function ff(args, cwd) { await new Promise((res, rej) => { const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { cwd, stdio: ["ignore", "inherit", "inherit"] }); p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))); }); }

  return {
    W, H, view, base, js, send, sleep, cut, nav, begin, end, cap, move, press, hover, click, clickNav, wheel, scrollBy, scrollTo, key, type, rectOf, need,
    terminal, run, closeTerminal, finish, freeze, load, ready,
    setBeat: (b) => { beat = b; }, pointer: (show) => { hidePtr = !show; return js(`(function(){var c=document.getElementById('__cur');if(c)c.style.display=${show ? "''" : "'none'"};})()`); },
    css: async (text) => { extraCss = text; await js(`(function(){var s=document.getElementById('__recst');if(s&&!s.textContent.endsWith(${JSON.stringify(text)}))s.textContent+=${JSON.stringify(text)};})()`); },
    get shots() { return shots; }, get pos() { return { x: mx, y: my }; },
  };
}
