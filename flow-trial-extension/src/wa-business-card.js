// Floating Do It for W4 inbound business messages. Draft-only: never calls Meta send APIs.
const FlowWaBusinessCard = (() => {
  const CHAIN = 'wa-business';
  let mounted = null;

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

  async function switchOn() {
    const bag = await chrome.storage.local.get({ glanceSwitches: {}, waBusinessUserKill: false });
    const cfg = await send({ type: 'flow:wa-business-config' });
    const lane = typeof FlowWaBusinessLane !== 'undefined' ? FlowWaBusinessLane : null;
    if (!lane || !lane.buildEnabled) return false;
    return lane.buildEnabled(
      bag.glanceSwitches,
      cfg && cfg.buildEnabled === true,
      bag.waBusinessUserKill === true,
      cfg && cfg.globalKill === true,
    );
  }

  function mountNode() {
    if (mounted && mounted.parentNode) return mounted;
    const node = document.createElement('div');
    node.id = 'glance-wa-business-card';
    node.setAttribute('data-glance-chain', CHAIN);
    node.style.cssText = 'position:fixed;right:20px;bottom:180px;z-index:2147482999;width:min(360px,calc(100vw - 40px));';
    (document.body || document.documentElement).appendChild(node);
    mounted = node;
    return node;
  }

  function render(host, item, judged) {
    const he = /[֐-׿]/.test(judged.text || '');
    const title = he ? 'טיוטת WhatsApp Business' : 'WhatsApp Business draft';
    const name = item.contact_name || item.from_wa_id || '';
    host.replaceChildren();
    const card = document.createElement('div');
    card.className = 'flow-chip-host';
    const head = document.createElement('div');
    head.className = 'flow-chip';
    head.textContent = title + (name ? ' · ' + name : '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flow-chip-do';
    btn.textContent = he ? 'עשה' : 'Do It';
    const note = document.createElement('p');
    note.style.margin = '8px 0 0';
    note.style.fontSize = '13px';
    note.textContent = he
      ? 'מכין טיוטה לבדיקה. Glance לא שולח הודעות WhatsApp.'
      : 'Prepares a draft for you to review. Glance does not send WhatsApp messages.';
    card.appendChild(head);
    card.appendChild(btn);
    card.appendChild(note);
    host.appendChild(card);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const lane = typeof FlowWaBusinessLane !== 'undefined' ? FlowWaBusinessLane : null;
      const body = lane && lane.draftBodyFromJudged ? lane.draftBodyFromJudged(judged, item) : '';
      const r = await send({ type: 'flow:wa-business-save-draft', inboundId: item.id, draftBody: body });
      if (r && r.ok && r.fetchedBack) {
        head.textContent = he ? 'טיוטה נשמרה' : 'Draft saved';
      } else {
        head.textContent = he ? 'לא נשמר' : 'Could not save';
      }
    });
  }

  async function offer(item) {
    if (!(await switchOn())) return { shown: false };
    const lane = typeof FlowWaBusinessLane !== 'undefined' ? FlowWaBusinessLane : null;
    if (!lane) return { shown: false };
    const judged = lane.judgeInbound(item);
    if (!judged.show) return { shown: false, reason: judged.reason };
    render(mountNode(), item, judged);
    return { shown: true };
  }

  return { offer, CHAIN };
})();
globalThis.FlowWaBusinessCard = FlowWaBusinessCard;
