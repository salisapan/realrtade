
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, ExternalLink, Heart, Star, Building2, DollarSign, AlertTriangle, Clock, ImageOff } from "lucide-react";
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

  // Property Image Error Handling
  const [imageError, setImageError] = React.useState(false);
  
  const propertyImages = [
    "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    "https://images.unsplash.com/photo-1622015663084-307d19eabca2?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    "https://images.unsplash.com/photo-1577415124269-fc1140a69e91?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  ];
  
  // Choose a fallback image based on property id
  const getFallbackImage = () => {
    if (!recommendation.id) return propertyImages[0];
    const index = parseInt(recommendation.id.slice(-1)) % propertyImages.length;
    return propertyImages[index];
  };

  return (
    <Card 
      className="overflow-hidden border relative animate-fade-in group cursor-pointer transition-all duration-500 
                hover:shadow-md hover:shadow-blue-100/70 hover:-translate-y-1" 
      onClick={viewPropertyDetails}
    >
      {/* Glowing background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-100/20 to-transparent opacity-0 blur-xl group-hover:opacity-30 transition-opacity duration-500 z-0"></div>
      
      {/* AI-powered glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-200/0 via-blue-300/0 to-blue-200/0 
                     opacity-0 group-hover:opacity-20 blur-md group-hover:animate-pulse-slow z-0"></div>
      
      {/* Property image with animated overlay */}
      <div className="relative h-48 overflow-hidden">
        <div className="absolute top-2 right-2 z-10 transform transition-transform duration-300 group-hover:translate-y-0 group-hover:scale-105">
          <Badge className={`${getRiskBadgeColor(recommendation.riskLevel)} flex items-center gap-1 
                           shadow-sm group-hover:shadow-md transition-shadow duration-300`}>
            <AlertTriangle className="h-3 w-3" />
            {recommendation.riskLevel} Risk
          </Badge>
        </div>
        <div className="absolute top-2 left-2 z-10 transform transition-transform duration-300 group-hover:translate-y-0 group-hover:scale-105">
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 flex items-center gap-1 
                           shadow-sm group-hover:shadow-md transition-shadow duration-300">
            <Building2 className="h-3 w-3" />
            {recommendation.assetType}
          </Badge>
        </div>
        {imageError ? (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <ImageOff className="h-12 w-12 text-gray-400" />
          </div>
        ) : (
          <img 
            src={recommendation.imageUrl || getFallbackImage()} 
            alt={recommendation.name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            onError={() => setImageError(true)}
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg line-clamp-1 group-hover:text-blue-50 transition-colors duration-300">{recommendation.name}</h3>
            <div className="flex items-center bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full transform group-hover:scale-105 transition-transform duration-300 shadow-sm group-hover:shadow-glow-sm">
              {recommendation.matchScore}% Match
            </div>
          </div>
          <p className="text-sm opacity-90">{recommendation.location}</p>
        </div>
      </div>
      
      {/* Property details with hover effects */}
      <CardContent className="p-4 relative z-10">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1 text-blue-600 group-hover:text-blue-700 transition-colors duration-300">
            <DollarSign className="h-4 w-4" />
            <span className="font-medium">{recommendation.projectedYield} Yield</span>
          </div>
          <div className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors duration-300">{recommendation.price}</div>
        </div>
        
        <div className="flex items-start gap-2 mb-4 group-hover:bg-blue-50/50 p-2 rounded-md transition-colors duration-500">
          <div className="bg-blue-100 rounded-full p-1 mt-1 flex-shrink-0 group-hover:bg-blue-200 transition-colors duration-300">
            <Brain className="h-3 w-3 text-blue-600 group-hover:text-blue-700 transition-colors duration-300" />
          </div>
          <p className="text-sm text-gray-700 group-hover:text-gray-800 transition-colors duration-300">{recommendation.rationale}</p>
        </div>
        
        <div className="text-xs text-gray-500 group-hover:text-gray-600 transition-colors duration-300">
          Developer: <span className="group-hover:text-blue-600 transition-colors duration-300">{recommendation.developerName}</span>
        </div>
      </CardContent>
      
      <CardFooter className="flex gap-2 p-4 pt-0 justify-between relative z-10">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1 transition-all duration-300 hover:shadow-md hover:shadow-blue-100/50 
                    hover:border-blue-200 group-hover:bg-white/80"
        >
          <ExternalLink className="h-4 w-4 mr-1" />
          View Details
        </Button>
        <Button 
          variant="default" 
          size="sm" 
          className="flex-1 transition-all duration-300 hover:shadow-md hover:shadow-blue-100/50 
                    bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          onClick={quickInvest}
        >
          <Heart className="h-4 w-4 mr-1" />
          Quick Invest
        </Button>
      </CardFooter>
      
      {/* Animated border effect on hover */}
      <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r from-blue-400 to-blue-200 
                     group-hover:w-full transition-all duration-1000 opacity-0 group-hover:opacity-100"></div>
    </Card>
  );
};
