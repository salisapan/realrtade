
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis } from 'recharts';

const data = [
  { x: 5.2, y: 6.8, z: 120, name: 'Single-Family' },
  { x: 7.1, y: 5.6, z: 200, name: 'Apartments' },
  { x: 8.3, y: 4.7, z: 150, name: 'Commercial' },
  { x: 6.5, y: 7.2, z: 80, name: 'Industrial' },
  { x: 4.2, y: 8.1, z: 100, name: 'Office' },
  { x: 9.1, y: 3.5, z: 60, name: 'Retail' },
];

export const RiskRewardMatrix = () => {
  return (
    <Card className="bg-gray-800/50 backdrop-blur-md border border-gray-700 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <CardHeader>
        <CardTitle className="text-base md:text-lg text-white">Risk vs. Reward Matrix</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{
                top: 20,
                right: 20,
                bottom: 20,
                left: 20,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="Risk" 
                unit="%" 
                tick={{ fill: '#9CA3AF' }}
                label={{ value: 'Risk', position: 'bottom', fill: '#9CA3AF' }}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Return" 
                unit="%" 
                tick={{ fill: '#9CA3AF' }}
                label={{ value: 'Return', angle: -90, position: 'left', fill: '#9CA3AF' }}
              />
              <ZAxis type="number" dataKey="z" range={[60, 200]} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  borderColor: '#374151',
                  color: '#F9FAFB',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value, name) => [name === 'z' ? `$${value}K` : `${value}%`, name === 'z' ? 'Investment Size' : name]}
                itemStyle={{ color: '#F9FAFB' }}
                labelStyle={{ color: '#F9FAFB' }}
              />
              <Legend wrapperStyle={{ color: '#9CA3AF' }} />
              <Scatter 
                name="Property Types" 
                data={data} 
                fill="#3B82F6" 
                line={{ stroke: '#3B82F6', strokeWidth: 1 }}
                shape="circle"
                animationDuration={1500}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
