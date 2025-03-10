
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../types/letterOfIntentTypes";

interface AdditionalInfoInputProps {
  form: UseFormReturn<FormValues>;
}

export const AdditionalInfoInput = ({ form }: AdditionalInfoInputProps) => {
  return (
    <FormField
      control={form.control}
      name="additionalInfo"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Additional Information (Optional)</FormLabel>
          <FormControl>
            <Textarea
              placeholder="Any specific questions or requirements..."
              className="resize-none"
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
