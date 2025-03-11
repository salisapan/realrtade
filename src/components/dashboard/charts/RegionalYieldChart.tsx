
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
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-gray-900">Rental Yield by Region</CardTitle>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="region" tick={{ fill: '#6B7280' }} />
              <YAxis tick={{ fill: '#6B7280' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFFFF', 
                  borderColor: '#E5E7EB',
                  color: '#111827',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value) => [`${value}%`, 'Yield']}
                itemStyle={{ color: '#111827' }}
                labelStyle={{ color: '#111827' }}
              />
              <Legend wrapperStyle={{ color: '#6B7280' }} />
              <Bar 
                dataKey="yield" 
                fill="#3B82F6" 
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
