import { bodyTextFromGraphMessage } from './graph.mjs';

export function graphMessageToJudgeInput(msg, opts) {
  const o = opts || {};
  const from = msg?.from?.emailAddress || {};
  const text = bodyTextFromGraphMessage(msg);
  return {
    surface: 'outlook',
    inbound: true,
    text,
    subject: msg?.subject || '',
    sender: { name: from.name || '', email: from.address || '' },
    toRecipients: msg?.toRecipients || [],
    ccRecipients: msg?.ccRecipients || [],
    attachmentCount: o.attachmentCount || 0,
    ownAddresses: o.ownAddresses || null
  };
}
