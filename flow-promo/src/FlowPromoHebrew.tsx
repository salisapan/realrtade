import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { Backdrop } from './components/Backdrop';
import { FilmGrain } from './components/FilmGrain';
import { PainChaosHe } from './components/hebrew/PainChaosHe';
import { IntentReveal } from './components/hebrew/IntentReveal';
import { VerticalCaseScene } from './components/hebrew/VerticalCaseScene';
import { TaxAuthorityPanel } from './components/hebrew/TaxAuthorityPanel';
import { InsurerPanel } from './components/hebrew/InsurerPanel';
import { UrbanRenewalPanel } from './components/hebrew/UrbanRenewalPanel';
import { KnowledgeGraph } from './components/hebrew/KnowledgeGraph';
import { ClosingHe } from './components/hebrew/ClosingHe';
import { ensureHebrewFont } from './hebrewFont';
import { ACT, VERTICALS } from './timelineHebrew';

const VERTICAL_CONTENT = [
  {
    roleLabel: 'עורך דין · עסקת נדל"ן',
    mailFrom: 'מתי גולן, מתווך',
    mailSubject: 'עסקת מכר — הרצל 12',
    mailBody: 'מצורפים פרטי העסקה הסגורה. יש להעביר דיווח לרשות המסים בהקדם.',
    shieldMessage: 'מספר ת.ז שגוי זוהה — אימות נדרש',
    Panel: TaxAuthorityPanel,
  },
  {
    roleLabel: 'סוכנת ביטוח · פוליסת מנהלים',
    mailFrom: 'אלון שגיא',
    mailSubject: 'בקשה לפוליסת מנהלים חדשה',
    mailBody: 'מצ"ב הפרטים לביטוח. אשמח להנפקה בהקדם האפשרי.',
    shieldMessage: 'אי-התאמה: 22,500 ₪ בבקשה מול 22,050 ₪ בתלוש השכר בפועל',
    Panel: InsurerPanel,
  },
  {
    roleLabel: 'רכזת פרויקט התחדשות עירונית',
    mailFrom: 'עו"ד מייצג דיירים',
    mailSubject: 'עדכון הסכם פינוי-בינוי — בניין 14',
    mailBody: 'מצורף ייפוי כוח מעודכן מהדייר. נא לעדכן במערכת ההסכמות.',
    shieldMessage: 'אי-התאמה בין ייפוי הכוח לנסח הטאבו',
    Panel: UrbanRenewalPanel,
  },
];

export const FlowPromoHebrew: React.FC = () => {
  ensureHebrewFont();

  return (
    <>
      <Backdrop />

      <Audio src={staticFile('soundtrack-hebrew.wav')} volume={0.75} />
      <Audio src={staticFile('voiceover-hebrew.wav')} volume={0.85} />

      <Sequence from={ACT.pain.from} durationInFrames={ACT.pain.duration}>
        <PainChaosHe />
      </Sequence>

      <Sequence from={ACT.inversion.from} durationInFrames={ACT.inversion.duration}>
        <IntentReveal />
      </Sequence>

      {VERTICALS.map((vert, i) => (
        <Sequence key={i} from={vert.from} durationInFrames={vert.duration}>
          <VerticalCaseScene {...VERTICAL_CONTENT[i]} />
        </Sequence>
      ))}

      <Sequence from={ACT.graph.from} durationInFrames={ACT.graph.duration}>
        <KnowledgeGraph />
      </Sequence>

      <Sequence from={ACT.close.from} durationInFrames={ACT.close.duration}>
        <ClosingHe durationInFrames={ACT.close.duration} />
      </Sequence>

      <FilmGrain />
    </>
  );
};
