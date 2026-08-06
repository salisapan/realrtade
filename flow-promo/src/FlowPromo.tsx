import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { BG } from './theme';
import { KineticText } from './components/KineticText';
import { UIChaos } from './components/UIChaos';
import { DoItButton } from './components/DoItButton';
import { Outro } from './components/Outro';

export const FlowPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
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
    </AbsoluteFill>
  );
};
