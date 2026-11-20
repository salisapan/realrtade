/* Solutions option B3: quiet list + segmented control drive one phone; autoplay while idle */
(function(){
var r=document.documentElement,LS={en:1,he:1,de:1,fr:1,es:1},P=[],cur='legal',DUR=6500,timer=0,idleUntil=0,visible=true;
var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
function lang(){return LS[r.dataset.ui]?r.dataset.ui:'en'}
function theme(){return r.dataset.theme==='dark'?'dark':'light'}
function src(p){return 'assets/hub/'+p+'-'+lang()+'-'+theme()+'.webp'}
var rows=[].slice.call(document.querySelectorAll('.b3-row:not([hidden])'));
P=rows.map(function(r){return r.dataset.p});
if(rows.length>=5&&rows[0].parentNode)rows[0].parentNode.classList.add('many'); /* professions come from the page; a hidden slot (e.g. government) stays out until its page exists */
var segs=[].slice.call(document.querySelectorAll('.b3-sb:not([hidden])'));
var ph=document.querySelector('.b3-phone');
var seg=document.querySelector('.b3-seg');
var thumb=seg&&seg.querySelector('.b3-thumb');

function placeThumb(){
  if(!seg||!thumb)return;
  var on=seg.querySelector('.b3-sb.on'); if(!on)return;
  if(getComputedStyle(seg).display==='none')return;
  /* offsetLeft is in the scroll box's own coordinates, so the thumb rides with the segments when the bar scrolls */
  thumb.style.width=on.offsetWidth+'px';
  thumb.style.transform='translateX('+on.offsetLeft+'px)';
  edges();
}
/* 13/11 · scales to 5+ professions: the bar scrolls sideways when the labels do not fit, the active one is kept in view,
   and only the side with hidden segments fades */
function edges(){
  if(!seg)return;
  var max=seg.scrollWidth-seg.clientWidth, x=Math.abs(seg.scrollLeft);
  seg.classList.toggle('ovf',max>1);
  seg.classList.toggle('at-s',x<=1);
  seg.classList.toggle('at-e',x>=max-1);
}
function reveal(){
  if(!seg||getComputedStyle(seg).display==='none')return;
  var on=seg.querySelector('.b3-sb.on'); if(!on||seg.scrollWidth<=seg.clientWidth+1)return;
  var sr=seg.getBoundingClientRect(), br=on.getBoundingClientRect(), pad=24, d=0;
  if(br.left<sr.left+pad)d=br.left-sr.left-pad; else if(br.right>sr.right-pad)d=br.right-sr.right+pad;
  if(d)seg.scrollBy({left:d,behavior:RM?'auto':'smooth'});
}
if(seg)seg.addEventListener('scroll',edges,{passive:true});
function mark(p){
  rows.forEach(function(c){var a=c.dataset.p===p;c.classList.toggle('on',a);c.setAttribute('aria-selected',a)});
  segs.forEach(function(c){var a=c.dataset.p===p;c.classList.toggle('on',a);c.setAttribute('aria-selected',a)});
  requestAnimationFrame(function(){requestAnimationFrame(function(){placeThumb();reveal()})});
}

function show(p){
  if(!ph)return;cur=p;mark(p);
  var on=ph.querySelector('.op-ph.on'),off=ph.querySelector('.op-ph:not(.on)'),s=src(p);
  if(on&&off&&on.getAttribute('src')!==s){
    off.onload=function(){off.onload=null;off.classList.add('on');on.classList.remove('on')};
    off.setAttribute('src',s);
  }
  schedule();
}

function schedule(){
  clearTimeout(timer);
  if(RM||!visible||document.hidden)return;
  var wait=Math.max(0,idleUntil-Date.now());
  timer=setTimeout(function(){timer=setTimeout(function(){show(P[(P.indexOf(cur)+1)%P.length])},DUR)},wait);
}

function touch(){idleUntil=Date.now()+12000;schedule()}

function bind(el){
  el.addEventListener('click',function(e){touch();if(e.target.closest('a'))return;show(el.dataset.p)});
  el.addEventListener('keydown',function(k){
    if(k.key==='Enter'||k.key===' '){if(k.target===el){k.preventDefault();touch();show(el.dataset.p)}return}
    var d=k.key==='ArrowDown'||k.key==='ArrowRight'?1:k.key==='ArrowUp'||k.key==='ArrowLeft'?-1:0;
    if(!d)return;k.preventDefault();
    var set=el.classList.contains('b3-sb')?segs:rows;
    var i=set.indexOf(el);set[(i+d+set.length)%set.length].focus();
  });
}
rows.forEach(bind);segs.forEach(bind);
rows.forEach(function(c){
  c.addEventListener('mouseenter',function(){if(matchMedia('(hover:hover)').matches){touch();if(cur!==c.dataset.p)show(c.dataset.p)}});
  c.addEventListener('focus',function(){touch();if(cur!==c.dataset.p)show(c.dataset.p)});
});

var sec=document.querySelector('.b3');
if(sec)sec.addEventListener('touchstart',touch,{passive:true});
if('IntersectionObserver' in window&&sec)new IntersectionObserver(function(es){visible=es[0].isIntersecting;schedule()},{threshold:.35}).observe(ph||sec);
document.addEventListener('visibilitychange',schedule);
window.addEventListener('resize',placeThumb);

function pre(){P.forEach(function(p){var i=new Image();i.src=src(p)})}
var warm=false;
function later(){if(warm)pre()}
function sync(){
  var on=ph&&ph.querySelector('.op-ph.on');
  if(on&&on.getAttribute('src')!==src(cur))on.setAttribute('src',src(cur));
  later();placeThumb();
}
/* 13/11 · preload the other phones after load and idle, not during first paint */
function warmUp(){warm=true;pre()}
if(document.readyState==='complete')(window.requestIdleCallback||setTimeout)(warmUp,{timeout:2000});else addEventListener('load',function(){(window.requestIdleCallback||setTimeout)(warmUp,{timeout:2000})});
sync();mark(cur);schedule();
new MutationObserver(sync).observe(r,{attributes:true,attributeFilter:['data-ui','data-theme']});
window.__b3={show:show,stop:function(){RM=true;clearTimeout(timer)}};
})();
