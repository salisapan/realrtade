// Parse a WhatsApp chat export or a pasted forwarded message for the share-intake lane.
// Portable: no chrome.*, no DOM, no network.
const FlowWhatsAppExportParse = (() => {
  const ATTACHMENT = /^(?:<attached:\s*.+>|<Media omitted>|image omitted|video omitted|audio omitted|sticker omitted|document omitted|GIF omitted|הקובץ מצורף|קובץ מצורף|\u200e?file attached)/i;
  const IOS_LINE = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*(.+?):\s([\s\S]*)$/;
  const AND_LINE = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})\s+-\s+(.+?):\s([\s\S]*)$/;
  const ME_EN = /^(?:you|me)$/i;
  const ME_HE = /^(?:אני|את\/ה)$/;

  function fresh(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function isMe(sender) {
    const s = fresh(sender);
    return ME_EN.test(s) || ME_HE.test(s);
  }

  function phoneFromHeader(text) {
    const blob = String(text || '').slice(0, 800);
    const m = blob.match(/(?:\+|00)?(?:972|0)(?:[\s\-().]*\d){8,12}/);
    if (!m) return null;
    const C = typeof FlowChannel !== 'undefined' ? FlowChannel : null;
    if (C && typeof C.normalizePhone === 'function') return C.normalizePhone(m[0]);
    let d = m[0].replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '972' + d.slice(1);
    return d.replace(/\D/g, '');
  }

  function parseLines(raw) {
    const lines = String(raw || '').replace(/\r/g, '').split('\n');
    const messages = [];
    let cur = null;
    for (const line of lines) {
      const ios = IOS_LINE.exec(line);
      const and = !ios && AND_LINE.exec(line);
      const hit = ios || and;
      if (hit) {
        if (cur) messages.push(cur);
        cur = {
          sender: fresh(hit[3]),
          text: String(hit[4] || ''),
          fromMe: isMe(hit[3])
        };
        continue;
      }
      if (cur && line.trim()) cur.text += '\n' + line;
    }
    if (cur) messages.push(cur);
    for (const m of messages) {
      m.text = m.text.trim();
      if (ATTACHMENT.test(m.text)) m.attachmentLine = true;
    }
    return messages;
  }

  function counterpartOf(messages) {
    const names = new Set();
    for (const m of messages) {
      if (!m.fromMe && m.sender) names.add(m.sender);
    }
    if (names.size > 1) return { group: true, name: null, phone: null };
    const name = names.size === 1 ? [...names][0] : null;
    return { group: false, name: name, phone: null };
  }

  function focusInbound(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.fromMe) continue;
      if (!m.text || m.attachmentLine) continue;
      if (m.text.length < 4) continue;
      return m;
    }
    return null;
  }

  function parse(raw) {
    const text = String(raw || '');
    if (!text.trim()) return { ok: false, reason: 'empty' };
    const messages = parseLines(text);
    if (!messages.length) {
      const phone = phoneFromHeader(text);
      const body = fresh(text);
      if (body.length < 8) return { ok: false, reason: 'too-short' };
      return {
        ok: true,
        format: 'forward',
        group: false,
        messages: [{ sender: null, text: body, fromMe: false }],
        counterpart: { name: null, phone: phone, group: false },
        focusInbound: { sender: null, text: body, fromMe: false }
      };
    }
    const counterpart = counterpartOf(messages);
    if (counterpart.group) return { ok: false, reason: 'group', messages };
    const phone = phoneFromHeader(text);
    const party = { name: counterpart.name, phone: phone, group: false };
    const focus = focusInbound(messages);
    if (!focus) return { ok: false, reason: 'no-inbound', messages, counterpart: party };
    return { ok: true, format: 'export', group: false, messages, counterpart: party, focusInbound: focus };
  }

  return { parse, parseLines, phoneFromHeader, isMe };
})();

if (typeof module !== 'undefined') module.exports = { FlowWhatsAppExportParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowWhatsAppExportParse = FlowWhatsAppExportParse;
