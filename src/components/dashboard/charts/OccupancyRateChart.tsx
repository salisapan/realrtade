
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

const data = [
  { name: 'Residential', value: 65 },
  { name: 'Commercial', value: 20 },
  { name: 'Mixed-Use', value: 15 },
];

const COLORS = ['#3b82f6', '#60a5fa', '#93c5fd'];

export const OccupancyRateChart = () => {
  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg text-gray-800">Occupancy by Property Type</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-52 md:h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                className="hover:opacity-90 transition-opacity duration-300"
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]} 
                    className="hover:opacity-80 transition-opacity duration-300"
                  />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [`${value}%`, 'Occupancy Rate']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
