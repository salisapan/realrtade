import { PresentationContainer } from "../PresentationContainer";
import { TimelineComponent } from "../TimelineComponent";

const TIMELINE_EVENTS = [
  {
    year: "2019",
    title: "תחילת הדרך",
    description:
      "AS IS Group מתחילה ללוות את המתחם בתהליך התחדשות עירונית",
  },
  {
    year: "2019-2020",
    title: "ארגון נציגות",
    description: "מינוי ובחירת נציגי דיירים לניהול התהליך",
  },
  {
    year: "2020",
    title: "שיתוף משפטי",
    description:
      "בחירה ומינוי משרד עורכי דין הרצוג בייצוג טוב של הדיירים",
  },
  {
    year: "2021-2023",
    title: "תיאום וניהול",
    description: "ניהול תקשורת מתמשכת עם יזמים ודיירים, הכנה לשלבים הבאים",
  },
  {
    year: "2024-2025",
    title: "בחירת יזם חדש",
    description:
      "היווצרות צורך בחברה מקדמת לניהול הפרויקט לאחר בחירת יזם חדש",
  },
  {
    year: "2025-2026",
    title: "נציגות מקדמת",
    description:
      "AS IS Group מוצעת כחברה מקדמת בעלת רקורד מוכח ונוכחות מלמעלה",
  },
];

export const TimelineSlide = () => {
  return (
    <PresentationContainer>
      <div className="space-y-8">
        <div>
          <h2 className="text-4xl font-bold text-foreground mb-2">
            המסע שלנו
          </h2>
          <p className="text-foreground/60">
            שבע שנות מעורבות רציפה בקידום טובת המתחם והדיירים
          </p>
        </div>

        <div className="max-h-96 overflow-y-auto pr-4">
          <TimelineComponent events={TIMELINE_EVENTS} />
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-primary/10">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">7</div>
            <p className="text-xs text-foreground/60">שנות שותפות</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">6</div>
            <p className="text-xs text-foreground/60">מילות-דרך משמעותיות</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">∞</div>
            <p className="text-xs text-foreground/60">מחויבות לדיירים</p>
          </div>
        </div>
      </div>
    </PresentationContainer>
  );
};
