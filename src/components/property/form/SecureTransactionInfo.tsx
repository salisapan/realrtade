
import { AlertCircle } from "lucide-react";

export const SecureTransactionInfo = () => {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-md p-3 flex items-start gap-2">
      <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-blue-600">
        <p className="font-medium mb-1">Secure Transaction</p>
        <p>Your investment will be processed securely. You will receive confirmation by email once completed.</p>
      </div>
    </div>
  );
};
