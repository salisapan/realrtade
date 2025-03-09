
import { PropertyListing } from "@/components/PropertyListing";

// Sample deals with $10 minimum investment
const affordableDeals = [
  {
    id: "aff-001",
    title: "Micro-Share Apartment Complex",
    location: "Austin, TX",
    imageUrl: "https://images.unsplash.com/photo-1460317442991-0ec209397118?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    price: "$10",
    roi: "8.2%",
    type: "Residential",
    raised: "$1.2M",
    goal: "$1.5M",
    description: "Fractional shares in a stable, income-producing apartment complex with professional management.",
    isVerified: true,
    minInvestment: 10,
    lat: 30.2672,
    lng: -97.7431,
    company: "MicroREIT",
    website: "microreits.com",
    cashOnCash: "8.2%",
    upside: "15%",
    funded: "80%",
    rented: "95%",
    sqft: "1,500 sqft",
    floors: "3",
    status: "Active",
    year: "2018"
  },
  {
    id: "aff-002",
    title: "Retail Space Fractional",
    location: "Chicago, IL",
    imageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    price: "$10",
    roi: "7.5%",
    type: "Commercial",
    raised: "$850K",
    goal: "$1M",
    description: "Own a piece of this prime retail space in downtown Chicago with established tenants.",
    isVerified: true,
    minInvestment: 10,
    lat: 41.8781,
    lng: -87.6298,
    company: "Urban Investments",
    website: "urbaninvest.co",
    cashOnCash: "7.5%",
    upside: "12%",
    funded: "85%",
    rented: "100%",
    sqft: "2,200 sqft",
    floors: "1",
    status: "Active",
    year: "2015"
  },
  {
    id: "aff-003",
    title: "Micro REITs Bundle",
    location: "Multiple US Cities",
    imageUrl: "https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2273&q=80",
    price: "$10",
    roi: "9.0%",
    type: "Mixed",
    raised: "$2.3M",
    goal: "$3M",
    description: "Diversified portfolio of micro-shares across multiple properties in growing markets.",
    isVerified: true,
    minInvestment: 10,
    lat: 37.0902,
    lng: -95.7129,
    company: "Diverse Holdings",
    website: "diversehold.io",
    cashOnCash: "9.0%",
    upside: "18%",
    funded: "76%",
    rented: "90%",
    sqft: "Varies",
    floors: "Varies",
    status: "Active",
    year: "Various"
  },
  {
    id: "aff-004",
    title: "Student Housing Share",
    location: "Boston, MA",
    imageUrl: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    price: "$10",
    roi: "8.7%",
    type: "Residential",
    raised: "$1.7M",
    goal: "$2M",
    description: "Student housing complex near major universities with consistent rental demand.",
    isVerified: true,
    minInvestment: 10,
    lat: 42.3601,
    lng: -71.0589,
    company: "Campus Living",
    website: "campusliving.com",
    cashOnCash: "8.7%",
    upside: "14%",
    funded: "85%",
    rented: "98%",
    sqft: "1,200 sqft",
    floors: "4",
    status: "Active",
    year: "2019"
  },
  {
    id: "aff-005",
    title: "Small Business Plaza",
    location: "Miami, FL",
    imageUrl: "https://images.unsplash.com/photo-1604964432806-254d07c11f32?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    price: "$10",
    roi: "7.8%",
    type: "Commercial",
    raised: "$900K",
    goal: "$1.2M",
    description: "Small business plaza in growing area of Miami with long-term tenants.",
    isVerified: true,
    minInvestment: 10,
    lat: 25.7617,
    lng: -80.1918,
    company: "SunCoast Properties",
    website: "suncoastprop.com",
    cashOnCash: "7.8%",
    upside: "13%",
    funded: "75%",
    rented: "90%",
    sqft: "3,000 sqft",
    floors: "2",
    status: "Active",
    year: "2017"
  }
];

interface AffordableDealsListProps {
  isLoading: boolean;
}

export const AffordableDealsList = ({ isLoading }: AffordableDealsListProps) => {
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <PropertyListing properties={affordableDeals} />;
};

export { affordableDeals };
