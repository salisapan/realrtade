
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface InvestmentConfirmationProps {
  propertyName: string;
  propertyAddress: string;
  investmentAmount: number;
  onContinue: () => void;
}

export const InvestmentConfirmation = ({
  propertyName,
  propertyAddress,
  investmentAmount,
  onContinue,
}: InvestmentConfirmationProps) => {
  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col items-center justify-center text-center space-y-3">
        <div className="bg-green-100 p-3 rounded-full">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Investment Successful!</h2>
      </div>
      
      <div className="bg-green-50 border border-green-200 rounded-md p-4 text-green-900">
        <p className="text-sm leading-relaxed">
          Thank you for your investment of ${investmentAmount.toLocaleString()} in {propertyAddress}!<br /><br />
          The amount has been securely transferred to REALTRADE's Nostro escrow account.<br /><br />
          Once the investment is registered with the LLC, the funds will be successfully transferred to the developer.
        </p>
      </div>
      
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          You can view your investment details in your dashboard.
        </p>
        <Button className="w-full" onClick={onContinue}>
          Continue to Dashboard
        </Button>
      </div>
    </div>
  );
};
