// ESM entry for Supabase Edge: same on-device judge as the extension (incoming-judge).
import { FlowIntent } from '../core/intent.js';
import { FlowActions } from '../core/actions.js';
import { FlowIncomingJudge } from '../core/incoming-judge.js';
import { FlowRequestTypes } from '../core/request-types.js';
import { FlowExtract } from '../core/extract.js';

globalThis.FlowIntent = FlowIntent;
globalThis.FlowActions = FlowActions;
globalThis.FlowRequestTypes = FlowRequestTypes;
globalThis.FlowExtract = FlowExtract;

export function judgeOutlookInboxMessage(msg, me) {
  const body = (msg && msg.body && msg.body.content) || (msg && msg.bodyPreview) || '';
  const from = msg && msg.from && msg.from.emailAddress;
  return FlowIncomingJudge.judge({
    text: body,
    subject: msg && msg.subject,
    senderEmail: from && from.address,
    senderName: from && from.name,
    ownAddresses: Array.isArray(me) ? me : [],
    attachmentCount: msg && msg.hasAttachments ? 1 : 0,
    surface: 'outlook'
  });
}
