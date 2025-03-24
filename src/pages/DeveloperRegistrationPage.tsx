
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@radix-ui/react-radio-group";
import { Eye, EyeOff } from "lucide-react";

const DeveloperRegistrationPage = () => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [roleInCompany, setRoleInCompany] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState("");
  const [countryOfRegistration, setCountryOfRegistration] = useState("");
  const [numberOfEmployees, setNumberOfEmployees] = useState("");
  const [yearsInOperation, setYearsInOperation] = useState("");
  const [pastProjects, setPastProjects] = useState("");
  const [performanceMetrics, setPerformanceMetrics] = useState("");
  const [website, setWebsite] = useState("");
  const [dealsCompleted, setDealsCompleted] = useState("");
  const [totalValueOfProjects, setTotalValueOfProjects] = useState("");
  const [legalDisputes, setLegalDisputes] = useState("no");
  const [legalDisputesExplanation, setLegalDisputesExplanation] = useState("");
  const [propertySpecialization, setPropertySpecialization] = useState<string[]>([]);
  const [backgroundCheckConsent, setBackgroundCheckConsent] = useState(false);
  
  const handleNextStep = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };
  
  const handlePrevStep = () => {
    setStep(prev => prev - 1);
  };
  
  const handleSpecializationChange = (typeId: string) => {
    setPropertySpecialization(current => {
      if (current.includes(typeId)) {
        return current.filter(id => id !== typeId);
      } else {
        return [...current, typeId];
      }
    });
  };
  
  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (currentStep === 1) {
      if (!fullName) newErrors.fullName = "Full name is required";
      if (!email) newErrors.email = "Email is required";
      if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email format is invalid";
      if (!password) newErrors.password = "Password is required";
      if (password.length < 6) newErrors.password = "Password must be at least 6 characters";
      if (!phone) newErrors.phone = "Phone number is required";
    } else if (currentStep === 2) {
      if (!companyName) newErrors.companyName = "Company name is required";
      if (!roleInCompany) newErrors.roleInCompany = "Role is required";
      if (!companyAddress) newErrors.companyAddress = "Company address is required";
      if (!companyRegistrationNumber) newErrors.companyRegistrationNumber = "Registration number is required";
      if (!countryOfRegistration) newErrors.countryOfRegistration = "Country of registration is required";
    } else if (currentStep === 3) {
      if (!numberOfEmployees) newErrors.numberOfEmployees = "Number of employees is required";
      if (!yearsInOperation) newErrors.yearsInOperation = "Years in operation is required";
      if (!pastProjects) newErrors.pastProjects = "Past projects information is required";
      if (!performanceMetrics) newErrors.performanceMetrics = "Performance metrics is required";
    } else if (currentStep === 4) {
      if (!website) newErrors.website = "Website URL is required";
      if (!dealsCompleted) newErrors.dealsCompleted = "Number of deals completed is required";
      if (!totalValueOfProjects) newErrors.totalValueOfProjects = "Total value of projects is required";
      if (legalDisputes === "yes" && !legalDisputesExplanation) {
        newErrors.legalDisputesExplanation = "Explanation is required for legal disputes";
      }
      if (propertySpecialization.length === 0) {
        newErrors.propertySpecialization = "At least one property specialization must be selected";
      }
      if (!backgroundCheckConsent) {
        newErrors.backgroundCheckConsent = "You must consent to background checks";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(step)) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            user_type: "developer"
          },
        },
      });
      
      if (error) throw error;
      
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            { 
              id: data.user.id,
              full_name: fullName,
              email: email,
              phone: phone
            },
          ]);
        
        if (profileError) {
          console.error("Error creating profile:", profileError);
          throw profileError;
        }
        
        const { error: developerError } = await supabase
          .from('developers')
          .insert([
            { 
              id: data.user.id,
              full_name: fullName,
              email: email,
              company_name: companyName,
              role_in_company: roleInCompany,
              company_address: companyAddress,
              company_registration_number: companyRegistrationNumber,
              country_of_registration: countryOfRegistration,
              number_of_employees: numberOfEmployees,
              years_in_operation: yearsInOperation,
              past_projects: pastProjects,
              performance_metrics: performanceMetrics,
              website_url: website,
              phone: phone,
              deals_completed: dealsCompleted,
              total_value_of_projects: totalValueOfProjects,
              legal_disputes: legalDisputes === "yes",
              legal_disputes_explanation: legalDisputes === "yes" ? legalDisputesExplanation : "",
              property_specialization: propertySpecialization,
              background_check_consent: backgroundCheckConsent
            },
          ]);
        
        if (developerError) {
          console.error("Error creating developer profile:", developerError);
          throw developerError;
        }
        
        toast({
          title: "Developer registration successful!",
          description: "Your account is now pending approval. We'll review your information and contact you soon.",
        });
        
        setTimeout(() => {
          navigate("/entrepreneur");
        }, 1500);
      }
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message || "An error occurred during registration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const renderStepOne = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="fullName">Full Name</Label>
        <Input 
          id="fullName" 
          value={fullName} 
          onChange={(e) => setFullName(e.target.value)} 
          placeholder="John Doe"
          className={errors.fullName ? "border-red-500" : ""}
        />
        {errors.fullName && <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>}
      </div>
      
      <div>
        <Label htmlFor="email">Email</Label>
        <Input 
          id="email" 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          placeholder="johndoe@example.com"
          className={errors.email ? "border-red-500" : ""}
        />
        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
      </div>
      
      <div>
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input 
            id="password" 
            type={showPassword ? "text" : "password"} 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="******"
            className={errors.password ? "border-red-500 pr-10" : "pr-10"}
          />
          <button 
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
      </div>
      
      <div>
        <Label htmlFor="phone">Phone Number</Label>
        <Input 
          id="phone" 
          value={phone} 
          onChange={(e) => setPhone(e.target.value)} 
          placeholder="+1 (555) 123-4567"
          className={errors.phone ? "border-red-500" : ""}
        />
        {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
      </div>
    </div>
  );
  
  const renderStepTwo = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="companyName">Company Name</Label>
        <Input 
          id="companyName" 
          value={companyName} 
          onChange={(e) => setCompanyName(e.target.value)}
          className={errors.companyName ? "border-red-500" : ""}
        />
        {errors.companyName && <p className="text-red-500 text-sm mt-1">{errors.companyName}</p>}
      </div>
      
      <div>
        <Label htmlFor="roleInCompany">Your Role in Company</Label>
        <Input 
          id="roleInCompany" 
          value={roleInCompany} 
          onChange={(e) => setRoleInCompany(e.target.value)}
          className={errors.roleInCompany ? "border-red-500" : ""}
        />
        {errors.roleInCompany && <p className="text-red-500 text-sm mt-1">{errors.roleInCompany}</p>}
      </div>
      
      <div>
        <Label htmlFor="companyAddress">Company Address</Label>
        <Input 
          id="companyAddress" 
          value={companyAddress} 
          onChange={(e) => setCompanyAddress(e.target.value)}
          className={errors.companyAddress ? "border-red-500" : ""}
        />
        {errors.companyAddress && <p className="text-red-500 text-sm mt-1">{errors.companyAddress}</p>}
      </div>
      
      <div>
        <Label htmlFor="companyRegistrationNumber">Company Registration Number</Label>
        <Input 
          id="companyRegistrationNumber" 
          value={companyRegistrationNumber} 
          onChange={(e) => setCompanyRegistrationNumber(e.target.value)}
          className={errors.companyRegistrationNumber ? "border-red-500" : ""}
        />
        {errors.companyRegistrationNumber && <p className="text-red-500 text-sm mt-1">{errors.companyRegistrationNumber}</p>}
      </div>
      
      <div>
        <Label htmlFor="countryOfRegistration">Country of Registration</Label>
        <Input 
          id="countryOfRegistration" 
          value={countryOfRegistration} 
          onChange={(e) => setCountryOfRegistration(e.target.value)}
          className={errors.countryOfRegistration ? "border-red-500" : ""}
        />
        {errors.countryOfRegistration && <p className="text-red-500 text-sm mt-1">{errors.countryOfRegistration}</p>}
      </div>
    </div>
  );
  
  const renderStepThree = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="numberOfEmployees">Number of Employees</Label>
        <Input 
          id="numberOfEmployees" 
          type="number" 
          value={numberOfEmployees} 
          onChange={(e) => setNumberOfEmployees(e.target.value)}
          className={errors.numberOfEmployees ? "border-red-500" : ""}
        />
        {errors.numberOfEmployees && <p className="text-red-500 text-sm mt-1">{errors.numberOfEmployees}</p>}
      </div>
      
      <div>
        <Label htmlFor="yearsInOperation">Years in Operation</Label>
        <Input 
          id="yearsInOperation" 
          type="number" 
          value={yearsInOperation} 
          onChange={(e) => setYearsInOperation(e.target.value)}
          className={errors.yearsInOperation ? "border-red-500" : ""}
        />
        {errors.yearsInOperation && <p className="text-red-500 text-sm mt-1">{errors.yearsInOperation}</p>}
      </div>
      
      <div>
        <Label htmlFor="pastProjects">Past Projects</Label>
        <Input 
          id="pastProjects" 
          value={pastProjects} 
          onChange={(e) => setPastProjects(e.target.value)}
          className={errors.pastProjects ? "border-red-500" : ""}
        />
        {errors.pastProjects && <p className="text-red-500 text-sm mt-1">{errors.pastProjects}</p>}
      </div>
      
      <div>
        <Label htmlFor="performanceMetrics">Performance Metrics</Label>
        <Input 
          id="performanceMetrics" 
          value={performanceMetrics} 
          onChange={(e) => setPerformanceMetrics(e.target.value)}
          className={errors.performanceMetrics ? "border-red-500" : ""}
        />
        {errors.performanceMetrics && <p className="text-red-500 text-sm mt-1">{errors.performanceMetrics}</p>}
      </div>
    </div>
  );
  
  const renderStepFour = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="website">Website URL</Label>
        <Input 
          id="website" 
          value={website} 
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
          className={errors.website ? "border-red-500" : ""}
        />
        {errors.website && <p className="text-red-500 text-sm mt-1">{errors.website}</p>}
      </div>
      
      <div>
        <Label htmlFor="dealsCompleted">Number of Deals Completed</Label>
        <Input 
          id="dealsCompleted" 
          type="number" 
          value={dealsCompleted} 
          onChange={(e) => setDealsCompleted(e.target.value)}
          className={errors.dealsCompleted ? "border-red-500" : ""}
        />
        {errors.dealsCompleted && <p className="text-red-500 text-sm mt-1">{errors.dealsCompleted}</p>}
      </div>
      
      <div>
        <Label htmlFor="totalValueOfProjects">Total Value of Projects ($)</Label>
        <Input 
          id="totalValueOfProjects" 
          type="number" 
          value={totalValueOfProjects} 
          onChange={(e) => setTotalValueOfProjects(e.target.value)}
          className={errors.totalValueOfProjects ? "border-red-500" : ""}
        />
        {errors.totalValueOfProjects && <p className="text-red-500 text-sm mt-1">{errors.totalValueOfProjects}</p>}
      </div>
      
      <div className="space-y-2">
        <Label>Have you been involved in any legal disputes?</Label>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="radio"
              id="legalDisputesYes"
              name="legalDisputes"
              value="yes"
              checked={legalDisputes === "yes"}
              onChange={() => setLegalDisputes("yes")}
              className="h-4 w-4"
            />
            <Label htmlFor="legalDisputesYes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="radio"
              id="legalDisputesNo"
              name="legalDisputes"
              value="no"
              checked={legalDisputes === "no"}
              onChange={() => setLegalDisputes("no")}
              className="h-4 w-4"
            />
            <Label htmlFor="legalDisputesNo">No</Label>
          </div>
        </div>
      </div>
      
      {legalDisputes === "yes" && (
        <div>
          <Label htmlFor="legalDisputesExplanation">Please explain</Label>
          <Input 
            id="legalDisputesExplanation" 
            value={legalDisputesExplanation} 
            onChange={(e) => setLegalDisputesExplanation(e.target.value)}
            className={errors.legalDisputesExplanation ? "border-red-500" : ""}
          />
          {errors.legalDisputesExplanation && <p className="text-red-500 text-sm mt-1">{errors.legalDisputesExplanation}</p>}
        </div>
      )}
      
      <div className="space-y-2">
        <Label>Property Specialization</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {['Residential', 'Commercial', 'Industrial', 'Retail', 'Mixed-use', 'Land Development'].map(type => (
            <div key={type} className="flex items-center space-x-2">
              <Checkbox 
                id={type} 
                checked={propertySpecialization.includes(type)}
                onCheckedChange={() => handleSpecializationChange(type)}
              />
              <Label htmlFor={type}>{type}</Label>
            </div>
          ))}
        </div>
        {errors.propertySpecialization && <p className="text-red-500 text-sm mt-1">{errors.propertySpecialization}</p>}
      </div>
      
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="backgroundCheckConsent" 
          checked={backgroundCheckConsent}
          onCheckedChange={(checked) => setBackgroundCheckConsent(checked === true)}
        />
        <Label htmlFor="backgroundCheckConsent">
          I consent to background checks as part of the verification process
        </Label>
      </div>
      {errors.backgroundCheckConsent && <p className="text-red-500 text-sm mt-1">{errors.backgroundCheckConsent}</p>}
    </div>
  );
  
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return renderStepOne();
      case 2:
        return renderStepTwo();
      case 3:
        return renderStepThree();
      case 4:
        return renderStepFour();
      default:
        return null;
    }
  };
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <div className="hidden lg:flex flex-col w-1/2 bg-gray-900 justify-center items-center px-10 text-white">
        <div className="max-w-md">
          <h1 className="text-4xl font-bold mb-6">Join our Developer Network</h1>
          <p className="text-lg mb-8">
            Connect with investors, access capital, and scale your real estate 
            development projects with our global platform.
          </p>
          <div className="space-y-6">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-500 p-1 rounded-full mt-1">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <p>Access to verified investors looking for real estate opportunities</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-blue-500 p-1 rounded-full mt-1">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <p>Streamlined due diligence and deal process</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-blue-500 p-1 rounded-full mt-1">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <p>Enhanced visibility for your projects in our marketplace</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">Developer Registration</h2>
            <p className="text-gray-600">Step {step} of 4</p>
            <div className="w-full bg-gray-200 h-2 mt-4 rounded-full overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-300 ease-in-out" 
                style={{ width: `${(step / 4) * 100}%` }}
              ></div>
            </div>
          </div>
          
          <form onSubmit={handleSubmit}>
            {renderStepContent()}
            
            <div className="flex justify-between mt-8">
              {step > 1 ? (
                <Button 
                  type="button" 
                  onClick={handlePrevStep} 
                  variant="outline"
                >
                  Back
                </Button>
              ) : (
                <Button 
                  type="button" 
                  onClick={() => navigate("/auth")} 
                  variant="outline"
                >
                  LOGIN
                </Button>
              )}
              
              {step < 4 ? (
                <Button 
                  type="button" 
                  onClick={handleNextStep}
                >
                  Next
                </Button>
              ) : (
                <Button 
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? "Submitting..." : "Submit Registration"}
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DeveloperRegistrationPage;
