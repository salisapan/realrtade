// A system notice with a deadline and a preventing action: "your project will be paused on October 28 unless you update
// your billing details", "your domain expires on 2026-11-02, renew it". Portable: no chrome.*, no DOM, no network.
//
// This is a request kind of its own, not a person's ask. The sender is a service, so the person-to-person quiets
// (no-reply, notification senders) do not apply; the ones that do are stricter instead:
//   - the sender must be a KNOWN service (a domain in KNOWN_DOMAINS, or one the caller passes as knownSenders), never an
//     unknown address that merely writes the same words (that is a phishing shape);
//   - the text must carry all three: a consequence (paused, suspended, deleted, expires), a deadline (a date, or a window
//     such as "within 48 hours") and a preventing action (update, renew, verify, pay);
//   - a newsletter, a promotion or a webinar never qualifies, even from a known service.
// The close is a task with the date. It is a proposal the person approves with Do It; Glance never pays, renews or signs in.
const FlowSystemNotice = (() => {
  const KNOWN_DOMAINS = [
    'google.com', 'googlemail.com', 'accounts.google.com', 'workspace.google.com', 'microsoft.com', 'office.com', 'office365.com',
    'azure.com', 'live.com', 'github.com', 'gitlab.com', 'netlify.com', 'vercel.com', 'supabase.com', 'supabase.io',
    'cloudflare.com', 'godaddy.com', 'namecheap.com', 'squarespace.com', 'wix.com', 'wordpress.com', 'shopify.com',
    'amazon.com', 'amazonaws.com', 'aws.amazon.com', 'heroku.com', 'render.com', 'fly.io', 'digitalocean.com', 'atlassian.com',
    'zoom.us', 'dropbox.com', 'apple.com', 'stripe.com', 'paypal.com', 'meta.com', 'facebook.com', 'facebookmail.com',
    'slack.com', 'notion.so', 'figma.com', 'canva.com', 'mailchimp.com', 'hostinger.com', 'bluehost.com', 'monday.com',
    'quickbooks.com', 'intuit.com', 'twilio.com', 'sendgrid.net', 'openai.com', 'anthropic.com'
  ];

  const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
    'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10,
    'נובמבר': 11, 'דצמבר': 12
  };

  const CONSEQUENCE = new RegExp([
    '\\b(?:will|would|may)\\s+(?:be\\s+)?(?:paused|suspended|deleted|disabled|deactivated|terminated|closed|cancell?ed|removed|locked|shut\\s+down|taken\\s+offline|downgraded)\\b',
    '\\b(?:expires?|expiring|will\\s+expire|expired\\s+on|lapses?|will\\s+lapse|runs?\\s+out|will\\s+be\\s+charged)\\b',
    '\\b(?:last\\s+day|final\\s+notice)\\b',
    '(?:יושעה|יושעו|יימחק|יימחקו|יושבת|יושבתו|תושעה|תימחק|תבוטל|יבוטל|יפוג|תפוג|פג\\s+תוקף|ייסגר|ייחסם|תיחסם|יחויב)'
  ].join('|'), 'i');

  const ACTION = [
    { re: /\b(update|add|confirm|verify|fix)\s+(?:your\s+|the\s+)?(billing|payment|card|credit card|account|contact)\b[^.\n]{0,40}/i, verb: 1 },
    { re: /\b(renew|reactivate|upgrade|re-?authenticate|reauthorize|re-?verify)\s+(?:your\s+|the\s+)(?!it\b|now\b)[^.\n]{0,50}/i, verb: 1 },
    { re: /\b(renew|reactivate)\s+(?:it|now|this|that)\b/i, verb: 1, bare: true },
    { re: /\b(pay|settle)\s+(?:your\s+|the\s+|this\s+)?(?:outstanding\s+|overdue\s+)?(invoice|balance|bill|amount)\b[^.\n]{0,30}/i, verb: 1 },
    { re: /\b(verify|confirm)\s+(?:your\s+)?(email|domain|identity|ownership)\b[^.\n]{0,30}/i, verb: 1 },
    { re: /(?:לחדש|לעדכן|לאמת|לשלם|לאשר|להוסיף)\s+[^.\n]{2,50}/, verb: 0 }
  ];

  const NEWSLETTER = [
    /\bunsubscribe\b/i, /\bview (?:this email )?in (?:your )?browser\b/i, /\bnewsletter\b/i, /\bwebinar\b/i, /\bwhat'?s new\b/i,
    /\b\d{1,2}\s?%\s*off\b/i, /\b(?:sale|discount|promo(?:tion)?|coupon|limited[- ]time offer|special offer)\b/i,
    /\byou(?:'| a)?re receiving this\b/i, /\byou are receiving this\b/i, /\byou received this email because\b/i,
    /להסרה מרשימת/, /קיבלת מייל זה/, /ניוזלטר/, /וובינר/, /מבצע/
  ];
  const BULK_LOCAL = /^(?:newsletter|news|marketing|mailer|promo|promotions|deals|offers|digest|updates?)(?:[-_.+]|$)/i;

  function domainOf(email) {
    const m = String(email || '').toLowerCase().match(/@([a-z0-9.-]+)\s*$/);
    return m ? m[1] : '';
  }
  function localOf(email) { return String(email || '').toLowerCase().split('@')[0] || ''; }

  // exact domain or a subdomain of a known one ("billing.netlify.com"); a lookalike ("netlify.com.evil.io") never matches.
  function knownService(email, extra) {
    const dom = domainOf(email);
    if (!dom) return null;
    const pool = KNOWN_DOMAINS.concat((extra || []).map((d) => String(d || '').toLowerCase().replace(/^@/, '')).filter(Boolean));
    for (const k of pool) {
      if (k.indexOf('@') !== -1) { if (String(email).toLowerCase() === k) return dom; continue; }
      if (dom === k || dom.endsWith('.' + k)) return k;
    }
    return null;
  }

  function providerName(email, known) {
    const dom = known || domainOf(email);
    const label = String(dom).split('.')[0] || '';
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
  }

  function iso(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.getUTCFullYear() + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function nowParts(now) {
    const n = (now && typeof now.getTime === 'function') ? now : new Date(typeof now === 'number' ? now : Date.now());
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), ms: n.getTime() };
  }

  // The first deadline in the text that is today or later, as YYYY-MM-DD. Slash dates are not read: 03/04 is two days.
  function deadlineOf(text, now) {
    const t = String(text || '');
    const np = nowParts(now);
    const today = iso(np.y, np.m, np.d);
    const cands = [];
    let m;
    const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    while ((m = reIso.exec(t))) { const v = iso(+m[1], +m[2], +m[3]); if (v) cands.push({ at: m.index, iso: v }); }
    const reMd = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/gi;
    while ((m = reMd.exec(t))) {
      const mo = MONTHS[m[1].toLowerCase().replace(/\.$/, '')];
      cands.push({ at: m.index, iso: iso(m[3] ? +m[3] : null, mo, +m[2]) || null, md: [mo, +m[2], m[3] ? +m[3] : null] });
    }
    const reDm = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:,?\s+(20\d{2}))?\b/gi;
    while ((m = reDm.exec(t))) {
      const mo = MONTHS[m[2].toLowerCase()];
      cands.push({ at: m.index, md: [mo, +m[1], m[3] ? +m[3] : null] });
    }
    const reHe = /\b(\d{1,2})\s+ב?(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?:\s+(20\d{2}))?/g;
    while ((m = reHe.exec(t))) cands.push({ at: m.index, md: [MONTHS[m[2]], +m[1], m[3] ? +m[3] : null] });
    const out = [];
    for (const c of cands) {
      let v = c.iso;
      if (c.md) {
        const [mo, d, y] = c.md;
        v = y ? iso(y, mo, d) : (iso(np.y, mo, d) && iso(np.y, mo, d) >= today ? iso(np.y, mo, d) : iso(np.y + 1, mo, d));
      }
      if (v && v >= today) out.push({ at: c.at, iso: v });
    }
    out.sort((a, b) => a.at - b.at);
    if (out.length) return out[0].iso;
    // a window: "within 48 hours", "in 3 days", "תוך 3 ימים"
    const w = t.match(/\b(?:within|in|over the next)\s+(\d{1,3})\s*(hours?|days?)\b/i) || t.match(/תוך\s+(\d{1,3})\s*(שעות|ימים)/);
    if (w) {
      const n = +w[1];
      const days = /^(?:hour|שעות)/i.test(w[2]) ? Math.max(1, Math.ceil(n / 24)) : n;
      const dt = new Date(np.ms + days * 86400000);
      return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    }
    return null;
  }

  function actionOf(text) {
    const t = String(text || '');
    for (const a of ACTION) {
      const m = t.match(a.re);
      if (m && a.bare) {
        const dom = t.match(/\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|dev|app|co\.il|org\.il|il)\b/i);
        return (m[1].toLowerCase() === 'renew' ? 'renew ' : 'reactivate ') + (dom ? dom[0] : 'your plan');
      }
      if (m) return m[0].trim().replace(/\s+/g, ' ').replace(/[,;:\s]+$/, '');
    }
    return null;
  }

  function shortDate(isoDate, hebrew) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return hebrew ? d + '.' + m : names[m - 1] + ' ' + d;
  }

  // input: { text, subject, sender:{email,name}, now, knownSenders:[domain|address] }
  // -> { kind:'system-notice', provider, action, dueIso, title } | null
  function detect(input) {
    const i = input || {};
    const email = String((i.sender && i.sender.email) || i.senderEmail || '').trim().toLowerCase();
    const known = knownService(email, i.knownSenders);
    if (!known) return null;
    if (BULK_LOCAL.test(localOf(email))) return null;
    const blob = (i.subject ? String(i.subject) + '\n' : '') + String(i.text || '');
    for (const re of NEWSLETTER) if (re.test(blob)) return null;
    if (!CONSEQUENCE.test(blob)) return null;
    const dueIso = deadlineOf(blob, i.now);
    if (!dueIso) return null;
    const action = actionOf(blob);
    if (!action) return null;
    const hebrew = /[֐-׿]/.test(action);
    const provider = providerName(email, known);
    const cap = action.charAt(0).toUpperCase() + action.slice(1);
    const title = cap + (provider ? ' (' + provider + ')' : '') + (hebrew ? ' עד ' : ' by ') + shortDate(dueIso, hebrew);
    return { kind: 'system-notice', provider, action: cap, dueIso, title };
  }

  return { KNOWN_DOMAINS, detect, knownService, deadlineOf, actionOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowSystemNotice };
else if (typeof globalThis !== 'undefined') globalThis.FlowSystemNotice = FlowSystemNotice;
