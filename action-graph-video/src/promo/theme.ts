import * as THREE from "three";

/**
 * Flow's light-mode design tokens (`:root[data-theme="light"]` in
 * flow-landing/index.html), read verbatim rather than invented — this is the
 * promo-specific constant set; the dark compositions (ActionGraphLoop /
 * ActionGraphNarrative) are untouched and keep reading their own dark constants.
 */
export const LIGHT = {
  bg: "#FFFFFF",
  bg2: "#F5F9FF",
  panel: "#FFFFFF",
  panel2: "#F4F8FD",
  line: "rgba(20,44,100,.11)",
  lineHi: "rgba(20,44,100,.20)",
  txt: "#232B44",
  txtHi: "#060B16",
  muted: "#455073",
  accent: "#1A4EF5",
  accent2: "#0F37C6",
  glow: "rgba(26,78,245,.30)",
  blob: "rgba(60,134,255,.20)",
  blob2: "rgba(120,178,255,.15)",
  cardShadow: "0 30px 60px -26px rgba(28,64,150,.30), 0 10px 24px -12px rgba(28,64,150,.16)",
  doitText: "#123ccb",
  ring: "#2f5bd8",
} as const;

/** Three.js Color equivalents of the accent/graph tones, for GraphScene/BeamRing. */
export const LIGHT_3D = {
  accent: new THREE.Color(LIGHT.accent),
  accent2: new THREE.Color(LIGHT.accent2),
  expert: new THREE.Color("#0A1440"), // near-black-blue apex node — dark-on-white instead of white-hot
  far: new THREE.Color("#C7D5F5"), // pale desaturated blue for distant/background nodes
};

export const FONT = {
  disp: "'Rubik', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const RADIUS = {
  card: 20,
  pill: 999,
} as const;
