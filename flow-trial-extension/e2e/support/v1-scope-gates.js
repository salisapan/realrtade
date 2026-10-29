// v1 manifest scope gates for Playwright (drive.readonly and gmail.compose are off in RC).
// Every gated spec always runs: when the scope is off, fnOff asserts fail-closed behaviour.
const manifest = require('../../manifest.json');
const scopes = new Set((manifest.oauth2 && manifest.oauth2.scopes) || []);
const DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
const GMAIL_COMPOSE = 'https://www.googleapis.com/auth/gmail.compose';

const v1HasDriveReadonly = scopes.has(DRIVE_READONLY);
const v1HasGmailCompose = scopes.has(GMAIL_COMPOSE);

const driveReadonlyInManifest = v1HasDriveReadonly;
const gmailComposeInManifest = v1HasGmailCompose;

function bind(test) {
  function registerGated(title, scopeOn, fnOn, fnOff) {
    if (!fnOff) throw new Error('v1 scope gate requires fnOff fail-closed body');
    test(title, async ({ glance }, testInfo) => {
      const ctx = { glance };
      if (scopeOn) return fnOn(ctx, testInfo);
      return fnOff(ctx, testInfo);
    });
  }

  return {
    driveReadonlyInManifest,
    gmailComposeInManifest,
    /** @deprecated use testWhenCompose */
    testIfGmailCompose(title, fnOn, fnOff) {
      registerGated(title, v1HasGmailCompose, fnOn, fnOff);
    },
    /** @deprecated use testWhenDriveReadonly */
    testIfDriveReadonly(title, fnOn, fnOff) {
      registerGated(title, v1HasDriveReadonly, fnOn, fnOff);
    },
    testWhenCompose(title, fnOn, fnOff) {
      registerGated(title, v1HasGmailCompose, fnOn, fnOff);
    },
    testWhenDriveReadonly(title, fnOn, fnOff) {
      registerGated(title, v1HasDriveReadonly, fnOn, fnOff);
    }
  };
}

module.exports = {
  bind,
  driveReadonlyInManifest,
  gmailComposeInManifest
};
