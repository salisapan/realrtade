
import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { MetricDetailsModal } from "@/components/performance/MetricDetailsModal";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformanceMetricsGrid } from "@/components/performance/PerformanceMetricsGrid";
import { PerformanceTabs } from "@/components/performance/PerformanceTabs";
import { BottomStats } from "@/components/performance/BottomStats";

// Data constants
const performanceData = [
  { month: "Jan", returns: 4.5, benchmark: 3.8, volume: 18500 },
  { month: "Feb", returns: 5.2, benchmark: 4.1, volume: 22000 },
  { month: "Mar", returns: 6.1, benchmark: 5.3, volume: 25500 },
  { month: "Apr", returns: 5.8, benchmark: 5.5, volume: 24000 },
  { month: "May", returns: 7.2, benchmark: 6.1, volume: 27500 },
  { month: "Jun", returns: 8.1, benchmark: 6.5, volume: 30000 },
  { month: "Jul", returns: 7.8, benchmark: 6.2, volume: 28500 },
  { month: "Aug", returns: 8.5, benchmark: 6.8, volume: 31000 },
  { month: "Sep", returns: 9.2, benchmark: 7.1, volume: 33500 },
  { month: "Oct", returns: 8.9, benchmark: 7.5, volume: 32000 },
  { month: "Nov", returns: 9.5, benchmark: 7.8, volume: 35000 },
  { month: "Dec", returns: 10.2, benchmark: 8.1, volume: 38000 },
];

const assetAllocationData = [
  { name: "Office", value: 35 },
  { name: "Retail", value: 25 },
  { name: "Industrial", value: 20 },
  { name: "Residential", value: 15 },
  { name: "Data Centers", value: 5 },
];

const COLORS = ['#1A2E5A', '#007BFF', '#4A90E2', '#A9A9A9', '#D3D3D3'];

const getHistoricalData = (metric: string) => {
  return [
    { date: "Jan 2024", value: metric === "Total Return" ? 16.4 : metric === "Annualized ROI" ? 10.9 : 5.5 },
    { date: "Feb 2024", value: metric === "Total Return" ? 17.2 : metric === "Annualized ROI" ? 11.4 : 5.6 },
    { date: "Mar 2024", value: metric === "Total Return" ? 18.7 : metric === "Annualized ROI" ? 12.4 : 5.8 },
  ];
};

const metricDetails = {
  "Total Return": {
    description: "The total return represents the overall gain or loss on an investment over a specific period, including both capital appreciation and income.",
    formula: "Total Return = (Current Value - Initial Value + Distributions) / Initial Value × 100"
  },
  "Annualized ROI": {
    description: "Annualized ROI shows the yearly rate of return, useful for comparing investments held for different periods.",
    formula: "Annualized ROI = (1 + Total Return)^(1/n) - 1, where n is the number of years"
  },
  "Cap Rate": {
    description: "The capitalization rate indicates the potential rate of return on a real estate investment based on its income.",
    formula: "Cap Rate = Net Operating Income / Current Market Value × 100"
  },
  "IRR": {
    description: "Internal Rate of Return (IRR) is the discount rate that makes the net present value of all cash flows equal to zero.",
    formula: "NPV = Σ (Cash Flow) / (1 + IRR)^t = 0, solve for IRR"
  },
  "Cash on Cash": {
    description: "Cash on Cash return measures the cash income earned relative to the cash invested in a property.",
    formula: "Cash on Cash Return = Annual Pre-Tax Cash Flow / Total Cash Investment × 100"
  }
};

const performanceMetrics = [
  { name: "Total Return", value: "18.7%", change: "+2.3%", positive: true },
  { name: "Annualized ROI", value: "12.4%", change: "+1.5%", positive: true },
  { name: "Cap Rate", value: "5.8%", change: "+0.3%", positive: true },
  { name: "IRR", value: "14.2%", change: "-0.5%", positive: false },
  { name: "Cash on Cash", value: "9.6%", change: "+0.8%", positive: true },
  { name: "Debt to Equity", value: "65%", change: "-3%", positive: true },
];

const Performance = () => {
  const [selectedMetric, setSelectedMetric] = useState<any>(null);
  
  const handleMetricClick = (metric: any) => {
    const metricName = metric.name;
    setSelectedMetric({
      name: metricName,
      currentValue: metric.value,
      change: metric.change,
      description: metricDetails[metricName as keyof typeof metricDetails]?.description || "",
      formula: metricDetails[metricName as keyof typeof metricDetails]?.formula || "",
      historicalData: getHistoricalData(metricName)
    });
  };
  
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AppSidebar />
      <div className="flex-1 bg-gray-50 w-full overflow-x-hidden">
        <div className="container mx-auto px-2 sm:px-4 py-3 md:py-6">
          <PerformanceHeader />
          
          <PerformanceMetricsGrid 
            metrics={performanceMetrics} 
            onMetricClick={handleMetricClick} 
          />
          
          <PerformanceTabs 
            performanceData={performanceData}
            assetAllocationData={assetAllocationData}
            colors={COLORS}
          />
          
          <BottomStats />
        </div>
      </div>

      {selectedMetric && (
        <MetricDetailsModal
          open={!!selectedMetric}
          onClose={() => setSelectedMetric(null)}
          metric={selectedMetric}
        />
      )}
    </div>
  );
};

export default Performance;
