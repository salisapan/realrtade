# M2 Outlook OneDrive find + local file — requests to C1 / shared owner

Do **not** land these edits on `cursor/m2-onedrive-find-local-4978`. Apply on CA1 / shared branch.

## 1. `src/background.js` — SURFACES.outlook.extra (≈278–279)

Add before `src/content-outlook.js`:

```diff
     extra: ['core/owa-parse.js', 'core/draft-reply.js', 'core/graph-mail.js', 'core/outlook-config.js', 'core/outlook-auth.js',
-      'core/outlook-calendar.js', 'core/outlook-sync.js', 'src/outlook.js', 'src/chip-host.js', 'src/content-outlook.js'],
+      'core/outlook-calendar.js', 'core/outlook-sync.js', 'core/onedrive-find.js', 'core/local-file.js',
+      'src/outlook.js', 'src/chip-host.js', 'src/outlook-m2-close.js', 'src/content-outlook.js'],
```

Without this line, `FlowOutlookM2Close` / `FlowOnedriveFind` are undefined in the page; settle stays quiet (switches still default off).

## 2. `src/background.js` — service worker imports (after `onedrive-new-file.js`, ≈67)

```diff
 import '../core/onedrive-new-file.js';
+import '../core/onedrive-find.js';
+import '../core/local-file.js';
+import '../src/outlook-m2-close.js';
```

## 3. `src/background.js` — WRITERS / UNDOERS (≈6481–6501)

```diff
 const WRITERS = {
   outlookDraft: outlookDraftWrite, outlookCalendar: outlookCalendarWrite,
-  onedriveFile: outlookFileWrite, onedriveNewFile: onedriveNewFileWrite, outlookEventCallLink: eventLinkWrite,
+  onedriveFile: outlookFileWrite, onedriveNewFile: onedriveNewFileWrite, onedriveFindAttach: onedriveFindAttachWrite,
+  localFileToOnedrive: localFileToOnedriveWrite, outlookEventCallLink: eventLinkWrite,
 };
 ...
 const UNDOERS = {
   outlookDraft: outlookDraftUndo, outlookCalendar: outlookCalendarUndo,
-  onedriveFile: outlookFileUndo, onedriveNewFile: onedriveNewFileUndo, outlookEventCallLink: eventLinkUndo,
+  onedriveFile: outlookFileUndo, onedriveNewFile: onedriveNewFileUndo, onedriveFindAttach: onedriveFindUndo,
+  localFileToOnedrive: localFileToOnedriveUndo, outlookEventCallLink: eventLinkUndo,
 };
```

Add handlers (pattern matches `onedriveNewFileWrite`):

```javascript
async function onedriveFindAttachWrite(p) {
  const M2 = globalThis.FlowOutlookM2Close;
  if (!M2) return { ok: false, reason: 'not-configured' };
  const on = await glanceSwitchOn('ONEDRIVE_FIND');
  const r = await M2.onedriveFindAttachWrite(outlookFetch, { flags: { ONEDRIVE_FIND: on }, params: (p && p.params) || {} });
  return r && r.ok ? Object.assign({}, r, { fetchedBack: true }) : (r || { ok: false, reason: 'write-failed' });
}
async function onedriveFindUndo(ref) {
  const M2 = globalThis.FlowOutlookM2Close;
  if (!M2) return { ok: false };
  return M2.onedriveFindUndo(outlookFetch, ref);
}
async function localFileToOnedriveWrite(p) {
  const M2 = globalThis.FlowOutlookM2Close;
  if (!M2) return { ok: false, reason: 'not-configured' };
  const on = await glanceSwitchOn('LOCAL_FILE_CLOSE');
  // Host must supply folder read + digest (File System Access or native bridge).
  const hostIo = { source: globalThis.__glanceLocalFileSource, digest: globalThis.__glanceLocalFileDigest };
  const r = await M2.localFileSaveWrite(outlookFetch, { flags: { LOCAL_FILE_CLOSE: on }, params: (p && p.params) || {} }, hostIo);
  return r && r.ok ? Object.assign({}, r, { fetchedBack: true }) : (r || { ok: false, reason: 'write-failed' });
}
async function localFileToOnedriveUndo(ref) {
  const M2 = globalThis.FlowOutlookM2Close;
  if (!M2) return { ok: false };
  return M2.localFileUndo(outlookFetch, ref);
}
```

## 4. `core/file-attach.js` (end of file)

Outlook surface scripts are separate files in one isolated world; export the gate to `globalThis` (same pattern as `onedrive-find.js`):

```diff
 if (typeof module !== 'undefined') module.exports = { FlowFileAttach };
+else if (typeof globalThis !== 'undefined') globalThis.FlowFileAttach = FlowFileAttach;
```

(M2 branch includes this line; C1 can keep it when merging.)

## 5. Optional: `glanceSwitches` / popup copy

Document `ONEDRIVE_FIND` and `LOCAL_FILE_CLOSE` (default off) wherever other owner switches are listed.
