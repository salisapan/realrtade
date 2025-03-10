
import { z } from "zod";

export const formSchema = z.object({
  investmentAmount: z.coerce
    .number()
    .min(1, "Please enter a valid investment amount"),
  paymentMethod: z.enum(["bank", "wire", "credit", "blockchain"], {
    required_error: "Please select a payment method",
  }),
  email: z.string().email("Please enter a valid email address"),
  additionalInfo: z.string().optional(),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

export type FormValues = z.infer<typeof formSchema>;

export type PaymentMethodType = "bank" | "wire" | "credit" | "blockchain";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  bank: "Bank Transfer",
  wire: "Wire Transfer",
  credit: "Credit Card",
  blockchain: "Blockchain Transfer"
};

export const PAYMENT_METHOD_DESCRIPTIONS: Record<PaymentMethodType, string> = {
  bank: "Direct transfer from your bank account",
  wire: "International wire transfer",
  credit: "Secure credit card payment",
  blockchain: "Transfer via cryptocurrency"
};

// New schema for the improved investment form
export const investmentFormSchema = z.object({
  investmentAmount: z.coerce
    .number()
    .min(100, "Investment must be at least $100")
    .int("Amount must be a whole number"),
  fullName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .regex(/^[a-zA-Z\s]+$/, "Name can only contain letters and spaces"),
  email: z
    .string()
    .email("Please enter a valid email address"),
  termsAccepted: z
    .boolean()
    .refine((val) => val === true, {
      message: "You must accept the investment contract",
    }),
});

export type InvestmentFormValues = z.infer<typeof investmentFormSchema>;
