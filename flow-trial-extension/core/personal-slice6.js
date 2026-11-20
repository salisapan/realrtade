// Slice 6. Cloud providers, hybrid retrieval, and the trust gate.
// The cloud flag is off. No network, no weights, no chrome.*, no document, no window.
// TODO(owner): approving the glance-assist host for these calls is required before CLOUD_ENABLED can be true.
const FlowPersonalSlice6 = (() => {
  const CLOUD_ENABLED = false;
  const ENGINE = 'slice6-0';
  const HEAT_THRESHOLD = 5;
  const RRF_K = 60;
  const PRIVATE_SIMILARITY = 0.82;
  const TOMBSTONE_MS = 7 * 86400000;
  const BRIEF_MS = 86400000;
  const K_ANON = 5;
  const ALLOWED_LICENSES = ['Apache-2.0', 'MIT', 'BSD', 'PostgreSQL', 'CC-BY-4.0'];

  function tokens(text) {
    const bare = String(text || '')
      .replace(/[\u0591-\u05C7]/g, '')
      .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
      .toLowerCase();
    const parts = bare.split(/[^a-z0-9\u0590-\u05FF]+/).filter((w) => w.length > 1);
    const out = [];
    parts.forEach((word) => {
      out.push(word);
      if (word.length > 3 && /^[הובכלמש]/.test(word)) out.push(word.slice(1));
    });
    return out;
  }

  function embedLocal(text) {
    const vector = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    tokens(text).forEach((token) => {
      let h = 2166136261;
      for (let i = 0; i < token.length; i++) h = Math.imul(h ^ token.charCodeAt(i), 16777619);
      vector[(h >>> 0) % vector.length] += 1;
    });
    let norm = 0;
    vector.forEach((n) => { norm += n * n; });
    norm = Math.sqrt(norm) || 1;
    return { engine: 'e5-small', vector: vector.map((n) => Math.round((n / norm) * 1000) / 1000) };
  }

  function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / ((Math.sqrt(na) || 1) * (Math.sqrt(nb) || 1));
  }

  function bm25(query, docs) {
    const q = tokens(query);
    const avg = docs.reduce((sum, doc) => sum + tokens(doc.text).length, 0) / (docs.length || 1);
    const df = {};
    docs.forEach((doc) => {
      const seen = {};
      tokens(doc.text).forEach((token) => { seen[token] = 1; });
      Object.keys(seen).forEach((token) => { df[token] = (df[token] || 0) + 1; });
    });
    return docs.map((doc) => {
      const body = tokens(doc.text);
      let score = 0;
      q.forEach((token) => {
        const tf = body.filter((word) => word === token).length;
        if (!tf) return;
        const idf = Math.log(1 + (docs.length - (df[token] || 0) + 0.5) / ((df[token] || 0) + 0.5));
        score += idf * (tf * 2.2) / (tf + 1.2 * (1 - 0.75 + 0.75 * body.length / (avg || 1)));
      });
      return { id: doc.id, score: score };
    }).sort((a, b) => b.score - a.score);
  }

  function rrf(lists, weights) {
    const acc = {};
    lists.forEach((list, index) => {
      const weight = weights[index] || 1;
      list.forEach((row, rank) => {
        acc[row.id] = (acc[row.id] || 0) + weight / (RRF_K + rank + 1);
      });
    });
    return Object.keys(acc).map((id) => ({ id: id, score: acc[id] })).sort((a, b) => b.score - a.score);
  }

  function pageRank(graph, seeds) {
    const nodes = Object.keys(graph || {});
    const score = {};
    nodes.forEach((id) => { score[id] = seeds[id] ? 1 : 0; });
    for (let step = 0; step < 8; step++) {
      const next = {};
      nodes.forEach((id) => { next[id] = 0.15 * (seeds[id] ? 1 : 0); });
      nodes.forEach((id) => {
        const links = graph[id] || [];
        const share = links.length ? score[id] / links.length : 0;
        links.forEach((to) => { if (next[to] != null) next[to] += 0.85 * share; });
      });
      nodes.forEach((id) => { score[id] = next[id]; });
    }
    return score;
  }

  function retrieve(query, docs, graph) {
    const denseQuery = embedLocal(query).vector;
    const lexical = bm25(query, docs);
    const dense = docs.map((doc) => ({ id: doc.id, score: cosine(denseQuery, embedLocal(doc.text).vector) }))
      .sort((a, b) => b.score - a.score);
    const fused = rrf([lexical, dense], [1, 1]);
    const reranked = fused.map((row) => {
      const doc = docs.filter((item) => item.id === row.id)[0];
      const overlap = tokens(query).filter((token) => tokens(doc.text).indexOf(token) >= 0).length;
      return { id: row.id, score: row.score + overlap / 10 };
    }).sort((a, b) => b.score - a.score);
    const seeds = {};
    tokens(query).forEach((token) => {
      docs.forEach((doc) => {
        if (tokens(doc.text).indexOf(token) >= 0 && doc.entityId) seeds[doc.entityId] = 1;
      });
    });
    const rank = pageRank(graph || {}, seeds);
    return reranked.map((row) => {
      const doc = docs.filter((item) => item.id === row.id)[0];
      const graphScore = doc.entityId ? (rank[doc.entityId] || 0) : 0;
      return { id: row.id, score: Math.round((0.7 * row.score + 0.3 * graphScore) * 1000) / 1000, entityId: doc.entityId };
    }).sort((a, b) => b.score - a.score);
  }

  function orderCandidates(scored, query) {
    const docs = (scored || []).map((row) => ({
      id: row.subjectId,
      entityId: row.subjectId,
      text: (row.display || '') + ' ' + (row.address || '').split('@')[0]
    }));
    const graph = {};
    docs.forEach((doc) => { graph[doc.entityId] = []; });
    const ranked = retrieve(query, docs, graph);
    const ordered = ranked.map((row) => scored.filter((item) => item.subjectId === row.id)[0]).filter(Boolean);
    const top = ordered[0];
    const second = ordered[1];
    let status = 'none';
    if (top && (!second || (top.confidence || 0) - (second.confidence || 0) >= 0.15) && (top.confidence || 0) >= 0.72) status = 'one';
    else if (top) status = 'ask';
    return {
      applied: status !== 'none',
      model_assist: 'on',
      status: status,
      candidates: ordered.slice(0, 5),
      chosen: null,
      engine: ENGINE
    };
  }

  function contract(req) {
    const spans = (req && req.spans || []).map((span) => String(span || '').slice(0, 400)).filter(Boolean).slice(0, 8);
    return {
      spans: spans,
      spaceId: String(req && req.spaceId || 'work').slice(0, 64),
      consent: Array.isArray(req && req.consent) ? req.consent.slice(0, 8) : [],
      noLearn: req && req.noLearn === true
    };
  }

  function provider(role, opts) {
    const cloudOn = CLOUD_ENABLED === true && opts && opts.cloud === true;
    function answer(engine, extra) {
      return Object.assign({ ok: true, role: role, engine: engine, stored: false }, extra || {});
    }
    return {
      role: role,
      cloud: function (req) {
        if (role === 'asr') return { ok: false, reason: 'disabled', stored: false };
        if (!cloudOn) return { ok: false, reason: 'off', stored: false };
        const body = contract(req);
        if (body.noLearn) return { ok: false, reason: 'no-learn', stored: false };
        if (!body.consent.length) return { ok: false, reason: 'consent', stored: false };
        if (opts && typeof opts.post === 'function') opts.post({ body: body });
        return answer('cloud');
      },
      local: function (req) {
        const body = contract(req);
        return answer('e5-small', { vector: embedLocal(body.spans.join(' ')).vector });
      },
      stub: function () {
        return answer('fixture', { vector: [1, 0, 0, 0] });
      }
    };
  }

  function redact(text) {
    return String(text || '')
      .replace(/\b\d{9}\b/g, '[ID]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[PHONE]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
  }

  function classifyInjection(text) {
    const hit = /ignore previous|remember\s*:|always\s+cc|you are now|system\s*:/i.test(String(text || ''));
    return { injection: hit, stored: false };
  }

  function heat(item, now) {
    const ageH = Math.max(0, ((now || Date.now()) - (item.ts || 0)) / 3600000);
    return ((item.visits || 0) + (item.interactions || 0)) * Math.exp(-ageH / 24);
  }

  function promote(fact, evidence, heatScore, confirmed) {
    if (!fact || fact.provenance !== 'third_party_content') return { status: 'active', promoted: true };
    if (confirmed === true) return { status: 'active', promoted: true, reason: 'confirm' };
    const first = {};
    (evidence || []).forEach((row) => { if (row && row.party === 'first' && row.id) first[row.id] = 1; });
    if (heatScore >= HEAT_THRESHOLD && Object.keys(first).length >= 2) return { status: 'active', promoted: true, reason: 'heat' };
    return { status: 'candidate', promoted: false };
  }

  function externalAction(kind) {
    if (kind === 'send' || kind === 'share' || kind === 'delete') return { needsConfirm: true, kind: kind };
    return { needsConfirm: false, kind: kind || 'read' };
  }

  function hidePrivate(inbound, docs, threshold) {
    const limit = Number.isFinite(threshold) ? threshold : PRIVATE_SIMILARITY;
    const query = embedLocal(redact(inbound)).vector;
    const hidden = [];
    (docs || []).forEach((doc) => {
      if (!doc || doc.space === 'allowed') return;
      const sim = cosine(query, embedLocal(doc.text || '').vector);
      if (sim > limit) hidden.push(doc.id);
    });
    return {
      hidden: hidden,
      visible: (docs || []).filter((doc) => doc && doc.space === 'allowed' && hidden.indexOf(doc.id) < 0).map((doc) => doc.id),
      event: hidden.length ? { model_assist: 'on', reason: 'private-doc-hidden', count: hidden.length } : null
    };
  }

  function currentFacts(facts) {
    return (facts || []).filter((fact) => fact && !fact.invalid_at).map((fact) => ({
      id: fact.id,
      tier: fact.tier === 'explicit' ? 'explicit' : 'inferred',
      valid_at: fact.valid_at || fact.created_at || null,
      invalid_at: null,
      created_at: fact.created_at || null,
      expired_at: fact.expired_at || null,
      provenance: fact.provenance || 'user_action',
      evidence: fact.evidence || []
    }));
  }

  function contradict(facts) {
    const open = {};
    (facts || []).forEach((fact) => {
      if (!fact || fact.invalid_at) return;
      const key = fact.predicate || '';
      const prev = open[key];
      if (!prev) { open[key] = fact; return; }
      const prevExplicit = prev.tier === 'explicit';
      const nextExplicit = fact.tier === 'explicit';
      if (nextExplicit && !prevExplicit) open[key] = fact;
      else if (nextExplicit === prevExplicit && String(fact.created_at || '') > String(prev.created_at || '')) open[key] = fact;
    });
    return Object.keys(open).map((key) => open[key]);
  }

  function allowWrite(threadId, silent) {
    return !(silent && silent[threadId]);
  }

  function scheduleTombstone(fact, now) {
    if (fact && fact.evidence && fact.evidence.length) return null;
    return { factId: fact && fact.id, tombstone_at: (now || Date.now()) + TOMBSTONE_MS };
  }

  function dueTombstones(rows, now) {
    return (rows || []).filter((row) => row && row.tombstone_at && row.tombstone_at <= (now || Date.now()));
  }

  function audit(log, event) {
    const next = (log || []).slice();
    next.push({ ts: event && event.ts || Date.now(), action: event && event.action || 'read', factId: event && event.factId || '' });
    return next;
  }

  function chip(fact) {
    return { label: 'based on', count: fact && fact.evidence ? fact.evidence.length : 0, factId: fact && fact.id };
  }

  function userState(events) {
    const names = ['decision', 'shown', 'clicked', 'closed', 'undone', 'failed', 'dismissed', 'missed'];
    const vector = names.map((name) => (events || []).filter((event) => String(event && event.type || '').indexOf('.' + name + '.') >= 0).length);
    return { vector: vector, cached: true, engine: ENGINE };
  }

  function readCache(cache) {
    if (!cache || cache.cached !== true) return { ok: false, reason: 'cache-only' };
    return { ok: true, vector: cache.vector };
  }

  function visibleBriefs(cards, now) {
    const at = now || Date.now();
    return (cards || []).filter((card) => card && (card.pinned === true || at - (card.created || 0) < BRIEF_MS));
  }

  function ndcg(ranked, relevant, k) {
    const limit = k || 20;
    const rel = {};
    (relevant || []).forEach((row) => { rel[row.id] = row.gain || 1; });
    let dcg = 0;
    ranked.slice(0, limit).forEach((id, index) => {
      const gain = rel[id] || 0;
      dcg += (Math.pow(2, gain) - 1) / Math.log2(index + 2);
    });
    const ideal = Object.keys(rel).map((id) => rel[id]).sort((a, b) => b - a).slice(0, limit);
    let idcg = 0;
    ideal.forEach((gain, index) => { idcg += (Math.pow(2, gain) - 1) / Math.log2(index + 2); });
    return idcg ? Math.round((dcg / idcg) * 1000) / 1000 : 0;
  }

  function latestPreference(facts) {
    const open = currentFacts(facts).filter((fact) => fact.tier === 'explicit');
    open.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return open[0] || null;
  }

  function f1(tp, fp, fn) {
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    if (!precision && !recall) return 0;
    return Math.round((2 * precision * recall / (precision + recall)) * 1000) / 1000;
  }

  function temporalSplit(rows, cutoff) {
    return {
      train: (rows || []).filter((row) => String(row.at || '') < cutoff),
      test: (rows || []).filter((row) => String(row.at || '') >= cutoff)
    };
  }

  function aggregate(counts) {
    return { ok: false, reason: 'disabled', k: K_ANON, library: 'opendp', kept: (counts || []).filter((row) => row.count >= K_ANON).length };
  }

  function hebrewEval(cases) {
    const rows = Array.isArray(cases) ? cases : [];
    const scores = rows.map((row) => {
      const ranked = retrieve(row.query, row.docs || [], row.graph || {}).map((item) => item.id);
      return ndcg(ranked, row.relevant || [], 20);
    });
    const sum = scores.reduce((total, score) => total + score, 0);
    const mean = scores.length ? Math.round((sum / scores.length) * 1000) / 1000 : 0;
    return { queries: scores.length, meanNdcg: mean, scores: scores };
  }

  return {
    CLOUD_ENABLED: CLOUD_ENABLED,
    ENGINE: ENGINE,
    HEAT_THRESHOLD: HEAT_THRESHOLD,
    ALLOWED_LICENSES: ALLOWED_LICENSES,
    tokens: tokens,
    embedLocal: embedLocal,
    retrieve: retrieve,
    orderCandidates: orderCandidates,
    provider: provider,
    redact: redact,
    classifyInjection: classifyInjection,
    heat: heat,
    promote: promote,
    externalAction: externalAction,
    hidePrivate: hidePrivate,
    currentFacts: currentFacts,
    contradict: contradict,
    allowWrite: allowWrite,
    scheduleTombstone: scheduleTombstone,
    dueTombstones: dueTombstones,
    audit: audit,
    chip: chip,
    userState: userState,
    readCache: readCache,
    visibleBriefs: visibleBriefs,
    ndcg: ndcg,
    hebrewEval: hebrewEval,
    latestPreference: latestPreference,
    f1: f1,
    temporalSplit: temporalSplit,
    aggregate: aggregate
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowPersonalSlice6 };
else if (typeof globalThis !== 'undefined') globalThis.FlowPersonalSlice6 = FlowPersonalSlice6;
