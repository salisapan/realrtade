/* 5-language menu: same behaviour as assets/flow-inner.js (NAMES/ORDER/setUI/go).
   Sets html[data-ui] and localStorage flow.lang; flow-i18n.js paints [data-he]/[data-de]/… */
(function(){
'use strict';
var d=document.documentElement;
var NAMES={en:'English',de:'Deutsch',fr:'Français',es:'Español',he:'עברית'};
var ORDER=['en','de','fr','es','he'], DIR={en:'ltr',de:'ltr',fr:'ltr',es:'ltr',he:'rtl'};
var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var store=function(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
function ui(){var u=d.dataset.ui||'en';return ORDER.indexOf(u)<0?'en':u}
function paintChrome(){
  var u=ui();
  var ln=$('#langName'); if(ln) ln.textContent=NAMES[u];
  $$('#langMenu [role="menuitemradio"]').forEach(function(b){b.setAttribute('aria-checked',String(b.lang===u))});
  var lb=$('#langBtn'); if(lb) lb.setAttribute('aria-label',{he:'שפה',de:'Sprache',fr:'Langue',es:'Idioma'}[u]||'Language');
}
function go(code){
  var pl=d.getAttribute('data-page-lang'),want=code==='he'?'he':'en';
  if(pl&&want!==pl){
    var a=document.querySelector('link[rel="alternate"][hreflang="'+want+'"]');
    if(a){store('flow.lang',code);var u=new URL(location.href);u.searchParams.delete('lang');u.pathname=new URL(a.href).pathname;location.href=u.href;return}
  }
  setUI(code);
}
function setUI(code,persist){
  if(ORDER.indexOf(code)<0)return;
  if(persist!==false)store('flow.lang',code);
  d.dataset.ui=code;
  paintChrome();
}
var langBtn=$('#langBtn'), langMenu=$('#langMenu');
if(!(langBtn&&langMenu)) return;
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
langMenu.addEventListener('click',function(e){var b=e.target.closest('[role="menuitemradio"]');if(b){closeMenu();go(b.lang)}});
document.addEventListener('pointerdown',function(e){if(!e.target.closest('.lang')&&langMenu.classList.contains('open'))closeMenu(false)});
paintChrome();
})();
