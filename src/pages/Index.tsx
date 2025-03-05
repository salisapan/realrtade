
import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PropertyListing } from "@/components/PropertyListing";
import { PropertiesHeader } from "@/components/PropertiesHeader";
import { useToast } from "@/hooks/use-toast";
import { 
  categories, 
  propertiesBySector, 
  propertiesByLowRisk, 
  propertiesByGeography, 
  propertiesByProfitable, 
  propertiesByCompany 
} from "@/data/propertyData";
import { nonAccreditedDeals } from "@/data/nonAccreditedDeals";

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");
  const [investorProfile, setInvestorProfile] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Check if user has completed investor registration
  useEffect(() => {
    setIsLoading(true);
    const profile = localStorage.getItem("investorProfile");
    
    if (!profile) {
      // Redirect to investor registration if no profile exists
      toast({
        title: "Registration Required",
        description: "Please complete your investor profile to access all properties.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }
    
    try {
      const parsedProfile = JSON.parse(profile);
      setInvestorProfile(parsedProfile);
      
      // Filter properties based on accreditation status
      const isAccredited = parsedProfile.isAccredited === "yes";
      
      if (isAccredited) {
        // Accredited investors see all properties
        setProperties(getCategoryProperties(selectedCategory));
        toast({
          title: "Welcome Accredited Investor",
          description: "You're viewing all available investment properties.",
        });
      } else {
        // Non-accredited investors see only verified properties with low minimum investments
        const verifiedDeals = nonAccreditedDeals.map(deal => ({
          ...deal,
          // Add badges to show the deal is verified and for non-accredited investors
          badges: ["Verified", "Low Minimum"]
        }));
        setProperties(verifiedDeals);
        
        toast({
          title: "Welcome Non-Accredited Investor",
          description: "You're viewing verified properties with low minimum investments.",
        });
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Error parsing investor profile:", error);
      setIsLoading(false);
    }
  }, [selectedCategory, toast]);
  
  // Helper function to get properties for the selected category
  const getCategoryProperties = (category: string) => {
    switch (category) {
      case "sector":
        return propertiesBySector;
      case "low-risk":
        return propertiesByLowRisk;
      case "geography":
        return propertiesByGeography;
      case "profitable":
        return propertiesByProfitable;
      case "company":
        return propertiesByCompany;
      default:
        return propertiesBySector;
    }
  };
  
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    
    if (investorProfile && investorProfile.isAccredited === "yes") {
      setProperties(getCategoryProperties(category));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <PropertiesHeader 
          categories={categories.map(cat => ({
            ...cat,
            active: cat.id === selectedCategory
          }))}
          onSelectCategory={handleCategoryChange}
        />

        <main className="container mx-auto px-4 py-8">
          <Tabs value={selectedCategory} onValueChange={handleCategoryChange} className="w-full">
            <TabsContent value="sector">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="low-risk">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="geography">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="profitable">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="company">
              <PropertyListing properties={properties} />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default Index;
