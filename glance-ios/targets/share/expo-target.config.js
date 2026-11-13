/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'share',
  name: 'GlanceShare',
  bundleIdentifier: 'com.theflowai.glance.share',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.theflowai.glance']
  }
};
