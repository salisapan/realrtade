// WhatsApp Cloud API send helper.
// Session replies only, as a response to an inbound user message inside the
// 24-hour customer-service window. Template / marketing / outbound sends are
// refused here so a caller cannot accidentally pay for or start a conversation.
const GRAPH_VERSION = 'v27.0';
const GRAPH_BASE = 'https://graph.facebook.com/' + GRAPH_VERSION;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function graphMessagesUrl(phoneNumberId) {
  return GRAPH_BASE + '/' + encodeURIComponent(phoneNumberId) + '/messages';
}

function withinCustomerServiceWindow(inboundAt, now) {
  if (inboundAt == null) return false;
  const delta = now - inboundAt;
  return delta >= 0 && delta <= WINDOW_MS;
}

async function sendSessionMessage(env, payload, fetchFn) {
  if (!payload || payload.type === 'template') {
    throw new Error('template and outbound marketing sends are not allowed');
  }
  if (!payload.to) throw new Error('missing recipient');
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) throw new Error('WhatsApp send is not configured');
  const body = Object.assign({ messaging_product: 'whatsapp' }, payload);
  const res = await (fetchFn || fetch)(graphMessagesUrl(phoneNumberId), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Graph send failed: HTTP ' + res.status + ' ' + String(text).slice(0, 200));
  }
  return res.json().catch(() => ({}));
}

module.exports = {
  GRAPH_VERSION,
  GRAPH_BASE,
  WINDOW_MS,
  graphMessagesUrl,
  withinCustomerServiceWindow,
  sendSessionMessage,
};
