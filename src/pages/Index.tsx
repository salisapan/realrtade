
import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PropertyListing } from "@/components/PropertyListing";
import { PropertiesHeader } from "@/components/PropertiesHeader";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu, X, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  categories, 
  propertiesBySector, 
  propertiesByLowRisk, 
  propertiesByGeography, 
  propertiesByProfitable, 
  propertiesByCompany 
} from "@/data/propertyData";
import { nonAccreditedDeals } from "@/data/nonAccreditedDeals";

// Add new sample deals with $10 minimum investment
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
  }
];

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("sector");
  const [investorProfile, setInvestorProfile] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Check if user has completed investor registration
  useEffect(() => {
    setIsLoading(true);
    const profile = localStorage.getItem("investorProfile");
    
    if (!profile) {
      toast({
        title: "Registration Required",
        description: "Please complete your investor profile to access properties.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }
    
    try {
      const parsedProfile = JSON.parse(profile);
      setInvestorProfile(parsedProfile);
      
      // All investors can access the platform
      const isAccredited = parsedProfile.isAccredited === "yes";
      
      // Update properties with isAccredited flag and lowered minimum investment
      if (isAccredited) {
        // Accredited investors see all properties with $2,500 minimum investment
        const accreditedProperties = getCategoryProperties(selectedCategory).map(prop => ({
          ...prop,
          isAccredited: true,
          minInvestment: prop.minInvestment > 2500 ? 2500 : prop.minInvestment
        }));
        setProperties(accreditedProperties);
        
        toast({
          title: `Welcome ${parsedProfile.firstName || 'Accredited Investor'}`,
          description: "You're viewing all available investment properties.",
        });
      } else {
        // Non-accredited investors see affordable deals with $10 minimum investment
        setProperties(affordableDeals.map(prop => ({
          ...prop,
          isAccredited: false
        })));
        
        toast({
          title: `Welcome ${parsedProfile.firstName || 'Investor'}`,
          description: "You're viewing verified properties with low minimum investments of just $10.",
        });
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Error parsing investor profile:", error);
      // Even if there's an error, show some default properties
      setProperties(affordableDeals.map(prop => ({
        ...prop,
        isAccredited: false
      })));
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
      const accreditedProperties = getCategoryProperties(category).map(prop => ({
        ...prop,
        isAccredited: true,
        minInvestment: prop.minInvestment > 2500 ? 2500 : prop.minInvestment
      }));
      setProperties(accreditedProperties);
    } else {
      // Non-accredited investors always see the affordable deals regardless of category
      setProperties(affordableDeals.map(prop => ({
        ...prop,
        isAccredited: false
      })));
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
      {isMobile ? (
        // Mobile view with custom sidebar
        <div className="mobile-sidebar-wrapper">
          {/* Floating menu button for iPhone */}
          <button 
            className="mobile-menu-button md:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          {/* Mobile menu overlay */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setMobileMenuOpen(false)}>
              <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-white shadow-lg p-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 pb-2 border-b">
                  <Link to="/" className="flex items-center" onClick={() => setMobileMenuOpen(false)}>
                    <img 
                      src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                      alt="RealTrade Logo" 
                      className="h-8 rounded-lg" 
                    />
                    <span className="ml-2 font-bold">RealTrade</span>
                  </Link>
                  <button onClick={() => setMobileMenuOpen(false)}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex flex-col space-y-1">
                  <Link
                    to="/"
                    className="flex items-center p-3 rounded-md text-primary bg-primary/10"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Home className="w-5 h-5 mr-3 text-primary" />
                    <span>Home</span>
                  </Link>
                  <Link
                    to="/properties"
                    className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Building2 className="w-5 h-5 mr-3" />
                    <span>Properties</span>
                  </Link>
                  <Link
                    to="/dashboard"
                    className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Home className="w-5 h-5 mr-3" />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    to="/performance"
                    className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <LineChart className="w-5 h-5 mr-3" />
                    <span>Performance</span>
                  </Link>
                  <Link
                    to="/reports"
                    className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <FileText className="w-5 h-5 mr-3" />
                    <span>Reports</span>
                  </Link>
                  <Link
                    to="/wallet"
                    className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <DollarSign className="w-5 h-5 mr-3" />
                    <span>Wallet</span>
                  </Link>
                  <Link
                    to="/settings"
                    className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Settings className="w-5 h-5 mr-3" />
                    <span>Settings</span>
                  </Link>
                  <Link
                    to="/entrepreneur"
                    className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Building2 className="w-5 h-5 mr-3" />
                    <span>Entrepreneur View</span>
                  </Link>
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 p-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      {investorProfile?.firstName?.[0] || 'U'}
                    </div>
                    <div>
                      <div className="font-medium">{`${investorProfile?.firstName || 'Welcome'} ${investorProfile?.lastName || ''}`}</div>
                      <div className="text-xs text-gray-500">{investorProfile?.email || 'Investor'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex-1 min-h-screen bg-gray-50 w-full">
            <div className="sticky top-0 z-10 bg-white border-b">
              <div className="flex justify-between items-center p-3">
                <Link to="/" className="flex items-center">
                  <img 
                    src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                    alt="RealTrade Logo" 
                    className="h-7 rounded-lg" 
                  />
                  <span className="ml-2 font-bold">Properties</span>
                </Link>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </div>
              
              <PropertiesHeader 
                categories={categories.map(cat => ({
                  ...cat,
                  active: cat.id === selectedCategory
                }))}
                onSelectCategory={handleCategoryChange}
              />
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
      ) : (
        // Desktop view with regular sidebar
        <>
          <AppSidebar />
          <div className="flex-1 min-h-screen bg-gray-50 w-full">
            <PropertiesHeader 
              categories={categories.map(cat => ({
                ...cat,
                active: cat.id === selectedCategory
              }))}
              onSelectCategory={handleCategoryChange}
            />
            
            {/* Add the slogan above the property listing */}
            <div className="container mx-auto px-4 pt-3 md:pt-6">
              <p className="text-gray-600 text-xs md:text-sm text-center mb-2 md:mb-4">RealTrade - Invest in real estate worldwide from anywhere.</p>
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
        </>
      )}
    </div>
  );
};

// These imports need to be added at the top of the file
const { Building2, LineChart, FileText, Settings, DollarSign } = require("lucide-react");

export default Index;
