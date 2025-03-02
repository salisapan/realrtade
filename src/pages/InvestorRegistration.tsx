
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, ArrowRight, Check, DollarSign, Globe, User } from "lucide-react";

const InvestorRegistration = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "",
    investorType: "",
    investmentGoals: [],
    preferredSectors: [],
    investmentAmount: "",
    riskTolerance: "",
    investmentHorizon: "",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiSelect = (category: string, item: string) => {
    setFormData(prev => {
      const currentItems = prev[category as keyof typeof prev] as string[];
      if (Array.isArray(currentItems)) {
        if (currentItems.includes(item)) {
          return { ...prev, [category]: currentItems.filter(i => i !== item) };
        } else {
          return { ...prev, [category]: [...currentItems, item] };
        }
      }
      return { ...prev, [category]: [item] };
    });
  };

  const handleNextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    } else {
      // Submit form
      toast({
        title: "Registration Complete",
        description: "Your investor profile has been created successfully.",
      });
      navigate("/dashboard");
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.fullName && formData.email && formData.phone;
      case 2:
        return formData.country && formData.investorType;
      case 3:
        return (formData.investmentGoals as string[]).length > 0 && (formData.preferredSectors as string[]).length > 0;
      case 4:
        return formData.investmentAmount && formData.riskTolerance && formData.investmentHorizon;
      default:
        return false;
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center mb-8">
          <Link to="/">
            <img 
              src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
              alt="RealTrade Logo" 
              className="h-16"
            />
          </Link>
        </div>
        
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Investor Registration</CardTitle>
            <CardDescription>
              Join RealTrade to access exclusive real estate investment opportunities
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="mb-8">
              <div className="flex items-center justify-between">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      currentStep >= step 
                        ? "bg-primary text-white" 
                        : "bg-gray-200 text-gray-500"
                    }`}>
                      {currentStep > step ? <Check className="w-5 h-5" /> : step}
                    </div>
                    <span className="text-xs mt-2">
                      {step === 1 && "Personal Info"}
                      {step === 2 && "Profile Type"}
                      {step === 3 && "Investment Goals"}
                      {step === 4 && "Investment Strategy"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="relative mt-2">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 rounded">
                  <div 
                    className="absolute h-full bg-primary rounded transition-all duration-300" 
                    style={{ width: `${(currentStep - 1) * 33.33}%` }}
                  ></div>
                </div>
              </div>
            </div>
          
            {currentStep === 1 && (
              <div className="space-y-6">
                <h3 className="text-xl font-medium">Personal Information</h3>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name
                    </label>
                    <Input
                      id="fullName"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="Your email address"
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <Input
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="Your phone number"
                      required
                    />
                  </div>
                </div>
              </div>
            )}
            
            {currentStep === 2 && (
              <div className="space-y-6">
                <h3 className="text-xl font-medium">Investor Profile</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Country of Residence
                    </label>
                    <select
                      className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      value={formData.country}
                      onChange={(e) => handleSelectChange("country", e.target.value)}
                    >
                      <option value="">Select your country</option>
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="UK">United Kingdom</option>
                      <option value="AU">Australia</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="SG">Singapore</option>
                      <option value="JP">Japan</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Are you an accredited investor?
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className={`p-4 border rounded-lg cursor-pointer transition-all ${
                          formData.investorType === "accredited" 
                            ? "border-primary bg-primary/5" 
                            : "border-gray-200 hover:border-primary"
                        }`}
                        onClick={() => handleSelectChange("investorType", "accredited")}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">Accredited Investor</h4>
                          <div className={`w-5 h-5 rounded-full border ${
                            formData.investorType === "accredited" 
                              ? "bg-primary border-primary" 
                              : "border-gray-300"
                          }`}>
                            {formData.investorType === "accredited" && (
                              <Check className="w-4 h-4 text-white" />
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-500">
                          I meet the financial requirements to be considered an accredited investor.
                        </p>
                      </div>
                      
                      <div
                        className={`p-4 border rounded-lg cursor-pointer transition-all ${
                          formData.investorType === "non-accredited" 
                            ? "border-primary bg-primary/5" 
                            : "border-gray-200 hover:border-primary"
                        }`}
                        onClick={() => handleSelectChange("investorType", "non-accredited")}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">Non-Accredited Investor</h4>
                          <div className={`w-5 h-5 rounded-full border ${
                            formData.investorType === "non-accredited" 
                              ? "bg-primary border-primary" 
                              : "border-gray-300"
                          }`}>
                            {formData.investorType === "non-accredited" && (
                              <Check className="w-4 h-4 text-white" />
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-500">
                          I do not meet all the requirements to be considered an accredited investor.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {currentStep === 3 && (
              <div className="space-y-6">
                <h3 className="text-xl font-medium">Investment Goals</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      What are your primary investment goals? (Select all that apply)
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        "Passive Income", 
                        "Capital Appreciation", 
                        "Portfolio Diversification", 
                        "Tax Benefits",
                        "Retirement Planning",
                        "Wealth Preservation"
                      ].map((goal) => (
                        <div
                          key={goal}
                          className={`p-3 border rounded-lg cursor-pointer transition-all flex items-center ${
                            (formData.investmentGoals as string[]).includes(goal) 
                              ? "border-primary bg-primary/5" 
                              : "border-gray-200 hover:border-primary"
                          }`}
                          onClick={() => handleMultiSelect("investmentGoals", goal)}
                        >
                          <div className={`w-5 h-5 rounded-md border mr-3 flex items-center justify-center ${
                            (formData.investmentGoals as string[]).includes(goal) 
                              ? "bg-primary border-primary" 
                              : "border-gray-300"
                          }`}>
                            {(formData.investmentGoals as string[]).includes(goal) && (
                              <Check className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <span>{goal}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Which property sectors interest you? (Select all that apply)
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        "Commercial", 
                        "Residential", 
                        "Industrial", 
                        "Retail",
                        "Office",
                        "Mixed-Use",
                        "Hospitality",
                        "Logistics",
                        "Healthcare"
                      ].map((sector) => (
                        <div
                          key={sector}
                          className={`p-3 border rounded-lg cursor-pointer transition-all flex items-center ${
                            (formData.preferredSectors as string[]).includes(sector) 
                              ? "border-primary bg-primary/5" 
                              : "border-gray-200 hover:border-primary"
                          }`}
                          onClick={() => handleMultiSelect("preferredSectors", sector)}
                        >
                          <div className={`w-5 h-5 rounded-md border mr-3 flex items-center justify-center ${
                            (formData.preferredSectors as string[]).includes(sector) 
                              ? "bg-primary border-primary" 
                              : "border-gray-300"
                          }`}>
                            {(formData.preferredSectors as string[]).includes(sector) && (
                              <Check className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <span>{sector}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {currentStep === 4 && (
              <div className="space-y-6">
                <h3 className="text-xl font-medium">Investment Strategy</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      What is your typical investment amount?
                    </label>
                    <Tabs 
                      defaultValue="25-50k" 
                      value={formData.investmentAmount}
                      onValueChange={(value) => handleSelectChange("investmentAmount", value)}
                    >
                      <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
                        <TabsTrigger value="10-25k">$10K-$25K</TabsTrigger>
                        <TabsTrigger value="25-50k">$25K-$50K</TabsTrigger>
                        <TabsTrigger value="50-100k">$50K-$100K</TabsTrigger>
                        <TabsTrigger value="100k+">$100K+</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      What is your risk tolerance?
                    </label>
                    <Tabs 
                      defaultValue="moderate" 
                      value={formData.riskTolerance}
                      onValueChange={(value) => handleSelectChange("riskTolerance", value)}
                    >
                      <TabsList className="grid grid-cols-3 w-full">
                        <TabsTrigger value="conservative">Conservative</TabsTrigger>
                        <TabsTrigger value="moderate">Moderate</TabsTrigger>
                        <TabsTrigger value="aggressive">Aggressive</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      What is your preferred investment horizon?
                    </label>
                    <Tabs 
                      defaultValue="3-5years" 
                      value={formData.investmentHorizon}
                      onValueChange={(value) => handleSelectChange("investmentHorizon", value)}
                    >
                      <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
                        <TabsTrigger value="1-3years">1-3 years</TabsTrigger>
                        <TabsTrigger value="3-5years">3-5 years</TabsTrigger>
                        <TabsTrigger value="5-10years">5-10 years</TabsTrigger>
                        <TabsTrigger value="10+years">10+ years</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        
          <CardFooter className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={handlePrevStep}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="mr-2 w-4 h-4" /> Back
            </Button>
            
            <Button 
              onClick={handleNextStep}
              disabled={!isStepValid()}
            >
              {currentStep < 4 ? (
                <>
                  Next <ArrowRight className="ml-2 w-4 h-4" />
                </>
              ) : (
                "Complete Registration"
              )}
            </Button>
          </CardFooter>
        </Card>
        
        <div className="mt-6 text-center text-sm text-gray-500">
          Already have an account? <Link to="/login" className="text-primary font-medium">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default InvestorRegistration;
