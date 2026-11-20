/* Homepage hero: depth, float and shadow (r1), plus wow4 (2026-11-13):
   1 slogan entrance, 2 Do It moves the scene in depth, 3 system tiles behind the card,
   4 light that follows the pointer or the phone's tilt. Override only; product code untouched. */
(function(){
  var qs = new URLSearchParams(location.search);
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || qs.has("rm") || root.classList.contains("rm");
  var capture = qs.has("capture") || qs.has("still") || qs.has("fd-still");
  var hero = document.getElementById("hero");
  var desk = document.getElementById("desk");
  var win = document.getElementById("win");
  var addin = document.getElementById("addin");
  var h1 = document.getElementById("h1");
  if (!hero || !desk || !win || !addin) return;
  /* wow4c · 13/11 · Sali: 64px in-card ring (1.6x of 40) was too heavy next to the 16px title.
     Optical size now matches the two-line title block (~40-44px). Balance over size. */
  if (window.CONFIG && window.CONFIG.ring && !window.CONFIG.ring.__wow){
    window.CONFIG.ring.inCard = Math.round(window.CONFIG.ring.inCard * 1.1); /* 40 -> 44 */
    window.CONFIG.ring.__wow = 1;
  }
  /* wow4d · 13/11 15:06 · Sali: on desktop the Do It card must not cover the email.
     The product layout (index.html) places the card at winW - C.card.overlap; a negative overlap is a gap.
     Card now sits beside the window with a quiet gap, the pair stays centred. Phone layout ignores overlap. */
  if (window.CONFIG && window.CONFIG.card && !window.CONFIG.card.__wow){
    window.CONFIG.card.overlap = -Math.round(20 * (window.__Z || 1));
    window.CONFIG.card.__wow = 1;
    requestAnimationFrame(function(){ dispatchEvent(new Event("resize")); });
  }
  var still = reduce || capture;
  if (still) hero.classList.add("wow-static");

  function el(tag, cls, parent, before){
    var e = document.createElement(tag); e.className = cls;
    if (parent) parent.insertBefore(e, before || null);
    return e;
  }
  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }

  /* ---------- 1 · Slogan ---------- */
  var SPLIT = {
    "intent into action": 1,
    "\u05de\u05db\u05d5\u05d5\u05e0\u05d4 \u05dc\u05d1\u05d9\u05e6\u05d5\u05e2": 1,
    "von der absicht zur tat": 3,
    "de l\u2019intention \u00e0 l\u2019action": 2,
    "de l'intention \u00e0 l'action": 2,
    "de la intenci\u00f3n a la acci\u00f3n": 3
  };
  var building = false, lastText = "", introT0 = 0, introOn = false, INTRO_END = 2200;
  function splitText(t){
    var w = t.split(/\s+/), n = SPLIT[t.toLowerCase()];
    if (!n){
      if (w.length < 2) return [t, ""];
      var half = t.length / 2, acc = 0; n = 1;
      for (var i = 0; i < w.length - 1; i++){ acc += w[i].length + 1; if (acc >= half){ n = i + 1; break; } }
    }
    return [w.slice(0, n).join(" "), w.slice(n).join(" ")];
  }
  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
  function stamp(){
    if (!introOn) return;
    var t = performance.now() - introT0;
    if (t >= INTRO_END){ endIntro(); return; }
    h1.style.setProperty("--wow-el", Math.round(t) + "ms");
    h1.classList.add("wow-in");
  }
  function endIntro(){ introOn = false; h1.classList.remove("wow-in"); h1.style.removeProperty("--wow-el"); }
  function buildH1(){
    if (!h1 || building) return;
    if (h1.querySelector(".wow-a") && h1.textContent === lastText) return;
    var raw = (h1.textContent || "").replace(/\s+/g, " ").trim().replace(/[.\u3002]+$/, "");
    if (!raw) return;
    var parts = splitText(raw);
    building = true;
    h1.innerHTML = '<span class="wow-a">' + esc(parts[0]) + "</span>" +
      (parts[1] ? ' <span class="wow-b" data-t="' + esc(parts[1]) + '">' + esc(parts[1]) + "</span>" : "");
    lastText = h1.textContent;
    building = false;
    stamp();
  }
  if (h1){
    buildH1();
    new MutationObserver(function(){ if (!building) buildH1(); })
      .observe(h1, {childList:true, characterData:true, subtree:true});
    if (!still && scrollY < 40){
      var start = function(){
        introT0 = performance.now(); introOn = true; stamp();
        setTimeout(endIntro, INTRO_END + 40);
      };
      h1.classList.add("wow-pre");
      var go = function(){ h1.classList.remove("wow-pre"); requestAnimationFrame(start); };
      if (root.classList.contains("is-ready")) go();
      else {
        var mo0 = new MutationObserver(function(){
          if (root.classList.contains("is-ready")){ mo0.disconnect(); go(); }
        });
        mo0.observe(root, {attributes:true, attributeFilter:["class"]});
      }
    }
  }

  /* ---------- r1 · float + parallax wrappers (unchanged behaviour) ---------- */
  function wrap(node, parClass, floatClass){
    if (node.closest(".hero-wow-par")) return node.closest(".hero-wow-par");
    var par = document.createElement("div");
    par.className = "hero-wow-par " + parClass;
    var fl = document.createElement("div");
    fl.className = "hero-wow-float " + floatClass;
    node.parentNode.insertBefore(par, node);
    par.appendChild(fl);
    fl.appendChild(node);
    return par;
  }
  var winPar = wrap(win, "hero-wow-win-par wow-depth wow-win-depth", "hero-wow-win-float");
  var cardPar = wrap(addin, "hero-wow-card-par wow-depth wow-card-depth", "hero-wow-card-float");
  var winFloat = winPar.querySelector(".hero-wow-float");
  var cardFloat = cardPar.querySelector(".hero-wow-float");

  if (reduce) return; /* reduced motion keeps the static r1 hero; only the slogan colour applies */

  /* ---------- 2 + 4 · shadow plates, veil, room light ---------- */
  var IN = 14;
  var winPlate = el("div", "wow-plate wow-plate-win", winFloat, win);
  var winSh = el("i", "wow-sh", winPlate);
  var cardPlate = el("div", "wow-plate wow-plate-card", cardFloat, addin);
  var cardSh = el("i", "wow-sh", cardPlate);
  var cardDeep = el("i", "wow-deep", cardPlate);
  var sys = el("div", "wow-sys", cardFloat, cardPlate); /* behind the card shadow, so the card casts onto the tiles */
  var veil = el("span", "wow-veil", win);
  veil.setAttribute("aria-hidden", "true");
  var room = el("div", "wow-room", desk, desk.firstChild);
  room.setAttribute("aria-hidden", "true");
  hero.classList.add("wow-plates");

  var geo = { ww:0, wh:0, wl:0, wt:0, wox:.5, woy:1, cw:0, ch:0, cox:0, coy:0 };
  function readGeo(){
    geo.ww = win.offsetWidth; geo.wh = win.offsetHeight; geo.wl = win.offsetLeft; geo.wt = win.offsetTop;
    var o = getComputedStyle(win).transformOrigin.split(" ");
    geo.wox = geo.ww ? parseFloat(o[0]) / geo.ww : .5; geo.woy = geo.wh ? parseFloat(o[1]) / geo.wh : 1;
    geo.cw = addin.offsetWidth; geo.ch = addin.offsetHeight;
    var c = getComputedStyle(addin).transformOrigin.split(" ");
    geo.cox = parseFloat(c[0]) || 0; geo.coy = parseFloat(c[1]) || 0;
    geo.br = parseFloat(getComputedStyle(win).borderTopLeftRadius) || 0;
    geo.cbr = parseFloat(getComputedStyle(addin).borderTopLeftRadius) || 0;
  }
  function syncWin(){
    var s = winPlate.style, h = parseFloat(win.style.height) || geo.wh;
    s.left = (geo.wl + IN) + "px"; s.top = (geo.wt + IN) + "px";
    s.width = Math.max(0, geo.ww - 2 * IN) + "px"; s.height = Math.max(0, h - 2 * IN) + "px";
    s.borderRadius = Math.max(0, geo.br - IN) + "px";
    s.transformOrigin = (geo.wox * geo.ww - IN) + "px " + (geo.woy * h - IN) + "px";
    s.transform = win.style.transform; s.opacity = win.style.opacity;
    if (sysHost === "win"){
      var y = sys.style;
      y.left = geo.wl + "px"; y.top = geo.wt + "px"; y.width = geo.ww + "px"; y.height = h + "px";
      y.transformOrigin = (geo.wox * geo.ww) + "px " + (geo.woy * h) + "px";
      y.transform = win.style.transform; y.opacity = win.style.opacity;
    }
  }
  var sysHost = "card";
  function setHost(h){
    if (h === sysHost) return;
    sysHost = h;
    if (h === "win") winFloat.insertBefore(sys, winPlate); else cardFloat.insertBefore(sys, cardPlate);
    sys.style.left = sys.style.top = "0px";
    syncWin(); syncCard();
  }
  function shiftClip(cp, dx){
    var m = /circle\(([\d.]+)px at ([\d.-]+)px ([\d.-]+)px\)/.exec(cp || "");
    return m ? "circle(" + m[1] + "px at " + (m[2] - dx) + "px " + (m[3] - dx) + "px)" : "";
  }
  function syncCard(){
    var h = parseFloat(addin.style.height) || geo.ch, s = cardPlate.style, t = addin.style.transform, o = addin.style.opacity;
    s.left = IN + "px"; s.top = IN + "px";
    s.width = Math.max(0, geo.cw - 2 * IN) + "px"; s.height = Math.max(0, h - 2 * IN) + "px";
    s.borderRadius = Math.max(0, geo.cbr - IN) + "px";
    s.transformOrigin = (geo.cox - IN) + "px " + (geo.coy - IN) + "px";
    s.transform = t; s.opacity = o; s.clipPath = shiftClip(addin.style.clipPath, IN);
    if (Math.abs(h - layH) > 4 && tiles && tiles.length && sysHost === "card"){ layH = h; layoutTiles(); }
    if (sysHost !== "card"){ cardH = h; return; }
    var y = sys.style;
    y.width = geo.cw + "px"; y.height = h + "px"; y.transformOrigin = geo.cox + "px " + geo.coy + "px";
    y.transform = t; y.opacity = addin.style.clipPath ? "0" : o;
    cardH = h;
  }
  var cardH = 0, layH = 0;
  readGeo();
  var moW = new MutationObserver(syncWin), moC = new MutationObserver(syncCard);
  moW.observe(win, {attributes:true, attributeFilter:["style"]});
  moC.observe(addin, {attributes:true, attributeFilter:["style"]});
  if ("ResizeObserver" in window){
    var ro = new ResizeObserver(function(){ readGeo(); syncWin(); syncCard(); layoutTiles(); });
    ro.observe(win); ro.observe(addin); ro.observe(hero);
  }
  addEventListener("resize", function(){ readGeo(); syncWin(); syncCard(); layoutTiles(); });
  syncWin(); syncCard();

  /* ---------- 3 · system tiles ---------- */
  var tiles = [], stepsEl = document.getElementById("steps");
  var FLOAT = [[7.2,-1.1],[8.4,-3.6],[7.8,-5.2],[9.1,-2.4],[8.0,-6.3]];
  var USE_TILES = false; /* Sali 13/11: no separate tile strip; each step's own logo lifts in the card */
  function buildTiles(){
    sys.textContent = ""; tiles = [];
    if (!stepsEl || !USE_TILES) return;
    stepsEl.querySelectorAll("li").forEach(function(li, i){
      var img = li.querySelector(".lg img");
      if (!img) return;
      var t = el("div", "wow-tile", sys), f = el("div", "wow-tf", t);
      el("span", "wow-tsh", f);
      var face = el("span", "wow-tface", f);
      var im = document.createElement("img");
      im.src = img.getAttribute("src"); im.alt = ""; im.decoding = "async";
      if (img.style.filter) im.style.filter = img.style.filter;
      face.appendChild(im);
      if (/\bwide\b/.test(img.className)) t.classList.add("wide");
      if (/\bapp\b/.test(img.className)) t.classList.add("app");
      t.setAttribute("aria-hidden", "true");
      var fl = FLOAT[i % FLOAT.length];
      t.style.setProperty("--fd", fl[0] + "s"); t.style.setProperty("--fo", fl[1] + "s");
      tiles.push({ el:t, li:li, sh:t.querySelector(".wow-tsh") });
    });
    layoutTiles(); syncTiles();
  }
  function layoutTiles(){
    if (!tiles.length) return;
    var W = innerWidth, cr = addin.getBoundingClientRect(), wr = win.getBoundingClientRect();
    var k = geo.cw ? cr.width / geo.cw : 1;
    var cardLeft = cr.left, cardRight = cr.left + geo.cw * k;
    var outerRight = (cr.left + cr.width / 2) >= (wr.left + wr.width / 2);
    var phone = W < 761 || cr.width > W * .8;
    var ts, room = outerRight ? W - cardRight : cardLeft;
    if (!phone){
      ts = Math.round(clamp(geo.cw * .18, 50, 62));
      var tuck = .2, out = ts * (1 - tuck) + ts * .5;
      if (room < out + 12){ tuck = clamp(1 - (room - 12 - ts * .5) / ts, .2, .7); out = ts * (1 - tuck) + ts * .5; }
      if (room < out + 12) phone = true;
    }
    var ar = addin.getBoundingClientRect();
    setHost(phone ? "win" : "card");
    if (phone){
      ts = Math.round(clamp(geo.ww * .1, 34, 44));
      var gap = Math.round(ts * .3), total = tiles.length * ts + (tiles.length - 1) * gap;
      var x0 = (geo.ww - total) / 2;
      tiles.forEach(function(t, i){
        var x = root.dir === "rtl" ? geo.ww - x0 - ts - i * (ts + gap) : x0 + i * (ts + gap);
        var y = -ts * .74;
        t.el.style.setProperty("--ts", ts + "px");
        t.el.style.setProperty("--tx", x.toFixed(1) + "px");
        t.el.style.setProperty("--ty", y.toFixed(1) + "px");
        t.el.style.setProperty("--tk", "1");
        t.el.style.setProperty("--rise", Math.round(ts * .55) + "px");
        t.el.style.zIndex = "";
      });
      return;
    }
    var hc = parseFloat(addin.style.height) || addin.offsetHeight, n = tiles.length, top = hc * .22, span = hc * .6;
    tiles.forEach(function(t, i){
      var s2 = ts;
      var zig = 0;
      var x = outerRight ? geo.cw - ts * tuck + zig : -ts * (1 - tuck) - zig - (s2 - ts);
      var y = top + (n > 1 ? i * span / (n - 1) : 0) - s2 / 2;
      t.el.style.setProperty("--ts", Math.round(s2) + "px");
      t.el.style.setProperty("--tx", x.toFixed(1) + "px");
      t.el.style.setProperty("--ty", y.toFixed(1) + "px");
      t.el.style.setProperty("--tk", "1");
      t.el.style.setProperty("--rise", "24px");
      t.el.style.zIndex = "";
    });
  }
  var tilesLaid = false;
  function syncTiles(){
    var any = false;
    tiles.forEach(function(t){
      var on = t.li.classList.contains("is-done");
      if (on && !t.el.classList.contains("on") && !tilesLaid){ layoutTiles(); tilesLaid = true; }
      t.el.classList.toggle("on", on); any = any || on;
    });
    if (!any) tilesLaid = false;
  }
  var doneSeen = new WeakMap();
  function liftLogos(){
    if (!stepsEl) return;
    stepsEl.querySelectorAll("li").forEach(function(li){
      var d = li.classList.contains("is-done"), was = doneSeen.get(li) || false;
      if (d && !was && !still){
        li.classList.remove("wow-lift"); void li.offsetWidth; li.classList.add("wow-lift");
      } else if (!d && was) li.classList.remove("wow-lift");
      doneSeen.set(li, d);
    });
  }
  if (stepsEl){
    stepsEl.addEventListener("animationend", function(e){
      if (e.animationName === "wow-lg-lift"){ var li = e.target.closest("li"); if (li) li.classList.remove("wow-lift"); }
    });
    new MutationObserver(function(list){
      var rebuilt = list.some(function(m){ return m.type === "childList" && m.target === stepsEl; });
      liftLogos();
      if (rebuilt) buildTiles(); else syncTiles();
    }).observe(stepsEl, {childList:true, subtree:true, attributes:true, attributeFilter:["class"]});
    buildTiles();
  }

  /* ---------- 2 · Do It moves the scene ---------- */
  var T = (window.CONFIG && window.CONFIG.t) || {doit:[.774,.808], propose:[.708,.765]};
  var PRESS = T.doit[0] + .004, acted = false;
  function originOf(node, par){
    var r = node.getBoundingClientRect(), p = par.getBoundingClientRect();
    return (r.left - p.left + r.width / 2).toFixed(1) + "px " + (r.top - p.top + r.height / 2).toFixed(1) + "px";
  }
  function setActed(on){
    if (on === acted) return;
    acted = on;
    if (on){
      winPar.style.transformOrigin = originOf(win, winPar);
      cardPar.style.transformOrigin = originOf(addin, cardPar);
      var dr = desk.getBoundingClientRect(), cr = addin.getBoundingClientRect();
      room.style.setProperty("--wow-cx", (((cr.left + cr.width / 2 - dr.left) + dr.width * .1) / (dr.width * 1.2) * 100).toFixed(1) + "%");
      room.style.setProperty("--wow-cy", (((cr.top + cr.height / 2 - dr.top) + dr.height * .1) / (dr.height * 1.2) * 100).toFixed(1) + "%");
    }
    hero.classList.toggle("wow-acted", on);
  }
  function progress(){ var f = window.__flow; return f && typeof f.P === "number" ? f.P : 0; }

  /* Undo: scrub the scene back to the moment before Do It, so every step reverts in place */
  addin.addEventListener("click", function(e){
    var a = e.target.closest && e.target.closest('[data-k="card.undo"]');
    if (!a || !window.ScrollTrigger) return;
    var st = ScrollTrigger.getAll().filter(function(s){ return s.trigger === hero; })[0];
    if (!st) return;
    var y = st.start + (st.end - st.start) * (T.propose[1] + .003);
    if (window.__lenis) window.__lenis.scrollTo(y, {duration:1.8}); else scrollTo({top:y, behavior:"smooth"});
  });
  var undoA = addin.querySelector('[data-k="card.undo"]');
  if (undoA){ undoA.classList.add("wow-undo"); undoA.setAttribute("role", "button"); undoA.setAttribute("tabindex", "0");
    undoA.addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " "){ e.preventDefault(); undoA.click(); } }); }

  /* ---------- 4 · light ---------- */
  var hover = matchMedia("(hover:hover) and (pointer:fine)").matches;
  var lx = 0, ly = 0, sx = 0, sy = 0, tiltOn = false, beta0 = null;
  function applyLight(){
    var x = sx, y = sy;
    winSh.style.translate = (x * 11).toFixed(2) + "px " + (y * 8).toFixed(2) + "px";
    var c = (x * 13).toFixed(2) + "px " + (y * 10).toFixed(2) + "px";
    cardSh.style.translate = c; cardDeep.style.translate = c;
    var tt = (x * 6).toFixed(2) + "px " + (y * 5).toFixed(2) + "px";
    for (var i = 0; i < tiles.length; i++) tiles[i].sh.style.translate = tt;
  }
  if (hover){
    hero.addEventListener("pointermove", function(e){
      var r = hero.getBoundingClientRect(), vh = innerHeight;
      lx = -clamp(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -1, 1);
      ly = -clamp((e.clientY / Math.max(1, vh)) * 2 - 1, -1, 1);
    }, {passive:true});
    hero.addEventListener("pointerleave", function(){ lx = 0; ly = 0; }, {passive:true});
  } else {
    addEventListener("deviceorientation", function(e){
      if (e.gamma == null || e.beta == null) return;
      if (beta0 === null) beta0 = e.beta;
      tiltOn = true;
      lx = clamp(e.gamma / 22, -1, 1);
      ly = clamp((e.beta - beta0) / 22, -1, 1);
    }, {passive:true});
  }

  /* ---------- r1 parallax + one loop for everything, only while the hero is on screen ---------- */
  var live = false, raf = 0, ioOn = false;
  var px = 0, py = 0, tx = 0, ty = 0;
  function setLive(on){
    live = !!on && !capture;
    winFloat.classList.toggle("is-live", live);
    cardFloat.classList.toggle("is-live", live);
    hero.classList.toggle("wow-live", live);
    if (!live){ winPar.style.transform = ""; cardPar.style.transform = ""; }
    if ((live || capture) && !raf) raf = requestAnimationFrame(loop);
  }
  function loop(){
    raf = 0;
    if (!live && !capture) return;
    var P = progress();
    setActed(P >= PRESS);
    if (capture){ raf = requestAnimationFrame(loop); return; }
    if (!hover){
      if (!tiltOn){ lx = 0; ly = clamp(.6 - P * 1.2, -.6, .6); }
      var r = hero.getBoundingClientRect(), mid = r.top + r.height / 2;
      ty = clamp((innerHeight / 2 - mid) / Math.max(innerHeight, 1) * .7, -1, 1); tx = 0;
    } else { tx = -lx; ty = -ly; }
    px += (tx - px) * .12; py += (ty - py) * .12;
    winPar.style.transform = "translate3d(" + (px * 6).toFixed(2) + "px," + (py * 6).toFixed(2) + "px,0)";
    cardPar.style.transform = "translate3d(" + (px * 12).toFixed(2) + "px," + (py * 12).toFixed(2) + "px,0)";
    var nx = sx + (lx - sx) * .08, ny = sy + (ly - sy) * .08;
    if (Math.abs(nx - sx) > .0005 || Math.abs(ny - sy) > .0005){ sx = nx; sy = ny; applyLight(); }
    raf = requestAnimationFrame(loop);
  }
  if (capture){ setLive(false); raf = requestAnimationFrame(loop); return; }
  if ("IntersectionObserver" in window){
    new IntersectionObserver(function(entries){
      ioOn = entries.some(function(en){ return en.isIntersecting; });
      setLive(ioOn && !document.hidden);
    }, {threshold:0.01}).observe(hero);
  } else { ioOn = true; setLive(true); }
  document.addEventListener("visibilitychange", function(){ setLive(ioOn && !document.hidden); });
})();
