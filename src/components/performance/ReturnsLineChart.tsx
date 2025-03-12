
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

interface ReturnsLineChartProps {
  data: Array<{
    month: string;
    returns: number;
    benchmark: number;
    [key: string]: any;
  }>;
}

export const ReturnsLineChart = ({ data }: ReturnsLineChartProps) => {
  const isMobile = useIsMobile();
  
  return (
    <div className="h-[250px] md:h-[400px] w-full overflow-hidden investment-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{
          top: 10,
          right: 5,
          left: 0,
          bottom: 5
        }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{fontSize: isMobile ? 8 : 12}} />
          <YAxis tick={{fontSize: isMobile ? 8 : 12}} width={isMobile ? 25 : 35} />
          <Tooltip 
            formatter={(value) => [`${value}%`, 'Returns']}
            labelFormatter={(label) => `Month: ${label}`}
            contentStyle={{fontSize: isMobile ? 10 : 12}}
          />
          <Legend wrapperStyle={{fontSize: isMobile ? 8 : 10, marginBottom: 10}} />
          <Line 
            type="monotone" 
            dataKey="returns" 
            stroke="#1A2E5A" 
            name="Your Portfolio" 
            strokeWidth={2}
            dot={{ r: isMobile ? 2 : 4 }}
            activeDot={{ r: isMobile ? 4 : 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="benchmark" 
            stroke="#007BFF" 
            name="Market Benchmark" 
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
