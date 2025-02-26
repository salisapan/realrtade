
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, ResponsiveContainer, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const performanceData = [
  { month: "Jan", returns: 4.5 },
  { month: "Feb", returns: 5.2 },
  { month: "Mar", returns: 6.1 },
  { month: "Apr", returns: 5.8 },
  { month: "May", returns: 7.2 },
  { month: "Jun", returns: 8.1 },
];

const Performance = () => {
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-6">Investment Performance</h1>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Returns Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="returns" stroke="#4285F4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Performance;
