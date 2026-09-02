import { PresentationContainer } from "../PresentationContainer";
import { Zap, Shield, Handshake, Users } from "lucide-react";

const ADVANTAGES = [
  {
    icon: Zap,
    title: "ניסיון מוכח",
    points: [
      "7 שנות ניהול פעיל בפרויקט",
      "ידע עמוק בכל היבטי התהליך",
      "קשרים חזקים עם כל הגורמים",
    ],
  },
  {
    icon: Shield,
    title: "הגנה על הדיירים",
    points: [
      "עמדה עצמאית וללא ניגוד עניינים",
      "מינוי משרד עורכי דין מרצון",
      "שקיפות מלאה בכל החלטה",
    ],
  },
  {
    icon: Handshake,
    title: "קשרים מבוססים",
    points: [
      "קשר טוב עם משפחת הדיירים",
      "אמון מבוסס על שנות חוזה",
      "היסטוריה של ביצוע הבטחות",
    ],
  },
  {
    icon: Users,
    title: "צוות ציבורי",
    points: [
      "נציגים שנבחרו על ידכם",
      "משרד משפטי המייצג אתכם",
      "תמיכה רציפה וקבועה",
    ],
  },
];

export const WhyAsIsSlide = () => {
  return (
    <PresentationContainer>
      <div className="space-y-8">
        <div>
          <h2 className="text-4xl font-bold text-foreground mb-2">
            למה AS IS Group?
          </h2>
          <p className="text-foreground/60">
            ארבעה קולות שמדברים על בחירתנו כמנהלת הפרויקט
          </p>
        </div>

        {/* Advantages Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADVANTAGES.map((adv, index) => {
            const Icon = adv.icon;
            return (
              <div
                key={index}
                className="p-6 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 hover:border-primary/50 hover:shadow-lg transition-all group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-gradient-to-br from-primary to-secondary rounded-lg group-hover:shadow-lg transition-shadow">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {adv.title}
                  </h3>
                </div>

                <ul className="space-y-2">
                  {adv.points.map((point, pidx) => (
                    <li key={pidx} className="flex gap-2 text-sm text-foreground/70">
                      <span className="text-primary font-bold">✓</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/30 rounded-lg p-6 text-center">
          <p className="text-lg font-semibold text-foreground mb-2">
            רצינות חוזה עם בעלי הדירות
          </p>
          <p className="text-sm text-foreground/70">
            AS IS Group היא לא חברה חדשה בפרויקט - אנחנו השותף שלכם מ-2019,
            שעמד לצדכם בכל צעד.
          </p>
        </div>
      </div>
    </PresentationContainer>
  );
};
