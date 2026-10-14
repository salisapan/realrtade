// Full-flavor service worker. Chrome loads this only when manifest.full.json
// is the manifest. background.js stays the file PR #144 edits; this wrapper
// imports it and then the lane, which adds its own listener for lane messages.
import './background.js';
import '../core/google-config.js';
import '../core/google-calendar.js';
import '../core/google-tasks.js';
import '../core/google-drive.js';
import '../core/google-docs.js';
import '../core/google-sheets.js';
import '../core/google-contacts.js';
import '../core/google-compose.js';
import '../core/google-proof.js';
import './google-lane.js';
