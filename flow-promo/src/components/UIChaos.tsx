import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Trail } from '@remotion/motion-blur';
import { ACCENT, GLASS_BG, GLASS_BORDER, MUTED, SHADOW_LG, TEXT, FONT_STACK } from '../theme';

type CardKind = 'email' | 'crm' | 'window' | 'calendar' | 'chat';

type CardSpec = {
  kind: CardKind;
  x: number;
  y: number;
  rotateBase: number;
  seed: number;
  delay: number;
};

const CARDS: CardSpec[] = [
  { kind: 'email', x: 0.2, y: 0.26, rotateBase: -6, seed: 1, delay: 0 },
  { kind: 'crm', x: 0.76, y: 0.2, rotateBase: 5, seed: 2, delay: 5 },
  { kind: 'window', x: 0.28, y: 0.68, rotateBase: 4, seed: 3, delay: 10 },
  { kind: 'calendar', x: 0.8, y: 0.62, rotateBase: -4, seed: 4, delay: 15 },
  { kind: 'chat', x: 0.5, y: 0.16, rotateBase: -2, seed: 5, delay: 20 },
];

const CardBody: React.FC<{ kind: CardKind }> = ({ kind }) => {
  if (kind === 'email') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#DBEAFE' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: FONT_STACK, fontSize: 24, fontWeight: 700, color: TEXT }}>Sarah Chen</span>
            <span style={{ fontFamily: FONT_STACK, fontSize: 20, color: MUTED }}>Re: Q3 Budget Approval</span>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'crm') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ fontFamily: FONT_STACK, fontSize: 26, fontWeight: 700, color: TEXT }}>Acme Corp</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 18,
              fontWeight: 600,
              color: ACCENT,
              backgroundColor: '#DBEAFE',
              padding: '6px 16px',
              borderRadius: 100,
            }}
          >
            In Progress
          </span>
          <span style={{ fontFamily: FONT_STACK, fontSize: 22, fontWeight: 600, color: MUTED }}>$42,000</span>
        </div>
      </div>
    );
  }
  if (kind === 'calendar') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontFamily: FONT_STACK, fontSize: 20, fontWeight: 600, color: ACCENT }}>TODAY 9:00 AM</span>
        <span style={{ fontFamily: FONT_STACK, fontSize: 26, fontWeight: 700, color: TEXT }}>Standup</span>
      </div>
    );
  }
  if (kind === 'chat') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            backgroundColor: ACCENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontFamily: FONT_STACK, fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>12</span>
        </div>
        <span style={{ fontFamily: FONT_STACK, fontSize: 22, fontWeight: 600, color: TEXT }}>Unread messages</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#F87171' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FBBF24' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#34D399' }} />
      </div>
      <div style={{ height: 10, borderRadius: 6, backgroundColor: 'rgba(17,17,17,0.08)', width: '90%' }} />
      <div style={{ height: 10, borderRadius: 6, backgroundColor: 'rgba(17,17,17,0.08)', width: '65%' }} />
    </div>
  );
};

const CARD_WIDTH: Record<CardKind, number> = {
  email: 420,
  crm: 380,
  window: 340,
  calendar: 320,
  chat: 380,
};

const CardsLayer: React.FC<{ collapseStart: number }> = ({ collapseStart }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {CARDS.map((card) => {
        const enter = spring({
          frame: frame - card.delay,
          fps,
          config: { stiffness: 160, damping: 15, mass: 0.7 },
        });

        const floatT = frame / fps;
        const jitterX =
          Math.sin(floatT * 0.9 + card.seed) * 14 + Math.sin(floatT * 2.3 + card.seed * 1.7) * 5;
        const jitterY =
          Math.cos(floatT * 0.7 + card.seed * 1.4) * 14 + Math.cos(floatT * 1.9 + card.seed * 2.1) * 5;
        const rotateY = Math.sin(floatT * 0.5 + card.seed) * 10;
        const rotateX = Math.cos(floatT * 0.6 + card.seed) * 6;
        const breathe = 1 + Math.sin(floatT * 1.3 + card.seed * 2) * 0.025;

        const collapseLocal = frame - collapseStart - card.delay * 0.4;
        const collapse =
          collapseLocal > 0
            ? spring({
                frame: collapseLocal,
                fps,
                config: { stiffness: 210, damping: 13, mass: 0.4 },
              })
            : 0;
        const collapseClamped = Math.min(1, collapse);

        const posXPct = interpolate(collapseClamped, [0, 1], [card.x * 100, 50]);
        const posYPct = interpolate(collapseClamped, [0, 1], [card.y * 100, 50]);
        const scale = enter * breathe * interpolate(collapseClamped, [0, 1], [1, 0.05]);
        const opacity =
          enter *
          interpolate(collapseClamped, [0, 0.75, 1], [1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

        return (
          <div
            key={card.kind}
            style={{
              position: 'absolute',
              left: `${posXPct}%`,
              top: `${posYPct}%`,
              opacity,
              transform:
                `translate(-50%, -50%) translate(${jitterX * (1 - collapseClamped)}px, ${jitterY * (1 - collapseClamped)}px) ` +
                `rotateX(${rotateX * (1 - collapseClamped)}deg) rotateY(${rotateY * (1 - collapseClamped)}deg) ` +
                `rotate(${card.rotateBase * (1 - collapseClamped)}deg) scale(${scale})`,
            }}
          >
            <div
              style={{
                width: CARD_WIDTH[card.kind],
                borderRadius: 24,
                backgroundColor: GLASS_BG,
                border: `1px solid ${GLASS_BORDER}`,
                boxShadow: SHADOW_LG,
                backdropFilter: 'blur(20px)',
                padding: 30,
              }}
            >
              <CardBody kind={card.kind} />
            </div>
          </div>
        );
      })}
    </>
  );
};

export const UIChaos: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 200 }) => {
  const collapseStart = 120;

  return (
    <AbsoluteFill style={{ perspective: 1400 }}>
      <Trail layers={4} lagInFrames={2} trailOpacity={0.3}>
        <CardsLayer collapseStart={collapseStart} />
      </Trail>

      <CompilerPulse collapseStart={collapseStart} />
    </AbsoluteFill>
  );
};

const CompilerPulse: React.FC<{ collapseStart: number }> = ({ collapseStart }) => {
  const frame = useCurrentFrame();
  const local = frame - (collapseStart + 30);
  if (local < 0) return null;

  const progress = Math.min(1, local / 40);
  const scale = interpolate(progress, [0, 1], [0.2, 3]);
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 0.5, 0]);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${ACCENT}55, transparent 70%)`,
          transform: `scale(${scale})`,
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};
