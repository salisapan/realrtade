
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { InvestmentCalculator } from "./InvestmentCalculator";
import { RecommendationRating } from "./RecommendationRating";
import { 
  MapPin, 
  Building, 
  DollarSign, 
  Users, 
  ArrowRight, 
  Clock,
  Check
} from "lucide-react";

interface PropertyDetailContentProps {
  property: any;
}

export const PropertyDetailContent = ({ property }: PropertyDetailContentProps) => {
  return (
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
      
      <div className="flex justify-between items-center mb-8">
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
        
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg border">
            <h3 className="font-medium mb-3">Key Features</h3>
            <ul className="space-y-2">
              {property.keyFeatures.map((feature: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <h3 className="font-medium mb-3">Financial Metrics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Cap Rate</span>
                <span className="font-medium">{property.capRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cash-on-Cash Return</span>
                <span className="font-medium">{property.cashOnCash || Math.round(property.roi * 0.75)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Debt Service Ratio</span>
                <span className="font-medium">{property.debtServiceRatio || "1.25"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Loan-to-Value</span>
                <span className="font-medium">{property.loanToValue || "65"}%</span>
              </div>
            </div>
          </div>
          
          <Button variant="outline" className="w-full">
            Download Financial Reports
          </Button>
        </div>
      </div>
    </div>
  );
};
