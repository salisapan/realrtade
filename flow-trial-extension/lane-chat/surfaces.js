// Click-only chat surfaces. PR-0 owns the full on-demand trigger; PR-M registers Messenger here.
(function () {
  const MESSENGER_ORIGINS = [
    'https://www.messenger.com/*',
    'https://messenger.com/*',
    'https://www.facebook.com/messages',
    'https://www.facebook.com/messages/*',
    'https://facebook.com/messages',
    'https://facebook.com/messages/*'
  ];

  const SURFACES = [
    {
      id: 'messenger',
      switchId: 'MESSENGER_CLICK_LANE',
      killSurface: 'messenger',
      laneId: 'glance-lane-messenger',
      origins: MESSENGER_ORIGINS,
      contentScript: 'src/content-messenger.js',
      enabled: false
    },
    {
      id: 'instagram',
      switchId: 'INSTAGRAM_CLICK_LANE',
      killSurface: 'instagram',
      laneId: 'glance-lane-instagram',
      origins: [
        'https://www.instagram.com/direct',
        'https://www.instagram.com/direct/*',
        'https://instagram.com/direct',
        'https://instagram.com/direct/*'
      ],
      contentScript: 'src/content-instagram.js',
      enabled: false
    }
  ];

  function byId(id) {
    return SURFACES.find((row) => row.id === id) || null;
  }

  globalThis.FlowChatSurfaces = {
    SURFACES: SURFACES,
    byId: byId,
    messengerOrigins: MESSENGER_ORIGINS.slice()
  };
})();
