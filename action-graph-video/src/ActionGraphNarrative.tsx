import { ThreeCanvas } from "@remotion/three";
import { loadFont } from "@remotion/google-fonts/Rubik";
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { GraphEffects } from "./graph/Effects";
import { GraphScene } from "./graph/GraphScene";
import { Beat } from "./graph/KineticTitle";

const { fontFamily } = loadFont();

const eyebrow: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 22,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
  color: "#8FB4FF",
  marginBottom: 18,
};

const title: React.CSSProperties = {
  fontFamily,
  fontWeight: 700,
  fontSize: 64,
  letterSpacing: "-0.02em",
  color: "#F3F7FF",
  lineHeight: 1.05,
  maxWidth: 820,
};

const sub: React.CSSProperties = {
  fontFamily,
  fontWeight: 400,
  fontSize: 26,
  color: "#AEBBDD",
  maxWidth: 620,
  marginTop: 22,
  lineHeight: 1.5,
};

const wordmark: React.CSSProperties = {
  fontFamily,
  fontWeight: 700,
  fontSize: 48,
  color: "#F3F7FF",
  letterSpacing: "-0.02em",
};

const tagline: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 18,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "#8FB4FF",
  marginTop: 10,
};

// Narrative cut: assembly -> title reveal -> 4D fold moment -> resolve -> wordmark close.
export const ActionGraphNarrative: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#04060c" }}>
      <ThreeCanvas linear width={width} height={height} gl={{ antialias: true }}>
        <GraphScene assemble />
        <GraphEffects />
      </ThreeCanvas>

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "0 110px",
          pointerEvents: "none",
        }}
      >
        <Beat start={2.6} end={8.6}>
          <div style={eyebrow}>Core Architecture</div>
          <div style={title}>Institutional Wisdom Infrastructure</div>
        </Beat>

        <Beat start={9.4} end={15.2}>
          <div style={sub}>
            Maps OS telemetry and causal habits — turning implicit professional
            judgment into execution memory.
          </div>
        </Beat>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <Beat
          start={17.4}
          end={22}
          style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <div style={wordmark}>Flow</div>
          <div style={tagline}>Cognitive Workflow Engine</div>
        </Beat>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
