
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Bitcoin, CreditCard, Globe, Landmark } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../types/letterOfIntentTypes";

interface PaymentMethodOptionsProps {
  form: UseFormReturn<FormValues>;
}

export const PaymentMethodOptions = ({ form }: PaymentMethodOptionsProps) => {
  return (
    <FormField
      control={form.control}
      name="paymentMethod"
      render={({ field }) => (
        <FormItem className="space-y-3">
          <FormLabel>Payment Method</FormLabel>
          <FormControl>
            <RadioGroup
              onValueChange={field.onChange}
              defaultValue={field.value}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2 border rounded-md p-2">
                <RadioGroupItem value="bank" id="bank" />
                <Label htmlFor="bank" className="flex items-center">
                  <Landmark className="mr-2 h-4 w-4" />
                  Bank Transfer (ACH)
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-md p-2">
                <RadioGroupItem value="wire" id="wire" />
                <Label htmlFor="wire" className="flex items-center">
                  <Globe className="mr-2 h-4 w-4" />
                  International Wire Transfer
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-md p-2">
                <RadioGroupItem value="credit" id="credit" />
                <Label htmlFor="credit" className="flex items-center">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Secure Credit Card
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-md p-2">
                <RadioGroupItem value="blockchain" id="blockchain" />
                <Label htmlFor="blockchain" className="flex items-center">
                  <Bitcoin className="mr-2 h-4 w-4" />
                  Blockchain Transfer
                </Label>
              </div>
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
