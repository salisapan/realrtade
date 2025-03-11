
import React from "react";
import { Label } from "@/components/ui/label";
import { UseFormReturn } from "react-hook-form";
import { InvestmentFormValues } from "../types/letterOfIntentTypes";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wallet, CreditCard, Banknote } from "lucide-react";

interface PaymentMethodSelectionProps {
  form: UseFormReturn<InvestmentFormValues>;
}

export function PaymentMethodSelection({ form }: PaymentMethodSelectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Payment Method</h3>
      <div className="space-y-2">
        <RadioGroup
          defaultValue="credit-card"
          onValueChange={(value) => form.setValue("paymentMethod", value)}
          className="grid grid-cols-1 gap-4"
        >
          <div className="flex items-center justify-between space-x-2 rounded-md border p-3 hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <label htmlFor="credit-card" className="text-sm font-medium leading-none cursor-pointer">
                Credit / Debit Card
              </label>
            </div>
            <RadioGroupItem value="credit-card" id="credit-card" className="text-primary" />
          </div>
            
          <div className="flex items-center justify-between space-x-2 rounded-md border p-3 hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
            <div className="flex items-center space-x-2">
              <Wallet className="h-4 w-4 text-primary" />
              <label htmlFor="crypto" className="text-sm font-medium leading-none cursor-pointer">
                Cryptocurrency
              </label>
            </div>
            <RadioGroupItem value="crypto" id="crypto" className="text-primary" />
          </div>
              
          <div className="flex items-center justify-between space-x-2 rounded-md border p-3 hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
            <div className="flex items-center space-x-2">
              <Banknote className="h-4 w-4 text-primary" />
              <label htmlFor="bank" className="text-sm font-medium leading-none cursor-pointer">
                Bank Transfer
              </label>
            </div>
            <RadioGroupItem value="bank" id="bank" className="text-primary" />
          </div>
        </RadioGroup>
        
        <div className="text-xs text-gray-500">
          All payment methods are secure and encrypted. Additional payment options may be available during closing.
        </div>
      </div>
    </div>
  );
}
