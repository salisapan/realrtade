
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";

const data = [
  { name: 'Single Family', risk: 3.2, reward: 5.8, size: 120 },
  { name: 'Apartments', risk: 4.5, reward: 7.2, size: 150 },
  { name: 'Office Space', risk: 6.8, reward: 8.5, size: 90 },
  { name: 'Retail', risk: 7.2, reward: 9.1, size: 80 },
  { name: 'Industrial', risk: 5.1, reward: 7.8, size: 110 },
  { name: 'Vacation Rental', risk: 8.4, reward: 12.2, size: 70 },
];

export const RiskRewardPlot = () => {
  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg text-gray-800">Risk vs. Reward Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                type="number" 
                dataKey="risk" 
                name="Risk" 
                unit="%" 
                domain={[0, 10]}
                label={{ 
                  value: 'Risk', 
                  position: 'bottom', 
                  offset: 0,
                  style: { textAnchor: 'middle' }
                }} 
              />
              <YAxis 
                type="number" 
                dataKey="reward" 
                name="Reward" 
                unit="%" 
                domain={[0, 15]}
                label={{ 
                  value: 'Reward', 
                  angle: -90, 
                  position: 'left',
                  style: { textAnchor: 'middle' }
                }} 
              />
              <ZAxis dataKey="size" range={[60, 400]} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value, name) => [`${value}%`, name]}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white p-2 border border-gray-200 rounded-md shadow-sm">
                        <p className="font-medium text-sm">{payload[0].payload.name}</p>
                        <p className="text-xs">Risk: {payload[0].value}%</p>
                        <p className="text-xs">Reward: {payload[1].value}%</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter 
                name="Property Types" 
                data={data} 
                fill="#3b82f6" 
                fillOpacity={0.6}
                strokeWidth={1}
                stroke="#1d4ed8"
                className="hover:opacity-80 transition-opacity duration-300"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
