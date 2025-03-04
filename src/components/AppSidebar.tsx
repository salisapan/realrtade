
import { Link, useLocation } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Home, Building2, LineChart, FileText, Settings, DollarSign, UserPlus, ClipboardCheck, Menu } from "lucide-react";

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
  
  const isEntrepreneurSection = path.includes("/entrepreneur");
  const displayItems = isEntrepreneurSection ? entrepreneurMenuItems : menuItems;
  
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
                    <Link to={item.url} className={item.title === "Home" ? "font-bold text-primary" : ""}>
                      <item.icon className={item.title === "Home" ? "text-primary" : ""} />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
              {/* Show switch between Investor and Entrepreneur views */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to={isEntrepreneurSection ? "/properties" : "/entrepreneur"}>
                    {isEntrepreneurSection ? <Building2 /> : <Building2 />}
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
