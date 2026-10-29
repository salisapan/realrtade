// v1 manifest scope gates for Playwright (drive.readonly and gmail.compose are off).
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
    testIfDriveReadonly(title, fn) {
      (driveReadonlyInManifest ? test : test.skip)(title, fn);
    },
    testIfGmailCompose(title, fn) {
      (gmailComposeInManifest ? test : test.skip)(title, fn);
    }
  };
}

module.exports = {
  bind,
  driveReadonlyInManifest,
  gmailComposeInManifest
};
