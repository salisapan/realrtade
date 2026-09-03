/**
 * Single source of truth for the cut. The audio build script and the
 * composition both read these, so score and picture cannot drift.
 */
export const FPS = 60;
export const TOTAL = 1560;

export const ACT = {
  kinetic: { from: 0, duration: 210 },
  chaos: { from: 200, duration: 360, collapseStart: 270 },
  doIt: { from: 495, duration: 295 },
  app: { from: 760, duration: 390 },
  results: { from: 1120, duration: 330 },
  outro: { from: 1420, duration: 140 },
} as const;

/** Absolute frame of the chaos implosion. */
export const COLLAPSE_FRAME = ACT.chaos.from + ACT.chaos.collapseStart;

/** Local frame inside DoItButton where the cursor lands the click. */
export const CLICK_LOCAL = 190;
/** Absolute frame of the click — the loudest moment in the score. */
export const CLICK_FRAME = ACT.doIt.from + CLICK_LOCAL;

/** Local frames inside FlowApp where each step flips to done. */
export const STEP_DONE_LOCAL = [96, 148, 200, 252, 304];
/** Absolute frames of each step completion, for the audio ticks. */
export const STEP_DONE_FRAMES = STEP_DONE_LOCAL.map((f) => ACT.app.from + f);

/** Local frames inside ResultDeck where each checkmark draws. */
export const RESULT_CHECK_LOCAL = [10, 20, 30, 40, 50, 60].map((d) => d + 10);
export const RESULT_CHECK_FRAMES = RESULT_CHECK_LOCAL.map((f) => ACT.results.from + f);

/** Local frame where the headline stat resolves. */
export const HEADLINE_LOCAL = 150;
export const HEADLINE_FRAME = ACT.results.from + HEADLINE_LOCAL;
