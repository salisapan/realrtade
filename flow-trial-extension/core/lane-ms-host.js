// Service-worker entry for the Microsoft Graph lane. One background import.
// The import declarations are below the export line: the classic corpus
// harness keeps everything up to that line and drops the rest, and a module
// service worker still loads them. import() is not available there.
const FlowLaneMsHost = true;
if (typeof module !== 'undefined') module.exports = { FlowLaneMsHost };
import './outlook-contacts.js';
import './outlook-word.js';
import './outlook-excel.js';
import './teams-chat.js';
import './outlook-send.js';
