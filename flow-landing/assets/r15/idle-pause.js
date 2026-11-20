/* Insurance / CPA: pause decorative CSS loops while they are off screen.
   Only animations the visitor cannot see are paused; on-screen motion is unchanged. */
(function(){
 if(!('IntersectionObserver' in window)||!document.getAnimations)return;
 var OFF='data-pz';
 function hiddenUp(t){for(var e=t;e;e=e.parentElement){if(e.hasAttribute&&e.hasAttribute(OFF))return true}return false}
 function set(el,off){
  if(off)el.setAttribute(OFF,'');else el.removeAttribute(OFF);
  el.getAnimations({subtree:true}).forEach(function(a){
   if(!a.animationName)return;            /* CSS keyframe loops only, never transitions */
   var t=a.effect&&a.effect.target;if(!t)return;
   if(off){if(a.playState==='running'){a.pause();a.__pz=1}}
   else if(a.__pz&&!hiddenUp(t)){a.play();a.__pz=0}
  });
 }
 var io=new IntersectionObserver(function(es){es.forEach(function(e){set(e.target,!(e.isIntersecting&&e.intersectionRatio>0))})},{rootMargin:'160px -2px',threshold:[0,0.01]});
 function watch(){
  var els=document.querySelectorAll('main > section, main > div > section, #r14s .slide');
  for(var i=0;i<els.length;i++)io.observe(els[i]);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
})();
