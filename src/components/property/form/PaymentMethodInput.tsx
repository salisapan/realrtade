
import { useState } from "react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Wallet } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { InvestmentFormValues } from "../types/letterOfIntentTypes";

interface PaymentMethodInputProps {
  form: UseFormReturn<InvestmentFormValues>;
}

export const PaymentMethodInput = ({ form }: PaymentMethodInputProps) => {
  const [paymentMethod, setPaymentMethod] = useState("creditCard");

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard className="h-4 w-4 text-primary animate-pulse-slow" />
        <h3 className="text-sm font-medium">Payment Method <span className="text-red-500">*</span></h3>
      </div>

      <FormField
        control={form.control}
        name="paymentMethod"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormControl>
              <RadioGroup
                onValueChange={(value) => {
                  field.onChange(value);
                  setPaymentMethod(value);
                }}
                defaultValue="creditCard"
                className="flex flex-col space-y-3"
              >
                <div className="flex items-center space-x-2 border rounded-md p-3 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(66,133,244,0.15)] hover:border-primary/30">
                  <RadioGroupItem value="creditCard" id="creditCard" />
                  <Label htmlFor="creditCard" className="flex items-center gap-2 cursor-pointer">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span>Credit Card</span>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2 border rounded-md p-3 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(66,133,244,0.15)] hover:border-primary/30">
                  <RadioGroupItem value="wallet" id="wallet" />
                  <Label htmlFor="wallet" className="flex items-center gap-2 cursor-pointer">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span>Use Wallet Balance</span>
                  </Label>
                </div>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      
      {paymentMethod === "creditCard" && (
        <div className="space-y-3 border rounded-md p-3 animate-fade-in shadow-sm hover:shadow-md transition-all duration-300">
          <div>
            <Label htmlFor="cardNumber">Card Number <span className="text-red-500">*</span></Label>
            <Input 
              id="cardNumber" 
              type="text" 
              placeholder="1234 5678 9012 3456" 
              className="mt-1 focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="expiryDate">Expiry Date <span className="text-red-500">*</span></Label>
              <Input 
                id="expiryDate" 
                type="text" 
                placeholder="MM/YY" 
                className="mt-1 focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]" 
              />
            </div>
            <div>
              <Label htmlFor="cvc">CVC <span className="text-red-500">*</span></Label>
              <Input 
                id="cvc" 
                type="text" 
                placeholder="123" 
                className="mt-1 focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]" 
              />
            </div>
          </div>
        </div>
      )}
      
      {paymentMethod === "wallet" && (
        <div className="border rounded-md p-3 animate-fade-in bg-gradient-to-r from-blue-50 to-white shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-sm">Available Balance</span>
            <span className="font-medium text-primary">$25,000</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Funds will be withdrawn from your wallet balance.
          </p>
        </div>
      )}
    </div>
  );
};
