import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK_HE, SUCCESS } from '../../theme';
import { BEAT_LOCAL } from '../../timelineHebrew';
import { FieldRow, SystemPanelShell } from './SystemPanelShell';

const PANEL_START = BEAT_LOCAL.click + 10;

export const InsurerPanel: React.FC = () => {
  const frame = useCurrentFrame();

  const basicsFilled = frame >= PANEL_START + 20;
  const amountFlash = frame >= BEAT_LOCAL.shield && frame < BEAT_LOCAL.confirm;
  const amountFilled = frame >= BEAT_LOCAL.shield;
  const amountCorrected = frame >= BEAT_LOCAL.confirm;
  const refShown = frame >= BEAT_LOCAL.shield;

  const policyOpacity = interpolate(frame, [BEAT_LOCAL.result, BEAT_LOCAL.result + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SystemPanelShell accent="#B84A2E" title="מערכת מייצגים · הנפקת פוליסה">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px 28px' }}>
        <FieldRow label="שם המבוטח" value="אלון שגיא" filled={basicsFilled} />
        <FieldRow label="סוג פוליסה" value="פוליסת מנהלים" filled={basicsFilled} />
        <FieldRow
          label="פרמיה חודשית מבוקשת"
          value={amountCorrected ? '22,050 ₪' : '22,500 ₪'}
          filled={amountFilled}
          flash={amountFlash ? 'warning' : amountCorrected ? 'success' : 'none'}
        />
        <FieldRow label="פרמיה לפי תלוש שכר" value={refShown ? '22,050 ₪' : ''} filled={refShown} />
      </div>
      <div style={{ height: 28 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '16px 22px',
          borderRadius: 14,
          backgroundColor: '#EAF9EF',
          opacity: policyOpacity,
        }}
      >
        <svg width={30} height={30} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill={SUCCESS} />
          <path
            d="M6.5 12.5 L10.5 16.5 L17.5 8.5"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 22, fontWeight: 700, color: '#166534' }}>
          פוליסה הונפקה: מספר 4471-2298
        </span>
      </div>
    </SystemPanelShell>
  );
};
