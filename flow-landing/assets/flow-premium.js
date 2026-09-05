/* Shared premium behaviour for every page except the homepage, which carries
   its own richer version of the same ideas.

   Three things, all cheap: an ambient particle field, a reading-progress bar,
   and reveal-on-scroll. Everything degrades to "the page just sits there",
   never to a broken layout, and everything is skipped under reduced motion. */
(function () {
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------- reading progress */
  var bar = document.createElement('div');
  bar.className = 'p-progress';
  document.body.appendChild(bar);
  function progress() {
    var h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (h > 0 ? Math.min(100, (scrollY / h) * 100) : 0) + '%';
  }
  addEventListener('scroll', progress, { passive: true });
  addEventListener('resize', progress);
  progress();

  /* ------------------------------------------------------------- reveals */
  // Anything that reads as a block of content gets revealed. Selecting by role
  // rather than by hand-tagging each element keeps this working on all 40-odd
  // pages without touching their markup.
  var targets = document.querySelectorAll(
    'main .eyebrow, main h1.title, main .updated, main .lead, main article > p, main article > h2,' +
    'main article > ul, main article > ol, main article > blockquote, main article > table,' +
    'main .card, main .cta, main .note, main .readlist, main .stepcard, main .choicepanel,' +
    'main .specimen, main .installbox, main .formcard, main .faq details'
  );
  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('p-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });

    Array.prototype.forEach.call(targets, function (el, i) {
      el.classList.add('p-reveal');
      // Stagger only within a group of siblings, so a long article does not
      // accumulate a delay that leaves the last paragraph waiting a second.
      var sibs = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.setAttribute('data-d', String((sibs % 4) + 1));
      // Anything already on screen at load reveals immediately rather than
      // waiting for a scroll that may never come on a short page.
      if (el.getBoundingClientRect().top < innerHeight) {
        setTimeout(function () { el.classList.add('p-in'); }, 40 + (i % 6) * 55);
      } else {
        io.observe(el);
      }
    });
  }

  /* ------------------------------------------------- ambient particle net */
  // Some pages (trial.html) carry their own ambient canvas already. Two
  // full-viewport canvases on one page is the layer count the zoom fix exists
  // to avoid, so defer to whichever is already there.
  if (reduced || document.getElementById('bgcanvas')) return;
  var cv = document.createElement('canvas');
  cv.id = 'p-net';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var g = cv.getContext('2d');
  if (!g) return;

  // Capped backing store: a full-viewport canvas at a phone's native 3x is
  // ~12MB of GPU memory and the first layer dropped under pressure.
  var DPR = 1, W = 0, H = 0, pts = [], raf = null, NET = '52,104,230', NA = 0.42;

  function colors() {
    var cs = getComputedStyle(root);
    NET = (cs.getPropertyValue('--p-net') || NET).trim();
    NA = parseFloat(cs.getPropertyValue('--p-net-a')) || NA;
  }
  function size() {
    DPR = Math.min(devicePixelRatio || 1, 1.75);
    W = cv.width = Math.round(innerWidth * DPR);
    H = cv.height = Math.round(innerHeight * DPR);
  }
  function init() {
    size();
    var n = Math.min(48, Math.floor(innerWidth / 30));
    pts = [];
    for (var i = 0; i < n; i++) {
      pts.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.12 * DPR, vy: (Math.random() - 0.5) * 0.12 * DPR
      });
    }
  }
  function draw() {
    g.clearRect(0, 0, W, H);
    var R = 140 * DPR;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      for (var j = i + 1; j < pts.length; j++) {
        var q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          g.strokeStyle = 'rgba(' + NET + ',' + ((1 - Math.sqrt(d2) / R) * 0.16).toFixed(3) + ')';
          g.lineWidth = DPR;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(' + NET + ',' + NA + ')';
      g.beginPath(); g.arc(p.x, p.y, 1.2 * DPR, 0, 6.283); g.fill();
    }
    raf = requestAnimationFrame(draw);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  function start() { if (!raf) draw(); }

  colors(); init(); start();
  addEventListener('resize', function () { stop(); init(); start(); });
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  // The theme toggle swaps the palette tokens; the canvas has to follow.
  new MutationObserver(colors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();
