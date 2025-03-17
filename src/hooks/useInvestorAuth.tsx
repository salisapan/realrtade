
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { InvestorFormValues } from "@/schemas/investorSchema";
import { signUpWithEmail, signInWithProvider } from "@/services/authService";

export function useInvestorAuth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [isAccredited, setIsAccredited] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isGoogleSignInLoading, setIsGoogleSignInLoading] = useState(false);
  const [isAppleSignInLoading, setIsAppleSignInLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // טיפול בטופס הרשמה מלא
  async function handleFormSubmit(values: InvestorFormValues) {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      // רישום המשתמש ב-Supabase
      const response = await signUpWithEmail(values.email, password, values);

      if (response.error) {
        throw new Error(response.error.message || "Registration failed");
      }

      // שמירת סטטוס הכרה פיננסית לצורך מסך ההצלחה
      setIsAccredited(values.isAccredited === "yes");

      // הודעה מותאמת בהתאם לסטטוס ההכרה
      if (values.isAccredited === "yes") {
        toast({
          title: "Registration Successful",
          description: "Welcome, accredited investor! You now have access to all investment opportunities."
        });
      } else {
        toast({
          title: "Registration Successful",
          description: "Welcome! You now have access to our verified deals with lower minimum investments."
        });
      }

      // הצגת הודעת השלמה לפני הפניה
      setRegistrationComplete(true);

      // הפניה בהתאם לסטטוס ההכרה
      setTimeout(() => {
        if (values.isAccredited === "yes") {
          navigate("/properties");
        } else {
          navigate("/verified-deals");
        }
      }, 2000);

    } catch (error) {
      console.error("Registration error:", error);
      setAuthError(error instanceof Error ? error.message : "An unexpected error occurred");
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // התחברות באמצעות Google
  const handleGoogleSignIn = async () => {
    setIsGoogleSignInLoading(true);
    setAuthError(null);
    
    try {
      console.log("Starting Google sign-in process...");
      const response = await signInWithProvider('google');
      
      if (response.error) {
        // בדיקת שגיאות ספציפיות
        if (response.error.message?.includes("provider is not enabled")) {
          setAuthError("Google authentication is not currently configured in the Supabase project. Please enable the Google provider in the Supabase Auth providers settings.");
          toast({
            title: "Google Sign-In Unavailable",
            description: "Google authentication is not currently configured. Please use email signup or contact support.",
            variant: "destructive"
          });
        } else if (response.error.message?.includes("403") || response.error.originalError?.status === 403) {
          setAuthError("Received a 403 Forbidden error from Google. This usually means the OAuth credentials are incorrect or the authorized redirect URI is not properly configured in Google Cloud Console.");
          toast({
            title: "Google Authentication Error (403)",
            description: "Google OAuth configuration error. Please check the OAuth credentials and redirect URIs.",
            variant: "destructive"
          });
        } else {
          throw new Error(response.error.message || "Google sign-in failed");
        }
      } else {
        toast({
          title: "Google Sign-In Process Started",
          description: "Please complete the authentication in the Google popup window."
        });
      }
    } catch (error) {
      console.error("Google sign-in error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sign in with Google";
      setAuthError(errorMessage);
      toast({
        title: "Sign-In Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGoogleSignInLoading(false);
    }
  };

  // התחברות באמצעות Apple
  const handleAppleSignIn = async () => {
    setIsAppleSignInLoading(true);
    setAuthError(null);
    
    try {
      const response = await signInWithProvider('apple');
      
      if (response.error) {
        // Check for specific provider not enabled error
        if (response.error.message?.includes("provider is not enabled")) {
          setAuthError("Apple authentication is not currently configured in the Supabase project. Please check the provider settings in the Supabase dashboard or use email signup instead.");
          toast({
            title: "Apple Sign-In Unavailable",
            description: "Apple authentication is not currently configured. Please use email signup or contact support.",
            variant: "destructive"
          });
        } else {
          throw new Error(response.error.message || "Apple sign-in failed");
        }
      } else {
        toast({
          title: "Apple Sign-In Process Started",
          description: "Please complete the authentication in the Apple popup window."
        });
      }
    } catch (error) {
      console.error("Apple sign-in error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sign in with Apple";
      setAuthError(errorMessage);
      toast({
        title: "Sign-In Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsAppleSignInLoading(false);
    }
  };

  return {
    isSubmitting,
    registrationComplete,
    isAccredited,
    email,
    setEmail,
    password,
    setPassword,
    isGoogleSignInLoading,
    isAppleSignInLoading,
    authError,
    setAuthError,
    handleFormSubmit,
    handleGoogleSignIn,
    handleAppleSignIn
  };
}
