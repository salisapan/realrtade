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
  var L=new Lenis({lerp:.1,smoothWheel:true,wheelMultiplier:1,touchMultiplier:1});window.__lenis=L;
  (function raf(t){L.raf(t);requestAnimationFrame(raf)})(0);
 }
})();
