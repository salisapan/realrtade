/* One place for the few values that change without a redesign.
   chromeStoreUrl: paste the Chrome Web Store listing URL here once Glance is
   published (https://chromewebstore.google.com/detail/...). While it is empty,
   the site offers the zip download with the short "load unpacked" steps. Once
   it is set, every "Get Glance" path switches to a one-click "Add to Chrome"
   and the manual steps disappear.
   Expected store item id after upload of dist/glance-cws.zip:
   lbihckfmoffgjjlnneoeaehbhoonfenh (see docs/cws-owner-handoff.md). */
window.FLOW_CONFIG = {
  chromeStoreUrl: '',
  // WhatsApp Cloud number, digits with country code and no +. Leave empty to
  // hide the floating inquiry button. Never commit a live number here until
  // the owner has approved a deploy and registered the 019 number.
  whatsappNumber: ''
};
