#!/usr/bin/env node
// Offline A/B for "carry until closed" (core/follow-up.js nextMove, switch CARRY.nextMove, off).
//   A (today): three nudges, then the last, direct nudge again on every chase day until an answer.
//   B (new):   the same three nudges; then, on a chase day, ONE proposed move from evidence (the app where this person
//              answers you, one colleague on the thread who has answered you, or "Still need this?"); no move -> as A.
// There is no real loop-lifecycle data yet (no installs: docs/open-tasks.md row 64), so this is a SIMULATION. It drives the
// real core/ functions (recordNudge, rechaseDate, nextMove, the person model) over a seeded synthetic population whose
// behaviour is an assumption written below. A and B see the same random draw for the same message, so every difference is
// the policy. It does NOT show how real people behave. Run: node scripts/carry-sim.cjs [--json out.json] [--seed n]
process.env.TZ = 'Asia/Jerusalem';
const fs = require('fs');
const path = require('path');
const { FlowFollowUp: F } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'follow-up.js'));
const { FlowPersonModel: P } = require(path.join(__dirname, '..', 'flow-trial-extension', 'core', 'person-model.js'));

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SEED = Number(argOf('--seed') || 20261011);
const DAY = 86400000;
const T0 = new Date('2026-06-01T09:00:00').getTime();       // the evaluation window opens; history is the 150 days before
const HORIZON = 90;                                          // calendar days a loop is followed

// ---- deterministic randomness: one draw per (loop, app, attempt) so A and B share it -------------------------------
function hash(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function rng(str) { let a = hash(str + '|' + SEED); return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function addBiz(startMs, bd) {
  let t = startMs, left = bd;
  for (let i = 0; i < 4000 && left > 0; i++) {
    const d = new Date(t);
    if (d.getDay() === 5 || d.getDay() === 6) { t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); continue; }
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const room = (next - t) / DAY;
    if (left <= room) { t += left * DAY; left = 0; } else { left -= room; t = next; }
  }
  return t;
}

// ---- the population (ASSUMPTIONS) ----------------------------------------------------------------------------------
// p: chance one message in that app gets an answer; med: median business days to that answer.
const TYPES = {
  mail:       { share: 0.50, gmail: { p: 0.55, med: 1.5 }, whatsapp: { p: 0.60, med: 0.5 }, colleague: { p: 0.25, med: 2 } },
  chat:       { share: 0.20, gmail: { p: 0.08, med: 3 },   whatsapp: { p: 0.85, med: 0.3 }, colleague: { p: 0.25, med: 2 } },
  slow:       { share: 0.12, gmail: { p: 0.50, med: 6 },   whatsapp: { p: 0.30, med: 3 },   colleague: { p: 0.25, med: 3 } },
  gone:       { share: 0.10, gmail: { p: 0 },              whatsapp: { p: 0 },              colleague: { p: 0.10, med: 2 } },
  gatekeeper: { share: 0.08, gmail: { p: 0.03, med: 4 },   whatsapp: { p: 0.03, med: 4 },   colleague: { p: 0.75, med: 1 } }
};
// How often the person says yes to a proposed move (ASSUMPTION; --accept 1 is the worst case for an early release).
const ACCEPT_ARG = argOf('--accept');
// Share of answers that arrive through a move (in the other app, or from the colleague) that Glance links to the loop and
// closes (core/cross-channel.js with the move link). 1 = every one; the measured share on carry-move-answer-corpus is 5/9.
// An answer Glance does not recognise leaves the loop open, and the chase goes on.
const MOVE_RECOGNISED = argOf('--move-recognised') ? +argOf('--move-recognised') : 1;
const ACCEPT = ACCEPT_ARG ? { channel: +ACCEPT_ARG, colleague: +ACCEPT_ARG, releaseDead: +ACCEPT_ARG, releaseAlive: +ACCEPT_ARG } : { channel: 0.8, colleague: 0.6, releaseDead: 0.85, releaseAlive: 0.35 };

function population() {
  const r = rng('population');
  const people = [];
  const ORGS = 45;
  for (let i = 0; i < 320; i++) {
    const org = r() < 0.7 ? 'org' + Math.floor(r() * ORGS) + '.co.il' : 'gmail.com';
    let type = 'mail'; let x = r(), acc = 0;
    for (const k of Object.keys(TYPES)) { acc += TYPES[k].share; if (x < acc) { type = k; break; } }
    const linked = r() < 0.5;
    if (type === 'chat' && !linked) type = 'mail';
    if (type === 'gatekeeper' && org === 'gmail.com') type = 'gone';
    people.push({ i, email: 'p' + i + '@' + org, org, key: 'person:' + i, lang: r() < 0.5 ? 'he' : 'en', linked, type, name: 'P' + i });
  }
  return people;
}

// One message's answer: { at } or null. The same (loop, app, k) always draws the same.
function answerTo(loopId, person, via, k, sentAt) {
  const prof = TYPES[person.type][via === 'outlook' ? 'gmail' : via];
  if (!prof || !prof.p) return null;
  const r = rng(loopId + '|' + via + '|' + k);
  if (r() >= prof.p) return null;
  return addBiz(sentAt, Math.max(0.05, prof.med * Math.exp(0.6 * gauss(r))));
}

// ---- one loop under one policy -------------------------------------------------------------------------------------
function runLoop(spec, person, world, policy) {
  const { id, created, channel, kind, colleague } = spec;
  const hist = world.historyFor(person, colleague);
  let w = {
    id, threadId: id, status: 'waiting', direction: 'theirs', kind, channel, lang: person.lang, subject: 'the ask ' + id,
    counterpart: { email: channel === 'whatsapp' ? null : person.email, name: person.name, phone: channel === 'whatsapp' ? '9725' + person.i : null },
    personKey: person.linked || channel !== 'whatsapp' ? person.key : null, nudges: 0, stage: 'waiting', createdAt: created,
    chaseIso: F.rechaseDate(kind, created, null)
  };
  if (!person.linked && channel === 'whatsapp') w.personKey = 'phone:9725' + person.i;
  const kOf = {}; let answerAt = Infinity; let answeredBy = null;
  const send = (via, at) => {
    const k = kOf[via] = (kOf[via] || 0) + 1;
    const a = answerTo(id, person, via, k, at);
    if (!a || a >= answerAt) return;
    if (via !== channel && rng(id + '|recognised|' + via + '|' + k)() >= MOVE_RECOGNISED) return;   // answered there, not linked
    answerAt = a; answeredBy = via;
  };
  send(channel, created);
  const out = { id, lang: person.lang, type: person.type, kind, nudges: 0, moves: [], closedAt: null, releasedAt: null, answeredBy: null };
  const end = created + HORIZON * DAY;
  const opts = { enabled: policy === 'B', keyOf: (x) => x.personKey || (x.counterpart && x.counterpart.email), threadPeople: colleague ? [{ email: colleague.email, name: colleague.name }] : [] };
  for (let step = 0; step < 200; step++) {
    const t = new Date(w.chaseIso + 'T09:00:00').getTime();
    if (answerAt <= Math.min(t, end)) { out.closedAt = answerAt; out.answeredBy = answeredBy; break; }
    if (t > end) break;
    let move = null;
    if (policy !== 'A') move = F.nextMove(hist.concat([w]), w, t, opts);
    if (move) {
      const r = rng(id + '|accept|' + move.type)();
      if (move.type === 'release') {
        const dead = spec.deadUnderA;
        if (r < (dead ? ACCEPT.releaseDead : ACCEPT.releaseAlive)) { out.moves.push({ type: 'release', at: t }); out.releasedAt = t; w = Object.assign(w, F.releasePatch(w, t)); break; }
        w = Object.assign(w, F.moveDismissPatch(w, move, t));
      } else if (r < ACCEPT[move.type]) {
        out.moves.push({ type: move.type, app: move.app || null, at: t });
        send(move.type === 'colleague' ? 'colleague' : move.app, t);
        w = Object.assign(w, F.moveDonePatch(w, move, t));
        continue;
      } else {
        w = Object.assign(w, F.moveDismissPatch(w, move, t));
      }
    }
    send(channel, t);                                   // the nudge (A: always; B: when no move was taken)
    out.nudges++;
    w = Object.assign(w, F.recordNudge(w, t, hist));
  }
  if (out.closedAt) { out.daysToClose = P.bizDays(created, out.closedAt); out.byMove = out.moves.some((m) => (m.type === 'colleague' ? 'colleague' : m.app) === out.answeredBy); }
  return out;
}

// ---- history: the 150 days before, under A, so the evidence both policies read is the same ---------------------------
function buildWorld(people) {
  const r = rng('history');
  const all = [];
  const byKey = {};
  people.forEach((p) => {
    const n = 2 + Math.floor(r() * 7);
    for (let j = 0; j < n; j++) {
      const ch = p.linked && r() < 0.45 ? 'whatsapp' : 'gmail';
      const created = T0 - (150 - j * 18 - Math.floor(r() * 10)) * DAY;
      const id = 'h' + p.i + '_' + j;
      const o = runLoop({ id, created, channel: ch, kind: 'reply', colleague: null }, p, { historyFor: () => [] }, 'A');
      const w = { id, status: o.closedAt && o.closedAt < T0 ? 'resolved' : 'stopped', closedAs: o.closedAt && o.closedAt < T0 ? 'replied' : null, direction: 'theirs', kind: 'reply', channel: ch,
        counterpart: { email: ch === 'whatsapp' ? null : p.email, phone: ch === 'whatsapp' ? '9725' + p.i : null }, personKey: p.linked || ch !== 'whatsapp' ? p.key : 'phone:9725' + p.i, createdAt: created, resolvedAt: o.closedAt || null };
      all.push(w);
      (byKey[p.org] = byKey[p.org] || []).push(w);
    }
  });
  const emailOf = {};
  people.forEach((p) => { emailOf[p.key] = p.email; });
  // A colleague's own closes are keyed by their address (that is how the thread names them).
  all.forEach((w) => { if (!w.counterpart.email && w.personKey && emailOf[w.personKey]) w.colleagueEmail = emailOf[w.personKey]; });
  const asColleague = (w) => Object.assign({}, w, { personKey: w.counterpart.email || w.colleagueEmail, counterpart: { email: w.counterpart.email || w.colleagueEmail } });
  return {
    all,
    historyFor(person, colleague) {
      const mine = all.filter((w) => w.personKey === person.key || w.personKey === 'phone:9725' + person.i);
      const theirs = colleague ? all.filter((w) => w.personKey === colleague.key).map(asColleague) : [];
      return mine.concat(theirs);
    }
  };
}

function evalLoops(people, world) {
  const r = rng('eval');
  const specs = [];
  const byOrg = {};
  people.forEach((p) => { if (p.org !== 'gmail.com') (byOrg[p.org] = byOrg[p.org] || []).push(p); });
  people.forEach((p) => {
    const n = 1 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const mates = (byOrg[p.org] || []).filter((q) => q !== p && q.type !== 'gone' && q.type !== 'gatekeeper');
      const wantCc = p.type === 'gatekeeper' ? 0.9 : 0.3;
      const colleague = mates.length && r() < wantCc ? mates[Math.floor(r() * mates.length)] : null;
      specs.push({ id: 'e' + p.i + '_' + j, created: addBiz(T0, Math.floor(r() * 30)), channel: p.linked && r() < 0.25 ? 'whatsapp' : 'gmail', kind: r() < 0.2 ? 'payment' : 'reply', colleague, person: p });
    }
  });
  return specs;
}

function pct(a, b) { return b ? Math.round((1000 * a) / b) / 10 : null; }
function median(xs) { const s = xs.slice().sort((a, b) => a - b); return s.length ? Math.round(s[Math.floor((s.length - 1) / 2)] * 10) / 10 : null; }
function score(rows, specById) {
  const n = rows.length;
  const answered = rows.filter((x) => x.closedAt);
  const released = rows.filter((x) => x.releasedAt);
  const open = rows.filter((x) => !x.closedAt && !x.releasedAt);
  const reachable = rows.filter((x) => x.type !== 'gone');
  const missed = reachable.filter((x) => !x.closedAt);
  const prematureRelease = released.filter((x) => !specById[x.id].deadUnderA);
  const moves = rows.reduce((s, x) => s + x.moves.filter((m) => m.type !== 'release').length, 0);
  const movesThatAnswered = rows.filter((x) => x.byMove).length;
  return {
    n,
    answeredClose: answered.length, answeredRate: pct(answered.length, n),
    released: released.length,
    trueClose: answered.length + released.length, trueCloseRate: pct(answered.length + released.length, n),
    openAtDay90: open.length, openAtDay90Rate: pct(open.length, n),
    missedClose: missed.length, missedCloseRate: pct(missed.length, reachable.length), reachable: reachable.length,
    medianBizDaysToAnswer: median(answered.map((x) => x.daysToClose)),
    nudges: rows.reduce((s, x) => s + x.nudges, 0),
    nudgesPerLoop: Math.round((rows.reduce((s, x) => s + x.nudges, 0) / n) * 100) / 100,
    nudgesOnLoopsNeverAnswered: rows.filter((x) => !x.closedAt).reduce((s, x) => s + x.nudges, 0),
    moves, movesThatGotTheAnswer: movesThatAnswered, movesWithNoAnswer: moves - movesThatAnswered,
    prematureRelease: prematureRelease.length, prematureReleaseRate: pct(prematureRelease.length, n),
    glanceClosedAlone: 0
  };
}

function main() {
  const people = population();
  const world = buildWorld(people);
  const specs = evalLoops(people, world);
  // Ground truth for "dead": under A the loop never gets an answer within the horizon.
  const A = specs.map((s) => runLoop(s, s.person, world, 'A'));
  specs.forEach((s, i) => { s.deadUnderA = !A[i].closedAt; });
  const B = specs.map((s) => runLoop(s, s.person, world, 'B'));
  const Boff = specs.map((s) => runLoop(s, s.person, world, 'B-off'));
  const specById = {}; specs.forEach((s) => { specById[s.id] = s; });
  const identical = JSON.stringify(A) === JSON.stringify(Boff);
  const split = (rows, f) => score(rows.filter(f), specById);
  const report = {
    seed: SEED, accept: ACCEPT, moveRecognised: MOVE_RECOGNISED, people: people.length, loops: specs.length, historyLoops: world.all.length, horizonDays: HORIZON,
    switchOffIdenticalToA: identical,
    A: score(A, specById), B: score(B, specById),
    he: { A: split(A, (x) => x.lang === 'he'), B: split(B, (x) => x.lang === 'he') },
    en: { A: split(A, (x) => x.lang === 'en'), B: split(B, (x) => x.lang === 'en') },
    byType: Object.keys(TYPES).reduce((o, k) => { o[k] = { A: split(A, (x) => x.type === k), B: split(B, (x) => x.type === k) }; return o; }, {}),
    moveMix: B.reduce((o, x) => { x.moves.forEach((m) => { const k = m.type + (m.app ? ':' + m.app : ''); o[k] = (o[k] || 0) + 1; }); return o; }, {})
  };
  const out = argOf('--json');
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  const row = (name, s) => '| ' + name + ' | ' + s.n + ' | ' + s.answeredRate + '% (' + s.answeredClose + ') | ' + s.released + ' | ' + s.openAtDay90Rate + '% (' + s.openAtDay90 + ') | ' + s.missedCloseRate + '% (' + s.missedClose + '/' + s.reachable + ') | ' + s.medianBizDaysToAnswer + ' | ' + s.nudgesPerLoop + ' | ' + s.prematureRelease + ' | ' + s.movesWithNoAnswer + '/' + s.moves + ' |';
  console.log('switch off identical to A: ' + identical);
  console.log('| policy | n | answered | released | open at day 90 | missed close (reachable) | median biz days to answer | nudges per loop | early release | moves with no answer |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  [['A all', report.A], ['B all', report.B], ['A he', report.he.A], ['B he', report.he.B], ['A en', report.en.A], ['B en', report.en.B]].forEach(([k, s]) => console.log(row(k, s)));
  Object.keys(report.byType).forEach((k) => { console.log(row('A ' + k, report.byType[k].A)); console.log(row('B ' + k, report.byType[k].B)); });
  console.log('move mix:', JSON.stringify(report.moveMix));
  if (!identical) process.exit(1);
}
main();
