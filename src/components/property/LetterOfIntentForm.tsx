
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { InvestmentForm } from "./form/InvestmentForm";
import { InvestmentConfirmation } from "./confirmation/InvestmentConfirmation";
import { investmentFormSchema, InvestmentFormValues } from "./types/letterOfIntentTypes";

interface LetterOfIntentFormProps {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  minInvestment: number;
}

export const LetterOfIntentForm = ({
  propertyId,
  propertyName,
  propertyAddress,
  minInvestment,
}: LetterOfIntentFormProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formData, setFormData] = useState<InvestmentFormValues | null>(null);

  const form = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentFormSchema),
    defaultValues: {
      investmentAmount: minInvestment,
      fullName: "",
      email: "",
      termsAccepted: false,
    },
  });

  const onSubmit = (data: InvestmentFormValues) => {
    console.log("Form data:", data);
    setFormData(data);
    
    // Show success message
    toast({
      title: "Investment Submitted",
      description: `Your investment of $${data.investmentAmount.toLocaleString()} has been processed.`,
      variant: "success",
    });
    
    // Store in localStorage for persistence
    const investments = JSON.parse(localStorage.getItem("investments") || "[]");
    investments.push({
      id: Date.now(),
      propertyId,
      propertyName,
      propertyAddress,
      investmentAmount: data.investmentAmount,
      fullName: data.fullName,
      email: data.email,
      status: "completed",
      date: new Date().toISOString()
    });
    localStorage.setItem("investments", JSON.stringify(investments));
    
    // Show confirmation screen
    setShowConfirmation(true);
  };

  const handleContinue = () => {
    setIsOpen(false);
    navigate("/dashboard?tab=investments");
  };
  
  const handleInvestClick = () => {
    setIsOpen(true);
    // Reset form if it was previously submitted
    if (showConfirmation) {
      setShowConfirmation(false);
      form.reset({
        investmentAmount: minInvestment,
        fullName: "",
        email: "",
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
              propertyAddress={propertyAddress}
              minInvestment={minInvestment}
              onSubmit={onSubmit}
              onCancel={() => setIsOpen(false)}
            />
          ) : (
            <InvestmentConfirmation
              propertyName={propertyName}
              propertyAddress={propertyAddress}
              investmentAmount={formData?.investmentAmount || 0}
              onContinue={handleContinue}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
