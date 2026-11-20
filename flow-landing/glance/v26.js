/* Corner v26 — fold the hero list, press every Do It, fade the ask row. */
(function () {
  'use strict';
  var LANG = (document.documentElement.lang || '').slice(0, 2) || 'en';
  var HE = LANG === 'he';
  var I18 = window.GLANCE_I18N || {};
  var reduceQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceQ && reduceQ.matches); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function labelMore(list) {
    var btn = $('.act-more-btn', list);
    if (!btn) return;
    var n = list.querySelectorAll('.act.is-extra').length;
    var open = list.classList.contains('is-open');
          btn.textContent = open ? ((I18.STR && I18.STR[LANG] && I18.STR[LANG].showLess) || (HE ? 'הצג פחות' : 'Show less')) : ((I18.STR && I18.STR[LANG] && I18.STR[LANG].more) ? I18.STR[LANG].more(n) : (HE ? '+' + n + ' נוספים' : '+' + n + ' more'));
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function fold(list) {
    if (!list || list.dataset.folding === '1') return;
    list.dataset.folding = '1';
    var acts = $all(':scope > li.act:not(.act-close):not(.act-more)', list);
    acts.forEach(function (li, i) { li.classList.toggle('is-extra', i >= 4); });
    var extra = Math.max(0, acts.length - 4);
    var more = $('.act-more', list);
    if (!extra) {
      if (more) more.remove();
      delete list.dataset.folding;
      return;
    }
    if (!more) {
      more = document.createElement('li');
      more.className = 'act-more';
      more.innerHTML = '<button type="button" class="act-more-btn"></button>';
      var close = $('.act-close', list);
      list.insertBefore(more, close);
      $('.act-more-btn', more).addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        list.classList.toggle('is-open');
        labelMore(list);
      });
    }
    labelMore(list);
    delete list.dataset.folding;
  }

  function watchSteps() {
    var list = document.getElementById('live-acts');
    if (!list) return;
    fold(list);
    new MutationObserver(function () { fold(list); }).observe(list, { childList: true });
  }

  function ringOf(btn) {
    var root = btn.closest('.glance-surface, .pillar, .h21-card') || btn.parentElement;
    return root ? root.querySelector('.living-ico') : null;
  }

  function ensureTick(icon) {
    var host = icon.parentElement;
    if (!host.classList.contains('v26-ring')) {
      host = document.createElement('span');
      host.className = 'v26-ring';
      icon.parentElement.insertBefore(host, icon);
      host.appendChild(icon);
    }
    var tick = host.querySelector('.v26-tick');
    if (!tick) {
      tick = document.createElement('span');
      tick.className = 'v26-tick';
      tick.setAttribute('aria-hidden', 'true');
      tick.innerHTML = TICK;
      host.appendChild(tick);
    }
    return tick;
  }

  function morph(icon) {
    if (!icon || reduced()) return;
    var now = performance.now();
    if (icon._morphAt && now - icon._morphAt < 680) return;
    icon._morphAt = now;
    var tick = ensureTick(icon);
    icon.classList.remove('is-morph');
    tick.classList.remove('is-on');
    void icon.offsetWidth;
    icon.classList.add('is-morph');
    tick.classList.add('is-on');
    window.setTimeout(function () {
      icon.classList.remove('is-morph');
      tick.classList.remove('is-on');
    }, 740);
  }

  function bindPress(btn) {
    if (btn.dataset.v26) return;
    btn.dataset.v26 = '1';
    var downAt = 0;
    function down() { downAt = performance.now(); btn.classList.add('v26-down'); }
    function up() {
      var wait = Math.max(0, 120 - (performance.now() - downAt));
      window.setTimeout(function () {
        btn.classList.remove('v26-down');
        morph(ringOf(btn));
      }, wait);
    }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', function () { btn.classList.remove('v26-down'); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') down();
    });
    btn.addEventListener('keyup', function (e) {
      if (e.key === 'Enter' || e.key === ' ') up();
    });
    new MutationObserver(function () {
      if (btn.classList.contains('is-pressing')) morph(ringOf(btn));
    }).observe(btn, { attributes: true, attributeFilter: ['class'] });
  }

  function bindDoIts() {
    $all('.do-halo, .pillar-chip .chip-do, .pillar-chip .doit-dark').forEach(bindPress);
  }

  function fadeRow() {
    var track = document.getElementById('day-track');
    if (!track) return;
    function sync() {
      var max = track.scrollWidth - track.clientWidth;
      var x = Math.abs(track.scrollLeft);
      track.classList.toggle('can-prev', x > 6);
      track.classList.toggle('can-next', max > 6 && x < max - 6);
    }
    track.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  function boot() {
    watchSteps();
    bindDoIts();
    fadeRow();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
