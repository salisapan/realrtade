
import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PropertyListing } from "@/components/PropertyListing";
import { PropertiesHeader } from "@/components/PropertiesHeader";
import { categories } from "@/data/propertyData";
import { affordableDeals } from "@/components/properties/AffordableDealsList";
import { getCategoryProperties } from "@/components/properties/PropertyCategoryHelper";
import { useInvestorProfile } from "@/components/properties/useInvestorProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");
  const [properties, setProperties] = useState<any[]>([]);
  const { investorProfile, isLoading } = useInvestorProfile();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!investorProfile) return;
    
    // Check both fields for accreditation status
    const isAccredited = investorProfile.isAccredited === "yes" || investorProfile.is_accredited === true;
    console.log("Index page checking accreditation:", investorProfile.isAccredited, investorProfile.is_accredited, "Result:", isAccredited);
    
    if (isAccredited) {
      setProperties(getCategoryProperties(selectedCategory));
    } else {
      setProperties(affordableDeals);
    }
  }, [investorProfile, selectedCategory]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (investorProfile) {
      const isAccredited = investorProfile.isAccredited === "yes" || investorProfile.is_accredited === true;
      if (isAccredited) {
        setProperties(getCategoryProperties(category));
      } else {
        setProperties(affordableDeals);
      }
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
    <div className="flex flex-col md:flex-row w-full max-w-[100vw] overflow-x-hidden">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50 w-full overflow-x-hidden">
        <PropertiesHeader 
          categories={categories.map(cat => ({
            ...cat,
            active: cat.id === selectedCategory
          }))} 
          onSelectCategory={handleCategoryChange} 
        />
        
        <div className="w-full mx-auto px-2 sm:px-4 pt-2 md:pt-4 flex flex-col items-center">
          <p className="text-gray-600 text-xs md:text-sm text-center mb-2 md:mb-4 px-2">
            RealTrade - Invest in real estate worldwide from anywhere.
          </p>
        </div>

        <main className="w-full max-w-full overflow-hidden py-2 md:py-6">
          <Tabs value={selectedCategory} onValueChange={handleCategoryChange} className="w-full max-w-full">
            <TabsContent value="sector" className="w-full max-w-full m-0">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="low-risk" className="w-full max-w-full m-0">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="geography" className="w-full max-w-full m-0">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="profitable" className="w-full max-w-full m-0">
              <PropertyListing properties={properties} />
            </TabsContent>
            <TabsContent value="company" className="w-full max-w-full m-0">
              <PropertyListing properties={properties} />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default Index;
