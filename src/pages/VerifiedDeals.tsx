
import { useState } from "react";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { HomeFooter } from "@/components/landing/HomeFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PropertyMap } from "@/components/property/PropertyMap";
import { Link } from "react-router-dom";
import { Check, Info, Percent, DollarSign, Clock, Users, Star } from "lucide-react";

const VerifiedDeals = () => {
  const [deals] = useState(verifiedDeals);
  
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <HomeHeader />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <Badge variant="outline" className="mb-2 py-1 px-3">Non-Accredited Investor Deals</Badge>
            <h1 className="text-3xl font-bold mb-2">Verified Investment Opportunities</h1>
            <p className="text-gray-600 max-w-2xl mx-auto">
              These carefully selected deals have been verified for non-accredited investors, featuring 
              lower minimum investments and reduced risk profiles.
            </p>
          </div>
          
          <div className="flex items-center justify-center gap-3 mb-8 bg-blue-50 rounded-lg p-4">
            <Info className="text-blue-500 h-5 w-5" />
            <p className="text-sm text-blue-700">
              All deals on this page have low minimum investments starting at just $10, making them accessible to everyone.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {deals.map((deal) => (
              <Card key={deal.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative">
                  <img 
                    src={deal.image} 
                    alt={deal.name} 
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute top-0 left-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 flex items-center">
                    <Check className="mr-1 h-3.5 w-3.5" />
                    VERIFIED
                  </div>
                  {deal.featured && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-xs font-bold px-3 py-1">
                      FEATURED
                    </div>
                  )}
                </div>
                
                <div className="p-4">
                  <h3 className="text-lg font-bold mb-1">{deal.name}</h3>
                  <p className="text-gray-500 text-sm mb-3">{deal.location}</p>
                  
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        <DollarSign className="h-3 w-3" />
                        <span>Min Investment</span>
                      </div>
                      <div className="font-bold">${deal.minInvestment}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        <Percent className="h-3 w-3" />
                        <span>Target Return</span>
                      </div>
                      <div className="font-bold">{deal.targetReturn}%</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        <Clock className="h-3 w-3" />
                        <span>Term</span>
                      </div>
                      <div className="font-bold">{deal.term}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        <Users className="h-3 w-3" />
                        <span>Investors</span>
                      </div>
                      <div className="font-bold">{deal.investors}</div>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs">Funding Progress</div>
                      <div className="text-xs font-bold">{deal.progress}%</div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full" 
                        style={{ width: `${deal.progress}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="flex">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-4 w-4 ${i < deal.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-500 ml-1">({deal.reviews} reviews)</span>
                    </div>
                    <Badge variant="outline" className={
                      deal.riskLevel === "Low" ? "text-green-500 border-green-200 bg-green-50" :
                      deal.riskLevel === "Medium" ? "text-amber-500 border-amber-200 bg-amber-50" :
                      "text-red-500 border-red-200 bg-red-50"
                    }>
                      {deal.riskLevel} Risk
                    </Badge>
                  </div>
                  
                  <Link to={`/property/${deal.id}`}>
                    <Button className="w-full">View Deal</Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
          
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Why Verified Deals?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="w-10 h-10 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-3">
                  <Check className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-2">Extra Verification</h3>
                <p className="text-sm text-gray-600">Each deal undergoes additional due diligence and verification to ensure suitability for non-accredited investors.</p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="w-10 h-10 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-3">
                  <DollarSign className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-2">Lower Minimums</h3>
                <p className="text-sm text-gray-600">Start with as little as $10 to build your real estate portfolio gradually.</p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="w-10 h-10 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-3">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-2">Risk Management</h3>
                <p className="text-sm text-gray-600">Deals with balanced risk profiles and clear exit strategies to protect your investment.</p>
              </div>
            </div>
          </div>
          
          <div className="text-center">
            <Link to="/properties">
              <Button variant="outline" size="lg">
                Explore All Properties
              </Button>
            </Link>
          </div>
        </div>
      </main>
      
      <HomeFooter />
    </div>
  );
};

// Define missing icon component
const AlertTriangle = ({ className }: { className?: string }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <path d="M12 9v4"/>
      <path d="M12 17h.01"/>
    </svg>
  );
};

// Sample data for verified deals
const verifiedDeals = [
  {
    id: "verified1",
    name: "Urban Micro Apartment",
    location: "Chicago, IL",
    image: "https://images.unsplash.com/photo-1594540637859-7069a4765971",
    minInvestment: 10,
    targetReturn: 8.5,
    term: "2-3 years",
    investors: 347,
    progress: 84,
    riskLevel: "Low",
    rating: 4,
    reviews: 28,
    featured: true,
  },
  {
    id: "verified2",
    name: "Main Street Retail",
    location: "Austin, TX",
    image: "https://images.unsplash.com/photo-1582407947304-fd86f028f716",
    minInvestment: 25,
    targetReturn: 7.2,
    term: "1-2 years",
    investors: 182,
    progress: 62,
    riskLevel: "Low",
    rating: 5,
    reviews: 41,
    featured: false,
  },
  {
    id: "verified3",
    name: "Suburban Townhomes",
    location: "Charlotte, NC",
    image: "https://images.unsplash.com/photo-1592595896616-c37162298647",
    minInvestment: 50,
    targetReturn: 9.1,
    term: "3-4 years",
    investors: 104,
    progress: 45,
    riskLevel: "Medium",
    rating: 4,
    reviews: 16,
    featured: false,
  },
  {
    id: "verified4",
    name: "Student Housing Complex",
    location: "Boston, MA",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267",
    minInvestment: 15,
    targetReturn: 10.5,
    term: "2-3 years",
    investors: 219,
    progress: 73,
    riskLevel: "Medium",
    rating: 3,
    reviews: 22,
    featured: false,
  },
  {
    id: "verified5",
    name: "Medical Office Building",
    location: "Seattle, WA",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72",
    minInvestment: 30,
    targetReturn: 6.8,
    term: "1-2 years",
    investors: 175,
    progress: 91,
    riskLevel: "Low",
    rating: 5,
    reviews: 37,
    featured: true,
  },
];

export default VerifiedDeals;
