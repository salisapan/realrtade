// UI strings for the Workspace card. Language comes from the user locale,
// not from the language of the open mail. Hebrew is wrapped by the card
// builder with bidi marks so a fixed card layout stays readable.

var GlanceI18n = (function () {
  var STR = {
    en: {
      doIt: 'Do it',
      undo: 'Undo',
      couldntConfirm: "Couldn't confirm",
      couldntRead: "Couldn't read this message.",
      diag: 'diag',
      edited: "The task was edited, so I won't undo it",
      quiet: 'Nothing to close.',
      quietEmpty: 'Nothing to close in this email.',
      spottedPrefix: 'Spotted, not supported yet: ',
      remindMe: 'Remind me',
      build: 'Build',
      openMessage: 'Open a message.',
      next: 'Next',
      due: 'Due',
      inTasks: 'In Google Tasks.',
      undone: 'Undone.',
      id: 'Id',
      calendarHold: 'Calendar hold',
      when: 'When',
      onCalendar: 'On your calendar.',
      schedule: 'Calendar and a reminder.',
      editedEvent: "The event was edited, so I won't undo it",
      grant: 'Grant permission',
      notThis: 'Not this'
    },
    he: {
      doIt: 'בצע',
      undo: 'בטל',
      couldntConfirm: 'לא הצלחתי לאשר',
      couldntRead: 'לא הצלחתי לקרוא את ההודעה.',
      diag: 'diag',
      edited: 'המשימה נערכה, אז לא אבטל אותה',
      quiet: 'אין מה לסגור.',
      quietEmpty: 'אין מה לסגור בהודעה הזו.',
      spottedPrefix: 'זוהה, עדיין לא נתמך: ',
      remindMe: 'תזכירו לי',
      build: 'בנייה',
      openMessage: 'פתחו הודעה.',
      next: 'הפעולה הבאה',
      due: 'יעד',
      inTasks: 'ב-Google Tasks.',
      undone: 'בוטל.',
      id: 'מזהה',
      calendarHold: 'החזקה ביומן',
      when: 'מתי',
      onCalendar: 'ביומן.',
      schedule: 'יומן ותזכורת.',
      editedEvent: 'האירוע נערך, אז לא אבטל אותו',
      grant: 'תנו הרשאה',
      notThis: 'לא זה'
    }
  };

  function locale(userLocale) {
    var value = String(userLocale || '').toLowerCase().replace('_', '-');
    var primary = value.split('-')[0];
    if (primary === 'he' || primary === 'iw') return 'he';
    return 'en';
  }

  function t(lang, key) {
    var pack = STR[lang] || STR.en;
    return pack[key] || STR.en[key] || '';
  }

  function rtl(lang) {
    return lang === 'he';
  }

  // Right-to-left embedding for a whole Hebrew line. Card Service has no
  // dir attribute, so the mark travels with the string.
  function embed(lang, text) {
    var value = String(text == null ? '' : text);
    if (lang !== 'he' || !value) return value;
    return '\u202B' + value + '\u202C';
  }

  function isolateLtr(text) {
    return '\u2066' + String(text == null ? '' : text) + '\u2069';
  }

  return { STR: STR, locale: locale, t: t, rtl: rtl, embed: embed, isolateLtr: isolateLtr };
})();

if (typeof module !== 'undefined') module.exports = GlanceI18n;
