import { z } from "zod";
export const aiGradingSummarySchema = z
  .object({
    weaknesses: z.array(z.string().min(1).max(700)).min(1).max(5),
    reviewNextLesson: z.array(z.string().min(1).max(700)).min(1).max(5),
    followUpActivity: z.string().min(1).max(1200),
  })
  .strict();
export type AiGradingSummary = z.infer<typeof aiGradingSummarySchema>;
