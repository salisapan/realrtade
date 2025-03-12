
import { RiskAssessment } from "./RiskAssessment";
import { ForecastCard } from "./ForecastCard";

export const BottomStats = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      <RiskAssessment />
      <ForecastCard />
    </div>
  );
};
