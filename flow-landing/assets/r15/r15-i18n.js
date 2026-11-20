/* r15 legal page, non-Hebrew URL only (/solutions/legal).
   DE / FR / ES content is swapped in from <template> before the component scripts run (inline script after </main>).
   This file: (1) translates the shared chrome (header, footer, control labels) for de/fr/es, which flow-header.js and
   flow-inner.js only know in en/he; (2) keeps main[lang] on the rendered language (flow-rich-v5 forces 'en');
   (3) a language picked from the menu that differs from the rendered one reloads the page, so the static template
   for that language is used (he is handled by flow-inner's own go(), which navigates to /he/...). */
(function(){
  var d=document.documentElement, R=d.getAttribute('data-r15-lang')||'en';
  var C={
    de:{home:'Startseite',glance:'Glance',flow:'Flow',security:'Sicherheit',pricing:'Preise',solutions:'Lösungen',about:'Über uns',insights:'Einblicke',contact:'Kontakt',cta:'Gespräch vereinbaren',ctaS:'Termin',menu:'Menü',close:'Schließen',primary:'Hauptnavigation',all:'Alle Seiten',
        hFlow:'Produkt',hCo:'Unternehmen',hLegal:'Rechtliches',privacy:'Datenschutz',terms:'Nutzungsbedingungen',lang:'Sprache',night:'Nachtmodus',skip:'Zum Inhalt springen',desc:'KI für Kanzleien: Flow liest E-Mails und Dokumente, entwirft die Antwort an den Mandanten, aktualisiert die Akte und notiert die Frist, und eine Anwältin oder ein Anwalt gibt jeden Schritt frei. Maskierte Cloud, Flow-Edge oder Flow-Onprem.'},
    fr:{home:'Accueil',glance:'Glance',flow:'Flow',security:'Sécurité',pricing:'Tarifs',solutions:'Solutions',about:'À propos',insights:'Analyses',contact:'Contact',cta:'Réserver un appel',ctaS:'Réserver',menu:'Menu',close:'Fermer',primary:'Navigation principale',all:'Toutes les pages',
        hFlow:'Produit',hCo:'Entreprise',hLegal:'Mentions légales',privacy:'Confidentialité',terms:'Conditions',lang:'Langue',night:'Mode nuit',skip:'Aller au contenu',desc:'IA pour cabinets d’avocats : Flow lit les e-mails et les documents, rédige la réponse au client, met à jour le dossier et inscrit le délai, et un avocat valide chaque étape. Cloud masqué, Flow-Edge ou Flow-Onprem.'},
    es:{home:'Inicio',glance:'Glance',flow:'Flow',security:'Seguridad',pricing:'Precios',solutions:'Soluciones',about:'Sobre nosotros',insights:'Análisis',contact:'Contacto',cta:'Reservar una llamada',ctaS:'Agendar',menu:'Menú',close:'Cerrar',primary:'Navegación principal',all:'Todas las páginas',
        hFlow:'Producto',hCo:'Empresa',hLegal:'Legal',privacy:'Privacidad',terms:'Términos',lang:'Idioma',night:'Modo noche',skip:'Saltar al contenido',desc:'IA para despachos de abogados: Flow lee correos y documentos, redacta la respuesta al cliente, actualiza el asunto y registra el plazo, y un abogado aprueba cada paso. Nube enmascarada, Flow-Edge o Flow-Onprem.'}
  };
  var FK={'ft.hFlow':'hFlow','ft.glance':'glance','ft.flow':'flow','ft.sec':'security','ft.pricing':'pricing','ft.solutions':'solutions','ft.hCo':'hCo','ft.about':'about','ft.blog':'insights','ft.contact':'contact','ft.hLegal':'hLegal','ft.privacy':'privacy','ft.terms':'terms'};
  /* phones under 420px: the header row has room for about ten characters on the call button, so de/fr/es use a short label there (full label in the menu panel and on wider screens) */
  var NARROW=matchMedia('(max-width:419px)');
  var busy=false;
  function paint(){
    var t=C[R]; if(!t||busy)return; busy=true;
    try{
      var m=document.getElementById('main'); if(m&&m.lang!==R)m.lang=R; if(d.lang!==R)d.lang=R;
      document.querySelectorAll('flow-header a[data-nav]').forEach(function(a){var v=t[a.getAttribute('data-nav')];if(v&&a.textContent!==v)a.textContent=v});
      var cl=(NARROW.matches&&t.ctaS)||t.cta;document.querySelectorAll('flow-header [data-book] .dlbl, [data-cta-label="book"] .dlbl').forEach(function(b){var v=b.closest('.fh-panel')?t.cta:cl;if(b.textContent!==v)b.textContent=v});
      var ln=document.querySelector('flow-header [data-role=links]'); if(ln)ln.setAttribute('aria-label',t.primary);
      var al=document.querySelector('flow-header [data-role=all]'); if(al)al.setAttribute('aria-label',t.all);
      var mb=document.getElementById('fhMenuBtn'); if(mb)mb.setAttribute('aria-label',mb.getAttribute('aria-expanded')==='true'?t.close:t.menu);
      var f=document.querySelector('.site-foot'); if(f){f.lang=R;f.dir='ltr';f.querySelectorAll('[data-k]').forEach(function(el){var k=FK[el.getAttribute('data-k')];if(k&&t[k]&&el.textContent!==t[k])el.textContent=t[k]});
        f.querySelectorAll('nav[aria-label]').forEach(function(n){var a=n.getAttribute('aria-label');var k={Product:'hFlow',Company:'hCo',Legal:'hLegal'}[a];if(k)n.setAttribute('aria-label',t[k])})}
      var tb=document.getElementById('themeBtn'); if(tb)tb.setAttribute('aria-label',t.night);
      var lb=document.getElementById('langBtn'); if(lb)lb.setAttribute('aria-label',t.lang);
      var sk=document.querySelector('.skip-link'); if(sk)sk.textContent=t.skip;
      /* head: description and share text follow the rendered language (the title is already set by the page template) */
      /* t.desc is the legal page's text: insurance and cpas keep their own English description until they get translated ones */
      /* page description per profession page (legal = t.desc) */
      var PD={"insurance": {"de": "KI für Versicherungsagenturen: Flow liest Mitteilungen der Versicherer und Kunden-E-Mails, aktualisiert die Police in Ihrem Agentursystem und entwirft die Antwort, und ein Mitarbeiter gibt jeden Schritt frei. Maskierte Cloud, Flow-Edge oder Flow-Onprem.", "fr": "IA pour cabinets de courtage : Flow lit les avis des assureurs et les e-mails des clients, met à jour le contrat dans votre outil de gestion et rédige la réponse, et un collaborateur valide chaque étape. Cloud masqué, Flow-Edge ou Flow-Onprem.", "es": "IA para corredurías de seguros: Flow lee los avisos de las aseguradoras y los correos de los clientes, actualiza la póliza en su sistema de gestión y redacta la respuesta, y una persona del equipo aprueba cada paso. Nube enmascarada, Flow-Edge o Flow-Onprem."}, "cpas": {"de": "KI für Steuerkanzleien: Flow liest die Belege der Mandanten, bereitet die Buchungen in Ihrer Buchhaltungssoftware vor, fordert fehlende Lohn- und Prüfungsunterlagen an, und Ihr Team gibt jeden Schritt frei. Maskierte Cloud, Flow-Edge oder Flow-Onprem.", "fr": "IA pour cabinets d’expertise comptable : Flow lit les justificatifs des clients, prépare les écritures dans votre logiciel comptable, relance les pièces de paie et d’audit manquantes, et votre équipe valide chaque étape. Cloud masqué, Flow-Edge ou Flow-Onprem.", "es": "IA para asesorías: Flow lee los justificantes de los clientes, prepara los asientos en su software contable, reclama la documentación de nóminas y auditoría que falta, y su equipo aprueba cada paso. Nube enmascarada, Flow-Edge o Flow-Onprem."}},pg=(location.pathname.match(/\/solutions\/(legal|insurance|cpas)/)||[])[1],dsc=pg==='legal'?t.desc:(PD[pg]&&PD[pg][R]);
      if(dsc)document.querySelectorAll('meta[name=description],meta[property="og:description"],meta[name="twitter:description"]').forEach(function(m){if(m.content!==dsc)m.content=dsc});
      document.querySelectorAll('meta[property="og:title"],meta[name="twitter:title"]').forEach(function(m){if(m.content!==document.title)m.content=document.title});
    }finally{busy=false}
  }
  paint();
  if(NARROW.addEventListener)NARROW.addEventListener('change',paint);
  document.addEventListener('DOMContentLoaded',paint); addEventListener('load',paint);
  var mo=new MutationObserver(function(){
    var u=d.dataset.ui||'en';
    if(u!==R && u!=='he' && ['en','de','fr','es'].indexOf(u)>=0){ try{localStorage.setItem('flow.lang',u)}catch(e){} /* a ?lang= in the address would win over the stored pick on reload: carry the new one */ var x=new URL(location.href); if(x.searchParams.has('lang')){x.searchParams.set('lang',u); location.replace(x.href)} else location.reload(); return; }
    paint();
  });
  mo.observe(d,{attributes:true,attributeFilter:['data-ui','lang']});
  var mm=document.getElementById('main'); if(mm) new MutationObserver(function(){ if(mm.lang!==R && C[R]) mm.lang=R; }).observe(mm,{attributes:true,attributeFilter:['lang']});
  var fb=document.getElementById('fhMenuBtn'); if(fb) new MutationObserver(paint).observe(fb,{attributes:true,attributeFilter:['aria-expanded']});
})();
