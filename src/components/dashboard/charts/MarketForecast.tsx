
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
  { month: 'Jan', optimistic: 4200, expected: 4000, conservative: 3800 },
  { month: 'Feb', optimistic: 4300, expected: 4050, conservative: 3820 },
  { month: 'Mar', optimistic: 4500, expected: 4200, conservative: 3900 },
  { month: 'Apr', optimistic: 4700, expected: 4350, conservative: 4000 },
  { month: 'May', optimistic: 4800, expected: 4400, conservative: 4050 },
  { month: 'Jun', optimistic: 5000, expected: 4500, conservative: 4100 },
  { month: 'Jul', optimistic: 5200, expected: 4650, conservative: 4200 },
  { month: 'Aug', optimistic: 5400, expected: 4750, conservative: 4250 },
  { month: 'Sep', optimistic: 5500, expected: 4800, conservative: 4300 },
  { month: 'Oct', optimistic: 5700, expected: 4900, conservative: 4350 },
  { month: 'Nov', optimistic: 5800, expected: 4950, conservative: 4400 },
  { month: 'Dec', optimistic: 6000, expected: 5100, conservative: 4500 },
];

export const MarketForecast = () => {
  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Market Growth Forecast (12 Months)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{
                top: 10,
                right: 30,
                left: 0,
                bottom: 0,
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
              <Area 
                type="monotone" 
                dataKey="optimistic" 
                stroke="#10B981" 
                fill="#10B981" 
                fillOpacity={0.3}
                animationDuration={1500}
              />
              <Area 
                type="monotone" 
                dataKey="expected" 
                stroke="#3B82F6" 
                fill="#3B82F6" 
                fillOpacity={0.3}
                animationDuration={1500}
                animationBegin={300}
              />
              <Area 
                type="monotone" 
                dataKey="conservative" 
                stroke="#A855F7" 
                fill="#A855F7" 
                fillOpacity={0.3}
                animationDuration={1500}
                animationBegin={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
