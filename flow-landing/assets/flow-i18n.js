/* Flow inner pages: content swap. Language = html[data-ui] (set in <head> from ?lang= or localStorage "flow.lang").
   Every translatable node carries data-he (innerHTML) and, where translated, data-de / data-fr / data-es; data-<lang>-<attr> for attributes.
   English stays the source text; a node without a value for the chosen language shows English. (13.11: de/fr/es added; he unchanged.) */
(function(){
var d=document,r=d.documentElement,LIGHT=!!(d.currentScript&&d.currentScript.hasAttribute('data-light')),A=['placeholder','aria-label','alt','title','content'],
    XL={he:1,de:1,fr:1,es:1},SKIP={he:'דלג לתוכן',de:'Zum Inhalt springen',fr:'Aller au contenu',es:'Saltar al contenido'};
function paint(){
  var u=r.dataset.ui,X=XL[u]?u:null,he=X==='he';
  [].forEach.call(d.querySelectorAll(LIGHT?'title[data-he],[data-hl]':'[data-he]'),function(el){
    var t=el.tagName==='TITLE';
    if(el._en==null)el._en=t?el.textContent:el.innerHTML;
    var v=X?(he?(el.getAttribute('data-he')||el.getAttribute('data-hl')):el.getAttribute('data-'+X)):null; if(v==null)v=el._en;
    if(t)d.title=v;else if(el.innerHTML!==v)el.innerHTML=v;
  });
  A.forEach(function(a){if(LIGHT&&a!=='content')return;[].forEach.call(d.querySelectorAll('[data-he-'+a+']'),function(el){
    var k='_en_'+a; if(el[k]==null)el[k]=el.getAttribute(a);
    var v=X?el.getAttribute('data-'+X+'-'+a):null; el.setAttribute(a,v==null?el[k]:v);
  });});
  var sk=d.querySelector('.skip-link'); if(sk){if(sk._en==null)sk._en=sk.textContent;sk.textContent=X?SKIP[X]:sk._en;}
  var m=LIGHT?null:d.querySelector('main'); if(m){m.lang=X||'en';m.dir=he?'rtl':'ltr';}
  if(!LIGHT){r.lang=X||'en';r.dir=he?'rtl':'ltr';}
  r.classList.toggle('i18n-he',he);
}
paint();
new MutationObserver(paint).observe(r,{attributes:true,attributeFilter:['data-ui']});
})();
