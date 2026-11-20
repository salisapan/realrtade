// Teams web host consent. The popup asks from the tick and from התחבר.
// A refusal unticks the box, shows the Hebrew line, and leaves the button usable.
const FlowTeamsHostConsent = (() => {
  const DENIED_HE = 'הדפדפן לא נתן גישה ל-Teams. Glance לא קורא את הצ׳אט.';
  const OFF_HE = 'Teams כבוי. Glance לא קורא את הצ׳אט.';
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

  function paintOff(ui) {
    const box = ui && ui.box;
    const note = ui && ui.note;
    const button = ui && ui.button;
    if (box) box.checked = false;
    if (note) {
      note.hidden = false;
      note.textContent = OFF_HE;
    }
    if (button) button.disabled = false;
    return true;
  }

  async function ask(request, ui) {
    let granted = false;
    try { granted = Boolean(await request()); } catch (e) { granted = false; }
    if (!granted) return paintDenial(ui);
    return true;
  }

  // remove() has to run on this turn, before the first await, so the browser still sees the click.
  function release(remove, ui) {
    let pending = Promise.resolve(false);
    try { pending = Promise.resolve(remove()); } catch (e) { pending = Promise.resolve(false); }
    return pending.then((ok) => { paintOff(ui); return Boolean(ok); }, () => { paintOff(ui); return false; });
  }

  return {
    DENIED_HE: DENIED_HE,
    OFF_HE: OFF_HE,
    PRIVACY_HE: PRIVACY_HE,
    paintDenial: paintDenial,
    paintOff: paintOff,
    ask: ask,
    release: release
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowTeamsHostConsent = FlowTeamsHostConsent;
if (typeof module !== 'undefined') module.exports = { FlowTeamsHostConsent };
