/* Dark, deep visual system. Elements sit *in* a lit scene rather than on a
   flat field, so surfaces carry layered shadow + a lit top edge. */

export const BG = '#080B14';
export const BG_ELEV = '#0E1320';

/* On the dark ground */
export const TEXT = '#F5F7FA';
export const MUTED = '#8A93A6';

/* On light surfaces (the app windows stay light on purpose) */
export const INK = '#0F1420';
export const INK_MUTED = '#5A6478';
export const WINDOW_BORDER = 'rgba(15,20,32,0.10)';

/* AI palette */
export const VIOLET = '#7C5CFF';
export const BLUE = '#2E7BFF';
export const TEAL = '#22D3EE';
export const ACCENT = '#4D8DFF';
export const ACCENT_DARK = '#1E3A8A';
export const SUCCESS = '#22C55E';

export const GRADIENT_AI = `linear-gradient(100deg, ${VIOLET} 0%, ${BLUE} 45%, ${TEAL} 100%)`;

/* Dark glass */
export const GLASS_BG = 'rgba(255,255,255,0.055)';
export const GLASS_BORDER = 'rgba(255,255,255,0.13)';
export const GLASS_HIGHLIGHT = 'inset 0 1px 0 rgba(255,255,255,0.16)';

/* Depth reads from stacked shadows: a tight contact shadow, a broad ambient
   one, and — on hero elements — a coloured glow. A single soft shadow is what
   made the previous cut look flat. */
export const SHADOW = '0 2px 6px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.38)';
export const SHADOW_LG =
  '0 4px 12px rgba(0,0,0,0.5), 0 24px 60px rgba(0,0,0,0.45), 0 60px 120px rgba(0,0,0,0.35)';
export const SHADOW_XL =
  '0 8px 20px rgba(0,0,0,0.55), 0 40px 90px rgba(0,0,0,0.5), 0 90px 180px rgba(0,0,0,0.42)';
export const GLOW_AI = `0 0 90px ${VIOLET}44, 0 0 180px ${BLUE}33`;

export const FONT_STACK =
  '"Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
