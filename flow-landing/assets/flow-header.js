/* Flow shared header — <flow-header data-brand="auto"> — v13r35 (13.11: de/fr/es labels)
   Reusable web component (light DOM, inherits page tokens). Hebrew RTL first; follows <html lang> and <html dir>.
   - Desktop: Glance · Flow · Solutions · Security · Pricing inline + one primary CTA "קביעת שיחה".
   - Quiet menu button opens the five, a divider, then Insights · About · Contact (dropdown on desktop, light full-screen sheet on mobile).
   - Adopts an existing #ctl (language / theme toggles) from the page into its end slot.
   - The CTA carries [data-book]; assets/flow-booking.js opens the booking flow. */
(function () {
  /* relative targets: resolve at a domain root (theflow-ai.com/security.html) and when the page is served from a sub-path (preview hosts) */
  var HREF = { home: './index.html', glance: './glance.html', flow: './index.html#product', security: './security.html', pricing: './pricing.html', solutions: './solutions.html', about: './about.html', insights: './articles.html', contact: './contact.html', privacy: './privacy.html', terms: './terms.html' };
  /* menu = footer: Product (Glance, Flow, Security, Pricing, Solutions) + Company (About, Insights, Contact). Logo = home. Privacy/Terms live only in the footer legal row. */
  var ORDER = ['glance', 'flow', 'solutions', 'security', 'pricing', 'insights', 'about', 'contact'];
  var INLINE = ORDER.slice(0, 5);
  var T = {
    he: { home: 'בית', glance: 'Glance', flow: 'Flow', security: 'אבטחה', pricing: 'תמחור', solutions: 'פתרונות', about: 'אודות', insights: 'תובנות', contact: 'צור קשר', privacy: 'פרטיות', terms: 'תנאים', cta: 'קביעת שיחה', getg: 'התקן Glance', menu: 'תפריט', close: 'סגירה', primary: 'ניווט ראשי', all: 'כל הדפים' },
    en: { home: 'Home', glance: 'Glance', flow: 'Flow', security: 'Security', pricing: 'Pricing', solutions: 'Solutions', about: 'About', insights: 'Insights', contact: 'Contact', privacy: 'Privacy', terms: 'Terms', cta: 'Book a call', getg: 'Get Glance', menu: 'Menu', close: 'Close', primary: 'Primary', all: 'All pages' },
    de: { home: 'Startseite', glance: 'Glance', flow: 'Flow', security: 'Sicherheit', pricing: 'Preise', solutions: 'Lösungen', about: 'Über uns', insights: 'Einblicke', contact: 'Kontakt', privacy: 'Datenschutz', terms: 'Nutzungsbedingungen', cta: 'Gespräch vereinbaren', ctaS: 'Termin', getg: 'Glance holen', menu: 'Menü', close: 'Schließen', primary: 'Hauptnavigation', all: 'Alle Seiten' },
    fr: { home: 'Accueil', glance: 'Glance', flow: 'Flow', security: 'Sécurité', pricing: 'Tarifs', solutions: 'Solutions', about: 'À propos', insights: 'Analyses', contact: 'Contact', privacy: 'Confidentialité', terms: 'Conditions', cta: 'Réserver un appel', ctaS: 'Réserver', getg: 'Obtenir Glance', menu: 'Menu', close: 'Fermer', primary: 'Navigation principale', all: 'Toutes les pages' },
    es: { home: 'Inicio', glance: 'Glance', flow: 'Flow', security: 'Seguridad', pricing: 'Precios', solutions: 'Soluciones', about: 'Sobre nosotros', insights: 'Análisis', contact: 'Contacto', privacy: 'Privacidad', terms: 'Términos', cta: 'Reservar una llamada', ctaS: 'Agendar', getg: 'Obtener Glance', menu: 'Menú', close: 'Cerrar', primary: 'Navegación principal', all: 'Todas las páginas' }
  };
  function uiLang() { var d = document.documentElement; return (d.dataset.ui || d.lang || 'he').slice(0, 2); }
  function dict() { return T[uiLang()] || T.en; }
  /* product-aware: on Glance pages (glance*.html) the primary CTA is "Get Glance" (jumps to #get-glance); Flow pages keep "Book a call" */
  var GLANCE = /(^|\/)glance[^\/]*\.html$/i.test(location.pathname);
  function getHref() { if (HEURL) return document.getElementById('get-glance') ? '#get-glance' : '/glance#get-glance'; var l = uiLang() === 'en' ? 'glance-en.html' : 'glance.html'; return document.getElementById('get-glance') ? '#get-glance' : (BASE || './') + l + '#get-glance'; }
  var BASE = '';
  /* Hebrew URL pages (/he/...): menu links go to the Hebrew URL of each page */
  var HEURL = document.documentElement.getAttribute('data-page-lang') === 'he';
  var HE_HREF = { home: '/he/', glance: '/glance', flow: '/he/#product', security: '/he/security', pricing: '/he/pricing', solutions: '/he/solutions', about: '/he/about', insights: '/articles', contact: '/he/contact', privacy: '/he/privacy', terms: '/he/terms' };
  function href(k) { if (HEURL) return HE_HREF[k]; if (k === 'glance' && uiLang() === 'en') return (BASE || './') + 'glance-en.html'; return (BASE || './') + HREF[k].slice(2); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function link(k, t) { return '<a href="' + href(k) + '" data-nav="' + k + '">' + esc(t[k]) + '</a>'; }

  class FlowHeader extends HTMLElement {
    connectedCallback() {
      if (this._init) return; this._init = true; BASE = this.getAttribute('data-base') || '';
      var prev = this.previousElementSibling, ctl = prev && prev.id === 'ctl' ? prev : null;
      this.innerHTML =
        '<header class="fh" id="fh">' +
        '<div class="fh-in">' +
        '<a class="fh-brand" href="' + href('home') + '" aria-label="Flow"><img src="' + BASE + 'assets/flow-logo-200.webp" srcset="' + BASE + 'assets/flow-logo-200.webp 200w, ' + BASE + 'assets/flow-logo-400.webp 400w" sizes="64px" width="64" height="28" alt="Flow"></a>' +
        '<nav class="fh-links" data-role="links"></nav>' +
        '<div class="fh-end" data-role="end">' +
        '<button type="button" class="fh-menu" id="fhMenuBtn" aria-expanded="false" aria-controls="fhPanel"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="b" d="M2 5h12M2 11h12"/><path class="x" d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button>' +
        '<button type="button" class="fh-cta fh-cta-d doit" data-book><span class="shell"></span><span class="dring"></span><span class="shine"></span><span class="dlbl"></span></button>' +
        '</div></div>' +
        '<div class="fh-panel" id="fhPanel"><nav data-role="all"></nav><button type="button" class="fh-cta fh-cta-m doit" data-book><span class="shell"></span><span class="dring"></span><span class="shine"></span><span class="dlbl"></span></button></div>' +
        '</header>';
      this.root = this.querySelector('.fh');
      if (this.getAttribute('data-brand') === 'auto') this.root.setAttribute('data-brand-auto', '1');
      if (ctl) this.querySelector('[data-role=end]').prepend(ctl);
      this.btn = this.querySelector('#fhMenuBtn');
      this.render();
      var self = this;
      new MutationObserver(function () { self.render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-ui'] });
      this.btn.addEventListener('click', function (e) { e.stopPropagation(); self.toggle(); });
      if (GLANCE) this.root.addEventListener('click', function (e) {
        var g = e.target.closest('[data-glance-get]'); if (!g) return; e.preventDefault(); self.toggle(false);
        var h = getHref(), el = h.charAt(0) === '#' ? document.getElementById('get-glance') : null;
        if (!el) { location.href = h; return; }
        var y = el.getBoundingClientRect().top + (window.scrollY || 0) - 56;
        if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.6 }); else scrollTo({ top: y, behavior: 'smooth' });
      });
      this.querySelector('.fh-panel').addEventListener('click', function (e) {
        var a = e.target.closest('a'), b = e.target.closest('[data-book]');
        if (b) { self.toggle(false); return; }
        if (a) { self.toggle(false); self.anchor(e, a); }
      });
      this.querySelector('.fh-links').addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) self.anchor(e, a); });
      document.addEventListener('click', function (e) { if (self.root.classList.contains('is-open') && !self.root.contains(e.target)) self.toggle(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && self.root.classList.contains('is-open')) { self.toggle(false); self.btn.focus(); } });
      /* perf 2026-11-12: no scrollY read per scroll event (it forced a full style/layout on every frame and a layout while the body was still parsing).
         A 9px sentinel at the top of the page: once it leaves the viewport the header is "scrolled" (same 8px threshold). */
      if ('IntersectionObserver' in window && document.body) {
        var sn = document.createElement('div'); sn.setAttribute('aria-hidden', 'true'); sn.className = 'fh-sentinel';
        sn.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:9px;pointer-events:none;visibility:hidden;contain:strict';
        document.body.appendChild(sn);
        new IntersectionObserver(function (es) { self.root.classList.toggle('is-scrolled', !es[es.length - 1].isIntersecting); }).observe(sn);
      } else {
        var onScroll = function () { self.root.classList.toggle('is-scrolled', (window.scrollY || document.documentElement.scrollTop) > 8); };
        addEventListener('scroll', onScroll, { passive: true }); onScroll();
      }
    }
    render() {
      var t = dict(), l = uiLang(); if (this.root) { this.root.lang = l; this.root.dir = l === 'he' ? 'rtl' : 'ltr'; }
      this.querySelector('[data-role=links]').innerHTML = INLINE.map(function (k) { return link(k, t); }).join('');
      this.querySelector('[data-role=links]').setAttribute('aria-label', t.primary);
      this.querySelector('[data-role=all]').innerHTML = ORDER.map(function (k) { return (k === 'insights' ? '<div class="sep"></div>' : '') + link(k, t); }).join('');
      this.querySelector('[data-role=all]').setAttribute('aria-label', t.all);
      if (GLANCE) {
        this.querySelectorAll('.fh-cta').forEach(function (b) { b.removeAttribute('data-book'); b.setAttribute('data-glance-get', ''); (b.querySelector('.dlbl') || b).textContent = t.getg; });
      } else
      var narrow = t.ctaS && matchMedia('(max-width:419px)').matches; /* de/fr/es: short label on the header button under 420px (as r15-i18n) */
      this.querySelectorAll('[data-book]').forEach(function (b) { (b.querySelector('.dlbl') || b).textContent = (narrow && !b.closest('.fh-panel')) ? t.ctaS : t.cta; });
      /* in-page CTAs that keep their own link (no booking modal): same label, English unless the UI language is Hebrew */
      document.querySelectorAll('[data-cta-label="book"]').forEach(function (b) { (b.querySelector('.dlbl') || b).textContent = t.cta; });
      this.btn.setAttribute('aria-label', this.root.classList.contains('is-open') ? t.close : t.menu);
    }
    toggle(force) {
      var open = typeof force === 'boolean' ? force : !this.root.classList.contains('is-open');
      this.root.classList.toggle('is-open', open);
      this.btn.setAttribute('aria-expanded', String(open));
      this.btn.setAttribute('aria-label', open ? dict().close : dict().menu);
      var mobile = matchMedia('(max-width:759px)').matches;
      if (mobile || !open) { document.documentElement.classList.toggle('fh-lock', open && mobile); document.documentElement.style.overflow = open && mobile ? 'hidden' : ''; if (window.__lenis) { open && mobile ? window.__lenis.stop() : window.__lenis.start(); } }
      /* iOS ignores overflow:hidden on <html> for touch scrolling: swallow touchmoves that are not inside the open panel */
      if (!this._tm) { var self = this; this._tm = function (e) { if (self.root.classList.contains('is-open') && matchMedia('(max-width:759px)').matches && !e.target.closest('.fh-panel')) e.preventDefault(); }; document.addEventListener('touchmove', this._tm, { passive: false }); }
    }
    anchor(e, a) {
      var h = a.getAttribute('href');
      if (h !== href('flow') && h !== href('home')) return;
      var onHome = !!document.getElementById('hero');
      if (!onHome) return;
      e.preventDefault();
      var el = h === href('home') ? null : document.getElementById('product');
      var y = el ? el.getBoundingClientRect().top + (window.scrollY || 0) - 56 : 0;
      if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.6 }); else scrollTo({ top: y, behavior: 'smooth' });
    }
  }
  if (!customElements.get('flow-header')) customElements.define('flow-header', FlowHeader);
})();
