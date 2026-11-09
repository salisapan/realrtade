/* One place for the few values that change without a redesign.
   chromeStoreUrl: paste the Chrome Web Store listing URL here once Glance is
   published (https://chromewebstore.google.com/detail/...). While it is empty,
   the site offers the zip download with the short "load unpacked" steps. Once
   it is set, every "Get Glance" path switches to a one-click "Add to Chrome"
   and the manual steps disappear.
   Expected store item id after upload of dist/glance-cws.zip:
   lbihckfmoffgjjlnneoeaehbhoonfenh (see docs/cws-owner-handoff.md). */
window.FLOW_CONFIG = { chromeStoreUrl: '' };
