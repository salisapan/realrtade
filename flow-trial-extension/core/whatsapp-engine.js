// WhatsApp Web: optional full follow-up engine on the lane (off by default).
const FlowWhatsappEngine = {
  SWITCH: 'WHATSAPP_ENGINE',
  SWITCH_DEFAULT: false
};

if (typeof module !== 'undefined') module.exports = { FlowWhatsappEngine };
else if (typeof globalThis !== 'undefined') globalThis.FlowWhatsappEngine = FlowWhatsappEngine;
