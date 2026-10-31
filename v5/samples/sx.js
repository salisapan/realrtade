/* Security S1 · scroll stage + deployment switch. Transform/opacity only; the pinned stage never changes size, so nothing jumps.
   ?fx=p1|p2|p3 overrides the variant. ?cap=1 = capture mode (manual fixed-step spring, used for frame-exact video and measurement). */
(function(){
 var d=document,root=d.documentElement,Q=new URLSearchParams(location.search);
 var RM=matchMedia('(prefers-reduced-motion:reduce)').matches||root.classList.contains('rm');
 var CAP=Q.get('cap')==='1';
 var ui=function(){return root.dataset.ui==='he'?'he':'en'};
 var clamp=function(v,a,b){return v<a?a:v>b?b:v};
 var sm=function(a,b,x){var t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};

 /* ---------- deployment switch (pricing pattern, Hebrew + English notes) ---------- */
 var N={
  cloud:{he:'<b>הענן המאובטח הייעודי של Flow.</b> כל המידע הרגיש ממוסך לפני כל עיבוד.',en:'<b>Flow’s dedicated secure cloud.</b> All sensitive data is masked before any processing.'},
  edge:{he:'<b>Flow-Edge.</b> המידע נשמר רק במחשב של העובד ולא עוזב אותו.',en:'<b>Flow-Edge.</b> Data is stored only on the employee’s own computer and never leaves it.'},
  onprem:{he:'<b>Flow-Onprem.</b> שרת ייעודי ברשת הפנימית של המשרד. המידע לא עובר לענן חיצוני.',en:'<b>Flow-Onprem.</b> A dedicated server inside the office’s internal network. Data never goes to an external cloud.'}};
 var g=d.querySelector('.sx-dep .hs-segc');
 if(g){
  var note=d.querySelector('.sx-dep .hs-segnote'),bs=[].slice.call(g.querySelectorAll('button')),scope=d.querySelector('.sx-dep [data-zone-scope]')||d.querySelector('.sx-dep'),cur=0;
  var paint=function(){note.innerHTML=N[bs[cur].dataset.m][ui()]};
  var opSync=function(){window.__opModel=bs[cur].dataset.m;if(window.__opRender)window.__opRender()};
  var set=function(i,user){cur=i;bs.forEach(function(b,j){b.setAttribute('aria-checked',j===i?'true':'false');b.tabIndex=j===i?0:-1});g.style.setProperty('--i',i);
   var sh=g.querySelector('.hs-do .shine');if(sh&&user){sh.classList.remove('sw');void sh.offsetWidth;sh.classList.add('sw')}
   scope.setAttribute('data-dep',bs[i].dataset.m);g.dataset.val=bs[i].dataset.m;paint();opSync()};
  bs.forEach(function(b,i){b.addEventListener('click',function(){set(i,1)});b.addEventListener('keydown',function(e){var k=e.key,dd=(k==='ArrowRight'||k==='ArrowDown')?1:(k==='ArrowLeft'||k==='ArrowUp')?-1:0;if(dd){e.preventDefault();if(ui()==='he')dd=-dd;var n=(i+dd+3)%3;set(n,1);bs[n].focus()}})});
  ['pointerdown'].forEach(function(e){g.addEventListener(e,function(){g.classList.add('press')})});['pointerup','pointercancel','pointerleave'].forEach(function(e){g.addEventListener(e,function(){g.classList.remove('press')})});
  new MutationObserver(function(){paint();opSync()}).observe(root,{attributes:true,attributeFilter:['data-ui']});
  set(0,0);
 }

 /* ---------- scroll stage ---------- */
 var fx=d.querySelector('.sx-fx');if(!fx)return;
 var v=Q.get('fx');if(/^p[123]$/.test(v))fx.setAttribute('data-fx',v);
 var track=fx.querySelector('.sx-track'),pin=fx.querySelector('.sx-pin'),st=fx.querySelector('.sx-st'),parts=[].slice.call(fx.querySelectorAll('.sx-part')),cap=fx.querySelector('.sx-cap');
 var VARIANT=function(){return fx.getAttribute('data-fx')};
 if(RM){fx.classList.add('sx-static')}
 /* progress windows on p in 0..1 */
 var W0=.26,SEQ=[.30,.50,.70,.90]; /* three segments: [.30,.50] [.50,.70] [.70,.90] */
 function vars(p){
  var s=sm(.08,.26,p);
  var g=sm(.27,.31,p)*(1-sm(.90,.96,p));
  var rec=sm(.90,.96,p);
  var a=[0,0,0];
  for(var k=0;k<3;k++){var st0=SEQ[k],en=SEQ[k+1];var up=sm(st0-.045,st0+.045,p);var dn=k<2?1-sm(en-.045,en+.045,p):1;a[k]=up*dn}
  var out={s:s,g:g,parts:[]};
  var wsum=a[0]+a[1]+a[2],ci=wsum>0?(a[1]*1+a[2]*2)/wsum:1;
  for(var i=0;i<3;i++){
   var act=a[i]*g;
   var f=1-g*(1-a[i]);
   var e=Math.max(act,rec);
   out.parts.push({f:f,e:e,a:act});
  }
  out.ci=ci;out.co=Math.max(0,Math.min(1,wsum))*sm(.27,.31,p)*(1-sm(.89,.93,p));
  return out;
 }
 function apply(p){
  var o=vars(p);
  fx.style.setProperty('--sp',p.toFixed(4));
  st.style.setProperty('--s',o.s.toFixed(4));
  parts.forEach(function(el,i){var q=o.parts[i];el.style.setProperty('--s',o.s.toFixed(4));el.style.setProperty('--f',q.f.toFixed(4));el.style.setProperty('--e',q.e.toFixed(4));el.style.setProperty('--a',q.a.toFixed(4))});
  if(cap){cap.style.setProperty('--ci',o.ci.toFixed(4));cap.style.setProperty('--co',o.co.toFixed(4))}
 }
 function target(){
  if(RM)return .97;
  var r=track.getBoundingClientRect(),tot=track.offsetHeight-pin.offsetHeight;
  return clamp(-r.top/Math.max(1,tot),0,1);
 }
 /* soft critically damped spring on p */
 var x=target(),vel=0,K=150,C=2*Math.sqrt(K)*.98,last=0,on=false,vis=true;
 function stepSpring(dt){var t=target();var n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;for(var i=0;i<n;i++){var acc=K*(t-x)-C*vel;vel+=acc*h;x+=vel*h}return Math.abs(t-x)>.0004||Math.abs(vel)>.002}
 function frame(ts){
  on=false;
  var dt=last?Math.min(.05,(ts-last)/1000):1/60;last=ts;
  var moving=stepSpring(dt);apply(x);
  if(moving&&vis&&!CAP){on=true;requestAnimationFrame(frame)}else last=0;
 }
 function kick(){if(CAP||on||RM)return;on=true;requestAnimationFrame(frame)}
 addEventListener('scroll',kick,{passive:true});addEventListener('resize',function(){kick()});
 if('IntersectionObserver' in window)new IntersectionObserver(function(es){vis=es[0].isIntersecting;if(vis)kick()},{rootMargin:'200px 0px'}).observe(track);
 apply(x);kick();
 /* test hooks */
 window.__sx={step:function(n){for(var i=0;i<(n||1);i++){stepSpring(1/60)}apply(x);return x},jump:function(){x=target();vel=0;apply(x);return x},p:function(){return x},target:target};
})();
