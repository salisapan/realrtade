import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK_HE, INK, INK_MUTED, SHADOW_XL, WINDOW_BORDER } from '../../theme';
import { BEAT_LOCAL } from '../../timelineHebrew';
import { AppLogo } from '../AppLogo';
import { DoItButtonHe } from './DoItButtonHe';
import { ShieldCatch } from './ShieldCatch';

const BUTTON_WINDOW_START = BEAT_LOCAL.click - 140;
const BUTTON_WINDOW_DURATION = 200;
const BUTTON_LOCAL_CLICK = 140;

const MAIL_OUT_START = BEAT_LOCAL.click - 150;
const PANEL_IN_START = BEAT_LOCAL.click - 15;

const MailCard: React.FC<{ from: string; subject: string; body: string }> = ({ from, subject, body }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [BEAT_LOCAL.mail, BEAT_LOCAL.mail + 20, MAIL_OUT_START, MAIL_OUT_START + 20],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const y = interpolate(frame, [MAIL_OUT_START, MAIL_OUT_START + 20], [0, -30], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, calc(-50% + ${y}px))`,
        opacity,
        width: 860,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        border: `1px solid ${WINDOW_BORDER}`,
        boxShadow: SHADOW_XL,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 28px', borderBottom: `1px solid ${WINDOW_BORDER}` }}>
        <AppLogo logo="microsoft-icon" size={30} />
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 18, fontWeight: 700, color: INK_MUTED, direction: 'rtl' }}>
          Outlook
        </span>
      </div>
      <div style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 18, color: INK_MUTED }}>מאת: {from}</span>
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 28, fontWeight: 800, color: INK }}>{subject}</span>
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 20, color: INK, lineHeight: 1.6 }}>{body}</span>
      </div>
    </div>
  );
};

export const VerticalCaseScene: React.FC<{
  roleLabel: string;
  mailFrom: string;
  mailSubject: string;
  mailBody: string;
  shieldMessage: string;
  Panel: React.FC;
}> = ({ roleLabel, mailFrom, mailSubject, mailBody, shieldMessage, Panel }) => {
  const frame = useCurrentFrame();

  const sceneOpacity = interpolate(frame, [0, 20, BEAT_LOCAL.holdEnd, BEAT_LOCAL.holdEnd + 40], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const kickerOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const panelOpacity = interpolate(frame, [PANEL_IN_START, PANEL_IN_START + 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const panelScale = interpolate(frame, [PANEL_IN_START, PANEL_IN_START + 24], [0.94, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: kickerOpacity,
          fontFamily: FONT_STACK_HE,
          fontSize: 30,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.82)',
          direction: 'rtl',
          letterSpacing: 0.5,
        }}
      >
        {roleLabel}
      </div>

      <MailCard from={mailFrom} subject={mailSubject} body={mailBody} />

      <Sequence from={BUTTON_WINDOW_START} durationInFrames={BUTTON_WINDOW_DURATION} layout="none">
        <DoItButtonHe clickFrame={BUTTON_LOCAL_CLICK} durationInFrames={BUTTON_WINDOW_DURATION} />
      </Sequence>

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          opacity: panelOpacity,
          transform: `scale(${panelScale})`,
        }}
      >
        <Panel />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ShieldCatch triggerFrame={BEAT_LOCAL.shield} message={shieldMessage} fadeOutFrame={BEAT_LOCAL.confirm} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
