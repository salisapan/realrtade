
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const personalInfoSchema = z.object({
  fullName: z.string().min(3, "Full name must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  address: z.object({
    street: z.string().min(1, "Street address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    zipCode: z.string().min(5, "Please enter a valid ZIP code"),
  }),
  age: z.coerce.number().min(18, "You must be at least 18 years old"),
});

const financialInfoSchema = z.object({
  incomeRange: z.string().min(1, "Please select your income range"),
  netWorthRange: z.string().min(1, "Please select your net worth range"),
  investmentExperience: z.string().min(1, "Please select your investment experience"),
  isAccreditedInvestor: z.boolean(),
  legalStatus: z.string().min(1, "Please select your legal status"),
});

const investmentDetailsSchema = z.object({
  investmentAmount: z.coerce.number().min(1, "Please enter a valid investment amount"),
  paymentMethod: z.string().min(1, "Please select a payment method"),
  recurringInvestment: z.boolean().optional(),
  agreeToTerms: z.boolean().refine(val => val === true, {
    message: "You must agree to the terms and conditions",
    path: ["agreeToTerms"],
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

export const InvestmentIntentForm = ({ 
  propertyId, 
  propertyName, 
  minInvestment 
}: InvestmentIntentFormProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  
  const form = useForm<FormData>({
    resolver: zodResolver(combinedSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      address: {
        street: "",
        city: "",
        state: "",
        zipCode: "",
      },
      age: 0,
      incomeRange: "",
      netWorthRange: "",
      investmentExperience: "",
      isAccreditedInvestor: false,
      legalStatus: "",
      investmentAmount: minInvestment,
      paymentMethod: "",
      recurringInvestment: false,
      agreeToTerms: false,
    },
  });
  
  const { errors } = form.formState;
  const watch = form.watch;
  
  // Define the form steps
  const [currentStep, setCurrentStep] = useState<'personal' | 'financial' | 'investment'>('personal');
  
  // Handle form navigation
  const goToNextStep = () => {
    if (currentStep === 'personal') {
      // Validate personal info fields
      const personalInfoFields = form.getValues();
      const personalInfoResult = personalInfoSchema.safeParse({
        fullName: personalInfoFields.fullName,
        email: personalInfoFields.email,
        phone: personalInfoFields.phone,
        address: personalInfoFields.address,
        age: personalInfoFields.age,
      });
      
      if (personalInfoResult.success) {
        setCurrentStep('financial');
      } else {
        // Trigger validation to show errors
        void form.trigger([
          'fullName',
          'email',
          'phone',
          'address.street',
          'address.city',
          'address.state',
          'address.zipCode',
          'age',
        ]);
      }
    } else if (currentStep === 'financial') {
      // Validate financial info fields
      const financialInfoFields = form.getValues();
      const financialInfoResult = financialInfoSchema.safeParse({
        incomeRange: financialInfoFields.incomeRange,
        netWorthRange: financialInfoFields.netWorthRange,
        investmentExperience: financialInfoFields.investmentExperience,
        isAccreditedInvestor: financialInfoFields.isAccreditedInvestor,
        legalStatus: financialInfoFields.legalStatus,
      });
      
      if (financialInfoResult.success) {
        setCurrentStep('investment');
      } else {
        // Trigger validation to show errors
        void form.trigger([
          'incomeRange',
          'netWorthRange',
          'investmentExperience',
          'legalStatus',
        ]);
      }
    }
  };
  
  const goToPreviousStep = () => {
    if (currentStep === 'financial') {
      setCurrentStep('personal');
    } else if (currentStep === 'investment') {
      setCurrentStep('financial');
    }
  };
  
  const onSubmit = async (data: FormData) => {
    console.log("Form submitted:", data);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast({
        title: "Investment Intent Submitted",
        description: `You've successfully expressed interest in ${propertyName}.`,
        variant: "success",
      });
      
      setIsOpen(false);
      
      navigate("/dashboard?tab=investments");
    } catch (error) {
      toast({
        title: "Error",
        description: "There was an error submitting your investment intent. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button className="w-full">Express Interest</Button>
      </SheetTrigger>
      <SheetContent className="w-full md:max-w-xl overflow-y-auto">
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold">Express Interest in {propertyName}</h3>
            <p className="text-sm text-muted-foreground mt-1">Complete this form to initiate your investment.</p>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div 
              className={`flex flex-col items-center ${currentStep === 'personal' ? 'text-primary' : 'text-gray-400'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${currentStep === 'personal' ? 'bg-primary text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span>Personal</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 mx-2"></div>
            <div 
              className={`flex flex-col items-center ${currentStep === 'financial' ? 'text-primary' : 'text-gray-400'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${currentStep === 'financial' ? 'bg-primary text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span>Financial</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 mx-2"></div>
            <div 
              className={`flex flex-col items-center ${currentStep === 'investment' ? 'text-primary' : 'text-gray-400'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${currentStep === 'investment' ? 'bg-primary text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span>Investment</span>
            </div>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Step 1: Personal Information */}
              {currentStep === 'personal' && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="Enter your email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your phone number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-2">
                    <FormLabel>Address</FormLabel>
                    <div className="grid grid-cols-1 gap-2">
                      <FormField
                        control={form.control}
                        name="address.street"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="Street Address" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={form.control}
                          name="address.city"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="City" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="address.state"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="State" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="address.zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="ZIP Code" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="age"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Age</FormLabel>
                        <FormControl>
                          <Input type="number" min="18" placeholder="Enter your age" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              
              {/* Step 2: Financial Information */}
              {currentStep === 'financial' && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="incomeRange"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual Income Range</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select income range" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="under-50k">Under $50,000</SelectItem>
                            <SelectItem value="50k-100k">$50,000 - $100,000</SelectItem>
                            <SelectItem value="100k-200k">$100,000 - $200,000</SelectItem>
                            <SelectItem value="200k-300k">$200,000 - $300,000</SelectItem>
                            <SelectItem value="over-300k">Over $300,000</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="netWorthRange"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Net Worth Range</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select net worth range" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="under-100k">Under $100,000</SelectItem>
                            <SelectItem value="100k-500k">$100,000 - $500,000</SelectItem>
                            <SelectItem value="500k-1m">$500,000 - $1,000,000</SelectItem>
                            <SelectItem value="1m-5m">$1,000,000 - $5,000,000</SelectItem>
                            <SelectItem value="over-5m">Over $5,000,000</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="investmentExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investment Experience</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select experience level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="beginner">Beginner (0-2 years)</SelectItem>
                            <SelectItem value="intermediate">Intermediate (2-5 years)</SelectItem>
                            <SelectItem value="experienced">Experienced (5-10 years)</SelectItem>
                            <SelectItem value="expert">Expert (10+ years)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="legalStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legal Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select legal status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="individual">Individual</SelectItem>
                            <SelectItem value="joint">Joint</SelectItem>
                            <SelectItem value="trust">Trust</SelectItem>
                            <SelectItem value="entity">Entity (LLC, Corp, etc.)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex items-start space-x-2 pt-2">
                    <Checkbox 
                      id="isAccreditedInvestor" 
                      checked={watch("isAccreditedInvestor")}
                      onCheckedChange={(checked) => {
                        form.setValue("isAccreditedInvestor", checked === true);
                      }}
                    />
                    <div className="flex items-center">
                      <Label htmlFor="isAccreditedInvestor" className="text-sm font-medium">
                        I am an accredited investor
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 ml-1 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>An accredited investor has an annual income of $200,000+ ($300,000+ with spouse) for the past 2 years or a net worth exceeding $1,000,000 (excluding primary residence).</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Step 3: Investment Details */}
              {currentStep === 'investment' && (
                <div className="space-y-4">
                  <div>
                    <Badge variant="outline" className="mb-3">Minimum investment: ${minInvestment.toLocaleString()}</Badge>
                    <FormField
                      control={form.control}
                      name="investmentAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Investment Amount</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">$</span>
                              <Input 
                                type="number"
                                min={minInvestment}
                                step="100"
                                className="pl-7" 
                                {...field}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  if (isNaN(value) || value < minInvestment) {
                                    field.onChange(minInvestment);
                                  } else {
                                    field.onChange(value);
                                  }
                                }}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="bank-transfer">Bank Transfer (ACH)</SelectItem>
                            <SelectItem value="wire">Wire Transfer</SelectItem>
                            <SelectItem value="credit-card">Credit Card</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex items-start space-x-2 pt-2">
                    <Checkbox 
                      id="recurringInvestment" 
                      checked={watch("recurringInvestment")}
                      onCheckedChange={(checked) => {
                        form.setValue("recurringInvestment", checked === true);
                      }}
                    />
                    <div>
                      <Label htmlFor="recurringInvestment" className="text-sm font-medium">
                        Set up recurring investment
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically invest the same amount on a monthly basis
                      </p>
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    <div className="p-4 border rounded-md bg-gray-50">
                      <h4 className="font-medium mb-2">Investment Summary</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Property:</span>
                          <span>{propertyName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount:</span>
                          <span>${watch("investmentAmount")?.toLocaleString() || minInvestment.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fees:</span>
                          <span>$0</span>
                        </div>
                        <div className="border-t pt-1 mt-1">
                          <div className="flex justify-between font-medium">
                            <span>Total:</span>
                            <span>${watch("investmentAmount")?.toLocaleString() || minInvestment.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-2 pt-4">
                    <Checkbox 
                      id="agreeToTerms" 
                      checked={watch("agreeToTerms")}
                      onCheckedChange={(checked) => {
                        form.setValue("agreeToTerms", checked === true);
                      }}
                      className={errors.agreeToTerms ? "border-red-500 data-[state=checked]:bg-red-500" : ""}
                    />
                    <div>
                      <Label htmlFor="agreeToTerms" className={`text-sm font-medium ${errors.agreeToTerms ? "text-red-500" : ""}`}>
                        I agree to the terms and conditions
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        By checking this box, I acknowledge that I have read and agree to the 
                        <a href="#" className="text-primary ml-1">Investment Agreement</a> and 
                        <a href="#" className="text-primary ml-1">Privacy Policy</a>.
                      </p>
                      {errors.agreeToTerms && (
                        <p className="text-xs text-red-500 mt-1">{errors.agreeToTerms.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex justify-between pt-4">
                {currentStep !== 'personal' ? (
                  <Button type="button" variant="outline" onClick={goToPreviousStep}>
                    Back
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                )}
                
                {currentStep !== 'investment' ? (
                  <Button type="button" onClick={goToNextStep}>
                    Continue
                  </Button>
                ) : (
                  <Button type="submit">
                    Submit Intent
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  );
};
