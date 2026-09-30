import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK_HE, SUCCESS, WARNING } from '../../theme';
import { BEAT_LOCAL } from '../../timelineHebrew';
import { FieldRow, SystemPanelShell } from './SystemPanelShell';

const PANEL_START = BEAT_LOCAL.click + 10;
const METER_TOTAL = 78;
const METER_THRESHOLD = 62.4; // 80% of 78
const METER_RISE_START = BEAT_LOCAL.confirm + 60;
const METER_RISE_END = BEAT_LOCAL.result;

const ConsentMeter: React.FC = () => {
  const frame = useCurrentFrame();

  const value = interpolate(frame, [METER_RISE_START, METER_RISE_END], [62, 63], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const crossed = value >= METER_THRESHOLD;
  const trackHeight = 240;
  const trackWidth = 46;
  const fillRatio = value / METER_TOTAL;
  const thresholdRatio = METER_THRESHOLD / METER_TOTAL;

  const tagFlash = crossed ? (Math.floor((frame - METER_RISE_END) / 10) % 2 === 0 ? 1 : 0.55) : 0;
  const tagOpacity = interpolate(frame, [METER_RISE_END, METER_RISE_END + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
      <div style={{ position: 'relative', width: trackWidth, height: trackHeight }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: trackWidth / 2,
            backgroundColor: '#EEF1F6',
            border: '2px solid #D7DCE5',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 2,
            right: 2,
            bottom: 2,
            height: `${fillRatio * (trackHeight - 4)}px`,
            borderRadius: trackWidth / 2,
            backgroundColor: crossed ? SUCCESS : '#5B84E0',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -6,
            right: -6,
            bottom: thresholdRatio * trackHeight,
            height: 0,
            borderTop: `2px dashed ${WARNING}`,
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 30, fontWeight: 800, color: '#111318' }}>
          {Math.round(value)}/{METER_TOTAL} הסכמות
        </span>
        <span style={{ fontFamily: FONT_STACK_HE, fontSize: 16, fontWeight: 600, color: '#5B6472' }}>
          סף חוקי: 80% ({METER_THRESHOLD.toFixed(1)}/{METER_TOTAL})
        </span>
        <div
          style={{
            marginTop: 8,
            padding: '10px 18px',
            borderRadius: 12,
            backgroundColor: '#EAF9EF',
            opacity: tagOpacity * tagFlash + (1 - tagOpacity) * 0,
            width: 'fit-content',
          }}
        >
          <span style={{ fontFamily: FONT_STACK_HE, fontSize: 18, fontWeight: 700, color: '#166534' }}>
            עברתם את הרוב הנדרש בחוק (80%)
          </span>
        </div>
      </div>
    </div>
  );
};

export const UrbanRenewalPanel: React.FC = () => {
  const frame = useCurrentFrame();

  const basicsFilled = frame >= PANEL_START + 20;
  const mismatchFlash = frame >= BEAT_LOCAL.shield && frame < BEAT_LOCAL.confirm;
  const mismatchFilled = frame >= BEAT_LOCAL.shield;
  const corrected = frame >= BEAT_LOCAL.confirm;

  return (
    <SystemPanelShell accent="#2E5C4E" title="מערכת הסכמי פינוי-בינוי">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px 28px' }}>
        <FieldRow label="שם הדייר" value="משפחת אברהמי" filled={basicsFilled} />
        <FieldRow label="מספר דירה" value="דירה 14" filled={basicsFilled} />
        <FieldRow
          label="ייפוי כוח"
          value={corrected ? 'עודכן ותואם' : 'שם: יוסי אברהמי'}
          filled={mismatchFilled}
          flash={mismatchFlash ? 'warning' : corrected ? 'success' : 'none'}
        />
        <FieldRow label="נסח טאבו" value="שם: יוסף אברהמי" filled={mismatchFilled} />
      </div>
      <div style={{ height: 32 }} />
      <ConsentMeter />
    </SystemPanelShell>
  );
};
