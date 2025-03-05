import { z } from "zod";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle, Home, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { HomeHeader } from "@/components/layout/HomeHeader";
const formSchema = z.object({
  fullName: z.string().min(3, {
    message: "Name must be at least 3 characters."
  }),
  email: z.string().email({
    message: "Please enter a valid email address."
  }),
  phone: z.string().min(10, {
    message: "Please enter a valid phone number."
  }),
  address: z.string().min(5, {
    message: "Please enter your full address."
  }),
  age: z.coerce.number().min(18, {
    message: "You must be at least 18 years old to invest."
  }),
  // Removed minimum validation for financial fields
  annualIncome: z.coerce.number().min(0, {
    message: "Please enter your annual income."
  }),
  netWorth: z.coerce.number().min(0, {
    message: "Please enter your net worth."
  }),
  investmentExperience: z.enum(["none", "beginner", "intermediate", "advanced"], {
    required_error: "Please select your investment experience level."
  }),
  isAccredited: z.enum(["yes", "no"], {
    required_error: "Please indicate whether you are an accredited investor."
  })
});
type FormValues = z.infer<typeof formSchema>;
const InvestorSignup = () => {
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      address: "",
      age: undefined,
      annualIncome: undefined,
      netWorth: undefined,
      investmentExperience: undefined,
      isAccredited: undefined
    }
  });
  function onSubmit(values: FormValues) {
    setIsSubmitting(true);

    // Store investor information in localStorage for demo purposes
    localStorage.setItem("investorProfile", JSON.stringify(values));

    // Different message based on accreditation status, but allow everyone access
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

    // Redirect to properties page after a short delay for all users
    setTimeout(() => {
      navigate("/properties");
    }, 2000);
  }
  if (registrationComplete) {
    return <div className="min-h-screen bg-gray-50 flex flex-col">
        <HomeHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
            <div className="mb-4">
              <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Registration complete!</h2>
            <p className="text-gray-600 mb-4">Taking you to the app...</p>
          </div>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-gray-50">
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
              <CardTitle className="text-2xl">Investor Registration</CardTitle>
              <CardDescription>
                Complete your investor profile to access real estate opportunities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="fullName" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>} />
                    
                    <FormField control={form.control} name="email" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john.doe@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>} />
                    
                    <FormField control={form.control} name="phone" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="(555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>} />
                    
                    <FormField control={form.control} name="address" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Main St, City, State, Zip" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>} />
                    
                    <FormField control={form.control} name="age" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl>
                            <Input type="number" min="18" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>} />
                    
                    <FormField control={form.control} name="annualIncome" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Annual Income ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" placeholder="100000" className="Minimum 10" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>} />
                    
                    <FormField control={form.control} name="netWorth" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Net Worth ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" placeholder="500000" className="Minimum 100" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>} />
                    
                    <FormField control={form.control} name="investmentExperience" render={({
                    field
                  }) => <FormItem>
                          <FormLabel>Investment Experience</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select experience level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="beginner">Beginner</SelectItem>
                              <SelectItem value="intermediate">Intermediate</SelectItem>
                              <SelectItem value="advanced">Advanced</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>} />
                  </div>
                  
                  <FormField control={form.control} name="isAccredited" render={({
                  field
                }) => <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel>Are you an accredited investor?</FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-4 h-4 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>Accredited investors earn over $200,000/year (or $300,000 with spouse) or have a net worth over $1M, excluding home. Non-accredited investors can still join with smaller deals.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select yes or no" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Non-accredited investors will have access to verified deals with lower minimum investments.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>} />
                  
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Creating Profile..." : "Complete Registration"}
                  </Button>
                </form>
              </Form>
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
    </div>;
};
export default InvestorSignup;