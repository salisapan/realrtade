import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SlideNavigationProps {
  currentSlide: number;
  totalSlides: number;
  onPrev: () => void;
  onNext: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const SlideNavigation = ({
  currentSlide,
  totalSlides,
  onPrev,
  onNext,
  isFullscreen,
  onToggleFullscreen,
}: SlideNavigationProps) => {
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg border border-primary/10 backdrop-blur-sm">
      <Button
        variant="outline"
        size="icon"
        onClick={onPrev}
        disabled={currentSlide === 0}
        className="hover:bg-primary/10"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {currentSlide + 1} / {totalSlides}
        </span>
        <div className="w-32 h-1 bg-secondary/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
            style={{
              width: `${((currentSlide + 1) / totalSlides) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleFullscreen}
          className="hover:bg-primary/10"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={currentSlide === totalSlides - 1}
          className="hover:bg-primary/10"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
