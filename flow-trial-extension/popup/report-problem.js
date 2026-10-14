// Side-panel footer. The mailto carries the installed version and the build
// sha in the subject. It does not attach a message, a thread, or any mail text.
import { BUILD_SHA, PRIVACY_URL, REPORT_EMAIL } from '../config/release.public.js';

function manifestVersion() {
  try {
    return chrome.runtime.getManifest().version || '';
  } catch (e) {
    return '';
  }
}

export function reportMailto(email, version, sha) {
  const subject = ['Glance', version, sha].filter(Boolean).join(' ');
  return 'mailto:' + email + '?subject=' + encodeURIComponent(subject);
}

if (typeof document !== 'undefined') {
  const report = document.getElementById('reportProblem');
  if (report) {
    report.href = reportMailto(REPORT_EMAIL, manifestVersion(), BUILD_SHA);
  }

  const privacy = document.getElementById('privacyLink');
  if (privacy && PRIVACY_URL) {
    privacy.href = PRIVACY_URL;
  }
}
