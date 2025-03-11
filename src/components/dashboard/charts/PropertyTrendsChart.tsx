
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { year: '2019', value: 220000 },
  { year: '2020', value: 235000 },
  { year: '2021', value: 270000 },
  { year: '2022', value: 310000 },
  { year: '2023', value: 325000 },
  { year: '2024', value: 340000 },
];

export const PropertyTrendsChart = () => {
  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg text-gray-800">Property Value Trends (5 Years)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 md:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="year" />
              <YAxis 
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} 
                domain={['dataMin - 10000', 'dataMax + 10000']}
              />
              <Tooltip 
                formatter={(value) => [`$${value.toLocaleString()}`, 'Average Value']}
                labelFormatter={(label) => `Year: ${label}`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: 'white' }}
                activeDot={{ r: 6, className: 'animate-pulse-slow' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
