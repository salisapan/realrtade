import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle OAuth return code
    const handleAuthCallback = async () => {
      try {
        // Check for error parameters in URL
        const hash = window.location.hash;
        const query = new URLSearchParams(window.location.search);
        
        if (query.get("error")) {
          // Display error from URL
          setError(query.get("error_description") || "An error occurred during the authentication process");
          console.error("Auth error:", query.get("error"), query.get("error_description"));
          return;
        }

        // Complete the sign-in process with URL parameters
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        if (data?.session) {
          // Check if user is registered and redirect accordingly
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", data.session.user.id)
            .single();
            
          if (profileError) {
            console.log("Profile not found, creating new profile");
            
            // Create a basic profile for the user
            await supabase
              .from("profiles")
              .insert({
                id: data.session.user.id,
                email: data.session.user.email,
                full_name: data.session.user.user_metadata?.full_name || "Investor",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            
            // Save user info to localStorage
            localStorage.setItem("investorProfile", JSON.stringify({
              id: data.session.user.id,
              email: data.session.user.email,
              fullName: data.session.user.user_metadata?.full_name || "Investor"
            }));
            
            // Redirect to properties
            navigate("/properties");
          } else if (profileData) {
            // Existing user - redirect to home or verified deals
            localStorage.setItem("investorProfile", JSON.stringify({
              id: profileData.id,
              email: profileData.email,
              fullName: profileData.full_name || "Investor"
            }));
            
            navigate(profileData.is_accredited ? "/properties" : "/verified-deals");
          } else {
            // Fallback
            navigate("/properties");
          }
        } else {
          // No session, go back to sign-up
          navigate("/investor-signup");
        }
      } catch (error) {
        console.error("Error in auth callback:", error);
        setError(error instanceof Error ? error.message : "An unexpected error occurred");
        // On error, return to sign-up after 3 seconds
        setTimeout(() => navigate("/investor-signup"), 3000);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white to-blue-50">
      {error ? (
        <div className="p-6 max-w-md bg-white rounded-lg shadow-lg border border-red-200">
          <h2 className="text-xl font-semibold text-red-600 mb-4">Authentication Error</h2>
          <p className="text-gray-700">{error}</p>
          <p className="mt-4 text-sm text-gray-500">Redirecting back to registration page...</p>
        </div>
      ) : (
        <div className="p-6 max-w-md bg-white rounded-lg shadow-lg text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Completing Authentication</h2>
          <p className="text-gray-600">Please wait while we finish the authentication process...</p>
          <div className="mt-4 text-sm text-blue-500">
            <span className="animate-pulse">Loading your profile...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthCallback;
