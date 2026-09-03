import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BG } from './theme';
import { ACT } from './timeline';
import { KineticText } from './components/KineticText';
import { UIChaos } from './components/UIChaos';
import { DoItButton } from './components/DoItButton';
import { FlowApp } from './components/FlowApp';
import { ResultDeck } from './components/ResultDeck';
import { Outro } from './components/Outro';
import { FilmGrain } from './components/FilmGrain';
import { Plate } from './components/Plate';
import { hasAsset } from './components/Plate';

const Camera: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const breathe = 1 + Math.sin((frame / fps) * 0.35) * 0.006;

  return <AbsoluteFill style={{ transform: `scale(${breathe})` }}>{children}</AbsoluteFill>;
};

export const FlowPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {hasAsset('soundtrack.wav') ? <Audio src={staticFile('soundtrack.wav')} /> : null}

      <Camera>
        {/* Act 1 — kinetic hook */}
        <Sequence from={ACT.kinetic.from} durationInFrames={ACT.kinetic.duration}>
          <KineticText />
        </Sequence>

        {/* Act 2 — platform chaos collapsing into the intent compiler */}
        <Sequence from={ACT.chaos.from} durationInFrames={ACT.chaos.duration}>
          <Plate src="plate-chaos.png" durationInFrames={ACT.chaos.duration} opacity={0.5} />
          <UIChaos collapseStart={ACT.chaos.collapseStart} />
        </Sequence>

        {/* Act 3 — absolute execution */}
        <Sequence from={640} durationInFrames={170}>
          <Plate src="plate-shockwave.png" durationInFrames={170} opacity={0.45} zoomFrom={1.3} zoomTo={1.02} drift={0} />
        </Sequence>
        <Sequence from={ACT.doIt.from} durationInFrames={ACT.doIt.duration}>
          <DoItButton durationInFrames={ACT.doIt.duration} />
        </Sequence>

        {/* Act 4 — the product actually doing the work */}
        <Sequence from={ACT.app.from} durationInFrames={ACT.app.duration}>
          <FlowApp durationInFrames={ACT.app.duration} />
        </Sequence>

        {/* Act 5 — the value that was delivered */}
        <Sequence from={ACT.results.from} durationInFrames={ACT.results.duration}>
          <ResultDeck durationInFrames={ACT.results.duration} />
        </Sequence>

        {/* Act 6 — branding */}
        <Sequence from={ACT.outro.from} durationInFrames={ACT.outro.duration}>
          <Outro durationInFrames={ACT.outro.duration} />
        </Sequence>
      </Camera>

      <FilmGrain />
    </AbsoluteFill>
  );
};
