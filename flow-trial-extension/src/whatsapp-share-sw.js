// Service-worker helpers for WhatsApp share intake (W2). Classic globals via side-effect imports.
import '../core/domains.js';
import '../core/day-words.js';
import '../core/extract.js';
import '../core/judgment.js';
import '../core/google-closes.js';
import '../core/close-families.js';
import '../core/fact-reply.js';
import '../core/file-attach.js';
import '../core/intent.js';
import '../core/actions.js';
import '../core/resolution.js';
import '../core/incoming-judge.js';
import '../core/channel.js';
import '../core/whatsapp-export-parse.js';
import '../core/wa-me-link.js';
import '../core/whatsapp-share-intake.js';
import '../core/draft-reply.js';
import '../lane-chat/chat-kill-switch.js';
import '../lane-chat/chat-redact.js';

const CONSENT_KEY = 'whatsappShareModelConsentAt';

async function shareKillBlocked() {
  const K = globalThis.FlowChatKillSwitch;
  if (!K || typeof K.blocked !== 'function') return { blocked: true, reason: 'not-configured' };
  return K.blocked();
}

export async function whatsappShareIntake(payload) {
  const kill = await shareKillBlocked();
  if (kill.blocked) return { ok: false, reason: kill.reason || 'blocked' };
  const I = globalThis.FlowWhatsAppShareIntake;
  if (!I || typeof I.analyze !== 'function') return { ok: false, reason: 'not-configured' };
  const raw = String((payload && payload.text) || '').slice(0, 200000);
  const result = I.analyze(raw, payload && payload.now ? new Date(payload.now) : new Date());
  if (!result.ok) return Object.assign({ ok: false }, result);
  return {
    ok: true,
    sessionId: result.sessionId,
    focusText: result.focusText,
    sender: result.sender,
    draftText: result.draftText,
    phone: result.phone,
    waUrl: result.waUrl,
    hasReply: result.hasReply,
    hasTask: result.hasTask,
    process: result.judged && result.judged.process,
    intent: result.judged && result.judged.intent,
    receiptHonest: 'draft-opened-not-sent'
  };
}

export async function whatsappShareWameOpen(payload) {
  const kill = await shareKillBlocked();
  if (kill.blocked) return { ok: false, reason: kill.reason || 'blocked' };
  const Wa = globalThis.FlowWaMeLink;
  const I = globalThis.FlowWhatsAppShareIntake;
  const phone = payload && payload.phone;
  const draftText = String((payload && payload.draftText) || '').trim();
  const url = (payload && payload.waUrl) || (Wa && Wa.build ? Wa.build(phone, draftText) : null);
  if (!url || !/^https:\/\/wa\.me\/\d+/.test(url)) return { ok: false, reason: 'no-wame' };
  if (url.indexOf('?text=') < 0 && draftText) return { ok: false, reason: 'no-draft-in-url' };
  const sessionId = payload && payload.sessionId;
  const proof = I && I.proofRecord ? I.proofRecord(sessionId, url, draftText) : null;
  const receipt = {
    kind: 'whatsapp-share-wame',
    sessionId: sessionId,
    at: Date.now(),
    proof: proof,
    honestLine: 'Draft opened in WhatsApp — you send it.',
    honestLineHe: 'טיוטה נפתחה ב-WhatsApp — אתה שולח.',
    draftText: draftText,
    waUrl: url,
    sends: false
  };
  try {
    await chrome.storage.local.set({ whatsappShareLastReceipt: receipt });
    const tabs = await chrome.tabs.create({ url: url, active: true });
    receipt.tabId = tabs && tabs.id;
    await chrome.storage.local.set({ whatsappShareLastReceipt: receipt });
  } catch (e) {
    return { ok: false, reason: 'open-failed' };
  }
  return { ok: true, sends: false, proof: proof, receipt: receipt, url: url };
}

export async function whatsappShareUndo() {
  try {
    const bag = await chrome.storage.local.get({ whatsappShareLastReceipt: null });
    const prev = bag.whatsappShareLastReceipt;
    await chrome.storage.local.set({ whatsappShareLastReceipt: null, whatsappShareLastUndone: prev && prev.sessionId });
    return { ok: true, undone: true };
  } catch (e) {
    return { ok: false };
  }
}

export async function whatsappShareKillStatus() {
  return shareKillBlocked();
}

export async function whatsappShareModelConsent(given) {
  if (given !== true) return { ok: true, given: false };
  try {
    await chrome.storage.local.set({ [CONSENT_KEY]: Date.now() });
    return { ok: true, given: true };
  } catch (e) {
    return { ok: false };
  }
}

// Masked text only — for any future model call on this lane.
export function whatsappShareRedactForModel(text) {
  const R = globalThis.FlowChatRedact;
  if (!R || typeof R.beforeModel !== 'function') return { maskedText: String(text || ''), tokenMap: {} };
  return R.beforeModel(text);
}
