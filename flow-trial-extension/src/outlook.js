// Outlook, through Microsoft's own mail API (Microsoft Graph), run from the popup / side panel. The browser half of
// core/outlook-sync.js: sign in, fetch the last couple of weeks of one mailbox, hand them to the planner, apply what it decides.
//
// What this is, and is not (docs/multi-platform.md):
//   - It runs while Glance's panel is open (on open, every ten minutes, and on "Check now"). There is no background polling.
//   - It reads the last 14 days of the inbox and the sent folder, on this device, with the person's own Microsoft sign-in.
//     Nothing is sent to Glance's servers.
//   - On Do It for an incoming ask, it writes a reply DRAFT into the person's Outlook Drafts (Graph createReply) with
//     Mail.ReadWrite. It never sends: never Mail.Send, never /send, /reply, /replyAll, /forward, /sendMail.
//   - Allowed non-GET Graph calls: createReply, PATCH of a Glance-created draft, DELETE of a Glance-created draft.
//   - Everything it can decide on its own is a loop CLOSING or MOVING because of an answer. A new loop from an offer is
//     only ever offered, and created when the person taps. Incoming asks appear in Still Open with Do It.
const FlowOutlook = (() => {
  const ORIGINS = ['https://graph.microsoft.com/*', 'https://login.microsoftonline.com/*'];
  const AUTH_KEY = 'outlookAuth';
  const STATE_KEY = 'outlookSync';
  const PENDING_KEY = 'outlookPending';
  const MIN_INTERVAL_MS = 10 * 60 * 1000;
  const SILENT_REAUTH_AFTER_MS = 20 * 60 * 60 * 1000; // 20h into the 24h SPA window
  const SELECT = 'id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,isDraft,body,webLink';
  const OWN_LEARNED_CAP = 20;

  // Non-GET Graph paths Glance is allowed to call. Anything else throws.
  const WRITE_ALLOW = [
    /\/me\/messages\/[^/]+\/createReply$/i,
    /\/me\/messages\/[^/]+$/i  // PATCH or DELETE of a message (draft only, enforced in writers)
  ];
  const FORBIDDEN_SEND = /\/(send|reply|replyAll|forward|sendMail)(\b|$)/i;

  // deps: { storage, cfg, auth, plan, fetch, launch, launchSilent?, redirectUri(), permissions, send, random, sha256, now,
  //         planDeps, identity, followUp, actions?, intent? }
  function create(deps) {
    const cfg = deps.cfg;

    async function read(key, fallback) { const st = await deps.storage.get(); return st && st[key] != null ? st[key] : fallback; }
    async function write(key, value) { await deps.storage.set({ [key]: value }); }

    function primaryAddress(auth) {
      if (!auth) return null;
      const learned = (auth.ownAddresses || []).filter(Boolean);
      if (learned.length) return learned[0];
      if (auth.account && auth.account.address) return auth.account.address;
      return null;
    }

    async function status() {
      const auth = await read(AUTH_KEY, null);
      const st = await read(STATE_KEY, {});
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      return {
        configured: Boolean(cfg.CLIENT_ID), connected: Boolean(auth && auth.token), account: auth && auth.account || null,
        primary: primaryAddress(auth),
        needsSignIn: Boolean(st.needsSignIn), draftConsentNeeded: Boolean(st.draftConsentNeeded),
        lastAt: st.lastAt || null, lastCount: st.lastCount || 0,
        error: st.error || null, errorDetail: st.errorDetail || null, aadsts: st.aadsts || null,
        redirectUri: deps.redirectUri(), offers: (pending.offers || []).length, asks: (pending.asks || []).length, origins: ORIGINS
      };
    }

    // ---- Graph ------------------------------------------------------------------------------------------------
    async function graphGet(token, url) {
      const res = await deps.fetch(url, { headers: { Authorization: 'Bearer ' + token, Prefer: 'outlook.body-content-type="text"' } });
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
      const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
      const res = await deps.fetch(url, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
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
      if (deps.graphMail && deps.graphMail.ownAddressesFrom) {
        return Array.from(deps.graphMail.ownAddressesFrom(profile, learned));
      }
      const { FlowGraphMail } = (typeof require !== 'undefined' ? (() => { try { return require('../core/graph-mail.js'); } catch (e) { return {}; } })() : {});
      if (FlowGraphMail && FlowGraphMail.ownAddressesFrom) return Array.from(FlowGraphMail.ownAddressesFrom(profile, learned));
      const s = new Set();
      const add = (a) => { if (a) s.add(String(a).toLowerCase()); };
      if (profile) { add(profile.mail); add(profile.userPrincipalName); (profile.otherMails || []).forEach(add); }
      (learned || []).forEach(add);
      return Array.from(s);
    }

    async function connect(opts) {
      if (!cfg.CLIENT_ID) return { ok: false, error: 'not-configured' };
      const granted = await deps.permissions.request({ origins: ORIGINS });
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
      await write(STATE_KEY, { lastAt: null, lastCount: 0, error: null, needsSignIn: false, draftConsentNeeded: false, offered: {}, declined: {}, incomingDeclined: {} });
      const s = await sync({ force: true });
      return Object.assign({ ok: true, account }, { sync: s });
    }

    async function disconnect() {
      await write(AUTH_KEY, null);
      await write(STATE_KEY, {});
      await write(PENDING_KEY, { offers: [], asks: [] });
      try { await deps.permissions.remove({ origins: ORIGINS }); } catch (e) { /* tokens are gone either way */ }
      return { ok: true };
    }

    async function trySilent(auth, st) {
      const hint = primaryAddress(auth);
      if (!hint || typeof deps.launchSilent !== 'function') return { ok: false, needsInteraction: true, error: 'no-silent' };
      const r = await deps.auth.silentReauth(authDeps(), cfg, deps.redirectUri(), hint);
      if (r.ok) {
        await write(AUTH_KEY, Object.assign({}, auth, { token: r.token }));
        return { ok: true, token: r.token };
      }
      if (r.error === 'consent_required') {
        await write(STATE_KEY, Object.assign({}, st, { draftConsentNeeded: true, error: r.error, aadsts: r.aadsts || null, errorDetail: r.description || null }));
        return { ok: false, needsInteraction: true, error: r.error, draftConsentNeeded: true };
      }
      return r;
    }

    // ---- one check --------------------------------------------------------------------------------------------
    async function sync(opts) {
      const o = opts || {};
      let auth = await read(AUTH_KEY, null);
      if (!cfg.CLIENT_ID || !auth || !auth.token) return { ok: false, error: 'not-connected' };
      let st = await read(STATE_KEY, {});
      const now = deps.now();
      if (!o.force && st.lastAt && now - st.lastAt < MIN_INTERVAL_MS) return { ok: true, skipped: true };

      // Silent renewal before the 24h SPA window ends, or when refresh fails with invalid_grant.
      const rtAge = auth.token.rtIssuedAt ? (now - auth.token.rtIssuedAt) : 0;
      if (rtAge > SILENT_REAUTH_AFTER_MS) {
        const silent = await trySilent(auth, st);
        if (silent.ok) { auth = await read(AUTH_KEY, null); st = await read(STATE_KEY, {}); }
        else if (silent.needsInteraction) {
          await write(STATE_KEY, Object.assign({}, st, { error: silent.error || 'expired', needsSignIn: true, aadsts: silent.aadsts || null, errorDetail: silent.description || null }));
          return { ok: false, error: silent.error, needsSignIn: true };
        }
      }

      let fresh = await deps.auth.ensureFresh({ fetch: deps.fetch, now: deps.now }, cfg, auth.token);
      if (!fresh.ok && fresh.reauth) {
        const silent = await trySilent(auth, st);
        if (silent.ok) {
          auth = await read(AUTH_KEY, null);
          fresh = { ok: true, token: auth.token, refreshed: true };
        } else {
          await write(STATE_KEY, Object.assign({}, st, {
            error: fresh.error, needsSignIn: true,
            aadsts: fresh.aadsts || silent.aadsts || null,
            errorDetail: fresh.description || silent.description || null
          }));
          return { ok: false, error: fresh.error, needsSignIn: true, aadsts: fresh.aadsts || null };
        }
      } else if (!fresh.ok) {
        await write(STATE_KEY, Object.assign({}, st, { error: fresh.error, needsSignIn: Boolean(fresh.reauth), aadsts: fresh.aadsts || null, errorDetail: fresh.description || null }));
        return { ok: false, error: fresh.error, needsSignIn: Boolean(fresh.reauth) };
      }
      if (fresh.refreshed) await write(AUTH_KEY, Object.assign({}, auth, { token: fresh.token }));

      let messages;
      try {
        const since = new Date(now - cfg.LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
        const inbox = await folder(fresh.token.accessToken, 'inbox', since);
        const sent = await folder(fresh.token.accessToken, 'sentitems', since);
        // Learn own addresses from sentitems senders.
        const learned = [];
        sent.forEach((m) => {
          const a = m.from && m.from.emailAddress && m.from.emailAddress.address;
          if (a) learned.push(String(a).toLowerCase());
        });
        const prevOwn = auth.ownAddresses || [];
        const ownAddresses = buildOwnAddresses(auth.profile || { mail: auth.account && auth.account.mail, userPrincipalName: auth.account && auth.account.userPrincipalName }, prevOwn.concat(learned)).slice(0, OWN_LEARNED_CAP);
        // Primary = sentitems sender if known, else mail, else UPN.
        const sentPrimary = learned[0] || null;
        const primary = sentPrimary || ownAddresses[0] || (auth.account && auth.account.address);
        if (ownAddresses.join('|') !== (prevOwn || []).join('|') || (auth.account && auth.account.address) !== primary) {
          await write(AUTH_KEY, Object.assign({}, auth, {
            ownAddresses,
            account: Object.assign({}, auth.account, { address: primary }),
            token: fresh.token
          }));
          auth = await read(AUTH_KEY, null);
        }
        messages = inbox.concat(sent);
      } catch (e) {
        const reauth = e.code === 'auth';
        await write(STATE_KEY, Object.assign({}, st, { error: e.code === 'auth' ? 'auth' : (e.message || 'error'), needsSignIn: reauth }));
        return { ok: false, error: e.message, needsSignIn: reauth };
      }

      const meSet = auth.ownAddresses && auth.ownAddresses.length ? auth.ownAddresses : (auth.account && auth.account.address);
      const watches = await deps.storage.getWatches();
      const graph = await deps.storage.getIdentityGraph();
      const p = deps.plan({ messages, me: meSet, watches, graph, state: st, now, deps: deps.planDeps });

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

      // Offers and asks (existing).
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      const offered = Object.assign({}, st.offered);
      const offers = (pending.offers || []).filter((x) => !watches.some((w) => w.id === x.base.threadId && deps.followUp.isActive(w)));
      p.offers.forEach((x) => { if (!offers.some((y) => y.key === x.key)) { offers.push(x); } offered[x.key] = now; });
      const asks = (pending.asks || []).slice();
      p.asks.forEach((x) => { if (!asks.some((y) => y.key === x.key)) asks.push(x); });
      await write(PENDING_KEY, { offers: offers.slice(-5), asks: asks.slice(-5) });

      // Incoming asks: store the SAME way Gmail stores a shown chip / still-open item.
      for (const inc of (p.incoming || [])) {
        const intent = inc.intent;
        const actions = deps.actions || (typeof FlowActions !== 'undefined' ? FlowActions : null);
        if (!actions || !intent) continue;
        const process = actions.planFor(intent, { threadUrl: inc.base.threadUrl, hasThreadAttachment: false });
        if (!process) continue;
        // Map gmailDraft -> outlookDraft for Outlook items; never run gmailDraft on an Outlook item.
        const steps = (process.steps || []).map((s) => s.kind === 'gmailDraft' ? Object.assign({}, s, { kind: 'outlookDraft', id: (s.id || 'draft').replace(/^gmail/, 'outlook') }) : s);
        const outlookProcess = Object.assign({}, process, { steps });
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
          text: (inc.base.subject ? inc.base.subject + '\n' : '') + (inc.base.text || ''),
          outlookIncomingId: inc.messageId,
          outlookConversationId: inc.conversationId
        };
        if (typeof deps.storage.upsertStillOpenScan === 'function') {
          try { await deps.storage.upsertStillOpenScan(entry); } catch (e) { /* keep going */ }
        }
        // Also a shown log row so getPending / Brief see it (deduped by messageId).
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
                outlookIncomingId: inc.messageId
              });
            }
          } catch (e) { /* optional */ }
        }
      }

      const offeredKeys = Object.keys(offered);
      if (offeredKeys.length > 200) offeredKeys.slice(0, offeredKeys.length - 200).forEach((k) => { delete offered[k]; });
      await write(STATE_KEY, {
        lastAt: now, lastCount: p.stats.conversations, error: null, needsSignIn: false,
        draftConsentNeeded: Boolean(st.draftConsentNeeded),
        offered, declined: st.declined || {}, incomingDeclined: st.incomingDeclined || {}
      });
      return {
        ok: true, conversations: p.stats.conversations, closed: p.stats.closed, moved: p.stats.moved,
        offers: p.offers.length, asks: p.asks.length, incoming: (p.incoming || []).length, lines: p.lines
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

    // replyText comes from the same on-device draft writer Gmail uses when available.
    async function createReplyDraft(incomingId, replyText) {
      const auth = await read(AUTH_KEY, null);
      const st = await read(STATE_KEY, {});
      if (!auth || !auth.token) return { ok: false, error: 'not-connected' };
      const scoped = await ensureDraftScope(auth, st);
      if (!scoped.ok) {
        // Fallback: task + Open in Outlook.
        return { ok: false, error: scoped.error || 'consent', fallback: true };
      }
      const fresh = await deps.auth.ensureFresh({ fetch: deps.fetch, now: deps.now }, cfg, scoped.auth.token);
      if (!fresh.ok) return { ok: false, error: fresh.error, needsSignIn: Boolean(fresh.reauth) };
      const token = fresh.token.accessToken;
      const url = cfg.GRAPH + '/me/messages/' + encodeURIComponent(incomingId) + '/createReply';
      let draft;
      try {
        draft = await graphWrite(token, 'POST', url, { comment: replyText || '' });
      } catch (e) {
        if (e.code === 'forbidden') return { ok: false, error: 'forbidden', fallback: true };
        throw e;
      }
      if (!draft || !draft.id) return { ok: false, error: 'no-draft' };
      // Optional PATCH only if body must be set after creation and isDraft is true.
      if (replyText && draft.isDraft !== false && (!draft.body || !draft.body.content)) {
        try {
          await graphWrite(token, 'PATCH', cfg.GRAPH + '/me/messages/' + encodeURIComponent(draft.id), {
            body: { contentType: 'Text', content: replyText }
          });
        } catch (e) { /* draft still exists from createReply */ }
      }
      return {
        ok: true,
        ref: draft.id,
        where: draft.webLink || null,
        written: 'Reply draft ready in Outlook Drafts. Not sent.'
      };
    }

    async function undoReplyDraft(draftId) {
      if (!draftId) return { ok: false, error: 'no-ref' };
      const auth = await read(AUTH_KEY, null);
      if (!auth || !auth.token) return { ok: false, error: 'not-connected' };
      const fresh = await deps.auth.ensureFresh({ fetch: deps.fetch, now: deps.now }, cfg, auth.token);
      if (!fresh.ok) return { ok: false, error: fresh.error };
      const token = fresh.token.accessToken;
      const getUrl = cfg.GRAPH + '/me/messages/' + encodeURIComponent(draftId) + '?$select=id,isDraft';
      let msg;
      try { msg = await graphGet(token, getUrl); }
      catch (e) {
        if (e.status === 404 || e.message === 'http-404') return { ok: true, alreadySent: true, written: 'Already sent, so nothing was undone.' };
        throw e;
      }
      if (!msg || msg.isDraft === false) return { ok: true, alreadySent: true, written: 'Already sent, so nothing was undone.' };
      await graphWrite(token, 'DELETE', cfg.GRAPH + '/me/messages/' + encodeURIComponent(draftId), null);
      return { ok: true, written: 'Draft removed from Outlook Drafts.' };
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
      await write(PENDING_KEY, { offers: pending.offers.filter((x) => x.key !== key), asks: pending.asks || [] });
      return { ok: true };
    }

    async function declineOffer(key) {
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      const st = await read(STATE_KEY, {});
      await write(PENDING_KEY, { offers: (pending.offers || []).filter((x) => x.key !== key), asks: pending.asks || [] });
      await write(STATE_KEY, Object.assign({}, st, { declined: Object.assign({}, st.declined, { [key]: deps.now() }) }));
      return { ok: true };
    }

    async function declineIncoming(key) {
      const st = await read(STATE_KEY, {});
      await write(STATE_KEY, Object.assign({}, st, { incomingDeclined: Object.assign({}, st.incomingDeclined, { [key]: deps.now() }) }));
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
      await write(PENDING_KEY, { offers: pending.offers || [], asks: pending.asks.filter((x) => x.key !== key) });
      return { ok: true };
    }

    return {
      ORIGINS, status, connect, disconnect, sync, acceptOffer, declineOffer, declineIncoming, answerAsk,
      createReplyDraft, undoReplyDraft, assertAllowedWrite, hasScope, primaryAddress
    };
  }

  return { ORIGINS, MIN_INTERVAL_MS, SILENT_REAUTH_AFTER_MS, create };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlook };
