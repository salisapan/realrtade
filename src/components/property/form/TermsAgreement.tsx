
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../types/letterOfIntentTypes";

interface TermsAgreementProps {
  form: UseFormReturn<FormValues>;
}

export const TermsAgreement = ({ form }: TermsAgreementProps) => {
  return (
    <FormField
      control={form.control}
      name="termsAccepted"
      render={({ field }) => (
        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
          <FormControl>
            <Checkbox
              checked={field.value}
              onCheckedChange={field.onChange}
              id="terms"
            />
          </FormControl>
          <div className="space-y-1 leading-none">
            <FormLabel htmlFor="terms" className="text-sm font-medium">
              Accept terms and conditions <span className="text-red-500">*</span>
            </FormLabel>
            <p className="text-xs text-gray-500">
              I agree to the terms of service and privacy policy. I understand this is not an offer or solicitation to buy securities.
            </p>
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
};
