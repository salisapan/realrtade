
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/services/authService";

export const useInvestorProfile = () => {
  const [investorProfile, setInvestorProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        // בדיקה אם יש משתמש מחובר כרגע
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // למקרה שאין חיבור ל-Supabase, ננסה להשתמש ב-localStorage כגיבוי
          const localProfile = localStorage.getItem("investorProfile");
          
          if (localProfile) {
            setInvestorProfile(JSON.parse(localProfile));
            setIsLoading(false);
            return;
          }
          
          // אם אין נתונים מקומיים, נציג הודעה למשתמש
          toast({
            title: "Registration Required",
            description: "Please complete your investor profile to access properties.",
            variant: "destructive"
          });
          
          setIsLoading(false);
          return;
        }

        // קבלת פרופיל המשתמש מ-Supabase
        const userProfile = await getUserProfile(session.user.id);
        
        if (userProfile) {
          // המרה מפורמט של Supabase לפורמט הישן של האפליקציה
          const formattedProfile = {
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
          
          setInvestorProfile(formattedProfile);
        } else {
          // אם אין פרופיל, כנראה צריך ליצור אחד
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
