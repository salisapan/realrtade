// A model of HOW LONG each person takes — portable, no chrome.*, no DOM, no network, no
// model service. This is the part of Glance that learns about YOU: its input is the loops you
// have already closed (and the ones still open), and its output is when to look again and which
// loops are unlikely to close on time.
//
// Why a statistical model and not a fixed "two business days": people differ by an order of
// magnitude. One person answers in a day, another in a week. A chase on a fixed day is too early
// for the slow and too late for the fast.
//
// The model, per (person, kind of loop): the time to close is log-normal. Estimated by
// expectation-maximisation with
//   - a population prior (a few pseudo-observations), so a new person starts from the typical
//     and only gradually becomes personal: no overconfidence from one data point;
//   - right-censoring: a loop still open after d days is evidence the person takes at least d days.
//     Ignoring open loops would flatter slow people. Each is a censored observation (Tobit-style
//     EM: replace it by its expected log-time under the current fit).
// Forecasts are conditional on the loop's age: P(done within h more days | still open after a).
//
// Two refinements make the estimate honest about how people actually work:
//   - time is counted in BUSINESS days: an ask sent on Friday and answered on Monday took one business
//     day, not three. Weekends are not slowness;
//   - partial pooling by organisation: a brand-new person at a company where Glance has already seen
//     colleagues starts from THEIR habits (a department answers alike), not from the whole population.
//     Free-mail domains (gmail.com...) are never pooled: those are strangers, not colleagues.
//
// Honest limits (docs/ai-engine-upgrade.md §2, §2b): it needs a few closed loops with the person
// before it is personal; it models time to close, not whether they are willing; replies closed
// by hand ("Mark done") are not used because the person may have settled it outside email.
const FlowPersonModel = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Population prior, days. Deliberately broad. n0 = how many pseudo-observations it is worth.
  const PRIOR = {
    reply: { mu: Math.log(2), sigma: 1.0, n0: 2 },
    payment: { mu: Math.log(6.5), sigma: 0.85, n0: 2 }
  };
  const FREEMAIL = /^(?:gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton|protonmail|walla|012|bezeqint|netvision|zahav|gmx|mail|yandex)\.[a-z.]+$/i;
  const DOMAIN_N0 = 3;                  // how many pseudo-observations a colleague group is worth
  const MIN_SIGMA = 0.35, MAX_SIGMA = 1.8;
  const MAX_AGE_DAYS = 120;           // older than this and a loop is abandoned, not slow
  const REAL_CLOSES = { replied: 1, paid: 1, delivered: 1, declined: 1 };

  // ---- the normal distribution ---------------------------------------------------------
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  function Phiinv(p) {                 // bisection: tiny, exact enough, no dependency
    let lo = -8, hi = 8;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  // ---- business time ------------------------------------------------------------------------
  const isBiz = (d) => d.getDay() !== 0 && d.getDay() !== 6;
  // Fractional business days between two instants (weekends count as zero).
  let CLOCK = 'business';   // 'calendar' exists only so scripts/person-model-sim.cjs can measure what business time buys
  function setClock(c) { CLOCK = c === 'calendar' ? 'calendar' : 'business'; }
  function bizDays(startMs, endMs) {
    if (!(endMs > startMs)) return 0;
    if (CLOCK === 'calendar') return (endMs - startMs) / DAY_MS;
    let total = 0;
    const d = new Date(startMs);
    let cursor = startMs;
    for (let i = 0; i < 400 && cursor < endMs; i++) {
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const segEnd = Math.min(next, endMs);
      if (isBiz(new Date(cursor))) total += (segEnd - cursor) / DAY_MS;
      cursor = segEnd; d.setTime(next);
    }
    return total;
  }

  // ---- observations from the stored loops ------------------------------------------------
  function who(w) { return String((w && w.counterpart && w.counterpart.email) || '').toLowerCase(); }
  function kindOf(w) { return w && w.kind === 'payment' ? 'payment' : 'reply'; }
  function theirs(w) { return w && w.direction !== 'mine' && w.direction !== 'clock'; }

  // { events: [days], censored: [days] } for one person and kind.
  function observe(watches, email, kind, now) {
    const events = [], censored = [];
    (Array.isArray(watches) ? watches : []).forEach((w) => {
      if (!theirs(w) || who(w) !== String(email || '').toLowerCase() || kindOf(w) !== kind || !w.createdAt) return;
      if (w.status === 'resolved' && REAL_CLOSES[w.closedAs] && w.resolvedAt > w.createdAt) {
        events.push(Math.max(0.25, bizDays(w.createdAt, w.resolvedAt)));
      } else if (w.status === 'waiting') {
        const age = bizDays(w.createdAt, now);
        if (age >= 1 && age <= MAX_AGE_DAYS) censored.push(age);
      }
    });
    return { events, censored };
  }

  // ---- the fit: EM for a log-normal with a prior and right-censoring ------------------------
  function fit(obs, kind, priorOverride) {
    const pr = priorOverride || PRIOR[kind] || PRIOR.reply;
    const xs = obs.events.map(Math.log), cs = obs.censored.map(Math.log);
    let mu = pr.mu, sigma = pr.sigma;
    const n = xs.length, m = cs.length, N = pr.n0 + n + m;
    for (let it = 0; it < 40; it++) {
      let sx = pr.n0 * pr.mu, sxx = pr.n0 * (pr.sigma * pr.sigma + pr.mu * pr.mu);
      xs.forEach((x) => { sx += x; sxx += x * x; });
      cs.forEach((c) => {
        const z = (c - mu) / sigma;
        const tail = Math.max(1 - Phi(z), 1e-9);
        const lam = phi(z) / tail;
        const ex = mu + sigma * lam;                              // E[log T | T > c]
        const vr = sigma * sigma * (1 + z * lam - lam * lam);     // Var[log T | T > c]
        sx += ex; sxx += vr + ex * ex;
      });
      const muNew = sx / N;
      const varNew = Math.max(sxx / N - muNew * muNew, 1e-6);
      const sigNew = Math.min(MAX_SIGMA, Math.max(MIN_SIGMA, Math.sqrt(varNew)));
      const done = Math.abs(muNew - mu) < 1e-6 && Math.abs(sigNew - sigma) < 1e-6;
      mu = muNew; sigma = sigNew;
      if (done) break;
    }
    const level = n >= 3 ? 'personal' : n >= 1 ? 'learning' : 'prior';
    return { mu, sigma, n, censored: m, level, pooled: Boolean(priorOverride) };
  }

  function domainOf(email) {
    const m = String(email || '').toLowerCase().match(/@([^@\s]+)$/);
    return m && !FREEMAIL.test(m[1]) ? m[1] : null;
  }

  // What colleagues at the same organisation suggest, as a prior for someone new: the fit over
  // everyone ELSE at the domain (open and closed loops), worth DOMAIN_N0 observations. Needs at least
  // two real closes from at least two other people, otherwise the population prior stays.
  function domainPrior(watches, email, kind, now) {
    const dom = domainOf(email);
    if (!dom) return null;
    const me = String(email).toLowerCase();
    const others = {};
    (Array.isArray(watches) ? watches : []).forEach((w) => {
      const e = who(w);
      if (!e || e === me || domainOf(e) !== dom) return;
      others[e] = true;
    });
    const emails = Object.keys(others);
    if (emails.length < 2) return null;
    const events = [], censored = [];
    emails.forEach((e) => { const o = observe(watches, e, kind, now); events.push.apply(events, o.events); censored.push.apply(censored, o.censored); });
    if (events.length < 2) return null;
    const f = fit({ events, censored }, kind);
    return { mu: f.mu, sigma: f.sigma, n0: DOMAIN_N0 };
  }

  function model(watches, email, kind, now) {
    const k = kind === 'payment' ? 'payment' : 'reply';
    const own = observe(watches, email, k, now);
    // The domain prior only matters while there is little data about the person themself.
    const dp = own.events.length < 6 ? domainPrior(watches, email, k, now) : null;
    return Object.assign({ kind: k, email: String(email || '').toLowerCase() }, fit(own, k, dp));
  }

  // ---- forecasts -----------------------------------------------------------------------------
  const cdf = (f, days) => (days <= 0 ? 0 : Phi((Math.log(days) - f.mu) / f.sigma));
  // Quantile of time-to-close, in days, unconditional.
  const quantile = (f, q) => Math.exp(f.mu + f.sigma * Phiinv(q));

  // P(done within `horizonDays` more days | still open after `ageDays`).
  function pWithin(f, ageDays, horizonDays) {
    const a = Math.max(0, ageDays);
    const Fa = cdf(f, a);
    if (Fa > 0.999999) return 0.5;
    return Math.min(1, Math.max(0, (cdf(f, a + horizonDays) - Fa) / (1 - Fa)));
  }
  // Median additional days until done, given still open after `ageDays`.
  function remainingMedian(f, ageDays) {
    const a = Math.max(0, ageDays);
    const Fa = cdf(f, a);
    const target = Fa + 0.5 * (1 - Fa);
    return Math.max(0.25, quantile(f, Math.min(target, 0.999999)) - a);
  }

  // ---- what the product does with it ---------------------------------------------------------------
  // When to look at a NEW loop. Only personal once there are at least two real closes with this person;
  // before that the caller keeps its default, so a new person behaves exactly as before.
  // Returns { days, level, n, typical } or null.
  function suggestChaseDays(watches, email, kind, now) {
    if (!email) return null;
    const f = model(watches, email, kind, now);
    if (f.n < 2 && !f.pooled) return null;
    // Look when a reply is "late for this person": about the 70th percentile of how long they take, in business days.
    const days = Math.min(21, Math.max(1, Math.round(quantile(f, 0.7))));
    return { days, level: f.pooled && f.n < 2 ? 'colleagues' : f.level, n: f.n, typical: Math.round(quantile(f, 0.5) * 10) / 10 };
  }

  // After a chase: how long to give them before looking again. Conditional on the age of the loop.
  function suggestWaitDays(watches, w, now) {
    const email = who(w);
    if (!email) return null;
    const f = model(watches, email, kindOf(w), now);
    if (f.n < 2) return null;
    const age = bizDays(w.createdAt || now, now);
    return { days: Math.min(14, Math.max(1, Math.ceil(remainingMedian(f, age)))), level: f.level, n: f.n };
  }

  // Is a loop with a date likely to slip? Needs personal evidence (>= 3 real closes).
  // Returns { slip, pOnTime, typical, n } or null.
  function risk(watches, w, now) {
    if (!w || w.status !== 'waiting' || !theirs(w) || !w.deadlineIso) return null;
    const f = model(watches, who(w), kindOf(w), now);
    if (f.level !== 'personal') return null;
    const due = new Date(w.deadlineIso + 'T23:59:59').getTime();
    if (due < now) return null;                           // already late: the deadline-passed label says so
    const daysLeft = bizDays(now, due);
    const age = bizDays(w.createdAt || now, now);
    const pOnTime = pWithin(f, age, daysLeft);
    return { slip: pOnTime < 0.35, pOnTime: Math.round(pOnTime * 100) / 100, typical: Math.round(quantile(f, 0.5) * 10) / 10, n: f.n };
  }

  // "Dana usually takes about 5 days": for a row, only with personal evidence.
  function typicalDays(watches, w, now) {
    const f = model(watches, who(w), kindOf(w), now);
    return f.level === 'personal' ? Math.max(1, Math.round(quantile(f, 0.5))) : null;
  }

  return { model, observe, fit, domainOf, domainPrior, bizDays, setClock, pWithin, remainingMedian, quantile, suggestChaseDays, suggestWaitDays, risk, typicalDays, PRIOR };
})();

if (typeof module !== 'undefined') module.exports = { FlowPersonModel };
