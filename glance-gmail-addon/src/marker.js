// Gmail inbox Glance label + star marker. IDs only in PropertiesService — no mail content stored.

var GlanceMarker = (function () {
  var LABEL_NAME = 'Glance';
  var PROCESSED_KEY = 'glanceMarkerProcessed';
  var DISMISSED_KEY = 'glanceMarkerDismissed';
  var UNDO_SNAP_KEY = 'glanceMarkerUndoSnap';
  var MARK_META_KEY = 'glanceMarkerMarkMeta';
  var FIFO_CAP = 2000;
  var MAX_PROP_CHARS = 9216;
  var UNDO_SNAP_CAP = 400;
  var SWEEP_BUDGET_MS = 3 * 60 * 1000;
  var SWEEP_QUERY = 'in:inbox newer_than:2d -label:Glance';
  var SWEEP_LIMIT = 50;

  function userProps() {
    return PropertiesService.getUserProperties();
  }

  function chunkKey(base, index) {
    return base + '__' + index;
  }

  function readChunkedList(base) {
    var props = userProps();
    var out = [];
    for (var i = 0; ; i++) {
      var raw = props.getProperty(chunkKey(base, i));
      if (!raw) break;
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) out = out.concat(parsed);
      } catch (err) { /* skip bad chunk */ }
    }
    return out;
  }

  function writeChunkedList(base, list) {
    var trimmed = list.slice(-FIFO_CAP);
    var props = userProps();
    var chunkIndex = 0;
    var start = 0;
    while (start < trimmed.length) {
      var chunk = [trimmed[start]];
      var encoded = JSON.stringify(chunk);
      var next = start + 1;
      while (next < trimmed.length) {
        var trial = trimmed.slice(start, next + 1);
        var trialEnc = JSON.stringify(trial);
        if (trialEnc.length > MAX_PROP_CHARS) break;
        chunk = trial;
        encoded = trialEnc;
        next++;
      }
      props.setProperty(chunkKey(base, chunkIndex), encoded);
      chunkIndex++;
      start = next;
    }
    for (var c = chunkIndex; ; c++) {
      var k = chunkKey(base, c);
      if (!props.getProperty(k)) break;
      props.deleteProperty(k);
    }
  }

  function readList(key) {
    return readChunkedList(key);
  }

  function writeList(key, list) {
    writeChunkedList(key, list);
  }

  function pushId(key, id) {
    if (!id) return;
    var list = readList(key);
    if (list.indexOf(id) >= 0) {
      writeList(key, list);
      return;
    }
    list.push(id);
    writeList(key, list);
  }

  function hasId(key, id) {
    return readList(key).indexOf(id) >= 0;
  }

  function readMarkMeta() {
    try {
      var raw = userProps().getProperty(MARK_META_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeMarkMeta(map) {
    var keys = Object.keys(map || {});
    if (keys.length > FIFO_CAP) {
      keys.sort();
      var drop = keys.length - FIFO_CAP;
      for (var d = 0; d < drop; d++) delete map[keys[d]];
    }
    var encoded = JSON.stringify(map || {});
    while (encoded.length > MAX_PROP_CHARS && keys.length > 1) {
      delete map[keys[0]];
      keys.shift();
      encoded = JSON.stringify(map);
    }
    userProps().setProperty(MARK_META_KEY, encoded);
  }

  function rememberMarkMeta(messageId, meta) {
    if (!messageId) return;
    var map = readMarkMeta();
    map[String(messageId)] = {
      userHadStar: meta && meta.userHadStar === true
    };
    writeMarkMeta(map);
  }

  function takeMarkMeta(messageId) {
    var map = readMarkMeta();
    var key = String(messageId);
    var meta = map[key] || null;
    if (map[key]) {
      delete map[key];
      writeMarkMeta(map);
    }
    return meta;
  }

  function readUndoSnap() {
    try {
      var raw = userProps().getProperty(UNDO_SNAP_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeUndoSnap(map) {
    var keys = Object.keys(map || {});
    if (keys.length > UNDO_SNAP_CAP) {
      keys.sort();
      var drop = keys.length - UNDO_SNAP_CAP;
      for (var d = 0; d < drop; d++) delete map[keys[d]];
    }
    var encoded = JSON.stringify(map || {});
    while (encoded.length > MAX_PROP_CHARS && keys.length > 1) {
      delete map[keys[0]];
      keys.shift();
      encoded = JSON.stringify(map);
    }
    userProps().setProperty(UNDO_SNAP_KEY, encoded);
  }

  function ensureLabel_(gmailApp) {
    var Gmail = gmailApp || GmailApp;
    var label = Gmail.getUserLabelByName(LABEL_NAME);
    if (label) return label;
    return Gmail.createLabel(LABEL_NAME);
  }

  function latestMessage_(thread) {
    var messages = thread.getMessages();
    if (!messages || !messages.length) return null;
    return messages[messages.length - 1];
  }

  function messageIsStarred_(latest) {
    if (!latest) return false;
    try {
      if (typeof latest.isStarred === 'function') return latest.isStarred() === true;
    } catch (err) { /* ignore */ }
    return false;
  }

  function applyMark_(thread, label, allowLabel) {
    var latest = latestMessage_(thread);
    if (!latest) return { ok: false };
    var userHadStar = messageIsStarred_(latest);
    var starred = false;
    var labeled = false;
    if (allowLabel && label) {
      try {
        label.addToThread(thread);
        labeled = true;
      } catch (err) {
        labeled = false;
      }
    }
    try {
      latest.star();
      starred = true;
    } catch (err2) {
      starred = false;
    }
    return {
      ok: labeled || starred,
      labeled: labeled,
      starred: starred,
      userHadStar: userHadStar,
      glanceStarred: starred && !userHadStar
    };
  }

  function removeMark_(thread, label, meta) {
    var latest = latestMessage_(thread);
    if (label) {
      try { label.removeFromThread(thread); } catch (err) { /* label may be missing */ }
    }
    var userHadStar = meta && meta.userHadStar === true;
    if (latest && !userHadStar) {
      try { latest.unstar(); } catch (err2) { /* ignore */ }
    }
  }

  function installSweepTriggerIfNeeded(scriptApp) {
    var Script = scriptApp || ScriptApp;
    var triggers = Script.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var tr = triggers[i];
      if (tr.getHandlerFunction() === 'sweep' && tr.getEventType() === Script.EventType.CLOCK) {
        return false;
      }
    }
    Script.newTrigger('sweep').timeBased().everyHours(1).create();
    return true;
  }

  function isDismissed(messageId) {
    return hasId(DISMISSED_KEY, messageId);
  }

  function dismiss(messageId) {
    pushId(DISMISSED_KEY, messageId);
  }

  function isProcessed(messageId) {
    return hasId(PROCESSED_KEY, messageId);
  }

  function markProcessed(messageId) {
    pushId(PROCESSED_KEY, messageId);
  }

  function rememberUndoSnap(messageId, snap) {
    var map = readUndoSnap();
    map[String(messageId)] = {
      hadMark: snap && snap.hadMark === true,
      userHadStar: snap && snap.userHadStar === true,
      glanceStarred: snap && snap.glanceStarred === true
    };
    writeUndoSnap(map);
  }

  function takeUndoSnap(messageId) {
    var map = readUndoSnap();
    var key = String(messageId);
    var snap = map[key] || null;
    if (map[key]) {
      delete map[key];
      writeUndoSnap(map);
    }
    return snap;
  }

  function onProofClose(messageId, gmailApp) {
    var Gmail = gmailApp || GmailApp;
    var msg = Gmail.getMessageById(String(messageId));
    if (!msg) return;
    var thread = msg.getThread();
    var label = Gmail.getUserLabelByName(LABEL_NAME);
    var hadMark = label && thread.getLabels().some(function (l) { return l.getName() === LABEL_NAME; });
    var meta = takeMarkMeta(messageId);
    if (!meta) return;
    var glanceStarred = !meta.userHadStar;
    rememberUndoSnap(messageId, { hadMark: hadMark, userHadStar: meta.userHadStar, glanceStarred: glanceStarred });
    removeMark_(thread, label, meta);
  }

  function onUndoRestore(messageId, gmailApp) {
    var snap = takeUndoSnap(messageId);
    if (!snap) return;
    var Gmail = gmailApp || GmailApp;
    var msg = Gmail.getMessageById(String(messageId));
    if (!msg) return;
    var thread = msg.getThread();
    if (snap.hadMark) {
      var label = ensureLabel_(Gmail);
      if (label) {
        try { label.addToThread(thread); } catch (err) { /* label may be missing */ }
      }
      if (snap.glanceStarred && !snap.userHadStar) {
        var latestHadMark = latestMessage_(thread);
        if (latestHadMark) {
          try { latestHadMark.star(); } catch (err2) { /* ignore */ }
        }
      }
      return;
    }
    if (snap.glanceStarred) {
      var latest = latestMessage_(thread);
      if (latest) {
        try { latest.star(); } catch (err) { /* ignore */ }
      }
    }
  }

  function onNotThis(messageId, gmailApp) {
    var Gmail = gmailApp || GmailApp;
    var msg = Gmail.getMessageById(String(messageId));
    if (!msg) return;
    dismiss(String(messageId));
    var meta = takeMarkMeta(messageId);
    if (meta) {
      var thread = msg.getThread();
      var label = Gmail.getUserLabelByName(LABEL_NAME);
      removeMark_(thread, label, meta);
    }
    markProcessed(String(messageId));
  }

  /**
   * deps: { startedMs, gmailApp, searchFn, isClosable(opened), buildOpened(message, readerCtx), readerCtx }
   */
  function sweep(deps) {
    var d = deps || {};
    var started = typeof d.startedMs === 'number' ? d.startedMs : Date.now();
    var Gmail = d.gmailApp || GmailApp;
    var search = d.searchFn || function (q, start, limit) { return Gmail.search(q, start, limit); };
    var readerCtx = d.readerCtx || { ownAddresses: [], ownNames: [], readerEmail: null, toRecipients: [], ccRecipients: [] };
    var buildOpened = d.buildOpened;
    var isClosable = d.isClosable;
    if (!buildOpened || !isClosable) return { scanned: 0, marked: 0, stopped: 'no-deps' };

    var label = null;
    try {
      label = ensureLabel_(Gmail);
    } catch (err) {
      label = null;
    }

    var threads = search(SWEEP_QUERY, 0, SWEEP_LIMIT) || [];
    var marked = 0;
    var scanned = 0;
    for (var i = 0; i < threads.length; i++) {
      if (Date.now() - started > SWEEP_BUDGET_MS) {
        return { scanned: scanned, marked: marked, stopped: 'budget' };
      }
      var thread = threads[i];
      var latest = latestMessage_(thread);
      if (!latest) continue;
      var messageId = String(latest.getId());
      scanned++;
      if (isDismissed(messageId)) continue;
      if (isProcessed(messageId)) continue;

      var opened = buildOpened(latest, readerCtx);
      if (!opened || !isClosable(opened)) {
        markProcessed(messageId);
        continue;
      }

      var result = applyMark_(thread, label, !!label);
      if (result.ok) {
        marked++;
        rememberMarkMeta(messageId, { userHadStar: result.userHadStar });
      }
      markProcessed(messageId);
    }
    return { scanned: scanned, marked: marked, stopped: 'done' };
  }

  return {
    LABEL_NAME: LABEL_NAME,
    FIFO_CAP: FIFO_CAP,
    MAX_PROP_CHARS: MAX_PROP_CHARS,
    SWEEP_BUDGET_MS: SWEEP_BUDGET_MS,
    SWEEP_QUERY: SWEEP_QUERY,
    installSweepTriggerIfNeeded: installSweepTriggerIfNeeded,
    sweep: sweep,
    isDismissed: isDismissed,
    dismiss: dismiss,
    isProcessed: isProcessed,
    markProcessed: markProcessed,
    onProofClose: onProofClose,
    onUndoRestore: onUndoRestore,
    onNotThis: onNotThis,
    _test: {
      readList: readList,
      writeList: writeList,
      pushId: pushId,
      applyMark_: applyMark_,
      removeMark_: removeMark_,
      ensureLabel_: ensureLabel_,
      chunkKey: chunkKey,
      readUndoSnap: readUndoSnap,
      writeUndoSnap: writeUndoSnap,
      rememberMarkMeta: rememberMarkMeta
    }
  };
})();
