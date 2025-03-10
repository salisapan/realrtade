
import { Link, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Home, Building2, LineChart, FileText, Settings, DollarSign, UserPlus, ClipboardCheck, Menu, X, Rocket } from "lucide-react";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const menuItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Properties", url: "/properties", icon: Building2 },
  { title: "Autopilot", url: "/autopilot", icon: Rocket },
  { title: "Performance", url: "/performance", icon: LineChart },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Wallet", url: "/wallet", icon: DollarSign },
  { title: "Settings", url: "/settings", icon: Settings }
];

const entrepreneurMenuItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Entrepreneur Portal", url: "/entrepreneur", icon: Building2 },
  { title: "Due Diligence", url: "/entrepreneur/due-diligence", icon: ClipboardCheck },
  { title: "Reports", url: "/entrepreneur/reports", icon: FileText },
  { title: "Register", url: "/entrepreneur/register", icon: UserPlus }
];

export function AppSidebar() {
  const location = useLocation();
  const path = location.pathname;
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(isMobile);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isEntrepreneurSection = path.includes("/entrepreneur");
  const displayItems = isEntrepreneurSection ? entrepreneurMenuItems : menuItems;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("Investor");

  // Listen for window resize events to collapse sidebar on mobile
  useEffect(() => {
    setIsCollapsed(isMobile);
  }, [isMobile]);

  // Get user profile from localStorage
  useEffect(() => {
    try {
      const profile = localStorage.getItem("investorProfile");
      if (profile) {
        const parsedProfile = JSON.parse(profile);
        setUserName(parsedProfile.fullName || "Investor");
        setIsLoggedIn(true);
      } else {
        setUserName("Investor");
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error("Error getting user name:", error);
      setUserName("Investor");
      setIsLoggedIn(false);
    }
  }, []);
  
  // Mobile sidebar toggle button - removed duplicate and positioned it correctly
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
                
                {/* Show sign up only if not logged in */}
                {!isLoggedIn && (
                  <Link 
                    to="/investor-signup" 
                    className="flex items-center gap-3 p-3 rounded-lg mt-4 border-t pt-4 hover:bg-gray-100" 
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <UserPlus size={20} />
                    <span>Sign Up</span>
                  </Link>
                )}
                
                {/* Show switch between Investor and Entrepreneur views */}
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
            {/* User info section */}
            <div className="p-3 mb-2 border-b">
              <h3 className="font-medium text-sm">{isLoggedIn ? userName : "Welcome"}</h3>
              <p className="text-xs text-gray-500">{isEntrepreneurSection ? "Entrepreneur" : "Investor"}</p>
            </div>
            
            <SidebarMenu>
              {displayItems.map(item => <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url} className={item.title === "Home" ? "font-bold text-primary" : ""}>
                      <item.icon className={item.title === "Home" ? "text-primary" : ""} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
              
              {/* Show sign up only if not logged in */}
              {!isLoggedIn && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/investor-signup">
                      <UserPlus />
                      <span>Sign Up</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              
              {/* Show switch between Investor and Entrepreneur views */}
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
