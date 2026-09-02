import { ReactNode } from "react";

interface PresentationContainerProps {
  children: ReactNode;
  className?: string;
}

export const PresentationContainer = ({
  children,
  className = "",
}: PresentationContainerProps) => {
  return (
    <div
      className={`min-h-screen w-full bg-gradient-to-br from-background via-card to-background/50 flex items-center justify-center p-4 md:p-8 ${className}`}
    >
      <div className="w-full max-w-5xl">
        <div className="bg-card/50 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-2xl p-8 md:p-12 min-h-[600px] flex flex-col justify-between animate-fade-in">
          {children}
        </div>
      </div>
    </div>
  );
};
