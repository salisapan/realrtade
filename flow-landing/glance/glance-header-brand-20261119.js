/* 19.11 · Glance pages: the shared header shows the Glance wordmark instead of the Flow logo.
   Same slot, size and fade-in as the Flow logo; links to the top of this Glance page. */
(function(){
  function swap(){
    var a=document.querySelector('flow-header .fh-brand');
    if(!a||a.getAttribute('data-gx')==='1')return !!a;
    a.setAttribute('data-gx','1');
    a.setAttribute('aria-label','Glance');
    a.setAttribute('href',location.pathname.split('/').pop()||'glance.html');
    a.innerHTML='<span class="gx-hbrand" dir="ltr">Glance</span>';
    return true;
  }
  if(!swap()){
    var mo=new MutationObserver(function(){if(swap())mo.disconnect()});
    mo.observe(document.documentElement,{childList:true,subtree:true});
  }
  document.addEventListener('DOMContentLoaded',swap);

  /* Option E light pass (Sali 22:43 IL): only at the right moments, never a loop.
     Once on entry (after fonts, short delay), on hover/focus (desktop), on tap (phone), and when the tab comes back.
     At most one pass per 8s. Nothing with prefers-reduced-motion. */
  var COOL=8000,last=-1e9,rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)');
  function pass(){
    if(rm&&rm.matches)return;
    var now=Date.now(); if(now-last<COOL)return;
    var w=document.querySelector('flow-header .fh-brand .gx-hbrand'); if(!w)return;
    last=now; w.classList.remove('gx-pass'); void w.offsetWidth; w.classList.add('gx-pass');
  }
  document.addEventListener('animationend',function(e){if(e.animationName==='gxPass')e.target.classList.remove('gx-pass')});
  function onBrand(e){return e.target&&e.target.closest&&e.target.closest('flow-header .fh-brand')}
  var hover=window.matchMedia&&matchMedia('(hover: hover)').matches;
  if(hover)document.addEventListener('mouseover',function(e){if(onBrand(e))pass()});
  document.addEventListener('focusin',function(e){if(onBrand(e))pass()});
  document.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse'&&onBrand(e))pass()});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(pass,350)});
  function entry(){var go=function(){setTimeout(pass,700)};(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(go,go)}
  if(document.readyState==='complete')entry();else addEventListener('load',entry);

  /* end headline: wrap the last words in .gx-blue (blue at the end of the sentence) */
  var TAIL={he:'הצעד הבא',en:'next step ready'};
  function tail(){
    var el=document.querySelector('#gxT .i1-ln:last-child [data-k="gx.h2"]');
    if(!el||el.querySelector('.gx-blue'))return;
    var t=el.textContent,w=TAIL[(document.documentElement.lang||'en').slice(0,2)];
    var i=w?t.lastIndexOf(w):-1; if(i<0)return;
    el.textContent=t.slice(0,i);
    var s=document.createElement('span');s.className='gx-blue';s.textContent=w;el.appendChild(s);
    if(i+w.length<t.length)el.appendChild(document.createTextNode(t.slice(i+w.length)));
  }
  new MutationObserver(function(){tail()}).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['lang']});
  addEventListener('load',tail);
})();
