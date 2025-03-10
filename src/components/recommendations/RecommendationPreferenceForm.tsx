
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Form, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormDescription 
} from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Brain, AlertTriangle, Clock, Building2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { UserPreferences } from "./types";

const assetTypeOptions = [
  { id: "residential", label: "Residential" },
  { id: "commercial", label: "Commercial" },
  { id: "industrial", label: "Industrial" },
  { id: "retail", label: "Retail" },
  { id: "office", label: "Office Space" },
  { id: "land", label: "Land Development" },
  { id: "green", label: "Green Real Estate" },
];

const formSchema = z.object({
  riskTolerance: z.enum(['low', 'medium', 'high'], {
    required_error: "Please select your risk tolerance",
  }),
  investmentHorizon: z.enum(['1-2', '3-5', '5+'], {
    required_error: "Please select your investment horizon",
  }),
  assetTypes: z.array(z.string()).refine((value) => value.length > 0, {
    message: "Please select at least one asset type",
  }),
});

type PreferenceFormValues = z.infer<typeof formSchema>;

interface RecommendationPreferenceFormProps {
  initialPreferences: UserPreferences | null;
  onSubmit: (preferences: UserPreferences) => void;
}

export const RecommendationPreferenceForm: React.FC<RecommendationPreferenceFormProps> = ({
  initialPreferences,
  onSubmit,
}) => {
  const form = useForm<PreferenceFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialPreferences || {
      riskTolerance: 'medium',
      investmentHorizon: '3-5',
      assetTypes: ['residential', 'commercial'],
    },
  });

  const handleSubmit = (values: PreferenceFormValues) => {
    // Ensure all required fields are present
    const preferences: UserPreferences = {
      riskTolerance: values.riskTolerance,
      investmentHorizon: values.investmentHorizon,
      assetTypes: values.assetTypes,
    };
    
    onSubmit(preferences);
  };

  return (
    <Card className="shadow-sm border-blue-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="absolute w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 to-transparent opacity-50 pointer-events-none"></div>
      <CardHeader className="relative">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-full">
            <Brain className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle>Your Investment Preferences</CardTitle>
            <CardDescription>
              Tell RealAI what you're looking for to get tailored recommendations
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="riskTolerance"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-blue-600" />
                    <FormLabel>Risk Tolerance</FormLabel>
                  </div>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select your risk tolerance" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="low">Low - Safety First</SelectItem>
                        <SelectItem value="medium">Medium - Balanced Approach</SelectItem>
                        <SelectItem value="high">High - Maximum Growth Potential</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>
                    How much risk are you ready to take? Low means safer bets!
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="investmentHorizon"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <FormLabel>Investment Horizon</FormLabel>
                  </div>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select your investment horizon" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="1-2">1-2 Years (Short Term)</SelectItem>
                        <SelectItem value="3-5">3-5 Years (Medium Term)</SelectItem>
                        <SelectItem value="5+">5+ Years (Long Term)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>
                    How long do you plan to keep your investment?
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assetTypes"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-blue-600" />
                      <FormLabel className="text-base">Asset Types</FormLabel>
                    </div>
                    <FormDescription>
                      Select the types of properties you're interested in
                    </FormDescription>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {assetTypeOptions.map((option) => (
                      <FormField
                        key={option.id}
                        control={form.control}
                        name="assetTypes"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={option.id}
                              className="flex items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    const newValue = checked
                                      ? [...field.value, option.id]
                                      : field.value?.filter(
                                          (value) => value !== option.id
                                        );
                                    field.onChange(newValue);
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full md:w-auto">
              <Brain className="mr-2 h-4 w-4" />
              Get Personalized Recommendations
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
