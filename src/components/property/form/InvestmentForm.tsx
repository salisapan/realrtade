
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
      <DialogHeader>
        <DialogTitle>Invest in {propertyName}</DialogTitle>
        <DialogDescription>
          Complete your investment details below
        </DialogDescription>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
          
          <DialogFooter className="sm:justify-between pt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!formValid}
              className="font-medium"
            >
              Make Investment - {propertyName}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
