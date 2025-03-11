
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Residential', value: 65 },
  { name: 'Commercial', value: 25 },
  { name: 'Industrial', value: 10 },
];

const COLORS = ['#3B82F6', '#10B981', '#A855F7'];

export const PropertyTypeDistribution = () => {
  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Occupancy by Property Type</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                innerRadius={40}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                animationDuration={1500}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  borderColor: '#374151',
                  color: '#F9FAFB',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value) => [`${value}%`, 'Occupancy Rate']}
                itemStyle={{ color: '#F9FAFB' }}
                labelStyle={{ color: '#F9FAFB' }}
              />
              <Legend 
                layout="horizontal" 
                verticalAlign="bottom" 
                align="center"
                wrapperStyle={{ color: '#9CA3AF' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
