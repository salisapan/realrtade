'use strict';
// One person, two scripts: «אבי» and "Avi", «שי» and "Shai", «לוי» and "Levi". Hebrew is written mostly without vowels, so a name is
// compared by its consonant sounds: each script is reduced to the same small set of sound classes, vowels and silent letters dropped,
// and two names match when one of their readings is the same. Rules, not a name list, so it covers names no table has.
//
// Where a letter has two readings the name gets both (ו: a vowel or v; צ: tz or z; ch: as in Chen or as in Michal), so the skeletons
// are a small set. A match on its own is not an identity: a caller keeps it only when exactly one person fits (core/loop-answer.js), and
// a name with no consonant sound at all ("Eya", «איה») never matches. core/name-match.js keeps its own table for the vocative gates.
// Portable: no chrome.*, no DOM, no network. No switch of its own: it is a helper; its callers sit behind theirs.
const FlowNameSound = (() => {
  const HE = /[א-ת]/;
  const MAX_VARIANTS = 16;

  // Hebrew letter -> sound class ('' = vowel or silent). Arrays are the letter's possible readings.
  const HEB = {
    'א': [''], 'ה': [''], 'ע': [''], 'י': [''], 'ו': ['', 'B'],
    'ב': ['B'], 'ג': ['G'], 'ד': ['D'], 'ז': ['Z'], 'ח': ['K'], 'ט': ['T'], 'ת': ['T'],
    'כ': ['K'], 'ך': ['K'], 'ק': ['K'], 'ל': ['L'], 'מ': ['M'], 'ם': ['M'], 'נ': ['N'], 'ן': ['N'],
    'ס': ['S'], 'ש': ['S'], 'צ': ['C', 'Z'], 'ץ': ['C', 'Z'], 'פ': ['P'], 'ף': ['P'], 'ר': ['R']
  };

  function cross(sets) {
    let out = [''];
    for (const opts of sets) {
      const next = [];
      for (const pre of out) for (const o of opts) { next.push(pre + o); if (next.length >= MAX_VARIANTS * 4) break; }
      out = next;
    }
    return out;
  }

  function hebrewSkeletons(word) {
    const w = String(word || '').replace(/[^א-ת'׳]/g, '');
    if (!w) return [];
    const sets = [];
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (ch === "'" || ch === '׳') continue;
      const geresh = w[i + 1] === "'" || w[i + 1] === '׳';
      if (geresh && ch === 'ג') { sets.push(['J']); continue; }
      if (geresh && (ch === 'צ' || ch === 'ץ')) { sets.push(['K', 'S']); continue; } // צ׳ = ch (Tchelet)
      if (ch === 'ו' && w[i + 1] === 'ו') { sets.push(['B']); i++; continue; }
      if (i === 0 && (ch === 'א' || ch === 'ע' || ch === 'ה')) { sets.push(['_']); continue; } // a name that opens on a vowel (Eli, Uri, Hila)
      if (ch === 'י' && i === 0) { sets.push(['Y']); continue; } // an opening י is a consonant (Yossi, Yael)
      if (ch === 'ו' && i === 0) { sets.push(['B']); continue; } // an opening ו is v (Vered)
      sets.push(HEB[ch] || ['']);
    }
    return [...new Set(cross(sets))].slice(0, MAX_VARIANTS);
  }

  function latinSkeletons(word) {
    const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '').replace(/([a-z])\1+/g, '$1'); // Yossi, Ella: a doubled letter is one sound
    if (!w) return [];
    const sets = [];
    for (let i = 0; i < w.length; i++) {
      const c = w[i], n = w[i + 1] || '';
      const two = c + n;
      if (two === 'sh') { sets.push(['S']); i++; continue; }
      if (two === 'ch') { sets.push(['K']); i++; continue; } // Chen, Michal, Rachel: all a K sound here (ח and כ share a class)
      if (two === 'kh') { sets.push(['K']); i++; continue; }
      if (two === 'ph') { sets.push(['P']); i++; continue; }
      if (two === 'th') { sets.push(['T']); i++; continue; }
      if (two === 'tz' || two === 'ts') { sets.push(['C']); i++; continue; }
      if (two === 'ck') { sets.push(['K']); i++; continue; }
      if (c === 'y' && i === 0) { sets.push(['Y']); continue; }
      if (i === 0 && 'aeiou'.includes(c)) { sets.push(['_']); continue; } // a name that opens on a vowel (Eli, Uri)
      if (c === 'h' && i === 0) { sets.push(['_', 'K']); continue; } // Hila (ה) or Haim (ח)
      if ('aeiouy'.includes(c)) { sets.push(['']); continue; }
      if (c === 'h') { sets.push(['', 'K']); continue; } // Noah, Sarah (ה, silent) or Shahar, Mizrahi (ח)
      if (c === 'c') { sets.push('ei'.includes(n) ? ['S'] : ['K']); continue; }
      if (c === 'v' || c === 'w' || c === 'b') { sets.push(['B']); continue; }
      if (c === 'f' || c === 'p') { sets.push(['P']); continue; }
      if (c === 'q' || c === 'k') { sets.push(['K']); continue; }
      if (c === 'x') { sets.push(['KS']); continue; }
      if (c === 'j') { sets.push(['J', 'Y']); continue; }
      if (c === 'z') { sets.push(['Z', 'C']); continue; }
      sets.push([c.toUpperCase()]);
    }
    return [...new Set(cross(sets))].slice(0, MAX_VARIANTS);
  }

  function skeletons(word) { return HE.test(String(word || '')) ? hebrewSkeletons(word) : latinSkeletons(word); }

  // same(a, b): one Hebrew and one Latin word (either order) share a reading with at least one consonant sound. Same-script words are not
  // this helper's question (they compare as text).
  // A vowel letter in the Hebrew (י or ו after the first letter) is a vowel the Latin spelling must show: שירה is not Sarah, אלון is
  // not Ilana, עדי is not Ido. (The other way round proves nothing: Hebrew often leaves vowels out.)
  function vowelsAgree(he, en) {
    const h = String(he || '').replace(/[^\u05D0-\u05EA]/g, '').slice(1), l = String(en || '').toLowerCase();
    if (/י/.test(h.replace(/יי/g, 'י')) && !/[iey]/.test(l)) return false;
    if (/ו(?!ו)/.test(h.replace(/וו/g, '')) && !/[ouvw]/.test(l)) return false;
    return true;
  }
  function same(a, b) {
    const ha = HE.test(String(a || '')), hb = HE.test(String(b || ''));
    if (ha === hb) return false;
    if (!vowelsAgree(ha ? a : b, ha ? b : a)) return false;
    const real = (x) => /[A-Z]/.test(x); // at least one consonant sound, not only the vowel mark
    const sa = skeletons(a).filter(real), sb = new Set(skeletons(b).filter(real));
    return sa.some((s) => sb.has(s));
  }

  return { skeletons, same, MAX_VARIANTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowNameSound };
