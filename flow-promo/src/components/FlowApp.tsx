import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GLASS_BORDER, MUTED, SUCCESS, TEXT, ACCENT, FONT_STACK } from '../theme';
import { AppLogo } from './AppLogo';
import { STEP_DONE_LOCAL } from '../timeline';

const INTENT = 'Close out Q3 for Acme Corp';

const STEPS: { logo: string; label: string }[] = [
  { logo: 'adobe-icon', label: 'Pull the signed MSA from iManage' },
  { logo: 'salesforce', label: 'Update the Acme opportunity to Closed Won' },
  { logo: 'microsoft-icon', label: "Reply to Sarah's budget thread in Outlook" },
  { logo: 'google-calendar', label: 'Book the Q3 review with the account team' },
  { logo: 'slack-icon', label: 'Post the close summary to #deal-desk' },
];

const TYPE_START = 14;
const TYPE_END = 74;

const Spinner: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const angle = (frame * 7) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${angle}deg)` }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={`${ACCENT}33`} strokeWidth="3" />
      <path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};

const DoneCheck: React.FC<{ doneAt: number; size: number }> = ({ doneAt, size }) => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame - doneAt, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill={SUCCESS} opacity={draw} />
      <path
        d="M6.5 12.5 L10.5 16.5 L17.5 8.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
    </svg>
  );
};

const StepRow: React.FC<{ step: (typeof STEPS)[number]; index: number }> = ({ step, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const doneAt = STEP_DONE_LOCAL[index];
  const startAt = index === 0 ? TYPE_END + 8 : STEP_DONE_LOCAL[index - 1];

  const appear = spring({
    frame: frame - (TYPE_END + index * 6),
    fps,
    config: { stiffness: 170, damping: 16, mass: 0.6 },
  });

  const running = frame >= startAt && frame < doneAt;
  const done = frame >= doneAt;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '22px 28px',
        borderRadius: 16,
        backgroundColor: running ? `${ACCENT}0D` : 'transparent',
        border: `1px solid ${running ? `${ACCENT}33` : 'transparent'}`,
        opacity: appear * (done ? 1 : running ? 1 : 0.5),
        transform: `translateX(${(1 - appear) * 30}px)`,
      }}
    >
      <AppLogo logo={step.logo} size={40} />
      <span
        style={{
          fontFamily: FONT_STACK,
          fontSize: 30,
          fontWeight: 600,
          color: done ? TEXT : running ? TEXT : MUTED,
          flex: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {step.label}
      </span>
      {done ? <DoneCheck doneAt={doneAt} size={40} /> : running ? <Spinner size={40} /> : (
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid rgba(17,17,17,0.12)` }} />
      )}
    </div>
  );
};

export const FlowApp: React.FC<{ durationInFrames?: number }> = ({ durationInFrames = 390 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const open = spring({ frame, fps, config: { stiffness: 150, damping: 17, mass: 0.8 } });
  const openOpacity = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const typed = Math.round(
    interpolate(frame, [TYPE_START, TYPE_END], [0, INTENT.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const caretOn = frame < TYPE_END + 10 && Math.floor(frame / 15) % 2 === 0;

  const completed = STEP_DONE_LOCAL.filter((f) => frame >= f).length;
  const progress = interpolate(completed, [0, STEPS.length], [0, 1]);

  const exitOpacity = interpolate(frame, [durationInFrames - 34, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 2600,
          borderRadius: 28,
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
          border: `1px solid ${GLASS_BORDER}`,
          boxShadow: '0 60px 140px rgba(17,17,17,0.18)',
          display: 'flex',
          opacity: openOpacity * exitOpacity,
          transform: `scale(${0.9 + open * 0.1})`,
        }}
      >
        {/* sidebar */}
        <div style={{ width: 300, backgroundColor: '#F7F8FB', borderRight: `1px solid ${GLASS_BORDER}`, padding: '26px 20px' }}>
          <div style={{ display: 'flex', gap: 9, marginBottom: 34, paddingLeft: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#FF5F57' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#FEBC2E' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#28C840' }} />
          </div>
          {['Inbox', 'Matters', 'Runs', 'Integrations'].map((item) => (
            <div
              key={item}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                marginBottom: 6,
                backgroundColor: item === 'Runs' ? `${ACCENT}14` : 'transparent',
                fontFamily: FONT_STACK,
                fontSize: 24,
                fontWeight: item === 'Runs' ? 700 : 500,
                color: item === 'Runs' ? ACCENT : MUTED,
              }}
            >
              {item}
            </div>
          ))}
        </div>

        {/* main */}
        <div style={{ flex: 1, padding: '34px 40px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span style={{ fontFamily: FONT_STACK, fontSize: 22, fontWeight: 600, color: MUTED, letterSpacing: 1.5 }}>
            WHAT DO YOU WANT DONE?
          </span>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '26px 30px',
              borderRadius: 18,
              border: `2.5px solid ${ACCENT}`,
              backgroundColor: '#FFFFFF',
              boxShadow: `0 0 0 8px ${ACCENT}12`,
            }}
          >
            <span style={{ fontFamily: FONT_STACK, fontSize: 38, fontWeight: 700, color: TEXT, whiteSpace: 'pre' }}>
              {INTENT.slice(0, typed)}
            </span>
            {caretOn ? <div style={{ width: 3, height: 42, backgroundColor: ACCENT }} /> : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {STEPS.map((step, i) => (
              <StepRow key={step.label} step={step} index={i} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 'auto', paddingTop: 14 }}>
            <div style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(17,17,17,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 6, backgroundColor: SUCCESS }} />
            </div>
            <span style={{ fontFamily: FONT_STACK, fontSize: 26, fontWeight: 700, color: completed === STEPS.length ? SUCCESS : MUTED }}>
              {completed}/{STEPS.length} done
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
