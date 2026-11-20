/* Solutions option B2: cards drive one phone; slow autoplay while idle, paused on interaction */
(function(){var r=document.documentElement,LS={en:1,he:1,de:1,fr:1,es:1},P=['legal','insurance','cpas'],cur='legal',DUR=6500,timer=0,idleUntil=0,visible=true;
var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
function lang(){return LS[r.dataset.ui]?r.dataset.ui:'en'}function theme(){return r.dataset.theme==='dark'?'dark':'light'}
function src(p){return 'assets/hub/'+p+'-'+lang()+'-'+theme()+'.webp'}
var cards=[].slice.call(document.querySelectorAll('.b2-card')),ph=document.querySelector('.b2-phone');
function mark(p){cards.forEach(function(c){var a=c.dataset.p===p;c.classList.toggle('on',a);c.classList.remove('run');c.setAttribute('aria-selected',a)});
 [].forEach.call(document.querySelectorAll('.b2-lb'),function(l){l.classList.toggle('on',l.dataset.p===p)})}
function show(p){if(!ph)return;cur=p;mark(p);var st=document.querySelector('.b2-stage');if(st)st.style.setProperty('--b2-y',(P.indexOf(p)-1)*26+'px');var on=ph.querySelector('.op-ph.on'),off=ph.querySelector('.op-ph:not(.on)'),s=src(p);
 if(on.getAttribute('src')!==s){off.onload=function(){off.onload=null;off.classList.add('on');on.classList.remove('on')};off.setAttribute('src',s)}
 schedule()}
function schedule(){clearTimeout(timer);if(RM||!visible||document.hidden)return;var wait=Math.max(0,idleUntil-Date.now());
 timer=setTimeout(function(){var c=cards.filter(function(x){return x.dataset.p===cur})[0];if(c){void c.offsetWidth;c.classList.add('run')}
  timer=setTimeout(function(){show(P[(P.indexOf(cur)+1)%P.length])},DUR)},wait)}
function touch(){idleUntil=Date.now()+12000;cards.forEach(function(c){c.classList.remove('run')});schedule()}
cards.forEach(function(c,i){
 c.addEventListener('click',function(e){touch();if(e.target.closest('a'))return;show(c.dataset.p)});
 c.addEventListener('mouseenter',function(){if(matchMedia('(hover:hover)').matches){touch();if(cur!==c.dataset.p)show(c.dataset.p)}});
 c.addEventListener('focus',function(){touch();if(cur!==c.dataset.p)show(c.dataset.p)});
 c.addEventListener('keydown',function(k){if(k.key==='Enter'||k.key===' '){if(k.target===c){k.preventDefault();touch();show(c.dataset.p)}return}
  var d=k.key==='ArrowDown'?1:k.key==='ArrowUp'?-1:0;if(!d)return;k.preventDefault();cards[(i+d+3)%3].focus()})});
var sec=document.querySelector('.b2');if(sec){sec.addEventListener('touchstart',touch,{passive:true});sec.addEventListener('mousemove',function(e){if(e.target.closest('.b2-cards'))touch()})}
if('IntersectionObserver' in window&&sec)new IntersectionObserver(function(es){visible=es[0].isIntersecting;schedule()},{threshold:.35}).observe(ph||sec);
document.addEventListener('visibilitychange',schedule);
function pre(){P.forEach(function(p){var i=new Image();i.src=src(p)})}
function sync(){var on=ph&&ph.querySelector('.op-ph.on');if(on&&on.getAttribute('src')!==src(cur))on.setAttribute('src',src(cur));pre()}
sync();mark(cur);var st0=document.querySelector('.b2-stage');if(st0)st0.style.setProperty('--b2-y','-26px');schedule();new MutationObserver(sync).observe(r,{attributes:true,attributeFilter:['data-ui','data-theme']});
window.__b2={show:show,stop:function(){RM=true;clearTimeout(timer)}};
})();
