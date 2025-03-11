
import { DashboardHeader } from "./DashboardHeader";
import { StatsGrid } from "./StatsGrid";
import { ActivityList } from "./ActivityList";
import { ToolsCard } from "./ToolsCard";
import { DashboardRecommendations } from "@/components/recommendations/DashboardRecommendations";

export const DashboardContent = () => {
  return (
    <div className="flex-1 min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8 pb-16 md:pb-8">
      <DashboardHeader />
      <StatsGrid />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
        <ActivityList />
        
        <div className="space-y-4 md:space-y-6">
          <DashboardRecommendations />
          <ToolsCard />
        </div>
      </div>
    </div>
  );
};
