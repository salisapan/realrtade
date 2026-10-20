// Attaches the Microsoft Graph lane to the Outlook card that is already on
// the page. The card announces itself with glance:outlook-card. Until the
// one-line hook in content-outlook.lane-ms.patch is applied, seeing the card
// in the reading pane dispatches that same event on the card. This file does
// not edit the Outlook page script.
(() => {
  if (globalThis.__glanceOutlookLaneMs) return;
  globalThis.__glanceOutlookLaneMs = true;
  const EVENT = 'glance:outlook-card';

  function onCard(event) {
    const target = event && event.target;
    const host = (target && target.closest && target.closest('.flow-chip-host'))
      || document.querySelector('#ReadingPaneContainerId .flow-chip-host')
      || document.querySelector('.flow-chip-host');
    const page = globalThis.FlowLaneMsPage;
    if (!page || typeof page.attach !== 'function') {
      setTimeout(() => onCard(event), 50);
      return;
    }
    if (!page.attach(host)) setTimeout(() => onCard(event), 50);
  }

  document.addEventListener(EVENT, onCard, true);

  function announce(host) {
    if (!host || host.nodeType !== 1) return;
    if (host.getAttribute('data-glance-lane-announced') === '1') return;
    host.setAttribute('data-glance-lane-announced', '1');
    host.dispatchEvent(new CustomEvent(EVENT, { bubbles: true }));
  }

  function scan() {
    const nodes = document.querySelectorAll('.flow-chip-host');
    for (let i = 0; i < nodes.length; i++) announce(nodes[i]);
  }

  function arm() {
    scan();
    if (typeof MutationObserver !== 'function' || !document.documentElement) return;
    const obs = new MutationObserver(scan);
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
