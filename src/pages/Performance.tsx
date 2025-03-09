
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
import { useIsMobile } from "@/hooks/use-mobile";

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

// Colors for the pie chart - updated to match app theme
const COLORS = ['#1A2E5A', '#007BFF', '#4A90E2', '#A9A9A9', '#D3D3D3'];

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
  const isMobile = useIsMobile();
  
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AppSidebar />
      <div className="flex-1 bg-gray-50 w-full overflow-x-hidden">
        <div className="container mx-auto px-2 sm:px-4 py-3 md:py-6">
          <div className="flex justify-between items-center mb-4 md:mb-6 flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Investment Performance</h1>
            <div className="space-x-2">
              <Button variant="outline" size="sm">Export PDF</Button>
              <Button variant="outline" size="sm">Print Report</Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-4 md:mb-6">
            {performanceMetrics.map((metric) => (
              <Card key={metric.name} className="overflow-hidden">
                <CardContent className="p-3 md:p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-500">{metric.name}</p>
                      <p className="text-lg md:text-xl font-bold">{metric.value}</p>
                    </div>
                    <div className={`flex items-center ${metric.positive ? 'text-blue-600' : 'text-red-600'}`}>
                      {metric.positive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                      <span className="text-sm font-medium">{metric.change}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <Tabs defaultValue="returns" className="mb-4 md:mb-6">
            <TabsList className="mb-3 md:mb-4 flex overflow-x-auto pb-1 no-scrollbar w-full">
              <TabsTrigger value="returns" className="flex items-center gap-1 whitespace-nowrap flex-1">
                <LineChartIcon className="w-3 h-3 md:w-4 md:h-4" /> Returns
              </TabsTrigger>
              <TabsTrigger value="volume" className="flex items-center gap-1 whitespace-nowrap flex-1">
                <BarChart3 className="w-3 h-3 md:w-4 md:h-4" /> Investment
              </TabsTrigger>
              <TabsTrigger value="allocation" className="flex items-center gap-1 whitespace-nowrap flex-1">
                <PieChartIcon className="w-3 h-3 md:w-4 md:h-4" /> Allocation
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="returns">
              <Card className="overflow-hidden">
                <CardHeader className="p-3 md:p-4">
                  <CardTitle className="text-base md:text-lg">Returns Over Time</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Monthly returns compared to market benchmark</CardDescription>
                </CardHeader>
                <CardContent className="p-1 md:p-4">
                  <div className="h-[250px] md:h-[400px] w-full overflow-hidden investment-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={performanceData} margin={{
                        top: 10,
                        right: 5,
                        left: 0,
                        bottom: 5
                      }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{fontSize: isMobile ? 8 : 12}} />
                        <YAxis tick={{fontSize: isMobile ? 8 : 12}} width={isMobile ? 25 : 35} />
                        <Tooltip 
                          formatter={(value) => [`${value}%`, 'Returns']}
                          labelFormatter={(label) => `Month: ${label}`}
                          contentStyle={{fontSize: isMobile ? 10 : 12}}
                        />
                        <Legend wrapperStyle={{fontSize: isMobile ? 8 : 10, marginBottom: 10}} />
                        <Line 
                          type="monotone" 
                          dataKey="returns" 
                          stroke="#1A2E5A" 
                          name="Your Portfolio" 
                          strokeWidth={2}
                          dot={{ r: isMobile ? 2 : 4 }}
                          activeDot={{ r: isMobile ? 4 : 6 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="benchmark" 
                          stroke="#007BFF" 
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
              <Card className="overflow-hidden">
                <CardHeader className="p-3 md:p-4">
                  <CardTitle className="text-base md:text-lg">Investment Volume</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Monthly investment amounts in USD</CardDescription>
                </CardHeader>
                <CardContent className="p-1 md:p-4">
                  <div className="h-[250px] md:h-[400px] w-full overflow-hidden investment-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={performanceData} margin={{
                        top: 10,
                        right: 5,
                        left: 0,
                        bottom: 5
                      }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{fontSize: isMobile ? 8 : 12}} />
                        <YAxis tick={{fontSize: isMobile ? 8 : 12}} width={isMobile ? 35 : 45} />
                        <Tooltip
                          formatter={(value) => [`$${value.toLocaleString()}`, 'Volume']}
                          labelFormatter={(label) => `Month: ${label}`}
                          contentStyle={{fontSize: isMobile ? 10 : 12}}
                        />
                        <Legend wrapperStyle={{fontSize: isMobile ? 8 : 10, marginBottom: 10}} />
                        <Bar dataKey="volume" fill="#1A2E5A" name="Investment Volume" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="allocation">
              <Card className="overflow-hidden">
                <CardHeader className="p-3 md:p-4">
                  <CardTitle className="text-base md:text-lg">Asset Allocation</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Current portfolio distribution by property type</CardDescription>
                </CardHeader>
                <CardContent className="p-1 md:p-4">
                  <div className="h-[250px] md:h-[400px] w-full overflow-hidden investment-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{
                        top: 0,
                        right: isMobile ? 5 : 30,
                        left: isMobile ? 5 : 30,
                        bottom: 10
                      }}>
                        <Pie
                          data={assetAllocationData}
                          cx="50%"
                          cy="50%"
                          labelLine={!isMobile}
                          outerRadius={isMobile ? 80 : 150}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => isMobile ? null : `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {assetAllocationData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value}%`, 'Allocation']} contentStyle={{fontSize: isMobile ? 10 : 12}} />
                        <Legend wrapperStyle={{fontSize: isMobile ? 8 : 10, marginTop: isMobile ? -10 : 0, marginBottom: 10}} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <Card className="overflow-hidden">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-base md:text-lg">Risk Assessment</CardTitle>
                <CardDescription className="text-xs md:text-sm">Current risk profile analysis</CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-4">
                <div className="space-y-3 md:space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs md:text-sm">Volatility</span>
                    <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: '45%' }}></div>
                    </div>
                    <span className="text-xs md:text-sm font-medium">Low</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs md:text-sm">Liquidity Risk</span>
                    <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-400 h-2 rounded-full" style={{ width: '72%' }}></div>
                    </div>
                    <span className="text-xs md:text-sm font-medium">Medium</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs md:text-sm">Market Risk</span>
                    <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: '38%' }}></div>
                    </div>
                    <span className="text-xs md:text-sm font-medium">Low</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs md:text-sm">Concentration Risk</span>
                    <div className="w-1/2 md:w-2/3 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-800 h-2 rounded-full" style={{ width: '85%' }}></div>
                    </div>
                    <span className="text-xs md:text-sm font-medium">High</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="overflow-hidden">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-base md:text-lg">Forecast</CardTitle>
                <CardDescription className="text-xs md:text-sm">Expected performance for next 12 months</CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-4">
                <div className="space-y-3 md:space-y-4">
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm">Projected Returns</span>
                    <span className="font-bold text-blue-600 text-xs md:text-sm">12.8%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm">Expected Yield</span>
                    <span className="font-bold text-xs md:text-sm">7.3%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm">Growth Potential</span>
                    <span className="font-bold text-blue-600 text-xs md:text-sm">High</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm">Confidence Level</span>
                    <span className="font-bold text-xs md:text-sm">85%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm">Target Cap Rate</span>
                    <span className="font-bold text-xs md:text-sm">6.2%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Performance;
