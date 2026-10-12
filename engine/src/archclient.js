// src/archclient.js — the Arch view's client (sprint 3): the ONE script the view carries, no library. The server draws the
// whole first paint (src/archview.js: the SVG in a viewBox the browser fits by itself); this script adopts it:
//   · pan, zoom, fit and the minimap come from the Map's viewKit (src/mapclient.js, embedded by its source: one copy);
//   · always (html.u-motion only): small dots travel along the links in their direction, more on a main link, slow; the
//     loop runs on requestAnimationFrame and stops while the tab is hidden, the stage is off screen or a journey plays;
//   · hover a part: its links, their labels and its neighbours stay, the rest dims, a card says what it is; click pins it
//     and the side panel says what it is, what crosses to and from it, the journeys through it and the rules on it;
//     a crossing rule hovered lights the parts it names;
//   · Play (the strip's button, or Space): a journey, step by step, a pulse running the link while a caption names the
//     step; ← → step; Esc stops. Under reduced motion nothing moves: Play shows the steps with their buttons;
//   · at phone width the diagram is laid out again narrow (the kit's own layout) and scrolls with the page; tap pins;
//   · M4: the dots say what is real: a link to a part with a failing check runs them in the danger ink; a part's panel names
//     its failing or stale check (the Regrade press when stale) and the day it changed; Play stops at a journey's first blocked
//     step (a red or stale part), pins that part and the caption names the check. Under reduced motion the marks are the same;
//   · M5: a lane folds from its label to one bar (its links end there), kept for the person (src/parts.js foldKit,
//     window.SGFOLD); a journey's pill filters the diagram to it (the rest dims, Play walks it), pressed again or Escape clears.
// The layout and the drawing are src/archview.js archKit(), embedded by its own source (archKit.toString()), so the
// server's first paint and a phone's redraw are the same code.
import { archKit } from "./archview.js";
import { VIEW_KIT, strip } from "./mapclient.js";
import { ORG_PATH_CLIENT } from "./orgpath.js";   // sprint 7, 7.4: the client builds its URLs under the org (its own orgPath)

const CLIENT = strip(`
(function(){
  var $=function(id){return document.getElementById(id);};
  var root=$('ar'),dataEl=$('ar-data');if(!root||!dataEl)return;
  var D;try{D=JSON.parse(dataEl.textContent);}catch(e){return;}
  var A=D.M,L=D.L,K=ARCHKIT();
  var stage=$('ar-stage'),svg=$('ar-svg'),world=$('ar-world'),tip=$('ar-tip'),cap=$('ar-cap'),insp=$('ar-insp'),ov=$('ar-ov'),zl=$('ar-zl'),mini=$('ar-mini'),live=$('ar-live'),playB=$('ar-play');
  if(!stage||!svg||!world)return;
  var M=document.documentElement.classList.contains('u-motion');
  var phone=window.matchMedia?window.matchMedia('(max-width:760px)'):{matches:false};
  var S={pin:-1,hov:-1,path:0,step:-1,playing:false,focus:-1,timer:0,raf:0,hold:0,filter:-1,shut:{}};
  // M5: the lanes this person keeps folded on this project (a lane with parts), by the lane's id
  var FD=window.SGFOLD&&window.SGFOLD.kit?window.SGFOLD:null;
  if(FD){var kept=FD.kit.shutOf(FD.kit.read(FD.key),'lanes',D.project);A.bands.forEach(function(b,i){if(kept[b.id]&&b.n)S.shut[i]=1;});}
  var shutKey=function(){return Object.keys(S.shut).sort().join(',');};
  var esc=K.esc,say=function(t){if(live)live.textContent=t;};
  var nb=A.nodes.map(function(){return [];});A.links.forEach(function(l,i){nb[l.a].push(i);nb[l.b].push(i);});
  var box=function(){return{x:-24,y:-14,w:L.W+48,h:L.H+28};};
  var g=function(id){return document.getElementById(id);};
  function nodeEl(i){return world.querySelector('.ar-n[data-i="'+i+'"]');}
  function linkEl(i){return world.querySelector('.ar-l[data-l="'+i+'"]');}
  function all(sel){return [].slice.call(world.querySelectorAll(sel));}
  // ---- the view (viewKit: pan, zoom, pinch, wheel, eased moves, the minimap) ----
  function stageSize(){return{w:svg.clientWidth||stage.clientWidth||900,h:svg.clientHeight||stage.clientHeight||600};}
  var V=VIEWKIT().make({stage:stage,rect:function(){return svg.getBoundingClientRect();},size:stageSize,min:0.2,max:3,motion:M,
    phone:function(){return phone.matches;},apply:function(){apply();},
    skip:function(e){return !!(e.target&&e.target.closest&&e.target.closest('.ar-strip,.ar-cap,.mx-mini,.ar-tip'));},
    hover:function(e){var el=e&&e.target&&e.target.closest?e.target.closest('.ar-n'):null,i=el?+el.getAttribute('data-i'):-1;if(i!==S.hov){S.hov=i;light(i>=0?i:S.pin);showTip(i);}}});
  var view=V.v;
  function apply(){if(phone.matches)return;world.setAttribute('transform','translate('+view.tx.toFixed(1)+' '+view.ty.toFixed(1)+') scale('+view.s.toFixed(4)+')');if(zl)zl.textContent=Math.round(view.s*100)+'%';if(mini)V.miniView(mini,box());if(S.hov>=0)showTip(S.hov);}
  function fitView(){return V.fit(box(),false);}
  function miniDraw(){if(!mini||phone.matches)return;var o=[];A.bands.forEach(function(b,i){o.push('<rect class="mx-mr" x="0" y="'+L.bands[i].y+'" width="'+L.W+'" height="'+(L.bands[i].h-6)+'" rx="8" opacity=".35"/>');});
    L.nodes.forEach(function(P){o.push('<rect class="mx-mr" x="'+P.x+'" y="'+P.y+'" width="'+P.w+'" height="'+P.h+'" rx="8"/>');});V.miniDraw(mini,box(),o.join(''));}
  V.miniBind(mini);
  // ---- hover and pin: a part's links, their labels and its neighbours stay; the rest dims ----
  function clearLit(){all('.ar-on').forEach(function(e){e.classList.remove('ar-on');});all('.ar-lon').forEach(function(e){e.classList.remove('ar-lon');});var ll=g('ar-ll');if(ll)ll.innerHTML='';}
  function lightSet(ns,ls){
    clearLit();if(!ns.length){stage.classList.remove('ar-hov');return;}
    stage.classList.add('ar-hov');var lab=[];
    ns.forEach(function(i){var e=nodeEl(i);if(e)e.classList.add('ar-on');});
    // each lit link's label at the first place along it (the middle, then either side) clear of the labels already placed
    // and of the parts; a label with no clear place is left to the card and the panel
    var placed=A.bands.map(function(b,i){return {x:L.mx-4,y:L.bands[i].y+14,w:(b.label.length+4)*7.6,h:20};});if(A.seam)placed.push({x:-1e4,y:L.bands[A.seam.b].y-10,w:2e4,h:20});
    var free=function(b){for(var q=0;q<placed.length;q++){var o=placed[q];if(b.x<o.x+o.w&&o.x<b.x+b.w&&b.y<o.y+o.h&&o.y<b.y+b.h)return false;}
      for(var r=0;r<L.nodes.length;r++){var P=L.nodes[r];if(b.x<P.x+P.w&&P.x<b.x+b.w&&b.y<P.y+P.h&&P.y<b.y+b.h)return false;}return true;};
    ls.forEach(function(li){var e=linkEl(li);if(e)e.classList.add('ar-lon');var l=A.links[li];if(!l.label||ls.length>16)return;var tx=K.cut(l.label,30),w=tx.length*7.3+8;
      [0.5,0.36,0.64,0.24,0.76].some(function(f){var p=K.bez(L.links[li].c,f),b={x:p[0]-w/2,y:p[1]-9,w:w,h:16};if(!free(b))return false;placed.push(b);
        lab.push('<text class="ar-llt" x="'+p[0].toFixed(1)+'" y="'+(p[1]+4).toFixed(1)+'" text-anchor="middle">'+esc(tx)+'</text>');return true;});});
    var ll=g('ar-ll');if(ll)ll.innerHTML=lab.join('');
  }
  function light(i){
    if(S.ruleOn)return;
    if(i<0){lightSet([],[]);return;}
    var ns=[i];nb[i].forEach(function(li){var l=A.links[li];ns.push(l.a===i?l.b:l.a);});lightSet(ns,nb[i]);
  }
  function lightRule(ids){var set={},ns=[],ls=[];ids.forEach(function(i){set[i]=1;ns.push(i);});A.links.forEach(function(l,li){if(set[l.a]&&set[l.b])ls.push(li);});lightSet(ns,ls);}
  function showTip(i){
    if(!tip)return;if(i<0||phone.matches){tip.hidden=true;return;}
    var n=A.nodes[i],P=L.nodes[i],ins=0,outs=0;nb[i].forEach(function(li){if(A.links[li].b===i)ins++;else outs++;});
    tip.innerHTML='<b>'+esc(n.title)+'</b>'+(n.sub?'<p>'+esc(n.sub)+'</p>':'')+'<small>'+ins+' in \\u00b7 '+outs+' out'+(n.light==='red'?' \\u00b7 failing':'')+(n.stale?' \\u00b7 stale':'')+(n.changed?' \\u00b7 changed':'')+'</small>';
    tip.hidden=false;var z=stageSize(),oy=svg.offsetTop||0,x=(P.x+P.w/2)*view.s+view.tx,y=P.y*view.s+view.ty+oy,w=tip.offsetWidth||240,h=tip.offsetHeight||70;
    var left=Math.max(8,Math.min(z.w-w-8,x-w/2)),top=y-h-10;if(top<oy+6)top=(P.y+P.h)*view.s+view.ty+oy+10;
    tip.style.left=left.toFixed(0)+'px';tip.style.top=top.toFixed(0)+'px';
  }
  var X='<div class="mx-ih"><button type="button" class="mx-x" data-button="unpin" data-client="closes the part (Esc)" aria-label="Close">&times;</button></div>';
  function partRow(i,label){return '<li><button type="button" data-button="select-part" data-client="pins this part" data-i="'+i+'">'+esc(A.nodes[i].title)+'</button>'+(label?'<small title="'+esc(label)+'">'+esc(label)+'</small>':'')+'</li>';}
  function panel(i){
    var n=A.nodes[i],b=A.bands[n.b],ins=[],outs=[];nb[i].forEach(function(li){var l=A.links[li];if(l.b===i)ins.push(partRow(l.a,l.label));else outs.push(partRow(l.b,l.label));});
    var sec=function(t,rows){return rows.length?'<section class="mx-sec"><h4 class="mx-k">'+t+' <span>'+rows.length+'</span></h4><ul class="ar-ilinks">'+rows.join('')+'</ul></section>':'';};
    var js=[];A.paths.forEach(function(p,pi){if(p.steps.some(function(s){return s.a===i||s.b===i;}))js.push('<li><button type="button" class="mx-row" data-button="path-play" data-client="plays this journey on the diagram" data-path="'+pi+'"><span class="ar-tri" aria-hidden="true"></span><span class="mx-rt">'+esc(p.name)+'</span><span class="mx-rm">'+p.steps.length+' steps</span></button></li>');});
    var rs=[];A.rules.forEach(function(r,ri){if(r.nodes.indexOf(i)>=0)rs.push('<li data-r="'+ri+'" data-nodes="'+r.nodes.join(' ')+'" tabindex="0" data-rule>'+esc(r.rule)+'</li>');});
    var sv=null;A.services.forEach(function(s){if(s.id===n.service)sv=s;});
    // M4: the check that fails (or went stale) on it, its Regrade press when stale, and the day it changed this week
    var mk=n.check?'<section class="mx-sec ar-mark" data-mark="'+(n.check.stale?'stale':'failing')+'"><h4 class="mx-k">'+(n.check.stale?'Stale':'Failing')+(n.stale?' <span>'+n.stale+'</span>':'')+'</h4><p class="mx-note ar-chk" title="'+esc(n.check.id)+'">'+esc(n.check.title)+'</p>'+
      (n.regrade?'<form method="POST" action="'+orgPath('/regrade')+'" class="mx-acts">'+[['project',D.project],['checks',n.regrade.join(',')],['next',orgPath('/map/arch?project=')+encodeURIComponent(D.project)]].map(function(h){return '<input type="hidden" name="'+h[0]+'" value="'+esc(h[1])+'">';}).join('')+
        '<button type="submit" class="mx-b mx-b-go" data-button="regrade" data-door="POST /regrade">Regrade</button></form>':'')+'</section>':'';
    if(n.changed)mk+='<section class="mx-sec ar-mark" data-mark="changed"><h4 class="mx-k">Changed <span>'+esc(n.changed)+'</span></h4></section>';
    return X+'<p class="mx-k">'+esc(b.label)+(n.kind?' \\u00b7 '+esc(n.kind):'')+'</p><h3 class="mx-title">'+esc(n.title)+'</h3>'+(n.sub?'<p class="mx-what">'+esc(n.sub)+'</p>':'')+(n.about?'<p class="mx-note">'+esc(n.about)+'</p>':'')+mk+
      sec('What crosses to it',ins)+sec('What crosses from it',outs)+(ins.length+outs.length?'':'<p class="mx-note">No link is filed to or from this part.</p>')+
      (js.length?'<section class="mx-sec"><h4 class="mx-k">Journeys through it <span>'+js.length+'</span></h4><ul class="mx-rows">'+js.join('')+'</ul></section>':'')+
      (rs.length?'<section class="mx-sec"><h4 class="mx-k">The rules on it <span>'+rs.length+'</span></h4><ul class="mx-rules ar-rules">'+rs.join('')+'</ul></section>':'')+
      (sv?'<section class="mx-sec"><h4 class="mx-k">Runs on</h4><p class="mx-note"><b>'+esc(sv.name)+'</b></p>'+(sv.uses.length?'<ul class="ar-uses">'+sv.uses.map(function(u){return '<li>'+esc(u)+'</li>';}).join('')+'</ul>':'')+'</section>':'')+
      // M3: the project that owns the part, a link to its Map when the reader may read it
      (n.owner?'<section class="mx-sec"><h4 class="mx-k">Owned by</h4><p class="mx-note">'+(n.owner.href?'<a href="'+esc(n.owner.href)+'" data-button="open-owner" data-door="GET /map">':'<b>')+esc(n.owner.name)+(n.owner.href?'</a>':'</b>')+'</p></section>':'');
  }
  function pin(i){
    if(i<0||!A.nodes[i])return;S.pin=i;all('.ar-pin').forEach(function(e){e.classList.remove('ar-pin');});var e=nodeEl(i);if(e)e.classList.add('ar-pin');
    if(insp){insp.innerHTML=panel(i);insp.hidden=false;insp.classList.add('is-node');if(insp.parentNode&&insp.parentNode.scrollTo)insp.parentNode.scrollTo(0,0);if(phone.matches&&insp.scrollIntoView)insp.scrollIntoView({block:'nearest'});}
    light(i);say('Pinned '+A.nodes[i].title);
  }
  function unpin(){S.pin=-1;all('.ar-pin').forEach(function(e){e.classList.remove('ar-pin');});if(insp){insp.hidden=true;insp.innerHTML='';}light(S.hov);}
  // ---- the dots: data moving along the links (u-motion only; paused when hidden, off screen or during a journey) ----
  var dots=[],dg=null,vis=true,last=0;
  function makeDots(){
    dg=g('ar-dots');dots=[];if(!dg||!M)return;var onPath={},anyMain=false,out=[],J=S.filter>=0?K.jset(A,S.filter):null;
    A.paths.forEach(function(p){p.steps.forEach(function(s){if(s.l>=0)onPath[s.l]=1;});});A.links.forEach(function(l){if(l.main)anyMain=true;});
    // a link inside a folded lane is not drawn, and a filter keeps the dots on its journey's links
    A.links.forEach(function(l,i){if(!L.links[i].c||(J&&!J.l[i]))return;var heavy=anyMain?l.main:!!onPath[i],n=heavy?3:1;for(var k=0;k<n;k++)dots.push({l:i,s:((i*0.618+k/n)%1),h:heavy});});
    if(dots.length>90)dots=dots.filter(function(d,k){return d.h||k%2===0;}).slice(0,90);
    dots.forEach(function(d){out.push('<circle class="ar-dot'+(d.h?' ar-dm':'')+(A.links[d.l].fail?' ar-df':'')+'" r="'+(d.h?2.1:1.8)+'" cx="0" cy="0" opacity="0"/>');});
    dg.innerHTML=out.join('');var cs=dg.querySelectorAll('circle');dots.forEach(function(d,k){d.el=cs[k];});
  }
  function frame(t){
    S.raf=0;if(!running())return;var dt=last?Math.min(60,t-last):16;last=t;
    for(var k=0;k<dots.length;k++){var d=dots[k],c=L.links[d.l].c;if(!c.len)K.bez(c,0);d.s+=dt*(d.h?0.064:0.05)/Math.max(40,c.len);if(d.s>=1)d.s-=1;
      var p=K.bez(c,d.s),o=d.s<0.08?d.s/0.08:d.s>0.92?(1-d.s)/0.08:1;if(d.el){d.el.setAttribute('transform','translate('+p[0].toFixed(1)+' '+p[1].toFixed(1)+')');d.el.setAttribute('opacity',o.toFixed(2));}}
    S.raf=requestAnimationFrame(frame);
  }
  function running(){return M&&S.opened&&dots.length&&vis&&document.visibilityState!=='hidden'&&!S.playing;}
  function loop(){if(running()&&!S.raf){last=0;S.raf=requestAnimationFrame(frame);}}
  document.addEventListener('visibilitychange',loop);
  if(window.IntersectionObserver)new IntersectionObserver(function(es){vis=es[es.length-1].isIntersecting;loop();}).observe(stage);
  // ---- a journey: step by step, a pulse running each link, a caption naming the step ----
  var pl=function(){return g('ar-pl');};
  function journey(){return A.paths[S.path]||null;}
  function setPlayLabel(){if(!playB)return;playB.setAttribute('aria-pressed',S.playing?'true':'false');var sp=playB.querySelector('span'),p=playB.querySelector('path');
    if(sp)sp.textContent=S.playing?'Pause':(M?'Play':'Step through');if(p)p.setAttribute('d',S.playing?'M3 2H5V10H3ZM7 2H9V10H7Z':'M3 2L10 6L3 10Z');}
  function caption(){
    var J=journey();if(!cap)return;if(!J||S.step<0){cap.hidden=true;cap.innerHTML='';return;}
    var s=J.steps[S.step],bk=blockedHere(),bc=bk?A.nodes[J.block.part].check:null;
    cap.innerHTML='<span class="ar-capn">'+(S.step+1)+' / '+J.steps.length+'</span><span class="ar-capb"><span class="ar-capk">'+esc(J.name)+'</span><span class="ar-capt">'+esc(s.says)+'</span>'+
      (bk?'<span class="ar-capx" data-blocked="'+J.block.part+'"><span class="ar-tag '+(bc&&bc.stale?'needs">stale':'err">failing')+'</span>'+(bc?'<span class="ar-capc">'+esc(bc.title)+'</span>':'')+'</span>':'')+'</span>'+
      '<span class="ar-capb2"><button type="button" class="mx-b" data-button="step-prev" data-client="the step before" aria-label="The step before"'+(S.step<=0?' disabled':'')+'>&lsaquo;</button><button type="button" class="mx-b" data-button="step-next" data-client="the next step" aria-label="The next step"'+(S.step>=J.steps.length-1?' disabled':'')+'>&rsaquo;</button><button type="button" class="mx-b" data-button="stop-journey" data-client="stops the journey (Esc)" aria-label="Stop the journey">&times;</button></span>';
    cap.hidden=false;
  }
  function marks(){
    var J=journey();all('.ar-vis,.ar-cur,.ar-blk').forEach(function(e){e.classList.remove('ar-vis','ar-cur','ar-blk');});
    if(!J||S.step<0){stage.classList.remove('ar-playing');var p0=pl();if(p0)p0.innerHTML='';return;}
    stage.classList.add('ar-playing');var done=[];
    for(var k=0;k<=S.step;k++){var s=J.steps[k],ea=nodeEl(s.a),eb=nodeEl(s.b);if(ea)ea.classList.add('ar-vis');if(eb)eb.classList.add('ar-vis');
      if(k<S.step)done.push('<path class="ar-done" d="'+pathOf(s)+'"/>');}
    var c=J.steps[S.step],ca=nodeEl(c.a),cb=nodeEl(c.b);if(ca)ca.classList.add('ar-cur');if(cb)cb.classList.add('ar-cur');
    if(blockedHere()){var eb2=nodeEl(J.block.part);if(eb2)eb2.classList.add('ar-blk');}
    var p=pl();if(p)p.innerHTML=done.join('')+'<path class="ar-trail" id="ar-trail" d="'+pathOf(c)+'" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="'+(M&&S.playing?1:0)+'"/><circle class="ar-pulse" id="ar-pulse" r="4.5" transform="translate('+endOf(c).join(' ')+')"/>';
  }
  function cubicOf(s){if(s.l>=0&&L.links[s.l].c)return L.links[s.l].c;var A0=L.nodes[s.a],B0=L.nodes[s.b],x0=A0.x+A0.w/2,x3=B0.x+B0.w/2,down=A0.y<B0.y,y0=down?A0.y+A0.h:A0.y,y3=down?B0.y:B0.y+B0.h,dy=Math.max(36,Math.abs(y3-y0)/2);
    if(Math.abs(A0.y-B0.y)<2){y0=A0.y;y3=B0.y;var lift=34+Math.abs(x3-x0)*0.12;return [x0,y0,x0,y0-lift,x3,y3-lift,x3,y3];}
    return [x0,y0,x0,down?y0+dy:y0-dy,x3,down?y3-dy:y3+dy,x3,y3];}
  function pathOf(s){var c=cubicOf(s);return 'M'+c[0]+' '+c[1]+'C'+c[2]+' '+c[3]+' '+c[4]+' '+c[5]+' '+c[6]+' '+c[7];}
  function endOf(s){var c=cubicOf(s);return [c[6],c[7]];}
  // M4: the journey's first blocked step (a red or stale part); Play stops there, pins the part and the caption names the check
  function blockedHere(){var J=journey();return !!(J&&J.block&&S.step===J.block.step);}
  function halt(){var J=journey();S.playing=false;setPlayLabel();clearTimeout(S.timer);pin(J.block.part);caption();var c=A.nodes[J.block.part].check;
    say('Blocked at step '+(S.step+1)+': '+A.nodes[J.block.part].title+(c?(c.stale?', stale: ':', failing: ')+c.title:''));}
  function go(k){
    var J=journey();if(!J)return;clearTimeout(S.timer);cancelAnimationFrame(S.prf||0);S.step=Math.max(0,Math.min(J.steps.length-1,k));
    marks();caption();var s=J.steps[S.step];say('Step '+(S.step+1)+' of '+J.steps.length+': '+s.says);
    if(!(M&&S.playing)){if(S.halt&&blockedHere())halt();S.halt=0;return;}
    var c=cubicOf(s),t0=0,dur=1150,trail=g('ar-trail'),pulse=g('ar-pulse');
    (function run(t){if(!S.playing)return;if(!t0)t0=t;var p=Math.min(1,(t-t0)/dur),e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2,q=K.bez(c,e);
      if(pulse)pulse.setAttribute('transform','translate('+q[0].toFixed(1)+' '+q[1].toFixed(1)+')');if(trail)trail.setAttribute('stroke-dashoffset',(1-e).toFixed(3));
      if(p<1)S.prf=requestAnimationFrame(run);else if(blockedHere())halt();else S.timer=setTimeout(next,1500);})(performance.now());
  }
  function next(){var J=journey();if(!J)return;if(S.step>=J.steps.length-1){finish();return;}go(S.step+1);}
  function finish(){S.playing=false;setPlayLabel();caption();S.timer=setTimeout(function(){if(!S.playing)stop();},4200);}
  function play(){
    var J=journey();if(!J)return;
    if(S.playing){S.playing=false;clearTimeout(S.timer);cancelAnimationFrame(S.prf||0);setPlayLabel();marks();loop();return;}
    if(!M){var to=S.step<0?0:Math.min(S.step+1,J.steps.length-1);if(blockedHere())to=0;else if(J.block&&S.step<J.block.step)to=Math.min(to,J.block.step);S.halt=1;go(to);setPlayLabel();return;}
    S.playing=true;setPlayLabel();if(S.raf){cancelAnimationFrame(S.raf);S.raf=0;}
    if(S.step>=J.steps.length-1||blockedHere())S.step=-1;
    go(S.step+1);
  }
  function stop(){S.playing=false;clearTimeout(S.timer);cancelAnimationFrame(S.prf||0);S.step=-1;setPlayLabel();marks();caption();loop();}
  // a journey from the panel plays (a filter on moves to it); a journey's pill filters the diagram to it, pressed again clears
  function pickPath(i){if(!A.paths[i])return;stop();S.path=i;if(S.filter>=0&&S.filter!==i)filter(i);play();}
  function filter(i){
    var on=i>=0&&!!A.paths[i];S.filter=on?i:-1;if(on&&S.path!==i){stop();S.path=i;}
    [].forEach.call(root.querySelectorAll('[data-button="path-pick"]'),function(b){b.setAttribute('aria-pressed',on&&+b.getAttribute('data-path')===i?'true':'false');});
    filterMarks();makeDots();loop();say(on?'Showing the journey '+A.paths[i].name:'Showing every part');
  }
  function filterMarks(){
    var J=S.filter>=0?K.jset(A,S.filter):null;stage.classList.toggle('ar-filter',!!J);
    all('.ar-n').forEach(function(e){e.classList.toggle('ar-jn',!!J&&!!J.n[+e.getAttribute('data-i')]);});
    all('.ar-l').forEach(function(e){e.classList.toggle('ar-jl',!!J&&!!J.l[+e.getAttribute('data-l')]);});
  }
  // a lane folded to one bar, or open again; kept for the person on this project; the diagram is laid out again and fits once
  function toggleLane(bi){
    var b=A.bands[bi];if(!b||!b.n)return;var was=!!S.shut[bi];if(was)delete S.shut[bi];else S.shut[bi]=1;
    if(FD)FD.kit.write(FD.key,FD.kit.shut(FD.kit.read(FD.key),'lanes',D.project,b.id,!was));
    if(S.hov>=0&&S.shut[A.nodes[S.hov].b]){S.hov=-1;showTip(-1);}
    boot();loop();say(b.label+(was?' opened, ':' folded, ')+b.n+(b.n===1?' part':' parts'));
  }
  // ---- the pointer: the kit pans and hovers; a click pins (or closes the pin, on empty stage) ----
  stage.addEventListener('click',function(e){
    if(V.moved()>4){V.moved(0);return;}var t=e.target&&e.target.closest?e.target:null;if(!t||t.closest('.ar-strip,.ar-cap,.mx-mini'))return;
    var fl=t.closest('.ar-fold,.ar-shut');if(fl){toggleLane(+fl.getAttribute('data-b'));return;}
    var n=t.closest('.ar-n');if(n){var i=+n.getAttribute('data-i');if(i===S.pin)unpin();else pin(i);return;}
    if(S.pin>=0)unpin();
  });
  root.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target:null;if(!t)return;var b=t.closest('[data-button]');if(!b||b.disabled)return;var k=b.getAttribute('data-button');
    if(k==='play-journey'){play();return;}
    if(k==='path-pick'){var pi=+b.getAttribute('data-path');filter(pi===S.filter?-1:pi);return;}
    if(k==='path-play'){pickPath(+b.getAttribute('data-path'));return;}
    if(k==='step-prev'){S.playing=false;setPlayLabel();go(S.step-1);return;}
    if(k==='step-next'){S.playing=false;setPlayLabel();go(S.step+1);return;}
    if(k==='stop-journey'){stop();return;}
    if(k==='select-part'){pin(+b.getAttribute('data-i'));return;}
    if(k==='unpin'){unpin();return;}
    if(k==='zoom'){var z=stageSize();V.zoomAt(z.w/2,z.h/2,b.getAttribute('data-dir')==='in'?1.25:0.8);return;}
    if(k==='fit'){V.set(fitView(),true);return;}
  });
  // a crossing rule hovered (or focused) lights the parts it names
  function ruleOn(e){var li=e.target&&e.target.closest?e.target.closest('[data-rule]'):null;if(!li)return;var ids=(li.getAttribute('data-nodes')||'').split(' ').filter(Boolean).map(Number);if(!ids.length)return;S.ruleOn=0;lightRule(ids);S.ruleOn=1;li.classList.add('ar-ron');}
  function ruleOff(e){var li=e.target&&e.target.closest?e.target.closest('[data-rule]'):null;if(!li||!S.ruleOn)return;S.ruleOn=0;li.classList.remove('ar-ron');light(S.hov>=0?S.hov:S.pin);}
  [ov,insp].forEach(function(el){if(!el)return;el.addEventListener('mouseover',ruleOn);el.addEventListener('mouseout',ruleOff);el.addEventListener('focusin',ruleOn);el.addEventListener('focusout',ruleOff);});
  // ---- keys: Space plays, the arrows step a journey (or move between parts), Enter pins, Esc closes, + - 0 zoom ----
  document.addEventListener('keydown',function(e){
    var tg=e.target,tn=tg&&tg.tagName;if(tn==='INPUT'||tn==='TEXTAREA'||tn==='SELECT'||e.metaKey||e.ctrlKey||e.altKey)return;
    var pal=document.getElementById('pal');if(pal&&!pal.hidden)return;var k=e.key,onBtn=tn==='BUTTON'||tn==='A';
    // a lane's fold bar is a keyboard control (A2): Enter or Space folds or opens it; focus stays on the redrawn bar
    var fd=tg&&tg.closest?tg.closest('.ar-fold'):null;
    if(fd&&(k==='Enter'||k===' '||k==='Spacebar')){e.preventDefault();var fb=+fd.getAttribute('data-b');toggleLane(fb);var nf=stage.querySelector&&stage.querySelector('.ar-fold[data-b="'+fb+'"]');if(nf&&nf.focus)nf.focus();return;}
    if((k===' '||k==='Spacebar')&&!onBtn){if(!A.paths.length)return;e.preventDefault();play();return;}
    if(k==='Escape'){if(S.step>=0){stop();return;}if(S.pin>=0){unpin();return;}if(S.filter>=0)filter(-1);return;}
    if((k==='ArrowRight'||k==='ArrowLeft')&&S.step>=0){e.preventDefault();S.playing=false;setPlayLabel();go(S.step+(k==='ArrowRight'?1:-1));return;}
    if((k==='ArrowRight'||k==='ArrowLeft'||k==='ArrowDown'||k==='ArrowUp')&&tg===stage){e.preventDefault();var n=A.nodes.length,d=k==='ArrowRight'||k==='ArrowDown'?1:n-1,f=S.focus<0?(d===1?n-1:0):S.focus;
      // a part in a folded lane is passed over
      for(var c=0;c<n;c++){f=(f+d)%n;if(!L.nodes[f].s)break;}if(!L.nodes[f].s)focusPart(f);return;}
    if(k==='Enter'&&tg===stage&&S.focus>=0){e.preventDefault();pin(S.focus);return;}
    if(phone.matches)return;
    if(k==='+'||k==='='){var z=stageSize();V.zoomAt(z.w/2,z.h/2,1.25);return;}
    if(k==='-'||k==='_'){var z2=stageSize();V.zoomAt(z2.w/2,z2.h/2,0.8);return;}
    if(k==='0'){V.set(fitView(),true);}
  });
  function focusPart(i){S.focus=i;all('.ar-focus').forEach(function(e){e.classList.remove('ar-focus');});var e=nodeEl(i);if(e)e.classList.add('ar-focus');light(i);showTip(i);var n=A.nodes[i];say(n.title+(n.sub?', '+n.sub:'')+'. Enter pins it.');}
  // ---- boot: adopt the server's drawing (a phone: lay it out again narrow, scrolled with the page) ----
  // the layout that fits this stage best: the most parts a row holds, from 6 down to 3, the larger kept unless a smaller
  // one draws the diagram clearly bigger
  function bestLayout(){var z=stageSize(),most=0,cnt={},best=null,bs=-1,sk=shutKey();A.nodes.forEach(function(n){if(S.shut[n.b])return;cnt[n.b]=(cnt[n.b]||0)+1;most=Math.max(most,cnt[n.b]);});
    // a row that wraps tangles the links through it, so a wrapped layout must draw a quarter bigger to win
    [[6,200],[6,176],[6,154],[4,200],[3,200]].forEach(function(c){if(c[0]<6&&c[0]>=most)return;var X2=(c[0]===L.per&&c[1]===L.nw&&!L.narrow&&L.sk===sk)?L:K.layout(A,{per:c[0],nw:c[1],shut:S.shut}),s=Math.min(z.w/(X2.W+48),z.h/(X2.H+28))*(X2.wrap?0.8:1);if(s>bs*1.03){bs=s;best=X2;}});
    best=best||L;
    // the stage taller than the drawing: the bands move apart (more room for the links and their dots) while the width
    // still decides the scale
    var sw=z.w/(best.W+48);for(var sy=2.2;sy>1.01;sy-=0.2){var X3=K.layout(A,{per:best.per,nw:best.nw,sy:sy,shut:S.shut});if(z.h/(X3.H+28)>=sw)return X3;}
    return best;}
  var first=true;
  function boot(){
    if(phone.matches){L=K.layout(A,{narrow:true,shut:S.shut});world.innerHTML=K.draw(A,L,{still:!first});world.removeAttribute('transform');var b=box();svg.setAttribute('viewBox',b.x+' '+b.y+' '+b.w+' '+b.h);svg.setAttribute('preserveAspectRatio','xMidYMin meet');}
    else{var B=bestLayout();if(B!==L){L=B;world.innerHTML=K.draw(A,L,{still:!first});}var z=stageSize();svg.setAttribute('viewBox','0 0 '+z.w+' '+z.h);svg.removeAttribute('preserveAspectRatio');V.set(fitView());miniDraw();}
    filterMarks();makeDots();marks();if(S.pin>=0){var e=nodeEl(S.pin);if(e)e.classList.add('ar-pin');}first=false;
  }
  boot();
  if(phone.addEventListener)phone.addEventListener('change',function(){stop();boot();loop();});
  var lastZ=stageSize();
  var rt=0;if(window.ResizeObserver)new ResizeObserver(function(){if(phone.matches)return;var z=stageSize();if(Math.abs(z.w-lastZ.w)<1&&Math.abs(z.h-lastZ.h)<1)return;lastZ=z;clearTimeout(rt);rt=setTimeout(function(){boot();loop();},120);}).observe(stage);
  // the open animation runs once (CSS, u-motion only); then the class goes, so a redraw never replays it, and the dots start
  setTimeout(function(){world.classList.remove('ar-open');S.opened=true;loop();},M?1300:0);
  setPlayLabel();
  root.classList.add('ar-ready');
})();
`);

// ARCH_CLIENT_SRC: the view's script, READABLE (src/archview.js puts it after the SVG): the view kit's source (shared with
// the Map and the Screens view), the arch kit's own source, then the client. It is the INPUT of the build: what ships is
// src/archclientdata.js ARCH_CLIENT, this same script minified by tools/make-arch-client.mjs (esbuild, whitespace only —
// identifiers and structure untouched), and the gate regenerates it and fails on any drift, as it does src/doorcontract.js.
export const ARCH_CLIENT_SRC = `${ORG_PATH_CLIENT}${VIEW_KIT}var ARCHKIT=${strip(archKit.toString())};\n${CLIENT}`;
