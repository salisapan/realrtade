
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Home, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const InvestorRegistration = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    investorType: "individual",
    accredited: "",
    location: "",
    investmentAmount: [50000],
    investmentGoals: [],
    riskTolerance: "moderate",
    preferredSectors: [],
    preferredGeographies: [],
    preferredHolding: "3-5",
    notificationPreferences: []
  });

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: string, value: string) => {
    setFormData(prev => {
      const current = [...(prev[field as keyof typeof prev] as string[])];
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter(item => item !== value) };
      } else {
        return { ...prev, [field]: [...current, value] };
      }
    });
  };

  const handleNext = () => {
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Registration submitted successfully!");
    setTimeout(() => navigate("/"), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 flex flex-col items-center">
      <header className="w-full max-w-4xl px-4 mb-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <img src="/lovable-uploads/d4d21b09-7174-49fb-af4f-ee02e8e4966f.png" alt="RealTrade Logo" className="h-10 mr-4 rounded-lg" />
            <h1 className="text-2xl font-bold text-gray-900">Investor Registration</h1>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <Home className="w-4 h-4" />
              Home
            </Button>
          </Link>
        </div>
      </header>

      <div className="w-full max-w-4xl px-4">
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6 bg-primary text-white">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Complete Your Investor Profile</h2>
              <div className="text-sm">Step {step} of 5</div>
            </div>
            <div className="w-full bg-white/20 h-2 mt-2 rounded-full overflow-hidden">
              <div 
                className="bg-white h-full rounded-full" 
                style={{ width: `${(step / 5) * 100}%` }}
              ></div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {step === 1 && (
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Tell us about yourself</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input 
                        id="firstName" 
                        value={formData.firstName} 
                        onChange={(e) => handleChange("firstName", e.target.value)}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input 
                        id="lastName" 
                        value={formData.lastName} 
                        onChange={(e) => handleChange("lastName", e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      value={formData.email} 
                      onChange={(e) => handleChange("email", e.target.value)}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Create Password</Label>
                    <Input 
                      id="password" 
                      type="password" 
                      value={formData.password} 
                      onChange={(e) => handleChange("password", e.target.value)}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Investor Type</Label>
                    <RadioGroup 
                      value={formData.investorType} 
                      onValueChange={(value) => handleChange("investorType", value)}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="individual" id="individual" />
                        <Label htmlFor="individual">Individual</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="entity" id="entity" />
                        <Label htmlFor="entity">Entity/Trust</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="advisor" id="advisor" />
                        <Label htmlFor="advisor">Financial Advisor</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <CardTitle>Investor Qualifications</CardTitle>
                  <CardDescription>Help us understand your investor status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Are you an accredited investor?</Label>
                    <RadioGroup 
                      value={formData.accredited} 
                      onValueChange={(value) => handleChange("accredited", value)}
                      className="flex flex-col space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes-income" id="yes-income" />
                        <Label htmlFor="yes-income">Yes, I meet income requirements ($200k+ individual/$300k+ joint income)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes-networth" id="yes-networth" />
                        <Label htmlFor="yes-networth">Yes, I meet net worth requirements ($1M+ excluding primary residence)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes-professional" id="yes-professional" />
                        <Label htmlFor="yes-professional">Yes, I'm a financial professional with proper certification</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="no" />
                        <Label htmlFor="no">No, I do not meet accredited investor requirements</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Label htmlFor="location">Location (Country/Region)</Label>
                    <Select 
                      value={formData.location} 
                      onValueChange={(value) => handleChange("location", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your country/region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us">United States</SelectItem>
                        <SelectItem value="ca">Canada</SelectItem>
                        <SelectItem value="eu">European Union</SelectItem>
                        <SelectItem value="uk">United Kingdom</SelectItem>
                        <SelectItem value="asia">Asia</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-4">
                    <Label>Planned Investment Amount</Label>
                    <div className="space-y-2">
                      <Slider 
                        value={formData.investmentAmount} 
                        onValueChange={(value) => handleChange("investmentAmount", value)}
                        min={10000}
                        max={1000000}
                        step={10000}
                      />
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>$10,000</span>
                        <span>${formData.investmentAmount[0].toLocaleString()}</span>
                        <span>$1,000,000+</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 3 && (
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <CardTitle>Investment Goals & Preferences</CardTitle>
                  <CardDescription>Tell us what you're looking to achieve</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>What are your primary investment goals?</Label>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      {["Income", "Growth", "Tax Benefits", "Diversification", "Wealth Preservation", "Legacy Planning"].map(goal => (
                        <div key={goal} className="flex items-center space-x-2">
                          <Checkbox 
                            id={goal} 
                            checked={formData.investmentGoals.includes(goal)} 
                            onCheckedChange={() => handleArrayChange("investmentGoals", goal)}
                          />
                          <Label htmlFor={goal}>{goal}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Risk Tolerance</Label>
                    <RadioGroup 
                      value={formData.riskTolerance} 
                      onValueChange={(value) => handleChange("riskTolerance", value)}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="conservative" id="conservative" />
                        <Label htmlFor="conservative">Conservative</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="moderate" id="moderate" />
                        <Label htmlFor="moderate">Moderate</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="aggressive" id="aggressive" />
                        <Label htmlFor="aggressive">Aggressive</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Preferred Investment Holding Period</Label>
                    <RadioGroup 
                      value={formData.preferredHolding} 
                      onValueChange={(value) => handleChange("preferredHolding", value)}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="1-3" id="1-3years" />
                        <Label htmlFor="1-3years">1-3 years</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="3-5" id="3-5years" />
                        <Label htmlFor="3-5years">3-5 years</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="5+" id="5+years" />
                        <Label htmlFor="5+years">5+ years</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 4 && (
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <CardTitle>Investment Preferences</CardTitle>
                  <CardDescription>Tell us about your investment preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Preferred Investment Sectors</Label>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      {["Commercial Office", "Retail", "Industrial", "Multifamily", "Hospitality", "Healthcare", "Mixed-Use", "Self-Storage"].map(sector => (
                        <div key={sector} className="flex items-center space-x-2">
                          <Checkbox 
                            id={sector} 
                            checked={formData.preferredSectors.includes(sector)} 
                            onCheckedChange={() => handleArrayChange("preferredSectors", sector)}
                          />
                          <Label htmlFor={sector}>{sector}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Preferred Investment Geographies</Label>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      {["Northeast", "Southeast", "Midwest", "Southwest", "West Coast", "International"].map(geo => (
                        <div key={geo} className="flex items-center space-x-2">
                          <Checkbox 
                            id={geo} 
                            checked={formData.preferredGeographies.includes(geo)} 
                            onCheckedChange={() => handleArrayChange("preferredGeographies", geo)}
                          />
                          <Label htmlFor={geo}>{geo}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 5 && (
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <CardTitle>Communication Preferences</CardTitle>
                  <CardDescription>Let us know how you'd like to receive updates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Notification Preferences</Label>
                    <div className="grid grid-cols-1 gap-3 mt-1">
                      {[
                        "New investment opportunities", 
                        "Property updates", 
                        "Distribution notices", 
                        "Tax documents", 
                        "Market reports", 
                        "Educational content"
                      ].map(pref => (
                        <div key={pref} className="flex items-center space-x-2">
                          <Checkbox 
                            id={pref} 
                            checked={formData.notificationPreferences.includes(pref)} 
                            onCheckedChange={() => handleArrayChange("notificationPreferences", pref)}
                          />
                          <Label htmlFor={pref}>{pref}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="terms" required />
                      <Label htmlFor="terms" className="text-sm">
                        I have read and agree to the Terms and Conditions, Privacy Policy, and understand the risks associated with real estate investments.
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <CardFooter className="flex justify-between p-6">
              {step > 1 ? (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleBack}
                  className="flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              ) : (
                <div></div>
              )}
              
              {step < 5 ? (
                <Button 
                  type="button" 
                  onClick={handleNext}
                  className="flex items-center gap-1"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button type="submit">Complete Registration</Button>
              )}
            </CardFooter>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InvestorRegistration;
