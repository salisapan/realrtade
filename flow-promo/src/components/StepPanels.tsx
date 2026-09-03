import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ACCENT, INK, INK_MUTED, SUCCESS, WINDOW_BORDER, FONT_STACK } from '../theme';
import { AppLogo } from './AppLogo';

/**
 * Each panel renders the inline-expanding detail for one FlowApp step: a
 * concrete before/after data movement rather than an abstract "done" tick.
 * All five thread the same real value ($186,400) through the deal, so the
 * viewer tracks one piece of data moving from the contract all the way to
 * the team channel.
 */

const DEAL_VALUE = '$186,400';

export type StepPanelProps = { startAt: number; doneAt: number };

const useProgress = ({ startAt, doneAt }: StepPanelProps) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [startAt, doneAt], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

const sliceByProgress = (text: string, progress: number, from: number, to: number) => {
  const p = interpolate(progress, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return text.slice(0, Math.round(text.length * p));
};

const PanelShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      borderRadius: 16,
      border: `1px solid ${WINDOW_BORDER}`,
      backgroundColor: 'rgba(15,20,32,0.025)',
      padding: '22px 26px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}
  >
    {children}
  </div>
);

const PanelHeader: React.FC<{ logo?: string; title: string; meta?: string }> = ({ logo, title, meta }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    {logo ? <AppLogo logo={logo} size={28} /> : null}
    <span style={{ fontFamily: FONT_STACK, fontSize: 22, fontWeight: 700, color: INK }}>{title}</span>
    {meta ? (
      <span style={{ fontFamily: FONT_STACK, fontSize: 18, fontWeight: 500, color: INK_MUTED }}>{meta}</span>
    ) : null}
  </div>
);

const ValueChip: React.FC<{ x: number; opacity: number; landed: boolean }> = ({ x, opacity, landed }) => (
  <div
    style={{
      position: 'absolute',
      left: `${x}%`,
      top: '50%',
      transform: `translate(-50%, -50%) scale(${landed ? 1 : 0.9})`,
      opacity,
      padding: '8px 20px',
      borderRadius: 100,
      backgroundColor: `${ACCENT}1F`,
      border: `1.5px solid ${ACCENT}`,
      whiteSpace: 'nowrap',
    }}
  >
    <span style={{ fontFamily: FONT_STACK, fontSize: 20, fontWeight: 700, color: ACCENT }}>{DEAL_VALUE}</span>
  </div>
);

/* ---- 1. iManage: scan the contract, extract the figure ------------------ */

export const ExtractPanel: React.FC<StepPanelProps> = (props) => {
  const progress = useProgress(props);
  const scanY = interpolate(progress, [0.05, 0.5], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const highlighted = progress > 0.32;
  const chipX = interpolate(progress, [0.55, 0.85], [46, 88], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const chipOpacity = interpolate(progress, [0.5, 0.6, 1], [0, 1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <PanelShell>
      <PanelHeader logo="adobe-icon" title="Adobe Acrobat" meta="MSA_Acme_v12.pdf" />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, height: 110 }}>
        {[100, 92, 96, 60].map((w, i) => (
          <div
            key={i}
            style={{
              height: 12,
              width: `${w}%`,
              borderRadius: 6,
              backgroundColor: i === 2 && highlighted ? `${ACCENT}22` : 'rgba(15,20,32,0.09)',
              border: i === 2 && highlighted ? `1.5px solid ${ACCENT}` : '1.5px solid transparent',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${scanY}%`,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
            opacity: progress < 0.5 ? 1 : 0,
          }}
        />
        <ValueChip x={chipX} opacity={chipOpacity} landed={progress > 0.75} />
      </div>
    </PanelShell>
  );
};

/* ---- 2. Salesforce: stage flips, the figure lands in Amount -------------- */

export const UpdateFieldPanel: React.FC<StepPanelProps> = (props) => {
  const progress = useProgress(props);
  const stageFlip = progress > 0.25;
  const amountX = interpolate(progress, [0.45, 0.72], [8, 50], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const amountOpacity = interpolate(progress, [0.45, 0.55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = progress > 0.72 && progress < 0.85;

  return (
    <PanelShell>
      <PanelHeader logo="salesforce" title="Salesforce" meta="Opportunity · Acme Corp" />
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: FONT_STACK, fontSize: 15, color: INK_MUTED }}>Stage</span>
          <div style={{ position: 'relative', height: 34 }}>
            <span
              style={{
                position: 'absolute',
                fontFamily: FONT_STACK,
                fontSize: 20,
                fontWeight: 700,
                color: INK_MUTED,
                textDecoration: 'line-through',
                opacity: stageFlip ? 0 : 1,
              }}
            >
              Negotiation
            </span>
            <span
              style={{
                position: 'absolute',
                fontFamily: FONT_STACK,
                fontSize: 20,
                fontWeight: 700,
                color: SUCCESS,
                opacity: stageFlip ? 1 : 0,
              }}
            >
              Closed Won
            </span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: FONT_STACK, fontSize: 15, color: INK_MUTED }}>Amount</span>
          <div
            style={{
              position: 'relative',
              height: 34,
              borderRadius: 8,
              border: `1.5px solid ${pulse ? SUCCESS : 'rgba(15,20,32,0.12)'}`,
              overflow: 'hidden',
            }}
          >
            <ValueChip x={amountX} opacity={amountOpacity} landed={progress > 0.72} />
          </div>
        </div>
      </div>
    </PanelShell>
  );
};

/* ---- 3. Outlook: compose a real reply, then send ------------------------- */

const EMAIL_BODY = `Confirmed — Acme closed at ${DEAL_VALUE}. Signed MSA attached.`;

export const ComposeEmailPanel: React.FC<StepPanelProps> = (props) => {
  const progress = useProgress(props);
  const frame = useCurrentFrame();

  const typed = sliceByProgress(EMAIL_BODY, progress, 0.22, 0.82);
  const caretOn = progress > 0.2 && progress < 0.85 && Math.floor(frame / 8) % 2 === 0;

  const sendProgress = interpolate(progress, [0.86, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sent = progress > 0.94;

  return (
    <PanelShell>
      <PanelHeader logo="microsoft-icon" title="Outlook" meta="New message" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: FONT_STACK, fontSize: 17, color: INK_MUTED }}>
          To: <span style={{ color: INK, fontWeight: 600 }}>Sarah Chen</span>
        </span>
        <span style={{ fontFamily: FONT_STACK, fontSize: 17, color: INK_MUTED }}>
          Subject: <span style={{ color: INK, fontWeight: 600 }}>Re: Q3 Budget Approval</span>
        </span>
      </div>
      <div style={{ position: 'relative', minHeight: 40, display: 'flex', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: FONT_STACK, fontSize: 19, color: INK, whiteSpace: 'pre-wrap' }}>
          {typed}
          {caretOn ? <span style={{ color: ACCENT }}>|</span> : null}
        </span>
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: -4,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            opacity: sendProgress,
            transform: `translateX(${(1 - sendProgress) * 40}px)`,
          }}
        >
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
            <path d="M2 21 L23 12 L2 3 L2 10 L17 12 L2 14 Z" fill={ACCENT} />
          </svg>
          <span style={{ fontFamily: FONT_STACK, fontSize: 18, fontWeight: 700, color: sent ? SUCCESS : ACCENT }}>
            {sent ? 'Sent' : 'Sending…'}
          </span>
        </div>
      </div>
    </PanelShell>
  );
};

/* ---- 4. Calendar: schedule the review, attendees join -------------------- */

const ATTENDEES = ['SC', 'MF', 'AT'];

export const SchedulePanel: React.FC<StepPanelProps> = (props) => {
  const progress = useProgress(props);
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(progress, [0, 0.16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const timeOpacity = interpolate(progress, [0.14, 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const invitedOpacity = interpolate(progress, [0.82, 0.95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <PanelShell>
      <PanelHeader logo="google-calendar" title="Calendar" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontFamily: FONT_STACK, fontSize: 24, fontWeight: 700, color: INK, opacity: titleOpacity }}>
          Q3 Business Review
        </span>
        <span style={{ fontFamily: FONT_STACK, fontSize: 18, color: INK_MUTED, opacity: timeOpacity }}>
          Thu · 2:00 – 2:30 PM
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {ATTENDEES.map((initials, i) => {
          const popAt = 0.4 + i * 0.16;
          const pop = spring({ frame: frame - props.startAt - popAt * (props.doneAt - props.startAt), fps, config: { stiffness: 220, damping: 14, mass: 0.5 } });
          return (
            <div
              key={initials}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: ACCENT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${pop})`,
              }}
            >
              <span style={{ fontFamily: FONT_STACK, fontSize: 15, fontWeight: 700, color: '#fff' }}>{initials}</span>
            </div>
          );
        })}
        <span style={{ fontFamily: FONT_STACK, fontSize: 17, fontWeight: 700, color: SUCCESS, opacity: invitedOpacity, marginLeft: 4 }}>
          Invites sent
        </span>
      </div>
    </PanelShell>
  );
};

/* ---- 5. Slack: post the summary, the team reacts -------------------------- */

const SLACK_MESSAGE = `🎉 Acme Corp closed — ${DEAL_VALUE}. MSA signed, CRM updated, review booked.`;

export const PostMessagePanel: React.FC<StepPanelProps> = (props) => {
  const progress = useProgress(props);
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  const typed = sliceByProgress(SLACK_MESSAGE, progress, 0.06, 0.62);

  const reaction = (delay: number, count: string, emoji: string) => {
    const pop = spring({ frame: frame - props.startAt - delay * (props.doneAt - props.startAt), fps, config: { stiffness: 220, damping: 15, mass: 0.5 } });
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 100,
          backgroundColor: `${ACCENT}14`,
          border: `1px solid ${ACCENT}44`,
          transform: `scale(${pop})`,
          transformOrigin: 'left center',
        }}
      >
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontFamily: FONT_STACK, fontSize: 15, fontWeight: 700, color: ACCENT }}>{count}</span>
      </div>
    );
  };

  return (
    <PanelShell>
      <PanelHeader logo="slack-icon" title="Slack" meta="#deal-desk" />
      <div
        style={{
          borderRadius: 12,
          backgroundColor: 'rgba(15,20,32,0.04)',
          padding: '14px 18px',
          minHeight: 56,
        }}
      >
        <span style={{ fontFamily: FONT_STACK, fontSize: 19, color: INK, whiteSpace: 'pre-wrap' }}>{typed}</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {reaction(0.72, '+3', '👍')}
        {reaction(0.85, '+2', '🎉')}
      </div>
    </PanelShell>
  );
};
