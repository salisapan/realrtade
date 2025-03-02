
import { useParams, Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Home, 
  Building2, 
  MapPin, 
  DollarSign, 
  LineChart, 
  Users, 
  Calendar,
  Download,
  FileText,
  ArrowUpRight,
  Wallet,
  PieChart,
  BarChart3
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from "recharts";

// Sample data for the property
const properties = {
  prop1: {
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
    category: "Commercial",
    description: "The International Gem Tower is a 34-story skyscraper located in the heart of New York's Diamond District. It offers state-of-the-art commercial space with premium amenities and security features specifically designed for the diamond and jewelry industry.",
    occupancy: "73%",
    annualReturn: "12.5%",
    projectedGrowth: "8.2% annually",
    marketTrends: "Strong demand in premium commercial real estate in Manhattan's Diamond District with limited new development.",
    propertyTaxes: "$145,000 annually",
    maintenanceCosts: "$87,000 annually",
    insuranceCosts: "$42,000 annually",
    propertyManager: "Diamond Properties LLC",
    leaseTerms: "3-5 years with renewal options",
    tenantMix: "Primarily jewelry wholesalers, diamond cutters, and industry services"
  },
  prop2: {
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
    category: "Office",
    description: "401 N Michigan Ave is a prestigious office space in a landmark Chicago building. Located on the Magnificent Mile, it offers panoramic views of the Chicago River and Lake Michigan with high-end finishes and amenities.",
    occupancy: "68%",
    annualReturn: "11.3%",
    projectedGrowth: "7.8% annually",
    marketTrends: "Recovering office market in downtown Chicago with increasing demand for premium spaces.",
    propertyTaxes: "$320,000 annually",
    maintenanceCosts: "$175,000 annually",
    insuranceCosts: "$95,000 annually",
    propertyManager: "Michigan Avenue Management Co.",
    leaseTerms: "5-10 years with renewal options",
    tenantMix: "Technology firms, law practices, and financial services"
  },
  prop3: {
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
    category: "Tech Office",
    description: "Tech Hub Square is a modern campus-style office complex specifically designed for technology companies. The property features open floor plans, collaborative spaces, and cutting-edge infrastructure to support growing tech businesses.",
    occupancy: "89%",
    annualReturn: "14.2%",
    projectedGrowth: "9.5% annually",
    marketTrends: "High demand for tech-oriented office space in Silicon Valley with limited availability.",
    propertyTaxes: "$430,000 annually",
    maintenanceCosts: "$210,000 annually",
    insuranceCosts: "$120,000 annually",
    propertyManager: "Tech Property Solutions",
    leaseTerms: "3-7 years with flexible expansion options",
    tenantMix: "Software companies, hardware startups, and venture capital firms"
  }
};

// Sample data for charts
const occupancyData = [
  { name: 'Jan', occupancy: 65 },
  { name: 'Feb', occupancy: 68 },
  { name: 'Mar', occupancy: 70 },
  { name: 'Apr', occupancy: 72 },
  { name: 'May', occupancy: 75 },
  { name: 'Jun', occupancy: 73 },
  { name: 'Jul', occupancy: 72 },
  { name: 'Aug', occupancy: 75 },
  { name: 'Sep', occupancy: 78 },
  { name: 'Oct', occupancy: 82 },
  { name: 'Nov', occupancy: 85 },
  { name: 'Dec', occupancy: 88 },
];

const rentalIncomeData = [
  { name: 'Jan', income: 145000 },
  { name: 'Feb', income: 150000 },
  { name: 'Mar', income: 155000 },
  { name: 'Apr', income: 160000 },
  { name: 'May', income: 165000 },
  { name: 'Jun', income: 170000 },
  { name: 'Jul', income: 172000 },
  { name: 'Aug', income: 175000 },
  { name: 'Sep', income: 180000 },
  { name: 'Oct', income: 185000 },
  { name: 'Nov', income: 190000 },
  { name: 'Dec', income: 195000 },
];

const expensesData = [
  { name: 'Maintenance', value: 35 },
  { name: 'Taxes', value: 25 },
  { name: 'Insurance', value: 15 },
  { name: 'Management', value: 10 },
  { name: 'Utilities', value: 15 },
];

const EXPENSE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const cashFlowData = [
  { name: 'Year 1', income: 1750000, expenses: 850000, netCashFlow: 900000 },
  { name: 'Year 2', income: 1850000, expenses: 875000, netCashFlow: 975000 },
  { name: 'Year 3', income: 1950000, expenses: 900000, netCashFlow: 1050000 },
  { name: 'Year 4', income: 2050000, expenses: 925000, netCashFlow: 1125000 },
  { name: 'Year 5', income: 2150000, expenses: 950000, netCashFlow: 1200000 },
];

const investmentData = [
  { name: '2019', value: 2500000 },
  { name: '2020', value: 2600000 },
  { name: '2021', value: 2750000 },
  { name: '2022', value: 2950000 },
  { name: '2023', value: 3200000 },
  { name: '2024', value: 3500000 },
  { name: '2025 (proj)', value: 3825000 },
];

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const property = id ? properties[id as keyof typeof properties] : null;

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Property Not Found</h1>
          <p className="text-gray-600 mb-6">The property you're looking for doesn't exist.</p>
          <Link to="/properties">
            <Button className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2">
              <Home className="w-4 h-4" />
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
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-10 mr-4 rounded-lg" 
                />
                <h1 className="text-2xl font-bold text-gray-900">{property.title}</h1>
              </div>
              <div className="flex items-center gap-4">
                <Link to="/properties">
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    All Properties
                  </Button>
                </Link>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-2">
              <Card className="overflow-hidden">
                <img
                  src={property.image}
                  alt={property.title}
                  className="w-full h-80 object-cover"
                />
                <div className="p-6">
                  <div className="flex flex-wrap justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">{property.title}</h2>
                      <div className="flex items-center gap-2 text-gray-500">
                        <MapPin size={16} />
                        <span>{property.location}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">${property.price}</div>
                      <div className="text-sm text-gray-500">{property.category}</div>
                    </div>
                  </div>

                  <p className="text-gray-700 mb-6">
                    {property.description}
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-3 bg-gray-50 rounded-md">
                      <DollarSign size={20} className="mx-auto text-primary mb-1" />
                      <div className="text-sm text-gray-500">Cash on Cash</div>
                      <div className="font-semibold">{property.cashOnCash}</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-md">
                      <LineChart size={20} className="mx-auto text-primary mb-1" />
                      <div className="text-sm text-gray-500">Upside</div>
                      <div className="font-semibold">{property.upside}</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-md">
                      <Users size={20} className="mx-auto text-primary mb-1" />
                      <div className="text-sm text-gray-500">Funded</div>
                      <div className="font-semibold">{property.funded}</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-md">
                      <Building2 size={20} className="mx-auto text-primary mb-1" />
                      <div className="text-sm text-gray-500">Rented</div>
                      <div className="font-semibold">{property.rented}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Area</div>
                      <div>{property.sqft} sqft</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Floors</div>
                      <div>{property.floors}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Status</div>
                      <div>{property.status}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Year</div>
                      <div>{property.year}</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Investment Summary</h3>
                
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Annual Return:</span>
                    <span className="font-semibold">{property.annualReturn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Projected Growth:</span>
                    <span className="font-semibold">{property.projectedGrowth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Current Occupancy:</span>
                    <span className="font-semibold">{property.occupancy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Property Taxes:</span>
                    <span className="font-semibold">{property.propertyTaxes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Maintenance:</span>
                    <span className="font-semibold">{property.maintenanceCosts}</span>
                  </div>
                </div>

                <div className="space-y-3 mt-8">
                  <Button className="w-full flex items-center justify-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Invest Now
                  </Button>
                  <Button variant="outline" className="w-full flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    Download Prospectus
                  </Button>
                  <Button variant="outline" className="w-full flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" />
                    View Report
                  </Button>
                </div>

                <div className="mt-8 pt-6 border-t">
                  <h4 className="font-medium mb-3">Property Manager</h4>
                  <div className="flex items-center gap-3">
                    <Building2 className="text-gray-500" />
                    <div>
                      <div className="font-medium">{property.company}</div>
                      <a 
                        href={`https://${property.website}`} 
                        target="_blank"
                        rel="noopener noreferrer" 
                        className="text-sm text-primary flex items-center gap-1"
                      >
                        {property.website} <ArrowUpRight size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <Tabs defaultValue="performance" className="w-full">
            <TabsList className="grid grid-cols-4 mb-8">
              <TabsTrigger value="performance" className="flex items-center justify-center gap-2">
                <LineChart size={16} />
                Performance
              </TabsTrigger>
              <TabsTrigger value="financials" className="flex items-center justify-center gap-2">
                <DollarSign size={16} />
                Financials
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center justify-center gap-2">
                <FileText size={16} />
                Documents
              </TabsTrigger>
              <TabsTrigger value="market" className="flex items-center justify-center gap-2">
                <BarChart3 size={16} />
                Market Analysis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="performance">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Occupancy Rate (12 Months)</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={occupancyData}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis unit="%" />
                        <Tooltip formatter={(value) => [`${value}%`, 'Occupancy']} />
                        <Area 
                          type="monotone" 
                          dataKey="occupancy" 
                          stroke="#8884d8" 
                          fill="#8884d8" 
                          fillOpacity={0.3}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Rental Income (12 Months)</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={rentalIncomeData}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [`$${value.toLocaleString()}`, 'Rental Income']} 
                        />
                        <Bar dataKey="income" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Property Value Growth</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart
                        data={investmentData}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [`$${value.toLocaleString()}`, 'Property Value']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#ff7300" 
                          activeDot={{ r: 8 }}
                        />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Expense Breakdown</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={expensesData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {expensesData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value}%`, 'of Total Expenses']} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="financials">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Cash Flow Projection (5 Years)</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={cashFlowData}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [`$${value.toLocaleString()}`, 'Amount']}
                        />
                        <Legend />
                        <Bar dataKey="income" stackId="a" fill="#82ca9d" name="Income" />
                        <Bar dataKey="expenses" stackId="a" fill="#FF8042" name="Expenses" />
                        <Bar dataKey="netCashFlow" fill="#8884d8" name="Net Cash Flow" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Financial Details</h3>
                  <div className="space-y-4">
                    <div className="border-b pb-4">
                      <h4 className="font-medium mb-3">Purchase Information</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-500">Purchase Price</div>
                          <div className="font-semibold">${property.price}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Acquisition Date</div>
                          <div>Q1 {property.year.split('/')[0]}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Funding Target</div>
                          <div className="font-semibold">{property.funded}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Minimum Investment</div>
                          <div>$25,000</div>
                        </div>
                      </div>
                    </div>

                    <div className="border-b pb-4">
                      <h4 className="font-medium mb-3">Operating Expenses</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-500">Property Taxes</div>
                          <div>{property.propertyTaxes}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Insurance</div>
                          <div>{property.insuranceCosts}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Maintenance</div>
                          <div>{property.maintenanceCosts}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Property Management</div>
                          <div>2.5% of income</div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-3">Rental Information</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-500">Current Occupancy</div>
                          <div>{property.occupancy}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Tenant Mix</div>
                          <div>{property.tenantMix}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Lease Terms</div>
                          <div>{property.leaseTerms}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Avg. Monthly Rent</div>
                          <div>$55/sqft annually</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="mt-8">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Investment Options</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="border rounded-md p-4">
                      <h4 className="font-medium text-lg mb-2">Standard Investment</h4>
                      <p className="text-gray-600 mb-3">One-time investment with quarterly distributions</p>
                      <ul className="space-y-2 mb-4">
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Minimum: $25,000</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Quarterly distributions</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Expected annual return: {property.cashOnCash}</span>
                        </li>
                      </ul>
                      <Button className="w-full">Invest Now</Button>
                    </div>
                    
                    <div className="border rounded-md p-4 bg-primary/5 border-primary">
                      <div className="bg-primary text-white px-2 py-1 text-xs rounded absolute -mt-8 right-4">Popular</div>
                      <h4 className="font-medium text-lg mb-2">Automatic Reinvestment</h4>
                      <p className="text-gray-600 mb-3">Reinvest distributions to compound returns</p>
                      <ul className="space-y-2 mb-4">
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Minimum: $25,000</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Automatic dividend reinvestment</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Projected growth: {property.upside}</span>
                        </li>
                      </ul>
                      <Button className="w-full">Select Plan</Button>
                    </div>
                    
                    <div className="border rounded-md p-4">
                      <h4 className="font-medium text-lg mb-2">Premium Investor</h4>
                      <p className="text-gray-600 mb-3">For investments of $100,000 or more</p>
                      <ul className="space-y-2 mb-4">
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Minimum: $100,000</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Priority distributions</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>VIP investor benefits</span>
                        </li>
                      </ul>
                      <Button variant="outline" className="w-full">Contact Us</Button>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="documents">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-6">Property Documents</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <FileText className="text-primary" />
                      <div>
                        <div className="font-medium">Investment Prospectus</div>
                        <div className="text-sm text-gray-500">PDF • 4.2 MB • Updated Jan 2023</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <FileText className="text-primary" />
                      <div>
                        <div className="font-medium">Financial Statements</div>
                        <div className="text-sm text-gray-500">PDF • 2.8 MB • Updated Mar 2023</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <FileText className="text-primary" />
                      <div>
                        <div className="font-medium">Property Appraisal</div>
                        <div className="text-sm text-gray-500">PDF • 3.5 MB • Updated Dec 2022</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <FileText className="text-primary" />
                      <div>
                        <div className="font-medium">Market Analysis Report</div>
                        <div className="text-sm text-gray-500">PDF • 5.1 MB • Updated Feb 2023</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <FileText className="text-primary" />
                      <div>
                        <div className="font-medium">Legal Structure & Terms</div>
                        <div className="text-sm text-gray-500">PDF • 1.9 MB • Updated Jan 2023</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="market">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Market Trends</h3>
                  <p className="text-gray-700 mb-4">
                    {property.marketTrends}
                  </p>
                  
                  <div className="space-y-4 mt-6">
                    <div>
                      <h4 className="font-medium mb-2">Market Highlights</h4>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Strong local economy with sustained job growth</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Low vacancy rates in the submarket</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Limited new supply in the immediate area</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="text-green-500 w-4 h-4" />
                          <span>Increasing rental rates year-over-year</span>
                        </li>
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">Comparable Properties</h4>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2">
                          <Building2 className="text-gray-500 w-4 h-4" />
                          <span>Similar property 0.5 miles away sold for ${parseInt(property.price.replace(/,/g, '')) * 1.15} in 2022</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Building2 className="text-gray-500 w-4 h-4" />
                          <span>Average price per square foot in area: $185</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Building2 className="text-gray-500 w-4 h-4" />
                          <span>Current property price per square foot: ${Math.round(parseInt(property.price.replace(/,/g, '')) / parseInt(property.sqft.replace(/,/g, '')))}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>

                <div className="space-y-8">
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Area Demographics</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Population</h4>
                        <p>The area has a growing population with a 3.2% annual increase over the past 5 years. The median household income is $112,000.</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Employment</h4>
                        <p>Major employers include technology companies, healthcare providers, and financial institutions with an unemployment rate of 3.1%.</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Transportation</h4>
                        <p>The property has excellent access to public transportation and major highways, with an average commute time of 22 minutes.</p>
                      </div>
                    </div>
                  </Card>
                  
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Risk Assessment</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <span>Market Volatility</span>
                        <span className="text-amber-500">Medium</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: '50%' }}></div>
                      </div>
                      
                      <div className="flex items-center justify-between mb-1">
                        <span>Tenant Default</span>
                        <span className="text-green-500">Low</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '25%' }}></div>
                      </div>
                      
                      <div className="flex items-center justify-between mb-1">
                        <span>Construction/Regulatory</span>
                        <span className="text-green-500">Low</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '20%' }}></div>
                      </div>
                      
                      <div className="flex items-center justify-between mb-1">
                        <span>Interest Rate</span>
                        <span className="text-amber-500">Medium</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: '55%' }}></div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default PropertyDetail;
