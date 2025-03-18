
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

  if (registrationComplete) {
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
                // Sign-in options - Apple removed
                <SignInOptions 
                  onGoogleSignIn={handleGoogleSignIn} 
                  onEmailSignIn={handleEmailSignIn}
                  isGoogleLoading={isGoogleSignInLoading}
                />
              ) : (
                // Full registration form
                <>
                  {/* Email and password fields - These will be passed to InvestorForm */}
                  <CredentialsInput 
                    email={email}
                    setEmail={setEmail}
                    password={password}
                    setPassword={setPassword}
                  />
                  
                  {/* The InvestorForm will now use the email state from above, not asking again */}
                  <InvestorForm 
                    onSubmit={(values) => {
                      // Use the email from our state to avoid duplicate email field
                      const formValues = {
                        ...values,
                        email: email // Override the email from the form with our state value
                      };
                      handleFormSubmit(formValues);
                    }} 
                    isSubmitting={isSubmitting}
                    hideEmailField={true} // Add this prop to hide the email field in the form
                  />
                </>
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
