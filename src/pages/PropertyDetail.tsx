
import { useParams, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, MapPin, DollarSign, LineChart, Users, Calendar, FileText, Download } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Sample property data (in a real app, this would come from an API)
const propertiesData = [
  {
    id: "prop1",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "The International Gem Tower",
    location: "50 West 47th Street, New York",
    company: "EXTELL",
    website: "www.extell.com",
    cashOnCash: "11.2%",
    upside: "42%",
    funded: "91%",
    rented: "73%",
    sqft: "13,300",
    floors: "5 from 12",
    status: "Built",
    year: "2012",
    price: "2,700,000",
    description: "The International Gem Tower is a state-of-the-art commercial building located in the heart of New York's diamond district. This property offers prime office space with modern amenities and excellent visibility.",
    annualReturn: "9.8%",
    totalInvestors: 47,
    minInvestment: "25,000",
    holdPeriod: "5-7 years",
    projectedIRR: "17.4%",
    occupancyRate: "94%",
    netOperatingIncome: "240,000",
    capRate: "8.9%",
    amenities: ["24/7 Security", "Parking Garage", "Conference Facilities", "Rooftop Terrace", "Fitness Center"],
    reports: [
      { title: "2023 Financial Performance", date: "Jan 2024", fileSize: "3.2 MB" },
      { title: "Property Valuation Report", date: "Dec 2023", fileSize: "2.8 MB" },
      { title: "Q4 2023 Investor Update", date: "Jan 2024", fileSize: "1.5 MB" },
    ],
    dividendHistory: [
      { period: "Q1 2023", amount: "$1,250", yield: "1.25%" },
      { period: "Q2 2023", amount: "$1,250", yield: "1.25%" },
      { period: "Q3 2023", amount: "$1,300", yield: "1.30%" },
      { period: "Q4 2023", amount: "$1,400", yield: "1.40%" },
    ],
    nearbyProperties: ["Diamond District Plaza", "Midtown Executive Tower", "West 46th Street Office"],
    category: "Commercial",
    region: "Northeast",
    riskProfile: "Low",
  },
  {
    id: "prop2",
    image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "401 N Michigan Ave",
    location: "401 N Michigan Ave, Chicago",
    company: "IAG",
    website: "www.iag.com",
    cashOnCash: "11.7%",
    upside: "53%",
    funded: "81%",
    rented: "68%",
    sqft: "21,500",
    floors: "17-19th from 35",
    status: "Built",
    year: "1965/2016",
    price: "8,770,000",
    description: "Located on Chicago's Magnificent Mile, 401 N Michigan Ave is a premium mixed-use property featuring retail spaces on lower floors and premium office spaces above. Recently renovated in 2016, this property offers modern amenities while preserving its historic charm.",
    annualReturn: "10.2%",
    totalInvestors: 63,
    minInvestment: "50,000",
    holdPeriod: "7-10 years",
    projectedIRR: "16.8%",
    occupancyRate: "87%",
    netOperatingIncome: "720,000",
    capRate: "8.2%",
    amenities: ["River Views", "High-speed Elevators", "Executive Lounge", "Retail Galleria", "Underground Parking"],
    reports: [
      { title: "2023 Annual Property Report", date: "Feb 2024", fileSize: "4.7 MB" },
      { title: "Commercial Market Analysis", date: "Dec 2023", fileSize: "3.1 MB" },
      { title: "Tenant Satisfaction Survey", date: "Nov 2023", fileSize: "1.8 MB" },
    ],
    dividendHistory: [
      { period: "Q1 2023", amount: "$3,250", yield: "1.63%" },
      { period: "Q2 2023", amount: "$3,250", yield: "1.63%" },
      { period: "Q3 2023", amount: "$3,400", yield: "1.70%" },
      { period: "Q4 2023", amount: "$3,600", yield: "1.80%" },
    ],
    nearbyProperties: ["Michigan Plaza", "Tribune Tower", "River Point"],
    category: "Office",
    region: "Midwest",
  },
  {
    id: "prop3",
    image: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Tech Hub Square",
    location: "Silicon Valley, CA",
    company: "TechVest",
    website: "www.techvest.com",
    cashOnCash: "13.5%",
    upside: "61%",
    funded: "95%",
    rented: "89%",
    sqft: "45,000",
    floors: "All 4 floors",
    status: "Built",
    year: "2020",
    price: "12,500,000",
    description: "Tech Hub Square is a modern office complex designed specifically for technology companies. With state-of-the-art infrastructure and flexible spaces, this property attracts premium tenants from Silicon Valley's thriving tech ecosystem.",
    annualReturn: "11.8%",
    totalInvestors: 78,
    minInvestment: "100,000",
    holdPeriod: "5-8 years",
    projectedIRR: "19.2%",
    occupancyRate: "92%",
    netOperatingIncome: "1,375,000",
    capRate: "11.0%",
    amenities: ["Innovation Lab", "Startup Incubator Space", "Demonstration Theater", "Electric Vehicle Charging", "Bike Storage"],
    reports: [
      { title: "Technology Sector Impact Report", date: "Jan 2024", fileSize: "5.1 MB" },
      { title: "Green Building Certification", date: "Dec 2023", fileSize: "2.3 MB" },
      { title: "Tenant Growth Analysis", date: "Feb 2024", fileSize: "3.7 MB" },
    ],
    dividendHistory: [
      { period: "Q1 2023", amount: "$5,875", yield: "1.47%" },
      { period: "Q2 2023", amount: "$6,000", yield: "1.50%" },
      { period: "Q3 2023", amount: "$6,200", yield: "1.55%" },
      { period: "Q4 2023", amount: "$6,600", yield: "1.65%" },
    ],
    nearbyProperties: ["Innovation Park", "Silicon Office Campus", "Tech Tower Two"],
    category: "Tech Office",
    region: "West",
    profitMargin: "High",
  },
  {
    id: "prop4",
    image: "https://images.unsplash.com/photo-1464146072230-91cabc968266?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Southbank Tower",
    location: "Miami, FL",
    company: "Coastal Investments",
    website: "www.coastalinv.com",
    cashOnCash: "10.8%",
    upside: "38%",
    funded: "75%",
    rented: "82%",
    sqft: "18,900",
    floors: "12-15 from 25",
    status: "Built",
    year: "2019",
    price: "5,900,000",
    description: "Southbank Tower is a luxury mixed-use development featuring premium residential and commercial units with stunning views of Biscayne Bay. Located in Miami's financial district, this property offers excellent potential for capital appreciation.",
    annualReturn: "9.4%",
    totalInvestors: 42,
    minInvestment: "50,000",
    holdPeriod: "5-7 years",
    projectedIRR: "15.7%",
    occupancyRate: "86%",
    netOperatingIncome: "531,000",
    capRate: "9.0%",
    amenities: ["Infinity Pool", "Concierge Service", "Private Terraces", "Fitness Center", "Yacht Dock"],
    reports: [
      { title: "Miami Real Estate Market Analysis", date: "Jan 2024", fileSize: "3.8 MB" },
      { title: "Climate Resilience Assessment", date: "Dec 2023", fileSize: "2.9 MB" },
      { title: "Q4 2023 Performance Report", date: "Jan 2024", fileSize: "2.2 MB" },
    ],
    dividendHistory: [
      { period: "Q1 2023", amount: "$2,900", yield: "1.45%" },
      { period: "Q2 2023", amount: "$2,900", yield: "1.45%" },
      { period: "Q3 2023", amount: "$3,000", yield: "1.50%" },
      { period: "Q4 2023", amount: "$3,200", yield: "1.60%" },
    ],
    nearbyProperties: ["Brickell Heights", "Riverside Complex", "Downtown Financial Center"],
    category: "Mixed-Use",
    region: "Southeast",
    riskProfile: "Low",
  },
  {
    id: "prop5",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Modern Industrial Complex",
    location: "Austin, TX",
    company: "TexasRE",
    website: "www.texasre.com",
    cashOnCash: "12.3%",
    upside: "45%",
    funded: "88%",
    rented: "91%",
    sqft: "65,000",
    floors: "2",
    status: "Built",
    year: "2021",
    price: "15,300,000",
    description: "This modern industrial complex in rapidly growing Austin features versatile warehouse and distribution space with state-of-the-art logistics capabilities. Prime location near major transportation routes makes this an excellent investment with strong tenant demand.",
    annualReturn: "11.2%",
    totalInvestors: 56,
    minInvestment: "75,000",
    holdPeriod: "7-10 years",
    projectedIRR: "18.5%",
    occupancyRate: "96%",
    netOperatingIncome: "1,607,000",
    capRate: "10.5%",
    amenities: ["Loading Docks", "Climate Control", "24/7 Security", "Flexible Bay Configuration", "Office Space"],
    reports: [
      { title: "Austin Industrial Market Report", date: "Feb 2024", fileSize: "4.3 MB" },
      { title: "Supply Chain Impact Analysis", date: "Jan 2024", fileSize: "3.6 MB" },
      { title: "Infrastructure Assessment", date: "Dec 2023", fileSize: "2.5 MB" },
    ],
    dividendHistory: [
      { period: "Q1 2023", amount: "$4,700", yield: "1.57%" },
      { period: "Q2 2023", amount: "$4,800", yield: "1.60%" },
      { period: "Q3 2023", amount: "$5,100", yield: "1.70%" },
      { period: "Q4 2023", amount: "$5,400", yield: "1.80%" },
    ],
    nearbyProperties: ["Tech Ridge Industrial", "Austin Logistics Center", "Southpark Distribution"],
    category: "Industrial",
    region: "Southwest",
    profitMargin: "High",
  },
  {
    id: "prop6",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Green Energy Office Park",
    location: "Portland, OR",
    company: "EcoVest",
    website: "www.ecovest.com",
    cashOnCash: "9.8%",
    upside: "55%",
    funded: "70%",
    rented: "65%",
    sqft: "32,000",
    floors: "3",
    status: "Under Construction",
    year: "2024",
    price: "9,800,000",
    description: "Green Energy Office Park is a sustainable development powered by renewable energy sources. This forward-thinking property appeals to environmentally conscious tenants and benefits from green building tax incentives, creating both environmental and financial value.",
    annualReturn: "10.5%",
    totalInvestors: 38,
    minInvestment: "50,000",
    holdPeriod: "8-12 years",
    projectedIRR: "17.8%",
    occupancyRate: "65% (pre-leased)",
    netOperatingIncome: "882,000 (projected)",
    capRate: "9.0% (projected)",
    amenities: ["Solar Roof", "Rainwater Collection", "Living Walls", "Natural Ventilation", "Community Garden"],
    reports: [
      { title: "Sustainability Impact Report", date: "Jan 2024", fileSize: "3.9 MB" },
      { title: "Construction Progress Update", date: "Feb 2024", fileSize: "5.2 MB" },
      { title: "Green Building Certification Plan", date: "Dec 2023", fileSize: "2.7 MB" },
    ],
    dividendHistory: [],
    nearbyProperties: ["Eco Business Center", "Sustainable Square", "Portland Green Tower"],
    category: "Green Office",
    region: "Northwest",
  },
];

const PropertyDetail = () => {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Find the property by id
  const property = propertiesData.find(p => p.id === propertyId);
  
  if (!property) {
    return (
      <div className="flex">
        <AppSidebar />
        <div className="flex-1 min-h-screen bg-gray-50 p-8">
          <Button variant="outline" onClick={() => navigate('/properties')} className="mb-6">
            <ArrowLeft className="mr-2 w-4 h-4" /> Back to Properties
          </Button>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Property Not Found</h2>
            <p className="text-gray-600">The property you're looking for doesn't exist or has been removed.</p>
          </div>
        </div>
      </div>
    );
  }

  const handleInvest = () => {
    toast({
      title: "Investment Process Started",
      description: `You're about to invest in ${property.title}. Redirecting to investment flow...`,
    });
    // In a real app, this would redirect to an investment flow
  };

  const handleDownloadReport = (reportTitle: string) => {
    toast({
      title: "Downloading Report",
      description: `${reportTitle} is being downloaded to your device.`,
    });
  };

  const handleReinvestDividend = () => {
    toast({
      title: "Dividend Reinvestment",
      description: "Your dividends will be automatically reinvested into this property.",
    });
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <Button variant="outline" onClick={() => navigate('/properties')} className="mb-6">
            <ArrowLeft className="mr-2 w-4 h-4" /> Back to Properties
          </Button>
          
          <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
            <div className="relative h-80">
              <img 
                src={property.image} 
                alt={property.title} 
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-6 left-6 bg-white px-6 py-3 rounded-lg shadow-md">
                <h1 className="text-2xl font-bold">{property.title}</h1>
                <div className="flex items-center mt-2">
                  <MapPin size={16} className="text-gray-500 mr-2" />
                  <span className="text-gray-700">{property.location}</span>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-6 mb-6">
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-primary" />
                  <div>
                    <p className="text-sm text-gray-500">Developer</p>
                    <p className="font-medium">{property.company}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign size={18} className="text-primary" />
                  <div>
                    <p className="text-sm text-gray-500">Price</p>
                    <p className="font-medium">${property.price}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <LineChart size={18} className="text-primary" />
                  <div>
                    <p className="text-sm text-gray-500">Annual Return</p>
                    <p className="font-medium">{property.annualReturn}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-primary" />
                  <div>
                    <p className="text-sm text-gray-500">Funding</p>
                    <p className="font-medium">{property.funded} funded</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-primary" />
                  <div>
                    <p className="text-sm text-gray-500">Built</p>
                    <p className="font-medium">{property.year}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4 mb-8">
                <Button className="flex-1" onClick={handleInvest}>
                  Invest Now
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleReinvestDividend}>
                  Auto Reinvest Dividends
                </Button>
              </div>
              
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="mb-8 w-full justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="financials">Financials</TabsTrigger>
                  <TabsTrigger value="reports">Reports</TabsTrigger>
                  <TabsTrigger value="dividends">Dividends</TabsTrigger>
                  <TabsTrigger value="similar">Similar Properties</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">About This Property</h3>
                    <p className="text-gray-700 mb-4">{property.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                      <div>
                        <h4 className="text-gray-500 text-sm">Area</h4>
                        <p className="font-medium">{property.sqft} sqft</p>
                      </div>
                      <div>
                        <h4 className="text-gray-500 text-sm">Floors</h4>
                        <p className="font-medium">{property.floors}</p>
                      </div>
                      <div>
                        <h4 className="text-gray-500 text-sm">Status</h4>
                        <p className="font-medium">{property.status}</p>
                      </div>
                      <div>
                        <h4 className="text-gray-500 text-sm">Minimum Investment</h4>
                        <p className="font-medium">${property.minInvestment}</p>
                      </div>
                      <div>
                        <h4 className="text-gray-500 text-sm">Hold Period</h4>
                        <p className="font-medium">{property.holdPeriod}</p>
                      </div>
                      <div>
                        <h4 className="text-gray-500 text-sm">Total Investors</h4>
                        <p className="font-medium">{property.totalInvestors}</p>
                      </div>
                    </div>
                  </div>
                  
                  {property.amenities && (
                    <div>
                      <h3 className="text-xl font-semibold mb-4">Amenities</h3>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {property.amenities.map((amenity, index) => (
                          <li key={index} className="flex items-center">
                            <span className="w-2 h-2 bg-primary rounded-full mr-2"></span>
                            {amenity}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="financials">
                  <div className="space-y-6">
                    <h3 className="text-xl font-semibold mb-4">Financial Information</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Returns</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="flex justify-between">
                              <span>Cash on Cash</span>
                              <span className="font-bold">{property.cashOnCash}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Projected IRR</span>
                              <span className="font-bold">{property.projectedIRR}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Upside Potential</span>
                              <span className="font-bold">{property.upside}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Annual Return</span>
                              <span className="font-bold">{property.annualReturn}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Property Performance</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="flex justify-between">
                              <span>Occupancy Rate</span>
                              <span className="font-bold">{property.occupancyRate}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Net Operating Income</span>
                              <span className="font-bold">${property.netOperatingIncome}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Cap Rate</span>
                              <span className="font-bold">{property.capRate}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Rental Rate</span>
                              <span className="font-bold">{property.rented}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="reports">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Property Reports</h3>
                    {property.reports?.length ? (
                      <div className="space-y-4">
                        {property.reports.map((report, index) => (
                          <Card key={index} className="overflow-hidden">
                            <CardContent className="p-0">
                              <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                  <div className="bg-primary/10 p-2 rounded-md">
                                    <FileText className="w-5 h-5 text-primary" />
                                  </div>
                                  <div>
                                    <h4 className="font-medium">{report.title}</h4>
                                    <p className="text-sm text-gray-500">{report.date} • {report.fileSize}</p>
                                  </div>
                                </div>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleDownloadReport(report.title)}
                                >
                                  <Download className="w-4 h-4 mr-2" /> Download
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No reports available for this property yet.</p>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="dividends">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Dividend History</h3>
                    {property.dividendHistory?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-gray-50 text-left">
                              <th className="p-3 border-b font-semibold">Period</th>
                              <th className="p-3 border-b font-semibold">Amount</th>
                              <th className="p-3 border-b font-semibold">Yield</th>
                              <th className="p-3 border-b font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {property.dividendHistory.map((dividend, index) => (
                              <tr key={index} className="border-b">
                                <td className="p-3">{dividend.period}</td>
                                <td className="p-3">{dividend.amount}</td>
                                <td className="p-3">{dividend.yield}</td>
                                <td className="p-3">
                                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                    Paid
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        
                        <div className="mt-6 flex justify-between items-center">
                          <p className="text-sm text-gray-500">
                            Dividends are distributed quarterly and can be reinvested automatically.
                          </p>
                          <Button onClick={handleReinvestDividend}>
                            Auto Reinvest Dividends
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">No dividend history available for this property yet.</p>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="similar">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Similar Properties</h3>
                    {property.nearbyProperties?.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {property.nearbyProperties.map((nearby, index) => (
                          <Card key={index} className="cursor-pointer hover:shadow-md transition-all">
                            <CardContent className="p-4">
                              <h4 className="font-medium">{nearby}</h4>
                              <p className="text-sm text-gray-500">{property.location}</p>
                              <Button variant="link" className="p-0 h-auto mt-2">
                                View details
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No similar properties available.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyDetail;
