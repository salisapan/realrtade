/* Corner v23 — dress every step mark with the Wensity ring, then a check. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function dress(box) {
    if (!box || box.querySelector('.w-ring')) return;
    if (box.classList.contains('act-none') || box.classList.contains('act-lock')) return;
    var ring = document.createElement('span');
    ring.className = 'w-ring';
    ring.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 12; i++) {
      var line = document.createElement('i');
      line.style.setProperty('--i', String(i));
      ring.appendChild(line);
    }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'w-check');
    svg.setAttribute('viewBox', '0 0 18 18');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M5 9.2 L8 12.1 L13.2 6.2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    box.appendChild(ring);
    box.appendChild(svg);
  }
  function scan(root) {
    (root || document).querySelectorAll('.act-box').forEach(dress);
  }
  function boot() { scan(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  if (document.body) {
    new MutationObserver(function (records) {
      records.forEach(function (rec) {
        rec.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('act-box')) dress(node);
          if (node.querySelectorAll) node.querySelectorAll('.act-box').forEach(dress);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
