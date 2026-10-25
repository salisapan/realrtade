// F2 ONEDRIVE_FIND and U2 LOCAL_FILE_CLOSE on the Outlook card (close map).
// Portable business logic + worker-shaped writers for C1 to register in background.js.
// Default off: glanceSwitches.ONEDRIVE_FIND / LOCAL_FILE_CLOSE must be true.
// Graph mutating calls belong in the service worker (outlookFetch), not flow:outlook-fetch GET proxy.
const FlowOutlookM2Close = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const Find = sibling(typeof FlowOnedriveFind !== 'undefined' ? FlowOnedriveFind : null, '../core/onedrive-find.js', 'FlowOnedriveFind');
  const Local = sibling(typeof FlowLocalFile !== 'undefined' ? FlowLocalFile : null, '../core/local-file.js', 'FlowLocalFile');
  const Proof = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, '../core/proof-of-close.js', 'FlowProofOfClose');

  const CHAIN_FIND = 'onedrive-find';
  const CHAIN_LOCAL = 'local-file-close';
  const CONNECTOR_FIND = 'onedriveFindAttach';
  const CONNECTOR_LOCAL = 'localFileToOnedrive';

  function switches(st) {
    const s = (st && st.glanceSwitches) || {};
    return {
      ONEDRIVE_FIND: s.ONEDRIVE_FIND === true,
      LOCAL_FILE_CLOSE: s.LOCAL_FILE_CLOSE === true
    };
  }

  function listingFromSt(st) {
    const raw = st && (st.glanceLocalListing || st.outlookLocalListing);
    return Array.isArray(raw) ? raw : null;
  }

  function scopesFromSt(st) {
    const token = st && st.outlookAuth && st.outlookAuth.token;
    const Cal = sibling(typeof FlowOutlookCalendar !== 'undefined' ? FlowOutlookCalendar : null, '../core/outlook-calendar.js', 'FlowOutlookCalendar');
    if (Cal && typeof Cal.scopesFromToken === 'function') return Cal.scopesFromToken(token) || [];
    const raw = token && (token.grantedScopes != null ? token.grantedScopes : token.scope);
    return raw == null ? [] : raw;
  }

  // outlookFetch(url, { method, headers, body }) -> { ok, status, json?, text?, arrayBuffer? }
  function graphFromOutlookFetch(outlookFetch) {
    const base = 'https://graph.microsoft.com/v1.0';
    return async function graph(method, path, body, headers) {
      const m = String(method || 'GET').toUpperCase();
      const url = base + path;
      const init = { method: m, headers: Object.assign({}, headers || {}) };
      if (body != null && m !== 'GET') {
        if (body instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(body))) {
          init.body = body;
          init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/octet-stream';
        } else {
          init.body = JSON.stringify(body);
          init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
        }
      }
      const res = await outlookFetch(url, init);
      const status = (res && res.status) || 0;
      const ok = Boolean(res && res.ok);
      let json = null;
      let bytes = null;
      if (ok && /\/content$/.test(path) && m === 'GET') {
        if (res.arrayBuffer) bytes = new Uint8Array(await res.arrayBuffer());
        else if (res.text) {
          const t = await res.text();
          bytes = Uint8Array.from(t, (ch) => ch.charCodeAt(0) & 0xff);
        }
      } else if (ok && status !== 204) {
        if (typeof res.json === 'function') { try { json = await res.json(); } catch (e) { json = null; } }
        else if (res.body && typeof res.body === 'object') json = res.body;
        else if (typeof res.text === 'function') { try { json = JSON.parse(await res.text() || 'null'); } catch (e2) { json = null; } }
      }
      return { status: status, ok: ok, json: json, bytes: bytes };
    };
  }

  // Page GET proxy: flow:outlook-fetch only (reads). Used for settle / search on the open mail.
  function graphFromPageSend(send) {
    return async function graph(method, path) {
      const m = String(method || 'GET').toUpperCase();
      if (m !== 'GET') return { status: 0, ok: false, json: null, bytes: null };
      const url = 'https://graph.microsoft.com/v1.0' + path;
      const r = await send({ type: 'flow:outlook-fetch', url: url, init: { method: 'GET', headers: {} } });
      const status = (r && r.status) || 0;
      const ok = Boolean(r && r.ok);
      let json = null;
      let bytes = null;
      if (ok) {
        const body = (r && r.body) != null ? String(r.body) : '';
        if (/\/content$/.test(path)) {
          bytes = Uint8Array.from(body, (ch) => ch.charCodeAt(0) & 0xff);
        } else {
          try { json = JSON.parse(body || 'null'); } catch (e) { json = null; }
        }
      }
      return { status: status, ok: ok, json: json, bytes: bytes };
    };
  }

  async function searchDrive(graphGet, paths) {
    if (!Find || !Array.isArray(paths)) return null;
    const merged = [];
    const seen = {};
    for (const p of paths) {
      const r = await graphGet('GET', p);
      const rows = r && r.ok && r.json && Array.isArray(r.json.value) ? r.json.value : [];
      for (const row of rows) {
        if (row && row.id && !seen[row.id]) { seen[row.id] = 1; merged.push(row); }
      }
    }
    return merged;
  }

  async function planOnedriveFind(input) {
    if (!Find) return { action: 'silence', reason: 'not-configured' };
    const flags = input.flags || {};
    if (!Find.enabled(flags)) return { action: 'off', reason: 'switch-off' };
    const rec = Find.recognize({
      flags: flags,
      surface: 'outlook',
      text: input.text,
      threadAttachments: input.threadAttachments,
      scopes: input.scopes
    });
    if (rec.action === 'reconnect') return rec;
    if (rec.action !== 'search') return rec;
    const files = input.searchResults != null ? input.searchResults : await searchDrive(input.graphGet, rec.paths);
    return Find.plan(Object.assign({}, input, { searchResults: files }));
  }

  async function planLocalFile(input) {
    if (!Local) return { action: 'silence', reason: 'not-configured' };
    const flags = input.flags || {};
    if (!Local.enabled(flags)) return { action: 'off', reason: 'switch-off' };
    return Local.plan({
      flags: flags,
      text: input.text,
      cloudHits: input.cloudHits,
      listing: input.listing,
      scopes: input.scopes
    });
  }

  async function onedriveFindAttachWrite(outlookFetch, p) {
    if (!Find || !Proof) return { ok: false, reason: 'not-configured' };
    const on = p && p.flags && p.flags[Find.SWITCH] === true;
    if (!on) return { ok: false, reason: 'switch-off' };
    const params = (p && p.params) || {};
    const file = params.file;
    const draftId = params.draftId;
    if (!file || !file.id || !draftId) return { ok: false, reason: 'invalid' };
    const graph = graphFromOutlookFetch(outlookFetch);
    const r = await Find.attachToDraft({
      flags: p.flags,
      file: file,
      draftId: draftId,
      now: new Date().toISOString()
    }, { graph: graph });
    if (!r || !r.ok || !Proof.allowsHandled(r)) return r || { ok: false, reason: 'write-failed' };
    const meta = params.draftMeta;
    if (meta && r.ref && typeof r.ref === 'object') {
      r.ref = Object.assign({}, r.ref, meta, { draftCreatedByGlance: true });
    }
    return Object.assign({}, r, { fetchedBack: true, connectorId: CONNECTOR_FIND });
  }

  async function onedriveFindUndo(outlookFetch, ref) {
    if (!Find) return { ok: false };
    const graph = graphFromOutlookFetch(outlookFetch);
    const u = await Find.undo(ref, { graph: graph });
    if (!u || !u.ok) return { ok: false, reason: (u && u.reason) || 'undo-failed' };
    const draftId = ref && ref.draftId;
    if (!draftId || ref.draftCreatedByGlance !== true) {
      return { ok: true, written: 'Attachment removed from the draft.' };
    }
    const del = await graph('DELETE', '/me/messages/' + encodeURIComponent(draftId));
    if (!del.ok && del.status !== 404) return { ok: false, reason: 'draft-undo-failed' };
    const got = await graph('GET', '/me/messages/' + encodeURIComponent(draftId) + '?$select=id');
    if (got.status === 404) {
      return { ok: true, written: 'Attachment and reply draft removed.' };
    }
    return { ok: false, reason: 'undo-unverified' };
  }

  async function localFileSaveWrite(outlookFetch, p, hostIo) {
    if (!Local || !Proof) return { ok: false, reason: 'not-configured' };
    const on = p && p.flags && p.flags[Local.SWITCH] === true;
    if (!on) return { ok: false, reason: 'switch-off' };
    const params = (p && p.params) || {};
    const file = params.file;
    if (!file || !file.path) return { ok: false, reason: 'invalid' };
    const graph = graphFromOutlookFetch(outlookFetch);
    const io = {
      graph: graph,
      source: hostIo && hostIo.source,
      digest: hostIo && hostIo.digest
    };
    const r = await Local.save({
      flags: p.flags,
      file: file,
      now: new Date().toISOString()
    }, io);
    if (!r || !r.ok || !Proof.allowsHandled(r)) return r || { ok: false, reason: 'write-failed' };
    return Object.assign({}, r, { fetchedBack: true, connectorId: CONNECTOR_LOCAL, ref: Object.assign({ itemId: r.ref && r.ref.itemId }, r.ref || {}) });
  }

  async function localFileUndo(outlookFetch, ref) {
    if (!Local) return { ok: false };
    const graph = graphFromOutlookFetch(outlookFetch);
    const u = await Local.undo(ref, { graph: graph });
    if (u && u.ok) return { ok: true, written: 'File removed from OneDrive.' };
    if (u && u.reason === 'file-changed') return { ok: false, reason: 'user-edited', written: 'File changed since Glance saved it.' };
    return { ok: false, reason: (u && u.reason) || 'undo-failed' };
  }

  return {
    CHAIN_FIND: CHAIN_FIND,
    CHAIN_LOCAL: CHAIN_LOCAL,
    CONNECTOR_FIND: CONNECTOR_FIND,
    CONNECTOR_LOCAL: CONNECTOR_LOCAL,
    switches: switches,
    listingFromSt: listingFromSt,
    scopesFromSt: scopesFromSt,
    graphFromOutlookFetch: graphFromOutlookFetch,
    graphFromPageSend: graphFromPageSend,
    searchDrive: searchDrive,
    planOnedriveFind: planOnedriveFind,
    planLocalFile: planLocalFile,
    onedriveFindAttachWrite: onedriveFindAttachWrite,
    onedriveFindUndo: onedriveFindUndo,
    localFileSaveWrite: localFileSaveWrite,
    localFileUndo: localFileUndo
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowOutlookM2Close = FlowOutlookM2Close;
if (typeof module !== 'undefined') module.exports = { FlowOutlookM2Close };
