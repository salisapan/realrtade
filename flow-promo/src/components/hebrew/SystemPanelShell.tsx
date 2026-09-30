import React from 'react';
import { FONT_STACK_HE, INK_MUTED, SHADOW_XL, WINDOW_BORDER } from '../../theme';

/** Shared browser/app-chrome window used by the three vertical system panels. */
export const SystemPanelShell: React.FC<{
  accent: string;
  title: string;
  children: React.ReactNode;
}> = ({ accent, title, children }) => (
  <div
    style={{
      width: 1100,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      border: `1px solid ${WINDOW_BORDER}`,
      boxShadow: SHADOW_XL,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '16px 24px',
        backgroundColor: accent,
      }}
    >
      <div style={{ display: 'flex', gap: 7 }}>
        <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.5)' }} />
        <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.5)' }} />
        <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.5)' }} />
      </div>
      <span
        style={{
          fontFamily: FONT_STACK_HE,
          fontSize: 20,
          fontWeight: 700,
          color: '#FFFFFF',
          direction: 'rtl',
        }}
      >
        {title}
      </span>
    </div>
    <div style={{ padding: '30px 36px', direction: 'rtl' }}>{children}</div>
  </div>
);

export const FieldRow: React.FC<{
  label: string;
  value: string;
  filled: boolean;
  flash?: 'none' | 'warning' | 'success';
}> = ({ label, value, filled, flash = 'none' }) => {
  const borderColor = flash === 'warning' ? '#F5A623' : flash === 'success' ? '#22C55E' : WINDOW_BORDER;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: FONT_STACK_HE, fontSize: 16, fontWeight: 600, color: INK_MUTED }}>{label}</span>
      <div
        style={{
          height: 52,
          borderRadius: 12,
          border: `2px solid ${borderColor}`,
          backgroundColor: flash === 'warning' ? '#FFF6E7' : '#F7F8FB',
          display: 'flex',
          alignItems: 'center',
          padding: '0 18px',
        }}
      >
        <span
          style={{
            fontFamily: FONT_STACK_HE,
            fontSize: 22,
            fontWeight: 700,
            color: '#111318',
            opacity: filled ? 1 : 0,
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
};
