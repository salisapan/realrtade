
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, ChevronLeft, ChevronRight, Newspaper } from "lucide-react";

interface NewsItem {
  title: string;
  description: string;
  link: string;
  image?: string;
}

const defaultNewsItems: NewsItem[] = [
  {
    title: "Cherre Partners With Nuveen Real Estate",
    description: "Strategic partnership to unlock new data capabilities in real estate market analysis.",
    link: "https://blog.cherre.com/2024/09/16/cherre-expands-strategic-partnership-with-nuveen-real-estate-to-unlock-new-capabilities/",
    image: "https://cherre.com/web-assets/img/featured_nuveen.png"
  },
  {
    title: "Cherre Announces $30M Series C Round",
    description: "New funding to accelerate innovation in real estate data management.",
    link: "https://blog.cherre.com/2024/09/17/cherre-announces-30m-series-c-round/",
    image: "https://cherre.com/web-assets/img/featured_series_c.png"
  },
  {
    title: "Discover the Power of User-Controlled Data Ingestion",
    description: "New tools for managing real estate data more effectively.",
    link: "https://info.cherre.com/dsp-demo-videos-request-access",
    image: "https://cherre.com/web-assets/img/featured_dsp.png"
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
  const [newsItems] = useState<NewsItem[]>(defaultNewsItems);
  
  const handlePrevious = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? newsItems.length - 1 : prevIndex - 1
    );
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === newsItems.length - 1 ? 0 : prevIndex + 1
    );
  };

  const currentItem = newsItems[currentIndex];

  return (
    <Card className="shadow-sm overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-primary" />
          Market News
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-lg overflow-hidden bg-gray-50 relative min-h-[180px]">
            {currentItem.image ? (
              <img 
                src={currentItem.image} 
                alt={currentItem.title}
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                <Newspaper className="w-12 h-12 text-gray-400" />
              </div>
            )}
            
            <div className="absolute top-2 right-2">
              <div className="bg-primary text-white text-xs px-2 py-1 rounded">
                {propertyType} Market
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-base font-medium line-clamp-2">{currentItem.title}</h3>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{currentItem.description}</p>
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
              onClick={() => window.open(currentItem.link, '_blank')}
              className="text-xs h-8"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Read More
            </Button>
          </div>
          
          <div className="flex justify-center mt-1">
            {newsItems.map((_, index) => (
              <div 
                key={index} 
                className={`h-1.5 w-1.5 rounded-full mx-1 ${
                  index === currentIndex ? 'bg-primary' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
