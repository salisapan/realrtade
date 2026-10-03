// How YOU write, as counts. Portable: no chrome.*, no DOM, no network, no model.
//
// Every message you send teaches this file a little about your habits: how you open (Hi Dana, / Dear Dana, /
// Dana, / none), how you close (Best, / Thanks, / בברכה / none), whether you tend to be brief, whether you use
// exclamation marks. Counts only, per language: no sentence, no name, no address is ever kept. After a few
// messages the profile can answer "how would this person open and close a note", and the follow-up drafts and
// Draft-It then start and end the way you do. That is all it does: it never writes the middle of a message, and
// nothing is sent for you.
//
// Draft-It's server sees only the enumerated values below (a fixed vocabulary it re-validates), never a count and never
// text you wrote. Used for Pro only; the counts are kept on this device.
const FlowStyle = (() => {
  const MIN_MESSAGES = 6;       // fewer than this in a language and there is no profile for it yet
  const MIN_SHARE = 0.5;        // a habit must be MORE than half of what you do: a tie is not a habit
  const EXCLAIM_SHARE = 0.3;
  const MAX_COUNT = 400;        // counters halve past this, so the profile follows how you write now

  const GREETINGS = { en: ['hi-name', 'hello-name', 'dear-name', 'name-only', 'hi-bare', 'none'], he: ['hi-name', 'shalom-name', 'shalom', 'name-only', 'none'] };
  const SIGNOFFS = { en: ['best', 'best-regards', 'kind-regards', 'regards', 'thanks', 'thank-you', 'cheers', 'sincerely', 'none'], he: ['brakha', 'toda', 'toda-raba', 'bekavod', 'none'] };
  const LENGTHS = ['short', 'medium', 'long'];

  function hasHebrew(t) { return /[֐-׿]/.test(String(t || '')); }
  function langOf(t) { return hasHebrew(t) ? 'he' : 'en'; }
  function lines(text) { return String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean); }
  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }

  function greetingOf(first, lang) {
    const l = String(first || '').trim();
    if (lang === 'he') {
      if (/^היי\s+[֐-׿"'׳]+\s*[,!]?$/.test(l)) return 'hi-name';
      if (/^שלום\s+רב\s*[,!]?$|^שלום\s*[,!]?$/.test(l)) return 'shalom';
      if (/^שלום\s+[֐-׿"'׳]+\s*[,!]?$/.test(l)) return 'shalom-name';
      if (/^[֐-׿"'׳]{2,}\s*[,!]$/.test(l)) return 'name-only';
      return 'none';
    }
    if (/^(?:hi|hey)\s*[,!]?$/i.test(l)) return 'hi-bare';
    if (/^(?:hi|hey)\s+[A-Za-z][\w.'-]*\s*[,!]?$/i.test(l)) return 'hi-name';
    if (/^hello\s*[,!]?$/i.test(l)) return 'hi-bare';
    if (/^hello\s+[A-Za-z][\w.'-]*\s*[,!]?$/i.test(l)) return 'hello-name';
    if (/^dear\s+[A-Za-z][\w.' -]*\s*[,:]?$/i.test(l)) return 'dear-name';
    if (/^[A-Z][a-z]{1,20}\s*,$/.test(l)) return 'name-only';
    return 'none';
  }

  // A sign-off is a short closing line near the end. "none" when the last lines are not one.
  const SIGN_EN = [[/^best regards\s*[,.!]?$/i, 'best-regards'], [/^best wishes\s*[,.!]?$/i, 'best'], [/^best\s*[,.!]?$/i, 'best'], [/^kind regards\s*[,.!]?$/i, 'kind-regards'], [/^warm regards\s*[,.!]?$/i, 'kind-regards'], [/^regards\s*[,.!]?$/i, 'regards'],
    [/^(?:many )?thanks(?: again| so much| a lot)?\s*[,.!]?$/i, 'thanks'], [/^thank you(?: so much| again)?\s*[,.!]?$/i, 'thank-you'], [/^cheers\s*[,.!]?$/i, 'cheers'], [/^sincerely\s*[,.!]?$/i, 'sincerely']];
  const SIGN_HE = [[/^בברכה(?: ובתודה| רבה)?\s*[,.!]?$/, 'brakha'], [/^תודה רבה\s*[,.!]?$/, 'toda-raba'], [/^תודה(?: מראש)?\s*[,.!]?$/, 'toda'], [/^בכבוד רב\s*[,.!]?$/, 'bekavod']];
  function signoffOf(ls, lang) {
    const tail = ls.slice(-3);
    for (const l of tail.reverse()) {
      if (l.length > 40) continue;
      for (const [re, key] of (lang === 'he' ? SIGN_HE : SIGN_EN)) if (re.test(l)) return key;
    }
    return 'none';
  }

  function emptyProfile() { return { v: 1, n: { en: 0, he: 0 }, greet: { en: {}, he: {} }, sign: { en: {}, he: {} }, wordsSum: { en: 0, he: 0 }, exclaim: { en: 0, he: 0 } }; }
  function norm(p) {
    const e = emptyProfile();
    if (!p || p.v !== 1) return e;
    ['n', 'wordsSum', 'exclaim'].forEach((k) => ['en', 'he'].forEach((l) => { e[k][l] = Number(p[k] && p[k][l]) || 0; }));
    ['greet', 'sign'].forEach((k) => ['en', 'he'].forEach((l) => { e[k][l] = Object.assign({}, p[k] && p[k][l]); }));
    return e;
  }
  function halve(p, l) {
    p.n[l] = Math.round(p.n[l] / 2); p.wordsSum[l] = Math.round(p.wordsSum[l] / 2); p.exclaim[l] = Math.round(p.exclaim[l] / 2);
    ['greet', 'sign'].forEach((k) => { Object.keys(p[k][l]).forEach((x) => { p[k][l][x] = Math.round(p[k][l][x] / 2); if (!p[k][l][x]) delete p[k][l][x]; }); });
  }

  // One message of yours (quoted history already removed) -> the updated profile. Very short notes and forwards are skipped.
  function observe(profile, text) {
    const p = norm(profile);
    const ls = lines(text);
    if (!ls.length || words(text) < 8 || words(text) > 600) return p;
    const lang = langOf(text);
    const g = greetingOf(ls[0], lang);
    const s = signoffOf(ls, lang);
    p.n[lang] += 1;
    p.greet[lang][g] = (p.greet[lang][g] || 0) + 1;
    p.sign[lang][s] = (p.sign[lang][s] || 0) + 1;
    p.wordsSum[lang] += Math.min(words(text), 300);
    if (/!/.test(text)) p.exclaim[lang] += 1;
    if (p.n[lang] > MAX_COUNT) halve(p, lang);
    return p;
  }

  function top(counts, allowed, n) {
    let best = null;
    allowed.forEach((k) => { const c = counts[k] || 0; if (!best || c > best.c) best = { k, c }; });
    return best && best.c / n > MIN_SHARE ? best.k : null;
  }

  // The habits that are really habits, or null while there is too little to go on. Only enumerated values.
  function summary(profile, lang) {
    const p = norm(profile);
    const l = lang === 'he' ? 'he' : 'en';
    const n = p.n[l];
    if (n < MIN_MESSAGES) return null;
    const mean = p.wordsSum[l] / n;
    return {
      lang: l, messages: n,
      greeting: top(p.greet[l], GREETINGS[l], n),
      signoff: top(p.sign[l], SIGNOFFS[l], n),
      length: mean < 40 ? 'short' : mean < 120 ? 'medium' : 'long',
      exclaim: p.exclaim[l] / n >= EXCLAIM_SHARE
    };
  }

  function renderGreeting(key, name, lang) {
    const nm = String(name || '').trim();
    if (lang === 'he') {
      if (key === 'hi-name') return nm ? 'היי ' + nm + ',' : 'שלום,';
      if (key === 'shalom-name') return nm ? 'שלום ' + nm + ',' : 'שלום,';
      if (key === 'shalom') return 'שלום,';
      if (key === 'name-only') return nm ? nm + ',' : 'שלום,';
      return null;
    }
    if (key === 'hi-name') return nm ? 'Hi ' + nm + ',' : 'Hi,';
    if (key === 'hello-name') return nm ? 'Hello ' + nm + ',' : 'Hello,';
    if (key === 'dear-name') return nm ? 'Dear ' + nm + ',' : 'Hello,';
    if (key === 'name-only') return nm ? nm + ',' : 'Hi,';
    if (key === 'hi-bare') return 'Hi,';
    return null;
  }
  const SIGN_TEXT = { en: { best: 'Best,', 'best-regards': 'Best regards,', 'kind-regards': 'Kind regards,', regards: 'Regards,', thanks: 'Thanks,', 'thank-you': 'Thank you,', cheers: 'Cheers,', sincerely: 'Sincerely,' },
    he: { brakha: 'בברכה,', toda: 'תודה,', 'toda-raba': 'תודה רבה,', bekavod: 'בכבוד רב,' } };

  // A draft built from a template, in your habits. Only the greeting line, the closing line and exclamation marks change;
  // the middle is left alone. A template that does not start or end the usual way is left as it is.
  function restyle(text, sum, opts) {
    const t = String(text || '');
    if (!sum || !t) return t;
    const lang = hasHebrew(t) ? 'he' : 'en';
    if (sum.lang !== lang) return t;
    const ls = t.replace(/\r/g, '').split('\n');
    const first = ls.findIndex((l) => l.trim());
    let lastIdx = -1;
    for (let i = ls.length - 1; i >= 0; i--) if (ls[i].trim()) { lastIdx = i; break; }
    if (first < 0) return t;
    const name = opts && opts.name;
    if (sum.greeting && greetingOf(ls[first], lang) !== 'none' || (sum.greeting && /^(?:hi|hello|היי|שלום)\b/i.test(ls[first].trim()))) {
      const g = sum.greeting === 'none' ? null : renderGreeting(sum.greeting, name, lang);
      if (g) ls[first] = g;
    }
    if (sum.signoff && lastIdx > first && signoffOf([ls[lastIdx]], lang) !== 'none') {
      if (sum.signoff === 'none') ls.splice(lastIdx, 1);
      else if (SIGN_TEXT[lang][sum.signoff]) ls[lastIdx] = SIGN_TEXT[lang][sum.signoff];
    }
    let out = ls.join('\n');
    if (!sum.exclaim) out = out.replace(/!/g, '.').replace(/\.{2,}/g, '.');
    return out;
  }

  // What Draft-It's server may be told: enumerated values only, checked here and again on the server.
  function hints(sum) {
    if (!sum) return null;
    const lang = sum.lang === 'he' ? 'he' : 'en';
    return {
      lang,
      greeting: GREETINGS[lang].includes(sum.greeting) ? sum.greeting : null,
      signoff: SIGNOFFS[lang].includes(sum.signoff) ? sum.signoff : null,
      length: LENGTHS.includes(sum.length) ? sum.length : null,
      exclaim: Boolean(sum.exclaim)
    };
  }

  // One line for the learning ledger ("Drafts now follow how you write: ...").
  function note(sum) {
    if (!sum) return null;
    const bits = [];
    if (sum.greeting && sum.greeting !== 'none') bits.push('you open with ' + renderGreeting(sum.greeting, sum.lang === 'he' ? 'דנה' : 'Dana', sum.lang).replace(/Dana|דנה/, '…'));
    if (sum.signoff && sum.signoff !== 'none') bits.push('you close with ' + SIGN_TEXT[sum.lang][sum.signoff].replace(/,$/, ''));
    bits.push(sum.length === 'short' ? 'you keep it short' : sum.length === 'long' ? 'you write at length' : 'a medium length');
    return bits.join(', ');
  }

  return { MIN_MESSAGES, GREETINGS, SIGNOFFS, LENGTHS, emptyProfile, observe, summary, restyle, hints, note, greetingOf, signoffOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowStyle };
