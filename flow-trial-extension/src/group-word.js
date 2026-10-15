// One classifier for Messenger, Instagram, and Business Suite. No name lists.
// A person-shaped title (1–3 words, letters only) cancels a group-word veto.
// It is not proof. A draft still needs a profile link, a matching thread id,
// or a one-person panel. A title that is only the group word stays a group.
const FlowGroupWord = (() => {
  const EN = new Set(['members', 'participants', 'family', 'department', 'dept', 'team', 'group', 'squad', 'crew', 'staff']);
  const HE = new Set(['מחלקת', 'מחלקה', 'משתתפים', 'משפחה', 'קבוצתי', 'קבוצת', 'קבוצה', 'צוות']);

  function bare(text) {
    return String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function wordsOf(text) {
    return bare(text).split(' ').filter(Boolean);
  }

  function letters(word) {
    return String(word || '').replace(/[^\p{L}]/gu, '');
  }

  function groupStem(word) {
    const raw = letters(word);
    if (!raw) return '';
    if (EN.has(raw.toLowerCase())) return raw.toLowerCase();
    if (HE.has(raw)) return raw;
    const prefixed = raw.match(/^([בלהו]{1,3})(.+)$/u);
    return prefixed && HE.has(prefixed[2]) ? prefixed[2] : '';
  }

  // True only when the title is the group word by itself.
  function counts(text) {
    const words = wordsOf(text);
    return words.length === 1 && Boolean(groupStem(words[0]));
  }

  // 1–3 words of letters. Digits, emoji, and punctuation are not a person.
  function personShaped(text) {
    const title = bare(text);
    if (!title) return false;
    if (/\p{Extended_Pictographic}/u.test(title) || /\d/.test(title)) return false;
    if (/[^\p{L}\s]/u.test(title)) return false;
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 3) return false;
    return words.every((word) => /^\p{L}+$/u.test(word));
  }

  function chip(text) {
    return /^(?:group|קבוצה)(?:\s+(?:chat|conversation))?$/i.test(String(text || '').replace(/\s+/g, ' ').trim());
  }

  // "3 members" / "participants" / "Add people" as the whole text of a
  // header or subtitle element. A word inside a name is not this.
  function memberLine(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/^add people$/i.test(t)) return true;
    return /^(?:\d{1,4}\s+)?(?:members|participants|משתתפים)$/i.test(t);
  }

  // structural: chip, second person, member subtitle, punctuation.
  // wordVeto: a group word that a person-shaped title is allowed to cancel.
  // proved: profile link, matching thread id, or one-person panel.
  function verdict(facts) {
    const f = facts || {};
    const title = String(f.title || '').replace(/\s+/g, ' ').trim();
    const shaped = personShaped(title) && !counts(title);
    const wordVeto = Boolean(f.wordVeto) && !shaped;
    if (f.structural || wordVeto || counts(title)) return 'group';
    if (f.proved) return 'one-to-one';
    return 'unknown';
  }

  return { counts, personShaped, chip, memberLine, verdict };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowGroupWord = FlowGroupWord;
if (typeof module !== 'undefined' && module.exports) module.exports = { FlowGroupWord };
