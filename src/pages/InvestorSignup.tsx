
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { InvestorForm } from "@/components/investor/InvestorForm";
import { RegistrationComplete } from "@/components/investor/RegistrationComplete";
import { InvestorFormValues } from "@/schemas/investorSchema";

const InvestorSignup = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [isAccredited, setIsAccredited] = useState(false);
  const [showStandardForm, setShowStandardForm] = useState(false);
  
  function onSubmit(values: InvestorFormValues) {
    setIsSubmitting(true);

    // Store investor information in localStorage for demo purposes
    localStorage.setItem("investorProfile", JSON.stringify(values));

    // Store accreditation status for the success screen
    setIsAccredited(values.isAccredited === "yes");

    // Different message based on accreditation status
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
  }
  
  const handleGoogleSignIn = () => {
    // For demo purposes, we'll just complete the registration
    toast({
      title: "Google Sign-In Successful",
      description: "Welcome to RealTrade! You now have access to verified deals."
    });
    
    // Create basic profile with Google sign-in
    const basicProfile = {
      fullName: "Google User",
      email: "google.user@example.com",
      isAccredited: "no",
      signInMethod: "google"
    };
    
    localStorage.setItem("investorProfile", JSON.stringify(basicProfile));
    
    // Show completion and redirect
    setRegistrationComplete(true);
    setTimeout(() => {
      navigate("/verified-deals");
    }, 2000);
  };
  
  const handleAppleSignIn = () => {
    // For demo purposes, we'll just complete the registration
    toast({
      title: "Apple Sign-In Successful",
      description: "Welcome to RealTrade! You now have access to verified deals."
    });
    
    // Create basic profile with Apple sign-in
    const basicProfile = {
      fullName: "Apple User",
      email: "apple.user@example.com",
      isAccredited: "no",
      signInMethod: "apple"
    };
    
    localStorage.setItem("investorProfile", JSON.stringify(basicProfile));
    
    // Show completion and redirect
    setRegistrationComplete(true);
    setTimeout(() => {
      navigate("/verified-deals");
    }, 2000);
  };
  
  const handleEmailSignIn = () => {
    setShowStandardForm(true);
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
    <div className="min-h-screen bg-gray-50">
      <HomeHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="flex items-center gap-1 glow-effect">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>
        </div>
        
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-md animate-fade-in">
            <CardHeader>
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
            <CardContent>
              {!showStandardForm ? (
                <div className="space-y-4 p-4 bg-white rounded-lg">
                  <h3 className="text-center font-medium mb-4">Sign in with</h3>
                  <button 
                    onClick={handleGoogleSignIn}
                    className="sign-in-button sign-in-google"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                      <path fill="#EA4335" d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z" />
                      <path fill="#34A853" d="M16.0407269,18.0125889 C14.9509167,18.7163518 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z" />
                      <path fill="#4A90E2" d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z" />
                      <path fill="#FBBC05" d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z" />
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                  
                  <button 
                    onClick={handleAppleSignIn}
                    className="sign-in-button sign-in-apple"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.32 4.5-3.74 4.25z" />
                    </svg>
                    <span>Continue with Apple</span>
                  </button>
                  
                  <button 
                    onClick={handleEmailSignIn}
                    className="sign-in-button sign-in-email"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span>Continue with Email</span>
                  </button>
                  
                  <div className="relative flex items-center justify-center w-full mt-8 mb-4">
                    <hr className="w-full border-gray-200" />
                    <span className="absolute px-3 text-xs text-gray-500 bg-white">or</span>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    onClick={handleEmailSignIn}
                    className="w-full"
                  >
                    Sign up with detailed profile
                  </Button>
                </div>
              ) : (
                <InvestorForm onSubmit={onSubmit} isSubmitting={isSubmitting} />
              )}
            </CardContent>
            <CardFooter className="flex flex-col items-start">
              <p className="text-sm text-gray-500">
                By registering, you agree to our Terms of Service and Privacy Policy.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default InvestorSignup;
