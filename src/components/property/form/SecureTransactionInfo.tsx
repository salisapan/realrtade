
import { AlertCircle, Shield, Lock } from "lucide-react";

export const SecureTransactionInfo = () => {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-md p-3 flex items-start gap-2">
      <Lock className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-blue-600">
        <p className="font-medium mb-1">Secure Transaction</p>
        <p className="mb-1">Your investment will be processed securely through our verified payment channels. All transactions are encrypted and protected.</p>
        <div className="flex items-center gap-2 mt-2">
          <Shield className="h-4 w-4 text-blue-500" />
          <span className="text-xs">Bank transfers, credit cards, and blockchain transactions are all secured by industry-standard protocols</span>
        </div>
      </div>
    </div>
  );
};
