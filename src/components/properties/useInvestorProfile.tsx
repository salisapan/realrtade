
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUserProfile } from "@/services/authService";

export const useInvestorProfile = () => {
  const [investorProfile, setInvestorProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        // Check if there's a logged-in user session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // Try to use localStorage as a fallback if no Supabase session
          const localProfile = localStorage.getItem("investorProfile");
          
          if (localProfile) {
            setInvestorProfile(JSON.parse(localProfile));
            setIsLoading(false);
            return;
          }
          
          // If no local data, show a notification to the user
          toast({
            title: "Registration Required",
            description: "Please complete your investor profile to access properties.",
            variant: "destructive"
          });
          
          setIsLoading(false);
          navigate("/investor-signup");
          return;
        }

        // Get user profile from Supabase
        const userProfile = await getUserProfile(session.user.id);
        
        if (userProfile) {
          // Convert from Supabase format to app format
          const formattedProfile = {
            id: userProfile.id,
            fullName: userProfile.full_name,
            email: userProfile.email,
            phone: userProfile.phone,
            address: userProfile.address,
            age: userProfile.age,
            annualIncome: userProfile.annual_income,
            netWorth: userProfile.net_worth,
            investmentExperience: userProfile.investment_experience,
            isAccredited: userProfile.is_accredited ? "yes" : "no"
          };
          
          // Update localStorage with latest profile info
          localStorage.setItem("investorProfile", JSON.stringify({
            id: userProfile.id,
            email: userProfile.email,
            fullName: userProfile.full_name || "Investor"
          }));
          
          setInvestorProfile(formattedProfile);
        } else {
          // No profile found, probably need to create one
          toast({
            title: "Profile Information Missing",
            description: "Please complete your investor profile.",
            variant: "destructive"
          });
          navigate("/investor-signup");
        }
      } catch (error) {
        console.error("Error fetching investor profile:", error);
        toast({
          title: "Error",
          description: "Failed to load your profile. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserProfile();
  }, [toast, navigate]);

  return { investorProfile, isLoading };
};
