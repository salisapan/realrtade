// Polls the worker for W4 inbound rows and mounts the card on Gmail/Outlook. Personal WhatsApp Web (W1) is not read here.
(function () {
  if (globalThis.__glanceWaBusinessHost) return;
  globalThis.__glanceWaBusinessHost = true;

  const POLL_MS = 45000;

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (r) => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) { resolve({ ok: false }); return; }
          resolve(r || { ok: false });
        });
      } catch (e) { resolve({ ok: false }); }
    });
  }

  async function tick() {
    const cfg = await send({ type: 'flow:wa-business-config' });
    if (!cfg || cfg.buildEnabled !== true) return;
    const poll = await send({ type: 'flow:wa-business-poll' });
    if (!poll || !poll.ok || !Array.isArray(poll.items) || !poll.items.length) return;
    const card = globalThis.FlowWaBusinessCard;
    if (!card || typeof card.offer !== 'function') return;
    for (const item of poll.items) {
      const r = await card.offer(item);
      if (r && r.shown) break;
    }
  }

  setInterval(tick, POLL_MS);
  tick();
})();
