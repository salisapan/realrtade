
import { z } from "zod";

export const investmentFormSchema = z.object({
  investmentAmount: z.number().min(1, "Investment amount is required"),
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Invalid email address"),
  termsAccepted: z.boolean().refine(val => val === true, {
    message: "You must accept the terms",
  }),
  paymentMethod: z.string().optional().default("creditCard"),
});

export type InvestmentFormValues = z.infer<typeof investmentFormSchema>;
