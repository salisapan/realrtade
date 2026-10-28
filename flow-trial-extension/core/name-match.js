// Hebrew ↔ Latin display-name matching for vocative / greeting gates.
// Portable: no chrome, no DOM, no network.

const FlowNameMatch = (() => {
  const PAIRS = [
    { he: 'נועה', en: ['noa', 'noah'] },
    { he: 'ליאור', en: ['lior'] },
    { he: 'דנה', en: ['dana'] },
    { he: 'שרה', en: ['sarah', 'sara'] },
    { he: 'נועם', en: ['noam'] },
    { he: 'יוסי', en: ['yossi', 'joseph'] },
    { he: 'מיכל', en: ['michal', 'michelle'] }
  ];

  function cleanName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^\w\u0590-\u05FF'’\s.-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(name) {
    const c = cleanName(name);
    if (!c) return [];
    return c.split(/\s+/).filter(Boolean);
  }

  function latinForms(hebrewToken) {
    const t = cleanName(hebrewToken);
    for (const row of PAIRS) {
      if (t === row.he || t.indexOf(row.he) !== -1) return row.en.slice();
    }
    return [];
  }

  function equivalent(a, b) {
    const x = cleanName(a);
    const y = cleanName(b);
    if (!x || !y) return false;
    if (x === y || x.indexOf(y) !== -1 || y.indexOf(x) !== -1) return true;
    const xt = tokens(x);
    const yt = tokens(y);
    for (const tx of xt) {
      for (const ty of yt) {
        if (tx === ty) return true;
        const lat = latinForms(tx);
        for (let i = 0; i < lat.length; i++) {
          if (ty === lat[i] || ty.indexOf(lat[i]) !== -1 || lat[i].indexOf(ty) !== -1) return true;
        }
        const latB = latinForms(ty);
        for (let j = 0; j < latB.length; j++) {
          if (tx === latB[j] || tx.indexOf(latB[j]) !== -1) return true;
        }
      }
    }
    return false;
  }

  function matchesRecipient(who, recipients) {
    const name = cleanName(who);
    if (!name || !recipients || !recipients.length) return false;
    for (const r of recipients) {
      if (!r) continue;
      const display = cleanName(r.name || r.displayName || '');
      const local = cleanName(r.localPart || (r.email ? String(r.email).split('@')[0] : ''));
      if (display && equivalent(name, display)) return true;
      if (local && (equivalent(name, local) || name.replace(/\s+/g, '') === local.replace(/[._-]+/g, ''))) return true;
    }
    return false;
  }

  return { equivalent, matchesRecipient, cleanName };
})();

if (typeof module !== 'undefined') module.exports = { FlowNameMatch };
