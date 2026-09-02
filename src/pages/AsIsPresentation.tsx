import { useState, useEffect } from "react";
import { TitleSlide } from "@/components/presentation/slides/TitleSlide";
import { TimelineSlide } from "@/components/presentation/slides/TimelineSlide";
import { ProjectOverviewSlide } from "@/components/presentation/slides/ProjectOverviewSlide";
import { ResponsibilitiesSlide } from "@/components/presentation/slides/ResponsibilitiesSlide";
import { CorrespondenceSlide } from "@/components/presentation/slides/CorrespondenceSlide";
import { WhyAsIsSlide } from "@/components/presentation/slides/WhyAsIsSlide";
import { ContactSlide } from "@/components/presentation/slides/ContactSlide";
import { SlideNavigation } from "@/components/presentation/SlideNavigation";

const SLIDES = [
  TitleSlide,
  TimelineSlide,
  ProjectOverviewSlide,
  ResponsibilitiesSlide,
  CorrespondenceSlide,
  WhyAsIsSlide,
  ContactSlide,
];

export default function AsIsPresentation() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const CurrentSlide = SLIDES[currentSlide];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        handlePrev();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        handleNext();
      } else if (e.key === "f" || e.key === "F") {
        handleToggleFullscreen();
      } else if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide]);

  // Fullscreen API
  useEffect(() => {
    if (isFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.log("Fullscreen request failed:", err);
      });
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`min-h-screen transition-all duration-300 ${isFullscreen ? "bg-black" : "bg-background"}`}>
      <div className={`${isFullscreen ? "p-0" : "p-4 md:p-8"}`}>
        <div className={isFullscreen ? "" : "space-y-6"}>
          {/* Presentation Slide */}
          <CurrentSlide />

          {/* Navigation - Hide in fullscreen */}
          {!isFullscreen && (
            <div className="mt-6">
              <SlideNavigation
                currentSlide={currentSlide}
                totalSlides={SLIDES.length}
                onPrev={handlePrev}
                onNext={handleNext}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
              />
            </div>
          )}

          {/* Fullscreen Navigation */}
          {isFullscreen && (
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
              <SlideNavigation
                currentSlide={currentSlide}
                totalSlides={SLIDES.length}
                onPrev={handlePrev}
                onNext={handleNext}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
              />
            </div>
          )}
        </div>
      </div>

      {/* Keyboard hints */}
      {!isFullscreen && (
        <div className="fixed bottom-4 right-4 text-xs text-foreground/40 text-right max-w-xs">
          <p>⌨️ ← → (מקלדת) | F (מלא מסך) | ESC (יציאה)</p>
        </div>
      )}
    </div>
  );
}
