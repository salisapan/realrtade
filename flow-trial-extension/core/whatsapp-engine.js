// WhatsApp Web: optional place/fact draft engine on the lane (off by default).
// Script lists stay the same on or off; content-whatsapp-draft.js reads this switch at runtime.
const FlowWhatsappEngine = {
  SWITCH: 'WHATSAPP_ENGINE',
  SWITCH_DEFAULT: false,
  isOn(glanceSwitches) {
    const bag = glanceSwitches || {};
    return bag[FlowWhatsappEngine.SWITCH] === true;
  }
};

if (typeof module !== 'undefined') module.exports = { FlowWhatsappEngine };
else if (typeof globalThis !== 'undefined') globalThis.FlowWhatsappEngine = FlowWhatsappEngine;
