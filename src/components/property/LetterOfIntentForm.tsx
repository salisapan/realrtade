
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { InvestmentForm } from "./form/InvestmentForm";
import { InvestmentConfirmation } from "./confirmation/InvestmentConfirmation";
import { formSchema, FormValues } from "./types/letterOfIntentTypes";

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
            <InvestmentForm 
              form={form}
              propertyName={propertyName}
              minInvestment={minInvestment}
              onSubmit={onSubmit}
              onCancel={() => setIsOpen(false)}
            />
          ) : (
            <InvestmentConfirmation
              propertyName={propertyName}
              investmentAmount={form.getValues().investmentAmount}
              paymentMethod={form.getValues().paymentMethod}
              emailSent={emailSent}
              onContinue={handleContinue}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
