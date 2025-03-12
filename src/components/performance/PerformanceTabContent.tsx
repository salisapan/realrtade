
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ReturnsLineChart } from "./ReturnsLineChart";
import { VolumeBarChart } from "./VolumeBarChart";
import { AssetAllocationPieChart } from "./AssetAllocationPieChart";

interface TabContentProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

const TabContent = ({ title, description, children }: TabContentProps) => {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 md:p-4">
        <CardTitle className="text-base md:text-lg">{title}</CardTitle>
        <CardDescription className="text-xs md:text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-1 md:p-4">
        {children}
      </CardContent>
    </Card>
  );
};

interface ChartTabsContentProps {
  performanceData: any[];
  assetAllocationData: any[];
  colors: string[];
}

export const ReturnsTabContent = ({ performanceData }: { performanceData: any[] }) => {
  return (
    <TabContent 
      title="Returns Over Time" 
      description="Monthly returns compared to market benchmark"
    >
      <ReturnsLineChart data={performanceData} />
    </TabContent>
  );
};

export const VolumeTabContent = ({ performanceData }: { performanceData: any[] }) => {
  return (
    <TabContent 
      title="Investment Volume" 
      description="Monthly investment amounts in USD"
    >
      <VolumeBarChart data={performanceData} />
    </TabContent>
  );
};

export const AllocationTabContent = ({ 
  assetAllocationData,
  colors
}: { 
  assetAllocationData: any[],
  colors: string[]
}) => {
  return (
    <TabContent 
      title="Asset Allocation"
      description="Current portfolio distribution by property type"
    >
      <AssetAllocationPieChart data={assetAllocationData} colors={colors} />
    </TabContent>
  );
};
