// Lane wrapper. Chrome loads src/background.js from manifest.json. This file
// imports that worker and then the lane, which adds its own listener for
// lane messages. There is no second manifest.
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
