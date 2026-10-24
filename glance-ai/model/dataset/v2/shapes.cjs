'use strict';
// Live-shaped rendering for v2 rows. Two renders per row:
//   clean  = greeting/addressee + core + sign-off, plain \n  (what the reference label is computed on)
//   live   = clean + the format noise real mail carries: own-line greetings, blank lines, \r\n, nbsp from HTML, RLM marks,
//            signature blocks, "[image: logo]", confidentiality disclaimers, "Sent from my iPhone", subject prefixes.
// Format noise must never change the decision; rows where the engine's decision differs between the two renders are tagged
// formatSensitive (an engine-robustness finding) and keep the clean label.
function mkRng(seed) {
  let s = seed | 0;
  const rnd = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return { rnd, pick };
}
const OWN_NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
const GREET = {
  en: { none: ['Hi,', 'Hello,', 'Hey,', 'Good morning,', 'Hi there,', 'Hi all,', 'Hi team,', ''], own: ['Hi Sali,', 'Hey Sali,', 'Dear Sali,', 'Good morning Sali,', 'Sali,', 'Hello Sali,'],
    other: (n) => ['Hi ' + n + ',', 'Hey ' + n + ',', 'Dear ' + n + ',', 'Good morning ' + n + ',', n + ','] },
  he: { none: ['היי,', 'שלום,', 'שלום רב,', 'בוקר טוב,', 'היי לכולם,', 'צהריים טובים,', ''], own: ['היי סאלי,', 'שלום סאלי,', 'סאלי שלום,', 'בוקר טוב סאלי,', 'סאלי,', 'הי סאלי,'],
    other: (n) => ['היי ' + n + ',', 'שלום ' + n + ',', n + ' שלום,', 'בוקר טוב ' + n + ',', n + ','] }
};
const BYE = { en: ['Thanks,', 'Best,', 'Thanks!', 'Regards,', 'Cheers,', 'Thank you,', 'Best regards,', 'Many thanks,'], he: ['תודה,', 'בברכה,', 'תודה רבה,', 'תודה!', 'המשך יום טוב,', 'יום נעים,', 'בתודה,'] };
const PRE = { en: ['Hope you are well.', 'Hope your week is going well.', 'Following up on our call.', 'Quick one:', 'Happy Monday!'], he: ['מקווה שהכל טוב.', 'בהמשך לשיחתנו,', 'מקווה שאת/ה בטוב.', 'שבוע טוב!', 'רק משהו קטן:'] };
const SIG = { en: (n) => ['--', n, ['Account Manager', 'CFO', 'Head of Ops', 'Legal Counsel', 'Product Lead'][n.length % 5] + ' | ' + ['Acme Ltd', 'Northwind', 'Globex Inc.'][n.length % 3], '+972-54-' + (1000000 + n.length * 7919 % 8999999)],
  he: (n) => ['--', n, ['מנהלת לקוחות', 'סמנכ״ל כספים', 'מנהל תפעול', 'יועצת משפטית'][n.length % 4] + ' | ' + ['אקמי בע״מ', 'גלובקס', 'נורת׳ווינד'][n.length % 3], '054-' + (1000000 + n.length * 7919 % 8999999), 'www.acme.co.il'] };
const DISC = { en: 'CONFIDENTIALITY NOTICE: This e-mail and any attachments are confidential and intended solely for the addressee. If you have received it in error, please notify the sender and delete it.',
  he: 'הודעה זו והמצורפים לה מיועדים לנמען בלבד ועשויים להכיל מידע חסוי. אם קיבלת הודעה זו בטעות, אנא הודע לשולח ומחק אותה.' };
const MOBILE = { en: 'Sent from my iPhone', he: 'נשלח מה-iPhone שלי' };
const SUBJ_PREFIX = { en: ['Re: ', 'RE: ', 'Re: Re: ', 'Fwd: ', 'FW: '], he: ['Re: ', 'תגובה: ', 'השב: ', 'RE: ', 'הועבר: '] };

// addressee plan for inbound rows: none 55% / own 20% / other 25% (other = named greeting, inline "Dana, ..." or user on Cc only)
function planAddressee(r, lang, colleague) {
  const x = r.rnd();
  if (x < 0.55) return { voc: 'none', greet: r.pick(GREET[lang].none), inline: null, ccOnly: false };
  if (x < 0.75) { const own = r.rnd() < 0.3; return own ? { voc: 'own', greet: '', inline: lang === 'he' ? 'סאלי' : 'Sali', ccOnly: false } : { voc: 'own', greet: r.pick(GREET[lang].own), inline: null, ccOnly: false }; }
  const y = r.rnd();
  if (y < 0.45) return { voc: 'other', greet: r.pick(GREET[lang].other(colleague)), inline: null, ccOnly: r.rnd() < 0.4 };
  if (y < 0.75) return { voc: 'other', greet: r.rnd() < 0.5 ? '' : r.pick(GREET[lang].none.filter((g) => !/team|all|לכולם/.test(g))), inline: colleague, ccOnly: r.rnd() < 0.4 };
  return { voc: 'cc', greet: r.pick(GREET[lang].none.filter((g) => !/team|all|לכולם/.test(g))), inline: null, ccOnly: true };
}
const lowerFirst = (s) => /^(I|I'm|I'd|I'll)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
function render(r, { lang, core, plan, senderFirst, senderFull }) {
  const coreAddr = plan.inline ? plan.inline + ', ' + (lang === 'en' ? lowerFirst(core) : core) : core;
  const bye = r.pick(BYE[lang]);
  const pre = r.rnd() < 0.15 ? r.pick(PRE[lang]) : '';
  const style = r.rnd();
  let cleanParts, liveLines;
  if (style < 0.45) { // email: greeting on its own line, blank lines, sign-off + name, optional signature block
    cleanParts = [plan.greet, pre, coreAddr, bye + '\n' + senderFirst].filter(Boolean);
    liveLines = [plan.greet, '', pre, pre ? '' : null, coreAddr, '', bye, senderFirst].filter((x) => x !== null && x !== undefined);
    if (r.rnd() < 0.5) liveLines.push('', ...SIG[lang](senderFull));
  } else if (style < 0.65) { // single line
    cleanParts = [[plan.greet, pre, coreAddr, bye.replace(/,$/, '') ].filter(Boolean).join(' ')];
    liveLines = [cleanParts[0]];
  } else if (style < 0.8) { // core only (chat-like)
    cleanParts = [coreAddr]; liveLines = [coreAddr];
  } else { // HTML-derived
    cleanParts = [plan.greet, pre, coreAddr, bye + '\n' + senderFirst].filter(Boolean);
    liveLines = [plan.greet, '\u00a0', pre, coreAddr, '\u00a0', bye, senderFirst, '', '[image: logo]', ...SIG[lang](senderFull).slice(1), ''].filter((x) => x !== '' || true).filter((x) => x !== undefined);
    if (r.rnd() < 0.6) liveLines.push(DISC[lang]);
  }
  const clean = cleanParts.join('\n');
  let live = liveLines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').replace(/^\n+/, '');
  const noise = [];
  if (style >= 0.8 || r.rnd() < 0.15) { live = live.replace(/ /g, () => (r.rnd() < 0.25 ? '\u00a0' : ' ')); noise.push('nbsp'); }
  if (lang === 'he' && r.rnd() < 0.1) { live = live.split('\n').map((l) => (l ? '\u200f' + l : l)).join('\n'); noise.push('rlm'); }
  if (r.rnd() < 0.1) { live += '\n\n' + MOBILE[lang]; noise.push('mobile'); }
  if (r.rnd() < 0.2) { live = live.replace(/\n/g, '\r\n'); noise.push('crlf'); }
  return { clean, live, style: style < 0.45 ? 'email' : style < 0.65 ? 'oneline' : style < 0.8 ? 'core' : 'html', noise };
}
function subjectPrefix(r, lang, subj) { const x = r.rnd(); if (x < 0.25) return r.pick(SUBJ_PREFIX[lang].slice(0, 3)) + subj; if (x < 0.3) return r.pick(SUBJ_PREFIX[lang].slice(3)) + subj; return subj; }

// typos: never touch negation / hedge / numbers / the first word (often the verb mood marker)
const PROTECT = /^(?:not|don't|dont|do|no|never|maybe|perhaps|might|if|אל|לא|אין|אולי|אם|נא|אנא|בבקשה)$|\d|[₪$€%@]/i;
const FINAL = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ' };
function typo(r, s, lang) {
  const words = s.split(' ');
  const idx = words.map((w, i) => i).filter((i) => i > 0 && words[i].replace(/[^\p{L}]/gu, '').length >= 4 && !PROTECT.test(words[i].replace(/[^\p{L}\d'₪$€%@]/gu, '')));
  if (!idx.length) return null;
  const n = 1 + (r.rnd() < 0.3 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const i = r.pick(idx); let w = words[i];
    const kind = r.rnd();
    const letters = [...w];
    const pos = 1 + Math.floor(r.rnd() * Math.max(1, letters.length - 2));
    if (lang === 'he' && kind < 0.25 && FINAL[letters[letters.length - 1]]) letters[letters.length - 1] = FINAL[letters[letters.length - 1]];
    else if (kind < 0.55 && /\p{L}/u.test(letters[pos])) letters.splice(pos, 1);
    else if (kind < 0.85 && pos + 1 < letters.length && /\p{L}/u.test(letters[pos]) && /\p{L}/u.test(letters[pos + 1])) [letters[pos], letters[pos + 1]] = [letters[pos + 1], letters[pos]];
    else letters.splice(pos, 0, letters[pos] || '');
    words[i] = letters.join('');
  }
  let out = words.join(' ');
  if (r.rnd() < 0.3) out = out.replace(/, (?=\S)/, ',');
  return out === s ? null : out;
}
module.exports = { mkRng, planAddressee, render, subjectPrefix, typo, OWN_NAMES, GREET };
