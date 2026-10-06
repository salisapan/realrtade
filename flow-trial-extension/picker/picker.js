// Runs as its own extension page (chrome-extension://.../picker/picker.html),
// opened by background.js's chrome.windows.create — never injected into
// Gmail. Two reasons: Gmail's own CSP has no reason to be relaxed just to
// let Google's gapi loader run there, and chrome.windows/chrome.tabs (which
// background.js uses to open this window and route its result back to the
// right Gmail tab) aren't available to a content script at all.
//
// Deliberately minimal, matching every other write path in this extension:
// pick ONE file, hand back its id/name/mimeType, done. No multi-select, no
// search UI beyond what the Picker widget itself already offers, no
// semantic ranking of "which file did they mean" — that judgment call (see
// content-gmail.js's disambiguation prompt) happens before this page ever
// opens, not inside it.

// TODO(owner): create an API key in Google Cloud Console (APIs & Services >
// Credentials > Create Credentials > API key), restrict it to the Google
// Picker API, and paste it here. Separate credential from the OAuth Client
// ID in manifest.json — the Picker widget itself is loaded and rendered by
// Google's own gapi.picker library, which authenticates the *widget* with
// this API key and *file access* with the OAuth token fetched below.
// Nothing outside this page needs the key, so it lives only here — fetching
// the picked file's actual bytes afterward is still background.js's job,
// using the OAuth token it already holds.
const GOOGLE_PICKER_API_KEY = 'YOUR_GOOGLE_PICKER_API_KEY';

const requestId = new URLSearchParams(location.search).get('requestId');
const statusEl = document.getElementById('status');

function showError(message) {
  statusEl.textContent = message;
  statusEl.className = 'state err';
}

// Always tells background.js what happened (even "nothing, they cancelled")
// before closing — background.js's own chrome.windows.onRemoved listener is
// only the fallback for when this page never gets the chance to (crashed,
// force-closed), not the primary path.
function finish(file, cancelled) {
  chrome.runtime.sendMessage(
    { type: 'flow:drive-file-picked', payload: { requestId, file: file || null, cancelled: Boolean(cancelled) } },
    () => window.close()
  );
}

if (!requestId) {
  showError('This window was opened without a file request to fulfill. You can close it.');
} else if (!GOOGLE_PICKER_API_KEY || GOOGLE_PICKER_API_KEY === 'YOUR_GOOGLE_PICKER_API_KEY') {
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
  // A single default browsing/search view — not stacking multiple Picker
  // views (uploads, recents, a custom query view) — is what keeps this "pick
  // one file" rather than a small Drive file manager. setSelectFolderEnabled
  // stays false: a folder isn't an attachable file.
  const view = new google.picker.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);

  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(token)
    .setDeveloperKey(GOOGLE_PICKER_API_KEY)
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
