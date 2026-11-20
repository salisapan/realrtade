/* Flow inner pages · v3 shared scroll layer. Lenis smooth scroll (same lerp as the home), masked heading rise, hero scroll progress,
   deployment-switch bridge. Respects prefers-reduced-motion / html.rm. Add ?nolenis to disable smooth scroll. */
(function(){
 var d=document.documentElement,RM=matchMedia('(prefers-reduced-motion:reduce)').matches||d.classList.contains('rm');
 var main=document.querySelector('main.v3');if(!main)return;
 /* masked rise for chapter headings */
 [].forEach.call(main.querySelectorAll('.rc-ch .rc-h2'),function(h){
  if(h.querySelector('.mk'))return;var w=document.createElement('span');w.className='mk';var i=document.createElement('span');
  while(h.firstChild)i.appendChild(h.firstChild);w.appendChild(i);h.appendChild(w)});
 /* hero progress */
 var hero=main.querySelector('.hs-sec'),tk=0;
 function prog(){tk=0;if(!hero)return;var r=hero.getBoundingClientRect(),p=Math.max(0,Math.min(1,-r.top/Math.max(1,r.height*.8)));hero.style.setProperty('--p',RM?0:p.toFixed(3))}
 addEventListener('scroll',function(){if(!tk)tk=requestAnimationFrame(prog)},{passive:true});addEventListener('resize',prog);prog();
 /* smooth scroll */
 if(!RM&&window.Lenis&&!/nolenis/.test(location.search)){
  /* perf 2026-11-12: lerp .1 -> .2 (the page follows the wheel about twice as fast: ~95% of a wheel step in ~0.25s instead of ~0.5s).
     rAF runs only while Lenis is animating (the first wheel step is applied in the wheel event itself, no frame of latency); the old permanent loop forced a main-thread frame and a style pass every 16ms, even at rest. */
  var L=new Lenis({lerp:.2,smoothWheel:true,wheelMultiplier:1,touchMultiplier:1});window.__lenis=L;
  var on=0,still=0,fresh=0;
  function raf(t){if(fresh){fresh=0;L.time=t-16.7}else if(L.time&&t<=L.time)L.time=t-1;L.raf(t);if(L.animate&&L.animate.isRunning)still=0;else if(++still>10){on=0;return}requestAnimationFrame(raf)}
  function kick(){if(on)return;on=1;still=0;fresh=1;requestAnimationFrame(raf)}
  addEventListener('wheel',function(){if(on)return;kick();fresh=0;var t=performance.now();L.time=t-16.7;L.raf(t)},{passive:true});addEventListener('keydown',kick,{passive:true});
  var st=L.scrollTo;L.scrollTo=function(){kick();return st.apply(L,arguments)};
  kick();
 }
})();
