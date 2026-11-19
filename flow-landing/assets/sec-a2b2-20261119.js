/* 19.11 · Security sections A2r2b + B2r2 (approved in Hebrew). Ported from the security-redesign mockups.
   A: the card's content fades from your record to what the model sees and back, driven by scroll (render lerp, no own Lenis:
      the page already runs one). Runs only while the section is near the viewport. B: the Do It presses itself once, on view. */
(function(){
var root=document.documentElement,q=new URLSearchParams(location.search);
var RM=matchMedia('(prefers-reduced-motion: reduce)').matches||q.get('rm')==='1'||root.classList.contains('rm');
/* ---- A ---- */
(function(){var W=document.getElementById('secA');if(!W)return;var s=W.querySelector('.scene'),card=s.querySelector('.sa-card'),bars=s.querySelectorAll('.prog i'),F=q.get('f'),P=q.get('p');if(P!==null)F='p';
if(RM){W.classList.add('is-rm');s.className='scene st3';return}
function target(){if(P!==null)return +P;if(F!==null)return [0,.5,1][+F]||0;var r=s.getBoundingClientRect(),h=s.offsetHeight-innerHeight;return Math.min(1,Math.max(0,-r.top/h))}
function ang(p){var k=.62;return 360*(p-k*Math.sin(4*Math.PI*p)/(4*Math.PI))}
function cl(x){return Math.min(1,Math.max(0,x))}
var cur=target(),st='';
function draw(p){var a=ang(p),u=a/180,m=1-Math.abs(1-u);
 var fo=cl(1-m/.44),bo=cl((m-.56)/.44),fe=fo*fo*(3-2*fo),be=bo*bo*(3-2*bo),lift=1-Math.abs(2*m-1);lift=lift*lift*(3-2*lift);
 card.style.setProperty('--fo',fe.toFixed(3));card.style.setProperty('--bo',be.toFixed(3));card.style.setProperty('--lift',lift.toFixed(3));card.style.setProperty('--a',a.toFixed(2));
 s.style.setProperty('--c',(1-lift*.18).toFixed(3));s.style.setProperty('--sx','0');s.style.setProperty('--gl',(lift*.5).toFixed(3));
 var n=a<90?'st1':a<270?'st2':'st3';if(n!==st){s.classList.remove('st1','st2','st3');s.classList.add(n);st=n}
 for(var i=0;i<3;i++)bars[i].style.setProperty('--f',Math.min(1,Math.max(0,p*3-i)).toFixed(3))}
draw(cur);if(F!==null)return;
var on=false,raf=0;
function loop(){raf=0;var t=target();cur+=(t-cur)*.14;if(Math.abs(t-cur)<.0004)cur=t;draw(cur);if(on||cur!==t)raf=requestAnimationFrame(loop)}
function kick(){if(!raf)raf=requestAnimationFrame(loop)}
if('IntersectionObserver'in window){new IntersectionObserver(function(es){on=es[es.length-1].isIntersecting;if(on)kick()},{rootMargin:'200px 0px'}).observe(s)}else{on=true;kick()}
addEventListener('scroll',kick,{passive:true});addEventListener('resize',kick);
})();
/* ---- B ---- */
(function(){var h=document.getElementById('hg'),b=document.getElementById('go');if(!h||!b)return;var S=q.get('state');
if(S==='pre'){h.classList.add('pre');return}if(S==='press'){h.classList.add('pre','pressing');return}if(S==='done'||RM){if(RM)document.getElementById('secB').classList.add('is-rm');return}
h.classList.add('pre');var busy=0;
function play(){if(busy)return;busy=1;h.classList.add('pre');setTimeout(function(){h.classList.add('pressing')},150);
 setTimeout(function(){h.classList.remove('pressing');h.classList.remove('pre')},650);setTimeout(function(){busy=0},1400)}
var done=0;function chk(){if(done)return;var r=h.getBoundingClientRect();if(r.top<innerHeight*.32||(r.bottom<innerHeight*.98&&r.bottom>0)){done=1;removeEventListener('scroll',chk);setTimeout(play,250)}}addEventListener('scroll',chk,{passive:true});chk();
b.addEventListener('click',function(){h.classList.add('pre');setTimeout(play,350)});b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click()}});
})();
})();
