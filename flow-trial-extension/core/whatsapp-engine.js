// WhatsApp Web: optional X1 chat-task engine (incoming judge + task card) on the lane (off by default).
// Place/fact drafts into the composer always run; script lists stay the same on or off.
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
