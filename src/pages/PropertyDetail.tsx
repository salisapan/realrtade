
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyDetailContent } from "@/components/property/PropertyDetailContent";
import { PropertyMarketNews } from "@/components/property/PropertyMarketNews";
import { PropertyMarketInsights } from "@/components/property/PropertyMarketInsights";
import { useToast } from "@/hooks/use-toast";
import { Home, Building, BarChart, FileText, MessageSquare, Bookmark, Share2, Check, CalendarDays } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart as RechartsBarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

const PropertyDetail = () => {
  const { id } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const { toast } = useToast();
  
  const CHART_COLORS = ['#1A2E5A', '#007BFF', '#4A90E2', '#A9A9A9', '#D3D3D3'];

  useEffect(() => {
    // Simulate loading property data
    setTimeout(() => {
      // Find property by ID
      const foundProperty = sampleProperties.find(p => p.id === id);
      
      // Update the property data to use consistent minimum investment
      if (foundProperty) {
        foundProperty.minInvestment = 2500;
      }
      
      setProperty(foundProperty || null);
      setLoading(false);
    }, 500);
  }, [id]);
  
  const handleBookmark = () => {
    setBookmarked(!bookmarked);
    toast({
      title: bookmarked ? "Deal removed from saved" : "Deal saved",
      description: bookmarked ? "This deal has been removed from your saved deals" : "This deal has been added to your saved deals",
      variant: "success"
    });
  };
  
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copied",
      description: "Deal link has been copied to clipboard",
      variant: "success"
    });
  };
  
  const handleInvest = () => {
    // Scroll to the Letter of Intent form
    const loiForm = document.querySelector('.loi-form-container');
    if (loiForm) {
      loiForm.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  const handleScheduleCall = () => {
    // Open Calendly for scheduling
    window.open('https://calendly.com/realtrade/investment-call', '_blank');
  };

  if (loading) {
    return <div className="flex">
        <AppSidebar />
        <div className="flex-1 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-4 text-lg">Loading property details...</p>
          </div>
        </div>
      </div>;
  }
  
  if (!property) {
    return <div className="flex">
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
      </div>;
  }

  return <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 max-w-[75%]">
                <Link to="/" className="flex-shrink-0">
                  <img 
                    src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                    alt="RealTrade Logo" 
                    className="h-8 rounded-lg" 
                  />
                </Link>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 truncate ml-2">{property.name}</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-1 h-8 text-xs" 
                  onClick={handleBookmark}
                >
                  <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-primary" : ""}`} />
                  <span className="hidden sm:inline">{bookmarked ? "Saved" : "Save"}</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-1 h-8 text-xs" 
                  onClick={handleShare}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-0 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8 p-4 md:p-6">
            <div className="lg:col-span-2 space-y-4 md:space-y-8">
              <div className="rounded-xl overflow-hidden bg-white shadow-sm">
                <img src={property.image} alt={property.name} className="w-full h-[300px] object-cover" />
                
                <PropertyDetailContent property={{...property, minInvestment: 2500}} />
              </div>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Investment Details</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Tabs defaultValue="analysis">
                    <TabsList className="mb-3 w-full h-9">
                      <TabsTrigger value="analysis" className="text-xs h-7">Financial Analysis</TabsTrigger>
                      <TabsTrigger value="documents" className="text-xs h-7">Documents</TabsTrigger>
                      <TabsTrigger value="qa" className="text-xs h-7">Q&A</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="analysis">
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-sm font-medium mb-3">5-Year Cash Flow Projections</h3>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={cashFlowData} margin={{
                              top: 10,
                              right: 30,
                              left: 0,
                              bottom: 0
                            }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="year" tick={{
                                fontSize: 12
                              }} />
                                <YAxis tick={{
                                fontSize: 12
                              }} />
                                <RechartsTooltip contentStyle={{
                                fontSize: 12
                              }} />
                                <Area type="monotone" dataKey="cashFlow" stroke="#1A2E5A" fill="#1A2E5A" fillOpacity={0.3} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h3 className="text-sm font-medium mb-3">ROI Components</h3>
                            <div className="h-56">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={roiComponentsData} cx="50%" cy="50%" labelLine={false} outerRadius={70} fill="#007BFF" dataKey="value" label={({
                                  name,
                                  percent
                                }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                                    {roiComponentsData.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                                  </Pie>
                                  <RechartsTooltip contentStyle={{
                                  fontSize: 12
                                }} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          
                          <div>
                            <h3 className="text-sm font-medium mb-3">Risk Assessment</h3>
                            <div className="h-56">
                              <ResponsiveContainer width="100%" height="100%">
                                <RechartsBarChart data={riskAssessmentData} margin={{
                                top: 20,
                                right: 30,
                                left: 20,
                                bottom: 5
                              }} layout="vertical">
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis type="number" domain={[0, 10]} tick={{
                                  fontSize: 12
                                }} />
                                  <YAxis dataKey="name" type="category" width={120} tick={{
                                  fontSize: 12
                                }} />
                                  <RechartsTooltip contentStyle={{
                                  fontSize: 12
                                }} />
                                  <Legend wrapperStyle={{
                                  fontSize: 12
                                }} />
                                  <Bar dataKey="score" fill="#007BFF" name="Risk Score (lower is better)" />
                                </RechartsBarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="documents">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <div>
                              <h4 className="text-sm font-medium">Investment Prospectus</h4>
                              <p className="text-xs text-gray-500">Detailed overview of the investment</p>
                            </div>
                          </div>
                          <Button size="sm" className="h-7 text-xs px-2">View</Button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <div>
                              <h4 className="text-sm font-medium">Financial Projections</h4>
                              <p className="text-xs text-gray-500">Cash flow projections</p>
                            </div>
                          </div>
                          <Button size="sm" className="h-7 text-xs px-2">View</Button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <div>
                              <h4 className="text-sm font-medium">Property Appraisal</h4>
                              <p className="text-xs text-gray-500">Professional property valuation</p>
                            </div>
                          </div>
                          <Button size="sm" className="h-7 text-xs px-2">View</Button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <div>
                              <h4 className="text-sm font-medium">Market Analysis</h4>
                              <p className="text-xs text-gray-500">Analysis of local real estate market</p>
                            </div>
                          </div>
                          <Button size="sm" className="h-7 text-xs px-2">View</Button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <div>
                              <h4 className="text-sm font-medium">Legal Documentation</h4>
                              <p className="text-xs text-gray-500">Investment terms and agreements</p>
                            </div>
                          </div>
                          <Button size="sm" className="h-7 text-xs px-2">View</Button>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="qa">
                      <div className="space-y-3">
                        <div className="border rounded-md p-3">
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-semibold">
                              JD
                            </div>
                            <div>
                              <div className="flex items-center gap-1">
                                <h4 className="text-sm font-medium">John Doe</h4>
                                <span className="text-xs text-gray-500">2 days ago</span>
                              </div>
                              <p className="mt-1 text-xs">What is the expected timeline for the first distribution after funding completes?</p>
                              
                              <div className="mt-2 pl-3 border-l-2 border-gray-200">
                                <div className="flex items-center gap-1">
                                  <h4 className="text-xs font-medium text-primary">Property Developer</h4>
                                  <span className="text-xs text-gray-500">1 day ago</span>
                                </div>
                                <p className="mt-0.5 text-xs">The first distribution is scheduled for approximately 90 days after the funding period closes, assuming we reach our funding goal on time.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border rounded-md p-3">
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-semibold">
                              SM
                            </div>
                            <div>
                              <div className="flex items-center gap-1">
                                <h4 className="text-sm font-medium">Sarah Miller</h4>
                                <span className="text-xs text-gray-500">1 week ago</span>
                              </div>
                              <p className="mt-1 text-xs">Are there any plans for property renovations that might impact the cash flow in year 1?</p>
                              
                              <div className="mt-2 pl-3 border-l-2 border-gray-200">
                                <div className="flex items-center gap-1">
                                  <h4 className="text-xs font-medium text-primary">Property Developer</h4>
                                  <span className="text-xs text-gray-500">5 days ago</span>
                                </div>
                                <p className="mt-0.5 text-xs">We have budgeted for minor cosmetic improvements in year 1, but these costs are already factored into the cash flow projections. No major renovations are planned.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-1.5">Ask a Question</h4>
                          <textarea className="w-full p-2 border rounded-md text-sm" rows={2} placeholder="Type your question here..."></textarea>
                          <div className="flex justify-end mt-2">
                            <Button size="sm" className="h-7 text-xs">
                              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                              Submit Question
                            </Button>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
            
            <div className="space-y-6 md:space-y-8">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Quick Investment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Minimum</div>
                      <div className="text-base font-bold text-gray-800">${(2500).toLocaleString()}</div>
                    </div>
                    
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Expected Return</div>
                      <div className="text-base font-bold">{property.roi}% per annum</div>
                    </div>
                    
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Distribution</div>
                      <div className="text-base font-bold">Quarterly</div>
                    </div>
                    
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Term</div>
                      <div className="text-base font-bold">{property.term} years</div>
                    </div>
                    
                    <Button 
                      className="w-full" 
                      onClick={handleInvest}
                    >
                      Invest Now
                    </Button>
                    
                    <p className="text-xs text-gray-500 text-center">
                      Investment opportunities involve risk, including the possible loss of principal.
                    </p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Property Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
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
              
              <PropertyMarketInsights 
                propertyAddress={property.location.split(',')[0]} 
                propertyCity={property.location.split(',')[1]?.trim() || 'New York'} 
              />
              
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">1</div>
                        <div className="w-0.5 h-full bg-gray-200 mt-1"></div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium">Funding Phase</h3>
                        <p className="text-xs text-gray-500 mb-0.5">In Progress</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <CalendarDays className="w-3 h-3 mr-1" />
                          <span>Ends {property.fundingEndDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs">2</div>
                        <div className="w-0.5 h-full bg-gray-200 mt-1"></div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium">Acquisition</h3>
                        <p className="text-xs text-gray-500 mb-0.5">Planned</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <CalendarDays className="w-3 h-3 mr-1" />
                          <span>Expected {property.acquisitionDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs">3</div>
                        <div className="w-0.5 h-full bg-gray-200 mt-1"></div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium">First Distribution</h3>
                        <p className="text-xs text-gray-500 mb-0.5">Planned</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <CalendarDays className="w-3 h-3 mr-1" />
                          <span>Expected {property.firstDistributionDate}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs">4</div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium">Exit Strategy</h3>
                        <p className="text-xs text-gray-500 mb-0.5">Planned</p>
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
    </div>;
};

const COLORS = ['#1A2E5A', '#007BFF', '#4A90E2', '#A9A9A9', '#D3D3D3'];

const sampleProperties = [{
  id: "prop1",
  name: "Skyline Tower",
  location: "New York, NY",
  type: "Commercial",
  description: "Prime office space in Manhattan's financial district. This recently renovated 32-story tower offers Class A office space with panoramic views of the city skyline. The property features state-of-the-art facilities, including a fitness center, conference rooms, and 24/7 security.",
  price: 12500000,
  roi: 12.5,
  term: 5,
  minInvestment: 2500,
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
  keyFeatures: ["Prime location in Manhattan's financial district", "Recently renovated with modern amenities", "High occupancy rate with blue-chip tenants", "Long-term lease agreements in place", "Energy-efficient building systems", "Excellent public transportation access"],
  fundingEndDate: "Aug 30, 2023",
  acquisitionDate: "Sep 15, 2023",
  firstDistributionDate: "Dec 15, 2023",
  exitDate: "Q3 2028",
  recommendationScore: 8.5,
  marketTrend: "Strong Growth",
  entrepreneurExperience: "Excellent",
  riskLevel: "Low",
  demandLevel: "High",
  returnPotential: "Strong",
  cashOnCash: 9.5,
  debtServiceRatio: 1.45,
  loanToValue: 65
}, {
  id: "prop2",
  name: "Harborview Residences",
  location: "San Francisco, CA",
  type: "Residential",
  description: "Luxury residential complex with 120 units overlooking San Francisco Bay. This property features a mix of one, two, and three-bedroom apartments with high-end finishes and amenities including a rooftop pool, fitness center, and concierge service.",
  price: 18700000,
  roi: 9.8,
  term: 7,
  minInvestment: 5000,
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
  keyFeatures: ["Panoramic views of San Francisco Bay", "Luxury amenities including rooftop pool", "High occupancy rate in prime location", "Strong rental demand in the area", "Modern energy-efficient systems", "Professional property management"],
  fundingEndDate: "Sep 15, 2023",
  acquisitionDate: "Oct 1, 2023",
  firstDistributionDate: "Jan 15, 2024",
  exitDate: "Q3 2030",
  recommendationScore: 7.8,
  marketTrend: "Stable",
  entrepreneurExperience: "Good",
  riskLevel: "Medium",
  demandLevel: "High",
  returnPotential: "Good",
  cashOnCash: 7.5,
  debtServiceRatio: 1.35,
  loanToValue: 70
}, {
  id: "prop3",
  name: "Greenfield Industrial Park",
  location: "Dallas, TX",
  type: "Industrial",
  description: "Modern industrial complex with 5 buildings totaling 350,000 square feet. Located in a rapidly growing logistics hub with excellent access to major highways, rail, and air transportation. The property is fully leased to credit-worthy tenants in the e-commerce and logistics sectors.",
  price: 42500000,
  roi: 15.2,
  term: 8,
  minInvestment: 10000,
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
  keyFeatures: ["Strategic location in major logistics hub", "100% occupied with long-term leases", "Credit-worthy national tenants", "Modern Class A facilities", "Excellent transportation access", "E-commerce resistant investment"],
  fundingEndDate: "Jul 20, 2023",
  acquisitionDate: "Aug 10, 2023",
  firstDistributionDate: "Nov 15, 2023",
  exitDate: "Q4 2031",
  recommendationScore: 9.2,
  marketTrend: "Strong Growth",
  entrepreneurExperience: "Excellent",
  riskLevel: "Low",
  demandLevel: "Very High",
  returnPotential: "Excellent",
  cashOnCash: 11.5,
  debtServiceRatio: 1.6,
  loanToValue: 60
}];

const cashFlowData = [{
  year: '2023',
  cashFlow: 1250000
}, {
  year: '2024',
  cashFlow: 1325000
}, {
  year: '2025',
  cashFlow: 1405000
}, {
  year: '2026',
  cashFlow: 1490000
}, {
  year: '2027',
  cashFlow: 1580000
}, {
  year: '2028',
  cashFlow: 1675000
}];

const roiComponentsData = [{
  name: 'Rental Income',
  value: 50
}, {
  name: 'Appreciation',
  value: 35
}, {
  name: 'Tax Benefits',
  value: 15
}];

const riskAssessmentData = [{
  name: 'Market Volatility',
  score: 3.2
}, {
  name: 'Tenant Default',
  score: 2.8
}, {
  name: 'Regulatory Changes',
  score: 4.5
}, {
  name: 'Interest Rate',
  score: 5.1
}, {
  name: 'Property Damage',
  score: 2.0
}];

export default PropertyDetail;
