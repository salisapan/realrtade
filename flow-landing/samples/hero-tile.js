(function(){
 var tl=document.querySelector('.hs-tile');
 if(tl&&!document.documentElement.classList.contains('rm')&&!matchMedia('(prefers-reduced-motion:reduce)').matches&&'IntersectionObserver' in window){
  var r=tl.getBoundingClientRect();
  if(r.top>innerHeight*.72){tl.classList.add('pre');var io=new IntersectionObserver(function(e){if(e[0].isIntersecting){tl.classList.remove('pre');io.disconnect()}},{threshold:.08});io.observe(tl)}}
})();
