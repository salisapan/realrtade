
import { Shield, Lock, CreditCard } from "lucide-react";

export const SecureTransactionInfo = () => {
  return (
    <div className="rounded-md bg-gray-50 p-3 space-y-2">
      <div className="flex items-center">
        <Shield className="h-4 w-4 text-primary mr-2" />
        <h3 className="text-sm font-medium">Secure Transaction</h3>
      </div>
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex items-center">
          <Lock className="h-3 w-3 text-gray-500 mr-1.5" />
          <span>Your information is encrypted and securely stored</span>
        </div>
        <div className="flex items-center">
          <CreditCard className="h-3 w-3 text-gray-500 mr-1.5" />
          <span>We comply with financial regulations and standards</span>
        </div>
      </div>
    </div>
  );
};
