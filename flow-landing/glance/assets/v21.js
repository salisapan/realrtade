/* Corner v21 — small page behaviours: WhatsApp Web icons · A-day carousel (snap + arrows + dots). */
(function () {
  'use strict';
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  /* WhatsApp Web icon set (simple, accurate paths · no emoji-as-icons) */
  var WA = {
    search: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.9 14.3h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/></svg>',
    newchat: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975zm3-4H7.041V7.1h9.975z"/></svg>',
    video: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.27 4.5h11.46c.7 0 1.27.57 1.27 1.27v3.17l4.4-3.04c.52-.36 1.1-.08 1.1.56v11.08c0 .64-.58.92-1.1.56L16 15.06v3.17c0 .7-.57 1.27-1.27 1.27H3.27C2.57 19.5 2 18.93 2 18.23V5.77c0-.7.57-1.27 1.27-1.27z"/></svg>',
    emoji: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159zm3.108-9.751c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 11.1h-7.1V4h-1.8v7.1H4v1.8h7.1V20h1.8v-7.1H20z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885z"/></svg>',
    dbl: '<svg viewBox="0 0 16 11"><path fill="currentColor" d="M11.07.65a.46.46 0 0 0-.3-.1.49.49 0 0 0-.39.18L4.2 8.37 1.79 6.1a.46.46 0 0 0-.34-.15.47.47 0 0 0-.34.15l-.31.31a.45.45 0 0 0-.14.34c0 .13.05.25.14.34l3 3c.13.13.31.2.5.2a.7.7 0 0 0 .55-.27l6.64-8.42a.5.5 0 0 0 .11-.3.44.44 0 0 0-.19-.37zm4 0a.46.46 0 0 0-.3-.1.49.49 0 0 0-.39.18L8.2 8.37l-.75-.71-.63.8 1.07 1.06c.13.13.31.2.5.2a.7.7 0 0 0 .55-.27l6.64-8.42a.5.5 0 0 0 .11-.3.44.44 0 0 0-.19-.37z"/></svg>'
  };
  $all('[data-wa]').forEach(function (el) { if (!el.firstChild) el.innerHTML = WA[el.getAttribute('data-wa')] || ''; });
  var AV = '<svg viewBox="0 0 212 212"><path fill="currentColor" class="wa-av-bg" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"/><path class="wa-av-fg" d="M173.6 180.6c-6.8-25.6-26.5-40.6-46.9-45.4 12.3-7.3 20.6-20.8 20.6-36.2 0-23.3-18.9-42.2-42.2-42.2S62.9 75.7 62.9 99c0 15.4 8.3 28.8 20.5 36.2-20.4 4.8-40.1 19.8-46.9 45.4A105.6 105.6 0 0 0 106 212c26.6 0 50.9-9.8 67.6-31.4z"/></svg>';
  var GRP = '<svg viewBox="0 0 212 212"><path fill="currentColor" class="wa-av-bg" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"/><path class="wa-av-fg" d="M102.4 148.5c-24.6 0-46.3 12.3-55.7 30.4A105.6 105.6 0 0 0 106 212c22.4 0 43.2-7 60.3-18.9-9.2-26.7-36.2-44.6-63.9-44.6zm-1-14.6c17.3 0 31.3-14 31.3-31.3s-14-31.3-31.3-31.3-31.3 14-31.3 31.3 14 31.3 31.3 31.3zm60.5 7.4c12.8 0 23.1-10.3 23.1-23.1s-10.3-23.1-23.1-23.1-23.1 10.3-23.1 23.1 10.3 23.1 23.1 23.1zm3.6 7.9c-7.5 0-14.5 1.9-20.4 5.1 13.2 9.2 22.7 22.6 26.7 38.1A106 106 0 0 0 206 145c-9.6-3.2-24.7-3.2-40.5 4.2z"/></svg>';
  $all('.wa21-av').forEach(function (el) { if (!el.firstChild) el.innerHTML = el.classList.contains('wa21-av-grp') ? GRP : AV; });

  /* A day with Glance — snap carousel */
  var track = document.getElementById('day-track');
  if (track) {
    var cards = $all('.day21-card', track), dots = $all('.day21-dots i');
    function step() { var c = cards[0]; return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || 20) : 320; }
    function idx() { var r = track.getBoundingClientRect(), rtl = getComputedStyle(track).direction === 'rtl', pad = parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0, best = 0, bd = 1e9; cards.forEach(function (c, i) { var cr = c.getBoundingClientRect(); var d = rtl ? Math.abs(r.right - cr.right - pad) : Math.abs(cr.left - r.left - pad); if (d < bd) { bd = d; best = i; } }); return best; }
    function sync() {
      var i = idx(); dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      var rtl = getComputedStyle(track).direction === 'rtl';
      var max = track.scrollWidth - track.clientWidth, x = Math.abs(track.scrollLeft);
      $all('.day21-arrow').forEach(function (b) { var dir = +b.getAttribute('data-dir'); b.disabled = dir < 0 ? x < 4 : x > max - 4; });
      track.setAttribute('data-index', String(i));
    }
    $all('.day21-arrow').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = +b.getAttribute('data-dir'); var rtl = getComputedStyle(track).direction === 'rtl';
        track.scrollBy({ left: dir * step() * (rtl ? -1 : 1), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }
})();
