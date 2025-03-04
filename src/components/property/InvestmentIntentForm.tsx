import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronRight, ChevronLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const personalInfoSchema = z.object({
  fullName: z.string().min(3, "Full name must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  street: z.string().min(3, "Street address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State/province is required"),
  zipCode: z.string().min(5, "ZIP/Postal code is required"),
  country: z.string().min(2, "Country is required"),
  age: z.coerce.number().min(18, "You must be at least 18 years old"),
});

const financialInfoSchema = z.object({
  incomeRange: z.string().min(1, "Please select your income range"),
  netWorthRange: z.string().min(1, "Please select your net worth range"),
  experienceLevel: z.string().min(1, "Please select your investment experience level"),
  isAccreditedInvestor: z.boolean(),
  legalStatus: z.string().min(1, "Please select your legal status"),
});

const investmentDetailsSchema = z.object({
  investmentAmount: z.coerce.number().min(1, "Please enter a valid investment amount"),
  paymentMethod: z.string().min(1, "Please select a payment method"),
  investmentHorizon: z.string().min(1, "Please select your investment timeframe"),
  riskTolerance: z.string().min(1, "Please select your risk tolerance"),
  additionalNotes: z.string().optional(),
  agreeToTerms: z.boolean().refine(val => val === true, {
    message: "You must agree to the terms and conditions",
  }),
});

const combinedSchema = z.object({
  ...personalInfoSchema.shape,
  ...financialInfoSchema.shape,
  ...investmentDetailsSchema.shape,
});

type FormData = z.infer<typeof combinedSchema>;

interface InvestmentIntentFormProps {
  propertyId: string;
  propertyName: string;
  minInvestment: number;
}

export const InvestmentIntentForm = ({ propertyId, propertyName, minInvestment }: InvestmentIntentFormProps) => {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  
  const form = useForm<FormData>({
    resolver: zodResolver(combinedSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      age: 18,
      incomeRange: "",
      netWorthRange: "",
      experienceLevel: "",
      isAccreditedInvestor: false,
      legalStatus: "",
      investmentAmount: minInvestment,
      paymentMethod: "",
      investmentHorizon: "",
      riskTolerance: "medium",
      additionalNotes: "",
      agreeToTerms: false,
    },
    mode: "onChange",
  });
  
  const { register, handleSubmit, formState: { errors, isValid }, watch, trigger } = form;
  
  const nextStep = async () => {
    let fieldsToValidate: string[] = [];
    
    switch (step) {
      case 1:
        fieldsToValidate = ["fullName", "email", "phone", "street", "city", "state", "zipCode", "country", "age"];
        break;
      case 2:
        fieldsToValidate = ["incomeRange", "netWorthRange", "experienceLevel", "legalStatus"];
        break;
      case 3:
        fieldsToValidate = ["investmentAmount", "paymentMethod", "investmentHorizon", "riskTolerance", "agreeToTerms"];
        break;
    }
    
    const isStepValid = await trigger(fieldsToValidate as any);
    if (isStepValid) {
      setStep(step + 1);
    }
  };
  
  const prevStep = () => {
    setStep(step - 1);
  };
  
  const onSubmit = async (data: FormData) => {
    console.log("Form submitted:", data);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast({
        title: "Investment Intent Submitted",
        description: `Your $${data.investmentAmount.toLocaleString()} investment intent for ${propertyName} has been received.`,
        variant: "success",
      });
      
      setIsOpen(false);
      
      navigate("/dashboard?tab=investments");
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "There was an error processing your request. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return renderPersonalInfoStep();
      case 2:
        return renderFinancialInfoStep();
      case 3:
        return renderInvestmentDetailsStep();
      case 4:
        return renderReviewStep();
      default:
        return null;
    }
  };
  
  const renderPersonalInfoStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Personal Information</h3>
      <p className="text-sm text-gray-500 mb-4">
        Please provide your personal details for the investment intent.
      </p>
      
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full Name*</Label>
            <Input
              id="fullName"
              {...register("fullName")}
              placeholder="John Doe"
              className={errors.fullName ? "border-red-500" : ""}
            />
            {errors.fullName && (
              <p className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>
            )}
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address*</Label>
            <Input
              id="email"
              type="email"
              {...register("email")}
              placeholder="johndoe@example.com"
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone Number*</Label>
            <Input
              id="phone"
              {...register("phone")}
              placeholder="(555) 123-4567"
              className={errors.phone ? "border-red-500" : ""}
            />
            {errors.phone && (
              <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>
            )}
          </div>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="street">Street Address*</Label>
          <Input
            id="street"
            {...register("street")}
            placeholder="123 Main St"
            className={errors.street ? "border-red-500" : ""}
          />
          {errors.street && (
            <p className="text-red-500 text-xs mt-1">{errors.street.message}</p>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="city">City*</Label>
            <Input
              id="city"
              {...register("city")}
              placeholder="New York"
              className={errors.city ? "border-red-500" : ""}
            />
            {errors.city && (
              <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>
            )}
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="state">State/Province*</Label>
            <Input
              id="state"
              {...register("state")}
              placeholder="NY"
              className={errors.state ? "border-red-500" : ""}
            />
            {errors.state && (
              <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="zipCode">ZIP/Postal Code*</Label>
            <Input
              id="zipCode"
              {...register("zipCode")}
              placeholder="10001"
              className={errors.zipCode ? "border-red-500" : ""}
            />
            {errors.zipCode && (
              <p className="text-red-500 text-xs mt-1">{errors.zipCode.message}</p>
            )}
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="country">Country*</Label>
            <Input
              id="country"
              {...register("country")}
              placeholder="United States"
              className={errors.country ? "border-red-500" : ""}
            />
            {errors.country && (
              <p className="text-red-500 text-xs mt-1">{errors.country.message}</p>
            )}
          </div>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="age">Age*</Label>
          <Input
            id="age"
            type="number"
            min={18}
            {...register("age", { valueAsNumber: true })}
            className={errors.age ? "border-red-500" : ""}
          />
          {errors.age && (
            <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>
          )}
        </div>
      </div>
    </div>
  );
  
  const renderFinancialInfoStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Financial & Legal Information</h3>
      <p className="text-sm text-gray-500 mb-4">
        These details help us ensure compliance with financial regulations.
      </p>
      
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="incomeRange">Annual Income Range*</Label>
          <Select defaultValue={watch("incomeRange")} onValueChange={(value) => form.setValue("incomeRange", value)}>
            <SelectTrigger id="incomeRange" className={errors.incomeRange ? "border-red-500" : ""}>
              <SelectValue placeholder="Select income range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0-50k">$0 - $50,000</SelectItem>
              <SelectItem value="50k-100k">$50,000 - $100,000</SelectItem>
              <SelectItem value="100k-250k">$100,000 - $250,000</SelectItem>
              <SelectItem value="250k-500k">$250,000 - $500,000</SelectItem>
              <SelectItem value="500k+">$500,000+</SelectItem>
            </SelectContent>
          </Select>
          {errors.incomeRange && (
            <p className="text-red-500 text-xs mt-1">{errors.incomeRange.message}</p>
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="netWorthRange">Net Worth Range*</Label>
          <Select defaultValue={watch("netWorthRange")} onValueChange={(value) => form.setValue("netWorthRange", value)}>
            <SelectTrigger id="netWorthRange" className={errors.netWorthRange ? "border-red-500" : ""}>
              <SelectValue placeholder="Select net worth range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0-100k">$0 - $100,000</SelectItem>
              <SelectItem value="100k-500k">$100,000 - $500,000</SelectItem>
              <SelectItem value="500k-1m">$500,000 - $1,000,000</SelectItem>
              <SelectItem value="1m-5m">$1,000,000 - $5,000,000</SelectItem>
              <SelectItem value="5m+">$5,000,000+</SelectItem>
            </SelectContent>
          </Select>
          {errors.netWorthRange && (
            <p className="text-red-500 text-xs mt-1">{errors.netWorthRange.message}</p>
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="experienceLevel">Investment Experience Level*</Label>
          <Select defaultValue={watch("experienceLevel")} onValueChange={(value) => form.setValue("experienceLevel", value)}>
            <SelectTrigger id="experienceLevel" className={errors.experienceLevel ? "border-red-500" : ""}>
              <SelectValue placeholder="Select experience level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner (0-2 years)</SelectItem>
              <SelectItem value="intermediate">Intermediate (3-5 years)</SelectItem>
              <SelectItem value="experienced">Experienced (5-10 years)</SelectItem>
              <SelectItem value="expert">Expert (10+ years)</SelectItem>
            </SelectContent>
          </Select>
          {errors.experienceLevel && (
            <p className="text-red-500 text-xs mt-1">{errors.experienceLevel.message}</p>
          )}
        </div>
        
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="isAccreditedInvestor" 
              checked={watch("isAccreditedInvestor")}
              onCheckedChange={(checked) => {
                form.setValue("isAccreditedInvestor", checked === true);
              }}
            />
            <div className="flex items-center">
              <Label htmlFor="isAccreditedInvestor" className="text-sm font-medium">
                I am an Accredited Investor
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 ml-1.5 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">An accredited investor meets certain income or net worth requirements set by the SEC: $200k+ annual income ($300k+ with spouse) for the past 2 years or $1M+ net worth (excluding primary residence).</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="legalStatus">Legal Status*</Label>
          <Select defaultValue={watch("legalStatus")} onValueChange={(value) => form.setValue("legalStatus", value)}>
            <SelectTrigger id="legalStatus" className={errors.legalStatus ? "border-red-500" : ""}>
              <SelectValue placeholder="Select legal status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="jointAccount">Joint Account</SelectItem>
              <SelectItem value="llc">LLC</SelectItem>
              <SelectItem value="corporation">Corporation</SelectItem>
              <SelectItem value="trust">Trust</SelectItem>
              <SelectItem value="ira">IRA</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          {errors.legalStatus && (
            <p className="text-red-500 text-xs mt-1">{errors.legalStatus.message}</p>
          )}
        </div>
      </div>
    </div>
  );
  
  const renderInvestmentDetailsStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Investment Details</h3>
      <p className="text-sm text-gray-500 mb-4">
        Specify your investment preferences for this property.
      </p>
      
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="investmentAmount">Investment Amount ($)*</Label>
          <Input
            id="investmentAmount"
            type="number"
            min={minInvestment}
            step={1000}
            {...register("investmentAmount", { valueAsNumber: true })}
            className={errors.investmentAmount ? "border-red-500" : ""}
          />
          {errors.investmentAmount ? (
            <p className="text-red-500 text-xs mt-1">{errors.investmentAmount.message}</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">Minimum investment: ${minInvestment.toLocaleString()}</p>
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="paymentMethod">Preferred Payment Method*</Label>
          <Select defaultValue={watch("paymentMethod")} onValueChange={(value) => form.setValue("paymentMethod", value)}>
            <SelectTrigger id="paymentMethod" className={errors.paymentMethod ? "border-red-500" : ""}>
              <SelectValue placeholder="Select payment method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bankTransfer">Bank Transfer</SelectItem>
              <SelectItem value="wireTransfer">Wire Transfer</SelectItem>
              <SelectItem value="check">Check</SelectItem>
              <SelectItem value="escrow">Escrow</SelectItem>
            </SelectContent>
          </Select>
          {errors.paymentMethod && (
            <p className="text-red-500 text-xs mt-1">{errors.paymentMethod.message}</p>
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="investmentHorizon">Investment Horizon*</Label>
          <Select defaultValue={watch("investmentHorizon")} onValueChange={(value) => form.setValue("investmentHorizon", value)}>
            <SelectTrigger id="investmentHorizon" className={errors.investmentHorizon ? "border-red-500" : ""}>
              <SelectValue placeholder="Select investment timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-3years">1-3 years</SelectItem>
              <SelectItem value="3-5years">3-5 years</SelectItem>
              <SelectItem value="5-10years">5-10 years</SelectItem>
              <SelectItem value="10+years">10+ years</SelectItem>
            </SelectContent>
          </Select>
          {errors.investmentHorizon && (
            <p className="text-red-500 text-xs mt-1">{errors.investmentHorizon.message}</p>
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="riskTolerance">Risk Tolerance*</Label>
          <Select defaultValue={watch("riskTolerance")} onValueChange={(value) => form.setValue("riskTolerance", value)}>
            <SelectTrigger id="riskTolerance" className={errors.riskTolerance ? "border-red-500" : ""}>
              <SelectValue placeholder="Select risk tolerance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (Conservative)</SelectItem>
              <SelectItem value="medium">Medium (Moderate)</SelectItem>
              <SelectItem value="high">High (Aggressive)</SelectItem>
            </SelectContent>
          </Select>
          {errors.riskTolerance && (
            <p className="text-red-500 text-xs mt-1">{errors.riskTolerance.message}</p>
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="additionalNotes">Additional Notes/Comments</Label>
          <Textarea
            id="additionalNotes"
            {...register("additionalNotes")}
            placeholder="Any specific requirements or questions about this investment opportunity..."
            className="h-20 resize-none"
          />
        </div>
        
        <div className="space-y-1.5 pt-2">
          <div className="flex items-start space-x-2">
            <Checkbox 
              id="agreeToTerms" 
              checked={watch("agreeToTerms")}
              onCheckedChange={(checked) => {
                form.setValue("agreeToTerms", checked === true);
              }}
              className={errors.agreeToTerms ? "border-red-500 data-[state=checked]:bg-red-500" : ""}
            />
            <div>
              <Label 
                htmlFor="agreeToTerms" 
                className="text-sm font-medium"
              >
                I understand that this is a non-binding Letter of Intent and agree to the terms and conditions*
              </Label>
              {errors.agreeToTerms && (
                <p className="text-red-500 text-xs mt-1">{errors.agreeToTerms.message}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  
  const renderReviewStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Review Your Investment Intent</h3>
      <p className="text-sm text-gray-500 mb-4">
        Please review your information before submission.
      </p>
      
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">Property Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">Property:</div>
              <div className="font-medium">{propertyName}</div>
              <div className="text-gray-500">Property ID:</div>
              <div className="font-medium">{propertyId}</div>
              <div className="text-gray-500">Investment Amount:</div>
              <div className="font-medium text-green-600">${watch("investmentAmount").toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">Investor Information</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">Name:</div>
              <div className="font-medium">{watch("fullName")}</div>
              <div className="text-gray-500">Email:</div>
              <div className="font-medium">{watch("email")}</div>
              <div className="text-gray-500">Phone:</div>
              <div className="font-medium">{watch("phone")}</div>
              <div className="text-gray-500">Location:</div>
              <div className="font-medium">{`${watch("city")}, ${watch("state")}, ${watch("country")}`}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">Investment Preferences</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">Payment Method:</div>
              <div className="font-medium">{
                {
                  "bankTransfer": "Bank Transfer",
                  "wireTransfer": "Wire Transfer",
                  "check": "Check",
                  "escrow": "Escrow"
                }[watch("paymentMethod")] || watch("paymentMethod")
              }</div>
              <div className="text-gray-500">Investment Horizon:</div>
              <div className="font-medium">{
                {
                  "1-3years": "1-3 years",
                  "3-5years": "3-5 years",
                  "5-10years": "5-10 years",
                  "10+years": "10+ years"
                }[watch("investmentHorizon")] || watch("investmentHorizon")
              }</div>
              <div className="text-gray-500">Risk Tolerance:</div>
              <div className="font-medium">{
                {
                  "low": "Low (Conservative)",
                  "medium": "Medium (Moderate)",
                  "high": "High (Aggressive)"
                }[watch("riskTolerance")] || watch("riskTolerance")
              }</div>
              {watch("additionalNotes") && (
                <>
                  <div className="text-gray-500">Additional Notes:</div>
                  <div className="font-medium">{watch("additionalNotes")}</div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        
        <p className="text-sm text-gray-500 italic">
          By submitting this form, you acknowledge that this is a non-binding Letter of Intent (LOI) to express interest in this investment opportunity. The REALTRADE team will review your information and contact you to complete the investment process.
        </p>
      </div>
    </div>
  );
  
  const renderProgress = () => (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Personal Info</span>
        <span>Financial Status</span>
        <span>Investment Details</span>
        <span>Review</span>
      </div>
      <div className="relative pt-1">
        <div className="overflow-hidden h-2 text-xs flex bg-gray-200 rounded">
          <div
            className="flex flex-col justify-center bg-primary text-white text-center whitespace-nowrap rounded transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          {[1, 2, 3, 4].map((stepNumber) => (
            <div
              key={stepNumber}
              className={`flex items-center justify-center w-6 h-6 rounded-full border-2 -mt-3 text-xs font-semibold ${
                stepNumber <= step
                  ? "border-primary bg-primary text-white"
                  : "border-gray-300 bg-white text-gray-500"
              }`}
            >
              {stepNumber < step ? <Check className="h-3 w-3" /> : stepNumber}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button className="w-full">Invest Now</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md md:max-w-lg p-0 overflow-y-auto">
        <div className="h-full flex flex-col">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Investment Intent</h2>
            <p className="text-sm text-gray-500 mt-1">
              {propertyName} - Property ID: {propertyId}
            </p>
            {renderProgress()}
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto">
            <form onSubmit={handleSubmit(onSubmit)}>
              {renderStepContent()}
            </form>
          </div>
          
          <div className="p-6 border-t mt-auto bg-gray-50">
            <div className="flex justify-between">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  className="w-28"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back
                </Button>
              )}
              
              {step < 4 ? (
                <Button
                  type="button"
                  onClick={nextStep}
                  className="ml-auto w-28"
                >
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit(onSubmit)}
                  className="ml-auto w-36"
                >
                  Submit Intent
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
