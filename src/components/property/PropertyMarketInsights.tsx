
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketInsightsList, processMarketInsights } from './MarketInsightsList';
import { AIAnalysisDisplay } from './AIAnalysisDisplay';
import { PropertyDataLoading } from './PropertyDataLoading';
import { PropertyDataError } from './PropertyDataError';

interface PropertyMarketInsightsProps {
  propertyAddress: string;
  propertyCity: string;
}

export const PropertyMarketInsights = ({ propertyAddress, propertyCity }: PropertyMarketInsightsProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [marketData, setMarketData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("market-data");

  // Fetch data on component mount
  useEffect(() => {
    fetchPropertyData();
  }, []);

  const fetchPropertyData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Mock data instead of using FirecrawlService
      // This simulates fetching market data for the property
      setTimeout(() => {
        const mockMarketData = {
          data: [
            {
              title: "Property Value Trends",
              content: `Properties in ${propertyCity} have seen an average appreciation of 8.2% over the past year. ${propertyAddress} is located in a high-demand area with limited new construction, suggesting potential for continued value growth.`
            },
            {
              title: "Rental Market Analysis",
              content: `The rental market in ${propertyCity} remains strong with vacancy rates at historic lows of 3.5%. Average rents have increased by 5.7% year-over-year, outpacing the national average of 3.2%.`
            },
            {
              title: "Economic Indicators",
              content: `${propertyCity}'s job market shows positive growth with unemployment at 4.1%, below the national average. Major employers in the area have announced expansion plans, which should support housing demand.`
            },
            {
              title: "Supply and Demand Balance",
              content: `New housing starts in ${propertyCity} are currently 15% below historical averages, while population growth continues at 1.8% annually. This imbalance suggests continued upward pressure on property values.`
            }
          ],
          aiAnalysis: {
            summary: `${propertyAddress} in ${propertyCity} is positioned in a strong real estate market with positive fundamentals. Limited new supply and steady demand create favorable conditions for property appreciation and rental growth.`,
            insights: [
              {
                title: "Strong Rental Demand",
                content: "Low vacancy rates and rising rents indicate strong rental demand, which is positive for cash flow potential.",
                type: "positive"
              },
              {
                title: "Favorable Supply Constraints",
                content: "Limited new construction relative to population growth suggests continued upward pressure on values.",
                type: "positive"
              },
              {
                title: "Economic Resilience",
                content: "The local economy shows resilience with job growth and major employer expansions supporting housing demand.",
                type: "positive"
              },
              {
                title: "Interest Rate Sensitivity",
                content: "Rising interest rates could impact affordability and dampen price appreciation in the short term.",
                type: "neutral"
              }
            ],
            investmentRecommendation: "Buy",
            riskAssessment: "This property presents a moderate risk profile with strong market fundamentals supporting long-term performance.",
            marketTrends: "The market shows positive momentum with supply constraints and steady demand growth likely to continue driving property values upward."
          }
        };
        
        setMarketData(mockMarketData);
        toast({
          title: "Success",
          description: "Market data retrieved successfully",
        });
        setIsLoading(false);
      }, 1500); // Simulate network request time
    } catch (err) {
      setError("An unexpected error occurred");
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching data",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const insights = marketData ? processMarketInsights(marketData) : [];
  const aiAnalysis = marketData?.aiAnalysis || null;

  const renderContent = () => {
    if (isLoading) {
      return <PropertyDataLoading />;
    }
    
    if (error) {
      return <PropertyDataError error={error} onRetry={fetchPropertyData} />;
    }
    
    if (marketData) {
      return (
        <div className="space-y-4">
          <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="market-data" className="text-xs">
                Market Data
              </TabsTrigger>
              <TabsTrigger 
                value="ai-analysis" 
                className="text-xs"
                disabled={!aiAnalysis}
              >
                AI Analysis
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="market-data" className="mt-4">
              <MarketInsightsList insights={insights} />
            </TabsContent>
            
            <TabsContent value="ai-analysis" className="mt-4">
              <AIAnalysisDisplay 
                aiAnalysis={aiAnalysis} 
                onGenerateAnalysis={fetchPropertyData} 
                isOpenAIApiKeySet={true}
              />
            </TabsContent>
          </Tabs>
          
          <Button 
            onClick={fetchPropertyData} 
            variant="outline" 
            size="sm" 
            className="mt-4 w-full"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
            Refresh Data
          </Button>
        </div>
      );
    }
    
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-gray-600 mb-4">No market data available yet.</p>
        <Button onClick={fetchPropertyData}>
          Fetch Market Data
        </Button>
      </div>
    );
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Market Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
};
