
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PropertyCard } from "@/components/PropertyCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { UserCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const categories = [
  { id: "sector", name: "sector", active: true },
  { id: "low-risk", name: "low risk" },
  { id: "geography", name: "geography" },
  { id: "profitable", name: "profitable" },
  { id: "company", name: "Company" },
];

const propertiesBySector = [
  {
    id: "prop1",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "The International Gem Tower",
    location: "50 West 47th Street, New York",
    company: "EXTELL",
    website: "www.extell.com",
    cashOnCash: "11.2%",
    upside: "42%",
    funded: "91%",
    rented: "73%",
    sqft: "13,300",
    floors: "5 from 12",
    status: "Built",
    year: "2012",
    price: "2,700,000",
    category: "Commercial",
  },
  {
    id: "prop2",
    image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "401 N Michigan Ave",
    location: "401 N Michigan Ave, Chicago",
    company: "IAG",
    website: "www.iag.com",
    cashOnCash: "11.7%",
    upside: "53%",
    funded: "81%",
    rented: "68%",
    sqft: "21,500",
    floors: "17-19th from 35",
    status: "Built",
    year: "1965/2016",
    price: "8,770,000",
    category: "Office",
  },
  {
    id: "prop3",
    image: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Tech Hub Square",
    location: "Silicon Valley, CA",
    company: "TechVest",
    website: "www.techvest.com",
    cashOnCash: "13.5%",
    upside: "61%",
    funded: "95%",
    rented: "89%",
    sqft: "45,000",
    floors: "All 4 floors",
    status: "Built",
    year: "2020",
    price: "12,500,000",
    category: "Tech Office",
  },
];

const propertiesByLowRisk = [
  {
    id: "prop1",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "The International Gem Tower",
    location: "50 West 47th Street, New York",
    company: "EXTELL",
    website: "www.extell.com",
    cashOnCash: "11.2%",
    upside: "42%",
    funded: "91%",
    rented: "73%",
    sqft: "13,300",
    floors: "5 from 12",
    status: "Built",
    year: "2012",
    price: "2,700,000",
    riskProfile: "Low",
  },
  {
    id: "prop4",
    image: "https://images.unsplash.com/photo-1464146072230-91cabc968266?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Southbank Tower",
    location: "Miami, FL",
    company: "Coastal Investments",
    website: "www.coastalinv.com",
    cashOnCash: "10.8%",
    upside: "38%",
    funded: "75%",
    rented: "82%",
    sqft: "18,900",
    floors: "12-15 from 25",
    status: "Built",
    year: "2019",
    price: "5,900,000",
    riskProfile: "Low",
  },
];

const propertiesByGeography = [
  {
    id: "prop1",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "The International Gem Tower",
    location: "50 West 47th Street, New York",
    company: "EXTELL",
    website: "www.extell.com",
    cashOnCash: "11.2%",
    upside: "42%",
    funded: "91%",
    rented: "73%",
    sqft: "13,300",
    floors: "5 from 12",
    status: "Built",
    year: "2012",
    price: "2,700,000",
    region: "Northeast"
  },
  {
    id: "prop2",
    image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "401 N Michigan Ave",
    location: "401 N Michigan Ave, Chicago",
    company: "IAG",
    website: "www.iag.com",
    cashOnCash: "11.7%",
    upside: "53%",
    funded: "81%",
    rented: "68%",
    sqft: "21,500",
    floors: "17-19th from 35",
    status: "Built",
    year: "1965/2016",
    price: "8,770,000",
    region: "Midwest"
  },
  {
    id: "prop4",
    image: "https://images.unsplash.com/photo-1464146072230-91cabc968266?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Southbank Tower",
    location: "Miami, FL",
    company: "Coastal Investments",
    website: "www.coastalinv.com",
    cashOnCash: "10.8%",
    upside: "38%",
    funded: "75%",
    rented: "82%",
    sqft: "18,900",
    floors: "12-15 from 25",
    status: "Built",
    year: "2019",
    price: "5,900,000",
    region: "Southeast"
  },
];

const propertiesByProfitable = [
  {
    id: "prop3",
    image: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Tech Hub Square",
    location: "Silicon Valley, CA",
    company: "TechVest",
    website: "www.techvest.com",
    cashOnCash: "13.5%",
    upside: "61%",
    funded: "95%",
    rented: "89%",
    sqft: "45,000",
    floors: "All 4 floors",
    status: "Built",
    year: "2020",
    price: "12,500,000",
    profitMargin: "High"
  },
  {
    id: "prop5",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Modern Industrial Complex",
    location: "Austin, TX",
    company: "TexasRE",
    website: "www.texasre.com",
    cashOnCash: "12.3%",
    upside: "45%",
    funded: "88%",
    rented: "91%",
    sqft: "65,000",
    floors: "2",
    status: "Built",
    year: "2021",
    price: "15,300,000",
    profitMargin: "High"
  },
];

const propertiesByCompany = [
  {
    id: "prop1",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "The International Gem Tower",
    location: "50 West 47th Street, New York",
    company: "EXTELL",
    website: "www.extell.com",
    cashOnCash: "11.2%",
    upside: "42%",
    funded: "91%",
    rented: "73%",
    sqft: "13,300",
    floors: "5 from 12",
    status: "Built",
    year: "2012",
    price: "2,700,000",
  },
  {
    id: "prop2",
    image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "401 N Michigan Ave",
    location: "401 N Michigan Ave, Chicago",
    company: "IAG",
    website: "www.iag.com",
    cashOnCash: "11.7%",
    upside: "53%",
    funded: "81%",
    rented: "68%",
    sqft: "21,500",
    floors: "17-19th from 35",
    status: "Built",
    year: "1965/2016",
    price: "8,770,000",
  },
  {
    id: "prop3",
    image: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Tech Hub Square",
    location: "Silicon Valley, CA",
    company: "TechVest",
    website: "www.techvest.com",
    cashOnCash: "13.5%",
    upside: "61%",
    funded: "95%",
    rented: "89%",
    sqft: "45,000",
    floors: "All 4 floors",
    status: "Built",
    year: "2020",
    price: "12,500,000",
  },
];

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");
  const navigate = useNavigate();

  const handlePropertyClick = (propertyId: string) => {
    // The propertyId is just used for the URL, but we need to make sure the details are actually available
    navigate(`/property/${propertyId}`);
  };

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-10 mr-4 rounded-lg" 
                />
                <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
              </div>
              <div className="flex items-center gap-4">
                <button className="text-primary">See All ►</button>
                <Link to="/">
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Home className="w-4 h-4" />
                    Home
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="ghost" size="icon">
                    <UserCircle className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            </div>
            <CategoryFilter
              categories={categories.map(cat => ({
                ...cat,
                active: cat.id === selectedCategory
              }))}
              onSelect={setSelectedCategory}
            />
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsContent value="sector">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {propertiesBySector.map((property) => (
                  <div key={property.id} onClick={() => handlePropertyClick(property.id)} className="cursor-pointer">
                    <PropertyCard {...property} />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="low-risk">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {propertiesByLowRisk.map((property) => (
                  <div key={property.id} onClick={() => handlePropertyClick(property.id)} className="cursor-pointer">
                    <PropertyCard {...property} />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="geography">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {propertiesByGeography.map((property) => (
                  <div key={property.id} onClick={() => handlePropertyClick(property.id)} className="cursor-pointer">
                    <PropertyCard {...property} />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="profitable">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {propertiesByProfitable.map((property) => (
                  <div key={property.id} onClick={() => handlePropertyClick(property.id)} className="cursor-pointer">
                    <PropertyCard {...property} />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="company">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {propertiesByCompany.map((property) => (
                  <div key={property.id} onClick={() => handlePropertyClick(property.id)} className="cursor-pointer">
                    <PropertyCard {...property} />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default Index;
