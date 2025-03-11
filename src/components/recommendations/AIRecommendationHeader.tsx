
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
    <div className="flex items-center gap-4 mb-6 animate-fade-in">
      <div className="relative flex-shrink-0 group">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full 
                       flex items-center justify-center shadow-md transition-all duration-300 
                       group-hover:shadow-lg group-hover:shadow-blue-200/50 group-hover:scale-105">
          <Brain className="h-6 w-6 text-white" />
        </div>
        {/* Pulsing ring effect */}
        <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-blue-400/0 via-blue-300/10 to-purple-500/0 
                      opacity-0 group-hover:opacity-100 blur-sm animate-pulse-slow"></div>
        {/* Loading spinner */}
        {isLoading && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
            <div className="absolute -inset-2 rounded-full border border-blue-300/30 border-t-transparent animate-spin" style={{ animationDuration: '3s' }}></div>
          </>
        )}
      </div>
      <div className="relative">
        <h2 className="text-xl font-semibold text-gray-900 group-hover:text-blue-700 transition-colors duration-300">
          {isLoading 
            ? "Analyzing properties that match your profile..." 
            : `Hey ${userName}, here's what I've found for you today!`}
        </h2>
        <p className="text-gray-600 text-sm group-hover:text-gray-700 transition-colors duration-300">
          {isLoading 
            ? "RealAI is evaluating market trends and your preferences to find the perfect match" 
            : "These recommendations are tailored to your investment preferences and goals"}
        </p>
        {/* Subtle animated underline */}
        <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gradient-to-r from-blue-300 to-purple-300 
                     group-hover:w-full transition-all duration-1000 opacity-0 group-hover:opacity-60"></div>
      </div>
    </div>
  );
};
