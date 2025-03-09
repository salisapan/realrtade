
import { Brain, ChevronsUp, ChevronsDown, ArrowRight, AlertTriangle, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AIAnalysisDisplayProps {
  aiAnalysis: any;
  onGenerateAnalysis: () => void;
  isOpenAIApiKeySet: boolean;
}

export const AIAnalysisDisplay = ({ aiAnalysis, onGenerateAnalysis, isOpenAIApiKeySet }: AIAnalysisDisplayProps) => {
  const getInsightIconByType = (type: string) => {
    switch (type) {
      case 'positive':
        return <ChevronsUp className="w-5 h-5 text-green-500" />;
      case 'negative':
        return <ChevronsDown className="w-5 h-5 text-red-500" />;
      case 'neutral':
      default:
        return <ArrowRight className="w-5 h-5 text-blue-500" />;
    }
  };

  const getRecommendationBadge = (recommendation: string) => {
    const lowerRec = recommendation.toLowerCase();
    if (lowerRec.includes('buy') && lowerRec.includes('strong')) {
      return <Badge className="bg-green-500">Strong Buy</Badge>;
    } else if (lowerRec.includes('buy')) {
      return <Badge className="bg-green-400">Buy</Badge>;
    } else if (lowerRec.includes('hold')) {
      return <Badge className="bg-yellow-500">Hold</Badge>;
    } else if (lowerRec.includes('avoid') || lowerRec.includes('sell')) {
      return <Badge className="bg-red-500">Avoid</Badge>;
    }
    return <Badge>{recommendation}</Badge>;
  };

  if (!aiAnalysis) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-gray-600 mb-4">No AI analysis available yet.</p>
        {isOpenAIApiKeySet ? (
          <button onClick={onGenerateAnalysis} className="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm ring-offset-background transition-all hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input">
            Generate AI Analysis
          </button>
        ) : (
          <p className="text-xs text-gray-500">Add your OpenAI API key to enable AI analysis.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-3 rounded-md">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <Brain className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm">AI Market Summary</h4>
              {getRecommendationBadge(aiAnalysis.investmentRecommendation)}
            </div>
            <p className="text-sm text-gray-700 mt-1">{aiAnalysis.summary}</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Investment Insights</h4>
        {aiAnalysis.insights.map((insight: any, index: number) => (
          <div key={index} className="bg-gray-50 p-3 rounded-md">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {getInsightIconByType(insight.type)}
              </div>
              <div>
                <h4 className="font-medium text-sm">{insight.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{insight.content}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Risk Assessment
          </h4>
          <p className="text-sm text-gray-600 mt-1">{aiAnalysis.riskAssessment}</p>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            Market Trends
          </h4>
          <p className="text-sm text-gray-600 mt-1">{aiAnalysis.marketTrends}</p>
        </div>
      </div>
    </div>
  );
};
