
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

// Define a type that includes the isAccredited property
interface ExtendedProfile {
  id?: string;
  is_accredited?: boolean;
  isAccredited?: string;
  full_name?: string;
  email?: string;
  [key: string]: any; // Allow any other properties
}

export const useInvestorProfile = () => {
  const [investorProfile, setInvestorProfile] = useState<ExtendedProfile | null>(null);
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
      const parsedProfile: ExtendedProfile = JSON.parse(profile);
      
      // Ensure is_accredited gets properly mapped to isAccredited
      if (parsedProfile.is_accredited !== undefined && parsedProfile.isAccredited === undefined) {
        parsedProfile.isAccredited = parsedProfile.is_accredited ? "yes" : "no";
      }
      
      console.log("Profile loaded from storage:", parsedProfile);
      console.log("Accreditation status:", parsedProfile.is_accredited, parsedProfile.isAccredited);
      
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
