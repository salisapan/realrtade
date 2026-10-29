/* Flow rich layer (v2 sample): reveal, hero 3D, chapters-free scroll effects, sticky story, Do It moment, deployment zone, calculator.
   No libraries. Passive scroll + rAF batching + IntersectionObserver. Respects prefers-reduced-motion and html.rm. */
(function(){
'use strict';
var d=document, root=d.documentElement;
var $=function(s,r){return (r||d).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||d).querySelectorAll(s))};
var clamp=function(v,a,b){return v<a?a:v>b?b:v};
var mq=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)');
var RM=!!(mq&&mq.matches); if(RM)root.classList.add('rm');
var main=$('.rc'); if(!main)return;
var ui=function(){return root.dataset.ui==='he'?'he':'en'};
var T=function(en,he){return ui()==='he'?he:en};
var nf=function(n,dec){try{return new Intl.NumberFormat(ui()==='he'?'he-IL':'en-US',{maximumFractionDigits:dec||0,minimumFractionDigits:dec||0}).format(n)}catch(e){return String(Math.round(n))}};
var fh=function(){var h=$('.fh');return h?h.offsetHeight:52};

/* ---------- language: [data-he] swaps, direction ---------- */
function splitWords(el,acc){
  var n=0;
  (function walk(node,inAcc){
    Array.prototype.slice.call(node.childNodes).forEach(function(c){
      if(c.nodeType===3){
        var parts=c.nodeValue.split(/(\s+)/), f=d.createDocumentFragment();
        parts.forEach(function(p){
          if(!p)return;
          if(/^\s+$/.test(p)){f.appendChild(d.createTextNode(' '));return}
          var w=d.createElement('span'); w.className='w';
          var s=d.createElement('span'); s.textContent=p; s.style.setProperty('--wi',n++); if(inAcc)s.className='acc-t';
          w.appendChild(s); f.appendChild(w);
        });
        node.replaceChild(f,c);
      }else if(c.nodeType===1){walk(c,inAcc||c.tagName==='EM')}
    });
  })(el,false);
}
function splitFill(el){
  var words=[];
  (function walk(node){
    Array.prototype.slice.call(node.childNodes).forEach(function(c){
      if(c.nodeType===3){
        var f=d.createDocumentFragment();
        c.nodeValue.split(/(\s+)/).forEach(function(p){
          if(!p)return;
          if(/^\s+$/.test(p)){f.appendChild(d.createTextNode(' '));return}
          var s=d.createElement('span'); s.className='sw'; s.textContent=p; words.push(s); f.appendChild(s);
        });
        node.replaceChild(f,c);
      }else if(c.nodeType===1){walk(c)}
    });
  })(el);
  el._words=words;
}
function paintLang(){
  var he=ui()==='he';
  main.lang=he?'he':'en'; main.dir=he?'rtl':'ltr';
  $$('[data-he]',main).forEach(function(el){
    if(el._en==null)el._en=el.innerHTML;
    el.innerHTML=he?el.getAttribute('data-he'):el._en;
    if(el.hasAttribute('data-split'))splitWords(el);
    if(el.hasAttribute('data-fill')){splitFill(el);fills=$$('[data-fill]',main)}
  });
  $$('[data-he-label]',main).forEach(function(el){if(el._l==null)el._l=el.getAttribute('aria-label');el.setAttribute('aria-label',he?el.getAttribute('data-he-label'):el._l)});
  $$('.eo',main).forEach(function(e){e.lang='en';e.dir='ltr'});
  renders.forEach(function(f){f()});
  tick(true);
}
var fills=[],renders=[];
new MutationObserver(function(){paintLang()}).observe(root,{attributes:true,attributeFilter:['data-ui']});

/* ---------- reveal ---------- */
var io;
function initReveal(){
  var els=$$('.rv',main);
  if(!('IntersectionObserver' in window)||RM){els.forEach(function(e){e.classList.add('in')});return}
  io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
  els.forEach(function(e){io.observe(e)});
}

/* ---------- hero 3D + scroll tick ---------- */
var heroes=$$('.rc-hero',main).map(function(h){
  var o=$('.obj',h);
  return {el:h,obj:o,rx:+(o&&o.dataset.rx||0),ry:+(o&&o.dataset.ry||0),brx:+(o&&o.dataset.rx||0),bry:+(o&&o.dataset.ry||0),px:0,py:0,hp:0,vis:true};
});
heroes.forEach(function(h){
  h.el.addEventListener('pointermove',function(e){
    if(e.pointerType==='touch')return;
    var r=h.el.getBoundingClientRect(); h.px=(e.clientX-r.left)/r.width-.5; h.py=(e.clientY-r.top)/r.height-.5;
  },{passive:true});
  h.el.addEventListener('pointerleave',function(){h.px=0;h.py=0},{passive:true});
});
if('IntersectionObserver' in window)heroes.forEach(function(h){new IntersectionObserver(function(es){h.vis=es[0].isIntersecting}).observe(h.el)});
var raf=0,loopOn=false,t0=performance.now();
function heroFrame(now){
  var any=false;
  heroes.forEach(function(h){
    if(!h.vis||!h.obj)return; any=true;
    var sy=window.scrollY||0, hp=clamp(sy/(h.el.offsetHeight*.85),0,1); h.hp=hp;
    var idle=RM?0:Math.sin((now-t0)/2600)*3.2;
    var tr=h.bry+hp*34+h.px*14+idle, tx=h.brx-hp*8-h.py*8;
    h.ry+=(tr-h.ry)*.09; h.rx+=(tx-h.rx)*.09;
    h.obj.style.setProperty('--rx',h.rx.toFixed(2)); h.obj.style.setProperty('--ry',h.ry.toFixed(2));
    h.el.style.setProperty('--hp',hp.toFixed(3));
  });
  if(!RM&&any)raf=requestAnimationFrame(heroFrame);else loopOn=false;
}
function startLoop(){if(RM){heroFrame(performance.now());return}if(!loopOn){loopOn=true;raf=requestAnimationFrame(heroFrame)}}

/* ---------- stories, fills, parallax ---------- */
var stories=$$('.rc-story',main), pars=$$('[data-par]',main);
function storyUpdate(s){
  var n=+s.dataset.n||4, pin=$('.pin',s), r=s.getBoundingClientRect(), top=fh()+6;
  var dist=Math.max(1,r.height-pin.offsetHeight);
  var p=RM||getComputedStyle(pin).position!=='sticky'?1:clamp((top-r.top)/dist,0,1);
  var si=RM?n-1:Math.min(n-1,Math.floor(p*n*.9999)), sp=clamp(p*n-si,0,1);
  if(RM||getComputedStyle(pin).position!=='sticky'){si=n-1;sp=1}
  s.style.setProperty('--p',p.toFixed(3)); s.style.setProperty('--sp',sp.toFixed(3));
  if(s.dataset.s!==String(si)){s.dataset.s=si}
  if(s._upd)s._upd(si,sp,p);
}
function fillUpdate(el){
  var w=el._words; if(!w||!w.length)return;
  var r=el.getBoundingClientRect(), vh=innerHeight;
  var p=clamp((vh*.9-r.top)/(vh*.55+r.height),0,1)*1.15;
  var N=w.length;
  for(var i=0;i<N;i++){w[i].style.setProperty('--o',clamp((p*(N+3)-i)/3,0,1).toFixed(2))}
}
var ticking=false;
function tick(force){
  if(ticking&&!force)return; ticking=true;
  requestAnimationFrame(function(){
    ticking=false;
    var vh=innerHeight;
    stories.forEach(function(s){var r=s.getBoundingClientRect();if(force||(r.bottom>-200&&r.top<vh+200))storyUpdate(s)});
    $$('[data-fill]',main).forEach(function(el){var r=el.getBoundingClientRect();if(force||(r.bottom>-100&&r.top<vh+100)){if(RM){if(el._words)el._words.forEach(function(w){w.style.setProperty('--o',1)})}else fillUpdate(el)}});
    if(!RM)pars.forEach(function(el){var r=el.getBoundingClientRect();if(r.bottom<-300||r.top>vh+300)return;var c=r.top+r.height/2-vh/2;el.style.transform='translate3d(0,'+(-c*(+el.dataset.par)).toFixed(1)+'px,0)'});
    if(RM||!loopOn)startLoop();
  });
}
addEventListener('scroll',function(){tick()},{passive:true});
addEventListener('resize',function(){tick(true)},{passive:true});

/* ---------- stories: page-specific updaters ---------- */
function bindBoard(s){
  var chips=$$('.ch',s), N=chips.length, bar=$('.bt i',s), bn=$('.bn',s), cnt=$('.bh span',s);
  s._upd=function(si,sp){
    var done=si<2?0:si===2?Math.min(N,Math.floor(sp*(N+1.4))):N;
    chips.forEach(function(c,i){c.classList.toggle('pr',si>=1&&i>=done);c.classList.toggle('dn',i<done)});
    if(cnt)cnt.textContent=nf(N-done);
    if(bar)bar.style.setProperty('--f',(done/N*100).toFixed(0)+'%'); if(bar)bar.parentNode.style.setProperty('--f',(done/N*100).toFixed(0)+'%');
    if(bn){
      bn.innerHTML=si<2?T('<b>'+N+' open loops.</b> Each one waits on someone.','<b>'+N+' משימות פתוחות.</b> כל אחת מחכה למישהו.')
        :si===2?T('<b>Closed '+done+' of '+N+'.</b> One tap each. Undo is always there.','<b>נסגרו '+done+' מתוך '+N+'.</b> נגיעה אחת לכל משימה. תמיד אפשר לבטל.')
        :T('<b>All closed.</b> The same people, with their time back.','<b>הכול סגור.</b> אותם אנשים, עם הזמן בחזרה.');
    }
  };
}
function bindDoc(s){
  s._upd=function(si,sp){};
}
function bindLayers(s){
  var st=$('.l3d',s);
  s._upd=function(si,sp,p){
    if(!st)return;
    var ex=RM?1:clamp(.3+p*1.6,.3,1);
    st.style.setProperty('--ex',ex.toFixed(3));
  };
}
stories.forEach(function(s){var k=s.dataset.kind;if(k==='board')bindBoard(s);else if(k==='layers')bindLayers(s)});

/* ---------- Do It live moment ---------- */
function haptic(){try{if(window.__haptic)window.__haptic()}catch(e){}}
function tween(el,prop,from,to,ms,cb){
  if(RM){el.style.setProperty(prop,to);cb&&cb();return}
  var t=performance.now();
  (function f(now){var k=clamp((now-t)/ms,0,1),e=1-Math.pow(1-k,3);el.style.setProperty(prop,(from+(to-from)*e).toFixed(3));if(k<1)requestAnimationFrame(f);else cb&&cb()})(t);
}
function initMoment(m){
  var btn=$('.doit',m), timers=[], started=false;
  function set(st){m.dataset.st=st; m.setAttribute('data-st',st)}
  function clear(){timers.forEach(clearTimeout);timers=[]}
  function later(fn,ms){timers.push(setTimeout(fn,ms))}
  function close(){
    clear(); if(m.dataset.st==='done')return;
    btn.style.setProperty('--pr',1);
    setTimeout(function(){btn.style.setProperty('--pr',0)},150);
    if(m.dataset.st!=='prep'){set('prep')}
    later(function(){tween(btn,'--md',0,1,520);set('done')},170);
  }
  function undo(){clear();tween(btn,'--md',1,0,420);set('prep')}
  function run(){
    if(started)return; started=true;
    if(RM){set('done');btn.style.setProperty('--md',1);return}
    later(function(){set('noticed')},500);
    later(function(){set('prep')},1700);
    later(function(){btn.classList.add('pulse')},3200);
    later(function(){close()},4000);
  }
  btn.addEventListener('click',function(e){e.preventDefault();started=true;close()});
  var u=$('.undo',m); if(u)u.addEventListener('click',function(){undo()});
  set('idle');
  if('IntersectionObserver' in window&&!RM){var o=new IntersectionObserver(function(es){if(es[0].isIntersecting){run();o.disconnect()}},{threshold:+(m.dataset.th||.6)});o.observe(m)}else run();
}
$$('.mm,.ibx',main).forEach(initMoment);

/* ---------- deployment selector (default: masked secure cloud) ---------- */
var zoneApi=null, calcApi=null;
function initDsel(g){
  var opts=$$('.opt',g);
  function pick(o,focus){
    opts.forEach(function(x){var on=x===o;x.setAttribute('aria-checked',on);x.tabIndex=on?0:-1});
    if(focus)o.focus();
    g.dataset.val=o.dataset.m;
    var sc=g.closest('[data-zone-scope]');if(sc)sc.setAttribute('data-dep',o.dataset.m);
    var ev=new CustomEvent('dsel',{detail:o.dataset.m,bubbles:true});g.dispatchEvent(ev);
  }
  opts.forEach(function(o,i){
    o.addEventListener('click',function(){pick(o)});
    o.addEventListener('keydown',function(e){
      var k=e.key, dir=(root.dataset.ui==='he')?-1:1, j=-1;
      if(k==='ArrowRight'||k==='ArrowDown')j=(i+dir+opts.length)%opts.length; else if(k==='ArrowLeft'||k==='ArrowUp')j=(i-dir+opts.length)%opts.length;
      if(j>=0){e.preventDefault();pick(opts[j],true)}
    });
  });
  var def=opts.filter(function(o){return o.getAttribute('aria-checked')==='true'})[0]||opts[0];
  pick(def);
}
$$('.dsel',main).forEach(initDsel);

/* ---------- live zone (data stays inside) ---------- */
var ZN={
  cloud:{nodes:{n1:['Your computer','המחשב שלך','Sensitive data stays here','המידע הרגיש נשאר כאן'],n2:['Masking','מיסוך','Real values become tokens','ערכים אמיתיים הופכים לסימונים'],n3:['Flow secure cloud','ענן מאובטח של Flow','Works on masked text only','עובד על טקסט ממוסך בלבד']},
    wires:{w1:'on',w2:'on',w3:'hid'},bnd:'Your side',bndHe:'הצד שלך',bw:'63%',
    pts:[['Masked before it leaves.','ממוסך לפני שהוא יוצא.','Sensitive fields are replaced with placeholders on your side.','שדות רגישים מוחלפים בסימונים בצד שלך.'],
         ['The cloud sees placeholders.','הענן רואה סימונים.','The model works on the masked version, not the real identifier.','המודל עובד על הגרסה הממוסכת, לא על המזהה האמיתי.'],
         ['The mapping stays with you.','המיפוי נשאר אצלך.','Real values come back only on your side, after a person approves.','הערכים האמיתיים חוזרים רק בצד שלך, אחרי אישור של אדם.']],
    start:'n1',seq:[{w:'w1',d:1,m:false,arr:'n2'},{w:'w2',d:1,m:true,arr:'n3'}]},
  edge:{nodes:{n1:['Employee computer','מחשב העובד','Flow-Edge runs here','Flow-Edge רץ כאן'],n2:['Flow-Edge','Flow-Edge','Processing on the device','עיבוד על המכשיר'],n3:['External cloud','ענן חיצוני','Raw data is never sent','מידע גולמי לא נשלח לשם']},
    wires:{w1:'on',w2:'dim',w3:'hid'},bnd:'Employee computer',bndHe:'מחשב העובד',bw:'63%',off:['n3'],blk:{x:66.5,y:62},
    pts:[['Stored on the employee’s computer.','נשמר במחשב העובד.','Data is kept only on the employee’s own computer.','המידע נשמר רק במחשב של העובד עצמו.'],
         ['Never leaves it.','לא עוזב אותו.','There is no path to an external cloud for the raw data.','אין נתיב של המידע הגולמי לענן חיצוני.'],
         ['Fits computers with suitable hardware.','מתאים למחשבים עם חומרה מתאימה.','Flow-Edge is for computers that can run it.','Flow-Edge מיועד למחשבים שיכולים להריץ אותו.']],
    start:'n1',seq:[{w:'w1',d:1,m:true,arr:'n2'},{w:'w1',d:-1,m:true,arr:'n1'}]},
  onprem:{nodes:{n1:['Employees','עובדים','Office network','רשת המשרד'],n2:['Flow-On-Prem','Flow-On-Prem','Dedicated server in your office','שרת ייעודי במשרד שלך'],n3:['Your systems','המערכות שלך','Documents and files','מסמכים וקבצים'],n4:['Internet','האינטרנט','Nothing goes out','שום דבר לא יוצא']},
    wires:{w1:'on',w2:'on',w3:'dim'},bnd:'Your office network',bndHe:'רשת המשרד שלך',bw:'95%',off:['n4'],blk:{x:50,y:36},
    pts:[['Inside the office network.','בתוך רשת המשרד.','A dedicated server sits in your own internal network.','שרת ייעודי יושב ברשת הפנימית של המשרד שלך.'],
         ['Nothing goes to an external cloud.','שום דבר לא הולך לענן חיצוני.','Data never goes to an external cloud.','המידע לא עובר לענן חיצוני.'],
         ['Your people, your systems, one closed loop.','האנשים שלך, המערכות שלך, מעגל סגור.','Work is prepared inside; a person approves it.','העבודה מוכנה בפנים, ואדם מאשר אותה.']],
    start:'n1',seq:[{w:'w1',d:1,m:true,arr:'n2'},{w:'w2',d:1,m:true,arr:'n3'},{w:'w2',d:-1,m:true,arr:'n2'},{w:'w1',d:-1,m:true,arr:'n1'}]}
};
function initZone(zn){
  var dot=$('.dot',zn), blkEl=$('.blk',zn), wires={w1:$('#zw1',zn),w2:$('#zw2',zn),w3:$('#zw3',zn)};
  var mode='cloud', gen=0, ptsEl=$('.pts',zn), bl=$('.bnd-l span',zn), vis=true, timer=0;
  var pos=function(id,f){var p=wires[id];return p.getPointAtLength(clamp(f,0,1)*p.getTotalLength())};
  var place=function(x,y){dot.style.left=x+'%';dot.style.top=y+'%'};
  function setActive(id){['n1','n2','n3','n4'].forEach(function(n){$('#zn-'+n,zn).classList.toggle('act',n===id)})}
  function render(){
    var Z=ZN[mode], he=ui()==='he', k=he?1:0;
    zn.dataset.m=mode; $('.bnd',zn).style.width=Z.bw;
    ['n1','n2','n3','n4'].forEach(function(id){
      var el=$('#zn-'+id,zn), v=Z.nodes[id]; el.classList.toggle('hid',!v); if(!v)return;
      $('b',el).textContent=v[k]; $('small',el).textContent=v[2+k];
      el.classList.toggle('off',!!(Z.off&&Z.off.indexOf(id)>=0));
    });
    ['w1','w2','w3'].forEach(function(w){var c=Z.wires[w];wires[w].setAttribute('class','wire'+(c==='on'?' on':'')+(c==='dim'?' dim':''));wires[w].style.display=c==='hid'?'none':''});
    if(bl)bl.textContent=he?Z.bndHe:Z.bnd;
    if(Z.blk){blkEl.style.left=Z.blk.x+'%';blkEl.style.top=Z.blk.y+'%';blkEl.classList.remove('hid')}else blkEl.classList.add('hid');
    ptsEl.innerHTML=Z.pts.map(function(p,i){return '<div class="pt"><span class="num-r">'+(i+1)+'</span><div><b>'+p[k]+'</b> '+p[2+k]+'</div></div>'}).join('');
    run();
  }
  function run(){
    var my=++gen, Z=ZN[mode]; clearTimeout(timer);
    setActive(Z.start);
    var s0=Z.seq[0], q0=pos(s0.w,s0.d>0?0:1); place(q0.x,q0.y); dot.classList.toggle('m',mode!=='cloud');
    if(RM){return}
    var i=0;
    function step(){
      if(my!==gen||!vis)return;
      var s=Z.seq[i%Z.seq.length], from=s.d>0?0:1, to=s.d>0?1:0;
      if(i%Z.seq.length===0){var qs=pos(s.w,from);place(qs.x,qs.y);setActive(Z.start);dot.classList.toggle('m',mode!=='cloud')}
      if(s.m)dot.classList.add('m');
      var t=performance.now(),dur=1200;
      (function f(now){
        if(my!==gen)return;
        var k=clamp((now-t)/dur,0,1),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,q=pos(s.w,from+(to-from)*e);
        place(q.x,q.y);
        if(k<1)requestAnimationFrame(f);
        else{setActive(s.arr);i++;timer=setTimeout(step,i%Z.seq.length===0?1100:600)}
      })(t);
    }
    timer=setTimeout(step,500);
  }
  var dg=$('.dsel',zn.closest('[data-zone-scope]')||main)||$('.hs-segc',main);
  if(dg){dg.addEventListener('dsel',function(e){mode=e.detail;render()});mode=dg.dataset.val||'cloud'}
  if('IntersectionObserver' in window)new IntersectionObserver(function(es){var v=es[0].isIntersecting;if(v&&!vis){vis=true;run()}else if(!v){vis=false;gen++}}).observe(zn);
  renders.push(render); render();
}
$$('.zn',main).forEach(initZone);

/* ---------- calculator: office force multiplier ---------- */
function initCalc(cx){
  var q=function(id){return $('#'+id,cx)}, ins={emp:q('cx-emp'),proc:q('cx-proc'),tpw:q('cx-tpw'),min:q('cx-min')};
  var out={tasks:q('o-tasks'),hrs:q('o-hrs'),per:q('o-per'),ppl:q('o-ppl'),mult:q('o-mult'),base:q('o-base'),mx:q('o-mx')};
  var shown=0, anim=0;
  function lab(id,v){var o=q('v-'+id);if(o)o.textContent=nf(v)}
  function calc(){
    var e=+ins.emp.value,p=+ins.proc.value,t=+ins.tpw.value,m=+ins.min.value;
    ['emp','proc','tpw','min'].forEach(function(k){var r=ins[k];r.style.setProperty('--v',((r.value-r.min)/(r.max-r.min)*100).toFixed(1)+'%');lab(k,+r.value);r.setAttribute('aria-valuetext',nf(+r.value))});
    var tasks=Math.round(e*p*t*4.33), hrs=tasks*m/60, per=hrs/e, ppl=hrs/160, mult=1+hrs/(e*160);
    out.hrs.textContent=nf(hrs); out.per.textContent=nf(per,1); out.ppl.textContent=nf(ppl,1); out.mult.textContent='×'+nf(mult,2);
    out.mx.textContent='×'+nf(mult,2);
    cx.style.setProperty('--w0',(100/mult).toFixed(1)+'%');
    var from=shown,to=tasks; cancelAnimationFrame(anim);
    if(RM){out.tasks.textContent=nf(to);shown=to}
    else{var t0=performance.now();(function f(now){var k=clamp((now-t0)/380,0,1),v=from+(to-from)*(1-Math.pow(1-k,3));out.tasks.textContent=nf(Math.round(v));shown=v;if(k<1)anim=requestAnimationFrame(f)})(t0)}
  }
  Object.keys(ins).forEach(function(k){ins[k].addEventListener('input',calc)});
  var dg=$('.dsel,.hs-segc',main);
  var pill=$('.dpl .nm',cx);
  var names={cloud:["Flow’s dedicated secure cloud","הענן המאובטח הייעודי של Flow"],edge:["Flow-Edge","Flow-Edge"],onprem:["Flow-On-Prem","Flow-On-Prem"]};
  function setup(){var v=(dg&&dg.dataset.val)||'cloud';if(pill)pill.textContent=names[v][ui()==='he'?1:0];var df=$('.dpl .pill',cx);if(df)df.style.display=v==='cloud'?'':'none'}
  if(dg)dg.addEventListener('dsel',setup);
  renders.push(function(){setup();calc()});
  setup();calc();
}
$$('.cx',main).forEach(initCalc);

/* ---------- v2b: glass tiers sheen, calendar, closures feed ---------- */
$$('.gt',main).forEach(function(t){
  if(RM)return;
  t.addEventListener('pointermove',function(e){if(e.pointerType==='touch')return;var r=t.getBoundingClientRect();t.style.setProperty('--mx',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');t.style.setProperty('--my',((e.clientY-r.top)/r.height*100).toFixed(1)+'%')});
});
function onView(el,th,fn){
  if(!('IntersectionObserver' in window)||RM){fn();return}
  var o=new IntersectionObserver(function(es){if(es[0].isIntersecting){fn();o.disconnect()}},{threshold:th});o.observe(el);
}
$$('.cal',main).forEach(function(c){
  onView(c,.3,function(){c.classList.add('go')});
  var u=$('.undo',c);
  if(u)u.addEventListener('click',function(){var off=c.classList.toggle('off');if(!off)c.classList.add('go');u.setAttribute('aria-pressed',off)});
});
$$('.cls',main).forEach(function(c){
  var pend=$$('.cr.pend',c);
  if(RM){c.classList.add('go');pend.forEach(function(x){x.classList.remove('pend')});return}
  onView(c,.25,function(){c.classList.add('go');setTimeout(function(){pend.forEach(function(x){x.classList.remove('pend')})},2600)});
});

/* ---------- boot ---------- */
$$('[data-fill]',main).forEach(splitFill);
initReveal(); paintLang();
$$('.rc-story',main).forEach(function(s){s.dataset.s='0'});
/* ---------- v4: below 900px the pinned stories become one deliberate step each (stage + caption), no pin ---------- */
var v4mq=matchMedia('(max-width:899px)'),v4made=[];
function v4Steps(){
  v4made.forEach(function(n){n.remove()}); v4made=[];
  $$('.rc-story:not(.v4-ms)',main).forEach(function(s){s.classList.remove('v4-off')});
  if(!v4mq.matches)return;
  $$('.rc-story:not(.v4-ms)',main).forEach(function(s){
    var stg=$('.stg',s),caps=$$('.cap',s),k=s.dataset.kind,n=caps.length,host=document.createElement('div');
    if(!stg||!n)return;
    host.className='v4-steps';
    caps.forEach(function(cap,i){
      var c=document.createElement('div');
      c.className='rc-story v4-ms';c.dataset.s=String(i);c.dataset.n=String(n);if(k)c.dataset.kind=k;
      c.style.setProperty('--p',((i+1)/n).toFixed(3));c.style.setProperty('--sp','.6');
      var pin=document.createElement('div');pin.className='pin';
      var g=stg.cloneNode(true);$$('[id]',g).forEach(function(e){e.removeAttribute('id')});
      var cw=document.createElement('div');cw.className='cw';var cs=document.createElement('div');cs.className='caps';
      cs.appendChild(cap.cloneNode(true));cw.appendChild(cs);pin.appendChild(g);pin.appendChild(cw);c.appendChild(pin);
      c.classList.add('rv');host.appendChild(c);
      if(k==='board'){bindBoard(c);c._upd(i,.6,(i+1)/n)}else if(k==='layers'){bindLayers(c);c._upd(i,.6,(i+1)/n)}
    });
    s.classList.add('v4-off');s.parentNode.insertBefore(host,s.nextSibling);v4made.push(host);
    if('IntersectionObserver' in window&&!RM){
      var io2=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io2.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
      $$('.v4-ms',host).forEach(function(e){io2.observe(e)});
    }else $$('.v4-ms',host).forEach(function(e){e.classList.add('in')});
  });
}
v4Steps(); (v4mq.addEventListener?v4mq.addEventListener('change',v4Steps):v4mq.addListener(v4Steps));
function go(){heroes.forEach(function(h){h.el.classList.add('go')});tick(true);startLoop()}
if(d.fonts&&d.fonts.ready)d.fonts.ready.then(function(){setTimeout(go,60)});else setTimeout(go,200);
setTimeout(go,900);
})();
