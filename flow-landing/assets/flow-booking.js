/* FLOW booking: capture an enquiry before opening the existing calendar.
 * Uses the existing submit-lead contract. `website` is its hidden honeypot.
 * No sign-in simulation, local success mode, inferred company or localStorage.
 */
(function () {
  'use strict';
  var BOOKING_URL = 'https://calendar.app.google/FLWjDDQWAiM3bHvc9';
  var T = {
    en: ['Book a call','Leave your details before choosing a time.','Full name','Work email','Company','Phone (optional)','Save details and continue','Please enter your name, a valid email and company.','Saving…','We could not save your details. Please try again.','Details received','Your details have been received. Now choose a time in the calendar.','Choose a time','Close','Your details will be sent to Flow to handle your enquiry.','Privacy policy'],
    he: ['קביעת שיחה','משאירים פרטים לפני בחירת מועד.','שם מלא','אימייל עבודה','חברה','טלפון (לא חובה)','שמירת פרטים והמשך','נא למלא שם, אימייל תקין וחברה.','שומר פרטים…','לא הצלחנו לשמור את הפרטים. נסו שוב.','הפרטים התקבלו','הפרטים התקבלו. כעת אפשר לבחור מועד ביומן.','בחירת מועד','סגירה','הפרטים יישלחו ל-Flow לצורך טיפול בפנייה.','מדיניות פרטיות'],
    de: ['Gespräch vereinbaren','Hinterlassen Sie Ihre Daten, bevor Sie einen Termin wählen.','Vollständiger Name','Geschäftliche E-Mail','Unternehmen','Telefon (optional)','Daten speichern und weiter','Bitte geben Sie Name, gültige E-Mail und Unternehmen ein.','Wird gespeichert…','Ihre Daten konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.','Daten erhalten','Ihre Daten sind eingegangen. Wählen Sie jetzt einen Termin im Kalender.','Termin wählen','Schließen','Ihre Daten werden zur Bearbeitung Ihrer Anfrage an Flow gesendet.','Datenschutzerklärung'],
    fr: ['Réserver un appel','Laissez vos coordonnées avant de choisir un créneau.','Nom complet','E-mail professionnel','Entreprise','Téléphone (facultatif)','Enregistrer et continuer','Saisissez votre nom, un e-mail valide et votre entreprise.','Enregistrement…','Impossible d’enregistrer vos coordonnées. Veuillez réessayer.','Coordonnées reçues','Vos coordonnées ont été reçues. Choisissez maintenant un créneau dans l’agenda.','Choisir un créneau','Fermer','Vos coordonnées seront envoyées à Flow pour traiter votre demande.','Politique de confidentialité'],
    es: ['Reservar una llamada','Deje sus datos antes de elegir una hora.','Nombre completo','Correo de trabajo','Empresa','Teléfono (opcional)','Guardar datos y continuar','Introduzca su nombre, un correo válido y su empresa.','Guardando…','No pudimos guardar sus datos. Inténtelo de nuevo.','Datos recibidos','Hemos recibido sus datos. Ahora elija una hora en el calendario.','Elegir una hora','Cerrar','Sus datos se enviarán a Flow para atender su consulta.','Política de privacidad']
  };
  var root, opener, busy = false, saved = false, oldOverflow, dialogLang;
  // An explicit supported URL language is the site's initial language authority.
  // Fall back to the page's selected language for URLs without ?lang=.
  function pageLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (Object.prototype.hasOwnProperty.call(T, q)) return q;
    var d = document.documentElement;
    var selected = (d.dataset.ui || d.lang || 'en').slice(0, 2).toLowerCase();
    return Object.prototype.hasOwnProperty.call(T, selected) ? selected : 'en';
  }
  // Keep one language for the lifetime of each open enquiry, including retries.
  function lang() { return dialogLang || pageLang(); }
  function text() { return T[lang()] || T.en; }
  function esc(v) { return String(v).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function button(label) {return '<span class="shell"></span><span class="dring"></span><span class="shine"></span><span class="dlbl">'+esc(label)+'</span>'; }
  function field(n, label, type, auto, max, required) {
    return '<label>' + esc(label) + '<input name="' + n + '" type="' + type + '" autocomplete="' + auto + '" maxlength="' + max + '"' + (required ? ' required' : '') + (type === 'email' || type === 'tel' ? ' dir="ltr"' : '') + '></label>';
  }
  function close() {
    if (!root || busy) return;
    root.classList.remove('is-open'); root.hidden = true;
    document.documentElement.style.overflow = oldOverflow;
    if (window.__lenis) window.__lenis.start();
    if (opener && opener.focus) opener.focus();
  }
  function open(el) {
    if (root && root.classList.contains('is-open')) return;
    dialogLang = pageLang();
    var t = text(); opener = el && el.focus ? el : document.activeElement; saved = false;
    if (!root) {
      root = document.createElement('div'); root.className = 'fb'; root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true');
      document.body.appendChild(root);
      root.addEventListener('click', function(e) { if (e.target === root || e.target.closest('[data-fb-close]')) close(); });
      root.addEventListener('submit', submit);
      document.addEventListener('keydown', function(e) {
        if (root.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key !== 'Tab') return;
        var items = Array.from(root.querySelectorAll('input,select,button,a')).filter(function(x) { return !x.disabled && x.getClientRects().length; });
        var a=items[0], z=items[items.length-1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      });
    }
    root.lang=lang(); root.dir=lang()==='he'?'rtl':'ltr'; root.setAttribute('aria-label',t[0]);
    root.innerHTML='<div class="fb-card"><button type="button" class="fb-x" data-fb-close aria-label="'+esc(t[13])+'">×</button><div data-fb-body><h2>'+esc(t[0])+'</h2><p class="fb-sub">'+esc(t[1])+'</p><form novalidate>'+
      field('name',t[2],'text','name',120,true)+field('company',t[4],'text','organization',160,true)+field('email',t[3],'email','email',200,true)+field('phone',t[5],'tel','tel',80,false)+'<label>'+esc(({he:'כמה עובדים (לא חובה)',en:'Employees (optional)',de:'Mitarbeitende (optional)',fr:'Collaborateurs (facultatif)',es:'Empleados (opcional)'})[lang()]||'Employees (optional)')+'<select name="seats"><option value="">'+esc(({he:'בחרו',en:'Select',de:'Auswählen',fr:'Choisir',es:'Seleccione'})[lang()]||'Select')+'</option>'+['1-10','11-25','26-50','51-200','200+'].map(function(x){return '<option>'+x+'</option>';}).join('')+'</select></label>'+
      '<div class="fb-trap" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><p class="fb-hint">'+esc(t[14])+' <a href="/privacy.html">'+esc(t[15])+'</a></p><p class="fb-err" role="alert" data-fb-error></p><button class="fb-btn doit" type="submit">'+button(t[6])+'</button></form></div></div>';
    root.querySelector('[name=email]').placeholder='you@company.com';
    root.querySelector('[name=phone]').placeholder='050-0000000';
    oldOverflow=document.documentElement.style.overflow; root.hidden=false; root.classList.add('is-open'); document.documentElement.style.overflow='hidden';
    if(window.__lenis) window.__lenis.stop(); root.querySelector('[name=name]').focus();
  }
  async function submit(e) {
    e.preventDefault(); if(busy || saved) return;
    var f=e.target,t=text(),err=f.querySelector('[data-fb-error]');
    function val(n) { return f.elements.namedItem(n).value.trim(); }
    if(!val('name') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email')) || !val('company')) { err.textContent=t[7]; return; }
    // Keep visitor data in the existing lead schema; website is NOT company URL.
    var payload={name:val('name'),email:val('email'),company:val('company'),website:val('website'),role:'',seats:val('seats'),deployment:'',timeline:'',message:'Call booking enquiry\nLanguage: '+lang()+'\nPage: '+location.pathname+(val('phone')?'\nPhone: '+val('phone'):''),source:'booking',lang:lang()};
    busy=true; err.textContent=''; var btn=f.querySelector('[type=submit]'); btn.disabled=true; btn.querySelector('.dlbl').textContent=t[8];
    root.setAttribute('aria-busy','true');
    try {
      var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},20000);
      var res=await fetch('/.netlify/functions/submit-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      var data=await res.json();
      if(!res.ok || data.ok!==true || payload.website) throw new Error('lead not accepted');
      saved=true;
      // Inert conversion signal only. No tag script is loaded here; a tag manager added later can read it.
      try { window.dataLayer=window.dataLayer||[]; window.dataLayer.push({event:'flow_lead_submit',lead_source:'booking',lang:lang()}); } catch(ignore) {}
      // A real user click after success avoids popup blocking during async save.
      root.querySelector('[data-fb-body]').innerHTML='<h2>'+esc(t[10])+'</h2><p class="fb-sub" role="status">'+esc(t[11])+'</p><div class="fb-act"><a class="fb-btn doit fb-calendar" href="'+BOOKING_URL+'" target="_blank" rel="noopener noreferrer" data-fb-calendar>'+button(t[12])+'</a></div>';
      root.querySelector('[data-fb-calendar]').focus();
    } catch(ignore) { err.textContent=t[9]; btn.disabled=false; btn.querySelector('.dlbl').textContent=t[6]; }
    finally { clearTimeout(timer); busy=false; root.removeAttribute('aria-busy'); }
  }
  function booking(el) {
    if(el.hasAttribute('data-book')) return true;
    if(el.tagName!=='A') return false;
    try { var u=new URL(el.href,location.href); return u.origin==='https://calendar.app.google' && u.pathname==='/FLWjDDQWAiM3bHvc9'; } catch(ignore) { return false; }
  }
  function capture(e) {
    var el=e.target.closest && e.target.closest('[data-book],a[href]');
    if(!el || el.hasAttribute('data-fb-calendar') || !booking(el)) return;
    e.preventDefault(); e.stopImmediatePropagation(); if(e.type==='click') open(el);
  }
  // Remove the direct destination from existing anchors, including context-menu
  // open/copy. The only calendar anchor is created after a successful save.
  function normalize() {
    document.querySelectorAll('a[href]').forEach(function(a) {
      if (!a.hasAttribute('data-fb-calendar') && a.getAttribute('href') !== '#book' && booking(a)) {
        a.setAttribute('data-book',''); a.setAttribute('href','#book');
        a.removeAttribute('target');
      }
    });
  }
  normalize();
  new MutationObserver(normalize).observe(document.body,{childList:true,subtree:true});
  // Capture both current data-book controls and existing direct calendar links.
  document.addEventListener('click',capture,true);
  document.addEventListener('auxclick',capture,true);
  window.FlowBooking={open:open,close:close};
})();
