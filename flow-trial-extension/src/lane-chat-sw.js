// Service worker entry for the chat draft lane.
//
// background.js is imported unchanged. Open pull requests own that file, the
// popup, and several core modules, so this lane does not edit them. Chrome
// loads this file instead, the existing worker runs as before, and
// lane-chat-worker.js adds one listener for flow:chat-evidence.
import './background.js';
import './lane-chat-worker.js';
