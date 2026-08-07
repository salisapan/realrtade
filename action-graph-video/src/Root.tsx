import { Composition } from "remotion";
import { ActionGraphLoop } from "./ActionGraphLoop";
import { ActionGraphNarrative } from "./ActionGraphNarrative";
import { PromoScene } from "./PromoScene";

// Flow's Action Graph, reimagined as a real 3D scene (Remotion + React Three Fiber)
// instead of the live site's flat 2D canvas projection — same 4D layered-cone math,
// now with true depth, bloom, and a camera that can actually orbit it.

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Seamless 8s loop — muted background video for the site's Action Graph section */}
      <Composition
        id="ActionGraphLoop"
        component={ActionGraphLoop}
        fps={30}
        durationInFrames={240}
        width={1920}
        height={1080}
      />

      {/* 22s narrative cut — assembly, title reveal, 4D fold, wordmark close (social/marketing) */}
      <Composition
        id="ActionGraphNarrative"
        component={ActionGraphNarrative}
        fps={30}
        durationInFrames={660}
        width={1920}
        height={1080}
      />

      {/* ~55s light-mode SaaS promo — chaos to one-click execution across Legal/Finance/
          Healthcare, fast spring physics. Native 1440p30, upscaled to 4K for delivery. */}
      <Composition
        id="FlowPromo"
        component={PromoScene}
        fps={30}
        durationInFrames={1650}
        width={2560}
        height={1440}
      />
    </>
  );
};
