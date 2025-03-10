import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PropertyListing } from "@/components/PropertyListing";
import { PropertiesHeader } from "@/components/PropertiesHeader";
import { categories } from "@/data/propertyData";
import { affordableDeals } from "@/components/properties/AffordableDealsList";
import { getCategoryProperties } from "@/components/properties/PropertyCategoryHelper";
import { useInvestorProfile } from "@/components/properties/useInvestorProfile";

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");
  const [properties, setProperties] = useState<any[]>([]);
  const { investorProfile, isLoading } = useInvestorProfile();
  
  useEffect(() => {
    if (!investorProfile) return;
    
    const isAccredited = investorProfile?.isAccredited === "yes";
    
    if (isAccredited) {
      setProperties(getCategoryProperties(selectedCategory));
    } else {
      setProperties(affordableDeals);
    }
  }, [investorProfile, selectedCategory]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (investorProfile && investorProfile.isAccredited === "yes") {
      setProperties(getCategoryProperties(category));
    } else {
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
      <div className="flex-1 min-h-screen bg-gray-50 w-full overflow-x-hidden">
        <PropertiesHeader 
          categories={categories.map(cat => ({
            ...cat,
            active: cat.id === selectedCategory
          }))} 
          onSelectCategory={handleCategoryChange} 
        />
        
        <div className="container mx-auto px-4 pt-3 md:pt-6 flex flex-col items-center">
          <div className="mb-2 md:mb-4 flex items-center justify-center"></div>
          <p className="text-gray-600 text-xs md:text-sm text-center mb-2 md:mb-4 px-2">
            RealTrade - Invest in real estate worldwide from anywhere.
          </p>
        </div>

        <main className="container mx-auto py-4 md:py-8">
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
