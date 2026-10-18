# Flow hero (prototype)

Scroll-driven hero for the Flow product page: logo, headline, sub-headline and a floating 3D "Do It" button. On scroll the button is pressed (no cursor, no ripple), becomes the working circle, docks at the top, and the email with the plan and its read-back proof rises.

- Open `index.html` through any static server (`python3 -m http.server`). It needs no build step. Three.js 0.178 is vendored in `vendor/` so the page works offline; only the fonts come from Google Fonts (system fallbacks otherwise).
- `?p=0.3` pins the scroll progress (for screenshots), `?dev=1` or the `d` key shows the progress and the stage name.
- Everything that changes the feel is in `CONFIG` at the top of the script: `smoothing`, `btn`, `pressTravel`, `floatAmp`, `btnYFrac`, `stages`.
- Not in `flow-landing/`: nothing here is deployed. Status: prototype, checked in headless Chromium (software GL) at 1440 and 390 wide; not yet viewed on a real GPU or in Safari.
