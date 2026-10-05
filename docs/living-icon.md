# The living icon: one body that breathes, changes shape and closes with a tick

> Written 2026-10-05 at the owner's request. Code: `flow-trial-extension/core/living-icon.js` (the engine), `src/living-toolbar.js` (the toolbar driver), the hook in
> `src/background.js` (`watchLiving`). Test: `test/living-icon-corpus.cjs`. Demo: `design/living-icon/index.html` (published as a private Artifact; `node scripts/living-icon/demo.cjs serve`).
> Static icons: `node scripts/living-icon/icons.cjs` writes `icons/icon{16,48,128}.png` from the engine's rest pose.

## 1. What the owner asked for

Not a slideshow, not a crossfade, not "picture to picture". **One living blue body** (the gel/liquid-glass material, `#123ccb` `#2f6fff` `#5B8CFF` `#6fa8ff`) that lives at rest (a torus that breathes and flows)
and **deforms** into the next shape. Storyboard: ring → stretch → split → triangle → cube → ring, then **the same ring with a tick inside** = done. States: `idle` (alive), `working` (changing shape), `done`
(ring + tick, still a little alive). Success is the owner saying "it is alive".

## 2. How it works (why it is not frames)

Every pixel comes from one signed distance field: `field(p, t) = Σ wᵢ(t) · shapeᵢ(warp(p, t))`. The shapes are blended **inside the field**, so a mid-morph frame is one solid body, never two half-transparent
pictures (the corpus measures this: a crossfade is full of half-transparent "ghost" pixels, the morph has few). The weights are driven by under-damped springs (a little overshoot: jelly, not a slide). Breath (a slow
scale), sway (a small rotation) and a travelling domain warp make the surface flow at rest and swell while it moves. The gel is shaded from the same field: a round tube profile, a gloss highlight, a rim, a thin glass
edge and a glow that fades out before the frame edge. The tick is a stroke drawn along its path inside the ring's hole, starting only once the body is nearly a ring.

## 3. Where it runs

| Place | What happens |
|---|---|
| The demo page | The animator runs on the page; large frames are split across Web Workers by rows (`render(..., { rows })`); the resolution adapts to hold about 30 frames a second. The 16/32/48/128 previews are drawn by the same engine at the toolbar's rate. |
| The browser toolbar | `src/living-toolbar.js` renders 16 and 32 px with `chrome.action.setIcon({ imageData })` about 12 times a second, **only while something moves**: while Glance does something (working) and while a real close plays out (done: the tick draws, rests 2.6 s, goes). Then it puts the static icon back and stops, so the service worker can sleep. A call that never answers stops the morph after 45 s. |
| The static icons | The ring at rest, from the same engine (`scripts/living-icon/icons.cjs`). The still icon and the moving one are one body. |

**What counts as done.** The tick means a real close only: `flow:execute-action` that succeeded (the one write, the Do It receipt) or `flow:follow-complete` (the person marked the loop done). A draft prepared
(`flow:follow-draft`) or a loop started (`flow:follow-task`) changes shape while it works and returns to the ring **without** a tick: preparation is not completion (`product-identity.md`, `true-close.md`).

## 4. Known limits (honest)

- **The toolbar does not breathe at rest.** MV3 cannot keep a service worker awake to animate forever, and an icon that never stops costs battery. Idle is alive on the demo and wherever a page is open; the toolbar moves
  only while there is something to show.
- **16 px is 256 pixels.** The shapes and the tick read; the gloss and the glass edge mostly do not. The 32 px picture is what most screens use.
- **The demo is drawn on the CPU.** On a slow machine it lowers the resolution to keep the motion smooth, so it can look softer; a phone or laptop of the last few years draws it sharp. A WebGL version would be sharper and
  is not built (it would be a second implementation of the same field to keep in step).
- Not yet looked at by a person in a real Chrome toolbar. What was run: the corpus drives the driver with a fake `chrome.action` and a fake clock; and the unpacked extension was loaded in Chromium,
  where the real service worker drew 79 live frames through `chrome.action.setIcon` with no error, went working → done → idle and stopped drawing.
