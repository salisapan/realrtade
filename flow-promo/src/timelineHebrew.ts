/**
 * Single source of truth for the Hebrew "Cognitive OS" cut (5 acts).
 * Mirrors the ACT={from,duration} pattern used in timeline.ts: both the
 * visual components and the audio-generation scripts read from here, so a
 * timing change only has to be made once.
 *
 * Acts overlap by 30 frames at each boundary (a crossfade window), which is
 * why TOTAL (88s) comes in a little under the script's 90s target — well
 * inside the brief's own "75-90s" range.
 */
export const FPS = 60;

export const ACT = {
  pain: { from: 0, duration: 720 },
  inversion: { from: 690, duration: 600 },
  verticals: { from: 1260, duration: 2580 },
  graph: { from: 3810, duration: 780 },
  close: { from: 4560, duration: 720 },
} as const;

export const TOTAL = ACT.close.from + ACT.close.duration; // 5280 (88s)

// ---- Act 3: the three vertical case studies --------------------------
// Each vertical gets an 860f window (30f crossfade into the next), with the
// same 6-beat structure: mail in -> [בצע] click -> Shield catch -> confirm
// -> external system executes -> concrete result.
const VERT_DURATION = 860;
const VERT_OVERLAP = 30;

export const VERT_LOCAL = [0, VERT_DURATION - VERT_OVERLAP, (VERT_DURATION - VERT_OVERLAP) * 2].map(
  (f) => f,
);
export const VERTICALS = VERT_LOCAL.map((local) => ({
  from: ACT.verticals.from + local,
  duration: VERT_DURATION,
}));

export const BEAT_LOCAL = {
  mail: 0,
  click: 300,
  shield: 420,
  confirm: 570,
  result: 720,
  holdEnd: 820,
};

export const CLICK_FRAMES = [
  ...VERTICALS.map((v) => v.from + BEAT_LOCAL.click),
  ACT.close.from + 200, // the 4th [בצע] press, in the closing act
];
export const SHIELD_FRAMES = VERTICALS.map((v) => v.from + BEAT_LOCAL.shield);
export const CONFIRM_FRAMES = VERTICALS.map((v) => v.from + BEAT_LOCAL.confirm);
export const RESULT_FRAMES = VERTICALS.map((v) => v.from + BEAT_LOCAL.result);
export const CLOSE_CLICK_FRAME = ACT.close.from + 200;

// ---- Act 2: logo coalescing + AI-vs-execution split -------------------
export const LOGO_FORM_LOCAL = { start: 0, end: 300 };
export const INTENT_REVEAL_LOCAL = { start: 320, end: ACT.inversion.duration };

// ---- Act 4: knowledge graph settle -------------------------------------
export const GRAPH_SETTLE_LOCAL = { start: 0, end: 300 };

// ---- Narration ----------------------------------------------------------
export type VoLine = { frame: number; text: string; holdSeconds: number };

export const VO_LINES: VoLine[] = [
  {
    frame: ACT.pain.from + 20,
    text: 'כל יום, אנשי מקצוע בתעשיות המפוקחות עושים את אותה עבודה. פותחים מייל, מעתיקים נתון, עוברים למערכת, מדביקים, בודקים שוב ושוב.',
    holdSeconds: 11.7,
  },
  {
    frame: ACT.inversion.from + 10,
    text: 'פלואו הוא לא עוד עוזר שכותב תשובה. הוא תשתית ביצוע שמבינה כוונה ופועלת בתוך המערכות שלכם, באופן דטרמיניסטי ומתועד.',
    holdSeconds: 9.7,
  },
  {
    frame: VERTICALS[0].from + BEAT_LOCAL.mail + 20,
    text: 'עורך דין. עסקת נדלן. פלואו ממלא, מאמת, ומדווח, ישירות לרשות המסים.',
    holdSeconds: 12,
  },
  {
    frame: VERTICALS[1].from + BEAT_LOCAL.mail + 20,
    text: 'סוכנת ביטוח. פוליסת מנהלים. פלואו תופס פער של ארבע מאות וחמישים שקלים שאף אחד לא היה שם לב אליו, לפני שהוא הופך לבעיה.',
    holdSeconds: 13,
  },
  {
    frame: VERTICALS[2].from + BEAT_LOCAL.mail + 20,
    text: 'רכזת פרויקט התחדשות עירונית. פלואו לא רק מעדכן תיק. הוא מראה לך ברגע שהחתימה הזו חוצה את הסף החוקי.',
    holdSeconds: 13,
  },
  {
    frame: ACT.graph.from + 10,
    text: 'עורך דין. סוכנת ביטוח. רכזת נדלן. תעשיות שונות. אותה שיטת עבודה. פלואו צופה, תופס את מה שהעין מפספסת, ופועל רק אחרי שאתם אומרים בצע.',
    holdSeconds: 12,
  },
  {
    frame: ACT.close.from + 10,
    text: 'פלואו. לא עוד כלי. תשתית ביצוע.',
    holdSeconds: 5,
  },
];
