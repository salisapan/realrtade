
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, TrendingUp, Globe } from "lucide-react";
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
  const [cherryData, setCherryData] = useState<any>({
    averageSalePrice: "$875,500",
    saleIncrease: "+4.2%",
    averageRent: "$3,250",
    rentIncrease: "+2.7%",
    daysOnMarket: "28",
    inventoryChange: "-15%"
  });

  // Fetch data on component mount
  useEffect(() => {
    fetchPropertyData();
  }, [propertyAddress, propertyCity]);

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
              <TabsTrigger value="market-data" className="text-xs">
                Market Data
              </TabsTrigger>
              <TabsTrigger value="cherry-data" className="text-xs">
                CHERRY Data
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
            
            <TabsContent value="cherry-data" className="mt-4">
              <div className="grid grid-cols-2 gap-3 p-1">
                <div className="bg-gray-50 p-3 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm text-gray-500">Average Sale Price</div>
                  <div className="flex items-baseline mt-1">
                    <span className="text-lg font-medium">{cherryData.averageSalePrice}</span>
                    <span className="text-xs text-green-500 ml-2">{cherryData.saleIncrease}</span>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm text-gray-500">Average Rent</div>
                  <div className="flex items-baseline mt-1">
                    <span className="text-lg font-medium">{cherryData.averageRent}</span>
                    <span className="text-xs text-green-500 ml-2">{cherryData.rentIncrease}</span>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm text-gray-500">Days on Market</div>
                  <div className="flex items-baseline mt-1">
                    <span className="text-lg font-medium">{cherryData.daysOnMarket}</span>
                    <span className="text-xs text-blue-500 ml-2">days</span>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm text-gray-500">Inventory</div>
                  <div className="flex items-baseline mt-1">
                    <span className="text-lg font-medium">37 units</span>
                    <span className="text-xs text-red-500 ml-2">{cherryData.inventoryChange}</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-md mt-4">
                <div className="flex items-start gap-3">
                  <Globe className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">CHERRY Market Analysis</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      This market shows strong fundamentals with decreasing inventory and increasing prices, indicating a seller's market. The property is in an area with high demand and limited supply.
                    </p>
                  </div>
                </div>
              </div>
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
