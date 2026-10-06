// Outlook, through Microsoft's own mail API (Microsoft Graph), run from the popup / side panel. The browser half of
// core/outlook-sync.js: sign in, fetch the last couple of weeks of one mailbox, hand them to the planner, apply what it decides.
//
// What this is, and is not (docs/multi-platform.md):
//   - It runs while Glance's panel is open (on open, every ten minutes, and on "Check now") and while an Outlook on the web
//     tab is open (the in-page Do It card; its network calls go through the service worker). The service worker keeps
//     the Microsoft session alive on its own (core/outlook-auth.js session(), alarm 'glance-outlook-keepalive') but never
//     reads mail by itself.
//   - It reads the last 14 days of the inbox and the sent folder, on this device, with the person's own Microsoft sign-in.
//     Nothing is sent to Glance's servers.
//   - On Do It for an incoming ask, it writes a reply DRAFT into the person's Outlook Drafts (Graph createReply) with
//     Mail.ReadWrite. It never sends: never Mail.Send, never /send, /reply, /replyAll, /forward, /sendMail.
//   - Allowed non-GET Graph calls: createReply, POST of a fileAttachment on a Glance-created draft,
//     PATCH of a Glance-created draft, DELETE of a Glance-created draft (the file goes with the draft).
//   - Everything it can decide on its own is a loop CLOSING or MOVING because of an answer. A new loop from an offer is
//     only ever offered, and created when the person taps. Incoming asks appear in Still Open with Do It.
const FlowOutlook = (() => {
  const ORIGINS = ['https://graph.microsoft.com/*', 'https://login.microsoftonline.com/*'];
  // Outlook on the web: floating Do It card (same engine as Gmail). Requested with Graph on connect.
  const OWA_ORIGINS = ['https://outlook.live.com/*', 'https://outlook.office.com/*', 'https://outlook.office365.com/*'];
  const AUTH_KEY = 'outlookAuth';
  const STATE_KEY = 'outlookSync';
  const PENDING_KEY = 'outlookPending';
  const MIN_INTERVAL_MS = 10 * 60 * 1000;
  const SILENT_REAUTH_AFTER_MS = 16 * 60 * 60 * 1000; // first silent renewal at hour 16 of the 24h SPA window (outlook-auth SILENT_AFTER_MS)
  const SELECT = 'id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,isDraft,body,webLink,hasAttachments,internetMessageId';
  const OWN_LEARNED_CAP = 20;
  // Bump to wipe stale outlookPending/offers from older builds (0.9.0 silence bug; 0.9.14: own addresses learned from
  // other people's To lines and asks swallowed by a loop in another app).
  const STATE_VERSION = 3;

  // Non-GET Graph paths Glance is allowed to call. Anything else throws.
  const WRITE_ALLOW = [
    /\/me\/messages\/[^/]+\/createReply$/i,
    /\/me\/messages\/[^/]+\/attachments$/i, // fileAttachment on a Glance draft; Mail.ReadWrite
    /\/me\/messages\/[^/]+$/i  // PATCH or DELETE of a message (draft only, enforced in writers)
  ];
  // Graph fileAttachment contentBytes is Mail.ReadWrite and stops at 3 MB.
  const ATTACH_MAX_BYTES = 3 * 1024 * 1024;
  const FORBIDDEN_SEND = /\/(send|reply|replyAll|forward|sendMail)(\b|$)/i;

  // deps: { storage, cfg, auth, plan, fetch, launch, launchSilent?, redirectUri(), permissions, send, random, sha256, now,
  //         planDeps, identity, followUp, actions?, intent? }
  function create(deps) {
    const cfg = deps.cfg;

    async function read(key, fallback) { const st = await deps.storage.get(); return st && st[key] != null ? st[key] : fallback; }
    async function write(key, value) { await deps.storage.set({ [key]: value }); }


    function gm() {
      if (deps.graphMail) return deps.graphMail;
      try { return typeof require !== 'undefined' ? require('../core/graph-mail.js').FlowGraphMail : (typeof FlowGraphMail !== 'undefined' ? FlowGraphMail : null); }
      catch (e) { return typeof FlowGraphMail !== 'undefined' ? FlowGraphMail : null; }
    }

    function normAddr(a) {
      return String(a || '').trim().toLowerCase();
    }

    function meSetList(auth) {
      const raw = (auth && auth.ownAddresses && auth.ownAddresses.length)
        ? auth.ownAddresses
        : (auth && auth.account && auth.account.address ? [auth.account.address] : []);
      return raw.map(normAddr).filter(Boolean);
    }

    function isOwnEmail(email, ownList) {
      const e = normAddr(email);
      return Boolean(e && (ownList || []).indexOf(e) !== -1);
    }

    async function clearOutlookJudgmentState() {
      await write(PENDING_KEY, { offers: [], asks: [], incoming: [] });
      const st = await read(STATE_KEY, {});
      await write(STATE_KEY, Object.assign({}, st, {
        offered: {}, declined: {}, incomingDeclined: {},
        lastAt: null, lastCount: 0, lastIncoming: 0, lastOffers: 0,
        error: null, stateVersion: STATE_VERSION, diagnostics: []
      }));
    }

    // On upgrade from a build that silenced incoming asks, wipe judgment caches once (keep tokens).
    async function ensureStateVersion() {
      const st = await read(STATE_KEY, {});
      if (st && st.stateVersion === STATE_VERSION) return false;
      await clearOutlookJudgmentState();
      return true;
    }

    function isOpaqueMailbox(addr) {
      const g = gm();
      if (g && g.isOpaqueMailbox) return g.isOpaqueMailbox(addr);
      return /^outlook_[0-9a-f]+@outlook\.com$/i.test(String(addr || '').trim());
    }

    // Human From for drafts: prefer pickPrimary / account.address, skip opaque CID.
    function primaryAddress(auth) {
      if (!auth) return null;
      const candidates = [];
      if (auth.account && auth.account.address) candidates.push(auth.account.address);
      if (auth.account && auth.account.mail) candidates.push(auth.account.mail);
      (auth.ownAddresses || []).forEach((a) => candidates.push(a));
      if (auth.profile) {
        if (auth.profile.mail) candidates.push(auth.profile.mail);
        (auth.profile.otherMails || []).forEach((a) => candidates.push(a));
        (auth.profile.proxyAddresses || []).forEach((p) => {
          const m = String(p || '').match(/^smtp:(.+)$/i);
          if (m) candidates.push(m[1]);
        });
      }
      const seen = new Set();
      for (const raw of candidates) {
        const e = normAddr(raw);
        if (!e || seen.has(e)) continue;
        seen.add(e);
        if (!isOpaqueMailbox(e)) return e;
      }
      // Last resort: opaque CID only when no human alias was learned.
      return candidates.map(normAddr).find(Boolean) || null;
    }

    async function status() {
      const auth = await read(AUTH_KEY, null);
      const st = await read(STATE_KEY, {});
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      const own = (auth && auth.ownAddresses) || [];
      return {
        configured: Boolean(cfg.CLIENT_ID), connected: Boolean(auth && auth.token), account: auth && auth.account || null,
        primary: primaryAddress(auth),
        ownAddresses: own.slice(), ownAddressCount: own.length || (auth && auth.account && auth.account.address ? 1 : 0),
        needsSignIn: Boolean(st.needsSignIn), draftConsentNeeded: Boolean(st.draftConsentNeeded),
        lastAt: st.lastAt || null, lastCount: st.lastCount || 0,
        lastIncoming: st.lastIncoming || 0, lastOffers: st.lastOffers || 0,
        error: st.error || null, errorDetail: st.errorDetail || null, aadsts: st.aadsts || null,
        redirectUri: deps.redirectUri(),
        offers: (pending.offers || []).length, asks: (pending.asks || []).length,
        incoming: (pending.incoming || []).length,
        diagnostics: Array.isArray(st.diagnostics) ? st.diagnostics.slice(0, 40) : [],
        // What the Outlook-on-the-web card could not show, and why (src/content-outlook.js pageReason).
        pageDiagnostics: (await read('outlookPageDiag', [])).slice(0, 20),
        fromAliasHint: st.fromAliasHint || null,
        origins: ORIGINS
      };
    }

    // ---- Graph ------------------------------------------------------------------------------------------------
    // token: an access-token string, or a holder { accessToken, renew() } whose renew() forces a refresh (or a silent
    // renewal) and returns the new access token. A 401 is answered once with a renewed token before it counts as signed out.
    async function graphGet(token, url) {
      const holder = typeof token === 'string' ? null : token;
      const call = (t) => deps.fetch(url, { headers: { Authorization: 'Bearer ' + t, Prefer: 'outlook.body-content-type="text"' } });
      let res = await call(holder ? holder.accessToken : token);
      if (res.status === 401 && holder && typeof holder.renew === 'function') {
        const next = await holder.renew();
        if (next) res = await call(next);
      }
      if (res.status === 401) { const e = new Error('auth'); e.code = 'auth'; throw e; }
      if (!res.ok) { const e = new Error('http-' + res.status); e.code = 'http'; e.status = res.status; throw e; }
      return res.json();
    }

    function assertAllowedWrite(url, method) {
      const m = String(method || 'GET').toUpperCase();
      if (m === 'GET' || m === 'HEAD') return;
      const path = String(url || '').split('?')[0];
      if (FORBIDDEN_SEND.test(path)) {
        const e = new Error('graph-send-refused'); e.code = 'refused'; throw e;
      }
      if (!WRITE_ALLOW.some((re) => re.test(path))) {
        const e = new Error('graph-write-refused'); e.code = 'refused'; throw e;
      }
    }

    async function graphWrite(token, method, url, body) {
      assertAllowedWrite(url, method);
      const holder = typeof token === 'string' ? null : token;
      const call = (t) => deps.fetch(url, { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body != null ? JSON.stringify(body) : undefined });
      let res = await call(holder ? holder.accessToken : token);
      if (res.status === 401 && holder && typeof holder.renew === 'function') {
        const next = await holder.renew();
        if (next) res = await call(next);
      }
      if (res.status === 401) { const e = new Error('auth'); e.code = 'auth'; throw e; }
      if (res.status === 403) { const e = new Error('forbidden'); e.code = 'forbidden'; throw e; }
      if (!res.ok && res.status !== 204) { const e = new Error('http-' + res.status); e.code = 'http'; e.status = res.status; throw e; }
      if (res.status === 204) return null;
      const text = await res.text();
      if (!text) return null;
      try { return JSON.parse(text); } catch (e) { return null; }
    }

    async function folder(token, name, sinceIso) {
      let url = cfg.GRAPH + '/me/mailFolders/' + name + '/messages?$top=' + cfg.PAGE_SIZE + '&$orderby=' + encodeURIComponent('receivedDateTime desc') + '&$filter=' + encodeURIComponent('receivedDateTime ge ' + sinceIso) + '&$select=' + SELECT;
      const out = [];
      for (let page = 0; url && page < cfg.MAX_PAGES; page++) {
        const data = await graphGet(token, url);
        (data.value || []).forEach((m) => { m._folder = name; out.push(m); });
        const next = data['@odata.nextLink'] || null;
        url = next && next.indexOf(cfg.GRAPH.replace(/\/v1\.0$/, '') + '/') === 0 ? next : null;
      }
      return out;
    }

    function authDeps() {
      return {
        fetch: deps.fetch, random: deps.random, sha256: deps.sha256,
        launch: deps.launch, launchSilent: deps.launchSilent, now: deps.now
      };
    }

    function hasScope(token, scope) {
      const scopes = (token && token.grantedScopes) || cfg.SCOPES;
      return Array.isArray(scopes) && scopes.some((s) => String(s).toLowerCase() === String(scope).toLowerCase() || String(s).toLowerCase().endsWith('/' + String(scope).toLowerCase()));
    }

    async function fetchProfile(token) {
      // Optional fields: never fail the connect because of a refused field.
      try {
        return await graphGet(token, cfg.GRAPH + '/me?$select=mail,userPrincipalName,displayName,otherMails,proxyAddresses');
      } catch (e) {
        try { return await graphGet(token, cfg.GRAPH + '/me?$select=mail,userPrincipalName,displayName'); }
        catch (e2) { return null; }
      }
    }

    function buildOwnAddresses(profile, learned) {
      const g = gm();
      if (g && g.ownAddressesFrom) return Array.from(g.ownAddressesFrom(profile, learned));
      const s = new Set();
      const add = (a) => { if (a) s.add(String(a).toLowerCase()); };
      if (profile) { add(profile.mail); add(profile.userPrincipalName); (profile.otherMails || []).forEach(add); }
      (learned || []).forEach(add);
      return Array.from(s);
    }

    async function connect(opts) {
      if (!cfg.CLIENT_ID) return { ok: false, error: 'not-configured' };
      const granted = await deps.permissions.request({ origins: ORIGINS.concat(OWA_ORIGINS) });
      if (!granted) return { ok: false, error: 'permission' };
      const o = opts || {};
      const r = await deps.auth.signIn(authDeps(), cfg, deps.redirectUri(), { prompt: o.prompt, loginHint: o.loginHint });
      if (!r.ok) return { ok: false, error: r.error, description: r.description || null, aadsts: r.aadsts || null };
      const profile = await fetchProfile(r.token.accessToken);
      if (!profile) return { ok: false, error: 'profile' };
      const ownAddresses = buildOwnAddresses(profile, []);
      const primary = ownAddresses[0] || String(profile.mail || profile.userPrincipalName || '').toLowerCase();
      if (!primary) return { ok: false, error: 'profile' };
      const account = { address: primary, name: profile.displayName || null, mail: profile.mail || null, userPrincipalName: profile.userPrincipalName || null };
      await write(AUTH_KEY, { token: r.token, account, ownAddresses, profile: { mail: profile.mail, userPrincipalName: profile.userPrincipalName, otherMails: profile.otherMails || [], proxyAddresses: profile.proxyAddresses || [] } });
      // Always wipe stale offers/asks/incoming and watermarks on connect/re-consent (0.9.0 left silence + wrong offers).
      await clearOutlookJudgmentState();
      // Register the OWA content script (same chip as Gmail) while Outlook is on.
      if (typeof deps.send === 'function') {
        try { await deps.send({ type: 'flow:surface-enable', id: 'outlook' }); } catch (e) { /* permission already granted above */ }
      }
      const s = await sync({ force: true });
      return Object.assign({ ok: true, account }, { sync: s });
    }

    async function disconnect() {
      await write(AUTH_KEY, null);
      await write(STATE_KEY, {});
      await write(PENDING_KEY, { offers: [], asks: [] });
      try { await deps.permissions.remove({ origins: ORIGINS.concat(OWA_ORIGINS) }); } catch (e) { /* tokens are gone either way */ }
      if (typeof deps.send === 'function') {
        try { await deps.send({ type: 'flow:surface-disable', id: 'outlook' }); } catch (e) { /* ignore */ }
      }
      return { ok: true };
    }

    // ---- the durable session (core/outlook-auth.js session) -----------------------------------------------------
    // Every Graph call in this file gets its token here: fresh, refreshed, or renewed silently. The result is written back
    // at once (chrome.storage.local), so a service-worker restart, a closed panel or a second tab never loses it.
    async function ensureSession(opts) {
      const o = opts || {};
      const auth = await read(AUTH_KEY, null);
      const st = await read(STATE_KEY, {});
      if (!auth || !auth.token) return { ok: false, error: 'not-connected', needsSignIn: false };
      if (typeof deps.auth.session !== 'function') {
        const f = await deps.auth.ensureFresh({ fetch: deps.fetch, now: deps.now }, cfg, auth.token);
        if (f.ok && f.refreshed) await write(AUTH_KEY, Object.assign({}, auth, { token: f.token }));
        return f.ok ? { ok: true, token: f.token, auth: Object.assign({}, auth, { token: f.token }) } : { ok: false, error: f.error, needsSignIn: Boolean(f.reauth), aadsts: f.aadsts || null, description: f.description || null };
      }
      const r = await deps.auth.session(authDeps(), cfg, auth, {
        redirectUri: deps.redirectUri(), loginHint: primaryAddress(auth), force: Boolean(o.force), lastSilentAt: st.lastSilentAt || null
      });
      const now = deps.now();
      let nextAuth = auth;
      if (r.ok && r.changed) {
        // Read again right before writing: another surface may have stored a newer token meanwhile; keep the newest window.
        const cur = (await read(AUTH_KEY, null)) || auth;
        nextAuth = Object.assign({}, cur, { token: r.token });
        await write(AUTH_KEY, nextAuth);
      }
      const patch = {};
      if (r.silentTried) patch.lastSilentAt = now;
      if (r.ok) {
        if (st.needsSignIn || st.error) Object.assign(patch, { needsSignIn: false, error: null, aadsts: null, errorDetail: null });
        if (r.how === 'silent') patch.lastRenewedAt = now;
      } else {
        Object.assign(patch, { error: r.error || 'expired', needsSignIn: Boolean(r.needsSignIn), aadsts: r.aadsts || null, errorDetail: r.description || null });
        if (r.error === 'consent_required') patch.draftConsentNeeded = true;
      }
      if (Object.keys(patch).length) await write(STATE_KEY, Object.assign({}, await read(STATE_KEY, {}), patch));
      return r.ok ? { ok: true, token: r.token, auth: nextAuth, how: r.how } : r;
    }

    // A token holder for graphGet/graphWrite: on a 401 it forces one refresh / silent renewal and retries.
    function holderFor(token) {
      const h = {
        accessToken: token.accessToken,
        renewedOk: false,
        renew: async () => {
          const r = await ensureSession({ force: true });
          if (!r.ok) return null;
          h.renewedOk = true;
          h.accessToken = r.token.accessToken;
          return h.accessToken;
        }
      };
      return h;
    }

    // Keep the session alive without reading mail (the service worker's alarm, the Outlook page on load).
    async function keepAlive() {
      const auth = await read(AUTH_KEY, null);
      if (!cfg.CLIENT_ID || !auth || !auth.token) return { ok: false, error: 'not-connected' };
      const r = await ensureSession({});
      return r.ok ? { ok: true, how: r.how } : { ok: false, error: r.error, needsSignIn: Boolean(r.needsSignIn) };
    }

    function chainMessageText(m) {
      const raw = (m && m.body && (m.body.content || m.body)) || '';
      const text = typeof raw === 'string' ? raw : '';
      const g = gm();
      return g && g.ownText ? g.ownText(text) : text;
    }

    function newestInConversation(messages, conversationId) {
      const id = String(conversationId || '');
      const list = (messages || []).filter((m) => m && String(m.conversationId || '') === id && !m.isDraft);
      list.sort((a, b) => (Date.parse(b.receivedDateTime || b.sentDateTime) || 0) - (Date.parse(a.receivedDateTime || a.sentDateTime) || 0));
      return list[0] || null;
    }

    function fileChainPending(reason) {
      if (typeof FlowCloseChains !== 'undefined' && FlowCloseChains.isFileChainPending) return FlowCloseChains.isFileChainPending(reason);
      return reason === 'file-chain-not-run' || reason === 'file-needs-drive';
    }

    function searchSilenceOf(searched) {
      if (typeof FlowCloseChains !== 'undefined' && typeof FlowCloseChains.searchSilence === 'function') return FlowCloseChains.searchSilence(searched);
      if (!searched) return 'file-chain-not-run';
      if (searched.ok === true) return null;
      return searched.reason === 'drive-not-granted' || searched.reason === 'not-connected' ? 'drive-not-granted' : 'drive-search-failed';
    }

    // silence: { conversationId, reason }. reason null drops the stall (a card, or a file the open message attaches).
    function applyFileChainSilence(diagnostics, silence) {
      const byConv = {};
      (silence || []).forEach((row) => { if (row && row.conversationId) byConv[String(row.conversationId)] = row; });
      const out = [];
      (diagnostics || []).forEach((d) => {
        if (!d) return;
        const hit = byConv[String(d.conversationId || '')];
        if (!hit || !fileChainPending(d.reason)) { out.push(d); return; }
        if (!hit.reason) return;
        out.push(Object.assign({}, d, { reason: hit.reason }));
      });
      return out;
    }

    // Needs-you only. A found file is attached from the open message (Do It), not from this list.
    // A search that does not finish replaces file-chain-not-run with drive-not-granted or drive-search-failed.
    async function outlookFileChainCards(messages, diagnostics, now) {
      const cards = [];
      const silence = [];
      if (typeof FlowCloseChains === 'undefined' || typeof FlowFileAttach === 'undefined' || !FlowCloseChains.fileEvidence) return { cards, silence };
      for (const d of diagnostics) {
        if (!d || !fileChainPending(d.reason)) continue;
        const msg = newestInConversation(messages, d.conversationId);
        if (!msg || !msg.id) { silence.push({ conversationId: d.conversationId, reason: 'file-chain-not-run' }); continue; }
        const text = chainMessageText(msg);
        const gate = FlowFileAttach.gate(text);
        if (!gate || gate.kind !== 'clear' || !gate.ask) { silence.push({ conversationId: d.conversationId, reason: 'file-chain-not-run' }); continue; }
        if (!deps.send) { silence.push({ conversationId: d.conversationId, reason: 'file-chain-not-run' }); continue; }
        let searched = null;
        try { searched = await deps.send({ type: 'flow:search-drive', query: FlowFileAttach.driveQuery(gate.ask.searchTerms || gate.ask.query) }); }
        catch (e) { searched = { ok: false, reason: 'drive-search-failed', status: 0, error: String(e && e.message || e) }; }
        const failed = searchSilenceOf(searched);
        if (failed) { silence.push({ conversationId: d.conversationId, reason: failed }); continue; }
        const chain = FlowCloseChains.resolve({
          text,
          origin: 'outlook',
          now,
          evidence: FlowCloseChains.fileEvidence({
            driveOk: true,
            driveFiles: (searched && searched.files) || [],
            threadFiles: msg.hasAttachments ? null : []
          })
        });
        if (chain && chain.move === 'prepare' && chain.hit && chain.hit.file && chain.hit.source === 'drive') {
          silence.push({ conversationId: d.conversationId, reason: null });
          continue;
        }
        if (!chain || chain.move !== 'needs-you' || chain.sends !== false || chain.close !== false || !chain.holding || !chain.holding.text || chain.holding.claimsFile) {
          silence.push({ conversationId: d.conversationId, reason: (chain && chain.reason) || 'file-chain-not-run' });
          continue;
        }
        const he = chain.requirement && chain.requirement.lang === 'he';
        const from = (msg.from && msg.from.emailAddress) || {};
        const card = chain.card || {};
        const line = [card.line, card.searched, card.why, card.skipped].filter(Boolean).join(' ');
        cards.push({
          messageId: msg.id,
          threadId: 'ol:' + msg.conversationId,
          threadUrl: msg.webLink || null,
          sender: { name: from.name || null, email: from.address || null },
          subject: msg.subject || d.subject || '',
          ts: now,
          app: 'outlook',
          glanceChain: 'needs-you',
          holdingText: chain.holding.text,
          cardLine: line,
          card: chain.card,
          requirement: chain.requirement,
          promise: chain.promise,
          doLabel: he ? 'טיוטת תשובת ביניים' : 'Draft a holding reply',
          intent: { type: 'request', label: line },
          process: {
            id: 'reply-track',
            name: 'Reply & Track',
            closingLine: line,
            steps: [{ kind: 'outlookDraft', id: 'outlookDraft', params: {} }]
          },
          text: text,
          outlookIncomingId: msg.id,
          outlookConversationId: msg.conversationId,
          internetMessageId: msg.internetMessageId || null,
          receivedDateTime: msg.receivedDateTime || null,
          key: msg.conversationId + '|' + msg.id,
          label: line
        });
        silence.push({ conversationId: d.conversationId, reason: null });
      }
      return { cards, silence };
    }

    // ---- one check --------------------------------------------------------------------------------------------
    async function sync(opts) {
      const o = opts || {};
      let auth = await read(AUTH_KEY, null);
      if (!cfg.CLIENT_ID || !auth || !auth.token) return { ok: false, error: 'not-connected' };
      await ensureStateVersion();
      let st = await read(STATE_KEY, {});
      const now = deps.now();
      const minInterval = typeof o.minIntervalMs === 'number' ? Math.max(30 * 1000, o.minIntervalMs) : MIN_INTERVAL_MS;
      if (!o.force && st.lastAt && now - st.lastAt < minInterval) return { ok: true, skipped: true };

      // A usable token: fresh, refreshed, or silently renewed before / after the 24h SPA window (ensureSession).
      const sess = await ensureSession({});
      if (!sess.ok) {
        return { ok: false, error: sess.error, needsSignIn: Boolean(sess.needsSignIn), transient: Boolean(sess.transient), aadsts: sess.aadsts || null };
      }
      auth = sess.auth || (await read(AUTH_KEY, null));
      st = await read(STATE_KEY, {});
      const fresh = { ok: true, token: sess.token };
      const tok = holderFor(sess.token);

      let messages;
      try {
        const since = new Date(now - cfg.LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
        const inbox = await folder(tok, 'inbox', since);
        const sent = await folder(tok, 'sentitems', since);
        // Learn own addresses: profile + sentitems from + inbox toRecipients that are not the sender.
        const g = gm();
        const learnedMsg = (g && g.learnOwnFromMessages)
          ? g.learnOwnFromMessages(inbox, sent)
          : [];
        const inboxLearned = [];
        inbox.forEach((m) => {
          const from = normAddr(m.from && m.from.emailAddress && m.from.emailAddress.address);
          (m.toRecipients || []).forEach((r) => {
            const a = normAddr(r && r.emailAddress && r.emailAddress.address);
            if (a && a !== from) inboxLearned.push(a);
          });
        });
        // Own addresses are recomputed on every check from what can only be yours: the profile, the senders of your sent
        // folder (kept across checks in sentLearned), and To lines that pass graph-mail's strict rule. Never sticky inbox
        // guesses: one CC'd message used to make its To person "you" for good, and every ask from them went silent.
        const prevOwn = auth.ownAddresses || [];
        const sentLearned = Array.from(new Set((auth.sentLearned || []).concat(sent.map((m) => normAddr(m && m.from && m.from.emailAddress && m.from.emailAddress.address)).filter(Boolean)))).slice(0, OWN_LEARNED_CAP);
        const profile = auth.profile || { mail: auth.account && auth.account.mail, userPrincipalName: auth.account && auth.account.userPrincipalName };
        let ownAddresses = buildOwnAddresses(profile, sentLearned.concat(learnedMsg)).slice(0, OWN_LEARNED_CAP);
        if (g && g.notOwn) ownAddresses = g.notOwn(ownAddresses, inbox, profile, sentLearned);
        const primary = (g && g.pickPrimary)
          ? (g.pickPrimary(ownAddresses, profile, inboxLearned.filter((a) => ownAddresses.indexOf(a) !== -1)) || ownAddresses[0] || (auth.account && auth.account.address))
          : (ownAddresses[0] || (auth.account && auth.account.address));
        if (ownAddresses.join('|') !== (prevOwn || []).join('|') || (auth.account && auth.account.address) !== primary || (auth.sentLearned || []).join('|') !== sentLearned.join('|')) {
          const cur = (await read(AUTH_KEY, null)) || auth;
          await write(AUTH_KEY, Object.assign({}, cur, {
            ownAddresses, sentLearned,
            account: Object.assign({}, cur.account, { address: primary })
          }));
          auth = await read(AUTH_KEY, null);
        }
        messages = inbox.concat(sent);
      } catch (e) {
        // A 401 that survived one forced renewal: the session state was already written by ensureSession.
        const cur = await read(STATE_KEY, {});
        // Still refused with a token Microsoft has just renewed: the grant itself is gone (revoked, consent withdrawn).
        const reauth = e.code === 'auth' && (Boolean(cur.needsSignIn) || tok.renewedOk || typeof deps.auth.session !== 'function');
        await write(STATE_KEY, Object.assign({}, cur, { error: e.code === 'auth' ? 'auth' : (e.message || 'error'), needsSignIn: reauth }));
        return { ok: false, error: e.message, needsSignIn: reauth, transient: !reauth };
      }

      const meSet = auth.ownAddresses && auth.ownAddresses.length ? auth.ownAddresses : (auth.account && auth.account.address);
      const watches = await deps.storage.getWatches();
      const graph = await deps.storage.getIdentityGraph();
      const planDeps = Object.assign({}, deps.planDeps, { actions: (deps.planDeps && deps.planDeps.actions) || deps.actions || null });
      const p = deps.plan({ messages, me: meSet, watches, graph, state: st, now, deps: planDeps });

      for (const party of p.parties) { try { await deps.storage.observeIdentity(party); } catch (e) { /* optional */ } }

      for (const item of p.patches) {
        const w = watches.find((x) => x.id === item.id);
        const next = (await deps.storage.updateWatch(item.id, item.patch)) || Object.assign({}, w || {}, item.patch);
        if (!w) continue;
        if (item.patch.status === 'resolved' && w.status !== 'resolved') {
          if (w.taskRef) await deps.send({ type: 'flow:follow-complete', ref: w.taskRef });
          if (typeof deps.storage.recordOutcomeLabel === 'function' && item.patch.resolvedBy === 'reply') deps.storage.recordOutcomeLabel('autoClosed', w.id + '|' + (item.patch.resolvedAt || '')).catch(() => {});
          // Close the Still Open / shown entry for this incoming ask.
          if (w.messageId && typeof deps.storage.markAlreadyClosed === 'function') {
            try { await deps.storage.markAlreadyClosed(w.messageId); } catch (e) { /* optional */ }
          }
          if (w.messageId && typeof deps.storage.forgetStillOpenScan === 'function') {
            try { await deps.storage.forgetStillOpenScan(w.threadId, w.messageId); } catch (e) { /* optional */ }
          }
        } else if (item.patch.chaseIso && item.patch.chaseIso !== w.chaseIso && w.taskRef) {
          await deps.send({ type: 'flow:follow-reschedule', ref: w.taskRef, dueIso: item.patch.chaseIso, title: deps.followUp.taskTitle(next) });
        }
      }

      // Offers / asks / incoming. Drop offers whose "counterpart" is actually me (stale identity).
      const ownList = meSetList(auth);
      const pending = await read(PENDING_KEY, { offers: [], asks: [], incoming: [] });
      const offered = Object.assign({}, st.offered);
      let offers = (pending.offers || []).filter((x) => {
        if (!x || !x.base) return false;
        if (watches.some((w) => w.id === x.base.threadId && deps.followUp.isActive(w))) return false;
        if (isOwnEmail(x.base.counterpart && x.base.counterpart.email, ownList)) return false;
        return true;
      });
      (p.offers || []).forEach((x) => {
        if (isOwnEmail(x.base && x.base.counterpart && x.base.counterpart.email, ownList)) return;
        if (!offers.some((y) => y.key === x.key)) offers.push(x);
        offered[x.key] = now;
      });
      const asks = (pending.asks || []).slice();
      (p.asks || []).forEach((x) => { if (!asks.some((y) => y.key === x.key)) asks.push(x); });

      // Incoming asks: Still Open + pending.incoming (Loops / From Outlook with Do It).
      const incomingCards = [];
      for (const inc of (p.incoming || [])) {
        const intent = inc.intent;
        // The planner already ran Gmail's chain (core/incoming-judge.js) and mapped the draft step to Outlook.
        const outlookProcess = inc.process;
        if (!intent || !outlookProcess) continue;
        const text = (inc.base.subject ? inc.base.subject + '\n' : '') + (inc.base.text || '');
        const entry = {
          messageId: inc.messageId,
          threadId: inc.base.threadId,
          threadUrl: inc.base.threadUrl,
          sender: inc.base.sender || inc.base.counterpart,
          subject: inc.base.subject,
          ts: now,
          app: 'outlook',
          intent: intent,
          process: outlookProcess,
          text: text,
          outlookIncomingId: inc.messageId,
          outlookConversationId: inc.conversationId,
          internetMessageId: inc.internetMessageId || null,
          receivedDateTime: inc.receivedDateTime || null,
          key: inc.key,
          label: (intent && intent.label) || 'Reply requested'
        };
        incomingCards.push(entry);
        if (typeof deps.storage.upsertStillOpenScan === 'function') {
          try { await deps.storage.upsertStillOpenScan(entry); } catch (e) { /* keep going */ }
        }
        if (typeof deps.storage.appendLog === 'function') {
          try {
            const st2 = await deps.storage.get();
            const shownAlready = ((st2 && st2.log) || []).some((e) => e && e.kind === 'shown' && e.messageId === inc.messageId);
            if (!shownAlready) {
              await deps.storage.appendLog({
                kind: 'shown', label: intent.label, messageId: inc.messageId,
                score: intent.signals && intent.signals.score, signals: intent.signals,
                process: { id: outlookProcess.id, name: outlookProcess.name, steps: outlookProcess.steps },
                threadUrl: inc.base.threadUrl, threadId: inc.base.threadId,
                sender: entry.sender, subject: inc.base.subject, intent: intent, app: 'outlook',
                text: text, outlookIncomingId: inc.messageId
              });
            }
          } catch (e) { /* optional */ }
        }
      }
      // File asks the planner left on file-chain-not-run (older checks said file-needs-drive):
      // the same Drive + thread evidence Gmail passes. Calendar, Sheets and Docs stay off.
      // A found file is attached when the open message's Do It runs, not added to this list.
      // The silence is replaced: a card or a found file drops it; a failed search names why.
      const chained = await outlookFileChainCards(messages, p.diagnostics || [], now);
      const chainCards = chained.cards || [];
      chainCards.forEach((entry) => {
        if (!entry || incomingCards.some((y) => y.messageId === entry.messageId)) return;
        incomingCards.push(entry);
      });

      // Keep prior incoming cards that were not re-emitted this pass (until Not now / close).
      const priorIncoming = (pending.incoming || []).filter((x) => x && x.messageId && !incomingCards.some((y) => y.messageId === x.messageId) && !isOwnEmail(x.sender && x.sender.email, ownList));
      const incoming = incomingCards.concat(priorIncoming).slice(0, 5);

      await write(PENDING_KEY, { offers: offers.slice(-5), asks: asks.slice(-5), incoming: incoming });

      const offeredKeys = Object.keys(offered);
      if (offeredKeys.length > 200) offeredKeys.slice(0, offeredKeys.length - 200).forEach((k) => { delete offered[k]; });
      const diagnostics = applyFileChainSilence(p.diagnostics || [], chained.silence || []).slice(0, 40);
      await write(STATE_KEY, {
        lastAt: now, lastCount: p.stats.conversations, lastIncoming: (p.incoming || []).length, lastOffers: offers.length,
        error: null, needsSignIn: false, draftConsentNeeded: Boolean(st.draftConsentNeeded),
        offered, declined: st.declined || {}, incomingDeclined: st.incomingDeclined || {},
        stateVersion: STATE_VERSION, diagnostics,
        lastSilentAt: st.lastSilentAt || null, lastRenewedAt: st.lastRenewedAt || null
      });
      let reconcile = null;
      try { reconcile = await reconcileReceipts(); } catch (e) { reconcile = { ok: false, error: String(e && e.message || e) }; }
      return {
        ok: true, conversations: p.stats.conversations, closed: p.stats.closed, moved: p.stats.moved,
        offers: offers.length, asks: p.asks.length, incoming: (p.incoming || []).length,
        ownAddressCount: ownList.length, primary: primaryAddress(auth), lines: p.lines,
        diagnostics, reconcile
      };
    }
    // ---- Do It: create a reply draft in Outlook Drafts (never send) --------------------------------------
    async function ensureDraftScope(auth, st) {
      if (hasScope(auth.token, 'Mail.ReadWrite')) return { ok: true, auth };
      // One interactive consent at the Do It moment, never on panel open.
      const r = await deps.auth.signIn(authDeps(), cfg, deps.redirectUri(), { prompt: 'select_account', loginHint: primaryAddress(auth) });
      if (!r.ok) {
        await write(STATE_KEY, Object.assign({}, st, { draftConsentNeeded: true }));
        return { ok: false, error: r.error, refused: true };
      }
      const next = Object.assign({}, auth, { token: r.token });
      await write(AUTH_KEY, next);
      await write(STATE_KEY, Object.assign({}, st, { draftConsentNeeded: false }));
      return { ok: true, auth: next };
    }

    // replyText from FlowOutlookReply / Gmail-style on-device draft. fromAddress:
    // prefer the alias the original was delivered to (Graph may allow PATCH from
    // when it is a verified mailbox alias; personal MSA often keeps the primary).
    async function createReplyDraft(incomingId, replyText, opts) {
      const o = opts || {};
      const auth = await read(AUTH_KEY, null);
      const st = await read(STATE_KEY, {});
      if (!auth || !auth.token) return { ok: false, error: 'not-connected' };
      const scoped = await ensureDraftScope(auth, st);
      if (!scoped.ok) {
        return { ok: false, error: scoped.error || 'consent', fallback: true };
      }
      const sess = await ensureSession({});
      if (!sess.ok) return { ok: false, error: sess.error, needsSignIn: Boolean(sess.needsSignIn) };
      const token = holderFor(sess.token);
      const url = cfg.GRAPH + '/me/messages/' + encodeURIComponent(incomingId) + '/createReply';
      let draft;
      try {
        draft = await graphWrite(token, 'POST', url, { comment: replyText || '' });
      } catch (e) {
        if (e.code === 'forbidden') return { ok: false, error: 'forbidden', fallback: true };
        throw e;
      }
      if (!draft || !draft.id) return { ok: false, error: 'no-draft' };
      const draftUrl = cfg.GRAPH + '/me/messages/' + encodeURIComponent(draft.id);
      if (replyText && draft.isDraft !== false) {
        try {
          await graphWrite(token, 'PATCH', draftUrl, { body: { contentType: 'Text', content: replyText } });
        } catch (e) { /* createReply comment may already hold the body */ }
      }
      // Prefer a human connected alias (never the opaque outlook_HEX@outlook.com CID
      // when a real address is known). Graph createReply often defaults From to the CID
      // on personal MSA; PATCH from+sender to the alias when Graph allows.
      const wantFrom = normAddr(o.fromAddress || primaryAddress(auth));
      let fromSet = false;
      let fromHint = null;
      if (wantFrom && draft.isDraft !== false && !isOpaqueMailbox(wantFrom)) {
        try {
          const patched = await graphWrite(token, 'PATCH', draftUrl, {
            from: { emailAddress: { address: wantFrom } },
            sender: { emailAddress: { address: wantFrom } }
          });
          const gotFrom = patched && patched.from && patched.from.emailAddress && patched.from.emailAddress.address;
          const gotSender = patched && patched.sender && patched.sender.emailAddress && patched.sender.emailAddress.address;
          fromSet = Boolean(
            (gotFrom && normAddr(gotFrom) === wantFrom) ||
            (gotSender && normAddr(gotSender) === wantFrom)
          );
          // Some Graph responses omit from/sender on PATCH; re-GET to verify.
          if (!fromSet) {
            try {
              const check = await graphGet(token, draftUrl + '?$select=id,from,sender');
              const cFrom = check && check.from && check.from.emailAddress && check.from.emailAddress.address;
              const cSender = check && check.sender && check.sender.emailAddress && check.sender.emailAddress.address;
              fromSet = Boolean(
                (cFrom && normAddr(cFrom) === wantFrom) ||
                (cSender && normAddr(cSender) === wantFrom)
              );
              if (!fromSet && ((cFrom && isOpaqueMailbox(cFrom)) || (cSender && isOpaqueMailbox(cSender)))) {
                fromHint = 'Outlook may keep its primary mailbox address on From. Set your preferred alias as primary in the Microsoft account if drafts should show that address.';
              }
            } catch (e2) { /* verification optional */ }
          }
          if (!fromSet && !fromHint) {
            fromHint = 'Outlook may keep its primary mailbox address on From. Set your preferred alias as primary in the Microsoft account if drafts should show that address.';
          }
        } catch (e) {
          fromHint = 'Outlook kept its primary From address (Graph did not accept the alias on this draft). Set your preferred address as primary in the Microsoft account, or leave as-is.';
        }
      }
      if (fromHint) {
        await write(STATE_KEY, Object.assign({}, await read(STATE_KEY, {}), { fromAliasHint: fromHint }));
      } else if (fromSet) {
        await write(STATE_KEY, Object.assign({}, await read(STATE_KEY, {}), { fromAliasHint: null }));
      }
      let attachmentId = null;
      if (o.file) {
        const attached = await attachDraftFile(token, draft.id, o.file);
        if (!attached) {
          await removeDraft(token, draft.id);
          return { ok: false, error: 'outlook-file-found-no-attach', reason: 'outlook-file-found-no-attach', attached: false };
        }
        attachmentId = attached.id;
      }
      return {
        ok: true,
        ref: draft.id,
        where: draft.webLink || null,
        attachmentId: attachmentId,
        written: attachmentId
          ? 'Reply draft ready in Outlook Drafts, with the file attached. Not sent.'
          : 'Reply draft ready in Outlook Drafts. Not sent.',
        fromAddress: wantFrom || null,
        fromSet: fromSet,
        fromHint: fromHint
      };
    }

    function attachBytes(file) {
      const raw = file && (file.contentBytes || file.base64);
      if (!raw) return null;
      const text = String(raw);
      const approx = Math.floor((text.length * 3) / 4);
      if (approx <= 0 || approx > ATTACH_MAX_BYTES) return null;
      return text;
    }

    // POST /me/messages/{draft}/attachments. The id in the response is the only
    // proof the file is on the draft. No id means it is not attached.
    async function attachDraftFile(token, draftId, file) {
      const bytes = attachBytes(file);
      if (!bytes || !draftId) return null;
      const url = cfg.GRAPH + '/me/messages/' + encodeURIComponent(draftId) + '/attachments';
      let created;
      try {
        created = await graphWrite(token, 'POST', url, {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: String((file && (file.name || file.filename)) || 'attachment').slice(0, 180),
          contentType: (file && (file.contentType || file.mimeType)) || 'application/octet-stream',
          contentBytes: bytes
        });
      } catch (e) {
        return null;
      }
      if (!created || !created.id) return null;
      return { id: created.id };
    }

    async function removeDraft(token, draftId) {
      if (!draftId) return;
      try {
        await graphWrite(token, 'DELETE', cfg.GRAPH + '/me/messages/' + encodeURIComponent(draftId), null);
      } catch (e) { /* already gone */ }
    }

    async function undoReplyDraft(draftId) {
      if (!draftId) return { ok: false, error: 'no-ref' };
      const auth = await read(AUTH_KEY, null);
      if (!auth || !auth.token) return { ok: false, error: 'not-connected' };
      const sess = await ensureSession({});
      if (!sess.ok) return { ok: false, error: sess.error };
      const token = holderFor(sess.token);
      const getUrl = cfg.GRAPH + '/me/messages/' + encodeURIComponent(draftId) + '?$select=id,isDraft';
      let msg;
      try { msg = await graphGet(token, getUrl); }
      catch (e) {
        // Already deleted (prior Undo in an older build, or user deleted it): success, clear line.
        if (e.status === 404 || e.message === 'http-404') {
          return { ok: true, alreadyGone: true, written: 'Draft was already gone. Nothing left to undo.' };
        }
        throw e;
      }
      if (!msg) return { ok: true, alreadyGone: true, written: 'Draft was already gone. Nothing left to undo.' };
      if (msg.isDraft === false) return { ok: true, alreadySent: true, written: 'Already sent, so nothing was undone.' };
      await graphWrite(token, 'DELETE', cfg.GRAPH + '/me/messages/' + encodeURIComponent(draftId), null);
      return { ok: true, written: 'Draft removed from Outlook Drafts.' };
    }

    // Verify each Outlook draft receipt against Graph. Missing draft (not sent) reopens
    // the loop; sent draft closes it for real.
    function receiptsFromState(st) {
      const log = (st && st.log) || [];
      const undoTsByMsg = Object.create(null);
      log.forEach((e) => {
        if (!e || e.kind !== 'undone' || !e.messageId) return;
        const ts = e.ts || 0;
        if (undoTsByMsg[e.messageId] == null || ts >= undoTsByMsg[e.messageId]) undoTsByMsg[e.messageId] = ts;
      });
      const out = [];
      const seen = new Set();
      log.forEach((e) => {
        if (!e || e.kind !== 'written' || e.connectorId !== 'outlookDraft' || !e.messageId) return;
        if (e.undone || e.outlookSent || e.outlookReceipt === false) return;
        const wts = e.ts || 0;
        if (undoTsByMsg[e.messageId] != null && undoTsByMsg[e.messageId] >= wts) return;
        if (seen.has(e.messageId)) return;
        seen.add(e.messageId);
        out.push(e);
      });
      return out;
    }

    async function listActiveReceipts() {
      if (typeof deps.storage.getActiveOutlookReceipts === 'function') {
        return deps.storage.getActiveOutlookReceipts();
      }
      const st = await deps.storage.get();
      return receiptsFromState(st);
    }

    async function dropReceiptAsUndone(messageId, ref) {
      if (typeof deps.storage.markOutlookDraftUndone === 'function') {
        return deps.storage.markOutlookDraftUndone(messageId, ref);
      }
      const st = await deps.storage.get();
      const log = (st.log || []).slice();
      let hit = false;
      for (let i = 0; i < log.length; i++) {
        const e = log[i];
        if (!e || e.kind !== 'written' || e.messageId !== messageId) continue;
        if (e.connectorId && e.connectorId !== 'outlookDraft') continue;
        log[i] = Object.assign({}, e, {
          kind: 'undone', label: 'Reply draft removed. Not sent.',
          undone: true, outlookReopen: true, url: null, ref: null, connectorId: 'outlookDraft', app: 'outlook'
        });
        hit = true;
        break;
      }
      if (!hit) {
        log.unshift({ ts: deps.now(), kind: 'undone', label: 'Reply draft removed. Not sent.', messageId, app: 'outlook', connectorId: 'outlookDraft', outlookReopen: true });
      }
      const resolved = (st.resolvedMessageIds || []).filter((id) => id !== messageId);
      await deps.storage.set({ log: log, resolvedMessageIds: resolved });
      return { ok: true };
    }

    async function closeReceiptAsSent(messageId, ref) {
      if (typeof deps.storage.markOutlookDraftSent === 'function') {
        return deps.storage.markOutlookDraftSent(messageId, ref);
      }
      const st = await deps.storage.get();
      const log = (st.log || []).slice();
      for (let i = 0; i < log.length; i++) {
        const e = log[i];
        if (!e || e.kind !== 'written' || e.messageId !== messageId) continue;
        if (e.connectorId && e.connectorId !== 'outlookDraft') continue;
        log[i] = Object.assign({}, e, { label: 'Reply sent from Outlook.', outlookReceipt: false, outlookSent: true });
        break;
      }
      const resolved = st.resolvedMessageIds || [];
      const next = resolved.indexOf(messageId) === -1 ? [messageId].concat(resolved) : resolved;
      await deps.storage.set({ log: log, resolvedMessageIds: next });
      return { ok: true };
    }

    async function reconcileReceipts() {
      const auth = await read(AUTH_KEY, null);
      if (!cfg.CLIENT_ID || !auth || !auth.token) return { ok: true, skipped: true, checked: 0 };
      let sess;
      try { sess = await ensureSession({}); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      if (!sess.ok) return { ok: false, error: sess.error, needsSignIn: Boolean(sess.needsSignIn) };
      const token = holderFor(sess.token);
      const receipts = await listActiveReceipts();
      let dropped = 0, sent = 0, kept = 0;
      for (const r of receipts) {
        if (!r || !r.ref) continue;
        const getUrl = cfg.GRAPH + '/me/messages/' + encodeURIComponent(r.ref) + '?$select=id,isDraft';
        let msg = null;
        let gone = false;
        try { msg = await graphGet(token, getUrl); }
        catch (e) {
          if (e.status === 404 || e.message === 'http-404') gone = true;
          else continue;
        }
        if (gone || !msg) {
          await dropReceiptAsUndone(r.messageId, r.ref);
          dropped++;
          continue;
        }
        if (msg.isDraft === false) {
          await closeReceiptAsSent(r.messageId, r.ref);
          if (r.messageId && typeof deps.storage.recordCloseQuality === 'function') {
            try { await deps.storage.recordCloseQuality({ kind: 'success', messageId: r.messageId }); } catch (e) {}
          }
          sent++;
          continue;
        }
        kept++;
      }
      return { ok: true, checked: receipts.length, dropped: dropped, sent: sent, kept: kept };
    }


    // ---- what the person answers ------------------------------------------------------------------------------
    async function acceptOffer(key) {
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      const offer = (pending.offers || []).find((x) => x.key === key);
      if (!offer) return { ok: false, error: 'gone' };
      const list = await deps.storage.getWatches();
      const graph = await deps.storage.getIdentityGraph();
      const party = Object.assign({ channel: 'outlook' }, offer.base.counterpart);
      const a = deps.identity ? deps.identity.aliasesOf(graph, party) : { emails: [] };
      let ask = offer.ask;
      const personKey = (a.emails && a.emails[0]) || party.email || null;
      if (ask.direction === 'theirs') ask = deps.followUp.personalChase(ask, list, personKey, deps.now());
      const watch = deps.followUp.buildWatch(Object.assign({ ask, now: deps.now() }, offer.base, { personKey }));
      watch.threadUrl = offer.base.threadUrl || null;
      if (!list.some((w) => w.id === watch.id && deps.followUp.isActive(w))) {
        const made = await deps.send({ type: 'flow:follow-task', payload: { title: deps.followUp.taskTitle(watch), dueIso: watch.chaseIso, what: watch.what, counterpart: watch.counterpart.name ? watch.counterpart.name + (watch.counterpart.email ? ' <' + watch.counterpart.email + '>' : '') : watch.counterpart.email, threadUrl: watch.threadUrl } });
        if (made && made.ok && made.ref) watch.taskRef = made.ref;
        await deps.storage.upsertWatch(watch);
      }
      await write(PENDING_KEY, { offers: pending.offers.filter((x) => x.key !== key), asks: pending.asks || [], incoming: pending.incoming || [] });
      return { ok: true };
    }

    async function declineOffer(key) {
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      const st = await read(STATE_KEY, {});
      await write(PENDING_KEY, { offers: (pending.offers || []).filter((x) => x.key !== key), asks: pending.asks || [], incoming: pending.incoming || [] });
      await write(STATE_KEY, Object.assign({}, st, { declined: Object.assign({}, st.declined, { [key]: deps.now() }) }));
      return { ok: true };
    }

    async function declineIncoming(key) {
      const pending = await read(PENDING_KEY, { offers: [], asks: [], incoming: [] });
      const st = await read(STATE_KEY, {});
      const incoming = (pending.incoming || []).filter((x) => x && x.key !== key && x.messageId !== key);
      await write(PENDING_KEY, { offers: pending.offers || [], asks: pending.asks || [], incoming });
      await write(STATE_KEY, Object.assign({}, st, { incomingDeclined: Object.assign({}, st.incomingDeclined, { [key]: deps.now() }) }));
      if (typeof deps.storage.forgetStillOpenScan === 'function') {
        try {
          const hit = (pending.incoming || []).find((x) => x && (x.key === key || x.messageId === key));
          if (hit && hit.messageId) await deps.storage.forgetStillOpenScan(hit.messageId);
        } catch (e) { /* optional */ }
      }
      return { ok: true };
    }

    async function dismissIncoming(key) {
      const pending = await read(PENDING_KEY, { offers: [], asks: [], incoming: [] });
      const incoming = (pending.incoming || []).filter((x) => x && x.key !== key && x.messageId !== key);
      await write(PENDING_KEY, { offers: pending.offers || [], asks: pending.asks || [], incoming });
      return { ok: true };
    }

    async function answerAsk(key, yes) {
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      const ask = (pending.asks || []).find((x) => x.key === key);
      if (!ask) return { ok: false, error: 'gone' };
      if (yes) {
        const w = (await deps.storage.getWatches()).find((x) => x.id === ask.watchId);
        await deps.storage.updateWatch(ask.watchId, ask.yes);
        if (w && ask.yes.status === 'resolved' && w.taskRef) await deps.send({ type: 'flow:follow-complete', ref: w.taskRef });
      }
      await write(PENDING_KEY, { offers: pending.offers || [], asks: pending.asks.filter((x) => x.key !== key), incoming: pending.incoming || [] });
      return { ok: true };
    }

    return {
      ORIGINS, OWA_ORIGINS, status, connect, disconnect, sync, keepAlive, ensureSession, acceptOffer, declineOffer, declineIncoming, answerAsk,
      createReplyDraft, undoReplyDraft, reconcileReceipts, assertAllowedWrite, hasScope, primaryAddress, clearOutlookJudgmentState, dismissIncoming, STATE_VERSION
    };
  }

  return { ORIGINS, OWA_ORIGINS, MIN_INTERVAL_MS, SILENT_REAUTH_AFTER_MS, create };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlook };
