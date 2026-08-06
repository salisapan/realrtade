import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { BG } from './theme';
import { KineticText } from './components/KineticText';
import { UIChaos } from './components/UIChaos';
import { DoItButton } from './components/DoItButton';
import { Outro } from './components/Outro';
import { FilmGrain } from './components/FilmGrain';

const Camera: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const breathe = 1 + Math.sin((frame / fps) * 0.35) * 0.006;

  return (
    <AbsoluteFill style={{ transform: `scale(${breathe})` }}>
      {children}
    </AbsoluteFill>
  );
};

export const FlowPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Camera>
        <Sequence from={0} durationInFrames={90}>
          <KineticText />
        </Sequence>

        <Sequence from={80} durationInFrames={200}>
          <UIChaos durationInFrames={200} />
        </Sequence>

        <Sequence from={260} durationInFrames={180}>
          <DoItButton durationInFrames={180} />
        </Sequence>

        <Sequence from={400} durationInFrames={200}>
          <Outro durationInFrames={200} />
        </Sequence>
      </Camera>

      <FilmGrain />
    </AbsoluteFill>
  );
};
