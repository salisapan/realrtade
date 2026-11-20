/* v7 · Glance orbit (glance/integrations.js initOrbit20, Magic UI Orbiting Circles port), copied verbatim from src-live-r3.
   Only the boot is new: this page has no glyphs.js, the orbs already hold their <img> marks. */
(function () {
  'use strict';
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  /* =================================================================
     v20 · A (upper) — Orbiting Circles overview
     rAF-driven: each orb is placed every frame from one angle per ring,
     so the two rings counter-rotate smoothly and can ease to a crawl on
     hover (no CSS keyframe jump). Geometry follows the stage width.
     ================================================================= */
  function initOrbit20(stage) {
    var rings = $all('.o20-ring', stage).map(function (el) {
      var orbs = $all('.o20-orb', el);
      return { el: el, orbs: orbs, kind: el.getAttribute('data-ring'), speed: Number(el.getAttribute('data-speed') || 6), theta: el.getAttribute('data-ring') === 'out' ? -12 : 18, r: 0 };
    });
    var tracks = stage.querySelector('.o20-tracks');
    var W = 0, H = 0, rate = 1, target = 1, last = 0, visible = true, orbS = 52;
    function layout() {
      var R = stage.getBoundingClientRect();
      if (R.width < 80 || R.height < 80) return; // not laid out yet
      W = R.width; H = R.height;
      var mobile = W < 520;
      orbS = mobile ? 42 : 54;
      var rOut = Math.min(232, (Math.min(W, H) - orbS) / 2 - 10);
      var rIn = Math.round(rOut * 0.585);
      rings.forEach(function (rg) { rg.r = rg.kind === 'out' ? rOut : rIn; });
      stage.style.setProperty('--rin', rIn + 'px');
      stage.style.setProperty('--rout', rOut + 'px');
      stage.style.setProperty('--orb', orbS + 'px');
      if (tracks) {
        var cx = W / 2, cy = H / 2;
        tracks.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        tracks.setAttribute('width', W); tracks.setAttribute('height', H);
        var uid = 'o' + Math.random().toString(36).slice(2, 7);
        tracks.innerHTML =
          '<defs><linearGradient id="' + uid + 'a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--o20-tk-a)"/><stop offset="1" style="stop-color:var(--o20-tk-b)"/></linearGradient>' +
          '<linearGradient id="' + uid + 's" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--o20-sheen);stop-opacity:0"/><stop offset="1" style="stop-color:var(--o20-sheen);stop-opacity:1"/></linearGradient></defs>' +
          '<circle class="o20-tk" cx="' + cx + '" cy="' + cy + '" r="' + rIn + '" stroke="url(#' + uid + 'a)"/>' +
          '<circle class="o20-tk o20-tk-out" cx="' + cx + '" cy="' + cy + '" r="' + rOut + '" stroke="url(#' + uid + 'a)"/>' +
          '';
        // sheen arcs live in their own small SVGs, rotated with a CSS transform (compositor-only, no SVG repaint per frame)
        $all('.o20-sheen', stage).forEach(function (n) { n.remove(); });
        rings.forEach(function (rg) {
          var r = rg.r, sz = 2 * r + 4;
          var el = document.createElementNS(SVGNS, 'svg');
          el.setAttribute('class', 'o20-sheen'); el.setAttribute('aria-hidden', 'true');
          el.setAttribute('width', sz); el.setAttribute('height', sz); el.setAttribute('viewBox', '0 0 ' + sz + ' ' + sz);
          el.style.left = (cx - sz / 2) + 'px'; el.style.top = (cy - sz / 2) + 'px';
          el.innerHTML = '<defs><linearGradient id="' + uid + rg.kind + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--o20-sheen);stop-opacity:0"/><stop offset="1" style="stop-color:var(--o20-sheen);stop-opacity:1"/></linearGradient></defs>' +
            '<circle cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" stroke="url(#' + uid + rg.kind + ')" stroke-dasharray="' + (r * (rg.kind === 'out' ? 0.9 : 1.1)) + ' ' + (r * 7) + '"/>';
          stage.insertBefore(el, tracks.nextSibling);
          rg.sheen = el;
        });
      }
      place();
    }
    function place() {
      var cx = W / 2, cy = H / 2;
      rings.forEach(function (rg) {
        var n = rg.orbs.length;
        rg.orbs.forEach(function (o, i) {
          var a = (rg.theta + (360 / n) * i - 90) * Math.PI / 180;
          var x = cx + rg.r * Math.cos(a) - orbS / 2, y = cy + rg.r * Math.sin(a) - orbS / 2;
          o.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
        });
        if (rg.sheen) rg.sheen.style.transform = 'rotate(' + (rg.theta * 1.6).toFixed(2) + 'deg)';
      });
    }
    function frame(now) {
      var dt = last ? Math.min(64, now - last) : 16; last = now;
      rate += (target - rate) * Math.min(1, dt / 260); // ease toward target speed
      rings.forEach(function (rg) { rg.theta += rg.speed * rate * dt / 1000; });
      place();
      if (visible) requestAnimationFrame(frame); else last = 0;
    }
    stage.addEventListener('pointerenter', function () { target = 0.12; });
    stage.addEventListener('pointerleave', function () { target = 1; });
    stage.addEventListener('focusin', function () { target = 0.12; });
    stage.addEventListener('focusout', function () { target = 1; });
    var raf = 0;
    function relayout() { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(stage);
    window.addEventListener('resize', relayout);
    layout();
    stage.classList.add('is-ready');
    if (REDUCE) return;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        var v = es[0].isIntersecting;
        if (v && !visible) { visible = true; requestAnimationFrame(frame); }
        visible = v;
      }, { rootMargin: '120px' }).observe(stage);
    }
    requestAnimationFrame(frame);
  }
  function boot() { $all('[data-orbit20]').forEach(initOrbit20); }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
