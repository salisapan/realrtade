
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { UseFormReturn } from "react-hook-form";
import { InvestmentFormValues } from "../types/letterOfIntentTypes";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wallet, CreditCard, BanknoteIcon } from "lucide-react";

interface PaymentMethodSelectionProps {
  form: UseFormReturn<InvestmentFormValues>;
}

export const PaymentMethodSelection = ({ form }: PaymentMethodSelectionProps) => {
  return (
    <FormField
      control={form.control}
      name="paymentMethod"
      render={({ field }) => (
        <FormItem className="space-y-3">
          <FormLabel>Payment Method <span className="text-red-500">*</span></FormLabel>
          <FormControl>
            <RadioGroup
              onValueChange={field.onChange}
              defaultValue={field.value || "creditCard"}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center justify-between space-x-2 rounded-md border p-3 hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
                <div className="flex items-center space-x-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <label htmlFor="creditCard" className="text-sm font-medium leading-none cursor-pointer">
                    Credit/Debit Card
                  </label>
                </div>
                <RadioGroupItem value="creditCard" id="creditCard" className="text-primary" />
              </div>
              
              <div className="flex items-center justify-between space-x-2 rounded-md border p-3 hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
                <div className="flex items-center space-x-2">
                  <BanknoteIcon className="h-4 w-4 text-primary" />
                  <label htmlFor="bank" className="text-sm font-medium leading-none cursor-pointer">
                    Bank Transfer
                  </label>
                </div>
                <RadioGroupItem value="bank" id="bank" className="text-primary" />
              </div>
              
              <div className="flex items-center justify-between space-x-2 rounded-md border p-3 hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
                <div className="flex items-center space-x-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <label htmlFor="wallet" className="text-sm font-medium leading-none cursor-pointer">
                    Digital Wallet
                  </label>
                </div>
                <RadioGroupItem value="wallet" id="wallet" className="text-primary" />
              </div>
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
