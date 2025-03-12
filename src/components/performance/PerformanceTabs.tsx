
import { TabsContent, TabsList, TabsTrigger, Tabs } from "@/components/ui/tabs";
import { LineChart as LineChartIcon, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { ReturnsTabContent, VolumeTabContent, AllocationTabContent } from "./PerformanceTabContent";

interface PerformanceTabsProps {
  performanceData: any[];
  assetAllocationData: any[];
  colors: string[];
}

export const PerformanceTabs = ({ 
  performanceData,
  assetAllocationData,
  colors
}: PerformanceTabsProps) => {
  return (
    <Tabs defaultValue="returns" className="mb-4 md:mb-6">
      <TabsList className="mb-3 md:mb-4 flex overflow-x-auto pb-1 no-scrollbar w-full">
        <TabsTrigger value="returns" className="flex items-center gap-1 whitespace-nowrap flex-1">
          <LineChartIcon className="w-3 h-3 md:w-4 md:h-4" /> Returns
        </TabsTrigger>
        <TabsTrigger value="volume" className="flex items-center gap-1 whitespace-nowrap flex-1">
          <BarChart3 className="w-3 h-3 md:w-4 md:h-4" /> Investment
        </TabsTrigger>
        <TabsTrigger value="allocation" className="flex items-center gap-1 whitespace-nowrap flex-1">
          <PieChartIcon className="w-3 h-3 md:w-4 md:h-4" /> Allocation
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="returns">
        <ReturnsTabContent performanceData={performanceData} />
      </TabsContent>
      
      <TabsContent value="volume">
        <VolumeTabContent performanceData={performanceData} />
      </TabsContent>
      
      <TabsContent value="allocation">
        <AllocationTabContent 
          assetAllocationData={assetAllocationData}
          colors={colors}
        />
      </TabsContent>
    </Tabs>
  );
};
