// One group-word rule for Messenger and Instagram.
// A group word counts only when it is the first token (Team Alpha, צוות מכירות),
// or the last token and the word before it is not a first name (Sales Team).
// Anna Team, Russell Crew, and Dept Smith are people. A word in parentheses
// after a name, as in Dana Levi (Staff), does not count. Hebrew stems take a
// ב / ל / ה / ו prefix. Another signal (a Group chip, a second person, a
// member count) is decided by the parser, not here.
const FlowGroupWord = (() => {
  const EN = new Set(['members', 'participants', 'family', 'department', 'dept', 'team', 'group', 'squad', 'crew', 'staff']);
  const HE = new Set(['מחלקת', 'מחלקה', 'משתתפים', 'משפחה', 'קבוצתי', 'קבוצת', 'קבוצה', 'צוות']);
  const FIRST = new Set([
    'anna', 'john', 'russell', 'dana', 'maria', 'james', 'olivia', 'noah', 'emma', 'liam',
    'sophia', 'mason', 'isabella', 'ethan', 'mia', 'lucas', 'charlotte', 'benjamin', 'amelia', 'henry',
    'harper', 'jack', 'evelyn', 'alexander', 'abigail', 'daniel', 'ella', 'matthew', 'scarlett', 'david',
    'michael', 'sarah', 'robert', 'jennifer', 'noa', 'yael'
  ]);
  const SURNAME = new Set([
    'smith', 'jones', 'brown', 'davis', 'wilson', 'taylor', 'anderson', 'thomas', 'moore', 'martin',
    'lee', 'white', 'harris', 'clark', 'lewis', 'walker', 'hall', 'young', 'king', 'wright', 'levi'
  ]);

  function letters(word) {
    return String(word || '').replace(/[^\p{L}]/gu, '');
  }

  function isGroupToken(word) {
    const raw = letters(word);
    if (!raw) return false;
    if (EN.has(raw.toLowerCase())) return true;
    if (HE.has(raw)) return true;
    const prefixed = raw.match(/^([בלהו]{1,3})(.+)$/u);
    return Boolean(prefixed && HE.has(prefixed[2]));
  }

  function counts(text) {
    const bare = String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!bare) return false;
    const tokens = bare.split(' ').filter(Boolean);
    if (!tokens.length) return false;
    if (isGroupToken(tokens[0])) {
      if (tokens.length === 1) return true;
      const next = letters(tokens[1]).toLowerCase();
      if (FIRST.has(next) || SURNAME.has(next)) return false;
      return true;
    }
    if (tokens.length >= 2 && isGroupToken(tokens[tokens.length - 1])) {
      const prev = letters(tokens[tokens.length - 2]).toLowerCase();
      if (FIRST.has(prev)) return false;
      return true;
    }
    return false;
  }

  return { counts };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowGroupWord = FlowGroupWord;
if (typeof module !== 'undefined' && module.exports) module.exports = { FlowGroupWord };
