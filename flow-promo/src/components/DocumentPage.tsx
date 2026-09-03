import React from 'react';
import { GLASS_BORDER, SHADOW_LG, FONT_STACK } from '../theme';
import { BrandIcon, BrandKey } from './BrandIcon';

export type DocKind =
  | 'word'
  | 'outlook'
  | 'pdf'
  | 'excel'
  | 'powerpoint'
  | 'imanage'
  | 'crm'
  | 'adobe'
  | 'browser'
  | 'gmail'
  | 'jira'
  | 'notion'
  | 'calendar';

const Line: React.FC<{ w: string | number; h?: number; c?: string }> = ({
  w,
  h = 9,
  c = 'rgba(17,17,17,0.13)',
}) => <div style={{ width: w, height: h, borderRadius: 5, backgroundColor: c, flexShrink: 0 }} />;

const Shell: React.FC<{
  accent: string;
  title: string;
  subtitle?: string;
  icon?: BrandKey;
  width: number;
  children: React.ReactNode;
}> = ({ accent, title, subtitle, icon, width, children }) => (
  <div
    style={{
      width,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.97)',
      border: `1px solid ${GLASS_BORDER}`,
      boxShadow: SHADOW_LG,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div
      style={{
        height: 44,
        backgroundColor: accent,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 18px',
      }}
    >
      <div style={{ display: 'flex', gap: 7 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.35)' }} />
      </div>
      {icon ? (
        <div style={{ background: '#fff', borderRadius: 5, padding: 3, display: 'flex' }}>
          <BrandIcon brand={icon} size={17} />
        </div>
      ) : null}
      <span
        style={{
          fontFamily: FONT_STACK,
          fontSize: 17,
          fontWeight: 700,
          color: '#FFFFFF',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {title}
      </span>
      {subtitle ? (
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: 14,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.75)',
            whiteSpace: 'nowrap',
          }}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  </div>
);

const MailRow: React.FC<{ from: string; subject: string; time: string; unread?: boolean }> = ({
  from,
  subject,
  time,
  unread,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: unread ? '#0F6CBD' : 'transparent',
        flexShrink: 0,
      }}
    />
    <span style={{ fontFamily: FONT_STACK, fontSize: 14, fontWeight: 700, color: '#111', width: 96, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {from}
    </span>
    <span style={{ fontFamily: FONT_STACK, fontSize: 14, color: 'rgba(17,17,17,0.55)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {subject}
    </span>
    <span style={{ fontFamily: FONT_STACK, fontSize: 12, color: 'rgba(17,17,17,0.4)' }}>{time}</span>
  </div>
);

export const DOC_WIDTH = 520;

export const DocumentPage: React.FC<{ kind: DocKind }> = ({ kind }) => {
  const w = DOC_WIDTH;

  switch (kind) {
    case 'word':
      return (
        <Shell accent="#185ABD" title="Q3_Budget_Narrative.docx" subtitle="Saved" width={w}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.5 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ width: 2, height: i % 4 === 0 ? 10 : 6, backgroundColor: 'rgba(17,17,17,0.25)' }} />
            ))}
          </div>
          <Line w="72%" h={13} c="rgba(17,17,17,0.35)" />
          <Line w="100%" />
          <Line w="96%" />
          <Line w="99%" />
          <Line w="61%" />
          <Line w="93%" />
        </Shell>
      );

    case 'outlook':
      return (
        <Shell accent="#0F6CBD" title="Inbox" subtitle="47 unread" width={w}>
          <MailRow from="Sarah Chen" subject="Re: Q3 budget approval" time="09:12" unread />
          <MailRow from="Legal" subject="Redlines on the MSA" time="08:47" unread />
          <MailRow from="D. Alvarez" subject="Board deck — needs numbers" time="08:31" unread />
          <MailRow from="IT Helpdesk" subject="Password expires today" time="07:58" />
        </Shell>
      );

    case 'pdf':
      return (
        <Shell accent="#B30B00" title="Master_Services_Agreement.pdf" subtitle="14 / 62" width={w}>
          <Line w="55%" h={12} c="rgba(17,17,17,0.35)" />
          <Line w="100%" h={7} />
          <Line w="97%" h={7} />
          <Line w="100%" h={7} />
          <Line w="89%" h={7} />
          <Line w="100%" h={7} />
          <Line w="45%" h={7} />
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <div style={{ width: 60, height: 20, borderRadius: 4, border: '1.5px solid #B30B00' }} />
            <div style={{ width: 60, height: 20, borderRadius: 4, backgroundColor: 'rgba(179,11,0,0.12)' }} />
          </div>
        </Shell>
      );

    case 'excel':
      return (
        <Shell accent="#107C41" title="Pipeline_Forecast.xlsx" width={w}>
          <div style={{ display: 'flex', gap: 3 }}>
            {['A', 'B', 'C', 'D', 'E'].map((c) => (
              <div
                key={c}
                style={{
                  flex: 1,
                  height: 20,
                  backgroundColor: 'rgba(16,124,65,0.12)',
                  borderRadius: 3,
                  fontFamily: FONT_STACK,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#107C41',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {c}
              </div>
            ))}
          </div>
          {[0, 1, 2, 3].map((r) => (
            <div key={r} style={{ display: 'flex', gap: 3 }}>
              {[0, 1, 2, 3, 4].map((c) => (
                <div
                  key={c}
                  style={{
                    flex: 1,
                    height: 20,
                    borderRadius: 3,
                    border: '1px solid rgba(17,17,17,0.09)',
                    backgroundColor: r === 1 && c === 2 ? 'rgba(16,124,65,0.22)' : 'transparent',
                  }}
                />
              ))}
            </div>
          ))}
        </Shell>
      );

    case 'powerpoint':
      return (
        <Shell accent="#C43E1C" title="QBR_Deck_v7.pptx" subtitle="slide 12" width={w}>
          <div
            style={{
              border: '1px solid rgba(17,17,17,0.1)',
              borderRadius: 8,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
            }}
          >
            <Line w="64%" h={14} c="rgba(196,62,28,0.5)" />
            <Line w="92%" h={7} />
            <Line w="80%" h={7} />
            <Line w="86%" h={7} />
          </div>
        </Shell>
      );

    case 'imanage':
      return (
        <Shell accent="#2F3B4C" title="iManage · Matter 41-9082" width={w}>
          {[
            ['Engagement_Letter', 'v12'],
            ['Due_Diligence_Memo', 'v4'],
            ['Closing_Checklist', 'v27'],
            ['Board_Consent', 'v2'],
          ].map(([name, ver]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 14, height: 17, borderRadius: 2, backgroundColor: 'rgba(47,59,76,0.25)' }} />
              <span style={{ fontFamily: FONT_STACK, fontSize: 14, fontWeight: 600, color: '#111', flex: 1, whiteSpace: 'nowrap' }}>
                {name}
              </span>
              <span
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#2F3B4C',
                  backgroundColor: 'rgba(47,59,76,0.1)',
                  padding: '3px 8px',
                  borderRadius: 20,
                }}
              >
                {ver}
              </span>
            </div>
          ))}
        </Shell>
      );

    case 'crm':
      return (
        <Shell accent="#FF7A59" title="Acme Corp · Deal" icon="hubspot" width={w}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: FONT_STACK, fontSize: 26, fontWeight: 800, color: '#111' }}>$42,000</span>
            <span
              style={{
                fontFamily: FONT_STACK,
                fontSize: 12,
                fontWeight: 700,
                color: '#FF7A59',
                backgroundColor: 'rgba(255,122,89,0.14)',
                padding: '4px 12px',
                borderRadius: 20,
              }}
            >
              Negotiation
            </span>
          </div>
          {[
            ['Owner', 'M. Ferrer'],
            ['Close date', 'Sep 30'],
            ['Next step', 'Send redline'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontFamily: FONT_STACK, fontSize: 13, color: 'rgba(17,17,17,0.45)', width: 92 }}>{k}</span>
              <span style={{ fontFamily: FONT_STACK, fontSize: 13, fontWeight: 600, color: '#111' }}>{v}</span>
            </div>
          ))}
        </Shell>
      );

    case 'adobe':
      return (
        <Shell accent="#D31E26" title="Brand_Onepager.ai" width={w}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, height: 96, borderRadius: 6, backgroundColor: 'rgba(17,17,17,0.06)' }} />
            <div style={{ width: 92, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Line w="100%" h={13} />
              <Line w="100%" h={13} />
              <Line w="100%" h={13} />
              <Line w="70%" h={13} />
            </div>
          </div>
        </Shell>
      );

    case 'browser':
      return (
        <Shell accent="#4A5568" title="27 tabs" width={w}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 22,
                  borderRadius: '5px 5px 0 0',
                  backgroundColor: i === 0 ? 'rgba(17,17,17,0.12)' : 'rgba(17,17,17,0.05)',
                }}
              />
            ))}
          </div>
          <div style={{ height: 22, borderRadius: 11, backgroundColor: 'rgba(17,17,17,0.07)' }} />
          <Line w="88%" h={7} />
          <Line w="64%" h={7} />
        </Shell>
      );

    case 'gmail':
      return (
        <Shell accent="#EA4335" title="Gmail" subtitle="18 unread" icon="gmail" width={w}>
          <MailRow from="Procurement" subject="Vendor form overdue" time="10:04" unread />
          <MailRow from="R. Okafor" subject="Fwd: signed NDA" time="09:41" unread />
          <MailRow from="Finance" subject="Expense report rejected" time="09:02" />
        </Shell>
      );

    case 'jira':
      return (
        <Shell accent="#0052CC" title="PROJ-418" subtitle="Blocked" icon="jira" width={w}>
          <Line w="78%" h={12} c="rgba(17,17,17,0.3)" />
          <div style={{ display: 'flex', gap: 8 }}>
            {['Blocked', 'P1', 'Backend'].map((t) => (
              <span
                key={t}
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0052CC',
                  backgroundColor: 'rgba(0,82,204,0.12)',
                  padding: '4px 10px',
                  borderRadius: 4,
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <Line w="94%" h={7} />
          <Line w="70%" h={7} />
        </Shell>
      );

    case 'notion':
      return (
        <Shell accent="#111111" title="Spec draft v3" icon="notion" width={w}>
          <Line w="58%" h={13} c="rgba(17,17,17,0.35)" />
          <Line w="100%" h={7} />
          <Line w="91%" h={7} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, border: '1.5px solid rgba(17,17,17,0.3)' }} />
            <Line w="60%" h={7} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, border: '1.5px solid rgba(17,17,17,0.3)' }} />
            <Line w="48%" h={7} />
          </div>
        </Shell>
      );

    case 'calendar':
    default:
      return (
        <Shell accent="#4285F4" title="Today · 9 meetings" icon="calendar" width={w}>
          {[
            ['09:00', 'Standup', 0.9],
            ['10:30', 'Client QBR', 0.6],
            ['13:00', 'Legal sync', 0.75],
          ].map(([t, label, wd]) => (
            <div key={t as string} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: FONT_STACK, fontSize: 12, color: 'rgba(17,17,17,0.45)', width: 44 }}>{t}</span>
              <div
                style={{
                  height: 22,
                  width: `${(wd as number) * 100}%`,
                  borderRadius: 5,
                  backgroundColor: 'rgba(66,133,244,0.16)',
                  borderLeft: '3px solid #4285F4',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                }}
              >
                <span style={{ fontFamily: FONT_STACK, fontSize: 12, fontWeight: 600, color: '#1a56c4' }}>{label}</span>
              </div>
            </div>
          ))}
        </Shell>
      );
  }
};
