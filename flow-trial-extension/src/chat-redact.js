// Redact chat-derived text before any outbound worker call or model payload.
const FlowChatRedact = (() => {
  const MEDICAL = /\b(?:diagnos|prescri|chemotherapy|insulin|hiv|aids|pregnant|miscarriage|suicid|depress(?:ion|ed)|psychiatr|therap(?:y|ist)|cancer|tumor|surgery|hospital|clinic|patient)\b|אבחנ|תרופ|כימותרפ|אינסולין|הריון|הפלה|דיכאון|פסיכיא|טיפול נפש|סרטן|ניתוח|בית חולים|מרפאה|חולה/i;

  function luhnIsraeliId(digits) {
    const s = String(digits || '').replace(/\D/g, '');
    if (s.length !== 9) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let n = Number(s[i]) * ((i % 2) + 1);
      if (n > 9) n = Math.floor(n / 10) + (n % 10);
      sum += n;
    }
    return sum % 10 === 0;
  }

  function hashNameToken(name) {
    const t = String(name || '').trim();
    if (!t) return '';
    return '[NAME]';
  }

  function redactNames(text, names) {
    let out = String(text || '');
    const list = (names || []).map((n) => String(n || '').trim()).filter((n) => n.length > 1);
    list.sort((a, b) => b.length - a.length);
    for (const name of list) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(esc, 'gi'), '[NAME]');
    }
    return out;
  }

  function redactIds(text) {
    return String(text || '').replace(/\b\d{9}\b/g, (m) => (luhnIsraeliId(m) ? '[ID]' : m));
  }

  function redactPolicy(text) {
    return String(text || '').replace(/\b(?:policy|פוליסה|מספר פוליסה|מס' פוליסה)[\s:#-]*[A-Z0-9]{5,12}\b/gi, '[POLICY]');
  }

  function redactAmounts(text) {
    return String(text || '')
      .replace(/(?:₪|NIS|\$|€|EUR|USD)\s*[\d,]+(?:\.\d{1,2})?/gi, '[AMOUNT]')
      .replace(/[\d,]+(?:\.\d{1,2})?\s*(?:₪|NIS|שקל|ש"ח|דולר|אירו)/gi, '[AMOUNT]');
  }

  function medicalCheck(text) {
    if (!MEDICAL.test(String(text || ''))) return { level: 'ok' };
    return { level: 'warn', reason: 'medical' };
  }

  function redactPayload(text, opts) {
    const names = (opts && opts.names) || [];
    let body = redactNames(text, names);
    body = redactIds(body);
    body = redactPolicy(body);
    body = redactAmounts(body);
    const med = medicalCheck(text);
    return { text: body, medical: med };
  }

  function redactObject(obj, opts) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
    const walk = (node, key) => {
      if (node == null) return node;
      if (typeof node === 'string' && /text|label|query|fact|place|title|name|body/i.test(String(key || ''))) {
        return redactPayload(node, opts).text;
      }
      if (Array.isArray(node)) return node.map((v, i) => walk(v, i));
      if (typeof node === 'object') {
        const bag = {};
        Object.keys(node).forEach((k) => { bag[k] = walk(node[k], k); });
        return bag;
      }
      return node;
    };
    return walk(out, '');
  }

  return { redactPayload, redactObject, medicalCheck, luhnIsraeliId };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatRedact };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatRedact = FlowChatRedact;
