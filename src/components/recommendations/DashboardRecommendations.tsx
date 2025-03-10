
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, ArrowRight, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PropertyRecommendation, UserPreferences } from "./types";
import { getRecommendations } from "./recommendationEngine";

export const DashboardRecommendations = () => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<PropertyRecommendation[]>([]);
  const [hasPreferences, setHasPreferences] = useState(false);
  
  useEffect(() => {
    // Check if user has saved preferences
    const savedPreferences = localStorage.getItem("investmentPreferences");
    if (savedPreferences) {
      setHasPreferences(true);
      const preferences = JSON.parse(savedPreferences) as UserPreferences;
      
      // Generate top 2 recommendations
      const topRecommendations = getRecommendations(preferences).slice(0, 2);
      setRecommendations(topRecommendations);
    }
  }, []);
  
  const handleViewProperty = (id: string) => {
    navigate(`/property/${id}`);
  };
  
  const handleViewAllRecommendations = () => {
    navigate("/recommendations");
  };
  
  const handleSetupPreferences = () => {
    navigate("/recommendations");
  };
  
  if (!hasPreferences) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Personalized Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center text-center p-4">
            <div className="bg-blue-100 p-3 rounded-full mb-3">
              <Brain className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-medium mb-2">Get Personalized Investment Recommendations</h3>
            <p className="text-sm text-gray-600 mb-4">
              Tell us your investment preferences, and RealAI will find the perfect opportunities for you.
            </p>
            <Button onClick={handleSetupPreferences}>
              <Brain className="mr-2 h-4 w-4" />
              Set Up Preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader className="flex justify-between items-center">
        <CardTitle className="text-base md:text-lg">Your Recommendations</CardTitle>
        <Button variant="ghost" size="sm" onClick={handleViewAllRecommendations} className="gap-1 md:gap-2">
          View All <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recommendations.map((recommendation) => (
            <div 
              key={recommendation.id}
              className="flex items-center gap-3 border-b pb-4 last:border-0 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition-colors"
              onClick={() => handleViewProperty(recommendation.id)}
            >
              <div className="w-16 h-16 overflow-hidden rounded-md flex-shrink-0">
                <img 
                  src={recommendation.imageUrl} 
                  alt={recommendation.name} 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-sm truncate">{recommendation.name}</h3>
                  <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
                    {recommendation.matchScore}% Match
                  </span>
                </div>
                <p className="text-xs text-gray-600">{recommendation.assetType} • {recommendation.location}</p>
                <p className="text-xs font-medium text-green-600 mt-1">{recommendation.projectedYield} Yield</p>
              </div>
              <Button size="sm" variant="ghost" className="flex-shrink-0 p-1 h-8 w-8">
                <Heart className="h-4 w-4" />
              </Button>
            </div>
          ))}
          
          <Button 
            variant="outline" 
            onClick={handleViewAllRecommendations}
            className="w-full"
          >
            See All Recommendations
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
