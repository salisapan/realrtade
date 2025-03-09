
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PropertyDataErrorProps {
  error: string;
  onRetry: () => void;
}

export const PropertyDataError = ({ error, onRetry }: PropertyDataErrorProps) => {
  return (
    <div className="py-4 text-center">
      <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
      <p className="text-sm text-red-600 mb-4">{error}</p>
      <Button onClick={onRetry} variant="outline" size="sm">
        Try Again
      </Button>
    </div>
  );
};
