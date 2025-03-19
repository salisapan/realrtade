
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { InvestorForm } from "@/components/investor/InvestorForm";
import { RegistrationComplete } from "@/components/investor/RegistrationComplete";
import { SignInOptions } from "@/components/investor/SignInOptions";
import { AuthErrorDisplay } from "@/components/investor/AuthErrorDisplay";
import { CredentialsInput } from "@/components/investor/CredentialsInput";
import { useInvestorAuth } from "@/hooks/useInvestorAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const InvestorSignup = () => {
  const [showStandardForm, setShowStandardForm] = useState(false);
  
  const {
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
  } = useInvestorAuth();

  // Show full registration form
  const handleEmailSignIn = () => {
    setShowStandardForm(true);
    setAuthError(null);
  };

  // This function logs when the form is submitted and ensures we pass all required data
  const onFormSubmit = (values: any) => {
    console.log("Form submitted with values:", values);
    console.log("Current email state:", email);
    
    // Use the email from our state to avoid duplicate email field
    const formValues = {
      ...values,
      email: email // Override the email from the form with our state value
    };
    
    console.log("Final form values being passed to handler:", formValues);
    handleFormSubmit(formValues);
  };

  if (registrationComplete) {
    console.log("Registration complete, showing success screen");
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HomeHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <RegistrationComplete isAccredited={isAccredited} />
        </div>
      </div>
    );
  }

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
              <CardTitle className="text-2xl text-center">Investor Registration</CardTitle>
              <CardDescription className="text-center">
                Complete your investor profile to access real estate opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <AuthErrorDisplay error={authError} />

              {!showStandardForm ? (
                // Sign-in options
                <SignInOptions 
                  onGoogleSignIn={handleGoogleSignIn} 
                  onEmailSignIn={handleEmailSignIn}
                  isGoogleLoading={isGoogleSignInLoading}
                />
              ) : (
                // Full registration form
                <div className="animate-fade-in">
                  {/* Email and password fields - These will be passed to InvestorForm */}
                  <CredentialsInput 
                    email={email}
                    setEmail={setEmail}
                    password={password}
                    setPassword={setPassword}
                  />
                  
                  {/* The InvestorForm will now use the email state from above, not asking again */}
                  <InvestorForm 
                    onSubmit={onFormSubmit} 
                    isSubmitting={isSubmitting}
                    hideEmailField={true} // Hide the email field in the form
                  />
                  
                  {/* Show animation during form submission */}
                  {isSubmitting && (
                    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                      <div className="bg-white p-8 rounded-lg shadow-xl flex flex-col items-center">
                        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                        <h3 className="text-xl font-semibold mb-2">Processing Registration</h3>
                        <p className="text-gray-600">Please wait while we create your account...</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col items-start relative">
              <p className="text-sm text-gray-500">
                By registering, you agree to our Terms of Service and Privacy Policy.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Already have an account? <Link to="/login" className="text-primary font-medium hover:underline hover:text-primary-dark transition-colors duration-300">Log in</Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default InvestorSignup;
