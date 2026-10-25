// Service-worker side of W4: Supabase REST with the user's JWT (never user id in the body).
const FlowWaBusinessSW = (() => {
  const SESSION_KEY = 'waBusinessSession';
  const USER_KILL_KEY = 'waBusinessUserKill';

  function baseUrl() {
    const cfg = typeof globalThis !== 'undefined' && globalThis.__glanceWaBusinessConfig;
    return (cfg && cfg.supabaseUrl) || 'https://zjquktirlrhbqcnkfaok.supabase.co';
  }

  async function session() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
    const bag = await chrome.storage.local.get({ [SESSION_KEY]: null, [USER_KILL_KEY]: false });
    const s = bag[SESSION_KEY];
    if (!s || !s.accessToken) return null;
    return {
      token: String(s.accessToken),
      anonKey: s.anonKey ? String(s.anonKey) : '',
      userKill: bag[USER_KILL_KEY] === true,
    };
  }

  async function rest(path, opts) {
    const sess = await session();
    if (!sess) return { ok: false, reason: 'no-session' };
    const url = baseUrl().replace(/\/$/, '') + path;
    const headers = Object.assign({
      apikey: sess.anonKey || sess.token,
      Authorization: 'Bearer ' + sess.token,
      'Content-Type': 'application/json',
    }, (opts && opts.headers) || {});
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    return { ok: res.ok, status: res.status, json: res.ok ? await res.json().catch(() => null) : null, sess };
  }

  async function globalKill() {
    const r = await rest('/rest/v1/wa_business_platform?id=eq.global&select=kill_switch');
    if (!r.ok || !Array.isArray(r.json) || !r.json[0]) return false;
    return r.json[0].kill_switch === true;
  }

  async function pollInbox() {
    const sess = await session();
    if (!sess || sess.userKill) return { ok: true, items: [], reason: sess && sess.userKill ? 'user-kill' : 'no-session' };
    if (await globalKill()) return { ok: true, items: [], reason: 'global-kill' };
    const r = await rest('/rest/v1/wa_business_inbound_messages?select=id,wamid,phone_number_id,from_wa_id,contact_name,message_type,text_body,caption,filename,received_at&order=received_at.desc&limit=20');
    if (!r.ok) return { ok: false, reason: 'fetch-failed', status: r.status };
    return { ok: true, items: r.json || [] };
  }

  async function saveDraft(inboundId, draftBody, proof) {
    const lane = typeof FlowWaBusinessLane !== 'undefined' ? FlowWaBusinessLane : null;
    const r = await rest('/rest/v1/wa_business_drafts', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        inbound_message_id: inboundId,
        draft_body: draftBody,
        proof: proof,
      }),
    });
    if (!r.ok) return { ok: false, reason: 'write-failed', status: r.status };
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    const reread = await rest('/rest/v1/wa_business_drafts?id=eq.' + encodeURIComponent(row.id) + '&select=id,draft_body,proof');
    const fetched = reread.ok && Array.isArray(reread.json) && reread.json[0] && reread.json[0].draft_body === draftBody;
    const built = lane && lane.buildProof ? lane.buildProof(row.id, fetched) : proof;
    return { ok: true, draftId: row.id, proof: built, fetchedBack: fetched === true };
  }

  async function undoDraft(draftId) {
    const r = await rest('/rest/v1/wa_business_drafts?id=eq.' + encodeURIComponent(draftId), {
      method: 'PATCH',
      body: JSON.stringify({ undone_at: new Date().toISOString() }),
    });
    return { ok: r.ok };
  }

  return {
    SESSION_KEY,
    USER_KILL_KEY,
    pollInbox,
    saveDraft,
    undoDraft,
    globalKill,
  };
})();
if (typeof module !== 'undefined') module.exports = { FlowWaBusinessSW };
