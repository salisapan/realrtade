
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, TrendingUp, RefreshCw, ExternalLink } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<string>("cherre-data");
  const [cherreData, setCherreData] = useState<any>({
    averagePrice: "$875,500",
    priceChange: "+4.2%",
    rentalYield: "5.8%",
    yieldChange: "+0.3%",
    vacancyRate: "3.2%",
    vacancyChange: "-0.7%",
    pricePerSqFt: "$428",
    pricePerSqFtChange: "+2.1%",
    daysOnMarket: "42 days",
    daysOnMarketChange: "-5 days"
  });
  const [isRefreshingCherre, setIsRefreshingCherre] = useState(false);

  // Fetch data on component mount
  useEffect(() => {
    fetchPropertyData();
  }, []);

  const fetchPropertyData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Mock data for market insights
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

  const refreshCherreData = () => {
    setIsRefreshingCherre(true);
    // Simulate fetching data from Cherre API
    setTimeout(() => {
      // Update with "new" data - in a real app, this would be an actual API call
      setCherreData({
        averagePrice: "$875,500",
        priceChange: "+4.2%",
        rentalYield: "5.8%",
        yieldChange: "+0.3%",
        vacancyRate: "3.2%",
        vacancyChange: "-0.7%",
        pricePerSqFt: "$428",
        pricePerSqFtChange: "+2.1%",
        daysOnMarket: "42 days",
        daysOnMarketChange: "-5 days"
      });
      
      toast({
        title: "Success",
        description: "CHERRE market data updated successfully",
      });
      setIsRefreshingCherre(false);
    }, 1200);
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cherre-data" className="text-xs">
                CHERRE Data
              </TabsTrigger>
              <TabsTrigger value="market-data" className="text-xs">
                Market Analysis
              </TabsTrigger>
              <TabsTrigger 
                value="ai-analysis" 
                className="text-xs"
                disabled={!aiAnalysis}
              >
                AI Analysis
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="cherre-data" className="mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Average Sale Price</div>
                    <div className="flex justify-between items-end">
                      <div className="text-base font-bold">{cherreData.averagePrice}</div>
                      <div className="text-xs font-medium text-green-600">{cherreData.priceChange}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Source: CHERRE Data Platform</div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Rental Yield</div>
                    <div className="flex justify-between items-end">
                      <div className="text-base font-bold">{cherreData.rentalYield}</div>
                      <div className="text-xs font-medium text-green-600">{cherreData.yieldChange}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Source: CHERRE Real Estate Analytics</div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Vacancy Rate</div>
                    <div className="flex justify-between items-end">
                      <div className="text-base font-bold">{cherreData.vacancyRate}</div>
                      <div className="text-xs font-medium text-green-600">{cherreData.vacancyChange}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Source: CHERRE Market Intelligence</div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Price Per Square Foot</div>
                    <div className="flex justify-between items-end">
                      <div className="text-base font-bold">{cherreData.pricePerSqFt}</div>
                      <div className="text-xs font-medium text-green-600">{cherreData.pricePerSqFtChange}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Source: CHERRE Property Metrics</div>
                  </div>
                </div>
                
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium mb-2">Market Summary - {propertyCity}</h4>
                  <p className="text-xs text-gray-600">
                    Real estate market in {propertyCity} is showing signs of continued growth with increasing prices. 
                    Data from CHERRE's real estate platform indicates moderate appreciation with promising 
                    investment potential and strong rental demand.
                  </p>
                </div>
                
                <div className="flex justify-between items-center pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8"
                    onClick={refreshCherreData}
                    disabled={isRefreshingCherre}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshingCherre ? "animate-spin" : ""}`} />
                    {isRefreshingCherre ? "Updating..." : "Refresh CHERRE Data"}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-8"
                    asChild
                  >
                    <a href="https://cherre.com" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View CHERRE Platform
                    </a>
                  </Button>
                </div>
              </div>
            </TabsContent>
            
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
            Refresh All Market Data
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
      <CardHeader className="pb-2">
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
