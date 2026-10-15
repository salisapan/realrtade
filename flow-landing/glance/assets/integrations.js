/* Corner v21 — integration components (vanilla ports, palette-locked).
   v20 · glance.html uses TWO: A Orbiting Circles (upper overview, initOrbit20) + B Animated Beam (lower, one ask → many tools, initBeam20).
   A · Orbiting Circles   — Magic UI (Dillion Verma) · https://21st.dev/@dillionverma/components/orbiting-circles
   B · Animated Beam      — Magic UI (Dillion Verma) · https://21st.dev/@dillionverma/components/animated-beam
   C · 3D Marquee         — Magic UI Marquee, 3D demo · https://21st.dev/@dillionverma/components/marquee
   Glyphs: glyphs.js (gray by default, #0071e3 on hover/active). */
(function () {
  'use strict';
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function g(id) { return window.glyphSVG ? window.glyphSVG(id) : ''; }
  function label(id) { return (window.GLYPHS && window.GLYPHS[id] && window.GLYPHS[id].label) || id; }

  /* ---------------- B · Animated Beam ---------------- */
  var STORIES = [
    { from: 'gmail', to: ['morning', 'calendar'], cap: 'Gmail · “issue the October invoice” → Morning · Calendar' },
    { from: 'whatsapp', to: ['morning'], cap: 'WhatsApp · “confirm the receipt today?” → Morning' },
    { from: 'outlook', to: ['calendar'], cap: 'Outlook · “confirm Thu 11:00?” → Calendar' },
    { from: 'slack', to: ['docs', 'todo'], cap: 'Slack · “own the kickoff notes” → Docs · To Do' },
    { from: 'gmail', to: ['drive'], cap: 'Gmail · “share the deck with Noa” → Drive' },
    { from: 'teams', to: ['sheets', 'onedrive'], cap: 'Teams · “update the Q4 budget” → Sheets · OneDrive' },
  ];

  function initBeam(root) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'beam-svg');
    svg.setAttribute('aria-hidden', 'true');
    root.insertBefore(svg, root.firstChild);
    var hub = root.querySelector('.hub-core');
    var cap = root.querySelector('.beam-cap-live');
    var paths = {}; // node id → {base, pulse, anim}
    var uid = 'b' + Math.random().toString(36).slice(2, 7);

    function center(el, side) {
      var r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
      var x = side === 'r' ? r.right - R.left : side === 'l' ? r.left - R.left : r.left - R.left + r.width / 2;
      return { x: x, y: r.top - R.top + r.height / 2 };
    }
    function build() {
      var R = root.getBoundingClientRect();
      if (R.width < 80 || R.height < 80) return; // not laid out yet
      svg.setAttribute('viewBox', '0 0 ' + R.width + ' ' + R.height);
      svg.setAttribute('width', R.width); svg.setAttribute('height', R.height);
      Object.keys(paths).forEach(function (k) { if (paths[k].anim) paths[k].anim.cancel(); });
      svg.innerHTML = '';
      paths = {};
      var defs = document.createElementNS(SVGNS, 'defs');
      svg.appendChild(defs);
      var hc = hub.getBoundingClientRect();
      $all('.tool[data-node]', root).forEach(function (tile, i) {
        var id = tile.getAttribute('data-node');
        var out = !!tile.closest('.beam-out');
        var t = center(tile, out ? 'l' : 'r');
        var h = { x: (out ? hc.right : hc.left) - R.left, y: hc.top - R.top + hc.height / 2 };
        var a = out ? h : t, b = out ? t : h;
        var dx = (b.x - a.x) * 0.5;
        var d = 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
        var gid = uid + '-g' + i;
        var grad = document.createElementNS(SVGNS, 'linearGradient');
        grad.setAttribute('id', gid); grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', a.x); grad.setAttribute('y1', a.y); grad.setAttribute('x2', b.x); grad.setAttribute('y2', b.y);
        grad.innerHTML = '<stop offset="0" stop-color="#0071e3" stop-opacity=".15"/><stop offset=".55" stop-color="#0071e3"/><stop offset="1" stop-color="#59a3ed"/>';
        defs.appendChild(grad);
        var base = document.createElementNS(SVGNS, 'path');
        base.setAttribute('d', d); base.setAttribute('class', 'beam-base');
        var pulse = document.createElementNS(SVGNS, 'path');
        pulse.setAttribute('d', d); pulse.setAttribute('class', 'beam-pulse'); pulse.setAttribute('stroke', 'url(#' + gid + ')');
        svg.appendChild(base); svg.appendChild(pulse);
        var L = pulse.getTotalLength();
        var dash = Math.min(90, L * 0.32);
        pulse.style.strokeDasharray = dash + ' ' + (L + dash);
        pulse.style.strokeDashoffset = REDUCE ? String(-L * 0.4) : String(dash);
        var anim = null;
        if (!REDUCE && pulse.animate) {
          anim = pulse.animate([{ strokeDashoffset: dash }, { strokeDashoffset: -L }], {
            duration: 2600 + (i % 5) * 380, iterations: Infinity, delay: (out ? 900 : 0) + (i * 271) % 1700, easing: 'cubic-bezier(.4,0,.2,1)',
          });
        }
        paths[id] = { base: base, pulse: pulse, anim: anim, tile: tile };
      });
      paint();
    }
    var story = 0, hover = null;
    function paint() {
      var s = STORIES[story % STORIES.length];
      var hot = hover ? [hover] : [s.from].concat(s.to);
      Object.keys(paths).forEach(function (id) {
        var on = hot.indexOf(id) >= 0;
        paths[id].base.classList.toggle('hot', on);
        paths[id].pulse.classList.toggle('hot', on);
        paths[id].tile.classList.toggle('is-hot', on);
      });
      root.classList.toggle('has-hot', true);
      if (cap) cap.textContent = hover ? label(hover) + ' · Glance floats over it' : s.cap;
    }
    $all('.tool[data-node]', root).forEach(function (tile) {
      tile.addEventListener('pointerenter', function () { hover = tile.getAttribute('data-node'); paint(); });
      tile.addEventListener('pointerleave', function () { hover = null; paint(); });
      tile.addEventListener('focus', function () { hover = tile.getAttribute('data-node'); paint(); });
      tile.addEventListener('blur', function () { hover = null; paint(); });
    });
    if (!REDUCE) setInterval(function () { if (!hover) { story += 1; paint(); } }, 3200);
    var raf = 0;
    function rebuild() { cancelAnimationFrame(raf); raf = requestAnimationFrame(build); }
    if (window.ResizeObserver) new ResizeObserver(rebuild).observe(root);
    window.addEventListener('resize', rebuild);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
    build();
  }

  /* ---------------- A · Orbiting Circles ---------------- */
  function initOrbit(root) {
    $all('.orbit-ring', root).forEach(function (ring) {
      var items = $all('.orb', ring);
      var n = items.length;
      items.forEach(function (it, i) { it.style.setProperty('--angle', (360 / n) * i); });
    });
  }

  /* ---------------- C · 3D Marquee ---------------- */
  function initMarquee3d(root) {
    var ids = (root.getAttribute('data-tools') || '').split(/\s+/).filter(Boolean);
    var cols = Number(root.getAttribute('data-cols') || 4);
    var grid = root.querySelector('.m3d-grid');
    for (var c = 0; c < cols; c++) {
      var col = document.createElement('div');
      col.className = 'm3d-col' + (c % 2 ? ' rev' : '');
      col.style.setProperty('--dur', (26 + c * 5) + 's');
      var track = document.createElement('div');
      track.className = 'm3d-track';
      var seq = ids.slice(c * 3).concat(ids.slice(0, c * 3));
      var html = seq.map(function (id) {
        return '<div class="m3d-tile" tabindex="0"><span class="m3d-ic">' + g(id) + '</span><span class="m3d-name">' + label(id) + '</span></div>';
      }).join('');
      track.innerHTML = html + html; // seamless loop
      col.appendChild(track);
      grid.appendChild(col);
    }
  }


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

  /* =================================================================
     v20 · B (lower) — Animated Beam: one ask → many tools
     Cycles real cases (same action lists as the demos). The source beams
     INTO Glance, then Glance beams OUT to each tool in sequence. Paths are
     re-measured on resize; comets + route reveal run on rAF.
     ================================================================= */
  var LABEL20 = { morning: 'Morning', gmail: 'Gmail', calendar: 'Calendar', drive: 'Drive', whatsapp: 'WhatsApp', outlookcal: 'Outlook Calendar', outlook: 'Outlook', file: 'Files' };
  var CASES20 = [
    { id: 'invoice', src: 'file', to: ['drive', 'morning'], what: 'Brief', who: 'from Files', q: '“The signed brief just landed.”', steps: 2 },
    { id: 'payment', src: 'whatsapp', to: ['outlookcal', 'whatsapp'], what: 'Tasting', who: 'from Dani Lee', q: '“Move Thursday’s tasting?”', steps: 2 },
    { id: 'calendar', src: 'outlook', to: ['outlookcal', 'outlook'], what: 'Kickoff', who: 'from Noa', q: '“Confirm Thu 11:00?”', steps: 2 },
    { id: 'file', src: 'file', to: ['drive'], what: 'Brief', who: 'filed', q: '“The signed brief just landed.”', steps: 2 },
    { id: 'whatsapp', src: 'whatsapp', to: ['whatsapp', 'outlookcal'], what: 'Tasting', who: 'from Dani Lee', q: '“Move Thursday’s tasting?”', steps: 2 },
    { id: 'outlook', src: 'outlook', to: ['outlookcal', 'outlook'], what: 'Kickoff', who: 'from Noa in Outlook', q: '“Confirm Thu 11:00?”', steps: 2 },
  ];
  var HE20 = (document.documentElement.lang || '').indexOf('he') === 0;
  if (HE20) {
    var HEC = {
      invoice: { what: 'בריף', who: 'מקבצים', q: '״הבריף החתום נחת עכשיו.״' },
      payment: { what: 'טעימה', who: 'מדני לי', q: '״להזיז את הטעימה של חמישי?״' },
      calendar: { what: 'פגישה', who: 'מנועה', q: '״לשריין את חמישי לקיקאוף?״' },
      file: { what: 'בריף', who: 'תויק', q: '״הבריף החתום נחת עכשיו.״' },
      whatsapp: { what: 'טעימה', who: 'מדני לי', q: '״להזיז את הטעימה של חמישי?״' },
      outlook: { what: 'קיקאוף', who: 'מנועה באאוטלוק', q: '״מאשרת חמישי 11:00?״' }
    };
    CASES20.forEach(function (c) { var h = HEC[c.id]; if (h) { c.what = h.what; c.who = h.who; c.q = h.q; } });
  }
  var DUR20 = 4200, T_IN = 180, D_IN = 720, T_OUT = 1040, GAP_OUT = 480, D_OUT = 660;
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function initBeam20(root) {
    var svg = root.querySelector('.b20-svg');
    var core = root.querySelector('.b20-core');
    var sec = root.closest('section') || root.parentNode;
    var line = sec.querySelector('.b20-line');
    var pills = $all('.b20-pill', sec);
    var srcTiles = {}, dstTiles = {};
    $all('.b20-src .b20-tile', root).forEach(function (t) { srcTiles[t.getAttribute('data-node')] = t; });
    $all('.b20-dst .b20-tile', root).forEach(function (t) { dstTiles[t.getAttribute('data-node')] = t; });
    var links = {}; // key → {base, route, comet, head, L, kind}
    var uid = 'b' + Math.random().toString(36).slice(2, 7);
    var idx = 0, start = performance.now(), hovering = false, manualUntil = 0, visible = true;

    function rel(el) {
      var r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
      return { l: r.left - R.left, t: r.top - R.top, r: r.right - R.left, b: r.bottom - R.top, w: r.width, h: r.height };
    }
    function curve(a, b, vertical) {
      if (vertical) { var dy = (b.y - a.y) * 0.55; return 'M' + a.x + ',' + a.y + ' C' + a.x + ',' + (a.y + dy) + ' ' + b.x + ',' + (b.y - dy) + ' ' + b.x + ',' + b.y; }
      var dx = (b.x - a.x) * 0.55; return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
    }
    function mk(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
    function build() {
      var R = root.getBoundingClientRect();
      if (R.width < 80 || R.height < 80) return; // not laid out yet
      svg.setAttribute('viewBox', '0 0 ' + R.width + ' ' + R.height);
      svg.setAttribute('width', R.width); svg.setAttribute('height', R.height);
      svg.innerHTML = '';
      links = {};
      var defs = mk('defs', {}); svg.appendChild(defs);
      var gBase = mk('g', { 'class': 'b20-g-base' }), gRoute = mk('g', { 'class': 'b20-g-route' }), gComet = mk('g', { 'class': 'b20-g-comet' });
      svg.appendChild(gBase); svg.appendChild(gRoute); svg.appendChild(gComet);
      var c = rel(core);
      var cx = c.l + c.w / 2, cy = c.t + c.h / 2;
      var anySrc = srcTiles[Object.keys(srcTiles)[0]];
      var vertical = rel(anySrc).b <= c.t + 2; // stacked layout (phones): sources above the core
      root.classList.toggle('is-vertical', vertical);
      function add(key, a, b, kind) {
        var d = curve(a, b, vertical);
        var gid = uid + '-' + key;
        var grad = mk('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        grad.innerHTML = '<stop offset="0" style="stop-color:var(--b20-c0)"/><stop offset="1" style="stop-color:var(--b20-c1)"/>';
        defs.appendChild(grad);
        var base = mk('path', { d: d, 'class': 'b20-base' });
        var route = mk('path', { d: d, 'class': 'b20-route' });
        var comet = mk('path', { d: d, 'class': 'b20-comet', stroke: 'url(#' + gid + ')' });
        var head = mk('circle', { r: 3.2, 'class': 'b20-head', cx: a.x, cy: a.y });
        gBase.appendChild(base); gRoute.appendChild(route); gComet.appendChild(comet); gComet.appendChild(head);
        var L = base.getTotalLength();
        route.style.strokeDasharray = L + ' ' + L; route.style.strokeDashoffset = L;
        var D = Math.min(64, L * 0.4);
        comet.style.strokeDasharray = D + ' ' + (L + D); comet.style.strokeDashoffset = D;
        links[key] = { base: base, route: route, comet: comet, head: head, L: L, D: D };
      }
      Object.keys(srcTiles).forEach(function (k) {
        var t = rel(srcTiles[k]);
        if (vertical) add('in-' + k, { x: t.l + t.w / 2, y: t.b }, { x: cx, y: c.t }, 'in');
        else add('in-' + k, { x: t.r, y: t.t + t.h / 2 }, { x: c.l, y: cy }, 'in');
      });
      Object.keys(dstTiles).forEach(function (k) {
        var t = rel(dstTiles[k]);
        if (vertical) add('out-' + k, { x: cx, y: c.b }, { x: t.l + t.w / 2, y: t.t }, 'out');
        else add('out-' + k, { x: c.r, y: cy }, { x: t.l, y: t.t + t.h / 2 }, 'out');
      });
      render(performance.now());
    }
    function caseNow() { return CASES20[idx % CASES20.length]; }
    function setCase(i, manual) {
      idx = (i + CASES20.length) % CASES20.length;
      start = performance.now();
      if (manual) manualUntil = start + 9000;
      var cs = caseNow();
      if (line) line.innerHTML = '<b>' + cs.what + '</b> ' + cs.who + ' → ' + cs.to.map(function (k) { return LABEL20[k]; }).join(' · ') + '<i class="b20-dot"> · </i><span class="b20-n">' + (HE20 ? cs.steps + ' צעדים, קליק אחד' : cs.steps + ' steps, one click') + '</span>';
      pills.forEach(function (p) {
        var on = p.getAttribute('data-case') === cs.id;
        p.classList.toggle('on', on); p.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) { p.classList.remove('run'); void p.offsetWidth; if (!REDUCE) p.classList.add('run'); }
      });
      Object.keys(srcTiles).forEach(function (k) {
        var on = k === cs.src;
        srcTiles[k].classList.toggle('is-src', on);
        if (on) { var q = srcTiles[k].querySelector('.b20-q'); if (q) q.textContent = cs.q; }
      });
      root.setAttribute('data-case', cs.id);
      render(start);
    }
    function render(now) {
      var cs = caseNow();
      var t = now - start;
      if (REDUCE) t = DUR20 - 600; // static: the whole case drawn
      var outro = REDUCE ? 1 : 1 - clamp01((t - (DUR20 - 380)) / 380);
      var firing = false;
      var plan = { };
      plan['in-' + cs.src] = { t0: T_IN, d: D_IN };
      cs.to.forEach(function (k, i) { plan['out-' + k] = { t0: T_OUT + i * GAP_OUT, d: D_OUT }; });
      Object.keys(links).forEach(function (key) {
        var lk = links[key], pl = plan[key];
        var p = pl ? clamp01((t - pl.t0) / pl.d) : 0;
        var e = ease(p);
        lk.route.style.strokeDashoffset = (lk.L * (1 - e)).toFixed(2);
        lk.route.style.opacity = pl ? outro.toFixed(3) : '0';
        var travelling = pl && p > 0 && p < 1 && !REDUCE;
        if (travelling) firing = true;
        lk.comet.style.strokeDashoffset = (lk.D - e * (lk.L + lk.D)).toFixed(2);
        lk.comet.style.opacity = travelling ? '1' : '0';
        if (travelling) {
          var pt = lk.base.getPointAtLength(Math.min(lk.L, e * (lk.L + lk.D))); // head rides the front of the comet
          lk.head.setAttribute('cx', pt.x.toFixed(2)); lk.head.setAttribute('cy', pt.y.toFixed(2));
          lk.head.style.opacity = '1';
        } else lk.head.style.opacity = '0';
        var k = key.slice(key.indexOf('-') + 1);
        if (key.indexOf('out-') === 0 && dstTiles[k]) {
          // a tool lights when its beam lands, then ticks
          dstTiles[k].classList.toggle('is-on', !!pl && (REDUCE || e > 0.86) && outro > 0.5);
          dstTiles[k].classList.toggle('is-done', !!pl && (REDUCE || t > pl.t0 + pl.d + 140) && outro > 0.5);
        }
        if (key.indexOf('in-') === 0 && srcTiles[k]) srcTiles[k].classList.toggle('is-on', !!pl && outro > 0.5);
      });
      core.classList.toggle('is-recv', t > T_IN + D_IN - 60 && outro > 0.5);
      root.classList.toggle('is-firing', firing);
      root.classList.toggle('has-case', true);
    }
    function frame(now) {
      if (!REDUCE) {
        var t = now - start, HOLD = DUR20 - 420;
        var holding = hovering || now < manualUntil;
        if (holding && t > HOLD) start = now - HOLD; // finish the case, then hold its closed state
        else if (t >= DUR20) setCase(idx + 1);
      }
      render(now);
      if (visible) requestAnimationFrame(frame);
    }
    root.addEventListener('pointerenter', function () { hovering = true; });
    root.addEventListener('pointerleave', function () { hovering = false; });
    pills.forEach(function (p, i) {
      p.addEventListener('click', function () { setCase(i, true); });
    });
    // hovering a source tile picks its first case
    Object.keys(srcTiles).forEach(function (k) {
      srcTiles[k].addEventListener('pointerenter', function () {
        if (caseNow().src === k) return;
        for (var i = 0; i < CASES20.length; i++) if (CASES20[i].src === k) { setCase(i, true); break; }
      });
    });
    var raf = 0;
    function rebuild() { cancelAnimationFrame(raf); raf = requestAnimationFrame(build); }
    if (window.ResizeObserver) new ResizeObserver(rebuild).observe(root);
    window.addEventListener('resize', rebuild);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
    build();
    setCase(0);
    if (REDUCE) return;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        var v = es[0].isIntersecting;
        if (v && !visible) { visible = true; setCase(idx); requestAnimationFrame(frame); }
        visible = v;
      }, { rootMargin: '80px' }).observe(root);
    }
    requestAnimationFrame(frame);
  }

  function boot() {
    if (window.fillGlyphs) window.fillGlyphs();
    $all('[data-beam]').forEach(initBeam);
    $all('[data-orbit]').forEach(initOrbit);
    $all('[data-m3d]').forEach(initMarquee3d);
    $all('[data-orbit20]').forEach(initOrbit20);
    $all('[data-beam20]').forEach(initBeam20);
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
