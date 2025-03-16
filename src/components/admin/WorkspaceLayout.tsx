
import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  BarChart3, 
  Clipboard, 
  Code, 
  Database, 
  Globe, 
  Search, 
  Settings, 
  Users, 
  DollarSign,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface WorkspaceLayoutProps {
  children: ReactNode;
}

interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  to: string;
  isActive: boolean;
  hasSubItems?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const SidebarItem = ({ 
  icon, 
  label, 
  to, 
  isActive,
  hasSubItems = false,
  isExpanded = false,
  onToggle
}: SidebarItemProps) => {
  const iconClassName = "w-5 h-5";
  
  return (
    <Link 
      to={to}
      className={`flex items-center gap-3 px-4 py-3 text-gray-700 rounded-lg ${
        isActive ? "bg-[#D3D3D3]" : "hover:bg-gray-200"
      }`}
      onClick={(e) => {
        if (hasSubItems && onToggle) {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="text-gray-600">{icon}</span>
      <span className="flex-1">{label}</span>
      {hasSubItems && (
        <span>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      )}
    </Link>
  );
};

const SubItem = ({ label, to, isActive }: { label: string; to: string; isActive: boolean }) => {
  return (
    <Link
      to={to}
      className={`flex items-center pl-12 py-2 text-sm ${
        isActive ? "text-primary font-medium" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {label}
    </Link>
  );
};

export const WorkspaceLayout = ({ children }: WorkspaceLayoutProps) => {
  const location = useLocation();
  const currentPath = location.pathname;
  
  const [expanded, setExpanded] = useState({
    data: false,
    settings: false
  });
  
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [scale, setScale] = useState(1);
  
  const toggleExpanded = (section: 'data' | 'settings') => {
    setExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  const zoom = (direction: 'in' | 'out') => {
    if (direction === 'in' && scale < 1.5) {
      setScale(prev => prev + 0.1);
    } else if (direction === 'out' && scale > 0.5) {
      setScale(prev => prev - 0.1);
    }
  };

  return (
    <div className="flex h-screen w-full bg-white">
      {/* Sidebar */}
      <div className="w-64 bg-[#F5F5F5] overflow-y-auto border-r border-gray-200">
        <div className="p-4 flex items-center justify-center">
          <img 
            src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
            alt="RealTrade Logo" 
            className="h-8 mr-2" 
          />
          <h1 className="text-xl font-semibold text-gray-800">Workspace</h1>
        </div>
        
        <div className="mt-4 px-3 space-y-1">
          <SidebarItem 
            icon={<Clipboard className="w-5 h-5" />} 
            label="Overview" 
            to="/admin" 
            isActive={currentPath === "/admin"} 
          />
          
          <SidebarItem 
            icon={<BarChart3 className="w-5 h-5" />} 
            label="Analytics" 
            to="/admin/analytics" 
            isActive={currentPath === "/admin/analytics"} 
          />
          
          <SidebarItem 
            icon={<Globe className="w-5 h-5" />} 
            label="Domains" 
            to="/admin/domains" 
            isActive={currentPath === "/admin/domains"} 
          />
          
          <SidebarItem 
            icon={<DollarSign className="w-5 h-5" />} 
            label="Payments" 
            to="/admin/payments" 
            isActive={currentPath === "/admin/payments"} 
          />
          
          <SidebarItem 
            icon={<Users className="w-5 h-5" />} 
            label="Users" 
            to="/admin/users" 
            isActive={currentPath === "/admin/users"} 
          />
          
          <SidebarItem 
            icon={<Database className="w-5 h-5" />} 
            label="Data" 
            to="/admin/data" 
            isActive={currentPath.startsWith("/admin/data")}
            hasSubItems={true}
            isExpanded={expanded.data}
            onToggle={() => toggleExpanded('data')}
          />
          
          {expanded.data && (
            <div className="ml-2 border-l border-gray-200 pl-2">
              <SubItem 
                label="Property" 
                to="/admin/data/property" 
                isActive={currentPath === "/admin/data/property"} 
              />
              <SubItem 
                label="Investment" 
                to="/admin/data/investment" 
                isActive={currentPath === "/admin/data/investment"} 
              />
            </div>
          )}
          
          <SidebarItem 
            icon={<Code className="w-5 h-5" />} 
            label="Code" 
            to="/admin/code" 
            isActive={currentPath === "/admin/code"} 
          />
          
          <SidebarItem 
            icon={<Search className="w-5 h-5" />} 
            label="Logs" 
            to="/admin/logs" 
            isActive={currentPath === "/admin/logs"} 
          />
          
          <SidebarItem 
            icon={<Settings className="w-5 h-5" />} 
            label="Settings" 
            to="/admin/settings" 
            isActive={currentPath.startsWith("/admin/settings")}
            hasSubItems={true}
            isExpanded={expanded.settings}
            onToggle={() => toggleExpanded('settings')}
          />
          
          {expanded.settings && (
            <div className="ml-2 border-l border-gray-200 pl-2">
              <SubItem 
                label="Logo" 
                to="/admin/settings/logo" 
                isActive={currentPath === "/admin/settings/logo"} 
              />
              <SubItem 
                label="App Settings" 
                to="/admin/settings/app" 
                isActive={currentPath === "/admin/settings/app"} 
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex gap-2">
            <Button variant="outline">
              <Link to="/">Preview</Link>
            </Button>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => zoom('out')} title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => zoom('in')} title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button 
              variant="default" 
              className="bg-[#14151A] hover:bg-[#2A2B30] text-white"
              onClick={() => setPublishDialogOpen(true)}
            >
              Publish
            </Button>
          </div>
        </div>
        
        {/* Content Area */}
        <div 
          className="flex-1 overflow-auto p-6" 
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {children}
        </div>
      </div>
      
      {/* Publish Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Changes</DialogTitle>
            <DialogDescription>
              Are you sure you want to publish these changes to the live application?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                // Publish logic would go here
                setPublishDialogOpen(false);
              }}
            >
              Yes, Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
