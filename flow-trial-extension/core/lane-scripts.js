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
  const CHAT_CARD_TAIL = ['src/chip-host.js', 'src/chat-task-card.js'];
  const DEFAULT_CHAT_SKIP = ['src/follow.js', 'src/chip-peek.js'];

  function engineBase(manifestScripts) {
    return (manifestScripts || []).filter((f) => GMAIL_ONLY_SCRIPTS.indexOf(f) < 0);
  }

  function unique(list) {
    const out = [];
    (list || []).forEach((f) => { if (f && out.indexOf(f) < 0) out.push(f); });
    return out;
  }

  // Same shape as background.js laneChatScripts(lane): manifest engine base, lane files, card stack.
  function chatLaneRegistrationJs(manifestScripts, laneTail, skip) {
    const skipList = skip || DEFAULT_CHAT_SKIP;
    const base = engineBase(manifestScripts).filter((f) => skipList.indexOf(f) < 0);
    return unique(base.concat(laneTail || []).concat(CHAT_CARD_TAIL));
  }

  function whatsappLaneJs(manifestScripts, engineOn, laneTail, skip) {
    return chatLaneRegistrationJs(manifestScripts, laneTail, skip);
  }

  return {
    GMAIL_ONLY_SCRIPTS: GMAIL_ONLY_SCRIPTS,
    LEAN_CHAT_BASE: LEAN_CHAT_BASE,
    WHATSAPP_TAIL: WHATSAPP_TAIL,
    CHAT_CARD_TAIL: CHAT_CARD_TAIL,
    DEFAULT_CHAT_SKIP: DEFAULT_CHAT_SKIP,
    engineBase: engineBase,
    chatLaneRegistrationJs: chatLaneRegistrationJs,
    whatsappLaneJs: whatsappLaneJs
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowLaneScripts };
else if (typeof globalThis !== 'undefined') globalThis.FlowLaneScripts = FlowLaneScripts;
