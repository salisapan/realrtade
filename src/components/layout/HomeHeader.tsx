
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Menu, User, X } from "lucide-react";
import { useState } from "react";

export const HomeHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <img 
                src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                alt="RealTrade Logo" 
                className="h-8 mr-3 rounded-lg" 
              />
            </Link>
            
            {/* Home button in prominent position */}
            <Link to="/" className="ml-4">
              <Button variant="ghost" size="sm" className="flex items-center gap-1 text-primary">
                <Home className="w-5 h-5" />
                <span className="hidden md:inline font-medium">Home</span>
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center gap-2">            
            <Link to="/investor-signup">
              <Button variant="default" size="sm" className="hidden md:inline-flex">
                Sign Up
              </Button>
            </Link>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
        
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t mt-3">
            <nav className="flex flex-col space-y-3">
              <Link to="/" className="flex items-center gap-2 text-primary font-medium p-2 rounded-md bg-gray-50">
                <Home className="w-5 h-5" />
                <span>Home</span>
              </Link>
              <Link to="/properties" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50">
                <Home className="w-5 h-5" />
                <span>Properties</span>
              </Link>
              <Link to="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50">
                <Home className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link to="/investor-signup" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50">
                <User className="w-5 h-5" />
                <span>Sign Up</span>
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};
