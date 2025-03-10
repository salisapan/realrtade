
import React from "react";
import { Brain } from "lucide-react";

interface AIRecommendationHeaderProps {
  userName: string;
  isLoading: boolean;
}

export const AIRecommendationHeader: React.FC<AIRecommendationHeaderProps> = ({ 
  userName, 
  isLoading 
}) => {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
          <Brain className="h-6 w-6 text-white" />
        </div>
        {isLoading && (
          <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
        )}
      </div>
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {isLoading 
            ? "Analyzing properties that match your profile..." 
            : `Hey ${userName}, here's what I've found for you today!`}
        </h2>
        <p className="text-gray-600 text-sm">
          {isLoading 
            ? "RealAI is evaluating market trends and your preferences to find the perfect match" 
            : "These recommendations are tailored to your investment preferences and goals"}
        </p>
      </div>
    </div>
  );
};
