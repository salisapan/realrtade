
import { Link, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Home, Building2, LineChart, FileText, Settings, DollarSign, UserPlus, ClipboardCheck, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const menuItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Properties",
    url: "/properties",
    icon: Building2,
  },
  {
    title: "Performance",
    url: "/performance",
    icon: LineChart,
  },
  {
    title: "Reports",
    url: "/reports",
    icon: FileText,
  },
  {
    title: "Wallet",
    url: "/wallet",
    icon: DollarSign,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

const entrepreneurMenuItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Entrepreneur Portal",
    url: "/entrepreneur",
    icon: Building2,
  },
  {
    title: "Due Diligence",
    url: "/entrepreneur/due-diligence",
    icon: ClipboardCheck,
  },
  {
    title: "Reports",
    url: "/entrepreneur/reports",
    icon: FileText,
  },
  {
    title: "Register",
    url: "/entrepreneur/register",
    icon: UserPlus,
  }
];

export function AppSidebar() {
  const location = useLocation();
  const path = location.pathname;
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const isEntrepreneurSection = path.includes("/entrepreneur");
  const displayItems = isEntrepreneurSection ? entrepreneurMenuItems : menuItems;
  
  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (isMobile) {
      setIsCollapsed(true);
    } else {
      setIsCollapsed(false);
    }
  }, [isMobile]);
  
  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [path]);
  
  if (isMobile) {
    return (
      <>
        <div className={`app-sidebar mobile-sidebar fixed left-0 top-0 h-full bg-white border-r z-40 transition-all duration-300 ${isCollapsed ? 'w-[60px]' : 'w-[240px]'}`}>
          <div className="p-4 flex justify-between items-center border-b">
            <Link to="/" className="flex items-center">
              <img 
                src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                alt="RealTrade Logo" 
                className="h-7 rounded-lg" 
              />
              {!isCollapsed && <span className="ml-2 font-bold">RealTrade</span>}
            </Link>
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-gray-500 hover:text-gray-700"
            >
              {isCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </button>
          </div>
          
          <nav className="p-2">
            {displayItems.map((item) => (
              <Link
                key={item.title}
                to={item.url}
                className={`flex items-center p-2 my-1 rounded-md ${
                  path === item.url ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className={`w-5 h-5 ${path === item.url ? 'text-primary' : ''}`} />
                {!isCollapsed && <span className="ml-3">{item.title}</span>}
              </Link>
            ))}
            
            <Link
              to={isEntrepreneurSection ? "/properties" : "/entrepreneur"}
              className="flex items-center p-2 my-1 rounded-md text-gray-700 hover:bg-gray-100"
            >
              <Building2 className="w-5 h-5" />
              {!isCollapsed && <span className="ml-3">{isEntrepreneurSection ? "Investor View" : "Entrepreneur View"}</span>}
            </Link>
          </nav>
        </div>
        
        {/* Floating menu button for very small screens */}
        <button
          className="mobile-menu-button md:hidden"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        
        {/* Full screen mobile menu */}
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
                {displayItems.map((item) => (
                  <Link
                    key={item.title}
                    to={item.url}
                    className={`flex items-center p-3 rounded-md ${
                      path === item.url ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className={`w-5 h-5 mr-3 ${path === item.url ? 'text-primary' : ''}`} />
                    <span>{item.title}</span>
                  </Link>
                ))}
                
                <Link
                  to={isEntrepreneurSection ? "/properties" : "/entrepreneur"}
                  className="flex items-center p-3 rounded-md text-gray-700 hover:bg-gray-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Building2 className="w-5 h-5 mr-3" />
                  <span>{isEntrepreneurSection ? "Investor View" : "Entrepreneur View"}</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{isEntrepreneurSection ? "Entrepreneur" : "Menu"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {displayItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link 
                      to={item.url} 
                      className={path === item.url ? "font-bold text-primary" : ""}
                    >
                      <item.icon className={path === item.url ? "text-primary" : ""} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
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
    </Sidebar>
  );
}
