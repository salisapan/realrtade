
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { investorFormSchema, InvestorFormValues } from "@/schemas/investorSchema";

interface InvestorFormProps {
  onSubmit: (values: InvestorFormValues) => void;
  isSubmitting: boolean;
}

export const InvestorForm = ({ onSubmit, isSubmitting }: InvestorFormProps) => {
  const form = useForm<InvestorFormValues>({
    resolver: zodResolver(investorFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      address: "",
      age: undefined,
      annualIncome: undefined,
      netWorth: undefined,
      investmentExperience: undefined,
      isAccredited: undefined
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter your full name" 
                    {...field} 
                    className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input 
                    type="email" 
                    placeholder="your.email@example.com" 
                    {...field} 
                    className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter your phone number" 
                    {...field} 
                    className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter your address" 
                    {...field} 
                    className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Age</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="18" 
                    placeholder="Enter your age"
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    value={field.value || ""}
                    className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="annualIncome"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Annual Income ($)</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="0" 
                    placeholder="Enter your annual income" 
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    value={field.value || ""}
                    className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="netWorth"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Net Worth ($)</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="0" 
                    placeholder="Enter your net worth" 
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    value={field.value || ""}
                    className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="investmentExperience"
            render={({ field }) => (
              <FormItem className="transition-all duration-300 hover:shadow-sm">
                <FormLabel>Investment Experience</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]">
                      <SelectValue placeholder="Select experience level" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="isAccredited"
          render={({ field }) => (
            <FormItem className="transition-all duration-300 hover:shadow-sm">
              <div className="flex items-center gap-2">
                <FormLabel>Are you an accredited investor?</FormLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-gray-400 hover:text-primary transition-colors duration-300" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-white/95 backdrop-blur-sm shadow-lg">
                      <p>Accredited investors earn over $200,000/year (or $300,000 with spouse) or have a net worth over $1M, excluding home. Non-accredited investors can still join with smaller deals.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="focus:shadow-[0_0_0_2px_rgba(66,133,244,0.2)]">
                    <SelectValue placeholder="Select yes or no" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                <div className="p-3 bg-gradient-to-r from-blue-50 to-white rounded-md mt-2 text-sm text-blue-600 shadow-sm">
                  <strong>Non-accredited investors:</strong> You'll have access to our verified deals with lower minimum investments, starting from as low as $10.
                </div>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button 
          type="submit" 
          className="w-full bg-gradient-to-r from-primary to-primary-light hover:shadow-[0_0_15px_rgba(66,133,244,0.5)] transition-all duration-300" 
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating Profile..." : "Complete Registration"}
        </Button>
      </form>
    </Form>
  );
};
