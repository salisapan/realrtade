
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DollarSign } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { InvestmentFormValues } from "../types/letterOfIntentTypes";

interface InvestmentAmountInputProps {
  form: UseFormReturn<InvestmentFormValues>;
  minInvestment: number;
}

export const InvestmentAmountInput = ({ form, minInvestment }: InvestmentAmountInputProps) => {
  return (
    <FormField
      control={form.control}
      name="investmentAmount"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Investment Amount <span className="text-red-500">*</span></FormLabel>
          <FormControl>
            <div className="relative">
              <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="number"
                min={minInvestment}
                step="1"
                className="pl-8"
                {...field}
                onChange={(e) => {
                  // Parse value and ensure it's a valid number
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) {
                    field.onChange(value);
                  } else {
                    field.onChange(minInvestment);
                  }
                }}
                placeholder={`${minInvestment}`}
                required
              />
            </div>
          </FormControl>
          <FormDescription>
            Minimum investment: ${minInvestment.toLocaleString()}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
