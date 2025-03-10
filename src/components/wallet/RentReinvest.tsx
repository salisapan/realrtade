
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowUpRight, RefreshCw, TrendingUp, AlertTriangle, Building, DollarSign, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Demo data for the RentReinvest feature
const rentalIncomeData = [
  { month: 'Jan', income: 1250 },
  { month: 'Feb', income: 1250 },
  { month: 'Mar', income: 1250 },
  { month: 'Apr', income: 1350 },
  { month: 'May', income: 1350 },
  { month: 'Jun', income: 1350 },
  { month: 'Jul', income: 1450 },
  { month: 'Aug', income: 1450 },
  { month: 'Sep', income: 1450 },
  { month: 'Oct', income: 0 },
  { month: 'Nov', income: 0 },
  { month: 'Dec', income: 0 }
];

const reinvestmentHistory = [
  { 
    date: '2023-09-01', 
    amount: 3950, 
    property: 'Riverside Office Park', 
    expectedRoi: 11.2,
    status: 'completed'
  },
  { 
    date: '2023-08-01', 
    amount: 4350, 
    property: 'The Metropolitan Tower', 
    expectedRoi: 10.8,
    status: 'completed'
  },
  { 
    date: '2023-07-01', 
    amount: 4200, 
    property: 'SoHo Business Center', 
    expectedRoi: 12.1,
    status: 'completed'
  }
];

const suggestedProperties = [
  {
    id: 'prop-1',
    name: 'Oakwood Business Park',
    location: 'Chicago, IL',
    type: 'Commercial',
    roi: 11.8,
    match: 95,
    reasons: ['High yield', 'Low vacancy rate', 'Growing location']
  },
  {
    id: 'prop-2',
    name: 'Tech Harbor Offices',
    location: 'Boston, MA',
    type: 'Office',
    roi: 10.5,
    match: 89,
    reasons: ['Strong developer track record', 'Tech hub location', 'Modern amenities']
  },
  {
    id: 'prop-3',
    name: 'Sunset Retail Plaza',
    location: 'San Diego, CA',
    type: 'Retail',
    roi: 9.7,
    match: 82,
    reasons: ['High foot traffic', 'Long-term tenants', 'Growth potential']
  }
];

export const RentReinvest = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isAnimating, setIsAnimating] = useState(false);
  const { toast } = useToast();
  
  const totalRentalIncome = rentalIncomeData.reduce((total, month) => total + month.income, 0);
  const nextReinvestmentDate = new Date();
  nextReinvestmentDate.setMonth(nextReinvestmentDate.getMonth() + 1);
  nextReinvestmentDate.setDate(1);
  
  const handleReinvestToggle = (checked: boolean) => {
    setIsEnabled(checked);
    
    toast({
      title: checked ? "RentReinvest Enabled" : "RentReinvest Disabled",
      description: checked 
        ? "Your rental income will be automatically reinvested each month." 
        : "Automatic reinvestment has been turned off.",
      variant: checked ? "default" : "destructive",
    });
  };
  
  const simulateReinvestment = () => {
    setIsAnimating(true);
    
    setTimeout(() => {
      toast({
        title: "Reinvestment Initiated!",
        description: "Processing $4,250 investment into Oakwood Business Park",
        variant: "default",
      });
      
      setTimeout(() => {
        toast({
          title: "Reinvestment Complete",
          description: "Successfully invested $4,250 into Oakwood Business Park. Expected ROI: 11.8%",
          variant: "success",
        });
        setIsAnimating(false);
      }, 3000);
    }, 1500);
  };
  
  return (
    <Card className="w-full shadow-sm border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">RentReinvest™</CardTitle>
            <CardDescription>Automatically reinvest your rental income into new high-yield properties</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Auto-Reinvest</span>
            <Switch checked={isEnabled} onCheckedChange={handleReinvestToggle} />
          </div>
        </div>
      </CardHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="px-6 border-b">
          <TabsList className="w-full grid grid-cols-3 h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          </TabsList>
        </div>
        
        <CardContent className="p-6">
          <TabsContent value="overview" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-blue-50 border-blue-100">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Total Rental Income (YTD)</h3>
                    <div className="text-2xl font-bold">${totalRentalIncome.toLocaleString()}</div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-green-50 border-green-100">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Next Reinvestment</h3>
                    <div className="text-2xl font-bold">${4250}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Scheduled for {nextReinvestmentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-purple-50 border-purple-100">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Average ROI (Reinvestments)</h3>
                    <div className="text-2xl font-bold">11.3%</div>
                    <div className="text-xs text-green-600 mt-1 flex items-center justify-center">
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                      1.8% higher than portfolio average
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div>
              <h3 className="text-sm font-medium mb-4">Monthly Rental Income</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rentalIncomeData}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${value}`, 'Rental Income']} />
                    <Area type="monotone" dataKey="income" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="flex justify-center">
              <Button 
                onClick={simulateReinvestment} 
                disabled={isAnimating || !isEnabled}
                className={`gap-2 ${isAnimating ? 'animate-pulse' : ''}`}
              >
                {isAnimating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Processing Reinvestment...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Simulate Monthly Reinvestment
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="history" className="mt-0 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <TrendingUp className="text-blue-500 h-5 w-5 mt-0.5" />
                <div>
                  <h3 className="font-medium">Reinvestment Strategy</h3>
                  <p className="text-sm text-gray-600">
                    Each month, your rental income is automatically reinvested into the highest-yield property 
                    that matches your investment criteria. Our algorithm analyzes profitability, location trends, 
                    and risk factors to make optimal selections.
                  </p>
                </div>
              </div>
            </div>
            
            <h3 className="text-sm font-medium mb-2">Reinvestment History</h3>
            <div className="space-y-3">
              {reinvestmentHistory.map((item, index) => (
                <div key={index} className="bg-white border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{item.property}</h4>
                    <span className="text-green-600 font-medium">${item.amount}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Date</div>
                      <div>{new Date(item.date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Expected ROI</div>
                      <div>{item.expectedRoi}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Status</div>
                      <div className="capitalize">{item.status}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="suggestions" className="mt-0 space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-yellow-500 h-5 w-5 mt-0.5" />
                <div>
                  <h3 className="font-medium text-yellow-800">About Suggested Properties</h3>
                  <p className="text-sm text-yellow-700">
                    These properties are algorithmically selected based on your investment history and preferences.
                    While our system aims to find optimal matches, always review the properties before confirming any investment.
                  </p>
                </div>
              </div>
            </div>
            
            <h3 className="text-sm font-medium mb-2">Suggested Properties for Next Reinvestment</h3>
            <div className="space-y-4">
              {suggestedProperties.map((property, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium">{property.name}</h4>
                        <div className="flex items-center text-sm text-gray-500">
                          <Building className="h-3.5 w-3.5 mr-1" />
                          <span>{property.location}</span>
                          <span className="mx-2">•</span>
                          <span>{property.type}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="bg-green-50 text-green-700 font-medium px-2 py-1 rounded text-sm">
                          {property.roi}% ROI
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {property.match}% match
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3 space-y-1">
                      <h5 className="text-xs font-medium text-gray-500">Why this property?</h5>
                      <ul className="text-sm space-y-1">
                        {property.reasons.map((reason, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="mt-4 flex justify-end">
                      <Button size="sm" variant="outline">View Details</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-center mt-6">
              <Button variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh Suggestions
              </Button>
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
      
      <CardFooter className="bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Next reinvestment: {nextReinvestmentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
        <Button variant="ghost" size="sm" className="gap-2">
          <DollarSign className="h-4 w-4" />
          Adjust Settings
        </Button>
      </CardFooter>
    </Card>
  );
};
