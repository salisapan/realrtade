
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, CreditCard, DollarSign, Landmark, LayoutList, Bitcoin, Globe, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

const formSchema = z.object({
  investmentAmount: z.coerce
    .number()
    .min(1, "Please enter a valid investment amount"),
  paymentMethod: z.enum(["bank", "wire", "credit", "blockchain"], {
    required_error: "Please select a payment method",
  }),
  email: z.string().email("Please enter a valid email").optional(),
  additionalInfo: z.string().optional(),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface LetterOfIntentFormProps {
  propertyId: string;
  propertyName: string;
  minInvestment: number;
}

export const LetterOfIntentForm = ({
  propertyId,
  propertyName,
  minInvestment,
}: LetterOfIntentFormProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loiSubmitted, setLoiSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      investmentAmount: minInvestment,
      paymentMethod: "bank",
      email: "",
      additionalInfo: "",
      termsAccepted: false,
    },
  });

  const onSubmit = (data: FormValues) => {
    console.log("Form data:", data);
    
    // Show success message
    toast({
      title: "Investment Intent Submitted",
      description: `Your investment of $${data.investmentAmount.toLocaleString()} has been processed.`,
      variant: "success",
    });
    
    // Store in localStorage for persistence
    const lois = JSON.parse(localStorage.getItem("letterOfIntents") || "[]");
    lois.push({
      id: Date.now(),
      propertyId,
      propertyName,
      investmentAmount: data.investmentAmount,
      paymentMethod: data.paymentMethod,
      email: data.email,
      additionalInfo: data.additionalInfo,
      status: "completed",
      date: new Date().toISOString()
    });
    localStorage.setItem("letterOfIntents", JSON.stringify(lois));
    
    // Simulate sending an email
    setTimeout(() => {
      setEmailSent(true);
      toast({
        title: "Email Confirmation Sent",
        description: data.email ? `A confirmation has been sent to ${data.email}` : "A confirmation has been sent to your registered email",
        variant: "success",
      });
    }, 1500);
    
    // Show confirmation screen
    setLoiSubmitted(true);
    setShowConfirmation(true);
  };

  const handleContinue = () => {
    setIsOpen(false);
    navigate("/dashboard?tab=investments");
  };
  
  const handleInvestClick = () => {
    setIsOpen(true);
    // Reset form if it was previously submitted
    if (loiSubmitted) {
      setShowConfirmation(false);
      setLoiSubmitted(false);
      setEmailSent(false);
      form.reset({
        investmentAmount: minInvestment,
        paymentMethod: "bank",
        email: "",
        additionalInfo: "",
        termsAccepted: false,
      });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button className="w-full" onClick={handleInvestClick}>
            Invest Now
          </Button>
        </DialogTrigger>
        
        <DialogContent className="sm:max-w-md loi-form-container">
          {!showConfirmation ? (
            <>
              <DialogHeader>
                <DialogTitle>Invest in {propertyName}</DialogTitle>
                <DialogDescription>
                  Complete your investment details below
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="investmentAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investment Amount</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                            <Input
                              type="number"
                              min={minInvestment}
                              className="pl-8"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Minimum investment: ${minInvestment.toLocaleString()}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Payment Method</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="space-y-2"
                          >
                            <div className="flex items-center space-x-2 border rounded-md p-2">
                              <RadioGroupItem value="bank" id="bank" />
                              <Label htmlFor="bank" className="flex items-center">
                                <Landmark className="mr-2 h-4 w-4" />
                                Bank Transfer (ACH)
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-md p-2">
                              <RadioGroupItem value="wire" id="wire" />
                              <Label htmlFor="wire" className="flex items-center">
                                <Globe className="mr-2 h-4 w-4" />
                                International Wire Transfer
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-md p-2">
                              <RadioGroupItem value="credit" id="credit" />
                              <Label htmlFor="credit" className="flex items-center">
                                <CreditCard className="mr-2 h-4 w-4" />
                                Secure Credit Card
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-md p-2">
                              <RadioGroupItem value="blockchain" id="blockchain" />
                              <Label htmlFor="blockchain" className="flex items-center">
                                <Bitcoin className="mr-2 h-4 w-4" />
                                Blockchain Transfer
                              </Label>
                            </div>
                          </RadioGroup>
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
                        <FormLabel>Email for Confirmation</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                            <Input
                              type="email"
                              placeholder="your@email.com"
                              className="pl-8"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Leave empty to use your account email
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="additionalInfo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Information (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Any specific questions or requirements..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="bg-blue-50 border border-blue-100 rounded-md p-3 flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-600">
                      <p className="font-medium mb-1">Secure Transaction</p>
                      <p>Your investment will be processed securely. You will receive confirmation by email once completed.</p>
                    </div>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="termsAccepted"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            I accept the terms and conditions
                          </FormLabel>
                          <FormDescription>
                            By submitting this form, you agree to our{" "}
                            <a href="#" className="text-blue-600 hover:underline">
                              Terms of Service
                            </a>{" "}
                            and{" "}
                            <a href="#" className="text-blue-600 hover:underline">
                              Privacy Policy
                            </a>
                            .
                          </FormDescription>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                  
                  <DialogFooter className="sm:justify-between">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Complete Investment</Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <DialogTitle className="mb-2">Investment Successful!</DialogTitle>
              <DialogDescription className="mb-6">
                <p className="mb-4">
                  Your investment has been processed successfully. Details have been sent to your email.
                </p>
                <div className="bg-gray-50 p-4 rounded-md mb-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-500">Property</span>
                    <span className="text-sm font-medium">{propertyName}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-500">Amount</span>
                    <span className="text-sm font-medium">${form.getValues().investmentAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-500">Payment Method</span>
                    <span className="text-sm font-medium">
                      {form.getValues().paymentMethod === "bank" && "Bank Transfer"}
                      {form.getValues().paymentMethod === "wire" && "Wire Transfer"}
                      {form.getValues().paymentMethod === "credit" && "Credit Card"}
                      {form.getValues().paymentMethod === "blockchain" && "Blockchain Transfer"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Status</span>
                    <Badge variant="success" className="text-green-600">Completed</Badge>
                  </div>
                </div>
                {emailSent && (
                  <div className="flex items-center justify-center gap-2 text-sm text-green-600 mb-4">
                    <Mail className="h-4 w-4" />
                    <span>Confirmation email sent</span>
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  You can view and manage your investments in your dashboard.
                </p>
              </DialogDescription>
              <DialogFooter className="justify-center">
                <Button onClick={handleContinue}>
                  Go to Dashboard
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
