
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
  { region: 'East', yield: 7.5 },
  { region: 'West', yield: 8.2 },
  { region: 'North', yield: 5.8 },
  { region: 'South', yield: 9.1 },
  { region: 'Central', yield: 6.4 },
];

export const RegionalYieldChart = () => {
  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Rental Yield by Region</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="region" tick={{ fill: '#9CA3AF' }} />
              <YAxis tick={{ fill: '#9CA3AF' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  borderColor: '#374151',
                  color: '#F9FAFB',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value) => [`${value}%`, 'Yield']}
                itemStyle={{ color: '#F9FAFB' }}
                labelStyle={{ color: '#F9FAFB' }}
              />
              <Legend wrapperStyle={{ color: '#9CA3AF' }} />
              <Bar 
                dataKey="yield" 
                fill="#10B981" 
                radius={[4, 4, 0, 0]}
                animationDuration={1500}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
