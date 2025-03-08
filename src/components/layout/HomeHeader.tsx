import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Menu, User, X, ArrowLeft, Settings, Building2, LineChart } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
export const HomeHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Check if we're on a property or performance page that needs back navigation
  const needsBackButton = location.pathname.includes('/property/') || location.pathname.includes('/performance') || location.pathname.includes('/reports') || location.pathname.includes('/wallet');

  // Get user profile from localStorage
  const getUserName = () => {
    try {
      const profile = localStorage.getItem("investorProfile");
      if (profile) {
        const parsedProfile = JSON.parse(profile);
        return parsedProfile.fullName || "Investor";
      }
      return "Investor";
    } catch (error) {
      console.error("Error getting user name:", error);
      return "Investor";
    }
  };
  const userName = getUserName();
  return <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 max-w-[70%]">
            {needsBackButton ? <Link to={location.pathname.includes('/property/') ? '/properties' : '/'} className="flex-shrink-0">
                <Button variant="ghost" size="sm" className="flex items-center gap-1 text-primary">
                  <ArrowLeft className="w-5 h-5" />
                  <span className="hidden md:inline font-medium">Back</span>
                </Button>
              </Link> : <Link to="/" className="flex-shrink-0">
                <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-8 rounded-lg" />
              </Link>}
            
            {/* Only show home button if not at home already */}
            {location.pathname !== "/" && !needsBackButton && <Link to="/" className="ml-2">
                
              </Link>}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Show user name on larger screens */}
            <div className="hidden md:flex items-center gap-1 mr-2">
              <User className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{userName}</span>
            </div>
            
            <Link to="/investor-signup">
              <Button variant="default" size="sm" className="hidden md:inline-flex">
                Sign Up
              </Button>
            </Link>
            
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        
        {isMenuOpen && <div className="md:hidden py-4 border-t mt-3">
            <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-md">
              <User className="w-5 h-5 text-primary" />
              <span className="font-medium">{userName}</span>
            </div>
            <nav className="flex flex-col space-y-3">
              <Link to="/" className="flex items-center gap-2 text-primary font-medium p-2 rounded-md bg-gray-50">
                <Home className="w-5 h-5" />
                <span>Home</span>
              </Link>
              <Link to="/properties" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50">
                <Building2 className="w-5 h-5" />
                <span>Properties</span>
              </Link>
              <Link to="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50">
                <LineChart className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link to="/investor-signup" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50">
                <User className="w-5 h-5" />
                <span>Sign Up</span>
              </Link>
              <Link to="/settings" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
            </nav>
          </div>}
      </div>
      
      {/* Mobile fixed bottom navigation - simplified */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t z-50 flex justify-around py-2 px-1">
        <Link to="/" className="flex flex-col items-center justify-center p-1">
          <Home className="w-5 h-5 text-primary" />
          <span className="text-xs mt-1">Home</span>
        </Link>
        <Link to="/properties" className="flex flex-col items-center justify-center p-1">
          <Building2 className="w-5 h-5 text-gray-600" />
          <span className="text-xs mt-1">Properties</span>
        </Link>
        <Link to="/dashboard" className="flex flex-col items-center justify-center p-1">
          <LineChart className="w-5 h-5 text-gray-600" />
          <span className="text-xs mt-1">Dashboard</span>
        </Link>
      </div>
    </header>;
};