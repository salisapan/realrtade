
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
import { AlertCircle, Check, CreditCard, DollarSign, Landmark, LayoutList } from "lucide-react";
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
  paymentMethod: z.enum(["bank", "wire", "credit", "other"], {
    required_error: "Please select a payment method",
  }),
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      investmentAmount: minInvestment,
      paymentMethod: "bank",
      additionalInfo: "",
      termsAccepted: false,
    },
  });

  const onSubmit = (data: FormValues) => {
    console.log("Form data:", data);
    
    // Show success message
    toast({
      title: "Letter of Intent Submitted",
      description: `Your investment intent of $${data.investmentAmount.toLocaleString()} has been received.`,
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
      additionalInfo: data.additionalInfo,
      status: "pending",
      date: new Date().toISOString()
    });
    localStorage.setItem("letterOfIntents", JSON.stringify(lois));
    
    // Show confirmation screen
    setLoiSubmitted(true);
    setShowConfirmation(true);
  };

  const handleContinue = () => {
    setIsOpen(false);
    navigate("/dashboard?tab=investments");
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button className="w-full">Invest Now</Button>
        </DialogTrigger>
        
        <DialogContent className="sm:max-w-md">
          {!showConfirmation ? (
            <>
              <DialogHeader>
                <DialogTitle>Letter of Intent</DialogTitle>
                <DialogDescription>
                  Express your interest in investing in {propertyName}
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
                          Minimum investment: ${minInvestment}
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
                                <Landmark className="mr-2 h-4 w-4" />
                                Wire Transfer
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-md p-2">
                              <RadioGroupItem value="credit" id="credit" />
                              <Label htmlFor="credit" className="flex items-center">
                                <CreditCard className="mr-2 h-4 w-4" />
                                Credit Card
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-md p-2">
                              <RadioGroupItem value="other" id="other" />
                              <Label htmlFor="other" className="flex items-center">
                                <LayoutList className="mr-2 h-4 w-4" />
                                Other
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
                      <p className="font-medium mb-1">Important Notice</p>
                      <p>This Letter of Intent is non-binding and does not guarantee participation in this investment opportunity. Our team will review your intent and contact you with next steps.</p>
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
                    <Button type="submit">Submit Intent</Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <DialogTitle className="mb-2">Investment Intent Submitted!</DialogTitle>
              <DialogDescription className="mb-6">
                <p className="mb-4">
                  Your Letter of Intent has been received. Our team will review your submission and contact you shortly with next steps.
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
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Status</span>
                    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Pending Review</Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  You can view and manage your investment intents in your dashboard.
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
