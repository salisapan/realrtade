
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Home, 
  MapPin, 
  Building, 
  DollarSign, 
  Users, 
  ArrowRight, 
  CalendarDays, 
  Clock, 
  BarChart, 
  FileText,
  Check
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const PropertyDetail = () => {
  const { id } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Simulate loading property data
    setTimeout(() => {
      // Find property by ID
      const foundProperty = sampleProperties.find(p => p.id === id);
      setProperty(foundProperty || null);
      setLoading(false);
    }, 500);
  }, [id]);
  
  if (loading) {
    return (
      <div className="flex">
        <AppSidebar />
        <div className="flex-1 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-4 text-lg">Loading property details...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (!property) {
    return (
      <div className="flex">
        <AppSidebar />
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen">
          <h1 className="text-4xl font-bold mb-4">Oops! Property not found</h1>
          <p className="text-lg mb-8">We couldn't find the property you're looking for.</p>
          <Link to="/properties">
            <Button>
              Return to Properties
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-10 mr-4 rounded-lg" 
                />
                <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Home className="w-4 h-4" />
                    Home
                  </Button>
                </Link>
                <Link to="/properties">
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Building className="w-4 h-4" />
                    Properties
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="rounded-xl overflow-hidden bg-white shadow-sm">
                <img 
                  src={property.image} 
                  alt={property.name} 
                  className="w-full h-[400px] object-cover" 
                />
                
                <div className="p-6">
                  <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                    <div>
                      <h2 className="text-2xl font-bold">{property.name}</h2>
                      <div className="flex items-center text-gray-500 mt-1">
                        <MapPin className="w-4 h-4 mr-1" />
                        <span>{property.location}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-bold text-primary">${property.price.toLocaleString()}</span>
                      <Badge className="mt-1">{property.type}</Badge>
                    </div>
                  </div>
                  
                  <p className="text-gray-700 mb-6">{property.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-gray-500 text-sm mb-1">Target ROI</div>
                      <div className="text-xl font-bold">{property.roi}%</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-gray-500 text-sm mb-1">Term Length</div>
                      <div className="text-xl font-bold">{property.term} years</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-gray-500 text-sm mb-1">Min Investment</div>
                      <div className="text-xl font-bold">${property.minInvestment.toLocaleString()}</div>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Funding Progress</span>
                      <span className="text-sm font-medium">{property.fundingProgress}%</span>
                    </div>
                    <Progress value={property.fundingProgress} className="h-2" />
                    <div className="flex justify-between text-sm text-gray-500 mt-2">
                      <span>${property.currentFunding.toLocaleString()} raised</span>
                      <span>Goal: ${property.fundingGoal.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="flex items-center text-gray-500 text-sm">
                      <Users className="w-4 h-4 mr-1" />
                      <span>{property.investors} investors</span>
                      <Clock className="w-4 h-4 ml-4 mr-1" />
                      <span>{property.daysLeft} days left</span>
                    </div>
                    
                    <Button className="flex items-center gap-1">
                      Invest Now <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Investment Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="projections">
                    <TabsList className="mb-4">
                      <TabsTrigger value="projections">Financial Projections</TabsTrigger>
                      <TabsTrigger value="roi">ROI Analysis</TabsTrigger>
                      <TabsTrigger value="comparison">Market Comparison</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="projections">
                      <h3 className="text-lg font-medium mb-4">5-Year Cash Flow Projections</h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={cashFlowData}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis />
                            <Tooltip />
                            <Area 
                              type="monotone" 
                              dataKey="cashFlow" 
                              stroke="#8884d8" 
                              fill="#8884d8" 
                              fillOpacity={0.3}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="mt-8">
                        <h3 className="text-lg font-medium mb-4">Revenue Breakdown</h3>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart
                              data={revenueBreakdownData}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="value" fill="#8884d8" />
                            </RechartsBarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="roi">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h3 className="text-lg font-medium mb-4">ROI Components</h3>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={roiComponentsData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  outerRadius={80}
                                  fill="#8884d8"
                                  dataKey="value"
                                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                >
                                  {roiComponentsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        
                        <div>
                          <h3 className="text-lg font-medium mb-4">ROI Comparison</h3>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <RechartsBarChart
                                data={roiComparisonData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="value" fill="#82ca9d" />
                              </RechartsBarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-8">
                        <h3 className="text-lg font-medium mb-4">Annual ROI Projection</h3>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={annualRoiData}
                              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="year" />
                              <YAxis />
                              <Tooltip />
                              <Area 
                                type="monotone" 
                                dataKey="roi" 
                                stroke="#82ca9d" 
                                fill="#82ca9d" 
                                fillOpacity={0.3}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="comparison">
                      <h3 className="text-lg font-medium mb-4">Market Performance Comparison</h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart
                            data={marketComparisonData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="roi" fill="#8884d8" name="ROI %" />
                            <Bar dataKey="market" fill="#82ca9d" name="Market Average %" />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="mt-8">
                        <h3 className="text-lg font-medium mb-4">Risk-Return Profile</h3>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart
                              data={riskReturnData}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                              <Tooltip />
                              <Legend />
                              <Bar yAxisId="left" dataKey="return" fill="#8884d8" name="Expected Return %" />
                              <Bar yAxisId="right" dataKey="risk" fill="#82ca9d" name="Risk Score (1-10)" />
                            </RechartsBarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
            
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Investment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Minimum</div>
                      <div className="text-lg font-bold">${property.minInvestment.toLocaleString()}</div>
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Expected Return</div>
                      <div className="text-lg font-bold">{property.roi}% per annum</div>
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Distribution</div>
                      <div className="text-lg font-bold">Quarterly</div>
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Term</div>
                      <div className="text-lg font-bold">{property.term} years</div>
                    </div>
                    
                    <Button className="w-full">Invest Now</Button>
                    
                    <p className="text-xs text-gray-500 text-center">
                      Investment opportunities involve risk, including the possible loss of principal.
                    </p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Property Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Property Type</span>
                      <span className="font-medium">{property.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Year Built</span>
                      <span className="font-medium">{property.yearBuilt}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Square Footage</span>
                      <span className="font-medium">{property.squareFootage.toLocaleString()} sq ft</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Occupancy Rate</span>
                      <span className="font-medium">{property.occupancyRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cap Rate</span>
                      <span className="font-medium">{property.capRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Net Operating Income</span>
                      <span className="font-medium">${property.noi.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Key Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {property.keyFeatures.map((feature: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-4">
                    <li className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span>Investment Prospectus</span>
                      </div>
                      <Button variant="ghost" size="sm">View</Button>
                    </li>
                    <li className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span>Financial Projections</span>
                      </div>
                      <Button variant="ghost" size="sm">View</Button>
                    </li>
                    <li className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span>Property Appraisal</span>
                      </div>
                      <Button variant="ghost" size="sm">View</Button>
                    </li>
                    <li className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span>Market Analysis</span>
                      </div>
                      <Button variant="ghost" size="sm">View</Button>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center">1</div>
                        <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                      </div>
                      <div>
                        <h3 className="font-medium">Funding Phase</h3>
                        <p className="text-sm text-gray-500 mb-1">In Progress</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <CalendarDays className="w-3 h-3 mr-1" />
                          <span>Ends {property.fundingEndDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center">2</div>
                        <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                      </div>
                      <div>
                        <h3 className="font-medium">Acquisition</h3>
                        <p className="text-sm text-gray-500 mb-1">Planned</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <CalendarDays className="w-3 h-3 mr-1" />
                          <span>Expected {property.acquisitionDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center">3</div>
                        <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                      </div>
                      <div>
                        <h3 className="font-medium">First Distribution</h3>
                        <p className="text-sm text-gray-500 mb-1">Planned</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <CalendarDays className="w-3 h-3 mr-1" />
                          <span>Expected {property.firstDistributionDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center">4</div>
                      </div>
                      <div>
                        <h3 className="font-medium">Exit Strategy</h3>
                        <p className="text-sm text-gray-500 mb-1">Planned</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <CalendarDays className="w-3 h-3 mr-1" />
                          <span>Expected {property.exitDate}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// Sample property data
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28BFF'];

const sampleProperties = [
  {
    id: "prop1",
    name: "Skyline Tower",
    location: "New York, NY",
    type: "Commercial",
    description: "Prime office space in Manhattan's financial district. This recently renovated 32-story tower offers Class A office space with panoramic views of the city skyline. The property features state-of-the-art facilities, including a fitness center, conference rooms, and 24/7 security.",
    price: 12500000,
    roi: 12.5,
    term: 5,
    minInvestment: 25000,
    fundingProgress: 78,
    currentFunding: 9750000,
    fundingGoal: 12500000,
    investors: 132,
    daysLeft: 23,
    yearBuilt: 2005,
    squareFootage: 125000,
    occupancyRate: 94,
    capRate: 7.8,
    noi: 975000,
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab",
    keyFeatures: [
      "Prime location in Manhattan's financial district",
      "Recently renovated with modern amenities",
      "High occupancy rate with blue-chip tenants",
      "Long-term lease agreements in place",
      "Energy-efficient building systems",
      "Excellent public transportation access"
    ],
    fundingEndDate: "Aug 30, 2023",
    acquisitionDate: "Sep 15, 2023",
    firstDistributionDate: "Dec 15, 2023",
    exitDate: "Q3 2028"
  },
  {
    id: "prop2",
    name: "Harborview Residences",
    location: "San Francisco, CA",
    type: "Residential",
    description: "Luxury residential complex with 120 units overlooking San Francisco Bay. This property features a mix of one, two, and three-bedroom apartments with high-end finishes and amenities including a rooftop pool, fitness center, and concierge service.",
    price: 18700000,
    roi: 9.8,
    term: 7,
    minInvestment: 50000,
    fundingProgress: 65,
    currentFunding: 12155000,
    fundingGoal: 18700000,
    investors: 98,
    daysLeft: 45,
    yearBuilt: 2018,
    squareFootage: 145000,
    occupancyRate: 96,
    capRate: 6.2,
    noi: 1159400,
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00",
    keyFeatures: [
      "Panoramic views of San Francisco Bay",
      "Luxury amenities including rooftop pool",
      "High occupancy rate in prime location",
      "Strong rental demand in the area",
      "Modern energy-efficient systems",
      "Professional property management"
    ],
    fundingEndDate: "Sep 15, 2023",
    acquisitionDate: "Oct 1, 2023",
    firstDistributionDate: "Jan 15, 2024",
    exitDate: "Q3 2030"
  },
  {
    id: "prop3",
    name: "Greenfield Industrial Park",
    location: "Dallas, TX",
    type: "Industrial",
    description: "Modern industrial complex with 5 buildings totaling 350,000 square feet. Located in a rapidly growing logistics hub with excellent access to major highways, rail, and air transportation. The property is fully leased to credit-worthy tenants in the e-commerce and logistics sectors.",
    price: 42500000,
    roi: 15.2,
    term: 8,
    minInvestment: 100000,
    fundingProgress: 83,
    currentFunding: 35275000,
    fundingGoal: 42500000,
    investors: 87,
    daysLeft: 12,
    yearBuilt: 2019,
    squareFootage: 350000,
    occupancyRate: 100,
    capRate: 8.5,
    noi: 3612500,
    image: "https://images.unsplash.com/photo-1553522911-ec3c9ba44d3b",
    keyFeatures: [
      "Strategic location in major logistics hub",
      "100% occupied with long-term leases",
      "Credit-worthy national tenants",
      "Modern Class A facilities",
      "Excellent transportation access",
      "E-commerce resistant investment"
    ],
    fundingEndDate: "Jul 20, 2023",
    acquisitionDate: "Aug 10, 2023",
    firstDistributionDate: "Nov 15, 2023",
    exitDate: "Q4 2031"
  }
];

// Sample chart data
const cashFlowData = [
  { year: '2023', cashFlow: 1250000 },
  { year: '2024', cashFlow: 1325000 },
  { year: '2025', cashFlow: 1405000 },
  { year: '2026', cashFlow: 1490000 },
  { year: '2027', cashFlow: 1580000 },
  { year: '2028', cashFlow: 1675000 },
];

const revenueBreakdownData = [
  { name: 'Rental Income', value: 80 },
  { name: 'Parking Fees', value: 8 },
  { name: 'Service Charges', value: 7 },
  { name: 'Other Income', value: 5 },
];

const roiComponentsData = [
  { name: 'Income', value: 50 },
  { name: 'Appreciation', value: 35 },
  { name: 'Tax Benefits', value: 15 },
];

const roiComparisonData = [
  { name: 'This Property', value: 15.2 },
  { name: 'S&P 500 (avg)', value: 10.5 },
  { name: 'REITs (avg)', value: 12.1 },
  { name: 'Bonds (avg)', value: 5.2 },
];

const annualRoiData = [
  { year: '2023', roi: 13.8 },
  { year: '2024', roi: 14.5 },
  { year: '2025', roi: 15.2 },
  { year: '2026', roi: 15.8 },
  { year: '2027', roi: 16.5 },
  { year: '2028', roi: 17.2 },
];

const marketComparisonData = [
  { name: 'Dallas', roi: 15.2, market: 12.8 },
  { name: 'Houston', roi: 0, market: 11.5 },
  { name: 'Austin', roi: 0, market: 13.2 },
  { name: 'San Antonio', roi: 0, market: 10.8 },
];

const riskReturnData = [
  { name: 'This Property', return: 15.2, risk: 5.4 },
  { name: 'Residential Avg', return: 9.8, risk: 4.2 },
  { name: 'Commercial Avg', return: 11.5, risk: 6.1 },
  { name: 'Industrial Avg', return: 13.8, risk: 5.8 },
];

export default PropertyDetail;
