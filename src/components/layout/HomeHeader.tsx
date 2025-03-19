
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Menu, User, X, ArrowLeft, Settings, Building2, LineChart, Sliders, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const HomeHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const { toast } = useToast();

  // Check if we're on a property or performance page that needs back navigation
  const needsBackButton = location.pathname.includes('/property/') || location.pathname.includes('/performance') || location.pathname.includes('/reports') || location.pathname.includes('/wallet');

  // Get user profile from localStorage and check Supabase session
  useEffect(() => {
    try {
      const profile = localStorage.getItem("investorProfile");
      if (profile) {
        const parsedProfile = JSON.parse(profile);
        setUserName(parsedProfile.full_name || "Investor");
        setIsLoggedIn(true);
      } else {
        setUserName("");
        setIsLoggedIn(false);
      }

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          // Check if we have profile data in localStorage
          const profile = localStorage.getItem("investorProfile");
          if (!profile) {
            // Fetch profile from database
            supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
              .then(({ data, error }) => {
                if (data && !error) {
                  localStorage.setItem("investorProfile", JSON.stringify(data));
                  setUserName(data.full_name || "Investor");
                  setIsLoggedIn(true);
                }
              });
          } else {
            setIsLoggedIn(true);
          }
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem("investorProfile");
          setUserName("");
          setIsLoggedIn(false);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("Error getting user name:", error);
      setUserName("");
      setIsLoggedIn(false);
    }
  }, []);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      localStorage.removeItem("investorProfile");
      setIsLoggedIn(false);
      setUserName("");
      
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account"
      });
      
      // Close mobile menu if it's open
      setIsMenuOpen(false);
    } catch (error: any) {
      console.error("Error signing out:", error);
      toast({
        title: "Sign out failed",
        description: error.message || "An error occurred while signing out",
        variant: "destructive"
      });
    }
  };
  
  return <header className="bg-white shadow-sm sticky top-0 z-50 animate-fade-in">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 max-w-[70%]">
            {needsBackButton ? <Link to={location.pathname.includes('/property/') ? '/properties' : '/'} className="flex-shrink-0">
                <Button variant="ghost" size="sm" className="flex items-center gap-1 text-primary hover:bg-primary/5 transition-all duration-300">
                  <ArrowLeft className="w-5 h-5" />
                  <span className="hidden md:inline font-medium">Back</span>
                </Button>
              </Link> : <Link to="/" className="flex-shrink-0">
                <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-8 rounded-lg transition-all duration-300 hover:shadow-[0_0_10px_rgba(66,133,244,0.25)]" /> 
              </Link>}
            
            {/* Only show home button if not at home already */}
            {location.pathname !== "/" && !needsBackButton && <Link to="/" className="ml-2">
                
              </Link>}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Admin link */}
            <Link to="/admin" className="hidden md:flex items-center">
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Sliders className="w-4 h-4 text-primary" />
                <span className="text-sm">Admin</span>
              </Button>
            </Link>
            
            {/* Show user name only if logged in */}
            {isLoggedIn && <div className="hidden md:flex items-center gap-1 mr-2">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{userName}</span>
              </div>}
            
            {/* Authentication buttons */}
            {isLoggedIn ? (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSignOut}
                className="hidden md:inline-flex items-center gap-1 border-red-200 text-red-600 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </Button>
            ) : (
              <Link to="/auth">
                <Button variant="default" size="sm" className="hidden md:inline-flex shadow-sm hover:shadow-md transition-all duration-300">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
        
        {isMenuOpen && <div className="md:hidden py-4 border-t mt-3 animate-fade-in">
            {isLoggedIn && <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-md">
                <User className="w-5 h-5 text-primary" />
                <span className="font-medium">{userName}</span>
              </div>}
            <nav className="flex flex-col space-y-3">
              <Link to="/" className="flex items-center gap-2 text-primary font-medium p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors duration-300">
                <Home className="w-5 h-5" />
                <span>Home</span>
              </Link>
              <Link to="/properties" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50 transition-all duration-300">
                <Building2 className="w-5 h-5" />
                <span>Properties</span>
              </Link>
              <Link to="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50 transition-all duration-300">
                <LineChart className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link to="/admin" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50 transition-all duration-300">
                <Sliders className="w-5 h-5" />
                <span>Admin</span>
              </Link>
              {!isLoggedIn ? (
                <Link to="/auth" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50 transition-all duration-300">
                  <User className="w-5 h-5" />
                  <span>Sign In</span>
                </Link>
              ) : (
                <button 
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-red-600 hover:text-red-700 p-2 rounded-md hover:bg-red-50 transition-all duration-300 text-left w-full"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              )}
              <Link to="/settings" className="flex items-center gap-2 text-gray-600 hover:text-primary p-2 rounded-md hover:bg-gray-50 transition-all duration-300">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
            </nav>
          </div>}
      </div>
    </header>;
};
