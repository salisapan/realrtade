
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DollarSign } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../types/letterOfIntentTypes";

interface InvestmentAmountInputProps {
  form: UseFormReturn<FormValues>;
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
                className="pl-8"
                {...field}
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
