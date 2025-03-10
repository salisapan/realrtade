
import React, { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Info, ChevronsRight, Star, Heart } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { RecommendationPreferenceForm } from "@/components/recommendations/RecommendationPreferenceForm";
import { PropertyRecommendationCard } from "@/components/recommendations/PropertyRecommendationCard";
import { AIRecommendationHeader } from "@/components/recommendations/AIRecommendationHeader";
import { useInvestorProfile } from "@/components/properties/useInvestorProfile";
import { generateRecommendations } from "@/components/recommendations/recommendationEngine";
import { UserPreferences, PropertyRecommendation } from "@/components/recommendations/types";

const Recommendations = () => {
  const { toast } = useToast();
  const { profile } = useInvestorProfile();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [recommendations, setRecommendations] = useState<PropertyRecommendation[]>([]);
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  // Check if user has saved preferences
  useEffect(() => {
    const savedPreferences = localStorage.getItem("investmentPreferences");
    if (savedPreferences) {
      setPreferences(JSON.parse(savedPreferences));
      setIsFirstVisit(false);
    }
  }, []);

  // Generate recommendations when preferences change
  useEffect(() => {
    if (preferences) {
      setIsLoading(true);
      // Save preferences to localStorage
      localStorage.setItem("investmentPreferences", JSON.stringify(preferences));
      
      // Simulate AI processing time
      setTimeout(() => {
        const newRecommendations = generateRecommendations(preferences);
        setRecommendations(newRecommendations);
        setIsLoading(false);
        
        toast({
          title: "Recommendations Ready!",
          description: "RealAI has found perfect matches for your preferences",
        });
      }, 1500);
    }
  }, [preferences, toast]);

  const handlePreferencesSubmit = (newPreferences: UserPreferences) => {
    setPreferences(newPreferences);
    setIsFirstVisit(false);
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 p-4 md:p-8 pb-16 md:pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Personalized Recommendations</h1>
            <p className="text-gray-600">
              Let RealAI find the perfect investment opportunities tailored just for you
            </p>
          </div>

          {/* Onboarding message for first-time visitors */}
          {isFirstVisit && (
            <Card className="mb-6 border-blue-200 bg-blue-50 animate-fade-in">
              <CardContent className="p-4 md:p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-100 p-2 rounded-full">
                    <Info className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-blue-900 mb-1">Welcome to Personalized Recommendations!</h3>
                    <p className="text-blue-700 text-sm">
                      Hi! I'm RealAI, your investment assistant. Answer a few quick questions about your preferences, 
                      and I'll find investments perfectly tailored to your goals and comfort level.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preferences form */}
          <div className="mb-8">
            <RecommendationPreferenceForm 
              initialPreferences={preferences}
              onSubmit={handlePreferencesSubmit} 
            />
          </div>

          {/* Recommendations section */}
          {preferences && (
            <div className="animate-fade-in">
              <AIRecommendationHeader 
                userName={profile?.fullName || "Investor"}
                isLoading={isLoading}
              />
              
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="border shadow-sm h-96 animate-pulse">
                      <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                      <CardContent className="p-4">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                        <div className="h-20 bg-gray-200 rounded mb-4"></div>
                        <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                  {recommendations.map((recommendation) => (
                    <PropertyRecommendationCard 
                      key={recommendation.id} 
                      recommendation={recommendation} 
                    />
                  ))}
                </div>
              )}
              
              {!isLoading && recommendations.length === 0 && (
                <div className="text-center p-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <Brain className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">No recommendations yet</h3>
                  <p className="text-gray-500 mb-4">Try adjusting your preferences to get some great recommendations!</p>
                </div>
              )}

              {!isLoading && recommendations.length > 0 && (
                <div className="flex justify-center mt-8">
                  <Button variant="outline" className="gap-2">
                    <ChevronsRight className="h-4 w-4" />
                    See More Options
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Recommendations;
