import { PresentationContainer } from "../PresentationContainer";
import { CheckCircle } from "lucide-react";

const RESPONSIBILITIES = [
  {
    title: "ניהול יומי מקצועי",
    description: "תיאום בין דיירים, יזמים, קבלנים ומתכננים",
    icon: "📋",
  },
  {
    title: "תיווך וגישור",
    description: "פתרון סכסוכים והגעה להסכמות הדדיות",
    icon: "🤝",
  },
  {
    title: "ייצוג מתמשך",
    description: "שמירה על קול הדיירים וטובתם בכל החלטה",
    icon: "📢",
  },
  {
    title: "תיאום משפטי",
    description: "שיתוף פעולה עם משרד עורכי הדין בייצוג הדיירים",
    icon: "⚖",
  },
  {
    title: "ניהול אדמיניסטרציה",
    description: "ניהול מניות, ביטוחים, היתרים וערכאות משפטיות",
    icon: "📊",
  },
  {
    title: "ניהול פינוי והעברה",
    description: "תיאום מעבר דיירים לשכנים חלופיים ותחזוקת מאפיינים",
    icon: "🚚",
  },
  {
    title: "תיאום בנייה",
    description: "פיקוח על התקדמות עבודות ותאימות להתחייבויות",
    icon: "🏗",
  },
  {
    title: "עמידה בנגישות",
    description: "הבטחת עמידה בדרישות נגישות וסטנדרטים בנייה",
    icon: "♿",
  },
  {
    title: "תמיכה מתמשכת",
    description: "שירות דיירים לאורך כל שלבי הפרויקט",
    icon: "🤲",
  },
  {
    title: "שקיפות פיננסית",
    description: "דיווחים ברורים על עלויות ודמי ניהול",
    icon: "💰",
  },
];

export const ResponsibilitiesSlide = () => {
  return (
    <PresentationContainer>
      <div className="space-y-6">
        <div>
          <h2 className="text-4xl font-bold text-foreground mb-2">
            10 תחומי אחריות
          </h2>
          <p className="text-foreground/60">
            המקצוע שלנו ותחומי הביצוע שלנו בניהול המתחם
          </p>
        </div>

        {/* Responsibilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-2">
          {RESPONSIBILITIES.map((item, index) => (
            <div
              key={index}
              className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20 hover:border-primary/40 hover:bg-primary/10 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl mt-1 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-foreground/60">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-primary/5 rounded-lg p-4 border border-primary/20 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm text-foreground">
            <p className="font-semibold mb-1">המחויבות שלנו</p>
            <p className="text-foreground/70">
              ניהול מלא של כל היבט בפרויקט עם עדיפות מוחלטת לטובת ברוח הדיירים
            </p>
          </div>
        </div>
      </div>
    </PresentationContainer>
  );
};
