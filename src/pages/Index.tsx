
import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PropertyListing } from "@/components/PropertyListing";
import { PropertiesHeader } from "@/components/PropertiesHeader";
import { 
  categories, 
  propertiesBySector, 
  propertiesByLowRisk, 
  propertiesByGeography, 
  propertiesByProfitable, 
  propertiesByCompany 
} from "@/data/propertyData";

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <PropertiesHeader 
          categories={categories.map(cat => ({
            ...cat,
            active: cat.id === selectedCategory
          }))}
          onSelectCategory={setSelectedCategory}
        />

        <main className="container mx-auto px-4 py-8">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsContent value="sector">
              <PropertyListing properties={propertiesBySector} />
            </TabsContent>
            
            <TabsContent value="low-risk">
              <PropertyListing properties={propertiesByLowRisk} />
            </TabsContent>
            
            <TabsContent value="geography">
              <PropertyListing properties={propertiesByGeography} />
            </TabsContent>
            
            <TabsContent value="profitable">
              <PropertyListing properties={propertiesByProfitable} />
            </TabsContent>
            
            <TabsContent value="company">
              <PropertyListing properties={propertiesByCompany} />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default Index;
