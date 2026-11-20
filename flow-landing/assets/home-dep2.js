/* Homepage deployment switcher (r35-js from index-scale-S1b.html, verbatim; language read from data-ui). Copy = the homepage ft.* strings. */
window.COPY=window.COPY||{};var __ft={"order": {}, "en": {"b1": "Cloud", "b2": "On-Prem", "d1": "Masked Flow cloud", "d1s": "Sensitive data is masked before processing", "d2": "Flow-Onprem", "d2s": "A dedicated server inside the office network"}, "de": {"b1": "Cloud", "b2": "On-Prem", "d1": "Maskierte Flow-Cloud", "d1s": "Sensible Daten werden vor der Verarbeitung maskiert", "d2": "Flow-Onprem", "d2s": "Ein eigener Server im Netz Ihres Büros"}, "fr": {"b1": "Cloud", "b2": "On-Prem", "d1": "Cloud Flow masqué", "d1s": "Les données sensibles sont masquées avant le traitement", "d2": "Flow-Onprem", "d2s": "Un serveur dédié sur le réseau de votre cabinet"}, "es": {"b1": "Nube", "b2": "On-Prem", "d1": "Nube de Flow enmascarada", "d1s": "Los datos sensibles se enmascaran antes de procesarse", "d2": "Flow-Onprem", "d2s": "Un servidor dedicado en la red de su oficina"}, "he": {"b1": "ענן", "b2": "On-Prem", "d1": "ענן Flow ממוסך", "d1s": "מידע רגיש מוסר לפני העיבוד", "d2": "Flow-Onprem", "d2s": "שרת ייעודי ברשת המשרד"}};Object.keys(__ft).forEach(function(l){if(l==='order')return;window.COPY[l]=window.COPY[l]||{};window.COPY[l].ft=Object.assign(window.COPY[l].ft||{},__ft[l])});

/* r35 · deployment switcher (Pricing-page component) */
(function(){
  var root=document.querySelector('.dep2');if(!root)return;
  var seg=root.querySelector('.d2-seg'),btns=[].slice.call(seg.querySelectorAll('button')),note=root.querySelector('.d2-note'),nb=note.querySelector('b'),ns=note.querySelector('span'),thumb=seg.querySelector('i .doit .shine');
  var cur=0;
  function txt(){var l=(document.documentElement.dataset.ui||'en');var D=(window.COPY&&(window.COPY[l]||window.COPY.en))||{};return D.ft||{};}
  function paint(){var f=txt();[].forEach.call(root.querySelectorAll('.dlbl[data-k]'),function(e){e.textContent=f[e.getAttribute('data-k').split('.')[1]]||''});nb.setAttribute('data-k','ft.d'+(cur+1));ns.setAttribute('data-k','ft.d'+(cur+1)+'s');nb.textContent=f['d'+(cur+1)]||'';ns.textContent=f['d'+(cur+1)+'s']||'';}
  function set(i,focus){
    if(i===cur&&btns[i].getAttribute('aria-checked')==='true'){return;}
    cur=i;seg.style.setProperty('--i',i);seg.dataset.i=i;
    btns.forEach(function(b,k){b.setAttribute('aria-checked',k===i?'true':'false');b.tabIndex=k===i?0:-1;});
    if(thumb){thumb.classList.remove('sw');void thumb.offsetWidth;thumb.classList.add('sw');}
    paint();if(focus)btns[i].focus();
  }
  btns.forEach(function(b,k){
    b.tabIndex=k===0?0:-1;
    b.addEventListener('click',function(){set(k);});
    b.addEventListener('pointerdown',function(){seg.classList.add('press');});
    ['pointerup','pointerleave','pointercancel'].forEach(function(e){b.addEventListener(e,function(){seg.classList.remove('press');});});
    b.addEventListener('keydown',function(e){var n=null;if(e.key==='ArrowRight'||e.key==='ArrowDown')n=(k+1)%2;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')n=(k+1)%2;if(n!==null){e.preventDefault();set(n,true);}});
  });
  seg.style.setProperty('--i',0);paint();
  new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['data-ui']});
})();
