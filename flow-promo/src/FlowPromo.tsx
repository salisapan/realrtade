import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { BG } from './theme';
import { KineticText } from './components/KineticText';
import { UIChaos } from './components/UIChaos';
import { DoItButton } from './components/DoItButton';
import { ResultDeck } from './components/ResultDeck';
import { Outro } from './components/Outro';
import { FilmGrain } from './components/FilmGrain';
import { Plate } from './components/Plate';

const Camera: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const breathe = 1 + Math.sin((frame / fps) * 0.35) * 0.006;

  return <AbsoluteFill style={{ transform: `scale(${breathe})` }}>{children}</AbsoluteFill>;
};

export const FlowPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Camera>
        {/* Act 1 — kinetic hook */}
        <Sequence from={0} durationInFrames={90}>
          <KineticText />
        </Sequence>

        {/* Act 2/3 — platform chaos, collapsing into the intent compiler */}
        <Sequence from={90} durationInFrames={240}>
          <Plate src="plate-chaos.png" durationInFrames={240} opacity={0.5} />
          <UIChaos collapseStart={170} />
        </Sequence>

        {/* Act 4 — absolute execution */}
        <Sequence from={400} durationInFrames={160}>
          <Plate
            src="plate-shockwave.png"
            durationInFrames={160}
            opacity={0.45}
            zoomFrom={1.3}
            zoomTo={1.02}
            drift={0}
          />
        </Sequence>
        <Sequence from={300} durationInFrames={200}>
          <DoItButton durationInFrames={200} />
        </Sequence>

        {/* Act 5 — the value that was actually delivered */}
        <Sequence from={470} durationInFrames={300}>
          <ResultDeck durationInFrames={300} />
        </Sequence>

        {/* Act 6 — branding */}
        <Sequence from={750} durationInFrames={150}>
          <Outro durationInFrames={150} />
        </Sequence>
      </Camera>

      <FilmGrain />
    </AbsoluteFill>
  );
};
