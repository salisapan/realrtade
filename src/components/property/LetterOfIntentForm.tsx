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
import { createInvestment } from "@/services/investmentService";
import { supabase } from "@/integrations/supabase/client";

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
      paymentMethod: "creditCard",
    },
  });

  const onSubmit = async (data: InvestmentFormValues) => {
    console.log("Form data:", data);
    setFormData(data);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "Please sign in or register to make an investment.",
          variant: "destructive",
        });
        
        sessionStorage.setItem("investmentIntent", JSON.stringify({
          propertyId,
          propertyName,
          propertyAddress,
          investmentAmount: data.investmentAmount,
          paymentMethod: data.paymentMethod,
        }));
        
        navigate("/investor-signup");
        return;
      }
      
      const result = await createInvestment(
        session.user.id,
        propertyId,
        data
      );
      
      if (!result) {
        throw new Error("Failed to create investment");
      }
      
      toast({
        title: "Investment Submitted",
        description: `Your investment of $${data.investmentAmount.toLocaleString()} has been processed.`,
        variant: "success",
      });
      
      const investments = JSON.parse(localStorage.getItem("investments") || "[]");
      investments.push({
        id: result.id,
        propertyId,
        propertyName,
        propertyAddress,
        investmentAmount: data.investmentAmount,
        fullName: data.fullName,
        email: data.email,
        paymentMethod: data.paymentMethod,
        status: "completed",
        date: new Date().toISOString()
      });
      localStorage.setItem("investments", JSON.stringify(investments));
      
      setShowConfirmation(true);
    } catch (error) {
      console.error("Error submitting investment:", error);
      toast({
        title: "Investment Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const handleContinue = () => {
    setIsOpen(false);
    navigate("/dashboard?tab=investments");
  };
  
  const handleInvestClick = () => {
    setIsOpen(true);
    if (showConfirmation) {
      setShowConfirmation(false);
      form.reset({
        investmentAmount: minInvestment,
        fullName: "",
        email: "",
        termsAccepted: false,
        paymentMethod: "creditCard",
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
