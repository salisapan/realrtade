
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
    if (score >= 8) return "text-blue-600";
    if (score >= 6) return "text-blue-500";
    return "text-blue-400";
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
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1.5">
          <Star className="h-4 w-4 text-blue-500 fill-blue-500" />
          Deal Recommendation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Score display */}
          <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Investment Score</div>
              <div className={`text-xl font-bold ${getScoreColor(score)}`}>
                {score}/10
              </div>
              <div className="text-xs mt-0.5">{getScoreText(score)}</div>
            </div>
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star 
                  key={i} 
                  className={`h-4 w-4 ${i < Math.ceil(score/2) ? "text-blue-500 fill-blue-500" : "text-gray-300"}`} 
                />
              ))}
            </div>
          </div>
          
          {/* Key factors */}
          <div>
            <h4 className="text-xs font-medium mb-1.5">Key Factors</h4>
            <ul className="space-y-1.5">
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs">Market Trend</span>
                </div>
                <Badge variant={getBadgeVariant(marketTrend)} className="text-xs h-5 px-1.5">{marketTrend}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs">Entrepreneur</span>
                </div>
                <Badge variant={getBadgeVariant(entrepreneurExperience)} className="text-xs h-5 px-1.5">{entrepreneurExperience}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs">Risk Level</span>
                </div>
                <Badge variant={getBadgeVariant(riskLevel === "Low" ? "High" : riskLevel === "High" ? "Low" : "Medium")} className="text-xs h-5 px-1.5">{riskLevel}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs">Area Demand</span>
                </div>
                <Badge variant={getBadgeVariant(demandLevel)} className="text-xs h-5 px-1.5">{demandLevel}</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs">Return Potential</span>
                </div>
                <Badge variant={getBadgeVariant(returnPotential)} className="text-xs h-5 px-1.5">{returnPotential}</Badge>
              </li>
            </ul>
          </div>
          
          {/* Summary */}
          <div className="bg-muted p-2.5 rounded-lg text-xs">
            <p>{getRecommendationSummary(score, riskLevel, demandLevel)}</p>
          </div>
          
          <p className="text-xs text-gray-500 text-center">
            Based on historical data and market analysis.
            Not a guarantee of future performance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

function getRecommendationSummary(score: number, riskLevel: string, demandLevel: string): string {
  if (score >= 8) {
    return `High-quality investment with ${riskLevel.toLowerCase()} risk and ${demandLevel.toLowerCase()} area demand. Strong potential returns based on current metrics.`;
  } else if (score >= 6) {
    return `Good potential with ${riskLevel.toLowerCase()} risk factors. ${demandLevel} demand suggests reasonable stability. Review financials carefully.`;
  } else if (score >= 4) {
    return `Balanced opportunity with moderate risk. The ${demandLevel.toLowerCase()} demand may impact returns. Consider your risk tolerance.`;
  } else {
    return `Higher than average risk factors. The ${demandLevel.toLowerCase()} demand suggests careful consideration is needed.`;
  }
}
