// The sender's habits, as the one sentence Draft-It may add to its instructions.
// The extension sends a fixed vocabulary (core/style-profile.js hints()); this file accepts ONLY that vocabulary, so
// nothing a client sends can become free text in a prompt. Anything else is dropped.
const GREETING = {
  en: { 'hi-name': 'open with "Hi" and the first name', 'hello-name': 'open with "Hello" and the first name', 'dear-name': 'open with "Dear" and the name', 'name-only': 'open with just the first name', 'hi-bare': 'open with a bare "Hi,"', none: 'start straight with the content, no greeting' },
  he: { 'hi-name': 'פתח ב"היי" ושם פרטי', 'shalom-name': 'פתח ב"שלום" ושם פרטי', shalom: 'פתח ב"שלום,"', 'name-only': 'פתח בשם הפרטי בלבד', none: 'התחל ישר בתוכן, בלי ברכה' }
};
const SIGNOFF = {
  en: { best: '"Best,"', 'best-regards': '"Best regards,"', 'kind-regards': '"Kind regards,"', regards: '"Regards,"', thanks: '"Thanks,"', 'thank-you': '"Thank you,"', cheers: '"Cheers,"', sincerely: '"Sincerely,"', none: null },
  he: { brakha: '"בברכה,"', toda: '"תודה,"', 'toda-raba': '"תודה רבה,"', bekavod: '"בכבוד רב,"', none: null }
};
const LENGTH = { en: { short: 'Keep it short, a few sentences.', medium: 'A medium length is right.', long: 'It is fine to write at some length.' }, he: { short: 'קצר, כמה משפטים.', medium: 'אורך בינוני.', long: 'אפשר להרחיב.' } };

function styleLine(style, lang) {
  if (!style || typeof style !== 'object') return '';
  const l = lang === 'he' ? 'he' : 'en';
  if (style.lang !== l) return '';
  const parts = [];
  const g = Object.prototype.hasOwnProperty.call(GREETING[l], style.greeting) ? GREETING[l][style.greeting] : null;
  const s = Object.prototype.hasOwnProperty.call(SIGNOFF[l], style.signoff) ? SIGNOFF[l][style.signoff] : null;
  const len = Object.prototype.hasOwnProperty.call(LENGTH[l], style.length) ? LENGTH[l][style.length] : null;
  if (l === 'he') {
    if (g) parts.push(g);
    if (s) parts.push('סיים ב' + s);
    if (len) parts.push(len);
    if (style.exclaim === false) parts.push('בלי סימני קריאה.');
    return parts.length ? ' כך האדם הזה כותב: ' + parts.join('; ') + '.' : '';
  }
  if (g) parts.push(g);
  if (s) parts.push('close with ' + s);
  if (len) parts.push(len.replace(/\.$/, ''));
  if (style.exclaim === false) parts.push('avoid exclamation marks');
  return parts.length ? ' This is how the person you are writing for usually writes: ' + parts.join('; ') + '.' : '';
}

module.exports = { styleLine };
