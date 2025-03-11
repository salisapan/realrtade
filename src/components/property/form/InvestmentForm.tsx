
import { useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UseFormReturn } from "react-hook-form";
import { InvestmentAmountInput } from "./InvestmentAmountInput";
import { FullNameInput } from "./FullNameInput";
import { EmailInput } from "./EmailInput";
import { InvestmentContract } from "./InvestmentContract";
import { SecureTransactionInfo } from "./SecureTransactionInfo";
import { CreditCard, Wallet } from "lucide-react";
import { InvestmentFormValues } from "../types/letterOfIntentTypes";
import { PaymentMethodInput } from "./PaymentMethodInput";

interface InvestmentFormProps {
  form: UseFormReturn<InvestmentFormValues>;
  propertyName: string;
  propertyAddress: string;
  minInvestment: number;
  onSubmit: (data: InvestmentFormValues) => void;
  onCancel: () => void;
}

export const InvestmentForm = ({
  form,
  propertyName,
  propertyAddress,
  minInvestment,
  onSubmit,
  onCancel,
}: InvestmentFormProps) => {
  const [contractVisible, setContractVisible] = useState(false);

  const formValid = form.formState.isValid && form.watch("termsAccepted");

  return (
    <>
      <DialogHeader className="animate-fade-in">
        <div className="flex flex-col items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-full inline-flex items-center justify-center mb-2">
            <CreditCard className="h-6 w-6 text-primary animate-pulse-slow" />
          </div>
          <DialogTitle className="text-xl font-bold">Invest in {propertyName}</DialogTitle>
          <DialogDescription className="text-center">
            Complete your investment details below
          </DialogDescription>
        </div>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 animate-fade-in">
          <div className="space-y-5 p-2">
            <InvestmentAmountInput form={form} minInvestment={minInvestment} />
            <FullNameInput form={form} />
            <EmailInput form={form} />
            
            <PaymentMethodInput form={form} />
            
            <InvestmentContract 
              form={form} 
              projectAddress={propertyAddress}
              propertyName={propertyName}
              visible={contractVisible} 
              setVisible={setContractVisible} 
            />
            
            <SecureTransactionInfo />
          </div>
          
          <DialogFooter className="sm:justify-between pt-4 mt-6 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              className="hover:shadow-[0_0_10px_rgba(66,133,244,0.2)] transition-all duration-300"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!formValid}
              className="font-medium bg-gradient-to-r from-primary to-primary-light hover:shadow-[0_0_15px_rgba(66,133,244,0.3)] transition-all duration-300"
            >
              Make Investment - {propertyName}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
