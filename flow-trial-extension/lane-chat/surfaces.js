// Registry for on-demand chat lanes (WhatsApp, Messenger, Instagram). One row per surface.
// W1 owns this file; PR-M and PR-I append entries only here and in background LANE_CHAT ids.
(function () {
  const TRIGGER_JS = ['src/chat-indicator.js', 'src/chat-lane-trigger.js'];
  const LANE_BASE = [
    'core/fact-reply.js',
    'core/close-chains.js',
    'src/chat-redact.js',
    'src/chat-draft.js',
    'src/chat-compose.js',
    'src/chat-lane.js'
  ];

  const SURFACES = [
    {
      key: 'whatsapp',
      id: 'glance-lane-whatsapp',
      origins: ['https://web.whatsapp.com/*'],
      laneJs: LANE_BASE.concat(['src/whatsapp-parse.js', 'src/content-whatsapp.js', 'src/content-whatsapp-draft.js'])
    },
    {
      key: 'messenger',
      id: 'glance-lane-messenger',
      origins: [
        'https://www.messenger.com/*',
        'https://messenger.com/*',
        'https://www.facebook.com/messages',
        'https://www.facebook.com/messages/*',
        'https://facebook.com/messages',
        'https://facebook.com/messages/*',
        'https://business.facebook.com/latest/inbox',
        'https://business.facebook.com/latest/inbox/*',
        'https://www.business.facebook.com/latest/inbox',
        'https://www.business.facebook.com/latest/inbox/*'
      ],
      laneJs: LANE_BASE.concat(['src/lane-draft-store.js', 'src/group-word.js', 'src/messenger-parse.js', 'src/content-messenger.js'])
    },
    {
      key: 'instagram',
      id: 'glance-lane-instagram',
      origins: [
        'https://www.instagram.com/direct',
        'https://www.instagram.com/direct/*',
        'https://instagram.com/direct',
        'https://instagram.com/direct/*'
      ],
      laneJs: LANE_BASE.concat(['src/group-word.js', 'src/instagram-parse.js', 'src/content-instagram.js'])
    }
  ];

  function matchSurface(url) {
    const href = String(url || '');
    for (const row of SURFACES) {
      for (const origin of row.origins) {
        const prefix = origin.replace(/\*$/, '');
        if (href.indexOf(prefix) === 0) return row;
      }
    }
    return null;
  }

  globalThis.FlowLaneChatSurfaces = {
    TRIGGER_JS: TRIGGER_JS,
    LANE_BASE: LANE_BASE,
    SURFACES: SURFACES,
    matchSurface: matchSurface
  };
})();
