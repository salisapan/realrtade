// Consent copy for W4 (WhatsApp Business Cloud). Shown before linking a business number.
const FlowWaBusinessConsent = (() => {
  const COPY = {
    en: {
      title: 'WhatsApp Business (Cloud)',
      lead: 'Glance closes open loops. Gmail is where it starts today.',
      body: [
        'Business messages arrive through Meta\'s official WhatsApp Cloud API while you keep using the WhatsApp Business app on your phone (Coexistence).',
        'Glance reads those inbound messages from your linked business number, detects what needs a reply, and offers one Do It that prepares a draft for you to review.',
        'Glance never sends a WhatsApp message for you. There is no automatic send in this build.',
        'Sensitive details are masked before any deeper model read.',
      ].join(' '),
    },
    he: {
      title: 'WhatsApp Business (ענן)',
      lead: 'Glance סוגר לולאות פתוחות. Gmail הוא המקום שבו הוא מתחיל היום.',
      body: [
        'הודעות עסקיות מגיעות דרך WhatsApp Cloud API הרשמי של Meta, בזמן שאתה ממשיך להשתמש באפליקציית WhatsApp Business בטלפון (Coexistence).',
        'Glance קורא את ההודעות הנכנסות למספר העסקי המקושר, מזהה מה דורש מענה, ומציע Do It אחד שמכין טיוטה לבדיקה שלך.',
        'Glance לא שולח הודעת WhatsApp בשמך. אין שליחה אוטומטית בגרסה הזו.',
        'פרטים רגישים ממוסכים לפני כל קריאה עמוקה יותר של מודל.',
      ].join(' '),
    },
  };
  function lines(lang) {
    return COPY[lang === 'he' ? 'he' : 'en'];
  }
  return { COPY, lines };
})();
if (typeof module !== 'undefined') module.exports = { FlowWaBusinessConsent };
