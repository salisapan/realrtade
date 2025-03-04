
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { InvestmentCalculator } from "./InvestmentCalculator";
import { RecommendationRating } from "./RecommendationRating";
import { InvestmentIntentForm } from "./InvestmentIntentForm";
import { 
  MapPin, 
  Building, 
  DollarSign, 
  Users, 
  Clock,
  Check,
  ShieldCheck,
  CalendarDays,
  Percent,
  BarChart3
} from "lucide-react";

interface PropertyDetailContentProps {
  property: any;
}

export const PropertyDetailContent = ({ property }: PropertyDetailContentProps) => {
  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl md:text-2xl font-bold font-heading">{property.name}</h2>
            {property.verified && (
              <Badge className="bg-secondary text-primary text-xs flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Verified
              </Badge>
            )}
          </div>
          <div className="flex items-center text-muted-foreground text-sm">
            <MapPin className="w-3.5 h-3.5 mr-1.5" />
            <span>{property.location}</span>
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-xl md:text-2xl font-bold text-primary font-heading">${property.price.toLocaleString()}</span>
          <Badge variant="outline" className="mt-1 text-xs">{property.type}</Badge>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground mb-6 max-w-3xl">{property.description}</p>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-muted p-3 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Percent className="w-3.5 h-3.5" />
            <span>Target ROI</span>
          </div>
          <div className="text-base font-semibold">{property.roi}%</div>
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Term Length</span>
          </div>
          <div className="text-base font-semibold">{property.term} years</div>
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Min Investment</span>
          </div>
          <div className="text-base font-semibold">${property.minInvestment.toLocaleString()}</div>
        </div>
        <div className="bg-muted p-3 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Cap Rate</span>
          </div>
          <div className="text-base font-semibold">{property.capRate}%</div>
        </div>
      </div>
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium">Funding Progress</span>
          <span className="text-xs font-medium text-primary">{property.fundingProgress}%</span>
        </div>
        <Progress value={property.fundingProgress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>${property.currentFunding.toLocaleString()} raised</span>
          <span>Goal: ${property.fundingGoal.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
          <div className="flex items-center">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            <span>{property.investors} investors</span>
          </div>
          <div className="flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            <span>{property.daysLeft} days left</span>
          </div>
          {property.occupancyRate && (
            <div className="flex items-center">
              <Building className="w-3.5 h-3.5 mr-1.5" />
              <span>{property.occupancyRate}% occupied</span>
            </div>
          )}
        </div>
        
        <InvestmentIntentForm 
          propertyId={property.id || "prop1"} 
          propertyName={property.name}
          minInvestment={property.minInvestment}
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-luxury p-5">
          <h3 className="text-sm font-medium mb-3 font-heading">Investment Calculator</h3>
          <InvestmentCalculator 
            roi={property.roi} 
            minInvestment={property.minInvestment} 
            term={property.term} 
          />
        </div>
        
        <div className="card-luxury p-5">
          <h3 className="text-sm font-medium mb-3 font-heading">Investment Recommendation</h3>
          <RecommendationRating 
            score={property.recommendationScore || 8}
            marketTrend={property.marketTrend || "Strong Growth"}
            entrepreneurExperience={property.entrepreneurExperience || "Excellent"}
            riskLevel={property.riskLevel || "Low"}
            demandLevel={property.demandLevel || "High"}
            returnPotential={property.returnPotential || "Strong"}
          />
        </div>
        
        <div className="card-luxury p-5">
          <div className="mb-5">
            <h3 className="text-sm font-medium mb-3 font-heading">Key Features</h3>
            <ul className="space-y-2">
              {property.keyFeatures?.map((feature: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="mb-5">
            <h3 className="text-sm font-medium mb-3 font-heading">Financial Metrics</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cap Rate</span>
                <span className="font-medium">{property.capRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash-on-Cash Return</span>
                <span className="font-medium">{property.cashOnCash || Math.round(property.roi * 0.75)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Debt Service Ratio</span>
                <span className="font-medium">{property.debtServiceRatio || "1.25"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan-to-Value</span>
                <span className="font-medium">{property.loanToValue || "65"}%</span>
              </div>
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
