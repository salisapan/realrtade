
import { Button } from "@/components/ui/button";
import { Check, Mail } from "lucide-react";
import { PaymentMethodType, PAYMENT_METHOD_LABELS } from "../types/letterOfIntentTypes";

interface InvestmentConfirmationProps {
  propertyName: string;
  investmentAmount: number;
  paymentMethod: PaymentMethodType;
  emailSent: boolean;
  onContinue: () => void;
}

export const InvestmentConfirmation = ({
  propertyName,
  investmentAmount,
  paymentMethod,
  emailSent,
  onContinue,
}: InvestmentConfirmationProps) => {
  return (
    <div className="py-6 text-center">
      <div className="flex justify-center mb-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600" />
        </div>
      </div>
      
      <h2 className="text-xl font-bold mb-1">Investment Complete!</h2>
      <p className="text-gray-600 mb-6">
        Your investment intent for {propertyName} has been submitted
      </p>
      
      <div className="border rounded-md p-4 bg-gray-50 mb-6">
        <div className="flex justify-between mb-2">
          <span className="text-gray-600">Amount:</span>
          <span className="font-bold">${investmentAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span className="text-gray-600">Payment Method:</span>
          <span className="font-medium">{PAYMENT_METHOD_LABELS[paymentMethod]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Status:</span>
          <span className="text-green-600 font-medium">Complete</span>
        </div>
      </div>
      
      {emailSent && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-6">
          <Mail className="h-4 w-4" />
          <span>Confirmation email has been sent</span>
        </div>
      )}
      
      <Button onClick={onContinue} className="w-full">
        Continue to Dashboard
      </Button>
    </div>
  );
};
