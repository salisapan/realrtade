
import { useState, useEffect } from "react";
import { UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

export const DashboardHeader = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userName, setUserName] = useState("Investor");
  const isMobile = useIsMobile();

  useEffect(() => {
    try {
      const profile = localStorage.getItem("investorProfile");
      if (profile) {
        const parsedProfile = JSON.parse(profile);
        setUserName(parsedProfile.fullName || "Investor");
      }
    } catch (error) {
      console.error("Error getting user name:", error);
    }
  }, []);

  const handleProfileUpdate = () => {
    navigate('/settings');
    toast({
      title: "Redirecting to settings",
      description: "Update your profile information in the settings page",
    });
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="flex items-center justify-between mb-6 md:mb-8 flex-wrap gap-3">
      <div className="flex items-center gap-3 md:gap-6">
        <div 
          className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer"
          onClick={() => handleNavigate('/settings')}
        >
          <UserCircle className="w-8 h-8 md:w-10 md:h-10 text-primary" />
        </div>
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-gray-900">{userName}</h1>
          <p className="text-xs md:text-sm text-gray-600">Active Investor since 2023</p>
        </div>
      </div>
      <Button onClick={handleProfileUpdate} size={isMobile ? "sm" : "default"}>
        Edit Profile
      </Button>
    </div>
  );
};
