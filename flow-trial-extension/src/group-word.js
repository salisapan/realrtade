// One group rule for Messenger and Instagram. No name lists.
// A person-shaped title (1–3 words, letters only, no digits or emoji) is a
// one-to-one chat. A title is a group only when it is the group word and
// nothing else ("Team", "צוות", "הצוות"). A chip, a second participant, a
// member count, or "3 members" is decided by the parser.
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

  return { counts, personShaped, chip };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowGroupWord = FlowGroupWord;
if (typeof module !== 'undefined' && module.exports) module.exports = { FlowGroupWord };
