
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { AuthErrorDisplay } from "@/components/investor/AuthErrorDisplay";
import { CredentialsInput } from "@/components/investor/CredentialsInput";
import { SignInOptions } from "@/components/investor/SignInOptions";
import { useToast } from "@/hooks/use-toast";
import { signInWithEmail, signInWithProvider } from "@/services/authService";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSignInLoading, setIsGoogleSignInLoading] = useState(false);
  const [isAppleSignInLoading, setIsAppleSignInLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleEmailSignIn = () => {
    setShowEmailForm(true);
    setAuthError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setAuthError("Please enter both email and password");
      return;
    }
    
    setIsSubmitting(true);
    setAuthError(null);
    
    try {
      const response = await signInWithEmail(email, password);
      
      if (response.error) {
        throw new Error(response.error.message || "Login failed");
      }
      
      toast({
        title: "Login Successful",
        description: "Welcome back!"
      });
      
      // Store user info in localStorage for app-wide access
      if (response.user) {
        localStorage.setItem("investorProfile", JSON.stringify({
          id: response.user.id,
          email: response.user.email,
          fullName: response.user.user_metadata?.full_name || "Investor"
        }));
      }
      
      // Redirect to properties page
      navigate("/properties");
      
    } catch (error) {
      console.error("Login error:", error);
      setAuthError(error instanceof Error ? error.message : "An unexpected error occurred");
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for Google Sign In
  const handleGoogleSignIn = async () => {
    setIsGoogleSignInLoading(true);
    setAuthError(null);
    
    try {
      const response = await signInWithProvider('google');
      
      if (response.error) {
        throw new Error(response.error.message || "Google sign-in failed");
      }
      
      toast({
        title: "Google Sign-In Process Started",
        description: "Please complete the authentication in the Google popup window."
      });
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

  // Handler for Apple Sign In
  const handleAppleSignIn = async () => {
    setIsAppleSignInLoading(true);
    setAuthError(null);
    
    try {
      const response = await signInWithProvider('apple');
      
      if (response.error) {
        throw new Error(response.error.message || "Apple sign-in failed");
      }
      
      toast({
        title: "Apple Sign-In Process Started",
        description: "Please complete the authentication in the Apple popup window."
      });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50 animate-fade-in">
      <HomeHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8"></div>
        
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-[0_4px_24px_rgba(66,133,244,0.15)] animate-fade-in overflow-hidden border-0">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-white/30 pointer-events-none"></div>
            <CardHeader className="relative">
              <div className="flex justify-center mb-4">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-12 rounded-lg animate-float shadow-[0_0_15px_rgba(66,133,244,0.3)]" 
                />
              </div>
              <CardTitle className="text-2xl text-center">Login to RealTrade</CardTitle>
              <CardDescription className="text-center">
                Access your investment dashboard and manage your properties
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <AuthErrorDisplay error={authError} />
              
              {!showEmailForm ? (
                // Sign-in options (Google, Apple, Email)
                <SignInOptions 
                  onGoogleSignIn={handleGoogleSignIn} 
                  onAppleSignIn={handleAppleSignIn}
                  onEmailSignIn={handleEmailSignIn}
                  isGoogleLoading={isGoogleSignInLoading}
                  isAppleLoading={isAppleSignInLoading}
                />
              ) : (
                // Email & password form
                <form onSubmit={handleSubmit} className="space-y-4 p-5 bg-white rounded-lg shadow-sm border border-gray-100 animate-in fade-in-50 duration-500">
                  <CredentialsInput
                    email={email}
                    setEmail={setEmail}
                    password={password}
                    setPassword={setPassword}
                  />
                  
                  <Button 
                    type="submit" 
                    className="w-full mt-4" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Logging in..." : "Login"}
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => setShowEmailForm(false)}
                  >
                    Back to options
                  </Button>
                </form>
              )}
            </CardContent>
            <CardFooter className="flex flex-col items-start relative">
              <p className="text-sm text-gray-500">
                Don't have an account? <Link to="/investor-signup" className="text-primary font-medium hover:underline hover:text-primary-dark transition-colors duration-300">Sign up</Link>
              </p>
              <p className="text-sm text-gray-500 mt-2">
                By logging in, you agree to our Terms of Service and Privacy Policy.
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Login;
