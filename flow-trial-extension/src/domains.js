// Domain profiles — the "what kind of work" dimension of flexibility.
//
// A domain profile does NOT define trigger->action rules. It only biases the
// judgment engine's attention: which entities matter, which verbs count as a
// real event, and what language to use when it proposes an action. Adding a
// new line of work means adding a profile here — never asking the end user
// to author logic.
//
// judged() in judgment.js reads whichever profile the user picked at
// onboarding and uses it purely as context for the (future) model call.
// Everything under `demoTriggers` exists only so Phase 1 can render a
// realistic end-to-end chip without a live model call — it is replaced
// wholesale once judgment.js talks to a real model, and until then it's the
// only thing standing in for "is this worth flagging."

const FLOW_DOMAINS = [
  {
    id: 'sales',
    label: 'Sales & business development',
    entity: 'Deal / client',
    verbs: ['price confirmed', 'scope changed', 'signing date', 'deal lost'],
    actionVerb: (ctx) => `update deal value to ${ctx.amount || '…'}`,
    demoTriggers: [
      { pattern: /(we're good at|agreed on|confirmed)[^.]{0,40}(\$[\d,]+(?:\.\d+)?|\d[\d,]*\s?(usd|dollars))/i,
        buildAction: (m) => `update deal value to ${m[2]}` },
      { pattern: /(not moving forward|we're pulling out|decided to go with someone else)/i,
        buildAction: () => `mark deal as lost` }
    ]
  },
  {
    id: 'legal',
    label: 'Legal & deal coordination',
    entity: 'Matter / agreement',
    verbs: ['draft agreement', 'filing deadline', 'signed', 'clause revised'],
    actionVerb: (ctx) => `update matter deadline to ${ctx.date || '…'}`,
    demoTriggers: [
      { pattern: /(deadline|due date|must be filed by)[^.]{0,30}(\d{1,2}\/\d{1,2})/i,
        buildAction: (m) => `update matter deadline to ${m[2]}` },
      { pattern: /(fully executed|signed the agreement|countersigned)/i,
        buildAction: () => `mark matter as signed` }
    ]
  },
  {
    id: 'finance',
    label: 'Finance & billing',
    entity: 'Invoice / vendor',
    verbs: ['invoice received', 'amount mismatch', 'payment approved'],
    actionVerb: (ctx) => `flag payment exception — ${ctx.detail || 'amount mismatch'}`,
    demoTriggers: [
      { pattern: /(invoice)[^.]{0,40}(\$[\d,]+(?:\.\d+)?)/i,
        buildAction: (m) => `log invoice — ${m[2]}` },
      { pattern: /(amount doesn't match|billing error|double charged)/i,
        buildAction: () => `flag payment exception for review` }
    ]
  },
  {
    id: 'ops',
    label: 'Operations & admin',
    entity: 'Task / request',
    verbs: ['new request', 'status changed', 'needs follow-up'],
    actionVerb: () => `create a follow-up task`,
    demoTriggers: [
      { pattern: /(please handle|can you update|still waiting on your reply)/i,
        buildAction: () => `create a follow-up task` }
    ]
  }
];

// Exposed for popup + content script (classic scripts share this global).
if (typeof module !== 'undefined') module.exports = { FLOW_DOMAINS };
