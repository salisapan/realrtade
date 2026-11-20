/* Pause decorative CSS loops (infinite keyframe animations) while their own element is off screen.
   Works per animated element, on top of r15/idle-pause.js (per section). On-screen motion is unchanged:
   a loop resumes from where it stopped as soon as its element comes back near the viewport.
   Transitions and finite animations (Do It, Undo, card moves) are never touched. 2026-11-13 */
(function(){
 if(!('IntersectionObserver' in window)||!document.getAnimations)return;
 var hosts=new Map();                      /* element (or pseudo-element host) -> {vis, anims} */
 var MARGIN=120;
 function loops(){
  var out=[];
  document.getAnimations().forEach(function(a){
   if(!a.animationName||!a.effect||!a.effect.getTiming)return;   /* CSS keyframes only */
   if(a.effect.getTiming().iterations!==Infinity)return;          /* loops only */
   var t=a.effect.target;if(t)out.push([a,t]);
  });
  return out;
 }
 function sectionHeld(t){for(var e=t;e;e=e.parentElement){if(e.hasAttribute&&e.hasAttribute('data-pz'))return true}return false}
 function apply(t){
  var h=hosts.get(t);if(!h)return;
  h.anims.forEach(function(a){
   if(a.playState==='idle'||a.playState==='finished'){h.anims.delete(a);return}
   if(!h.vis){if(a.playState==='running'){a.pause();a.__op=1}}
   else if(a.__op){a.__op=0;if(!sectionHeld(t))a.play()}
  });
 }
 var io=new IntersectionObserver(function(es){
  es.forEach(function(e){var h=hosts.get(e.target);if(!h)return;h.vis=e.isIntersecting;apply(e.target)});
 },{rootMargin:MARGIN+'px 0px'});
 function inView(t){var r=t.getBoundingClientRect();return r.bottom>-MARGIN&&r.top<innerHeight+MARGIN&&r.width>0}
 function scan(){
  loops().forEach(function(x){
   var t=x[1];
   if(!hosts.has(t)){hosts.set(t,{vis:inView(t),anims:new Set()});io.observe(t)}
   hosts.get(t).anims.add(x[0]);
  });
  hosts.forEach(function(h,t){if(!t.isConnected){io.unobserve(t);hosts.delete(t);return}apply(t)});
 }
 var tm=0;function later(ms){clearTimeout(tm);tm=setTimeout(scan,ms)}
 addEventListener('scroll',function(){later(250)},{passive:true});
 addEventListener('resize',function(){later(300)});
 ['pointerup','keyup','touchend'].forEach(function(ev){addEventListener(ev,function(){later(700)},{passive:true})});
 document.addEventListener('animationstart',function(){later(200)});
 function start(){setTimeout(scan,400);setTimeout(scan,2000)}
 if(document.readyState==='complete')start();else addEventListener('load',start);
})();
