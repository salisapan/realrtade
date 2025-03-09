
import { z } from "zod";

export const investorFormSchema = z.object({
  fullName: z.string().min(3, {
    message: "Name must be at least 3 characters."
  }),
  email: z.string().email({
    message: "Please enter a valid email address."
  }),
  phone: z.string().min(10, {
    message: "Please enter a valid phone number."
  }),
  address: z.string().min(5, {
    message: "Please enter your full address."
  }),
  age: z.coerce.number().min(18, {
    message: "You must be at least 18 years old to invest."
  }),
  annualIncome: z.coerce.number().min(0, {
    message: "Please enter your annual income."
  }),
  netWorth: z.coerce.number().min(0, {
    message: "Please enter your net worth."
  }),
  investmentExperience: z.enum(["none", "beginner", "intermediate", "advanced"], {
    required_error: "Please select your investment experience level."
  }),
  isAccredited: z.enum(["yes", "no"], {
    required_error: "Please indicate whether you are an accredited investor."
  })
});

export type InvestorFormValues = z.infer<typeof investorFormSchema>;
