import { continueRender, delayRender, staticFile } from 'remotion';

let started = false;

/**
 * Self-hosted Heebo (Hebrew subset only) — Inter has no Hebrew glyphs.
 * Uses delayRender so Remotion never captures a frame before the font is
 * actually loaded (a plain <style> @font-face tag doesn't block rendering).
 */
export const ensureHebrewFont = () => {
  if (started || typeof document === 'undefined') return;
  started = true;

  const handle = delayRender('Loading Heebo (Hebrew) font');

  Promise.all([
    new FontFace('Heebo', `url('${staticFile('fonts/Heebo-Regular.woff2')}')`, {
      weight: '400',
    }).load(),
    new FontFace('Heebo', `url('${staticFile('fonts/Heebo-Bold.woff2')}')`, {
      weight: '700',
    }).load(),
  ])
    .then(([regular, bold]) => {
      document.fonts.add(regular);
      document.fonts.add(bold);
      continueRender(handle);
    })
    .catch((err) => {
      console.error('Failed to load Heebo font', err);
      continueRender(handle);
    });
};
