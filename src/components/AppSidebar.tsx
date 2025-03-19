
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Home, Building2, LineChart, FileText, Settings, DollarSign, UserPlus, ClipboardCheck, Menu, X, Brain, Sliders, LogOut, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const menuItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Properties", url: "/properties", icon: Building2 },
  { title: "Recommendations", url: "/recommendations", icon: Brain },
  { title: "Performance", url: "/performance", icon: LineChart },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Wallet", url: "/wallet", icon: DollarSign },
  { title: "Admin", url: "/admin", icon: Sliders },
  { title: "Settings", url: "/settings", icon: Settings }
];

const entrepreneurMenuItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Entrepreneur Portal", url: "/entrepreneur", icon: Building2 },
  { title: "Due Diligence", url: "/entrepreneur/due-diligence", icon: ClipboardCheck },
  { title: "Reports", url: "/entrepreneur/reports", icon: FileText },
  { title: "Admin", url: "/admin", icon: Sliders },
  { title: "Register", url: "/entrepreneur/register", icon: UserPlus }
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(isMobile);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isEntrepreneurSection = path.includes("/entrepreneur");
  const displayItems = isEntrepreneurSection ? entrepreneurMenuItems : menuItems;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("Investor");
  const { toast } = useToast();

  useEffect(() => {
    setIsCollapsed(isMobile);
  }, [isMobile]);

  useEffect(() => {
    // Check current auth status
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        try {
          const profile = localStorage.getItem("investorProfile");
          if (profile) {
            const parsedProfile = JSON.parse(profile);
            setUserName(parsedProfile.full_name || "Investor");
            setIsLoggedIn(true);
          } else {
            // Fetch profile if not in localStorage
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            
            if (data && !error) {
              localStorage.setItem("investorProfile", JSON.stringify(data));
              setUserName(data.full_name || "Investor");
              setIsLoggedIn(true);
            } else {
              console.error("Error fetching profile:", error);
              setIsLoggedIn(false);
            }
          }
        } catch (error) {
          console.error("Error getting user profile:", error);
          setIsLoggedIn(false);
        }
      } else {
        setIsLoggedIn(false);
      }
    };
    
    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Update login state
        setIsLoggedIn(true);
        
        // Check for profile in localStorage
        const profile = localStorage.getItem("investorProfile");
        if (profile) {
          try {
            const parsedProfile = JSON.parse(profile);
            setUserName(parsedProfile.full_name || "Investor");
          } catch (error) {
            console.error("Error parsing profile:", error);
          }
        } else {
          // Fetch profile if not in localStorage
          supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
            .then(({ data, error }) => {
              if (data && !error) {
                localStorage.setItem("investorProfile", JSON.stringify(data));
                setUserName(data.full_name || "Investor");
              }
            });
        }
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem("investorProfile");
        setUserName("Investor");
        setIsLoggedIn(false);
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      localStorage.removeItem("investorProfile");
      setIsLoggedIn(false);
      setUserName("Investor");
      
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account"
      });
      
      navigate("/");
      
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

  const ToggleButton = () => (
    <button 
      onClick={() => setIsMenuOpen(!isMenuOpen)} 
      className="fixed top-3 right-3 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white shadow-lg menu-right-aligned"
    >
      {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
    </button>
  );

  if (isMobile) {
    return (
      <>
        <ToggleButton />
        
        {isMenuOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40" 
            onClick={() => setIsMenuOpen(false)}
          >
            <div 
              className="fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50" 
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b">
                <h2 className="font-semibold text-lg">{isLoggedIn ? userName : "Welcome"}</h2>
                <p className="text-sm text-gray-500">{isEntrepreneurSection ? "Entrepreneur" : "Investor"}</p>
              </div>
              
              <div className="p-2">
                {displayItems.map(item => (
                  <Link 
                    key={item.title} 
                    to={item.url} 
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      path === item.url ? "bg-primary/10 text-primary font-medium" : "hover:bg-gray-100"
                    }`} 
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <item.icon size={20} className={path === item.url ? "text-primary" : ""} />
                    <span>{item.title}</span>
                  </Link>
                ))}
                
                {!isLoggedIn ? (
                  <Link 
                    to="/auth" 
                    className="flex items-center gap-3 p-3 rounded-lg mt-4 border-t pt-4 hover:bg-gray-100" 
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <LogIn size={20} />
                    <span>Sign In</span>
                  </Link>
                ) : (
                  <button 
                    onClick={handleSignOut}
                    className="flex items-center gap-3 p-3 rounded-lg mt-4 border-t pt-4 w-full text-left hover:bg-red-50 text-red-600"
                  >
                    <LogOut size={20} />
                    <span>Sign Out</span>
                  </button>
                )}
                
                <Link 
                  to={isEntrepreneurSection ? "/properties" : "/entrepreneur"} 
                  className="flex items-center gap-3 p-3 rounded-lg mt-4 border-t pt-4 hover:bg-gray-100" 
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Building2 size={20} />
                  <span>{isEntrepreneurSection ? "Investor View" : "Entrepreneur View"}</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{isEntrepreneurSection ? "Entrepreneur" : "Menu"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="p-3 mb-2 border-b">
              <h3 className="font-medium text-sm">{isLoggedIn ? userName : "Welcome"}</h3>
              <p className="text-xs text-gray-500">{isEntrepreneurSection ? "Entrepreneur" : "Investor"}</p>
            </div>
            
            <SidebarMenu>
              {displayItems.map(item => <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url} className={path === item.url ? "font-bold text-primary" : ""}>
                      <item.icon className={path === item.url ? "text-primary" : ""} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
              
              {!isLoggedIn ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/auth">
                      <LogIn />
                      <span>Sign In</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={handleSignOut} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <LogOut />
                    <span>Sign Out</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to={isEntrepreneurSection ? "/properties" : "/entrepreneur"}>
                    <Building2 />
                    <span>{isEntrepreneurSection ? "Investor View" : "Entrepreneur View"}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>;
}
