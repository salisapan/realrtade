
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PropertyDetailContent } from "@/components/property/PropertyDetailContent";
import { PropertyMarketInsights } from "@/components/property/PropertyMarketInsights";
import { PropertyQuickInvestment } from "@/components/property/PropertyQuickInvestment";
import { PropertyDetailsCard } from "@/components/property/PropertyDetailsCard";
import { PropertyTimeline } from "@/components/property/PropertyTimeline";
import { PropertyHeader } from "@/components/property/PropertyHeader";
import { PropertyInvestmentDetails } from "@/components/property/PropertyInvestmentDetails";
import { useToast } from "@/hooks/use-toast";
import { 
  sampleProperties, 
  CHART_COLORS, 
  cashFlowData, 
  roiComponentsData, 
  riskAssessmentData 
} from "@/data/propertyDetailData";

const PropertyDetail = () => {
  const { id } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Simulate loading property data
    setTimeout(() => {
      // Find property by ID
      const foundProperty = sampleProperties.find(p => p.id === id);
      
      // Update the property data to use consistent minimum investment
      if (foundProperty) {
        foundProperty.minInvestment = 2500;
      }
      
      setProperty(foundProperty || null);
      setLoading(false);
    }, 500);
  }, [id]);
  
  const handleBookmark = () => {
    setBookmarked(!bookmarked);
    toast({
      title: bookmarked ? "Deal removed from saved" : "Deal saved",
      description: bookmarked ? "This deal has been removed from your saved deals" : "This deal has been added to your saved deals",
      variant: "success"
    });
  };
  
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copied",
      description: "Deal link has been copied to clipboard",
      variant: "success"
    });
  };
  
  const handleInvest = () => {
    // Scroll to the Letter of Intent form
    const loiForm = document.querySelector('.loi-form-container');
    if (loiForm) {
      loiForm.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  const handleScheduleCall = () => {
    // Open Calendly or custom form in a modal
    window.open('https://calendly.com/realtrade/investment-call', '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex">
        <AppSidebar />
        <div className="flex-1 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-4 text-lg">Loading property details...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (!property) {
    return (
      <div className="flex">
        <AppSidebar />
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen">
          <h1 className="text-4xl font-bold mb-4">Oops! Property not found</h1>
          <p className="text-lg mb-8">We couldn't find the property you're looking for.</p>
          <Link to="/properties">
            <Button>
              Return to Properties
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <PropertyHeader 
          property={property}
          bookmarked={bookmarked}
          onBookmark={handleBookmark}
          onShare={handleShare}
        />

        <main className="mx-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 p-4 md:p-6">
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
              <div className="rounded-xl overflow-hidden bg-white shadow-sm">
                <img 
                  src={property.id === "prop3" ? 
                       "https://images.unsplash.com/photo-1553522911-ec3c9ba44d3b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" : 
                       property.image} 
                  alt={property.name} 
                  className="w-full h-[300px] object-cover" 
                />
                
                <PropertyDetailContent property={{...property, minInvestment: 2500}} />
              </div>
              
              <PropertyInvestmentDetails 
                cashFlowData={cashFlowData}
                roiComponentsData={roiComponentsData}
                riskAssessmentData={riskAssessmentData}
                chartColors={CHART_COLORS}
              />
            </div>
            
            <div className="space-y-5">
              <PropertyQuickInvestment 
                roi={property.roi}
                term={property.term}
                minInvestment={2500}
                onInvest={handleInvest}
              />
              
              <PropertyDetailsCard property={property} />
              
              <PropertyMarketInsights 
                propertyAddress={property.location.split(',')[0]} 
                propertyCity={property.location.split(',')[1]?.trim() || 'New York'} 
              />
              
              <PropertyTimeline property={property} />
              
              <Card className="shadow-sm">
                <div className="bg-white border rounded-lg p-5">
                  <h3 className="font-semibold mb-3">Need Help?</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Our investment advisors are available to answer any questions about this property.
                  </p>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={handleScheduleCall}
                  >
                    Schedule a Call
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PropertyDetail;
