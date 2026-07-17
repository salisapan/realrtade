import { PresentationContainer } from "../PresentationContainer";

export const TitleSlide = () => {
  return (
    <PresentationContainer>
      <div className="space-y-8 text-center">
        {/* Logo Placeholder */}
        <div className="h-20 flex items-center justify-center">
          <div className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            AS IS
          </div>
          <div className="ml-2 text-2xl font-light text-secondary">GROUP</div>
        </div>

        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground">
            ניהול מתחם דירורים
          </h1>
          <p className="text-xl text-foreground/60">
            מנהלת הפרויקט מ-2019
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 py-8">
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <div className="text-2xl font-bold text-primary">7 שנים</div>
            <p className="text-sm text-foreground/60">ניסיון</p>
          </div>
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <div className="text-2xl font-bold text-primary">10</div>
            <p className="text-sm text-foreground/60">תחומי אחריות</p>
          </div>
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <div className="text-2xl font-bold text-primary">100%</div>
            <p className="text-sm text-foreground/60">מוקדש</p>
          </div>
        </div>

        <p className="text-base text-foreground/70 max-w-2xl mx-auto leading-relaxed">
          שותף אמיתי של הדיירים מ-2019, עם רקורד מוכח בתיאום, ייצוג משפטי
          וניהול מקצועי של תהליכי התחדשות עירונית
        </p>
      </div>

      <div className="pt-8 border-t border-primary/10 text-center">
        <p className="text-sm text-foreground/50">
          מפגש עם נציגי הדיירים • בעלי דירות • 2026
        </p>
      </div>
    </PresentationContainer>
  );
};
