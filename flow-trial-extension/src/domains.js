// Domain profiles — the "what kind of work do you do" dimension.
//
// A profile never encodes a rule. It supplies vocabulary: which nouns count as a
// real object of work in this field, and how to phrase the action once the
// judgment engine has decided there is one. Every profile runs through the same
// scorer with the same weights; the profile only adds its own entity vocabulary
// and writes the sentence at the end.
//
// Adding a line of work means adding a profile here. It never means asking
// someone to author "when X, do Y" — that is the configuration burden this
// product exists to remove.

const FLOW_DOMAINS = [
  {
    id: 'sales',
    label: 'Sales & business development',
    entity: 'Deal / client',
    // Nouns that mean "this message is about the object of my work".
    entityWords: /\b(deal|proposal|quote|pricing|contract|renewal|pilot|po\b|purchase order|order|subscription|seat[s]?|contract value|mrr|arr|msa|sow|statement of work)\b/i,
    title(facts) {
      if (facts.lost) return 'Log lost deal';
      if (facts.moneyText && facts.date) return 'Log ' + facts.moneyText + ' confirmed, ' + facts.dateText;
      if (facts.moneyText) return 'Log confirmed value ' + facts.moneyText;
      if (facts.date) return 'Log agreed date ' + facts.dateText;
      return 'Log deal update';
    }
  },
  {
    id: 'legal',
    label: 'Legal & deal coordination',
    entity: 'Matter / agreement',
    entityWords: /\b(agreement|contract|matter|clause|amendment|addendum|nda|counterparty|execution|filing|redline|counsel|term sheet|msa|sow|statement of work)\b/i,
    title(facts) {
      if (facts.executed) return 'Log agreement executed';
      if (facts.date) return 'Log deadline ' + facts.dateText;
      if (facts.moneyText) return 'Log agreed consideration ' + facts.moneyText;
      return 'Log matter update';
    }
  },
  {
    id: 'finance',
    label: 'Finance & billing',
    entity: 'Invoice / vendor',
    entityWords: /\b(invoice|bill|billing|payment|remittance|receipt|vendor|supplier|statement|credit note|purchase order|po number|net ?\d{2})\b/i,
    title(facts) {
      if (facts.dispute) return 'Log billing exception';
      if (facts.moneyText && facts.date) return 'Log ' + facts.moneyText + ' due ' + facts.dateText;
      if (facts.moneyText) return 'Log invoice ' + facts.moneyText;
      if (facts.date) return 'Log payment date ' + facts.dateText;
      return 'Log billing update';
    }
  },
  {
    id: 'ops',
    label: 'Operations & admin',
    entity: 'Task / request',
    entityWords: /\b(request|ticket|order|shipment|delivery|schedule|booking|onboarding|access|approval|handover|sla)\b/i,
    title(facts) {
      if (facts.date) return 'Log commitment due ' + facts.dateText;
      if (facts.moneyText) return 'Log ' + facts.moneyText + ' agreed';
      return 'Log follow-up commitment';
    }
  },
  {
    id: 'support',
    label: 'Customer success & support',
    entity: 'Ticket / renewal',
    entityWords: /\b(ticket|renewal|churn|escalation|refund|complaint|support case|csat|downgrade|cancel(?:lation)?)\b/i,
    title(facts) {
      if (facts.lost) return 'Log churn risk';
      if (facts.date && facts.moneyText) return 'Log renewal ' + facts.moneyText + ' due ' + facts.dateText;
      if (facts.moneyText) return 'Log refund ' + facts.moneyText;
      if (facts.date) return 'Log renewal date ' + facts.dateText;
      return 'Log account update';
    }
  },
  {
    id: 'hr',
    label: 'Recruiting & hiring',
    entity: 'Candidate / offer',
    entityWords: /\b(candidate|offer letter|interview|hire|hiring|onboarding|background check|reference check|start date|headcount)\b/i,
    title(facts) {
      if (facts.lost) return 'Log candidate declined';
      if (facts.date && facts.moneyText) return 'Log offer ' + facts.moneyText + ', starts ' + facts.dateText;
      if (facts.moneyText) return 'Log offer ' + facts.moneyText;
      if (facts.date) return 'Log start date ' + facts.dateText;
      return 'Log hiring update';
    }
  }
];

if (typeof module !== 'undefined') module.exports = { FLOW_DOMAINS };
