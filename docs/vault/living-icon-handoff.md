---
tags: [stream, design, icon]
updated: 2026-10-05
owner: Claude Code
---
# Living toolbar icon — handoff

**Owner: Claude Code.** Sali asked (2026-10-05) for the brief to go to Claude Code; CoS / Grok does not build further iterations unless Sali asks again.

## What Sali wants (his words, condensed)
- "גוף אחד חי שיודע לשנות את הצורה שלו" — one living body that changes its own shape.
- **Not** a slideshow / flipbook of finished PNGs, **not** crossfades between frames. Rejected iterations: "תנועות חולפות", "מאוד מרצד", wrong colour.
- Success = Sali says "זה חי".

## Brief
1. **Idle — alive:** a glowing liquid-blue ring (torus) that breathes, ripples, flows all the time.
2. **Working — morphs:** the same body deforms continuously into the next shape: ring → stretch/split → character (ring as head) → cube → back to ring.
3. **Done:** the same ring with a check inside its hole (same blue, not a separate badge), still slightly alive. Matches the brand mark in [[product-identity]] ("a closed loop: a ring shut by a tick").

Colour / material (must match the Do It glow): `#123ccb` `#2f6fff` `#5B8CFF` `#6fa8ff`, soft glow, gel / liquid glass. References: Sali's ring photo and the 8-panel storyboard (one body, not 8 icons).

## Output
- A motion demo that feels alive (Lottie / SVG morph / canvas / WebGL SDF / MP4 / WebP).
- Chrome toolbar frames only as a continuous interpolation sampled from that same mesh/SDF, never hand-picked keyframes.
- States `idle` → `working` → `done`.

## Technical context (implementation status)
- Today: `flow-trial-extension/src/background.js` "toolbar morph icon" swaps PNG frames from `icons/anim/` with `chrome.action.setIcon`; 0.9.13 keeps the service worker awake (offscreen `src/icon-keepalive.*`) so frames advance. MV3 toolbar = frames only.
- Do not merge to `main` / deploy without Sali.

## Log (newest first)
- 2026-10-05 · Brief handed to Claude Code; earlier CoS iterations rejected (flipbook feel, flicker, colour).
