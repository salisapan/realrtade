import React from 'react';
import { FONT_STACK } from '../theme';

/**
 * Liquid-chrome "Flow" wordmark, rebuilt as vector to match the supplied
 * reference: a polished metal ramp with a hard horizon, a specular sweep
 * across the upper half, and a few mercury droplets shedding off the type.
 *
 * If the real logo file is added to public/, Outro.tsx uses that instead.
 */
export const FlowLogo: React.FC<{ height?: number }> = ({ height = 300 }) => {
  const w = height * 3.1;
  const uid = 'flowlogo';

  return (
    <svg width={w} height={height} viewBox="0 0 620 200" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${uid}-chrome`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="16%" stopColor="#EDF1F7" />
          <stop offset="36%" stopColor="#BAC5D5" />
          <stop offset="49%" stopColor="#8496AE" />
          <stop offset="51%" stopColor="#5E7189" />
          <stop offset="60%" stopColor="#9EAEC3" />
          <stop offset="78%" stopColor="#FDFDFE" />
          <stop offset="90%" stopColor="#C8D2DF" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>

        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.25" />
          <stop offset="46%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#7C8CA3" />
          <stop offset="100%" stopColor="#5A6B82" />
        </linearGradient>
      </defs>

      {/* soft contact shadow under the type */}
      <ellipse cx="310" cy="168" rx="250" ry="12" fill="rgba(17,17,17,0.10)" />

      <g>
        {/* depth pass */}
        <text
          x="310"
          y="140"
          textAnchor="middle"
          fontFamily={FONT_STACK}
          fontSize="168"
          fontWeight={800}
          letterSpacing="-6"
          fill="#67788F"
          transform="translate(0,5)"
        >
          Flow
        </text>

        {/* chrome body */}
        <text
          x="310"
          y="140"
          textAnchor="middle"
          fontFamily={FONT_STACK}
          fontSize="168"
          fontWeight={800}
          letterSpacing="-6"
          fill={`url(#${uid}-chrome)`}
          stroke={`url(#${uid}-edge)`}
          strokeWidth="1.6"
        >
          Flow
        </text>

        {/* specular sweep across the upper half */}
        <text
          x="310"
          y="140"
          textAnchor="middle"
          fontFamily={FONT_STACK}
          fontSize="168"
          fontWeight={800}
          letterSpacing="-6"
          fill={`url(#${uid}-sheen)`}
        >
          Flow
        </text>
      </g>

      {/* mercury droplets shedding off the wordmark */}
      <circle cx="521" cy="44" r="13" fill={`url(#${uid}-chrome)`} />
      <circle cx="546" cy="72" r="8" fill={`url(#${uid}-chrome)`} />
      <circle cx="96" cy="40" r="9" fill={`url(#${uid}-chrome)`} />
      <circle cx="72" cy="66" r="6" fill={`url(#${uid}-chrome)`} />
    </svg>
  );
};
