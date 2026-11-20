/* r15 cpas page (copy of dep2.js, Hebrew notes adapted): copy of the homepage r9 file, only the Hebrew strings adapted to law firms. Homepage deployment switcher (r35-js from index-scale-S1b.html, verbatim; language read from data-ui). Copy = the homepage ft.* strings. */
window.COPY=window.COPY||{};var __ft={"order": {}, "en": {"b1": "Cloud", "b2": "Edge", "b3": "On-Prem", "d1": "Masked Flow cloud", "d1s": "Tax IDs, bank accounts and client names are masked before processing", "d2": "Flow-Edge", "d2s": "Client books stay on the employee’s computer", "d3": "Flow-Onprem", "d3s": "A dedicated server on the firm’s internal network"}, "de": {"b1": "Cloud", "b2": "Edge", "b3": "On-Prem", "d1": "Maskierte Flow-Cloud", "d1s": "Steuer-IDs, Kontonummern und Mandantennamen werden vor der Verarbeitung maskiert", "d2": "Flow-Edge", "d2s": "Mandantendaten bleiben auf dem Rechner der Mitarbeitenden", "d3": "Flow-Onprem", "d3s": "Ein eigener Server im internen Netz der Kanzlei"}, "fr": {"b1": "Cloud", "b2": "Edge", "b3": "On-Prem", "d1": "Cloud Flow masqué", "d1s": "Numéros fiscaux, comptes bancaires et noms des clients sont masqués avant le traitement", "d2": "Flow-Edge", "d2s": "La comptabilité des clients reste sur l’ordinateur du collaborateur", "d3": "Flow-Onprem", "d3s": "Un serveur dédié sur le réseau interne du cabinet"}, "es": {"b1": "Nube", "b2": "Edge", "b3": "On-Prem", "d1": "Nube de Flow enmascarada", "d1s": "NIF, cuentas bancarias y nombres de clientes se enmascaran antes del proceso", "d2": "Flow-Edge", "d2s": "La contabilidad de los clientes se queda en el ordenador del empleado", "d3": "Flow-Onprem", "d3s": "Un servidor dedicado en la red interna del despacho"}, "he": {"b1": "ענן", "b2": "Edge", "b3": "On-Prem", "d1": "ענן Flow ממוסך", "d1s": "מספרי עוסק, חשבונות בנק וסכומים מוסתרים לפני העיבוד", "d2": "Flow-Edge", "d2s": "נתוני הלקוחות נשארים במחשב של העובד", "d3": "Flow-Onprem", "d3s": "שרת ייעודי ברשת הפנימית של המשרד"}};Object.keys(__ft).forEach(function(l){if(l==='order')return;window.COPY[l]=window.COPY[l]||{};window.COPY[l].ft=Object.assign(window.COPY[l].ft||{},__ft[l])});

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
    b.addEventListener('keydown',function(e){var n=null;if(e.key==='ArrowRight'||e.key==='ArrowDown')n=(k+1)%3;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')n=(k+2)%3;if(n!==null){e.preventDefault();set(n,true);}});
  });
  seg.style.setProperty('--i',0);paint();
  new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['data-ui']});
})();
