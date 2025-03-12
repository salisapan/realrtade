
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

interface VolumeBarChartProps {
  data: Array<{
    month: string;
    volume: number;
    [key: string]: any;
  }>;
}

export const VolumeBarChart = ({ data }: VolumeBarChartProps) => {
  const isMobile = useIsMobile();
  
  return (
    <div className="h-[250px] md:h-[400px] w-full overflow-hidden investment-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{
          top: 10,
          right: 5,
          left: 0,
          bottom: 5
        }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{fontSize: isMobile ? 8 : 12}} />
          <YAxis tick={{fontSize: isMobile ? 8 : 12}} width={isMobile ? 35 : 45} />
          <Tooltip
            formatter={(value) => [`$${value.toLocaleString()}`, 'Volume']}
            labelFormatter={(label) => `Month: ${label}`}
            contentStyle={{fontSize: isMobile ? 10 : 12}}
          />
          <Legend wrapperStyle={{fontSize: isMobile ? 8 : 10, marginBottom: 10}} />
          <Bar dataKey="volume" fill="#1A2E5A" name="Investment Volume" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
