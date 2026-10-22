// Script lists for Meta chat lanes. Portable: no chrome.*, no DOM, no network.
const FlowLaneScripts = (() => {
  const GMAIL_ONLY_SCRIPTS = [
    'core/draft-reply.js', 'core/google-config.js', 'core/google-compose.js',
    'src/google-compose-page.js', 'src/content-gmail.js', 'src/sidebar.js', 'src/brief.js', 'src/weekly.js'
  ];
  const LEAN_CHAT_BASE = [
    'core/fact-reply.js', 'core/close-chains.js', 'src/chat-draft.js', 'src/chat-compose.js', 'src/chat-lane.js'
  ];
  const WHATSAPP_TAIL = [
    'src/whatsapp-parse.js', 'src/content-whatsapp.js', 'src/content-whatsapp-draft.js'
  ];

  function engineBase(manifestScripts) {
    return (manifestScripts || []).filter((f) => GMAIL_ONLY_SCRIPTS.indexOf(f) < 0);
  }

  function unique(list) {
    const out = [];
    (list || []).forEach((f) => { if (f && out.indexOf(f) < 0) out.push(f); });
    return out;
  }

  function whatsappLaneJs(manifestScripts, engineOn) {
    if (engineOn) return unique(engineBase(manifestScripts).concat(WHATSAPP_TAIL));
    return unique(LEAN_CHAT_BASE.concat(WHATSAPP_TAIL));
  }

  return {
    GMAIL_ONLY_SCRIPTS: GMAIL_ONLY_SCRIPTS,
    LEAN_CHAT_BASE: LEAN_CHAT_BASE,
    WHATSAPP_TAIL: WHATSAPP_TAIL,
    engineBase: engineBase,
    whatsappLaneJs: whatsappLaneJs
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowLaneScripts };
else if (typeof globalThis !== 'undefined') globalThis.FlowLaneScripts = FlowLaneScripts;
