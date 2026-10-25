// Meta WhatsApp Cloud API webhook helpers. Plain JS so Node corpus tests and Deno edge share one file.
// No network calls. No Meta endpoints.

const SIGNATURE_PREFIX = 'sha256=';

function timingSafeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let out = 0;
  for (let i = 0; i < sa.length; i++) out |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return out === 0;
}

/** @param {string} rawBody @param {string|null} header @param {string} appSecret @param {(alg:string,data:Uint8Array|ArrayBuffer,key:Uint8Array)=>Promise<ArrayBuffer>|ArrayBuffer} hmacSha256 */
async function verifyHubSignature(rawBody, header, appSecret, hmacSha256) {
  if (!header || !appSecret) return false;
  const h = String(header).trim();
  if (!h.toLowerCase().startsWith(SIGNATURE_PREFIX)) return false;
  const digestHex = h.slice(SIGNATURE_PREFIX.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digestHex)) return false;
  const enc = new TextEncoder();
  const mac = await hmacSha256('SHA-256', enc.encode(rawBody), enc.encode(appSecret));
  const bytes = mac instanceof ArrayBuffer ? new Uint8Array(mac) : new Uint8Array(mac.buffer || mac);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return timingSafeEqual(hex, digestHex);
}

function nodeHmacSha256(alg, data, key) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(data).digest();
}

function parseInboundMessages(payload) {
  const out = [];
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return out;
  for (const entry of payload.entry) {
    const changes = entry && entry.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || change.field !== 'messages') continue;
      const value = change.value || {};
      const phoneNumberId = value.metadata && value.metadata.phone_number_id;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactName = contacts[0] && contacts[0].profile && contacts[0].profile.name;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const m of messages) {
        if (!m || !m.id) continue;
        const row = {
          wamid: String(m.id),
          phoneNumberId: phoneNumberId ? String(phoneNumberId) : '',
          fromWaId: m.from ? String(m.from) : '',
          contactName: contactName ? String(contactName) : '',
          messageType: String(m.type || 'unknown'),
          timestamp: m.timestamp ? String(m.timestamp) : '',
          textBody: '',
          caption: '',
          mimeType: '',
          mediaSha256: '',
          mediaId: '',
          filename: '',
        };
        if (m.type === 'text' && m.text && m.text.body) row.textBody = String(m.text.body);
        if (m.type === 'image') {
          if (m.image) {
            row.caption = m.image.caption ? String(m.image.caption) : '';
            row.mimeType = m.image.mime_type ? String(m.image.mime_type) : 'image/jpeg';
            row.mediaSha256 = m.image.sha256 ? String(m.image.sha256) : '';
            row.mediaId = m.image.id ? String(m.image.id) : '';
          }
        }
        if (m.type === 'document') {
          if (m.document) {
            row.caption = m.document.caption ? String(m.document.caption) : '';
            row.mimeType = m.document.mime_type ? String(m.document.mime_type) : 'application/octet-stream';
            row.mediaSha256 = m.document.sha256 ? String(m.document.sha256) : '';
            row.mediaId = m.document.id ? String(m.document.id) : '';
            row.filename = m.document.filename ? String(m.document.filename) : '';
          }
        }
        out.push(row);
      }
    }
  }
  return out;
}

/**
 * Idempotent insert into an abstract store (tests) or SQL layer (edge).
 * @returns {{ inserted: number, duplicates: number, rows: object[] }}
 */
function storeInboundMessages(rows, store, opts) {
  const options = opts || {};
  const killed = options.globalKill === true;
  if (killed) return { inserted: 0, duplicates: 0, rows: [], killed: true };
  let inserted = 0;
  let duplicates = 0;
  const saved = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.wamid) continue;
    if (store.has(row.wamid)) {
      duplicates += 1;
      continue;
    }
    store.add(row);
    inserted += 1;
    saved.push(row);
  }
  return { inserted, duplicates, rows: saved, killed: false };
}

function verifyTokenHandshake(query, expectedToken) {
  const mode = query.get('hub.mode');
  const token = query.get('hub.verify_token');
  const challenge = query.get('hub.challenge');
  if (mode !== 'subscribe' || !challenge || !expectedToken) return { ok: false };
  if (token !== expectedToken) return { ok: false, forbidden: true };
  return { ok: true, challenge };
}

if (typeof module !== 'undefined') {
  module.exports = {
    verifyHubSignature,
    nodeHmacSha256,
    parseInboundMessages,
    storeInboundMessages,
    verifyTokenHandshake,
    SIGNATURE_PREFIX,
  };
}
