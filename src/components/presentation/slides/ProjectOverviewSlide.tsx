import { PresentationContainer } from "../PresentationContainer";

export const ProjectOverviewSlide = () => {
  const projectStats = [
    {
      label: "יחידות דיור",
      value: "23",
      description: "דירות במתחם",
      color: "from-blue-500 to-blue-600",
    },
    {
      label: "בתי בנייה",
      value: "3",
      description: "יחידות הנדסה",
      color: "from-purple-500 to-purple-600",
    },
    {
      label: "שלבים",
      value: "5",
      description: "של ניהול פרויקט",
      color: "from-green-500 to-green-600",
    },
    {
      label: "שנות חוזה",
      value: "7+",
      description: "שותפות והנהלה",
      color: "from-orange-500 to-orange-600",
    },
  ];

  const stages = [
    { number: "1", title: "חתימות דיירים", icon: "✓" },
    { number: "2", title: "תיאום וניהול", icon: "↔" },
    { number: "3", title: "פינוי", icon: "→" },
    { number: "4", title: "בנייה", icon: "🏗" },
    { number: "5", title: "הכנסה", icon: "🏠" },
  ];

  return (
    <PresentationContainer>
      <div className="space-y-8">
        <div>
          <h2 className="text-4xl font-bold text-foreground mb-2">
            סקירת הפרויקט
          </h2>
          <p className="text-foreground/60">
            המתחם שלנו: מעקה סטטוס וטווח השלבים
          </p>
        </div>

        {/* Project Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {projectStats.map((stat, index) => (
            <div
              key={index}
              className="p-4 rounded-lg bg-card border border-primary/10 hover:border-primary/30 transition-all"
            >
              <div className={`bg-gradient-to-br ${stat.color} p-2 rounded w-fit mb-2`}>
                <div className="text-white font-bold text-lg">{stat.value}</div>
              </div>
              <p className="text-xs font-medium text-primary mb-1">{stat.label}</p>
              <p className="text-xs text-foreground/60">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* Project Stages */}
        <div className="bg-primary/5 rounded-lg p-6 border border-primary/20">
          <h3 className="font-semibold text-foreground mb-4">שלבי הפרויקט</h3>
          <div className="flex justify-between items-center gap-2">
            {stages.map((stage, index) => (
              <div key={index} className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm font-bold">
                    {stage.number}
                  </div>
                </div>
                <p className="text-xs text-center text-foreground/70 font-medium">
                  {stage.title}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Key Info */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/10">
          <div>
            <p className="text-xs text-foreground/60 mb-1">מיקום</p>
            <p className="font-semibold text-foreground">תל אביב, ישראל</p>
          </div>
          <div>
            <p className="text-xs text-foreground/60 mb-1">משך צפוי</p>
            <p className="font-semibold text-foreground">3-4 שנים</p>
          </div>
        </div>
      </div>
    </PresentationContainer>
  );
};
