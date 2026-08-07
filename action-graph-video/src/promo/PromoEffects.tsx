import { Bloom, ChromaticAberration, EffectComposer } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";

/**
 * Light-mode postprocessing. Unlike the dark compositions' Effects.tsx
 * (ambient bloom + vignette, glow as the primary depth cue), this promo reads
 * depth through shadow (UICard's box-shadow) instead — bloom stays low and
 * capped in resolution so it doesn't wash out white, vignette is dropped
 * entirely (a dark vignette fights "pure bright white"), and chromatic
 * aberration only appears as a brief spike on the Act 3 click.
 */
export const PromoEffects: React.FC<{ readonly clickFrame?: number | null }> = ({
  clickFrame = null,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sinceClick = clickFrame == null ? null : (frame - clickFrame) / fps;
  const burst =
    sinceClick != null && sinceClick >= -0.05
      ? interpolate(sinceClick, [0, 0.1, 0.55], [0, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  const bloomIntensity = 0.18 + burst * 0.65;
  const aberrationOffset = 0.00003 + burst * 0.0011;

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.3}
        resolutionX={1280}
        resolutionY={720}
        mipmapBlur
      />
      <ChromaticAberration
        offset={new THREE.Vector2(aberrationOffset, aberrationOffset)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
    </EffectComposer>
  );
};
