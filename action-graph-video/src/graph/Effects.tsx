import { Bloom, ChromaticAberration, EffectComposer, Vignette } from "@react-three/postprocessing";
import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { foldEnvelope } from "./build";

export const GraphEffects: React.FC<{ readonly loop?: boolean }> = ({ loop = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t = frame / fps;
  const durSec = durationInFrames / fps;
  const fold = foldEnvelope(t, durSec, loop, interpolate, Easing);

  const aberrationOffset = 0.00006 + fold * 0.0026;
  const bloomIntensity = 0.65 + fold * 0.55;

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.12}
        luminanceSmoothing={0.35}
        mipmapBlur
      />
      <ChromaticAberration
        offset={new THREE.Vector2(aberrationOffset, aberrationOffset)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette eskil={false} offset={0.15} darkness={0.9} />
    </EffectComposer>
  );
};
