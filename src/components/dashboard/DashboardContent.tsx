
import { DashboardHeader } from "./DashboardHeader";
import { StatsGrid } from "./StatsGrid";
import { ActivityList } from "./ActivityList";
import { ToolsCard } from "./ToolsCard";
import { MarketTrendsChart } from "./charts/MarketTrendsChart";
import { RegionalYieldChart } from "./charts/RegionalYieldChart";
import { PropertyTypeDistribution } from "./charts/PropertyTypeDistribution";
import { MarketForecast } from "./charts/MarketForecast";
import { HotspotHeatmap } from "./charts/HotspotHeatmap";
import { RiskRewardMatrix } from "./charts/RiskRewardMatrix";
import { CashFlowSimulator } from "./charts/CashFlowSimulator";

export const DashboardContent = () => {
  return (
    <div className="flex-1 min-h-screen bg-white text-gray-900 p-4 sm:p-6 md:p-8 pb-16 md:pb-8">
      <DashboardHeader />
      <StatsGrid />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <MarketTrendsChart />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <RegionalYieldChart />
            <PropertyTypeDistribution />
          </div>
          <MarketForecast />
        </div>
        
        <div className="space-y-4 md:space-y-6">
          <ActivityList />
          <ToolsCard />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <HotspotHeatmap />
        <RiskRewardMatrix />
        <CashFlowSimulator />
      </div>
    </div>
  );
};
