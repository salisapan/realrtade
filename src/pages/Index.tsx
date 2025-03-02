
import { useState } from "react";
import { Link } from "react-router-dom";
import { PropertyCard } from "@/components/PropertyCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";

const categories = [
  { id: "sector", name: "sector", active: true },
  { id: "low-risk", name: "low risk" },
  { id: "geography", name: "geography" },
  { id: "profitable", name: "profitable" },
  { id: "company", name: "Company" },
];

const properties = [
  {
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
  {
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
  },
  {
    image: "https://images.unsplash.com/photo-1483058712412-4245e9b90334?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
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
  },
  {
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    title: "Green Energy Office Park",
    location: "Portland, OR",
    company: "EcoVest",
    website: "www.ecovest.com",
    cashOnCash: "9.8%",
    upside: "55%",
    funded: "70%",
    rented: "65%",
    sqft: "32,000",
    floors: "3",
    status: "Under Construction",
    year: "2024",
    price: "9,800,000",
  },
];

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");

  return (
    <div className="flex">
      <AppSidebar />
      <div className="flex-1 min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
              <div className="flex items-center gap-4">
                <button className="text-primary">See All ►</button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property, index) => (
              <PropertyCard key={index} {...property} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
