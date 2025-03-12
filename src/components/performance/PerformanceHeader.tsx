
import { Button } from "@/components/ui/button";

export const PerformanceHeader = () => {
  return (
    <div className="flex justify-between items-center mb-4 md:mb-6 flex-wrap gap-2">
      <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Investment Performance</h1>
      <div className="space-x-2">
        <Button variant="outline" size="sm">Export PDF</Button>
        <Button variant="outline" size="sm">Print Report</Button>
      </div>
    </div>
  );
};
