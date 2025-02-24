
import { useState } from "react";
import { PropertyCard } from "@/components/PropertyCard";
import { CategoryFilter } from "@/components/CategoryFilter";

const categories = [
  { id: "sector", name: "sector", active: true },
  { id: "low-risk", name: "low risk" },
  { id: "geography", name: "geography" },
  { id: "profitable", name: "profitable" },
  { id: "company", name: "Company" },
];

const properties = [
  {
    image: "https://images.unsplash.com/photo-1496307653780-42ee777d4833",
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
    image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625",
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
];

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">properties</h1>
            <button className="text-primary">See All ►</button>
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
  );
};

export default Index;
