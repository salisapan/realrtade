// The switch for carrying a loop until it closes (core/follow-up.js nextMove, docs/glance-ai/proposals/2026-10-11-next-move.md). Public: nothing here is a secret.
//
// nextMove: after the third nudge goes unanswered, Glance proposes ONE other way to get the loop closed, from evidence it already
//           has: the app where this person really answers you, one colleague on the thread who has answered you before, or
//           "Still need this?". A proposal only: it never closes, writes or sends; the person does the move. FALSE in this build:
//           nothing calls it yet, the surface is Glance's own card and steps list (mock to the owner first), and turning it on is
//           the owner's decision. With it off the follow loop is byte-identical.
export const CARRY = { nextMove: false };
