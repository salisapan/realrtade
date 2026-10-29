// v1 manifest scope gates for Playwright (drive.readonly and gmail.compose are off in RC).
// Every gated spec always runs: when the scope is off, fnOff asserts fail-closed behaviour.
const manifest = require('../../manifest.json');
const scopes = new Set((manifest.oauth2 && manifest.oauth2.scopes) || []);
const DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
const GMAIL_COMPOSE = 'https://www.googleapis.com/auth/gmail.compose';

const driveReadonlyInManifest = scopes.has(DRIVE_READONLY);
const gmailComposeInManifest = scopes.has(GMAIL_COMPOSE);

function bind(test) {
  return {
    driveReadonlyInManifest,
    gmailComposeInManifest,
    /** @deprecated use testWhenCompose */
    testIfGmailCompose(title, fnOn, fnOff) {
      if (!fnOff) throw new Error('testWhenCompose requires fnOff fail-closed body');
      test(title, async (ctx) => {
        if (gmailComposeInManifest) return fnOn(ctx);
        return fnOff(ctx);
      });
    },
    /** @deprecated use testWhenDriveReadonly */
    testIfDriveReadonly(title, fnOn, fnOff) {
      if (!fnOff) throw new Error('testWhenDriveReadonly requires fnOff fail-closed body');
      test(title, async (ctx) => {
        if (driveReadonlyInManifest) return fnOn(ctx);
        return fnOff(ctx);
      });
    },
    testWhenCompose(title, fnOn, fnOff) {
      test(title, async (ctx) => {
        if (gmailComposeInManifest) return fnOn(ctx);
        return fnOff(ctx);
      });
    },
    testWhenDriveReadonly(title, fnOn, fnOff) {
      test(title, async (ctx) => {
        if (driveReadonlyInManifest) return fnOn(ctx);
        return fnOff(ctx);
      });
    }
  };
}

module.exports = {
  bind,
  driveReadonlyInManifest,
  gmailComposeInManifest
};
