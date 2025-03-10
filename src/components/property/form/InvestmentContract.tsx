
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Check, FileText } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { InvestmentFormValues } from "../types/letterOfIntentTypes";

interface InvestmentContractProps {
  form: UseFormReturn<InvestmentFormValues>;
  projectAddress: string;
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export const InvestmentContract = ({ 
  form, 
  projectAddress, 
  visible, 
  setVisible 
}: InvestmentContractProps) => {
  const investmentAmount = form.watch("investmentAmount");

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Investment Contract</h3>
        </div>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={() => setVisible(!visible)}
          className="h-7 text-xs"
        >
          {visible ? "Hide Contract" : "View Contract"}
        </Button>
      </div>
      
      {visible && (
        <div className="p-3 border rounded-md bg-gray-50 text-xs space-y-2 max-h-48 overflow-y-auto">
          <h4 className="font-semibold">Investment Contract for {projectAddress}</h4>
          <p>
            By investing ${investmentAmount?.toLocaleString() || 0} in this project, you agree to the following terms:
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Funds will be held in REALTRADE's escrow Nostro account until the investment is registered with the LLC.</li>
            <li>Upon registration, funds will be transferred to the developer.</li>
            <li>Returns are subject to project performance as outlined in the transaction details.</li>
            <li>REALTRADE is not liable for losses beyond the agreed terms.</li>
          </ol>
          <p className="font-medium">
            I acknowledge that I have read and agree to these terms.
          </p>
        </div>
      )}
      
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
              <label htmlFor="terms" className="text-sm font-medium flex items-center gap-1 cursor-pointer">
                I approve the investment contract <span className="text-red-500">*</span>
                {field.value && <Check className="h-3.5 w-3.5 text-green-500" />}
              </label>
              <p className="text-xs text-gray-500">
                By checking this box, I confirm that I have read and agree to the investment contract terms.
              </p>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />
    </div>
  );
};
