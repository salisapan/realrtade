
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Mail } from "lucide-react";
import { DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";

interface InvestmentConfirmationProps {
  propertyName: string;
  investmentAmount: number;
  paymentMethod: string;
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
  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "bank": return "Bank Transfer";
      case "wire": return "Wire Transfer";
      case "credit": return "Credit Card";
      case "blockchain": return "Blockchain Transfer";
      default: return method;
    }
  };

  return (
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
            <span className="text-sm font-medium">${investmentAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-sm text-gray-500">Payment Method</span>
            <span className="text-sm font-medium">
              {getPaymentMethodLabel(paymentMethod)}
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
        <Button onClick={onContinue}>
          Go to Dashboard
        </Button>
      </DialogFooter>
    </div>
  );
};
