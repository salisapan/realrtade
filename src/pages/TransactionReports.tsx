
import { useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Home, 
  FileText, 
  Download, 
  BarChart, 
  PieChart, 
  Calendar, 
  AlertCircle,
  Printer,
  Check
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as RechartsBarChart, Bar, Legend, PieChart as RechartsPieChart, Pie, Cell } from "recharts";

const TransactionReports = () => {
  const [activeTab, setActiveTab] = useState("financial");
  const [dateRange, setDateRange] = useState("last-6-months");
  
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28BFF'];
  
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-10 mr-4 rounded-lg" 
                />
                <h1 className="text-2xl font-bold text-gray-900">Transaction Reports</h1>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Home className="w-4 h-4" />
                    Home
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Reports & Analytics</h2>
            
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center">
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Select date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last-month">Last Month</SelectItem>
                    <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                    <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                    <SelectItem value="last-year">Last Year</SelectItem>
                    <SelectItem value="all-time">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Download className="w-4 h-4" />
                Export
              </Button>
              
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Printer className="w-4 h-4" />
                Print
              </Button>
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-8 grid w-full grid-cols-1 sm:grid-cols-3">
              <TabsTrigger value="financial" className="flex items-center gap-2">
                <BarChart size={18} />
                Financial Performance
              </TabsTrigger>
              <TabsTrigger value="investor" className="flex items-center gap-2">
                <PieChart size={18} />
                Investor Metrics
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-2">
                <FileText size={18} />
                Document Repository
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="financial">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Funding</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">$13.5M</div>
                      <p className="text-xs text-muted-foreground">
                        +24.5% from previous period
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Average ROI</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">15.8%</div>
                      <p className="text-xs text-muted-foreground">
                        +2.3% from previous period
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Properties Funded</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">7</div>
                      <p className="text-xs text-muted-foreground">
                        +3 from previous period
                      </p>
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Funding Growth</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={fundingData}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Area 
                            type="monotone" 
                            dataKey="funding" 
                            stroke="#8884d8" 
                            fill="#8884d8" 
                            fillOpacity={0.3}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Property Performance by Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart
                          data={propertyPerformanceData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="actual" fill="#8884d8" name="Actual ROI %" />
                          <Bar dataKey="projected" fill="#82ca9d" name="Projected ROI %" />
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="investor">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Investors</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">247</div>
                      <p className="text-xs text-muted-foreground">
                        +42 from previous period
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Average Investment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">$54,656</div>
                      <p className="text-xs text-muted-foreground">
                        +$7,823 from previous period
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Investor Retention</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">92%</div>
                      <p className="text-xs text-muted-foreground">
                        +4% from previous period
                      </p>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Investor Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={investorDistributionData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            >
                              {investorDistributionData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Investment by Property Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={investmentByTypeData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            >
                              {investmentByTypeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <CardTitle>Document Repository</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <div>
                          <p className="font-medium">Financial Performance Report</p>
                          <p className="text-sm text-gray-500">Q2 2023 Summary</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <div>
                          <p className="font-medium">Investor Portfolio Analysis</p>
                          <p className="text-sm text-gray-500">June 2023</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <div>
                          <p className="font-medium">Market Trend Analysis</p>
                          <p className="text-sm text-gray-500">Q2 2023</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <div>
                          <p className="font-medium">Deal Flow Report</p>
                          <p className="text-sm text-gray-500">Q2 2023</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <div>
                          <p className="font-medium">Regulatory Compliance Report</p>
                          <p className="text-sm text-gray-500">2023</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <div>
                          <p className="font-medium">Tax Documentation Package</p>
                          <p className="text-sm text-gray-500">2023</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

// Sample data
const fundingData = [
  { month: 'Jan', funding: 2100000 },
  { month: 'Feb', funding: 3200000 },
  { month: 'Mar', funding: 3800000 },
  { month: 'Apr', funding: 4500000 },
  { month: 'May', funding: 5700000 },
  { month: 'Jun', funding: 7200000 },
  { month: 'Jul', funding: 8900000 },
  { month: 'Aug', funding: 10500000 },
  { month: 'Sep', funding: 11800000 },
  { month: 'Oct', funding: 12700000 },
  { month: 'Nov', funding: 13200000 },
  { month: 'Dec', funding: 13500000 },
];

const propertyPerformanceData = [
  { name: 'Office Complex A', actual: 12.8, projected: 11.5 },
  { name: 'Retail Plaza B', actual: 9.5, projected: 10.2 },
  { name: 'Apartments C', actual: 15.6, projected: 13.8 },
  { name: 'Industrial Park D', actual: 16.2, projected: 14.5 },
  { name: 'Mixed-Use E', actual: 13.7, projected: 12.9 },
];

const investorDistributionData = [
  { name: 'Institutional', value: 45 },
  { name: 'Accredited', value: 30 },
  { name: 'Family Offices', value: 15 },
  { name: 'REITs', value: 10 },
];

const investmentByTypeData = [
  { name: 'Commercial', value: 40 },
  { name: 'Residential', value: 25 },
  { name: 'Retail', value: 15 },
  { name: 'Industrial', value: 12 },
  { name: 'Mixed-Use', value: 8 },
];

export default TransactionReports;
