(function(){
  var $=function(s){return document.querySelector(s)};
  var doc=$('#r2doc'),tr=$('#r2tr'),seq=$('#r2seq'),aud=$('#r2aud');
  if(!seq||!tr)return;
  var steps=[].slice.call(tr.querySelectorAll('.r2-st'));
  var still=/[?&]still=1/.test(location.search)||document.documentElement.classList.contains('rm')||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  function pathGo(){doc&&doc.classList.add('on');tr.classList.add('go');steps.forEach(function(s,i){setTimeout(function(){s.classList.add('on')},still?0:500+i*520)})}
  function seqGo(){seq.classList.add('s2');aud&&aud.classList.add('on')}
  if(still){pathGo();seqGo();return}
  var pathSec=tr.closest('section'),done={};
  function watch(el,fn,k){if(!el)return;if(!('IntersectionObserver' in window)){fn();return}
    new IntersectionObserver(function(es,o){if(es[0].isIntersecting&&!done[k]){done[k]=1;fn();o.disconnect()}},{threshold:.5}).observe(el)}
  watch(pathSec,pathGo,'p');watch(seq,seqGo,'s');
})();
