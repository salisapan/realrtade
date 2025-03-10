
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DeveloperPerformanceProps {
  performanceData: {
    year: string;
    roi: number;
  }[];
}

export const DeveloperPerformance = ({ performanceData }: DeveloperPerformanceProps) => {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4">Historical Performance</h3>
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={performanceData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis unit="%" />
            <Tooltip formatter={(value) => [`${value}%`, 'ROI']} />
            <Area type="monotone" dataKey="roi" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-6 bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Performance Metrics</h4>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Highest Annual ROI</span>
            <span className="font-medium">{Math.max(...performanceData.map(d => d.roi))}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Average Annual ROI</span>
            <span className="font-medium">{(performanceData.reduce((acc, curr) => acc + curr.roi, 0) / performanceData.length).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Profitable Years</span>
            <span className="font-medium">{performanceData.filter(d => d.roi > 0).length} / {performanceData.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
