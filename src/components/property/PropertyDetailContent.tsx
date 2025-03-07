
import { PropertyMap } from "./PropertyMap";
import { RecommendationRating } from "./RecommendationRating";
import { LetterOfIntentForm } from "./LetterOfIntentForm";
import { Badge } from "@/components/ui/badge";
import { 
  AreaChart, 
  LandPlot, 
  Percent, 
  DollarSign, 
  Building, 
  CalendarDays, 
  Users, 
  Timer, 
  Map,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  TrendingUp,
  Activity,
  BarChart,
  PieChart as PieChartIcon
} from "lucide-react";
import { useState } from "react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  BarChart as RechartsBarChart,
  Bar,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

interface PropertyDetailContentProps {
  property: {
    id: string;
    name: string;
    location: string;
    description: string;
    price: number;
    roi: number;
    term: number;
    minInvestment: number;
    daysLeft: number;
    fundingProgress: number;
    currentFunding: number;
    fundingGoal: number;
    investors: number;
    keyFeatures: string[];
    recommendationScore: number;
    marketTrend: string;
    entrepreneurExperience: string;
    riskLevel: string;
    demandLevel: string;
    returnPotential: string;
    [key: string]: any;
  };
}

// Financial metrics data
const cashFlowYearsData = [
  { name: 'Year 1', value: 3.8 },
  { name: 'Year 2', value: 4.2 },
  { name: 'Year 3', value: 4.8 },
  { name: 'Year 4', value: 5.3 },
  { name: 'Year 5', value: 5.9 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// 3D-like investment performance metrics
const performanceMetrics = [
  { name: 'Cash Flow', current: 8.5, projected: 9.2, industry: 7.8 },
  { name: 'Appreciation', current: 4.2, projected: 5.5, industry: 3.9 },
  { name: 'Tax Benefits', current: 2.5, projected: 2.7, industry: 2.3 },
  { name: 'Total Return', current: 15.2, projected: 17.4, industry: 14.0 },
];

// Risk analysis radar data
const riskAnalysisData = [
  { subject: 'Market Risk', A: 65, B: 90, fullMark: 150 },
  { subject: 'Liquidity', A: 80, B: 70, fullMark: 150 },
  { subject: 'Tenant Default', A: 28, B: 40, fullMark: 150 },
  { subject: 'Regulatory', A: 43, B: 80, fullMark: 150 },
  { subject: 'Interest Rate', A: 55, B: 60, fullMark: 150 },
  { subject: 'Property Damage', A: 18, B: 30, fullMark: 150 },
];

// Sensitivity analysis data
const sensitivityData = [
  { name: '-2%', worstCase: 8.2, expected: 10.5, bestCase: 13.1 },
  { name: '-1%', worstCase: 9.1, expected: 11.7, bestCase: 14.3 },
  { name: 'Base', worstCase: 10.3, expected: 12.9, bestCase: 15.8 },
  { name: '+1%', worstCase: 11.5, expected: 14.2, bestCase: 17.2 },
  { name: '+2%', worstCase: 12.8, expected: 15.6, bestCase: 18.7 },
];

export const PropertyDetailContent = ({ property }: PropertyDetailContentProps) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const isMobile = useIsMobile();
  
  const toggleSection = (section: string) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
    }
  };
  
  // Investment distribution data
  const investmentDistributionData = [
    { name: 'Rental Income', value: 50 },
    { name: 'Appreciation', value: 30 },
    { name: 'Tax Benefits', value: 15 },
    { name: 'Other', value: 5 },
  ];
  
  return (
    <div className="p-4 md:p-6 property-detail-content">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6 property-details-header">
        <div>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/10">
              {property.type}
            </Badge>
            <Badge variant="outline" className="bg-primary/10 flex items-center gap-1">
              <Timer className="w-3 h-3" />
              <span>{property.daysLeft} days left</span>
            </Badge>
          </div>
          <h1 className="text-2xl font-bold mb-1">{property.name}</h1>
          <div className="flex items-center text-gray-500 mb-4">
            <Map className="w-4 h-4 mr-1" />
            <span>{property.location}</span>
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3 w-full md:w-auto md:min-w-[180px]">
          <div className="flex flex-col gap-2">
            <div>
              <div className="text-xs text-gray-500">Funding Progress</div>
              <div className="flex justify-between items-center">
                <div className="text-lg font-bold">{property.fundingProgress}%</div>
                <div className="text-xs text-gray-500">
                  ${(property.currentFunding / 1000000).toFixed(1)}M / ${(property.fundingGoal / 1000000).toFixed(1)}M
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div 
                  className="bg-primary h-2 rounded-full" 
                  style={{ width: `${property.fundingProgress}%` }}
                ></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded border">
                <div className="text-gray-500 mb-1">Investors</div>
                <div className="font-bold">{property.investors}</div>
              </div>
              <div className="bg-white p-2 rounded border">
                <div className="text-gray-500 mb-1">Min. Investment</div>
                <div className="font-bold">${(property.isAccredited ? 2500 : property.minInvestment).toLocaleString()}</div>
              </div>
            </div>
            
            <LetterOfIntentForm 
              propertyId={property.id}
              propertyName={property.name}
              minInvestment={property.isAccredited ? 2500 : property.minInvestment}
            />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 property-detail-grid">
        <div className="md:col-span-2 space-y-6">
          <div>
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSection('about')}>
              <h2 className="text-lg font-bold mb-2">About This Property</h2>
              {expandedSection === 'about' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'about' || !isMobile ? 'block' : 'hidden'}>
              <p className="text-gray-600">{property.description}</p>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSection('metrics')}>
              <h2 className="text-lg font-bold mb-3">Key Investment Metrics</h2>
              {expandedSection === 'metrics' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={`property-detail-metrics ${expandedSection === 'metrics' || !isMobile ? 'block' : 'hidden'}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Property Value</span>
                  </div>
                  <div className="text-lg font-bold">${(property.price / 1000000).toFixed(1)}M</div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Percent className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Target ROI</span>
                  </div>
                  <div className="text-lg font-bold">{property.roi}%</div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Term</span>
                  </div>
                  <div className="text-lg font-bold">{property.term} years</div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Building className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Type</span>
                  </div>
                  <div className="text-lg font-bold">{property.type}</div>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSection('features')}>
              <h2 className="text-lg font-bold mb-3">Key Features</h2>
              {expandedSection === 'features' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'features' || !isMobile ? 'block' : 'hidden'}>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {property.keyFeatures.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <LandPlot className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSection('financial')}>
              <h2 className="text-lg font-bold mb-3">Financial Highlights</h2>
              {expandedSection === 'financial' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'financial' || !isMobile ? 'block' : 'hidden'}>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Cash on Cash</div>
                    <div className="text-lg font-bold">{property.cashOnCash}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Cap Rate</div>
                    <div className="text-lg font-bold">{property.capRate}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">NOI</div>
                    <div className="text-lg font-bold">${property.noi.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">DSC Ratio</div>
                    <div className="text-lg font-bold">{property.debtServiceRatio}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">LTV</div>
                    <div className="text-lg font-bold">{property.loanToValue}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Occupancy</div>
                    <div className="text-lg font-bold">{property.occupancyRate}%</div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">Projected Annual Returns</div>
                  <div className="flex items-center">
                    <AreaChart className="w-4 h-4 text-primary mr-1" />
                    <span className="text-xs font-bold text-primary">{property.roi}% Target</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSection('location')}>
              <h2 className="text-lg font-bold mb-3">Location</h2>
              {expandedSection === 'location' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'location' || !isMobile ? 'block' : 'hidden'}>
              <PropertyMap 
                location={property.location} 
                lat={property.lat || 40.7128} 
                lng={property.lng || -74.0060} 
              />
            </div>
          </div>
          
          {/* New enhanced investment analysis section */}
          <div>
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSection('analysis')}>
              <h2 className="text-lg font-bold mb-3">
                <span className="flex items-center gap-1">
                  <BarChart className="w-5 h-5 text-primary" />
                  Enhanced Investment Analysis
                </span>
              </h2>
              {expandedSection === 'analysis' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'analysis' || !isMobile ? 'block' : 'hidden'}>
              <div className="bg-gray-50 p-4 rounded-lg space-y-6">
                <div>
                  <h3 className="text-md font-semibold mb-3 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1 text-primary" />
                    Cash Flow Projection (5 Years)
                  </h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={cashFlowYearsData}
                        margin={{
                          top: 5,
                          right: 30,
                          left: 20,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis label={{ value: 'Cash Flow (%)', angle: -90, position: 'insideLeft' }} />
                        <Tooltip formatter={(value) => [`${value}%`, 'Cash Flow']} />
                        <Bar dataKey="value" fill="#0088FE" name="Cash Flow %" barSize={isMobile ? 30 : 60}>
                          {cashFlowYearsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-md font-semibold mb-3 flex items-center">
                    <PieChartIcon className="w-4 h-4 mr-1 text-primary" />
                    Investment Return Distribution
                  </h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={investmentDistributionData}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {investmentDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-md font-semibold mb-3 flex items-center">
                    <Activity className="w-4 h-4 mr-1 text-primary" />
                    Performance Metrics Comparison
                  </h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart
                        data={performanceMetrics}
                        margin={{
                          top: 20, right: 30, left: 20, bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis label={{ value: 'Return (%)', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="current" fill="#0088FE" name="Current" />
                        <Bar dataKey="projected" fill="#00C49F" name="Projected" />
                        <Bar dataKey="industry" fill="#FFBB28" name="Industry Avg" />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-md font-semibold mb-3 flex items-center">
                    <Activity className="w-4 h-4 mr-1 text-primary" />
                    Risk Analysis Radar
                  </h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={riskAnalysisData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" />
                        <PolarRadiusAxis angle={30} domain={[0, 150]} />
                        <Radar name="This Property" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                        <Radar name="Industry Average" dataKey="B" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} />
                        <Legend />
                        <Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-md font-semibold mb-3 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1 text-primary" />
                    Sensitivity Analysis (Return on Rent Changes)
                  </h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={sensitivityData}
                        margin={{
                          top: 5, right: 30, left: 20, bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" label={{ value: 'Rent Change', position: 'insideBottom', offset: -5 }} />
                        <YAxis label={{ value: 'ROI (%)', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="worstCase" stroke="#FF8042" name="Worst Case" />
                        <Line type="monotone" dataKey="expected" stroke="#0088FE" name="Expected" strokeWidth={2} />
                        <Line type="monotone" dataKey="bestCase" stroke="#00C49F" name="Best Case" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    These projections are based on current market conditions and historical property performance. 
                    Actual results may vary. Please consult with your financial advisor before making investment decisions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center cursor-pointer mb-2" onClick={() => toggleSection('recommendation')}>
              <h2 className="text-lg font-bold">Property Rating</h2>
              {expandedSection === 'recommendation' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'recommendation' || !isMobile ? 'block' : 'hidden'}>
              <RecommendationRating 
                score={property.recommendationScore}
                marketTrend={property.marketTrend}
                entrepreneurExperience={property.entrepreneurExperience}
                riskLevel={property.riskLevel}
                demandLevel={property.demandLevel}
                returnPotential={property.returnPotential}
              />
            </div>
          </div>
          
          <div className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-center cursor-pointer mb-2" onClick={() => toggleSection('help')}>
              <h3 className="font-semibold">Need Help?</h3>
              {expandedSection === 'help' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'help' || !isMobile ? 'block' : 'hidden'}>
              <p className="text-sm text-gray-600 mb-3">
                Our investment advisors are available to answer any questions about this property.
              </p>
              <Button type="button" variant="outline" className="w-full invest-button">
                Schedule a Call
              </Button>
            </div>
          </div>
          
          <div className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-center cursor-pointer mb-2" onClick={() => toggleSection('quickInvest')}>
              <h3 className="font-semibold">Quick Investment</h3>
              {expandedSection === 'quickInvest' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className={expandedSection === 'quickInvest' || !isMobile ? 'block' : 'hidden'}>
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Minimum</div>
                  <div className="text-base font-bold">${property.isAccredited ? "2,500" : property.minInvestment.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Target Return</div>
                  <div className="text-base font-bold">{property.roi}% per annum</div>
                </div>
                <LetterOfIntentForm 
                  propertyId={property.id}
                  propertyName={property.name}
                  minInvestment={property.isAccredited ? 2500 : property.minInvestment}
                />
                <p className="text-xs text-gray-500 text-center">
                  Investment opportunities involve risk, including the possible loss of principal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Define missing components
const Button = ({ children, type, variant, className }: any) => {
  return (
    <button 
      type={type} 
      className={`px-4 py-2 rounded-md ${
        variant === 'outline' 
          ? 'border border-gray-300 hover:bg-gray-50' 
          : 'bg-primary text-white hover:bg-primary/90'
      } ${className}`}
    >
      {children}
    </button>
  );
};
