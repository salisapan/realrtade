import { PresentationContainer } from "../PresentationContainer";
import { Mail, ArrowRight } from "lucide-react";

const CORRESPONDENCE = [
  {
    date: "13.4.2021",
    from: "As Is Group",
    to: "נציגי דיירים",
    subject: "מינוי משרד עורכי דין הרצוג",
    preview:
      "הצגנו בפניכם את משרד הרצוג בייצוג מקצועי וישיר של האינטרסים שלכם...",
    highlight: "💼 בחירה משפטית אסטרטגית",
  },
  {
    date: "12.4.2021",
    from: "Herzog Law Office",
    to: "As Is Group + דיירים",
    subject: "אישור הנציגות וההסדרים",
    preview:
      "ידע עלידי הדיירים בתיאום עם AS IS, מינוי עו״ד עידן יהודה ליווי הפרויקט...",
    highlight: "⚖️ עו״ד עידן יהודה קבע לייצוג",
  },
  {
    date: "2019-2026",
    from: "As Is Group",
    to: "קהילת הדיירים",
    subject: "ניהול מתמשך ותיווך",
    preview:
      "תקשורת שוטפת, פתרון בעיות, תיאום עם יזמים ויחידות בנייה, הכנה לשלבי הפרויקט...",
    highlight: "🤝 7 שנות שותפות",
  },
];

export const CorrespondenceSlide = () => {
  return (
    <PresentationContainer>
      <div className="space-y-6">
        <div>
          <h2 className="text-4xl font-bold text-foreground mb-2">
            הכתכתבויות שלנו
          </h2>
          <p className="text-foreground/60">
            דוגמאות של מעורבות וניהול מקצועי לאורך השנים
          </p>
        </div>

        {/* Correspondence Timeline */}
        <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
          {CORRESPONDENCE.map((item, index) => (
            <div
              key={index}
              className="group p-5 rounded-lg border border-primary/20 bg-gradient-to-br from-card/50 to-primary/5 hover:border-primary/50 hover:shadow-lg transition-all"
            >
              {/* Header with date */}
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-primary">{item.date}</span>
                <ArrowRight className="w-3 h-3 text-foreground/30" />
                <span className="text-xs text-foreground/60">
                  {item.from} → {item.to}
                </span>
              </div>

              {/* Subject */}
              <h4 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                {item.subject}
              </h4>

              {/* Preview */}
              <p className="text-sm text-foreground/60 mb-3 line-clamp-2">
                {item.preview}
              </p>

              {/* Highlight */}
              <div className="inline-block px-3 py-1 bg-primary/10 rounded-full text-xs font-medium text-primary border border-primary/20">
                {item.highlight}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="pt-4 border-t border-primary/10">
          <p className="text-sm text-foreground/70">
            <span className="font-semibold text-foreground">
              מעלים עבור מצגת זו:
            </span>
            {" "}תקשורת מתמשכת, תיאום פעיל, דאגה יומיומית לטובת הדיירים
          </p>
        </div>
      </div>
    </PresentationContainer>
  );
};
