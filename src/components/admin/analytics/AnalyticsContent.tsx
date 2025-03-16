
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

// Mock data for charts
const generateDailyData = (days: number) => {
  const data = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(today.getDate() - i);
    
    data.push({
      date: date.toISOString().split('T')[0],
      users: Math.floor(Math.random() * 3) + 1,
      visits: Math.floor(Math.random() * 5) + 3
    });
  }
  
  return data;
};

const dateRangeOptions = [
  { label: "Last 7 Days", value: 7 },
  { label: "Last 14 Days", value: 14 },
  { label: "Last 30 Days", value: 30 },
  { label: "Last 90 Days", value: 90 }
];

// Mock user visit data
const topUserData = [
  { email: "realtrade324@gmail.com", visits: 9 },
  { email: "jane.doe@example.com", visits: 4 },
  { email: "john.smith@example.com", visits: 3 }
];

// Mock page visit data
const topPageData = [
  { page: "Dashboard", visits: 8 },
  { page: "Properties", visits: 5 },
  { page: "Wallet", visits: 3 },
  { page: "Performance", visits: 2 }
];

export const AnalyticsContent = () => {
  const [dateRange, setDateRange] = useState(7);
  const [chartData, setChartData] = useState(() => generateDailyData(7));
  
  const handleDateRangeChange = (days: number) => {
    setDateRange(days);
    setChartData(generateDailyData(days));
  };
  
  // Calculate total unique users
  const uniqueUsers = [...new Set(topUserData.map(user => user.email))].length;
  
  // Check if we have enough data for trends
  const hasEnoughData = chartData.length >= 2;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <p className="text-gray-600">Monitor platform usage and user activity</p>
      </div>
      
      <div className="mb-6">
        <div className="flex justify-end mb-4">
          <select
            value={dateRange}
            onChange={(e) => handleDateRangeChange(Number(e.target.value))}
            className="p-2 border border-gray-300 rounded-md text-sm"
          >
            {dateRangeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">Total Unique Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{uniqueUsers}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">Top Users</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {topUserData.map((user, index) => (
                <li key={index} className="flex justify-between items-center text-sm">
                  <span className="truncate">{user.email}</span>
                  <span className="font-medium text-gray-600">{user.visits} visits</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">Top Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {topPageData.map((page, index) => (
                <li key={index} className="flex justify-between items-center text-sm">
                  <span>{page.page}</span>
                  <span className="font-medium text-gray-600">{page.visits} visits</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Unique Users Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {hasEnoughData ? (
              <div className="h-[300px]">
                <ChartContainer config={{ users: { theme: { light: "#4F46E5", dark: "#818CF8" } } }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line 
                        type="monotone" 
                        dataKey="users" 
                        stroke="var(--color-users)" 
                        strokeWidth={2} 
                        dot={{ r: 4 }}
                        name="Unique Users"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            ) : (
              <div className="flex justify-center items-center h-[300px] text-gray-500">
                Not enough data to show trends
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Visits Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {hasEnoughData ? (
              <div className="h-[300px]">
                <ChartContainer config={{ visits: { theme: { light: "#10B981", dark: "#34D399" } } }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line 
                        type="monotone" 
                        dataKey="visits" 
                        stroke="var(--color-visits)" 
                        strokeWidth={2} 
                        dot={{ r: 4 }}
                        name="Total Visits"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            ) : (
              <div className="flex justify-center items-center h-[300px] text-gray-500">
                Not enough data to show trends
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
