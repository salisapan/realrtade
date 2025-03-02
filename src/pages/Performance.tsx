
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LineChart, 
  ResponsiveContainer, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { Button } from "@/components/ui/button";
import { BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";

// Extended performance data for more months
const performanceData = [
  { month: "Jan", returns: 4.5, benchmark: 3.8, volume: 18500 },
  { month: "Feb", returns: 5.2, benchmark: 4.1, volume: 22000 },
  { month: "Mar", returns: 6.1, benchmark: 5.3, volume: 25500 },
  { month: "Apr", returns: 5.8, benchmark: 5.5, volume: 24000 },
  { month: "May", returns: 7.2, benchmark: 6.1, volume: 27500 },
  { month: "Jun", returns: 8.1, benchmark: 6.5, volume: 30000 },
  { month: "Jul", returns: 7.8, benchmark: 6.2, volume: 28500 },
  { month: "Aug", returns: 8.5, benchmark: 6.8, volume: 31000 },
  { month: "Sep", returns: 9.2, benchmark: 7.1, volume: 33500 },
  { month: "Oct", returns: 8.9, benchmark: 7.5, volume: 32000 },
  { month: "Nov", returns: 9.5, benchmark: 7.8, volume: 35000 },
  { month: "Dec", returns: 10.2, benchmark: 8.1, volume: 38000 },
];

// Asset allocation data
const assetAllocationData = [
  { name: "Office", value: 35 },
  { name: "Retail", value: 25 },
  { name: "Industrial", value: 20 },
  { name: "Residential", value: 15 },
  { name: "Data Centers", value: 5 },
];

// Colors for the pie chart
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

// Key performance metrics
const performanceMetrics = [
  { name: "Total Return", value: "18.7%", change: "+2.3%", positive: true },
  { name: "Annualized ROI", value: "12.4%", change: "+1.5%", positive: true },
  { name: "Cap Rate", value: "5.8%", change: "+0.3%", positive: true },
  { name: "IRR", value: "14.2%", change: "-0.5%", positive: false },
  { name: "Cash on Cash", value: "9.6%", change: "+0.8%", positive: true },
  { name: "Debt to Equity", value: "65%", change: "-3%", positive: true },
];

const Performance = () => {
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Investment Performance</h1>
          <div className="space-x-2">
            <Button variant="outline" size="sm">Export PDF</Button>
            <Button variant="outline" size="sm">Print Report</Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {performanceMetrics.map((metric) => (
            <Card key={metric.name}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500">{metric.name}</p>
                    <p className="text-2xl font-bold">{metric.value}</p>
                  </div>
                  <div className={`flex items-center ${metric.positive ? 'text-green-600' : 'text-red-600'}`}>
                    {metric.positive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                    <span className="text-sm font-medium">{metric.change}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Tabs defaultValue="returns" className="mb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="returns" className="flex items-center gap-2">
              <LineChartIcon className="w-4 h-4" /> Returns
            </TabsTrigger>
            <TabsTrigger value="volume" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Investment Volume
            </TabsTrigger>
            <TabsTrigger value="allocation" className="flex items-center gap-2">
              <PieChartIcon className="w-4 h-4" /> Asset Allocation
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="returns">
            <Card>
              <CardHeader>
                <CardTitle>Returns Over Time</CardTitle>
                <CardDescription>Monthly returns compared to market benchmark</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip 
                        formatter={(value) => [`${value}%`, 'Returns']}
                        labelFormatter={(label) => `Month: ${label}`}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="returns" 
                        stroke="#4285F4" 
                        name="Your Portfolio" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="benchmark" 
                        stroke="#34A853" 
                        name="Market Benchmark" 
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="volume">
            <Card>
              <CardHeader>
                <CardTitle>Investment Volume</CardTitle>
                <CardDescription>Monthly investment amounts in USD</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip
                        formatter={(value) => [`$${value.toLocaleString()}`, 'Volume']}
                        labelFormatter={(label) => `Month: ${label}`}
                      />
                      <Bar dataKey="volume" fill="#8884d8" name="Investment Volume" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="allocation">
            <Card>
              <CardHeader>
                <CardTitle>Asset Allocation</CardTitle>
                <CardDescription>Current portfolio distribution by property type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={assetAllocationData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={150}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {assetAllocationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value}%`, 'Allocation']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Risk Assessment</CardTitle>
              <CardDescription>Current risk profile analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>Volatility</span>
                  <div className="w-2/3 bg-gray-200 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                  <span className="font-medium">Low</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Liquidity Risk</span>
                  <div className="w-2/3 bg-gray-200 rounded-full h-2.5">
                    <div className="bg-yellow-500 h-2.5 rounded-full" style={{ width: '72%' }}></div>
                  </div>
                  <span className="font-medium">Medium</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Market Risk</span>
                  <div className="w-2/3 bg-gray-200 rounded-full h-2.5">
                    <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '38%' }}></div>
                  </div>
                  <span className="font-medium">Low</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Concentration Risk</span>
                  <div className="w-2/3 bg-gray-200 rounded-full h-2.5">
                    <div className="bg-red-500 h-2.5 rounded-full" style={{ width: '85%' }}></div>
                  </div>
                  <span className="font-medium">High</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Forecast</CardTitle>
              <CardDescription>Expected performance for next 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span>Projected Returns</span>
                  <span className="font-bold text-green-600">12.8%</span>
                </div>
                <div className="flex justify-between">
                  <span>Expected Yield</span>
                  <span className="font-bold">7.3%</span>
                </div>
                <div className="flex justify-between">
                  <span>Growth Potential</span>
                  <span className="font-bold text-green-600">High</span>
                </div>
                <div className="flex justify-between">
                  <span>Confidence Level</span>
                  <span className="font-bold">85%</span>
                </div>
                <div className="flex justify-between">
                  <span>Target Cap Rate</span>
                  <span className="font-bold">6.2%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Performance;
