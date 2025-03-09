
import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PropertyListing } from "@/components/PropertyListing";
import { PropertiesHeader } from "@/components/PropertiesHeader";
import { categories } from "@/data/propertyData";
import { affordableDeals } from "@/components/properties/AffordableDealsList";
import { getCategoryProperties } from "@/components/properties/PropertyCategoryHelper";
import { useInvestorProfile } from "@/components/properties/useInvestorProfile";
import { useWelcomeToast } from "@/components/properties/WelcomeToast";

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");
  const [properties, setProperties] = useState<any[]>([]);
  const { investorProfile, isLoading } = useInvestorProfile();
  
  // Use the welcome toast
  const isAccredited = investorProfile?.isAccredited === "yes";
  const { showWelcomeToast } = useWelcomeToast(isAccredited);

  // Set properties based on investor accreditation
  useEffect(() => {
    if (!investorProfile) return;
    
    if (isAccredited) {
      // Accredited investors see all properties
      setProperties(getCategoryProperties(selectedCategory));
    } else {
      // Non-accredited investors see affordable deals with $10 minimum investment
      setProperties(affordableDeals);
    }
    
    showWelcomeToast();
  }, [investorProfile, selectedCategory, isAccredited, showWelcomeToast]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (investorProfile && isAccredited) {
      setProperties(getCategoryProperties(category));
    } else {
      // Non-accredited investors always see the affordable deals regardless of category
      setProperties(affordableDeals);
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
    <div className="flex flex-col md:flex-row">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 w-full">
        <PropertiesHeader 
          categories={categories.map(cat => ({
            ...cat,
            active: cat.id === selectedCategory
          }))} 
          onSelectCategory={handleCategoryChange} 
        />
        
        {/* Company Logo and Slogan Section */}
        <div className="container mx-auto px-4 pt-3 md:pt-6 flex flex-col items-center">
          <div className="mb-2 md:mb-4 flex items-center justify-center"></div>
          <p className="text-gray-600 text-xs md:text-sm text-center mb-2 md:mb-4">
            RealTrade - Invest in real estate worldwide from anywhere.
          </p>
        </div>

        <main className="container mx-auto px-2 md:px-4 py-4 md:py-8">
          <Tabs value={selectedCategory} onValueChange={handleCategoryChange} className="w-full">
            <TabsContent value="sector" className="property-listing-grid">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="low-risk" className="property-listing-grid">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="geography" className="property-listing-grid">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="profitable" className="property-listing-grid">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="company" className="property-listing-grid">
              <PropertyListing properties={properties} />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default Index;
