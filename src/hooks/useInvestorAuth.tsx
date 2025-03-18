
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
  const [authError, setAuthError] = useState<string | null>(null);

  // Handle full registration form submission
  async function handleFormSubmit(values: InvestorFormValues) {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      // Make sure we use the email and password from the form, not the state
      // This prevents issues with double email entry
      const emailToUse = values.email;
      
      // Register user in Supabase
      const response = await signUpWithEmail(emailToUse, password, values);

      if (response.error) {
        // Special handling for "user already registered" error
        if (response.error.code === "user_already_exists") {
          throw new Error("This email is already registered. Please use a different email or try logging in instead.");
        }
        throw new Error(response.error.message || "Registration failed");
      }

      // Store accreditation status for success screen
      setIsAccredited(values.isAccredited === "yes");

      // Custom toast based on accreditation
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

      // Save user profile to localStorage for app-wide access
      if (response.user) {
        localStorage.setItem("investorProfile", JSON.stringify({
          id: response.user.id,
          email: emailToUse,
          fullName: values.fullName || "Investor"
        }));
      }

      // Show completion message before redirecting
      setRegistrationComplete(true);

      // Redirect based on accreditation status
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

  // Google sign-in handler
  const handleGoogleSignIn = async () => {
    setIsGoogleSignInLoading(true);
    setAuthError(null);
    
    try {
      console.log("Starting Google sign-in process...");
      const response = await signInWithProvider('google');
      
      if (response.error) {
        // Specific error handling
        if (response.error.message?.includes("provider is not enabled")) {
          throw new Error("Google authentication is not currently configured in Supabase. Please check the provider settings.");
        } else if (response.error.message?.includes("403") || response.error.originalError?.status === 403) {
          throw new Error("Google authentication failed with a 403 error. Please verify the OAuth configuration in Google Cloud Console.");
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

  return {
    isSubmitting,
    registrationComplete,
    isAccredited,
    email,
    setEmail,
    password,
    setPassword,
    isGoogleSignInLoading,
    authError,
    setAuthError,
    handleFormSubmit,
    handleGoogleSignIn
  };
}
