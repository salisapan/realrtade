
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export const useInvestorProfile = () => {
  const [investorProfile, setInvestorProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const profile = localStorage.getItem("investorProfile");
    if (!profile) {
      toast({
        title: "Registration Required",
        description: "Please complete your investor profile to access properties.",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    try {
      // Create a copy of the parsed profile to avoid modifying the original
      const parsedProfile = JSON.parse(profile);
      
      // Ensure is_accredited gets properly mapped to isAccredited
      if (parsedProfile.is_accredited !== undefined && parsedProfile.isAccredited === undefined) {
        parsedProfile.isAccredited = parsedProfile.is_accredited ? "yes" : "no";
      }
      
      setInvestorProfile(parsedProfile);
      setIsLoading(false);
    } catch (error) {
      console.error("Error parsing investor profile:", error);
      setInvestorProfile(null);
      setIsLoading(false);
    }
  }, [toast]);

  return { investorProfile, isLoading };
};
