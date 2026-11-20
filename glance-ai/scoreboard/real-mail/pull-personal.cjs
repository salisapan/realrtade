// Pulls a sample of the owner's personal mailbox READ-ONLY (gmail.readonly), masks it, and stores it only under private/personal/ (gitignored).
//   node pull-personal.cjs [--inbox=220] [--sent=110] [--days=90]
// Credentials come from the environment (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN); their values are never printed or written. Only gmail.googleapis.com and oauth2.googleapis.com are called, GET for mail, POST for the token.
// Output: private/personal/{dev,heldout}-{inbox,sent}.jsonl (masked rows, label empty), private/personal/tokens.json (header-derived name tokens, for the mask check), private/personal/manifest.json (salted hashes of thread ids per split).
// Prints counts only. Never prints a subject, an address or a body.
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const OUT = path.join(process.env.GLANCE_PRIVATE || path.join(__dirname, 'private'), 'personal');
fs.mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? Number(a.split('=')[1]) : d; };
const NIN = arg('inbox', 220), NSENT = arg('sent', 110), DAYS = arg('days', 90);

function curl(args, stdin) {
  const r = cp.spawnSync('curl', ['-sS', '--max-time', '60'].concat(args), { input: stdin || '', encoding: 'utf8', maxBuffer: 1 << 27 });
  if (r.status !== 0) throw new Error('curl failed ' + r.status);
  return r.stdout;
}
function token() {
  for (const v of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']) if (!process.env[v]) { console.log('missing env', v); process.exit(2); }
  const form = ['client_id', 'client_secret', 'refresh_token'].map((k, i) => k + '=' + encodeURIComponent(process.env[['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'][i]])).concat('grant_type=refresh_token').join('&');
  const j = JSON.parse(curl(['-X', 'POST', 'https://oauth2.googleapis.com/token', '-H', 'Content-Type: application/x-www-form-urlencoded', '--data-binary', '@-'], form));
  if (!j.access_token) { console.log('token refused:', j.error || 'unknown'); process.exit(3); }
  return j.access_token;
}
const TOKEN = token();
function api(p) {
  // the bearer goes through stdin as a curl config, never through argv
  const out = curl(['-K', '-'], 'header = "Authorization: Bearer ' + TOKEN + '"\nurl = "https://gmail.googleapis.com/gmail/v1/users/me/' + p + '"\n');
  const j = JSON.parse(out);
  if (j.error) throw new Error('gmail api ' + (j.error.code || '') + ' ' + (j.error.status || ''));
  return j;
}
function listIds(q, want) {
  const ids = []; let pt = '';
  while (ids.length < want) {
    const j = api('messages?maxResults=500&q=' + encodeURIComponent(q) + (pt ? '&pageToken=' + pt : ''));
    for (const m of j.messages || []) ids.push({ id: m.id, threadId: m.threadId });
    pt = j.nextPageToken; if (!pt) break;
  }
  return ids;
}
const salt = fs.existsSync(path.join(OUT, 'salt.txt')) ? fs.readFileSync(path.join(OUT, 'salt.txt'), 'utf8') : (() => { const s = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(path.join(OUT, 'salt.txt'), s); return s; })();
const H = (s) => crypto.createHmac('sha256', salt).update(String(s)).digest('hex').slice(0, 16);
// seeded order so a rerun picks the same threads
const rank = (threadId) => parseInt(H('rank:' + threadId).slice(0, 8), 16);
const split = (threadId) => (parseInt(H('split:' + threadId).slice(0, 6), 16) % 100 < 70 ? 'dev' : 'heldout'); // 70/30 by thread: a thread is never on both sides

const profile = api('profile');
const own = String(profile.emailAddress || '').toLowerCase();
const ownLocal = own.split('@')[0];
function pick(q, n) {
  const all = listIds(q, 3000), seen = {}, perThread = [];
  for (const m of all) if (!seen[m.threadId]) { seen[m.threadId] = 1; perThread.push(m); }
  return perThread.sort((a, b) => rank(a.threadId) - rank(b.threadId)).slice(0, n);
}
const BASE = ' newer_than:' + DAYS + 'd -in:spam -in:trash -in:chats';
// --fish: a wider window (up to 12 months) used only to find threads that probably hold a real request: a human sender, no list or bulk headers, the owner in To or Cc.
// New rows go to dev-inbox-x / heldout-inbox-x (never into the files the first pass labelled); a thread already in the manifest is skipped; the split stays by thread.
const FISH = process.argv.includes('--fish'), FISHDAYS = arg('fishdays', 365);
function fishPick(n) {
  const known = new Set((() => { try { const m = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); return m.dev.concat(m.heldout); } catch (e) { return []; } })());
  const q = 'in:inbox -category:promotions -category:social -category:forums -category:updates -in:spam -in:trash -in:chats newer_than:' + FISHDAYS + 'd -from:(noreply OR no-reply OR donotreply OR notifications OR newsletter OR mailer OR news OR marketing OR alerts OR updates) -unsubscribe';
  const all = listIds(q, 4000), seen = {}, per = [];
  for (const m of all) if (!seen[m.threadId] && !known.has(H('thread:' + m.threadId))) { seen[m.threadId] = 1; per.push(m); }
  per.sort((a, b) => rank(a.threadId) - rank(b.threadId));
  const keep = [];
  for (const it of per.slice(0, 1500)) {
    if (keep.length >= n) break;
    let m; for (let k = 0; k < 3 && !m; k++) { try { m = api('messages/' + it.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence&metadataHeaders=Auto-Submitted'); } catch (e) { cp.spawnSync('sleep', [String(1 + k * 2)]); } }
    if (!m) continue;
    const h = (x) => { const y = (m.payload.headers || []).find((z) => z.name.toLowerCase() === x); return y ? y.value : ''; };
    const local = (String(h('from')).match(/([\w.+-]+)@/) || [, ''])[1].toLowerCase();
    if (h('list-unsubscribe') || /bulk|list|junk/i.test(h('precedence')) || /auto-/i.test(h('auto-submitted'))) continue;
    if (/^(?:no-?reply|do-?not-?reply|notifications?|alerts?|mailer|news|newsletter|marketing|updates?|info|hello|team|support|billing|orders?)\b|no-?reply/.test(local)) continue;
    if (addrs(h('from'))[0] === own) continue;
    if (addrs(h('to') + ' ' + h('cc')).indexOf(own) < 0) continue;
    keep.push(it);
  }
  return keep;
}
const FISHSENT = process.argv.includes('--fishsent');
function sentFishPick(n) {
  const known = new Set((() => { try { const m = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); return m.dev.concat(m.heldout); } catch (e) { return []; } })());
  const all = listIds('in:sent -in:chats -in:drafts newer_than:' + arg('fishdays', 365) + 'd', 4000), seen = {}, per = [];
  for (const m of all) if (!seen[m.threadId] && !known.has(H('thread:' + m.threadId))) { seen[m.threadId] = 1; per.push(m); }
  return per.sort((a, b) => rank(a.threadId) - rank(b.threadId)).slice(0, n);
}
const inboxPick = FISHSENT ? [] : FISH ? fishPick(arg('fishn', 300)) : pick('in:inbox -category:promotions -category:social -category:forums' + BASE, NIN);
const sentPick = FISHSENT ? sentFishPick(arg('fishn', 300)) : FISH ? [] : pick('in:sent' + BASE, NSENT);

// --enrich: keep the masked rows and labels, add `fromKind` (automated | list | person) from the sender's local part and the bulk/auto headers, matched by the hashed message id. No text is touched.
if (process.argv.includes('--enrich')) {
  const byMid = {};
  for (const f of fs.readdirSync(OUT).filter((x) => /\.jsonl$/.test(x))) for (const l of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); byMid[r.mid] = 1; }
  const kind = {}; let n0 = 0;
  for (const it of inboxPick.concat(sentPick)) {
    if (!byMid[H('mid:' + it.id)]) continue;
    let m; for (let k = 0; k < 4 && !m; k++) { try { m = api('messages/' + it.id + '?format=metadata&metadataHeaders=From&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence&metadataHeaders=Auto-Submitted'); } catch (e) { cp.spawnSync('sleep', [String(1 + k * 2)]); } }
    if (!m) continue;
    const h = (n) => { const x = (m.payload.headers || []).find((y) => y.name.toLowerCase() === n); return x ? x.value : ''; };
    const local = (String(h('from')).match(/([\w.+-]+)@/) || [, ''])[1].toLowerCase();
    kind[H('mid:' + it.id)] = /^(?:no-?reply|do-?not-?reply|notifications?|noreply|alerts?|mailer|news|newsletter|marketing|updates?|info|hello|team|support|billing|orders?)\b|no-?reply/.test(local) || /auto-/i.test(h('auto-submitted')) ? 'automated' : (h('list-unsubscribe') || /bulk|list|junk/i.test(h('precedence')) ? 'list' : 'person'); n0++;
  }
  const cnt = {};
  for (const f of fs.readdirSync(OUT).filter((x) => /\.jsonl$/.test(x))) { const rows = fs.readFileSync(path.join(OUT, f), 'utf8').split('\n').filter(Boolean).map(JSON.parse); for (const r of rows) { if (kind[r.mid]) { r.fromKind = kind[r.mid]; cnt[r.fromKind] = (cnt[r.fromKind] || 0) + 1; } } fs.writeFileSync(path.join(OUT, f), rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); }
  console.log('enriched', n0, JSON.stringify(cnt)); process.exit(0);
}
const hdr = (m, n) => { const h = (m.payload.headers || []).find((x) => x.name.toLowerCase() === n); return h ? h.value : ''; };
const b64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function bodyOf(part, want) {
  if (!part) return '';
  if (part.mimeType === want && part.body && part.body.data) return b64(part.body.data);
  for (const p of part.parts || []) { const r = bodyOf(p, want); if (r) return r; }
  return '';
}
function textOf(m) {
  let t = bodyOf(m.payload, 'text/plain');
  if (!t) t = bodyOf(m.payload, 'text/html').replace(/<(?:br|\/p|\/div|\/tr|\/li)[^>]*>/gi, '\n').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.replace(/\r/g, '');
  // cut the quoted earlier mail: this row is the newest message only
  const cut = t.search(/\n\s*(?:On .{5,120}wrote:|בתאריך .{5,120}כתב|ב-?\s?\d{1,2}[./]\d{1,2}[./]\d{2,4}.{0,80}כתב|-{2,}\s*(?:Original Message|הודעה מקורית)|From:\s.+\nSent:|מאת:\s.+\nנשלח:)/i);
  if (cut > 0) t = t.slice(0, cut);
  t = t.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n');
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1800);
}
function addrs(v) { return (String(v).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map((a) => a.toLowerCase()); }
function nameTokens(v) {
  const out = new Set();
  for (const part of String(v).split(',')) {
    const d = part.replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();
    if (!d || /@/.test(d)) continue;
    for (const w of d.split(/\s+/)) if (/^[א-ת]{2,}$|^[A-Za-z]{3,}$/.test(w)) out.add(w);
  }
  return out;
}
const STOP = new Set(require('./mask-stop.json'));
const tokens = new Set(), ownTokens = new Set(), orgTokens = new Set();
function mask(text, m, isOwnSide) {
  let t = String(text);
  t = t.replace(/https?:\/\/\S+|www\.\S+/gi, '[URL]').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]');
  t = t.replace(/(?:\+?972|\b0)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b/g, '[PHONE]').replace(/\d[\d-]{5,}\d/g, '[ID]');
  const rep = (set, tag) => { for (const w of [...set].sort((a, b) => b.length - a.length)) { if (STOP.has(w.toLowerCase())) continue; t = t.replace(new RegExp('(?<![\\u05D0-\\u05EAA-Za-z])[בהוכלמש]{0,2}(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\u05D0-\\u05EAA-Za-z])', 'gi'), (x, g) => x.slice(0, x.length - g.length) + tag); } };
  rep(ownTokens, '[OWNER]'); rep(tokens, '[NAME]'); rep(orgTokens, '[ORG]');
  // a vocative after a greeting, and a short signature line at the end, are names even when the header did not carry them
  t = t.replace(/^(\s*(?:שלום|היי|הי|בוקר טוב|ערב טוב|Hi|Hello|Hey|Dear)\s+)([א-תA-Za-z'][א-תA-Za-z'-]{1,15})(\s*[,:])/gim, (x, a, nm, c) => (/^(?:כולם|לכולם|צוות|חברים|all|team|there|\[OWNER\]|\[NAME\])$/i.test(nm) ? x : a + '[NAME]' + c));
  const lines = t.split('\n');
  for (let i = lines.length - 1, k = 0; i >= 0 && k < 3; i--) { const l = lines[i].trim(); if (!l) continue; k++; if (l.length <= 22 && l.split(/\s+/).length <= 3 && /^[א-תA-Za-z'" -]+$/.test(l) && !/\[(?:NAME|OWNER|ORG)\]/.test(l) && !/^(?:תודה|בברכה|בתודה|להתראות|Thanks|Regards|Best|Cheers|תודה רבה|שבוע טוב|יום טוב|שבת שלום)/i.test(l)) lines[i] = '[NAME]'; }
  return lines.join('\n');
}
const rows = { dev: { inbox: [], sent: [] }, heldout: { inbox: [], sent: [] } }, manifest = { dev: [], heldout: [] };
let n = 0, errs = 0;
for (const [folder, list] of [['inbox', inboxPick], ['sent', sentPick]]) {
  const msgs = [];
  for (const it of list) {
    let m; for (let k = 0; k < 4 && !m; k++) { try { m = api('messages/' + it.id + '?format=full'); } catch (e) { cp.spawnSync('sleep', [String(1 + k * 2)]); } } if (!m) { errs++; continue; }
    msgs.push(m);
    for (const h of ['from', 'to', 'cc']) { const v = hdr(m, h); const own_ = addrs(v).indexOf(own) >= 0; for (const w of nameTokens(v)) { (own_ && h !== 'cc' && v.toLowerCase().indexOf(own) >= 0 && nameTokens(v).size ? ownTokens : tokens).add(w); } }
    for (const a of addrs(hdr(m, 'from') + ' ' + hdr(m, 'to') + ' ' + hdr(m, 'cc'))) { const d = a.split('@')[1].split('.')[0]; if (d.length >= 4 && !/^(?:gmail|googlemail|hotmail|outlook|yahoo|walla|icloud|live|google)$/.test(d)) orgTokens.add(d); }
  }
  // the owner's own header names are those on the address equal to own
  for (const m of msgs) for (const h of ['from', 'to', 'cc']) for (const part of String(hdr(m, h)).split(/,(?=[^,]*<)/)) if (addrs(part).indexOf(own) >= 0) for (const w of nameTokens(part)) { ownTokens.add(w); tokens.delete(w); }
  ownTokens.add(ownLocal.replace(/[0-9]+$/, '')); // the local part's letters, e.g. a first name
  for (const m of msgs) {
    const to = addrs(hdr(m, 'to')), cc = addrs(hdr(m, 'cc')), from = addrs(hdr(m, 'from'))[0] || '';
    if (folder === 'inbox' && from === own) continue; // this row is for what others sent
    const body = mask(textOf(m), m), subject = mask(hdr(m, 'subject'), m);
    if (body.replace(/\[[A-Z]+\]/g, '').trim().length < 3) continue;
    const sp = split(m.threadId), id = FISHSENT ? (sp === 'dev' ? 'csd' : 'csh') + '-' : (sp === 'dev' ? 'pd' : 'ph') + (folder === 'inbox' ? 'i' : 's') + (FISH ? 'x' : '') + '-' + String(rows[sp][folder].length + 1).padStart(3, '0');
    const row = { id, folder, mid: H('mid:' + m.id), toN: to.length || 1, ccN: cc.length, ownInTo: to.indexOf(own) >= 0, subject, body, label: null, fromKind: FISH ? 'person' : undefined };
    rows[sp][folder].push(row); manifest[sp].push(H('thread:' + m.threadId)); n++;
  }
}
// the mask is applied before anything is written; tokens were collected from the whole sample, so mask the rows once more with the full set
for (const sp of ['dev', 'heldout']) for (const f of ['inbox', 'sent']) {
  for (const r of rows[sp][f]) { r.body = mask(r.body, null); r.subject = mask(r.subject, null); }
  if (FISH && f === 'sent') continue;
  if (FISHSENT) { if (f === 'sent') { const dd = path.join(OUT, '..', 'commitments'); fs.mkdirSync(dd, { recursive: true }); fs.writeFileSync(path.join(dd, 'rows-' + sp + '.jsonl'), rows[sp][f].map((r) => JSON.stringify(r)).join('\n') + (rows[sp][f].length ? '\n' : '')); } continue; }
  fs.writeFileSync(path.join(OUT, sp + '-' + f + (FISH ? '-x' : '') + '.jsonl'), rows[sp][f].map((r) => JSON.stringify(r)).join('\n') + (rows[sp][f].length ? '\n' : ''));
}
// a fishing run keeps what the first pass collected: tokens and the manifest are merged, never replaced
let oldTk = { own: [], names: [], org: [] }, oldMf = { dev: [], heldout: [] };
if (FISH || FISHSENT) { try { oldTk = JSON.parse(fs.readFileSync(path.join(OUT, 'tokens.json'), 'utf8')); oldMf = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); } catch (e) {} }
fs.writeFileSync(path.join(OUT, 'tokens.json'), JSON.stringify({ own: [...new Set([...oldTk.own, ...ownTokens])], names: [...new Set([...oldTk.names, ...tokens])], org: [...new Set([...oldTk.org, ...orgTokens])], ownAddr: own }));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ made: new Date().toISOString().slice(0, 10), salted: true, dev: oldMf.dev.concat(manifest.dev), heldout: oldMf.heldout.concat(manifest.heldout) }));
console.log('fetch errors', errs, '| rows', n, JSON.stringify({ dev: { inbox: rows.dev.inbox.length, sent: rows.dev.sent.length }, heldout: { inbox: rows.heldout.inbox.length, sent: rows.heldout.sent.length } }));
