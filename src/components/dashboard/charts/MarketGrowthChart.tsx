
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { month: 'Jan', growth: 2.4 },
  { month: 'Feb', growth: 2.8 },
  { month: 'Mar', growth: 3.1 },
  { month: 'Apr', growth: 3.5 },
  { month: 'May', growth: 4.2 },
  { month: 'Jun', growth: 4.8 },
  { month: 'Jul', growth: 5.1 },
  { month: 'Aug', growth: 5.6 },
  { month: 'Sep', growth: 6.2 },
  { month: 'Oct', growth: 6.8 },
  { month: 'Nov', growth: 7.1 },
  { month: 'Dec', growth: 7.5 },
];

export const MarketGrowthChart = () => {
  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg text-gray-800">Market Growth Forecast (12 Months)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip 
                formatter={(value) => [`${value}%`, 'Projected Growth']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="growth" 
                stroke="#3b82f6" 
                fill="url(#colorGrowth)" 
                fillOpacity={0.3}
                className="hover:opacity-80 transition-opacity duration-300"
              />
              <defs>
                <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
