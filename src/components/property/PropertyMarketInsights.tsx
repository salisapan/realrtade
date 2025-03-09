
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FirecrawlService } from "@/utils/FirecrawlService";
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
      const result = await FirecrawlService.crawlPropertyData(propertyAddress, propertyCity);
      
      if (result.success && result.data) {
        setMarketData(result.data);
        toast({
          title: "Success",
          description: "Market data retrieved successfully",
        });
      } else {
        setError(result.error || "Failed to retrieve market data");
        toast({
          title: "Error",
          description: result.error || "Failed to retrieve market data",
          variant: "destructive",
        });
      }
    } catch (err) {
      setError("An unexpected error occurred");
      toast({
        title: "Error",
        description: "An unexpected error occurred while fetching data",
        variant: "destructive",
      });
    } finally {
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
