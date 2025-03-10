
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../types/letterOfIntentTypes";

interface EmailInputProps {
  form: UseFormReturn<FormValues>;
}

export const EmailInput = ({ form }: EmailInputProps) => {
  return (
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Email for Confirmation <span className="text-red-500">*</span></FormLabel>
          <FormControl>
            <div className="relative">
              <Mail className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="email"
                placeholder="your@email.com"
                className="pl-8"
                {...field}
                required
              />
            </div>
          </FormControl>
          <FormDescription>
            Confirmation and updates will be sent to this email
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
