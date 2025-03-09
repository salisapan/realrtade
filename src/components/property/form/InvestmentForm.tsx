
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UseFormReturn } from "react-hook-form";
import { InvestmentAmountInput } from "./InvestmentAmountInput";
import { PaymentMethodOptions } from "./PaymentMethodOptions";
import { EmailInput } from "./EmailInput";
import { AdditionalInfoInput } from "./AdditionalInfoInput";
import { SecureTransactionInfo } from "./SecureTransactionInfo";
import { TermsAgreement } from "./TermsAgreement";
import { FormValues } from "../types/letterOfIntentTypes";

interface InvestmentFormProps {
  form: UseFormReturn<FormValues>;
  propertyName: string;
  minInvestment: number;
  onSubmit: (data: FormValues) => void;
  onCancel: () => void;
}

export const InvestmentForm = ({
  form,
  propertyName,
  minInvestment,
  onSubmit,
  onCancel,
}: InvestmentFormProps) => {
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
          <PaymentMethodOptions form={form} />
          <EmailInput form={form} />
          <AdditionalInfoInput form={form} />
          <SecureTransactionInfo />
          <TermsAgreement form={form} />
          
          <DialogFooter className="sm:justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit">Complete Investment</Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
