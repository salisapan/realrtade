import { PropertyMap } from "./PropertyMap";
import { RecommendationRating } from "./RecommendationRating";
import { LetterOfIntentForm } from "./LetterOfIntentForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { LandPlot, Percent, DollarSign, Building, CalendarDays, Users, Timer, Map, AreaChartIcon, Truck, Navigation, FileText } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

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

const COLORS = ['#1A2E5A', '#007BFF', '#A9A9A9', '#0D47A1', '#5C93D8'];

const roiTimelineData = [{
  year: '2023',
  expected: 8.2,
  actual: 8.5
}, {
  year: '2024',
  expected: 9.1,
  actual: 9.4
}, {
  year: '2025',
  expected: 10.0,
  actual: 10.3
}, {
  year: '2026',
  expected: 11.2,
  actual: 11.5
}, {
  year: '2027',
  expected: 12.5,
  actual: 0
}, {
  year: '2028',
  expected: 13.8,
  actual: 0
}];

const getFeatureIcon = (feature: string) => {
  const lowerFeature = feature.toLowerCase();
  
  if (lowerFeature.includes('modern') || lowerFeature.includes('facility') || lowerFeature.includes('amenities') || lowerFeature.includes('building')) {
    return <Building className="w-3 h-3 text-primary" />;
  } else if (lowerFeature.includes('transport') || lowerFeature.includes('access') || lowerFeature.includes('highway') || lowerFeature.includes('airport')) {
    return <Truck className="w-3 h-3 text-primary" />;
  } else if (lowerFeature.includes('lease') || lowerFeature.includes('agreement') || lowerFeature.includes('contract')) {
    return <FileText className="w-3 h-3 text-primary" />;
  } else if (lowerFeature.includes('occupancy') || lowerFeature.includes('tenant') || lowerFeature.includes('resident')) {
    return <Users className="w-3 h-3 text-primary" />;
  } else if (lowerFeature.includes('location') || lowerFeature.includes('situated') || lowerFeature.includes('area')) {
    return <Map className="w-3 h-3 text-primary" />;
  } else if (lowerFeature.includes('road') || lowerFeature.includes('street') || lowerFeature.includes('highway')) {
    return <Navigation className="w-3 h-3 text-primary" />;
  } else {
    return <LandPlot className="w-3 h-3 text-primary" />;
  }
};

export const PropertyDetailContent = ({
  property
}: PropertyDetailContentProps) => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  const handleScheduleCall = () => {
    try {
      window.open('https://calendly.com/realtrade/investment-call', '_blank', 'noopener,noreferrer');
      
      toast({
        title: "Scheduling tool opened",
        description: "You can now book a call with our investment advisors",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Unable to open scheduling tool. Please try again later.",
        variant: "destructive",
      });
    }
  };

  const getPropertyCity = () => {
    const locationParts = property.location.split(',');
    return locationParts.length > 1 ? locationParts[1].trim() : 'New York';
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6 mb-8">
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
        
        <div className="bg-gray-50 rounded-lg p-4 w-full md:w-auto md:min-w-[200px]">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm text-gray-500 mb-1">Funding Progress</div>
              <div className="flex justify-between items-center mx-0">
                <div className="text-lg font-bold">{property.fundingProgress}%</div>
                <div className="text-xs text-gray-500">
                  ${(property.currentFunding / 1000000).toFixed(1)}M / ${(property.fundingGoal / 1000000).toFixed(1)}M
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                <div 
                  className="bg-primary h-2.5 rounded-full" 
                  style={{width: `${property.fundingProgress}%`}}
                ></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-center text-xs">
              <div className="bg-white p-2.5 rounded border">
                <div className="text-gray-500 mb-1">Investors</div>
                <div className="font-bold">{property.investors}</div>
              </div>
              <div className="bg-white p-2.5 rounded border">
                <div className="text-gray-500 mb-1">Min. Investment</div>
                <div className="font-bold text-gray-800">${(2500).toLocaleString()}</div>
              </div>
            </div>
            
            <LetterOfIntentForm 
              propertyId={property.id} 
              propertyName={property.name} 
              minInvestment={2500} 
            />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <div>
            <h2 className="text-lg font-bold mb-3">About This Property</h2>
            <p className="text-gray-600 text-base">{property.description}</p>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-4">Key Investment Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 property-metrics">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Property Value</span>
                </div>
                <div className="text-lg font-bold">${(property.price / 1000000).toFixed(1)}M</div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Target ROI</span>
                </div>
                <div className="text-lg font-bold">{property.roi}%</div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Term</span>
                </div>
                <div className="text-lg font-bold">{property.term} years</div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Building className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Type</span>
                </div>
                <div className="text-lg font-bold">{property.type}</div>
              </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-4">Key Features</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {property.keyFeatures.map((feature, index) => (
                <li key={index} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {getFeatureIcon(feature)}
                  </div>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Financial Analysis</h2>
            <div className="bg-gray-50 p-5 rounded-lg">
              <h3 className="text-base font-semibold mb-4">Return on Investment Timeline</h3>
              <div className="investment-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={roiTimelineData} margin={{
                    top: 10,
                    right: 10,
                    left: 0,
                    bottom: 20
                  }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{fontSize: 12}} />
                    <YAxis tick={{fontSize: 12}} />
                    <RechartsTooltip contentStyle={{fontSize: 12}} />
                    <Area type="monotone" dataKey="expected" stackId="1" stroke="#1A2E5A" fill="#1A2E5A" name="Expected ROI %" />
                    <Area type="monotone" dataKey="actual" stackId="2" stroke="#007BFF" fill="#007BFF" name="Actual ROI %" />
                    <Legend wrapperStyle={{fontSize: 12}} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Financial Highlights</h2>
            <div className="bg-gray-50 p-5 rounded-lg">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 mb-5">
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
                  <AreaChartIcon className="w-4 h-4 text-primary mr-1" />
                  <span className="text-xs font-bold text-primary">{property.roi}% Target</span>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Location</h2>
            <PropertyMap location={property.location} lat={40.7128} lng={-74.0060} />
          </div>
        </div>
        
        <div className="space-y-6">
          <RecommendationRating 
            score={property.recommendationScore} 
            marketTrend={property.marketTrend} 
            entrepreneurExperience={property.entrepreneurExperience} 
            riskLevel={property.riskLevel} 
            demandLevel={property.demandLevel} 
            returnPotential={property.returnPotential} 
          />
          
          <div className="bg-white border rounded-lg p-5">
            <h3 className="font-semibold mb-3">Need Help?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Our investment advisors are available to answer any questions about this property.
            </p>
            <Button 
              type="button" 
              variant="outline" 
              className="w-full"
              onClick={handleScheduleCall}
            >
              Schedule a Call
            </Button>
          </div>
          
          <div className="bg-white border rounded-lg p-5">
            <h3 className="font-semibold mb-3">Ready to Invest?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Start your investment journey with as little as ${(2500).toLocaleString()}.
            </p>
            <LetterOfIntentForm 
              propertyId={property.id} 
              propertyName={property.name} 
              minInvestment={2500} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};
