import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Home, ArrowRight, Check, Eye, EyeOff, Briefcase } from "lucide-react";

const InvestorRegistrationPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [age, setAge] = useState<number | undefined>();
  const [occupation, setOccupation] = useState("");
  const [annualIncome, setAnnualIncome] = useState<number | undefined>();
  const [netWorth, setNetWorth] = useState<number | undefined>();
  const [investmentExperience, setInvestmentExperience] = useState<string | undefined>();
  const [phone, setPhone] = useState("");
  
  const [isMillionPlus, setIsMillionPlus] = useState<string | undefined>();
  const [incomeYear1, setIncomeYear1] = useState<number | undefined>();
  const [incomeYear2, setIncomeYear2] = useState<number | undefined>();
  const [householdIncomeYear1, setHouseholdIncomeYear1] = useState<number | undefined>();
  const [householdIncomeYear2, setHouseholdIncomeYear2] = useState<number | undefined>();
  
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const validateStep = (currentStep: number) => {
    const newErrors: Record<string, string> = {};
    
    if (currentStep === 1) {
      if (!fullName) newErrors.fullName = "Full name is required";
      if (!email) newErrors.email = "Email is required";
      else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email is invalid";
      
      if (!password) newErrors.password = "Password is required";
      else if (password.length < 6) newErrors.password = "Password must be at least 6 characters";
      
      if (!phone) newErrors.phone = "Phone number is required";
      
      if (!address) newErrors.address = "Address is required";
      if (!city) newErrors.city = "City is required";
      if (!state) newErrors.state = "State is required";
      if (!zip) newErrors.zip = "ZIP code is required";
      if (!country) newErrors.country = "Country is required";
      
      if (!age) newErrors.age = "Age is required";
      else if (age < 18) newErrors.age = "You must be at least 18 years old";
      
      if (!occupation) newErrors.occupation = "Occupation is required";
      if (!investmentExperience) newErrors.investmentExperience = "Investment experience is required";
    }
    
    if (currentStep === 2) {
      if (!annualIncome) newErrors.annualIncome = "Annual income is required";
      if (!netWorth) newErrors.netWorth = "Net worth is required";
      if (!isMillionPlus) newErrors.isMillionPlus = "Please select an option";
      if (!incomeYear1) newErrors.incomeYear1 = "Previous year income is required";
      if (!incomeYear2) newErrors.incomeYear2 = "Year before previous income is required";
    }
    
    if (currentStep === 3) {
      if (!agreeTerms) newErrors.agreeTerms = "You must agree to the terms and conditions";
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
  
  const checkAccreditedStatus = (): { isAccredited: boolean, reason: string } => {
    if (isMillionPlus === "yes" && netWorth && netWorth >= 1000000) {
      return { 
        isAccredited: true, 
        reason: "Net worth of $1,000,000 or more (excluding primary residence)" 
      };
    }
    
    if (incomeYear1 && incomeYear2 && incomeYear1 >= 200000 && incomeYear2 >= 200000) {
      return { 
        isAccredited: true, 
        reason: "Individual income of $200,000+ for each of the last two years" 
      };
    }
    
    if (
      householdIncomeYear1 && 
      householdIncomeYear2 && 
      householdIncomeYear1 >= 300000 && 
      householdIncomeYear2 >= 300000
    ) {
      return { 
        isAccredited: true, 
        reason: "Household income of $300,000+ for each of the last two years" 
      };
    }
    
    return { isAccredited: false, reason: "Does not meet accredited investor criteria" };
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(step)) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { isAccredited, reason } = checkAccreditedStatus();
      
      const fullAddress = `${address}, ${city}, ${state} ${zip}, ${country}`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
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
              address: fullAddress,
              age: age,
              occupation: occupation,
              annual_income: annualIncome,
              net_worth: netWorth,
              investment_experience: investmentExperience,
              phone: phone,
              is_accredited: isAccredited,
              accredited_reason: reason,
              income_year1: incomeYear1,
              income_year2: incomeYear2,
              household_income_year1: householdIncomeYear1 || 0,
              household_income_year2: householdIncomeYear2 || 0
            },
          ]);
        
        if (profileError) {
          console.error("Error creating profile:", profileError);
          throw profileError;
        }
        
        localStorage.setItem("investorProfile", JSON.stringify({
          id: data.user.id,
          full_name: fullName,
          email: email,
          is_accredited: isAccredited
        }));
        
        toast({
          title: "Registration successful!",
          description: isAccredited 
            ? "Welcome, accredited investor! You now have access to all investment opportunities." 
            : "Welcome! You now have access to our verified deals with lower minimum investments.",
        });
        
        setTimeout(() => {
          navigate(isAccredited ? "/properties" : "/verified-deals");
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
  
  const navigateToDevRegistration = () => {
    navigate("/developer-registration");
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50">
      <HomeHeader />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-[0_4px_24px_rgba(66,133,244,0.15)] overflow-hidden border-0">
            <CardHeader className="relative bg-primary text-white">
              <div className="flex justify-between items-center">
                <CardTitle className="text-2xl">Investor Registration</CardTitle>
                <div className="text-sm">Step {step} of 3</div>
              </div>
              <CardDescription className="text-blue-100">
                Complete your profile to access investment opportunities
              </CardDescription>
              <div className="w-full bg-white/20 h-2 mt-4 rounded-full overflow-hidden">
                <div 
                  className="bg-white h-full rounded-full transition-all duration-500" 
                  style={{ width: `${(step / 3) * 100}%` }}
                ></div>
              </div>
            </CardHeader>
            
            <div className="bg-blue-50 p-4 flex justify-center items-center">
              <span className="text-sm text-gray-600 mr-2">Are you a property developer?</span>
              <Button 
                variant="outline" 
                onClick={navigateToDevRegistration}
                className="flex items-center justify-center gap-2"
              >
                <Briefcase size={16} />
                Developer Registration
              </Button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <CardContent className="p-6">
                {step === 1 && (
                  <div className="space-y-6 animate-fadeIn">
                    <h3 className="text-lg font-medium">Basic Information</h3>
                    
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
                    
                    <div className="space-y-2">
                      <Label htmlFor="address">Street Address <span className="text-red-500">*</span></Label>
                      <Input
                        id="address"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        className={errors.address ? "border-red-500" : ""}
                      />
                      {errors.address && <p className="text-red-500 text-sm">{errors.address}</p>}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City <span className="text-red-500">*</span></Label>
                        <Input
                          id="city"
                          value={city}
                          onChange={e => setCity(e.target.value)}
                          className={errors.city ? "border-red-500" : ""}
                        />
                        {errors.city && <p className="text-red-500 text-sm">{errors.city}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="state">State <span className="text-red-500">*</span></Label>
                        <Input
                          id="state"
                          value={state}
                          onChange={e => setState(e.target.value)}
                          className={errors.state ? "border-red-500" : ""}
                        />
                        {errors.state && <p className="text-red-500 text-sm">{errors.state}</p>}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="zip">ZIP Code <span className="text-red-500">*</span></Label>
                        <Input
                          id="zip"
                          value={zip}
                          onChange={e => setZip(e.target.value)}
                          className={errors.zip ? "border-red-500" : ""}
                        />
                        {errors.zip && <p className="text-red-500 text-sm">{errors.zip}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="country">Country <span className="text-red-500">*</span></Label>
                        <Input
                          id="country"
                          value={country}
                          onChange={e => setCountry(e.target.value)}
                          className={errors.country ? "border-red-500" : ""}
                        />
                        {errors.country && <p className="text-red-500 text-sm">{errors.country}</p>}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="age">Age <span className="text-red-500">*</span></Label>
                        <Input
                          id="age"
                          type="number"
                          min="18"
                          value={age || ""}
                          onChange={e => setAge(parseInt(e.target.value) || undefined)}
                          className={errors.age ? "border-red-500" : ""}
                        />
                        {errors.age && <p className="text-red-500 text-sm">{errors.age}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="occupation">Occupation <span className="text-red-500">*</span></Label>
                        <Input
                          id="occupation"
                          value={occupation}
                          onChange={e => setOccupation(e.target.value)}
                          className={errors.occupation ? "border-red-500" : ""}
                        />
                        {errors.occupation && <p className="text-red-500 text-sm">{errors.occupation}</p>}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="investmentExperience">
                        Investment Experience <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={investmentExperience}
                        onValueChange={value => setInvestmentExperience(value)}
                      >
                        <SelectTrigger className={errors.investmentExperience ? "border-red-500" : ""}>
                          <SelectValue placeholder="Select your investment experience" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="expert">Expert</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.investmentExperience && (
                        <p className="text-red-500 text-sm">{errors.investmentExperience}</p>
                      )}
                    </div>
                  </div>
                )}
                
                {step === 2 && (
                  <div className="space-y-6 animate-fadeIn">
                    <div>
                      <h3 className="text-lg font-medium">Financial Information</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        This information helps us determine your investor accreditation status
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="annualIncome">
                          Annual Income (USD) <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="annualIncome"
                          type="number"
                          min="0"
                          value={annualIncome || ""}
                          onChange={e => setAnnualIncome(parseInt(e.target.value) || undefined)}
                          className={errors.annualIncome ? "border-red-500" : ""}
                        />
                        {errors.annualIncome && <p className="text-red-500 text-sm">{errors.annualIncome}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="netWorth">
                          Net Worth (USD) <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="netWorth"
                          type="number"
                          min="0"
                          value={netWorth || ""}
                          onChange={e => setNetWorth(parseInt(e.target.value) || undefined)}
                          className={errors.netWorth ? "border-red-500" : ""}
                        />
                        <p className="text-xs text-gray-500">Exclude the value of your primary residence</p>
                        {errors.netWorth && <p className="text-red-500 text-sm">{errors.netWorth}</p>}
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Accredited Investor Verification</h3>
                      
                      <div className="space-y-2">
                        <Label htmlFor="isMillionPlus">
                          Do you have a net worth of at least $1,000,000 (excluding the value of your primary residence)? <span className="text-red-500">*</span>
                        </Label>
                        <RadioGroup
                          value={isMillionPlus}
                          onValueChange={value => setIsMillionPlus(value)}
                          className={errors.isMillionPlus ? "border border-red-500 rounded-md p-3" : ""}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="yes" id="million-yes" />
                            <Label htmlFor="million-yes">Yes</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="no" id="million-no" />
                            <Label htmlFor="million-no">No</Label>
                          </div>
                        </RadioGroup>
                        {errors.isMillionPlus && <p className="text-red-500 text-sm">{errors.isMillionPlus}</p>}
                      </div>
                      
                      <div className="space-y-4">
                        <Label>
                          What was your annual income for each of the last two years? <span className="text-red-500">*</span>
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="incomeYear1">Previous Year (USD)</Label>
                            <Input
                              id="incomeYear1"
                              type="number"
                              min="0"
                              value={incomeYear1 || ""}
                              onChange={e => setIncomeYear1(parseInt(e.target.value) || undefined)}
                              className={errors.incomeYear1 ? "border-red-500" : ""}
                            />
                            {errors.incomeYear1 && <p className="text-red-500 text-sm">{errors.incomeYear1}</p>}
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="incomeYear2">Year Before Previous (USD)</Label>
                            <Input
                              id="incomeYear2"
                              type="number"
                              min="0"
                              value={incomeYear2 || ""}
                              onChange={e => setIncomeYear2(parseInt(e.target.value) || undefined)}
                              className={errors.incomeYear2 ? "border-red-500" : ""}
                            />
                            {errors.incomeYear2 && <p className="text-red-500 text-sm">{errors.incomeYear2}</p>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <Label>
                          If you're part of a household, what was your combined annual income for each of the last two years? (Optional)
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="householdIncomeYear1">Previous Year (USD)</Label>
                            <Input
                              id="householdIncomeYear1"
                              type="number"
                              min="0"
                              value={householdIncomeYear1 || ""}
                              onChange={e => setHouseholdIncomeYear1(parseInt(e.target.value) || undefined)}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="householdIncomeYear2">Year Before Previous (USD)</Label>
                            <Input
                              id="householdIncomeYear2"
                              type="number"
                              min="0"
                              value={householdIncomeYear2 || ""}
                              onChange={e => setHouseholdIncomeYear2(parseInt(e.target.value) || undefined)}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-blue-50 p-4 rounded-md">
                        <h4 className="text-sm font-medium text-blue-800">Accredited Investor Status</h4>
                        <p className="text-sm text-blue-700 mt-1">
                          According to SEC regulations, you qualify as an accredited investor if you meet one of the following criteria:
                        </p>
                        <ul className="list-disc list-inside text-sm text-blue-700 mt-2 space-y-1">
                          <li>Net worth of $1,000,000 or more (excluding primary residence)</li>
                          <li>Individual income of $200,000+ for each of the last two years</li>
                          <li>Joint income of $300,000+ for each of the last two years</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                
                {step === 3 && (
                  <div className="space-y-6 animate-fadeIn">
                    <div>
                      <h3 className="text-lg font-medium">Terms and Conditions</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Please review and accept our terms before completing your registration
                      </p>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-md space-y-4">
                      <div className="text-sm text-gray-700 space-y-2">
                        <p>By accepting these terms, you acknowledge that:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>All investment information you provided is accurate and complete</li>
                          <li>You understand that real estate investments involve significant risk</li>
                          <li>REALTRADE doesn't guarantee investment returns</li>
                          <li>You should consult with financial advisors before investing</li>
                          <li>Your personal data will be handled according to our Privacy Policy</li>
                        </ul>
                      </div>
                      
                      <div className="flex items-start space-x-2">
                        <Checkbox 
                          id="agreeTerms" 
                          checked={agreeTerms}
                          onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                        />
                        <Label 
                          htmlFor="agreeTerms" 
                          className="text-sm"
                        >
                          I agree to the <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                        </Label>
                      </div>
                      {errors.agreeTerms && <p className="text-red-500 text-sm">{errors.agreeTerms}</p>}
                    </div>
                    
                    <div className="bg-primary/10 p-4 rounded-md">
                      <h4 className="text-sm font-medium text-primary mb-2">What happens next?</h4>
                      <p className="text-sm text-gray-700">
                        After completing your registration, you'll be redirected to your personalized dashboard. 
                        Your accredited investor status will determine which investment opportunities are available to you.
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
                
                {step < 3 ? (
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

export default InvestorRegistrationPage;
