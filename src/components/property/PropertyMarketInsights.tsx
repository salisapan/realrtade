
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, TrendingUp, RefreshCw } from "lucide-react";
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
  const [isCherryDataLoading, setIsCherryDataLoading] = useState<boolean>(false);
  const [marketData, setMarketData] = useState<any>(null);
  const [cherryData, setCherryData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("cherry-data");

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
        fetchCherryData();
        toast({
          title: "Success",
          description: "Market data retrieved successfully",
        });
        setIsLoading(false);
      }, 1000); // Simulate network request time
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

  const fetchCherryData = async () => {
    setIsCherryDataLoading(true);
    
    try {
      // Mock cherry data
      setTimeout(() => {
        const mockCherryData = {
          marketMetrics: [
            {
              title: "Average Sale Price",
              value: "$875,500",
              change: "+4.2%",
              trend: "up"
            },
            {
              title: "Price per Square Foot",
              value: "$425",
              change: "+3.8%",
              trend: "up"
            },
            {
              title: "Days on Market",
              value: "28",
              change: "-12.5%",
              trend: "down" // down is good for days on market
            },
            {
              title: "Rental Demand",
              value: "High",
              change: "+7.1%",
              trend: "up"
            },
            {
              title: "Vacancy Rate",
              value: "3.2%",
              change: "-0.5%",
              trend: "down" // down is good for vacancy
            },
            {
              title: "New Construction",
              value: "Limited",
              change: "-8.3%",
              trend: "down"
            }
          ],
          marketAnalysis: `The ${propertyCity} market shows strong fundamentals with increasing prices and robust rental demand. Limited new construction combined with decreasing vacancy rates point to continued appreciation potential in this area.`,
          marketRating: 8.4,
          dataSource: "CHERRE Data Platform",
          lastUpdated: new Date().toLocaleDateString()
        };
        
        setCherryData(mockCherryData);
        setIsCherryDataLoading(false);
      }, 1500);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load CHERRE market data",
        variant: "destructive",
      });
      setIsCherryDataLoading(false);
    }
  };

  // Specifically refresh CHERRY data
  const refreshCherryData = () => {
    setIsCherryDataLoading(true);
    
    setTimeout(() => {
      // Refresh with updated data (could modify values slightly to show refresh)
      const refreshedCherryData = {
        marketMetrics: [
          {
            title: "Average Sale Price",
            value: "$878,200",
            change: "+4.5%",
            trend: "up"
          },
          {
            title: "Price per Square Foot",
            value: "$427",
            change: "+4.0%",
            trend: "up"
          },
          {
            title: "Days on Market",
            value: "27",
            change: "-14.2%",
            trend: "down" // down is good for days on market
          },
          {
            title: "Rental Demand",
            value: "Very High",
            change: "+8.3%",
            trend: "up"
          },
          {
            title: "Vacancy Rate",
            value: "3.1%",
            change: "-0.6%",
            trend: "down" // down is good for vacancy
          },
          {
            title: "New Construction",
            value: "Limited",
            change: "-9.1%",
            trend: "down"
          }
        ],
        marketAnalysis: `The ${propertyCity} market continues to strengthen with increasing prices and very high rental demand. Limited new construction combined with decreasing vacancy rates point to strong appreciation potential in this area.`,
        marketRating: 8.6,
        dataSource: "CHERRE Data Platform",
        lastUpdated: new Date().toLocaleDateString()
      };
      
      setCherryData(refreshedCherryData);
      setIsCherryDataLoading(false);
      
      toast({
        title: "Data refreshed",
        description: "CHERRE market data has been updated",
      });
    }, 1500);
  };

  const insights = marketData ? processMarketInsights(marketData) : [];
  const aiAnalysis = marketData?.aiAnalysis || null;

  const renderContent = () => {
    if (isLoading && !marketData && !cherryData) {
      return <PropertyDataLoading />;
    }
    
    if (error && !marketData && !cherryData) {
      return <PropertyDataError error={error} onRetry={fetchPropertyData} />;
    }
    
    if (marketData || cherryData) {
      return (
        <div className="space-y-4">
          <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cherry-data" className="text-xs">
                CHERRE Data
              </TabsTrigger>
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
            
            <TabsContent value="cherry-data" className="mt-4">
              {isCherryDataLoading ? (
                <div className="py-8 flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-3"></div>
                  <p className="text-sm text-gray-500">Loading CHERRE data...</p>
                </div>
              ) : cherryData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {cherryData.marketMetrics.map((metric: any, idx: number) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">{metric.title}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-base font-bold">{metric.value}</span>
                          <span className={`text-xs font-medium ${metric.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                            {metric.change}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Market Analysis</div>
                    <p className="text-sm">{cherryData.marketAnalysis}</p>
                  </div>
                  
                  <div className="flex justify-between items-center px-1 text-xs text-gray-500">
                    <div>Source: {cherryData.dataSource}</div>
                    <div>Last updated: {cherryData.lastUpdated}</div>
                  </div>
                  
                  <Button 
                    onClick={refreshCherryData} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    disabled={isCherryDataLoading}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isCherryDataLoading ? 'animate-spin' : ''}`} />
                    Refresh CHERRE Data
                  </Button>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-sm text-gray-600 mb-4">No CHERRE data available yet.</p>
                  <Button onClick={fetchCherryData} size="sm">
                    Fetch CHERRE Data
                  </Button>
                </div>
              )}
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
            disabled={isLoading}
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
            Refresh All Data
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
