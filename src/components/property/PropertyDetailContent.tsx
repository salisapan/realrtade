import React from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { InvestmentCalculator } from "./InvestmentCalculator";
import { RecommendationRating } from "./RecommendationRating";
import { InvestmentIntentForm } from "./InvestmentIntentForm";
import { PropertyMap } from "./PropertyMap";
import { 
  MapPin, 
  Building, 
  DollarSign, 
  Users, 
  Clock,
  Check
} from "lucide-react";

interface PropertyDetailContentProps {
  property: any;
}

export const PropertyDetailContent = ({ property }: PropertyDetailContentProps) => {
  const { toast } = useToast();
  
  const handleInvestNowClick = () => {
    toast({
      title: "Investment Process Started",
      description: "You are now being directed to the investment flow.",
    });
    
    // In a real app, this would open a modal or navigate to an investment flow
    setTimeout(() => {
      const modal = document.getElementById('investment-intent-form');
      if (modal) {
        // @ts-ignore - This is a workaround for the modal
        modal.click();
      }
    }, 100);
  };
  
  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">{property.name}</h2>
          <div className="flex items-center text-gray-500 text-sm mt-1">
            <MapPin className="w-3.5 h-3.5 mr-1" />
            <span>{property.location}</span>
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-xl md:text-2xl font-bold text-primary">${property.price.toLocaleString()}</span>
          <div className="flex gap-1 mt-1">
            <Badge>{property.type}</Badge>
            {property.isVerified && (
              <Badge variant="success">Verified</Badge>
            )}
          </div>
        </div>
      </div>
      
      <p className="text-sm text-gray-700 mb-5 max-w-3xl">{property.description}</p>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-gray-500 text-xs mb-1">Target ROI</div>
          <div className="text-base font-bold">{property.roi}%</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-gray-500 text-xs mb-1">Term Length</div>
          <div className="text-base font-bold">{property.term} years</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-gray-500 text-xs mb-1">Min Investment</div>
          <div className="text-base font-bold">${property.minInvestment.toLocaleString()}</div>
        </div>
      </div>
      
      <div className="mb-5">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium">Funding Progress</span>
          <span className="text-xs font-medium">{property.fundingProgress}%</span>
        </div>
        <Progress value={property.fundingProgress} className="h-2" />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>${property.currentFunding.toLocaleString()} raised</span>
          <span>Goal: ${property.fundingGoal.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center text-gray-500 text-xs">
          <Users className="w-3.5 h-3.5 mr-1" />
          <span>{property.investors} investors</span>
          <Clock className="w-3.5 h-3.5 ml-3 mr-1" />
          <span>{property.daysLeft} days left</span>
        </div>
        
        <Button 
          variant="default" 
          className="bg-primary text-white hover:bg-primary-dark"
          onClick={handleInvestNowClick}
        >
          Invest Now
        </Button>
        
        <div className="hidden">
          <InvestmentIntentForm 
            propertyId={property.id || "prop1"} 
            propertyName={property.name}
            minInvestment={property.minInvestment}
          />
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-3">Location</h3>
        <PropertyMap location={property.location} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <InvestmentCalculator 
          roi={property.roi} 
          minInvestment={property.minInvestment} 
          term={property.term} 
        />
        
        <RecommendationRating 
          score={property.recommendationScore || 8}
          marketTrend={property.marketTrend || "Strong Growth"}
          entrepreneurExperience={property.entrepreneurExperience || "Excellent"}
          riskLevel={property.riskLevel || "Low"}
          demandLevel={property.demandLevel || "High"}
          returnPotential={property.returnPotential || "Strong"}
        />
        
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg border">
            <h3 className="text-sm font-medium mb-2">Key Features</h3>
            <ul className="space-y-2">
              {property.keyFeatures.map((feature: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <h3 className="text-sm font-medium mb-2">Financial Metrics</h3>
            <div className="space-y-2 text-sm">
              {property.capRate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Cap Rate</span>
                  <span className="font-medium">{property.capRate}%</span>
                </div>
              )}
              {(property.cashOnCash || property.roi) && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Cash-on-Cash Return</span>
                  <span className="font-medium">{property.cashOnCash || Math.round(property.roi * 0.75)}%</span>
                </div>
              )}
              {property.debtServiceRatio && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Debt Service Ratio</span>
                  <span className="font-medium">{property.debtServiceRatio}</span>
                </div>
              )}
              {property.loanToValue && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Loan-to-Value</span>
                  <span className="font-medium">{property.loanToValue}%</span>
                </div>
              )}
            </div>
          </div>
          
          <Button variant="outline" size="sm" className="w-full">
            Download Financial Reports
          </Button>
        </div>
      </div>
    </div>
  );
};
