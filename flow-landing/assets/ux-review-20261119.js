/* UX review fixes 19.11 (local, Sali approved 13:03 IL). Override only, product code and locked files untouched.
   ?ux=0 turns everything off (before state). Home only: ?hero=orig keeps the original hero timeline, ?doit=b picks caption/behaviour B.
   1  Hero Do It: quiet caption + click plays the demo at reading pace (A) or moves to the first beat (B).
   2  Hero: the email comes into focus while the Do It is pressed, so the screen never shows only the ring.
   3  Tabs land below the fixed header; the setup CTA fades when the closing booking card is on screen. */
(function(){
  var qs=new URLSearchParams(location.search),d=document,root=d.documentElement;
  if(qs.get('ux')==='0')return;
  var C=window.CONFIG,hero=d.getElementById('hero'),btn=d.getElementById('heroBtn');
  var HOME=!!(C&&C.t&&hero&&btn);
  function clamp(v,a,b){return v<a?a:v>b?b:v}

  /* ---------- 2 · hero timeline: no blank ring-only stretch ---------- */
  if(HOME&&qs.get('hero')!=='orig'&&!C.t.__ux){
    var T=C.t;               /* original: copyOut .06-.14, ghost .2-.262, window .36-.54, focus .36-.56 */
    T.copyOut=[.08,.17];     /* headline stays while the button travels to the centre */
    T.ghost=[.06,.1];        /* the email is already behind the button as the headline leaves */
    T.window=[.08,.2]; 
    T.focus=[.08,.145];      /* readable before the press (.175) ends, sharp before the ring forms */
    T.__ux=1;
  }

  /* ---------- 1 · Do It caption + behaviour ---------- */
  var V=qs.get('doit')==='b'?'b':'a';
  var CAP={a:{he:'\u05dc\u05d7\u05e6\u05d5 \u05db\u05d3\u05d9 \u05dc\u05e8\u05d0\u05d5\u05ea \u05d0\u05ea Flow \u05d1\u05e4\u05e2\u05d5\u05dc\u05d4',en:'Click to see Flow in action',de:'Klicken und Flow in Aktion sehen',fr:'Cliquez pour voir Flow en action',es:'Haz clic para ver Flow en acci\u00f3n'},
           b:{he:'\u05dc\u05d7\u05e6\u05d5, \u05d5\u05be<bdi>Flow</bdi> \u05ea\u05e1\u05d2\u05d5\u05e8 \u05de\u05d9\u05d9\u05dc \u05d0\u05de\u05d9\u05ea\u05d9 \u05e2\u05d3 \u05d4\u05e1\u05d5\u05e3',en:'Click and Flow closes a real email, start to finish',de:'Klicken, und Flow erledigt eine echte E-Mail bis zum Schluss',fr:'Cliquez, et Flow traite un vrai e-mail jusqu\u2019au bout',es:'Haz clic y Flow cierra un correo real de principio a fin'}};
  var TAP={en:'Tap to see Flow in action',de:'Tippen und Flow in Aktion sehen',fr:'Touchez pour voir Flow en action',es:'Toca para ver Flow en acci\u00f3n'};
  var coarse=matchMedia('(hover:none),(pointer:coarse)').matches;
  function lang(){var l=(root.lang||'en').slice(0,2);return CAP.a[l]?l:'en'}
  var hint=null,hintIn=null,sub=d.getElementById('sub'),slot=d.getElementById('slot');
  function paintHint(){if(!hintIn)return;var l=lang(),t=(V==='a'&&coarse&&TAP[l])?TAP[l]:CAP[V][l];
    t=t.replace(/Flow(?![^<]*<\/bdi>)/,'<bdi>Flow</bdi>');if(hintIn.innerHTML!==t)hintIn.innerHTML=t;hint.dir=l==='he'?'rtl':'ltr'}
  var hq=false,hLast='';function syncHint(){hq=false;if(!hint)return;var r=pin(),k=clamp(1-(scrollY-r[0])/((r[1]-r[0])*.05),0,1),s=k>=1?'':k.toFixed(3);
    if(s!==hLast){hLast=s;hint.style.opacity=s;hint.style.visibility=k<.01?'hidden':''}}
  if(HOME&&slot){
    hint=d.createElement('p');hint.className='ux-hint';hint.setAttribute('aria-hidden','true');hintIn=d.createElement('span');hint.appendChild(hintIn);slot.appendChild(hint);
    paintHint();new MutationObserver(paintHint).observe(root,{attributes:true,attributeFilter:['lang']});
    addEventListener('scroll',function(){if(!hq){hq=true;requestAnimationFrame(syncHint)}},{passive:true});
  }

  function pin(){var st=window.ScrollTrigger&&ScrollTrigger.getAll().find(function(s){return s.trigger===hero&&s.end>s.start});
    if(st)return[st.start,st.end];var s=hero.offsetTop;return[s,s+Math.max(1,hero.offsetHeight-innerHeight)]}
  function yAt(p){var r=pin();return Math.round(r[0]+(r[1]-r[0])*p)}
  var run=0;
  function stop(){run++;root.classList.remove('ux-playing')}
  function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function glide(to,ms,id){return new Promise(function(res){
    var L=window.__lenis;
    if(L&&L.scrollTo){L.scrollTo(to,{duration:ms/1000,easing:ease,force:true,onComplete:function(){res()}});
      var chk=setInterval(function(){if(id!==run){clearInterval(chk);try{L.stop();L.start()}catch(e){}res()}},60);setTimeout(function(){clearInterval(chk);res()},ms+400);return}
    var from=scrollY,t0=performance.now();
    (function f(now){if(id!==run)return res();var k=clamp((now-t0)/ms,0,1);scrollTo(0,from+(to-from)*ease(k));k<1?requestAnimationFrame(f):res()})(t0)})}
  function wait(ms,id){return new Promise(function(r){setTimeout(r,ms)})}
  var BEATS={a:[[.3,1700,500],[.62,1700,450],[.8,1500,650],[C&&C.t?C.t.done:.92,1400,0]],b:[[.31,1500,0]]};
  async function play(){var id=++run;root.classList.add('ux-playing');
    var bs=BEATS[V];for(var i=0;i<bs.length;i++){var b=bs[i],to=yAt(b[0]);if(to<=scrollY+2)continue;await glide(to,b[1],id);if(id!==run)return;if(b[2])await wait(b[2],id);if(id!==run)return}
    stop()}
  if(HOME){
    addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#heroBtn');if(!b||root.classList.contains('rm'))return;
      e.stopImmediatePropagation();
      if(coarse&&navigator.vibrate&&navigator.userActivation&&navigator.userActivation.hasBeenActive)try{navigator.vibrate(12)}catch(x){}
      play()},true);
    ['wheel','touchstart','keydown','pointerdown'].forEach(function(t){addEventListener(t,function(e){if(!root.classList.contains('ux-playing'))return;
      if(t==='pointerdown'&&e.target.closest&&e.target.closest('#heroBtn'))return;if(t==='keydown'&&(e.key==='Enter'||e.key===' ')&&d.activeElement===btn)return;stop()},{passive:true,capture:true})});
    window.__ux={play:play,stop:stop,variant:V,yAt:yAt};
  }

  /* ---------- 3a · setup CTA fades once the booking card is on screen ---------- */
  function ctaFade(){var cta=d.querySelector('.su-cta'),book=d.getElementById('book');if(!cta||!book)return;cta.classList.add('ux-fade');
    var last=-1,q=false;function upd(){q=false;var r=book.getBoundingClientRect(),vh=innerHeight;var o=clamp((r.top/vh-.34)/.3,0,1);
      if(r.top>vh*1.2)o=1;var s=o.toFixed(3);if(s!==last){last=s;cta.style.opacity=o>=1?'':s;cta.classList.toggle('ux-off',o<.15)}}
    addEventListener('scroll',function(){if(!q){q=true;requestAnimationFrame(upd)}},{passive:true});addEventListener('resize',upd);upd()}

  /* ---------- 3b · deployment tabs: a tab click never leaves the tabs under the fixed header ---------- */
  function tabs(){d.addEventListener('click',function(e){var seg=e.target.closest&&e.target.closest('.d2-seg,.xl-tabs,[role="tablist"]');if(!seg)return;
    var fh=d.getElementById('fh'),hb=fh?fh.getBoundingClientRect().bottom:0,top=seg.getBoundingClientRect().top;
    if(top<hb+8){var dy=top-(hb+16),L=window.__lenis;setTimeout(function(){L&&L.scrollTo?L.scrollTo(scrollY+dy,{duration:.5,force:true}):scrollBy({top:dy,behavior:'smooth'})},0)}},true)}

  function ready(f){d.readyState==='loading'?d.addEventListener('DOMContentLoaded',f):f()}
  ready(function(){ctaFade();tabs()});
})();
