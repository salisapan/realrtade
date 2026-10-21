// Extension page shell: chrome.identity + sandbox iframe (remote gapi lives in sandbox.html).

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

function mountSandbox(token) {
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('picker/sandbox.html');
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
  document.body.appendChild(frame);
  const init = () => {
    try {
      frame.contentWindow.postMessage({
        type: 'glance-picker-init',
        requestId,
        token,
        apiKey: GOOGLE_PICKER_API_KEY,
        appId: PICKER_APP_ID
      }, '*');
    } catch (e) {
      showError('Could not start the Drive picker.');
    }
  };
  frame.addEventListener('load', init);
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.requestId !== requestId) return;
    if (data.type === 'glance-picker-result') finish(data.file, data.cancelled);
    if (data.type === 'glance-picker-error') showError(data.error || 'Drive picker failed.');
  });
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
    statusEl.hidden = true;
    mountSandbox(token);
  });
}
