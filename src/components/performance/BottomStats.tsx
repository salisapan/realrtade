
import { RiskAssessment } from "./RiskAssessment";
import { ForecastCard } from "./ForecastCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PerformanceReportTable } from "./PerformanceReportTable";

export const BottomStats = () => {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="reports">Detailed Reports</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <RiskAssessment />
          <ForecastCard />
        </div>
      </TabsContent>
      
      <TabsContent value="reports">
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Investment Performance Report</h2>
          <PerformanceReportTable />
        </div>
      </TabsContent>
    </Tabs>
  );
};
