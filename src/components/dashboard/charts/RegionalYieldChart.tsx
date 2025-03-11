
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { region: 'NYC', yield: 4.2 },
  { region: 'LA', yield: 3.8 },
  { region: 'Miami', yield: 5.1 },
  { region: 'Chicago', yield: 6.2 },
  { region: 'Austin', yield: 5.7 },
];

export const RegionalYieldChart = () => {
  return (
    <Card className="hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg text-gray-800">Rental Yield by Region</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-52 md:h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="region" />
              <YAxis tickFormatter={(value) => `${value}%`} domain={[0, 'dataMax + 1']} />
              <Tooltip 
                formatter={(value) => [`${value}%`, 'Rental Yield']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}
              />
              <Bar 
                dataKey="yield" 
                fill="#60a5fa" 
                radius={[4, 4, 0, 0]} 
                className="hover:opacity-80 transition-opacity duration-300"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
