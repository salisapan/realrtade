'use strict';
// M8 measurement: per-user relevance inside the real Router v2 (flow-trial-extension/core/understanding-router.js, switch aiRelevanceV1),
// on the frozen contrast-heldout-v0 pairs (not a training input). Tier 0 is today's engine (v2), the injected scorer is this lab's
// featurize() relevance. The router may only SILENCE on not_relevant. The offer side (the full hand judge) is reported as a shadow only:
// it is not built into the router, because the owner lock keeps today's hedges until a contrast-pair test says otherwise.
// The pairs are synthetic, labelled from the owner's spec in this lab (labeledBy synthetic-heldout, ownerVerified false).
// usage: node glance-ai/profile/run-router-relevance.cjs
const fs = require('fs');
const path = require('path');
const { featurize } = require('./featurize.cjs');
const { judge } = require('./judge.cjs');
const { scorePairs } = require('./score-contrast.cjs');
const { make } = require('../model/runtime/glance-close-v2.cjs');
const { DEFAULT_OWN_NAMES } = require('../model/runtime/pipeline-v2.cjs');
const { FlowUnderstandingRouter: R } = require('../../flow-trial-extension/core/understanding-router.js');

const HELD = path.join(__dirname, '..', 'labeling', 'contrast-heldout-v0.jsonl');
const OUT = path.join(__dirname, 'out', 'router-relevance-report.json');
const own = (r) => Object.assign({}, r, { ownEmail: r.ownEmail || (r.surface === 'outlook' ? 'glance.salisapan@outlook.com' : 'ai.local.flow@gmail.com') });

(async () => {
  const held = fs.readFileSync(HELD, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const v2 = make('v2');
  const today = new Map(held.map((r) => [r.id, v2.decide({ id: r.id, lang: r.lang, surface: r.surface, direction: 'inbound', subject: r.subject, body: r.body, from: r.from, to: r.to, cc: r.cc || [], attachmentCount: r.attachmentCount || 0, ownNames: DEFAULT_OWN_NAMES.slice() }).label]));
  const routed = { base: new Map(), rel: new Map() };
  let silencedByProfile = 0, modelCallsAvoided = 0;
  for (const r of held) {
    const t = today.get(r.id);
    const input = { text: r.body, today: '2026-10-19', direction: 'inbound', cloudConsent: false, tier0: { quiet: null, step: t, possible: t === 'SILENT' } };
    const deps = { relevance: () => featurize(own(r), r.profile), gate: () => ({ pass: true }), veto: () => null };
    const a = await R.route(input, deps, { aiPrimary: true });
    const b = await R.route(input, deps, { aiPrimary: true, aiRelevanceV1: true });
    routed.base.set(r.id, a.step); routed.rel.set(r.id, b.step);
    if (a.step !== 'SILENT' && b.step === 'SILENT') silencedByProfile++;
    if (t === 'SILENT' && /profile:/.test(b.reason || '')) modelCallsAvoided++;
  }
  const pack = (s) => ({ pairAccuracy: s.pairAccuracy, wrongDoIt: s.wrongDoIt, missedCloseOnRelevant: s.missedCloseOnRelevant, wrongAction: s.wrongAction, wdi: s.raw.wdi, mcr: s.raw.mcr });
  const R1 = {
    set: 'contrast-heldout-v0 (60 synthetic pairs, labeledBy synthetic-heldout, ownerVerified 0)',
    today: pack(scorePairs(held, (r) => routed.base.get(r.id))),
    routerWithRelevance: pack(scorePairs(held, (r) => routed.rel.get(r.id))),
    shadowOfferSide: pack(scorePairs(held, (r) => judge(own(r), r.profile, { label: today.get(r.id) }).action)),
    cardsSilencedByProfile: silencedByProfile,
    mailsThatWouldHaveAskedAModel: modelCallsAvoided,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(R1, null, 1) + '\n');
  console.log(JSON.stringify(R1, null, 1));
  const ok = R1.routerWithRelevance.wdi <= R1.today.wdi && R1.routerWithRelevance.mcr <= R1.today.mcr;
  console.log(ok ? 'PASS' : 'FAIL'); process.exitCode = ok ? 0 : 3;
})();
