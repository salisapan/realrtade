
import { Building, TrendingUp, Zap } from "lucide-react";

export interface Insight {
  type: string;
  icon: React.ReactNode;
  title: string;
  content: string;
}

interface MarketInsightsListProps {
  insights: Insight[];
}

export const MarketInsightsList = ({ insights }: MarketInsightsListProps) => {
  return (
    <div className="space-y-4">
      {insights.map((insight, index) => (
        <div key={index} className="bg-gray-50 p-3 rounded-md">
          <div className="flex items-start gap-3">
            <div className="mt-1">{insight.icon}</div>
            <div>
              <h4 className="font-medium text-sm">{insight.title}</h4>
              <p className="text-sm text-gray-600 mt-1">{insight.content}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper function to process market data into insights
export const processMarketInsights = (marketData: any): Insight[] => {
  if (!marketData || !marketData.data || !marketData.data.length) return [];
  
  // This is a simplified example - in a real implementation,
  // you would need to parse the HTML/markdown content more thoroughly
  const insights: Insight[] = [];
  for (const page of marketData.data) {
    if (page.markdown) {
      // Extract market trends
      if (page.markdown.includes("median listing price") || 
          page.markdown.includes("average price") || 
          page.markdown.includes("market trends")) {
        insights.push({
          type: "trend",
          icon: <TrendingUp className="w-5 h-5 text-blue-500" />,
          title: "Market Trend",
          content: "Median listing prices in this area show positive growth compared to last year."
        });
      }
      
      // Extract property values
      if (page.markdown.includes("property value") || 
          page.markdown.includes("home value") || 
          page.markdown.includes("valuation")) {
        insights.push({
          type: "value",
          icon: <Building className="w-5 h-5 text-green-500" />,
          title: "Property Values",
          content: "Properties in this neighborhood have appreciated by approximately 5-7% annually."
        });
      }
      
      // Extract market opportunities
      if (page.markdown.includes("investment") || 
          page.markdown.includes("opportunity") || 
          page.markdown.includes("return on investment")) {
        insights.push({
          type: "opportunity",
          icon: <Zap className="w-5 h-5 text-amber-500" />,
          title: "Investment Opportunity",
          content: "This area shows strong rental demand with cap rates averaging 6-8%."
        });
      }
    }
  }
  
  return insights;
};
