
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { UseFormReturn } from "react-hook-form";
import { InvestmentFormValues } from "../types/letterOfIntentTypes";

interface AdditionalInfoInputProps {
  form: UseFormReturn<InvestmentFormValues>;
}

export const AdditionalInfoInput = ({ form }: AdditionalInfoInputProps) => {
  // This is an unused component currently, but we're fixing it for future use
  // We'll need to update the schema to include additionalInfo when using this
  
  // Since the current schema doesn't include additionalInfo, this component 
  // is provided as a reference for future extension of the form
  
  return (
    <div className="mt-4">
      <FormLabel>Additional Information (Optional)</FormLabel>
      <Textarea
        placeholder="Any specific questions or requirements..."
        className="resize-none mt-1"
      />
      <p className="text-sm text-gray-500 mt-1">
        You can add any additional information or requests here.
      </p>
    </div>
  );
};
