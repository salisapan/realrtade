
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, ChevronLeft, ChevronRight, BarChart, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface MarketData {
  title: string;
  description: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  source: string;
}

const defaultMarketData: MarketData[] = [
  {
    title: "Average Sale Price",
    description: "Current average property sale price in the area.",
    value: "$875,500",
    change: "+4.2%",
    trend: "up",
    source: "Market Analytics Platform"
  },
  {
    title: "Rental Yield",
    description: "Average rental yield for similar properties.",
    value: "5.8%",
    change: "+0.3%",
    trend: "up",
    source: "Property Management Association"
  },
  {
    title: "Vacancy Rate",
    description: "Current vacancy rate in the area.",
    value: "3.2%",
    change: "-0.7%",
    trend: "down",
    source: "Real Estate Data Hub"
  }
];

interface PropertyMarketNewsProps {
  propertyType?: string;
  propertyLocation?: string;
}

export const PropertyMarketNews = ({ 
  propertyType = "Commercial", 
  propertyLocation = "New York"
}: PropertyMarketNewsProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [marketData] = useState<MarketData[]>(defaultMarketData);
  
  const handlePrevious = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? marketData.length - 1 : prevIndex - 1
    );
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === marketData.length - 1 ? 0 : prevIndex + 1
    );
  };

  const currentItem = marketData[currentIndex];
  
  // Function to get the appropriate trend icon
  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch(trend) {
      case 'up':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-5 h-5 text-red-500" />;
      default:
        return <BarChart className="w-5 h-5 text-gray-500" />;
    }
  };
  
  // Function to get color based on trend
  const getTrendColor = (trend: 'up' | 'down' | 'neutral') => {
    switch(trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <Card className="shadow-sm overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <BarChart className="w-5 h-5 text-primary" />
          Market Data
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-lg overflow-hidden bg-gray-50 relative min-h-[180px] p-4">
            <div className="absolute top-2 right-2">
              <div className="bg-primary text-white text-xs px-2 py-1 rounded">
                {propertyType} Market
              </div>
            </div>
            
            <div className="flex flex-col h-full justify-center items-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                {getTrendIcon(currentItem.trend)}
              </div>
              
              <h3 className="text-lg font-bold text-center mb-1">{currentItem.title}</h3>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-2xl font-bold">{currentItem.value}</span>
                <span className={`font-medium ${getTrendColor(currentItem.trend)}`}>
                  {currentItem.change}
                </span>
              </div>
              <p className="text-sm text-gray-600 text-center mb-3">{currentItem.description}</p>
              <p className="text-xs text-gray-500">Source: {currentItem.source}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8"
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8"
                onClick={handleNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs h-8"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View Full Report
            </Button>
          </div>
          
          <div className="flex justify-center mt-1">
            {marketData.map((_, index) => (
              <div 
                key={index} 
                className={`h-1.5 w-1.5 rounded-full mx-1 ${
                  index === currentIndex ? 'bg-primary' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          
          <div className="border-t pt-3 mt-2">
            <h4 className="text-sm font-medium mb-2">Market Summary - {propertyLocation}</h4>
            <p className="text-xs text-gray-600">
              The {propertyType.toLowerCase()} real estate market in {propertyLocation} shows a steady growth with increasing demand for 
              high-quality properties. Investors can expect moderate appreciation with strong rental income potential.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
