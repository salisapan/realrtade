/* Flow inner pages — v1 behaviour: language menu (chrome only), theme (+OS follow), haptic, blue-text probes, GA, reading progress.
   Ported from flow-home-v13r34/index.html (setLang/menu/applyTheme/merge-js). Glance pages never load this file. */
(function(){
'use strict';
var d=document.documentElement;
var FT={"en": {"glance": "Glance", "hFlow": "Product", "flow": "Flow", "graph": "Action Graph", "sec": "Security", "pricing": "Pricing", "solutions": "Solutions", "hCo": "Company", "about": "About", "blog": "Insights", "contact": "Contact", "hLegal": "Legal", "privacy": "Privacy", "terms": "Terms", "hMail": "Get in touch", "d1": "Masked Flow cloud", "d1s": "Sensitive data is masked before processing", "d2": "Flow-Edge", "d2s": "Data stays on the employee’s computer", "d3": "Flow-Onprem", "d3s": "A dedicated server inside the office network", "copy": "© Flow"}, "he": {"glance": "Glance", "hFlow": "מוצר", "flow": "Flow", "graph": "גרף פעולות", "sec": "אבטחה", "pricing": "תמחור", "solutions": "פתרונות", "hCo": "חברה", "about": "אודות", "blog": "תובנות", "contact": "צור קשר", "hLegal": "משפטי", "privacy": "פרטיות", "terms": "תנאים", "hMail": "יצירת קשר", "d1": "ענן Flow ממוסך", "d1s": "מידע רגיש מוסר לפני העיבוד", "d2": "Flow-Edge", "d2s": "המידע נשאר במחשב של העובד", "d3": "Flow-Onprem", "d3s": "שרת ייעודי ברשת המשרד", "copy": "© Flow"}};
var NAMES={en:'English',de:'Deutsch',fr:'Français',es:'Español',he:'עברית'};
var ORDER=['en','de','fr','es','he'], DIR={en:'ltr',de:'ltr',fr:'ltr',es:'ltr',he:'rtl'};
var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var store=function(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};

/* ---- chrome language (page content stays as authored) ---- */
function ui(){var u=d.dataset.ui||'en';return ORDER.indexOf(u)<0?'en':u}
function paintChrome(){
  var u=ui(), T=FT[u]||FT.en;
  var ln=$('#langName'); if(ln) ln.textContent=NAMES[u];
  $$('#langMenu [role="menuitemradio"]').forEach(function(b){b.setAttribute('aria-checked',String(b.lang===u))});
  var tb=$('#themeBtn'); if(tb) tb.setAttribute('aria-label',u==='he'?'מצב לילה':'Night mode');
  var lb=$('#langBtn'); if(lb) lb.setAttribute('aria-label',u==='he'?'שפה':'Language');
  var f=$('.site-foot'); if(f){
    f.lang=u; f.dir=DIR[u];
    $$('[data-k]',f).forEach(function(el){var v=T[el.dataset.k.replace(/^ft\./,'')];if(v!=null)el.textContent=v});
  }
}
function setUI(code,persist){
  if(ORDER.indexOf(code)<0)return;
  if(persist!==false)store('flow.lang',code);
  d.dataset.ui=code; paintChrome();
}
/* the privacy page switches its own content language by writing html[lang]; the chrome follows it */
var lastLang=d.lang;
if(ORDER.indexOf(d.lang)>=0 && d.lang!=='en' && d.dataset.ui!==d.lang){ d.dataset.ui=d.lang; }
new MutationObserver(function(){ if(d.lang!==lastLang){ lastLang=d.lang; if(ORDER.indexOf(d.lang)>=0 && d.dataset.ui!==d.lang){ d.dataset.ui=d.lang; paintChrome(); } } }).observe(d,{attributes:true,attributeFilter:['lang']});

var langBtn=$('#langBtn'), langMenu=$('#langMenu');
if(langBtn&&langMenu){
  langMenu.innerHTML=ORDER.map(function(c){return '<button type="button" role="menuitemradio" lang="'+c+'" dir="'+DIR[c]+'" aria-checked="false" tabindex="-1">'+NAMES[c]+'<small>'+c+'</small></button>'}).join('');
  var items=function(){return $$('#langMenu [role="menuitemradio"]')};
  var openMenu=function(fi){langMenu.classList.add('open');langBtn.setAttribute('aria-expanded','true');var it=items();var i=fi==null?Math.max(0,it.map(function(b){return b.lang}).indexOf(ui())):fi;it[i].focus()};
  var closeMenu=function(re){langMenu.classList.remove('open');langBtn.setAttribute('aria-expanded','false');if(re!==false)langBtn.focus()};
  langBtn.addEventListener('click',function(){langMenu.classList.contains('open')?closeMenu():openMenu()});
  langBtn.addEventListener('keydown',function(e){if(['ArrowDown','Enter',' '].indexOf(e.key)>=0){e.preventDefault();openMenu()}else if(e.key==='ArrowUp'){e.preventDefault();openMenu(items().length-1)}});
  langMenu.addEventListener('keydown',function(e){
    var it=items(),i=it.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();it[(i+1)%it.length].focus()}
    else if(e.key==='ArrowUp'){e.preventDefault();it[(i-1+it.length)%it.length].focus()}
    else if(e.key==='Home'){e.preventDefault();it[0].focus()}
    else if(e.key==='End'){e.preventDefault();it[it.length-1].focus()}
    else if(e.key==='Escape'){e.preventDefault();closeMenu()}
    else if(e.key==='Tab')closeMenu(false);
  });
  langMenu.addEventListener('click',function(e){var b=e.target.closest('[role="menuitemradio"]');if(b){closeMenu();setUI(b.lang)}});
  document.addEventListener('pointerdown',function(e){if(!e.target.closest('.lang')&&langMenu.classList.contains('open'))closeMenu(false)});
}
paintChrome();

/* ---- theme: 300 ms cross-fade, toggle wins over the OS ---- */
var themeBtn=$('#themeBtn');
function applyTheme(t,persist,animate){
  if(persist===undefined)persist=true; if(animate===undefined)animate=true;
  if(animate&&!matchMedia('(prefers-reduced-motion:reduce)').matches){d.classList.add('theming');clearTimeout(applyTheme._t);applyTheme._t=setTimeout(function(){d.classList.remove('theming')},360)}
  d.dataset.theme=t; if(themeBtn)themeBtn.setAttribute('aria-pressed',String(t==='dark'));
  if(persist)store('flow.theme',t);
}
window.__applyTheme=applyTheme;
if(themeBtn){themeBtn.setAttribute('aria-pressed',String(d.dataset.theme==='dark'));themeBtn.addEventListener('click',function(){applyTheme(d.dataset.theme==='dark'?'light':'dark')})}
/* auto dark from the OS only while the visitor has no saved choice and no ?theme= */
(function(){
  var mq=matchMedia('(prefers-color-scheme: dark)');
  var has=function(){return !!store('flow.theme')||/[?&]theme=(dark|light)/.test(location.search)};
  var on=function(e){if(has())return;var t=e.matches?'dark':'light';if(d.dataset.theme!==t)applyTheme(t,false,true)};
  if(mq.addEventListener)mq.addEventListener('change',on);else if(mq.addListener)mq.addListener(on);
})();

/* ---- haptic on Do It (ported from index.html merge-js) ---- */
(function(){
  var sw;
  function hap(){
    if(d.classList.contains('rm'))return;
    try{ if(navigator.vibrate){navigator.vibrate(10);return}
      if(!sw){var l=document.createElement('label');l.setAttribute('aria-hidden','true');l.style.cssText='position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        var i=document.createElement('input');i.type='checkbox';i.setAttribute('switch','');l.appendChild(i);document.body.appendChild(l);sw=l}
      sw.click();
    }catch(e){}
  }
  window.__haptic=hap;
  document.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse')return;if(e.target.closest&&e.target.closest('.doit,.fh-cta'))hap()},{passive:true});
})();

/* ---- blue text probes: light = royal gradient, night = luminous (only plain text, never links / svg / code) ---- */
(function(){
  var tick;
  function direct(el){for(var n=el.firstChild;n;n=n.nextSibling)if(n.nodeType===3&&n.nodeValue.trim())return true;return false}
  function probe(){
    var dark=d.dataset.theme==='dark', want=dark?'rgb(110, 155, 255)':'rgb(45, 94, 255)', cls=dark?'lum-t':'royal-t';
    var all=document.body.getElementsByTagName('*');
    for(var i=0;i<all.length;i++){
      var el=all[i], tag=el.tagName;
      if(tag==='A'||tag==='SCRIPT'||tag==='STYLE'||tag==='CODE'||tag==='PRE'||tag==='BUTTON'||tag==='svg'||tag==='path')continue;
      if(el.classList.contains(cls)||el.closest('svg,a,.fh,.fb,.site-foot,.ctl,.doit,code,pre'))continue;
      if(!direct(el))continue;
      if(getComputedStyle(el).color===want)el.classList.add(cls);
    }
  }
  function strip(){$$('.royal-t,.lum-t').forEach(function(el){el.classList.remove('royal-t','lum-t')})}
  function sched(){clearTimeout(tick);tick=setTimeout(probe,60)}
  addEventListener('load',sched);
  new MutationObserver(function(){strip();sched()}).observe(d,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('DOMContentLoaded',sched);
})();

/* ---- GA: any [data-ga] element reports itself (same events as flow-premium.js) ---- */
(function(){
  function send(n,p){if(typeof window.gtag==='function')window.gtag('event',n,p||{})}
  document.addEventListener('click',function(e){var el=e.target&&e.target.closest?e.target.closest('[data-ga]'):null;if(!el)return;send('cta_click',{cta:el.getAttribute('data-ga'),page:location.pathname,destination:el.getAttribute('href')||''})},{passive:true});
  var tiers=document.querySelector('.tiers, .tier-solo');
  if(tiers&&'IntersectionObserver' in window){var seen=false;var io=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting||seen)return;seen=true;send('pricing_view',{page:location.pathname});io.disconnect()})},{threshold:.3});io.observe(tiers)}
})();

/* ---- article reading progress ---- */
(function(){
  var bar=$('#progress'), art=$('article'); if(!bar||!art)return;
  function update(){var r=art.getBoundingClientRect(),total=r.height-innerHeight*.5,seen=Math.min(Math.max(-r.top,0),total);bar.style.width=(total>0?seen/total*100:0)+'%'}
  addEventListener('scroll',update,{passive:true});addEventListener('resize',update);update();
})();
})();
