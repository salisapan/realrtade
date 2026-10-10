// The clients page: what is missing from whom (core/client-requests.js decides, src/client-requests-store.js keeps).
// Every element is built with textContent: client names and message text never become markup.
(() => {
  const C = FlowClientRequests;
  const store = FlowClientRequestStore.create();
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const STATUS = { missing: 'חסר', check: 'לבדוק', claimed: 'הלקוח אומר ששלח', received: 'התקבל', none: 'אין (לפי הלקוח)', released: 'לא נדרש' };
  const inExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  let openReminder = null;

  function dayHe(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1);
  }

  async function render() {
    const st = await store.load();
    const now = Date.now();
    const b = C.board(st.requests, now);
    const t = b.totals;
    const totals = $('totals');
    totals.textContent = '';
    if (t.clients) {
      [['לקוחות ממתינים', t.clients], ['מסמכים חסרים', t.missing], ['לבדיקה שלכם', t.check], ['באיחור', t.overdue]].forEach(([label, n], i) => {
        if (i) totals.appendChild(document.createTextNode(' · '));
        totals.appendChild(el('b', null, String(n))); totals.appendChild(document.createTextNode(' ' + label));
      });
    }
    const board = $('board');
    board.textContent = '';
    $('empty').hidden = b.rows.length > 0;
    for (const row of b.rows) board.appendChild(clientCard(row, st, now));
    const closed = st.requests.filter((r) => r.status !== 'open').slice(0, 10);
    $('closedWrap').hidden = !closed.length;
    const cl = $('closedList'); cl.textContent = '';
    closed.forEach((r) => cl.appendChild(el('li', null, (r.client.name || r.client.email || 'לקוח') + ': ' + r.items.map((i) => C.labelOf(i, 'he')).join(', ') + (r.status === 'closed' ? ' — הכל הגיע' : ' — סגור'))));
    renderTemplates(st);
  }

  function clientCard(row, st, now) {
    const card = el('article', 'client' + (row.overdue ? ' overdue' : ''));
    const head = el('div', 'c-head');
    head.appendChild(el('span', 'c-name', row.client.name || row.client.email || 'לקוח'));
    if (row.client.email && row.client.name) head.appendChild(el('span', 'c-mail', row.client.email));
    const meta = el('span', 'c-meta');
    if (row.overdue) meta.appendChild(el('span', 'badge late', 'הגיע הזמן לתזכורת'));
    if (row.deadlineIso) meta.appendChild(document.createTextNode(' עד ' + dayHe(row.deadlineIso)));
    head.appendChild(meta);
    card.appendChild(head);

    const reqs = st.requests.filter((r) => r.status === 'open' && (r.client.email || r.client.name || r.id) === (row.client.email || row.client.name || r.id) && C.missingItems(r).length);
    const list = el('ul', 'items');
    for (const r of reqs) {
      for (const it of r.items) {
        if (it.status === 'released') continue;
        const li = el('li', 'item');
        li.appendChild(el('span', 'i-label', C.labelOf(it, 'he')));
        li.appendChild(el('span', 'pill ' + it.status, STATUS[it.status] || it.status));
        const acts = el('span', 'i-actions');
        const btn = (label, verdict, cls) => { const b = el('button', 'mini' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', async () => { await store.decide(r.id, it.key, verdict, Date.now()); render(); }); acts.appendChild(b); };
        if (it.status === 'check') { btn('זה המסמך', 'confirm', 'ok'); btn('לא זה', 'reject'); }
        else if (it.status === 'missing' || it.status === 'claimed') { btn('התקבל', 'received', 'ok'); btn('לא נדרש', 'release'); }
        li.appendChild(acts);
        const note = it.status === 'check' && it.proof.length ? 'הגיע קובץ: ' + (it.proof[it.proof.length - 1].name || '') + ' — האם זה המסמך?' : it.signed && it.status === 'received' ? 'הקובץ התקבל; את החתימה כדאי לבדוק בעין.' : it.note && it.note !== 'partial' ? it.note : it.note === 'partial' ? 'התקבל חלק מהחודשים.' : '';
        if (note) li.appendChild(el('span', 'i-note', note));
        list.appendChild(li);
      }
    }
    card.appendChild(list);

    const foot = el('div', 'c-foot');
    const remBtn = el('button', 'primary', 'הכן תזכורת'); remBtn.type = 'button';
    foot.appendChild(remBtn);
    if (row.nextChaseIso) foot.appendChild(el('span', 'status-line', 'תזכורת הבאה: ' + dayHe(row.nextChaseIso)));
    card.appendChild(foot);
    const remWrap = el('div');
    card.appendChild(remWrap);
    const key = row.client.email || row.client.name;
    remBtn.addEventListener('click', () => { openReminder = openReminder === key ? null : key; showReminder(remWrap, reqs); });
    if (openReminder === key) showReminder(remWrap, reqs);
    return card;
  }

  function showReminder(wrap, reqs) {
    wrap.textContent = '';
    if (!reqs.length) return;
    // One reminder per client: the oldest open request carries the thread; the others' missing items join its list.
    const base = JSON.parse(JSON.stringify(reqs[0]));
    reqs.slice(1).forEach((r) => C.missingItems(r).forEach((i) => base.items.push(i)));
    const text = C.reminderDraft(base, { level: (base.nudges || 0) + 1, lang: 'he' });
    if (!text) return;
    const box = el('div', 'reminder');
    box.appendChild(el('div', 'hint', 'זו התזכורת. אפשר לערוך. Glance לא שולח: הוא יוצר טיוטה בתוך השרשור ב-Gmail, ואתם שולחים.'));
    const ta = el('textarea'); ta.value = text; box.appendChild(ta);
    const bar = el('div', 'bar');
    const status = el('span', 'status-line');
    if (inExtension && base.client.email) {
      const draft = el('button', 'primary', 'צור טיוטה ב-Gmail'); draft.type = 'button';
      draft.addEventListener('click', () => {
        draft.disabled = true; status.className = 'status-line'; status.textContent = 'יוצר טיוטה…';
        chrome.runtime.sendMessage({ type: 'flow:follow-draft', payload: { to: base.client.email, toName: base.client.name || '', subject: C.reminderSubject(base, 'he'), body: ta.value } }, async (res) => {
          if (res && res.ok) {
            for (const r of reqs) await store.markNudged(r.id, Date.now());
            status.className = 'status-line good'; status.textContent = 'נוצרה טיוטה ב-Gmail. שלחו אותה משם. התזכורת הבאה נקבעה.';
            const a = el('a', null, 'פתח טיוטות'); a.href = res.url || 'https://mail.google.com/mail/u/0/#drafts'; a.target = '_blank'; a.rel = 'noopener'; status.appendChild(document.createTextNode(' ')); status.appendChild(a);
          } else {
            draft.disabled = false; status.className = 'status-line bad';
            status.textContent = res && res.reason === 'not-connected' ? 'צריך לחבר את Google ב-Glance כדי ליצור טיוטה. בינתיים אפשר להעתיק.' : 'לא הצלחתי ליצור טיוטה. אפשר להעתיק ולשלוח ידנית.';
          }
        });
      });
      bar.appendChild(draft);
    }
    const copy = el('button', 'ghost', 'העתק'); copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value); status.className = 'status-line good'; status.textContent = 'הועתק.'; }
      catch (e) { ta.select(); status.textContent = 'סמנו והעתיקו.'; }
    });
    bar.appendChild(copy);
    const sent = el('button', 'ghost', 'שלחתי בעצמי'); sent.type = 'button';
    sent.addEventListener('click', async () => { for (const r of reqs) await store.markNudged(r.id, Date.now()); status.className = 'status-line good'; status.textContent = 'נרשם. התזכורת הבאה נקבעה.'; render(); });
    bar.appendChild(sent);
    box.appendChild(bar); box.appendChild(status);
    wrap.appendChild(box);
  }

  // ---- a new request ----------------------------------------------------------------------------------------------
  function readNew() {
    const ask = C.classifyOutgoingRequest($('nText').value, { now: Date.now() });
    const prev = $('nPreview'); prev.textContent = '';
    const okClient = $('nEmail').value.trim() || $('nName').value.trim();
    if (!$('nText').value.trim()) { $('nSave').disabled = true; return null; }
    if (!ask) { prev.appendChild(el('p', 'none', 'לא מצאתי בהודעה בקשה למסמך, לחתימה או לתשלום. נסו לנסח: "נא להעביר…", "חסרים…".')); $('nSave').disabled = true; return null; }
    prev.appendChild(el('div', null, 'Glance יעקוב אחרי:'));
    const ul = el('ul'); ask.items.forEach((i) => ul.appendChild(el('li', null, C.labelOf(i, 'he')))); prev.appendChild(ul);
    if (ask.deadlineIso) prev.appendChild(el('div', 'hint', 'עד ' + dayHe(ask.deadlineIso)));
    $('nSave').disabled = !okClient;
    return ask;
  }
  ['nText', 'nEmail', 'nName'].forEach((id) => $(id).addEventListener('input', readNew));
  $('newBtn').addEventListener('click', () => { $('newPanel').hidden = !$('newPanel').hidden; $('tplPanel').hidden = true; if (!$('newPanel').hidden) $('nName').focus(); });
  $('nCancel').addEventListener('click', () => { $('newPanel').hidden = true; });
  $('nSave').addEventListener('click', async () => {
    const req = await store.addFromText({ text: $('nText').value, client: { email: $('nEmail').value.trim() || null, name: $('nName').value.trim() || null }, now: Date.now() });
    if (!req) return;
    $('nText').value = ''; $('nName').value = ''; $('nEmail').value = ''; $('nPreview').textContent = ''; $('newPanel').hidden = true;
    render();
  });

  // ---- recurring checklists ---------------------------------------------------------------------------------------
  const sel = $('tPreset');
  Object.keys(C.PRESETS).forEach((k) => { const o = el('option', null, C.PRESETS[k].he); o.value = k; sel.appendChild(o); });
  function renderTemplates(st) {
    const ul = $('tplList'); ul.textContent = '';
    st.templates.forEach((t) => {
      const li = el('li');
      li.appendChild(el('span', null, (t.client.name || t.client.email) + ' — ' + (C.PRESETS[t.preset] ? C.PRESETS[t.preset].he : t.preset)));
      const rm = el('button', 'mini', 'הסר'); rm.type = 'button'; rm.addEventListener('click', async () => { await store.removeTemplate(t.id); render(); });
      li.appendChild(rm); ul.appendChild(li);
    });
  }
  $('tplBtn').addEventListener('click', () => { $('tplPanel').hidden = !$('tplPanel').hidden; $('newPanel').hidden = true; });
  $('tAdd').addEventListener('click', async () => {
    const email = $('tEmail').value.trim(), name = $('tName').value.trim();
    if (!email && !name) return;
    await store.addTemplate({ id: (email || name) + ':' + sel.value, preset: sel.value, client: { email: email ? email.toLowerCase() : null, name: name || null }, lang: 'he', dueInDays: 7 });
    $('tEmail').value = ''; $('tName').value = '';
    render();
  });
  $('dueBtn').addEventListener('click', async () => {
    const made = await store.openDueTemplates(Date.now());
    const st = await store.load();
    const msg = made.length ? 'נפתחו ' + made.length + ' בקשות. לכל לקוח יש עכשיו "הכן תזכורת".' : (st.templates.length ? 'אין בקשות חדשות לפתוח היום: כל הרשימות הקבועות כבר נפתחו לתקופה הזו.' : 'עוד אין רשימות קבועות. הוסיפו אחת ב"רשימות קבועות".');
    $('totals').textContent = msg;
    setTimeout(render, 2500);
  });

  // ---- an example, so the page can be seen before there is real data ------------------------------------------------
  $('demoBtn').addEventListener('click', async () => {
    const now = Date.now();
    const a = await store.addFromText({ text: 'שלום דני,\nלצורך דיווח המע"מ נא להעביר:\n- דפי בנק לחודשים החודשיים האחרונים\n- חשבוניות הוצאה\n- פירוט כרטיס אשראי', client: { email: 'dani@example.com', name: 'דני כהן (דוגמה)' }, now: now - 5 * 86400000 });
    await store.addFromText({ text: 'היי רונית, לקראת הדוח השנתי חסרים טופס 106 ואישור שנתי מקרן הפנסיה לשנת ' + (new Date().getFullYear() - 1) + '.', client: { email: 'ronit@example.com', name: 'רונית לוי (דוגמה)' }, now });
    await store.addFromText({ text: 'שלום, מצורף ייפוי כוח לחתימה. נא לחתום ולהחזיר, וגם צילום ת"ז עם ספח.', client: { email: 'maya@example.com', name: 'מאיה גל (דוגמה, משרד עו"ד)' }, now });
    if (a) {
      const m = a.items[0].months ? a.items[0].months[0].replace('-', '_') : '';
      await store.ingestIncoming({ messageId: 'demo-1', from: { email: 'dani@example.com' }, text: 'מצרף', attachments: [{ name: 'bank_' + m + '.pdf', size: 90000 }, { name: 'scan001.pdf', size: 90000 }], fetchedBack: true, now });
    }
    render();
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[FlowClientRequestStore.KEY]) render(); });
  render();
})();
