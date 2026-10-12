// src/mapclient.js — the Map's client (the main tab, sprint 2): the ONE script the page carries, no library, no dependency.
// The server draws the whole first paint (src/mappage.js: the SVG in a viewBox the browser fits by itself, so nothing moves
// when this script arrives); this script adopts that drawing and enhances it:
//   · pan and zoom (drag, wheel, trackpad and touch pinch, the zoom buttons, Fit, + - 0), a minimap, level of detail (far
//     out, nodes are dots with their light and no labels), the column headers held at the top at every zoom;
//   · hover lights a node's own links and neighbours and dims the rest; a click (or Enter) pins it and fills the inspector
//     from GET /map/node (the ONE inspector renderer, src/mapnode.js renderInspector, swapped in without a reload);
//     arrow keys move between what is drawn, Enter opens, Esc unpins;
//   · a folded group opens on click, on Enter, when a find, a pin or a flow reaches into it, or when zoomed in on;
//   · a column folds to one cluster from its head (M5), kept for the person (src/parts.js foldKit, window.SGFOLD); a pin or a
//     flow reaching into it opens it for the visit; a fold of the rail or the panel (the shell's 'sharingu:fold') fits once;
//   · find dims what does not match and Enter pins the first hit; the light filter dims a light (never hides it);
//   · a flow is chosen from the inspector and played step by step, its path lit across the canvas;
//   · live lights: GET /map/lights?since= (one indexed statement) on focus and every 30 s while the tab is visible; a node
//     whose light moved changes its dot with the motion system's ping (html.u-motion only); a node that turns STALE (sprint 3,
//     B4: a check was graded before its last change) takes the hollow amber ring and pings once, never more;
//   · ?impact=<id> (sprint 3, B4): the contribution's touched nodes solid, the ones one hop out light, the rest dimmed.
// At phone width the canvas is a sideways strip (native scroll) and the node list is the main surface.
// The drawing itself is src/maplayout.js mapKit(), embedded by its own source (mapKit.toString()), so a redraw here and
// the server's first paint are the same code. The view's machinery (pan, zoom, pinch, wheel, fit, eased moves, the
// minimap, the inspector's fetch) is viewKit() below, embedded the same way and shared with the Screens view
// (src/atlasclient.js): ONE copy of it in the product.
import { mapKit } from "./maplayout.js";
import { ORG_PATH_CLIENT } from "./orgpath.js";   // sprint 7, 7.4: the client builds its URLs under the org (its own orgPath)

export const strip = (src) => src.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");

// viewKit() -> { make(o) }: the view over a world drawn inside a stage, SELF-CONTAINED (embedded by toString in both the
// Map's and the Screens view's script). make(o) -> V, where o names the page's parts and hooks:
//   stage, rect() its client rect, size() -> {w, h}, bounds() -> the drawing's box in world units (a pan never leaves it),
//   min/max zoom, motion (eased moves on), phone() (native scroll: the
//   kit stands aside), apply(v) (the page puts the view on its world), settle() (a move ended: the page may load what is
//   in view), moving(on) (a gesture runs: the page may lighten itself), hover(e | null), skip(e) (a press the kit leaves
//   alone), zoomed(was, s, px, py) (after a zoom about a point)
//   V: { v: the view {s, tx, ty} (one object, mutated in place), set(view, smooth), zoomAt(px, py, f), fit(box, top),
//        center(box, smooth, minS), clamp(s), moved(reset?), miniDraw(el, box, svg), miniView(el, box), miniBind(el),
//        inspect(el, url, pre, after) (the inspector's HTML from GET /map/node, a newer pin wins), cancel() }
export function viewKit() {
  function make(o) {
    var v = { s: 1, tx: 0, ty: 0 }, anim = 0, idle = 0, stage = o.stage, KEEP = 160, STEP = 28;
    // keepIn(): the view never leaves the drawing (o.bounds: its box in world units): at least KEEP px of it (a third of a small
    // stage) stays in view on each axis
    function keepIn() {
      if (!o.bounds) return; var b = o.bounds(), z = o.size(), kx = Math.min(KEEP, z.w / 3), ky = Math.min(KEEP, z.h / 3);
      v.tx = Math.min(Math.max(v.tx, kx - (b.x + b.w) * v.s), z.w - kx - b.x * v.s);
      v.ty = Math.min(Math.max(v.ty, ky - (b.y + b.h) * v.s), z.h - ky - b.y * v.s);
    }
    var clamp = function (s) { return Math.max(o.min || 0.12, Math.min(o.max || 2.6, s)); };
    // fillIn(n) (o.fill, D2b item 5): a view larger than the stage on an axis never shows empty room past the drawing's edge on
    // that axis (a frame near a corner, centred, left a large empty area): the edge is held at the stage's edge (o.pad in);
    // a drawing smaller than the stage on an axis is centred on it. The pointed frame, inside the drawing, stays in view.
    function fillIn(n) {
      if (!o.fill || !o.bounds) return n; var b = o.bounds(), z = o.size(), p = o.pad || 0;
      var ax = function (t, b0, bw, zw) { var w = bw * n.s; if (w + 2 * p <= zw) return (zw - w) / 2 - b0 * n.s; return Math.min(p - b0 * n.s, Math.max(zw - p - (b0 + bw) * n.s, t)); };
      n.tx = ax(n.tx, b.x, b.w, z.w); n.ty = ax(n.ty, b.y, b.h, z.h); return n;
    }
    var apply = function () { o.apply(v); };
    var settle = function () { if (o.settle) o.settle(); };
    // a gesture's moves come in bursts: the page hears "moving" at once and "settled" once it stops
    function moving() { if (o.moving) o.moving(true); clearTimeout(idle); idle = setTimeout(function () { if (o.moving) o.moving(false); settle(); }, 140); }
    function set(n, smooth) {
      cancelAnimationFrame(anim);
      if (!smooth || !o.motion) { v.s = n.s; v.tx = n.tx; v.ty = n.ty; apply(); settle(); return; }
      var a = { s: v.s, tx: v.tx, ty: v.ty }, t0 = performance.now();
      (function step(t) { var p = Math.min(1, (t - t0) / 220), e = 1 - Math.pow(1 - p, 3); v.s = a.s + (n.s - a.s) * e; v.tx = a.tx + (n.tx - a.tx) * e; v.ty = a.ty + (n.ty - a.ty) * e; apply(); if (p < 1) anim = requestAnimationFrame(step); else settle(); })(t0);
    }
    function zoomAt(px, py, f) { var was = v.s, s = clamp(v.s * f), k = s / v.s; v.tx = px - (px - v.tx) * k; v.ty = py - (py - v.ty) * k; v.s = s; fillIn(v); apply(); moving(); if (o.zoomed) o.zoomed(was, s, px, py); }
    // fit(b, top): the view that shows the box b whole (centred; top: held at the top), never clamped
    function fit(b, top) { var z = o.size(), p = o.pad || 0, s = Math.min((z.w - 2 * p) / b.w, (z.h - 2 * p) / b.h); if (o.fitMax) s = Math.min(s, o.fitMax); return { s: s, tx: (z.w - b.w * s) / 2 - b.x * s, ty: top ? p - b.y * s : (z.h - b.h * s) / 2 - b.y * s }; }
    function center(b, smooth, minS) { var z = o.size(), s = Math.max(v.s, minS || 0); set(fillIn({ s: s, tx: z.w / 2 - (b.x + b.w / 2) * s, ty: z.h / 2 - (b.y + b.h / 2) * s }), smooth); }
    // ---- pointer: drag pans, two fingers pinch, the wheel pans (ctrl or cmd: zooms), a move without a press hovers ----
    var pts = {}, drag = null, moved = 0, pinch = null, dragC = o.dragClass || "mx-drag";
    stage.addEventListener("pointerdown", function (e) {
      if (o.phone() || e.button > 0 || (o.skip && o.skip(e))) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = 0;
      var ids = Object.keys(pts);
      if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: v.s }; drag = null; }
      else drag = { x: e.clientX, y: e.clientY, id: e.pointerId, cap: 0 };
    });
    stage.addEventListener("pointermove", function (e) {
      if (o.phone()) return;
      if (pts[e.pointerId]) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pts);
        if (pinch && ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]], r = o.rect(), d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, clamp(pinch.s * d / pinch.d) / v.s); moved += 9; return; }
        if (drag) { var dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy); if (moved > 4) { if (!drag.cap) { drag.cap = 1; try { stage.setPointerCapture(drag.id); } catch (err) {} } stage.classList.add(dragC); v.tx += dx; v.ty += dy; keepIn(); apply(); moving(); } drag.x = e.clientX; drag.y = e.clientY; return; }
      }
      if (o.hover) o.hover(e);
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) pinch = null; if (!Object.keys(pts).length) { drag = null; stage.classList.remove(dragC); } }
    stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
    stage.addEventListener("pointerleave", function () { if (o.hover) o.hover(null); });
    // the wheel, the same on the Map and the Screens view (sprint 3 B4, found while recording: measured in Chrome, a mouse notch
    // with ctrl zoomed 2.2x, so two notches hit the cap, and a plain wheel on a board fitted whole panned it out of view): a
    // plain wheel or a two-finger scroll pans, never past the drawing (keepIn: at least KEEP px of it stays in view); ctrl or
    // cmd (a trackpad pinch sends ctrl) zooms about the pointer, a step at most STEP of deltaY (a mouse notch is 1.25x, a pinch
    // as before); a wheel in lines (Firefox) counts 33 px a line
    stage.addEventListener("wheel", function (e) {
      if (o.phone() || (o.skip && o.skip(e))) return; e.preventDefault(); var r = o.rect(), k = e.deltaMode === 1 ? 33 : 1, dy = e.deltaY * k, dx = e.deltaX * k;
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.pow(0.992, Math.max(-STEP, Math.min(STEP, dy))));
      else { v.tx -= dx; v.ty -= dy; keepIn(); apply(); moving(); }
    }, { passive: false });
    // ---- the minimap: the page's own SVG (world units) under the view's rectangle; a press or a drag moves the view ----
    var mk = 1, mo = { x: 0, y: 0 };
    function miniDraw(el, b, inner) {
      if (!el) return; var w = el.clientWidth || 168, h = el.clientHeight || 108; mk = Math.min(w / b.w, h / b.h); mo = { x: (w - b.w * mk) / 2 - b.x * mk, y: -b.y * mk };
      el.innerHTML = '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '"><g transform="translate(' + mo.x.toFixed(1) + " " + mo.y.toFixed(1) + ") scale(" + mk.toFixed(5) + ')">' + inner + '</g><rect class="mx-mv" x="0" y="0" width="0" height="0" rx="3"/></svg>';
      miniView(el, b);
    }
    // the minimap only when the drawing is bigger than the view (at fit it would show nothing new)
    function miniView(el, b) {
      var r = el && el.querySelector(".mx-mv"); if (!r) return; var w = el.clientWidth || 168, h = el.clientHeight || 108, z = o.size();
      var vx0 = -v.tx / v.s, vy0 = -v.ty / v.s, vx1 = vx0 + z.w / v.s, vy1 = vy0 + z.h / v.s;
      el.classList.toggle("mx-mini-off", vx0 <= b.x + 4 && vy0 <= b.y + 4 && vx1 >= b.x + b.w - 4 && vy1 >= b.y + b.h - 4);
      r.setAttribute("x", Math.max(0, vx0 * mk + mo.x).toFixed(1)); r.setAttribute("y", Math.max(0, vy0 * mk + mo.y).toFixed(1));
      r.setAttribute("width", Math.max(4, Math.min(w, z.w / v.s * mk)).toFixed(1)); r.setAttribute("height", Math.max(4, Math.min(h, z.h / v.s * mk)).toFixed(1));
    }
    function miniBind(el) {
      if (!el) return;
      el.addEventListener("pointerdown", function (e) {
        var rect = el.getBoundingClientRect(), z = o.size();
        var go = function (ev) { var wx = (ev.clientX - rect.left - mo.x) / mk, wy = (ev.clientY - rect.top - mo.y) / mk; v.tx = z.w / 2 - wx * v.s; v.ty = z.h / 2 - wy * v.s; apply(); moving(); };
        go(e); try { el.setPointerCapture(e.pointerId); } catch (err) {}
        var mv = function (ev) { go(ev); }, done = function () { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", done); };
        el.addEventListener("pointermove", mv); el.addEventListener("pointerup", done); e.preventDefault(); e.stopPropagation();
      });
    }
    // ---- the inspector: GET /map/node's HTML (the ONE renderer, src/mapnode.js), a newer request wins ----
    var seq = 0, X = '<div class="mx-ih"><button type="button" class="mx-x" data-button="unpin" data-client="closes the inspector (Esc)" aria-label="Close">&times;</button></div>';
    function inspect(el, url, pre, after) {
      if (!el) return; var my = ++seq, tail = function (ok) { return after ? after(ok) : ""; };
      el.classList.add("is-node"); el.setAttribute("aria-busy", "true");
      if (pre) el.innerHTML = X + pre;
      fetch(url, { headers: { accept: "text/html" }, credentials: "same-origin" }).then(function (r) { return r.text().then(function (t) { return { ok: r.ok, t: t }; }); }).then(function (x) {
        if (my !== seq) return; el.removeAttribute("aria-busy");
        el.innerHTML = X + (x.ok ? x.t : '<p class="mx-note">This node could not be read. Try again in a moment.</p>') + tail(x.ok);
      }).catch(function () { if (my !== seq) return; el.removeAttribute("aria-busy"); el.innerHTML = X + '<p class="mx-note">The worker could not be reached. Try again in a moment.</p>' + tail(false); });
    }
    return { v: v, set: set, zoomAt: zoomAt, fit: fit, center: center, clamp: clamp, moved: function (r) { if (r === 0) moved = 0; return moved; },
      miniDraw: miniDraw, miniView: miniView, miniBind: miniBind, inspect: inspect, cancel: function () { seq++; } };
  }
  return { make: make };
}

const CLIENT = strip(`
(function(){
  var root=document.getElementById('mx');if(!root)return;
  var dataEl=document.getElementById('mx-data');if(!dataEl)return;
  var D;try{D=JSON.parse(dataEl.textContent);}catch(e){return;}
  var L=D.L,K=MAPKIT();
  var $=function(id){return document.getElementById(id);};
  var stage=$('mx-stage'),svg=$('mx-svg'),world=$('mx-world'),gU=$('mx-units'),gL=$('mx-links'),gH=$('mx-hl'),gF=$('mx-fl'),heads=$('mx-heads');
  var insp=$('mx-insp'),q=$('mx-q'),zl=$('mx-zl'),live=$('mx-live'),mini=$('mx-mini'),listWrap=$('mx-listwrap');
  var M=document.documentElement.classList.contains('u-motion');
  var phone=window.matchMedia?window.matchMedia('(max-width:760px)'):{matches:false};
  var S={open:D.open||{},on:D.on||{},pin:D.pin==null?-1:D.pin,dim:{},q:'',hits:null,flow:-1,step:0,play:0,focus:null,imp:D.imp||null,shut:{}};
  // M5: the columns this person keeps folded on this project (only the columns this map has)
  var FD=window.SGFOLD&&window.SGFOLD.kit?window.SGFOLD:null;
  if(FD){var kept=FD.kit.shutOf(FD.kit.read(FD.key),'cols',L.p);L.cols.forEach(function(c){if(kept[c.k])S.shut[c.k]=1;});}
  var ovt=document.getElementById('mx-ovt'),overview=ovt?ovt.innerHTML:(insp?insp.innerHTML:'');
  // the view (src/mapclient.js viewKit, shared with the Screens view): pan, zoom, pinch, wheel, eased moves, the minimap
  var hovered=-1;
  var V=VIEWKIT().make({stage:stage,rect:function(){return svg.getBoundingClientRect();},size:function(){return stageSize();},bounds:function(){return box();},min:0.12,max:2.6,fitMax:1.2,motion:M,
    phone:function(){return phone.matches;},apply:function(){apply();},skip:function(e){return !!(e.target&&e.target.closest&&e.target.closest('.mx-mini'));},
    zoomed:function(was,s,px,py){if(was<1.3&&s>=1.3)openNear(px,py);},
    hover:function(e){var el=e&&e.target&&e.target.closest?e.target.closest('.mx-n'):null,ni=el?+el.getAttribute('data-i'):-1;if(ni!==hovered){hovered=ni;if(ni>=0)light(ni);else light(S.pin);}}});
  var view=V.v;
  // ---- the model's indexes ----
  var byRef={},adj=[],i;
  for(i=0;i<L.nodes.length;i++){byRef[L.nodes[i].r]=i;adj.push([]);}
  for(i=0;i<L.links.length;i+=3){adj[L.links[i]].push(L.links[i+1]);adj[L.links[i+1]].push(L.links[i]);}
  var refIndex=function(r){if(!r)return -1;r=String(r).replace(/^door:/,'api:');return byRef[r]==null?-1:byRef[r];};
  var params=function(){try{return new URLSearchParams(location.search);}catch(e){return null;}};
  var setParam=function(k,v){var p=params();if(!p)return;if(v==null||v==='')p.delete(k);else p.set(k,v);var s=p.toString();try{history.replaceState(null,'',location.pathname+(s?'?'+s:''));}catch(e){}};
  var say=function(t){if(live)live.textContent=t;};
  // ---- geometry: the view over the world ----
  function stageSize(){return{w:svg.clientWidth||stage.clientWidth||800,h:svg.clientHeight||stage.clientHeight||500};}
  function box(){var x0=L.X-24,w=L.W-L.X+48,h=L.H+24,vw=Math.max(w,D.minW),vh=Math.max(h,D.minH);return{x:x0-(vw-w)/2,y:0,w:vw,h:vh};}
  // L4: the view opens fitted to what is DRAWN (the columns of the layers that are on), so a view of one layer (Data) is never
  // a near-empty canvas with its column in a corner; with nothing on, the whole drawing
  function contentBox(){
    var x0=Infinity,x1=-Infinity,y1=-Infinity;
    for(var g=0;g<L.groups.length;g++){var G=L.groups[g],c=L.cols[G.c];if(!c||!S.on[c.layer])continue;var gx=c.x+(G.dx||0);x0=Math.min(x0,gx);x1=Math.max(x1,gx+c.w);y1=Math.max(y1,G.y+G.h);}
    if(!(x1>x0))return box();
    var w=x1-x0+48,h=y1+24,vw=Math.max(w,Math.min(D.minW,w*1.6)),vh=Math.max(h,D.minH*0.6);return{x:x0-24-(vw-w)/2,y:0,w:vw,h:vh};
  }
  function fitView(){return V.fit(contentBox(),true);}
  function setView(v,smooth){V.set(v,smooth);}
  function apply(){
    if(phone.matches)return;
    world.setAttribute('transform','translate('+view.tx.toFixed(1)+' '+view.ty.toFixed(1)+') scale('+view.s.toFixed(4)+')');
    stage.classList.toggle('mx-far',view.s<0.5);
    if(zl)zl.textContent=Math.round(view.s*100)+'%';
    placeHeads();miniView();
  }
  // the column headers stay at the top at every zoom: their world y and size follow the view
  function placeHeads(){
    if(!heads)return;var s=view.s,y=(14-view.ty)/s,z=stageSize(),bg=document.getElementById('mx-headbg');
    if(bg){bg.setAttribute('x',((-view.tx)/s).toFixed(1));bg.setAttribute('y',((-view.ty)/s).toFixed(1));bg.setAttribute('width',(z.w/s).toFixed(1));bg.setAttribute('height',(26/s).toFixed(1));}
    [].forEach.call(heads.querySelectorAll('[data-col]'),function(h){var c=L.cols[+h.getAttribute('data-col')],x=c.x,sx=c.x*s+view.tx;
      // a column scrolled partly off the left keeps its header in view
      if(sx<10&&(c.x+c.w)*s+view.tx>90)x=(10-view.tx)/s;
      // and a header wider than its column on screen (the heads keep their size at every zoom) never runs under the side
      // panel: one reaching past the stage's right edge ends at it, while its column is in view
      var hit=h.querySelector('.mx-colhit'),hw=hit?+hit.getAttribute('width')-6:0;
      if(sx<z.w-10&&x*s+view.tx+hw>z.w-10)x=Math.max((10-view.tx)/s,(z.w-10-hw-view.tx)/s);
      h.setAttribute('transform','translate('+x.toFixed(1)+' '+y.toFixed(1)+') scale('+(1/s).toFixed(4)+')');h.style.display=S.on[c.layer]?'':'none';});
  }
  function zoomAt(px,py,f){V.zoomAt(px,py,f);}
  // the keys and the zoom buttons zoom on the pinned node when it shows, else on the middle of the drawing in view
  // (never on empty stage, so a zoom in on a short map lands on its groups and opens the nearest one)
  function zoomMid(f){
    var z=stageSize(),px=z.w/2,py=z.h/2,b;
    if(S.pin>=0&&inView(S.pin)){b=K.box(L,S.pin);px=(b.x+b.w/2)*view.s+view.tx;py=(b.y+b.h/2)*view.s+view.ty;}
    else{var x0=Math.max(0,L.X*view.s+view.tx),x1=Math.min(z.w,L.W*view.s+view.tx),y0=Math.max(30,view.ty+30*view.s),y1=Math.min(z.h,L.H*view.s+view.ty);
      if(x1>x0)px=(x0+x1)/2;if(y1>y0)py=(y0+y1)/2;}
    zoomAt(px,py,f);
  }
  // zoomed in past 130%: the folded group nearest the point among those in view opens (the one under it when there is one)
  function openNear(px,py){
    var z=stageSize(),s=view.s,wx=(px-view.tx)/s,wy=(py-view.ty)/s,best=-1,bd=Infinity;
    var vx0=-view.tx/s,vy0=-view.ty/s,vx1=(z.w-view.tx)/s,vy1=(z.h-view.ty)/s;
    for(var g=0;g<L.groups.length;g++){var G=L.groups[g],c=L.cols[G.c];if(G.op||G.sh||!S.on[c.layer])continue;
      var gx=c.x+(G.dx||0);if(gx>vx1||gx+c.w<vx0||G.y>vy1||G.y+G.h<vy0)continue;
      var dx=Math.max(gx-wx,0,wx-gx-c.w),dy=Math.max(G.y-wy,0,wy-G.y-G.h),d=Math.hypot(dx,dy);
      if(d<bd){bd=d;best=g;}}
    if(best>=0)toggleGroup(best,true);
  }
  function centerOn(u,smooth,minS){V.center(K.box(L,u),smooth,minS);}
  function inView(u){var b=K.box(L,u),z=stageSize();var x=b.x*view.s+view.tx,y=b.y*view.s+view.ty;return x>0&&y>30&&x+b.w*view.s<z.w&&y+b.h*view.s<z.h;}
  // ---- drawing ----
  function redraw(){
    S.narrow=phone.matches;K.stack(L,S);
    gU.innerHTML=K.units(L,S);gL.innerHTML=K.links(L,S);
    if(phone.matches)stripSize();
    if(heads)[].forEach.call(heads.querySelectorAll('[data-col]'),function(h){h.classList.toggle('mx-shut',!!S.shut[L.cols[+h.getAttribute('data-col')].k]);});
    marks();miniDraw();placeHeads();
  }
  function unitEl(u){return u>=0?gU.querySelector('[data-i="'+u+'"]'):gU.querySelector('.mx-c[data-g="'+(-1-u)+'"]');}
  // marks(): the classes find, the filter, the flow, the pin and the hover set on what is drawn
  function marks(){
    stage.classList.toggle('mx-finding',!!S.hits);
    ['green','amber','red','grey','stale'].forEach(function(l){stage.classList.toggle('mx-dim-'+l,!!S.dim[l]);});
    stage.classList.toggle('mx-impact',!!S.imp);
    [].forEach.call(gU.querySelectorAll('.mx-u'),function(el){
      var gi=el.getAttribute('data-g'),ni=el.getAttribute('data-i'),ci=el.getAttribute('data-col'),hit=false;
      if(S.hits){if(ni!=null)hit=!!S.hits.n[ni];else if(ci!=null)hit=L.cols[+ci].g.some(function(x){return !!S.hits.g[x];});else if(gi!=null)hit=!!S.hits.g[gi];}
      el.classList.toggle('mx-hit',hit);
      el.classList.toggle('mx-pin',ni!=null&&+ni===S.pin);
    });
    if(S.flow>=0)flowMarks();
    if(S.pin>=0)light(S.pin,true);else{gH.innerHTML='';stage.classList.remove('mx-hov');}
  }
  // light(i): node i's links and neighbours lit, the rest dimmed (hover, or the pin when nothing is hovered)
  function light(i,keep){
    [].forEach.call(gU.querySelectorAll('.mx-on'),function(e){e.classList.remove('mx-on');});
    if(i<0){gH.innerHTML='';stage.classList.remove('mx-hov');return;}
    var h=K.hl(L,S,i,adj);gH.innerHTML=h.svg;stage.classList.add('mx-hov');
    var me=unitEl(K.unitOf(L,i));if(me)me.classList.add('mx-on');
    h.nb.forEach(function(u){var e=unitEl(u);if(e)e.classList.add('mx-on');});
  }
  // ---- groups ----
  function toggleGroup(g,open){
    var G=L.groups[g];if(G&&G.sh){toggleCol(G.c);return;}if(!G||!G.fold)return;
    var o=open==null?!G.op:open;
    if(o)S.open[G.id]=1;else delete S.open[G.id];
    // the group keeps its place (only what is below it moves), so the reader's eye stays on it
    redraw();
    say(G.label+(o?' opened, ':' folded, ')+G.m.length+' nodes');
  }
  function openFor(i){var G=L.groups[L.nodes[i].g],m=false;if(G.sh){delete S.shut[L.cols[G.c].k];m=true;}if(G.fold&&!S.open[G.id]){S.open[G.id]=1;m=true;}return m;}
  // M5: a column folded to one cluster, or open again; kept for the person on this project (the view stays where it is)
  function toggleCol(ci){
    var c=L.cols[ci];if(!c)return;var was=!!S.shut[c.k];if(was)delete S.shut[c.k];else S.shut[c.k]=1;
    if(FD)FD.kit.write(FD.key,FD.kit.shut(FD.kit.read(FD.key),'cols',L.p,c.k,!was));
    redraw();say(c.label+(was?' opened, ':' folded, ')+c.n+' nodes');
  }
  function ensureLayer(i){var c=L.cols[L.groups[L.nodes[i].g].c];if(!S.on[c.layer]){S.on[c.layer]=1;syncLayers();return true;}return false;}
  // ---- the inspector ----
  function esc(s){return K.esc(s);}
  function nodeQuery(ref){var p=params(),pr=p&&p.get('project');return orgPath('/map/node?ref=')+encodeURIComponent(ref)+(pr?'&project='+encodeURIComponent(pr):'');}
  function loadInspector(qs,label){V.inspect(insp,qs,label?'<div class="mx-pre"><p class="mx-k">'+esc(label.k)+'</p><h3 class="mx-title">'+esc(label.t)+'</h3><p class="mx-note">Reading it from the project\\u2019s model.</p></div>':'');}
  function pin(i,o){
    o=o||{};if(i<0)return;
    var moved=ensureLayer(i)|openFor(i);
    S.pin=i;if(moved)redraw();else marks();
    var n=L.nodes[i];setParam('node',n.r);setParam('gap',null);
    loadInspector(nodeQuery(n.r),{k:D.kinds[n.t]||n.t,t:n.n});
    if(!phone.matches&&(o.center||!inView(K.unitOf(L,i))))centerOn(K.unitOf(L,i),true,o.center?0.9:0);
    say('Pinned '+(D.kinds[n.t]||n.t)+' '+n.n);
  }
  function unpin(){
    V.cancel();S.pin=-1;setParam('node',null);setParam('gap',null);
    if(insp){insp.classList.remove('is-node');insp.innerHTML=S.flow>=0?flowPanel():overview;}
    marks();
  }
  // ---- find ----
  function find(v){
    S.q=v;var w=String(v||'').toLowerCase().split(/\\s+/).filter(Boolean);
    if(!w.length){var had=!!S.hits;S.hits=null;if(had)gU.innerHTML=K.units(L,S);marks();setParam('find',null);var o0=$('mx-qn');if(o0)o0.textContent='';return;}
    var n={},g={},first=-1,c=0;
    for(var k=0;k<L.nodes.length;k++){var N=L.nodes[k],t=(N.n+' '+N.r).toLowerCase();if(!S.on[L.cols[L.groups[N.g].c].layer])continue;
      if(w.every(function(x){return t.indexOf(x)>=0;})){n[k]=1;g[N.g]=(g[N.g]||0)+1;c++;if(first<0)first=k;}}
    S.hits={n:n,g:g,first:first,c:c};gU.innerHTML=K.units(L,S);marks();setParam('find',v);
    say(c?c+' node'+(c===1?'':'s')+' match. Enter pins the first.':'Nothing on the map matches.');
    var out=$('mx-qn');if(out)out.textContent=c?String(c):'0';
  }
  // ---- flows ----
  function flowUnits(f){var us=[];f.st.forEach(function(s){var n=s[0]>=0?s[0]:s[1];us.push(n>=0?K.unitOf(L,n):null);});return us;}
  function pickFlow(fi){
    var f=L.flows[fi];if(!f)return;
    S.flow=fi;S.step=0;stopPlay();
    if(!S.on.flows){S.on.flows=1;syncLayers();}
    f.st.forEach(function(s){if(s[0]>=0){ensureLayer(s[0]);openFor(s[0]);}if(s[1]>=0){ensureLayer(s[1]);openFor(s[1]);}});
    redraw();setParam('flow',f.id);
    if(insp){insp.classList.add('is-node');insp.innerHTML=flowPanel();}
    var bar=$('mx-flowbar');if(bar){bar.hidden=false;var nm=bar.querySelector('[data-flow-name]');if(nm)nm.title='Play '+f.n;}
    goStep(0,false);
  }
  function flowMarks(){
    var f=L.flows[S.flow];if(!f)return;var us=flowUnits(f),on={},d=[];
    stage.classList.add('mx-flowing');
    for(var k=0;k<us.length;k++){if(us[k]==null)continue;on[us[k]]=1;var p=null;for(var j=k-1;j>=0;j--)if(us[j]!=null){p=us[j];break;}if(p!=null&&p!==us[k])d.push('<path class="mx-l mx-lf" d="'+K.path(K.box(L,p),K.box(L,us[k]))+'"/>');}
    // each lit node of the path carries its step's number (the first step that reaches it), left of its row
    var seenU={};for(var q2=0;q2<us.length;q2++){var u2=us[q2];if(u2==null||seenU[u2])continue;seenU[u2]=1;var bb=K.box(L,u2);d.push('<g class="mx-fnum'+(q2===S.step?' mx-fnow':'')+'" transform="translate('+(bb.x-13)+' '+(bb.y+bb.h/2)+')"><circle r="8.5"/><text y="3.8" text-anchor="middle">'+(q2+1)+'</text></g>');}
    gF.innerHTML=d.join('');
    [].forEach.call(gU.querySelectorAll('.mx-u'),function(el){var ni=el.getAttribute('data-i'),gi=el.getAttribute('data-g'),u=ni!=null?+ni:(gi!=null&&el.classList.contains('mx-c')?-1-(+gi):null);el.classList.toggle('mx-fp',u!=null&&!!on[u]);el.classList.toggle('mx-fcur',u!=null&&u===us[S.step]);});
  }
  // L4: a step is shown READABLE: the view frames the lit step with the steps either side of it at 75% or closer (the whole
  // journey at a zoom where every label is gone read as dots), else the lit step alone at 75%
  var STEP_S=0.75;
  function frameStep(us,k){
    var x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,n=0;
    [k-1,k,k+1].forEach(function(j){var u=us[j];if(u==null)return;var b=K.box(L,u);x0=Math.min(x0,b.x-24);y0=Math.min(y0,b.y-40);x1=Math.max(x1,b.x+b.w+60);y1=Math.max(y1,b.y+b.h+24);n++;});
    if(!n)return;var z=stageSize(),s=Math.min(1,z.w/(x1-x0),z.h/(y1-y0));
    if(s<STEP_S){centerOn(us[k],true,STEP_S);return;}
    setView({s:s,tx:(z.w-(x1-x0)*s)/2-x0*s,ty:(z.h-(y1-y0)*s)/2-y0*s},true);
  }
  function goStep(k,center){
    var f=L.flows[S.flow];if(!f)return;S.step=Math.max(0,Math.min(f.st.length-1,k));
    flowMarks();
    var us=flowUnits(f),cur=us[S.step];
    if(cur!=null&&!phone.matches)frameStep(us,S.step);
    if(insp&&insp.querySelector('[data-flow-panel]'))insp.innerHTML=flowPanel();
    var s=f.st[S.step];if(!s){say(f.n+' names no step yet.');return;}say('Step '+(S.step+1)+' of '+f.st.length+(s[2]?', '+s[2]:'')+': '+s[3]);
    if(cur!=null){var el=unitEl(cur);if(el&&M){el.classList.remove('mx-ping');void el.getBoundingClientRect();el.classList.add('mx-ping');}}
  }
  function playLabels(){[].forEach.call(document.querySelectorAll('.mx-flowbar [data-button="play-flow"]'),function(b){b.setAttribute('aria-pressed',S.play?'true':'false');b.textContent=S.play?'Pause':'Play flow';});}
  function stopPlay(){if(S.play){clearInterval(S.play);S.play=0;}playLabels();}
  function togglePlay(){
    if(S.play){stopPlay();if(insp&&insp.querySelector('[data-flow-panel]'))insp.innerHTML=flowPanel();return;}
    var f=L.flows[S.flow];if(!f)return;if(S.step>=f.st.length-1)S.step=-1;
    S.play=setInterval(function(){if(S.step>=f.st.length-1){stopPlay();if(insp&&insp.querySelector('[data-flow-panel]'))insp.innerHTML=flowPanel();return;}goStep(S.step+1);},M?1500:2200);
    goStep(S.step+1);playLabels();
    if(insp&&insp.querySelector('[data-flow-panel]'))insp.innerHTML=flowPanel();
  }
  function closeFlow(){stopPlay();S.flow=-1;gF.innerHTML='';stage.classList.remove('mx-flowing');[].forEach.call(gU.querySelectorAll('.mx-fp,.mx-fcur'),function(e){e.classList.remove('mx-fp','mx-fcur');});
    setParam('flow',null);var bar=$('mx-flowbar');if(bar)bar.hidden=true;if(insp&&S.pin<0){insp.classList.remove('is-node');insp.innerHTML=overview;}}
  function flowPanel(){
    var f=L.flows[S.flow];if(!f)return overview;var s=f.st[S.step]||[-1,-1,'','',''],nm=function(n){return typeof n==='number'&&n>=0&&L.nodes[n]?L.nodes[n].n:'';};
    var steps=f.st.map(function(x,k){return '<li'+(k===S.step?' aria-current="step"':'')+'><button type="button" class="mx-stp" data-button="flow-step" data-client="shows this step of the flow" data-step="'+k+'"><b>'+(k+1)+'</b><span>'+esc(K.cut(x[3]||nm(x[0])||nm(x[1]),60,1))+'</span></button></li>';}).join('');
    return '<div class="mx-flow" data-flow-panel="'+esc(f.id)+'"><div class="mx-ih"><button type="button" class="mx-x" data-button="close-flow" data-client="stops following the flow (Esc)" aria-label="Close the flow">&times;</button></div>'+
      '<p class="mx-k">Flow'+(f.a?' \\u00b7 '+esc(f.a):'')+'</p><h3 class="mx-title">'+esc(f.n)+'</h3>'+
      // R1: a flow with stale checks regrades from here (a form: the first press answers the plan, its confirm files)
      (f.z?'<p class="mx-stale" data-stale="'+f.z+'"><span class="u-tag needs">stale</span> '+f.z+' '+(f.z===1?'check':'checks')+'</p><form method="POST" action="'+orgPath('/regrade')+'" class="mx-acts">'+
        [['project',L.p],['flow',f.id],['next',orgPath('/map?flow=')+encodeURIComponent(f.id)+'&project='+encodeURIComponent(L.p)]].map(function(h){return '<input type="hidden" name="'+h[0]+'" value="'+esc(h[1])+'">';}).join('')+
        '<button type="submit" class="mx-b mx-b-go" data-button="regrade" data-door="POST /regrade">Regrade</button></form>':'')+(f.d?(f.d.length>160?'<details class="mx-clamp"><summary><span class="mx-what">'+esc(f.d)+'</span><span class="mx-more" aria-hidden="true"></span></summary></details>':'<p class="mx-what">'+esc(f.d)+'</p>'):'')+
      '<div class="mx-play"><button type="button" class="mx-b" data-button="flow-prev" data-client="the step before" aria-label="The step before"'+(S.step<=0?' disabled':'')+'>&lsaquo;</button>'+
      '<button type="button" class="mx-b mx-b-go" data-button="play-flow" data-client="plays the flow step by step" aria-pressed="'+(S.play?'true':'false')+'">'+(S.play?'Pause':'Play flow')+'</button>'+
      '<button type="button" class="mx-b" data-button="flow-next" data-client="the next step" aria-label="The next step"'+(S.step>=f.st.length-1?' disabled':'')+'>&rsaquo;</button><span class="mx-stepn">'+(S.step+1)+' of '+f.st.length+'</span></div>'+
      '<div class="mx-stepcard" aria-live="polite"><p class="mx-k">Step '+(S.step+1)+(s[2]?' \\u00b7 '+esc(s[2]):'')+'</p><p class="mx-steptext">'+esc(s[3])+'</p>'+(s[4]?'<p class="mx-note">'+esc(s[4])+'</p>':'')+
      (s[0]>=0?'<p class="mx-at">Screen <a href="#" data-button="select-node" data-client="pins this screen" data-i="'+s[0]+'">'+esc(nm(s[0]))+'</a></p>':'')+(s[1]>=0?'<p class="mx-at">Door <a href="#" data-button="select-node" data-client="pins this door" data-i="'+s[1]+'">'+esc(nm(s[1]))+'</a></p>':'')+
      (s[0]<0&&s[1]<0?'<p class="mx-note">'+(f.st.length?'Not on the canvas':'No step yet')+'</p>':'')+'</div><ol class="mx-steps">'+steps+'</ol></div>';
  }
  // ---- layers and the light filter ----
  function syncLayers(){[].forEach.call(document.querySelectorAll('[data-button="layer-toggle"]'),function(b){b.setAttribute('aria-pressed',S.on[b.getAttribute('data-layer')]?'true':'false');});
    setParam('layer',Object.keys(S.on).filter(function(k){return S.on[k];}).join(','));}
  function toggleLayer(k){if(S.on[k])delete S.on[k];else S.on[k]=1;if(k==='flows'&&!S.on.flows)closeFlow();syncLayers();redraw();if(S.hits)find(S.q);say((S.on[k]?'Showing ':'Hiding ')+k);}
  // ---- the minimap (the kit draws it under the view's rectangle and moves the view on a press) ----
  function miniDraw(){
    if(!mini)return;var out=[];
    for(var g=0;g<L.groups.length;g++){var G=L.groups[g],c=L.cols[G.c];if(!S.on[c.layer])continue;var lc=G.lc,dom=lc[2]?'red':lc[1]?'amber':lc[0]?'green':'grey';out.push('<rect class="mx-mr" data-light="'+dom+'" x="'+(c.x+(G.dx||0))+'" y="'+G.y+'" width="'+c.w+'" height="'+Math.max(8,G.h)+'" rx="6"/>');}
    V.miniDraw(mini,box(),out.join(''));
  }
  function miniView(){V.miniView(mini,box());}
  V.miniBind(mini);
  // ---- the phone strip ----
  // a phone: the canvas is a strip at a fixed, readable scale, scrolled natively (sideways first); the list is the page
  // L4: the phone's strip opens on two WHOLE columns (the third starts at the window's edge), so no column header is cut at rest
  function stripScale(b){var cs=L.cols.filter(function(c){return S.on[c.layer];}).sort(function(a,c){return a.x-c.x;}),vw=stage.clientWidth||358;
    var end=cs.length>2?cs[2].x-12:b.x+b.w;return Math.max(0.4,Math.min(0.75,vw/Math.max(1,end-b.x)));}
  function stripSize(){var b={x:L.X-16,y:0,w:L.W-L.X+32,h:L.H+16},s=stripScale(b);svg.setAttribute('viewBox',b.x+' '+b.y+' '+b.w+' '+b.h);svg.style.width=Math.ceil(b.w*s)+'px';svg.style.height=Math.ceil(b.h*s)+'px';world.removeAttribute('transform');
    if(heads)[].forEach.call(heads.querySelectorAll('[data-col]'),function(hh){var c=L.cols[+hh.getAttribute('data-col')];hh.setAttribute('transform','translate('+c.x+' 14) scale('+(1/s).toFixed(3)+')');hh.style.display=S.on[c.layer]?'':'none';});}
  // ---- pointer: the kit pans, pinches and hovers; a click pins ----
  stage.addEventListener('click',function(e){
    if(V.moved()>4){V.moved(0);return;}
    var t=e.target&&e.target.closest?e.target:null;if(!t)return;
    var hd=t.closest('.mx-colh');if(hd){toggleCol(+hd.getAttribute('data-col'));return;}
    var n=t.closest('.mx-n');if(n){var i2=+n.getAttribute('data-i');if(i2===S.pin&&!phone.matches){unpin();return;}pin(i2);return;}
    var g=t.closest('.mx-c,.mx-fold');if(g){var gi=+g.getAttribute('data-g');if(L.groups[gi]&&L.groups[gi].sh){toggleCol(L.groups[gi].c);return;}if(phone.matches){var d=document.querySelector('.mx-lg[data-g="'+gi+'"]');if(d){d.open=true;d.scrollIntoView({block:'start',behavior:M?'smooth':'auto'});return;}}toggleGroup(gi);}
  });
  // ---- the keyboard: arrows move between what is drawn, Enter opens, Esc unpins ----
  function drawnUnits(){var out=[];for(var c=0;c<L.cols.length;c++){var col=L.cols[c];if(!S.on[col.layer])continue;if(L.groups[col.g[0]].sh){out.push([-1-col.g[0]]);continue;}var list=[];for(var j=0;j<col.g.length;j++){var G=L.groups[col.g[j]];if(!G.op)list.push(-1-col.g[j]);else for(var k=0;k<G.m.length;k++)list.push(G.m[k]);}if(list.length)out.push(list);}return out;}
  function focusUnit(u){
    S.focus=u;[].forEach.call(gU.querySelectorAll('.mx-focus'),function(e){e.classList.remove('mx-focus');});
    var el=unitEl(u);if(el)el.classList.add('mx-focus');
    if(u>=0)light(u);else light(S.pin);
    if(!inView(u))centerOn(u,true);
    if(u>=0){var n=L.nodes[u];say((D.kinds[n.t]||n.t)+' '+n.n+', '+(D.lightWord[n.l]||n.l)+', '+adj[u].length+' links. Enter pins it.');}
    else{var G=L.groups[-1-u],C=L.cols[G.c];say(G.sh?'Column '+C.label+', '+C.n+' nodes, folded. Enter opens it.':'Group '+G.label+', '+G.m.length+' nodes, folded. Enter opens it.');}
  }
  function moveFocus(dir){
    var cols=drawnUnits();if(!cols.length)return;
    var u=S.focus;var ci=-1,ri=-1;
    for(var c=0;c<cols.length;c++){var r=cols[c].indexOf(u);if(r>=0){ci=c;ri=r;break;}}
    if(ci<0){focusUnit(S.pin>=0?K.unitOf(L,S.pin):cols[0][0]);return;}
    if(dir==='up')ri=Math.max(0,ri-1);else if(dir==='down')ri=Math.min(cols[ci].length-1,ri+1);
    else{var from=K.box(L,u),nc=dir==='left'?ci-1:ci+1;if(nc<0||nc>=cols.length)return;
      var best=0,bd=Infinity;cols[nc].forEach(function(x,k){var b=K.box(L,x),d=Math.abs(b.y+b.h/2-from.y-from.h/2);if(d<bd){bd=d;best=k;}});ci=nc;ri=best;}
    focusUnit(cols[ci][ri]);
  }
  stage.addEventListener('keydown',function(e){
    var k=e.key;
    if(k==='ArrowUp'||k==='ArrowDown'||k==='ArrowLeft'||k==='ArrowRight'){e.preventDefault();moveFocus(k.slice(5).toLowerCase());return;}
    if(k==='Enter'||k===' '){if(S.focus==null)return;e.preventDefault();if(S.focus>=0)pin(S.focus);else{var g=-1-S.focus;toggleGroup(g,true);focusUnit(K.unitOf(L,L.groups[g].m[0]));}return;}
    if(k==='+'||k==='='){zoomMid(1.25);return;}
    if(k==='-'||k==='_'){zoomMid(0.8);return;}
    if(k==='0'){setView(fitView(),true);return;}
  });
  document.addEventListener('keydown',function(e){
    var tg=e.target,tn=tg&&tg.tagName;if(tn==='INPUT'||tn==='TEXTAREA'||tn==='SELECT'||e.metaKey||e.ctrlKey||e.altKey)return;
    if((e.key==='f'||e.key==='F')&&q){e.preventDefault();q.focus();q.select();return;}
    if(e.key==='Escape'){var pal=document.getElementById('pal');if(pal&&!pal.hidden)return;if(S.flow>=0){closeFlow();return;}if(S.pin>=0){unpin();stage.focus();return;}}
  });
  if(q){
    var qt=0;q.addEventListener('input',function(){clearTimeout(qt);qt=setTimeout(function(){find(q.value);},90);});
    q.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();find(q.value);if(S.hits&&S.hits.first>=0){var list=Object.keys(S.hits.n).map(Number);var at=S.pin>=0?list.indexOf(S.pin):-1;pin(list[(at+1)%list.length],{center:true});}}
      else if(e.key==='Escape'){e.preventDefault();q.value='';find('');stage.focus();}
    });
  }
  // ---- the buttons (the toolbar, the inspector, the list) ----
  root.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target:null;if(!t)return;
    var la=t.closest('.mx-list a[data-i]');if(la&&!e.metaKey&&!e.ctrlKey){e.preventDefault();pin(+la.getAttribute('data-i'),{center:true});if(phone.matches&&insp)insp.scrollIntoView({block:'nearest'});return;}
    var b=t.closest('[data-button]');if(!b||b.disabled)return;var k=b.getAttribute('data-button');
    if(k==='layer-toggle'){toggleLayer(b.getAttribute('data-layer'));return;}
    if(k==='state-toggle'){var l=b.getAttribute('data-show');S.dim[l]=!S.dim[l];b.setAttribute('aria-pressed',S.dim[l]?'false':'true');marks();return;}
    if(k==='zoom'){zoomMid(b.getAttribute('data-dir')==='in'?1.25:0.8);return;}
    if(k==='fit'){setView(fitView(),true);return;}
    if(k==='unpin'){unpin();return;}
    if(k==='flow-pick'){e.preventDefault();pickFlow(+b.getAttribute('data-flow'));return;}
    if(k==='play-flow'){if(S.flow<0&&L.flows.length)pickFlow(0);else togglePlay();return;}
    if(k==='flow-prev'){stopPlay();goStep(S.step-1);return;}
    if(k==='flow-next'){stopPlay();goStep(S.step+1);return;}
    if(k==='flow-step'){stopPlay();goStep(+b.getAttribute('data-step'),true);return;}
    if(k==='close-flow'){closeFlow();return;}
    if(k==='group-toggle'){e.preventDefault();toggleGroup(+b.getAttribute('data-g'));return;}
    if(k==='select-node'||k==='walk-gaps'){
      var di=b.getAttribute('data-i'),ref=b.getAttribute('data-ref'),gap=b.getAttribute('data-gap');
      if(di!=null){e.preventDefault();pin(+di,{center:true});if(phone.matches&&insp)insp.scrollIntoView({block:'nearest'});return;}
      if(ref){var ix=refIndex(ref);e.preventDefault();if(ix>=0){pin(ix,{center:true});return;}S.pin=-1;marks();setParam('node',ref);loadInspector(nodeQuery(ref),{k:'Node',t:ref});return;}
      if(gap){e.preventDefault();S.pin=-1;marks();setParam('gap',gap);setParam('node',null);var p=params(),pr=p&&p.get('project');loadInspector(orgPath('/map/node?gap=')+encodeURIComponent(gap)+(pr?'&project='+encodeURIComponent(pr):''),{k:'Gap',t:'Open gap '+gap});return;}
    }
  });
  // ---- live lights ----
  var since=D.since||'',lastPoll=0;
  function recount(){var c={green:0,amber:0,red:0,grey:0,stale:0};L.nodes.forEach(function(n){c[n.l]=(c[n.l]||0)+1;if(n.z)c.stale++;});
    ['green','amber','red','grey','stale'].forEach(function(l){var b=document.querySelector('[data-button="state-toggle"][data-show="'+l+'"] b');if(b&&b.textContent!==String(c[l])){b.textContent=String(c[l]);var w=b.parentNode;if(M&&w){w.classList.remove('u-pulse');void w.offsetWidth;w.classList.add('u-pulse');}}});}
  function poll(){
    if(document.visibilityState!=='visible'||Date.now()-lastPoll<5000||!window.fetch)return;lastPoll=Date.now();
    var p=params(),pr=p&&p.get('project');
    fetch(orgPath('/map/lights?since=')+encodeURIComponent(since)+(pr?'&project='+encodeURIComponent(pr):''),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}})
      .then(function(r){return r.ok?r.json():null;}).then(function(x){
        if(!x||!x.lights)return;if(x.at)since=x.at;var moved=[],turned=[];
        var idx=function(id){for(var k=0;k<L.nodes.length;k++)if((L.nodes[k].id||L.nodes[k].r)===id)return k;return -1;};
        x.lights.forEach(function(l){var ix=idx(l.id);if(ix<0||L.nodes[ix].l===l.light)return;L.nodes[ix].l=l.light;moved.push(ix);});
        // a stale mark that moved (sprint 3, B4): a node that turns stale pulses once; a regrade clears it
        (x.stale||[]).forEach(function(z){var ix=idx(z.id);if(ix<0)return;var was=L.nodes[ix].z||0,now=z.stale||0;if(was===now)return;if(now)L.nodes[ix].z=now;else delete L.nodes[ix].z;if(!was&&now)turned.push(ix);if(moved.indexOf(ix)<0)moved.push(ix);});
        if(!moved.length)return;
        L.groups.forEach(function(G){G.lc=[0,0,0,0];G.m.forEach(function(n){G.lc[{green:0,amber:1,red:2,grey:3}[L.nodes[n].l]]++;});});
        redraw();recount();
        moved.forEach(function(ix){var el=unitEl(K.unitOf(L,ix));if(el&&M){el.classList.remove('mx-ping');void el.getBoundingClientRect();el.classList.add('mx-ping');}});
        say(moved.length+' light'+(moved.length===1?'':'s')+' changed: '+moved.slice(0,3).map(function(ix){return L.nodes[ix].n+' is '+(D.lightWord[L.nodes[ix].l]||L.nodes[ix].l)+(L.nodes[ix].z?', stale':'');}).join('; ')+(turned.length?'. '+turned.length+' turned stale: regrade '+(turned.length===1?'it':'them')+'.':''));
      }).catch(function(){});
  }
  window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);setInterval(poll,30000);
  // ---- boot: adopt the server's drawing (drawn again first when the person keeps a column folded) ----
  S.narrow=phone.matches;K.stack(L,S);
  function boot(){
    if(Object.keys(S.shut).length)redraw();
    if(phone.matches){stage.classList.add('mx-strip');stripSize();if(listWrap)listWrap.open=true;stage.scrollLeft=0;}
    else{stage.classList.remove('mx-strip');svg.style.width='';svg.style.height='';var z=stageSize();svg.setAttribute('viewBox','0 0 '+z.w+' '+z.h);
      // L4: a small drawing (one layer of a few groups: the Data view) opens its groups, so the view is never a few folded
      // boxes on an empty canvas; a big one stays folded
      var vis=L.groups.filter(function(G){return S.on[L.cols[G.c].layer];}),nn=vis.reduce(function(a,G){return a+G.m.length;},0);
      if(vis.length&&vis.length<=6&&nn<=80&&vis.some(function(G){return G.fold&&!S.open[G.id];})){vis.forEach(function(G){if(G.fold)S.open[G.id]=1;});redraw();}
      setView(fitView());svg.removeAttribute('preserveAspectRatio');apply();}
    miniDraw();
  }
  boot();
  if(phone.addEventListener)phone.addEventListener('change',function(){redraw();boot();});
  var lastZ=stageSize();
  // M1: the rail or the panel folded or opened (src/shell.js): the stage changed size, so the drawing fits it once
  window.addEventListener('sharingu:fold',function(){if(phone.matches)return;var z=stageSize();lastZ=z;svg.setAttribute('viewBox','0 0 '+z.w+' '+z.h);setView(fitView(),true);miniDraw();});
  if(window.ResizeObserver)new ResizeObserver(function(){if(phone.matches)return;var z=stageSize();if(Math.abs(z.w-lastZ.w)<1&&Math.abs(z.h-lastZ.h)<1)return;view.tx+=(z.w-lastZ.w)/2;view.ty+=0;lastZ=z;svg.setAttribute('viewBox','0 0 '+z.w+' '+z.h);apply();miniDraw();}).observe(stage);
  if(S.pin>=0){light(S.pin);if(!phone.matches&&!inView(K.unitOf(L,S.pin)))centerOn(K.unitOf(L,S.pin),false,0.9);}
  var pq=params();
  if(pq&&pq.get('find')&&q){q.value=pq.get('find');find(q.value);}
  if(D.flow!=null&&D.flow>=0)pickFlow(D.flow);
  root.classList.add('mx-ready');
})();
`);

// MAP_CLIENT: the page's script (mappage.js puts it after the SVG): the kits' own sources (the view's, then the drawing's),
// then the client. __name is esbuild's keepNames helper (wrangler bundles with it); a kit's source may carry calls to it,
// so it is defined here too. VIEW_KIT is shared with the Screens view's script (src/atlasclient.js).
export const VIEW_KIT = `var __name=function(t){return t;};var VIEWKIT=${strip(viewKit.toString())};`;
export const MAP_CLIENT = `${ORG_PATH_CLIENT}${VIEW_KIT}var MAPKIT=${mapKit.toString()};\n${CLIENT}`;
