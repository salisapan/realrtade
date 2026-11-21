// Chat lane surface registry (PR-0 will own the full on-demand trigger). Each Meta
// chat app registers one row: scripts, origins, feature flag, and kill-switch id.
(function () {
  const SHARED = [
    'core/fact-reply.js',
    'core/close-chains.js',
    'core/chat-kill-switch.js',
    'src/chat-draft.js',
    'src/chat-compose.js',
    'src/chat-redact.js',
    'src/chat-indicator.js',
    'src/chat-lane.js'
  ];

  const SURFACES = [
    {
      id: 'instagram',
      laneScriptId: 'glance-lane-instagram',
      title: 'Instagram',
      brandLineEn: 'for Instagram',
      brandLineHe: 'עובד עם Instagram',
      flag: 'INSTAGRAM_LANE',
      killKey: 'instagram',
      defaultOn: false,
      persistAcrossSessions: false,
      origins: [
        'https://www.instagram.com/direct',
        'https://www.instagram.com/direct/*',
        'https://instagram.com/direct',
        'https://instagram.com/direct/*'
      ],
      js: SHARED.concat([
        'src/lane-draft-store.js',
        'src/group-word.js',
        'src/instagram-parse.js',
        'src/content-instagram.js'
      ])
    },
    {
      id: 'messenger',
      laneScriptId: 'glance-lane-messenger',
      title: 'Messenger',
      brandLineEn: 'for Messenger',
      flag: 'MESSENGER_LANE',
      killKey: 'messenger',
      defaultOn: false,
      persistAcrossSessions: true,
      enabledInSurfaces: false,
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
      js: SHARED.concat([
        'src/lane-draft-store.js',
        'src/group-word.js',
        'src/messenger-parse.js',
        'src/content-messenger.js'
      ])
    },
    {
      id: 'business_suite',
      laneScriptId: 'glance-lane-business-suite',
      title: 'Business Suite',
      flag: null,
      killKey: 'business_suite',
      defaultOn: false,
      enabledInSurfaces: false,
      persistAcrossSessions: false,
      origins: [],
      js: []
    }
  ];

  function byId(id) {
    return SURFACES.find((row) => row.id === id) || null;
  }

  function listEnabled() {
    return SURFACES.filter((row) => row.enabledInSurfaces !== false && row.origins && row.origins.length);
  }

  if (typeof module !== 'undefined') module.exports = { SURFACES, byId, listEnabled };
  else if (typeof globalThis !== 'undefined') globalThis.FlowChatSurfaces = { SURFACES, byId, listEnabled };
})();
