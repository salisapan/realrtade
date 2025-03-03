
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Star, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  BarChart2,
  Users
} from "lucide-react";

interface RecommendationRatingProps {
  score: number; // 1-10
  marketTrend: string;
  entrepreneurExperience: string;
  riskLevel: string;
  demandLevel: string;
  returnPotential: string;
}

export const RecommendationRating = ({ 
  score, 
  marketTrend,
  entrepreneurExperience,
  riskLevel,
  demandLevel,
  returnPotential
}: RecommendationRatingProps) => {
  // Helper to determine score color
  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-amber-600";
    return "text-red-600";
  };

  // Helper to determine score text
  const getScoreText = (score: number) => {
    if (score >= 8) return "Excellent";
    if (score >= 6) return "Good";
    if (score >= 4) return "Average";
    return "Risky";
  };

  // Helper to get badge variant based on value
  const getBadgeVariant = (value: string) => {
    if (value.includes("High") || value.includes("Strong") || value.includes("Excellent")) return "default";
    if (value.includes("Medium") || value.includes("Moderate") || value.includes("Good")) return "outline";
    return "destructive";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" />
          Deal Recommendation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Score display */}
          <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
            <div>
              <div className="text-sm text-gray-500">Investment Score</div>
              <div className={`text-3xl font-bold ${getScoreColor(score)}`}>
                {score}/10
              </div>
              <div className="text-sm mt-1">{getScoreText(score)}</div>
            </div>
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star 
                  key={i} 
                  className={`h-5 w-5 ${i < Math.ceil(score/2) ? "text-amber-500 fill-amber-500" : "text-gray-300"}`} 
                />
              ))}
            </div>
          </div>
          
          {/* Key factors */}
          <div>
            <h4 className="text-sm font-medium mb-2">Key Factors</h4>
            <ul className="space-y-2">
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Market Trend</span>
                </div>
                <Badge variant={getBadgeVariant(marketTrend)}>{marketTrend}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Entrepreneur Experience</span>
                </div>
                <Badge variant={getBadgeVariant(entrepreneurExperience)}>{entrepreneurExperience}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Risk Level</span>
                </div>
                <Badge variant={getBadgeVariant(riskLevel === "Low" ? "High" : riskLevel === "High" ? "Low" : "Medium")}>{riskLevel}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Area Demand</span>
                </div>
                <Badge variant={getBadgeVariant(demandLevel)}>{demandLevel}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Return Potential</span>
                </div>
                <Badge variant={getBadgeVariant(returnPotential)}>{returnPotential}</Badge>
              </li>
            </ul>
          </div>
          
          {/* Summary */}
          <div className="bg-gray-50 p-3 rounded-lg text-sm">
            <p>{getRecommendationSummary(score, riskLevel, demandLevel)}</p>
          </div>
          
          <p className="text-xs text-gray-500 text-center">
            This recommendation is based on historical data and market analysis.
            It is not a guarantee of future performance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

function getRecommendationSummary(score: number, riskLevel: string, demandLevel: string): string {
  if (score >= 8) {
    return `This appears to be a high-quality investment opportunity with ${riskLevel.toLowerCase()} risk and ${demandLevel.toLowerCase()} demand in the area. The financial metrics and market conditions indicate strong potential for returns.`;
  } else if (score >= 6) {
    return `This investment shows good potential with ${riskLevel.toLowerCase()} risk factors. The ${demandLevel.toLowerCase()} demand in the area suggests reasonable stability, though investors should review the financials carefully.`;
  } else if (score >= 4) {
    return `This investment presents a balanced opportunity with moderate risk. The ${demandLevel.toLowerCase()} demand may impact returns, so investors should consider their risk tolerance before proceeding.`;
  } else {
    return `This investment carries higher than average risk factors and may not be suitable for all investors. The ${demandLevel.toLowerCase()} demand and market conditions suggest careful consideration is needed.`;
  }
}
