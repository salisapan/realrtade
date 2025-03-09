
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
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>
        </div>
        
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex justify-center mb-4">
                <img 
                  src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                  alt="RealTrade Logo" 
                  className="h-12 rounded-lg" 
                />
              </div>
              <CardTitle className="text-2xl text-center">Investor Registration</CardTitle>
              <CardDescription className="text-center">
                Complete your investor profile to access real estate opportunities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvestorForm onSubmit={onSubmit} isSubmitting={isSubmitting} />
            </CardContent>
            <CardFooter className="flex flex-col items-start">
              <p className="text-sm text-gray-500">
                By registering, you agree to our Terms of Service and Privacy Policy.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Already have an account? <Link to="/login" className="text-primary font-medium">Log in</Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default InvestorSignup;
