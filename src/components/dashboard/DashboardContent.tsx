
import { DashboardHeader } from "./DashboardHeader";
import { StatsGrid } from "./StatsGrid";
import { ActivityList } from "./ActivityList";
import { ToolsCard } from "./ToolsCard";
import { PropertyTrendsChart } from "./charts/PropertyTrendsChart";
import { RegionalYieldChart } from "./charts/RegionalYieldChart";
import { OccupancyRateChart } from "./charts/OccupancyRateChart";
import { MarketGrowthChart } from "./charts/MarketGrowthChart";
import { RiskRewardPlot } from "./charts/RiskRewardPlot";
import { HotspotHeatmap } from "./charts/HotspotHeatmap";
import { CashFlowSimulator } from "./charts/CashFlowSimulator";

export const DashboardContent = () => {
  return (
    <div className="flex-1 min-h-screen bg-white p-4 sm:p-6 md:p-8 pb-16 md:pb-8">
      <DashboardHeader />
      <StatsGrid />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <PropertyTrendsChart />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <RegionalYieldChart />
            <OccupancyRateChart />
          </div>
        </div>
        
        <div className="space-y-4 md:space-y-6">
          <ActivityList />
          <ToolsCard />
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
        <MarketGrowthChart />
        <RiskRewardPlot />
        <HotspotHeatmap />
      </div>
      
      <CashFlowSimulator />
    </div>
  );
};
