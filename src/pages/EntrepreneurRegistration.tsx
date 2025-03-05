
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Home, ArrowRight, FileText, Building2, UserPlus, Briefcase } from "lucide-react";

const EntrepreneurRegistration = () => {
  const navigate = useNavigate();
  const [formStep, setFormStep] = useState(1);
  
  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  
  const handleNextStep = () => {
    // Validate current step
    if (formStep === 1) {
      if (!fullName || !email || !password || !confirmPassword) {
        toast.error("Please fill in all required fields");
        return;
      }
      
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
      
      // Email validation
      const emailSchema = z.string().email();
      try {
        emailSchema.parse(email);
      } catch (error) {
        toast.error("Please enter a valid email address");
        return;
      }
    }
    
    if (formStep === 2) {
      if (!companyName) {
        toast.error("Company name is required");
        return;
      }
    }
    
    setFormStep(prev => prev + 1);
  };
  
  const handlePrevStep = () => {
    setFormStep(prev => Math.max(1, prev - 1));
  };
  
  const handleSubmit = () => {
    if (!acceptTerms) {
      toast.error("You must accept the terms and conditions");
      return;
    }
    
    // Submit registration without any financial restrictions
    toast.success("Registration successful! You can now log in.");
    navigate("/entrepreneur");
  };
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <img 
                src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" 
                alt="RealTrade Logo" 
                className="h-10 mr-4 rounded-lg" 
              />
              <h1 className="text-2xl font-bold text-gray-900">Entrepreneur Registration</h1>
            </div>
            <Link to="/">
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Home className="w-4 h-4" />
                Home
              </Button>
            </Link>
          </div>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Create Your Entrepreneur Account</h2>
              <div className="text-sm text-gray-500">Step {formStep} of 3</div>
            </div>
            <div className="w-full bg-gray-200 h-2 mt-4 rounded-full">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300" 
                style={{ width: `${(formStep / 3) * 100}%` }}
              ></div>
            </div>
          </div>
          
          <Card>
            {formStep === 1 && (
              <>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Tell us about yourself to create your account
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="full-name">Full Name</Label>
                    <Input 
                      id="full-name" 
                      placeholder="Enter your full name" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="Enter your email address" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input 
                      id="password" 
                      type="password" 
                      placeholder="Create a password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input 
                      id="confirm-password" 
                      type="password" 
                      placeholder="Confirm your password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleNextStep} className="flex items-center gap-2">
                    Next <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </>
            )}
            
            {formStep === 2 && (
              <>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                  <CardDescription>
                    Tell us about your company
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name</Label>
                    <Input 
                      id="company-name" 
                      placeholder="Enter your company name" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Company Description</Label>
                    <Textarea 
                      id="description" 
                      placeholder="Briefly describe your company and expertise" 
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="website">Company Website (Optional)</Label>
                    <Input 
                      id="website" 
                      placeholder="https://your-company.com" 
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="years-in-business">Years in Business</Label>
                    <Input 
                      id="years-in-business" 
                      placeholder="e.g. 5" 
                      value={yearsInBusiness}
                      onChange={(e) => setYearsInBusiness(e.target.value)}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="outline" onClick={handlePrevStep}>Back</Button>
                  <Button onClick={handleNextStep} className="flex items-center gap-2">
                    Next <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </>
            )}
            
            {formStep === 3 && (
              <>
                <CardHeader>
                  <CardTitle>Verification</CardTitle>
                  <CardDescription>
                    Complete your registration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border rounded-md p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <span>Business License</span>
                      </div>
                      <Button variant="outline" size="sm">Upload</Button>
                    </div>
                    <p className="text-sm text-gray-500">
                      Please upload a copy of your business license or registration
                    </p>
                  </div>
                  
                  <div className="border rounded-md p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-primary" />
                        <span>Proof of Identity</span>
                      </div>
                      <Button variant="outline" size="sm">Upload</Button>
                    </div>
                    <p className="text-sm text-gray-500">
                      Please upload a government-issued ID for verification
                    </p>
                  </div>
                  
                  <div className="flex items-start space-x-2 pt-4">
                    <Checkbox 
                      id="terms" 
                      checked={acceptTerms} 
                      onCheckedChange={(checked) => setAcceptTerms(!!checked)} 
                    />
                    <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I agree to the Terms of Service and Privacy Policy
                    </label>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button variant="outline" onClick={handlePrevStep}>Back</Button>
                  <Button onClick={handleSubmit}>Complete Registration</Button>
                </CardFooter>
              </>
            )}
          </Card>
          
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">
              Already have an account?{" "}
              <Link to="/entrepreneur" className="text-primary font-medium">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default EntrepreneurRegistration;
