// Teams web host consent. The popup asks from the tick and from התחבר.
// A refusal unticks the box, shows the Hebrew line, and leaves the button usable.
const FlowTeamsHostConsent = (() => {
  const DENIED_HE = 'הדפדפן לא נתן גישה ל-Teams. Glance לא קורא את הצ׳אט.';
  const PRIVACY_HE = 'Glance קורא את הצ׳אט האישי הפתוח ב-Teams ומניח תשובה רק בתיבת הכתיבה. הוא לא שולח, וביטול מוחק כל כתיבה שהוא עשה.';

  function paintDenial(ui) {
    const box = ui && ui.box;
    const note = ui && ui.note;
    const button = ui && ui.button;
    if (box) box.checked = false;
    if (note) {
      note.hidden = false;
      note.textContent = DENIED_HE;
    }
    if (button) button.disabled = false;
    return false;
  }

  async function ask(request, ui) {
    let granted = false;
    try { granted = Boolean(await request()); } catch (e) { granted = false; }
    if (!granted) return paintDenial(ui);
    return true;
  }

  return { DENIED_HE: DENIED_HE, PRIVACY_HE: PRIVACY_HE, paintDenial: paintDenial, ask: ask };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowTeamsHostConsent = FlowTeamsHostConsent;
if (typeof module !== 'undefined') module.exports = { FlowTeamsHostConsent };
