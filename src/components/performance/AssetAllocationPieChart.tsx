
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

interface AssetAllocationPieChartProps {
  data: Array<{
    name: string;
    value: number;
  }>;
  colors: string[];
}

export const AssetAllocationPieChart = ({ data, colors }: AssetAllocationPieChartProps) => {
  const isMobile = useIsMobile();
  
  return (
    <div className="h-[250px] md:h-[400px] w-full overflow-hidden investment-chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{
          top: 0,
          right: isMobile ? 5 : 30,
          left: isMobile ? 5 : 30,
          bottom: 10
        }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={!isMobile}
            outerRadius={isMobile ? 80 : 150}
            fill="#8884d8"
            dataKey="value"
            label={({ name, percent }) => isMobile ? null : `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [`${value}%`, 'Allocation']} contentStyle={{fontSize: isMobile ? 10 : 12}} />
          <Legend wrapperStyle={{fontSize: isMobile ? 8 : 10, marginTop: isMobile ? -10 : 0, marginBottom: 10}} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
