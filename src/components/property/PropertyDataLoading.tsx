
import { Loader2 } from "lucide-react";

interface PropertyDataLoadingProps {
  message?: string;
}

export const PropertyDataLoading = ({ message = "Fetching market data..." }: PropertyDataLoadingProps) => {
  return (
    <div className="py-8 flex flex-col items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
};
