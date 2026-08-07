import type { SpringConfig } from "remotion";

/**
 * Default motion for all discrete UI arrivals (cards, rings, titles, button press).
 * Remotion's own spring default (damping:10, stiffness:100) is visibly bouncy —
 * wrong for this brief. This is tuned snappy with zero overshoot: settles in
 * roughly 0.3-0.4s instead of the ~0.6-0.8s a "premium but relaxed" spring would take.
 */
export const FAST_SPRING: SpringConfig = {
  damping: 22,
  mass: 0.8,
  stiffness: 260,
  overshootClamping: true,
};

/**
 * Camera moves only. Heavier damping so large dolly/orbit moves never wobble —
 * a bouncy camera reads as amateurish regardless of how snappy everything else is.
 */
export const CAMERA_SPRING: SpringConfig = {
  damping: 40,
  mass: 1,
  stiffness: 150,
  overshootClamping: true,
};

/**
 * The one deliberate exception: Act 4's per-use-case completion badges
 * (email sent / logged in CRM / marked Done) get a small intentional overshoot —
 * it reads as a satisfying "pop" rather than a mechanical snap.
 */
export const SUCCESS_POP_SPRING: SpringConfig = {
  damping: 18,
  mass: 0.8,
  stiffness: 220,
  overshootClamping: false,
};
