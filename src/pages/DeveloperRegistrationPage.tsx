import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Home, ArrowRight, ArrowLeft, Check, Eye, EyeOff } from "lucide-react";

const roleOptions = [
  { value: "ceo", label: "CEO" },
  { value: "cfo", label: "CFO" },
  { value: "project_manager", label: "Project Manager" },
  { value: "other", label: "Other" }
];

const countryOptions = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "mx", label: "Mexico" },
  { value: "uk", label: "United Kingdom" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "au", label: "Australia" },
  { value: "other", label: "Other" }
];

const propertyTypes = [
  { id: "residential", label: "Residential" },
  { id: "commercial", label: "Commercial" },
  { id: "industrial", label: "Industrial" },
  { id: "green", label: "Green Real Estate" }
];

const DeveloperRegistrationPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  
  const [companyName, setCompanyName] = useState("");
  const [roleInCompany, setRoleInCompany] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState("");
  const [countryOfRegistration, setCountryOfRegistration] = useState("");
  const [numberOfEmployees, setNumberOfEmployees] = useState<number | undefined>();
  const [yearsInOperation, setYearsInOperation] = useState<number | undefined>();
  const [website, setWebsite] = useState("");
  
  const [pastProjects, setPastProjects] = useState("");
  const [performanceMetrics, setPerformanceMetrics] = useState("");
  const [dealsCompleted, setDealsCompleted] = useState<number | undefined>();
  const [totalValueOfProjects, setTotalValueOfProjects] = useState<number | undefined>();
  const [legalDisputes, setLegalDisputes] = useState<string | undefined>();
  const [legalDisputesExplanation, setLegalDisputesExplanation] = useState("");
  const [propertySpecialization, setPropertySpecialization] = useState<string[]>([]);
  
  const [backgroundCheckConsent, setBackgroundCheckConsent] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const validateStep = (currentStep: number) => {
    const newErrors: Record<string, string> = {};
    
    if (currentStep === 1) {
      if (!fullName) newErrors.fullName = "Full name is required";
      if (!email) newErrors.email = "Email is required";
      else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email is invalid";
      
      if (!password) newErrors.password = "Password is required";
      else if (password.length < 6) newErrors.password = "Password must be at least 6 characters";
      
      if (!phone) newErrors.phone = "Phone number is required";
    }
    
    if (currentStep === 2) {
      if (!companyName) newErrors.companyName = "Company name is required";
      if (!roleInCompany) newErrors.roleInCompany = "Role in company is required";
      if (!companyAddress) newErrors.companyAddress = "Company address is required";
      if (!companyRegistrationNumber) newErrors.companyRegistrationNumber = "Company registration number is required";
      if (!countryOfRegistration) newErrors.countryOfRegistration = "Country of registration is required";
      if (!numberOfEmployees) newErrors.numberOfEmployees = "Number of employees is required";
      if (!yearsInOperation) newErrors.yearsInOperation = "Years in operation is required";
      
      if (website && !/^(http|https):\/\/[^ "]+$/.test(website)) {
        newErrors.website = "Website must be a valid URL";
      }
    }
    
    if (currentStep === 3) {
      if (!dealsCompleted) newErrors.dealsCompleted = "Number of deals is required";
      if (!totalValueOfProjects) newErrors.totalValueOfProjects = "Total value is required";
      if (!legalDisputes) newErrors.legalDisputes = "Please select an option";
      if (legalDisputes === "yes" && !legalDisputesExplanation) {
        newErrors.legalDisputesExplanation = "Please provide an explanation";
      }
      if (propertySpecialization.length === 0) {
        newErrors.propertySpecialization = "Please select at least one property type";
      }
    }
    
    if (currentStep === 4) {
      if (!backgroundCheckConsent) {
        newErrors.backgroundCheckConsent = "You must consent to background checks";
      }
      if (!agreeTerms) {
        newErrors.agreeTerms = "You must agree to the terms and conditions";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
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
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50">
      <HomeHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-[0_4px_24px_rgba(66,133,244,0.15)] overflow-hidden border-0">
            <CardHeader className="relative bg-primary text-white">
              <div className="flex justify-between items-center">
                <CardTitle className="text-2xl">Developer Registration</CardTitle>
                <div className="text-sm">Step {step} of 4</div>
              </div>
              <CardDescription className="text-blue-100">
                Join REALTRADE as a verified real estate developer
              </CardDescription>
              <div className="w-full bg-white/20 h-2 mt-4 rounded-full overflow-hidden">
                <div 
                  className="bg-white h-full rounded-full transition-all duration-500" 
                  style={{ width: `${(step / 4) * 100}%` }}
                ></div>
              </div>
            </CardHeader>
            
            <form onSubmit={handleSubmit}>
              <CardContent className="p-6">
                {step === 1 && (
                  <div className="space-y-6 animate-fadeIn">
                    <h3 className="text-lg font-medium">Developer Information</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="fullName"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          className={errors.fullName ? "border-red-500" : ""}
                        />
                        {errors.fullName && <p className="text-red-500 text-sm">{errors.fullName}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className={errors.email ? "border-red-500" : ""}
                        />
                        {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className={errors.password ? "border-red-500 pr-10" : "pr-10"}
                          />
                          <button
                            type="button"
                            onClick={togglePasswordVisibility}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500"
                          >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                        </div>
                        {errors.password && <p className="text-red-500 text-sm">{errors.password}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number <span className="text-red-500">*</span></Label>
                        <Input
                          id="phone"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          className={errors.phone ? "border-red-500" : ""}
                        />
                        {errors.phone && <p className="text-red-500 text-sm">{errors.phone}</p>}
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-md">
                      <h4 className="text-sm font-medium text-blue-800">Developer Verification Process</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        After registration, we'll verify your identity and company information. This process typically takes 1-3 business days.
                        Once approved, you'll be able to list properties and access the Developer Dashboard.
                      </p>
                    </div>
                  </div>
                )}
                
                {step === 2 && (
                  <div className="space-y-6 animate-fadeIn">
                    <h3 className="text-lg font-medium">Company Details</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="companyName"
                          value={companyName}
                          onChange={e => setCompanyName(e.target.value)}
                          className={errors.companyName ? "border-red-500" : ""}
                        />
                        {errors.companyName && <p className="text-red-500 text-sm">{errors.companyName}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="roleInCompany">Role in Company <span className="text-red-500">*</span></Label>
                        <Select
                          value={roleInCompany}
                          onValueChange={value => setRoleInCompany(value)}
                        >
                          <SelectTrigger className={errors.roleInCompany ? "border-red-500" : ""}>
                            <SelectValue placeholder="Select your role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map(role => (
                              <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.roleInCompany && <p className="text-red-500 text-sm">{errors.roleInCompany}</p>}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="companyAddress">Company Address <span className="text-red-500">*</span></Label>
                      <Input
                        id="companyAddress"
                        value={companyAddress}
                        onChange={e => setCompanyAddress(e.target.value)}
                        className={errors.companyAddress ? "border-red-500" : ""}
                      />
                      {errors.companyAddress && <p className="text-red-500 text-sm">{errors.companyAddress}</p>}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyRegistrationNumber">
                          Company Registration Number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="companyRegistrationNumber"
                          value={companyRegistrationNumber}
                          onChange={e => setCompanyRegistrationNumber(e.target.value)}
                          className={errors.companyRegistrationNumber ? "border-red-500" : ""}
                        />
                        {errors.companyRegistrationNumber && (
                          <p className="text-red-500 text-sm">{errors.companyRegistrationNumber}</p>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="countryOfRegistration">
                          Country of Company Registration <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={countryOfRegistration}
                          onValueChange={value => setCountryOfRegistration(value)}
                        >
                          <SelectTrigger className={errors.countryOfRegistration ? "border-red-500" : ""}>
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            {countryOptions.map(country => (
                              <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.countryOfRegistration && (
                          <p className="text-red-500 text-sm">{errors.countryOfRegistration}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="numberOfEmployees">
                          Number of Employees <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="numberOfEmployees"
                          type="number"
                          min="1"
                          value={numberOfEmployees || ""}
                          onChange={e => setNumberOfEmployees(parseInt(e.target.value) || undefined)}
                          className={errors.numberOfEmployees ? "border-red-500" : ""}
                        />
                        {errors.numberOfEmployees && (
                          <p className="text-red-500 text-sm">{errors.numberOfEmployees}</p>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="yearsInOperation">
                          Years in Operation <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="yearsInOperation"
                          type="number"
                          min="0"
                          value={yearsInOperation || ""}
                          onChange={e => setYearsInOperation(parseInt(e.target.value) || undefined)}
                          className={errors.yearsInOperation ? "border-red-500" : ""}
                        />
                        {errors.yearsInOperation && (
                          <p className="text-red-500 text-sm">{errors.yearsInOperation}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="website">Website URL (Optional)</Label>
                      <Input
                        id="website"
                        type="url"
                        placeholder="https://www.example.com"
                        value={website}
                        onChange={e => setWebsite(e.target.value)}
                        className={errors.website ? "border-red-500" : ""}
                      />
                      {errors.website && <p className="text-red-500 text-sm">{errors.website}</p>}
                    </div>
                  </div>
                )}
                
                {step === 3 && (
                  <div className="space-y-6 animate-fadeIn">
                    <h3 className="text-lg font-medium">Developer Background</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="pastProjects">Past Projects (Optional)</Label>
                      <Textarea
                        id="pastProjects"
                        placeholder="Briefly describe your previous real estate deals"
                        value={pastProjects}
                        onChange={e => setPastProjects(e.target.value)}
                        className="min-h-[120px]"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="performanceMetrics">Performance Metrics (Optional)</Label>
                      <Textarea
                        id="performanceMetrics"
                        placeholder="Share your average ROI, success rate, or notable achievements"
                        value={performanceMetrics}
                        onChange={e => setPerformanceMetrics(e.target.value)}
                        className="min-h-[120px]"
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label htmlFor="dealsCompleted">
                        How many real estate deals have you completed in the past 5 years? <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="dealsCompleted"
                        type="number"
                        min="0"
                        value={dealsCompleted || ""}
                        onChange={e => setDealsCompleted(parseInt(e.target.value) || undefined)}
                        className={errors.dealsCompleted ? "border-red-500" : ""}
                      />
                      {errors.dealsCompleted && <p className="text-red-500 text-sm">{errors.dealsCompleted}</p>}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="totalValueOfProjects">
                        What is the total value of your completed projects? (USD) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="totalValueOfProjects"
                        type="number"
                        min="0"
                        value={totalValueOfProjects || ""}
                        onChange={e => setTotalValueOfProjects(parseInt(e.target.value) || undefined)}
                        className={errors.totalValueOfProjects ? "border-red-500" : ""}
                      />
                      {errors.totalValueOfProjects && (
                        <p className="text-red-500 text-sm">{errors.totalValueOfProjects}</p>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <Label>
                        Have you ever faced legal disputes related to your projects? <span className="text-red-500">*</span>
                      </Label>
                      <RadioGroup
                        value={legalDisputes}
                        onValueChange={value => setLegalDisputes(value)}
                        className={errors.legalDisputes ? "border border-red-500 rounded-md p-3" : ""}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="disputes-yes" />
                          <Label htmlFor="disputes-yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="disputes-no" />
                          <Label htmlFor="disputes-no">No</Label>
                        </div>
                      </RadioGroup>
                      {errors.legalDisputes && <p className="text-red-500 text-sm">{errors.legalDisputes}</p>}
                      
                      {legalDisputes === "yes" && (
                        <div className="space-y-2 mt-3">
                          <Label htmlFor="legalDisputesExplanation">
                            Please explain <span className="text-red-500">*</span>
                          </Label>
                          <Textarea
                            id="legalDisputesExplanation"
                            value={legalDisputesExplanation}
                            onChange={e => setLegalDisputesExplanation(e.target.value)}
                            className={errors.legalDisputesExplanation ? "border-red-500 min-h-[100px]" : "min-h-[100px]"}
                          />
                          {errors.legalDisputesExplanation && (
                            <p className="text-red-500 text-sm">{errors.legalDisputesExplanation}</p>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <Label>
                        What types of properties do you specialize in? <span className="text-red-500">*</span>
                      </Label>
                      <div className={`grid grid-cols-2 gap-3 ${errors.propertySpecialization ? "border border-red-500 rounded-md p-3" : ""}`}>
                        {propertyTypes.map(type => (
                          <div key={type.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`type-${type.id}`}
                              checked={propertySpecialization.includes(type.id)}
                              onCheckedChange={() => handleSpecializationChange(type.id)}
                            />
                            <Label htmlFor={`type-${type.id}`}>{type.label}</Label>
                          </div>
                        ))}
                      </div>
                      {errors.propertySpecialization && (
                        <p className="text-red-500 text-sm">{errors.propertySpecialization}</p>
                      )}
                    </div>
                  </div>
                )}
                
                {step === 4 && (
                  <div className="space-y-6 animate-fadeIn">
                    <h3 className="text-lg font-medium">Consent and Agreement</h3>
                    
                    <div className="bg-yellow-50 p-4 rounded-md">
                      <div className="space-y-3">
                        <div className="flex items-start space-x-2">
                          <Checkbox 
                            id="backgroundCheckConsent" 
                            checked={backgroundCheckConsent}
                            onCheckedChange={(checked) => setBackgroundCheckConsent(checked as boolean)}
                            className={errors.backgroundCheckConsent ? "border-red-500" : ""}
                          />
                          <Label 
                            htmlFor="backgroundCheckConsent" 
                            className="text-sm text-yellow-800"
                          >
                            I authorize REALTRADE's representatives to conduct a credit check, legal background check, and due diligence on my company. <span className="text-red-500">*</span>
                          </Label>
                        </div>
                        {errors.backgroundCheckConsent && (
                          <p className="text-red-500 text-sm">{errors.backgroundCheckConsent}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-md space-y-4">
                      <div className="text-sm text-gray-700 space-y-2">
                        <p>By accepting these terms, you acknowledge that:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>All information provided is accurate and complete</li>
                          <li>You have the authority to represent your company on the REALTRADE platform</li>
                          <li>You will promptly update any information that changes</li>
                          <li>You understand that REALTRADE conducts thorough background checks</li>
                          <li>Your company information may be displayed to potential investors</li>
                          <li>REALTRADE reserves the right to reject applications that don't meet our standards</li>
                        </ul>
                      </div>
                      
                      <div className="flex items-start space-x-2">
                        <Checkbox 
                          id="agreeTerms" 
                          checked={agreeTerms}
                          onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                          className={errors.agreeTerms ? "border-red-500" : ""}
                        />
                        <Label 
                          htmlFor="agreeTerms" 
                          className="text-sm"
                        >
                          I agree to the <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>, <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, and <Link to="/developer-terms" className="text-primary hover:underline">Developer Terms</Link> <span className="text-red-500">*</span>
                        </Label>
                      </div>
                      {errors.agreeTerms && <p className="text-red-500 text-sm">{errors.agreeTerms}</p>}
                    </div>
                    
                    <div className="bg-primary/10 p-4 rounded-md">
                      <h4 className="text-sm font-medium text-primary mb-2">What happens next?</h4>
                      <p className="text-sm text-gray-700">
                        After submitting your application, our team will review your information within 1-3 business days. 
                        You'll receive an email notification once your account is approved. 
                        You can then log in and start listing your properties on the REALTRADE platform.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
              
              <CardFooter className="flex justify-between p-6 border-t bg-gray-50">
                {step > 1 ? (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handlePrevStep}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                ) : (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => navigate('/auth')}
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
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button 
                    type="submit"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>Processing...</>
                    ) : (
                      <>
                        Complete Registration
                        <Check className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </CardFooter>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DeveloperRegistrationPage;
