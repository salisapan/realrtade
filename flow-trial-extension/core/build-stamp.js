// One build stamp, loaded by the service worker and by the page.
// The panel compares the two. A worker that is still the previous registration
// does not match, and the panel says so. This is not chrome.runtime.getManifest.
const FlowBuild = (() => {
  const STAMP = '0.9.56';
  // Packaged installs set this false when picker/ is omitted (scripts/package_trial_extension.py).
  const PICKER_BUNDLED = true;
  const PICKER_KEY_PLACEHOLDER = 'YOUR_GOOGLE_PICKER_API_KEY';
  // «עדכן מסמך קיים» opens the Picker. It is available only when picker/ is in
  // the package and the key is a real one. A placeholder key is a dead click.
  function pickerUpdateAvailable(bundled, key) {
    const k = String(key == null ? '' : key).trim();
    return bundled === true && k.length > 0 && k !== PICKER_KEY_PLACEHOLDER;
  }
  return { STAMP: STAMP, PICKER_BUNDLED: PICKER_BUNDLED, PICKER_KEY_PLACEHOLDER: PICKER_KEY_PLACEHOLDER, pickerUpdateAvailable: pickerUpdateAvailable };
})();

if (typeof module === 'undefined' && typeof console !== 'undefined') console.log('Glance build ' + FlowBuild.STAMP);

if (typeof module !== 'undefined') module.exports = { FlowBuild };
else if (typeof globalThis !== 'undefined') globalThis.FlowBuild = FlowBuild;
