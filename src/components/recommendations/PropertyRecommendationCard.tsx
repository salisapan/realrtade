
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, ExternalLink, Heart, Star, Building2, DollarSign, AlertTriangle, Clock } from "lucide-react";
import { PropertyRecommendation } from "./types";
import { Badge } from "@/components/ui/badge";

interface PropertyRecommendationCardProps {
  recommendation: PropertyRecommendation;
}

export const PropertyRecommendationCard: React.FC<PropertyRecommendationCardProps> = ({ 
  recommendation 
}) => {
  const navigate = useNavigate();
  
  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };
  
  const viewPropertyDetails = () => {
    navigate(`/property/${recommendation.id}`);
  };
  
  const quickInvest = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/property/${recommendation.id}?invest=true`);
  };

  return (
    <Card className="overflow-hidden border hover:shadow-md transition-all hover:translate-y-[-3px] cursor-pointer group" onClick={viewPropertyDetails}>
      {/* Property image */}
      <div className="relative h-48 overflow-hidden">
        <div className="absolute top-2 right-2 z-10">
          <Badge className={`${getRiskBadgeColor(recommendation.riskLevel)} flex items-center gap-1`}>
            <AlertTriangle className="h-3 w-3" />
            {recommendation.riskLevel} Risk
          </Badge>
        </div>
        <div className="absolute top-2 left-2 z-10">
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {recommendation.assetType}
          </Badge>
        </div>
        <img 
          src={recommendation.imageUrl} 
          alt={recommendation.name} 
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-white">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg line-clamp-1">{recommendation.name}</h3>
            <div className="flex items-center bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              {recommendation.matchScore}% Match
            </div>
          </div>
          <p className="text-sm opacity-90">{recommendation.location}</p>
        </div>
      </div>
      
      {/* Property details */}
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1 text-blue-600">
            <DollarSign className="h-4 w-4" />
            <span className="font-medium">{recommendation.projectedYield} Yield</span>
          </div>
          <div className="text-sm text-gray-600">{recommendation.price}</div>
        </div>
        
        <div className="flex items-start gap-2 mb-4">
          <div className="bg-blue-100 rounded-full p-1 mt-1 flex-shrink-0">
            <Brain className="h-3 w-3 text-blue-600" />
          </div>
          <p className="text-sm text-gray-700">{recommendation.rationale}</p>
        </div>
        
        <div className="text-xs text-gray-500">Developer: {recommendation.developerName}</div>
      </CardContent>
      
      <CardFooter className="flex gap-2 p-4 pt-0 justify-between">
        <Button variant="outline" size="sm" className="flex-1">
          <ExternalLink className="h-4 w-4 mr-1" />
          View Details
        </Button>
        <Button variant="default" size="sm" className="flex-1" onClick={quickInvest}>
          <Heart className="h-4 w-4 mr-1" />
          Quick Invest
        </Button>
      </CardFooter>
    </Card>
  );
};
