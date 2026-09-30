import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK_HE, SUCCESS } from '../../theme';
import { BEAT_LOCAL } from '../../timelineHebrew';
import { FieldRow, SystemPanelShell } from './SystemPanelShell';

const PANEL_START = BEAT_LOCAL.click + 10;

export const TaxAuthorityPanel: React.FC = () => {
  const frame = useCurrentFrame();

  const basicsFilled = frame >= PANEL_START + 20;
  const idFlash = frame >= BEAT_LOCAL.shield && frame < BEAT_LOCAL.confirm;
  const idFilled = frame >= BEAT_LOCAL.shield;
  const idCorrected = frame >= BEAT_LOCAL.confirm;
  const restFilled = frame >= BEAT_LOCAL.confirm + 40;

  const stampOpacity = interpolate(frame, [BEAT_LOCAL.result, BEAT_LOCAL.result + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SystemPanelShell accent="#3B4B63" title="רשות המסים · דיווח עסקת מקרקעין">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px 28px' }}>
        <FieldRow label="שם המוכר" value="דוד כהן" filled={basicsFilled} />
        <FieldRow label="שם הקונה" value="רונית לוי" filled={basicsFilled} />
        <FieldRow
          label="מספר ת.ז. (מוכר)"
          value={idCorrected ? '023845671' : '023845761'}
          filled={idFilled}
          flash={idFlash ? 'warning' : idCorrected ? 'success' : 'none'}
        />
        <FieldRow label="סכום העסקה" value="2,340,000 ₪" filled={restFilled} />
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
          opacity: stampOpacity,
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
          מספר קשר אושר: 8843-2201
        </span>
      </div>
    </SystemPanelShell>
  );
};
