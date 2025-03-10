
import React, { useState } from 'react';
import { AppSidebar } from "@/components/AppSidebar";
import { PropertyRecommendation, UserPreferences } from '@/components/recommendations/types';
import { getRecommendations } from '@/components/recommendations/recommendationEngine';
import { RecommendationPreferenceForm } from '@/components/recommendations/RecommendationPreferenceForm';
import { PropertyRecommendationCard } from '@/components/recommendations/PropertyRecommendationCard';
import { AIRecommendationHeader } from '@/components/recommendations/AIRecommendationHeader';
import { useToast } from '@/hooks/use-toast';

const Recommendations = () => {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<UserPreferences>({
    riskTolerance: 'medium',
    investmentHorizon: '3-5',
    assetTypes: ['Commercial', 'Residential']
  });
  const [recommendations, setRecommendations] = useState<PropertyRecommendation[]>([]);
  const [loading, setLoading] = useState(false);

  const handlePreferenceSubmit = (newPreferences: UserPreferences) => {
    setLoading(true);
    
    // Simulate API delay for a more realistic experience
    setTimeout(() => {
      try {
        const newRecommendations = getRecommendations(newPreferences);
        setRecommendations(newRecommendations);
        setPreferences(newPreferences);
        
        toast({
          title: "Recommendations Updated",
          description: `Found ${newRecommendations.length} properties matching your preferences`,
          variant: "success"
        });
        
      } catch (error) {
        console.error("Error getting recommendations:", error);
        toast({
          title: "Recommendation Error",
          description: "Unable to get recommendations at this time. Please try again later.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    }, 1200);
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6">
          <AIRecommendationHeader />
          
          <div className="mt-6">
            <RecommendationPreferenceForm 
              onSubmit={handlePreferenceSubmit} 
              initialPreferences={preferences}
            />
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
              <p className="ml-3 text-lg font-medium">Finding perfect matches for you...</p>
            </div>
          ) : recommendations.length > 0 ? (
            <div>
              <h2 className="text-xl font-bold mb-4">Your Personalized Recommendations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recommendations.map((recommendation) => (
                  <PropertyRecommendationCard 
                    key={recommendation.id}
                    recommendation={recommendation}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium mb-2">No recommendations yet</h3>
              <p className="text-gray-500">Update your preferences to get personalized property recommendations</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Recommendations;
