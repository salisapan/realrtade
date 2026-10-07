'use strict';
// v2.1 shapes = v2 live-shaped renders + BARE and SUBJECT-ONLY shapes (what repo fixtures and many real one-liners look like):
//   bare          core sentence only: no greeting, no sign-off, no signature; optional dropped final period, lowercase start,
//                 trailing "thx"/"תודה"; subject often EMPTY (repo rows all have an empty subject).
//   subject-only  the ask lives in the subject line; body is empty or a filler ("Thanks", "See subject", "תודה").
// Addressee plans still apply (inline "Dana, ..." and Cc-only survive in bare shapes), so labels stay product-correct.
const S = require('../v2/shapes.cjs');
const { SUBJECT_ONLY_FILLER } = require('./templates-v21.cjs');
const TAIL = { en: [' thx', ' thanks', ' ty', '!'], he: [' תודה', ' תודה!', ' 🙏', '!'] };
function bare(r, lang, core, plan) {
  let s = plan.inline ? plan.inline + ', ' + (lang === 'en' && !/^(I|I'm|I'd|I'll)\b/.test(core) ? core.charAt(0).toLowerCase() + core.slice(1) : core) : core;
  if (r.rnd() < 0.45) s = s.replace(/[.]\s*$/, '');
  if (lang === 'en' && !plan.inline && r.rnd() < 0.2) s = s.charAt(0).toLowerCase() + s.slice(1);
  if (r.rnd() < 0.12 && !/[?!]$/.test(s)) s += r.pick(TAIL[lang]);
  return s;
}
// returns { clean, live, style, noise, subject: string|null (null = builder picks the usual subject) }
function renderV21(r, opts, mix) {
  const x = r.rnd();
  if (x < mix.bare) {
    const clean = bare(r, opts.lang, opts.core, opts.plan);
    let live = clean; const noise = [];
    if (r.rnd() < 0.08) { live += '\n\n' + (opts.lang === 'en' ? 'Sent from my iPhone' : 'נשלח מה-iPhone שלי'); noise.push('mobile'); }
    if (opts.lang === 'he' && r.rnd() < 0.08) { live = '\u200f' + live; noise.push('rlm'); }
    return { clean, live, style: 'bare', noise, subject: r.rnd() < 0.55 ? '' : null };
  }
  if (x < mix.bare + mix.subjectOnly) {
    const filler = r.pick(SUBJECT_ONLY_FILLER[opts.lang]);
    const subj = (r.rnd() < 0.2 ? (opts.lang === 'en' ? 'Re: ' : 'Re: ') : '') + opts.core.replace(/[.]\s*$/, '');
    return { clean: filler, live: filler, style: 'subject-only', noise: [], subject: subj };
  }
  const d = S.render(r, opts); d.subject = null; return d;
}
module.exports = Object.assign({}, S, { renderV21, bare });
