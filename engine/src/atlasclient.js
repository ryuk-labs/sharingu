// src/atlasclient.js — the Screens view's client (the Map's atlas, sprint 2): the ONE script that page carries, no library.
// The server draws every frame placed and sized (src/atlaspage.js), outlines only, so nothing moves when this arrives; this
// script adopts the board:
//   · the view: src/mapclient.js viewKit (the Map's own pan, zoom, pinch, wheel, fit, eased moves and minimap), the world a
//     CSS transform (transform only, will-change only while a gesture runs), the dot grid following it;
//   · what a frame shows, by zoom (atlasKit lod): far out its outline in its light (no network); closer its wireframe as
//     inline SVG drawn by src/wireframe.js wireframeSvg (the screen's grammar, or its wireframe render's, fetched once), or
//     its picture when its render is an image (an <img>, at most 2 x LIVE of them); close its real render for the chosen state (atlasKit show: that state, else another state's, else the wireframe,
//     else nothing, its corner saying which):
//     an <iframe sandbox> (no script, no same origin) of GET /render/<hash> scaled to the frame, or an <img>. Only frames in
//     or near the view load, the nearest LIVE first; a frame zoomed out of its render hides it, a frame far away releases
//     it (at most KEEP hidden ones are kept); a body is immutable, so the browser's cache answers a second mount;
//   · hover lights a frame's transitions, their labels, and dims the rest; a click pins it: the Map's inspector (GET
//     /map/node) with this screen's states and renders under it; a click on the pinned frame, Enter again or Open full
//     size opens the viewer: the render at 1:1 (fitted when it cannot be), its states and variants as pills, previous
//     and next along its lane (arrow keys), Esc closes;
//   · keys (arrows along the lane and across the lanes, Enter, Esc, + - 0, F), find (dims the rest, Enter pins the next
//     hit), the light filter, the state switch and Render / Wireframe (the URL keeps them), the live lights.
// At phone width the lanes are rows scrolled sideways; the frames in view load (IntersectionObserver); a tap opens the
// viewer, which is the page.
import { atlasKit } from "./atlaslayout.js";
import { VIEW_KIT, strip } from "./mapclient.js";
import { wireframeSvg } from "./wireframe.js";
import { ORG_PATH_CLIENT } from "./orgpath.js";   // sprint 7, 7.4: the client builds its URLs under the org (its own orgPath)

const CLIENT = strip(`
(function(){
  var root=document.getElementById('mx');if(!root||root.getAttribute('data-view')!=='screens')return;
  var dataEl=document.getElementById('ax-data');if(!dataEl)return;
  var D;try{D=JSON.parse(dataEl.textContent);}catch(e){return;}
  var A=D.A,K=ATLASKIT(),draw=WIREFRAME;
  var $=function(id){return document.getElementById(id);};
  var stage=$('ax-stage'),world=$('ax-world'),gH=$('ax-eh'),lab=$('ax-lab'),insp=$('mx-insp'),q=$('ax-q'),qn=$('ax-qn'),zl=$('ax-zl'),live=$('ax-live'),mini=$('ax-mini'),viewer=$('ax-view'),sel=$('ax-state');
  if(!stage||!world)return;
  var M=document.documentElement.classList.contains('u-motion');
  var phone=window.matchMedia?window.matchMedia('(max-width:760px)'):{matches:false};
  var S={si:A.si,mode:A.mode,pin:D.pin==null?-1:D.pin,hits:null,q:'',dim:{},focus:-1,hover:-1,view:-1,vs:-1,vv:0};
  if(D.imp)stage.classList.add('ax-impact');
  var ovt=$('ax-ovt'),overview=ovt?ovt.innerHTML:(insp?insp.innerHTML:'');
  var N=A.f.length,els=[],devs=[],tags=[],k0;
  [].forEach.call(world.querySelectorAll('.ax-f'),function(el){var k=+el.getAttribute('data-i');els[k]=el;devs[k]=el.querySelector('.ax-dev');tags[k]=el.querySelector('.ax-tag');});
  // each frame's transitions out and in (an edge q is A.e[3q] -> A.e[3q+1], its label A.el[A.e[3q+2]])
  var outE=[],inE=[];for(k0=0;k0<N;k0++){outE.push([]);inE.push([]);}
  for(k0=0;k0<A.e.length;k0+=3){outE[A.e[k0]].push(k0/3);inE[A.e[k0+1]].push(k0/3);}
  var params=function(){try{return new URLSearchParams(location.search);}catch(e){return null;}};
  var setParam=function(k,v){var p=params();if(!p)return;if(v==null||v==='')p.delete(k);else p.set(k,v);var s=p.toString();try{history.replaceState(null,'',location.pathname+(s?'?'+s:''));}catch(e){}};
  var say=function(t){if(live)live.textContent=t;};
  var esc=K.esc,pq=params(),proj=(pq&&pq.get('project'))||A.p;
  // a body's URL names its style's hash too (src/render.js renderUrl), so the browser keeps it for good and never asks twice
  var renderUrl=function(h,si){var st=si!=null&&si>=0?A.sty[si]:'';return orgPath('/render/')+encodeURIComponent(h)+'?project='+encodeURIComponent(proj)+(st?'&style='+encodeURIComponent(st):'');};
  // ---- the view (the Map's kit) ----
  var V=VIEWKIT().make({stage:stage,rect:function(){return stage.getBoundingClientRect();},size:size,bounds:box,min:0.04,max:2.4,motion:M,pad:28,fill:true,
    phone:function(){return phone.matches;},apply:apply,settle:function(){if(Math.abs(view.s*lastK-1)>0.0005)setK();schedule();},moving:function(on){busy=!!on;stage.classList.toggle('ax-busy',busy);},
    skip:function(e){return !!(e.target&&e.target.closest&&e.target.closest('.ax-view,.mx-mini'));},hover:onHover});
  var view=V.v,lastS=-1,lastK=1,busy=false,NEAR=150/A.dev.fw;
  function setK(){lastK=1/view.s;world.style.setProperty('--k',lastK.toFixed(4));}
  function size(){return{w:stage.clientWidth||900,h:stage.clientHeight||600};}
  function box(){return{x:0,y:0,w:A.W,h:A.H};}
  var fitted=null;function fitBoard(smooth){var f=V.fit(box());fitted={s:f.s,tx:f.tx,ty:f.ty};V.set(f,smooth);}
  function apply(){
    if(phone.matches)return;
    world.style.transform='translate('+view.tx.toFixed(1)+'px,'+view.ty.toFixed(1)+'px) scale('+view.s.toFixed(4)+')';
    if(view.s!==lastS){lastS=view.s;var l=K.lod(A.dev.fw*view.s);stage.classList.toggle('ax-far',l===0);stage.classList.toggle('ax-mid',l===1);
      // D2b item 5: the gap between two lanes on screen too short for a lane's label above its frames' captions (it printed over
      // the frames above at fit): the label takes the captions' row, as when far out
      stage.classList.toggle('ax-tight',l>0&&(A.gy||158)*view.s<44);if(zl)zl.textContent=Math.round(view.s*100)+'%';
      // the labels keep their size on screen (--k); while a gesture runs they follow it within 8% (a restyle of every label is
      // the costly part of a zoom frame), and settle exactly when it ends
      if(!busy||Math.abs(view.s*lastK-1)>0.08)setK();}
    // the dot grid follows the board, never denser than one dot every 14 px
    var sp=24*view.s;while(sp<14)sp*=2;stage.style.backgroundSize=sp.toFixed(1)+'px '+sp.toFixed(1)+'px';stage.style.backgroundPosition=view.tx.toFixed(1)+'px '+view.ty.toFixed(1)+'px';
    V.miniView(mini,box());miniUnder();
  }
  // D6a: the minimap never covers a frame's caption: while one sits under it, it gives way (no pointer, not drawn)
  function miniUnder(){if(!mini)return;var mr=mini.getBoundingClientRect(),sr=stage.getBoundingClientRect();if(!mr.width)return;var x0=mr.left-sr.left,y0=mr.top-sr.top,x1=x0+mr.width,y1=y0+mr.height,u=false;
    for(var q=0;q<N&&!u;q++){var f=A.f[q],lx=f.x*view.s+view.tx,ly=f.y*view.s+view.ty;if(lx<x1&&lx+A.dev.fw*view.s>x0&&ly-30<y1&&ly>y0)u=true;}
    mini.classList.toggle('ax-mini-under',u);}
  function inView(k){var f=A.f[k],z=size(),x=f.x*view.s+view.tx,y=f.y*view.s+view.ty;return x>0&&y>0&&x+A.dev.fw*view.s<z.w&&y+A.dev.fh*view.s<z.h;}
  // the keys and the buttons zoom about the pinned frame when it shows, else the frame nearest the middle (never empty board)
  function zoomMid(f){var t=S.pin>=0&&inView(S.pin)?S.pin:S.focus>=0&&inView(S.focus)?S.focus:nearest();if(t<0)return;var b=K.box(A,t);V.zoomAt((b.x+b.w/2)*view.s+view.tx,(b.y+b.h/2)*view.s+view.ty,f);}
  // ---- what each frame shows (the level of detail) ----
  var LIVE=24,KEEP=48,tick=0,raf=0,F=[],G={};
  for(k0=0;k0<N;k0++)F.push({lv:-1,el:null,h:'',want:'',svg:null,wk:'',t:0});
  function schedule(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;lod();});}
  function lod(){
    if(phone.matches)return;
    tick++;var P=K.plan(A,view,size(),LIVE,S.si,S.mode);
    P.out.forEach(release);P.near.forEach(function(o){fill(o.k,P.lv,o.may);});
    trim();
  }
  // wireOf(f, sh) -> what the wireframe level draws: the grammar (inline) or a wireframe render's (fetched once), else null
  function wireOf(f,sh){
    if(sh.k==='wire')return sh.spec?{spec:sh.spec,key:'g'}:{h:sh.h,key:sh.h};
    if(f.w)return{spec:f.w,key:'g'};
    // a wireframe render's grammar: this state's (each screen's own first when none is chosen), else any
    var want=S.si>=0?S.si:f.st[0],any=null;
    for(var j=0;j<f.rs.length;j++)if(f.rs[j][2]==='wireframe'){if(f.rs[j][0]===want)return{h:f.rs[j][3],key:f.rs[j][3]};if(!any)any=f.rs[j];}
    return any?{h:any[3],key:any[3]}:null;
  }
  // fill(k, lv, may) -> 1 when the frame now holds a live render: lv 0 the outline, 1 the wireframe, 2 what show() says (a
  // render only while may: the nearest LIVE frames)
  function fill(k,lv,may){
    var f=A.f[k],P=F[k],sh=K.show(A,f,S.si,S.mode),out=0;P.t=tick;
    // a render on its way keeps the wireframe under it until it has loaded (no blank frame)
    // L4: a picture on its way shows the frame's named plate (drawn by the server under every frame) until it lands
    if(may&&((lv===2&&(sh.k==='html'||sh.k==='image'))||(lv>=1&&sh.k==='image'))){mountR(k,sh);hideW(k);out=1;}
    else{hideR(k);var w=lv>=1?wireOf(f,sh):null;if(w)drawW(k,w);else hideW(k);}
    var tag=lv>=1?sh.tag:'';if(tags[k]&&tags[k].textContent!==tag)tags[k].textContent=tag;
    P.lv=lv;return out;
  }
  // the documents are created a few a frame, nearest first, so a settle never parses two dozen of them in one go
  var queue=[],qraf=0;
  function pump(){qraf=0;var n=0;while(queue.length&&n<3){var j=queue.shift(),P=F[j.k];if(P.lv>=1&&P.want===j.sh.h){create(j.k,j.sh);n++;}}if(queue.length)qraf=requestAnimationFrame(pump);}
  function mountR(k,sh){
    var P=F[k],dev=devs[k];if(!dev)return;
    if(P.el&&P.h===sh.h){P.el.hidden=false;return;}
    if(P.want===sh.h)return;P.want=sh.h;queue.push({k:k,sh:sh});if(!qraf)qraf=requestAnimationFrame(pump);
  }
  function create(k,sh){
    var P=F[k],dev=devs[k];if(!dev)return;
    if(P.el){P.el.remove();P.el=null;}
    var el,rw=sh.rw||A.dev.w,rh=sh.rh||A.dev.h;
    // L4: never lazy: the script itself loads only the frames in or near the view, nearest first (lazy loading inside the scaled
    // board held the farthest pictures back for seconds)
    if(sh.k==='image'){el=document.createElement('img');el.alt='';el.decoding='async';el.setAttribute('fetchpriority','high');}
    else{el=document.createElement('iframe');el.setAttribute('sandbox','');el.setAttribute('tabindex','-1');el.setAttribute('aria-hidden','true');el.setAttribute('referrerpolicy','no-referrer');
      el.width=rw;el.height=rh;el.style.transform='scale('+((dev.offsetWidth||A.dev.fw)/rw).toFixed(4)+')';}
    // L4: a picture shows once it is DECODED (a loaded but undecoded image painted a blank box over the plate for seconds)
    el.className='ax-r';el.addEventListener('load',function(){var on=function(){el.classList.add('ax-in');if(F[k].el===el)hideW(k);};if(el.decode&&el.tagName==='IMG')el.decode().then(on,on);else on();});
    el.src=renderUrl(sh.h,sh.r&&sh.r[7]);dev.insertBefore(el,tags[k]||null);P.el=el;P.h=sh.h;
  }
  function hideR(k){var P=F[k];P.want='';if(P.el&&!P.el.hidden)P.el.hidden=true;}
  function drawW(k,w){
    var P=F[k],dev=devs[k];if(!dev)return;
    if(P.svg&&P.wk===w.key){P.svg.hidden=false;return;}
    var put=function(spec){if(F[k].lv<1&&F[k].wk!==w.key)return;var tmp=document.createElement('div');tmp.innerHTML=draw(spec,{width:A.dev.w,height:A.dev.h,inset:true});var svg=tmp.firstChild;if(!svg)return;
      if(P.svg)P.svg.remove();P.svg=svg;dev.insertBefore(svg,dev.firstChild);};
    P.wk=w.key;
    if(w.spec){put(w.spec);return;}
    grammar(w.h).then(function(spec){if(spec&&F[k].wk===w.key)put(spec);});
  }
  // a wireframe render's grammar, fetched once (the promise is kept): the only body this page ever reads itself, as JSON
  function grammar(h){if(!G[h]){G[h]=fetch(renderUrl(h,-1),{credentials:'same-origin',headers:{accept:'application/json'}}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});}return G[h];}
  function hideW(k){var P=F[k];if(P.svg&&!P.svg.hidden)P.svg.hidden=true;}
  function release(k){var P=F[k];if(P.lv<0)return;P.want='';if(P.el){P.el.remove();P.el=null;P.h='';}if(P.svg){P.svg.remove();P.svg=null;P.wk='';}P.lv=-1;if(tags[k])tags[k].textContent='';}
  // at most KEEP hidden renders are kept (the oldest go)
  function trim(){var hid=[];for(var k=0;k<N;k++)if(F[k].el&&F[k].el.hidden)hid.push(k);if(hid.length<=KEEP)return;hid.sort(function(a,b){return F[a].t-F[b].t;});
    hid.slice(0,hid.length-KEEP).forEach(function(k){F[k].el.remove();F[k].el=null;F[k].h='';});}
  function refresh(){if(phone.matches)phoneFill();else lod();
    if(S.pin>=0&&insp){var b=insp.querySelector('.ax-sb');if(b)b.outerHTML=K.block(A,S.pin,S.si);}if(S.view>=0)renderView();}
  // ---- hover: a frame's transitions lit with their labels, the rest dimmed ----
  function onHover(e){var el=e&&e.target&&e.target.closest?e.target.closest('.ax-f'):null,k=el?+el.getAttribute('data-i'):-1;if(k!==S.hover){S.hover=k;light(k>=0?k:(S.focus>=0?S.focus:S.pin));}}
  function light(k){
    [].forEach.call(world.querySelectorAll('.ax-on'),function(x){x.classList.remove('ax-on');});
    if(k<0||!els[k]){gH.innerHTML='';lab.innerHTML='';stage.classList.remove('ax-hov');return;}
    var p=[],l=[],seen={};
    var add=function(q,inb){var a=A.e[3*q],b=A.e[3*q+1],t=A.el[A.e[3*q+2]],o=inb?a:b,ba=K.box(A,a),bb=K.box(A,b);if(els[o])els[o].classList.add('ax-on');
      p.push('<path class="'+(inb?'ax-ei':'ax-eo')+'" d="'+K.path(ba,bb)+'"/>');
      if(t&&!seen[o]&&l.length<40){seen[o]=1;var m=K.mid(ba,bb);l.push('<span class="ax-el'+(inb?' ax-elin':'')+'" style="left:'+m.x+'px;top:'+m.y+'px">'+esc(t)+'</span>');}};
    outE[k].forEach(function(q){add(q,false);});inE[k].forEach(function(q){add(q,true);});
    gH.innerHTML=p.join('');lab.innerHTML=l.join('');els[k].classList.add('ax-on');stage.classList.add('ax-hov');
  }
  // ---- pin: the Map's inspector, this screen's states and renders under it ----
  function nodeUrl(f){return orgPath('/map/node?ref=')+encodeURIComponent(f.r)+(proj?'&project='+encodeURIComponent(proj):'');}
  function pin(k,o){
    o=o||{};if(k<0||!A.f[k])return;var f=A.f[k];
    if(S.pin>=0&&els[S.pin])els[S.pin].classList.remove('ax-pin');S.pin=k;if(els[k])els[k].classList.add('ax-pin');
    setParam('screen',f.id);
    V.inspect(insp,nodeUrl(f),'<div class="mx-pre"><p class="mx-k">Screen</p><h3 class="mx-title">'+esc(f.n)+'</h3><p class="mx-note">Reading it from the project\\u2019s model.</p></div>'+K.block(A,k,S.si),function(){return K.block(A,k,S.si);});
    if(!phone.matches&&(o.center||!inView(k)))V.center(K.box(A,k),true,o.center?NEAR:0);
    light(S.hover>=0?S.hover:k);say('Pinned '+f.n+'. Enter again opens it full size.');
  }
  function unpin(){V.cancel();if(S.pin>=0&&els[S.pin])els[S.pin].classList.remove('ax-pin');S.pin=-1;setParam('screen',null);if(insp){insp.classList.remove('is-node');insp.innerHTML=overview;}light(S.hover);}
  // ---- the viewer: one screen full size ----
  function openView(k,s){
    if(k<0||!A.f[k]||!viewer)return;var f=A.f[k];
    // a phone: the viewer is the page, so nothing is pinned under it (closing it returns to the rows)
    if(phone.matches)setParam('screen',f.id);else if(S.pin!==k)pin(k,{});
    var sh=K.show(A,f,S.si,S.mode);S.view=k;S.vv=0;S.vs=s!=null&&s>=0?s:S.si>=0&&f.st.indexOf(S.si)>=0?S.si:sh.r&&sh.r[0]>=0?sh.r[0]:f.st.length?f.st[0]:-1;
    viewer.hidden=false;renderView();setParam('full','1');
    var c=viewer.querySelector('[data-button="view-close"]');if(c)c.focus();
  }
  function closeView(){if(!viewer||S.view<0)return;var k=S.view;viewer.hidden=true;viewer.innerHTML='';S.view=-1;setParam('full',null);if(phone.matches){if(S.pin<0)setParam('screen',null);if(els[k])els[k].scrollIntoView({block:'nearest',inline:'nearest'});}else if(els[k])stage.focus();}
  function variants(f,s){
    var rs=f.rs.filter(function(r){return r[0]===s||r[0]===-1;}),real=rs.filter(function(r){return !K.wireR(r);}),wire=rs.filter(function(r){return K.wireR(r);});
    var out=(S.mode==='wire'?wire.concat(real):real.concat(wire)).map(function(r){return{r:r,label:r[1]||r[2]};});
    if(f.w)out.push({spec:f.w,label:'drawn wireframe'});
    if(!rs.length){var sh=K.show(A,f,s,S.mode);if(sh.r)out.unshift({r:sh.r,label:(sh.r[1]||sh.r[2])+(sh.tag?' ('+sh.tag+')':''),tag:sh.tag});}
    return out;
  }
  function renderView(){
    var k=S.view,f=A.f[k];if(!f)return;var fl=K.flow(A,k),pos=fl.indexOf(k),ln=A.lanes[f.ln]||{n:''},vs=variants(f,S.vs),cur=vs[Math.min(S.vv,vs.length-1)];
    var chip=function(btn,attrs,on,label,dot){return '<button type="button" class="ax-chip" data-button="'+btn+'" data-client="'+(btn==='view-state'?'shows this state':'shows this variant')+'" '+attrs+' aria-pressed="'+(on?'true':'false')+'" title="'+esc(label)+'">'+(dot?'<i data-has="'+dot+'"></i>':'')+esc(label)+'</button>';};
    var states=f.st.map(function(s){return chip('view-state','data-state="'+s+'"',s===S.vs,A.st[s],K.has(f,s));}).join('');
    var vars=vs.map(function(v,j){return chip('view-variant','data-v="'+j+'"',v===cur,v.label);}).join('');
    var z=size(),aw=Math.max(200,(viewer.clientWidth||z.w)-48),ah=Math.max(200,(viewer.clientHeight||z.h)-150);
    var rw=cur&&cur.r&&cur.r[4]||A.dev.w,rh=cur&&cur.r&&cur.r[5]||A.dev.h,sc=Math.min(1,aw/rw,ah/A.dev.h),body='',tag=cur&&cur.tag?cur.tag:'';
    if(!cur)body='<div class="ax-vnone">No render or wireframe is filed for '+esc(A.st[S.vs]||'this state')+': file one through preview then file, an item {kind: "render", …}.</div>';
    else if(cur.spec)body=draw(cur.spec,{width:A.dev.w,height:A.dev.h,inset:true});
    // a wireframe render: its grammar (fetched once, kept) drawn by the same drawer once it answers
    else if(cur.r[2]==='wireframe'){var wh=cur.r[3];grammar(wh).then(function(spec){var d=viewer.querySelector('.ax-vd');if(!spec||S.view!==k||!d||d.getAttribute('data-wh')!==wh||d.querySelector('svg.wf'))return;d.insertAdjacentHTML('afterbegin',draw(spec,{width:A.dev.w,height:A.dev.h,inset:true}));});}
    else if(cur.r[2]==='image')body='<img src="'+renderUrl(cur.r[3],cur.r[7])+'" alt="'+esc(f.n+', '+(A.st[S.vs]||''))+'">';
    else if(cur.r[2]==='html')body='<iframe sandbox="" referrerpolicy="no-referrer" title="'+esc(f.n+', '+(A.st[S.vs]||'')+', '+cur.label)+'" src="'+renderUrl(cur.r[3],cur.r[7])+'" width="'+rw+'" height="'+rh+'" style="transform:scale('+sc.toFixed(4)+')"></iframe>';
    var hh=cur&&cur.r&&cur.r[2]!=='wireframe'?rh:A.dev.h;
    viewer.innerHTML='<div class="ax-vh"><div class="ax-vt"><p class="mx-k">'+esc(ln.n)+' \\u00b7 '+(pos+1)+' of '+fl.length+'</p><h3 class="ax-vn">'+esc(f.n)+'</h3></div>'+
      '<button type="button" class="mx-b" data-button="view-prev" data-client="the screen before in its lane" aria-label="The screen before"'+(pos<=0?' disabled':'')+'>&lsaquo;</button>'+
      '<button type="button" class="mx-b" data-button="view-next" data-client="the next screen in its lane" aria-label="The next screen"'+(pos>=fl.length-1?' disabled':'')+'>&rsaquo;</button>'+
      '<button type="button" class="mx-x" data-button="view-close" data-client="closes the full size view (Esc)" aria-label="Close">&times;</button></div>'+
      '<div class="ax-vbar"><span class="mx-k">States</span><div class="ax-chips" role="group" aria-label="States">'+states+'</div>'+(vs.length>1?'<span class="mx-k">Variants</span><div class="ax-chips" role="group" aria-label="Variants">'+vars+'</div>':'')+'<span class="ax-vz">'+Math.round(sc*100)+'%</span></div>'+
      '<div class="ax-vs"><div class="ax-vd" data-device="'+A.dev.kind+'"'+(cur&&cur.r&&cur.r[2]==='wireframe'?' data-wh="'+esc(cur.r[3])+'"':'')+' style="width:'+Math.round(rw*sc)+'px;height:'+Math.round(hh*sc)+'px">'+body+(tag?'<span class="ax-tag">'+esc(tag)+'</span>':'')+'</div></div>';
    say(f.n+', '+(A.st[S.vs]||'')+(cur?', '+cur.label:'')+'. '+(pos+1)+' of '+fl.length+' in '+ln.n+'.');
  }
  function viewStep(d){var fl=K.flow(A,S.view),pos=fl.indexOf(S.view),n=fl[pos+d];if(n==null)return;var f=A.f[n];openView(n,f.st.indexOf(S.vs)>=0?S.vs:-1);if(!phone.matches&&!inView(n))V.center(K.box(A,n),true,0);}
  function viewState(d){var f=A.f[S.view],j=f.st.indexOf(S.vs)+d;if(j<0||j>=f.st.length)return;S.vs=f.st[j];S.vv=0;renderView();}
  // ---- keys: along the lane (left, right) and across (up, down), Enter pins then opens, Esc closes ----
  function focusF(k){
    if(k<0||!els[k])return;if(S.focus>=0&&els[S.focus])els[S.focus].classList.remove('ax-focus');S.focus=k;els[k].classList.add('ax-focus');light(k);
    if(!phone.matches&&!inView(k))V.center(K.box(A,k),true,0);
    var f=A.f[k];say(f.n+', '+(D.lightWord[f.l]||f.l)+', '+(outE[k].length+inE[k].length)+' transitions. Enter pins it.');
  }
  function nearest(){var z=size(),cx=(z.w/2-view.tx)/view.s,cy=(z.h/2-view.ty)/view.s,b=-1,bd=Infinity;for(var k=0;k<N;k++){var f=A.f[k],d=Math.hypot(f.x+A.dev.fw/2-cx,f.y+A.dev.fh/2-cy);if(d<bd){bd=d;b=k;}}return b;}
  function move(dir){
    if(S.focus<0){focusF(S.pin>=0?S.pin:nearest());return;}
    var a=A.f[S.focus];
    if(dir==='left'||dir==='right'){var fl=K.flow(A,S.focus),p=fl.indexOf(S.focus)+(dir==='right'?1:-1);if(p>=0&&p<fl.length)focusF(fl[p]);return;}
    var best=-1,bd=Infinity;for(var k=0;k<N;k++){if(k===S.focus)continue;var b=A.f[k],dy=dir==='down'?b.y-a.y:a.y-b.y;if(dy<=0)continue;var d=dy+Math.abs(b.x-a.x)*2;if(d<bd){bd=d;best=k;}}
    if(best>=0)focusF(best);
  }
  stage.addEventListener('focus',function(){if(S.focus<0&&S.pin<0&&!phone.matches){var n=nearest();if(n>=0&&els[n]){S.focus=n;els[n].classList.add('ax-focus');}}});
  stage.addEventListener('keydown',function(e){
    var k=e.key;
    if(S.view>=0){if(k==='ArrowLeft'||k==='ArrowRight'){e.preventDefault();viewStep(k==='ArrowRight'?1:-1);}else if(k==='ArrowUp'||k==='ArrowDown'){e.preventDefault();viewState(k==='ArrowDown'?1:-1);}return;}
    if(k==='ArrowUp'||k==='ArrowDown'||k==='ArrowLeft'||k==='ArrowRight'){e.preventDefault();move(k.slice(5).toLowerCase());return;}
    if(k==='Enter'||k===' '){var t=S.focus>=0?S.focus:S.pin;if(t<0)return;e.preventDefault();if(t===S.pin)openView(t);else pin(t);return;}
    if(k==='+'||k==='='){zoomMid(1.25);return;}
    if(k==='-'||k==='_'){zoomMid(0.8);return;}
    if(k==='0'){fitBoard(true);return;}
  });
  document.addEventListener('keydown',function(e){
    var tg=e.target,tn=tg&&tg.tagName;if(tn==='INPUT'||tn==='TEXTAREA'||tn==='SELECT'||e.metaKey||e.ctrlKey||e.altKey)return;
    if((e.key==='f'||e.key==='F')&&q&&S.view<0){e.preventDefault();q.focus();q.select();return;}
    if(e.key==='Escape'){var pal=document.getElementById('pal');if(pal&&!pal.hidden)return;if(S.view>=0){closeView();return;}if(S.pin>=0){var was=S.pin;unpin();focusF(was);stage.focus();return;}if(S.focus>=0){els[S.focus].classList.remove('ax-focus');S.focus=-1;light(S.hover);}}
  });
  // ---- find: the rest dims, Enter pins the next hit ----
  function find(v){
    S.q=v;var w=String(v||'').toLowerCase().split(/\\s+/).filter(Boolean);
    [].forEach.call(world.querySelectorAll('.ax-hit'),function(x){x.classList.remove('ax-hit');});
    if(!w.length){S.hits=null;stage.classList.remove('ax-finding');if(qn)qn.textContent='';setParam('find',null);return;}
    var hits=[];for(var k=0;k<N;k++){var f=A.f[k],t=(f.n+' '+f.id).toLowerCase();if(w.every(function(x){return t.indexOf(x)>=0;})){hits.push(k);if(els[k])els[k].classList.add('ax-hit');}}
    S.hits=hits;stage.classList.add('ax-finding');if(qn)qn.textContent=String(hits.length);setParam('find',v);
    say(hits.length?hits.length+' screen'+(hits.length===1?'':'s')+' match. Enter pins the first.':'No screen matches.');
  }
  if(q){var qt=0;q.addEventListener('input',function(){clearTimeout(qt);qt=setTimeout(function(){find(q.value);},90);});
    q.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();find(q.value);if(S.hits&&S.hits.length){var at=S.hits.indexOf(S.pin),n=S.hits[(at+1)%S.hits.length];pin(n,{center:true});if(phone.matches&&els[n])els[n].scrollIntoView({block:'nearest',inline:'center'});}}
      else if(e.key==='Escape'){e.preventDefault();q.value='';find('');stage.focus();}});}
  // ---- the bar, the inspector, the viewer: one delegated click ----
  stage.addEventListener('click',function(e){
    if(V.moved()>4){V.moved(0);return;}
    var t=e.target;if(!t||!t.closest||t.closest('.ax-view,.mx-mini'))return;
    var fe=t.closest('.ax-f');if(!fe||e.metaKey||e.ctrlKey)return;e.preventDefault();
    var k=+fe.getAttribute('data-i');if(phone.matches||k===S.pin){openView(k);return;}pin(k);
  });
  root.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target:null;if(!t)return;var b=t.closest('[data-button]');if(!b||b.disabled)return;var k=b.getAttribute('data-button');
    if(k==='zoom'){zoomMid(b.getAttribute('data-dir')==='in'?1.25:0.8);return;}
    if(k==='fit'){fitBoard(true);return;}
    if(k==='state-toggle'){var l=b.getAttribute('data-show');S.dim[l]=!S.dim[l];b.setAttribute('aria-pressed',S.dim[l]?'false':'true');stage.classList.toggle('ax-dim-'+l,!!S.dim[l]);return;}
    if(k==='render-mode'){S.mode=b.getAttribute('data-mode')==='wire'?'wire':'render';[].forEach.call(root.querySelectorAll('[data-button="render-mode"]'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});setParam('mode',S.mode===A.dm?null:S.mode);refresh();say(S.mode==='wire'?'Every frame shows its wireframe.':'Every frame shows its real render where it has one.');return;}
    if(k==='lane-pick'){var ln=A.lanes[+b.getAttribute('data-lane')];if(ln&&!phone.matches)V.set(V.fit({x:0,y:ln.y-12,w:A.W,h:ln.h+24}),true);else if(ln){var sec=world.querySelectorAll('.ax-lane')[+b.getAttribute('data-lane')];if(sec)sec.scrollIntoView({block:'start'});}return;}
    if(k==='unpin'){unpin();return;}
    if(k==='open-full'){e.preventDefault();var i2=b.getAttribute('data-i'),s2=b.getAttribute('data-state');openView(i2!=null?+i2:S.pin,s2!=null?+s2:-1);return;}
    if(k==='view-close'){closeView();return;}
    if(k==='view-prev'||k==='view-next'){viewStep(k==='view-next'?1:-1);return;}
    if(k==='view-state'){S.vs=+b.getAttribute('data-state');S.vv=0;renderView();return;}
    if(k==='view-variant'){S.vv=+b.getAttribute('data-v');renderView();return;}
    if(k==='select-node'){var ref=b.getAttribute('data-ref');for(var j=0;j<N;j++)if(A.f[j].r===ref){e.preventDefault();pin(j,{center:true});return;}}
  });
  if(sel)sel.addEventListener('change',function(){var i=sel.value===''?-1:A.st.indexOf(sel.value);if(sel.value!==''&&i<0)return;S.si=i;setParam('state',i===A.s0?null:i<0?'*':sel.value);refresh();say(i<0?'Every frame shows its own first state.':'Every frame shows '+sel.value+' where it has it.');});
  // ---- the minimap ----
  function miniDraw(){if(!mini||phone.matches)return;var out=[];for(var k=0;k<N;k++){var f=A.f[k];out.push('<rect class="mx-mr" data-light="'+f.l+'" x="'+f.x+'" y="'+f.y+'" width="'+A.dev.fw+'" height="'+A.dev.fh+'" rx="'+(A.dev.fw/9).toFixed(0)+'"/>');}V.miniDraw(mini,box(),out.join(''));}
  V.miniBind(mini);
  // ---- a phone: the frames in view load, the nearest twelve as renders ----
  var io=null,seen={};
  function phoneFill(){var ks=Object.keys(seen).map(Number).sort(function(a,b){return a-b;}),used=0;tick++;ks.forEach(function(k){used+=fill(k,2,used<12);});for(var k=0;k<N;k++)if(!seen[k]&&F[k].lv>=0)hideR(k);trim();}
  function phoneOn(){if(io||!window.IntersectionObserver)return;io=new IntersectionObserver(function(es){es.forEach(function(en){var k=+en.target.getAttribute('data-i');if(en.isIntersecting)seen[k]=1;else delete seen[k];});phoneFill();},{rootMargin:'160px'});els.forEach(function(el){if(el)io.observe(el);});}
  function phoneOff(){if(io){io.disconnect();io=null;seen={};}}
  // ---- live lights: the screens whose light moved while the page is open (GET /map/lights, the Map's own poll) ----
  var since=D.since||'',lastPoll=0;
  function poll(){
    if(!since||document.visibilityState!=='visible'||Date.now()-lastPoll<5000||!window.fetch)return;lastPoll=Date.now();
    fetch(orgPath('/map/lights?since=')+encodeURIComponent(since)+(proj?'&project='+encodeURIComponent(proj):''),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}})
      .then(function(r){return r.ok?r.json():null;}).then(function(x){if(!x||!x.lights)return;if(x.at)since=x.at;var moved=[];
        x.lights.forEach(function(l){for(var k=0;k<N;k++){var f=A.f[k];if((f.r===l.id||'screen:'+f.id===l.id)&&f.l!==l.light){f.l=l.light;if(els[k]){els[k].setAttribute('data-light',l.light);if(M){els[k].classList.remove('u-pulse');void els[k].offsetWidth;}}moved.push(k);}}});
        // a stale mark that moved (sprint 3, B4): the frame's light takes the hollow ring, and pings once when it turns stale
        (x.stale||[]).forEach(function(z){for(var k=0;k<N;k++){var f=A.f[k];if(f.r!==z.id&&'screen:'+f.id!==z.id)continue;var was=f.z||0,now=z.stale||0;if(was===now)continue;if(now)f.z=now;else delete f.z;if(els[k]){if(now)els[k].setAttribute('data-stale',String(now));else els[k].removeAttribute('data-stale');if(M&&!was&&now){els[k].classList.remove('ax-ping');void els[k].offsetWidth;els[k].classList.add('ax-ping');}}if(moved.indexOf(k)<0)moved.push(k);}});
        if(moved.length)say(moved.length+' light'+(moved.length===1?'':'s')+' changed: '+moved.slice(0,3).map(function(k){return A.f[k].n+' is '+(D.lightWord[A.f[k].l]||A.f[k].l);}).join('; '));}).catch(function(){});
  }
  window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);setInterval(poll,30000);
  // ---- boot: adopt the server's board ----
  function boot(){
    if(phone.matches){stage.classList.remove('ax-ready');world.style.transform='';phoneOn();return;}
    phoneOff();stage.classList.add('ax-ready');fitBoard(false);
    if(S.pin>=0){V.center(K.box(A,S.pin),false,NEAR);light(S.pin);}
    miniDraw();schedule();
  }
  boot();
  if(phone.addEventListener)phone.addEventListener('change',function(){for(var k=0;k<N;k++)release(k);boot();});
  var lastZ=size();
  // A2 (sprint 5): a fold of the rail or the panel resizes the stage. A board still at its fit RE-FITS to the new size
  // (it used to only re-centre, so the board stayed sized for the old stage); a board the person has zoomed or panned
  // keeps its place, re-centred, as before
  var stillFit=function(){return fitted&&Math.abs(view.s-fitted.s)<1e-6&&Math.abs(view.tx-fitted.tx)<0.5&&Math.abs(view.ty-fitted.ty)<0.5;};
  if(window.ResizeObserver)new ResizeObserver(function(){if(phone.matches)return;var z=size();if(Math.abs(z.w-lastZ.w)<1&&Math.abs(z.h-lastZ.h)<1)return;var was=stillFit(),dw=z.w-lastZ.w,dh=z.h-lastZ.h;lastZ=z;if(was){fitBoard(false);}else{view.tx+=dw/2;view.ty+=dh/2;}apply();miniDraw();schedule();if(S.view>=0)renderView();}).observe(stage);
  if(pq&&pq.get('find')&&q){q.value=pq.get('find');find(q.value);}
  if(D.full&&S.pin>=0)openView(S.pin);
  root.classList.add('mx-ready');
})();
`);

// ATLAS_CLIENT: the page's script: the view kit (shared with the Map), the atlas kit (the frames' fallbacks, the level of
// detail, the curves), the ONE wireframe drawer (src/wireframe.js wireframeSvg, the server's own drawing: a filed grammar is
// already validated), then the client.
export const ATLAS_CLIENT = `${ORG_PATH_CLIENT}${VIEW_KIT}var ATLASKIT=${strip(atlasKit.toString())};var WIREFRAME=${strip(wireframeSvg.toString())};\n${CLIENT}`;
