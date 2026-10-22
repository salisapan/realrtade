import { patchForMark, patchMessage } from './graph.mjs';
import { graphMessageToJudgeInput } from './judge-input.mjs';
import { judgeIncoming, shouldOfferDoIt } from '../judge-bundle.mjs';

export async function processMessageForMark(deps, userId, messageId, accessToken, msg) {
  if (await deps.isDismissed(userId, messageId)) return { action: 'skip-dismissed' };
  if (await deps.isAlreadyMarked(userId, messageId)) return { action: 'skip-marked' };
  const judgeIn = graphMessageToJudgeInput(msg, deps.judgeOpts || {});
  const judged = judgeIncoming(judgeIn);
  if (!shouldOfferDoIt(judged)) return { action: 'skip-quiet' };
  const patch = patchForMark(msg.categories);
  await patchMessage(accessToken, messageId, patch);
  await deps.recordMarked(userId, messageId);
  return { action: 'marked' };
}
