/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'action',
  name: 'GlanceAction',
  bundleIdentifier: 'com.theflowai.glance.action',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.theflowai.glance']
  }
};
