(function(){
 var tl=document.querySelector('.hs-tile');
 if(tl&&!document.documentElement.classList.contains('rm')&&!matchMedia('(prefers-reduced-motion:reduce)').matches&&'IntersectionObserver' in window){
  var r=tl.getBoundingClientRect();
  if(r.top>innerHeight*.72){tl.classList.add('pre');var io=new IntersectionObserver(function(e){if(e[0].isIntersecting){tl.classList.remove('pre');io.disconnect()}},{threshold:.08});io.observe(tl)}}
 var N={cloud:'<b>Flow’s dedicated secure cloud.</b> All sensitive data is masked before any processing.',
  edge:'<b>Flow-Edge.</b> Data is stored only on the employee’s own computer and never leaves it.',
  onprem:'<b>Flow-On-Prem.</b> A dedicated server inside the office’s internal network. Data never goes to an external cloud.'};
 var g=document.querySelector('.hs-segc');if(!g)return;var note=document.querySelector('.hs-segnote'),bs=[].slice.call(g.querySelectorAll('button'));
 function set(i){bs.forEach(function(b,j){b.setAttribute('aria-checked',j===i?'true':'false');b.tabIndex=j===i?0:-1});g.style.setProperty('--i',i);var sh=g.querySelector('.hs-do .shine');if(sh&&g.__s!==undefined&&g.__s!==i){sh.classList.remove('sw');void sh.offsetWidth;sh.classList.add('sw')}g.__s=i;if(g.__s!==undefined&&window.__haptic&&g.__u)window.__haptic();g.__u=1;note.innerHTML=N[bs[i].dataset.m];}
 bs.forEach(function(b,i){b.addEventListener('click',function(){set(i)});b.addEventListener('keydown',function(e){var d=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;if(d){e.preventDefault();var k=(i+d+3)%3;set(k);bs[k].focus()}})});

 var seg=g;['pointerdown'].forEach(function(e){g.addEventListener(e,function(){g.classList.add('press')})});['pointerup','pointercancel','pointerleave'].forEach(function(e){g.addEventListener(e,function(){g.classList.remove('press')})});
 var st=document.querySelector('.hs2-stage');
 if(st&&!document.documentElement.classList.contains('rm')&&!matchMedia('(prefers-reduced-motion:reduce)').matches){var pl=st.querySelector('.hs2-plates'),tk=0;if(pl){
  function tilt(){tk=0;var r=st.getBoundingClientRect(),v=innerHeight,t=Math.max(0,Math.min(1,(v-r.top)/(v+r.height)));pl.style.setProperty('--hs-tilt',(64-t*12).toFixed(1)+'deg')}
  addEventListener('scroll',function(){if(!tk)tk=requestAnimationFrame(tilt)},{passive:true});tilt();}}
 set(0);
 /* v3 bridge: the hero switch is the one deployment control on Pricing */
 function bridge(){var c=bs.filter(function(b){return b.getAttribute('aria-checked')==='true'})[0];if(!c)return;var m=c.dataset.m;g.dataset.val=m;[].forEach.call(document.querySelectorAll('[data-zone-scope]'),function(sc){sc.setAttribute('data-dep',m)});g.dispatchEvent(new CustomEvent('dsel',{detail:m,bubbles:true}))}
 g.addEventListener('click',bridge);g.addEventListener('keydown',function(){setTimeout(bridge,0)});bridge();
})();
