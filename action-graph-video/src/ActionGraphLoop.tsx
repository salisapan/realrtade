import { ThreeCanvas } from "@remotion/three";
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { GraphEffects } from "./graph/Effects";
import { GraphScene } from "./graph/GraphScene";

// Seamless background loop — muted, autoplay, for the site's Action Graph section.
export const ActionGraphLoop: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#04060c" }}>
      <ThreeCanvas linear width={width} height={height} gl={{ antialias: true }}>
        <GraphScene loop />
        <GraphEffects loop />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
