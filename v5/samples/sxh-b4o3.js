/* Security S1 hero, variant B4 (B3 plus: caption with no box, lift + depth of field + inter-layer shadow driven by --l, live in-plane content).
   The stack never moves in the layout: lift is a small translateZ inside the 3D object. x (the spring-smoothed scroll position through the pinned track, 0..1)
   drives everything through lights(x). Live content runs on one clock T (seconds): real time live, +1/60 per step() in capture mode, so video frames are exact.
   ?cap=1 = capture mode. Hook: window.__sxh */
(function(){
 var d=document,root=d.documentElement,Q=new URLSearchParams(location.search);
 var sec=d.querySelector('.sx-hx');if(!sec)return;
 var RM=matchMedia('(prefers-reduced-motion:reduce)').matches||root.classList.contains('rm')||Q.get('still')==='1';
 var CAP=Q.get('cap')==='1';
 var clamp=function(v,a,b){return v<a?a:v>b?b:v};
 var sm=function(a,b,x){var t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
 var track=sec.querySelector('.hx-track'),pin=sec.querySelector('.hx-pin');
 var pls=[].slice.call(sec.querySelectorAll('.hs-pl')),caps=[].slice.call(sec.querySelectorAll('.hx-cap')),lis=[].slice.call(sec.querySelectorAll('.hs-spec li'));
 if(RM)sec.classList.add('hx-static');
 var C0=.05,STEP=.2375,ls=[0,0,0,0],act=-1,LA=0,T=0,t0=[0,0,0,0],was=[false,false,false,false],PL=[null,null,null,null],DIM=.58,OPEN=sec.hasAttribute('data-open');if(OPEN)DIM=.62;var FB=OPEN?.05:.12;
 /* B3: lighting is a continuous function of the (spring-smoothed) scroll position x. u runs 0..4 through the four layers.
    layer j has a plateau around its centre j+.5 and cross-fades with its neighbour across ~.4 of a step. No state, no jumps. */
 var pick=function(p){return Math.min(3,Math.max(0,Math.floor((p-C0)/STEP)))};
 function lights(xv){
  var u=(xv-C0)/STEP,out=[0,0,0,0],A=sm(-.25,.35,u);
  for(var j=0;j<4;j++){
   var c=j+.5,d=Math.abs(u-c);
   if(j===0&&u<c)d=0;if(j===3&&u>c)d=0;
   out[j]=1-sm(.3,.7,d);
  }
  return {l:out,A:A};
 }
 function apply(){
  var A=LA,W=sm(.3,.7,A);
  pls.forEach(function(el,i){var k=+el.style.getPropertyValue('--k');if(isNaN(k))k=i;PL[k]=el;
   var l=clamp(ls[k],0,1);var fb=0;for(var q=0;q<k;q++)fb=Math.max(fb,clamp(ls[q],0,1));var dk=DIM+FB*fb;el.style.setProperty('--dk',dk.toFixed(4));el.style.setProperty('--l',l.toFixed(4));el.style.setProperty('--a',A.toFixed(4));
   if(k<3){var lu=clamp(ls[k+1],0,1),ou=1-(DIM+.12*Math.max.apply(null,[0].concat(ls.slice(0,k).map(function(v){return clamp(v,0,1)}))))*A*(1-lu);{var sdv=clamp(ou*(.6+.4*lu*A),0,1);
    /* B4-open: the shadow cast on this plane by the plane above grows with that plane's light (0.3 at rest to 1.0 when it is the active one); it is divided by this plane's own opacity so the frosted inactive glass still shows it at full strength */
    if(OPEN){var dkk=DIM+FB*Math.max.apply(null,[0].concat(ls.slice(0,k).map(function(v){return clamp(v,0,1)})));var opk=1-dkk*A*(1-l);sdv=clamp(A*(.3+.7*lu)/Math.max(.2,opk),0,1)}
    el.style.setProperty('--sd',sdv.toFixed(4))}}});
  lis.forEach(function(el,i){el.style.setProperty('--l',(clamp(ls[i],0,1)*sm(.55,.95,A)).toFixed(4))});
  caps.forEach(function(el,i){var cv=(i<4?sm(.1,.9,clamp(ls[i],0,1))*W:1-W);/* B4-open: one caption at a time. The intro line is fully gone (A .35) before the first caption starts (A .4), and neighbouring layer captions only show above l .55 (the two lights sum to 1 in a handoff, so they can never both pass it) */if(OPEN)cv=i<4?sm(.55,.95,clamp(ls[i],0,1))*sm(.4,.7,A):1-sm(.1,.35,A);el.style.setProperty('--c',cv.toFixed(4))});
  live();
 }
 /* live content: one loop per layer, restarted when the layer becomes active. Every value is blended with the layer's own light g, so at g=0 the layer looks exactly like the static original. */
 var swEl=d.getElementById('hx-sw');
 function sv(k,n,v){if(PL[k])PL[k].style.setProperty(n,v.toFixed(4))}
 function live(){
  if(RM)return;
  var A=LA,g=[0,0,0,0],lt=[0,0,0,0];
  for(var k=0;k<4;k++){
   g[k]=clamp(ls[k],0,1)*sm(.3,.7,A);
   if(g[k]>.5&&!was[k]){was[k]=true;t0[k]=T}else if(g[k]<.12)was[k]=false;
   lt[k]=Math.max(0,T-t0[k]);
  }
  /* 0 Encryption: a band sweeps across the hatch (data pass) and the frame seals */
  var p=lt[0]%4.4,e=sm(.2,2.9,p);
  if(swEl)swEl.setAttribute('gradientTransform','translate('+(-95+e*290).toFixed(2)+','+(-95+e*290).toFixed(2)+')');
  sv(0,'--en',g[0]*(1-sm(3.5,4.0,p))*sm(.1,.4,p));
  sv(0,'--q',g[0]*sm(1.6,2.8,p)*(1-sm(3.6,4.3,p)));
  /* 1 Masking: each field bar swaps to a token (shorter, solid) in turn, then back */
  p=lt[1]%5.4;
  for(var i=0;i<3;i++)sv(1,'--m'+i,g[1]*sm(.5+.3*i,1.1+.3*i,p)*(1-sm(3.5+.25*i,4.1+.25*i,p)));
  /* 2 Permissions: approvals tick in one by one, then clear */
  p=lt[2]%6.2;
  for(var i=0;i<3;i++)sv(2,'--a'+i,g[2]*sm(.6+.8*i,1.25+.8*i,p)*(1-sm(4.9,5.6,p)));
  /* 3 Audit: a new record is appended at the end of the trail (dot, then line), rests, then the trail returns to its recorded state */
  p=lt[3]%5.2;var q=1-g[3];
  sv(3,'--rd',q+g[3]*sm(.4,1.1,p));sv(3,'--rl',q+g[3]*sm(.8,1.8,p));sv(3,'--ro',q+g[3]*(1-sm(4.4,5.0,p)));sv(3,'--rn',g[3]*sm(.8,1.3,p)*(1-sm(2.8,4.2,p)));
 }
 function target(){
  if(RM)return 0;
  var r=track.getBoundingClientRect(),tot=track.offsetHeight-pin.offsetHeight;
  return clamp(-r.top/Math.max(1,tot),0,1);
 }
 function light(){var o=lights(x);for(var j=0;j<4;j++)ls[j]=o.l[j];LA=o.A;act=pick(x)}
 var x=target(),vel=0,K=170,Cd=2*Math.sqrt(K)*.98,last=0,on=false,vis=true;
 /* x chases the scroll position with a critically damped spring (ease in/out, no overshoot); the lighting is a pure function of x */
 function stepSpring(dt){var t=target(),n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;for(var i=0;i<n;i++){var acc=K*(t-x)-Cd*vel;vel+=acc*h;x+=vel*h}light();return Math.abs(t-x)>.0004||Math.abs(vel)>.002}
 function frame(ts){
  on=false;var dt=last?Math.min(.05,(ts-last)/1000):1/60;last=ts;T+=dt;
  stepSpring(dt);apply();
  if(vis&&!CAP&&!RM){on=true;requestAnimationFrame(frame)}else last=0;
 }
 function kick(){if(CAP||on||RM)return;on=true;requestAnimationFrame(frame)}
 addEventListener('scroll',kick,{passive:true});addEventListener('resize',function(){fitDiagram();kick()});
 if('IntersectionObserver' in window)new IntersectionObserver(function(es){vis=es[0].isIntersecting;if(vis)kick()},{rootMargin:'200px 0px'}).observe(track);
 /* deployment diagram scale: the original component is 1120 wide; on wide screens it is scaled up as one piece to the column width */
 function fitDiagram(){var op=d.getElementById('onprem');if(!op)return;var inn=op.parentElement,cs=getComputedStyle(inn),w=inn.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);op.style.setProperty('--dk',clamp(w/1120,1,1.5).toFixed(3))}
 fitDiagram();addEventListener('load',fitDiagram);
 /* the skip link sits outside <main>, which the page's own language swap does not cover */
 function skip(){var a=d.querySelector('.skip-link');if(!a)return;if(a._en==null)a._en=a.textContent;a.textContent=d.documentElement.getAttribute('data-ui')==='he'?a.getAttribute('data-he'):a._en}
 skip();new MutationObserver(skip).observe(d.documentElement,{attributes:true,attributeFilter:['data-ui']});
 x=RM?0:target();light();apply();kick();
 window.__sxh={setLT:function(sec){for(var k=0;k<4;k++){t0[k]=T-sec;was[k]=true}apply()},T:function(){return T},step:function(n){for(var i=0;i<(n||1);i++){stepSpring(1/60);T+=1/60}apply();return x},jump:function(){x=target();vel=0;light();apply();return x},act:function(){return act},p:function(){return x},target:target,fit:fitDiagram};
})();
