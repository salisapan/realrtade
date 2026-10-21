// Runs as its own extension page (chrome-extension://.../picker/picker.html),
// opened by background.js's chrome.windows.create — never injected into
// Gmail. The Picker widget loads Google's gapi script (see manifest sandbox).

import { GOOGLE_PICKER } from '../config/google-picker.public.js';

const GOOGLE_PICKER_API_KEY = GOOGLE_PICKER.pickerApiKey;
const PICKER_APP_ID = GOOGLE_PICKER.pickerAppId;

const requestId = new URLSearchParams(location.search).get('requestId');
const statusEl = document.getElementById('status');

function showError(message) {
  statusEl.textContent = message;
  statusEl.className = 'state err';
}

function finish(file, cancelled) {
  chrome.runtime.sendMessage(
    { type: 'flow:drive-file-picked', payload: { requestId, file: file || null, cancelled: Boolean(cancelled) } },
    () => window.close()
  );
}

if (!requestId) {
  showError('This window was opened without a file request to fulfill. You can close it.');
} else if (!GOOGLE_PICKER_API_KEY) {
  showError('The Drive picker isn’t set up yet — an administrator needs to add a Google Picker API key.');
} else {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      showError('Could not connect to your Google account. Close this window and try again.');
      return;
    }
    loadGapi(token);
  });
}

function loadGapi(token) {
  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.onload = () => gapi.load('picker', () => openPicker(token));
  script.onerror = () => showError('Could not load Google’s picker script. Check your connection and try again.');
  document.head.appendChild(script);
}

function openPicker(token) {
  const view = new google.picker.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);

  const builder = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(token)
    .setDeveloperKey(GOOGLE_PICKER_API_KEY);
  if (PICKER_APP_ID) builder.setAppId(PICKER_APP_ID);

  const picker = builder
    .setCallback((data) => {
      if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs[0];
        finish({ id: doc.id, name: doc.name, mimeType: doc.mimeType }, false);
      } else if (data.action === google.picker.Action.CANCEL) {
        finish(null, true);
      }
    })
    .build();

  statusEl.hidden = true;
  picker.setVisible(true);
}
