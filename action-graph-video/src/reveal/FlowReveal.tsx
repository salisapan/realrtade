// Flow reveal and explainer, 45 s, 1080x1350 (4:5). Words become work: a decision written by a person is carried through the
// organization's systems, a person approves, and every "done" is read back from the system itself.
// Look: pure white, Apple-grade type (tight display, quiet greys, one restrained gradient), real depth (perspective camera,
// layered soft shadows, parallax, a light sheen), expo-out motion. One human-paced voice. No slogans on screen except the close.
import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame,
} from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/InterTight";
import { loadFont as loadText } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["500", "600", "700"], subsets: ["latin"] }).fontFamily;
const text = loadText("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

export const REVEAL_FRAMES = 1350;

const C = {
  bg: "#FFFFFF", ink: "#1D1D1F", soft: "#6E6E73", faint: "#86868B", hair: "rgba(0,0,0,0.07)",
  blue: "#0A63F6", green: "#1E8E5A", amber: "#B25E00", amberBg: "#FFF4E5",
};
// the one gradient, for the words that carry intent and for the close
const GRAD = "linear-gradient(92deg, #0A63F6 0%, #5B4CF5 52%, #A23DE8 100%)";
const gradText: React.CSSProperties = { backgroundImage: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
// layered shadow: contact, mid, long ambient
const SHADOW = "0 0.5px 1px rgba(0,0,0,0.05), 0 4px 10px rgba(0,0,0,0.04), 0 18px 40px rgba(0,0,0,0.07), 0 60px 120px -30px rgba(17,24,58,0.22)";
const SHADOW_LOW = "0 0.5px 1px rgba(0,0,0,0.05), 0 6px 18px rgba(0,0,0,0.06), 0 30px 60px -24px rgba(17,24,58,0.18)";

const EXPO = Easing.bezier(0.16, 1, 0.3, 1);
const SOFT = Easing.bezier(0.45, 0, 0.2, 1);
const t = (f: number, a: number, b: number, from = 0, to = 1, e = EXPO) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

// fade + rise with a little blur clearing, the way premium product films bring type in
const enter = (f: number, at: number, len = 26, dist = 34): React.CSSProperties => {
  const p = t(f, at, at + len);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)`, filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined };
};

const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode; low?: boolean; sheen?: number }> = ({ style, children, low, sheen }) => (
  <div style={{ position: "relative", background: "#fff", borderRadius: 30, boxShadow: low ? SHADOW_LOW : SHADOW, border: `1px solid ${C.hair}`, overflow: "hidden", ...style }}>
    {children}
    {sheen !== undefined ? (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `linear-gradient(110deg, transparent ${sheen * 100 - 20}%, rgba(255,255,255,0.75) ${sheen * 100}%, transparent ${sheen * 100 + 20}%)`, mixBlendMode: "screen" }} />
    ) : null}
  </div>
);

const Check: React.FC<{ p: number; size?: number }> = ({ p, size = 34 }) => (
  <div style={{ width: size, height: size, borderRadius: size, flex: "none", position: "relative", boxShadow: p > 0 ? `0 6px 14px rgba(10,99,246,${0.3 * p})` : "none" }}>
    <div style={{ position: "absolute", inset: 0, borderRadius: size, border: `2px solid rgba(0,0,0,${0.12 * (1 - p)})` }} />
    <div style={{ position: "absolute", inset: 0, borderRadius: size, background: GRAD, transform: `scale(${p})` }} />
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: "absolute", inset: 0 }}>
      <path d="M7 12.4l3.2 3.2L17.2 8.6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" strokeDashoffset={16 * (1 - t(p, 0.4, 1, 0, 1, SOFT))} />
    </svg>
  </div>
);

const DoIt: React.FC<{ press: number; glow: number }> = ({ press, glow }) => (
  <div style={{ position: "relative", display: "inline-flex" }}>
    <div style={{ position: "absolute", inset: -18, borderRadius: 999, background: GRAD, filter: "blur(22px)", opacity: 0.35 + glow * 0.4 }} />
    <div style={{ position: "relative", padding: "18px 46px", borderRadius: 999, background: GRAD, color: "#fff", fontFamily: display, fontWeight: 600, fontSize: 34, letterSpacing: -0.3, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 24px rgba(40,60,200,0.35)", transform: `scale(${1 - 0.06 * press})` }}>Do It</div>
  </div>
);

const Pointer: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 44, height: 44, borderRadius: 44, background: "rgba(29,29,31,0.18)", border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 8px 20px rgba(0,0,0,0.18)", transform: `scale(${1 - 0.25 * press})` }} />
);

// ======================= scene 1: decided in a sentence, carried by hand (0-210)
const APPS = ["Claims", "Ledger", "CRM", "Drive", "Mail", "Sheets", "Portal", "Calendar", "Docs", "Tasks"];
const SceneOne: React.FC = () => {
  const f = useCurrentFrame();
  const sources = [
    { at: 26, label: "Email", line: "We accept the revised estimate of $18,400.", x: -40, y: 0, z: 0, r: -4 },
    { at: 40, label: "Contract · clause 4", line: "Effective upon signature by both parties.", x: 70, y: 210, z: -160, r: 3 },
    { at: 54, label: "Chat", line: "Approved. Go ahead.", x: -10, y: 400, z: -320, r: -2 },
  ];
  const away = t(f, 96, 130);
  const drift = interpolate(f, [0, 210], [0, 1]);
  return (
    <AbsoluteFill style={{ perspective: 2000, perspectiveOrigin: "50% 40%" }}>
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", fontFamily: display, fontWeight: 600, fontSize: 76, letterSpacing: -2.2, lineHeight: 1.04, color: C.ink, ...enter(f, 4, 30) }}>
        Work is decided<br /><span style={{ color: C.faint }}>in a sentence.</span>
      </div>
      <div style={{ position: "absolute", top: 420, left: 0, right: 0, height: 700, transformStyle: "preserve-3d", transform: `rotateX(${10 - drift * 4}deg) rotateY(${-8 + drift * 6}deg)`, opacity: 1 - away }}>
        {sources.map((s, i) => {
          const p = t(f, s.at, s.at + 30);
          return (
            <div key={i} style={{ position: "absolute", left: 120 + s.x, top: s.y, width: 780, transform: `translateZ(${s.z + (1 - p) * -200}px) rotateZ(${s.r}deg)`, opacity: p }}>
              <Card low style={{ padding: "30px 36px" }}>
                <div style={{ fontFamily: text, fontWeight: 500, fontSize: 22, color: C.faint, marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontFamily: display, fontWeight: 500, fontSize: 40, letterSpacing: -0.8, color: C.ink, lineHeight: 1.16 }}>{s.line}</div>
              </Card>
            </div>
          );
        })}
      </div>
      {/* the chore: one number carried through ten apps, by hand */}
      {f >= 100 ? (
        <div style={{ position: "absolute", top: 520, left: 0, right: 0, height: 700, transformStyle: "preserve-3d", transform: `rotateX(${16 - t(f, 100, 210) * 6}deg)` }}>
          {APPS.map((a, i) => {
            const col = i % 5, row = Math.floor(i / 5);
            const p = t(f, 100 + i * 2, 130 + i * 2);
            const hot = Math.floor((f - 112) / 6) % APPS.length === i && f >= 112;
            return (
              <div key={a} style={{ position: "absolute", left: 70 + col * 192, top: row * 220, width: 172, transform: `translateZ(${(1 - p) * -300 + (hot ? 40 : 0)}px)`, opacity: p }}>
                <Card low style={{ height: 196, padding: 20, border: hot ? "1px solid rgba(10,99,246,0.35)" : `1px solid ${C.hair}` }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: hot ? GRAD : "linear-gradient(180deg,#F5F5F7,#E8E8ED)", marginBottom: 18 }} />
                  <div style={{ fontFamily: text, fontWeight: 500, fontSize: 22, color: C.ink }}>{a}</div>
                  <div style={{ fontFamily: text, fontSize: 19, color: hot ? C.blue : "transparent", marginTop: 6 }}>$18,400</div>
                </Card>
              </div>
            );
          })}
          <div style={{ position: "absolute", top: 470, left: 0, right: 0, textAlign: "center", fontFamily: text, fontSize: 26, color: C.faint, opacity: t(f, 140, 170) }}>
            Copy. Switch. Paste. Check. Again.
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ======================= scene 2: the reveal (210-330)
const SceneTwo: React.FC = () => {
  const f = useCurrentFrame();
  const p = t(f, 6, 60);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1800 }}>
      <div style={{ position: "absolute", width: 760, height: 260, top: 520, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(91,76,245,0.16), transparent)", filter: "blur(30px)", opacity: p }} />
      <Img src={staticFile("reveal/flow-logo.png")} style={{ width: 520, transform: `translateZ(${(1 - p) * -400}px) rotateX(${(1 - p) * 18}deg)`, opacity: p, filter: `drop-shadow(0 30px 40px rgba(17,24,58,${0.22 * p}))` }} />
      <div style={{ marginTop: 70, fontFamily: display, fontWeight: 500, fontSize: 44, letterSpacing: -0.9, color: C.soft, ...enter(f, 46, 30, 20) }}>
        carries it for you.
      </div>
    </AbsoluteFill>
  );
};

// ======================= scene 3: one decision, every step, approved, checked (330-840)
const STEPS = [
  { sys: "Claims", what: "Mark claim 24-118392 settled", proof: "Read back from Claims · 10:42:07" },
  { sys: "Finance", what: "Pay $18,400 to acct", acct: true, proof: "Read back from Finance · 10:42:09", risky: true },
  { sys: "Mail", what: "Draft the letter to the policyholder", proof: "Draft saved · not sent" },
];
const SceneThree: React.FC = () => {
  const f = useCurrentFrame(); // 0..510
  const planAt = 64;
  const maskAt = 190;
  const clickAt = 330;
  const doneAt = (i: number) => clickAt + 18 + i * 22;
  // camera: tilted and far, settling flat and close as the person approves
  const settle = t(f, 0, 330, 0, 1, SOFT);
  const rx = 14 - 12 * settle, ry = -16 + 15 * settle, z = -220 + 200 * settle;
  const hl = (at: number) => t(f, at, at + 22, 0, 1);
  const press = f >= clickAt && f < clickAt + 10 ? 1 : 0;
  const px = interpolate(f, [262, 324], [640, 120], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: SOFT });
  const py = interpolate(f, [262, 324], [140, 22], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: SOFT });
  const word = (w: string, at: number) => (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span style={{ opacity: 1 - hl(at) }}>{w}</span>
      <span style={{ position: "absolute", left: 0, top: 0, ...gradText, opacity: hl(at) }}>{w}</span>
    </span>
  );
  return (
    <AbsoluteFill style={{ perspective: 2200, perspectiveOrigin: "50% 45%" }}>
      <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg)` }}>
        {/* the message, behind */}
        <div style={{ position: "absolute", left: 70, right: 70, top: 150, transform: "translateZ(-90px)", ...enter(f, 0, 28, 20) }}>
          <Card low style={{ padding: "30px 38px" }}>
            <div style={{ fontFamily: text, fontWeight: 500, fontSize: 22, color: C.faint, marginBottom: 12 }}>R. Okafor · Adjuster</div>
            <div style={{ fontFamily: display, fontWeight: 500, fontSize: 46, letterSpacing: -1, lineHeight: 1.14, color: C.ink }}>
              We {word("accept", 22)} the {word("revised estimate", 30)} of {word("$18,400", 38)}.
            </div>
          </Card>
        </div>
        {/* the plan, in front */}
        <div style={{ position: "absolute", left: 50, right: 50, top: 480, transform: "translateZ(60px)", ...enter(f, planAt, 34, 60) }}>
          <Card sheen={t(f, 300, 420, -0.3, 1.4, SOFT)} style={{ padding: "36px 40px 34px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontFamily: display, fontWeight: 600, fontSize: 40, letterSpacing: -0.9, color: C.ink }}>Close claim 24-118392</div>
              <div style={{ fontFamily: text, fontSize: 22, color: C.faint }}>3 steps</div>
            </div>
            {STEPS.map((s, i) => {
              const at = planAt + 18 + i * 12;
              const dp = t(f, doneAt(i), doneAt(i) + 18);
              const masked = f >= maskAt;
              return (
                <div key={i} style={{ display: "flex", gap: 22, alignItems: "flex-start", padding: "22px 0", borderTop: i ? `1px solid ${C.hair}` : "none", ...enter(f, at, 26, 18) }}>
                  <Check p={dp} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ fontFamily: text, fontWeight: 600, fontSize: 20, color: C.faint, letterSpacing: 0.2 }}>{s.sys}</div>
                      {s.risky && dp < 1 ? <div style={{ fontFamily: text, fontWeight: 600, fontSize: 18, color: C.amber, background: C.amberBg, borderRadius: 999, padding: "3px 12px", opacity: t(f, 232, 252) * (1 - dp) }}>Needs your approval</div> : null}
                    </div>
                    <div style={{ fontFamily: display, fontWeight: 500, fontSize: 32, letterSpacing: -0.5, color: C.ink, marginTop: 4 }}>
                      {s.what}
                      {s.acct ? (
                        <span style={{ fontVariantNumeric: "tabular-nums" }}> {masked ? <span style={{ color: C.soft }}>•••• 4821</span> : "IL62 0108 4821"}</span>
                      ) : null}
                    </div>
                    <div style={{ height: 30, marginTop: 6, fontFamily: text, fontWeight: 500, fontSize: 20, color: C.green, opacity: dp }}>{s.proof}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 26, marginTop: 14, ...enter(f, 244, 26, 16) }}>
              <DoIt press={press} glow={t(f, 300, 330)} />
              <div style={{ fontFamily: text, fontSize: 24, color: C.soft }}>
                {f < clickAt ? "Nothing runs until you approve." : f < doneAt(2) + 14 ? "Running…" : <span style={gradText}>Done. Checked in every system.</span>}
              </div>
              {f >= 256 && f < 372 ? <Pointer x={px} y={py} press={press} /> : null}
            </div>
            <div style={{ fontFamily: text, fontSize: 20, color: C.faint, marginTop: 18, opacity: t(f, maskAt, maskAt + 20) }}>Account and policyholder details are masked before processing.</div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ======================= scene 4: same job, four worlds (840-1065), a slow cover-flow
const WORLDS = [
  { kind: "Insurance", said: "We accept the revised estimate.", did: "Claim status updated" },
  { kind: "Legal", said: "Signed by both parties as of today.", did: "Signed copy filed to the matter" },
  { kind: "Healthcare", said: "Please book a follow-up within two weeks.", did: "Follow-up booked" },
  { kind: "Finance", said: "Transfer received, reference 77120.", did: "Invoice reconciled" },
];
const SceneFour: React.FC = () => {
  const f = useCurrentFrame();
  const per = 56;
  const pos = interpolate(f, [0, 3 * per + 20], [0, 3], { extrapolateRight: "clamp", easing: SOFT }); // continuous index
  return (
    <AbsoluteFill style={{ perspective: 1900 }}>
      <div style={{ position: "absolute", top: 130, left: 0, right: 0, textAlign: "center", fontFamily: display, fontWeight: 600, fontSize: 64, letterSpacing: -1.8, color: C.ink, ...enter(f, 2, 26) }}>
        Different systems.<br /><span style={{ color: C.faint }}>The same job.</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 560, height: 640, transformStyle: "preserve-3d" }}>
        {WORLDS.map((w, i) => {
          const d = i - pos;
          const local = f - i * per;
          return (
            <div key={i} style={{ position: "absolute", left: 140, width: 800, top: 0, transform: `translateX(${d * 720}px) translateZ(${-Math.abs(d) * 420}px) rotateY(${-d * 34}deg)`, opacity: Math.max(0, 1 - Math.abs(d) * 0.85) }}>
              <Card style={{ padding: "38px 42px" }}>
                <div style={{ fontFamily: text, fontWeight: 600, fontSize: 22, color: C.faint, marginBottom: 14 }}>{w.kind}</div>
                <div style={{ fontFamily: display, fontWeight: 500, fontSize: 44, letterSpacing: -1, lineHeight: 1.14, color: C.ink, minHeight: 104 }}>{w.said}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 30, paddingTop: 26, borderTop: `1px solid ${C.hair}` }}>
                  <Check p={t(local, 22, 40)} />
                  <div style={{ fontFamily: display, fontWeight: 500, fontSize: 30, color: C.ink }}>{w.did}</div>
                  <div style={{ marginLeft: "auto", fontFamily: text, fontWeight: 500, fontSize: 20, color: C.green, opacity: t(local, 32, 46) }}>Read back</div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ======================= scene 5: you approve, anything can be undone (1065-1215)
const SceneFive: React.FC = () => {
  const f = useCurrentFrame();
  const approved = t(f, 30, 48);
  const undoPress = f >= 86 && f < 94 ? 1 : 0;
  const undone = f >= 92;
  const tiltIn = t(f, 0, 40);
  return (
    <AbsoluteFill style={{ perspective: 2000, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center", fontFamily: display, fontWeight: 600, fontSize: 64, letterSpacing: -1.8, color: C.ink, lineHeight: 1.06, ...enter(f, 4, 26) }}>
        Nothing moves without you.<br /><span style={{ color: C.faint, opacity: t(f, 60, 84) }}>Anything can be undone.</span>
      </div>
      <div style={{ width: 900, marginTop: 220, transform: `rotateX(${(1 - tiltIn) * 20}deg) translateZ(${(1 - tiltIn) * -200}px)`, opacity: tiltIn }}>
        <Card style={{ padding: "36px 40px" }}>
          <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
            <Check p={undone ? 1 - t(f, 92, 106) : approved} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: text, fontWeight: 600, fontSize: 20, color: C.faint }}>Finance</div>
              <div style={{ fontFamily: display, fontWeight: 500, fontSize: 36, letterSpacing: -0.6, color: C.ink, marginTop: 4 }}>Pay $18,400 to acct <span style={{ color: C.soft }}>•••• 4821</span></div>
              <div style={{ fontFamily: text, fontWeight: 500, fontSize: 22, marginTop: 10, color: undone ? C.soft : approved > 0.5 ? C.green : C.amber }}>
                {undone ? "Undone. Payment removed, read back from Finance." : approved > 0.5 ? "Approved by you. Read back from Finance." : "Needs your approval"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 28, alignItems: "center", height: 80 }}>
            {f < 30 ? <DoIt press={f >= 22 ? 1 : 0} glow={0.6} /> : null}
            {f >= 30 && !undone ? (
              <div style={{ fontFamily: display, fontWeight: 600, fontSize: 30, color: C.ink, borderRadius: 999, padding: "16px 40px", background: "linear-gradient(180deg,#FFFFFF,#F2F2F5)", boxShadow: "0 1px 0 rgba(255,255,255,1) inset, 0 0 0 1px rgba(0,0,0,0.08), 0 8px 18px rgba(0,0,0,0.08)", transform: `scale(${1 - 0.06 * undoPress})`, opacity: t(f, 40, 56) }}>Undo</div>
            ) : null}
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

// ======================= scene 6: close (1215-1350)
const SceneSix: React.FC = () => {
  const f = useCurrentFrame();
  const p = t(f, 4, 50);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1800 }}>
      <Img src={staticFile("reveal/flow-logo.png")} style={{ width: 460, transform: `translateZ(${(1 - p) * -260}px)`, opacity: p, filter: `drop-shadow(0 26px 36px rgba(17,24,58,${0.2 * p}))` }} />
      <div style={{ marginTop: 56, fontFamily: display, fontWeight: 600, fontSize: 84, letterSpacing: -2.6, ...gradText, ...enter(f, 22, 30, 24) }}>Words into work.</div>
      <div style={{ marginTop: 48, display: "flex", gap: 28, alignItems: "center", ...enter(f, 46, 26, 14) }}>
        <div style={{ fontFamily: text, fontSize: 28, color: C.soft }}>theflow-ai.com</div>
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 26, color: "#fff", background: C.ink, borderRadius: 999, padding: "14px 32px", boxShadow: "0 10px 24px rgba(0,0,0,0.18)" }}>Request a demo</div>
      </div>
    </AbsoluteFill>
  );
};

// ======================= timeline and sound
const VO: Array<[string, number]> = [
  ["l1", 14], ["l2", 100], ["l3", 228], ["l4", 345], ["l5", 510], ["l6", 762],
  ["w1", 846], ["w2", 902], ["w3", 958], ["w4", 1014], ["l8", 1082], ["l9", 1248],
];
const SFX: Array<[string, number, number]> = [
  ...Array.from({ length: 16 }, (_, i) => ["click", 112 + i * 6, 0.22] as [string, number, number]),
  ["click", 660, 0.8], ["tick", 678, 0.55], ["tick", 700, 0.55], ["tick", 722, 0.55],
  ...[0, 1, 2, 3].map((i) => ["tick", 840 + i * 56 + 22, 0.45] as [string, number, number]),
  ["click", 1065 + 22, 0.8], ["tick", 1065 + 32, 0.5], ["click", 1065 + 86, 0.8],
];

const Scene: React.FC<{ from: number; to: number; children: React.ReactNode; last?: boolean }> = ({ from, to, children, last }) => {
  const f = useCurrentFrame();
  if (f < from - 1 || f >= to + 12) return null;
  // cross-dissolve with a slight push, so scenes hand over instead of cutting to white
  const inP = t(f, from, from + 14, 0, 1, SOFT);
  const outP = last ? 0 : t(f, to - 2, to + 12, 0, 1, SOFT);
  return (
    <AbsoluteFill style={{ opacity: inP * (1 - outP), transform: `scale(${1 + outP * 0.04})`, filter: outP > 0 ? `blur(${outP * 10}px)` : undefined }}>
      <Sequence from={from} durationInFrames={to - from + 12}>{children}</Sequence>
    </AbsoluteFill>
  );
};

export const FlowReveal: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Scene from={0} to={210}><SceneOne /></Scene>
    <Scene from={210} to={330}><SceneTwo /></Scene>
    <Scene from={330} to={840}><SceneThree /></Scene>
    <Scene from={840} to={1065}><SceneFour /></Scene>
    <Scene from={1065} to={1215}><SceneFive /></Scene>
    <Scene from={1215} to={1350} last><SceneSix /></Scene>
    {VO.map(([k, at]) => <Sequence key={k} from={at}><Audio src={staticFile(`reveal/${k}.wav`)} /></Sequence>)}
    {SFX.map(([k, at, v], i) => <Sequence key={"s" + i} from={at} durationInFrames={10}><Audio src={staticFile(`reveal/${k}.wav`)} volume={v} /></Sequence>)}
  </AbsoluteFill>
);
