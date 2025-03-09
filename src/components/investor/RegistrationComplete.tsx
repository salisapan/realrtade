
import { Loader2 } from "lucide-react";

interface RegistrationCompleteProps {
  isAccredited: boolean;
}

export const RegistrationComplete = ({ isAccredited }: RegistrationCompleteProps) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
      <div className="mb-4">
        <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Registration complete!</h2>
      <p className="text-gray-600 mb-4">
        {isAccredited 
          ? "Taking you to all investment opportunities..." 
          : "Taking you to verified deals with lower minimums..."}
      </p>
    </div>
  );
};
