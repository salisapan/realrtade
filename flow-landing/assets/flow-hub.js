/* Solutions hub: each card shows its profession page's phone in the current language and theme */
(function(){var r=document.documentElement,L={en:1,he:1,de:1,fr:1,es:1};
function set(){var l=L[r.dataset.ui]?r.dataset.ui:'en',t=r.dataset.theme==='dark'?'dark':'light';
 [].forEach.call(document.querySelectorAll('img[data-ph]'),function(i){var s='assets/hub/'+i.dataset.ph+'-'+l+'-'+t+'.webp';if(i.getAttribute('src')!==s)i.setAttribute('src',s)});}
set();new MutationObserver(set).observe(r,{attributes:true,attributeFilter:['data-ui','data-theme']});})();
