import React from 'react';
import { WINDOW_BORDER, SHADOW_XL, FONT_STACK } from '../theme';
import { AppLogo } from './AppLogo';

export type DocKind =
  | 'word'
  | 'outlook'
  | 'pdf'
  | 'excel'
  | 'powerpoint'
  | 'imanage'
  | 'salesforce'
  | 'slack'
  | 'illustrator'
  | 'gmail'
  | 'jira'
  | 'notion'
  | 'calendar'
  | 'hubspot';

const Line: React.FC<{ w: string | number; h?: number; c?: string }> = ({
  w,
  h = 10,
  c = 'rgba(17,17,17,0.13)',
}) => <div style={{ width: w, height: h, borderRadius: 5, backgroundColor: c, flexShrink: 0 }} />;

export const DOC_WIDTH = 560;

/**
 * The header carries the recognition: a white bar with the real product mark
 * at full colour and a thick accent stripe in the app's signature colour.
 * A coloured logo on a coloured bar is what made these unreadable before.
 */
const Shell: React.FC<{
  accent: string;
  logo?: string;
  title: string;
  meta?: string;
  children: React.ReactNode;
}> = ({ accent, logo, title, meta, children }) => (
  <div
    style={{
      width: DOC_WIDTH,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      border: `1px solid ${WINDOW_BORDER}`,
      boxShadow: SHADOW_XL,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'stretch', height: 68, borderBottom: '1px solid rgba(17,17,17,0.07)' }}>
      <div style={{ width: 10, backgroundColor: accent, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', flex: 1, minWidth: 0 }}>
        {logo ? <AppLogo logo={logo} size={44} /> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: 24,
              fontWeight: 800,
              color: '#111111',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {title}
          </span>
          {meta ? (
            <span style={{ fontFamily: FONT_STACK, fontSize: 16, fontWeight: 500, color: 'rgba(17,17,17,0.45)', whiteSpace: 'nowrap' }}>
              {meta}
            </span>
          ) : null}
        </div>
      </div>
    </div>
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 11 }}>{children}</div>
  </div>
);

const MailRow: React.FC<{ from: string; subject: string; time: string; unread?: boolean; dot: string }> = ({
  from,
  subject,
  time,
  unread,
  dot,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
    <div
      style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: unread ? dot : 'transparent', flexShrink: 0 }}
    />
    <span style={{ fontFamily: FONT_STACK, fontSize: 16, fontWeight: 700, color: '#111', width: 108, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {from}
    </span>
    <span style={{ fontFamily: FONT_STACK, fontSize: 16, color: 'rgba(17,17,17,0.55)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {subject}
    </span>
    <span style={{ fontFamily: FONT_STACK, fontSize: 14, color: 'rgba(17,17,17,0.38)' }}>{time}</span>
  </div>
);

export const DocumentPage: React.FC<{ kind: DocKind }> = ({ kind }) => {
  switch (kind) {
    case 'word':
      return (
        <Shell accent="#185ABD" logo="microsoft-icon" title="Microsoft Word" meta="Q3_Budget_Narrative.docx">
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', opacity: 0.45 }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} style={{ width: 2, height: i % 4 === 0 ? 11 : 6, backgroundColor: 'rgba(17,17,17,0.3)' }} />
            ))}
          </div>
          <Line w="70%" h={14} c="rgba(17,17,17,0.32)" />
          <Line w="100%" />
          <Line w="96%" />
          <Line w="99%" />
          <Line w="58%" />
        </Shell>
      );

    case 'outlook':
      return (
        <Shell accent="#0F6CBD" logo="microsoft-icon" title="Outlook" meta="Inbox · 47 unread">
          <MailRow from="Sarah Chen" subject="Re: Q3 budget approval" time="09:12" unread dot="#0F6CBD" />
          <MailRow from="Legal" subject="Redlines on the MSA" time="08:47" unread dot="#0F6CBD" />
          <MailRow from="D. Alvarez" subject="Board deck — needs numbers" time="08:31" unread dot="#0F6CBD" />
          <MailRow from="IT Helpdesk" subject="Password expires today" time="07:58" dot="#0F6CBD" />
        </Shell>
      );

    case 'pdf':
      return (
        <Shell accent="#B30B00" logo="adobe-icon" title="Adobe Acrobat" meta="Master_Services_Agreement.pdf · 14/62">
          <Line w="52%" h={13} c="rgba(17,17,17,0.32)" />
          <Line w="100%" h={8} />
          <Line w="97%" h={8} />
          <Line w="100%" h={8} />
          <Line w="86%" h={8} />
          <div style={{ display: 'flex', gap: 9, marginTop: 3 }}>
            <div style={{ width: 74, height: 24, borderRadius: 5, border: '2px solid #B30B00' }} />
            <div style={{ width: 74, height: 24, borderRadius: 5, backgroundColor: 'rgba(179,11,0,0.13)' }} />
          </div>
        </Shell>
      );

    case 'excel':
      return (
        <Shell accent="#107C41" logo="microsoft-icon" title="Microsoft Excel" meta="Pipeline_Forecast.xlsx">
          <div style={{ display: 'flex', gap: 3 }}>
            {['A', 'B', 'C', 'D', 'E'].map((c) => (
              <div
                key={c}
                style={{
                  flex: 1,
                  height: 24,
                  backgroundColor: 'rgba(16,124,65,0.13)',
                  borderRadius: 4,
                  fontFamily: FONT_STACK,
                  fontSize: 14,
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
          {[0, 1, 2].map((r) => (
            <div key={r} style={{ display: 'flex', gap: 3 }}>
              {[0, 1, 2, 3, 4].map((c) => (
                <div
                  key={c}
                  style={{
                    flex: 1,
                    height: 24,
                    borderRadius: 4,
                    border: '1px solid rgba(17,17,17,0.1)',
                    backgroundColor: r === 1 && c === 2 ? 'rgba(16,124,65,0.24)' : 'transparent',
                  }}
                />
              ))}
            </div>
          ))}
        </Shell>
      );

    case 'powerpoint':
      return (
        <Shell accent="#C43E1C" logo="microsoft-icon" title="PowerPoint" meta="QBR_Deck_v7.pptx · slide 12">
          <div style={{ border: '1px solid rgba(17,17,17,0.11)', borderRadius: 9, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Line w="62%" h={15} c="rgba(196,62,28,0.5)" />
            <Line w="92%" h={8} />
            <Line w="78%" h={8} />
          </div>
        </Shell>
      );

    case 'salesforce':
      return (
        <Shell accent="#00A1E0" logo="salesforce" title="Salesforce" meta="Opportunity · Acme Corp">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: FONT_STACK, fontSize: 30, fontWeight: 800, color: '#111' }}>$42,000</span>
            <span style={{ fontFamily: FONT_STACK, fontSize: 14, fontWeight: 700, color: '#00A1E0', backgroundColor: 'rgba(0,161,224,0.14)', padding: '5px 14px', borderRadius: 20 }}>
              Negotiation
            </span>
          </div>
          <Line w="88%" h={8} />
          <Line w="64%" h={8} />
        </Shell>
      );

    case 'slack':
      return (
        <Shell accent="#611F69" logo="slack-icon" title="Slack" meta="#deal-desk · 12 new">
          <MailRow from="@maya" subject="can you approve the discount?" time="11:04" unread dot="#611F69" />
          <MailRow from="@tom" subject="client is waiting on the SOW" time="10:52" unread dot="#611F69" />
          <MailRow from="@finance" subject="reminder: close is Friday" time="10:20" dot="#611F69" />
        </Shell>
      );

    case 'illustrator':
      return (
        <Shell accent="#FF9A00" logo="adobe-illustrator" title="Illustrator" meta="Brand_Onepager.ai">
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, height: 104, borderRadius: 7, backgroundColor: 'rgba(17,17,17,0.06)' }} />
            <div style={{ width: 104, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Line w="100%" h={15} />
              <Line w="100%" h={15} />
              <Line w="72%" h={15} />
            </div>
          </div>
        </Shell>
      );

    case 'imanage':
      return (
        <Shell accent="#2F3B4C" title="iManage" meta="Matter 41-9082">
          {[
            ['Engagement_Letter', 'v12'],
            ['Due_Diligence_Memo', 'v4'],
            ['Closing_Checklist', 'v27'],
          ].map(([name, ver]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 16, height: 19, borderRadius: 3, backgroundColor: 'rgba(47,59,76,0.25)' }} />
              <span style={{ fontFamily: FONT_STACK, fontSize: 16, fontWeight: 600, color: '#111', flex: 1, whiteSpace: 'nowrap' }}>
                {name}
              </span>
              <span style={{ fontFamily: FONT_STACK, fontSize: 13, fontWeight: 700, color: '#2F3B4C', backgroundColor: 'rgba(47,59,76,0.1)', padding: '4px 10px', borderRadius: 20 }}>
                {ver}
              </span>
            </div>
          ))}
        </Shell>
      );

    case 'hubspot':
      return (
        <Shell accent="#FF7A59" logo="hubspot" title="HubSpot" meta="Deal · Northwind">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: FONT_STACK, fontSize: 30, fontWeight: 800, color: '#111' }}>$18,400</span>
            <span style={{ fontFamily: FONT_STACK, fontSize: 14, fontWeight: 700, color: '#FF7A59', backgroundColor: 'rgba(255,122,89,0.14)', padding: '5px 14px', borderRadius: 20 }}>
              Follow up
            </span>
          </div>
          <Line w="80%" h={8} />
          <Line w="58%" h={8} />
        </Shell>
      );

    case 'gmail':
      return (
        <Shell accent="#EA4335" logo="google-gmail" title="Gmail" meta="18 unread">
          <MailRow from="Procurement" subject="Vendor form overdue" time="10:04" unread dot="#EA4335" />
          <MailRow from="R. Okafor" subject="Fwd: signed NDA" time="09:41" unread dot="#EA4335" />
          <MailRow from="Finance" subject="Expense report rejected" time="09:02" dot="#EA4335" />
        </Shell>
      );

    case 'jira':
      return (
        <Shell accent="#0052CC" logo="jira" title="Jira" meta="PROJ-418 · Blocked">
          <Line w="76%" h={13} c="rgba(17,17,17,0.3)" />
          <div style={{ display: 'flex', gap: 9 }}>
            {['Blocked', 'P1', 'Backend'].map((t) => (
              <span key={t} style={{ fontFamily: FONT_STACK, fontSize: 13, fontWeight: 700, color: '#0052CC', backgroundColor: 'rgba(0,82,204,0.12)', padding: '5px 12px', borderRadius: 5 }}>
                {t}
              </span>
            ))}
          </div>
          <Line w="92%" h={8} />
        </Shell>
      );

    case 'notion':
      return (
        <Shell accent="#111111" logo="notion-icon" title="Notion" meta="Spec draft v3">
          <Line w="56%" h={14} c="rgba(17,17,17,0.32)" />
          <Line w="100%" h={8} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 15, height: 15, borderRadius: 4, border: '2px solid rgba(17,17,17,0.3)' }} />
            <Line w="58%" h={8} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 15, height: 15, borderRadius: 4, border: '2px solid rgba(17,17,17,0.3)' }} />
            <Line w="46%" h={8} />
          </div>
        </Shell>
      );

    case 'calendar':
    default:
      return (
        <Shell accent="#4285F4" logo="google-calendar" title="Google Calendar" meta="Today · 9 meetings">
          {[
            ['09:00', 'Standup', 0.9],
            ['10:30', 'Client QBR', 0.62],
            ['13:00', 'Legal sync', 0.76],
          ].map(([t, label, wd]) => (
            <div key={t as string} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ fontFamily: FONT_STACK, fontSize: 14, color: 'rgba(17,17,17,0.45)', width: 50 }}>{t}</span>
              <div
                style={{
                  height: 26,
                  width: `${(wd as number) * 100}%`,
                  borderRadius: 6,
                  backgroundColor: 'rgba(66,133,244,0.16)',
                  borderLeft: '4px solid #4285F4',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 10,
                }}
              >
                <span style={{ fontFamily: FONT_STACK, fontSize: 14, fontWeight: 600, color: '#1a56c4' }}>{label}</span>
              </div>
            </div>
          ))}
        </Shell>
      );
  }
};
