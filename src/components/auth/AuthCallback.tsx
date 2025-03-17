
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const AuthCallback = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // בדיקה האם המשתמש מחובר כבר
    const checkSession = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Error checking session:", error);
          setError("Failed to authenticate. Please try again.");
        } else {
          console.log("Auth callback - session check:", data);
        }
      } catch (err) {
        console.error("Unexpected error in auth callback:", err);
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white bg-opacity-70">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-lg font-medium">Completing authentication...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="max-w-md p-6 rounded-lg shadow-lg border border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Authentication Error</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => window.location.href = "/investor-signup"}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          >
            Return to Sign Up
          </button>
        </div>
      </div>
    );
  }

  // הפניה אוטומטית לדף הבית לאחר התחברות מוצלחת
  return <Navigate to="/properties" replace />;
};

export default AuthCallback;
