// Outlook, through Microsoft's own mail API (Microsoft Graph), run from the popup / side panel. The browser half of
// core/outlook-sync.js: sign in, fetch the last couple of weeks of one mailbox, hand them to the planner, apply what it decides.
//
// What this is, and is not (docs/multi-platform.md):
//   - It runs while Glance's panel is open (on open, every ten minutes, and on "Check now"). There is no background polling.
//   - It reads the last 14 days of the inbox and the sent folder, on this device, with the person's own Microsoft sign-in.
//     Nothing is sent to Glance's servers. It never writes to the mailbox: the only permissions asked are read-only.
//   - Everything it can decide on its own is a loop CLOSING or MOVING because of an answer, the same rules as Gmail. A new loop is
//     only ever offered, and created when the person taps.
// Everything the browser provides is passed in (`deps`), so the same code is tested in Node with fakes.
const FlowOutlook = (() => {
  const ORIGINS = ['https://graph.microsoft.com/*', 'https://login.microsoftonline.com/*'];
  const AUTH_KEY = 'outlookAuth';
  const STATE_KEY = 'outlookSync';
  const PENDING_KEY = 'outlookPending';
  const MIN_INTERVAL_MS = 10 * 60 * 1000;
  const SELECT = 'id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,isDraft,body,webLink';

  // deps: { storage (FlowStorage), cfg (FlowOutlookConfig), auth (FlowOutlookAuth), plan (FlowOutlookSync.plan), fetch, launch(url),
  //         redirectUri(), permissions:{ request, contains, remove }, send(msg), random(n), sha256(bytes), now(), planDeps, identity (FlowIdentity),
  //         followUp (FlowFollowUp) }
  function create(deps) {
    const cfg = deps.cfg;

    async function read(key, fallback) { const st = await deps.storage.get(); return st && st[key] != null ? st[key] : fallback; }
    async function write(key, value) { await deps.storage.set({ [key]: value }); }

    async function status() {
      const auth = await read(AUTH_KEY, null);
      const st = await read(STATE_KEY, {});
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      return {
        configured: Boolean(cfg.CLIENT_ID), connected: Boolean(auth && auth.token), account: auth && auth.account || null,
        needsSignIn: Boolean(st.needsSignIn), lastAt: st.lastAt || null, lastCount: st.lastCount || 0, error: st.error || null,
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
    async function folder(token, name, sinceIso) {
      let url = cfg.GRAPH + '/me/mailFolders/' + name + '/messages?$top=' + cfg.PAGE_SIZE + '&$orderby=' + encodeURIComponent('receivedDateTime desc') + '&$filter=' + encodeURIComponent('receivedDateTime ge ' + sinceIso) + '&$select=' + SELECT;
      const out = [];
      for (let page = 0; url && page < cfg.MAX_PAGES; page++) {
        const data = await graphGet(token, url);
        (data.value || []).forEach((m) => out.push(m));
        // Only ever follow a next-page link that stays on Microsoft Graph: the bearer token must never be sent anywhere else.
        const next = data['@odata.nextLink'] || null;
        url = next && next.indexOf(cfg.GRAPH.replace(/\/v1\.0$/, '') + '/') === 0 ? next : null;
      }
      return out;
    }

    function authDeps() { return { fetch: deps.fetch, random: deps.random, sha256: deps.sha256, launch: deps.launch, now: deps.now }; }

    async function connect() {
      if (!cfg.CLIENT_ID) return { ok: false, error: 'not-configured' };
      const granted = await deps.permissions.request({ origins: ORIGINS });
      if (!granted) return { ok: false, error: 'permission' };
      const r = await deps.auth.signIn(authDeps(), cfg, deps.redirectUri());
      if (!r.ok) return { ok: false, error: r.error };
      let account = null;
      try {
        const me = await graphGet(r.token.accessToken, cfg.GRAPH + '/me?$select=mail,userPrincipalName,displayName');
        account = { address: String(me.mail || me.userPrincipalName || '').toLowerCase(), name: me.displayName || null };
      } catch (e) { return { ok: false, error: 'profile' }; }
      if (!account.address) return { ok: false, error: 'profile' };
      await write(AUTH_KEY, { token: r.token, account });
      await write(STATE_KEY, { lastAt: null, lastCount: 0, error: null, needsSignIn: false, offered: {}, declined: {} });
      const s = await sync({ force: true });
      return Object.assign({ ok: true, account }, { sync: s });
    }

    async function disconnect() {
      await write(AUTH_KEY, null);
      await write(STATE_KEY, {});
      await write(PENDING_KEY, { offers: [], asks: [] });
      try { await deps.permissions.remove({ origins: ORIGINS }); } catch (e) { /* the browser may refuse; the tokens are gone either way */ }
      return { ok: true };
    }

    // ---- one check --------------------------------------------------------------------------------------------
    async function sync(opts) {
      const o = opts || {};
      const auth = await read(AUTH_KEY, null);
      if (!cfg.CLIENT_ID || !auth || !auth.token) return { ok: false, error: 'not-connected' };
      const st = await read(STATE_KEY, {});
      const now = deps.now();
      if (!o.force && st.lastAt && now - st.lastAt < MIN_INTERVAL_MS) return { ok: true, skipped: true };

      const fresh = await deps.auth.ensureFresh({ fetch: deps.fetch, now: deps.now }, cfg, auth.token);
      if (!fresh.ok) {
        await write(STATE_KEY, Object.assign({}, st, { error: fresh.error, needsSignIn: Boolean(fresh.reauth) }));
        return { ok: false, error: fresh.error, needsSignIn: Boolean(fresh.reauth) };
      }
      if (fresh.refreshed) await write(AUTH_KEY, Object.assign({}, auth, { token: fresh.token }));

      let messages;
      try {
        const since = new Date(now - cfg.LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
        const inbox = await folder(fresh.token.accessToken, 'inbox', since);
        const sent = await folder(fresh.token.accessToken, 'sentitems', since);
        messages = inbox.concat(sent);
      } catch (e) {
        const reauth = e.code === 'auth';
        await write(STATE_KEY, Object.assign({}, st, { error: e.code === 'auth' ? 'auth' : (e.message || 'error'), needsSignIn: reauth }));
        return { ok: false, error: e.message, needsSignIn: reauth };
      }

      const watches = await deps.storage.getWatches();
      const graph = await deps.storage.getIdentityGraph();
      const p = deps.plan({ messages, me: auth.account.address, watches, graph, state: st, now, deps: deps.planDeps });

      for (const party of p.parties) { try { await deps.storage.observeIdentity(party); } catch (e) { /* optional */ } }

      for (const item of p.patches) {
        const w = watches.find((x) => x.id === item.id);
        const next = (await deps.storage.updateWatch(item.id, item.patch)) || Object.assign({}, w || {}, item.patch);
        if (!w) continue;
        if (item.patch.status === 'resolved' && w.status !== 'resolved') {
          if (w.taskRef) await deps.send({ type: 'flow:follow-complete', ref: w.taskRef });
          if (typeof deps.storage.recordOutcomeLabel === 'function' && item.patch.resolvedBy === 'reply') deps.storage.recordOutcomeLabel('autoClosed', w.id + '|' + (item.patch.resolvedAt || '')).catch(() => {});
        } else if (item.patch.chaseIso && item.patch.chaseIso !== w.chaseIso && w.taskRef) {
          await deps.send({ type: 'flow:follow-reschedule', ref: w.taskRef, dueIso: item.patch.chaseIso, title: deps.followUp.taskTitle(next) });
        }
      }

      // What waits for the person: new offers and questions, without duplicates, bounded.
      const pending = await read(PENDING_KEY, { offers: [], asks: [] });
      const offered = Object.assign({}, st.offered);
      const offers = (pending.offers || []).filter((x) => !watches.some((w) => w.id === x.base.threadId && deps.followUp.isActive(w)));
      p.offers.forEach((x) => { if (!offers.some((y) => y.key === x.key)) { offers.push(x); } offered[x.key] = now; });
      const asks = (pending.asks || []).slice();
      p.asks.forEach((x) => { if (!asks.some((y) => y.key === x.key)) asks.push(x); });
      await write(PENDING_KEY, { offers: offers.slice(-5), asks: asks.slice(-5) });
      const offeredKeys = Object.keys(offered);
      if (offeredKeys.length > 200) offeredKeys.slice(0, offeredKeys.length - 200).forEach((k) => { delete offered[k]; });
      await write(STATE_KEY, { lastAt: now, lastCount: p.stats.conversations, error: null, needsSignIn: false, offered, declined: st.declined || {} });
      return { ok: true, conversations: p.stats.conversations, closed: p.stats.closed, moved: p.stats.moved, offers: p.offers.length, asks: p.asks.length, lines: p.lines };
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

    return { ORIGINS, status, connect, disconnect, sync, acceptOffer, declineOffer, answerAsk };
  }

  return { ORIGINS, MIN_INTERVAL_MS, create };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlook };
