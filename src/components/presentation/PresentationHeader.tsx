export const PresentationHeader = () => {
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-primary/20">
      <div className="flex items-center gap-3">
        <img
          src="/as-is-logo.jpeg"
          alt="AS IS Group"
          className="h-12 w-12 object-contain"
        />
        <div>
          <h1 className="font-bold text-foreground">AS IS GROUP</h1>
          <p className="text-xs text-foreground/60">
            מנהלת התחדשות עירונית
          </p>
        </div>
      </div>
      <div className="text-right text-xs text-foreground/50">
        <p>נגבה - בר כוכבא</p>
      </div>
    </div>
  );
};
