import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  getStaticFiles,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const hasAsset = (name: string): boolean =>
  getStaticFiles().some((file) => file.name === name);

type PlateProps = {
  src: string;
  durationInFrames: number;
  opacity?: number;
  zoomFrom?: number;
  zoomTo?: number;
  drift?: number;
};

/**
 * Cinematic background plate. Plates are rendered on a pure white ground, so
 * `multiply` keeps their glass and shadow detail while their white background
 * drops out against the composition.
 *
 * Renders nothing until the asset is actually present in public/, so the
 * composition still builds before the footage has been added.
 */
export const Plate: React.FC<PlateProps> = ({
  src,
  durationInFrames,
  opacity = 0.55,
  zoomFrom = 1.08,
  zoomTo = 1.18,
  drift = 30,
}) => {
  const frame = useCurrentFrame();

  if (!hasAsset(src)) {
    return null;
  }

  const scale = interpolate(frame, [0, durationInFrames], [zoomFrom, zoomTo], {
    extrapolateRight: 'clamp',
  });
  const x = interpolate(frame, [0, durationInFrames], [0, drift], { extrapolateRight: 'clamp' });

  const fade = interpolate(
    frame,
    [0, 20, durationInFrames - 25, durationInFrames],
    [0, opacity, opacity, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const isVideo = src.endsWith('.mp4') || src.endsWith('.webm');

  return (
    <AbsoluteFill style={{ mixBlendMode: 'multiply', opacity: fade }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${x}px)` }}>
        {isVideo ? (
          <OffthreadVideo
            src={staticFile(src)}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Img
            src={staticFile(src)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
