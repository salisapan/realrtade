/* Flow shared header — <flow-header data-brand="auto"> — v13r34
   Reusable web component (light DOM, inherits page tokens). Hebrew RTL first; follows <html lang> and <html dir>.
   - Desktop: Glance · Flow · Solutions · Security · Pricing · Insights inline + one primary CTA "קביעת שיחה".
   - Quiet menu button opens ALL items (dropdown on desktop, light full-screen sheet on mobile).
   - Adopts an existing #ctl (language / theme toggles) from the page into its end slot.
   - The CTA carries [data-book]; assets/flow-booking.js opens the booking flow. */
(function () {
  /* relative targets: resolve at a domain root (theflow-ai.com/security.html) and when the page is served from a sub-path (preview hosts) */
  var HREF = { home: './index.html', glance: './trial.html', flow: './index.html#product', security: './security.html', pricing: './pricing.html', solutions: './solutions/index.html', about: './about.html', insights: './blog/index.html', contact: './contact.html', privacy: './privacy.html', terms: './terms.html' };
  /* menu = footer: Product (Glance, Flow, Security, Pricing, Solutions) + Company (About, Insights, Contact). Logo = home. Privacy/Terms live only in the footer legal row. */
  var ORDER = ['glance', 'flow', 'security', 'pricing', 'solutions', 'about', 'insights', 'contact'];
  var INLINE = ['glance', 'flow', 'solutions', 'security', 'pricing', 'insights'];
  var T = {
    he: { home: 'בית', glance: 'Glance', flow: 'Flow', security: 'אבטחה', pricing: 'תמחור', solutions: 'פתרונות', about: 'אודות', insights: 'תובנות', contact: 'צור קשר', privacy: 'פרטיות', terms: 'תנאים', cta: 'קביעת שיחה', menu: 'תפריט', close: 'סגירה', primary: 'ניווט ראשי', all: 'כל הדפים' },
    en: { home: 'Home', glance: 'Glance', flow: 'Flow', security: 'Security', pricing: 'Pricing', solutions: 'Solutions', about: 'About', insights: 'Insights', contact: 'Contact', privacy: 'Privacy', terms: 'Terms', cta: 'Book a call', menu: 'Menu', close: 'Close', primary: 'Primary', all: 'All pages' }
  };
  function uiLang() { var d = document.documentElement; return (d.dataset.ui || d.lang || 'he').slice(0, 2); }
  function dict() { return T[uiLang()] || T.en; }
  var BASE = '';
  function href(k) { return (BASE || './') + HREF[k].slice(2); }
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
      this.querySelector('.fh-panel').addEventListener('click', function (e) {
        var a = e.target.closest('a'), b = e.target.closest('[data-book]');
        if (b) { self.toggle(false); return; }
        if (a) { self.toggle(false); self.anchor(e, a); }
      });
      this.querySelector('.fh-links').addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) self.anchor(e, a); });
      document.addEventListener('click', function (e) { if (self.root.classList.contains('is-open') && !self.root.contains(e.target)) self.toggle(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && self.root.classList.contains('is-open')) { self.toggle(false); self.btn.focus(); } });
      var onScroll = function () { self.root.classList.toggle('is-scrolled', (window.scrollY || document.documentElement.scrollTop) > 8); };
      addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }
    render() {
      var t = dict(), l = uiLang(); if (this.root) { this.root.lang = l; this.root.dir = l === 'he' ? 'rtl' : 'ltr'; }
      this.querySelector('[data-role=links]').innerHTML = INLINE.map(function (k) { return link(k, t); }).join('');
      this.querySelector('[data-role=links]').setAttribute('aria-label', t.primary);
      this.querySelector('[data-role=all]').innerHTML = ORDER.map(function (k) { return (k === 'about' ? '<div class="sep"></div>' : '') + link(k, t); }).join('');
      this.querySelector('[data-role=all]').setAttribute('aria-label', t.all);
      this.querySelectorAll('[data-book]').forEach(function (b) { (b.querySelector('.dlbl') || b).textContent = t.cta; });
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
      if (mobile) { document.documentElement.style.overflow = open ? 'hidden' : ''; if (window.__lenis) { open ? window.__lenis.stop() : window.__lenis.start(); } }
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
