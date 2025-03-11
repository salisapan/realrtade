
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
  { month: 'Jan', residential: 4000, commercial: 2400, industrial: 2400 },
  { month: 'Feb', residential: 3000, commercial: 1398, industrial: 2210 },
  { month: 'Mar', residential: 2000, commercial: 9800, industrial: 2290 },
  { month: 'Apr', residential: 2780, commercial: 3908, industrial: 2000 },
  { month: 'May', residential: 1890, commercial: 4800, industrial: 2181 },
  { month: 'Jun', residential: 2390, commercial: 3800, industrial: 2500 },
  { month: 'Jul', residential: 3490, commercial: 4300, industrial: 2100 },
  { month: 'Aug', residential: 4000, commercial: 2400, industrial: 2400 },
  { month: 'Sep', residential: 3000, commercial: 1398, industrial: 2210 },
  { month: 'Oct', residential: 2000, commercial: 9800, industrial: 2290 },
  { month: 'Nov', residential: 2780, commercial: 3908, industrial: 2000 },
  { month: 'Dec', residential: 4890, commercial: 4800, industrial: 2181 },
];

export const MarketTrendsChart = () => {
  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Property Value Trends (5 Year)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" tick={{ fill: '#9CA3AF' }} />
              <YAxis tick={{ fill: '#9CA3AF' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  borderColor: '#374151',
                  color: '#F9FAFB',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
                itemStyle={{ color: '#F9FAFB' }}
                labelStyle={{ color: '#F9FAFB' }}
              />
              <Legend wrapperStyle={{ color: '#9CA3AF' }} />
              <Line 
                type="monotone" 
                dataKey="residential" 
                stroke="#3B82F6" 
                activeDot={{ r: 8 }} 
                strokeWidth={2}
                dot={{ stroke: '#3B82F6', strokeWidth: 2, r: 4, strokeDasharray: '' }}
                animationDuration={1500}
              />
              <Line 
                type="monotone" 
                dataKey="commercial" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={{ stroke: '#10B981', strokeWidth: 2, r: 4, strokeDasharray: '' }}
                animationDuration={1500}
                animationBegin={300}
              />
              <Line 
                type="monotone" 
                dataKey="industrial" 
                stroke="#A855F7" 
                strokeWidth={2}
                dot={{ stroke: '#A855F7', strokeWidth: 2, r: 4, strokeDasharray: '' }}
                animationDuration={1500}
                animationBegin={600}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
