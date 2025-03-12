
import { PerformanceMetricCard } from "./PerformanceMetricCard";

interface PerformanceMetric {
  name: string;
  value: string;
  change: string;
  positive: boolean;
}

interface PerformanceMetricsGridProps {
  metrics: PerformanceMetric[];
  onMetricClick: (metric: PerformanceMetric) => void;
}

export const PerformanceMetricsGrid = ({ metrics, onMetricClick }: PerformanceMetricsGridProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-4 md:mb-6">
      {metrics.map((metric) => (
        <PerformanceMetricCard 
          key={metric.name}
          name={metric.name}
          value={metric.value}
          change={metric.change}
          positive={metric.positive}
          onClick={() => onMetricClick(metric)}
        />
      ))}
    </div>
  );
};
