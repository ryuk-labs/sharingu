// tools/fixtures/mapdom.mjs — runs the Map's client (src/mapclient.js MAP_CLIENT, the kit and the client exactly as the page
// ships them) inside a small fake DOM, offline: every element the client looks up by id exists, everything else answers
// with a quiet stand-in, and every fetch is recorded. Enough to prove the client boots without a throw over a real layout,
// pins a node, polls the lights and applies a moved light (tools/map-selftest.mjs, tools/integrity-selftest.mjs F12). The
// Screens view's client (src/atlasclient.js ATLAS_CLIENT) runs in the same DOM with its own ids (ATLAS_IDS, runAtlas).
import vm from "node:vm";

function classList() { const s = new Set(); return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }, contains: (c) => s.has(c), _s: s }; }
function element(id, attrs = {}) {
  const l = {};
  const e = {
    id, attrs: { ...attrs }, style: { setProperty() {}, removeProperty() {} }, classList: classList(), innerHTML: "", textContent: "", hidden: false, open: false, value: "", clientWidth: 900, clientHeight: 620,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
    addEventListener(t, f) { (l[t] ||= []).push(f); }, removeEventListener() {}, dispatch(t, ev) { for (const f of l[t] || []) f(ev); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, matches() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 620, right: 900, bottom: 620 }; },
    focus() {}, select() {}, scrollIntoView() {}, setPointerCapture() {}, releasePointerCapture() {}, get firstElementChild() { return null; },
    _listeners: l,
  };
  return e;
}
const IDS = ["mx", "mx-data", "mx-stage", "mx-svg", "mx-world", "mx-units", "mx-links", "mx-hl", "mx-fl", "mx-heads", "mx-headbg", "mx-insp", "mx-q", "mx-qn", "mx-zl", "mx-live", "mx-mini", "mx-listwrap", "mx-flowbar", "mx-mv"];
export const ATLAS_IDS = ["mx", "ax-data", "ax-stage", "ax-world", "ax-eh", "ax-lab", "mx-insp", "ax-q", "ax-qn", "ax-zl", "ax-live", "ax-mini", "ax-view", "ax-state"];

// runClient(client, data, { search, phone, respond, ids, dataId, attrs, resize }) -> { els, fetches, errors, window, document, tick, resize }
export function runClient(client, data, { search = "", phone = false, respond, ids = IDS, dataId = "mx-data", attrs = {}, resize = false } = {}) {
  const els = Object.fromEntries(ids.map((id) => [id, element(id, attrs[id] || {})]));
  els[dataId].textContent = JSON.stringify(data);
  const fetches = [], errors = [], timers = [];
  const docListeners = {};
  const document = {
    documentElement: element("html"), visibilityState: "visible",
    getElementById: (id) => els[id] || null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); }, _listeners: docListeners,
  };
  document.documentElement.classList.add("u-motion");
  const winListeners = {};
  const window = {
    matchMedia: () => ({ matches: phone, addEventListener() {} }), addEventListener: (t, f) => { (winListeners[t] ||= []).push(f); }, _listeners: winListeners,
    fetch: (url, init) => { fetches.push({ url: String(url), init }); const body = respond ? respond(String(url)) : null; return Promise.resolve({ ok: true, status: 200, text: async () => (typeof body === "string" ? body : "<div class=\"mx-node\"></div>"), json: async () => body || { at: "", lights: [] } }); },
  };
  const ctx = {
    window, document, location: { pathname: "/map", search }, history: { replaceState: (a, b, u) => { ctx.location.search = String(u).includes("?") ? "?" + String(u).split("?")[1] : ""; } },
    URLSearchParams, JSON, Math, Date, Number, String, Object, Array, Set, Map, isFinite, parseInt, parseFloat, console,
    performance: { now: () => Date.now() }, requestAnimationFrame: (f) => { timers.push(f); return timers.length; }, cancelAnimationFrame: () => {},
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, setInterval: (f) => { timers.push(f); return timers.length; }, clearInterval: () => {},
    fetch: window.fetch, navigator: { onLine: true },
  };
  ctx.window.location = ctx.location;
  // opts.resize (sprint 5, A2): a ResizeObserver the test drives — resize() calls every observer, as a fold of the rail or
  // the panel resizing the stage would. Off by default, so every other run boots exactly as before (no observer).
  const observers = [];
  if (resize) { ctx.ResizeObserver = window.ResizeObserver = function (cb) { this.observe = () => observers.push(cb); this.disconnect = () => {}; }; }
  vm.createContext(ctx);
  try { vm.runInContext(client, ctx, { timeout: 5000 }); } catch (e) { errors.push(e); }
  // tick(): run the timers and frames queued so far once (a settle, a scheduled level of detail), errors kept
  const tick = () => { const due = timers.splice(0); for (const f of due) { try { f(Date.now()); } catch (e) { errors.push(e); } } };
  return { els, fetches, errors, window, document, ctx, tick, resize: () => { for (const cb of observers) { try { cb([]); } catch (e) { errors.push(e); } } }, flush: async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); } };
}
// runAtlas(client, data, opts) -> the Screens view's client in the same DOM (its own ids, the root a Screens view)
export const runAtlas = (client, data, opts = {}) => runClient(client, data, { ...opts, ids: ATLAS_IDS, dataId: "ax-data", attrs: { mx: { "data-view": "screens" } } });
// a click on the board over frame i (as the Screens view's delegated handler reads it)
export function clickFrame(run, i) {
  const frame = { getAttribute: (k) => (k === "data-i" ? String(i) : null) };
  const target = { closest: (sel) => (/\.ax-f\b/.test(sel) && !/ax-view/.test(sel) ? frame : null) };
  run.els["ax-stage"].dispatch("click", { target, preventDefault() {}, button: 0 });
}
// a click on the stage over node i (as the client's delegated handler reads it)
export function clickNode(run, i) {
  const node = { getAttribute: (k) => (k === "data-i" ? String(i) : null) };
  const target = { closest: (sel) => (/\.mx-n\b/.test(sel) ? node : null) };
  run.els["mx-stage"].dispatch("click", { target, preventDefault() {}, button: 0 });
}
